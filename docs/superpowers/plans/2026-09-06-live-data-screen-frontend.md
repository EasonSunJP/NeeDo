# Operations Live Data Screen — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the independently opened, full-viewport NeeDo operations live screen with a detailed Japan drill-down map, synchronized regional panels, fullscreen mode, SSE updates, and low-cost automatic scrolling.

**Architecture:** Consume only the accepted microstep-A snapshot and SSE contracts. Keep authoritative state in one `LiveDashboardScope` URL/query model, render local preprojected SVG map assets, merge compact events into the last consistent snapshot, and pause timers/animation when hidden; the page reuses admin theme tokens without rendering `AdminLayout`.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7 HashRouter, Vite 7, Tailwind/current CSS tokens, Vitest/jsdom, browser Fullscreen API, Fetch streaming SSE, build-time `d3-geo`/TopoJSON tooling only.

## Global Constraints

- Start only after every completion gate in `2026-09-06-live-data-screen-data-foundation.md` has passed.
- Before visual implementation, load the `frontend-design` skill; preserve the approved “professional fullscreen operations admin” direction.
- Existing dashboard entry opens exactly `/pf-admin.html#/admin/live-screen` in a new tab with `noopener,noreferrer`; the current dashboard must not navigate or lose filter state.
- Route requires platform portal authentication and `page:dashboard`; backend requests still require `backoffice:dashboard:read`.
- Page renders without `AdminLayout`, sidebar, or admin top navigation and fills `100dvh`.
- Default scope is `country=JP`, no `admin1`, no `admin2`, and period `today`.
- Map drill-down is Japan → prefecture → municipality/special ward; choosing a region changes every panel with one scope object.
- Runtime must not call MLIT, Google Maps, or another map SDK/API; it loads versioned local SVG-path JSON assets only.
- Map is the only visual emphasis. Reuse existing admin backgrounds, surfaces, text, borders, radius, status colors, and day/night theme preference; do not add cyber, star, beam, scanline, mechanical-frame, particle, or blinking-neon effects.
- Client clock is local each second; scrolling is local; SSE updates realtime orders; rankings/trends refetch no more than every 60 seconds; full reconciliation is every 5 minutes.
- Hidden pages pause reconciliation and animation, then perform exactly one snapshot read on visibility recovery.
- Reduced-motion users receive content replacement and static highlights, without translation, number bounce, or map pulse.
- Never render or log customer PII; never put credentials in URL, `window.name`, opener messages, or map data.
- Do not fabricate list rows or duplicate short lists to make them scroll.
- Every task is committed separately and must preserve unrelated dirty-worktree changes.

---

## File Structure

### Map build assets

- `scripts/build-jp-admin-map.mjs` — deterministic N03 feature merge, topology simplification, projection, SVG-path generation, manifest, checksums, and byte-budget enforcement.
- `scripts/check-jp-admin-map.mjs` — structural, geographic, Tokyo-ward, checksum, and gzip-budget verification.
- `public/maps/jp/2026/manifest.json` — source/version/checksums/view boxes/asset paths.
- `public/maps/jp/2026/country.json` — 47 interactive prefecture paths.
- `public/maps/jp/2026/prefectures/01.json` through `47.json` — lazy-loaded municipality/special-ward paths.
- `docs/map-data-attribution.md` — MLIT N03 attribution, source date, generation parameters, and redistribution note.

### API and state

- `src/api/liveDashboard.ts` — exact runtime response validation, query serialization, snapshot request, and typed event parsing.
- `src/api/sseFetchStream.ts` — authenticated Fetch SSE parser with refresh-on-401, abort, last-event ID, and bounded buffering.
- `src/features/live-dashboard/liveDashboardState.ts` — URL scope parsing, reducer, snapshot consistency checks, event dedupe, and freshness state.
- `src/features/live-dashboard/useLiveDashboard.ts` — request lifecycle, 5-minute reconciliation, 60-second invalidation coalescing, visibility pause/recovery, and retry policy.

### UI

- `src/pages/admin/LiveDashboardPage.tsx` — full page composition only.
- `src/features/live-dashboard/LiveDashboardShell.tsx` — theme-scoped viewport, header, clock, scope controls, fullscreen, loading/error banners.
- `src/features/live-dashboard/JapanRegionMap.tsx` — accessible local SVG map, hover/focus tooltip, drill-down, and static event highlight.
- `src/features/live-dashboard/LiveDashboardPanels.tsx` — metric, order, activity, trend, and ranking panel components.
- `src/features/live-dashboard/AutoScrollList.tsx` — local cadence, pause conditions, no duplication, reduced-motion behavior.
- `src/features/live-dashboard/LiveTrendChart.tsx` — existing admin-style responsive SVG trend chart.
- `src/features/live-dashboard/liveDashboardTheme.ts` — reads existing `needo.admin.theme` preference and exports allowed admin-shell class.
- `src/styles.css` — narrowly scoped `.live-dashboard-*` layout and responsive rules.
- `src/i18n/translations.ts` — all new visible copy in five languages.

### Existing integration files

- `src/pages/admin/DashboardPage.tsx` — add the new-tab link without changing existing actions.
- `src/App.tsx` — protected `/admin/live-screen` route.
- `src/api/httpClient.ts` — expose a safe authenticated streaming request primitive used only by `sseFetchStream.ts`.
- `package.json` and lockfile — build-time map packages and verification script.

### Tests

- `scripts/build-jp-admin-map.test.ts`
- `src/api/sseFetchStream.test.ts`
- `src/api/liveDashboard.test.ts`
- `src/features/live-dashboard/liveDashboardState.test.ts`
- `src/features/live-dashboard/useLiveDashboard.test.tsx`
- `src/features/live-dashboard/AutoScrollList.test.tsx`
- `src/features/live-dashboard/JapanRegionMap.test.tsx`
- `src/features/live-dashboard/LiveDashboardShell.test.tsx`
- `src/features/live-dashboard/LiveDashboardPanels.test.tsx`
- `src/pages/admin/LiveDashboardPage.test.tsx`
- `src/pages/admin/DashboardPage.test.ts`
- `src/App.test.tsx`

---

### Task 1: Deterministic detailed Japan SVG map assets

**Files:**
- Create: `scripts/build-jp-admin-map.mjs`
- Create: `scripts/check-jp-admin-map.mjs`
- Create: `scripts/build-jp-admin-map.test.ts`
- Create: `public/maps/jp/2026/manifest.json`
- Create: `public/maps/jp/2026/country.json`
- Create: `public/maps/jp/2026/prefectures/01.json` … `public/maps/jp/2026/prefectures/47.json`
- Create: `docs/map-data-attribution.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `.data/n03/N03-20260101.geojson`, source version `N03-20260101`, and official codes from microstep A.
- Produces: `MapAssetManifest`, `ProjectedMapAsset`, and the complete static `/maps/jp/2026/` asset set.

- [ ] **Step 1: Write failing asset-structure and budget tests**

```ts
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const read = (file: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8"));

it("publishes 47 prefectures and Tokyo's 23 special wards", () => {
  const country = read("public/maps/jp/2026/country.json");
  const tokyo = read("public/maps/jp/2026/prefectures/13.json");
  expect(country.regions).toHaveLength(47);
  expect(tokyo.regions.filter((region: { code: string }) => /^131(?:0[1-9]|1[0-9]|2[0-3])$/.test(region.code))).toHaveLength(23);
  expect(country.regions.every((region: { path: string }) => region.path.startsWith("M"))).toBe(true);
});

it("keeps generated assets inside approved gzip budgets", () => {
  const country = fs.readFileSync("public/maps/jp/2026/country.json");
  expect(gzipSync(country).byteLength).toBeLessThanOrEqual(600 * 1024);
  for (let code = 1; code <= 47; code += 1) {
    const file = fs.readFileSync(`public/maps/jp/2026/prefectures/${String(code).padStart(2, "0")}.json`);
    expect(gzipSync(file).byteLength).toBeLessThanOrEqual(500 * 1024);
  }
});
```

- [ ] **Step 2: Run the test and confirm assets are missing**

Run: `npm test -- scripts/build-jp-admin-map.test.ts`

Expected: FAIL because map files do not exist.

- [ ] **Step 3: Add build-only geometry dependencies and asset types**

Download the 2026 nationwide GeoJSON archive named `N03-20260101_GML.zip` from `https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html`, record its SHA-256 in the attribution document, and extract the GeoJSON member to `.data/n03/N03-20260101.geojson`. Keep the 765.94 MB source archive and extracted source outside Git; only deterministic derived assets and their checksums are committed.

Run: `npm install --save-dev d3-geo topojson-server topojson-simplify`

The generated JSON contract is:

```ts
export interface ProjectedMapAsset {
  countryCode: "JP";
  sourceVersion: "N03-20260101";
  level: "admin1" | "admin2";
  parentCode: "JP" | string;
  viewBox: [number, number, number, number];
  regions: Array<{
    code: string;
    parentCode: string;
    nameJa: string;
    path: string;
    labelPoint: [number, number] | null;
  }>;
}
```

These packages are never imported by `src/`; the browser receives preprojected SVG path strings.

- [ ] **Step 4: Implement deterministic generation and verification**

The builder must:

1. Validate SHA-256 and `N03_007` codes before output.
2. Merge duplicate polygons by official code while preserving MultiPolygon islands.
3. Build shared topology, presimplify, and simplify with fixed recorded parameters.
4. Use one fixed Japan projection for `country.json`; fit each prefecture independently into a `0 0 1000 800` view box.
5. Generate prefecture features by the first two code digits and municipality/special-ward features by five-digit code.
6. Round projected path coordinates to two decimals, sort regions by code, and write JSON with stable key order.
7. Emit source/output hashes, generator version, projection parameters, simplification value, generated timestamp, and all asset URLs to `manifest.json`.
8. Fail on missing codes, duplicate codes, invalid paths, missing Tokyo wards, or gzip budget overflow.

Add scripts:

```json
{
  "maps:jp:build": "node scripts/build-jp-admin-map.mjs",
  "maps:jp:check": "node scripts/check-jp-admin-map.mjs"
}
```

- [ ] **Step 5: Generate, inspect, and test assets**

Run:

```bash
npm run maps:jp:build
npm run maps:jp:check
npm test -- scripts/build-jp-admin-map.test.ts
```

Expected: checker reports 47 prefectures, Tokyo 23 special wards, valid hashes, and all files within gzip budgets; test passes. Open `country.json` and Tokyo asset through a temporary SVG fixture to visually confirm coastlines, Tokyo Bay, and islands are not reduced to rectangles.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json scripts/build-jp-admin-map.mjs scripts/check-jp-admin-map.mjs scripts/build-jp-admin-map.test.ts public/maps/jp/2026 docs/map-data-attribution.md
git commit -m "feat: add detailed local Japan map assets"
```

### Task 2: Strict snapshot API and authenticated Fetch SSE client

**Files:**
- Create: `src/api/liveDashboard.ts`
- Create: `src/api/sseFetchStream.ts`
- Modify: `src/api/httpClient.ts`
- Test: `src/api/liveDashboard.test.ts`
- Test: `src/api/sseFetchStream.test.ts`
- Test: `src/api/httpClient.test.ts`

**Interfaces:**
- Consumes: microstep-A endpoints `/backoffice/dashboard/live-snapshot` and `/backoffice/dashboard/live-events`.
- Produces: `LiveDashboardSnapshot`, `LiveDashboardScope`, `LiveDashboardEvent`, `liveDashboardApi.snapshot()`, and `openAuthenticatedSseStream()`.

- [ ] **Step 1: Write failing exact-shape and streaming tests**

```ts
expect(serializeLiveDashboardQuery({ country: "JP", admin1: "13", admin2: "13104", period: "today" }))
  .toEqual({ country: "JP", admin1: "13", admin2: "13104", period: "today" });
expect(() => requireLiveDashboardSnapshot({ ...payload, scope: { ...payload.scope, admin2Code: "27128" } }, requestedScope))
  .toThrow("error.dashboard.scope_mismatch");

await openAuthenticatedSseStream({
  path: "/backoffice/dashboard/live-events",
  query: { country: "JP", period: "today" },
  signal,
  lastEventId: "1700000000000-2",
  onEvent
});
expect(fetch).toHaveBeenCalledWith(expect.stringContaining("country=JP"), expect.objectContaining({
  headers: expect.objectContaining({ Authorization: "Bearer access-token", "Last-Event-ID": "1700000000000-2" })
}));
```

Also test chunk boundaries across UTF-8/event lines, multiline `data:`, comments, a 64 KiB event cap, abort, 401 refresh once, second 401 terminal handling, and rejection of unknown event types/extra snapshot keys.

- [ ] **Step 2: Run tests and verify missing client failures**

Run: `npm test -- src/api/liveDashboard.test.ts src/api/sseFetchStream.test.ts src/api/httpClient.test.ts`

Expected: FAIL.

- [ ] **Step 3: Define exact client contracts and parsers**

```ts
export type LiveDashboardPeriod = "today" | "last7days" | "last30days";
export interface LiveDashboardScope {
  country: "JP";
  admin1?: string;
  admin2?: string;
  period: LiveDashboardPeriod;
}
export type LiveDashboardEvent =
  | { id: string; type: "order.changed"; scope: { countryCode: "JP"; admin1Code: string | null; admin2Code: string | null }; payload: { orderNo: string; status: string; serviceName: string; amountJpy: number }; createdAt: string }
  | { id: string; type: "metrics.invalidate"; scope: { countryCode: "JP"; admin1Code: string | null; admin2Code: string | null }; payload: { sections: Array<"headline" | "orders" | "trend" | "rankings"> }; createdAt: string };
```

`requireLiveDashboardSnapshot` must exact-check all keys, safe non-negative integers, ISO datetimes, page=1/page_size=20, TOP10 maximums, child region codes, breadcrumb hierarchy, money separation, and exact requested scope/period.

- [ ] **Step 4: Add an authenticated stream primitive without exposing tokens to callers**

Extend `httpClient` with:

```ts
openStream(path: string, options: HttpClientRequestOptions = {}): Promise<Response>
```

It must reuse `alignAccessTokenWithExpectedUser`, `createRequestHeaders`, one coordinated refresh-on-401, merchant-preview read protections, and global auth-expiry behavior from ordinary requests. It does not use the 10-second body timeout after headers arrive; caller abort owns stream lifetime. `sseFetchStream.ts` receives a `Response`, parses bytes incrementally, stores at most 64 KiB per incomplete event, and never logs event data.

- [ ] **Step 5: Run tests and commit Task 2**

Run: `npm test -- src/api/liveDashboard.test.ts src/api/sseFetchStream.test.ts src/api/httpClient.test.ts`

Expected: PASS.

```bash
git add src/api/liveDashboard.ts src/api/liveDashboard.test.ts src/api/sseFetchStream.ts src/api/sseFetchStream.test.ts src/api/httpClient.ts src/api/httpClient.test.ts
git commit -m "feat: add live dashboard snapshot and SSE clients"
```

### Task 3: URL scope reducer and low-load lifecycle hook

**Files:**
- Create: `src/features/live-dashboard/liveDashboardState.ts`
- Create: `src/features/live-dashboard/useLiveDashboard.ts`
- Test: `src/features/live-dashboard/liveDashboardState.test.ts`
- Test: `src/features/live-dashboard/useLiveDashboard.test.tsx`

**Interfaces:**
- Consumes: API types and functions from Task 2.
- Produces: `parseLiveDashboardSearch()`, `liveDashboardReducer()`, `snapshotMatchesScope()`, and `useLiveDashboard(scope)`.

- [ ] **Step 1: Write failing scope, stale-response, timing, and recovery tests**

```ts
expect(parseLiveDashboardSearch("")).toEqual({ country: "JP", period: "today" });
expect(parseLiveDashboardSearch("?country=JP&admin1=13&admin2=13104&period=last7days"))
  .toEqual({ country: "JP", admin1: "13", admin2: "13104", period: "last7days" });
expect(parseLiveDashboardSearch("?country=JP&admin2=13104")).toEqual({ country: "JP", period: "today" });

const state = liveDashboardReducer(successState(tokyoSnapshot), {
  type: "snapshotSucceeded", requestId: 2, scope: shinjukuScope, snapshot: tokyoSnapshot
});
expect(state.snapshot).toBe(tokyoSnapshot);
expect(state.error).toBe("error.dashboard.scope_mismatch");
```

Fake-timer hook tests must prove: immediate initial fetch, no request from local clock, one full fetch after 5 minutes, invalidations coalesced to at most one fetch per 60 seconds, hidden-page timers stopped, one recovery fetch, exponential reconnect `1s, 2s, 4s … 30s` plus bounded jitter, and event-ID dedupe.

- [ ] **Step 2: Run tests and confirm missing-state failure**

Run: `npm test -- src/features/live-dashboard/liveDashboardState.test.ts src/features/live-dashboard/useLiveDashboard.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement one authoritative scope reducer**

State contract:

```ts
export interface LiveDashboardState {
  requestedScope: LiveDashboardScope;
  committedScope: LiveDashboardScope;
  snapshot: LiveDashboardSnapshot | null;
  pendingTargetLabel: string | null;
  status: "loading" | "ready" | "stale" | "error";
  realtimeStatus: "connecting" | "connected" | "recovering";
  error: string | null;
  lastEventId: string | null;
  seenEventIds: readonly string[];
}
```

On region change, keep the previous successful snapshot visible and mark the target loading. Commit only a matching response. Keep at most 100 event IDs. Insert `order.changed` at the top by stable `orderNo`, replace an existing row with the newer event, cap rows at 20, and apply only events whose location is inside the current scope.

- [ ] **Step 4: Implement visibility-aware reconciliation and SSE retry**

Use a 5-minute full-snapshot interval only while `document.visibilityState === "visible"`. Coalesce `metrics.invalidate` sections and refetch at the next permitted 60-second boundary. Abort snapshot and stream on scope change/unmount. Reconnect with:

```ts
const retryDelayMs = (attempt: number, jitter: number) =>
  Math.min(1_000 * 2 ** attempt, 30_000) + Math.floor(jitter * 750);
```

When visible again, clear pending timers, issue exactly one full snapshot, and reconnect SSE with `Last-Event-ID`. A failed refresh keeps prior data, marks it stale, and exposes retry.

- [ ] **Step 5: Run tests and commit Task 3**

Run: `npm test -- src/features/live-dashboard/liveDashboardState.test.ts src/features/live-dashboard/useLiveDashboard.test.tsx`

Expected: PASS.

```bash
git add src/features/live-dashboard/liveDashboardState.ts src/features/live-dashboard/liveDashboardState.test.ts src/features/live-dashboard/useLiveDashboard.ts src/features/live-dashboard/useLiveDashboard.test.tsx
git commit -m "feat: coordinate live dashboard refresh lifecycle"
```

### Task 4: New-tab entry, protected route, theme shell, and fullscreen

**Files:**
- Modify: `src/pages/admin/DashboardPage.tsx`
- Modify: `src/pages/admin/DashboardPage.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Create: `src/features/live-dashboard/liveDashboardTheme.ts`
- Create: `src/features/live-dashboard/LiveDashboardShell.tsx`
- Create: `src/features/live-dashboard/LiveDashboardShell.test.tsx`
- Create: `src/pages/admin/LiveDashboardPage.tsx`
- Create: `src/pages/admin/LiveDashboardPage.test.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: auth portal restoration and admin theme keys already used by `AdminLayout`.
- Produces: protected `/admin/live-screen`, `openLiveDashboardWindow()`, and `LiveDashboardShell`.

- [ ] **Step 1: Write failing entry/route/fullscreen tests**

```ts
expect(openSpy).toHaveBeenCalledWith(
  "/pf-admin.html#/admin/live-screen?country=JP&period=today",
  "_blank",
  "noopener,noreferrer"
);
expect(window.location.hash).toBe("#/admin?period=last7days&city=Tokyo");
expect(appSource).toContain('path="/admin/live-screen"');
expect(appSource).toContain('protectPermission("admin", "page:dashboard"');
```

Shell tests mock `document.documentElement.requestFullscreen` and `document.exitFullscreen`, verify enter/exit labels, `fullscreenchange` synchronization, rejection message, and no `AdminLayout` descendant.

- [ ] **Step 2: Run tests and verify missing entry/route failure**

Run: `npm test -- src/pages/admin/DashboardPage.test.ts src/App.test.tsx src/features/live-dashboard/LiveDashboardShell.test.tsx src/pages/admin/LiveDashboardPage.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Add safe new-tab entry and protected route**

```ts
export function openLiveDashboardWindow(openWindow = window.open) {
  const child = openWindow(
    "/pf-admin.html#/admin/live-screen?country=JP&period=today",
    "_blank",
    "noopener,noreferrer"
  );
  if (child) child.opener = null;
}
```

Place “数据大屏” with the existing title actions, leaving “处理订单” and “财务对账” unchanged. Add the route before `/admin/analytics`:

```tsx
<Route
  path="/admin/live-screen"
  element={protectPermission("admin", "page:dashboard", <LiveDashboardPage />)}
/>
```

The new tab restores auth through the existing `AuthProvider`; no cross-window credential transfer is added.

- [ ] **Step 4: Implement theme shell and fullscreen fallback**

`getInitialLiveDashboardTheme()` reads `needo.admin.theme` and `needo.admin.theme.mode`, calls existing `normalizeAdminTheme`/system detection, and returns `admin-theme-${theme}`. Shell root:

```tsx
<main className={cn("admin-shell live-dashboard-shell min-h-[100dvh] bg-paper text-ink", themeClass)}>
  <header className="live-dashboard-header">{header}</header>
  <section className="live-dashboard-grid">{children}</section>
</main>
```

Fullscreen calls the root element request method from a user click, listens for `fullscreenchange`, exits via `document.exitFullscreen()`, supports `Esc` automatically, and shows a non-blocking translated alert on rejection.

- [ ] **Step 5: Run tests/i18n and commit Task 4**

Run: `npm test -- src/pages/admin/DashboardPage.test.ts src/App.test.tsx src/features/live-dashboard/LiveDashboardShell.test.tsx src/pages/admin/LiveDashboardPage.test.tsx && npm run i18n:audit`

Expected: PASS and i18n audit exits 0.

```bash
git add src/pages/admin/DashboardPage.tsx src/pages/admin/DashboardPage.test.ts src/App.tsx src/App.test.tsx src/features/live-dashboard/liveDashboardTheme.ts src/features/live-dashboard/LiveDashboardShell.tsx src/features/live-dashboard/LiveDashboardShell.test.tsx src/pages/admin/LiveDashboardPage.tsx src/pages/admin/LiveDashboardPage.test.tsx src/i18n/translations.ts
git commit -m "feat: open protected operations live screen"
```

### Task 5: Accessible Japan map drill-down and fallback selector

**Files:**
- Create: `src/features/live-dashboard/JapanRegionMap.tsx`
- Create: `src/features/live-dashboard/JapanRegionMap.test.tsx`
- Modify: `src/pages/admin/LiveDashboardPage.tsx`
- Modify: `src/pages/admin/LiveDashboardPage.test.tsx`

**Interfaces:**
- Consumes: map assets from Task 1 and scope/state hook from Task 3.
- Produces: `JapanRegionMap`, `loadMapAsset(scope, signal)`, and `onSelectRegion(nextScope)`.

- [ ] **Step 1: Write failing map and interaction tests**

```tsx
render(<JapanRegionMap scope={{ country: "JP", period: "today" }} children={prefectures} onSelectRegion={onSelect} />);
expect(screen.getAllByRole("button", { name: /都道府県/ })).toHaveLength(47);
await user.click(screen.getByRole("button", { name: /東京都/ }));
expect(onSelect).toHaveBeenCalledWith({ country: "JP", admin1: "13", period: "today" });
```

Tokyo tests load `/maps/jp/2026/prefectures/13.json`, expose 23 special-ward buttons including Shinjuku, update tooltip on hover/focus, select by Enter/Space, return through “日本 / 东京都 / 新宿区” breadcrumbs, keep selected outline after resize, and show the administrative select fallback when asset loading fails.

- [ ] **Step 2: Run tests and confirm component failure**

Run: `npm test -- src/features/live-dashboard/JapanRegionMap.test.tsx src/pages/admin/LiveDashboardPage.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement local lazy asset loading and SVG rendering**

Asset selection:

```ts
export function mapAssetUrl(scope: LiveDashboardScope) {
  return scope.admin1
    ? `/maps/jp/2026/prefectures/${scope.admin1}.json`
    : "/maps/jp/2026/country.json";
}
```

Fetch the same-origin public asset with native `fetch(mapAssetUrl(scope), { signal })`, exact-check source version/level/parent, abort on scope change, and retain the previous valid asset during loading. Render a responsive SVG using the asset viewBox. Each region is a `<path role="button" tabIndex={0}>` with an accessible name containing localized region name, order count, and confirmed JPY. Fill uses five discrete NeeDo-blue intensity steps based on real counts; zero is neutral; hover/focus brightens; selection uses a 2px admin accent outline.

- [ ] **Step 4: Implement drill-down, breadcrumbs, and fallback**

Country path selection sets `admin1` and removes `admin2`; prefecture path selection sets `admin2`; admin2 is a terminal view with the chosen region outlined and its prefecture asset retained. Breadcrumb clicks remove lower levels. The HTML fallback uses the same `children` array and `onSelectRegion` callback, so map failure never changes data semantics.

- [ ] **Step 5: Run tests and commit Task 5**

Run: `npm test -- src/features/live-dashboard/JapanRegionMap.test.tsx src/pages/admin/LiveDashboardPage.test.tsx`

Expected: PASS.

```bash
git add src/features/live-dashboard/JapanRegionMap.tsx src/features/live-dashboard/JapanRegionMap.test.tsx src/pages/admin/LiveDashboardPage.tsx src/pages/admin/LiveDashboardPage.test.tsx
git commit -m "feat: drill into Japan live dashboard regions"
```

### Task 6: Local auto-scroll, metric panels, rankings, and trend

**Files:**
- Create: `src/features/live-dashboard/AutoScrollList.tsx`
- Create: `src/features/live-dashboard/AutoScrollList.test.tsx`
- Create: `src/features/live-dashboard/LiveDashboardPanels.tsx`
- Create: `src/features/live-dashboard/LiveDashboardPanels.test.tsx`
- Create: `src/features/live-dashboard/LiveTrendChart.tsx`
- Modify: `src/pages/admin/LiveDashboardPage.tsx`

**Interfaces:**
- Consumes: `LiveDashboardSnapshot` and realtime state from Tasks 2–3.
- Produces: all screen panels and local-only list movement.

- [ ] **Step 1: Write failing scroll and panel consistency tests**

```tsx
render(<AutoScrollList intervalMs={3000} items={[a, b, c]} visibleCount={2} getKey={(item) => item.orderNo} renderItem={renderOrder} />);
act(() => vi.advanceTimersByTime(3000));
expect(screen.getByTestId("auto-scroll-window")).toHaveAttribute("data-start-index", "1");

render(<AutoScrollList intervalMs={3000} items={[a]} visibleCount={2} getKey={(item) => item.orderNo} renderItem={renderOrder} />);
act(() => vi.advanceTimersByTime(6000));
expect(screen.getAllByText(a.orderNo)).toHaveLength(1);
```

Add pause tests for hover, focus-within, hidden page, and reduced motion. Panel tests assert every heading includes the committed scope label, JPY/NDP/Test NDP are separate, empty arrays show zero/empty states, and no field named customer/address/note is rendered.

- [ ] **Step 2: Run tests and confirm missing component failure**

Run: `npm test -- src/features/live-dashboard/AutoScrollList.test.tsx src/features/live-dashboard/LiveDashboardPanels.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement local-only list movement**

`AutoScrollList` advances one logical row every `intervalMs`, never calls an API, resets safely when keys change, and pauses on `mouseenter`, `focusin`, hidden document, or reduced motion. If `items.length <= visibleCount`, render once and do not create a timer. Use a short CSS translate/fade no longer than 300ms; reduced motion replaces content without transition.

- [ ] **Step 4: Implement formal panels and trend SVG**

Compose:

- Four period metrics: new orders, completed orders, new users, onboarded technicians.
- Confirmed service payments prominently above the map.
- Four order-overview metrics: order count, service GMV, platform net income, agent commission, with currency rows separated.
- Realtime order list at 3-second local cadence.
- Formal order/payment activity list.
- Service and technician TOP10 lists at 4-second local cadence.
- Seven-day order/payment trend using one responsive inline SVG and existing admin semantic colors.
- Coverage indicator showing attributed, unresolved, and completeness percentage.

Format Japan money with `Intl.NumberFormat(locale, { style: "currency", currency: "JPY", maximumFractionDigits: 0 })`; format NDP as numeric units and label Test NDP explicitly.

- [ ] **Step 5: Run tests and commit Task 6**

Run: `npm test -- src/features/live-dashboard/AutoScrollList.test.tsx src/features/live-dashboard/LiveDashboardPanels.test.tsx src/pages/admin/LiveDashboardPage.test.tsx`

Expected: PASS.

```bash
git add src/features/live-dashboard/AutoScrollList.tsx src/features/live-dashboard/AutoScrollList.test.tsx src/features/live-dashboard/LiveDashboardPanels.tsx src/features/live-dashboard/LiveDashboardPanels.test.tsx src/features/live-dashboard/LiveTrendChart.tsx src/pages/admin/LiveDashboardPage.tsx src/pages/admin/LiveDashboardPage.test.tsx
git commit -m "feat: render live dashboard operating panels"
```

### Task 7: Approved full-screen layout, responsive behavior, and recovery states

**Files:**
- Modify: `src/pages/admin/LiveDashboardPage.tsx`
- Modify: `src/features/live-dashboard/LiveDashboardShell.tsx`
- Modify: `src/features/live-dashboard/JapanRegionMap.tsx`
- Modify: `src/features/live-dashboard/LiveDashboardPanels.tsx`
- Modify: `src/styles.css`
- Modify: `src/i18n/translations.ts`
- Modify: `src/pages/admin/LiveDashboardPage.test.tsx`

**Interfaces:**
- Consumes: all UI/state components from Tasks 3–6.
- Produces: final three-column desktop composition and resilient user-visible states.

- [ ] **Step 1: Write failing layout/error/recovery tests**

```tsx
expect(screen.getByTestId("live-dashboard-grid")).toHaveClass("live-dashboard-grid");
expect(screen.getByRole("status")).toHaveTextContent("实时连接恢复中");
expect(screen.getByText("数据可能已过期")).toBeVisible();
expect(screen.getByRole("link", { name: "返回数据大盘" })).toHaveAttribute("href", "/pf-admin.html#/admin");
```

Test first-load failure, retained-data refresh failure, failed target-region switch retaining committed scope, no-data zero states, map failure fallback, fullscreen rejection, minimum-width warning, and reduced-motion classes.

- [ ] **Step 2: Run tests and verify missing final-state behavior**

Run: `npm test -- src/pages/admin/LiveDashboardPage.test.tsx src/features/live-dashboard/LiveDashboardShell.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the approved restrained visual system**

Add only `.live-dashboard-*` selectors. Desktop grid uses `minmax(260px, 0.9fr) minmax(560px, 1.8fr) minmax(280px, 1fr)` with 12–16px gaps. Surfaces use current `bg-paper`, `bg-white`, `border-line`, `text-ink`, `shadow-panel`, and admin-theme CSS variables. Cards use the same radius family as the existing dashboard; no independent background artwork. Map receives the largest uninterrupted area and higher contrast only through data fills/selected outline.

At viewport widths below 1280px, preserve the three-column canvas at a readable minimum and fit it with a calculated CSS scale; show a translated “建议横屏或宽屏查看” message. Ensure the scaled wrapper width compensates for scale so `document.documentElement.scrollWidth === document.documentElement.clientWidth`.

- [ ] **Step 4: Wire all recovery states and synchronized scope changes**

Header shows a local `Asia/Tokyo` clock updated once per second with no network call, title, period selector, country selector fixed to Japan, breadcrumbs, connection status, freshness time, and fullscreen action. Scope selection updates `URLSearchParams` first and the hook consumes that one scope. While a region loads, retain prior panels and show the target label. Reject any mismatched snapshot. First-load failure offers Retry and Return; later failure marks stale; SSE recovery is non-blocking; map failure keeps fallback selector.

- [ ] **Step 5: Run tests, i18n, lint, and build**

Run:

```bash
npm test -- src/pages/admin/LiveDashboardPage.test.tsx src/features/live-dashboard/LiveDashboardShell.test.tsx src/features/live-dashboard/JapanRegionMap.test.tsx src/features/live-dashboard/LiveDashboardPanels.test.tsx src/features/live-dashboard/AutoScrollList.test.tsx
npm run i18n:audit
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/pages/admin/LiveDashboardPage.tsx src/pages/admin/LiveDashboardPage.test.tsx src/features/live-dashboard/LiveDashboardShell.tsx src/features/live-dashboard/JapanRegionMap.tsx src/features/live-dashboard/LiveDashboardPanels.tsx src/styles.css src/i18n/translations.ts
git commit -m "feat: finish restrained operations live screen"
```

### Task 8: Browser and real-data acceptance

**Files:**
- Create: `docs/live-dashboard-acceptance.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed microsteps A and B running on the standard formal local runtime.
- Produces: evidence-backed acceptance record separating runtime, database, browser, push, deployment, and migration facts.

- [ ] **Step 1: Prove the standard runtime before browser acceptance**

Record frontend listener PID/cwd/branch, backend listener PID/cwd/branch, served commit, `/api/v1/health`, `/api/v1/ready`, frontend proxy target, MySQL database name, and Redis target. An alternate-port or stale-worktree page does not satisfy this step.

- [ ] **Step 2: Run the complete automated verification set**

Run:

```bash
npm run maps:jp:check
npm test -- src/api/liveDashboard.test.ts src/api/sseFetchStream.test.ts src/features/live-dashboard/liveDashboardState.test.ts src/features/live-dashboard/useLiveDashboard.test.tsx src/features/live-dashboard/AutoScrollList.test.tsx src/features/live-dashboard/JapanRegionMap.test.tsx src/features/live-dashboard/LiveDashboardShell.test.tsx src/features/live-dashboard/LiveDashboardPanels.test.tsx src/pages/admin/LiveDashboardPage.test.tsx src/pages/admin/DashboardPage.test.ts src/App.test.tsx
npm run i18n:audit
npm run lint
npm run build
cd backend
npm test -- --runInBand tests/live-dashboard-validator.test.ts tests/live-dashboard.repository.test.ts tests/live-dashboard.service.test.ts tests/live-dashboard-cache.test.ts tests/live-dashboard-events.test.ts tests/live-dashboard-api.test.ts tests/live-dashboard-openapi.test.ts
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Verify new-tab, route, themes, and layout in a real browser**

At 1920×1080 and 2560×1440 in both day and night admin themes:

1. Set a non-default filter on the data dashboard.
2. Click “数据大屏”.
3. Confirm a new tab opens, original tab URL/filter/scroll remains unchanged, new tab restores the platform session, and no token appears in URL/name/opener.
4. Confirm the page has no admin sidebar/top navigation, no horizontal overflow, and the visual style matches existing admin surfaces.
5. Enter fullscreen, exit by button, enter again, exit with `Esc`, and verify state labels.
6. Deny fullscreen once and verify the page remains usable with a clear message.

- [ ] **Step 4: Verify map quality, drill-down, and whole-screen scope consistency**

1. Confirm Japan view contains 47 selectable prefectures and recognizable Hokkaido/Honshu/Shikoku/Kyushu/Okinawa outlines.
2. Click Tokyo and visually inspect Tokyo Bay, islands, municipalities, and all 23 special wards for cracks/overlaps.
3. Click Shinjuku and verify URL, breadcrumb, map selection, every metric, realtime order, activity, trend, service ranking, technician ranking, and coverage all report `JP/13/13104`.
4. Navigate each breadcrumb level back to Japan.
5. Repeat Tokyo/Shinjuku selection using keyboard only.
6. Simulate map-asset failure and verify the formal region selector still changes the same scope.

- [ ] **Step 5: Verify live behavior and server-load safeguards**

Create one isolated formal test order in Shinjuku, observe exactly one SSE order insertion and subtle static/pulse region cue, then transition payment/status and confirm dedupe. Compare the screen values to direct MySQL queries. Keep DevTools Network open for 6 minutes: no request from clock or list movement, rankings/trends at most once per 60 seconds after invalidation, one reconciliation at 5 minutes, one SSE connection except controlled reconnect. Hide the tab for over 5 minutes, restore it, and confirm exactly one snapshot request without a burst. Enable reduced motion and confirm all continuous/translation effects stop.

- [ ] **Step 6: Clean test evidence and document results**

Remove or roll back the isolated order and run the formal checker cleanup assertion. In `docs/live-dashboard-acceptance.md`, record actual commands, timestamps, screenshot paths, tested scope codes, MySQL comparison queries/results, network request counts, console errors, cleanup status, and explicit statuses for local implementation, migration application, formal-data verification, browser acceptance, remote push, deployment, and production migration.

- [ ] **Step 7: Commit Task 8**

```bash
git add docs/live-dashboard-acceptance.md README.md
git commit -m "docs: record live dashboard browser acceptance"
```

## Microstep-B Completion Gate

The data screen is complete only when:

- The original dashboard opens it in a separate tab and retains its state.
- Auth restoration and both frontend/backend permission gates are verified.
- Default Japan, Tokyo, Shinjuku, breadcrumbs, keyboard selection, and map fallback all pass.
- Every panel shares the exact selected service-occurrence region.
- Fullscreen enter/exit/rejection and 1920×1080/2560×1440 day/night layouts pass.
- Automatic scrolling uses local timers, pauses correctly, does not duplicate data, and honors reduced motion.
- SSE, 60-second coalescing, 5-minute reconciliation, hidden-tab recovery, retry jitter, and event dedupe pass without request storms.
- Map source/checksums/byte budgets and visual coastline/Tokyo-ward inspection pass.
- Automated tests, i18n audit, frontend/backend lint/build, real MySQL checker, and browser acceptance pass.
- Remote push, deployment, and migration state are reported as independent facts rather than inferred from local success.
