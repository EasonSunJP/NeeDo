# Membership Detail and Rankings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the member-count/utilizer contract, member trend/list details, and service/technician/customer TOP10 rankings with GMV/count switching.

**Architecture:** Read membership from formal shop membership/card tables and consumption from completed checkout evidence. Add focused paginated analytics endpoints and reuse the existing dashboard filter and technician-ranking infrastructure where its scope and sorting remain correct.

**Tech Stack:** Prisma/MySQL, Express, Zod, Jest/Supertest, React, Vitest

## Global Constraints

- Store member count = distinct users with an active, unexpired formal shop membership card.
- Utilizer count = distinct users with at least one completed order in the selected period; repeated use counts once.
- New paid members = first paid card activation in the selected period; gifts, trials and renewals are excluded.
- Ranking GMV = completed checkout payable amount, not claimed cash actually received.
- Exclude incomplete, cancelled, fully refunded and reversed orders.
- Sort selected metric descending, other metric descending, registration time ascending, numeric ID ascending.
- Member list is formally paginated and supports city, time, NeeDo ID and nickname filters.

---

### Task 1: Replace the merchant membership placeholder with formal facts

**Files:**
- Create: `backend/src/repositories/dashboard-membership.repository.ts`
- Modify: `backend/src/repositories/dashboard.repository.ts`
- Modify: `backend/src/domain/dashboard.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Create: `backend/tests/dashboard-membership.repository.test.ts`
- Modify: `backend/tests/dashboard-service.test.ts`

**Interfaces:**
- Produces: `DashboardMembershipFacts`
- Produces payload `{ memberCount, memberDataStatus: "ready", completedCustomerCount }`

- [ ] **Step 1: Write failing repository tests**

```ts
expect(await reader.getMembershipFacts(input)).toEqual({
  memberCount: 2,
  completedCustomerCount: 3
});
```

Fixtures include one expired card, two active cards for the same member, one repeated customer and one cancelled-only customer.

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- dashboard-membership.repository.test.ts`

Expected: FAIL because the reader is absent.

- [ ] **Step 3: Implement distinct formal queries**

Membership uses `ShopCustomerMembership.status = ACTIVE`, non-deleted `ShopMembershipCard.status = ACTIVE`, `issuedAt <= now`, and `expiresAt IS NULL OR expiresAt > now`. Utilizers use the completed-consumption definition from the order-settlement plan and filter checkout completion time within the dashboard window.

- [ ] **Step 4: Run repository/service tests**

Run: `cd backend && npm test -- dashboard-membership.repository.test.ts dashboard-service.test.ts dashboard-merchant.repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit formal membership facts**

```bash
git add backend/src/repositories/dashboard-membership.repository.ts backend/src/repositories/dashboard.repository.ts backend/src/domain/dashboard.ts backend/src/services/backoffice.service.ts backend/tests/dashboard-membership.repository.test.ts backend/tests/dashboard-service.test.ts
git commit -m "feat: expose formal merchant membership facts"
```

### Task 2: Add member trend and paginated member-list APIs

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260901103000_membership_acquisition_sources/migration.sql`
- Create: `backend/src/repositories/membership-analytics.repository.ts`
- Create: `backend/src/services/membership-analytics.service.ts`
- Create: `backend/src/controllers/membership-analytics.controller.ts`
- Create: `backend/src/validators/membership-analytics.validator.ts`
- Create: `backend/src/routes/membership-analytics.routes.ts`
- Modify: `backend/src/services/shop-membership-card-issuance.service.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/membership-analytics.service.test.ts`
- Create: `backend/tests/membership-analytics-api.test.ts`
- Create: `backend/tests/membership-acquisition-source-schema.test.ts`
- Modify: `backend/tests/shop-membership-card-issuance.service.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/backoffice/analytics/members/trend`
- Produces: `GET /api/v1/backoffice/analytics/members`
- Produces: merchant-scoped equivalents under `/api/v1/merchant-admin/analytics/members`

- [ ] **Step 1: Write failing validator/service tests**

```ts
expect(memberListQuerySchema.parse({ page: "1", pageSize: "20", city: "Tokyo", needoId: "u0000000041", nickname: "美咲" })).toMatchObject({ page: 1, pageSize: 20 });
expect(await service.listMembers(actor, context, query)).toMatchObject({ total: 1, page: 1, page_size: 20 });
for (const source of ["ONLINE_PAID", "GIFT", "TRIAL", "RENEWAL"]) expect(schema).toContain(source);
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- membership-acquisition-source-schema.test.ts membership-analytics.service.test.ts`

Expected: FAIL because analytics service is absent.

- [ ] **Step 3: Implement acquisition sources and strict paginated reads**

```ts
export interface MemberAnalyticsListItem {
  needoId: string;
  nickname: string;
  city: string;
  shopPublicId: string;
  planName: string;
  cardNo: string;
  firstPaidAt: string | null;
  status: "active" | "expired" | "frozen";
  expiresAt: string | null;
}
```

Extend `ShopMembershipCardIssuanceSource` with `ONLINE_PAID`, `GIFT`, `TRIAL`, and `RENEWAL` while preserving `OFFLINE_PAID`, `HISTORICAL_REPLACEMENT`, and `MANUAL_GRANT`. New paid-member growth accepts only the first `OFFLINE_PAID` or `ONLINE_PAID` activation for each user; later paid cards are renewals by sequence even if a caller supplies the wrong source and must be rejected by the issuance service. Trend returns fixed `added`, `removed`, `net` series; added/removed events use card activation/expiration-or-revocation timestamps, never current-row creation alone.

- [ ] **Step 4: Run API, pagination and RBAC tests**

Run: `cd backend && npm run prisma:generate && npm test -- membership-acquisition-source-schema.test.ts membership-analytics.service.test.ts membership-analytics-api.test.ts shop-membership-card-issuance.service.test.ts`

Expected: PASS including cross-shop denial and empty results.

- [ ] **Step 5: Commit member analytics APIs**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260901103000_membership_acquisition_sources/migration.sql backend/src/repositories/membership-analytics.repository.ts backend/src/services/membership-analytics.service.ts backend/src/controllers/membership-analytics.controller.ts backend/src/validators/membership-analytics.validator.ts backend/src/routes/membership-analytics.routes.ts backend/src/services/shop-membership-card-issuance.service.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/tests/membership-acquisition-source-schema.test.ts backend/tests/membership-analytics.service.test.ts backend/tests/membership-analytics-api.test.ts backend/tests/shop-membership-card-issuance.service.test.ts
git commit -m "feat: add formal member analytics APIs"
```

### Task 3: Implement one ranking repository for three entity types

**Files:**
- Create: `backend/src/domain/analytics-ranking.ts`
- Create: `backend/src/repositories/analytics-ranking.repository.ts`
- Create: `backend/tests/analytics-ranking.repository.test.ts`
- Create: `backend/tests/analytics-ranking.repository.integration.test.ts`

**Interfaces:**
- Produces: `RankingKind = "service" | "technician" | "customer"`
- Produces: `RankingMetric = "gmv" | "completedCount"`
- Produces: `listTop10(input): Promise<AnalyticsRankingItem[]>`

- [ ] **Step 1: Write failing deterministic-sort tests**

```ts
expect(items.map((item) => item.entityNumericId)).toEqual([7, 9, 11]);
expect(items[0]).toMatchObject({ gmvJpy: 12000, completedCount: 2 });
```

All three fixtures have equal selected and secondary metrics; IDs 7 and 9 have the same registration time, while ID 11 registered later.

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- analytics-ranking.repository.test.ts`

Expected: FAIL because ranking repository is absent.

- [ ] **Step 3: Implement aggregation and sort locks**

```ts
export interface AnalyticsRankingItem {
  rank: number;
  entityPublicId: string;
  entityNumericId: number;
  displayName: string;
  avatarUrl: string | null;
  categoryId: number | null;
  gmvJpy: number;
  completedCount: number;
  registeredAt: string;
}
```

For `gmv`, order by `gmvJpy DESC, completedCount DESC, registeredAt ASC, entityNumericId ASC`; reverse the first two fields for `completedCount`. Service ranking attributes accepted add-on GMV/count to the add-on service while the base order remains attributed to its base service.

- [ ] **Step 4: Run unit/integration tests**

Run: `cd backend && npm test -- analytics-ranking.repository.test.ts analytics-ranking.repository.integration.test.ts technician-ranking-repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit ranking aggregation**

```bash
git add backend/src/domain/analytics-ranking.ts backend/src/repositories/analytics-ranking.repository.ts backend/tests/analytics-ranking.repository.test.ts backend/tests/analytics-ranking.repository.integration.test.ts
git commit -m "feat: aggregate deterministic analytics rankings"
```

### Task 4: Expose rankings with city/time/category filters

**Files:**
- Create: `backend/src/services/analytics-ranking.service.ts`
- Create: `backend/src/controllers/analytics-ranking.controller.ts`
- Create: `backend/src/validators/analytics-ranking.validator.ts`
- Create: `backend/src/routes/analytics-ranking.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/analytics-ranking-api.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/backoffice/analytics/rankings/:kind`
- Query: `metric`, dashboard period fields, `city`, optional `categoryId`
- Permission: `backoffice:analytics-ranking:read`

- [ ] **Step 1: Write failing route/validation tests**

```ts
await request(app).get("/api/v1/backoffice/analytics/rankings/technician?metric=gmv&period=last7days&city=Tokyo&categoryId=3").set(auth).expect(200);
await request(app).get("/api/v1/backoffice/analytics/rankings/shop?metric=gmv&period=last7days").set(auth).expect(400);
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- analytics-ranking-api.test.ts`

Expected: FAIL because the route is absent.

- [ ] **Step 3: Implement service/controller/routes**

Reuse `resolveDashboardWindow` for time boundaries and use active `Category` records for the category filter. Return exactly ten rows at most; this is not a general unbounded list endpoint.

- [ ] **Step 4: Run API and existing technician ranking tests**

Run: `cd backend && npm test -- analytics-ranking-api.test.ts technician-ranking-period.test.ts technician-ranking-repository.test.ts`

Expected: PASS and the existing technician-ranking endpoint remains compatible.

- [ ] **Step 5: Commit ranking APIs**

```bash
git add backend/src/services/analytics-ranking.service.ts backend/src/controllers/analytics-ranking.controller.ts backend/src/validators/analytics-ranking.validator.ts backend/src/routes/analytics-ranking.routes.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/tests/analytics-ranking-api.test.ts
git commit -m "feat: expose filtered dashboard rankings"
```

### Task 5: Build the member detail page

**Files:**
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeDashboard.test.ts`
- Create: `src/pages/admin/MembershipAnalyticsPage.tsx`
- Create: `src/pages/admin/MembershipAnalyticsPage.test.tsx`
- Modify: `src/pages/admin/DashboardPage.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: Task 2 endpoints
- Produces: `/admin/analytics/members` and merchant-scoped member detail route

- [ ] **Step 1: Write failing list/filter/legend tests**

```tsx
expect(screen.getByLabelText("NeeDo ID")).toBeVisible();
expect(screen.getByLabelText("昵称")).toBeVisible();
await user.click(screen.getByRole("button", { name: "隐藏减少" }));
expect(screen.getByText("u0000000041")).toBeVisible();
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/pages/admin/MembershipAnalyticsPage.test.tsx`

Expected: FAIL because the page is absent.

- [ ] **Step 3: Implement formal loading and pagination**

Use `DashboardFilterBar` for city/time, controlled NeeDo ID/nickname fields, explicit Search/Reset buttons and API-driven pages. Render fixed added/removed/net series through `AnalyticsMetricDetail`; no operator-defined series editor.

- [ ] **Step 4: Run page/API tests**

Run: `npm test -- src/pages/admin/MembershipAnalyticsPage.test.tsx src/api/backofficeDashboard.test.ts src/pages/admin/DashboardPage.test.ts src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit member detail UI**

```bash
git add src/api/backofficeRealData.ts src/api/backofficeDashboard.test.ts src/pages/admin/MembershipAnalyticsPage.tsx src/pages/admin/MembershipAnalyticsPage.test.tsx src/pages/admin/DashboardPage.tsx src/pages/merchant-admin/MerchantAdminDashboardPage.tsx src/App.tsx src/App.test.tsx src/i18n/translations.ts
git commit -m "feat: add member analytics detail page"
```

### Task 6: Add the three toggleable TOP10 panels

**Files:**
- Create: `src/features/dashboard/AnalyticsRankingPanel.tsx`
- Create: `src/features/dashboard/AnalyticsRankingPanel.test.tsx`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/pages/admin/DashboardPage.tsx`
- Modify: `src/pages/admin/DashboardPage.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: Task 4 endpoint
- Produces: service, technician and customer panels with `gmv`/`completedCount` toggle

- [ ] **Step 1: Write failing toggle and category tests**

```tsx
await user.click(screen.getByRole("button", { name: "按完成次数" }));
expect(api.rankings).toHaveBeenLastCalledWith("technician", expect.objectContaining({ metric: "completedCount", categoryId: 3 }));
expect(screen.getAllByRole("listitem")).toHaveLength(10);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/features/dashboard/AnalyticsRankingPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the three panels**

Each panel keeps its own metric toggle but consumes the page city/time/category filters. Display both GMV and count per row, highlighting the selected measure. Do not re-sort API rows in React.

- [ ] **Step 4: Run dashboard tests, lint and build**

Run: `npm test -- src/features/dashboard/AnalyticsRankingPanel.test.tsx src/pages/admin/DashboardPage.test.ts && npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit ranking panels**

```bash
git add src/features/dashboard/AnalyticsRankingPanel.tsx src/features/dashboard/AnalyticsRankingPanel.test.tsx src/api/backofficeRealData.ts src/pages/admin/DashboardPage.tsx src/pages/admin/DashboardPage.test.ts src/i18n/translations.ts
git commit -m "feat: add switchable dashboard rankings"
```

### Task 7: Publish membership and ranking OpenAPI schemas

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/membership-ranking-openapi.test.ts`

**Interfaces:**
- Documents member trend/list and three ranking endpoints with pagination and filters

- [ ] **Step 1: Write the failing OpenAPI test**

```ts
expect(document.paths["/api/v1/backoffice/analytics/members"]).toBeDefined();
expect(document.paths["/api/v1/backoffice/analytics/rankings/{kind}"]).toBeDefined();
expect(document.components.schemas.AnalyticsRankingItem).toBeDefined();
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- membership-ranking-openapi.test.ts`

Expected: FAIL on missing paths/schema.

- [ ] **Step 3: Add exact member/ranking schemas**

Document city/time/NeeDo ID/nickname queries, strict pagination names, ranking kind/metric/category filters, member statuses and deterministic response fields.

- [ ] **Step 4: Run OpenAPI/API tests**

Run: `cd backend && npm test -- membership-ranking-openapi.test.ts openapi.test.ts membership-analytics-api.test.ts analytics-ranking-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit API documentation**

```bash
git add backend/src/api/openapi.ts backend/tests/membership-ranking-openapi.test.ts
git commit -m "docs: publish membership ranking API contract"
```

### Task 8: Verify membership and ranking acceptance

**Files:**
- Create: `backend/scripts/check-membership-ranking-flow.ts`
- Create: `backend/tests/membership-ranking-flow-script.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces command `npm run check:membership-ranking`

- [ ] **Step 1: Write the coverage test**

```ts
expect(script).toContain("gift");
expect(script).toContain("renewal");
expect(script).toContain("fullyReversed");
expect(script).toContain("registeredAt");
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- membership-ranking-flow-script.test.ts`

Expected: FAIL because the script is absent.

- [ ] **Step 3: Implement a rollback-only formal fixture check**

Assert active/expired/duplicate-card membership counts, paid/gift/trial/renewal growth, repeated utilizers, both ranking metrics, category/city/time filters and deterministic ties.

- [ ] **Step 4: Run all gates and browser replay**

Run: `cd backend && npm test -- membership analytics-ranking && npm run build`

Run: `npm test -- src/features/dashboard src/pages/admin/MembershipAnalyticsPage.test.tsx && npm run lint && npm run build`

Verify member search/pagination, legend toggles, ranking switches and narrow viewport overflow on standard ports.

- [ ] **Step 5: Commit verification**

```bash
git add backend/scripts/check-membership-ranking-flow.ts backend/tests/membership-ranking-flow-script.test.ts backend/package.json
git commit -m "test: verify membership and ranking analytics"
```
