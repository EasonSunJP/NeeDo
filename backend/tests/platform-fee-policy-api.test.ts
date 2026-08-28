import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
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
  const permissions = [...authCodes, read, write].map(makePermission);
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
  const users = [
    { id: 1, email: "operator@example.com", username: "Operator", role: operatorRole },
    { id: 2, email: "finance@example.com", username: "Finance", role: financeRole }
  ].map((user) => ({
    ...user,
    phone: null,
    passwordHash,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null as Date | null,
    deletedAt: null,
    identities: [
      {
        id: user.id,
        userId: user.id,
        type: "platform_admin",
        scopeType: "global",
        scopeId: null,
        displayName: user.username,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
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
    updateShopPayerType: jest.fn(),
    hasMerchantShopScope: jest.fn(async () => false)
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
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };

  return { app, login, platformFeePolicyRepository };
};

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
        expect(response.body.data).toMatchObject({ feeEnabled: false, version: 2 })
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
