import { compare, hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
import { NeedoIdAllocationExhaustedError } from "../src/services/needo-id.service";
import { AppError } from "../src/utils/app-error";
import type {
  ConsumeVerificationChallengeInput,
  CreateVerificationChallengeInput,
  VerificationPurpose
} from "../src/services/auth-verification-challenge.store";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  public async getSessionGeneration() {
    return 0;
  }
  public readonly refreshTokens = new Set<string>();
  public readonly blacklistedAccessTokens = new Set<string>();
  private readonly values = new Map<string, StoredValue>();
  private readonly failureCounts = new Map<string, number>();
  private readonly accountFailureCounts = new Map<number, number>();
  public failNextRefreshStore = false;
  public failNextRefreshRevoke = false;
  public readonly storedRefreshTokens: Array<{ userId: number; jti: string }> = [];
  public readonly revokedRefreshTokens: Array<{ userId: number; jti: string }> = [];

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

  public async getAccountLoginLock(userId: number): Promise<boolean> {
    return this.getValue(`login:account:lock:${userId}`) !== null;
  }

  public async recordFailedLoginForAccount(
    userId: number,
    options: { failureLimit: number; windowSeconds: number; lockSeconds: number }
  ): Promise<{ count: number; locked: boolean }> {
    const nextCount = (this.accountFailureCounts.get(userId) ?? 0) + 1;
    this.accountFailureCounts.set(userId, nextCount);
    this.setValue(`login:account:fail:${userId}`, String(nextCount), options.windowSeconds);
    if (nextCount >= options.failureLimit) {
      this.setValue(`login:account:lock:${userId}`, "1", options.lockSeconds);
      return { count: nextCount, locked: true };
    }
    return { count: nextCount, locked: false };
  }

  public async clearFailedLoginForAccount(userId: number): Promise<void> {
    this.accountFailureCounts.delete(userId);
    this.values.delete(`login:account:fail:${userId}`);
    this.values.delete(`login:account:lock:${userId}`);
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
    if (this.failNextRefreshStore) {
      this.failNextRefreshStore = false;
      throw new Error("simulated session store failure");
    }
    this.storedRefreshTokens.push({ userId, jti });
    this.refreshTokens.add(`${userId}:${jti}`);
    this.setValue(`refresh:${userId}:${jti}`, "1", ttlSeconds);
  }

  public async rotateRefreshToken(input: {
    userId: number;
    oldJti: string;
    newJti: string;
    ttlSeconds: number;
  }): Promise<boolean> {
    if (!(await this.hasRefreshToken(input.userId, input.oldJti))) return false;
    await this.revokeRefreshToken(input.userId, input.oldJti);
    await this.storeRefreshToken(input.userId, input.newJti, input.ttlSeconds);
    return true;
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.getValue(`refresh:${userId}:${jti}`) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.revokedRefreshTokens.push({ userId, jti });
    if (this.failNextRefreshRevoke) {
      this.failNextRefreshRevoke = false;
      throw new Error("simulated refresh revoke failure");
    }
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

class InMemoryVerificationChallengeStore {
  private readonly challenges = new Map<
    string,
    CreateVerificationChallengeInput & {
      attempts: number;
      expired: boolean;
      reservationToken?: string;
    }
  >();
  public failNextFinalize = false;
  public returnFalseNextFinalize = false;
  public failNextRelease = false;
  public readonly releasedChallenges: Array<{ challengeId: string; reservationToken: string }> = [];

  public async createEmailChallenge(input: CreateVerificationChallengeInput) {
    const challengeId = randomUUID();
    this.challenges.set(challengeId, { ...input, attempts: 0, expired: false });
    return {
      challengeId,
      expiresInSeconds: 600,
      maskedEmail: `${input.email[0]}***@${input.email.split("@")[1]}`
    };
  }

  public async reserveEmailChallenge(input: ConsumeVerificationChallengeInput) {
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge || challenge.expired) return { ok: false as const, reason: "missing" as const };
    if (challenge.purpose !== input.purpose) {
      return { ok: false as const, reason: "purpose_mismatch" as const };
    }
    if ((challenge.userId ?? undefined) !== (input.userId ?? undefined)) {
      return { ok: false as const, reason: "user_mismatch" as const };
    }
    if (challenge.otp !== input.otp) {
      challenge.attempts += 1;
      if (challenge.attempts >= 5) {
        this.challenges.delete(input.challengeId);
        return { ok: false as const, reason: "attempts_exhausted" as const };
      }
      return { ok: false as const, reason: "invalid_otp" as const, attempts: challenge.attempts };
    }

    if (challenge.reservationToken) {
      return { ok: false as const, reason: "reserved" as const };
    }
    const reservationToken = randomUUID();
    challenge.reservationToken = reservationToken;
    return {
      ok: true as const,
      email: challenge.email,
      metadata: challenge.metadata ?? {},
      reservationToken
    };
  }

  public async finalizeEmailChallenge(input: { challengeId: string; reservationToken: string }) {
    if (this.failNextFinalize) {
      this.failNextFinalize = false;
      throw new Error("simulated finalize failure");
    }
    if (this.returnFalseNextFinalize) {
      this.returnFalseNextFinalize = false;
      return false;
    }
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge || challenge.reservationToken !== input.reservationToken) return false;
    this.challenges.delete(input.challengeId);
    return true;
  }

  public async releaseEmailChallenge(input: { challengeId: string; reservationToken: string }) {
    this.releasedChallenges.push(input);
    if (this.failNextRelease) {
      this.failNextRelease = false;
      throw new Error("simulated release failure");
    }
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge || challenge.reservationToken !== input.reservationToken) return false;
    delete challenge.reservationToken;
    return true;
  }

  public async cancelEmailChallenge(input: { challengeId: string }) {
    return this.challenges.delete(input.challengeId);
  }

  public async consumeEmailChallenge(input: ConsumeVerificationChallengeInput) {
    const reserved = await this.reserveEmailChallenge(input);
    if (!reserved.ok) return reserved;
    await this.finalizeEmailChallenge({
      challengeId: input.challengeId,
      reservationToken: reserved.reservationToken
    });
    return { ok: true as const, email: reserved.email, metadata: reserved.metadata };
  }

  public async createGoogleNonce() {
    return { challengeId: randomUUID(), nonce: "unused", expiresInSeconds: 600 };
  }

  public async consumeGoogleNonce(): Promise<boolean> {
    return false;
  }

  public expire(challengeId: string): void {
    const challenge = this.challenges.get(challengeId);
    if (challenge) challenge.expired = true;
  }

  public async createChallengeForTest(input: {
    email: string;
    otp: string;
    purpose: VerificationPurpose;
    metadata?: Record<string, unknown>;
  }) {
    return this.createEmailChallenge(input);
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
    needoId: "n0000000001",
    email: "admin@example.com",
    phone: null,
    passwordHash,
    username: "admin",
    avatarUrl: null,
    isActive: true,
    sessionGeneration: 0,
    accessState: { disabled: false, restricted: false },
    lastLoginAt: null as Date | null,
    deletedAt: null,
    identities: [
      {
        id: 10,
        userId: 1,
        type: "platform",
        scopeType: "global",
        scopeId: null,
        displayName: "admin",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    identityApplications: [],
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
    needoId: "n0000000002",
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
    identityApplications: [
      {
        id: 201,
        type: "technician",
        status: "draft",
        rejectionReason: null,
        version: 2,
        updatedAt: new Date("2026-08-26T01:00:00.000Z"),
        deletedAt: null
      },
      {
        id: 202,
        type: "merchant",
        status: "rejected",
        rejectionReason: "法人资料无法确认",
        version: 3,
        updatedAt: new Date("2026-08-26T02:00:00.000Z"),
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
    needoId: "n0000000003",
    email: "disabled@example.com",
    username: "Disabled User",
    isActive: false,
    accessState: { disabled: true, restricted: false }
  };
  const noPermissionUser = {
    ...passwordUser,
    id: 4,
    needoId: "n0000000004",
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
  const restrictedUser = {
    ...passwordUser,
    id: 6,
    needoId: "n0000000006",
    email: "restricted@example.com",
    username: "Restricted User",
    accessState: { disabled: false, restricted: true },
    identities: []
  };
  const googleOnlyUser = {
    ...customerUser,
    id: 7,
    needoId: "n0000000007",
    email: "google-only@example.com",
    username: "Google Only User",
    passwordHash: null
  };
  const multiPortalUser = {
    ...passwordUser,
    id: 5,
    needoId: "n0000000005",
    email: "multi@example.com",
    username: "Multi Portal User",
    identities: [
      {
        id: 50,
        userId: 5,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: 5,
        displayName: "Multi Customer",
        isDefault: true,
        isActive: true,
        deletedAt: null
      },
      {
        id: 51,
        userId: 5,
        type: "technician",
        scopeType: "technician_profile",
        scopeId: 3,
        displayName: "Multi Technician",
        isDefault: false,
        isActive: true,
        deletedAt: null
      }
    ],
    identityApplications: [
      {
        id: 203,
        type: "merchant",
        status: "submitted",
        rejectionReason: null,
        version: 4,
        updatedAt: new Date("2026-08-26T03:00:00.000Z"),
        deletedAt: null
      }
    ],
    userRoles: [
      {
        role: {
          code: "technician",
          deletedAt: null,
          rolePermissions: [
            "auth:me",
            "auth:logout",
            "menu:technician-app",
            "technician:services:list",
            "technician:services:write"
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
  const users = [
    passwordUser,
    customerUser,
    disabledUser,
    noPermissionUser,
    multiPortalUser,
    restrictedUser,
    googleOnlyUser
  ];
  const registrations: Array<Record<string, unknown>> = [];
  const registrationsByChallenge = new Map<string, (typeof users)[number]>();
  const challengeStore = new InMemoryVerificationChallengeStore();

  const repository = {
    findUserByEmail: jest.fn(
      async (email: string) => users.find((item) => item.email === email && !item.deletedAt) ?? null
    ),
    findUserByLoginIdentifier: jest.fn(
      async (identifier: string) =>
        users.find(
          (item) => (item.email === identifier || item.needoId === identifier) && !item.deletedAt
        ) ?? null
    ),
    findUserById: jest.fn(
      async (id: number) => users.find((item) => item.id === id && !item.deletedAt) ?? null
    ),
    findVerifiedRegistrationByChallenge: jest.fn(async (challengeId: string, email: string) => {
      const registered = registrationsByChallenge.get(challengeId);
      return registered?.email === email ? registered : null;
    }),
    registerUser: jest.fn(async (input: Record<string, unknown>) => {
      registrations.push(input);
      const accountType = input.accountType as "customer" | "technician";

      return {
        id: 100 + registrations.length,
        email: input.email as string,
        username: input.username as string,
        accountType,
        approvalStatus: accountType === "technician" ? "pending_review" : "approved",
        isActive: accountType === "customer"
      };
    }),
    createVerifiedBaselineCustomer: jest.fn(async (input: Record<string, unknown>) => {
      const id = 100 + registrations.length + 1;
      const needoId = `n${String(id).padStart(10, "0")}`;
      const createdUser = {
        ...customerUser,
        id,
        needoId,
        email: input.email as string,
        emailVerifiedAt: input.emailVerifiedAt as Date,
        passwordHash: input.passwordHash as string,
        username: needoId,
        identities: customerUser.identities.map((identity) => ({
          ...identity,
          id: id * 10,
          userId: id,
          scopeId: id,
          displayName: needoId
        }))
      };
      users.push(createdUser);
      registrations.push(input);
      registrationsByChallenge.set(input.registrationChallengeId as string, createdUser);
      return createdUser;
    }),
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
    otpDeliveryClient,
    verificationChallengeStore: challengeStore
  } as never);

  return {
    app,
    repository,
    sessionStore,
    deliveredOtps,
    loginLogs,
    auditLogs,
    registrations,
    challengeStore,
    otpDeliveryClient,
    user: passwordUser,
    customerUser,
    disabledUser,
    noPermissionUser,
    multiPortalUser
  };
};

describe("verified email registration and formal password authentication", () => {
  it("starts a verified email registration without creating a user", async () => {
    const fixture = await createAuthFixture();

    const response = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "New.Customer@Example.com",
      password: "Customer.2026!"
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: {
        challengeId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        maskedEmail: expect.any(String),
        expiresIn: 600,
        cooldownSeconds: 60
      }
    });
    expect(fixture.repository.createVerifiedBaselineCustomer).not.toHaveBeenCalled();
    expect(fixture.registrations).toHaveLength(0);
    expect(fixture.deliveredOtps).toEqual([
      { email: "new.customer@example.com", otp: expect.stringMatching(/^\d{6}$/) }
    ]);
  });

  it("creates exactly one verified baseline customer and tokens after the correct code", async () => {
    const fixture = await createAuthFixture();
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "verified.customer@example.com",
      password: "Customer.2026!"
    });

    const response = await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
      .expect(200);

    expect(response.body.data).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: 900,
      needoId: "n0000000101"
    });
    expect(fixture.repository.createVerifiedBaselineCustomer).toHaveBeenCalledTimes(1);
    const creation = fixture.repository.createVerifiedBaselineCustomer.mock.calls[0][0] as {
      email: string;
      passwordHash: string;
      emailVerifiedAt: Date;
    };
    expect(creation).toMatchObject({
      email: "verified.customer@example.com",
      passwordHash: expect.any(String)
    });
    expect(creation.passwordHash).not.toBe("Customer.2026!");
    await expect(compare("Customer.2026!", creation.passwordHash)).resolves.toBe(true);
    expect(creation).toHaveProperty("emailVerifiedAt");

    await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
      .expect(401)
      .expect((replay) => {
        expect(replay.body.message).toBe("error.auth.verification_challenge_expired");
      });
    expect(fixture.repository.createVerifiedBaselineCustomer).toHaveBeenCalledTimes(1);
  });

  it("allows only one concurrent successful verification to create an account", async () => {
    const fixture = await createAuthFixture();
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "concurrent.customer@example.com",
      password: "Customer.2026!"
    });
    const input = { challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp };

    const responses = await Promise.all([
      request(fixture.app).post("/api/v1/auth/register/verify").send(input),
      request(fixture.app).post("/api/v1/auth/register/verify").send(input)
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(fixture.repository.createVerifiedBaselineCustomer).toHaveBeenCalledTimes(1);
  });

  it("releases a valid registration reservation when the database transaction fails so retry can create", async () => {
    const fixture = await createAuthFixture();
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "transaction-retry@example.com",
      password: "Customer.2026!"
    });
    fixture.repository.createVerifiedBaselineCustomer.mockRejectedValueOnce(
      new Error("simulated database transaction failure")
    );
    const input = { challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp };

    await request(fixture.app).post("/api/v1/auth/register/verify").send(input).expect(500);
    await request(fixture.app).post("/api/v1/auth/register/verify").send(input).expect(200);
    expect(fixture.repository.createVerifiedBaselineCustomer).toHaveBeenCalledTimes(2);
  });

  it("recovers a committed registration after session persistence fails without creating a second user", async () => {
    const fixture = await createAuthFixture();
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "session-recovery@example.com",
      password: "Customer.2026!"
    });
    fixture.sessionStore.failNextRefreshStore = true;
    const input = { challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp };

    await request(fixture.app).post("/api/v1/auth/register/verify").send(input).expect(500);
    await request(fixture.app).post("/api/v1/auth/register/verify").send(input).expect(200);
    expect(fixture.repository.createVerifiedBaselineCustomer).toHaveBeenCalledTimes(1);
    expect(fixture.repository.findVerifiedRegistrationByChallenge).toHaveBeenCalledWith(
      input.challengeId,
      "session-recovery@example.com"
    );
  });

  it.each(["updateLastLoginAt", "createLoginLog"] as const)(
    "revokes the exact stored refresh session when %s fails during registration login",
    async (failingOperation) => {
      const fixture = await createAuthFixture();
      fixture.repository[failingOperation].mockRejectedValueOnce(
        new Error(`simulated ${failingOperation} failure`)
      );
      const started = await request(fixture.app)
        .post("/api/v1/auth/register")
        .send({
          email: `${failingOperation}@example.com`,
          password: "Customer.2026!"
        });

      await request(fixture.app)
        .post("/api/v1/auth/register/verify")
        .send({ challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
        .expect(500);

      expect(fixture.sessionStore.refreshTokens.size).toBe(0);
      expect(fixture.sessionStore.revokedRefreshTokens).toEqual([
        fixture.sessionStore.storedRefreshTokens[0]
      ]);
      expect(fixture.challengeStore.releasedChallenges).toHaveLength(1);
    }
  );

  it("revokes the exact stored refresh session when registration finalization returns false", async () => {
    const fixture = await createAuthFixture();
    fixture.challengeStore.returnFalseNextFinalize = true;
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "finalize-false@example.com",
      password: "Customer.2026!"
    });

    await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
      .expect(503)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
          message: "error.dependency.redis_unavailable"
        });
      });

    expect(fixture.sessionStore.refreshTokens.size).toBe(0);
    expect(fixture.sessionStore.revokedRefreshTokens).toEqual([
      fixture.sessionStore.storedRefreshTokens[0]
    ]);
    expect(fixture.challengeStore.releasedChallenges).toHaveLength(1);
  });

  it("keeps the finalization dependency error when release also fails", async () => {
    const fixture = await createAuthFixture();
    fixture.challengeStore.returnFalseNextFinalize = true;
    fixture.challengeStore.failNextRelease = true;
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "finalize-release-failure@example.com",
      password: "Customer.2026!"
    });

    await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
      .expect(503)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
          message: "error.dependency.redis_unavailable"
        });
      });

    expect(fixture.sessionStore.refreshTokens.size).toBe(0);
    expect(fixture.challengeStore.releasedChallenges).toHaveLength(1);
  });

  it("keeps a thrown finalization AppError when release also fails", async () => {
    const fixture = await createAuthFixture();
    jest.spyOn(fixture.challengeStore, "finalizeEmailChallenge").mockRejectedValueOnce(
      new AppError({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        message: "error.dependency.redis_unavailable",
        statusCode: 503
      })
    );
    fixture.challengeStore.failNextRelease = true;
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "finalize-throw-release-failure@example.com",
      password: "Customer.2026!"
    });

    await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
      .expect(503)
      .expect((response) => {
        expect(response.body.message).toBe("error.dependency.redis_unavailable");
      });

    expect(fixture.sessionStore.refreshTokens.size).toBe(0);
  });

  it("does not let a refresh revoke failure obscure the original finalization error", async () => {
    const fixture = await createAuthFixture();
    fixture.challengeStore.returnFalseNextFinalize = true;
    fixture.sessionStore.failNextRefreshRevoke = true;
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "revoke-failure@example.com",
      password: "Customer.2026!"
    });

    await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
      .expect(503)
      .expect((response) => {
        expect(response.body.message).toBe("error.dependency.redis_unavailable");
      });

    expect(fixture.sessionStore.revokedRefreshTokens).toEqual([
      fixture.sessionStore.storedRefreshTokens[0]
    ]);
    expect(fixture.sessionStore.refreshTokens.size).toBe(1);
    expect(fixture.challengeStore.releasedChallenges).toHaveLength(1);
  });

  it.each([
    {
      name: "Needo ID allocation error",
      originalError: new NeedoIdAllocationExhaustedError(),
      expectedStatus: 503,
      expectedCode: ERROR_CODES.NEEDO_ID_ALLOCATION_UNAVAILABLE,
      expectedMessage: "error.auth.needo_id_allocation_unavailable"
    },
    {
      name: "unique-email P2002 error",
      originalError: { code: "P2002" },
      expectedStatus: 409,
      expectedCode: ERROR_CODES.EMAIL_ALREADY_EXISTS,
      expectedMessage: "error.user.email_exists"
    },
    {
      name: "AppError",
      originalError: new AppError({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        message: "error.dependency.redis_unavailable",
        statusCode: 503
      }),
      expectedStatus: 503,
      expectedCode: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      expectedMessage: "error.dependency.redis_unavailable"
    },
    {
      name: "ordinary error",
      originalError: new Error("simulated ordinary registration failure"),
      expectedStatus: 500,
      expectedCode: ERROR_CODES.INTERNAL,
      expectedMessage: "error.internal_server_error"
    }
  ])(
    "preserves the original $name mapping when challenge release fails",
    async ({ originalError, expectedStatus, expectedCode, expectedMessage }) => {
      const fixture = await createAuthFixture();
      fixture.repository.createVerifiedBaselineCustomer.mockRejectedValueOnce(originalError);
      fixture.challengeStore.failNextRelease = true;
      const started = await request(fixture.app)
        .post("/api/v1/auth/register")
        .send({
          email: `release-${expectedStatus}@example.com`,
          password: "Customer.2026!"
        });

      await request(fixture.app)
        .post("/api/v1/auth/register/verify")
        .send({ challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
        .expect(expectedStatus)
        .expect((response) => {
          expect(response.body).toMatchObject({ code: expectedCode, message: expectedMessage });
        });

      expect(fixture.challengeStore.releasedChallenges).toHaveLength(1);
    }
  );

  it("recovers the same registration after a unique-email race when its audit evidence committed", async () => {
    const fixture = await createAuthFixture();
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "unique-race@example.com",
      password: "Customer.2026!"
    });
    const input = { challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp };
    const originalCreate =
      fixture.repository.createVerifiedBaselineCustomer.getMockImplementation();
    fixture.repository.createVerifiedBaselineCustomer.mockImplementationOnce(
      async (creation: Record<string, unknown>) => {
        await originalCreate!(creation);
        throw { code: "P2002" };
      }
    );

    await request(fixture.app).post("/api/v1/auth/register/verify").send(input).expect(200);
    expect(fixture.repository.createVerifiedBaselineCustomer).toHaveBeenCalledTimes(1);
  });

  it("cancels only its registration challenge and cooldown when OTP delivery fails", async () => {
    const fixture = await createAuthFixture();
    fixture.otpDeliveryClient.sendOtp.mockRejectedValueOnce(new Error("provider timeout"));
    const registration = { email: "delivery-retry@example.com", password: "Customer.2026!" };

    await request(fixture.app).post("/api/v1/auth/register").send(registration).expect(500);
    await request(fixture.app).post("/api/v1/auth/register").send(registration).expect(200);
    expect(fixture.deliveredOtps).toHaveLength(1);
  });

  it("rejects expired, wrong-purpose, and exhausted registration challenges", async () => {
    const fixture = await createAuthFixture();
    const expired = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "expired.customer@example.com",
      password: "Customer.2026!"
    });
    fixture.challengeStore.expire(expired.body.data.challengeId);

    await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: expired.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toBe("error.auth.verification_challenge_expired");
      });

    const wrongPurpose = await fixture.challengeStore.createChallengeForTest({
      email: "wrong-purpose@example.com",
      otp: "123456",
      purpose: "google_unlink"
    });
    await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: wrongPurpose.challengeId, otp: "123456" })
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toBe("error.auth.verification_challenge_expired");
      });

    const exhausted = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "exhausted.customer@example.com",
      password: "Customer.2026!"
    });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await request(fixture.app)
        .post("/api/v1/auth/register/verify")
        .send({ challengeId: exhausted.body.data.challengeId, otp: "000000" })
        .expect(401)
        .expect((response) => {
          expect(response.body.message).toBe("error.auth.verification_code_invalid");
        });
    }
    await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: exhausted.body.data.challengeId, otp: "000000" })
      .expect(429)
      .expect((response) => {
        expect(response.body.message).toBe("error.auth.verification_attempts_exhausted");
      });

    expect(fixture.repository.createVerifiedBaselineCustomer).not.toHaveBeenCalled();
  });

  it("maps exhausted NeeDo ID allocation to a stable verified-registration error", async () => {
    const fixture = await createAuthFixture();
    fixture.repository.createVerifiedBaselineCustomer.mockRejectedValueOnce(
      new NeedoIdAllocationExhaustedError()
    );
    const started = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "allocation-failure@example.com",
      password: "Abcd@1234"
    });

    await request(fixture.app)
      .post("/api/v1/auth/register/verify")
      .send({ challengeId: started.body.data.challengeId, otp: fixture.deliveredOtps[0].otp })
      .expect(503)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.NEEDO_ID_ALLOCATION_UNAVAILABLE,
          message: "error.auth.needo_id_allocation_unavailable"
        });
      });
  });

  it("rejects duplicate email, weak passwords, and public technician registration fields", async () => {
    const fixture = await createAuthFixture();
    const duplicate = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "customer@example.com",
      password: "Customer.2026!"
    });
    const weakPassword = await request(fixture.app).post("/api/v1/auth/register").send({
      email: "weak@example.com",
      password: "password"
    });
    const technicianFields = await request(fixture.app).post("/api/v1/auth/register").send({
      accountType: "technician",
      city: "Tokyo",
      email: "technician.application@example.com",
      password: "Technician.2026!"
    });

    expect(duplicate.body).toEqual({
      code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
      message: "error.user.email_exists",
      data: null
    });
    expect(weakPassword.body.code).toBe(ERROR_CODES.VALIDATION);
    expect(technicianFields.body.code).toBe(ERROR_CODES.VALIDATION);
    expect(fixture.repository.createVerifiedBaselineCustomer).not.toHaveBeenCalled();
  });

  it("does not expose a passwordless test-login endpoint", async () => {
    const fixture = await createAuthFixture();

    await request(fixture.app)
      .post("/api/v1/auth/test-login")
      .send({ portal: "admin" })
      .expect(404);

    expect(fixture.sessionStore.refreshTokens.size).toBe(0);
  });

  it("logs in with a normalized email loginIdentifier and password", async () => {
    const fixture = await createAuthFixture();

    const response = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: " ADMIN@EXAMPLE.COM ", password: "Abcd@1234" })
      .expect(200);

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${response.body.data.accessToken}`)
      .expect(200)
      .expect((meResponse) => {
        expect(meResponse.body.data.email).toBe("admin@example.com");
        expect(meResponse.body.data.roles).toEqual(["admin"]);
        expect(meResponse.body.data.permissions).toEqual(
          expect.arrayContaining(["auth:me", "user:list"])
        );
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

  it("logs in with the issued immutable NeeDo ID and password", async () => {
    const fixture = await createAuthFixture();

    const response = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: "N0000000001", password: "Abcd@1234" })
      .expect(200);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(fixture.repository.findUserByLoginIdentifier).toHaveBeenCalledWith("n0000000001");
  });

  it("rejects a mutable nickname with the generic invalid-credentials response", async () => {
    const fixture = await createAuthFixture();

    await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: "admin", password: "Abcd@1234" })
      .expect(401)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.INVALID_CREDENTIALS,
          message: "error.auth.invalid_credentials"
        });
      });
  });

  it("uses one public invalid-credentials response for nickname, unknown, Google-only, and bad password", async () => {
    const fixture = await createAuthFixture();
    const requests = [
      { loginIdentifier: "NeeDo Customer", password: "Abcd@1234" },
      { loginIdentifier: "unknown@example.com", password: "Abcd@1234" },
      { loginIdentifier: "google-only@example.com", password: "Abcd@1234" },
      { loginIdentifier: "admin@example.com", password: "wrong-password" }
    ];

    const responses = await Promise.all(
      requests.map((body) => request(fixture.app).post("/api/v1/auth/login").send(body))
    );

    responses.forEach((response) => {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: "error.auth.invalid_credentials",
        data: null
      });
    });
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
    expect(fixture.repository.findUserByLoginIdentifier).toHaveBeenCalledWith("admin@example.com");
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
        expect(meResponse.body.data.permissions).toEqual(
          expect.arrayContaining(["menu:client-app", "order:list"])
        );
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

  it("shares failed-login state across email and immutable NeeDo ID, then clears it on success", async () => {
    const fixture = await createAuthFixture();
    for (let index = 0; index < 4; index += 1) {
      await request(fixture.app)
        .post("/api/v1/auth/login")
        .send({ loginIdentifier: "admin@example.com", password: "wrong-password" })
        .expect(401);
    }

    await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: "n0000000001", password: "Abcd@1234" })
      .expect(200);

    for (let index = 0; index < 4; index += 1) {
      await request(fixture.app)
        .post("/api/v1/auth/login")
        .send({ loginIdentifier: "n0000000001", password: "wrong-password" })
        .expect(401);
    }
    expect(await fixture.sessionStore.getAccountLoginLock(1)).toBe(false);
  });

  it("locks a found account across NeeDo ID and email while unknown identifiers retain generic input-scoped failures", async () => {
    const fixture = await createAuthFixture();
    for (let index = 0; index < 5; index += 1) {
      await request(fixture.app)
        .post("/api/v1/auth/login")
        .send({ loginIdentifier: "n0000000001", password: "wrong-password" })
        .expect(index === 4 ? 429 : 401);
    }

    await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: "admin@example.com", password: "Abcd@1234" })
      .expect(429);
    await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: "not-an-account@example.com", password: "wrong-password" })
      .expect(401)
      .expect((response) => {
        expect(response.body).toEqual({
          code: ERROR_CODES.INVALID_CREDENTIALS,
          message: "error.auth.invalid_credentials",
          data: null
        });
      });
  });

  it("keeps unknown identifiers on the existing IP-plus-normalized-input limiter without affecting an account", async () => {
    const fixture = await createAuthFixture();
    for (let index = 0; index < 5; index += 1) {
      await request(fixture.app)
        .post("/api/v1/auth/login")
        .send({ loginIdentifier: "missing@example.com", password: "wrong-password" })
        .expect(index === 4 ? 429 : 401);
    }
    await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: "admin@example.com", password: "Abcd@1234" })
      .expect(200);
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

  it("rejects restricted users before issuing tokens", async () => {
    const fixture = await createAuthFixture();

    await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: "restricted@example.com", password: "Abcd@1234" })
      .expect(403)
      .expect((response) => {
        expect(response.body.message).toBe("error.auth.account_restricted");
      });

    expect(fixture.sessionStore.refreshTokens.size).toBe(0);
  });

  it("fails closed when a repository adapter violates the required access-state contract", async () => {
    const fixture = await createAuthFixture();
    fixture.repository.findUserByLoginIdentifier.mockResolvedValueOnce({
      ...fixture.user,
      accessState: undefined
    } as never);

    await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: "admin@example.com", password: "Abcd@1234" })
      .expect(403)
      .expect((response) => {
        expect(response.body.message).toBe("error.auth.account_disabled");
      });
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
      username: "admin",
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

  it("returns server-computed identity availability for active, draft, pending, rejected, and contract activation states", async () => {
    const fixture = await createAuthFixture();
    const customerLogin = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "customer@example.com", password: "Abcd@1234" })
      .expect(200);

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${customerLogin.body.data.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.identityAvailability).toEqual([
          {
            kind: "customer",
            state: "active",
            identityId: 20,
            applicationId: null,
            rejectionReason: null
          },
          {
            kind: "technician",
            state: "draft",
            identityId: null,
            applicationId: 201,
            rejectionReason: null
          },
          {
            kind: "merchant",
            state: "rejected",
            identityId: null,
            applicationId: 202,
            rejectionReason: "法人资料无法确认"
          },
          {
            kind: "affiliate",
            state: "available_to_apply",
            identityId: null,
            applicationId: null,
            rejectionReason: null
          }
        ]);
      });

    const multiLogin = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "multi@example.com", password: "Abcd@1234" })
      .expect(200);
    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${multiLogin.body.data.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.identityAvailability).toEqual([
          {
            kind: "customer",
            state: "active",
            identityId: 50,
            applicationId: null,
            rejectionReason: null
          },
          {
            kind: "technician",
            state: "active",
            identityId: 51,
            applicationId: null,
            rejectionReason: null
          },
          {
            kind: "merchant",
            state: "pending",
            identityId: null,
            applicationId: 203,
            rejectionReason: null
          },
          {
            kind: "affiliate",
            state: "available_to_apply",
            identityId: null,
            applicationId: null,
            rejectionReason: null
          }
        ]);
      });
  });

  it("switches the current identity and rotates tokens for the same user", async () => {
    const fixture = await createAuthFixture();
    const loginResponse = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ email: "multi@example.com", password: "Abcd@1234" })
      .expect(200);
    const { accessToken, refreshToken } = loginResponse.body.data;

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.currentIdentity).toMatchObject({
          id: 50,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 5
        });
      });

    const switchResponse = await request(fixture.app)
      .post("/api/v1/auth/switch-identity")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken, identityId: 51 })
      .expect(200);

    expect(switchResponse.body.data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: expect.any(Number),
      me: {
        currentIdentity: {
          id: 51,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 3
        },
        permissions: expect.arrayContaining(["auth:me", "technician:services:write"])
      }
    });
    expect(switchResponse.body.data.refreshToken).not.toBe(refreshToken);
    expect(fixture.sessionStore.refreshTokens.size).toBe(1);
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 5,
          action: "auth.identity.switch",
          targetType: "UserIdentity",
          targetId: 51
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

    await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(401)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.TOKEN_INVALID);
      });

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${switchResponse.body.data.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.currentIdentity).toMatchObject({
          id: 51,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 3
        });
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
