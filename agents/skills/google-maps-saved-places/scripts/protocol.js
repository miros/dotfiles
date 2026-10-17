(function (root) {
  const minimumSigned = -(1n << 63n)
  const maximumUnsigned = (1n << 64n) - 1n

  function message(field, ...parts) {
    const body = parts.join("")
    return `!${field}m${body.split("!").length - 1}${body}`
  }

  function base64url(text) {
    if (typeof text !== "string") throw new TypeError("Expected text")
    const bytes = new TextEncoder().encode(text)
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join("")
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  }

  function stringField(field, text) {
    return `!${field}z${base64url(text)}`
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

  function latLng({ lat, lng }) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError("Invalid latitude")
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new RangeError("Invalid longitude")
    return `!3d${lat}!4d${lng}`
  }

  function featureFields(point) {
    const [first, second] = featurePair(point.featureIds)
    return `!1y${first}!2y${second}`
  }

  function listReference({ id, kind, flags }) {
    if (typeof id !== "string" || !id || /[!\s]/.test(id)) throw new TypeError("Invalid list ID")
    if (![1, 2, 3, 5, 6].includes(kind)) throw new TypeError("Unverified ordinary-list kind")
    const capabilities = (flags ?? []).map(flag => message(3, `!1e${flag[0]}`))
    return message(1, `!1s${id}!2e${kind}`, ...capabilities)
  }

  function itemKeyBody(point) {
    return message(1, "!1e1") +
      (point.featureIds != null ? message(2, featureFields(point)) : message(3, latLng(point)))
  }

  function itemBody(point) {
    const location = [message(6, latLng(point))]
    if (point.featureIds != null) location.push(message(7, featureFields(point)))
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

  function featureHex(values) {
    return featurePair(values).map(id => "0x" + BigInt(id).toString(16)).join(":")
  }

  function featureDecimal(hex) {
    const match = typeof hex === "string" && hex.match(/^(0x[0-9a-f]+):(0x[0-9a-f]+)$/i)
    if (!match) throw new TypeError("Expected a 0x...:0x... feature ID")
    return featurePair([BigInt(match[1]).toString(), BigInt(match[2]).toString()])
  }

  // Write tokens live in APP_OPTIONS[28]; indices verified on Maps build 20261013.
  const tokenIndex = { star: 2, deleteList: 25, removeItem: 26, createList: 27, addItem: 28, setNote: 30 }

  function pageSession(scripts) {
    const marker = "window.APP_OPTIONS="
    const text = scripts.find(value => value.includes(marker))
    if (!text) throw new Error("Maps page state not found; open a signed-in google.com/maps page")
    const start = text.indexOf(marker) + marker.length
    const end = text.indexOf(";window.APP_INITIALIZATION_STATE", start)
    if (end < 0) throw new Error("Unexpected Maps page state")
    const options = JSON.parse(text.slice(start, end))
    const session = text.match(/var kEI='([\w-]+)'/)?.[1]
    if (!session) throw new Error("Maps session ID not found")
    const search = new URL(options[3]?.[0] ?? "", "https://www.google.com").searchParams
    const params = {}
    for (const key of ["authuser", "hl", "gl"]) {
      if (!search.get(key)) throw new Error(`Maps ${key} parameter not found`)
      params[key] = search.get(key)
    }
    const tokens = {}
    for (const [name, index] of Object.entries(tokenIndex)) {
      const value = options[28]?.[index]
      if (typeof value !== "string" || !/^[\w-]+:\d+$/.test(value)) throw new Error(`Maps ${name} token not found`)
      tokens[name] = value
    }
    return { session, params, tokens }
  }

  function connect(options = {}) {
    const scripts = options.scripts ?? Array.from(root.document.scripts, script => script.textContent)
    const fetcher = options.fetch ?? root.fetch.bind(root)
    const { session, params, tokens } = pageSession(scripts)
    const context = `!1s${session}!7e81!28e2`
    const starContext = message(3, `!1s${session}`, "!7e81")

    async function get(path, pb) {
      const url = new URL(path, "https://www.google.com")
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
      url.searchParams.set("pb", pb)
      const response = await fetcher(url.href, { credentials: "same-origin", cache: "no-store" })
      if (!response.ok) throw new Error(`${path} failed: HTTP ${response.status}`)
      return parseJSON(await response.text())
    }

    async function lists() {
      const data = await get("/locationhistory/preview/mas", message(2, `!1s${session}`, "!7e81") +
        "!7m1!1i50!12m1!1i50!15m1!1i50!23m2!1i50!3b1!24m2!1i50!3b1!38m2!1i50!3b1")
      return (data?.[29]?.[3] ?? []).map(row => ({
        id: row[0][0], kind: row[0][1], flags: row[0][2] ?? null, name: row[4], count: row[12],
      }))
    }

    async function list(ref) {
      const data = await get("/maps/preview/entitylist/getlist",
        listReference(ref) + "!2e2!3e2!4i5000" + message(6, context) + "!8i3!16b1")
      const record = data?.[0]
      const items = record?.[8] ?? []
      if (record?.[0]?.[0] !== ref.id) throw new Error("Wrong list returned")
      if (data[1] || record[12] !== items.length) throw new Error("Incomplete list read; list has more than 5000 items")
      return {
        name: record[4],
        items: items.map(item => {
          const point = { name: item[2], lat: item[1][5][2], lng: item[1][5][3] }
          if (item[8][1] != null) point.featureIds = featurePair(item[8][1])
          return { note: item[3] || "", point }
        }),
      }
    }

    // Returns null for the stub records some saved places have instead of a
    // name and memberships.
    async function readPlace(hex) {
      const record = (await get("/maps/preview/place", "!1m1!1s" + hex))?.[6]
      if (!record?.[11]) return null
      const rows = record[25]?.[15] ?? []
      return {
        name: record[11],
        lat: record[9]?.[2],
        lng: record[9]?.[3],
        address: record[18] ?? null,
        countryCode: record[243] ?? record[183]?.[1]?.[6] ?? record[88]?.[2]?.[1] ?? null,
        featureIds: featureDecimal(hex),
        starred: rows.some(row => row[1] === "STARRED"),
        lists: rows.map(row => row[0]?.[0]?.[1]).filter(Boolean),
      }
    }

    async function place(target) {
      const hex = typeof target === "string" ? target : featureHex(target.featureIds)
      const state = await readPlace(hex)
      if (!state) throw new Error(`No place record for ${hex}`)
      return state
    }

    async function createList(name) {
      const data = await get("/maps/preview/entitylist/create",
        stringField(3, name) + message(5, context) + "!9s" + tokens.createList)
      return { id: data[0][0][0], kind: 1, flags: null, name }
    }

    async function deleteList(ref) {
      await get("/maps/preview/entitylist/delete", listReference(ref) + message(2, context) + "!3s" + tokens.deleteList)
    }

    function itemWrite(route, token) {
      return (ref, point) => get(`/maps/preview/entitylist/${route}`,
        listReference(ref) + message(2, itemBody(point)) + message(3, context) + "!4s" + token)
    }
    const add = itemWrite("createitem", tokens.addItem)
    const remove = itemWrite("deleteitem", tokens.removeItem)

    async function setNote(ref, point, note) {
      await get("/maps/preview/entitylist/updateitem",
        listReference(ref) + noteBody(point, note) + message(3, context) + "!4s" + tokens.setNote)
    }

    async function setStarred(point, starred) {
      const location = point.featureIds != null
        ? message(3, "!1s" + featureHex(point.featureIds), stringField(2, point.name))
        : message(3, message(4, latLng(point)))
      const data = await get("/maps/preview/placeactions/writeaction",
        message(1, "!1s" + tokens.star) + message(2, "!1e1", location, "!8e" + (starred ? 0 : 2)) + starContext)
      if (data?.[0] !== 0) throw new Error("Star change was not acknowledged; read the place before retrying")
    }

    async function each(points, action) {
      const results = new Array(points.length)
      let next = 0
      async function worker() {
        while (next < points.length) {
          const index = next++
          results[index] = await action(points[index])
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, points.length) }, worker))
      return results
    }

    // Reads lag writes by several seconds, so poll until every point matches.
    // Returns the points that never matched.
    async function until(points, read, check) {
      const sleep = options.sleep ?? (ms => new Promise(resolve => root.setTimeout(resolve, ms)))
      const timeout = options.timeout ?? 60000
      const started = Date.now()
      let pending = points
      while (pending.length && Date.now() - started < timeout) {
        await sleep(2000)
        const states = await read(pending)
        pending = pending.filter((point, index) => typeof states[index] === "string" || !check(states[index]))
      }
      return new Set(pending)
    }

    const refKey = ref => ref === "starred" ? "starred" : ref.id
    const samePoint = (a, b) => a.featureIds != null
      ? b.featureIds?.[0] === a.featureIds[0] && b.featureIds[1] === a.featureIds[1]
      : b.featureIds == null && Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7

    // Returns a reader of the refs each point belongs to (a Set of refKeys), or
    // of why it cannot be read. List-to-list moves read the two lists, which
    // also covers coordinate pins; moves involving Starred read each place.
    function membershipReader(viaLists) {
      if (viaLists) {
        return async (points, refs) => {
          const lists = await Promise.all(refs.map(list))
          return points.map(point => new Set(refs
            .filter((ref, index) => lists[index].items.some(item => samePoint(point, item.point)))
            .map(refKey)))
        }
      }
      return points => each(points, async point => {
        if (point.featureIds == null) return "pins move only between lists"
        const state = await readPlace(featureHex(point.featureIds))
        if (!state) return "no place record"
        return new Set(state.starred ? [...state.lists, "starred"] : state.lists)
      })
    }

    // Moves places and pins between lists or Starred. Each point leaves the
    // source only after a fresh read shows it in the destination.
    async function moveAll(points, { from, to }) {
      if (from === to || (from?.id && from.id === to?.id)) throw new TypeError("Source and destination must differ")
      const read = membershipReader(from !== "starred" && to !== "starred")
      const [source, destination] = [refKey(from), refKey(to)]
      const status = new Map()
      const movable = []
      const toAdd = []
      const states = await read(points, [from, to])
      points.forEach((point, index) => {
        const state = states[index]
        if (typeof state === "string") status.set(point, `failed: ${state}`)
        else if (!state.has(source)) status.set(point, "skipped: not in source")
        else {
          movable.push(point)
          if (!state.has(destination)) toAdd.push(point)
        }
      })
      await each(toAdd, point => to === "starred" ? setStarred(point, true) : add(to, point))
      const missing = await until(toAdd, batch => read(batch, [to]), state => state.has(destination))
      for (const point of missing) status.set(point, "failed: destination not verified; source kept")
      const verified = movable.filter(point => !missing.has(point))
      await each(verified, point => from === "starred" ? setStarred(point, false) : remove(from, point))
      const stuck = await until(verified, batch => read(batch, [from]), state => !state.has(source))
      for (const point of verified) status.set(point, stuck.has(point) ? "failed: still in source" : "moved")
      return points.map(point => ({ name: point.name, status: status.get(point) }))
    }

    return Object.freeze({ params: Object.freeze(params), lists, list, place, createList, deleteList, add, remove, setNote, setStarred, moveAll })
  }

  const protocol = Object.freeze({
    message,
    stringField,
    featureHex,
    featureDecimal,
    listReference,
    itemBody,
    noteBody,
    pageSession,
    connect,
  })

  if (typeof module === "object" && module.exports) module.exports = protocol
  else root.googleMapsSavedPlacesProtocol = protocol
})(globalThis)
