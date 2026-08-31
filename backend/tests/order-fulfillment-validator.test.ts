import {
  confirmReceiptBodySchema,
  createOrderAddOnBodySchema,
  endServiceBodySchema,
  orderListQuerySchema,
  payWithNdpBodySchema,
  selectPaymentMethodBodySchema,
  startServiceBodySchema
} from "../src/validators/booking.validator";

const idempotencyKey = "fulfillment-command-0001";

describe("order fulfillment validators", () => {
  describe("service start", () => {
    it("accepts a customer command and trims its idempotency key", () => {
      expect(
        startServiceBodySchema.parse({
          actor: "customer",
          idempotencyKey: `  ${idempotencyKey}  `
        })
      ).toEqual({ actor: "customer", idempotencyKey });
    });

    it("accepts a technician command only with a six-digit verification code", () => {
      expect(
        startServiceBodySchema.parse({
          actor: "technician",
          verificationCode: "829104",
          idempotencyKey
        })
      ).toEqual({ actor: "technician", verificationCode: "829104", idempotencyKey });

      expect(() => startServiceBodySchema.parse({ actor: "technician", idempotencyKey })).toThrow();
      expect(() =>
        startServiceBodySchema.parse({
          actor: "technician",
          verificationCode: "12345a",
          idempotencyKey
        })
      ).toThrow();
    });

    it("rejects a customer verification code and unknown fields", () => {
      expect(() =>
        startServiceBodySchema.parse({
          actor: "customer",
          verificationCode: "829104",
          idempotencyKey
        })
      ).toThrow();
      expect(() =>
        startServiceBodySchema.parse({ actor: "customer", idempotencyKey, orderId: 1 })
      ).toThrow();
    });
  });

  describe("add-on and end-service commands", () => {
    it("accepts a positive formal service id without client price or duration", () => {
      expect(createOrderAddOnBodySchema.parse({ serviceId: 41, idempotencyKey })).toEqual({
        serviceId: 41,
        idempotencyKey
      });
      expect(() =>
        createOrderAddOnBodySchema.parse({
          serviceId: 41,
          priceAmountJpy: 8_800,
          idempotencyKey
        })
      ).toThrow();
      expect(() =>
        createOrderAddOnBodySchema.parse({
          serviceId: 41,
          durationMinutes: 60,
          idempotencyKey
        })
      ).toThrow();
    });

    it("rejects non-positive, fractional and out-of-range service ids", () => {
      for (const serviceId of [0, -1, 1.5, 2_147_483_648]) {
        expect(() => createOrderAddOnBodySchema.parse({ serviceId, idempotencyKey })).toThrow();
      }
    });

    it("trims a bounded end reason and rejects empty or oversized reasons", () => {
      expect(
        endServiceBodySchema.parse({ reason: "  customer_completed  ", idempotencyKey })
      ).toEqual({ reason: "customer_completed", idempotencyKey });
      expect(() => endServiceBodySchema.parse({ reason: "   ", idempotencyKey })).toThrow();
      expect(() =>
        endServiceBodySchema.parse({ reason: "x".repeat(501), idempotencyKey })
      ).toThrow();
      expect(() =>
        endServiceBodySchema.parse({ reason: "customer_completed", idempotencyKey, amount: 1 })
      ).toThrow();
    });
  });

  describe("checkout commands", () => {
    it.each(["cash", "ndp"] as const)("accepts %s without other-method details", (method) => {
      expect(selectPaymentMethodBodySchema.parse({ method, idempotencyKey })).toEqual({
        method,
        idempotencyKey
      });
    });

    it("requires and trims both details for another payment method", () => {
      expect(
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "  qr_local  ",
          otherMethodLabel: "  Local QR  ",
          idempotencyKey
        })
      ).toEqual({
        method: "other",
        otherMethodCode: "qr_local",
        otherMethodLabel: "Local QR",
        idempotencyKey
      });

      expect(() =>
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "qr_local",
          idempotencyKey
        })
      ).toThrow();
      expect(() =>
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodLabel: "Local QR",
          idempotencyKey
        })
      ).toThrow();
    });

    it("rejects residual other-method details for cash and NDP", () => {
      for (const method of ["cash", "ndp"] as const) {
        expect(() =>
          selectPaymentMethodBodySchema.parse({
            method,
            otherMethodCode: "legacy",
            otherMethodLabel: "Legacy",
            idempotencyKey
          })
        ).toThrow();
      }
    });

    it("bounds other payment code and label", () => {
      expect(() =>
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "x".repeat(41),
          otherMethodLabel: "Other",
          idempotencyKey
        })
      ).toThrow();
      expect(() =>
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "other",
          otherMethodLabel: "x".repeat(81),
          idempotencyKey
        })
      ).toThrow();
    });

    it("keeps the NDP payment command amount-free", () => {
      expect(payWithNdpBodySchema.parse({ idempotencyKey })).toEqual({ idempotencyKey });
      expect(() => payWithNdpBodySchema.parse({ idempotencyKey, amountNdp: 12_800 })).toThrow();
    });

    it("requires a trimmed bounded reason for receipt confirmation", () => {
      expect(
        confirmReceiptBodySchema.parse({ idempotencyKey, reason: "  cash received  " })
      ).toEqual({ idempotencyKey, reason: "cash received" });
      expect(() => confirmReceiptBodySchema.parse({ idempotencyKey, reason: "  " })).toThrow();
      expect(() =>
        confirmReceiptBodySchema.parse({ idempotencyKey, reason: "x".repeat(501) })
      ).toThrow();
    });
  });

  describe("shared contract boundaries", () => {
    it("accepts 16 and 160 character trimmed idempotency keys", () => {
      expect(payWithNdpBodySchema.parse({ idempotencyKey: `  ${"a".repeat(16)}  ` })).toEqual({
        idempotencyKey: "a".repeat(16)
      });
      expect(payWithNdpBodySchema.parse({ idempotencyKey: "b".repeat(160) })).toEqual({
        idempotencyKey: "b".repeat(160)
      });
    });

    it("rejects short, oversized and unknown idempotency payload fields", () => {
      expect(() => payWithNdpBodySchema.parse({ idempotencyKey: "a".repeat(15) })).toThrow();
      expect(() => payWithNdpBodySchema.parse({ idempotencyKey: "b".repeat(161) })).toThrow();
      expect(() => payWithNdpBodySchema.parse({ idempotencyKey, unexpected: true })).toThrow();
    });

    it.each(["awaitingCheckout", "awaitingPaymentConfirmation"] as const)(
      "accepts the %s order-list status",
      (status) => {
        expect(orderListQuerySchema.parse({ status })).toMatchObject({ status });
      }
    );
  });
});
