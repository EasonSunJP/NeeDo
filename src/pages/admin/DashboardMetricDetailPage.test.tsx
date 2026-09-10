// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { DashboardMetricDetailPage, describeMetricDetailError } from "./DashboardMetricDetailPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({ dashboard: vi.fn(), dashboardMetricDetail: vi.fn() }));
vi.mock("../../api/backofficeRealData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/backofficeRealData")>()),
  backofficeRealDataApi: apiMocks
}));
vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../features/dashboard/DashboardCharts", () => ({
  FixedAnalyticsSeriesChart: ({ series }: { series: Array<{ label: string }> }) => (
    <div data-testid="series-chart">{series.map((item) => item.label).join(",")}</div>
  ),
  getAnalyticsSeriesColor: (index: number) => `color-${index}`
}));

const filter = {
  period: "last7days" as const,
  from: "2026-08-26",
  to: "2026-09-01",
  previousFrom: "2026-08-19",
  previousTo: "2026-08-25",
  timeZone: "Asia/Tokyo" as const,
  granularity: "day" as const,
  city: "Tokyo"
};
const dashboard = {
  filter: { ...filter, availableCities: ["Tokyo", "Osaka"] },
  summary: {}, series: { buckets: [] }, finance: {}, shop: null, membership: null,
  scope: { kind: "platform", shopPublicId: null }
};
const detail = (metricKey: string, currentValue: number | null = 0) => {
  const unit = metricKey === "travel_fare" ? "jpy" : metricKey === "ndp_income" ? "ndp" : "people";
  return ({
  filter,
  metric: {
    metricKey,
    currentValue,
    previousValue: currentValue,
    comparisonPercent: currentValue === null ? null : 0,
    comparisonDirection: currentValue === null ? "unavailable" : "flat",
    unit,
    dataStatus: currentValue === null ? "not_available" : "ready",
    description: `${metricKey} backend description`,
    formula: `${metricKey} backend formula`,
    detailRoute: `/admin/analytics/metrics/${metricKey}`
  },
  series: [{
    seriesKey: metricKey,
    label: `${metricKey} backend description`,
    unit,
    points: [
      { key: "previous", label: "2026-08-19 - 2026-08-25", value: currentValue },
      { key: "current", label: "2026-08-26 - 2026-09-01", value: currentValue }
    ]
  }]
  });
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("DashboardMetricDetailPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderAt(path: string) {
    const router = createMemoryRouter([
      { path: "/admin/analytics/metrics/:metricKey", element: <DashboardMetricDetailPage /> }
    ], { initialEntries: [path] });
    await act(async () => { root.render(<RouterProvider router={router} />); });
    return router;
  }

  it("maps authentication, validation, server and network failures without leaking raw errors", () => {
    expect(describeMetricDetailError(new ApiClientError("raw-401", 40101, 401)))
      .toBe("登录状态已失效，请重新登录");
    expect(describeMetricDetailError(new ApiClientError("raw-403", 40301, 403)))
      .toBe("当前身份没有查看详细分析的权限");
    expect(describeMetricDetailError(new ApiClientError("raw-404", 40401, 404)))
      .toBe("该分析指标或筛选条件无效");
    expect(describeMetricDetailError(new ApiClientError("raw-500", 50001, 500)))
      .toBe("详细分析服务暂时不可用，请稍后重试");
    expect(describeMetricDetailError(new Error("secret socket detail")))
      .toBe("详细分析加载失败，请检查网络后重试");
  });

  it("rejects an invalid reproducible URL filter before any request", async () => {
    await renderAt("/admin/analytics/metrics/new_users?period=custom&from=2026-08-01");
    expect(container.textContent).toContain("该分析指标或筛选条件无效");
    expect(apiMocks.dashboardMetricDetail).not.toHaveBeenCalled();
    expect(apiMocks.dashboard).not.toHaveBeenCalled();
  });

  it("loads detail and city catalog atomically with one URL-derived query", async () => {
    const detailRequest = deferred<ReturnType<typeof detail>>();
    const dashboardRequest = deferred<typeof dashboard>();
    apiMocks.dashboardMetricDetail.mockReturnValue(detailRequest.promise);
    apiMocks.dashboard.mockReturnValue(dashboardRequest.promise);
    const router = await renderAt("/admin/analytics/metrics/new_users?period=last7days&city=Tokyo");

    expect(apiMocks.dashboardMetricDetail).toHaveBeenCalledWith(
      "new_users",
      { period: "last7days", city: "Tokyo" },
      expect.any(Object)
    );
    expect(apiMocks.dashboard).toHaveBeenCalledWith(
      "backoffice",
      { period: "last7days", city: "Tokyo" },
      expect.any(Object)
    );
    expect(apiMocks.dashboardMetricDetail.mock.calls[0][2].signal)
      .toBe(apiMocks.dashboard.mock.calls[0][2].signal);

    await act(async () => { detailRequest.resolve(detail("new_users")); });
    expect(container.textContent).not.toContain("new_users backend formula");
    await act(async () => { dashboardRequest.resolve(dashboard); });

    expect(container.textContent).toContain("new_users backend formula");
    expect(container.querySelector('button[aria-label="查看新增用户说明和计算公式"]')).toBeTruthy();
    expect(container.textContent).toContain("0");
    expect([...container.querySelector<HTMLSelectElement>('select[aria-label="所属城市"]')!.options]
      .map((option) => option.value))
      .toEqual(["", "Tokyo", "Osaka"]);

    const monthFilter = { ...filter, period: "month" as const };
    apiMocks.dashboardMetricDetail.mockResolvedValue({ ...detail("new_users"), filter: monthFilter });
    apiMocks.dashboard.mockResolvedValue({ ...dashboard, filter: { ...monthFilter, availableCities: ["Tokyo", "Osaka"] } });
    const periodSelect = container.querySelector<HTMLSelectElement>('select[aria-label="统计期间"]')!;
    act(() => {
      periodSelect.value = "month";
      periodSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const queryButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "查询")!;
    await act(async () => { queryButton.click(); });
    expect(router.state.location.search).toBe("?period=month&city=Tokyo");
    expect(apiMocks.dashboardMetricDetail).toHaveBeenLastCalledWith(
      "new_users", { period: "month", city: "Tokyo" }, expect.any(Object)
    );
  });

  it("replaces a noisy initial URL with the canonical normalized dashboard query before loading", async () => {
    const monthFilter = { ...filter, period: "month" as const };
    apiMocks.dashboardMetricDetail.mockResolvedValue({ ...detail("new_users"), filter: monthFilter });
    apiMocks.dashboard.mockResolvedValue({
      ...dashboard,
      filter: { ...monthFilter, availableCities: ["Tokyo", "Osaka"] }
    });
    const router = await renderAt(
      "/admin/analytics/metrics/new_users?period=month&from=2026-01-01&to=2026-01-31&city=%20Tokyo%20&city=Osaka&ignored=value"
    );

    expect(router.state.location.search).toBe("?period=month&city=Tokyo");
    expect(apiMocks.dashboardMetricDetail).toHaveBeenCalledTimes(1);
    expect(apiMocks.dashboardMetricDetail).toHaveBeenCalledWith(
      "new_users", { period: "month", city: "Tokyo" }, expect.any(Object)
    );
    expect(apiMocks.dashboard).toHaveBeenCalledWith(
      "backoffice", { period: "month", city: "Tokyo" }, expect.any(Object)
    );
  });

  it("never presents stale metric data after the route key changes", async () => {
    const first = deferred<ReturnType<typeof detail>>();
    apiMocks.dashboardMetricDetail
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(detail("ndp_income"));
    apiMocks.dashboard.mockResolvedValue(dashboard);
    const router = await renderAt("/admin/analytics/metrics/new_users?period=last7days&city=Tokyo");
    const firstSignal = apiMocks.dashboardMetricDetail.mock.calls[0][2].signal as AbortSignal;
    await act(async () => {
      await router.navigate("/admin/analytics/metrics/ndp_income?period=last7days&city=Tokyo");
    });
    expect(firstSignal.aborted).toBe(true);
    expect(container.textContent).toContain("ndp_income backend formula");
    await act(async () => { first.resolve(detail("new_users")); });
    expect(container.textContent).not.toContain("new_users backend formula");
    expect(container.textContent).toContain("ndp_income backend formula");
  });

  it("shows explicit authorization failure, retries safely, and preserves unavailable null", async () => {
    apiMocks.dashboardMetricDetail
      .mockRejectedValueOnce(new ApiClientError("error.forbidden", 40301, 403))
      .mockResolvedValueOnce(detail("travel_fare", null));
    apiMocks.dashboard.mockResolvedValue(dashboard);
    await renderAt("/admin/analytics/metrics/travel_fare?period=last7days&city=Tokyo");

    expect(container.textContent).toContain("当前身份没有查看详细分析的权限");
    const retry = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("重试"));
    expect(retry).toBeTruthy();
    await act(async () => { retry?.click(); });

    expect(container.textContent).toContain("数据暂不可用");
    expect(container.textContent).toContain("暂无可展示的序列数据");
    expect(container.textContent).not.toContain("¥0");
  });
});
