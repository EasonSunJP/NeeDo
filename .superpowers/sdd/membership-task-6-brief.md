# Membership / Rankings Task 6 — Formal operations dashboard TOP10 panels

## Objective

Add the three requested formal TOP10 panels to the existing operations data dashboard: service items, technicians and customer consumption. Each panel reads the accepted Membership Task3 ranking endpoint, shows the server's stable rank plus both GMV and completed-order count, and lets the operator independently switch the primary metric and direct service category.

This task is frontend-only. It does not alter the Task3 backend contract, add ranking detail/export routes, change dashboard metrics, implement Membership Task7/8, or create any mock, fallback leaderboard, client-side aggregate or local ranking algorithm.

## Authorized files

- Create `src/features/dashboard/AnalyticsRankingPanel.tsx`
- Create `src/features/dashboard/AnalyticsRankingPanel.test.tsx`
- Modify `src/api/backofficeRealData.ts`
- Modify `src/api/backofficeDashboard.test.ts`
- Modify `src/pages/admin/DashboardPage.tsx`
- Modify `src/pages/admin/DashboardPage.test.ts`
- Modify `src/i18n/translations.ts`

Do not modify backend files, Task3 files, membership detail files, `src/App.tsx`, admin navigation, merchant pages, shared domain mocks or unrelated dashboard components. Preserve concurrent Task3 changes already present in the worktree.

## Authoritative backend contracts

### Ranking read

Consume exactly:

```text
GET /api/v1/backoffice/analytics/rankings/:kind
```

where `kind` is exactly `service | technician | customer`. The frontend sends:

- `metric=gmv | completedCount`;
- the already committed dashboard `period`, and `from`/`to` only for `custom`;
- the already committed exact `city` when present;
- the panel's positive-integer `categoryId` when selected;
- `page=1` and `pageSize=10`.

The client must use the Task3 response without renaming, recalculating or weakening it:

```ts
export type AnalyticsRankingKind = "service" | "technician" | "customer";
export type AnalyticsRankingMetric = "gmv" | "completedCount";
export type AnalyticsRankingEntityType =
  | "service"
  | "technician_service"
  | "technician"
  | "customer";

export interface AnalyticsRankingItemPayload {
  rank: number;
  entityType: AnalyticsRankingEntityType;
  entityPublicId: string;
  entityNumericId: number;
  displayName: string;
  avatarUrl: string | null;
  categoryId: number | null;
  gmvJpy: number;
  completedCount: number;
  registeredAt: string;
}

export interface AnalyticsRankingPayload {
  list: AnalyticsRankingItemPayload[];
  total: number;
  page: 1;
  page_size: 10;
  dataStatus: "ready";
  filter: {
    kind: AnalyticsRankingKind;
    metric: AnalyticsRankingMetric;
    period: DashboardPeriod;
    from: string;
    to: string;
    timeZone: "Asia/Tokyo";
    city: string | null;
    categoryId: number | null;
    evaluatedAt: string;
  };
}
```

`backofficeRealDataApi.analyticsRankings(kind, query, options)` must accept a typed query made from `DashboardQuery` plus `metric` and optional `categoryId`. It must serialize through the existing dashboard query rules and forward `AbortSignal`. It always supplies the fixed TOP10 pagination itself; callers cannot override it.

### Formal category catalog

Category labels must come from the existing formal read:

```text
GET /api/v1/categories?page=1&pageSize=100
```

Add one strict adapter method to `backofficeRealDataApi`; do not import a typed-only response from `coreReadApi`, hard-code category names/IDs, or derive options from ranking rows. The adapter validates the exact paginated envelope and exact category fields (`id`, `code`, `name`, `nameJa`, `nameEn`, `parentId`, `iconUrl`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`), canonical safe integers, timestamps, nullability and unique IDs. The formal endpoint already returns only active, non-deleted categories in `sortOrder ASC, id ASC`; the adapter must preserve that order.

This frontend task supports at most the endpoint's first 100 formal categories. Require `page = 1`, `page_size = 100`, `total === list.length` and `total <= 100`; otherwise fail closed with `error.api` rather than presenting a partial category selector. Load the catalog once per mounted dashboard generation, not once per panel. A catalog failure does not invent options and does not block the explicit unfiltered ranking default: show an inline category-load error, keep only `全部服务类型`, and provide a real retry that re-reads the catalog.

Dynamic category names are server-owned data and use `data-no-i18n`. Display `nameJa ?? name` for Japanese, `nameEn ?? name` for English, and the formal `name` for Simplified Chinese, Traditional Chinese and Korean; do not machine-translate, mutate or persist them in the browser.

## Strict response adapter

The rankings adapter receives `unknown` and accepts only the exact Task3 object shape; extra/missing keys fail with `error.api`. It must also enforce all of the following before returning a payload to React:

- exact `dataStatus`, kind, metric, period, city and selected category echo;
- exact dashboard-period calendar semantics already used by the dashboard adapter (`today=1`, `last7days=7`, `last30days=30`, current Monday–Sunday week, full calendar month, full Jan–Dec year, or the exact custom dates), `Asia/Tokyo`, and a valid canonical ISO `evaluatedAt`;
- `page === 1`, `page_size === 10`, safe non-negative `total`, list length at most ten and `list.length <= total`;
- every rank, numeric ID, GMV and count is a canonical non-negative safe integer, while rank and entity ID are positive;
- first-page ranks are exactly `1..list.length` in received order; duplicate rank or duplicate `(entityType, entityPublicId)` fails;
- visible trimmed `entityPublicId` and `displayName`, valid ISO `registeredAt`, and `avatarUrl` either null or a visible trimmed string;
- `service` responses contain only `service | technician_service`; `technician` only `technician`; `customer` only `customer`;
- an unfiltered response gives null `categoryId` for every item; a filtered response echoes the selected category ID on every technician/customer item and the exact selected current category on every service item.

Never calculate rank, totals, GMV, counts, percentages or category attribution in React. Never sort, filter, deduplicate, truncate, merge or repair response rows locally. A malformed payload is an explicit panel error, not an empty result.

## Dashboard placement and committed-filter ownership

Keep the existing operations dashboard route and layout. Add one section after the complete `综合数据概要` groups and before the page ends. Its desktop order is exactly:

1. `服务项目排行 TOP10`
2. `技师排行 TOP10`
3. `用户消费排行 TOP10`

Do not place these panels in the merchant dashboard, the membership detail page, a new route or a modal.

The dashboard's coherent `dashboard + overview` pair remains the sole city/time authority. Rankings receive `pair.query`, never the editable filter-bar draft. While a newly applied dashboard query is pending or has failed, all visible ranking controls/results remain explicitly bound to the last successful committed pair and no ranking request may use the draft query. On every successful coherent pair commit, including a same-query manual refresh, increment a ranking generation token and refresh all three panels using that committed query.

Before the first coherent dashboard pair exists, do not request or render rankings. A failed initial dashboard load therefore cannot trigger ranking reads.

## Panel behavior

`AnalyticsRankingPanel` is a reusable production component with these conceptual inputs:

```ts
type AnalyticsRankingPanelProps = {
  kind: AnalyticsRankingKind;
  committedQuery: DashboardQuery;
  refreshGeneration: number;
  categories: readonly AnalyticsRankingCategory[];
  categoryStatus: "loading" | "ready" | "error";
  onRetryCategories: () => void;
};
```

Each mounted panel owns independent UI state:

- default metric `gmv`;
- default category `null` (`全部服务类型`);
- its own loading/error/success state, request generation and retry;
- no pagination UI because this surface is exactly page 1/page size 10.

All three panels expose two real buttons, `按 GMV` and `按完成次数`, with `aria-pressed`. All three expose their own labelled formal category selector. For service ranking, the selected category limits ranked service/service-offering lines. For technician/customer ranking, use Task3 semantics exactly: GMV is matching-line GMV and completed count is distinct completed orders having at least one matching line. The frontend must not describe a filtered technician/customer GMV as full-order GMV.

Changing a panel metric or category refreshes only that panel. The category selector remains `全部服务类型` while the catalog is loading/error and is disabled until the exact catalog is ready; a selected category that disappears from a newly committed catalog is reset to null before any next ranking request, so the UI never sends an invisible stale category ID.

Every row displays, without mutation:

- server `rank`;
- formal avatar when `avatarUrl` is non-null;
- `displayName` as `data-no-i18n`;
- formatted `gmvJpy` as integer JPY;
- formatted integer `completedCount` with the localized completed-orders label.

Both measures are always visible. The selected metric may receive visual emphasis only; it must not hide the secondary measure or imply that the frontend selected the order. For null avatar, render a neutral accessible `未提供头像` state, not a stock photo, generated portrait, mock URL or unrelated local image. Do not link a row to a detail route because Task3 publishes no formal ranking-detail route.

## Async state and failure isolation

Build the ranking request semantic key from exact `kind + metric + categoryId + committed period/from/to/city + refreshGeneration`. On any key change:

1. abort the prior request;
2. advance a monotonically increasing request ID;
3. mark the new key loading;
4. ignore every resolution/rejection whose signal is aborted, request ID is obsolete, or semantic key is no longer current.

Never show rows from key A under controls for key B. A same-key retry may keep its prior successful rows visibly marked as `正在更新排行榜，当前仍显示上次成功结果`; a changed key hides old rows until the matching response commits. A rejected superseded request must not overwrite a newer success or announce an error.

One panel's loading, empty state, 400/404/409/500/network error or retry must not remove, disable or refetch either other panel. Map errors explicitly:

- 401: session expired;
- 403: no ranking-read permission;
- 404: selected service category is no longer available, reset it to `全部服务类型` only after showing the category-specific error and let the operator retry deliberately;
- 409: formal ranking evidence is incomplete; never render partial rows;
- 400: invalid ranking filter;
- 5xx/network/malformed response: load failure with retry.

An exact successful empty `list` renders `暂无符合条件的排行数据`, not an error or mock entries. `total > 10` does not add local pagination or an eleventh row. Retry repeats only the current semantic command.

## RBAC

The existing `/admin` route remains protected by `page:dashboard`. Wrap the complete ranking section in the real `PermissionGate` for exact permission `backoffice:analytics-ranking:read`.

- A session without that permission renders a localized, non-interactive `当前身份没有查看排行榜的权限` notice and issues zero ranking and zero ranking-category requests.
- An allowed session uses the authenticated ranking endpoint; do not infer access from `menu:dashboard`, role names, route visibility or frontend flags.
- A runtime 403 remains an explicit permission error in the affected panel.

Do not add or change frontend permission constants, backend grants, menus or routes in this task.

## Accessibility, responsive layout and i18n

- Render the three panels in one semantic section with a visible `排行榜` heading and an accessible description of the currently committed city/date scope.
- Each panel has its own heading, status live region and labelled metric/category controls. Do not use clickable `div` elements.
- Metric buttons expose `aria-pressed`; the category control has a unique label containing its panel title; retry buttons name the failed panel.
- Rank list uses `ol`/`li`; avatars have localized alt text or the explicit no-avatar label; focus indicators remain visible.
- Use `aria-busy` only for the panel whose current semantic key is loading. Errors use `role=alert`; loading/updating uses polite live status.
- Use `min-w-0` throughout. The outer desktop grid is three equal columns at the existing wide-admin breakpoint, collapses to one column on narrow screens and may use two columns only at an intermediate width where each card remains readable. Rows wrap/truncate long formal names without clipping rank/GMV/count. No page-level horizontal overflow is allowed at 1280px desktop, 1024px compact desktop or 390px narrow acceptance widths.

All operator-visible static copy must use the existing admin i18n path and include complete values for `zh`, `zh-Hant`, `ja`, `en` and `ko`. Add explicit translations for panel titles, ranking heading, metric buttons, category labels/default, GMV/count labels, loading/updating/empty/error/retry/permission/evidence messages, avatar labels and scope description. Dynamic names, public IDs, numeric values, server dates and category names use `data-no-i18n`; never send them through the runtime translation dictionary.

## No fake or local persistence

- No `src/data/mock`, fixture arrays, demo rows, random avatars, placeholder counts or hard-coded category options in production.
- No fallback to the legacy `/backoffice/technician-rankings`, its mapper, export endpoint or existing local technician ranking.
- No `localStorage`, `sessionStorage`, IndexedDB or URL persistence for rankings. Metric/category selection is ephemeral component state and resets on a fresh dashboard mount.
- No local sort, aggregate, rank, filter, total, category attribution or completed-checkout inference.
- No optimistic row changes. Only a validated successful response may replace a panel result.

## Tests

### Strict API adapter

Extend `src/api/backofficeDashboard.test.ts` with behavior tests that exercise the real adapter and HTTP mock:

- exact path and exact serialized query for all three kinds, both metrics, custom/non-custom periods, city, category, fixed page 1/pageSize 10 and forwarded AbortSignal;
- exact success for service, technician and customer, including service/technician-service entity types, null avatar, zero GMV/count and a full ten-row page;
- exact filter echo, calendar-period semantics, `evaluatedAt`, global first-page ranks and preserved server order;
- rejection of extra/missing keys, wrong kind/metric/filter/category/page/page_size/status/time zone, invalid period geometry/timestamp, >10 rows, inconsistent total, skipped/duplicate ranks, duplicate identities, wrong entity type/category shape, blank strings and negative/fractional/unsafe numbers;
- proof that the adapter neither sorts nor truncates a deliberately server-ordered valid payload;
- exact one-page category request, valid ordered catalog, nullable localized fields, and fail-closed extra keys, duplicates, inactive entries, bad dates/numbers, count/page mismatch or `total > 100`.

### Panel component

`AnalyticsRankingPanel.test.tsx` must render and interact with the actual component. Cover:

- default GMV request and exact TOP10 row order;
- independent GMV/completed-count buttons and `aria-pressed` state;
- category selection forwarding exact `categoryId`, category removal reset, and filtered technician/customer explanatory copy;
- rank/avatar/name/both-measure rendering, zero values, null-avatar state and no row navigation;
- initial loading, same-key updating, exact empty result, each stable API error class and retry;
- changed-key old-row hiding, aborted request, deferred A resolving/rejecting after B, and zero stale overwrite/error;
- one panel instance changing state without mutating a separately rendered panel;
- no local sort/truncate/dedupe and no mock/legacy ranking import.

### Dashboard integration

Extend `DashboardPage.test.ts` with real component integration where practical and narrow mocks only at the API boundary:

- ranking section occurs after all three `综合数据概要` groups and panels appear service → technician → customer;
- no ranking/category request before the first coherent dashboard pair;
- exactly one category-catalog read and exactly three default ranking reads after commit;
- pending/failed next dashboard query keeps rankings bound to the prior committed query and issues no draft-filter request;
- successful next pair refreshes all panels with its exact city/time; same-query manual refresh also refreshes them;
- per-panel toggles do not refetch other panels;
- missing `backoffice:analytics-ranking:read` permission shows the permission notice and proves zero ranking/category calls;
- catalog loading/error/retry remains formal and unfiltered rankings stay available without fabricated options;
- all new static copy has non-empty, non-source translations in Japanese, English and Korean and a Traditional Chinese entry.

Tests must not satisfy the contract only with raw-source markers; the state, adapter and stale-request boundaries require behavior assertions.

## Browser acceptance

After focused tests, lint and build pass, verify against the standard local frontend/backend ports only after proving both listener PIDs, cwd/worktree and proxy origin. Use an authenticated admin/operator identity with `backoffice:analytics-ranking:read` and formal ranking/category data.

1. Load `/admin`; confirm the three panels appear after `综合数据概要` in the exact order and match the API row order/data.
2. Switch GMV/count separately in each panel; confirm both measures remain visible and only the selected panel requests again.
3. Select categories independently in service, technician and customer panels; confirm exact category IDs and filtered results.
4. Apply city and every supported period, including a custom range; confirm rankings change only after the dashboard pair commits and use the same committed query.
5. Force slow superseding requests and a ranking/category error; confirm stale data is never mislabelled, other panels stay usable, and retry works.
6. Verify empty data, missing avatar and permission-denied states without mock rows or broken images.
7. Switch through all five languages; static chrome changes while server-owned names/IDs/numbers remain intact.
8. At 1280px, 1024px and 390px, confirm no horizontal page overflow, clipped controls or inaccessible focus target. Check browser console for React, network, accessibility and unhandled-promise errors.

Do not call this browser acceptance complete if the backend is unavailable, listeners belong to another worktree, only fixture/unit tests ran, or the visible rows cannot be reconciled with the formal API responses.

## Verification gates

```bash
npm test -- src/api/backofficeDashboard.test.ts src/features/dashboard/AnalyticsRankingPanel.test.tsx src/pages/admin/DashboardPage.test.ts
npm test -- src/features/dashboard src/pages/admin/DashboardPage.test.ts
npm run lint
npm run build
git diff --check
```

Commit only the authorized frontend files with `feat: add switchable dashboard rankings`. Stop before Membership Task7 OpenAPI consolidation, Task8 verifier work, backend changes or shared-database operations.
