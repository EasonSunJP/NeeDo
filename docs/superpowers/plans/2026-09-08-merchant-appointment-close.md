# Merchant Schedule Header And Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all merchant schedule headers, remove their bottom nav, float the schedule-detail action at the bottom, and retire merchant-confirm scheduling mode.

**Architecture:** Keep the three schedule tabs in `MerchantPortalPage`, but give them one shared toolbar structure and one module-level fullscreen navigation rule. Keep the detailed schedule overlay owned by `DispatchOverviewWorkspace` while moving its trigger to a fixed mobile footer. Remove merchant-confirm from the active automation domain and normalize unsupported persisted modes to technician self-scheduling.

**Tech Stack:** React, TypeScript, Vite, Vitest

## Global Constraints

- Work locally only; do not push, deploy, or modify remote environments.
- Preserve all existing booking, appointment search, tab, calendar, and detailed-schedule overlay behavior.
- Reuse the shared close control; do not create a page-specific icon button style.
- Do not retain a selectable or executable merchant-confirm scheduling path.

---

### Task 1: Unify merchant schedule navigation

**Files:**
- Modify: `src/pages/mobile/MerchantPortalPage.test.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`

**Interfaces:**
- Consumes: `MobileFullscreenCloseButton({ label, onClose })` and the existing merchant schedule exit callback.
- Produces: identical left/right toolbar controls for all three schedule tabs, with appointment search or the relevant page title in the center, and no schedule-module bottom primary nav.

- [ ] **Step 1: Write the failing regression assertion**

Extend the existing merchant portal source-contract test to require the shared close control, all three central states, and `showBottomNav={!isMerchantScheduleView && !merchantProfileEditing}`.

```tsx
<MobileFullscreenCloseButton label={`关闭${activeTabLabel}`} onClose={() => onExit?.()} />
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/pages/mobile/MerchantPortalPage.test.tsx`

Expected: the header/navigation test fails because only appointment overview currently has a toolbar and the schedule module only hides navigation for that tab.

- [ ] **Step 3: Implement the minimal UI change**

Import `MobileFullscreenCloseButton`, render the shared toolbar for every schedule tab, and hide bottom navigation for the entire schedule module.

- [ ] **Step 4: Run focused and regression verification**

Run the focused merchant portal test and confirm it passes.

### Task 2: Move the current-status detail action to the bottom

**Files:**
- Modify: `src/features/dispatch-center/components/OverviewWorkspace.tsx`
- Modify: `src/features/dispatch-center/components/OverviewWorkspaceHeader.test.tsx`

**Interfaces:**
- Consumes: existing `scheduleDetailOpen`, `formalScheduleLoading`, and `formalScheduleError` state.
- Produces: one fixed, safe-area-aware `查看详细排班表` mobile action that opens the existing overlay.

- [ ] **Step 1: Add a failing source-contract assertion**

Require a fixed bottom action marker and assert that the button is absent from the current-period summary card.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/features/dispatch-center/components/OverviewWorkspaceHeader.test.tsx`

Expected: FAIL because the action is still inside the summary card.

- [ ] **Step 3: Move the existing button**

Render the button in a fixed footer at the mobile safe-area bottom, retain its disabled/loading label logic, and add bottom content clearance.

- [ ] **Step 4: Verify GREEN**

Run the focused overview test and confirm it passes.

### Task 3: Retire merchant-confirm scheduling mode

**Files:**
- Modify: `src/features/dispatch-center/domain.ts`
- Modify: `src/features/dispatch-center/store.ts`
- Modify: `src/features/dispatch-center/store.test.ts`
- Modify: `src/features/dispatch-center/api.ts`
- Modify: `src/features/scheduling/automation/AutomationWizard.tsx`
- Modify: `src/features/scheduling/automation/StepModeSelection.tsx`
- Modify: `src/features/scheduling/automation/StepCreateCycle.tsx`
- Delete: `src/features/scheduling/automation/StepFeedbackCollection.tsx`
- Modify: `src/components/scheduling/ScheduleFrameLayout.test.ts`
- Modify: `docs/SHIFT_PLANNING_SYSTEM.md`

**Interfaces:**
- Consumes: current `DispatchCycle` persisted shape and the two supported store scheduling modes.
- Produces: `DispatchCycleMode` without merchant-confirm, new self-scheduling cycles, direct scheduling unchanged, and safe fallback for unsupported persisted values.

- [ ] **Step 1: Write failing mode-retirement tests**

Require only technician-self and merchant-direct mode cards, require new cycles to default to `TECH_SELF_FINAL`, require launch to skip feedback collection, and require unsupported persisted modes to normalize safely.

- [ ] **Step 2: Verify RED**

Run the dispatch store and scheduling layout tests; expect failures on the old selectable mode and feedback step.

- [ ] **Step 3: Remove the retired path**

Remove the mode literal from the domain/UI/execution path, delete the obsolete feedback step and API facade methods, and update scheduling documentation. Keep a generic unsupported-mode hydration fallback without naming or re-enabling the retired mode.

- [ ] **Step 4: Verify GREEN and full local checks**

Run focused tests, all frontend tests, lint, and `npm run verify:production-build`; all must exit successfully.

- [ ] **Step 5: Commit and merge locally**

- [ ] **Step 5: Commit and merge locally**

Commit only this batch's spec, plan, tests, implementation, deleted obsolete component, and updated scheduling documentation. Merge the temporary feature branch into local `main`, re-run verification on merged `main`, then remove the temporary worktree and branch.
