import { useEffect, useRef, useState } from "react";
import {
  backofficeRealDataApi,
  type AnalyticsRankingKind,
  type AnalyticsRankingMetric,
  type AnalyticsRankingPayload,
  type DashboardQuery
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateTextForContext } from "../../i18n/translations";

type RankingCategory = { id: number; name: string };

export type AnalyticsRankingPanelProps = {
  categories?: RankingCategory[];
  kind: AnalyticsRankingKind;
  query: DashboardQuery;
  title: string;
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
  kind,
  query,
  title
}: AnalyticsRankingPanelProps) {
  const { language } = useI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const [metric, setMetric] = useState<AnalyticsRankingMetric>("gmv");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [payload, setPayload] = useState<AnalyticsRankingPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorSource, setErrorSource] = useState("");
  const [revision, setRevision] = useState(0);
  const requestIdRef = useRef(0);
  const queryKey = `${query.period}|${query.from ?? ""}|${query.to ?? ""}|${query.city ?? ""}`;

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
      page: 1,
      pageSize: 10
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
  }, [categoryId, kind, metric, queryKey, revision]);

  const currency = new Intl.NumberFormat(languageLocales[language], {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  });
  const showCategory = kind === "technician" || kind === "customer";

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
      <header className="space-y-3 border-b border-line px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black text-ink">{t(title)}</h2>
          {showCategory ? (
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
          ) : null}
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
      </header>

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
            <li className="grid grid-cols-[2rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3" key={`${item.entityType}:${item.entityPublicId}`}>
              <strong className={`text-xl font-black ${item.rank <= 3 ? "text-moss" : "text-ink/35"}`} data-no-i18n>{item.rank}</strong>
              {item.avatarUrl ? (
                <img alt="" className="h-10 w-10 rounded-full object-cover" src={item.avatarUrl} />
              ) : (
                <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-paper text-sm font-black text-ink/55">{item.displayName.slice(0, 1)}</span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-ink" data-no-i18n>{item.displayName}</p>
                <p className="mt-1 text-xs font-bold text-ink/40" data-no-i18n>{item.entityPublicId}</p>
              </div>
              <div className="text-right">
                <strong className={`block text-sm font-black ${metric === "gmv" ? "text-moss" : "text-ink/55"}`} data-no-i18n>{currency.format(item.gmvJpy)}</strong>
                <span className={`mt-1 block text-xs font-black ${metric === "completedCount" ? "text-moss" : "text-ink/45"}`} data-no-i18n>{item.completedCount} {t("单")}</span>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
