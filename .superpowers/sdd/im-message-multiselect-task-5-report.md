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
