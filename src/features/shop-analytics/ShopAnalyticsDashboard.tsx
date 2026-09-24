import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload,
  type DashboardQuery,
  type DashboardBucketPayload,
  type DashboardPeriod
} from "../../api/backofficeRealData";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Customer, Order, Settlement, Store, Technician } from "../../types/domain";
import { cn, yen } from "../../lib/utils";
import { buildTrendCoordinates } from "../../lib/technicianWorkTrendChart";
import { translateText } from "../../i18n/translations";
import "./registerI18n";

type ShopDashboardLoader = typeof backofficeRealDataApi.dashboard;

export interface ShopAnalyticsDashboardProps {
  store: Store;
  stores?: Store[];
  technicians?: Technician[];
  customers?: Customer[];
  orders?: Order[];
  settlements?: Settlement[];
  personnelMonthlyCost?: number;
  surface?: "mobile" | "admin";
  className?: string;
  loadDashboard?: ShopDashboardLoader;
  initialPeriod?: DashboardPeriod;
  periodControl?: "buttons" | "select";
  periodSelectRef?: RefObject<HTMLSelectElement | null>;
}

const periodOptions: Array<{ label: string; value: DashboardPeriod }> = [
  { label: "今日", value: "today" },
  { label: "近7天", value: "last7days" },
  { label: "近30天", value: "last30days" },
  { label: "本周", value: "week" },
  { label: "本月", value: "month" },
  { label: "今年", value: "year" },
  { label: "自定义日期", value: "custom" }
];

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatCount(value: number) {
  return Math.round(value).toLocaleString("zh-CN");
}

const shopTrendDimensions = { width: 620, height: 260, left: 88, right: 70, top: 24, bottom: 54 };

function pointsAttribute(points: Array<{ x: number; y: number }>) {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

function buildShopTrendCoordinates(values: number[]) {
  const coordinates = buildTrendCoordinates(values, shopTrendDimensions);
  if (coordinates.length !== 1) return coordinates;
  const plotWidth = shopTrendDimensions.width - shopTrendDimensions.left - shopTrendDimensions.right;
  return [{ ...coordinates[0]!, x: shopTrendDimensions.left + plotWidth / 2 }];
}

function ShopAnalyticsTrend({ buckets }: { buckets: DashboardBucketPayload[] }) {
  const { language } = useOptionalI18n();
  const text = (source: string) => translateText(source, language);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showOrders, setShowOrders] = useState(true);
  const revenueCoordinates = useMemo(
    () => buildShopTrendCoordinates(buckets.map((bucket) => bucket.serviceGmvJpy)),
    [buckets]
  );
  const orderCoordinates = useMemo(
    () => buildShopTrendCoordinates(buckets.map((bucket) => bucket.orderCount)),
    [buckets]
  );
  const visibleLabelIndexes = useMemo(() => {
    const interval = Math.ceil(buckets.length / 6);
    return new Set(
      buckets.flatMap((_, index) => (
        buckets.length <= 8 || index === 0 || index === buckets.length - 1 || index % interval === 0
          ? [index]
          : []
      ))
    );
  }, [buckets]);
  const revenuePeak = Math.max(...buckets.map((bucket) => bucket.serviceGmvJpy), 0);
  const orderPeak = Math.max(...buckets.map((bucket) => bucket.orderCount), 0);
  const usableHeight = shopTrendDimensions.height - shopTrendDimensions.top - shopTrendDimensions.bottom;
  const revenueAxisTicks = [...new Set([revenuePeak, Math.round(revenuePeak / 2), 0])];
  const orderAxisTicks = [...new Set([orderPeak, Math.round(orderPeak / 2), 0])];

  if (buckets.length === 0) {
    return (
      <div className="grid min-h-36 place-items-center rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-bg)_72%,var(--client-primary)_8%)] text-sm font-black text-[color:var(--client-muted)]">
        暂无数据
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden" data-testid="shop-analytics-trend">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-black" data-no-i18n>{text("订单趋势")}</h3>
          <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]" data-no-i18n>
            {text("同一期间 · 双独立刻度")}
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] font-black text-[color:var(--client-muted)]" data-no-i18n>
          <p>{yen(revenuePeak)} {text("峰值")}</p>
          <p className="mt-1 text-[color:var(--client-accent)]">{formatCount(orderPeak)}{language === "zh" ? "单" : ` ${text("单")}`} {text("峰值")}</p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          aria-label={text("订单趋势")}
          className="h-auto w-full min-w-0 overflow-visible"
          data-no-i18n
          role="img"
          viewBox={`0 0 ${shopTrendDimensions.width} ${shopTrendDimensions.height}`}
        >
          {Array.from({ length: 3 }, (_, index) => {
            const y = shopTrendDimensions.top + (usableHeight / 2) * index;
            return (
              <line
                key={y}
                stroke="color-mix(in srgb, var(--client-line) 55%, transparent)"
                strokeDasharray="6 8"
                x1={shopTrendDimensions.left}
                x2={shopTrendDimensions.width - shopTrendDimensions.right}
                y1={y}
                y2={y}
              />
            );
          })}
          <g data-axis="revenue" fill="var(--client-primary)" fontSize="14" fontWeight="800" textAnchor="end">
            <line stroke="var(--client-primary)" strokeOpacity="0.65" x1={shopTrendDimensions.left} x2={shopTrendDimensions.left} y1={shopTrendDimensions.top} y2={shopTrendDimensions.top + usableHeight} />
            {revenueAxisTicks.map((tick) => (
              <text key={tick} x={shopTrendDimensions.left - 9} y={shopTrendDimensions.top + usableHeight * (1 - tick / Math.max(revenuePeak, 1)) + 5}>
                {yen(tick)}
              </text>
            ))}
          </g>
          <g data-axis="orders" fill="var(--client-accent)" fontSize="14" fontWeight="800" textAnchor="start">
            <line stroke="var(--client-accent)" strokeOpacity="0.65" x1={shopTrendDimensions.width - shopTrendDimensions.right} x2={shopTrendDimensions.width - shopTrendDimensions.right} y1={shopTrendDimensions.top} y2={shopTrendDimensions.top + usableHeight} />
            {orderAxisTicks.map((tick) => (
              <text key={tick} x={shopTrendDimensions.width - shopTrendDimensions.right + 9} y={shopTrendDimensions.top + usableHeight * (1 - tick / Math.max(orderPeak, 1)) + 5}>
                {formatCount(tick)}
              </text>
            ))}
          </g>
          {showRevenue ? (
            <g data-series="revenue">
              <polyline fill="none" points={pointsAttribute(revenueCoordinates)} stroke="var(--client-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              {revenueCoordinates.map((coordinate, index) => (
                <circle cx={coordinate.x} cy={coordinate.y} data-chart-node="true" fill="var(--client-bg)" key={buckets[index]?.key} r="6" stroke="var(--client-primary)" strokeWidth="4" />
              ))}
            </g>
          ) : null}
          {showOrders ? (
            <g data-series="orders">
              <polyline fill="none" points={pointsAttribute(orderCoordinates)} stroke="var(--client-accent)" strokeDasharray="10 9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
              {orderCoordinates.map((coordinate, index) => (
                <circle cx={coordinate.x} cy={coordinate.y} data-chart-node="true" fill="var(--client-bg)" key={buckets[index]?.key} r="5" stroke="var(--client-accent)" strokeWidth="3" />
              ))}
            </g>
          ) : null}
          {revenueCoordinates.map((coordinate, index) => visibleLabelIndexes.has(index) ? (
            <text fill="var(--client-muted)" fontSize="13" fontWeight="800" key={buckets[index]?.key} textAnchor="middle" x={coordinate.x} y={shopTrendDimensions.height - 18}>
              {buckets[index]?.label}
            </text>
          ) : null)}
        </svg>
      </div>

      <p className="mt-2 text-[11px] font-semibold leading-5 text-[color:var(--client-muted)]" data-no-i18n>
        {text("订单数含已确认至已完成订单；营业额仅计已完成且未退款订单。")}
      </p>

      <div aria-label={text("订单趋势图例")} className="mt-2 grid grid-cols-2 gap-2" data-no-i18n>
        <button
          aria-label={text(showRevenue ? "隐藏营业额趋势" : "显示营业额趋势")}
          aria-pressed={showRevenue}
          className={cn("focus-ring flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black", showRevenue ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)] opacity-65")}
          onClick={() => setShowRevenue((current) => !current)}
          type="button"
        >
          <span className="h-1 w-7 rounded-full bg-[color:var(--client-primary)]" />{text("营业额")}
        </button>
        <button
          aria-label={text(showOrders ? "隐藏订单数趋势" : "显示订单数趋势")}
          aria-pressed={showOrders}
          className={cn("focus-ring flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black", showOrders ? "border-[color:color-mix(in_srgb,var(--client-accent)_65%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-accent)_10%,transparent)] text-[color:var(--client-accent)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)] opacity-65")}
          onClick={() => setShowOrders((current) => !current)}
          type="button"
        >
          <span className="h-1 w-7 rounded-full bg-[color:var(--client-accent)]" />{text("订单数")}
        </button>
      </div>

      <table className="sr-only" data-no-i18n>
        <caption>订单趋势</caption>
        <thead><tr><th>时段</th><th>营业额</th><th>订单数</th></tr></thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.key}><th>{bucket.label}</th><td>{bucket.serviceGmvJpy}</td><td>{bucket.orderCount}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="shop-analytics-tile min-w-0 rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] px-3 py-3">
      <p className="truncate text-[11px] font-black text-[color:var(--client-muted)]">{label}</p>
      <strong className="mt-1 block truncate text-[17px] font-black tracking-[-0.03em] text-[color:var(--client-text)]" data-no-i18n>{value}</strong>
    </div>
  );
}

export function ShopAnalyticsDashboard({
  className,
  initialPeriod = "last7days",
  loadDashboard = backofficeRealDataApi.dashboard,
  periodControl = "buttons",
  periodSelectRef,
  store
}: ShopAnalyticsDashboardProps) {
  const { language } = useOptionalI18n();
  const text = (source: string) => translateText(source, language);
  const [period, setPeriod] = useState<DashboardPeriod>(initialPeriod);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [dashboard, setDashboard] = useState<BackofficeDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const customRangeError = useMemo(() => {
    if (period !== "custom") return null;
    if (!customFrom || !customTo || !isValidDate(customFrom) || !isValidDate(customTo)) {
      return "请选择开始日期和结束日期";
    }
    if (customFrom > customTo) return "开始日期不能晚于结束日期";
    return null;
  }, [customFrom, customTo, period]);
  const query = useMemo<DashboardQuery | null>(() => {
    if (period !== "custom") return { period };
    if (customRangeError) return null;
    return { period, from: customFrom, to: customTo };
  }, [customFrom, customRangeError, customTo, period]);

  useEffect(() => {
    if (!query) {
      setLoading(false);
      setFailed(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setDashboard(null);

    void loadDashboard("merchant-admin", query, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setDashboard(payload);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setLoading(false);
      });

    return () => controller.abort();
  }, [loadDashboard, query, requestVersion, store.id]);

  const metricTiles = useMemo(() => {
    if (!dashboard) return [];
    return [
      { label: "营业额", value: yen(dashboard.summary.serviceGmvJpy) },
      { label: "待处理订单", value: formatCount(dashboard.summary.pendingOrders) },
      { label: "在线技师", value: formatCount(dashboard.summary.activeTechnicians.current) },
      { label: "有效会员", value: dashboard.membership ? formatCount(dashboard.membership.memberCount) : "—" },
      { label: "正式可预约时段", value: formatCount(dashboard.summary.availableScheduleSlots.current) },
      { label: "NDP 成本", value: dashboard.finance.shopNdpCost ? `${formatCount(dashboard.finance.shopNdpCost.totalNdp)} NDP` : "—" }
    ];
  }, [dashboard]);

  return (
    <section className={cn("min-w-0 space-y-4", className)} aria-label="数据中心">
      <div className="shop-analytics-hero relative overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] p-4 text-[color:var(--client-text)] shadow-panel">
        <div className="shop-analytics-hero-overlay pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,color-mix(in_srgb,var(--client-primary)_30%,transparent),transparent_42%)]" />
        <div className="relative min-w-0">
          <p className="truncate text-[11px] font-black tracking-[0.08em] text-[color:var(--client-muted)]">
            <span>店铺 ID</span> <span data-no-i18n>{dashboard?.shop?.publicId ?? store.systemId}</span>
          </p>
          <h2 className="mt-1 truncate text-[22px] font-black tracking-[-0.04em]">{dashboard?.shop?.name ?? store.name}</h2>
          <p className="mt-2 text-xs font-bold text-[color:var(--client-muted)]">
            <span>经营数据</span><span data-no-i18n> · Asia/Tokyo</span>
          </p>
        </div>
      </div>

      {periodControl === "select" ? (
        <div className="shop-analytics-filter-panel rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] p-2 shadow-panel">
          <label className="sr-only" htmlFor="shop-analytics-period">{text("选择数据期间")}</label>
          <select
            aria-label={text("选择数据期间")}
            className="focus-ring h-10 w-full rounded-xl bg-transparent px-3 text-sm font-black text-[color:var(--client-text)]"
            id="shop-analytics-period"
            onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
            ref={periodSelectRef}
            value={period}
          >
            {periodOptions.map((option) => <option key={option.value} value={option.value}>{text(option.label)}</option>)}
          </select>
        </div>
      ) : (
        <div className="shop-analytics-filter-panel flex min-w-0 gap-1 overflow-x-auto rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] p-1 shadow-panel">
          {periodOptions.map((option) => (
            <button
              aria-pressed={period === option.value}
              className={cn(
                "focus-ring h-10 min-w-[70px] flex-1 shrink-0 rounded-full px-3 text-xs font-black transition",
                period === option.value
                  ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_8px_20px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                  : "shop-analytics-control-inactive text-[color:var(--client-muted)]"
              )}
              key={option.value}
              onClick={() => setPeriod(option.value)}
              type="button"
            >
              {text(option.label)}
            </button>
          ))}
        </div>
      )}

      {period === "custom" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-black text-[color:var(--client-muted)]">
            <span>{text("开始日期")}</span>
            <input aria-label={text("开始日期")} className="focus-ring h-11 rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 text-sm text-[color:var(--client-text)]" onChange={(event) => setCustomFrom(event.target.value)} type="date" value={customFrom} />
          </label>
          <label className="grid gap-1 text-xs font-black text-[color:var(--client-muted)]">
            <span>{text("结束日期")}</span>
            <input aria-label={text("结束日期")} className="focus-ring h-11 rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 text-sm text-[color:var(--client-text)]" onChange={(event) => setCustomTo(event.target.value)} type="date" value={customTo} />
          </label>
        </div>
      ) : null}

      {customRangeError ? <p className="text-sm font-bold text-[color:var(--client-accent)]" role="alert">{text(customRangeError)}</p> : null}

      {loading ? (
        <div aria-busy="true" className="shop-analytics-panel grid min-h-56 place-items-center rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-sm font-black text-[color:var(--client-muted)] shadow-panel">
          经营数据
        </div>
      ) : failed ? (
        <div className="shop-analytics-panel rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-center text-[color:var(--client-text)] shadow-panel" role="alert">
          <h3 className="text-base font-black">本店分析快照加载失败</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">本店分析数据加载失败，请检查网络后重试</p>
          <button
            className="focus-ring mt-4 h-10 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-needo-text)]"
            onClick={() => setRequestVersion((value) => value + 1)}
            type="button"
          >
            重新加载
          </button>
        </div>
      ) : dashboard && !customRangeError ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {metricTiles.map((metric) => <MetricTile key={metric.label} {...metric} />)}
          </div>
          <section className="shop-analytics-chart-panel min-w-0 overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-line))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_12%,transparent),transparent_40%),linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_94%,var(--client-bg)),color-mix(in_srgb,var(--client-elevated)_72%,var(--client-bg)))] p-4 text-[color:var(--client-text)] shadow-panel">
            <ShopAnalyticsTrend buckets={dashboard.series.buckets} />
            <p className="mt-3 text-center text-[10px] font-bold text-[color:var(--client-soft-muted)]" data-no-i18n>
              {dashboard.filter.from} - {dashboard.filter.to}
            </p>
          </section>
        </>
      ) : null}
    </section>
  );
}
