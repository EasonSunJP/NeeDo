import express from "express";
import request from "supertest";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import type { OperatingCostRepositoryPort } from "../src/repositories/operating-cost.repository";
import { createOperatingCostRoutes } from "../src/routes/operating-cost.routes";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const costPublicId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-09-02T00:00:00.000Z");
const item = {
  id: 31,
  publicId: costPublicId,
  costCode: "server-2026-09",
  version: 1,
  categoryCode: "server",
  name: "September infrastructure",
  amountJpy: 1_000,
  currency: "JPY" as const,
  periodStart: new Date("2026-09-01T00:00:00.000Z"),
  periodEnd: new Date("2026-09-30T00:00:00.000Z"),
  allocationMode: "equal_active_shops" as const,
  status: "draft" as const,
  effectiveAt: now,
  publishedAt: null,
  configuredById: 91,
  reason: "monthly server invoice",
  directAssignments: null,
  allocations: [],
  createdAt: now,
  updatedAt: now
};

const createFixture = () => {
  const authenticateAccessToken = jest.fn(async (token: string) => {
    const base = {
      userId: 91,
      roles: ["operator"],
      permissions: ["backoffice:operating-cost:read", "backoffice:operating-cost:write"],
      currentIdentityType: "operator",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null
    };
    if (token === "read-only") {
      return { ...base, permissions: ["backoffice:operating-cost:read"] };
    }
    if (token === "none") return { ...base, permissions: [] };
    if (token === "shop") {
      return { ...base, currentIdentityScopeType: "shop", currentIdentityScopeId: 19 };
    }
    return base;
  });
  jest
    .spyOn(authServiceFactory, "createAuthServiceForRoutes")
    .mockReturnValue({ authenticateAccessToken } as never);

  const repository = {
    list: jest.fn(async () => ({ list: [item], total: 1, page: 1, page_size: 20 })),
    createDraft: jest.fn(async () => ({ outcome: "created" as const, item })),
    updateDraft: jest.fn(async () => ({ outcome: "updated" as const, item })),
    deleteDraft: jest.fn(async () => ({ outcome: "deleted" as const })),
    publish: jest.fn(async () => ({
      outcome: "published" as const,
      item: {
        ...item,
        status: "published" as const,
        publishedAt: now,
        allocations: [
          {
            shopPublicId: "shop0000000008",
            shopName: "Ginza Shop",
            amountJpy: 1_000,
            allocationWeight: "1.00000000"
          }
        ]
      }
    }))
  } as unknown as jest.Mocked<OperatingCostRepositoryPort>;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createOperatingCostRoutes(env, { operatingCostRepository: repository } as never)
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, repository };
};

const createBody = {
  costCode: "server-2026-09",
  categoryCode: "server",
  name: "September infrastructure",
  amountJpy: 1_000,
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  allocationMode: "equal_active_shops",
  effectiveAt: "2026-09-02T00:00:00.000Z",
  reason: "monthly server invoice"
};

describe("operating cost HTTP API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lists paginated cost versions with read permission", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/backoffice/operating-costs?page=1&pageSize=20&status=draft")
      .set("Authorization", "Bearer read-only")
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          total: 1,
          page: 1,
          page_size: 20,
          list: [{ publicId: costPublicId, amountJpy: 1_000, status: "draft" }]
        });
        expect(JSON.stringify(response.body.data)).not.toContain('"id":31');
      });
  });

  it("creates, fully updates, deletes and publishes only draft cost items", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/operating-costs")
      .set("Authorization", "Bearer operator")
      .send(createBody)
      .expect(201);
    expect(fixture.repository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        costCode: "server-2026-09",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        actorUserId: 91
      })
    );

    await request(fixture.app)
      .patch(`/api/v1/backoffice/operating-costs/${costPublicId}`)
      .set("Authorization", "Bearer operator")
      .send({ ...createBody, costCode: undefined, amountJpy: 1_200, reason: "invoice corrected" })
      .expect(200);

    await request(fixture.app)
      .post(`/api/v1/backoffice/operating-costs/${costPublicId}/publish`)
      .set("Authorization", "Bearer operator")
      .send({ reason: "approved September cost" })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          publicId: costPublicId,
          status: "published",
          allocations: [{ shopPublicId: "shop0000000008", amountJpy: 1_000 }]
        });
      });

    await request(fixture.app)
      .delete(`/api/v1/backoffice/operating-costs/${costPublicId}`)
      .set("Authorization", "Bearer operator")
      .send({ reason: "draft withdrawn" })
      .expect(204);
  });

  it("accepts direct JPY assignments or 10000-bps shares, but rejects mixed/invalid inputs", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/operating-costs")
      .set("Authorization", "Bearer operator")
      .send({
        ...createBody,
        allocationMode: "direct_shops",
        directAssignments: [{ shopPublicId: "shop0000000008", amountJpy: 1_000 }]
      })
      .expect(201);

    await request(fixture.app)
      .post("/api/v1/backoffice/operating-costs")
      .set("Authorization", "Bearer operator")
      .send({
        ...createBody,
        allocationMode: "direct_shops",
        directAssignments: [
          { shopPublicId: "shop0000000008", shareBps: 7_500 },
          { shopPublicId: "shop0000000009", shareBps: 2_500 }
        ]
      })
      .expect(201);

    for (const directAssignments of [
      [{ shopPublicId: "shop0000000008", amountJpy: 999 }],
      [{ shopPublicId: "shop0000000008", shareBps: 9_999 }],
      [
        { shopPublicId: "shop0000000008", amountJpy: 500 },
        { shopPublicId: "shop0000000009", shareBps: 5_000 }
      ]
    ]) {
      await request(fixture.app)
        .post("/api/v1/backoffice/operating-costs")
        .set("Authorization", "Bearer operator")
        .send({ ...createBody, allocationMode: "direct_shops", directAssignments })
        .expect(400);
    }
  });

  it("enforces authentication, exact permissions, platform identity and strict bodies", async () => {
    const fixture = createFixture();
    const path = "/api/v1/backoffice/operating-costs";
    await request(fixture.app).get(path).expect(401);
    await request(fixture.app).get(path).set("Authorization", "Bearer none").expect(403);
    await request(fixture.app)
      .post(path)
      .set("Authorization", "Bearer read-only")
      .send(createBody)
      .expect(403);
    await request(fixture.app).get(path).set("Authorization", "Bearer shop").expect(403).expect({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      data: null
    });
    await request(fixture.app)
      .post(path)
      .set("Authorization", "Bearer operator")
      .send({ ...createBody, unknown: true })
      .expect(400);
  });

  it("publishes authenticated OpenAPI contracts for CRUD and publish", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
      components: { schemas: Record<string, unknown> };
    };
    const collection = document.paths["/api/v1/backoffice/operating-costs"];
    const itemPath = document.paths["/api/v1/backoffice/operating-costs/{publicId}"];
    const publishPath = document.paths["/api/v1/backoffice/operating-costs/{publicId}/publish"];
    expect(collection.get).toMatchObject({
      "x-permission": "backoffice:operating-cost:read",
      security: [{ bearerAuth: [] }]
    });
    expect(collection.post).toMatchObject({
      "x-permission": "backoffice:operating-cost:write",
      security: [{ bearerAuth: [] }]
    });
    expect(itemPath.patch).toBeDefined();
    expect(itemPath.delete).toBeDefined();
    expect(publishPath.post).toBeDefined();
    expect(document.components.schemas.OperatingCostItem).toBeDefined();
  });
});
