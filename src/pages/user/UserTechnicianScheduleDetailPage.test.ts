import { describe, expect, it } from "vitest";
import pageSource from "./UserTechnicianScheduleDetailPage.tsx?raw";

describe("UserTechnicianScheduleDetailPage header action", () => {
  it("loads the selected formal technician and bounded availability", () => {
    expect(pageSource).toContain("coreReadApi.getTechnicianDetail");
    expect(pageSource).toContain("useCustomerSelfProfile");
    expect(pageSource).toContain("loadTechnicianAvailabilityWindow");
    expect(pageSource).toContain("groupFormalAvailabilityByJstDate");
  });

  it("does not derive availability from browser stores", () => {
    expect(pageSource).not.toMatch(/useEntityStore|useHomeLayoutStore|useShiftPlanningStore|useTechnicianScheduleStore/);
    expect(pageSource).not.toMatch(/technicians\[0\]|customers\[0\]|config\.locations\[0\]/);
  });

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
