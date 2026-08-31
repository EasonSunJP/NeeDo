import {
  bookingCreateBodySchema,
  confirmReceiptBodySchema,
  createOrderAddOnBodySchema,
  endServiceBodySchema,
  orderAddOnIdParamsSchema,
  orderAddOnDecisionBodySchema,
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
    it("accepts bounded order/add-on route ids and rejects invalid params", () => {
      expect(orderAddOnIdParamsSchema.parse({ id: "41", addOnId: "9" })).toEqual({
        id: 41,
        addOnId: 9
      });
      expect(
        orderAddOnIdParamsSchema.parse({
          id: 2_147_483_647,
          addOnId: 2_147_483_647
        })
      ).toEqual({ id: 2_147_483_647, addOnId: 2_147_483_647 });

      for (const invalidId of [0, -1, 1.5, 2_147_483_648]) {
        expect(() => orderAddOnIdParamsSchema.parse({ id: invalidId, addOnId: 9 })).toThrow();
        expect(() => orderAddOnIdParamsSchema.parse({ id: 41, addOnId: invalidId })).toThrow();
      }
      expect(() =>
        orderAddOnIdParamsSchema.parse({ id: 41, addOnId: 9, internalShopId: 3 })
      ).toThrow();
    });

    it("defines a semantic strict idempotency contract for add-on resolution", () => {
      expect(orderAddOnDecisionBodySchema.parse({ idempotencyKey })).toEqual({
        idempotencyKey
      });
      expect(() =>
        orderAddOnDecisionBodySchema.parse({ idempotencyKey, accepted: true })
      ).toThrow();
    });

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
      expect(
        createOrderAddOnBodySchema.parse({ serviceId: 2_147_483_647, idempotencyKey })
      ).toEqual({ serviceId: 2_147_483_647, idempotencyKey });
      for (const serviceId of [0, -1, 1.5, 2_147_483_648]) {
        expect(() => createOrderAddOnBodySchema.parse({ serviceId, idempotencyKey })).toThrow();
      }
    });

    it("trims a bounded end reason and rejects empty or oversized reasons", () => {
      expect(
        endServiceBodySchema.parse({ reason: "  customer_completed  ", idempotencyKey })
      ).toEqual({ reason: "customer_completed", idempotencyKey });
      expect(endServiceBodySchema.parse({ reason: "x".repeat(500), idempotencyKey })).toEqual({
        reason: "x".repeat(500),
        idempotencyKey
      });
      expect(() => endServiceBodySchema.parse({ reason: "   ", idempotencyKey })).toThrow();
      expect(() =>
        endServiceBodySchema.parse({ reason: "\u200B".repeat(16), idempotencyKey })
      ).toThrow();
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
      expect(
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "c".repeat(40),
          otherMethodLabel: "l".repeat(80),
          idempotencyKey
        })
      ).toEqual({
        method: "other",
        otherMethodCode: "c".repeat(40),
        otherMethodLabel: "l".repeat(80),
        idempotencyKey
      });
      expect(() =>
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "   ",
          otherMethodLabel: "Other",
          idempotencyKey
        })
      ).toThrow();
      expect(() =>
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "\u200B".repeat(16),
          otherMethodLabel: "現地決済",
          idempotencyKey
        })
      ).toThrow();
      expect(() =>
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "local_qr",
          otherMethodLabel: "\u200B".repeat(16),
          idempotencyKey
        })
      ).toThrow();
      expect(() =>
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "other",
          otherMethodLabel: "   ",
          idempotencyKey
        })
      ).toThrow();
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
      expect(
        confirmReceiptBodySchema.parse({ idempotencyKey, reason: "r".repeat(500) })
      ).toEqual({ idempotencyKey, reason: "r".repeat(500) });
      expect(() => confirmReceiptBodySchema.parse({ idempotencyKey, reason: "  " })).toThrow();
      expect(() =>
        confirmReceiptBodySchema.parse({ idempotencyKey, reason: "\u200B".repeat(16) })
      ).toThrow();
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
      expect(() =>
        payWithNdpBodySchema.parse({ idempotencyKey: "\u200B".repeat(16) })
      ).toThrow();
    });

    it.each(["\u200B".repeat(16), "\u0000".repeat(16), "\u2028".repeat(16)])(
      "rejects Unicode format, control and separator-only values",
      (invisibleValue) => {
        expect(() =>
          endServiceBodySchema.parse({ reason: invisibleValue, idempotencyKey })
        ).toThrow();
        expect(() =>
          payWithNdpBodySchema.parse({ idempotencyKey: invisibleValue })
        ).toThrow();
      }
    );

    it.each(["\uFE0F".repeat(16), "\u034F".repeat(16), "\u0301".repeat(16)])(
      "rejects variation selectors, grapheme joiners and standalone combining marks",
      (invisibleValue) => {
        expect(() =>
          endServiceBodySchema.parse({ reason: invisibleValue, idempotencyKey })
        ).toThrow();
        expect(() =>
          confirmReceiptBodySchema.parse({ reason: invisibleValue, idempotencyKey })
        ).toThrow();
        expect(() =>
          selectPaymentMethodBodySchema.parse({
            method: "other",
            otherMethodCode: invisibleValue,
            otherMethodLabel: "現地決済",
            idempotencyKey
          })
        ).toThrow();
        expect(() =>
          selectPaymentMethodBodySchema.parse({
            method: "other",
            otherMethodCode: "local_qr",
            otherMethodLabel: invisibleValue,
            idempotencyKey
          })
        ).toThrow();
        expect(() =>
          payWithNdpBodySchema.parse({ idempotencyKey: invisibleValue })
        ).toThrow();
      }
    );

    it.each([
      ["施術", "\uFE0F"],
      ["中文", "\u034F"],
      ["English", "\u0301"],
      ["123", "\uFE0F"],
      ["!", "\u034F"],
      ["🙂", "\u0301"]
    ] as const)("accepts visible base text %s with an invisible modifier", (base, modifier) => {
      const visibleText = `${base}${modifier}`;
      const visibleIdempotencyKey = `fulfillment-${base}-${modifier.repeat(16)}`;

      expect(endServiceBodySchema.parse({ reason: visibleText, idempotencyKey })).toMatchObject({
        reason: visibleText
      });
      expect(
        confirmReceiptBodySchema.parse({ reason: visibleText, idempotencyKey })
      ).toMatchObject({ reason: visibleText });
      expect(
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: visibleText,
          otherMethodLabel: visibleText,
          idempotencyKey
        })
      ).toMatchObject({ otherMethodCode: visibleText, otherMethodLabel: visibleText });
      expect(payWithNdpBodySchema.parse({ idempotencyKey: visibleIdempotencyKey })).toEqual({
        idempotencyKey: visibleIdempotencyKey
      });
    });

    it("allows visible multilingual text even when it contains format characters", () => {
      expect(
        endServiceBodySchema.parse({ reason: "施術\u200B完了", idempotencyKey })
      ).toEqual({ reason: "施術\u200B完了", idempotencyKey });
      expect(
        selectPaymentMethodBodySchema.parse({
          method: "other",
          otherMethodCode: "店頭QR",
          otherMethodLabel: "店頭\u200Bコード決済",
          idempotencyKey
        })
      ).toMatchObject({ otherMethodCode: "店頭QR", otherMethodLabel: "店頭\u200Bコード決済" });
    });

    it.each(["cash", "ndp", "other"] as const)(
      "keeps the legacy booking validator closed to %s checkout payment",
      (paymentMethod) => {
        expect(() =>
          bookingCreateBodySchema.parse({
            serviceId: 1,
            scheduleSlotId: 11,
            fulfillmentMode: "store",
            paymentMethod
          })
        ).toThrow();
      }
    );

    it.each(["awaitingCheckout", "awaitingPaymentConfirmation"] as const)(
      "accepts the %s order-list status",
      (status) => {
        expect(orderListQuerySchema.parse({ status })).toMatchObject({ status });
      }
    );
  });
});
