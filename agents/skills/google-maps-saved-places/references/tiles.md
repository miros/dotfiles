# Regional saved-marker reads

Use this read-only workflow when the Starred search reaches its 200-result cap
or the user asks for saved places in a region. It retrieves markers outside the
capped search result. A complete worldwide inventory is not yet verified.

## Capture the saved-marker layer

1. Open a normal signed-in Maps view with saved markers visible. Pan or zoom.
2. Inspect `list_network_requests` for `GET /maps/vt/proto?bpb=...` requests.
   Tile requests can originate in a worker and be absent from page `performance`
   entries. Use `get_network_request` to obtain their full URLs.
3. Load `scripts/tiles.js` through `evaluate_script` with its absolute
   `sourcePath` and `format: "script"`. Access it as
   `globalThis.googleMapsSavedPlacesTiles`.
4. Call `layers(capturedURL)` to identify the request. Select a request whose
   only layer is `psm`. Preserve the complete captured template.

| Layer | Observed purpose |
|---|---|
| `psm` | Saved markers from Starred and other saved lists |
| `lore-p13n` | Personalized place labels; not a saved-membership inventory |
| `lore-rec` | Additional place labels; not the saved-marker layer |

Do not classify personalized labels as saved places. Public category icons and
style IDs do not establish Starred membership.

## Request a region

The `bpb` query value is base64url-encoded binary protobuf. It is not the textual
`pb` format used by list endpoints. Protobuf field numbers here are one-based.

| Request path | Value |
|---|---|
| Root field `1`, repeated | Requested tile envelope |
| Envelope field `1` | Tile key: fields `1` / `2` / `3` are zoom / x / y |
| Root field `2` | Layer definition; its field `2` contains `psm` |

`withTiles` replaces tile keys using the first captured envelope as a template.
It retains unknown key fields, envelope flags, layer definitions, and other root
fields. It also retains query parameters, including repeated parameters. The
captured layer included an `sp=1` entry and additional flags. Preserve them rather
than constructing a minimal request. Locale settings can be inside `bpb`.
Preserve `authuser`, `hl`, and `gl` wherever the captured request carries them.

```js
const t = globalThis.googleMapsSavedPlacesTiles
const url = t.withTiles(capturedURL, [
  [10, 229, 455],
  [10, 229, 456],
  [10, 230, 455],
  [10, 230, 456],
])
const response = await fetch(url, {
  credentials: "same-origin",
  cache: "no-store",
})
if (!response.ok) throw new Error(`Tile read failed: ${response.status}`)
const tiles = t.decodeResponse(await response.arrayBuffer())
const places = t.mergeMarkers(tiles.flatMap(tile => tile.markers))
const starred = places.filter(place => place.starred)
```

These example tiles cover part of Mexico City. Use standard Web Mercator tile
coordinates for other regions. At zoom `z`, valid x and y values are integers
from `0` through `2 ** z - 1`. Longitude maps to
`floor((longitude + 180) / 360 * 2 ** z)`. Latitude maps to
`floor((1 - asinh(tan(latitude * PI / 180)) / PI) / 2 * 2 ** z)`.
Clamp latitude to approximately ±85.05112878 degrees and handle the longitude
boundary at 180 degrees. Split regions crossing that boundary.

Batch nearby tiles and merge results across requests. Batches of 4, 28, and 64
tiles worked in the live checks. These are observations, not documented limits.
Never embed account cookies or session-specific URLs in the skill or test data.

## Decode the response

Read `response.arrayBuffer()`, not `response.text()`. The response uses a binary
content type with `charset=x-user-defined`. A browser or network tool can map
bytes 0x80–0xff to Unicode U+F780–U+F7FF when saving text. Such text is not the
original byte buffer. Recover those bytes before passing a saved capture to the
decoder. Browser `fetch` decompresses HTTP content encoding automatically.

| Response path | Value |
|---|---|
| Root field `1`, repeated | Tile response envelope |
| Envelope field `3` | Encoded tile payload; XOR each byte with `0x9b` |
| Decoded tile field `1` | Tile key with zoom / x / y |
| Decoded tile field `10`, repeated field `1` | Marker records |
| Marker `53863091 → 20 → 1 → 1` | Hex feature-ID pair |
| Marker `53863091 → 3` / `4` | Fixed-width 64-bit feature IDs, used as fallback |
| Marker `30096869 → 1 → 2` | Name or address label |
| Marker `53863091 → 5` | Fallback name |
| Marker `30096869 → 2`, repeated, then field `1` | Saved-state tags |

The helper returns each tile as `{ tile: [zoom, x, y], markers }`. Each marker has
`featureId`, `name`, `savedTags`, and `starred`. Tags remain decimal strings.
Feature IDs remain exact hex strings. The decoder rejects malformed protobuf
and missing tile envelopes rather than reporting them as an empty region.
The XOR value and field layout reflect the observed format. Recapture the UI
request when decoding fails; do not assume the format is permanent.

## Identify Starred and merge duplicates

Saved-state tag `1` identified explicit Starred membership in the live checks.
It appeared on known results from the Starred search. A newly found result also
had Starred selected in its UI Save menu (`aria-checked="true"`). This tag is
not an ordinary-list kind or the Starred search view enum `4`.

Treat `starred: true` as positive evidence from this observed tag. A missing tag
does not prove that the place is unstarred. Other saved-state values and their
relationships to ordinary-list kinds are not mapped here. Verify additional
types through the UI or ordinary-list reads before assigning names to them.

The same place can occur in several tiles or marker records. `mergeMarkers`
merges exact feature IDs, retains a nonempty name, and unions saved tags. It
retains Starred evidence when another record lacks it. Records without a feature
ID remain separate. The helper does not decode coordinate-only identities or
marker geometry. Do not discard those records or merge them by label alone.

## Limits and validation

- Changing the viewport or country text in the legacy Starred search returned
  the same first 200 results in the tests. It did not provide regional filtering.
- The `psm` Mexico City read returned 15 distinct Starred places. Seven were
  absent from the original capped search. One new result was verified in the UI.
- The same area returned the same 15 places at zoom levels 10 and 12. The higher
  zoom used 64 tiles to cover the same area as the four zoom-10 tiles.
- A Berlin `psm` read returned 81 distinct saved places across multiple save
  types. This count does not establish complete regional coverage.
- These checks, performed on 2026-10-17, establish regional retrieval beyond the
  search cap. They do not establish a complete worldwide enumeration method.
- Zoom, display settings, and server-side marker selection may affect results.
  Compare overlapping regions and zoom levels. Do not treat an empty tile or
  stable count as proof that no additional saved places exist.
- Compare returned tile keys with requested keys. Report missing tiles and
  unresolved marker identities as incomplete coverage.
- Do not infer a place's country from the queried region or tile alone. Resolve
  its address or coordinates separately, especially near borders.
- Tile reads do not provide a verified source for list notes, timestamps, or
  complete membership details. Use ordinary-list reads for those fields.

## Local tests

Run the synthetic fixtures without a signed-in account:

```sh
node --test agents/skills/google-maps-saved-places/tests/tiles.test.js
```

Run this command from the dotfiles repository root. The fixtures contain no
account session data. Use fresh signed-in read requests for a live check.
