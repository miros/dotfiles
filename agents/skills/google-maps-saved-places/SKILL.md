---
name: google-maps-saved-places
description: >-
  Manage Google Maps saved places and POIs through browser MCP. Use for fetching,
  organizing, adding, removing, and moving Favorites, Want to go, Travel plans,
  Saved places, custom lists, Starred places, and coordinate pins. Covers regional
  saved-marker reads beyond the Starred search cap, list types, notes, internal
  API requests, and changing saved-place memberships.
compatibility: Signed-in Google Maps browser MCP with JavaScript execution and network inspection.
---

# Google Maps saved places

## Choose the shortest workflow

- For a handful of identified places, prefer the Save menu. As a starting rule,
  use it for about ten or fewer places unless API templates are already available.
  Do not set up bulk requests when clicking the items requires less work.
- For larger moves, use the API workflow and the bundled move helper below.
- Use the current Maps tab or one working tab. Do not open a tab per place.
  Inspect an existing regional view before navigating away from it.
- Google Maps memberships use this skill, not the Google Workspace connectors.

## Discover once, then move

1. Identify candidates and resolve their country from addresses or coordinates.
2. When the task includes an entire country, check coverage and flag unresolved
   identities or territory boundaries before claiming that every place was found.
3. After confirming candidates, move them without repeating regional discovery.
   Read another region or zoom only to address a specific coverage gap. Matching
   counts at several zoom levels do not establish completeness.
4. Keep discovery limits separate from move results. Report the number of
   identified places moved; do not call a partial inventory complete.

### Small moves through the UI

For each candidate, open Save, select the destination, and wait for its write
request to finish. Verify the destination before deselecting Starred. Read the
menu again to confirm both states. Use `aria-checked`, not menu position, because
selected entries move to the top. Preserve other selections. Do not initialize
the API helpers for this workflow.

## API setup

1. Connect to the signed-in Maps tab with Chrome DevTools MCP. Use `take_snapshot`
   for UI elements and `list_network_requests` / `get_network_request` for requests.
2. Load [scripts/protocol.js](scripts/protocol.js) with `evaluate_script`, using
   its absolute `sourcePath` and `format: "script"`.
3. Access the helpers as `globalThis.googleMapsSavedPlacesProtocol`.
4. Run requests with `fetch` inside the Maps tab. Preserve `authuser`, `hl`, and
   `gl` from captured requests; cookies authenticate the request.
5. Capture the corresponding UI request to obtain the token for each write
   operation. Tokens differ between create, add, update, remove, and delete.

Read [references/api.md](references/api.md) for payloads and response indices.

## Fetch places

| Data | Request | Result |
|---|---|---|
| List inventory | `GET /locationhistory/preview/mas` | Owned lists at `[29][3]`; followed lists at `[30][3]` |
| Ordinary list | `GET /maps/preview/entitylist/getlist` | List at `[0]`; items at `[0][8]`; count at `[0][12]` |
| Starred places | `GET /search?tbm=map&q=*&pb=...` | Starred filter `!54m1!1e4`; place rows at `[64]` |
| Regional saved markers | `GET /maps/vt/proto?bpb=...` | Binary tile response; select the `psm` layer |

Open Saved to capture inventory parameters. Open a list to capture `getlist`.
Open Starred to capture its full search query and feature flags.

Use `parseJSON(text)` for ordinary responses. Use
`parseSearchResponse(text).payloads` for streamed search responses.

### Regional reads beyond the Starred search cap

Use the `psm` tile layer to fetch saved markers for a region, including Starred
places outside the search's first 200 results. Read
[references/tiles.md](references/tiles.md) for capture, payloads, and limits.

Load [scripts/tiles.js](scripts/tiles.js) with `evaluate_script`, using its
absolute `sourcePath` and `format: "script"`. Access it as
`globalThis.googleMapsSavedPlacesTiles`. Use `layers` to select a captured `psm`
request, `withTiles` to set regional tile keys, and `decodeResponse` on the
fetched `ArrayBuffer`. Use `mergeMarkers` to retain tags across duplicate IDs.

Saved-state tag `1` identified explicit Starred membership in the verified tile
records. Other types remain unmapped. Do not infer saved membership from
`lore-p13n` personalized labels or public category icons. Regional fetching
bypasses the search cap, but complete worldwide coverage remains unverified.

## Types and identity

| List kind | Type |
|---|---|
| `1` | Custom list |
| `2` | Favorite places |
| `3` | Want to go |
| `5` | Travel plans |
| `6` | Saved places |

Starred uses a separate legacy API, not an ordinary list ID. Its view enum `4`
is not an ordinary-list kind. These types are list memberships, not public place
categories such as restaurant or museum. A place can have multiple memberships.

Use `item[8]` as the membership key:

```text
Named POI:      [[1], [FEATURE_ID_1, FEATURE_ID_2]]
Coordinate pin: [[1], null, [null, null, LATITUDE, LONGITUDE]]
```

Keep feature IDs as strings or `BigInt`. Normalize signed IDs with `unsigned64`.
Use `itemIdentity` for matching. Coordinate identities retain their exact values.

## Manage places

All write routes below use GET with an encoded `pb` query parameter.

| Operation | Route under `/maps/preview/` |
|---|---|
| Create list | `entitylist/create` |
| Add membership | `entitylist/createitem` |
| Set note | `entitylist/updateitem` |
| Remove membership | `entitylist/deleteitem` |
| Delete whole list | `entitylist/delete` |
| Star / unstar | `placeactions/writeaction`, state `!8e0` / `!8e2` |

Use `listReference`, `itemBody`, and `noteBody` to construct ordinary-list
payloads. `createitem` and `deleteitem` use the same item body with different
operation tokens. Coordinate bodies omit feature IDs.

## Change memberships

| Change | Steps |
|---|---|
| Add another type | Add to the destination list; keep other memberships |
| List → list | Read source; add destination; copy note; read destination; remove source |
| List → Starred | Retain the note separately; star the place; remove list membership |
| Starred → list | Add destination; restore any retained note; unstar |

Notes belong to list memberships and require an explicit `updateitem` call.
Starred does not automatically carry list notes through a round trip. Moves
recreate memberships and are not atomic; timestamp preservation is unspecified.

### Resumable Starred → list moves

Load [scripts/move.js](scripts/move.js) after `protocol.js`. Access it as
`globalThis.googleMapsSavedPlacesMove`. Follow the runnable workflow in
[references/api.md](references/api.md#resumable-starred--list-helper).

- Start `capture()` before the first UI operation. It observes fetch and XHR
  URLs for list reads, additions, and unstarring. Capture tokens using real steps
  of the requested move, not changes to an unrelated test place. Verify an
  addition before performing the first unstar operation. Stop capture afterward.
- Pass the captured templates and confirmed candidates to `create()`. `run()`
  skips existing destination memberships, adds missing ones, verifies the full
  destination, and only then removes stars. It preserves request context.
- The helper checkpoints candidates and progress in `sessionStorage`. It does
  not persist tokens or request URLs. After navigation, reload both scripts and
  supply current templates with the same `storageKey` to resume. Never put
  account tokens, cookies, or captured URLs in skill files or test fixtures.
- Treat interrupted writes as uncertain. Read membership before retrying.
  Without reliable current Starred state, the helper pauses an uncertain unstar.
- The helper supports Starred → ordinary list only. Restore retained notes
  separately. Use the documented manual workflow for other move types.

### Verification and progress

Report verified progress, such as `1/5 moved`, while work continues. Distinguish
acknowledged writes from verified moves. `report().acknowledged` counts successful
unstar replies; `report().completed` counts places with verified destination and
unstarred state. Do not claim that every Save menu was checked after checking one.

Map icons can remain stale after API writes, including after a map reload. When
icons disagree with write results, inspect a freshly loaded place Save menu.
Do not repeat writes because an icon still shows a star. A capped Starred search
or missing tile tag does not prove that a place is unstarred. Verify the affected
identities with a reliable read or their fresh Save menus, then stop checking.

## UI and request details

- Save-menu membership is exposed as `aria-checked`. Selected entries can move
  to the top of the menu.
- Autocomplete may need a keyboard event after `fill_form`; `type_text` with a
  trailing space triggers suggestions. Hover an item to reveal Remove.
- API writes do not refresh the app's cached UI. Fetch list contents or reload
  the place to read current state.
- HTTP 400/403 usually requires checking the operation token and payload.
  Re-read membership after timeouts before repeating a write.

## Read limits

- Ordinary lists: request up to 500 items. Check returned count and continuation
  `[1]`. A nonempty continuation needs the UI's next-page request format.
- Starred: the search flow can stop at 200 results even when 500 are requested.
  Offset 200 can return none while the UI says “200 or more.” This is not a
  complete account inventory. Changing this search's viewport or country text
  did not filter it in the tests. Use regional `psm` reads to retrieve additional
  places; complete worldwide enumeration remains unverified.
- List rename uses `entitylist/update`; its payload, note clearing, sharing,
  icons, and timestamp restoration are not documented here. Use the UI to capture
  those operations.
