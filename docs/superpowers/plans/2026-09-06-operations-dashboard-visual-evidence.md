# Operations Dashboard Visual Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate operations rankings with explicitly labelled test completion evidence, align ranking dividers, add exact three-day headline sparklines, and make the large charts numerically readable and point-interactive.

**Architecture:** Extend the existing Step 12 ranking and dashboard responses rather than adding a parallel API. Keep test contribution explicit in every ranking aggregate, calculate the three-day headline series in the repository from the same scope and Tokyo calendar rules, and reuse small focused React components for TEST badges and sparklines. Preserve existing RBAC, audit, stale-response, evidence-validation, and accessibility behavior.

**Tech Stack:** Node.js 22, Express, TypeScript strict mode, Prisma/MariaDB raw parameterized queries, Zod-backed routes, Jest/Supertest, React 19, Vite, Tailwind CSS, Vitest/jsdom, SVG.

## Global Constraints

- Execute only this Step 12 dashboard microstep; do not expand into unrelated admin work.
- Do not add mock, demo, unfinished stubs, fake API, static fallback ranking, or client-derived trend data.
- Do not add a database table or migration.
- Do not change booking, checkout, payment, refund, wallet, or ledger state machines.
- Keep `/api/v1/`, JWT, RBAC, audit logging, Tokyo calendar boundaries, pagination, and strict response validation.
- Combined ranking totals include formal and test evidence; every test contribution remains visible through red `TEST` labelling.
- The headline series contains exactly three server-provided Tokyo calendar-day points ending on the selected filter end date.
- The original checkout and its unrelated dirty files remain untouched; all work stays in `/Users/eason/Documents/New project/.worktrees/dashboard-visual-evidence`.
- Do not merge, push, deploy, migrate, seed, or mutate staging in this plan.

---

## File Map

**Backend ranking contract**

- Modify `backend/src/domain/analytics-ranking.ts`: add test contribution and composition fields.
- Modify `backend/src/repositories/analytics-ranking.repository.ts`: include eligible test orders, aggregate the test subset, validate and map the new fields.
- Modify `backend/src/api/openapi.ts`: publish the additive strict ranking contract.
- Modify `backend/tests/analytics-ranking.repository.test.ts`: unit-level SQL and mapping regression.
- Modify `backend/tests/analytics-ranking.repository.integration.test.ts`: real MariaDB test-only, mixed, and malformed-evidence cases.
- Modify `backend/tests/analytics-ranking-api.test.ts`: response-chain proof.
- Modify `backend/tests/analytics-ranking-openapi.test.ts`: exact schema proof.

**Backend headline series**

- Modify `backend/src/domain/dashboard.ts`: define three-day headline point and payload types.
- Modify `backend/src/repositories/dashboard.repository.ts`: add one bounded three-bucket aggregate reader.
- Modify `backend/src/repositories/backoffice.repository.ts`: delegate the new reader.
- Modify `backend/src/services/backoffice.service.ts`: resolve the three-day Tokyo window and compose the response.
- Modify `backend/src/api/openapi.ts`: document `headlineSeries3d`.
- Modify `backend/tests/dashboard-activity.repository.test.ts`: scope, zero-bucket, and exact-value tests.
- Modify `backend/tests/dashboard-service.test.ts`: response composition and shared evaluation boundary tests.
- Modify `backend/tests/backoffice-api.test.ts`: endpoint response contract.
- Modify `backend/tests/openapi.test.ts`: OpenAPI required-field contract.

**Frontend contracts and UI**

- Modify `src/api/backofficeRealData.ts`: add exact ranking composition and headline-series types and validation.
- Modify `src/api/backofficeRealData.test.ts`: reject malformed ranking composition and malformed three-day series.
- Create `src/features/dashboard/DashboardTestBadge.tsx`: one red TEST badge primitive.
- Create `src/features/dashboard/DashboardTestBadge.test.tsx`: semantic and visual contract.
- Modify `src/features/dashboard/AnalyticsRankingPanel.tsx`: aligned header rows and row badges.
- Modify `src/features/dashboard/AnalyticsRankingPanel.test.tsx`: alignment and test/mixed badge cases.
- Create `src/features/dashboard/DashboardMetricSparkline.tsx`: exact three-point noninteractive SVG sparkline.
- Create `src/features/dashboard/DashboardMetricSparkline.test.tsx`: flat/rising/accessibility/invalid-input cases.
- Modify `src/features/dashboard/DashboardMetricCard.tsx`: optional sparkline slot and shared TEST badge.
- Modify `src/features/dashboard/DashboardMetricCard.test.tsx`: red badge and layout behavior.
- Modify `src/pages/admin/DashboardPage.tsx`: bind all five headline metrics to the server series.
- Modify `src/pages/admin/DashboardPage.test.ts`: prove exact field mapping and no client approximation.
- Create `src/features/dashboard/dashboardChartScale.ts`: deterministic independent-axis scale and tick helpers.
- Create `src/features/dashboard/dashboardChartScale.test.ts`: scale/tick edge cases.
- Modify `src/features/dashboard/DashboardCharts.tsx`: visible axes, accessible node controls, anchored detail panel.
- Modify `src/features/dashboard/DashboardCharts.test.tsx`: numeric axes and click/keyboard/dismiss behavior.
- Modify `src/features/dashboard/dashboardTranslations.ts`: add point-detail and TEST-composition translations.
- Modify `docs/backoffice-real-data.md`: record the final formal contract and verification boundary.

---

### Task 1: Include and classify test completion evidence in ranking aggregates

**Files:**

- Modify: `backend/tests/analytics-ranking.repository.test.ts`
- Modify: `backend/tests/analytics-ranking.repository.integration.test.ts`
- Modify: `backend/src/domain/analytics-ranking.ts`
- Modify: `backend/src/repositories/analytics-ranking.repository.ts`

**Interfaces:**

- Consumes: existing `AnalyticsRankingInput`, evidence CTEs, pagination, and `AnalyticsRankingIncompleteEvidenceError`.
- Produces: `AnalyticsRankingItem` with `testGmvJpy`, `testCompletedCount`, and `dataComposition`.

- [ ] **Step 1: Write failing repository mapping and SQL-policy tests**

Extend the raw row fixture and expected mapped object:

```ts
testGmvJpy: 12300n,
testCompletedCount: 2n,
dataComposition: "test",

expect(result.list[0]).toMatchObject({
  gmvJpy: 12300,
  completedCount: 2,
  testGmvJpy: 12300,
  testCompletedCount: 2,
  dataComposition: "test",
});
```

Replace the old “eligible identities” assertion with assertions that the SQL separates eligibility from composition:

```ts
expect(validationSql).toMatch(/FROM formal_order_evidence\s+WHERE entity_eligible = 1/u);
expect(validationSql).toContain("candidate.customer_is_test OR candidate.technician_user_is_test");
expect(validationSql).not.toContain("candidate.customer_is_test = FALSE");
expect(validationSql).not.toContain("candidate.technician_user_is_test = FALSE");
expect(pageSql).toContain("test_gmv_jpy AS testGmvJpy");
expect(pageSql).toContain("test_completed_count AS testCompletedCount");
expect(pageSql).toContain("data_composition AS dataComposition");
```

Add integration fixtures for one formal completion and one test completion of the same service, plus a malformed test completion. Assert combined totals, `mixed`, test subset values, and fail-closed behavior.

- [ ] **Step 2: Run the focused ranking repository tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand \
  tests/analytics-ranking.repository.test.ts \
  tests/analytics-ranking.repository.integration.test.ts
```

Expected: FAIL because the mapped item lacks the three new fields and the SQL still excludes test accounts.

- [ ] **Step 3: Extend the domain and repository minimally**

Add the complete domain fields:

```ts
export type AnalyticsRankingDataComposition = "formal" | "test" | "mixed";

export interface AnalyticsRankingItem {
  rank: number;
  entityType: RankingEntityType;
  entityPublicId: string;
  entityNumericId: number;
  displayName: string;
  avatarUrl: string | null;
  categoryId: number | null;
  gmvJpy: number;
  completedCount: number;
  registeredAt: string;
  testGmvJpy: number;
  testCompletedCount: number;
  dataComposition: AnalyticsRankingDataComposition;
}
```

In `formal_order_evidence`, make eligibility depend on active/non-deleted entities only and expose a separate flag:

```sql
CASE WHEN candidate.customer_is_active = TRUE
          AND candidate.customer_deleted_at IS NULL
          AND candidate.technician_deleted_at IS NULL
          AND candidate.technician_user_is_active = TRUE
          AND candidate.technician_user_deleted_at IS NULL
     THEN 1 ELSE 0 END AS entity_eligible,
CASE WHEN candidate.customer_is_test = TRUE
          OR candidate.technician_user_is_test = TRUE
     THEN 1 ELSE 0 END AS is_test_order
```

Carry `is_test_order` into every ranking line. Service rankings count base/add-on service occurrences, so use:

```sql
SUM(CASE WHEN is_test_order = 1 THEN line_gmv_jpy ELSE 0 END) AS test_gmv_jpy,
SUM(CASE WHEN is_test_order = 1 THEN 1 ELSE 0 END) AS test_completed_count,
CASE
  WHEN SUM(CASE WHEN is_test_order = 1 THEN 1 ELSE 0 END) = 0 THEN 'formal'
  WHEN SUM(CASE WHEN is_test_order = 0 THEN 1 ELSE 0 END) = 0 THEN 'test'
  ELSE 'mixed'
END AS data_composition
```

Technician and customer rankings count distinct completed orders. Use `COUNT(DISTINCT CASE WHEN is_test_order = 1 THEN evidence.id END)` and the matching formal-order expression for their `data_composition`. Without a category filter, use `checkout_amount_jpy` for `test_gmv_jpy`; with a category filter, use `line_gmv_jpy`, matching the existing total semantics.

Select the three new aliases in the page query, validate them in `mapRow`, and enforce:

```ts
if (testGmvJpy > gmvJpy || testCompletedCount > completedCount) this.incomplete();
const expectedComposition = testCompletedCount === 0
  ? "formal"
  : testCompletedCount === completedCount
    ? "test"
    : "mixed";
if (dataComposition !== expectedComposition) this.incomplete();
```

- [ ] **Step 4: Run repository tests and verify GREEN**

Run the command from Step 2.

Expected: both suites PASS; the malformed test completion raises `AnalyticsRankingIncompleteEvidenceError`.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/src/domain/analytics-ranking.ts \
  backend/src/repositories/analytics-ranking.repository.ts \
  backend/tests/analytics-ranking.repository.test.ts \
  backend/tests/analytics-ranking.repository.integration.test.ts
git commit -m "fix(dashboard): include labelled test ranking evidence"
```

---

### Task 2: Publish and strictly parse the additive ranking contract

**Files:**

- Modify: `backend/tests/analytics-ranking-api.test.ts`
- Modify: `backend/tests/analytics-ranking-openapi.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/api/backofficeRealData.test.ts`

**Interfaces:**

- Consumes: Task 1 `AnalyticsRankingItem` fields.
- Produces: the identical server OpenAPI and frontend `AnalyticsRankingItem` contract.

- [ ] **Step 1: Write failing API, OpenAPI, and frontend parser tests**

Make the API fixture return one test row and assert the response contains only the approved additive fields. Update OpenAPI required properties to:

```ts
[
  "rank", "entityType", "entityPublicId", "entityNumericId", "displayName",
  "avatarUrl", "categoryId", "gmvJpy", "completedCount", "registeredAt",
  "testGmvJpy", "testCompletedCount", "dataComposition"
]
```

Add frontend parser cases that accept `formal`, `test`, and `mixed`, then reject:

```ts
{ ...row, dataComposition: "unknown" }
{ ...row, testGmvJpy: row.gmvJpy + 1 }
{ ...row, testCompletedCount: row.completedCount + 1 }
{ ...row, dataComposition: "formal", testCompletedCount: 1 }
```

- [ ] **Step 2: Run the focused contract tests and verify RED**

```bash
npm --prefix backend test -- --runInBand \
  tests/analytics-ranking-api.test.ts \
  tests/analytics-ranking-openapi.test.ts
npm test -- --run src/api/backofficeRealData.test.ts
```

Expected: backend OpenAPI and frontend exact-object parsing FAIL on the missing fields.

- [ ] **Step 3: Update OpenAPI and frontend strict parsing**

Add this OpenAPI shape:

```ts
testGmvJpy: { type: "integer", minimum: 0 },
testCompletedCount: { type: "integer", minimum: 0 },
dataComposition: { type: "string", enum: ["formal", "test", "mixed"] }
```

Update the frontend interface and `requireAnalyticsRankingPayload`. After primitive checks, enforce:

```ts
const expectedComposition = item.testCompletedCount === 0
  ? "formal"
  : item.testCompletedCount === item.completedCount
    ? "test"
    : "mixed";
if (
  item.testGmvJpy > item.gmvJpy ||
  item.testCompletedCount > item.completedCount ||
  item.dataComposition !== expectedComposition
) throw new Error("error.api");
```

- [ ] **Step 4: Run the contract tests and verify GREEN**

Run the commands from Step 2.

Expected: all listed suites PASS, including exact-object rejection.

- [ ] **Step 5: Commit Task 2**

```bash
git add backend/src/api/openapi.ts \
  backend/tests/analytics-ranking-api.test.ts \
  backend/tests/analytics-ranking-openapi.test.ts \
  src/api/backofficeRealData.ts src/api/backofficeRealData.test.ts
git commit -m "feat(dashboard): expose ranking data composition"
```

---

### Task 3: Add the formal three-day headline series

**Files:**

- Modify: `backend/tests/dashboard-activity.repository.test.ts`
- Modify: `backend/tests/dashboard-service.test.ts`
- Modify: `backend/tests/backoffice-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `backend/src/domain/dashboard.ts`
- Modify: `backend/src/repositories/dashboard.repository.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/api/backofficeRealData.ts`

**Interfaces:**

- Consumes: `DashboardAggregateInput`, `resolveDashboardWindow`, `shiftCalendarDate`, existing shop/city scope helpers.
- Produces: `DashboardHeadlineSeriesPoint`, `DashboardHeadlineSeries3d`, and `BackofficeDashboardPayload.headlineSeries3d`.

- [ ] **Step 1: Write failing repository and service tests**

Define a fixed three-day window ending `2026-09-01` and make the repository fixture return rows for only the first and third day. Assert a complete zero-filled skeleton:

```ts
expect(result).toEqual([
  {
    key: "2026-08-30", label: "08-30", availableScheduleSlots: 4,
    activeTechnicians: 2, registeredTechnicians: 130, shopCount: 20, newCustomers: 3
  },
  {
    key: "2026-08-31", label: "08-31", availableScheduleSlots: 0,
    activeTechnicians: 0, registeredTechnicians: 0, shopCount: 0, newCustomers: 0
  },
  {
    key: "2026-09-01", label: "09-01", availableScheduleSlots: 6,
    activeTechnicians: 4, registeredTechnicians: 134, shopCount: 21, newCustomers: 1
  }
]);
```

In service tests, assert that one `evaluatedAt` creates:

```ts
expect(getHeadlineSeries3d).toHaveBeenCalledWith(expect.objectContaining({
  scope: { kind: "platform" },
  city: "Tokyo",
  window: expect.objectContaining({
    fromDate: "2026-08-30",
    toDate: "2026-09-01",
    timeZone: "Asia/Tokyo",
    granularity: "day"
  }),
  evaluatedAt: now
}));
expect(result.headlineSeries3d.buckets).toHaveLength(3);
```

- [ ] **Step 2: Run focused dashboard backend tests and verify RED**

```bash
npm --prefix backend test -- --runInBand \
  tests/dashboard-activity.repository.test.ts \
  tests/dashboard-service.test.ts \
  tests/backoffice-api.test.ts \
  tests/openapi.test.ts
```

Expected: FAIL because the repository port, domain types, payload, and OpenAPI field do not exist.

- [ ] **Step 3: Add the domain types and repository port**

Add:

```ts
export interface DashboardHeadlineSeriesPoint {
  key: string;
  label: string;
  availableScheduleSlots: number;
  activeTechnicians: number;
  registeredTechnicians: number;
  shopCount: number;
  newCustomers: number;
}

export interface DashboardHeadlineSeries3d {
  from: string;
  to: string;
  timeZone: "Asia/Tokyo";
  buckets: DashboardHeadlineSeriesPoint[];
}
```

Add `getHeadlineSeries3d(input: DashboardAggregateInput)` to `DashboardRepository`, `BackofficeRepository`, and `BackofficeRepositoryPort`.

- [ ] **Step 4: Implement one bounded, parameterized three-bucket query**

Use the existing `bucketTable`, `rawRelatedShopScope`, and Tokyo-resolved window. Define every scope before composing the marked, bounded query:

```ts
const technicianScope = shopId
  ? Prisma.sql`(direct_shop.id = ${shopId} OR affiliation_shop.id = ${shopId})`
  : city
    ? Prisma.sql`(
        TRIM(profile.city) = ${city}
        OR TRIM(direct_shop.city) = ${city}
        OR TRIM(affiliation_shop.city) = ${city}
      )`
    : Prisma.sql`TRUE`;
const shopStockScope = city ? Prisma.sql`TRIM(shop.city) = ${city}` : Prisma.sql`TRUE`;
const customerScope = city ? Prisma.sql`TRIM(profile.city) = ${city}` : Prisma.sql`TRUE`;
const slotScope = this.slotScope(shopId, city);
const bookingScope = this.bookingScope(shopId, city);

const rows = await this.client.$queryRaw<HeadlineBucketRow[]>(Prisma.sql`
  /* dashboard_headline_series_3d */
  WITH buckets AS (${this.bucketTable(input)}),
  active_profiles AS (
    SELECT bucket.bucket_key, slot.technician_profile_id AS profile_id
    FROM buckets AS bucket
    JOIN schedule_slots AS slot
      ON slot.starts_at < bucket.to_exclusive
      AND slot.ends_at > bucket.from_inclusive
      AND slot.deleted_at IS NULL
      AND slot.technician_profile_id IS NOT NULL
    JOIN technician_profiles AS profile
      ON profile.id = slot.technician_profile_id AND profile.deleted_at IS NULL
    JOIN shops AS shop ON shop.id = slot.shop_id
    WHERE ${slotScope}
    UNION
    SELECT bucket.bucket_key, booking.technician_profile_id AS profile_id
    FROM buckets AS bucket
    JOIN booking_orders AS booking
      ON booking.starts_at >= bucket.from_inclusive
      AND booking.starts_at < bucket.to_exclusive
      AND booking.deleted_at IS NULL
      AND booking.status <> ${"cancelled"}
      AND booking.technician_profile_id IS NOT NULL
    JOIN technician_profiles AS profile
      ON profile.id = booking.technician_profile_id AND profile.deleted_at IS NULL
    JOIN shops AS shop ON shop.id = booking.shop_id
    WHERE ${bookingScope}
  )
  SELECT bucket.bucket_key AS bucketKey,
    (SELECT COUNT(slot.id) FROM schedule_slots AS slot
      JOIN shops AS shop ON shop.id = slot.shop_id
      WHERE slot.deleted_at IS NULL AND slot.status = ${"available"}
        AND slot.starts_at < bucket.to_exclusive
        AND slot.ends_at > bucket.from_inclusive
        AND ${slotScope}) AS availableScheduleSlots,
    (SELECT COUNT(DISTINCT active.profile_id)
      FROM active_profiles AS active
      WHERE active.bucket_key = bucket.bucket_key) AS activeTechnicians,
    (SELECT COUNT(DISTINCT profile.id)
      FROM technician_profiles AS profile
      LEFT JOIN shops AS direct_shop
        ON direct_shop.id = profile.shop_id AND direct_shop.deleted_at IS NULL
      LEFT JOIN technician_shop_affiliations AS affiliation
        ON affiliation.technician_profile_id = profile.id
        AND affiliation.work_status = ${"active"}
        AND affiliation.deleted_at IS NULL
        AND affiliation.starts_at < bucket.to_exclusive
        AND (affiliation.ends_at IS NULL OR affiliation.ends_at >= bucket.to_exclusive)
      LEFT JOIN shops AS affiliation_shop
        ON affiliation_shop.id = affiliation.shop_id AND affiliation_shop.deleted_at IS NULL
      WHERE profile.deleted_at IS NULL
        AND profile.created_at < bucket.to_exclusive
        AND ${technicianScope}) AS registeredTechnicians,
    (SELECT COUNT(shop.id)
      FROM shops AS shop
      WHERE shop.deleted_at IS NULL
        AND shop.created_at < bucket.to_exclusive
        AND ${shopStockScope}) AS shopCount,
    (SELECT COUNT(profile.id)
      FROM customer_profiles AS profile
      WHERE profile.deleted_at IS NULL
        AND profile.created_at >= bucket.from_inclusive
        AND profile.created_at < bucket.to_exclusive
        AND ${customerScope}) AS newCustomers
  FROM buckets AS bucket
`);
```

Do not paste raw city/shop values into SQL. Map by `bucketKey`, reject duplicate/unknown keys, and return `input.window.buckets.map(...)` with explicit zeros for missing rows.

- [ ] **Step 5: Compose one three-day window in the service**

Resolve the mini window from the selected end date:

```ts
const headlineWindow = resolveDashboardWindow({
  period: "custom",
  from: shiftCalendarDate(window.toDate, -2),
  to: window.toDate
}, evaluatedAt);

const [aggregate, headlineBuckets] = await Promise.all([
  this.repository.getDashboard({ scope, city, window, evaluatedAt }),
  this.repository.getHeadlineSeries3d({
    scope, city, window: headlineWindow, evaluatedAt
  })
]);
```

Pass `headlineBuckets` into `composeDashboard` and return:

```ts
headlineSeries3d: {
  from: headlineWindow.fromDate,
  to: headlineWindow.toDate,
  timeZone: "Asia/Tokyo",
  buckets: headlineBuckets
}
```

Use the same code path for platform and merchant responses; existing merchant UI may ignore the additive field.

- [ ] **Step 6: Publish the OpenAPI and frontend type**

Add a strict `DashboardHeadlineSeriesPoint` schema and require `headlineSeries3d` in `BackofficeDashboard`. Require exactly three items with `minItems: 3` and `maxItems: 3`. Add this identical frontend contract to `src/api/backofficeRealData.ts`:

```ts
export interface DashboardHeadlineSeriesPoint {
  key: string;
  label: string;
  availableScheduleSlots: number;
  activeTechnicians: number;
  registeredTechnicians: number;
  shopCount: number;
  newCustomers: number;
}

export interface DashboardHeadlineSeries3d {
  from: string;
  to: string;
  timeZone: "Asia/Tokyo";
  buckets: DashboardHeadlineSeriesPoint[];
}

headlineSeries3d: DashboardHeadlineSeries3d;
```

Place the final property inside the existing `BackofficeDashboardPayload` interface.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: all suites PASS and SQL assertions prove three bucket rows, exact scope binding, and explicit zero skeletons.

- [ ] **Step 8: Commit Task 3**

```bash
git add backend/src/domain/dashboard.ts \
  backend/src/repositories/dashboard.repository.ts \
  backend/src/repositories/backoffice.repository.ts \
  backend/src/services/backoffice.service.ts backend/src/api/openapi.ts \
  backend/tests/dashboard-activity.repository.test.ts \
  backend/tests/dashboard-service.test.ts backend/tests/backoffice-api.test.ts \
  backend/tests/openapi.test.ts src/api/backofficeRealData.ts
git commit -m "feat(dashboard): add exact three-day headline series"
```

---

### Task 4: Align ranking panels and render one red TEST badge language

**Files:**

- Create: `src/features/dashboard/DashboardTestBadge.tsx`
- Create: `src/features/dashboard/DashboardTestBadge.test.tsx`
- Modify: `src/features/dashboard/AnalyticsRankingPanel.tsx`
- Modify: `src/features/dashboard/AnalyticsRankingPanel.test.tsx`
- Modify: `src/features/dashboard/DashboardMetricCard.tsx`
- Modify: `src/features/dashboard/DashboardMetricCard.test.tsx`
- Modify: `src/features/dashboard/dashboardTranslations.ts`

**Interfaces:**

- Consumes: Task 2 `AnalyticsRankingItem.dataComposition`.
- Produces: `DashboardTestBadge({ ariaLabel?: string })` and aligned ranking header markup.

- [ ] **Step 1: Write failing component tests**

Add tests that require:

```ts
expect(badge).toHaveClass("border-coral/40", "bg-coral/10", "text-coral");
expect(container.querySelectorAll('[data-ranking-header-row="primary"]')).toHaveLength(1);
expect(container.querySelector('[data-ranking-header-row="primary"]')).toHaveClass("min-h-9");
expect(container.querySelector('[data-dashboard-test-badge="true"]')?.textContent).toBe("TEST");
```

Exercise `test`, `mixed`, and `formal`: the first two render one badge, while `formal` renders none. Keep the badge a non-button element.

- [ ] **Step 2: Run focused UI tests and verify RED**

```bash
npm test -- --run \
  src/features/dashboard/DashboardTestBadge.test.tsx \
  src/features/dashboard/AnalyticsRankingPanel.test.tsx \
  src/features/dashboard/DashboardMetricCard.test.tsx
```

Expected: FAIL because the shared badge and header-height contract do not exist.

- [ ] **Step 3: Create and reuse the badge primitive**

```tsx
export function DashboardTestBadge({ ariaLabel = "TEST" }: { ariaLabel?: string }) {
  return (
    <span
      aria-label={ariaLabel}
      className="inline-flex rounded-full border border-coral/40 bg-coral/10 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-coral"
      data-dashboard-test-badge="true"
    >
      TEST
    </span>
  );
}
```

Use it in `DashboardMetricCard` without changing `aria-disabled`, title, or noninteractive behavior.

- [ ] **Step 4: Align ranking rows and show composition**

Change the first header row to:

```tsx
<div
  className="flex min-h-9 flex-wrap items-center justify-between gap-3"
  data-ranking-header-row="primary"
>
```

Beside `displayName`, render:

```tsx
{item.dataComposition === "formal" ? null : (
  <DashboardTestBadge
    ariaLabel={t(item.dataComposition === "mixed"
      ? "排行榜合计包含测试订单"
      : "排行榜数据来自测试订单")}
  />
)}
```

Add complete simplified-Chinese, traditional-Chinese, Japanese, English, and Korean entries for both source strings.

- [ ] **Step 5: Run focused UI tests and verify GREEN**

Run the Step 2 command.

Expected: all suites PASS; formal rows have no badge and every TEST badge uses the red shared primitive.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/features/dashboard/DashboardTestBadge.tsx \
  src/features/dashboard/DashboardTestBadge.test.tsx \
  src/features/dashboard/AnalyticsRankingPanel.tsx \
  src/features/dashboard/AnalyticsRankingPanel.test.tsx \
  src/features/dashboard/DashboardMetricCard.tsx \
  src/features/dashboard/DashboardMetricCard.test.tsx \
  src/features/dashboard/dashboardTranslations.ts
git commit -m "fix(dashboard): align rankings and highlight test data"
```

---

### Task 5: Render server-authoritative three-day sparklines in headline cards

**Files:**

- Create: `src/features/dashboard/DashboardMetricSparkline.tsx`
- Create: `src/features/dashboard/DashboardMetricSparkline.test.tsx`
- Modify: `src/features/dashboard/DashboardMetricCard.tsx`
- Modify: `src/features/dashboard/DashboardMetricCard.test.tsx`
- Modify: `src/pages/admin/DashboardPage.tsx`
- Modify: `src/pages/admin/DashboardPage.test.ts`

**Interfaces:**

- Consumes: Task 3 `BackofficeDashboardPayload.headlineSeries3d`.
- Produces: `DashboardMetricSparklinePoint` and optional `DashboardMetricCard.sparkline`.

- [ ] **Step 1: Write failing sparkline and page-wiring tests**

Use this exact public type:

```ts
export interface DashboardMetricSparklinePoint {
  key: string;
  label: string;
  value: number;
}
```

Tests must assert exactly three server points, a finite path, three nodes, a flat middle line when all values match, and an accessible text list containing every label/value. In `DashboardPage.test.ts`, assert five sparkline props map to:

```ts
availableScheduleSlots
activeTechnicians
registeredTechnicians
shopCount
newCustomers
```

Also assert `DashboardPage.tsx` does not calculate points from `comparison.current`, `comparison.previous`, or `changeRatePercent`.

- [ ] **Step 2: Run focused sparkline tests and verify RED**

```bash
npm test -- --run \
  src/features/dashboard/DashboardMetricSparkline.test.tsx \
  src/features/dashboard/DashboardMetricCard.test.tsx \
  src/pages/admin/DashboardPage.test.ts
```

Expected: FAIL because no sparkline component, prop, or mapping exists.

- [ ] **Step 3: Implement the minimal exact three-point sparkline**

Reject non-three-point or non-finite input by returning `null`. Normalize within a fixed `96 × 48` view box:

```ts
const values = points.map((point) => point.value);
const minimum = Math.min(...values);
const maximum = Math.max(...values);
const y = (value: number) => maximum === minimum
  ? 24
  : 40 - ((value - minimum) / (maximum - minimum)) * 32;
const x = (index: number) => 8 + index * 40;
const path = points.map((point, index) =>
  `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.value)}`
).join(" ");
```

Render a baseline, the unsmoothed path, and three nodes in `currentColor`; render a screen-reader-only list with all date/value pairs.

- [ ] **Step 4: Add the card slot and bind all five metrics**

Add:

```ts
sparkline?: DashboardMetricSparklinePoint[];
```

Place it beside the main value in a `flex min-w-0 items-end justify-between gap-3` row. Do not move analytics detail accessories or TEST badges.

In `DashboardPage`, derive points only from `dashboard.headlineSeries3d` through a runtime-guarded key-selecting helper. The guard keeps the summary visible if a stale server omits or corrupts the additive field:

```ts
const headlineSparkline = (
  value: unknown,
  key: keyof Omit<DashboardHeadlineSeriesPoint, "key" | "label">
) => {
  if (!value || typeof value !== "object") return undefined;
  const buckets = (value as { buckets?: unknown }).buckets;
  if (!Array.isArray(buckets) || buckets.length !== 3) return undefined;
  const points = buckets.map((candidate) => {
    if (!candidate || typeof candidate !== "object") return null;
    const bucket = candidate as Record<string, unknown>;
    const pointValue = bucket[key];
    if (
      typeof bucket.key !== "string" ||
      typeof bucket.label !== "string" ||
      typeof pointValue !== "number" ||
      !Number.isFinite(pointValue)
    ) return null;
    return { key: bucket.key, label: bucket.label, value: pointValue };
  });
  return points.every((point): point is DashboardMetricSparklinePoint => point !== null)
    ? points
    : undefined;
};
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: all suites PASS and every headline card has exactly one three-point server-backed sparkline.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/features/dashboard/DashboardMetricSparkline.tsx \
  src/features/dashboard/DashboardMetricSparkline.test.tsx \
  src/features/dashboard/DashboardMetricCard.tsx \
  src/features/dashboard/DashboardMetricCard.test.tsx \
  src/pages/admin/DashboardPage.tsx src/pages/admin/DashboardPage.test.ts
git commit -m "feat(dashboard): add three-day headline sparklines"
```

---

### Task 6: Add numeric chart axes and point detail interactions

**Files:**

- Create: `src/features/dashboard/dashboardChartScale.ts`
- Create: `src/features/dashboard/dashboardChartScale.test.ts`
- Modify: `src/features/dashboard/DashboardCharts.tsx`
- Modify: `src/features/dashboard/DashboardCharts.test.tsx`
- Modify: `src/features/dashboard/dashboardTranslations.ts`

**Interfaces:**

- Consumes: existing `DashboardBucketPayload`, `DashboardChartSeries`, and dashboard number formatter.
- Produces: `createDashboardAxis(values, tickCount)` and interactive `DualAxisLineChart` nodes.

- [ ] **Step 1: Write failing pure scale tests**

Define:

```ts
export interface DashboardAxis {
  minimum: number;
  maximum: number;
  ticks: number[];
  y(value: number, top: number, height: number): number;
}

export function createDashboardAxis(values: number[], tickCount = 5): DashboardAxis;
```

Tests cover `[0, 4]`, `[12000, 24000]`, a zero-only series, negative/positive values, decimal inputs, and no duplicate ticks. All coordinates must be finite and bounded.

- [ ] **Step 2: Write failing line-chart interaction tests**

In jsdom render a two-series chart and assert:

```ts
expect(container.querySelectorAll('[data-axis-side="left"]')).not.toHaveLength(0);
expect(container.querySelectorAll('[data-axis-side="right"]')).not.toHaveLength(0);
expect(container.querySelectorAll('[data-chart-point-control="true"]')).toHaveLength(4);
```

Click the first point, then require a panel containing its date, `2 单`, and `12,000 JPY`. Exercise Enter, Space, close, Escape, and rerender with different buckets to prove selection resets.

- [ ] **Step 3: Run chart tests and verify RED**

```bash
npm test -- --run \
  src/features/dashboard/dashboardChartScale.test.ts \
  src/features/dashboard/DashboardCharts.test.tsx
```

Expected: FAIL because visible numeric axes and point controls do not exist.

- [ ] **Step 4: Implement deterministic independent axes**

`createDashboardAxis` must include zero, use a nonzero internal range for flat input, and deduplicate display ticks. Keep left and right scales independent. Feed their `y` functions to line paths and nodes, and render tick labels at the matching grid-line positions:

```tsx
<text
  data-axis-side="left"
  data-no-i18n
  textAnchor="end"
  x={plot.left - 8}
  y={tickY + 4}
>
  {formatDashboardNumber(tick, language)}
</text>
```

Mirror right labels at `chartWidth - plot.right + 8` with `textAnchor="start"`. A zero-only axis renders one visible `0` label.

- [ ] **Step 5: Implement point selection and anchored detail panel**

Track the selected bucket index in `DualAxisLineChart` and reset it when the joined bucket keys change:

```ts
const bucketKey = buckets.map((bucket) => bucket.key).join("|");
const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
useEffect(() => setSelectedIndex(null), [bucketKey]);
```

For every visible node, add a transparent hit target with:

```tsx
role="button"
tabIndex={0}
data-chart-point-control="true"
aria-label={`${bucket.label} ${item.label} ${formattedValue} ${item.unit}`}
onClick={() => setSelectedIndex(index)}
onKeyDown={(event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setSelectedIndex(index);
  }
}}
```

Render an absolutely positioned panel inside the chart frame, anchored from `getX(selectedIndex, buckets.length)` and clamped left/right. Include all plotted series, a localized close button, and `data-dashboard-point-detail="true"`. Add a chart-level Escape handler.

- [ ] **Step 6: Add translations and preserve existing accessibility**

Add complete translations for `关闭数据提示` and `节点详细数据`. Keep the existing screen-reader table, reduced-motion rule, empty state, X-axis dates, and noninteractive grouped-bar behavior.

- [ ] **Step 7: Run chart tests and verify GREEN**

Run the Step 3 command.

Expected: all suites PASS with finite paths, independent numeric axes, mouse/keyboard details, dismissal, and selection reset.

- [ ] **Step 8: Commit Task 6**

```bash
git add src/features/dashboard/dashboardChartScale.ts \
  src/features/dashboard/dashboardChartScale.test.ts \
  src/features/dashboard/DashboardCharts.tsx \
  src/features/dashboard/DashboardCharts.test.tsx \
  src/features/dashboard/dashboardTranslations.ts
git commit -m "feat(dashboard): expose chart axes and point details"
```

---

### Task 7: Complete regression, formal data, and browser acceptance

**Files:**

- Modify: `docs/backoffice-real-data.md`

**Interfaces:**

- Consumes: Tasks 1–6.
- Produces: fresh verification evidence and an explicit local-only acceptance record.

- [ ] **Step 1: Run all focused backend dashboard tests**

```bash
npm --prefix backend test -- --runInBand \
  tests/analytics-ranking.repository.test.ts \
  tests/analytics-ranking.repository.integration.test.ts \
  tests/analytics-ranking.service.test.ts \
  tests/analytics-ranking-api.test.ts \
  tests/analytics-ranking-openapi.test.ts \
  tests/dashboard-activity.repository.test.ts \
  tests/dashboard-service.test.ts \
  tests/backoffice-api.test.ts \
  tests/openapi.test.ts
```

Expected: all listed suites PASS with zero failures.

- [ ] **Step 2: Run all focused frontend dashboard tests**

```bash
npm test -- --run \
  src/api/backofficeRealData.test.ts \
  src/features/dashboard/DashboardTestBadge.test.tsx \
  src/features/dashboard/AnalyticsRankingPanel.test.tsx \
  src/features/dashboard/AnalyticsRankingsSection.test.tsx \
  src/features/dashboard/DashboardMetricSparkline.test.tsx \
  src/features/dashboard/DashboardMetricCard.test.tsx \
  src/features/dashboard/dashboardChartScale.test.ts \
  src/features/dashboard/DashboardCharts.test.tsx \
  src/pages/admin/DashboardPage.test.ts
```

Expected: all listed files PASS with zero failures.

- [ ] **Step 3: Run full static and build gates**

```bash
npm --prefix backend run lint
npm --prefix backend run build
npm run lint
npm run i18n:audit
npm run build
npm run audit:production-bundle
```

Expected: every command exits 0; no TypeScript, ESLint, i18n, Vite, or production-bundle error.

- [ ] **Step 4: Reconcile the local formal evidence without writing data**

Run the existing simulation checker and record its exact outcome separately from dashboard acceptance:

```bash
ALLOW_SIMULATION_SEED=true ENV_FILE=.env.dev npm --prefix backend run check:simulation-data
```

Then run a read-only query or an authenticated ranking request proving that the current seven-day window includes the five observed test completions and that returned `testCompletedCount` values reconcile to included orders. Do not seed or repair the unrelated contact-count discrepancy in this microstep.

- [ ] **Step 5: Prove runtime ownership before browser acceptance**

```bash
lsof -nP -iTCP:5180 -sTCP:LISTEN
lsof -nP -iTCP:3000 -sTCP:LISTEN
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
git branch --show-current
git rev-parse HEAD
```

For each listener PID, use `lsof -a -p <PID> -d cwd` and accept the standard runtime only if frontend cwd is this worktree and backend cwd is this worktree’s `backend`. If another checkout owns a standard port, do not kill it without user authorization and do not present alternate-port results as standard-runtime acceptance.

- [ ] **Step 6: Perform authenticated operations browser acceptance**

At `http://127.0.0.1:5180/pf-admin.html#/admin`, verify:

1. all applicable Top 10 panels contain the real local test completion data;
2. test/mixed rows and disabled TEST capability labels are red;
3. all three ranking dividers align;
4. all five headline cards show three exact API-backed points without overlap;
5. left and right numeric axes are visible in all three line charts;
6. mouse, Enter, Space, close, and Escape point-detail behavior works;
7. period and city changes refresh rankings, sparklines, axes, and tooltip state coherently;
8. there are no failed dashboard requests, console errors, or horizontal overflow in the tested desktop viewport;
9. light and dark theme contrast remains readable.

Capture API payloads or screenshots sufficient to compare displayed values to returned values. Do not click unrelated write actions.

- [ ] **Step 7: Update formal dashboard documentation**

Append a dated section to `docs/backoffice-real-data.md` documenting:

- combined ranking and explicit test subset semantics;
- the three-day Tokyo series definition;
- numeric-axis and point-detail behavior;
- unchanged RBAC/audit/evidence rules;
- no schema/migration/seed change;
- focused/full command results;
- local browser acceptance separately from merge, push, deployment, and staging.

- [ ] **Step 8: Review the final diff for forbidden scope expansion**

```bash
git status --short
git diff --check main...HEAD
git diff --stat main...HEAD
git diff --name-only main...HEAD
rg -n "T[D]O|F[I]XME|not[ -]implemented|place[h]older|fake dashboard|mock dashboard" \
  backend/src/domain/analytics-ranking.ts \
  backend/src/repositories/analytics-ranking.repository.ts \
  backend/src/domain/dashboard.ts \
  backend/src/repositories/dashboard.repository.ts \
  backend/src/services/backoffice.service.ts \
  src/features/dashboard src/pages/admin/DashboardPage.tsx
```

Expected: only planned files changed, no whitespace errors, and no forbidden implementation markers.

- [ ] **Step 9: Commit documentation and verification record**

```bash
git add docs/backoffice-real-data.md
git commit -m "docs: record dashboard visual evidence acceptance"
```

- [ ] **Step 10: Run final clean-tree evidence**

```bash
git status --short
git log --oneline --decorate main..HEAD
```

Expected: `git status --short` has no output. Report local commit, local tests, build, read-only database reconciliation, and authenticated browser acceptance as distinct facts. Report merge, push, deployment, migration, and staging as not performed.
