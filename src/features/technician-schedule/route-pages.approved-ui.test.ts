import { describe, expect, it } from "vitest";
import unifiedCalendarSource from "../../components/scheduling/UnifiedUserCalendar.tsx?raw";
import schedulingWindowLoaderSource from "../scheduling/window-loader.ts?raw";
import routeSource from "./route-pages.tsx?raw";
import workspaceSource from "./FormalTechnicianScheduleWorkspace.tsx?raw";

describe("approved formal technician schedule UI", () => {
  it("reuses the shared user and merchant calendar system for every technician view", () => {
    expect(workspaceSource).toContain("<UnifiedUserCalendar");
    expect(workspaceSource).toContain('displayMode="personal"');
    expect(workspaceSource).toContain("formalOnly");
    expect(workspaceSource).toContain("showSourceDrawer");
    expect(workspaceSource).not.toContain("function DayTimeline");
    expect(workspaceSource).not.toContain("function WeekCalendar");
    expect(workspaceSource).not.toContain("function MonthCalendar");
  });

  it("uses the restored mobile shell and full calendar surfaces", () => {
    expect(routeSource).toContain("MobileFullscreenHeader");
    expect(routeSource).toContain("showHeader={false}");
    expect(routeSource).toContain("FormalTechnicianScheduleWorkspace");
    expect(routeSource).toContain('navItems={technicianNavItems}');
    expect(routeSource).toContain("SchedulePageHeader");
    expect(routeSource).toContain("TechnicianScheduleAutomationTabs");
    expect(workspaceSource).not.toContain("FeatureSegmentedTabs");
    expect(routeSource).toContain("showBottomNav={false}");
    expect(workspaceSource).not.toContain("ScheduleSearchField");
    expect(routeSource).not.toContain("FormalRoutePage");
    expect(unifiedCalendarSource).toContain('aria-label="切换日程展示范围"');
    expect(unifiedCalendarSource).toContain('{ value: "day", label: "1日" }');
    expect(unifiedCalendarSource).toContain('{ value: "threeDay", label: "3日" }');
    expect(unifiedCalendarSource).toContain('{ value: "week", label: "周" }');
    expect(unifiedCalendarSource).toContain('{ value: "month", label: "月" }');
    expect(unifiedCalendarSource).toContain('data-calendar-day-timeline="true"');
    expect(unifiedCalendarSource).toContain('data-calendar-lane-heading="true"');
    expect(unifiedCalendarSource).toContain('data-calendar-time-row="true"');
    expect(unifiedCalendarSource).toContain('data-calendar-time-tag="true"');
    expect(workspaceSource).toContain("TechnicianAutomationSettingsPanel");
    expect(workspaceSource).toContain('tab === "bookingSettings" || tab === "requestSettings"');
    expect(unifiedCalendarSource).toContain('ariaLabel="新增行程"');
    expect(workspaceSource).not.toContain("状态记录");
  });

  it("loads the shared calendar in formal-only mode without legacy store imports", () => {
    const combinedSource = `${routeSource}\n${workspaceSource}`;
    expect(workspaceSource).toContain("formalOnly");
    expect(unifiedCalendarSource).toContain("loadManagedScheduleWindow");
    expect(schedulingWindowLoaderSource).toContain("schedulingApi.listSlots");
    expect(combinedSource).not.toContain("formalRuntimeFallbacks");
    expect(combinedSource).not.toContain("entityStore");
    expect(combinedSource).not.toContain("scheduleStore");
    expect(combinedSource).not.toContain("shiftPlanningStore");
    expect(combinedSource).not.toContain("technicianScheduleStore");
  });
});
