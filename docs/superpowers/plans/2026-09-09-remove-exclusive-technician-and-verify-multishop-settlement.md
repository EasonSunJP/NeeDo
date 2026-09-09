# Remove Exclusive Technician And Verify Multi-Shop Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the exclusive-technician business constraint while preserving legacy storage, add technician-side multi-shop onboarding and zero-shop pause behavior, then retain and verify one real local MySQL fixture covering one technician in three stores, both pricing sources, TEST_NDP, cash, and merchant/operations income projections.

**Architecture:** Keep the physical affiliation enum for backward compatibility, but expose a single `partner` contract and normalize legacy `EXCLUSIVE` rows at repository boundaries. Reuse the existing pricing, booking, checkout, compensation, and dashboard authorities; add one guarded, idempotent acceptance script that persists stable QA evidence instead of creating a second financial model.

**Tech Stack:** TypeScript, Express, Zod, Prisma 7, MySQL 8, Jest/Supertest, React 19, Vitest.

## Global Constraints

- Work only in `/Users/eason/Documents/New project`; preserve unrelated technician-schedule changes.
- Make no remote push, deployment, staging mutation, or production data change.
- Add no mock, fake API, placeholder, or unfinished-marker comments.
- Use a loopback, non-production MySQL database for fixture writes; leave the accepted fixture in place.
- Write a failing automated test before every production-code behavior change.
- Keep current row locking, store scoping, RBAC, audit, soft-history, and active-key uniqueness.
- Customer-facing prices and compensation percentages do not change in this microstep.

---

### Task 1: Collapse The Active Affiliation Contract To Collaboration

**Files:**
- Modify: `backend/tests/technician-shop-affiliation.repository.test.ts`
- Modify: `backend/tests/technician-shop-affiliation.service.test.ts`
- Modify: `backend/tests/technician-shop-affiliation-api.test.ts`
- Modify: `backend/src/services/technician-shop-affiliation.service.ts`
- Modify: `backend/src/repositories/technician-shop-affiliation.repository.ts`
- Modify: `backend/src/validators/technician-shop-affiliation.validator.ts`

**Interfaces:**
- Consumes: existing `TechnicianShopAffiliation` rows and merchant-scoped employee routes.
- Produces: `EmployeeRelationshipType = "partner"`; mutation input accepts `partner`; legacy stored values map to `partner`; repository result is employee or `not_found` only.

- [ ] **Step 1: Write failing repository tests**

Add a repository test whose transaction contains three current rows for the same technician, including one stored `EXCLUSIVE`, and assert that creating/updating a fourth store as `partner` succeeds and every mapped relationship is `partner`. Also assert that no cross-store `relationshipType` conflict query controls the result.

- [ ] **Step 2: Run repository tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/technician-shop-affiliation.repository.test.ts
```

Expected: FAIL because the current repository returns `exclusive_conflict` or maps `EXCLUSIVE` as `exclusive`.

- [ ] **Step 3: Write failing service/API validation tests**

Require `relationshipType=exclusive` to return validation failure, `partner` to succeed, and remove the service expectation that maps an `exclusive_conflict` sentinel to 409.

- [ ] **Step 4: Run service/API tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/technician-shop-affiliation.service.test.ts tests/technician-shop-affiliation-api.test.ts
```

Expected: FAIL because the validator and service still expose the old contract.

- [ ] **Step 5: Implement the minimal backend change**

Make the public type literal `partner`, normalize all mapped records with:

```ts
relationshipType: "partner"
```

Remove `exclusive_conflict` from the repository port/result and service error path. During current-affiliation upsert, read only the row for the authenticated store and write storage value `PARTNER`; do not reject based on other stores.

- [ ] **Step 6: Verify GREEN**

Run the three focused suites again and require zero failures.

- [ ] **Step 7: Commit**

Commit only Task 1 files with message `fix(employees): remove exclusive affiliation constraint`.

---

### Task 2: Remove Exclusive Relationship From Public And Merchant Surfaces

**Files:**
- Modify: `backend/tests/openapi.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/repositories/shop-employee-directory.repository.ts`
- Modify: `backend/src/repositories/technician-data-center.repository.ts`
- Modify: `src/features/merchant-admin/employeeApi.test.ts`
- Modify: `src/features/merchant-admin/employeeApi.ts`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.test.tsx`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `docs/employee-affiliation.md`

**Interfaces:**
- Consumes: the Task 1 single-value `partner` contract.
- Produces: OpenAPI, adapters, data-center projections, employee details, filters, and labels without a dedicated/exclusive option or error.

- [ ] **Step 1: Write failing source/render/OpenAPI tests**

Assert that merchant UI source contains no `专属技师`, no `exclusive_conflict`, and no exclusive relationship selector; legacy API payload fixtures normalize to `partner`. Assert OpenAPI mutation/list schemas expose only `partner` and no conflict description.

- [ ] **Step 2: Verify RED**

Run the focused backend OpenAPI and frontend employee tests. Expected failures must point to old exclusive values or labels.

- [ ] **Step 3: Implement the minimal surface change**

Remove the old choice and error branch, normalize legacy rows in secondary repositories, keep the displayed label `合作技师`, and rewrite `docs/employee-affiliation.md` to make affiliation count the only representation of one-store versus multi-store work.

- [ ] **Step 4: Verify GREEN and five-language audit**

Run the focused suites plus `npm run i18n:audit`; do not bulk-edit unrelated translations whose use of “exclusive” belongs to other product domains.

- [ ] **Step 5: Commit**

Commit only Task 2 files with message `fix(portals): retire exclusive technician concept`.

---

### Task 3: Add A Persistent Real-MySQL Multi-Shop Pricing And Settlement Checker

**Files:**
- Create: `backend/tests/multishop-pricing-settlement-flow-script.test.ts`
- Create: `backend/scripts/check-multishop-pricing-settlement-flow.ts`
- Modify: `backend/package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: `FORMAL_BACKEND_ENV_FILE`, Prisma, existing pricing source resolution, booking/checkouts, compensation engine, merchant dashboard, and operations finance repositories.
- Produces: `npm --prefix backend run check:multishop-pricing-settlement`; stable retained fixture marker `qa-multishop-pricing-settlement-20260909`; printed public IDs/order numbers and exact expected/actual evidence.

- [ ] **Step 1: Write the failing checker contract test**

Assert that the script refuses missing/remote/production-looking environments, contains no cleanup or rollback transaction around the accepted fixture, is stable-marker idempotent, and verifies all required source/payment/split/admin assertions.

- [ ] **Step 2: Verify RED**

Run the new Jest file. Expected: FAIL because the checker and npm command do not exist.

- [ ] **Step 3: Implement guarded idempotent fixture creation**

Load the selected environment file without printing credentials. Refuse non-loopback hosts and production/staging flags or names. Upsert one test customer, one test technician, three published shops, three active `PARTNER` affiliations, shop/technician services, distinct compensation rules, schedules, and stable order identifiers. Re-runs must verify or repair only marker-owned incomplete fixture rows and must never delete accepted evidence.

- [ ] **Step 4: Exercise booking-source and payment authorities**

Use existing services/repositories for source navigation and booking validation. Complete at least one TEST_NDP checkout and one offline-cash checkout across both pricing modes. Record immutable compensation basis versions, exact customer wallet debit/no-debit evidence, receipt confirmation, histories, audits, and finance records.

- [ ] **Step 5: Verify merchant and operations projections**

Query the existing merchant and operations finance/dashboard authorities with correct authenticated scopes. Compare returned order counts, GMV, technician compensation, shop retained income, payment channels, and TEST_NDP separation to direct persisted evidence.

- [ ] **Step 6: Run the checker twice**

Run:

```bash
FORMAL_BACKEND_ENV_FILE=.env.dev npm --prefix backend run check:multishop-pricing-settlement
FORMAL_BACKEND_ENV_FILE=.env.dev npm --prefix backend run check:multishop-pricing-settlement
```

Expected: both runs pass; the second reports reused fixture IDs and unchanged marker-owned counts.

- [ ] **Step 7: Commit**

Commit only Task 3 files with message `test(settlement): retain multishop real-data acceptance`.

---

### Task 4: Add Technician Shop-Stay Management And Zero-Shop Pause

**Files:**
- Modify: technician self-profile, identity-application/review, authentication, OpenAPI, app routes, technician personal center, and translations.
- Create: `src/features/technician-shop-stays/TechnicianShopStayPage.tsx` and render tests.

**Interfaces:**
- Consumes: current formal affiliations, technician self profile, existing application/review workflow, and RBAC permissions.
- Produces: `入住店铺`, original-shop-first affiliation data, additional partnership application, and derived `active | requires_shop` access.

- [x] **Step 1: Add failing profile, application, approval, route, and render tests**
- [x] **Step 2: Return current shops and derived access status from the formal self-profile API**
- [x] **Step 3: Reuse the review workflow without recreating or replacing an existing technician identity**
- [x] **Step 4: Create the personal-center entry, shop list, and `追加` route**
- [x] **Step 5: Gate technician work routes and permissions when current affiliation count is zero**

---

### Task 5: Full Verification And Local Acceptance

**Files:**
- Modify only if a new reproducible failure requires a TDD repair within this task's approved scope.

**Interfaces:**
- Consumes: Tasks 1-3 and the current local listeners.
- Produces: fresh command outputs and authenticated browser evidence, reported separately from push/deployment/staging.

- [ ] **Step 1: Respect protected runtime boundaries**

Do not inspect, stop, restart, or send requests to port 5180. If a new local listener is required, first verify and use an unoccupied alternative such as 5181, 5182, 5183, 5190, or 5200.

- [ ] **Step 2: Run focused and full automated verification**

Run Prisma status, focused affiliation/pricing/settlement tests, backend lint/build, frontend lint/build, i18n audit, and `git diff --check`.

- [ ] **Step 3: Run local browser checks only if they can be isolated from port 5180**

Using the retained real test identities, verify merchant-priced store service cards, technician-priced technician/service cards, the three store employee views, merchant finance data after switching store scope, and operations finance/detail visibility. Capture console/network errors and do not claim UI acceptance if authentication or routing blocks a target.

- [ ] **Step 4: Reconcile evidence**

Compare browser-visible service names, order numbers, amounts, payment channels, and split amounts with direct database/checker output. Report local code, persistent local data, automated checks, and browser checks separately; explicitly state that no push/deploy/staging occurred.
