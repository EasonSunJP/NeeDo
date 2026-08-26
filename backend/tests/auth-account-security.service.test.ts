import { compare } from "bcryptjs";
import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  AuthRepositoryPort,
  AuthUserRecord,
  GoogleAuthRepositoryPort,
  GoogleBindingRecord
} from "../src/repositories/auth.repository";
import type { AuthSessionStore } from "../src/services/auth-session.store";
import { AuthService, type AuthenticatedAccessContext } from "../src/services/auth.service";
import type {
  ConsumeVerificationChallengeInput,
  VerificationPurpose
} from "../src/services/auth-verification-challenge.store";
import type { GoogleCredentialVerifierPort } from "../src/services/google-credential-verifier.service";

const context: AuthenticatedAccessContext = {
  userId: 7,
  email: "needo@example.com",
  accessTokenJti: "current-access-jti",
  accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 300,
  roles: [],
  permissions: []
};

const requestContext = { ip: "127.0.0.1", userAgent: "jest" };

const createUser = (overrides: Partial<AuthUserRecord> = {}): AuthUserRecord => ({
  id: 7,
  needoId: "n0000000007",
  email: "needo@example.com",
  emailVerifiedAt: new Date(),
  phone: null,
  passwordHash: null,
  username: "n0000000007",
  avatarUrl: null,
  isActive: true,
  sessionGeneration: 0,
  accessState: { disabled: false, restricted: false },
  lastLoginAt: null,
  deletedAt: null,
  identities: [
    {
      id: 17,
      userId: 7,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 1,
      displayName: "n0000000007",
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
  userRoles: [],
  ...overrides
});

class ChallengeStore {
  public readonly challenges = new Map<
    string,
    {
      email: string;
      purpose: VerificationPurpose;
      userId?: number;
      metadata?: Record<string, unknown>;
      otp: string;
    }
  >();
  public readonly nonces = new Map<string, { nonce: string; userId?: number }>();
  public cancelled: string[] = [];
  private readonly leases = new Set<string>();

  public async createEmailChallenge(input: {
    email: string;
    otp: string;
    purpose: VerificationPurpose;
    userId?: number;
    metadata?: Record<string, unknown>;
  }) {
    const challengeId = `challenge-${this.challenges.size + 1}`;
    this.challenges.set(challengeId, { ...input });
    return {
      challengeId,
      maskedEmail: `${input.email.slice(0, 2)}***`,
      expiresInSeconds: 600
    };
  }

  public async reserveEmailChallenge(input: ConsumeVerificationChallengeInput) {
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge) return { ok: false as const, reason: "missing" as const };
    if (challenge.purpose !== input.purpose)
      return { ok: false as const, reason: "purpose_mismatch" as const };
    if (challenge.userId !== input.userId)
      return { ok: false as const, reason: "user_mismatch" as const };
    if (challenge.otp !== input.otp)
      return { ok: false as const, reason: "invalid_otp" as const, attempts: 1 };
    if (this.leases.has(input.challengeId))
      return { ok: false as const, reason: "reserved" as const };
    this.leases.add(input.challengeId);
    return {
      ok: true as const,
      reservationToken: `lease-${input.challengeId}`,
      email: challenge.email,
      metadata: (challenge.metadata ?? {}) as never
    };
  }

  public async finalizeEmailChallenge(input: { challengeId: string; reservationToken: string }) {
    if (
      !this.leases.delete(input.challengeId) ||
      input.reservationToken !== `lease-${input.challengeId}`
    )
      return false;
    return this.challenges.delete(input.challengeId);
  }

  public async releaseEmailChallenge(input: { challengeId: string; reservationToken: string }) {
    if (input.reservationToken !== `lease-${input.challengeId}`) return false;
    return this.leases.delete(input.challengeId);
  }

  public async cancelEmailChallenge(input: { challengeId: string }) {
    this.cancelled.push(input.challengeId);
    return this.challenges.delete(input.challengeId);
  }

  public async consumeEmailChallenge(input: ConsumeVerificationChallengeInput) {
    const reserved = await this.reserveEmailChallenge(input);
    if (!reserved.ok)
      return reserved.reason === "reserved"
        ? { ok: false as const, reason: "missing" as const }
        : reserved;
    await this.finalizeEmailChallenge({
      challengeId: input.challengeId,
      reservationToken: reserved.reservationToken
    });
    return { ok: true as const, email: reserved.email, metadata: reserved.metadata };
  }

  public async createGoogleNonce(input: { userId?: number }) {
    const challengeId = `nonce-${this.nonces.size + 1}`;
    const nonce = `nonce-value-${this.nonces.size + 1}`;
    this.nonces.set(challengeId, { nonce, userId: input.userId });
    return { challengeId, nonce, expiresInSeconds: 300 };
  }

  public async readGoogleNonce(input: { challengeId: string; userId?: number }) {
    const nonce = this.nonces.get(input.challengeId);
    return nonce && nonce.userId === input.userId ? nonce.nonce : null;
  }

  public async consumeGoogleNonce(input: {
    challengeId: string;
    expectedNonce: string;
    userId?: number;
  }) {
    const nonce = this.nonces.get(input.challengeId);
    if (!nonce || nonce.userId !== input.userId || nonce.nonce !== input.expectedNonce)
      return false;
    this.nonces.delete(input.challengeId);
    return true;
  }
}

class SessionStore implements AuthSessionStore {
  public readonly revokedAll: number[] = [];
  public readonly blacklisted: Array<{ jti: string; ttl: number }> = [];
  public failNextRevokeAll = false;
  public async getLoginLock() {
    return false;
  }
  public async getAccountLoginLock() {
    return false;
  }
  public async recordFailedLogin() {
    return { count: 0, locked: false };
  }
  public async clearFailedLogin() {}
  public async recordFailedLoginForAccount() {
    return { count: 0, locked: false };
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
  public async storeRefreshToken() {}
  public async hasRefreshToken() {
    return false;
  }
  public async revokeRefreshToken() {}
  public async revokeAllRefreshTokens(userId: number) {
    if (this.failNextRevokeAll) {
      this.failNextRevokeAll = false;
      throw new Error("revoke all failed");
    }
    this.revokedAll.push(userId);
  }
  public async completeGoogleUnlink(input: {
    userId: number;
    accessTokenJti: string;
    accessTokenTtlSeconds: number;
  }) {
    await this.revokeAllRefreshTokens(input.userId);
    await this.blacklistAccessToken(input.accessTokenJti, input.accessTokenTtlSeconds);
    return true;
  }
  public async blacklistAccessToken(jti: string, ttl: number) {
    this.blacklisted.push({ jti, ttl });
  }
  public async isAccessTokenBlacklisted() {
    return false;
  }
}

const createFixture = () => {
  const users = new Map<number, AuthUserRecord>([
    [7, createUser()],
    [8, createUser({ id: 8, email: "other@example.com" })]
  ]);
  const bindings = new Map<string, GoogleBindingRecord>();
  const audits: Array<{ action: string; challengeId: string; userId: number }> = [];
  const challenges = new ChallengeStore();
  const sessions = new SessionStore();
  const sent: Array<{ email: string; otp: string }> = [];
  const repository = {
    findUserByEmail: jest.fn(
      async (email: string) => [...users.values()].find((user) => user.email === email) ?? null
    ),
    findUserByLoginIdentifier: jest.fn(
      async (identifier: string) =>
        [...users.values()].find(
          (user) => user.email === identifier || user.needoId === identifier
        ) ?? null
    ),
    findUserById: jest.fn(async (id: number) => users.get(id) ?? null),
    findVerifiedRegistrationByChallenge: jest.fn(async () => null),
    createVerifiedBaselineCustomer: jest.fn(),
    updateLastLoginAt: jest.fn(),
    createLoginLog: jest.fn(),
    createAuditLog: jest.fn(),
    findGoogleBindingBySubject: jest.fn(async (subject: string) => bindings.get(subject) ?? null),
    createOrRestoreGoogleBinding: jest.fn(),
    completeGoogleFirstUseLink: jest.fn(),
    completeSuccessfulGoogleLogin: jest.fn(),
    getGoogleBindingStatus: jest.fn(async (userId: number) => {
      const binding = [...bindings.values()].find(
        (item) => item.userId === userId && !item.deletedAt
      );
      return {
        linked: Boolean(binding),
        bindingId: binding?.id ?? null,
        providerEmail: binding?.providerEmail ?? null
      };
    }),
    completeAuthenticatedGoogleLink: jest.fn(async (input) => {
      const existing = bindings.get(input.googleIdentity.subject);
      if (existing && existing.userId !== input.userId && !existing.deletedAt) {
        const error = new Error("conflict");
        error.name = "ExternalAuthAccountConflictError";
        throw error;
      }
      if (!existing) {
        bindings.set(input.googleIdentity.subject, {
          id: bindings.size + 1,
          userId: input.userId,
          provider: "google",
          providerSubject: input.googleIdentity.subject,
          providerEmail: input.googleIdentity.email,
          providerEmailVerifiedAt: input.googleIdentity.emailVerifiedAt,
          lastUsedAt: null,
          deletedAt: null,
          user: users.get(input.userId)!
        });
      }
      if (
        !audits.some(
          (audit) => audit.action === "auth.google.link" && audit.challengeId === input.challengeId
        )
      )
        audits.push({
          action: "auth.google.link",
          challengeId: input.challengeId,
          userId: input.userId
        });
      return users.get(input.userId)!;
    }),
    completePasswordSetup: jest.fn(async (input) => {
      const user = users.get(input.userId)!;
      user.passwordHash = input.passwordHash;
      if (
        !audits.some(
          (audit) =>
            audit.action === "auth.password.setup" && audit.challengeId === input.challengeId
        )
      )
        audits.push({
          action: "auth.password.setup",
          challengeId: input.challengeId,
          userId: input.userId
        });
      return user;
    }),
    completeGoogleUnlink: jest.fn(async (input) => {
      if (
        audits.some(
          (audit) =>
            audit.action === "auth.google.unlink" && audit.challengeId === input.challengeId
        )
      )
        return users.get(input.userId)!;
      const binding = [...bindings.values()].find(
        (item) => item.userId === input.userId && !item.deletedAt
      );
      if (!binding) throw new Error("missing binding");
      binding.deletedAt = new Date();
      const unlinkingUser = users.get(input.userId);
      if (!unlinkingUser) throw new Error("missing unlink user");
      unlinkingUser.sessionGeneration = (unlinkingUser.sessionGeneration ?? 0) + 1;
      if (
        !audits.some(
          (audit) =>
            audit.action === "auth.google.unlink" && audit.challengeId === input.challengeId
        )
      )
        audits.push({
          action: "auth.google.unlink",
          challengeId: input.challengeId,
          userId: input.userId
        });
      return users.get(input.userId)!;
    }),
    hasGoogleUnlinkCompletion: jest.fn(async (input) =>
      audits.some(
        (audit) =>
          audit.action === "auth.google.unlink" &&
          audit.challengeId === input.challengeId &&
          audit.userId === input.userId
      )
    )
  } satisfies Partial<AuthRepositoryPort> & Partial<GoogleAuthRepositoryPort>;
  const verifier: GoogleCredentialVerifierPort = {
    verify: jest.fn(async () => ({
      subject: "google-subject",
      email: "different-google@example.com",
      emailVerifiedAt: new Date("2026-08-26T00:00:00.000Z"),
      name: null,
      pictureUrl: null
    }))
  };
  const service = new AuthService(
    process.env as never,
    repository as never,
    sessions,
    { sendOtp: async (email, otp) => void sent.push({ email, otp }) },
    challenges as never,
    false,
    verifier
  );
  return { users, bindings, audits, challenges, sessions, sent, repository, verifier, service };
};

describe("authenticated Google account security", () => {
  it("returns only the safe Google-link status", async () => {
    const fixture = createFixture();
    fixture.bindings.set("google-subject", {
      id: 1,
      userId: 7,
      provider: "google",
      providerSubject: "google-subject",
      providerEmail: "linked@example.com",
      providerEmailVerifiedAt: new Date(),
      lastUsedAt: null,
      deletedAt: null,
      user: fixture.users.get(7)!
    });
    await expect(fixture.service.getGoogleLinkStatus(context)).resolves.toEqual({
      linked: true,
      maskedEmail: "l****d@example.com",
      hasPassword: false,
      canUnlink: false
    });
  });

  it("binds nonce and OTP to the authenticated user and NeeDo primary email", async () => {
    const fixture = createFixture();
    const init = await fixture.service.initializeAuthenticatedGoogleLink(context);
    await expect(
      fixture.service.submitAuthenticatedGoogleLink(
        { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
        context,
        requestContext
      )
    ).resolves.toMatchObject({ maskedEmail: "ne***" });
    expect(fixture.sent).toEqual([expect.objectContaining({ email: "needo@example.com" })]);
    expect(fixture.challenges.nonces.get(init.nonceChallengeId)).toBeUndefined();
    await expect(
      fixture.service.submitAuthenticatedGoogleLink(
        { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
        { ...context, userId: 8 },
        requestContext
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_CREDENTIALS });
  });

  it("links once with one audit and never advances last use", async () => {
    const fixture = createFixture();
    const init = await fixture.service.initializeAuthenticatedGoogleLink(context);
    const pending = await fixture.service.submitAuthenticatedGoogleLink(
      { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
      context,
      requestContext
    );
    const result = await fixture.service.verifyAuthenticatedGoogleLink(
      pending.challengeId,
      fixture.sent[0].otp,
      context,
      requestContext
    );
    expect(result).toEqual({ linked: true });
    expect(fixture.bindings.get("google-subject")?.lastUsedAt).toBeNull();
    expect(fixture.audits).toEqual([
      { action: "auth.google.link", challengeId: pending.challengeId, userId: 7 }
    ]);
    await expect(
      fixture.service.verifyAuthenticatedGoogleLink(
        pending.challengeId,
        fixture.sent[0].otp,
        context,
        requestContext
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.VERIFICATION_CHALLENGE_EXPIRED });
  });

  it("rejects a provider subject actively owned by another account", async () => {
    const fixture = createFixture();
    fixture.bindings.set("google-subject", {
      id: 2,
      userId: 8,
      provider: "google",
      providerSubject: "google-subject",
      providerEmail: "other@example.com",
      providerEmailVerifiedAt: new Date(),
      lastUsedAt: null,
      deletedAt: null,
      user: fixture.users.get(8)!
    });
    const init = await fixture.service.initializeAuthenticatedGoogleLink(context);
    await expect(
      fixture.service.submitAuthenticatedGoogleLink(
        { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
        context,
        requestContext
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.GOOGLE_CONFLICT });
    expect(fixture.sent).toEqual([]);
  });

  it("sets a password only after the user-bound challenge without exposing its hash", async () => {
    const fixture = createFixture();
    const pending = await fixture.service.startPasswordSetup(
      "StrongPass1!",
      context,
      requestContext
    );
    expect(fixture.sent).toEqual([expect.objectContaining({ email: "needo@example.com" })]);
    expect(JSON.stringify([...fixture.challenges.challenges.values()])).not.toContain(
      "StrongPass1!"
    );
    await expect(
      fixture.service.verifyPasswordSetup(
        pending.challengeId,
        fixture.sent[0].otp,
        context,
        requestContext
      )
    ).resolves.toEqual({ hasPassword: true });
    await expect(compare("StrongPass1!", fixture.users.get(7)!.passwordHash!)).resolves.toBe(true);
    expect(fixture.audits).toContainEqual(
      expect.objectContaining({ action: "auth.password.setup" })
    );
  });

  it("requires a password before unlink and revokes sessions only after transactional unlink", async () => {
    const fixture = createFixture();
    fixture.bindings.set("google-subject", {
      id: 1,
      userId: 7,
      provider: "google",
      providerSubject: "google-subject",
      providerEmail: "linked@example.com",
      providerEmailVerifiedAt: new Date(),
      lastUsedAt: null,
      deletedAt: null,
      user: fixture.users.get(7)!
    });
    await expect(fixture.service.startGoogleUnlink(context, requestContext)).rejects.toMatchObject({
      code: ERROR_CODES.GOOGLE_CONFLICT
    });
    fixture.users.get(7)!.passwordHash =
      "$2b$12$yeZHxRVngWt4QQuvHslkk.koIBff/rgsnD5/NITKu8U9cL.3.XfUS";
    const pending = await fixture.service.startGoogleUnlink(context, requestContext);
    await expect(
      fixture.service.verifyGoogleUnlink(
        pending.challengeId,
        fixture.sent[0].otp,
        context,
        requestContext
      )
    ).resolves.toEqual({ signedOut: true });
    expect(fixture.bindings.get("google-subject")?.deletedAt).toEqual(expect.any(Date));
    expect(fixture.sessions.revokedAll).toEqual([7]);
    expect(fixture.sessions.blacklisted).toEqual([
      expect.objectContaining({ jti: "current-access-jti", ttl: expect.any(Number) })
    ]);
    expect(fixture.audits).toContainEqual(
      expect.objectContaining({ action: "auth.google.unlink" })
    );
  });

  it("releases a completed unlink challenge when session revocation fails so recovery can retry", async () => {
    const fixture = createFixture();
    fixture.users.get(7)!.passwordHash =
      "$2b$12$yeZHxRVngWt4QQuvHslkk.koIBff/rgsnD5/NITKu8U9cL.3.XfUS";
    fixture.bindings.set("google-subject", {
      id: 1,
      userId: 7,
      provider: "google",
      providerSubject: "google-subject",
      providerEmail: "linked@example.com",
      providerEmailVerifiedAt: new Date(),
      lastUsedAt: null,
      deletedAt: null,
      user: fixture.users.get(7)!
    });
    const pending = await fixture.service.startGoogleUnlink(context, requestContext);
    fixture.sessions.failNextRevokeAll = true;
    await expect(
      fixture.service.verifyGoogleUnlink(
        pending.challengeId,
        fixture.sent[0].otp,
        context,
        requestContext
      )
    ).rejects.toThrow("revoke all failed");
    await expect(
      fixture.service.verifyGoogleUnlink(
        pending.challengeId,
        fixture.sent[0].otp,
        context,
        requestContext
      )
    ).resolves.toEqual({ signedOut: true });
    expect(fixture.audits.filter((audit) => audit.action === "auth.google.unlink")).toHaveLength(1);
  });

  it("does not mutate on wrong-purpose, wrong-user, or replayed security challenges", async () => {
    const fixture = createFixture();
    const pending = await fixture.service.startPasswordSetup(
      "StrongPass1!",
      context,
      requestContext
    );
    const challenge = fixture.challenges.challenges.get(pending.challengeId)!;
    challenge.purpose = "google_unlink";
    await expect(
      fixture.service.verifyPasswordSetup(
        pending.challengeId,
        fixture.sent[0].otp,
        context,
        requestContext
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.VERIFICATION_CHALLENGE_EXPIRED });
    expect(fixture.users.get(7)!.passwordHash).toBeNull();

    const userBound = await fixture.service.startPasswordSetup(
      "StrongPass1!",
      context,
      requestContext
    );
    await expect(
      fixture.service.verifyPasswordSetup(
        userBound.challengeId,
        fixture.sent[1].otp,
        { ...context, userId: 8 },
        requestContext
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.VERIFICATION_CHALLENGE_EXPIRED });
    await expect(
      fixture.service.verifyPasswordSetup(
        userBound.challengeId,
        fixture.sent[1].otp,
        context,
        requestContext
      )
    ).resolves.toEqual({ hasPassword: true });
    await expect(
      fixture.service.verifyPasswordSetup(
        userBound.challengeId,
        fixture.sent[1].otp,
        context,
        requestContext
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.VERIFICATION_CHALLENGE_EXPIRED });
  });

  it.each([
    ["disabled", { disabled: true, restricted: false }, "error.auth.account_disabled"],
    ["restricted", { disabled: false, restricted: true }, "error.auth.account_restricted"]
  ] as const)(
    "rejects %s users before account-security mutation",
    async (_state, accessState, message) => {
      const fixture = createFixture();
      fixture.users.get(7)!.accessState = accessState;
      await expect(fixture.service.getGoogleLinkStatus(context)).rejects.toMatchObject({ message });
      await expect(
        fixture.service.startPasswordSetup("StrongPass1!", context, requestContext)
      ).rejects.toMatchObject({ message });
      expect(fixture.challenges.challenges.size).toBe(0);
    }
  );

  it("rejects a soft-deleted current account without issuing a security challenge", async () => {
    const fixture = createFixture();
    fixture.repository.findUserById.mockResolvedValueOnce(null);
    await expect(fixture.service.initializeAuthenticatedGoogleLink(context)).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS
    });
    expect(fixture.challenges.nonces.size).toBe(0);
  });
});
