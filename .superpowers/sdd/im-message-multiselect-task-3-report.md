# Task 3 Report — Chat-Record HTTP API, Favorites, Batch Delete, RBAC, and OpenAPI

Date: 2026-08-31
Branch: `codex/im-message-multiselect-records`
Starting commit: `230a349d`

## Outcome

Implemented the eight approved authenticated `/api/v1/im/...` operations for chat-record delivery, bundle/item/media reads, favorites, and atomic per-identity batch deletion. The implementation preserves Route → Controller → Service → Repository boundaries, uses strict Zod validation, explicit RBAC, safe not-found equivalence, repository-derived pagination metadata, protected media bytes, replay-safe idempotency, and body-free audit metadata.

No database was connected, no migration was applied, and no shared data was written.

## RED evidence

Tests were added before the production API/batch-delete implementation.

Command:

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/message-batch-delete.test.ts tests/im-chat-record.repository.test.ts tests/im-chat-record.service.test.ts
```

Result: exit 1, expected RED. Failures included the missing chat-record validator/routes, missing `IDEMPOTENCY_KEY_REUSED`, missing `RealtimeRepository.deleteMessagesForUser`, absent OpenAPI paths/schemas, and missing repository `total/page/pageSize` fields.

The authorized pagination extension was also isolated with:

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record.repository.test.ts
```

Result: exit 1, 1 failed / 23 passed. The failing assertion showed that the first/subsequent active-row cursor pages did not yet return repository-derived `total`, `page`, and `pageSize`.

## Implementation

### Chat-record API and RBAC

- Added strict shared message-ID and command validators: positive coerced integers, 1–100 items, duplicates rejected, UUID idempotency keys, and strict unknown-field rejection.
- Added seven chat-record routes and mounted them before the realtime router.
- Declared explicit permissions: `message:forward`, `message:list`, and `message:favorite`.
- Kept controllers free of Prisma and business decisions; they validate/adapt requests and standard response envelopes only.
- Removed internal bundle IDs and recipient delivery details from public delivery/bundle responses.
- Implemented the formal authenticated media route and returned authorized bytes with `Content-Type`, `Content-Length`, checksum ETag, and private immutable caching without serializing storage keys or filesystem paths.

### Cursor pagination extension authorized for Task 3

- Extended `ChatRecordItemPage` to `{ list, total, page, pageSize, nextCursor }`.
- The repository derives `total` from all active bundle items.
- First request is page 1. Subsequent pages derive the consumed row count from active rows at/above the cursor, so soft-deleted position gaps cannot corrupt the 1-based page number.
- The controller alone maps `pageSize` to the HTTP `page_size` field.

### Atomic batch delete and single-delete convergence

- Added `POST /im/conversations/:conversationId/messages/delete-for-me` with `message:list` permission.
- Resolves the current personal identity, participant boundary, conversation clear boundary, and every requested active message before writes.
- Canonicalizes sorted message IDs and hashes `{ conversationId, messageIds }`.
- Resolves `ImMessageBatchDeleteCommand` by current identity plus idempotency key.
- Exact replay returns the persisted result; changed-payload reuse returns 409 `error.idempotency_key_reused` (`40955`).
- Upserts all per-identity tombstones, command result, and exactly one `im.messages.deleted_for_user` audit in one transaction.
- Audit metadata contains only `conversationId`, `count`, and sorted `messageIds`; no message content is persisted.
- Recovers Prisma `P2002` command races by reloading the winner and applying the same replay/conflict rule.
- The legacy single-message DELETE repository method now delegates to the same atomic batch path with one ID.

### OpenAPI

- Added `ImChatRecordSummary`, `ImChatRecordItem`, `ImChatRecordItemPage`, `ImChatRecordFavorite`, `ImChatRecordFavoritePage`, `ImChatRecordCommand`, and `ImBatchDeleteRequest`.
- Documented all eight protected operations, strict request schemas, list envelopes, cursor field, RBAC error responses, idempotency conflict, and the six supported image/voice snapshot MIME types as binary responses.

## Files

Created:

- `backend/src/validators/im-chat-record.validator.ts`
- `backend/src/controllers/im-chat-record.controller.ts`
- `backend/src/routes/im-chat-record.routes.ts`
- `backend/tests/im-chat-record-api.test.ts`
- `backend/tests/im-chat-record-openapi.test.ts`
- `backend/tests/message-batch-delete.test.ts`

Modified:

- `backend/src/api/openapi.ts`
- `backend/src/app.ts`
- `backend/src/constants/error-codes.ts`
- `backend/src/controllers/realtime.controller.ts`
- `backend/src/repositories/im-chat-record.repository.ts`
- `backend/src/repositories/realtime.repository.ts`
- `backend/src/routes/realtime.routes.ts`
- `backend/src/services/realtime.service.ts`
- `backend/src/validators/realtime.validator.ts`
- `backend/tests/im-chat-record.repository.test.ts`
- `backend/tests/im-chat-record.service.test.ts`
- `backend/tests/im-message-user-deletion.repository.test.ts`
- `backend/tests/im-chat-record-schema.test.ts` (one-character regex escape cleanup required by the existing lint rule)

## GREEN evidence

Formal Task 3 API/RBAC/OpenAPI set:

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/message-batch-delete.test.ts tests/realtime-api.test.ts tests/realtime-service.test.ts
```

Result: exit 0; 5 suites passed, 78 tests passed.

Affected chat-record/realtime/domain regressions:

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record.repository.test.ts tests/im-chat-record.service.test.ts tests/im-chat-record-media.storage.test.ts tests/im-message-send.transaction.test.ts tests/im-message-user-deletion.repository.test.ts tests/im-privacy-message-countdown.repository.test.ts tests/friendship-removal.repository.test.ts tests/realtime-identity-scope.test.ts tests/realtime-repository-identity.test.ts tests/realtime-event-gateway.test.ts
```

Result after the final service pagination test: exit 0; 10 suites passed, 91 tests passed.

Static verification:

```bash
cd backend
npm run lint
npm run build
git diff --check
```

Result: all exit 0.

New-file formatting verification:

```bash
cd backend
npx prettier --check src/controllers/im-chat-record.controller.ts src/routes/im-chat-record.routes.ts src/validators/im-chat-record.validator.ts tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/message-batch-delete.test.ts
```

Result: exit 0; all matched files use Prettier style.

## Test coverage highlights

- 401 and route-specific 403 behavior.
- Duplicate, 101-item, invalid-ID, and strict-body 400 validation.
- 201 delivery/favorite responses without internal IDs or recipients.
- Equivalent hidden bundle/media 404 behavior.
- Protected media bytes and security/cache headers.
- Favorite creation, exact replay, changed-payload conflict, pagination, and removal.
- First/subsequent item pages with repository totals and soft-deleted position gaps.
- Batch all-or-nothing rollback, no writes on partial visibility, sorted tombstones, one content-free audit, exact replay, changed-payload conflict, concurrent unique-race recovery, and legacy single-delete delegation.
- Existing message-send transaction, deletion, privacy countdown, identity scope, friendship removal, and realtime event regressions.

## Self-review

- Confirmed no controller imports or directly calls Prisma.
- Confirmed every new route authenticates and declares an explicit permission.
- Confirmed list response adaptation uses standard envelopes and pagination remains repository-derived.
- Confirmed media responses expose neither `fileKey` nor filesystem paths.
- Confirmed batch lookup and writes are identity-scoped, all requested messages must be visible, and audit metadata is body-free.
- Confirmed the idempotency fingerprint is order-insensitive but payload-sensitive and the P2002 recovery path applies the identical replay/conflict check.
- Confirmed the single-delete repository method delegates to the atomic batch path.
- Confirmed no schema, migration, Task 2 send lifecycle, or media-storage behavior was redesigned.
- Confirmed no `TODO`, `FIXME`, `not implemented`, debug log, or controller-side Prisma access was added.
- Removed formatter-only churn from large existing files before final diff review.

## Concerns / deferred environment work

- `npm run format:check` remains red on the repository baseline and reports 242 pre-existing files outside this Task 3 slice. Formatting those files would be an unrelated broad rewrite. New Task 3 files pass targeted Prettier checks; full ESLint, TypeScript build, and `git diff --check` pass.
- The Task 1 migration remains intentionally unapplied. Database integration acceptance is deferred because the task explicitly prohibited connecting/applying a database or writing shared data.
