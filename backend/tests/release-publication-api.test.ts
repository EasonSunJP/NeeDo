import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type { ReleasePublicationRepositoryPort } from "../src/repositories/release-publication.repository";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-09-01T05:30:00.000Z");
const permission = "backoffice:dashboard:read";
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
  const repository: jest.Mocked<ReleasePublicationRepositoryPort> = {
    publish: jest.fn(),
    list: jest.fn(async (_environment, query) => ({
      list: [],
      total: 0,
      page: query.page,
      page_size: query.pageSize
    }))
  };
  const auditCreate = jest.fn(async () => undefined);
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async (id: number) => (id === user.id ? user : null)) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository: { create: auditCreate },
    releasePublicationRepository: repository,
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

describe("release timeline API", () => {
  it("returns only current-environment publications to platform operators", async () => {
    const test = fixture();
    const response = await request(test.app)
      .get("/api/v1/backoffice/releases?page=2&pageSize=50")
      .set(bearer(test.token));
    expect(response.status).toBe(200);
    expect(test.repository.list).toHaveBeenCalledWith(env.DEPLOY_ENV, { page: 2, pageSize: 50 });
    expect(response.body.data).toEqual({ list: [], total: 0, page: 2, page_size: 50 });
  });
  it("requires authentication, permission and current platform identity", async () => {
    const test = fixture();
    expect((await request(test.app).get("/api/v1/backoffice/releases")).status).toBe(401);
    for (const rejected of [
      fixture("operator", []),
      fixture("operator", [permission], "customer")
    ]) {
      expect(
        (await request(rejected.app).get("/api/v1/backoffice/releases").set(bearer(rejected.token)))
          .status
      ).toBe(403);
      expect(rejected.repository.list).not.toHaveBeenCalled();
    }
  });
  it("rejects unbounded pagination, environment override and public publication writes", async () => {
    const test = fixture();
    for (const query of ["page=0", "pageSize=101", "environment=prod"]) {
      expect(
        (
          await request(test.app)
            .get(`/api/v1/backoffice/releases?${query}`)
            .set(bearer(test.token))
        ).status
      ).toBe(400);
    }
    expect(
      (await request(test.app).post("/api/v1/backoffice/releases").set(bearer(test.token)).send({}))
        .status
    ).toBe(404);
  });
});
