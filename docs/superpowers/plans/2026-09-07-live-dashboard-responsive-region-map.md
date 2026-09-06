# Live Dashboard Responsive Region Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the operations live dashboard fit one fluid desktop viewport, keep the trend axis readable, add local nationwide region search and cascading selectors, hide only the map graphic on portrait phones, and render collision-free map callouts with zoom/pan/reset controls.

**Architecture:** Keep the existing formal snapshot/SSE/URL-scope path unchanged. Add one versioned static N03 search index and pure browser-side search, label-layout, and viewport modules; `JapanRegionMap` composes those modules while `LiveDashboardPage` and scoped CSS own viewport layout. All new map interaction is local and must not call the business API.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4/jsdom, static JSON generated from the committed N03 catalog, SVG, existing NeeDo admin theme variables.

## Global Constraints

- Work only in the isolated `codex/live-dashboard-responsive-map-controls` branch.
- Preserve React/TSX/Vite, the protected live-screen route, formal snapshot/SSE contracts, URL-first scope ownership, RBAC, service-occurrence attribution, and the 60-second/5-minute refresh policy.
- Do not add backend APIs, database tables, migrations, mocks, placeholder data, polling, runtime dependencies, or unrelated refactors.
- Desktop landscape uses `100dvh`, has no page-level horizontal or vertical scroll, and does not use a fixed 1124px canvas or whole-page `transform: scale(...)`.
- Portrait phones hide the map graphic and map viewport controls, retain nationwide search and all cascading selectors, use a single column, and may scroll vertically.
- Search covers 47 prefectures and 1918 ADMIN2 regions, including Tokyo's 23 special wards, from a versioned local N03 index.
- Dense labels move to deterministic perimeter callouts with leader lines; when the outer rail is full, bounded inward rails along the same edge are allowed. Selected/focused regions have priority and labels must not overlap or fall back into the original anchor cluster.
- Map controls are zoom in, zoom out, and reset; zoomed maps support bounded pointer/touch panning and reset on administrative-level change.
- The trend chart keeps a readable plot and a separate date-axis band at every accepted desktop viewport; zero values must not collapse onto the date labels.
- Use only `.live-dashboard-*` selectors and existing `--admin-*` theme variables for new styling.
- Add all visible copy to the existing five-language translation tables.
- Every production-code change follows RED -> observed failure -> minimal GREEN -> refactor.
- Do not push, deploy, or apply a production migration.

---

### Task 1: Generate and verify the local N03 nationwide search index

**Files:**
- Create: `scripts/build-jp-region-search-index.mjs`
- Create: `scripts/build-jp-region-search-index.test.ts`
- Create: `public/maps/jp/2026/search-index.json`
- Modify: `scripts/check-jp-admin-map.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `backend/prisma/reference/jp-administrative-regions-2026.json` with `version`, `sourceSha256`, and `regions`.
- Produces: `buildRegionSearchIndex(catalog): RegionSearchIndex` and `/maps/jp/2026/search-index.json` with `countryCode`, `sourceVersion`, and 1965 sorted entries.
- Entry contract: `{ code: string; level: "admin1" | "admin2"; parentCode: "JP" | string; nameJa: string; breadcrumbJa: string[] }`.

- [ ] **Step 1: Write the failing generator contract tests**

Create `scripts/build-jp-region-search-index.test.ts`:

```ts
import catalog from "../backend/prisma/reference/jp-administrative-regions-2026.json";
import { describe, expect, it } from "vitest";
import { buildRegionSearchIndex } from "./build-jp-region-search-index.mjs";

describe("buildRegionSearchIndex", () => {
  const index = buildRegionSearchIndex(catalog);

  it("indexes all formal Japanese admin1 and admin2 regions", () => {
    expect(index.countryCode).toBe("JP");
    expect(index.sourceVersion).toBe("N03-20260101");
    expect(index.regions.filter((item) => item.level === "admin1")).toHaveLength(47);
    expect(index.regions.filter((item) => item.level === "admin2")).toHaveLength(1918);
    expect(new Set(index.regions.map((item) => item.code))).toHaveSize(1965);
  });

  it("writes complete stable breadcrumbs for Tokyo and Shinjuku", () => {
    expect(index.regions.find((item) => item.code === "13")?.breadcrumbJa)
      .toEqual(["日本", "東京都"]);
    expect(index.regions.find((item) => item.code === "13104")?.breadcrumbJa)
      .toEqual(["日本", "東京都", "新宿区"]);
    expect(index.regions.map((item) => item.code))
      .toEqual([...index.regions.map((item) => item.code)].sort());
  });
});
```

- [ ] **Step 2: Run the generator tests and verify RED**

Run:

```bash
npm test -- scripts/build-jp-region-search-index.test.ts
```

Expected: FAIL because `build-jp-region-search-index.mjs` does not exist.

- [ ] **Step 3: Implement the deterministic generator**

Create `scripts/build-jp-region-search-index.mjs` with a pure export and a guarded CLI entry:

```js
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_FILE = path.resolve("backend/prisma/reference/jp-administrative-regions-2026.json");
const OUTPUT_FILE = path.resolve("public/maps/jp/2026/search-index.json");

export function buildRegionSearchIndex(catalog) {
  if (catalog.version !== "N03-20260101") throw new Error("Unexpected N03 catalog version");
  const byCode = new Map(catalog.regions.map((item) => [item.officialCode, item]));
  const country = byCode.get("JP");
  if (!country) throw new Error("Japan catalog entry is missing");
  const regions = catalog.regions
    .filter((item) => item.level === "ADMIN1" || item.level === "ADMIN2")
    .map((item) => {
      const parent = item.level === "ADMIN2" ? byCode.get(item.parentOfficialCode) : null;
      if (item.level === "ADMIN2" && !parent) throw new Error(`Missing parent for ${item.officialCode}`);
      return {
        code: item.officialCode,
        level: item.level === "ADMIN1" ? "admin1" : "admin2",
        parentCode: item.parentOfficialCode,
        nameJa: item.nameJa,
        breadcrumbJa: [country.nameJa, ...(parent ? [parent.nameJa] : []), item.nameJa]
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));
  return { countryCode: "JP", sourceVersion: catalog.version, regions };
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG_FILE, "utf8"));
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(buildRegionSearchIndex(catalog))}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
```

Add `"maps:jp:search-index": "node scripts/build-jp-region-search-index.mjs"` to `package.json`, run it, and commit the generated JSON. Extend `check-jp-admin-map.mjs` to reject an incorrect source version, counts other than 47/1918, duplicate codes, broken parent paths, and any Shinjuku breadcrumb other than `日本/東京都/新宿区`.

- [ ] **Step 4: Verify GREEN and deterministic output**

Run twice and compare the checksum:

```bash
npm run maps:jp:search-index
shasum -a 256 public/maps/jp/2026/search-index.json
npm run maps:jp:search-index
shasum -a 256 public/maps/jp/2026/search-index.json
npm test -- scripts/build-jp-region-search-index.test.ts
npm run maps:jp:check
git diff --check
```

Expected: both checksums match; generator tests and map checker pass; checker reports 47 prefectures, 1918 municipalities, and Tokyo 23 special wards.

- [ ] **Step 5: Commit Task 1**

```bash
git add package.json scripts/build-jp-region-search-index.mjs scripts/build-jp-region-search-index.test.ts scripts/check-jp-admin-map.mjs public/maps/jp/2026/search-index.json
git commit -m "feat: add local Japan region search index"
```

---

### Task 2: Add nationwide region search and cascading selectors

**Files:**
- Create: `src/features/live-dashboard/regionSearch.ts`
- Create: `src/features/live-dashboard/regionSearch.test.ts`
- Create: `src/features/live-dashboard/RegionNavigator.tsx`
- Create: `src/features/live-dashboard/RegionNavigator.test.tsx`

**Interfaces:**
- Consumes: `/maps/jp/2026/search-index.json`, `LiveDashboardScope`, and `onSelectRegion(scope)`.
- Produces: `loadRegionSearchIndex(signal): Promise<RegionSearchIndex>`, `searchRegions(index, query, limit?): RegionSearchEntry[]`, `scopeForRegion(entry, period): LiveDashboardScope`, and `<RegionNavigator scope breadcrumbs onSelectRegion />`.
- `RegionNavigator` owns only local index/search UI state. URL navigation remains the page's responsibility.

- [ ] **Step 1: Write failing strict-projection and search-order tests**

Create `regionSearch.test.ts` with valid and invalid fixtures:

```ts
it("normalizes names and codes and returns stable nationwide paths", () => {
  expect(searchRegions(index, " 新宿 ").map((item) => item.code)).toEqual(["13104"]);
  expect(searchRegions(index, "13104")[0]?.breadcrumbJa).toEqual(["日本", "東京都", "新宿区"]);
});

it("maps admin1 and admin2 results while retaining the selected period", () => {
  expect(scopeForRegion(tokyo, "last30days")).toEqual({ country: "JP", admin1: "13", period: "last30days" });
  expect(scopeForRegion(shinjuku, "last7days")).toEqual({ country: "JP", admin1: "13", admin2: "13104", period: "last7days" });
});

it("rejects extra fields, duplicate codes, invalid parents, and non-N03 versions", async () => {
  fetchMock.mockResolvedValue(responseWith({ ...validIndex, sourceVersion: "wrong" }));
  await expect(loadRegionSearchIndex(new AbortController().signal)).rejects.toThrow("invalid_region_index");
});
```

- [ ] **Step 2: Run the pure tests and verify RED**

Run `npm test -- src/features/live-dashboard/regionSearch.test.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement strict local index loading and search**

In `regionSearch.ts`, validate exact top-level and entry keys, formats (`admin1` = two digits, `admin2` = five digits), uniqueness, parent prefix, counts, and breadcrumbs. Normalize with `NFKC`, trim, remove internal whitespace for matching, and lowercase. Sort by exact name/code, prefix, contains, level, then code; return at most 12 results. Do not fetch any URL except `/maps/jp/2026/search-index.json`.

Core scope mapping:

```ts
export function scopeForRegion(entry: RegionSearchEntry, period: LiveDashboardPeriod): LiveDashboardScope {
  return entry.level === "admin1"
    ? { country: "JP", admin1: entry.code, period }
    : { country: "JP", admin1: entry.parentCode, admin2: entry.code, period };
}
```

- [ ] **Step 4: Verify the pure tests pass**

Run `npm test -- src/features/live-dashboard/regionSearch.test.ts`.

Expected: PASS with tests for `新宿`, full-width/whitespace normalization, code lookup, no result, stable limit, exact projection, and abort propagation.

- [ ] **Step 5: Write failing accessible navigator tests**

Create `RegionNavigator.test.tsx` and assert:

```tsx
expect(screen.getByRole("combobox", { name: "全国地区搜索" })).toBeTruthy();
expect(screen.getByRole("combobox", { name: "都道府县" })).toHaveValue("13");
expect(screen.getByRole("combobox", { name: "市区町村" })).toHaveValue("13104");

await typeIntoSearch("新宿");
expect(screen.getByRole("option", { name: "日本 / 東京都 / 新宿区" })).toBeTruthy();
await pressKey("Enter");
expect(onSelectRegion).toHaveBeenCalledWith({ country: "JP", admin1: "13", admin2: "13104", period: "last7days" });
```

Also test ArrowDown/ArrowUp, Escape, empty results, index failure, prefecture selection, municipality selection, returning to Japan, and selecting the current scope without duplicate navigation.

- [ ] **Step 6: Run navigator tests and verify RED**

Run `npm test -- src/features/live-dashboard/RegionNavigator.test.tsx`.

Expected: FAIL because `RegionNavigator.tsx` does not exist.

- [ ] **Step 7: Implement the minimal accessible navigator**

Render one `.live-dashboard-region-navigator` with:

```tsx
<input
  aria-autocomplete="list"
  aria-controls="live-dashboard-region-results"
  aria-expanded={open}
  aria-label={t("全国地区搜索")}
  role="combobox"
  value={query}
/>
<ul id="live-dashboard-region-results" role="listbox">
  {results.map((entry) => (
    <li aria-selected={entry.code === activeCode} key={entry.code} role="option">
      {entry.breadcrumbJa.join(" / ")}
    </li>
  ))}
</ul>
```

Keep country disabled at Japan, populate prefectures from index, populate municipalities only for the chosen prefecture, and call `onSelectRegion` through `scopeForRegion`. When index loading fails, keep the country and current-level `breadcrumbs` available and show a translated search-unavailable message; Task 5 will pass formal `children` as a fallback option source.

- [ ] **Step 8: Verify Task 2 and commit**

```bash
npm test -- src/features/live-dashboard/regionSearch.test.ts src/features/live-dashboard/RegionNavigator.test.tsx
git diff --check
git add src/features/live-dashboard/regionSearch.ts src/features/live-dashboard/regionSearch.test.ts src/features/live-dashboard/RegionNavigator.tsx src/features/live-dashboard/RegionNavigator.test.tsx
git commit -m "feat: search and select Japan live dashboard regions"
```

Expected: all Task 2 tests pass and no unrelated files are staged.

---

### Task 3: Compute deterministic collision-free map callouts

**Files:**
- Create: `src/features/live-dashboard/mapLabelLayout.ts`
- Create: `src/features/live-dashboard/mapLabelLayout.test.ts`

**Interfaces:**
- Consumes: map regions with `code`, `nameJa`, and `labelPoint`; current SVG `viewBox`; current map viewport transform; selected/focused code; formal child order counts.
- Produces: `layoutMapLabels(input): MapLabelPlacement[]` where each placement is `{ code, anchor: [number, number], label: [number, number], width, height, external, leader: [number, number][] }`.
- The function is pure and deterministic; it performs no DOM reads, React state updates, or network calls.

- [ ] **Step 1: Write failing geometry tests**

Create dense Tokyo/island fixtures and assert:

```ts
const placements = layoutMapLabels({ regions, viewBox: [0, 0, 1000, 800], viewport: identityViewport, selectedCode: "13104", orderCountByCode });
expect(placements).toHaveLength(regions.length);
expect(overlappingPairs(placements)).toEqual([]);
expect(placements.filter((item) => item.external).every((item) => item.leader.length >= 2)).toBe(true);
expect(layoutMapLabels(input)).toEqual(layoutMapLabels(input));
expect(placements.find((item) => item.code === "13104")).toBeDefined();
```

Test internal non-overlapping labels, dense callouts, bounds containment, selected priority, stable administrative-code tie breaking, and transformed anchors at 2x zoom.

- [ ] **Step 2: Run the layout tests and verify RED**

Run `npm test -- src/features/live-dashboard/mapLabelLayout.test.ts`.

Expected: FAIL because `mapLabelLayout.ts` does not exist.

- [ ] **Step 3: Implement the deterministic layout algorithm**

Use viewBox-space measurements, not browser font measurement:

```ts
const estimateBox = (name: string) => ({ width: Math.max(48, name.length * 15 + 16), height: 28 });
```

Transform anchors through the current viewport. Sort selected first, then positive order count, smaller estimated region-label fit, and code. Attempt centered internal placement; if it intersects an accepted box or lacks edge clearance, allocate the nearest available left/right/top/bottom perimeter slot. When the outer rail is full, add bounded inward rails along the same edge; do not place callouts back inside the original anchor cluster. Clamp the label box to the viewBox and create a two- or three-point leader that terminates before the text box. Export a test-only-independent `boxesOverlap` production utility rather than duplicating collision math in tests.

- [ ] **Step 4: Verify GREEN, density, and performance**

```bash
npm test -- src/features/live-dashboard/mapLabelLayout.test.ts
```

Expected: all placements remain inside bounds, no label boxes overlap for country/Tokyo fixtures, every external label has one leader, inward fallback slots remain edge-aligned and outside the original anchor cluster, identical inputs produce deep-equal outputs, capacity failures are asserted, ordinary inputs remain unmodified, and 1918-index lookup is not part of layout execution.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/features/live-dashboard/mapLabelLayout.ts src/features/live-dashboard/mapLabelLayout.test.ts
git commit -m "feat: place dense map labels with leader lines"
```

---

### Task 4: Add bounded SVG zoom, pan, and reset state

**Files:**
- Create: `src/features/live-dashboard/mapViewport.ts`
- Create: `src/features/live-dashboard/mapViewport.test.ts`

**Interfaces:**
- Produces: `MapViewport = { scale: number; x: number; y: number }`, `IDENTITY_VIEWPORT`, `zoomMapViewport(current, direction, center, viewBox)`, `panMapViewport(current, delta, viewBox)`, and `mapViewportTransform(viewport)`.
- Zoom bounds: `1 <= scale <= 4`; zoom step: `0.5`.
- `x/y` are viewBox-space translations clamped so the transformed map always intersects the complete viewport on both axes.

- [ ] **Step 1: Write failing pure viewport tests**

```ts
it("zooms around the selected anchor and clamps at 1x and 4x", () => {
  expect(repeatZoom(IDENTITY_VIEWPORT, "out", 3)).toEqual(IDENTITY_VIEWPORT);
  expect(repeatZoom(IDENTITY_VIEWPORT, "in", 10).scale).toBe(4);
});

it("clamps pan and resets exactly", () => {
  const zoomed = { scale: 2, x: 0, y: 0 };
  expect(panMapViewport(zoomed, [100000, -100000], [0, 0, 1000, 800]))
    .toEqual({ scale: 2, x: 500, y: -400 });
  expect(mapViewportTransform(IDENTITY_VIEWPORT)).toBe("translate(0 0) scale(1)");
});
```

- [ ] **Step 2: Run viewport tests and verify RED**

Run `npm test -- src/features/live-dashboard/mapViewport.test.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal pure transform math**

Implement finite-number guards, exact min/max zoom, center-preserving zoom translation, and scale-derived pan bounds. Invalid deltas return the current valid viewport rather than producing `NaN`.

- [ ] **Step 4: Verify and commit Task 4**

```bash
npm test -- src/features/live-dashboard/mapViewport.test.ts
git diff --check
git add src/features/live-dashboard/mapViewport.ts src/features/live-dashboard/mapViewport.test.ts
git commit -m "feat: add bounded live map viewport controls"
```

---

### Task 5: Integrate navigator, callouts, and map controls without network refreshes

**Files:**
- Modify: `src/features/live-dashboard/JapanRegionMap.tsx`
- Modify: `src/features/live-dashboard/JapanRegionMap.test.tsx`
- Modify: `src/features/live-dashboard/RegionNavigator.tsx`
- Modify: `src/features/live-dashboard/RegionNavigator.test.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Tasks 2-4 modules and existing `children`, `breadcrumbs`, `scope`, `onSelectRegion` props.
- Produces: one map card whose navigator survives map failure; `.live-dashboard-map-graphic` is the only portrait-phone-hidden region.

- [ ] **Step 1: Extend `JapanRegionMap` tests with RED interaction cases**

Add tests that assert:

```tsx
expect(container.querySelector(".live-dashboard-region-navigator")).toBeTruthy();
expect(container.querySelectorAll("[data-map-leader]").length).toBeGreaterThan(0);
expect(container.querySelectorAll("[data-map-label]").length).toBe(country.regions.length);

clickButton("放大");
expect(container.querySelector("[data-map-geometry]")?.getAttribute("transform")).not.toContain("scale(1)");
clickButton("还原");
expect(container.querySelector("[data-map-geometry]")?.getAttribute("transform")).toContain("scale(1)");
```

Also assert zoom buttons disable at bounds, pointer drag changes transform only above 1x, scope/admin1 change resets the transform, external labels remain outside the transformed geometry group, map failure retains the navigator, and calling zoom/pan/search does not call snapshot/SSE functions or any fetch except the two allowed static resources.

- [ ] **Step 2: Run the integration tests and verify RED**

Run:

```bash
npm test -- src/features/live-dashboard/JapanRegionMap.test.tsx src/features/live-dashboard/RegionNavigator.test.tsx
```

Expected: FAIL for missing navigator, leader lines, and viewport buttons.

- [ ] **Step 3: Integrate the navigator before the map graphic**

The map card must retain this hierarchy:

```tsx
<section className="live-dashboard-map-card">
  <RegionNavigator
    breadcrumbs={breadcrumbs}
    fallbackChildren={children}
    onSelectRegion={onSelectRegion}
    scope={scope}
  />
  <div className="live-dashboard-map-graphic">
    <div className="live-dashboard-map-viewport-controls">...</div>
    <div className="live-dashboard-map-stage">...</div>
  </div>
</section>
```

Do not return early on map error. Render the same navigator followed by an in-card map failure message; `fallbackChildren` supplies the current formal child options if the search index is unavailable.

- [ ] **Step 4: Render transformed geometry and unscaled callouts**

Inside SVG:

```tsx
<g data-map-geometry transform={mapViewportTransform(viewport)}>
  {regionPaths}
</g>
<g className="live-dashboard-map-leaders" pointerEvents="none">
  {placements.filter((item) => item.external).map((item) => (
    <polyline data-map-leader={item.code} key={item.code} points={item.leader.map((point) => point.join(",")).join(" ")} />
  ))}
</g>
<g className="live-dashboard-map-labels" pointerEvents="none">
  {placements.map((item) => <text data-map-label={item.code} key={item.code} x={item.label[0]} y={item.label[1]}>{nameByCode.get(item.code)}</text>)}
</g>
```

Recompute placements with `useMemo` from asset, viewport, active code, and `children`; never run it from the SSE clock or list timers.

- [ ] **Step 5: Add accessible zoom and bounded pointer panning**

Buttons call Task 4 pure functions and have translated `aria-label` plus visible symbols/text. Pointer down captures the pointer only when `scale > 1`; pointer move converts screen delta to viewBox delta and applies `panMapViewport`; pointer up/cancel releases capture. Reset `viewport` to `IDENTITY_VIEWPORT` when `asset.parentCode` or `asset.level` changes.

- [ ] **Step 6: Add five-language copy and map-scoped styling**

Add translations for `全国地区搜索`, `搜索都道府县、市区町村`, `没有匹配的地区`, `地区搜索暂不可用`, `放大地图`, `缩小地图`, `还原地图`, and result-count/selection copy. Style only `.live-dashboard-region-*`, `.live-dashboard-map-*`, and current admin variables. Leader lines use medium theme contrast; labels retain the existing stroke/fill strategy. Add visible `:focus-visible` treatment.

- [ ] **Step 7: Verify Task 5 and commit**

```bash
npm test -- src/features/live-dashboard/regionSearch.test.ts src/features/live-dashboard/RegionNavigator.test.tsx src/features/live-dashboard/mapLabelLayout.test.ts src/features/live-dashboard/mapViewport.test.ts src/features/live-dashboard/JapanRegionMap.test.tsx
npm run i18n:audit
npm run lint
git diff --check
git add src/features/live-dashboard/JapanRegionMap.tsx src/features/live-dashboard/JapanRegionMap.test.tsx src/features/live-dashboard/RegionNavigator.tsx src/features/live-dashboard/RegionNavigator.test.tsx src/i18n/translations.ts src/styles.css
git commit -m "feat: add searchable zoomable Japan live map"
```

Expected: all focused tests, i18n audit, type-check lint, and diff check pass.

---

### Task 6: Make the desktop canvas fluid and keep the trend date axis readable

**Files:**
- Create: `src/features/live-dashboard/LiveTrendChart.test.tsx`
- Create: `src/features/live-dashboard/liveDashboardResponsive.test.ts`
- Modify: `src/features/live-dashboard/LiveTrendChart.tsx`
- Modify: `src/features/live-dashboard/LiveDashboardPanels.tsx`
- Modify: `src/features/live-dashboard/LiveDashboardPanels.test.tsx`
- Modify: `src/pages/admin/LiveDashboardPage.tsx`
- Modify: `src/pages/admin/LiveDashboardPage.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `LiveDashboardPage` no longer computes or writes `--live-dashboard-scale`/`--live-dashboard-width`.
- `LiveDashboardPanels` keeps the same `map` and `snapshot` props, but exposes stable panel classes for responsive ordering.
- `LiveTrendChart` keeps the same props and uses a fixed internal plot/axis geometry that remains readable when its outer card changes size.

- [ ] **Step 1: Write RED trend-chart geometry tests**

Create `LiveTrendChart.test.tsx` with zero, one-point, and seven-point data. Assert:

```tsx
const svg = container.querySelector("svg")!;
expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
expect(svg.querySelector("[data-chart-plot]")).toBeTruthy();
expect(svg.querySelector("[data-chart-axis]")).toBeTruthy();

const baselineY = Number(svg.querySelector("[data-chart-baseline]")?.getAttribute("data-y"));
const labelY = Number(svg.querySelector(".live-dashboard-chart-label")?.getAttribute("y"));
expect(labelY - baselineY).toBeGreaterThanOrEqual(16);
```

Assert every generated polyline Y stays inside the plot band and all-zero series use the baseline without sharing the date-label Y.

- [ ] **Step 2: Run chart tests and verify RED**

Run `npm test -- src/features/live-dashboard/LiveTrendChart.test.tsx`.

Expected: FAIL because the current chart uses `preserveAspectRatio="none"` and has no separate plot/axis markers.

- [ ] **Step 3: Implement the readable plot and date-axis band**

Use named geometry constants:

```ts
const CHART = { width: 400, height: 150, left: 22, right: 382, top: 18, baseline: 104, labelY: 136 } as const;
const valueY = (value: number, maximum: number) =>
  CHART.baseline - (value / Math.max(1, maximum)) * (CHART.baseline - CHART.top);
```

Set `viewBox="0 0 400 150"`, `preserveAspectRatio="xMidYMid meet"`, group the grid/data in `data-chart-plot`, render a distinct baseline in `data-chart-axis`, and place labels at `labelY`. Preserve independent order/payment maxima and truthful zero values.

- [ ] **Step 4: Verify chart GREEN**

Run `npm test -- src/features/live-dashboard/LiveTrendChart.test.tsx`.

Expected: zero, one-point, and seven-point chart tests pass.

- [ ] **Step 5: Write RED page/CSS responsive contract tests**

Create `liveDashboardResponsive.test.ts` importing `src/styles.css?raw` and page source. Assert:

```ts
expect(pageSource).not.toContain("viewportScale");
expect(pageSource).not.toContain("--live-dashboard-scale");
expect(styles).not.toMatch(/\.live-dashboard-workspace[^}]*min-width:\s*1124px/s);
expect(styles).not.toMatch(/\.live-dashboard-workspace[^}]*transform:\s*scale/s);
expect(styles).toMatch(/\.live-dashboard-shell[^}]*height:\s*100dvh/s);
expect(styles).toMatch(/\.live-dashboard-canvas[^}]*grid-template-columns:\s*minmax\(0,/s);
expect(styles).toMatch(/@media[^\{]*orientation:\s*portrait[\s\S]*\.live-dashboard-map-graphic[^}]*display:\s*none/s);
expect(styles).toMatch(/@media[^\{]*orientation:\s*portrait[\s\S]*\.live-dashboard-shell[^}]*overflow-y:\s*auto/s);
```

Extend page/panel tests to confirm every panel retains a stable responsive class, the map navigator remains mounted on phone layout, and the page no longer installs a resize listener for scaling.

- [ ] **Step 6: Run responsive tests and verify RED**

```bash
npm test -- src/features/live-dashboard/liveDashboardResponsive.test.ts src/pages/admin/LiveDashboardPage.test.tsx src/features/live-dashboard/LiveDashboardPanels.test.tsx
```

Expected: FAIL on the current fixed minimum canvas, transform scale, fixed map/chart heights, and missing portrait rules.

- [ ] **Step 7: Implement fluid viewport layout**

Remove `CSSProperties`, `viewportScale`, resize handling, and inline custom properties from `LiveDashboardPage`. Use:

```tsx
<div className="live-dashboard-workspace">
  {stateBanners}
  {dashboardContent}
</div>
```

Update CSS so the desktop root is a two-row viewport grid, with fluid columns such as:

```css
.live-dashboard-shell { height: 100dvh; min-height: 0; overflow: hidden; }
.live-dashboard-grid { min-height: 0; overflow: hidden; }
.live-dashboard-workspace,
.live-dashboard-canvas { height: 100%; min-width: 0; min-height: 0; }
.live-dashboard-canvas {
  grid-template-columns: minmax(0, .9fr) minmax(0, 1.8fr) minmax(0, 1fr);
  gap: clamp(6px, .7vw, 12px);
}
.live-dashboard-center { grid-template-rows: auto minmax(0, 1fr) minmax(140px, 22dvh); }
.live-dashboard-map-svg { width: 100%; height: 100%; min-height: 0; }
```

Use `clamp()` for heading/card padding/row density. Add a low-height query to reduce chrome while retaining a trend card of at least 140px. Lists keep internal overflow/auto-scroll and cannot expand their grid tracks.

- [ ] **Step 8: Implement portrait-phone structure and ordering**

Use a phone portrait media query (`max-width: 767px` and `orientation: portrait`) to set `height:auto`, `min-height:100dvh`, `overflow-y:auto`, a single column, and `.live-dashboard-map-graphic { display:none; }`. Keep `.live-dashboard-region-navigator` visible. Reorder panels by assigning named responsive classes; do not duplicate panels or data. Ensure `overflow-x: clip` and inputs use `min-width:0;width:100%`.

- [ ] **Step 9: Verify Task 6 and commit**

```bash
npm test -- src/features/live-dashboard/LiveTrendChart.test.tsx src/features/live-dashboard/liveDashboardResponsive.test.ts src/pages/admin/LiveDashboardPage.test.tsx src/features/live-dashboard/LiveDashboardPanels.test.tsx src/features/live-dashboard/LiveDashboardShell.test.tsx
npm run i18n:audit
npm run lint
npm run build
git diff --check
git add src/features/live-dashboard/LiveTrendChart.tsx src/features/live-dashboard/LiveTrendChart.test.tsx src/features/live-dashboard/liveDashboardResponsive.test.ts src/features/live-dashboard/LiveDashboardPanels.tsx src/features/live-dashboard/LiveDashboardPanels.test.tsx src/pages/admin/LiveDashboardPage.tsx src/pages/admin/LiveDashboardPage.test.tsx src/styles.css
git commit -m "fix: fit live dashboard to fluid viewports"
```

Expected: focused tests, i18n audit, lint, production build, and diff check pass.

---

### Task 7: Full regression, browser acceptance, and local integration record

**Files:**
- Modify: `docs/live-dashboard-acceptance.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1-6 and the existing standard formal local runtime.
- Produces: evidence that separates implementation, local main merge, browser/runtime state, remote push, deployment, and production migration.

- [ ] **Step 1: Run the complete automated gate**

```bash
npm run maps:jp:search-index
npm run maps:jp:check
npm test -- scripts/build-jp-region-search-index.test.ts src/features/live-dashboard/regionSearch.test.ts src/features/live-dashboard/RegionNavigator.test.tsx src/features/live-dashboard/mapLabelLayout.test.ts src/features/live-dashboard/mapViewport.test.ts src/features/live-dashboard/JapanRegionMap.test.tsx src/features/live-dashboard/LiveTrendChart.test.tsx src/features/live-dashboard/liveDashboardResponsive.test.ts src/features/live-dashboard/AutoScrollList.test.tsx src/features/live-dashboard/LiveDashboardPanels.test.tsx src/features/live-dashboard/LiveDashboardShell.test.tsx src/features/live-dashboard/liveDashboardState.test.ts src/features/live-dashboard/useLiveDashboard.test.tsx src/pages/admin/LiveDashboardPage.test.tsx src/pages/admin/DashboardPage.test.ts src/App.test.tsx
npm run i18n:audit
npm run lint
npm run build
cd backend
npm test -- --runInBand tests/live-dashboard-validator.test.ts tests/live-dashboard.repository.test.ts tests/live-dashboard.service.test.ts tests/live-dashboard-cache.test.ts tests/live-dashboard-events.test.ts tests/live-dashboard-api.test.ts tests/live-dashboard-openapi.test.ts
npm run lint
npm run build
```

Expected: every command exits 0. Record exact counts and any existing non-failing build warnings without describing them as newly fixed.

- [ ] **Step 2: Prove the served formal runtime before browser testing**

Record listener PID/cwd/branch/commit for frontend 5180 and backend 3000/3001/3002; verify MySQL 3307, Redis 6379, direct health/ready, frontend proxy health/ready, and the intended database name. If another worktree owns a port, stop and correct the served-runtime mismatch before UI conclusions.

- [ ] **Step 3: Verify fluid desktop one-screen layout in a real browser**

Use authenticated operations access and test 1366x768, 1440x900, 1920x1080, 2560x1440, plus one wide/low viewport in day and `blue-black` themes. For every sample record:

```js
({
  width: innerWidth,
  height: innerHeight,
  scrollWidth: document.documentElement.scrollWidth,
  scrollHeight: document.documentElement.scrollHeight,
  clientWidth: document.documentElement.clientWidth,
  clientHeight: document.documentElement.clientHeight
})
```

Expected on desktop: `scrollWidth === clientWidth`, `scrollHeight === clientHeight`, all panels visible, no global scale transform, map and controls readable, and no console errors.

- [ ] **Step 4: Verify search, selectors, callouts, and map controls**

Search `東京都`, `新宿区`, `13104`, and one island municipality from Japan scope. Verify full-path results and URL/scope consistency. Exercise cascading dropdowns Japan -> Tokyo -> Shinjuku and breadcrumbs back. Inspect Tokyo mainland/islands and another dense prefecture: no text overlap; each displaced label has a leader to the correct region. Exercise zoom to both limits, bounded drag, reset, and administrative-level reset with mouse and keyboard; confirm none of those local actions creates snapshot/SSE requests.

- [ ] **Step 5: Verify the trend chart and portrait phones**

At every desktop sample, capture both zero-data and real-data trend charts and verify grid/data/date-axis separation. At 320px, 390px, and 440px portrait widths verify: map graphic and zoom controls absent, no blank map space, search and all selectors present, single-column cards scroll vertically, no horizontal overflow, and no console errors.

- [ ] **Step 6: Verify request cadence remains unchanged**

With DevTools Network open, type searches, change focus, zoom, pan, and reset; expected business-request delta is zero until an actual region selection. On region selection expect the existing single scope transition. Observe the stable page long enough to confirm the existing one SSE connection, coalesced invalidation behavior, and 5-minute reconciliation remain unchanged.

- [ ] **Step 7: Update acceptance documentation and commit**

Record commands, timestamps, screenshots, dimensions, overflow measurements, search cases, label/leader inspection, zoom states, trend-axis evidence, network counts, console results, and explicit local/push/deploy/migration states in `docs/live-dashboard-acceptance.md`. Add one concise README link/summary.

```bash
git add docs/live-dashboard-acceptance.md README.md
git commit -m "docs: verify responsive live dashboard map"
```

- [ ] **Step 8: Final clean-state and local-main gate**

```bash
git status --short
git log -8 --oneline
```

Expected: the feature worktree is clean. Only after all automated and browser gates pass, integrate this branch into local `main` without pushing. Re-run the focused frontend tests and `npm run maps:jp:check` on the served `main` worktree, then update the acceptance record if the merged commit differs from the feature commit.

## Completion Gate

- Desktop layout is fluid and one-screen across accepted landscape viewports, with no fixed canvas or whole-page transform scaling.
- Portrait phones hide only the map graphic and controls, retain region search/selectors, and scroll vertically without horizontal overflow.
- Nationwide search is local, strict, deterministic, complete for 47/1918, and preserves period and formal URL scope.
- Cascading selectors and map paths use the same `onSelectRegion` contract and cannot diverge from dashboard data scope.
- Dense labels never overlap in accepted fixtures; displaced labels have stable leader lines to the correct anchors.
- Zoom, pan, and reset are bounded, accessible, level-resetting, reduced-motion safe, and network-silent.
- Trend plot, grid, baseline, and date labels remain visually separated for zero, single-point, and seven-point data.
- Focused and regression tests, map checker, five-language audit, lint, builds, formal runtime proof, and browser acceptance pass.
- Local implementation, local main integration, remote push, deployment, production migration, and online acceptance are reported as separate facts.
