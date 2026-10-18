# Local revision history

`frontend/src/revision-history.ts` maintains immutable full-document revisions. Each has a unique ID, ISO timestamp, change summary, media identity and complete `SavedDocument` snapshot. Word times, annotations, alignment state, import source/version metadata and additional JSON-compatible document fields are preserved. No audio blobs or credentials are duplicated. Data is local to this browser; it is not cloud synchronization or a backup against browser-data deletion.

## Integration

- Use the library item ID as `documentId`; restore `readHistory(id)` or initialize `createHistory(id, savedDocument, mediaIdentity)`.
- Choose a stable media identity which changes on replacing the recording (persisted unique media version ID is preferred). File name/size/lastModified alone can collide. Null identifies a document without audio.
- Before each committed change, keep the previous head. Append the exact new document with `appendRevision`, then `writeHistory`. Same-document no-op appends are deduplicated.
- Surface storage exceptions; never promise persistence after a quota failure. Reads throw on incompatible/corrupt content and do not destroy the original data. Do not silently replace a failed read with a new history.
- `RevisionHistory` renders selection, full paragraph before/after preview, timing/metadata-change indicators and rollback. Callbacks are `onRestore(id)`, `onDelete(ids)`, `onClose()`.
- Restore with `restoreRevision(history, id, currentMediaIdentity)`. It rejects another recording, retains the previous head and creates a new revision. Persist before applying the restored complete document. Clear active editing/localization candidates and increment the application's request generation synchronously before applying restored state.
- For asynchronous alignment capture `revisionToken(history)` before the request, then call `assertCurrentRevision(latestHistory, token)` immediately before applying. Also retain the application's edit-generation guard for draft changes not yet committed. Restoring identical text still gets a different head and invalidates old requests.
- `onDelete` fires only after the component's explicit irreversible-deletion confirmation. Use `deleteRevisions(history, ids, true)`, persist, then update UI. `false` is cancellation and returns the original untouched. The current head is unconditionally retained. Deletion never touches the library document or media store.
- Document undo/redo is separate from immutable archival history: saving must not clear undo/redo; new editing after undo clears redo navigation only. Keep all archived revisions until the user explicitly deletes them. Undo/redo must restore both text and word/audio mapping.

## Verification

`cd frontend && npm test -- --run src/revision-history.test.ts src/RevisionHistory.test.tsx`

Coverage includes immutable exact text/timing snapshots, source version preservation, local save/reload, media mismatch rejection, rollback as a new head, retained pre-rollback version, canceled/confirmed deletion, protection of the current document/media, stale async result rejection, diff detection, corruption/quota errors, preview non-mutation and explicit irreversible-deletion UI.
