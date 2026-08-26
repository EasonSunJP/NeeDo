import { createHmac, randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env";
import { createRedisClient, type RedisClient } from "../src/config/redis";
import { AuthRepository } from "../src/repositories/auth.repository";
import type { AuthSessionStore } from "../src/services/auth-session.store";
import { RedisAuthSessionStore } from "../src/services/auth-session.store";
import { AuthService } from "../src/services/auth.service";
import { RedisVerificationChallengeStore } from "../src/services/auth-verification-challenge.store";

const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const marker = `auth-registration-recovery-${randomUUID()}`;
const email = `${marker}@needo.test`;
const runIntegration = Boolean(process.env.ENV_FILE?.trim());
const describeIntegration = runIntegration ? describe : describe.skip;

const requireNeedoTestDatabase = (envFile: string | undefined): void => {
  if (!envFile) throw new Error("ENV_FILE is required for registration recovery integration");
  const loaded = loadDotenv({ path: envFile, override: true });
  const value = loaded.parsed?.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for registration recovery integration");
  const databaseUrl = new URL(value);
  if (
    databaseUrl.protocol !== "mysql:" ||
    !allowedHosts.has(databaseUrl.hostname) ||
    databaseUrl.pathname.replace(/^\/+/, "") !== "needo_test"
  ) {
    throw new Error("registration recovery integration requires local needo_test");
  }
};

describeIntegration("verified registration recovery integration", () => {
  let prisma: PrismaClient;
  let redis: RedisClient;
  let createdUserId: number | undefined;
  let challengeId: string | undefined;

  afterAll(async () => {
    if (prisma && createdUserId) {
      await prisma.$transaction(async (transaction) => {
        await transaction.auditLog.deleteMany({
          where: { targetType: "User", targetId: createdUserId }
        });
        await transaction.loginLog.deleteMany({ where: { userId: createdUserId } });
        await transaction.userRole.deleteMany({ where: { userId: createdUserId } });
        await transaction.userIdentity.deleteMany({ where: { userId: createdUserId } });
        await transaction.customerProfile.deleteMany({ where: { userId: createdUserId } });
        await transaction.user.deleteMany({ where: { id: createdUserId } });
      });
    }
    if (redis && challengeId) {
      const cooldownKey = `auth:verification:cooldown:${createHmac(
        "sha256",
        env.AUTH_VERIFICATION_SECRET
      )
        .update("email")
        .update("\u0000")
        .update("email_registration")
        .update("\u0000")
        .update(email)
        .digest("base64url")}`;
      await redis.del([`auth:verification:email:${challengeId}`, cooldownKey]);
      await redis.quit();
    }
    if (prisma) {
      const { disconnectPrisma } = await import("../src/prisma/client");
      await disconnectPrisma();
    }
  });

  it("retries a DB-committed registration after refresh-session failure without another user", async () => {
    requireNeedoTestDatabase(process.env.ENV_FILE);
    const { prisma: client } = await import("../src/prisma/client");
    prisma = client;
    redis = createRedisClient();
    await redis.connect();
    const repository = new AuthRepository(prisma);
    const redisSessionStore = new RedisAuthSessionStore(() => redis);
    const challengeStore = new RedisVerificationChallengeStore(() => redis);
    let failNextSessionStore = true;
    const sessionStore = new Proxy(redisSessionStore, {
      get(target, property, receiver) {
        if (property === "storeRefreshToken") {
          return async (...args: Parameters<AuthSessionStore["storeRefreshToken"]>) => {
            if (failNextSessionStore) {
              failNextSessionStore = false;
              throw new Error("simulated post-commit refresh-session failure");
            }
            return target.storeRefreshToken(...args);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as AuthSessionStore;
    const deliveredOtps: string[] = [];
    const service = new AuthService(
      env,
      repository,
      sessionStore,
      { sendOtp: async (_email, otp) => void deliveredOtps.push(otp) },
      challengeStore
    );
    const started = await service.startRegistration({ email, password: "Customer.2026!" });
    challengeId = started.challengeId;
    expect(await redis.get(`auth:verification:email:${challengeId}`)).not.toContain(
      "Customer.2026!"
    );
    expect(await redis.get(`auth:verification:email:${challengeId}`)).not.toContain(
      deliveredOtps[0]
    );

    await expect(
      service.verifyRegistration(challengeId, deliveredOtps[0], { ip: "127.0.0.1" })
    ).rejects.toThrow("simulated post-commit refresh-session failure");
    const recovered = await service.verifyRegistration(challengeId, deliveredOtps[0], {
      ip: "127.0.0.1"
    });
    const stored = await repository.findVerifiedRegistrationByChallenge(challengeId, email);
    if (!stored) throw new Error("committed registration audit evidence was not found");
    createdUserId = stored.id;
    expect(recovered.needoId).toBe(stored.needoId);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await redis.get(`auth:verification:email:${challengeId}`)).toBeNull();
  });
});
