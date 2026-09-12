import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { RedisClient } from "../config/redis";
import { getRedisClient } from "../config/redis";
import { env } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export interface LoginFailureOptions {
  failureLimit: number;
  windowSeconds: number;
  lockSeconds: number;
}

export interface LoginFailureResult {
  count: number;
  locked: boolean;
}

export type MerchantShopSwitchCommitResult =
  | { status: "committed" | "already_committed" }
  | { status: "rejected"; reason: string }
  | { status: "collision" };

export interface MerchantShopSwitchAuditOutboxEvent {
  kind: "completion";
  streamId: string;
  auditId: number;
  operationId: string;
  status: "completed";
  deliveryCount: number;
}

export interface MerchantShopSwitchAuditPoisonEvent {
  kind: "poison";
  streamId: string;
  reason: string;
  deliveryCount: number;
}

export type MerchantShopSwitchAuditOutboxItem =
  | MerchantShopSwitchAuditOutboxEvent
  | MerchantShopSwitchAuditPoisonEvent;

export interface MerchantShopSwitchAuditOutboxStats {
  streamLength: number;
  pendingCount: number;
  deadLetterLength: number;
}

export interface MerchantShopSwitchAuditOutboxCommandOptions {
  abortSignal?: AbortSignal;
}

export interface MerchantShopSwitchAuditOutboxReadOptions extends MerchantShopSwitchAuditOutboxCommandOptions {
  pendingCursor: string;
}

export interface MerchantShopSwitchAuditOutboxReadPage {
  items: MerchantShopSwitchAuditOutboxItem[];
  nextPendingCursor: string;
}

export interface AuthSessionStore {
  getLoginLock: (email: string) => Promise<boolean>;
  getAccountLoginLock: (userId: number) => Promise<boolean>;
  recordFailedLogin: (
    ip: string,
    email: string,
    options: LoginFailureOptions
  ) => Promise<LoginFailureResult>;
  clearFailedLogin: (ip: string, email: string) => Promise<void>;
  recordFailedLoginForAccount: (
    userId: number,
    options: LoginFailureOptions
  ) => Promise<LoginFailureResult>;
  clearFailedLoginForAccount: (userId: number) => Promise<void>;
  storeOtp: (email: string, otp: string, ttlSeconds: number) => Promise<void>;
  getOtp: (email: string) => Promise<string | null>;
  deleteOtp: (email: string) => Promise<void>;
  hasOtpCooldown: (email: string) => Promise<boolean>;
  storeOtpCooldown: (email: string, ttlSeconds: number) => Promise<void>;
  clearOtpCooldown: (email: string) => Promise<void>;
  getSessionGeneration?: (userId: number) => Promise<number>;
  storeRefreshToken: (
    userId: number,
    jti: string,
    ttlSeconds: number,
    generation?: number
  ) => Promise<boolean | void>;
  rotateRefreshToken?: (input: {
    userId: number;
    generation: number;
    oldJti: string;
    newJti: string;
    ttlSeconds: number;
  }) => Promise<boolean>;
  completeMerchantShopSwitch?: (input: {
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
  }) => Promise<MerchantShopSwitchCommitResult>;
  readMerchantShopSwitchAuditOutbox?: (
    options: MerchantShopSwitchAuditOutboxReadOptions
  ) => Promise<MerchantShopSwitchAuditOutboxReadPage>;
  acknowledgeMerchantShopSwitchAuditOutbox?: (
    event: MerchantShopSwitchAuditOutboxEvent,
    options?: MerchantShopSwitchAuditOutboxCommandOptions
  ) => Promise<void>;
  deadLetterMerchantShopSwitchAuditOutbox?: (
    event: MerchantShopSwitchAuditPoisonEvent,
    options?: MerchantShopSwitchAuditOutboxCommandOptions
  ) => Promise<void>;
  recordMerchantShopSwitchAuditConflict?: (
    event: MerchantShopSwitchAuditOutboxEvent,
    options?: MerchantShopSwitchAuditOutboxCommandOptions
  ) => Promise<number>;
  getMerchantShopSwitchAuditOutboxStats?: (
    options?: MerchantShopSwitchAuditOutboxCommandOptions
  ) => Promise<MerchantShopSwitchAuditOutboxStats>;
  completeGoogleUnlink?: (input: {
    userId: number;
    challengeId: string;
    reservationToken: string;
    accessTokenJti: string;
    recoveryProof: string;
    accessTokenTtlSeconds: number;
    sessionGeneration: number;
  }) => Promise<boolean>;
  getGoogleUnlinkCompletion?: (input: {
    userId: number;
    challengeId: string;
    recoveryProof: string;
  }) => Promise<boolean>;
  hasRefreshToken: (userId: number, jti: string) => Promise<boolean>;
  revokeRefreshToken: (userId: number, jti: string) => Promise<void>;
  revokeAllRefreshTokens: (userId: number, sessionGeneration?: number) => Promise<void>;
  blacklistAccessToken: (jti: string, ttlSeconds: number) => Promise<void>;
  isAccessTokenBlacklisted: (jti: string) => Promise<boolean>;
}

interface RedisAuthSessionStoreOptions {
  operationTimeoutMs?: number;
  merchantShopSwitchReconcileDeadlineMs?: number;
  merchantShopSwitchMaxAttempts?: number;
  merchantShopAuditOutboxKey?: string;
  merchantShopAuditDeadLetterKey?: string;
  merchantShopAuditConflictKey?: string;
  merchantShopAuditGroup?: string;
  merchantShopAuditConsumer?: string;
  merchantShopAuditClaimIdleMs?: number;
  merchantShopAuditBatchSize?: number;
  merchantShopAuditDeadLetterMaxLength?: number;
  merchantShopAuditConflictTtlSeconds?: number;
  onSecurityEvent?: (event: { operation: string; reason: string }) => void;
}

export class RedisAuthSessionStore implements AuthSessionStore {
  private readonly operationTimeoutMs: number;
  private readonly merchantShopSwitchReconcileDeadlineMs: number;
  private readonly merchantShopSwitchMaxAttempts: number;
  private readonly merchantShopAuditOutboxKey: string;
  private readonly merchantShopAuditDeadLetterKey: string;
  private readonly merchantShopAuditConflictKey: string;
  private readonly merchantShopAuditGroup: string;
  private readonly merchantShopAuditConsumer: string;
  private readonly merchantShopAuditClaimIdleMs: number;
  private readonly merchantShopAuditBatchSize: number;
  private readonly merchantShopAuditDeadLetterMaxLength: number;
  private readonly merchantShopAuditConflictTtlSeconds: number;
  private readonly onSecurityEvent: (event: { operation: string; reason: string }) => void;

  public constructor(
    private readonly getClient: () => RedisClient = getRedisClient,
    options: RedisAuthSessionStoreOptions = {}
  ) {
    this.operationTimeoutMs = options.operationTimeoutMs ?? env.REDIS_CONNECT_TIMEOUT_MS;
    this.merchantShopSwitchReconcileDeadlineMs =
      options.merchantShopSwitchReconcileDeadlineMs ?? Math.max(this.operationTimeoutMs * 3, 1_000);
    this.merchantShopSwitchMaxAttempts = Math.max(
      1,
      Math.floor(options.merchantShopSwitchMaxAttempts ?? 4)
    );
    this.merchantShopAuditOutboxKey =
      options.merchantShopAuditOutboxKey ?? MERCHANT_SHOP_SWITCH_AUDIT_OUTBOX_KEY;
    this.merchantShopAuditDeadLetterKey =
      options.merchantShopAuditDeadLetterKey ?? `${this.merchantShopAuditOutboxKey}:dlq`;
    this.merchantShopAuditConflictKey =
      options.merchantShopAuditConflictKey ?? `${this.merchantShopAuditOutboxKey}:conflicts`;
    this.merchantShopAuditGroup =
      options.merchantShopAuditGroup ?? MERCHANT_SHOP_SWITCH_AUDIT_GROUP;
    this.merchantShopAuditConsumer =
      options.merchantShopAuditConsumer ??
      `${MERCHANT_SHOP_SWITCH_AUDIT_CONSUMER}:${hostname()}:${process.pid}:${randomUUID()}`;
    this.merchantShopAuditClaimIdleMs = Math.max(
      0,
      Math.floor(options.merchantShopAuditClaimIdleMs ?? 30_000)
    );
    this.merchantShopAuditBatchSize = Math.max(
      1,
      Math.floor(options.merchantShopAuditBatchSize ?? 20)
    );
    this.merchantShopAuditDeadLetterMaxLength = Math.max(
      1,
      Math.floor(options.merchantShopAuditDeadLetterMaxLength ?? 1_000)
    );
    this.merchantShopAuditConflictTtlSeconds = Math.max(
      1,
      Math.floor(options.merchantShopAuditConflictTtlSeconds ?? 7 * 24 * 60 * 60)
    );
    this.onSecurityEvent = options.onSecurityEvent ?? (() => undefined);
  }

  public async getLoginLock(email: string): Promise<boolean> {
    return (await this.getValue(this.loginLockKey(email))) !== null;
  }

  public async getAccountLoginLock(userId: number): Promise<boolean> {
    return (await this.getValue(this.accountLoginLockKey(userId))) !== null;
  }

  public async recordFailedLogin(
    ip: string,
    email: string,
    options: LoginFailureOptions
  ): Promise<LoginFailureResult> {
    const client = await this.connect();
    const key = this.loginFailureKey(ip, email);
    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, options.windowSeconds);
    }

    if (count >= options.failureLimit) {
      await client.set(this.loginLockKey(email), "1", {
        EX: options.lockSeconds
      });
      return { count, locked: true };
    }

    return { count, locked: false };
  }

  public async clearFailedLogin(ip: string, email: string): Promise<void> {
    const client = await this.connect();
    await client.del(this.loginFailureKey(ip, email));
    await client.del(this.loginLockKey(email));
  }

  public async recordFailedLoginForAccount(
    userId: number,
    options: LoginFailureOptions
  ): Promise<LoginFailureResult> {
    const [result, count] = await this.eval(
      ACCOUNT_LOGIN_FAILURE_LUA,
      [this.accountLoginFailureKey(userId), this.accountLoginLockKey(userId)],
      [String(options.failureLimit), String(options.windowSeconds), String(options.lockSeconds)]
    );
    return { count: Number(count), locked: result === "locked" };
  }

  public async clearFailedLoginForAccount(userId: number): Promise<void> {
    await this.eval(
      ACCOUNT_LOGIN_CLEAR_LUA,
      [this.accountLoginFailureKey(userId), this.accountLoginLockKey(userId)],
      []
    );
  }

  public async storeOtp(email: string, otp: string, ttlSeconds: number): Promise<void> {
    await this.setValue(this.otpKey(email), otp, ttlSeconds);
  }

  public async getOtp(email: string): Promise<string | null> {
    return this.getValue(this.otpKey(email));
  }

  public async deleteOtp(email: string): Promise<void> {
    await this.deleteValue(this.otpKey(email));
  }

  public async hasOtpCooldown(email: string): Promise<boolean> {
    return (await this.getValue(this.otpCooldownKey(email))) !== null;
  }

  public async storeOtpCooldown(email: string, ttlSeconds: number): Promise<void> {
    await this.setValue(this.otpCooldownKey(email), "1", ttlSeconds);
  }

  public async clearOtpCooldown(email: string): Promise<void> {
    await this.deleteValue(this.otpCooldownKey(email));
  }

  public async getSessionGeneration(userId: number): Promise<number> {
    const value = await this.getValue(this.sessionGenerationKey(userId));
    return value === null ? 0 : Number.parseInt(value, 10) || 0;
  }

  public async storeRefreshToken(
    userId: number,
    jti: string,
    ttlSeconds: number,
    generation = 0
  ): Promise<boolean> {
    const [result] = await this.eval(
      REFRESH_STORE_LUA,
      [
        this.refreshKey(userId, jti),
        this.refreshUserKey(userId),
        this.sessionGenerationKey(userId)
      ],
      [jti, String(ttlSeconds), String(generation), this.refreshKey(userId, "")]
    );
    return result === "ok";
  }

  public async rotateRefreshToken(input: {
    userId: number;
    generation: number;
    oldJti: string;
    newJti: string;
    ttlSeconds: number;
  }): Promise<boolean> {
    const [result] = await this.eval(
      REFRESH_ROTATE_LUA,
      [
        this.refreshKey(input.userId, input.oldJti),
        this.refreshKey(input.userId, input.newJti),
        this.refreshUserKey(input.userId),
        this.sessionGenerationKey(input.userId)
      ],
      [input.oldJti, input.newJti, String(input.ttlSeconds), String(input.generation)]
    );
    return result === "ok";
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
  }): Promise<MerchantShopSwitchCommitResult> {
    const keys = [
      this.refreshKey(input.userId, input.oldRefreshJti),
      this.refreshKey(input.userId, input.newRefreshJti),
      this.refreshUserKey(input.userId),
      this.sessionGenerationKey(input.userId),
      this.accessBlacklistKey(input.oldAccessJti),
      this.merchantShopSwitchReceiptKey(input.operationId),
      this.merchantShopAuditOutboxKey
    ];
    const args = [
      input.oldRefreshJti,
      input.newRefreshJti,
      String(input.refreshTtlSeconds),
      String(input.generation),
      String(input.oldAccessExpiresAt),
      input.oldAccessJti,
      input.operationId,
      input.operationHash,
      String(input.auditId),
      String(input.receiptTtlSeconds)
    ];

    const deadline = Date.now() + this.merchantShopSwitchReconcileDeadlineMs;
    let lastError: unknown;
    for (let attempt = 0; attempt < this.merchantShopSwitchMaxAttempts; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      try {
        const response = await this.evalWithTimeout(
          MERCHANT_SHOP_SWITCH_COMPLETE_LUA,
          keys,
          args,
          Math.min(this.operationTimeoutMs, remainingMs)
        );
        const result = this.parseMerchantShopSwitchResult(response);
        if (result.status === "collision") {
          this.onSecurityEvent({ operation: input.operationId, reason: "receipt_collision" });
        } else if (result.status === "rejected" && result.reason.startsWith("post_state_")) {
          this.onSecurityEvent({ operation: input.operationId, reason: result.reason });
        }
        return result;
      } catch (error) {
        lastError = error;
        if (!this.isUncertainRedisError(error)) throw error;
      }
    }
    throw this.redisUnavailableError(lastError);
  }

  public async readMerchantShopSwitchAuditOutbox(
    options: MerchantShopSwitchAuditOutboxReadOptions
  ): Promise<MerchantShopSwitchAuditOutboxReadPage> {
    const client = await this.connectMerchantShopAuditOutbox(options.abortSignal);
    try {
      await client.xGroupCreate(this.merchantShopAuditOutboxKey, this.merchantShopAuditGroup, "0", {
        MKSTREAM: true
      });
    } catch (error) {
      if (!this.isBusyGroupError(error)) throw this.redisUnavailableError(error);
    }

    try {
      const claimed = await client.xAutoClaim(
        this.merchantShopAuditOutboxKey,
        this.merchantShopAuditGroup,
        this.merchantShopAuditConsumer,
        this.merchantShopAuditClaimIdleMs,
        options.pendingCursor,
        { COUNT: this.merchantShopAuditBatchSize }
      );
      const pending = claimed.messages.flatMap((message) =>
        message
          ? [{ id: String(message.id), message: message.message as Record<string, string> }]
          : []
      );
      const fresh = await this.readMerchantShopSwitchAuditMessages(client, ">");
      const messages = [...pending, ...fresh];
      const deliveryCounts = await Promise.all(
        messages.map(async ({ id }) => {
          const entries = await client.xPendingRange(
            this.merchantShopAuditOutboxKey,
            this.merchantShopAuditGroup,
            id,
            id,
            1
          );
          return Math.max(1, Number(entries[0]?.deliveriesCounter ?? 1));
        })
      );
      return {
        items: messages.map(({ id, message }, index): MerchantShopSwitchAuditOutboxItem => {
          const deliveryCount = deliveryCounts[index] ?? 1;
          const auditId = Number.parseInt(message.auditId ?? "", 10);
          if (
            !Number.isSafeInteger(auditId) ||
            auditId <= 0 ||
            !message.operationId ||
            message.status !== "completed"
          ) {
            return {
              kind: "poison",
              streamId: id,
              reason: "invalid_completion_event",
              deliveryCount
            };
          }
          return {
            kind: "completion",
            streamId: id,
            auditId,
            operationId: message.operationId,
            status: "completed" as const,
            deliveryCount
          };
        }),
        nextPendingCursor: String(claimed.nextId)
      };
    } catch (error) {
      throw this.redisUnavailableError(error);
    }
  }

  public async acknowledgeMerchantShopSwitchAuditOutbox(
    event: MerchantShopSwitchAuditOutboxEvent,
    options: MerchantShopSwitchAuditOutboxCommandOptions = {}
  ): Promise<void> {
    const response = await this.evalMerchantShopAuditOutbox(
      MERCHANT_SHOP_SWITCH_AUDIT_ACK_LUA,
      [
        this.merchantShopAuditOutboxKey,
        this.merchantShopSwitchReceiptKey(event.operationId),
        this.merchantShopAuditConflictKey
      ],
      [this.merchantShopAuditGroup, event.streamId, event.operationId],
      options.abortSignal
    );
    if (!this.isExactOkResponse(response)) {
      throw this.redisUnavailableError(new Error("Audit ACK rejected"));
    }
  }

  public async deadLetterMerchantShopSwitchAuditOutbox(
    event: MerchantShopSwitchAuditPoisonEvent,
    options: MerchantShopSwitchAuditOutboxCommandOptions = {}
  ): Promise<void> {
    const response = await this.evalMerchantShopAuditOutbox(
      MERCHANT_SHOP_SWITCH_AUDIT_DEAD_LETTER_LUA,
      [
        this.merchantShopAuditOutboxKey,
        this.merchantShopAuditDeadLetterKey,
        this.merchantShopAuditConflictKey
      ],
      [
        this.merchantShopAuditGroup,
        event.streamId,
        event.reason,
        String(this.merchantShopAuditDeadLetterMaxLength)
      ],
      options.abortSignal
    );
    if (!this.isExactOkResponse(response)) {
      throw this.redisUnavailableError(new Error("DLQ write rejected"));
    }
  }

  public async recordMerchantShopSwitchAuditConflict(
    event: MerchantShopSwitchAuditOutboxEvent,
    options: MerchantShopSwitchAuditOutboxCommandOptions = {}
  ): Promise<number> {
    const response = await this.evalMerchantShopAuditOutbox(
      MERCHANT_SHOP_SWITCH_AUDIT_CONFLICT_LUA,
      [this.merchantShopAuditConflictKey],
      [event.streamId, String(this.merchantShopAuditConflictTtlSeconds)],
      options.abortSignal
    );
    const count = Number(response[1]);
    if (
      response.length !== 2 ||
      response[0] !== "ok" ||
      !Number.isSafeInteger(count) ||
      count <= 0
    ) {
      throw this.redisUnavailableError(new Error("Audit conflict increment rejected"));
    }
    return count;
  }

  public async getMerchantShopSwitchAuditOutboxStats(
    options: MerchantShopSwitchAuditOutboxCommandOptions = {}
  ): Promise<MerchantShopSwitchAuditOutboxStats> {
    const client = await this.connectMerchantShopAuditOutbox(options.abortSignal);
    try {
      const [streamLength, pending, deadLetterLength] = await Promise.all([
        client.xLen(this.merchantShopAuditOutboxKey),
        client.xPending(this.merchantShopAuditOutboxKey, this.merchantShopAuditGroup),
        client.xLen(this.merchantShopAuditDeadLetterKey)
      ]);
      return { streamLength, pendingCount: pending.pending, deadLetterLength };
    } catch (error) {
      throw this.redisUnavailableError(error);
    }
  }

  public async completeGoogleUnlink(input: {
    userId: number;
    challengeId: string;
    reservationToken: string;
    accessTokenJti: string;
    recoveryProof: string;
    accessTokenTtlSeconds: number;
    sessionGeneration: number;
  }): Promise<boolean> {
    const [result] = await this.eval(
      GOOGLE_UNLINK_COMPLETE_LUA,
      [
        `auth:verification:email:${input.challengeId}`,
        this.refreshUserKey(input.userId),
        this.sessionGenerationKey(input.userId),
        this.accessBlacklistKey(input.accessTokenJti),
        `auth:verification:unlink-complete:${input.challengeId}`
      ],
      [
        String(input.userId),
        input.reservationToken,
        this.refreshKey(input.userId, ""),
        String(Math.max(0, input.accessTokenTtlSeconds)),
        "600",
        String(input.sessionGeneration),
        input.recoveryProof
      ]
    );
    return result === "ok" || result === "already_completed";
  }

  public async getGoogleUnlinkCompletion(input: {
    userId: number;
    challengeId: string;
    recoveryProof: string;
  }): Promise<boolean> {
    return (
      (await this.getValue(`auth:verification:unlink-complete:${input.challengeId}`)) ===
      `${input.userId}:${input.recoveryProof}`
    );
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return (await this.getValue(this.refreshKey(userId, jti))) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    await this.eval(
      REFRESH_REVOKE_ONE_LUA,
      [this.refreshKey(userId, jti), this.refreshUserKey(userId)],
      [jti]
    );
  }

  public async revokeAllRefreshTokens(userId: number, sessionGeneration?: number): Promise<void> {
    await this.eval(
      REFRESH_REVOKE_ALL_LUA,
      [this.refreshUserKey(userId), this.sessionGenerationKey(userId)],
      [String(userId), ...(sessionGeneration === undefined ? [] : [String(sessionGeneration)])]
    );
  }

  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }

    await this.setValue(this.accessBlacklistKey(jti), "1", ttlSeconds);
  }

  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return (await this.getValue(this.accessBlacklistKey(jti))) !== null;
  }

  private async connect(): Promise<RedisClient> {
    const client = this.getClient();
    if (!client.isOpen) {
      await this.withRedisUnavailableGuard(() => client.connect());
    }

    return client;
  }

  private async setValue(key: string, value: string, ttlSeconds: number): Promise<void> {
    const client = await this.connect();
    await this.withRedisUnavailableGuard(() =>
      client.set(key, value, {
        EX: ttlSeconds
      })
    );
  }

  private async eval(script: string, keys: string[], args: string[]): Promise<string[]> {
    const client = await this.connect();
    const response = await this.withRedisUnavailableGuard(() =>
      client.eval(script, { keys, arguments: args })
    );
    return Array.isArray(response) ? response.map((value) => String(value)) : [];
  }

  private async connectMerchantShopAuditOutbox(abortSignal?: AbortSignal): Promise<RedisClient> {
    const client = this.getClient();
    try {
      if (abortSignal?.aborted) throw abortSignal.reason;
      if (!client.isOpen) await client.connect();
      return client.withCommandOptions({
        abortSignal,
        timeout: this.operationTimeoutMs
      }) as RedisClient;
    } catch (error) {
      throw this.redisUnavailableError(error);
    }
  }

  private async evalMerchantShopAuditOutbox(
    script: string,
    keys: string[],
    args: string[],
    abortSignal?: AbortSignal
  ): Promise<string[]> {
    const client = await this.connectMerchantShopAuditOutbox(abortSignal);
    try {
      const response = await client.eval(script, { keys, arguments: args });
      return Array.isArray(response) ? response.map((value) => String(value)) : [];
    } catch (error) {
      throw this.redisUnavailableError(error);
    }
  }

  private isExactOkResponse(response: string[]): boolean {
    return response.length === 1 && response[0] === "ok";
  }

  private async evalWithTimeout(
    script: string,
    keys: string[],
    args: string[],
    timeoutMs: number
  ): Promise<string[]> {
    const client = this.getClient();
    const response = await this.withRedisUnavailableGuard(async () => {
      if (!client.isOpen) await client.connect();
      return client.eval(script, { keys, arguments: args });
    }, timeoutMs);
    return Array.isArray(response) ? response.map((value) => String(value)) : [];
  }

  private parseMerchantShopSwitchResult(response: string[]): MerchantShopSwitchCommitResult {
    const [status, reason] = response;
    if (status === "committed" || status === "already_committed") return { status };
    if (status === "collision") return { status };
    return { status: "rejected", reason: reason ?? status ?? "invalid_state" };
  }

  private async readMerchantShopSwitchAuditMessages(
    client: RedisClient,
    id: "0" | ">"
  ): Promise<Array<{ id: string; message: Record<string, string> }>> {
    const response = await client.xReadGroup(
      this.merchantShopAuditGroup,
      this.merchantShopAuditConsumer,
      { key: this.merchantShopAuditOutboxKey, id },
      { COUNT: this.merchantShopAuditBatchSize }
    );
    const streams = response as Array<{
      name: string;
      messages: Array<{ id: string; message: Record<string, string> }>;
    }> | null;
    if (!streams) return [];
    return streams.flatMap((stream) =>
      stream.messages.map((entry) => ({
        id: String(entry.id),
        message: entry.message as Record<string, string>
      }))
    );
  }

  private async getValue(key: string): Promise<string | null> {
    const client = await this.connect();
    return this.withRedisUnavailableGuard(() => client.get(key));
  }

  private async deleteValue(key: string): Promise<void> {
    const client = await this.connect();
    await this.withRedisUnavailableGuard(() => client.del(key));
  }

  private async withRedisUnavailableGuard<T>(
    operation: () => Promise<T>,
    timeoutMs = this.operationTimeoutMs
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Redis operation timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        })
      ]);
    } catch (error) {
      throw this.redisUnavailableError(error);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private redisUnavailableError(cause: unknown): AppError {
    if (cause instanceof AppError) {
      return cause;
    }

    return new AppError({
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "error.dependency.redis_unavailable",
      statusCode: 503,
      cause
    });
  }

  private isUncertainRedisError(error: unknown): boolean {
    const cause = error instanceof Error && "cause" in error ? error.cause : error;
    const candidates = [cause];
    if (cause instanceof AggregateError) candidates.push(...cause.errors);
    return candidates.some((candidate) => {
      const message = candidate instanceof Error ? candidate.message : String(candidate);
      const code =
        typeof candidate === "object" && candidate !== null && "code" in candidate
          ? String(candidate.code)
          : "";
      return (
        message.includes("Redis operation timed out") ||
        /socket|connection|ECONN|EPIPE|closed|READONLY|LOADING|TRYAGAIN|BUSY/i.test(
          `${code} ${message}`
        )
      );
    });
  }

  private isBusyGroupError(error: unknown): boolean {
    const cause = error instanceof Error && "cause" in error ? error.cause : error;
    return (cause instanceof Error ? cause.message : String(cause)).includes("BUSYGROUP");
  }

  private loginFailureKey(ip: string, email: string): string {
    return `login:fail:${ip}:${email}`;
  }

  private loginLockKey(email: string): string {
    return `login:lock:${email}`;
  }

  private accountLoginFailureKey(userId: number): string {
    return `auth:v2:login:account:fail:${userId}`;
  }

  private accountLoginLockKey(userId: number): string {
    return `auth:v2:login:account:lock:${userId}`;
  }

  private otpKey(email: string): string {
    return `otp:${email}`;
  }

  private otpCooldownKey(email: string): string {
    return `otp:cooldown:${email}`;
  }

  private refreshKey(userId: number, jti: string): string {
    return `auth:v2:refresh:${userId}:${jti}`;
  }

  private refreshUserKey(userId: number): string {
    return `auth:v2:refresh:user:${userId}`;
  }

  private accessBlacklistKey(jti: string): string {
    return `token:blacklist:${jti}`;
  }

  private merchantShopSwitchReceiptKey(operationId: string): string {
    return `auth:v2:merchant-shop-switch:receipt:${operationId}`;
  }

  private sessionGenerationKey(userId: number): string {
    return `auth:v2:session:generation:${userId}`;
  }
}

const MERCHANT_SHOP_SWITCH_AUDIT_OUTBOX_KEY = "auth:v2:audit:merchant-shop-switch";
const MERCHANT_SHOP_SWITCH_AUDIT_GROUP = "auth-merchant-shop-switch-audit";
const MERCHANT_SHOP_SWITCH_AUDIT_CONSUMER = "auth-merchant-shop-switch-audit-worker";

const REFRESH_STORE_LUA = `
-- auth-refresh-store
local generation = redis.call('GET', KEYS[3])
local requestedGeneration = tonumber(ARGV[3])
local currentGeneration = generation and tonumber(generation) or nil
if not requestedGeneration or requestedGeneration < 0 or requestedGeneration % 1 ~= 0 then
  return {'generation_mismatch'}
end
if generation and (not currentGeneration or currentGeneration < 0 or currentGeneration % 1 ~= 0) then
  return {'generation_mismatch'}
end
if currentGeneration and currentGeneration > requestedGeneration then
  return {'generation_mismatch'}
end
if not currentGeneration or currentGeneration < requestedGeneration then
  local jtis = redis.call('SMEMBERS', KEYS[2])
  redis.call('DEL', KEYS[2])
  for _, indexedJti in ipairs(jtis) do redis.call('DEL', ARGV[4] .. indexedJti) end
  redis.call('SET', KEYS[3], ARGV[3])
end
redis.call('SET', KEYS[1], '1', 'EX', ARGV[2])
redis.call('SADD', KEYS[2], ARGV[1])
local indexTtl = redis.call('TTL', KEYS[2])
if indexTtl < tonumber(ARGV[2]) then redis.call('EXPIRE', KEYS[2], ARGV[2]) end
return {'ok'}
`;

const REFRESH_ROTATE_LUA = `
-- auth-refresh-rotate
local generation = redis.call('GET', KEYS[4])
if not generation then redis.call('SET', KEYS[4], ARGV[4]); generation = ARGV[4] end
if generation ~= ARGV[4] then return {'generation_mismatch'} end
if redis.call('EXISTS', KEYS[1]) == 0 then return {'missing'} end
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[3], ARGV[1])
redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
redis.call('SADD', KEYS[3], ARGV[2])
local indexTtl = redis.call('TTL', KEYS[3])
if indexTtl < tonumber(ARGV[3]) then redis.call('EXPIRE', KEYS[3], ARGV[3]) end
return {'ok'}
`;

const MERCHANT_SHOP_SWITCH_COMPLETE_LUA = `
-- auth-merchant-shop-switch-complete
local MAX_STREAM_ID = '18446744073709551615-18446744073709551615'
local function keyType(key)
  local result = redis.call('TYPE', key)
  if type(result) == 'table' then return result.ok end
  return result
end

local function streamHasCapacity(key)
  if keyType(key) == 'none' then return true end
  local info = redis.call('XINFO', 'STREAM', key)
  for index = 1, #info, 2 do
    if info[index] == 'last-generated-id' then
      return info[index + 1] ~= MAX_STREAM_ID
    end
  end
  return false
end

local function canRun(command, ...)
  if redis.acl_check_cmd and not redis.acl_check_cmd(command, ...) then return false end
  return true
end

local function streamEventMatches(streamId)
  local entries = redis.call('XRANGE', KEYS[7], streamId, streamId)
  if #entries ~= 1 then return false end
  local fields = entries[1][2]
  local values = {}
  for index = 1, #fields, 2 do values[fields[index]] = fields[index + 1] end
  return values.auditId == ARGV[9] and values.operationId == ARGV[7] and values.status == 'completed'
end

local function receiptFields()
  local fields = redis.call('HGETALL', KEYS[6])
  local values = {}
  for index = 1, #fields, 2 do values[fields[index]] = fields[index + 1] end
  return values
end

local refreshTtl = tonumber(ARGV[3])
local generationNumber = tonumber(ARGV[4])
local oldAccessExpiresAt = tonumber(ARGV[5])
local auditId = tonumber(ARGV[9])
local receiptTtl = tonumber(ARGV[10])
if not refreshTtl or refreshTtl <= 0 or refreshTtl % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if not generationNumber or generationNumber < 0 or generationNumber % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if not oldAccessExpiresAt or oldAccessExpiresAt <= 0 or oldAccessExpiresAt % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if not auditId or auditId <= 0 or auditId % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if not receiptTtl or receiptTtl <= 0 or receiptTtl % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if ARGV[6] == '' or ARGV[7] == '' or not string.match(ARGV[8], '^[0-9a-fA-F]+$') or string.len(ARGV[8]) ~= 64 then
  return {'rejected', 'invalid_state'}
end
if KEYS[1] == KEYS[2] or ARGV[1] == ARGV[2] then return {'rejected', 'invalid_state'} end

local receiptType = keyType(KEYS[6])
if receiptType ~= 'none' then
  if receiptType ~= 'hash' or redis.call('TTL', KEYS[6]) <= 0 then
    return {'rejected', 'post_state_mismatch'}
  end
  local receipt = receiptFields()
  if receipt.operationHash ~= ARGV[8] then return {'collision'} end
  if receipt.auditId ~= ARGV[9] or receipt.newRefreshJti ~= ARGV[2] or
    receipt.oldAccessJti ~= ARGV[6] or receipt.oldAccessExpiresAt ~= ARGV[5] or
    (receipt.auditState ~= 'pending' and receipt.auditState ~= 'completed') or
    not receipt.outboxId then
    return {'rejected', 'post_state_mismatch'}
  end
  if keyType(KEYS[1]) ~= 'none' or keyType(KEYS[2]) ~= 'string' or
    redis.call('GET', KEYS[2]) ~= '1' or redis.call('TTL', KEYS[2]) <= 0 then
    return {'rejected', 'post_state_mismatch'}
  end
  if keyType(KEYS[3]) ~= 'set' or redis.call('SISMEMBER', KEYS[3], ARGV[2]) ~= 1 or
    redis.call('SISMEMBER', KEYS[3], ARGV[1]) ~= 0 or redis.call('TTL', KEYS[3]) <= 0 then
    return {'rejected', 'post_state_mismatch'}
  end
  if keyType(KEYS[4]) ~= 'string' or redis.call('GET', KEYS[4]) ~= ARGV[4] or
    redis.call('TTL', KEYS[4]) ~= -1 then
    return {'rejected', 'post_state_mismatch'}
  end
  local now = tonumber(redis.call('TIME')[1])
  if now < oldAccessExpiresAt and
    (keyType(KEYS[5]) ~= 'string' or redis.call('GET', KEYS[5]) ~= '1' or redis.call('TTL', KEYS[5]) <= 0) then
    return {'rejected', 'post_state_mismatch'}
  end
  if receipt.auditState == 'completed' then return {'already_committed'} end
  local outboxType = keyType(KEYS[7])
  if outboxType ~= 'none' and outboxType ~= 'stream' then
    return {'rejected', 'post_state_mismatch'}
  end
  if outboxType == 'stream' and streamEventMatches(receipt.outboxId) then
    return {'already_committed'}
  end
  if not streamHasCapacity(KEYS[7]) or
    not canRun('XADD', KEYS[7], '*', 'auditId', ARGV[9], 'operationId', ARGV[7], 'status', 'completed') or
    not canRun('HSET', KEYS[6], 'outboxId', '0-0') then
    return {'rejected', 'post_state_mismatch'}
  end
  local repairedId = redis.call(
    'XADD', KEYS[7], '*',
    'auditId', ARGV[9], 'operationId', ARGV[7], 'status', 'completed'
  )
  redis.call('HSET', KEYS[6], 'outboxId', repairedId)
  return {'already_committed'}
end

local oldRefreshType = keyType(KEYS[1])
if oldRefreshType == 'none' then return {'rejected', 'post_state_unknown'} end
if oldRefreshType ~= 'string' or redis.call('GET', KEYS[1]) ~= '1' then
  return {'rejected', 'missing'}
end
if redis.call('TTL', KEYS[1]) <= 0 then return {'rejected', 'invalid_state'} end
if keyType(KEYS[2]) ~= 'none' then return {'rejected', 'new_refresh_exists'} end
if keyType(KEYS[3]) ~= 'set' then return {'rejected', 'invalid_state'} end
if redis.call('SISMEMBER', KEYS[3], ARGV[1]) ~= 1 then return {'rejected', 'invalid_state'} end
if redis.call('TTL', KEYS[3]) <= 0 then return {'rejected', 'invalid_state'} end
if keyType(KEYS[4]) ~= 'string' or redis.call('GET', KEYS[4]) ~= ARGV[4] then
  return {'rejected', 'generation_mismatch'}
end
if redis.call('TTL', KEYS[4]) ~= -1 then return {'rejected', 'invalid_state'} end
if keyType(KEYS[5]) ~= 'none' then return {'rejected', 'invalid_state'} end
local outboxType = keyType(KEYS[7])
if outboxType ~= 'none' and outboxType ~= 'stream' then return {'rejected', 'invalid_state'} end
if not streamHasCapacity(KEYS[7]) then return {'rejected', 'outbox_exhausted'} end

local now = tonumber(redis.call('TIME')[1])
local accessTtl = math.max(0, oldAccessExpiresAt - now)
if not canRun('XADD', KEYS[7], '*', 'auditId', ARGV[9], 'operationId', ARGV[7], 'status', 'completed') or
  not canRun('DEL', KEYS[1]) or not canRun('SREM', KEYS[3], ARGV[1]) or
  not canRun('SET', KEYS[2], '1', 'EX', ARGV[3]) or not canRun('SADD', KEYS[3], ARGV[2]) or
  not canRun('EXPIRE', KEYS[3], ARGV[3]) or
  (accessTtl > 0 and not canRun('SET', KEYS[5], '1', 'EX', tostring(accessTtl))) or
  not canRun('HSET', KEYS[6], 'operationHash', ARGV[8]) or
  not canRun('EXPIRE', KEYS[6], ARGV[10]) then
  return {'rejected', 'permission_denied'}
end

local outboxId = redis.call(
  'XADD', KEYS[7], '*',
  'auditId', ARGV[9], 'operationId', ARGV[7], 'status', 'completed'
)
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[3], ARGV[1])
redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
redis.call('SADD', KEYS[3], ARGV[2])
local indexTtl = redis.call('TTL', KEYS[3])
if indexTtl < refreshTtl then redis.call('EXPIRE', KEYS[3], ARGV[3]) end
if accessTtl > 0 then redis.call('SET', KEYS[5], '1', 'EX', tostring(accessTtl)) end
redis.call(
  'HSET', KEYS[6],
  'operationHash', ARGV[8],
  'auditId', ARGV[9],
  'newRefreshJti', ARGV[2],
  'oldAccessJti', ARGV[6],
  'oldAccessExpiresAt', ARGV[5],
  'outboxId', outboxId,
  'auditState', 'pending'
)
redis.call('EXPIRE', KEYS[6], ARGV[10])
return {'committed'}
`;

const MERCHANT_SHOP_SWITCH_AUDIT_ACK_LUA = `
-- auth-merchant-shop-switch-audit-ack
local function keyType(key)
  local result = redis.call('TYPE', key)
  if type(result) == 'table' then return result.ok end
  return result
end
local streamType = keyType(KEYS[1])
if streamType ~= 'stream' then return {'rejected'} end
local receiptType = keyType(KEYS[2])
if receiptType ~= 'none' and receiptType ~= 'hash' then return {'rejected'} end
local conflictType = keyType(KEYS[3])
if conflictType ~= 'none' and conflictType ~= 'hash' then return {'rejected'} end
if redis.acl_check_cmd and (
  not redis.acl_check_cmd('XACK', KEYS[1], ARGV[1], ARGV[2]) or
  not redis.acl_check_cmd('XDEL', KEYS[1], ARGV[2]) or
  (conflictType == 'hash' and not redis.acl_check_cmd('HDEL', KEYS[3], ARGV[2])) or
  (receiptType == 'hash' and not redis.acl_check_cmd('HSET', KEYS[2], 'auditState', 'completed'))
) then return {'rejected'} end
if receiptType == 'hash' and redis.call('HGET', KEYS[2], 'outboxId') == ARGV[2] and
  redis.call('HGET', KEYS[2], 'auditState') == 'pending' then
  redis.call('HSET', KEYS[2], 'auditState', 'completed')
end
redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
redis.call('XDEL', KEYS[1], ARGV[2])
if conflictType == 'hash' then redis.call('HDEL', KEYS[3], ARGV[2]) end
return {'ok'}
`;

const MERCHANT_SHOP_SWITCH_AUDIT_DEAD_LETTER_LUA = `
-- auth-merchant-shop-switch-audit-dead-letter
local MAX_STREAM_ID = '18446744073709551615-18446744073709551615'
local function keyType(key)
  local result = redis.call('TYPE', key)
  if type(result) == 'table' then return result.ok end
  return result
end
local function streamHasCapacity(key)
  if keyType(key) == 'none' then return true end
  local info = redis.call('XINFO', 'STREAM', key)
  for index = 1, #info, 2 do
    if info[index] == 'last-generated-id' then return info[index + 1] ~= MAX_STREAM_ID end
  end
  return false
end
if keyType(KEYS[1]) ~= 'stream' then return {'rejected'} end
local dlqType = keyType(KEYS[2])
if dlqType ~= 'none' and dlqType ~= 'stream' then return {'rejected'} end
local conflictType = keyType(KEYS[3])
if conflictType ~= 'none' and conflictType ~= 'hash' then return {'rejected'} end
if not streamHasCapacity(KEYS[2]) then return {'rejected'} end
if redis.acl_check_cmd and (
  not redis.acl_check_cmd('XADD', KEYS[2], 'MAXLEN', ARGV[4], '*', 'sourceStreamId', ARGV[2], 'reason', ARGV[3], 'status', 'poison') or
  not redis.acl_check_cmd('XACK', KEYS[1], ARGV[1], ARGV[2]) or
  not redis.acl_check_cmd('XDEL', KEYS[1], ARGV[2]) or
  (conflictType == 'hash' and not redis.acl_check_cmd('HDEL', KEYS[3], ARGV[2]))
) then return {'rejected'} end
redis.call(
  'XADD', KEYS[2], 'MAXLEN', ARGV[4], '*',
  'sourceStreamId', ARGV[2], 'reason', ARGV[3], 'status', 'poison'
)
redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
redis.call('XDEL', KEYS[1], ARGV[2])
if conflictType == 'hash' then redis.call('HDEL', KEYS[3], ARGV[2]) end
return {'ok'}
`;

const MERCHANT_SHOP_SWITCH_AUDIT_CONFLICT_LUA = `
-- auth-merchant-shop-switch-audit-conflict
local function keyType(key)
  local result = redis.call('TYPE', key)
  if type(result) == 'table' then return result.ok end
  return result
end
local conflictType = keyType(KEYS[1])
if conflictType ~= 'none' and conflictType ~= 'hash' then return {'rejected'} end
local current = conflictType == 'hash' and redis.call('HGET', KEYS[1], ARGV[1]) or false
if current and (string.match(current, '^%d+$') == nil or string.len(current) > 9) then
  return {'rejected'}
end
if redis.acl_check_cmd and (
  not redis.acl_check_cmd('HINCRBY', KEYS[1], ARGV[1], '1') or
  not redis.acl_check_cmd('EXPIRE', KEYS[1], ARGV[2])
) then return {'rejected'} end
local count = redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
redis.call('EXPIRE', KEYS[1], ARGV[2])
return {'ok', tostring(count)}
`;

const GOOGLE_UNLINK_COMPLETE_LUA = `
-- auth-google-unlink-complete
local receipt = redis.call('GET', KEYS[5])
if receipt == ARGV[1] .. ':' .. ARGV[7] then return {'already_completed'} end
local serialized = redis.call('GET', KEYS[1])
if not serialized then return {'missing'} end
local ok, challenge = pcall(cjson.decode, serialized)
if not ok or challenge.reservationToken ~= ARGV[2] then return {'reservation_mismatch'} end
local jtis = redis.call('SMEMBERS', KEYS[2])
redis.call('DEL', KEYS[2])
for _, jti in ipairs(jtis) do redis.call('DEL', ARGV[3] .. jti) end
redis.call('SET', KEYS[3], ARGV[6])
if tonumber(ARGV[4]) > 0 then redis.call('SET', KEYS[4], '1', 'EX', ARGV[4]) end
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[5], ARGV[1] .. ':' .. ARGV[7], 'EX', ARGV[5])
return {'ok'}
`;

const ACCOUNT_LOGIN_FAILURE_LUA = `
-- auth-account-login-failure
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if count >= tonumber(ARGV[1]) then
  redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
  return {'locked', tostring(count)}
end
return {'ok', tostring(count)}
`;

const ACCOUNT_LOGIN_CLEAR_LUA = `
-- auth-account-login-clear
redis.call('DEL', KEYS[1], KEYS[2])
return {'ok'}
`;

const REFRESH_REVOKE_ONE_LUA = `
-- auth-refresh-revoke-one
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[1])
if redis.call('SCARD', KEYS[2]) == 0 then redis.call('DEL', KEYS[2]) end
return {'ok'}
`;

const REFRESH_REVOKE_ALL_LUA = `
-- auth-refresh-revoke-all
local jtis = redis.call('SMEMBERS', KEYS[1])
redis.call('DEL', KEYS[1])
for _, jti in ipairs(jtis) do redis.call('DEL', 'auth:v2:refresh:' .. ARGV[1] .. ':' .. jti) end
if ARGV[2] then redis.call('SET', KEYS[2], ARGV[2]) end
return {'ok'}
`;
