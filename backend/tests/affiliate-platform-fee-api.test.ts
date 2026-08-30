import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-08-30T02:00:00.000Z");
const readPermission = "page:backoffice-affiliate-fee-rule";
const writePermission = "button:backoffice-affiliate-fee-rule-create";

const permission = (code: string, id: number) => ({
  id,
  name: code,
  code,
  type: code.startsWith("page:") ? "page" : "button",
  module: "backoffice-affiliate",
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createUser = (id: number, roleCode: string, permissionCodes: string[]) => {
  const permissions = permissionCodes.map(permission);
  const role = {
    id,
    name: roleCode,
    code: roleCode,
    description: roleCode,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((item, index) => ({
      id: id * 100 + index,
      roleId: id,
      permissionId: item.id,
      deletedAt: null,
      permission: item
    }))
  };
  return {
    id,
    needoId: `u${String(id).padStart(10, "0")}`,
    email: `${roleCode}@example.test`,
    phone: null,
    passwordHash: "unused",
    username: roleCode,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id,
        userId: id,
        type: "platform_admin",
        scopeType: "platform",
        scopeId: null,
        displayName: roleCode,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      { id, userId: id, roleId: id, scopeType: "platform", scopeId: null, deletedAt: null, role }
    ]
  };
};

const createFixture = () => {
  const users = [
    createUser(1, "finance", [readPermission, writePermission]),
    createUser(2, "operator", [readPermission]),
    createUser(3, "viewer", [readPermission]),
    createUser(4, "merchant_owner", [])
  ];
  const rule = {
    id: 41,
    scopeType: "global",
    scopeKey: "global",
    shopId: null,
    shopName: null,
    shopCity: null,
    feeBps: 1000,
    version: 1,
    effectiveFrom: now,
    effectiveTo: null,
    activeKey: "global",
    reason: "initial",
    createdByNeedoId: null,
    updatedByNeedoId: null,
    createdAt: now,
    updatedAt: now
  };
  const affiliatePlatformFeeService = {
    listRules: jest.fn(async () => ({ list: [rule], total: 1, page: 1, page_size: 20 })),
    getGlobalSummary: jest.fn(async () => ({
      evaluatedAt: now,
      current: rule,
      nextScheduled: null,
      latestVersion: 1
    })),
    listEligibleShops: jest.fn(async () => ({
      list: [{ id: 11, name: "GINZA Calm Body", city: "Tokyo" }],
      total: 1,
      page: 1,
      page_size: 10
    })),
    createRuleVersion: jest.fn(async (_actor, _context, input) => ({
      ...rule,
      feeBps: input.feeBps,
      version: input.expectedVersion + 1,
      effectiveFrom: input.effectiveFrom,
      reason: input.reason,
      createdByNeedoId: "u0000000001",
      updatedByNeedoId: "u0000000001"
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    affiliatePlatformFeeService
  } as never);
  const tokens = Object.fromEntries(
    users.map((user) => [
      user.id,
      new AuthTokenService(env).issueAccessToken({
        id: user.id,
        email: user.email,
        currentIdentityId: user.identities[0].id
      }).token
    ])
  ) as Record<number, string>;

  return { app, affiliatePlatformFeeService, tokens };
};

describe("Affiliate platform fee rule HTTP API", () => {
  it("returns a paginated rule history without internal actor IDs", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/fee-rules?page=1&pageSize=20&scopeType=global")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .expect(200);

    expect(response.body.data).toMatchObject({ total: 1, page: 1, page_size: 20 });
    expect(fixture.affiliatePlatformFeeService.listRules).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }),
      { page: 1, pageSize: 20, scopeType: "global" }
    );
    expect(JSON.stringify(response.body)).not.toContain("createdById");
    expect(JSON.stringify(response.body)).not.toContain("updatedById");
  });

  it("creates a new strict optimistic version for finance", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/affiliate/fee-rules")
      .set("Authorization", `Bearer ${fixture.tokens[1]}`)
      .send({
        scopeType: "global",
        shopId: null,
        feeBps: 1100,
        expectedVersion: 1,
        effectiveFrom: now.toISOString(),
        reason: "业务费率调整"
      })
      .expect(201);

    expect(fixture.affiliatePlatformFeeService.createRuleVersion).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }),
      expect.objectContaining({ ip: expect.any(String) }),
      expect.objectContaining({
        scopeType: "global",
        shopId: null,
        feeBps: 1100,
        expectedVersion: 1,
        effectiveFrom: now,
        reason: "业务费率调整"
      })
    );
  });

  it("returns a server-evaluated global summary to an authorized reader", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/fee-rules/summary?scopeType=global")
      .set("Authorization", `Bearer ${fixture.tokens[2]}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      current: { feeBps: 1000, version: 1 },
      nextScheduled: null,
      latestVersion: 1
    });
    expect(fixture.affiliatePlatformFeeService.getGlobalSummary).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2 })
    );
  });

  it("returns only minimal published-shop options through the fee-rule permission", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get(
        "/api/v1/backoffice/affiliate/fee-rule-shops?keyword=GINZA&page=1&pageSize=10"
      )
      .set("Authorization", `Bearer ${fixture.tokens[2]}`)
      .expect(200);

    expect(response.body.data).toEqual({
      list: [{ id: 11, name: "GINZA Calm Body", city: "Tokyo" }],
      total: 1,
      page: 1,
      page_size: 10
    });
    expect(fixture.affiliatePlatformFeeService.listEligibleShops).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2 }),
      { keyword: "GINZA", page: 1, pageSize: 10 }
    );
    expect(JSON.stringify(response.body)).not.toMatch(/owner|email|phone|bank/i);
  });

  it("protects summary and shop-option reads and rejects unknown query fields", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[2]}`;

    await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/fee-rules/summary?scopeType=global&unknown=1")
      .set("Authorization", authorization)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/fee-rule-shops?pageSize=101")
      .set("Authorization", authorization)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/fee-rules/summary?scopeType=global")
      .expect(401);
    await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/fee-rule-shops")
      .set("Authorization", `Bearer ${fixture.tokens[4]}`)
      .expect(403);
  });

  it("allows operator and viewer reads but blocks writes and unauthorized access", async () => {
    const fixture = createFixture();
    for (const userId of [2, 3]) {
      await request(fixture.app)
        .get("/api/v1/backoffice/affiliate/fee-rules")
        .set("Authorization", `Bearer ${fixture.tokens[userId]}`)
        .expect(200);
      await request(fixture.app)
        .post("/api/v1/backoffice/affiliate/fee-rules")
        .set("Authorization", `Bearer ${fixture.tokens[userId]}`)
        .send({
          scopeType: "global",
          shopId: null,
          feeBps: 1100,
          expectedVersion: 1,
          effectiveFrom: now.toISOString(),
          reason: "blocked"
        })
        .expect(403);
    }
    await request(fixture.app).get("/api/v1/backoffice/affiliate/fee-rules").expect(401);
    await request(fixture.app)
      .get("/api/v1/backoffice/affiliate/fee-rules")
      .set("Authorization", `Bearer ${fixture.tokens[4]}`)
      .expect(403);
  });

  it("rejects unknown fields and invalid scope pairs before service access", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.tokens[1]}`;
    for (const body of [
      {
        scopeType: "global",
        shopId: 11,
        feeBps: 1100,
        expectedVersion: 1,
        effectiveFrom: now.toISOString(),
        reason: "bad scope"
      },
      {
        scopeType: "shop",
        shopId: null,
        feeBps: 1100,
        expectedVersion: 0,
        effectiveFrom: now.toISOString(),
        reason: "bad scope"
      },
      {
        scopeType: "global",
        shopId: null,
        feeBps: 1100,
        expectedVersion: 1,
        effectiveFrom: now.toISOString(),
        reason: "unknown field",
        unknown: true
      }
    ]) {
      await request(fixture.app)
        .post("/api/v1/backoffice/affiliate/fee-rules")
        .set("Authorization", authorization)
        .send(body)
        .expect(400);
    }
    expect(fixture.affiliatePlatformFeeService.createRuleVersion).not.toHaveBeenCalled();
  });
});
