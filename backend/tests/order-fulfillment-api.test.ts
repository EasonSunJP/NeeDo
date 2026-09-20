import express from "express";
import request from "supertest";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import type {
  BookingOrderPayload,
  BookingRepositoryPort
} from "../src/repositories/booking.repository";
import { BOOKING_ROUTE_PERMISSIONS, createBookingRoutes } from "../src/routes/booking.routes";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const now = new Date("2026-09-01T10:00:00.000Z");
const fulfillmentPermissions = ["order:service:start", "order:add-on:write", "order:service:end"];
const fixturePermissions = ["order:read", ...fulfillmentPermissions];

const order: BookingOrderPayload = {
  id: 41,
  orderNo: "ND202609010041",
  orderType: "booking",
  status: "inService",
  paymentMethod: "onsite",
  paymentStatus: "pending",
  paymentAmountJpy: 8800,
  amountSource: "order_payment",
  effectivePaymentMethod: "onsite",
  otherMethodCode: null,
  otherMethodLabel: null,
  checkoutPaymentAmountNdp: null,
  ndpCurrency: null,
  paymentConfirmedById: null,
  paymentConfirmedAt: null,
  paymentReference: null,
  paymentNote: null,
  paymentRefundedById: null,
  paymentRefundedAt: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
  customerUserId: 101,
  serviceId: 11,
  technicianServiceId: null,
  shopId: 12,
  technicianProfileId: 702,
  scheduleSlotId: 13,
  fulfillmentMode: "store",
  serviceName: "舒缓 60 分钟",
  pricingModeSnapshot: "merchant",
  serviceOwnerType: "shop",
  serviceOwnerId: 11,
  serviceNameSnapshot: "舒缓 60 分钟",
  servicePriceSnapshot: "8800.00",
  serviceDurationSnapshot: 60,
  fulfillmentAddressSnapshot: null,
  serviceSnapshot: { serviceId: 11, durationMinutes: 60 },
  rebook: {
    action: "checkout",
    serviceType: "shop_service",
    serviceId: 11,
    shopId: 12,
    technicianProfileId: 702,
    fulfillmentMode: "store"
  },
  shopName: "銀座店",
  technicianName: "Misaki",
  priceAmount: "8800.00",
  currency: "JPY",
  startsAt: now,
  endsAt: new Date("2026-09-01T11:00:00.000Z"),
  note: null,
  cancelReason: null,
  affiliate: null,
  serviceSession: {
    startedAt: now,
    expectedEndsAt: new Date("2026-09-01T11:00:00.000Z"),
    endedAt: null,
    addOns: []
  },
  createdAt: now,
  updatedAt: now,
  statusHistory: [],
  performanceAssessment: null,
  timelineEvents: []
};

const createFixture = () => {
  const authenticateAccessToken = jest.fn(async (token: string) => {
    const base = {
      userId: 101,
      roles: ["customer"],
      permissions: fixturePermissions,
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 501
    };
    if (token === "no-permission") return { ...base, permissions: [] };
    if (token === "technician") {
      return {
        ...base,
        userId: 202,
        roles: ["technician"],
        currentIdentityType: "technician",
        currentIdentityScopeType: "technician_profile",
        currentIdentityScopeId: 702
      };
    }
    if (token === "merchant" || token === "cross-shop-merchant") {
      return {
        ...base,
        userId: 303,
        roles: ["merchant_owner"],
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: token === "merchant" ? 12 : 99
      };
    }
    return base;
  });
  jest
    .spyOn(authServiceFactory, "createAuthServiceForRoutes")
    .mockReturnValue({ authenticateAccessToken } as never);

  const ok = { outcome: "ok" as const, order, applied: true };
  const repository = {
    findOrderById: jest.fn(async (id: number) => (id === order.id ? order : null)),
    listOrderAddOnServices: jest.fn(async () => ({
      list: [{
        id: 19,
        sourceType: "shop_service",
        name: "追加舒缓 30 分钟",
        description: null,
        priceAmountJpy: 4000,
        currency: "JPY",
        durationMinutes: 30,
        coverUrl: null
      }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    startService: jest.fn(async () => ok),
    createOrderAddOn: jest.fn(async () => ok),
    decideOrderAddOn: jest.fn(async () => ok),
    endService: jest.fn(async () => ok),
    createOrderTimelineComment: jest.fn(async () => order)
  } as unknown as jest.Mocked<BookingRepositoryPort>;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createBookingRoutes(env, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      bookingRepository: repository,
      affiliateCheckoutService: {} as never
    })
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, repository };
};

describe("formal order fulfillment API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("runs all five routes through the real router, middleware, validators, and controller", async () => {
    const fixture = createFixture();
    const authorization = { Authorization: "Bearer customer" };

    await request(fixture.app)
      .post("/api/v1/orders/41/service/start")
      .set(authorization)
      .send({ actor: "customer", idempotencyKey: "api-success-start01" })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/orders/41/add-ons")
      .set(authorization)
      .send({ serviceId: 19, idempotencyKey: "api-success-propose1" })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/orders/41/add-ons/9/accept")
      .set(authorization)
      .send({ idempotencyKey: "api-success-accept01" })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/orders/41/add-ons/9/reject")
      .set(authorization)
      .send({ idempotencyKey: "api-success-reject01" })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/orders/41/service/end")
      .set(authorization)
      .send({ reason: "customer_completed", idempotencyKey: "api-success-end0001" })
      .expect(200);

    expect(fixture.repository.startService).toHaveBeenCalledTimes(1);
    expect(fixture.repository.createOrderAddOn).toHaveBeenCalledTimes(1);
    expect(fixture.repository.decideOrderAddOn).toHaveBeenCalledTimes(2);
    expect(fixture.repository.endService).toHaveBeenCalledTimes(1);
  });

  it("returns the authenticated order-scoped add-on catalog", async () => {
    const fixture = createFixture();

    const response = await request(fixture.app)
      .get("/api/v1/orders/41/add-on-services?page=1&pageSize=20")
      .set("Authorization", "Bearer customer")
      .expect(200);
    await request(fixture.app)
      .get("/api/v1/orders/41/add-on-services?page=1&pageSize=20")
      .set("Authorization", "Bearer technician")
      .expect(200);
    await request(fixture.app)
      .get("/api/v1/orders/41/add-on-services?page=1&pageSize=20")
      .set("Authorization", "Bearer merchant")
      .expect(200);
    await request(fixture.app)
      .get("/api/v1/orders/41/add-on-services?page=1&pageSize=20")
      .set("Authorization", "Bearer cross-shop-merchant")
      .expect(404);

    expect(response.body.data.list).toEqual([
      expect.objectContaining({ id: 19, sourceType: "shop_service", priceAmountJpy: 4000 })
    ]);
    expect(fixture.repository.listOrderAddOnServices).toHaveBeenCalledWith({
      orderId: 41,
      page: 1,
      pageSize: 20
    });
    expect(fixture.repository.listOrderAddOnServices).toHaveBeenCalledTimes(3);
  });

  it("rejects an unknown strict body field before the repository", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/orders/41/add-ons")
      .set("Authorization", "Bearer customer")
      .send({ serviceId: 19, idempotencyKey: "api-strict-proposal1", priceAmountJpy: 1 })
      .expect(400)
      .expect({ code: ERROR_CODES.VALIDATION, message: "error.validation", data: null });
    expect(fixture.repository.createOrderAddOn).not.toHaveBeenCalled();
  });

  it("requires authentication and the exact fulfillment permission", async () => {
    const fixture = createFixture();
    const body = { actor: "customer", idempotencyKey: "api-auth-start0001" };
    await request(fixture.app).post("/api/v1/orders/41/service/start").send(body).expect(401);
    await request(fixture.app)
      .post("/api/v1/orders/41/service/start")
      .set("Authorization", "Bearer no-permission")
      .send(body)
      .expect(403)
      .expect({ code: ERROR_CODES.FORBIDDEN, message: "error.forbidden", data: null });
    expect(fixture.repository.startService).not.toHaveBeenCalled();
  });

  it("rejects actor mismatch and hides an inaccessible order as not found", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/orders/41/service/start")
      .set("Authorization", "Bearer technician")
      .send({ actor: "customer", idempotencyKey: "api-actor-mismatch1" })
      .expect(403);
    await request(fixture.app)
      .post("/api/v1/orders/999/service/end")
      .set("Authorization", "Bearer customer")
      .send({ reason: "customer_completed", idempotencyKey: "api-hidden-order0001" })
      .expect(404)
      .expect({ code: ERROR_CODES.NOT_FOUND, message: "error.order.not_found", data: null });
    expect(fixture.repository.startService).not.toHaveBeenCalled();
    expect(fixture.repository.endService).not.toHaveBeenCalled();
  });

  it("lets the owning merchant start and end through the formal contract but hides cross-shop orders", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .post("/api/v1/orders/41/service/start")
      .set("Authorization", "Bearer merchant")
      .send({
        actor: "merchant",
        verificationCode: "482931",
        idempotencyKey: "merchant-api-start01"
      })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/orders/41/service/end")
      .set("Authorization", "Bearer merchant")
      .send({ reason: "店铺确认服务已结束", idempotencyKey: "merchant-api-end0001" })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/orders/41/service/start")
      .set("Authorization", "Bearer cross-shop-merchant")
      .send({
        actor: "merchant",
        verificationCode: "482931",
        idempotencyKey: "merchant-cross-shop1"
      })
      .expect(404);

    expect(fixture.repository.startService).toHaveBeenCalledTimes(1);
    expect(fixture.repository.endService).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for both retired generic fulfillment routes", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/orders/41/start")
      .set("Authorization", "Bearer customer")
      .expect(404);
    await request(fixture.app)
      .post("/api/v1/orders/41/complete")
      .set("Authorization", "Bearer customer")
      .expect(404);
  });

  it("creates a normalized participant timeline comment through the formal route", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .post("/api/v1/orders/41/timeline/comments")
      .set("Authorization", "Bearer customer")
      .send({ body: "  请提前五分钟联系  " })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 0, message: "success", data: { id: 41 } });
      });

    expect(fixture.repository.createOrderTimelineComment).toHaveBeenCalledWith({
      actorUserId: 101,
      body: "请提前五分钟联系",
      orderId: 41
    });
  });

  it("validates timeline comments before repository access and enforces order:read", async () => {
    const fixture = createFixture();

    await request(fixture.app)
      .post("/api/v1/orders/41/timeline/comments")
      .set("Authorization", "Bearer customer")
      .send({ body: "   ", unexpected: true })
      .expect(400)
      .expect({ code: ERROR_CODES.VALIDATION, message: "error.validation", data: null });
    await request(fixture.app)
      .post("/api/v1/orders/41/timeline/comments")
      .set("Authorization", "Bearer no-permission")
      .send({ body: "需要联系" })
      .expect(403)
      .expect({ code: ERROR_CODES.FORBIDDEN, message: "error.forbidden", data: null });

    expect(fixture.repository.createOrderTimelineComment).not.toHaveBeenCalled();
  });

  it("assigns service transitions to customers, technicians, and merchant operators only", () => {
    const rolePermissions = buildRolePermissionAssignments();
    expect(BOOKING_ROUTE_PERMISSIONS).toMatchObject({
      serviceStart: "order:service:start",
      addOnWrite: "order:add-on:write",
      serviceEnd: "order:service:end"
    });
    for (const permission of fulfillmentPermissions) {
      expect(rolePermissions.customer).toContain(permission);
      expect(rolePermissions.technician).toContain(permission);
      if (permission === "order:service:start" || permission === "order:service:end") {
        expect(rolePermissions.merchant_owner).toContain(permission);
        expect(rolePermissions.merchant_staff).toContain(permission);
      } else {
        expect(rolePermissions.merchant_owner).not.toContain(permission);
        expect(rolePermissions.merchant_staff).not.toContain(permission);
      }
      expect(rolePermissions.operator).not.toContain(permission);
    }
  });
});
