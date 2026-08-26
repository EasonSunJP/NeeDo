import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env";
import { createRedisClient, type RedisClient } from "../src/config/redis";
import { AuthRepository } from "../src/repositories/auth.repository";
import { RedisAuthSessionStore } from "../src/services/auth-session.store";
import { AuthService } from "../src/services/auth.service";
import { RedisVerificationChallengeStore } from "../src/services/auth-verification-challenge.store";

const marker = `google-auth-recovery-${randomUUID()}`;
const email = `${marker}@needo.test`;
const subject = `${marker}-subject`;
const enabled = Boolean(process.env.ENV_FILE?.trim());
const describeIntegration = enabled ? describe : describe.skip;

const assertNeedoTest = () => {
  const loaded = loadDotenv({ path: process.env.ENV_FILE, override: true });
  const url = loaded.parsed?.DATABASE_URL;
  if (!url) throw new Error("Google recovery integration requires ENV_FILE DATABASE_URL");
  const parsed = new URL(url);
  if (
    parsed.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname) ||
    parsed.pathname.replace(/^\/+/, "") !== "needo_test"
  )
    throw new Error("Google recovery integration requires local needo_test");
};

describeIntegration("formal Google recovery integration", () => {
  let prisma: PrismaClient;
  let redis: RedisClient;
  const userIds: number[] = [];
  const challengeIds: string[] = [];
  const refreshes: Array<{ userId: number; jti: string }> = [];

  afterAll(async () => {
    if (prisma && userIds.length) {
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.deleteMany({
          where: { OR: [{ actorId: { in: userIds } }, { targetId: { in: userIds } }] }
        });
        await tx.loginLog.deleteMany({ where: { userId: { in: userIds } } });
        await tx.externalAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userIdentity.deleteMany({ where: { userId: { in: userIds } } });
        await tx.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      });
      expect(await prisma.user.count({ where: { email: { startsWith: marker } } })).toBe(0);
      expect(
        await prisma.externalAuthAccount.count({
          where: { providerSubject: { startsWith: marker } }
        })
      ).toBe(0);
    }
    if (redis) {
      const store = new RedisAuthSessionStore(() => redis);
      for (const refresh of refreshes) await store.revokeRefreshToken(refresh.userId, refresh.jti);
      await redis.del(challengeIds.map((id) => `auth:verification:email:${id}`));
      await redis.quit();
    }
    if (prisma) {
      const { disconnectPrisma } = await import("../src/prisma/client");
      await disconnectPrisma();
    }
  });

  it("rolls back an existing-email binding audit failure then retries to one binding and one audit", async () => {
    assertNeedoTest();
    const module = await import("../src/prisma/client");
    prisma = module.prisma;
    redis = createRedisClient();
    await redis.connect();
    const repository = new AuthRepository(prisma);
    const existing = await repository.createVerifiedBaselineCustomer({
      email,
      passwordHash: "prepared-password-hash",
      emailVerifiedAt: new Date(),
      context: { ip: "127.0.0.1" }
    });
    userIds.push(existing.id);
    const challengeStore = new RedisVerificationChallengeStore(() => redis);
    const sessionStore = new RedisAuthSessionStore(() => redis);
    const delivered: string[] = [];
    const verifier = {
      verify: async () => ({
        subject,
        email,
        emailVerifiedAt: new Date(),
        name: "ignored",
        pictureUrl: "https://example.test/a"
      })
    };
    const service = new AuthService(
      env,
      repository,
      sessionStore,
      { sendOtp: async (_email, otp) => void delivered.push(otp) },
      challengeStore,
      false,
      verifier
    );
    const init = await service.initializeGoogleLogin();
    const pending = await service.submitGoogleCredential(
      { credential: "integration-credential", nonceChallengeId: init.nonceChallengeId },
      { ip: "127.0.0.1" }
    );
    if (pending.status !== "verification_required") throw new Error("expected first-use challenge");
    challengeIds.push(pending.challengeId);
    const original = repository.completeGoogleFirstUseLink.bind(repository);
    (
      repository as unknown as { completeGoogleFirstUseLink: typeof original }
    ).completeGoogleFirstUseLink = async (input) =>
      original({ ...input, context: { ip: "x".repeat(51) } });
    await expect(
      service.verifyGoogleRegistrationOrLink(pending.challengeId, delivered[0], { ip: "127.0.0.1" })
    ).rejects.toBeDefined();
    expect(await repository.findGoogleBindingBySubject(subject)).toBeNull();
    (
      repository as unknown as { completeGoogleFirstUseLink: typeof original }
    ).completeGoogleFirstUseLink = original;
    const result = await service.verifyGoogleRegistrationOrLink(pending.challengeId, delivered[0], {
      ip: "127.0.0.1"
    });
    const refreshPayload = new (
      await import("../src/services/auth-token.service")
    ).AuthTokenService(env).verifyRefreshToken(result.refreshToken);
    refreshes.push({ userId: existing.id, jti: refreshPayload.jti });
    expect(
      await prisma.externalAuthAccount.count({
        where: { providerSubject: subject, userId: existing.id, deletedAt: null }
      })
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "auth.google.link",
          targetId: existing.id,
          metadata: { path: "$.challengeId", equals: pending.challengeId }
        }
      })
    ).toBe(1);
    await expect(
      service.verifyGoogleRegistrationOrLink(pending.challengeId, delivered[0], { ip: "127.0.0.1" })
    ).rejects.toBeDefined();
  });
});
