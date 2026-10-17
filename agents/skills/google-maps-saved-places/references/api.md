# Google Maps API reference

All response indices are zero-based. Execute requests inside the signed-in Maps
tab against `https://www.google.com`.

## Request setup

Load `scripts/protocol.js` with browser MCP `evaluate_script`, using its absolute
`sourcePath` and `format: "script"`:

```js
const p = globalThis.googleMapsSavedPlacesProtocol
const originalFetch = window.fetch.bind(window)

async function request(path, pb) {
  const url = new URL(path, location.origin)
  for (const key of ["authuser", "hl", "gl"]) url.searchParams.set(key, params[key])
  url.searchParams.set("pb", pb)
  const response = await originalFetch(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  })
  return { status: response.status, text: await response.text() }
}
```

Set `params` from a captured Maps request. Ordinary-list payloads use:

```text
CONTEXT = !1sSESSION!7e81!28e2
```

Extract `SESSION` and each operation's token from its current UI request.
Tokens are operation-specific but can be reused across lists for that operation
within the session. A token from list creation does not work for item creation.
Starred uses its own captured context message.

## Encoding

| Token | Value |
|---|---|
| `!NsTEXT` | String field N |
| `!NzBASE64URL` | UTF-8 string as unpadded base64url |
| `!NeVALUE` | Enum |
| `!NiVALUE` | Integer |
| `!NyVALUE` | 64-bit integer as decimal text |
| `!NdVALUE` | Floating-point value |
| `!NmCOUNT...` | Message with COUNT flattened descendant tokens |

Use `p.message(field, ...parts)` to count nested tokens. Use
`p.stringField(field, text)` for names and notes, including Unicode and `!`.
It produces `z` fields. `URLSearchParams` encodes the complete `pb` value.

Feature IDs are 64-bit strings. Normalize signed decimal IDs with
`p.unsigned64(value)`. Convert hex IDs with `BigInt`, not `Number` or `parseInt`.

## Response parsing

```js
const data = p.parseJSON(text)
const { envelopes, payloads } = p.parseSearchResponse(searchText)
```

`parseJSON` removes the `)]}'` anti-XSSI prefix and newline. Search responses
contain streaming JSON envelopes with a string `d` field, whose contents are
another prefixed JSON value. `parseSearchResponse` handles multiple envelopes
and `/* ... */` separators and returns every decoded data payload.

Search UI results can arrive before XHR `loadend`. Use network inspection or
fetch the captured read URL to obtain the complete response body.

## Inventory

```text
GET /locationhistory/preview/mas?authuser=...&hl=...&gl=...&pb=...
```

Open Saved and reuse the captured request, including viewport and feature flags.

| Path | Value |
|---|---|
| `data[29][3]` | Owned ordinary lists |
| `data[30][3]` | Followed lists |
| `row[0]` | `[id, kind, capabilities, ...]` |
| `row[3]` | Owner information |
| `row[4]` / `[5]` | Name / description |
| `row[10]` / `[11]` | List timestamps |
| `row[12]` | Item count |

Build a list reference from that descriptor:

```js
const list = { id: row[0][0], kind: row[0][1], flags: row[0][2] }
const listRef = p.listReference(list)
```

For kind `1` with capabilities `[[1]]`, this produces:

```text
!1m4!1sLIST_ID!2e1!3m1!1e1
```

Kinds: `1` custom, `2` Favorite places, `3` Want to go, `5` Travel plans,
`6` Saved places. Starred is separate. A newly created custom list can initially
return kind `0`; use its settled kind `1` descriptor for later requests.

## Fetch an ordinary list

```js
const pb = listRef + "!2e2!3e2!4i500" + p.message(6, context) + "!8i3!16b1"
const result = await request("/maps/preview/entitylist/getlist", pb)
const data = p.parseJSON(result.text)
```

| Path | Value |
|---|---|
| `data[0]` | List record |
| `data[0][0]` | List descriptor |
| `data[0][4]` / `[5]` | Name / description |
| `data[0][8]` | Items |
| `data[0][12]` | Declared count |
| `data[1]` | Continuation; empty string for a complete result |

`!4i500` requests 500 entries. For a continuation or count mismatch, capture the
UI's next-page query; its cursor format is not included here.

### Item fields

| Path | Value |
|---|---|
| `item[1][4]` | Address |
| `item[1][5]` | `[null, null, latitude, longitude]` |
| `item[1][6]` | Feature-ID pair; absent for coordinate-only pins |
| `item[1][7]` | Optional `/g/...` or `/m/...` entity ID |
| `item[2]` / `[3]` | Name / list note |
| `item[8]` | Membership key |
| `item[9]` / `[10]` | Item timestamps |

Membership keys are `[[1], [ID_1, ID_2]]` or
`[[1], null, [null, null, lat, lng]]`. `p.itemIdentity(item)` returns a normalized
feature or coordinate key. Extra trailing fields can contain icons or emoji.

## Ordinary-list writes

Each route uses GET. Use a separate token for each operation.

| Operation | Route under `/maps/preview/entitylist/` | `pb` |
|---|---|---|
| Create list | `create` | `p.stringField(3, name) + p.message(5, context) + "!9s" + tokens.create` |
| Add item | `createitem` | `listRef + p.message(2, p.itemBody(point)) + p.message(3, context) + "!4s" + tokens.createitem` |
| Set note | `updateitem` | `listRef + p.noteBody(point, note) + p.message(3, context) + "!4s" + tokens.updateitem` |
| Remove item | `deleteitem` | `listRef + p.message(2, p.itemBody(point)) + p.message(3, context) + "!4s" + tokens.deleteitem` |
| Delete list | `delete` | `listRef + p.message(2, context) + "!3s" + tokens.delete` |

Point inputs:

```js
const named = {
  name: "Landmark",
  lat: 1.25,
  lng: -2.5,
  featureIds: ["9223372036854775808", "18446744073709551615"],
}
const pin = { name: "Pin", lat: 1.25, lng: -2.5 }
```

Map a returned item to this shape using its coordinates, name, and feature IDs.
Omit `featureIds` for a coordinate-only key.

`p.itemBody(point)` builds the inside of root message `2`:

```text
message(2,
  message(6, !3dLAT!4dLNG)
  + message(7, !1yID_1!2yID_2))
+ stringField(3, NAME)
+ message(9,
    message(1, !1e1)
    + message(2, !1yID_1!2yID_2))
```

For coordinate pins, the location omits message `7`, and the item key uses
`message(3, !3dLAT!4dLNG)` instead of the feature-ID message `2`.

`p.noteBody(point, note)` already includes root message `2`:

```text
message(2, message(1, ITEM_KEY_BODY) + stringField(2, NOTE))
```

Copy notes explicitly with `updateitem` when moving between lists. Starred
does not automatically retain or restore those notes.

### Responses

| Operation | Response after prefix removal |
|---|---|
| `create` | List record; server-issued ID at `[0][0][0]` |
| `createitem`, `updateitem` | `[]` |
| `deleteitem` | Removed item data |
| `delete` | Deleted-list descriptor |

Read list contents after writes to obtain current membership and notes. List
rename uses `entitylist/update`; capture that operation's payload from the UI.

## Fetch Starred

```text
GET /search?tbm=map&authuser=...&hl=...&gl=...&q=*&pb=...&tch=1&...
```

Open Starred and capture the full query. `q=*` alone is not the Starred filter.

| Root `pb` field | Value |
|---|---|
| `!7iN` | Page size |
| `!8iN` | Offset; absent on the first page |
| `!54m1!1e4` | Starred view |

The UI requests 20 entries per page. Preserve other fields when changing root
size or offset; nested messages reuse the same field numbers.

Decode with `p.parseSearchResponse(text)`. Within each data payload:

| Path | Value |
|---|---|
| `data[64]` | Place rows |
| `row[1][10]` | Hex feature ID |
| `row[1][11]` | Name |
| `row[1][9][2]` / `[3]` | Latitude / longitude |
| `row[1][18]` | Address |
| `data[16][3][0][4]` | Compact rows; each `[0]` contains feature-ID pairs |
| `data[32][5]` | Display count; can saturate at 200 |

This flow can cap results at 200: requesting 500 returns 200, and offset 200
returns no records. The UI can still say “200 or more.” Changing the viewport or
country text returned the same first 200 in the tests. Use the regional `psm`
tile workflow in [tiles.md](tiles.md) to retrieve additional saved markers.
Complete worldwide enumeration remains unverified. `getlist` with kind `4`
does not provide a Starred list.

## Star / unstar

```text
GET /maps/preview/placeactions/writeaction?authuser=...&hl=...&gl=...&pb=...
```

Set `state` to `0` for star or `2` for unstar. Both use action enum `!1e1`.

### Named place

```js
const action = p.message(2,
  "!1e1",
  p.message(3, "!1s" + featureId, p.stringField(2, nameAndAddress)),
  "!8e" + state,
)
const pb = p.message(1, "!1s" + token) + action + starContext
```

`featureId` is the full hex pair `0x...:0x...`.

### Coordinate pin

```js
const action = p.message(2,
  "!1e1",
  p.message(3, p.message(4, "!3d" + lat + "!4d" + lng)),
  "!8e" + state,
)
const pb = p.message(1, "!1s" + token) + action + starContext
```

Coordinate writes contain no feature ID or name field. `starContext` is the
complete captured root message `3`, including session and event fields. It is
different from the ordinary-list context. Capture star and unstar templates
separately.

Responses begin with a result code `0`, usually followed by a place URL.
Read current starred state through a fresh place Save menu or the Starred read.

## Resumable Starred → list helper

Use `scripts/move.js` for bulk moves instead of rebuilding protobuf requests in
the conversation. Load `protocol.js` first, then `move.js`, through
`evaluate_script` with `sourcePath` and `format: "script"`.

### Capture templates while moving the first place

```js
const m = globalThis.googleMapsSavedPlacesMove
globalThis.moveCapture = m.capture()
```

Open the destination list to capture `getlist`. Add the first requested place
through its Save menu. Wait for the addition response and verify destination
membership, then remove its star. These are real steps of the requested move,
not disposable test edits. Capture before those steps so their templates are
available without searching the whole network log afterward.

```js
globalThis.moveTemplates = moveCapture.stop()
Object.keys(moveTemplates) // readURL, addURL, unstarURL
```

Capture observes page fetch and XHR calls. It does not observe worker requests
or operations performed before capture started. When a key is missing, obtain
that operation's URL with browser network inspection. Do not redo a successful
write merely to capture it. Templates remain in memory and retain repeated
query parameters, operation tokens, and opaque context fields.

### Run the remaining moves

```js
globalThis.moveJob = m.create({
  templates: moveTemplates,
  points: confirmedPoints, // name, lat, lng, optional featureIds
  storageKey: "maps-move-current-trip",
})
await moveJob.run()
```

Supply only confirmed candidates. Keep feature IDs as decimal strings. Omit
`featureIds` for coordinate pins. Do not include `note`; restore any retained
notes through the manual workflow before removing stars. Exclude places already
fully moved and verified during capture; report those separately from the job.

The helper validates routes, accounts, destination identities, and nested message
lengths before sending requests. It replaces only the action message and retains
the captured context and operation token. It uses the complete captured unstar
template, not a star template. Named-place writes derive exact hexadecimal IDs
from the decimal pair; coordinate writes contain no feature IDs.

`run()` reads the destination once, skips existing memberships, adds missing
places, and reads again if it added anything. It refuses incomplete list reads,
including nonempty continuation cursors or count mismatches. Paginate manually
or use the UI when the destination cannot be read completely. If an addition is
not visible in the verification read, it stops without removing stars. Run again
after a fresh read rather than repeatedly sending additions.

### Verify and report

Without a `readStarred` callback, successful unstar replies increase
`acknowledged`, not `completed`. Check each affected place's fresh Save menu,
then record the observation:

```js
moveJob.report() // total, acknowledged, completed, places
moveJob.confirmUnstarred(observedIdentity)
```

Use the exact `identity` from `report().places`. Call `confirmUnstarred` only
after observing that Starred is unchecked in a fresh menu. A missing marker or
tag, or absence from a capped search, is not sufficient evidence. Confirmation
updates the checkpoint. Stop when all affected identities are verified.

When a reliable read is available, pass `readStarred: async point => ...` to
`create()`. Return `true` for confirmed Starred membership, `false` for confirmed
nonmembership, or `null` when unknown. The helper calls it after writes and before
retrying an interrupted unstar. The callback must read current state, not reuse
pre-move observations. `onProgress: report => ...` optionally receives progress
after checkpoints; it must not throw.

### Resume after interruption or navigation

```js
globalThis.moveJob = googleMapsSavedPlacesMove.create({
  templates: freshTemplates,
  storageKey: "maps-move-current-trip",
  readStarred: readCurrentStarredState,
})
await moveJob.run()
```

Reload both scripts after navigation. Omit `points` to restore candidates from
the checkpoint. Use the same working tab because `sessionStorage` survives its
navigations, not closing the tab. Before intentionally closing it, retain a
token-free checkpoint in approved task storage if recovery in another tab is
needed. Do not close the working tab during a move.

The checkpoint stores destination identity, account index, candidates, and
per-place progress. It never stores request URLs or tokens. Supply current
templates after navigation; recover their URLs through network inspection when
the in-memory capture is gone. Do not reverse completed moves to recapture tokens.
A different account, destination, or candidate set requires a different
`storageKey` so an existing job is not overwritten.

On resumption, the helper reads destination membership before deciding whether
to repeat an addition. An uncertain unstar requires a fresh Starred read. If
that read returns `null`, the helper pauses rather than blindly repeating the
write. Confirm removal through a fresh Save menu or provide a reliable callback.

### Local tests

```sh
node --test agents/skills/google-maps-saved-places/tests/*.test.js
```

Run from the dotfiles repository root. Tests use synthetic requests and a fake
Maps backend. They do not access the account or change saved places. Live API
compatibility still requires a separately authorized check.
