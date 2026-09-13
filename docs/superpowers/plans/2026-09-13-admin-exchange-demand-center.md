# Admin Exchange Demand Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the operations Exchange capability gate with a formally persisted, privacy-bounded, read-only demand/intelligence, claim, matching, fee, and audit verification center.

**Architecture:** Add one backoffice-only `ExchangeOperationsRepository -> Service -> Controller -> Routes` projection over the existing Exchange and ledger tables. Consume that contract from the existing admin page with the shared operations UI components; do not add transaction state or mutations.

**Tech Stack:** React 19, TypeScript, Vite, Express, Zod, Prisma/MySQL, JWT/RBAC, Jest/Supertest, Vitest.

## Global Constraints

- Use existing Exchange and ledger tables as the only source of truth; no mock, fake API, static records, or second state.
- Keep all operations local and keep port 5180 untouched until after the feature branch is merged into local main.
- Do not add review, rejection, forced withdrawal, export, or financial mutation rules.
- Never return email, phone, internal actor IDs, address line 2, or address line 3 from the operations contract.
- Every list is paginated, every input is Zod validated, every protected route has a dedicated permission, and soft-deleted rows are excluded.

---

### Task 1: Lock the disabled-page and contract gap with failing tests

**Files:**
- Modify: `src/pages/admin/AdminCapabilityRoutes.test.ts`
- Create: `src/pages/admin/NeedoExchangeAdminPage.test.tsx`
- Create: `src/api/exchangeOperations.test.ts`
- Create: `backend/tests/exchange-operations.service.test.ts`
- Create: `backend/tests/exchange-operations.routes.test.ts`
- Create: `backend/tests/exchange-operations.openapi.test.ts`
- Create: `backend/tests/exchange-operations-permissions.test.ts`

**Interfaces:**
- Produces expected public paths `GET /backoffice/exchange/posts` and `GET /backoffice/exchange/posts/:id`.
- Produces expected permission `backoffice:exchange:read` and the redacted DTO contract documented in the design.

- [ ] Replace capability-gate assertions with assertions for formal API loading, pagination, filters, detail, financial evidence, and the absence of demo sources.
- [ ] Add backend tests with repository fixtures for demand/intelligence, all existing post states, claims, matching, financial evidence and timelines.
- [ ] Run the focused frontend and backend commands and confirm failures are caused by missing operations modules/routes.
- [ ] Commit the red tests together with the minimal public test fixtures.

### Task 2: Implement the backoffice read projection and RBAC contract

**Files:**
- Create: `backend/src/types/exchange-operations.types.ts`
- Create: `backend/src/validators/exchange-operations.validator.ts`
- Create: `backend/src/repositories/exchange-operations.repository.ts`
- Create: `backend/src/services/exchange-operations.service.ts`
- Create: `backend/src/controllers/exchange-operations.controller.ts`
- Create: `backend/src/routes/exchange-operations.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/prisma/migrations/20260913110000_exchange_operations_read_permission/migration.sql`

**Interfaces:**
- `ExchangeOperationsService.list(query)` returns `{ list, total, page, page_size }`.
- `ExchangeOperationsService.detail(postId)` returns one redacted operations detail or raises the standard 404 envelope.
- `EXCHANGE_OPERATIONS_PERMISSIONS.read` equals `backoffice:exchange:read` and is assigned only to admin, operator and viewer.

- [ ] Implement strict Zod list and id schemas with page size `1..100` and only current persisted enum values.
- [ ] Implement repository filtering and eager-loading with `deletedAt: null` at every business relation boundary.
- [ ] Map only the approved redacted publisher/address/provider/financial/timeline fields in the service.
- [ ] Mount authenticated, permission-protected read routes in the backoffice manifest and document them in OpenAPI.
- [ ] Add the additive permission migration with idempotent permission and role assignments and no destructive SQL.
- [ ] Run service, route, permission and OpenAPI tests until green, then run related Exchange suites.
- [ ] Commit the backend read boundary.

### Task 3: Replace the operations capability gate with the formal UI

**Files:**
- Create: `src/api/exchangeOperations.ts`
- Modify: `src/pages/admin/NeedoExchangeAdminPage.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `exchangeOperationsApi.list(query)` consumes the paginated operations DTO.
- `exchangeOperationsApi.detail(id)` consumes the redacted detail DTO.
- Demand and information routes use the same page with a fixed `type` query and dedicated frontend permission guard.

- [ ] Implement runtime response validation for list/detail before rendering.
- [ ] Render status/type/publisher/service/budget/expiry/claim/match/financial columns with server pagination and filters.
- [ ] Render the detail drawer with redacted publication, claim, match, fee, and timeline evidence.
- [ ] Add loading, retry, permission, not-found and true empty states without sample rows.
- [ ] Change both routes and sidebar entries to require `backoffice:exchange:read`.
- [ ] Run the API and page Vitest suites until green, then run frontend typecheck/build.
- [ ] Commit the frontend formal operations center.

### Task 4: Integrated local verification, merge, and final 5180 proof

**Files:**
- Modify only directly related files if verification exposes a regression.

**Interfaces:**
- Feature branch and local main must expose identical tested contracts after merge.

- [ ] Run backend lint, build, focused Exchange inventory and new API suites.
- [ ] Run frontend lint, focused tests and production build.
- [ ] Start isolated backend/frontend ports other than 5180, prove listener PID/cwd/branch/proxy, and verify list/detail/API/RBAC and empty/error states.
- [ ] Commit any directly related fixes and verify a clean branch worktree.
- [ ] Merge the complete branch into local main without pull, push, PR or remote operations.
- [ ] Regenerate Prisma Client and rerun the same verification in local main.
- [ ] Only then let 5180 load latest local main; prove PID/cwd and verify operations list/detail/API/RBAC/core flow.
- [ ] Remove only the merged feature branch; preserve the harness-owned worktree and report it as not requiring cleanup.

