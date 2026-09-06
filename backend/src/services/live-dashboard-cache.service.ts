import { getRedisClient } from "../config/redis";
import type { LiveDashboardQuery } from "../validators/live-dashboard.validator";

const LIVE_DASHBOARD_CACHE_PREFIX = "dashboard:live:v1";
export const LIVE_DASHBOARD_CACHE_TTL_SECONDS = 300;

export interface LiveDashboardRedisClient {
  isOpen: boolean;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

export type LiveDashboardCacheStatus = "hit" | "miss" | "degraded";

export interface LiveDashboardCacheResult<T> {
  value: T;
  cachedAt: Date;
  cacheStatus: LiveDashboardCacheStatus;
}

export interface LiveDashboardCachePort {
  getOrCreate<T>(
    scopeKey: string,
    factory: () => Promise<T>,
    decode?: (value: unknown) => T
  ): Promise<LiveDashboardCacheResult<T>>;
}

interface StoredLiveDashboardSnapshot<T> {
  cachedAt: string;
  value: T;
}

export const liveDashboardCacheKey = (
  scope: Pick<LiveDashboardQuery, "country" | "admin1" | "admin2" | "period">
): string =>
  `${LIVE_DASHBOARD_CACHE_PREFIX}:${scope.country}:${scope.admin1 ?? "-"}:${scope.admin2 ?? "-"}:${scope.period}`;

const normalizeScopeKey = (scopeKey: string): string =>
  scopeKey.startsWith(`${LIVE_DASHBOARD_CACHE_PREFIX}:`)
    ? scopeKey
    : `${LIVE_DASHBOARD_CACHE_PREFIX}:${scopeKey}`;

export class LiveDashboardCache implements LiveDashboardCachePort {
  private readonly inFlight = new Map<string, Promise<LiveDashboardCacheResult<unknown>>>();

  public constructor(
    private readonly getClient: () => LiveDashboardRedisClient = getRedisClient,
    private readonly now: () => Date = () => new Date()
  ) {}

  public getOrCreate<T>(
    scopeKey: string,
    factory: () => Promise<T>,
    decode: (value: unknown) => T = (value) => value as T
  ): Promise<LiveDashboardCacheResult<T>> {
    const key = normalizeScopeKey(scopeKey);
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<LiveDashboardCacheResult<T>>;

    const operation = this.readOrCreate(key, factory, decode).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, operation as Promise<LiveDashboardCacheResult<unknown>>);
    return operation;
  }

  private async readOrCreate<T>(
    key: string,
    factory: () => Promise<T>,
    decode: (value: unknown) => T
  ): Promise<LiveDashboardCacheResult<T>> {
    let client: LiveDashboardRedisClient;
    try {
      client = this.getClient();
      if (!client.isOpen) await client.connect();
      const stored = await client.get(key);
      if (stored !== null) return this.parseStored(stored, decode);
    } catch {
      return this.compute(factory, "degraded");
    }

    const computed = await this.compute(factory, "miss");
    try {
      await client.set(
        key,
        JSON.stringify({ cachedAt: computed.cachedAt.toISOString(), value: computed.value }),
        { EX: LIVE_DASHBOARD_CACHE_TTL_SECONDS }
      );
      return computed;
    } catch {
      return { ...computed, cacheStatus: "degraded" };
    }
  }

  private async compute<T>(
    factory: () => Promise<T>,
    cacheStatus: Exclude<LiveDashboardCacheStatus, "hit">
  ): Promise<LiveDashboardCacheResult<T>> {
    const value = await factory();
    return { value, cachedAt: this.now(), cacheStatus };
  }

  private parseStored<T>(
    stored: string,
    decode: (value: unknown) => T
  ): LiveDashboardCacheResult<T> {
    const parsed = JSON.parse(stored) as Partial<StoredLiveDashboardSnapshot<unknown>>;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 2 ||
      typeof parsed.cachedAt !== "string" ||
      !("value" in parsed)
    ) {
      throw new Error("Invalid live dashboard cache entry");
    }
    const cachedAt = new Date(parsed.cachedAt);
    if (Number.isNaN(cachedAt.getTime()) || parsed.cachedAt !== cachedAt.toISOString()) {
      throw new Error("Invalid live dashboard cache timestamp");
    }
    const ageMs = this.now().getTime() - cachedAt.getTime();
    if (ageMs < 0 || ageMs > LIVE_DASHBOARD_CACHE_TTL_SECONDS * 1_000) {
      throw new Error("Stale live dashboard cache entry");
    }
    return { value: decode(parsed.value), cachedAt, cacheStatus: "hit" };
  }
}
