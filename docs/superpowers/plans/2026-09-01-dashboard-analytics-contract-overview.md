# Dashboard Analytics Contract and Comprehensive Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing unified dashboards with a reusable metric contract, comprehensive operations overview, formulas, prior-period comparisons and formal detail pages.

**Architecture:** Keep `DashboardRepository` as the aggregate facade, split large metric groups into focused readers, and compose typed payloads in `BackofficeService`. React consumes the payload verbatim through reusable metric/info/detail components.

**Tech Stack:** Prisma/MySQL, Express, Zod, Jest, React, TypeScript, Vitest

## Global Constraints

- Current and previous values use identical scope, city, business timezone and equal-length adjacent windows.
- Equal values display `+0%`; previous 0/current positive is `+100%`; current 0/previous positive is `-100%`.
- Every metric has a circled information control with description and formula.
- Every metric has a detail route except franchisee/supplier `TEST` growth metrics.
- `travelFare`, `consumablesSales` and `consumablesProfit` return `not_connected`/`null` until a formal source exists.
- Details use fixed product-defined series; legend clicks only show/hide series.
- Do not calculate financial aggregates or comparison percentages in React.

---

### Task 1: Lock the shared metric and comparison types

**Files:**
- Modify: `backend/src/domain/dashboard.ts`
- Create: `backend/src/domain/analytics-metric.ts`
- Create: `backend/tests/analytics-metric.test.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeDashboard.test.ts`

**Interfaces:**
- Produces: `AnalyticsMetricPayload`, `AnalyticsMetricSeries`, `compareAnalyticsMetric(current, previous)`

- [ ] **Step 1: Write failing comparison tests**

```ts
expect(compareAnalyticsMetric(10, 10)).toEqual({ comparisonPercent: 0, comparisonDirection: "flat" });
expect(compareAnalyticsMetric(3, 0)).toEqual({ comparisonPercent: 100, comparisonDirection: "up" });
expect(compareAnalyticsMetric(0, 3)).toEqual({ comparisonPercent: -100, comparisonDirection: "down" });
expect(compareAnalyticsMetric(null, null)).toEqual({ comparisonPercent: null, comparisonDirection: "unavailable" });
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- analytics-metric.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the locked contract**

```ts
export type AnalyticsDataStatus = "ready" | "not_connected" | "not_available";
export type AnalyticsComparisonDirection = "up" | "down" | "flat" | "unavailable";
export interface AnalyticsMetricPayload {
  metricKey: string;
  currentValue: number | null;
  previousValue: number | null;
  comparisonPercent: number | null;
  comparisonDirection: AnalyticsComparisonDirection;
  unit: "jpy" | "ndp" | "people" | "count";
  dataStatus: AnalyticsDataStatus;
  description: string;
  formula: string;
  detailRoute: string | null;
}
```

`compareAnalyticsMetric` returns the four exact edge cases above and otherwise rounds to two decimal places.

- [ ] **Step 4: Run backend and frontend contract tests**

Run: `cd backend && npm test -- analytics-metric.test.ts dashboard-service.test.ts`

Run: `npm test -- src/api/backofficeDashboard.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add backend/src/domain/analytics-metric.ts backend/src/domain/dashboard.ts backend/tests/analytics-metric.test.ts src/api/backofficeRealData.ts src/api/backofficeDashboard.test.ts
git commit -m "feat: define shared analytics metric contract"
```

### Task 2: Aggregate operations-finance metrics

**Files:**
- Create: `backend/src/repositories/dashboard-operations-finance.repository.ts`
- Modify: `backend/src/repositories/dashboard.repository.ts`
- Create: `backend/tests/dashboard-operations-finance.repository.test.ts`
- Create: `backend/tests/dashboard-operations-finance.repository.integration.test.ts`

**Interfaces:**
- Produces: `getOperationsFinance(input): Promise<OperationsFinanceFacts>`
- Produces keys: `grossRevenue`, `travelFare`, `discountAmount`, `consumablesSales`

- [ ] **Step 1: Write failing repository tests**

```ts
expect(await reader.getOperationsFinance(input)).toEqual({
  grossRevenue: { current: 12000, previous: 8000 },
  travelFare: { current: null, previous: null, dataStatus: "not_connected" },
  discountAmount: { current: 1500, previous: 500 },
  consumablesSales: { current: null, previous: null, dataStatus: "not_connected" }
});
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- dashboard-operations-finance.repository.test.ts`

Expected: FAIL because the reader does not exist.

- [ ] **Step 3: Implement repository aggregation**

Gross revenue sums `OrderCheckout.checkoutAmountJpy` only for completed orders with valid payment evidence and without full reversal. Discount amount sums immutable original snapshot minus checkout discount price, never a current catalog price. Apply the same period-table and city/shop scope pattern already used by `DashboardRepository`.

- [ ] **Step 4: Run unit and integration tests**

Run: `cd backend && npm test -- dashboard-operations-finance.repository.test.ts dashboard-operations-finance.repository.integration.test.ts`

Expected: PASS including completed/cancelled/refunded/other-city fixtures.

- [ ] **Step 5: Commit operations finance**

```bash
git add backend/src/repositories/dashboard-operations-finance.repository.ts backend/src/repositories/dashboard.repository.ts backend/tests/dashboard-operations-finance.repository.test.ts backend/tests/dashboard-operations-finance.repository.integration.test.ts
git commit -m "feat: aggregate operations finance metrics"
```

### Task 3: Aggregate commission and growth metrics

**Files:**
- Create: `backend/src/repositories/dashboard-commission.repository.ts`
- Create: `backend/src/repositories/dashboard-growth.repository.ts`
- Modify: `backend/src/repositories/dashboard.repository.ts`
- Create: `backend/tests/dashboard-commission.repository.test.ts`
- Create: `backend/tests/dashboard-growth.repository.test.ts`

**Interfaces:**
- Produces commission keys: `dedicatedTechnicianCommission`, `partTimeTechnicianCommission`, `marketingCommission`, `agentCommission`, `ndpIncome`, `affiliatePlatformIncome`, `consumablesProfit`
- Produces growth keys: `newUsers`, `newPaidMembers`, `technicianOnboarding`, `agentOnboarding`, `franchiseeOnboarding`, `supplierOnboarding`

- [ ] **Step 1: Write failing commission month-boundary tests**

```ts
expect(await reader.getTechnicianCommission({
  monthlyBaseJpy: 310000,
  range: { from: "2026-01-30", to: "2026-02-02" },
  activeDays: ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"],
  settledShareJpy: 12000
})).toBe(52000);
```

This proves January uses 31 days and February uses 28 days rather than dividing the entire range by 30.

- [ ] **Step 2: Write failing growth-definition tests**

```ts
expect(facts.newPaidMembers.current).toBe(1);
expect(fixtures.filter((row) => row.kind === "gift" || row.kind === "trial" || row.kind === "renewal")).toHaveLength(3);
```

- [ ] **Step 3: Implement the two focused readers**

Dedicated and part-time commission readers consume versioned compensation/payroll records and settled shares; marketing and affiliate values consume confirmed affiliate settlement facts. Agent commission and agent/franchisee/supplier onboarding depend on the partner/settlement plan; until those tables exist, return `not_available`, not 0. New-user, paid-member and technician growth count the first formal activation event in range and use distinct user IDs. The agent plan replaces those four unavailable outputs with formal partner facts.

- [ ] **Step 4: Run focused tests**

Run: `cd backend && npm test -- dashboard-commission.repository.test.ts dashboard-growth.repository.test.ts compensation-engine-service.test.ts payroll-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit commission and growth readers**

```bash
git add backend/src/repositories/dashboard-commission.repository.ts backend/src/repositories/dashboard-growth.repository.ts backend/src/repositories/dashboard.repository.ts backend/tests/dashboard-commission.repository.test.ts backend/tests/dashboard-growth.repository.test.ts
git commit -m "feat: aggregate commission and growth metrics"
```

### Task 4: Compose overview and metric-detail APIs

**Files:**
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/controllers/backoffice.controller.ts`
- Modify: `backend/src/validators/backoffice.validator.ts`
- Modify: `backend/src/routes/backoffice.routes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/dashboard-overview-service.test.ts`
- Create: `backend/tests/dashboard-metric-detail-api.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/backoffice/dashboard/overview`
- Produces: `GET /api/v1/backoffice/dashboard/metrics/:metricKey`
- Produces permission `backoffice:dashboard-detail:read`

- [ ] **Step 1: Write failing overview composition test**

```ts
const result = await service.getDashboardOverview(actor, context, query);
expect(result.operationsFinance.map((item) => item.metricKey)).toEqual([
  "gross_revenue", "travel_fare", "discount_amount", "consumables_sales"
]);
expect(result.growth.find((item) => item.metricKey === "franchisee_onboarding")?.detailRoute).toBeNull();
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- dashboard-overview-service.test.ts`

Expected: FAIL because overview method is absent.

- [ ] **Step 3: Implement service metadata and detail whitelist**

```ts
export const DASHBOARD_METRIC_KEYS = [
  "gross_revenue", "travel_fare", "discount_amount", "consumables_sales",
  "dedicated_technician_commission", "part_time_technician_commission",
  "marketing_commission", "agent_commission", "ndp_income",
  "affiliate_platform_income", "consumables_profit", "new_users",
  "new_paid_members", "technician_onboarding", "agent_onboarding",
  "franchisee_onboarding", "supplier_onboarding"
] as const;
```

The detail validator accepts only this enum. Service metadata supplies exact description/formula/unit/detail route, while repositories supply values/status.

- [ ] **Step 4: Run service/API/RBAC tests**

Run: `cd backend && npm test -- dashboard-overview-service.test.ts dashboard-metric-detail-api.test.ts dashboard-service.test.ts`

Expected: PASS and unknown metric keys return validation error.

- [ ] **Step 5: Commit the overview APIs**

```bash
git add backend/src/services/backoffice.service.ts backend/src/controllers/backoffice.controller.ts backend/src/validators/backoffice.validator.ts backend/src/routes/backoffice.routes.ts backend/src/constants/permissions.constants.ts backend/tests/dashboard-overview-service.test.ts backend/tests/dashboard-metric-detail-api.test.ts
git commit -m "feat: expose comprehensive dashboard overview"
```

### Task 5: Add reusable information cards and legend-toggle details

**Files:**
- Modify: `src/features/dashboard/DashboardMetricCard.tsx`
- Modify: `src/features/dashboard/DashboardMetricCard.test.tsx`
- Modify: `src/features/dashboard/DashboardCharts.tsx`
- Modify: `src/features/dashboard/DashboardCharts.test.tsx`
- Create: `src/features/dashboard/AnalyticsMetricGrid.tsx`
- Create: `src/features/dashboard/AnalyticsMetricDetail.tsx`
- Create: `src/features/dashboard/AnalyticsMetricDetail.test.tsx`

**Interfaces:**
- Consumes: `AnalyticsMetricPayload`
- Produces: `AnalyticsMetricGrid`, `AnalyticsMetricDetail`, legend buttons with `aria-pressed`

- [ ] **Step 1: Write failing card and legend tests**

```tsx
expect(screen.getByRole("button", { name: "查看营业总额说明和计算公式" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "隐藏减少" }));
expect(screen.getByRole("button", { name: "显示减少" })).toHaveAttribute("aria-pressed", "false");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/features/dashboard/DashboardMetricCard.test.tsx src/features/dashboard/AnalyticsMetricDetail.test.tsx`

Expected: FAIL because the detail component and accessible info control are absent.

- [ ] **Step 3: Implement exact rendering rules**

Render `—` plus the status message when value is null, render numeric zero when value is 0, render previous value under the main number and signed comparison on the right. Use `TitleWithInfo` for formula text. Maintain `Set<string>` of visible series locally; never mutate server/config data.

- [ ] **Step 4: Run dashboard component tests**

Run: `npm test -- src/features/dashboard`

Expected: PASS.

- [ ] **Step 5: Commit reusable analytics UI**

```bash
git add src/features/dashboard/DashboardMetricCard.tsx src/features/dashboard/DashboardMetricCard.test.tsx src/features/dashboard/DashboardCharts.tsx src/features/dashboard/DashboardCharts.test.tsx src/features/dashboard/AnalyticsMetricGrid.tsx src/features/dashboard/AnalyticsMetricDetail.tsx src/features/dashboard/AnalyticsMetricDetail.test.tsx
git commit -m "feat: render explainable analytics metrics"
```

### Task 6: Render comprehensive overview and detail routes

**Files:**
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeDashboard.test.ts`
- Modify: `src/pages/admin/DashboardPage.tsx`
- Modify: `src/pages/admin/DashboardPage.test.ts`
- Create: `src/pages/admin/DashboardMetricDetailPage.tsx`
- Create: `src/pages/admin/DashboardMetricDetailPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: Task 4 endpoints
- Produces route `/admin/analytics/metrics/:metricKey`

- [ ] **Step 1: Write failing API/page route tests**

```ts
expect(appSource).toContain('path="/admin/analytics/metrics/:metricKey"');
expect(dashboardSource).toContain("operationsFinance");
expect(dashboardSource).toContain("commissionMetrics");
expect(dashboardSource).toContain("growthMetrics");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/api/backofficeDashboard.test.ts src/pages/admin/DashboardPage.test.ts src/pages/admin/DashboardMetricDetailPage.test.tsx src/App.test.tsx`

Expected: FAIL on missing API and route.

- [ ] **Step 3: Implement overview sections and detail loader**

Call overview with the same applied `DashboardQuery` as the existing dashboard. Render “运营财务”“佣金统计”“用户与增长” after existing charts. Card click navigates only when `detailRoute !== null`; TEST metrics render a disabled badge. Detail page reads URL metric key plus city/time query.

- [ ] **Step 4: Run frontend tests, lint and build**

Run: `npm test -- src/api/backofficeDashboard.test.ts src/pages/admin/DashboardPage.test.ts src/pages/admin/DashboardMetricDetailPage.test.tsx src/App.test.tsx && npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit dashboard overview UI**

```bash
git add src/api/backofficeRealData.ts src/api/backofficeDashboard.test.ts src/pages/admin/DashboardPage.tsx src/pages/admin/DashboardPage.test.ts src/pages/admin/DashboardMetricDetailPage.tsx src/pages/admin/DashboardMetricDetailPage.test.tsx src/App.tsx src/App.test.tsx src/i18n/translations.ts
git commit -m "feat: add comprehensive operations overview"
```

### Task 7: Publish dashboard analytics OpenAPI schemas

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/dashboard-analytics-openapi.test.ts`

**Interfaces:**
- Documents overview, metric-detail, filter, metric metadata, status and series payloads

- [ ] **Step 1: Write the failing OpenAPI test**

```ts
expect(document.paths["/api/v1/backoffice/dashboard/overview"]).toBeDefined();
expect(document.paths["/api/v1/backoffice/dashboard/metrics/{metricKey}"]).toBeDefined();
expect(document.components.schemas.AnalyticsMetricPayload).toBeDefined();
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- dashboard-analytics-openapi.test.ts`

Expected: FAIL on missing paths/schema.

- [ ] **Step 3: Add exact schemas and examples**

Document `ready`, `not_connected`, `not_available`, nullable values, comparison direction, city/custom date validation and allowed metric keys.

- [ ] **Step 4: Run OpenAPI/API tests**

Run: `cd backend && npm test -- dashboard-analytics-openapi.test.ts openapi.test.ts dashboard-metric-detail-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit API documentation**

```bash
git add backend/src/api/openapi.ts backend/tests/dashboard-analytics-openapi.test.ts
git commit -m "docs: publish dashboard analytics API contract"
```

### Task 8: Verify analytics correctness and browser behavior

**Files:**
- Create: `backend/scripts/check-dashboard-overview-flow.ts`
- Create: `backend/tests/dashboard-overview-flow-script.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces command `npm run check:dashboard-overview`

- [ ] **Step 1: Write the safety/coverage test**

```ts
for (const key of DASHBOARD_METRIC_KEYS) expect(script).toContain(key);
expect(script).toContain("not_connected");
expect(script).toContain("previousValue");
```

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && npm test -- dashboard-overview-flow-script.test.ts`

Expected: FAIL because the flow check is absent.

- [ ] **Step 3: Implement read-only fixture verification**

The script queries fixed completed/cancelled/refunded examples without writes, recalculates expected aggregates independently, and asserts current/previous windows, all metadata and reserved-source statuses.

- [ ] **Step 4: Run gates and browser acceptance**

Run: `cd backend && npm test -- dashboard && npm run build`

Run: `npm test -- src/features/dashboard src/pages/admin/DashboardPage.test.ts src/pages/admin/DashboardMetricDetailPage.test.tsx && npm run lint && npm run build`

Verify city/time search, info dialogs, detail navigation, legend toggles, empty/not-connected states, console and overflow on standard ports.

- [ ] **Step 5: Commit verification**

```bash
git add backend/scripts/check-dashboard-overview-flow.ts backend/tests/dashboard-overview-flow-script.test.ts backend/package.json
git commit -m "test: verify comprehensive dashboard analytics"
```
