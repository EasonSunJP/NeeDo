// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsMetricPayload } from "../../api/backofficeRealData";
import { I18nProvider } from "../../i18n/I18nProvider";
import { DashboardMetricCard } from "./DashboardMetricCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderCard(node: React.ReactNode) {
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
}

const analyticsMetric = (
  override: Partial<AnalyticsMetricPayload> = {}
): AnalyticsMetricPayload => ({
  metricKey: "gross_revenue",
  currentValue: 1200,
  previousValue: 1000,
  comparisonPercent: 20,
  comparisonDirection: "up",
  unit: "jpy",
  dataStatus: "ready",
  description: "已完成订单结账金额合计",
  formula: "SUM(completed checkoutAmountJpy)",
  detailRoute: "/admin/analytics/metrics/gross_revenue",
  ...override
});

describe("DashboardMetricCard", () => {
  it.each([
    [12.5, "+12.5%", "dashboard-comparison-positive"],
    [-4, "-4%", "dashboard-comparison-negative"],
    [0, "0%", "dashboard-comparison-zero"]
  ] as const)("renders the %s comparison without obscuring the unit", (changeRatePercent, label, className) => {
    const markup = renderCard(
      <DashboardMetricCard
        comparison={{ changeRatePercent, current: 24, previous: 20 }}
        title="活跃技师"
        unit="people"
      />
    );

    expect(markup).toContain(">24<");
    expect(markup).toContain("人");
    expect(markup).toContain(label);
    expect(markup).toContain(className);
    expect(markup).toContain('data-no-i18n="true"');
  });

  it("shows an explicit no-baseline state instead of inventing a percentage", () => {
    const markup = renderCard(
      <DashboardMetricCard
        comparison={{ changeRatePercent: null, current: 3, previous: 0 }}
        title="新增用户"
        unit="people"
      />
    );

    expect(markup).toContain("暂无上期基线");
    expect(markup).not.toContain("Infinity");
  });

  it("keeps unavailable member data distinct from zero and shows true completed users", () => {
    const markup = renderCard(
      <DashboardMetricCard
        secondary={{ label: "利用者数", unit: "people", value: 123 }}
        statusMessage="会员功能尚未开放"
        title="会员数"
        unit="people"
        value={null}
      />
    );

    expect(markup).toContain("会员数");
    expect(markup).toContain(">—<");
    expect(markup).toContain("会员功能尚未开放");
    expect(markup).toContain("利用者数");
    expect(markup).toContain(">123<");
  });

  it("labels formal NDP as primary and Test NDP as secondary without combining them", () => {
    const markup = renderCard(
      <DashboardMetricCard title="存量 NDP" unit="ndp" value={999} testNdp={25} />
    );

    expect(markup).toContain(">999<");
    expect(markup).toContain("NDP");
    expect(markup).toContain("Test NDP");
    expect(markup).toContain(">25<");
    expect(markup).not.toContain("1,024");
  });

  it("renders an optional exact three-point sparkline beside the headline value", () => {
    const markup = renderCard(
      <DashboardMetricCard
        comparison={{ changeRatePercent: 50, current: 3, previous: 2 }}
        sparkline={[
          { key: "2026-08-30", label: "08-30", value: 1 },
          { key: "2026-08-31", label: "08-31", value: 2 },
          { key: "2026-09-01", label: "09-01", value: 3 }
        ]}
        title="新增用户"
        unit="people"
      />
    );

    expect(markup).toContain('data-dashboard-sparkline="true"');
    expect(markup.match(/data-dashboard-sparkline-node="true"/g)).toHaveLength(3);
    expect(markup).toContain("新增用户");
    expect(markup).toContain("09-01");
    expect(markup).toContain("3 人");
  });

  it.each([
    [20, "up", "+20%"],
    [-12.5, "down", "-12.5%"],
    [0, "flat", "+0%"]
  ] as const)("renders the server-signed %s analytics comparison", (comparisonPercent, comparisonDirection, expected) => {
    const markup = renderCard(
      <DashboardMetricCard
        metric={analyticsMetric({ comparisonDirection, comparisonPercent })}
        previousLabel="上期"
        statusMessage="数据暂不可用"
        title="营业总额"
      />
    );

    expect(markup).toContain(expected);
    expect(markup).toContain("上期");
    expect(markup).toContain("1,000");
  });

  it("keeps analytics null distinct from numeric zero and renders an explicit status", () => {
    const unavailable = renderCard(
      <DashboardMetricCard
        metric={analyticsMetric({
          comparisonDirection: "unavailable",
          comparisonPercent: null,
          currentValue: null,
          dataStatus: "not_connected",
          previousValue: null
        })}
        previousLabel="上期"
        statusMessage="正式数据源尚未接通"
        title="车费"
      />
    );
    const zero = renderCard(
      <DashboardMetricCard
        metric={analyticsMetric({
          comparisonDirection: "flat",
          comparisonPercent: 0,
          currentValue: 0,
          previousValue: 0
        })}
        previousLabel="上期"
        statusMessage="数据暂不可用"
        title="营业总额"
      />
    );

    expect(unavailable).toContain(">—<");
    expect(unavailable).toContain("正式数据源尚未接通");
    expect(unavailable).toContain("暂无可比较数据");
    expect(zero).toContain(">0<");
    expect(zero).toContain("+0%");
  });

  it("renders a null-route TEST accessory as a disabled noninteractive badge", () => {
    const markup = renderCard(
      <DashboardMetricCard
        disabledAccessoryLabel="TEST"
        metric={analyticsMetric({ detailRoute: null })}
        previousLabel="上期"
        statusMessage="数据暂不可用"
        title="供货商入驻"
      />
    );

    expect(markup).toContain('data-analytics-disabled-detail="true"');
    expect(markup).toContain('data-analytics-card-header="true"');
    expect(markup).toContain('data-analytics-detail-accessory="true"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("border-coral/40");
    expect(markup).toContain("bg-coral/10");
    expect(markup).toContain("text-coral");
    expect(markup).toMatch(/<span[^>]*data-analytics-disabled-detail="true"[^>]*>TEST<\/span>/);
    expect(markup).not.toMatch(/<button[^>]*>TEST<\/button>/);
    expect(markup.indexOf('data-analytics-detail-accessory="true"')).toBeLessThan(
      markup.indexOf('data-analytics-metric-value="true"')
    );
  });

  it("renders TEST instead of navigation when a routed metric is not ready", () => {
    const markup = renderCard(
      <DashboardMetricCard
        detailLabel="查看详细数据"
        disabledAccessoryLabel="TEST 功能暂未开放"
        metric={analyticsMetric({ dataStatus: "not_connected" })}
        onDetail={() => undefined}
        previousLabel="上期"
        statusMessage="数据接口尚未连接"
        title="车费"
      />
    );

    expect(markup).toContain('data-analytics-disabled-detail="true"');
    expect(markup).toContain(">TEST</span>");
    expect(markup).not.toContain(">查看详细数据</button>");
  });
});

describe("DashboardMetricCard interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the formula info control independent from detail navigation", async () => {
    const onDetail = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider>
          <DashboardMetricCard
            detailLabel="查看详情"
            metric={analyticsMetric()}
            onDetail={onDetail}
            previousLabel="上期"
            statusMessage="数据暂不可用"
            title="营业总额"
          />
        </I18nProvider>
      );
    });

    const info = container.querySelector<HTMLButtonElement>(
      'button[aria-label="查看营业总额说明和计算公式"]'
    );
    const detail = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "查看详情"
    );
    const header = container.querySelector<HTMLElement>("[data-analytics-card-header]");
    const accessory = container.querySelector<HTMLElement>("[data-analytics-detail-accessory]");
    expect(info).not.toBeNull();
    expect(detail).not.toBeUndefined();
    expect(header?.contains(accessory ?? null)).toBe(true);
    expect(accessory?.contains(detail ?? null)).toBe(true);
    expect(info?.contains(detail ?? null)).toBe(false);
    expect(detail?.contains(info ?? null)).toBe(false);

    await act(async () => info?.click());
    expect(onDetail).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("已完成订单结账金额合计");
    expect(document.body.textContent).toContain("SUM(completed checkoutAmountJpy)");
    expect(
      Array.from(document.body.querySelectorAll("[data-no-i18n]")).some((element) =>
        element.textContent?.includes("已完成订单结账金额合计") &&
        element.textContent.includes("SUM(completed checkoutAmountJpy)")
      )
    ).toBe(true);

    await act(async () => detail?.click());
    expect(onDetail).toHaveBeenCalledWith("/admin/analytics/metrics/gross_revenue");
  });
});
