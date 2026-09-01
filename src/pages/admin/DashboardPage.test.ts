// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import source from "./DashboardPage.tsx?raw";
import { DashboardPage } from "./DashboardPage";
import { DashboardMetricDetailPage } from "./DashboardMetricDetailPage";
import { translateTextForContext } from "../../i18n/translations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  dashboardOverview: vi.fn(),
  dashboardMetricDetail: vi.fn()
}));
vi.mock("../../api/backofficeRealData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/backofficeRealData")>()),
  backofficeRealDataApi: apiMocks
}));
vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => createElement("div", null, children)
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../features/dashboard/DashboardCharts", () => ({
  DualAxisLineChart: ({ title }: { title: string }) => createElement("div", null, title),
  FixedAnalyticsSeriesChart: () => createElement("div", null, "series"),
  getAnalyticsSeriesColor: (index: number) => `color-${index}`
}));

const filter = {
  period: "last7days",
  from: "2026-08-25",
  to: "2026-09-01",
  previousFrom: "2026-08-18",
  previousTo: "2026-08-25",
  timeZone: "Asia/Tokyo",
  granularity: "day",
  city: null,
  availableCities: ["Tokyo", "Osaka"]
};
const comparison = { current: 2, previous: 1, changeRatePercent: 100 };
const dashboardPayload = {
  filter,
  summary: {
    availableScheduleSlots: comparison,
    activeTechnicians: comparison,
    registeredTechnicians: comparison,
    shopCount: comparison,
    newCustomers: comparison,
    pendingOrders: 0,
    serviceGmvJpy: 0
  },
  series: { buckets: [] },
  finance: {
    platformNetRevenue: { ndp: 0, testNdp: 0 },
    frozen: { ndp: 0, testNdp: 0 },
    userReward: { ndp: 0, testNdp: 0 },
    walletStock: null,
    withdrawn: null,
    shopNdpCost: null
  },
  shop: null,
  membership: null,
  scope: { kind: "platform", shopPublicId: null }
};
const metric = (metricKey: string, detailRoute: string | null = `/admin/analytics/metrics/${metricKey}`) => ({
  metricKey,
  currentValue: 0,
  previousValue: 0,
  comparisonPercent: 0,
  comparisonDirection: "flat",
  unit: "count",
  dataStatus: "ready",
  description: `${metricKey} description`,
  formula: `${metricKey} formula`,
  detailRoute
});
const overviewPayload = {
  filter: (({ availableCities: _availableCities, ...rest }) => rest)(filter),
  operationsFinance: [metric("gross_revenue")],
  commissionMetrics: [metric("ndp_income")],
  growthMetrics: [
    metric("new_users"),
    metric("franchisee_onboarding", null),
    metric("supplier_onboarding", null)
  ]
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("operations unified data dashboard", () => {
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

  it("commits the dashboard and overview atomically from one query generation", async () => {
    const dashboardRequest = deferred<typeof dashboardPayload>();
    const overviewRequest = deferred<typeof overviewPayload>();
    apiMocks.dashboard.mockReturnValue(dashboardRequest.promise);
    apiMocks.dashboardOverview.mockReturnValue(overviewRequest.promise);

    act(() => root.render(createElement(MemoryRouter, null, createElement(DashboardPage))));
    expect(apiMocks.dashboard).toHaveBeenCalledWith("backoffice", { period: "last7days" }, expect.any(Object));
    expect(apiMocks.dashboardOverview).toHaveBeenCalledWith({ period: "last7days" }, expect.any(Object));
    expect(apiMocks.dashboard.mock.calls[0][2].signal).toBe(apiMocks.dashboardOverview.mock.calls[0][1].signal);

    await act(async () => { overviewRequest.resolve(overviewPayload); });
    expect(container.textContent).not.toContain("运营财务");
    await act(async () => { dashboardRequest.resolve(dashboardPayload); });

    const text = container.textContent ?? "";
    expect(text.indexOf("运营财务")).toBeLessThan(text.indexOf("佣金统计"));
    expect(text.indexOf("佣金统计")).toBeLessThan(text.indexOf("用户与增长"));
    expect(text).toContain("0");
    expect(text).toContain("TEST 功能暂未开放");
    expect([...container.querySelectorAll("button")].some((item) => item.textContent?.includes("TEST"))).toBe(false);
    expect(container.querySelector('button[aria-label="营业总额 — 查看指标说明和计算公式"]')).toBeTruthy();
  });

  it("preserves the exact applied custom range and city when opening metric detail", async () => {
    const customFilter = {
      ...filter,
      period: "custom" as const,
      from: "2026-08-26",
      to: "2026-09-01",
      previousFrom: "2026-08-19",
      previousTo: "2026-08-25",
      city: "Tokyo"
    };
    apiMocks.dashboard
      .mockResolvedValueOnce(dashboardPayload)
      .mockResolvedValueOnce({ ...dashboardPayload, filter: customFilter })
      .mockResolvedValue({ ...dashboardPayload, filter: customFilter });
    apiMocks.dashboardOverview
      .mockResolvedValueOnce(overviewPayload)
      .mockResolvedValueOnce({
        ...overviewPayload,
        filter: (({ availableCities: _availableCities, ...rest }) => rest)(customFilter)
      });
    apiMocks.dashboardMetricDetail.mockResolvedValue({
      filter: (({ availableCities: _availableCities, ...rest }) => rest)(customFilter),
      metric: overviewPayload.operationsFinance[0],
      series: []
    });
    const router = createMemoryRouter([
      { path: "/admin", element: createElement(DashboardPage) },
      {
        path: "/admin/analytics/metrics/:metricKey",
        element: createElement(DashboardMetricDetailPage)
      }
    ], { initialEntries: ["/admin"] });
    await act(async () => { root.render(createElement(RouterProvider, { router })); });

    const period = container.querySelector<HTMLSelectElement>('select[aria-label="统计期间"]')!;
    act(() => {
      period.value = "custom";
      period.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const setInput = (label: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      act(() => {
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    setInput("开始日期", "2026-08-26");
    setInput("结束日期", "2026-09-01");
    const city = container.querySelector<HTMLSelectElement>('select[aria-label="所属城市"]')!;
    act(() => {
      city.value = "Tokyo";
      city.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const apply = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "查询")!;
    await act(async () => { apply.click(); });
    const details = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "查看详细数据")!;
    await act(async () => { details.click(); });

    expect(router.state.location.pathname).toBe("/admin/analytics/metrics/gross_revenue");
    expect(router.state.location.search)
      .toBe("?period=custom&from=2026-08-26&to=2026-09-01&city=Tokyo");
    expect(apiMocks.dashboardMetricDetail).toHaveBeenCalledWith(
      "gross_revenue",
      {
        period: "custom",
        from: "2026-08-26",
        to: "2026-09-01",
        city: "Tokyo"
      },
      expect.any(Object)
    );
  });

  it("provides complete five-language dashboard analytics chrome", () => {
    const sources = [
      "运营财务", "佣金统计", "用户与增长", "营业总额", "车费", "优惠金额",
      "消耗品销售总额", "专属技师佣金", "兼职技师佣金", "营销佣金", "代理商分佣",
      "NDP 收入", "联盟营销收益", "消耗品销售利润", "新增付费会员", "技师入住",
      "代理商入住", "加盟商入住", "供货商入住", "指标详细数据", "正在加载详细分析",
      "暂无可展示的序列数据", "查看详细数据", "TEST 功能暂未开放",
      "查看指标说明和计算公式", "上一周期", "数据已连接", "数据接口尚未连接",
      "数据暂不可用", "环比暂不可用", "综合数据概要", "返回数据大盘",
      "正在更新详细分析，当前仍显示同一指标的上次结果", "详细分析加载失败",
      "重试加载详细分析", "当前身份没有查看详细分析的权限", "该分析指标或筛选条件无效",
      "详细分析服务暂时不可用，请稍后重试", "详细分析加载失败，请检查网络后重试",
      "指标概要", "计算公式", "至少选择一个图例以显示图表", "隐藏图例", "显示图例",
      "周期对比趋势", "暂无数据"
    ];
    for (const sourceText of sources) {
      for (const language of ["zh-Hant", "ja", "en", "ko"] as const) {
        expect(translateTextForContext(sourceText, language, { portal: "admin" }).trim()).not.toBe("");
      }
      expect(translateTextForContext(sourceText, "ja", { portal: "admin" })).not.toBe(sourceText);
      expect(translateTextForContext(sourceText, "en", { portal: "admin" })).not.toBe(sourceText);
      expect(translateTextForContext(sourceText, "ko", { portal: "admin" })).not.toBe(sourceText);
    }
    expect(translateTextForContext("暂无数据", "zh-Hant", { portal: "admin" })).toBe("暫無資料");
    expect(translateTextForContext("暂无数据", "ja", { portal: "admin" })).toBe("データなし");
    expect(translateTextForContext("暂无数据", "en", { portal: "admin" })).toBe("No data");
    expect(translateTextForContext("暂无数据", "ko", { portal: "admin" })).toBe("데이터 없음");
  });

  it("fails closed on mismatched independently resolved windows and preserves the coherent pair", async () => {
    apiMocks.dashboard
      .mockResolvedValueOnce(dashboardPayload)
      .mockResolvedValueOnce(dashboardPayload);
    apiMocks.dashboardOverview
      .mockResolvedValueOnce(overviewPayload)
      .mockResolvedValueOnce({
        ...overviewPayload,
        filter: { ...overviewPayload.filter, from: "2026-08-26" }
      });
    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(DashboardPage)));
    });
    expect(container.textContent).toContain("运营财务");

    const reset = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "重置")!;
    await act(async () => { reset.click(); });

    expect(container.textContent).toContain("经营数据加载失败");
    expect(container.textContent).toContain("运营财务");
    expect(container.textContent).toContain("以下仍显示上次成功结果");
  });

  it("aborts and ignores an older paired generation", async () => {
    const oldDashboard = deferred<typeof dashboardPayload>();
    const oldOverview = deferred<typeof overviewPayload>();
    apiMocks.dashboard
      .mockReturnValueOnce(oldDashboard.promise)
      .mockResolvedValueOnce(dashboardPayload);
    apiMocks.dashboardOverview
      .mockReturnValueOnce(oldOverview.promise)
      .mockResolvedValueOnce(overviewPayload);
    act(() => root.render(createElement(MemoryRouter, null, createElement(DashboardPage))));
    const oldSignal = apiMocks.dashboard.mock.calls[0][2].signal as AbortSignal;

    const reset = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "重置")!;
    await act(async () => { reset.click(); });
    expect(oldSignal.aborted).toBe(true);
    expect(container.textContent).toContain("运营财务");

    await act(async () => {
      oldDashboard.resolve(dashboardPayload);
      oldOverview.resolve({
        ...overviewPayload,
        operationsFinance: [{
          ...overviewPayload.operationsFinance[0],
          currentValue: 999,
          comparisonPercent: 100,
          comparisonDirection: "up"
        }]
      });
    });
    expect(container.textContent).not.toContain("999");
    expect(container.textContent).toContain("运营财务");
  });
  it("queries the formal aggregate with the shared date and city filter", () => {
    expect(source).toContain("DashboardFilterBar");
    expect(source).toContain('backofficeRealDataApi.dashboard("backoffice", query, { signal: controller.signal })');
    expect(source).toContain("backofficeRealDataApi.dashboardOverview(query, { signal: controller.signal })");
    expect(source).toContain("dashboard?.filter.availableCities");
    expect(source).toContain("dashboard.filter.previousFrom");
    expect(source).toContain("dashboard.filter.previousTo");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("mapBackofficeOrder");
    expect(source).not.toContain("dashboard.orders");
  });

  it("renders exactly the five requested headline comparisons", () => {
    const headlineBlock = source.slice(
      source.indexOf("const headlineMetrics"),
      source.indexOf("const ndpCards")
    );

    expect(headlineBlock).toContain('title: t("可排班")');
    expect(headlineBlock).toContain('title: t("活跃技师")');
    expect(headlineBlock).toContain('title: t("注册技师")');
    expect(headlineBlock).toContain('title: t("店铺数")');
    expect(headlineBlock).toContain('title: t("新增用户")');
    expect(headlineBlock.match(/title:/g)).toHaveLength(5);
    expect(headlineBlock).toContain("dashboard.summary.availableScheduleSlots");
    expect(headlineBlock).toContain("dashboard.summary.activeTechnicians");
    expect(headlineBlock).toContain("dashboard.summary.registeredTechnicians");
    expect(headlineBlock).toContain("dashboard.summary.shopCount");
    expect(headlineBlock).toContain("dashboard.summary.newCustomers");
  });

  it("renders the three requested real-series charts", () => {
    expect(source.match(/<DualAxisLineChart/g)).toHaveLength(3);
    expect(source).toContain('title={t("订单总量和服务 GMV")}');
    expect(source).toContain('key: "orderCount"');
    expect(source).toContain('key: "serviceGmvJpy"');
    expect(source).toContain('title={t("NDP 收入和冻结 NDP 量")}');
    expect(source).toContain('key: "platformNetRevenueNdp"');
    expect(source).toContain('key: "frozenNdp"');
    expect(source).toContain('title={t("店铺数量和技师数量")}');
    expect(source).toContain('key: "shopCount"');
    expect(source).toContain('key: "registeredTechnicianCount"');
    expect(source).toContain("dashboard.series.buckets");
  });

  it("renders three formal and Test NDP summary cards with scope notices", () => {
    const ndpBlock = source.slice(source.indexOf("const ndpCards"), source.indexOf("function applyFilter"));

    expect(ndpBlock).toContain('title: t("用户奖励 NDP")');
    expect(ndpBlock).toContain('title: t("存量 NDP")');
    expect(ndpBlock).toContain('title: t("提现 NDP")');
    expect(ndpBlock.match(/title:/g)).toHaveLength(3);
    expect(ndpBlock).toContain("dashboard.finance.userReward.ndp");
    expect(ndpBlock).toContain("dashboard.finance.userReward.testNdp");
    expect(ndpBlock).toContain("dashboard.finance.walletStock?.ndp");
    expect(ndpBlock).toContain("dashboard.finance.walletStock?.testNdp");
    expect(ndpBlock).toContain("dashboard.finance.withdrawn?.ndp");
    expect(ndpBlock).toContain("dashboard.finance.withdrawn?.testNdp");
    expect(source).toContain("钱包存量为平台全量口径，不受城市筛选影响");
    expect(source).toContain("提现金额为平台全量口径，不受城市筛选影响");
  });

  it("retains the last successful dashboard during retry and ignores stale responses", () => {
    expect(source).toContain("const requestIdRef = useRef(0)");
    expect(source).toContain("const controller = new AbortController()");
    expect(source).toContain("requestId !== requestIdRef.current");
    expect(source).toContain("controller.abort()");
    expect(source).not.toContain("setPair(null)");
    expect(source).toContain('aria-busy={loadStatus === "loading"}');
    expect(source).toContain('loadStatus === "error"');
    expect(source).toContain("dashboard ? (");
    expect(source).toContain("以下仍显示上次成功结果");
    expect(source).toContain("setQuery({ ...defaultQuery })");
  });

  it("keeps permission-aware failures, retry, empty series, and true zero values", () => {
    expect(source).toContain("当前身份没有查看经营数据的权限");
    expect(source).toContain("经营数据服务暂时不可用，请稍后重试");
    expect(source).toContain("重新加载经营数据");
    expect(source).toContain("DashboardMetricCard");
    expect(source).toContain("translateTextForContext");
    expect(source).not.toMatch(/\|\|\s*["']—["']/u);
    expect(source).not.toContain("尚未启用的运营模块");
    expect(source).not.toContain("DataTable");
  });
});
