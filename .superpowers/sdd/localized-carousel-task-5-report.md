# Localized Carousel Task 5 Report

Status: DONE

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

Final focused command:

```bash
npm --prefix backend test -- --runInBand tests/carousel-publication.repository.test.ts tests/carousel-publication.service.test.ts tests/content-publication-api.test.ts tests/openapi.test.ts
```

Result: 4 suites passed, 30 tests passed.

## Real MySQL transaction verification

Command:

```bash
ENV_FILE='/Users/eason/Documents/New project/backend/.env.dev' RUN_CAROUSEL_PUBLICATION_INTEGRATION=true npm --prefix backend test -- --runInBand tests/carousel-publication.repository.integration.test.ts
```

Result: 1 suite passed, 5 tests passed. It verified atomic draft media replacement and five-locale provenance, identical concurrent replay with one audit/command, one scheduled slot, competing publisher CAS with old-publication immutability, and rollback lineage/source preservation. Prisma emitted expected deadlock diagnostics for losing concurrent writers; bounded replay/conflict handling produced the asserted successful outcomes. All uniquely marked rows were removed by the suite cleanup.

## Regression verification

Task 1-4 localized content, content media, official announcements, Affiliate marketplace, Affiliate permissions, auth/RBAC permissions, permission API, validators, schema, and OpenAPI:

```bash
npm --prefix backend test -- --runInBand tests/content-locales.test.ts tests/localized-carousel-schema.test.ts tests/localized-carousel-permissions.test.ts tests/content-publication-validator.test.ts tests/content-media-config.test.ts tests/content-media.service.test.ts tests/content-media-api.test.ts tests/content-media-atomic-storage.test.ts tests/content-media-advisory-lock.test.ts tests/official-announcement.service.test.ts tests/official-announcement.repository.test.ts tests/official-announcement-api.test.ts tests/affiliate-marketplace.service.test.ts tests/affiliate-marketplace.repository.test.ts tests/affiliate-marketplace-api.test.ts tests/affiliate-permissions.test.ts tests/auth-permissions.test.ts tests/permission-api.test.ts tests/openapi.test.ts
```

Result: 19 suites passed, 160 tests passed.

## Quality gates

- `npm --prefix backend run lint`: passed.
- `npm --prefix backend run build`: passed.
- Focused Prettier check for every Task 5 source/test plus modified app/OpenAPI/validator files: passed.
- From `backend/`, `npm exec -- prisma validate --schema prisma/schema.prisma`: passed.
- `git diff --check`: passed.

## Workspace safety

The work started from `dc34f780252f7fba6843660a1051a81c1988ff47` on `codex/affiliate-alliance-invitations`. Pre-existing unrelated dirty auth/frontend/profile/share/i18n files were not staged or modified by Task 5.
