import express from "express";
import request from "supertest";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import type { NdpExchangeRateRepositoryPort } from "../src/repositories/ndp-exchange-rate.repository";
import {
  NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS,
  createNdpExchangeRateRoutes
} from "../src/routes/ndp-exchange-rate.routes";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const current = {
  ruleId: 1,
  publicId: "4b613bba-d847-427a-aa87-e64138015e20",
  version: 1,
  ndpUnits: 1,
  jpyUnits: 1,
  status: "active" as const,
  effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
  effectiveTo: null,
  reason: "bootstrap",
  createdById: null,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z")
};

const createFixture = () => {
  const authenticateAccessToken = jest.fn(async (token: string) => {
    const base = {
      userId: 91,
      roles: ["operator"],
      permissions: ["backoffice:ndp-exchange-rate:read", "backoffice:ndp-exchange-rate:write"],
      currentIdentityType: "operator",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null
    };
    if (token === "read-only") return { ...base, permissions: [base.permissions[0]] };
    if (token === "no-permission") return { ...base, permissions: [] };
    if (token === "shop") {
      return {
        ...base,
        currentIdentityType: "merchant",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 12
      };
    }
    return base;
  });
  jest
    .spyOn(authServiceFactory, "createAuthServiceForRoutes")
    .mockReturnValue({ authenticateAccessToken } as never);

  const repository = {
    resolveEffectiveRate: jest.fn(async () => current),
    getOverview: jest.fn(async (input) => ({
      current,
      nextScheduled: null,
      latestVersion: 1,
      evaluatedAt: input.at,
      history: { list: [current], total: 1, page: input.page, page_size: input.pageSize }
    })),
    publish: jest.fn(async (input) => ({
      outcome: "published" as const,
      rate: {
        ...current,
        version: 2,
        ndpUnits: input.ndpUnits,
        jpyUnits: input.jpyUnits,
        effectiveFrom: input.effectiveFrom,
        reason: input.reason,
        createdById: input.actorUserId
      }
    }))
  } as unknown as jest.Mocked<NdpExchangeRateRepositoryPort>;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createNdpExchangeRateRoutes(env, {
      ndpExchangeRateRepository: repository
    } as never)
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, repository };
};

describe("formal NDP exchange-rate API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lists the evaluated summary and paginated history through the real route stack", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/ndp-exchange-rates?page=2&pageSize=20&at=2026-09-01T00:00:00.000Z")
      .set("Authorization", "Bearer read-only")
      .expect(200);

    expect(response.body.data).toMatchObject({
      current: { version: 1, ndpUnits: 1, jpyUnits: 1 },
      nextScheduled: null,
      latestVersion: 1,
      evaluatedAt: "2026-09-01T00:00:00.000Z",
      history: { total: 1, page: 2, page_size: 20 }
    });
    expect(fixture.repository.getOverview).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      at: new Date("2026-09-01T00:00:00.000Z")
    });
    expect(JSON.stringify(response.body)).not.toContain("idempotencyKey");
    expect(JSON.stringify(response.body)).not.toContain("activeKey");
  });

  it("publishes a new immutable version through real auth, permission, validation and controller", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .post("/api/v1/backoffice/ndp-exchange-rates")
      .set("Authorization", "Bearer operator")
      .send({
        ndpUnits: 1,
        jpyUnits: 2,
        expectedVersion: 1,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        reason: "Finance approved conversion change",
        idempotencyKey: "rate-publish-api-0001"
      })
      .expect(201);

    expect(response.body.data).toMatchObject({ version: 2, ndpUnits: 1, jpyUnits: 2 });
    expect(fixture.repository.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 91,
        expectedVersion: 1,
        effectiveFrom: new Date("2026-10-01T00:00:00.000Z")
      })
    );
    expect(JSON.stringify(response.body)).not.toContain("rate-publish-api-0001");
  });

  it("accepts only persistence-safe upper integer boundaries", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/ndp-exchange-rates")
      .set("Authorization", "Bearer operator")
      .send({
        ndpUnits: 2_147_483_647,
        jpyUnits: 2_147_483_647,
        expectedVersion: 2_147_483_646,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        reason: "maximum persistence-safe boundary",
        idempotencyKey: "rate-publish-api-max-int"
      })
      .expect(201);
    expect(fixture.repository.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        ndpUnits: 2_147_483_647,
        jpyUnits: 2_147_483_647,
        expectedVersion: 2_147_483_646
      })
    );
  });

  it.each<[Record<string, unknown>, string]>([
    [{ ndpUnits: 0 }, "non-positive units"],
    [{ ndpUnits: 1.5 }, "fractional units"],
    [{ jpyUnits: Number.MAX_SAFE_INTEGER + 1 }, "unsafe units"],
    [{ ndpUnits: 2_147_483_648 }, "NDP units above MySQL INT"],
    [{ jpyUnits: 2_147_483_648 }, "JPY units above MySQL INT"],
    [{ expectedVersion: 2_147_483_647 }, "version whose successor exceeds MySQL INT"],
    [{ unknown: true }, "unknown fields"],
    [{ reason: "   " }, "invisible reasons"]
  ])("strictly rejects %s (%s)", async (override) => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/ndp-exchange-rates")
      .set("Authorization", "Bearer operator")
      .send({
        ndpUnits: 1,
        jpyUnits: 2,
        expectedVersion: 1,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        reason: "valid reason",
        idempotencyKey: "rate-publish-api-0002",
        ...override
      })
      .expect(400)
      .expect({ code: ERROR_CODES.VALIDATION, message: "error.validation", data: null });
    expect(fixture.repository.publish).not.toHaveBeenCalled();
  });

  it("requires authentication and exact read/write permissions", async () => {
    const fixture = createFixture();
    await request(fixture.app).get("/api/v1/backoffice/ndp-exchange-rates").expect(401);
    await request(fixture.app)
      .get("/api/v1/backoffice/ndp-exchange-rates")
      .set("Authorization", "Bearer no-permission")
      .expect(403);
    await request(fixture.app)
      .post("/api/v1/backoffice/ndp-exchange-rates")
      .set("Authorization", "Bearer read-only")
      .send({
        ndpUnits: 1,
        jpyUnits: 2,
        expectedVersion: 1,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        reason: "valid reason",
        idempotencyKey: "rate-publish-api-0003"
      })
      .expect(403);
  });

  it("fails closed for a permitted shop identity before repository access", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/backoffice/ndp-exchange-rates")
      .set("Authorization", "Bearer shop")
      .expect(403)
      .expect({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        data: null
      });
    expect(fixture.repository.getOverview).not.toHaveBeenCalled();
  });

  it("maps repository publication conflicts to the dedicated public 409", async () => {
    const fixture = createFixture();
    fixture.repository.publish.mockResolvedValueOnce({ outcome: "conflict" });
    await request(fixture.app)
      .post("/api/v1/backoffice/ndp-exchange-rates")
      .set("Authorization", "Bearer operator")
      .send({
        ndpUnits: 1,
        jpyUnits: 2,
        expectedVersion: 1,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        reason: "valid reason",
        idempotencyKey: "rate-publish-api-0004"
      })
      .expect(409)
      .expect({
        code: ERROR_CODES.NDP_EXCHANGE_RATE_CONFLICT,
        message: "error.ndp_exchange_rate.conflict",
        data: null
      });
  });

  it("assigns exact permissions to operator, finance, viewer and admin", () => {
    const roles = buildRolePermissionAssignments();
    expect(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS).toEqual({
      read: "backoffice:ndp-exchange-rate:read",
      write: "backoffice:ndp-exchange-rate:write"
    });
    expect(roles.operator).toEqual(
      expect.arrayContaining(Object.values(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS))
    );
    expect(roles.finance).toEqual(
      expect.arrayContaining(Object.values(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS))
    );
    expect(roles.viewer).toContain(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS.read);
    expect(roles.viewer).not.toContain(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS.write);
    expect(roles.admin).toEqual(
      expect.arrayContaining(Object.values(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS))
    );
  });

  it("publishes authenticated OpenAPI contracts without idempotency examples", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
      components: {
        schemas: Record<string, { properties?: Record<string, { maximum?: number }> }>;
      };
    };
    const path = document.paths["/api/v1/backoffice/ndp-exchange-rates"];
    expect(path.get).toMatchObject({
      security: [{ bearerAuth: [] }],
      responses: expect.objectContaining({
        "200": expect.anything(),
        "401": expect.anything(),
        "403": expect.anything()
      })
    });
    expect(path.post).toMatchObject({
      security: [{ bearerAuth: [] }],
      responses: expect.objectContaining({
        "201": expect.anything(),
        "400": expect.anything(),
        "401": expect.anything(),
        "403": expect.anything(),
        "409": expect.anything()
      })
    });
    expect(JSON.stringify(path)).toContain(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS.read);
    expect(JSON.stringify(path)).toContain(NDP_EXCHANGE_RATE_ROUTE_PERMISSIONS.write);
    expect(JSON.stringify(document.components.schemas)).toContain("idempotencyKey");
    expect(JSON.stringify(path)).not.toMatch(/idempotencyKey[^}]+example/i);
    expect(document.components.schemas.NdpExchangeRatePublish?.properties).toMatchObject({
      ndpUnits: { maximum: 2_147_483_647 },
      jpyUnits: { maximum: 2_147_483_647 },
      expectedVersion: { maximum: 2_147_483_646 }
    });
  });
});
