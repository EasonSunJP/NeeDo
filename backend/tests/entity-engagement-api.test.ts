import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import type { EntityEngagementRepositoryPort } from "../src/repositories/entity-engagement.repository";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();
  private readonly failureCounts = new Map<string, number>();

  public async getLoginLock(email: string): Promise<boolean> {
    return this.getValue(`login:lock:${email}`) !== null;
  }

  public async recordFailedLogin(
    ip: string,
    email: string,
    options: { failureLimit: number; windowSeconds: number; lockSeconds: number }
  ): Promise<{ count: number; locked: boolean }> {
    const key = `login:fail:${ip}:${email}`;
    const nextCount = (this.failureCounts.get(key) ?? 0) + 1;
    this.failureCounts.set(key, nextCount);
    this.setValue(key, String(nextCount), options.windowSeconds);
    if (nextCount >= options.failureLimit) {
      this.setValue(`login:lock:${email}`, "1", options.lockSeconds);
      return { count: nextCount, locked: true };
    }
    return { count: nextCount, locked: false };
  }

  public async clearFailedLogin(ip: string, email: string): Promise<void> {
    this.failureCounts.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:lock:${email}`);
  }

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

const now = new Date("2026-09-01T00:00:00.000Z");
const makePermission = (code: string, index: number) => ({
  id: index + 1,
  name: code,
  code,
  type: "api",
  module: "entity-engagement",
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const favoritePermissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "entity-favorite:read",
    "entity-favorite:write"
  ].map(makePermission);
  const readOnlyPermissions = ["auth:me", "auth:refresh", "auth:logout"].map((code, index) =>
    makePermission(code, 100 + index)
  );
  const makeRole = (id: number, code: string, permissions: typeof favoritePermissions) => ({
    id,
    name: code,
    code,
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions.map((permission, index) => ({
      id: id * 100 + index,
      roleId: id,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  });
  const users = [
    {
      id: 42,
      email: "favorite@example.com",
      phone: null,
      passwordHash,
      username: "Favorite Owner",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 10,
          userId: 42,
          type: "customer",
          scopeType: "user",
          scopeId: 42,
          displayName: "Favorite Owner",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: makeRole(2, "customer", favoritePermissions) }]
    },
    {
      id: 43,
      email: "viewer@example.com",
      phone: null,
      passwordHash,
      username: "Viewer",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 11,
          userId: 43,
          type: "viewer",
          scopeType: "global",
          scopeId: null,
          displayName: "Viewer",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: makeRole(3, "viewer", readOnlyPermissions) }]
    }
  ];
  const authRepository = {
    findUserByEmail: jest.fn(
      async (email: string) =>
        users.find((user) => user.email === email && user.deletedAt === null) ?? null
    ),
    findUserByLoginIdentifier: jest.fn(
      async (identifier: string) =>
        users.find(
          (user) =>
            (user.email === identifier || user.username === identifier) && user.deletedAt === null
        ) ?? null
    ),
    findUserById: jest.fn(
      async (id: number) => users.find((user) => user.id === id && user.deletedAt === null) ?? null
    ),
    updateLastLoginAt: jest.fn(async () => undefined),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async () => undefined)
  };
  const entityEngagementRepository: jest.Mocked<EntityEngagementRepositoryPort> = {
    setFavorite: jest.fn(async (_userId, target, isFavorited) => ({
      ...target,
      isFavorited,
      favoriteCount: isFavorited ? 2 : 1
    })),
    getFavoriteStatuses: jest.fn(async (_userId, targets) =>
      targets.map((target) => ({ ...target, isFavorited: true, favoriteCount: 2 }))
    ),
    listFavorites: jest.fn(async (input) => ({
      list: [
        {
          targetType: "shop" as const,
          publicId: "shop0000000001",
          isFavorited: true,
          favoriteCount: 2,
          favoritedAt: now
        }
      ],
      total: 1,
      page: input.page,
      page_size: input.pageSize
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    entityEngagementRepository
  } as never);
  const login = async (email: string): Promise<string> => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };

  return { app, login, entityEngagementRepository };
};

describe("entity favorites API", () => {
  it("registers and seeds favorite permissions for every authenticated system role", () => {
    expect(SYSTEM_PERMISSION_CODES).toEqual(
      expect.arrayContaining(["entity-favorite:read", "entity-favorite:write"])
    );
    const assignments = buildRolePermissionAssignments();
    Object.values(assignments).forEach((permissionCodes) => {
      expect(permissionCodes).toEqual(
        expect.arrayContaining(["entity-favorite:read", "entity-favorite:write"])
      );
    });
  });

  it("supports idempotent writes, paginated listing, and batched card states", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("favorite@example.com");

    const putResponse = await request(fixture.app)
      .put("/api/v1/me/entity-favorites/shop/shop0000000001")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(putResponse.body.data).toEqual({
      targetType: "shop",
      publicId: "shop0000000001",
      isFavorited: true,
      favoriteCount: 2
    });

    await request(fixture.app)
      .delete("/api/v1/me/entity-favorites/shop/shop0000000001")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const listResponse = await request(fixture.app)
      .get("/api/v1/me/entity-favorites?page=2&pageSize=5&targetType=shop")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(listResponse.body.data).toMatchObject({ total: 1, page: 2, page_size: 5 });

    const statusResponse = await request(fixture.app)
      .post("/api/v1/me/entity-favorites/statuses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        targets: [
          { targetType: "shop", publicId: "shop0000000001" },
          { targetType: "technician", publicId: "s0000000001" }
        ]
      })
      .expect(200);
    expect(statusResponse.body.data.list).toHaveLength(2);
    expect(fixture.entityEngagementRepository.setFavorite).toHaveBeenNthCalledWith(
      1,
      42,
      { targetType: "shop", publicId: "shop0000000001" },
      true
    );
    expect(fixture.entityEngagementRepository.listFavorites).toHaveBeenCalledWith({
      userId: 42,
      page: 2,
      pageSize: 5,
      targetType: "shop"
    });
  });

  it("enforces authentication, permissions, public-id shape, and the 100-target batch limit", async () => {
    const fixture = await createFixture();
    await request(fixture.app).get("/api/v1/me/entity-favorites").expect(401);

    const viewerToken = await fixture.login("viewer@example.com");
    await request(fixture.app)
      .put("/api/v1/me/entity-favorites/shop/shop0000000001")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(403);

    const token = await fixture.login("favorite@example.com");
    await request(fixture.app)
      .put("/api/v1/me/entity-favorites/shop/not-a-public-id")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/me/entity-favorites/statuses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        targets: Array.from({ length: 101 }, () => ({
          targetType: "shop",
          publicId: "shop0000000001"
        }))
      })
      .expect(400);
  });
});
