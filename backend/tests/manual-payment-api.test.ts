import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { BookingOrderPayload } from "../src/repositories/booking.repository";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

class InMemorySessionStore {
  private readonly values = new Map<string, string>();
  public async getLoginLock(): Promise<boolean> {
    return false;
  }
  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async clearFailedLogin(): Promise<void> {
    return undefined;
  }
  public async storeOtp(email: string, otp: string): Promise<void> {
    this.values.set(`otp:${email}`, otp);
  }
  public async getOtp(email: string): Promise<string | null> {
    return this.values.get(`otp:${email}`) ?? null;
  }
  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
  }
  public async hasOtpCooldown(): Promise<boolean> {
    return false;
  }
  public async storeOtpCooldown(): Promise<void> {
    return undefined;
  }
  public async clearOtpCooldown(): Promise<void> {
    return undefined;
  }
  public async storeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.set(`refresh:${userId}:${jti}`, "1");
  }
  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.values.has(`refresh:${userId}:${jti}`);
  }
  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`refresh:${userId}:${jti}`);
  }
  public async blacklistAccessToken(jti: string): Promise<void> {
    this.values.set(`blacklist:${jti}`, "1");
  }
  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.values.has(`blacklist:${jti}`);
  }
}

const now = new Date("2026-08-25T00:00:00.000Z");

const makeOrder = (overrides: Partial<BookingOrderPayload> = {}): BookingOrderPayload => ({
  id: 91,
  orderNo: "ND202608250091",
  orderType: "booking",
  status: "confirmed",
  paymentMethod: "onsite",
  paymentStatus: "pending",
  paymentAmountJpy: 8800,
  paymentConfirmedById: null,
  paymentConfirmedAt: null,
  paymentReference: null,
  paymentNote: null,
  paymentRefundedById: null,
  paymentRefundedAt: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
  customerUserId: 3,
  serviceId: 1,
  technicianServiceId: null,
  shopId: 11,
  technicianProfileId: 31,
  scheduleSlotId: 21,
  fulfillmentMode: "store",
  serviceName: "Shiatsu Recovery",
  pricingModeSnapshot: "merchant",
  serviceOwnerType: "shop",
  serviceOwnerId: 1,
  serviceNameSnapshot: "Shiatsu Recovery",
  servicePriceSnapshot: "8800.00",
  serviceDurationSnapshot: 60,
  fulfillmentAddressSnapshot: null,
  serviceSnapshot: null,
  shopName: "Aoyama Studio",
  technicianName: "Mika",
  priceAmount: "8800.00",
  currency: "JPY",
  startsAt: now,
  endsAt: new Date(now.getTime() + 60 * 60 * 1000),
  note: null,
  cancelReason: null,
  createdAt: now,
  updatedAt: now,
  statusHistory: [],
  performanceAssessment: null,
  timelineEvents: [],
  affiliate: null,
  ...overrides
});

const createFixture = async (
  options: { refundSourceOrder?: BookingOrderPayload; refundConflict?: boolean } = {}
) => {
  const passwordHash = await hash("Abcd@1234", 12);
  const role = (code: string, permissionCodes: string[]) => ({
    code,
    deletedAt: null,
    rolePermissions: permissionCodes.map((permission, index) => ({
      deletedAt: null,
      permission: { id: index + 1, code: permission, type: "api", deletedAt: null }
    }))
  });
  const users = [
    {
      id: 1,
      email: "merchant@example.com",
      phone: null,
      passwordHash,
      username: "Merchant",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [
        {
          id: 1,
          userId: 1,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 11,
          displayName: "Merchant",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [
        { deletedAt: null, role: role("merchant_owner", ["merchant-admin:order-payment:write"]) }
      ]
    },
    {
      id: 2,
      email: "operator@example.com",
      phone: null,
      passwordHash,
      username: "Operator",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [
        {
          id: 2,
          userId: 2,
          type: "platform",
          scopeType: "global",
          scopeId: null,
          displayName: "Operator",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: role("operator", ["backoffice:order-payment:write"]) }]
    },
    {
      id: 3,
      email: "customer@example.com",
      phone: null,
      passwordHash,
      username: "Customer",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [
        {
          id: 3,
          userId: 3,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 3,
          displayName: "Customer",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: role("customer", []) }]
    }
  ];
  const auditLogs: Array<Record<string, unknown>> = [];
  const refundSourceOrder =
    options.refundSourceOrder ?? makeOrder({ status: "cancelled", paymentStatus: "refundPending" });
  const bookingRepository = {
    findOrderById: jest.fn(async () => refundSourceOrder),
    confirmManualPayment: jest.fn(async (input: { actorUserId: number }) => ({
      outcome: "ok" as const,
      applied: true,
      order: makeOrder({
        paymentStatus: "confirmed",
        paymentConfirmedById: input.actorUserId,
        paymentConfirmedAt: now
      })
    })),
    refundManualPayment: jest.fn(
      async (input: { actorUserId: number; reference?: string | null; reason: string }) => {
        if (options.refundConflict) return { outcome: "conflict" as const };
        return {
          outcome: "ok" as const,
          applied: true,
          order: makeOrder({
            status: "cancelled",
            paymentStatus: "refunded",
            paymentRefundedById: input.actorUserId,
            paymentRefundedAt: now,
            paymentRefundReference: input.reference ?? null,
            paymentRefundReason: input.reason
          })
        };
      }
    )
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((user) => user.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (identifier: string) => users.find((user) => user.email === identifier) ?? null
      ),
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
      updateLastLoginAt: jest.fn(async () => undefined),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemorySessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository: {
      create: jest.fn(async (entry: Record<string, unknown>) => {
        auditLogs.push(entry);
      })
    },
    bookingRepository,
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 11 })
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };

  return { app, auditLogs, bookingRepository, login };
};

describe("manual payment API", () => {
  it("confirms an onsite payment with authenticated merchant shop scope", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    const response = await request(fixture.app)
      .post("/api/v1/merchant-admin/orders/91/payment/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ method: "onsite", amountJpy: 8800, reference: "POS-001", note: "现金收款" })
      .expect(200);

    expect(response.body.data.paymentStatus).toBe("confirmed");
    expect(fixture.bookingRepository.confirmManualPayment).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "merchant", shopId: 11, orderId: 91, actorUserId: 1 })
    );
    expect(
      fixture.auditLogs.some((entry) => entry.action === "merchant_admin.order_payment.confirm")
    ).toBe(true);
  });

  it("lets backoffice mark a cancelled payment refunded", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("operator@example.com");

    const response = await request(fixture.app)
      .post("/api/v1/backoffice/orders/91/payment/refund")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "客户退款", reference: "REF-001" })
      .expect(200);

    expect(response.body.data.paymentStatus).toBe("refunded");
    expect(fixture.bookingRepository.refundManualPayment).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "backoffice", orderId: 91, actorUserId: 2 })
    );
    expect(
      fixture.auditLogs.some((entry) => entry.action === "backoffice.order_payment.refund")
    ).toBe(true);
  });

  it.each([
    ["merchant-admin", "merchant@example.com"],
    ["backoffice", "operator@example.com"]
  ] as const)(
    "rejects completed confirmed payments through the %s direct-refund endpoint without mutation",
    async (portal, email) => {
      const completed = makeOrder({ status: "completed", paymentStatus: "confirmed" });
      const fixture = await createFixture({ refundSourceOrder: completed });
      const token = await fixture.login(email);

      const response = await request(fixture.app)
        .post(`/api/v1/${portal}/orders/91/payment/refund`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "must use the completed-order refund case", reference: "REF-BYPASS" })
        .expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.PAYMENT_INVALID_STATE,
        message: "error.payment.invalid_state",
        data: null
      });
      expect(fixture.bookingRepository.refundManualPayment).not.toHaveBeenCalled();
      expect(
        fixture.auditLogs.some((entry) => String(entry.action).endsWith(".order_payment.refund"))
      ).toBe(false);
    }
  );

  it("maps a backoffice direct-refund CAS conflict without writing an audit", async () => {
    const fixture = await createFixture({ refundConflict: true });
    const token = await fixture.login("operator@example.com");

    const response = await request(fixture.app)
      .post("/api/v1/backoffice/orders/91/payment/refund")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "cancelled before completion", reference: "REF-CAS-CONFLICT" })
      .expect(409);

    expect(response.body).toEqual({
      code: ERROR_CODES.PAYMENT_CONFLICT,
      message: "error.payment.conflict",
      data: null
    });
    expect(fixture.bookingRepository.refundManualPayment).toHaveBeenCalledTimes(1);
    expect(
      fixture.auditLogs.some((entry) => String(entry.action).endsWith(".order_payment.refund"))
    ).toBe(false);
  });

  it("rejects unsupported payment methods and customers without payment permissions", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");
    await request(fixture.app)
      .post("/api/v1/merchant-admin/orders/91/payment/confirm")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ method: "platform_online", amountJpy: 8800 })
      .expect(400);

    const customerToken = await fixture.login("customer@example.com");
    await request(fixture.app)
      .post("/api/v1/backoffice/orders/91/payment/confirm")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ method: "onsite", amountJpy: 8800 })
      .expect(403);
  });
});
