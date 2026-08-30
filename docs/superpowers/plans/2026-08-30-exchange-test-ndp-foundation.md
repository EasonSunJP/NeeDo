# Exchange Test NDP Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend NeeDo's existing Wallet/Ledger system so all current accounts and NDP history become non-settleable Test NDP, every current account has exactly 100,000 available Test NDP, and operations/finance surfaces show formal NDP and Test NDP separately.

**Architecture:** Keep one formal Wallet/Ledger stack and add `TEST_NDP` as an explicit ledger currency selected from server-side account classification. Persist currency on every transaction and financial snapshot, use idempotent audited calibration transactions for the 100,000 balance, and enforce formal-only settlement/export filters on the server. Extend existing paginated User, Wallet, Ledger, Backoffice, Auth, RBAC, OpenAPI, and high-fidelity React surfaces rather than introducing parallel APIs or UI.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma 7, MySQL 8, Zod, JWT/RBAC, Jest/Supertest, React 19, Vite, Vitest, existing five-language i18n.

## Global Constraints

- Work only in `/Users/eason/Documents/New project/.worktrees/exchange-demand-claim-step1` on branch `codex/exchange-demand-claim-step1`.
- The approved design is `docs/superpowers/specs/2026-08-30-exchange-test-ndp-foundation-design.md` at commit `d3417eb7`.
- This plan implements one microstep only. Stop after Test NDP migration, backoffice display, tests, and browser acceptance.
- Do not implement Request publication, claim, matching, booking conversion, payment, or the replacement 20-demand seed in this microstep.
- Do not add mock, demo, placeholder, fake API, fake payment, localStorage state, or a second wallet/ledger system.
- Preserve all existing NDP history and unrelated data. Do not reset, delete, or silently rewrite immutable audit records.
- All current accounts are test accounts. Every current user ends with exactly 100,000 available Test NDP; frozen Test NDP remains unchanged.
- New accounts default to formal accounts. Clients cannot choose their own account classification or transaction currency.
- Test NDP cannot be topped up, withdrawn, paid out, externally paid, formally reconciled, or included in formal settlement exports.
- Every protected mutation uses Zod, OpenAPI, RBAC, idempotency/concurrency protection, and audit logging.
- Every list remains server-paginated and avoids N+1 queries.
- No push, deployment, real payment, or external charge is authorized.
- Use `apply_patch` for hand edits and preserve unrelated worktree changes.

---

## File and Responsibility Map

### Database and migration safety

- `backend/prisma/schema.prisma`: account classification, Test NDP transaction vocabulary, reconciliation state, and currency snapshots.
- `backend/prisma/migrations/20260830210000_exchange_test_ndp_foundation/migration.sql`: additive schema changes plus guarded current-data reclassification.
- `backend/scripts/check-test-ndp-foundation.ts`: local-only preflight/postflight invariant checker.
- `backend/tests/exchange-test-ndp-schema.test.ts`: static Prisma and migration contract.
- `backend/tests/check-test-ndp-foundation-script.test.ts`: checker safety contract.

### Ledger currency and provisioning

- `backend/src/services/ledger-currency.service.ts`: one server-authoritative account-to-currency policy.
- `backend/src/services/ledger.service.ts`: existing mutation orchestration with explicit currency propagation.
- `backend/src/repositories/ledger.repository.ts`: currency-aware Prisma reads/writes and formal-only reconciliation export.
- `backend/src/services/test-ndp-provisioning.service.ts`: idempotent 100,000 Test NDP calibration rules.
- `backend/src/repositories/test-ndp-provisioning.repository.ts`: locked user/wallet/backfill persistence.
- `backend/scripts/backfill-test-ndp.ts`: local-only versioned provisioning entry point.
- `backend/tests/ledger-currency.service.test.ts`: currency policy tests.
- `backend/tests/test-ndp-provisioning.service.test.ts`: balance calibration and concurrency tests.

### Account management and auth

- `backend/src/repositories/user.repository.ts`: paginated user records plus grouped dual-wallet balance projection.
- `backend/src/services/user.service.ts`: payload serialization including classification and balances.
- `backend/src/repositories/test-account.repository.ts`: classification lock, active-funds check, and conditional update.
- `backend/src/services/test-account.service.ts`: financially safe account-classification transitions.
- `backend/src/controllers/test-account.controller.ts`: HTTP request/response boundary.
- `backend/src/validators/test-account.validator.ts`: mutation validation.
- `backend/src/routes/user.routes.ts`: protected classification route.
- `backend/src/services/auth.service.ts` and `backend/src/repositories/auth.repository.ts`: `/auth/me` classification payload.
- `backend/src/constants/permissions.constants.ts`: API/button permissions and role grants.
- `backend/tests/user-api.test.ts`, `backend/tests/auth.test.ts`, `backend/tests/auth-permissions.test.ts`: RBAC, audit, payload, and transition coverage.

### Finance and frontend

- `backend/src/repositories/backoffice.repository.ts`: paired aggregates and formal-only settlement rows/CSV.
- `backend/src/services/backoffice.service.ts`: paired NDP summary contract and audit event.
- `backend/src/controllers/backoffice.controller.ts`, `backend/src/routes/backoffice.routes.ts`, `backend/src/validators/backoffice.validator.ts`: summary endpoint.
- `backend/src/api/openapi.ts`: all new fields, filters, schemas, and paths.
- `src/api/userManagement.ts`, `src/features/wallet/api.ts`, `src/api/backofficeRealData.ts`: typed formal clients.
- `src/pages/admin/UserManagementWorkspace.tsx`: test-account badge, filter, dual balances, and protected classification action.
- `src/pages/user/UserCenterPage.tsx`: active wallet currency label.
- `src/components/admin/NdpMetricValue.tsx`: one reusable formal/Test NDP metric renderer.
- `src/pages/admin/FinancePage.tsx`: paired metrics and final settlement exclusion.
- `src/i18n/translations.ts`: five-language Test NDP labels used outside the account-workspace local copy table.
- `src/pages/admin/UserManagementWorkspace.test.tsx`, `src/pages/admin/FinancePage.test.ts`, `src/components/admin/NdpMetricValue.test.tsx`, `src/features/wallet/api.test.ts`: frontend contract and behavior tests.

---

### Task 1: Add the additive schema and guarded reclassification migration

**Files:**
- Create: `backend/tests/exchange-test-ndp-schema.test.ts`
- Create: `backend/prisma/migrations/20260830210000_exchange_test_ndp_foundation/migration.sql`
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: existing `User`, `Wallet`, `LedgerTransaction`, `FinanceReconciliation`, `WalletHold`, and `OrderFinancial` models.
- Produces: `User.isTestAccount`, `TEST_BALANCE_CALIBRATION`, `TEST_ONLY`, `WalletHold.currency`, and `OrderFinancial.ndpCurrency` for all later tasks.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Exchange Test NDP foundation schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260830210000_exchange_test_ndp_foundation/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  const modelBlock = (name: string): string => {
    const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing model ${name}`);
    return match[1];
  };

  it("persists test classification and currency snapshots", () => {
    expect(schema).toMatch(/isTestAccount\s+Boolean\s+@default\(false\)\s+@map\("is_test_account"\)/);
    expect(schema).toMatch(/TEST_BALANCE_CALIBRATION\s+@map\("test_balance_calibration"\)/);
    expect(schema).toMatch(/TEST_ONLY\s+@map\("test_only"\)/);
    expect(modelBlock("WalletHold")).toMatch(/currency\s+String\s+@default\("NDP"\)/);
    expect(modelBlock("OrderFinancial")).toMatch(
      /ndpCurrency\s+String\s+@default\("NDP"\)\s+@map\("ndp_currency"\)/
    );
  });

  it("ships one migration that preserves history and reclassifies current data", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("UPDATE `users` SET `is_test_account` = TRUE");
    expect(migration).toContain("UPDATE `wallets` SET `currency` = 'TEST_NDP'");
    expect(migration).toContain("UPDATE `ledger_transactions` SET `currency` = 'TEST_NDP'");
    expect(migration).toContain("UPDATE `finance_reconciliations`");
    expect(migration).not.toMatch(/DELETE\s+FROM|DROP\s+TABLE/i);
  });
});
```

- [ ] **Step 2: Run the schema test and verify the red state**

Run: `cd backend && npm test -- tests/exchange-test-ndp-schema.test.ts`

Expected: FAIL because `isTestAccount`, the new enum values, snapshot fields, and migration file do not exist.

- [ ] **Step 3: Add the exact Prisma fields and enum values**

Add these model fields and indexes without changing existing mapped names:

```prisma
model User {
  isTestAccount Boolean @default(false) @map("is_test_account")

  @@index([isTestAccount, deletedAt], map: "users_test_account_deleted_idx")
}

enum LedgerTransactionType {
  TEST_BALANCE_CALIBRATION @map("test_balance_calibration")
}

enum FinanceReconciliationStatus {
  TEST_ONLY @map("test_only")
}

model WalletHold {
  currency String @default("NDP") @db.VarChar(10)

  @@index([currency, status], map: "wallet_holds_currency_status_idx")
}

model OrderFinancial {
  ndpCurrency String @default("NDP") @map("ndp_currency") @db.VarChar(10)

  @@index([ndpCurrency, createdAt], map: "order_financials_ndp_currency_created_idx")
}
```

Keep each insertion inside the existing model or enum block; do not duplicate model declarations.

- [ ] **Step 4: Create the migration with explicit history-preserving DDL/DML**

The migration must contain the full current ledger enum vocabulary plus the new mapped value:

```sql
ALTER TABLE `users`
  ADD COLUMN `is_test_account` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD INDEX `users_test_account_deleted_idx` (`is_test_account`, `deleted_at`);

ALTER TABLE `ledger_transactions`
  MODIFY `type` ENUM(
    'booking_accept_freeze',
    'booking_cancel_unfreeze',
    'booking_complete_settlement',
    'booking_merchant_cancel_compensation',
    'manual_topup_approved',
    'manual_withdrawal_approved',
    'seed_credit',
    'affiliate_task_budget_freeze',
    'affiliate_task_budget_release',
    'affiliate_reward_settlement',
    'affiliate_reward_reversal',
    'affiliate_reward_recovery',
    'test_balance_calibration'
  ) NOT NULL;

ALTER TABLE `finance_reconciliations`
  MODIFY `status` ENUM('pending', 'exported', 'test_only') NOT NULL DEFAULT 'pending';

ALTER TABLE `wallet_holds`
  ADD COLUMN `currency` VARCHAR(10) NOT NULL DEFAULT 'NDP',
  ADD INDEX `wallet_holds_currency_status_idx` (`currency`, `status`);

ALTER TABLE `order_financials`
  ADD COLUMN `ndp_currency` VARCHAR(10) NOT NULL DEFAULT 'NDP',
  ADD INDEX `order_financials_ndp_currency_created_idx` (`ndp_currency`, `created_at`);

UPDATE `users` SET `is_test_account` = TRUE;
UPDATE `wallets` SET `currency` = 'TEST_NDP' WHERE `currency` = 'NDP';
UPDATE `ledger_transactions` SET `currency` = 'TEST_NDP' WHERE `currency` = 'NDP';
UPDATE `finance_reconciliations`
SET `currency` = 'TEST_NDP', `status` = 'test_only'
WHERE `currency` = 'NDP';
UPDATE `wallet_holds` SET `currency` = 'TEST_NDP' WHERE `currency` = 'NDP';
UPDATE `order_financials` SET `ndp_currency` = 'TEST_NDP' WHERE `ndp_currency` = 'NDP';
```

- [ ] **Step 5: Generate Prisma Client and run the contract test**

Run:

```bash
cd backend
npm run prisma:generate
npm test -- tests/exchange-test-ndp-schema.test.ts
```

Expected: Prisma generation succeeds and the schema contract passes.

- [ ] **Step 6: Commit the schema boundary**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260830210000_exchange_test_ndp_foundation/migration.sql backend/tests/exchange-test-ndp-schema.test.ts
git commit -m "feat(ledger): add Test NDP schema foundation"
```

---

### Task 2: Make the ledger repository explicitly currency-aware

**Files:**
- Create: `backend/src/services/ledger-currency.service.ts`
- Create: `backend/tests/ledger-currency.service.test.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/tests/ledger.repository.test.ts`
- Modify: `backend/src/constants/error-codes.ts`

**Interfaces:**
- Consumes: `User.isTestAccount` and existing wallet uniqueness by owner/currency.
- Produces: `LedgerCurrency`, `LedgerCurrencyService.resolveForUser(userId)`, explicit currency parameters for transaction/reconciliation creation, and stable mismatch errors.

- [ ] **Step 1: Write failing currency-policy tests**

```ts
import { LedgerCurrencyService } from "../src/services/ledger-currency.service";

describe("LedgerCurrencyService", () => {
  it.each([
    [true, "TEST_NDP"],
    [false, "NDP"]
  ] as const)("maps isTestAccount=%s to %s", async (isTestAccount, expected) => {
    const repository = {
      findUserAccountClassification: jest.fn().mockResolvedValue({ isTestAccount })
    };
    await expect(new LedgerCurrencyService(repository).resolveForUser(41)).resolves.toBe(expected);
  });

  it("rejects a missing user and mixed wallet currency", async () => {
    const repository = { findUserAccountClassification: jest.fn().mockResolvedValue(null) };
    await expect(new LedgerCurrencyService(repository).resolveForUser(404)).rejects.toMatchObject({
      statusCode: 404
    });
    expect(() => LedgerCurrencyService.assertSameCurrency("NDP", ["NDP", "TEST_NDP"]))
      .toThrow("error.ledger.currency_mismatch");
  });
});
```

- [ ] **Step 2: Run policy and repository tests to verify failure**

Run: `cd backend && npm test -- tests/ledger-currency.service.test.ts tests/ledger.repository.test.ts`

Expected: FAIL because the currency service and explicit repository inputs are absent.

- [ ] **Step 3: Create the focused currency policy**

```ts
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export type LedgerCurrency = "NDP" | "TEST_NDP";

export interface LedgerCurrencyRepositoryPort {
  findUserAccountClassification(userId: number): Promise<{ isTestAccount: boolean } | null>;
}

export class LedgerCurrencyService {
  public constructor(private readonly repository: LedgerCurrencyRepositoryPort) {}

  public async resolveForUser(userId: number): Promise<LedgerCurrency> {
    const user = await this.repository.findUserAccountClassification(userId);
    if (!user) {
      throw new AppError({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: "error.user.not_found",
        statusCode: 404
      });
    }
    return user.isTestAccount ? "TEST_NDP" : "NDP";
  }

  public static assertSameCurrency(
    expected: LedgerCurrency,
    actual: LedgerCurrency[]
  ): void {
    if (actual.some((currency) => currency !== expected)) {
      throw new AppError({
        code: ERROR_CODES.LEDGER_CURRENCY_MISMATCH,
        message: "error.ledger.currency_mismatch",
        statusCode: 409
      });
    }
  }
}
```

Add non-colliding error codes after the current `40946` allocation:

```ts
LEDGER_CURRENCY_MISMATCH: 40947,
TEST_NDP_SETTLEMENT_FORBIDDEN: 40948,
ACCOUNT_CLASSIFICATION_CONFLICT: 40949,
ACCOUNT_CLASSIFICATION_STALE: 40950,
```

- [ ] **Step 4: Move `LedgerCurrency` imports and make repository writes explicit**

Change the repository port and implementation contracts to require currency:

```ts
createTransaction(input: {
  idempotencyKey: string;
  type: LedgerTransactionType;
  referenceType: string;
  referenceId: number;
  actorUserId: number | null;
  amount: number;
  currency: LedgerCurrency;
  metadata?: unknown;
}): Promise<LedgerTransactionPayload>;

createFinanceReconciliation(input: {
  transactionId: number;
  referenceType: string;
  referenceId: number;
  currency: Extract<LedgerCurrency, "NDP">;
  expectedAmount: number;
  actualAmount: number;
}): Promise<void>;
```

Update the shared payload vocabulary at the same boundary:

```ts
export type LedgerTransactionType =
  | "booking_accept_freeze"
  | "booking_cancel_unfreeze"
  | "booking_complete_settlement"
  | "booking_merchant_cancel_compensation"
  | "manual_topup_approved"
  | "manual_withdrawal_approved"
  | "seed_credit"
  | "affiliate_task_budget_freeze"
  | "affiliate_task_budget_release"
  | "affiliate_reward_settlement"
  | "affiliate_reward_reversal"
  | "affiliate_reward_recovery"
  | "test_balance_calibration";

export type FinanceReconciliationStatus = "pending" | "exported" | "test_only";

export interface WalletHoldPayload {
  currency: LedgerCurrency;
}

export interface OrderFinancialUpsertInput {
  ndpCurrency: LedgerCurrency;
}
```

Insert the new properties into the existing interfaces rather than replacing their other fields.

Persist `input.currency`; remove the four repository hard-codes reported by:

Run: `rg -n 'currency: "NDP"' backend/src/repositories/ledger.repository.ts`

Expected after the edit: no mutation mapper or create method injects NDP unconditionally. Formal reconciliation list/export repository filters must include `currency: "NDP"` as a security predicate; those two explicit filters remain allowed.

- [ ] **Step 5: Add account-classification lookup and currency consistency checks**

Implement one repository query:

```ts
public async findUserAccountClassification(
  userId: number
): Promise<{ isTestAccount: boolean } | null> {
  return this.client.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { isTestAccount: true }
  });
}
```

Before ledger-entry creation, load the wallet currency and call `LedgerCurrencyService.assertSameCurrency(transaction.currency, [wallet.currency])`. Map only the two allowed strings; an unknown database value produces the stable mismatch error.

- [ ] **Step 6: Run focused tests and static hard-code audit**

Run:

```bash
cd backend
npm test -- tests/ledger-currency.service.test.ts tests/ledger.repository.test.ts
rg -n 'currency: "NDP"' src/repositories/ledger.repository.ts
```

Expected: tests PASS; remaining grep hits are formal-only list/export predicates documented in the test.

- [ ] **Step 7: Commit the currency core**

```bash
git add backend/src/services/ledger-currency.service.ts backend/src/services/ledger.service.ts backend/src/repositories/ledger.repository.ts backend/src/constants/error-codes.ts backend/tests/ledger-currency.service.test.ts backend/tests/ledger.repository.test.ts
git commit -m "refactor(ledger): make transaction currency explicit"
```

---

### Task 3: Propagate account currency through existing ledger producers

**Files:**
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/tests/ledger-service.test.ts`
- Modify: `backend/tests/affiliate-budget-ledger.service.test.ts`
- Modify: `backend/tests/wallet-adjustment-service.test.ts`
- Modify: `backend/tests/booking-service.test.ts`

**Interfaces:**
- Consumes: `LedgerCurrencyService.resolveForUser`, explicit repository currency inputs, and `OrderFinancial.ndpCurrency`.
- Produces: currency-safe Booking, Affiliate, wallet read, wallet adjustment, hold/release/capture, compensation, and reward flows.

- [ ] **Step 1: Add failing producer tests for both account classes**

Add table-driven assertions to the existing test fixtures:

```ts
it.each([
  [false, "NDP"],
  [true, "TEST_NDP"]
] as const)("uses %s currency for booking freeze", async (isTestAccount, currency) => {
  const repository = new InMemoryLedgerRepository();
  repository.accountClassifications.set(3, isTestAccount);
  repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000, currency });
  const service = new LedgerService(repository, createFeeService());
  await service.freezeBookingAcceptance(
    bookingInput({ bookingOrderId: 1, shopId: 10, actorUserId: 2, customerUserId: 3 })
  );
  expect(repository.wallets.get(`shop:10:${currency}`)).toMatchObject({
    availableBalance: 500,
    frozenBalance: 500,
    currency
  });
  expect(Array.from(repository.transactions.values())[0]).toMatchObject({ currency });
});
```

Extend `InMemoryLedgerRepository` with `accountClassifications = new Map<number, boolean>()`, a `findUserAccountClassification(userId)` method, and a `currency` argument/default in `seedWallet`; update its wallet key to `${ownerType}:${ownerId}:${currency}`.

Add equivalent assertions for affiliate budget freeze/release/reward, booking release/settlement/compensation, delayed rewards, and `getMyWallet`.

Add this forbidden adjustment assertion:

```ts
it("rejects top-up and withdrawal for a Test NDP wallet", async () => {
  repository.findUserAccountClassification.mockResolvedValue({ isTestAccount: true });
  await expect(service.createWalletAdjustmentRequest(actor, adjustmentInput)).rejects.toMatchObject({
    code: ERROR_CODES.TEST_NDP_SETTLEMENT_FORBIDDEN,
    statusCode: 409
  });
});
```

- [ ] **Step 2: Run the affected service tests and verify failure**

Run:

```bash
cd backend
npm test -- tests/ledger-service.test.ts tests/affiliate-budget-ledger.service.test.ts tests/wallet-adjustment-service.test.ts tests/booking-service.test.ts
```

Expected: FAIL because existing methods still use the `CURRENCY = "NDP"` constant.

- [ ] **Step 3: Replace the global currency constant with per-operation resolution**

For each public mutation in `LedgerService`, resolve once at the transaction boundary and pass the value to every wallet and transaction call:

```ts
const currency = await this.currencyService.resolveForUser(input.customerUserId);
const payerWallet = await repository.getOrCreateWallet({
  ownerType: holdOwner.ownerType,
  ownerId: holdOwner.ownerId,
  currency
});
const transaction = await repository.createTransaction({
  idempotencyKey,
  type: "booking_accept_freeze",
  referenceType: "booking_order",
  referenceId: input.bookingOrderId,
  actorUserId: input.actorUserId,
  amount: holdAmount,
  currency,
  metadata: this.feeMetadata(fee)
});
```

Apply this pattern to the exact public methods found by:

```bash
rg -n '^  public (async )?[A-Za-z]' backend/src/services/ledger.service.ts
```

The required mutation methods are `freezeAffiliateTaskBudget`, `releaseAffiliateTaskBudget`, `settleAffiliateReward`, `freezeBookingAcceptance`, `releaseBookingHold`, `settleBookingCompletion`, `compensateCustomerForMerchantCancellation`, and delayed reward settlement paths called from booking completion.

- [ ] **Step 4: Snapshot and reuse order currency**

At the first booking financial event, persist:

```ts
await repository.upsertOrderFinancial({
  bookingOrderId: input.bookingOrderId,
  orderType: input.orderType,
  customerUserId: input.customerUserId,
  shopId: input.shopId,
  ndpCurrency: currency,
  settlementStatus: "holding"
});
```

Subsequent release, capture, compensation, and reward methods read `ndpCurrency` from the order snapshot and reject a wallet/transaction mismatch. Changing `User.isTestAccount` cannot alter an existing order's currency.

- [ ] **Step 5: Make wallet reads active-currency aware and adjustments formal-only**

`getMyWallet(actor)` resolves the actor's classification and returns that wallet. `createWalletAdjustmentRequest` and review approval reject when the referenced wallet currency is `TEST_NDP`. `getWallet` and wallet-ledger authorization retain owner scoping and never accept a client-provided currency override for another wallet.

- [ ] **Step 6: Exclude Test NDP from reconciliation creation**

Replace unconditional reconciliation creation with:

```ts
if (transaction.currency === "NDP") {
  await repository.createFinanceReconciliation({
    transactionId: transaction.id,
    referenceType: transaction.referenceType,
    referenceId: transaction.referenceId,
    currency: "NDP",
    expectedAmount: input.expectedAmount,
    actualAmount: input.actualAmount
  });
}
```

Audit events still record Test NDP internal transactions with `currency: "TEST_NDP"` metadata.

- [ ] **Step 7: Run producer and API regressions**

Run:

```bash
cd backend
npm test -- tests/ledger-service.test.ts tests/affiliate-budget-ledger.service.test.ts tests/wallet-adjustment-service.test.ts tests/booking-service.test.ts tests/ledger-api.test.ts tests/wallet-adjustment-api.test.ts
```

Expected: all selected suites PASS and no Test NDP path creates a finance reconciliation.

- [ ] **Step 8: Commit producer propagation**

```bash
git add backend/src/services/ledger.service.ts backend/src/services/booking.service.ts backend/src/repositories/ledger.repository.ts backend/tests/ledger-service.test.ts backend/tests/affiliate-budget-ledger.service.test.ts backend/tests/wallet-adjustment-service.test.ts backend/tests/booking-service.test.ts
git commit -m "feat(ledger): route test accounts through Test NDP"
```

---

### Task 4: Add idempotent 100,000 Test NDP provisioning and migration checks

**Files:**
- Create: `backend/src/repositories/test-ndp-provisioning.repository.ts`
- Create: `backend/src/services/test-ndp-provisioning.service.ts`
- Create: `backend/scripts/backfill-test-ndp.ts`
- Create: `backend/scripts/check-test-ndp-foundation.ts`
- Create: `backend/tests/test-ndp-provisioning.service.test.ts`
- Create: `backend/tests/check-test-ndp-foundation-script.test.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/scripts/seed-three-month-simulation.ts`
- Modify: `backend/src/simulation/lifedance-admin2-provisioning.ts`
- Modify: `backend/tests/user-management-seed.test.ts`
- Modify: `backend/tests/lifedance-admin2-provisioning.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: migrated test accounts, existing wallet/ledger models, `TEST_BALANCE_CALIBRATION`, and transaction idempotency.
- Produces: `TestNdpProvisioningService.calibrateUser(userId)` and guarded `backfill:test-ndp` / `check:test-ndp-foundation` commands.

- [ ] **Step 1: Write failing calibration tests**

```ts
const makeWallet = (availableBalance: number) => ({
  id: 91,
  ownerType: "user" as const,
  ownerId: 41,
  currency: "TEST_NDP" as const,
  availableBalance,
  frozenBalance: 17,
  createdAt: new Date("2026-08-30T00:00:00.000Z"),
  updatedAt: new Date("2026-08-30T00:00:00.000Z")
});

const createFixture = () => {
  const repository = {
    runInTransaction: jest.fn(async (handler) => handler(repository)),
    findCalibration: jest.fn().mockResolvedValue(null),
    lockUser: jest.fn().mockResolvedValue({ id: 41, isTestAccount: true }),
    getOrCreateAndLockTestWallet: jest.fn(),
    createCalibration: jest.fn(async (input) => ({
      status: "applied" as const,
      userId: input.userId,
      adjustmentAmount: input.amount,
      availableBalance: 100000
    })),
    recordZeroCalibration: jest.fn().mockResolvedValue(undefined)
  };
  return { repository, service: new TestNdpProvisioningService(repository) };
};

describe("TestNdpProvisioningService", () => {
  it.each([
    [0, 100000, "available_credit"],
    [40000, 60000, "available_credit"],
    [100000, 0, null],
    [125000, 25000, "available_debit"]
  ] as const)(
    "calibrates available balance %s to 100000",
    async (availableBalance, amount, direction) => {
      const { repository, service } = createFixture();
      repository.getOrCreateAndLockTestWallet.mockResolvedValue(makeWallet(availableBalance));
      const result = await service.calibrateUser(41);
      expect(result.availableBalance).toBe(100000);
      expect(result.adjustmentAmount).toBe(amount);
      if (direction) {
        expect(repository.createCalibration).toHaveBeenCalledWith(
          expect.objectContaining({ amount, direction, currency: "TEST_NDP" })
        );
      } else {
        expect(repository.createCalibration).not.toHaveBeenCalled();
      }
    }
  );

  it("returns the existing result on repeat execution", async () => {
    const { repository, service } = createFixture();
    repository.findCalibration.mockResolvedValue({
      amount: 100000,
      availableBalanceAfter: 100000
    });
    await expect(service.calibrateUser(41)).resolves.toMatchObject({
      status: "already_applied",
      availableBalance: 100000
    });
    expect(repository.applyDelta).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && npm test -- tests/test-ndp-provisioning.service.test.ts tests/check-test-ndp-foundation-script.test.ts`

Expected: FAIL because the provisioning service and scripts do not exist.

- [ ] **Step 3: Implement the service contract**

```ts
export const TEST_NDP_TARGET_AVAILABLE = 100_000;
export const TEST_NDP_BACKFILL_VERSION = "exchange-test-ndp-v1";

export interface TestNdpCalibrationResult {
  status: "applied" | "already_applied";
  userId: number;
  adjustmentAmount: number;
  availableBalance: number;
}

export interface TestNdpProvisioningTransactionPort {
  findCalibration(
    idempotencyKey: string
  ): Promise<{ amount: number; availableBalanceAfter: number } | null>;
  lockUser(userId: number): Promise<{ id: number; isTestAccount: boolean } | null>;
  getOrCreateAndLockTestWallet(userId: number): Promise<WalletPayload>;
  createCalibration(input: {
    idempotencyKey: string;
    userId: number;
    walletId: number;
    amount: number;
    direction: "available_credit" | "available_debit";
    availableDelta: number;
    currency: "TEST_NDP";
    targetAvailableBalance: number;
  }): Promise<TestNdpCalibrationResult>;
  recordZeroCalibration(input: {
    idempotencyKey: string;
    userId: number;
    availableBalance: number;
  }): Promise<void>;
}

export interface TestNdpProvisioningRepositoryPort {
  runInTransaction<T>(
    handler: (transaction: TestNdpProvisioningTransactionPort) => Promise<T>
  ): Promise<T>;
}

export class TestNdpProvisioningService {
  public constructor(private readonly repository: TestNdpProvisioningRepositoryPort) {}

  public calibrateUser(userId: number): Promise<TestNdpCalibrationResult> {
    const idempotencyKey = `${TEST_NDP_BACKFILL_VERSION}:user:${userId}:calibrate`;
    return this.repository.runInTransaction(async (tx) => {
      const existing = await tx.findCalibration(idempotencyKey);
      if (existing) {
        return {
          status: "already_applied",
          userId,
          adjustmentAmount: existing.amount,
          availableBalance: existing.availableBalanceAfter
        };
      }
      const user = await tx.lockUser(userId);
      if (!user || !user.isTestAccount) {
        throw new Error("error.test_ndp.account_not_test");
      }
      const wallet = await tx.getOrCreateAndLockTestWallet(userId);
      const delta = TEST_NDP_TARGET_AVAILABLE - wallet.availableBalance;
      if (delta === 0) {
        await tx.recordZeroCalibration({ idempotencyKey, userId, availableBalance: wallet.availableBalance });
        return { status: "applied", userId, adjustmentAmount: 0, availableBalance: wallet.availableBalance };
      }
      return tx.createCalibration({
        idempotencyKey,
        userId,
        walletId: wallet.id,
        amount: Math.abs(delta),
        direction: delta > 0 ? "available_credit" : "available_debit",
        availableDelta: delta,
        currency: "TEST_NDP",
        targetAvailableBalance: TEST_NDP_TARGET_AVAILABLE
      });
    });
  }
}
```

The repository locks `SELECT id, is_test_account, updated_at FROM users WHERE id = ? FOR UPDATE` and the matching Test NDP wallet row, then performs the conditional wallet delta, transaction creation, ledger-entry creation, and audit creation in one Prisma transaction. It never changes `frozenBalance`.

`recordZeroCalibration` creates one `test_balance_calibration` transaction with amount `0` and result balance in metadata, plus its audit row, but creates no zero-value `WalletLedger` entry. This transaction is the durable idempotency marker for an account already at 100,000.

- [ ] **Step 4: Implement local-only backfill and invariant checker guards**

Both scripts must reject staging, production, non-local database hosts, and production-looking database names before importing Prisma. The backfill requires `--apply`; without it, it prints counts and proposed deltas only.

Add package commands:

```json
{
  "backfill:test-ndp": "ENV_FILE=.env.dev tsx scripts/backfill-test-ndp.ts",
  "check:test-ndp-foundation": "ENV_FILE=.env.dev tsx scripts/check-test-ndp-foundation.ts"
}
```

The checker must assert:

```ts
assert(nonTestUserCount === 0, "every current user must be a test account");
assert(userWalletCount === activeUserCount, "every current user must have one Test NDP wallet");
assert(nonTargetBalanceCount === 0, "every Test NDP user wallet must have 100000 available");
assert(currencyMismatchCount === 0, "wallet and transaction currencies must agree");
assert(formalExportableTestRows === 0, "Test NDP must not be formally exportable");
```

- [ ] **Step 5: Wire formal local/test account provisioners to Test NDP**

Make every formal local/test account provisioner explicit:

```ts
export const buildSeedUserUpdateData = (input: SeedUserInput, passwordHash: string) => ({
  phone: input.phone ?? null,
  emailVerifiedAt: input.emailVerifiedAt ?? new Date(),
  passwordHash,
  username: input.username,
  ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
  isActive: true,
  isTestAccount: true,
  deletedAt: null
});
```

Add `isTestAccount: true` to the matching seed-user create data and LifeDance admin2 provisioning data. After each seed/provisioning transaction commits, call `TestNdpProvisioningService.calibrateUser(userId)` for every returned test user ID. Do not invoke provisioning inside the account-creation transaction with a different Prisma client. Extend `user-management-seed.test.ts` and `lifedance-admin2-provisioning.test.ts` to prove the flag is explicit and the provisioning call is made once per account.

- [ ] **Step 6: Run service and script-contract tests**

Run:

```bash
cd backend
npm test -- tests/test-ndp-provisioning.service.test.ts tests/check-test-ndp-foundation-script.test.ts tests/user-management-seed.test.ts tests/lifedance-admin2-provisioning.test.ts
npm run lint -- --no-error-on-unmatched-pattern
```

Expected: selected tests PASS and lint reports no new errors.

- [ ] **Step 7: Commit provisioning**

```bash
git add backend/src/repositories/test-ndp-provisioning.repository.ts backend/src/services/test-ndp-provisioning.service.ts backend/scripts/backfill-test-ndp.ts backend/scripts/check-test-ndp-foundation.ts backend/prisma/seed.ts backend/scripts/seed-three-month-simulation.ts backend/src/simulation/lifedance-admin2-provisioning.ts backend/tests/test-ndp-provisioning.service.test.ts backend/tests/check-test-ndp-foundation-script.test.ts backend/tests/user-management-seed.test.ts backend/tests/lifedance-admin2-provisioning.test.ts backend/package.json
git commit -m "feat(ledger): provision audited Test NDP balances"
```

---

### Task 5: Add test-account management, dual balances, Auth Me, RBAC, and audit

**Files:**
- Create: `backend/src/repositories/test-account.repository.ts`
- Create: `backend/src/services/test-account.service.ts`
- Create: `backend/src/controllers/test-account.controller.ts`
- Create: `backend/src/validators/test-account.validator.ts`
- Modify: `backend/src/repositories/user.repository.ts`
- Modify: `backend/src/services/user.service.ts`
- Modify: `backend/src/routes/user.routes.ts`
- Modify: `backend/src/repositories/auth.repository.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/prisma/migrations/20260830210000_exchange_test_ndp_foundation/migration.sql`
- Modify: `backend/tests/helpers/step06-fixture.ts`
- Modify: `backend/tests/user-api.test.ts`
- Modify: `backend/tests/auth.test.ts`
- Modify: `backend/tests/auth-permissions.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: Test NDP provisioning and account currency policy.
- Produces: paginated/filterable user balance payloads, `PATCH /api/v1/users/:id/test-account`, and `/auth/me.isTestAccount`.

- [ ] **Step 1: Write failing API/RBAC tests**

Add these assertions to `user-api.test.ts`:

```ts
expect(listResponse.body.data.list[0]).toMatchObject({
  isTestAccount: true,
  balances: {
    ndp: { available: 0, frozen: 0 },
    testNdp: { available: 100000, frozen: 0 }
  }
});

await request(fixture.app)
  .patch("/api/v1/users/2/test-account")
  .set("Authorization", `Bearer ${accessToken}`)
  .send({ isTestAccount: false, expectedUpdatedAt: now.toISOString() })
  .expect(200);

expect(fixture.auditLogs).toContainEqual(
  expect.objectContaining({
    action: "user.test_account.update",
    targetType: "User",
    targetId: 2
  })
);
```

Add 403 coverage for an actor lacking `user:test-account:update`, 409 coverage for stale `expectedUpdatedAt`, and 409 coverage for frozen/active Test NDP financial state. Add `/users?isTestAccount=true` pagination/filter coverage and `/auth/me` expectation `isTestAccount: true`.

- [ ] **Step 2: Run the focused API tests and verify failure**

Run:

```bash
cd backend
npm test -- tests/user-api.test.ts tests/auth.test.ts tests/auth-permissions.test.ts tests/openapi.test.ts
```

Expected: FAIL because payload fields, permission, validator, route, and OpenAPI path are absent.

- [ ] **Step 3: Add Zod and the dedicated controller/service contract**

```ts
import { z } from "zod";

export const testAccountUpdateBodySchema = z.object({
  isTestAccount: z.boolean(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).transform((value) => new Date(value))
});

export type TestAccountUpdateBody = z.infer<typeof testAccountUpdateBodySchema>;
```

The service signature is:

```ts
updateClassification(
  userId: number,
  input: { isTestAccount: boolean; expectedUpdatedAt: Date },
  actor: AuthenticatedAccessContext,
  context: AuthRequestContext
): Promise<UserPayload>;
```

It locks the user, rejects stale state, rejects active holds/frozen balances, updates the classification conditionally, calibrates only the first transition into test status, and writes `user.test_account.update` audit metadata containing old/new classification and active currency.

- [ ] **Step 4: Add grouped dual-wallet balance projection**

Extend `UserPayload` with:

```ts
isTestAccount: boolean;
balances: {
  ndp: { available: number; frozen: number };
  testNdp: { available: number; frozen: number };
};
```

`UserRepository.list` performs the existing paginated user query, then one wallet query:

```ts
const wallets = await this.client.wallet.findMany({
  where: {
    ownerType: "USER",
    ownerId: { in: list.map((user) => user.id) },
    currency: { in: ["NDP", "TEST_NDP"] },
    deletedAt: null
  },
  select: {
    ownerId: true,
    currency: true,
    availableBalance: true,
    frozenBalance: true
  }
});
```

Attach a fixed zero-valued balance when one currency wallet does not exist. Add `isTestAccount` to `UserListInput` and the validated query filter.

- [ ] **Step 5: Register permissions and route**

Add:

```ts
createPermission(
  "user:test-account:update",
  "更新测试账号标记",
  "api",
  "user",
  "切换正式账号与测试账号并审计资金边界"
),
createPermission(
  "button:user:test-account:update",
  "测试账号切换按钮",
  "button",
  "user",
  "显示测试账号切换操作"
),
```

Grant both to `admin` through the system permission set and to `operator`; do not grant them to support, finance, merchant, technician, affiliate, or customer roles.

Add deploy-safe permission DML to the same unapplied feature migration:

```sql
INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('更新测试账号标记', 'user:test-account:update', 'api', 'user', '切换正式账号与测试账号并审计资金边界', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('测试账号切换按钮', 'button:user:test-account:update', 'button', 'user', '显示测试账号切换操作', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN ('user:test-account:update', 'button:user:test-account:update')
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
```

Register:

```ts
router.patch(
  "/users/:id/test-account",
  authenticate(),
  authorize("user:test-account:update"),
  validateRequest({ params: userIdParamSchema, body: testAccountUpdateBodySchema }),
  testAccountController.update
);
```

- [ ] **Step 6: Expose classification through Auth Me and OpenAPI**

Add `isTestAccount: boolean` to `AuthUserRecord`, `AuthMePayload`, serializer output, the User/OpenAPI schema, user list query, wallet summary schema, and the test-account mutation path. Do not include wallet balances in access tokens.

- [ ] **Step 7: Run API, permissions, and OpenAPI tests**

Run:

```bash
cd backend
npm test -- tests/user-api.test.ts tests/user.repository.test.ts tests/auth.test.ts tests/auth-permissions.test.ts tests/openapi.test.ts
```

Expected: all selected suites PASS; user list remains paginated and fixture query count proves no N+1 balance lookup.

- [ ] **Step 8: Commit account management**

```bash
git add backend/src/repositories/test-account.repository.ts backend/src/services/test-account.service.ts backend/src/controllers/test-account.controller.ts backend/src/validators/test-account.validator.ts backend/src/repositories/user.repository.ts backend/src/services/user.service.ts backend/src/routes/user.routes.ts backend/src/repositories/auth.repository.ts backend/src/services/auth.service.ts backend/src/constants/permissions.constants.ts backend/src/api/openapi.ts backend/prisma/migrations/20260830210000_exchange_test_ndp_foundation/migration.sql backend/tests/helpers/step06-fixture.ts backend/tests/user-api.test.ts backend/tests/auth.test.ts backend/tests/auth-permissions.test.ts backend/tests/openapi.test.ts
git commit -m "feat(users): manage audited test account classification"
```

---

### Task 6: Add wallet summary and paired finance reporting with formal-only exports

**Files:**
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/controllers/ledger.controller.ts`
- Modify: `backend/src/routes/ledger.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/tests/ledger-api.test.ts`
- Modify: `backend/tests/finance-center-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: active account currency, `OrderFinancial.ndpCurrency`, and formal-only reconciliation predicates.
- Produces: `GET /api/v1/wallets/me/summary`, `GET /api/v1/backoffice/finance/ndp-summary`, paired finance values, and server-enforced Test NDP export exclusion.

- [ ] **Step 1: Write failing wallet-summary and finance-summary API tests**

```ts
await request(app)
  .get("/api/v1/wallets/me/summary")
  .set("Authorization", `Bearer ${testUserToken}`)
  .expect(200)
  .expect((response) => {
    expect(response.body.data).toEqual({
      activeCurrency: "TEST_NDP",
      ndp: { available: 0, frozen: 0 },
      testNdp: { available: 100000, frozen: 0 }
    });
  });

await request(app)
  .get("/api/v1/backoffice/finance/ndp-summary?date=2026-08-30")
  .set("Authorization", `Bearer ${adminToken}`)
  .expect(200)
  .expect((response) => {
    expect(response.body.data.todayNdpConsumption).toEqual({ ndp: 999, testNdp: 999 });
    expect(response.body.data.settleableNdp).toBe(999);
  });
```

Also assert that formal settlement and reconciliation CSV content contains no row whose snapshot currency is `TEST_NDP`.

- [ ] **Step 2: Run the API tests and verify failure**

Run: `cd backend && npm test -- tests/ledger-api.test.ts tests/finance-center-api.test.ts tests/openapi.test.ts`

Expected: FAIL because the summary endpoints and paired payload do not exist.

- [ ] **Step 3: Add the fixed wallet summary object**

The service returns:

```ts
export interface WalletSummaryPayload {
  activeCurrency: LedgerCurrency;
  ndp: { available: number; frozen: number };
  testNdp: { available: number; frozen: number };
}
```

The route uses existing `wallet:read` permission. Repository lookup is one query constrained to the authenticated owner and the two known currencies.

- [ ] **Step 4: Add paired finance aggregate types and exact formulas**

```ts
export interface NdpAmountPair {
  ndp: number;
  testNdp: number;
}

export interface BackofficeNdpSummaryPayload {
  period: { date: string; timeZone: "Asia/Tokyo" };
  todayNdpConsumption: NdpAmountPair;
  platformNetRevenue: NdpAmountPair;
  requestFeeRevenue: NdpAmountPair;
  userRewardCost: NdpAmountPair;
  pendingHold: NdpAmountPair;
  campaignDiscount: NdpAmountPair;
  settleableNdp: number;
}
```

Validate `date` as `YYYY-MM-DD`, default it to the current Asia/Tokyo calendar date on the server, and convert that date to UTC query boundaries in the service. For each currency group in that Asia/Tokyo day:

```ts
const consumption =
  sums.bPlatformFeeActualNdp + sums.cRequestFeeActualNdp + sums.penaltyNdp;
const platformNetRevenue =
  sums.bPlatformFeeActualNdp + sums.cRequestFeeActualNdp + sums.penaltyNdp -
  sums.userRewardNdp - sums.compensationToUserNdp;
const pendingHold = Math.max(
  0,
  sums.bPlatformFeeHoldNdp + sums.cRequestFeeHoldNdp -
    sums.bPlatformFeeActualNdp - sums.cRequestFeeActualNdp - sums.releasedNdp
);
```

`settleableNdp` equals the formal `platformNetRevenue.ndp`; Test NDP is displayed but never subtracted from a wallet again.

- [ ] **Step 5: Enforce formal-only exports in repository queries**

Both finance settlement CSV and ledger reconciliation CSV queries include a non-optional server predicate:

```ts
where: {
  ndpCurrency: "NDP",
  deletedAt: null
}
```

and:

```ts
where: {
  currency: "NDP",
  status: input.status,
  deletedAt: null
}
```

Do not accept `TEST_NDP` as an export query value. Test rows remain visible through the paired summary and protected ledger list.

- [ ] **Step 6: Add validators, routes, audit, and OpenAPI**

Use a strict `YYYY-MM-DD` Zod query and `backoffice:finance:list` permission for the summary route. Record `backoffice.finance.ndp_summary.read` with `{ date, timeZone: "Asia/Tokyo" }`. Add the wallet summary and finance summary paths/schemas to OpenAPI.

- [ ] **Step 7: Run finance and export-isolation tests**

Run:

```bash
cd backend
npm test -- tests/ledger-api.test.ts tests/finance-center-api.test.ts tests/openapi.test.ts tests/check-finance-request-flow.test.ts
```

Expected: all selected suites PASS and Test NDP never appears in formal CSV payloads.

- [ ] **Step 8: Commit reporting**

```bash
git add backend/src/services/ledger.service.ts backend/src/controllers/ledger.controller.ts backend/src/routes/ledger.routes.ts backend/src/api/openapi.ts backend/src/repositories/backoffice.repository.ts backend/src/services/backoffice.service.ts backend/src/controllers/backoffice.controller.ts backend/src/routes/backoffice.routes.ts backend/src/validators/backoffice.validator.ts backend/tests/ledger-api.test.ts backend/tests/finance-center-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat(finance): separate Test NDP from settlement"
```

---

### Task 7: Show test classification and balances in account and user wallet UI

**Files:**
- Modify: `src/api/userManagement.ts`
- Modify: `src/features/wallet/api.ts`
- Modify: `src/features/wallet/api.test.ts`
- Modify: `src/pages/admin/UserManagementWorkspace.tsx`
- Create: `src/pages/admin/UserManagementWorkspace.test.tsx`
- Modify: `src/pages/user/UserCenterPage.tsx`
- Modify: `src/pages/user/UserCenterFormalIntegration.test.ts`

**Interfaces:**
- Consumes: User dual-balance payload, test-account mutation, `/wallets/me`, and `/wallets/me/summary`.
- Produces: operations account cards/filter/action and a Test NDP-labelled active user wallet.

- [ ] **Step 1: Write failing typed-client and UI tests**

```ts
it("calls the protected test-account mutation with optimistic concurrency", async () => {
  vi.mocked(httpClient.request).mockResolvedValue({});
  await userManagementApi.updateTestAccount(41, {
    isTestAccount: false,
    expectedUpdatedAt: "2026-08-30T00:00:00.000Z"
  });
  expect(httpClient.request).toHaveBeenCalledWith("/users/41/test-account", {
    body: {
      isTestAccount: false,
      expectedUpdatedAt: "2026-08-30T00:00:00.000Z"
    },
    method: "PATCH"
  });
});

it("reads both current-user balances from the fixed summary endpoint", async () => {
  vi.mocked(httpClient.request).mockResolvedValue({});
  await walletApi.getMyWalletSummary();
  expect(httpClient.request).toHaveBeenCalledWith("/wallets/me/summary");
});
```

The workspace test renders one test user and asserts `测试账号`, `100,000 Test NDP`, `0 NDP`, the test-account filter, and a permission-gated classification action.

- [ ] **Step 2: Run frontend tests and verify failure**

Run:

```bash
npm test -- src/features/wallet/api.test.ts src/pages/admin/UserManagementWorkspace.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts
```

Expected: FAIL because the types, methods, labels, and controls do not exist.

- [ ] **Step 3: Extend formal API types and methods**

```ts
export type NdpBalance = { available: number; frozen: number };

export type UserPayload = {
  id: number;
  email: string;
  phone: string | null;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  isTestAccount: boolean;
  balances: { ndp: NdpBalance; testNdp: NdpBalance };
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  roleAssignments: UserRolePayload[];
  roles: string[];
};
```

Add `isTestAccount?: boolean` to the paginated list query and `updateTestAccount` with the exact body tested above. Extend `Wallet.currency` to `"NDP" | "TEST_NDP"` and add the fixed summary type/method.

- [ ] **Step 4: Extend the account workspace without simplifying its UI**

Add five-language local copy keys for formal account, test account, formal NDP, Test NDP, filter, mark as test, and mark as formal. Each account card shows:

```tsx
<Badge tone={user.isTestAccount ? "yellow" : "green"}>
  {user.isTestAccount ? copy.testAccount : copy.formalAccount}
</Badge>
<p>{user.balances.ndp.available.toLocaleString("ja-JP")} NDP</p>
<p className="text-xs font-bold text-ink/45">
  {user.balances.testNdp.available.toLocaleString("ja-JP")} Test NDP
</p>
```

Wrap the mutation button in `PermissionGate permission="button:user:test-account:update"` and send the row's `updatedAt`. Keep the existing role, enable/disable, delete, pagination, error, and refresh interactions.

- [ ] **Step 5: Label the active user wallet from server currency**

Replace the hard-coded metric label with:

```ts
const pointsLabel = formalData.wallet.currency === "TEST_NDP" ? "Test NDP" : "NDP";
```

and render `{ label: pointsLabel, value: points.toLocaleString("en-US") }`. Do not let the client switch currency.

- [ ] **Step 6: Run frontend account and wallet tests**

Run:

```bash
npm test -- src/features/wallet/api.test.ts src/pages/admin/UserManagementWorkspace.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts
npm run lint
```

Expected: selected tests PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit account and wallet UI**

```bash
git add src/api/userManagement.ts src/features/wallet/api.ts src/features/wallet/api.test.ts src/pages/admin/UserManagementWorkspace.tsx src/pages/admin/UserManagementWorkspace.test.tsx src/pages/user/UserCenterPage.tsx src/pages/user/UserCenterFormalIntegration.test.ts
git commit -m "feat(backoffice): show test accounts and balances"
```

---

### Task 8: Render paired NDP/Test NDP finance metrics and final exclusion

**Files:**
- Create: `src/components/admin/NdpMetricValue.tsx`
- Create: `src/components/admin/NdpMetricValue.test.tsx`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeRealData.test.ts`
- Modify: `src/pages/admin/FinancePage.tsx`
- Modify: `src/pages/admin/FinancePage.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `BackofficeNdpSummaryPayload` from Task 6.
- Produces: reusable primary formal value plus small Test NDP text and explicit final settleable value.

- [ ] **Step 1: Write failing component and page tests**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { NdpMetricValue } from "./NdpMetricValue";

it("renders formal NDP as primary and Test NDP as secondary", () => {
  const markup = renderToStaticMarkup(<NdpMetricValue ndp={999} testNdp={999} />);
  expect(markup).toContain("999 NDP");
  expect(markup).toContain("+ 999 Test NDP");
  expect(markup).not.toContain("1,998 NDP");
});
```

Extend `FinancePage.test.ts` to require `backofficeRealDataApi.ndpSummary`, `NdpMetricValue`, `正式可结算`, and `Test NDP 不参与结算`.

- [ ] **Step 2: Run finance frontend tests and verify failure**

Run:

```bash
npm test -- src/components/admin/NdpMetricValue.test.tsx src/api/backofficeRealData.test.ts src/pages/admin/FinancePage.test.ts
```

Expected: FAIL because the paired summary client/component/rendering is absent.

- [ ] **Step 3: Implement the focused metric component**

```tsx
export function NdpMetricValue({ ndp, testNdp }: { ndp: number; testNdp: number }) {
  return (
    <div>
      <strong className="mt-2 block text-xl">{ndp.toLocaleString("ja-JP")} NDP</strong>
      <span className="mt-1 block text-xs font-bold text-ink/45">
        + {testNdp.toLocaleString("ja-JP")} Test NDP
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Add the paired client payload and load it independently of paginated rows**

Add `backofficeRealDataApi.ndpSummary({ date })` targeting `/backoffice/finance/ndp-summary`. `FinancePage` loads the current Asia/Tokyo date summary and the paginated settlement list separately; it does not sum the current page to compute platform totals.

Render paired values for today's consumption, platform net revenue, Request fees, reward cost, pending holds, and campaign discount. Preserve JPY cards and existing drawers/payroll functionality.

- [ ] **Step 5: Render the final settlement exclusion**

```tsx
<section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-panel">
  <p className="text-sm font-bold text-ink/55">正式可结算</p>
  <strong className="mt-2 block text-2xl">
    {ndpSummary.settleableNdp.toLocaleString("ja-JP")} NDP
  </strong>
  <p className="mt-1 text-xs font-bold text-ink/45">Test NDP 不参与结算</p>
</section>
```

Use the existing i18n mechanism for all newly visible labels in Chinese Simplified, Chinese Traditional, Japanese, English, and Korean.

- [ ] **Step 6: Run paired-display and production type checks**

Run:

```bash
npm test -- src/components/admin/NdpMetricValue.test.tsx src/api/backofficeRealData.test.ts src/pages/admin/FinancePage.test.ts
npm run lint
```

Expected: selected tests PASS; the primary value is never a sum relabelled as formal NDP.

- [ ] **Step 7: Commit finance UI**

```bash
git add src/components/admin/NdpMetricValue.tsx src/components/admin/NdpMetricValue.test.tsx src/api/backofficeRealData.ts src/api/backofficeRealData.test.ts src/pages/admin/FinancePage.tsx src/pages/admin/FinancePage.test.ts src/i18n/translations.ts
git commit -m "feat(finance): display formal and Test NDP separately"
```

---

### Task 9: Apply locally, verify the whole microstep, perform browser acceptance, and stop

**Files:**
- Modify: `README.md`
- Modify: `docs/ledger.md`
- Modify: `docs/superpowers/specs/2026-08-30-exchange-test-ndp-foundation-design.md` only if implementation evidence requires a factual clarification.
- Create: `docs/verification/2026-08-30-exchange-test-ndp-foundation.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: real local migration/backfill evidence, automated regression evidence, browser acceptance evidence, and a clean stop gate before Request/claim work.

- [ ] **Step 1: Confirm worktree ownership and pre-migration service health**

Run:

```bash
git status --short --branch
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5180 -sTCP:LISTEN
lsof -nP -iTCP:3307 -sTCP:LISTEN
lsof -nP -iTCP:6379 -sTCP:LISTEN
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
```

Expected: the isolated branch is named correctly, MySQL/Redis are listening, and backend health/ready return success. If port 5180 belongs to another worktree, stop that frontend safely and start this worktree's formal frontend before acceptance.

- [ ] **Step 2: Run preflight, migration status, and non-mutating backfill preview**

Run:

```bash
cd backend
npm run prisma:status
npm run check:test-ndp-foundation -- --phase=preflight
npm run backfill:test-ndp
```

Expected: preflight reports no wallet collisions or relationship inconsistencies; the backfill prints proposed per-user deltas and refuses to apply without `--apply`.

- [ ] **Step 3: Apply the local migration and audited backfill**

Run only against the verified local development database:

```bash
cd backend
npm run prisma:migrate:deploy
npm run backfill:test-ndp -- --apply
npm run check:test-ndp-foundation -- --phase=postflight
```

Expected: migration applies once; backfill reports every current user processed once; postflight proves every current account is test-classified, every current user has 100,000 available Test NDP, frozen balances are preserved, currencies agree, and Test NDP is not formally exportable.

- [ ] **Step 4: Run targeted backend tests**

Run:

```bash
cd backend
npm test -- tests/exchange-test-ndp-schema.test.ts tests/ledger-currency.service.test.ts tests/test-ndp-provisioning.service.test.ts tests/ledger.repository.test.ts tests/ledger-service.test.ts tests/affiliate-budget-ledger.service.test.ts tests/wallet-adjustment-service.test.ts tests/ledger-api.test.ts tests/user-api.test.ts tests/auth.test.ts tests/auth-permissions.test.ts tests/finance-center-api.test.ts tests/openapi.test.ts
```

Expected: all selected suites PASS with no skipped Test NDP contract test.

- [ ] **Step 5: Run frontend tests and formal build**

Run:

```bash
npm test -- src/features/wallet/api.test.ts src/pages/admin/UserManagementWorkspace.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts src/components/admin/NdpMetricValue.test.tsx src/api/backofficeRealData.test.ts src/pages/admin/FinancePage.test.ts
npm run lint
npm run verify:production-build
```

Expected: all selected tests PASS, TypeScript passes, and the formal production-build safety audit passes.

- [ ] **Step 6: Run relevant full regressions**

Run:

```bash
cd backend
npm test
npm run lint
npm run build
cd ..
npm test
```

Expected: backend Jest, backend lint/build, and full frontend Vitest all pass. Record any pre-existing skipped suites separately; do not hide new skips.

- [ ] **Step 7: Start the formal local runtime from this worktree**

Run in persistent terminals:

```bash
cd backend && npm run dev
npm run dev:frontend -- --port 5180
```

Expected: backend serves port 3000, frontend serves port 5180, `/api/v1/ready` remains ready, and the frontend proxy reaches the formal API.

- [ ] **Step 8: Perform real browser acceptance**

Use the browser-control skill and real test credentials. Exercise, do not merely inspect, these flows:

1. Operations account management loads through `/api/v1/users?page=1&pageSize=20`.
2. Existing accounts show a Test Account badge, `100,000 Test NDP`, and a separate formal NDP balance.
3. The test-account filter changes the server request and preserves pagination.
4. The classification action is visible only with the button permission; do not switch an account that has active holds merely to prove the control.
5. A test user's personal center shows `100,000 Test NDP` from `/api/v1/wallets/me`.
6. Finance shows formal NDP as the primary number and `+ n Test NDP` as smaller text for every paired metric.
7. The final settlement area shows only formal settleable NDP and states that Test NDP is excluded.
8. Download the formal settlement CSV and inspect that no `TEST_NDP` row is present.
9. Refresh and log out/in; the same server-authoritative values remain.
10. Check desktop and mobile widths, overflow, console errors, failed network requests, and response payload currency.

- [ ] **Step 9: Record evidence and update durable documentation**

Create `docs/verification/2026-08-30-exchange-test-ndp-foundation.md` only after evidence exists. Record the exact tested branch/commit; applied migration name; current-account count; number of Test NDP wallets at 100,000; frozen-balance before/after totals; targeted and full test counts; production-build result; browser routes and identities; CSV exclusion result; console/network/mobile findings; and the statement `Push/deployment/payment status: not performed`. Update `README.md` and `docs/ledger.md` to document NDP versus Test NDP, account classification, API behavior, settlement exclusion, and the local backfill/check commands.

- [ ] **Step 10: Run the final safety scan and commit evidence**

Run:

```bash
rg -n "TODO|FIXME|not implemented|fake API|localStorage" backend/src backend/scripts src README.md docs/ledger.md
git diff --check
git status --short
```

Expected: no new prohibited implementation markers, no whitespace errors, and only intended verification/doc files remain uncommitted.

Commit:

```bash
git add README.md docs/ledger.md docs/verification/2026-08-30-exchange-test-ndp-foundation.md
git commit -m "docs: verify Exchange Test NDP foundation"
```

- [ ] **Step 11: Stop and report this microstep**

Report migration/backfill counts, test/build results, browser acceptance, commits, and any residual risk. Do not start Request publication, claim, matching, booking, payment, push, or deployment.
