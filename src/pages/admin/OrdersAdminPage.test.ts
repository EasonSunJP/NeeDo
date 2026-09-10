import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./OrdersAdminPage.tsx", import.meta.url), "utf8");

describe("OrdersAdminPage formal operations workflow", () => {
  it("uses the protected global order list without browser-local identity overlays", () => {
    expect(source).toContain('backofficeRealDataApi.orders("backoffice"');
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain("../../data/mock");
  });

  it("exposes only implemented state and payment mutations", () => {
    expect(source).toContain("bookingApi.confirmOrder(selectedOrder.id)");
    expect(source).toContain("bookingApi.startOrder(selectedOrder.id)");
    expect(source).toContain("bookingApi.completeOrder(selectedOrder.id)");
    expect(source).toContain("bookingApi.cancelOrder(selectedOrder.id");
    expect(source).toContain('bookingApi.confirmManualPayment("backoffice"');
    expect(source).toContain('bookingApi.refundManualPayment("backoffice"');
    expect(source).not.toContain('"改期"');
    expect(source).not.toContain('"分配技师"');
    expect(source).not.toContain('"修改价格"');
    expect(source).not.toContain('"打印单据"');
  });

  it("renders load, empty, retry, conflict, and two-step destructive states", () => {
    expect(source).toContain("正在加载全平台正式订单");
    expect(source).toContain("重新加载运营订单");
    expect(source).toContain("当前没有符合条件的正式订单");
    expect(source).toContain("订单或支付状态已经变化，请重新加载后再操作");
    expect(source).toContain("再次点击确认取消订单");
    expect(source).toContain("再次点击确认退款");
  });

  it("shows order creation time separately from the appointment time", () => {
    expect(source).toContain('title: "下单时间"');
    expect(source).toContain('title: "预约时间"');
    expect(source).toContain("createdAt");
    expect(source).toContain("startsAt");
  });

  it("restores and synchronizes supported sidebar deep-link parameters", () => {
    expect(source).toContain("useSearchParams");
    expect(source).toContain('searchParams.get("status")');
    expect(source).toContain('searchParams.get("orderId")');
    expect(source).toContain("setSearchParams");
  });

  it("opens human-facing related entity drawers from the order detail", () => {
    expect(source).toContain("OrderRelatedEntityDrawer");
    expect(source).toContain('setRelatedEntity("customer")');
    expect(source).toContain('setRelatedEntity("shop")');
    expect(source).toContain('setRelatedEntity("technician")');
    expect(source).toContain('setRelatedEntity("service")');
    expect(source).not.toContain("customerName} / #");
  });

  it("renders one shared admin timeline with one visible section title", () => {
    expect(source).toContain("AdminEventTimeline");
    expect(source).toContain('title="订单时间线与绩效判定"');
    expect(source).not.toContain('title="订单时间线与判定修订"');
    expect(source).not.toContain("ContactEventTimelinePanel");
  });
});
