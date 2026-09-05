# Official Notice Prisma Schema Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Prisma models and relations for the already-applied official-notice migration so the current backend can access the formal notice tables without changing database state.

**Architecture:** Treat `20260902143000_official_notice_delivery/migration.sql` as the immutable physical-database contract. Add only the matching Prisma enums, four models, and inverse relations; do not add a migration, route, service, permission, UI, or database write in this recovery slice.

**Tech Stack:** Prisma 7, MySQL 8, TypeScript, Jest.

## Global Constraints

- Work from current `main` in an isolated worktree and preserve every unrelated working-tree change.
- Do not edit the already-applied `20260902143000_official_notice_delivery` migration.
- Do not apply migrations or mutate MySQL in this microstep.
- Every restored model must retain timestamps, soft deletion, mapped table/column names, indexes, uniqueness, and restrictive foreign keys defined by the migration.
- Do not add mock data, API placeholders, permissions, services, routes, UI, or runtime worker wiring.

---

### Task 1: Lock and Restore the Applied Schema Contract

**Files:**

- Create: `backend/tests/official-notice-schema.test.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `docs/superpowers/plans/2026-09-05-official-notice-schema-recovery.md`

**Interfaces:**

- Consumes: immutable migration `backend/prisma/migrations/20260902143000_official_notice_delivery/migration.sql`.
- Produces: Prisma enums `OfficialNoticeLevel`, `OfficialNoticeStatus`, `OfficialNoticeAudienceType`, `NoticeDeliveryStatus`.
- Produces: Prisma models `OfficialNotice`, `OfficialNoticeTranslation`, `NoticeAudience`, `NoticeDelivery` and their inverse `User`, `UserIdentity`, and `Notification` relations.

- [x] **Step 1: Write the failing schema contract test**

Create a Jest source-contract test that reads `schema.prisma` and the immutable migration, requires all four models, verifies timestamps and soft deletion, checks the audience/delivery uniqueness and dispatch/inbox indexes, checks inverse relations, and proves the migration contains the same four additive tables without destructive SQL.

- [x] **Step 2: Run the test and verify the intended RED state**

Run:

```bash
npm test -- --runTestsByPath tests/official-notice-schema.test.ts --runInBand
```

Expected: FAIL with `missing model OfficialNotice`, proving current `main` has migration history but no Prisma model.

- [x] **Step 3: Add the minimum matching Prisma schema**

Add the four mapped enums, four models, and these exact inverse relation groups:

```prisma
createdOfficialNotices   OfficialNotice[] @relation("OfficialNoticeCreatedBy")
officialNoticeAudiences  NoticeAudience[] @relation("NoticeAudienceRecipient")
officialNoticeDeliveries NoticeDelivery[] @relation("NoticeDeliveryRecipient")
```

Add the remaining update/submit/approve/cancel/archive `User` relations, the two recipient `UserIdentity` relations, and the optional inverse `Notification.noticeDelivery` relation. Keep every field, map, unique constraint, index, and `onDelete` behavior aligned with the applied SQL.

- [x] **Step 4: Generate and validate Prisma**

Run:

```bash
npm run prisma:generate
npx prisma validate
```

Expected: both commands exit 0 without applying a migration.

- [x] **Step 5: Run focused and regression verification**

Run:

```bash
npm test -- --runTestsByPath tests/official-notice-schema.test.ts tests/migration-history-reconciliation.test.ts --runInBand
npm run build
npm run lint -- --no-warn-ignored tests/official-notice-schema.test.ts
git diff --check
```

Expected: tests, build, lint, and whitespace check all exit 0; the migration checksum remains unchanged.

- [ ] **Step 6: Commit and merge**

Commit only the plan, schema, and schema test with message `fix(notifications): restore official notice prisma schema`. Merge the verified branch into `main` without pushing or deploying, then confirm the merge commit contains only the scoped files.

## Verification evidence

- RED: all seven schema assertions failed against the original `main`, including `missing model OfficialNotice`.
- GREEN: seven schema tests plus three immutable migration checksum tests passed (2 suites / 10 tests).
- Prisma Client generation and Prisma schema validation passed. No SQL was applied.
- Backend build and lint passed using the dependencies installed for current `main`; the older root backend dependencies lacked the existing `sharp` package.
- Read-only local MySQL migration status on 2026-09-05 reports 125 migrations and `Database schema is up to date!`.
- The full regression is recorded separately before the local merge. The new schema does not by itself restore notification APIs, UI, merchant audiences, or prove cross-portal delivery.
