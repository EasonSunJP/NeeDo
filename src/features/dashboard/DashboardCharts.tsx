import type { DashboardBucketPayload } from "../../api/backofficeRealData";
import { useI18n } from "../../i18n/I18nProvider";
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

function getValue(bucket: DashboardBucketPayload, series: DashboardChartSeries) {
  return normalizeDashboardNumber(bucket[series.key]);
}

function getScale(values: number[]) {
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);

  return {
    minimum,
    maximum: maximum === minimum ? minimum + 1 : maximum
  };
}

function getY(value: number, values: number[]) {
  const scale = getScale(values);
  const ratio = (value - scale.minimum) / (scale.maximum - scale.minimum);
  return plot.top + plotHeight - ratio * plotHeight;
}

function getX(index: number, count: number) {
  if (count <= 1) {
    return plot.left + plotWidth / 2;
  }

  return plot.left + (index / Math.max(1, count - 1)) * plotWidth;
}

function linePath(buckets: DashboardBucketPayload[], series: DashboardChartSeries) {
  const values = buckets.map((bucket) => getValue(bucket, series));

  return buckets
    .map((bucket, index) => {
      const x = getX(index, buckets.length);
      const y = getY(getValue(bucket, series), values);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function Grid({ buckets }: { buckets: DashboardBucketPayload[] }) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = plot.top + ratio * plotHeight;
        return (
          <line
            key={ratio}
            stroke="var(--admin-line, rgba(148, 163, 184, 0.25))"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
            x1={plot.left}
            x2={chartWidth - plot.right}
            y1={y}
            y2={y}
          />
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
  empty
}: {
  title: string;
  description: string;
  buckets: DashboardBucketPayload[];
  series: readonly DashboardChartSeries[];
  children: React.ReactNode;
  empty: boolean;
}) {
  const { language } = useI18n();

  return (
    <figure className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-panel">
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
          aria-hidden="true"
          className="dashboard-chart h-auto w-full text-ink/45"
          data-dashboard-chart-empty={empty ? "true" : undefined}
          role="img"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <Grid buckets={buckets} />
          {children}
        </svg>
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
  const series = right ? [left, right] : [left];
  const leftValues = buckets.map((bucket) => getValue(bucket, left));
  const rightValues = right ? buckets.map((bucket) => getValue(bucket, right)) : [];

  return (
    <ChartFrame
      buckets={buckets}
      description={description}
      empty={buckets.length === 0}
      series={series}
      title={title}
    >
      {buckets.length > 0 ? (
        <>
          <text fill="currentColor" fontSize="11" fontWeight="700" x={plot.left} y={18}>
            {left.label} · {left.unit}
          </text>
          <path
            d={linePath(buckets, left)}
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
              cy={getY(getValue(bucket, left), leftValues)}
              fill="var(--admin-surface, white)"
              key={bucket.key}
              r="4"
              stroke={left.color ?? lineColors[0]}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
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
                d={linePath(buckets, right)}
                fill="none"
                stroke={right.color ?? lineColors[1]}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              {buckets.map((bucket, index) => {
                const x = getX(index, buckets.length);
                const y = getY(getValue(bucket, right), rightValues);
                const radius = 5;
                return (
                  <polygon
                    fill="var(--admin-surface, white)"
                    key={bucket.key}
                    points={`${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`}
                    stroke={right.color ?? lineColors[1]}
                    strokeWidth="2.5"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
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
