import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { LiveDashboardSnapshotFacts } from "../src/domain/live-dashboard";
import { AuthTokenService } from "../src/services/auth-token.service";
import { AppError } from "../src/utils/app-error";

const now = new Date("2026-09-06T03:04:05.000Z");

const createUser = (
  id: number,
  permissions: string[],
  identity: { type: string; scopeType: string } = { type: "platform_admin", scopeType: "global" }
) => ({
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
      type: identity.type,
      scopeType: identity.scopeType,
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
      currentDayOrderCount: 1,
      previousDayOrderCount: 2,
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

const createFixture = (
  options: { failAudit?: boolean; cursorReset?: boolean; readFailure?: boolean } = {}
) => {
  const users = [
    createUser(1, ["backoffice:dashboard:read"]),
    createUser(2, []),
    createUser(3, ["backoffice:dashboard:read"], { type: "customer", scopeType: "global" }),
    createUser(4, ["backoffice:dashboard:read"], { type: "technician", scopeType: "global" }),
    createUser(5, ["backoffice:dashboard:read"], { type: "merchant", scopeType: "global" })
  ];
  const liveDashboardRepository = { getSnapshotFacts: jest.fn(async () => facts) };
  const administrativeRegionRepository = {
    listChildren: jest.fn(async () => [
      { code: "13", name: "東京都", level: "admin1" as const, parentCode: "JP", centroid: null }
    ]),
    resolveVerifiedScope: jest.fn()
  };
  const auditLogRepository = {
    create: jest.fn(async () => {
      if (options.failAudit) throw new Error("audit unavailable");
    })
  };
  const liveDashboardCache = {
    getOrCreate: jest.fn(async (_key: string, factory: () => Promise<unknown>) => ({
      value: await factory(),
      cachedAt: now,
      cacheStatus: "miss"
    }))
  };
  const liveDashboardEventGateway = {
    publish: jest.fn(),
    subscribe: jest.fn(async (_scope, _lastEventId, response, beforeConnect) => {
      if (options.readFailure) {
        throw new AppError({
          code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
          message: "error.dependency_unavailable",
          statusCode: 503
        });
      }
      if (options.cursorReset) {
        throw new AppError({
          code: ERROR_CODES.LIVE_DASHBOARD_CURSOR_RESET_REQUIRED,
          message: "error.live_dashboard.cursor_reset_required",
          statusCode: 409
        });
      }
      await beforeConnect();
      response.status(200).end();
      return () => undefined;
    }),
    close: jest.fn()
  };
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
    liveDashboardCache,
    liveDashboardEventGateway,
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
    liveDashboardCache,
    liveDashboardEventGateway,
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

  it.each([
    ["customer", 3],
    ["technician", 4],
    ["merchant", 5]
  ])(
    "rejects active %s identity even when its account retains dashboard permission",
    async (_identityType, userId) => {
      const fixture = createFixture();
      await request(fixture.app)
        .get("/api/v1/backoffice/dashboard/live-snapshot?country=JP")
        .set("Authorization", `Bearer ${fixture.tokens[userId]}`)
        .expect(403);
      expect(fixture.administrativeRegionRepository.resolveVerifiedScope).not.toHaveBeenCalled();
      expect(fixture.administrativeRegionRepository.listChildren).not.toHaveBeenCalled();
      expect(fixture.liveDashboardCache.getOrCreate).not.toHaveBeenCalled();
      expect(fixture.liveDashboardRepository.getSnapshotFacts).not.toHaveBeenCalled();
      expect(fixture.auditLogRepository.create).not.toHaveBeenCalled();
    }
  );

  it("does not send a successful snapshot when the formal read audit fails", async () => {
    const fixture = createFixture({ failAudit: true });
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-snapshot?country=JP")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .expect(500);

    expect(response.body).toMatchObject({ code: expect.any(Number), data: null });
    expect(response.body.code).not.toBe(0);
    expect(fixture.auditLogRepository.create).toHaveBeenCalledTimes(1);
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

describe("GET /api/v1/backoffice/dashboard/live-events", () => {
  it("is Bearer-header only and enforces the dashboard permission", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get(`/api/v1/backoffice/dashboard/live-events?country=JP&access_token=${fixture.tokens[1]}`)
      .expect(401);
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-events?country=JP")
      .set("Authorization", `Bearer ${fixture.tokens[2]}`)
      .expect(403);
    expect(fixture.liveDashboardEventGateway.subscribe).not.toHaveBeenCalled();
  });

  it.each([3, 4, 5])(
    "rejects non-platform active identity %s before opening the stream",
    async (userId) => {
      const fixture = createFixture();
      await request(fixture.app)
        .get("/api/v1/backoffice/dashboard/live-events?country=JP")
        .set("Authorization", `Bearer ${fixture.tokens[userId]}`)
        .expect(403);
      expect(fixture.liveDashboardEventGateway.subscribe).not.toHaveBeenCalled();
    }
  );

  it("validates Last-Event-ID and passes the strict regional scope to the shared gateway", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-events?country=JP")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .set("Last-Event-ID", "invalid-identifier")
      .expect(400);

    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-events?country=JP&admin1=13&period=today")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .set("Last-Event-ID", "1000-4")
      .expect(200);

    expect(fixture.liveDashboardEventGateway.subscribe).toHaveBeenCalledWith(
      { countryCode: "JP", admin1Code: "13", admin2Code: null },
      "1000-4",
      expect.anything(),
      expect.any(Function)
    );
    expect(fixture.auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "backoffice.dashboard.live_events.connect" })
    );
    expect(fixture.liveDashboardEventGateway.subscribe.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.auditLogRepository.create.mock.invocationCallOrder[0]!
    );
  });

  it("returns a pre-header cursor reset conflict without recording a successful connection", async () => {
    const fixture = createFixture({ cursorReset: true });
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-events?country=JP")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .set("Last-Event-ID", "9999999999999-0")
      .expect(409);

    expect(response.body).toEqual({
      code: ERROR_CODES.LIVE_DASHBOARD_CURSOR_RESET_REQUIRED,
      message: "error.live_dashboard.cursor_reset_required",
      data: null
    });
    expect(fixture.auditLogRepository.create).not.toHaveBeenCalled();
    expect(fixture.liveDashboardEventGateway.subscribe).toHaveBeenCalledTimes(1);
  });

  it("returns a pre-header dependency error without recording a successful connection audit", async () => {
    const fixture = createFixture({ readFailure: true });
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-events?country=JP")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .expect(503);

    expect(response.body).toMatchObject({
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "error.dependency_unavailable",
      data: null
    });
    expect(response.headers["content-type"]).not.toContain("text/event-stream");
    expect(fixture.auditLogRepository.create).not.toHaveBeenCalled();
  });

  it("does not open the stream when the connection audit fails", async () => {
    const fixture = createFixture({ failAudit: true });
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/live-events?country=JP")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .expect(500);
    expect(response.headers["content-type"]).not.toContain("text/event-stream");
    expect(fixture.liveDashboardEventGateway.subscribe).toHaveBeenCalledTimes(1);
  });
});
