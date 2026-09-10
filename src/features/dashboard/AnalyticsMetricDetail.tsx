import { useEffect, useMemo, useState } from "react";
import type { AnalyticsMetricSeries } from "../../api/backofficeRealData";
import { cn } from "../../lib/utils";
import {
  FixedAnalyticsSeriesChart,
  getAnalyticsSeriesColor
} from "./DashboardCharts";

export function AnalyticsMetricDetail({
  title,
  series,
  hideSeriesLabel,
  showSeriesLabel,
  unavailableValueLabel,
  allSeriesHiddenLabel
}: {
  title: string;
  series: readonly AnalyticsMetricSeries[];
  hideSeriesLabel: (label: string) => string;
  showSeriesLabel: (label: string) => string;
  unavailableValueLabel: string;
  allSeriesHiddenLabel: string;
}) {
  const seriesKeySignature = series.map((item) => item.seriesKey).join("\u0000");
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    () => new Set(series.map((item) => item.seriesKey))
  );

  useEffect(() => {
    setVisibleSeries(new Set(series.map((item) => item.seriesKey)));
  }, [seriesKeySignature]);

  const displayedSeries = useMemo(
    () => series.filter((item) => visibleSeries.has(item.seriesKey)),
    [series, visibleSeries]
  );
  const seriesColors = useMemo(
    () => Object.fromEntries(
      series.map((item, index) => [item.seriesKey, getAnalyticsSeriesColor(index)])
    ),
    [seriesKeySignature]
  );

  return (
    <figure className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-panel">
      <figcaption>
        <h2 className="text-base font-black text-ink">{title}</h2>
      </figcaption>
      <div aria-label={title} className="mt-4 flex flex-wrap gap-2">
        {series.map((item) => {
          const visible = visibleSeries.has(item.seriesKey);
          return (
            <button
              aria-label={visible ? hideSeriesLabel(item.label) : showSeriesLabel(item.label)}
              aria-pressed={visible}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40",
                visible
                  ? "border-moss/30 bg-moss/10 text-ink"
                  : "border-line bg-paper text-ink/45"
              )}
              key={item.seriesKey}
              onClick={() => {
                setVisibleSeries((current) => {
                  const next = new Set(current);
                  if (next.has(item.seriesKey)) next.delete(item.seriesKey);
                  else next.add(item.seriesKey);
                  return next;
                });
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                data-analytics-series-color={seriesColors[item.seriesKey]}
                style={{ background: seriesColors[item.seriesKey] }}
              />
              <span data-no-i18n>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 min-w-0">
        {displayedSeries.length > 0 ? (
          <FixedAnalyticsSeriesChart
            series={displayedSeries}
            seriesColors={seriesColors}
            unavailableValueLabel={unavailableValueLabel}
          />
        ) : (
          <p className="grid min-h-48 place-items-center text-sm font-black text-ink/45" role="status">
            {allSeriesHiddenLabel}
          </p>
        )}
      </div>
    </figure>
  );
}
