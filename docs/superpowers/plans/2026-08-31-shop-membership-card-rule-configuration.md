# Shop Membership Card Rule Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver microstep A of the approved membership-card design: operations-managed membership reward fee versions plus shop-scoped card-plan drafts, strict NDP-only reward rules, server-side cost preview, immutable publish, RBAC, audit, OpenAPI, and merchant/operations UI.

**Architecture:** Extend the existing shop-membership module instead of creating a parallel member system. Persist one versioned membership-reward fee family and shop-owned card plans whose editable `DRAFT` version becomes immutable when published; every rule is a typed JSON payload validated by a shared server-side discriminated union and preview evaluator. Merchant and operations writes stay in Route → Controller → Service → Repository layers, resolve identity scope from the JWT, and write business state plus AuditLog in one Prisma transaction. This microstep previews reward and fee amounts only: it does not issue cards, alter card balances/uses, reserve NDP, debit a wallet, or credit a customer.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Node.js 22, Express 4, Prisma 7/MySQL 8, Zod 3, JWT/RBAC, OpenAPI 3.1, Jest/Supertest, Vitest.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-31-shop-membership-card-rules-design.md`; this plan implements only microstep A.
- Work from an isolated `codex/shop-membership-card-rules` worktree created from the latest main commit; do not modify or stage unrelated files in the shared checkout.
- Use red-green-refactor TDD and one reviewable commit per task.
- Do not add mock arrays, demo endpoints, browser financial state, localStorage drafts, fake permissions, or a second shop-membership UI.
- All reward outputs are NDP. Do not add discounts, member prices, coupons, gifts, free services, stored-value bonuses, or automatic count changes.
- Publishing or previewing a rule never reserves, freezes, debits, or credits NDP. Wallet settlement starts in microstep C only.
- The initial operations fee version is `1000 bps` (`10%`). Customer reward uses `floor`; platform fee uses `ceil(customerRewardNdp × feeRateBps / 10000)`.
- A published plan version is immutable. A later operations fee change never reprices an already published plan version.
- Every table has `id`, `createdAt`, `updatedAt`, and `deletedAt`; all foreign keys and active list predicates are indexed and all deletes are soft deletes.
- All endpoints use `/api/v1`, strict Zod request validation, JWT authentication, exact permission middleware, safe error keys, pagination for lists, and OpenAPI.
- Merchant shop scope comes only from the authenticated current shop identity. Do not accept `shopId` in merchant request bodies or queries.
- All membership surfaces retain the visible `Test` badge and five-language support (`zh`, `zh-Hant`, `ja`, `en`, `ko`).
- This microstep does not issue cards, adjust amount/count/expiry, execute rewards, top up, redeem, refund, reverse ledger entries, or notify customers.
- Review generated migration SQL before applying it. Apply and verify only against the configured local non-production MySQL database.

---

## File Structure

- Modify `backend/prisma/schema.prisma`: add fee-policy, card-plan, immutable plan-version, and typed rule persistence.
- Create `backend/prisma/migrations/20260831150000_shop_membership_card_rule_configuration/migration.sql`: additive tables, keys, indexes, and initial 10% fee version.
- Modify `backend/src/constants/permissions.constants.ts`: add plan read/manage/publish and membership-reward-fee permissions with role assignments.
- Modify `backend/src/constants/error-codes.ts`: add plan, version, rule, fee-policy, and concurrency error codes.
- Create `backend/src/domain/shop-membership-reward-rule.ts`: strict rule unions, validation, deterministic preview calculation, summaries, and caps.
- Create `backend/src/repositories/shop-membership-card-plan.repository.ts`: shop-scoped reads, draft persistence, preview facts, fee-policy history, atomic publish, and audit.
- Create `backend/src/services/shop-membership-card-plan.service.ts`: identity checks, rule normalization, preview, publish lifecycle, and public DTO mapping.
- Create `backend/src/validators/shop-membership-card-plan.validator.ts`: strict params/query/body schemas shared with the controller.
- Create `backend/src/controllers/shop-membership-card-plan.controller.ts`: request/response adapter only.
- Create `backend/src/routes/shop-membership-card-plan.routes.ts`: exact authentication, RBAC, validation, and dependency construction.
- Modify `backend/src/app.ts`: inject/register the new repository and routes.
- Modify `backend/src/api/openapi.ts`: publish every rule discriminator, plan DTO, fee DTO, preview request/response, and route.
- Create `backend/tests/shop-membership-card-plan-schema.test.ts`: schema, migration, seed, and permission contracts.
- Create `backend/tests/shop-membership-reward-rule.test.ts`: formula, caps, exclusions, safety, and fee rounding.
- Create `backend/tests/shop-membership-card-plan.repository.test.ts`: shop scope, paging, immutable publish, optimistic conflicts, and atomic audit.
- Create `backend/tests/shop-membership-card-plan.service.test.ts`: identity, validation, preview, version, and safe DTO behavior.
- Create `backend/tests/shop-membership-card-plan-api.test.ts`: authentication, permissions, Zod, scope, status, and response envelopes.
- Modify `backend/tests/shop-membership-openapi.test.ts`: exact new paths, security, schemas, and error contracts.
- Create `backend/scripts/check-shop-membership-card-plan-flow.ts`: guarded real-MySQL create/edit/preview/publish/isolation/audit/cleanup checker.
- Modify `backend/package.json`: add `check:shop-membership-card-plan-flow`.
- Modify `src/features/shop-member/api.ts` and `src/features/shop-member/api.test.ts`: formal plan, preview, and publish adapters.
- Create `src/features/shop-member/cardPlanModel.ts` and `src/features/shop-member/cardPlanModel.test.ts`: UI draft parsing, validation, and server DTO conversion.
- Create `src/features/shop-member/CardPlanWorkspace.tsx` and `src/features/shop-member/CardPlanWorkspace.test.tsx`: plan list and step editor.
- Modify `src/features/shop-member/ShopMemberCenterPage.tsx` and its test: `已发会员卡 / 卡方案` secondary navigation and permission states.
- Modify `src/features/shop-member/i18n.ts` and its test: all new customer-visible copy in five languages.
- Create `src/api/membershipRewardFee.ts` and its test: operations fee history/summary/create adapters.
- Create `src/pages/admin/MembershipRewardFeePage.tsx`, `membershipRewardFeeModel.ts`, `membershipRewardFeeCopy.ts`, and tests: operations rate UI.
- Modify `src/components/admin/AdminLayout.tsx`, `src/App.tsx`, and `src/pages/admin/AdminCapabilityRoutes.test.ts`: finance navigation and protected route.
- Modify `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`, `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`, and `docs/api.md`: implemented boundary, API, permissions, and deferred settlement.

---

### Task 1: Add the Versioned Schema and Permission Contracts

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260831150000_shop_membership_card_rule_configuration/migration.sql`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/shop-membership-card-plan-schema.test.ts`

**Interfaces:**
- Produces Prisma enums `MembershipRewardFeePolicyStatus`, `ShopMembershipCardPlanStatus`, `ShopMembershipCardPlanVersionStatus`, `ShopMembershipCardPlanValidityMode`, `ShopMembershipRewardRuleGroup`, and `ShopMembershipRewardRuleKind`.
- Produces models `MembershipRewardFeePolicyVersion`, `ShopMembershipCardPlan`, `ShopMembershipCardPlanVersion`, and `ShopMembershipRewardRule`.
- Produces permissions `shop.member.card_plan.view`, `shop.member.card_plan.manage`, `shop.member.card_plan.publish`, `page:backoffice-membership-reward-fee`, and `button:backoffice-membership-reward-fee-create`.

- [ ] **Step 1: Write the failing schema contract test**

Create a test that reads `schema.prisma`, the exact migration path, and the permission catalog. Assert all four models exist; every table includes soft-delete timestamps; the fee seed is 1000 bps; plan version contains `platformFeeRateBps`; rule kind includes all ten approved kinds; and merchant staff receives view only while merchant owner receives view/manage/publish.

```ts
expect(schema).toContain("model MembershipRewardFeePolicyVersion");
expect(schema).toContain("model ShopMembershipCardPlanVersion");
expect(schema).toContain("FIXED_PER_COMPLETION");
expect(schema).toContain("CONSECUTIVE_MONTH_BONUS");
expect(migration).toContain("VALUES (UUID(), 1, 1000, 'active'");
expect(rolePermissionAssignments.merchant_staff).toContain("shop.member.card_plan.view");
expect(rolePermissionAssignments.merchant_staff).not.toContain("shop.member.card_plan.manage");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --prefix backend test -- shop-membership-card-plan-schema.test.ts`

Expected: FAIL because the models, migration, and permission codes do not exist.

- [ ] **Step 3: Add the exact Prisma models**

Use these persistence invariants:

```prisma
model MembershipRewardFeePolicyVersion {
  id            Int       @id @default(autoincrement())
  publicId      String    @unique @default(uuid()) @map("public_id") @db.Char(36)
  version       Int       @unique
  feeRateBps    Int       @map("fee_rate_bps")
  status        MembershipRewardFeePolicyStatus @default(ACTIVE)
  effectiveFrom DateTime  @map("effective_from")
  effectiveTo   DateTime? @map("effective_to")
  activeKey     String?   @unique @map("active_key") @db.VarChar(80)
  reason        String    @db.VarChar(500)
  createdById   Int?      @map("created_by_id")
  updatedById   Int?      @map("updated_by_id")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  deletedAt     DateTime? @map("deleted_at")
  planVersions  ShopMembershipCardPlanVersion[]
  // createdBy/updatedBy relations plus indexes
}

model ShopMembershipCardPlan {
  id               Int       @id @default(autoincrement())
  publicId         String    @unique @default(uuid()) @map("public_id") @db.Char(36)
  shopId           Int       @map("shop_id")
  status           ShopMembershipCardPlanStatus @default(DRAFT)
  currentVersionId Int?      @unique @map("current_version_id")
  createdById      Int?      @map("created_by_id")
  updatedById      Int?      @map("updated_by_id")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  deletedAt        DateTime? @map("deleted_at")
  // shop, versions, currentVersion, createdBy, updatedBy relations plus indexes
}

model ShopMembershipCardPlanVersion {
  id                       Int       @id @default(autoincrement())
  publicId                 String    @unique @default(uuid()) @map("public_id") @db.Char(36)
  planId                   Int       @map("plan_id")
  version                  Int
  status                   ShopMembershipCardPlanVersionStatus @default(DRAFT)
  draftKey                 String?   @unique @map("draft_key") @db.VarChar(80)
  lockVersion              Int       @default(1) @map("lock_version")
  name                     String    @db.VarChar(120)
  description              String?   @db.VarChar(500)
  cardType                 ShopMembershipCardType @map("card_type")
  validityMode             ShopMembershipCardPlanValidityMode @map("validity_mode")
  validityDays             Int?      @map("validity_days")
  fixedExpiryAt            DateTime? @map("fixed_expiry_at")
  minInitialPrincipalJpy   Int?      @map("min_initial_principal_jpy")
  maxInitialPrincipalJpy   Int?      @map("max_initial_principal_jpy")
  minInitialUses           Int?      @map("min_initial_uses")
  maxInitialUses           Int?      @map("max_initial_uses")
  rewardCaps               Json      @map("reward_caps")
  platformFeePolicyId      Int?      @map("platform_fee_policy_id")
  platformFeeRateBps       Int?      @map("platform_fee_rate_bps")
  publishedById            Int?      @map("published_by_id")
  publishedAt              DateTime? @map("published_at")
  createdAt                DateTime  @default(now()) @map("created_at")
  updatedAt                DateTime  @updatedAt @map("updated_at")
  deletedAt                DateTime? @map("deleted_at")
  // plan, fee policy, rules, user relations and indexes
  @@unique([planId, version])
}

model ShopMembershipRewardRule {
  id            Int       @id @default(autoincrement())
  publicId      String    @unique @default(uuid()) @map("public_id") @db.Char(36)
  planVersionId Int       @map("plan_version_id")
  kind          ShopMembershipRewardRuleKind
  ruleGroup     ShopMembershipRewardRuleGroup @map("rule_group")
  config        Json
  sortOrder     Int       @default(0) @map("sort_order")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  deletedAt     DateTime? @map("deleted_at")
  // planVersion relation and indexes
}
```

Add explicit MySQL `CHECK` constraints in the migration for `fee_rate_bps BETWEEN 0 AND 10000`, positive validity/initial ranges, and `min <= max`. Seed exactly one active fee row with `version=1`, `fee_rate_bps=1000`, `active_key='membership_reward'`, and reason `Initial membership reward platform fee` only when none exists.

- [ ] **Step 4: Generate the client and inspect the SQL without applying it**

Run: `npm --prefix backend run prisma:generate`

Expected: Prisma client generation succeeds. Manually confirm the migration creates only the four new tables/enums/relations and permission seed inserts; it must not update wallets, ledger rows, orders, cards, amounts, or uses.

- [ ] **Step 5: Run the focused test and commit**

Run: `npm --prefix backend test -- shop-membership-card-plan-schema.test.ts`

Expected: PASS.

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260831150000_shop_membership_card_rule_configuration/migration.sql backend/src/constants/permissions.constants.ts backend/tests/shop-membership-card-plan-schema.test.ts
git commit -m "feat: add membership card plan schema"
```

---

### Task 2: Implement Strict NDP Reward Rules and Cost Preview

**Files:**
- Create: `backend/src/domain/shop-membership-reward-rule.ts`
- Create: `backend/tests/shop-membership-reward-rule.test.ts`

**Interfaces:**
- Produces `membershipRewardRuleSchema`, `membershipRewardRuleListSchema`, `MembershipRewardRuleInput`, `MembershipRewardPreviewFacts`, `MembershipRewardPreviewResult`, `evaluateMembershipRewardRules`, and `summarizeMembershipRewardRule`.
- The evaluator is pure and never imports Prisma, Wallet, Ledger, or Express.

- [ ] **Step 1: Write failing formula, composition, and safety tests**

Cover all ten rule kinds, excluded service precedence, category/service scope, one base rule only, repeated/once-only milestone facts supplied by the server, per-order cap, percentage floor, fee ceil, zero-reward zero-fee, safe-integer overflow, and rejection of every non-NDP output key.

```ts
expect(evaluateMembershipRewardRules({
  rules: [{ kind: "fixed_per_completion", rewardNdp: 1000, ...scopeAll }],
  facts: baseFacts,
  platformFeeRateBps: 1000
})).toMatchObject({ customerRewardNdp: 1000, platformFeeNdp: 100, totalShopDebitNdp: 1100 });

expect(() => membershipRewardRuleSchema.parse({
  kind: "completion_milestone_bonus",
  everyCompletions: 5,
  gift: "free_service"
})).toThrow();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --prefix backend test -- shop-membership-reward-rule.test.ts`

Expected: FAIL because the domain module does not exist.

- [ ] **Step 3: Implement exact strict discriminated rule shapes**

Every rule includes this strict shared scope:

```ts
const scopeSchema = z.object({
  servicePublicIds: z.array(z.string().uuid()).max(100).default([]),
  categoryCodes: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  excludedServicePublicIds: z.array(z.string().uuid()).max(100).default([]),
  excludedCategoryCodes: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  activeFrom: z.string().datetime().nullable().default(null),
  activeTo: z.string().datetime().nullable().default(null)
}).strict();
```

Use `z.discriminatedUnion("kind", [...])` with these exact rule-specific fields:

```text
fixed_per_completion: rewardNdp
percent_of_eligible_amount: rewardRateBps
spend_block: blockAmountJpy, rewardNdpPerBlock
first_card_use_bonus: rewardNdp
service_scope_bonus: rewardNdp OR rewardRateBps (exactly one non-zero)
completion_milestone_bonus: everyCompletions, rewardNdp, repeat
spend_milestone_bonus: thresholdJpy, rewardNdp, repeat
birthday_month_bonus: rewardNdp, annualLimit
schedule_window_bonus: rewardNdp, timezone='Asia/Tokyo', daysOfWeek, startTime, endTime
consecutive_month_bonus: consecutiveMonths, rewardNdp
```

Plan-level `caps` are strict non-negative nullable integers: `perOrderNdp`, `perDayNdp`, `perMonthNdp`, and `lifetimeNdp`. Require exactly one base kind and up to 20 bonus rules. Deduplicate all public-ID arrays, reject inverted active windows, and never accept `discount`, `gift`, `freeService`, `amountBonus`, or `usesBonus` because `.strict()` rejects unknown keys.

- [ ] **Step 4: Implement deterministic evaluation**

`MembershipRewardPreviewFacts` contains server-supplied `eligibleAmountJpy`, service public ID, category code, completion/spend/history counters, birthday month, scheduled ISO time, and already rewarded daily/monthly/lifetime totals. Return ordered rule hits with `ruleIndex`, `kind`, `basis`, and `rewardNdp`; then apply the smallest remaining cap. Use checked integer helpers and throw `error.shop_membership_card_plan.amount_out_of_range` before exceeding `Number.MAX_SAFE_INTEGER`.

- [ ] **Step 5: Run tests and commit**

Run: `npm --prefix backend test -- shop-membership-reward-rule.test.ts`

Expected: PASS.

```bash
git add backend/src/domain/shop-membership-reward-rule.ts backend/tests/shop-membership-reward-rule.test.ts
git commit -m "feat: add membership reward rule evaluator"
```

---

### Task 3: Add Shop-Scoped Draft, Preview, Publish, and Fee Services

**Files:**
- Modify: `backend/src/constants/error-codes.ts`
- Create: `backend/src/repositories/shop-membership-card-plan.repository.ts`
- Create: `backend/src/services/shop-membership-card-plan.service.ts`
- Test: `backend/tests/shop-membership-card-plan.repository.test.ts`
- Test: `backend/tests/shop-membership-card-plan.service.test.ts`

**Interfaces:**
- Repository produces `listPlans`, `findPlan`, `createPlanWithDraft`, `updateDraftWithAudit`, `retirePlanWithAudit`, `listFeePolicies`, `getFeePolicySummary`, `createFeePolicyVersionWithAudit`, `validateShopRuleReferences`, and `publishDraftWithAudit`.
- Service methods always accept `AuthenticatedAccessContext` first and write methods also accept `AuthRequestContext`.
- Public plan DTOs never expose numeric `shopId`, `createdById`, `updatedById`, internal rule IDs, or fee-policy numeric IDs.

- [ ] **Step 1: Write failing repository scope and transaction tests**

Assert plan queries always include `shopId` and `deletedAt: null`; lists use one count plus one bounded query; draft updates include `lockVersion`; publish locks the plan/draft, validates one base rule, snapshots the effective fee row, clears `draftKey`, sets `currentVersionId`, and writes AuditLog in the same transaction.

```ts
expect(client.shopMembershipCardPlan.findMany).toHaveBeenCalledWith(
  expect.objectContaining({ where: expect.objectContaining({ shopId: 71, deletedAt: null }) })
);
expect(tx.auditLog.create).toHaveBeenCalledWith({
  data: expect.objectContaining({ action: "merchant.shop_membership_card_plan.publish" })
});
```

Also prove a fee-version creation closes only the prior active membership fee row, creates the next version, writes audit atomically, and maps concurrent uniqueness failures to a version conflict.

- [ ] **Step 2: Write failing service tests**

Test non-shop identity rejection, cross-shop 404, staff read success, owner manage/publish success through middleware-independent service calls, benefit-card value range rejection, stored-value/uses mutual exclusion, service/category references limited to the current shop, preview using the current operations rate, and publish using the same current rate in the committed snapshot.

```ts
await expect(service.updateDraft(nonShopActor, context, planId, input)).rejects.toMatchObject({
  statusCode: 403,
  code: ERROR_CODES.IDENTITY_FORBIDDEN
});
await expect(service.publish(ownerActor, context, planId, { expectedLockVersion: 2 }))
  .resolves.toMatchObject({ currentVersion: { platformFeeRateBps: 1000, status: "published" } });
```

- [ ] **Step 3: Run both suites and verify RED**

Run: `npm --prefix backend test -- shop-membership-card-plan.repository.test.ts shop-membership-card-plan.service.test.ts`

Expected: FAIL because repository/service/error codes do not exist.

- [ ] **Step 4: Implement the repository and service**

Use a typed `ShopMembershipCardPlanDraftInput`:

```ts
type ShopMembershipCardPlanDraftInput = {
  expectedLockVersion: number;
  name: string;
  description: string | null;
  cardType: "stored_value" | "count" | "benefit";
  validity: { mode: "never" } | { mode: "fixed_days"; days: number } | { mode: "fixed_date"; expiresAt: Date };
  issuance: {
    minInitialPrincipalJpy: number | null;
    maxInitialPrincipalJpy: number | null;
    minInitialUses: number | null;
    maxInitialUses: number | null;
  };
  caps: MembershipRewardCaps;
  rules: MembershipRewardRuleInput[];
};
```

Persist plan caps in the version's dedicated strict JSON column `rewardCaps`. `updateDraftWithAudit` replaces only rules belonging to the current `DRAFT` version inside one transaction, increments `lockVersion`, and never mutates a published version. Editing an active plan with no draft clones the published version and rules to version `current.version + 1` before applying the requested change.

Fee policy creation accepts `feeRateBps`, `expectedVersion`, `effectiveFrom`, and `reason`; it requires operations global/platform identity, only allows current-or-future activation, and keeps historical rows readable. Publishing selects the latest effective non-deleted policy at database/server time, not a client-provided rate.

- [ ] **Step 5: Run tests and commit**

Run: `npm --prefix backend test -- shop-membership-card-plan.repository.test.ts shop-membership-card-plan.service.test.ts`

Expected: PASS.

```bash
git add backend/src/constants/error-codes.ts backend/src/repositories/shop-membership-card-plan.repository.ts backend/src/services/shop-membership-card-plan.service.ts backend/tests/shop-membership-card-plan.repository.test.ts backend/tests/shop-membership-card-plan.service.test.ts backend/prisma/schema.prisma backend/prisma/migrations/20260831150000_shop_membership_card_rule_configuration/migration.sql
git commit -m "feat: add membership card plan lifecycle"
```

---

### Task 4: Expose Strict RBAC APIs and OpenAPI

**Files:**
- Create: `backend/src/validators/shop-membership-card-plan.validator.ts`
- Create: `backend/src/controllers/shop-membership-card-plan.controller.ts`
- Create: `backend/src/routes/shop-membership-card-plan.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/shop-membership-card-plan-api.test.ts`
- Modify: `backend/tests/shop-membership-openapi.test.ts`

**Interfaces:**
- Merchant plan routes require `shop.member.card_plan.view`, `shop.member.card_plan.manage`, or `shop.member.card_plan.publish` exactly.
- Operations fee routes require `page:backoffice-membership-reward-fee` for reads and `button:backoffice-membership-reward-fee-create` for writes.
- All success responses use the existing envelope; POST create/publish/fee-version endpoints return 201.

- [ ] **Step 1: Write failing API and OpenAPI tests**

Cover 401 without token, 403 without exact permission, 400 unknown key, 404 cross-shop UUID, 409 stale lock/version, paginated list envelopes, preview result fields, published snapshot fields, and fee history. Assert requests containing `shopId`, client `platformFeeRateBps`, or reward keys outside the discriminated schema return 400.

```ts
await request(app)
  .post("/api/v1/merchant-admin/shop-membership-card-plans")
  .set("Authorization", `Bearer ${ownerToken}`)
  .send({ shopId: 999, ...validDraft })
  .expect(400);
```

OpenAPI must expose these exact paths:

```text
GET/POST /api/v1/merchant-admin/shop-membership-card-plans
GET      /api/v1/merchant-admin/shop-membership-card-plans/{publicId}
PATCH    /api/v1/merchant-admin/shop-membership-card-plans/{publicId}/draft
POST     /api/v1/merchant-admin/shop-membership-card-plans/{publicId}/preview
POST     /api/v1/merchant-admin/shop-membership-card-plans/{publicId}/publish
POST     /api/v1/merchant-admin/shop-membership-card-plans/{publicId}/retire
GET      /api/v1/backoffice/membership-reward-fee-policy
POST     /api/v1/backoffice/membership-reward-fee-policy/versions
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- shop-membership-card-plan-api.test.ts shop-membership-openapi.test.ts`

Expected: FAIL because routes and schemas are absent.

- [ ] **Step 3: Implement strict validators and thin controllers**

Validators reuse `membershipRewardRuleListSchema`, use UUID params, `pageSize <= 100`, `.strict()` on every object, and convert ISO timestamps only after Zod validation. Preview body contains only authoritative scenario inputs (`eligibleAmountJpy`, service public ID, category code, scheduledAt, historical counters) and never actor/shop/rate fields.

Controllers call the service, return `successResponse`, and do not access Prisma, calculate reward, inspect permissions, or derive shop scope.

- [ ] **Step 4: Register routes and OpenAPI**

Add optional repository injection to `AppDependencies`; construct the real repository when absent. Register the router under the existing `/api/v1` router before not-found middleware. Define one OpenAPI `oneOf` with discriminator `kind` for all ten rule schemas and document 400/401/403/404/409 responses.

- [ ] **Step 5: Run API tests and commit**

Run: `npm --prefix backend test -- shop-membership-card-plan-api.test.ts shop-membership-openapi.test.ts`

Expected: PASS.

```bash
git add backend/src/validators/shop-membership-card-plan.validator.ts backend/src/controllers/shop-membership-card-plan.controller.ts backend/src/routes/shop-membership-card-plan.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/shop-membership-card-plan-api.test.ts backend/tests/shop-membership-openapi.test.ts
git commit -m "feat: expose membership card plan APIs"
```

---

### Task 5: Build the Merchant Card-Plan Workspace

**Files:**
- Modify: `src/features/shop-member/api.ts`
- Modify: `src/features/shop-member/api.test.ts`
- Create: `src/features/shop-member/cardPlanModel.ts`
- Create: `src/features/shop-member/cardPlanModel.test.ts`
- Create: `src/features/shop-member/CardPlanWorkspace.tsx`
- Create: `src/features/shop-member/CardPlanWorkspace.test.tsx`
- Modify: `src/features/shop-member/ShopMemberCenterPage.tsx`
- Modify: `src/features/shop-member/ShopMemberCenterPage.test.tsx`
- Modify: `src/features/shop-member/i18n.ts`
- Modify: `src/features/shop-member/i18n.test.ts`

**Interfaces:**
- `merchantShopMembershipApi` adds `listCardPlans`, `getCardPlan`, `createCardPlan`, `saveCardPlanDraft`, `previewCardPlan`, `publishCardPlan`, and `retireCardPlan`.
- `CardPlanWorkspace` receives `canManage`, `canPublish`, and no shop/internal IDs.
- All displayed costs come from the preview API or published DTO; the browser does not independently calculate a financial result.

- [ ] **Step 1: Write failing API and model tests**

Assert exact formal paths/methods, omitted undefined query fields, body preservation, conversion of percentage text to integer bps, mutual exclusion of amount/use fields by card type, one base rule, no discount/gift options, and no wallet/card mutation API.

```ts
expect(httpClient.request).toHaveBeenCalledWith(
  "/merchant-admin/shop-membership-card-plans/plan-id/preview",
  { method: "POST", body: scenario }
);
expect(cardPlanRuleOptions.map((item) => item.kind)).not.toContain("discount");
```

- [ ] **Step 2: Write failing UI contract tests**

Assert the existing top-level five tabs remain; the cards section contains `已发会员卡` and `卡方案`; `TestFeatureBadge` remains; read-only staff can inspect plans but cannot see save/publish actions; owner sees the six-step editor; the cost panel labels customer reward, platform fee rate, platform fee, and shop total cost; failure preserves draft; and no UI says it freezes NDP.

- [ ] **Step 3: Run frontend tests and verify RED**

Run: `npm test -- src/features/shop-member/api.test.ts src/features/shop-member/cardPlanModel.test.ts src/features/shop-member/CardPlanWorkspace.test.tsx src/features/shop-member/ShopMemberCenterPage.test.tsx`

Expected: FAIL because the plan workspace and adapters do not exist.

- [ ] **Step 4: Implement the formal API/model layer**

Use public DTO discriminated unions mirroring OpenAPI. Keep UI inputs as strings until `validateCardPlanDraft` converts them to integers. Never import backend source or duplicate the server evaluator. Client validation provides immediate field feedback, but server validation and preview remain authoritative.

- [ ] **Step 5: Implement the responsive workspace**

Inside the existing `cards` top-level section, render secondary tabs `已发会员卡` and `卡方案`. Plan list cards show type, draft/published/retired state, version, base reward summary, up to three bonus summaries, current snapshotted fee, example total, and actions allowed by permission.

The editor uses six in-page steps: basic information, issuance bounds, base reward, bonus rules/scope/caps, server cost preview, publish confirmation. Use existing dark/light tokens, 44px minimum controls, visible focus states, no white near-white outlines in dark mode, and no horizontal overflow at 390px. Every rule selector offers only the approved NDP kinds.

- [ ] **Step 6: Add five-language copy and run tests**

Add translations for every new visible string in `zh`, `zh-Hant`, `ja`, `en`, and `ko`; keep authored plan names/descriptions unchanged. Run:

`npm test -- src/features/shop-member/api.test.ts src/features/shop-member/cardPlanModel.test.ts src/features/shop-member/CardPlanWorkspace.test.tsx src/features/shop-member/ShopMemberCenterPage.test.tsx src/features/shop-member/i18n.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/shop-member/api.ts src/features/shop-member/api.test.ts src/features/shop-member/cardPlanModel.ts src/features/shop-member/cardPlanModel.test.ts src/features/shop-member/CardPlanWorkspace.tsx src/features/shop-member/CardPlanWorkspace.test.tsx src/features/shop-member/ShopMemberCenterPage.tsx src/features/shop-member/ShopMemberCenterPage.test.tsx src/features/shop-member/i18n.ts src/features/shop-member/i18n.test.ts
git commit -m "feat: add merchant membership card plan workspace"
```

---

### Task 6: Build the Operations Membership Reward Fee Page

**Files:**
- Create: `src/api/membershipRewardFee.ts`
- Create: `src/api/membershipRewardFee.test.ts`
- Create: `src/pages/admin/MembershipRewardFeePage.tsx`
- Create: `src/pages/admin/MembershipRewardFeePage.test.tsx`
- Create: `src/pages/admin/membershipRewardFeeModel.ts`
- Create: `src/pages/admin/membershipRewardFeeModel.test.ts`
- Create: `src/pages/admin/membershipRewardFeeCopy.ts`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/admin/AdminCapabilityRoutes.test.ts`

**Interfaces:**
- Route: `/admin/finance/membership-reward-fee` protected by `page:backoffice-membership-reward-fee`.
- Create control protected by `button:backoffice-membership-reward-fee-create`.
- Page shows effective current version, next scheduled version, immutable history, creator, effective interval, and audit-oriented reason.

- [ ] **Step 1: Write failing adapter, model, route, and page tests**

Assert GET/POST paths, 0–100% parsing to integer bps with at most two decimals, required 1–500 character reason, future scheduling, optimistic `expectedVersion`, exact route permission, button permission, `Test` badge, and the warning that the fee is added on top of customer reward and applies only to newly published plan versions.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/api/membershipRewardFee.test.ts src/pages/admin/membershipRewardFeeModel.test.ts src/pages/admin/MembershipRewardFeePage.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts`

Expected: FAIL because the page and route do not exist.

- [ ] **Step 3: Implement the operations page**

Follow the established `AffiliateFeeRulesPage` interaction pattern without reusing its affiliate data or wording: request-id guards for late responses, paginated immutable history, confirmation before create, preserved input on failure, structured handling of 401/403/409, and five-language copy. Add a finance navigation item labelled `会员返点平台费` with a `TEST` child label.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/api/membershipRewardFee.test.ts src/pages/admin/membershipRewardFeeModel.test.ts src/pages/admin/MembershipRewardFeePage.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts`

Expected: PASS.

```bash
git add src/api/membershipRewardFee.ts src/api/membershipRewardFee.test.ts src/pages/admin/MembershipRewardFeePage.tsx src/pages/admin/MembershipRewardFeePage.test.tsx src/pages/admin/membershipRewardFeeModel.ts src/pages/admin/membershipRewardFeeModel.test.ts src/pages/admin/membershipRewardFeeCopy.ts src/components/admin/AdminLayout.tsx src/App.tsx src/pages/admin/AdminCapabilityRoutes.test.ts
git commit -m "feat: add membership reward fee operations page"
```

---

### Task 7: Apply Locally, Prove Persistence, and Document the Boundary

**Files:**
- Create: `backend/scripts/check-shop-membership-card-plan-flow.ts`
- Modify: `backend/package.json`
- Modify: `docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md`
- Modify: `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`
- Modify: `docs/api.md`

**Interfaces:**
- Checker refuses production-like environments, remote DB hosts, and non-test database names.
- Checker creates uniquely marked operation/shop/customer-free configuration rows, tests shop isolation and audit, then removes only its own rows.
- No checker step creates cards, wallets, ledger entries, reward settlements, or customer notifications.

- [ ] **Step 1: Write the guarded checker**

Use existing checker safety helpers/patterns. Capture preflight counts for the four new tables plus `Wallet`, `LedgerTransaction`, `LedgerEntry`, and `ShopMembershipCard`. Exercise: current 10% fee read; create draft; save all approved rule families; server preview 1000/100/1100; reject cross-shop read; publish; reject published mutation; create next draft; prove old snapshot remains 1000 bps after a temporary later fee version; verify audit actions; cleanup all uniquely marked rows and restore the original active fee interval inside the checker transaction/cleanup path.

- [ ] **Step 2: Test and apply the migration locally**

Run:

```bash
npm --prefix backend run prisma:generate
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run prisma:status
```

Expected: migration deploy succeeds and final status is up to date.

- [ ] **Step 3: Run the real database checker**

Run: `ENV_FILE=.env.dev npm --prefix backend run check:shop-membership-card-plan-flow`

Expected: `ready=true`, preview `{ customerRewardNdp: 1000, platformFeeNdp: 100, totalShopDebitNdp: 1100 }`, immutable snapshot true, cross-shop rejection true, wallet/card/ledger count deltas all zero, and cleanup issues empty.

- [ ] **Step 4: Update documentation**

Record the four tables, eight routes, five permissions, default 10% formula, immutable snapshot behavior, Test UI, and explicit deferral of issuance/settlement/adjustment/top-up/redemption/refund. Do not claim that NDP is credited or debited in microstep A.

- [ ] **Step 5: Run complete verification**

Run:

```bash
npm --prefix backend run lint
npm --prefix backend test
npm --prefix backend run build
npm run lint
npm test
npm run verify:production-build
git diff --check
```

Expected: all commands pass; environment-conditional skipped tests remain explicitly reported, not counted as passes.

- [ ] **Step 6: Browser acceptance**

Start the formal backend from `backend/` and Vite frontend, prove listener PID/cwd, then use authenticated formal accounts to verify:

```text
merchant owner: list/create/edit/preview/publish/retire
merchant staff: list/detail only; no save/publish controls and API 403 on direct writes
operations admin: fee summary/history/create permission UI; do not leave a temporary fee version
390×844 and desktop: no horizontal overflow, visible Test badge, dark/light theme, keyboard focus
console/network: no runtime errors or failed requests after successful load
```

For browser write acceptance, create a uniquely named draft, publish only if the checker/test database is disposable, and clean up or retire the exact test plan afterward with evidence.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/check-shop-membership-card-plan-flow.ts backend/package.json docs/11_NDP_LEDGER_FINANCE_RECONCILIATION.md docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md docs/api.md
git commit -m "test: verify membership card plan configuration"
```

---

## Self-Review Checklist

- Every approved microstep-A requirement maps to Tasks 1–7: schema, fee versions, typed NDP rules, preview, immutable publish, shop RBAC, audit, OpenAPI, merchant UI, operations UI, five languages, migration, real DB, and browser acceptance.
- Issuance, card amount/count mutation, wallet freezing/debit/credit, pending rewards, customer confirmation, top-up, redemption, refund, and reversal are explicitly excluded.
- Types and names remain consistent from Prisma through repository/service/API/frontend DTOs.
- No step introduces discounts, gifts, free services, auto-added NDP/uses, arbitrary expressions, client-computed financial truth, `shopId` request scope, mock data, unfinished markers, or empty endpoints.
