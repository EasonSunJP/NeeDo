import { hash } from "bcryptjs";
import express from "express";
import request from "supertest";
import { createApp, type AppDependencies } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { AppError } from "../src/utils/app-error";
import { orderConfirmBodySchema } from "../src/validators/booking.validator";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();
  private readonly failureCounts = new Map<string, number>();

  public async getLoginLock(email: string): Promise<boolean> {
    return this.getValue(`login:lock:${email}`) !== null;
  }

  public async recordFailedLogin(
    ip: string,
    email: string,
    options: { failureLimit: number; windowSeconds: number; lockSeconds: number }
  ): Promise<{ count: number; locked: boolean }> {
    const key = `login:fail:${ip}:${email}`;
    const nextCount = (this.failureCounts.get(key) ?? 0) + 1;
    this.failureCounts.set(key, nextCount);
    this.setValue(key, String(nextCount), options.windowSeconds);

    if (nextCount >= options.failureLimit) {
      this.setValue(`login:lock:${email}`, "1", options.lockSeconds);
      return { count: nextCount, locked: true };
    }

    return { count: nextCount, locked: false };
  }

  public async clearFailedLogin(ip: string, email: string): Promise<void> {
    this.failureCounts.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:lock:${email}`);
  }

  public async storeOtp(email: string, otp: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:${email}`, otp, ttlSeconds);
  }

  public async getOtp(email: string): Promise<string | null> {
    return this.getValue(`otp:${email}`);
  }

  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
  }

  public async hasOtpCooldown(email: string): Promise<boolean> {
    return this.getValue(`otp:cooldown:${email}`) !== null;
  }

  public async storeOtpCooldown(email: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:cooldown:${email}`, "1", ttlSeconds);
  }

  public async clearOtpCooldown(email: string): Promise<void> {
    this.values.delete(`otp:cooldown:${email}`);
  }

  public async storeRefreshToken(userId: number, jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`refresh:${userId}:${jti}`, "1", ttlSeconds);
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.getValue(`refresh:${userId}:${jti}`) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`refresh:${userId}:${jti}`);
  }

  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`token:blacklist:${jti}`, "1", ttlSeconds);
  }

  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.getValue(`token:blacklist:${jti}`) !== null;
  }

  private setValue(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  private getValue(key: string): string | null {
    const stored = this.values.get(key);

    if (!stored) {
      return null;
    }

    if (stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }

    return stored.value;
  }
}

const now = new Date("2026-05-25T00:00:00.000Z");
const slotStart = new Date("2026-05-26T01:00:00.000Z");
const slotEnd = new Date("2026-05-26T02:00:00.000Z");

const makePermission = (code: string, index: number) => ({
  id: index + 1,
  name: code,
  code,
  type: "api",
  module: code.split(":")[0],
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createFixture = async (
  technicianBookingAutomationProcessor?: AppDependencies["technicianBookingAutomationProcessor"]
) => {
  const passwordHash = await hash("Abcd@1234", 12);
  const permissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "booking:create",
    "order:list",
    "order:read",
    "order:confirm",
    "order:cancel",
    "order:service:start",
    "order:add-on:write",
    "order:service:end"
  ].map(makePermission);
  const role = {
    id: 1,
    name: "Customer",
    code: "customer",
    description: "Customer booking role",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((permission, index) => ({
      id: index + 1,
      roleId: 1,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };
  const user = {
    id: 1,
    email: "customer@example.com",
    phone: null,
    passwordHash,
    username: "Aya Customer",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: 1,
        userId: 1,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: 1,
        displayName: "Aya Customer",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      {
        id: 1,
        userId: 1,
        roleId: 1,
        scopeType: "customer_profile",
        scopeId: 1,
        deletedAt: null,
        role
      }
    ]
  };
  const statusHistory: Array<{
    id: number;
    orderId: number;
    fromStatus: string | null;
    toStatus: string;
    actorUserId: number | null;
    reason: string | null;
    createdAt: Date;
  }> = [];
  const timelineEvents: Array<{
    type: "ORDER_STATUS_CHANGED";
    id: string;
    createdAt: Date;
    actorUserId: number | null;
    fromStatus: string | null;
    toStatus: string;
    publicReason: string | null;
  }> = [];
  const slot = {
    id: 11,
    serviceId: 1,
    technicianServiceId: null,
    shopId: 1,
    technicianProfileId: 1,
    startsAt: slotStart,
    endsAt: slotEnd,
    capacity: 1,
    bookedCount: 0,
    status: "available",
    serviceName: "Shiatsu Recovery",
    shopName: "Aoyama Care Studio",
    technicianName: "Mika Tanaka",
    priceAmount: "8800.00",
    currency: "JPY",
    durationMinutes: 60
  };
  let order: {
    id: number;
    orderNo: string;
    orderType: string;
    status: string;
    paymentMethod: "onsite" | "bank_transfer";
    paymentStatus: "pending" | "confirmed" | "refundPending" | "refunded";
    paymentAmountJpy: number;
    paymentConfirmedById: number | null;
    paymentConfirmedAt: Date | null;
    paymentReference: string | null;
    paymentNote: string | null;
    paymentRefundedById: number | null;
    paymentRefundedAt: Date | null;
    paymentRefundReference: string | null;
    paymentRefundReason: string | null;
    customerUserId: number;
    serviceId: number | null;
    technicianServiceId: number | null;
    shopId: number;
    technicianProfileId: number | null;
    scheduleSlotId: number;
    fulfillmentMode: string;
    serviceName: string;
    pricingModeSnapshot: "merchant" | "technician";
    serviceOwnerType: "shop" | "technician";
    serviceOwnerId: number | null;
    serviceNameSnapshot: string | null;
    servicePriceSnapshot: string | null;
    serviceDurationSnapshot: number | null;
    serviceSnapshot: unknown;
    shopName: string;
    technicianName: string | null;
    priceAmount: string;
    currency: string;
    startsAt: Date;
    endsAt: Date;
    note: string | null;
    cancelReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    statusHistory: typeof statusHistory;
    performanceAssessment: null;
    timelineEvents: typeof timelineEvents;
  } | null = null;
  const bookingRepository = {
    findScheduleSlotShopId: jest.fn(async (scheduleSlotId: number) =>
      scheduleSlotId === slot.id ? slot.shopId : null
    ),
    listAvailableSlots: jest.fn(async () => ({
      list: slot.status === "available" ? [slot] : [],
      total: slot.status === "available" ? 1 : 0,
      page: 1,
      page_size: 20
    })),
    createBooking: jest.fn(
      async (input: {
        customerUserId: number;
        orderType?: "booking" | "request";
        note?: string | null;
      }) => {
        if (slot.bookedCount >= slot.capacity || slot.status !== "available" || order) {
          return null;
        }

        slot.bookedCount += 1;
        slot.status = "booked";
        statusHistory.push({
          id: 1,
          orderId: 1,
          fromStatus: null,
          toStatus: "pending",
          actorUserId: input.customerUserId,
          reason: null,
          createdAt: now
        });
        timelineEvents.push({
          type: "ORDER_STATUS_CHANGED",
          id: "status:1",
          createdAt: now,
          actorUserId: input.customerUserId,
          fromStatus: null,
          toStatus: "pending",
          publicReason: null
        });
        order = {
          id: 1,
          orderNo: "ND202605260001",
          orderType: input.orderType ?? "booking",
          status: "pending",
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
          customerUserId: input.customerUserId,
          serviceId: slot.serviceId,
          technicianServiceId: slot.technicianServiceId,
          shopId: slot.shopId,
          technicianProfileId: slot.technicianProfileId,
          scheduleSlotId: slot.id,
          fulfillmentMode: "store",
          serviceName: slot.serviceName,
          pricingModeSnapshot: "merchant",
          serviceOwnerType: "shop",
          serviceOwnerId: slot.serviceId,
          serviceNameSnapshot: slot.serviceName,
          servicePriceSnapshot: slot.priceAmount,
          serviceDurationSnapshot: slot.durationMinutes,
          serviceSnapshot: null,
          shopName: slot.shopName,
          technicianName: slot.technicianName,
          priceAmount: slot.priceAmount,
          currency: slot.currency,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          note: input.note ?? null,
          cancelReason: null,
          createdAt: now,
          updatedAt: now,
          statusHistory,
          performanceAssessment: null,
          timelineEvents
        };

        return order;
      }
    ),
    listOrders: jest.fn(async () => ({
      list: order ? [order] : [],
      total: order ? 1 : 0,
      page: 1,
      page_size: 20
    })),
    findOrderById: jest.fn(async (id: number) => (order?.id === id ? order : null)),
    transitionOrder: jest.fn(
      async (input: {
        id: number;
        actorUserId: number;
        fromStatus: string;
        toStatus: string;
        reason?: string | null;
      }) => {
        if (!order || order.id !== input.id || order.status !== input.fromStatus) {
          return null;
        }

        order.status = input.toStatus;
        order.cancelReason =
          input.toStatus === "cancelled" ? (input.reason ?? null) : order.cancelReason;
        order.updatedAt = now;
        statusHistory.push({
          id: statusHistory.length + 1,
          orderId: order.id,
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          actorUserId: input.actorUserId,
          reason: input.reason ?? null,
          createdAt: now
        });
        timelineEvents.push({
          type: "ORDER_STATUS_CHANGED",
          id: `status:${statusHistory.length}`,
          createdAt: now,
          actorUserId: input.actorUserId,
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          publicReason: input.reason ?? null
        });

        return order;
      }
    )
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(async (email: string) => (email === user.email ? user : null)),
      findUserByLoginIdentifier: jest.fn(async (identifier: string) =>
        identifier === user.email || identifier === user.username ? user : null
      ),
      findUserById: jest.fn(async (id: number) => (id === user.id ? user : null)),
      updateLastLoginAt: jest.fn(async (_id: number, loggedInAt: Date) => {
        user.lastLoginAt = loggedInAt;
      }),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    bookingRepository,
    technicianBookingAutomationProcessor,
    shopVisibilityRepository: {
      buildVisibilityWhere: jest.fn(async () => ({ visibility: "public" })),
      canView: jest.fn(async () => true),
      canViewTarget: jest.fn(async () => true),
      findVisibility: jest.fn(),
      updateVisibility: jest.fn()
    }
  } as never);
  const login = async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: user.email, password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  return { app, bookingRepository, login };
};

describe("Step 10 Booking / Schedule / Order state machine API", () => {
  it("runs Booking automation after the committed Booking is returned", async () => {
    const processBooking = jest.fn(async () => undefined);
    const fixture = await createFixture(
      { processBooking } as unknown as AppDependencies["technicianBookingAutomationProcessor"]
    );
    const token = await fixture.login();

    await request(fixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
      .expect(201);

    expect(fixture.bookingRepository.createBooking).toHaveBeenCalledTimes(1);
    expect(processBooking).toHaveBeenCalledWith(1);
    expect(fixture.bookingRepository.createBooking.mock.invocationCallOrder[0]).toBeLessThan(
      processBooking.mock.invocationCallOrder[0]
    );
  });

  it("validates the strict insufficient-balance confirmation contract", () => {
    const previewVersion = `sha256:${"0".repeat(64)}`;

    expect(orderConfirmBodySchema.parse({})).toEqual({});
    expect(
      orderConfirmBodySchema.parse({
        insufficientBalanceConfirmation: {
          confirmed: true,
          idempotencyKey: "fee-confirm-1234567890",
          previewVersion
        }
      })
    ).toEqual({
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: "fee-confirm-1234567890",
        previewVersion
      }
    });
    expect(() => orderConfirmBodySchema.parse({ unknown: true })).toThrow();
    expect(() =>
      orderConfirmBodySchema.parse({
        insufficientBalanceConfirmation: {
          confirmed: false,
          idempotencyKey: "fee-confirm-1234567890",
          previewVersion
        }
      })
    ).toThrow();
  });

  it("serializes only explicitly supplied safe AppError preview data", async () => {
    const app = express();
    const previewVersion = `sha256:${"1".repeat(64)}`;
    app.get("/structured-error", (_request, _response, next) => {
      next(
        new AppError({
          code: ERROR_CODES.PLATFORM_FEE_INSUFFICIENT_CONFIRMATION_REQUIRED,
          message: "error.platform_fee.insufficient_balance_confirmation_required",
          statusCode: 409,
          data: {
            feeAmountNdp: 500,
            availableBalanceNdp: 120,
            shortfallNdp: 380,
            payerType: "shop",
            walletOwnerType: "shop",
            previewVersion
          }
        })
      );
    });
    app.use(errorMiddleware);

    await request(app)
      .get("/structured-error")
      .expect(409)
      .expect({
        code: ERROR_CODES.PLATFORM_FEE_INSUFFICIENT_CONFIRMATION_REQUIRED,
        message: "error.platform_fee.insufficient_balance_confirmation_required",
        data: {
          feeAmountNdp: 500,
          availableBalanceNdp: 120,
          shortfallNdp: 380,
          payerType: "shop",
          walletOwnerType: "shop",
          previewVersion
        }
      });
  });

  it("passes validated overlap bounds through the authenticated order route", async () => {
    const fixture = await createFixture();
    const token = await fixture.login();
    await request(fixture.app).get("/api/v1/orders?from=2026-09-06T15:00:00.000Z&to=2026-09-07T15:00:00.000Z&dateMode=overlaps")
      .set("Authorization", `Bearer ${token}`).expect(200);
    expect(fixture.bookingRepository.listOrders).toHaveBeenCalledWith(expect.objectContaining({
      dateMode: "overlaps", from: new Date("2026-09-06T15:00:00.000Z"), to: new Date("2026-09-07T15:00:00.000Z")
    }));
  });

  it("rejects unknown fields on the order confirmation endpoint", async () => {
    const fixture = await createFixture();
    const token = await fixture.login();

    await request(fixture.app)
      .post("/api/v1/orders/1/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ unknown: true })
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual({
          code: ERROR_CODES.VALIDATION,
          message: "error.validation",
          data: null
        });
      });

    expect(fixture.bookingRepository.transitionOrder).not.toHaveBeenCalled();
  });

  it("lists a published technician availability window without a service filter", async () => {
    const fixture = await createFixture();

    await request(fixture.app)
      .get(
        "/api/v1/schedule/availability?technicianId=1&from=2026-05-26T00:00:00.000Z&to=2026-05-27T00:00:00.000Z&page=1&pageSize=100"
      )
      .expect(200);

    expect(fixture.bookingRepository.listAvailableSlots).toHaveBeenCalledWith(
      {
        technicianId: 1,
        from: new Date("2026-05-26T00:00:00.000Z"),
        to: new Date("2026-05-27T00:00:00.000Z"),
        page: 1,
        pageSize: 100
      },
      { visibility: "public" }
    );
  });

  it("forwards the opt-in unavailable-slot flag to the public availability repository query", async () => {
    const fixture = await createFixture();

    await request(fixture.app)
      .get(
        "/api/v1/schedule/availability?serviceId=1&includeUnavailable=true&from=2026-05-26T00:00:00.000Z&to=2026-05-27T00:00:00.000Z&page=1&pageSize=100"
      )
      .expect(200);

    expect(fixture.bookingRepository.listAvailableSlots).toHaveBeenCalledWith(
      {
        serviceId: 1,
        includeUnavailable: true,
        from: new Date("2026-05-26T00:00:00.000Z"),
        to: new Date("2026-05-27T00:00:00.000Z"),
        page: 1,
        pageSize: 100
      },
      { visibility: "public" }
    );
  });

  it("scopes availability conflicts to the authenticated viewer and prevents caching", async () => {
    const fixture = await createFixture();
    const token = await fixture.login();
    await request(fixture.app)
      .get("/api/v1/schedule/availability?technicianId=1&customerUserId=9999&from=2026-05-26T00:00:00.000Z&to=2026-05-27T00:00:00.000Z")
      .set("Authorization", `Bearer ${token}`)
      .expect("Cache-Control", "no-store")
      .expect(200);
    expect(fixture.bookingRepository.listAvailableSlots).toHaveBeenCalledWith(
      expect.objectContaining({ technicianId: 1 }),
      { visibility: "public" },
      1
    );
    const availabilityCalls = fixture.bookingRepository.listAvailableSlots.mock.calls as unknown[][];
    expect(availabilityCalls[0]?.[0]).not.toHaveProperty("customerUserId");
  });

  it("rejects unscoped and longer-than-93-day public availability windows", async () => {
    const fixture = await createFixture();

    await request(fixture.app)
      .get(
        "/api/v1/schedule/availability?from=2026-05-26T00:00:00.000Z&to=2026-05-27T00:00:00.000Z"
      )
      .expect(400);
    await request(fixture.app)
      .get(
        "/api/v1/schedule/availability?technicianId=1&from=2026-05-26T00:00:00.000Z&to=2026-08-27T00:00:00.001Z"
      )
      .expect(400);

    expect(fixture.bookingRepository.listAvailableSlots).not.toHaveBeenCalled();
  });

  it("rejects client-selected customer scope and unknown checkout fields", async () => {
    const fixture = await createFixture();
    const token = await fixture.login();

    await request(fixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store",
        customerUserId: 999
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.VALIDATION);
      });
  });

  it("requires the price shown on the final confirmation page", async () => {
    const fixture = await createFixture();
    const token = await fixture.login();

    await request(fixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ serviceId: 1, scheduleSlotId: 11, fulfillmentMode: "store" })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.VALIDATION);
      });

    expect(fixture.bookingRepository.createBooking).not.toHaveBeenCalled();
  });

  it("requires and forwards an idempotency key for Intelligence booking creation", async () => {
    const fixture = await createFixture();
    const token = await fixture.login();
    const body = {
      expectedPriceAmountJpy: 8_800,
      serviceId: 1,
      scheduleSlotId: 11,
      exchangeIntelligencePostId: 61,
      fulfillmentMode: "store"
    };

    await request(fixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send(body)
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: ERROR_CODES.VALIDATION });
      });
    expect(fixture.bookingRepository.createBooking).not.toHaveBeenCalled();

    await request(fixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "intelligence-booking-0001")
      .send(body)
      .expect(201);

    expect(fixture.bookingRepository.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        customerUserId: 1,
        exchangeIntelligencePostId: 61,
        idempotencyKey: "intelligence-booking-0001"
      }),
      expect.objectContaining({ invalidateSupersededAffiliate: expect.any(Function) })
    );
  });

  it("enforces the discriminated service-location contract at the booking route", async () => {
    const missingLocationFixture = await createFixture();
    const missingLocationToken = await missingLocationFixture.login();

    await request(missingLocationFixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${missingLocationToken}`)
      .send({ expectedPriceAmountJpy: 8_800, serviceId: 1, scheduleSlotId: 11, fulfillmentMode: "home" })
      .expect(400);
    expect(missingLocationFixture.bookingRepository.createBooking).not.toHaveBeenCalled();

    const storeFixture = await createFixture();
    const storeToken = await storeFixture.login();
    await request(storeFixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${storeToken}`)
      .send({
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store",
        serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
        fulfillmentAddress: { countryCode: "JP", postalCode: "160-0022", prefecture: "東京都", city: "新宿区", addressLine1: "新宿1-1-1" },
        travelEstimatePublicId: "00000000-0000-4000-8000-000000000001"
      })
      .expect(400);
    expect(storeFixture.bookingRepository.createBooking).not.toHaveBeenCalled();

    const homeFixture = await createFixture();
    const homeToken = await homeFixture.login();
    await request(homeFixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${homeToken}`)
      .send({
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "home",
        serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
        fulfillmentAddress: { countryCode: "JP", postalCode: "160-0022", prefecture: "東京都", city: "新宿区", addressLine1: "新宿1-1-1" },
        travelEstimatePublicId: "00000000-0000-4000-8000-000000000001"
      })
      .expect(201);
    expect(homeFixture.bookingRepository.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillmentMode: "home",
        serviceLocation: {
          source: "CUSTOMER_SERVICE_LOCATION",
          countryCode: "JP",
          admin1Code: "13",
          admin2Code: "13104"
        }
      }),
      expect.objectContaining({ invalidateSupersededAffiliate: expect.any(Function) })
    );

    const openApiResponse = await request(homeFixture.app).get("/api/v1/openapi.json").expect(200);
    const bookingCreateSchema =
      openApiResponse.body.paths["/api/v1/bookings"].post.requestBody.content["application/json"]
        .schema;
    expect(bookingCreateSchema.discriminator).toEqual({ propertyName: "fulfillmentMode" });
    const storeSchema = bookingCreateSchema.oneOf.find(
      (variant: { properties: { fulfillmentMode: { enum: string[] } } }) =>
        variant.properties.fulfillmentMode.enum.includes("store")
    );
    expect(storeSchema.properties).not.toHaveProperty("serviceLocation");
    const homeSchema = bookingCreateSchema.oneOf.find(
      (variant: { properties: { fulfillmentMode: { enum: string[] } } }) =>
        variant.properties.fulfillmentMode.enum.includes("home")
    );
    expect(homeSchema.required).toContain("serviceLocation");
    expect(homeSchema.properties.serviceLocation.properties).toMatchObject({
      countryCode: { type: "string", enum: ["JP"] },
      admin1Code: { type: "string", pattern: "^[0-9]{2}$" },
      admin2Code: { type: "string", pattern: "^[0-9]{5}$" }
    });
  });

  it("lists available slots, creates a free booking, rejects oversell, and records status history", async () => {
    const fixture = await createFixture();
    const token = await fixture.login();

    const availabilityResponse = await request(fixture.app)
      .get(
        "/api/v1/schedule/availability?serviceId=1&shopId=1&from=2026-05-26T00:00:00.000Z&to=2026-05-27T00:00:00.000Z"
      )
      .expect(200);

    expect(availabilityResponse.body.data.list).toEqual([
      expect.objectContaining({
        id: 11,
        serviceId: 1,
        shopId: 1,
        technicianProfileId: 1,
        startsAt: slotStart.toISOString(),
        endsAt: slotEnd.toISOString(),
        status: "available",
        capacity: 1,
        bookedCount: 0
      })
    ]);

    const createdResponse = await request(fixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store",
        note: "quiet seat"
      })
      .expect(201);

    expect(createdResponse.body.data).toMatchObject({
      id: 1,
      orderNo: "ND202605260001",
      orderType: "booking",
      status: "pending",
      paymentMethod: "onsite",
      paymentStatus: "pending",
      serviceId: 1,
      scheduleSlotId: 11,
      serviceName: "Shiatsu Recovery"
    });
    expect(createdResponse.body.data.statusHistory[0]).toMatchObject({
      fromStatus: null,
      toStatus: "pending",
      actorUserId: 1
    });
    expect(createdResponse.body.data.timelineEvents[0]).toMatchObject({
      id: "status:1",
      type: "ORDER_STATUS_CHANGED",
      fromStatus: null,
      toStatus: "pending",
      actorUserId: 1,
      publicReason: null
    });
    expect(createdResponse.body.data.performanceAssessment).toBeNull();

    await request(fixture.app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedPriceAmountJpy: 8_800, serviceId: 1, scheduleSlotId: 11, fulfillmentMode: "store" })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
          message: "error.booking.slot_unavailable"
        });
      });

    const confirmResponse = await request(fixture.app)
      .post("/api/v1/orders/1/confirm")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(confirmResponse.body.data.status).toBe("confirmed");

    await request(fixture.app)
      .post("/api/v1/orders/1/start")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    await request(fixture.app)
      .post("/api/v1/orders/1/complete")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    await request(fixture.app)
      .post("/api/v1/orders/1/cancel")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "too late" })
      .expect(200);

    const ordersResponse = await request(fixture.app)
      .get("/api/v1/orders?page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(ordersResponse.body.data).toMatchObject({
      total: 1,
      page: 1,
      page_size: 20,
      list: [expect.objectContaining({ id: 1, status: "cancelled" })]
    });
  });
});
