# Recording page routes

The static frontend uses hash routes, so a deep link still requests the deployed
`index.html` and does not require a server-side SPA rewrite:

- `#/library` — library overview
- `#/recordings/{encodeURIComponent(item.id)}` — one saved recording/document

The token is the existing stable library item ID, not its editable name, folder,
array position, session ID, authentication credential, or a public share token.
Renaming/moving a file therefore does not change its route. Existing records,
IndexedDB media keys, and per-record revision history keys are not migrated.

## Helper integration contract

`frontend/src/page-routing.ts` exposes:

- `parsePageRoute(hash)`: library, recording with decoded token, or not-found
- `recordingHash(token)`: validates and encodes an existing ID
- `navigatePage(route, { replace?, consumeFreshDemo? })`: updates history and
  immediately notifies subscribers, preserving deployment path, unrelated query
  parameters, and existing host history state
- `subscribePageRoute(listener)`: observes app navigation, manual hash edits,
  browser Back, and browser Forward; returns cleanup and deduplicates native events
- `readFreshDemoNonce(search)` and `resolveInitialPageRoute(hash, search, items)`:
  legacy entry-point compatibility, with explicit hash routes taking precedence

An empty hash resolves to the overview unless a legacy fresh-demo entry selects
its corresponding record. Canonicalize initialization using history replacement;
normal page navigation uses history push. The subscription does not call its
listener immediately: initialize route state explicitly before subscribing.

Resolve a recording token only against an existing, non-trashed library item.
An unknown/deleted token or malformed route must show a missing-page state with
an overview action. It must never create a replacement recording or silently open
a different item. Cancel stale asynchronous IndexedDB loads on route changes.

Legacy `?fresh-demo=nonce` links create at most one `private-fresh:nonce` record
when entering without an explicit hash, then replace the URL with its canonical
recording route and remove only `fresh-demo`. Preserve the existing 100-character
nonce convention and all prior edits/history. Do not recreate a trashed nonce.
Explicit recording or overview hashes take precedence over the legacy parameter.

## Token validation

IDs must be nonempty, at most 512 UTF-16 code units, URI-encodable strings without
leading/trailing whitespace, path separators, query/hash delimiters, or ASCII
control characters. Dot and dot-dot IDs are rejected. Percent decoding happens
exactly once; malformed percent escapes and invalid UTF-8 fail closed. Unicode,
internal spaces, literal percent characters, colons, UUIDs, and existing demo IDs
round-trip without modification.

## Storage limits and verification

A route reopens data only in the same browser profile and deployment origin where
it was saved. Copying the URL to another device/browser does not share the audio
or document. Clearing browser storage can make a valid-looking URL unavailable.
Routes confer no access control, public hosting, cross-device sync, or permanence.

Run `cd frontend && npm test -- src/page-routing.test.ts` for helper tests covering
encoding, malformed paths, legacy query precedence, preserved subpaths/query/state,
subscription cleanup and deduplication, and browser Back/Forward navigation.
