# Exchange Bilateral Cancellation API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose authenticated per-order Exchange cancellation reads and commands, with mutual acceptance atomically cancelling only the linked Request order, releasing its slot and applicable formal holds, and recording events, audit, and notifications.

**Architecture:** A strict controller and route layer delegates actor resolution to a cancellation service and all live authorization/state rechecks to one repository transaction. The repository persists append-only command events for idempotency, uses the existing pure decision function, and receives only the existing LedgerService callbacks for Demand publication-fee capture and confirmed Request hold release. Affiliate tables and services are not read or mutated.

**Tech Stack:** Express, TypeScript strict mode, Zod, Prisma/MySQL transactions, Jest/Supertest, existing RBAC/audit/realtime/ledger services.

## Global Constraints

- Work only in `codex/exchange-bilateral-cancellation`; do not merge `main` in this microstep.
- Cancellation is per linked `BookingOrder`; other participants and orders remain unchanged.
- Only `REQUEST` orders in `PENDING` or `CONFIRMED`, with no service start and no confirmed/refunded payment, are eligible.
- The initiator can withdraw; only the opposite customer/provider party can accept or reject.
- Same provider side, even under another store employee identity, is not the opposite party.
- Reject and withdraw have zero order, slot, wallet, ledger, Affiliate, or payment effects.
- Accept commits request decision, order cancellation, slot release, applicable ledger settlement, status history, audit, event, and notifications in one database transaction.
- Demand publication fee capture is idempotent and happens on the first accepted order cancellation only through `LedgerService.captureExchangeRequestPublication`.
- A confirmed Request order releases its existing booking hold through `LedgerService.releaseBookingHold`; a pending order has no booking-hold release.
- Affiliate refund/reward development is paused: do not change Affiliate source, schema, API, data, or runtime behavior.
- Every command requires `Idempotency-Key`; actor IDs, party, status, and financial fields are server-resolved and rejected in request bodies.

---

### Task 1: Public contract, RBAC, and forward permission migration

**Files:**
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/src/types/exchange-cancellation.types.ts`
- Create: `backend/prisma/migrations/20260905130000_exchange_cancellation_api_permissions/migration.sql`
- Modify: `backend/tests/exchange-permissions.test.ts`
- Create: `backend/tests/exchange-cancellation-permissions-migration.test.ts`

**Interfaces:**
- Produces `EXCHANGE_PERMISSIONS.cancellationReadOwn` and `cancellationWriteOwn`.
- Produces stable errors for not-found, not-allowed, invalid-state, version-conflict, pending-conflict, and idempotency-conflict outcomes.
- Produces repository input/result and public payload types shared by service and repository.

- [x] **Step 1: Write failing permission and type-contract tests** proving both permissions are registered once, granted to `customer`, `technician`, `merchant_owner`, and `merchant_staff`, absent from unrelated roles, and inserted by a forward-only migration.
- [x] **Step 2: Run** `npm --prefix backend test -- --runTestsByPath tests/exchange-permissions.test.ts tests/exchange-cancellation-permissions-migration.test.ts --runInBand` and confirm failure is caused by missing cancellation permissions/migration.
- [x] **Step 3: Add minimal constants/types/migration**. The migration upserts permissions and role grants without editing the already committed persistence migration.
- [x] **Step 4: Rerun the two tests** and confirm they pass.

### Task 2: Authenticated read and command HTTP boundary

**Files:**
- Create: `backend/src/services/exchange-cancellation.service.ts`
- Create: `backend/src/controllers/exchange-cancellation.controller.ts`
- Create: `backend/src/routes/exchange-cancellation.routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/exchange-cancellation.service.test.ts`
- Create: `backend/tests/exchange-cancellation.routes.test.ts`
- Modify: `backend/tests/exchange-cancellation.validators.test.ts`

**Interfaces:**
- `GET /api/v1/exchange/orders/:id/cancellation` calls `getCancellation(access, orderId)`.
- `POST /api/v1/exchange/orders/:id/cancellation/requests` calls `requestCancellation(access, orderId, {expectedVersion, reason}, key, context)`.
- `POST /api/v1/exchange/orders/:id/cancellation/{accept|reject|withdraw}` calls `decideCancellation(access, orderId, action, {expectedVersion}, key, context)`.
- Service resolves and verifies the exact current identity record, derives customer/provider scope from authenticated identity and selected shop, fingerprints the complete server-authoritative command, maps repository outcomes to stable AppErrors, and publishes committed notifications only for new commits.

- [x] **Step 1: Write failing service tests** for exact actor verification, customer/provider scope derivation, merchant preview denial, payload fingerprinting, stable error mapping, and replay notification suppression.
- [x] **Step 2: Run the service test** and confirm imports/classes are missing.
- [x] **Step 3: Implement the minimal service** using `ExchangePostRepository.resolveActor`, `requireMerchantShopId`, `AuditLogService.createInput`, and strict idempotency-key validation.
- [x] **Step 4: Rerun service tests** and confirm green.
- [x] **Step 5: Write failing route tests** for JWT/RBAC, strict bodies, required idempotency key on commands, no idempotency key on GET, and exact forwarded arguments.
- [x] **Step 6: Run route tests** and confirm the routes are absent.
- [x] **Step 7: Add controller/routes/AppDependencies/app mount** with separate read/write permissions and existing error middleware.
- [x] **Step 8: Rerun route and validator tests** and confirm green.

### Task 3: Persist request, reject, withdraw, and idempotent replay

**Files:**
- Create: `backend/src/repositories/exchange-cancellation.repository.ts`
- Create: `backend/tests/exchange-cancellation.repository.test.ts`

**Interfaces:**
- `get(orderId, actor)` returns only a party-authorized payload.
- `command(input, settlementOptions)` returns `created`, `replayed`, or a stable failure outcome.
- The transaction locks user, identity, order, participant, post, current cancellation, and slot in deterministic order before authorization/state decisions.
- Event `resultSnapshot` is the replay authority; same key plus same actor/order/action/fingerprint returns it, while any mismatch returns idempotency conflict.

- [x] **Step 1: Write failing repository tests** for customer/provider read isolation, store/technician scope, request creation, one-active-request uniqueness, exact event versions, reject/withdraw terminal rows, same-side denial, stale versions, replay, and changed-payload conflict.
- [x] **Step 2: Run repository tests** and confirm failure is the missing repository behavior.
- [x] **Step 3: Implement read and non-accept commands** using `decideExchangeCancellation`, conditional writes, append-only event creation, same-transaction audit and notifications, and no order/slot/ledger mutations.
- [x] **Step 4: Rerun repository tests** and confirm green.

### Task 4: Atomic accepted cancellation and formal fee handling

**Files:**
- Modify: `backend/src/repositories/exchange-cancellation.repository.ts`
- Modify: `backend/tests/exchange-cancellation.repository.test.ts`
- Create: `backend/tests/exchange-cancellation.repository.integration.test.ts`

**Interfaces:**
- Accept callback `capturePublicationFee({exchangePostId, actorUserId}, {transactionClient})` is always invoked inside the transaction and relies on its existing idempotent ledger key.
- Accept callback `releaseBookingHold(input, {transactionClient})` is invoked only when the locked order was `CONFIRMED`.
- The order update is conditional on locked eligibility; slot `bookedCount` decrements exactly once and status becomes `AVAILABLE`; `OrderStatusHistory` records `CANCELLED` with the accepting actor.

- [x] **Step 1: Add failing unit tests** for accepting only by the opposite party, pending versus confirmed settlement callbacks, single-order cancellation, exact slot decrement, order history, notification/audit/event writes, and rollback propagation when either ledger callback fails.
- [x] **Step 2: Run unit tests** and confirm the accept path is red.
- [x] **Step 3: Implement the minimal accept transaction** with conditional order/slot updates followed by supplied LedgerService callbacks on the same Prisma transaction client.
- [x] **Step 4: Rerun unit tests** and confirm green.
- [x] **Step 5: Add guarded real-MySQL integration tests** for concurrent request serialization, publication capture once across two accepted orders, reject/withdraw zero-finance effects, settlement rollback, and cleanup. Confirmed Request hold release and races against the separate service/payment transition APIs remain part of the live-database gate expansion rather than being simulated.
- [x] **Step 6: Run the integration test only against an isolated non-production database**. The checker applied all 130 migrations to a generated scratch database and passed 8 real-MySQL scenarios, then removed the dedicated database and principal with `cleanupVerified=true` and `existingDatabaseModified=false`; the shared app database was not mutated.

### Task 5: OpenAPI, documentation, and regression gate

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/exchange-cancellation.openapi.test.ts`
- Modify: `docs/api.md`
- Modify: `docs/superpowers/specs/2026-09-05-exchange-bilateral-cancellation-design.md`

**Interfaces:**
- OpenAPI describes the five authenticated endpoints, read/write permission codes, strict request schemas, idempotency header, public payload, and stable error envelopes.

- [x] **Step 1: Write a failing OpenAPI contract test** for all paths, security, schemas, idempotency header, and error responses.
- [x] **Step 2: Run the OpenAPI test** and confirm the paths are missing.
- [x] **Step 3: Add the exact OpenAPI definitions and update docs** with completed versus deferred scope; explicitly retain the Affiliate pause. The subsequent shared-panel microstep connected the formal customer, technician, and merchant order details plus Exchange cards to the API.
- [x] **Step 4: Run focused tests**, then `npm --prefix backend run prisma:generate`, `npm --prefix backend run lint`, the four-shard backend regression suite, and `npm --prefix backend run build`.
- [x] **Step 5: Inspect `git diff --check`, `git status`, and the complete diff**; commit only after fresh verification and do not merge `main`.

Post-implementation acceptance completed on 2026-09-05 against an isolated clone of the local formal data with all current migrations: a real customer exercised request/withdraw/request/reject/request, a real technician exercised reject and accept, and customer, technician, and merchant reload paths retained the final accepted state. The 320/440-pixel checks also covered an ordinary-order fallback and found no horizontal overflow or unexempted application errors. The isolated database and grant were removed after database evidence was recorded. The two cancellation migrations are applied to local `needo_dev`, but no acceptance business rows were written there; remote push, authorized-environment migration, deployment, and post-release smoke remain separate gates.
