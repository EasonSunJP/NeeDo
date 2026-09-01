import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  serializeDashboardQuerySearch,
  type BackofficeDashboardPayload,
  type DashboardMetricDetailPayload,
  type DashboardPeriod,
  type DashboardQuery
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { Button } from "../../components/ui/Button";
import { AnalyticsMetricDetail } from "../../features/dashboard/AnalyticsMetricDetail";
import { AnalyticsMetricGrid } from "../../features/dashboard/AnalyticsMetricGrid";
import {
  DashboardFilterBar,
  type DashboardFilterValue
} from "../../features/dashboard/DashboardFilterBar";
import { useI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { analyticsFiltersMatch, getAnalyticsMetricTitleSource } from "./DashboardPage";

const validPeriods = new Set<DashboardPeriod>([
  "today", "last7days", "last30days", "week", "month", "year", "custom"
]);

type MetricDetailPair = {
  detail: DashboardMetricDetailPayload;
  dashboard: BackofficeDashboardPayload;
};

function readDashboardQuery(search: URLSearchParams): DashboardQuery | null {
  const period = search.get("period") ?? "last7days";
  if (!validPeriods.has(period as DashboardPeriod)) return null;
  const from = search.get("from") ?? undefined;
  const to = search.get("to") ?? undefined;
  const city = search.get("city")?.trim() || undefined;
  if (period === "custom" && (!from || !to)) return null;
  return {
    period: period as DashboardPeriod,
    ...(period === "custom" ? { from, to } : {}),
    ...(city ? { city } : {})
  };
}

export function describeMetricDetailError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看详细分析的权限";
    if (error.status === 400 || error.status === 404) return "该分析指标或筛选条件无效";
    if (error.status >= 500) return "详细分析服务暂时不可用，请稍后重试";
  }
  return "详细分析加载失败，请检查网络后重试";
}

export function DashboardMetricDetailPage() {
  const { metricKey = "" } = useParams<{ metricKey: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const searchKey = searchParams.toString();
  const query = useMemo(() => readDashboardQuery(new URLSearchParams(searchKey)), [searchKey]);
  const canonicalSearch = useMemo(
    () => query ? serializeDashboardQuerySearch(query) : null,
    [query]
  );
  const [pair, setPair] = useState<MetricDetailPair | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (canonicalSearch !== null && canonicalSearch !== searchKey) {
      setSearchParams(canonicalSearch, { replace: true });
    }
  }, [canonicalSearch, searchKey, setSearchParams]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    setStatus("loading");
    setErrorMessage("");

    if (!metricKey || !query) {
      setStatus("error");
      setErrorMessage("该分析指标或筛选条件无效");
      return () => controller.abort();
    }
    if (canonicalSearch !== searchKey) return () => controller.abort();

    void Promise.all([
      backofficeRealDataApi.dashboardMetricDetail(metricKey, query, { signal: controller.signal }),
      backofficeRealDataApi.dashboard("backoffice", query, { signal: controller.signal })
    ])
      .then(([detail, dashboard]) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        if (detail.metric.metricKey !== metricKey || !analyticsFiltersMatch(dashboard.filter, detail.filter)) {
          throw new Error("error.dashboard.filter_mismatch");
        }
        setPair({ detail, dashboard });
        setStatus("success");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setStatus("error");
        setErrorMessage(describeMetricDetailError(error));
      });

    return () => controller.abort();
  }, [canonicalSearch, metricKey, query, revision, searchKey]);

  const visiblePair = pair?.detail.metric.metricKey === metricKey ? pair : null;
  const metricTitle = visiblePair
    ? t(getAnalyticsMetricTitleSource(visiblePair.detail.metric.metricKey))
    : t("指标详细数据");
  const hasSeriesData = visiblePair?.detail.series.some((series) =>
    series.points.some((point) => point.value !== null)
  ) ?? false;

  function updateUrl(value: DashboardFilterValue) {
    const next = new URLSearchParams({ period: value.period });
    if (value.period === "custom" && value.from && value.to) {
      next.set("from", value.from);
      next.set("to", value.to);
    }
    if (value.city) next.set("city", value.city);
    setSearchParams(next);
  }

  return (
    <AdminLayout>
      <div aria-busy={status === "loading"} className="min-w-0 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-moss">{t("综合数据概要")}</p>
            <h1 className="mt-1 text-3xl font-black text-ink">{metricTitle}</h1>
          </div>
          <Link className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-black text-ink" to="/admin">
            {t("返回数据大盘")}
          </Link>
        </header>

        {query ? (
          <DashboardFilterBar
            cities={visiblePair?.dashboard.filter.availableCities ?? []}
            loading={status === "loading"}
            onApply={updateUrl}
            onReset={() => setSearchParams({ period: "last7days" })}
            value={query}
          />
        ) : null}

        {status === "loading" && !visiblePair ? (
          <section className="rounded-2xl border border-line bg-white px-5 py-12 text-center shadow-panel" role="status">
            <p className="text-sm font-black text-ink">{t("正在加载详细分析")}</p>
          </section>
        ) : null}

        {status === "loading" && visiblePair ? (
          <p className="rounded-xl border border-line bg-white px-4 py-3 text-xs font-black text-ink/55" role="status">
            {t("正在更新详细分析，当前仍显示同一指标的上次结果")}
          </p>
        ) : null}

        {status === "error" ? (
          <section className="rounded-2xl border border-coral/30 bg-coral/5 px-5 py-6 text-center shadow-panel" role="alert">
            <h2 className="text-lg font-black text-ink">{t("详细分析加载失败")}</h2>
            <p className="mt-2 text-sm font-bold text-ink/55">{t(errorMessage)}</p>
            <Button className="mt-4" onClick={() => setRevision((current) => current + 1)}>
              {t("重试加载详细分析")}
            </Button>
          </section>
        ) : null}

        {visiblePair ? (
          <>
            <AnalyticsMetricGrid
              getInfoLabel={(title) => `${title} — ${t("查看指标说明和计算公式")}`}
              getMetricTitle={() => metricTitle}
              groupTitle={t("指标概要")}
              metrics={[visiblePair.detail.metric]}
              previousLabel={t("上一周期")}
              statusMessages={{
                ready: t("数据已连接"),
                not_connected: t("数据接口尚未连接"),
                not_available: t("数据暂不可用")
              }}
              unavailableComparisonLabel={t("环比暂不可用")}
            />
            <section className="rounded-2xl border border-line bg-white p-4 shadow-panel">
              <h2 className="text-sm font-black text-ink">{t("计算公式")}</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/60" data-no-i18n>
                {visiblePair.detail.metric.formula}
              </p>
            </section>
            {hasSeriesData ? (
              <AnalyticsMetricDetail
                allSeriesHiddenLabel={t("至少选择一个图例以显示图表")}
                hideSeriesLabel={(label) => `${t("隐藏图例")} ${label}`}
                series={visiblePair.detail.series}
                showSeriesLabel={(label) => `${t("显示图例")} ${label}`}
                title={t("周期对比趋势")}
                unavailableValueLabel={t("暂无数据")}
              />
            ) : (
              <section className="rounded-2xl border border-line bg-white px-5 py-10 text-center shadow-panel" role="status">
                <p className="text-sm font-black text-ink/50">{t("暂无可展示的序列数据")}</p>
              </section>
            )}
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
