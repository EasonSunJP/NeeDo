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

## Review Remediation

### Lifecycle audit and Critical fix

The formal runtime paths that clear or hard-delete shared message content are:

- standard recall in `backend/src/repositories/realtime.repository.ts`, which clears the authoritative body and marks the message recalled;
- privacy expiry in `backend/src/repositories/im-privacy-expiry.repository.ts`, which clears the body and then hard-deletes the message after sync/audit bookkeeping.

Both paths now delete every `ImMessageTranslation` row for the message inside the same existing transaction, before clearing content or deleting the message. Privacy expiry explicitly requests `Serializable`; standard recall uses its existing transaction without an explicit isolation override. In each path, the lifecycle claim, translation deletion, body transition, deletion sync, audit, and applicable unread/reaction cleanup or final hard delete commit or roll back atomically. The `Restrict` foreign key was intentionally retained and no applied migration was edited.

Delete-for-me only writes an identity-scoped tombstone, and clear-history only advances the participant cutoff; neither is a shared-content deletion path and neither should destroy cache rows needed by other identities. Both boundaries are rechecked during translation finalization. `backend/scripts/seed-three-month-simulation.ts` contains simulation-seed cleanup, not a formal runtime recall/privacy path, and was not changed.

Repository transaction-contract tests assert translation rows are deleted before recall content clearing and before privacy-expiry content clearing/hard deletion. They use injected Prisma transaction doubles only. A real MySQL `Restrict` integration check remains deferred to Task 9 or another explicitly authorized database acceptance because this task prohibited database connections and writes.

### Remediation RED

The review fixes began with failing tests:

```text
npm test -- --runTestsByPath tests/deepl-translation.provider.test.ts tests/im-translation-config.test.ts
```

Observed RED: `providerRequestIds` did not exist; successful `null`/primitive DeepL payloads were not safely classified; IANA example hosts, additional loopback/unspecified addresses, and placeholder keys were accepted.

```text
npm test -- --runTestsByPath tests/im-standard-recall.repository.test.ts tests/im-privacy-expiry.repository.test.ts
```

Observed RED: both repositories cleared message content before any translation-row deletion, so the expected transaction call order failed.

```text
npm test -- --runTestsByPath tests/im-message-translation.repository.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation-api.test.ts
```

Observed RED: `finalizeTranslations` and the typed cache-conflict error did not exist; local/cache paths skipped final authoritative validation; provider-period visibility/content changes still returned success; soft-deleted reservations could be revived; and the 33 × 4,000-character case was not chunked. A final micro-RED also proved the transaction contract lacked the exact source alongside its SHA-256 hash (`ExpectedTranslationMessage.source`).

### Remediation GREEN

- A successful DeepL response must now be a non-null object with a translations array whose every item is a non-null object containing string `text`; malformed 2xx payloads map to the typed 503 invalid-response error and cannot leak a native `TypeError`.
- DeepL form bodies are partitioned by the actual UTF-8 byte length of `URLSearchParams.toString()`, never exceeding 128 KiB. The exact boundary and one-byte overflow are tested, as is 33 × 4,000-character splitting. Each row retains the request ID of its own chunk. All chunks and their cardinality must succeed before finalization, so a later-chunk failure writes nothing.
- Provider HTTP runs outside any database transaction. A single short serializable finalization transaction re-resolves the active identity participant, join time, clear cutoff, identity tombstone, conversation/message deletion, recall, purge, expiry, and exact authoritative source plus SHA-256 hash. It validates cache hits and proposed writes, then creates the full write set atomically. Local same-language and ineligible results also traverse this final authoritative path.
- Soft-deleted unique cache reservations are never reset to active. If a hit disappeared or any active/soft-deleted reservation now occupies a proposed key, the whole request returns typed conflict with no new writes.
- Production configuration now normalizes hostnames and rejects IANA `example.com`, `.net`, and `.org` hosts/subdomains, every IPv4 `127/8` address, `0.0.0.0`, IPv6 `::1` and `::`, trailing-dot/bracket variants, and obvious placeholder keys. These checks are required only when the selected provider is `deepl`; development still permits official or custom HTTPS endpoints.
- `IM_TRANSLATION_MONTHLY_CHARACTER_LIMIT` remains present as provider quota-policy metadata. This bounded task deliberately does not invent a local usage ledger; provider quota exhaustion remains represented by DeepL's mapped 456 response.
- The OpenAPI diff was reduced back to semantic additions only relative to baseline: the translation schemas/path and mapped 200/400/401/403/404/409/429/456/503 responses.

Review remediation focused test result:

```text
npm test -- --runTestsByPath tests/deepl-translation.provider.test.ts tests/im-translation-config.test.ts tests/im-message-translation.repository.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation-api.test.ts tests/im-standard-recall.repository.test.ts tests/im-privacy-expiry.repository.test.ts
```

Result: **7 suites passed, 79 tests passed**.

Associated regression result:

```text
npm test -- --runTestsByPath tests/deepl-translation.provider.test.ts tests/im-translation-config.test.ts tests/im-message-translation.repository.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation-api.test.ts tests/im-standard-recall.repository.test.ts tests/im-privacy-expiry.repository.test.ts tests/im-privacy-expiry.service.test.ts tests/im-privacy-message-countdown.repository.test.ts tests/im-message-user-deletion.repository.test.ts tests/message-batch-delete.test.ts tests/im-chat-record-schema.test.ts tests/im-chat-record-migration.test.ts tests/im-chat-record-permissions-migration.test.ts tests/im-chat-record.repository.test.ts tests/im-chat-record.service.test.ts tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts tests/realtime-repository-identity.test.ts tests/openapi.test.ts
```

Result: **22 suites passed, 266 tests passed**.

Static verification after remediation:

```text
npm run lint
npm run build
git diff --check
```

Results: **PASS**, **PASS**, and **PASS**. Targeted Prettier was run only over the changed TypeScript implementation/tests; legacy formatting in the large OpenAPI/realtime repositories was kept out of the final semantic diff where practical.

No real DeepL credential was accessed, no real DeepL request was made, no migration was applied, no database was connected, and no shared data was written during remediation. Real DeepL and real MySQL foreign-key acceptance therefore remain explicitly unclaimed.

## Second Review Remediation

### RED

The second review began by extending the repository, service-race, configuration, and OpenAPI tests, then running:

```text
npm test -- --runTestsByPath tests/im-message-translation.repository.test.ts tests/im-message-translation.service.test.ts tests/im-translation-config.test.ts tests/im-message-translation-api.test.ts
```

Observed RED: **3 suites failed and 14 tests failed**. The shared participant query did not constrain the active `UserIdentity`/`User` binding, production accepted a `.localhost` host and IPv4-mapped IPv6 loopback/unspecified forms, the new local/development placeholder keys were accepted, and the OpenAPI 400 description omitted `error.im.translation_request_too_large`. The existing service mapped a finalization rejection to the intended safe 404, so its new race cases were already green while exposing the missing repository boundary.

An additional placeholder-combination micro-cycle produced **4 expected RED cases** for `development-key:fx`, `dev-key:fx`, `not-a-real-key:fx`, and `local.secret` before the production token/suffix policy was completed.

### GREEN

- The single participant lookup shared by both initial authoritative loading and final short-transaction validation now requires an active participant plus an exact active, non-deleted identity whose `id` and `userId` match the request. Both the participant's required `user` relation and the identity's required `user` relation must resolve to the same active, non-deleted user.
- Repository tests cover provider-period identity deactivation, identity soft deletion, identity reassignment, user deactivation, and user soft deletion. Every case returns `not_found` before cache creation. Service race tests verify the provider may have completed but the full batch still receives the existing safe 404 mapping.
- Production host validation now uses Node's `node:net` `isIP` plus normalized IPv6 words. It rejects localhost subdomains, IPv4-mapped/compatible IPv6 representations of `127/8` and `0.0.0.0`, and retains the earlier IPv4, IPv6, and IANA example-host protections.
- Placeholder validation remains semantic rather than imposing a speculative DeepL key-format regex. Delimited obvious placeholder tokens are rejected, with production-specific exact rejection for `local`, `local-key`, `development`, `development-key`, `dev-key`, and `not-a-real-key`. Disabled-provider defaults and custom development HTTPS configuration remain covered.
- The translation OpenAPI 400 description now documents both strict validation and `error.im.translation_request_too_large`.

Focused GREEN:

```text
npm test -- --runTestsByPath tests/im-message-translation.repository.test.ts tests/im-message-translation.service.test.ts tests/im-translation-config.test.ts tests/im-message-translation-api.test.ts
```

Result: **4 suites passed, 87 tests passed**.

Task 4 plus recall/privacy/realtime/chat-record/OpenAPI regression:

```text
npm test -- --runTestsByPath tests/deepl-translation.provider.test.ts tests/im-translation-config.test.ts tests/im-message-translation.repository.test.ts tests/im-message-translation.service.test.ts tests/im-message-translation-api.test.ts tests/im-standard-recall.repository.test.ts tests/im-privacy-expiry.repository.test.ts tests/im-privacy-expiry.service.test.ts tests/im-privacy-message-countdown.repository.test.ts tests/im-message-user-deletion.repository.test.ts tests/message-batch-delete.test.ts tests/im-chat-record-schema.test.ts tests/im-chat-record-migration.test.ts tests/im-chat-record-permissions-migration.test.ts tests/im-chat-record.repository.test.ts tests/im-chat-record.service.test.ts tests/im-chat-record-api.test.ts tests/im-chat-record-openapi.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts tests/realtime-repository-identity.test.ts tests/openapi.test.ts
```

Result: **22 suites passed, 295 tests passed**.

Static verification:

```text
npm run lint
npm run build
git diff --check
```

Results: **PASS**, **PASS**, and **PASS**. Targeted Prettier reported every second-review TypeScript target unchanged. No database, migration, shared-data write, real credential, or real DeepL request was used; real MySQL relation/FK behavior and real DeepL acceptance remain unclaimed.
