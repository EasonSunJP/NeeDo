import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";
import type {
  OrderAcceptancePausePayload,
  OrderAcceptancePauseRepositoryPort
} from "../src/services/order-acceptance-pause.service";
import { createMerchantAccountShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-08-29T00:00:00.000Z");

class InMemoryAuthSessionStore {
  public async getLoginLock(): Promise<boolean> {
    return false;
  }
  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async clearFailedLogin(): Promise<void> {}
  public async storeOtp(): Promise<void> {}
  public async getOtp(): Promise<string | null> {
    return null;
  }
  public async deleteOtp(): Promise<void> {}
  public async hasOtpCooldown(): Promise<boolean> {
    return false;
  }
  public async storeOtpCooldown(): Promise<void> {}
  public async clearOtpCooldown(): Promise<void> {}
  public async storeRefreshToken(): Promise<void> {}
  public async hasRefreshToken(): Promise<boolean> {
    return true;
  }
  public async revokeRefreshToken(): Promise<void> {}
  public async rotateRefreshToken(): Promise<boolean> {
    return true;
  }
  public async blacklistAccessToken(): Promise<void> {}
  public async isAccessTokenBlacklisted(): Promise<boolean> {
    return false;
  }
}

const identity = (
  id: number,
  userId: number,
  type: string,
  scopeType: string,
  scopeId: number | null,
  isDefault: boolean
) => ({
  id,
  userId,
  type,
  scopeType,
  scopeId,
  displayName: `${type}-${id}`,
  isDefault,
  isActive: true,
  deletedAt: null
});

const createFixture = async () => {
  const permissionCodes = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "backoffice:order-acceptance-pause:read",
    "backoffice:order-acceptance-pause:write",
    "merchant-admin:order-acceptance-pause:read",
    "merchant-admin:order-acceptance-pause:write"
  ];
  const permissions = permissionCodes.map((code, index) => ({
    id: index + 1,
    name: code,
    code,
    type: "api",
    module: "order-acceptance-pause",
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }));
  const makeRole = (id: number, code: string, allowed: string[]) => ({
    id,
    name: code,
    code,
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions
      .filter((permission) => allowed.includes(permission.code))
      .map((permission, index) => ({
        id: id * 100 + index,
        roleId: id,
        permissionId: permission.id,
        deletedAt: null,
        permission
      }))
  });
  const auth = permissionCodes.slice(0, 3);
  const operatorRole = makeRole(1, "operator", [
    ...auth,
    "backoffice:order-acceptance-pause:read",
    "backoffice:order-acceptance-pause:write"
  ]);
  const financeRole = makeRole(2, "finance", auth);
  const merchantRole = makeRole(3, "merchant_owner", [
    ...auth,
    "merchant-admin:order-acceptance-pause:read",
    "merchant-admin:order-acceptance-pause:write"
  ]);
  const customerRole = makeRole(4, "customer", auth);
  const passwordHash = await hash("Abcd@1234", 12);
  const users = [
    {
      id: 1,
      email: "operator@example.com",
      role: operatorRole,
      identities: [identity(1, 1, "platform_admin", "global", null, true)]
    },
    {
      id: 2,
      email: "finance@example.com",
      role: financeRole,
      identities: [identity(2, 2, "platform_admin", "global", null, true)]
    },
    {
      id: 3,
      email: "merchant@example.com",
      role: merchantRole,
      identities: [
        identity(3, 3, "merchant_organization", "merchant_account", 41, true),
        identity(4, 3, "merchant", "shop", 11, false),
        identity(5, 3, "customer", "customer_profile", 31, false)
      ]
    },
    {
      id: 4,
      email: "customer@example.com",
      role: customerRole,
      identities: [identity(6, 4, "customer", "customer_profile", 32, true)]
    }
  ].map((user) => ({
    ...user,
    username: user.email,
    phone: null,
    passwordHash,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    userRoles: [{ deletedAt: null, role: user.role }]
  }));
  const activePause: OrderAcceptancePausePayload = {
    id: 71,
    subjectType: "shop",
    subjectId: 11,
    merchantAccountId: null,
    merchantAccountName: null,
    shopId: 11,
    shopName: "Aoyama Care Studio",
    authorityType: "operations",
    status: "active",
    reasonCode: "balance_review",
    reasonDetail: "运营人工复核",
    startsAt: now,
    releasedAt: null,
    releaseReason: null,
    createdAt: now,
    updatedAt: now
  };
  const repository = {
    listPauses: jest.fn(async () => ({
      list: [activePause],
      total: 1,
      page: 1,
      page_size: 20
    })),
    createPause: jest.fn(async () => ({ kind: "created" as const, value: activePause })),
    releasePause: jest.fn(async () => ({
      kind: "released" as const,
      value: {
        ...activePause,
        status: "released" as const,
        releasedAt: now,
        releaseReason: "余额已经补足",
        updatedAt: now
      }
    }))
  } as unknown as jest.Mocked<OrderAcceptancePauseRepositoryPort>;
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((user) => user.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (value: string) => users.find((user) => user.email === value) ?? null
      ),
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
      updateLastLoginAt: jest.fn(async () => undefined),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    merchantShopContextRepository: createMerchantAccountShopContextRepository({
      merchantAccountId: 41,
      shopId: 11,
      shopPublicId: "shop0000000011"
    }),
    orderAcceptancePauseRepository: repository
  } as never);
  const loginPair = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data as { accessToken: string; refreshToken: string };
  };
  const login = async (email: string) => (await loginPair(email)).accessToken;
  const switchIdentity = async (email: string, identityId: number) => {
    const pair = await loginPair(email);
    const response = await request(app)
      .post("/api/v1/auth/switch-identity")
      .set("Authorization", `Bearer ${pair.accessToken}`)
      .send({ refreshToken: pair.refreshToken, identityId })
      .expect(200);
    return response.body.data.accessToken as string;
  };

  return { app, login, switchIdentity, repository };
};

describe("order acceptance pause APIs", () => {
  it("assigns write permission only to operations and merchant roles", () => {
    const assignments = buildRolePermissionAssignments();

    expect(assignments.operator).toEqual(
      expect.arrayContaining([
        "backoffice:order-acceptance-pause:read",
        "backoffice:order-acceptance-pause:write"
      ])
    );
    for (const role of ["merchant_owner", "merchant_staff"] as const) {
      expect(assignments[role]).toEqual(
        expect.arrayContaining([
          "merchant-admin:order-acceptance-pause:read",
          "merchant-admin:order-acceptance-pause:write"
        ])
      );
    }
    for (const role of ["finance", "support", "customer", "technician"] as const) {
      expect(assignments[role]).not.toContain("backoffice:order-acceptance-pause:write");
      expect(assignments[role]).not.toContain("merchant-admin:order-acceptance-pause:write");
    }
  });

  it("lets operations list, create, and release a pause", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("operator@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/order-acceptance-pauses?page=1&pageSize=20&status=active")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => expect(response.body.data.total).toBe(1));
    await request(fixture.app)
      .post("/api/v1/backoffice/order-acceptance-pauses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        subjectType: "shop",
        subjectId: 11,
        reasonCode: "balance_review",
        reasonDetail: "运营人工复核"
      })
      .expect(201)
      .expect((response) => expect(response.body.data.id).toBe(71));
    await request(fixture.app)
      .post("/api/v1/backoffice/order-acceptance-pauses/71/release")
      .set("Authorization", `Bearer ${token}`)
      .send({ releaseReason: "余额已经补足" })
      .expect(200)
      .expect((response) => expect(response.body.data.status).toBe("released"));

    expect(fixture.repository.listPauses).toHaveBeenCalledWith(
      { authorityType: "operations" },
      { page: 1, pageSize: 20, status: "active" }
    );
    expect(fixture.repository.createPause).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 1,
        actorScope: { authorityType: "operations" },
        subjectType: "shop",
        subjectId: 11
      })
    );
  });

  it("derives merchant and shop scope only from the active identity", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");
    await request(fixture.app)
      .post("/api/v1/merchant-admin/order-acceptance-pauses")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({
        subjectType: "shop",
        subjectId: 11,
        reasonCode: "manual_pause",
        reasonDetail: "集团暂缓接单"
      })
      .expect(201);
    expect(fixture.repository.createPause).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actorScope: { authorityType: "merchant", scopeType: "merchant_account", scopeId: 41 }
      })
    );

    const shopToken = await fixture.switchIdentity("merchant@example.com", 4);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/order-acceptance-pauses")
      .set("Authorization", `Bearer ${shopToken}`)
      .expect(200);
    expect(fixture.repository.listPauses).toHaveBeenLastCalledWith(
      { authorityType: "shop", scopeType: "shop", scopeId: 11 },
      {}
    );
  });

  it("rejects unauthenticated, permissionless, invalid, and customer-identity requests", async () => {
    const fixture = await createFixture();
    await request(fixture.app).get("/api/v1/backoffice/order-acceptance-pauses").expect(401);

    const financeToken = await fixture.login("finance@example.com");
    await request(fixture.app)
      .get("/api/v1/backoffice/order-acceptance-pauses")
      .set("Authorization", `Bearer ${financeToken}`)
      .expect(403);

    const operatorToken = await fixture.login("operator@example.com");
    await request(fixture.app)
      .post("/api/v1/backoffice/order-acceptance-pauses")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({
        subjectType: "shop",
        subjectId: 11,
        reasonCode: "!",
        reasonDetail: "x",
        authorityType: "operations"
      })
      .expect(400);

    const customerToken = await fixture.switchIdentity("merchant@example.com", 5);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/order-acceptance-pauses")
      .set("Authorization", `Bearer ${customerToken}`)
      .expect(403);
  });

  it("maps repository scope and conflict outcomes to stable errors", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("operator@example.com");
    fixture.repository.createPause.mockResolvedValueOnce({ kind: "scope_forbidden" });
    await request(fixture.app)
      .post("/api/v1/backoffice/order-acceptance-pauses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        subjectType: "shop",
        subjectId: 999,
        reasonCode: "manual_pause",
        reasonDetail: "越权目标"
      })
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.IDENTITY_FORBIDDEN));

    fixture.repository.releasePause.mockResolvedValueOnce({ kind: "conflict" });
    await request(fixture.app)
      .post("/api/v1/backoffice/order-acceptance-pauses/71/release")
      .set("Authorization", `Bearer ${token}`)
      .send({ releaseReason: "解除" })
      .expect(409)
      .expect((response) =>
        expect(response.body.code).toBe(ERROR_CODES.ORDER_ACCEPTANCE_PAUSE_CONFLICT)
      );
  });
});
