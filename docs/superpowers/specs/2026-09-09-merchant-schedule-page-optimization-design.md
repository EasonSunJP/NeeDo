# Merchant Schedule Page Optimization Design

## Goal

Reshape the merchant scheduling tab into a clear three-state flow: a schedule home that explains the next-cycle status, a next-cycle confirmation view that reuses the existing multi-technician board, and a new-cycle editor that reuses the existing automation wizard steps. The change is limited to information architecture, feedback presentation, spacing, and bottom actions.

## Product boundaries

- Keep `ScheduleCycleBoard`, `ScheduleCycleCalendarBoard`, and `ScheduleGrid` as the only multi-technician schedule implementation.
- Do not change availability visuals, calendar event visuals, collision rules, scheduling algorithms, permissions, or the retired merchant-confirm scheduling mode.
- Keep the supported modes `TECH_SELF_FINAL`, `STORE_ASSIGN_FINAL`, and the existing compatibility-only `INDIVIDUAL_SELF_FINAL` behavior.
- Use the current dispatch-center state and actions. Do not add mock APIs, a second cycle state machine, schema changes, or migrations.
- Treat the document's four-step progress as an overview of the scheduling lifecycle. It does not reactivate the removed `StepFeedbackCollection` component.

## Considered approaches

1. **Recommended: one controller with three focused child views.** `AutomationWizard` owns `home`, `confirmation`, and `builder` navigation. A new overview component owns status, feedback filters, technician cards, and feedback actions. Existing board and wizard-step components remain unchanged at their behavioral boundaries. This produces the requested continuity with the smallest state surface.
2. **Route each state separately.** Add URLs for home, confirmation, and builder. This improves deep linking but expands route, navigation, and back-stack scope beyond the requested UI repair.
3. **Keep the existing next/builder cycle tabs and restyle them.** This is the smallest code diff, but it preserves the duplicated "next cycle" concept the request explicitly removes and cannot create a true schedule home.

Approach 1 is selected because it removes the duplicate entry without creating a second scheduling system or widening routing scope.

## Architecture

### Schedule home

`SchedulePlanningOverview` receives the resolved next cycle, store-scoped technicians, and existing callbacks. It renders:

- the complete `YYYY年MM月DD日 ～ YYYY年MM月DD日` range;
- lifecycle progress for mode selection, rule setup, technician feedback, and final confirmation;
- current status and mode badges;
- feedback deadline, reminder, and confirmed early-close interaction;
- four selectable counters: submitted, updated, pending, and exceptions;
- a compact list of technicians for the selected counter; and
- two direct floating actions: next-cycle confirmation and new cycle.

Feedback rows are aggregated from existing `DispatchFeedbackEntry` records. A technician is submitted when any entry has `submittedAt`, updated when any entry has status `updated`, and pending otherwise. The exception view is a diagnostic projection for technicians whose response includes unavailable time or a non-empty note; it does not alter scheduling or conflict rules.

Reminder and early-close actions are enabled only during `collecting_feedback`. Reminder is also disabled when no technicians are pending and is locally guarded after a successful send to avoid duplicate clicks. Early close requires an explicit confirmation before calling the existing state action.

### Confirmation view

The left home action opens a compact context header and the existing `ScheduleCycleBoard`. No grid, availability, event, or scheduling logic is copied or restyled. A back control returns to the schedule home without changing cycle state.

### Builder view

The primary home action opens the existing builder cycle or creates one with `createDispatchCycleDraft`. The builder renders `CycleWorkflowPanel` without `SchedulingCycleTabs`, so the old parallel "next cycle" card is absent. Existing mode selection, rule setup, validation, launch, delete, and final-confirmation behavior remain authoritative.

### Bottom actions and spacing

Mobile step pages share a single direct floating-action frame aligned with the existing bottom-navigation width and safe-area variables. The frame has no large border, filled dock, backdrop blur, or fixed-height plate. Each step reserves only the bottom padding required to keep its final content scrollable above the buttons. Desktop actions remain in normal document flow.

The scheduling surfaces use one section rhythm (`gap-4`), one card rhythm (`gap-3`), and existing safe-area/custom properties. No unrelated container height or global layout is changed.

## Error and empty states

- With no next cycle, the home uses a compact empty state and disables confirmation while keeping new-cycle creation available when the existing cycle limit permits.
- A selected feedback counter with no matching technicians shows a one-line compact empty state.
- Existing state-action error messages remain visible through the wizard's message region.
- An unavailable feedback deadline displays the translated existing `未设置` copy.

## Verification

- Component tests cover the schedule home information, selected feedback filtering, builder entry without the duplicate next-cycle card, confirmation entry through the reused board, feedback action guards, and confirmed early close.
- Source/layout tests cover the shared direct floating action frame on mode, rule, and final-confirmation steps and ensure the heavy dock is no longer used.
- Existing schedule-grid and merchant-confirm-mode retirement tests guard the untouched scheduling behaviors.
- Run focused Vitest, full TypeScript/lint, production build, and a local browser check on an unused non-5180 port.

