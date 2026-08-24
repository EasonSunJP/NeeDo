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
    expect(source).toContain("order.statusHistory.map");
    expect(source).toContain("重新加载预约详情");
    expect(source).toContain("isBookingApiId(orderId) ? <FormalUserOrderDetailPage");
  });
});
