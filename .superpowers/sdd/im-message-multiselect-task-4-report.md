# Task 4 Report: Replaceable IM Message Translation

## Outcome

Implemented the bounded Task 4 backend slice for authoritative IM message translation:

- replaceable `TranslationProvider` contract with disabled and DeepL API Free implementations;
- injected HTTP transport, abort timeout, bounded exponential jitter retry, and typed provider errors;
- identity-scoped authoritative message loading plus successful translation cache reads/writes;
- exact-source SHA-256 cache identity and ordered, duplicate-safe batch translation;
- strict protected `POST /api/v1/im/conversations/:conversationId/messages/translations` API;
- production composition injection, environment validation, RBAC, and OpenAPI response contracts.

No client raw text is accepted. The service loads all requested messages under the resolved current identity and rejects the complete batch with 404 if any message is unavailable. Only user-authored text and image/video captions are eligible.

## RED / GREEN Evidence

### RED

Tests were written before production implementation in:

- `backend/tests/deepl-translation.provider.test.ts`
- `backend/tests/im-translation-config.test.ts`
- `backend/tests/im-message-translation.service.test.ts`
- `backend/tests/im-message-translation-api.test.ts`

Initial command:

```text
cd backend
npm test -- --runTestsByPath tests/deepl-translation.provider.test.ts tests/im-translation-config.test.ts
```

Observed RED:

- `TS2307`: `deepl-translation.provider` did not exist;
- translation environment fields/defaults did not exist;
- invalid DeepL configurations were not rejected.

After the first provider/config implementation, the provider suite passed while the config suite exposed that optional keys were omitted from the parsed object rather than represented as explicit `undefined`. The configuration export was corrected and the suite became green.

### GREEN

Task 4 verification:

```text
npm test -- --runTestsByPath tests/deepl-translation.provider.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation-api.test.ts tests/im-translation-config.test.ts
```

Result: **4 suites passed, 37 tests passed**.

The tests cover:

- DeepL `ZH-HANS`, `ZH-HANT`, `JA`, `EN`, and `KO` target mapping;
- `DeepL-Auth-Key` header and form-encoded repeated `text` fields;
- timeout abort, bounded 429 retry/jitter, 456 quota, and 5xx unavailable mappings;
- no API key exposure through returned errors;
- Kana-to-Japanese and Hangul-to-Korean local short circuits only;
- provider calls for ambiguous Han-only and short Latin input;
- exact caption whitespace hashing, exact cache keys, duplicate text deduplication, and request order;
- full-batch rejection for missing visibility and no cache writes after malformed provider cardinality;
- strict API validation, `message:translate`, standard envelopes, mapped errors, and OpenAPI schemas;
- disabled/DeepL provider selection through route composition.

## Regression and Static Verification

Associated Task 1–3, realtime, and OpenAPI regression command:

```text
npm test -- --runTestsByPath tests/deepl-translation.provider.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation-api.test.ts tests/im-translation-config.test.ts tests/im-chat-record-schema.test.ts tests/im-chat-record-migration.test.ts tests/im-chat-record-permissions-migration.test.ts tests/message-batch-delete.test.ts tests/im-chat-record.repository.test.ts tests/im-chat-record.service.test.ts tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/realtime-api.test.ts tests/openapi.test.ts
```

Result: **14 suites passed, 174 tests passed**.

Additional verification:

```text
npm run lint
npm run build
git diff --check
```

Results: **PASS**, **PASS**, and **PASS**.

Targeted Prettier was run over the modified TypeScript files. A first invocation also named the three `.env.*.example` files and reported that Prettier could not infer a parser for those files; it still formatted the TypeScript targets. The command was rerun with only the TypeScript targets and completed successfully with all files unchanged. The env examples were manually kept in their existing key/value style.

## DeepL Official HTTP Contract Checked

Only official DeepL documentation was used:

- <https://developers.deepl.com/docs/getting-started/auth>: API Free uses `https://api-free.deepl.com`; authentication uses `Authorization: DeepL-Auth-Key ...`; form encoding is supported.
- <https://developers.deepl.com/api-reference/translate/request-translation>: translations are requested with `POST /v2/translate`, repeated input texts preserve response order, and the required target language codes are supported.
- <https://developers.deepl.com/docs/best-practices/error-handling>: 429 should use bounded backoff and 456 represents quota exhaustion.
- <https://developers.deepl.com/docs/best-practices/pre-production-checklist>: retry handling is expected for 429 and transient 5xx responses.

No real DeepL key was read, produced, logged, or sent. All provider acceptance used injected `fetch` doubles; **there was no real DeepL network acceptance**.

## Permission and Persistence Evidence

Task 1 already formally seeds `message:translate` in:

- `backend/src/constants/permissions.constants.ts`;
- `backend/prisma/migrations/20260831160000_im_chat_records_translation/migration.sql`.

That migration assigns the permission to the Task 1 formal realtime roles. The existing `ImMessageTranslation` model provides the required unique key over message ID, exact source hash, target language, and provider key. Task 4 did not alter the schema or migration.

No migration was applied, no database was connected, and no shared data was written.

## Files

Modified:

- `backend/src/config/env.ts`
- `backend/.env.dev.example`
- `backend/.env.staging.example`
- `backend/.env.prod.example`
- `backend/src/constants/error-codes.ts`
- `backend/src/app.ts`
- `backend/src/api/openapi.ts`

Created:

- `backend/src/services/im-translation.provider.ts`
- `backend/src/services/deepl-translation.provider.ts`
- `backend/src/repositories/im-message-translation.repository.ts`
- `backend/src/services/im-message-translation.service.ts`
- `backend/src/controllers/im-message-translation.controller.ts`
- `backend/src/routes/im-message-translation.routes.ts`
- `backend/src/validators/im-message-translation.validator.ts`
- `backend/tests/deepl-translation.provider.test.ts`
- `backend/tests/im-message-translation.service.test.ts`
- `backend/tests/im-message-translation-api.test.ts`
- `backend/tests/im-translation-config.test.ts`

## Residual Risk / Deferred Acceptance

- Live DeepL authentication, real quota behavior, provider latency, and production egress remain unverified because real credentials and real network calls were explicitly out of scope.
- The configured monthly character limit is present for deployment policy; provider-side 456 is mapped, but no new local usage-ledger schema was introduced in this bounded task.
- Repository behavior was statically built and exercised through the service port plus existing Task 1 schema/migration regressions. Database integration acceptance was intentionally not performed because connecting to or writing shared data was prohibited.
- The default provider remains `disabled`; ambiguous translation requests return the typed provider-unavailable response until a validated DeepL configuration is explicitly injected.
