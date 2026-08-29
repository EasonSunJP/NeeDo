# Employee Detail Tabs, Calendar, and Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the formal merchant employee detail card into six accessible tabs, add real timeline pagination controls, and render month schedules as a multi-row seven-column calendar.

**Architecture:** Reuse the formal tab implementation already used by operations profile cards, keep every tab panel mounted so edit drafts survive navigation, and keep timeline paging owned by `MerchantAdminPeoplePage`. Reuse `UnifiedCalendarMonthGrid` for the shared schedule board month view so merchant employee schedules and the user frontend have one renderer.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, existing merchant employee API and shared calendar components.

## Global Constraints

- No mock, demo, placeholder, fake API, localStorage business state, or internal database IDs in the employee card.
- Keep the current formal employee profile, affiliation, compensation, payroll policy, and timeline APIs.
- Timeline page sizes are exactly 10, 30, 50, and 100; default is 10.
- Cross-shop locked schedules must remain generic, non-clickable, and free of participant details.
- All new visible copy must use the existing i18n system.

---

### Task 1: Shared accessible detail tabs and employee information architecture

**Files:**
- Modify: `src/components/admin/FormalProfileDetailPanels.tsx`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.tsx`
- Modify: `src/components/merchant-admin/EmployeeCompensationPanel.tsx`
- Create: `src/components/merchant-admin/EmployeeSettlementPanel.tsx`
- Test: `src/components/merchant-admin/EmployeeDetailCard.test.tsx`

**Interfaces:**
- Consumes: existing `resolveFormalTabKeyboardIndex`, employee mutation callbacks, compensation and payroll result payloads.
- Produces: exported `FormalTabs`, `FormalTabPanels`, `EmployeeDetailTab`, and `EmployeeSettlementPanel`.

- [ ] **Step 1: Write failing employee tab tests**

Add assertions that only the default `基础资料` panel is visible, clicking each of `从属与账号`, `员工日程`, `薪酬与分成`, `结算记录`, and `员工动态` reveals the matching panel, and a modified `employee-display-name` input retains its value after switching away and back.

```tsx
expect(button("基础资料").getAttribute("aria-selected")).toBe("true");
expect(container.querySelector('[data-testid="employee-schedule-panel"]')).not.toBeVisible();
await act(async () => button("员工日程").click());
expect(container.querySelector('[data-testid="employee-schedule-panel"]')).toBeVisible();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/merchant-admin/EmployeeDetailCard.test.tsx`

Expected: FAIL because the employee card has no tablist and all panels are visible.

- [ ] **Step 3: Export and reuse the formal tab primitives**

Export the existing generic tab functions and keep their keyboard behavior:

```tsx
export function FormalTabs<TTab extends string>(props: FormalTabsProps<TTab>) { /* existing implementation */ }
export function FormalTabPanels<TTab extends string>(props: FormalTabPanelsProps<TTab>) { /* existing implementation */ }
```

Create employee tab state with this exact order:

```ts
export type EmployeeDetailTab =
  | "基础资料"
  | "从属与账号"
  | "员工日程"
  | "薪酬与分成"
  | "结算记录"
  | "员工动态";
```

Wrap the existing sections in `FormalTabPanels`; do not unmount inactive panels. Split the payroll summary into `EmployeeSettlementPanel`, while `EmployeeCompensationPanel` keeps compensation editing and preview.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/components/merchant-admin/EmployeeDetailCard.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/FormalProfileDetailPanels.tsx src/components/merchant-admin/EmployeeDetailCard.tsx src/components/merchant-admin/EmployeeCompensationPanel.tsx src/components/merchant-admin/EmployeeSettlementPanel.tsx src/components/merchant-admin/EmployeeDetailCard.test.tsx
git commit -m "feat: restore employee detail tabs"
```

### Task 2: Employee timeline server pagination controls

**Files:**
- Create: `src/components/admin/FormalTimelinePagination.tsx`
- Create: `src/components/admin/FormalTimelinePagination.test.tsx`
- Modify: `src/components/merchant-admin/EmployeeDetailCard.tsx`
- Modify: `src/pages/merchant-admin/MerchantAdminPeoplePage.tsx`
- Modify: `src/features/merchant-admin/employeeApi.ts`
- Test: `src/features/merchant-admin/employeeApi.test.ts`
- Test: `src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`

**Interfaces:**
- Consumes: `PaginatedEmployeeTimeline`, `merchantEmployeeApi.timeline(needoId, page, pageSize)`.
- Produces: `FormalTimelinePagination({ page, pageSize, total, onPageChange, onPageSizeChange })` and employee-card pagination callbacks.

- [ ] **Step 1: Write failing API and component tests**

```ts
await merchantEmployeeApi.timeline("NEEDO-S-47", 3, 50);
expect(httpClient.request).toHaveBeenCalledWith(
  "/merchant-admin/employees/NEEDO-S-47/timeline",
  { query: { page: 3, pageSize: 50 } }
);
```

Render `FormalTimelinePagination` with `total={126}`, `page={2}`, `pageSize={30}` and assert that selecting `50` calls `onPageSizeChange(50)` and next calls `onPageChange(3)`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/features/merchant-admin/employeeApi.test.ts src/components/admin/FormalTimelinePagination.test.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts`

Expected: FAIL because pagination controls and page state are absent.

- [ ] **Step 3: Implement timeline pagination state and controls**

Use constants and reset behavior:

```ts
export const formalTimelinePageSizes = [10, 30, 50, 100] as const;
const [employeeTimelinePage, setEmployeeTimelinePage] = useState(1);
const [employeeTimelinePageSize, setEmployeeTimelinePageSize] = useState(10);
```

The request coordinator key must include employee ID, page, and page size or use a dedicated `loadEmployeeTimeline(needoId, page, pageSize)` callback guarded by an incrementing request ID. Page-size change sets page 1 before loading. Comment submission sets page 1 and reloads page 1.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/features/merchant-admin/employeeApi.test.ts src/components/admin/FormalTimelinePagination.test.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts src/components/merchant-admin/EmployeeDetailCard.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/FormalTimelinePagination.tsx src/components/admin/FormalTimelinePagination.test.tsx src/components/merchant-admin/EmployeeDetailCard.tsx src/pages/merchant-admin/MerchantAdminPeoplePage.tsx src/features/merchant-admin/employeeApi.ts src/features/merchant-admin/employeeApi.test.ts src/pages/merchant-admin/MerchantAdminPeoplePage.test.ts
git commit -m "feat: paginate employee activity timeline"
```

### Task 3: Shared multi-row month calendar

**Files:**
- Modify: `src/components/scheduling/ScheduleCycleCalendarBoard.tsx`
- Modify: `src/components/scheduling/ScheduleFrameLayout.test.ts`
- Modify: `src/components/merchant-admin/EmployeeSchedulePanel.test.tsx`

**Interfaces:**
- Consumes: `UnifiedCalendarMonthGrid`, `period.dates`, `groupedEvents`, and `openDateInDayView`.
- Produces: month rendering with seven columns and 35/42 date cells.

- [ ] **Step 1: Write failing month renderer tests**

Assert that the shared board source imports and renders `UnifiedCalendarMonthGrid` for `view === "month"`, while `ScheduleGrid` is limited to three-day/week period views. Extend the employee schedule test mock to assert `view="month"` leads to a month-grid marker.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/components/scheduling/ScheduleFrameLayout.test.ts src/components/merchant-admin/EmployeeSchedulePanel.test.tsx`

Expected: FAIL because month still uses the horizontal period grid.

- [ ] **Step 3: Reuse the frontend month grid**

Import `UnifiedCalendarMonthGrid` and change the render branch:

```tsx
view === "threeDay" || view === "week" ? <ScheduleGrid ... />
  : view === "month" ? (
    <UnifiedCalendarMonthGrid
      anchorDate={dateKey}
      dates={period.dates}
      eventsByDate={groupedEvents}
      onOpen={openEvent}
      onSelectDate={openDateInDayView}
      selectedDate={dateKey}
    />
  ) : <UnifiedCalendarAgendaView ... />
```

- [ ] **Step 4: Run focused and calendar regression tests**

Run: `npm test -- src/components/scheduling/ScheduleFrameLayout.test.ts src/components/scheduling/UnifiedUserCalendar.formal.test.tsx src/components/merchant-admin/EmployeeSchedulePanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/scheduling/ScheduleCycleCalendarBoard.tsx src/components/scheduling/ScheduleFrameLayout.test.ts src/components/merchant-admin/EmployeeSchedulePanel.test.tsx
git commit -m "fix: render schedule months as weekly rows"
```

