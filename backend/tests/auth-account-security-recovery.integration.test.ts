import { createHmac, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env";
import { createRedisClient, type RedisClient } from "../src/config/redis";
import { AuthRepository } from "../src/repositories/auth.repository";
import { RedisAuthSessionStore, type AuthSessionStore } from "../src/services/auth-session.store";
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
          where: { OR: [{ actorId: { in: userIds } }, { targetId: { in: userIds } }] }
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
        ...nonceChallengeIds.map((id) => `auth:verification:google-nonce:${id}`),
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
    let failRevokeAll = true;
    const sessions = new Proxy(baseSessions, {
      get(target, property, receiver) {
        if (property === "revokeAllRefreshTokens") {
          return async (userId: number) => {
            if (failRevokeAll) {
              failRevokeAll = false;
              throw new Error("injected revoke-all failure");
            }
            return target.revokeAllRefreshTokens(userId);
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
    ).rejects.toThrow("injected revoke-all failure");
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
});
