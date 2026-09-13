import { describe, expect, it } from "vitest";
import panelSource from "./FormalTechnicianOrdersPanel.tsx?raw";
import portalSource from "../../pages/mobile/TechnicianPortalPage.tsx?raw";
import detailSource from "../../features/technician-schedule/route-pages.tsx?raw";

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

  it("keeps only valid pre-service transitions in the list and delegates fulfillment to detail", () => {
    expect(panelSource).toContain("bookingApi.confirmOrder(order.id)");
    expect(panelSource).toContain("bookingApi.cancelOrder(order.id");
    expect(panelSource).toContain("order.statusHistory.map");
    expect(panelSource).not.toContain("bookingApi.startOrder");
    expect(panelSource).not.toContain("bookingApi.completeOrder");
    expect(detailSource).toContain("bookingApi.startService");
    expect(detailSource).toContain("bookingApi.acceptAddOn");
    expect(detailSource).toContain("bookingApi.rejectAddOn");
    expect(detailSource).toContain("bookingApi.endService");
    expect(detailSource).toContain("bookingApi.getCheckout");
    expect(detailSource).toContain("bookingApi.confirmReceipt");
    expect(detailSource).not.toContain("bookingApi.startOrder");
    expect(detailSource).not.toContain("bookingApi.completeOrder");
    expect(panelSource).toContain('status === "awaitingCheckout"');
    expect(panelSource).toContain('status === "awaitingPaymentConfirmation"');
  });

  it("exposes loading, retry, empty, conflict, and in-flight states", () => {
    expect(panelSource).toContain("describeBookingOrderMutationError(error, language)");
    expect(panelSource).not.toContain(
      'if (error.status === 409) return "订单状态已变化，请重新加载后再操作"'
    );
    expect(panelSource).toContain("正在加载正式订单");
    expect(panelSource).toContain("重新加载订单");
    expect(panelSource).toContain("当前没有正式订单");
    expect(panelSource).toContain("操作处理中");
  });

  it("labels the customer order total and never presents the base price as technician income", () => {
    expect(panelSource).toContain("顾客支付总额");
    expect(panelSource).toContain("order.paymentAmountJpy");
    expect(panelSource).not.toContain("yen(Number(order.priceAmount))");
    expect(panelSource).not.toContain("预估收入");
  });
});
