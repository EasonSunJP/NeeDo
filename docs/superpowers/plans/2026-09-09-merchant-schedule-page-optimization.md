# Merchant Schedule Page Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a compact merchant schedule home, reuse the existing next-cycle board and builder flow, and standardize mobile scheduling actions without changing schedule semantics.

**Architecture:** `AutomationWizard` becomes a three-view controller. A focused overview component projects existing cycle/feedback data into the requested home UI, while the current board and step components remain the execution surfaces. A shared mobile action-frame contract removes the large dock and provides consistent safe-area spacing.

**Tech Stack:** React 19, TypeScript strict mode, Vitest/jsdom, Tailwind utility classes, existing NeeDo dispatch-center store and i18n dictionary.

## Global Constraints

- Work only on `codex/merchant-schedule-page-optimization`; do not push or deploy.
- Do not start, stop, inspect, or modify the service on port 5180.
- Do not change availability visuals, multi-technician schedule rendering, collision algorithms, permissions, or restore the retired merchant-confirm mode.
- Both current modes use the existing feedback state: technician self-scheduling tracks completed next-cycle schedules; store scheduling tracks confirmations and leave/change requests.
- Do not add browser mocks, fake APIs, schema changes, or migrations.
- Use existing schedule components, spacing variables, safe-area variables, and translation infrastructure.

---

### Task 1: Lock the schedule-home behavior with failing tests

**Files:**
- Create: `src/features/scheduling/automation/AutomationWizard.test.tsx`
- Modify: `src/features/scheduling/automation/MerchantConfirmModeRetirement.test.ts`

**Interfaces:**
- Consumes: `AutomationWizard({ operatorId, storeId, surface, technicians? })` and the existing dispatch-center state.
- Produces: regression coverage for home, confirmation, builder, feedback filters, and retired-mode boundaries.

- [ ] **Step 1: Write tests that render the mobile wizard home and assert full next-cycle range, four lifecycle labels, status/mode, deadline, four feedback filters, and two bottom actions.**
- [ ] **Step 2: Run the focused test and verify it fails because the current wizard still renders cycle tabs/workflow directly.**
- [ ] **Step 3: Add tests that click feedback filters, open the existing confirmation board, and enter the builder without a duplicate next-cycle entry.**
- [ ] **Step 4: Run the focused test and verify the new interaction expectations fail for the intended missing UI.**

Run: `npm test -- src/features/scheduling/automation/AutomationWizard.test.tsx src/features/scheduling/automation/MerchantConfirmModeRetirement.test.ts`

Expected before implementation: failures naming the missing schedule-home labels or actions.

### Task 2: Add the read-only feedback projection and schedule home

**Files:**
- Modify: `src/features/dispatch-center/store.ts`
- Create: `src/features/scheduling/automation/SchedulePlanningOverview.tsx`
- Modify: `src/features/scheduling/automation/AutomationWizard.tsx`
- Modify: `src/pages/mobile/MerchantPortalPage.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: existing `DispatchCycle`, `DispatchFeedbackEntry`, `sendDispatchFeedbackReminder`, `closeDispatchFeedback`, `ScheduleCycleBoard`, and formal `Technician[]` passed by `MerchantPortalPage`.
- Produces: `getPlanningFeedbackRowsForCycle(cycleId)` and a home component with `onOpenConfirmation` and `onOpenBuilder` callbacks.

- [ ] **Step 1: Add failing store tests proving both current modes enter feedback collection without restoring the old availability-range negotiation.**
- [ ] **Step 2: Update cycle launch so both modes enter existing feedback collection; store mode materializes draft shift rows without publishing bookable slots before finalization.**
- [ ] **Step 3: Add a typed store selector that aggregates technician feedback without mutating state.**
- [ ] **Step 4: Implement `SchedulePlanningOverview` with mode-specific feedback meaning, selectable statistics, compact cards/empty states, guarded reminder, confirmed early close, and direct mobile floating actions.**
- [ ] **Step 5: Refactor `AutomationWizard` to initial `home`, `confirmation`, and `builder` views; remove the next/builder cycle tabs from the builder UI.**
- [ ] **Step 6: Pass the already-loaded formal store technicians from `MerchantPortalPage` and add five-language entries for new visible copy.**
- [ ] **Step 7: Run the focused tests and verify they pass.**

Run: `npm test -- src/features/scheduling/automation/AutomationWizard.test.tsx src/features/scheduling/automation/MerchantConfirmModeRetirement.test.ts`

Expected after implementation: both files pass with no warnings.

### Task 3: Standardize lightweight floating actions across steps

**Files:**
- Modify: `src/features/scheduling/automation/StepModeSelection.test.tsx`
- Modify: `src/components/scheduling/ScheduleFrameLayout.test.ts`
- Modify: `src/features/scheduling/automation/StepModeSelection.tsx`
- Modify: `src/features/scheduling/automation/StepCreateCycle.tsx`
- Modify: `src/features/scheduling/automation/StepFinalConfirmation.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing bottom-navigation max-width, inline-gap, action-offset, button variants, and safe-area values.
- Produces: `data-schedule-wizard-bottom-actions="true"` and `schedule-wizard-floating-actions` on every mobile scheduling step.

- [ ] **Step 1: Update layout tests to require the shared direct frame on mode, rule, and final steps and reject `schedule-wizard-action-dock`.**
- [ ] **Step 2: Run the focused tests and verify they fail on the current heavy dock/sticky rule actions/header final actions.**
- [ ] **Step 3: Apply the shared fixed mobile action frame, remove the heavy nested dock, and reserve content bottom padding without fixed-height spacers.**
- [ ] **Step 4: Remove obsolete heavy-dock CSS and define button alignment only for the lightweight frame.**
- [ ] **Step 5: Run focused layout and component tests until green.**

Run: `npm test -- src/features/scheduling/automation/StepModeSelection.test.tsx src/components/scheduling/ScheduleFrameLayout.test.ts`

Expected after implementation: all schedule action-frame assertions pass.

### Task 4: Verify the full local result and integrate locally

**Files:**
- Verify all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: the completed implementation and existing repository scripts.
- Produces: a committed feature branch, locally merged `main`, post-merge evidence, and safe cleanup where ownership is proven.

- [ ] **Step 1: Run all focused scheduling tests, TypeScript/lint, build, i18n audit, and `git diff --check`.**
- [ ] **Step 2: Start only the task frontend on an available port other than 5180 and browser-check `/merchant/schedule?tab=planning` at a mobile viewport without touching the existing 5180 service.**
- [ ] **Step 3: Commit the feature branch after confirming no unrelated or generated files are staged.**
- [ ] **Step 4: Merge into local `main` only through a method that leaves the protected 5180 worktree files and service unchanged; otherwise stop and report the exact safety blocker.**
- [ ] **Step 5: Re-run focused tests, lint/typecheck, and build from the merged `main` revision in an isolated validation worktree.**
- [ ] **Step 6: Remove only the branch/worktree proven merged and disposable; preserve every unrelated dirty or host-owned worktree.**

Run: `npm test -- src/features/scheduling/automation/AutomationWizard.test.tsx src/features/scheduling/automation/StepModeSelection.test.tsx src/features/scheduling/automation/MerchantConfirmModeRetirement.test.ts src/components/scheduling/ScheduleFrameLayout.test.ts src/components/scheduling/SchedulingCycleTabs.test.tsx && npm run lint && npm run build && npm run i18n:audit && git diff --check`

Expected: exit code 0 for every command; browser evidence is reported separately from automated checks.
