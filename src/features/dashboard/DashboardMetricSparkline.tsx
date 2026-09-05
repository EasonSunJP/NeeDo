import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { formatDashboardValue, type DashboardValueUnit } from "./dashboardFormat";

export interface DashboardMetricSparklinePoint {
  key: string;
  label: string;
  value: number;
}

export function DashboardMetricSparkline({
  points,
  title,
  unit
}: {
  points: DashboardMetricSparklinePoint[];
  title: string;
  unit: DashboardValueUnit;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const pointKey = points.map((point) => point.key).join("|");
  useEffect(() => setSelectedIndex(null), [pointKey]);
  if (points.length !== 3 || points.some((point) => !Number.isFinite(point.value))) return null;

  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const y = (value: number) =>
    maximum === minimum ? 24 : 40 - ((value - minimum) / (maximum - minimum)) * 32;
  const x = (index: number) => 8 + index * 40;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.value)}`)
    .join(" ");
  const selectedPoint = selectedIndex === null ? null : points[selectedIndex] ?? null;
  const selectedValue = selectedPoint ? formatDashboardValue(selectedPoint.value, unit, language) : null;
  const selectOnKeyboard = (event: React.KeyboardEvent<SVGCircleElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedIndex(index);
    }
  };

  return (
    <div
      aria-label={`${title}${t("三日趋势")}`}
      className="relative h-[4.5rem] w-24 shrink-0 text-moss"
      data-dashboard-sparkline="true"
      data-sparkline-values={values.join(",")}
      onKeyDown={(event) => {
        if (event.key === "Escape") setSelectedIndex(null);
      }}
      role="group"
    >
      <svg className="h-12 w-24" viewBox="0 0 96 48">
        <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
        {points.map((point, index) => (
          <circle
            cx={x(index)}
            cy={y(point.value)}
            data-dashboard-sparkline-node="true"
            fill="currentColor"
            key={point.key}
            r="2.75"
          />
        ))}
        {points.map((point, index) => {
          const formatted = formatDashboardValue(point.value, unit, language);
          return (
            <circle
              aria-label={`${point.label} ${title} ${formatted.number} ${formatted.unit}`}
              cx={x(index)}
              cy={y(point.value)}
              data-dashboard-sparkline-control="true"
              fill="transparent"
              key={`${point.key}-control`}
              onClick={() => setSelectedIndex(index)}
              onKeyDown={(event) => selectOnKeyboard(event, index)}
              r="10"
              role="button"
              tabIndex={0}
            />
          );
        })}
      </svg>
      {selectedPoint && selectedValue ? (
        <div
          aria-label={t("节点详细数据")}
          className="absolute right-0 top-12 z-10 flex min-w-28 items-center justify-between gap-2 rounded-lg border border-line bg-white px-2 py-1 text-[10px] font-black text-ink shadow-panel"
          data-dashboard-sparkline-detail="true"
          role="status"
        >
          <span className="whitespace-nowrap" data-no-i18n>
            {selectedPoint.label} · {selectedValue.number} {selectedValue.unit}
          </span>
          <button
            aria-label={t("关闭数据提示")}
            className="rounded px-1 text-ink/45 hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
            onClick={() => setSelectedIndex(null)}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}
      <ul className="sr-only">
        {points.map((point) => {
          const formatted = formatDashboardValue(point.value, unit, language);
          return <li key={point.key}>{point.label}: {formatted.number} {formatted.unit}</li>;
        })}
      </ul>
    </div>
  );
}
