import type { ReactNode } from "react";
import type { DashboardMetricComparison } from "../../api/backofficeRealData";
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
  accent = "blue"
}: {
  title: string;
  value?: number | null;
  comparison?: DashboardMetricComparison | null;
  unit: DashboardValueUnit;
  testNdp?: number | null;
  statusMessage?: string;
  secondary?: DashboardMetricSecondary;
  note?: string;
  icon?: ReactNode;
  accent?: "blue" | "purple" | "green" | "orange" | "cyan";
}) {
  const { language } = useI18n();
  const mainValue = comparison ? comparison.current : value;
  const formatted = mainValue === null || mainValue === undefined
    ? null
    : formatDashboardValue(mainValue, unit, language);
  const change = comparison ? formatDashboardChange(comparison.changeRatePercent) : null;
  const previous = comparison ? formatDashboardValue(comparison.previous, unit, language) : null;
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
      <div className="flex items-center gap-2 text-sm font-black text-ink/60">
        {icon ? <span className="grid h-8 w-8 place-items-center rounded-xl bg-paper">{icon}</span> : null}
        <h3>{title}</h3>
      </div>

      <div className="mt-4 flex min-w-0 items-baseline gap-1.5">
        <strong className="truncate text-3xl font-black tracking-tight text-ink" data-no-i18n>
          {formatted?.number ?? "—"}
        </strong>
        <span className="text-xs font-black text-ink/45">{formatted?.unit ?? (unit === "people" ? "人" : "")}</span>
      </div>

      {statusMessage ? <p className="mt-2 text-xs font-bold text-ink/50">{statusMessage}</p> : null}

      {comparison && change && previous ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs font-bold">
          <span className="text-ink/45">
            上期 <span data-no-i18n>{previous.number}</span> <span>{previous.unit}</span>
          </span>
          {change.direction === "unavailable" ? (
            <span className="dashboard-comparison-unavailable text-ink/45">暂无上期基线</span>
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
