import type { DashboardAggregateFacts } from "../src/domain/dashboard";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import { BackofficeService } from "../src/services/backoffice.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-08-31T03:00:00.000Z");
const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "jest" };
const platformActor = {
  userId: 1,
  email: "admin@example.com",
  accessTokenJti: "platform-dashboard",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityType: "platform_admin",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["admin"],
  permissions: ["backoffice:dashboard:read"]
} as AuthenticatedAccessContext;
const merchantActor = {
  ...platformActor,
  userId: 2,
  email: "merchant@example.com",
  accessTokenJti: "merchant-dashboard",
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:dashboard:read"]
} as AuthenticatedAccessContext;

const aggregateFacts = (): DashboardAggregateFacts => ({
  current: {
    availableScheduleSlots: 8,
    activeTechnicians: 0,
    registeredTechnicians: 17,
    shopCount: 10,
    newCustomers: 10,
    pendingOrders: 4,
    serviceGmvJpy: 12_345,
    completedCustomerCount: 3
  },
  previous: {
    availableScheduleSlots: 5,
    activeTechnicians: 0,
    registeredTechnicians: 13,
    shopCount: 3,
    newCustomers: 6,
    serviceGmvJpy: 10_000,
    completedCustomerCount: 2
  },
  buckets: [
    {
      key: "2026-08-25",
      label: "08-25",
      orderCount: 2,
      serviceGmvJpy: 4_000,
      shopCount: 10,
      registeredTechnicianCount: 17,
      scheduleTotalHours: 6,
      scheduleAvailableHours: 4,
      scheduleAttendanceCount: 1,
      scheduleBookedHours: 2
    }
  ],
  finance: {
    platformNetRevenue: { ndp: 900, testNdp: 90 },
    frozen: { ndp: 500, testNdp: 50 },
    userReward: { ndp: 100, testNdp: 20 },
    walletStock: { ndp: 5_000, testNdp: 500 },
    withdrawn: { ndp: 200, testNdp: 0 },
    shopNdpCost: null,
    bucketPlatformNetRevenueNdp: new Map([["2026-08-25", 125]]),
    bucketFrozenNdp: new Map([["2026-08-25", 250]]),
    bucketShopEstimatedGrossProfitJpy: new Map([["2026-08-25", 3_500]])
  },
  merchant: null,
  membership: null,
  availableCities: ["Osaka", "Tokyo"]
});

const headlineBuckets = () => [
  {
    key: "2026-08-29",
    label: "08-29",
    availableScheduleSlots: 4,
    activeTechnicians: 2,
    registeredTechnicians: 15,
    shopCount: 9,
    newCustomers: 1
  },
  {
    key: "2026-08-30",
    label: "08-30",
    availableScheduleSlots: 6,
    activeTechnicians: 3,
    registeredTechnicians: 16,
    shopCount: 10,
    newCustomers: 2
  },
  {
    key: "2026-08-31",
    label: "08-31",
    availableScheduleSlots: 8,
    activeTechnicians: 4,
    registeredTechnicians: 17,
    shopCount: 10,
    newCustomers: 3
  }
];

describe("BackofficeService named dashboard contract", () => {
  it("composes the platform DTO, comparison rules, buckets, global metadata, and audit scope", async () => {
    const getDashboard = jest.fn(async () => aggregateFacts());
    const getHeadlineSeries3d = jest.fn(async () => headlineBuckets());
    const record = jest.fn(async () => undefined);
    const service = new BackofficeService(
      { getDashboard, getHeadlineSeries3d } as never,
      { record } as never,
      createDirectShopContextRepository(),
      () => now
    );

    const result = await service.getPlatformDashboard(platformActor, context, {
      period: "last7days",
      city: "Tokyo"
    });

    expect(result).toEqual({
      filter: {
        period: "last7days",
        from: "2026-08-25",
        to: "2026-08-31",
        previousFrom: "2026-08-18",
        previousTo: "2026-08-24",
        timeZone: "Asia/Tokyo",
        granularity: "day",
        city: "Tokyo",
        availableCities: ["Osaka", "Tokyo"]
      },
      summary: {
        availableScheduleSlots: { current: 8, previous: 5, changeRatePercent: 60 },
        activeTechnicians: { current: 0, previous: 0, changeRatePercent: null },
        registeredTechnicians: {
          current: 17,
          previous: 13,
          changeRatePercent: 30.77
        },
        shopCount: { current: 10, previous: 3, changeRatePercent: 233.33 },
        newCustomers: { current: 10, previous: 6, changeRatePercent: 66.67 },
        pendingOrders: 4,
        serviceGmvJpy: 12_345
      },
      series: {
        buckets: [
          {
            key: "2026-08-25",
            label: "08-25",
            orderCount: 2,
            serviceGmvJpy: 4_000,
            platformNetRevenueNdp: 125,
            frozenNdp: 250,
            shopCount: 10,
            registeredTechnicianCount: 17,
            shopEstimatedGrossProfitJpy: 3_500,
            scheduleTotalHours: 6,
            scheduleAvailableHours: 4,
            scheduleAttendanceCount: 1,
            scheduleBookedHours: 2
          }
        ]
      },
      headlineSeries3d: {
        from: "2026-08-29",
        to: "2026-08-31",
        timeZone: "Asia/Tokyo",
        buckets: headlineBuckets()
      },
      finance: {
        platformNetRevenue: { ndp: 900, testNdp: 90 },
        frozen: { ndp: 500, testNdp: 50 },
        userReward: { ndp: 100, testNdp: 20 },
        walletStock: {
          ndp: 5_000,
          testNdp: 500,
          cityFilterApplied: false,
          scopeLabel: "platform_global"
        },
        withdrawn: {
          ndp: 200,
          testNdp: 0,
          cityFilterApplied: false,
          scopeLabel: "platform_global"
        },
        shopNdpCost: null
      },
      shop: null,
      membership: null,
      scope: { kind: "platform", shopPublicId: null }
    });
    expect(getDashboard).toHaveBeenCalledTimes(1);
    expect(getHeadlineSeries3d).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: "platform" },
        city: "Tokyo",
        window: expect.objectContaining({
          fromDate: "2026-08-29",
          toDate: "2026-08-31",
          timeZone: "Asia/Tokyo",
          granularity: "day"
        }),
        evaluatedAt: now
      })
    );
    expect(getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: "platform" },
        city: "Tokyo",
        window: expect.objectContaining({
          period: "last7days",
          fromDate: "2026-08-25",
          toDate: "2026-08-31"
        })
      })
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backoffice.dashboard.read",
        targetType: "backoffice_dashboard",
        metadata: {
          period: "last7days",
          from: "2026-08-25",
          to: "2026-08-31",
          city: "Tokyo",
          shopId: null
        }
      })
    );
  });

  it("keeps merchant-only nulls, reports real completed customers, and never exposes global wallet facts", async () => {
    const facts = aggregateFacts();
    facts.current.shopCount = null;
    facts.current.newCustomers = null;
    facts.previous.shopCount = null;
    facts.previous.newCustomers = null;
    facts.finance.walletStock = null;
    facts.finance.withdrawn = null;
    facts.finance.shopNdpCost = {
      totalNdp: 500,
      platformNdp: 400,
      userRewardNdp: 100
    };
    facts.merchant = {
      publicId: "shop0000000011",
      name: "Aoyama Care Studio",
      city: "Tokyo",
      address: "Aoyama 1-1",
      status: "published",
      activeTechnicianCount: 5,
      billing: null,
      wallet: null
    };
    facts.availableCities = [];
    facts.membership = { memberCount: 7, completedCustomerCount: 5 };
    const getDashboard = jest.fn(async () => facts);
    const getHeadlineSeries3d = jest.fn(async () => headlineBuckets());
    const record = jest.fn(async () => undefined);
    const service = new BackofficeService(
      { getDashboard, getHeadlineSeries3d } as never,
      { record } as never,
      createDirectShopContextRepository(),
      () => now
    );

    const result = await service.getMerchantDashboard(merchantActor, context, {
      period: "last7days"
    });

    expect(result.summary.shopCount).toBeNull();
    expect(result.summary.newCustomers).toBeNull();
    expect(result.finance.walletStock).toBeNull();
    expect(result.finance.withdrawn).toBeNull();
    expect(result.finance.shopNdpCost).toEqual({
      totalNdp: 500,
      platformNdp: 400,
      userRewardNdp: 100
    });
    expect(result.membership).toEqual({
      memberCount: 7,
      memberDataStatus: "ready",
      completedCustomerCount: 5
    });
    expect(result.shop).toEqual(
      expect.objectContaining({
        publicId: "shop0000000011",
        wallet: {
          status: "not_opened",
          currency: "NDP",
          availableBalance: null,
          frozenBalance: null
        }
      })
    );
    expect(result.scope).toEqual({ kind: "shop", shopPublicId: "shop0000000011" });
    expect(getDashboard).toHaveBeenCalledTimes(1);
    expect(getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "shop", shopId: 11 }, city: null, evaluatedAt: now })
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.dashboard.read",
        metadata: {
          period: "last7days",
          from: "2026-08-25",
          to: "2026-08-31",
          city: null,
          shopId: 11
        }
      })
    );
  });

  it("captures one evaluatedAt clock for window resolution, membership validity, and shop projection", async () => {
    const facts = aggregateFacts();
    facts.merchant = {
      publicId: "shop0000000011",
      name: "Clock Shop",
      city: "Tokyo",
      address: "1-1",
      status: "published",
      activeTechnicianCount: 0,
      billing: null,
      wallet: null
    };
    facts.membership = { memberCount: 1, completedCustomerCount: 1 };
    const getDashboard = jest.fn(async () => facts);
    const getHeadlineSeries3d = jest.fn(async () => headlineBuckets());
    const nowFn = jest
      .fn()
      .mockReturnValueOnce(new Date("2026-08-31T14:59:59.999Z"))
      .mockReturnValueOnce(new Date("2026-09-01T15:00:00.000Z"));
    const service = new BackofficeService(
      { getDashboard, getHeadlineSeries3d } as never,
      { record: jest.fn(async () => undefined) } as never,
      createDirectShopContextRepository(),
      nowFn
    );

    await service.getMerchantDashboard(merchantActor, context, { period: "today" });

    expect(nowFn).toHaveBeenCalledTimes(1);
    expect(getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluatedAt: new Date("2026-08-31T14:59:59.999Z"),
        window: expect.objectContaining({ fromDate: "2026-08-31", toDate: "2026-08-31" })
      })
    );
    expect(getHeadlineSeries3d).toHaveBeenCalledWith(
      expect.objectContaining({ evaluatedAt: new Date("2026-08-31T14:59:59.999Z") })
    );
  });

  it("returns zeroes for applicable empty metrics while keeping undefined map buckets complete", async () => {
    const facts = aggregateFacts();
    facts.current = {
      availableScheduleSlots: 0,
      activeTechnicians: 1,
      registeredTechnicians: 0,
      shopCount: 0,
      newCustomers: 0,
      pendingOrders: 0,
      serviceGmvJpy: 0,
      completedCustomerCount: 0
    };
    facts.previous = {
      availableScheduleSlots: 0,
      activeTechnicians: 0,
      registeredTechnicians: 0,
      shopCount: 0,
      newCustomers: 0,
      serviceGmvJpy: 0,
      completedCustomerCount: 0
    };
    facts.finance.walletStock = null;
    facts.finance.withdrawn = null;
    facts.finance.bucketPlatformNetRevenueNdp = new Map();
    facts.finance.bucketFrozenNdp = new Map();
    facts.finance.bucketShopEstimatedGrossProfitJpy = new Map();
    const service = new BackofficeService(
      {
        getDashboard: jest.fn(async () => facts),
        getHeadlineSeries3d: jest.fn(async () => headlineBuckets())
      } as never,
      { record: jest.fn(async () => undefined) } as never,
      createDirectShopContextRepository(),
      () => now
    );

    const result = await service.getPlatformDashboard(platformActor, context, {
      period: "last7days"
    });

    expect(result.summary.availableScheduleSlots).toEqual({
      current: 0,
      previous: 0,
      changeRatePercent: null
    });
    expect(result.summary.activeTechnicians).toEqual({
      current: 1,
      previous: 0,
      changeRatePercent: null
    });
    expect(result.finance.walletStock).toEqual({
      ndp: 0,
      testNdp: 0,
      cityFilterApplied: false,
      scopeLabel: "platform_global"
    });
    expect(result.finance.withdrawn).toEqual({
      ndp: 0,
      testNdp: 0,
      cityFilterApplied: false,
      scopeLabel: "platform_global"
    });
    expect(result.series.buckets[0]).toEqual(
      expect.objectContaining({
        platformNetRevenueNdp: 0,
        frozenNdp: 0,
        shopEstimatedGrossProfitJpy: 0
      })
    );
  });
});
