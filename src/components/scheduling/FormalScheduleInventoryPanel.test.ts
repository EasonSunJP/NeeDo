import { describe, expect, it } from "vitest";
import source from "./FormalScheduleInventoryPanel.tsx?raw";
import merchantSource from "../../pages/mobile/MerchantPortalPage.tsx?raw";
import technicianSource from "../../pages/mobile/TechnicianPortalPage.tsx?raw";

describe("FormalScheduleInventoryPanel", () => {
  it("uses identity-scoped formal APIs for all bookable inventory mutations", () => {
    expect(source).toContain("schedulingApi.listSlots(scope");
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

  it("supports loading, empty, error, conflict and two-step deletion states", () => {
    expect(source).toContain("inventoryLoading");
    expect(source).toContain("inventoryError");
    expect(source).toContain("scheduleConflictMessage");
    expect(source).toContain("pendingDeleteSlotId");
    expect(source).toContain("当前范围没有正式可预约时段");
  });

  it("is mounted in both merchant and technician schedule portals", () => {
    expect(merchantSource).toContain('scope="merchant-admin"');
    expect(merchantSource).toContain("<FormalScheduleInventoryPanel");
    expect(technicianSource).toContain('scope="technician"');
    expect(technicianSource).toContain("shopId={technicianShopApiId}");
  });
});
