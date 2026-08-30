import { describe, expect, it } from "vitest";
import routeSource from "./route-pages.tsx?raw";
import workspaceSource from "./FormalTechnicianScheduleWorkspace.tsx?raw";

describe("approved formal technician schedule UI", () => {
  it("uses the restored mobile shell and full calendar surfaces", () => {
    expect(routeSource).toContain("MobileFullscreenHeader");
    expect(routeSource).toContain("FormalTechnicianScheduleWorkspace");
    expect(routeSource).not.toContain("FormalRoutePage");
    expect(workspaceSource).toContain('aria-label="显示范围"');
    expect(workspaceSource).toContain('<option value="day">1日</option>');
    expect(workspaceSource).toContain('data-testid="formal-schedule-day-timeline"');
    expect(workspaceSource).toContain('data-testid="formal-schedule-week-grid"');
    expect(workspaceSource).toContain('data-testid="formal-schedule-month-grid"');
    expect(workspaceSource).toContain('data-testid="formal-schedule-profile-row"');
    expect(workspaceSource).toContain('data-testid="formal-schedule-hour-row"');
    expect(workspaceSource).toContain("排班设置");
    expect(workspaceSource).toContain("行程搜索");
    expect(workspaceSource).toContain("FormalTechnicianOrdersPanel");
    expect(workspaceSource).toContain("当日安排");
  });

  it("loads only formal slots and orders without legacy store imports", () => {
    const combinedSource = `${routeSource}\n${workspaceSource}`;
    expect(combinedSource).toContain("loadManagedScheduleWindow");
    expect(combinedSource).toContain("loadEveryTechnicianOrder");
    expect(combinedSource).not.toContain("formalRuntimeFallbacks");
    expect(combinedSource).not.toContain("entityStore");
    expect(combinedSource).not.toContain("scheduleStore");
    expect(combinedSource).not.toContain("shiftPlanningStore");
    expect(combinedSource).not.toContain("technicianScheduleStore");
  });
});
