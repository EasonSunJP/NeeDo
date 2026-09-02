import { describe, expect, it } from "vitest";
import source from "./UserOrderDetailPage.tsx?raw";

describe("UserOrderDetailPage header", () => {
  it("keeps a back button before the appointment detail title", () => {
    expect(source).toContain("const handleBack = () => {");
    expect(source).toContain("navigate(-1);");
    expect(source).toContain("onBack={handleBack}");
    expect(source).toContain('navigate("/", { replace: true });');
    expect(source).not.toContain('navigate("/orders", { replace: true });');
    expect(source).not.toContain("hideBackButton");
    expect(source).toContain('closeLabel="关闭预约详情"');
  });

  it("routes numeric orders through the formal API detail and cancellation workflow", () => {
    expect(source).toContain("function FormalUserOrderDetailPage");
    expect(source).toContain("bookingApi.getOrder(orderId)");
    expect(source).toContain("bookingApi.cancelOrder(orderId");
    expect(source).toContain("buildFormalOrderTimelineEvents(order)");
    expect(source).toContain("重新加载预约详情");
    expect(source).toContain("isBookingApiId(orderId) ? <FormalUserOrderDetailPage");
  });

  it("uses only formal server projections for fulfillment and checkout", () => {
    expect(source).toContain("coreReadApi.listServices");
    expect(source).toContain("bookingApi.startService");
    expect(source).toContain("bookingApi.createAddOn");
    expect(source).toContain("bookingApi.acceptAddOn");
    expect(source).toContain("bookingApi.rejectAddOn");
    expect(source).toContain("bookingApi.endService");
    expect(source).toContain("bookingApi.getCheckout");
    expect(source).toContain("bookingApi.selectPaymentMethod");
    expect(source).toContain("bookingApi.payWithNdp");
    expect(source).not.toContain("orderServiceSessionStore");
    expect(source).not.toContain("emptyServices");
    expect(source).not.toContain("getServiceStartCode");
    expect(source).not.toContain("submitOrderServiceUserReview");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).toContain("bookingApi.createTimelineComment");
    expect(source).toContain("useOrderRealtimeRefresh");
  });

  it("keeps the production order-detail information hierarchy", () => {
    expect(source).toContain("SocialProfileMiniCard");
    for (const title of ["服务", "店铺 / 服务方", "技师 / 担当", "预约情报", "订单追踪信息"]) {
      expect(source).toContain(`title=\"${title}\"`);
    }
    expect(source).toContain('getScopedProfileDetailPath("user", "technician", displayTechnician.id)');
    expect(source).not.toContain('detailTo={`/technicians/${displayTechnician.id}`}');
    expect(source).toContain("支付手段");
    expect(source).toContain("来源");
    expect(source).toContain("服务验证码");
  });
});
