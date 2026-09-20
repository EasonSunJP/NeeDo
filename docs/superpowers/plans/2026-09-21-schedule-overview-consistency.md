# Schedule Overview Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make schedule progress, cached loading, range summaries, and schedule-status charts consistent across merchant mobile and backoffice surfaces.

**Architecture:** Reuse one schedule progress component and one mixed schedule-status chart. Derive mobile chart buckets from the already loaded formal schedule window, while extending the dashboard read model with the matching attendance-count metric. Preserve stale-while-revalidate behavior and existing transaction boundaries.

**Tech Stack:** React 19, TypeScript strict, CSS, Vitest, Node.js/Express, Prisma raw read queries, Jest.

## Global Constraints

- Work only on `codex/schedule-overview-fixes`; do not touch port 5180 before local-main integration.
- Use failing regression tests before production changes.
- Preserve formal Schedule/Booking APIs, authorization, and server authority.
- Do not push, deploy, run remote migrations, or write remote data.

---

### Task 1: Shared schedule progress and next-cycle copy

**Files:**
- Create: `src/features/scheduling/automation/ScheduleStepProgress.tsx`
- Modify: `src/features/scheduling/automation/AutomationWizard.tsx`
- Modify: `src/features/scheduling/automation/SchedulePlanningOverview.tsx`
- Modify: `src/styles.css`
- Test: `src/features/scheduling/automation/AutomationWizard.test.tsx`

**Interfaces:**
- Produces: `ScheduleStepProgress({ cycle, surface })` for both builder and overview.

- [ ] Add assertions that the overview has one date range, reuses `data-schedule-stepper`, and the last step has a straight outer edge selector.
- [ ] Run the focused test and confirm the new assertions fail.
- [ ] Extract the shared component, remove the duplicate circle stepper, simplify the heading, and add a last-child clip path that keeps only the left notch.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Non-blocking cached loading and range statistics

**Files:**
- Create: `src/features/scheduling/formalScheduleStatistics.ts`
- Modify: `src/features/dispatch-center/components/OverviewWorkspace.tsx`
- Modify: `src/components/scheduling/ScheduleCacheRefreshIndicator.tsx`
- Modify: `src/styles.css`
- Test: `src/features/scheduling/formalScheduleStatistics.test.ts`
- Test: `src/components/scheduling/ScheduleCacheRefreshIndicator.test.tsx`
- Test: `src/features/dispatch-center/components/OverviewWorkspaceHeader.test.tsx`

**Interfaces:**
- Produces: `buildFormalScheduleStatusBuckets(slots, view, dateKey)` and range summary values.
- Consumes: existing `BookingScheduleSlot[]` and authenticated persistent cache scope.

- [ ] Add failing tests for day/week/month bucket boundaries, partial-slot duration, booked/available classification, unique attendance count, consistent cache resource key, and rotating non-blocking status markup.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement the pure statistics helper and use it for mobile summary/chart data.
- [ ] Align the cache resource key with preloading, keep controls interactive during cold/background loads, and rotate the indicator with a reduced-motion fallback.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Shared mixed chart and dashboard API attendance count

**Files:**
- Modify: `src/features/dashboard/DashboardCharts.tsx`
- Modify: `src/features/dashboard/DashboardCharts.test.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminDashboardPage.tsx`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `backend/src/domain/dashboard.ts`
- Modify: `backend/src/repositories/dashboard.repository.ts`
- Modify: related dashboard repository/service tests and OpenAPI schema.

**Interfaces:**
- Produces: `ScheduleStatusChart` accepting two duration series and one attendance series.
- Extends: `DashboardBucketPayload.scheduleAttendanceCount: number`.

- [ ] Add failing frontend chart and backend repository contract tests for the new mixed chart and attendance metric.
- [ ] Run focused frontend/backend tests and confirm expected failures.
- [ ] Implement the mixed chart with separate duration/headcount axes and accessible evidence.
- [ ] Extend the dashboard SQL/read model/OpenAPI with distinct scheduled technician count and replace the old three-bar chart.
- [ ] Re-run focused tests and confirm they pass.

### Task 4: Integrated verification and local-main handoff

**Files:**
- Review all changed files only.

- [ ] Run focused frontend tests, frontend lint/type/build, focused backend tests, backend lint/build, and production-build verification as appropriate.
- [ ] Start a non-5180 frontend/runtime and browser-check the merchant schedule route at a mobile viewport plus the backoffice dashboard chart.
- [ ] Review the diff for unrelated changes and commit the complete batch.
- [ ] Merge into local `main` without overwriting the dirty user-owned files in the primary checkout.
- [ ] Re-run final verification on local `main`, then load latest main on 5180 and verify the same core interactions.
- [ ] Remove only this conversation's fully merged, clean branch/worktree; retain anything whose safety cannot be proven.
