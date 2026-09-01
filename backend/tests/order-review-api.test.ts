import express from "express";
import request from "supertest";
import { env } from "../src/config/env";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import type { BookingRepositoryPort } from "../src/repositories/booking.repository";
import { BOOKING_ROUTE_PERMISSIONS, createBookingRoutes } from "../src/routes/booking.routes";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const review = {
  targetType: "technician" as const,
  rating: 5,
  tags: ["服务精神"],
  comment: "很好",
  createdAt: new Date("2026-09-01T12:00:00.000Z")
};

const createFixture = () => {
  jest.spyOn(authServiceFactory, "createAuthServiceForRoutes").mockReturnValue({
    authenticateAccessToken: jest.fn(async (token: string) => {
      const base = {
        userId: 101,
        roles: ["customer"],
        permissions: ["order:review:create"],
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: 501
      };
      if (token === "none") return { ...base, permissions: [] };
      if (token === "outsider") return { ...base, userId: 999 };
      if (token === "merchant") return { ...base, roles: ["merchant_owner"], currentIdentityType: "merchant", permissions: [] };
      if (token === "technician") return { ...base, userId: 202, roles: ["technician"], currentIdentityType: "technician", currentIdentityScopeType: "technician_profile", currentIdentityScopeId: 702 };
      return base;
    })
  } as never);
  const order = { id: 41, customerUserId: 101, technicianProfileId: 702, status: "completed" };
  const repository = {
    findOrderById: jest.fn(async (id: number) => id === 41 ? order : null),
    createOrderReview: jest.fn(async (input: { actorUserId: number; targetType: string; idempotencyKey: string }) => {
      if (input.actorUserId === 999) return { outcome: "not_found" } as const;
      if (input.idempotencyKey === "review-conflict-key-01") return { outcome: "conflict" } as const;
      return { outcome: "ok", applied: true, review: { ...review, targetType: input.targetType } } as const;
    }),
    findOwnOrderReview: jest.fn(async (input: { actorUserId: number; targetType: string }) =>
      input.actorUserId === 999
        ? ({ outcome: "not_found" } as const)
        : ({ outcome: "ok", review: { ...review, targetType: input.targetType } } as const))
  } as unknown as jest.Mocked<BookingRepositoryPort>;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createBookingRoutes(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    bookingRepository: repository,
    affiliateCheckoutService: {} as never,
    ndpExchangeRateService: { resolveEffectiveRate: jest.fn() } as never
  }));
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, repository };
};

describe("formal completed-order review API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("runs both participant directions through the real router/auth/RBAC/validator/controller", async () => {
    const fixture = createFixture();
    const customer = await request(fixture.app)
      .post("/api/v1/orders/41/reviews")
      .set("Authorization", "Bearer customer")
      .send({ targetType: "technician", rating: 5, tags: ["服务精神"], comment: "很好", idempotencyKey: "review-customer-key-001" })
      .expect(200);
    expect(customer.body.data).toEqual(expect.objectContaining({ applied: true, review: expect.objectContaining({ targetType: "technician" }) }));
    await request(fixture.app)
      .post("/api/v1/orders/41/reviews")
      .set("Authorization", "Bearer technician")
      .send({ targetType: "customer", rating: 4, tags: ["礼貌友好"], comment: null, idempotencyKey: "review-technician-key-1" })
      .expect(200);
  });

  it("enforces strict validation, authentication, least privilege, and hidden participant mismatch", async () => {
    const fixture = createFixture();
    const path = "/api/v1/orders/41/reviews";
    await request(fixture.app).post(path).set("Authorization", "Bearer customer").send({ targetType: "technician", rating: 4.5, tags: [], comment: null, idempotencyKey: "review-invalid-key-001", extra: true }).expect(400);
    await request(fixture.app).post(path).send({}).expect(401);
    await request(fixture.app).post(path).set("Authorization", "Bearer none").send({ targetType: "technician", rating: 5, tags: [], comment: null, idempotencyKey: "review-forbidden-key-01" }).expect(403);
    await request(fixture.app).post(path).set("Authorization", "Bearer merchant").send({ targetType: "technician", rating: 5, tags: [], comment: null, idempotencyKey: "review-merchant-key-001" }).expect(403);
    await request(fixture.app).post(path).set("Authorization", "Bearer outsider").send({ targetType: "technician", rating: 5, tags: [], comment: null, idempotencyKey: "review-outsider-key-001" }).expect(404);
  });

  it("isolates GET mine and whitelists the response", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app).get("/api/v1/orders/41/reviews/mine").set("Authorization", "Bearer customer").expect(200);
    expect(response.body.data).toEqual({ review: expect.objectContaining({ targetType: "technician", rating: 5 }) });
    expect(JSON.stringify(response.body.data)).not.toMatch(/reviewer|profileId|idempotency|fingerprint|audit|bookingOrderId/i);
    await request(fixture.app).get("/api/v1/orders/41/reviews/mine").set("Authorization", "Bearer outsider").expect(404);
  });

  it("maps idempotency conflict to 409", async () => {
    const fixture = createFixture();
    await request(fixture.app).post("/api/v1/orders/41/reviews").set("Authorization", "Bearer customer").send({ targetType: "technician", rating: 5, tags: [], comment: null, idempotencyKey: "review-conflict-key-01" }).expect(409);
  });

  it("assigns the dedicated permission to customers and technicians only", () => {
    expect(BOOKING_ROUTE_PERMISSIONS.reviewCreate).toBe("order:review:create");
    const roles = buildRolePermissionAssignments();
    expect(roles.customer).toContain("order:review:create");
    expect(roles.technician).toContain("order:review:create");
    expect(roles.merchant_owner).not.toContain("order:review:create");
    expect(roles.merchant_staff).not.toContain("order:review:create");
    expect(roles.operator).not.toContain("order:review:create");
  });
});
