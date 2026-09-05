import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AnalyticsRankingIncompleteEvidenceError } from "../src/domain/analytics-ranking";
import type { AnalyticsRankingRepositoryPort } from "../src/repositories/analytics-ranking.repository";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-09-01T05:30:00.000Z");
const permission = "backoffice:analytics-ranking:read";
const makeUser = (id: number, role: string, permissions: string[], identityType = role) => ({
  id,
  needoId: `u${String(id).padStart(10, "0")}`,
  email: `ranking-${id}@example.com`,
  emailVerifiedAt: now,
  phone: null,
  passwordHash: null,
  username: `User ${id}`,
  avatarUrl: null,
  isActive: true,
  isTestAccount: false,
  accessState: { disabled: false, restricted: false },
  sessionGeneration: 0,
  lastLoginAt: null,
  deletedAt: null,
  identities: [
    {
      id: id * 10,
      userId: id,
      type: identityType,
      scopeType: "global",
      scopeId: null,
      displayName: identityType,
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
  identityApplications: [],
  userRoles: [
    {
      deletedAt: null,
      role: {
        code: role,
        deletedAt: null,
        rolePermissions: permissions.map((code) => ({
          deletedAt: null,
          permission: { code, type: "api", deletedAt: null }
        }))
      }
    }
  ]
});

const fixture = (role = "operator", permissions = [permission], identityType = "platform") => {
  const user = makeUser(
    role === "admin" ? 71 : role === "operator" ? 72 : 73,
    role,
    permissions,
    identityType
  );
  const repository: jest.Mocked<AnalyticsRankingRepositoryPort> = {
    findActiveCategoryById: jest.fn(async (categoryId: number) => ({ id: categoryId })),
    listRankings: jest.fn(async (input) => ({
      list: [],
      total: 0,
      page: input.page,
      page_size: input.pageSize
    }))
  };
  const auditCreate = jest.fn(async () => undefined);
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async (id: number) => (id === user.id ? user : null)) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository: { create: auditCreate },
    analyticsRankingRepository: repository,
    analyticsRankingClock: () => now
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: user.identities[0].id,
    sessionGeneration: 0
  }).token;
  return { app, token, repository, auditCreate };
};
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("formal analytics rankings API", () => {
  it.each(["admin", "operator"])("serves %s through the actual createApp chain", async (role) => {
    const test = fixture(role);
    const response = await request(test.app)
      .get(
        "/api/v1/backoffice/analytics/rankings/service?metric=gmv&period=last7days&page=1&pageSize=10"
      )
      .set(bearer(test.token))
      .expect(200);
    expect(response.body.data).toMatchObject({
      dataStatus: "ready",
      list: [],
      total: 0,
      page: 1,
      page_size: 10,
      filter: { kind: "service", metric: "gmv", period: "last7days" }
    });
  });

  it("enforces authentication, permission and strict path/query validation", async () => {
    const denied = fixture("merchant_owner", []);
    await request(denied.app).get("/api/v1/backoffice/analytics/rankings/service").expect(401);
    await request(denied.app)
      .get("/api/v1/backoffice/analytics/rankings/service")
      .set(bearer(denied.token))
      .expect(403);
    const allowed = fixture();
    for (const url of [
      "/api/v1/backoffice/analytics/rankings/shop",
      "/api/v1/backoffice/analytics/rankings/service?unknown=1",
      "/api/v1/backoffice/analytics/rankings/service?pageSize=11",
      "/api/v1/backoffice/analytics/rankings/service?page=1e2"
    ])
      await request(allowed.app).get(url).set(bearer(allowed.token)).expect(400);
  });

  it("rejects platform permissions when the active identity is scout", async () => {
    const switched = fixture("operator", [permission], "scout");
    await request(switched.app)
      .get("/api/v1/backoffice/analytics/rankings/customer")
      .set(bearer(switched.token))
      .expect(403);
    expect(switched.repository.listRankings).not.toHaveBeenCalled();
  });

  it("maps category 404 and incomplete evidence 409 without leaking evidence", async () => {
    const missing = fixture();
    missing.repository.findActiveCategoryById.mockResolvedValueOnce(null);
    const notFound = await request(missing.app)
      .get("/api/v1/backoffice/analytics/rankings/service?categoryId=99")
      .set(bearer(missing.token))
      .expect(404);
    expect(notFound.body).toMatchObject({
      code: ERROR_CODES.ANALYTICS_RANKING_CATEGORY_NOT_FOUND,
      message: "error.analytics_ranking.category_not_found",
      data: null
    });

    const corrupt = fixture();
    corrupt.repository.listRankings.mockRejectedValueOnce(
      new AnalyticsRankingIncompleteEvidenceError()
    );
    const conflict = await request(corrupt.app)
      .get("/api/v1/backoffice/analytics/rankings/customer")
      .set(bearer(corrupt.token))
      .expect(409);
    expect(conflict.body).toEqual({
      code: ERROR_CODES.ANALYTICS_RANKING_INCOMPLETE_EVIDENCE,
      message: "error.analytics_ranking.incomplete_evidence",
      data: null
    });
    expect(JSON.stringify(conflict.body)).not.toMatch(/checkout|ledger|receipt|sql/iu);
  });
});
