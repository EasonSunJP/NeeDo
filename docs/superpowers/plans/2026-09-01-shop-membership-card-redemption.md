# Shop Membership Card Redemption Implementation Plan

> **Execution:** Implement each task test-first, keep commits independently runnable, and do not begin the refund microstep until this plan is fully verified and merged locally.

**Goal:** Add formal completed-order membership-card redemption with rule-driven NDP settlement, platform fee collection, pending-funds recovery, merchant/customer history, RBAC, audit, notifications, and TEST UI.

**Architecture:** A dedicated Route -> Controller -> Service -> Repository chain locks the card and completed order, builds persisted reward facts, calls the existing pure rule evaluator, mutates the card, and invokes a membership reward settlement service inside the same Prisma transaction. Settlement reuses `LedgerRepositoryPort`; approved shop-wallet top-ups call a FIFO pending-reward allocator in the same wallet transaction.

**Tech stack:** React 19, TypeScript, Vite, Express, Zod, Prisma, MySQL 8, Jest, Supertest, Vitest.

## Global constraints

- Completed formal Booking orders only; no free-form service, customer, amount, reward, or fee input.
- No discount, gift, free service, bonus balance consumption, automatic extra uses, or NDP outside an applied ledger transaction.
- Stored-value consumes final payable JPY principal; count consumes one; benefit consumes neither.
- Plan version, rules, caps, and fee rate come from the card snapshot.
- Direct available-wallet debit only; no freeze. Insufficient funds create a complete pending reward, never a partial settlement.
- `merchant_staff` may redeem and read, but issue/top-up/adjust permissions remain unchanged.
- Refund remains outside this plan.

### Task 1: Schema, migration, and RBAC

**Files:**
- Modify `backend/prisma/schema.prisma`
- Create `backend/prisma/migrations/20260901050000_shop_membership_card_redemption/migration.sql`
- Modify `backend/src/constants/permissions.constants.ts`
- Create `backend/tests/shop-membership-card-redemption-schema.test.ts`
- Modify `backend/tests/shop-membership-permissions.test.ts`

- [ ] Write failing tests for redemption/reward enums, immutable evidence fields, checks/FKs/indexes, ledger type, and default roles.
- [ ] Run RED tests.
- [ ] Add additive schema/migration and grant `shop.member.card.redeem` to admin, merchant_owner, merchant_staff.
- [ ] Generate Prisma client and run GREEN tests.
- [ ] Commit `feat: add membership card redemption schema`.

### Task 2: Validator, reward facts, and service contract

**Files:**
- Create `backend/src/validators/shop-membership-card-redemption.validator.ts`
- Create `backend/src/services/shop-membership-card-redemption.service.ts`
- Modify `backend/src/domain/shop-membership-reward-rule.ts`
- Modify `backend/src/constants/error-codes.ts`
- Create validator/service tests and extend reward-rule tests.

- [ ] Write failing tests for request normalization, pagination, identity/shop scope, exact replay, nullable service public ID, and structured error mapping.
- [ ] Run RED tests.
- [ ] Implement SHA-256 fingerprint, audit input, evaluator callback, public mapping, and candidate/history contracts.
- [ ] Run GREEN tests.
- [ ] Commit `feat: define membership card redemption service`.

### Task 3: Atomic card/order repository

**Files:**
- Create `backend/src/repositories/shop-membership-card-redemption.repository.ts`
- Create `backend/tests/shop-membership-card-redemption.repository.test.ts`

- [ ] Write failing tests for card/order row locks, database time, active/unexpired state, same shop/customer, completed order, unique order, pending adjustment, immutable version/rules, history facts, card-type arithmetic, CAS, audit/notification atomicity, and scope.
- [ ] Run RED tests.
- [ ] Implement transaction orchestration with evaluator and settlement callbacks.
- [ ] Run GREEN tests.
- [ ] Commit `feat: persist membership card redemptions atomically`.

### Task 4: Direct NDP settlement and pending-funds allocation

**Files:**
- Create `backend/src/services/shop-membership-reward-settlement.service.ts`
- Extend `backend/src/services/ledger.service.ts`
- Extend `backend/src/routes/ledger.routes.ts`
- Add settlement and ledger regression tests.

- [ ] Write failing tests for balanced 1100 debit / 1000 customer / 100 platform entries, fee rounding, zero reward, insufficient pending, stable idempotency, wallet lock order, reconciliation, audit, FIFO allocation after approved NDP top-up, and no partial settlement.
- [ ] Run RED tests.
- [ ] Implement settlement with `LedgerRepositoryPort` and inject the pending allocator only into the formal wallet-review route.
- [ ] Run GREEN tests including existing wallet adjustment/booking/affiliate ledger suites.
- [ ] Commit `feat: settle membership rewards without freezing`.

### Task 5: API and OpenAPI

**Files:**
- Create controller/routes
- Modify `backend/src/app.ts`, `backend/src/api/openapi.ts`
- Add API/OpenAPI tests.

- [ ] Write failing API tests for candidates, create/replay, merchant/customer pagination, owner/staff permissions, cross-shop/customer hiding, and structured errors.
- [ ] Run RED tests.
- [ ] Implement routes, dependency injection, response envelope, and OpenAPI.
- [ ] Run GREEN tests.
- [ ] Commit `feat: expose membership card redemption API`.

### Task 6: Merchant and customer TEST UI

**Files:**
- Extend `src/features/shop-member/api.ts` and tests
- Create redemption model/dialog/history components and tests
- Modify `ShopMemberCenterPage.tsx`, `UserMembershipsPage.tsx`, i18n and tests.

- [ ] Write failing component/model/page/i18n tests.
- [ ] Run RED tests.
- [ ] Add `核销 TEST`, completed-order candidate sheet, exact preview, paginated histories, pending/paid/no-reward states, error/loading/empty states, and five locales.
- [ ] Run GREEN tests.
- [ ] Commit `feat: add membership card redemption UI`.

### Task 7: Real database and complete verification

**Files:**
- Create `backend/scripts/check-shop-membership-card-redemption-flow.ts`
- Modify package/docs and add checker contract tests.

- [ ] Write failing checker-contract tests.
- [ ] Implement guarded local/non-production rollback checker.
- [ ] Validate/apply only this reviewed migration if physically absent; independently verify tables, columns, checks, FKs, indexes, enum, and RBAC before marking applied.
- [ ] Run real rollback acceptance for all card types, rule facts, direct/pending settlements, top-up allocator, isolation, concurrency, rollback, and cleanup.
- [ ] Run Prisma validate/generate, targeted and full backend/frontend tests, lint, and build.
- [ ] Run isolated merchant/customer browser acceptance at mobile width with listener cwd/branch/proxy proof, TEST badges, interactions, no overflow, no console errors, and no failed requests.
- [ ] Self-review the full diff, synchronize latest main, rerun affected gates, merge locally, preserve unrelated dirty files, and do not push/deploy.
