# Dashboard and Test NDP Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the operations dashboard and add secure Test NDP participant management, per-admin visibility, audited Test NDP credit, and formal NDP approval entry.

**Architecture:** Keep `User.isTestAccount` as the sole participant source, derive test-shop eligibility from authoritative ownership, and centralize Test NDP eligibility and operations-visibility policies in backend services. Extend existing ledger and wallet-adjustment paths rather than introducing direct balance edits or a second wallet system.

**Tech Stack:** React 19, TypeScript strict, Express, Prisma/MySQL, Zod, Jest/Supertest, Vitest.

## Global Constraints

- Work only on `codex/test-ndp-operations`; do not use port 5180 before local-main merge.
- Test NDP never enters formal withdrawal, payout, reconciliation, settlement, or formal exports.
- All writes are transactional, idempotent where repeatable, permission-gated, and audited.
- No push, PR, staging deployment, SSH, or remote mutation.

---

### Task 1: Dashboard anomaly degradation and independent loading

**Files:**
- Modify: `backend/src/repositories/dashboard-commission.repository.ts`
- Test: `backend/tests/dashboard-commission.repository.test.ts`
- Modify: `src/pages/admin/DashboardPage.tsx`
- Test: `src/pages/admin/DashboardPage.loading.test.tsx`

**Interfaces:**
- `CommissionFacts` permits `not_available` for the two technician commission facts only.
- Dashboard main data and overview have independent load states.

- [ ] Write a repository regression test asserting a salary anomaly produces `not_available` technician commission values while independent commission facts remain ready.
- [ ] Run the repository test and confirm the old exception fails it.
- [ ] Implement per-metric degradation without fabricating salary values.
- [ ] Write a UI test asserting main dashboard content remains visible when overview rejects.
- [ ] Run the UI test and confirm `Promise.all` causes the expected failure.
- [ ] Split loading into independently committed dashboard and overview results, retaining request cancellation and filter coherence.
- [ ] Run focused backend and frontend tests.

### Task 2: Per-admin Test NDP visibility preference

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260922010000_backoffice_test_ndp_preferences/migration.sql`
- Create: `backend/src/repositories/backoffice-preference.repository.ts`
- Create: `backend/src/services/backoffice-preference.service.ts`
- Create: `backend/src/controllers/backoffice-preference.controller.ts`
- Create: `backend/src/routes/backoffice-preference.routes.ts`
- Create: `backend/src/validators/backoffice-preference.validator.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/backoffice-preference.service.test.ts`
- Test: `backend/tests/backoffice-preference-api.test.ts`

**Interfaces:**
- `getEffective(userId): Promise<{ showTestNdpData: boolean; source: "explicit" | "environment_default" }>`.
- `update(actor, context, { showTestNdpData }): Promise<BackofficePreferencePayload>`.
- `GET/PUT /api/v1/backoffice/preferences/test-ndp-visibility`.

- [ ] Write failing service tests for non-prod default on, prod default off, explicit per-user override, and audit creation.
- [ ] Run tests and confirm missing service failures.
- [ ] Add the one-to-one preference model and reversible migration.
- [ ] Implement repository, service, validation, controller, routes, and dependency wiring.
- [ ] Write and run API permission/identity tests.
- [ ] Generate Prisma client and rerun focused tests.

### Task 3: Test participant list and removal safety

**Files:**
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/repositories/test-account.repository.ts`
- Modify: `backend/src/services/test-account.service.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/prisma/migrations/20260922011000_restrict_test_account_management/migration.sql`
- Test: `backend/tests/test-account.service.test.ts`
- Test: `backend/tests/backoffice-user-list.repository.test.ts`

**Interfaces:**
- Managed-user query accepts `isTestAccount?: boolean`.
- Removing a test account checks both user and authoritatively owned-shop Test NDP activity.

- [ ] Write failing list-filter and shop-activity removal tests.
- [ ] Run tests and verify expected failures.
- [ ] Add the query filter and extend active-financial-state checks to owned shops.
- [ ] Remove test-account update permissions from the default operator role while retaining them for admin and delegated roles.
- [ ] Run focused service/repository/permission tests.

### Task 4: Central Test NDP participant enforcement

**Files:**
- Create: `backend/src/services/test-ndp-eligibility.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Test: `backend/tests/ledger-service.test.ts`
- Test: `backend/tests/order-checkout-ledger.test.ts`
- Test: `backend/tests/test-ndp-eligibility.service.test.ts`

**Interfaces:**
- Ledger repository resolves eligibility for user, shop, merchant-account, and alliance owners.
- `assertEligibleOwners(currency, owners)` is a no-op for NDP and fails before mutation for ineligible Test NDP owners.
- Checkout ledger input includes `shopId` so both customer and shop are checked.

- [ ] Write failing eligibility tests for test user/test shop success and every mixed-party rejection.
- [ ] Run tests and confirm missing enforcement failures.
- [ ] Implement the eligibility service and repository queries.
- [ ] Route wallet creation and checkout mutations through eligibility checks.
- [ ] Add `shopId` to checkout debit input and booking call site.
- [ ] Run ledger and checkout tests.

### Task 5: Audited Test NDP manual credit and formal NDP request creation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260922012000_test_ndp_manual_credit/migration.sql`
- Create: `backend/src/services/test-ndp-credit.service.ts`
- Create: `backend/src/repositories/test-ndp-credit.repository.ts`
- Create: `backend/src/controllers/test-ndp-credit.controller.ts`
- Create: `backend/src/routes/test-ndp-credit.routes.ts`
- Create: `backend/src/validators/test-ndp-credit.validator.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/routes/ledger.routes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Test: `backend/tests/test-ndp-credit.service.test.ts`
- Test: `backend/tests/ledger-api.test.ts`
- Test: `backend/tests/wallet-adjustment-service.test.ts`

**Interfaces:**
- `POST /api/v1/backoffice/test-ndp/credits` accepts target owner, positive amount, reason, idempotency key.
- `POST /api/v1/backoffice/wallet-adjustments` creates a pending formal NDP top-up for a target user.

- [ ] Write failing tests for eligibility, permission, idempotency replay/conflict, ledger entry, and audit atomicity.
- [ ] Add `TEST_NDP_MANUAL_CREDIT` to the Prisma enum and migration.
- [ ] Implement the credit transaction without direct balance editing outside the transaction repository.
- [ ] Add a dedicated credit permission assigned to admin/finance, not default operator.
- [ ] Write failing formal-request tests for target-user creation and self-review rejection.
- [ ] Extend the existing wallet-adjustment service/routes minimally and run focused tests.

### Task 6: Server-side visibility filtering for operations data

**Files:**
- Modify: `backend/src/domain/dashboard.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/repositories/dashboard.repository.ts`
- Modify: `backend/src/repositories/dashboard-finance.repository.ts`
- Modify: `backend/src/repositories/analytics-ranking.repository.ts`
- Modify: `backend/src/services/analytics-ranking.service.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Test: `backend/tests/dashboard-finance.repository.test.ts`
- Test: `backend/tests/analytics-ranking.repository.test.ts`
- Test: `backend/tests/backoffice-user-list.repository.test.ts`
- Test: `backend/tests/backoffice-api.test.ts`

**Interfaces:**
- Operations read inputs carry `showTestNdpData` resolved for the authenticated admin.
- Source queries exclude `TEST_NDP` rows when false; response metadata tells the UI whether Test NDP is visible.

- [ ] Write failing cross-admin tests showing the same endpoint includes or excludes Test NDP by actor preference.
- [ ] Add source-query filtering for dashboard orders/finance, rankings, managed-user balances, orders, settlements, summaries, ledger reads, and exports touched by current operations routes.
- [ ] Ensure formal values are recomputed from source rows rather than subtracting after aggregation.
- [ ] Run repository, service, API, export, and OpenAPI tests.

### Task 7: Operations settings, participant management, and NDP actions UI

**Files:**
- Create: `src/features/admin-system-settings/TestNdpSettingsTab.tsx`
- Modify: `src/features/admin-system-settings/SystemSettingsPage.tsx`
- Modify: `src/features/admin-system-settings/api.ts`
- Modify: `src/features/admin-system-settings/types.ts`
- Modify: `src/features/platform-user-management/api.ts`
- Modify: `src/features/platform-user-management/types.ts`
- Modify: `src/features/platform-user-management/UnifiedUserDetailDrawer.tsx`
- Modify: `src/pages/admin/FinancePage.tsx`
- Modify: `src/features/wallet/api.ts`
- Modify: `src/components/admin/NdpMetricValue.tsx`
- Test: `src/features/admin-system-settings/TestNdpSettingsTab.test.tsx`
- Test: `src/features/platform-user-management/UnifiedUserDetailDrawer.test.tsx`
- Test: `src/pages/admin/FinancePage.test.tsx`

**Interfaces:**
- Settings API reads/writes the current admin preference and lists/adds/removes test accounts.
- User detail action chooses Test NDP direct credit for eligible targets or formal NDP pending request.
- Finance page lists and reviews pending formal NDP requests.

- [ ] Write failing API and component tests for the personal toggle, participant list permissions, conditional balance display, hidden Test NDP actions, credit submission, formal request, and second-person review.
- [ ] Implement the settings tab and user-detail action using existing components and permission gates.
- [ ] Implement the finance review section using existing wallet-adjustment APIs.
- [ ] Hide Test NDP values when response visibility is false while preserving conditional display for users with wallets.
- [ ] Run focused Vitest suites.

### Task 8: Integrated verification, documentation, commit, merge, and cleanup

**Files:**
- Modify: `docs/ledger.md`
- Modify: `backend/src/api/openapi.ts`
- Review: all changed files.

- [ ] Update ledger and OpenAPI contracts with participant, visibility, credit, and formal-review rules.
- [ ] Run focused backend and frontend suites, backend/frontend lint, backend/frontend builds, Prisma validation, and migration inspection.
- [ ] Start isolated local services on non-5180 ports and perform authenticated browser/API acceptance.
- [ ] Review `git diff`, commit the complete batch on `codex/test-ndp-operations`, and verify clean status.
- [ ] Merge the branch into local main without pulling or pushing.
- [ ] Run final tests on local main, then allow 5180 to load final main and perform dashboard/settings/NDP smoke verification.
- [ ] Remove only the merged worktree and branch created for this conversation; preserve unrelated worktrees.
