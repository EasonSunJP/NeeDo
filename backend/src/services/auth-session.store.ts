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
  streamId: string;
  auditId: number;
  operationId: string;
  status: "completed";
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
    oldAccessTtlSeconds: number;
    operationId: string;
    operationHash: string;
    auditId: number;
    receiptTtlSeconds: number;
  }) => Promise<MerchantShopSwitchCommitResult>;
  readMerchantShopSwitchAuditOutbox?: () => Promise<MerchantShopSwitchAuditOutboxEvent[]>;
  acknowledgeMerchantShopSwitchAuditOutbox?: (streamId: string) => Promise<void>;
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
  merchantShopAuditOutboxKey?: string;
  merchantShopAuditGroup?: string;
  merchantShopAuditConsumer?: string;
}

export class RedisAuthSessionStore implements AuthSessionStore {
  private readonly operationTimeoutMs: number;
  private readonly merchantShopAuditOutboxKey: string;
  private readonly merchantShopAuditGroup: string;
  private readonly merchantShopAuditConsumer: string;

  public constructor(
    private readonly getClient: () => RedisClient = getRedisClient,
    options: RedisAuthSessionStoreOptions = {}
  ) {
    this.operationTimeoutMs = options.operationTimeoutMs ?? env.REDIS_CONNECT_TIMEOUT_MS;
    this.merchantShopAuditOutboxKey =
      options.merchantShopAuditOutboxKey ?? MERCHANT_SHOP_SWITCH_AUDIT_OUTBOX_KEY;
    this.merchantShopAuditGroup =
      options.merchantShopAuditGroup ?? MERCHANT_SHOP_SWITCH_AUDIT_GROUP;
    this.merchantShopAuditConsumer =
      options.merchantShopAuditConsumer ?? MERCHANT_SHOP_SWITCH_AUDIT_CONSUMER;
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
      [jti, String(ttlSeconds), String(generation)]
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
    oldAccessTtlSeconds: number;
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
      String(Math.max(0, input.oldAccessTtlSeconds)),
      input.operationId,
      input.operationHash,
      String(input.auditId),
      String(input.receiptTtlSeconds)
    ];

    let response: string[];
    try {
      response = await this.eval(MERCHANT_SHOP_SWITCH_COMPLETE_LUA, keys, args);
    } catch (error) {
      if (!this.isUncertainRedisError(error)) throw error;
      response = await this.evalWithoutOperationTimeout(
        MERCHANT_SHOP_SWITCH_COMPLETE_LUA,
        keys,
        args
      );
    }
    return this.parseMerchantShopSwitchResult(response);
  }

  public async readMerchantShopSwitchAuditOutbox(): Promise<MerchantShopSwitchAuditOutboxEvent[]> {
    const client = await this.connect();
    try {
      await this.withRedisUnavailableGuard(() =>
        client.xGroupCreate(this.merchantShopAuditOutboxKey, this.merchantShopAuditGroup, "0", {
          MKSTREAM: true
        })
      );
    } catch (error) {
      if (!this.isBusyGroupError(error)) throw error;
    }

    const pending = await this.readMerchantShopSwitchAuditMessages(client, "0");
    const fresh = await this.readMerchantShopSwitchAuditMessages(client, ">");
    const messages = [...pending, ...fresh];
    return messages.flatMap(({ id, message }) => {
      const auditId = Number.parseInt(message.auditId ?? "", 10);
      if (
        !Number.isSafeInteger(auditId) ||
        auditId <= 0 ||
        !message.operationId ||
        message.status !== "completed"
      ) {
        return [];
      }
      return [
        {
          streamId: id,
          auditId,
          operationId: message.operationId,
          status: "completed" as const
        }
      ];
    });
  }

  public async acknowledgeMerchantShopSwitchAuditOutbox(streamId: string): Promise<void> {
    const client = await this.connect();
    await this.withRedisUnavailableGuard(() =>
      client.xAck(this.merchantShopAuditOutboxKey, this.merchantShopAuditGroup, streamId)
    );
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

  private async evalWithoutOperationTimeout(
    script: string,
    keys: string[],
    args: string[]
  ): Promise<string[]> {
    const client = await this.connect();
    try {
      const response = await client.eval(script, { keys, arguments: args });
      return Array.isArray(response) ? response.map((value) => String(value)) : [];
    } catch (error) {
      throw this.redisUnavailableError(error);
    }
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
    const response = await this.withRedisUnavailableGuard(() =>
      client.xReadGroup(
        this.merchantShopAuditGroup,
        this.merchantShopAuditConsumer,
        { key: this.merchantShopAuditOutboxKey, id },
        { COUNT: 20 }
      )
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

  private async withRedisUnavailableGuard<T>(operation: () => Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Redis operation timed out after ${this.operationTimeoutMs}ms`)),
            this.operationTimeoutMs
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
    const message = cause instanceof Error ? cause.message : String(cause);
    const code =
      typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : "";
    return (
      message.includes("Redis operation timed out") ||
      /socket|connection|ECONN|EPIPE|closed unexpectedly/i.test(`${code} ${message}`)
    );
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
if not generation then redis.call('SET', KEYS[3], ARGV[3]); generation = ARGV[3] end
if generation ~= ARGV[3] then return {'generation_mismatch'} end
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
local function keyType(key)
  local result = redis.call('TYPE', key)
  if type(result) == 'table' then return result.ok end
  return result
end

local receiptValue = ARGV[8] .. ':' .. ARGV[7] .. ':completed'
local receiptType = keyType(KEYS[6])
if receiptType ~= 'none' then
  if receiptType ~= 'string' or redis.call('TTL', KEYS[6]) <= 0 then
    return {'rejected', 'invalid_state'}
  end
  if redis.call('GET', KEYS[6]) == receiptValue then return {'already_committed'} end
  return {'collision'}
end

local refreshTtl = tonumber(ARGV[3])
local generationNumber = tonumber(ARGV[4])
local accessTtl = tonumber(ARGV[5])
local auditId = tonumber(ARGV[8])
local receiptTtl = tonumber(ARGV[9])
if not refreshTtl or refreshTtl <= 0 or refreshTtl % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if not generationNumber or generationNumber < 0 or generationNumber % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if not accessTtl or accessTtl < 0 or accessTtl % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if not auditId or auditId <= 0 or auditId % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if not receiptTtl or receiptTtl <= 0 or receiptTtl % 1 ~= 0 then
  return {'rejected', 'invalid_state'}
end
if ARGV[6] == '' or not string.match(ARGV[7], '^[0-9a-fA-F]+$') or string.len(ARGV[7]) ~= 64 then
  return {'rejected', 'invalid_state'}
end
if KEYS[1] == KEYS[2] or ARGV[1] == ARGV[2] then return {'rejected', 'invalid_state'} end

if keyType(KEYS[1]) ~= 'string' or redis.call('GET', KEYS[1]) ~= '1' then
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

redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[3], ARGV[1])
redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
redis.call('SADD', KEYS[3], ARGV[2])
local indexTtl = redis.call('TTL', KEYS[3])
if indexTtl < refreshTtl then redis.call('EXPIRE', KEYS[3], ARGV[3]) end
if accessTtl > 0 then redis.call('SET', KEYS[5], '1', 'EX', ARGV[5]) end
redis.call('SET', KEYS[6], receiptValue, 'EX', ARGV[9])
redis.call(
  'XADD', KEYS[7], '*',
  'auditId', ARGV[8],
  'operationId', ARGV[6],
  'status', 'completed'
)
return {'committed'}
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
