const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const { test } = require("node:test")
const { runInNewContext } = require("node:vm")
const tiles = require("../scripts/tiles.js")

const responsePayload = "CtABGsoBkZOTkYsbn4Mbn8khmpHO65iRnpGYuyyFMUV86Y6RlImW2Pr9WDK73uP69uv3/omZk5oBMCdWmrc5mrKRvJG+q+P9/v/4+fqio6ytrq+oqaqroavj+vn4//79q6qpqK+urayjopGj65iRnpGYuyyFMUV86Z+JmZOcATAnVpq7sZfe4/r26/f+u8v66fCCZGRkZGRkZGS6m5ubm5ubmxuRvOuYkZ6RmLsshTFFfOmCkYiJitj09On/8vX67/679vrp8P7piZmTmnuamkCfBgpgGluRk5ORixqfgxufydeR0euYkZ6RmLsshQEwJ1aaoDmaspG8kb6r4/3+//j5+qKjrK2ur6ipqquhq+P6+fj//v2rqqmor66trKOisZbe4/r26/f+u9j6/Vgye5qaQJ8G"
const response = Buffer.from(responsePayload, "base64")

const template = tiles.savedMarkersTemplate

test("identifies the saved-marker layer", () => {
  assert.deepEqual(tiles.layers(template), ["psm"])
})

test("replaces tile keys in the template", () => {
  const url = new URL(tiles.withTiles(template, [[10, 229, 455], [30, 2 ** 30 - 1, 0]]))
  assert.equal(url.searchParams.get("authuser"), "0")
  const payload = Buffer.from(url.searchParams.get("bpb"), "base64url").toString("hex")
  assert.ok(payload.includes("080a10e50118c703"), "zoom 10 key")
  assert.ok(payload.includes("081e10ffffffff031800"), "zoom 30 boundary key")
  assert.deepEqual(tiles.layers(url.href), ["psm"])
})

test("rejects invalid tile coordinates", () => {
  for (const key of [[-1, 0, 0], [31, 0, 0], [10, -1, 0], [10, 1024, 0], [10, 0, 1024]]) {
    assert.throws(() => tiles.withTiles(template, [key]), RangeError)
  }
  for (const keys of [[], null, [[10, 1.5, 0]], [[10, 0]]]) {
    assert.throws(() => tiles.withTiles(template, keys), TypeError)
  }
})

test("rejects templates for other layers", () => {
  const url = new URL(template)
  url.searchParams.set("bpb", "Cg0KCAgKEIAEGIAEyAEAEgcIAhIDcHNtEg0IAhIJbG9yZS1wMTNu")
  assert.throws(() => tiles.withTiles(url, [[10, 0, 0]]), /only the psm layer/)
})

test("decodes explicit Starred tags", () => {
  const decoded = tiles.decodeResponse(response)
  assert.deepEqual(decoded.map(tile => tile.tile), [[10, 512, 512], [10, 513, 512]])
  assert.deepEqual(decoded[0].markers[0], {
    featureId: "0xfedcba9876543210:0xabcdef0123456789",
    name: "Café Example",
    savedTags: ["1"],
    starred: true,
  })
  assert.equal(decoded[1].markers[0].starred, false)
})

test("keeps unmapped tags and exact 64-bit feature IDs", () => {
  assert.deepEqual(tiles.decodeResponse(response)[0].markers[1], {
    featureId: "0xffffffffffffffff:0x8000000000000000",
    name: "Example Park",
    savedTags: ["7"],
    starred: false,
  })
})

test("retains records without a feature identity", () => {
  const unidentified = tiles.decodeResponse(response)[0].markers[2]
  assert.deepEqual(unidentified, {
    featureId: null,
    name: "Coordinate marker",
    savedTags: ["1"],
    starred: true,
  })
  assert.equal(tiles.mergeMarkers([unidentified, unidentified]).length, 2)
})

test("merges duplicate markers without losing Starred evidence", () => {
  const markers = tiles.decodeResponse(response).flatMap(tile => tile.markers)
  const original = structuredClone(markers)
  for (const input of [markers, [...markers].reverse()]) {
    const merged = tiles.mergeMarkers(input)
    assert.equal(merged.length, 3)
    const place = merged.find(marker => marker.featureId === "0xfedcba9876543210:0xabcdef0123456789")
    assert.equal(place.starred, true)
    assert.deepEqual(place.savedTags, ["1"])
    assert.ok(place.name)
  }
  assert.deepEqual(markers, original)
})

test("reads only the supplied byte view", () => {
  const padded = Buffer.concat([Buffer.from([255]), response, Buffer.from([255])])
  assert.deepEqual(tiles.decodeResponse(padded.subarray(1, -1)), tiles.decodeResponse(response))
  const buffer = Uint8Array.from(response).buffer
  assert.deepEqual(tiles.decodeResponse(buffer), tiles.decodeResponse(response))
})

test("decodes valid empty tiles without inventing markers", () => {
  assert.deepEqual(tiles.decodeResponse(Buffer.from("Cg8aDZGTk5GLG5+DG597mpo=", "base64")), [
    { tile: [10, 512, 512], markers: [] },
  ])
})

test("rejects truncated or malformed responses instead of reporting an empty region", () => {
  assert.throws(() => tiles.decodeResponse(response.subarray(0, -1)), /Truncated protobuf field/)
  assert.throws(() => tiles.decodeResponse(new Uint8Array()), /No tile envelopes/)
  assert.throws(() => tiles.decodeResponse(Buffer.from([10, 2, 64, 0])), /Missing protobuf field 3/)
})

test("covers a region with Web Mercator tiles", () => {
  assert.deepEqual(tiles.regionTiles({ north: 1, south: -1, west: -1, east: 1 }, 1), [[1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]])
  assert.deepEqual(tiles.regionTiles({ north: 89, south: 80, west: 170, east: -170 }, 2).map(tile => tile[1]), [3, 0])
  assert.throws(() => tiles.regionTiles({ north: -1, south: 1, west: 0, east: 1 }, 3), /Invalid region/)
})

test("reads saved markers with the built-in template and reports missing tiles", async () => {
  const requested = []
  const fetch = async url => {
    requested.push(new URL(url))
    return { ok: true, arrayBuffer: async () => Uint8Array.from(response).buffer }
  }
  const result = await tiles.savedMarkers([[10, 512, 512], [10, 513, 512], [10, 514, 512]], { fetch, params: { authuser: "3", hl: "ru", gl: "de" } })
  assert.equal(requested.length, 1)
  assert.equal(requested[0].searchParams.get("authuser"), "3")
  assert.equal(requested[0].searchParams.get("hl"), "ru")
  await assert.rejects(tiles.savedMarkers([[10, 0, 0]], { fetch }), /maps\.params/)
  assert.deepEqual(tiles.layers(requested[0].href), ["psm"])
  assert.deepEqual(result.missing, [[10, 514, 512]])
  assert.equal(result.markers.length, 3)
})

test("loads as a browser script without CommonJS", () => {
  const context = { TextDecoder, URL, Uint8Array, ArrayBuffer, atob, btoa }
  runInNewContext(readFileSync(join(__dirname, "../scripts/tiles.js"), "utf8"), context)
  assert.ok(context.googleMapsSavedPlacesTiles)
  assert.equal(context.googleMapsSavedPlacesTiles.decodeResponse(response)[0].markers[0].starred, true)
})
