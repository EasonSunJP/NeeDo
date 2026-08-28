# Localized Carousel Task 5 Report

Status: DONE

## Critical review remediation

- The gated MySQL suite now refuses any populated `USER_HOME` scene before setup, selects only an explicitly configured local `needo_dev`/`needo_test` database, does not overwrite `NODE_ENV` or `DEPLOY_ENV`, snapshots the exact scene before setup, and asserts both exact restoration and zero actor/marker residue after cleanup.
- Draft replacement now stages every active slide above the maximum order across active and soft-deleted rows before applying the next contiguous order. P2002/P2025/P2034 replacement races are normalized to the stable lock-conflict contract. A real-MySQL delete–replace–replace regression proves repeated saves do not collide.
- Media resolution now requires an active `content_publication_public` upload owned by the acting uploader, chooses deterministically, and carries the resolved MediaAsset ID through the transaction. Rollback has the narrow explicit exception of media IDs already attached to the authorized source release. Unit and real-MySQL two-owner/same-checksum coverage prove the foreign owner is never selected.
- Mutations retain protected numeric compatibility while also accepting picker-safe shop/technician/service `publicId` values and Affiliate announcement `taskCode`. Resolution is transactional, rechecks live target state, and enforces that taskCode equals the announcement's canonical task. Target search returns a directly submit-ready safe `target` object and never exposes numeric IDs.
- Mixed user-home target prefixes are queried in the same deterministic label/type ordering used before slicing. Affiliate task search scans deterministic batches through policy-hidden rows, calculates the actual visible total, and fills stable pages without duplicates or skips; three-page hidden-row coverage is included.
- Zod now requires exactly one source translation on create and exactly five unique locales on replacement. Locale PATCH accepts the same strict update/copy-to-all union proven by Task 4, while the dedicated copy endpoint remains explicit. OpenAPI uses distinct per-scene create/replace target and slide schemas, exact one/five translation arrays, the strict locale union, and safe picker target contracts, preventing generated clients from offering cross-scene target payloads.

## Scope completed

- Added the formal `CarouselPublicationService` API for fixed `USER_HOME` and `AFFILIATE_HOME_NOTICE` scenes: scene state, draft creation/replacement, per-locale edits, explicit copy-to-all, preview, publish, schedule, disable, rollback, history, protected target search, and public one-locale reads.
- Added atomic Prisma repository transactions for complete slide/translation writes, optimistic lock CAS, single draft/published/scheduled slot enforcement, immutable published releases, rollback cloning, audit records, and actor-bound `ContentPublicationCommand` replay.
- Added bounded exact replay recovery for P2002/P2025/P2034 and domain-shaped race conflicts. Replay is checked before volatile Affiliate task visibility validation.
- Added publication and schedule revalidation for all five locales, contiguous ordering, image ownership/status, slide windows, at least one potentially visible slide, current target state, active public identifiers, current announcement publication coverage, announcement/task identity matching, and Affiliate marketplace visibility.
- Added protected, paginated, scope/status/soft-delete-filtered target pickers with public-safe identifiers only.
- Added authenticated public reads that select only the actual current `PUBLISHED` slot and filter dead/window-ineligible slides without returning internal numeric target IDs.
- Added fixed-scene controllers/routes and complete OpenAPI contracts. Request payloads cannot select or override a scene; rollback uses publish permission.
- Preserved the existing stable content-publication validation error array while adding the Task 5 locale/copy request validators as opt-in route mappings.

## TDD evidence

The focused tests were created first. Initial RED failed because the carousel modules did not exist. A later gated MySQL replacement test independently reproduced an old-MediaAsset retention bug before the repository fix.

Final corrective focused command:

```bash
npm --prefix backend test -- --runInBand tests/carousel-publication.repository.test.ts tests/carousel-publication.service.test.ts tests/content-publication-validator.test.ts tests/content-publication-api.test.ts tests/openapi.test.ts
```

Result: 5 suites passed, 58 tests passed.

## Real MySQL transaction verification

Command:

```bash
ENV_FILE='/Users/eason/Documents/New project/backend/.env.dev' RUN_CAROUSEL_PUBLICATION_INTEGRATION=true npm --prefix backend test -- --runInBand tests/carousel-publication.repository.integration.test.ts
```

Result: 1 suite passed, 7 tests passed. It verified fail-fast empty-scene safety and exact restoration, atomic draft media replacement and five-locale provenance, repeated soft-delete replacement ordering, same-checksum actor ownership plus public picker resolution, identical concurrent replay with one audit/command, one scheduled slot, competing publisher CAS with old-publication immutability, and rollback lineage/source preservation. Prisma emitted expected deadlock diagnostics for losing concurrent writers; bounded replay/conflict handling produced the asserted successful outcomes. All uniquely marked rows were removed and the pre-test scene snapshot was restored exactly.

## Regression verification

Task 1-4 localized content, content media, official announcements, Affiliate marketplace, Affiliate permissions, auth/RBAC permissions, permission API, validators, schema, and OpenAPI:

```bash
npm --prefix backend test -- --runInBand tests/content-locales.test.ts tests/localized-carousel-schema.test.ts tests/localized-carousel-permissions.test.ts tests/content-publication-validator.test.ts tests/content-media-config.test.ts tests/content-media.service.test.ts tests/content-media-api.test.ts tests/content-media-atomic-storage.test.ts tests/content-media-advisory-lock.test.ts tests/official-announcement.service.test.ts tests/official-announcement.repository.test.ts tests/official-announcement-api.test.ts tests/affiliate-marketplace.service.test.ts tests/affiliate-marketplace.repository.test.ts tests/affiliate-marketplace-api.test.ts tests/affiliate-permissions.test.ts tests/auth-permissions.test.ts tests/permission-api.test.ts tests/openapi.test.ts
```

Result: 19 suites passed, 165 tests passed.

## Quality gates

- `npm --prefix backend run lint`: passed.
- `npm --prefix backend run build`: passed.
- Focused Prettier check for every Task 5 source/test plus modified app/OpenAPI/validator files: passed.
- From `backend/`, `npm exec -- prisma validate --schema prisma/schema.prisma`: passed.
- `git diff --check`: passed.

## Workspace safety

The work started from `dc34f780252f7fba6843660a1051a81c1988ff47` on `codex/affiliate-alliance-invitations`. Pre-existing unrelated dirty auth/frontend/profile/share/i18n files were not staged or modified by Task 5.
