const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const { test } = require("node:test")
const { runInNewContext } = require("node:vm")
const p = require("../scripts/protocol.js")

const tokens = []
tokens[2] = "STAR_TOKEN:1"
tokens[25] = "DELETE_LIST_TOKEN:1"
tokens[26] = "REMOVE_TOKEN:1"
tokens[27] = "CREATE_LIST_TOKEN:1"
tokens[28] = "ADD_TOKEN:1"
tokens[30] = "NOTE_TOKEN:1"
const options = []
options[3] = ["/search?tbm=map&authuser=2&hl=ru&gl=de"]
options[28] = tokens
const page = `(function(){var kEI='SESSION_ID';window.APP_OPTIONS=${JSON.stringify(options)};window.APP_INITIALIZATION_STATE=[];})();`

const custom = { id: "LIST_A", kind: 1, flags: null }
const travel = { id: "LIST_T", kind: 5, flags: [[15], [1]] }
const named = { name: "Café ! Example", lat: -30.5, lng: 115.1, featureIds: ["18446744073709551615", "9223372036854775808"] }
const hex = p.featureHex(named.featureIds)
const other = { name: "Other", lat: 10, lng: 20, featureIds: ["1", "2"] }
const pin = { name: "Coordinate pin", lat: -34.095, lng: 123.20277779999999 }

function body(data) {
  return { ok: true, status: 200, text: async () => ")]}'\n" + JSON.stringify(data) }
}

// Fake Maps backend. Place reads return the state from `lag` reads ago.
function backend({ starred = [], members = {}, stubs = [], lag = 0, fail } = {}) {
  const places = new Map()
  const state = hex => {
    if (!places.has(hex)) places.set(hex, { starred: starred.includes(hex), lists: new Set(members[hex] ?? []), history: [] })
    return places.get(hex)
  }
  Object.keys(members).forEach(state)
  const snapshot = hex => ({ starred: state(hex).starred, lists: [...state(hex).lists] })
  const write = (hex, change) => {
    const place = state(hex)
    place.history.push(...Array(lag).fill(snapshot(hex)))
    change(place)
  }
  const calls = []
  const fetch = async href => {
    const url = new URL(href)
    const pb = url.searchParams.get("pb")
    calls.push({ path: url.pathname, pb, params: Object.fromEntries([...url.searchParams].filter(([key]) => key !== "pb")) })
    const hex = pb.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/)?.[1]
    const list = pb.match(/^!1m\d+!1s(LIST_\w+)/)?.[1]
    if (url.pathname === fail) return { ok: false, status: 400, text: async () => "" }
    if (url.pathname === "/maps/preview/place") {
      const shown = state(hex).history.shift() ?? snapshot(hex)
      const rows = shown.lists.map(id => [[[3, id], "List"], "ITEM"])
      if (shown.starred) rows.push([[[4], "Starred"], "STARRED"])
      const record = []
      if (stubs.includes(hex)) return body([null, null, null, null, null, null, [null, null]])
      record[243] = "CC"
      record[9] = [null, null, 1.5, 2.5]
      record[18] = "Name, Region 6452, Country"
      record[11] = "Name"
      record[25] = []
      record[25][15] = rows.length ? rows : null
      return body([null, null, null, null, null, null, record])
    }
    if (url.pathname.endsWith("/writeaction")) {
      const target = pb.match(/!3m\d+!1s(0x[0-9a-f]+:0x[0-9a-f]+)/)?.[1]
      if (target) write(target, place => { place.starred = pb.includes("!8e0") })
      return body([0, null, ["https://maps.google.com/"]])
    }
    if (url.pathname.endsWith("/getlist")) {
      const items = [...places.keys()].flatMap(key => {
        const shown = state(key).history.shift() ?? snapshot(key)
        if (!shown.lists.includes(list)) return []
        const pin = key.startsWith("pin:")
        const [lat, lng] = pin ? key.slice(4).split(",").map(Number) : [1.5, 2.5]
        const item = []
        item[1] = [null, null, null, null, null, [null, null, lat, lng]]
        item[2] = pin ? "Pin" : "Name"
        item[8] = pin ? [[1], null, [null, null, lat, lng]] : [[1], p.featureDecimal(key)]
        return [item]
      })
      const record = []
      record[0] = [list, 1]
      record[8] = items
      record[12] = items.length
      return body([record, ""])
    }
    const itemKey = () => {
      const ids = pb.match(/!7m2!1y(\d+)!2y(\d+)/)
      if (ids) return p.featureHex([ids[1], ids[2]])
      const at = pb.match(/!6m2!3d([^!]+)!4d([^!]+)/)
      return `pin:${Number(at[1])},${Number(at[2])}`
    }
    if (url.pathname.endsWith("/createitem")) {
      write(itemKey(), place => place.lists.add(list))
      return body([])
    }
    if (url.pathname.endsWith("/deleteitem")) {
      write(itemKey(), place => place.lists.delete(list))
      return body([[]])
    }
    if (url.pathname.endsWith("/create")) return body([[["NEW_LIST", 0, null, 1, 1]]])
    return body([])
  }
  return { calls, snapshot, connect: (extra = {}) => p.connect({ scripts: ["var other = 1", page], fetch, sleep: async () => {}, ...extra }) }
}

test("reads session, request parameters, and write tokens from the page", () => {
  const session = p.pageSession([page])
  assert.equal(session.session, "SESSION_ID")
  assert.deepEqual(session.params, { authuser: "2", hl: "ru", gl: "de" })
  assert.deepEqual(session.tokens, {
    star: "STAR_TOKEN:1", deleteList: "DELETE_LIST_TOKEN:1", removeItem: "REMOVE_TOKEN:1",
    createList: "CREATE_LIST_TOKEN:1", addItem: "ADD_TOKEN:1", setNote: "NOTE_TOKEN:1",
  })
})

test("refuses pages without Maps state or a token", () => {
  assert.throws(() => p.pageSession(["var x = 1"]), /page state not found/)
  const broken = JSON.parse(JSON.stringify(options))
  broken[28][28] = null
  assert.throws(() => p.pageSession([page.replace(JSON.stringify(options), JSON.stringify(broken))]), /addItem token/)
})

test("sends list writes with the matching operation token and page parameters", async () => {
  const b = backend()
  const maps = b.connect()
  assert.deepEqual(maps.params, { authuser: "2", hl: "ru", gl: "de" })
  await maps.add(travel, named)
  await maps.remove(custom, pin)
  await maps.setNote(custom, named, "Note ! with bang")
  const [add, remove, note] = b.calls
  assert.equal(add.path, "/maps/preview/entitylist/createitem")
  assert.deepEqual(add.params, { authuser: "2", hl: "ru", gl: "de" })
  assert.equal(add.pb, p.listReference(travel) + p.message(2, p.itemBody(named)) + "!3m3!1sSESSION_ID!7e81!28e2!4sADD_TOKEN:1")
  assert.equal(remove.path, "/maps/preview/entitylist/deleteitem")
  assert.ok(remove.pb.endsWith("!4sREMOVE_TOKEN:1"))
  assert.ok(!remove.pb.includes("!7m2"), "coordinate pins carry no feature IDs")
  assert.equal(note.pb, "!1m2!1sLIST_A!2e1" + p.noteBody(named, "Note ! with bang") + "!3m3!1sSESSION_ID!7e81!28e2!4sNOTE_TOKEN:1")
})

test("creates and deletes lists", async () => {
  const b = backend()
  const maps = b.connect()
  assert.deepEqual(await maps.createList("Trip"), { id: "NEW_LIST", kind: 1, flags: null, name: "Trip" })
  await maps.deleteList(custom)
  assert.equal(b.calls[0].pb, p.stringField(3, "Trip") + "!5m3!1sSESSION_ID!7e81!28e2!9sCREATE_LIST_TOKEN:1")
  assert.equal(b.calls[1].pb, "!1m2!1sLIST_A!2e1!2m3!1sSESSION_ID!7e81!28e2!3sDELETE_LIST_TOKEN:1")
})

test("stars named places by hex feature ID and pins by coordinates", async () => {
  const b = backend()
  const maps = b.connect()
  await maps.setStarred(named, true)
  await maps.setStarred(pin, false)
  assert.equal(b.calls[0].pb,
    "!1m1!1sSTAR_TOKEN:1!2m5!1e1!3m2!1s0xffffffffffffffff:0x8000000000000000" + p.stringField(2, named.name) +
    "!8e0!3m2!1sSESSION_ID!7e81")
  assert.equal(b.calls[1].pb,
    "!1m1!1sSTAR_TOKEN:1!2m6!1e1!3m3!4m2!3d-34.095!4d123.20277779999999!8e2!3m2!1sSESSION_ID!7e81")
})

test("reads place memberships including Starred", async () => {
  const maps = backend({ starred: [hex], members: { [hex]: ["LIST_A"] } }).connect()
  const state = await maps.place(named)
  assert.equal(state.starred, true)
  assert.deepEqual(state.lists, ["LIST_A"])
  assert.equal(state.countryCode, "CC")
  assert.deepEqual([state.lat, state.lng], [1.5, 2.5])
  assert.deepEqual(state.featureIds, named.featureIds)
})

test("converts feature IDs between hex and exact decimal", () => {
  assert.equal(p.featureHex(["-1", "1"]), "0xffffffffffffffff:0x1")
  assert.deepEqual(p.featureDecimal("0xffffffffffffffff:0x1"), ["18446744073709551615", "1"])
  assert.throws(() => p.featureDecimal("123"), /0x/)
})

test("refuses incomplete list reads", async () => {
  const maps = p.connect({
    scripts: [page],
    fetch: async () => body([[["LIST_A", 1], null, null, null, "A", null, null, null, [], null, null, null, 3], "CURSOR"]),
  })
  await assert.rejects(maps.list(custom), /Incomplete list read/)
})

test("moves Starred places to a list and skips places outside the source", async () => {
  const b = backend({ starred: [hex], lag: 2 })
  const result = await b.connect().moveAll([named, other], { from: "starred", to: custom })
  assert.deepEqual(result, [{ name: named.name, status: "moved" }, { name: "Other", status: "skipped: not in source" }])
  assert.deepEqual(b.snapshot(hex), { starred: false, lists: ["LIST_A"] })
  assert.deepEqual(b.snapshot(p.featureHex(other.featureIds)), { starred: false, lists: [] })
})

test("reports places without a place record instead of skipping them", async () => {
  const maps = backend({ starred: [hex], stubs: [hex] }).connect()
  await assert.rejects(maps.place(named), /No place record/)
  assert.deepEqual(await maps.moveAll([named], { from: "starred", to: custom }), [{ name: named.name, status: "failed: no place record" }])
})

test("moves between lists and leaves unrelated memberships alone", async () => {
  const b = backend({ starred: [hex], members: { [hex]: ["LIST_A", "LIST_Z"] } })
  const result = await b.connect().moveAll([named], { from: custom, to: travel })
  assert.deepEqual(result, [{ name: named.name, status: "moved" }])
  assert.deepEqual(b.snapshot(hex), { starred: true, lists: ["LIST_Z", "LIST_T"] })
})

test("moves coordinate pins between lists through list reads", async () => {
  const key = `pin:${pin.lat},${pin.lng}`
  const b = backend({ members: { [key]: ["LIST_A"] }, lag: 2 })
  const result = await b.connect().moveAll([pin, other], { from: custom, to: travel })
  assert.deepEqual(result, [{ name: pin.name, status: "moved" }, { name: "Other", status: "skipped: not in source" }])
  assert.deepEqual(b.snapshot(key), { starred: false, lists: ["LIST_T"] })
  assert.ok(!b.calls.some(call => call.path === "/maps/preview/place"), "list moves read lists, not places")
})

test("refuses Starred moves for coordinate pins without writing", async () => {
  const b = backend()
  const result = await b.connect().moveAll([pin], { from: "starred", to: custom })
  assert.deepEqual(result, [{ name: pin.name, status: "failed: pins move only between lists" }])
  assert.equal(b.calls.length, 0)
})

test("keeps the source when the destination cannot be verified", async () => {
  const b = backend({ starred: [hex], lag: 100 })
  const result = await b.connect({ timeout: 0 }).moveAll([named], { from: "starred", to: custom })
  assert.deepEqual(result, [{ name: named.name, status: "failed: destination not verified; source kept" }])
  assert.equal(b.calls.filter(call => call.path.endsWith("/writeaction")).length, 0)
})

test("refuses moves into the source itself", async () => {
  const maps = backend().connect()
  await assert.rejects(maps.moveAll([named], { from: "starred", to: "starred" }), /must differ/)
  await assert.rejects(maps.moveAll([named], { from: custom, to: { ...custom } }), /must differ/)
})

test("stops on failed writes", async () => {
  const b = backend({ starred: [hex], fail: "/maps/preview/entitylist/createitem" })
  await assert.rejects(b.connect().moveAll([named], { from: "starred", to: custom }), /HTTP 400/)
  assert.deepEqual(b.snapshot(hex), { starred: true, lists: [] })
})

test("loads as a browser script", () => {
  const context = { URL, TextEncoder, btoa, BigInt }
  context.globalThis = context
  runInNewContext(readFileSync(join(__dirname, "../scripts/protocol.js"), "utf8"), context)
  assert.equal(typeof context.googleMapsSavedPlacesProtocol.connect, "function")
})
