(function (root) {
  const decoder = new TextDecoder("utf-8", { fatal: true })

  function bytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    throw new TypeError("Expected an ArrayBuffer or byte view")
  }

  function fields(input) {
    const data = bytes(input)
    const result = []
    let position = 0

    function varint() {
      let value = 0n
      for (let index = 0; index < 10; index++) {
        if (position >= data.length) throw new SyntaxError("Truncated protobuf varint")
        const byte = data[position++]
        if (index === 9 && byte > 1) throw new SyntaxError("Protobuf varint exceeds 64 bits")
        value |= BigInt(byte & 127) << BigInt(index * 7)
        if (byte < 128) return value
      }
      throw new SyntaxError("Invalid protobuf varint")
    }

    while (position < data.length) {
      const tag = varint()
      const number = Number(tag >> 3n)
      const wire = Number(tag & 7n)
      if (number < 1 || number > 536870911) throw new SyntaxError("Invalid protobuf field number")
      let value
      if (wire === 0) value = varint()
      else if ([1, 2, 5].includes(wire)) {
        const length = wire === 2 ? varint() : BigInt(wire === 1 ? 8 : 4)
        if (length > BigInt(data.length - position)) throw new SyntaxError("Truncated protobuf field")
        value = data.slice(position, position + Number(length))
        position += Number(length)
      } else throw new SyntaxError("Unsupported protobuf wire type")
      result.push({ number, wire, value })
    }
    return result
  }

  function varint(value) {
    value = BigInt(value)
    const result = []
    do {
      let byte = Number(value & 127n)
      value >>= 7n
      if (value) byte |= 128
      result.push(byte)
    } while (value)
    return Uint8Array.from(result)
  }

  function encode(items) {
    const chunks = []
    for (const item of items) {
      chunks.push(varint(BigInt(item.number) * 8n + BigInt(item.wire)))
      if (item.wire === 0) chunks.push(varint(item.value))
      else {
        if (item.wire === 2) chunks.push(varint(item.value.length))
        chunks.push(item.value)
      }
    }
    const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }

  function message(items, number) {
    const item = items.find(item => item.number === number && item.wire === 2)
    return item ? fields(item.value) : []
  }

  function text(items, number) {
    const item = items.find(item => item.number === number && item.wire === 2)
    return item ? decoder.decode(item.value) : null
  }

  function required(items, number, wire) {
    const item = items.find(item => item.number === number && item.wire === wire)
    if (!item) throw new SyntaxError(`Missing protobuf field ${number}`)
    return item.value
  }

  function base64url(data) {
    return btoa(Array.from(data, byte => String.fromCharCode(byte)).join(""))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  }

  function request(url) {
    const parsed = new URL(url)
    if (parsed.origin !== "https://www.google.com" || parsed.pathname !== "/maps/vt/proto") {
      throw new TypeError("Expected a /maps/vt/proto URL")
    }
    const payload = parsed.searchParams.get("bpb")
    if (!payload) throw new TypeError("Missing bpb query parameter")
    const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    return { url: parsed, items: fields(Uint8Array.from(binary, character => character.charCodeAt(0))) }
  }

  function layerNames(items) {
    return items.filter(item => item.number === 2 && item.wire === 2).map(item => text(fields(item.value), 2))
  }

  function layers(url) {
    return layerNames(request(url).items)
  }

  function validateTile(tile) {
    if (!Array.isArray(tile) || tile.length !== 3 || !tile.every(Number.isInteger)) {
      throw new TypeError("Expected a [zoom, x, y] tile key")
    }
    const [zoom, x, y] = tile
    if (zoom < 0 || zoom > 30 || x < 0 || y < 0 || x >= 2 ** zoom || y >= 2 ** zoom) {
      throw new RangeError("Invalid map tile coordinates")
    }
    return tile
  }

  function tileKey(items) {
    return validateTile([1, 2, 3].map(number => Number(required(items, number, 0))))
  }

  function withTiles(url, tiles) {
    if (!Array.isArray(tiles) || !tiles.length) throw new TypeError("Expected at least one tile")
    tiles.forEach(validateTile)
    const parsed = request(url)
    const sources = layerNames(parsed.items)
    if (sources.length !== 1 || sources[0] !== "psm") throw new TypeError("Template must request only the psm layer")
    const template = message(parsed.items, 1)
    const key = message(template, 1)
    tileKey(key)
    const replacements = tiles.map(tile => {
      const updatedKey = encode(key.map(item => item.wire === 0 && [1, 2, 3].includes(item.number)
        ? { ...item, value: BigInt(tile[item.number - 1]) } : item))
      const value = encode(template.map(item => item.number === 1 && item.wire === 2
        ? { ...item, value: updatedKey } : item))
      return { number: 1, wire: 2, value }
    })
    let inserted = false
    const items = parsed.items.flatMap(item => {
      if (item.number !== 1 || item.wire !== 2) return [item]
      if (inserted) return []
      inserted = true
      return replacements
    })
    parsed.url.searchParams.set("bpb", base64url(encode(items)))
    return parsed.url.toString()
  }

  const sessionField = 27

  function templateFrom(urls) {
    const found = urls.map(url => {
      try { return request(url) } catch { return null }
    }).find(parsed => parsed && layerNames(parsed.items).join() === "psm")
    if (!found) throw new Error("No psm-only /maps/vt/proto request among the captured URLs")
    let tileSeen = false
    const items = found.items.filter(item => {
      if (item.number === sessionField) return false
      if (item.number !== 1 || item.wire !== 2) return true
      if (tileSeen) return false
      tileSeen = true
      return true
    })
    const url = new URL("https://www.google.com/maps/vt/proto?authuser=0")
    url.searchParams.set("bpb", base64url(encode(items)))
    return url.toString()
  }

  function featureId(metadata) {
    const id = text(message(message(metadata, 20), 1), 1)
    if (id && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(id)) {
      return id.split(":").map(part => `0x${BigInt(part).toString(16)}`).join(":")
    }
    const pair = [3, 4].map(number => metadata.find(item => item.number === number && item.wire === 1))
    if (!pair.every(Boolean)) return null
    return pair.map(item => {
      let value = 0n
      for (let index = 7; index >= 0; index--) value = (value << 8n) | BigInt(item.value[index])
      return `0x${value.toString(16)}`
    }).join(":")
  }

  function marker(input) {
    const items = fields(input)
    const metadata = message(items, 53863091)
    const personal = message(items, 30096869)
    const savedTags = [...new Set(personal.filter(item => item.number === 2 && item.wire === 2)
      .flatMap(item => fields(item.value).filter(tag => tag.number === 1 && tag.wire === 0)
        .map(tag => tag.value.toString())))]
    return {
      featureId: featureId(metadata),
      name: text(message(personal, 1), 2) || text(metadata, 5),
      savedTags,
      starred: savedTags.includes("1"),
    }
  }

  function decodeResponse(input) {
    const envelopes = fields(input).filter(item => item.number === 1 && item.wire === 2)
    if (!envelopes.length) throw new SyntaxError("No tile envelopes in response")
    return envelopes.map(envelope => {
      const encoded = required(fields(envelope.value), 3, 2)
      const decoded = fields(encoded.map(byte => byte ^ 0x9b))
      return {
        tile: tileKey(message(decoded, 1)),
        markers: message(decoded, 10).filter(item => item.number === 1 && item.wire === 2)
          .map(item => marker(item.value)),
      }
    })
  }

  function mergeMarkers(markers) {
    const result = []
    const byId = new Map()
    for (const marker of markers) {
      const previous = marker.featureId ? byId.get(marker.featureId) : null
      if (previous) {
        previous.name ||= marker.name
        previous.savedTags = [...new Set([...previous.savedTags, ...marker.savedTags])]
        previous.starred = previous.savedTags.includes("1")
      } else {
        const copy = { ...marker, savedTags: [...marker.savedTags] }
        result.push(copy)
        if (copy.featureId) byId.set(copy.featureId, copy)
      }
    }
    return result
  }

  // psm request from Maps build 20261020, produced by templateFrom.
  const savedMarkersTemplate = "https://www.google.com/maps/vt/proto?authuser=0&bpb=" +
    "Cg0KCAgMENkaGIcNygEAEhgIAhIDcHNtIgcKAnNwEgExisjv3Q8CEAEaIhICcnUaAmRlKNEIYhIIRBIOCgNzZXQSB1JvYWRtYXCgAQEgATIv" +
    "CAwQAjAAOAFAAogBAeABBoACAbgCAcgCAdgCAegCAZADAeADAZoEBAgBEAHIBQGiAQYYATABeAG6AWbOxVPRxVOyrFS63agClbq2FumSuyLq" +
    "krsi7JK7Ir-IzCK99Pgs2J-CMO3zhTDOxVPRxVO63agC7p_vBLKsVKX-txaVurYW6ZK7IuqSuyLskrsivfT4LMCE3yLt84Uwo6mIML-IzCLg" +
    "AaEGgAIB"

  function regionTiles({ north, south, west, east }, zoom) {
    if (![north, south, west, east].every(Number.isFinite) || north < south) throw new RangeError("Invalid region")
    validateTile([zoom, 0, 0])
    const count = 2 ** zoom
    const clamp = value => Math.min(count - 1, Math.max(0, value))
    const x = lng => clamp(Math.floor((lng + 180) / 360 * count))
    const y = lat => {
      const limited = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180
      return clamp(Math.floor((1 - Math.asinh(Math.tan(limited)) / Math.PI) / 2 * count))
    }
    const columns = []
    const range = (from, to) => { for (let column = from; column <= to; column++) columns.push(column) }
    if (west <= east) range(x(west), x(east))
    else range(x(west), count - 1), range(0, x(east))
    const tiles = []
    for (const column of columns) for (let row = y(north); row <= y(south); row++) tiles.push([zoom, column, row])
    return tiles
  }

  async function savedMarkers(tiles, options = {}) {
    const fetcher = options.fetch ?? root.fetch.bind(root)
    const template = options.template ?? savedMarkersTemplate
    const markers = []
    const missing = []
    if (!options.params?.authuser) throw new TypeError("Pass { params: maps.params } to read the right account")
    for (let index = 0; index < tiles.length; index += 32) {
      const chunk = tiles.slice(index, index + 32)
      const url = new URL(withTiles(template, chunk))
      for (const [key, value] of Object.entries(options.params)) url.searchParams.set(key, value)
      const response = await fetcher(url.href, { credentials: "same-origin", cache: "no-store" })
      if (response.status === 410) {
        throw new Error("Tile read failed: HTTP 410, the template expired; capture a fresh one with templateFrom")
      }
      if (!response.ok) throw new Error(`Tile read failed: HTTP ${response.status}`)
      const decoded = decodeResponse(await response.arrayBuffer())
      const returned = new Set(decoded.map(tile => tile.tile.join("/")))
      missing.push(...chunk.filter(tile => !returned.has(tile.join("/"))))
      markers.push(...decoded.flatMap(tile => tile.markers))
    }
    return { markers: mergeMarkers(markers), missing }
  }

  // layers, withTiles, and decodeResponse are exported as test seams.
  const protocol = Object.freeze({
    savedMarkersTemplate, templateFrom, layers, withTiles, decodeResponse, mergeMarkers, regionTiles, savedMarkers,
  })
  if (typeof module === "object" && module.exports) module.exports = protocol
  else root.googleMapsSavedPlacesTiles = protocol
})(globalThis)
