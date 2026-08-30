# Affiliate Platform Fee Operations UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production operations-admin page that reads versioned Affiliate platform-fee rules, searches eligible shops, and creates audited global or shop-scoped rule versions through the formal API.

**Architecture:** Extend the existing Affiliate fee-rule service/repository with a server-evaluated global summary and a permission-scoped shop-option query, then add a typed frontend API and dedicated admin page. The page reuses existing admin components, keeps history immutable, uses optimistic versions, and never falls back to mock or browser-local data.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Express, Zod, Prisma, Jest, Supertest, OpenAPI.

## Global Constraints

- Work only in `/Users/eason/Documents/New project/.worktrees/affiliate-merchant-task-ui` on `codex/affiliate-merchant-task-ui`; do not touch or merge `main`.
- Follow `README.md`, `AGENTS.md`, `docs/00_MASTER_MICRO_STEP_PLAN.md`, and `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`.
- Use only `/api/v1/` formal APIs, Prisma repository access, Zod validation, RBAC, pagination, and OpenAPI.
- Do not add mock, demo, placeholder, fake API, `TODO`, `FIXME`, schema change, or migration.
- Do not edit or delete historical fee-rule versions or reprice already-funded Affiliate tasks.
- Keep the merchant-paid platform fee separate from promoter/alliance allocation; existing task fee snapshots remain immutable.
- New UI copy must support Japanese, English, Korean, Traditional Chinese, and Simplified Chinese in that order.
- Browser acceptance must not create a persistent immutable fee version without separate authorization.

---

## File map

### Backend

- `backend/src/validators/affiliate-platform-fee.validator.ts`: summary and shop-option query schemas.
- `backend/src/services/affiliate-platform-fee.service.ts`: public summary/shop-option contracts and identity enforcement.
- `backend/src/repositories/affiliate-platform-fee.repository.ts`: shop labels, summary query, and published-shop search.
- `backend/src/controllers/affiliate-platform-fee.controller.ts`: GET handlers.
- `backend/src/routes/affiliate-platform-fee.routes.ts`: read-permission routes.
- `backend/src/api/openapi.ts`: schemas and path documentation.
- Existing Affiliate fee repository/service/API/OpenAPI tests: regression and new contract coverage.

### Frontend

- `src/api/affiliatePlatformFee.ts`: typed formal API adapter.
- `src/pages/admin/affiliateFeeRuleModel.ts`: percentage, status, validation, and create-input helpers.
- `src/pages/admin/affiliateFeeRuleCopy.ts`: independent five-language copy.
- `src/pages/admin/AffiliateFeeRulesPage.tsx`: page, filters, table, shop selector, drawer, and conflict flow.
- Matching `.test.ts` files: adapter, pure-model, copy, and page contracts.
- `src/App.tsx` and `src/components/admin/AdminLayout.tsx`: protected route and navigation.

---

### Task 1: Add server-evaluated summary and minimal shop search

**Files:**
- Modify: `backend/src/validators/affiliate-platform-fee.validator.ts:33-56`
- Modify: `backend/src/services/affiliate-platform-fee.service.ts:5-91,133-178`
- Modify: `backend/src/repositories/affiliate-platform-fee.repository.ts:15-125,196-224`
- Modify: `backend/src/controllers/affiliate-platform-fee.controller.ts:1-38`
- Modify: `backend/src/routes/affiliate-platform-fee.routes.ts:12-55`
- Modify: `backend/src/api/openapi.ts:4257-4332,5709-5758`
- Test: `backend/tests/affiliate-platform-fee.repository.test.ts`
- Test: `backend/tests/affiliate-platform-fee.service.test.ts`
- Test: `backend/tests/affiliate-platform-fee-api.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: existing `AffiliatePlatformFeeRuleRecord`, `PaginatedResponse`, read permission `page:backoffice-affiliate-fee-rule`, and global/platform identity guard.
- Produces:

```ts
export interface AffiliatePlatformFeeRuleRecord {
  id: number;
  scopeType: "global" | "shop";
  scopeKey: string;
  shopId: number | null;
  shopName: string | null;
  shopCity: string | null;
  feeBps: number;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  activeKey: string | null;
  reason: string;
  createdByNeedoId: string | null;
  updatedByNeedoId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface AffiliatePlatformFeeRuleSummary {
  evaluatedAt: Date;
  current: AffiliatePlatformFeeRuleRecord | null;
  nextScheduled: AffiliatePlatformFeeRuleRecord | null;
  latestVersion: number;
}
export interface AffiliatePlatformFeeShopOption { id: number; name: string; city: string; }
export interface AffiliatePlatformFeeShopOptionInput extends PaginationInput { keyword?: string; }
```

- Produces:

```text
GET /api/v1/backoffice/affiliate/fee-rules/summary?scopeType=global
GET /api/v1/backoffice/affiliate/fee-rule-shops?keyword=Gin&page=1&pageSize=10
```

- [ ] **Step 1: Write failing repository tests**

Add fixtures with `shop` relation data and assert the exact contracts:

```ts
it("projects shop labels in the fee-rule query", async () => {
  const findMany = jest.fn().mockResolvedValue([{
    ...rule, scopeType: "SHOP", scopeKey: "shop:11", shopId: 11,
    shop: { name: "GINZA Calm Body", city: "Tokyo" }
  }]);
  const count = jest.fn().mockResolvedValue(1);
  const client = { affiliatePlatformFeeRule: { findMany, count } } as unknown as PrismaClient;
  const repository = new AffiliatePlatformFeeRepository(client);
  await expect(repository.listRules({ page: 1, pageSize: 20, scopeType: "shop" }))
    .resolves.toMatchObject({ list: [{ shopName: "GINZA Calm Body", shopCity: "Tokyo" }] });
  expect(findMany.mock.calls[0]?.[0]?.select).toMatchObject({
    shop: { select: { name: true, city: true } }
  });
});

it("finds current, earliest future, and latest global versions at one instant", async () => {
  const current = { ...rule, version: 1, effectiveTo: new Date("2026-09-01T00:00:00.000Z"), shop: null };
  const future = { ...rule, id: 42, version: 2, effectiveFrom: new Date("2026-09-01T00:00:00.000Z"), shop: null };
  const findFirst = jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(future)
    .mockResolvedValueOnce(future);
  const client = { affiliatePlatformFeeRule: { findFirst } } as unknown as PrismaClient;
  const repository = new AffiliatePlatformFeeRepository(client);
  await expect(repository.getGlobalSummary(now)).resolves.toMatchObject({
    evaluatedAt: now, current: { version: 1 }, nextScheduled: { version: 2 }, latestVersion: 2
  });
});

it("searches only published non-deleted shops with minimal fields", async () => {
  const findMany = jest.fn().mockResolvedValue([{ id: 11, name: "GINZA Calm Body", city: "Tokyo" }]);
  const count = jest.fn().mockResolvedValue(1);
  const client = { shop: { findMany, count } } as unknown as PrismaClient;
  const repository = new AffiliatePlatformFeeRepository(client);
  await repository.listEligibleShops({ keyword: "11", page: 1, pageSize: 10 });
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { deletedAt: null, status: "published", OR: [{ name: { contains: "11" } }, { id: 11 }] },
    select: { id: true, name: true, city: true }
  }));
});
```

- [ ] **Step 2: Run the repository test and verify failure**

Run: `cd backend && npm test -- tests/affiliate-platform-fee.repository.test.ts --runInBand`

Expected: FAIL because the relation projection and two repository methods do not exist.

- [ ] **Step 3: Implement repository projections and queries**

Add `shop: { select: { name: true, city: true } }` to `ruleSelect` and map `shopName` / `shopCity`. Implement:

```ts
public async getGlobalSummary(evaluatedAt: Date): Promise<AffiliatePlatformFeeRuleSummary> {
  const baseWhere = { scopeKey: "global", deletedAt: null } as const;
  const [current, nextScheduled, latest] = await Promise.all([
    this.client.affiliatePlatformFeeRule.findFirst({
      where: { ...baseWhere, effectiveFrom: { lte: evaluatedAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: evaluatedAt } }] },
      orderBy: [{ version: "desc" }, { id: "desc" }], select: ruleSelect
    }),
    this.client.affiliatePlatformFeeRule.findFirst({
      where: { ...baseWhere, effectiveFrom: { gt: evaluatedAt } },
      orderBy: [{ effectiveFrom: "asc" }, { version: "asc" }], select: ruleSelect
    }),
    this.client.affiliatePlatformFeeRule.findFirst({
      where: baseWhere, orderBy: [{ version: "desc" }, { id: "desc" }], select: ruleSelect
    })
  ]);
  return {
    evaluatedAt,
    current: current ? this.mapRule(current) : null,
    nextScheduled: nextScheduled ? this.mapRule(nextScheduled) : null,
    latestVersion: latest?.version ?? 0
  };
}

public async listEligibleShops(input: AffiliatePlatformFeeShopOptionInput) {
  const pagination = toPrismaPagination(input);
  const keyword = input.keyword?.trim();
  const numericId = keyword && /^\d+$/.test(keyword) ? Number(keyword) : null;
  const where: Prisma.ShopWhereInput = {
    deletedAt: null,
    status: "published",
    ...(keyword ? { OR: [
      { name: { contains: keyword } },
      ...(numericId && Number.isSafeInteger(numericId) && numericId > 0 ? [{ id: numericId }] : [])
    ] } : {})
  };
  const [list, total] = await Promise.all([
    this.client.shop.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: pagination.skip, take: pagination.take, select: { id: true, name: true, city: true } }),
    this.client.shop.count({ where })
  ]);
  return buildPaginatedResponse(list, total, pagination);
}
```

- [ ] **Step 4: Write failing service/API/OpenAPI tests**

Extend the repository mock with `getGlobalSummary` and `listEligibleShops`. Assert merchant/shop identities receive 403 before repository access. In the HTTP fixture assert authenticated reader 200, missing token 401, missing permission 403, unknown query field 400, pagination forwarding, and minimized shop response:

```ts
const shops = await request(fixture.app)
  .get("/api/v1/backoffice/affiliate/fee-rule-shops?keyword=GINZA&page=1&pageSize=10")
  .set("Authorization", `Bearer ${fixture.tokens[2]}`)
  .expect(200);
expect(shops.body.data.list).toEqual([{ id: 11, name: "GINZA Calm Body", city: "Tokyo" }]);
expect(JSON.stringify(shops.body)).not.toMatch(/owner|email|phone|bank/i);
```

In `openapi.test.ts`, require both paths, bearer security, pagination bounds, and refs to the new schemas.

- [ ] **Step 5: Run service/API/OpenAPI tests and verify failure**

Run: `cd backend && npm test -- tests/affiliate-platform-fee.service.test.ts tests/affiliate-platform-fee-api.test.ts tests/openapi.test.ts --runInBand`

Expected: FAIL because validators, handlers, routes, methods, and OpenAPI contracts are absent.

- [ ] **Step 6: Implement validators, service, controller, routes, and OpenAPI**

Add strict schemas:

```ts
export const affiliatePlatformFeeRuleSummaryQuerySchema = z.object({ scopeType: z.literal("global") }).strict();
export const affiliatePlatformFeeShopOptionQuerySchema = z.object({
  keyword: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
}).strict();
```

Add `getGlobalSummary(actor, evaluatedAt = new Date())` and `listEligibleShops(actor, input)` to the service; both call `assertOperationsIdentity` first. Add controller GET handlers and routes using the existing read permission. Extend `AffiliatePlatformFeeRule` OpenAPI with nullable `shopName` and `shopCity`; add `AffiliatePlatformFeeRuleSummary`, `AffiliatePlatformFeeShopOption`, its paginated page, and both GET path definitions.

- [ ] **Step 7: Run focused backend verification**

Run:

```bash
cd backend && npm test -- tests/affiliate-platform-fee.repository.test.ts tests/affiliate-platform-fee.service.test.ts tests/affiliate-platform-fee-api.test.ts tests/openapi.test.ts --runInBand
cd backend && npm run lint
cd backend && npm run build
```

Expected: focused suites PASS; lint/build exit 0.

- [ ] **Step 8: Commit Task 1**

```bash
git add backend/src/validators/affiliate-platform-fee.validator.ts backend/src/services/affiliate-platform-fee.service.ts backend/src/repositories/affiliate-platform-fee.repository.ts backend/src/controllers/affiliate-platform-fee.controller.ts backend/src/routes/affiliate-platform-fee.routes.ts backend/src/api/openapi.ts backend/tests/affiliate-platform-fee.repository.test.ts backend/tests/affiliate-platform-fee.service.test.ts backend/tests/affiliate-platform-fee-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: expose affiliate fee operations reads"
```

---

### Task 2: Add the typed frontend API, model, and five-language copy

**Files:**
- Create: `src/api/affiliatePlatformFee.ts`
- Create: `src/api/affiliatePlatformFee.test.ts`
- Create: `src/pages/admin/affiliateFeeRuleModel.ts`
- Create: `src/pages/admin/affiliateFeeRuleModel.test.ts`
- Create: `src/pages/admin/affiliateFeeRuleCopy.ts`
- Create: `src/pages/admin/affiliateFeeRuleCopy.test.ts`

**Interfaces:**
- Consumes: Task 1 routes and the existing `httpClient` response unwrapping.
- Produces `affiliatePlatformFeeApi.listRules`, `getGlobalSummary`, `searchShops`, `createRule`, plus `toFeeBps`, `classifyAffiliateFeeRule`, `validateAffiliateFeeDraft`, and `buildAffiliateFeeCreateInput`.

- [ ] **Step 1: Write the failing API adapter test**

Mock `httpClient.request`, call all four adapter methods, and assert:

```ts
expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/affiliate/fee-rules", {
  query: { page: 2, pageSize: 20, scopeType: "shop", shopId: 11 }
});
expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/affiliate/fee-rules/summary", {
  query: { scopeType: "global" }
});
expect(httpClient.request).toHaveBeenNthCalledWith(3, "/backoffice/affiliate/fee-rule-shops", {
  query: { keyword: "GINZA", page: 1, pageSize: 10 }
});
expect(httpClient.request).toHaveBeenNthCalledWith(4, "/backoffice/affiliate/fee-rules", {
  method: "POST",
  body: { scopeType: "shop", shopId: 11, feeBps: 1250, expectedVersion: 2,
    effectiveFrom: "2026-09-01T00:00:00.000Z", reason: "季度调整" }
});
```

- [ ] **Step 2: Run the adapter test and verify failure**

Run: `npm test -- src/api/affiliatePlatformFee.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the typed adapter**

```ts
import { httpClient } from "./httpClient";

export type AffiliatePlatformFeeScope = "global" | "shop";
export interface AffiliatePlatformFeeRule {
  id: number; scopeType: AffiliatePlatformFeeScope; scopeKey: string;
  shopId: number | null; shopName: string | null; shopCity: string | null;
  feeBps: number; version: number; effectiveFrom: string; effectiveTo: string | null;
  activeKey: string | null; reason: string; createdByNeedoId: string | null;
  updatedByNeedoId: string | null; createdAt: string; updatedAt: string;
}
export interface AffiliatePlatformFeeRulePage { list: AffiliatePlatformFeeRule[]; total: number; page: number; page_size: number; }
export interface AffiliatePlatformFeeRuleSummary { evaluatedAt: string; current: AffiliatePlatformFeeRule | null; nextScheduled: AffiliatePlatformFeeRule | null; latestVersion: number; }
export interface AffiliatePlatformFeeShopOption { id: number; name: string; city: string; }
export interface AffiliatePlatformFeeShopPage { list: AffiliatePlatformFeeShopOption[]; total: number; page: number; page_size: number; }
export type AffiliatePlatformFeeRuleQuery = { page?: number; pageSize?: number; scopeType?: AffiliatePlatformFeeScope; shopId?: number; };
export type AffiliatePlatformFeeShopQuery = { keyword?: string; page?: number; pageSize?: number; };
export type AffiliatePlatformFeeRuleCreateInput = { scopeType: AffiliatePlatformFeeScope; shopId: number | null; feeBps: number; expectedVersion: number; effectiveFrom: string; reason: string; };

export const affiliatePlatformFeeApi = {
  listRules: (query: AffiliatePlatformFeeRuleQuery = {}) =>
    httpClient.request<AffiliatePlatformFeeRulePage>("/backoffice/affiliate/fee-rules", { query }),
  getGlobalSummary: () =>
    httpClient.request<AffiliatePlatformFeeRuleSummary>("/backoffice/affiliate/fee-rules/summary", { query: { scopeType: "global" } }),
  searchShops: (query: AffiliatePlatformFeeShopQuery = {}) =>
    httpClient.request<AffiliatePlatformFeeShopPage>("/backoffice/affiliate/fee-rule-shops", { query }),
  createRule: (body: AffiliatePlatformFeeRuleCreateInput) =>
    httpClient.request<AffiliatePlatformFeeRule>("/backoffice/affiliate/fee-rules", { body, method: "POST" })
};
```

- [ ] **Step 4: Write failing pure-model tests**

```ts
expect(toFeeBps("10")).toBe(1000);
expect(toFeeBps("10.25")).toBe(1025);
expect(toFeeBps("10.256")).toBeNull();
expect(toFeeBps("100.01")).toBeNull();
expect(classifyAffiliateFeeRule(currentRule, "2026-08-30T02:00:00.000Z")).toBe("current");
expect(classifyAffiliateFeeRule(futureRule, "2026-08-30T02:00:00.000Z")).toBe("scheduled");
expect(validateAffiliateFeeDraft({ ...validDraft, scopeType: "shop", shop: null }, now))
  .toMatchObject({ shop: "required" });
expect(buildAffiliateFeeCreateInput({ ...validDraft, effectiveMode: "now" }, 2, now))
  .toMatchObject({ shopId: null, feeBps: 1000, expectedVersion: 2, effectiveFrom: now.toISOString() });
```

- [ ] **Step 5: Implement exact model helpers**

```ts
export function toFeeBps(value: string): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value.trim())) return null;
  const bps = Math.round(Number(value) * 100);
  return Number.isInteger(bps) && bps >= 0 && bps <= 10_000 ? bps : null;
}

export function classifyAffiliateFeeRule(rule: Pick<AffiliatePlatformFeeRule,
  "effectiveFrom" | "effectiveTo">, evaluatedAt: string) {
  const at = Date.parse(evaluatedAt);
  const from = Date.parse(rule.effectiveFrom);
  if (from > at) return "scheduled" as const;
  if (rule.effectiveTo === null || Date.parse(rule.effectiveTo) > at) return "current" as const;
  return "historical" as const;
}

export function validateAffiliateFeeDraft(draft: AffiliateFeeDraft, now: Date) {
  return {
    ...(draft.scopeType === "shop" && !draft.shop ? { shop: "required" as const } : {}),
    ...(toFeeBps(draft.percent) === null ? { percent: "invalid" as const } : {}),
    ...(draft.effectiveMode === "scheduled" &&
      (!draft.scheduledAt || Date.parse(draft.scheduledAt) <= now.getTime())
      ? { scheduledAt: "future" as const } : {}),
    ...(!draft.reason.trim() || draft.reason.trim().length > 500
      ? { reason: "invalid" as const } : {})
  };
}
```

`buildAffiliateFeeCreateInput` must set global `shopId` to `null`, use only `draft.shop.id` for shop scope, convert with `toFeeBps`, and choose `now.toISOString()` or `new Date(draft.scheduledAt).toISOString()`.

- [ ] **Step 6: Write and implement five-language copy tests**

Test and export the exact order:

```ts
export const affiliateFeeRuleLanguageOrder = ["ja", "en", "ko", "zh-Hant", "zh"] as const;
```

For every language, assert every string is non-empty. Core translations are:

| Key | ja | en | ko | zh-Hant | zh |
|---|---|---|---|---|---|
| title | アフィリエイト手数料ルール | Affiliate fee rules | 제휴 마케팅 수수료 규칙 | 聯盟行銷抽成規則 | 联盟营销抽成规则 |
| global | グローバル | Global | 전체 | 全域 | 全局 |
| shop | 店舗 | Shop | 매장 | 店鋪 | 店铺 |
| create | 新しいバージョンを作成 | Create new version | 새 버전 만들기 | 建立新版本 | 新建版本 |
| current | 現在有効 | Current | 현재 적용 | 目前生效 | 当前生效 |
| scheduled | 予約済み | Scheduled | 예약됨 | 已排程 | 已排期 |
| historical | 履歴 | Historical | 이전 기록 | 歷史版本 | 历史版本 |
| reason | 変更理由 | Change reason | 변경 사유 | 變更原因 | 变更原因 |

Define `AffiliateFeeRuleCopy` with these exact additional keys: `description`, `formalData`, `audit`, `snapshot`, `currentRate`, `nextRate`, `latestVersion`, `none`, `lifecycleWarning`, `history`, `allScopes`, `selectedShop`, `searchShops`, `searchPlaceholder`, `noShopResults`, `loading`, `loadFailed`, `retry`, `empty`, `rate`, `version`, `effectiveRange`, `status`, `operator`, `createdAt`, `drawerTitle`, `effectiveMode`, `now`, `scheduledAt`, `percent`, `reasonPlaceholder`, `continue`, `confirmTitle`, `oldRate`, `newRate`, `confirmCreate`, `cancel`, `saving`, `success`, `shopRequired`, `percentInvalid`, `futureRequired`, `reasonInvalid`, `sessionExpired`, `permissionDenied`, `shopUnavailable`, `conflict`, `policyConflict`, `saveFailed`, `previous`, `next`, and `pageSummary`. Implement a complete object literal for each of the five languages with the same keys; the test compares `Object.keys` against Japanese and rejects empty values. Korean must not fall back to English.

- [ ] **Step 7: Run Task 2 tests and frontend lint**

```bash
npm test -- src/api/affiliatePlatformFee.test.ts src/pages/admin/affiliateFeeRuleModel.test.ts src/pages/admin/affiliateFeeRuleCopy.test.ts
npm run lint
```

Expected: all tests PASS; TypeScript exits 0.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/api/affiliatePlatformFee.ts src/api/affiliatePlatformFee.test.ts src/pages/admin/affiliateFeeRuleModel.ts src/pages/admin/affiliateFeeRuleModel.test.ts src/pages/admin/affiliateFeeRuleCopy.ts src/pages/admin/affiliateFeeRuleCopy.test.ts
git commit -m "feat: add affiliate fee admin domain"
```

---

### Task 3: Build the operations page and immutable create flow

**Files:**
- Create: `src/pages/admin/AffiliateFeeRulesPage.tsx`
- Create: `src/pages/admin/AffiliateFeeRulesPage.test.ts`

**Interfaces:**
- Consumes: Task 2 API, types, model helpers, copy, `PermissionGate`, and existing admin UI components.
- Produces: `AffiliateFeeRulesPage` for protected routing in Task 4.

- [ ] **Step 1: Write a failing page contract test**

Use the repository's established source-contract test style and assert:

```ts
const source = readFileSync(new URL("./AffiliateFeeRulesPage.tsx", import.meta.url), "utf8");
expect(source).toContain("affiliatePlatformFeeApi.getGlobalSummary()");
expect(source).toContain("affiliatePlatformFeeApi.listRules(");
expect(source).toContain("affiliatePlatformFeeApi.searchShops(");
expect(source).toContain("affiliatePlatformFeeApi.createRule(");
expect(source).toContain('permission="button:backoffice-affiliate-fee-rule-create"');
expect(source).toContain("setTimeout(");
expect(source).toContain("350");
expect(source).toContain("historyRequestId");
expect(source).toContain("searchRequestId");
expect(source).toContain("expectedVersion");
expect(source).not.toMatch(/localStorage|sessionStorage|data\/mock|backofficeRealDataApi\.shops/);
```

- [ ] **Step 2: Run the page test and verify failure**

Run: `npm test -- src/pages/admin/AffiliateFeeRulesPage.test.ts`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement independent summary and history loading**

Create typed state:

```ts
const pageSize = 20;
const [summary, setSummary] = useState<AffiliatePlatformFeeRuleSummary | null>(null);
const [summaryStatus, setSummaryStatus] = useState<LoadStatus>("loading");
const [rows, setRows] = useState<AffiliatePlatformFeeRule[]>([]);
const [historyStatus, setHistoryStatus] = useState<LoadStatus>("loading");
const [scopeFilter, setScopeFilter] = useState<"all" | AffiliatePlatformFeeScope>("all");
const [shopFilter, setShopFilter] = useState<AffiliatePlatformFeeShopOption | null>(null);
const [page, setPage] = useState(1);
```

`loadSummary` calls `getGlobalSummary`. `loadHistory` calls `listRules` with `page`, `pageSize`, optional scope, and selected shop. Use request identity so stale filter responses cannot replace newer state. Each panel has independent loading/error/retry state.

Render with `AdminLayout`, `ModuleShell`, summary cards, lifecycle warning, scope filters, selected-shop filter, server-paginated `DataTable`, localized status badges, and immutable rows with no edit/delete controls.

- [ ] **Step 4: Implement debounced formal shop selection**

Use a 350 ms debounce and stale-response guard:

```ts
useEffect(() => {
  if (!drawerOpen && scopeFilter !== "shop") return;
  const requestId = ++searchRequestId.current;
  const timer = window.setTimeout(() => {
    setShopSearchStatus("loading");
    affiliatePlatformFeeApi.searchShops({
      keyword: shopKeyword.trim() || undefined, page: 1, pageSize: 10
    }).then((result) => {
      if (requestId !== searchRequestId.current) return;
      setShopOptions(result.list);
      setShopSearchStatus("success");
    }).catch((error: unknown) => {
      if (requestId !== searchRequestId.current) return;
      setShopOptions([]);
      setShopSearchError(describeFeeRuleError(error, copy));
      setShopSearchStatus("error");
    });
  }, 350);
  return () => window.clearTimeout(timer);
}, [copy, drawerOpen, scopeFilter, shopKeyword]);
```

Clicking an option stores `{id,name,city}`. Editing the keyword after selection clears it. There is no numeric/free-form `shopId` field.

- [ ] **Step 5: Implement validation, confirmation, create, and 409 recovery**

The first action validates the draft and loads the latest target rule using `page: 1, pageSize: 1`. Store `expectedVersion`, old rate, and confirmation snapshot. The final action submits:

```ts
const input = buildAffiliateFeeCreateInput(draft, expectedVersion, new Date());
await affiliatePlatformFeeApi.createRule(input);
setDrawerOpen(false);
resetDraft();
await Promise.all([loadSummary(), loadHistory()]);
```

On `409`, preserve the draft, reload the same target scope, set `expectedVersion` from `latest?.version ?? 0`, clear confirmation, display localized conflict copy, and require reconfirmation. On `404`, clear only the selected shop. All other failures preserve every draft field. Disable final submission while saving.

- [ ] **Step 6: Expand page tests for failure and immutability contracts**

```ts
expect(source).toContain("pageSize: 1");
expect(source).toContain("error.status === 409");
expect(source).toContain("error.status === 404");
expect(source).toContain("setExpectedVersion(latest?.version ?? 0)");
expect(source).toContain("setConfirmation(null)");
expect(source).toContain("disabled={saving}");
expect(source).not.toContain("deleteRule");
expect(source).not.toContain("updateRule");
```

Also test the pure create-input helper for global/shop and immediate/scheduled modes.

- [ ] **Step 7: Run Task 3 tests and lint**

```bash
npm test -- src/pages/admin/AffiliateFeeRulesPage.test.ts src/pages/admin/affiliateFeeRuleModel.test.ts src/pages/admin/affiliateFeeRuleCopy.test.ts src/api/affiliatePlatformFee.test.ts
npm run lint
```

Expected: all tests PASS; TypeScript exits 0.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/pages/admin/AffiliateFeeRulesPage.tsx src/pages/admin/AffiliateFeeRulesPage.test.ts
git commit -m "feat: add affiliate fee operations page"
```

---

### Task 4: Wire permissions, verify the slice, and perform non-mutating browser acceptance

**Files:**
- Modify: `src/App.tsx:13-16,1397-1401`
- Modify: `src/components/admin/AdminLayout.tsx:103-110`
- Modify: `src/pages/admin/AdminCapabilityRoutes.test.ts:100-150,200-250`
- Modify: `src/components/admin/AdminLayout.test.ts`
- Modify: `docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md`

**Interfaces:**
- Consumes: `AffiliateFeeRulesPage` from Task 3 and existing fee-rule permissions.
- Produces: discoverable protected page and final verification evidence.

- [ ] **Step 1: Write failing route/navigation tests**

```ts
expect(appSource).toContain('import { AffiliateFeeRulesPage } from "./pages/admin/AffiliateFeeRulesPage"');
expect(appSource).toContain(
  'path="/admin/afirieito/fee-rules" element={protectPermission("admin", "page:backoffice-affiliate-fee-rule", <AffiliateFeeRulesPage />)}'
);
expect(adminLayoutSource).toContain('label: "平台抽成规则"');
expect(adminLayoutSource).toContain('to: "/admin/afirieito/fee-rules"');
expect(adminLayoutSource).toContain('permission: "page:backoffice-affiliate-fee-rule"');
expect(adminLayoutSource.indexOf('label: "平台抽成规则"')).toBeGreaterThan(
  adminLayoutSource.indexOf('label: "联盟营销任务"')
);
```

Add an active-route specificity assertion proving `/admin/afirieito/fee-rules` selects the fee item instead of its `/admin/afirieito` parent task item.

- [ ] **Step 2: Run route/navigation tests and verify failure**

Run: `npm test -- src/pages/admin/AdminCapabilityRoutes.test.ts src/components/admin/AdminLayout.test.ts`

Expected: FAIL because import, route, and navigation item are absent.

- [ ] **Step 3: Wire the page into App and AdminLayout**

```tsx
import { AffiliateFeeRulesPage } from "./pages/admin/AffiliateFeeRulesPage";

<Route
  path="/admin/afirieito/fee-rules"
  element={protectPermission("admin", "page:backoffice-affiliate-fee-rule", <AffiliateFeeRulesPage />)}
/>
```

Add below the task item while keeping the Affiliate `TEST` badge:

```ts
{
  label: "平台抽成规则",
  to: "/admin/afirieito/fee-rules",
  icon: "率",
  permission: "page:backoffice-affiliate-fee-rule",
  children: ["全局费率", "店铺覆盖", "版本历史"]
}
```

- [ ] **Step 4: Update Step 12 documentation**

Append a dated section documenting the two read routes, existing list/create routes, read/write permissions, immutable version behavior, minimal shop projection, absence of migration, and non-mutating browser-acceptance rule.

- [ ] **Step 5: Run focused and full automated verification**

```bash
npm test -- src/api/affiliatePlatformFee.test.ts src/pages/admin/affiliateFeeRuleModel.test.ts src/pages/admin/affiliateFeeRuleCopy.test.ts src/pages/admin/AffiliateFeeRulesPage.test.ts src/pages/admin/AdminCapabilityRoutes.test.ts src/components/admin/AdminLayout.test.ts
npm run lint
npm run verify:production-build
cd backend && npm test -- tests/affiliate-platform-fee.repository.test.ts tests/affiliate-platform-fee.service.test.ts tests/affiliate-platform-fee-api.test.ts tests/openapi.test.ts --runInBand
cd backend && npm run lint
cd backend && npm run build
```

Expected: all focused suites pass; both lints/builds and formal bundle audit exit 0.

Run regressions:

```bash
npm test
cd backend && npm test
```

Expected: every non-skipped repository suite passes. Record exact pass/skip totals.

- [ ] **Step 6: Perform authenticated, non-mutating browser acceptance**

Start or verify the formal backend/frontend for this worktree, identify the actual frontend port, and open:

```text
pf-admin.html#/admin/afirieito/fee-rules
```

Check desktop and narrow/mobile-emulated widths for:

- Affiliate `TEST` section and dedicated menu item;
- real current/scheduled summary;
- all/global/shop filtering and server pagination;
- formal shop search and selection-only behavior;
- create drawer validation, confirmation, and permission-gated action;
- no overflow, blank/recovery page, console exception, 401 loop, or request storm.

Do not send the final create request. Isolated backend integration tests prove the immutable write behavior.

- [ ] **Step 7: Review diff and commit Task 4**

```bash
git diff --check
git status --short
git diff --stat
git add src/App.tsx src/components/admin/AdminLayout.tsx src/pages/admin/AdminCapabilityRoutes.test.ts src/components/admin/AdminLayout.test.ts docs/12_BACKOFFICE_MERCHANT_ADMIN_REAL_DATA.md
git commit -m "feat: wire affiliate fee operations UI"
```

- [ ] **Step 8: Produce completion handoff**

Report branch/commits, exact test totals, browser route/viewports/console result, no persistent fee mutation, remaining Affiliate micro-steps, and an explicit statement that `main` was not touched or merged.

---

## Self-review record

- **Spec coverage:** Navigation, server-correct summary, history, minimal shop search, creation, RBAC, 409 recovery, five languages, tests, browser QA, and non-goals each map to a task.
- **Placeholder scan:** No `TBD`, implementation `TODO`, `FIXME`, “implement later”, or unspecified error/test action remains.
- **Type consistency:** Backend and frontend consistently use `shopName`, `shopCity`, `evaluatedAt`, `current`, `nextScheduled`, `latestVersion`, `AffiliatePlatformFeeShopOption`, and `expectedVersion`. Routes match the approved design.
