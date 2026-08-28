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
- Corrected public selection so only the actual current `PUBLISHED` slot inside its visibility window is readable; due `SCHEDULED` rows remain private until the Task 6 worker activates them.
- Hardened all idempotent lifecycle commands with bounded post-race command re-reads for CAS/domain conflicts and Prisma `P2002`/`P2025`/`P2034` races. Matching actor-bound fingerprints replay the committed result, while mismatches remain `error.idempotency_key_reused` and distinct competing commands retain their true conflict.
- Revalidated optional canonical Affiliate tasks through the existing marketplace eligibility policy for publish and schedule after the replay check. Immediate publish and scheduled activation now have to fall inside the release visibility window.
- Exposed copy-to-all through the existing PATCH route as a strict request union. Protected translation payloads now include `sourceLocale` and `isInitialCopy`; the public one-locale payload remains minimal.
- Corrected rollback to require `button:backoffice-affiliate-announcement-publish`, including an editor-only denial regression.

## TDD evidence

- Service/repository RED: imports failed because the modules did not exist.
- API RED: all exact lifecycle paths returned 404 before route registration.
- OpenAPI RED: lifecycle paths were absent.
- Additional RED/GREEN cycles covered nested fingerprint sensitivity, actor-bound fingerprints, internal release-ID redaction, exact concurrent idempotency replay, replay-before-task-policy validation, and standard `page_size` responses.
- Review-fix RED/GREEN cycles covered actual published-slot selection, delayed race-winner replay and mismatch, replay-before-volatile-policy ordering, publish/schedule visibility bounds, strict PATCH copy-to-all dispatch, protected translation provenance, rollback permission denial, and generic validation error documentation.
- Added a gated real-MySQL suite using unique markers and cleanup for identical concurrent replay, distinct competing publishers, published translation immutability, current-slot state, rollback lineage/version, and audit-command atomicity.

## Verification

- Final focused announcement, validator, OpenAPI, Affiliate marketplace, RBAC, schema, and validation regression command: 13 suites, 126 tests passed; the 3 gated MySQL cases were skipped in the normal run.
- `npm --prefix backend run lint`: passed.
- `npm --prefix backend run build`: passed.
- `npm --prefix backend run prisma:generate`: passed.
- `npm --prefix backend exec prisma -- validate`: passed.
- Focused Prettier check for Task 4 files and `git diff --check`: passed before final review; final changed-file whitespace validation passed.

## Concern

The real-MySQL suite was explicitly attempted with `/Users/eason/Documents/New project/backend/.env.dev`. Its safety guard accepted only the local `needo_dev`/`needo_test` MySQL targets, and `mysqld` was listening on `127.0.0.1:3307`; however, Prisma timed out before setup while acquiring a pool connection (`active=0`, `idle=0`, limit `10`). No uniquely marked test record was created, so the three transaction/concurrency cases remain unexecuted against MySQL in this environment. They compile and are available behind `RUN_OFFICIAL_ANNOUNCEMENT_INTEGRATION=true` for rerun when the database accepts connections.

The repository-wide `npm --prefix backend run format:check` remains red on pre-existing, unrelated files. Task 4 additions are formatted and no unrelated formatting changes are included. No database schema or migration change belongs to Task 4 because Task 1 already supplied the additive publication schema.
