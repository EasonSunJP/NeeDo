import { createHmac, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env";
import { createRedisClient, type RedisClient } from "../src/config/redis";
import { AuthRepository } from "../src/repositories/auth.repository";
import { RedisAuthSessionStore, type AuthSessionStore } from "../src/services/auth-session.store";
import { AuthTokenService } from "../src/services/auth-token.service";
import { AuthService, type AuthenticatedAccessContext } from "../src/services/auth.service";
import { RedisVerificationChallengeStore } from "../src/services/auth-verification-challenge.store";

const marker = `account-security-${randomUUID()}`;
const enabled = process.env.RUN_ACCOUNT_SECURITY_RECOVERY_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;

const assertNeedoTest = () => {
  const envFile = process.env.ENV_FILE?.trim();
  const loaded = envFile ? loadDotenv({ path: envFile }) : undefined;
  const url = process.env.DATABASE_URL ?? loaded?.parsed?.DATABASE_URL;
  if (!url) throw new Error("Account-security integration requires a database URL");
  const parsed = new URL(url);
  if (
    parsed.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname) ||
    parsed.pathname.replace(/^\/+/, "") !== "needo_test"
  ) {
    throw new Error("Account-security integration requires local needo_test");
  }
};

const cooldownKey = (email: string, purpose: string) =>
  `auth:verification:cooldown:${createHmac("sha256", env.AUTH_VERIFICATION_SECRET)
    .update("email")
    .update("\u0000")
    .update(purpose)
    .update("\u0000")
    .update(email.trim().toLowerCase())
    .digest("base64url")}`;

describeIntegration("formal account-security recovery integration", () => {
  let prisma: PrismaClient;
  let redis: RedisClient;
  const userIds: number[] = [];
  const challengeIds: string[] = [];
  const nonceChallengeIds: string[] = [];
  const emails: string[] = [];
  const refreshes: Array<{ userId: number; jti: string }> = [];

  afterAll(async () => {
    if (prisma && userIds.length) {
      await prisma.$transaction(async (transaction) => {
        await transaction.auditLog.deleteMany({
          where: {
            targetType: "User",
            targetId: { in: userIds },
            OR: [
              {
                action: "auth.register",
                actorId: { in: userIds },
                targetId: { in: userIds }
              },
              {
                action: { in: ["auth.google.link", "auth.google.unlink", "auth.password.setup"] },
                targetId: { in: userIds },
                OR: challengeIds.map((challengeId) => ({
                  metadata: { path: "$.challengeId", equals: challengeId }
                }))
              }
            ]
          }
        });
        await transaction.loginLog.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.externalAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.userRole.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.userIdentity.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.user.deleteMany({ where: { id: { in: userIds } } });
      });
      expect(await prisma.user.count({ where: { email: { startsWith: marker } } })).toBe(0);
      expect(
        await prisma.externalAuthAccount.count({
          where: { providerSubject: { startsWith: marker } }
        })
      ).toBe(0);
    }
    if (redis?.isOpen) {
      const sessions = new RedisAuthSessionStore(() => redis);
      for (const refresh of refreshes)
        await sessions.revokeRefreshToken(refresh.userId, refresh.jti);
      const keys = [
        ...challengeIds.map((id) => `auth:verification:email:${id}`),
        ...challengeIds.map((id) => `auth:verification:unlink-complete:${id}`),
        ...nonceChallengeIds.map((id) => `auth:verification:google-nonce:${id}`),
        ...userIds.map((id) => `auth:v2:session:generation:${id}`),
        ...userIds.map((id) => `auth:v2:refresh:user:${id}`),
        ...emails.flatMap((email) => [
          cooldownKey(email, "google_authenticated_link"),
          cooldownKey(email, "google_unlink"),
          cooldownKey(email, "password_setup")
        ]),
        `token:blacklist:${marker}`
      ];
      await redis.del(keys);
      expect(await redis.exists(keys)).toBe(0);
      const markerKeys: string[] = [];
      for await (const values of redis.scanIterator({ MATCH: `*${marker}*` }))
        markerKeys.push(...values);
      expect(markerKeys).toEqual([]);
      await redis.quit();
    }
    if (prisma) {
      const { disconnectPrisma } = await import("../src/prisma/client");
      await disconnectPrisma();
    }
  });

  it("recovers an authenticated link and unlink after a post-commit session failure", async () => {
    assertNeedoTest();
    const module = await import("../src/prisma/client");
    prisma = module.prisma;
    redis = createRedisClient();
    await redis.connect();
    const email = `${marker}@needo.test`;
    const subject = `${marker}-subject`;
    emails.push(email);
    const repository = new AuthRepository(prisma);
    const account = await repository.createVerifiedBaselineCustomer({
      email,
      passwordHash: await hash("StrongPass1!", 12),
      emailVerifiedAt: new Date(),
      context: { ip: "127.0.0.1" }
    });
    userIds.push(account.id);
    const challenges = new RedisVerificationChallengeStore(() => redis);
    const baseSessions = new RedisAuthSessionStore(() => redis);
    const delivered: string[] = [];
    let failCompletion = true;
    const sessions = new Proxy(baseSessions, {
      get(target, property, receiver) {
        if (property === "completeGoogleUnlink") {
          return async (...args: Parameters<RedisAuthSessionStore["completeGoogleUnlink"]>) => {
            if (failCompletion) {
              failCompletion = false;
              throw new Error("injected unlink completion failure");
            }
            return target.completeGoogleUnlink(...args);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as AuthSessionStore;
    const service = new AuthService(
      env,
      repository,
      sessions,
      { sendOtp: async (_email, otp) => void delivered.push(otp) },
      challenges,
      false,
      {
        verify: async () => ({
          subject,
          email: `${marker}-different-google@needo.test`,
          emailVerifiedAt: new Date(),
          name: null,
          pictureUrl: null
        })
      }
    );
    const auth: AuthenticatedAccessContext = {
      userId: account.id,
      email,
      accessTokenJti: marker,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 300,
      roles: [],
      permissions: []
    };
    await baseSessions.storeRefreshToken(account.id, `${marker}-refresh-a`, 300);
    await baseSessions.storeRefreshToken(account.id, `${marker}-refresh-b`, 300);
    refreshes.push(
      { userId: account.id, jti: `${marker}-refresh-a` },
      { userId: account.id, jti: `${marker}-refresh-b` }
    );

    const nonce = await service.initializeAuthenticatedGoogleLink(auth);
    nonceChallengeIds.push(nonce.nonceChallengeId);
    const link = await service.submitAuthenticatedGoogleLink(
      { credential: "injected-credential", nonceChallengeId: nonce.nonceChallengeId },
      auth,
      { ip: "127.0.0.1" }
    );
    challengeIds.push(link.challengeId);
    expect(delivered).toHaveLength(1);
    await expect(
      service.verifyAuthenticatedGoogleLink(link.challengeId, delivered[0], auth, {
        ip: "127.0.0.1"
      })
    ).resolves.toEqual({ linked: true });
    const binding = await prisma.externalAuthAccount.findFirstOrThrow({
      where: { userId: account.id, providerSubject: subject, deletedAt: null }
    });
    expect(binding.providerEmail).toBe(`${marker}-different-google@needo.test`);
    expect(binding.lastUsedAt).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: {
          action: "auth.google.link",
          targetId: account.id,
          metadata: { path: "$.challengeId", equals: link.challengeId }
        }
      })
    ).toBe(1);

    const unlink = await service.startGoogleUnlink(auth, { ip: "127.0.0.1" });
    challengeIds.push(unlink.challengeId);
    await expect(
      service.verifyGoogleUnlink(unlink.challengeId, delivered[1], auth, { ip: "127.0.0.1" })
    ).rejects.toThrow("injected unlink completion failure");
    expect(
      await prisma.externalAuthAccount.count({
        where: { id: binding.id, deletedAt: { not: null } }
      })
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "auth.google.unlink",
          targetId: account.id,
          metadata: { path: "$.challengeId", equals: unlink.challengeId }
        }
      })
    ).toBe(1);
    await expect(
      service.verifyGoogleUnlink(unlink.challengeId, delivered[1], auth, { ip: "127.0.0.1" })
    ).resolves.toEqual({ signedOut: true });
    expect(await baseSessions.hasRefreshToken(account.id, `${marker}-refresh-a`)).toBe(false);
    expect(await baseSessions.hasRefreshToken(account.id, `${marker}-refresh-b`)).toBe(false);
    expect(await baseSessions.isAccessTokenBlacklisted(marker)).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "auth.google.unlink",
          targetId: account.id,
          metadata: { path: "$.challengeId", equals: unlink.challengeId }
        }
      })
    ).toBe(1);
  }, 15_000);

  it("stores only a bcrypt password hash through verified password setup", async () => {
    assertNeedoTest();
    const email = `${marker}-google-only@needo.test`;
    emails.push(email);
    const repository = new AuthRepository(prisma);
    const account = await repository.createVerifiedBaselineCustomer({
      email,
      passwordHash: null,
      emailVerifiedAt: new Date(),
      context: { ip: "127.0.0.1" },
      googleIdentity: { subject: `${marker}-password-subject`, email, emailVerifiedAt: new Date() }
    });
    userIds.push(account.id);
    const challenges = new RedisVerificationChallengeStore(() => redis);
    const delivered: string[] = [];
    const service = new AuthService(
      env,
      repository,
      new RedisAuthSessionStore(() => redis),
      { sendOtp: async (_email, otp) => void delivered.push(otp) },
      challenges,
      false,
      {
        verify: async () => {
          throw new Error("not used");
        }
      }
    );
    const auth: AuthenticatedAccessContext = {
      userId: account.id,
      email,
      accessTokenJti: `${marker}-password-access`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 300,
      roles: [],
      permissions: []
    };
    const setup = await service.startPasswordSetup("StrongPass1!", auth, { ip: "127.0.0.1" });
    challengeIds.push(setup.challengeId);
    await expect(
      service.verifyPasswordSetup(setup.challengeId, delivered[0], auth, { ip: "127.0.0.1" })
    ).resolves.toEqual({ hasPassword: true });
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(persisted.passwordHash).not.toContain("StrongPass1!");
    await expect(compare("StrongPass1!", persisted.passwordHash!)).resolves.toBe(true);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "auth.password.setup",
          targetId: account.id,
          metadata: { path: "$.challengeId", equals: setup.challengeId }
        }
      })
    ).toBe(1);
  }, 15_000);

  it("recovers a committed unlink after its Redis reply is lost without reviving the old token", async () => {
    assertNeedoTest();
    const email = `${marker}-lost-reply@needo.test`;
    const subject = `${marker}-lost-reply-subject`;
    emails.push(email);
    const repository = new AuthRepository(prisma);
    const account = await repository.createVerifiedBaselineCustomer({
      email,
      passwordHash: await hash("StrongPass1!", 12),
      emailVerifiedAt: new Date(),
      context: { ip: "127.0.0.1" },
      googleIdentity: { subject, email, emailVerifiedAt: new Date() }
    });
    userIds.push(account.id);
    const challenges = new RedisVerificationChallengeStore(() => redis);
    const baseSessions = new RedisAuthSessionStore(() => redis);
    const tokens = new AuthTokenService(env);
    const access = tokens.issueAccessToken({
      id: account.id,
      email,
      currentIdentityId: account.identities[0].id,
      sessionGeneration: 0
    });
    const refresh = tokens.issueRefreshToken({
      id: account.id,
      email,
      currentIdentityId: account.identities[0].id,
      sessionGeneration: 0
    });
    refreshes.push({ userId: account.id, jti: refresh.jti });
    await baseSessions.storeRefreshToken(account.id, refresh.jti, 300, 0);
    let loseReply = true;
    const sessions = new Proxy(baseSessions, {
      get(target, property, receiver) {
        if (property === "completeGoogleUnlink") {
          return async (...args: Parameters<RedisAuthSessionStore["completeGoogleUnlink"]>) => {
            const completed = await target.completeGoogleUnlink(...args);
            if (loseReply) {
              loseReply = false;
              throw new Error("simulated Redis reply loss after Lua commit");
            }
            return completed;
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as AuthSessionStore;
    const delivered: string[] = [];
    const service = new AuthService(
      env,
      repository,
      sessions,
      { sendOtp: async (_email, otp) => void delivered.push(otp) },
      challenges,
      false
    );
    const auth: AuthenticatedAccessContext = {
      userId: account.id,
      email,
      accessTokenJti: access.jti,
      accessTokenExpiresAt: access.expiresAt,
      sessionGeneration: 0,
      roles: [],
      permissions: []
    };
    const unlink = await service.startGoogleUnlink(auth, { ip: "127.0.0.1" });
    challengeIds.push(unlink.challengeId);
    await expect(
      service.verifyGoogleUnlink(unlink.challengeId, delivered[0], auth, { ip: "127.0.0.1" })
    ).rejects.toThrow("simulated Redis reply loss after Lua commit");
    await expect(service.authenticateAccessToken(access.token)).rejects.toMatchObject({
      statusCode: 401
    });
    await expect(service.refresh(refresh.token)).rejects.toMatchObject({ statusCode: 401 });
    await redis.del(`auth:v2:session:generation:${account.id}`);
    await expect(service.authenticateAccessToken(access.token)).rejects.toMatchObject({
      statusCode: 401
    });
    await expect(service.refresh(refresh.token)).rejects.toMatchObject({ statusCode: 401 });
    const recovery = await service.authenticateGoogleUnlinkRecovery(
      access.token,
      unlink.challengeId
    );
    expect(recovery).toMatchObject({
      userId: account.id,
      isGoogleUnlinkRecovery: true,
      roles: [],
      permissions: []
    });
    await expect(
      service.verifyGoogleUnlink(unlink.challengeId, delivered[0], recovery, { ip: "127.0.0.1" })
    ).resolves.toEqual({ signedOut: true });
  }, 15_000);

  it("leaves no usable old-generation session when unlink races refresh rotation in real Redis", async () => {
    assertNeedoTest();
    const email = `${marker}-session-race@needo.test`;
    const oldJti = `${marker}-session-race-old`;
    const newJti = `${marker}-session-race-new`;
    emails.push(email);
    refreshes.push({ userId: 0, jti: oldJti }, { userId: 0, jti: newJti });
    const repository = new AuthRepository(prisma);
    const account = await repository.createVerifiedBaselineCustomer({
      email,
      passwordHash: await hash("StrongPass1!", 12),
      emailVerifiedAt: new Date(),
      context: { ip: "127.0.0.1" }
    });
    userIds.push(account.id);
    refreshes[refreshes.length - 2].userId = account.id;
    refreshes[refreshes.length - 1].userId = account.id;
    const challenges = new RedisVerificationChallengeStore(() => redis);
    const sessions = new RedisAuthSessionStore(() => redis);
    const challenge = await challenges.createEmailChallenge({
      email,
      otp: "123456",
      purpose: "google_unlink",
      userId: account.id
    });
    challengeIds.push(challenge.challengeId);
    const reserved = await challenges.reserveEmailChallenge({
      challengeId: challenge.challengeId,
      otp: "123456",
      purpose: "google_unlink",
      userId: account.id
    });
    if (!reserved.ok) throw new Error("unlink race challenge was not reserved");
    await expect(sessions.storeRefreshToken(account.id, oldJti, 300, 0)).resolves.toBe(true);
    const tokenService = new AuthTokenService(env);
    const oldAccess = tokenService.issueAccessToken({
      id: account.id,
      email,
      currentIdentityId: account.identities[0].id,
      sessionGeneration: 0
    });
    const service = new AuthService(
      env,
      repository,
      sessions,
      { sendOtp: async () => undefined },
      challenges,
      false
    );
    await expect(service.authenticateAccessToken(oldAccess.token)).resolves.toMatchObject({
      userId: account.id,
      sessionGeneration: 0
    });

    const [rotation, completion] = await Promise.all([
      sessions.rotateRefreshToken({
        userId: account.id,
        generation: 0,
        oldJti,
        newJti,
        ttlSeconds: 300
      }),
      sessions.completeGoogleUnlink({
        userId: account.id,
        challengeId: challenge.challengeId,
        reservationToken: reserved.reservationToken,
        accessTokenJti: oldAccess.jti,
        accessTokenTtlSeconds: oldAccess.expiresIn,
        sessionGeneration: 1
      })
    ]);
    expect(completion).toBe(true);
    expect(await sessions.getSessionGeneration(account.id)).toBe(1);
    expect(await sessions.hasRefreshToken(account.id, oldJti)).toBe(false);
    expect(await sessions.hasRefreshToken(account.id, newJti)).toBe(false);
    expect(rotation === true || rotation === false).toBe(true);
    await expect(service.authenticateAccessToken(oldAccess.token)).rejects.toMatchObject({
      statusCode: 401
    });
  }, 15_000);

  it("keeps the first password setup and one active Google identity under concurrent challenges", async () => {
    assertNeedoTest();
    const email = `${marker}-cas@needo.test`;
    const subject = `${marker}-single-provider`;
    const alternateSubject = `${marker}-alternate-provider`;
    const firstChallengeId = `${marker}-password-first`;
    const secondChallengeId = `${marker}-password-second`;
    emails.push(email);
    challengeIds.push(firstChallengeId, secondChallengeId);
    const repository = new AuthRepository(prisma);
    const account = await repository.createVerifiedBaselineCustomer({
      email,
      passwordHash: null,
      emailVerifiedAt: new Date(),
      context: { ip: "127.0.0.1" },
      googleIdentity: { subject, email, emailVerifiedAt: new Date() }
    });
    userIds.push(account.id);
    const [firstHash, secondHash] = await Promise.all([
      hash("FirstStrongPass1!", 12),
      hash("SecondStrongPass1!", 12)
    ]);

    const completed = await Promise.allSettled([
      repository.completePasswordSetup({
        challengeId: firstChallengeId,
        userId: account.id,
        passwordHash: firstHash,
        context: { ip: "127.0.0.1" }
      }),
      repository.completePasswordSetup({
        challengeId: secondChallengeId,
        userId: account.id,
        passwordHash: secondHash,
        context: { ip: "127.0.0.1" }
      })
    ]);
    expect(completed.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(completed.filter((result) => result.status === "rejected")).toHaveLength(1);
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect([firstHash, secondHash]).toContain(persisted.passwordHash);
    const establishedHash = persisted.passwordHash;
    const fulfilledIndex = completed.findIndex((result) => result.status === "fulfilled");
    const fulfilledChallengeId = [firstChallengeId, secondChallengeId][fulfilledIndex];
    await repository.completePasswordSetup({
      challengeId: fulfilledChallengeId,
      userId: account.id,
      passwordHash: firstHash === establishedHash ? secondHash : firstHash,
      context: { ip: "127.0.0.1" }
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).passwordHash).toBe(
      establishedHash
    );

    await expect(
      repository.completeAuthenticatedGoogleLink({
        challengeId: `${marker}-second-subject`,
        userId: account.id,
        googleIdentity: {
          subject: alternateSubject,
          email: `${marker}-alternate@needo.test`,
          emailVerifiedAt: new Date()
        },
        context: { ip: "127.0.0.1" }
      })
    ).rejects.toMatchObject({ name: "ExternalAuthAccountConflictError" });
    expect(
      await prisma.externalAuthAccount.count({
        where: { userId: account.id, provider: "google", deletedAt: null }
      })
    ).toBe(1);

    const concurrentEmail = `${marker}-concurrent-provider@needo.test`;
    const concurrentChallengeA = `${marker}-concurrent-provider-a`;
    const concurrentChallengeB = `${marker}-concurrent-provider-b`;
    emails.push(concurrentEmail);
    challengeIds.push(concurrentChallengeA, concurrentChallengeB);
    const concurrentAccount = await repository.createVerifiedBaselineCustomer({
      email: concurrentEmail,
      passwordHash: await hash("StrongPass1!", 12),
      emailVerifiedAt: new Date(),
      context: { ip: "127.0.0.1" }
    });
    userIds.push(concurrentAccount.id);
    const concurrentLinks = await Promise.allSettled([
      repository.completeAuthenticatedGoogleLink({
        challengeId: concurrentChallengeA,
        userId: concurrentAccount.id,
        googleIdentity: {
          subject: `${marker}-concurrent-subject-a`,
          email: `${marker}-concurrent-a@needo.test`,
          emailVerifiedAt: new Date()
        },
        context: { ip: "127.0.0.1" }
      }),
      repository.completeAuthenticatedGoogleLink({
        challengeId: concurrentChallengeB,
        userId: concurrentAccount.id,
        googleIdentity: {
          subject: `${marker}-concurrent-subject-b`,
          email: `${marker}-concurrent-b@needo.test`,
          emailVerifiedAt: new Date()
        },
        context: { ip: "127.0.0.1" }
      })
    ]);
    expect(concurrentLinks.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrentLinks.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      await prisma.externalAuthAccount.count({
        where: { userId: concurrentAccount.id, provider: "google", deletedAt: null }
      })
    ).toBe(1);
  }, 15_000);
});
