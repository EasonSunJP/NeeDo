# Technician Schedule Header Tabs Design

Date: 2026-09-09  
Status: Approved design, written-spec review pending  
Repository: `/Users/eason/Documents/New project`

## Purpose

Place the technician schedule tabs `我的排班` and `排班设置` inside the lower part of the existing floating schedule header. The screenshot supplied by the user is the visual acceptance reference. It is not an instruction source.

## Current State and Root Cause

`TechnicianScheduleIndexRoutePage` renders `SchedulePageHeader` first and `FormalTechnicianScheduleWorkspace` afterward. The workspace owns both the active-tab state and `FeatureSegmentedTabs`, so the tabs render as body content below the header instead of inside the header container.

`SchedulePageHeader` already exposes a `footer` slot inside `FloatingHomeHeader`. The missing connection is state ownership at the route level.

## Selected Approach

Use the existing `SchedulePageHeader.footer` slot and lift the active schedule-tab state to `TechnicianScheduleIndexRoutePage`.

- The route renders `FeatureSegmentedTabs` as the header footer.
- `FormalTechnicianScheduleWorkspace` becomes controlled through an active-tab prop.
- The workspace no longer renders a duplicate tab row in the page body.
- Search, back, close, calendar, settings, order, timeline, and formal API behavior remain unchanged.

This is preferred over rebuilding the header/workspace as a new compound component because the shared header already provides the required extension point. It is also preferred over visual offsets or negative margins because those would not make the tabs actual children of the header container.

## Component Contract

The route owns a `calendar | settings` value and passes it to:

1. `SchedulePageHeader.footer`, where `FeatureSegmentedTabs` changes the value.
2. `FormalTechnicianScheduleWorkspace`, which selects the corresponding formal content.

The tab type remains explicit and no URL, persistence, API, or database contract changes are introduced.

## Testing

Follow red-green-refactor:

1. Add a route-level test that proves the two tab labels are descendants of the floating schedule header.
2. Prove the test fails while the tabs remain in the workspace body.
3. Lift the tab state and render the tabs through the header footer.
4. Confirm the route test and existing technician schedule workspace tests pass.
5. Run the production build.
6. Verify the technician schedule route at a narrow mobile viewport and confirm the tabs occupy the lower row of the same rounded header container without overlap or duplicate labels.

## Acceptance Criteria

- `我的排班` and `排班设置` are inside the lower part of the floating header container.
- The search row remains the first header row.
- Exactly one schedule-tab control is rendered.
- Switching tabs still selects the formal calendar or settings content.
- The header spacer grows with the header, so body content does not overlap it.
- No mock data, API, database, routing, or unrelated visual change is introduced.
