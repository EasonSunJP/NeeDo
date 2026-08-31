import { describe, expect, it } from "vitest";
import source from "./DashboardPage.tsx?raw";

describe("operations unified data dashboard", () => {
  it("queries the formal aggregate with the shared date and city filter", () => {
    expect(source).toContain("DashboardFilterBar");
    expect(source).toContain('backofficeRealDataApi.dashboard("backoffice", query, { signal: controller.signal })');
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
    expect(source).not.toContain("setDashboard(null)");
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
