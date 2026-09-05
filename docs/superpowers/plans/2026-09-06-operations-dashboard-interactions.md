# Operations Dashboard Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the metric sparkline baseline, add accessible point details, move chart descriptions into title information controls, and make every analytics ranking row open its existing formal detail drawer.

**Architecture:** Keep chart-only state inside the existing chart components. Route ranking selections through a pure URL builder into the existing merchant, technician, and user management pages; each target page parses a validated positive integer and opens its current drawer using its current formal API data. No dashboard API, database, migration, mock, or new detail component is introduced.

**Tech Stack:** React 18, TypeScript, React Router, Vitest, jsdom, Vite, Tailwind CSS.

## Global Constraints

- Do not add mock, demo, placeholder, or fake API data.
- Do not add or modify database schema or migrations.
- Do not add a new API endpoint or change Dashboard API contracts.
- Preserve existing RBAC route guards and formal detail requests.
- Preserve the current chart legend, axes, exact-data table, and large-chart point details.
- Keep every interaction usable by mouse, Enter, Space, and Escape where applicable.
- Do not push GitHub and do not deploy staging.

---

### Task 1: Interactive three-day metric sparkline

**Files:**
- Modify: `src/features/dashboard/DashboardMetricSparkline.tsx`
- Modify: `src/features/dashboard/DashboardMetricSparkline.test.tsx`
- Modify: `src/features/dashboard/DashboardMetricCard.tsx`
- Modify: `src/features/dashboard/DashboardMetricCard.test.tsx`

**Interfaces:**
- Consumes: `DashboardMetricSparklinePoint[]`, metric `title`, `DashboardValueUnit`, and the current i18n language.
- Produces: `<DashboardMetricSparkline points title unit />` with `data-dashboard-sparkline-control` and `data-dashboard-sparkline-detail` hooks.

- [ ] **Step 1: Write the failing interaction tests**

Add a mounted-component test that asserts there is no `<line>`, finds exactly three controls, clicks the second control, verifies the detail contains `09-02` and the formatted value, switches with Space, closes with the labelled close button, reopens with Enter, and clears with Escape. Update card tests to require that the card passes `title` and resolved `unit` to the sparkline.

```tsx
expect(container.querySelector("line")).toBeNull();
const controls = container.querySelectorAll('[data-dashboard-sparkline-control="true"]');
expect(controls).toHaveLength(3);
await act(async () => controls[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
expect(container.querySelector('[data-dashboard-sparkline-detail="true"]')?.textContent)
  .toContain("09-02");
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/features/dashboard/DashboardMetricSparkline.test.tsx src/features/dashboard/DashboardMetricCard.test.tsx
```

Expected: FAIL because the baseline still exists and the sparkline has no controls or detail state.

- [ ] **Step 3: Implement the minimal accessible interaction**

Change the public props and component state as follows, using the existing dashboard number formatter for visible values:

```tsx
export function DashboardMetricSparkline({
  points,
  title,
  unit
}: {
  points: DashboardMetricSparklinePoint[];
  title: string;
  unit: DashboardValueUnit;
}) {
  const { language } = useI18n();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const pointKey = points.map((point) => point.key).join("|");
  useEffect(() => setSelectedIndex(null), [pointKey]);
  // Keep the existing path calculation, remove the decorative <line>, add
  // transparent r=10 circles with role=button, tabIndex=0, aria-label,
  // click/Enter/Space handlers, and a closeable card-local detail bubble.
}
```

In `DashboardMetricCard.tsx` call:

```tsx
<DashboardMetricSparkline points={sparkline} title={title} unit={resolvedUnit} />
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same focused command. Expected: both test files PASS with no React act warnings.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/DashboardMetricSparkline.tsx src/features/dashboard/DashboardMetricSparkline.test.tsx src/features/dashboard/DashboardMetricCard.tsx src/features/dashboard/DashboardMetricCard.test.tsx
git commit -m "feat: add metric sparkline point details"
```

### Task 2: Move chart descriptions into information controls

**Files:**
- Modify: `src/features/dashboard/DashboardCharts.tsx`
- Modify: `src/features/dashboard/DashboardCharts.test.tsx`

**Interfaces:**
- Consumes: existing `title` and translated `description` strings.
- Produces: chart figcaptions using the existing `TitleWithInfo` component; no visible description paragraph.

- [ ] **Step 1: Write the failing chart-caption test**

Render a chart and assert the information control is labelled for the title, its popover content contains the description, and the figcaption has no direct description paragraph.

```tsx
const figure = container.querySelector('[data-dashboard-chart-frame="true"]')!;
expect(figure.querySelector('[data-dashboard-chart-info="true"]')).not.toBeNull();
expect(figure.querySelector('figcaption > p')).toBeNull();
expect(figure.textContent).toContain("订单与服务金额趋势");
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm test -- src/features/dashboard/DashboardCharts.test.tsx
```

Expected: FAIL because the description is still a visible `figcaption > p` and no information hook exists.

- [ ] **Step 3: Replace the caption with the shared information title**

Import `TitleWithInfo` and render:

```tsx
<figcaption data-dashboard-chart-info="true">
  <TitleWithInfo
    as="h3"
    info={<p>{description}</p>}
    label={`查看${title}说明`}
    title={title}
    variant="paper"
  />
</figcaption>
```

Keep the legend margin, SVG, axes, point controls, exact table, and empty state unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the focused command again. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/DashboardCharts.tsx src/features/dashboard/DashboardCharts.test.tsx
git commit -m "fix: move dashboard chart notes into info controls"
```

### Task 3: Make ranking rows produce stable formal-detail destinations

**Files:**
- Create: `src/features/dashboard/analyticsRankingDetailRoute.ts`
- Create: `src/features/dashboard/analyticsRankingDetailRoute.test.ts`
- Modify: `src/features/dashboard/AnalyticsRankingPanel.tsx`
- Modify: `src/features/dashboard/AnalyticsRankingPanel.test.tsx`
- Modify: `src/features/dashboard/AnalyticsRankingsSection.tsx`
- Modify: `src/features/dashboard/AnalyticsRankingsSection.test.tsx`
- Modify: `src/pages/admin/DashboardPage.tsx`
- Modify: `src/pages/admin/DashboardPage.test.ts`

**Interfaces:**
- Consumes: `AnalyticsRankingItem`.
- Produces: `buildAnalyticsRankingDetailLocation(item): { pathname: string; search: string }` and `onOpenDetail(item)` passed from Dashboard to each panel.

- [ ] **Step 1: Write failing route and row interaction tests**

Cover the exact route contract:

```ts
expect(buildAnalyticsRankingDetailLocation(serviceItem)).toEqual({
  pathname: "/admin/merchants",
  search: "?module=services&detailServiceId=51&detailServiceType=service"
});
expect(buildAnalyticsRankingDetailLocation(technicianItem)).toEqual({
  pathname: "/admin/technicians",
  search: "?detailTechnicianId=31"
});
expect(buildAnalyticsRankingDetailLocation(customerItem)).toEqual({
  pathname: "/admin/users",
  search: "?detailUserId=41"
});
```

Mount the ranking panel with `onOpenDetail`, then verify click, Enter, and Space call it with the unchanged formal item while TEST badges and metric toggles remain present.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- src/features/dashboard/analyticsRankingDetailRoute.test.ts src/features/dashboard/AnalyticsRankingPanel.test.tsx src/features/dashboard/AnalyticsRankingsSection.test.tsx src/pages/admin/DashboardPage.test.ts
```

Expected: FAIL because the route builder, callback props, and row controls do not exist.

- [ ] **Step 3: Implement the pure route builder and callback plumbing**

Use `URLSearchParams` and positive integer IDs. Both `service` and `technician_service` target the existing service-management surface; the entity type remains represented by the analytics item and must never be coerced into a technician or user ID.

```ts
export function buildAnalyticsRankingDetailLocation(item: AnalyticsRankingItem) {
  if (item.entityType === "technician") {
    return { pathname: "/admin/technicians", search: `?detailTechnicianId=${item.entityNumericId}` };
  }
  if (item.entityType === "customer") {
    return { pathname: "/admin/users", search: `?detailUserId=${item.entityNumericId}` };
  }
  const search = new URLSearchParams({
    module: "services",
    detailServiceId: String(item.entityNumericId),
    detailServiceType: item.entityType
  });
  return { pathname: "/admin/merchants", search: `?${search.toString()}` };
}
```

Render each list item with an inner full-width `<button>` preserving the current grid. Add `data-ranking-detail-control="true"`, a translated aria-label, hover/focus styles, and `onClick={() => onOpenDetail(item)}`. Let native button semantics provide Enter/Space activation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the focused command again. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/analyticsRankingDetailRoute.ts src/features/dashboard/analyticsRankingDetailRoute.test.ts src/features/dashboard/AnalyticsRankingPanel.tsx src/features/dashboard/AnalyticsRankingPanel.test.tsx src/features/dashboard/AnalyticsRankingsSection.tsx src/features/dashboard/AnalyticsRankingsSection.test.tsx src/pages/admin/DashboardPage.tsx src/pages/admin/DashboardPage.test.ts
git commit -m "feat: link dashboard rankings to formal details"
```

### Task 4: Let existing detail pages restore their drawers from URL state

**Files:**
- Create: `src/pages/admin/adminSearchParams.ts`
- Create: `src/pages/admin/adminSearchParams.test.ts`
- Modify: `src/pages/admin/MerchantsPage.tsx`
- Create: `src/pages/admin/MerchantsPage.deep-link.test.tsx`
- Modify: `src/pages/admin/TechniciansPage.tsx`
- Modify: `src/pages/admin/TechniciansPage.test.tsx`
- Modify: `src/features/platform-user-management/UserListPage.tsx`
- Modify: `src/features/platform-user-management/UserListPage.test.tsx`

**Interfaces:**
- Consumes: `detailServiceId`, `detailTechnicianId`, and `detailUserId` positive-integer URL parameters.
- Produces: the same existing service, technician, and user drawers opened from a stable URL.

- [ ] **Step 1: Add failing deep-link tests**

For each target page, mount under a memory router with its deep-link query. Resolve the current formal API mock and assert the existing drawer title/content becomes visible. Add invalid cases for `0`, negative, decimal, and non-numeric values and assert no detail request occurs.

```tsx
<MemoryRouter initialEntries={["/admin/technicians?detailTechnicianId=31"]}>
  <TechniciansPage />
</MemoryRouter>
```

- [ ] **Step 2: Run target-page tests and verify RED**

```bash
npm test -- src/pages/admin/MerchantsPage.deep-link.test.tsx src/pages/admin/TechniciansPage.test.tsx src/features/platform-user-management/UserListPage.test.tsx
```

Expected: FAIL because none of the pages consumes the new URL parameters.

- [ ] **Step 3: Add one shared positive-integer parser**

Create or reuse a small route utility local to admin pages:

```ts
export function readPositiveIntegerSearchParam(params: URLSearchParams, key: string) {
  const raw = params.get(key);
  if (!raw || !/^\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
```

Use it in all three pages. `TechniciansPage` calls its existing `technicianDetailRequest.load`. `UserListPage` initializes `selectedUserId`, allowing the existing `UserDetailDrawer` to fetch. `MerchantsPage` selects the matching item after the existing formal services request resolves, switches to the existing “服务项目” tab, and opens the existing “服务项目详情” drawer. If the ID is absent from the authorized response, keep the list visible and show the existing formal error area rather than inventing data.

- [ ] **Step 4: Run target-page and ranking tests and verify GREEN**

```bash
npm test -- src/pages/admin/MerchantsPage.deep-link.test.tsx src/pages/admin/TechniciansPage.test.tsx src/features/platform-user-management/UserListPage.test.tsx src/features/dashboard/analyticsRankingDetailRoute.test.ts src/features/dashboard/AnalyticsRankingPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/MerchantsPage.tsx src/pages/admin/MerchantsPage.deep-link.test.tsx src/pages/admin/TechniciansPage.tsx src/pages/admin/TechniciansPage.test.tsx src/features/platform-user-management/UserListPage.tsx src/features/platform-user-management/UserListPage.test.tsx src/pages/admin/adminSearchParams.ts src/pages/admin/adminSearchParams.test.ts
git commit -m "feat: restore formal detail drawers from dashboard links"
```

### Task 5: Full regression and authenticated browser acceptance

**Files:**
- Modify only if a verification-discovered defect has its own new failing test first.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: verified local `main` with no staging deployment or remote push.

- [ ] **Step 1: Run focused dashboard and target-page tests**

```bash
npm test -- src/features/dashboard/DashboardMetricSparkline.test.tsx src/features/dashboard/DashboardMetricCard.test.tsx src/features/dashboard/DashboardCharts.test.tsx src/features/dashboard/analyticsRankingDetailRoute.test.ts src/features/dashboard/AnalyticsRankingPanel.test.tsx src/features/dashboard/AnalyticsRankingsSection.test.tsx src/pages/admin/DashboardPage.test.ts src/pages/admin/MerchantsPage.deep-link.test.tsx src/pages/admin/TechniciansPage.test.tsx src/features/platform-user-management/UserListPage.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full frontend verification**

```bash
npm test
npm run lint
npm run verify:production-build
```

Expected: all tests PASS, TypeScript exits 0, production build and bundle audit PASS.

- [ ] **Step 3: Perform authenticated browser acceptance**

Using the current local backend/frontend listeners and signed-in operations tab:

1. Verify all five sparklines contain no baseline and each has three point controls.
2. Click and keyboard-activate sparkline points; verify date/value detail, switch, close, and Escape.
3. Open each chart `i` control; verify its original description is present and no persistent subtitle remains.
4. Click one row in each ranking; verify the correct existing drawer opens with the selected formal record.
5. Return and repeat one detail URL after reload to prove restoration.
6. Verify the large-chart point detail still works, TEST remains red, ranking dividers remain aligned, and document width equals viewport width.
7. Inspect runtime/browser errors generated by these interactions.

- [ ] **Step 4: Verify repository and release boundaries**

```bash
git status --short --branch
git log -8 --oneline
```

Expected: local `main` contains the feature commits, the worktree is clean, origin is untouched, and no staging command ran.
