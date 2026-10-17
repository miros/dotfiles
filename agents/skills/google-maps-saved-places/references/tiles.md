# Regional saved-marker reads

The `psm` ("personal saved markers") map tile layer returns the account's saved
markers for any region. `scripts/tiles.js` reads it with a built-in request
template. SKILL.md shows the discovery workflow; this file covers the details.

`regionTiles({ north, south, west, east }, zoom)` returns Web Mercator tile keys
covering the box; `west > east` crosses the antimeridian. `savedMarkers(tiles,
{ params: maps.params })` fetches them for that account in batches of 32 and returns merged markers plus any
requested tiles the response omitted.

Each marker has `featureId` (`0x...:0x...`, or `null` for coordinate pins),
`name`, `savedTags`, and `starred`.

## Interpreting results

- Tag `1` is Starred. Other saved types can appear with other, unmapped tags,
  and custom-list-only saves may not appear. Use `maps.place()` or
  `maps.list()` for list membership.
- A tile covers more than the box, especially at low zoom, so results include
  places outside the region.
- Different zooms return different subsets, and higher zooms return fewer.
  Union zooms 5–7 for a country. A missing tag or an empty tile does not prove
  that a place is unstarred.
- Coordinate pins have no feature ID; check them with list reads.
- Tiles are for discovering existing saves, not for verifying a write. Tiles
  can lag writes by minutes; verify writes with `maps.place()`.

## Format

`bpb` is base64url binary protobuf (one-based field numbers). Root field `1`
repeats tile envelopes whose field `1` is `{1: zoom, 2: x, 3: y}`; root field
`2` is the layer definition containing `psm`. Keep fields 4–32 except `27`,
which carries session IDs; without them the server returns a different
encoding.

Read `response.arrayBuffer()`, not `text()`. Response root field `1` repeats tile
envelopes. Envelope field `3` is the tile payload, with every byte XORed with
`0x9b`. Decoded field `10` holds markers. In a marker, `53863091 → 20 → 1 → 1`
is the hex feature ID (with fixed64 fields `3`/`4` as a fallback),
`30096869 → 1 → 2` is the label, and `30096869 → 2 → 1` lists the saved-state
tags.

If decoding starts failing after a Maps update, open a Maps view with saved
markers and take the full URL of a `/maps/vt/proto` request whose `layers()`
is `["psm"]`. Tile requests come from a worker, so only network inspection
shows them. Pass the URL as `savedMarkers(tiles, { template })`, then update
`savedMarkersTemplate` without field `27`. `get_network_request` also prints the
request cookies, so copy only the URL and never quote the rest.
