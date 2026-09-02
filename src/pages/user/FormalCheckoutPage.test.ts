import { describe, expect, it } from "vitest";
import formalSource from "./FormalCheckoutPage.tsx?raw";
import checkoutSource from "./CheckoutPage.tsx?raw";
import progressSource from "./formal-checkout/CheckoutProgressNav.tsx?raw";

describe("formal customer checkout", () => {
  it("routes numeric services into an isolated API-only checkout", () => {
    expect(checkoutSource).toContain("isBookingApiId(serviceId)");
    expect(checkoutSource).toContain("? <FormalCheckoutPage serviceId={Number(serviceId)} />");
    expect(formalSource).toContain("coreReadApi.getServiceDetail(serviceId)");
    expect(formalSource).toContain("bookingApi.listAvailability");
    expect(formalSource).toContain("bookingApi.createBooking");
    expect(formalSource).toContain("scheduleSlotId: selectedSlot.id");
    expect(formalSource).toContain("navigate(`/orders/${order.id}`");
  });

  it("loads all formal rows for the exact Tokyo date into the checkout-time dropdown", () => {
    expect(formalSource).toContain("includeUnavailable: true");
    expect(formalSource).toContain("getTokyoDayWindow");
    expect(formalSource).toContain("resolveInitialCheckoutSlotId");
    expect(formalSource).toContain("<CheckoutTimeRow");
    expect(formalSource).not.toContain("formatSlotDateTime(slot.startsAt)");
  });

  it("marks the formal technician available only when the selected bookable slot belongs to them", () => {
    expect(formalSource).toContain("selectedSlot?.technicianProfileId === technicianProfileId");
    expect(formalSource).not.toContain("slots.some((slot) => slot.technicianProfileId === technicianProfileId");
  });

  it("keeps mock checkout data exclusive to explicit static-demo mode", () => {
    expect(checkoutSource).toContain('<Navigate replace to="/categories" />');
    expect(checkoutSource).toContain('<Navigate replace to="/categories" />');
  });

  it("does not copy formal reservations into local stores or mock entities", () => {
    expect(formalSource).not.toContain("../../data/mock");
    expect(formalSource).not.toContain("entityStore");
    expect(formalSource).not.toContain("shiftPlanningStore");
    expect(formalSource).not.toContain("userOrderStore");
    expect(formalSource).not.toContain("addUserOrder");
  });

  it("has explicit loading, error, retry, empty-slot, and submission states", () => {
    expect(formalSource).toContain('type LoadStatus = "loading" | "success" | "error"');
    expect(formalSource).toContain('useState<LoadStatus>("loading")');
    expect(formalSource).toContain("重新加载预约页");
    expect(formalSource).toContain("暂时没有可预约时段");
    expect(formalSource).toContain("创建预约中");
    expect(formalSource).toContain("预约状态已变化，请重新选择时段");
  });

  it("keeps the production confirmation structure while using formal data", () => {
    for (const label of ["套餐", "到店服务", "时间", "地址", "技师", "备注"]) {
      expect(progressSource).toContain(`label: "${label}"`);
    }
    expect(formalSource).toContain("注意事项");
    expect(formalSource).toContain("取消政策");
    expect(formalSource).toContain("NDP（NeeDoPoint）");
    expect(formalSource).toContain("确定预约");
    expect(formalSource).toContain("Google Maps");
    expect(formalSource).toContain("门店位置预览");
    expect(formalSource).toContain("复制地址");
    expect(formalSource).toContain("预约时间");
    expect(formalSource).toContain("接单率");
    expect(formalSource).toContain("service.technician.acceptanceRatePercent");
    expect(formalSource).toContain("service.technician.reviewSummary.reviewCount");
    expect(formalSource).toContain("service.technician.reviewSummary.ratingAverage");
    expect(formalSource).not.toContain("acceptRate: 98");
    expect(formalSource).not.toContain("选择可预约时段");
    expect(formalSource).not.toContain("提交正式预约");
  });

  it("renders the approved detailed body without reviving unsupported stores", () => {
    for (const copy of ["套餐", "服务方式", "预约时间", "地址", "技师", "特殊需求", "注意事项", "取消政策", "NDP（NeeDoPoint）"]) {
      expect(formalSource).toContain(copy);
    }
    expect(formalSource).not.toContain("entityStore");
    expect(formalSource).not.toContain("shiftPlanningStore");
    expect(formalSource).not.toContain("userOrderStore");
    expect(formalSource).not.toContain("../../data/mock");
  });

  it("tracks six approved sections through the viewport center", () => {
    expect(formalSource).toContain("progressBarRef");
    expect(formalSource).toContain("sectionRefs");
    expect(formalSource).toContain("resolveActiveCheckoutStep");
    expect(formalSource).toContain('window.addEventListener("scroll"');
    expect(formalSource).toContain('window.addEventListener("resize"');
    expect(formalSource).toContain('section.scrollIntoView({ behavior, block: "start" })');
    expect(formalSource.match(/sectionRefs\.current\[[0-5]\]/g)).toHaveLength(6);
    expect(formalSource).toContain("<CheckoutProgressNav");
    expect(formalSource).toContain("activeIndex={activeProgressStep}");
  });

  it("keeps the approved action footer attached to the formal booking submission", () => {
    expect(formalSource).toContain("应付金额");
    expect(formalSource).toContain("联系");
    expect(formalSource).toContain("确定预约");
    expect(formalSource).toContain("safe-nav-bottom");
    expect(formalSource).toContain("pointer-events-none fixed inset-x-0 bottom-0");
    expect(formalSource).toContain("paymentMethod");
    expect(formalSource).toContain("void submitBooking()");
    expect(formalSource).toContain("disabled={!selectedSlot || submitting}");
  });
});
