const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const { test } = require("node:test")
const { runInNewContext } = require("node:vm")
const tiles = require("../scripts/tiles.js")

const requestPayload = "ChAKCwgKEIAEGIAE6AQJyAEAChAKCwgKEIEEGIAE6AQJyAEAEhgIAhIDcHNtIgcKAnNwEgExisjv3Q8CEAEaCBICcnUaAmRlmgYGb3BhcXVlJQAAgD8"
const capturedURL = `https://www.google.com/maps/vt/proto?authuser=2&authuser=2&hl=ru&gl=de&bpb=${requestPayload}`
const responsePayload = "CtABGsoBkZOTkYsbn4Mbn8khmpHO65iRnpGYuyyFMUV86Y6RlImW2Pr9WDK73uP69uv3/omZk5oBMCdWmrc5mrKRvJG+q+P9/v/4+fqio6ytrq+oqaqroavj+vn4//79q6qpqK+urayjopGj65iRnpGYuyyFMUV86Z+JmZOcATAnVpq7sZfe4/r26/f+u8v66fCCZGRkZGRkZGS6m5ubm5ubmxuRvOuYkZ6RmLsshTFFfOmCkYiJitj09On/8vX67/679vrp8P7piZmTmnuamkCfBgpgGluRk5ORixqfgxufydeR0euYkZ6RmLsshQEwJ1aaoDmaspG8kb6r4/3+//j5+qKjrK2ur6ipqquhq+P6+fj//v2rqqmor66trKOisZbe4/r26/f+u9j6/Vgye5qaQJ8G"
const response = Buffer.from(responsePayload, "base64")

test("identifies the saved-marker layer", () => {
  assert.deepEqual(tiles.layers(capturedURL), ["psm"])
})

test("preserves request context when replacing tiles", () => {
  const url = new URL(tiles.withTiles(capturedURL, [[10, 229, 455]]))
  assert.deepEqual(url.searchParams.getAll("authuser"), ["2", "2"])
  assert.equal(url.searchParams.get("hl"), "ru")
  assert.equal(url.searchParams.get("gl"), "de")
  const payload = Buffer.from(url.searchParams.get("bpb"), "base64url")
  assert.equal(payload.toString("hex"),
    "0a100a0b080a10e50118c703e80409c8010012180802120370736d22070a0273701201318ac8efdd0f0210011a08120272751a0264659a06066f7061717565250000803f")
})

test("accepts tile keys at the map boundaries", () => {
  assert.deepEqual(tiles.layers(tiles.withTiles(capturedURL, [[0, 0, 0], [30, 2 ** 30 - 1, 0]])), ["psm"])
})

test("rejects invalid tile coordinates", () => {
  for (const key of [[-1, 0, 0], [31, 0, 0], [10, -1, 0], [10, 1024, 0], [10, 0, 1024]]) {
    assert.throws(() => tiles.withTiles(capturedURL, [key]), RangeError)
  }
  for (const keys of [[], null, [[10, 1.5, 0]], [[10, 0]]]) {
    assert.throws(() => tiles.withTiles(capturedURL, keys), TypeError)
  }
})

test("rejects personalized-label and mixed-layer templates", () => {
  for (const payload of [
    "Cg0KCAgKEIAEGIAEyAEAEg0IAhIJbG9yZS1wMTNu",
    "Cg0KCAgKEIAEGIAEyAEAEgcIAhIDcHNtEg0IAhIJbG9yZS1wMTNu",
  ]) {
    const url = new URL(capturedURL)
    url.searchParams.set("bpb", payload)
    assert.throws(() => tiles.withTiles(url, [[10, 0, 0]]), /psm saved-marker layer/)
  }
})

test("rejects unrelated routes and missing payloads", () => {
  for (const url of ["https://example.com/maps/vt/proto?bpb=AA", "https://www.google.com/search?bpb=AA", "https://www.google.com/maps/vt/proto"]) {
    assert.throws(() => tiles.layers(url), TypeError)
  }
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

test("rejects truncated tile responses", () => {
  assert.throws(() => tiles.decodeResponse(response.subarray(0, -1)), /Truncated protobuf field/)
  assert.throws(() => tiles.decodeResponse(Buffer.from([10, 128])), /Truncated protobuf varint/)
})

test("rejects malformed protobuf instead of reporting an empty region", () => {
  assert.throws(() => tiles.decodeResponse(new Uint8Array()), /No tile envelopes/)
  assert.throws(() => tiles.decodeResponse(Buffer.from([0, 0])), /Invalid protobuf field/)
  assert.throws(() => tiles.decodeResponse(Buffer.from([15])), /Unsupported protobuf wire/)
  assert.throws(() => tiles.decodeResponse(Buffer.from([10, ...Array(10).fill(255)])), /exceeds 64 bits/)
  assert.throws(() => tiles.decodeResponse(Buffer.from([10, 2, 64, 0])), /Missing protobuf field 3/)
})

test("loads as a browser script without CommonJS", () => {
  const context = { TextDecoder, URL, Uint8Array, ArrayBuffer, atob, btoa }
  runInNewContext(readFileSync(join(__dirname, "../scripts/tiles.js"), "utf8"), context)
  assert.ok(context.googleMapsSavedPlacesTiles)
  assert.equal(context.googleMapsSavedPlacesTiles.decodeResponse(response)[0].markers[0].starred, true)
  assert.equal(tiles.layers(context.googleMapsSavedPlacesTiles.withTiles(capturedURL, [[10, 0, 0]]))[0], "psm")
})
