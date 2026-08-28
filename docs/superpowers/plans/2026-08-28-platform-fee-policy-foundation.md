# NeeDo Platform Fee Policy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first approved microstep of the platform-fee design: a versioned global Booking platform-fee amount, a persisted per-shop enable/payer policy, identity-scoped formal APIs, RBAC, audit, OpenAPI, migration, and real MySQL verification without changing Booking wallet ownership or debt behavior yet.

**Architecture:** Keep `PlatformFeeRuleSet` / `PlatformFeeRule` as the global amount engine, but identify the managed Booking family with a stable `familyCode` and change its amount by creating a new effective-dated version instead of mutating history. Add one `ShopPlatformFeePolicy` aggregate for the operations-owned `feeEnabled` field and merchant-owned `payerType` field. Expose separate backoffice and merchant mutations through one layered Route → Controller → Service → Repository stack; all writes use optimistic version checks and create `AuditLog` in the same Prisma transaction. The effective-policy resolver returns default `enabled + shop payer` when no shop row exists. Booking confirmation does not consume the new shop policy until the next approved microstep adds wallet/payer snapshots, negative-balance behavior, and reward state transitions.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma 7/MySQL 8, Zod, JWT/RBAC, OpenAPI 3.1, Jest/Supertest.

## Global Constraints

- Work only in `codex/technician-schedule-formal-cutover` at `/Users/eason/Documents/New project/.worktrees/technician-schedule-formal-cutover`.
- Execute one task at a time with red-green-refactor TDD and one reviewable commit per task.
- Follow the approved design in `docs/superpowers/specs/2026-08-28-platform-fee-acceptance-control-design.md`; this plan covers only implementation microstep 1.
- Do not add mock data, browser fallbacks, localStorage state, direct wallet balance edits, placeholder endpoints, or a second fee engine.
- Do not wire `ShopPlatformFeePolicy` into `LedgerService.freezeBookingAcceptance`, completion, cancellation, debt, or reward settlement in this microstep. Those changes require the next plan because payer wallet snapshots and negative-balance transactions must land atomically.
- The global amount update must be history-safe: close the previous effective rule-set version and clone a new version; never edit a version already used at acceptance.
- `b_platform_fee` capture must resolve the fee-rule version by `acceptedAt`, so later global changes cannot reprice an already accepted order.
- Operations may mutate only `feeEnabled`; merchant/shop identities may mutate only `payerType`. No generic body may update both.
- Missing shop policy resolves to `feeEnabled=true`, `payerType=shop`, `policyVersion=0`, and `policySource=default`.
- A missing persisted global family reads as the safe 500 NDP default but cannot be mutated until the canonical family is restored; the write returns a structured conflict rather than inventing an untracked rule.
- Backoffice lists are paginated and expose the shop public ID/name for display; the UI must not display the internal numeric `shopId` as the NeeDo ID.
- All write requests require `expectedVersion`; `0` is the only valid create expectation for a shop without a persisted row.
- All writes must create `AuditLog` inside the same database transaction as the business mutation.
- Do not apply a migration before reviewing generated SQL and confirming the preflight counts. Do not alter seed/test account business data in this microstep.
- Do not push, deploy, merge to the main checkout, or start frontend work.

---

## File Structure

- Modify `backend/prisma/schema.prisma`: add the managed fee-rule family key, shop policy enum/model, and relations.
- Create `backend/prisma/migrations/20260828233000_platform_fee_policy_foundation/migration.sql`: additive schema and deterministic canonical-rule backfill.
- Modify `backend/prisma/seed.ts`: seed `booking_default` family metadata without creating shop overrides.
- Create `backend/tests/platform-fee-policy-schema.test.ts`: lock schema, migration, seed, and permission contracts.
- Modify `backend/src/constants/error-codes.ts`: add policy/version/managed-rule conflicts.
- Modify `backend/src/constants/permissions.constants.ts`: add backoffice and merchant platform-fee permissions and role assignments.
- Modify `backend/src/services/fee-calculation.service.ts`: expose family metadata, protect managed versions, and resolve Booking capture by acceptance time.
- Modify `backend/src/repositories/fee-rule.repository.ts`: map family metadata and refuse generic mutation of the managed family.
- Modify `backend/tests/fee-calculation-service.test.ts` and `backend/tests/fee-rule-api.test.ts`: prove acceptance-time pricing and managed-rule protection.
- Create `backend/src/services/platform-fee-policy.service.ts`: effective policy, field ownership, scope checks, and error mapping.
- Create `backend/src/repositories/platform-fee-policy.repository.ts`: Prisma reads, effective-dated rule cloning, optimistic shop writes, scope checks, and transactional audit.
- Create `backend/src/validators/platform-fee-policy.validator.ts`: params, pagination, filters, and strict mutation bodies.
- Create `backend/src/controllers/platform-fee-policy.controller.ts`: request/response adapter only.
- Create `backend/src/routes/platform-fee-policy.routes.ts`: authentication, granular authorization, validation, and dependency construction.
- Modify `backend/src/app.ts`: dependency injection and route registration.
- Create `backend/tests/platform-fee-policy-service.test.ts`: defaulting, ownership, scope, and conflicts.
- Create `backend/tests/platform-fee-policy-repository.test.ts`: versioned cloning, optimistic upsert, membership scope, and atomic audit.
- Create `backend/tests/platform-fee-policy-api.test.ts`: backoffice and merchant API/RBAC integration.
- Modify `backend/src/api/openapi.ts` and `backend/tests/openapi.test.ts`: formal schemas, paths, security, pagination, and errors.
- Modify `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`: record the managed rule family and the not-yet-wired Booking boundary.

---

### Task 1: Add the Versioned Global Family and Shop Policy Schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260828233000_platform_fee_policy_foundation/migration.sql`
- Modify: `backend/prisma/seed.ts`
- Create: `backend/tests/platform-fee-policy-schema.test.ts`

**Interfaces:**
- Consumes: existing `PlatformFeeRuleSet`, `PlatformFeeRule`, `Shop`, `User`, and default seed rule set.
- Produces: `PlatformFeeRuleSet.familyCode`, `ShopPlatformFeePayerType`, and `ShopPlatformFeePolicy`.

- [x] **Step 1: Write the failing schema and seed contract test**

Create `backend/tests/platform-fee-policy-schema.test.ts` with exact contract assertions:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("platform fee policy schema contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const seed = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");

  it("defines a versioned managed rule family and one policy per shop", () => {
    expect(schema).toContain("enum ShopPlatformFeePayerType");
    expect(schema).toContain("model ShopPlatformFeePolicy");
    expect(schema).toContain('familyCode   String?');
    expect(schema).toContain("@@unique([familyCode, version]");
    expect(schema).toMatch(/shopId\s+Int\s+@unique/);
    expect(schema).toMatch(/feeEnabled\s+Boolean\s+@default\(true\)/);
    expect(schema).toMatch(/payerType\s+ShopPlatformFeePayerType\s+@default\(SHOP\)/);
    expect(schema).toMatch(/version\s+Int\s+@default\(1\)/);
  });

  it("seeds the canonical booking family at 500 NDP without shop overrides", () => {
    expect(seed).toContain('familyCode: "booking_default"');
    expect(seed).toContain('feeType: "b_platform_fee"');
    expect(seed).toContain("baseAmountNdp: 500");
    expect(seed).not.toContain("shopPlatformFeePolicy.createMany");
  });

  it("ships an additive migration", () => {
    const migrationRoot = join(process.cwd(), "prisma/migrations");
    const migration = readFileSync(
      join(
        migrationRoot,
        existsSync(join(migrationRoot, "20260828233000_platform_fee_policy_foundation"))
          ? "20260828233000_platform_fee_policy_foundation"
          : "__missing__",
        "migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain("shop_platform_fee_policies");
    expect(migration).toContain("family_code");
    expect(migration).toContain("booking_default");
  });
});
```

Rename the generated directory to the exact plan path `20260828233000_platform_fee_policy_foundation` before the test is made green; do not keep two migrations for the same schema change.

- [x] **Step 2: Run the schema test and verify RED**

Run:

```bash
cd backend
npm test -- platform-fee-policy-schema.test.ts
```

Expected: FAIL because the enum, model, family code, and migration are absent.

- [x] **Step 3: Add the Prisma schema**

Add the managed family field and version uniqueness:

```prisma
model PlatformFeeRuleSet {
  // existing fields
  familyCode String? @map("family_code") @db.VarChar(80)

  @@unique([familyCode, version], map: "platform_fee_rule_sets_family_version_key")
  @@index([familyCode, status, effectiveFrom, effectiveTo], map: "platform_fee_rule_sets_family_effective_idx")
}
```

Add the policy enum and model:

```prisma
enum ShopPlatformFeePayerType {
  SHOP
  TECHNICIAN
}

model ShopPlatformFeePolicy {
  id          Int                      @id @default(autoincrement())
  shopId      Int                      @unique @map("shop_id")
  feeEnabled  Boolean                  @default(true) @map("fee_enabled")
  payerType   ShopPlatformFeePayerType @default(SHOP) @map("payer_type")
  version     Int                      @default(1)
  createdById Int?                     @map("created_by_id")
  updatedById Int?                     @map("updated_by_id")
  createdAt   DateTime                 @default(now()) @map("created_at")
  updatedAt   DateTime                 @updatedAt @map("updated_at")
  deletedAt   DateTime?                @map("deleted_at")

  shop      Shop  @relation(fields: [shopId], references: [id], onDelete: Restrict)
  createdBy User? @relation("ShopPlatformFeePolicyCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  updatedBy User? @relation("ShopPlatformFeePolicyUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  @@index([feeEnabled, deletedAt], map: "shop_platform_fee_policies_enabled_deleted_idx")
  @@index([payerType, deletedAt], map: "shop_platform_fee_policies_payer_deleted_idx")
  @@index([createdById], map: "shop_platform_fee_policies_created_by_idx")
  @@index([updatedById], map: "shop_platform_fee_policies_updated_by_idx")
  @@index([deletedAt], map: "shop_platform_fee_policies_deleted_idx")
  @@map("shop_platform_fee_policies")
}
```

Add inverse relations on `Shop` and `User` with the exact relation names above.

- [x] **Step 4: Make the formal seed history-safe**

Replace the current destructive name-based rewrite with a family-aware initializer:

```ts
const existingFamily = await tx.platformFeeRuleSet.findFirst({
  where: { familyCode: "booking_default", deletedAt: null },
  orderBy: { version: "desc" },
  select: { id: true }
});
if (existingFamily) return;
```

Only when the family is absent, create `familyCode: "booking_default"`, `version: 1`, the 500 NDP Booking platform fee, the 100 NDP user reward, and the existing request/penalty rules. A later seed run must never reopen an expired version, reset version to 1, soft-delete historical rules, or overwrite an operations-configured amount. Do not seed any `ShopPlatformFeePolicy` row; absence is the formal default.

- [x] **Step 5: Generate and review the migration without applying it**

Run:

```bash
cd backend
npm run prisma:migrate:dev -- --create-only --name platform_fee_policy_foundation
npm run prisma:generate
```

Rename the generated migration directory to `20260828233000_platform_fee_policy_foundation` before review so the schema contract has one deterministic path.

Before accepting the SQL, verify it is additive and contains:

```sql
ALTER TABLE `platform_fee_rule_sets` ADD COLUMN `family_code` VARCHAR(80) NULL;
CREATE TABLE `shop_platform_fee_policies` (...);
UPDATE `platform_fee_rule_sets`
SET `family_code` = 'booking_default'
WHERE `id` = (
  SELECT `id` FROM (
    SELECT `id`
    FROM `platform_fee_rule_sets`
    WHERE `name` = 'Default Booking NDP Rules' AND `deleted_at` IS NULL
    ORDER BY `id` ASC
    LIMIT 1
  ) AS `canonical_booking_default`
);
CREATE UNIQUE INDEX `platform_fee_rule_sets_family_version_key`
ON `platform_fee_rule_sets`(`family_code`, `version`);
```

The migration must not drop/recreate fee tables, delete rules, update wallets/orders, or create shop override rows.

- [x] **Step 6: Run focused verification**

Run:

```bash
cd backend
npm test -- platform-fee-policy-schema.test.ts
npm run prisma:generate
npm run build
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/*_platform_fee_policy_foundation/migration.sql backend/prisma/seed.ts backend/tests/platform-fee-policy-schema.test.ts
git commit -m "feat: add platform fee policy schema"
```

---

### Task 2: Lock Global Fee History and Define the Policy Service

**Files:**
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/services/fee-calculation.service.ts`
- Modify: `backend/src/repositories/fee-rule.repository.ts`
- Create: `backend/src/services/platform-fee-policy.service.ts`
- Modify: `backend/tests/fee-calculation-service.test.ts`
- Modify: `backend/tests/fee-rule-api.test.ts`
- Create: `backend/tests/platform-fee-policy-service.test.ts`

**Interfaces:**
- Consumes: active effective-dated `booking_default` rule-set family and authenticated identity scope.
- Produces: `GlobalBookingPlatformFeePayload`, `ShopPlatformFeePolicyPayload`, `EffectiveShopPlatformFeePolicy`, and mutation result contracts.

- [ ] **Step 1: Write failing acceptance-time and managed-family tests**

In `fee-calculation-service.test.ts`, prove that a completed Booking uses the rule effective at acceptance, not completion:

```ts
it("prices Booking platform-fee capture at acceptedAt", async () => {
  repository.ruleSets = [old500RuleSet, new700RuleSet];

  await service.calculateFee({
    ...baseInput("b_platform_fee"),
    stage: "capture",
    acceptedAt: new Date("2026-08-28T09:00:00.000Z"),
    completedAt: new Date("2026-08-29T09:00:00.000Z")
  });

  expect(repository.lastActiveRuleQuery?.at).toEqual(
    new Date("2026-08-28T09:00:00.000Z")
  );
});
```

In `fee-rule-api.test.ts`, add a managed-family fixture and assert generic update/pause returns 409 with `error.platform_fee_policy.managed_rule`.

- [ ] **Step 2: Write failing policy service tests**

Create `platform-fee-policy-service.test.ts` covering:

```ts
it("returns safe defaults when no shop policy exists", async () => {
  repository.findGlobalBookingFee.mockResolvedValue(null);
  repository.findShopPolicy.mockResolvedValue(null);

  await expect(service.getShopPolicy(operationsActor, context, 11)).resolves.toMatchObject({
    shopId: 11,
    globalAmountNdp: 500,
    globalVersion: 0,
    feeEnabled: true,
    payerType: "shop",
    policyVersion: 0,
    policySource: "default"
  });
});

it("updates only the operations-owned feeEnabled field", async () => {
  await service.updateShopFeeEnabled(operationsActor, context, 11, {
    feeEnabled: false,
    expectedVersion: 2
  });

  expect(repository.updateShopFeeEnabled).toHaveBeenCalledWith(
    expect.objectContaining({ shopId: 11, feeEnabled: false, expectedVersion: 2 })
  );
  expect(repository.updateShopPayerType).not.toHaveBeenCalled();
});

it("updates only payerType inside the active merchant identity scope", async () => {
  repository.hasMerchantShopScope.mockResolvedValue(true);
  await service.updateShopPayerType(merchantActor, context, 11, {
    payerType: "technician",
    expectedVersion: 1
  });

  expect(repository.hasMerchantShopScope).toHaveBeenCalledWith({
    scopeType: "merchant_account",
    scopeId: 4,
    shopId: 11
  });
});
```

Also prove version conflict maps to `PLATFORM_FEE_POLICY_VERSION_CONFLICT`, missing canonical global family maps to `PLATFORM_FEE_POLICY_CONFIG_CONFLICT`, and a non-shop/non-merchant identity receives `IDENTITY_FORBIDDEN`.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd backend
npm test -- fee-calculation-service.test.ts fee-rule-api.test.ts platform-fee-policy-service.test.ts
```

Expected: FAIL because the new service/contracts and pricing lock are absent.

- [ ] **Step 4: Add explicit error codes**

Append unique codes after the existing 409xx range:

```ts
PLATFORM_FEE_POLICY_VERSION_CONFLICT: 40932,
PLATFORM_FEE_POLICY_CONFIG_CONFLICT: 40933,
PLATFORM_FEE_MANAGED_RULE_CONFLICT: 40934,
```

Use message keys:

```text
error.platform_fee_policy.version_conflict
error.platform_fee_policy.config_conflict
error.platform_fee_policy.managed_rule
```

- [ ] **Step 5: Make global fee capture acceptance-time stable**

Extend `PlatformFeeRuleSetPayload` with `familyCode: string | null` and map it in `FeeRuleRepository`. Change only Booking platform-fee capture time:

```ts
private resolveCalculationTime(input: FeeCalculationInput): Date {
  if (input.feeType === "b_platform_fee" && input.stage === "capture" && input.acceptedAt) {
    return input.acceptedAt;
  }
  if (input.stage === "capture" && input.completedAt) {
    return input.completedAt;
  }
  if (input.stage === "hold" && input.acceptedAt) {
    return input.acceptedAt;
  }
  return input.scheduledStartAt ?? input.completedAt ?? input.acceptedAt ?? new Date();
}
```

Before generic rule-set update/activate/pause, reject any `familyCode === "booking_default"`. The dedicated policy repository in Task 3 becomes its only write path.

- [ ] **Step 6: Implement the policy service contract**

Use these public types:

```ts
export type ShopPlatformFeePayer = "shop" | "technician";
export type PlatformFeePolicySource = "persisted" | "default";

export interface GlobalBookingPlatformFeePayload {
  amountNdp: number;
  version: number;
  effectiveFrom: string | null;
  source: PlatformFeePolicySource;
}

export interface ShopPlatformFeePolicyPayload {
  shopId: number;
  shopPublicId: string | null;
  shopName: string;
  globalAmountNdp: number;
  globalVersion: number;
  feeEnabled: boolean;
  payerType: ShopPlatformFeePayer;
  policyVersion: number;
  policySource: PlatformFeePolicySource;
  updatedAt: string | null;
}
```

The repository port must separate the three write methods:

```ts
updateGlobalAmount(input: GlobalAmountMutationInput): Promise<PolicyMutationResult<GlobalBookingPlatformFeePayload>>;
updateShopFeeEnabled(input: ShopFeeEnabledMutationInput): Promise<PolicyMutationResult<ShopPolicyRecord>>;
updateShopPayerType(input: ShopPayerMutationInput): Promise<PolicyMutationResult<ShopPolicyRecord>>;
```

Do not expose a general `updatePolicy` method.

- [ ] **Step 7: Run focused verification**

Run:

```bash
cd backend
npm test -- fee-calculation-service.test.ts fee-rule-api.test.ts platform-fee-policy-service.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/constants/error-codes.ts backend/src/services/fee-calculation.service.ts backend/src/repositories/fee-rule.repository.ts backend/src/services/platform-fee-policy.service.ts backend/tests/fee-calculation-service.test.ts backend/tests/fee-rule-api.test.ts backend/tests/platform-fee-policy-service.test.ts
git commit -m "feat: define versioned platform fee policy"
```

---

### Task 3: Implement the Prisma Policy Repository and Atomic Audit

**Files:**
- Create: `backend/src/repositories/platform-fee-policy.repository.ts`
- Create: `backend/tests/platform-fee-policy-repository.test.ts`

**Interfaces:**
- Consumes: `PlatformFeePolicyRepositoryPort`, `AuditLogCreateInput`, Prisma client/transaction client.
- Produces: real MySQL reads, paginated shop projections, effective-dated rule cloning, optimistic policy mutation, and scoped membership checks.

- [ ] **Step 1: Write failing repository tests**

Cover these exact database behaviors:

1. `findGlobalBookingFee(at)` selects `familyCode=booking_default`, `status=active`, `effectiveFrom <= at`, and `effectiveTo > at OR null`.
2. `updateGlobalAmount` guards `expectedVersion`, closes the old version at one transaction timestamp, clones the full rule set/rules/tiers/time windows, changes only the Booking `b_platform_fee.baseAmountNdp`, increments version, and writes audit.
3. `listShopPolicies` pages over non-deleted shops and left-loads the optional non-deleted policy/public identifier.
4. `updateShopFeeEnabled` with `expectedVersion=0` creates a row with `payerType=SHOP`; an existing row changes only `feeEnabled` and increments version.
5. `updateShopPayerType` changes only `payerType`, revives no unrelated deleted row, and increments version.
6. A shop-scope identity only matches its exact shop.
7. A merchant-account scope matches only an active, non-deleted `MerchantShopMembership` for that account/shop.
8. Every successful write creates `auditLog` inside the same `$transaction`; a version miss creates no audit row.

Use the existing mock-Prisma transaction style from `affiliate-profile.repository.test.ts`.

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```bash
cd backend
npm test -- platform-fee-policy-repository.test.ts
```

Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement history-safe global amount updates**

The update algorithm must be one transaction:

```ts
const current = await tx.platformFeeRuleSet.findFirst({
  where: {
    familyCode: "booking_default",
    version: input.expectedVersion,
    status: "active",
    deletedAt: null,
    effectiveFrom: { lte: changedAt },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: changedAt } }]
  },
  include: fullRuleSetInclude
});
```

Then:

1. Require exactly one active Booking `b_platform_fee` rule in the family.
2. `updateMany` the current set with `effectiveTo=changedAt` guarded by id/version/current end.
3. Create version `expectedVersion + 1`, `effectiveFrom=changedAt`, `effectiveTo=null`, and clone all rules.
4. Change only the cloned Booking `b_platform_fee.baseAmountNdp` to `amountNdp`.
5. Clone tiers and time windows with new rule IDs.
6. Create the audit record with previous/next amount, previous/next version, and effective timestamp.
7. Return the newly created version.

Never overwrite the old rule or reuse old child IDs.

- [ ] **Step 4: Implement default-aware shop reads and optimistic writes**

The list query must page `Shop`, not policy rows, so shops without overrides remain visible. Map absent policies to `version=0`, `feeEnabled=true`, `payerType=shop` in the service.

For create:

```ts
if (input.expectedVersion === 0) {
  await tx.shopPlatformFeePolicy.create({
    data: {
      shopId: input.shopId,
      feeEnabled: input.feeEnabled,
      payerType: "SHOP",
      version: 1,
      createdById: input.actorUserId,
      updatedById: input.actorUserId
    }
  });
}
```

For update, use `updateMany` with `shopId`, `version`, and `deletedAt:null`; increment `version`. Treat a unique-create race or zero update count as a version conflict, never as a retry that overwrites another actor.

- [ ] **Step 5: Run focused verification**

Run:

```bash
cd backend
npm test -- platform-fee-policy-repository.test.ts platform-fee-policy-service.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/platform-fee-policy.repository.ts backend/tests/platform-fee-policy-repository.test.ts
git commit -m "feat: persist audited platform fee policies"
```

---

### Task 4: Expose the Backoffice Policy APIs with RBAC

**Files:**
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/src/validators/platform-fee-policy.validator.ts`
- Create: `backend/src/controllers/platform-fee-policy.controller.ts`
- Create: `backend/src/routes/platform-fee-policy.routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/platform-fee-policy-api.test.ts`
- Modify: `backend/tests/platform-fee-policy-schema.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/v1/backoffice/platform-fee-policy`
  - `PATCH /api/v1/backoffice/platform-fee-policy`
  - `GET /api/v1/backoffice/shop-platform-fee-policies`
  - `PATCH /api/v1/backoffice/shops/:shopId/platform-fee-policy`

- [ ] **Step 1: Write failing permission and API tests**

Add permission assertions:

```ts
const backofficeCodes = [
  "backoffice:platform-fee-policy:read",
  "backoffice:platform-fee-policy:write"
];
```

Assert:

- `admin` has both through the system catalog.
- `operator` has read/write.
- `finance` has read only.
- `support`, `customer`, `technician`, `merchant_owner`, and `merchant_staff` do not receive backoffice writes.

API tests must prove:

- authenticated operator can read global configuration and a paginated shop list;
- authenticated operator can change the global amount with `expectedVersion`;
- authenticated operator can change only `feeEnabled` for one shop;
- body fields such as `payerType`, `shopId`, or unknown properties return 400 on the operations mutation;
- finance read succeeds but write returns 403;
- missing token returns 401;
- stale version returns structured 409;
- list response uses `{list,total,page,page_size}`.

- [ ] **Step 2: Run API tests and verify RED**

Run:

```bash
cd backend
npm test -- platform-fee-policy-schema.test.ts platform-fee-policy-api.test.ts
```

Expected: FAIL because permissions and routes are absent.

- [ ] **Step 3: Add strict Zod validators**

Use `.strict()` for writes:

```ts
export const globalPlatformFeeUpdateBodySchema = z.object({
  amountNdp: z.number().int().min(0).max(10_000_000),
  expectedVersion: z.number().int().positive()
}).strict();

export const shopFeeEnabledUpdateBodySchema = z.object({
  feeEnabled: z.boolean(),
  expectedVersion: z.number().int().min(0)
}).strict();
```

The list query accepts `page`, `pageSize<=100`, optional trimmed `keyword`, and optional `feeEnabled` parsed explicitly from the strings `true|false` (do not use JavaScript truthiness for `"false"`). The numeric `shopId` path param must be positive.

- [ ] **Step 4: Add permissions and role assignments**

Add the two backoffice permissions to `SYSTEM_PERMISSIONS`. Add both to `BACKOFFICE_REAL_DATA_PERMISSION_CODES` so `operator` receives them; add only read to `FINANCE_PERMISSION_CODES`. `admin` continues to receive all system permissions.

- [ ] **Step 5: Implement controller, route, and dependency injection**

Add `platformFeePolicyRepository?: PlatformFeePolicyRepositoryPort` to `AppDependencies`. Construct the service with `PlatformFeePolicyRepository` and `AuditLogService`/`createInput` support. Register `createPlatformFeePolicyRoutes` after fee-rule routes.

Keep controllers limited to parsing already-validated inputs, `getAuthenticatedAccess`, `getRequestContext`, `successResponse`, and status codes.

- [ ] **Step 6: Run focused verification**

Run:

```bash
cd backend
npm test -- platform-fee-policy-schema.test.ts platform-fee-policy-api.test.ts user-management-seed.test.ts
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/constants/permissions.constants.ts backend/src/validators/platform-fee-policy.validator.ts backend/src/controllers/platform-fee-policy.controller.ts backend/src/routes/platform-fee-policy.routes.ts backend/src/app.ts backend/tests/platform-fee-policy-api.test.ts backend/tests/platform-fee-policy-schema.test.ts
git commit -m "feat: expose backoffice platform fee policy"
```

---

### Task 5: Expose Merchant/Shop Payer APIs and OpenAPI

**Files:**
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/validators/platform-fee-policy.validator.ts`
- Modify: `backend/src/controllers/platform-fee-policy.controller.ts`
- Modify: `backend/src/routes/platform-fee-policy.routes.ts`
- Modify: `backend/tests/platform-fee-policy-api.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/v1/merchant-admin/shops/:shopId/platform-fee-policy`
  - `PATCH /api/v1/merchant-admin/shops/:shopId/platform-fee-policy/payer`

- [ ] **Step 1: Write failing merchant scope and permission tests**

Add API cases for:

- shop identity can read and update its exact shop;
- merchant-account identity can read/update each shop with an active `MerchantShopMembership` in that current account;
- the same user switched to a different merchant-account identity cannot reuse another account's shop access;
- deleted membership, foreign shop, customer identity, and technician identity return 403;
- `merchant_owner` and `merchant_staff` receive merchant policy read/write permissions;
- write body accepts only `payerType: shop|technician` and `expectedVersion`;
- `feeEnabled`, `amountNdp`, `shopId`, and unknown properties return 400;
- stale version returns 409 and does not call audit/mutation.

Add OpenAPI assertions for all six operations on the four paths from Tasks 4–5, bearer security, strict request schemas, pagination, and `400/401/403/409` responses.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd backend
npm test -- platform-fee-policy-api.test.ts openapi.test.ts
```

Expected: FAIL because merchant routes, permissions, and OpenAPI paths are absent.

- [ ] **Step 3: Add merchant permissions and validator**

Add:

```text
merchant-admin:platform-fee-policy:read
merchant-admin:platform-fee-policy:write
```

Assign both only to `merchant_owner` and `merchant_staff` through `MERCHANT_ADMIN_REAL_DATA_PERMISSION_CODES`.

Add the strict body:

```ts
export const shopFeePayerUpdateBodySchema = z.object({
  payerType: z.enum(["shop", "technician"]),
  expectedVersion: z.number().int().min(0)
}).strict();
```

- [ ] **Step 4: Register merchant routes and scope checks**

The service must authorize current identity before repository mutation:

```ts
if (actor.currentIdentityScopeType === "shop") {
  if (actor.currentIdentityScopeId !== shopId) {
    throw this.identityForbidden();
  }
} else if (actor.currentIdentityScopeType === "merchant_account") {
  const merchantAccountId = actor.currentIdentityScopeId;
  if (
    typeof merchantAccountId !== "number" ||
    !(await repository.hasMerchantShopScope({
    scopeType: "merchant_account",
    scopeId: merchantAccountId,
    shopId
    }))
  ) {
    throw this.identityForbidden();
  }
} else {
  throw this.identityForbidden();
}
```

Recheck the membership inside the write transaction; the precheck alone is not sufficient.

- [ ] **Step 5: Document formal API contracts**

Add OpenAPI component schemas for:

- `GlobalBookingPlatformFee`
- `ShopPlatformFeePolicy`
- `ShopPlatformFeePolicyPage`
- `GlobalPlatformFeeUpdateRequest`
- `ShopFeeEnabledUpdateRequest`
- `ShopFeePayerUpdateRequest`

All request schemas use `additionalProperties:false`. Response payloads include `shopPublicId` and never label numeric `shopId` as NeeDo ID.

- [ ] **Step 6: Run focused verification**

Run:

```bash
cd backend
npm test -- platform-fee-policy-api.test.ts platform-fee-policy-service.test.ts openapi.test.ts user-management-seed.test.ts
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/constants/permissions.constants.ts backend/src/validators/platform-fee-policy.validator.ts backend/src/controllers/platform-fee-policy.controller.ts backend/src/routes/platform-fee-policy.routes.ts backend/tests/platform-fee-policy-api.test.ts backend/src/api/openapi.ts backend/tests/openapi.test.ts
git commit -m "feat: expose merchant platform fee payer policy"
```

---

### Task 6: Apply Safely, Reconcile Real MySQL, and Close the Microstep

**Files:**
- Modify: `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`
- Verify only: all files from Tasks 1–5

**Interfaces:**
- Consumes: reviewed migration and existing local formal MySQL.
- Produces: applied schema evidence, canonical global fee evidence, zero unintended shop overrides, and a documented boundary for the next microstep.

- [ ] **Step 1: Run migration preflight without business writes**

Run:

```bash
cd backend
npm run prisma:status
test -f prisma/migrations/20260828233000_platform_fee_policy_foundation/migration.sql
```

Do not generate a duplicate migration. Review `migration.sql` and capture pre-apply read-only counts with Prisma/approved MySQL tooling:

```text
platform_fee_rule_sets rows with family_code=booking_default: expected 0 before backfill or 1 if already applied
active Default Booking NDP Rules sets: expected exactly 1
active Booking b_platform_fee rules in that set: expected exactly 1
current b_platform_fee base amount: expected 500
shop_platform_fee_policies: table absent before apply
```

Stop if the active default family/rule count is not exactly one; do not guess which rule is canonical.

- [ ] **Step 2: Apply the migration to the local formal database**

Run:

```bash
cd backend
npm run prisma:migrate:deploy
npm run prisma:status
```

Expected: migration applies once and status reports the schema up to date.

- [ ] **Step 3: Reconcile post-apply state**

Read-only reconciliation must prove:

```text
canonical family rows: 1 current effective booking_default version
canonical Booking b_platform_fee amount: 500 NDP
canonical user_reward amount: 100 NDP
shop policy rows: 0
effective shop default for sampled real shops: enabled=true, payer=shop, version=0
wallet balances/holds/ledger/order financial counts: unchanged by this migration
```

Do not create the “all real test shops disabled” rows here; that is microstep 6 from the approved design and requires its own dry-run/apply plan after Booking consumes the policy safely.

- [ ] **Step 4: Run the full backend gate**

Run:

```bash
cd backend
npm run prisma:generate
npm test -- platform-fee-policy-schema.test.ts platform-fee-policy-service.test.ts platform-fee-policy-repository.test.ts platform-fee-policy-api.test.ts fee-calculation-service.test.ts fee-rule-api.test.ts openapi.test.ts user-management-seed.test.ts
npm run lint
npm run build
npm test
```

Expected: all commands PASS. If full Jest exposes an unrelated pre-existing failure, capture the exact failing suite and prove focused platform-fee suites remain green; do not claim the global gate passed.

- [ ] **Step 5: Scan for prohibited placeholders and accidental mock expansion**

Run:

```bash
rg -n "TODO|FIXME|not implemented|mock|demo|placeholder|localStorage" backend/src/services/platform-fee-policy.service.ts backend/src/repositories/platform-fee-policy.repository.ts backend/src/controllers/platform-fee-policy.controller.ts backend/src/routes/platform-fee-policy.routes.ts backend/src/validators/platform-fee-policy.validator.ts
git diff --check
```

Expected: no prohibited implementation placeholders; `git diff --check` is clean. Test-file mocks used only for unit isolation are allowed and must not appear in production source.

- [ ] **Step 6: Update the finance reconciliation documentation**

Document:

- `booking_default` is the stable managed family.
- global amount changes create effective-dated versions.
- Booking platform-fee capture resolves by `acceptedAt`.
- shop policy absence means enabled/shop payer.
- shop policies are persisted and API-visible but are not yet consumed by Booking/Ledger.
- the next microstep must add payer wallet snapshot, zero-fee no-hold behavior, negative balance/debt, and 7-day reward state before enabling shop overrides in real test data.

- [ ] **Step 7: Commit**

```bash
git add docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md
git commit -m "docs: record platform fee policy foundation"
```

- [ ] **Step 8: Report the microstep gate honestly**

Report separately:

```text
schema/migration: generated, reviewed, applied status
canonical family count and current amount
shop policy row count and effective fallback
focused tests / full tests / lint / build
wallet/order/hold/ledger counts unchanged
not yet implemented: shop policy consumption, technician wallet payer, zero-fee no-hold, debt/top-up/reward, pause acceptance, single-PENDING replacement, frontend pages, test-shop policy apply, browser acceptance
```

Do not describe this backend foundation as the completed platform-fee feature.

---

## Plan Self-Review Checklist

- [ ] Every approved microstep-1 rule maps to a model, service, repository, API, permission, test, or reconciliation step.
- [ ] Global amount history is immutable after use and capture resolves by acceptance time.
- [ ] Operations and merchant field ownership cannot be bypassed with a shared mutation body.
- [ ] Merchant scope is current-identity scoped and rechecked transactionally.
- [ ] Missing policy has one explicit safe fallback; no mock fallback exists.
- [ ] Every write has Zod, RBAC, optimistic versioning, transactional audit, OpenAPI, and tests.
- [ ] Lists are paginated and expose real public shop IDs for display.
- [ ] Migration apply is preceded by dry-run SQL review and deterministic data-count checks.
- [ ] The plan does not mutate wallets, orders, real test-shop policy rows, or membership data.
- [ ] The plan explicitly preserves the boundary to microsteps 2–6.
