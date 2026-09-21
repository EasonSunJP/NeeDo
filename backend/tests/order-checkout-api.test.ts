import express from "express";
import request from "supertest";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import type {
  BookingRepositoryPort,
  OrderCheckoutPayload
} from "../src/repositories/booking.repository";
import { createBookingRoutes } from "../src/routes/booking.routes";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const now = new Date("2026-09-01T10:00:00.000Z");
const checkout: OrderCheckoutPayload = {
  id: 9,
  orderId: 41,
  status: "awaitingCheckout",
  baseAmountJpy: 8_800,
  addOnAmountJpy: 2_200,
  travelFareAmountJpy: 0,
  discountAmountJpy: 800,
  checkoutAmountJpy: 10_200,
  payableNdp: 15_300,
  rate: {
    ruleId: 7,
    publicId: "00000000-0000-4000-8000-000000000007",
    version: 3,
    ndpUnits: 3,
    jpyUnits: 2,
    effectiveFrom: "2026-08-01T00:00:00.000Z"
  },
  calculation: {
    formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount",
    baseAmountJpy: 8_800,
    acceptedAddOnIds: [3],
    addOnAmountJpy: 2_200,
    travelFareAmountJpy: 0,
    discountAmountJpy: 800,
    checkoutAmountJpy: 10_200,
    rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)"
  },
  paymentMethod: null,
  paymentSelectedAt: null,
  otherMethod: null,
  paymentEvidence: null,
  receiptConfirmedAt: null,
  receiptConfirmationReason: null,
  createdAt: now,
  updatedAt: now
};

const permissions = [
  "order:checkout:read",
  "order:checkout:payment-method:write",
  "order:checkout:ndp:pay",
  "order:checkout:receipt:confirm",
  "merchant-admin:order:checkout:receipt-override",
  "backoffice:order:checkout:receipt-override"
];

const createFixture = (availablePaymentMethods: Array<"cash" | "ndp"> = ["cash", "ndp"]) => {
  jest.spyOn(authServiceFactory, "createAuthServiceForRoutes").mockReturnValue({
    authenticateAccessToken: jest.fn(async (token: string) => {
      const base = {
        userId: 101,
        roles: ["customer"],
        permissions,
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: 501
      };
      if (token === "none") return { ...base, permissions: [] };
      if (token === "outsider") return { ...base, userId: 999 };
      if (token === "technician")
        return {
          ...base,
          userId: 202,
          roles: ["technician"],
          currentIdentityType: "technician",
          currentIdentityScopeType: "technician_profile",
          currentIdentityScopeId: 702
        };
      if (token === "operator")
        return {
          ...base,
          userId: 303,
          roles: ["operator"],
          currentIdentityType: "operator",
          currentIdentityScopeType: "global",
          currentIdentityScopeId: null
        };
      if (token === "merchant")
        return {
          ...base,
          userId: 404,
          roles: ["merchant_owner"],
          currentIdentityType: "merchant",
          currentIdentityScopeType: "shop",
          currentIdentityScopeId: 12
        };
      return base;
    })
  } as never);
  const outcome = (actorUserId: number, next: OrderCheckoutPayload = checkout) =>
    actorUserId === 999
      ? ({ outcome: "not_found" } as const)
      : ({ outcome: "ok", applied: true, checkout: next } as const);
  const repository = {
    getOrCreateCheckout: jest.fn(async (input: { actorUserId: number }) =>
      outcome(input.actorUserId)
    ),
    selectCheckoutPaymentMethod: jest.fn(
      async (input: { actorUserId: number; idempotencyKey: string; method: string }) =>
        input.idempotencyKey === "checkout-conflict-key-0001"
          ? ({ outcome: "conflict" } as const)
          : outcome(input.actorUserId, {
              ...checkout,
              status: input.method === "ndp" ? "awaitingCheckout" : "awaitingPaymentConfirmation",
              paymentMethod: input.method as "cash" | "ndp" | "other"
            })
    ),
    payCheckoutWithNdp: jest.fn(async (input: { actorUserId: number }) =>
      outcome(input.actorUserId, {
        ...checkout,
        status: "completed",
        paymentMethod: "ndp",
        paymentEvidence: "ndp_ledger"
      })
    ),
    confirmCheckoutReceipt: jest.fn(
      async (input: {
        actorUserId: number;
        evidence:
          | "technician_receipt_confirmation"
          | "merchant_receipt_override"
          | "operations_receipt_override";
      }) =>
        outcome(input.actorUserId, {
          ...checkout,
          status: "completed",
          paymentMethod: "cash",
          paymentEvidence: input.evidence,
          receiptConfirmedAt: now,
          receiptConfirmationReason: "cash received"
        })
    ),
    findOrderById: jest.fn(async () => null)
  } as unknown as jest.Mocked<BookingRepositoryPort>;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createBookingRoutes(env, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      bookingRepository: repository,
      ledgerRepository: {} as never,
      affiliateCheckoutService: {} as never,
      ndpExchangeRateService: { resolveEffectiveRate: jest.fn() } as never,
      platformAccessPolicyService: {
        getAvailablePaymentMethods: jest.fn(async () => availablePaymentMethods)
      } as never
    })
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, repository };
};

describe("formal order checkout API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("runs all six routes through the real router, auth, validators and controller", async () => {
    const f = createFixture();
    await request(f.app)
      .get("/api/v1/orders/41/checkout")
      .set("Authorization", "Bearer customer")
      .expect(200);
    await request(f.app)
      .post("/api/v1/orders/41/checkout/payment-method")
      .set("Authorization", "Bearer customer")
      .send({ method: "cash", idempotencyKey: "checkout-select-key-0001" })
      .expect(200);
    await request(f.app)
      .post("/api/v1/orders/41/checkout/pay/ndp")
      .set("Authorization", "Bearer customer")
      .send({ idempotencyKey: "checkout-pay-key-000001" })
      .expect(200);
    await request(f.app)
      .post("/api/v1/orders/41/checkout/confirm-receipt")
      .set("Authorization", "Bearer technician")
      .send({ reason: "cash received", idempotencyKey: "checkout-receipt-key-01" })
      .expect(200);
    await request(f.app)
      .post("/api/v1/merchant-admin/orders/41/checkout/confirm-receipt")
      .set("Authorization", "Bearer merchant")
      .send({ reason: "merchant verified cash", idempotencyKey: "checkout-merchant-key-01" })
      .expect(200);
    await request(f.app)
      .post("/api/v1/backoffice/orders/41/checkout/confirm-receipt")
      .set("Authorization", "Bearer operator")
      .send({ reason: "operations verified receipt", idempotencyKey: "checkout-override-key-01" })
      .expect(200);
    expect(f.repository.getOrCreateCheckout).toHaveBeenCalledTimes(1);
    expect(f.repository.selectCheckoutPaymentMethod).toHaveBeenCalledTimes(1);
    expect(f.repository.payCheckoutWithNdp).toHaveBeenCalledTimes(1);
    expect(f.repository.confirmCheckoutReceipt).toHaveBeenCalledTimes(3);
    expect(f.repository.confirmCheckoutReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 404,
        merchantShopId: 12,
        evidence: "merchant_receipt_override",
        audit: expect.objectContaining({
          action: "merchant_admin.order.checkout.receipt_override"
        })
      }),
      expect.any(Object)
    );
  });

  it("enforces strict 400, authentication 401, exact permission 403 and hidden actor mismatch 404", async () => {
    const f = createFixture();
    await request(f.app)
      .post("/api/v1/orders/41/checkout/payment-method")
      .set("Authorization", "Bearer customer")
      .send({ method: "cash", idempotencyKey: "checkout-strict-key-001", walletBalance: 1 })
      .expect(400);
    await request(f.app).get("/api/v1/orders/41/checkout").expect(401);
    await request(f.app)
      .get("/api/v1/orders/41/checkout")
      .set("Authorization", "Bearer none")
      .expect(403);
    await request(f.app)
      .get("/api/v1/orders/41/checkout")
      .set("Authorization", "Bearer outsider")
      .expect(404);
  });

  it("projects and enforces the payment methods enabled in platform settings", async () => {
    const f = createFixture(["ndp"]);
    const response = await request(f.app)
      .get("/api/v1/orders/41/checkout")
      .set("Authorization", "Bearer customer")
      .expect(200);
    expect(response.body.data.availablePaymentMethods).toEqual(["ndp"]);

    await request(f.app)
      .post("/api/v1/orders/41/checkout/payment-method")
      .set("Authorization", "Bearer customer")
      .send({ method: "cash", idempotencyKey: "checkout-disabled-cash-01" })
      .expect(409)
      .expect({
        code: ERROR_CODES.PLATFORM_PAYMENT_METHOD_DISABLED,
        message: "error.payment.method_disabled",
        data: null
      });
    await request(f.app)
      .post("/api/v1/orders/41/checkout/payment-method")
      .set("Authorization", "Bearer customer")
      .send({
        method: "other",
        otherMethodCode: "paypay",
        otherMethodLabel: "PayPay",
        idempotencyKey: "checkout-paypay-entry-001"
      })
      .expect(503)
      .expect({
        code: ERROR_CODES.PAYMENT_PROVIDER_UNCONFIGURED,
        message: "error.payment.provider_unconfigured",
        data: null
      });
    expect(f.repository.selectCheckoutPaymentMethod).not.toHaveBeenCalled();
  });

  it("returns stable 409 for semantic key reuse and keeps legacy generic completion absent", async () => {
    const f = createFixture();
    await request(f.app)
      .post("/api/v1/orders/41/checkout/payment-method")
      .set("Authorization", "Bearer customer")
      .send({ method: "cash", idempotencyKey: "checkout-conflict-key-0001" })
      .expect(409)
      .expect({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.idempotency.key_reused",
        data: null
      });
    await request(f.app)
      .post("/api/v1/orders/41/start")
      .set("Authorization", "Bearer customer")
      .send({})
      .expect(404);
    await request(f.app)
      .post("/api/v1/orders/41/complete")
      .set("Authorization", "Bearer customer")
      .send({})
      .expect(404);
  });

  it("does not expose idempotency, wallet, raw ledger, or audit internals", async () => {
    const f = createFixture();
    const response = await request(f.app)
      .get("/api/v1/orders/41/checkout")
      .set("Authorization", "Bearer customer")
      .expect(200);
    expect(JSON.stringify(response.body.data)).not.toMatch(
      /idempotency|wallet|ledgerTransaction|audit|activeKey|verification/i
    );
  });

  it("assigns least-privilege checkout permissions with a distinct merchant override", () => {
    const roles = buildRolePermissionAssignments();
    expect(roles.customer).toEqual(
      expect.arrayContaining([
        "order:checkout:read",
        "order:checkout:payment-method:write",
        "order:checkout:ndp:pay"
      ])
    );
    expect(roles.technician).toEqual(
      expect.arrayContaining(["order:checkout:read", "order:checkout:receipt:confirm"])
    );
    expect(roles.operator).toContain("backoffice:order:checkout:receipt-override");
    expect(roles.merchant_owner).not.toContain("order:checkout:receipt:confirm");
    expect(roles.merchant_staff).not.toContain("order:checkout:receipt:confirm");
    expect(roles.merchant_owner).toContain("merchant-admin:order:checkout:receipt-override");
    expect(roles.merchant_staff).toContain("merchant-admin:order:checkout:receipt-override");
  });
});
