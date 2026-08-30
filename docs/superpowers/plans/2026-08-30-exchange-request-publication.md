# Exchange Request Formal Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an upgraded NeeDo Exchange Request through the existing formal Exchange stack while atomically freezing the active globally configured Request fee in the existing Wallet/Ledger system, then capture that hold on publisher withdrawal or release it on natural unmatched expiry.

**Architecture:** Extend `ExchangePost`/`ExchangeDemand` as the Request aggregate, keep `ExchangeService` as the orchestration boundary, and add one Request-specific immutable financial snapshot backed by the existing versioned fee rules, wallet holds, ledger entries, reconciliations, RBAC, and audit logs. The same database transaction owns Request creation and fee freeze; terminal transitions use guarded state changes and the same ledger authority. The current high-fidelity React composer, operations demand page, finance metrics, and authenticated simulation tools are extended in place.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma 7, MySQL 8, Redis, Zod, JWT/RBAC, OpenAPI, Jest/Supertest, React 19, Vite, Vitest, existing five-language Exchange i18n.

## Global Constraints

- Work only in `/Users/eason/Documents/New project/.worktrees/exchange-request-publication` on branch `codex/exchange-request-publication`.
- The approved design is `docs/superpowers/specs/2026-08-30-exchange-request-publication-design.md` at commit `d2478fbe`.
- This is one microstep. Stop after formal Request publication, its pre-match terminal finance paths, data rebuild, and browser acceptance.
- Do not implement provider claims, matching, availability reservation, booking/order creation, IM, or payment in this plan.
- Do not add mock data, demo state, fake APIs, fake payment outcomes, localStorage business state, or a second wallet/ledger implementation.
- Preserve the current high-fidelity Exchange list, detail, Intelligence composer, navigation, responsive layout, and five-language behavior.
- Preserve Booking's `c_request_dispatch_fee`; the new Request publication fee has its own family and ledger vocabulary.
- Every protected mutation uses Zod, OpenAPI, RBAC, idempotency/concurrency protection, audit records, and database persistence.
- Customer Request isolation remains server-authoritative; provider views must never expose non-public address lines, hidden publisher identity, phone, or email.
- Every list endpoint remains paginated and every repository query filters `deletedAt`.
- All current accounts remain test accounts. Test actors spend `TEST_NDP`; captured Test NDP never enters settleable totals.
- No push, deployment, external payment call, real charge, or production/remote data mutation is authorized.
- Use `apply_patch` for hand edits, do not edit an applied migration, and preserve unrelated worktree changes.

---

## File and Responsibility Map

### Persistence and migration

- `backend/prisma/schema.prisma`: Request contract fields, financial snapshot, Exchange references on fee logs/holds, and Request ledger enums.
- `backend/prisma/migrations/20260830300000_exchange_request_publication/migration.sql`: additive DDL, conservative legacy-demand backfill, initial 1,000 NDP rule version, merchant-owner grant, and operations fee permissions.
- `backend/tests/exchange-request-publication-schema.test.ts`: static schema/migration contract and Booking compatibility guard.
- `backend/tests/exchange-request-publication-migration.test.ts`: local MySQL table/index/check/seed verification.

### Fee policy and administration

- `backend/src/services/exchange-request-fee.service.ts`: current fee resolution, immutable publication calculation, paginated history, and optimistic version creation.
- `backend/src/repositories/exchange-request-fee.repository.ts`: transaction-aware access to `PlatformFeeRuleSet`, `PlatformFeeRule`, and `FeeCalculationLog`.
- `backend/src/validators/exchange-request-fee.validator.ts`: history query and version-creation Zod contracts.
- `backend/src/controllers/exchange-request-fee.controller.ts`: request/response boundary.
- `backend/src/routes/exchange-request-fee.routes.ts`: authenticated read/write routes and permission declarations.
- `backend/tests/exchange-request-fee.service.test.ts`, `backend/tests/exchange-request-fee-api.test.ts`: version selection, history, conflict, RBAC, audit, and OpenAPI coverage.

### Request domain and privacy

- `backend/src/types/exchange.types.ts`: upgraded Request input/output vocabulary, financial summary, context, and disclosure projection.
- `backend/src/validators/exchange.validators.ts`: strict demand branch with target, mode, budget, address, and visibility validation.
- `backend/src/services/exchange.service.ts`: capacity authority, publication context, atomic publication, privacy checks, and terminal orchestration.
- `backend/src/repositories/exchange.repository.ts`: transaction-aware aggregate persistence, actor authority lookup, DTO projection, guarded status mutation, and due-post selection.
- `backend/src/controllers/exchange.controller.ts`, `backend/src/routes/exchange.routes.ts`: publication-context route and existing endpoint integration.
- `backend/src/workers/exchange-post-expiry.worker.ts`: batched service-owned terminal transition.
- `backend/src/utils/stable-json.ts`: deterministic Request payload fingerprint for idempotency conflict detection.
- `backend/tests/exchange.validators.test.ts`, `backend/tests/exchange.service.test.ts`, `backend/tests/exchange.repository.test.ts`, `backend/tests/exchange-post-expiry.worker.test.ts`: domain and transaction behavior.

### Wallet/Ledger and Test NDP

- `backend/src/services/ledger.service.ts`: Request fee freeze, capture, and release methods.
- `backend/src/repositories/ledger.repository.ts`: Request financial/hold persistence and locked wallet mutation.
- `backend/src/services/test-ndp-provisioning.service.ts`, `backend/src/repositories/test-ndp-provisioning.repository.ts`: audited idempotent 100,000 TEST_NDP shop-wallet calibration for local acceptance.
- `backend/tests/exchange-request-ledger.service.test.ts`, `backend/tests/ledger.repository.test.ts`, `backend/tests/test-ndp-provisioning.service.test.ts`: exact NDP/TEST_NDP deltas and provisioning safety.

### RBAC, app wiring, and OpenAPI

- `backend/src/constants/permissions.constants.ts`: merchant-owner publication grant plus Request fee read/write permissions.
- `backend/src/constants/error-codes.ts`: stable business errors for limit, fee availability, idempotency conflict, and financial state conflict.
- `backend/src/app.ts`, `backend/src/server.ts`: one shared Exchange service with fee and ledger dependencies.
- `backend/src/api/openapi.ts`: Request schemas, context path, fee administration paths, errors, and permission metadata.
- `backend/tests/exchange.routes.test.ts`, `backend/tests/exchange.openapi.test.ts`, `backend/tests/exchange-permissions.test.ts`: route, documentation, and role boundaries.

### Frontend and operations

- `src/features/exchange/types.ts`, `src/features/exchange/api.ts`: formal Request DTOs and publication-context client.
- `src/features/exchange/ExchangeComposer.tsx`: existing fullscreen composer with target, modes, addresses, visibility, and fee disclosure.
- `src/features/exchange/ExchangePostDetailPage.tsx`: server-projected address and publisher rendering.
- `src/features/exchange/i18n.ts`: Simplified Chinese, Traditional Chinese, Japanese, English, and Korean labels/errors.
- `src/features/exchange/ExchangeComposer.test.tsx`, `src/features/exchange/api.test.ts`, `src/features/exchange/ExchangePostDetailPage.test.tsx`: client behavior and disclosure tests.
- `src/api/exchangeRequestFee.ts`, `src/components/admin/ExchangeRequestFeePanel.tsx`, `src/pages/admin/NeedoExchangeAdminPage.tsx`: versioned 1,000 NDP fee administration inside the existing demand page.
- `backend/src/repositories/backoffice.repository.ts`, `backend/src/services/backoffice.service.ts`, `src/api/backofficeRealData.ts`, `src/pages/admin/FinancePage.tsx`: paired formal/Test Request consumption and formal-only settlement totals.
- `backend/tests/backoffice-ndp-reporting.repository.test.ts`, `backend/tests/backoffice-ndp-summary.service.test.ts`, `src/pages/admin/FinancePage.test.ts`: finance aggregation coverage.

### Controlled formal data and acceptance

- `backend/src/simulation/exchange-simulation-plan.ts`, `backend/src/simulation/exchange-simulation-seed.ts`, `backend/src/simulation/exchange-simulation-checker.ts`: upgraded Request plan, authenticated HTTP rebuild, soft-delete manifest, and independent verification.
- `backend/scripts/seed-formal-exchange-test.ts`, `backend/scripts/check-formal-exchange-test.ts`: local-only entry points.
- `backend/scripts/restore-formal-exchange-requests.ts`: recover the recorded old-demand cohort if acceptance is rolled back.
- `backend/tests/exchange-simulation-safety.test.ts`, `backend/tests/exchange-simulation-plan.test.ts`, `backend/tests/exchange-simulation-seed.integration.test.ts`: environment refusal and persisted-count contracts.
- `docs/verification/2026-08-30-exchange-request-publication.md`: automated, real-MySQL, and desktop/mobile browser evidence.

---

### Task 1: Add the additive Request and financial schema boundary

**Files:**
- Create: `backend/tests/exchange-request-publication-schema.test.ts`
- Create: `backend/prisma/migrations/20260830300000_exchange_request_publication/migration.sql`
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: existing `ExchangePost`, `ExchangeDemand`, `WalletHold`, `FeeCalculationLog`, `PlatformFeeRuleSet`, `PlatformFeeRule`, and `LedgerTransactionType`.
- Produces: Request capacity/mode/budget/disclosure snapshots and one nullable-on-legacy, mandatory-on-new `ExchangeRequestFinancial` relation.

- [ ] **Step 1: Add the failing static contract**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Exchange Request publication schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260830300000_exchange_request_publication/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("adds the publication contract without changing the Booking compatibility fee", () => {
    expect(schema).toContain("enum ExchangeMatchMode");
    expect(schema).toContain("enum ExchangeBudgetMode");
    expect(schema).toContain("enum ExchangePublisherCapacitySource");
    expect(schema).toContain("model ExchangeRequestFinancial");
    expect(schema).toMatch(/bookingOrderId\s+Int\?/);
    expect(schema).toMatch(/exchangePostId\s+Int\?\s+@unique/);
    expect(migration).toContain("wallet_holds_exactly_one_business_ref");
    expect(migration).toContain("exchange_request_publication");
    expect(migration).toContain("exchange_request_publication_fee");
    expect(migration).not.toMatch(/UPDATE `platform_fee_rules`[\s\S]*c_request_dispatch_fee/i);
  });
});
```

- [ ] **Step 2: Run the contract and confirm the red state**

Run: `cd backend && npm test -- tests/exchange-request-publication-schema.test.ts`

Expected: FAIL because the enums, fields, model, and migration do not exist.

- [ ] **Step 3: Add the exact Prisma vocabulary and relations**

Insert these enum values and fields into the existing declarations; do not duplicate models:

```prisma
enum ExchangeMatchMode {
  QUICK     @map("quick")
  SELECTIVE @map("selective")
}

enum ExchangeBudgetMode {
  TOTAL        @map("total")
  PER_PROVIDER @map("per_provider")
}

enum ExchangePublisherCapacitySource {
  CUSTOMER_MEMBERSHIP @map("customer_membership")
  SHOP_MERCHANT       @map("shop_merchant")
}

enum ExchangeRequestFinancialState {
  HELD     @map("held")
  CAPTURED @map("captured")
  RELEASED @map("released")
}

model ExchangeDemand {
  targetProviderCount         Int                             @default(1) @map("target_provider_count")
  targetProviderLimitSnapshot Int                             @default(1) @map("target_provider_limit_snapshot")
  publisherCapacitySource     ExchangePublisherCapacitySource @default(CUSTOMER_MEMBERSHIP) @map("publisher_capacity_source")
  membershipLevelSnapshot     String?                         @map("membership_level_snapshot") @db.VarChar(50)
  matchMode                   ExchangeMatchMode               @default(QUICK) @map("match_mode")
  budgetMode                  ExchangeBudgetMode              @default(TOTAL) @map("budget_mode")
  budgetMinJpy                Int?                            @map("budget_min_jpy")
  addressLine1                String                          @map("address_line_1") @db.VarChar(255)
  addressLine2                String?                         @map("address_line_2") @db.VarChar(255)
  addressLine3                String?                         @map("address_line_3") @db.VarChar(255)
  addressLine2Public          Boolean                         @default(false) @map("address_line_2_public")
  addressLine3Public          Boolean                         @default(false) @map("address_line_3_public")
  publisherIdentityPublic     Boolean                         @default(false) @map("publisher_identity_public")
}

model ExchangeRequestFinancial {
  id                   Int                           @id @default(autoincrement())
  exchangePostId       Int                           @unique @map("exchange_post_id")
  payerType            String                        @map("payer_type") @db.VarChar(20)
  payerId              Int                           @map("payer_id")
  walletOwnerType      WalletOwnerType               @map("wallet_owner_type")
  walletOwnerId        Int                           @map("wallet_owner_id")
  currency             String                        @db.VarChar(10)
  feeRuleSetId         Int                           @map("fee_rule_set_id")
  feeRuleSetVersion    Int                           @map("fee_rule_set_version")
  feeRuleId            Int                           @map("fee_rule_id")
  feeCalculationLogId  Int                           @unique @map("fee_calculation_log_id")
  walletHoldId         Int                           @unique @map("wallet_hold_id")
  amountNdp            Int                           @map("amount_ndp")
  state                ExchangeRequestFinancialState @default(HELD)
  capturedAt           DateTime?                     @map("captured_at")
  releasedAt           DateTime?                     @map("released_at")
  createdAt            DateTime                      @default(now()) @map("created_at")
  updatedAt            DateTime                      @updatedAt @map("updated_at")
  deletedAt            DateTime?                     @map("deleted_at")

  exchangePost      ExchangePost       @relation(fields: [exchangePostId], references: [id], onDelete: Restrict)
  feeRuleSet       PlatformFeeRuleSet  @relation(fields: [feeRuleSetId], references: [id], onDelete: Restrict)
  feeRule          PlatformFeeRule     @relation(fields: [feeRuleId], references: [id], onDelete: Restrict)
  feeCalculationLog FeeCalculationLog  @relation(fields: [feeCalculationLogId], references: [id], onDelete: Restrict)
  walletHold        WalletHold         @relation(fields: [walletHoldId], references: [id], onDelete: Restrict)

  @@index([payerType, payerId, createdAt])
  @@index([walletOwnerType, walletOwnerId, currency])
  @@index([state, createdAt])
  @@index([deletedAt])
  @@map("exchange_request_financials")
}
```

Also add `payloadFingerprint String? @map("payload_fingerprint") @db.Char(64)` and `requestFinancial ExchangeRequestFinancial?` to `ExchangePost`; nullable `exchangePostId` relations to `WalletHold` and `FeeCalculationLog`; inverse relation arrays to both fee-rule models; and these ledger enum values:

```prisma
model FeeCalculationLog {
  exchangePostId Int?          @map("exchange_post_id")
  exchangePost   ExchangePost? @relation(fields: [exchangePostId], references: [id], onDelete: SetNull)

  @@index([exchangePostId])
}

model WalletHold {
  bookingOrderId Int?
  exchangePostId Int?          @unique @map("exchange_post_id")
  bookingOrder   BookingOrder? @relation(fields: [bookingOrderId], references: [id], onDelete: Restrict)
  exchangePost   ExchangePost? @relation(fields: [exchangePostId], references: [id], onDelete: Restrict)
}

EXCHANGE_REQUEST_PUBLICATION_FREEZE  @map("exchange_request_publication_freeze")
EXCHANGE_REQUEST_PUBLICATION_CAPTURE @map("exchange_request_publication_capture")
EXCHANGE_REQUEST_PUBLICATION_RELEASE @map("exchange_request_publication_release")
```

- [ ] **Step 4: Create the additive SQL with conservative legacy backfill and stable seeds**

The migration must:

```sql
ALTER TABLE `exchange_demands`
  MODIFY `budget_min_jpy` INTEGER NULL,
  ADD COLUMN `target_provider_count` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `target_provider_limit_snapshot` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `publisher_capacity_source` ENUM('customer_membership','shop_merchant') NOT NULL DEFAULT 'customer_membership',
  ADD COLUMN `membership_level_snapshot` VARCHAR(50) NULL,
  ADD COLUMN `match_mode` ENUM('quick','selective') NOT NULL DEFAULT 'quick',
  ADD COLUMN `budget_mode` ENUM('total','per_provider') NOT NULL DEFAULT 'total',
  ADD COLUMN `address_line_1` VARCHAR(255) NULL,
  ADD COLUMN `address_line_2` VARCHAR(255) NULL,
  ADD COLUMN `address_line_3` VARCHAR(255) NULL,
  ADD COLUMN `address_line_2_public` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `address_line_3_public` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `publisher_identity_public` BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE `exchange_demands` AS d
JOIN `exchange_posts` AS p ON p.`id` = d.`post_id`
SET d.`address_line_1` = p.`area_label`,
    d.`membership_level_snapshot` = 'standard'
WHERE d.`address_line_1` IS NULL;

ALTER TABLE `exchange_demands`
  MODIFY `address_line_1` VARCHAR(255) NOT NULL;

ALTER TABLE `wallet_holds`
  MODIFY `booking_order_id` INTEGER NULL,
  ADD COLUMN `exchange_post_id` INTEGER NULL,
  ADD UNIQUE INDEX `wallet_holds_exchange_post_id_key` (`exchange_post_id`),
  ADD CONSTRAINT `wallet_holds_exactly_one_business_ref`
    CHECK ((`booking_order_id` IS NOT NULL) <> (`exchange_post_id` IS NOT NULL));
```

Create `exchange_request_financials`, add the two Exchange foreign keys, extend the full existing `ledger_transaction_type` enum without removing any value, seed active rule-set version 1 with amount `1000`, and use `ON DUPLICATE KEY UPDATE` to:

```sql
INSERT INTO `platform_fee_rule_sets`
  (`name`,`description`,`scope_type`,`family_code`,`priority`,`status`,`version`,`effective_from`,`created_at`,`updated_at`,`deleted_at`)
VALUES
  ('Exchange Request publication fee v1','Fixed fee locked when a Request is published','platform','exchange_request_publication',100,'active',1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL)
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

INSERT INTO `platform_fee_rules`
  (`rule_set_id`,`fee_type`,`order_type`,`payer_type`,`base_amount_ndp`,`calculation_mode`,`hold_strategy`,`pricing_lock_mode`,`stacking_mode`,`priority`,`status`,`created_at`,`updated_at`,`deleted_at`)
SELECT
  rs.`id`,'exchange_request_publication_fee','exchange_request','publisher',1000,'fixed','exact_estimate','lock_at_publish','sum',100,'active',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL
FROM `platform_fee_rule_sets` AS rs
WHERE rs.`family_code` = 'exchange_request_publication'
  AND rs.`version` = 1
  AND rs.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `platform_fee_rules` AS r
    WHERE r.`rule_set_id` = rs.`id`
      AND r.`fee_type` = 'exchange_request_publication_fee'
      AND r.`deleted_at` IS NULL
  );
```

Seed the permissions with:

```sql
INSERT INTO `permissions` (`name`,`code`,`type`,`module`,`description`,`is_system`,`created_at`,`updated_at`,`deleted_at`)
VALUES
  ('查看Request发布费','backoffice:exchange-request-fee:read','api','exchange','查看当前Request发布费和分页版本历史',TRUE,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL),
  ('设置Request发布费','backoffice:exchange-request-fee:write','api','exchange','创建新的Request发布费生效版本',TRUE,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL)
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;
```

Grant `exchange:posts:create-demand` to `merchant_owner`; grant fee read to `admin`, `operator`, `finance`, `viewer`; grant fee write only to `admin`, `finance`. Do not grant demand publication to `merchant_staff` or `technician`.

- [ ] **Step 5: Validate the schema and contract**

Run:

```bash
cd backend
npm run prisma:generate
npx prisma validate
npm test -- tests/exchange-request-publication-schema.test.ts tests/exchange-schema.test.ts tests/exchange-test-ndp-schema.test.ts tests/booking-platform-fee-debt-schema.test.ts
```

Expected: all commands pass and existing Booking/Test NDP contracts remain green.

- [ ] **Step 6: Commit the schema boundary**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260830300000_exchange_request_publication/migration.sql backend/tests/exchange-request-publication-schema.test.ts
git commit -m "feat(exchange): add Request publication schema"
```

---

### Task 2: Add the versioned Request publication-fee authority

**Files:**
- Create: `backend/src/services/exchange-request-fee.service.ts`
- Create: `backend/src/repositories/exchange-request-fee.repository.ts`
- Create: `backend/src/validators/exchange-request-fee.validator.ts`
- Create: `backend/tests/exchange-request-fee.service.test.ts`
- Modify: `backend/src/constants/error-codes.ts`

**Interfaces:**
- `ExchangeRequestFeeRepositoryPort.withTransactionClient(transactionClient)` preserves the caller's transaction.
- `resolveCurrent(at)` returns exact rule-set/rule/version/amount identifiers.
- `recordPublicationCalculation(input)` persists a `FeeCalculationLog` linked to one Exchange post.
- `createVersion(input)` closes the current effective version and creates a new one using optimistic version checking.

- [ ] **Step 1: Add failing service tests for current selection and version conflicts**

```ts
const initial = {
  ruleSetId: 41,
  ruleSetVersion: 1,
  ruleId: 73,
  amountNdp: 1000,
  effectiveFrom: new Date("2026-08-30T00:00:00.000Z"),
  effectiveTo: null
};

it("returns the one effective fixed Request fee", async () => {
  repository.findCurrent.mockResolvedValue(initial);
  await expect(service.resolveCurrent(new Date("2026-08-30T01:00:00.000Z"))).resolves.toEqual(initial);
});

it("rejects a version write when the expected version is stale", async () => {
  repository.createVersion.mockResolvedValue({ kind: "conflict" });
  await expect(service.createVersion({
    actorUserId: 9,
    amountNdp: 1200,
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    expectedCurrentVersion: 1,
    audit: auditInput
  })).rejects.toMatchObject({ statusCode: 409, message: "error.exchange.request_fee_version_conflict" });
});
```

- [ ] **Step 2: Run the service test and confirm the red state**

Run: `cd backend && npm test -- tests/exchange-request-fee.service.test.ts`

Expected: FAIL because the fee service and repository port do not exist.

- [ ] **Step 3: Implement the strict fee service contract**

```ts
export const EXCHANGE_REQUEST_FEE_FAMILY = "exchange_request_publication";
export const EXCHANGE_REQUEST_FEE_TYPE = "exchange_request_publication_fee";
export const EXCHANGE_REQUEST_ORDER_TYPE = "exchange_request";

export interface ExchangeRequestFeeSnapshot {
  ruleSetId: number;
  ruleSetVersion: number;
  ruleId: number;
  amountNdp: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

export interface ExchangeRequestFeeRepositoryPort {
  withTransactionClient(transactionClient: unknown): ExchangeRequestFeeRepositoryPort;
  findCurrent(at: Date): Promise<ExchangeRequestFeeSnapshot | null>;
  listVersions(input: PaginationInput): Promise<PaginatedResponse<ExchangeRequestFeeSnapshot>>;
  createVersion(input: ExchangeRequestFeeVersionCreateInput): Promise<
    | { kind: "success"; value: ExchangeRequestFeeSnapshot }
    | { kind: "conflict" }
  >;
  recordPublicationCalculation(input: {
    exchangePostId: number;
    payerType: "user" | "shop";
    payerId: number;
    fee: ExchangeRequestFeeSnapshot;
    calculatedAt: Date;
  }): Promise<number>;
}

public withTransactionClient(transactionClient: unknown): ExchangeRequestFeeService {
  return new ExchangeRequestFeeService(
    this.repository.withTransactionClient(transactionClient)
  );
}

public async resolveCurrent(at: Date): Promise<ExchangeRequestFeeSnapshot> {
  const fee = await this.repository.findCurrent(at);
  if (!fee) throw new AppError({
    code: ERROR_CODES.EXCHANGE_REQUEST_FEE_UNAVAILABLE,
    message: "error.exchange.request_fee_unavailable",
    statusCode: 503
  });
  return fee;
}
```

Add the following stable application constants without reusing Booking codes:

```ts
EXCHANGE_REQUEST_TARGET_LIMIT: 40921,
EXCHANGE_REQUEST_FEE_UNAVAILABLE: 50321,
EXCHANGE_REQUEST_FEE_VERSION_CONFLICT: 40922,
EXCHANGE_REQUEST_IDEMPOTENCY_CONFLICT: 40923,
EXCHANGE_REQUEST_FINANCIAL_STATE_CONFLICT: 40924,
```

The repository query must filter `familyCode`, `status=active`, both effective bounds, rule `feeType`, `orderType`, `calculationMode=fixed`, `pricingLockMode=lock_at_publish`, and all `deletedAt` fields. Reject negative amounts and any rule family with zero or multiple applicable active rules.

- [ ] **Step 4: Add Zod contracts and transaction-aware repository persistence**

```ts
export const exchangeRequestFeeHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20)
}).strict();

export const createExchangeRequestFeeVersionSchema = z.object({
  amountNdp: z.coerce.number().int().nonnegative().max(1_000_000_000),
  effectiveFrom: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
  expectedCurrentVersion: z.coerce.number().int().positive()
}).strict();
```

`createVersion` runs one Prisma transaction, conditionally closes only the expected active version, creates version `expectedCurrentVersion + 1`, creates exactly one active fixed rule, and writes `exchange.request_fee.version.create` audit metadata with amount and version only.

- [ ] **Step 5: Run focused fee tests**

Run:

```bash
cd backend
npm test -- tests/exchange-request-fee.service.test.ts tests/platform-fee-policy-service.test.ts tests/fee-calculation-service.test.ts
```

Expected: all fee policy tests pass and the Booking family behavior is unchanged.

- [ ] **Step 6: Commit the fee authority**

```bash
git add backend/src/services/exchange-request-fee.service.ts backend/src/repositories/exchange-request-fee.repository.ts backend/src/validators/exchange-request-fee.validator.ts backend/src/constants/error-codes.ts backend/tests/exchange-request-fee.service.test.ts
git commit -m "feat(exchange): add versioned Request fee policy"
```

---

### Task 3: Define strict Request validation, capacity, and privacy projection

**Files:**
- Modify: `backend/src/types/exchange.types.ts`
- Modify: `backend/src/validators/exchange.validators.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/tests/exchange.validators.test.ts`
- Modify: `backend/tests/exchange.service.test.ts`
- Modify: `backend/tests/exchange.repository.test.ts`

**Interfaces:**
- Customer limits are `standard=1`, `silver=2`, `gold=3`, `black=20`; shop merchants are `20`.
- The DTO returns `publisher: ExchangeActorPayload | null` and a server-projected address object; it never returns phone/email.
- Demand publication derives `ExchangePost.areaLabel` from `addressLine1`; Intelligence keeps its current `areaLabel` input.

- [ ] **Step 1: Add failing validator and capacity tests**

```ts
it.each([
  ["standard", 1],
  ["silver", 2],
  ["gold", 3],
  ["black", 20]
])("caps %s at %i providers", async (membershipLevel, maximum) => {
  repository.resolveActor.mockResolvedValue(customerActor({ membershipLevel }));
  await expect(service.getRequestPublicationContext(access)).resolves.toMatchObject({
    capacitySource: "customer_membership",
    membershipLevel,
    maxTargetProviderCount: maximum
  });
});

it("accepts an absent minimum but rejects a minimum above the maximum", () => {
  expect(publishExchangePostSchema.safeParse(validDemand({ budgetMinJpy: null })).success).toBe(true);
  expect(publishExchangePostSchema.safeParse(validDemand({ budgetMinJpy: 20001, budgetMaxJpy: 20000 })).success).toBe(false);
});
```

- [ ] **Step 2: Run the focused tests and confirm the red state**

Run: `cd backend && npm test -- tests/exchange.validators.test.ts tests/exchange.service.test.ts tests/exchange.repository.test.ts`

Expected: FAIL because the upgraded fields, capacity context, and disclosure projection are absent.

- [ ] **Step 3: Replace only the demand validator branch**

```ts
const demandPostSchema = z.object({
  type: z.literal("demand"),
  title: authoredText(120),
  detail: authoredText(10_000),
  contentLocale: z.enum(CONTENT_LOCALES),
  serviceStartAt: explicitOffsetDate,
  serviceEndAt: explicitOffsetDate,
  expiresAt: explicitOffsetDate,
  targetProviderCount: z.coerce.number().int().min(1).max(20),
  matchMode: z.enum(["quick", "selective"]),
  budgetMode: z.enum(["total", "per_provider"]),
  budgetMinJpy: moneyJpy.nullable().optional().default(null),
  budgetMaxJpy: moneyJpy,
  addressLine1: authoredText(255),
  addressLine2: authoredText(255).nullable().optional().default(null),
  addressLine3: authoredText(255).nullable().optional().default(null),
  addressLine2Public: z.boolean().default(false),
  addressLine3Public: z.boolean().default(false),
  publisherIdentityPublic: z.boolean().default(false)
}).strict();
```

In `superRefine`, reject `budgetMinJpy > budgetMaxJpy`, a public switch on an empty optional line, invalid service windows, and expiry before service end. Keep the Intelligence branch byte-for-byte compatible except for shared helper extraction.

- [ ] **Step 4: Add authority and projection types**

```ts
export interface ExchangePublisherCapacity {
  source: "customer_membership" | "shop_merchant";
  membershipLevel: "standard" | "silver" | "gold" | "black" | null;
  targetProviderLimit: number;
  payerOwnerType: "user" | "shop";
  payerOwnerId: number;
  currency: "NDP" | "TEST_NDP";
}

export interface ExchangeRequestPublicationContextPayload {
  canPublish: boolean;
  capacitySource: ExchangePublisherCapacity["source"];
  membershipLevel: ExchangePublisherCapacity["membershipLevel"];
  maxTargetProviderCount: number;
  publicationFee: { amountNdp: number; currency: "NDP" | "TEST_NDP"; ruleSetVersion: number };
}

export interface ExchangeRequestAddressPayload {
  line1: string;
  line2: string | null;
  line3: string | null;
  line2GenerallyVisible: boolean;
  line3GenerallyVisible: boolean;
  disclosure: "owner" | "general";
}
```

Extend `resolveActor` to select `User.isTestAccount`, active customer membership, and active shop scope in one bounded query. Reject unknown membership values, inactive/deleted customer profiles, inactive/deleted shop scopes, and identity/scope mismatch.

- [ ] **Step 5: Project private fields in the repository, not the client**

```ts
const ownerView = record.ownerIdentityId === viewerIdentityId;
const showPublisher = ownerView || record.demand?.publisherIdentityPublic === true;
const demand = record.demand ? {
  targetProviderCount: record.demand.targetProviderCount,
  targetProviderLimitSnapshot: record.demand.targetProviderLimitSnapshot,
  publisherCapacitySource: capacitySourceFromDb(record.demand.publisherCapacitySource),
  membershipLevelSnapshot: record.demand.membershipLevelSnapshot,
  matchMode: matchModeFromDb(record.demand.matchMode),
  budgetMode: budgetModeFromDb(record.demand.budgetMode),
  budgetMinJpy: record.demand.budgetMinJpy,
  budgetMaxJpy: record.demand.budgetMaxJpy,
  address: {
    line1: record.demand.addressLine1,
    line2: ownerView || record.demand.addressLine2Public ? record.demand.addressLine2 : null,
    line3: ownerView || record.demand.addressLine3Public ? record.demand.addressLine3 : null,
    line2GenerallyVisible: record.demand.addressLine2Public,
    line3GenerallyVisible: record.demand.addressLine3Public,
    disclosure: ownerView ? "owner" : "general"
  }
} : null;
```

Return `publisher: null` when `showPublisher` is false. Add tests proving no payload key contains `phone`, `email`, `phoneNumber`, or unredacted optional address content. Preserve the service's customer cross-account 404 and provider-market pagination.

- [ ] **Step 6: Run and commit the domain contract**

Run:

```bash
cd backend
npm test -- tests/exchange.validators.test.ts tests/exchange.service.test.ts tests/exchange.repository.test.ts tests/exchange-source-policy.test.ts
```

Then:

```bash
git add backend/src/types/exchange.types.ts backend/src/validators/exchange.validators.ts backend/src/services/exchange.service.ts backend/src/repositories/exchange.repository.ts backend/tests/exchange.validators.test.ts backend/tests/exchange.service.test.ts backend/tests/exchange.repository.test.ts
git commit -m "feat(exchange): define Request authority and disclosure"
```

---

### Task 4: Add Request fee freeze, capture, release, and test-shop funding

**Files:**
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/src/services/test-ndp-provisioning.service.ts`
- Modify: `backend/src/repositories/test-ndp-provisioning.repository.ts`
- Create: `backend/tests/exchange-request-ledger.service.test.ts`
- Modify: `backend/tests/ledger.repository.test.ts`
- Modify: `backend/tests/test-ndp-provisioning.service.test.ts`

**Interfaces:**
- `freezeExchangeRequestPublication` moves exact available funds to frozen and creates the hold/financial/log/reconciliation evidence.
- `captureExchangeRequestPublication` moves exact frozen funds to the same-currency platform wallet.
- `releaseExchangeRequestPublication` returns exact frozen funds to the payer's available balance.
- Every method accepts `{ transactionClient?: unknown }` so Exchange owns the outer transaction.

- [ ] **Step 1: Add failing exact-delta and replay tests**

```ts
it.each(["NDP", "TEST_NDP"] as const)("freezes one Request fee in %s", async (currency) => {
  repository.getOrCreateWallet.mockResolvedValue(wallet({ availableBalance: 100000, frozenBalance: 0, currency }));
  const result = await service.freezeExchangeRequestPublication(requestFreezeInput({ currency }), { transactionClient });
  expect(repository.applyWalletDelta).toHaveBeenCalledWith(expect.objectContaining({
    availableDelta: -1000,
    frozenDelta: 1000,
    requireAvailableAtLeast: 1000
  }));
  expect(result).toMatchObject({ amountNdp: 1000, currency, state: "held" });
});

it("does not capture a held Request twice", async () => {
  repository.findExchangeRequestFinancialForUpdate.mockResolvedValue(financial({ state: "captured" }));
  await expect(service.captureExchangeRequestPublication({ exchangePostId: 71, actorUserId: 9 }, { transactionClient }))
    .resolves.toMatchObject({ state: "captured" });
  expect(repository.applyWalletDelta).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the new ledger test and confirm the red state**

Run: `cd backend && npm test -- tests/exchange-request-ledger.service.test.ts`

Expected: FAIL because the Request ledger methods are absent.

- [ ] **Step 3: Add the Request ledger port and methods**

```ts
export interface ExchangeRequestFreezeInput {
  exchangePostId: number;
  actorUserId: number;
  payerType: "user" | "shop";
  payerId: number;
  walletOwnerType: "user" | "shop";
  walletOwnerId: number;
  currency: LedgerCurrency;
  fee: ExchangeRequestFeeSnapshot;
  feeCalculationLogId: number;
  occurredAt: Date;
}

public freezeExchangeRequestPublication(
  input: ExchangeRequestFreezeInput,
  context: LedgerExecutionContext = {}
): Promise<ExchangeRequestFinancialPayload> {
  return this.repository.runInTransaction(async (repository) => {
    const replay = await repository.findExchangeRequestFinancialByPostId(input.exchangePostId);
    if (replay) return replay;
    const wallet = await repository.getOrCreateWallet({
      ownerType: input.walletOwnerType,
      ownerId: input.walletOwnerId,
      currency: input.currency,
      lockForUpdate: true
    });
    await repository.applyWalletDelta({
      walletId: wallet.id,
      availableDelta: -input.fee.amountNdp,
      frozenDelta: input.fee.amountNdp,
      requireAvailableAtLeast: input.fee.amountNdp
    });
    return repository.createExchangeRequestFreezeEvidence(input, wallet.id);
  }, context.transactionClient);
}
```

`createExchangeRequestFreezeEvidence` creates one WalletHold (`exchangePostId`, no Booking reference), one financial snapshot, one immutable transaction with balanced ledger entries, one same-currency reconciliation, and audit action `ledger.exchange_request_publication.freeze`. Capture and release first lock the financial, hold, payer wallet, and platform wallet as required, use stable idempotency keys `exchange-request:<postId>:capture` and `exchange-request:<postId>:release`, and return the existing terminal snapshot on a same-terminal replay. A capture-versus-release race must yield exactly one successful terminal state and one 409 conflict.

- [ ] **Step 4: Extend Test NDP provisioning for scoped shop wallets**

```ts
export interface TestShopNdpCalibrationInput {
  shopId: number;
  actorUserId: number;
  targetAvailableNdp?: number;
}

public calibrateShop(input: TestShopNdpCalibrationInput): Promise<TestNdpCalibrationResult> {
  return this.repository.runInTransaction(async (repository) => {
    const authority = await repository.findTestShopAuthorityForUpdate(input);
    if (!authority?.isTestAccount || !authority.activeShopScope) {
      throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: "error.forbidden", statusCode: 403 });
    }
    return this.calibrateOwnerWallet(repository, {
      ownerType: "shop",
      ownerId: input.shopId,
      currency: "TEST_NDP",
      targetAvailableNdp: input.targetAvailableNdp ?? 100000,
      idempotencyKey: `exchange-request-shop-test-ndp-v1:shop:${input.shopId}:calibrate`
    });
  });
}
```

The provisioning path writes a balanced `test_balance_calibration` transaction, `TEST_ONLY` reconciliation, and `test_ndp.shop.calibrate` audit. It refuses formal actors, foreign shops, negative deltas, and any NDP fallback. Publication itself never calls calibration.

- [ ] **Step 5: Run ledger and provisioning regressions**

Run:

```bash
cd backend
npm test -- tests/exchange-request-ledger.service.test.ts tests/ledger-service.test.ts tests/ledger.repository.test.ts tests/test-ndp-provisioning.service.test.ts tests/ledger-currency.service.test.ts
```

Expected: Request and existing Booking/Affiliate/Test NDP ledger tests pass.

- [ ] **Step 6: Commit the financial mutation boundary**

```bash
git add backend/src/services/ledger.service.ts backend/src/repositories/ledger.repository.ts backend/src/services/test-ndp-provisioning.service.ts backend/src/repositories/test-ndp-provisioning.repository.ts backend/tests/exchange-request-ledger.service.test.ts backend/tests/ledger.repository.test.ts backend/tests/test-ndp-provisioning.service.test.ts
git commit -m "feat(exchange): add Request fee ledger lifecycle"
```

---

### Task 5: Make Request publication atomic and payload-idempotent

**Files:**
- Create: `backend/src/utils/stable-json.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/tests/exchange.service.test.ts`
- Modify: `backend/tests/exchange.repository.test.ts`

**Interfaces:**
- `ExchangeRepositoryPort.runInTransaction(handler, transactionClient?)` gives the service a transaction-bound repository.
- The service resolves actor/capacity/fee/currency inside the transaction, creates the post, records fee calculation, freezes the wallet, then reads the final projected DTO.
- Idempotency compares a SHA-256 fingerprint of normalized actor authority plus demand input.

- [ ] **Step 1: Add failing rollback and idempotency tests**

```ts
it("rolls back the Request when the wallet cannot freeze the fee", async () => {
  ledger.freezeExchangeRequestPublication.mockRejectedValue(insufficientBalanceError());
  await expect(service.publish(access, validDemand(), "request-key-00000001"))
    .rejects.toMatchObject({ message: "error.wallet.insufficient_balance" });
  expect(transaction.commit).not.toHaveBeenCalled();
  expect(transaction.rollback).toHaveBeenCalledTimes(1);
});

it("rejects a reused idempotency key with a different payload", async () => {
  repository.findPostByIdempotencyKey.mockResolvedValue(existingPublication({ payloadFingerprint: "different" }));
  await expect(service.publish(access, validDemand(), "request-key-00000001"))
    .rejects.toMatchObject({ statusCode: 409, message: "error.exchange.idempotency_conflict" });
  expect(ledger.freezeExchangeRequestPublication).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused publication tests and confirm the red state**

Run: `cd backend && npm test -- tests/exchange.service.test.ts tests/exchange.repository.test.ts`

Expected: FAIL because the shared transaction and payload fingerprint are absent.

- [ ] **Step 3: Add deterministic fingerprinting**

```ts
import { createHash } from "node:crypto";

export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const sha256StableJson = (value: unknown): string =>
  createHash("sha256").update(stableJson(value)).digest("hex");
```

Normalize all dates to ISO strings, nullable optional addresses to `null`, and include `{ userId, identityId, scopeType, scopeId }` in the fingerprint. Do not include fee version, current balance, or mutable display data.

- [ ] **Step 4: Move demand publication orchestration into one service-owned transaction**

```ts
return this.repository.runInTransaction(async (repository, transactionClient) => {
  const actor = await this.resolveActor(access, repository);
  this.assertCanPublish(actor.identityType, "demand");
  const capacity = this.resolvePublisherCapacity(actor);
  this.assertTargetWithinCapacity(input.targetProviderCount, capacity.targetProviderLimit);
  const fingerprint = this.requestFingerprint(actor, input);
  const replay = await repository.findPostByIdempotencyKey(idempotencyKey, actor.ownerIdentityId ?? actor.identityId);
  if (replay) return this.unwrapPublicationReplay(replay, fingerprint);

  const feeService = this.exchangeRequestFeeService.withTransactionClient(transactionClient);
  const fee = await feeService.resolveCurrent(now);
  const created = await repository.createDemandPost({
    actor,
    input,
    capacity,
    areaLabel: input.addressLine1,
    payloadFingerprint: fingerprint,
    idempotencyKey,
    now
  });
  const calculationLogId = await feeService.recordPublicationCalculation({
    exchangePostId: created.id,
    payerType: capacity.payerOwnerType,
    payerId: capacity.payerOwnerId,
    fee,
    calculatedAt: now
  });
  await this.ledgerService.freezeExchangeRequestPublication({
    exchangePostId: created.id,
    actorUserId: actor.userId,
    payerType: capacity.payerOwnerType,
    payerId: capacity.payerOwnerId,
    walletOwnerType: capacity.payerOwnerType,
    walletOwnerId: capacity.payerOwnerId,
    currency: capacity.currency,
    fee,
    feeCalculationLogId: calculationLogId,
    occurredAt: now
  }, { transactionClient });
  await repository.createAudit(publicationAudit(created.id, actor, capacity, fee));
  return repository.findPostByIdOrThrow(created.id, actor.ownerIdentityId ?? actor.identityId, now);
});
```

Keep Intelligence publication on its current path but make it use the same transaction wrapper without a wallet mutation. Wire one `ExchangeRequestFeeService`, `LedgerService`, and `ExchangeService` instance through `AppDependencies`, routes, server, and expiry worker.

- [ ] **Step 5: Prove transaction, replay, cap, and currency behavior**

Add service/repository cases for all four memberships, shop limit 20, merchant staff without/with explicit permission at API level, insufficient balance rollback, test/formal currency selection, exact replay, payload conflict, stale fee gap, and a concurrent duplicate key. Then run:

```bash
cd backend
npm test -- tests/exchange.service.test.ts tests/exchange.repository.test.ts tests/exchange-request-ledger.service.test.ts
```

Expected: all cases pass with one post, one hold, one fee log, one ledger transaction, and one reconciliation per successful publication.

- [ ] **Step 6: Commit atomic publication**

```bash
git add backend/src/utils/stable-json.ts backend/src/services/exchange.service.ts backend/src/repositories/exchange.repository.ts backend/src/app.ts backend/src/server.ts backend/tests/exchange.service.test.ts backend/tests/exchange.repository.test.ts
git commit -m "feat(exchange): publish Request and freeze fee atomically"
```

---

### Task 6: Make withdrawal capture and natural expiry release concurrency-safe

**Files:**
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/workers/exchange-post-expiry.worker.ts`
- Modify: `backend/tests/exchange.service.test.ts`
- Modify: `backend/tests/exchange.repository.test.ts`
- Modify: `backend/tests/exchange-post-expiry.worker.test.ts`

**Interfaces:**
- New financial Requests require a successful ledger terminal transition in the same transaction as the post status change.
- Legacy demands without a financial row keep the preexisting status-only withdrawal/expiry behavior until the controlled rebuild soft-deletes them.
- Intelligence withdrawal/expiry never calls Request ledger methods.

- [ ] **Step 1: Add failing terminal-state race tests**

```ts
it("captures the full held fee when the owner withdraws", async () => {
  repository.lockPostForMutation.mockResolvedValue(heldRequest());
  await service.withdraw(access, 91, "withdraw-key-000001");
  expect(ledger.captureExchangeRequestPublication).toHaveBeenCalledWith(
    { exchangePostId: 91, actorUserId: access.userId, occurredAt: now },
    { transactionClient }
  );
  expect(repository.markWithdrawn).toHaveBeenCalledWith(91, now);
});

it("allows only one of withdrawal capture and expiry release", async () => {
  const outcomes = await Promise.allSettled([
    service.withdraw(access, 91, "withdraw-key-000001"),
    service.expirePost(91, now)
  ]);
  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  expect(financialTerminalWrites()).toBe(1);
});
```

- [ ] **Step 2: Run terminal tests and confirm the red state**

Run: `cd backend && npm test -- tests/exchange.service.test.ts tests/exchange.repository.test.ts tests/exchange-post-expiry.worker.test.ts`

Expected: FAIL because withdrawal and expiry still change only the Exchange post.

- [ ] **Step 3: Implement guarded withdrawal capture**

Inside one repository transaction, lock the post by id, verify `ownerIdentityId`, `status=published`, `deletedAt=null`, and then:

```ts
if (post.type === "demand" && post.requestFinancial) {
  await this.ledgerService.captureExchangeRequestPublication({
    exchangePostId: post.id,
    actorUserId: actor.userId,
    occurredAt: now
  }, { transactionClient });
}
const changed = await repository.markWithdrawnIfPublished(post.id, now);
if (!changed) throw this.exchangeFinancialStateConflict();
await repository.createAudit(this.audit(access, "exchange.post.withdraw", post.id, {
  previousStatus: "published",
  nextStatus: "withdrawn",
  publicationFeeOutcome: post.requestFinancial ? "captured" : "legacy_not_applicable"
}));
```

Use the same transaction client for the ledger call and status guard. An identical withdrawal replay returns the withdrawn DTO; a different terminal result returns 409.

- [ ] **Step 4: Implement guarded natural expiry release**

Change the worker to fetch a bounded ordered page of due IDs, then call `service.expirePost(postId, now)` for each. For a financial Request, release first and mark expired in the same transaction; for Intelligence or a legacy demand, preserve status-only expiry. Audit `exchange.post.expire` with `publicationFeeOutcome=released` when applicable.

```ts
public async expireDue(now: Date, batchSize: number): Promise<number> {
  const ids = await this.repository.listDuePostIds(now, batchSize);
  let expired = 0;
  for (const postId of ids) {
    if (await this.expirePost(postId, now)) expired += 1;
  }
  return expired;
}
```

- [ ] **Step 5: Run terminal and ledger regressions**

Run:

```bash
cd backend
npm test -- tests/exchange.service.test.ts tests/exchange.repository.test.ts tests/exchange-post-expiry.worker.test.ts tests/exchange-request-ledger.service.test.ts tests/ledger-service.test.ts
```

Expected: exact capture/release deltas pass for NDP and TEST_NDP; concurrent terminal calls cannot double-mutate funds.

- [ ] **Step 6: Commit terminal finance behavior**

```bash
git add backend/src/services/exchange.service.ts backend/src/repositories/exchange.repository.ts backend/src/workers/exchange-post-expiry.worker.ts backend/tests/exchange.service.test.ts backend/tests/exchange.repository.test.ts backend/tests/exchange-post-expiry.worker.test.ts
git commit -m "feat(exchange): settle Request fee on terminal states"
```

---

### Task 7: Expose publication context and fee administration with RBAC/OpenAPI

**Files:**
- Modify: `backend/src/controllers/exchange.controller.ts`
- Modify: `backend/src/routes/exchange.routes.ts`
- Create: `backend/src/controllers/exchange-request-fee.controller.ts`
- Create: `backend/src/routes/exchange-request-fee.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/exchange-request-fee-api.test.ts`
- Modify: `backend/tests/exchange.routes.test.ts`
- Modify: `backend/tests/exchange.openapi.test.ts`
- Modify: `backend/tests/exchange-permissions.test.ts`

**Interfaces:**
- `GET /api/v1/exchange/request-publication-context` uses `exchange:posts:create-demand`.
- `GET /api/v1/backoffice/exchange-request-fee/current` and `/versions` use fee read permission.
- `POST /api/v1/backoffice/exchange-request-fee/versions` uses fee write permission.

- [ ] **Step 1: Add failing route/RBAC/OpenAPI contracts**

```ts
expect(routePermissions).toEqual(expect.arrayContaining([
  ["GET", "/exchange/request-publication-context", "exchange:posts:create-demand"],
  ["GET", "/backoffice/exchange-request-fee/current", "backoffice:exchange-request-fee:read"],
  ["GET", "/backoffice/exchange-request-fee/versions", "backoffice:exchange-request-fee:read"],
  ["POST", "/backoffice/exchange-request-fee/versions", "backoffice:exchange-request-fee:write"]
]));

expect(openapi.paths["/exchange/request-publication-context"].get.security).toEqual([{ bearerAuth: [] }]);
expect(openapi.paths["/backoffice/exchange-request-fee/versions"].get.parameters)
  .toEqual(expect.arrayContaining([expect.objectContaining({ name: "page" }), expect.objectContaining({ name: "page_size" })]));
```

- [ ] **Step 2: Run API contracts and confirm the red state**

Run: `cd backend && npm test -- tests/exchange.routes.test.ts tests/exchange.openapi.test.ts tests/exchange-permissions.test.ts tests/exchange-request-fee-api.test.ts`

Expected: FAIL because the routes and OpenAPI operations are absent.

- [ ] **Step 3: Add controller and route boundaries**

```ts
router.get(
  "/exchange/request-publication-context",
  authenticate(),
  createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.createDemand),
  controller.getRequestPublicationContext
);

router.get(
  "/backoffice/exchange-request-fee/versions",
  authenticate(),
  createAuthorizeMiddleware(EXCHANGE_REQUEST_FEE_PERMISSIONS.read),
  validateRequest({ query: exchangeRequestFeeHistoryQuerySchema }),
  feeController.listVersions
);

router.post(
  "/backoffice/exchange-request-fee/versions",
  authenticate(),
  createAuthorizeMiddleware(EXCHANGE_REQUEST_FEE_PERMISSIONS.write),
  validateRequest({ body: createExchangeRequestFeeVersionSchema }),
  feeController.createVersion
);
```

Controllers read only validated `response.locals`/request values, call services, and return the standard `{ code, message, data }` envelope. The publication context returns capacity, membership, limit, fee, currency, and `canPublish`; it omits all numeric database IDs and wallet balance.

- [ ] **Step 4: Register permission definitions and exact default roles**

Add `EXCHANGE_REQUEST_FEE_PERMISSIONS`, include its definitions in `SYSTEM_PERMISSIONS`, add `EXCHANGE_PERMISSIONS.createDemand` to the `merchant_owner` role only, add fee read to admin/operator/finance/viewer, and fee write only to admin/finance. Assert that merchant staff fails by default and succeeds only when an explicit scoped role permission is supplied in the integration fixture.

- [ ] **Step 5: Document schemas, errors, and permission metadata**

Add OpenAPI component schemas for `ExchangeRequestDemand`, `ExchangeRequestAddress`, `ExchangeRequestPublicationFee`, `ExchangeRequestPublicationContext`, `ExchangeRequestFeeVersion`, and the paginated version response. Document 400, 401, 403, 404, 409, and 503 business envelopes and include `x-permission` on every protected operation.

- [ ] **Step 6: Run API tests and commit**

Run:

```bash
cd backend
npm test -- tests/exchange.routes.test.ts tests/exchange.openapi.test.ts tests/exchange-permissions.test.ts tests/exchange-request-fee-api.test.ts tests/openapi.test.ts
```

Then:

```bash
git add backend/src/controllers/exchange.controller.ts backend/src/routes/exchange.routes.ts backend/src/controllers/exchange-request-fee.controller.ts backend/src/routes/exchange-request-fee.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/src/api/openapi.ts backend/tests/exchange-request-fee-api.test.ts backend/tests/exchange.routes.test.ts backend/tests/exchange.openapi.test.ts backend/tests/exchange-permissions.test.ts
git commit -m "feat(exchange): expose Request publication contracts"
```

---

### Task 8: Extend the high-fidelity Request composer and detail projection

**Files:**
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/api.ts`
- Modify: `src/features/exchange/ExchangeComposer.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.tsx`
- Modify: `src/features/exchange/i18n.ts`
- Modify: `src/features/exchange/ExchangeComposer.test.tsx`
- Modify: `src/features/exchange/api.test.ts`
- Modify: `src/features/exchange/ExchangePostDetailPage.test.tsx`

**Interfaces:**
- The UI fetches the server publication context before enabling Request submit.
- Customer has Request only; technician has Intelligence only; permitted merchant has an explicit Request/Intelligence choice.
- Every required label contains a visible `*`; address 1 has no visibility switch.

- [ ] **Step 1: Add failing high-fidelity composer tests**

```tsx
it("renders server-capped Request fields and required markers", async () => {
  api.getRequestPublicationContext.mockResolvedValue(context({ maxTargetProviderCount: 3, amountNdp: 1000 }));
  render(<ExchangeComposer context={customerContext} onClose={vi.fn()} onPublished={vi.fn()} />);
  expect(await screen.findByLabelText(/目标服务人数 \*/)).toHaveAttribute("max", "3");
  expect(screen.getByLabelText(/地址1 \*/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/地址1.*公开/)).not.toBeInTheDocument();
  expect(screen.getByText(/1,000 Test NDP/)).toBeInTheDocument();
});

it("lets an authorized merchant choose Request or Intelligence", async () => {
  render(<ExchangeComposer context={merchantWithDemandPermission} onClose={vi.fn()} onPublished={vi.fn()} />);
  expect(await screen.findByRole("radio", { name: "Request" })).toBeEnabled();
  expect(screen.getByRole("radio", { name: "情报" })).toBeEnabled();
});
```

- [ ] **Step 2: Run frontend contracts and confirm the red state**

Run: `npm test -- src/features/exchange/ExchangeComposer.test.tsx src/features/exchange/api.test.ts src/features/exchange/ExchangePostDetailPage.test.tsx`

Expected: FAIL because the context call and upgraded controls are absent.

- [ ] **Step 3: Add formal client types and API calls**

```ts
export interface ExchangeRequestPublicationContext {
  canPublish: boolean;
  capacitySource: "customer_membership" | "shop_merchant";
  membershipLevel: "standard" | "silver" | "gold" | "black" | null;
  maxTargetProviderCount: number;
  publicationFee: { amountNdp: number; currency: "NDP" | "TEST_NDP"; ruleSetVersion: number };
}

export const getRequestPublicationContext = (): Promise<ExchangeRequestPublicationContext> =>
  httpClient.get("/exchange/request-publication-context").then(unwrapData);
```

Update the demand request type to the exact validator keys. Keep Intelligence types and endpoints unchanged.

- [ ] **Step 4: Extend the existing composer in place**

Use the current fullscreen shell, typography, spacing, theme tokens, submit flow, and responsive footer. Add controlled inputs for target count, quick/selective, total/per-provider, optional minimum, required maximum, three address lines, Address2/3 public switches, identity-group visibility, and server fee disclosure. Disable/clear an optional address switch when its line is empty. Use one fresh idempotency key per user submit and retain it only for transport retry of the identical body.

```ts
const demandBody = {
  type: "demand" as const,
  title: form.title.trim(),
  detail: form.detail.trim(),
  contentLocale: form.contentLocale,
  serviceStartAt: form.serviceStartAt,
  serviceEndAt: form.serviceEndAt,
  expiresAt: form.expiresAt,
  targetProviderCount: Number(form.targetProviderCount),
  matchMode: form.matchMode,
  budgetMode: form.budgetMode,
  budgetMinJpy: form.budgetMinJpy === "" ? null : Number(form.budgetMinJpy),
  budgetMaxJpy: Number(form.budgetMaxJpy),
  addressLine1: form.addressLine1.trim(),
  addressLine2: nullableTrim(form.addressLine2),
  addressLine3: nullableTrim(form.addressLine3),
  addressLine2Public: form.addressLine2.trim() !== "" && form.addressLine2Public,
  addressLine3Public: form.addressLine3.trim() !== "" && form.addressLine3Public,
  publisherIdentityPublic: form.publisherIdentityPublic
};
```

- [ ] **Step 5: Render only server-projected detail fields and add five languages**

`ExchangePostDetailPage` treats `publisher=null` as hidden, renders address line 1 always, and renders optional lines only when present in the DTO. It must not infer visibility from the current role. Add all new labels, help text, fee disclosure, and server error keys to `zh-CN`, `zh-TW`, `ja`, `en`, and `ko`; authored Request text remains unchanged.

- [ ] **Step 6: Run frontend tests and commit**

Run:

```bash
npm test -- src/features/exchange/ExchangeComposer.test.tsx src/features/exchange/api.test.ts src/features/exchange/ExchangePostDetailPage.test.tsx src/features/exchange/ExchangeFeedPage.test.tsx
```

Then:

```bash
git add src/features/exchange/types.ts src/features/exchange/api.ts src/features/exchange/ExchangeComposer.tsx src/features/exchange/ExchangePostDetailPage.tsx src/features/exchange/i18n.ts src/features/exchange/ExchangeComposer.test.tsx src/features/exchange/api.test.ts src/features/exchange/ExchangePostDetailPage.test.tsx
git commit -m "feat(exchange): extend high-fidelity Request composer"
```

---

### Task 9: Add Request fee operations UI and paired finance reporting

**Files:**
- Create: `src/api/exchangeRequestFee.ts`
- Create: `src/components/admin/ExchangeRequestFeePanel.tsx`
- Create: `src/components/admin/ExchangeRequestFeePanel.test.tsx`
- Modify: `src/pages/admin/NeedoExchangeAdminPage.tsx`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/pages/admin/FinancePage.tsx`
- Modify: `backend/tests/backoffice-ndp-reporting.repository.test.ts`
- Modify: `backend/tests/backoffice-ndp-summary.service.test.ts`
- Modify: `src/pages/admin/FinancePage.test.ts`

**Interfaces:**
- The demand admin page shows the current Request fee, paginated immutable versions, and a write action only when RBAC permits.
- Finance adds Request publication consumption/holds to the existing `NdpMetricValue` `{ ndp, testNdp }` pattern.
- Formal settlement/export remains NDP-only; TEST_NDP stays visible in reconciliation totals.

- [ ] **Step 1: Add failing admin and finance tests**

```tsx
it("shows immutable Request fee history and hides mutation without write permission", async () => {
  render(<ExchangeRequestFeePanel permissions={["backoffice:exchange-request-fee:read"]} />);
  expect(await screen.findByText("1,000 NDP")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "创建新版本" })).not.toBeInTheDocument();
});

it("renders formal consumption with Test NDP as secondary text", async () => {
  renderFinance({ todayNdpConsumption: { ndp: 999, testNdp: 999 } });
  expect(await screen.findByText("999 NDP")).toBeInTheDocument();
  expect(screen.getByText("+ 999 Test NDP")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run admin/finance tests and confirm the red state**

Run:

```bash
npm test -- src/components/admin/ExchangeRequestFeePanel.test.tsx src/pages/admin/FinancePage.test.ts
cd backend && npm test -- tests/backoffice-ndp-reporting.repository.test.ts tests/backoffice-ndp-summary.service.test.ts
```

Expected: FAIL because the fee panel and Request finance aggregates are absent.

- [ ] **Step 3: Add the typed fee client and panel**

The panel calls current/history endpoints, sends `{ amountNdp, effectiveFrom, expectedCurrentVersion }`, refreshes after success, and displays conflict/server errors without optimistic success. Embed it in `NeedoDemandAdminPage`; keep the existing notice that claim/match/booking operations remain disabled. Do not change the Intelligence admin page.

```ts
export interface ExchangeRequestFeeVersion {
  version: number;
  amountNdp: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: "active" | "historical" | "scheduled";
}
```

- [ ] **Step 4: Combine Request financials into currency aggregates**

In `summarizeNdpByCurrency`, group `ExchangeRequestFinancial` by `currency` over the same requested date window and combine:

```ts
const exchangeRequestConsumptionNdp = requestRows
  .filter((row) => row.state === "CAPTURED")
  .reduce((sum, row) => sum + (row._sum.amountNdp ?? 0), 0);
const exchangeRequestHoldNdp = requestRows
  .filter((row) => row.state === "HELD")
  .reduce((sum, row) => sum + (row._sum.amountNdp ?? 0), 0);

return {
  ...orderAggregate,
  exchangeRequestConsumptionNdp,
  exchangeRequestHoldNdp,
  ndpConsumptionNdp: orderAggregate.ndpConsumptionNdp + exchangeRequestConsumptionNdp,
  pendingHoldNdp: orderAggregate.pendingHoldNdp + exchangeRequestHoldNdp
};
```

Map `NDP` and `TEST_NDP` into the existing paired response. `settleableNdp` and settlement CSV continue to select only `currency=NDP`; finance reconciliation may list either currency with explicit labels.

- [ ] **Step 5: Render the paired Request metrics**

Add “今日 NDP 消费额” and “Request 发布费” cards using `NdpMetricValue`. Formal value is primary; nonzero Test NDP is secondary small text. Do not subtract Test NDP on the client; the server-provided formal settleable amount is authoritative.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
cd backend
npm test -- tests/backoffice-ndp-reporting.repository.test.ts tests/backoffice-ndp-summary.service.test.ts tests/backoffice-api.test.ts
cd ..
npm test -- src/components/admin/ExchangeRequestFeePanel.test.tsx src/pages/admin/FinancePage.test.ts src/api/backofficeRealData.test.ts
```

Then:

```bash
git add src/api/exchangeRequestFee.ts src/components/admin/ExchangeRequestFeePanel.tsx src/components/admin/ExchangeRequestFeePanel.test.tsx src/pages/admin/NeedoExchangeAdminPage.tsx backend/src/repositories/backoffice.repository.ts backend/src/services/backoffice.service.ts src/api/backofficeRealData.ts src/pages/admin/FinancePage.tsx backend/tests/backoffice-ndp-reporting.repository.test.ts backend/tests/backoffice-ndp-summary.service.test.ts src/pages/admin/FinancePage.test.ts
git commit -m "feat(exchange): report Request fees in operations"
```

---

### Task 10: Rebuild 20 Requests through authenticated formal APIs

**Files:**
- Modify: `backend/src/simulation/exchange-simulation-plan.ts`
- Modify: `backend/src/simulation/exchange-simulation-seed.ts`
- Modify: `backend/src/simulation/exchange-simulation-checker.ts`
- Modify: `backend/scripts/seed-formal-exchange-test.ts`
- Modify: `backend/scripts/check-formal-exchange-test.ts`
- Create: `backend/scripts/restore-formal-exchange-requests.ts`
- Modify: `backend/tests/exchange-simulation-safety.test.ts`
- Modify: `backend/tests/exchange-simulation-plan.test.ts`
- Modify: `backend/tests/exchange-simulation-seed.integration.test.ts`

**Interfaces:**
- Existing known demand fixtures are soft-deleted with a recoverable manifest; Intelligence fixtures remain untouched.
- New Requests, comments, likes, and shares use authenticated `/api/v1` HTTP calls with real test accounts.
- Shop publishers receive 100,000 TEST_NDP only through formal audited shop calibration before publication.

- [ ] **Step 1: Add failing safety and plan invariants**

```ts
it("plans 20 upgraded Requests and preserves all Intelligence fixtures", () => {
  const plan = buildExchangeSimulationPlan(seedAccounts);
  expect(plan.requests).toHaveLength(20);
  expect(plan.requests.every((request) => request.targetProviderCount >= 1 && request.targetProviderCount <= 20)).toBe(true);
  expect(plan.intelligenceMutationCount).toBe(0);
});

it.each([
  "mysql://user:pass@example.com:3306/needo",
  "mysql://user:pass@10.0.0.8:3306/needo",
  "mysql://user:pass@db.internal:3306/needo"
])("refuses a non-local database: %s", (databaseUrl) => {
  expect(() => getSimulationSeedConfig({ DATABASE_URL: databaseUrl, ALLOW_SIMULATION_SEED: "true" })).toThrow();
});
```

- [ ] **Step 2: Run simulation tests and confirm the red state**

Run: `cd backend && npm test -- tests/exchange-simulation-safety.test.ts tests/exchange-simulation-plan.test.ts tests/exchange-simulation-seed.integration.test.ts`

Expected: FAIL because the current plan still builds legacy demands and writes direct business rows.

- [ ] **Step 3: Produce deterministic upgraded Request plans**

Each request contains all new fields and expected interaction ranges. Cover `standard`, `silver`, `gold`, `black`, and shop-merchant publishers without exceeding their limits. Use unique deterministic idempotency keys and original-language content. Preserve the existing 20 Intelligence fixture identifiers.

```ts
export interface ExchangeRequestSimulationItem {
  fixtureKey: string;
  publisherEmail: string;
  publisherIdentityType: "customer" | "merchant_owner";
  body: PublishExchangeDemandBody;
  commentCount: number;
  likeCount: number;
  shareCount: number;
}
```

Assert `commentCount` 3–10, `likeCount` 10–66 with distinct provider actors, and `shareCount` 2–15.

- [ ] **Step 4: Soft-delete only the known old demand cohort and write a recovery manifest**

Inside one local-only Prisma transaction, identify fixture-key-owned demand posts, record original `deletedAt` values and child IDs, soft-delete comments/likes/shares/demand/post in child-first order, and write an audit action `exchange.fixture.demands.soft_delete`. Persist the manifest under `backend/.artifacts/exchange-request-rebuild/<run-id>.json` with mode `0600`; never include passwords or tokens. The restore script accepts an explicit manifest path, validates the same local database fingerprint, and restores only rows whose current deletion timestamp equals the manifest's run timestamp.

- [ ] **Step 5: Publish and interact through authenticated HTTP**

Start from the configured formal API base URL, authenticate each real test account using `SIMULATION_DEFAULT_PASSWORD` or `TEST_USER_DEFAULT_PASSWORD`, switch to the declared active identity, calibrate required test shop wallets through `TestNdpProvisioningService`, and call:

```ts
await api.post("/exchange/posts", item.body, { idempotencyKey: `${item.fixtureKey}:publish:v2` });
await api.post(`/exchange/posts/${postId}/comments`, { content }, { idempotencyKey: commentKey });
await api.put(`/exchange/posts/${postId}/like`, undefined, { idempotencyKey: likeKey });
await api.post(`/exchange/posts/${postId}/shares`, undefined, { idempotencyKey: shareKey });
```

Never log credentials, access tokens, refresh tokens, or private address lines. The seed must stop on any non-success response; it must not write engagement totals directly.

- [ ] **Step 6: Independently verify and commit the controlled tools**

The checker queries persisted rows independently and asserts 20 active Requests, 20 unchanged Intelligence posts, correct owner identity, valid capacity snapshots, one held financial/hold per Request, exact 1,000 TEST_NDP amount, interaction ranges, audit evidence, and customer/provider privacy through API probes.

Run:

```bash
cd backend
npm test -- tests/exchange-simulation-safety.test.ts tests/exchange-simulation-plan.test.ts tests/exchange-simulation-seed.integration.test.ts
```

Then:

```bash
git add backend/src/simulation/exchange-simulation-plan.ts backend/src/simulation/exchange-simulation-seed.ts backend/src/simulation/exchange-simulation-checker.ts backend/scripts/seed-formal-exchange-test.ts backend/scripts/check-formal-exchange-test.ts backend/scripts/restore-formal-exchange-requests.ts backend/tests/exchange-simulation-safety.test.ts backend/tests/exchange-simulation-plan.test.ts backend/tests/exchange-simulation-seed.integration.test.ts
git commit -m "test(exchange): rebuild formal Request fixtures through API"
```

---

### Task 11: Apply the migration locally and run the complete automated gate

**Files:**
- Create: `backend/tests/exchange-request-publication-migration.test.ts`
- Create: `docs/verification/2026-08-30-exchange-request-publication.md`

**Interfaces:**
- Local MySQL on the approved developer environment is the only database target.
- Repository migration files, `_prisma_migrations`, Prisma schema, and actual table/index/check definitions must agree.

- [ ] **Step 1: Add the real-MySQL migration contract**

```ts
it("has exactly-one WalletHold business reference and one active initial fee", async () => {
  expect(await checkConstraint("wallet_holds_exactly_one_business_ref")).toEqual(1);
  expect(await indexColumns("wallet_holds_exchange_post_id_key")).toEqual(["exchange_post_id"]);
  expect(await activeRequestFeeRows()).toEqual([{ version: 1, amountNdp: 1000 }]);
  expect(await roleHasPermission("merchant_owner", "exchange:posts:create-demand")).toBe(true);
  expect(await roleHasPermission("merchant_staff", "exchange:posts:create-demand")).toBe(false);
});
```

- [ ] **Step 2: Verify local services before mutation**

Run:

```bash
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/ready
cd backend
npx prisma migrate status
```

Expected: health and readiness succeed, and the database host resolves to the approved local MySQL instance. Stop if the URL is remote or production-looking.

- [ ] **Step 3: Apply and inspect the additive migration**

Run:

```bash
cd backend
npm run prisma:generate
npx prisma validate
npx prisma migrate deploy
npx prisma migrate status
npm test -- tests/exchange-request-publication-migration.test.ts
```

Expected: the new migration is applied once; actual columns, indexes, foreign keys, check, enums, permissions, and fee rows match repository contracts.

- [ ] **Step 4: Run focused backend suites**

Run:

```bash
cd backend
npm test -- tests/exchange-request-publication-schema.test.ts tests/exchange-request-publication-migration.test.ts tests/exchange-request-fee.service.test.ts tests/exchange-request-fee-api.test.ts tests/exchange.validators.test.ts tests/exchange.service.test.ts tests/exchange.repository.test.ts tests/exchange-request-ledger.service.test.ts tests/exchange-post-expiry.worker.test.ts tests/exchange.routes.test.ts tests/exchange.openapi.test.ts tests/exchange-permissions.test.ts tests/backoffice-ndp-reporting.repository.test.ts tests/backoffice-ndp-summary.service.test.ts tests/exchange-simulation-safety.test.ts tests/exchange-simulation-plan.test.ts tests/exchange-simulation-seed.integration.test.ts
```

- [ ] **Step 5: Run cross-domain regressions, lint, and builds**

Run:

```bash
cd backend
npm test -- tests/ledger-service.test.ts tests/ledger.repository.test.ts tests/booking-service.test.ts tests/booking-api.test.ts tests/schedule-service.test.ts tests/schedule-api.test.ts tests/order-finance-service.test.ts tests/order-acceptance-pause-service.test.ts tests/manual-payment-service.test.ts tests/manual-payment-api.test.ts tests/auth-permissions.test.ts tests/openapi.test.ts
npm run lint
npm run build
cd ..
npm test -- src/features/exchange/ExchangeComposer.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx src/features/exchange/ExchangeFeedPage.test.tsx src/components/admin/ExchangeRequestFeePanel.test.tsx src/pages/admin/FinancePage.test.ts
npm run lint
npm run verify:production-build
```

- [ ] **Step 6: Record evidence and commit the automated gate**

Record command, UTC/JST time, exit status, test counts, migration name, database fingerprint without credentials, and any environment-only limitation in `docs/verification/2026-08-30-exchange-request-publication.md`.

```bash
git add backend/tests/exchange-request-publication-migration.test.ts docs/verification/2026-08-30-exchange-request-publication.md
git commit -m "test(exchange): verify Request publication foundation"
```

---

### Task 12: Rebuild formal test data and perform real browser acceptance

**Files:**
- Modify: `docs/verification/2026-08-30-exchange-request-publication.md`

**Interfaces:**
- Backend must be the formal server on port 3000; root `dev:backend` is not accepted because it is the legacy server.
- Frontend must be served from this worktree on port 5180.
- Use real test-account sessions and independent customer/provider/admin browser contexts.

- [ ] **Step 1: Start the formal runtime owned by this worktree**

Run the repository's formal startup command and verify ownership before acceptance:

```bash
npm run dev:formal
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/ready
curl -I -s http://127.0.0.1:5180
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5180 -sTCP:LISTEN
```

- [ ] **Step 2: Run the guarded formal rebuild and independent checker**

With only the ignored local environment values set:

```bash
cd backend
npm run seed:formal-exchange-test
npm run check:formal-exchange-test
```

Expected: 20 upgraded active Requests, 20 unchanged Intelligence posts, each Request with 3–10 comments, 10–66 likes, 2–15 shares, one 1,000 TEST_NDP hold/financial row, and no direct engagement counter writes.

- [ ] **Step 3: Accept publication and privacy in separate real sessions**

Read and use `browser:control-in-app-browser` for the real browser session, or `control-chrome` only when an existing Chrome login is required, and verify:

1. Standard, silver, gold, and black customers see limits 1, 2, 3, and 20 and cannot submit above the server limit.
2. Merchant owner can choose Request/Intelligence and publish 1–20 against the active shop TEST_NDP wallet.
3. Merchant staff is denied by default; an explicitly granted staff permission enables the same shop-scoped authority.
4. Technician remains Intelligence-only.
5. Address 1 is visible to authorized providers; Address 2/3 and publisher identity follow server switches; customers receive 404 for another customer's Request.
6. No Exchange response or rendered DOM exposes phone/email or hidden address content.

- [ ] **Step 4: Accept financial and persistence behavior**

In browser plus independent API/database reads verify:

1. Fee preview is the current operations version and starts at 1,000 TEST_NDP.
2. Publication changes the payer from `100000 available / 0 frozen` to `99000 available / 1000 frozen` exactly once.
3. Insufficient available balance leaves no post, hold, ledger, fee log, reconciliation, or audit partial row.
4. Same-key/same-body concurrent submission returns one Request; same-key/different-body returns 409.
5. Publisher withdrawal captures all 1,000 to platform TEST_NDP and never refunds it.
6. Natural unmatched expiry releases all 1,000 to the payer; a withdrawal/expiry race has one terminal financial result.
7. Refresh, logout/login, backend restart, and a second browser context show the same persisted state.
8. Finance shows formal NDP as primary, `+ Test NDP` as secondary, and excludes Test NDP from settleable/export totals.

- [ ] **Step 5: Accept high-fidelity desktop/mobile and all five languages**

At desktop and mobile widths verify composer/list/detail/admin fee/finance views, required `*` markers, address switch behavior, keyboard focus, loading/error/retry states, no horizontal overflow, no hidden action panels, and no application console errors. Switch through Simplified Chinese, Traditional Chinese, Japanese, English, and Korean; authored Request and comment content must remain in its stored original language.

- [ ] **Step 6: Record evidence, run the completion guard, and commit**

Add account aliases without credentials, request IDs, financial before/after values, screenshots/paths, console result, desktop/mobile viewport sizes, language matrix, and rebuild manifest path to `docs/verification/2026-08-30-exchange-request-publication.md`. Then run:

```bash
git status --short
git diff --check
rg -n "mock|localStorage|fake API|fake payment|TO[D]O|FIX[M]E|not[ -]implemented" backend/src/services/exchange.service.ts backend/src/repositories/exchange.repository.ts backend/src/services/ledger.service.ts src/features/exchange src/components/admin/ExchangeRequestFeePanel.tsx
git log --oneline --decorate -12
```

The search must show no newly added prohibited implementation. Commit only the acceptance evidence:

```bash
git add docs/verification/2026-08-30-exchange-request-publication.md
git commit -m "docs(exchange): record Request publication acceptance"
```

Stop here and report the microstep. Do not begin claim or matching design until the user reviews this acceptance.

---

## Plan Self-Review Checklist

- [ ] Every approved Request publication rule maps to a task and a named test.
- [ ] Booking `c_request_dispatch_fee`, Booking/Order/Schedule/Payment behavior, and Intelligence publication remain protected by regression gates.
- [ ] Publication, withdrawal, and expiry share one database transaction with the existing Ledger authority.
- [ ] Customer/shop payer selection and NDP/TEST_NDP currency choice are server-authoritative.
- [ ] Privacy projection is server-side, customer cross-access remains 404, and contact details never enter the DTO.
- [ ] Merchant owner receives default authority; merchant staff requires an explicit permission; technician cannot publish Request.
- [ ] Fee history is versioned, list endpoints are paginated, mutations are Zod/RBAC/OpenAPI/audited, and payload replay is conflict-safe.
- [ ] Old demands are soft-deleted with recovery evidence; Intelligence is preserved; replacement content uses formal authenticated APIs.
- [ ] Automated tests, real MySQL inspection, desktop/mobile browser acceptance, five languages, console, and persistence are mandatory stop gates.
- [ ] No task authorizes push, deployment, external payment, real charge, claim, matching, booking conversion, or payment work.
