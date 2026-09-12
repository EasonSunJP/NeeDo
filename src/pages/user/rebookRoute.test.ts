import { describe, expect, it } from "vitest";
import { getRebookAction } from "./rebookRoute";

describe("getRebookAction", () => {
  it("preserves technician service, current shop, and selected staff", () => {
    expect(getRebookAction({
      action: "checkout",
      fulfillmentMode: "store",
      serviceId: 77,
      serviceType: "technician_service",
      shopId: 4,
      technicianProfileId: 9
    })).toEqual({
      enabled: true,
      label: "再次预约",
      path: "/checkout/technician-service-77?shop=4&technician=9"
    });
  });

  it("keeps shop service rebooking separate", () => {
    expect(getRebookAction({
      action: "checkout",
      fulfillmentMode: "home",
      serviceId: 42,
      serviceType: "shop_service",
      shopId: 4,
      technicianProfileId: 9
    })).toEqual({
      enabled: true,
      label: "再次预约",
      path: "/checkout/42?store=4&mode=home&technician=9"
    });
  });

  it("routes a stopped service to the original effective shop with an explicit notice", () => {
    expect(getRebookAction({
      action: "select_service",
      reason: "original_service_unavailable",
      shopId: 4
    })).toEqual({
      enabled: true,
      label: "重新选择服务",
      notice: "原服务已停止，请重新选择服务",
      path: "/stores/4"
    });
  });

  it("disables rebooking when the original shop is unavailable", () => {
    expect(getRebookAction({ action: "unavailable", reason: "shop_unavailable" })).toEqual({
      enabled: false,
      label: "再次预约",
      notice: "原服务已停止，请重新选择服务"
    });
  });
});
