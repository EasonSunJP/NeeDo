import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import {
  buildRolePermissionAssignments,
  SYSTEM_PERMISSION_CODES
} from "../src/constants/permissions.constants";
import { DashboardRepository } from "../src/repositories/dashboard.repository";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-08-31T03:00:00.000Z");
const operations = {
  grossRevenue: { current: 100, previous: 80, dataStatus: "ready" as const },
  travelFare: { current: null, previous: null, dataStatus: "not_connected" as const },
  discountAmount: { current: 10, previous: 5, dataStatus: "ready" as const },
  consumablesSales: { current: null, previous: null, dataStatus: "not_connected" as const }
};
const commission = {
  dedicatedTechnicianCommission: { current: 20, previous: 10, dataStatus: "ready" as const },
  partTimeTechnicianCommission: { current: 10, previous: 5, dataStatus: "ready" as const },
  marketingCommission: { current: 4, previous: 2, dataStatus: "ready" as const },
  agentCommission: { current: 7, previous: 3, dataStatus: "ready" as const },
  ndpIncome: { current: 40, previous: 30, dataStatus: "ready" as const },
  affiliatePlatformIncome: { current: 5, previous: 4, dataStatus: "ready" as const },
  consumablesProfit: { current: null, previous: null, dataStatus: "not_connected" as const }
};
const growth = {
  newUsers: { current: 8, previous: 4, dataStatus: "ready" as const },
  newPaidMembers: { current: 2, previous: 1, dataStatus: "ready" as const },
  technicianOnboarding: { current: 3, previous: 2, dataStatus: "ready" as const },
  agentOnboarding: { current: 2, previous: 1, dataStatus: "ready" as const },
  franchiseeOnboarding: { current: 1, previous: 0, dataStatus: "ready" as const },
  supplierOnboarding: { current: 3, previous: 2, dataStatus: "ready" as const }
};

const createUser = (id: number, role: string, permissions: string[]) => ({
  id,
  email: `analytics-${id}@example.test`,
  phone: null,
  passwordHash: "unused",
  username: `Analytics ${id}`,
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
      type: role === "merchant_owner" ? "merchant_owner" : "platform_admin",
      scopeType: role === "merchant_owner" ? "shop" : "global",
      scopeId: role === "merchant_owner" ? 91 : null,
      displayName: `Analytics ${id}`,
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
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

const createFixture = () => {
  const users = [
    createUser(1, "operator", ["backoffice:dashboard:read", "backoffice:dashboard-detail:read"]),
    createUser(2, "viewer", ["backoffice:dashboard:read"]),
    createUser(3, "merchant_owner", ["merchant-admin:dashboard:read"])
  ];
  const auditLogs: unknown[] = [];
  const operationSpy = jest
    .spyOn(DashboardRepository.prototype, "getOperationsFinance")
    .mockResolvedValue(operations);
  const commissionSpy = jest
    .spyOn(DashboardRepository.prototype, "getCommissionFacts")
    .mockResolvedValue(commission);
  const growthSpy = jest
    .spyOn(DashboardRepository.prototype, "getGrowthFacts")
    .mockResolvedValue(growth);
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository: {
      create: jest.fn(async (entry: unknown) => {
        auditLogs.push(entry);
      })
    },
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
  return { app, auditLogs, operationSpy, commissionSpy, growthSpy, tokens };
};

afterEach(() => jest.restoreAllMocks());

describe("comprehensive dashboard analytics HTTP API", () => {
  it("registers the detail permission only in the platform backoffice bundle", () => {
    expect(SYSTEM_PERMISSION_CODES).toContain("backoffice:dashboard-detail:read");
    const assignments = buildRolePermissionAssignments();
    expect(assignments.admin).toContain("backoffice:dashboard-detail:read");
    expect(assignments.operator).toContain("backoffice:dashboard-detail:read");
    expect(assignments.merchant_owner).not.toContain("backoffice:dashboard-detail:read");
    expect(assignments.merchant_staff).not.toContain("backoffice:dashboard-detail:read");
  });

  it("returns the overview success envelope and writes one filter-only audit", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/overview?period=last7days&city=Tokyo")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .set("User-Agent", "analytics-api-test")
      .expect(200);

    expect(response.body).toMatchObject({
      code: 0,
      message: "success",
      data: {
        filter: { period: "last7days", city: "Tokyo" },
        operationsFinance: expect.any(Array),
        commissionMetrics: expect.any(Array),
        growthMetrics: expect.any(Array)
      }
    });
    expect(fixture.operationSpy).toHaveBeenCalledTimes(1);
    expect(fixture.commissionSpy).toHaveBeenCalledTimes(1);
    expect(fixture.growthSpy).toHaveBeenCalledTimes(1);
    expect(fixture.auditLogs).toEqual([
      expect.objectContaining({
        actorId: 1,
        action: "backoffice.dashboard.overview.read",
        targetType: "backoffice_dashboard_overview",
        metadata: {
          period: "last7days",
          from: expect.any(String),
          to: expect.any(String),
          city: "Tokyo"
        }
      })
    ]);
    expect(JSON.stringify(fixture.auditLogs)).not.toMatch(/customerId|shopId|technicianId/i);
  });

  it("returns one focused detail series and does not query unrelated groups", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/metrics/new_users?period=last7days")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .expect(200);

    expect(response.body).toMatchObject({
      code: 0,
      data: {
        metric: { metricKey: "new_users", currentValue: 8, previousValue: 4 },
        series: [
          {
            seriesKey: "new_users",
            unit: "people",
            points: [
              { key: "previous", value: 4 },
              { key: "current", value: 8 }
            ]
          }
        ]
      }
    });
    expect(fixture.operationSpy).not.toHaveBeenCalled();
    expect(fixture.commissionSpy).not.toHaveBeenCalled();
    expect(fixture.growthSpy).toHaveBeenCalledTimes(1);
    expect(fixture.auditLogs).toEqual([
      expect.objectContaining({
        action: "backoffice.dashboard.metric.read",
        metadata: expect.objectContaining({ metricKey: "new_users" })
      })
    ]);
  });

  it("rejects strict query/path input before any focused reader executes", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[1]}`;
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/overview?unknown=1")
      .set("Authorization", authorization)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/metrics/not_a_metric")
      .set("Authorization", authorization)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/metrics/new_users?period=custom&from=2026-08-01")
      .set("Authorization", authorization)
      .expect(400);
    expect(fixture.operationSpy).not.toHaveBeenCalled();
    expect(fixture.commissionSpy).not.toHaveBeenCalled();
    expect(fixture.growthSpy).not.toHaveBeenCalled();
    expect(fixture.auditLogs).toEqual([]);
  });

  it("keeps authentication, dedicated detail RBAC, and merchant exposure fail closed", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/overview")
      .expect(401)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.TOKEN_INVALID));
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard/metrics/new_users")
      .set("Authorization", `Bearer ${fixture.tokens[2]}`)
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN));
    await request(fixture.app)
      .get("/api/v1/merchant-admin/dashboard/overview")
      .set("Authorization", `Bearer ${fixture.tokens[3]}`)
      .expect(404);
    expect(fixture.operationSpy).not.toHaveBeenCalled();
    expect(fixture.commissionSpy).not.toHaveBeenCalled();
    expect(fixture.growthSpy).not.toHaveBeenCalled();
  });
});
