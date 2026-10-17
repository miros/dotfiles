---
name: google-maps-saved-places
description: >-
  Manage Google Maps saved places through the Maps internal API in a signed-in
  browser tab. Use for reading, adding, removing, starring, and moving places
  between Starred, Favorites, Want to go, Travel plans, Saved places, and custom
  lists, including country- or region-wide moves and coordinate pins.
compatibility: Chrome DevTools MCP connected to a Chrome profile signed in to Google Maps.
---

# Google Maps saved places

Make every read and write through the bundled API client. Do not change
memberships through the UI.

## Setup

1. Open one working tab with `new_page` at `https://www.google.com/maps` and
   reuse it for the whole task.
2. Load [scripts/protocol.js](scripts/protocol.js) with `evaluate_script`,
   using its absolute `sourcePath` and `format: "script"`.
3. Connect once:

   ```js
   globalThis.maps = googleMapsSavedPlacesProtocol.connect()
   ```

   `connect()` reads the session ID, account parameters (`maps.params`:
   `authuser`, `hl`, `gl`), and per-operation write tokens from the page. Keep
   tokens inside the page: never return the session or raw request URLs from
   `evaluate_script`.
4. After any navigation or reload, load the script and connect again. If a
   write returns HTTP 400, reload the tab and reconnect before retrying.

Each `evaluate_script` call can run a whole batch. Return compact summaries
(names, counts, statuses), not raw responses.

## Client

| Call | Result |
|---|---|
| `maps.lists()` | Owned lists: `{ id, kind, flags, name, count }` |
| `maps.list(ref)` | `{ name, items: [{ note, point }] }`; refuses incomplete reads |
| `maps.place(pointOrHexId)` | `{ name, lat, lng, address, countryCode, featureIds, starred, lists }`; throws for stub records |
| `maps.add(ref, point)` / `maps.remove(ref, point)` | Add or remove one list membership |
| `maps.setNote(ref, point, note)` | Set the note of a list membership |
| `maps.setStarred(point, true \| false)` | Star or unstar |
| `maps.createList(name)` / `maps.deleteList(ref)` | Create or delete a custom list |
| `maps.moveAll(points, { from, to })` | Verified batch move; see below |

`ref` is a descriptor from `maps.lists()` or `maps.createList()`. `"starred"`
names Starred in `moveAll`. A point is `{ name, lat, lng, featureIds }`, where
`featureIds` is a pair of decimal strings; omit it for coordinate pins.
`place()` returns a ready-to-use point for named places.

List kinds: `1` custom, `2` Favorite places, `3` Want to go, `5` Travel plans,
`6` Saved places. Starred is not a list; `place()` reports it as `starred`.
A place can belong to several lists.

## Find places

- One list: `maps.list(ref)`.
- Starred, or saved places in a region: load
  [scripts/tiles.js](scripts/tiles.js) the same way, then read saved markers:

  ```js
  const t = googleMapsSavedPlacesTiles
  const box = { north: 45.6, south: 24, west: 122.9, east: 146 }
  const all = []
  for (const zoom of [5, 6, 7]) {
    const { markers, missing } = await t.savedMarkers(t.regionTiles(box, zoom), { params: maps.params })
    if (missing.length) throw new Error(`${missing.length} tiles not returned`)
    all.push(...markers)
  }
  const candidates = t.mergeMarkers(all).filter(m => m.starred && m.featureId)
  ```

  Tiles are for discovery only and cover more than the box; see
  [references/tiles.md](references/tiles.md) for caveats. Resolve each candidate with `maps.place(featureId)` and
  filter by `countryCode`, falling back to `address` text or coordinates when it
  is `null`. The place read is authoritative for membership. Some saved places
  have only a stub record; report them rather than guessing their membership.

## Move places

```js
const result = await maps.moveAll(points, { from: "starred", to: travelPlans })
```

`moveAll` reads every point first and skips those not in the source. It adds
the missing destinations and polls until fresh reads show them. Only then does
it remove the source and verify the removal. It never touches other
memberships, and it is safe to rerun after a failure. Statuses are `moved`,
`skipped: not in source`, and `failed: ...`. An HTTP error aborts the whole
batch: reload the tab, reconnect, and rerun the same call.

- List-to-list moves verify through reads of the two lists, for named places
  and pins alike. Moves involving Starred verify through place reads and report
  stub records as `failed: no place record`. Reads lag writes by about 5–20
  seconds. A batch waits once, so move many points per call instead of one
  call per point.
- Pins move only between lists (`failed: pins move only between lists`):
  Starred has no read that shows a pin. To star or unstar a pin, use
  `setStarred` and tell the user it cannot be verified.
- Notes are not copied. Before moving list → list, read the source with
  `maps.list(ref)` and restore notes with `setNote` after the move.
- Report counts by status. A skipped place was not in the requested source.
  Do not "fix" it by changing other lists.

## Limits

- Write-token positions in the page state are tied to the Maps build; see
  [references/api.md](references/api.md) to remap them if `connect()` fails.
- Use network inspection (`get_network_request`) only for the tile-template
  remap in [references/tiles.md](references/tiles.md); it prints cookies.

## Tests

```sh
node --test agents/skills/google-maps-saved-places/tests/*.test.js
```
