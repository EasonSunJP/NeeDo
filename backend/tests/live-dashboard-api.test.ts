import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type { LiveDashboardSnapshotFacts } from "../src/domain/live-dashboard";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-09-06T03:04:05.000Z");

const createUser = (id: number, permissions: string[]) => ({
  id,
  email: `live-${id}@example.test`,
  phone: null,
  passwordHash: "unused",
  username: `Live ${id}`,
  avatarUrl: null,
  isActive: true,
  sessionGeneration: 0,
  lastLoginAt: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  identities: [
    {
      id: 100 + id,
      userId: id,
      type: "platform_admin",
      scopeType: "global",
      scopeId: null,
      displayName: `Live ${id}`,
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
  userRoles: [
    {
      deletedAt: null,
      role: {
        code: "operator",
        deletedAt: null,
        rolePermissions: permissions.map((code) => ({
          deletedAt: null,
          permission: { code, type: "api", deletedAt: null }
        }))
      }
    }
  ]
});

const facts: LiveDashboardSnapshotFacts = {
  evaluatedAt: now,
  scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
  children: [
    {
      code: "13",
      name: "東京都",
      orderCount: 1,
      confirmedPayments: { jpy: 9000, ndp: 0, testNdp: 0 }
    }
  ],
  headline: { newOrders: 1, completedOrders: 1, newCustomers: 1, onboardedTechnicians: 1 },
  confirmedPayments: { jpy: 9000, ndp: 0, testNdp: 0 },
  orders: {
    total: 1,
    serviceGmv: { jpy: 9000, ndp: 0, testNdp: 0 },
    platformNetRevenue: { jpy: 0, ndp: 0, testNdp: 0 },
    agentCommission: null
  },
  realtimeOrders: { list: [], total: 0, page: 1, page_size: 20 },
  activity: [],
  trend: [],
  serviceRanking: [],
  technicianRanking: [],
  coverage: { total: 1, attributed: 1, unresolved: 0, completenessPercent: 100 }
};

const createFixture = () => {
  const users = [createUser(1, ["backoffice:dashboard:read"]), createUser(2, [])];
  const liveDashboardRepository = { getSnapshotFacts: jest.fn(async () => facts) };
  const administrativeRegionRepository = {
    listChildren: jest.fn(async () => [
      { code: "13", name: "東京都", level: "admin1" as const, parentCode: "JP", centroid: null }
    ]),
    resolveVerifiedScope: jest.fn()
  };
  const auditLogRepository = { create: jest.fn(async () => undefined) };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository,
    administrativeRegionRepository,
    liveDashboardRepository,
    liveDashboardCache: {
      getOrCreate: jest.fn(async (_key: string, factory: () => Promise<unknown>) => ({
        value: await factory(),
        cachedAt: now,
        cacheStatus: "miss"
      }))
    },
    liveDashboardClock: () => now,
    backofficeRepository: {}
  } as never);
  const tokens = Object.fromEntries(
    users.map((user) => [
      user.id,
      new AuthTokenService(env).issueAccessToken({
        id: user.id,
        email: user.email,
        currentIdentityId: user.identities[0]!.id,
        sessionGeneration: 0
      }).token
    ])
  ) as Record<number, string>;
  return {
    app,
    auditLogRepository,
    administrativeRegionRepository,
    liveDashboardRepository,
    tokens
  };
};

describe("GET /api/v1/backoffice/dashboard/live-snapshot", () => {
  it("enforces authentication and the existing dashboard permission", async () => {
    const fixture = createFixture();
    await request(fixture.app).get("/api/v1/backoffice/dashboard/live-snapshot").expect(401);
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-snapshot?country=JP")
      .set("Authorization", `Bearer ${fixture.tokens[2]}`)
      .expect(403);
    expect(fixture.liveDashboardRepository.getSnapshotFacts).not.toHaveBeenCalled();
  });

  it("rejects an illegal hierarchy before formal snapshot access", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-snapshot?country=JP&admin2=13104")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .expect(400);
    expect(fixture.administrativeRegionRepository.listChildren).not.toHaveBeenCalled();
    expect(fixture.liveDashboardRepository.getSnapshotFacts).not.toHaveBeenCalled();
  });

  it("returns formal facts with stable scope echo and no recursive PII keys", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-snapshot?country=JP&period=today")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .set("Accept-Language", "ja")
      .expect(200);

    expect(response.body).toMatchObject({
      code: 0,
      message: "success",
      data: {
        scope: {
          country: "JP",
          admin1: null,
          admin2: null,
          breadcrumbs: [{ level: "country", code: "JP", name: "日本" }]
        },
        evaluatedAt: now.toISOString(),
        cachedAt: now.toISOString(),
        freshnessSeconds: 0,
        cacheStatus: "miss",
        realtimeOrders: { list: [], total: 0, page: 1, page_size: 20 }
      }
    });
    const piiKey =
      /^(?:email|phone|telephone|address|customerName|customerId|userId|actorId|note|notes)$/i;
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(key).not.toMatch(piiKey);
        visit(child);
      }
    };
    visit(response.body.data);
    expect(fixture.auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "backoffice.dashboard.live_snapshot.read" })
    );
  });

  it("declares live-snapshot before the metricKey route", () => {
    const source = readFileSync(resolve(__dirname, "../src/routes/backoffice.routes.ts"), "utf8");
    expect(source.indexOf('"/backoffice/dashboard/live-snapshot"')).toBeGreaterThan(-1);
    expect(source.indexOf('"/backoffice/dashboard/live-snapshot"')).toBeLessThan(
      source.indexOf('"/backoffice/dashboard/metrics/:metricKey"')
    );
  });
});
