import { hash } from "bcryptjs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type {
  CustomerProfileMutation,
  CustomerProfilePayload
} from "../src/repositories/customer-profile.repository";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();

  public async getLoginLock(email: string): Promise<boolean> {
    return this.getValue(`login:lock:${email}`) !== null;
  }

  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }

  public async clearFailedLogin(): Promise<void> {}

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
    const keyPrefix = `refresh:${userId}:`;
    for (const key of this.values.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.values.delete(key);
      }
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

const now = new Date("2026-08-26T00:00:00.000Z");
const avatarHash = "a".repeat(64);

const makeProfile = (): CustomerProfilePayload => ({
  id: 41,
  userId: 11,
  displayName: "田中 彩",
  city: "Tokyo",
  membershipLevel: "standard",
  avatarUrl: `http://localhost:3101/media/customer-avatars/${avatarHash}.png`,
  gender: "private",
  age: null,
  heightCm: null,
  languages: ["日本語"],
  bio: null,
  visibility: "public",
  isPublic: true,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const permissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "customer-profile:read",
    "customer-profile:write"
  ].map((code, index) => ({
    id: index + 1,
    name: code,
    code,
    type: "api",
    module: "customer-profile",
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }));
  const role = {
    code: "customer",
    deletedAt: null,
    rolePermissions: permissions.map((permission) => ({ deletedAt: null, permission }))
  };
  const customer = {
    id: 11,
    needoId: "n0000000011",
    email: "customer@example.com",
    phone: null,
    passwordHash,
    username: "Aya Customer",
    avatarUrl: null,
    isActive: true,
    accessState: { disabled: false, restricted: false },
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: 1,
        userId: 11,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: 41,
        displayName: "Aya Customer",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [{ deletedAt: null, role }]
  };
  const technician = {
    ...customer,
    id: 12,
    needoId: "n0000000012",
    email: "technician@example.com",
    username: "Tomo Technician",
    identities: [
      {
        id: 2,
        userId: 12,
        type: "technician",
        scopeType: "technician_profile",
        scopeId: 51,
        displayName: "Tomo Technician",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [{ deletedAt: null, role: { ...role, rolePermissions: [] } }]
  };
  const wrongIdentity = {
    ...technician,
    id: 13,
    needoId: "n0000000013",
    email: "wrong-identity@example.com",
    username: "Mika Wrong Identity",
    identities: [
      {
        id: 3,
        userId: 13,
        type: "technician",
        scopeType: "technician_profile",
        scopeId: 52,
        displayName: "Mika Wrong Identity",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [{ deletedAt: null, role }]
  };
  const users = [customer, technician, wrongIdentity];
  let profile = makeProfile();
  const auditLogs: unknown[] = [];
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
      throw new Error("unexpected verified registration");
    }),
    updateLastLoginAt: jest.fn(async () => undefined),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async (entry: unknown) => {
      auditLogs.push(entry);
    })
  };
  const customerProfileRepository = {
    findMine: jest.fn(async (userId: number, profileId: number) =>
      userId === 11 && profileId === 41 ? profile : null
    ),
    updateMine: jest.fn(
      async (userId: number, profileId: number, mutation: CustomerProfileMutation) => {
        if (userId !== 11 || profileId !== 41) throw new Error("unexpected profile scope");
        profile = {
          ...profile,
          ...(mutation.displayName === undefined
            ? {}
            : { displayName: mutation.displayName as string }),
          ...(mutation.visibility === undefined
            ? {}
            : { visibility: mutation.visibility as CustomerProfilePayload["visibility"] }),
          ...(mutation.isPublic === undefined ? {} : { isPublic: mutation.isPublic as boolean })
        };
        return profile;
      }
    )
  };
  const avatarDirectory = await mkdtemp(join(tmpdir(), "needo-customer-profile-api-"));
  await writeFile(
    join(avatarDirectory, `${avatarHash}.png`),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  const app = createApp(
    { ...env, CUSTOMER_AVATAR_STORAGE_DIR: avatarDirectory },
    {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 0 }),
      authRepository,
      authSessionStore: new InMemoryAuthSessionStore(),
      auditLogRepository: {
        create: jest.fn(async (entry: unknown) => {
          auditLogs.push(entry);
        })
      },
      customerProfileRepository
    }
  );
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };

  return { app, avatarDirectory, auditLogs, customerProfileRepository, login };
};

describe("customer profile current-user API", () => {
  it("implements per-user refresh-session revocation in its auth store fixture", async () => {
    const sessionStore = new InMemoryAuthSessionStore();
    await sessionStore.storeRefreshToken(11, "customer-session-a", 600);
    await sessionStore.storeRefreshToken(11, "customer-session-b", 600);
    await sessionStore.storeRefreshToken(12, "other-user-session", 600);

    await sessionStore.revokeAllRefreshTokens(11);

    await expect(sessionStore.hasRefreshToken(11, "customer-session-a")).resolves.toBe(false);
    await expect(sessionStore.hasRefreshToken(11, "customer-session-b")).resolves.toBe(false);
    await expect(sessionStore.hasRefreshToken(12, "other-user-session")).resolves.toBe(true);
  });

  it("reads and updates only the authenticated customer profile", async () => {
    const fixture = await createFixture();

    try {
      const token = await fixture.login("customer@example.com");
      await request(fixture.app)
        .get("/api/v1/customer-profile/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
        .expect(({ body }) => expect(body.data).toMatchObject({ id: 41, displayName: "田中 彩" }));
      await request(fixture.app)
        .patch("/api/v1/customer-profile/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ displayName: "松尾 雄大", visibility: "network" })
        .expect(200)
        .expect(({ body }) =>
          expect(body.data).toMatchObject({ displayName: "松尾 雄大", visibility: "network" })
        );

      expect(fixture.customerProfileRepository.updateMine).toHaveBeenCalledWith(
        11,
        41,
        expect.objectContaining({
          displayName: "松尾 雄大",
          visibility: "network",
          isPublic: false
        }),
        expect.objectContaining({
          action: "customer_profile.self_update",
          metadata: { changedFields: ["displayName", "visibility"] }
        })
      );
    } finally {
      await rm(fixture.avatarDirectory, { recursive: true, force: true });
    }
  });

  it("rejects missing auth, missing permission, wrong identity, and invalid bodies", async () => {
    const fixture = await createFixture();

    try {
      const customerToken = await fixture.login("customer@example.com");
      const technicianToken = await fixture.login("technician@example.com");
      const wrongIdentityToken = await fixture.login("wrong-identity@example.com");

      await request(fixture.app)
        .patch("/api/v1/customer-profile/me")
        .send({ displayName: "x" })
        .expect(401);
      await request(fixture.app)
        .patch("/api/v1/customer-profile/me")
        .set("Authorization", `Bearer ${technicianToken}`)
        .send({ displayName: "x" })
        .expect(403);
      await request(fixture.app)
        .patch("/api/v1/customer-profile/me")
        .set("Authorization", `Bearer ${wrongIdentityToken}`)
        .send({ displayName: "x" })
        .expect(403);
      await request(fixture.app)
        .patch("/api/v1/customer-profile/me")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ age: 999 })
        .expect(400);
    } finally {
      await rm(fixture.avatarDirectory, { recursive: true, force: true });
    }
  });

  it("serves only hashed avatar bytes with immutable caching", async () => {
    const fixture = await createFixture();

    try {
      await request(fixture.app)
        .get(`/media/customer-avatars/${avatarHash}.png`)
        .expect("Cache-Control", /public, max-age=31536000, immutable/)
        .expect("Cross-Origin-Resource-Policy", "cross-origin")
        .expect("Content-Type", /image\/png/)
        .expect(200);
      await request(fixture.app).get("/media/customer-avatars/not-an-avatar.png").expect(404);
      await request(fixture.app).get("/media/customer-avatars/").expect(404);
      await request(fixture.app)
        .get(`/media/customer-avatars/${avatarHash}.png/not-an-avatar`)
        .expect(404);
      await request(fixture.app).get(`/media/customer-avatars/${avatarHash}.png.json`).expect(404);
    } finally {
      await rm(fixture.avatarDirectory, { recursive: true, force: true });
    }
  });
});
