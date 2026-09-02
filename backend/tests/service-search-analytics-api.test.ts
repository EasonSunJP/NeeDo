import express from "express";
import request from "supertest";
import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import type { ServiceSearchAnalyticsRepositoryPort } from "../src/repositories/service-search-analytics.repository";
import { createServiceSearchAnalyticsRoutes } from "../src/routes/service-search-analytics.routes";
import * as authServiceFactory from "../src/routes/auth-service.factory";

const now = new Date("2026-09-03T00:00:00.000Z");
const category = {
  id: 7,
  code: "home-care",
  sortOrder: 10,
  isActive: true,
  configurationVersion: 1,
  translations: [{ locale: "JA" as const, value: "家政" }],
  keywordCount: 2,
  updatedAt: now
};

const fixture = () => {
  const authenticateAccessToken = jest.fn(async (token: string) => ({
    userId: 91,
    roles: ["operator"],
    permissions:
      token === "readonly"
        ? ["backoffice:service-taxonomy:read", "backoffice:search-analytics:read"]
        : token === "none"
          ? []
          : [
              "backoffice:service-taxonomy:read",
              "backoffice:service-taxonomy:write",
              "backoffice:search-analytics:read"
            ],
    currentIdentityType: "operator",
    currentIdentityScopeType: token === "shop" ? "shop" : "global",
    currentIdentityScopeId: token === "shop" ? 3 : null
  }));
  jest
    .spyOn(authServiceFactory, "createAuthServiceForRoutes")
    .mockReturnValue({ authenticateAccessToken } as never);

  const repository = {
    listCategories: jest.fn(async () => ({ list: [category], total: 1, page: 1, page_size: 20 })),
    listKeywords: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    listAliases: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    createCategory: jest.fn(async () => ({ outcome: "saved" as const, value: category })),
    updateCategory: jest.fn(async () => ({ outcome: "saved" as const, value: category })),
    createKeyword: jest.fn(),
    updateKeyword: jest.fn(),
    createAlias: jest.fn(),
    updateAlias: jest.fn(),
    topKeywords: jest.fn(async () => [
      { normalizedKeyword: "家政", searchCount: 5, resultCount: 21, firstEventId: 10 }
    ]),
    keywordTrend: jest.fn(async () => [
      { date: "2026-09-01", normalizedKeyword: "家政", searchCount: 2 },
      { date: "2026-09-02", normalizedKeyword: "按摩", searchCount: 4 }
    ])
  } as unknown as jest.Mocked<ServiceSearchAnalyticsRepositoryPort>;

  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createServiceSearchAnalyticsRoutes(env, {
      serviceSearchAnalyticsRepository: repository,
      auditLogRepository: { create: jest.fn(async () => undefined) }
    } as never)
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return { app, repository };
};

describe("formal service taxonomy and search analytics API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("publishes every formal endpoint and permission in OpenAPI", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, Record<string, { "x-permission"?: string; parameters?: unknown[] }>>;
    };
    expect(document.paths["/api/v1/backoffice/service-taxonomy/categories"]?.get?.["x-permission"])
      .toBe("backoffice:service-taxonomy:read");
    expect(document.paths["/api/v1/backoffice/service-taxonomy/categories"]?.post?.["x-permission"])
      .toBe("backoffice:service-taxonomy:write");
    expect(document.paths["/api/v1/backoffice/search-analytics/top-keywords"]?.get?.["x-permission"])
      .toBe("backoffice:search-analytics:read");
    expect(document.paths["/api/v1/backoffice/search-analytics/trends"]?.get).toBeDefined();
    expect(
      document.paths["/api/v1/search"]?.get?.parameters
    ).toEqual(expect.arrayContaining([expect.objectContaining({ name: "X-Search-Session", in: "header" })]));
  });

  it("lists paginated service types and enforces read versus write permission", async () => {
    const test = fixture();
    const list = await request(test.app)
      .get("/api/v1/backoffice/service-taxonomy/categories?page=1&pageSize=20")
      .set("Authorization", "Bearer readonly")
      .expect(200);
    expect(list.body.data).toMatchObject({ total: 1, list: [{ code: "home-care" }] });

    await request(test.app)
      .post("/api/v1/backoffice/service-taxonomy/categories")
      .set("Authorization", "Bearer readonly")
      .send({
        code: "home-care",
        sortOrder: 10,
        isActive: true,
        translations: [{ locale: "ja", value: "家政" }],
        reason: "运营分类更新"
      })
      .expect(403);
  });

  it("creates an audited category with strict validated multilingual input", async () => {
    const test = fixture();
    await request(test.app)
      .post("/api/v1/backoffice/service-taxonomy/categories")
      .set("Authorization", "Bearer operator")
      .send({
        code: "home-care",
        sortOrder: 10,
        isActive: true,
        translations: [{ locale: "ja", value: "家政" }],
        reason: "运营分类更新"
      })
      .expect(201);
    expect(test.repository.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "home-care",
        actorUserId: 91,
        translations: [{ locale: "JA", value: "家政" }],
        audit: expect.objectContaining({ action: "backoffice.service_taxonomy.category_created" })
      })
    );
  });

  it("returns TOP10 and a clearly labelled raw plus 0-100 normalized trend", async () => {
    const test = fixture();
    const top = await request(test.app)
      .get(
        "/api/v1/backoffice/search-analytics/top-keywords?startAt=2026-08-31T15:00:00.000Z&endAt=2026-09-03T15:00:00.000Z&city=Tokyo"
      )
      .set("Authorization", "Bearer readonly")
      .expect(200);
    expect(top.body.data).toMatchObject({
      timezone: "Asia/Tokyo",
      list: [{ normalizedKeyword: "家政", searchCount: 5 }]
    });

    const trend = await request(test.app)
      .get(
        "/api/v1/backoffice/search-analytics/trends?startAt=2026-08-31T15:00:00.000Z&endAt=2026-09-03T15:00:00.000Z&keywords=%E5%AE%B6%E6%94%BF,%E6%8C%89%E6%91%A9"
      )
      .set("Authorization", "Bearer readonly")
      .expect(200);
    expect(trend.body.data).toMatchObject({
      normalization: "global_max_0_100",
      timezone: "Asia/Tokyo",
      series: [
        { keyword: "家政", totalCount: 2 },
        { keyword: "按摩", totalCount: 4 }
      ]
    });
    expect(trend.body.data.series[0].points).toEqual([
      { date: "2026-09-01", rawCount: 2, normalizedIndex: 50 },
      { date: "2026-09-02", rawCount: 0, normalizedIndex: 0 },
      { date: "2026-09-03", rawCount: 0, normalizedIndex: 0 }
    ]);
  });

  it("rejects missing auth, malformed ranges and non-platform active identity", async () => {
    const test = fixture();
    await request(test.app)
      .get("/api/v1/backoffice/service-taxonomy/categories")
      .expect(401);
    await request(test.app)
      .get("/api/v1/backoffice/service-taxonomy/categories")
      .set("Authorization", "Bearer none")
      .expect(403);
    await request(test.app)
      .get(
        "/api/v1/backoffice/search-analytics/top-keywords?startAt=2026-09-03T00:00:00.000Z&endAt=2026-09-01T00:00:00.000Z"
      )
      .set("Authorization", "Bearer readonly")
      .expect(400);
    await request(test.app)
      .get("/api/v1/backoffice/service-taxonomy/categories")
      .set("Authorization", "Bearer shop")
      .expect(403);
  });
});
