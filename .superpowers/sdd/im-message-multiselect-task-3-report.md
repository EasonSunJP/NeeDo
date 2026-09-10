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

---

## Independent-review remediation — 2026-08-31

The first Task 3 review was not approved. This follow-up addresses every Critical/Important finding and the requested Minor test coverage without changing schema, migration, shared send lifecycle, or Task 2 media behavior.

### Review findings verified

1. `nextCursor` was based only on `rows.length === pageSize`. A complete result whose total equaled the page size, or a final subsequent page that was exactly full, incorrectly returned a cursor even though no active row remained.
2. Four mutation success responses in OpenAPI were descriptions only and did not describe the actual `{ code, message, data }` JSON envelope or replay/result payloads.
3. OpenAPI omitted actual 400 validation responses for public UUID, checksum, and favorite ID boundaries, and the binary media response omitted `Content-Length`.
4. Batch HTTP coverage did not directly assert 200, 400, 404, and 409 responses, and route composition was only exercised with a fully injected service.

### Remediation RED

Tests were changed before production code.

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record.repository.test.ts tests/im-chat-record-openapi.test.ts tests/im-chat-record-api.test.ts
```

Result: exit 1. `im-chat-record-api.test.ts` passed while the two intended suites failed:

- Repository failures: expected `nextCursor: null`, received `5` for `total === pageSize`; expected `null`, received `1` for an exactly-full final subsequent page.
- OpenAPI failures: missing four result schemas, missing `Content-Length`, mutation success responses had no JSON content/schema, and UUID/checksum/ID routes were missing 400 responses.

### Minimal implementation

- Changed the cursor continuation condition to `consumed + rows.length < total`. This uses the same active-row counts that derive the deterministic page number, so soft-deleted position gaps and exact full-page boundaries are handled consistently.
- Added exact OpenAPI result components:
  - `ImChatRecordDeliveryResult`
  - `ImChatRecordFavoriteMutationResult`
  - `ImChatRecordFavoriteDeleteResult`
  - `ImBatchDeleteResult`
- Wired forward 201, favorite 201, favorite delete 200, and batch delete 200 through the existing standard `jsonDataResponse` envelope.
- Added documented 400 responses for invalid chat-record UUID, cursor/page size, checksum, favorite ID, strict command bodies, and conversation/message batch IDs.
- Added `Content-Length` to the protected media 200 response.

### Added tests

- Repository:
  - active total exactly equals first page size → no cursor;
  - final subsequent page exactly full → no cursor;
  - prior active-row/soft-deleted-gap first and subsequent page test retained.
- OpenAPI:
  - exact standard success envelope `$ref` for all four mutations;
  - exact replay/bundle/message/favorite/deleted/batch result components;
  - validation 400 on all eight operations;
  - binary media `Content-Length` plus existing MIME/ETag/cache checks.
- Batch HTTP:
  - 200 standard envelope and precise result;
  - 400 duplicate IDs and invalid UUID before service;
  - safe 404 unavailable message;
  - 409 changed-payload idempotency reuse;
  - existing atomic rollback 500 coverage retained.
- Composition:
  - direct production `createApp` route composition using injected repository, storage, and personal-identity-scope ports with the real `ImChatRecordService` and controller; verified protected bundle/media calls and identity-scoped arguments.

### Remediation GREEN

Focused review set:

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record.repository.test.ts tests/im-chat-record-openapi.test.ts tests/im-chat-record-api.test.ts
```

Result: exit 0; 3 suites passed, 44 tests passed.

Formal Task 3 API/RBAC/OpenAPI set:

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/message-batch-delete.test.ts tests/realtime-api.test.ts tests/realtime-service.test.ts
```

Result: exit 0; 5 suites passed, 85 tests passed.

Affected domain/realtime regression set:

```bash
cd backend
npm test -- --runTestsByPath tests/im-chat-record.repository.test.ts tests/im-chat-record.service.test.ts tests/im-chat-record-media.storage.test.ts tests/im-message-send.transaction.test.ts tests/im-message-user-deletion.repository.test.ts tests/im-privacy-message-countdown.repository.test.ts tests/friendship-removal.repository.test.ts tests/realtime-identity-scope.test.ts tests/realtime-repository-identity.test.ts tests/realtime-event-gateway.test.ts
```

Result: exit 0; 10 suites passed, 93 tests passed.

Static and formatting checks:

```bash
cd backend
npm run lint
npm run build
git diff --check
npx prettier --check src/repositories/im-chat-record.repository.ts tests/im-chat-record.repository.test.ts tests/im-chat-record-openapi.test.ts tests/im-chat-record-api.test.ts
```

Result: all exit 0; all targeted files use Prettier style.

### Follow-up self-review

- The cursor condition is strict: a cursor exists only when active rows remain after the rows already consumed and returned.
- Page calculation and cursor continuation use the same active-row count basis; no position arithmetic or client page input is used.
- Mutation OpenAPI schemas mirror controller/service results, including replay flags and standard envelope fields.
- All eight operations document validation failures arising from their actual Zod path/query/body validators.
- The new composition test exercises the production route factory with repository/storage/scope ports and does not add test-only production behavior.
- No RBAC permission, identity boundary, atomicity rule, audit content, schema, migration, or database state was relaxed or modified.

### Remaining concerns

- The repository-wide Prettier baseline concern remains unchanged: unrelated existing files fail the broad check, while every file modified in this remediation that can be checked without reformatting the large legacy OpenAPI file passes targeted formatting. ESLint, TypeScript build, and diff whitespace checks pass.
- Database integration remains intentionally unexecuted because applying/connecting the database was explicitly prohibited.
