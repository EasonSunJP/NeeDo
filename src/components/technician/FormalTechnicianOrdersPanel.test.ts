import { describe, expect, it } from "vitest";
import panelSource from "./FormalTechnicianOrdersPanel.tsx?raw";
import portalSource from "../../pages/mobile/TechnicianPortalPage.tsx?raw";

describe("FormalTechnicianOrdersPanel", () => {
  it("replaces the visible technician order tab with identity-scoped server data", () => {
    expect(portalSource).toContain("<FormalTechnicianOrdersPanel />");
    expect(panelSource).toContain("loadEveryTechnicianOrder()");
    expect(panelSource).toContain('`/technician/orders/${order.id}`');
    expect(panelSource).toContain("查看详情");
    expect(panelSource).not.toContain("../../data/mock");
    expect(panelSource).not.toContain("orderServiceSessionStore");
    expect(panelSource).not.toContain("localStorage");
  });

  it("drives each fulfillment transition through the formal order state machine", () => {
    expect(panelSource).toContain("bookingApi.confirmOrder(order.id)");
    expect(panelSource).toContain("bookingApi.startOrder(order.id)");
    expect(panelSource).toContain("bookingApi.completeOrder(order.id)");
    expect(panelSource).toContain("bookingApi.cancelOrder(order.id");
    expect(panelSource).toContain("order.statusHistory.map");
  });

  it("exposes loading, retry, empty, conflict, and in-flight states", () => {
    expect(panelSource).toContain("正在加载正式订单");
    expect(panelSource).toContain("重新加载订单");
    expect(panelSource).toContain("当前没有正式订单");
    expect(panelSource).toContain("订单状态已变化，请重新加载后再操作");
    expect(panelSource).toContain("操作处理中");
  });
});
