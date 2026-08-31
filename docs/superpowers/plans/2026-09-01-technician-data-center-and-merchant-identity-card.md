# Technician Data Center and Merchant Identity Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver formal technician profile saving, independently configurable service/extension/nomination compensation, a period-linked technician data center and order/schedule flow, plus an identity-isolated merchant personal card.

**Architecture:** Implement four vertical slices on the existing Express/Prisma and React/Vite foundations. Each backend route resolves the authenticated current identity, delegates to service/repository layers, and returns only formal persisted data; the frontend reuses shared presentation components without sharing identity records or mutation state.

**Tech Stack:** Node.js 22, Express, TypeScript strict, Prisma/MySQL, Redis-backed auth/RBAC, Zod, Jest/Supertest, React 19, React Router, Vitest, Vite.

## Global Constraints

- One microstep at a time; each step must run, test, and remain revertible.
- No new mock, demo, placeholder, browser business store, fake API, fake success, or invented financial value.
- All new APIs use `/api/v1/`, Zod, OpenAPI, authentication, RBAC, service/repository layering, and audit evidence.
- User, technician, and merchant information cards have independent persistence and current-identity scope.
- Tokyo calendar boundaries use `Asia/Tokyo`; historical compensation snapshots are never recalculated by a newer rule.
- Preserve unrelated dirty files and the parallel merchant dashboard task's ownership of `ShopAnalyticsDashboard`.
- Add all visible copy to the existing five-language i18n system.

---

### Task 1: Accept Legitimate Empty Technician Profile Collections

**Files:**
- Modify: `backend/src/validators/technician-profile.validator.ts`
- Modify: `backend/tests/technician-profile-validator.test.ts`
- Modify: `backend/tests/technician-profile-api.test.ts`
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.test.tsx`

**Interfaces:**
- Consumes: existing `PATCH /api/v1/technician-profile/me`.
- Produces: `TechnicianProfileUpdateBody` accepting empty `languages`, `serviceAreas`, and `paymentMethods`, with bounded non-empty entries when present.

- [ ] **Step 1: Write failing validator and API tests**

```ts
expect(technicianProfileUpdateBodySchema.parse({
  languages: [],
  serviceAreas: [],
  paymentMethods: []
})).toEqual({ languages: [], serviceAreas: [], paymentMethods: [] });
```

Add a Supertest PATCH that sends the same arrays and asserts the repository mutation receives them.

- [ ] **Step 2: Verify RED**

Run: `npm --prefix backend test -- --runInBand technician-profile-validator.test.ts technician-profile-api.test.ts`

Expected: FAIL because `stringList()` and `paymentMethods` currently require one item.

- [ ] **Step 3: Implement the minimal contract correction**

```ts
const stringList = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);
```

Remove only the payment-method `.min(1)`. Keep strict object validation, enum validation, upper bounds, and budget cross-field validation. Map `error.validation` to a readable save message without swallowing other status-specific errors.

- [ ] **Step 4: Verify GREEN**

Run the two backend tests plus `npx vitest run src/pages/mobile/TechnicianPortalPage.test.tsx`.

Expected: PASS.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add backend/src/validators/technician-profile.validator.ts backend/tests/technician-profile-validator.test.ts backend/tests/technician-profile-api.test.ts src/pages/mobile/TechnicianPortalPage.tsx src/pages/mobile/TechnicianPortalPage.test.tsx
git commit -m "fix: allow empty technician profile collections"
```

### Task 2: Persist Independent Compensation Components and Merchant Identity Profiles

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901120000_technician_income_and_merchant_profile/migration.sql`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/repositories/identity-avatar.repository.ts`
- Modify: `backend/tests/compensation-profile.repository.test.ts`
- Create: `backend/tests/merchant-profile.repository.test.ts`
- Modify: `docs/database.md`

**Interfaces:**
- Produces Prisma fields `extensionCommissionRateBps` and `nominationFeeJpy` on `ShopFinanceRuleSet` and `TechnicianCompensationProfile`.
- Produces `MerchantIdentityProfile` keyed uniquely by `identityId`, with soft deletion and identity-owned avatar assets.
- Produces nullable historical-breakdown fields on `OrderFinancial`: `baseServiceAmountJpy`, `extensionAmountJpy`, `nominationChargeAmountJpy`, `wasTechnicianNominated`, and `compensationBasisVersion`.

- [ ] **Step 1: Add failing schema/repository expectations**

Assert repository mappings expose `extensionCommissionRatePercent` and `nominationFeeJpy`; add a merchant-profile repository test that reads and updates only the supplied `userId + identityId` pair.

- [ ] **Step 2: Verify RED**

Run: `npm --prefix backend test -- --runInBand compensation-profile.repository.test.ts merchant-profile.repository.test.ts`

Expected: FAIL because the Prisma fields/model and repository do not exist.

- [ ] **Step 3: Add the additive migration**

The SQL must:

```sql
ALTER TABLE `shop_finance_rule_sets`
  ADD COLUMN `extension_commission_rate_bps` INTEGER NOT NULL DEFAULT 6000,
  ADD COLUMN `nomination_fee_jpy` INTEGER NOT NULL DEFAULT 0;
UPDATE `shop_finance_rule_sets`
SET `extension_commission_rate_bps` = `commission_rate_bps`;
```

Apply the equivalent additive columns/backfill to `technician_compensation_profiles`. Create `merchant_identity_profiles` with `id`, unique `identity_id`, `user_id`, profile fields, timestamps, soft-delete indexes, and foreign keys to `users` and `user_identities`.

Add nullable order-financial breakdown columns. Existing rows remain null and are therefore handled as `legacy_aggregate`; do not infer their component amounts or nomination state.

- [ ] **Step 4: Update Prisma and avatar ownership**

Add the corresponding Prisma model/relations. Extend `IdentityAvatarSource` with `{ kind: "merchant"; profileId: number }`, using `entityType="merchant_identity_profile"`, `entityId=profileId`, and `ownerIdentityId` without changing the global user bootstrap avatar after the first identity bootstrap.

- [ ] **Step 5: Generate Prisma and verify GREEN**

Run: `npm --prefix backend run prisma:generate` and the focused repository tests.

Expected: Prisma generation and tests PASS.

- [ ] **Step 6: Commit only Task 2 files**

```bash
git commit -m "feat: add formal technician income components and merchant profiles"
```

### Task 3: Extend Compensation Validation, Versioning, Preview, and Order Finance

**Files:**
- Modify: `backend/src/validators/compensation-profile.validator.ts`
- Modify: `backend/src/services/compensation-engine.service.ts`
- Modify: `backend/src/services/compensation-profile.service.ts`
- Modify: `backend/src/repositories/compensation-profile.repository.ts`
- Modify: `backend/src/validators/order-finance.validator.ts`
- Modify: `backend/src/services/order-finance.service.ts`
- Modify: `backend/src/repositories/order-finance.repository.ts`
- Modify: `backend/tests/compensation-engine-service.test.ts`
- Modify: `backend/tests/employee-compensation-profile.test.ts`
- Modify: `backend/tests/order-finance-service.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/api/employeeCompensation.ts`
- Modify: `src/api/merchantFinanceCenter.ts`
- Modify: `src/components/merchant-admin/EmployeeCompensationPanel.tsx`
- Modify: `src/components/merchant-admin/MerchantStoreOperationsWorkspace.tsx`

**Interfaces:**
- Produces `CompensationPreviewInput { baseServiceAmountJpy, extensionAmountJpy, nominated, ... }`.
- Produces preview fields `serviceCommissionPayJpy`, `extensionCommissionPayJpy`, `nominationPayJpy` while retaining aggregate `commissionPayJpy` for compatibility.

- [ ] **Step 1: Write failing engine and API tests**

```ts
expect(engine.calculate(rule, {
  baseServiceAmountJpy: 10_000,
  extensionAmountJpy: 4_000,
  nominated: true
})).toMatchObject({
  serviceCommissionPayJpy: 2_000,
  extensionCommissionPayJpy: 2_400,
  nominationPayJpy: 1_500,
  commissionPayJpy: 4_400
});
```

Cover no-extension, no-nomination, fallback profiles, version replacement, and legacy aggregate-only finance input.

- [ ] **Step 2: Verify RED**

Run the three focused backend suites. Expected: FAIL on missing fields and calculations.

- [ ] **Step 3: Implement compensation calculations and version mapping**

Calculate service and extension commission independently; add the fixed nomination fee only for an explicit nomination snapshot. Preserve existing wage-mode and minimum-guarantee behavior. Store each version immutably by archiving the prior profile before creating the replacement.

- [ ] **Step 4: Extend formal order-finance reporting**

Accept optional component fields with the invariant:

```ts
baseServiceAmountJpy + extensionAmountJpy + nominationChargeAmountJpy === serviceAmountJpy
```

When component fields are absent, mark the calculation as `legacy_aggregate` and keep the existing aggregate calculation rather than inventing a split.

- [ ] **Step 5: Update merchant editors and OpenAPI**

Add labeled independent controls for service commission, extension commission, and nomination fee. Ensure requests and responses use the same property names in frontend adapters and OpenAPI schemas.

- [ ] **Step 6: Verify GREEN and commit**

Run focused backend tests and frontend API/component tests, then commit Task 3 files with `feat: split technician service and extension compensation`.

### Task 4: Add Merchant Self-Profile API

**Files:**
- Create: `backend/src/validators/merchant-profile.validator.ts`
- Create: `backend/src/repositories/merchant-profile.repository.ts`
- Create: `backend/src/services/merchant-profile.service.ts`
- Create: `backend/src/controllers/merchant-profile.controller.ts`
- Create: `backend/src/routes/merchant-profile.routes.ts`
- Create: `backend/tests/merchant-profile-validator.test.ts`
- Create: `backend/tests/merchant-profile-service.test.ts`
- Create: `backend/tests/merchant-profile-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Produces `GET/PATCH /api/v1/merchant-profile/me`.
- Resolves only `currentIdentityType=merchant` with scope type `shop`, `merchant`, or `merchant_account`; body never accepts identity/user/shop IDs.

- [ ] **Step 1: Write failing validator/service/API tests**

Cover identity mismatch, permission denial, strict Zod rejection, independent updates for two identities owned by one user, avatar persistence, and audit action `merchant_profile.self_update`.

- [ ] **Step 2: Verify RED**

Run the three new suites. Expected: module/route missing failures.

- [ ] **Step 3: Implement Route → Controller → Service → Repository**

Return the standard `{ code, message, data }` envelope. Repository queries must include `userId`, `identityId`, `deletedAt:null`, and create the profile lazily from the identity display name only when the authenticated merchant first reads it.

- [ ] **Step 4: Add permissions and OpenAPI**

Seed `merchant-profile:read` and `merchant-profile:write` for `merchant_owner` and `merchant_staff` according to existing system-permission patterns. Document request/response schemas without internal sensitive fields.

- [ ] **Step 5: Verify GREEN and commit**

Run the new suites plus OpenAPI tests, then commit Task 4 files.

### Task 5: Add Technician Data Center Domain and API

**Files:**
- Create: `backend/src/domain/technician-data-center-period.ts`
- Create: `backend/src/validators/technician-data-center.validator.ts`
- Create: `backend/src/repositories/technician-data-center.repository.ts`
- Create: `backend/src/services/technician-data-center.service.ts`
- Create: `backend/src/controllers/technician-data-center.controller.ts`
- Create: `backend/src/routes/technician-data-center.routes.ts`
- Create: `backend/tests/technician-data-center-period.test.ts`
- Create: `backend/tests/technician-data-center-service.test.ts`
- Create: `backend/tests/technician-data-center-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/constants/permissions.constants.ts`

**Interfaces:**
- Produces `GET /api/v1/technician/data-center?period=last7days|last30days|week|month|year`.
- Returns `filter`, `summary`, `incomeModel`, aligned `series`, and exactly up to three `recentOrders`.

- [ ] **Step 1: Write failing period tests**

Assert Tokyo boundaries and bucket counts: 7 daily, 6 five-day, 7 daily, month-clipped weeks, and 12 months.

- [ ] **Step 2: Write failing service/API tests**

Cover current-identity scope, independent technician users, no-shop/no-profile empty state, aligned zero-filled buckets, confirmed financial income only, worked minutes, next arrangement, and recent-order limit 3.

- [ ] **Step 3: Verify RED**

Run the three suites. Expected: missing module/route failures.

- [ ] **Step 4: Implement domain, repository, service, route, RBAC, audit, and OpenAPI**

Use Prisma tagged queries or bounded Prisma reads; never accept a technician ID from the client. Fill every requested bucket even when its value is zero.

- [ ] **Step 5: Verify GREEN and commit**

Run the focused suites and commit Task 5 files.

### Task 6: Build the Technician Data Center UI and Period-Preserving Navigation

**Files:**
- Create: `src/api/technicianDataCenter.ts`
- Create: `src/components/technician/TechnicianDualTrendChart.tsx`
- Create: `src/components/technician/TechnicianIncomeModelDialog.tsx`
- Create: `src/components/technician/TechnicianRecentOrders.tsx`
- Create: `src/components/technician/TechnicianDataCenter.tsx`
- Create: `src/components/technician/TechnicianDualTrendChart.test.tsx`
- Create: `src/components/technician/TechnicianDataCenter.test.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.test.tsx`
- Modify: `src/components/mobile/MobileFullscreenHeader.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes the Task 5 API.
- Produces URL state `meTab=data&period=<period>&income=0|1&work=0|1` and schedule/detail navigation carrying `period`, `from`, `to`, and `returnTo`.

- [ ] **Step 1: Write failing chart and page interaction tests**

Assert both SVG polylines render, each legend toggles only its own line, period selection refetches once, no base-salary badge exists, the income-model button opens the dialog, only three orders render, and the schedule link preserves the resolved range.

- [ ] **Step 2: Verify RED**

Run the two new Vitest files and the portal regression test. Expected: missing component/UI failures.

- [ ] **Step 3: Implement the shared header and focused components**

Use a shared fullscreen header with back/title/settings and a footer slot for the segmented tabs. Render a dual-axis SVG from aligned server buckets and keep legend visibility in URL search params.

- [ ] **Step 4: Replace the placeholder data center**

Remove the current “statistics unavailable” placeholder only after the formal API adapter is wired. Show explicit loading, empty, forbidden, and retry states.

- [ ] **Step 5: Verify GREEN and commit**

Run the focused frontend tests and commit Task 6 files.

### Task 7: Complete the Existing Technician Order Detail and Schedule Range Handoff

**Files:**
- Modify: `src/features/technician-schedule/route-pages.tsx`
- Modify: `src/features/technician-schedule/route-pages.formal.test.tsx`
- Modify: `src/features/technician-schedule/route-pages.approved-ui.test.ts`
- Modify: `src/features/technician-schedule/FormalTechnicianScheduleWorkspace.tsx`
- Modify: `src/features/technician-schedule/model.ts`
- Modify: `src/features/technician-schedule/model.test.ts`
- Modify: `src/features/booking/api.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/tests/booking-api.test.ts`

**Interfaces:**
- Keeps `/technician/orders/:orderId` and `/technician/schedule`.
- Consumes `period`, `from`, `to`, `anchorDate`, and encoded `returnTo` query parameters.

- [ ] **Step 1: Write failing order-detail and schedule-range tests**

Assert the existing route renders dynamic status steps, formal service/shop/payment/source blocks, state-allowed actions, and back/schedule links that preserve the data-center range. Assert schedule initialization does not reset a valid supplied boundary to today.

- [ ] **Step 2: Verify RED**

Run the focused frontend suites and booking API suite. Expected: simplified detail and ignored-query failures.

- [ ] **Step 3: Extend only missing formal booking projections**

Add service image/summary, shop public facts, payment source, and status-step timestamps only where existing persisted relations provide them. Hide unavailable facts rather than synthesizing values.

- [ ] **Step 4: Rebuild the existing detail body with shared components**

Keep current mutation functions (`confirm`, `start`, `complete`, `cancel`) and status guards. Do not create a second order detail page.

- [ ] **Step 5: Apply the incoming period to the formal schedule workspace**

Parse and validate query values before deriving the initial calendar view/anchor. Invalid values fall back to the existing safe current-date behavior.

- [ ] **Step 6: Verify GREEN and commit**

Run the focused suites and commit Task 7 files.

### Task 8: Add Merchant Identity Card and Three-Tab Personal Center

**Files:**
- Create: `src/api/merchantProfile.ts`
- Create: `src/components/profile/EditableIdentityInfoCard.tsx`
- Create: `src/components/profile/EditableIdentityInfoCard.test.tsx`
- Modify: `src/pages/user/UserCenterPage.tsx`
- Modify: `src/pages/user/UserCenterPage.interaction.test.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.test.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes Task 4 merchant profile API.
- Produces merchant personal-center tabs `info | service | data`; service keeps `StoreDetailExperience`, data keeps the parallel task's `ShopAnalyticsDashboard` contract.

- [ ] **Step 1: Write failing shared-card and merchant-page tests**

Assert the merchant card reads/writes only merchant profile data, uses the user-card editing layout, supports avatar crop/privacy/cancel/save, and does not mutate `Shop`. Assert the header is back + `个人中心` + settings with three tabs beneath it.

- [ ] **Step 2: Verify RED**

Run the shared-card, user-center, and merchant-portal suites. Expected: missing adapter/component/tab failures.

- [ ] **Step 3: Extract presentation without sharing persistence**

Move only the reusable information-card view/edit shell from `UserCenterPage`; provide separate user and merchant adapters with distinct DTOs and save functions.

- [ ] **Step 4: Replace only `/merchant/me` header and tab content**

Do not edit `ShopAnalyticsDashboard`. Preserve merchant navigation, shop switching, service presentation, settings paths, and all other active views.

- [ ] **Step 5: Verify GREEN and commit**

Run the focused frontend tests and commit Task 8 files.

### Task 9: Complete Documentation, Static Verification, Database Verification, and Browser Acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/api.md`
- Modify: `docs/database.md`
- Modify: the files found by the final i18n and OpenAPI audits only when directly related.

**Interfaces:**
- Produces final reproducible verification evidence.

- [ ] **Step 1: Scan changed files for forbidden patterns and scope drift**

Run `git diff --check`, focused `rg` scans for `TODO|FIXME|not implemented`, and inspect `git diff --name-only` against this plan.

- [ ] **Step 2: Verify generated client and database migration**

Run `npm --prefix backend run prisma:generate`, `npm --prefix backend run prisma:status`, then inspect physical columns/tables and `_prisma_migrations`. Apply only the new migration to the configured local non-production database when status and physical schema agree.

- [ ] **Step 3: Run quality gates**

Run backend focused/full tests, backend lint/build, frontend focused/full tests, `npm run lint`, `npm run i18n:audit`, and `npm run verify:production-build`.

- [ ] **Step 4: Prove runtime ownership before browser acceptance**

Verify listener PID, cwd, branch, `/health`, `/ready`, and the Vite proxy target for ports 3000 and 5180. Do not accept a different worktree or alternate port as proof.

- [ ] **Step 5: Browser acceptance at 440×956**

Using formal authenticated test identities, verify technician save, five periods, both legend toggles, income-model detail, three order links, completed order detail, return state, schedule range, merchant independent card, service/data tabs, dark/light themes, no horizontal overflow, no console errors, and no failed requests.

- [ ] **Step 6: Commit documentation and final directly related fixes**

Commit only this task's files. Do not push, deploy, merge another worktree, seed production, or claim project-wide completion.
