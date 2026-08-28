# Localized carousel Task 4 report

Status: `DONE_WITH_CONCERNS`

## Scope completed

- Added the formal Official Affiliate announcement repository, service, controller, and routes.
- Registered all ten protected backoffice lifecycle routes and the authenticated Affiliate one-locale detail route.
- Initialized exactly five translations from the first source locale, supported independent locale edits and an atomic service-level copy-to-all operation, and rejected incomplete required content.
- Enforced immutable non-draft translations, optimistic locking, one-draft/one-published/one-scheduled slot keys, immediate publish, future scheduling, disable, clone-for-rollback, and paginated history.
- Stored create/publish/schedule/disable/rollback idempotency commands transactionally. Exact actor-bound fingerprint retries replay the stored result; mismatched reuse returns `error.idempotency_key_reused`; concurrent command-key winners are re-read safely after rollback.
- Wrote status/slot changes, audit evidence, and cached command results in the same Prisma transaction.
- Reused `AffiliateMarketplaceService.getTask` as the task visibility policy. Draft creation validates an optional task only after the repository's replay check; public projection redacts an inaccessible task action.
- Public detail exposes one requested locale and a redacted `taskAction`; it omits numeric release/task IDs, actor IDs, user records, translation maps, and Prisma records.
- Added strict validation mapping, exact Task 2 RBAC permissions, and complete OpenAPI request/response/error contracts.

## TDD evidence

- Service/repository RED: imports failed because the modules did not exist.
- API RED: all exact lifecycle paths returned 404 before route registration.
- OpenAPI RED: lifecycle paths were absent.
- Additional RED/GREEN cycles covered nested fingerprint sensitivity, actor-bound fingerprints, internal release-ID redaction, exact concurrent idempotency replay, replay-before-task-policy validation, and standard `page_size` responses.

## Verification

- Focused announcement repository/service/API/OpenAPI: 4 suites, 34 tests passed in the final rerun.
- Relevant locale/validator/RBAC/Affiliate marketplace regressions: 7 suites, 59 tests passed.
- `npm --prefix backend run lint`: passed.
- `npm --prefix backend run build`: passed.
- `npm --prefix backend exec prisma -- validate --schema backend/prisma/schema.prisma`: passed.
- Focused Prettier check for Task 4 files and `git diff --check`: passed in the final rerun.

## Concern

The repository-wide `npm --prefix backend run format:check` remains red on 163 pre-existing, unrelated files. Task 4 files are formatted and no unrelated formatting changes are included. No database schema or migration change belongs to Task 4 because Task 1 already supplied the additive publication schema.
