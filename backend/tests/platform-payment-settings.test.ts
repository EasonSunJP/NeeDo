import { BookingService } from "../src/services/booking.service";

const customer = {
  userId: 101,
  roles: ["customer"],
  currentIdentityType: "customer",
  currentIdentityScopeType: "customer_profile",
  currentIdentityScopeId: 501
};

const checkout = {
  id: 9,
  orderId: 41,
  status: "awaitingCheckout",
  paymentMethod: null,
  paymentEvidence: null
};

const createService = (methods: Array<"cash" | "ndp">) => {
  const repository = {
    getOrCreateCheckout: jest.fn(async () => ({ outcome: "ok", applied: true, checkout })),
    selectCheckoutPaymentMethod: jest.fn(async () => ({
      outcome: "ok",
      applied: true,
      checkout: { ...checkout, paymentMethod: "cash" }
    })),
    payCheckoutWithNdp: jest.fn(async () => ({
      outcome: "ok",
      applied: true,
      checkout: { ...checkout, paymentMethod: "ndp" }
    }))
  };
  const ledger = { debitCheckoutPayment: jest.fn() };
  const paymentPolicy = { getAvailablePaymentMethods: jest.fn(async () => methods) };
  const service = new BookingService(
    repository as never,
    ledger as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    paymentPolicy
  );
  return { ledger, paymentPolicy, repository, service };
};

describe("platform payment settings", () => {
  it("adds the authoritative available methods to checkout projections", async () => {
    const { paymentPolicy, service } = createService(["ndp"]);

    await expect(service.getCheckout(customer, 41)).resolves.toMatchObject({
      orderId: 41,
      availablePaymentMethods: ["ndp"]
    });
    expect(paymentPolicy.getAvailablePaymentMethods).toHaveBeenCalledTimes(1);
  });

  it("rejects a disabled offline method before repository mutation", async () => {
    const { repository, service } = createService(["ndp"]);

    await expect(
      service.selectCheckoutPaymentMethod(
        customer,
        41,
        { method: "cash", idempotencyKey: "platform-payment-cash-0001" },
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ statusCode: 409, message: "error.payment.method_disabled" });
    expect(repository.selectCheckoutPaymentMethod).not.toHaveBeenCalled();
  });

  it("rejects disabled NDP before the ledger or repository can mutate", async () => {
    const { ledger, repository, service } = createService(["cash"]);

    await expect(
      service.payCheckoutWithNdp(
        customer,
        41,
        { idempotencyKey: "platform-payment-ndp-00001" },
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ statusCode: 409, message: "error.payment.method_disabled" });
    expect(ledger.debitCheckoutPayment).not.toHaveBeenCalled();
    expect(repository.payCheckoutWithNdp).not.toHaveBeenCalled();
  });

  it.each(["paypay", "paypal", "stripe", "other_manual"])(
    "keeps the %s project entry unavailable instead of treating it as manual payment",
    async (otherMethodCode) => {
      const { repository, service } = createService(["cash", "ndp"]);

      await expect(
        service.selectCheckoutPaymentMethod(
          customer,
          41,
          {
            method: "other",
            otherMethodCode,
            otherMethodLabel: otherMethodCode,
            idempotencyKey: `platform-provider-${otherMethodCode}-0001`
          },
          { ip: "127.0.0.1", userAgent: "jest" }
        )
      ).rejects.toMatchObject({
        statusCode: 503,
        message: "error.payment.provider_unconfigured"
      });
      expect(repository.selectCheckoutPaymentMethod).not.toHaveBeenCalled();
    }
  );
});
