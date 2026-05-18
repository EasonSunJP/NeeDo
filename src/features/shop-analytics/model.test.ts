import { describe, expect, it } from "vitest";
import { customers, orders, settlements, stores, technicians } from "../../data/mock";
import {
  buildShopAnalyticsOverview,
  canUseShopAnalyticsGranularity,
  createDefaultShopAnalyticsFilter,
  createPreviousPeriodShopAnalyticsFilter,
  createShopAnalyticsPresetFilter,
  getAllowedShopAnalyticsGranularities,
  getScopedShopOrders,
  normalizeShopAnalyticsFilter,
  type AnalyticsGranularity,
  type AnalyticsFilterState
} from "./model";

const store = stores[0]!;
const merchantStores = stores.filter((item) => item.merchantId === store.merchantId);
const scopedOrders = getScopedShopOrders(store, merchantStores, technicians, orders);

function buildOverview(filter: AnalyticsFilterState, personnelMonthlyCost?: number) {
  return buildShopAnalyticsOverview({
    store,
    stores: merchantStores,
    technicians,
    customers,
    orders,
    settlements,
    filters: filter,
    personnelMonthlyCost
  });
}

describe("shop analytics model", () => {
  it("creates a Tokyo default filter from the scoped shop orders", () => {
    const filter = createDefaultShopAnalyticsFilter(scopedOrders);

    expect(filter.timezone).toBe("Asia/Tokyo");
    expect(filter.granularity).toBe("hour");
    expect(filter.startDate).toBe(filter.endDate);
    expect(filter.preset).toBe("today");
  });

  it("aggregates KPI, trend, funnel, cast rank, finance and alerts with one filter state", () => {
    const filter = createShopAnalyticsPresetFilter("last30", scopedOrders, createDefaultShopAnalyticsFilter(scopedOrders));
    const overview = buildOverview(filter);

    expect(overview.timezone).toBe("Asia/Tokyo");
    expect(overview.summary.grossRevenue.value).toBeGreaterThan(0);
    expect(overview.revenueTrend.length).toBeGreaterThan(0);
    expect(overview.orderFunnel.map((step) => step.key)).toContain("completed");
    expect(overview.topCasts.length).toBeGreaterThan(0);
    expect(overview.topCasts[0]?.incomeTrend.length).toBe(overview.revenueTrend.length);
    expect(overview.topCasts[0]?.workTrend.some((point) => point.completedOrders > 0 || point.createdOrders > 0)).toBe(true);
    expect(overview.financeBreakdown.map((item) => item.key)).toContain("personnel");
    expect(overview.financeBreakdown.find((item) => item.key === "personnel")?.amount).toBeLessThan(0);
    expect(Math.abs(buildOverview(filter, 900000).financeBreakdown.find((item) => item.key === "personnel")?.amount ?? 0)).toBeGreaterThan(
      Math.abs(overview.financeBreakdown.find((item) => item.key === "personnel")?.amount ?? 0)
    );
    expect(buildOverview(filter, 900000).summary.netProfit.value).toBeLessThan(overview.summary.netProfit.value);
    expect(buildOverview(filter, 900000).revenueTrend.reduce((sum, point) => sum + point.netProfit, 0)).toBeLessThan(
      overview.revenueTrend.reduce((sum, point) => sum + point.netProfit, 0)
    );
    expect(overview.financeBreakdown.at(-1)?.key).toBe("net");
    expect(overview.alerts.length).toBeGreaterThan(0);
  });

  it("applies advanced order-status filters before returning drilldown orders", () => {
    const filter: AnalyticsFilterState = {
      ...createShopAnalyticsPresetFilter("last30", scopedOrders, createDefaultShopAnalyticsFilter(scopedOrders)),
      orderStatuses: ["completed"]
    };
    const overview = buildOverview(filter);

    expect(overview.scopedOrders.length).toBeGreaterThan(0);
    expect(overview.scopedOrders.every((order) => order.status === "completed")).toBe(true);
    expect(overview.selectedFilterCount).toBe(1);
  });

  it("supports hourly metric buckets and previous-period comparison filters", () => {
    const filter: AnalyticsFilterState = {
      ...createShopAnalyticsPresetFilter("today", scopedOrders, createDefaultShopAnalyticsFilter(scopedOrders)),
      granularity: "hour"
    };
    const overview = buildOverview(filter);
    const previous = createPreviousPeriodShopAnalyticsFilter(filter);
    const previousOverview = buildOverview(previous);

    expect(overview.revenueTrend).toHaveLength(24);
    expect(overview.revenueTrend[0]?.bucket).toMatch(/\d{4}-\d{2}-\d{2} 00:00/);
    expect(overview.summary.grossRevenue.value).toBeGreaterThan(0);
    expect(previousOverview.summary.grossRevenue.value).toBeGreaterThan(0);
    expect(overview.revenueTrend.some((point) => point.grossRevenue > 0)).toBe(true);
    expect(previousOverview.revenueTrend.some((point) => point.grossRevenue > 0)).toBe(true);
    expect(previous.endDate < filter.startDate).toBe(true);
    expect(previous.granularity).toBe("hour");
  });

  it("normalizes preset units to their supported defaults", () => {
    const hourlyToday: AnalyticsFilterState = {
      ...createShopAnalyticsPresetFilter("today", scopedOrders, createDefaultShopAnalyticsFilter(scopedOrders)),
      granularity: "hour"
    };

    expect(createShopAnalyticsPresetFilter("week", scopedOrders, hourlyToday).granularity).toBe("day");
    expect(createShopAnalyticsPresetFilter("month", scopedOrders, hourlyToday).granularity).toBe("day");
    expect(createShopAnalyticsPresetFilter("last7", scopedOrders, hourlyToday).granularity).toBe("day");
    expect(createShopAnalyticsPresetFilter("last30", scopedOrders, hourlyToday).granularity).toBe("day");
    expect(createShopAnalyticsPresetFilter("today", scopedOrders, { ...hourlyToday, granularity: "day" }).granularity).toBe("hour");

    expect(getAllowedShopAnalyticsGranularities(createShopAnalyticsPresetFilter("week", scopedOrders, hourlyToday))).toEqual(["day"]);
    expect(getAllowedShopAnalyticsGranularities(createShopAnalyticsPresetFilter("last7", scopedOrders, hourlyToday))).toEqual(["day"]);
    expect(getAllowedShopAnalyticsGranularities(createShopAnalyticsPresetFilter("month", scopedOrders, hourlyToday))).toEqual(["day", "week"]);
    expect(getAllowedShopAnalyticsGranularities(createShopAnalyticsPresetFilter("last30", scopedOrders, hourlyToday))).toEqual(["day", "week"]);
  });

  it("normalizes custom search ranges and caps them at 60 days", () => {
    const base = createDefaultShopAnalyticsFilter(scopedOrders);
    const twoDays = normalizeShopAnalyticsFilter(
      { ...base, preset: "custom", startDate: "2026-04-11", endDate: "2026-04-12", granularity: "hour" },
      { forceDefaultGranularity: true }
    );
    const fourteenDays = normalizeShopAnalyticsFilter(
      { ...base, preset: "custom", startDate: "2026-03-30", endDate: "2026-04-12", granularity: "day" }
    );
    const sixtyDays = normalizeShopAnalyticsFilter(
      { ...base, preset: "custom", startDate: "2026-02-12", endDate: "2026-04-12", granularity: "month" }
    );
    const overSixtyDays = normalizeShopAnalyticsFilter(
      { ...base, preset: "custom", startDate: "2026-01-01", endDate: "2026-04-12", granularity: "month" }
    );

    expect(twoDays.granularity).toBe("day");
    expect(getAllowedShopAnalyticsGranularities(twoDays)).toEqual(["day"]);
    expect(getAllowedShopAnalyticsGranularities(fourteenDays)).toEqual(["day", "week"]);
    expect(canUseShopAnalyticsGranularity(fourteenDays, "week")).toBe(true);
    expect(getAllowedShopAnalyticsGranularities(sixtyDays)).toEqual(["day", "week", "month"]);
    expect(canUseShopAnalyticsGranularity(sixtyDays, "month")).toBe(true);
    expect(overSixtyDays.startDate).toBe("2026-01-01");
    expect(overSixtyDays.endDate).toBe("2026-03-01");
    expect(getAllowedShopAnalyticsGranularities(overSixtyDays)).toEqual(["day", "week", "month"]);
  });

  it("keeps demo data populated for every chart preset and unit", () => {
    const presets = ["today", "week", "month", "last7", "last30"] as const;

    presets.forEach((preset) => {
      const presetFilter = createShopAnalyticsPresetFilter(preset, scopedOrders, createDefaultShopAnalyticsFilter(scopedOrders));
      const granularities: AnalyticsGranularity[] = getAllowedShopAnalyticsGranularities(presetFilter);

      granularities.forEach((granularity) => {
        const filter: AnalyticsFilterState = { ...presetFilter, granularity };
        const overview = buildOverview(filter);
        const previousOverview = buildOverview(createPreviousPeriodShopAnalyticsFilter(filter));

        expect(overview.revenueTrend.some((point) => point.createdOrders > 0), `${preset}/${granularity} current orders`).toBe(true);
        expect(overview.revenueTrend.some((point) => point.grossRevenue > 0), `${preset}/${granularity} current revenue`).toBe(true);
        expect(previousOverview.revenueTrend.some((point) => point.createdOrders > 0), `${preset}/${granularity} previous orders`).toBe(true);
        expect(previousOverview.revenueTrend.some((point) => point.grossRevenue > 0), `${preset}/${granularity} previous revenue`).toBe(true);
        expect(overview.orderFunnel.find((step) => step.key === "completed")?.count ?? 0, `${preset}/${granularity} funnel`).toBeGreaterThan(0);
        expect(overview.topCasts.some((cast) => cast.completedOrders > 0 || cast.revenue > 0), `${preset}/${granularity} casts`).toBe(true);
        expect(overview.customerSegments.some((segment) => segment.count > 0), `${preset}/${granularity} customers`).toBe(true);
        expect(overview.ndpSummary.trend.some((point) => point.ndpCost > 0), `${preset}/${granularity} ndp`).toBe(true);
        expect(overview.financeBreakdown.some((item) => item.key === "personnel"), `${preset}/${granularity} finance`).toBe(true);
      });
    });
  });
});
