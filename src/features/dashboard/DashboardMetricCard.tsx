import type { ReactNode } from "react";
import type {
  AnalyticsMetricPayload,
  DashboardMetricComparison
} from "../../api/backofficeRealData";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { useI18n } from "../../i18n/I18nProvider";
import { cn } from "../../lib/utils";
import {
  formatDashboardChange,
  formatDashboardValue,
  type DashboardValueUnit
} from "./dashboardFormat";

export type DashboardMetricSecondary = {
  label: string;
  value: number;
  unit: DashboardValueUnit;
};

function formatAnalyticsComparison(metric: AnalyticsMetricPayload): {
  direction: "positive" | "negative" | "zero" | "unavailable";
  label: string;
} {
  if (metric.comparisonDirection === "unavailable" || metric.comparisonPercent === null) {
    return { direction: "unavailable", label: "—" };
  }
  if (metric.comparisonDirection === "flat") {
    return { direction: "zero", label: "+0%" };
  }
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    metric.comparisonPercent
  );
  return {
    direction: metric.comparisonDirection === "up" ? "positive" : "negative",
    label: metric.comparisonDirection === "up" && !formatted.startsWith("+")
      ? `+${formatted}%`
      : `${formatted}%`
  };
}

export function DashboardMetricCard({
  title,
  value,
  comparison,
  unit,
  testNdp,
  statusMessage,
  secondary,
  note,
  icon,
  accent = "blue",
  metric,
  previousLabel = "上期",
  unavailableComparisonLabel = "暂无可比较数据",
  detailLabel,
  disabledAccessoryLabel,
  infoLabel,
  onDetail
}: {
  title: string;
  value?: number | null;
  comparison?: DashboardMetricComparison | null;
  unit?: DashboardValueUnit;
  testNdp?: number | null;
  statusMessage?: string;
  secondary?: DashboardMetricSecondary;
  note?: string;
  icon?: ReactNode;
  accent?: "blue" | "purple" | "green" | "orange" | "cyan";
  metric?: AnalyticsMetricPayload;
  previousLabel?: string;
  unavailableComparisonLabel?: string;
  detailLabel?: string;
  disabledAccessoryLabel?: string;
  infoLabel?: string;
  onDetail?: (route: string) => void;
}) {
  const { language } = useI18n();
  const resolvedUnit = metric?.unit ?? unit ?? "count";
  const mainValue = metric ? metric.currentValue : comparison ? comparison.current : value;
  const formatted = mainValue === null || mainValue === undefined
    ? null
    : formatDashboardValue(mainValue, resolvedUnit, language);
  const change = metric
    ? formatAnalyticsComparison(metric)
    : comparison
      ? formatDashboardChange(comparison.changeRatePercent)
      : null;
  const previousValue = metric?.previousValue ?? comparison?.previous;
  const previous = previousValue === null || previousValue === undefined
    ? null
    : formatDashboardValue(previousValue, resolvedUnit, language);
  const secondaryValue = secondary
    ? formatDashboardValue(secondary.value, secondary.unit, language)
    : null;
  const testValue = testNdp === null || testNdp === undefined
    ? null
    : formatDashboardValue(testNdp, "ndp", language);

  return (
    <article
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-panel",
        `dashboard-metric-${accent}`
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 right-0 w-1",
          accent === "purple" && "bg-purple-500",
          accent === "green" && "bg-emerald-500",
          accent === "orange" && "bg-orange-500",
          accent === "cyan" && "bg-cyan-500",
          accent === "blue" && "bg-blue-500"
        )}
      />
      <div
        className="flex items-start justify-between gap-3 text-sm font-black text-ink/60"
        data-analytics-card-header="true"
      >
        <div className="flex min-w-0 items-center gap-2">
          {icon ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-paper">{icon}</span> : null}
          {metric ? (
            <TitleWithInfo
              as="h3"
              info={(
                <div className="space-y-2" data-no-i18n>
                  <p>{metric.description}</p>
                  <p>{metric.formula}</p>
                </div>
              )}
              label={infoLabel ?? `查看${title}说明和计算公式`}
              title={title}
              variant="paper"
            />
          ) : <h3>{title}</h3>}
        </div>
        {metric?.detailRoute && onDetail && detailLabel ? (
          <span className="shrink-0" data-analytics-detail-accessory="true">
            <button
              className="whitespace-nowrap rounded-xl border border-line bg-paper px-3 py-2 text-xs font-black text-ink transition hover:border-moss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
              onClick={() => onDetail(metric.detailRoute as string)}
              type="button"
            >
              {detailLabel}
            </button>
          </span>
        ) : metric && metric.detailRoute === null && disabledAccessoryLabel ? (
          <span className="shrink-0" data-analytics-detail-accessory="true">
            <span
              aria-disabled="true"
              aria-label={disabledAccessoryLabel}
              className="inline-flex rounded-full border border-line bg-paper px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-ink/45"
              data-analytics-disabled-detail="true"
              title={disabledAccessoryLabel}
            >
              TEST
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex min-w-0 items-baseline gap-1.5" data-analytics-metric-value="true">
        <strong className="truncate text-3xl font-black tracking-tight text-ink" data-no-i18n>
          {formatted?.number ?? "—"}
        </strong>
        <span className="text-xs font-black text-ink/45">{formatted?.unit ?? (resolvedUnit === "people" ? "人" : "")}</span>
      </div>

      {statusMessage && (!metric || metric.currentValue === null) ? (
        <p className="mt-2 text-xs font-bold text-ink/50">{statusMessage}</p>
      ) : null}

      {(comparison || metric) && change ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs font-bold">
          <span className="text-ink/45">
            {previousLabel} <span data-no-i18n>{previous?.number ?? "—"}</span>{" "}
            <span>{previous?.unit ?? ""}</span>
          </span>
          {change.direction === "unavailable" ? (
            <span className="dashboard-comparison-unavailable text-ink/45">
              {metric ? unavailableComparisonLabel : "暂无上期基线"}
            </span>
          ) : (
            <span
              className={cn(
                `dashboard-comparison-${change.direction}`,
                change.direction === "positive" && "text-emerald-600",
                change.direction === "negative" && "text-coral",
                change.direction === "zero" && "text-ink/45"
              )}
              data-no-i18n
            >
              {change.label}
            </span>
          )}
        </div>
      ) : null}

      {secondary && secondaryValue ? (
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-xs font-bold text-ink/55">
          <span>{secondary.label}</span>
          <span className="text-sm font-black text-ink">
            <span data-no-i18n>{secondaryValue.number}</span> <span>{secondaryValue.unit}</span>
          </span>
        </div>
      ) : null}

      {testValue ? (
        <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-paper px-3 py-2 text-xs font-bold text-ink/55">
          <span>Test NDP</span>
          <span className="font-black text-ink" data-no-i18n>{testValue.number}</span>
        </div>
      ) : null}

      {note ? <p className="mt-3 text-xs font-bold leading-5 text-ink/45">{note}</p> : null}

    </article>
  );
}
