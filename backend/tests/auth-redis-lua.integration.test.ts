import { createHmac, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { createRedisClient, type RedisClient } from "../src/config/redis";
import { env } from "../src/config/env";
import { RedisAuthSessionStore } from "../src/services/auth-session.store";
import { MerchantShopAuditOutboxService } from "../src/services/merchant-shop-audit-outbox.service";
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
    `${marker}-switch-collision-new`,
    `${marker}-repair-old`,
    `${marker}-repair-new`,
    `${marker}-max-old`,
    `${marker}-max-new`,
    `${marker}-disconnect-old`,
    `${marker}-disconnect-new`
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
  const extraKeys: string[] = [];
  const extraClients: RedisClient[] = [];

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
    switchOutboxKey,
    ...extraKeys
  ];

  const completeMerchantShopSwitch = async (input: {
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
      await Promise.all(
        extraClients.map(async (extraClient) => {
          if (extraClient.isOpen) await extraClient.quit();
        })
      );
      if (client.isOpen) await client.quit();
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
      oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300,
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
      oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300,
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
    await expect(client!.hGetAll(switchReceiptKey(operationId))).resolves.toMatchObject({
      auditId: "91002",
      operationHash,
      newRefreshJti,
      oldAccessJti: `${marker}-success-access`,
      auditState: "pending",
      outboxId: expect.any(String)
    });
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

    await expect(
      sessionStore.readMerchantShopSwitchAuditOutbox({ pendingCursor: "0-0" })
    ).resolves.toEqual({
      items: [
        {
          kind: "completion",
          streamId: String(event?.id),
          auditId: 91002,
          operationId,
          status: "completed",
          deliveryCount: 1
        }
      ],
      nextPendingCursor: "0-0"
    });
    await sessionStore.acknowledgeMerchantShopSwitchAuditOutbox({
      kind: "completion",
      streamId: String(event?.id),
      auditId: 91002,
      operationId,
      status: "completed",
      deliveryCount: 1
    });
    await expect(
      sessionStore.readMerchantShopSwitchAuditOutbox({ pendingCursor: "0-0" })
    ).resolves.toEqual({ items: [], nextPendingCursor: "0-0" });
    await expect(client!.xLen(switchOutboxKey)).resolves.toBe(outboxLengthBefore);
    await expect(client!.hGet(switchReceiptKey(operationId), "auditState")).resolves.toBe(
      "completed"
    );
  });

  it("repairs an evicted completion event only after validating the complete credential post-state", async () => {
    const operationId = `${marker}-repair`;
    const outboxKey = `${switchOutboxKey}:repair`;
    const deadLetterKey = `${outboxKey}:dlq`;
    const securityEvents: Array<{ operation: string; reason: string }> = [];
    extraKeys.push(switchReceiptKey(operationId), outboxKey, deadLetterKey);
    const store = new RedisAuthSessionStore(() => client!, {
      merchantShopAuditOutboxKey: outboxKey,
      merchantShopAuditGroup: `${marker}-repair-group`,
      merchantShopAuditConsumer: `${marker}-repair-consumer`,
      onSecurityEvent: (event) => securityEvents.push(event)
    });
    const input = {
      userId,
      generation: 4,
      oldRefreshJti: jtis[8]!,
      newRefreshJti: jtis[9]!,
      refreshTtlSeconds: 600,
      oldAccessJti: `${marker}-repair-access`,
      oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300,
      operationId,
      operationHash: "d".repeat(64),
      auditId: 91003,
      receiptTtlSeconds: 600
    };
    extraKeys.push(`token:blacklist:${input.oldAccessJti}`);
    await store.storeRefreshToken(userId, input.oldRefreshJti, 600, 4);

    await expect(store.completeMerchantShopSwitch(input)).resolves.toEqual({ status: "committed" });
    const originalOutboxId = await client!.hGet(switchReceiptKey(operationId), "outboxId");
    await client!.xDel(outboxKey, originalOutboxId!);
    await expect(store.completeMerchantShopSwitch(input)).resolves.toEqual({
      status: "already_committed"
    });
    const repairedOutboxId = await client!.hGet(switchReceiptKey(operationId), "outboxId");
    expect(repairedOutboxId).not.toBe(originalOutboxId);
    await expect(client!.xRange(outboxKey, repairedOutboxId!, repairedOutboxId!)).resolves.toEqual([
      expect.objectContaining({
        message: { auditId: "91003", operationId, status: "completed" }
      })
    ]);

    await client!.del(`auth:v2:refresh:${userId}:${input.newRefreshJti}`);
    await expect(store.completeMerchantShopSwitch(input)).resolves.toEqual({
      status: "rejected",
      reason: "post_state_mismatch"
    });
    expect(securityEvents).toEqual([{ operation: operationId, reason: "post_state_mismatch" }]);

    await client!.set(`auth:v2:refresh:${userId}:${input.newRefreshJti}`, "1", { EX: 600 });
    const outboxLengthBeforeReceiptEviction = await client!.xLen(outboxKey);
    await client!.del(switchReceiptKey(operationId));
    await expect(store.completeMerchantShopSwitch(input)).resolves.toEqual({
      status: "rejected",
      reason: "post_state_unknown"
    });
    await expect(client!.xLen(outboxKey)).resolves.toBe(outboxLengthBeforeReceiptEviction);
    expect(securityEvents.at(-1)).toEqual({
      operation: operationId,
      reason: "post_state_unknown"
    });
  });

  it("claims stale pending events, retries completion failures, dead-letters poison, and deletes processed entries", async () => {
    const outboxKey = `${switchOutboxKey}:consumer`;
    const deadLetterKey = `${outboxKey}:dlq`;
    const group = `${marker}-consumer-group`;
    extraKeys.push(outboxKey, deadLetterKey);
    const firstConsumer = new RedisAuthSessionStore(() => client!, {
      merchantShopAuditOutboxKey: outboxKey,
      merchantShopAuditDeadLetterKey: deadLetterKey,
      merchantShopAuditGroup: group,
      merchantShopAuditConsumer: `${marker}-consumer-a`,
      merchantShopAuditClaimIdleMs: 0
    });
    const takeoverConsumer = new RedisAuthSessionStore(() => client!, {
      merchantShopAuditOutboxKey: outboxKey,
      merchantShopAuditDeadLetterKey: deadLetterKey,
      merchantShopAuditGroup: group,
      merchantShopAuditConsumer: `${marker}-consumer-b`,
      merchantShopAuditClaimIdleMs: 0
    });
    const completionId = await client!.xAdd(outboxKey, "*", {
      auditId: "92001",
      operationId: `${marker}-takeover`,
      status: "completed"
    });

    await expect(
      firstConsumer.readMerchantShopSwitchAuditOutbox({ pendingCursor: "0-0" })
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ kind: "completion", streamId: completionId })]
    });
    await expect(
      takeoverConsumer.readMerchantShopSwitchAuditOutbox({ pendingCursor: "0-0" })
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ kind: "completion", streamId: completionId })]
    });

    const completeAudit = jest
      .fn<Promise<boolean>, []>()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue(true);
    const service = new MerchantShopAuditOutboxService(
      { completeMerchantShopSwitchAudit: completeAudit as never },
      takeoverConsumer
    );
    await expect(service.drain()).resolves.toMatchObject({ failed: 1, completed: 0 });
    await expect(takeoverConsumer.getMerchantShopSwitchAuditOutboxStats()).resolves.toMatchObject({
      streamLength: 1,
      pendingCount: 1
    });
    await expect(service.drain()).resolves.toMatchObject({ failed: 0, completed: 1 });
    await expect(takeoverConsumer.getMerchantShopSwitchAuditOutboxStats()).resolves.toMatchObject({
      streamLength: 0,
      pendingCount: 0
    });

    await client!.xAdd(outboxKey, "*", { invalid: "event" });
    await client!.xAdd(outboxKey, "*", {
      auditId: "92002",
      operationId: `${marker}-valid-after-poison`,
      status: "completed"
    });
    await expect(service.drain()).resolves.toMatchObject({
      completed: 1,
      deadLettered: 1,
      failed: 0,
      streamLength: 0,
      pendingCount: 0,
      deadLetterLength: 1
    });
    await expect(client!.xRange(deadLetterKey, "-", "+")).resolves.toEqual([
      expect.objectContaining({
        message: expect.objectContaining({
          reason: "invalid_completion_event",
          status: "poison"
        })
      })
    ]);
  });

  it("walks more than one pending batch fairly, wraps the claim cursor, and bounds deterministic failures", async () => {
    const outboxKey = `${switchOutboxKey}:cursor`;
    const deadLetterKey = `${outboxKey}:dlq`;
    const conflictKey = `${outboxKey}:conflicts`;
    const group = `${marker}-cursor-group`;
    extraKeys.push(outboxKey, deadLetterKey, conflictKey);
    const sourceConsumer = new RedisAuthSessionStore(() => client!, {
      merchantShopAuditOutboxKey: outboxKey,
      merchantShopAuditDeadLetterKey: deadLetterKey,
      merchantShopAuditConflictKey: conflictKey,
      merchantShopAuditGroup: group,
      merchantShopAuditConsumer: `${marker}-cursor-source`,
      merchantShopAuditClaimIdleMs: 60_000,
      merchantShopAuditBatchSize: 2
    });
    const takeoverConsumer = new RedisAuthSessionStore(() => client!, {
      merchantShopAuditOutboxKey: outboxKey,
      merchantShopAuditDeadLetterKey: deadLetterKey,
      merchantShopAuditConflictKey: conflictKey,
      merchantShopAuditGroup: group,
      merchantShopAuditConsumer: `${marker}-cursor-takeover`,
      merchantShopAuditClaimIdleMs: 0,
      merchantShopAuditBatchSize: 2
    });
    const ids = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        client!.xAdd(outboxKey, "*", {
          auditId: String(93_001 + index),
          operationId: `${marker}-cursor-${index}`,
          status: "completed"
        })
      )
    );
    await sourceConsumer.readMerchantShopSwitchAuditOutbox({ pendingCursor: "0-0" });
    await sourceConsumer.readMerchantShopSwitchAuditOutbox({ pendingCursor: "0-0" });
    await sourceConsumer.readMerchantShopSwitchAuditOutbox({ pendingCursor: "0-0" });

    let firstEventAttempts = 0;
    const completeAudit = jest.fn(async (input: { auditId: number }) => {
      if (input.auditId !== 93_001) return true;
      firstEventAttempts += 1;
      if (firstEventAttempts <= 3) throw new Error("database unavailable");
      return false;
    });
    const service = new MerchantShopAuditOutboxService(
      { completeMerchantShopSwitchAudit: completeAudit as never },
      takeoverConsumer,
      { maxPagesPerDrain: 1, maxDeterministicConflicts: 3 }
    );

    await expect(service.drain()).resolves.toMatchObject({ read: 2, completed: 1, failed: 1 });
    await expect(service.drain()).resolves.toMatchObject({ read: 2, completed: 2, failed: 0 });
    await expect(service.drain()).resolves.toMatchObject({ read: 1, completed: 1, failed: 0 });
    await expect(client!.xRange(outboxKey, "-", "+")).resolves.toEqual([
      expect.objectContaining({ id: ids[0] })
    ]);
    await expect(client!.hGet(conflictKey, ids[0]!)).resolves.toBeNull();
    await expect(service.drain()).resolves.toMatchObject({
      read: 1,
      completed: 0,
      failed: 1,
      deadLettered: 0
    });
    await expect(service.drain()).resolves.toMatchObject({
      read: 1,
      completed: 0,
      failed: 1,
      deadLettered: 0
    });
    await expect(client!.hGet(conflictKey, ids[0]!)).resolves.toBeNull();
    await expect(service.drain()).resolves.toMatchObject({
      read: 1,
      completed: 0,
      failed: 1,
      deadLettered: 0
    });
    await expect(client!.hGet(conflictKey, ids[0]!)).resolves.toBe("1");
    await expect(service.drain()).resolves.toMatchObject({
      read: 1,
      completed: 0,
      failed: 1,
      deadLettered: 0
    });
    await expect(client!.hGet(conflictKey, ids[0]!)).resolves.toBe("2");
    await expect(service.drain()).resolves.toMatchObject({
      read: 1,
      completed: 0,
      failed: 0,
      deadLettered: 1,
      streamLength: 0,
      pendingCount: 0,
      deadLetterLength: 1
    });
    await expect(client!.hGet(conflictKey, ids[0]!)).resolves.toBeNull();
    expect(completeAudit.mock.calls.map(([input]) => input.auditId)).toEqual([
      93_001, 93_002, 93_003, 93_004, 93_005, 93_001, 93_001, 93_001, 93_001, 93_001
    ]);
  });

  it("keeps messages pending when ACK or DLQ preconditions reject with WRONGTYPE", async () => {
    const outboxKey = `${switchOutboxKey}:strict-response`;
    const deadLetterKey = `${outboxKey}:dlq`;
    const group = `${marker}-strict-response-group`;
    const operationId = `${marker}-strict-response`;
    const receiptKey = switchReceiptKey(operationId);
    extraKeys.push(outboxKey, deadLetterKey, receiptKey);
    const store = new RedisAuthSessionStore(() => client!, {
      merchantShopAuditOutboxKey: outboxKey,
      merchantShopAuditDeadLetterKey: deadLetterKey,
      merchantShopAuditGroup: group,
      merchantShopAuditConsumer: `${marker}-strict-response-consumer`,
      merchantShopAuditClaimIdleMs: 0
    });
    const streamId = await client!.xAdd(outboxKey, "*", {
      auditId: "94001",
      operationId,
      status: "completed"
    });
    const page = await store.readMerchantShopSwitchAuditOutbox({ pendingCursor: "0-0" });
    const event = page.items[0];
    expect(event).toMatchObject({ kind: "completion", streamId });
    if (!event || event.kind !== "completion") throw new Error("completion event was not read");

    await client!.set(receiptKey, "wrong-type");
    await expect(store.acknowledgeMerchantShopSwitchAuditOutbox(event)).rejects.toMatchObject({
      code: 50301,
      statusCode: 503
    });
    await expect(store.getMerchantShopSwitchAuditOutboxStats()).resolves.toMatchObject({
      streamLength: 1,
      pendingCount: 1
    });

    await client!.set(deadLetterKey, "wrong-type");
    await expect(
      store.deadLetterMerchantShopSwitchAuditOutbox({
        kind: "poison",
        streamId,
        reason: "invalid_completion_event",
        deliveryCount: event.deliveryCount
      })
    ).rejects.toMatchObject({ code: 50301, statusCode: 503 });
    await expect(store.getMerchantShopSwitchAuditOutboxStats()).rejects.toMatchObject({
      code: 50301,
      statusCode: 503
    });
    await expect(client!.xLen(outboxKey)).resolves.toBe(1);
    await expect(client!.xPending(outboxKey, group)).resolves.toMatchObject({ pending: 1 });
  });

  it("reacquires Redis after a real connection failure and bounds continuous uncertainty", async () => {
    const operationId = `${marker}-disconnect`;
    const outboxKey = `${switchOutboxKey}:disconnect`;
    const receiptKey = switchReceiptKey(operationId);
    extraKeys.push(
      outboxKey,
      `${outboxKey}:dlq`,
      receiptKey,
      `token:blacklist:${marker}-disconnect-access`
    );
    await sessionStore.storeRefreshToken(userId, jtis[12]!, 600, 4);
    const disconnected = createRedisClient({
      ...env,
      REDIS_RECONNECT_MAX_RETRIES: 0
    });
    disconnected.on("error", () => undefined);
    await disconnected.connect();
    extraClients.push(disconnected);
    const disconnectedClientId = await disconnected.sendCommand(["CLIENT", "ID"]);
    const disconnectable = disconnected as unknown as {
      eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
    };
    const originalEval = disconnectable.eval.bind(disconnected);
    disconnectable.eval = async (script, options) => {
      await client!.sendCommand(["CLIENT", "KILL", "ID", String(disconnectedClientId)]);
      return originalEval(script, options);
    };
    let attempts = 0;
    const store = new RedisAuthSessionStore(
      () => {
        attempts += 1;
        return attempts === 1 ? disconnected : client!;
      },
      {
        operationTimeoutMs: 50,
        merchantShopSwitchReconcileDeadlineMs: 500,
        merchantShopSwitchMaxAttempts: 3,
        merchantShopAuditOutboxKey: outboxKey
      }
    );
    const input = {
      userId,
      generation: 4,
      oldRefreshJti: jtis[12]!,
      newRefreshJti: jtis[13]!,
      refreshTtlSeconds: 600,
      oldAccessJti: `${marker}-disconnect-access`,
      oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300,
      operationId,
      operationHash: "e".repeat(64),
      auditId: 91004,
      receiptTtlSeconds: 600
    };
    await expect(store.completeMerchantShopSwitch(input)).resolves.toEqual({ status: "committed" });
    expect(attempts).toBeGreaterThanOrEqual(2);

    const alwaysUnavailableClients = Array.from({ length: 3 }, () => {
      const unavailableClient = createRedisClient({
        ...env,
        REDIS_URL: "redis://127.0.0.1:1",
        REDIS_CONNECT_TIMEOUT_MS: 20,
        REDIS_RECONNECT_MAX_RETRIES: 0
      });
      unavailableClient.on("error", () => undefined);
      extraClients.push(unavailableClient);
      return unavailableClient;
    });
    let unavailableAttempts = 0;
    const boundedStore = new RedisAuthSessionStore(
      () => alwaysUnavailableClients[unavailableAttempts++ % alwaysUnavailableClients.length]!,
      {
        operationTimeoutMs: 25,
        merchantShopSwitchReconcileDeadlineMs: 100,
        merchantShopSwitchMaxAttempts: 3,
        merchantShopAuditOutboxKey: `${outboxKey}:bounded`
      }
    );
    extraKeys.push(`${outboxKey}:bounded`);
    const startedAt = Date.now();
    await expect(
      boundedStore.completeMerchantShopSwitch({
        ...input,
        operationId: `${operationId}-bounded`,
        operationHash: "f".repeat(64)
      })
    ).rejects.toMatchObject({ code: 50301, statusCode: 503 });
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(unavailableAttempts).toBe(3);
  });

  it("rejects an exhausted outbox stream before any merchant-switch state write", async () => {
    const outboxKey = `${switchOutboxKey}:max-id`;
    const operationId = `${marker}-max-id`;
    const receiptKey = switchReceiptKey(operationId);
    const blacklistKey = `token:blacklist:${marker}-max-access`;
    extraKeys.push(outboxKey, `${outboxKey}:dlq`, receiptKey, blacklistKey);
    await client!.xAdd(outboxKey, "18446744073709551615-18446744073709551615", {
      seed: "max-id"
    });
    const store = new RedisAuthSessionStore(() => client!, {
      merchantShopAuditOutboxKey: outboxKey,
      merchantShopAuditGroup: `${marker}-max-group`,
      merchantShopAuditConsumer: `${marker}-max-consumer`
    });
    await store.storeRefreshToken(userId, jtis[10]!, 600, 4);
    const indexBefore = await client!.sMembers(`auth:v2:refresh:user:${userId}`);
    const indexTtlBefore = await client!.ttl(`auth:v2:refresh:user:${userId}`);
    const outboxBefore = await client!.xRange(outboxKey, "-", "+");

    await expect(
      store.completeMerchantShopSwitch({
        userId,
        generation: 4,
        oldRefreshJti: jtis[10]!,
        newRefreshJti: jtis[11]!,
        refreshTtlSeconds: 600,
        oldAccessJti: `${marker}-max-access`,
        oldAccessExpiresAt: Math.floor(Date.now() / 1000) + 300,
        operationId,
        operationHash: "f".repeat(64),
        auditId: 91005,
        receiptTtlSeconds: 600
      })
    ).resolves.toEqual({ status: "rejected", reason: "outbox_exhausted" });

    await expect(store.hasRefreshToken(userId, jtis[10]!)).resolves.toBe(true);
    await expect(store.hasRefreshToken(userId, jtis[11]!)).resolves.toBe(false);
    await expect(store.isAccessTokenBlacklisted(`${marker}-max-access`)).resolves.toBe(false);
    await expect(client!.exists([receiptKey])).resolves.toBe(0);
    await expect(client!.sMembers(`auth:v2:refresh:user:${userId}`)).resolves.toEqual(indexBefore);
    await expect(client!.ttl(`auth:v2:refresh:user:${userId}`)).resolves.toBe(indexTtlBefore);
    await expect(client!.xRange(outboxKey, "-", "+")).resolves.toEqual(outboxBefore);
  });
});
