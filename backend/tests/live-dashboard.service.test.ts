import type { LiveDashboardSnapshotFacts } from "../src/domain/live-dashboard";
import { LiveDashboardService } from "../src/services/live-dashboard.service";
import { LiveDashboardCache } from "../src/services/live-dashboard-cache.service";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AppError } from "../src/utils/app-error";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type { LiveDashboardQuery } from "../src/validators/live-dashboard.validator";
import type { CachedLiveDashboardFacts } from "../src/validators/live-dashboard.validator";

const evaluatedAt = new Date("2026-09-06T03:04:05.000Z");
const actor = {
  userId: 7,
  currentIdentityId: 70,
  currentIdentityType: "platform_admin",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  permissions: ["backoffice:dashboard:read"],
  roles: ["admin"],
  isReadOnlyMerchantPreview: false,
  merchantPreviewShopId: null
} as unknown as AuthenticatedAccessContext;
const context = { ip: "127.0.0.1", userAgent: "service-test" };

const facts = (): LiveDashboardSnapshotFacts => ({
  evaluatedAt,
  scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
  children: [],
  headline: { newOrders: 2, completedOrders: 1, newCustomers: 1, onboardedTechnicians: 1 },
  confirmedPayments: { jpy: 12000, ndp: 100, testNdp: 0 },
  orders: {
    total: 2,
    serviceGmv: { jpy: 12000, ndp: 0, testNdp: 0 },
    platformNetRevenue: { jpy: 0, ndp: 100, testNdp: 0 },
    agentCommission: null
  },
  realtimeOrders: {
    list: [
      {
        orderNo: "BO-1",
        status: "confirmed",
        serviceName: "Hair",
        amountJpy: 12000,
        occurredAt: evaluatedAt
      }
    ],
    total: 1,
    page: 1,
    page_size: 20
  },
  activity: [],
  trend: [],
  serviceRanking: [],
  technicianRanking: [],
  coverage: { total: 2, attributed: 2, unresolved: 0, completenessPercent: 100 }
});

const admin1Regions = [
  { code: "13", name: "Tokyo", level: "admin1" as const, parentCode: "JP", centroid: null },
  { code: "27", name: "Osaka", level: "admin1" as const, parentCode: "JP", centroid: null }
];
const admin2Regions = [
  {
    code: "13103",
    name: "Minato City",
    level: "admin2" as const,
    parentCode: "13",
    centroid: null
  },
  {
    code: "13104",
    name: "Shinjuku City",
    level: "admin2" as const,
    parentCode: "13",
    centroid: null
  }
];
const childFact = (code: string, name: string) => ({
  code,
  name,
  orderCount: 0,
  currentDayOrderCount: 0,
  previousDayOrderCount: 0,
  confirmedPayments: { jpy: 0, ndp: 0, testNdp: 0 }
});
const serializedFacts = (value: LiveDashboardSnapshotFacts): CachedLiveDashboardFacts =>
  JSON.parse(JSON.stringify(value)) as CachedLiveDashboardFacts;

describe("LiveDashboardService", () => {
  it.each(["customer", "technician", "merchant"])(
    "rejects active %s identity before every downstream dependency",
    async (currentIdentityType) => {
      const repository = { getSnapshotFacts: jest.fn() };
      const regions = { listChildren: jest.fn(), resolveVerifiedScope: jest.fn() };
      const cache = { getOrCreate: jest.fn() };
      const audit = { record: jest.fn() };
      const service = new LiveDashboardService(
        repository,
        regions,
        cache,
        audit,
        () => evaluatedAt
      );

      await expect(
        service.getSnapshot(
          { ...actor, currentIdentityType, currentIdentityScopeType: "global" },
          context,
          { country: "JP", admin1: "13", admin2: "13104", period: "today" },
          "ja"
        )
      ).rejects.toMatchObject({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        statusCode: 403,
        message: "error.identity.forbidden"
      });
      expect(regions.resolveVerifiedScope).not.toHaveBeenCalled();
      expect(regions.listChildren).not.toHaveBeenCalled();
      expect(cache.getOrCreate).not.toHaveBeenCalled();
      expect(repository.getSnapshotFacts).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    }
  );

  it("validates the hierarchy before reading facts and returns stable localized breadcrumbs", async () => {
    const calls: string[] = [];
    const regions = {
      listChildren: jest.fn(async ({ parent }: { parent?: string }) => {
        calls.push(`regions:${parent ?? "JP"}`);
        return parent
          ? [
              {
                code: "13104",
                name: "Shinjuku City",
                level: "admin2" as const,
                parentCode: "13",
                centroid: null
              }
            ]
          : [
              {
                code: "13",
                name: "Tokyo",
                level: "admin1" as const,
                parentCode: "JP",
                centroid: null
              }
            ];
      }),
      resolveVerifiedScope: jest.fn(async () => {
        calls.push("resolve:13:13104");
        return {
          countryCode: "JP" as const,
          admin1Code: "13",
          admin2Code: "13104",
          admin1RegionId: 13,
          admin1NameJa: "東京都",
          admin2RegionId: 13104,
          admin2NameJa: "新宿区",
          datasetVersion: "N03-20260101" as const
        };
      })
    };
    const repository = {
      getSnapshotFacts: jest.fn(async () => {
        calls.push("facts");
        return facts();
      })
    };
    const cache = {
      getOrCreate: jest.fn(async (_key: string, factory: () => Promise<unknown>) => {
        const value = (await factory()) as Record<string, unknown>;
        return {
          value: {
            ...value,
            headline: { ...(value.headline as object), customerEmail: "must-not-leak@test" },
            coverage: { ...(value.coverage as object), userId: 999 }
          },
          cachedAt: evaluatedAt,
          cacheStatus: "miss" as const
        };
      })
    };
    const audit = { record: jest.fn(async () => undefined) };
    const service = new LiveDashboardService(
      repository,
      regions,
      cache as never,
      audit,
      () => evaluatedAt
    );

    const result = await service.getSnapshot(
      actor,
      context,
      { country: "JP", admin1: "13", admin2: "13104", period: "today" },
      "en"
    );

    expect(calls).toEqual(["resolve:13:13104", "regions:JP", "regions:13", "facts"]);
    expect(regions.resolveVerifiedScope).toHaveBeenCalledWith({
      countryCode: "JP",
      admin1Code: "13",
      admin2Code: "13104"
    });
    expect(repository.getSnapshotFacts).toHaveBeenCalledWith({
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      period: "today",
      evaluatedAt,
      showTestNdpData: true
    });
    expect(result.scope).toEqual({
      country: "JP",
      admin1: "13",
      admin2: "13104",
      breadcrumbs: [
        { level: "country", code: "JP", name: "Japan" },
        { level: "admin1", code: "13", name: "Tokyo" },
        { level: "admin2", code: "13104", name: "Shinjuku City" }
      ]
    });
    expect(result.realtimeOrders.list[0]?.occurredAt).toBe(evaluatedAt.toISOString());
    expect(JSON.stringify(result)).not.toMatch(/customerEmail|userId|must-not-leak/i);
    expect(result).toMatchObject({
      evaluatedAt: evaluatedAt.toISOString(),
      cachedAt: evaluatedAt.toISOString(),
      freshnessSeconds: 0,
      cacheStatus: "miss"
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backoffice.dashboard.live_snapshot.read",
        targetType: "live_dashboard_snapshot",
        targetId: null,
        metadata: {
          country: "JP",
          admin1: "13",
          admin2: "13104",
          period: "today",
          cacheStatus: "miss"
        }
      })
    );
  });

  it("rejects a mismatched municipality before repository or cache access", async () => {
    const regions = {
      listChildren: jest
        .fn()
        .mockResolvedValueOnce([
          { code: "13", name: "東京都", level: "admin1", parentCode: "JP", centroid: null }
        ])
        .mockResolvedValueOnce([]),
      resolveVerifiedScope: jest.fn(async () => {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.administrative_region.invalid_hierarchy",
          statusCode: 400
        });
      })
    };
    const repository = { getSnapshotFacts: jest.fn() };
    const cache = { getOrCreate: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new LiveDashboardService(repository, regions, cache, audit, () => evaluatedAt);

    await expect(
      service.getSnapshot(
        actor,
        context,
        { country: "JP", admin1: "13", admin2: "27127", period: "today" },
        "ja"
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "error.administrative_region.invalid_hierarchy"
    });
    expect(regions.resolveVerifiedScope).toHaveBeenCalledTimes(1);
    expect(repository.getSnapshotFacts).not.toHaveBeenCalled();
    expect(cache.getOrCreate).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects when formal read audit fails instead of returning a successful payload", async () => {
    const regions = {
      listChildren: jest.fn(async () => []),
      resolveVerifiedScope: jest.fn()
    };
    const repository = {
      getSnapshotFacts: jest.fn(async () => ({
        ...facts(),
        scope: {
          countryCode: "JP" as const,
          admin1Code: null,
          admin2Code: null
        }
      }))
    };
    const cache = {
      getOrCreate: jest.fn(async (_key: string, factory: () => Promise<unknown>) => ({
        value: await factory(),
        cachedAt: evaluatedAt,
        cacheStatus: "miss" as const
      }))
    };
    const audit = {
      record: jest.fn(async () => {
        throw new Error("audit unavailable");
      })
    };
    const service = new LiveDashboardService(
      repository,
      regions,
      cache as never,
      audit,
      () => evaluatedAt
    );

    await expect(
      service.getSnapshot(actor, context, { country: "JP", period: "today" }, "ja")
    ).rejects.toThrow("audit unavailable");
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("isolates hidden-Test-NDP snapshots and realtime events for the current administrator", async () => {
    const repository = {
      getSnapshotFacts: jest.fn(async () => ({
        ...facts(),
        scope: { countryCode: "JP" as const, admin1Code: null, admin2Code: null },
        confirmedPayments: { jpy: 1000, ndp: 20, testNdp: 30 }
      }))
    };
    const regions = { listChildren: jest.fn(async () => []), resolveVerifiedScope: jest.fn() };
    const cache = {
      getOrCreate: jest.fn(async (_key: string, factory: () => Promise<unknown>) => ({
        value: await factory(),
        cachedAt: evaluatedAt,
        cacheStatus: "miss" as const
      }))
    };
    const audit = { record: jest.fn(async () => undefined) };
    const subscribe = jest.fn(async (...args: unknown[]) => {
      void args;
      return () => undefined;
    });
    const gateway = { subscribe, publish: jest.fn(), close: jest.fn() };
    const preference = { getEffective: jest.fn(async () => ({ showTestNdpData: false, source: "explicit" as const })) };
    const service = new LiveDashboardService(
      repository,
      regions,
      cache as never,
      audit,
      () => evaluatedAt,
      gateway,
      preference
    );

    const snapshot = await service.getSnapshot(
      actor,
      context,
      { country: "JP", period: "today" },
      "ja"
    );
    expect(cache.getOrCreate).toHaveBeenCalledWith(
      "JP:-:-:today:formal",
      expect.any(Function),
      expect.any(Function)
    );
    expect(repository.getSnapshotFacts).toHaveBeenCalledWith(expect.objectContaining({
      showTestNdpData: false
    }));
    expect(snapshot).toMatchObject({ testNdpVisible: false, confirmedPayments: { testNdp: 0 } });

    await service.subscribe(
      actor,
      context,
      { country: "JP", period: "today" },
      null,
      {} as never
    );
    const filter = subscribe.mock.calls[0]?.[4] as
      | ((event: { type: string }) => boolean)
      | undefined;
    expect(filter?.({ type: "order.changed" })).toBe(false);
    expect(filter?.({ type: "metrics.invalidate" })).toBe(true);
  });

  it("treats a valid-shaped cached snapshot for another scope as degraded and recomputes", async () => {
    const wrongScopeFacts = {
      ...facts(),
      evaluatedAt: evaluatedAt.toISOString(),
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: null },
      headline: { ...facts().headline, newOrders: 999 },
      realtimeOrders: {
        ...facts().realtimeOrders,
        list: facts().realtimeOrders.list.map((order) => ({
          ...order,
          occurredAt: order.occurredAt.toISOString()
        }))
      },
      activity: []
    };
    const redis = {
      isOpen: true,
      connect: jest.fn(async () => undefined),
      get: jest.fn(async () =>
        JSON.stringify({ cachedAt: evaluatedAt.toISOString(), value: wrongScopeFacts })
      ),
      set: jest.fn(async () => "OK"),
      sendCommand: jest.fn(async () => 1)
    };
    const cache = new LiveDashboardCache(
      () => redis,
      () => evaluatedAt
    );
    const freshFacts = {
      ...facts(),
      scope: { countryCode: "JP" as const, admin1Code: null, admin2Code: null }
    };
    const repository = { getSnapshotFacts: jest.fn(async () => freshFacts) };
    const regions = { listChildren: jest.fn(async () => []), resolveVerifiedScope: jest.fn() };
    const audit = { record: jest.fn(async () => undefined) };
    const service = new LiveDashboardService(repository, regions, cache, audit, () => evaluatedAt);

    await expect(
      service.getSnapshot(actor, context, { country: "JP", period: "today" }, "ja")
    ).resolves.toMatchObject({
      scope: { country: "JP", admin1: null, admin2: null },
      headline: { newOrders: 2 },
      cacheStatus: "degraded"
    });
    expect(repository.getSnapshotFacts).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "nationwide unknown ADMIN1",
      query: { country: "JP", period: "today" } as LiveDashboardQuery,
      corruptChildren: [childFact("99", "Invented Prefecture")],
      expectedChildren: admin1Regions.map((region) => childFact(region.code, region.name))
    },
    {
      label: "nationwide ADMIN2 at the wrong level",
      query: { country: "JP", period: "today" } as LiveDashboardQuery,
      corruptChildren: [childFact("13104", "Wrong Level")],
      expectedChildren: admin1Regions.map((region) => childFact(region.code, region.name))
    },
    {
      label: "nationwide duplicate code",
      query: { country: "JP", period: "today" } as LiveDashboardQuery,
      corruptChildren: [childFact("13", "Tokyo"), childFact("13", "Duplicate Tokyo")],
      expectedChildren: admin1Regions.map((region) => childFact(region.code, region.name))
    },
    {
      label: "nationwide incomplete set",
      query: { country: "JP", period: "today" } as LiveDashboardQuery,
      corruptChildren: [childFact("13", "Tokyo")],
      expectedChildren: admin1Regions.map((region) => childFact(region.code, region.name))
    },
    {
      label: "admin1 child with the wrong parent",
      query: { country: "JP", admin1: "13", period: "today" } as LiveDashboardQuery,
      corruptChildren: [childFact("27127", "Osaka City")],
      expectedChildren: admin2Regions.map((region) => childFact(region.code, region.name))
    },
    {
      label: "admin2 non-empty child set",
      query: {
        country: "JP",
        admin1: "13",
        admin2: "13104",
        period: "today"
      } as LiveDashboardQuery,
      corruptChildren: [childFact("13103", "Minato City")],
      expectedChildren: []
    }
  ])(
    "rejects $label cached children and recomputes once",
    async ({ query, corruptChildren, expectedChildren }) => {
      const scope = {
        countryCode: "JP" as const,
        admin1Code: query.admin1 ?? null,
        admin2Code: query.admin2 ?? null
      };
      const freshFacts: LiveDashboardSnapshotFacts = {
        ...facts(),
        scope,
        children: expectedChildren
      };
      const corrupt = { ...serializedFacts(freshFacts), children: corruptChildren };
      const redis = {
        isOpen: true,
        connect: jest.fn(async () => undefined),
        get: jest.fn(async () =>
          JSON.stringify({ cachedAt: evaluatedAt.toISOString(), value: corrupt })
        ),
        set: jest.fn(async () => "OK"),
        sendCommand: jest.fn(async () => 1)
      };
      const cache = new LiveDashboardCache(
        () => redis,
        () => evaluatedAt
      );
      const repository = { getSnapshotFacts: jest.fn(async () => freshFacts) };
      const regions = {
        listChildren: jest.fn(async ({ parent }: { parent?: string }) =>
          parent ? admin2Regions : admin1Regions
        ),
        resolveVerifiedScope: jest.fn(async () => ({
          countryCode: "JP" as const,
          admin1Code: "13",
          admin2Code: "13104",
          admin1RegionId: 13,
          admin1NameJa: "東京都",
          admin2RegionId: 13104,
          admin2NameJa: "新宿区",
          datasetVersion: "N03-20260101" as const
        }))
      };
      const audit = { record: jest.fn(async () => undefined) };
      const service = new LiveDashboardService(
        repository,
        regions,
        cache,
        audit,
        () => evaluatedAt
      );

      const result = await service.getSnapshot(actor, context, query, "en");

      expect(result.cacheStatus).toBe("degraded");
      expect(result.children).toEqual(expectedChildren);
      expect(JSON.stringify(result)).not.toMatch(/Invented|Wrong Level|Duplicate|Osaka City/);
      expect(repository.getSnapshotFacts).toHaveBeenCalledTimes(1);
      expect(redis.set).not.toHaveBeenCalled();
    }
  );
});
