(function (root) {
  const minimumSigned = -(1n << 63n)
  const maximumUnsigned = (1n << 64n) - 1n

  function fieldNumber(value) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError("Invalid field number")
    return value
  }

  function message(field, ...parts) {
    const body = parts.join("")
    if (parts.some(part => typeof part !== "string" || (part && !part.startsWith("!")))) {
      throw new TypeError("Message parts must be encoded fields")
    }
    return `!${fieldNumber(field)}m${body.split("!").length - 1}${body}`
  }

  function base64url(text) {
    if (typeof text !== "string") throw new TypeError("Expected text")
    const bytes = new TextEncoder().encode(text)
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join("")
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  }

  function stringField(field, text) {
    return `!${fieldNumber(field)}z${base64url(text)}`
  }

  function unsigned64(value) {
    if (typeof value !== "bigint" && (typeof value !== "string" || !/^-?\d+$/.test(value))) {
      throw new TypeError("Feature IDs must be decimal strings or BigInt")
    }
    const integer = BigInt(value)
    if (integer < minimumSigned || integer > maximumUnsigned) throw new RangeError("Not a 64-bit ID")
    return BigInt.asUintN(64, integer).toString()
  }

  function featurePair(values) {
    if (!Array.isArray(values) || values.length !== 2) throw new TypeError("Expected two feature IDs")
    return values.map(unsigned64)
  }

  function coordinates(lat, lng) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError("Invalid latitude")
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new RangeError("Invalid longitude")
    return [lat, lng]
  }

  function itemIdentity(item) {
    const key = item?.[8]
    if (!Array.isArray(key) || key[0]?.[0] !== 1) throw new TypeError("Unsupported item reference")
    if (key[1] != null) return `feature:${featurePair(key[1]).join(":")}`
    if (!Array.isArray(key[2])) throw new TypeError("Missing coordinate item reference")
    return `coordinates:${JSON.stringify(coordinates(key[2][2], key[2][3]))}`
  }

  function listReference({ id, kind, flags = [] }) {
    if (typeof id !== "string" || !id || /[!\s]/.test(id)) throw new TypeError("Invalid list ID")
    if (![1, 2, 3, 5, 6].includes(kind)) throw new TypeError("Unverified ordinary-list kind")
    const capabilities = (flags ?? []).map(flag => {
      if (!Array.isArray(flag) || flag.length !== 1 || !Number.isInteger(flag[0]) || flag[0] < 0) {
        throw new TypeError("Unsupported list capability")
      }
      return message(3, `!1e${flag[0]}`)
    })
    return message(1, `!1s${id}!2e${kind}`, ...capabilities)
  }

  function itemKeyBody(point) {
    if (point.featureIds != null) {
      const [first, second] = featurePair(point.featureIds)
      return message(1, "!1e1") + message(2, `!1y${first}!2y${second}`)
    }
    const [lat, lng] = coordinates(point.lat, point.lng)
    return message(1, "!1e1") + message(3, `!3d${lat}!4d${lng}`)
  }

  function itemBody(point) {
    const [lat, lng] = coordinates(point.lat, point.lng)
    const location = [message(6, `!3d${lat}!4d${lng}`)]
    if (point.featureIds != null) {
      const [first, second] = featurePair(point.featureIds)
      location.push(message(7, `!1y${first}!2y${second}`))
    }
    return message(2, ...location) + stringField(3, point.name) + message(9, itemKeyBody(point))
  }

  function noteBody(point, note) {
    return message(2, message(1, itemKeyBody(point)), stringField(2, note))
  }

  function parseJSON(text) {
    if (typeof text !== "string") throw new TypeError("Expected a text response")
    if (text.startsWith(")]}'")) {
      const newline = text.indexOf("\n")
      if (newline < 0) throw new SyntaxError("Missing anti-XSSI newline")
      text = text.slice(newline + 1)
    }
    return JSON.parse(text)
  }

  function parseSearchResponse(text) {
    if (typeof text !== "string") throw new TypeError("Expected a text response")
    const envelopes = []
    let index = 0
    while (index < text.length) {
      if (/\s/.test(text[index])) {
        index++
        continue
      }
      if (text.startsWith("/*", index)) {
        const end = text.indexOf("*/", index + 2)
        if (end < 0) throw new SyntaxError("Truncated search separator")
        index = end + 2
        continue
      }
      if (text[index] !== "{") throw new SyntaxError("Unexpected search response content")
      const start = index
      let depth = 0
      let quoted = false
      let escaped = false
      do {
        const character = text[index++]
        if (quoted) {
          if (escaped) escaped = false
          else if (character === "\\") escaped = true
          else if (character === '"') quoted = false
        } else if (character === '"') quoted = true
        else if (character === "{") depth++
        else if (character === "}") depth--
      } while (index < text.length && depth > 0)
      if (depth || quoted) throw new SyntaxError("Truncated search envelope")
      envelopes.push(JSON.parse(text.slice(start, index)))
    }
    const payloads = envelopes.filter(frame => typeof frame.d === "string").map(frame => parseJSON(frame.d))
    if (!payloads.length) throw new SyntaxError("No search data payload")
    return { envelopes, payloads }
  }

  const protocol = Object.freeze({
    message,
    base64url,
    stringField,
    unsigned64,
    featurePair,
    itemIdentity,
    listReference,
    itemKeyBody,
    itemBody,
    noteBody,
    parseJSON,
    parseSearchResponse,
  })

  if (typeof module === "object" && module.exports) module.exports = protocol
  else root.googleMapsSavedPlacesProtocol = protocol
})(globalThis)
