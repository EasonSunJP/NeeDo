import {
  projectOrderPayment,
  sumAcceptedOrderAddOnAmountJpy
} from "../src/domain/order-payment-projection";

describe("projectOrderPayment", () => {
  it("uses the persisted payment total before checkout", () => {
    expect(projectOrderPayment({
      orderPriceAmountJpy: 8_000,
      orderPaymentAmountJpy: 8_000,
      orderPaymentMethod: "ONSITE",
      checkout: null,
      financial: null
    })).toEqual({
      totalAmountJpy: 8_000,
      amountSource: "order_payment",
      paymentMethod: "ONSITE",
      effectivePaymentMethod: "ONSITE",
      otherMethodCode: null,
      otherMethodLabel: null,
      checkoutPaymentAmountNdp: null,
      ndpCurrency: null
    });
  });

  it("adds accepted add-on snapshots to the live payable total before checkout", () => {
    expect(projectOrderPayment({
      orderPriceAmountJpy: 8_800,
      orderPaymentAmountJpy: 8_800,
      acceptedAddOnAmountJpy: 8_800,
      orderPaymentMethod: "ONSITE",
      checkout: null,
      financial: null
    })).toMatchObject({
      totalAmountJpy: 17_600,
      amountSource: "accepted_add_ons"
    });
  });

  it("sums only active accepted JPY add-on snapshots", () => {
    expect(sumAcceptedOrderAddOnAmountJpy([
      { status: "ACCEPTED", priceAmountJpy: 8_800, currency: "JPY", deletedAt: null },
      { status: "PROPOSED", priceAmountJpy: 4_000, currency: "JPY", deletedAt: null },
      { status: "REJECTED", priceAmountJpy: 3_000, currency: "JPY", deletedAt: null },
      {
        status: "ACCEPTED",
        priceAmountJpy: 2_000,
        currency: "JPY",
        deletedAt: new Date("2026-09-20T00:00:00.000Z")
      }
    ])).toBe(8_800);
  });

  it("fails closed when an accepted add-on snapshot is not a valid JPY integer", () => {
    expect(() => sumAcceptedOrderAddOnAmountJpy([
      { status: "ACCEPTED", priceAmountJpy: 8_800, currency: "USD", deletedAt: null }
    ])).toThrow("error.order.payment_projection_invalid");
  });

  it("does not report the order default while checkout payment selection is pending", () => {
    expect(projectOrderPayment({
      orderPriceAmountJpy: 8_000,
      orderPaymentAmountJpy: 8_000,
      acceptedAddOnAmountJpy: 6_500,
      orderPaymentMethod: "ONSITE",
      checkout: {
        checkoutAmountJpy: 14_500,
        payableNdp: 14_500,
        paymentMethod: null,
        otherMethodCode: null,
        otherMethodLabel: null,
        deletedAt: null,
        ledgerTransaction: null
      },
      financial: null
    })).toMatchObject({
      totalAmountJpy: 14_500,
      amountSource: "checkout",
      paymentMethod: "ONSITE",
      effectivePaymentMethod: null,
      otherMethodCode: null,
      otherMethodLabel: null
    });
  });

  it("carries the active checkout custom payment identity", () => {
    expect(projectOrderPayment({
      orderPriceAmountJpy: 8_000,
      orderPaymentAmountJpy: 8_000,
      orderPaymentMethod: "ONSITE",
      checkout: {
        checkoutAmountJpy: 14_500,
        payableNdp: 0,
        paymentMethod: "OTHER",
        otherMethodCode: "paypay",
        otherMethodLabel: "PayPay",
        deletedAt: null,
        ledgerTransaction: null
      },
      financial: null
    })).toMatchObject({
      paymentMethod: "ONSITE",
      effectivePaymentMethod: "OTHER",
      otherMethodCode: "paypay",
      otherMethodLabel: "PayPay"
    });
  });

  it("uses the checkout total and active Test NDP ledger provenance", () => {
    expect(projectOrderPayment({
      orderPriceAmountJpy: 8_000,
      orderPaymentAmountJpy: 8_000,
      orderPaymentMethod: "ONSITE",
      checkout: {
        checkoutAmountJpy: 14_500,
        payableNdp: 14_500,
        paymentMethod: "NDP",
        otherMethodCode: null,
        otherMethodLabel: null,
        deletedAt: null,
        ledgerTransaction: { currency: "TEST_NDP", deletedAt: null }
      },
      financial: { ndpCurrency: "NDP", deletedAt: null }
    })).toMatchObject({
      totalAmountJpy: 14_500,
      amountSource: "checkout",
      paymentMethod: "ONSITE",
      effectivePaymentMethod: "NDP",
      otherMethodCode: null,
      otherMethodLabel: null,
      checkoutPaymentAmountNdp: 14_500,
      ndpCurrency: "TEST_NDP"
    });
  });

  it("falls back to an active financial currency when no ledger exists", () => {
    expect(projectOrderPayment({
      orderPriceAmountJpy: 8_000,
      orderPaymentAmountJpy: 8_000,
      orderPaymentMethod: "ONSITE",
      checkout: {
        checkoutAmountJpy: 14_500,
        payableNdp: 14_500,
        paymentMethod: "NDP",
        otherMethodCode: null,
        otherMethodLabel: null,
        deletedAt: null,
        ledgerTransaction: null
      },
      financial: { ndpCurrency: "TEST_NDP", deletedAt: null }
    }).ndpCurrency).toBe("TEST_NDP");
  });

  it("ignores retired checkout and currency relations", () => {
    const retiredAt = new Date("2026-09-10T03:00:00.000Z");

    expect(projectOrderPayment({
      orderPriceAmountJpy: 14_500,
      orderPaymentAmountJpy: 14_500,
      orderPaymentMethod: "NDP",
      checkout: {
        checkoutAmountJpy: 14_000,
        payableNdp: 14_000,
        paymentMethod: "NDP",
        otherMethodCode: null,
        otherMethodLabel: null,
        deletedAt: retiredAt,
        ledgerTransaction: { currency: "TEST_NDP", deletedAt: retiredAt }
      },
      financial: { ndpCurrency: "TEST_NDP", deletedAt: retiredAt }
    })).toEqual({
      totalAmountJpy: 14_500,
      amountSource: "order_payment",
      paymentMethod: "NDP",
      effectivePaymentMethod: "NDP",
      otherMethodCode: null,
      otherMethodLabel: null,
      checkoutPaymentAmountNdp: null,
      ndpCurrency: null
    });
  });
});
