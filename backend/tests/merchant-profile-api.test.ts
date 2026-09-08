import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type {
  MerchantProfileMutation,
  MerchantProfilePayload
} from "../src/repositories/merchant-profile.repository";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();
  public async getLoginLock(): Promise<boolean> {
    return false;
  }
  public async getAccountLoginLock(): Promise<boolean> {
    return false;
  }
  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async clearFailedLogin(): Promise<void> {}
  public async recordFailedLoginForAccount(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async clearFailedLoginForAccount(): Promise<void> {}
  public async storeOtp(email: string, otp: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:${email}`, otp, ttlSeconds);
  }
  public async getOtp(email: string): Promise<string | null> {
    return this.getValue(`otp:${email}`);
  }
  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
  }
  public async hasOtpCooldown(email: string): Promise<boolean> {
    return this.getValue(`otp:cooldown:${email}`) !== null;
  }
  public async storeOtpCooldown(email: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:cooldown:${email}`, "1", ttlSeconds);
  }
  public async clearOtpCooldown(email: string): Promise<void> {
    this.values.delete(`otp:cooldown:${email}`);
  }
  public async storeRefreshToken(userId: number, jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`refresh:${userId}:${jti}`, "1", ttlSeconds);
  }
  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.getValue(`refresh:${userId}:${jti}`) !== null;
  }
  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`refresh:${userId}:${jti}`);
  }
  public async revokeAllRefreshTokens(userId: number): Promise<void> {
    for (const key of this.values.keys()) {
      if (key.startsWith(`refresh:${userId}:`)) this.values.delete(key);
    }
  }
  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`token:blacklist:${jti}`, "1", ttlSeconds);
  }
  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.getValue(`token:blacklist:${jti}`) !== null;
  }
  private setValue(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  }
  private getValue(key: string): string | null {
    const stored = this.values.get(key);
    if (!stored || stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return stored.value;
  }
}

const now = new Date("2026-09-01T00:00:00.000Z");
const makeProfile = (): MerchantProfilePayload => ({
  id: 61,
  publicId: "b0000000109",
  userId: 9,
  identityId: 109,
  displayName: "佐藤 美咲",
  avatarUrl: null,
  gender: "private",
  age: 29,
  heightCm: 163,
  languages: ["日本語"],
  bio: "商户负责人",
  visibility: "public",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const permissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "merchant-profile:read",
    "merchant-profile:write"
  ].map((code, index) => ({
    id: index + 1,
    name: code,
    code,
    type: "api",
    module: "merchant-profile",
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }));
  const permittedRole = {
    code: "merchant_owner",
    deletedAt: null,
    rolePermissions: permissions.map((permission) => ({ deletedAt: null, permission }))
  };
  const withoutProfilePermissions = {
    ...permittedRole,
    rolePermissions: permittedRole.rolePermissions.filter(
      ({ permission }) => !permission.code.startsWith("merchant-profile:")
    )
  };
  const customerPermittedRole = { ...permittedRole, code: "customer" };
  const makeUser = (
    id: number,
    email: string,
    identityType: string,
    role: typeof permittedRole
  ) => ({
    id,
    needoId: `u${String(id).padStart(10, "0")}`,
    email,
    phone: null,
    passwordHash,
    username: email,
    avatarUrl: null,
    isActive: true,
    isTestAccount: true,
    accessState: { disabled: false, restricted: false },
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: id + 100,
        userId: id,
        type: identityType,
        scopeType: identityType === "customer" ? "customer_profile" : "shop",
        scopeId: identityType === "customer" ? 41 : 73,
        displayName: email,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [{ deletedAt: null, role }]
  });
  const users = [
    makeUser(9, "merchant@example.com", "merchant_owner", permittedRole),
    makeUser(10, "customer@example.com", "customer", customerPermittedRole),
    makeUser(11, "no-permission@example.com", "merchant_owner", withoutProfilePermissions)
  ];
  let profile = makeProfile();
  const authRepository = {
    findUserByEmail: jest.fn(
      async (email: string) => users.find((user) => user.email === email) ?? null
    ),
    findUserByLoginIdentifier: jest.fn(
      async (identifier: string) =>
        users.find((user) => user.email === identifier || user.needoId === identifier) ?? null
    ),
    findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
    createVerifiedBaselineCustomer: jest.fn(async () => {
      throw new Error("unexpected registration");
    }),
    findVerifiedRegistrationByChallenge: jest.fn(async () => null),
    updateLastLoginAt: jest.fn(async () => undefined),
    createLoginLog: jest.fn(async () => undefined),
    getSuccessfulLoginEvidence: jest.fn(async () => ({
      hasAnySuccessfulLogin: false,
      hasSuccessfulLoginInPeriod: false,
      hasSuccessfulLoginFromIp: false
    })),
    createAuditLog: jest.fn(async () => undefined)
  };
  const merchantProfileRepository = {
    findMine: jest.fn(async (userId: number, identityId: number) =>
      userId === 9 && identityId === 109 ? profile : null
    ),
    updateMine: jest.fn(
      async (userId: number, identityId: number, mutation: MerchantProfileMutation) => {
        if (userId !== 9 || identityId !== 109) throw new Error("unexpected merchant scope");
        profile = { ...profile, ...mutation, avatarUrl: mutation.avatar?.url ?? profile.avatarUrl };
        return profile;
      }
    )
  };
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 0 }),
    authRepository,
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    auditLogRepository: { create: jest.fn(async () => undefined) },
    customerAvatarStorage: { save: jest.fn() },
    merchantProfileRepository,
    merchantShopContextRepository: {
      listManageableShops: jest.fn(
        async (input: { identityScopeId: number; page: number; pageSize: number }) => ({
          list: [
            {
              publicId: `shop${String(input.identityScopeId).padStart(10, "0")}`,
              name: "Authenticated shop",
              city: "Tokyo",
              status: "published",
              selected: true
            }
          ],
          total: 1,
          page: input.page,
          page_size: input.pageSize
        })
      ),
      resolveShop: jest.fn(),
      resolveDefaultShop: jest.fn()
    }
  });
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };
  return { app, login, merchantProfileRepository };
};

describe("merchant profile current-identity API", () => {
  it("reads and updates an independent merchant identity card", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    await request(fixture.app)
      .get("/api/v1/merchant-profile/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toMatchObject({
          publicId: "b0000000109",
          displayName: "佐藤 美咲"
        })
      );

    await request(fixture.app)
      .patch("/api/v1/merchant-profile/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "Misaki", languages: [], visibility: "network" })
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toMatchObject({
          displayName: "Misaki",
          languages: [],
          visibility: "network"
        })
      );
    expect(fixture.merchantProfileRepository.updateMine).toHaveBeenCalledWith(
      9,
      109,
      expect.objectContaining({ displayName: "Misaki", languages: [] }),
      expect.objectContaining({ action: "merchant_profile.self_update", targetId: 61 })
    );
  });

  it("enforces auth, RBAC, merchant identity scope, and strict validation", async () => {
    const fixture = await createFixture();
    const customer = await fixture.login("customer@example.com");
    const noPermission = await fixture.login("no-permission@example.com");

    await request(fixture.app).get("/api/v1/merchant-profile/me").expect(401);
    await request(fixture.app)
      .get("/api/v1/merchant-profile/me")
      .set("Authorization", `Bearer ${noPermission}`)
      .expect(403);
    await request(fixture.app)
      .get("/api/v1/merchant-profile/me")
      .set("Authorization", `Bearer ${customer}`)
      .expect(403);
    await request(fixture.app)
      .patch("/api/v1/merchant-profile/me")
      .set("Authorization", `Bearer ${customer}`)
      .send({ shopName: "不可写入" })
      .expect(400);
  });
});
