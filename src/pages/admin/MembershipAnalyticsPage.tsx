import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload,
  type BackofficeScope,
  type DashboardPeriod,
  type MemberAnalyticsListPayload,
  type MembershipTrendPayload
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Button } from "../../components/ui/Button";
import { AnalyticsMetricDetail } from "../../features/dashboard/AnalyticsMetricDetail";
import {
  DashboardFilterBar,
  type DashboardFilterValue
} from "../../features/dashboard/DashboardFilterBar";
import { useI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";

type MembershipAnalyticsPageScope = BackofficeScope;
type MemberSearch = { needoId: string; nickname: string };
type LoadedMembershipAnalytics = {
  trend: MembershipTrendPayload;
  members: MemberAnalyticsListPayload;
  dashboard: BackofficeDashboardPayload;
};

const validPeriods = new Set<DashboardPeriod>([
  "today", "last7days", "last30days", "week", "month", "year", "custom"
]);
function readQuery(search: URLSearchParams, scope: MembershipAnalyticsPageScope) {
  const period = search.get("period") ?? "last7days";
  if (!validPeriods.has(period as DashboardPeriod)) return null;
  const from = search.get("from") ?? undefined;
  const to = search.get("to") ?? undefined;
  if (period === "custom" && (!from || !to)) return null;
  const city = scope === "backoffice" ? search.get("city")?.trim() || undefined : undefined;
  const needoId = search.get("needoId")?.trim() || "";
  const nickname = search.get("nickname")?.trim() || "";
  const page = Number(search.get("page") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1) return null;
  return {
    query: {
      period: period as DashboardPeriod,
      ...(period === "custom" ? { from, to } : {}),
      ...(city ? { city } : {})
    },
    search: { needoId, nickname },
    page
  };
}

export function describeMembershipAnalyticsError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看会员分析的权限";
    if (error.status === 400) return "会员筛选条件无效";
    if (error.status === 409) return "会员历史记录不完整，暂时无法生成分析";
    if (error.status >= 500) return "会员分析服务暂时不可用，请稍后重试";
  }
  return "会员分析加载失败，请检查网络后重试";
}

function filtersMatch(
  dashboard: BackofficeDashboardPayload["filter"],
  trend: MembershipTrendPayload["filter"]
) {
  return dashboard.period === trend.period && dashboard.from === trend.from &&
    dashboard.to === trend.to && dashboard.previousFrom === trend.previousFrom &&
    dashboard.previousTo === trend.previousTo && dashboard.timeZone === trend.timeZone &&
    dashboard.granularity === trend.granularity && dashboard.city === trend.city;
}

function Layout({ scope, children }: { scope: MembershipAnalyticsPageScope; children: ReactNode }) {
  if (scope === "merchant-admin") {
    return <MerchantAdminLayout>{() => children}</MerchantAdminLayout>;
  }
  return <AdminLayout>{children}</AdminLayout>;
}

function sourceLabel(source: MemberAnalyticsListPayload["list"][number]["acquisitionSource"]) {
  return ({
    offline_paid: "线下付费",
    online_paid: "线上付费",
    gift: "赠送",
    trial: "试用",
    renewal: "续费",
    historical_replacement: "历史补录",
    manual_grant: "人工发放"
  } as const)[source];
}

export function formatMembershipTokyoDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function MembershipAnalyticsPage({ scope = "backoffice" }: {
  scope?: MembershipAnalyticsPageScope;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useI18n();
  const portal = scope === "backoffice" ? "admin" : "merchant";
  const t = (source: string) => translateTextForContext(source, language, { portal });
  const seriesActionLabel = (action: "hide" | "show", label: string) => {
    if (language === "zh") return `${action === "hide" ? "隐藏" : "显示"}${label}`;
    const actionLabel = t(action === "hide" ? "隐藏图例" : "显示图例");
    return `${actionLabel}${language === "en" ? ": " : "："}${label}`;
  };
  const searchKey = searchParams.toString();
  const parsed = useMemo(
    () => readQuery(new URLSearchParams(searchKey), scope),
    [scope, searchKey]
  );
  const [draftSearch, setDraftSearch] = useState<MemberSearch>(
    () => parsed?.search ?? { needoId: "", nickname: "" }
  );
  const [loaded, setLoaded] = useState<LoadedMembershipAnalytics | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setDraftSearch(parsed?.search ?? { needoId: "", nickname: "" });
  }, [parsed?.search.needoId, parsed?.search.nickname]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    setErrorMessage("");
    setLoaded(null);
    if (!parsed) {
      setStatus("error");
      setErrorMessage("会员筛选条件无效");
      return () => controller.abort();
    }
    const listQuery = {
      ...parsed.query,
      ...(parsed.search.needoId ? { needoId: parsed.search.needoId } : {}),
      ...(parsed.search.nickname ? { nickname: parsed.search.nickname } : {}),
      page: parsed.page,
      pageSize: 20
    };
    void Promise.all([
      backofficeRealDataApi.membershipTrend(scope, parsed.query, { signal: controller.signal }),
      backofficeRealDataApi.membershipMembers(scope, listQuery, { signal: controller.signal }),
      backofficeRealDataApi.dashboard(scope, parsed.query, { signal: controller.signal })
    ]).then(([trend, members, dashboard]) => {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      if (!filtersMatch(dashboard.filter, trend.filter) ||
        members.page !== parsed.page || members.page_size !== 20) {
        throw new Error("error.membership_analytics.filter_mismatch");
      }
      setLoaded({ trend, members, dashboard });
      setStatus("success");
    }).catch((error: unknown) => {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setStatus("error");
      setErrorMessage(describeMembershipAnalyticsError(error));
    });
    return () => controller.abort();
  }, [parsed, revision, scope]);

  function updateUrl(query: DashboardFilterValue, memberSearch = parsed?.search, page = 1) {
    const next = new URLSearchParams({ period: query.period });
    if (query.period === "custom" && query.from && query.to) {
      next.set("from", query.from);
      next.set("to", query.to);
    }
    if (scope === "backoffice" && query.city) next.set("city", query.city);
    if (memberSearch?.needoId) next.set("needoId", memberSearch.needoId);
    if (memberSearch?.nickname) next.set("nickname", memberSearch.nickname);
    if (page > 1) next.set("page", String(page));
    setSearchParams(next);
  }

  function submitMemberSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed) return;
    updateUrl(parsed.query, {
      needoId: draftSearch.needoId.trim(),
      nickname: draftSearch.nickname.trim()
    });
  }

  const visible = loaded;
  const series = visible?.trend.series.map((item) => ({
    ...item,
    label: t(item.seriesKey === "added" ? "增加" : item.seriesKey === "removed" ? "减少" : "净变化")
  })) ?? [];
  const returnRoute = scope === "backoffice" ? "/admin" : "/merchant-admin";
  const totalPages = visible ? Math.max(1, Math.ceil(visible.members.total / visible.members.page_size)) : 1;

  return (
    <Layout scope={scope}>
      <div aria-busy={status === "loading"} className="min-w-0 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-moss">{t("会员数据")}</p>
            <h1 className="mt-1 text-3xl font-black text-ink">{t("会员详细分析")}</h1>
          </div>
          <Link className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-black text-ink" to={returnRoute}>
            {t("返回数据大盘")}
          </Link>
        </header>

        {parsed ? (
          <DashboardFilterBar
            cities={scope === "backoffice" ? visible?.dashboard.filter.availableCities ?? [] : undefined}
            loading={status === "loading"}
            onApply={(query) => updateUrl(query)}
            onReset={() => setSearchParams({ period: "last7days" })}
            value={parsed.query}
          />
        ) : null}

        <form aria-label={t("会员列表检索")} className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-panel md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={submitMemberSearch}>
          <label className="grid gap-1.5 text-xs font-black text-ink/60">
            NeeDo ID
            <input aria-label="NeeDo ID" className="h-10 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink outline-none focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/30" onChange={(event) => setDraftSearch((current) => ({ ...current, needoId: event.target.value }))} placeholder="u0000000000" value={draftSearch.needoId} />
          </label>
          <label className="grid gap-1.5 text-xs font-black text-ink/60">
            {t("昵称")}
            <input aria-label="昵称" className="h-10 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink outline-none focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/30" onChange={(event) => setDraftSearch((current) => ({ ...current, nickname: event.target.value }))} value={draftSearch.nickname} />
          </label>
          <div className="flex gap-2">
            <button aria-label={t("重置会员检索")} className="h-10 rounded-full border border-line bg-white px-4 text-sm font-black text-ink disabled:opacity-60" disabled={status === "loading"} onClick={() => parsed && updateUrl(parsed.query, { needoId: "", nickname: "" })} type="button">
              {t("重置")}
            </button>
            <button className="h-10 rounded-full bg-moss px-5 text-sm font-black text-white disabled:opacity-60" disabled={status === "loading"} type="submit">
              {t("检索会员")}
            </button>
          </div>
        </form>

        {status === "loading" && !visible ? (
          <section className="rounded-2xl border border-line bg-white px-5 py-12 text-center shadow-panel" role="status">
            <p className="text-sm font-black text-ink">{t("正在加载会员分析")}</p>
          </section>
        ) : null}
        {status === "error" ? (
          <section className="rounded-2xl border border-coral/30 bg-coral/5 px-5 py-6 text-center shadow-panel" role="alert">
            <h2 className="text-lg font-black text-ink">{t("会员分析加载失败")}</h2>
            <p className="mt-2 text-sm font-bold text-ink/55">{t(errorMessage)}</p>
            <Button className="mt-4" onClick={() => setRevision((current) => current + 1)}>{t("重试加载会员分析")}</Button>
          </section>
        ) : null}

        {visible ? (
          <>
            <AnalyticsMetricDetail
              allSeriesHiddenLabel={t("至少选择一个图例以显示图表")}
              hideSeriesLabel={(label) => seriesActionLabel("hide", label)}
              series={series}
              showSeriesLabel={(label) => seriesActionLabel("show", label)}
              title={t("会员增加、减少与净变化")}
              unavailableValueLabel={t("暂无数据")}
            />

            <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
                <div>
                  <h2 className="text-base font-black text-ink">{t("会员列表")}</h2>
                  <p className="mt-1 text-xs font-bold text-ink/45">{t("只显示当前筛选范围内正式会员记录")}</p>
                </div>
                <span className="rounded-full bg-paper px-3 py-1.5 text-xs font-black text-ink/55" data-no-i18n>{visible.members.total}</span>
              </div>
              {visible.members.list.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm font-black text-ink/45" role="status">{t("暂无会员数据")}</p>
              ) : (
                <div className="max-w-full overflow-x-auto">
                  <table className="min-w-[980px] w-full text-left text-sm">
                    <thead className="bg-paper text-xs font-black text-ink/50">
                      <tr>{["NeeDo ID", "昵称", "城市", "店铺", "会员卡/套餐", "加入来源", "首次付费时间", "当前状态", "到期时间"].map((label) => <th className="px-4 py-3" key={label}>{t(label)}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {visible.members.list.map((member) => (
                        <tr key={`${member.shopPublicId}:${member.membershipPublicId}`}>
                          <td className="px-4 py-3 font-black text-ink" data-no-i18n>{member.userNeedoId}</td>
                          <td className="px-4 py-3 font-bold text-ink" data-no-i18n>{member.nickname}</td>
                          <td className="px-4 py-3 text-ink/60" data-no-i18n>{member.city}</td>
                          <td className="px-4 py-3 text-ink/60" data-no-i18n>{member.shopName}</td>
                          <td className="px-4 py-3 text-ink/60"><span data-no-i18n>{member.planName ?? "—"}</span><span className="mt-1 block text-xs" data-no-i18n>{member.cardNoMasked}</span></td>
                          <td className="px-4 py-3 text-ink/60">{t(sourceLabel(member.acquisitionSource))}</td>
                          <td className="px-4 py-3 text-ink/60" data-no-i18n>{formatMembershipTokyoDate(member.firstPaidAt)}</td>
                          <td className="px-4 py-3"><span className="rounded-full bg-moss/10 px-2.5 py-1 text-xs font-black text-moss">{t(member.cardStatus)}</span></td>
                          <td className="px-4 py-3 text-ink/60" data-no-i18n>{formatMembershipTokyoDate(member.expiresAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                <span className="text-xs font-black text-ink/45" data-no-i18n>{visible.members.page} / {totalPages}</span>
                <div className="flex gap-2">
                  <button className="rounded-xl border border-line px-3 py-2 text-xs font-black text-ink disabled:opacity-40" disabled={visible.members.page <= 1 || status === "loading"} onClick={() => parsed && updateUrl(parsed.query, parsed.search, visible.members.page - 1)} type="button">{t("上一页")}</button>
                  <button className="rounded-xl border border-line px-3 py-2 text-xs font-black text-ink disabled:opacity-40" disabled={visible.members.page >= totalPages || status === "loading"} onClick={() => parsed && updateUrl(parsed.query, parsed.search, visible.members.page + 1)} type="button">{t("下一页")}</button>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </Layout>
  );
}
