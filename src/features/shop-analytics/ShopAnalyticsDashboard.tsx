import { useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AppIcon, floatingHeaderControlButtonClassName, type IconName } from "../../components/client-ui/AppScaffold";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ChartPointerTooltip, resolveChartPointerState, type ChartPointerState } from "../../components/ui/ChartPointerTooltip";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { cn, percent, statusLabel, yen } from "../../lib/utils";
import { getClientThemeClassName, getClientThemeModeClassName, useClientTheme } from "../../theme/ClientThemeProvider";
import type { Customer, Order, OrderStatus, Settlement, Store, Technician } from "../../types/domain";
import {
  buildShopAnalyticsOverview,
  canUseShopAnalyticsGranularity,
  createDefaultShopAnalyticsFilter,
  createPreviousPeriodShopAnalyticsFilter,
  createShopAnalyticsPresetFilter,
  getScopedShopOrders,
  normalizeShopAnalyticsFilter,
  shopAnalyticsMaxRangeDays,
  type AnalyticsFilterState,
  type AnalyticsGranularity,
  type AnalyticsMetricStatus,
  type AnalyticsOrderType,
  type AnalyticsRangePreset,
  type CastRankItem,
  type DashboardAlert,
  type FinanceBreakdownItem,
  type FunnelStep,
  type MetricValue,
  type ShopAnalyticsOverview,
  type TimeSeriesPoint
} from "./model";

type ShopAnalyticsTab = "overview" | "orders" | "casts" | "customers" | "finance";
type DashboardSurface = "mobile" | "admin";
type SummaryMetricKey =
  | "grossRevenue"
  | "netProfit"
  | "completedOrders"
  | "completionRate"
  | "avgOrderValue"
  | "cancellationRate"
  | "onlineCasts"
  | "ndpCost";
type DrilldownState = {
  title: string;
  description: string;
  orders?: Order[];
  settlements?: Settlement[];
  cast?: CastRankItem;
  casts?: CastRankItem[];
  alerts?: DashboardAlert[];
};
const drilldownMaxOrderDays = 7;

export interface ShopAnalyticsDashboardProps {
  store: Store;
  stores: Store[];
  technicians: Technician[];
  customers: Customer[];
  orders: Order[];
  settlements: Settlement[];
  personnelMonthlyCost?: number;
  surface?: DashboardSurface;
  className?: string;
}

const presetOptions: Array<{ label: string; value: AnalyticsRangePreset }> = [
  { label: "今日", value: "today" },
  { label: "本周", value: "week" },
  { label: "本月", value: "month" },
  { label: "近7天", value: "last7" },
  { label: "近30天", value: "last30" }
];

const granularityOptions: Array<{ label: string; value: AnalyticsGranularity }> = [
  { label: "时", value: "hour" },
  { label: "日", value: "day" },
  { label: "周", value: "week" },
  { label: "月", value: "month" }
];

const tabOptions: Array<{ label: string; value: ShopAnalyticsTab }> = [
  { label: "总览", value: "overview" },
  { label: "订单", value: "orders" },
  { label: "技师", value: "casts" },
  { label: "客户", value: "customers" },
  { label: "财务", value: "finance" }
];

const orderTypeOptions: Array<{ label: string; value: AnalyticsOrderType }> = [
  { label: "Booking", value: "booking" },
  { label: "Request", value: "request" }
];

const orderStatusOptions: Array<{ label: string; value: OrderStatus }> = [
  { label: "待确认", value: "pending" },
  { label: "已确认", value: "confirmed" },
  { label: "待服务", value: "scheduled" },
  { label: "服务中", value: "inService" },
  { label: "已完成", value: "completed" },
  { label: "取消/退款", value: "cancelled" },
  { label: "退款中", value: "refunding" },
  { label: "已退款", value: "refunded" }
];

const summaryMetricConfigs: Array<{
  key: SummaryMetricKey;
  label: string;
  icon: IconName;
  description: string;
}> = [
  { key: "grossRevenue", label: "营业额", icon: "sparkles", description: "按当前周期统计可计入经营额的订单流水。" },
  { key: "netProfit", label: "净收益", icon: "star", description: "扣除技师分成、返佣、补差和 NDP 成本后的经营收益。" },
  { key: "completedOrders", label: "完单数", icon: "check", description: "当前周期内已完成并进入结算口径的订单数。" },
  { key: "completionRate", label: "完单率", icon: "shield", description: "已完成订单占创建订单的比例，用于判断履约健康度。" },
  { key: "avgOrderValue", label: "客单价", icon: "heart", description: "营业额除以有效订单后的平均单价。" },
  { key: "cancellationRate", label: "取消率", icon: "bell", description: "取消、退款中、已退款订单占创建订单的比例。" },
  { key: "onlineCasts", label: "在线技师", icon: "globe", description: "当前店铺范围内非离线技师供给。" },
  { key: "ndpCost", label: "NDP 成本", icon: "palette", description: "Booking / Request 完单及人工介入产生的平台 NDP 成本。" }
];

function getSummaryMetricConfig(key: SummaryMetricKey) {
  return summaryMetricConfigs.find((item) => item.key === key) ?? summaryMetricConfigs[0]!;
}

function getStatusTone(status?: AnalyticsMetricStatus): BadgeTone {
  if (status === "danger") {
    return "red";
  }

  if (status === "warning") {
    return "yellow";
  }

  return "green";
}

function formatMetricValue(metric: MetricValue) {
  if (metric.unit === "jpy") {
    return yen(metric.value);
  }

  if (metric.unit === "percent") {
    return percent(metric.value);
  }

  if (metric.unit === "minutes") {
    return `${Math.round(metric.value)} 分`;
  }

  if (metric.unit === "ndp") {
    return `${Math.round(metric.value).toLocaleString("zh-CN")} NDP`;
  }

  return Math.round(metric.value).toLocaleString("zh-CN");
}

function formatMetricByUnit(value: number, unit: MetricValue["unit"]) {
  if (unit === "jpy") {
    return yen(value);
  }

  if (unit === "percent") {
    return percent(value);
  }

  if (unit === "minutes") {
    return `${Math.round(value)} 分`;
  }

  if (unit === "ndp") {
    return `${Math.round(value).toLocaleString("zh-CN")} NDP`;
  }

  return Math.round(value).toLocaleString("zh-CN");
}

function formatSignedMetric(metric: MetricValue) {
  const delta = metric.delta ?? 0;
  const absDelta = Math.abs(delta);
  const prefix = delta > 0 ? "+" : delta < 0 ? "-" : "";

  if (metric.unit === "jpy") {
    return `${prefix}${yen(absDelta)}`;
  }

  if (metric.unit === "percent") {
    return `${prefix}${percent(absDelta)}`;
  }

  if (metric.unit === "minutes") {
    return `${prefix}${Math.round(absDelta)} 分`;
  }

  if (metric.unit === "ndp") {
    return `${prefix}${Math.round(absDelta).toLocaleString("zh-CN")} NDP`;
  }

  return `${prefix}${Math.round(absDelta).toLocaleString("zh-CN")}`;
}

function getGranularityTitle(granularity: AnalyticsGranularity) {
  if (granularity === "hour") {
    return "按小时";
  }

  if (granularity === "day") {
    return "按日";
  }

  if (granularity === "week") {
    return "按周";
  }

  return "按月";
}

function getSummaryMetric(overview: ShopAnalyticsOverview, key: SummaryMetricKey) {
  return overview.summary[key];
}

function getMetricPointValue(point: TimeSeriesPoint, key: SummaryMetricKey, overview: ShopAnalyticsOverview) {
  if (key === "grossRevenue") {
    return point.grossRevenue;
  }

  if (key === "netProfit") {
    return point.netProfit;
  }

  if (key === "completedOrders") {
    return point.completedOrders;
  }

  if (key === "completionRate") {
    return point.createdOrders === 0 ? 0 : (point.completedOrders / point.createdOrders) * 100;
  }

  if (key === "avgOrderValue") {
    return point.grossRevenue === 0 ? 0 : Math.round(point.grossRevenue / Math.max(1, point.completedOrders || point.createdOrders - point.cancelledOrders));
  }

  if (key === "cancellationRate") {
    return point.createdOrders === 0 ? 0 : (point.cancelledOrders / point.createdOrders) * 100;
  }

  if (key === "onlineCasts") {
    return Math.max(0, overview.summary.onlineCasts.value - (point.cancelledOrders > 0 ? 1 : 0) + (point.completedOrders > 2 ? 1 : 0));
  }

  return point.ndpCost;
}

function formatDeltaPercent(metric: MetricValue) {
  const deltaPercent = metric.deltaPercent ?? 0;
  const prefix = deltaPercent > 0 ? "+" : "";

  return `${prefix}${deltaPercent.toFixed(1)}%`;
}

function toggleStringValue<T extends string>(items: T[] | undefined, value: T) {
  const current = items ?? [];

  if (current.includes(value)) {
    const next = current.filter((item) => item !== value);

    return next.length > 0 ? next : undefined;
  }

  return [...current, value];
}

function downloadCsv(filename: string, rows: string[][]) {
  if (typeof window === "undefined") {
    return;
  }

  const body = rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, "\"\"")}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const analyticsControlActiveClassName =
  "shop-analytics-control-active border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_26%,transparent)]";
const analyticsControlInactiveClassName =
  "shop-analytics-control-inactive border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_74%,transparent)] text-[color:var(--client-muted)] hover:bg-[color:var(--client-primary-soft)] hover:text-[color:var(--client-primary-strong)]";
const analyticsPanelToneClassName =
  "shop-analytics-panel border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] text-[color:var(--client-text)] shadow-panel";
const analyticsTileToneClassName =
  "shop-analytics-tile bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] text-[color:var(--client-text)]";
const analyticsTrackToneClassName =
  "shop-analytics-track bg-[color:color-mix(in_srgb,var(--client-bg)_72%,var(--client-primary)_8%)]";

function DownloadTrayIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
      <path d="M12 4.5v9.2" stroke="currentColor" strokeLinecap="round" strokeWidth="2.6" />
      <path d="m7.8 9.8 4.2 4.2 4.2-4.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" />
      <path d="M5 13.8v3a2.7 2.7 0 0 0 2.7 2.7h8.6a2.7 2.7 0 0 0 2.7-2.7v-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" />
    </svg>
  );
}

function AnalyticsSegmentedControl<T extends string>({
  items,
  value,
  onChange,
  disabledValues = [],
  compact = false,
  dark = false
}: {
  items: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
  disabledValues?: T[];
  compact?: boolean;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border p-1 backdrop-blur-xl",
        compact ? "h-10" : "h-11",
        dark
          ? "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--client-primary)_10%,transparent),0_14px_34px_rgba(0,0,0,0.18)]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)]"
      )}
    >
      {items.map((item) => {
        const disabled = disabledValues.includes(item.value);

        return (
          <button
            aria-disabled={disabled}
            aria-pressed={!disabled && value === item.value}
            className={cn(
              "focus-ring h-full shrink-0 rounded-full px-3 text-xs font-black transition",
              compact ? "min-w-12" : "min-w-[64px]",
              disabled
                ? "cursor-not-allowed border-transparent bg-transparent text-[color:color-mix(in_srgb,var(--client-muted)_42%,transparent)] opacity-45"
                : value === item.value
                  ? dark
                    ? analyticsControlActiveClassName
                    : "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                  : dark
                    ? "text-[color:var(--client-muted)] hover:bg-[color:var(--client-primary-soft)] hover:text-[color:var(--client-primary-strong)]"
                    : "text-[color:var(--client-muted)] hover:bg-[color:var(--client-primary-soft)] hover:text-[color:var(--client-primary-strong)]"
            )}
            disabled={disabled}
            key={item.value}
            onClick={() => onChange(item.value)}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function AnalyticsKpiCard({
  label,
  metric,
  onClick
}: {
  label: string;
  metric: MetricValue;
  onClick: () => void;
}) {
  const positive = (metric.delta ?? 0) >= 0;

  return (
    <button
      className={cn("focus-ring min-w-0 rounded-[22px] border px-4 py-4 text-left transition hover:-translate-y-0.5", analyticsPanelToneClassName)}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-black text-[color:var(--client-muted)]">{label}</p>
        <Badge tone={getStatusTone(metric.status)}>{metric.status === "danger" ? "风险" : metric.status === "warning" ? "关注" : "正常"}</Badge>
      </div>
      <strong className="mt-2 block truncate text-[21px] font-black tracking-[-0.03em] text-[color:var(--client-text)]">{formatMetricValue(metric)}</strong>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full px-2 py-1 text-[11px] font-black", positive ? "bg-mint/18 text-[#2f6846]" : "bg-coral/12 text-[#a63f32]")}>
          {formatDeltaPercent(metric)}
        </span>
        <span className="text-[11px] font-bold text-[color:var(--client-soft-muted)]">{formatSignedMetric(metric)}</span>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[36px] text-xs leading-[18px] text-[color:var(--client-muted)]">{metric.explanation}</p>
    </button>
  );
}

function AnalyticsCard({
  title,
  caption,
  children,
  action
}: {
  title: string;
  caption?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 max-w-full overflow-hidden rounded-[26px] border p-4", analyticsPanelToneClassName)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <TitleWithInfo
            as="h3"
            info={caption}
            label={`${title}说明`}
            title={title}
            titleClassName="text-[17px] font-black tracking-[-0.02em] text-[color:var(--client-text)]"
            variant="dark"
          />
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function getCompactTrendLabel(label: string) {
  const [, hourLabel] = label.split(" ");

  return hourLabel ?? label;
}

function TrendBars({
  points,
  mode,
  onPointSelect
}: {
  points: TimeSeriesPoint[];
  mode: "revenue" | "orders" | "ndp";
  onPointSelect?: (point: TimeSeriesPoint) => void;
}) {
  const maxVisiblePointCount = 30;
  const scrollable = points.length > maxVisiblePointCount;
  const chartMinWidth = scrollable ? `${(points.length / maxVisiblePointCount) * 100}%` : undefined;
  const maxValue = Math.max(
    1,
    ...points.map((point) => {
      if (mode === "orders") {
        return point.createdOrders;
      }

      if (mode === "ndp") {
        return point.ndpCost;
      }

      return point.grossRevenue;
    })
  );
  const labelStep = points.length <= 12 ? 1 : points.length <= maxVisiblePointCount ? Math.ceil(points.length / 10) : Math.ceil(points.length / 12);
  const [activePoint, setActivePoint] = useState<ChartPointerState | null>(null);
  const activeIndex = activePoint?.index ?? -1;
  const activeSeriesPoint = activeIndex >= 0 ? points[activeIndex] : undefined;
  const chartWidth = 320;
  const chartHeight = 170;
  const chartLeft = 16;
  const chartRight = 16;
  const chartTop = 14;
  const chartBottom = 28;
  const chartPlotWidth = chartWidth - chartLeft - chartRight;
  const chartPlotHeight = chartHeight - chartTop - chartBottom;
  const barWidth = 7;
  const xFor = (index: number) => chartLeft + (chartPlotWidth * index) / Math.max(1, points.length - 1);
  const isHourlyFullDay = points.length === 24 && points.every((point) => point.label.includes("时"));
  const gradientId = `shop-analytics-trend-${mode}`;
  const getPointValue = (point: TimeSeriesPoint) => {
    if (mode === "orders") {
      return point.createdOrders;
    }

    if (mode === "ndp") {
      return point.ndpCost;
    }

    return point.grossRevenue;
  };
  const getBarHeight = (point: TimeSeriesPoint) => Math.max(8, Math.round((getPointValue(point) / maxValue) * chartPlotHeight));
  const formatPointValue = (point: TimeSeriesPoint) => {
    const value = getPointValue(point);

    if (mode === "revenue") {
      return yen(value);
    }

    if (mode === "ndp") {
      return `${value.toLocaleString("zh-CN")} NDP`;
    }

    return `${value} 单`;
  };
  const updateActivePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const nextPoint = resolveChartPointerState(event, {
      height: chartHeight,
      pointCount: points.length,
      width: chartWidth,
      xFor
    });

    if (nextPoint) {
      setActivePoint(nextPoint);
      onPointSelect?.(points[nextPoint.index]);
    }
  };

  return (
    <div className="min-w-0 max-w-full">
      <div
        className="scrollbar-none min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        <div
          className={cn("relative h-[170px] w-full min-w-0 touch-pan-x rounded-[22px]", analyticsTrackToneClassName)}
          style={{ minWidth: chartMinWidth }}
        >
          <svg
            aria-label={`${mode === "revenue" ? "营业额" : mode === "orders" ? "订单" : "NDP"}趋势柱状图`}
            className="block h-full w-full cursor-crosshair select-none overflow-visible"
            onPointerDown={updateActivePoint}
            onPointerMove={(event) => {
              if (event.pointerType === "mouse") {
                updateActivePoint(event);
              }
            }}
            preserveAspectRatio="none"
            role="img"
            style={{ touchAction: "pan-y" }}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          >
            <defs>
              {mode === "orders" ? (
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#d8f4ff" />
                  <stop offset="34%" stopColor="#8bd9ff" />
                  <stop offset="100%" stopColor="#4f9bc7" />
                </linearGradient>
              ) : mode === "ndp" ? (
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#fff0bc" />
                  <stop offset="38%" stopColor="#f3cf78" />
                  <stop offset="100%" stopColor="#d49427" />
                </linearGradient>
              ) : (
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="color-mix(in srgb, var(--client-primary) 70%, white)" />
                  <stop offset="42%" stopColor="var(--client-primary)" />
                  <stop offset="100%" stopColor="color-mix(in srgb, var(--client-primary) 62%, #070816)" />
                </linearGradient>
              )}
            </defs>
            <rect fill="transparent" height={chartHeight} width={chartWidth} />
            {[0, 0.25, 0.5, 0.75].map((ratio) => {
              const y = chartTop + chartPlotHeight * ratio;

              return <line key={ratio} stroke="color-mix(in srgb,var(--client-line) 72%,transparent)" strokeDasharray="4 4" strokeWidth="1" x1={chartLeft} x2={chartWidth - chartRight} y1={y} y2={y} />;
            })}
            {points.map((point, index) => {
              const height = getBarHeight(point);
              const x = xFor(index);
              const y = chartTop + chartPlotHeight - height;

              return (
                <g key={point.bucket}>
                  <rect
                    fill={`url(#${gradientId})`}
                    height={height}
                    opacity={getPointValue(point) === 0 ? 0.74 : 1}
                    rx={barWidth / 2}
                    width={barWidth}
                    x={x - barWidth / 2}
                    y={y}
                  />
                  <rect
                    fill="rgba(255,255,255,0.28)"
                    height={Math.min(height, Math.max(4, height * 0.46))}
                    rx={barWidth / 2}
                    width={Math.max(2, barWidth * 0.28)}
                    x={x + barWidth * 0.12}
                    y={y}
                  />
                </g>
              );
            })}
            {activeSeriesPoint ? (
              <rect
                fill="none"
                height={getBarHeight(activeSeriesPoint) + 5}
                rx={(barWidth + 5) / 2}
                stroke="color-mix(in srgb,var(--client-primary) 62%,white)"
                strokeWidth="1.8"
                width={barWidth + 5}
                x={xFor(activeIndex) - (barWidth + 5) / 2}
                y={chartTop + chartPlotHeight - getBarHeight(activeSeriesPoint) - 2.5}
              />
            ) : null}
            {points.map((point, index) => {
              if (index % labelStep !== 0 || (isHourlyFullDay && index === points.length - 1)) {
                return null;
              }

              return (
                <text fill="var(--client-muted)" fontSize="9" fontWeight="900" key={`${point.bucket}-label`} textAnchor="middle" x={xFor(index)} y={chartHeight - 8}>
                  {getCompactTrendLabel(point.label)}
                </text>
              );
            })}
          </svg>
          <ChartPointerTooltip
            dark
            items={activeSeriesPoint ? [
              {
                label: activeSeriesPoint.label,
                value: formatPointValue(activeSeriesPoint),
                detail: `${activeSeriesPoint.completedOrders} 完单 · ${activeSeriesPoint.cancelledOrders} 取消`,
                color: mode === "orders" ? "#8bd9ff" : mode === "ndp" ? "#f3cf78" : "var(--client-primary)"
              }
            ] : []}
            state={activePoint}
            strategy="fixed"
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniLegend label="营业额" value={yen(points.reduce((sum, point) => sum + point.grossRevenue, 0))} />
        <MiniLegend label="完单" value={`${points.reduce((sum, point) => sum + point.completedOrders, 0)} 单`} />
        <MiniLegend label="取消" value={`${points.reduce((sum, point) => sum + point.cancelledOrders, 0)} 单`} />
      </div>
    </div>
  );
}

function MiniLegend({ label, value }: { label: string; value: string }) {
  return (
    <div className="shop-analytics-mini-legend min-w-0 rounded-[16px] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] px-3 py-2">
      <p className="truncate text-[10px] font-bold text-[color:var(--client-soft-muted)]">{label}</p>
      <strong className="mt-1 block truncate text-xs font-black text-[color:var(--client-text)]">{value}</strong>
    </div>
  );
}

function addTrendDays(date: string, days: number) {
  const [year = "2026", month = "1", day = "1"] = date.split("-");
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  value.setUTCDate(value.getUTCDate() + days);

  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function getOrderDate(order: Order) {
  return order.bookedAt.slice(0, 10);
}

function getOneWeekOrderWindow(orders: Order[]) {
  if (orders.length === 0) {
    return { endDate: "", orders, startDate: "" };
  }

  const sortedOrders = [...orders].sort((left, right) => right.bookedAt.localeCompare(left.bookedAt));
  const endDate = getOrderDate(sortedOrders[0]);
  const startDate = addTrendDays(endDate, -(drilldownMaxOrderDays - 1));

  return {
    endDate,
    orders: sortedOrders.filter((order) => {
      const orderDate = getOrderDate(order);

      return orderDate >= startDate && orderDate <= endDate;
    }),
    startDate
  };
}

function orderMatchesSearch(order: Order, query: string) {
  const keyword = query.trim().toLowerCase();

  if (!keyword) {
    return true;
  }

  return [
    order.orderNo,
    order.itemName,
    order.customerName,
    order.area,
    order.city,
    statusLabel(order.status),
    order.bookedAt,
    String(order.amount)
  ].some((value) => value.toLowerCase().includes(keyword));
}

function orderMatchesDateSearch(order: Order, startDate: string, endDate: string) {
  const orderDate = getOrderDate(order);

  if (startDate && orderDate < startDate) {
    return false;
  }

  if (endDate && orderDate > endDate) {
    return false;
  }

  return true;
}

function getOrderDrilldownDescription(description: string, orderWindow: ReturnType<typeof getOneWeekOrderWindow> | null) {
  if (!orderWindow?.startDate || /\d{4}-\d{2}-\d{2}/.test(description)) {
    return description;
  }

  const rangeLabel = orderWindow.startDate === orderWindow.endDate
    ? orderWindow.endDate
    : `${orderWindow.startDate} - ${orderWindow.endDate}`;

  return `${description} · ${rangeLabel}`;
}

function getTrendPointOrders(overview: ShopAnalyticsOverview, point: TimeSeriesPoint) {
  const { granularity } = overview.filters;

  if (granularity === "hour") {
    const hourBucket = point.bucket.slice(0, 13);

    return overview.scopedOrders.filter((order) => order.bookedAt.startsWith(hourBucket));
  }

  if (granularity === "day") {
    const dateBucket = point.bucket.slice(0, 10);

    return overview.scopedOrders.filter((order) => order.bookedAt.startsWith(dateBucket));
  }

  if (granularity === "week") {
    const startDate = point.bucket.slice(0, 10);
    const endDate = addTrendDays(startDate, 6);

    return overview.scopedOrders.filter((order) => {
      const orderDate = order.bookedAt.slice(0, 10);

      return orderDate >= startDate && orderDate <= endDate;
    });
  }

  const monthBucket = point.bucket.slice(0, 7);

  return overview.scopedOrders.filter((order) => order.bookedAt.startsWith(monthBucket));
}

function MetricLineChart({
  points,
  comparePoints,
  metricKey,
  overview,
  compareOverview,
  compareEnabled
}: {
  points: TimeSeriesPoint[];
  comparePoints: TimeSeriesPoint[];
  metricKey: SummaryMetricKey;
  overview: ShopAnalyticsOverview;
  compareOverview: ShopAnalyticsOverview;
  compareEnabled: boolean;
}) {
  const metric = getSummaryMetric(overview, metricKey);
  const values = points.map((point) => getMetricPointValue(point, metricKey, overview));
  const compareValues = comparePoints.map((point) => getMetricPointValue(point, metricKey, compareOverview));
  const visibleCompareValues = compareEnabled ? compareValues : [];
  const maxValue = Math.max(1, ...values, ...visibleCompareValues);
  const width = 360;
  const height = 260;
  const paddingX = 28;
  const paddingY = 28;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingY * 2;
  const xFor = (index: number, length: number) => paddingX + (plotWidth * index) / Math.max(1, length - 1);
  const yFor = (value: number) => paddingY + plotHeight - (Math.max(0, value) / maxValue) * plotHeight;
  const linePath = (source: number[]) => source.map((value, index) => `${index === 0 ? "M" : "L"} ${xFor(index, source.length)} ${yFor(value)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(points.length / 7));
  const [activePoint, setActivePoint] = useState<ChartPointerState | null>(null);
  const [pointerDown, setPointerDown] = useState(false);
  const activeIndex = activePoint?.index ?? -1;
  const activeSeriesPoint = activeIndex >= 0 ? points[activeIndex] : undefined;
  const activeComparePoint = compareEnabled && activeIndex >= 0 ? comparePoints[activeIndex] : undefined;
  const activeValue = activeIndex >= 0 ? values[activeIndex] : undefined;
  const activeCompareValue = compareEnabled && activeIndex >= 0 ? compareValues[activeIndex] : undefined;
  const updateActivePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const nextPoint = resolveChartPointerState(event, {
      width,
      height,
      pointCount: points.length,
      xFor: (index) => xFor(index, points.length)
    });

    if (nextPoint) {
      setActivePoint(nextPoint);
    }
  };

  return (
    <div className="shop-analytics-chart-panel overflow-visible rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_88%,transparent),color-mix(in_srgb,var(--client-bg)_92%,var(--client-primary)_8%))] p-3 text-[color:var(--client-text)] shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <MiniLegend label="当前周期" value={formatMetricValue(metric)} />
        <MiniLegend label="前一周期" value={compareEnabled ? formatMetricValue(getSummaryMetric(compareOverview, metricKey)) : "未开启"} />
      </div>
      <div className="relative min-w-0">
        <svg
          aria-label={`${getSummaryMetricConfig(metricKey).label}趋势图`}
          className="block h-auto w-full cursor-crosshair select-none"
          height={height}
          onPointerCancel={(event) => {
            setPointerDown(false);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerDown={(event) => {
            setPointerDown(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
            updateActivePoint(event);
          }}
          onPointerLeave={() => {
            if (!pointerDown) {
              setActivePoint(null);
            }
          }}
          onPointerMove={(event) => {
            if (pointerDown || event.pointerType === "mouse") {
              updateActivePoint(event);
            }
          }}
          onPointerUp={(event) => {
            setPointerDown(false);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            updateActivePoint(event);
          }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          style={{ touchAction: "pan-y" }}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
        >
          <rect fill="transparent" height={height} width={width} x="0" y="0" />
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = paddingY + plotHeight * ratio;

            return (
              <line
                key={ratio}
                stroke="var(--client-line)"
                strokeDasharray="3 5"
                strokeWidth="1"
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
              />
            );
          })}
          {points.map((point, index) => {
            if (index % labelStep !== 0 && index !== points.length - 1) {
              return null;
            }

            const x = xFor(index, points.length);

            return (
              <text fill="var(--client-muted)" fontSize="11" fontWeight="800" key={point.bucket} textAnchor="middle" x={x} y={height - 7}>
                {point.label}
              </text>
            );
          })}
          {compareEnabled && visibleCompareValues.length > 0 ? (
            <path d={linePath(visibleCompareValues)} fill="none" stroke="var(--client-muted)" strokeDasharray="8 8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          ) : null}
          {values.length > 0 ? (
            <path d={linePath(values)} fill="none" stroke="var(--client-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
          ) : null}
          {activeSeriesPoint && activeValue !== undefined ? (
            <line
              stroke="color-mix(in_srgb,var(--client-primary)_72%,white)"
              strokeDasharray="3 5"
              strokeWidth="1"
              x1={xFor(activeIndex, points.length)}
              x2={xFor(activeIndex, points.length)}
              y1={paddingY}
              y2={height - paddingY}
            />
          ) : null}
          {values.map((value, index) => (
            <g key={`${points[index]?.bucket ?? index}-${value}`}>
              <circle cx={xFor(index, values.length)} cy={yFor(value)} fill="var(--client-bg)" r="6" stroke="var(--client-primary)" strokeWidth="4" />
              <title>{`${points[index]?.label ?? ""} ${formatMetricByUnit(value, metric.unit)}`}</title>
            </g>
          ))}
          {activeComparePoint && activeCompareValue !== undefined ? (
            <circle
              cx={xFor(activeIndex, compareValues.length)}
              cy={yFor(activeCompareValue)}
              fill="var(--client-bg)"
              r="5.5"
              stroke="var(--client-muted)"
              strokeDasharray="3 3"
              strokeWidth="3"
            />
          ) : null}
          {activeSeriesPoint && activeValue !== undefined ? (
            <circle
              cx={xFor(activeIndex, values.length)}
              cy={yFor(activeValue)}
              fill="var(--client-primary)"
              r="7.5"
              stroke="color-mix(in_srgb,var(--client-bg)_78%,white)"
              strokeWidth="3"
            />
          ) : null}
        </svg>
        <ChartPointerTooltip
          dark
          items={[
            ...(activeSeriesPoint && activeValue !== undefined
              ? [
                  {
                    color: "var(--client-primary)",
                    detail: activeSeriesPoint.label,
                    label: "当前周期",
                    value: formatMetricByUnit(activeValue, metric.unit)
                  }
                ]
              : []),
            ...(activeComparePoint && activeCompareValue !== undefined
              ? [
                  {
                    color: "var(--client-muted)",
                    detail: activeComparePoint.label,
                    label: "对比曲线",
                    muted: true,
                    value: formatMetricByUnit(activeCompareValue, metric.unit)
                  }
                ]
              : [])
          ]}
          state={activePoint}
          strategy="fixed"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black">
        <span className="rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-[color:var(--client-primary-strong)]">当前周期</span>
        {compareEnabled ? <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] px-2.5 py-1 text-[color:var(--client-muted)]">前 1 个周期</span> : null}
      </div>
    </div>
  );
}

function FunnelChart({
  steps,
  onStepClick
}: {
  steps: FunnelStep[];
  onStepClick: (step: FunnelStep) => void;
}) {
  const max = Math.max(1, ...steps.map((step) => step.count));

  return (
    <div className="min-w-0 space-y-2.5">
      {steps.map((step) => (
        <button className="focus-ring grid w-full min-w-0 grid-cols-[minmax(66px,84px),minmax(0,1fr),minmax(34px,54px)] items-center gap-3 text-left" key={step.key} onClick={() => onStepClick(step)} type="button">
          <span className="min-w-0 truncate text-xs font-black text-[color:var(--client-muted)]">{step.label}</span>
          <span className={cn("h-9 overflow-hidden rounded-full", analyticsTrackToneClassName)}>
            <span
              className={cn(
                "block h-full rounded-full",
                step.key === "cancelled" ? "bg-coral" : step.key === "completed" ? "bg-moss" : "bg-[color:var(--client-primary)]"
              )}
              style={{ width: `${Math.max(8, (step.count / max) * 100)}%` }}
            />
          </span>
          <span className="text-right text-xs font-black text-[color:var(--client-text)]">{step.count}</span>
        </button>
      ))}
    </div>
  );
}

function CastRankingList({
  casts,
  onCastClick
}: {
  casts: CastRankItem[];
  onCastClick: (cast: CastRankItem) => void;
}) {
  return (
    <div className="space-y-3">
      {casts.map((cast, index) => (
        <button
          className={cn("focus-ring flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left", analyticsTileToneClassName)}
          key={cast.castId}
          onClick={() => onCastClick(cast)}
          type="button"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary-soft)] text-xs font-black text-[color:var(--client-primary-strong)]">{index + 1}</span>
          <AvatarImage alt={cast.castName} className="h-12 w-12 rounded-full" src={cast.avatar} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-[color:var(--client-text)]">{cast.castName}</span>
            <span className="mt-1 block truncate text-xs font-semibold text-[color:var(--client-muted)]">
              {cast.completedOrders} 单 · {yen(cast.revenue)} · 评分 {cast.rating.toFixed(2)}
            </span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={cast.riskLabel === "健康" ? "green" : cast.ndpStatus === "negative" ? "red" : "yellow"}>{cast.riskLabel}</Badge>
              <Badge tone="neutral">NDP {cast.ndpBalance}</Badge>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function AlertList({
  alerts
}: {
  alerts: DashboardAlert[];
}) {
  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <article className={cn("rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-3 py-3", analyticsTileToneClassName)} key={alert.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={alert.severity === "high" || alert.severity === "critical" ? "red" : alert.severity === "warning" ? "yellow" : "blue"}>
                  {alert.severity === "high" || alert.severity === "critical" ? "高风险" : alert.severity === "warning" ? "预警" : "提示"}
                </Badge>
                <span className="truncate text-xs font-bold text-[color:var(--client-soft-muted)]">{alert.target}</span>
              </div>
              <h4 className="mt-2 text-sm font-black text-[color:var(--client-text)]">{alert.title}</h4>
              <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{alert.message}</p>
              <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]">{alert.suggestion}</p>
            </div>
          </div>
          <div className="mt-3">
            <Button className="w-full" size="sm" to={alert.actionTo} variant="secondary">{alert.actionLabel}</Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function FinanceBreakdown({
  items
}: {
  items: FinanceBreakdownItem[];
}) {
  const max = Math.max(1, ...items.map((item) => Math.abs(item.amount)));

  return (
    <div className="min-w-0 space-y-2.5">
      {items.map((item) => (
        <div className="grid min-w-0 grid-cols-[minmax(72px,96px),minmax(0,1fr),minmax(64px,86px)] items-center gap-3" key={item.key}>
          <span className="min-w-0 truncate text-xs font-black text-[color:var(--client-muted)]">{item.label}</span>
          <span className={cn("h-8 overflow-hidden rounded-full", analyticsTrackToneClassName)}>
            <span
              className={cn("block h-full rounded-full", item.type === "income" ? "bg-moss" : item.type === "net" ? "bg-ink" : "bg-coral")}
              style={{ width: `${Math.max(8, (Math.abs(item.amount) / max) * 100)}%` }}
              title={item.explanation}
            />
          </span>
          <strong className={cn("text-right text-xs font-black", item.amount < 0 ? "text-coral" : "text-[color:var(--client-text)]")}>{yen(item.amount)}</strong>
        </div>
      ))}
    </div>
  );
}

function OrderStatusStrip({ orders }: { orders: Order[] }) {
  const statuses = [
    { label: "待确认", count: orders.filter((order) => order.status === "pending").length, tone: "yellow" as BadgeTone },
    { label: "待服务", count: orders.filter((order) => order.status === "scheduled" || order.status === "confirmed").length, tone: "blue" as BadgeTone },
    { label: "服务中", count: orders.filter((order) => order.status === "inService").length, tone: "green" as BadgeTone },
    { label: "已完成", count: orders.filter((order) => order.status === "completed").length, tone: "green" as BadgeTone },
    { label: "取消/退款", count: orders.filter((order) => ["cancelled", "refunding", "refunded"].includes(order.status)).length, tone: "red" as BadgeTone }
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {statuses.map((item) => (
        <div className={cn("rounded-[18px] px-3 py-3", analyticsTileToneClassName)} key={item.label}>
          <Badge tone={item.tone}>{item.label}</Badge>
          <strong className="mt-2 block text-lg font-black text-[color:var(--client-text)]">{item.count}</strong>
        </div>
      ))}
    </div>
  );
}

function RecentOrderList({ orders, limit = 8 }: { orders: Order[]; limit?: number }) {
  if (orders.length === 0) {
    return (
      <div className={cn("rounded-[22px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-6 text-center text-sm font-bold text-[color:var(--client-muted)]", analyticsTileToneClassName)}>
        当前筛选下暂无订单。
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {orders.slice(0, limit).map((order) => (
        <Link className={cn("flex items-start justify-between gap-3 rounded-[20px] px-3 py-3", analyticsTileToneClassName)} key={order.id} to={`/merchant/orders/${order.id}`}>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-[color:var(--client-text)]">{order.itemName}</span>
            <span className="mt-1 block truncate text-xs font-semibold text-[color:var(--client-muted)]">
              {order.bookedAt} · {order.customerName} · {order.area}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <strong className="block text-sm font-black text-[color:var(--client-text)]">{yen(order.amount)}</strong>
            <Badge className="mt-1" tone={["cancelled", "refunding", "refunded"].includes(order.status) ? "red" : order.status === "completed" ? "green" : "yellow"}>
              {statusLabel(order.status)}
            </Badge>
          </span>
        </Link>
      ))}
    </div>
  );
}

function getCastTrendValue(point: TimeSeriesPoint, mode: "income" | "work") {
  return mode === "income" ? point.grossRevenue : point.completedOrders;
}

function CastTrendSparkline({ cast }: { cast: CastRankItem }) {
  const revenueValues = cast.incomeTrend.map((point) => point.grossRevenue);
  const workValues = cast.workTrend.map((point) => point.completedOrders);
  const maxRevenue = Math.max(1, ...revenueValues);
  const maxWork = Math.max(1, ...workValues);
  const width = 150;
  const height = 54;
  const left = 6;
  const right = 6;
  const top = 6;
  const bottom = 12;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xFor = (index: number, length: number) => left + (plotWidth * index) / Math.max(1, length - 1);
  const yRevenue = (value: number) => top + plotHeight - (value / maxRevenue) * plotHeight;
  const linePath = revenueValues.map((value, index) => `${index === 0 ? "M" : "L"} ${xFor(index, revenueValues.length)} ${yRevenue(value)}`).join(" ");
  const barWidth = Math.max(4, plotWidth / Math.max(1, workValues.length) - 3);

  return (
    <svg aria-label={`${cast.castName}收入和工作趋势`} className="h-[54px] w-full min-w-0" preserveAspectRatio="none" role="img" viewBox={`0 0 ${width} ${height}`}>
      {workValues.map((value, index) => {
        const barHeight = Math.max(3, (value / maxWork) * 20);
        const x = xFor(index, workValues.length) - barWidth / 2;
        const y = height - bottom - barHeight;

        return <rect fill="color-mix(in_srgb,var(--client-primary)_32%,transparent)" height={barHeight} key={`${cast.castId}-work-${index}`} rx="2" width={barWidth} x={x} y={y} />;
      })}
      {linePath ? <path d={linePath} fill="none" stroke="var(--client-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null}
    </svg>
  );
}

function CastTrendChart({
  title,
  points,
  mode
}: {
  title: string;
  points: TimeSeriesPoint[];
  mode: "income" | "work";
}) {
  const values = points.map((point) => getCastTrendValue(point, mode));
  const maxValue = Math.max(1, ...values);
  const width = 320;
  const height = 178;
  const left = 24;
  const right = 16;
  const top = 18;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xFor = (index: number, length: number) => left + (plotWidth * index) / Math.max(1, length - 1);
  const yFor = (value: number) => top + plotHeight - (value / maxValue) * plotHeight;
  const linePath = values.map((value, index) => `${index === 0 ? "M" : "L"} ${xFor(index, values.length)} ${yFor(value)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const total = values.reduce((sum, value) => sum + value, 0);
  const [activePoint, setActivePoint] = useState<ChartPointerState | null>(null);
  const [pointerDown, setPointerDown] = useState(false);
  const activeIndex = activePoint?.index ?? -1;
  const activeSeriesPoint = activeIndex >= 0 ? points[activeIndex] : undefined;
  const activeValue = activeIndex >= 0 ? values[activeIndex] : undefined;
  const updateActivePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const nextPoint = resolveChartPointerState(event, {
      width,
      height,
      pointCount: points.length,
      xFor: (index) => xFor(index, points.length)
    });

    if (nextPoint) {
      setActivePoint(nextPoint);
    }
  };

  return (
    <div className={cn("rounded-[24px] p-3", analyticsTileToneClassName)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-[color:var(--client-muted)]">{title}</p>
        <strong className="text-sm font-black text-[color:var(--client-text)]">{mode === "income" ? yen(total) : `${total} 单`}</strong>
      </div>
      <div className="relative mt-2">
        <svg
          aria-label={title}
          className="block h-auto w-full cursor-crosshair select-none"
          height={height}
          onPointerCancel={(event) => {
            setPointerDown(false);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerDown={(event) => {
            setPointerDown(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
            updateActivePoint(event);
          }}
          onPointerLeave={() => {
            if (!pointerDown) {
              setActivePoint(null);
            }
          }}
          onPointerMove={(event) => {
            if (pointerDown || event.pointerType === "mouse") {
              updateActivePoint(event);
            }
          }}
          onPointerUp={(event) => {
            setPointerDown(false);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            updateActivePoint(event);
          }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          style={{ touchAction: "pan-y" }}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
        >
          <rect fill="transparent" height={height} width={width} x="0" y="0" />
          {[0, 0.5, 1].map((ratio) => {
            const y = top + plotHeight * ratio;

            return <line key={ratio} stroke="var(--client-line)" strokeDasharray="3 5" strokeWidth="1" x1={left} x2={width - right} y1={y} y2={y} />;
          })}
          {mode === "work"
            ? values.map((value, index) => {
                const barWidth = Math.max(6, plotWidth / Math.max(1, values.length) - 4);
                const barHeight = Math.max(5, (value / maxValue) * plotHeight);

                return (
                  <rect
                    fill="color-mix(in_srgb,var(--client-primary)_35%,transparent)"
                    height={barHeight}
                    key={`${points[index]?.bucket ?? index}-bar`}
                    rx="3"
                    width={barWidth}
                    x={xFor(index, values.length) - barWidth / 2}
                    y={top + plotHeight - barHeight}
                  />
                );
              })
            : null}
          {linePath ? <path d={linePath} fill="none" stroke="var(--client-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" /> : null}
          {activeSeriesPoint && activeValue !== undefined ? (
            <line
              stroke="color-mix(in_srgb,var(--client-primary)_58%,var(--client-muted))"
              strokeDasharray="3 5"
              strokeWidth="1"
              x1={xFor(activeIndex, points.length)}
              x2={xFor(activeIndex, points.length)}
              y1={top}
              y2={height - bottom}
            />
          ) : null}
          {values.map((value, index) => (
            <circle cx={xFor(index, values.length)} cy={yFor(value)} fill="var(--client-bg)" key={`${points[index]?.bucket ?? index}-dot`} r="3.4" stroke="var(--client-primary)" strokeWidth="2" />
          ))}
          {activeSeriesPoint && activeValue !== undefined ? (
            <circle
              cx={xFor(activeIndex, values.length)}
              cy={yFor(activeValue)}
              fill="var(--client-primary)"
              r="6.2"
              stroke="var(--client-bg)"
              strokeWidth="2.5"
            />
          ) : null}
          {points.map((point, index) => {
            if (index % labelStep !== 0 && index !== points.length - 1) {
              return null;
            }

            return (
              <text fill="var(--client-muted)" fontSize="10" fontWeight="800" key={`${point.bucket}-label`} textAnchor="middle" x={xFor(index, points.length)} y={height - 7}>
                {getCompactTrendLabel(point.label)}
              </text>
            );
          })}
        </svg>
        <ChartPointerTooltip
          items={
            activeSeriesPoint && activeValue !== undefined
              ? [
                  {
                    color: "var(--client-primary)",
                    detail: activeSeriesPoint.label,
                    label: mode === "income" ? "收入" : "工作",
                    value: mode === "income" ? yen(activeValue) : `${activeValue} 单`
                  }
                ]
              : []
          }
          state={activePoint}
          strategy="fixed"
        />
      </div>
    </div>
  );
}

function CastTrendSummaryList({
  casts,
  onCastClick
}: {
  casts: CastRankItem[];
  onCastClick: (cast: CastRankItem) => void;
}) {
  return (
    <div className="space-y-3">
      {casts.slice(0, 6).map((cast) => (
        <button
          className={cn("focus-ring grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[22px] px-3 py-3 text-left", analyticsTileToneClassName)}
          key={cast.castId}
          onClick={() => onCastClick(cast)}
          type="button"
        >
          <AvatarImage alt={cast.castName} className="h-11 w-11 rounded-full" src={cast.avatar} />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-black text-[color:var(--client-text)]">{cast.castName}</span>
              <span className="shrink-0 text-xs font-black text-[color:var(--client-primary-strong)]">{yen(cast.revenue)}</span>
            </span>
            <span className="mt-1 flex items-center gap-2 text-[11px] font-bold text-[color:var(--client-muted)]">
              <span>{cast.completedOrders} 单</span>
              <span>服务 {cast.serviceMinutes} 分</span>
              <span>在线 {cast.onlineMinutes} 分</span>
            </span>
            <span className="mt-2 block min-w-0">
              <CastTrendSparkline cast={cast} />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function CastInsightDetail({ cast }: { cast: CastRankItem }) {
  const utilization = cast.onlineMinutes === 0 ? 0 : (cast.serviceMinutes / cast.onlineMinutes) * 100;

  return (
    <div className="space-y-4">
      <section className={cn("rounded-[26px] p-4", analyticsTileToneClassName)}>
        <div className="flex items-center gap-3">
          <AvatarImage alt={cast.castName} className="h-14 w-14 rounded-full" src={cast.avatar} />
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-lg font-black text-[color:var(--client-text)]">{cast.castName}</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={cast.riskLabel === "健康" ? "green" : cast.ndpStatus === "negative" ? "red" : "yellow"}>{cast.riskLabel}</Badge>
              <Badge tone="neutral">评分 {cast.rating.toFixed(2)}</Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            ["本期收入", yen(cast.revenue)],
            ["完成订单", `${cast.completedOrders} 单`],
            ["工作利用率", percent(utilization)],
            ["NDP余额", `${cast.ndpBalance} NDP`]
          ].map(([label, value]) => (
            <div className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-bg)_72%,var(--client-primary)_8%)] px-3 py-3" key={label}>
              <p className="text-[11px] font-bold text-[color:var(--client-soft-muted)]">{label}</p>
              <strong className="mt-1 block truncate text-sm font-black text-[color:var(--client-text)]">{value}</strong>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[color:var(--client-muted)]">{cast.suggestion}</p>
      </section>

      <CastTrendChart mode="income" points={cast.incomeTrend} title="收入趋势" />
      <CastTrendChart mode="work" points={cast.workTrend} title="工作趋势" />
    </div>
  );
}

function getSettlementStatusTone(status: Settlement["status"]): BadgeTone {
  if (status === "paid") {
    return "green";
  }

  if (status === "reviewing") {
    return "yellow";
  }

  return "blue";
}

function getSettlementStatusLabel(status: Settlement["status"]) {
  if (status === "paid") {
    return "已支付";
  }

  if (status === "reviewing") {
    return "复核中";
  }

  return "待确认";
}

function SettlementList({ settlements }: { settlements: Settlement[] }) {
  if (settlements.length === 0) {
    return (
      <div className={cn("rounded-[22px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-6 text-center text-sm font-bold text-[color:var(--client-muted)]", analyticsTileToneClassName)}>
        当前没有待确认账单。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {settlements.map((settlement) => (
        <article className={cn("rounded-[22px] px-3 py-3", analyticsTileToneClassName)} key={settlement.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[color:var(--client-text)]">{settlement.merchantName}</p>
              <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{settlement.period}</p>
            </div>
            <Badge tone={getSettlementStatusTone(settlement.status)}>{getSettlementStatusLabel(settlement.status)}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniLegend label="总额" value={yen(settlement.grossAmount)} />
            <MiniLegend label="可结算" value={yen(settlement.payableAmount)} />
            <MiniLegend label="平台费" value={yen(settlement.platformFee)} />
            <MiniLegend label="退款" value={yen(settlement.refundAmount)} />
          </div>
        </article>
      ))}
    </div>
  );
}

function CustomerSegmentChart({ overview }: { overview: ShopAnalyticsOverview }) {
  return (
    <div className="space-y-3">
      {overview.customerSegments.map((segment) => (
        <div className={cn("rounded-[20px] px-3 py-3", analyticsTileToneClassName)} key={segment.key}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-[color:var(--client-text)]">{segment.label}</p>
              <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{segment.count} 人 · {yen(segment.revenue)}</p>
            </div>
            <Badge tone={getStatusTone(segment.tone)}>{percent(segment.share)}</Badge>
          </div>
          <div className={cn("mt-3 h-2 overflow-hidden rounded-full", analyticsTrackToneClassName)}>
            <div className="h-full rounded-full bg-[color:var(--client-primary)]" style={{ width: `${Math.max(4, segment.share)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardFilterSheet({
  open,
  draft,
  storeOptions,
  castOptions,
  areaOptions,
  surface,
  onClose,
  onChange,
  onApply,
  onReset
}: {
  open: boolean;
  draft: AnalyticsFilterState;
  storeOptions: Store[];
  castOptions: Technician[];
  areaOptions: string[];
  surface: DashboardSurface;
  onClose: () => void;
  onChange: (next: AnalyticsFilterState) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const { theme } = useClientTheme();
  const setDraftDate = (key: "startDate" | "endDate", value: string) => {
    onChange(normalizeShopAnalyticsFilter(
      { ...draft, [key]: value, preset: "custom" },
      { anchor: key === "endDate" ? "end" : "start", forceDefaultGranularity: true }
    ));
  };

  if (!open) {
    return null;
  }

  const sheet = (
    <div
      className={cn(
        "client-shell merchant-analytics-clean-shell shop-analytics-filter-page fixed inset-0 z-[190] h-[100dvh] w-screen overflow-hidden bg-[color:var(--client-bg)] text-[color:var(--client-text)]",
        surface === "admin" && "merchant-admin-analytics-surface",
        getClientThemeModeClassName(theme),
        getClientThemeClassName(theme)
      )}
    >
      <section className="safe-screen-shell relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--client-bg)]">
        <MobileFullscreenHeader
          className="!border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] !bg-[color:var(--client-bg)] !shadow-none !backdrop-blur-none"
          closeLabel="关闭经营筛选"
          dark
          onClose={onClose}
          title="经营筛选"
        />
        <main className="scrollbar-none min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-36 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0">
              <span className="text-xs font-black text-[color:var(--client-muted)]">开始日期</span>
              <input
                className="mt-2 h-11 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_78%,transparent)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none accent-[color:var(--client-primary)]"
                onChange={(event) => setDraftDate("startDate", event.target.value)}
                type="date"
                value={draft.startDate}
              />
            </label>
            <label className="min-w-0">
              <span className="text-xs font-black text-[color:var(--client-muted)]">结束日期</span>
              <input
                className="mt-2 h-11 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_78%,transparent)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none accent-[color:var(--client-primary)]"
                onChange={(event) => setDraftDate("endDate", event.target.value)}
                type="date"
                value={draft.endDate}
              />
            </label>
          </div>

          <FilterChipGroup
            label="店铺"
            options={storeOptions.map((store) => ({ label: store.name, value: store.id }))}
            selected={draft.shopIds}
            onToggle={(value) => onChange({ ...draft, shopIds: toggleStringValue(draft.shopIds, value) })}
          />
          <FilterChipGroup
            label="技师"
            options={castOptions.slice(0, 12).map((technician) => ({ label: technician.nickname ? `${technician.nickname}/${technician.name}` : technician.name, value: technician.id }))}
            selected={draft.castIds}
            onToggle={(value) => onChange({ ...draft, castIds: toggleStringValue(draft.castIds, value) })}
          />
          <FilterChipGroup
            label="订单类型"
            options={orderTypeOptions}
            selected={draft.orderTypes}
            onToggle={(value) => onChange({ ...draft, orderTypes: toggleStringValue(draft.orderTypes, value as AnalyticsOrderType) })}
          />
          <FilterChipGroup
            label="订单状态"
            options={orderStatusOptions}
            selected={draft.orderStatuses}
            onToggle={(value) => onChange({ ...draft, orderStatuses: toggleStringValue(draft.orderStatuses, value as OrderStatus) })}
          />
          <FilterChipGroup
            label="区域"
            options={areaOptions.map((area) => ({ label: area, value: area }))}
            selected={draft.areas}
            onToggle={(value) => onChange({ ...draft, areas: toggleStringValue(draft.areas, value) })}
          />
          <div>
            <p className="text-xs font-black text-[color:var(--client-muted)]">人工介入</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { label: "全部", value: null },
                { label: "只看介入", value: true },
                { label: "排除介入", value: false }
              ].map((item) => (
                <button
                  aria-pressed={draft.manualIntervention === item.value}
                  className={cn("focus-ring h-10 rounded-full border text-xs font-black", draft.manualIntervention === item.value ? analyticsControlActiveClassName : analyticsControlInactiveClassName)}
                  key={item.label}
                  onClick={() => onChange({ ...draft, manualIntervention: item.value })}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </main>
        <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_58%,transparent)_24%,color-mix(in_srgb,var(--client-bg)_92%,transparent)_56%,var(--client-bg)_100%)] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-14">
          <div className="pointer-events-auto grid grid-cols-2 gap-3">
            <Button onClick={onReset} variant="secondary">重置</Button>
            <Button onClick={onApply}>应用筛选</Button>
          </div>
        </footer>
      </section>
    </div>
  );

  if (surface === "admin" || typeof document === "undefined") {
    return sheet;
  }

  return createPortal(sheet, document.body);
}

function FilterChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle
}: {
  label: string;
  options: Array<{ label: string; value: T }>;
  selected?: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div>
      <p className="text-xs font-black text-[color:var(--client-muted)]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected?.includes(option.value) ?? false;

          return (
            <button
              aria-pressed={active}
              className={cn("focus-ring rounded-full border px-3 py-2 text-xs font-black", active ? analyticsControlActiveClassName : analyticsControlInactiveClassName)}
              key={option.value}
              onClick={() => onToggle(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AnalyticsFullscreenHeader({
  title,
  info,
  subtitle,
  actions,
  onClose
}: {
  title: ReactNode;
  info?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  return (
    <MobileFullscreenHeader
      action={actions}
      closeLabel="关闭数据中心详情"
      info={info}
      onClose={onClose}
      showSpacer={false}
      subtitle={subtitle}
      title={title}
    />
  );
}

function DrilldownDrawer({
  state,
  surface,
  onClose
}: {
  state: DrilldownState | null;
  surface: DashboardSurface;
  onClose: () => void;
}) {
  const { theme } = useClientTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStartDate, setSearchStartDate] = useState("");
  const [searchEndDate, setSearchEndDate] = useState("");

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchStartDate("");
    setSearchEndDate("");
  }, [state]);

  if (!state) {
    return null;
  }

  const orderWindow = state.orders ? getOneWeekOrderWindow(state.orders) : null;
  const visibleOrders = orderWindow?.orders.filter((order) => orderMatchesSearch(order, searchQuery) && orderMatchesDateSearch(order, searchStartDate, searchEndDate)) ?? [];
  const orderDescription = getOrderDrilldownDescription(state.description, orderWindow);
  const content = (
    <>
      <AnalyticsFullscreenHeader
        actions={state.orders ? (
          <button
            aria-label="搜索订单"
            aria-pressed={searchOpen}
            className={cn(floatingHeaderControlButtonClassName, searchOpen ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]" : "text-[color:var(--client-muted)] hover:text-[color:var(--client-primary-strong)]")}
            onClick={() => setSearchOpen((value) => !value)}
            type="button"
          >
            <AppIcon className="h-5 w-5" name="search" />
          </button>
        ) : null}
        onClose={onClose}
        subtitle={orderDescription}
        title={state.title}
      />
      {state.orders && searchOpen ? (
        <div className="shrink-0 space-y-3 border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+86px)]">
          <label className="flex h-11 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] px-4">
            <AppIcon className="h-4 w-4 shrink-0 text-[color:var(--client-muted)]" name="search" />
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-soft-muted)]"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索订单、客户、区域、状态"
              value={searchQuery}
            />
            <span className="shrink-0 text-[11px] font-black text-[color:var(--client-soft-muted)]">{visibleOrders.length} 单</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-[11px] font-black text-[color:var(--client-soft-muted)]">开始时间</span>
              <input
                className="h-11 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none accent-[color:var(--client-primary)]"
                max={searchEndDate || undefined}
                onChange={(event) => setSearchStartDate(event.target.value)}
                onInput={(event) => setSearchStartDate(event.currentTarget.value)}
                type="date"
                value={searchStartDate}
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black text-[color:var(--client-soft-muted)]">结束时间</span>
              <input
                className="h-11 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none accent-[color:var(--client-primary)]"
                min={searchStartDate || undefined}
                onChange={(event) => setSearchEndDate(event.target.value)}
                onInput={(event) => setSearchEndDate(event.currentTarget.value)}
                type="date"
                value={searchEndDate}
              />
            </label>
          </div>
        </div>
      ) : null}
      <main className={cn("scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]", state.orders && searchOpen ? "pt-4" : "pt-[calc(env(safe-area-inset-top)+86px)]")}>
        {state.cast ? <CastInsightDetail cast={state.cast} /> : null}
        {state.orders ? <RecentOrderList limit={visibleOrders.length} orders={visibleOrders} /> : null}
        {state.settlements ? <SettlementList settlements={state.settlements} /> : null}
        {state.casts ? <CastRankingList casts={state.casts} onCastClick={() => undefined} /> : null}
        {state.alerts ? <AlertList alerts={state.alerts} /> : null}
      </main>
    </>
  );

  if (surface === "mobile") {
    return <MobileFullscreenPage>{content}</MobileFullscreenPage>;
  }

  const page = (
    <div
      className={cn(
        "client-shell merchant-analytics-clean-shell fixed inset-0 z-[10000] h-[100dvh] w-screen overflow-hidden bg-[color:var(--client-bg)] text-[color:var(--client-text)]",
        surface === "admin" && "merchant-admin-analytics-surface",
        getClientThemeModeClassName(theme),
        getClientThemeClassName(theme)
      )}
      style={{ height: "100dvh", inset: 0, position: "fixed", width: "100vw", zIndex: 10000 }}
    >
      <section className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[color:var(--client-bg)]">
        {content}
      </section>
    </div>
  );

  if (surface === "admin" || typeof document === "undefined") {
    return page;
  }

  return createPortal(page, document.body);
}

function MetricInsightPage({
  metricKey,
  initialFilters,
  store,
  stores,
  technicians,
  customers,
  orders,
  settlements,
  scopedOrders,
  surface,
  onClose
}: {
  metricKey: SummaryMetricKey;
  initialFilters: AnalyticsFilterState;
  store: Store;
  stores: Store[];
  technicians: Technician[];
  customers: Customer[];
  orders: Order[];
  settlements: Settlement[];
  scopedOrders: Order[];
  surface: DashboardSurface;
  onClose: () => void;
}) {
  const { theme } = useClientTheme();
  const config = getSummaryMetricConfig(metricKey);
  const [filters, setFilters] = useState<AnalyticsFilterState>(initialFilters);
  const [compareEnabled, setCompareEnabled] = useState((initialFilters.compareMode ?? "previous_period") !== "none");
  const overview = useMemo(
    () => buildShopAnalyticsOverview({ store, stores, technicians, customers, orders, settlements, filters }),
    [customers, filters, orders, settlements, store, stores, technicians]
  );
  const compareFilters = useMemo(() => createPreviousPeriodShopAnalyticsFilter(filters), [filters]);
  const compareOverview = useMemo(
    () => buildShopAnalyticsOverview({ store, stores, technicians, customers, orders, settlements, filters: compareFilters }),
    [compareFilters, customers, orders, settlements, store, stores, technicians]
  );
  const metric = getSummaryMetric(overview, metricKey);
  const compareMetric = getSummaryMetric(compareOverview, metricKey);
  const positive = (metric.delta ?? 0) >= 0;
  const setDate = (key: "startDate" | "endDate", value: string) => {
    setFilters((current) => normalizeShopAnalyticsFilter(
      { ...current, [key]: value, preset: "custom" },
      { anchor: key === "endDate" ? "end" : "start", forceDefaultGranularity: true }
    ));
  };
  const setGranularity = (granularity: AnalyticsGranularity) => {
    if (!canUseShopAnalyticsGranularity(filters, granularity)) {
      return;
    }

    setFilters((current) => ({ ...current, granularity }));
  };
  const applyPreset = (preset: AnalyticsRangePreset) => {
    setFilters((current) => createShopAnalyticsPresetFilter(preset, scopedOrders, current));
  };

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const content = (
    <>
      <AnalyticsFullscreenHeader info={config.description} onClose={onClose} title={config.label} />

      <main className="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-[calc(env(safe-area-inset-top)+86px)]">
        <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-[color:var(--client-muted)]">{overview.rangeLabel}</p>
                <strong className="mt-2 block truncate text-[32px] font-black tracking-[-0.05em]">{formatMetricValue(metric)}</strong>
              </div>
              <Badge tone={getStatusTone(metric.status)}>{metric.status === "danger" ? "风险" : metric.status === "warning" ? "关注" : "正常"}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-bg)_76%,var(--client-primary)_8%)] px-3 py-2">
                <p className="text-[10px] font-bold text-[color:var(--client-soft-muted)]">较前周期</p>
                <strong className={cn("mt-1 block text-sm font-black", positive ? "text-[#92e2b1]" : "text-[#ff9d8f]")}>{formatSignedMetric(metric)}</strong>
              </div>
              <div className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-bg)_76%,var(--client-primary)_8%)] px-3 py-2">
                <p className="text-[10px] font-bold text-[color:var(--client-soft-muted)]">变化率</p>
                <strong className={cn("mt-1 block text-sm font-black", positive ? "text-[#92e2b1]" : "text-[#ff9d8f]")}>{formatDeltaPercent(metric)}</strong>
              </div>
              <div className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-bg)_76%,var(--client-primary)_8%)] px-3 py-2">
                <p className="text-[10px] font-bold text-[color:var(--client-soft-muted)]">前一周期</p>
                <strong className="mt-1 block truncate text-sm font-black text-[color:var(--client-text)]">{formatMetricValue(compareMetric)}</strong>
              </div>
            </div>
        </section>

        <section className="mt-4 rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4">
            <TitleWithInfo
              as="h3"
              info={`当前单位：${getGranularityTitle(filters.granularity)}。单日仅支持小时，本周和近7天仅支持日，本月和近30天支持日/周；自定义区间最多 ${shopAnalyticsMaxRangeDays} 天。`}
              infoPanelClassName="!z-[180]"
              label="图表单位说明"
              title="图表单位"
              titleClassName="text-base font-black"
              variant="dark"
            />
            <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <AnalyticsSegmentedControl
                compact
                dark
                disabledValues={granularityOptions.filter((item) => !canUseShopAnalyticsGranularity(filters, item.value)).map((item) => item.value)}
                items={granularityOptions}
                onChange={setGranularity}
                value={filters.granularity}
              />
              <button
                aria-pressed={compareEnabled}
                className={cn(
                  "h-10 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-black transition",
                  compareEnabled ? analyticsControlActiveClassName : analyticsControlInactiveClassName
                )}
                onClick={() => setCompareEnabled((value) => !value)}
                type="button"
              >
                前一周期
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1 block text-[11px] font-black text-[color:var(--client-soft-muted)]">开始</span>
                <input
                  className="h-11 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none accent-[color:var(--client-primary)]"
                  onChange={(event) => setDate("startDate", event.target.value)}
                  type="date"
                  value={filters.startDate}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-black text-[color:var(--client-soft-muted)]">结束</span>
                <input
                  className="h-11 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none accent-[color:var(--client-primary)]"
                  onChange={(event) => setDate("endDate", event.target.value)}
                  type="date"
                  value={filters.endDate}
                />
              </label>
            </div>
            <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
              {presetOptions.map((item) => (
                <button
                  aria-pressed={filters.preset === item.value}
                  className={cn(
                    "h-9 shrink-0 rounded-full border px-3 text-xs font-black",
                    filters.preset === item.value ? analyticsControlActiveClassName : analyticsControlInactiveClassName
                  )}
                  key={item.value}
                  onClick={() => applyPreset(item.value)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
        </section>

        <section className="mt-4">
            <MetricLineChart
              compareEnabled={compareEnabled}
              compareOverview={compareOverview}
              comparePoints={compareOverview.revenueTrend}
              metricKey={metricKey}
              overview={overview}
              points={overview.revenueTrend}
            />
        </section>

        <section className="mt-4 rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-black">相关订单</h3>
              <Badge tone="neutral">{overview.recentOrders.length} 单</Badge>
            </div>
            <div className="mt-3">
              <RecentOrderList orders={overview.recentOrders} />
            </div>
        </section>
      </main>
    </>
  );

  if (surface === "mobile") {
    return <MobileFullscreenPage>{content}</MobileFullscreenPage>;
  }

  const page = (
    <div
      className={cn(
        "merchant-analytics-clean-shell fixed inset-0 z-[160] overflow-hidden bg-[color:var(--client-bg)] text-[color:var(--client-text)]",
        surface === "admin" && "client-shell merchant-admin-analytics-surface",
        getClientThemeModeClassName(theme),
        getClientThemeClassName(theme)
      )}
    >
      <section className="safe-screen-shell flex h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--client-bg)]">
        {content}
      </section>
    </div>
  );

  if (surface === "admin" || typeof document === "undefined") {
    return page;
  }

  return createPortal(page, document.body);
}

function OverviewBoard({
  overview,
  openMetricInsight,
  setDrilldown
}: {
  overview: ShopAnalyticsOverview;
  openMetricInsight: (metricKey: SummaryMetricKey) => void;
  setDrilldown: (state: DrilldownState) => void;
}) {
  const [selectedRevenuePoint, setSelectedRevenuePoint] = useState<TimeSeriesPoint | null>(null);

  useEffect(() => {
    setSelectedRevenuePoint(null);
  }, [overview.filters.endDate, overview.filters.granularity, overview.filters.startDate]);

  const openRevenueOrderDetail = () => {
    if (!selectedRevenuePoint) {
      setDrilldown({
        title: "订单明细",
        description: overview.rangeLabel,
        orders: overview.scopedOrders
      });
      return;
    }

    setDrilldown({
      title: `${selectedRevenuePoint.label} 订单明细`,
      description: `${yen(selectedRevenuePoint.grossRevenue)} · ${selectedRevenuePoint.createdOrders} 单`,
      orders: getTrendPointOrders(overview, selectedRevenuePoint)
    });
  };

  return (
    <>
      <section className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {summaryMetricConfigs.map((item) => (
          <AnalyticsKpiCard
            key={item.key}
            label={item.label}
            metric={getSummaryMetric(overview, item.key)}
            onClick={() => openMetricInsight(item.key)}
          />
        ))}
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <AnalyticsCard action={<Button onClick={openRevenueOrderDetail} size="sm" variant="secondary">查看详细</Button>} caption="点击柱形显示简单数据，右上角可查看对应订单列表。" title={`营业额趋势（${getGranularityTitle(overview.filters.granularity)}）`}>
          <TrendBars
            mode="revenue"
            onPointSelect={setSelectedRevenuePoint}
            points={overview.revenueTrend}
          />
        </AnalyticsCard>

        <AnalyticsCard caption="漏斗用于定位预约到完成之间的流失。" title="订单漏斗">
          <FunnelChart
            onStepClick={(step) => setDrilldown({ title: `${step.label}阶段`, description: `转化 ${percent(step.conversionRate)} · 流失 ${percent(step.dropOffRate)}`, orders: overview.recentOrders })}
            steps={overview.orderFunnel}
          />
        </AnalyticsCard>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <AnalyticsCard action={<Button size="sm" to="/merchant/staff" variant="secondary">员工列表</Button>} caption="按营收、完单、评分、风险综合排序。" title="技师 Top 10">
          <CastRankingList
            casts={overview.topCasts}
            onCastClick={(cast) => setDrilldown({ title: cast.castName, description: "技师收入、工作趋势与经营风险明细。", cast })}
          />
        </AnalyticsCard>

        <AnalyticsCard caption="点击柱形显示简单数据，超过30个周期可左右拖动查看。" title="NDP平台成本">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["余额", `${overview.ndpSummary.balance.toLocaleString("zh-CN")} NDP`],
              ["本期扣费", `${overview.ndpSummary.ndpDebited.toLocaleString("zh-CN")} NDP`],
              ["取消返还", `${overview.ndpSummary.ndpReleased.toLocaleString("zh-CN")} NDP`],
              ["负余额技师", `${overview.ndpSummary.negativeAccounts} 人`]
            ].map(([label, value]) => (
              <div className={cn("rounded-[18px] px-3 py-3", analyticsTileToneClassName)} key={label}>
                <p className="text-[11px] font-bold text-[color:var(--client-soft-muted)]">{label}</p>
                <strong className="mt-1 block text-sm font-black text-[color:var(--client-text)]">{value}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <TrendBars mode="ndp" points={overview.ndpSummary.trend} />
          </div>
        </AnalyticsCard>
      </div>

      <AnalyticsCard action={<Button size="sm" to="/merchant/orders" variant="secondary">处理订单</Button>} caption="系统主动暴露风险，不让店长自己在图表里猜。" title="异常与预警中心">
        <AlertList
          alerts={overview.alerts}
        />
      </AnalyticsCard>
    </>
  );
}

function OrdersBoard({
  overview,
  setDrilldown
}: {
  overview: ShopAnalyticsOverview;
  setDrilldown: (state: DrilldownState) => void;
}) {
  return (
    <>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["预约数", { ...overview.summary.completedOrders, value: overview.scopedOrders.length, unit: "count" as const, explanation: "当前筛选下创建的订单。" }],
          ["首响时间", overview.summary.firstResponseTime],
          ["人工介入率", overview.summary.manualInterventionRate],
          ["取消率", overview.summary.cancellationRate]
        ].map(([label, metric]) => (
          <AnalyticsKpiCard key={label as string} label={label as string} metric={metric as MetricValue} onClick={() => setDrilldown({ title: `${label}明细`, description: overview.rangeLabel, orders: overview.recentOrders })} />
        ))}
      </section>
      <AnalyticsCard caption="可点击阶段进入对应订单明细。" title="订单漏斗与流失">
        <FunnelChart
          onStepClick={(step) => setDrilldown({ title: `${step.label}订单`, description: `转化 ${percent(step.conversionRate)} · 流失 ${percent(step.dropOffRate)}`, orders: overview.recentOrders })}
          steps={overview.orderFunnel}
        />
      </AnalyticsCard>
      <AnalyticsCard caption="按订单状态聚合，方便判断当天处理压力。" title="订单状态">
        <OrderStatusStrip orders={overview.scopedOrders} />
      </AnalyticsCard>
      <AnalyticsCard action={<Button size="sm" to="/merchant/orders" variant="secondary">查看详细</Button>} title="订单明细">
        <RecentOrderList orders={overview.recentOrders} />
      </AnalyticsCard>
    </>
  );
}

function CastBoard({
  overview,
  setDrilldown
}: {
  overview: ShopAnalyticsOverview;
  setDrilldown: (state: DrilldownState) => void;
}) {
  return (
    <>
      <AnalyticsCard caption="优先处理取消偏高、NDP低余额、低利用的员工。" title="技师经营排行">
        <CastRankingList
          casts={overview.topCasts}
          onCastClick={(cast) => setDrilldown({ title: cast.castName, description: "技师收入、工作趋势与经营风险明细。", cast })}
        />
      </AnalyticsCard>
      <AnalyticsCard caption="按当前筛选周期显示每位技师的收入线和完单柱，点击可进入全屏明细。" title="技师收入与工作趋势">
        <CastTrendSummaryList
          casts={overview.topCasts}
          onCastClick={(cast) => setDrilldown({ title: cast.castName, description: "技师收入、工作趋势与经营风险明细。", cast })}
        />
      </AnalyticsCard>
      <AnalyticsCard action={<Button size="sm" to="/merchant/schedule?tab=planning" variant="secondary">调排班</Button>} caption="在线时长与服务时长的差距代表供给浪费。" title="利用率与排班动作">
        <div className="space-y-3">
          {overview.topCasts.slice(0, 6).map((cast) => {
            const utilization = cast.onlineMinutes === 0 ? 0 : (cast.serviceMinutes / cast.onlineMinutes) * 100;

            return (
              <div className={cn("rounded-[20px] px-3 py-3", analyticsTileToneClassName)} key={cast.castId}>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-black text-[color:var(--client-text)]">{cast.castName}</span>
                  <Badge tone={utilization < 35 ? "yellow" : "green"}>{percent(utilization)}</Badge>
                </div>
                <div className={cn("mt-3 h-2 overflow-hidden rounded-full", analyticsTrackToneClassName)}>
                  <div className="h-full rounded-full bg-[color:var(--client-primary)]" style={{ width: `${Math.max(4, utilization)}%` }} />
                </div>
                <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]">{cast.suggestion}</p>
              </div>
            );
          })}
        </div>
      </AnalyticsCard>
    </>
  );
}

function CustomersBoard({ overview, customers }: { overview: ShopAnalyticsOverview; customers: Customer[] }) {
  const activeCustomerIds = new Set(overview.scopedOrders.map((order) => order.customerId));
  const activeCustomers = customers
    .filter((customer) => activeCustomerIds.has(customer.id))
    .sort((left, right) => right.ltv - left.ltv)
    .slice(0, 6);

  return (
    <>
      <AnalyticsCard caption="MVP先展示分层和价值趋势，后续可接入复购预测。" title="客户分层">
        <CustomerSegmentChart overview={overview} />
      </AnalyticsCard>
      <AnalyticsCard caption="用于店长判断复购维护和高价值客户触达。" title="高价值客户">
        <div className="space-y-3">
          {activeCustomers.length > 0 ? activeCustomers.map((customer) => (
            <Link className={cn("flex items-center gap-3 rounded-[20px] px-3 py-3", analyticsTileToneClassName)} key={customer.id} to={`/merchant/profiles/user/${customer.id}`}>
              <AvatarImage alt={customer.nickname ?? customer.name} className="h-11 w-11 rounded-full" src={customer.avatar} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-[color:var(--client-text)]">{customer.nickname ? `${customer.nickname} / ${customer.name}` : customer.name}</span>
                <span className="mt-1 block truncate text-xs font-semibold text-[color:var(--client-muted)]">{customer.memberLevel} · {customer.orderCount} 单 · LTV {yen(customer.ltv)}</span>
              </span>
              <Badge tone={customer.churnRisk === "high" ? "red" : customer.churnRisk === "medium" ? "yellow" : "green"}>{customer.churnRisk === "high" ? "流失风险" : "稳定"}</Badge>
            </Link>
          )) : (
            <div className={cn("rounded-[22px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-6 text-center text-sm font-bold text-[color:var(--client-muted)]", analyticsTileToneClassName)}>
              当前筛选下暂无可分析客户。
            </div>
          )}
        </div>
      </AnalyticsCard>
    </>
  );
}

function FinanceBoard({
  overview,
  settlements,
  openMetricInsight,
  setDrilldown
}: {
  overview: ShopAnalyticsOverview;
  settlements: Settlement[];
  openMetricInsight: (metricKey: SummaryMetricKey) => void;
  setDrilldown: (state: DrilldownState) => void;
}) {
  const pendingSettlements = settlements.filter((item) => item.status !== "paid");
  const financeMetrics: Array<{ label: string; metric: MetricValue; onClick: () => void }> = [
    { label: "线下服务总额", metric: overview.summary.grossRevenue, onClick: () => openMetricInsight("grossRevenue") },
    { label: "店铺净收益", metric: overview.summary.netProfit, onClick: () => openMetricInsight("netProfit") },
    { label: "平台NDP扣费", metric: overview.summary.ndpCost, onClick: () => openMetricInsight("ndpCost") },
    {
      label: "待确认账单",
      metric: {
        value: pendingSettlements.length,
        previousValue: 0,
        unit: "count",
        status: pendingSettlements.length > 0 ? "warning" : "normal",
        explanation: "未支付或复核中的结算单。"
      },
      onClick: () => setDrilldown({ title: "待确认账单", description: `${pendingSettlements.length} 张账单需要确认或复核。`, settlements: pendingSettlements })
    }
  ];

  return (
    <>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {financeMetrics.map((item) => (
          <AnalyticsKpiCard key={item.label} label={item.label} metric={item.metric} onClick={item.onClick} />
        ))}
      </section>
      <AnalyticsCard caption="净收益公式与规格文档一致，先用本地聚合模拟，后续可替换为统一 Analytics API。" title="财务拆解">
        <FinanceBreakdown items={overview.financeBreakdown} />
      </AnalyticsCard>
      <AnalyticsCard caption="扣费、取消返还、赔付和充值分开显示，降低平台成本黑箱感。" title="NDP账本">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["当前余额", `${overview.ndpSummary.balance.toLocaleString("zh-CN")} NDP`],
            ["正式扣费", `${overview.ndpSummary.ndpDebited.toLocaleString("zh-CN")} NDP`],
            ["取消返还", `${overview.ndpSummary.ndpReleased.toLocaleString("zh-CN")} NDP`],
            ["违约赔付", `${overview.ndpSummary.ndpCompensated.toLocaleString("zh-CN")} NDP`],
            ["充值/奖励", `${overview.ndpSummary.ndpTopup.toLocaleString("zh-CN")} NDP`],
            ["成本占比", percent(overview.ndpSummary.costSharePercent)]
          ].map(([label, value]) => (
            <div className={cn("rounded-[18px] px-3 py-3", analyticsTileToneClassName)} key={label}>
              <p className="text-[11px] font-bold text-[color:var(--client-soft-muted)]">{label}</p>
              <strong className="mt-1 block text-sm font-black text-[color:var(--client-text)]">{value}</strong>
            </div>
          ))}
        </div>
      </AnalyticsCard>
    </>
  );
}

export function ShopAnalyticsDashboard({
  store,
  stores,
  technicians,
  customers,
  orders,
  settlements,
  personnelMonthlyCost,
  surface = "mobile",
  className
}: ShopAnalyticsDashboardProps) {
  const merchantStores = useMemo(() => {
    const scoped = stores.filter((item) => item.merchantId === store.merchantId);

    return scoped.length > 0 ? scoped : [store];
  }, [store, stores]);
  const defaultScopedOrders = useMemo(
    () => getScopedShopOrders(store, merchantStores, technicians, orders),
    [merchantStores, orders, store, technicians]
  );
  const [filters, setFilters] = useState<AnalyticsFilterState>(() => createDefaultShopAnalyticsFilter(defaultScopedOrders));
  const [draftFilters, setDraftFilters] = useState<AnalyticsFilterState>(filters);
  const [activeTab, setActiveTab] = useState<ShopAnalyticsTab>("overview");
  const [filterOpen, setFilterOpen] = useState(false);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const [metricInsight, setMetricInsight] = useState<SummaryMetricKey | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const selectedShopIds = filters.shopIds?.length ? filters.shopIds : [store.id];
  const castOptions = technicians.filter((technician) => selectedShopIds.includes(technician.storeId));
  const areaOptions = [...new Set(defaultScopedOrders.map((order) => order.area))].slice(0, 12);
  const overview = useMemo(
    () => buildShopAnalyticsOverview({
      store,
      stores: merchantStores,
      technicians,
      customers,
      orders,
      settlements,
      filters,
      personnelMonthlyCost
    }),
    [customers, filters, merchantStores, orders, personnelMonthlyCost, settlements, store, technicians]
  );
  const shellClassName = surface === "admin"
    ? "merchant-admin-analytics-surface min-w-0 max-w-full space-y-5 overflow-x-hidden"
    : "min-w-0 max-w-full space-y-4 overflow-x-hidden";

  const applyPreset = (preset: AnalyticsRangePreset) => {
    const next = createShopAnalyticsPresetFilter(preset, defaultScopedOrders, filters);
    setFilters(next);
    setDraftFilters(next);
  };

  const applyGranularity = (granularity: AnalyticsGranularity) => {
    if (!canUseShopAnalyticsGranularity(filters, granularity)) {
      return;
    }

    const next = { ...filters, granularity };
    setFilters(next);
    setDraftFilters(next);
  };

  const openFilter = () => {
    setDraftFilters(filters);
    setFilterOpen(true);
  };

  const resetFilters = () => {
    const next = createDefaultShopAnalyticsFilter(defaultScopedOrders);
    setDraftFilters(next);
  };

  const exportCurrentView = () => {
    const rows = [
      ["订单号", "预约时间", "客户", "服务", "状态", "区域", "金额"],
      ...overview.scopedOrders.map((order) => [
        order.orderNo,
        order.bookedAt,
        order.customerName,
        order.itemName,
        statusLabel(order.status),
        order.area,
        String(order.amount)
      ])
    ];
    downloadCsv(`needo-shop-analytics-${overview.filters.startDate}-${overview.filters.endDate}.csv`, rows);
    setExportMessage(`已按当前筛选导出 ${overview.scopedOrders.length} 条订单。`);
  };

  return (
    <div className={cn("shop-analytics-dashboard", shellClassName, className)}>
      <section className="shop-analytics-hero overflow-hidden rounded-[30px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] shadow-panel">
        <div className="relative min-h-[220px] p-4 text-white sm:p-5">
          <img alt={store.name} className="absolute inset-0 h-full w-full object-cover" src={store.cover} />
          <div className="shop-analytics-hero-overlay absolute inset-0 bg-[linear-gradient(135deg,rgba(8,17,28,0.88),rgba(25,52,61,0.68),rgba(23,109,88,0.42))]" />
          <div className="relative flex min-h-[188px] flex-col justify-between gap-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="shop-analytics-hero-eyebrow text-[11px] font-black uppercase tracking-[0.16em] text-white/58">Shop BI Dashboard</p>
                <h2 className="shop-analytics-hero-title mt-2 text-[28px] font-black tracking-[-0.04em] text-white">店铺经营驾驶舱</h2>
                <p className="shop-analytics-hero-subtitle mt-2 text-sm leading-5 text-white/70">{store.name} · {overview.rangeLabel}</p>
              </div>
              <Badge className="shop-analytics-hero-badge shrink-0 border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_24%,transparent)] text-white" tone="neutral">Asia/Tokyo</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="shop-analytics-hero-metric rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_20%,transparent)] px-3 py-3 backdrop-blur">
                <p className="shop-analytics-hero-metric-label text-[11px] font-bold text-white/55">营业额</p>
                <strong className="shop-analytics-hero-metric-value mt-1 block truncate text-sm font-black text-white">{formatMetricValue(overview.summary.grossRevenue)}</strong>
              </div>
              <div className="shop-analytics-hero-metric rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_20%,transparent)] px-3 py-3 backdrop-blur">
                <p className="shop-analytics-hero-metric-label text-[11px] font-bold text-white/55">完单率</p>
                <strong className="shop-analytics-hero-metric-value mt-1 block truncate text-sm font-black text-white">{formatMetricValue(overview.summary.completionRate)}</strong>
              </div>
              <div className="shop-analytics-hero-metric rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_20%,transparent)] px-3 py-3 backdrop-blur">
                <p className="shop-analytics-hero-metric-label text-[11px] font-bold text-white/55">风险</p>
                <strong className="shop-analytics-hero-metric-value mt-1 block truncate text-sm font-black text-white">{overview.alerts.length} 件</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AnalyticsSegmentedControl dark items={tabOptions} onChange={setActiveTab} value={activeTab} />

      <section className="shop-analytics-filter-panel sticky top-[calc(env(safe-area-inset-top,0px)+10px)] z-30 rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_90%,transparent),color-mix(in_srgb,var(--client-bg)_86%,var(--client-primary)_10%))] p-3 text-[color:var(--client-text)] shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_40px] items-center gap-2">
          <div className="grid min-w-0 grid-cols-5 gap-2">
            {presetOptions.map((item) => (
              <button
                aria-pressed={filters.preset === item.value}
                className={cn(
                  "focus-ring h-9 min-w-0 rounded-full border px-1 text-center text-xs font-black transition",
                  filters.preset === item.value ? analyticsControlActiveClassName : analyticsControlInactiveClassName
                )}
                key={item.value}
                onClick={() => applyPreset(item.value)}
                type="button"
              >
                <span className="block truncate">{item.label}</span>
              </button>
            ))}
          </div>
          <button
            aria-label="筛选"
            className={cn("focus-ring relative grid h-10 w-10 place-items-center rounded-full border transition", analyticsControlInactiveClassName)}
            onClick={openFilter}
            title="筛选"
            type="button"
          >
            <AppIcon className="h-4 w-4" name="search" />
            {overview.selectedFilterCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[10px] font-black text-white">
                {overview.selectedFilterCount}
              </span>
            ) : null}
          </button>
        </div>
        <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_40px] items-center gap-2">
          <div className={cn("flex h-10 min-w-0 items-center gap-1 rounded-full border p-1 backdrop-blur-xl", analyticsControlInactiveClassName)}>
            <span className="grid h-full shrink-0 place-items-center rounded-full bg-[color:var(--client-primary)] px-3 text-xs font-black text-[color:var(--client-needo-text)]">
              单位：
            </span>
            <div className="grid min-w-0 flex-1 grid-cols-4 gap-1">
              {granularityOptions.map((item) => {
                const disabled = !canUseShopAnalyticsGranularity(filters, item.value);

                return (
                  <button
                    aria-disabled={disabled}
                    aria-pressed={!disabled && filters.granularity === item.value}
                    className={cn(
                      "focus-ring h-8 min-w-0 rounded-full px-1 text-center text-xs font-black transition",
                      disabled
                        ? "cursor-not-allowed text-[color:color-mix(in_srgb,var(--client-muted)_42%,transparent)] opacity-45"
                        : filters.granularity === item.value
                          ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                          : "text-[color:var(--client-muted)] hover:bg-[color:var(--client-primary-soft)] hover:text-[color:var(--client-primary-strong)]"
                    )}
                    disabled={disabled}
                    key={item.value}
                    onClick={() => applyGranularity(item.value)}
                    type="button"
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            aria-label="导出 CSV"
            className={cn(
              "focus-ring grid h-10 w-10 place-items-center rounded-full border transition",
              analyticsControlInactiveClassName,
              "text-[color:var(--client-primary-strong)]"
            )}
            onClick={exportCurrentView}
            title="导出 CSV"
            type="button"
          >
            <DownloadTrayIcon className="h-5 w-5" />
          </button>
        </div>
        {exportMessage ? <p className="mt-2 text-xs font-bold text-[color:var(--client-primary-strong)]">{exportMessage}</p> : null}
      </section>

      <div className="space-y-4">
        {activeTab === "overview" ? <OverviewBoard openMetricInsight={setMetricInsight} overview={overview} setDrilldown={setDrilldown} /> : null}
        {activeTab === "orders" ? <OrdersBoard overview={overview} setDrilldown={setDrilldown} /> : null}
        {activeTab === "casts" ? <CastBoard overview={overview} setDrilldown={setDrilldown} /> : null}
        {activeTab === "customers" ? <CustomersBoard customers={customers} overview={overview} /> : null}
        {activeTab === "finance" ? <FinanceBoard openMetricInsight={setMetricInsight} overview={overview} settlements={settlements} setDrilldown={setDrilldown} /> : null}
      </div>

      <DashboardFilterSheet
        areaOptions={areaOptions}
        castOptions={castOptions}
        draft={draftFilters}
        onApply={() => {
          const next = normalizeShopAnalyticsFilter(draftFilters);
          setFilters(next);
          setDraftFilters(next);
          setFilterOpen(false);
        }}
        onChange={setDraftFilters}
        onClose={() => setFilterOpen(false)}
        onReset={resetFilters}
        open={filterOpen}
        surface={surface}
        storeOptions={merchantStores}
      />
      <DrilldownDrawer onClose={() => setDrilldown(null)} state={drilldown} surface={surface} />
      {metricInsight ? (
        <MetricInsightPage
          key={metricInsight}
          customers={customers}
          initialFilters={filters}
          metricKey={metricInsight}
          onClose={() => setMetricInsight(null)}
          orders={orders}
          scopedOrders={defaultScopedOrders}
          settlements={settlements}
          store={store}
          stores={merchantStores}
          surface={surface}
          technicians={technicians}
        />
      ) : null}
    </div>
  );
}
