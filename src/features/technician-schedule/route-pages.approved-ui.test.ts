import { describe, expect, it } from "vitest";
import unifiedCalendarSource from "../../components/scheduling/UnifiedUserCalendar.tsx?raw";
import routeSource from "./route-pages.tsx?raw";
import workspaceSource from "./FormalTechnicianScheduleWorkspace.tsx?raw";

describe("approved formal technician schedule UI", () => {
  it("reuses the shared user and merchant calendar system for every technician view", () => {
    expect(workspaceSource).toContain("<UnifiedUserCalendar");
    expect(workspaceSource).toContain('displayMode="parallel"');
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
    expect(workspaceSource).toContain("FloatingHomeHeader");
    expect(workspaceSource).toContain("FeatureSegmentedTabs");
    expect(workspaceSource).toContain("ScheduleSearchField");
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
    expect(workspaceSource).toContain("排班设置");
    expect(workspaceSource).toContain("FormalTechnicianOrdersPanel");
    expect(workspaceSource).toContain('aria-label="新建正式排班"');
  });

  it("loads the shared calendar in formal-only mode without legacy store imports", () => {
    const combinedSource = `${routeSource}\n${workspaceSource}`;
    expect(workspaceSource).toContain("formalOnly");
    expect(unifiedCalendarSource).toContain("schedulingApi.listSlots");
    expect(combinedSource).not.toContain("formalRuntimeFallbacks");
    expect(combinedSource).not.toContain("entityStore");
    expect(combinedSource).not.toContain("scheduleStore");
    expect(combinedSource).not.toContain("shiftPlanningStore");
    expect(combinedSource).not.toContain("technicianScheduleStore");
  });
});
