import type { DashboardBucketPayload } from "../../api/backofficeRealData";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { useI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { createDashboardAxis } from "./dashboardChartScale";
import { formatDashboardNumber } from "./dashboardFormat";

export type ScheduleStatusChartBucket = Pick<
  DashboardBucketPayload,
  "key" | "label" | "scheduleAvailableHours" | "scheduleBookedHours" | "scheduleAttendanceCount"
>;

const width = 720;
const height = 280;
const plot = { top: 32, right: 54, bottom: 46, left: 54 };
const plotWidth = width - plot.left - plot.right;
const plotHeight = height - plot.top - plot.bottom;

function x(index: number, count: number) {
  return count <= 1 ? plot.left + plotWidth / 2 : plot.left + (index / (count - 1)) * plotWidth;
}

export function ScheduleStatusChart({ title, description, buckets }: {
  title: string;
  description: string;
  buckets: ScheduleStatusChartBucket[];
}) {
  const { language } = useI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const series = [
    { key: "scheduleBookedHours" as const, label: t("已预约时长"), unit: t("小时"), color: "var(--admin-warning, #f59e0b)" },
    { key: "scheduleAvailableHours" as const, label: t("空闲时长"), unit: t("小时"), color: "var(--admin-success, #10b981)" }
  ];
  const attendance = { label: t("出勤人数"), unit: t("人"), color: "var(--admin-accent, #3b82f6)" };
  const durationAxis = createDashboardAxis(buckets.flatMap((bucket) => series.map((item) => bucket[item.key])));
  const attendanceAxis = createDashboardAxis(buckets.map((bucket) => bucket.scheduleAttendanceCount));
  const groupWidth = plotWidth / Math.max(1, buckets.length);
  const gap = Math.max(1, Math.min(4, groupWidth * 0.08));
  const barWidth = Math.max(2, Math.min(18, (groupWidth * 0.72 - gap) / 2));
  const line = buckets.map((bucket, index) =>
    `${index ? "L" : "M"} ${x(index, buckets.length).toFixed(2)} ${attendanceAxis.y(bucket.scheduleAttendanceCount, plot.top, plotHeight).toFixed(2)}`
  ).join(" ");

  return (
    <figure className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-panel" data-dashboard-chart-frame="true">
      <figcaption data-dashboard-chart-info="true">
        <TitleWithInfo as="h3" info={<p>{description}</p>} infoPanelMode="tooltip" label={`${t("查看")}${title}${t("说明")}`} title={title} titleClassName="text-base font-black text-ink" variant="paper" />
      </figcaption>
      <div aria-label="图例" className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {[...series, attendance].map((item, index) => (
          <span className="inline-flex items-center gap-2 text-xs font-black text-ink/60" key={item.label}>
            <span aria-hidden="true" className={index === 2 ? "h-2.5 w-2.5 rounded-full" : "h-2.5 w-2.5"} style={{ background: item.color }} />
            {item.label} · {item.unit}
          </span>
        ))}
      </div>
      <div className="relative mt-3 min-w-0 overflow-hidden">
        <svg aria-label={title} className="dashboard-chart h-auto w-full text-ink/45" role="img" viewBox={`0 0 ${width} ${height}`}>
          {durationAxis.ticks.map((tick) => {
            const y = durationAxis.y(tick, plot.top, plotHeight);
            return <g key={tick}><line stroke="var(--admin-line, rgba(148, 163, 184, 0.25))" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" x1={plot.left} x2={width - plot.right} y1={y} y2={y} /><text data-axis-side="left" data-no-i18n fill="currentColor" fontSize="10" textAnchor="end" x={plot.left - 8} y={y + 4}>{formatDashboardNumber(tick, language)}</text></g>;
          })}
          {attendanceAxis.ticks.map((tick) => <text data-axis-side="right" data-no-i18n fill="currentColor" fontSize="10" key={tick} textAnchor="start" x={width - plot.right + 8} y={attendanceAxis.y(tick, plot.top, plotHeight) + 4}>{formatDashboardNumber(tick, language)}</text>)}
          {buckets.map((bucket, index) => <text data-no-i18n fill="currentColor" fontSize="11" key={bucket.key} textAnchor="middle" x={x(index, buckets.length)} y={height - 18}>{bucket.label}</text>)}
          {buckets.flatMap((bucket, bucketIndex) => series.map((item, seriesIndex) => {
            const y = durationAxis.y(bucket[item.key], plot.top, plotHeight);
            return <rect data-schedule-status-bar={seriesIndex ? "available" : "booked"} fill={item.color} height={plot.top + plotHeight - y} key={`${bucket.key}-${item.key}`} rx="3" vectorEffect="non-scaling-stroke" width={barWidth} x={x(bucketIndex, buckets.length) - (barWidth * 2 + gap) / 2 + seriesIndex * (barWidth + gap)} y={y} />;
          }))}
          {buckets.length ? <><path d={line} data-schedule-attendance-line="true" fill="none" stroke={attendance.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" vectorEffect="non-scaling-stroke" />{buckets.map((bucket, index) => <circle cx={x(index, buckets.length)} cy={attendanceAxis.y(bucket.scheduleAttendanceCount, plot.top, plotHeight)} data-schedule-attendance-point="true" fill="var(--admin-surface, white)" key={`${bucket.key}-attendance`} r="4" stroke={attendance.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />)}</> : null}
        </svg>
      </div>
      <table className="sr-only"><caption><span>{title}</span><span>精确数据</span></caption><thead><tr><th>期间</th>{series.map((item) => <th key={item.key}>{item.label}（{item.unit}）</th>)}<th>{attendance.label}（{attendance.unit}）</th></tr></thead><tbody>{buckets.map((bucket) => <tr key={bucket.key}><th data-no-i18n>{bucket.label}</th>{series.map((item) => <td data-no-i18n key={item.key}>{formatDashboardNumber(bucket[item.key], language)}</td>)}<td data-no-i18n>{formatDashboardNumber(bucket.scheduleAttendanceCount, language)}</td></tr>)}</tbody></table>
    </figure>
  );
}
