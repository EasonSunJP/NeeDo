import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnalyticsMetricSeries, DashboardBucketPayload } from "../../api/backofficeRealData";
import { I18nProvider } from "../../i18n/I18nProvider";
import { translateText, type Language } from "../../i18n/translations";
import {
  DualAxisLineChart,
  FixedAnalyticsSeriesChart,
  GroupedBarChart
} from "./DashboardCharts";
import source from "./DashboardCharts.tsx?raw";

const buckets: DashboardBucketPayload[] = [
  {
    frozenNdp: 40,
    key: "2026-08-24",
    label: "8/24",
    orderCount: 2,
    platformNetRevenueNdp: 30,
    registeredTechnicianCount: 5,
    scheduleAvailableHours: 6,
    scheduleBookedHours: 2,
    scheduleTotalHours: 8,
    serviceGmvJpy: 12000,
    shopCount: 3,
    shopEstimatedGrossProfitJpy: 4500
  },
  {
    frozenNdp: 55,
    key: "2026-08-25",
    label: "8/25",
    orderCount: 4,
    platformNetRevenueNdp: 36,
    registeredTechnicianCount: 6,
    scheduleAvailableHours: 4,
    scheduleBookedHours: 6,
    scheduleTotalHours: 10,
    serviceGmvJpy: 24000,
    shopCount: 4,
    shopEstimatedGrossProfitJpy: 9000
  }
];

const orderSeries = { key: "orderCount" as const, label: "订单总量", unit: "单" };
const gmvSeries = { key: "serviceGmvJpy" as const, label: "服务 GMV", unit: "JPY" };

function renderChart(node: React.ReactNode) {
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
}

describe("DashboardCharts", () => {
  it("draws independently scaled dual lines with circles and diamonds", () => {
    const markup = renderChart(
      <DualAxisLineChart
        buckets={buckets}
        description="订单与服务金额趋势"
        left={orderSeries}
        right={gmvSeries}
        title="订单总量与服务 GMV"
      />
    );

    expect(markup).toContain('viewBox="0 0 720 280"');
    expect(markup.match(/<path/g)).toHaveLength(2);
    expect(markup.match(/<circle/g)).toHaveLength(2);
    expect(markup.match(/<polygon/g)).toHaveLength(2);
    expect(markup).toContain('vector-effect="non-scaling-stroke"');
    expect(markup).toContain("订单总量 · 单");
    expect(markup).toContain("服务 GMV · JPY");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it.each([
    ["ja", "件", "1つ"],
    ["en", "orders", "One"],
    ["ko", "건", "하나"]
  ] as const)("renders the order-count chart unit correctly in %s", (language, expected, legacy) => {
    const localizedUnit = translateText("单", language as Language);
    const markup = renderChart(
      <DualAxisLineChart
        buckets={buckets}
        description="订单与服务金额趋势"
        left={{ ...orderSeries, unit: localizedUnit }}
        title="订单总量"
      />
    );

    expect(markup).toContain(`订单总量 · ${expected}`);
    expect(markup).not.toContain(`订单总量 · ${legacy}`);
  });

  it("exposes every exact bucket value in a screen-reader table", () => {
    const markup = renderChart(
      <DualAxisLineChart
        buckets={buckets}
        description="订单与服务金额趋势"
        left={orderSeries}
        right={gmvSeries}
        title="订单总量与服务 GMV"
      />
    );

    expect(markup).toContain("sr-only");
    expect(markup).toContain("8/24");
    expect(markup).toContain(">2<");
    expect(markup).toContain(">12,000<");
    expect(markup).toContain('data-no-i18n="true"');
  });

  it("renders three bar groups for total, available, and booked hours", () => {
    const markup = renderChart(
      <GroupedBarChart
        buckets={buckets}
        description="排班小时分布"
        series={[
          { key: "scheduleTotalHours", label: "总排班时长", unit: "小时" },
          { key: "scheduleAvailableHours", label: "空闲可预约时长", unit: "小时" },
          { key: "scheduleBookedHours", label: "已预约时长", unit: "小时" }
        ]}
        title="排班状态"
      />
    );

    expect(markup.match(/data-bar-series="0"/g)).toHaveLength(2);
    expect(markup.match(/data-bar-series="1"/g)).toHaveLength(2);
    expect(markup.match(/data-bar-series="2"/g)).toHaveLength(2);
    expect(markup).toContain("总排班时长");
    expect(markup).toContain("空闲可预约时长");
    expect(markup).toContain("已预约时长");
  });

  it("keeps an empty chart skeleton accessible and contained", () => {
    const markup = renderChart(
      <DualAxisLineChart
        buckets={[]}
        description="订单与服务金额趋势"
        left={orderSeries}
        right={gmvSeries}
        title="订单总量与服务 GMV"
      />
    );

    expect(markup).toContain('data-dashboard-chart-empty="true"');
    expect(markup).toContain("当前范围暂无数据");
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("overflow-hidden");
    expect(markup).not.toContain("overflow-x-auto");
  });

  it("ships a reduced-motion rule for chart transitions", () => {
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("renders fixed analytics series accessibly while preserving null gaps and input data", () => {
    const series: AnalyticsMetricSeries[] = [
      {
        seriesKey: "growth",
        label: "增加",
        unit: "people",
        points: [
          { key: "previous", label: "上期", value: null },
          { key: "current", label: "本期", value: 0 }
        ]
      }
    ];
    const snapshot = structuredClone(series);
    const markup = renderChart(
      <FixedAnalyticsSeriesChart
        series={series}
        unavailableValueLabel="暂无数据"
      />
    );

    expect(markup).toContain('viewBox="0 0 720 280"');
    expect(markup).toContain("增加（people）");
    expect(markup).toContain("上期");
    expect(markup).toContain("暂无数据");
    expect(markup).toContain("本期");
    expect(markup).toContain(">0<");
    expect(markup).toContain('data-analytics-point-unavailable="true"');
    expect(markup).toContain('data-analytics-series-evidence="true"');
    expect(markup).toMatch(/data-analytics-series-evidence="true"[^>]*data-no-i18n="true"/);
    expect(markup).not.toMatch(/NaN|Infinity/);
    expect(series).toEqual(snapshot);
  });
});
