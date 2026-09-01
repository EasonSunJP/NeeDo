# Shop Membership Card Refund Implementation Plan

> **Execution:** Implement test-first in small commits. Do not add membership-card purchase refunds, arbitrary balance edits, or unrelated order-state changes.

**Goal:** Restore a formally refunded Booking redemption, cancel or reverse its membership reward and platform fee, and expose audited merchant/customer TEST UI.

**Architecture:** A dedicated refund service/repository locks the redemption, card, and formal refunded Booking order. It restores card value additively, invokes a balanced `LedgerService` reversal for paid rewards, persists a separate refund aggregate, then writes audit and notification in the same Prisma transaction.

**Tech stack:** React 19, TypeScript, Vite, Express, Zod, Prisma, MySQL 8, Jest, Supertest, Vitest.

## Global constraints

- Require formal `paymentStatus=REFUNDED`; this endpoint never refunds the order payment.
- Restore only the immutable consumed principal/use; never change bonus, expiry, total uses, or card status.
- Cancel pending rewards with no wallet movement; reverse paid reward and platform fee in one balanced ledger transaction.
- Allow an exact reversal to make customer/platform NDP available balance negative; no freeze, partial reversal, or parallel debt table.
- `merchant_owner` and admin may refund; `merchant_staff` may not.
- Every list remains paginated and every mutation has Zod, RBAC, OpenAPI, audit, notification, and idempotency.

### Task 1: Design, schema, migration, and RBAC

**Files:**
- Add this plan and the matching design specification
- Modify `backend/prisma/schema.prisma`
- Create `backend/prisma/migrations/20260901200000_shop_membership_card_refund/migration.sql`
- Modify permission constants and schema/RBAC tests

- [ ] Write RED tests for refund/reversal enums, aggregate checks/FKs/indexes, ledger type, and owner-only permission.
- [ ] Add the additive schema/migration and permission assignments.
- [ ] Generate Prisma and run GREEN tests.
- [ ] Commit the refund foundation.

### Task 2: Validator and service contract

**Files:**
- Create refund validator/service and tests
- Extend redemption public payload and structured error codes

- [ ] Write RED tests for required reason, idempotency normalization/fingerprint, scoped command, exact replay, and public refund mapping.
- [ ] Implement the pure service contract and error mapping.
- [ ] Run GREEN tests and commit.

### Task 3: Atomic refund repository and NDP reversal

**Files:**
- Create refund repository and tests
- Extend `ledger.service.ts`, ledger repository vocabulary, and regression tests

- [ ] Write RED tests for locks, formal order-refund proof, pending-adjustment conflict, additive stored-value/count restoration, benefit no-op, pending cancellation, paid reversal, negative balance, finance reconciliation, audit, notification, concurrency, and rollback.
- [ ] Implement repository transaction and balanced ledger reversal.
- [ ] Run membership, wallet, booking, and affiliate ledger regressions.
- [ ] Commit backend behavior.

### Task 4: API and OpenAPI

**Files:**
- Add refund controller/route wiring
- Extend app/OpenAPI and API tests

- [ ] Write RED tests for create/replay, staff denial, owner success, cross-shop hiding, order-not-refunded conflict, and structured response.
- [ ] Implement route and OpenAPI contract.
- [ ] Run GREEN tests and commit.

### Task 5: Merchant and customer TEST UI

**Files:**
- Extend membership API/types, redemption history, merchant center, user membership page, i18n, and tests
- Create refund model/dialog components and tests

- [ ] Write RED model/component/page/i18n tests.
- [ ] Add gated `退款 TEST`, exact reversal preview, reason capture, loading/error/replay states, and customer read-only refund evidence.
- [ ] Run GREEN tests and commit.

### Task 6: Real database and completion gates

**Files:**
- Create guarded rollback checker and checker-contract tests
- Update package scripts and README membership status

- [ ] Apply only the reviewed refund migration if physically absent and independently verify physical schema/RBAC.
- [ ] Run real MySQL restoration/reversal/race/isolation/rollback/cleanup evidence.
- [ ] Run Prisma validate/generate, affected and full relevant backend/frontend tests, lint, and production build.
- [ ] Run authenticated merchant/customer browser acceptance at narrow width with listener cwd/branch/proxy, no overflow, console errors, or failed requests.
- [ ] Self-review, merge latest main, rerun affected gates, merge locally, preserve unrelated dirty files, and do not push/deploy.
