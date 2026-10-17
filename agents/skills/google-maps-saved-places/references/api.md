# Google Maps API reference

`scripts/protocol.js` implements everything here. Read this file to debug or
extend the client, not for routine work. All indices are zero-based. All
routes are `GET https://www.google.com/...` with `authuser`, `hl`, `gl`, and an
encoded `pb` query parameter. Cookies authenticate the request, so run requests
inside the signed-in Maps tab.

## Page state

`connect()` parses the inline script that sets `window.APP_OPTIONS`:

| Source | Value |
|---|---|
| `var kEI='...'` | Session ID used in every request context |
| `window.APP_OPTIONS[3][0]` | Search URL carrying `authuser`, `hl`, `gl` |
| `window.APP_OPTIONS[28]` | Token table; values look like `AMAbHI...:1792242512082` |

Tokens are operation-specific. Indices verified on Maps build `20261013`
(`APP_OPTIONS[1]`):

| Index | Operation |
|---|---|
| `2` | `placeactions/writeaction` (star / unstar) |
| `25` | `entitylist/delete` |
| `26` | `entitylist/deleteitem` |
| `27` | `entitylist/create` |
| `28` | `entitylist/createitem` |
| `30` | `entitylist/updateitem` |

A wrong token returns HTTP 400 without side effects. To remap after a Maps
update, create a test list and try each `AMAbHI`/`AL2DP1` table entry in turn
for `create`. Then try the others for `createitem`, `updateitem`, `deleteitem`
and `delete` on that list, and for `writeaction` on a coordinate pin in open
ocean. Never test on the user's existing places. Update `tokenIndex` in
`protocol.js`.

## Encoding

| Token | Value |
|---|---|
| `!NsTEXT` | String field N |
| `!NzBASE64URL` | UTF-8 string as unpadded base64url (`stringField`) |
| `!NeVALUE` / `!NiVALUE` / `!NbVALUE` | Enum / integer / boolean |
| `!NyVALUE` | 64-bit integer as decimal text |
| `!NdVALUE` | Floating-point value |
| `!NmCOUNT...` | Message; COUNT is the number of flattened descendant tokens |

Use `message(field, ...parts)` so nested counts stay correct. Feature IDs are
unsigned 64-bit pairs: hex `0x...:0x...` in place reads and star writes, and
decimal strings in list items. Convert with `featureHex` / `featureDecimal`;
never use `Number` or `parseInt`.

Responses start with the `)]}'` anti-XSSI prefix; `parseJSON` removes it.

## Contexts

```text
LIST_CONTEXT = !1sSESSION!7e81!28e2
STAR_CONTEXT = !3m2!1sSESSION!7e81
```

## Reads

| Read | Route | `pb` |
|---|---|---|
| Inventory | `/locationhistory/preview/mas` | `!2m2!1sSESSION!7e81!7m1!1i50!12m1!1i50!15m1!1i50!23m2!1i50!3b1!24m2!1i50!3b1!38m2!1i50!3b1` |
| List | `/maps/preview/entitylist/getlist` | `LIST_REF!2e2!3e2!4i5000` + `message(6, LIST_CONTEXT)` + `!8i3!16b1` |
| Place | `/maps/preview/place` | `!1m1!1sHEX_FEATURE_ID` |

Inventory: owned lists at `data[29][3]`, followed lists at `data[30][3]`,
labeled places (Home, Work, custom labels) at `data[19]`. It has no Starred
section. The Maps Starred view uses a paged, viewport-bound `/search` (`!1zKg`,
`!7i20`) that caps results, so the client does not use it. Each
row has `[id, kind, flags]` at `row[0]`, the name at `row[4]`, and the count at
`row[12]`. `listReference({ id, kind, flags })` builds `LIST_REF`, for example
`!1m2!1sID!2e1` or `!1m6!1sID!2e5!3m1!1e15!3m1!1e1`. New custom lists use kind `1`.

List: record at `data[0]`, items at `data[0][8]`, count at `data[0][12]`,
page token at `data[1]` (empty when complete). `!4i` is the page size. Google
caps lists at 500 entries and the web app requests 500, so one page of 5000
covers every list. Sending the token back is unsolved: `!5s` returns
`[null, null, [0, LIST_ID]]` with no items, `!13s` returns `[null, null, [2, ""]]`,
and other fields ignore it. Item fields: `[1][5]`
coordinates `[null, null, lat, lng]`, `[2]` name, `[3]` note, `[8]` membership
key `[[1], [ID_1, ID_2]]` or `[[1], null, [null, null, lat, lng]]`.

Place: record at `data[6]`. `[11]` name, `[9][2..3]` coordinates, `[18]` full
address, `[2]` address lines, `[30]` time zone. The country code is at `[243]`,
`[183][1][6]`, or `[88][2][1]`, often in only one of them and sometimes in none.
The last address line can be the country, a postal code, or a country with a
postal code. `[25][15]` holds current memberships: a list row has
`row[0][0] = [type, listId]`, and Starred is the row with `row[1] === "STARRED"`.
Some saved places return a stub record with only fields `0`–`1`; `place()`
throws for those. Coordinate pins have no place record.

## Writes

| Operation | Route | `pb` |
|---|---|---|
| Create list | `entitylist/create` | `stringField(3, name)` + `message(5, LIST_CONTEXT)` + `!9sTOKEN` |
| Add item | `entitylist/createitem` | `LIST_REF` + `message(2, itemBody(point))` + `message(3, LIST_CONTEXT)` + `!4sTOKEN` |
| Set note | `entitylist/updateitem` | `LIST_REF` + `noteBody(point, note)` + `message(3, LIST_CONTEXT)` + `!4sTOKEN` |
| Remove item | `entitylist/deleteitem` | Same as add item, with its own token |
| Delete list | `entitylist/delete` | `LIST_REF` + `message(2, LIST_CONTEXT)` + `!3sTOKEN` |
| Star / unstar | `placeactions/writeaction` | `message(1, "!1sTOKEN")` + `message(2, "!1e1", LOCATION, "!8eSTATE")` + `STAR_CONTEXT` |

Star state is `0` to star and `2` to unstar. `LOCATION` is
`message(3, "!1s" + HEX_ID, stringField(2, name))` for a named place and
`message(3, message(4, "!3dLAT!4dLNG"))` for a coordinate pin.

Responses: `create` returns the new ID at `[0][0][0]`, with kind `0` until it
settles to `1`. `createitem` and `updateitem` return `[]`. `deleteitem` returns
the removed item. `writeaction` returns `[0, ...]` on success.

List rename (`entitylist/update`) and sharing are not implemented.
