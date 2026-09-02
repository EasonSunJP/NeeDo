import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  backofficeRealDataApi,
  type AnalyticsComparisonDirection,
  type AnalyticsDataStatus,
  type AnalyticsMetricPayload,
  type AnalyticsMetricSeries,
  type BackofficeDashboardPayload,
  type DashboardMetricDetailPayload,
  type DashboardOverviewPayload,
  type DashboardPlatformGlobalNdpPair,
  type DashboardQuery,
  type ManageableMerchantShopPayload
} from "./backofficeRealData";
import { httpClient } from "./httpClient";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("formal dashboard frontend API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes the required default platform period explicitly", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({});

    await backofficeRealDataApi.dashboard("backoffice", {
      period: "last7days"
    });

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/dashboard", {
      query: { period: "last7days" }
    });
  });

  it("serializes the complete custom platform range and city", async () => {
    const query: DashboardQuery = {
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      city: "Tokyo"
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce({});

    await backofficeRealDataApi.dashboard("backoffice", query);

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/dashboard", {
      query
    });
  });

  it("whitelists platform query fields and removes non-custom boundaries", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({});
    const untrustedQuery = {
      period: "month",
      from: "2026-08-01",
      to: "2026-08-31",
      city: "Tokyo",
      shopId: "999",
      unknown: "must-not-leave-client"
    } as DashboardQuery & { shopId: string; unknown: string };

    await backofficeRealDataApi.dashboard("backoffice", untrustedQuery);

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/dashboard", {
      query: { period: "month", city: "Tokyo" }
    });
  });

  it("rejects a custom query unless both formal boundaries are present", () => {
    expect(() =>
      backofficeRealDataApi.dashboard("backoffice", {
        period: "custom",
        from: "2026-08-01"
      })
    ).toThrow("error.dashboard.custom_range_required");
    expect(() =>
      backofficeRealDataApi.dashboard("merchant-admin", {
        period: "custom",
        to: "2026-08-31"
      })
    ).toThrow("error.dashboard.custom_range_required");
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it("never serializes city or an arbitrary shopId for merchant dashboard scope", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({});
    const untrustedQuery = {
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      city: "Osaka",
      shopId: "999"
    } as DashboardQuery & { shopId: string };

    await backofficeRealDataApi.dashboard("merchant-admin", untrustedQuery);

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/dashboard", {
      query: {
        period: "custom",
        from: "2026-08-01",
        to: "2026-08-31"
      }
    });
  });

  it("forwards the caller abort signal without adding it to the query", async () => {
    const controller = new AbortController();
    vi.mocked(httpClient.request).mockResolvedValueOnce({});

    await backofficeRealDataApi.dashboard(
      "merchant-admin",
      { period: "last7days" },
      { signal: controller.signal }
    );

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/dashboard", {
      query: { period: "last7days" },
      signal: controller.signal
    });
  });

  it("serializes formal member trend and member-list filters for each scope", async () => {
    const point = { key: "2026-08-26", label: "08-26", value: 0 };
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({
        dataStatus: "ready",
        filter: {
          period: "last7days",
          from: "2026-08-26",
          to: "2026-09-01",
          previousFrom: "2026-08-19",
          previousTo: "2026-08-25",
          timeZone: "Asia/Tokyo",
          granularity: "day",
          city: "东京",
          evaluatedAt: "2026-09-02T05:00:00.000Z"
        },
        series: [
          { seriesKey: "added", label: "Added members", unit: "people", points: [point] },
          { seriesKey: "removed", label: "Removed members", unit: "people", points: [point] },
          { seriesKey: "net", label: "Net members", unit: "people", points: [point] }
        ]
      })
      .mockResolvedValueOnce({ list: [], total: 0, page: 2, page_size: 20 })
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 20 });
    const controller = new AbortController();

    await backofficeRealDataApi.membershipTrend(
      "backoffice",
      { period: "last7days", city: "东京" },
      { signal: controller.signal }
    );
    await backofficeRealDataApi.membershipMembers(
      "backoffice",
      {
        period: "last7days",
        city: "东京",
        needoId: " u0000000041 ",
        nickname: " 美咲 ",
        page: 2,
        pageSize: 20
      },
      { signal: controller.signal }
    );
    await backofficeRealDataApi.membershipMembers("merchant-admin", {
      period: "last7days",
      city: "大阪",
      page: 1,
      pageSize: 20
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/analytics/members/trend", {
      query: { period: "last7days", city: "东京" },
      signal: controller.signal
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/analytics/members", {
      query: {
        period: "last7days",
        city: "东京",
        needoId: "u0000000041",
        nickname: "美咲",
        page: 2,
        pageSize: 20
      },
      signal: controller.signal
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/merchant-admin/analytics/members", {
      query: { period: "last7days", page: 1, pageSize: 20 }
    });
  });

  it("rejects unsafe member-list pagination before issuing a request", async () => {
    await expect(backofficeRealDataApi.membershipMembers("backoffice", {
      period: "last7days", page: 0, pageSize: 20
    })).rejects.toThrow("error.pagination.invalid");
    await expect(backofficeRealDataApi.membershipMembers("backoffice", {
      period: "last7days", page: 1, pageSize: 101
    })).rejects.toThrow("error.pagination.invalid");
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it("serializes the formal Top10 ranking metric, category and dashboard filter", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      dataStatus: "ready",
      filter: {
        kind: "technician",
        metric: "completedCount",
        period: "custom",
        from: "2026-08-01",
        to: "2026-08-31",
        timeZone: "Asia/Tokyo",
        city: "东京",
        categoryId: 7,
        evaluatedAt: "2026-09-02T05:00:00.000Z"
      },
      list: [],
      total: 0,
      page: 1,
      page_size: 10
    });

    await backofficeRealDataApi.analyticsRankings("technician", {
      metric: "completedCount",
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      city: "东京",
      categoryId: 7,
      page: 1,
      pageSize: 10
    });

    expect(httpClient.request).toHaveBeenCalledWith(
      "/backoffice/analytics/rankings/technician",
      {
        query: {
          metric: "completedCount",
          period: "custom",
          from: "2026-08-01",
          to: "2026-08-31",
          city: "东京",
          categoryId: 7,
          page: 1,
          pageSize: 10
        }
      }
    );
  });

  it.each([
    ["technician", "customer"],
    ["customer", "technician"],
    ["service", "customer"]
  ] as const)("rejects a %s ranking row with mismatched %s identity", async (kind, entityType) => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      dataStatus: "ready",
      filter: {
        kind,
        metric: "gmv",
        period: "last7days",
        from: "2026-08-27",
        to: "2026-09-02",
        timeZone: "Asia/Tokyo",
        city: null,
        categoryId: null,
        evaluatedAt: "2026-09-02T05:00:00.000Z"
      },
      list: [{
        rank: 1,
        entityType,
        entityPublicId: "u0000000041",
        entityNumericId: 41,
        displayName: "Mismatch",
        avatarUrl: null,
        categoryId: null,
        gmvJpy: 1000,
        completedCount: 1,
        registeredAt: "2026-01-01T00:00:00.000Z"
      }],
      total: 1,
      page: 1,
      page_size: 10
    });

    await expect(backofficeRealDataApi.analyticsRankings(kind, {
      metric: "gmv",
      period: "last7days",
      page: 1,
      pageSize: 10
    })).rejects.toThrow("error.api");
  });

  it("rejects invalid ranking identifiers and pagination before issuing a request", async () => {
    await expect(backofficeRealDataApi.analyticsRankings("shop" as "service", {
      metric: "gmv", period: "last7days", page: 1, pageSize: 10
    })).rejects.toThrow("error.analytics_ranking.invalid");
    await expect(backofficeRealDataApi.analyticsRankings("service", {
      metric: "gmv", period: "last7days", page: 1, pageSize: 11
    })).rejects.toThrow("error.pagination.invalid");
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it("uses strict backend pagination names for manageable merchant shops", async () => {
    const page = {
      list: [
        {
          publicId: "shop0000000011",
          name: "Aoyama Care Studio",
          city: "Tokyo",
          status: "published",
          selected: true
        }
      ],
      total: 51,
      page: 2,
      page_size: 50
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce(page);

    const controller = new AbortController();
    await expect(
      backofficeRealDataApi.manageableMerchantShops(2, 50, {
        signal: controller.signal
      })
    ).resolves.toEqual(page);

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/manageable-shops", {
      query: { page: 2, page_size: 50 },
      signal: controller.signal
    });
  });

  it("projects manageable shops to the locked safe fields", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      list: [
        {
          id: 99,
          ownerUserId: 7,
          publicId: "shop0000000011",
          name: "Aoyama Care Studio",
          city: "Tokyo",
          status: "published",
          selected: true
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });

    await expect(backofficeRealDataApi.manageableMerchantShops()).resolves.toEqual({
      list: [
        {
          publicId: "shop0000000011",
          name: "Aoyama Care Studio",
          city: "Tokyo",
          status: "published",
          selected: true
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
  });

  it.each([
    [{ list: [], total: 0, page: 0, page_size: 20 }],
    [{ list: [], total: 0, page: 1, page_size: 0 }],
    [{ list: [], total: 0, page: 2, page_size: 20 }],
    [{ list: [], total: Number.MAX_SAFE_INTEGER + 1, page: 1, page_size: 20 }],
    [{ list: [], total: 0, page: Number.MAX_SAFE_INTEGER + 1, page_size: 20 }],
    [{ list: [], total: 0, page: 1, page_size: 50 }],
    [{ list: [], total: 0, page: 1, page_size: 101 }],
    [
      {
        list: [
          {
            publicId: "shop0000000011",
            name: "",
            city: "Tokyo",
            status: "published",
            selected: true
          }
        ],
        total: 1,
        page: 1,
        page_size: 20
      }
    ],
    [
      {
        list: Array.from({ length: 2 }, (_, index) => ({
          publicId: `shop${String(index + 1).padStart(10, "0")}`,
          name: `Shop ${index + 1}`,
          city: "Tokyo",
          status: "published",
          selected: index === 0
        })),
        total: 2,
        page: 1,
        page_size: 1
      }
    ],
    [
      {
        list: [
          {
            publicId: "11",
            name: "Aoyama Care Studio",
            city: "Tokyo",
            status: "published",
            selected: true
          }
        ],
        total: 1,
        page: 1,
        page_size: 20
      }
    ],
    [
      {
        list: [
          {
            publicId: "shop0000000011",
            name: "Aoyama Care Studio",
            city: "Tokyo",
            status: "published"
          }
        ],
        total: 1,
        page: 1,
        page_size: 20
      }
    ]
  ])("rejects an unsafe manageable-shop page without exposing partial fields", async (page) => {
    vi.mocked(httpClient.request).mockResolvedValueOnce(page);

    await expect(backofficeRealDataApi.manageableMerchantShops(1, 20)).rejects.toThrow("error.api");
  });

  it.each([
    [0, 20],
    [1, 0],
    [1, 101],
    [1.5, 20],
    [Number.MAX_SAFE_INTEGER + 1, 20],
    [1, Number.MAX_SAFE_INTEGER + 1]
  ])(
    "rejects invalid manageable-shop pagination before the request (%s, %s)",
    async (page, pageSize) => {
      await expect(backofficeRealDataApi.manageableMerchantShops(page, pageSize)).rejects.toThrow(
        "error.pagination.invalid"
      );
      expect(httpClient.request).not.toHaveBeenCalled();
    }
  );

  it("matches the locked nullable merchant finance and public shop DTO", () => {
    expectTypeOf<ManageableMerchantShopPayload>().toEqualTypeOf<{
      publicId: string;
      name: string;
      city: string;
      status: string;
      selected: boolean;
    }>();
    expectTypeOf<
      BackofficeDashboardPayload["finance"]["walletStock"]
    >().toEqualTypeOf<DashboardPlatformGlobalNdpPair | null>();
    expectTypeOf<
      BackofficeDashboardPayload["finance"]["withdrawn"]
    >().toEqualTypeOf<DashboardPlatformGlobalNdpPair | null>();
    expectTypeOf<
      NonNullable<BackofficeDashboardPayload["shop"]>["publicId"]
    >().toEqualTypeOf<string>();
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty("metrics");
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty("orders");
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty("technicians");
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty("shops");
  });

  it("matches the locked backend analytics metric and series structures", () => {
    expectTypeOf<AnalyticsDataStatus>().toEqualTypeOf<
      "ready" | "not_connected" | "not_available"
    >();
    expectTypeOf<AnalyticsComparisonDirection>().toEqualTypeOf<
      "up" | "down" | "flat" | "unavailable"
    >();
    expectTypeOf<AnalyticsMetricPayload>().toEqualTypeOf<{
      metricKey: string;
      currentValue: number | null;
      previousValue: number | null;
      comparisonPercent: number | null;
      comparisonDirection: AnalyticsComparisonDirection;
      unit: "jpy" | "ndp" | "people" | "count";
      dataStatus: AnalyticsDataStatus;
      description: string;
      formula: string;
      detailRoute: string | null;
    }>();
    expectTypeOf<AnalyticsMetricSeries>().toEqualTypeOf<{
      seriesKey: string;
      label: string;
      unit: AnalyticsMetricPayload["unit"];
      points: Array<{ key: string; label: string; value: number | null }>;
    }>();
  });

  const analyticsFilter = {
    period: "last7days" as const,
    from: "2026-08-26",
    to: "2026-09-01",
    previousFrom: "2026-08-19",
    previousTo: "2026-08-25",
    timeZone: "Asia/Tokyo" as const,
    granularity: "day" as const,
    city: "Tokyo"
  };
  const readyMetric: AnalyticsMetricPayload = {
    metricKey: "gross_revenue",
    currentValue: 1200,
    previousValue: 1000,
    comparisonPercent: 20,
    comparisonDirection: "up",
    unit: "jpy",
    dataStatus: "ready",
    description: "Formal backend description",
    formula: "completed confirmed orders",
    detailRoute: "/admin/analytics/metrics/gross_revenue"
  };
  const metricForKey = (metricKey: string): AnalyticsMetricPayload => ({
    ...readyMetric,
    metricKey,
    unit: metricKey === "marketing_commission" || metricKey === "ndp_income" || metricKey === "affiliate_platform_income"
      ? "ndp"
      : metricKey.includes("onboarding") || metricKey === "new_users" || metricKey === "new_paid_members"
        ? "people"
        : "jpy",
    detailRoute: metricKey === "franchisee_onboarding" || metricKey === "supplier_onboarding"
      ? null
      : metricKey === "new_paid_members"
        ? "/admin/analytics/members"
        : `/admin/analytics/metrics/${metricKey}`
  });
  const analyticsOverview = (grossRevenue = readyMetric): DashboardOverviewPayload => ({
    filter: analyticsFilter,
    operationsFinance: [
      grossRevenue,
      metricForKey("travel_fare"),
      metricForKey("discount_amount"),
      metricForKey("consumables_sales")
    ],
    commissionMetrics: [
      "dedicated_technician_commission",
      "part_time_technician_commission",
      "marketing_commission",
      "agent_commission",
      "ndp_income",
      "affiliate_platform_income",
      "consumables_profit"
    ].map(metricForKey),
    growthMetrics: [
      "new_users",
      "new_paid_members",
      "technician_onboarding",
      "agent_onboarding",
      "franchisee_onboarding",
      "supplier_onboarding"
    ].map(metricForKey)
  });

  it("loads and strictly projects the formal analytics overview with the serialized dashboard query", async () => {
    const payload = {
      ...analyticsOverview(),
      filter: { ...analyticsFilter, period: "custom" as const }
    };
    const controller = new AbortController();
    vi.mocked(httpClient.request).mockResolvedValueOnce(payload);

    await expect(backofficeRealDataApi.dashboardOverview({
      period: "custom",
      from: "2026-08-26",
      to: "2026-09-01",
      city: "Tokyo"
    }, { signal: controller.signal })).resolves.toEqual(payload);

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/dashboard/overview", {
      query: {
        period: "custom",
        from: "2026-08-26",
        to: "2026-09-01",
        city: "Tokyo"
      },
      signal: controller.signal
    });
  });

  it("loads the metric detail without normalizing authoritative null values", async () => {
    const unavailableMetric: AnalyticsMetricPayload = {
      ...readyMetric,
      metricKey: "travel_fare",
      currentValue: null,
      previousValue: null,
      comparisonPercent: null,
      comparisonDirection: "unavailable",
      dataStatus: "not_connected",
      detailRoute: "/admin/analytics/metrics/travel_fare"
    };
    const payload: DashboardMetricDetailPayload = {
      filter: analyticsFilter,
      metric: unavailableMetric,
      series: [{
        seriesKey: "travel_fare",
        label: "Formal backend description",
        unit: "jpy",
        points: [
          { key: "previous", label: "2026-08-19 - 2026-08-25", value: null },
          { key: "current", label: "2026-08-26 - 2026-09-01", value: null }
        ]
      }]
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce(payload);

    await expect(backofficeRealDataApi.dashboardMetricDetail("travel_fare", {
      period: "last7days",
      city: "Tokyo"
    })).resolves.toEqual(payload);

    expect(httpClient.request).toHaveBeenCalledWith(
      "/backoffice/dashboard/metrics/travel_fare",
      { query: { period: "last7days", city: "Tokyo" } }
    );
  });

  it.each([
    { ...readyMetric, currentValue: null },
    { ...readyMetric, comparisonPercent: 19 },
    { ...readyMetric, comparisonDirection: "flat" },
    { ...readyMetric, dataStatus: "not_available", currentValue: null, previousValue: null },
    { ...readyMetric, metricKey: "" },
    { ...readyMetric, currentValue: Number.POSITIVE_INFINITY }
  ])("rejects incoherent analytics metric payloads", async (metric) => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      ...analyticsOverview(metric as AnalyticsMetricPayload)
    });

    await expect(backofficeRealDataApi.dashboardOverview({ period: "last7days" }))
      .rejects.toThrow("error.api");
  });

  it.each([
    { ...analyticsFilter, timeZone: "UTC" },
    { ...analyticsFilter, availableCities: ["must not be accepted"] },
    { ...analyticsFilter, city: 17 },
    { ...analyticsFilter, from: "not-a-date" },
    { ...analyticsFilter, from: "2026-09-02" },
    { ...analyticsFilter, previousTo: "2026-08-26" },
    { ...analyticsFilter, previousFrom: "2026-08-18" },
    { ...analyticsFilter, granularity: "hour" }
  ])("rejects malformed analytics filters", async (filter) => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      ...analyticsOverview(),
      filter
    });

    await expect(backofficeRealDataApi.dashboardOverview({ period: "last7days" }))
      .rejects.toThrow("error.api");
  });

  it("rejects missing or reordered overview metrics instead of inventing cards", async () => {
    const payload = analyticsOverview();
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ ...payload, growthMetrics: payload.growthMetrics.slice(1) })
      .mockResolvedValueOnce({
        ...payload,
        operationsFinance: [payload.operationsFinance[1], payload.operationsFinance[0], ...payload.operationsFinance.slice(2)]
      });
    await expect(backofficeRealDataApi.dashboardOverview({ period: "last7days" }))
      .rejects.toThrow("error.api");
    await expect(backofficeRealDataApi.dashboardOverview({ period: "last7days" }))
      .rejects.toThrow("error.api");
  });

  it.each([
    [{ period: "last30days" as const }, analyticsOverview()],
    [{ period: "last7days" as const, city: "Osaka" }, analyticsOverview()],
    [{ period: "custom" as const, from: "2026-08-27", to: "2026-09-01" }, {
      ...analyticsOverview(), filter: { ...analyticsFilter, period: "custom" as const }
    }]
  ])("binds the analytics response filter to the exact serialized request", async (query, payload) => {
    vi.mocked(httpClient.request).mockResolvedValueOnce(payload);
    await expect(backofficeRealDataApi.dashboardOverview(query)).rejects.toThrow("error.api");
  });

  it("requires the period-specific granularity while accepting a long custom monthly window", async () => {
    const yearPayload = {
      ...analyticsOverview(),
      filter: {
        ...analyticsFilter,
        period: "year" as const,
        from: "2026-01-01",
        to: "2026-12-31",
        previousFrom: "2025-01-01",
        previousTo: "2025-12-31",
        granularity: "day" as const
      }
    };
    const longCustomPayload = {
      ...analyticsOverview(),
      filter: {
        ...analyticsFilter,
        period: "custom" as const,
        from: "2026-01-01",
        to: "2026-04-03",
        previousFrom: "2025-09-30",
        previousTo: "2025-12-31",
        granularity: "month" as const,
        city: null
      }
    };
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(yearPayload)
      .mockResolvedValueOnce(longCustomPayload);

    await expect(backofficeRealDataApi.dashboardOverview({ period: "year" }))
      .rejects.toThrow("error.api");
    await expect(backofficeRealDataApi.dashboardOverview({
      period: "custom", from: "2026-01-01", to: "2026-04-03"
    })).resolves.toEqual(longCustomPayload);
  });

  it.each([
    [{ period: "today" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "today" as const,
      from: "2026-08-31",
      to: "2026-09-01",
      previousFrom: "2026-08-29",
      previousTo: "2026-08-30",
      granularity: "hour" as const
    }],
    [{ period: "last7days" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      from: "2026-08-27",
      previousFrom: "2026-08-21",
      previousTo: "2026-08-26"
    }],
    [{ period: "last30days" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "last30days" as const,
      from: "2026-08-04",
      previousFrom: "2026-07-06",
      previousTo: "2026-08-03"
    }],
    [{ period: "week" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "week" as const,
      from: "2026-08-26",
      to: "2026-09-01",
      previousFrom: "2026-08-19",
      previousTo: "2026-08-25"
    }],
    [{ period: "month" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "month" as const,
      from: "2026-08-02",
      to: "2026-09-01",
      previousFrom: "2026-07-02",
      previousTo: "2026-08-01"
    }],
    [{ period: "year" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "year" as const,
      from: "2025-09-02",
      to: "2026-09-01",
      previousFrom: "2024-09-02",
      previousTo: "2025-09-01",
      granularity: "month" as const
    }]
  ])("rejects a contiguous but semantically invalid non-custom period window", async (query, responseFilter) => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      ...analyticsOverview(),
      filter: responseFilter
    });
    await expect(backofficeRealDataApi.dashboardOverview(query)).rejects.toThrow("error.api");
  });

  it.each([
    [{ period: "today" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "today" as const,
      from: "2026-09-01",
      to: "2026-09-01",
      previousFrom: "2026-08-31",
      previousTo: "2026-08-31",
      granularity: "hour" as const
    }],
    [{ period: "last30days" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "last30days" as const,
      from: "2026-08-03",
      previousFrom: "2026-07-04",
      previousTo: "2026-08-02"
    }],
    [{ period: "week" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "week" as const,
      from: "2026-08-31",
      to: "2026-09-06",
      previousFrom: "2026-08-24",
      previousTo: "2026-08-30"
    }],
    [{ period: "month" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "month" as const,
      from: "2026-08-01",
      to: "2026-08-31",
      previousFrom: "2026-07-01",
      previousTo: "2026-07-31"
    }],
    [{ period: "year" as const, city: "Tokyo" }, {
      ...analyticsFilter,
      period: "year" as const,
      from: "2026-01-01",
      to: "2026-12-31",
      previousFrom: "2025-01-01",
      previousTo: "2025-12-31",
      granularity: "month" as const
    }]
  ])("accepts the exact formal non-custom period window", async (query, responseFilter) => {
    const payload = { ...analyticsOverview(), filter: responseFilter };
    vi.mocked(httpClient.request).mockResolvedValueOnce(payload);
    await expect(backofficeRealDataApi.dashboardOverview(query)).resolves.toEqual(payload);
  });

  it.each([
    [[{ seriesKey: "gross_revenue", label: "x", unit: "jpy", points: [] }]],
    [[{
      seriesKey: "wrong",
      label: "x",
      unit: "jpy",
      points: [
        { key: "previous", label: "p", value: 1000 },
        { key: "current", label: "c", value: 1200 }
      ]
    }]],
    [[{
      seriesKey: "gross_revenue",
      label: "x",
      unit: "jpy",
      points: [
        { key: "previous", label: "p", value: 1000 },
        { key: "current", label: "c", value: Number.NaN }
      ]
    }]],
    [[{
      seriesKey: "gross_revenue",
      label: "not the metric description",
      unit: "jpy",
      points: [
        { key: "previous", label: "2026-08-19 - 2026-08-25", value: 1000 },
        { key: "current", label: "2026-08-26 - 2026-09-01", value: 1200 }
      ]
    }]],
    [[{
      seriesKey: "gross_revenue",
      label: "Formal backend description",
      unit: "jpy",
      points: [
        { key: "previous", label: "wrong previous label", value: 1000 },
        { key: "current", label: "2026-08-26 - 2026-09-01", value: 1200 }
      ]
    }]]
  ])("rejects malformed analytics detail series", async (series) => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      filter: analyticsFilter,
      metric: readyMetric,
      series
    });

    await expect(backofficeRealDataApi.dashboardMetricDetail("gross_revenue", {
      period: "last7days", city: "Tokyo"
    })).rejects.toThrow("error.api");
  });

  it("preserves an authoritative empty detail series for the explicit empty state", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      filter: analyticsFilter,
      metric: readyMetric,
      series: []
    });
    await expect(backofficeRealDataApi.dashboardMetricDetail("gross_revenue", {
      period: "last7days", city: "Tokyo"
    })).resolves.toMatchObject({ series: [] });
  });

  it("rejects a detail projection for a different metric than the requested route key", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      filter: analyticsFilter,
      metric: readyMetric,
      series: []
    });
    await expect(backofficeRealDataApi.dashboardMetricDetail("travel_fare", {
      period: "last7days", city: "Tokyo"
    })).rejects.toThrow("error.api");
  });
});
