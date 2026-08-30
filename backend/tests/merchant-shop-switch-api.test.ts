import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuthTokenService } from "../src/services/auth-token.service";
import { AppError } from "../src/utils/app-error";
import { MerchantShopAuditOutboxService } from "../src/services/merchant-shop-audit-outbox.service";

const SHOP_A = { shopId: 11, shopPublicId: "shop0000000001" };
const SHOP_B = { shopId: 12, shopPublicId: "shop0000000002" };

class SessionStore {
  public readonly refreshTokens = new Set<string>();
  public readonly blacklisted = new Set<string>();
  public readonly merchantShopReceipts = new Map<string, string>();
  public readonly merchantShopAuditOutbox: Array<{
    streamId: string;
    auditId: number;
    operationId: string;
    status: "completed";
    acknowledged: boolean;
  }> = [];
  public failNextMerchantShopCommitAt: "rotation" | "blacklist" | null = null;
  public concurrentAccessChecksExpected = 0;
  public legacyRotateCalls = 0;
  public legacyBlacklistCalls = 0;
  private concurrentAccessChecksSeen = 0;
  private readonly concurrentAccessCheckWaiters: Array<() => void> = [];

  public async getAccountLoginLock() {
    return false;
  }
  public async clearFailedLoginForAccount() {}
  public async storeRefreshToken(userId: number, jti: string) {
    this.refreshTokens.add(`${userId}:${jti}`);
  }
  public async hasRefreshToken(userId: number, jti: string) {
    return this.refreshTokens.has(`${userId}:${jti}`);
  }
  public async rotateRefreshToken(input: { userId: number; oldJti: string; newJti: string }) {
    this.legacyRotateCalls += 1;
    const oldKey = `${input.userId}:${input.oldJti}`;
    if (!this.refreshTokens.delete(oldKey)) return false;
    this.refreshTokens.add(`${input.userId}:${input.newJti}`);
    return true;
  }
  public async completeMerchantShopSwitch(input: {
    userId: number;
    generation: number;
    oldRefreshJti: string;
    newRefreshJti: string;
    refreshTtlSeconds: number;
    oldAccessJti: string;
    oldAccessExpiresAt: number;
    operationId: string;
    operationHash: string;
    auditId: number;
    receiptTtlSeconds: number;
  }) {
    if (this.failNextMerchantShopCommitAt) {
      const failurePoint = this.failNextMerchantShopCommitAt;
      this.failNextMerchantShopCommitAt = null;
      throw new AppError({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        message: "error.dependency.redis_unavailable",
        statusCode: 503,
        cause: new Error(`simulated atomic ${failurePoint} failure`)
      });
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    const receipt = `${input.auditId}:${input.operationHash}:completed`;
    const existingReceipt = this.merchantShopReceipts.get(input.operationId);
    if (existingReceipt === receipt) return { status: "already_committed" as const };
    if (existingReceipt) return { status: "collision" as const };
    const oldKey = `${input.userId}:${input.oldRefreshJti}`;
    if (!this.refreshTokens.has(oldKey)) {
      return { status: "rejected" as const, reason: "missing" };
    }
    this.refreshTokens.delete(oldKey);
    this.refreshTokens.add(`${input.userId}:${input.newRefreshJti}`);
    this.blacklisted.add(input.oldAccessJti);
    this.merchantShopReceipts.set(input.operationId, receipt);
    this.merchantShopAuditOutbox.push({
      streamId: `${this.merchantShopAuditOutbox.length + 1}-0`,
      auditId: input.auditId,
      operationId: input.operationId,
      status: "completed",
      acknowledged: false
    });
    return { status: "committed" as const };
  }
  public async readMerchantShopSwitchAuditOutbox() {
    return this.merchantShopAuditOutbox
      .filter((entry) => !entry.acknowledged)
      .map((entry) => ({ ...entry, kind: "completion" as const }));
  }
  public async acknowledgeMerchantShopSwitchAuditOutbox(input: { streamId: string }) {
    const event = this.merchantShopAuditOutbox.find((entry) => entry.streamId === input.streamId);
    if (event) event.acknowledged = true;
  }
  public async deadLetterMerchantShopSwitchAuditOutbox() {}
  public async revokeRefreshToken(userId: number, jti: string) {
    this.refreshTokens.delete(`${userId}:${jti}`);
  }
  public async blacklistAccessToken(jti: string) {
    this.legacyBlacklistCalls += 1;
    this.blacklisted.add(jti);
  }
  public async isAccessTokenBlacklisted(jti: string) {
    const blacklisted = this.blacklisted.has(jti);
    if (this.concurrentAccessChecksExpected > 0) {
      this.concurrentAccessChecksSeen += 1;
      if (this.concurrentAccessChecksSeen < this.concurrentAccessChecksExpected) {
        await new Promise<void>((resolve) => this.concurrentAccessCheckWaiters.push(resolve));
      } else {
        this.concurrentAccessChecksExpected = 0;
        this.concurrentAccessCheckWaiters.splice(0).forEach((resolve) => resolve());
      }
    }
    return blacklisted;
  }
}

const makeFixture = async (input?: { permission?: boolean }) => {
  const passwordHash = await hash("Merchant.2026!", 12);
  const user = {
    id: 5,
    needoId: "u1234567894",
    email: "merchant@example.com",
    emailVerifiedAt: new Date("2026-08-26T00:00:00.000Z"),
    phone: null,
    passwordHash,
    username: "Merchant Owner",
    avatarUrl: null,
    isActive: true,
    isTestAccount: false,
    sessionGeneration: 4,
    accessState: { disabled: false, restricted: false },
    lastLoginAt: null,
    deletedAt: null,
    loginIdentityId: 51,
    identities: [
      {
        id: 50,
        userId: 5,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: 5,
        displayName: "Merchant Customer",
        isDefault: false,
        isActive: true,
        deletedAt: null,
        publicIdentifier: { publicId: "u1234567894", status: "ACTIVE", deletedAt: null }
      },
      {
        id: 51,
        userId: 5,
        type: "merchant_organization",
        scopeType: "merchant_account",
        scopeId: 41,
        displayName: "Merchant Owner",
        isDefault: true,
        isActive: true,
        deletedAt: null,
        publicIdentifier: { publicId: "o1234567894", status: "ACTIVE", deletedAt: null }
      },
      {
        id: 52,
        userId: 5,
        type: "merchant",
        scopeType: "shop",
        scopeId: 11,
        displayName: "Direct Shop",
        isDefault: false,
        isActive: true,
        deletedAt: null,
        publicIdentifier: { publicId: "o1234567895", status: "ACTIVE", deletedAt: null }
      }
    ],
    identityApplications: [],
    userRoles: [
      {
        deletedAt: null,
        role: {
          code: "merchant_owner",
          deletedAt: null,
          rolePermissions: (input?.permission === false
            ? ["auth:me"]
            : ["auth:me", "auth:me:read"]
          ).map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const memberships = new Map([
    [SHOP_A.shopPublicId, SHOP_A],
    [SHOP_B.shopPublicId, SHOP_B]
  ]);
  const contextRepository = {
    listManageableShops: jest.fn(
      async (scope: { identityScopeType: string; identityScopeId: number }) => {
        const direct =
          scope.identityScopeType === "shop" && scope.identityScopeId === SHOP_A.shopId;
        return {
          list: direct
            ? [
                {
                  publicId: SHOP_A.shopPublicId,
                  name: "A",
                  city: "Tokyo",
                  status: "active",
                  selected: true
                }
              ]
            : [],
          total: direct ? 1 : 0,
          page: 1,
          page_size: 1
        };
      }
    ),
    resolveDefaultShop: jest.fn(async ({ merchantAccountId }: { merchantAccountId: number }) =>
      merchantAccountId === 41 ? (memberships.get(SHOP_A.shopPublicId) ?? null) : null
    ),
    resolveShop: jest.fn(
      async ({
        merchantAccountId,
        shopPublicId
      }: {
        merchantAccountId: number;
        shopPublicId: string;
      }) => (merchantAccountId === 41 ? (memberships.get(shopPublicId) ?? null) : null)
    )
  };
  const auditLogs: Array<Record<string, unknown> & { id: number }> = [];
  let failNextAuditCompletion = false;
  const repository = {
    findUserByLoginIdentifier: jest.fn(async (identifier: string) =>
      identifier === user.email ? user : null
    ),
    findUserById: jest.fn(async (id: number) => (id === user.id ? user : null)),
    updateLastLoginAt: jest.fn(async () => undefined),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async (entry: Record<string, unknown>) => {
      const audit = { ...entry, id: auditLogs.length + 1 };
      auditLogs.push(audit);
      return { id: audit.id };
    }),
    completeMerchantShopSwitchAudit: jest.fn(
      async ({ auditId, operationId }: { auditId: number; operationId: string }) => {
        if (failNextAuditCompletion) {
          failNextAuditCompletion = false;
          throw new Error("audit completion unavailable");
        }
        const audit = auditLogs.find((entry) => entry.id === auditId);
        if (
          !audit ||
          audit.action !== "auth.merchant_shop.switch" ||
          (audit.metadata as { operationId?: string }).operationId !== operationId
        ) {
          return false;
        }
        audit.metadata = {
          ...(audit.metadata as Record<string, unknown>),
          phase: "completed"
        };
        return true;
      }
    )
  };
  const sessions = new SessionStore();
  const outboxService = new MerchantShopAuditOutboxService(repository, sessions as never);
  const outboxTrigger = { trigger: jest.fn() };
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: repository,
    authSessionStore: sessions,
    merchantShopAuditOutboxTrigger: outboxTrigger,
    merchantShopContextRepository: contextRepository,
    otpDeliveryClient: { sendOtp: jest.fn() },
    verificationChallengeStore: {}
  } as never);

  return {
    app,
    user,
    memberships,
    contextRepository,
    sessions,
    auditLogs,
    repository,
    outboxService,
    outboxTrigger,
    failNextAuditCompletion: () => {
      failNextAuditCompletion = true;
    }
  };
};

const login = async (app: ReturnType<typeof createApp>) =>
  request(app)
    .post("/api/v1/auth/login")
    .send({ loginIdentifier: "merchant@example.com", password: "Merchant.2026!" })
    .expect(200);

describe("POST /api/v1/auth/merchant-shop/switch", () => {
  it("signs only the default merchant shop public ID during password login", async () => {
    const fixture = await makeFixture();
    const response = await login(fixture.app);
    const tokenService = new AuthTokenService(env);

    expect(tokenService.verifyAccessToken(response.body.data.accessToken)).toMatchObject({
      currentIdentityId: 51,
      merchantShopPublicId: SHOP_A.shopPublicId
    });
    expect(tokenService.verifyRefreshToken(response.body.data.refreshToken)).toMatchObject({
      currentIdentityId: 51,
      merchantShopPublicId: SHOP_A.shopPublicId
    });
    expect(
      JSON.parse(Buffer.from(response.body.data.accessToken.split(".")[1], "base64url").toString())
    ).not.toHaveProperty("shopId");

    const refreshed = await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: response.body.data.refreshToken })
      .expect(200);
    expect(tokenService.verifyAccessToken(refreshed.body.data.accessToken)).toMatchObject({
      currentIdentityId: 51,
      merchantShopPublicId: SHOP_A.shopPublicId
    });
  });

  it("rotates the merchant shop atomically, blacklists the old access token, and audits safe scope", async () => {
    const fixture = await makeFixture();
    const loggedIn = await login(fixture.app);
    const previous = loggedIn.body.data;
    const beforeMe = await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${previous.accessToken}`)
      .expect(200);

    const switched = await request(fixture.app)
      .post("/api/v1/auth/merchant-shop/switch")
      .set("Authorization", `Bearer ${previous.accessToken}`)
      .send({ refreshToken: previous.refreshToken, shopPublicId: SHOP_B.shopPublicId })
      .expect(200);

    expect(switched.body.data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: 900,
      shopPublicId: SHOP_B.shopPublicId,
      me: { currentIdentity: { id: 51, scopeType: "merchant_account", scopeId: 41 } }
    });
    expect(switched.body.data.me).toEqual(beforeMe.body.data);
    const serialized = JSON.stringify({
      accessToken: switched.body.data.accessToken,
      refreshToken: switched.body.data.refreshToken,
      shopPublicId: switched.body.data.shopPublicId
    });
    expect(serialized).not.toMatch(/shopId|merchantAccountId|membershipId/);

    const tokenService = new AuthTokenService(env);
    expect(tokenService.verifyAccessToken(switched.body.data.accessToken)).toMatchObject({
      merchantShopPublicId: SHOP_B.shopPublicId
    });
    expect(tokenService.verifyRefreshToken(switched.body.data.refreshToken)).toMatchObject({
      merchantShopPublicId: SHOP_B.shopPublicId
    });
    expect(fixture.sessions.legacyRotateCalls).toBe(0);
    expect(fixture.sessions.legacyBlacklistCalls).toBe(0);
    expect(fixture.outboxTrigger.trigger).toHaveBeenCalled();
    expect((fixture.auditLogs[0]?.metadata as { phase?: string }).phase).toBe("authorized_attempt");
    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${previous.accessToken}`)
      .expect(401);
    await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: previous.refreshToken })
      .expect(401);
    await fixture.outboxService.drain();
    expect(fixture.auditLogs).toContainEqual(
      expect.objectContaining({
        action: "auth.merchant_shop.switch",
        targetType: "Shop",
        targetId: null,
        metadata: expect.objectContaining({
          phase: "completed",
          operationId: expect.any(String),
          previousShopPublicId: SHOP_A.shopPublicId,
          nextShopPublicId: SHOP_B.shopPublicId,
          shopId: SHOP_B.shopId
        })
      })
    );
    expect(fixture.sessions.merchantShopAuditOutbox).toEqual([
      expect.objectContaining({
        auditId: fixture.auditLogs[0]?.id,
        operationId: expect.any(String),
        status: "completed",
        acknowledged: true
      })
    ]);
    expect(JSON.stringify(switched.body)).not.toMatch(/operationId|auditId|shopId/);
  });

  it("does not mutate credentials when the durable audit attempt cannot be stored", async () => {
    const fixture = await makeFixture();
    const loggedIn = await login(fixture.app);
    const tokenService = new AuthTokenService(env);
    const oldAccess = tokenService.verifyAccessToken(loggedIn.body.data.accessToken);
    const oldRefresh = tokenService.verifyRefreshToken(loggedIn.body.data.refreshToken);
    fixture.repository.createAuditLog.mockRejectedValueOnce(new Error("audit unavailable"));

    await request(fixture.app)
      .post("/api/v1/auth/merchant-shop/switch")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .send({ refreshToken: loggedIn.body.data.refreshToken, shopPublicId: SHOP_B.shopPublicId })
      .expect(500);

    expect(fixture.auditLogs).toHaveLength(0);
    expect(fixture.sessions.refreshTokens).toEqual(
      new Set([`${fixture.user.id}:${oldRefresh.jti}`])
    );
    expect(fixture.sessions.blacklisted.has(oldAccess.jti)).toBe(false);
    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: loggedIn.body.data.refreshToken })
      .expect(200);
  });

  it.each(["rotation", "blacklist"] as const)(
    "keeps the old credentials usable when the atomic %s commit is rejected",
    async (failurePoint) => {
      const fixture = await makeFixture();
      const loggedIn = await login(fixture.app);
      const tokenService = new AuthTokenService(env);
      const oldAccess = tokenService.verifyAccessToken(loggedIn.body.data.accessToken);
      const oldRefresh = tokenService.verifyRefreshToken(loggedIn.body.data.refreshToken);
      fixture.sessions.failNextMerchantShopCommitAt = failurePoint;

      await request(fixture.app)
        .post("/api/v1/auth/merchant-shop/switch")
        .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
        .send({ refreshToken: loggedIn.body.data.refreshToken, shopPublicId: SHOP_B.shopPublicId })
        .expect(503);

      expect(fixture.sessions.refreshTokens).toEqual(
        new Set([`${fixture.user.id}:${oldRefresh.jti}`])
      );
      expect(fixture.sessions.blacklisted.has(oldAccess.jti)).toBe(false);
      expect(fixture.auditLogs).toContainEqual(
        expect.objectContaining({
          action: "auth.merchant_shop.switch",
          metadata: expect.objectContaining({ phase: "authorized_attempt" })
        })
      );
      await request(fixture.app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
        .expect(200);
      await request(fixture.app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: loggedIn.body.data.refreshToken })
        .expect(200);
    }
  );

  it("allows at most one concurrent request to commit the same merchant shop switch", async () => {
    const fixture = await makeFixture();
    const loggedIn = await login(fixture.app);
    fixture.sessions.concurrentAccessChecksExpected = 2;

    const responses = await Promise.all([
      request(fixture.app)
        .post("/api/v1/auth/merchant-shop/switch")
        .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
        .send({ refreshToken: loggedIn.body.data.refreshToken, shopPublicId: SHOP_B.shopPublicId }),
      request(fixture.app)
        .post("/api/v1/auth/merchant-shop/switch")
        .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
        .send({ refreshToken: loggedIn.body.data.refreshToken, shopPublicId: SHOP_B.shopPublicId })
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    const successful = responses.find((response) => response.status === 200)!;
    const refreshPayload = new AuthTokenService(env).verifyRefreshToken(
      successful.body.data.refreshToken
    );
    expect(fixture.sessions.refreshTokens).toEqual(
      new Set([`${fixture.user.id}:${refreshPayload.jti}`])
    );
    expect(fixture.auditLogs).toHaveLength(2);
    await fixture.outboxService.drain();
    expect(
      fixture.auditLogs.filter(
        (entry) => (entry.metadata as { phase?: string }).phase === "completed"
      )
    ).toHaveLength(1);
    expect(
      fixture.auditLogs.filter(
        (entry) => (entry.metadata as { phase?: string }).phase === "authorized_attempt"
      )
    ).toHaveLength(1);
    expect(fixture.sessions.merchantShopAuditOutbox).toEqual([
      expect.objectContaining({ acknowledged: true })
    ]);
  });

  it("returns committed credentials when audit completion fails and retries the outbox later", async () => {
    const fixture = await makeFixture();
    const loggedIn = await login(fixture.app);
    fixture.failNextAuditCompletion();

    const switched = await request(fixture.app)
      .post("/api/v1/auth/merchant-shop/switch")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .send({ refreshToken: loggedIn.body.data.refreshToken, shopPublicId: SHOP_B.shopPublicId })
      .expect(200);

    await fixture.outboxService.drain();
    expect((fixture.auditLogs[0]?.metadata as { phase?: string }).phase).toBe("authorized_attempt");
    expect(fixture.sessions.merchantShopAuditOutbox).toEqual([
      expect.objectContaining({ acknowledged: false })
    ]);

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${switched.body.data.accessToken}`)
      .expect(200);

    await fixture.outboxService.drain();
    expect((fixture.auditLogs[0]?.metadata as { phase?: string }).phase).toBe("completed");
    expect(fixture.sessions.merchantShopAuditOutbox).toEqual([
      expect.objectContaining({ acknowledged: true })
    ]);
  });

  it("fails closed with the stable identity error for revoked or cross-account membership", async () => {
    const fixture = await makeFixture();
    const loggedIn = await login(fixture.app);
    fixture.memberships.delete(SHOP_B.shopPublicId);

    await request(fixture.app)
      .post("/api/v1/auth/merchant-shop/switch")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .send({ refreshToken: loggedIn.body.data.refreshToken, shopPublicId: SHOP_B.shopPublicId })
      .expect(403)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: ERROR_CODES.IDENTITY_FORBIDDEN,
          message: "error.identity.forbidden",
          data: null
        });
      });
  });

  it("rejects non-merchant identities, missing permission, and non-strict input", async () => {
    const missingPermission = await makeFixture({ permission: false });
    const deniedLogin = await login(missingPermission.app);
    await request(missingPermission.app)
      .post("/api/v1/auth/merchant-shop/switch")
      .set("Authorization", `Bearer ${deniedLogin.body.data.accessToken}`)
      .send({ refreshToken: deniedLogin.body.data.refreshToken, shopPublicId: SHOP_B.shopPublicId })
      .expect(403);

    const fixture = await makeFixture();
    const loggedIn = await login(fixture.app);
    await request(fixture.app)
      .post("/api/v1/auth/merchant-shop/switch")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .send({
        refreshToken: loggedIn.body.data.refreshToken,
        shopPublicId: SHOP_B.shopPublicId,
        shopId: SHOP_B.shopId
      })
      .expect(400);

    fixture.user.loginIdentityId = 50;
    const customerLogin = await login(fixture.app);
    await request(fixture.app)
      .post("/api/v1/auth/merchant-shop/switch")
      .set("Authorization", `Bearer ${customerLogin.body.data.accessToken}`)
      .send({
        refreshToken: customerLogin.body.data.refreshToken,
        shopPublicId: SHOP_B.shopPublicId
      })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe(ERROR_CODES.IDENTITY_FORBIDDEN));
  });

  it("re-resolves membership on refresh and fails after revocation", async () => {
    const fixture = await makeFixture();
    const loggedIn = await login(fixture.app);
    fixture.memberships.delete(SHOP_A.shopPublicId);

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe(ERROR_CODES.IDENTITY_FORBIDDEN);
        expect(body.message).toBe("error.identity.forbidden");
      });

    await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: loggedIn.body.data.refreshToken })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe(ERROR_CODES.IDENTITY_FORBIDDEN);
        expect(body.message).toBe("error.identity.forbidden");
      });
  });

  it("keeps a direct shop identity fixed to itself without a merchant-account claim", async () => {
    const fixture = await makeFixture();
    fixture.user.loginIdentityId = 52;
    const loggedIn = await login(fixture.app);
    const tokenService = new AuthTokenService(env);

    expect(tokenService.verifyAccessToken(loggedIn.body.data.accessToken)).toMatchObject({
      currentIdentityId: 52
    });
    expect(tokenService.verifyAccessToken(loggedIn.body.data.accessToken)).not.toHaveProperty(
      "merchantShopPublicId"
    );
    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.currentIdentity).toMatchObject({
          scopeType: "shop",
          scopeId: SHOP_A.shopId
        });
      });
    expect(fixture.contextRepository.listManageableShops).toHaveBeenCalledWith(
      expect.objectContaining({ identityScopeType: "shop", identityScopeId: SHOP_A.shopId })
    );
  });

  it("selects the deterministic default on entering merchant and clears the claim on leaving", async () => {
    const fixture = await makeFixture();
    fixture.user.loginIdentityId = 50;
    const loggedIn = await login(fixture.app);
    const tokenService = new AuthTokenService(env);

    const entered = await request(fixture.app)
      .post("/api/v1/auth/switch-identity")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .send({ refreshToken: loggedIn.body.data.refreshToken, identityId: 51 })
      .expect(200);
    expect(tokenService.verifyAccessToken(entered.body.data.accessToken)).toMatchObject({
      currentIdentityId: 51,
      merchantShopPublicId: SHOP_A.shopPublicId
    });

    const left = await request(fixture.app)
      .post("/api/v1/auth/switch-identity")
      .set("Authorization", `Bearer ${entered.body.data.accessToken}`)
      .send({ refreshToken: entered.body.data.refreshToken, identityId: 50 })
      .expect(200);
    expect(tokenService.verifyAccessToken(left.body.data.accessToken)).toMatchObject({
      currentIdentityId: 50
    });
    expect(tokenService.verifyAccessToken(left.body.data.accessToken)).not.toHaveProperty(
      "merchantShopPublicId"
    );
    expect(tokenService.verifyRefreshToken(left.body.data.refreshToken)).not.toHaveProperty(
      "merchantShopPublicId"
    );
  });

  it("rejects a refresh token from a different current identity", async () => {
    const fixture = await makeFixture();
    const loggedIn = await login(fixture.app);
    const tokenService = new AuthTokenService(env);
    const mismatchedRefresh = tokenService.issueRefreshToken({
      id: fixture.user.id,
      email: fixture.user.email,
      currentIdentityId: 50,
      sessionGeneration: fixture.user.sessionGeneration
    });
    await fixture.sessions.storeRefreshToken(fixture.user.id, mismatchedRefresh.jti);

    await request(fixture.app)
      .post("/api/v1/auth/merchant-shop/switch")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .send({ refreshToken: mismatchedRefresh.token, shopPublicId: SHOP_B.shopPublicId })
      .expect(401)
      .expect(({ body }) => expect(body.code).toBe(ERROR_CODES.TOKEN_INVALID));
  });

  it.each([
    [51, "customer", "merchant_account"],
    [52, "technician", "shop"],
    [52, "merchant_organization", "shop"]
  ])(
    "rejects malformed merchant pairing identity %s type %s with scope %s during password login",
    async (identityId, type) => {
      const fixture = await makeFixture();
      fixture.user.loginIdentityId = identityId;
      fixture.user.identities.find((identity) => identity.id === identityId)!.type = type;

      await request(fixture.app)
        .post("/api/v1/auth/login")
        .send({ loginIdentifier: fixture.user.email, password: "Merchant.2026!" })
        .expect(403)
        .expect(({ body }) => {
          expect(body.code).toBe(ERROR_CODES.IDENTITY_FORBIDDEN);
          expect(body.message).toBe("error.identity.forbidden");
        });
    }
  );

  it("accepts the compatible merchant_owner and merchant_account pair on login and refresh", async () => {
    const fixture = await makeFixture();
    fixture.user.identities.find((identity) => identity.id === 51)!.type = "merchant_owner";

    const loggedIn = await login(fixture.app);
    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: loggedIn.body.data.refreshToken })
      .expect(200);
  });

  it("keeps a compatible merchant organization global identity usable without a shop claim", async () => {
    const fixture = await makeFixture();
    const identity = fixture.user.identities.find((candidate) => candidate.id === 51)!;
    Object.assign(identity, { scopeType: "global", scopeId: null });

    const loggedIn = await login(fixture.app);
    const tokenService = new AuthTokenService(env);
    expect(tokenService.verifyAccessToken(loggedIn.body.data.accessToken)).not.toHaveProperty(
      "merchantShopPublicId"
    );
    expect(fixture.contextRepository.resolveDefaultShop).not.toHaveBeenCalled();
    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: loggedIn.body.data.refreshToken })
      .expect(200);
  });

  it("uses the same merchant type/scope pairing rule on authenticate and refresh", async () => {
    const fixture = await makeFixture();
    const loggedIn = await login(fixture.app);
    fixture.user.identities.find((identity) => identity.id === 51)!.type = "customer";

    await request(fixture.app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe(ERROR_CODES.IDENTITY_FORBIDDEN));
    await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: loggedIn.body.data.refreshToken })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe(ERROR_CODES.IDENTITY_FORBIDDEN));
  });

  it("uses the same merchant type/scope pairing rule when switching identity", async () => {
    const fixture = await makeFixture();
    fixture.user.loginIdentityId = 50;
    fixture.user.identities.find((identity) => identity.id === 51)!.type = "customer";
    const loggedIn = await login(fixture.app);

    await request(fixture.app)
      .post("/api/v1/auth/switch-identity")
      .set("Authorization", `Bearer ${loggedIn.body.data.accessToken}`)
      .send({ refreshToken: loggedIn.body.data.refreshToken, identityId: 51 })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe(ERROR_CODES.IDENTITY_FORBIDDEN));
  });
});
