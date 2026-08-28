# Booking Platform Fee Debt And Reward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Booking confirmation consume the persisted shop platform-fee policy, lock an immutable payer/wallet/amount snapshot, support explicitly confirmed negative balances, and settle or expire the associated 100 NDP user reward through the real ledger.

**Architecture:** Keep the existing `BookingService -> LedgerService -> LedgerRepository` transaction boundary. Add a transaction-aware internal policy resolver, persist the complete acceptance snapshot on `OrderFinancial`, and make cancellation/completion use that snapshot and its `WalletHold` instead of current configuration. Manual top-up approval allocates only the approved top-up amount to outstanding platform-fee debts in FIFO order; a bounded worker expires overdue pending rewards.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma 7/MySQL 8, Zod, Jest/Supertest.

## Global Constraints

- This is the second microstep of `docs/superpowers/specs/2026-08-28-platform-fee-acceptance-control-design.md`; do not implement acceptance pauses, ordinary-user single-PENDING replacement, or portal UI.
- `b_platform_fee` defaults to 500 NDP and `user_reward` defaults to 100 NDP; Request dispatch fees, cancellation penalties, and affiliate rewards are not repriced.
- A missing shop policy means `feeEnabled=true`, `payerType=shop`, `policyVersion=0`.
- A disabled shop policy creates no `WalletHold`, `LedgerTransaction`, or `WalletLedger` for the platform fee and disables the user reward.
- Technician liability belongs to the technician profile's global User wallet and survives shop changes.
- Insufficient balance without an explicit current-preview confirmation is a zero-write 409; only the dedicated confirmed path may make the payer wallet negative.
- Existing accepted orders use their stored wallet/fee snapshot; later policy or rule changes must not reprice them.
- Only an approved formal top-up may settle debt and unlock a delayed reward; other wallet credits do not count.
- The delayed reward window is exactly 7 x 24 hours from completion; day 8 and later never grants the reward.
- All mutations remain in the existing Booking or wallet-adjustment Prisma transaction and write immutable ledger/reconciliation/audit evidence.
- No mock, fake API, browser-local state, TODO, FIXME, or placeholder implementation.

---

### Task 1: Persist The Acceptance, Debt, And Reward State

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260829010000_booking_platform_fee_debt_reward/migration.sql`
- Create: `backend/tests/booking-platform-fee-debt-schema.test.ts`

**Interfaces:**
- Produces Prisma enums `PlatformFeeDebtStatus` and `UserRewardStatus`.
- Produces `OrderFinancial` snapshot/debt/reward columns consumed by Tasks 3-7.

- [ ] **Step 1: Write the failing schema contract test**

```ts
expect(schema).toMatch(/enum PlatformFeeDebtStatus[\s\S]*NONE[\s\S]*OUTSTANDING[\s\S]*SETTLED/);
expect(schema).toMatch(/enum UserRewardStatus[\s\S]*DISABLED[\s\S]*IMMEDIATE[\s\S]*PENDING[\s\S]*PAID[\s\S]*EXPIRED/);
for (const field of [
  "platformFeeEnabledSnapshot",
  "platformFeeGlobalVersion",
  "platformFeePolicyVersion",
  "platformFeeAmountNdpSnapshot",
  "platformFeeWalletOwnerType",
  "platformFeeWalletOwnerId",
  "platformFeeWalletId",
  "platformFeeShortfallNdp",
  "platformFeeOutstandingNdp",
  "platformFeeDebtStatus",
  "platformFeeAcceptedAt",
  "platformFeeOverdraftConfirmationKey",
  "platformFeePreviewVersion",
  "userRewardEligibleNdp",
  "userRewardStatus",
  "userRewardDeadlineAt",
  "userRewardGrantedAt"
]) expect(schema).toContain(field);
expect(migration).toContain("platform_fee_enabled_snapshot");
expect(migration).toContain("platform_fee_outstanding_ndp");
expect(migration).toContain("user_reward_deadline_at");
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/booking-platform-fee-debt-schema.test.ts`

Expected: FAIL because the enums, columns, and migration do not exist.

- [ ] **Step 3: Add additive Prisma fields and indexes**

Use mapped enum values and safe defaults:

```prisma
enum PlatformFeeDebtStatus {
  NONE        @map("none")
  OUTSTANDING @map("outstanding")
  SETTLED     @map("settled")
  @@map("platform_fee_debt_status")
}

enum UserRewardStatus {
  DISABLED  @map("disabled")
  IMMEDIATE @map("immediate")
  PENDING   @map("pending")
  PAID      @map("paid")
  EXPIRED   @map("expired")
  @@map("user_reward_status")
}
```

Add the fields listed by the test to `OrderFinancial`; snapshot identifiers/timestamps are nullable for legacy rows, amount counters default to `0`, `platformFeeDebtStatus` defaults to `NONE`, and `userRewardStatus` defaults to `DISABLED`. Add indexes on `(platformFeeWalletId, platformFeeDebtStatus, platformFeeAcceptedAt, id)` and `(userRewardStatus, userRewardDeadlineAt, id)`, plus a nullable unique key on `platformFeeOverdraftConfirmationKey`.

- [ ] **Step 4: Generate the migration without applying it and inspect the SQL**

Run:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:dev -- --create-only --name booking_platform_fee_debt_reward
```

Rename the generated directory to `20260829010000_booking_platform_fee_debt_reward` before any apply. Confirm the SQL only adds enums, columns, indexes, and the nullable unique key; it must not delete or rewrite existing financial rows.

- [ ] **Step 5: Generate Prisma and verify GREEN**

Run:

```bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- --runInBand tests/booking-platform-fee-debt-schema.test.ts
```

Expected: Prisma generation succeeds and the schema contract passes.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260829010000_booking_platform_fee_debt_reward/migration.sql backend/tests/booking-platform-fee-debt-schema.test.ts
git commit -m "feat: add booking platform fee debt state"
```

---

### Task 2: Resolve Effective Policy And Technician Wallet Ownership In-Transaction

**Files:**
- Modify: `backend/src/services/platform-fee-policy.service.ts`
- Modify: `backend/src/repositories/platform-fee-policy.repository.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/tests/platform-fee-policy-service.test.ts`
- Modify: `backend/tests/platform-fee-policy-repository.test.ts`
- Modify: `backend/tests/ledger.repository.test.ts`

**Interfaces:**
- Produces `BookingPlatformFeePolicySnapshot`.
- Produces `PlatformFeePolicyRepositoryPort.withTransactionClient(transactionClient)`.
- Produces `PlatformFeePolicyService.resolveForBookingSettlement(shopId, acceptedAt, transactionClient?)`.
- Produces `LedgerRepositoryPort.findTechnicianUserId(technicianProfileId)`.

- [ ] **Step 1: Write failing resolver tests**

```ts
await expect(service.resolveForBookingSettlement(31, at, tx)).resolves.toEqual({
  shopId: 31,
  feeEnabled: false,
  payerType: "technician",
  policyVersion: 4,
  policySource: "persisted",
  globalAmountNdp: 500,
  globalVersion: 2,
  globalSource: "persisted"
});
expect(repository.withTransactionClient).toHaveBeenCalledWith(tx);
```

Also assert missing policy returns enabled/shop/version 0 and that repository `findTechnicianUserId(9)` queries an active, non-deleted technician and returns its immutable `userId`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/platform-fee-policy-service.test.ts tests/platform-fee-policy-repository.test.ts tests/ledger.repository.test.ts`

Expected: FAIL because the transaction resolver and technician lookup are absent.

- [ ] **Step 3: Add the settlement-only policy interface**

```ts
export interface BookingPlatformFeePolicySnapshot {
  shopId: number;
  feeEnabled: boolean;
  payerType: ShopPlatformFeePayer;
  policyVersion: number;
  policySource: PlatformFeePolicySource;
  globalAmountNdp: number;
  globalVersion: number;
  globalSource: PlatformFeePolicySource;
}
```

`resolveForBookingSettlement` must use `repository.withTransactionClient` when supplied, load global fee and shop policy at `acceptedAt`, reject a deleted/missing shop, and map the documented defaults. It is an internal service method with no actor argument and is not exposed as a new route.

- [ ] **Step 4: Make the policy repository transaction-aware**

The repository constructor already accepts a Prisma client. Add:

```ts
public withTransactionClient(transactionClient: unknown): PlatformFeePolicyRepositoryPort {
  return new PlatformFeePolicyRepository(transactionClient as PolicyClient);
}
```

Change its client type from `PrismaClient` to `PolicyClient`; write methods must continue to reuse the supplied transaction rather than starting a nested transaction.

- [ ] **Step 5: Add technician User resolution to the ledger repository**

```ts
findTechnicianUserId?: (technicianProfileId: number) => Promise<number | null>;
```

The Prisma implementation selects `userId` from `TechnicianProfile` with `id`, `deletedAt: null`, and a non-deleted User relation. It never derives a User ID from public ID text or shop membership.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/platform-fee-policy-service.test.ts tests/platform-fee-policy-repository.test.ts tests/ledger.repository.test.ts`

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/platform-fee-policy.service.ts backend/src/repositories/platform-fee-policy.repository.ts backend/src/services/ledger.service.ts backend/src/repositories/ledger.repository.ts backend/tests/platform-fee-policy-service.test.ts backend/tests/platform-fee-policy-repository.test.ts backend/tests/ledger.repository.test.ts
git commit -m "feat: resolve booking platform fee payer wallets"
```

---

### Task 3: Add Structured Insufficient-Balance Confirmation Contract

**Files:**
- Modify: `backend/src/utils/app-error.ts`
- Modify: `backend/src/utils/api-response.ts`
- Modify: `backend/src/types/api-response.ts`
- Modify: `backend/src/middlewares/error.middleware.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/booking-api.test.ts`
- Modify: `backend/tests/booking-service.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Produces `OrderConfirmInput` with optional `insufficientBalanceConfirmation`.
- Produces `AppError.data` for safe structured 409 payloads.
- Passes the confirmation object to `freezeBookingAcceptance` without allowing it on other transitions.

- [ ] **Step 1: Write failing validator/API/OpenAPI tests**

```ts
expect(orderConfirmBodySchema.parse({})).toEqual({});
expect(orderConfirmBodySchema.parse({
  insufficientBalanceConfirmation: {
    confirmed: true,
    idempotencyKey: "fee-confirm-1234567890",
    previewVersion: "sha256:0123456789abcdef..."
  }
})).toBeDefined();
expect(() => orderConfirmBodySchema.parse({ unknown: true })).toThrow();
```

Add an API test proving an `AppError` with safe preview data serializes as `{code,message,data}` and OpenAPI documents the request plus the 409 payload fields `feeAmountNdp`, `availableBalanceNdp`, `shortfallNdp`, `payerType`, `walletOwnerType`, `previewVersion`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/booking-api.test.ts tests/booking-service.test.ts tests/openapi.test.ts`

- [ ] **Step 3: Add safe error data support**

Extend `AppErrorOptions` and `AppError` with `data?: unknown`; change `errorResponse(code, message, data = null)` and middleware to return `appError.data ?? null`. Existing errors must remain byte-for-byte compatible with `data: null`.

- [ ] **Step 4: Add strict confirmation validation**

```ts
export const orderConfirmBodySchema = z.object({
  insufficientBalanceConfirmation: z.object({
    confirmed: z.literal(true),
    idempotencyKey: z.string().trim().min(16).max(160),
    previewVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/)
  }).strict().optional()
}).strict();
```

Parse it in the controller and pass it only to `BookingService.transitionOrder(..., "confirm", undefined, body)`. Apply `validateRequest({ params, body })` to the route.

- [ ] **Step 5: Thread the input through BookingService**

Add an optional fourth transition argument restricted to confirm input and pass its nested object to `BookingLedgerSettlementInput.insufficientBalanceConfirmation`. Preserve all existing cancel/start/complete call signatures.

- [ ] **Step 6: Add dedicated error codes and OpenAPI**

Use distinct 409 codes/messages for:

```text
error.platform_fee.insufficient_balance_confirmation_required
error.platform_fee.preview_stale
error.platform_fee.technician_required
error.platform_fee.confirmation_conflict
```

Do not reuse the generic insufficient-wallet error because the client must distinguish the first warning from a stale or conflicting confirmation.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/booking-api.test.ts tests/booking-service.test.ts tests/openapi.test.ts`

- [ ] **Step 8: Commit**

```bash
git add backend/src/utils/app-error.ts backend/src/utils/api-response.ts backend/src/types/api-response.ts backend/src/middlewares/error.middleware.ts backend/src/constants/error-codes.ts backend/src/validators/booking.validator.ts backend/src/controllers/booking.controller.ts backend/src/services/booking.service.ts backend/src/routes/booking.routes.ts backend/src/api/openapi.ts backend/tests/booking-api.test.ts backend/tests/booking-service.test.ts backend/tests/openapi.test.ts
git commit -m "feat: require explicit platform fee overdraft confirmation"
```

---

### Task 4: Freeze The Immutable Acceptance Snapshot

**Files:**
- Modify: `backend/src/services/fee-calculation.service.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/tests/fee-calculation-service.test.ts`
- Modify: `backend/tests/ledger-service.test.ts`
- Modify: `backend/tests/booking-api.test.ts`

**Interfaces:**
- Consumes `resolveForBookingSettlement` and `findTechnicianUserId` from Task 2.
- Produces a persisted `OrderFinancial` acceptance snapshot and optional positive `WalletHold`.
- Produces deterministic preview version `sha256:<hex>` over order, policy/rule versions, payer wallet, fee, and observed balance.

- [ ] **Step 1: Write failing acceptance tests**

Cover all of these in `ledger-service.test.ts`:

1. no policy row: shop wallet freezes 500 and snapshot stores enabled/shop/version 0;
2. disabled policy: no wallet creation, hold, transaction, ledger entry, or balance change; financial records zero and reward `disabled`;
3. technician payer: resolves profile `9 -> user 77`, freezes `user:77`, and stores business payer `technician/9` plus wallet owner `user/77`;
4. technician payer without an assigned technician: 409 and no writes;
5. insufficient first attempt: structured 409 and transaction rollback leaves no financial/log/hold/ledger mutation;
6. matching explicit confirmation: available becomes negative, full fee becomes frozen, shortfall/outstanding are stored, debt is `outstanding`, confirmation key and preview are audited;
7. stale preview or reused confirmation key: 409 and no writes.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/fee-calculation-service.test.ts tests/ledger-service.test.ts tests/booking-api.test.ts`

- [ ] **Step 3: Add fee calculation overrides without adding a second calculator**

Extend `FeeCalculationInput` with internal-only fields:

```ts
payerOverride?: { payerType: "shop" | "cast"; payerId: number };
waiveReason?: "shop_policy_disabled";
```

The calculator still resolves the authoritative effective rule and writes one log. `payerOverride` changes only the log/result payer. `waiveReason` preserves base/rule evidence but forces final and hold amounts to zero and appends `Waived by shop platform-fee policy` to the explanation.

- [ ] **Step 4: Resolve policy, payer, wallet, and preview inside the Booking transaction**

Inject `Pick<PlatformFeePolicyService, "resolveForBookingSettlement">` into `LedgerService` and wire it in `createBookingRoutes` using the same repository dependency. For Booking acceptance:

```ts
const policy = await policyResolver.resolveForBookingSettlement(
  input.shopId,
  acceptedAt,
  context.transactionClient
);
const owner = policy.payerType === "shop"
  ? { payerType: "shop", payerId: input.shopId, ownerType: "shop", ownerId: input.shopId }
  : { payerType: "technician", payerId: technicianProfileId, ownerType: "user", ownerId: technicianUserId };
```

Calculate the fee with the policy override. Do not call `getOrCreateWallet` when disabled. For enabled policies lock/create the actual payer wallet and compute shortfall.

- [ ] **Step 5: Enforce the two-request insufficient path**

Create the preview hash using Node `createHash("sha256")` over a stable JSON tuple containing order ID, accepted time, global version, policy version, fee enabled, payer business identity, wallet owner identity, wallet ID, fee amount, and observed available balance.

If shortfall is positive and confirmation is absent, throw the structured warning. If present, require exact preview match and use `applyWalletDelta` without `requireAvailableAtLeast`; this is the only branch allowed to create a negative available balance. Store `platformFeeShortfallNdp` and `platformFeeOutstandingNdp` as the original shortfall.

- [ ] **Step 6: Persist the snapshot and zero-fee evidence**

Extend `OrderFinancialUpsertInput` and repository mapping for every Task 1 field. Disabled acceptance writes the financial snapshot/timeline and returns before hold/transaction creation. Enabled acceptance creates a positive hold, snapshot, transaction, ledger, reconciliation, and audit in the same existing transaction.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/fee-calculation-service.test.ts tests/ledger-service.test.ts tests/booking-service.test.ts tests/booking-api.test.ts`

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/fee-calculation.service.ts backend/src/services/ledger.service.ts backend/src/repositories/ledger.repository.ts backend/src/routes/booking.routes.ts backend/tests/fee-calculation-service.test.ts backend/tests/ledger-service.test.ts backend/tests/booking-service.test.ts backend/tests/booking-api.test.ts
git commit -m "feat: snapshot platform fee at booking acceptance"
```

---

### Task 5: Cancel And Complete From The Stored Snapshot

**Files:**
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/tests/ledger-service.test.ts`
- Modify: `backend/tests/booking-service.test.ts`

**Interfaces:**
- Produces `LedgerRepositoryPort.findOrderFinancial(bookingOrderId)` and a hold lookup by booking/fee type.
- Makes cancel/complete independent of current shop policy and technician affiliation.

- [ ] **Step 1: Write failing cancellation/completion tests**

Cover:

- changing current policy or moving a technician after acceptance still releases/captures the original hold owner;
- cancelling an overdrawn accepted order unfreezes the full amount, restores the original available balance, zeros outstanding debt, and never grants reward;
- disabled-fee completion creates no ledger mutation and leaves reward `disabled`/0;
- enabled completion with no outstanding debt captures the hold, grants exactly the snapshotted eligible reward once, and records `immediate` plus `grantedAt`;
- enabled completion with outstanding debt captures the hold but grants 0, records `pending`, eligible 100, and deadline exactly completion + 7 days;
- repeated completion is idempotent.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/ledger-service.test.ts tests/booking-service.test.ts`

- [ ] **Step 3: Load snapshot and hold by order**

Add typed `OrderFinancialPlatformFeeSnapshot` mapping and repository methods that read the non-deleted financial row and the active platform-fee hold by `(bookingOrderId, feeType)`. New-order settlement must require a complete snapshot; legacy rows may fall back to the existing hold owner but never current policy.

- [ ] **Step 4: Release cancellation debt atomically**

Release the hold through `hold.ownerType/ownerId`. Update the financial row to cancelled, `platformFeeOutstandingNdp=0`, `platformFeeDebtStatus=NONE`, and reward `DISABLED`. For an overdrawn order the unfreeze adds the full hold amount to available balance, exactly reversing acceptance.

- [ ] **Step 5: Capture completion and decide reward from stored state**

Use `platformFeeAmountNdpSnapshot` capped by hold remaining; do not recalculate the platform fee or payer. Calculate the current `user_reward` only when the stored fee was enabled, persist the eligible amount, then:

```text
disabled fee -> DISABLED, 0 granted
enabled and outstanding == 0 -> IMMEDIATE, grant once now
enabled and outstanding > 0 -> PENDING, 0 granted, deadline = completedAt + 7 days
```

Keep the existing single completion transaction for immediate reward and ledger evidence. Pending reward creates no customer ledger entry until Task 6.

- [ ] **Step 6: Preserve Request and merchant-cancellation behavior**

All new snapshot paths must be guarded by `orderType === "booking"`. Request dispatch settlement remains unchanged. Provider cancellation must never charge a technician's platform-fee hold as the merchant penalty; release the original platform-fee hold first and keep penalty funding on the shop path.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/ledger-service.test.ts tests/booking-service.test.ts`

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/ledger.service.ts backend/src/repositories/ledger.repository.ts backend/tests/ledger-service.test.ts backend/tests/booking-service.test.ts
git commit -m "feat: settle booking fee and reward snapshots"
```

---

### Task 6: Allocate Approved Top-Ups To Debt FIFO And Grant Eligible Rewards

**Files:**
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/tests/wallet-adjustment-service.test.ts`
- Modify: `backend/tests/ledger.repository.test.ts`

**Interfaces:**
- Produces locked FIFO debt reads by wallet and acceptance timestamp.
- Produces delayed reward transaction key `booking:<orderId>:reward:settlement`.
- Runs only from approved `topup` review within the existing wallet-adjustment transaction.

- [ ] **Step 1: Write failing FIFO/top-up tests**

Cover:

1. approved withdrawal and non-top-up credits do not settle debt;
2. a partial top-up reduces only the oldest debt's outstanding amount;
3. a larger top-up settles oldest debts in `(acceptedAt,id)` order and leaves excess as wallet balance;
4. a completed debt settled before its deadline grants one 100 NDP reward and marks `paid`;
5. a completed debt settled at/after deadline marks `expired` and grants 0;
6. debt settled before completion becomes `settled`, then completion grants the immediate reward;
7. duplicate review cannot allocate twice or duplicate reward;
8. any reward/ledger/audit failure rolls back the top-up approval and all debt changes.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/wallet-adjustment-service.test.ts tests/ledger.repository.test.ts`

- [ ] **Step 3: Add locked FIFO repository operations**

Add methods to list a bounded set of `OUTSTANDING` financial IDs for a wallet ordered by accepted time and ID, lock one row with `SELECT ... FOR UPDATE`, and guarded-update its outstanding/debt/reward status. All queries filter `deletedAt: null` and use the wallet/debt index from Task 1.

- [ ] **Step 4: Allocate exactly the approved top-up amount**

Immediately after crediting a top-up wallet, call a private allocator with `budgetNdp=request.amountNdp`. For each locked debt, allocate `min(budget, outstanding)` and decrement only `platformFeeOutstandingNdp`. Never infer a top-up from the wallet's total balance and never consume reward/refund/seed credits.

- [ ] **Step 5: Grant a delayed reward in the same transaction**

When a completed financial becomes fully settled, compare `now` with its stored deadline. Before the deadline, credit the customer wallet by `userRewardEligibleNdp`, create one idempotent Booking completion ledger transaction/entry/reconciliation/audit, and mark `PAID/grantedAt`. At or after the deadline mark `EXPIRED`, grant 0, and write a non-financial audit event.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/wallet-adjustment-service.test.ts tests/ledger.repository.test.ts tests/ledger-service.test.ts`

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/ledger.service.ts backend/src/repositories/ledger.repository.ts backend/tests/wallet-adjustment-service.test.ts backend/tests/ledger.repository.test.ts backend/tests/ledger-service.test.ts
git commit -m "feat: settle platform fee debt from approved topups"
```

---

### Task 7: Expire Overdue Pending Rewards In Bounded Batches

**Files:**
- Create: `backend/src/services/booking-user-reward-expiry.service.ts`
- Create: `backend/src/repositories/booking-user-reward-expiry.repository.ts`
- Create: `backend/src/workers/booking-user-reward-expiry.worker.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/.env.dev.example`
- Create: `backend/tests/booking-user-reward-expiry.service.test.ts`
- Create: `backend/tests/booking-user-reward-expiry.worker.test.ts`
- Create: `backend/tests/booking-user-reward-expiry-config.test.ts`

**Interfaces:**
- Produces `expireDue({now,batchSize})` with a stable ID cursor and summary.
- Produces one worker controlled by `BOOKING_USER_REWARD_EXPIRY_INTERVAL_MS` and `BOOKING_USER_REWARD_EXPIRY_BATCH_SIZE`.

- [ ] **Step 1: Write failing service/worker/config tests**

Assert candidate query filters `PENDING`, deadline `<= now`, non-deleted rows, orders by ID, and caps the batch. Assert each candidate is re-locked and only a still-pending overdue row becomes `EXPIRED`; concurrent top-up winner remains `PAID`. Assert worker does not overlap runs and environment defaults are 300000 ms / 100 with minimum interval 60000 and batch range 1-500.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/booking-user-reward-expiry.service.test.ts tests/booking-user-reward-expiry.worker.test.ts tests/booking-user-reward-expiry-config.test.ts`

- [ ] **Step 3: Implement bounded idempotent expiry**

Follow the existing affiliate expiry worker shape. Candidate failures increment `failed` and are reported without aborting unrelated candidates. Each candidate transaction locks the financial row, uses the database-persisted deadline, marks only `PENDING -> EXPIRED`, and writes `booking.user_reward.expired` audit with no wallet or ledger mutation.

- [ ] **Step 4: Wire lifecycle and shutdown**

Create/start the worker beside the existing purge and affiliate workers. Add it to the same shutdown stop callback. Do not add a public mutation route.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/booking-user-reward-expiry.service.test.ts tests/booking-user-reward-expiry.worker.test.ts tests/booking-user-reward-expiry-config.test.ts`

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/booking-user-reward-expiry.service.ts backend/src/repositories/booking-user-reward-expiry.repository.ts backend/src/workers/booking-user-reward-expiry.worker.ts backend/src/config/env.ts backend/src/server.ts backend/.env.dev.example backend/tests/booking-user-reward-expiry.service.test.ts backend/tests/booking-user-reward-expiry.worker.test.ts backend/tests/booking-user-reward-expiry-config.test.ts
git commit -m "feat: expire overdue booking user rewards"
```

---

### Task 8: Dry-Run, Apply, Real-Database Reconcile, And Document

**Files:**
- Create: `backend/scripts/check-booking-platform-fee-debt-flow.ts`
- Create: `backend/tests/booking-platform-fee-debt-flow-script.test.ts`
- Modify: `backend/package.json`
- Modify: `README.md`
- Modify: `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`
- Modify: `docs/superpowers/specs/2026-08-28-platform-fee-acceptance-control-design.md`

**Interfaces:**
- Produces `npm --prefix backend run check:booking-platform-fee-debt-flow`.
- Produces pre/post migration and cleanup evidence against local non-production MySQL.

- [ ] **Step 1: Write the failing checker surface test**

Require the package script and guard strings for local-only database validation, unique fixture marker, disabled policy zero mutation, shop and technician payer snapshots, insufficient first-attempt rollback, explicit negative balance, cancellation reversal, immediate reward, delayed reward after approved top-up, expired reward, idempotency, and marker-only cleanup.

- [ ] **Step 2: Run the surface test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/booking-platform-fee-debt-flow-script.test.ts`

- [ ] **Step 3: Inspect migration dry-run and pre-apply counts**

Run:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npx --prefix backend prisma migrate diff --from-config-datasource --to-schema backend/prisma/schema.prisma --script
```

Record counts/sums for wallets, available/frozen balances, holds, ledger transactions, Booking orders, and OrderFinancial rows before apply. The diff must contain only this migration's additive changes.

- [ ] **Step 4: Apply the reviewed migration**

Run:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run prisma:status
```

Expected: `20260829010000_booking_platform_fee_debt_reward` applies once and schema is up to date.

- [ ] **Step 5: Implement and run the real-database checker**

The checker must refuse production flags, remote MySQL hosts, and production-looking database names. It creates uniquely marked real User/Customer/Technician/Shop/Service/Schedule/Booking/Wallet rows, exercises services and repositories rather than direct balance updates, asserts every state/ledger/audit invariant, and removes only rows bearing the marker in reverse FK order.

Run: `ENV_FILE=.env.dev npm --prefix backend run check:booking-platform-fee-debt-flow`

- [ ] **Step 6: Reconcile post-check counts and existing datasets**

Re-run the pre-apply aggregate counts after checker cleanup and require exact equality. Then run:

```bash
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run check:simulation-data
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run check:future-operations
```

Do not create the real-test-shop `feeEnabled=false` rows in this task; that apply belongs to the later test-data microstep after this state machine is accepted.

- [ ] **Step 7: Run full verification**

```bash
npm --prefix backend run lint
npm --prefix backend test -- --runInBand
npm --prefix backend run build
npm run verify:production-build
```

Expected: zero failures. If Supertest binding is sandbox-blocked, rerun the same tests with approved local execution rather than weakening them.

- [ ] **Step 8: Update documentation and commit**

Document exact migration/checker commands, counts, fee/debt/reward invariants, and explicitly leave pause acceptance, single-PENDING replacement, test-shop policy apply, and all portal/browser work unchecked.

```bash
git add backend/scripts/check-booking-platform-fee-debt-flow.ts backend/tests/booking-platform-fee-debt-flow-script.test.ts backend/package.json README.md docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md docs/superpowers/specs/2026-08-28-platform-fee-acceptance-control-design.md
git commit -m "test: verify booking platform fee debt flow"
```

