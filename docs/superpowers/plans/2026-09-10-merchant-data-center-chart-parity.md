# Merchant Data Center Chart Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the merchant data-center order trend chart use the technician chart's visual hierarchy, per-bucket nodes, peak summary, and independently toggleable legends without changing formal analytics data.

**Architecture:** Keep the change local to `ShopAnalyticsDashboard`: reuse the existing `buildTrendCoordinates` utility already used by the technician chart, render each merchant series as a `<g>` containing its line and nodes, and hold legend visibility in local component state. The existing authenticated dashboard loader, period filter, API payload, screen-reader table, metric tiles, and surrounding merchant portal remain unchanged.

**Tech Stack:** React 18, TypeScript strict mode, inline SVG, Tailwind utility classes, Vitest, jsdom.

## Global Constraints

- This is one frontend-only micro-step; do not modify backend APIs, schemas, seeds, store scope, or analytics calculations.
- Use only formal `dashboard.series.buckets`; do not add synthetic UI data or browser-derived aggregates.
- Revenue uses `--client-primary`; order count uses `--client-accent`.
- Both series keep independent vertical scales and share one time axis.
- Every formal time bucket renders one visible circular node for each visible series.
- Empty data renders the existing explicit empty state; zero values remain real zero nodes on the baseline.
- Theme styling must use the existing `--client-*` variables; no new hard-coded theme branch.
- Keep the technician chart unchanged and avoid extracting a new cross-portal component in this micro-step.
- Preserve all existing period-switch, retry, unknown-metric, API-loading, and screen-reader-table behavior.

---

### Task 1: Merchant trend chart visual and interaction parity

**Files:**
- Modify: `src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx:154-233`
- Modify: `src/features/shop-analytics/ShopAnalyticsDashboard.tsx:1-135,245-251`

**Interfaces:**
- Consumes: `buildTrendCoordinates(values: number[], dimensions: TrendChartDimensions): TrendCoordinate[]` from `src/lib/technicianWorkTrendChart.ts` and the existing `DashboardBucketPayload[]` returned by the formal dashboard API.
- Produces: the existing private `ShopAnalyticsTrend({ buckets })` React component with `data-series="revenue"`, `data-series="orders"`, `data-chart-node="true"`, and two accessible legend buttons. No exported API changes.

- [ ] **Step 1: Add the failing node and technician-style hierarchy test**

Append this test inside the existing `describe("ShopAnalyticsDashboard formal API", ...)` block:

```tsx
it("renders technician-style peak context and a visible node for every formal bucket", async () => {
  const loadDashboard = vi.fn().mockResolvedValue(dashboard);

  await act(async () => {
    root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
  });
  await waitFor(() => expect(container.textContent).toContain("128,000"));

  expect(container.textContent).toContain("同一期间 · 双独立刻度");
  expect(container.textContent).toContain("￥70,000 峰值");
  expect(container.textContent).toContain("5单 峰值");
  expect(
    container.querySelectorAll('[data-series="revenue"] [data-chart-node="true"]')
  ).toHaveLength(dashboard.series.buckets.length);
  expect(
    container.querySelectorAll('[data-series="orders"] [data-chart-node="true"]')
  ).toHaveLength(dashboard.series.buckets.length);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx
```

Expected: FAIL because the current chart has no “同一期间 · 双独立刻度”, no peak labels, and no elements carrying `data-chart-node="true"`.

- [ ] **Step 3: Add the failing independent legend-control test**

Append this second test inside the same `describe` block:

```tsx
it("lets each bottom legend hide and restore only its own series", async () => {
  const loadDashboard = vi.fn().mockResolvedValue(dashboard);

  await act(async () => {
    root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
  });
  await waitFor(() => expect(container.textContent).toContain("128,000"));

  const revenueLegend = container.querySelector<HTMLButtonElement>(
    'button[aria-label="隐藏营业额趋势"]'
  );
  const ordersLegend = container.querySelector<HTMLButtonElement>(
    'button[aria-label="隐藏订单数趋势"]'
  );
  expect(revenueLegend?.getAttribute("aria-pressed")).toBe("true");
  expect(ordersLegend?.getAttribute("aria-pressed")).toBe("true");

  await act(async () => revenueLegend?.click());
  expect(container.querySelector('[data-series="revenue"]')).toBeNull();
  expect(container.querySelector('[data-series="orders"]')).not.toBeNull();
  expect(revenueLegend?.getAttribute("aria-label")).toBe("显示营业额趋势");

  await act(async () => revenueLegend?.click());
  await act(async () => ordersLegend?.click());
  expect(container.querySelector('[data-series="revenue"]')).not.toBeNull();
  expect(container.querySelector('[data-series="orders"]')).toBeNull();
  expect(ordersLegend?.getAttribute("aria-label")).toBe("显示订单数趋势");
});
```

- [ ] **Step 4: Add the failing single-bucket zero-value geometry test**

Append this third test inside the same `describe` block:

```tsx
it("centers a single zero-value bucket and keeps both nodes on the baseline", async () => {
  const zeroDashboard: BackofficeDashboardPayload = {
    ...dashboard,
    series: {
      buckets: [{
        ...dashboard.series.buckets[0]!,
        key: "2026-09-06",
        label: "9/6",
        orderCount: 0,
        serviceGmvJpy: 0
      }]
    }
  };
  const loadDashboard = vi.fn().mockResolvedValue(zeroDashboard);

  await act(async () => {
    root.render(<ShopAnalyticsDashboard loadDashboard={loadDashboard} store={store} />);
  });
  await waitFor(() => expect(container.textContent).toContain("￥0 峰值"));

  const nodes = container.querySelectorAll<SVGCircleElement>('[data-chart-node="true"]');
  expect(nodes).toHaveLength(2);
  nodes.forEach((node) => {
    expect(node.getAttribute("cx")).toBe("319");
    expect(node.getAttribute("cy")).toBe("206");
  });
  expect(container.textContent).toContain("0单 峰值");
});
```

- [ ] **Step 5: Run the focused test and verify the new tests are RED**

Run:

```bash
npm test -- src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx
```

Expected: FAIL because the current chart has neither the accessible legend buttons nor the centered single-bucket node geometry.

- [ ] **Step 6: Replace the private merchant trend renderer with the minimal parity implementation**

In `ShopAnalyticsDashboard.tsx`, add this import:

```tsx
import { buildTrendCoordinates } from "../../lib/technicianWorkTrendChart";
```

Replace `buildLinePath` and `ShopAnalyticsTrend` with:

```tsx
const shopTrendDimensions = { width: 620, height: 260, left: 42, right: 24, top: 24, bottom: 54 };

function pointsAttribute(points: Array<{ x: number; y: number }>) {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

function buildShopTrendCoordinates(values: number[]) {
  const coordinates = buildTrendCoordinates(values, shopTrendDimensions);
  if (coordinates.length !== 1) return coordinates;
  const plotWidth = shopTrendDimensions.width - shopTrendDimensions.left - shopTrendDimensions.right;
  return [{ ...coordinates[0]!, x: shopTrendDimensions.left + plotWidth / 2 }];
}

function ShopAnalyticsTrend({ buckets }: { buckets: DashboardBucketPayload[] }) {
  const [showRevenue, setShowRevenue] = useState(true);
  const [showOrders, setShowOrders] = useState(true);
  const revenueCoordinates = useMemo(
    () => buildShopTrendCoordinates(buckets.map((bucket) => bucket.serviceGmvJpy)),
    [buckets]
  );
  const orderCoordinates = useMemo(
    () => buildShopTrendCoordinates(buckets.map((bucket) => bucket.orderCount)),
    [buckets]
  );
  const visibleLabelIndexes = useMemo(() => {
    const interval = Math.ceil(buckets.length / 6);
    return new Set(
      buckets.flatMap((_, index) => (
        buckets.length <= 8 || index === 0 || index === buckets.length - 1 || index % interval === 0
          ? [index]
          : []
      ))
    );
  }, [buckets]);
  const revenuePeak = Math.max(...buckets.map((bucket) => bucket.serviceGmvJpy), 0);
  const orderPeak = Math.max(...buckets.map((bucket) => bucket.orderCount), 0);
  const usableHeight = shopTrendDimensions.height - shopTrendDimensions.top - shopTrendDimensions.bottom;

  if (buckets.length === 0) {
    return (
      <div className="grid min-h-36 place-items-center rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-bg)_72%,var(--client-primary)_8%)] text-sm font-black text-[color:var(--client-muted)]">
        暂无数据
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden" data-testid="shop-analytics-trend">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-black">订单趋势</h3>
          <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">
            同一期间 · 双独立刻度
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] font-black text-[color:var(--client-muted)]">
          <p>{yen(revenuePeak)} 峰值</p>
          <p className="mt-1 text-[color:var(--client-accent)]">{formatCount(orderPeak)}单 峰值</p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          aria-label="订单趋势"
          className="h-auto min-w-[520px] overflow-visible"
          role="img"
          viewBox={`0 0 ${shopTrendDimensions.width} ${shopTrendDimensions.height}`}
        >
          {Array.from({ length: 4 }, (_, index) => {
            const y = shopTrendDimensions.top + (usableHeight / 3) * index;
            return (
              <line
                key={y}
                stroke="color-mix(in srgb, var(--client-line) 55%, transparent)"
                strokeDasharray="6 8"
                x1={shopTrendDimensions.left}
                x2={shopTrendDimensions.width - shopTrendDimensions.right}
                y1={y}
                y2={y}
              />
            );
          })}
          {showRevenue ? (
            <g data-series="revenue">
              <polyline fill="none" points={pointsAttribute(revenueCoordinates)} stroke="var(--client-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              {revenueCoordinates.map((coordinate, index) => (
                <circle cx={coordinate.x} cy={coordinate.y} data-chart-node="true" fill="var(--client-bg)" key={buckets[index]?.key} r="6" stroke="var(--client-primary)" strokeWidth="4" />
              ))}
            </g>
          ) : null}
          {showOrders ? (
            <g data-series="orders">
              <polyline fill="none" points={pointsAttribute(orderCoordinates)} stroke="var(--client-accent)" strokeDasharray="10 9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
              {orderCoordinates.map((coordinate, index) => (
                <circle cx={coordinate.x} cy={coordinate.y} data-chart-node="true" fill="var(--client-bg)" key={buckets[index]?.key} r="5" stroke="var(--client-accent)" strokeWidth="3" />
              ))}
            </g>
          ) : null}
          {revenueCoordinates.map((coordinate, index) => visibleLabelIndexes.has(index) ? (
            <text fill="var(--client-muted)" fontSize="13" fontWeight="800" key={buckets[index]?.key} textAnchor="middle" x={coordinate.x} y={shopTrendDimensions.height - 18}>
              {buckets[index]?.label}
            </text>
          ) : null)}
        </svg>
      </div>

      <div aria-label="订单趋势图例" className="mt-2 grid grid-cols-2 gap-2">
        <button
          aria-label={`${showRevenue ? "隐藏" : "显示"}营业额趋势`}
          aria-pressed={showRevenue}
          className={cn("focus-ring flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black", showRevenue ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)] opacity-65")}
          onClick={() => setShowRevenue((current) => !current)}
          type="button"
        >
          <span className="h-1 w-7 rounded-full bg-[color:var(--client-primary)]" />营业额
        </button>
        <button
          aria-label={`${showOrders ? "隐藏" : "显示"}订单数趋势`}
          aria-pressed={showOrders}
          className={cn("focus-ring flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black", showOrders ? "border-[color:color-mix(in_srgb,var(--client-accent)_65%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-accent)_10%,transparent)] text-[color:var(--client-accent)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)] opacity-65")}
          onClick={() => setShowOrders((current) => !current)}
          type="button"
        >
          <span className="h-1 w-7 rounded-full bg-[color:var(--client-accent)]" />订单数
        </button>
      </div>

      <table className="sr-only" data-no-i18n>
        <caption>订单趋势</caption>
        <thead><tr><th>时段</th><th>营业额</th><th>订单数</th></tr></thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.key}><th>{bucket.label}</th><td>{bucket.serviceGmvJpy}</td><td>{bucket.orderCount}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Then replace the trend-card heading block at `ShopAnalyticsDashboard.tsx:245-250` with the date range followed by the component, leaving the card and formal date range intact:

```tsx
<section className="shop-analytics-chart-panel min-w-0 overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-line))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_12%,transparent),transparent_40%),linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_94%,var(--client-bg)),color-mix(in_srgb,var(--client-elevated)_72%,var(--client-bg)))] p-4 text-[color:var(--client-text)] shadow-panel">
  <ShopAnalyticsTrend buckets={dashboard.series.buckets} />
  <p className="mt-3 text-center text-[10px] font-bold text-[color:var(--client-soft-muted)]" data-no-i18n>
    {dashboard.filter.from} - {dashboard.filter.to}
  </p>
</section>
```

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx
```

Expected: all `ShopAnalyticsDashboard formal API` tests PASS, including node count, peak labels, and independent legend controls.

- [ ] **Step 8: Run the adjacent technician regression test**

Run:

```bash
npm test -- src/components/technician/TechnicianDataCenterPanel.test.tsx src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx
```

Expected: both suites PASS; the technician reference chart remains unchanged.

- [ ] **Step 9: Run static and production build verification**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0 with no TypeScript or Vite build errors.

- [ ] **Step 10: Commit the tested implementation**

```bash
git add src/features/shop-analytics/ShopAnalyticsDashboard.tsx src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx
git commit -m "fix: align merchant trend chart with technician design"
```

---

### Task 2: Merchant mobile browser acceptance

**Files:**
- Verify only: `src/features/shop-analytics/ShopAnalyticsDashboard.tsx`
- Verify only: `src/pages/mobile/MerchantPortalPage.tsx`

**Interfaces:**
- Consumes: the committed Task 1 frontend and the existing authenticated merchant dashboard API.
- Produces: browser evidence only; no source change is expected. If a visual defect appears, return to Task 1 with a new failing test before editing.

- [ ] **Step 1: Prove the local runtime before judging the UI**

Check listeners for the formal ports and record each listener PID, cwd, and command. Confirm that the frontend is served from the current branch and that `/api/v1/ready`, the operations health route, and the merchant health route respond successfully. If the formal runtime is absent, start it with:

```bash
npm run dev:formal
```

Expected: frontend on 5180, client API on 3000, operations API on 3001, and merchant API on 3002, with the serving process rooted in `/Users/eason/Documents/New project`.

- [ ] **Step 2: Verify the authenticated merchant data-center route at mobile width**

Open the merchant portal with the existing formal merchant session, enter 个人中心 → 数据中心, and set a viewport close to 440×956. Confirm:

- the card title is “订单趋势” and the subtitle is “同一期间 · 双独立刻度”;
- the top-right revenue and order peaks reflect the loaded formal buckets;
- every bucket has one revenue node and one order node;
- revenue is a primary-colored solid line and orders are an accent-colored dashed line;
- the two bottom legend buttons independently hide and restore their own line and nodes;
- the date range remains visible and matches the API response;
- there is no horizontal page overflow, clipped node, or unreadable label;
- the browser console has no new error.

- [ ] **Step 3: Verify light and dark theme contrast**

Repeat the same card inspection in one supported day theme and the night theme. Confirm that nodes use the existing page-background fill and remain distinguishable against the panel, both series keep their configured colors, inactive legend states remain readable, and keyboard focus is visible.

- [ ] **Step 4: Record the exact acceptance boundary**

Report unit-test, lint, build, and local-browser evidence separately. Do not describe this as staging, deployed, or physical-device acceptance; no push or deployment is authorized by this plan.
