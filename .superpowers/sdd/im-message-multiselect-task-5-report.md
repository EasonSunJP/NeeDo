# Task 5 — Frontend Contracts, API Adapter, Store, and Forward Selection

## Scope and outcome

Implemented the Task 5 frontend data path for chat-record forwarding, favorites, reads, protected media, batch deletion, and translation. `ImNewConversationPage` now consumes an in-memory pending selection and uses the same server chat-record delivery endpoint for existing and newly created direct conversations.

The backend Task 2/3 public contract omitted the persisted sender-name snapshots required by Task 5. The smallest contract amendment adds `senderNames: string[]` to chat-record summaries, favorites, delivery message metadata, repository mappings, and OpenAPI. Values come only from `senderNamesSnapshot`; no internal identity IDs, live-profile lookup, title parsing, schema change, or migration was added.

## TDD evidence

### RED

Before implementation:

```text
npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/chat-records.test.ts
FAIL: missing ./chat-records module and missing realtime/formal/store chat-record methods
Existing tests at checkpoint: 63 passed
```

Backend contract tests were also made RED by asserting `senderNames` in repository delivery/replay/get/list/favorite results, delivery metadata, HTTP responses, and OpenAPI before the repository/OpenAPI amendment.

### GREEN

```text
npm test -- src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/chat-records.test.ts src/features/im/pages.test.tsx
5 files, 103 tests passed

npm test -- src/features/realtime src/features/im
29 files, 290 tests passed

cd backend && npm test -- tests/im-chat-record.repository.test.ts tests/im-chat-record.service.test.ts tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/im-chat-record-media.storage.test.ts tests/im-message-translation.repository.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation-api.test.ts
8 suites, 132 tests passed

npm run lint
PASS

npm run build
PASS (existing Vite dynamic-import and chunk-size warnings only)

cd backend && npm run lint
PASS

cd backend && npm run build
PASS

git diff --check
PASS
```

Targeted Prettier was run on the changed backend contract files and the two new frontend helper files. Whole-file formatting of `backend/src/api/openapi.ts` would rewrite unrelated legacy formatting, so that broad churn was reverted and only the semantic hunk was retained. The targeted compatible-file check passes; the final diff has no whitespace errors.

## Behavior covered

- Exact backend envelope mapping for summaries, items, favorites, pagination, binary media headers, deletions, and translations.
- Safe positive-integer/UUID/checksum boundaries; unsafe integers, malformed UUIDs, duplicate/empty IDs, and lossy sender snapshots fail before or during mapping.
- `ImMessageType` and `MessageExt` support `chat-record`; formal raw `sendMessage("chat-record")` is rejected so only the server snapshot endpoint can create it.
- Titles use first-seen `senderNames`; previews are two-line/bounded and replace media paths with injected localized placeholders; clipboard text is chronological caller-displayed `sender:content`.
- Pending forward selection remains only in store memory. Success and explicit cancel clear it; failed delivery retains it and reuses the caller idempotency key.
- Real rendered page interactions cover single-message existing target, multi-message newly created target, expired refresh state, cancel/back navigation, and failed-submit retry.
- Batch delete mutates local state only after server success; favorite and translation do not claim optimistic success.

## Files

Frontend:

- `src/api/httpClient.ts`
- `src/features/realtime/api.ts`
- `src/features/realtime/api.test.ts`
- `src/features/im/model.ts`
- `src/features/im/components.tsx`
- `src/features/im/contract.ts`
- `src/features/im/chat-records.ts`
- `src/features/im/chat-records.test.ts`
- `src/features/im/formal-api.ts`
- `src/features/im/formal-api.test.ts`
- `src/features/im/store.ts`
- `src/features/im/store.test.ts`
- `src/features/im/pages.tsx`
- `src/features/im/pages.test.tsx`
- `src/features/im/pages.test.ts`

Minimal backend contract amendment:

- `backend/src/repositories/im-chat-record.repository.ts`
- `backend/src/api/openapi.ts`
- `backend/tests/im-chat-record.repository.test.ts`
- `backend/tests/im-chat-record.service.test.ts`
- `backend/tests/im-chat-record-api.test.ts`
- `backend/tests/im-chat-record-openapi.test.ts`

## Risks and deferred scope

- Task 6 card/detail rendering and Task 7 multi-select menu visuals are intentionally not implemented here.
- No database, real API, browser data, schema, migration, or Task 1–4 backend semantics were changed.
- The production build retains pre-existing bundle warnings; this Task does not expand the configured warning threshold.

## Review remediation — 2026-08-31

The Critical/Important/Minor review findings were resolved in a follow-up TDD cycle:

- Media preview policy now derives from the parsed source policy. Image and voice locator content is never copied and renders as `[图片]` / `[语音]`; authoritative TEXT, including an ordinary user-authored HTTP(S) URL, remains bounded text. Create, replay, get, list, favorite, and delivery-shaped results assert the original media URL is absent.
- Chat-record and batch path/body/query IDs use safe positive integers after coercion. The service boundary also rejects unsafe conversation/message/favorite/cursor/page values. OpenAPI documents `Number.MAX_SAFE_INTEGER` for the affected ID schemas and parameters.
- Conversation summaries are rebuilt unconditionally from the remaining messages after successful delete; empty conversations clear last-message fields, unread count, and mention markers. Successful forward immediately uses the authoritative server message as last.
- Forward mode renders eligible existing direct/group conversations separately from contacts. Existing targets forward directly; contacts create only new direct targets. A resolved new-direct target is cached across delivery retry.
- Idempotency keys are scoped to resolved target conversation IDs. Same-target retry reuses the key, switching targets creates a new key, a synchronous in-flight ref blocks same-tick double clicks, and in-flight back/cancel is ignored. An operation generation prevents late UI effects after unmount.
- The formal adapter uses strict shared exact-key, bounded-string, safe-integer, date, page, summary, favorite, item, and message-metadata parsing. Delivery bundle/message public ID, item count, preview, sender snapshots/count, title/title kind, and message content must agree; malformed `chat-record` metadata rejects the whole response.
- Protected media accepts only the backend's six MIME types, exact decimal `Content-Length` equal to the Blob size, strong checksum ETag, and exact private immutable caching. Invalid 200 responses become `ApiClientError`; non-2xx JSON behavior remains unchanged and no Blob URL is created.

### Follow-up RED

```text
backend media/safe-ID: 3 suites, 7 new failures before implementation
frontend formal/binary: 2 files, 9 new failures before implementation
store: 3 failures of 25 (forward summary, delete-last, delete-all)
rendered forward picker: 6 failures of 9 focused cases
OpenAPI safe-integer contract: 1 failure of 4
formal delivery/page consistency: 2 focused failures
```

### Follow-up GREEN and verification

```text
npm test -- src/features/im/formal-api.test.ts src/features/realtime/api.test.ts src/features/im/store.test.ts src/features/im/pages.test.tsx src/features/im/chat-records.test.ts
5 files, 119 tests passed

npm test -- src/features/im src/features/realtime
29 files, 308 tests passed

cd backend && npm test -- tests/im-chat-record.service.test.ts tests/im-chat-record.repository.test.ts tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/im-chat-record-schema.test.ts tests/realtime-service.test.ts tests/message-batch-delete.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation.repository.test.ts tests/im-message-translation-api.test.ts
10 suites, 186 tests passed

npm run lint
PASS

cd backend && npm run lint
PASS

npm run build
PASS (existing Vite dynamic-import and chunk-size warnings only)

cd backend && npm run build
PASS

git diff --check
PASS
```

An attempted broad Prettier invocation was stopped when `npx` produced no output, and the available backend Prettier was then found to rewrite unrelated legacy formatting (9,060 additions / 3,119 deletions). Those formatter-only changes were backed up, fully reverted, and the review semantics were replayed as a focused 18-file diff (about 767 additions / 135 deletions before this report update). No formatter churn is retained.

## Second review remediation — 2026-08-31

This follow-up supersedes the first-review statements about `Number.MAX_SAFE_INTEGER`, source-conversation exclusion, and clearing unread/mention state:

- A shared Zod union now accepts either a numeric positive integer or a canonical decimal string matching `^[1-9]\\d*$`, then enforces the actual Prisma `Int` maximum `2_147_483_647`. Chat-record and batch validators, both service boundaries, the formal client ID boundary, and OpenAPI use the same database limit. Fractional/lossy numbers, exponent strings, leading-zero strings, and values above the database maximum are rejected across target/source conversation, message, cursor, page, favorite, and batch boundaries.
- Empty pages beyond the current total remain valid. Non-empty pages must fit `page_size` and their offset plus returned length must not exceed `total`.
- Delivery parsing now validates the raw backend message before mapping: exact supported keys, database-safe message/conversation/sender IDs, target-conversation equality, required `text` transport type with `chat-record` metadata, valid timestamps and lifecycle fields, and consistency of title/content, public ID, item count, preview, sender snapshot/count, and title kind.
- Batch deletion removes server-confirmed deleted messages first. A complete local history rebuilds only last-message fields while preserving authoritative unread/mention state. If the deleted message is the last message of an incomplete history, the store refreshes the formal conversation summary. Refresh failure does not falsify the successful delete: deleted content remains removed, summary content is safely invalidated, unread/mention state is preserved, and pagination is marked for recoverable reload.
- Forward mode includes the source direct/group conversation as a valid existing target. Existing-direct contact de-duplication is computed from every valid store conversation independently of search/display filtering, so source direct chats cannot be offered as duplicate new-direct contacts.

### Second-review RED

```text
backend focused: 4 suites / 101 tests, 8 failures
  validator + four HTTP boundary variants + service + realtime + OpenAPI
frontend focused: 3 files / 100 tests, 8 failures
  formal 2 + store 3 + rendered picker 3
```

The two new partial-history store tests initially reused a cached scoped store because their session IDs were not unique. The harness was corrected to use distinct sessions before evaluating the production behavior; this was a test-isolation defect, not accepted as product RED evidence.

### Second-review GREEN and verification

```text
npm test -- --run src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/pages.test.tsx
3 files, 100 tests passed

npm test -- --run src/features/im src/features/realtime
29 files, 315 tests passed

cd backend && npm test -- --runInBand tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/im-chat-record.service.test.ts tests/realtime-service.test.ts
4 suites, 101 tests passed

cd backend && npm test -- --runInBand tests/im-chat-record.service.test.ts tests/im-chat-record.repository.test.ts tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/im-chat-record-schema.test.ts tests/realtime-service.test.ts tests/message-batch-delete.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation.repository.test.ts tests/im-message-translation-api.test.ts
10 suites, 189 tests passed

npm run lint
PASS

cd backend && npm run lint
PASS

npm run build
PASS (pre-existing Vite dynamic-import and chunk-size warnings only)

cd backend && npm run build
PASS

git diff --check
PASS
```

Targeted backend Prettier check passed for the new constant, validator, chat-record service, and focused chat-record tests. It continued to report whole-file legacy style in `realtime.service.ts`, `openapi.ts`, `im-chat-record-api.test.ts`, and `realtime-service.test.ts`; no `--write` was run because it would reformat unrelated legacy content. ESLint and both TypeScript builds pass, and no formatter-only churn is retained.

## Third review remediation — 2026-08-31

- The shared `PRISMA_INT_MAX` now bounds `RealtimeMessage.id`, `conversationId`, and nullable `senderUserId` in OpenAPI with exact `minimum: 1` / `maximum: 2_147_483_647` assertions. No runtime message route or payload was changed.
- Formal chat-record date-time parsing now requires an RFC3339-shaped full date-time with `T` and `Z`/numeric offset, validates calendar fields without accepting `Date.parse` normalization, requires a finite parse/ISO round-trip, and rejects numeric strings, date-only values, missing zones, and impossible dates.
- Delivery parsing now uses the exact 17-key final OpenAPI `RealtimeMessage.required` contract. It validates database-bounded message/conversation/sender IDs, the target conversation, transport type/content, all required lifecycle/expiry/null fields, recall modes, versions, complete reactions and participant fields, and chat-record metadata/bundle consistency. Unknown message/reaction fields are rejected; participant `role` remains the sole optional OpenAPI field.
- Favorite offset pages and item cursor pages use separate validators bound to the caller's query/defaults. Favorites require an exact full offset page except for a legitimate empty overrun. Items require the requested page size, page 1 without a cursor, page 2+ with a cursor, exact page length, a distinct positive cursor only while more rows remain, and `null` at the terminal page. Cursor values are treated as repository positions, never message IDs.

### Contract evidence and bounded omission

The review text named `readCount`, `isRecalled`, `hiddenForViewer`, `disappearing`, and `sendStatus` as examples. They are not fields in the final backend `RealtimeMessage.required`, `MessagePayload`, either backend `mapMessage`, the frontend `RealtimeMessage`, or any message database output contract. Adding them would change every message API and fabricate values outside Task 5. The strict delivery parser therefore follows the final existing OpenAPI required list exactly; no loose chat-record-only substitute or invented field was added.

### Third-review RED

```text
frontend formal: 1 file / 43 tests, 7 failures
  raw required/reaction 1 + strict date-time 4 + favorites pagination 1 + items pagination 1

backend OpenAPI: 1 suite / 4 tests, 1 failure
  RealtimeMessage ID bounds absent
```

### Third-review GREEN and verification

```text
npm test -- --run src/features/im/formal-api.test.ts
1 file, 44 tests passed

npm test -- --run src/features/im src/features/realtime
29 files, 321 tests passed

cd backend && npm test -- --runInBand tests/im-chat-record-openapi.test.ts
1 suite, 4 tests passed

cd backend && npm test -- --runInBand tests/im-chat-record.service.test.ts tests/im-chat-record.repository.test.ts tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/im-chat-record-schema.test.ts tests/openapi.test.ts
6 suites, 108 tests passed

npm run lint
PASS

cd backend && npm run lint
PASS

npm run build
PASS (pre-existing Vite dynamic-import and chunk-size warnings only)

cd backend && npm run build
PASS

git diff --check
PASS
```

The targeted backend Prettier check passes for `im-chat-record-openapi.test.ts` and continues to identify pre-existing whole-file style in the large legacy `openapi.ts`. No formatter write was run and no unrelated formatting churn is included.

## Final cursor review remediation — 2026-08-31

The prior item cursor validator incorrectly inferred a page offset from `page * page_size`. The repository cannot expose exact `consumed` to the client: it derives `page` from the count at or above an arbitrary position cursor, while soft-deleted positions can leave gaps. The formal adapter now follows the repository's observable invariants only:

- Every raw item is strictly parsed before page validation.
- Returned positions are unique and strictly increasing after the repository's reverse step, remain within `1..100`, and are below `beforePosition` when a cursor was supplied.
- A first request must return page 1 and exactly `min(page_size, total)` rows. A non-terminal first page carries the minimum returned position as `nextCursor`; an exact terminal page uses `null`.
- Cursor requests allow any positive page number. They never derive `consumed`, remaining rows, or terminal state from the page number. Partial and empty pages are terminal with `nextCursor: null`; a full page may also be terminal. Any non-null cursor must be a positive integer exactly equal to the minimum returned position.
- Cursor positions are not message IDs and need not be contiguous. Unaligned cursors and soft-delete gaps are valid.

### Final cursor RED

```text
frontend formal: 1 file / 45 tests, 3 failures
  empty terminal and unaligned cursor were wrongly rejected; nextCursor=7 was wrongly accepted for minimum position 4
```

### Final cursor GREEN and verification

```text
npm test -- --run src/features/im/formal-api.test.ts
1 file, 46 tests passed

npm test -- --run src/features/im src/features/realtime
29 files, 322 tests passed

npm run lint
PASS

npm run build
PASS (pre-existing Vite dynamic-import and chunk-size warnings only)

git diff --check
PASS
```

No backend, formatter, database, API, or stash operation was performed for this final cursor correction.
