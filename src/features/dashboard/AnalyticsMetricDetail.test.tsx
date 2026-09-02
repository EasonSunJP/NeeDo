// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsMetricPayload, AnalyticsMetricSeries } from "../../api/backofficeRealData";
import { I18nProvider } from "../../i18n/I18nProvider";
import { AnalyticsMetricDetail } from "./AnalyticsMetricDetail";
import { AnalyticsMetricGrid } from "./AnalyticsMetricGrid";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const metric = (
  metricKey: string,
  detailRoute: string | null
): AnalyticsMetricPayload => ({
  metricKey,
  currentValue: 2,
  previousValue: 1,
  comparisonPercent: 100,
  comparisonDirection: "up",
  unit: "people",
  dataStatus: "ready",
  description: `${metricKey}说明`,
  formula: `${metricKey}公式`,
  detailRoute
});

const series: AnalyticsMetricSeries[] = [
  {
    seriesKey: "increase",
    label: "增加",
    unit: "people",
    points: [
      { key: "previous", label: "上期", value: 1 },
      { key: "current", label: "本期", value: 4 }
    ]
  },
  {
    seriesKey: "decrease",
    label: "减少",
    unit: "people",
    points: [
      { key: "previous", label: "上期", value: null },
      { key: "current", label: "本期", value: 2 }
    ]
  }
];

function findButton(container: ParentNode, label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

describe("AnalyticsMetricDetail", () => {
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

  it("toggles fixed server series with pressed state, accessible names, and no input mutation", async () => {
    const snapshot = structuredClone(series);
    await act(async () => {
      root.render(
        <I18nProvider>
          <AnalyticsMetricDetail
            allSeriesHiddenLabel="全部图例已隐藏"
            hideSeriesLabel={(label) => `隐藏${label}`}
            series={series}
            showSeriesLabel={(label) => `显示${label}`}
            title="用户增减趋势"
            unavailableValueLabel="暂无数据"
          />
        </I18nProvider>
      );
    });

    const decrease = findButton(container, "隐藏减少");
    expect(decrease.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("暂无数据");
    const backendLabel = Array.from(container.querySelectorAll("span")).find(
      (element) => element.textContent === "减少"
    );
    expect(backendLabel).not.toBeUndefined();
    expect(backendLabel?.closest("[data-no-i18n]")).not.toBeNull();

    await act(async () => decrease.click());
    expect(findButton(container, "显示减少").getAttribute("aria-pressed")).toBe("false");
    expect(findButton(container, "隐藏增加").getAttribute("aria-pressed")).toBe("true");
    expect(series).toEqual(snapshot);

    await act(async () => findButton(container, "隐藏增加").click());
    expect(container.textContent).toContain("全部图例已隐藏");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("keeps legend visibility isolated between mounted detail instances", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <div>
            <AnalyticsMetricDetail
              allSeriesHiddenLabel="全部图例已隐藏"
              hideSeriesLabel={(label) => `隐藏${label}`}
              series={series}
              showSeriesLabel={(label) => `显示${label}`}
              title="第一张图"
              unavailableValueLabel="暂无数据"
            />
            <AnalyticsMetricDetail
              allSeriesHiddenLabel="全部图例已隐藏"
              hideSeriesLabel={(label) => `隐藏${label}`}
              series={series}
              showSeriesLabel={(label) => `显示${label}`}
              title="第二张图"
              unavailableValueLabel="暂无数据"
            />
          </div>
        </I18nProvider>
      );
    });

    const hideDecrease = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[aria-label="隐藏减少"]')
    );
    expect(hideDecrease).toHaveLength(2);
    await act(async () => hideDecrease[0]?.click());
    expect(container.querySelectorAll('button[aria-label="显示减少"]')).toHaveLength(1);
    expect(container.querySelectorAll('button[aria-label="隐藏减少"]')).toHaveLength(1);
  });

  it("keeps each series color stable when an earlier series is hidden", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <AnalyticsMetricDetail
            allSeriesHiddenLabel="全部图例已隐藏"
            hideSeriesLabel={(label) => `隐藏${label}`}
            series={series}
            showSeriesLabel={(label) => `显示${label}`}
            title="用户增减趋势"
            unavailableValueLabel="暂无数据"
          />
        </I18nProvider>
      );
    });

    const secondLegendColor = findButton(container, "隐藏减少")
      .querySelector<HTMLElement>("[data-analytics-series-color]")
      ?.getAttribute("data-analytics-series-color");
    expect(secondLegendColor).toContain("--admin-purple");
    await act(async () => findButton(container, "隐藏增加").click());
    const secondChartColor = container
      .querySelector<SVGGElement>('g[data-analytics-series="decrease"]')
      ?.getAttribute("data-analytics-series-color");
    expect(secondChartColor).toBe(secondLegendColor);
  });
});

describe("AnalyticsMetricGrid", () => {
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

  it("preserves caller order and exposes navigation only for non-null detail routes", async () => {
    const metrics = [
      metric("gross_revenue", "/admin/analytics/metrics/gross_revenue"),
      metric("supplier_onboarding", null)
    ];
    const snapshot = structuredClone(metrics);
    const onNavigate = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider>
          <AnalyticsMetricGrid
            detailLabel="查看详情"
            getDisabledDetailLabel={(item) => item.detailRoute === null ? "TEST" : undefined}
            getInfoLabel={(title) => `查看${title}说明`}
            getMetricTitle={(item) => item.metricKey}
            groupTitle="运营财务"
            metrics={metrics}
            onNavigate={onNavigate}
            previousLabel="上期"
            statusMessages={{
              ready: "数据可用",
              not_available: "数据暂不可用",
              not_connected: "数据源尚未接通"
            }}
          />
        </I18nProvider>
      );
    });

    const headings = Array.from(container.querySelectorAll("h3")).map((item) => item.textContent);
    expect(headings).toEqual(["gross_revenue", "supplier_onboarding"]);
    const detailButtons = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.textContent === "查看详情"
    );
    expect(detailButtons).toHaveLength(1);
    const detailAccessory = detailButtons[0]?.closest<HTMLElement>("[data-analytics-detail-accessory]");
    expect(detailAccessory).not.toBeNull();
    expect(detailAccessory?.parentElement?.hasAttribute("data-analytics-card-header")).toBe(true);
    const testBadge = container.querySelector<HTMLElement>("[data-analytics-disabled-detail]");
    expect(testBadge?.textContent).toBe("TEST");
    expect(testBadge?.getAttribute("aria-disabled")).toBe("true");
    expect(testBadge?.tagName).toBe("SPAN");
    expect(testBadge?.closest("[data-analytics-detail-accessory]")).not.toBeNull();
    expect(testBadge?.closest("[data-analytics-card-header]")).not.toBeNull();
    expect(container.querySelector('button[aria-label="查看gross_revenue说明"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="查看supplier_onboarding说明"]')).not.toBeNull();
    await act(async () => detailButtons[0]?.click());
    expect(onNavigate).toHaveBeenCalledWith(
      "/admin/analytics/metrics/gross_revenue",
      metrics[0]
    );
    expect(metrics).toEqual(snapshot);
  });
});
