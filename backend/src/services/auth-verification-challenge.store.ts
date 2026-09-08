import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID
} from "node:crypto";
import type { RedisClient } from "../config/redis";
import { getRedisClient } from "../config/redis";
import { env } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const EMAIL_CHALLENGE_TTL_SECONDS = 600;
const EMAIL_CHALLENGE_COOLDOWN_SECONDS = 60;
const EMAIL_CHALLENGE_RESERVATION_SECONDS = 30;

export type VerificationPurpose =
  | "email_registration"
  | "password_login"
  | "google_registration_or_link"
  | "google_authenticated_link"
  | "google_unlink"
  | "password_setup";

export interface PasswordChallengeMetadata {
  passwordHash: string;
}

export interface GoogleChallengeMetadata {
  providerSubject: string;
  providerEmail: string;
  providerEmailVerifiedAt: string;
}

export interface PasswordLoginChallengeMetadata {
  loginIdentityId: number;
  platformSettingsVersion: number;
}

export type VerificationChallengeMetadata =
  | PasswordChallengeMetadata
  | PasswordLoginChallengeMetadata
  | GoogleChallengeMetadata
  | Record<string, never>;

export interface CreateVerificationChallengeInput {
  email: string;
  otp: string;
  purpose: VerificationPurpose;
  userId?: number;
  metadata?: Record<string, unknown>;
}

export interface ConsumeVerificationChallengeInput {
  challengeId: string;
  otp: string;
  purpose: VerificationPurpose;
  userId?: number;
}

export interface CreatedChallenge {
  challengeId: string;
  expiresInSeconds: number;
  maskedEmail: string;
}

export interface CreatedGoogleNonce {
  challengeId: string;
  nonce: string;
  expiresInSeconds: number;
}

type ChallengeFailureReason =
  | "missing"
  | "purpose_mismatch"
  | "user_mismatch"
  | "invalid_otp"
  | "attempts_exhausted";

export type ConsumeChallengeResult =
  | { ok: true; email: string; metadata: VerificationChallengeMetadata }
  | {
      ok: false;
      reason: ChallengeFailureReason;
      attempts?: number;
    };

export type ReserveChallengeResult =
  | {
      ok: true;
      email: string;
      metadata: VerificationChallengeMetadata;
      userId?: number;
      reservationToken: string;
    }
  | {
      ok: false;
      reason: ChallengeFailureReason | "reserved";
      attempts?: number;
    };

export interface VerificationChallengeStore {
  createEmailChallenge(input: CreateVerificationChallengeInput): Promise<CreatedChallenge>;
  reserveEmailChallenge(input: ConsumeVerificationChallengeInput): Promise<ReserveChallengeResult>;
  finalizeEmailChallenge(input: {
    challengeId: string;
    reservationToken: string;
  }): Promise<boolean>;
  releaseEmailChallenge(input: { challengeId: string; reservationToken: string }): Promise<boolean>;
  cancelEmailChallenge(input: {
    challengeId: string;
    email: string;
    purpose: VerificationPurpose;
  }): Promise<boolean>;
  consumeEmailChallenge(input: ConsumeVerificationChallengeInput): Promise<ConsumeChallengeResult>;
  createGoogleNonce(input: { userId?: number }): Promise<CreatedGoogleNonce>;
  readGoogleNonce(input: { challengeId: string; userId?: number }): Promise<string | null>;
  consumeGoogleNonce(input: {
    challengeId: string;
    expectedNonce: string;
    userId?: number;
  }): Promise<boolean>;
}

export class VerificationChallengeCooldownError extends Error {
  public readonly reason = "cooldown" as const;

  public constructor() {
    super("Verification challenge cooldown is active");
  }
}

interface RedisVerificationChallengeStoreOptions {
  operationTimeoutMs?: number;
}

export class RedisVerificationChallengeStore implements VerificationChallengeStore {
  private readonly operationTimeoutMs: number;

  public constructor(
    private readonly getClient: () => RedisClient = getRedisClient,
    options: RedisVerificationChallengeStoreOptions = {}
  ) {
    this.operationTimeoutMs = options.operationTimeoutMs ?? env.REDIS_CONNECT_TIMEOUT_MS;
  }

  public async createEmailChallenge(
    input: CreateVerificationChallengeInput
  ): Promise<CreatedChallenge> {
    const metadata = this.normalizeMetadata(input.purpose, input.metadata);
    const challengeId = randomUUID();
    const result = await this.eval(
      EMAIL_CREATE_LUA,
      [this.emailCooldownKey(input.email, input.purpose), this.emailChallengeKey(challengeId)],
      [
        String(EMAIL_CHALLENGE_COOLDOWN_SECONDS),
        challengeId,
        JSON.stringify({
          email: input.email.trim().toLowerCase(),
          purpose: input.purpose,
          userId: input.userId ?? null,
          metadata,
          digest: this.createDigest(challengeId, input.purpose, input.otp),
          attempts: 0
        }),
        String(EMAIL_CHALLENGE_TTL_SECONDS)
      ]
    );
    if (result[0] === "cooldown") {
      throw new VerificationChallengeCooldownError();
    }
    if (result[0] !== "ok") {
      throw new AppError({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        message: "error.dependency.redis_unavailable",
        statusCode: 503
      });
    }

    return {
      challengeId,
      expiresInSeconds: EMAIL_CHALLENGE_TTL_SECONDS,
      maskedEmail: this.maskEmail(input.email)
    };
  }

  public async consumeEmailChallenge(
    input: ConsumeVerificationChallengeInput
  ): Promise<ConsumeChallengeResult> {
    const reserved = await this.reserveEmailChallenge(input);
    if (!reserved.ok) {
      if (reserved.reason === "reserved") return { ok: false, reason: "missing" };
      return {
        ok: false,
        reason: reserved.reason as ChallengeFailureReason,
        attempts: reserved.attempts
      };
    }
    if (
      !(await this.finalizeEmailChallenge({
        challengeId: input.challengeId,
        reservationToken: reserved.reservationToken
      }))
    ) {
      return { ok: false, reason: "missing" };
    }
    return { ok: true, email: reserved.email, metadata: reserved.metadata };
  }

  public async reserveEmailChallenge(
    input: ConsumeVerificationChallengeInput
  ): Promise<ReserveChallengeResult> {
    const reservationToken = randomUUID();
    const response = await this.eval(
      EMAIL_RESERVE_LUA,
      [this.emailChallengeKey(input.challengeId)],
      [
        input.purpose,
        input.userId === undefined ? "" : String(input.userId),
        this.createDigest(input.challengeId, input.purpose, input.otp),
        String(env.AUTH_VERIFICATION_MAX_ATTEMPTS),
        reservationToken
      ]
    );
    const [result, detail] = response;
    if (result === "ok") {
      return { ok: true, reservationToken, ...this.parseConsumedChallenge(detail) };
    }
    if (result === "invalid_otp") {
      return { ok: false, reason: result, attempts: Number(detail) };
    }
    if (
      result === "missing" ||
      result === "purpose_mismatch" ||
      result === "user_mismatch" ||
      result === "attempts_exhausted" ||
      result === "reserved"
    ) {
      return { ok: false, reason: result };
    }

    return { ok: false, reason: "missing" };
  }

  public async finalizeEmailChallenge(input: {
    challengeId: string;
    reservationToken: string;
  }): Promise<boolean> {
    const [result] = await this.eval(
      EMAIL_FINALIZE_LUA,
      [this.emailChallengeKey(input.challengeId)],
      [input.reservationToken]
    );
    return result === "ok";
  }

  public async releaseEmailChallenge(input: {
    challengeId: string;
    reservationToken: string;
  }): Promise<boolean> {
    const [result] = await this.eval(
      EMAIL_RELEASE_LUA,
      [this.emailChallengeKey(input.challengeId)],
      [input.reservationToken]
    );
    return result === "ok";
  }

  public async cancelEmailChallenge(input: {
    challengeId: string;
    email: string;
    purpose: VerificationPurpose;
  }): Promise<boolean> {
    const [result] = await this.eval(
      EMAIL_CANCEL_LUA,
      [
        this.emailChallengeKey(input.challengeId),
        this.emailCooldownKey(input.email, input.purpose)
      ],
      [input.challengeId]
    );
    return result === "ok";
  }

  public async createGoogleNonce(input: { userId?: number }): Promise<CreatedGoogleNonce> {
    const challengeId = randomUUID();
    const nonce = this.createRandomValue();
    await this.setValue(
      this.googleNonceKey(challengeId),
      JSON.stringify({
        userId: input.userId ?? null,
        digest: this.createDigest(challengeId, "google_nonce", nonce),
        encryptedNonce: this.encryptNonce(nonce)
      }),
      env.AUTH_GOOGLE_NONCE_TTL_SECONDS
    );

    return {
      challengeId,
      nonce,
      expiresInSeconds: env.AUTH_GOOGLE_NONCE_TTL_SECONDS
    };
  }

  public async readGoogleNonce(input: {
    challengeId: string;
    userId?: number;
  }): Promise<string | null> {
    const client = await this.connect();
    const serialized = await this.withRedisUnavailableGuard(() =>
      client.get(this.googleNonceKey(input.challengeId))
    );
    if (!serialized) return null;
    try {
      const parsed = JSON.parse(serialized) as {
        userId?: number | null;
        encryptedNonce?: string;
      };
      const storedUserId = parsed.userId ?? undefined;
      if (storedUserId !== input.userId || !parsed.encryptedNonce) return null;
      return this.decryptNonce(parsed.encryptedNonce);
    } catch {
      return null;
    }
  }

  public async consumeGoogleNonce(input: {
    challengeId: string;
    expectedNonce: string;
    userId?: number;
  }): Promise<boolean> {
    const [result] = await this.eval(
      GOOGLE_NONCE_CONSUME_LUA,
      [this.googleNonceKey(input.challengeId)],
      [
        this.createDigest(input.challengeId, "google_nonce", input.expectedNonce),
        input.userId === undefined ? "" : String(input.userId)
      ]
    );
    return result === "ok";
  }

  private async connect(): Promise<RedisClient> {
    const client = this.getClient();
    if (!client.isOpen) {
      await this.withRedisUnavailableGuard(() => client.connect());
    }
    return client;
  }

  private async eval(script: string, keys: string[], args: string[]): Promise<string[]> {
    const client = await this.connect();
    const response = await this.withRedisUnavailableGuard(() =>
      client.eval(script, { keys, arguments: args })
    );
    return Array.isArray(response) ? response.map((value) => String(value)) : [];
  }

  private async setValue(key: string, value: string, ttlSeconds: number): Promise<void> {
    const client = await this.connect();
    await this.withRedisUnavailableGuard(() => client.set(key, value, { EX: ttlSeconds }));
  }

  private createDigest(challengeId: string, purpose: string, secretValue: string): string {
    return createHmac("sha256", env.AUTH_VERIFICATION_SECRET)
      .update(challengeId)
      .update("\u0000")
      .update(purpose)
      .update("\u0000")
      .update(secretValue)
      .digest("base64url");
  }

  private createRandomValue(): string {
    return randomBytes(32).toString("base64url");
  }

  private encryptNonce(nonce: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.nonceEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(nonce, "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  private decryptNonce(serialized: string): string {
    const [iv, tag, ciphertext] = serialized.split(".");
    if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted Google nonce");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.nonceEncryptionKey(),
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }

  private nonceEncryptionKey(): Buffer {
    return createHash("sha256").update(env.AUTH_VERIFICATION_SECRET).digest();
  }

  private parseConsumedChallenge(serialized: string | undefined): {
    email: string;
    metadata: VerificationChallengeMetadata;
    userId?: number;
  } {
    if (!serialized) {
      return { email: "", metadata: {} };
    }
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { email: "", metadata: {} };
      }
      const payload = parsed as { email?: unknown; metadata?: unknown };
      return {
        email: typeof payload.email === "string" ? payload.email : "",
        ...(typeof (payload as { userId?: unknown }).userId === "number"
          ? { userId: (payload as { userId: number }).userId }
          : {}),
        metadata:
          payload.metadata &&
          typeof payload.metadata === "object" &&
          !Array.isArray(payload.metadata)
            ? (payload.metadata as VerificationChallengeMetadata)
            : {}
      };
    } catch {
      return { email: "", metadata: {} };
    }
  }

  private normalizeMetadata(
    purpose: VerificationPurpose,
    metadata: Record<string, unknown> | undefined
  ): VerificationChallengeMetadata {
    const candidate = metadata ?? {};
    const fields = Object.entries(candidate);
    const fieldNames = fields.map(([key]) => key).sort();
    if (purpose === "email_registration" || purpose === "password_setup") {
      if (fieldNames.length === 0) return {};
      if (fieldNames.length !== 1 || fieldNames[0] !== "passwordHash") {
        throw new Error("Verification challenge metadata is not allowed for this purpose");
      }
      const passwordHash = candidate.passwordHash;
      if (typeof passwordHash !== "string" || !this.isPreparedBcryptHash(passwordHash)) {
        throw new Error(
          "Verification challenge passwordHash must be a bcrypt hash with cost >= 12"
        );
      }
      return { passwordHash };
    }
    if (purpose === "password_login") {
      if (
        fieldNames.length !== 2 ||
        fieldNames[0] !== "loginIdentityId" ||
        fieldNames[1] !== "platformSettingsVersion" ||
        !Number.isInteger(candidate.loginIdentityId) ||
        Number(candidate.loginIdentityId) < 1 ||
        !Number.isInteger(candidate.platformSettingsVersion) ||
        Number(candidate.platformSettingsVersion) < 1
      ) {
        throw new Error("Verification challenge metadata is not allowed for this purpose");
      }
      return {
        loginIdentityId: Number(candidate.loginIdentityId),
        platformSettingsVersion: Number(candidate.platformSettingsVersion)
      };
    }
    if (purpose === "google_registration_or_link" || purpose === "google_authenticated_link") {
      if (
        fieldNames.length !== 3 ||
        fieldNames[0] !== "providerEmail" ||
        fieldNames[1] !== "providerEmailVerifiedAt" ||
        fieldNames[2] !== "providerSubject" ||
        typeof candidate.providerSubject !== "string" ||
        typeof candidate.providerEmail !== "string" ||
        typeof candidate.providerEmailVerifiedAt !== "string"
      ) {
        throw new Error("Verification challenge metadata is not allowed for this purpose");
      }
      const providerSubject = candidate.providerSubject.trim();
      const providerEmail = candidate.providerEmail.trim().toLowerCase();
      const providerEmailVerifiedAt = candidate.providerEmailVerifiedAt.trim();
      if (
        !providerSubject ||
        providerSubject.length > 255 ||
        !this.isEmail(providerEmail) ||
        Number.isNaN(new Date(providerEmailVerifiedAt).getTime())
      ) {
        throw new Error("Verification challenge metadata is not allowed for this purpose");
      }
      return { providerSubject, providerEmail, providerEmailVerifiedAt };
    }
    if (fieldNames.length > 0) {
      throw new Error("Verification challenge metadata is not allowed for this purpose");
    }
    return {};
  }

  private isPreparedBcryptHash(value: string): boolean {
    const match = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/.exec(value);
    return match !== null && Number(match[1]) >= 12 && Number(match[1]) <= 31;
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private maskEmail(email: string): string {
    const [localPart, domain = ""] = email.trim().split("@");
    if (!localPart) return `***@${domain}`;
    if (localPart.length === 1) return `*@${domain}`;
    if (localPart.length === 2) return `${localPart[0]}*@${domain}`;
    return `${localPart[0]}${"*".repeat(localPart.length - 2)}${localPart.at(-1)}@${domain}`;
  }

  private emailChallengeKey(challengeId: string): string {
    return `auth:verification:email:${challengeId}`;
  }

  private emailCooldownKey(email: string, purpose: VerificationPurpose): string {
    return `auth:verification:cooldown:${this.createDigest("email", purpose, email.trim().toLowerCase())}`;
  }

  private googleNonceKey(challengeId: string): string {
    return `auth:verification:google-nonce:${challengeId}`;
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
      if (timeout) clearTimeout(timeout);
    }
  }

  private redisUnavailableError(cause: unknown): AppError {
    if (cause instanceof AppError) return cause;
    return new AppError({
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "error.dependency.redis_unavailable",
      statusCode: 503,
      cause
    });
  }
}

const EMAIL_CREATE_LUA = `
-- auth-verification-email-create
if redis.call('EXISTS', KEYS[1]) == 1 then return {'cooldown'} end
if not redis.call('SET', KEYS[2], ARGV[3], 'NX', 'EX', ARGV[4]) then return {'collision'} end
if not redis.call('SET', KEYS[1], ARGV[2], 'NX', 'EX', ARGV[1]) then
  redis.call('DEL', KEYS[2])
  return {'cooldown'}
end
return {'ok'}
`;

const EMAIL_RESERVE_LUA = `
-- auth-verification-email-reserve
local serialized = redis.call('GET', KEYS[1])
if not serialized then return {'missing'} end
local challenge = cjson.decode(serialized)
if challenge.purpose ~= ARGV[1] then return {'purpose_mismatch'} end
if challenge.purpose == 'password_login' then
  if challenge.userId == nil or challenge.userId == cjson.null then return {'user_mismatch'} end
else
  if challenge.userId == nil or challenge.userId == cjson.null then
    if ARGV[2] ~= '' then return {'user_mismatch'} end
  elseif ARGV[2] == '' or tostring(challenge.userId) ~= ARGV[2] then
    return {'user_mismatch'}
  end
end
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
local reservationExpiresAt = tonumber(challenge.reservationExpiresAt) or 0
if challenge.reservationToken ~= nil and reservationExpiresAt > now then return {'reserved'} end
if challenge.digest ~= ARGV[3] then
  local attempts = (tonumber(challenge.attempts) or 0) + 1
  if attempts >= tonumber(ARGV[4]) then
    redis.call('DEL', KEYS[1])
    return {'attempts_exhausted'}
  end
  challenge.attempts = attempts
  local ttl = redis.call('TTL', KEYS[1])
  if ttl > 0 then
    redis.call('SET', KEYS[1], cjson.encode(challenge), 'EX', ttl)
  else
    redis.call('DEL', KEYS[1])
    return {'missing'}
  end
  return {'invalid_otp', tostring(attempts)}
end
challenge.reservationToken = ARGV[5]
challenge.reservationExpiresAt = now + ${EMAIL_CHALLENGE_RESERVATION_SECONDS * 1000}
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then
  redis.call('DEL', KEYS[1])
  return {'missing'}
end
redis.call('SET', KEYS[1], cjson.encode(challenge), 'EX', ttl)
return {'ok', cjson.encode({email = challenge.email, userId = challenge.userId, metadata = challenge.metadata or {}})}
`;

const EMAIL_FINALIZE_LUA = `
-- auth-verification-email-finalize
local serialized = redis.call('GET', KEYS[1])
if not serialized then return {'missing'} end
local challenge = cjson.decode(serialized)
if challenge.reservationToken ~= ARGV[1] then return {'reservation_mismatch'} end
redis.call('DEL', KEYS[1])
return {'ok'}
`;

const EMAIL_RELEASE_LUA = `
-- auth-verification-email-release
local serialized = redis.call('GET', KEYS[1])
if not serialized then return {'missing'} end
local challenge = cjson.decode(serialized)
if challenge.reservationToken ~= ARGV[1] then return {'reservation_mismatch'} end
challenge.reservationToken = nil
challenge.reservationExpiresAt = nil
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then
  redis.call('DEL', KEYS[1])
  return {'missing'}
end
redis.call('SET', KEYS[1], cjson.encode(challenge), 'EX', ttl)
return {'ok'}
`;

const EMAIL_CANCEL_LUA = `
-- auth-verification-email-cancel
redis.call('DEL', KEYS[1])
if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
return {'ok'}
`;

const GOOGLE_NONCE_CONSUME_LUA = `
local serialized = redis.call('GET', KEYS[1])
if not serialized then return {'missing'} end
local challenge = cjson.decode(serialized)
if challenge.userId == nil or challenge.userId == cjson.null then
  if ARGV[2] ~= '' then return {'user_mismatch'} end
elseif ARGV[2] == '' or tostring(challenge.userId) ~= ARGV[2] then
  return {'user_mismatch'}
end
if challenge.digest ~= ARGV[1] then return {'invalid_nonce'} end
redis.call('DEL', KEYS[1])
return {'ok'}
`;
