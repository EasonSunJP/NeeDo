import { randomUUID } from "node:crypto";
import { ERROR_CODES } from "../src/constants/error-codes";
import { GoogleLoginStateError } from "../src/repositories/auth.repository";
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
  needoId: "u0000000001",
  email: "existing@example.com",
  emailVerifiedAt: new Date("2026-08-26T00:00:00.000Z"),
  phone: null,
  passwordHash: null,
  username: "u0000000001",
  avatarUrl: null,
  isActive: true,
  isTestAccount: false,
  sessionGeneration: 0,
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
      displayName: "u0000000001",
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
  public async getSessionGeneration() {
    return 0;
  }
  public readonly refresh = new Set<string>();
  public failNextStore = false;
  public failNextRevoke = false;

  public async storeRefreshToken(userId: number, jti: string) {
    if (this.failNextStore) {
      this.failNextStore = false;
      throw new Error("refresh store failed");
    }
    this.refresh.add(`${userId}:${jti}`);
  }
  public async revokeRefreshToken(userId: number, jti: string) {
    if (this.failNextRevoke) {
      this.failNextRevoke = false;
      throw new Error("refresh revoke failed");
    }
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

const createFixture = (options: { googleAuthEnabled?: boolean } = {}) => {
  const users = [createUser()];
  const challengeStore = new InMemoryChallengeStore();
  const sessionStore = new InMemorySessionStore();
  const deliveredOtps: Array<{ email: string; otp: string }> = [];
  const loginLogs: unknown[] = [];
  const auditLogs: unknown[] = [];
  const bindings = new Map<string, GoogleBindingRecord>();
  const merchantShopContextRepository = {
    listManageableShops: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 1 })),
    resolveShop: jest.fn(async () => null),
    resolveDefaultShop: jest.fn(async ({ merchantAccountId }: { merchantAccountId: number }) =>
      merchantAccountId === 41 ? { shopId: 11, shopPublicId: "shop0000000001" } : null
    )
  };
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
        needoId: `u${String(users.length + 1).padStart(10, "0")}`,
        email: input.email,
        passwordHash: input.passwordHash,
        username: `u${String(users.length + 1).padStart(10, "0")}`
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
    {
      ...process.env,
      AUTH_GOOGLE_ENABLED: options.googleAuthEnabled ?? true
    } as never,
    repository as never,
    sessionStore as never,
    {
      sendOtp: jest.fn(async (email: string, otp: string) => {
        deliveredOtps.push({ email, otp });
      })
    },
    challengeStore as never,
    false,
    verifier,
    merchantShopContextRepository
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
    bindings,
    sessionStore,
    merchantShopContextRepository
  };
};

describe("formal Google sign-in service", () => {
  it("rejects every Google auth entry point when the capability is explicitly disabled", async () => {
    const fixture = createFixture({ googleAuthEnabled: false });
    const unavailable = {
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "error.dependency.google_auth_unavailable",
      statusCode: 503
    };
    const calls = [
      () => fixture.service.initializeGoogleLogin(),
      () => fixture.service.getGoogleLinkStatus({} as never),
      () => fixture.service.initializeAuthenticatedGoogleLink({} as never),
      () =>
        fixture.service.submitAuthenticatedGoogleLink(
          { credential: "x", nonceChallengeId: "x" },
          {} as never,
          context
        ),
      () => fixture.service.verifyAuthenticatedGoogleLink("x", "000000", {} as never, context),
      () => fixture.service.startGoogleUnlink({} as never, context),
      () => fixture.service.verifyGoogleUnlink("x", "000000", {} as never, context),
      () =>
        fixture.service.submitGoogleCredential(
          { credential: "x", nonceChallengeId: "x" },
          context
        ),
      () => fixture.service.verifyGoogleRegistrationOrLink("x", "000000", context),
      () => fixture.service.recoverGoogleUnlinkCompletion("x", "x")
    ];

    for (const call of calls) {
      await expect(call()).rejects.toMatchObject(unavailable);
    }
    expect(fixture.verifier.verify).not.toHaveBeenCalled();
    expect(fixture.repository.findUserById).not.toHaveBeenCalled();
  });

  it("accepts merchant_owner account scope and signs its deterministic shop on Google login", async () => {
    const fixture = createFixture();
    fixture.users[0].identities = [
      {
        id: 10,
        userId: 1,
        type: "merchant_owner",
        scopeType: "merchant_account",
        scopeId: 41,
        displayName: "Google Merchant",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ];
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
    if (result.status !== "authenticated") throw new Error("expected authenticated Google login");

    const payload = JSON.parse(
      Buffer.from(result.accessToken.split(".")[1], "base64url").toString("utf8")
    );
    expect(payload).toMatchObject({
      currentIdentityId: 10,
      merchantShopPublicId: "shop0000000001"
    });
    expect(fixture.merchantShopContextRepository.resolveDefaultShop).toHaveBeenCalledWith(
      expect.objectContaining({ merchantAccountId: 41 })
    );
  });

  it("rejects a linked Google identity whose non-merchant type claims merchant-account scope", async () => {
    const fixture = createFixture();
    fixture.users[0].identities = [
      {
        id: 10,
        userId: 1,
        type: "customer",
        scopeType: "merchant_account",
        scopeId: 41,
        displayName: "Malformed Google Merchant",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ];
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

    await expect(
      fixture.service.submitGoogleCredential(
        { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
        context
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
    expect(fixture.sessionStore.refresh.size).toBe(0);
  });

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

  it.each(["completeSuccessfulGoogleLogin", "completeGoogleFirstUseLink"] as const)(
    "fails closed with dependency_unavailable when Google repository capability %s is absent",
    async (capability) => {
      const fixture = createFixture();
      delete (fixture.repository as Record<string, unknown>)[capability];

      if (capability === "completeSuccessfulGoogleLogin") {
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
        await expect(
          fixture.service.submitGoogleCredential(
            { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
            context
          )
        ).rejects.toMatchObject({
          code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
          statusCode: 503,
          message: "error.dependency.google_auth_unavailable"
        });
        return;
      }

      const init = await fixture.service.initializeGoogleLogin();
      await expect(
        fixture.service.submitGoogleCredential(
          { credential: "provider-credential", nonceChallengeId: init.nonceChallengeId },
          context
        )
      ).rejects.toMatchObject({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        statusCode: 503,
        message: "error.dependency.google_auth_unavailable"
      });
    }
  );

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

    expect(created).toMatchObject({ needoId: "u0000000002" });
    expect(fixture.repository.createVerifiedBaselineCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        passwordHash: null,
        googleIdentity: expect.objectContaining({ subject: "google-subject-2" })
      })
    );
    expect(fixture.users[1].username).toBe("u0000000002");
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

  it.each([
    ["missing", "error.auth.google_credential_invalid", 401],
    ["disabled", "error.auth.account_disabled", 403],
    ["restricted", "error.auth.account_restricted", 403]
  ])(
    "revokes the exact refresh when the Google fact transaction reports %s",
    async (_reason, message, statusCode) => {
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
      fixture.repository.completeSuccessfulGoogleLogin.mockRejectedValueOnce(
        new GoogleLoginStateError(_reason as "missing" | "disabled" | "restricted")
      );
      const init = await fixture.service.initializeGoogleLogin();
      await expect(
        fixture.service.submitGoogleCredential(
          { credential: "credential", nonceChallengeId: init.nonceChallengeId },
          context
        )
      ).rejects.toMatchObject({ message, statusCode });
      expect(fixture.sessionStore.refresh.size).toBe(0);
      expect(fixture.repository.completeSuccessfulGoogleLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedUserId: 1,
          expectedIdentityId: 10,
          providerSubject: "google-subject-1"
        })
      );
    }
  );

  it("preserves a Google fact transaction error when exact refresh revoke also fails", async () => {
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
    fixture.repository.completeSuccessfulGoogleLogin.mockRejectedValueOnce(
      new Error("fact transaction failed")
    );
    fixture.sessionStore.failNextRevoke = true;
    const init = await fixture.service.initializeGoogleLogin();
    await expect(
      fixture.service.submitGoogleCredential(
        { credential: "credential", nonceChallengeId: init.nonceChallengeId },
        context
      )
    ).rejects.toThrow("fact transaction failed");
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
