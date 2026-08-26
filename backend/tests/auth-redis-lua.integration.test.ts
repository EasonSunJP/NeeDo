import { createHmac, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { createRedisClient, type RedisClient } from "../src/config/redis";
import { env } from "../src/config/env";
import { RedisAuthSessionStore } from "../src/services/auth-session.store";
import { RedisVerificationChallengeStore } from "../src/services/auth-verification-challenge.store";

const runRedisAuthStoreIntegration = process.env.RUN_REDIS_AUTH_STORE_INTEGRATION === "true";
const describeRedis = runRedisAuthStoreIntegration ? describe : describe.skip;

describeRedis("Redis auth-store Lua integration", () => {
  const marker = randomUUID();
  const userId = 900_000_000;
  const email = `task2-${marker}@needo.local`;
  const jtis = [`${marker}-a`, `${marker}-b`];
  let client: RedisClient;
  let challengeStore: RedisVerificationChallengeStore;
  let sessionStore: RedisAuthSessionStore;

  beforeAll(async () => {
    client = createRedisClient();
    await client.connect();
    challengeStore = new RedisVerificationChallengeStore(() => client);
    sessionStore = new RedisAuthSessionStore(() => client);
  });

  afterAll(async () => {
    if (!client) return;
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
    await client.del([
      cooldownKey,
      `refresh:user:${userId}`,
      ...jtis.map((jti) => `refresh:${userId}:${jti}`)
    ]);
    await client.quit();
  });

  it("executes challenge and refresh-session Lua transactions against Redis", async () => {
    const challenge = await challengeStore.createEmailChallenge({
      email,
      otp: "123456",
      purpose: "password_setup",
      userId,
      metadata: { passwordHash: await hash("Abcd@1234", 12) }
    });

    await expect(
      challengeStore.consumeEmailChallenge({
        challengeId: challenge.challengeId,
        otp: "123456",
        purpose: "password_setup",
        userId
      })
    ).resolves.toMatchObject({ ok: true });

    await sessionStore.storeRefreshToken(userId, jtis[0], 600);
    await sessionStore.storeRefreshToken(userId, jtis[1], 60);
    expect(await client.ttl(`refresh:user:${userId}`)).toBeGreaterThanOrEqual(599);

    await sessionStore.revokeAllRefreshTokens(userId);
    await expect(sessionStore.hasRefreshToken(userId, jtis[0])).resolves.toBe(false);
    await expect(sessionStore.hasRefreshToken(userId, jtis[1])).resolves.toBe(false);
  });
});
