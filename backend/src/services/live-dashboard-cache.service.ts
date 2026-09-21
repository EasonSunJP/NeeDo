import { getRedisClient } from "../config/redis";
import type { LiveDashboardScope } from "../domain/live-dashboard";
import type { LiveDashboardQuery } from "../validators/live-dashboard.validator";

const LIVE_DASHBOARD_CACHE_PREFIX = "dashboard:live:v1";
export const LIVE_DASHBOARD_CACHE_TTL_SECONDS = 300;

export interface LiveDashboardRedisClient {
  isOpen: boolean;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  sendCommand(command: string[]): Promise<unknown>;
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
  invalidateScope?(scope: LiveDashboardScope): Promise<void>;
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

const generationKey = (cacheKey: string): string => `${cacheKey}:generation`;

const WRITE_IF_GENERATION_UNCHANGED_SCRIPT = [
  "local current = redis.call('GET', KEYS[2]) or '0'",
  "if current ~= ARGV[1] then return 0 end",
  "redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])",
  "return 1"
].join("\n");

const INVALIDATE_WITH_GENERATION_SCRIPT = [
  "local count = #KEYS / 2",
  "for index = 1, count do redis.call('INCR', KEYS[count + index]) end",
  "for index = 1, count do redis.call('DEL', KEYS[index]) end",
  "return count"
].join("\n");

interface InFlightCacheOperation {
  generation: string | null;
  promise: Promise<LiveDashboardCacheResult<unknown>>;
}

export class LiveDashboardCache implements LiveDashboardCachePort {
  private readonly inFlight = new Map<string, InFlightCacheOperation>();

  public constructor(
    private readonly getClient: () => LiveDashboardRedisClient = getRedisClient,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async getOrCreate<T>(
    scopeKey: string,
    factory: () => Promise<T>,
    decode: (value: unknown) => T = (value) => value as T
  ): Promise<LiveDashboardCacheResult<T>> {
    const key = normalizeScopeKey(scopeKey);
    let client: LiveDashboardRedisClient;
    let generation: string;
    try {
      client = this.getClient();
      if (!client.isOpen) await client.connect();
      const stored = await client.get(key);
      if (stored !== null) return this.parseStored(stored, decode);
      generation = (await client.get(generationKey(key))) ?? "0";
    } catch {
      return this.singleFlight(key, null, () => this.compute(factory, "degraded"));
    }

    return this.singleFlight(key, generation, async () => {
      const computed = await this.compute(factory, "miss");
      try {
        const written = await client.sendCommand([
          "EVAL",
          WRITE_IF_GENERATION_UNCHANGED_SCRIPT,
          "2",
          key,
          generationKey(key),
          generation,
          JSON.stringify({ cachedAt: computed.cachedAt.toISOString(), value: computed.value }),
          String(LIVE_DASHBOARD_CACHE_TTL_SECONDS)
        ]);
        return written === 1 ? computed : { ...computed, cacheStatus: "degraded" };
      } catch {
        return { ...computed, cacheStatus: "degraded" };
      }
    });
  }

  public async invalidateScope(scope: LiveDashboardScope): Promise<void> {
    const client = this.getClient();
    if (!client.isOpen) await client.connect();
    const scopeLevels = [
      { country: scope.countryCode },
      ...(scope.admin1Code ? [{ country: scope.countryCode, admin1: scope.admin1Code }] : []),
      ...(scope.admin1Code && scope.admin2Code
        ? [
            {
              country: scope.countryCode,
              admin1: scope.admin1Code,
              admin2: scope.admin2Code
            }
          ]
        : [])
    ];
    const keys = scopeLevels.flatMap((level) =>
      (["today", "last7days", "last30days"] as const).flatMap((period) => {
        const base = liveDashboardCacheKey({ ...level, period });
        return [base, `${base}:all`, `${base}:formal`];
      })
    );
    const result = await client.sendCommand([
      "EVAL",
      INVALIDATE_WITH_GENERATION_SCRIPT,
      String(keys.length * 2),
      ...keys,
      ...keys.map(generationKey)
    ]);
    if (result !== keys.length) throw new Error("Redis cache invalidation fence failed");
  }

  private singleFlight<T>(
    key: string,
    generation: string | null,
    operationFactory: () => Promise<LiveDashboardCacheResult<T>>
  ): Promise<LiveDashboardCacheResult<T>> {
    const existing = this.inFlight.get(key);
    if (existing?.generation === generation) {
      return existing.promise as Promise<LiveDashboardCacheResult<T>>;
    }
    const operation = operationFactory().finally(() => {
      if (this.inFlight.get(key)?.promise === operation) this.inFlight.delete(key);
    });
    this.inFlight.set(key, {
      generation,
      promise: operation as Promise<LiveDashboardCacheResult<unknown>>
    });
    return operation;
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
