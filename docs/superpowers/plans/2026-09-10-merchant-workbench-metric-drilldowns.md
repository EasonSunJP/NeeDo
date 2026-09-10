# Merchant Workbench Metric Drilldowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add formal mobile drilldown pages for today's appointments and revenue from the merchant workbench.

**Architecture:** Extend the existing `/merchant/:view` portal states so the current merchant data gate and scoped formal loaders remain authoritative. Extract focused appointment-timeline and revenue-range components while reusing `MobileFullscreenHeader`, `UnifiedServiceInfoCard`, and the existing analytics chart.

**Tech Stack:** React 19, TypeScript, React Router, Vitest/jsdom, Tailwind CSS, formal merchant dashboard and booking APIs.

## Global Constraints

- Do not add mock, demo, placeholder, or fake API data.
- Keep port 5180 untouched; browser verification uses another confirmed-free local port.
- Do not push or modify staging, production, or any remote Git state.
- All user-visible copy uses the existing i18n path.

---

### Task 1: Merchant workbench drilldown navigation and appointment timeline

**Files:**
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`
- Test: `src/pages/mobile/MerchantPortalPage.test.tsx`

**Interfaces:**
- Consumes: `loadFormalMerchantHome()`, `MobileFullscreenHeader`, `UnifiedServiceInfoCard`.
- Produces: portal views `today-appointments` and semantic metric links to both drilldowns.

- [ ] **Step 1: Write the failing route and source-contract test**

Assert that the metric card links target `/merchant/today-appointments` and `/merchant/revenue`, and that the appointment view contains a shared header, search control, timeline list, all-order iteration, and bottom-navigation exclusion.

- [ ] **Step 2: Run the focused test and confirm the missing contracts fail**

Run: `npm test -- src/pages/mobile/MerchantPortalPage.test.tsx`

Expected: FAIL because the drilldown views, links, and timeline are absent.

- [ ] **Step 3: Implement the minimal appointment drilldown**

Extend `MerchantView`, `getMerchantView`, page titles, embedded header views, layout selection, and bottom navigation conditions. Replace the two metric `<div>` elements with accessible `<Link>` elements. Add a focused timeline that sorts `todayOrders` by `bookedAt`, filters with the shared search semantics, and renders each result through `UnifiedServiceInfoCard`.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- src/pages/mobile/MerchantPortalPage.test.tsx`

Expected: PASS.

### Task 2: Revenue chart range dropdown

**Files:**
- Modify: `src/features/shop-analytics/ShopAnalyticsDashboard.tsx`
- Test: `src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`

**Interfaces:**
- Consumes: `backofficeRealDataApi.dashboard(portal, query, options)` and `ShopAnalyticsTrend`.
- Produces: `ShopAnalyticsDashboard` props for an initial period and dropdown presentation, plus custom `from`/`to` queries.

- [ ] **Step 1: Write failing tests for default today, dropdown options, preset changes, and custom dates**

Render the dashboard with `initialPeriod="today"` and assert the first formal request uses `{ period: "today" }`; changing the select to `year` requests `{ period: "year" }`; choosing custom exposes two date inputs and requests `{ period: "custom", from, to }` only after valid dates are supplied.

- [ ] **Step 2: Run the focused test and confirm the prop and dropdown contracts fail**

Run: `npm test -- src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx`

Expected: FAIL because the component currently defaults to a four-button `last7days` filter.

- [ ] **Step 3: Implement the minimal formal range selector**

Add `today`, `last7days`, `last30days`, `week`, `month`, `year`, and `custom` options. Build a typed dashboard query from selection state; for custom ranges, render date inputs and reject an invalid range with `role="alert"` before calling the loader. Keep the existing retry, metric tiles, graph, table, and legend behavior.

- [ ] **Step 4: Embed the revenue page with the shared header**

Render `ShopAnalyticsDashboard initialPeriod="today" periodControl="select"` inside the `revenue` portal view. The common header supplies back, search, and close controls; bottom navigation remains hidden.

- [ ] **Step 5: Run both focused suites and confirm they pass**

Run: `npm test -- src/pages/mobile/MerchantPortalPage.test.tsx src/features/shop-analytics/ShopAnalyticsDashboard.test.tsx src/features/shop-analytics/merchant-home-data.test.ts`

Expected: PASS.

### Task 3: Full local verification and integration

**Files:**
- Modify: `src/i18n/translations.ts` only when new copy is absent from the translation registry.

**Interfaces:**
- Consumes: completed UI slice.
- Produces: local verification evidence and one reviewable branch history.

- [ ] **Step 1: Run translation, type, and source checks**

Run: `npm run i18n:audit`, `npm run lint`, and a scan proving no new `TODO`, `FIXME`, mock, placeholder, or fake API text in changed production files.

- [ ] **Step 2: Run the formal production build**

Run: `npm run build -- --mode formal`.

Expected: exit 0.

- [ ] **Step 3: Verify in a mobile browser away from 5180**

Start the isolated frontend on a confirmed-free port such as 5181. At 440px and 320px, verify both metric links, shared header controls, absent bottom navigation, timeline layout, range dropdown, valid custom range, and no horizontal overflow or console errors.

- [ ] **Step 4: Commit, merge into local main, and reverify**

Commit only the scoped files, merge into local `main` without touching the 5180 runtime source tree, repeat the focused tests and build on the merged commit, then remove only the fully merged clean feature branch/worktree.
