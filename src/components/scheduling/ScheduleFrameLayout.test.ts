import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import scheduleCycleBoardSource from "./ScheduleCycleBoard.tsx?raw";
import cycleBoardSource from "./ScheduleCycleCalendarBoard.tsx?raw";
import scheduleGridSource from "../../features/dispatch-center/components/ScheduleGrid.tsx?raw";
import stepModeSelectionSource from "../../features/scheduling/automation/StepModeSelection.tsx?raw";
import stepCreateCycleSource from "../../features/scheduling/automation/StepCreateCycle.tsx?raw";
import stepFinalConfirmationSource from "../../features/scheduling/automation/StepFinalConfirmation.tsx?raw";
import floatingActionsSource from "../../features/scheduling/automation/ScheduleFloatingActions.tsx?raw";
import scheduleSearchFieldSource from "./ScheduleSearchField.tsx?raw";
import unifiedCalendarSource from "./UnifiedUserCalendar.tsx?raw";
import technicianScheduleSource from "../../features/technician-schedule/FormalTechnicianScheduleWorkspace.tsx?raw";
const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

describe("shared schedule frame layout", () => {
  it("does not draw an outer frame around cycle calendar boards", () => {
    expect(cycleBoardSource).toContain('data-schedule-cycle-calendar-board="true"');
    expect(cycleBoardSource).toContain("<UnifiedCalendarSurface");
    expect(cycleBoardSource).not.toContain("rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-3 shadow-[var(--client-shadow)]");
  });

  it("uses the themed schedule view menu instead of a native select popup", () => {
    expect(cycleBoardSource).toContain("<ScheduleViewPicker");
    expect(cycleBoardSource).not.toContain('<select\n            aria-label="切换排班展示范围"');
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

  it("switches cycle calendar date picks back to day view", () => {
    expect(cycleBoardSource).toContain("const openDateInDayView = (nextDateKey: string) => {");
    expect(cycleBoardSource).toContain('onViewChange("day");');
    expect(cycleBoardSource).toContain("onSelectDate={openDateInDayView}");
    expect(cycleBoardSource).not.toContain("renderSelectedDateList");
  });

  it("renders merchant cycle multi-day views as technician rows by date columns", () => {
    expect(cycleBoardSource).toContain("function buildCyclePeriodGridData(");
    expect(cycleBoardSource).toContain("<ScheduleGrid");
    expect(cycleBoardSource).toContain('stickyHeaderLabel="技师"');
    expect(cycleBoardSource).toContain('view === "threeDay" || view === "week"');
    expect(cycleBoardSource).toContain('view === "month"');
    expect(cycleBoardSource).toContain("<UnifiedCalendarMonthGrid");
  });

  it("lets employee schedules opt into the shared multi-day timeline", () => {
    expect(cycleBoardSource).toContain('periodViewVariant = "grid"');
    expect(cycleBoardSource).toContain('periodViewVariant === "timeline"');
    expect(cycleBoardSource).toContain("<UnifiedCalendarMultiDayTimeline");
  });

  it("lets a formal merchant adapter provide the cycle window and matching day grids", () => {
    expect(cycleBoardSource).toContain("dataOverride?.cycle");
    expect(cycleBoardSource).toContain("formalGridByDate");
    expect(cycleBoardSource).toContain("period.dates.map((date)");
  });

  it("keeps merchant matrix technician headers as square avatar plus name buttons", () => {
    expect(cycleBoardSource).toContain("function CyclePeriodTechnicianHeader(");
    expect(cycleBoardSource).toContain('shape="roundedSquare"');
    expect(cycleBoardSource).toContain("查看${row.technicianName}详情");
    expect(cycleBoardSource).toContain("renderRowHeader={(row, context) => (");
  });

  it("uses the new schedule-table tone system for merchant period summary cells", () => {
    expect(scheduleGridSource).toContain('periodCellVariant = "tone"');
    expect(scheduleGridSource).toContain("function renderCalendarSummaryPeriodCell(");
    expect(scheduleGridSource).toContain("getScheduleToneStyle(getPeriodSummaryTone(range))");
    expect(cycleBoardSource).toContain('periodCellVariant="calendarSummary"');
  });

  it("keeps cycle multi-day headers framed while removing the period-cell fill", () => {
    expect(scheduleGridSource).toContain("const usesCalendarSummaryPeriodGrid = isPeriodGrid && periodCellVariant === \"calendarSummary\";");
    expect(scheduleGridSource).toContain("const calendarSummarySurfaceBackground = isMobileSurface && usesCalendarSummaryPeriodGrid ? \"transparent\" : null;");
    expect(scheduleGridSource).toContain("framedPeriodHeader ? \"px-1.5 py-2 shadow-none\"");
    expect(scheduleGridSource).toContain("\"overflow-hidden border-b border-r border-line text-center\"");
    expect(scheduleGridSource).toContain("rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,transparent)]");
    expect(scheduleGridSource).toContain("bg-transparent text-[color:var(--client-text)] hover:bg-[color:color-mix(in_srgb,var(--client-primary-soft)_14%,transparent)]");
  });

  it("defaults the mobile period technician list to avatar-only and stretches the three-day columns", () => {
    expect(scheduleCycleBoardSource).toContain("scheduleStickyTop,");
    expect(scheduleCycleBoardSource).toContain("scheduleStickyTop={scheduleStickyTop}");
    expect(cycleBoardSource).toContain("const [periodTechniciansCollapsed, setPeriodTechniciansCollapsed] = useState(true);");
    expect(cycleBoardSource).toContain("collapsedTechnicians={periodTechniciansCollapsed}");
    expect(cycleBoardSource).toContain("onToggleCollapsed={() => setPeriodTechniciansCollapsed((current) => !current)}");
    expect(cycleBoardSource).toContain("stickyTop={scheduleStickyTop}");
    expect(scheduleGridSource).toContain("const stretchPeriodColumnsToViewport = isMobileSurface && usesCalendarSummaryPeriodGrid;");
    expect(scheduleGridSource).toContain("const columnWidth = isPeriodGrid ? (stretchPeriodColumnsToViewport ? `minmax(${dataColumnWidthPx}px, 1fr)` : `${dataColumnWidthPx}px`) : \"minmax(58px,1fr)\";");
    expect(scheduleGridSource).toContain("floatingHeaderControlButtonClassName");
    expect(scheduleGridSource).toContain('cn(floatingHeaderControlButtonClassName, "h-11 w-11 p-2 text-[color:var(--client-primary)]")');
    expect(scheduleGridSource).toContain("!collapsedTechnicians && !(isMobileSurface && onToggleCollapsed)");
  });

  it("keeps mode-card info triggers outside selection buttons", () => {
    const modeCardButtonBlock = stepModeSelectionSource.match(/<button[\s\S]*?cardClass[\s\S]*?<\/button>/)?.[0] ?? "";

    expect(modeCardButtonBlock).not.toContain("<InfoTooltipTrigger");
    expect(stepModeSelectionSource).toContain("<InfoTooltipTrigger");
  });

  it("uses one lightweight safe-area action frame on every mobile scheduling step", () => {
    [stepModeSelectionSource, stepCreateCycleSource, stepFinalConfirmationSource].forEach((source) => {
      expect(source).toContain("<ScheduleFloatingActions");
      expect(source).not.toContain("schedule-wizard-action-dock");
    });
    expect(floatingActionsSource).toContain('data-schedule-wizard-bottom-actions="true"');
    expect(floatingActionsSource).toContain("schedule-wizard-floating-actions");
    expect(floatingActionsSource).toContain('maxWidth: "var(--client-bottom-nav-max-width, 880px)"');
    expect(stylesSource).toContain(".client-shell .schedule-wizard-floating-frame {\n  bottom: 0 !important;");
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
    expect(technicianScheduleSource).toContain('data-testid="formal-technician-schedule-workspace"');
    expect(technicianScheduleSource).toContain("<UnifiedUserCalendar");
    expect(technicianScheduleSource).toContain('displayMode="personal"');
    expect(technicianScheduleSource).toContain("formalOnly");
    expect(technicianScheduleSource).toContain("showSourceDrawer");
    expect(technicianScheduleSource).not.toContain("function DayTimeline");
    expect(technicianScheduleSource).not.toContain("scheduleThemeRootClass");
  });

  it("keeps the shared day timeline time rail transparent", () => {
    expect(unifiedCalendarSource).toContain('data-calendar-time-corner="true"');
    expect(unifiedCalendarSource).toContain('data-calendar-time-column="true"');
    expect(unifiedCalendarSource).toContain('"sticky left-0 z-[12] shrink-0 border-r border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-transparent shadow-none"');
    expect(unifiedCalendarSource).not.toContain("bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,transparent)] shadow-[12px_0_18px_rgba(0,0,0,0.10)]");
  });

  it("opens cycle calendar appointment details through the merchant order detail route", () => {
    expect(cycleBoardSource).toContain("getScheduleOrderDetailRoute");
    expect(cycleBoardSource).toContain("const appointmentDetailId = event.detailTargetId ?? event.orderId;");
    expect(cycleBoardSource).toContain('navigate(getScheduleOrderDetailRoute(appointmentDetailId, "merchant"));');
    expect(cycleBoardSource).not.toContain('navigate(`/merchant/schedule/arrangements/${encodeURIComponent(event.orderId)}`)');
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
