# Membership Task 5 — Formal member analytics detail page

## Objective

Build one formal, reusable member analytics detail page for operations and merchant administration. The page shows the server-authored fixed `added`, `removed`, and `net` membership trend with click-to-toggle legends and a strictly paginated list of distinct members added in the selected window. It supports the requested time, city, NeeDo ID, and nickname filters without introducing an operator-editable chart, mock data, browser-derived counts, or card-number leakage.

This task consumes the approved Membership Task2B API exactly. It does not alter backend contracts, membership lifecycle semantics, database schema, rankings, issuance, or the generic analytics metric API.

## Authorized files

- Modify `src/api/backofficeRealData.ts`
- Modify `src/api/backofficeDashboard.test.ts`
- Create `src/pages/admin/MembershipAnalyticsPage.tsx`
- Create `src/pages/admin/MembershipAnalyticsPage.test.tsx`
- Modify `src/pages/admin/DashboardPage.tsx`
- Modify `src/pages/admin/DashboardPage.test.ts`
- Modify `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx`
- Modify `src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts`
- Modify `src/components/admin/AdminLayout.tsx`
- Modify `src/components/admin/AdminLayout.test.ts`
- Modify `src/components/merchant-admin/MerchantAdminLayout.tsx`
- Modify `src/components/merchant-admin/MerchantAdminLayout.test.ts`
- Modify `src/App.tsx`
- Modify `src/App.test.tsx`
- Modify `src/i18n/translations.ts`

No backend, schema, migration, generated client, Task3 ranking, shared mock, seed, or unrelated UI file is authorized. If the implementation genuinely cannot meet this brief within these files, stop and amend the brief before expanding scope.

## Canonical routes, ownership, and permissions

The only new canonical page routes are:

- operations: `/admin/analytics/members`
- merchant administration: `/merchant-admin/analytics/members`

Create one `MembershipAnalyticsPage` implementation with an explicit `scope: "backoffice" | "merchant-admin"` prop and scope-specific shell/content behavior. Do not copy the page into two implementations.

- Operations renders inside `AdminLayout`, calls the backoffice Task2B endpoints, and exposes city filtering.
- Merchant administration renders inside `MerchantAdminLayout`, calls the merchant Task2B endpoints, and never accepts or sends `city` or `shopId`. The selected shop comes only from the authenticated merchant identity. Key the visible merchant result by the server-confirmed selected shop exposed by the layout resource; switching shop clears the old shop result synchronously and starts a fresh request only after the new shop is confirmed.
- Register the operations route with exact permission `backoffice.member.analytics.view` and the merchant route with exact permission `shop.member.analytics.view`. Use the session permission guard, not portal-only authorization or a client hardcoded role.
- Add exactly one permission-filtered `会员分析` navigation item under operations `用户管理` and exactly one under merchant `用户管理`. The item targets the canonical route and remains selected on that page. Do not restore the removed analytics-center/dashboard pages.
- Clicking the operations `new_paid_members` metric detail action must navigate to `/admin/analytics/members` with the last committed dashboard query. All other overview metrics retain their current generic detail routes.
- Make the merchant dashboard `会员数` card expose a real detail action to `/merchant-admin/analytics/members` with its last committed time query. It must not expose city or shop identifiers.
- The existing generic `/admin/analytics/metrics/:metricKey` route remains unchanged for other metrics. Do not create a second membership implementation there.

Tests must prove the two route guards with real App/auth behavior: unauthenticated redirects to the correct login, identities lacking the exact permission see the forbidden/fallback behavior, authorized operations admin/operator and merchant owner pass, and merchant staff/customer/technician cannot enter through client routing. Backend RBAC remains authoritative even if the client route is reached manually.

## URL and filter contract

The canonical query-string order is:

1. `period`
2. `from`
3. `to`
4. `city` — operations only
5. `needoId`
6. `nickname`
7. `page`
8. `pageSize`

Defaults are `period=last7days`, `page=1`, and `pageSize=20`. Canonical URLs include those defaults so a copied URL reproduces the exact list state. Omit `from/to` outside `custom`; omit empty city/search values. Operations may include a trimmed 1–100 UTF-16-unit city. Merchant treats `city` and `shopId` as invalid URL keys and never silently forwards them.

Parse the URL fail-closed before any request:

- accept only the exact keys above for the active scope, each at most once;
- accept the seven existing dashboard periods;
- require valid `YYYY-MM-DD` `from/to` for `custom`, with `from <= to`, and reject either key for every non-custom period;
- normalize NeeDo ID by trim and require canonical `^u\d{10}$`;
- normalize nickname by trim and require 1–100 JavaScript UTF-16 code units with at least one visible Unicode code point;
- require decimal canonical safe-integer `page >= 1`, bounded to the Task2B maximum, and `pageSize` from `1` through `100`;
- replace a valid non-canonical URL with its canonical serialization without issuing the superseded request;
- show a local invalid-filter error and issue zero requests for unknown, duplicate, malformed, or scope-forbidden input.

Use `DashboardFilterBar` for period/custom range and operations city. The operations city choices come only from the existing formal `/backoffice/dashboard` payload's `filter.availableCities`; do not invent or persist a city list. Merchant renders `DashboardFilterBar` without city choices.

Render a separate controlled member-search form containing `NeeDo ID` and `昵称`, with explicit `查询` and `重置` buttons. Draft text does not request until submit. Applying a period/city/search change resets `page` to 1 and preserves the other applied filters. Filter-bar reset returns the entire page to the three defaults and clears city, NeeDo ID, and nickname. Search reset clears NeeDo ID/nickname and resets only the page while preserving period/city. Pagination updates only `page` in the canonical URL.

## Exact frontend API types and runtime validation

Extend `backofficeRealDataApi` with explicit Task2B types and two scope-aware read methods (`membershipTrend` and `membershipAddedMembers`). The methods select only these four exact paths:

- `/backoffice/analytics/members/trend`
- `/backoffice/analytics/members`
- `/merchant-admin/analytics/members/trend`
- `/merchant-admin/analytics/members`

Both requests receive the same `AbortSignal`. Serialize `period/from/to` with the existing dashboard rules; backoffice may send `city`; merchant cannot. List alone additionally sends normalized `needoId`, `nickname`, `page`, and `pageSize`. Never send undefined, empty, unknown, `shopId`, or merchant `city` values.

Do not trust TypeScript generics as runtime validation. Read both endpoints as `unknown` and validate exact object keys and semantics before exposing typed data.

### Trend payload

Accept only:

```ts
interface MembershipAnalyticsFilter {
  period: DashboardPeriod;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  timeZone: "Asia/Tokyo";
  granularity: DashboardGranularity;
  city: string | null;
  evaluatedAt: string;
}

interface MembershipTrendPayload {
  dataStatus: "ready";
  filter: MembershipAnalyticsFilter;
  series: [
    { seriesKey: "added"; label: "Added members"; unit: "people"; points: MembershipTrendPoint[] },
    { seriesKey: "removed"; label: "Removed members"; unit: "people"; points: MembershipTrendPoint[] },
    { seriesKey: "net"; label: "Net members"; unit: "people"; points: MembershipTrendPoint[] }
  ];
}
```

Require one valid canonical ISO `evaluatedAt`, the same exact period/window/city semantics as the requested query, Tokyo time zone, and the existing exact granularity/calendar-window rules. Merchant requires `filter.city === null`.

The tuple must be exactly ordered `added`, `removed`, `net`, with the exact server labels and `people` unit. Every point is an exact `{key,label,value}` object. Added/removed values are canonical nonnegative safe integers; net is a canonical signed safe integer. The three arrays have the same nonzero length and identical ordered `key/label` pairs, keys are unique, and every net value equals `added - removed`. Reject malformed, duplicate, reordered, non-finite, fractional, unsafe, missing, or extra values with `error.api`; do not repair or calculate replacement server series in React.

### List payload

Accept only exact `{list,total,page,page_size}`. `total`, `page`, and `page_size` are canonical nonnegative/positive safe integers; returned `page/page_size` must equal the request; `list.length <= page_size` and cannot exceed the remaining total for that page.

Every item must contain exactly:

```ts
interface MemberAnalyticsListItem {
  userNeedoId: string;
  nickname: string;
  city: string;
  shopPublicId: string;
  shopName: string;
  membershipPublicId: string;
  planName: string | null;
  cardPublicId: string;
  cardNoMasked: string;
  acquisitionSource:
    | "offline_paid" | "online_paid" | "gift" | "trial" | "renewal"
    | "historical_replacement" | "manual_grant";
  addedAt: string;
  firstPaidAt: string | null;
  memberStatus: "active" | "inactive";
  cardStatus: "active" | "expired" | "frozen" | "void";
  expiresAt: string | null;
}
```

Require `userNeedoId` canonical, UUID membership/card public IDs, nonempty strings where the Task2B wire requires strings, valid canonical ISO timestamps, and exact enums. `firstPaidAt` is the independent platform-global first paid-card time and must not be ordered relative to this shop's `addedAt`. Require `cardNoMasked` to match only `••••` or `•••• •••• •••• ` plus exactly four trailing JavaScript UTF-16 code units, matching the approved backend mask utility; reject any value containing an exposed prefix. Require distinct `(shopPublicId,userNeedoId)` identities within one response and preserve server order. Do not derive total, status, first-paid time, source, or masked card value in the browser.

The operations `Promise.all` generation additionally reads the formal backoffice dashboard city catalog with the same `AbortSignal` and requires its applied filter to match the trend's period/current/previous window/time zone/granularity/city before committing. Merchant does not call the backoffice dashboard.

## Page presentation and accessibility

The page title is `会员详细分析`, with a scope-appropriate back link to the current data dashboard.

### Trend

- Render the exact fixed series through the existing `AnalyticsMetricDetail`/`FixedAnalyticsSeriesChart` path.
- Convert the validated fixed series keys to localized display labels `新增会员`, `减少会员`, and `会员净增`; do not display raw English API labels. Preserve keys, values, and point order exactly.
- Each legend is a real button with `aria-pressed`; its accessible name states `隐藏{label}` or `显示{label}` in the active language.
- Clicking a legend only hides/shows that series locally. It never edits, persists, deletes, renames, or requests a different series.
- All three legends start visible on each newly committed scope/filter result. Hiding all series shows the existing accessible no-series status.
- Zero-valued series still render. Do not replace a successful all-zero trend with unavailable state.

### Added-member list

Label the table/compact responsive list `所选期间新增会员`. State clearly that it is one distinct shop/user addition per row and may not equal the sum of the trend after leave/rejoin transitions.

Show only useful safe fields: NeeDo ID, nickname, city, shop name for operations, plan name, canonical masked card, localized acquisition source, added time, first-paid time, current member/card status, and expiry. Merchant may omit the redundant shop column. Do not render internal numeric IDs, full card number, deletion/audit data, issuance notes/reference, hidden public IDs, or raw unlocalized enum strings.

Use semantic table markup on desktop and an equally labelled compact representation at narrow widths without horizontal page overflow. Dynamic NeeDo IDs, names, city/shop names, masked cards, and timestamps use `data-no-i18n`; all surrounding labels and enum values are translated. Pagination uses real buttons with disabled first/previous/next states derived only from returned `page`, `page_size`, and `total`; expose current page and total accessibly. No export action is part of this task.

## Loading, empty, error, retry, and superseding requests

Treat trend, list, and the operations city-catalog response as one committed generation for a given canonical query and scope owner.

- First load: show a labelled loading state, set `aria-busy`, and do not show fabricated chart/list rows.
- Refresh/search/pagination: retain the last successful result only for the same operations scope or the same confirmed merchant shop, label it explicitly as the previous applied result, and show an updating status. Store the committed query with the result so retained data is never labelled with a pending URL query.
- Scope-owner change: clear old merchant data synchronously; never retain Shop A while Shop B is resolving, failed, or selected.
- Every generation gets one `AbortController` plus monotonically increasing request ID. Abort on query/scope/unmount and ignore both late resolve and late reject from superseded generations.
- Commit only after every response in that generation validates. Never display a new chart with an old list or vice versa.
- A failed refresh preserves only the last coherent same-owner result and exposes a retry for the exact current canonical query. First-load failure shows no stale data.
- Map 400 to invalid filters, 401 to expired login, 403 to missing member-analytics permission, 409/40966 to incomplete membership history, 5xx to temporary service failure, and other failures to network/retry guidance. Do not expose backend exception text.
- An empty successful list shows `所选期间没有新增会员` while retaining the valid trend and pagination summary. All-zero trend is still ready data.
- Search and pagination controls are disabled only when an action would create a duplicate in-flight request; navigation/back and retry remain keyboard reachable.

## Five-language i18n

Every new visible or accessible source string must have nonempty Simplified Chinese, Traditional Chinese, Japanese, English, and Korean output through the existing translation system. Add explicit entries for page titles, filter/search labels, fixed legend labels and actions, list headings/columns, acquisition/member/card status enums, loading/updating/empty/error/retry text, pagination, explanatory note, navigation labels, and both back links.

Tests must iterate `zh`, `zh-Hant`, `ja`, `en`, and `ko`; Japanese, English, and Korean must not fall back to Chinese. Assert accessible legend names and key form/table/navigation labels in each language. Do not mark translatable UI as `data-no-i18n`; do mark only server/user-authored values that must remain byte-for-byte unchanged.

## Required tests

### API adapter

In `src/api/backofficeDashboard.test.ts`, cover:

- all four exact endpoints and exact query serialization;
- shared abort signal and absence of merchant city/shop overrides;
- exact trend tuple/order/labels/units and semantic `net` validation;
- period/window/granularity/city/evaluatedAt mismatch;
- malformed/extra/missing objects, point misalignment, duplicate keys, fractional/non-finite/unsafe values;
- exact pagination echo/cardinality and every item enum/timestamp/ID/mask rule;
- explicit attempts to return a full card number or hidden extra field fail closed.

### Page behavior

In `MembershipAnalyticsPage.test.tsx`, use the real page, real URL parsing/serialization, real `AnalyticsMetricDetail`, and mocked HTTP adapter boundary only. Cover:

- operations and merchant endpoint selection;
- city/time/NeeDo ID/nickname apply/reset and `page=1` reset;
- canonical URL restoration on reload and zero requests for invalid URLs;
- three visible legends, independent click-to-hide/show behavior, all-hidden state, and no editor/persist action;
- server list order, safe fields, masked-card secrecy, enum localization, responsive semantic structure, empty page, and pagination;
- first load, retained coherent same-owner refresh, error/retry, 40966, abort, late resolve/reject, and atomic commit;
- merchant Shop A to Shop B transition clears Shop A immediately and never sends city/shop identifiers;
- complete five-language visible and accessible text.

### Routing, navigation, and regressions

- `DashboardPage.test.ts`: `new_paid_members` opens the canonical operations member route with the last committed query during success, pending refresh, and failed refresh; other metrics stay generic.
- `MerchantAdminDashboardPage.test.ts`: the ready membership card opens the canonical merchant route with the committed time query and never city/shop scope.
- `AdminLayout.test.ts` and `MerchantAdminLayout.test.ts`: exactly one permission-filtered member analytics item and correct active-route matching without restoring removed dashboards.
- `App.test.tsx`: exact imports/routes/permissions plus authenticated and forbidden behavior for both scopes.
- Existing dashboard, filter bar, layout, adapter, App, and five-language tests remain green.

Static source-marker assertions cannot replace interaction tests for requests, URL state, supersession, legends, pagination, permission outcomes, or secrecy.

## Gates

```bash
npm test -- \
  src/pages/admin/MembershipAnalyticsPage.test.tsx \
  src/api/backofficeDashboard.test.ts \
  src/pages/admin/DashboardPage.test.ts \
  src/pages/merchant-admin/MerchantAdminDashboardPage.test.ts \
  src/components/admin/AdminLayout.test.ts \
  src/components/merchant-admin/MerchantAdminLayout.test.ts \
  src/features/dashboard/AnalyticsMetricDetail.test.tsx \
  src/features/dashboard/DashboardFilterBar.test.tsx \
  src/App.test.tsx
npm test
npm run lint
npm run build
git diff --check
```

After the focused gates, run the existing full frontend test suite. Browser acceptance must use the real frontend/backend runtime and authorized identities: verify both canonical routes, filters, legend toggles, pagination, retry, merchant shop switch, five languages, narrow viewport overflow, and a clean console. If the formal backend or suitable data is unavailable, report that boundary honestly; do not add fallback rows or claim real-data acceptance.

Commit only the brief in the planning task with `docs: freeze member analytics detail contract`. The implementation task commits only the authorized production/test files with `feat: add member analytics detail page`. Do not start ranking frontend Task6.
