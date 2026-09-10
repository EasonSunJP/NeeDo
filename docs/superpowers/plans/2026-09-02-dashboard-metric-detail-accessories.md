# Dashboard Metric Detail Accessories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move analytics detail actions into the metric-card header and show a disabled TEST badge for every metric without an available formal detail view.

**Architecture:** Treat a detail view as available only when `AnalyticsMetricPayload.detailRoute` is non-null and `dataStatus` is `ready`. `DashboardMetricCard` owns visual placement and accessibility; `DashboardPage` maps null routes and non-ready data states to the shared TEST label for all three overview groups.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, React DOM test utilities.

## Global Constraints

- Do not change metric formulas, API contracts, or navigation routes.
- Do not add mock data or placeholder pages.
- Preserve the existing admin theme and responsive card grid.

---

### Task 1: Header detail accessory

**Files:**
- Modify: `src/features/dashboard/DashboardMetricCard.test.tsx`
- Modify: `src/features/dashboard/AnalyticsMetricDetail.test.tsx`
- Modify: `src/pages/admin/DashboardPage.test.ts`
- Modify: `src/features/dashboard/DashboardMetricCard.tsx`
- Modify: `src/pages/admin/DashboardPage.tsx`

**Interfaces:**
- Consumes: `AnalyticsMetricPayload.detailRoute: string | null` and `AnalyticsMetricPayload.dataStatus`
- Produces: a header action marked by `data-analytics-detail-accessory`, with either a detail button or a disabled TEST badge.

- [x] **Step 1: Write failing tests**

Add assertions that the detail button and TEST badge are children of the card header, and that every null-route or non-ready overview metric receives a TEST badge.

- [x] **Step 2: Verify RED**

Run: `npm test -- --run src/features/dashboard/DashboardMetricCard.test.tsx src/features/dashboard/AnalyticsMetricDetail.test.tsx src/pages/admin/DashboardPage.test.ts`

Expected: failure because the current action is rendered below the metric body and routed metrics with unavailable data still expose navigation.

- [x] **Step 3: Implement the minimum layout and availability mapping**

Render the action inside the card header and derive the disabled label from a null route or non-ready data status for all overview groups.

- [x] **Step 4: Verify GREEN and regressions**

Run the focused test command, then `npm run lint` and `npm run build`.

- [x] **Step 5: Commit**

Commit the tests, component, page mapping, design, and plan as one reviewable dashboard UI micro-step.
