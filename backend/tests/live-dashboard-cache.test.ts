import {
  LiveDashboardCache,
  liveDashboardCacheKey
} from "../src/services/live-dashboard-cache.service";

const now = new Date("2026-09-06T03:04:05.000Z");

const createRedis = (
  options: { get?: string | null; failGet?: boolean; failSet?: boolean } = {}
) => ({
  isOpen: true,
  connect: jest.fn(async () => undefined),
  get: jest.fn(async () => {
    if (options.failGet) throw new Error("redis unavailable");
    return options.get ?? null;
  }),
  set: jest.fn(async () => {
    if (options.failSet) throw new Error("redis unavailable");
    return "OK";
  })
});

describe("LiveDashboardCache", () => {
  it("builds a deterministic versioned key with normalized missing levels", () => {
    expect(
      liveDashboardCacheKey({
        country: "JP",
        admin1: "13",
        admin2: "13104",
        period: "today"
      })
    ).toBe("dashboard:live:v1:JP:13:13104:today");
    expect(liveDashboardCacheKey({ country: "JP", period: "last7days" })).toBe(
      "dashboard:live:v1:JP:-:-:last7days"
    );
  });

  it("single-flights concurrent misses and writes serialized cachedAt with a 300 second TTL", async () => {
    const redis = createRedis();
    const cache = new LiveDashboardCache(
      () => redis,
      () => now
    );
    let releaseFactory!: () => void;
    const factory = jest.fn(
      () =>
        new Promise<{ total: number }>((resolve) => {
          releaseFactory = () => resolve({ total: 4 });
        })
    );

    const leftPromise = cache.getOrCreate("JP:-:-:today", factory);
    const rightPromise = cache.getOrCreate("JP:-:-:today", factory);
    await Promise.resolve();
    releaseFactory();
    const [left, right] = await Promise.all([leftPromise, rightPromise]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(left).toEqual(right);
    expect(left).toEqual({ value: { total: 4 }, cachedAt: now, cacheStatus: "miss" });
    expect(redis.set).toHaveBeenCalledWith(
      "dashboard:live:v1:JP:-:-:today",
      JSON.stringify({ cachedAt: now.toISOString(), value: { total: 4 } }),
      { EX: 300 }
    );
  });

  it("returns a valid cached value without recomputing it", async () => {
    const redis = createRedis({
      get: JSON.stringify({ cachedAt: now.toISOString(), value: { total: 7 } })
    });
    const cache = new LiveDashboardCache(
      () => redis,
      () => new Date("2026-09-06T03:05:05Z")
    );
    const factory = jest.fn(async () => ({ total: 8 }));

    await expect(cache.getOrCreate("JP:-:-:today", factory)).resolves.toEqual({
      value: { total: 7 },
      cachedAt: now,
      cacheStatus: "hit"
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it("never returns a stale or corrupt Redis entry as formal facts", async () => {
    const staleRedis = createRedis({
      get: JSON.stringify({
        cachedAt: "2026-09-06T02:59:04.999Z",
        value: { total: 700, invented: true }
      })
    });
    const staleCache = new LiveDashboardCache(
      () => staleRedis,
      () => now
    );
    const freshFactory = jest.fn(async () => ({ total: 10 }));

    await expect(staleCache.getOrCreate("JP:-:-:today", freshFactory)).resolves.toEqual({
      value: { total: 10 },
      cachedAt: now,
      cacheStatus: "degraded"
    });
    expect(freshFactory).toHaveBeenCalledTimes(1);

    const corruptRedis = createRedis({ get: "not-json" });
    const corruptCache = new LiveDashboardCache(
      () => corruptRedis,
      () => now
    );
    await expect(
      corruptCache.getOrCreate("JP:-:-:today", async () => ({ total: 11 }))
    ).resolves.toEqual({ value: { total: 11 }, cachedAt: now, cacheStatus: "degraded" });
  });

  it("computes formal facts once and reports degraded when Redis is unavailable", async () => {
    const redis = createRedis({ failGet: true });
    const cache = new LiveDashboardCache(
      () => redis,
      () => now
    );
    const factory = jest.fn(async () => ({ total: 9 }));

    const [left, right] = await Promise.all([
      cache.getOrCreate("JP:-:-:today", factory),
      cache.getOrCreate("JP:-:-:today", factory)
    ]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(left).toEqual({ value: { total: 9 }, cachedAt: now, cacheStatus: "degraded" });
    expect(right).toEqual(left);
    expect(redis.set).not.toHaveBeenCalled();

    await cache.getOrCreate("JP:-:-:today", factory);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
