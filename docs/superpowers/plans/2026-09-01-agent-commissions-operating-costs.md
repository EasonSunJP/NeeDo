# Agent Commissions and Operating Costs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operations mark formal users as agents, link introduced shops, version reward/share rules, allocate operating costs and produce auditable agent settlements.

**Architecture:** Add a shared partner-profile marker for agent/franchisee/supplier identity and focused agent referral/rule/settlement models. Calculate shop pure profit from settled facts plus versioned cost allocations, snapshot every settlement input, and expose all writes through audited RBAC services.

**Tech Stack:** Prisma/MySQL, Express, Zod, Jest/Supertest, React, Vitest

## Global Constraints

- An agent is always an existing NeeDo user; no parallel agent login/account table.
- Per-agent rules contain fixed success reward JPY, pure-profit share basis points, payment method, version and effective date.
- Shop pure profit = settled platform fees + SaaS fees - user rebates - refunds/reversals - channel fees - consumption tax - allocated operating costs.
- Each cost item chooses exactly one allocation: equal active shops, proportional platform income, or direct assigned shops.
- Confirmed settlements are immutable and keep all calculation snapshots.
- Identity/rule/cost/settlement/payment writes require dedicated permissions and audit records.

---

### Task 1: Add partner, referral, rule, cost and settlement models

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901100000_agent_commission_operating_cost/migration.sql`
- Create: `backend/tests/agent-commission-schema.test.ts`

**Interfaces:**
- Produces: `PlatformPartnerProfile`, `AgentShopReferral`, `AgentCommissionRuleVersion`, `OperatingCostItem`, `OperatingCostAllocation`, `AgentSettlement`, `AgentSettlementLine`

- [ ] **Step 1: Write the failing schema contract**

```ts
for (const token of [
  "model PlatformPartnerProfile", "model AgentShopReferral",
  "model AgentCommissionRuleVersion", "model OperatingCostItem",
  "model OperatingCostAllocation", "model AgentSettlement",
  "fixedSuccessRewardJpy", "profitShareRateBps", "calculationSnapshotJson"
]) expect(schema).toContain(token);
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- agent-commission-schema.test.ts`

Expected: FAIL on missing models.

- [ ] **Step 3: Add normalized models and indexes**

```prisma
enum PlatformPartnerType { AGENT FRANCHISEE SUPPLIER }
enum OperatingCostAllocationMode { EQUAL_ACTIVE_SHOPS PLATFORM_INCOME_PROPORTIONAL DIRECT_SHOPS }

model PlatformPartnerProfile {
  id            Int       @id @default(autoincrement())
  publicId      String    @unique @default(uuid()) @map("public_id") @db.Char(36)
  userId        Int       @map("user_id")
  partnerType   PlatformPartnerType @map("partner_type")
  activatedAt   DateTime  @map("activated_at")
  markedById    Int       @map("marked_by_id")
  reason        String    @db.VarChar(500)
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  deletedAt     DateTime? @map("deleted_at")
  @@unique([userId, partnerType])
}
```

Add foreign keys, effective-range indexes, settlement-period uniqueness, soft-delete indexes, BPS checks `0..10000`, and positive/zero-safe amount checks.

- [ ] **Step 4: Generate Prisma and run schema tests**

Run: `cd backend && npm run prisma:generate && npm test -- agent-commission-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit persistence**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260901100000_agent_commission_operating_cost/migration.sql backend/tests/agent-commission-schema.test.ts
git commit -m "feat: add agent commission and cost persistence"
```

### Task 2: Mark partner identities and link introduced shops

**Files:**
- Create: `backend/src/repositories/platform-partner.repository.ts`
- Create: `backend/src/services/platform-partner.service.ts`
- Create: `backend/src/controllers/platform-partner.controller.ts`
- Create: `backend/src/validators/platform-partner.validator.ts`
- Create: `backend/src/routes/platform-partner.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/platform-partner.service.test.ts`
- Create: `backend/tests/platform-partner-api.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/backoffice/users/:userId/partner-profiles`
- Produces: `GET /api/v1/backoffice/agents`
- Produces: `POST /api/v1/backoffice/agents/:agentPublicId/shop-referrals`
- Permissions: `backoffice:partner-profile:write`, `backoffice:agent:read`, `backoffice:agent:write`

- [ ] **Step 1: Write failing identity/referral tests**

```ts
await expect(service.markPartner(actor, 41, { partnerType: "agent", activatedAt, reason: "introduced stores" }, context)).resolves.toMatchObject({ userId: 41, partnerType: "agent" });
await expect(service.linkShop(actor, agentPublicId, { shopPublicId, confirmedAt, source: "manual", reason: "contract" }, context)).resolves.toMatchObject({ shopPublicId });
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- platform-partner.service.test.ts`

Expected: FAIL because partner service is absent.

- [ ] **Step 3: Implement user-backed partner mutations**

Reject deleted/nonexistent users, duplicate active markers and shops already linked to a conflicting active agent. Audit marker/referral before/after values and reason. List endpoint is paginated and supports NeeDo ID, nickname and status filters.

- [ ] **Step 4: Run service/API/permission tests**

Run: `cd backend && npm test -- platform-partner.service.test.ts platform-partner-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit partner management**

```bash
git add backend/src/repositories/platform-partner.repository.ts backend/src/services/platform-partner.service.ts backend/src/controllers/platform-partner.controller.ts backend/src/validators/platform-partner.validator.ts backend/src/routes/platform-partner.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/tests/platform-partner.service.test.ts backend/tests/platform-partner-api.test.ts
git commit -m "feat: manage user-backed platform partners"
```

### Task 3: Version per-agent commission rules

**Files:**
- Create: `backend/src/repositories/agent-commission-rule.repository.ts`
- Create: `backend/src/services/agent-commission-rule.service.ts`
- Create: `backend/src/controllers/agent-commission-rule.controller.ts`
- Create: `backend/src/validators/agent-commission-rule.validator.ts`
- Create: `backend/src/routes/agent-commission-rule.routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/agent-commission-rule.service.test.ts`
- Create: `backend/tests/agent-commission-rule-api.test.ts`

**Interfaces:**
- Produces: `publishRule(agentPublicId, input, context)`
- Produces: `GET/POST /api/v1/backoffice/agents/:agentPublicId/commission-rules`

- [ ] **Step 1: Write failing version tests**

```ts
expect(await service.publishRule(actor, agentPublicId, {
  fixedSuccessRewardJpy: 50000,
  profitShareRateBps: 1500,
  paymentMethod: "bank_transfer",
  effectiveFrom,
  reason: "2026 contract"
}, context)).toMatchObject({ version: 1, profitShareRateBps: 1500 });
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- agent-commission-rule.service.test.ts`

Expected: FAIL because rule service is absent.

- [ ] **Step 3: Implement non-overlapping effective versions**

Publish in a transaction: close the previous effective version at the new start, create the next monotonically increasing version, retain payment method details/reference, and audit old/new rule plus reason. Historical versions cannot be edited.

- [ ] **Step 4: Run service/API tests**

Run: `cd backend && npm test -- agent-commission-rule.service.test.ts agent-commission-rule-api.test.ts`

Expected: PASS including BPS bounds and race conflicts.

- [ ] **Step 5: Commit commission rules**

```bash
git add backend/src/repositories/agent-commission-rule.repository.ts backend/src/services/agent-commission-rule.service.ts backend/src/controllers/agent-commission-rule.controller.ts backend/src/validators/agent-commission-rule.validator.ts backend/src/routes/agent-commission-rule.routes.ts backend/src/app.ts backend/tests/agent-commission-rule.service.test.ts backend/tests/agent-commission-rule-api.test.ts
git commit -m "feat: publish versioned agent commission rules"
```

### Task 4: Configure and allocate operating costs

**Files:**
- Create: `backend/src/repositories/operating-cost.repository.ts`
- Create: `backend/src/services/operating-cost.service.ts`
- Create: `backend/src/controllers/operating-cost.controller.ts`
- Create: `backend/src/validators/operating-cost.validator.ts`
- Create: `backend/src/routes/operating-cost.routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/operating-cost.service.test.ts`
- Create: `backend/tests/operating-cost-api.test.ts`

**Interfaces:**
- Produces: `allocatePeriod(input): Promise<ShopOperatingCostAllocation[]>`
- Produces: `/api/v1/backoffice/operating-costs` CRUD/publish endpoints

- [ ] **Step 1: Write failing allocation tests**

```ts
expect(equalAllocations.map((row) => row.amountJpy)).toEqual([334, 333, 333]);
expect(proportionalAllocations.map((row) => row.amountJpy)).toEqual([750, 250]);
expect(directAllocations).toEqual([{ shopId: 8, amountJpy: 1000 }]);
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- operating-cost.service.test.ts`

Expected: FAIL because allocation service is absent.

- [ ] **Step 3: Implement exact integer allocation**

Remainders are assigned deterministically by shop numeric ID ascending so allocations always sum exactly to the cost amount. Proportional allocation uses settled platform income; zero-total periods are validation errors rather than silent equal allocation. Direct mode requires assignments to sum exactly to the item amount.

- [ ] **Step 4: Run service/API tests**

Run: `cd backend && npm test -- operating-cost.service.test.ts operating-cost-api.test.ts`

Expected: PASS for personnel, server and third-party API examples and all three modes.

- [ ] **Step 5: Commit operating costs**

```bash
git add backend/src/repositories/operating-cost.repository.ts backend/src/services/operating-cost.service.ts backend/src/controllers/operating-cost.controller.ts backend/src/validators/operating-cost.validator.ts backend/src/routes/operating-cost.routes.ts backend/src/app.ts backend/tests/operating-cost.service.test.ts backend/tests/operating-cost-api.test.ts
git commit -m "feat: allocate versioned operating costs"
```

### Task 5: Calculate and confirm agent settlements

**Files:**
- Create: `backend/src/repositories/agent-settlement.repository.ts`
- Create: `backend/src/services/agent-settlement.service.ts`
- Create: `backend/src/controllers/agent-settlement.controller.ts`
- Create: `backend/src/validators/agent-settlement.validator.ts`
- Create: `backend/src/routes/agent-settlement.routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/agent-settlement.service.test.ts`
- Create: `backend/tests/agent-settlement-api.test.ts`
- Create: `backend/tests/agent-settlement.repository.test.ts`

**Interfaces:**
- Produces: `previewSettlement(agentPublicId: string, period: SettlementPeriod)` and `confirmSettlement(agentPublicId: string, period: SettlementPeriod, idempotencyKey: string)`
- Produces: `/api/v1/backoffice/agents/:agentPublicId/settlements`

- [x] **Step 1: Write failing pure-profit tests**

```ts
expect(calculatePureProfit({
  orderPlatformFeesJpy: 100000,
  saasFeesJpy: 20000,
  userRebatesJpy: 10000,
  refundsAndReversalsJpy: 5000,
  channelFeesJpy: 3000,
  consumptionTaxJpy: 8000,
  allocatedOperatingCostsJpy: 14000
})).toBe(80000);
expect(calculateAgentCommission(50000, 1500, 80000)).toBe(62000);
```

- [x] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- agent-settlement.service.test.ts`

Expected: FAIL because settlement service is absent.

- [x] **Step 3: Implement preview, immutable confirmation and payment state**

Success reward applies once per referral when its formal success condition first becomes true. Confirmed settlement saves every input component, rule version, cost allocations and result as JSON plus normalized lines. Payment confirmation records method, reference, actor and time; it never rewrites calculation lines.

- [x] **Step 4: Run service/API/idempotency tests**

Run: `cd backend && npm test -- agent-settlement.service.test.ts agent-settlement-api.test.ts`

Expected: PASS including negative-profit floor rules, repeated confirmation and rule changes after confirmation.

- [x] **Step 5: Commit settlements**

```bash
git add backend/src/repositories/agent-settlement.repository.ts backend/src/services/agent-settlement.service.ts backend/src/controllers/agent-settlement.controller.ts backend/src/validators/agent-settlement.validator.ts backend/src/routes/agent-settlement.routes.ts backend/src/app.ts backend/tests/agent-settlement.service.test.ts backend/tests/agent-settlement-api.test.ts
git commit -m "feat: calculate auditable agent settlements"
```

### Task 6: Feed confirmed agent commission into the dashboard

**Files:**
- Modify: `backend/src/repositories/dashboard-commission.repository.ts`
- Modify: `backend/src/repositories/dashboard-growth.repository.ts`
- Modify: `backend/tests/dashboard-commission.repository.test.ts`
- Modify: `backend/tests/dashboard-growth.repository.test.ts`
- Modify: `backend/tests/dashboard-overview-service.test.ts`
- Modify: `backend/tests/dashboard-metric-detail-api.test.ts`
- Modify: `src/pages/admin/DashboardPage.test.ts`

**Interfaces:**
- Consumes: confirmed `AgentSettlement` rows from Task 5
- Produces: dashboard metric `agent_commission` with `dataStatus: "ready"`
- Produces: `agent_onboarding`, `franchisee_onboarding`, `supplier_onboarding` from partner activation events

- [x] **Step 1: Write the failing dashboard integration test**

```ts
expect(await reader.getAgentCommission(input)).toEqual({ current: 62000, previous: 40000, dataStatus: "ready" });
expect(await growthReader.getPartnerOnboarding(input)).toEqual({ agent: 2, franchisee: 1, supplier: 1 });
```

Fixtures include a draft settlement, a confirmed settlement outside the window and a confirmed settlement for another city.

- [x] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- dashboard-commission.repository.test.ts dashboard-growth.repository.test.ts dashboard-overview-service.test.ts`

Expected: FAIL because the metric still returns `not_available`.

- [x] **Step 3: Aggregate only confirmed settlement lines**

Read immutable confirmed agent-settlement totals by referred shop, settlement period and dashboard city/shop scope. Do not recalculate commission rules inside the dashboard reader. Count partner onboarding by the first `activatedAt` for each user/type and use distinct user IDs.

- [x] **Step 4: Run commission/dashboard tests**

Run: `cd backend && npm test -- dashboard-commission.repository.test.ts dashboard-growth.repository.test.ts dashboard-overview-service.test.ts agent-settlement.service.test.ts`

Expected: PASS.

- [x] **Step 5: Commit dashboard integration**

```bash
git add backend/src/repositories/dashboard-commission.repository.ts backend/src/repositories/dashboard-growth.repository.ts backend/tests/dashboard-commission.repository.test.ts backend/tests/dashboard-growth.repository.test.ts backend/tests/dashboard-overview-service.test.ts
git commit -m "feat: report confirmed agent commission"
```

### Task 7: Build agent and operating-cost admin pages

**Files:**
- Create: `src/api/platformPartners.ts`
- Create: `src/api/platformPartners.test.ts`
- Create: `src/pages/admin/AgentsPage.tsx`
- Create: `src/pages/admin/AgentsPage.test.tsx`
- Create: `src/pages/admin/OperatingCostsPage.tsx`
- Create: `src/pages/admin/OperatingCostsPage.test.tsx`
- Modify: `src/pages/admin/UsersPage.tsx`
- Modify: `src/pages/admin/UsersPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/components/admin/AdminLayout.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: Tasks 2-5 endpoints
- Produces routes `/admin/agents`, `/admin/agents/:agentPublicId`, `/admin/finance/operating-costs`

- [x] **Step 1: Write failing route/form tests**

```tsx
expect(screen.getByLabelText("固定成功奖励（日元）")).toBeVisible();
expect(screen.getByLabelText("纯利润分成比例")).toBeVisible();
expect(screen.getByRole("option", { name: "按活跃店铺等额分摊" })).toBeVisible();
expect(screen.getByRole("button", { name: "标记为代理商" })).toBeVisible();
expect(screen.getByRole("button", { name: "标记为加盟商 TEST" })).toBeVisible();
expect(screen.getByRole("button", { name: "标记为供货商 TEST" })).toBeVisible();
expect(adminSource).toContain('{ label: "代理商管理", to: "/admin/agents"');
```

- [x] **Step 2: Run and verify failure**

Run: `npm test -- src/pages/admin/AgentsPage.test.tsx src/pages/admin/OperatingCostsPage.test.tsx src/components/admin/AdminLayout.test.ts`

Expected: FAIL because formal pages/routes are absent.

- [x] **Step 3: Implement API-driven pages**

Agent list links existing users, shows referred shops, active rule and settlement/payment status. User detail exposes the three formal partner markers; franchisee/supplier markers show TEST status but do not link to a detail page. Rule and cost forms require reason/effective date; previews show every pure-profit line before confirmation. Permission gates hide writes but retain read-only detail.

- [x] **Step 4: Run frontend tests, lint and build**

Run: `npm test -- src/api/platformPartners.test.ts src/pages/admin/AgentsPage.test.tsx src/pages/admin/OperatingCostsPage.test.tsx src/pages/admin/UsersPage.test.tsx src/components/admin/AdminLayout.test.ts && npm run lint && npm run build`

Expected: PASS.

- [x] **Step 5: Commit admin UI**

```bash
git add src/api/platformPartners.ts src/api/platformPartners.test.ts src/pages/admin/AgentsPage.tsx src/pages/admin/AgentsPage.test.tsx src/pages/admin/OperatingCostsPage.tsx src/pages/admin/OperatingCostsPage.test.tsx src/pages/admin/UsersPage.tsx src/pages/admin/UsersPage.test.tsx src/App.tsx src/App.test.tsx src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.test.ts src/i18n/translations.ts
git commit -m "feat: manage agents and operating costs"
```

### Task 8: Publish partner, cost and settlement OpenAPI schemas

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/agent-operating-cost-openapi.test.ts`

**Interfaces:**
- Documents partner profiles, referrals, rule versions, costs, allocations, settlement preview/confirm and payment

- [x] **Step 1: Write the failing OpenAPI test**

```ts
expect(document.paths["/api/v1/backoffice/agents"]).toBeDefined();
expect(document.paths["/api/v1/backoffice/operating-costs"]).toBeDefined();
expect(document.components.schemas.AgentSettlement).toBeDefined();
```

- [x] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- agent-operating-cost-openapi.test.ts`

Expected: FAIL on missing paths/schema.

- [x] **Step 3: Add exact schemas, permissions and errors**

Document BPS/amount bounds, effective dates, allocation discriminators, reason/idempotency requirements, paginated lists and immutable settlement snapshots.

- [x] **Step 4: Run OpenAPI/API tests**

Run: `cd backend && npm test -- agent-operating-cost-openapi.test.ts openapi.test.ts platform-partner-api.test.ts agent-commission-rule-api.test.ts operating-cost-api.test.ts agent-settlement-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit API documentation**

```bash
git add backend/src/api/openapi.ts backend/tests/agent-operating-cost-openapi.test.ts
git commit -m "docs: publish agent settlement API contract"
```

### Task 9: Verify agent settlement flow

**Files:**
- Create: `backend/scripts/check-agent-settlement-flow.ts`
- Create: `backend/tests/agent-settlement-flow-script.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces command `npm run check:agent-settlement`

- [ ] **Step 1: Write flow safety/coverage tests**

```ts
expect(script).toContain("ROLLBACK");
for (const term of ["orderPlatformFeesJpy", "saasFeesJpy", "userRebatesJpy", "allocatedOperatingCostsJpy"]) expect(script).toContain(term);
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- agent-settlement-flow-script.test.ts`

Expected: FAIL because the flow script is absent.

- [ ] **Step 3: Implement rollback-only end-to-end verification**

Create a user-backed agent, referral, rule and each cost-allocation mode; preview/confirm/pay a settlement, then prove later rule/cost edits do not change the confirmed snapshot.

- [ ] **Step 4: Run backend/frontend gates and browser replay**

Run: `cd backend && npm test -- platform-partner agent-commission operating-cost agent-settlement && npm run build`

Run: `npm test -- src/pages/admin/AgentsPage.test.tsx src/pages/admin/OperatingCostsPage.test.tsx && npm run lint && npm run build`

Verify user selection, shop linking, rule history, cost preview, settlement confirmation, permission denial, console and overflow.

- [ ] **Step 5: Commit verification**

```bash
git add backend/scripts/check-agent-settlement-flow.ts backend/tests/agent-settlement-flow-script.test.ts backend/package.json
git commit -m "test: verify agent settlement accounting"
```
