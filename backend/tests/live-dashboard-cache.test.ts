import {
  LiveDashboardCache,
  liveDashboardCacheKey
} from "../src/services/live-dashboard-cache.service";
import {
  decodeCachedLiveDashboardFacts,
  type CachedLiveDashboardFacts
} from "../src/validators/live-dashboard.validator";

const now = new Date("2026-09-06T03:04:05.000Z");

const cachedFacts = (): CachedLiveDashboardFacts => ({
  evaluatedAt: now.toISOString(),
  scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
  children: [
    {
      code: "13",
      name: "Tokyo",
      orderCount: 2,
      confirmedPayments: { jpy: 12000, ndp: 100, testNdp: 0 }
    }
  ],
  headline: { newOrders: 2, completedOrders: 1, newCustomers: 1, onboardedTechnicians: 1 },
  confirmedPayments: { jpy: 12000, ndp: 100, testNdp: 0 },
  orders: {
    total: 2,
    serviceGmv: { jpy: 12000, ndp: 0, testNdp: 0 },
    platformNetRevenue: { jpy: -500, ndp: 100, testNdp: 0 },
    agentCommission: null
  },
  realtimeOrders: {
    list: [
      {
        orderNo: "BO-1",
        status: "confirmed",
        serviceName: "Hair",
        amountJpy: 12000,
        occurredAt: now.toISOString()
      }
    ],
    total: 1,
    page: 1,
    page_size: 20
  },
  activity: [],
  trend: [
    {
      key: "2026-09-06",
      label: "09/06",
      orderCount: 2,
      confirmedPayments: { jpy: 12000, ndp: 100, testNdp: 0 }
    }
  ],
  serviceRanking: [
    {
      rank: 1,
      entityPublicId: "svc_1",
      displayName: "Hair",
      avatarUrl: null,
      gmvJpy: 12000,
      completedCount: 1
    }
  ],
  technicianRanking: [],
  coverage: { total: 2, attributed: 2, unresolved: 0, completenessPercent: 100 }
});

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
    const value = cachedFacts();
    const redis = createRedis({
      get: JSON.stringify({ cachedAt: now.toISOString(), value })
    });
    const cache = new LiveDashboardCache(
      () => redis,
      () => new Date("2026-09-06T03:05:05Z")
    );
    const factory = jest.fn(async () => cachedFacts());

    await expect(
      cache.getOrCreate("JP:-:-:today", factory, decodeCachedLiveDashboardFacts)
    ).resolves.toEqual({
      value,
      cachedAt: now,
      cacheStatus: "hit"
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it("accepts an empty ranking avatar from the Task 5 domain as a valid hit", async () => {
    const value: CachedLiveDashboardFacts = {
      ...cachedFacts(),
      serviceRanking: cachedFacts().serviceRanking.map((item) => ({ ...item, avatarUrl: "" }))
    };
    const redis = createRedis({
      get: JSON.stringify({ cachedAt: now.toISOString(), value })
    });
    const cache = new LiveDashboardCache(
      () => redis,
      () => now
    );
    const factory = jest.fn(async () => cachedFacts());

    await expect(
      cache.getOrCreate("JP:-:-:today", factory, decodeCachedLiveDashboardFacts)
    ).resolves.toEqual({ value, cachedAt: now, cacheStatus: "hit" });
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["partial", { evaluatedAt: now.toISOString() }],
    [
      "wrong nested type",
      { ...cachedFacts(), headline: { ...cachedFacts().headline, newOrders: "2" } }
    ],
    ["invalid fact date", { ...cachedFacts(), evaluatedAt: "2026-09-06" }],
    [
      "extra PII-shaped key",
      { ...cachedFacts(), headline: { ...cachedFacts().headline, customerEmail: "leak@test" } }
    ],
    [
      "fully shaped invalid facts",
      { ...cachedFacts(), coverage: { ...cachedFacts().coverage, completenessPercent: 101 } }
    ],
    [
      "oversized ranking",
      {
        ...cachedFacts(),
        serviceRanking: Array.from({ length: 11 }, (_, index) => ({
          ...cachedFacts().serviceRanking[0],
          rank: index + 1
        }))
      }
    ],
    [
      "wrong realtime pagination",
      { ...cachedFacts(), realtimeOrders: { ...cachedFacts().realtimeOrders, page_size: 50 } }
    ]
  ])("rejects %s cached facts and returns only fresh formal facts", async (_label, invalid) => {
    const redis = createRedis({
      get: JSON.stringify({ cachedAt: now.toISOString(), value: invalid })
    });
    const cache = new LiveDashboardCache(
      () => redis,
      () => now
    );
    const fresh = cachedFacts();
    const factory = jest.fn(async () => fresh);

    await expect(
      cache.getOrCreate("JP:-:-:today", factory, decodeCachedLiveDashboardFacts)
    ).resolves.toEqual({ value: fresh, cachedAt: now, cacheStatus: "degraded" });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("rejects a future cachedAt and computes fresh formal facts", async () => {
    const redis = createRedis({
      get: JSON.stringify({ cachedAt: "2026-09-06T03:04:05.001Z", value: cachedFacts() })
    });
    const cache = new LiveDashboardCache(
      () => redis,
      () => now
    );
    const factory = jest.fn(async () => cachedFacts());

    await expect(
      cache.getOrCreate("JP:-:-:today", factory, decodeCachedLiveDashboardFacts)
    ).resolves.toMatchObject({ cacheStatus: "degraded", value: cachedFacts() });
    expect(factory).toHaveBeenCalledTimes(1);
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

  it("single-flights a concurrent write failure and returns equal degraded facts", async () => {
    const redis = createRedis({ failSet: true });
    const cache = new LiveDashboardCache(
      () => redis,
      () => now
    );
    let releaseFactory!: () => void;
    const factory = jest.fn(
      () =>
        new Promise<{ total: number }>((resolve) => {
          releaseFactory = () => resolve({ total: 12 });
        })
    );

    const leftPromise = cache.getOrCreate("JP:-:-:today", factory);
    const rightPromise = cache.getOrCreate("JP:-:-:today", factory);
    await Promise.resolve();
    releaseFactory();
    const [left, right] = await Promise.all([leftPromise, rightPromise]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(left).toEqual(right);
    expect(left).toEqual({ value: { total: 12 }, cachedAt: now, cacheStatus: "degraded" });
  });

  it("cleans up a rejected factory so a later request can retry", async () => {
    const redis = createRedis();
    const cache = new LiveDashboardCache(
      () => redis,
      () => now
    );
    const factory = jest
      .fn<Promise<{ total: number }>, []>()
      .mockRejectedValueOnce(new Error("formal query failed"))
      .mockResolvedValueOnce({ total: 13 });

    await expect(cache.getOrCreate("JP:-:-:today", factory)).rejects.toThrow("formal query failed");
    await expect(cache.getOrCreate("JP:-:-:today", factory)).resolves.toEqual({
      value: { total: 13 },
      cachedAt: now,
      cacheStatus: "miss"
    });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
