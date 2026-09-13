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

  it("marks the formal server page so DataTable cannot expose current-page-only controls", () => {
    expect(source).toContain('paginationMode="server"');
    expect(source).not.toContain('footerPlacement="inline"');
  });

  it("uses the formal order state machine and manual-payment endpoints", () => {
    expect(source).toContain("await bookingApi.confirmOrder(");
    expect(source).toContain("selectedOrder.id,");
    expect(source).toContain("insufficientBalanceConfirmation");
    expect(source).toContain("createBookingIdempotencyKey()");
    expect(source).toContain("余额不足，仍确认预约");
    expect(source).toContain("店铺平台费余额不足");
    expect(source).toContain("bookingApi.startService(selectedOrder.id");
    expect(source).toContain('actor: "merchant"');
    expect(source).toContain("verificationCode");
    expect(source).toContain("bookingApi.endService(selectedOrder.id");
    expect(source).toContain('reason: "店铺确认服务已结束"');
    expect(source).not.toContain("bookingApi.startOrder(selectedOrder.id)");
    expect(source).not.toContain("bookingApi.completeOrder(selectedOrder.id)");
    expect(source).toContain("bookingApi.cancelOrder(selectedOrder.id");
    expect(source).toContain('bookingApi.confirmManualPayment("merchant-admin"');
    expect(source).toContain('bookingApi.refundManualPayment("merchant-admin"');
  });

  it("uses retained idempotency keys and blocks duplicate transition submissions", () => {
    expect(source).toContain("transitionInFlightRef.current");
    expect(source).toContain("transitionKeys.current");
    expect(source).toContain("createBookingIdempotencyKey()");
    expect(source).toContain("isAmbiguousOrderMutationError");
  });

  it("provides explicit resilient and confirmation states", () => {
    expect(source).toContain("describeBookingOrderMutationError(error, language)");
    expect(source).not.toContain(
      'if (error.status === 409) return "订单或支付状态已经变化，请重新加载后再操作"'
    );
    expect(source).toContain("正在加载本店正式订单");
    expect(source).toContain("重新加载本店订单");
    expect(source).toContain("本店当前没有符合条件的正式订单");
    expect(source).toContain("再次点击确认取消订单");
    expect(source).toContain("再次点击确认收款");
    expect(source).toContain("再次点击确认退款");
  });

  it("opens all four related business entities in a stacked detail drawer", () => {
    expect(source).toContain('title: "用户"');
    expect(source).not.toContain('{ key: "customer", title: "顾客"');
    expect(source).toContain('aria-label="查看用户资料"');
    expect(source).toContain('aria-label="查看员工资料"');
    expect(source).toContain("OrderRelatedEntityDrawer");
    expect(source).toContain('setParticipant("customer")');
    expect(source).toContain('setParticipant("technician")');
    expect(source).toContain('setParticipant("shop")');
    expect(source).toContain('setParticipant("service")');
  });

  it("loads the scoped formal order detail and displays its real timeline", () => {
    expect(source).toContain('backofficeRealDataApi.orderDetail("merchant-admin"');
    expect(source).toContain("AdminEventTimeline");
    expect(source).toContain('title="订单时间线"');
  });

  it("renders and confirms the authoritative order total instead of the base catalog price", () => {
    expect(source).toContain("selectedOrder.totalAmountJpy");
    expect(source).not.toContain("yen(selectedOrder.priceAmount)");
  });

  it("keeps the JPY total separate from the persisted payment channel and NDP unit", () => {
    expect(source).toContain("formatBackofficeOrderPaymentSummary");
    expect(source).toContain("selectedOrder.checkoutPaymentAmountNdp");
    expect(source).toContain("selectedOrder.ndpCurrency");
  });
});
