import { useEffect, useState } from "react";
import type {
  AnalyticsMetricSeries,
  DashboardBucketPayload
} from "../../api/backofficeRealData";
import { useI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { createDashboardAxis, type DashboardAxis } from "./dashboardChartScale";
import { formatDashboardNumber, normalizeDashboardNumber } from "./dashboardFormat";

export type DashboardChartMetricKey = Exclude<keyof DashboardBucketPayload, "key" | "label">;

export type DashboardChartSeries = {
  key: DashboardChartMetricKey;
  label: string;
  unit: string;
  color?: string;
};

const chartWidth = 720;
const chartHeight = 280;
const plot = { top: 32, right: 54, bottom: 46, left: 54 };
const plotWidth = chartWidth - plot.left - plot.right;
const plotHeight = chartHeight - plot.top - plot.bottom;
const lineColors = ["var(--admin-accent, #3b82f6)", "var(--admin-purple, #a855f7)"];
const barColors = [
  "var(--admin-accent, #3b82f6)",
  "var(--admin-success, #10b981)",
  "var(--admin-warning, #f59e0b)"
];

export function getAnalyticsSeriesColor(index: number): string {
  return lineColors[index % lineColors.length] ?? lineColors[0];
}

function getValue(bucket: DashboardBucketPayload, series: DashboardChartSeries) {
  return normalizeDashboardNumber(bucket[series.key]);
}

function getX(index: number, count: number) {
  if (count <= 1) {
    return plot.left + plotWidth / 2;
  }

  return plot.left + (index / Math.max(1, count - 1)) * plotWidth;
}

function getY(value: number, values: number[]) {
  return createDashboardAxis(values).y(value, plot.top, plotHeight);
}

function linePath(
  buckets: DashboardBucketPayload[],
  series: DashboardChartSeries,
  axis: DashboardAxis
) {
  return buckets
    .map((bucket, index) => {
      const x = getX(index, buckets.length);
      const y = axis.y(getValue(bucket, series), plot.top, plotHeight);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function Grid({
  buckets,
  leftAxis,
  rightAxis,
  language
}: {
  buckets: Array<Pick<DashboardBucketPayload, "key" | "label">>;
  leftAxis?: DashboardAxis;
  rightAxis?: DashboardAxis;
  language: Parameters<typeof formatDashboardNumber>[1];
}) {
  return (
    <>
      {(leftAxis?.ticks ?? [0, 0.25, 0.5, 0.75, 1]).map((tick, index) => {
        const y = leftAxis
          ? leftAxis.y(tick, plot.top, plotHeight)
          : plot.top + index * (plotHeight / 4);
        return (
          <g key={tick}>
            <line
              stroke="var(--admin-line, rgba(148, 163, 184, 0.25))"
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
              x1={plot.left}
              x2={chartWidth - plot.right}
              y1={y}
              y2={y}
            />
            {leftAxis ? (
              <text data-axis-side="left" data-no-i18n fill="currentColor" fontSize="10" textAnchor="end" x={plot.left - 8} y={y + 4}>
                {formatDashboardNumber(tick, language)}
              </text>
            ) : null}
          </g>
        );
      })}
      {rightAxis?.ticks.map((tick) => {
        const y = rightAxis.y(tick, plot.top, plotHeight);
        return (
          <text data-axis-side="right" data-no-i18n fill="currentColor" fontSize="10" key={tick} textAnchor="start" x={chartWidth - plot.right + 8} y={y + 4}>
            {formatDashboardNumber(tick, language)}
          </text>
        );
      })}
      {buckets.map((bucket, index) => (
        <text
          data-no-i18n
          fill="currentColor"
          fontSize="11"
          key={bucket.key}
          textAnchor="middle"
          x={getX(index, buckets.length)}
          y={chartHeight - 18}
        >
          {bucket.label}
        </text>
      ))}
    </>
  );
}

function ChartFrame({
  title,
  description,
  buckets,
  series,
  children,
  leftAxis,
  rightAxis,
  overlay,
  onKeyDown,
  empty
}: {
  title: string;
  description: string;
  buckets: DashboardBucketPayload[];
  series: readonly DashboardChartSeries[];
  children: React.ReactNode;
  leftAxis?: DashboardAxis;
  rightAxis?: DashboardAxis;
  overlay?: React.ReactNode;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  empty: boolean;
}) {
  const { language } = useI18n();

  return (
    <figure
      className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-panel"
      data-dashboard-chart-frame="true"
      onKeyDown={onKeyDown}
    >
      <figcaption>
        <h3 className="text-base font-black text-ink">{title}</h3>
        <p className="mt-1 text-xs font-bold text-ink/45">{description}</p>
      </figcaption>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="图例">
        {series.map((item, index) => (
          <span className="inline-flex items-center gap-2 text-xs font-black text-ink/60" key={item.key}>
            <span
              aria-hidden="true"
              className={index === 1 ? "h-2.5 w-2.5 rotate-45" : "h-2.5 w-2.5 rounded-full"}
              style={{ background: item.color ?? (series.length === 3 ? barColors[index] : lineColors[index]) }}
            />
            {item.label} · {item.unit}
          </span>
        ))}
      </div>
      <div className="relative mt-3 min-w-0 overflow-hidden">
        <svg
          aria-label={title}
          className="dashboard-chart h-auto w-full text-ink/45"
          data-dashboard-chart-empty={empty ? "true" : undefined}
          role="img"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <Grid buckets={buckets} language={language} leftAxis={leftAxis} rightAxis={rightAxis} />
          {children}
        </svg>
        {overlay}
        {empty ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-black text-ink/45">
            当前范围暂无数据
          </p>
        ) : null}
      </div>
      {empty ? (
        <p className="sr-only"><span>{title}</span><span>当前范围暂无数据</span></p>
      ) : (
        <table className="sr-only">
          <caption><span>{title}</span><span>精确数据</span></caption>
          <thead>
            <tr>
              <th>期间</th>
              {series.map((item) => <th key={item.key}>{item.label}（{item.unit}）</th>)}
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.key}>
                <th data-no-i18n>{bucket.label}</th>
                {series.map((item) => (
                  <td data-no-i18n key={item.key}>
                    {formatDashboardNumber(getValue(bucket, item), language)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <style>{`
        .dashboard-chart path,
        .dashboard-chart circle,
        .dashboard-chart polygon,
        .dashboard-chart rect { transition: opacity 160ms ease, filter 160ms ease; }
        @media (prefers-reduced-motion: reduce) {
          .dashboard-chart path,
          .dashboard-chart circle,
          .dashboard-chart polygon,
          .dashboard-chart rect { transition: none; }
        }
      `}</style>
    </figure>
  );
}

export function DualAxisLineChart({
  title,
  description,
  buckets,
  left,
  right
}: {
  title: string;
  description: string;
  buckets: DashboardBucketPayload[];
  left: DashboardChartSeries;
  right?: DashboardChartSeries;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const series = right ? [left, right] : [left];
  const leftValues = buckets.map((bucket) => getValue(bucket, left));
  const rightValues = right ? buckets.map((bucket) => getValue(bucket, right)) : [];
  const leftAxis = createDashboardAxis(leftValues);
  const rightAxis = right ? createDashboardAxis(rightValues) : undefined;
  const bucketKey = buckets.map((bucket) => bucket.key).join("|");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  useEffect(() => setSelectedIndex(null), [bucketKey]);
  const selectOnKeyboard = (event: React.KeyboardEvent<SVGElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedIndex(index);
    }
  };
  const selectedBucket = selectedIndex === null ? null : buckets[selectedIndex] ?? null;
  const anchorPercent = selectedIndex === null
    ? 50
    : Math.min(85, Math.max(15, (getX(selectedIndex, buckets.length) / chartWidth) * 100));

  return (
    <ChartFrame
      buckets={buckets}
      description={description}
      empty={buckets.length === 0}
      leftAxis={leftAxis}
      onKeyDown={(event) => {
        if (event.key === "Escape") setSelectedIndex(null);
      }}
      overlay={selectedBucket ? (
        <div
          aria-label={t("节点详细数据")}
          className="absolute top-3 z-10 min-w-44 -translate-x-1/2 rounded-xl border border-line bg-white p-3 text-xs font-bold text-ink shadow-panel"
          data-dashboard-point-detail="true"
          role="status"
          style={{ left: `${anchorPercent}%` }}
        >
          <div className="flex items-start justify-between gap-3">
            <strong data-no-i18n>{selectedBucket.label}</strong>
            <button
              aria-label={t("关闭数据提示")}
              className="rounded-md px-1.5 text-ink/45 hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
              onClick={() => setSelectedIndex(null)}
              type="button"
            >
              ×
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {series.map((item) => (
              <li className="flex items-center justify-between gap-4" key={item.key}>
                <span>{item.label}</span>
                <span data-no-i18n>{formatDashboardNumber(getValue(selectedBucket, item), language)} {item.unit}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : undefined}
      rightAxis={rightAxis}
      series={series}
      title={title}
    >
      {buckets.length > 0 ? (
        <>
          <text fill="currentColor" fontSize="11" fontWeight="700" x={plot.left} y={18}>
            {left.label} · {left.unit}
          </text>
          <path
            d={linePath(buckets, left, leftAxis)}
            fill="none"
            stroke={left.color ?? lineColors[0]}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
          {buckets.map((bucket, index) => (
            <circle
              cx={getX(index, buckets.length)}
              cy={leftAxis.y(getValue(bucket, left), plot.top, plotHeight)}
              data-chart-series-node="true"
              fill="var(--admin-surface, white)"
              key={bucket.key}
              r="4"
              stroke={left.color ?? lineColors[0]}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {buckets.map((bucket, index) => (
            <circle
              aria-label={`${bucket.label} ${left.label} ${formatDashboardNumber(getValue(bucket, left), language)} ${left.unit}`}
              cx={getX(index, buckets.length)}
              cy={leftAxis.y(getValue(bucket, left), plot.top, plotHeight)}
              data-chart-point-control="true"
              fill="transparent"
              key={`left-control-${bucket.key}`}
              onClick={() => setSelectedIndex(index)}
              onKeyDown={(event) => selectOnKeyboard(event, index)}
              r="12"
              role="button"
              tabIndex={0}
            />
          ))}
          {right ? (
            <>
              <text
                fill="currentColor"
                fontSize="11"
                fontWeight="700"
                textAnchor="end"
                x={chartWidth - plot.right}
                y={18}
              >
                {right.label} · {right.unit}
              </text>
              <path
                d={linePath(buckets, right, rightAxis as DashboardAxis)}
                fill="none"
                stroke={right.color ?? lineColors[1]}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              {buckets.map((bucket, index) => {
                const x = getX(index, buckets.length);
                const y = (rightAxis as DashboardAxis).y(
                  getValue(bucket, right),
                  plot.top,
                  plotHeight
                );
                const radius = 5;
                return (
                  <polygon
                    data-chart-series-node="true"
                    fill="var(--admin-surface, white)"
                    key={bucket.key}
                    points={`${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`}
                    stroke={right.color ?? lineColors[1]}
                    strokeWidth="2.5"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {buckets.map((bucket, index) => (
                <circle
                  aria-label={`${bucket.label} ${right.label} ${formatDashboardNumber(getValue(bucket, right), language)} ${right.unit}`}
                  cx={getX(index, buckets.length)}
                  cy={(rightAxis as DashboardAxis).y(
                    getValue(bucket, right),
                    plot.top,
                    plotHeight
                  )}
                  data-chart-point-control="true"
                  fill="transparent"
                  key={`right-control-${bucket.key}`}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(event) => selectOnKeyboard(event, index)}
                  r="12"
                  role="button"
                  tabIndex={0}
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </ChartFrame>
  );
}

export function GroupedBarChart({
  title,
  description,
  buckets,
  series
}: {
  title: string;
  description: string;
  buckets: DashboardBucketPayload[];
  series: [DashboardChartSeries, DashboardChartSeries, DashboardChartSeries];
}) {
  const maximum = Math.max(1, ...buckets.flatMap((bucket) => series.map((item) => getValue(bucket, item))));
  const groupWidth = plotWidth / Math.max(1, buckets.length);
  const gap = Math.max(2, groupWidth * 0.04);
  const barWidth = Math.max(2, Math.min(22, (groupWidth * 0.72 - gap * 2) / 3));

  return (
    <ChartFrame
      buckets={buckets}
      description={description}
      empty={buckets.length === 0}
      series={series}
      title={title}
    >
      {buckets.flatMap((bucket, bucketIndex) =>
        series.map((item, seriesIndex) => {
          const value = getValue(bucket, item);
          const height = (Math.max(0, value) / maximum) * plotHeight;
          const groupStart = plot.left + bucketIndex * groupWidth + groupWidth * 0.14;
          return (
            <rect
              data-bar-series={seriesIndex}
              fill={item.color ?? barColors[seriesIndex]}
              height={height}
              key={`${bucket.key}-${item.key}`}
              rx="3"
              vectorEffect="non-scaling-stroke"
              width={barWidth}
              x={groupStart + seriesIndex * (barWidth + gap)}
              y={plot.top + plotHeight - height}
            />
          );
        })
      )}
    </ChartFrame>
  );
}

function analyticsPointX(index: number, count: number) {
  return getX(index, count);
}

function analyticsLineSegments(
  points: AnalyticsMetricSeries["points"],
  values: number[]
): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(
      `${current.length === 0 ? "M" : "L"} ${analyticsPointX(index, points.length).toFixed(2)} ${getY(point.value, values).toFixed(2)}`
    );
  });
  if (current.length > 1) segments.push(current.join(" "));
  return segments;
}

export function FixedAnalyticsSeriesChart({
  series,
  unavailableValueLabel,
  seriesColors
}: {
  series: readonly AnalyticsMetricSeries[];
  unavailableValueLabel: string;
  seriesColors?: Readonly<Record<string, string>>;
}) {
  const { language } = useI18n();
  const values = series.flatMap((item) =>
    item.points.flatMap((point) => point.value === null ? [] : [point.value])
  );
  const pointLabels = series[0]?.points ?? [];

  return (
    <div className="relative min-w-0 overflow-hidden">
      <svg
        aria-hidden="true"
        className="dashboard-chart h-auto w-full text-ink/45"
        data-analytics-detail-chart="true"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <Grid buckets={pointLabels} language={language} />
        {series.map((item, seriesIndex) => {
          const color = seriesColors?.[item.seriesKey] ?? getAnalyticsSeriesColor(seriesIndex);
          return (
            <g
              data-analytics-series={item.seriesKey}
              data-analytics-series-color={color}
              key={item.seriesKey}
            >
              {analyticsLineSegments(item.points, values).map((path, pathIndex) => (
                <path
                  d={path}
                  fill="none"
                  key={`${item.seriesKey}-${pathIndex}`}
                  stroke={color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {item.points.map((point, pointIndex) => point.value === null ? null : (
                <circle
                  cx={analyticsPointX(pointIndex, item.points.length)}
                  cy={getY(point.value, values)}
                  fill="var(--admin-surface, white)"
                  key={point.key}
                  r="4"
                  stroke={color}
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          );
        })}
      </svg>
      <table className="sr-only" data-analytics-series-evidence="true" data-no-i18n>
        <thead>
          <tr>
            <th />
            {series.map((item) => <th key={item.seriesKey}>{item.label}（{item.unit}）</th>)}
          </tr>
        </thead>
        <tbody>
          {pointLabels.map((point) => (
            <tr key={point.key}>
              <th data-no-i18n>{point.label}</th>
              {series.map((item) => {
                const value = item.points.find((candidate) => candidate.key === point.key)?.value ?? null;
                return (
                  <td
                    data-analytics-point-unavailable={value === null ? "true" : undefined}
                    data-no-i18n
                    key={item.seriesKey}
                  >
                    {value === null ? unavailableValueLabel : formatDashboardNumber(value, language)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
