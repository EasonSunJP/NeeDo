import { describe, expect, it } from "vitest";
import formalSource from "./FormalCheckoutPage.tsx?raw";
import checkoutSource from "./CheckoutPage.tsx?raw";

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
});
