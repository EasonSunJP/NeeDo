import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  public readonly refreshTokens = new Set<string>();
  public readonly blacklistedAccessTokens = new Set<string>();
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
    const key = `login:fail:${ip}:${email}`;
    this.failureCounts.delete(key);
    this.values.delete(key);
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
    this.refreshTokens.add(`${userId}:${jti}`);
    this.setValue(`refresh:${userId}:${jti}`, "1", ttlSeconds);
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.getValue(`refresh:${userId}:${jti}`) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.refreshTokens.delete(`${userId}:${jti}`);
    this.values.delete(`refresh:${userId}:${jti}`);
  }

  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    this.blacklistedAccessTokens.add(jti);
    this.setValue(`token:blacklist:${jti}`, "1", ttlSeconds);
  }

  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.getValue(`token:blacklist:${jti}`) !== null;
  }

  private setValue(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  private getValue(key: string): string | null {
    const stored = this.values.get(key);
    if (!stored) {
      return null;
    }
    if (stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return stored.value;
  }
}

const createAuthFixture = async () => {
  const sessionStore = new InMemoryAuthSessionStore();
  const deliveredOtps: Array<{ email: string; otp: string }> = [];
  const loginLogs: unknown[] = [];
  const auditLogs: unknown[] = [];
  const passwordHash = await hash("Abcd@1234", 12);

  const passwordUser = {
    id: 1,
    email: "admin@example.com",
    phone: null,
    passwordHash,
    username: "NeeDo Admin",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null as Date | null,
    deletedAt: null,
    identities: [
      {
        id: 10,
        userId: 1,
        type: "platform",
        scopeType: "global",
        scopeId: null,
        displayName: "NeeDo Admin",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      {
        role: {
          code: "admin",
          deletedAt: null,
          rolePermissions: [
            "auth:me",
            "auth:refresh",
            "auth:logout",
            "menu:dashboard",
            "menu:user-management",
            "user:list"
          ].map((code) => ({
            deletedAt: null,
            permission: {
              code,
              type: code.startsWith("menu:") ? "menu" : "api",
              deletedAt: null
            }
          }))
        },
        deletedAt: null
      }
    ]
  };
  const customerUser = {
    ...passwordUser,
    id: 2,
    email: "customer@example.com",
    username: "NeeDo Customer",
    identities: [
      {
        id: 20,
        userId: 2,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: 2,
        displayName: "NeeDo Customer",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: ["customer"].map((roleCode) => ({
      role: {
        code: roleCode,
        deletedAt: null,
        rolePermissions: [
          "auth:me",
          "auth:refresh",
          "auth:logout",
          "menu:client-app",
          "menu:orders",
          "menu:messages",
          "menu:social",
          "booking:create",
          "order:list",
          "order:read"
        ].map((code) => ({
          deletedAt: null,
          permission: {
            code,
            type: code.startsWith("menu:") ? "menu" : "api",
            deletedAt: null
          }
        }))
      },
      deletedAt: null
    }))
  };
  const disabledUser = {
    ...passwordUser,
    id: 3,
    email: "disabled@example.com",
    username: "Disabled User",
    isActive: false
  };
  const noPermissionUser = {
    ...passwordUser,
    id: 4,
    email: "noperms@example.com",
    username: "No Permissions",
    identities: [
      {
        id: 40,
        userId: 4,
        type: "platform",
        scopeType: "global",
        scopeId: null,
        displayName: "No Permissions",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [
      {
        role: {
          code: "viewer",
          deletedAt: null,
          rolePermissions: []
        },
        deletedAt: null
      }
    ]
  };
  const users = [passwordUser, customerUser, disabledUser, noPermissionUser];

  const repository = {
    findUserByEmail: jest.fn(async (email: string) =>
      users.find((item) => item.email === email && !item.deletedAt) ?? null
    ),
    findUserById: jest.fn(async (id: number) =>
      users.find((item) => item.id === id && !item.deletedAt) ?? null
    ),
    updateLastLoginAt: jest.fn(async (id: number, loggedInAt: Date) => {
      const user = users.find((item) => item.id === id);
      if (user) {
        user.lastLoginAt = loggedInAt;
      }
    }),
    createLoginLog: jest.fn(async (entry: unknown) => {
      loginLogs.push(entry);
    }),
    createAuditLog: jest.fn(async (entry: unknown) => {
      auditLogs.push(entry);
    })
  };

  const otpDeliveryClient = {
    sendOtp: jest.fn(async (email: string, otp: string) => {
      deliveredOtps.push({ email, otp });
    })
  };

  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: repository,
    authSessionStore: sessionStore,
    otpDeliveryClient
  } as never);

  return {
    app,
    repository,
    sessionStore,
    deliveredOtps,
    loginLogs,
    auditLogs,
    user: passwordUser,
    customerUser,
    disabledUser,
    noPermissionUser
  };
};

describe("Step 05 Auth / OTP / Token / Session", () => {
  it("does not expose a passwordless test-login endpoint", async () => {
    const fixture = await createAuthFixture();

    await request(fixture.app)
      .post("/api/v1/auth/test-login")
      .send({ portal: "admin" })
      .expect(404);

    expect(fixture.sessionStore.refreshTokens.size).toBe(0);
  });

  it("logs in admin@example.com with email and password", async () => {
    const fixture = await createAuthFixture();

    const response = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "Abcd@1234" })
      .expect(200);

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${response.body.data.accessToken}`)
      .expect(200)
      .expect((meResponse) => {
        expect(meResponse.body.data.email).toBe("admin@example.com");
        expect(meResponse.body.data.roles).toEqual(["admin"]);
        expect(meResponse.body.data.permissions).toEqual(expect.arrayContaining(["auth:me", "user:list"]));
      });
  });

  it("supports the deployed /login URI under the API base path", async () => {
    const fixture = await createAuthFixture();

    const response = await request(fixture.app)
      .post("/api/v1/login")
      .send({ email: "admin@example.com", password: "Abcd@1234" })
      .expect(200);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
  });

  it("accepts the Apifox password-login form shape on the deployed /login URI", async () => {
    const fixture = await createAuthFixture();

    const response = await request(fixture.app)
      .post("/api/v1/login")
      .type("form")
      .send({
        username: "admin@example.com",
        password: "Abcd@1234",
        type: "username"
      })
      .expect(200);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(fixture.repository.findUserByEmail).toHaveBeenCalledWith("admin@example.com");
  });

  it("logs in customer@example.com with email and password", async () => {
    const fixture = await createAuthFixture();

    const response = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "customer@example.com", password: "Abcd@1234" })
      .expect(200);

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${response.body.data.accessToken}`)
      .expect(200)
      .expect((meResponse) => {
        expect(meResponse.body.data.email).toBe("customer@example.com");
        expect(meResponse.body.data.roles).toEqual(["customer"]);
        expect(meResponse.body.data.permissions).toEqual(expect.arrayContaining(["menu:client-app", "order:list"]));
      });
  });

  it("logs in with email and password, stores the refresh token, and hides sensitive fields", async () => {
    const fixture = await createAuthFixture();

    const response = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "Abcd@1234" })
      .expect(200);

    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: {
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: 900
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(fixture.sessionStore.refreshTokens.size).toBe(1);
    expect(fixture.repository.updateLastLoginAt).toHaveBeenCalledWith(1, expect.any(Date));
    expect(fixture.loginLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 1,
          email: "admin@example.com",
          status: "success"
        })
      ])
    );
  });

  it("uses one invalid-credentials response and locks repeated failed login attempts", async () => {
    const fixture = await createAuthFixture();

    for (let index = 0; index < 4; index += 1) {
      const response = await request(fixture.app)
        .post("/api/v1/auth/login")
        .send({ email: "admin@example.com", password: "wrong-password" })
        .expect(401);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: "error.auth.invalid_credentials"
      });
    }

    const lockedResponse = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "wrong-password" })
      .expect(429);

    expect(lockedResponse.body).toMatchObject({
      code: ERROR_CODES.ACCOUNT_LOCKED,
      message: "error.auth.account_locked"
    });

    await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "Abcd@1234" })
      .expect(429);

    expect(fixture.loginLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "failed", failReason: "invalid_credentials" }),
        expect.objectContaining({ status: "locked", failReason: "too_many_attempts" })
      ])
    );
  });

  it("rejects disabled users before issuing tokens", async () => {
    const fixture = await createAuthFixture();

    await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "disabled@example.com", password: "Abcd@1234" })
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.ACCOUNT_DISABLED);
        expect(response.body.message).toBe("error.auth.account_disabled");
      });

    expect(fixture.sessionStore.refreshTokens.size).toBe(0);
    expect(fixture.loginLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "disabled@example.com",
          failReason: "account_disabled",
          status: "failed"
        })
      ])
    );
  });

  it("sends, verifies, and invalidates a six-digit email OTP", async () => {
    const fixture = await createAuthFixture();

    const sendResponse = await request(fixture.app)
      .post("/api/v1/auth/otp/send")
      .send({ email: "admin@example.com" })
      .expect(200);

    expect(sendResponse.body).toEqual({
      code: 0,
      message: "success",
      data: {
        expiresIn: 600,
        cooldownSeconds: 60
      }
    });
    expect(fixture.deliveredOtps).toHaveLength(1);
    expect(fixture.deliveredOtps[0]).toEqual({
      email: "admin@example.com",
      otp: expect.stringMatching(/^\d{6}$/)
    });

    await request(fixture.app)
      .post("/api/v1/auth/otp/send")
      .send({ email: "admin@example.com" })
      .expect(429)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.OTP_COOLDOWN);
      });

    const verifyResponse = await request(fixture.app)
      .post("/api/v1/auth/otp/verify")
      .send({ email: "admin@example.com", otp: fixture.deliveredOtps[0].otp })
      .expect(200);

    expect(verifyResponse.body.data).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: 900
    });

    await request(fixture.app)
      .post("/api/v1/auth/otp/verify")
      .send({ email: "admin@example.com", otp: fixture.deliveredOtps[0].otp })
      .expect(401)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.OTP_EXPIRED);
      });
  });

  it("refreshes access tokens from Redis-backed refresh sessions", async () => {
    const fixture = await createAuthFixture();
    const loginResponse = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "Abcd@1234" })
      .expect(200);

    const response = await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: loginResponse.body.data.refreshToken })
      .expect(200);

    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: {
        accessToken: expect.any(String),
        expiresIn: 900
      }
    });
    expect(response.body.data.accessToken).not.toBe(loginResponse.body.data.accessToken);
  });

  it("returns /auth/me permissions and rejects a blacklisted access token after logout", async () => {
    const fixture = await createAuthFixture();
    const loginResponse = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "Abcd@1234" })
      .expect(200);
    const { accessToken, refreshToken } = loginResponse.body.data;

    const meResponse = await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body.data).toMatchObject({
      id: 1,
      email: "admin@example.com",
      username: "NeeDo Admin",
      isActive: true,
      currentIdentity: {
        id: 10,
        type: "platform",
        scopeType: "global",
        scopeId: null
      },
      roles: ["admin"],
      permissions: expect.arrayContaining(["auth:me", "auth:logout", "user:list"]),
      menus: expect.arrayContaining(["menu:dashboard", "menu:user-management"])
    });
    expect(JSON.stringify(meResponse.body)).not.toContain("passwordHash");

    await request(fixture.app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    expect(fixture.sessionStore.refreshTokens.size).toBe(0);
    expect(fixture.sessionStore.blacklistedAccessTokens.size).toBe(1);
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "auth.logout",
          targetType: "User",
          targetId: 1
        })
      ])
    );

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.TOKEN_BLACKLISTED);
      });
  });

  it("does not allow a user with empty permissions through protected endpoints", async () => {
    const fixture = await createAuthFixture();
    const loginResponse = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "noperms@example.com", password: "Abcd@1234" })
      .expect(200);

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.data.accessToken}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
      });
  });
});
