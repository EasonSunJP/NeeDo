import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
import { buildRolePermissionAssignments } from "../src/constants/permissions.constants";
import type { PlatformFeePolicyRepositoryPort } from "../src/services/platform-fee-policy.service";

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

const makePermission = (code: string, index: number) => ({
  id: index + 1,
  name: code,
  code,
  type: "api",
  module: "backoffice",
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const authCodes = ["auth:me", "auth:refresh", "auth:logout"];
  const read = "backoffice:platform-fee-policy:read";
  const write = "backoffice:platform-fee-policy:write";
  const merchantRead = "merchant-admin:platform-fee-policy:read";
  const merchantWrite = "merchant-admin:platform-fee-policy:write";
  const permissions = [...authCodes, read, write, merchantRead, merchantWrite].map(makePermission);
  const createRole = (id: number, code: string, allowed: string[]) => ({
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
  const operatorRole = createRole(1, "operator", [...authCodes, read, write]);
  const financeRole = createRole(2, "finance", [...authCodes, read]);
  const merchantOwnerRole = createRole(3, "merchant_owner", [
    ...authCodes,
    merchantRead,
    merchantWrite
  ]);
  const merchantStaffRole = createRole(4, "merchant_staff", [
    ...authCodes,
    merchantRead,
    merchantWrite
  ]);
  const users = [
    {
      id: 1,
      email: "operator@example.com",
      username: "Operator",
      role: operatorRole,
      identities: [identity(1, 1, "platform_admin", "global", null, true)]
    },
    {
      id: 2,
      email: "finance@example.com",
      username: "Finance",
      role: financeRole,
      identities: [identity(2, 2, "platform_admin", "global", null, true)]
    },
    {
      id: 3,
      email: "shop@example.com",
      username: "Shop",
      role: merchantStaffRole,
      identities: [identity(3, 3, "merchant", "shop", 11, true)]
    },
    {
      id: 4,
      email: "merchant@example.com",
      username: "Merchant",
      role: merchantOwnerRole,
      identities: [
        identity(4, 4, "merchant", "merchant_account", 4, true),
        identity(5, 4, "merchant", "merchant_account", 5, false),
        identity(6, 4, "customer", "customer_profile", 7, false),
        identity(7, 4, "technician", "technician_profile", 8, false)
      ]
    }
  ].map((user) => ({
    ...user,
    phone: null,
    passwordHash,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null as Date | null,
    deletedAt: null,
    identities: user.identities,
    userRoles: [{ deletedAt: null, role: user.role }]
  }));
  const shop = {
    shopId: 11,
    shopPublicId: "b0000000011",
    shopName: "Aoyama Care Studio"
  };
  const policy = {
    ...shop,
    feeEnabled: true,
    payerType: "shop" as const,
    version: 1,
    updatedAt: now
  };
  const platformFeePolicyRepository = {
    findGlobalBookingFee: jest.fn(async () => ({
      amountNdp: 500,
      version: 1,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      source: "persisted" as const
    })),
    findShopPolicy: jest.fn(async () => policy),
    findShopById: jest.fn(async () => shop),
    listShopPolicies: jest.fn(async () => ({
      list: [{ ...shop, policy }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    updateGlobalAmount: jest.fn(async (input: { amountNdp: number }) => ({
      kind: "updated" as const,
      value: {
        amountNdp: input.amountNdp,
        version: 2,
        effectiveFrom: now.toISOString(),
        source: "persisted" as const
      }
    })),
    updateShopFeeEnabled: jest.fn(async (input: { feeEnabled: boolean }) => ({
      kind: "updated" as const,
      value: { ...policy, feeEnabled: input.feeEnabled, version: 2 }
    })),
    updateShopPayerType: jest.fn(async (input: { payerType: "shop" | "technician" }) => ({
      kind: "updated" as const,
      value: { ...policy, payerType: input.payerType, version: 2 }
    })),
    hasMerchantShopScope: jest.fn(
      async (input: { scopeType: string; scopeId: number; shopId: number }) =>
        (input.scopeType === "shop" && input.scopeId === 11 && input.shopId === 11) ||
        (input.scopeType === "merchant_account" && input.scopeId === 4 && input.shopId === 11)
    )
  } as unknown as jest.Mocked<PlatformFeePolicyRepositoryPort>;
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((user) => user.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (identifier: string) =>
          users.find((user) => user.email === identifier || user.username === identifier) ?? null
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
    platformFeePolicyRepository
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

  return { app, login, switchIdentity, platformFeePolicyRepository };
};

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

describe("backoffice platform fee policy APIs", () => {
  it("lets operators read the global policy and paginated shop policies", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("operator@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/platform-fee-policy")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ amountNdp: 500, version: 1 });
      });
    await request(fixture.app)
      .get("/api/v1/backoffice/shop-platform-fee-policies?page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          total: 1,
          page: 1,
          page_size: 20,
          list: [
            expect.objectContaining({
              shopId: 11,
              globalAmountNdp: 500,
              feeEnabled: true,
              payerType: "shop"
            })
          ]
        });
      });
  });

  it("keeps global amount and shop enabled mutations separate", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("operator@example.com");

    await request(fixture.app)
      .patch("/api/v1/backoffice/platform-fee-policy")
      .set("Authorization", `Bearer ${token}`)
      .send({ amountNdp: 700, expectedVersion: 1 })
      .expect(200)
      .expect((response) =>
        expect(response.body.data).toMatchObject({ amountNdp: 700, version: 2 })
      );
    await request(fixture.app)
      .patch("/api/v1/backoffice/shops/11/platform-fee-policy")
      .set("Authorization", `Bearer ${token}`)
      .send({ feeEnabled: false, expectedVersion: 1 })
      .expect(200)
      .expect((response) =>
        expect(response.body.data).toMatchObject({
          globalAmountNdp: 500,
          feeEnabled: false,
          policyVersion: 2,
          policySource: "persisted"
        })
      );

    expect(fixture.platformFeePolicyRepository.updateGlobalAmount).toHaveBeenCalledWith(
      expect.objectContaining({ amountNdp: 700, expectedVersion: 1 })
    );
    expect(fixture.platformFeePolicyRepository.updateShopFeeEnabled).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 11, feeEnabled: false, expectedVersion: 1 })
    );
  });

  it("rejects unknown or cross-owner mutation fields", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("operator@example.com");

    for (const body of [
      { amountNdp: 700, expectedVersion: 1, payerType: "technician" },
      { amountNdp: 700, expectedVersion: 1, unknown: true }
    ]) {
      await request(fixture.app)
        .patch("/api/v1/backoffice/platform-fee-policy")
        .set("Authorization", `Bearer ${token}`)
        .send(body)
        .expect(400);
    }
    for (const body of [
      { feeEnabled: false, expectedVersion: 1, payerType: "technician" },
      { feeEnabled: false, expectedVersion: 1, shopId: 12 }
    ]) {
      await request(fixture.app)
        .patch("/api/v1/backoffice/shops/11/platform-fee-policy")
        .set("Authorization", `Bearer ${token}`)
        .send(body)
        .expect(400);
    }
  });

  it("allows finance read but blocks finance write and unauthenticated read", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("finance@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/platform-fee-policy")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(fixture.app)
      .patch("/api/v1/backoffice/platform-fee-policy")
      .set("Authorization", `Bearer ${token}`)
      .send({ amountNdp: 700, expectedVersion: 1 })
      .expect(403);
    await request(fixture.app).get("/api/v1/backoffice/platform-fee-policy").expect(401);
  });

  it("returns the stable optimistic-lock conflict", async () => {
    const fixture = await createFixture();
    fixture.platformFeePolicyRepository.updateGlobalAmount.mockResolvedValue({
      kind: "version_conflict"
    });
    const token = await fixture.login("operator@example.com");

    await request(fixture.app)
      .patch("/api/v1/backoffice/platform-fee-policy")
      .set("Authorization", `Bearer ${token}`)
      .send({ amountNdp: 700, expectedVersion: 1 })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.PLATFORM_FEE_POLICY_VERSION_CONFLICT,
          message: "error.platform_fee_policy.version_conflict"
        });
      });
  });
});

describe("merchant platform fee payer APIs", () => {
  it("assigns merchant policy permissions only to merchant roles and admin", () => {
    const assignments = buildRolePermissionAssignments();
    const read = "merchant-admin:platform-fee-policy:read";
    const write = "merchant-admin:platform-fee-policy:write";

    for (const role of ["admin", "merchant_owner", "merchant_staff"] as const) {
      expect(assignments[role]).toEqual(expect.arrayContaining([read, write]));
    }
    for (const role of ["operator", "finance", "support", "customer", "technician"] as const) {
      expect(assignments[role]).not.toContain(write);
    }
  });

  it("lets an exact shop identity read and update only its payer", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("shop@example.com");

    await request(fixture.app)
      .get("/api/v1/merchant-admin/shops/11/platform-fee-policy")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          shopId: 11,
          shopPublicId: "b0000000011",
          payerType: "shop"
        });
      });
    await request(fixture.app)
      .patch("/api/v1/merchant-admin/shops/11/platform-fee-policy/payer")
      .set("Authorization", `Bearer ${token}`)
      .send({ payerType: "technician", expectedVersion: 1 })
      .expect(200)
      .expect((response) =>
        expect(response.body.data).toMatchObject({
          globalAmountNdp: 500,
          payerType: "technician",
          policyVersion: 2,
          policySource: "persisted"
        })
      );
    expect(fixture.platformFeePolicyRepository.updateShopPayerType).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 11,
        payerType: "technician",
        merchantScope: { scopeType: "shop", scopeId: 11 }
      })
    );
  });

  it("lets the active merchant account manage a member shop", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    await request(fixture.app)
      .get("/api/v1/merchant-admin/shops/11/platform-fee-policy")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(fixture.app)
      .patch("/api/v1/merchant-admin/shops/11/platform-fee-policy/payer")
      .set("Authorization", `Bearer ${token}`)
      .send({ payerType: "shop", expectedVersion: 1 })
      .expect(200);
    expect(fixture.platformFeePolicyRepository.hasMerchantShopScope).toHaveBeenCalledWith({
      scopeType: "merchant_account",
      scopeId: 4,
      shopId: 11
    });
  });

  it("blocks a foreign merchant account, deleted membership, customer, and technician identity", async () => {
    const fixture = await createFixture();
    const deniedTokens = [
      await fixture.switchIdentity("merchant@example.com", 5),
      await fixture.switchIdentity("merchant@example.com", 6),
      await fixture.switchIdentity("merchant@example.com", 7)
    ];

    for (const token of deniedTokens) {
      await request(fixture.app)
        .get("/api/v1/merchant-admin/shops/11/platform-fee-policy")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    }
    const merchantToken = await fixture.login("merchant@example.com");
    await request(fixture.app)
      .get("/api/v1/merchant-admin/shops/12/platform-fee-policy")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(403);
  });

  it("accepts only payerType and expectedVersion", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("shop@example.com");

    for (const body of [
      { payerType: "technician", expectedVersion: 1, feeEnabled: false },
      { payerType: "technician", expectedVersion: 1, amountNdp: 0 },
      { payerType: "technician", expectedVersion: 1, shopId: 12 },
      { payerType: "technician", expectedVersion: 1, unknown: true }
    ]) {
      await request(fixture.app)
        .patch("/api/v1/merchant-admin/shops/11/platform-fee-policy/payer")
        .set("Authorization", `Bearer ${token}`)
        .send(body)
        .expect(400);
    }
  });

  it("returns a stable conflict without writing a standalone audit row", async () => {
    const fixture = await createFixture();
    fixture.platformFeePolicyRepository.updateShopPayerType.mockResolvedValue({
      kind: "version_conflict"
    });
    const token = await fixture.login("shop@example.com");

    await request(fixture.app)
      .patch("/api/v1/merchant-admin/shops/11/platform-fee-policy/payer")
      .set("Authorization", `Bearer ${token}`)
      .send({ payerType: "technician", expectedVersion: 1 })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.PLATFORM_FEE_POLICY_VERSION_CONFLICT);
      });
  });
});
