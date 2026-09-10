# Technician Schedule Header Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `我的排班` and `排班设置` as the lower row of the technician schedule floating header, using the same 12px inter-row gap as comparable floating headers, without changing formal schedule behavior.

**Architecture:** `TechnicianScheduleIndexRoutePage` becomes the single owner of the `calendar | settings` selection. It renders `FeatureSegmentedTabs` through the existing `SchedulePageHeader.footer` slot and passes the selected value to the formal workspace, which renders content only.

**Tech Stack:** React 19, TypeScript, React Router, Vitest/jsdom, Tailwind utility classes.

## Global Constraints

- Preserve the existing React/TSX/Vite stack and formal API-backed schedule data.
- Do not introduce mock data, local persistence, API, database, route, or unrelated visual changes.
- Keep the search row first and render exactly one schedule-tab control inside the existing floating header.
- Verify at a narrow mobile viewport after automated tests and build pass.

---

### Task 1: Move the technician schedule tabs into the header footer

**Files:**
- Modify: `src/features/technician-schedule/route-pages.formal.test.tsx`
- Modify: `src/features/technician-schedule/FormalTechnicianScheduleWorkspace.test.tsx`
- Modify: `src/features/technician-schedule/route-pages.approved-ui.test.ts`
- Modify: `src/features/technician-schedule/route-pages.tsx`
- Modify: `src/features/technician-schedule/FormalTechnicianScheduleWorkspace.tsx`
- Modify: `src/components/scheduling/SchedulePageHeader.tsx`
- Modify: `src/components/scheduling/SchedulePageHeader.test.tsx`

**Interfaces:**
- Consumes: `SchedulePageHeader.footer: ReactNode` and `FeatureSegmentedTabs<WorkspaceTab>`.
- Produces: `WorkspaceTab = "calendar" | "settings"` and `FormalTechnicianScheduleWorkspace({ tab, ...existingProps })`.

- [x] **Step 1: Write the failing route-level layout test**

Update the workspace mock so its selected tab is observable:

```tsx
FormalTechnicianScheduleWorkspace: ({ tab, profileName, shopName, ...props }) => (
  <section data-active-tab={tab} data-testid="formal-technician-schedule-workspace">
    {profileName}:{shopName}
  </section>
)
```

Add assertions to the index-route test:

```tsx
const header = container.querySelector(".client-floating-header-host");
expect(header).not.toBeNull();
expect(Array.from(header?.querySelectorAll("button") ?? []).map((button) => button.textContent?.trim()))
  .toEqual(expect.arrayContaining(["我的排班", "排班设置"]));
expect(container.querySelectorAll(".client-feature-segmented-tabs")).toHaveLength(1);

await click("排班设置");
expect(container.querySelector('[data-testid="formal-technician-schedule-workspace"]')?.getAttribute("data-active-tab"))
  .toBe("settings");
```

Update the approved-source guard to require `FeatureSegmentedTabs` in the route and not in the workspace.
Add a header test that rejects a second `mt-3` margin on the footer wrapper, because `FloatingHomeHeader` already supplies the shared `gap-3` spacing.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/features/technician-schedule/route-pages.formal.test.tsx src/features/technician-schedule/route-pages.approved-ui.test.ts
```

Expected: FAIL because the route does not render the tabs inside `.client-floating-header-host`, and the workspace mock receives no controlled `tab` value.

- [x] **Step 3: Implement the minimal controlled-tab wiring**

In `FormalTechnicianScheduleWorkspace.tsx`, export the tab type, remove the local tab state and body-level `FeatureSegmentedTabs`, and accept the selected value:

```tsx
export type WorkspaceTab = "calendar" | "settings";

export function FormalTechnicianScheduleWorkspace({
  tab,
  // existing props
}: {
  tab: WorkspaceTab;
  // existing props
}) {
  // existing content branching remains unchanged
}
```

In `TechnicianScheduleIndexRoutePage`, own the state and use the existing header footer:

```tsx
const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("calendar");

<SchedulePageHeader
  footer={(
    <FeatureSegmentedTabs
      items={[
        { label: "我的排班", value: "calendar" },
        { label: "排班设置", value: "settings" }
      ]}
      onChange={setWorkspaceTab}
      value={workspaceTab}
      variant="header"
    />
  )}
  // existing props
/>

<FormalTechnicianScheduleWorkspace
  tab={workspaceTab}
  // existing props
/>
```

Adjust isolated workspace tests to pass `tab="calendar"` initially and rerender with `tab="settings"` where settings content is asserted.
Remove the redundant `mt-3` from the `SchedulePageHeader` footer wrapper so the shared parent `gap-3` remains the single source of spacing.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/technician-schedule/route-pages.formal.test.tsx src/features/technician-schedule/FormalTechnicianScheduleWorkspace.test.tsx src/features/technician-schedule/route-pages.approved-ui.test.ts src/components/scheduling/SchedulePageHeader.test.tsx
```

Expected: all selected test files pass with zero failures.

- [ ] **Step 5: Run production verification**

Run:

```bash
npm run verify:production-build
```

Expected: TypeScript, Vite production build, and production bundle audit all exit successfully.

- [ ] **Step 6: Perform narrow mobile browser acceptance**

Open `/technician/schedule` in a 440x956-class viewport using the authenticated local technician session. Confirm the search row is first, the two tabs are inside the same rounded floating header, body content starts below it, switching to `排班设置` changes the formal workspace, and no duplicate tab row or console error appears.

- [ ] **Step 7: Commit the implementation on main**

```bash
git add src/features/technician-schedule/route-pages.formal.test.tsx \
  src/features/technician-schedule/FormalTechnicianScheduleWorkspace.test.tsx \
  src/features/technician-schedule/route-pages.approved-ui.test.ts \
  src/features/technician-schedule/route-pages.tsx \
  src/features/technician-schedule/FormalTechnicianScheduleWorkspace.tsx \
  docs/superpowers/plans/2026-09-09-technician-schedule-header-tabs.md
git commit -m "fix: place technician schedule tabs in header"
```

Expected: a focused commit on `main`; no merge commit is necessary because the authorized implementation runs directly on `main`.
