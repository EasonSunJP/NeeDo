# Employee Payroll Schedule Policy Implementation Plan

> **For Codex:** Execute this plan one task at a time with test-driven development. Keep the scope to the approved settlement-schedule microstep; do not add automatic bank transfers or expand payout completion.

**Goal:** Add a real, versioned shop payroll schedule policy, optional employee-level override, Japan business-calendar adjustment, and merchant UI for store defaults plus the employee detail card.

**Architecture:** Introduce a dedicated payroll-schedule-policy module beside the existing compensation and payroll modules. The shop policy and employee override are versioned database records selected by effective date. A pure date calculator derives the natural settlement period and planned payment date, while a repository-backed Japan business calendar supplies holiday facts. Merchant APIs derive shop scope from the active JWT identity and resolve employees by canonical technician NeeDoID.

**Tech Stack:** Prisma/MySQL, Express/TypeScript, Zod, JWT/RBAC, OpenAPI, Jest/Supertest, React/TypeScript/Vite, existing NeeDo merchant design tokens.

---

## Scope contract

- Daily, weekly, and monthly settlement periods.
- Weekly weekday and monthly day 1–31 validation.
- Monthly day 29–31 falls back to the last calendar day when absent.
- Weekend and official Japanese holiday adjustment to previous or next business day.
- Shop default policy and employee override linked to `TechnicianShopAffiliation`.
- `inheritShopPolicy=true` removes ambiguity: effective employee output comes from the current shop policy.
- Shop-scope read for owner/manager/finance roles; write only through the existing payroll write permission.
- Employee policy access requires both payroll permission and an active affiliation in the JWT shop.
- Store settings and employee card use real APIs and server snapshots; failed saves retain drafts.
- No automatic transfer, no payout record changes, no pay-run state-machine rewrite, and no mock fallback.

## Task 1: Add failing contract and calculator tests

**Files:**

- Create: `backend/tests/payroll-schedule-policy.calculator.test.ts`
- Create: `backend/tests/payroll-schedule-policy.validator.test.ts`
- Create: `backend/src/domain/payroll-schedule-policy.ts`
- Create: `backend/src/validators/payroll-schedule-policy.validator.ts`

**Steps:**

1. Write calculator tests for daily, weekly, monthly, short-month day 31, leap-year February, previous-business-day, next-business-day, weekend chains, holiday chains, and timezone-stable ISO output.
2. Write Zod tests proving cadence-specific required/forbidden fields and rejecting invalid weekday, month day, timezone, effective range, and non-technician NeeDoID.
3. Run:

   ```bash
   npm --prefix backend test -- --runInBand tests/payroll-schedule-policy.calculator.test.ts tests/payroll-schedule-policy.validator.test.ts
   ```

   Confirm the new tests fail for missing behavior.
4. Implement the pure calendar calculator and Zod schemas without database access.
5. Re-run the focused tests and confirm they pass.

## Task 2: Add versioned policy and business-calendar persistence

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260829123000_employee_payroll_schedule_policy/migration.sql`
- Create: `backend/src/repositories/payroll-schedule-policy.repository.ts`
- Create: `backend/tests/payroll-schedule-policy.repository.test.ts`
- Create: `backend/scripts/check-payroll-schedule-policy.ts`
- Modify: `backend/package.json`

**Steps:**

1. Write repository tests for active policy selection by effective date, version increments, retirement of the previous active version, shop isolation, affiliation-bound overrides, inheritance resolution, and business-calendar range reads.
2. Add additive models:
   - `ShopPayrollSchedulePolicy`
   - `TechnicianPayrollScheduleOverride`
   - `BusinessCalendarDate`
3. Keep all records soft-deletable and indexed by shop/affiliation/effective range/status; use foreign keys for shop, affiliation, and audit users.
4. Add an idempotent migration that creates the tables and imports the current official Cabinet Office Japan holiday dates needed for the supported planning horizon, tagged with a source version and URL. Weekend business-day status remains algorithmic; persisted rows represent official holiday facts and explicit calendar exceptions.
5. Implement repository transactions that lock the current policy owner row, close the prior active version, and insert the next immutable version.
6. Add a checker that verifies one current shop version, at most one current override per affiliation, no cadence-field contradictions, and calendar coverage around the supported horizon.
7. Run the focused repository tests and Prisma validation/generation.

## Task 3: Add real merchant APIs, RBAC, OpenAPI, and audit

**Files:**

- Create: `backend/src/services/payroll-schedule-policy.service.ts`
- Create: `backend/src/controllers/payroll-schedule-policy.controller.ts`
- Create: `backend/src/routes/payroll-schedule-policy.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/payroll-schedule-policy.service.test.ts`
- Create: `backend/tests/payroll-schedule-policy.routes.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Steps:**

1. Write service tests covering identity shop scope, safe employee lookup by canonical `s##########`, ended/non-member affiliation denial, effective shop/override resolution, next period preview, versioning, and audit metadata without private employee data.
2. Write route tests for authentication, read/write permissions, Zod 400 responses, store scope ignoring client shop IDs, stable 403/404/409 errors, and standard response envelopes.
3. Expose:

   ```text
   GET /api/v1/merchant-admin/payroll-schedule-policy
   PUT /api/v1/merchant-admin/payroll-schedule-policy
   GET /api/v1/merchant-admin/employees/:needoId/payroll-schedule-policy
   PUT /api/v1/merchant-admin/employees/:needoId/payroll-schedule-policy
   ```

4. Use `merchant-admin:payroll:read` for reads and `merchant-admin:payroll:write` for writes; do not reuse basic employee-affiliation write permission.
5. Return the stored source policy, resolved effective policy, current/next natural settlement period, natural settlement date, adjusted planned payment date, and adjustment reason.
6. Audit shop and employee policy version changes with shop-scoped metadata containing only cadence, adjustment, version, and changed field names.
7. Document all schemas and responses in OpenAPI and run focused route/service/OpenAPI tests.

## Task 4: Add typed frontend API and failing UI tests

**Files:**

- Create: `src/api/payrollSchedulePolicy.ts`
- Create: `src/api/payrollSchedulePolicy.test.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminSettingsPage.test.ts`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.test.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`

**Steps:**

1. Write adapter tests for all four endpoints, canonical NeeDoID URL encoding, request shapes without `shopId`, and response typing.
2. Write store-settings tests for loading, editing, cadence-dependent inputs, save/reload, cancel, permissions/errors, and planned payment preview.
3. Write employee-card tests for inherited source, individual override, revert-to-store-default, save/reload, draft retention after failure, and no internal database IDs.
4. Confirm the focused frontend tests fail before UI implementation.

## Task 5: Implement store policy settings in the existing merchant style

**Files:**

- Modify: `src/pages/merchant-admin/MerchantAdminSettingsPage.tsx`
- Modify: `src/api/payrollSchedulePolicy.ts`
- Modify: `src/i18n/translations.ts`

**Steps:**

1. Add a “工资结算周期” section below formal shop basics using the existing rounded cards, blue/ink surfaces, border tokens, compact badges, and current button/input primitives.
2. Show cadence, weekly weekday or monthly day, holiday behavior, timezone, version/effective state, current period, natural settlement date, and adjusted planned payment date.
3. Implement inline edit/cancel/save. Saving waits for the API, reloads the server snapshot, and never reports success before persistence.
4. Explain clearly that NeeDo calculates and records dates only; finance staff still register actual payment manually in “财务结算”.
5. Add all new user-visible copy through the existing i18n table.
6. Run the focused settings and API tests.

## Task 6: Implement employee override in the employee detail card

**Files:**

- Modify: `src/components/merchant-admin/EmployeeDetailCard.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `src/i18n/translations.ts`

**Steps:**

1. Load the employee payroll policy only after the base employee detail resolves; isolate loading/error/retry state from profile and affiliation sections.
2. Add a “薪酬与结算” schedule subsection in the same information-card hierarchy, showing inherited/individual source and the next planned payment date.
3. Allow payroll-write users to switch between shop inheritance and an individual cadence, with cadence-specific fields and holiday behavior.
4. Save through the canonical NeeDoID endpoint, reload the effective policy, retain rejected drafts, and reset when changing employees or closing the drawer.
5. Do not add salary amounts, commission editing, payout confirmation, or a duplicate calendar in this microstep.
6. Run the focused people/card/API tests.

## Task 7: Migration, formal verification, docs, and visual acceptance

**Files:**

- Modify: `docs/employee-affiliation.md`
- Modify: `docs/backoffice-real-data.md`
- Modify: `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`

**Steps:**

1. Back up the local formal database before migration.
2. Apply the migration with `ENV_FILE=.env.dev`, then run Prisma status and the payroll schedule policy checker.
3. Run:

   ```bash
   npm --prefix backend test -- --runInBand tests/payroll-schedule-policy.calculator.test.ts tests/payroll-schedule-policy.validator.test.ts tests/payroll-schedule-policy.repository.test.ts tests/payroll-schedule-policy.service.test.ts tests/payroll-schedule-policy.routes.test.ts tests/openapi.test.ts
   npm test -- --runInBand src/api/payrollSchedulePolicy.test.ts src/pages/merchant-admin/MerchantAdminSettingsPage.test.tsx src/components/merchant-admin/EmployeeDetailCard.test.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
   npm run lint
   npm run verify:production-build
   ```

4. Restart the formal backend/frontend from this worktree and verify health/readiness.
5. Browser-accept the store default on `/merchant-admin/settings` and an employee override on `/merchant-admin/people?module=staff`, including reload persistence, daily/weekly/monthly controls, holiday preview, inheritance reset, permission errors, and narrow width.
6. Confirm no raw auth keys, internal profile/account IDs, mock fallback, automatic-transfer wording, or off-palette UI appears.
7. Update docs with the migration, APIs, permissions, audit actions, official calendar source/version, test evidence, and intentionally deferred manual payout-completion work.
