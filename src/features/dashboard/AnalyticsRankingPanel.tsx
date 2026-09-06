import { useEffect, useRef, useState } from "react";
import {
  backofficeRealDataApi,
  type AnalyticsRankingKind,
  type AnalyticsRankingItem,
  type AnalyticsRankingMetric,
  type AnalyticsRankingPayload,
  type DashboardQuery
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateTextForContext } from "../../i18n/translations";
import { DashboardFilterBar } from "./DashboardFilterBar";
import { Drawer } from "../../components/ui/Drawer";
import { DashboardTestBadge } from "./DashboardTestBadge";

type RankingCategory = { id: number; name: string };

export type AnalyticsRankingPanelProps = {
  categories?: RankingCategory[];
  cities?: string[];
  kind: AnalyticsRankingKind;
  onOpenDetail: (item: AnalyticsRankingItem) => void;
  query: DashboardQuery;
  title: string;
  variant?: "summary" | "detail";
  initialMetric?: AnalyticsRankingMetric;
  initialCategoryId?: number | null;
};

function rankingErrorSource(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看排行榜的权限";
    if (error.status === 409) return "订单完成凭证不完整，暂时无法生成排行榜";
    if (error.status >= 500) return "排行榜服务暂时不可用，请稍后重试";
  }
  return "排行榜加载失败，请检查网络后重试";
}

export function AnalyticsRankingPanel({
  categories = [],
  cities = [],
  kind,
  onOpenDetail,
  query: initialQuery,
  title,
  variant = "summary",
  initialMetric = "gmv",
  initialCategoryId = null
}: AnalyticsRankingPanelProps) {
  const { language } = useI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const [detailQuery, setDetailQuery] = useState(initialQuery);
  const query = variant === "detail" ? detailQuery : initialQuery;
  const [pageSize, setPageSize] = useState(10);
  const [metric, setMetric] = useState<AnalyticsRankingMetric>(initialMetric);
  const [categoryId, setCategoryId] = useState<number | null>(initialCategoryId);
  const [payload, setPayload] = useState<AnalyticsRankingPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorSource, setErrorSource] = useState("");
  const [revision, setRevision] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const requestIdRef = useRef(0);
  const queryKey = `${query.period}|${query.from ?? ""}|${query.to ?? ""}|${query.city ?? ""}`;

  const filterKey = `${kind}|${queryKey}|${categoryId ?? ""}|${metric}|${pageSize}`;
  const page = pagination.key === filterKey ? pagination.page : 1;
  if (pagination.key !== filterKey) setPagination({ key: filterKey, page: 1 });
  const detailTitle = { service: "服务项目排行详情", technician: "技师排行详情", customer: "用户消费排行详情" }[kind];

  useEffect(() => {
    if (categoryId !== null && !categories.some((category) => category.id === categoryId)) {
      setCategoryId(null);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    setErrorSource("");
    setPayload(null);
    void backofficeRealDataApi.analyticsRankings(kind, {
      ...query,
      metric,
      ...(categoryId ? { categoryId } : {}),
      page,
      pageSize
    }, { signal: controller.signal }).then((next) => {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setPayload(next);
      setStatus("success");
    }).catch((error: unknown) => {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setErrorSource(rankingErrorSource(error));
      setStatus("error");
    });
    return () => controller.abort();
  }, [categoryId, kind, metric, page, pageSize, queryKey, revision]);

  const currency = new Intl.NumberFormat(languageLocales[language], {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  });
  const totalPages = Math.max(1, Math.ceil((payload?.total ?? 0) / pageSize));

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
      {variant === "detail" ? <DashboardFilterBar value={query} cities={cities} loading={status === "loading"}
        onApply={setDetailQuery} onReset={() => setDetailQuery({ period: "last7days" })} /> : null}
      <header className="space-y-3 border-b border-line px-4 py-4">
        <div
          className="flex min-h-9 flex-wrap items-center justify-between gap-3"
          data-ranking-header-row="primary"
        >
          {variant === "summary" ? <h2 className="text-base font-black text-ink">{t(title)}</h2> : <span className="text-sm font-black text-ink">{t("服务类型")}</span>}
          {(
            <select
              aria-label={`${t(title)}${t("服务类型")}`}
              className="h-9 max-w-44 rounded-xl border border-line bg-white px-3 text-xs font-black text-ink outline-none focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/30"
              onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)}
              value={categoryId ?? ""}
            >
              <option value="">{t("全部服务类型")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="inline-flex rounded-full bg-paper p-1" role="group" aria-label={`${t(title)}${t("排行口径")}`}>
          {(["gmv", "completedCount"] as const).map((candidate) => {
            const label = candidate === "gmv" ? "GMV" : "完成次数";
            return (
              <button
                aria-label={`${t(title)}${t(candidate === "gmv" ? "按 GMV 排序" : "按完成次数排序")}`}
                aria-pressed={metric === candidate}
                className={`rounded-full px-3 py-1.5 text-xs font-black transition ${metric === candidate ? "bg-moss text-white" : "text-ink/55 hover:text-ink"}`}
                key={candidate}
                onClick={() => setMetric(candidate)}
                type="button"
              >
                {t(label)}
              </button>
            );
          })}
        </div>
        {variant === "summary" ? (
          <button className="analytics-ranking-detail-control rounded-lg px-3 py-2 text-sm font-black text-moss"
            data-ranking-list-control="true" aria-label={`${t(title)}${t("查看详细")}`}
            onClick={() => setDetailOpen(true)} type="button">{t("查看详细")} →</button>
        ) : null}
      </header>
      {variant === "detail" && payload ? (
        <p className="break-words border-b border-line px-4 py-3 text-xs font-bold text-ink/55" data-no-i18n>
          {payload.filter.from} — {payload.filter.to} · {payload.filter.timeZone}
          {query.city ? ` · ${query.city}` : ""} · {t("排行记录数")}：{payload.total}
        </p>
      ) : null}

      {status === "loading" ? (
        <p className="px-5 py-12 text-center text-sm font-black text-ink/45" role="status">{t("正在加载排行榜")}</p>
      ) : null}
      {status === "error" ? (
        <div className="px-5 py-9 text-center" role="alert">
          <p className="text-sm font-black text-coral">{t(errorSource)}</p>
          <button className="mt-3 rounded-full border border-line px-4 py-2 text-xs font-black text-ink" onClick={() => setRevision((current) => current + 1)} type="button">
            {t("重试加载排行榜")}
          </button>
        </div>
      ) : null}
      {status === "success" && payload?.list.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm font-black text-ink/45" role="status">{t("当前范围暂无排行数据")}</p>
      ) : null}
      {payload?.list.length ? (
        <ol className="divide-y divide-line px-4">
          {payload.list.map((item) => (
            <li key={`${item.entityType}:${item.entityPublicId}`}>
              <button
                aria-label={`${t("查看详细数据")}：${item.displayName}`}
                className="analytics-ranking-detail-control grid w-full grid-cols-[2rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg py-3 text-left transition focus-visible:outline-none"
                data-ranking-detail-control="true"
                onClick={() => onOpenDetail(item)}
                type="button"
              >
                <strong className={`text-xl font-black ${item.rank <= 3 ? "text-moss" : "text-ink/35"}`} data-no-i18n>{item.rank}</strong>
                {item.avatarUrl ? (
                  <img alt="" className="h-10 w-10 rounded-full object-cover" src={item.avatarUrl} />
                ) : (
                  <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-paper text-sm font-black text-ink/55">{item.displayName.slice(0, 1)}</span>
                )}
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className={`${variant === "detail" ? "break-words" : "truncate"} text-sm font-black text-ink`} data-no-i18n>{item.displayName}</p>
                    {item.dataComposition === "formal" ? null : (
                      <DashboardTestBadge
                        ariaLabel={t(
                          item.dataComposition === "mixed"
                            ? "排行榜合计包含测试订单"
                            : "排行榜数据来自测试订单"
                        )}
                      />
                    )}
                  </div>
                  <p className="mt-1 break-all text-xs font-bold text-ink/40" data-no-i18n>{item.entityPublicId}</p>
                  {variant === "detail" && item.categoryId !== null ? (
                    <p className="mt-1 text-xs font-bold text-ink/55" data-no-i18n>
                      {t("服务类型")}：{categories.find((category) => category.id === item.categoryId)?.name ?? item.categoryId}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <strong className={`block text-sm font-black ${metric === "gmv" ? "text-moss" : "text-ink/55"}`} data-no-i18n>{currency.format(item.gmvJpy)}</strong>
                  <span className={`mt-1 block text-xs font-black ${metric === "completedCount" ? "text-moss" : "text-ink/45"}`} data-no-i18n>{item.completedCount} {t("单")}</span>
                </div>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {variant === "detail" ? (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4" aria-label={t("排行榜分页")}>
          <label className="flex items-center gap-2 text-xs font-bold text-ink/55">{t("每页")}
            <select aria-label={t("每页条数")} value={pageSize}
              className="h-9 rounded-xl border border-line bg-white px-3 text-sm text-ink"
              onChange={(event) => setPageSize(Number(event.target.value))}>
              {[10, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>{t("条")}
          </label>
          <button type="button" aria-label={t("上一页")} disabled={status !== "success" || page <= 1}
            className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-ink disabled:opacity-40"
            onClick={() => setPagination({ key: filterKey, page: page - 1 })}>{t("上一页")}</button>
          <span className="text-sm font-bold text-ink/55" data-no-i18n>{page} / {totalPages}</span>
          <button type="button" aria-label={t("下一页")} disabled={status !== "success" || page >= totalPages}
            className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-ink disabled:opacity-40"
            onClick={() => setPagination({ key: filterKey, page: page + 1 })}>{t("下一页")}</button>
        </nav>
      ) : null}
      {detailOpen ? (
        <div data-ranking-full-list="true">
          <Drawer open defaultWidth={900} widthStorageKey="needo.ui.analytics-ranking.width" title={t(detailTitle)} closeLabel={t("关闭排行详情")} onClose={() => setDetailOpen(false)}>
            <AnalyticsRankingPanel key={queryKey} categories={categories} cities={cities} kind={kind} onOpenDetail={onOpenDetail}
              query={query} title={detailTitle} variant="detail" initialMetric={metric} initialCategoryId={categoryId} />
          </Drawer>
        </div>
      ) : null}
    </section>
  );
}
