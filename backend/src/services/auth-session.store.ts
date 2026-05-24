import type { RedisClient } from "../config/redis";
import { getRedisClient } from "../config/redis";

export interface LoginFailureOptions {
  failureLimit: number;
  windowSeconds: number;
  lockSeconds: number;
}

export interface LoginFailureResult {
  count: number;
  locked: boolean;
}

export interface AuthSessionStore {
  getLoginLock: (email: string) => Promise<boolean>;
  recordFailedLogin: (
    ip: string,
    email: string,
    options: LoginFailureOptions
  ) => Promise<LoginFailureResult>;
  clearFailedLogin: (ip: string, email: string) => Promise<void>;
  storeOtp: (email: string, otp: string, ttlSeconds: number) => Promise<void>;
  getOtp: (email: string) => Promise<string | null>;
  deleteOtp: (email: string) => Promise<void>;
  hasOtpCooldown: (email: string) => Promise<boolean>;
  storeOtpCooldown: (email: string, ttlSeconds: number) => Promise<void>;
  clearOtpCooldown: (email: string) => Promise<void>;
  storeRefreshToken: (userId: number, jti: string, ttlSeconds: number) => Promise<void>;
  hasRefreshToken: (userId: number, jti: string) => Promise<boolean>;
  revokeRefreshToken: (userId: number, jti: string) => Promise<void>;
  blacklistAccessToken: (jti: string, ttlSeconds: number) => Promise<void>;
  isAccessTokenBlacklisted: (jti: string) => Promise<boolean>;
}

export class RedisAuthSessionStore implements AuthSessionStore {
  public constructor(private readonly getClient: () => RedisClient = getRedisClient) {}

  public async getLoginLock(email: string): Promise<boolean> {
    return (await this.getValue(this.loginLockKey(email))) !== null;
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

  public async storeRefreshToken(userId: number, jti: string, ttlSeconds: number): Promise<void> {
    await this.setValue(this.refreshKey(userId, jti), "1", ttlSeconds);
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return (await this.getValue(this.refreshKey(userId, jti))) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    await this.deleteValue(this.refreshKey(userId, jti));
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
      await client.connect();
    }

    return client;
  }

  private async setValue(key: string, value: string, ttlSeconds: number): Promise<void> {
    const client = await this.connect();
    await client.set(key, value, {
      EX: ttlSeconds
    });
  }

  private async getValue(key: string): Promise<string | null> {
    const client = await this.connect();
    return client.get(key);
  }

  private async deleteValue(key: string): Promise<void> {
    const client = await this.connect();
    await client.del(key);
  }

  private loginFailureKey(ip: string, email: string): string {
    return `login:fail:${ip}:${email}`;
  }

  private loginLockKey(email: string): string {
    return `login:lock:${email}`;
  }

  private otpKey(email: string): string {
    return `otp:${email}`;
  }

  private otpCooldownKey(email: string): string {
    return `otp:cooldown:${email}`;
  }

  private refreshKey(userId: number, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }

  private accessBlacklistKey(jti: string): string {
    return `token:blacklist:${jti}`;
  }
}
