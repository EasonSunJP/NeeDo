# Task 2 — Authoritative standard versus traceless client recall

## Scope completed

- Kept the recall request literal as `mode: "standard"`; the server response now determines the returned client mode.
- Added `traceless_recall` response/SSE decoding and required response action plus message `recallMode` agreement.
- For traceless outcomes, the IM store removes the row, terminalizes local media, rebuilds the visible conversation summary, refreshes bootstrap, and records a deletion precedence barrier that rejects stale history and duplicate events.
- Preserved the standard tombstone and sender draft-restore path.

## RED

Command:

```bash
npm test -- --run src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/pages.test.ts
```

Result: failed as intended with three regressions: the formal adapter rejected `traceless_recall`, the traceless `message.recalled` SSE event became a tombstone instead of a deletion, and a local traceless recall left a recalled row in store history. Existing tests remained green (231 passed, 3 failed).

## GREEN

Command:

```bash
npm test -- --run src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/pages.test.ts
```

Result: passed — 5 files, 234 tests, no warnings.

## Files changed

- `src/features/realtime/api.ts` and `src/features/im/contract.ts`: widened only the authoritative recall result type; request mode remains `standard`.
- `src/features/im/model.ts`: added `traceless` result mode and `traceless_recall` deletion reason.
- `src/features/im/formal-api.ts`: validates authoritative response agreement and converts traceless recall SSE into a deletion update.
- `src/features/im/store.ts`: terminal deletion precedence, local media purge, summary rebuild, and authoritative refresh.
- Focused coverage added in `src/features/realtime/api.test.ts`, `src/features/im/formal-api.test.ts`, `src/features/im/store.test.ts`, and `src/features/im/pages.test.ts`.

## Self-review

- No membership eligibility, mode selector, mock, backend behavior, or standard-recall composer restoration was added or changed.
- Traceless deletion takes precedence before upserts and filters stale history; stale conversation summaries are sanitized during bootstrap refresh.
- `git diff --check` passes.

## Concerns / deferred verification

- No deployment, migration, push, or authenticated browser acceptance was performed.
- A full production build was started twice but did not complete within this environment's 30-second command window; focused tests are the completed verification for this microstep.

## Commit

Pending local commit: `feat(im): remove traceless recalls from chat`
