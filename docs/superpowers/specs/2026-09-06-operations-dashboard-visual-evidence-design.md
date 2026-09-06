# Operations Dashboard Visual Evidence Design

## Goal

Make the operations dashboard useful with the existing formal MySQL-backed data:

- align the divider below the controls in all three Top 10 ranking panels;
- include eligible test-account completions in the combined rankings and label their contribution clearly;
- render every `TEST` badge in the dashboard with the same red visual treatment;
- add a compact, exact three-day trend to the five headline metric cards;
- add numeric axes and click/keyboard-activated point details to the large line charts.

This remains one Step 12 microstep. It does not introduce mock data, a new dashboard, a schema migration, or an unrelated refactor.

## Current Evidence and Root Cause

The local formal runtime is served by the standard repository checkout on ports 5180 and 3000, and `/api/v1/health` plus `/api/v1/ready` both report healthy dependencies.

A read-only MySQL query found five `completed` and payment-confirmed bookings in the current seven-day window. All five involve test accounts; there are no non-test completions in that window. The ranking repository currently makes an entity eligible only when both the customer and technician users have `is_test_account = false`. The page therefore returns an empty ranking even though qualifying local test bookings exist.

The ranking panel divider mismatch is independent of the data issue. Technician and customer panels have a 36-pixel service-category selector in the first header row, while the service panel has only its title. The first row therefore has different height and pushes the lower divider to different positions.

The large chart already has date labels and accessible hidden tables, but no visible numeric Y-axis labels. Its SVG nodes are decorative and do not expose point values on click or keyboard activation.

## Chosen Approach

Extend the existing formal dashboard and ranking contracts, then reuse the shared React dashboard components.

Rejected alternatives:

- Deriving a three-day line from the current and previous totals would invent intermediate values.
- Adding a second visualization API would duplicate filter, scope, RBAC, audit, and aggregation behavior.
- Falling back to test rankings only when formal rankings are empty would make the same filter produce a hidden change in semantics.

The ranking result is explicitly combined. Its totals and ordering include formal and test completed-order evidence, while separate test contribution fields keep that composition visible.

## Backend Data Contract

### Ranking rows

Keep the existing endpoint and query shape:

`GET /api/v1/backoffice/analytics-rankings/:kind`

Each ranking row uses this complete contract:

```ts
type AnalyticsRankingItem = {
  rank: number;
  entityType: "service" | "technician_service" | "technician" | "customer";
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
  dataComposition: "formal" | "test" | "mixed";
};
```

Rules:

- `gmvJpy` and `completedCount` are the combined eligible totals used for ordering.
- `testGmvJpy` and `testCompletedCount` are the exact subset attributable to an order where the customer or technician user is a test account.
- `formal` means both test contribution fields are zero.
- `test` means every included order is a test contribution.
- `mixed` means the entity has both formal and test contributions.
- Service rows can be mixed. Technician and customer rows are classified from the orders that actually contribute, not merely from the currently stored account flag.
- Evidence validation applies equally to formal and test candidate orders. Including test data must not bypass checkout, payment, service-session, refund, soft-delete, category, or snapshot checks.
- RBAC, pagination, Tokyo date boundaries, city/category filters, audit action, and current error behavior remain unchanged.

No client-provided flag can relabel an order as formal or test.

### Headline three-day series

The existing dashboard response adds a dedicated `headlineSeries3d` object:

```ts
type HeadlineSeries3d = {
  from: string;
  to: string;
  timeZone: "Asia/Tokyo";
  buckets: Array<{
    key: string;
    label: string;
    availableScheduleSlots: number;
    activeTechnicians: number;
    registeredTechnicians: number;
    shopCount: number;
    newCustomers: number;
  }>;
};
```

The array always contains exactly three consecutive Tokyo calendar days ending on the selected filter end date. This rule also applies when the selected week, month, or custom range extends into the future: future schedule availability is real data, while event metrics with no rows are zero. Empty days are explicit zero-valued buckets, not omitted.

Every point uses the existing metric definition at daily granularity:

- available schedule: count of non-deleted available slots overlapping that day;
- active technicians: distinct non-deleted technician profiles with an overlapping slot or a non-cancelled booking that day;
- registered technicians: non-deleted technician profiles existing by that day-end cutoff;
- shops: non-deleted shops existing by that day-end cutoff;
- new customers: non-deleted customer profiles created during that day.

The current platform/shop scope and city filter are applied exactly as they are to the corresponding headline metric. The response is generated in the same dashboard request so the summary and mini-series share one `evaluatedAt` boundary.

## Frontend Design

### Ranking panels

The ranking header uses two explicit rows. The title/filter row has a shared minimum height equal to the selector height, including the service panel where no selector is rendered. The metric-switch row retains its natural height. As a result, all three `border-bottom` dividers align at every desktop width.

Every row with `dataComposition` equal to `test` or `mixed` displays a compact red `TEST` badge beside the display name. For `mixed`, the accessible label says that the total includes test orders. The displayed GMV and completed count remain the combined values returned by the server.

### TEST badges

Dashboard TEST badges use one shared style:

- coral/red border;
- translucent coral/red background;
- coral/red text;
- unchanged shape, typography, focus behavior, and disabled semantics.

This applies to disabled metric-detail accessories and the new ranking composition badge. It does not recolor ordinary error messages or Test NDP currency labels.

### Headline metric sparklines

`DashboardMetricCard` accepts an optional three-point series. The five headline cards pass the matching `headlineSeries3d` field; other uses of the shared card remain unchanged.

The sparkline occupies the existing right-side accessory space shown in the reference screenshot. It contains a subtle baseline, a three-point line, and three small nodes in the card accent color. It has no invented smoothing and no tooltip. An accessible text summary lists the three date/value pairs. At narrow card widths it remains fixed-size and cannot overlap the title or main value.

If the server omits or invalidates the three-day series, the card renders without a chart and keeps the rest of the data visible. It does not fabricate zeros on the client.

### Large line-chart axes

Each large line chart displays:

- existing date labels along the X axis;
- up to five non-duplicated numeric labels on the left Y axis for the left series;
- up to five non-duplicated numeric labels on the right Y axis for the right series;
- unit abbreviations in the existing series headers.

Ticks are derived from the exact plotted scale and formatted with the dashboard number formatter. A zero-only scale displays a single zero label rather than repeated zero labels. Grid lines and labels use the existing theme tokens and remain readable in light and dark operations themes.

### Point details

Clicking either series node selects that bucket and displays one anchored detail panel inside the chart. The panel contains:

- the bucket date/label;
- every plotted series name;
- each exact formatted value and unit;
- a visible close control.

Selecting another node updates the panel. `Escape` and the close control dismiss it. Each node has a larger transparent hit target, `role="button"`, keyboard focus, and Enter/Space activation. The existing screen-reader data table remains the non-visual full-data representation.

## Error and State Handling

- A failed ranking request keeps the existing localized retry state.
- An empty combined ranking still shows the existing localized empty state.
- Invalid or incomplete completion evidence still returns the existing 409 response; it is never silently omitted merely because the account is a test account.
- A dashboard refresh continues to keep the previous successful payload visible while loading or after a recoverable failure.
- Point selection is local UI state and resets when buckets or filters change.

## Test Strategy

Implementation follows red-green-refactor.

Backend tests first prove:

- test-only completed evidence appears and is classified `test`;
- mixed service totals are combined and classified `mixed`;
- formal-only totals remain `formal`;
- malformed test completion evidence triggers the same 409 safety behavior;
- pagination, sorting, city/category filtering, RBAC, audit, OpenAPI, and response parsing include the new fields;
- the three-day series contains exact consecutive Tokyo dates and values for all five metrics;
- zero days are returned explicitly;
- city and scope boundaries match the headline summary rules.

Frontend tests first prove:

- all ranking header dividers share the same structural height contract;
- test and mixed ranking rows render the red TEST badge;
- disabled dashboard TEST accessories use the red shared style;
- each of the five headline cards receives exactly three server-provided points;
- no sparkline is created from summary totals alone;
- large charts render left/right numeric ticks;
- click, Enter, Space, close, Escape, filter change, and exact formatted tooltip content work;
- existing empty, reduced-motion, hidden-table, retry, and stale-data behavior remains intact.

## Browser Acceptance

Run the standard formal backend and frontend from the implementation worktree only after proving listener PID, cwd, branch, frontend proxy target, and `/api/v1/health` plus `/api/v1/ready`.

With an authenticated operations account:

1. Open the default last-seven-days dashboard.
2. Confirm the current local test completions populate all applicable ranking panels.
3. Confirm affected rows have red TEST badges and no row is presented as formal-only.
4. Confirm the three panel dividers align at desktop width and after service-category changes.
5. Confirm all five headline cards show exact three-day sparklines without overlap.
6. Confirm both Y axes show numeric values in all three large charts.
7. Click and keyboard-activate nodes on both series; compare the detail panel values with the API response.
8. Exercise period and city filters, then confirm the ranking, summary, sparklines, chart axes, and selected point all update coherently.
9. Check browser console errors, failed API requests, horizontal overflow, and light/dark theme readability.

## Non-goals

- No database seed changes.
- No new table or migration.
- No change to booking, payment, or refund state machines.
- No fake fallback ranking or chart data.
- No separation into a second TEST-only dashboard.
- No changes to merchant, technician, or customer portals.
- No deployment, migration, or remote staging mutation in this microstep.

## Delivery Boundary

The implementation will be committed on the isolated `codex/dashboard-visual-evidence` branch created from the latest local `main`. The original checkout and its unrelated dirty files remain untouched. Local tests, build, database reads, and authenticated browser acceptance will be reported separately from merge, push, deployment, and staging acceptance.
