import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type {
  TechnicianProfileMutation,
  TechnicianProfilePayload
} from "../src/repositories/technician-profile.repository";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();

  public async getLoginLock(): Promise<boolean> { return false; }
  public async getAccountLoginLock(): Promise<boolean> { return false; }
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
  public async deleteOtp(email: string): Promise<void> { this.values.delete(`otp:${email}`); }
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
    const prefix = `refresh:${userId}:`;
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) this.values.delete(key);
    }
  }
  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`token:blacklist:${jti}`, "1", ttlSeconds);
  }
  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.getValue(`token:blacklist:${jti}`) !== null;
  }

  private setValue(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
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

const now = new Date("2026-08-30T00:00:00.000Z");

const makeProfile = (): TechnicianProfilePayload => ({
  id: 31,
  publicId: "s1234567890",
  userId: 9,
  shopId: 3,
  displayName: "田中 彩",
  avatarUrl: null,
  bio: "肩颈护理",
  city: "Tokyo",
  age: 28,
  heightCm: 164,
  languages: ["日本語"],
  serviceAreas: ["銀座"],
  profileTags: ["肩颈调理"],
  canServeForeigners: true,
  bidBudgetMinJpy: 12_000,
  bidBudgetMaxJpy: 28_000,
  paymentMethods: ["platform", "offline"],
  visibility: "public",
  employmentType: "full_time",
  yearsExperience: 4,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const permissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "technician-profile:read",
    "technician-profile:write"
  ].map((code, index) => ({
    id: index + 1,
    name: code,
    code,
    type: "api",
    module: "technician-profile",
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }));
  const permittedRole = {
    code: "technician",
    deletedAt: null,
    rolePermissions: permissions.map((permission) => ({ deletedAt: null, permission }))
  };
  const withoutProfilePermissions = {
    ...permittedRole,
    rolePermissions: permittedRole.rolePermissions.filter(({ permission }) =>
      !permission.code.startsWith("technician-profile:")
    )
  };
  const makeUser = (
    id: number,
    email: string,
    identityType: string,
    scopeId: number,
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
    accessState: { disabled: false, restricted: false },
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [{
      id: id + 100,
      userId: id,
      type: identityType,
      scopeType: identityType === "technician" ? "technician_profile" : "customer_profile",
      scopeId,
      displayName: email,
      isDefault: true,
      isActive: true,
      deletedAt: null
    }],
    userRoles: [{ deletedAt: null, role }]
  });
  const users = [
    makeUser(9, "technician@example.com", "technician", 31, permittedRole),
    makeUser(10, "customer@example.com", "customer", 41, permittedRole),
    makeUser(11, "no-permission@example.com", "technician", 32, withoutProfilePermissions)
  ];
  let profile = makeProfile();
  const authRepository = {
    findUserByEmail: jest.fn(async (email: string) => users.find((user) => user.email === email) ?? null),
    findUserByLoginIdentifier: jest.fn(async (identifier: string) =>
      users.find((user) => user.email === identifier || user.needoId === identifier) ?? null
    ),
    findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
    createVerifiedBaselineCustomer: jest.fn(async () => { throw new Error("unexpected registration"); }),
    findVerifiedRegistrationByChallenge: jest.fn(async () => null),
    updateLastLoginAt: jest.fn(async () => undefined),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async () => undefined)
  };
  const technicianProfileRepository = {
    findMine: jest.fn(async (userId: number, profileId: number) =>
      userId === 9 && profileId === 31 ? profile : null
    ),
    updateMine: jest.fn(async (
      userId: number,
      profileId: number,
      ownerIdentityId: number,
      mutation: TechnicianProfileMutation
    ) => {
      if (userId !== 9 || profileId !== 31 || ownerIdentityId !== 109) {
        throw new Error("unexpected technician profile scope");
      }
      profile = {
        ...profile,
        ...(mutation.displayName === undefined ? {} : { displayName: mutation.displayName }),
        ...(mutation.languages === undefined ? {} : { languages: mutation.languages }),
        ...(mutation.paymentMethods === undefined ? {} : { paymentMethods: mutation.paymentMethods }),
        ...(mutation.visibility === undefined ? {} : { visibility: mutation.visibility })
      };
      return profile;
    })
  };
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 0 }),
    authRepository,
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    auditLogRepository: { create: jest.fn(async () => undefined) },
    technicianProfileRepository
  });
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };
  return { app, login, technicianProfileRepository };
};

describe("technician profile current-identity API", () => {
  it("reads and updates the active technician identity through auth, RBAC and validation", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("technician@example.com");

    await request(fixture.app)
      .get("/api/v1/technician-profile/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => expect(body.data).toMatchObject({ id: 31, displayName: "田中 彩" }));

    await request(fixture.app)
      .patch("/api/v1/technician-profile/me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        displayName: "彩",
        languages: ["日本語", "中文"],
        paymentMethods: ["platform", "cash", "paypay"],
        visibility: "network"
      })
      .expect(200)
      .expect(({ body }) => expect(body.data).toMatchObject({
        displayName: "彩",
        paymentMethods: ["platform", "cash", "paypay"],
        visibility: "network"
      }));

    expect(fixture.technicianProfileRepository.updateMine).toHaveBeenCalledWith(
      9,
      31,
      109,
      expect.objectContaining({
        displayName: "彩",
        paymentMethods: ["platform", "cash", "paypay"],
        visibility: "network"
      }),
      expect.objectContaining({
        action: "technician_profile.self_update",
        metadata: { changedFields: ["displayName", "languages", "paymentMethods", "visibility"] }
      })
    );
  });

  it("rejects missing auth, missing permission, a non-technician identity and invalid data", async () => {
    const fixture = await createFixture();
    const technicianToken = await fixture.login("technician@example.com");
    const customerToken = await fixture.login("customer@example.com");
    const noPermissionToken = await fixture.login("no-permission@example.com");

    await request(fixture.app)
      .patch("/api/v1/technician-profile/me")
      .send({ displayName: "x" })
      .expect(401);
    await request(fixture.app)
      .patch("/api/v1/technician-profile/me")
      .set("Authorization", `Bearer ${noPermissionToken}`)
      .send({ displayName: "x" })
      .expect(403);
    await request(fixture.app)
      .patch("/api/v1/technician-profile/me")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ displayName: "x" })
      .expect(403);
    await request(fixture.app)
      .patch("/api/v1/technician-profile/me")
      .set("Authorization", `Bearer ${technicianToken}`)
      .send({ age: 999 })
      .expect(400);
  });
});
