import { randomUUID } from "node:crypto";
import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  AuthRepositoryPort,
  AuthUserRecord,
  GoogleAuthRepositoryPort,
  GoogleBindingRecord
} from "../src/repositories/auth.repository";
import type { GoogleCredentialVerifierPort } from "../src/services/google-credential-verifier.service";
import { AuthService } from "../src/services/auth.service";
import type {
  ConsumeVerificationChallengeInput,
  CreateVerificationChallengeInput
} from "../src/services/auth-verification-challenge.store";
import type { AppError } from "../src/utils/app-error";

const context = { ip: "127.0.0.1", userAgent: "google-auth-service-test" };

const createUser = (overrides: Partial<AuthUserRecord> = {}): AuthUserRecord => ({
  id: 1,
  needoId: "n0000000001",
  email: "existing@example.com",
  emailVerifiedAt: new Date("2026-08-26T00:00:00.000Z"),
  phone: null,
  passwordHash: null,
  username: "n0000000001",
  avatarUrl: null,
  isActive: true,
  accessState: { disabled: false, restricted: false },
  lastLoginAt: null,
  deletedAt: null,
  identities: [
    {
      id: 10,
      userId: 1,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 1,
      displayName: "n0000000001",
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
  userRoles: [],
  identityApplications: [],
  ...overrides
});

class InMemoryChallengeStore {
  public readonly challenges = new Map<
    string,
    CreateVerificationChallengeInput & { reservationToken?: string }
  >();
  public readonly nonces = new Map<string, string>();
  public readonly cancelled: string[] = [];

  public async createGoogleNonce() {
    const challengeId = randomUUID();
    const nonce = `nonce-${challengeId}`;
    this.nonces.set(challengeId, nonce);
    return { challengeId, nonce, expiresInSeconds: 300 };
  }

  public async consumeGoogleNonce(input: { challengeId: string; expectedNonce: string }) {
    const nonce = this.nonces.get(input.challengeId);
    if (nonce !== input.expectedNonce) return false;
    this.nonces.delete(input.challengeId);
    return true;
  }

  public async readGoogleNonce(input: { challengeId: string }) {
    return this.nonces.get(input.challengeId) ?? null;
  }

  public async createEmailChallenge(input: CreateVerificationChallengeInput) {
    const challengeId = randomUUID();
    this.challenges.set(challengeId, input);
    return {
      challengeId,
      expiresInSeconds: 600,
      maskedEmail: "e******g@example.com"
    };
  }

  public async reserveEmailChallenge(input: ConsumeVerificationChallengeInput) {
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge) return { ok: false as const, reason: "missing" as const };
    if (challenge.purpose !== input.purpose) {
      return { ok: false as const, reason: "purpose_mismatch" as const };
    }
    if (challenge.otp !== input.otp) {
      return { ok: false as const, reason: "invalid_otp" as const };
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
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge || challenge.reservationToken !== input.reservationToken) return false;
    this.challenges.delete(input.challengeId);
    return true;
  }

  public async releaseEmailChallenge(input: { challengeId: string; reservationToken: string }) {
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge || challenge.reservationToken !== input.reservationToken) return false;
    delete challenge.reservationToken;
    return true;
  }

  public async cancelEmailChallenge(input: { challengeId: string }) {
    this.cancelled.push(input.challengeId);
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
}

class InMemorySessionStore {
  public readonly refresh = new Set<string>();

  public async storeRefreshToken(userId: number, jti: string) {
    this.refresh.add(`${userId}:${jti}`);
  }
  public async revokeRefreshToken(userId: number, jti: string) {
    this.refresh.delete(`${userId}:${jti}`);
  }
  public async hasRefreshToken(userId: number, jti: string) {
    return this.refresh.has(`${userId}:${jti}`);
  }
  public async getLoginLock() {
    return false;
  }
  public async recordFailedLogin() {
    return { count: 1, locked: false };
  }
  public async clearFailedLogin() {}
  public async getAccountLoginLock() {
    return false;
  }
  public async recordFailedLoginForAccount() {
    return { count: 1, locked: false };
  }
  public async clearFailedLoginForAccount() {}
  public async storeOtp() {}
  public async getOtp() {
    return null;
  }
  public async deleteOtp() {}
  public async hasOtpCooldown() {
    return false;
  }
  public async storeOtpCooldown() {}
  public async clearOtpCooldown() {}
  public async blacklistAccessToken() {}
  public async isAccessTokenBlacklisted() {
    return false;
  }
}

const createFixture = () => {
  const users = [createUser()];
  const challengeStore = new InMemoryChallengeStore();
  const sessionStore = new InMemorySessionStore();
  const deliveredOtps: Array<{ email: string; otp: string }> = [];
  const loginLogs: unknown[] = [];
  const auditLogs: unknown[] = [];
  const bindings = new Map<string, GoogleBindingRecord>();
  const verifier: GoogleCredentialVerifierPort = {
    verify: jest.fn(async () => ({
      subject: "google-subject-1",
      email: "existing@example.com",
      emailVerifiedAt: new Date("2026-08-26T00:00:00.000Z"),
      name: "Google Display Name",
      pictureUrl: "https://example.test/avatar.png"
    }))
  };
  const repository = {
    findUserByEmail: jest.fn(
      async (email: string) => users.find((user) => user.email === email) ?? null
    ),
    findUserByLoginIdentifier: jest.fn(async () => null),
    findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
    findVerifiedRegistrationByChallenge: jest.fn(async () => null),
    createVerifiedBaselineCustomer: jest.fn(async (input) => {
      const user = createUser({
        id: users.length + 1,
        needoId: `n${String(users.length + 1).padStart(10, "0")}`,
        email: input.email,
        passwordHash: input.passwordHash,
        username: `n${String(users.length + 1).padStart(10, "0")}`
      });
      users.push(user);
      if (input.googleIdentity) {
        bindings.set(input.googleIdentity.subject, {
          id: bindings.size + 1,
          userId: user.id,
          provider: "google",
          providerSubject: input.googleIdentity.subject,
          providerEmail: input.googleIdentity.email,
          providerEmailVerifiedAt: input.googleIdentity.emailVerifiedAt,
          lastUsedAt: new Date(),
          deletedAt: null,
          user
        });
      }
      return user;
    }),
    findGoogleBindingBySubject: jest.fn(async (subject: string) => bindings.get(subject) ?? null),
    createOrRestoreGoogleBinding: jest.fn(async (input) => {
      const user = users.find((candidate) => candidate.id === input.userId)!;
      const binding: GoogleBindingRecord = {
        id: bindings.size + 1,
        userId: user.id,
        provider: "google",
        providerSubject: input.googleIdentity.subject,
        providerEmail: input.googleIdentity.email,
        providerEmailVerifiedAt: input.googleIdentity.emailVerifiedAt,
        lastUsedAt: new Date(),
        deletedAt: null,
        user
      };
      bindings.set(binding.providerSubject, binding);
      return binding;
    }),
    completeGoogleFirstUseLink: jest.fn(async (input) => {
      const user = users.find((candidate) => candidate.email === input.googleIdentity.email);
      if (!user) throw new Error("missing Google link target");
      const existing = bindings.get(input.googleIdentity.subject);
      if (existing && existing.userId !== user.id) {
        throw new Error("Google identity is already linked to a different NeeDo account");
      }
      if (!existing) {
        await repository.createOrRestoreGoogleBinding({
          userId: user.id,
          googleIdentity: input.googleIdentity
        });
      }
      auditLogs.push({
        action: "auth.google.link",
        targetId: user.id,
        metadata: { challengeId: input.challengeId }
      });
      return user;
    }),
    completeSuccessfulGoogleLogin: jest.fn(async (input) => {
      const binding = bindings.get(input.providerSubject);
      if (!binding || binding.userId !== input.expectedUserId)
        throw new Error("missing Google login binding");
      binding.lastUsedAt = input.loggedInAt;
      const user = users.find((candidate) => candidate.id === input.expectedUserId)!;
      user.lastLoginAt = input.loggedInAt;
      loginLogs.push({ userId: user.id, status: "success" });
      return user;
    }),
    updateGoogleBindingLastUsedAt: jest.fn(async (subject: string, lastUsedAt: Date) => {
      const binding = bindings.get(subject);
      if (!binding) return false;
      binding.lastUsedAt = lastUsedAt;
      return true;
    }),
    updateLastLoginAt: jest.fn(async () => {}),
    createLoginLog: jest.fn(async (entry) => {
      loginLogs.push(entry);
    }),
    createAuditLog: jest.fn(async (entry) => {
      auditLogs.push(entry);
    })
  } satisfies Partial<AuthRepositoryPort> & Partial<GoogleAuthRepositoryPort>;
  const service = new AuthService(
    process.env as never,
    repository as never,
    sessionStore as never,
    {
      sendOtp: jest.fn(async (email: string, otp: string) => {
        deliveredOtps.push({ email, otp });
      })
    },
    challengeStore as never,
    false,
    verifier
  );
  return {
    service,
    verifier,
    repository,
    challengeStore,
    deliveredOtps,
    loginLogs,
    auditLogs,
    users,
    bindings
  };
};

describe("formal Google sign-in service", () => {
  it("initializes a public client nonce and authenticates an active linked subject", async () => {
    const fixture = createFixture();
    fixture.bindings.set("google-subject-1", {
      id: 1,
      userId: 1,
      provider: "google",
      providerSubject: "google-subject-1",
      providerEmail: "existing@example.com",
      providerEmailVerifiedAt: new Date(),
      lastUsedAt: null,
      deletedAt: null,
      user: fixture.users[0]
    });

    const init = await fixture.service.initializeGoogleLogin();
    const result = await fixture.service.submitGoogleCredential(
      { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
      context
    );

    expect(init).toEqual({
      clientId: expect.any(String),
      nonce: expect.any(String),
      nonceChallengeId: expect.any(String),
      expiresIn: 300
    });
    expect(result).toMatchObject({ status: "authenticated", accessToken: expect.any(String) });
    expect(fixture.repository.completeSuccessfulGoogleLogin).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubject: "google-subject-1", expectedUserId: 1 })
    );
    expect(fixture.deliveredOtps).toHaveLength(0);
  });

  it("requires verified NeeDo email ownership before first use and links the matching account", async () => {
    const fixture = createFixture();
    const init = await fixture.service.initializeGoogleLogin();
    const pending = await fixture.service.submitGoogleCredential(
      { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
      context
    );

    expect(pending).toMatchObject({
      status: "verification_required",
      maskedEmail: expect.any(String)
    });
    expect(fixture.deliveredOtps).toHaveLength(1);
    if (pending.status !== "verification_required") throw new Error("expected verification");
    const otp = fixture.deliveredOtps[0].otp;
    const complete = await fixture.service.verifyGoogleRegistrationOrLink(
      pending.challengeId,
      otp,
      context
    );

    expect(complete).toMatchObject({ accessToken: expect.any(String) });
    expect(fixture.repository.createOrRestoreGoogleBinding).toHaveBeenCalledWith({
      userId: 1,
      googleIdentity: expect.objectContaining({
        subject: "google-subject-1",
        email: "existing@example.com"
      })
    });
    expect(fixture.repository.createVerifiedBaselineCustomer).not.toHaveBeenCalled();
    expect(fixture.auditLogs).toContainEqual(
      expect.objectContaining({ action: "auth.google.link" })
    );
  });

  it("creates a Google-only baseline without adopting the Google profile name", async () => {
    const fixture = createFixture();
    (fixture.verifier.verify as jest.Mock).mockResolvedValueOnce({
      subject: "google-subject-2",
      email: "new@example.com",
      emailVerifiedAt: new Date("2026-08-26T00:00:00.000Z"),
      name: "Untrusted Google Name",
      pictureUrl: null
    });
    const init = await fixture.service.initializeGoogleLogin();
    const pending = await fixture.service.submitGoogleCredential(
      { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
      context
    );
    if (pending.status !== "verification_required") throw new Error("expected verification");
    const created = await fixture.service.verifyGoogleRegistrationOrLink(
      pending.challengeId,
      fixture.deliveredOtps[0].otp,
      context
    );

    expect(created).toMatchObject({ needoId: "n0000000002" });
    expect(fixture.repository.createVerifiedBaselineCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        passwordHash: null,
        googleIdentity: expect.objectContaining({ subject: "google-subject-2" })
      })
    );
    expect(fixture.users[1].username).toBe("n0000000002");
  });

  it("fails closed for nonce replay and never exposes provider credential or subject", async () => {
    const fixture = createFixture();
    const init = await fixture.service.initializeGoogleLogin();
    await fixture.service.submitGoogleCredential(
      { credential: "secret-provider-credential", nonceChallengeId: init.nonceChallengeId },
      context
    );

    await expect(
      fixture.service.submitGoogleCredential(
        { credential: "secret-provider-credential", nonceChallengeId: init.nonceChallengeId },
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_CREDENTIALS });

    const logged = JSON.stringify({ loginLogs: fixture.loginLogs, auditLogs: fixture.auditLogs });
    expect(logged).not.toContain("secret-provider-credential");
    expect(logged).not.toContain("google-subject-1");
  });

  it("allows exactly one concurrent submission for one nonce", async () => {
    const fixture = createFixture();
    const init = await fixture.service.initializeGoogleLogin();
    const results = await Promise.allSettled([
      fixture.service.submitGoogleCredential(
        { credential: "credential-a", nonceChallengeId: init.nonceChallengeId },
        context
      ),
      fixture.service.submitGoogleCredential(
        { credential: "credential-b", nonceChallengeId: init.nonceChallengeId },
        context
      )
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({
      reason: { code: ERROR_CODES.INVALID_CREDENTIALS }
    });
  });

  it("returns a stable Google conflict when a concurrent subject resolves to another account", async () => {
    const fixture = createFixture();
    const init = await fixture.service.initializeGoogleLogin();
    const pending = await fixture.service.submitGoogleCredential(
      { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
      context
    );
    if (pending.status !== "verification_required") throw new Error("expected verification");
    fixture.bindings.set("google-subject-1", {
      id: 8,
      userId: 99,
      provider: "google",
      providerSubject: "google-subject-1",
      providerEmail: "other@example.com",
      providerEmailVerifiedAt: new Date(),
      lastUsedAt: null,
      deletedAt: null,
      user: createUser({ id: 99, email: "other@example.com" })
    });

    await expect(
      fixture.service.verifyGoogleRegistrationOrLink(
        pending.challengeId,
        fixture.deliveredOtps[0].otp,
        context
      )
    ).rejects.toMatchObject({ message: "error.auth.google_conflict" } satisfies Partial<AppError>);
  });

  it("releases a reserved malformed first-use challenge without replacing the stable error", async () => {
    const fixture = createFixture();
    const challenge = await fixture.challengeStore.createEmailChallenge({
      email: "existing@example.com",
      otp: "123456",
      purpose: "google_registration_or_link",
      metadata: { providerSubject: "subject-only" }
    });

    await expect(
      fixture.service.verifyGoogleRegistrationOrLink(challenge.challengeId, "123456", context)
    ).rejects.toMatchObject({ message: "error.auth.verification_challenge_expired" });
    await expect(
      fixture.service.verifyGoogleRegistrationOrLink(challenge.challengeId, "123456", context)
    ).rejects.toMatchObject({ message: "error.auth.verification_challenge_expired" });
  });
});
