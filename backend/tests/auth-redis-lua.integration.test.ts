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
  const jtis = [
    `${marker}-single`,
    `${marker}-all-a`,
    `${marker}-all-b`,
    `${marker}-switch-corrupt-old`,
    `${marker}-switch-corrupt-new`,
    `${marker}-switch-old`,
    `${marker}-switch-new`,
    `${marker}-switch-collision-new`
  ];
  const challengeIds: string[] = [];
  const nonceIds: string[] = [];
  const switchOperationIds = [`${marker}-corrupt`, `${marker}-success`];
  const switchReceiptKey = (operationId: string): string =>
    `auth:v2:merchant-shop-switch:receipt:${operationId}`;
  const switchOutboxKey = `auth:v2:audit:merchant-shop-switch:test:${marker}`;
  const switchBlacklistKeys = [`${marker}-corrupt-access`, `${marker}-success-access`].map(
    (jti) => `token:blacklist:${jti}`
  );
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
    ...jtis.map((jti) => `auth:v2:refresh:${userId}:${jti}`),
    ...switchOperationIds.map(switchReceiptKey),
    ...switchBlacklistKeys,
    switchOutboxKey
  ];

  const completeMerchantShopSwitch = async (input: {
    userId: number;
    generation: number;
    oldRefreshJti: string;
    newRefreshJti: string;
    refreshTtlSeconds: number;
    oldAccessJti: string;
    oldAccessTtlSeconds: number;
    operationId: string;
    operationHash: string;
    auditId: number;
    receiptTtlSeconds: number;
  }): Promise<{ status: string; reason?: string }> => {
    const method = (
      sessionStore as unknown as {
        completeMerchantShopSwitch?: (
          value: typeof input
        ) => Promise<{ status: string; reason?: string }>;
      }
    ).completeMerchantShopSwitch;
    expect(method).toEqual(expect.any(Function));
    return method!.call(sessionStore, input);
  };

  beforeAll(async () => {
    client = createRedisClient();
    await client.connect();
    challengeStore = new RedisVerificationChallengeStore(() => client!);
    sessionStore = new RedisAuthSessionStore(() => client!, {
      merchantShopAuditOutboxKey: switchOutboxKey,
      merchantShopAuditGroup: `auth-merchant-shop-switch-audit-test-${marker}`,
      merchantShopAuditConsumer: `auth-merchant-shop-switch-audit-worker-test-${marker}`
    });
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
      challengeStore.readGoogleNonce({ challengeId: nonce.challengeId, userId })
    ).resolves.toBe(nonce.nonce);
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

  it("rejects a WRONGTYPE refresh index before any merchant-switch credential write", async () => {
    const oldRefreshJti = jtis[3]!;
    const newRefreshJti = jtis[4]!;
    const refreshIndexKey = `auth:v2:refresh:user:${userId}`;
    const outboxLengthBefore = await client!.xLen(switchOutboxKey).catch(() => 0);
    await sessionStore.revokeAllRefreshTokens(userId, 4);
    await sessionStore.storeRefreshToken(userId, oldRefreshJti, 600, 4);
    await client!.del(refreshIndexKey);
    await client!.set(refreshIndexKey, "polluted-wrong-type", { EX: 600 });

    const outcome = await completeMerchantShopSwitch({
      userId,
      generation: 4,
      oldRefreshJti,
      newRefreshJti,
      refreshTtlSeconds: 600,
      oldAccessJti: `${marker}-corrupt-access`,
      oldAccessTtlSeconds: 300,
      operationId: switchOperationIds[0]!,
      operationHash: "a".repeat(64),
      auditId: 91001,
      receiptTtlSeconds: 600
    }).catch((error: unknown) => error);
    const oldRefreshStillExists = await sessionStore.hasRefreshToken(userId, oldRefreshJti);
    const newRefreshExists = await sessionStore.hasRefreshToken(userId, newRefreshJti);
    const oldAccessBlacklisted = await sessionStore.isAccessTokenBlacklisted(
      `${marker}-corrupt-access`
    );
    const receipt = await client!.get(switchReceiptKey(switchOperationIds[0]!));
    const outboxLengthAfter = await client!.xLen(switchOutboxKey).catch(() => 0);
    await client!.del(refreshIndexKey);

    expect(oldRefreshStillExists).toBe(true);
    expect(newRefreshExists).toBe(false);
    expect(oldAccessBlacklisted).toBe(false);
    expect(receipt).toBeNull();
    expect(outboxLengthAfter).toBe(outboxLengthBefore);
    expect(outcome).toEqual({ status: "rejected", reason: "invalid_state" });
  });

  it("persists an idempotent receipt and one completion outbox event", async () => {
    const oldRefreshJti = jtis[5]!;
    const newRefreshJti = jtis[6]!;
    const operationId = switchOperationIds[1]!;
    const operationHash = "b".repeat(64);
    const input = {
      userId,
      generation: 4,
      oldRefreshJti,
      newRefreshJti,
      refreshTtlSeconds: 600,
      oldAccessJti: `${marker}-success-access`,
      oldAccessTtlSeconds: 300,
      operationId,
      operationHash,
      auditId: 91002,
      receiptTtlSeconds: 600
    };
    await sessionStore.storeRefreshToken(userId, oldRefreshJti, 600, 4);
    const outboxLengthBefore = await client!.xLen(switchOutboxKey).catch(() => 0);

    await expect(completeMerchantShopSwitch(input)).resolves.toEqual({ status: "committed" });
    await expect(sessionStore.hasRefreshToken(userId, oldRefreshJti)).resolves.toBe(false);
    await expect(sessionStore.hasRefreshToken(userId, newRefreshJti)).resolves.toBe(true);
    await expect(sessionStore.isAccessTokenBlacklisted(`${marker}-success-access`)).resolves.toBe(
      true
    );
    await expect(client!.ttl(switchReceiptKey(operationId))).resolves.toBeGreaterThanOrEqual(599);
    await expect(client!.get(switchReceiptKey(operationId))).resolves.toBe(
      `91002:${operationHash}:completed`
    );
    await expect(client!.xLen(switchOutboxKey)).resolves.toBe(outboxLengthBefore + 1);

    await expect(completeMerchantShopSwitch(input)).resolves.toEqual({
      status: "already_committed"
    });
    await expect(client!.xLen(switchOutboxKey)).resolves.toBe(outboxLengthBefore + 1);
    await expect(
      completeMerchantShopSwitch({
        ...input,
        newRefreshJti: jtis[7]!,
        operationHash: "c".repeat(64)
      })
    ).resolves.toEqual({ status: "collision" });
    await expect(sessionStore.hasRefreshToken(userId, jtis[7]!)).resolves.toBe(false);

    const messages = await client!.xRange(switchOutboxKey, "-", "+");
    const event = messages.find(
      (message) => (message.message as Record<string, string>).operationId === operationId
    );
    expect(event?.message).toEqual({
      auditId: "91002",
      operationId,
      status: "completed"
    });

    await expect(sessionStore.readMerchantShopSwitchAuditOutbox()).resolves.toEqual([
      {
        streamId: String(event?.id),
        auditId: 91002,
        operationId,
        status: "completed"
      }
    ]);
    await sessionStore.acknowledgeMerchantShopSwitchAuditOutbox(String(event?.id));
    await expect(sessionStore.readMerchantShopSwitchAuditOutbox()).resolves.toEqual([]);
  });
});
