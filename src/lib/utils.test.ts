import { describe, expect, it } from "vitest";
import { paymentStatusLabel, paymentStatusTone, statusLabel } from "./utils";

describe("payment status UI helpers", () => {
  it("maps payment status codes to display labels", () => {
    expect(paymentStatusLabel("paid")).toBe("已支付");
    expect(paymentStatusLabel("unpaid")).toBe("未支付");
    expect(paymentStatusLabel("depositPaid")).toBe("定金已支付");
    expect(paymentStatusLabel("refunded")).toBe("已退款");
  });

  it("maps payment status codes to badge tones", () => {
    expect(paymentStatusTone("paid")).toBe("green");
    expect(paymentStatusTone("unpaid")).toBe("red");
    expect(paymentStatusTone("depositPaid")).toBe("blue");
    expect(paymentStatusTone("refunded")).toBe("neutral");
  });
});

describe("formal order status labels", () => {
  it("keeps both checkout transition states visible", () => {
    expect(statusLabel("awaitingCheckout")).toBe("等待结账");
    expect(statusLabel("awaitingPaymentConfirmation")).toBe("等待确认收款");
  });
});
