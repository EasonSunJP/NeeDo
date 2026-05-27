import { describe, expect, it } from "vitest";
import scheduleCycleBoardSource from "./ScheduleCycleBoard.tsx?raw";
import cycleBoardSource from "./ScheduleCycleCalendarBoard.tsx?raw";
import scheduleGridSource from "../../features/dispatch-center/components/ScheduleGrid.tsx?raw";
import scheduleSearchFieldSource from "./ScheduleSearchField.tsx?raw";
import unifiedCalendarSource from "./UnifiedUserCalendar.tsx?raw";
import technicianPortalSource from "../../pages/mobile/TechnicianPortalPage.tsx?raw";

describe("shared schedule frame layout", () => {
  it("does not draw an outer frame around cycle calendar boards", () => {
    expect(cycleBoardSource).toContain('data-schedule-cycle-calendar-board="true"');
    expect(cycleBoardSource).toContain("<UnifiedCalendarSurface");
    expect(cycleBoardSource).not.toContain("rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-3 shadow-[var(--client-shadow)]");
  });

  it("uses the same frameless calendar surface for user schedules and cycle schedules", () => {
    expect(unifiedCalendarSource).toContain("export function UnifiedCalendarSurface");
    expect(unifiedCalendarSource).toContain('data-unified-user-calendar="true"');
    expect(unifiedCalendarSource).toContain("<UnifiedCalendarSurface");
    expect(cycleBoardSource).toContain("UnifiedCalendarSurface");
    expect(cycleBoardSource).toContain('data-schedule-cycle-calendar-board="true"');
    expect(unifiedCalendarSource).not.toContain("const schedulePanelClass");
    expect(unifiedCalendarSource).not.toContain("rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] shadow-[var(--client-shadow)]");
    expect(unifiedCalendarSource).not.toContain('className={cn(themeRootClassName, schedulePanelClass, "relative overflow-visible p-3")}');
  });

  it("does not apply page theme background classes to the user calendar table itself", () => {
    expect(unifiedCalendarSource).toContain('<UnifiedCalendarSurface data-unified-user-calendar="true">');
    expect(unifiedCalendarSource).not.toContain("themeRootClassName");
    expect(unifiedCalendarSource).not.toContain("useClientTheme");
    expect(unifiedCalendarSource).not.toContain("getClientThemeClassName");
  });

  it("does not render the standalone schedule detail title frame", () => {
    expect(scheduleCycleBoardSource).toContain("const hasBoardToolbar = Boolean(editingToggle || toolbarActions);");
    expect(scheduleCycleBoardSource).toContain("{hasBoardToolbar ? (");
    expect(scheduleCycleBoardSource).not.toContain('t("排班详细")');
    expect(scheduleCycleBoardSource).not.toContain("rounded-t-[28px] rounded-b-none border border-b-0");
  });

  it("keeps day timelines frameless while preserving left-aligned horizontal overflow", () => {
    expect(unifiedCalendarSource).toContain('data-calendar-day-timeline="true"');
    expect(unifiedCalendarSource).toContain('"overflow-visible rounded-none border-0 bg-transparent"');
    expect(unifiedCalendarSource).toContain('data-calendar-day-timeline-scroll="true"');
    expect(unifiedCalendarSource).toContain('overflow-x-auto overflow-y-visible');
    expect(unifiedCalendarSource).toContain("timelineMinWidth ? { minWidth: timelineMinWidth } : undefined");
    expect(unifiedCalendarSource).not.toContain("overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)]");
  });

  it("does not add local theme backgrounds around the technician schedule calendar", () => {
    expect(technicianPortalSource).toContain("<ScheduleSearchField");
    expect(technicianPortalSource).toContain("<UnifiedUserCalendar currentTechnician={baseTech}");
    expect(technicianPortalSource).not.toContain("scheduleThemeRootClass");
  });

  it("keeps the shared day timeline time rail transparent", () => {
    expect(unifiedCalendarSource).toContain('data-calendar-time-corner="true"');
    expect(unifiedCalendarSource).toContain('data-calendar-time-column="true"');
    expect(unifiedCalendarSource).toContain('"sticky left-0 z-[12] border-r border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-transparent shadow-none"');
    expect(unifiedCalendarSource).not.toContain("bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,transparent)] shadow-[12px_0_18px_rgba(0,0,0,0.10)]");
  });

  it("uses the shared floating header search contract with a right search action", () => {
    expect(scheduleSearchFieldSource).toContain("floatingHeaderSearchRowClassName");
    expect(scheduleSearchFieldSource).toContain("floatingHeaderSearchFieldClassName");
    expect(scheduleSearchFieldSource).toContain("floatingHeaderSearchActionClassName");
    expect(scheduleSearchFieldSource).toContain('data-schedule-search-submit="true"');
    expect(scheduleSearchFieldSource).toContain('type="submit"');
    expect(scheduleSearchFieldSource).toContain("aria-label={submitLabel}");
  });

  it("removes the mobile ScheduleGrid outer frame without removing desktop surfaces", () => {
    expect(scheduleGridSource).toContain('const wrapperFrameClass = isMobileSurface ? "" : "border";');
    expect(scheduleGridSource).toContain('className={cn("relative isolate overflow-visible", wrapperFrameClass, wrapperClass, className)}');
    expect(scheduleGridSource).toContain("{!isMobileSurface ? (");
    expect(scheduleGridSource).toContain('className="pointer-events-none absolute inset-y-0 -left-px z-[95] w-[2px]"');
    expect(scheduleGridSource).toContain(") : null}");
  });
});
