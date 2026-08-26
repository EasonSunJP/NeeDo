import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { RedisClient } from "../config/redis";
import { getRedisClient } from "../config/redis";
import { env } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const EMAIL_CHALLENGE_TTL_SECONDS = 600;
const EMAIL_CHALLENGE_COOLDOWN_SECONDS = 60;

export type VerificationPurpose =
  | "email_registration"
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
}

export type VerificationChallengeMetadata =
  | PasswordChallengeMetadata
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

export type ConsumeChallengeResult =
  | { ok: true; metadata: VerificationChallengeMetadata }
  | {
      ok: false;
      reason:
        | "missing"
        | "purpose_mismatch"
        | "user_mismatch"
        | "invalid_otp"
        | "attempts_exhausted";
      attempts?: number;
    };

export interface VerificationChallengeStore {
  createEmailChallenge(input: CreateVerificationChallengeInput): Promise<CreatedChallenge>;
  consumeEmailChallenge(input: ConsumeVerificationChallengeInput): Promise<ConsumeChallengeResult>;
  createGoogleNonce(input: { userId?: number }): Promise<CreatedGoogleNonce>;
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
        JSON.stringify({
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
    const response = await this.eval(
      EMAIL_CONSUME_LUA,
      [this.emailChallengeKey(input.challengeId)],
      [
        input.purpose,
        input.userId === undefined ? "" : String(input.userId),
        this.createDigest(input.challengeId, input.purpose, input.otp),
        String(env.AUTH_VERIFICATION_MAX_ATTEMPTS)
      ]
    );
    const [result, detail] = response;
    if (result === "ok") {
      return { ok: true, metadata: this.parseMetadata(detail) };
    }
    if (result === "invalid_otp") {
      return { ok: false, reason: result, attempts: Number(detail) };
    }
    if (
      result === "missing" ||
      result === "purpose_mismatch" ||
      result === "user_mismatch" ||
      result === "attempts_exhausted"
    ) {
      return { ok: false, reason: result };
    }

    return { ok: false, reason: "missing" };
  }

  public async createGoogleNonce(input: { userId?: number }): Promise<CreatedGoogleNonce> {
    const challengeId = randomUUID();
    const nonce = this.createRandomValue();
    await this.setValue(
      this.googleNonceKey(challengeId),
      JSON.stringify({
        userId: input.userId ?? null,
        digest: this.createDigest(challengeId, "google_nonce", nonce)
      }),
      env.AUTH_GOOGLE_NONCE_TTL_SECONDS
    );

    return {
      challengeId,
      nonce,
      expiresInSeconds: env.AUTH_GOOGLE_NONCE_TTL_SECONDS
    };
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

  private parseMetadata(serialized: string | undefined): VerificationChallengeMetadata {
    if (!serialized) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(serialized);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as VerificationChallengeMetadata)
        : {};
    } catch {
      return {};
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
    if (purpose === "google_registration_or_link" || purpose === "google_authenticated_link") {
      if (
        fieldNames.length !== 2 ||
        fieldNames[0] !== "providerEmail" ||
        fieldNames[1] !== "providerSubject" ||
        typeof candidate.providerSubject !== "string" ||
        typeof candidate.providerEmail !== "string"
      ) {
        throw new Error("Verification challenge metadata is not allowed for this purpose");
      }
      const providerSubject = candidate.providerSubject.trim();
      const providerEmail = candidate.providerEmail.trim().toLowerCase();
      if (!providerSubject || providerSubject.length > 255 || !this.isEmail(providerEmail)) {
        throw new Error("Verification challenge metadata is not allowed for this purpose");
      }
      return { providerSubject, providerEmail };
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
if not redis.call('SET', KEYS[2], ARGV[2], 'NX', 'EX', ARGV[3]) then return {'collision'} end
if not redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) then
  redis.call('DEL', KEYS[2])
  return {'cooldown'}
end
return {'ok'}
`;

const EMAIL_CONSUME_LUA = `
local serialized = redis.call('GET', KEYS[1])
if not serialized then return {'missing'} end
local challenge = cjson.decode(serialized)
if challenge.purpose ~= ARGV[1] then return {'purpose_mismatch'} end
if challenge.userId == nil or challenge.userId == cjson.null then
  if ARGV[2] ~= '' then return {'user_mismatch'} end
elseif ARGV[2] == '' or tostring(challenge.userId) ~= ARGV[2] then
  return {'user_mismatch'}
end
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
redis.call('DEL', KEYS[1])
return {'ok', cjson.encode(challenge.metadata or {})}
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
