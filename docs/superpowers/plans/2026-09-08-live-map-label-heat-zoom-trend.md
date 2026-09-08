# Live Map Label, Heat, Zoom, and Trend Implementation Plan

> **For agentic workers:** Execute this plan inline with test-driven development. The user requested one consolidated local Git finish after all tasks, so do not commit between tasks.

**Goal:** Make the live operations map readable and touch friendly, color regions from green to red against the previous JST day's regional order range, and let the trend chart use the full card width without stretching text.

**Architecture:** Extend each formal child-region aggregate with current-day and previous-day order counts, while retaining the selected-period count. Keep heat-color calculation and label disclosure as pure frontend functions, then render them through the existing SVG map. Extend the existing pure viewport module for slider and pinch zoom, keeping labels in an unscaled overlay that is hidden during gestures and recomputed after settlement.

**Tech Stack:** React 19, TypeScript, SVG, Vitest, Express, Prisma/MySQL raw aggregate queries, Zod.

## Global Constraints

- Work only in the local repository and local runtime.
- Use formal API and database aggregates; add no mock, fallback price, or fake data.
- Preserve the current React/TSX/Vite application and existing dashboard navigation.
- Maximum zoom is 8x, which is twice the previous 4x maximum.
- Do not horizontally scale chart text or numbers.
- Do not push or deploy; finish with one local commit and merge into local main.

---

### Task 1: Formal daily regional heat evidence

**Files:**
- Modify: `backend/src/domain/live-dashboard.ts`
- Modify: `backend/src/repositories/live-dashboard.repository.ts`
- Modify: `backend/src/services/live-dashboard.service.ts`
- Modify: `backend/src/validators/live-dashboard.validator.ts`
- Modify: `src/api/liveDashboard.ts`
- Test: `backend/tests/live-dashboard.repository.test.ts`
- Test: `backend/tests/live-dashboard.service.test.ts`
- Test: `src/api/liveDashboard.test.ts`

- [x] Add failing contract tests requiring `currentDayOrderCount` and `previousDayOrderCount` on every child region.
- [x] Add JST current-day and previous-day windows to the formal child-region aggregate query and map the two counts through cache, service response, and frontend Zod validation.
- [x] Verify repository, service, validator, and frontend API tests.

### Task 2: Heat scale and Google-style label disclosure

**Files:**
- Create: `src/features/live-dashboard/mapHeatScale.ts`
- Test: `src/features/live-dashboard/mapHeatScale.test.ts`
- Modify: `src/features/live-dashboard/mapLabelLayout.ts`
- Test: `src/features/live-dashboard/mapLabelLayout.test.ts`
- Modify: `src/features/live-dashboard/JapanRegionMap.tsx`
- Test: `src/features/live-dashboard/JapanRegionMap.test.tsx`

- [x] Add failing pure tests for green/minimum, red/maximum, clamping, equal-range behavior, missing data, and stable intermediate colors.
- [x] Add failing label tests that keep selected/focused labels first, prioritize major national regions, show progressively more collision-free internal labels as zoom increases, and never create external callouts.
- [x] Implement the pure heat scale and label disclosure functions and render a fixed previous-day legend, hover/tap details, and internal labels only.
- [x] Verify all map unit and component tests.

### Task 3: Slider and multitouch viewport gestures

**Files:**
- Modify: `src/features/live-dashboard/mapViewport.ts`
- Test: `src/features/live-dashboard/mapViewport.test.ts`
- Modify: `src/features/live-dashboard/JapanRegionMap.tsx`
- Test: `src/features/live-dashboard/JapanRegionMap.test.tsx`
- Modify: `src/styles.css`

- [x] Add failing tests for direct scale selection through 8x and focal-point preservation.
- [x] Replace the plus/minus controls with an accessible range slider and retain reset.
- [x] Track active pointers so one finger pans and two fingers pinch around their midpoint; suppress accidental selection after movement.
- [x] Hide labels during drag, pinch, wheel, and slider motion, then settle and fade them in after 250ms.
- [x] Verify pointer, keyboard, slider, reset, and mobile gesture behavior.

### Task 4: Responsive trend width and complete local verification

**Files:**
- Modify: `src/features/live-dashboard/LiveTrendChart.tsx`
- Test: `src/features/live-dashboard/LiveTrendChart.test.tsx`
- Modify: `src/styles.css`
- Modify: `docs/live-dashboard-acceptance.md`

- [x] Add a failing test requiring a wide logical viewBox and `preserveAspectRatio="none"` only on chart geometry, with labels rendered in a non-stretched HTML axis.
- [x] Expand plot geometry to the available width while keeping dates, legend text, and numbers as normal HTML/SVG text with unchanged proportions.
- [x] Run focused frontend and backend tests, then lint, typecheck/build, and `git diff --check`.
- [x] Commit the complete batch, merge it into local main without disturbing unrelated dirty worktrees, remove this completed worktree and branch, and confirm no push or deployment occurred.
