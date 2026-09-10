import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { env } from "../src/config/env";
import { createOpenApiDocument } from "../src/api/openapi";
import type { PlatformSettingsRecord } from "../src/repositories/platform-settings.repository";
import { AuthService } from "../src/services/auth.service";
import {
  VerificationChallengeCooldownError,
  type ConsumeVerificationChallengeInput,
  type CreateVerificationChallengeInput
} from "../src/services/auth-verification-challenge.store";
import { PlatformAccessPolicyService } from "../src/services/platform-access-policy.service";

const passwordHashPromise = hash("Abcd@1234", 12);

const setting = (overrides: Partial<PlatformSettingsRecord> = {}): PlatformSettingsRecord => ({
  id: 7,
  publicId: "00000000-0000-4000-8000-000000000007",
  version: 7,
  siteEnabled: true,
  selfRegistrationEnabled: true,
  googleLoginEnabled: true,
  passwordLoginOtpEnabled: true,
  passwordLoginOtpRule: "first_login",
  passwordLoginOtpOnNewIp: false,
  loginLogoMediaAssetId: null,
  requestButtonMediaAssetId: null,
  offlinePaymentEnabled: true,
  ndpPaymentEnabled: true,
  anytimeServiceTestEnabled: false,
  createdByUserId: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  loginLogo: null,
  requestButton: null,
  ...overrides
});

class ChallengeStore {
  public cooldown = false;
  public expired = false;
  public finalizeResult = true;
  public readonly challenges = new Map<
    string,
    CreateVerificationChallengeInput & { reserved?: string }
  >();

  public async createEmailChallenge(input: CreateVerificationChallengeInput) {
    if (this.cooldown) throw new VerificationChallengeCooldownError();
    const challengeId = randomUUID();
    this.challenges.set(challengeId, input);
    return {
      challengeId,
      expiresInSeconds: 600,
      maskedEmail: "u***@example.com"
    };
  }

  public async reserveEmailChallenge(input: ConsumeVerificationChallengeInput) {
    const challenge = this.challenges.get(input.challengeId);
    if (this.expired || !challenge || challenge.purpose !== input.purpose) {
      return { ok: false as const, reason: "missing" as const };
    }
    if (challenge.otp !== input.otp) {
      return { ok: false as const, reason: "invalid_otp" as const, attempts: 1 };
    }
    const reservationToken = randomUUID();
    challenge.reserved = reservationToken;
    return {
      ok: true as const,
      email: challenge.email,
      userId: challenge.userId,
      metadata: challenge.metadata ?? {},
      reservationToken
    };
  }

  public async finalizeEmailChallenge(input: { challengeId: string; reservationToken: string }) {
    const challenge = this.challenges.get(input.challengeId);
    if (!this.finalizeResult || challenge?.reserved !== input.reservationToken) return false;
    this.challenges.delete(input.challengeId);
    return true;
  }

  public async releaseEmailChallenge(input: { challengeId: string; reservationToken: string }) {
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge || challenge.reserved !== input.reservationToken) return false;
    delete challenge.reserved;
    return true;
  }

  public async cancelEmailChallenge(input: { challengeId: string }) {
    return this.challenges.delete(input.challengeId);
  }
}

const createHarness = async (activeSetting = setting()) => {
  const user = {
    id: 12,
    needoId: "u0000000012",
    email: "user@example.com",
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    phone: null,
    passwordHash: await passwordHashPromise,
    username: "User",
    avatarUrl: null,
    isActive: true,
    isTestAccount: false,
    sessionGeneration: 0,
    accessState: { disabled: false, restricted: false },
    lastLoginAt: null,
    deletedAt: null,
    loginIdentityId: 120,
    identities: [
      {
        id: 120,
        userId: 12,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: 12,
        displayName: "User",
        isDefault: true,
        isActive: true,
        deletedAt: null,
        publicIdentifier: {
          publicId: "u0000000012",
          kind: "USER",
          loginAllowed: true,
          status: "ACTIVE",
          deletedAt: null
        }
      }
    ],
    userRoles: [
      {
        deletedAt: null,
        role: {
          code: "customer",
          deletedAt: null,
          rolePermissions: ["auth:me", "auth:logout"].map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const evidence = {
    hasAnySuccessfulLogin: false,
    hasSuccessfulLoginInPeriod: false,
    hasSuccessfulLoginFromIp: false
  };
  const loginLogs: unknown[] = [];
  const repository = {
    findUserByLoginIdentifier: jest.fn(async (identifier: string) =>
      identifier === user.email ? user : null
    ),
    findUserByEmail: jest.fn(async (email: string) => (email === user.email ? user : null)),
    findUserById: jest.fn(async (id: number) => (id === user.id ? user : null)),
    getSuccessfulLoginEvidence: jest.fn(async () => ({ ...evidence })),
    updateLastLoginAt: jest.fn(async () => undefined),
    createLoginLog: jest.fn(async (input: unknown) => {
      loginLogs.push(input);
    }),
    createAuditLog: jest.fn(async () => undefined)
  };
  const storedRefreshTokens: string[] = [];
  const revokedRefreshTokens: string[] = [];
  const sessionStore = {
    getLoginLock: jest.fn(async () => false),
    recordFailedLogin: jest.fn(async () => ({ count: 1, locked: false })),
    clearFailedLogin: jest.fn(async () => undefined),
    getAccountLoginLock: jest.fn(async () => false),
    clearFailedLoginForAccount: jest.fn(async () => undefined),
    recordFailedLoginForAccount: jest.fn(async () => ({ count: 1, locked: false })),
    storeRefreshToken: jest.fn(async (_userId: number, jti: string) => {
      storedRefreshTokens.push(jti);
    }),
    revokeRefreshToken: jest.fn(async (_userId: number, jti: string) => {
      revokedRefreshTokens.push(jti);
    }),
    isAccessTokenBlacklisted: jest.fn(async () => false)
  };
  const challengeStore = new ChallengeStore();
  const delivered: Array<{ email: string; otp: string }> = [];
  const delivery = {
    sendOtp: jest.fn(async (email: string, otp: string) => {
      delivered.push({ email, otp });
    })
  };
  const policy = new PlatformAccessPolicyService({ getActive: async () => activeSetting });
  const clock = () => new Date("2026-09-06T03:00:00.000Z");
  const service = new AuthService(
    env,
    repository as never,
    sessionStore as never,
    delivery,
    challengeStore as never,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    policy,
    clock
  );
  return {
    service,
    repository,
    sessionStore,
    challengeStore,
    delivered,
    evidence,
    storedRefreshTokens,
    revokedRefreshTokens,
    loginLogs,
    user
  };
};

describe("password login verification", () => {
  it("documents the login result union and strict verification endpoint", () => {
    const document = createOpenApiDocument(env) as {
      components: { schemas: Record<string, unknown> };
      paths: Record<
        string,
        { post?: { requestBody?: unknown; responses?: Record<string, unknown> } }
      >;
    };
    expect(document.components.schemas.PasswordLoginResult).toBeDefined();
    expect(document.paths["/api/v1/auth/login/verify"]?.post).toBeDefined();
    expect(JSON.stringify(document.paths["/api/v1/auth/login"])).toContain("PasswordLoginResult");
    expect(JSON.stringify(document.paths["/api/v1/auth/login/verify"])).toContain(
      "additionalProperties"
    );
  });

  it("issues tokens directly when the master switch is off", async () => {
    const harness = await createHarness(setting({ passwordLoginOtpEnabled: false }));

    await expect(
      harness.service.login("user@example.com", "Abcd@1234", { ip: "203.0.113.1" })
    ).resolves.toMatchObject({ status: "authenticated", accessToken: expect.any(String) });
    expect(harness.storedRefreshTokens).toHaveLength(1);
    expect(harness.delivered).toHaveLength(0);
  });

  it("requires email verification on first login without issuing a session", async () => {
    const harness = await createHarness(setting({ passwordLoginOtpRule: "first_login" }));

    const result = await harness.service.login("user@example.com", "Abcd@1234", {
      ip: "203.0.113.2"
    });

    expect(result).toEqual({
      status: "verification_required",
      challengeId: expect.any(String),
      maskedEmail: "u***@example.com",
      expiresIn: 600,
      cooldownSeconds: 60
    });
    expect(harness.storedRefreshTokens).toHaveLength(0);
    expect(harness.delivered).toEqual([
      { email: "user@example.com", otp: expect.stringMatching(/^\d{6}$/) }
    ]);
  });

  it("uses the Tokyo calendar month and combines new-IP verification with OR semantics", async () => {
    const monthly = await createHarness(setting({ passwordLoginOtpRule: "monthly_first" }));
    monthly.evidence.hasAnySuccessfulLogin = true;
    monthly.evidence.hasSuccessfulLoginInPeriod = true;
    monthly.evidence.hasSuccessfulLoginFromIp = true;
    await expect(
      monthly.service.login("user@example.com", "Abcd@1234", { ip: "203.0.113.3" })
    ).resolves.toMatchObject({ status: "authenticated" });
    expect(monthly.repository.getSuccessfulLoginEvidence).toHaveBeenCalledWith({
      userId: 12,
      ip: "203.0.113.3",
      periodStart: new Date("2026-08-31T15:00:00.000Z"),
      periodEnd: new Date("2026-09-30T15:00:00.000Z")
    });

    const newIp = await createHarness(
      setting({ passwordLoginOtpRule: "first_login", passwordLoginOtpOnNewIp: true })
    );
    newIp.evidence.hasAnySuccessfulLogin = true;
    newIp.evidence.hasSuccessfulLoginFromIp = false;
    await expect(
      newIp.service.login("user@example.com", "Abcd@1234", { ip: "203.0.113.4" })
    ).resolves.toMatchObject({ status: "verification_required" });
  });

  it("requires every-login verification and completes the challenge only once", async () => {
    const harness = await createHarness(setting({ passwordLoginOtpRule: "every_login" }));
    const started = await harness.service.login("user@example.com", "Abcd@1234", {
      ip: "203.0.113.5"
    });
    if (started.status !== "verification_required") throw new Error("challenge expected");
    const otp = harness.delivered[0]?.otp ?? "";

    await expect(
      harness.service.verifyPasswordLogin(started.challengeId, otp, { ip: "203.0.113.5" })
    ).resolves.toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    await expect(
      harness.service.verifyPasswordLogin(started.challengeId, otp, { ip: "203.0.113.5" })
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(harness.storedRefreshTokens).toHaveLength(1);
  });

  it("rejects expired challenges and maps the creation cooldown without issuing tokens", async () => {
    const expired = await createHarness(setting({ passwordLoginOtpRule: "every_login" }));
    const started = await expired.service.login("user@example.com", "Abcd@1234", {
      ip: "203.0.113.6"
    });
    if (started.status !== "verification_required") throw new Error("challenge expected");
    expired.challengeStore.expired = true;
    await expect(
      expired.service.verifyPasswordLogin(started.challengeId, expired.delivered[0]?.otp ?? "", {
        ip: "203.0.113.6"
      })
    ).rejects.toMatchObject({ statusCode: 401 });

    const cooldown = await createHarness(setting({ passwordLoginOtpRule: "every_login" }));
    cooldown.challengeStore.cooldown = true;
    await expect(
      cooldown.service.login("user@example.com", "Abcd@1234", { ip: "203.0.113.7" })
    ).rejects.toMatchObject({ statusCode: 429, message: "error.auth.otp_cooldown" });
    expect(cooldown.storedRefreshTokens).toHaveLength(0);
  });

  it("revokes a partially stored refresh session when challenge finalization fails", async () => {
    const harness = await createHarness(setting({ passwordLoginOtpRule: "every_login" }));
    const started = await harness.service.login("user@example.com", "Abcd@1234", {
      ip: "203.0.113.9"
    });
    if (started.status !== "verification_required") throw new Error("challenge expected");
    harness.challengeStore.finalizeResult = false;

    await expect(
      harness.service.verifyPasswordLogin(started.challengeId, harness.delivered[0]?.otp ?? "", {
        ip: "203.0.113.9"
      })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(harness.storedRefreshTokens).toHaveLength(1);
    expect(harness.revokedRefreshTokens).toEqual(harness.storedRefreshTokens);
  });

  it("does not reveal whether an invalid login identifier exists", async () => {
    const harness = await createHarness();

    await expect(
      harness.service.login("unknown@example.com", "wrong", { ip: "203.0.113.8" })
    ).rejects.toMatchObject({ statusCode: 401, message: "error.auth.invalid_credentials" });
    await expect(
      harness.service.login("user@example.com", "wrong", { ip: "203.0.113.8" })
    ).rejects.toMatchObject({ statusCode: 401, message: "error.auth.invalid_credentials" });
  });
});
