import { describe, expect, it } from "vitest";
import pageSource from "./UserTechnicianScheduleDetailPage.tsx?raw";

describe("UserTechnicianScheduleDetailPage header action", () => {
  it("uses a close action in the user-facing technician schedule header", () => {
    expect(pageSource).toContain("rightAction=");
    expect(pageSource).toContain('label="关闭技师班表"');
    expect(pageSource).toContain("closeScheduleDetail");
    expect(pageSource).not.toContain('settingsLabel="系统设置"');
    expect(pageSource).not.toContain("settingsTo={userPortalConfig.settingsPath}");
  });

  it("keeps month availability as a grid-only drilldown", () => {
    expect(pageSource).toContain('{view !== "month" ? <AvailabilityTimeline');
    expect(pageSource).toContain("onClick={() => openDateInDayView(date)}");
  });
});
