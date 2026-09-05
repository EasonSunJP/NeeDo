# Platform Membership Three-Color Gradient and Contrast Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and render a three-color detailed membership-card background while allowing every valid hexadecimal theme to be saved and published regardless of contrast.

**Architecture:** Extend the existing immutable platform-membership tier-version theme with two additive colors while retaining `detailSurfaceColor` as the top-left stop. A shared frontend helper owns the exact `155deg / 0%-52%-100%` gradient so operations preview and customer cards cannot drift. Existing Zod, Service, Repository, OpenAPI, Prisma and audit/versioning paths remain authoritative; only the contrast eligibility gate is removed.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Express, Zod, Prisma 7, MySQL 8/MariaDB-compatible migration, Jest/Supertest.

## Global Constraints

- This plan covers only the detailed-card three-color gradient and contrast publication policy; actual traceless IM recall remains a separate Step 13 microstep.
- Preserve `detailSurfaceColor` and interpret it as the top-left color.
- Add `detailSurfaceMiddleColor` and `detailSurfaceBottomColor` to every formal theme contract.
- Existing rows copy `detailSurfaceColor` into both new columns, preserving their pre-migration solid appearance.
- The detailed card background is `linear-gradient(155deg, topLeft 0%, middle 52%, bottom 100%)` in one shared helper.
- Valid `#RRGGBB` values may always be saved and published; invalid formats remain rejected by Zod and Service normalization.
- Do not add mock data, a parallel theme store, a client-selected publication bypass, or staging deployment.

---

### Task 1: Persist the two additional gradient stops

**Files:**
- Create: `backend/prisma/migrations/20260906130000_platform_membership_three_color_detail_surface/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/tests/platform-membership-schema.test.ts`

**Interfaces:**
- Consumes: existing `platform_membership_tier_versions.detail_surface_color` and `platform_membership_tier_versions_colors_chk`.
- Produces: non-null `detail_surface_middle_color` and `detail_surface_bottom_color` columns with the same `#RRGGBB` database constraint.

- [ ] **Step 1: Write the failing schema test**

Add assertions that Prisma contains `detailSurfaceMiddleColor` / `detailSurfaceBottomColor`, the migration adds both nullable columns, backfills both from `detail_surface_color`, makes them non-null, and recreates the color CHECK with both columns.

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test -- --runInBand tests/platform-membership-schema.test.ts`

Expected: FAIL because the fields and migration do not exist.

- [ ] **Step 3: Add the migration and Prisma fields**

Use an additive migration in this order:

```sql
ALTER TABLE `platform_membership_tier_versions`
  ADD COLUMN `detail_surface_middle_color` CHAR(7) NULL AFTER `detail_surface_color`,
  ADD COLUMN `detail_surface_bottom_color` CHAR(7) NULL AFTER `detail_surface_middle_color`;

UPDATE `platform_membership_tier_versions`
SET `detail_surface_middle_color` = `detail_surface_color`,
    `detail_surface_bottom_color` = `detail_surface_color`
WHERE `detail_surface_middle_color` IS NULL
   OR `detail_surface_bottom_color` IS NULL;
```

Then make both columns non-null and replace only `platform_membership_tier_versions_colors_chk`, retaining all existing hexadecimal checks and adding the two new columns.

- [ ] **Step 4: Run the schema test and Prisma validation to verify GREEN**

Run: `npm test -- --runInBand tests/platform-membership-schema.test.ts && npm run prisma:generate && npx prisma validate`

Expected: PASS and Prisma reports a valid schema.

### Task 2: Extend the formal API and remove the backend contrast gate

**Files:**
- Modify: `backend/src/domain/platform-membership.ts`
- Modify: `backend/src/validators/platform-membership.validator.ts`
- Modify: `backend/src/repositories/platform-membership.repository.ts`
- Modify: `backend/src/services/platform-membership.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/platform-membership-versioning.service.test.ts`
- Modify: `backend/tests/platform-membership-versioning.repository.test.ts`
- Modify: `backend/tests/platform-membership-api.test.ts`
- Modify: `backend/tests/platform-membership-openapi.test.ts`
- Modify: membership theme fixtures returned by `rg -l 'detailSurfaceColor' backend/tests -g '*.ts'`

**Interfaces:**
- Consumes: `PlatformMembershipTheme`, `PlatformMembershipTierDraftBody`, repository tier-version projections.
- Produces: ten-color theme payloads and publishing that depends on format/version/RBAC but never contrast.

- [ ] **Step 1: Write failing Service and OpenAPI tests**

Change the former contrast-rejection Service test to publish a valid low-contrast theme successfully. Assert OpenAPI requires exactly ten theme fields and exposes the two new `#RRGGBB` properties.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --runInBand tests/platform-membership-versioning.service.test.ts tests/platform-membership-openapi.test.ts`

Expected: FAIL because publishing still calls the contrast assertion and OpenAPI has eight theme fields.

- [ ] **Step 3: Extend domain, validation, service, repository and OpenAPI**

Add both fields to every theme key list, normalization object, Prisma select, mutable persistence object and response mapper. Remove `assertThemeContrast` and its publish call; retain the hexadecimal regex check. Update every backend fixture to provide explicit middle and bottom values.

- [ ] **Step 4: Run focused backend tests to verify GREEN**

Run: `npm test -- --runInBand tests/platform-membership-schema.test.ts tests/platform-membership-versioning.service.test.ts tests/platform-membership-versioning.repository.test.ts tests/platform-membership-api.test.ts tests/platform-membership-openapi.test.ts tests/platform-membership.service.test.ts tests/platform-membership.repository.test.ts tests/platform-membership-self-api.test.ts`

Expected: all selected suites pass.

### Task 3: Share one gradient renderer across operations preview and customer cards

**Files:**
- Modify: `src/shared/profile-card/platformMembershipTheme.ts`
- Modify: `src/shared/profile-card/PlatformMembershipDetailCard.tsx`
- Modify: `src/shared/profile-card/PlatformMembershipCards.test.tsx`
- Modify: `src/features/platform-membership/api.ts`
- Modify: `src/features/platform-user-management/types.ts`
- Modify: `src/features/platform-user-management/api.ts`
- Modify: `src/features/platform-user-management/MembershipTierEditor.tsx`
- Modify: frontend theme fixtures returned by `rg -l 'detailSurfaceColor' src -g '*.test.ts' -g '*.test.tsx'`

**Interfaces:**
- Consumes: ten-color `MembershipCardTheme` from formal customer and operations APIs.
- Produces: `resolveMembershipDetailGradient(theme): string` and one detailed-card `backgroundImage` used by both real card and operations preview.

- [ ] **Step 1: Write failing shared-card and decoder tests**

Assert the helper returns:

```text
linear-gradient(155deg, #10242D 0%, #183A32 52%, #24314B 100%)
```

Assert rendered detailed-card markup contains that full gradient. Assert both formal decoders reject payloads missing either new stop and accept all ten colors.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --run src/shared/profile-card/PlatformMembershipCards.test.tsx src/features/platform-membership/api.test.ts src/features/platform-user-management/api.test.ts`

Expected: FAIL because the helper and two fields are absent.

- [ ] **Step 3: Implement the shared renderer and complete decoders**

Add the two explicit fields to the shared type and decoders. Make `PlatformMembershipDetailCard` set `backgroundImage` from the helper, not an independent CSS string. Resolve the main foreground from the middle stop while retaining existing automatic item/accent/simple-card foreground calculations.

- [ ] **Step 4: Run focused shared-card and decoder tests to verify GREEN**

Run the command from Step 2 again.

Expected: all selected tests pass.

### Task 4: Expose three labeled controls and remove frontend contrast blocking

**Files:**
- Modify: `src/features/platform-user-management/MembershipTierEditor.tsx`
- Modify: `src/features/platform-user-management/MembershipTiersPage.test.tsx`
- Modify: `src/shared/profile-card/PlatformMembershipCards.test.tsx`
- Modify: `src/features/platform-user-management/i18n.ts`

**Interfaces:**
- Consumes: shared `PlatformMembershipDetailCard` preview and ten-color draft contract.
- Produces: three controls labeled `详细卡左上底色`, `详细卡中段底色`, `详细卡底部底色`; save/publish buttons gated only by saving/base/draft/permission state.

- [ ] **Step 1: Write the failing editor test**

Assert the editor source includes the three labels, does not import/call `isAccessibleMembershipTheme`, does not display `contrastInvalid`, and does not include contrast in the save or publish disabled conditions.

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test -- --run src/features/platform-user-management/MembershipTiersPage.test.tsx src/shared/profile-card/PlatformMembershipCards.test.tsx`

Expected: FAIL on missing labels and the remaining contrast block.

- [ ] **Step 3: Update the editor**

Use default top-left `#10242D`, middle `#183A32`, bottom `#24314B`. Remove the blocking message and every `accessible` condition. Keep color inputs, uppercase normalization, permissions, saving state, optimistic locking and server errors unchanged.

- [ ] **Step 4: Run the editor tests to verify GREEN**

Run the command from Step 2 again.

Expected: all selected tests pass.

### Task 5: Execute migration acceptance and complete the gate

**Files:**
- Create: `backend/scripts/check-membership-gradient-migration.ts`
- Modify: `backend/package.json`
- Modify: `backend/tests/platform-membership-schema.test.ts`
- Modify: `docs/backoffice-real-data.md`

**Interfaces:**
- Consumes: local non-production MySQL administrator guard already used by `check-membership-traceless-benefit-migration.ts`.
- Produces: disposable-database evidence that old colors are preserved and both new constraints reject malformed values.

- [ ] **Step 1: Add a guarded disposable-database checker**

Require `ALLOW_MEMBERSHIP_GRADIENT_MIGRATION_CHECK=true`, accept only the validated local environment, create only `needo_membership_gradient_<24 hex>`, create the baseline tier-version color columns/check, insert two different legacy rows, apply the migration, assert both rows copied their own original color, assert both columns are non-null and malformed new colors are rejected, then drop and verify deletion of the scratch database in `finally`.

- [ ] **Step 2: Run focused checks**

Run:

```bash
npm test -- --runInBand tests/platform-membership-schema.test.ts tests/platform-membership-versioning.service.test.ts tests/platform-membership-versioning.repository.test.ts tests/platform-membership-api.test.ts tests/platform-membership-openapi.test.ts
npm run check:membership-gradient-migration
```

Expected: all tests pass; checker reports `cleanupVerified: true` and `existingDatabaseModified: false`.

- [ ] **Step 3: Run full verification**

Run frontend full tests, backend full tests in four shards, frontend/backend lint and build, `npm run prisma:generate`, and `npx prisma validate`.

Expected: zero failures. Existing documented build chunk warnings are non-blocking; no new warning is accepted.

- [ ] **Step 4: Review and integrate**

Request an independent code review, resolve every Critical/Important issue, rebase onto latest `main`, rerun affected gates, then fast-forward local `main`. Do not push or deploy staging.

