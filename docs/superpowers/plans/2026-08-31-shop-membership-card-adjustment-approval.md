# Shop Membership Card Adjustment Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the formal post-issuance membership-card adjustment microstep: a shop submits a target principal balance or remaining-use count, the owning customer approves or rejects within exactly 72 hours, and only an approved, still-current request changes the card.

**Architecture:** Add a dedicated adjustment Route → Controller → Service → Repository boundary alongside formal card issuance. The request stores immutable before/target snapshots and a card lock version; terminal transitions use database time, row/state checks and compare-and-swap updates inside Prisma transactions. Merchant and customer reads expose only public adjustment DTOs. A bounded worker plus lazy expiry enforces the deadline. Neither this path nor its tests import or mutate wallet/ledger behavior.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Node.js 22, Express 4, Prisma 7/MySQL 8, Zod 3, JWT/RBAC, OpenAPI 3.1, Jest/Supertest, Vitest.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-31-shop-membership-card-adjustment-approval-design.md` exactly.
- Work only on `codex/shop-membership-card-adjustment-approval` in the existing isolated worktree; do not merge, push or deploy in this plan.
- Red-green-refactor: every behavior starts with an observed failing focused test.
- Use the database clock for the 72-hour boundary. Accept only when `now < expiresAt`; at `now >= expiresAt`, expire the request and do not mutate the card.
- Never accept shop/customer/before-value/lock-version fields from the client.
- Stored-value corrections change principal only. Count corrections preserve consumed uses by applying the remaining-use delta to `totalUses`. Benefit cards are unsupported.
- Create/cancel/reject/expire/invalidate do not mutate card values. Approval is the only transition that may mutate them.
- Never generate NDP, debit a shop wallet, credit a customer wallet, write a finance ledger row, or change `bonusBalanceJpy`.
- Enforce one pending request per card with a database unique key and clear it on every terminal transition.
- Use strict Zod, stable AppError keys, OpenAPI, permission middleware, shop/customer scope, audit, notification, pagination and existing response envelopes.
- All new membership UI actions and confirmation surfaces show the existing `TEST` badge and use current localization infrastructure.
- Preserve unrelated dirty files, migrations, permission grants and existing member-card flows.

## File Structure

- Modify `backend/prisma/schema.prisma`: adjustment status/model/relations and card `lockVersion`.
- Create `backend/prisma/migrations/20260831170000_shop_membership_card_adjustment_approval/migration.sql`: additive table, keys, indexes, permission and default grants.
- Modify `backend/src/constants/permissions.constants.ts` and `backend/src/constants/error-codes.ts`.
- Create `backend/src/validators/shop-membership-card-adjustment.validator.ts`.
- Create `backend/src/repositories/shop-membership-card-adjustment.repository.ts`.
- Create `backend/src/services/shop-membership-card-adjustment.service.ts`.
- Create `backend/src/controllers/shop-membership-card-adjustment.controller.ts`.
- Create `backend/src/routes/shop-membership-card-adjustment.routes.ts`.
- Modify `backend/src/app.ts` for dependency injection and route registration.
- Create `backend/src/services/shop-membership-card-adjustment-expiry.service.ts`.
- Create `backend/src/repositories/shop-membership-card-adjustment-expiry.repository.ts`.
- Create `backend/src/workers/shop-membership-card-adjustment-expiry.worker.ts`.
- Modify `backend/src/config/env.ts`, environment examples, `backend/src/server.ts` and shutdown wiring.
- Modify `backend/src/repositories/shop-membership.repository.ts` to expose a safe pending-adjustment summary on customer cards.
- Modify `backend/src/api/openapi.ts` with adjustment schemas and five formal routes.
- Create backend schema/service/repository/API/expiry worker tests named `shop-membership-card-adjustment-*`.
- Create `backend/scripts/check-shop-membership-card-adjustment-flow.ts` and register a backend package script.
- Modify `src/features/shop-member/api.ts` and `src/features/shop-member/api.test.ts`.
- Create `src/features/shop-member/cardAdjustmentModel.ts` and its test.
- Create `src/features/shop-member/CardAdjustmentDialog.tsx` and its test.
- Modify `src/features/shop-member/ShopMemberCenterPage.tsx` and its test.
- Modify `src/pages/user/UserMembershipsPage.tsx` and its test.
- Modify `src/features/shop-member/i18n.ts` and its test.
- Modify `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`, `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md` and `docs/api.md`.

---

### Task 1: Add Adjustment Persistence, Permission and Error Contracts

**Files:** Prisma schema/migration, permission/error constants, schema and permission tests.

- [ ] Write `backend/tests/shop-membership-card-adjustment-schema.test.ts` asserting the exact status enum, adjustment table, nullable type-specific snapshots, `pendingKey` uniqueness, idempotency uniqueness, all FKs/indexes, `deletedAt`, card `lockVersion`, permission catalog entry and grants only to `admin`/`merchant_owner` by default.
- [ ] Add/extend `backend/tests/shop-membership-permissions.test.ts` to prove `merchant_staff` does not receive `shop.member.card.adjust.request` by default.
- [ ] Run `npm --prefix backend test -- shop-membership-card-adjustment-schema.test.ts shop-membership-permissions.test.ts` and record RED for missing contracts.
- [ ] Add the backward-compatible schema and one additive migration. Populate existing cards with `lock_version = 1`; do not alter an applied migration.
- [ ] Add stable errors for not found, invalid card type/state/value, same value, pending conflict, expired/terminal state, invalidated snapshot and idempotency conflict.
- [ ] Run `npm --prefix backend run prisma:generate`, inspect generated types, rerun focused tests to GREEN and commit `feat: add membership card adjustment schema`.

### Task 2: Define Validators and Service State Rules

**Files:** validator/service plus unit tests.

- [ ] Write failing validator tests for strict params/query/body parsing, exactly one target field, integer bounds, trimmed 1–500 character reason, approve/reject decision and idempotency key.
- [ ] Write failing service tests with an injected repository/clock covering merchant scope, customer ownership, stored-value/count/benefit behavior, same-value rejection, one-pending conflict, 72-hour boundary, terminal states, cancel, approve, reject, replay and safe error mapping.
- [ ] Include count examples proving consumed uses remain unchanged after both upward and downward corrections.
- [ ] Run the focused validator/service tests and record RED.
- [ ] Implement normalization, deterministic request/decision fingerprints, typed state transitions and safe public DTO mapping without Express or direct Prisma access.
- [ ] Ensure only approve can request a card mutation and that all non-approval results explicitly carry no card update.
- [ ] Rerun focused tests to GREEN and commit `feat: implement membership card adjustment rules`.

### Task 3: Implement Atomic Persistence and Concurrency Protection

**Files:** adjustment repository plus mocked and real-database repository tests.

- [ ] Write failing repository tests for shop-scoped card lookup, customer ownership, request replay, unique pending handling, exact audit actions, canonical recipient notifications, terminal `pendingKey` clearing and no duplicate effects.
- [ ] Write race tests for double approval, approve-versus-reject, approve-versus-cancel and approve-versus-expire; only one conditional transition may win.
- [ ] Run focused repository tests and record RED.
- [ ] Implement one transaction per mutation. Use the established repository row-lock/conditional-update pattern, database `CURRENT_TIMESTAMP(3)`, card `lockVersion` and before-value compare-and-swap.
- [ ] On approval, update the card and request atomically; on a card snapshot mismatch, terminally invalidate the request without changing the card.
- [ ] Write audit and notification rows in the same transaction as each state transition. Do not import the ledger repository.
- [ ] Rerun repository tests to GREEN and commit `feat: persist membership card adjustments atomically`.

### Task 4: Expose Merchant and Customer APIs

**Files:** controller/routes/app/OpenAPI plus API tests.

- [ ] Write failing API tests for unauthenticated 401, missing permission 403, strict validation 400, cross-shop/customer-safe 404, create 201/replay 200, conflict 409, paginated lists, cancel, approve/reject and exact deadline behavior.
- [ ] Write failing OpenAPI assertions for merchant create/list/cancel and customer list/decision paths, bearer security, request/response schemas and status codes.
- [ ] Run focused API/OpenAPI tests and record RED.
- [ ] Add thin controller methods, permissioned routes, dependency composition, unified response envelopes and OpenAPI definitions.
- [ ] Extend customer card detail with only a safe current pending-adjustment summary; internal IDs, full card number and fingerprint fields stay private.
- [ ] Rerun API/OpenAPI/existing membership API tests to GREEN and commit `feat: expose membership card adjustment approval api`.

### Task 5: Add Exact Expiry Worker and Lazy Expiry

**Files:** expiry repository/service/worker, env/server/shutdown, expiry tests.

- [ ] Write failing expiry service and worker tests for database-time authority, batch paging, at-deadline expiry, idempotent repeated scans, candidate isolation, failure continuation and non-overlapping worker runs.
- [ ] Add config tests for bounded positive interval/batch values and update local/prod example env files without hardcoded runtime ports.
- [ ] Run focused tests and record RED.
- [ ] Implement the bounded worker using existing expiry-worker conventions; start/stop it from `server.ts` and add shutdown handling.
- [ ] Reuse the same repository transition for lazy expiry before reads/decisions and scheduled expiry so audit/notification semantics cannot drift.
- [ ] Rerun expiry/config/server tests to GREEN and commit `feat: expire membership card adjustments after 72 hours`.

### Task 6: Build Merchant Adjustment UI

**Files:** frontend API/model/dialog/merchant center/i18n plus Vitest tests.

- [ ] Write failing API/model tests for formal endpoints, payload serialization, type-specific target rules, differences, retry idempotency and status/countdown mapping.
- [ ] Write failing component tests for permission visibility, `申请调整 TEST`, current-to-target preview, mandatory reason, 72-hour warning, pending lockout, request history, cancel and refresh.
- [ ] Run the focused Vitest tests and record RED.
- [ ] Implement a mobile-first dialog/drawer backed only by formal APIs. Generate one idempotency key per submit intent and reuse it only on retry.
- [ ] Integrate the action/history with real issued-card records, hide mutations without permission and keep existing list/card-plan/issuance flows unchanged.
- [ ] Add all copy to the existing membership i18n map and preserve the shared `TEST` badge component.
- [ ] Rerun focused frontend tests to GREEN and commit `feat: add merchant card adjustment request ui`.

### Task 7: Build Customer 72-Hour Decision UI

**Files:** frontend API/user memberships/i18n plus Vitest tests.

- [ ] Write failing tests for store grouping, pending indicator, before→target/difference, shop reason, exact expiry, countdown, `TEST` badge, approve/reject confirmation and every read-only terminal state.
- [ ] Add API tests proving customer decisions use the current identity only and refresh real card data after success.
- [ ] Run focused tests and record RED.
- [ ] Implement the prominent pending confirmation card in membership detail and a visible list-level pending marker. Keep server `expiresAt` authoritative when the visual countdown reaches zero.
- [ ] Use separate decision idempotency per intended approve/reject action; disable duplicate submit while pending and render stable backend errors without optimistic balance mutation.
- [ ] Rerun focused tests to GREEN and commit `feat: add customer membership card adjustment confirmation`.

### Task 8: Real Database Proof, Documentation and Full Verification

**Files:** flow checker, package script and formal docs.

- [ ] Write checker assertions first for stored-value and count requests, pre-approval immutability, approval mutation, rejected/expired/cancelled immutability, audit/notification rows, idempotent replay, cross-shop/customer rejection and snapshot invalidation.
- [ ] Snapshot shop wallet, customer NDP wallet and ledger counts/balances before each scenario; prove exact equality afterward.
- [ ] Guard the checker against production and wrap fixtures in rollback/explicit cleanup so it leaves no data.
- [ ] Apply the migration only to the configured local non-production MySQL database; independently inspect columns, FKs, indexes, unique keys, permission grants, `_prisma_migrations` and physical tables.
- [ ] Run the real database checker and confirm cleanup.
- [ ] Update finance/merchant/API documentation to mark only adjustment approval implemented while keeping recharge/redemption/refund/NDP reward settlement deferred.
- [ ] Run `npm --prefix backend run lint`, all new backend tests, affected existing backend suites, root lint, full frontend tests and `npm run build -- --mode formal`. Do not raise bundle budgets.
- [ ] Run `rg -n "TODO|FIXME|not implemented|mock|placeholder|fake"` over changed implementation files and review every match.
- [ ] Start isolated local backend/frontend only on verified free ports, prove listener PID/cwd/branch and proxy origin, then run 440×956 authenticated browser acceptance for merchant request and customer decision. Check scroll, overflow, loading/error/terminal states and console; do not bypass auth.
- [ ] Invoke `verification-before-completion`, document exact remaining acceptance limits, and keep merge/push/deploy separate from this implementation task.
