import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  backofficeRealDataApi,
  serializeDashboardQuerySearch,
  type BackofficeDashboardPayload,
  type DashboardHeadlineSeriesPoint,
  type DashboardOverviewPayload,
  type AnalyticsRankingItem,
  type DashboardQuery
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { DualAxisLineChart } from "../../features/dashboard/DashboardCharts";
import { DashboardFilterBar, type DashboardFilterValue } from "../../features/dashboard/DashboardFilterBar";
import { DashboardMetricCard } from "../../features/dashboard/DashboardMetricCard";
import type { DashboardMetricSparklinePoint } from "../../features/dashboard/DashboardMetricSparkline";
import { AnalyticsMetricGrid } from "../../features/dashboard/AnalyticsMetricGrid";
import { AnalyticsRankingsSection } from "../../features/dashboard/AnalyticsRankingsSection";
import { MerchantsPage } from "./MerchantsPage";
import { TechniciansPage } from "./TechniciansPage";
import { UnifiedUserDetailDrawer } from "../../features/platform-user-management/UnifiedUserDetailDrawer";
import { useI18n } from "../../i18n/I18nProvider";
import { getAnalyticsMetricInfoLabel, translateTextForContext } from "../../i18n/translations";

const defaultQuery: DashboardQuery = { period: "last7days" };

export function openLiveDashboardWindow(
  openWindow: (url: string, target: string, features: string) => Window | null = (url, target, features) => window.open(url, target, features)
) {
  const child = openWindow(
    "/pf-admin.html#/admin/live-screen?country=JP&period=today",
    "_blank",
    "noopener,noreferrer"
  );
  if (child) child.opener = null;
}

type DashboardPair = {
  dashboard: BackofficeDashboardPayload;
  overview: DashboardOverviewPayload;
  query: DashboardQuery;
};

export function analyticsFiltersMatch(
  left: BackofficeDashboardPayload["filter"],
  right: DashboardOverviewPayload["filter"]
) {
  return left.period === right.period &&
    left.from === right.from &&
    left.to === right.to &&
    left.previousFrom === right.previousFrom &&
    left.previousTo === right.previousTo &&
    left.timeZone === right.timeZone &&
    left.granularity === right.granularity &&
    left.city === right.city;
}

const metricTitleSources: Record<string, string> = {
  gross_revenue: "营业总额",
  travel_fare: "车费",
  discount_amount: "优惠金额",
  consumables_sales: "消耗品销售总额",
  dedicated_technician_commission: "专属技师佣金",
  part_time_technician_commission: "兼职技师佣金",
  marketing_commission: "营销佣金",
  agent_commission: "代理商分佣",
  ndp_income: "NDP 收入",
  affiliate_platform_income: "联盟营销收益",
  consumables_profit: "消耗品销售利润",
  new_users: "新增用户",
  new_paid_members: "新增付费会员",
  technician_onboarding: "技师入住",
  agent_onboarding: "代理商入住",
  franchisee_onboarding: "加盟商入住",
  supplier_onboarding: "供货商入住"
};

export function getAnalyticsMetricTitleSource(metricKey: string) {
  return metricTitleSources[metricKey] ?? metricKey;
}

function describeDashboardError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看经营数据的权限";
    if (error.status >= 500) return "经营数据服务暂时不可用，请稍后重试";
  }
  return "经营数据加载失败，请检查网络后重试";
}

function headlineSparkline(
  value: unknown,
  key: keyof Omit<DashboardHeadlineSeriesPoint, "key" | "label">
): DashboardMetricSparklinePoint[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const buckets = (value as { buckets?: unknown }).buckets;
  if (!Array.isArray(buckets) || buckets.length !== 3) return undefined;
  const points = buckets.map((candidate) => {
    if (!candidate || typeof candidate !== "object") return null;
    const bucket = candidate as Record<string, unknown>;
    const pointValue = bucket[key];
    if (
      typeof bucket.key !== "string" ||
      typeof bucket.label !== "string" ||
      typeof pointValue !== "number" ||
      !Number.isFinite(pointValue)
    ) return null;
    return { key: bucket.key, label: bucket.label, value: pointValue };
  });
  return points.every((point): point is DashboardMetricSparklinePoint => point !== null)
    ? points
    : undefined;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const [rankingDetail, setRankingDetail] = useState<AnalyticsRankingItem | null>(null);
  const [pair, setPair] = useState<DashboardPair | null>(null);
  const [query, setQuery] = useState<DashboardQuery>(defaultQuery);
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadStatus("loading");
    setLoadError("");

    void Promise.all([
      backofficeRealDataApi.dashboard("backoffice", query, { signal: controller.signal }),
      backofficeRealDataApi.dashboardOverview(query, { signal: controller.signal })
    ])
      .then(([dashboard, overview]) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        if (!analyticsFiltersMatch(dashboard.filter, overview.filter)) {
          throw new Error("error.dashboard.filter_mismatch");
        }
        setPair({ dashboard, overview, query: { ...query } });
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setLoadError(describeDashboardError(error));
        setLoadStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [query, revision]);

  const dashboard = pair?.dashboard ?? null;
  const overview = pair?.overview ?? null;
  const committedQuery = pair?.query ?? defaultQuery;

  const headlineMetrics = dashboard
    ? [
        {
          accent: "blue" as const,
          comparison: dashboard.summary.availableScheduleSlots,
          icon: "◇",
          sparkline: headlineSparkline(
            dashboard.headlineSeries3d,
            "availableScheduleSlots"
          ),
          title: t("可排班"),
          unit: "slots" as const
        },
        {
          accent: "green" as const,
          comparison: dashboard.summary.activeTechnicians,
          icon: "●",
          sparkline: headlineSparkline(dashboard.headlineSeries3d, "activeTechnicians"),
          title: t("活跃技师"),
          unit: "people" as const
        },
        {
          accent: "purple" as const,
          comparison: dashboard.summary.registeredTechnicians,
          icon: "◎",
          sparkline: headlineSparkline(dashboard.headlineSeries3d, "registeredTechnicians"),
          title: t("注册技师"),
          unit: "people" as const
        },
        {
          accent: "cyan" as const,
          comparison: dashboard.summary.shopCount,
          icon: "▦",
          sparkline: headlineSparkline(dashboard.headlineSeries3d, "shopCount"),
          statusMessage: dashboard.summary.shopCount ? undefined : t("店铺数据暂不可用"),
          title: t("店铺数"),
          unit: "count" as const
        },
        {
          accent: "orange" as const,
          comparison: dashboard.summary.newCustomers,
          icon: "+",
          sparkline: headlineSparkline(dashboard.headlineSeries3d, "newCustomers"),
          statusMessage: dashboard.summary.newCustomers ? undefined : t("用户数据暂不可用"),
          title: t("新增用户"),
          unit: "people" as const
        }
      ]
    : [];

  const ndpCards = dashboard
    ? [
        {
          accent: "purple" as const,
          testNdp: dashboard.finance.userReward.testNdp,
          title: t("用户奖励 NDP"),
          unit: "ndp" as const,
          value: dashboard.finance.userReward.ndp
        },
        {
          accent: "blue" as const,
          note: t("钱包存量为平台全量口径，不受城市筛选影响"),
          statusMessage: dashboard.finance.walletStock ? undefined : t("平台钱包存量暂不可用"),
          testNdp: dashboard.finance.walletStock?.testNdp,
          title: t("存量 NDP"),
          unit: "ndp" as const,
          value: dashboard.finance.walletStock?.ndp
        },
        {
          accent: "green" as const,
          note: t("提现金额为平台全量口径，不受城市筛选影响"),
          statusMessage: dashboard.finance.withdrawn ? undefined : t("平台提现数据暂不可用"),
          testNdp: dashboard.finance.withdrawn?.testNdp,
          title: t("提现 NDP"),
          unit: "ndp" as const,
          value: dashboard.finance.withdrawn?.ndp
        }
      ]
    : [];

  function applyFilter(value: DashboardFilterValue) {
    setQuery(value);
  }

  function resetFilter() {
    setQuery({ ...defaultQuery });
  }

  return (
    <AdminLayout>
      <div aria-busy={loadStatus === "loading"} className="min-w-0 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-moss">{t("NeeDo 指挥中心")}</p>
            <TitleWithInfo
              as="h1"
              className="mt-1"
              info={t("平台经营指标、订单、排班、财务、店铺和技师均来自当前数据库聚合。")}
              label={t("数据大盘说明")}
              title={t("数据大盘")}
              titleClassName="text-3xl font-black"
              variant="paper"
            />
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-xl border border-moss bg-moss/5 px-4 py-2 text-sm font-black text-moss transition hover:bg-moss/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
              onClick={() => openLiveDashboardWindow()}
              type="button"
            >
              {t("实时数据大屏")}
            </button>
            <Link className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-black text-ink transition hover:border-moss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40" to="/admin/orders">
              {t("处理订单")}
            </Link>
            <Link className="rounded-xl bg-moss px-4 py-2 text-sm font-black text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/50" to="/admin/finance">
              {t("财务对账")}
            </Link>
          </div>
        </header>

        <DashboardFilterBar
          cities={dashboard?.filter.availableCities ?? []}
          loading={loadStatus === "loading"}
          onApply={applyFilter}
          onReset={resetFilter}
          value={query}
        />

        {loadStatus === "loading" && !dashboard ? (
          <section aria-live="polite" className="rounded-2xl border border-line bg-white px-5 py-12 text-center shadow-panel">
            <p className="text-sm font-black text-ink">{t("正在加载真实经营数据")}</p>
          </section>
        ) : null}

        {loadStatus === "loading" && dashboard ? (
          <p aria-live="polite" className="rounded-xl border border-line bg-white px-4 py-3 text-xs font-black text-ink/55 shadow-panel">
            {t("正在更新经营数据，当前仍显示上次成功结果")}
          </p>
        ) : null}

        {loadStatus === "error" ? (
          <section className="rounded-2xl border border-coral/30 bg-coral/5 px-5 py-6 text-center shadow-panel" role="alert">
            <h2 className="text-lg font-black text-ink">{t("经营数据加载失败")}</h2>
            <p className="mt-2 text-sm font-bold text-ink/55">{t(loadError)}</p>
            {dashboard ? (
              <p className="mt-2 text-xs font-bold text-ink/45">{t("以下仍显示上次成功结果")}</p>
            ) : null}
            <Button className="mt-4" onClick={() => setRevision((current) => current + 1)}>
              {t("重新加载经营数据")}
            </Button>
          </section>
        ) : null}

        {dashboard ? (
          <>
            <section aria-label={t("核心经营数据")} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {headlineMetrics.map((metric) => (
                <DashboardMetricCard key={metric.title} {...metric} />
              ))}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-bold text-ink/45">
              <p>
                {t("当前范围")} <span data-no-i18n>{dashboard.filter.from}</span> – <span data-no-i18n>{dashboard.filter.to}</span>
              </p>
              <p>
                {t("上期范围")} <span data-no-i18n>{dashboard.filter.previousFrom}</span> – <span data-no-i18n>{dashboard.filter.previousTo}</span>
              </p>
            </div>

            <section aria-label={t("平台经营趋势")} className="grid min-w-0 gap-5 xl:grid-cols-3">
              <DualAxisLineChart
                buckets={dashboard.series.buckets}
                description={t("订单与服务金额趋势")}
                left={{ key: "orderCount", label: t("订单总量"), unit: t("单") }}
                right={{ key: "serviceGmvJpy", label: t("服务 GMV"), unit: "JPY" }}
                title={t("订单总量和服务 GMV")}
              />
              <DualAxisLineChart
                buckets={dashboard.series.buckets}
                description={t("正式 NDP 净收入与期末冻结趋势")}
                left={{ key: "platformNetRevenueNdp", label: t("NDP 净收入"), unit: "NDP" }}
                right={{ key: "frozenNdp", label: t("冻结 NDP"), unit: "NDP" }}
                title={t("NDP 收入和冻结 NDP 量")}
              />
              <DualAxisLineChart
                buckets={dashboard.series.buckets}
                description={t("累计店铺与注册技师趋势")}
                left={{ key: "shopCount", label: t("店铺数"), unit: t("个") }}
                right={{ key: "registeredTechnicianCount", label: t("注册技师数"), unit: t("人") }}
                title={t("店铺数量和技师数量")}
              />
            </section>

            <p className="rounded-xl bg-paper px-4 py-3 text-xs font-bold leading-5 text-ink/50">
              {t("趋势图仅展示正式 NDP；Test NDP 在汇总卡中单独显示。")}
            </p>

            <section aria-label={t("NDP 汇总")} className="grid min-w-0 gap-3 md:grid-cols-3">
              {ndpCards.map((card) => (
                <DashboardMetricCard key={card.title} {...card} />
              ))}
            </section>

            {overview ? (
              <div className="min-w-0 space-y-5 border-t border-line pt-5">
                {[
                  ["运营财务", overview.operationsFinance],
                  ["佣金统计", overview.commissionMetrics],
                  ["用户与增长", overview.growthMetrics]
                ].map(([groupTitle, metrics]) => (
                  <AnalyticsMetricGrid
                    detailLabel={t("查看详细数据")}
                    getDisabledDetailLabel={(metric) => metric.detailRoute === null || metric.dataStatus !== "ready"
                      ? t("TEST 功能暂未开放")
                      : undefined}
                    getInfoLabel={(title) => getAnalyticsMetricInfoLabel(title, language)}
                    getMetricTitle={(metric) => t(getAnalyticsMetricTitleSource(metric.metricKey))}
                    groupTitle={t(groupTitle as string)}
                    key={groupTitle as string}
                    metrics={metrics as DashboardOverviewPayload["operationsFinance"]}
                    onNavigate={(route) => navigate({
                      pathname: route,
                      search: `?${serializeDashboardQuerySearch(committedQuery)}`
                    })}
                    previousLabel={t("上一周期")}
                    statusMessages={{
                      ready: t("数据已连接"),
                      not_connected: t("数据接口尚未连接"),
                      not_available: t("数据暂不可用")
                    }}
                    unavailableComparisonLabel={t("环比暂不可用")}
                  />
                ))}
              </div>
            ) : null}

            <AnalyticsRankingsSection
              onOpenDetail={setRankingDetail}
              query={committedQuery}
            />
          </>
        ) : null}
      </div>
      {rankingDetail?.entityType === "customer" ? (
        <UnifiedUserDetailDrawer scope="operations" userId={rankingDetail.entityNumericId} onClose={() => setRankingDetail(null)} />
      ) : rankingDetail?.entityType === "technician" ? (
        <TechniciansPage key={rankingDetail.entityNumericId} embeddedDetail={{ id: rankingDetail.entityNumericId, onClose: () => setRankingDetail(null) }} />
      ) : rankingDetail ? (
        <MerchantsPage key={`${rankingDetail.entityType}:${rankingDetail.entityNumericId}`} embeddedDetail={{ id: rankingDetail.entityNumericId, type: rankingDetail.entityType, onClose: () => setRankingDetail(null) }} />
      ) : null}
    </AdminLayout>
  );
}
