import { describe, expect, it } from "vitest";
import source from "./FormalScheduleInventoryPanel.tsx?raw";
import merchantSource from "../../pages/mobile/MerchantPortalPage.tsx?raw";
import technicianSource from "../../features/technician-schedule/FormalTechnicianScheduleWorkspace.tsx?raw";

describe("FormalScheduleInventoryPanel", () => {
  it("uses identity-scoped formal APIs for all bookable inventory mutations", () => {
    expect(source).toContain("loadManagedScheduleWindow(scope");
    expect(source).toContain("schedulingApi.createSlot(scope");
    expect(source).toContain("schedulingApi.updateSlot(scope");
    expect(source).toContain("schedulingApi.deleteSlot(scope");
    expect(source).toContain('scope === "merchant-admin"');
    expect(source).toContain("backofficeRealDataApi.services");
    expect(source).toContain("backofficeRealDataApi.technicians");
    expect(source).toContain("pricingModeApi.listTechnicianServices");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("../../data/mock");
  });

  it("links technician rows to numeric formal detail routes without exposing them to merchants", () => {
    expect(source).toContain('scope === "technician"');
    expect(source).toContain('`/technician/schedule/events/${slot.id}`');
    expect(source).toContain("查看详情");
  });

  it("supports loading, empty, error, conflict and two-step deletion states", () => {
    expect(source).toContain("inventoryLoading");
    expect(source).toContain("inventoryError");
    expect(source).toContain("scheduleConflictMessage");
    expect(source).toContain("pendingDeleteSlotId");
    expect(source).toContain("当前范围没有正式可预约时段");
  });

  it("keeps the merchant appointment overview and technician My Schedule on the formal shared calendar", () => {
    expect(merchantSource).toContain("<UnifiedUserCalendar");
    expect(merchantSource).toContain("currentStore={store}");
    expect(merchantSource).not.toContain("<FormalScheduleInventoryPanel");
    expect(technicianSource).toContain("<UnifiedUserCalendar");
    expect(technicianSource).toContain('displayMode="parallel"');
    expect(technicianSource).toContain("formalOnly");
    expect(technicianSource).toContain("showSourceDrawer");
    expect(technicianSource).toContain("<TechnicianAutomationSettingsPanel");
    expect(technicianSource).toContain('tab === "bookingSettings" || tab === "requestSettings"');
  });
});
