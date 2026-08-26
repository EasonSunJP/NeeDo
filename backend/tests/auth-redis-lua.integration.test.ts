import { createHmac, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { createRedisClient, type RedisClient } from "../src/config/redis";
import { env } from "../src/config/env";
import { RedisAuthSessionStore } from "../src/services/auth-session.store";
import { RedisVerificationChallengeStore } from "../src/services/auth-verification-challenge.store";

const runRedisAuthStoreIntegration = process.env.RUN_REDIS_AUTH_STORE_INTEGRATION === "true";
const describeRedis = runRedisAuthStoreIntegration ? describe : describe.skip;

const numericUserIdFromMarker = (marker: string): number =>
  Number((BigInt(`0x${marker.replaceAll("-", "")}`) % 1_000_000_000n) + 1_000_000_000n);

describeRedis("Redis auth-store Lua integration", () => {
  const marker = randomUUID();
  const userId = numericUserIdFromMarker(marker);
  const email = `task2-${marker}@needo.local`;
  const jtis = [`${marker}-single`, `${marker}-all-a`, `${marker}-all-b`];
  const challengeIds: string[] = [];
  const nonceIds: string[] = [];
  let client: RedisClient | undefined;
  let challengeStore: RedisVerificationChallengeStore;
  let sessionStore: RedisAuthSessionStore;

  const emailCooldownKey = (): string =>
    `auth:verification:cooldown:${createHmac("sha256", env.AUTH_VERIFICATION_SECRET)
      .update("email")
      .update("\u0000")
      .update("password_setup")
      .update("\u0000")
      .update(email)
      .digest("base64url")}`;
  const registrationEmail = `task5-${marker}@needo.local`;
  const registrationCancelEmail = `task5-cancel-${marker}@needo.local`;
  const registrationCooldownKey = (email = registrationEmail): string =>
    `auth:verification:cooldown:${createHmac("sha256", env.AUTH_VERIFICATION_SECRET)
      .update("email")
      .update("\u0000")
      .update("email_registration")
      .update("\u0000")
      .update(email)
      .digest("base64url")}`;

  const createdKeys = (): string[] => [
    emailCooldownKey(),
    registrationCooldownKey(),
    registrationCooldownKey(registrationCancelEmail),
    ...challengeIds.map((challengeId) => `auth:verification:email:${challengeId}`),
    ...nonceIds.map((challengeId) => `auth:verification:google-nonce:${challengeId}`),
    `auth:v2:refresh:user:${userId}`,
    `auth:v2:login:account:fail:${userId}`,
    `auth:v2:login:account:lock:${userId}`,
    ...jtis.map((jti) => `auth:v2:refresh:${userId}:${jti}`)
  ];

  beforeAll(async () => {
    client = createRedisClient();
    await client.connect();
    challengeStore = new RedisVerificationChallengeStore(() => client!);
    sessionStore = new RedisAuthSessionStore(() => client!);
  });

  afterAll(async () => {
    if (!client) return;
    const keys = createdKeys();
    try {
      await client.del(keys);
      expect(await client.exists(keys)).toBe(0);
    } finally {
      await client.quit();
    }
  });

  it("executes every auth-store Lua transaction against isolated Redis keys", async () => {
    const challenge = await challengeStore.createEmailChallenge({
      email,
      otp: "123456",
      purpose: "password_setup",
      userId,
      metadata: { passwordHash: await hash("Abcd@1234", 12) }
    });
    challengeIds.push(challenge.challengeId);

    await expect(
      challengeStore.consumeEmailChallenge({
        challengeId: challenge.challengeId,
        otp: "123456",
        purpose: "password_setup",
        userId
      })
    ).resolves.toMatchObject({ ok: true });

    const nonce = await challengeStore.createGoogleNonce({ userId });
    nonceIds.push(nonce.challengeId);
    await expect(
      challengeStore.consumeGoogleNonce({
        challengeId: nonce.challengeId,
        expectedNonce: nonce.nonce,
        userId
      })
    ).resolves.toBe(true);

    await sessionStore.storeRefreshToken(userId, jtis[0], 600);
    await sessionStore.revokeRefreshToken(userId, jtis[0]);
    await expect(sessionStore.hasRefreshToken(userId, jtis[0])).resolves.toBe(false);

    await sessionStore.storeRefreshToken(userId, jtis[1], 600);
    await sessionStore.storeRefreshToken(userId, jtis[2], 60);
    expect(await client!.ttl(`auth:v2:refresh:user:${userId}`)).toBeGreaterThanOrEqual(599);
    await sessionStore.revokeAllRefreshTokens(userId);
    await expect(sessionStore.hasRefreshToken(userId, jtis[1])).resolves.toBe(false);
    await expect(sessionStore.hasRefreshToken(userId, jtis[2])).resolves.toBe(false);
  });

  it("enforces reservation CAS, exact cancellation cleanup, and immutable account locks in Redis", async () => {
    const challenge = await challengeStore.createEmailChallenge({
      email: registrationEmail,
      otp: "123456",
      purpose: "email_registration",
      metadata: { passwordHash: await hash("Abcd@1234", 12) }
    });
    challengeIds.push(challenge.challengeId);
    const first = await challengeStore.reserveEmailChallenge({
      challengeId: challenge.challengeId,
      otp: "123456",
      purpose: "email_registration"
    });
    expect(first).toMatchObject({ ok: true, reservationToken: expect.any(String) });
    if (!first.ok) throw new Error("reservation did not succeed");
    await expect(
      Promise.all(
        Array.from({ length: 5 }, () =>
          challengeStore.reserveEmailChallenge({
            challengeId: challenge.challengeId,
            otp: "000000",
            purpose: "email_registration"
          })
        )
      )
    ).resolves.toEqual(Array.from({ length: 5 }, () => ({ ok: false, reason: "reserved" })));
    const realDateNow = Date.now;
    jest.spyOn(Date, "now").mockReturnValue(realDateNow() + 60_000);
    await expect(
      challengeStore.reserveEmailChallenge({
        challengeId: challenge.challengeId,
        otp: "123456",
        purpose: "email_registration"
      })
    ).resolves.toEqual({ ok: false, reason: "reserved" });
    jest.restoreAllMocks();
    await expect(
      challengeStore.finalizeEmailChallenge({
        challengeId: challenge.challengeId,
        reservationToken: "not-the-owner"
      })
    ).resolves.toBe(false);
    await expect(
      challengeStore.releaseEmailChallenge({
        challengeId: challenge.challengeId,
        reservationToken: first.reservationToken
      })
    ).resolves.toBe(true);
    const challengeKey = `auth:verification:email:${challenge.challengeId}`;
    const serialized = await client!.get(challengeKey);
    if (!serialized) throw new Error("released challenge was unexpectedly missing");
    const staleLease = JSON.parse(serialized) as Record<string, unknown>;
    staleLease.reservationToken = "expired-owner";
    staleLease.reservationExpiresAt = Date.now() - 1;
    await client!.set(challengeKey, JSON.stringify(staleLease), {
      EX: await client!.ttl(challengeKey)
    });
    const recovered = await challengeStore.reserveEmailChallenge({
      challengeId: challenge.challengeId,
      otp: "123456",
      purpose: "email_registration"
    });
    expect(recovered).toMatchObject({ ok: true, reservationToken: expect.any(String) });
    if (!recovered.ok) throw new Error("reservation did not recover");
    await expect(
      challengeStore.finalizeEmailChallenge({
        challengeId: challenge.challengeId,
        reservationToken: recovered.reservationToken
      })
    ).resolves.toBe(true);
    await expect(
      challengeStore.reserveEmailChallenge({
        challengeId: challenge.challengeId,
        otp: "123456",
        purpose: "email_registration"
      })
    ).resolves.toEqual({ ok: false, reason: "missing" });

    const cancelled = await challengeStore.createEmailChallenge({
      email: registrationCancelEmail,
      otp: "654321",
      purpose: "email_registration",
      metadata: { passwordHash: await hash("Abcd@1234", 12) }
    });
    challengeIds.push(cancelled.challengeId);
    await expect(
      challengeStore.cancelEmailChallenge({
        challengeId: cancelled.challengeId,
        email: registrationCancelEmail,
        purpose: "email_registration"
      })
    ).resolves.toBe(true);
    await expect(client!.exists([registrationCooldownKey(registrationCancelEmail)])).resolves.toBe(
      0
    );
    await expect(
      client!.exists([`auth:verification:email:${cancelled.challengeId}`])
    ).resolves.toBe(0);

    const options = { failureLimit: 2, windowSeconds: 60, lockSeconds: 120 };
    await sessionStore.recordFailedLoginForAccount(userId, options);
    await expect(sessionStore.recordFailedLoginForAccount(userId, options)).resolves.toEqual({
      count: 2,
      locked: true
    });
    await expect(sessionStore.getAccountLoginLock(userId)).resolves.toBe(true);
    await sessionStore.clearFailedLoginForAccount(userId);
    await expect(sessionStore.getAccountLoginLock(userId)).resolves.toBe(false);
  });
});
