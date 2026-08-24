import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MerchantAdminOrdersPage.tsx", import.meta.url), "utf8");

describe("MerchantAdminOrdersPage formal workflow", () => {
  it("loads only the authenticated shop order page and does not merge local entities", () => {
    expect(source).toContain('backofficeRealDataApi.orders("merchant-admin"');
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("联系顾客");
    expect(source).not.toContain("去调度中心");
  });

  it("uses the formal order state machine and manual-payment endpoints", () => {
    expect(source).toContain("bookingApi.confirmOrder(selectedOrder.id)");
    expect(source).toContain("bookingApi.startOrder(selectedOrder.id)");
    expect(source).toContain("bookingApi.completeOrder(selectedOrder.id)");
    expect(source).toContain("bookingApi.cancelOrder(selectedOrder.id");
    expect(source).toContain('bookingApi.confirmManualPayment("merchant-admin"');
    expect(source).toContain('bookingApi.refundManualPayment("merchant-admin"');
  });

  it("provides explicit resilient and confirmation states", () => {
    expect(source).toContain("正在加载本店正式订单");
    expect(source).toContain("重新加载本店订单");
    expect(source).toContain("本店当前没有符合条件的正式订单");
    expect(source).toContain("再次点击确认取消订单");
    expect(source).toContain("再次点击确认收款");
    expect(source).toContain("再次点击确认退款");
  });
});
