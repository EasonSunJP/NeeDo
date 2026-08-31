# Shop Membership Card Issuance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the formal card-issuance microstep: shop-authorized issuance from an active published plan to an active shop member, with typed initial value, immutable snapshots, idempotency, atomic audit/notification, merchant UI, and customer visibility.

**Architecture:** Add a dedicated card-issuance Route → Controller → Service → Repository path while reusing existing shop-membership reads and card-plan persistence. The service owns normalization, type/range/expiry/idempotency rules; the repository rechecks shop scope and state and atomically creates the card, audit, and notification. Existing membership card DTOs gain safe plan/issuance fields so merchant and customer pages read the same real record. No wallet or ledger module is imported or mutated.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Node.js 22, Express 4, Prisma 7/MySQL 8, Zod 3, JWT/RBAC, OpenAPI 3.1, Jest/Supertest, Vitest.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-31-shop-membership-card-issuance-design.md`.
- Work only on `codex/shop-membership-card-issuance` in the existing isolated worktree; do not merge, push, or deploy.
- Red-green-refactor: every behavior starts with an observed failing focused test.
- Issue only to the authenticated current shop; never accept `shopId` from the client.
- Issue only from an active plan whose current version is published and not expired.
- Stored-value issuance writes principal only; count issuance writes uses only; benefit issuance writes neither.
- Initial issuance never generates NDP, debits a shop wallet, credits a customer wallet, or writes a ledger row.
- Keep top-up, redemption, refund, and post-issuance adjustment/consent out of scope.
- Preserve all legacy cards by making new snapshot fields nullable; new formal issuance must populate them.
- Every membership UI surface and new issuance action shows `TEST`.
- Use strict Zod, exact permission middleware, safe error keys, OpenAPI, five-language copy, audit, and real DB verification.

## File Structure

- Modify `backend/prisma/schema.prisma`: issuance enum, card snapshot fields, plan/version/operator relations.
- Create `backend/prisma/migrations/20260831160000_shop_membership_card_issuance/migration.sql`: additive columns, keys and indexes.
- Modify `backend/src/constants/permissions.constants.ts`: add `shop.member.card.issue` and owner grant.
- Modify `backend/src/constants/error-codes.ts`: add stable issuance failures.
- Create `backend/src/repositories/shop-membership-card-issuance.repository.ts`: atomic issuance/audit/notification and replay lookup.
- Create `backend/src/services/shop-membership-card-issuance.service.ts`: scope, normalization, type/range, expiry, fingerprint and public DTO.
- Create `backend/src/validators/shop-membership-card-issuance.validator.ts`: strict params/body schemas.
- Create `backend/src/controllers/shop-membership-card-issuance.controller.ts`: request/response adapter.
- Create `backend/src/routes/shop-membership-card-issuance.routes.ts`: auth, RBAC, validation and dependency composition.
- Modify `backend/src/app.ts`: dependency injection and route registration.
- Modify `backend/src/repositories/shop-membership.repository.ts`: safe card snapshot reads for merchant/customer lists and detail.
- Modify `backend/src/api/openapi.ts`: issuance schemas, route, responses and extended card DTO.
- Create `backend/tests/shop-membership-card-issuance-schema.test.ts`.
- Create `backend/tests/shop-membership-card-issuance.service.test.ts`.
- Create `backend/tests/shop-membership-card-issuance.repository.test.ts`.
- Create `backend/tests/shop-membership-card-issuance-api.test.ts`.
- Modify `backend/tests/shop-membership-openapi.test.ts` and `backend/tests/shop-membership-permissions.test.ts`.
- Create `backend/scripts/check-shop-membership-card-issuance-flow.ts` and add a package script.
- Modify `src/features/shop-member/api.ts`: issuance and expanded card contracts.
- Create `src/features/shop-member/cardIssuanceModel.ts` and its test.
- Create `src/features/shop-member/CardIssuanceDialog.tsx` and its test.
- Modify `src/features/shop-member/ShopMemberCenterPage.tsx` and test: permission-gated issuance action, refresh and success card.
- Modify `src/pages/user/UserMembershipsPage.tsx` and test: plan/version/source/state details.
- Modify `src/features/shop-member/i18n.ts` and test: five-language issuance copy.
- Modify `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`, `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`, and `docs/api.md`.

---

### Task 1: Add Issuance Persistence and Permission Contracts

**Files:** schema, migration, permission constants, error codes, `backend/tests/shop-membership-card-issuance-schema.test.ts`.

- [ ] Write a failing schema contract test asserting the issuance enum, all snapshot/idempotency fields, relations, migration SQL, unique/index constraints, permission catalog entry, owner grant, and absence from staff defaults.
- [ ] Run `npm --prefix backend test -- shop-membership-card-issuance-schema.test.ts` and confirm RED for missing contracts.
- [ ] Add nullable backward-compatible Prisma fields and exact migration SQL. Add User/plan/version reverse relations and indexes.
- [ ] Add `shop.member.card.issue`, error codes for not found, invalid state, initial value, and idempotency conflict.
- [ ] Run `npm --prefix backend run prisma:generate`, inspect generated SQL, then rerun the focused test to GREEN.
- [ ] Commit `feat: add membership card issuance schema`.

### Task 2: Implement Service Rules with Pure Unit Tests

**Files:** issuance service and service test.

- [ ] Write a fake-repository service test covering merchant identity scope, all three card types, min/max boundaries, forbidden mixed fields, source requirements, fixed-days/fixed-date/never expiry, fee snapshot, deterministic fingerprint, replay, and safe error mapping.
- [ ] Run the focused test and confirm RED because the service is absent.
- [ ] Implement normalization and validation without Express or direct Prisma access. Inject `now`, card-number generator, and repository for deterministic tests.
- [ ] Ensure audit metadata never contains a full card number and return only safe public fields.
- [ ] Run the focused test to GREEN and commit `feat: implement membership card issuance rules`.

### Task 3: Implement Atomic Repository Persistence

**Files:** issuance repository and repository test.

- [ ] Write a failing mocked-Prisma repository test covering scoped active membership/active published plan lookup, replay before create, create payload, one transaction, exact audit action, notification payload, canonical customer/actor identities, and no duplicate writes on replay.
- [ ] Run the focused test and confirm RED.
- [ ] Implement transaction-scoped rechecks and persistence. Return discriminated results for `created`, `replayed`, `not_found`, `invalid_state`, and `idempotency_conflict`.
- [ ] Handle unique card-number collision with a bounded retry at service/repository boundary; never expose raw Prisma errors.
- [ ] Run the focused test to GREEN and commit `feat: persist membership card issuance atomically`.

### Task 4: Expose the Formal API and OpenAPI Contract

**Files:** validator, controller, route, app composition, OpenAPI, API/openapi/permission tests.

- [ ] Write failing API tests for unauthenticated 401, missing permission 403, strict Zod 400, scoped 404, invalid state/range 409 or 400, first 201, replay 200, and same-key-different-body 409.
- [ ] Write failing OpenAPI assertions for the exact POST path, bearer security, request/response schemas, permission, and status codes.
- [ ] Run focused tests and confirm RED.
- [ ] Add strict validator, thin controller, exact `shop.member.card.issue` middleware, dependency injection, route registration, stable error envelopes, and OpenAPI schemas.
- [ ] Extend existing safe membership-card DTO mapping with plan/version/source/snapshot fields while keeping legacy nulls.
- [ ] Run API, OpenAPI, membership read and permission suites to GREEN; commit `feat: expose formal membership card issuance api`.

### Task 5: Build the Merchant Issuance Flow

**Files:** frontend API, model, dialog, ShopMemberCenterPage, i18n, tests.

- [ ] Write failing model tests for type-specific fields, range checks, source requirements, expiry preview, idempotency reuse only for retries, and payload serialization.
- [ ] Write failing component tests for permission visibility, member/active-plan selection, rules/10% fee disclosure, stored-value/count/benefit inputs, TEST badge, submit, retry, success, and list refresh.
- [ ] Run focused Vitest suites and confirm RED.
- [ ] Implement a mobile-first bottom-sheet dialog backed only by formal APIs. Paginate/search active members and load active published plans; do not add local mock data or persistence.
- [ ] Add `开卡 TEST` to the issued-card toolbar, hide it without permission, show safe inline errors, and refresh on success.
- [ ] Add five-language copy through the existing feature i18n helper.
- [ ] Run focused frontend tests to GREEN and commit `feat: add merchant membership card issuance ui`.

### Task 6: Complete Customer Card Visibility

**Files:** `src/pages/user/UserMembershipsPage.tsx`, API types, tests.

- [ ] Write failing tests showing store grouping plus plan name/version, active/frozen/expired/void state, amount/uses/benefit, issued/expiry dates, source label, and TEST badge.
- [ ] Run the focused test and confirm RED.
- [ ] Implement the expanded card face using real customer membership responses; clearly distinguish initial values from NDP rewards and never imply issuance generated NDP.
- [ ] Run focused tests to GREEN and commit `feat: show issued membership card details to customers`.

### Task 7: Real Database Checker, Documentation and Full Verification

**Files:** checker, package script, finance/merchant/API docs.

- [ ] Write the checker assertions first: card + audit + notification deltas, exact initial values, immutable version/fee snapshot, idempotent replay, conflict, cross-shop rejection, inactive member/plan rejection, and zero wallet/ledger delta.
- [ ] Add an explicit local-environment guard and transaction rollback so the checker leaves no data.
- [ ] Apply the new migration only to the configured local non-production MySQL database and independently inspect columns, FKs, indexes, enum values, and migration record.
- [ ] Run the checker and verify rollback leaves all measured business counts unchanged.
- [ ] Update documentation to mark only issuance implemented and keep adjustment/top-up/redemption/refund deferred.
- [ ] Run `npm --prefix backend run lint`, full backend tests, root lint, full frontend tests, and production build. Do not raise bundle budgets.
- [ ] Run `rg -n "TODO|FIXME|not implemented|mock|placeholder|fake"` over changed implementation files and review every match.
- [ ] Start isolated local backend/frontend on verified free ports, prove listener PID/cwd, and perform narrow-viewport browser acceptance for login guard plus authenticated issuance/customer pages when a valid local session exists. Do not bypass auth.
- [ ] Use `verification-before-completion`, then `finishing-a-development-branch`; report exact local-only state and do not merge/push/deploy without explicit authorization.
