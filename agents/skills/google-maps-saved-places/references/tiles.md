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

## Expired template

When Google stops accepting the built-in template, `savedMarkers` fails with
"template expired" (HTTP 410). Capture a fresh one:

1. Navigate the working tab to a region with saved places at zoom 10 or
   closer, for example `https://www.google.com/maps/@31.3,120.58,12z`. Wait for
   the map to load. Tile requests come from a worker, so only network
   inspection shows them.
2. Call `list_network_requests` and collect the `reqid` of every
   `/maps/vt/proto` request. The list truncates long URLs, so do not use them.
3. Call `get_network_request` for each `reqid` and extract only the
   `https://www.google.com/maps/vt/proto?...` URL with a regular expression.
   The output also contains request cookies: never return or quote it.
   Do this inside one Code Mode script when it is available.
4. Pass the URLs to `templateFrom(urls)`. It picks the psm-only request,
   keeps one tile envelope, and removes the session field `27`.
5. Pass the result as `savedMarkers(tiles, { template, params: maps.params })`.
   Replace `savedMarkersTemplate` in `scripts/tiles.js` with it and run the
   tests.

If decoding fails rather than the request, the response format changed; see
the format notes above.
