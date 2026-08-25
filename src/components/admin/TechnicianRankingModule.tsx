import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  backofficeRealDataApi,
  type BackofficeShopPayload,
  type BackofficeTechnicianRankingPayload,
  type BackofficeTechnicianRankingRowPayload,
  type TechnicianRankingPeriod,
  type TechnicianRankingQuery,
  type TechnicianRankingSortBy
} from "../../api/backofficeRealData";
import { downloadCsvExport } from "../../lib/downloadCsvExport";
import { languageLocales, translateText } from "../../i18n/translations";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

const periodOptions: Array<{ key: TechnicianRankingPeriod; label: string }> = [
  { key: "month", label: "本月" },
  { key: "today", label: "今日" },
  { key: "last7days", label: "近 7 天" },
  { key: "last30days", label: "近 30 天" },
  { key: "custom", label: "自定义" },
  { key: "all", label: "历史累计" }
];

const sortOptions: Array<{ key: TechnicianRankingSortBy; label: string }> = [
  { key: "revenue", label: "按服务金额" },
  { key: "completedOrders", label: "按完成订单" },
  { key: "workingDays", label: "按工作天数" }
];

const inputClassName =
  "h-10 rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink outline-none transition focus:border-moss focus:ring-2 focus:ring-mint/20";

function getTokyoCalendarDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${value.year}-${value.month}-${value.day}`;
}

function createEmptyRanking(): BackofficeTechnicianRankingPayload {
  return {
    list: [],
    summary: {
      technicianCount: 0,
      completedServiceAmountJpy: 0,
      completedOrderCount: 0,
      workingDayCount: 0
    },
    period: { key: "month", timeZone: "Asia/Tokyo", from: null, to: null },
    total: 0,
    page: 1,
    page_size: 20
  };
}

function initials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join("").toUpperCase() || "ND";
}

function rankTone(rank: number) {
  if (rank === 1) return "border-[#D4A72C] bg-[#FFF7D6] text-[#765500]";
  if (rank === 2) return "border-[#A8AFB8] bg-[#F1F3F5] text-[#59616B]";
  if (rank === 3) return "border-[#BB7A45] bg-[#FAE9DB] text-[#7A4522]";
  return "border-line bg-paper text-ink/60";
}

export function TechnicianRankingModule({
  shops,
  onSelectTechnician,
  refreshKey = 0
}: {
  shops: BackofficeShopPayload[];
  onSelectTechnician: (technicianProfileId: number) => void;
  refreshKey?: number;
}) {
  const { language } = useOptionalI18n();
  const translate = (text: string) => translateText(text, language);
  const today = useMemo(() => getTokyoCalendarDate(), []);
  const currentMonthStart = `${today.slice(0, 7)}-01`;
  const [period, setPeriod] = useState<TechnicianRankingPeriod>("month");
  const [customFromDraft, setCustomFromDraft] = useState(currentMonthStart);
  const [customToDraft, setCustomToDraft] = useState(today);
  const [customFrom, setCustomFrom] = useState(currentMonthStart);
  const [customTo, setCustomTo] = useState(today);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [cityDraft, setCityDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("");
  const [shopId, setShopId] = useState("");
  const [sortBy, setSortBy] = useState<TechnicianRankingSortBy>("revenue");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BackofficeTechnicianRankingPayload>(createEmptyRanking);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const query = useMemo<TechnicianRankingQuery>(
    () => ({
      period,
      ...(period === "custom" ? { from: customFrom, to: customTo } : {}),
      sortBy,
      sortOrder,
      ...(keyword ? { keyword } : {}),
      ...(shopId ? { shopId: Number(shopId) } : {}),
      ...(city ? { city } : {}),
      page,
      pageSize: 20
    }),
    [city, customFrom, customTo, keyword, page, period, shopId, sortBy, sortOrder]
  );

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    void backofficeRealDataApi
      .technicianRankings(query)
      .then((ranking) => {
        if (current) setData(ranking);
      })
      .catch((loadError: unknown) => {
        if (current) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [query, refreshKey, retryKey]);

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setKeyword(keywordDraft.trim());
    setCity(cityDraft.trim());
    setPage(1);
  };

  const applyCustomRange = () => {
    if (!customFromDraft || !customToDraft || customFromDraft > customToDraft) {
      setError(translate("请选择有效的自定义日期区间"));
      return;
    }
    setError("");
    setCustomFrom(customFromDraft);
    setCustomTo(customToDraft);
    setPeriod("custom");
    setPage(1);
  };

  const exportRanking = async () => {
    setExporting(true);
    setError("");
    try {
      const { page: _page, pageSize: _pageSize, ...exportQuery } = query;
      void _page;
      void _pageSize;
      downloadCsvExport(await backofficeRealDataApi.exportTechnicianRankings(exportQuery));
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  const maxRevenue = Math.max(1, ...data.list.map((row) => row.completedServiceAmountJpy));
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(languageLocales[language], {
        currency: "JPY",
        maximumFractionDigits: 0,
        style: "currency"
      }),
    [language]
  );
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(languageLocales[language]),
    [language]
  );
  const periodLabel = data.period.from && data.period.to
    ? `${data.period.from} — ${data.period.to}`
    : translate("历史累计");

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-line bg-white shadow-panel">
        <div className="border-b border-line bg-paper/80 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-moss">{translate("结算期间")}</p>
              <p className="mt-1 text-sm font-bold text-ink/55">{translate("按东京时区统计，默认显示本月")}</p>
            </div>
            <Button disabled={exporting || loading} onClick={() => void exportRanking()} size="sm" variant="dark">
              {exporting ? translate("正在导出...") : translate("导出 CSV")}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <button
                aria-pressed={period === option.key}
                className={`h-9 rounded-full border px-4 text-sm font-black transition ${
                  period === option.key
                    ? "border-moss bg-moss text-white"
                    : "border-line bg-white text-ink/65 hover:border-moss hover:text-moss"
                }`}
                key={option.key}
                onClick={() => {
                  if (option.key === "custom") {
                    applyCustomRange();
                  } else {
                    setPeriod(option.key);
                    setPage(1);
                  }
                }}
                type="button"
              >
                {translate(option.label)}
              </button>
            ))}
          </div>
          {period === "custom" ? (
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
              <label className="grid gap-1 text-xs font-black text-ink/55">
                {translate("开始日期")}
                <input className={inputClassName} max={customToDraft} onChange={(event) => setCustomFromDraft(event.target.value)} type="date" value={customFromDraft} />
              </label>
              <span className="pb-3 text-sm font-black text-ink/35">—</span>
              <label className="grid gap-1 text-xs font-black text-ink/55">
                {translate("结束日期")}
                <input className={inputClassName} min={customFromDraft} onChange={(event) => setCustomToDraft(event.target.value)} type="date" value={customToDraft} />
              </label>
              <Button onClick={applyCustomRange} size="sm" variant="secondary">{translate("应用期间")}</Button>
            </div>
          ) : null}
        </div>

        <form className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1fr)_180px_160px_auto]" onSubmit={applySearch}>
          <input
            aria-label={translate("搜索技师、邮箱或店铺")}
            className={inputClassName}
            onChange={(event) => setKeywordDraft(event.target.value)}
            placeholder={translate("搜索技师、邮箱或店铺")}
            value={keywordDraft}
          />
          <select
            aria-label={translate("筛选店铺")}
            className={inputClassName}
            onChange={(event) => {
              setShopId(event.target.value);
              setPage(1);
            }}
            value={shopId}
          >
            <option value="">{translate("全部店铺")}</option>
            {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </select>
          <input
            aria-label={translate("筛选城市")}
            className={inputClassName}
            onChange={(event) => setCityDraft(event.target.value)}
            placeholder={translate("城市")}
            value={cityDraft}
          />
          <Button type="submit">{translate("查询榜单")}</Button>
        </form>
      </section>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <span>{error}</span>
          <Button onClick={() => setRetryKey((value) => value + 1)} size="sm" variant="secondary">{translate("重试")}</Button>
        </div>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-3">
        {[
          {
            accent: "bg-moss",
            label: "已完成订单服务金额",
            note: "加钟金额计入原订单服务金额",
            value: currencyFormatter.format(data.summary.completedServiceAmountJpy)
          },
          {
            accent: "bg-lemon",
            label: "已完成订单数",
            note: "同一订单加钟仍计为 1 单",
            value: numberFormatter.format(data.summary.completedOrderCount)
          },
          {
            accent: "bg-mint",
            label: "工作天数",
            note: "至少完成 1 单计为 1 天",
            value: numberFormatter.format(data.summary.workingDayCount)
          }
        ].map((metric) => (
          <article className="relative overflow-hidden rounded-xl border border-line bg-white p-5 shadow-panel" key={metric.label}>
            <span className={`absolute inset-y-0 left-0 w-1.5 ${metric.accent}`} />
            <p className="text-sm font-black text-ink/55">{translate(metric.label)}</p>
            <strong className="mt-3 block text-3xl font-black tracking-tight text-ink">{metric.value}</strong>
            <p className="mt-2 text-xs font-bold text-ink/45">{translate(metric.note)}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-white shadow-panel">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-ink">{translate("技师业绩排行")}</h2>
              <Badge tone="green">{numberFormatter.format(data.summary.technicianCount)} {translate("位有完单技师")}</Badge>
            </div>
            <p className="mt-1 text-xs font-bold text-ink/45">{periodLabel} · Asia/Tokyo</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sortOptions.map((option) => (
              <button
                aria-pressed={sortBy === option.key}
                className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
                  sortBy === option.key ? "border-moss bg-mint/15 text-moss" : "border-line text-ink/55 hover:border-moss"
                }`}
                key={option.key}
                onClick={() => {
                  setSortBy(option.key);
                  setPage(1);
                }}
                type="button"
              >
                {translate(option.label)}
              </button>
            ))}
            <button
              className="rounded-lg border border-line px-3 py-2 text-xs font-black text-ink/55 transition hover:border-moss"
              onClick={() => {
                setSortOrder((value) => value === "desc" ? "asc" : "desc");
                setPage(1);
              }}
              type="button"
            >
              {sortOrder === "desc" ? translate("从高到低") : translate("从低到高")}
            </button>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead className="bg-paper/80 text-xs font-black uppercase tracking-wider text-ink/45">
              <tr>
                <th className="w-20 px-5 py-3">{translate("名次")}</th>
                <th className="px-4 py-3">{translate("技师")}</th>
                <th className="px-4 py-3">{translate("所属与地区")}</th>
                <th className="w-64 px-4 py-3">{translate("已完成订单服务金额")}</th>
                <th className="w-32 px-4 py-3 text-right">{translate("已完成订单数")}</th>
                <th className="w-28 px-4 py-3 text-right">{translate("工作天数")}</th>
                <th className="w-24 px-5 py-3 text-right">{translate("操作")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, index) => (
                  <tr className="border-t border-line" key={index}>
                    <td className="px-5 py-5" colSpan={7}><div className="h-12 animate-pulse rounded-lg bg-paper" /></td>
                  </tr>
                ))
              ) : data.list.length > 0 ? (
                data.list.map((row) => (
                  <RankingRow
                    currencyFormatter={currencyFormatter}
                    key={row.technicianProfileId}
                    maxRevenue={maxRevenue}
                    onSelectTechnician={onSelectTechnician}
                    row={row}
                    translate={translate}
                  />
                ))
              ) : (
                <tr className="border-t border-line">
                  <td className="px-5 py-16 text-center" colSpan={7}>
                    <p className="text-base font-black text-ink">{translate("当前期间暂无已完成订单")}</p>
                    <p className="mt-2 text-sm font-bold text-ink/45">{translate("切换期间或调整筛选条件后再试")}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/60 px-5 py-4">
          <p className="text-xs font-bold text-ink/50">
            {translate("共")} {numberFormatter.format(data.total)} {translate("位技师")} · {translate("第 {current} / {total} 页").replace("{current}", String(data.page)).replace("{total}", String(totalPages))}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} size="sm" variant="secondary">{translate("上一页")}</Button>
            <Button disabled={loading || page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} size="sm" variant="secondary">{translate("下一页")}</Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function RankingRow({
  row,
  maxRevenue,
  currencyFormatter,
  translate,
  onSelectTechnician
}: {
  row: BackofficeTechnicianRankingRowPayload;
  maxRevenue: number;
  currencyFormatter: Intl.NumberFormat;
  translate: (text: string) => string;
  onSelectTechnician: (technicianProfileId: number) => void;
}) {
  const revenueWidth = Math.max(4, Math.round((row.completedServiceAmountJpy / maxRevenue) * 100));

  return (
    <tr className="group border-t border-line transition hover:bg-paper/55">
      <td className="relative px-5 py-4 align-middle">
        <span className="absolute bottom-0 left-0 top-0 w-1 bg-moss/20 transition group-hover:bg-moss" />
        <span className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-sm font-black ${rankTone(row.rank)}`}>
          {row.rank}
        </span>
      </td>
      <td className="px-4 py-4 align-middle">
        <div className="flex items-center gap-3">
          {row.avatarUrl ? (
            <img alt="" className="h-10 w-10 rounded-full border border-line object-cover" src={row.avatarUrl} />
          ) : (
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink text-xs font-black text-white">{initials(row.displayName)}</span>
          )}
          <div className="min-w-0">
            <button className="block max-w-[230px] truncate font-black text-moss hover:underline" onClick={() => onSelectTechnician(row.technicianProfileId)} type="button">
              {row.displayName}
            </button>
            <p className="mt-0.5 max-w-[230px] truncate text-xs font-bold text-ink/40">{row.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 align-middle">
        <p className="max-w-[220px] truncate text-sm font-black text-ink">{row.shopName ?? translate("个人技师")}</p>
        <p className="mt-1 text-xs font-bold text-ink/45">{[row.city, row.serviceArea].filter(Boolean).join(" · ")}</p>
      </td>
      <td className="px-4 py-4 align-middle">
        <strong className="text-sm font-black text-ink">{currencyFormatter.format(row.completedServiceAmountJpy)}</strong>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
          <div className="h-full rounded-full bg-moss transition-all" style={{ width: `${revenueWidth}%` }} />
        </div>
      </td>
      <td className="px-4 py-4 text-right align-middle text-base font-black text-ink">{row.completedOrderCount}</td>
      <td className="px-4 py-4 text-right align-middle text-base font-black text-ink">{row.workingDayCount}</td>
      <td className="px-5 py-4 text-right align-middle">
        <button className="text-xs font-black text-moss hover:underline" onClick={() => onSelectTechnician(row.technicianProfileId)} type="button">{translate("查看详情")}</button>
      </td>
    </tr>
  );
}
