import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  BackofficeService,
  DASHBOARD_METRIC_KEYS
} from "../src/services/backoffice.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-08-31T03:00:00.000Z");
const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "analytics-test" };
const actor = {
  userId: 1,
  email: "operator@example.test",
  accessTokenJti: "dashboard-overview",
  accessTokenExpiresAt: 1_800_000_000,
  roles: ["operator"],
  permissions: ["backoffice:dashboard:read", "backoffice:dashboard-detail:read"]
} as AuthenticatedAccessContext;

const analyticsFacts = () => ({
  operations: {
    grossRevenue: { current: 100, previous: 0, dataStatus: "ready" as const },
    travelFare: { current: null, previous: null, dataStatus: "not_connected" as const },
    discountAmount: { current: 100, previous: 100, dataStatus: "ready" as const },
    consumablesSales: { current: null, previous: null, dataStatus: "not_connected" as const }
  },
  commission: {
    dedicatedTechnicianCommission: { current: 25, previous: 100, dataStatus: "ready" as const },
    partTimeTechnicianCommission: { current: 20, previous: 10, dataStatus: "ready" as const },
    marketingCommission: { current: 30, previous: 20, dataStatus: "ready" as const },
    agentCommission: { current: 35, previous: 20, dataStatus: "ready" as const },
    ndpIncome: { current: 40, previous: 40, dataStatus: "ready" as const },
    affiliatePlatformIncome: { current: 12, previous: 8, dataStatus: "ready" as const },
    consumablesProfit: { current: null, previous: null, dataStatus: "not_connected" as const }
  },
  growth: {
    newUsers: { current: 8, previous: 4, dataStatus: "ready" as const },
    newPaidMembers: { current: 2, previous: 1, dataStatus: "ready" as const },
    technicianOnboarding: { current: 3, previous: 3, dataStatus: "ready" as const },
    agentOnboarding: { current: 2, previous: 1, dataStatus: "ready" as const },
    franchiseeOnboarding: { current: 1, previous: 0, dataStatus: "ready" as const },
    supplierOnboarding: { current: 3, previous: 2, dataStatus: "ready" as const }
  }
});

const createService = (override?: Partial<ReturnType<typeof analyticsFacts>>) => {
  const facts = { ...analyticsFacts(), ...override };
  const reader = {
    getOperationsFinance: jest.fn(async () => facts.operations),
    getCommissionFacts: jest.fn(async () => facts.commission),
    getGrowthFacts: jest.fn(async () => facts.growth)
  };
  const record = jest.fn(async () => undefined);
  const service = new BackofficeService(
    {} as never,
    { record } as never,
    createDirectShopContextRepository(),
    () => now,
    undefined,
    reader
  );
  return { service, reader, record };
};

describe("BackofficeService comprehensive dashboard analytics", () => {
  it("composes exact ordered groups, metadata, comparison edges, filter, and one audit", async () => {
    const fixture = createService();
    const result = await fixture.service.getDashboardOverview(actor, context, {
      period: "last7days",
      city: "Tokyo"
    });

    expect(DASHBOARD_METRIC_KEYS).toEqual([
      "gross_revenue", "travel_fare", "discount_amount", "consumables_sales",
      "dedicated_technician_commission", "part_time_technician_commission",
      "marketing_commission", "agent_commission", "ndp_income",
      "affiliate_platform_income", "consumables_profit", "new_users",
      "new_paid_members", "technician_onboarding", "agent_onboarding",
      "franchisee_onboarding", "supplier_onboarding"
    ]);
    expect(result.filter).toEqual({
      period: "last7days",
      from: "2026-08-25",
      to: "2026-08-31",
      previousFrom: "2026-08-18",
      previousTo: "2026-08-24",
      timeZone: "Asia/Tokyo",
      granularity: "day",
      city: "Tokyo"
    });
    expect(result.operationsFinance.map((metric) => metric.metricKey)).toEqual(
      DASHBOARD_METRIC_KEYS.slice(0, 4)
    );
    expect(result.commissionMetrics.map((metric) => metric.metricKey)).toEqual(
      DASHBOARD_METRIC_KEYS.slice(4, 11)
    );
    expect(result.growthMetrics.map((metric) => metric.metricKey)).toEqual(
      DASHBOARD_METRIC_KEYS.slice(11)
    );
    expect(result.operationsFinance[0]).toMatchObject({
      metricKey: "gross_revenue",
      currentValue: 100,
      previousValue: 0,
      comparisonPercent: 100,
      comparisonDirection: "up",
      unit: "jpy",
      dataStatus: "ready",
      formula: "SUM(completed checkoutAmountJpy)",
      detailRoute: "/admin/analytics/metrics/gross_revenue"
    });
    expect(result.operationsFinance[1]).toMatchObject({
      currentValue: null,
      previousValue: null,
      comparisonPercent: null,
      comparisonDirection: "unavailable",
      dataStatus: "not_connected"
    });
    expect(result.operationsFinance[2]).toMatchObject({
      comparisonPercent: 0,
      comparisonDirection: "flat"
    });
    expect(result.commissionMetrics[0]).toMatchObject({
      comparisonPercent: -75,
      comparisonDirection: "down"
    });
    expect(result.growthMetrics.find((metric) => metric.metricKey === "new_paid_members")?.detailRoute)
      .toBe("/admin/analytics/members");
    expect(result.growthMetrics.at(-2)?.detailRoute).toBeNull();
    expect(result.growthMetrics.at(-1)?.detailRoute).toBeNull();
    for (const metric of [
      ...result.operationsFinance,
      ...result.commissionMetrics,
      ...result.growthMetrics
    ]) {
      expect(metric.description).not.toBe("");
      expect(metric.formula).not.toBe("");
    }
    expect(fixture.reader.getOperationsFinance).toHaveBeenCalledTimes(1);
    expect(fixture.reader.getCommissionFacts).toHaveBeenCalledTimes(1);
    expect(fixture.reader.getGrowthFacts).toHaveBeenCalledTimes(1);
    const sharedInput = expect.objectContaining({
      scope: { kind: "platform" },
      city: "Tokyo",
      window: expect.objectContaining({ period: "last7days" })
    });
    expect(fixture.reader.getOperationsFinance).toHaveBeenCalledWith(sharedInput);
    expect(fixture.reader.getCommissionFacts).toHaveBeenCalledWith(sharedInput);
    expect(fixture.reader.getGrowthFacts).toHaveBeenCalledWith(sharedInput);
    expect(fixture.record).toHaveBeenCalledTimes(1);
    expect(fixture.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "backoffice.dashboard.overview.read",
      targetType: "backoffice_dashboard_overview",
      metadata: {
        period: "last7days",
        from: "2026-08-25",
        to: "2026-08-31",
        city: "Tokyo"
      }
    }));
  });

  it("calls only the focused reader for detail and returns fixed chronological points", async () => {
    const fixture = createService();
    const result = await fixture.service.getDashboardMetricDetail(
      actor,
      context,
      "new_users",
      { period: "last7days", city: "Tokyo" }
    );

    expect(fixture.reader.getOperationsFinance).not.toHaveBeenCalled();
    expect(fixture.reader.getCommissionFacts).not.toHaveBeenCalled();
    expect(fixture.reader.getGrowthFacts).toHaveBeenCalledTimes(1);
    expect(result.metric).toMatchObject({ metricKey: "new_users", unit: "people" });
    expect(result.series).toEqual([{
      seriesKey: "new_users",
      label: result.metric.description,
      unit: "people",
      points: [
        { key: "previous", label: "2026-08-18 - 2026-08-24", value: 4 },
        { key: "current", label: "2026-08-25 - 2026-08-31", value: 8 }
      ]
    }]);
    expect(fixture.record).toHaveBeenCalledTimes(1);
    expect(fixture.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "backoffice.dashboard.metric.read",
      metadata: expect.objectContaining({ metricKey: "new_users", city: "Tokyo" })
    }));
  });

  it("returns ready summary values for a metric that intentionally has no detail route", async () => {
    const fixture = createService();
    const result = await fixture.service.getDashboardMetricDetail(
      actor,
      context,
      "supplier_onboarding",
      { period: "last7days" }
    );
    expect(result.metric).toMatchObject({
      metricKey: "supplier_onboarding",
      currentValue: 3,
      previousValue: 2,
      dataStatus: "ready",
      detailRoute: null
    });
    expect(result.series[0]?.points.map((point) => point.value)).toEqual([2, 3]);
    expect(fixture.reader.getGrowthFacts).toHaveBeenCalledTimes(1);
    expect(fixture.reader.getOperationsFinance).not.toHaveBeenCalled();
    expect(fixture.reader.getCommissionFacts).not.toHaveBeenCalled();
  });

  it("fails closed on incoherent status/value pairs and unsafe ready values", async () => {
    const incoherent = analyticsFacts();
    incoherent.operations.travelFare = {
      current: 0,
      previous: null,
      dataStatus: "not_connected"
    } as never;
    await expect(createService({ operations: incoherent.operations }).service.getDashboardOverview(
      actor,
      context,
      { period: "last7days" }
    )).rejects.toThrow("Dashboard analytics fact is incoherent");

    const unsafe = analyticsFacts();
    unsafe.growth.newUsers.current = Number.MAX_SAFE_INTEGER + 1;
    await expect(createService({ growth: unsafe.growth }).service.getDashboardOverview(
      actor,
      context,
      { period: "last7days" }
    )).rejects.toThrow("Dashboard analytics fact is incoherent");
  });

  it("does not silently substitute zeroes when the analytics reader is unavailable", async () => {
    const service = new BackofficeService(
      {} as never,
      { record: jest.fn(async () => undefined) } as never,
      createDirectShopContextRepository(),
      () => now
    );
    await expect(service.getDashboardOverview(actor, context, { period: "last7days" }))
      .rejects.toThrow("Backoffice analytics reader is unavailable");
  });
});
