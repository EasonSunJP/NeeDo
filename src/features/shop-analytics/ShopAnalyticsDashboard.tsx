import { useEffect, useMemo, useState } from "react";
import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload,
  type DashboardBucketPayload,
  type DashboardPeriod
} from "../../api/backofficeRealData";
import type { Customer, Order, Settlement, Store, Technician } from "../../types/domain";
import { cn, yen } from "../../lib/utils";
import { buildTrendCoordinates } from "../../lib/technicianWorkTrendChart";

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
}

const periodOptions: Array<{ label: string; value: DashboardPeriod }> = [
  { label: "今日", value: "today" },
  { label: "近7天", value: "last7days" },
  { label: "近30天", value: "last30days" },
  { label: "本月", value: "month" }
];

function formatCount(value: number) {
  return Math.round(value).toLocaleString("zh-CN");
}

const shopTrendDimensions = { width: 620, height: 260, left: 42, right: 24, top: 24, bottom: 54 };

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
          <h3 className="text-[17px] font-black">订单趋势</h3>
          <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">
            同一期间 · 双独立刻度
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] font-black text-[color:var(--client-muted)]">
          <p>{yen(revenuePeak)} 峰值</p>
          <p className="mt-1 text-[color:var(--client-accent)]">{formatCount(orderPeak)}单 峰值</p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          aria-label="订单趋势"
          className="h-auto min-w-[520px] overflow-visible"
          role="img"
          viewBox={`0 0 ${shopTrendDimensions.width} ${shopTrendDimensions.height}`}
        >
          {Array.from({ length: 4 }, (_, index) => {
            const y = shopTrendDimensions.top + (usableHeight / 3) * index;
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

      <div aria-label="订单趋势图例" className="mt-2 grid grid-cols-2 gap-2">
        <button
          aria-label={`${showRevenue ? "隐藏" : "显示"}营业额趋势`}
          aria-pressed={showRevenue}
          className={cn("focus-ring flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black", showRevenue ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)] opacity-65")}
          onClick={() => setShowRevenue((current) => !current)}
          type="button"
        >
          <span className="h-1 w-7 rounded-full bg-[color:var(--client-primary)]" />营业额
        </button>
        <button
          aria-label={`${showOrders ? "隐藏" : "显示"}订单数趋势`}
          aria-pressed={showOrders}
          className={cn("focus-ring flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black", showOrders ? "border-[color:color-mix(in_srgb,var(--client-accent)_65%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-accent)_10%,transparent)] text-[color:var(--client-accent)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)] opacity-65")}
          onClick={() => setShowOrders((current) => !current)}
          type="button"
        >
          <span className="h-1 w-7 rounded-full bg-[color:var(--client-accent)]" />订单数
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
  loadDashboard = backofficeRealDataApi.dashboard,
  store
}: ShopAnalyticsDashboardProps) {
  const [period, setPeriod] = useState<DashboardPeriod>("last7days");
  const [requestVersion, setRequestVersion] = useState(0);
  const [dashboard, setDashboard] = useState<BackofficeDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setDashboard(null);

    void loadDashboard("merchant-admin", { period }, { signal: controller.signal })
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
  }, [loadDashboard, period, requestVersion, store.id]);

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
            {option.label}
          </button>
        ))}
      </div>

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
      ) : dashboard ? (
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
