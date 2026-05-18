import { useEffect, useMemo, useState } from "react";
import type { Schedule, Technician } from "../../types/domain";
import {
  dispatchCurrentHour,
  dispatchFrozenColumnWidth,
  dispatchTodayKey,
  formatDateKey,
  getDispatchWeekdayLabels,
  getDispatchColumnWidth,
  getDisplayDates,
  type DispatchCalendarView
} from "../../lib/dispatchCalendar";
import { useI18n } from "../../i18n/I18nProvider";
import { useHorizontalDragScroll } from "../../lib/useHorizontalDragScroll";
import { cn } from "../../lib/utils";
import { ScheduleViewSegmentedTabs } from "../client-ui/AppScaffold";
import { TitleWithInfo } from "../ui/TitleWithInfo";

type DispatchBucket = {
  key: string;
  label: string;
  shortLabel: string;
  bookingCount: number;
  technicianCount: number;
  isFuture: boolean;
};

const seriesMeta = {
  bookings: {
    label: "预约人数",
    icon: (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <rect height="12" rx="2.4" stroke="currentColor" strokeWidth="2" width="14" x="5" y="8" />
        <path d="M8 4v4M16 4v4M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    ),
    color: "#f3b33e",
    softClass: "bg-[#fff1d2] text-[#8a5c00]"
  },
  technicians: {
    label: "技师人数",
    icon: (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="7.5" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    ),
    color: "#66c2ff",
    softClass: "bg-[#e8f5ff] text-[#1e6697]"
  }
} as const;

function timeToMinutes(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);

  return hour * 60 + minute;
}

function overlapsHour(schedule: Schedule, hour: number) {
  const slotStart = hour * 60;
  const slotEnd = slotStart + 60;
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);

  return start < slotEnd && end > slotStart;
}

function getSeriesPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) {
    return "";
  }

  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function buildBuckets(
  schedules: Schedule[],
  view: DispatchCalendarView,
  currentDate: Date,
  weekdayLabels: string[]
): DispatchBucket[] {
  const referenceDateKey = formatDateKey(currentDate);

  if (view === "day") {
    return Array.from({ length: 24 }, (_, hour) => {
      const daySchedules = schedules.filter((schedule) => schedule.date === referenceDateKey && overlapsHour(schedule, hour));
      const bookingCount = daySchedules.filter((schedule) => schedule.status === "booked").length;
      const technicianCount = new Set(daySchedules.filter((schedule) => schedule.status !== "blocked").map((schedule) => schedule.staffId)).size;
      const isFuture =
        referenceDateKey > dispatchTodayKey || (referenceDateKey === dispatchTodayKey && hour >= dispatchCurrentHour);

      return {
        key: `${referenceDateKey}-${hour}`,
        label: `${referenceDateKey} ${String(hour).padStart(2, "0")}:00`,
        shortLabel: `${String(hour).padStart(2, "0")}:00`,
        bookingCount,
        technicianCount,
        isFuture
      };
    });
  }

  if (view === "week" || view === "month") {
    return getDisplayDates(currentDate, view).map((date) => {
      const dateKey = formatDateKey(date);
      const daySchedules = schedules.filter((schedule) => schedule.date === dateKey);

      return {
        key: dateKey,
        label: `${date.getMonth() + 1}月${date.getDate()}日`,
        shortLabel: view === "month" ? `${date.getDate()}` : `${weekdayLabels[date.getDay()]} ${date.getDate()}`,
        bookingCount: daySchedules.filter((schedule) => schedule.status === "booked").length,
        technicianCount: new Set(daySchedules.filter((schedule) => schedule.status !== "blocked").map((schedule) => schedule.staffId)).size,
        isFuture: dateKey > dispatchTodayKey
      };
    });
  }

  return [];
}

function splitByFuture<T extends DispatchBucket>(rows: T[]) {
  const firstFutureIndex = rows.findIndex((row) => row.isFuture);

  if (firstFutureIndex <= 0) {
    return {
      past: rows,
      future: firstFutureIndex === -1 ? [] : rows
    };
  }

  return {
    past: rows.slice(0, firstFutureIndex + 1),
    future: rows.slice(firstFutureIndex)
  };
}

function getBucketHeading(bucket: DispatchBucket, view: DispatchCalendarView, weekdayLabels: string[]) {
  if (view === "day") {
    const [dateKey, hour] = bucket.key.split(/-(?=\d{1,2}$)/);
    const [year, month, day] = dateKey.split("-");

    return {
      eyebrow: `${month}/${day}`,
      primary: `${String(Number(hour)).padStart(2, "0")}:00`,
      secondary: `${year}`
    };
  }

  const date = new Date(`${bucket.key}T00:00:00`);

  return {
    eyebrow: weekdayLabels[date.getDay()],
    primary: `${date.getMonth() + 1}/${date.getDate()}`,
    secondary: view === "month" ? `${date.getFullYear()}` : bucket.label
  };
}

export function DispatchCapacityChart({
  schedules,
  technicians,
  currentDate,
  view,
  onViewChange,
  horizontalScrollLeft = 0,
  onHorizontalScroll
}: {
  schedules: Schedule[];
  technicians: Technician[];
  currentDate: Date;
  view: DispatchCalendarView;
  onViewChange: (view: DispatchCalendarView) => void;
  horizontalScrollLeft?: number;
  onHorizontalScroll?: (scrollLeft: number) => void;
}) {
  const { language } = useI18n();
  const dispatchWeekdayLabels = getDispatchWeekdayLabels(language);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { scrollRef, dragScrollProps } = useHorizontalDragScroll({
    onScrollLeftChange: onHorizontalScroll,
    scrollLeft: horizontalScrollLeft
  });
  const buckets = useMemo(() => buildBuckets(schedules, view, currentDate, dispatchWeekdayLabels), [currentDate, dispatchWeekdayLabels, schedules, view]);
  const maxValue = useMemo(() => Math.max(1, ...buckets.flatMap((bucket) => [bucket.bookingCount, bucket.technicianCount])), [buckets]);
  const selectedBucket = buckets.find((bucket) => bucket.key === selectedKey) ?? buckets[Math.max(0, buckets.length - 1)];
  const dataColumnWidth = getDispatchColumnWidth(view);
  const plotWidth = Math.max(buckets.length * dataColumnWidth, 1);
  const totalWidth = dispatchFrozenColumnWidth + plotWidth;

  useEffect(() => {
    if (!selectedBucket && buckets.length > 0) {
      setSelectedKey(buckets[Math.max(0, buckets.length - 1)].key);
      return;
    }

    if (selectedKey && !buckets.some((bucket) => bucket.key === selectedKey)) {
      setSelectedKey(buckets[Math.max(0, buckets.length - 1)]?.key ?? null);
    }
  }, [buckets, selectedBucket, selectedKey]);

  const plot = useMemo(() => {
    const height = 260;
    const width = plotWidth;
    const left = dataColumnWidth / 2;
    const top = 18;
    const bottom = 34;
    const usableWidth = width - left * 2;
    const usableHeight = height - top - bottom;
    const toPoint = (bucket: DispatchBucket, index: number) => {
      const x = left + (index / Math.max(1, buckets.length - 1)) * usableWidth;
      const bookingY = top + usableHeight - (bucket.bookingCount / maxValue) * usableHeight;
      const technicianY = top + usableHeight - (bucket.technicianCount / maxValue) * usableHeight;

      return {
        x,
        bookingY,
        technicianY
      };
    };

    const points = buckets.map(toPoint);
    const bookingRows = buckets.map((bucket, index) => ({ ...bucket, x: points[index].x, y: points[index].bookingY }));
    const technicianRows = buckets.map((bucket, index) => ({ ...bucket, x: points[index].x, y: points[index].technicianY }));

    const splitBooking = splitByFuture(bookingRows);
    const splitTechnicians = splitByFuture(technicianRows);

    return {
      width,
      height,
      left,
      bottom,
      top,
      usableHeight,
      lines: [
        {
          key: "bookings-past",
          path: getSeriesPath(splitBooking.past.map((point) => ({ x: point.x, y: point.y }))),
          color: seriesMeta.bookings.color,
          dashed: false
        },
        {
          key: "bookings-future",
          path: getSeriesPath(splitBooking.future.map((point) => ({ x: point.x, y: point.y }))),
          color: seriesMeta.bookings.color,
          dashed: true
        },
        {
          key: "technicians-past",
          path: getSeriesPath(splitTechnicians.past.map((point) => ({ x: point.x, y: point.y }))),
          color: seriesMeta.technicians.color,
          dashed: false
        },
        {
          key: "technicians-future",
          path: getSeriesPath(splitTechnicians.future.map((point) => ({ x: point.x, y: point.y }))),
          color: seriesMeta.technicians.color,
          dashed: true
        }
      ],
      points: bookingRows.map((bucket, index) => ({
        key: bucket.key,
        label: bucket.label,
        x: bucket.x,
        bookingY: bucket.y,
        technicianY: technicianRows[index].y,
        bookingCount: bucket.bookingCount,
        technicianCount: technicianRows[index].technicianCount,
        isFuture: bucket.isFuture
      }))
    };
  }, [buckets, dataColumnWidth, maxValue, plotWidth]);

  const chartTitle = {
    day: "单日 24 小时排班容量",
    week: "本周排班容量趋势",
    month: "本月排班容量趋势"
  }[view];
  const rangeLabel = {
    day: `${formatDateKey(currentDate)} · 24 小时`,
    week: `${formatDateKey(currentDate)} 所在周`,
    month: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`
  }[view];

  return (
    <section
      className="rounded-lg border border-line p-4 shadow-panel"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--admin-topbar) 74%, transparent), color-mix(in srgb, var(--admin-surface) 100%, transparent))"
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-ink/70"
              style={{ background: "color-mix(in srgb, var(--admin-muted-surface) 86%, transparent)" }}
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                <path d="M4 19V9M10 19V5M16 19v-7M4 19h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
              </svg>
            </span>
            <TitleWithInfo
              as="h2"
              info="实线表示已发生或已沉淀数据，虚线表示未来预约与可排班预测。"
              label={`${chartTitle}说明`}
              title={chartTitle}
              titleClassName="text-lg font-bold"
              variant="paper"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex min-h-10 items-center rounded-full border px-3 text-xs font-black text-ink/70"
            style={{
              borderColor: "color-mix(in srgb, var(--admin-line) 100%, transparent)",
              background: "color-mix(in srgb, var(--admin-muted-surface) 90%, transparent)"
            }}
          >
            {rangeLabel}
          </span>
          <ScheduleViewSegmentedTabs onChange={onViewChange} value={view} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: seriesMeta.bookings.label,
            value: `${selectedBucket?.bookingCount ?? 0} 人`,
            hint: selectedBucket?.label ?? "-",
            meta: seriesMeta.bookings
          },
          {
            label: seriesMeta.technicians.label,
            value: `${selectedBucket?.technicianCount ?? 0} 人`,
            hint: selectedBucket?.label ?? "-",
            meta: seriesMeta.technicians
          },
          {
            label: "最大预约峰值",
            value: `${Math.max(...buckets.map((bucket) => bucket.bookingCount), 0)} 人`,
            hint: "排班需重点关注",
            meta: seriesMeta.bookings
          },
          {
            label: "最大技师投入",
            value: `${Math.max(...buckets.map((bucket) => bucket.technicianCount), 0)} 人`,
            hint: `共 ${technicians.length} 名技师在调度池`,
            meta: seriesMeta.technicians
          }
        ].map((card) => (
          <article
            className="rounded-lg border border-line p-3"
            key={card.label}
            style={{ background: "color-mix(in srgb, var(--admin-muted-surface) 88%, transparent)" }}
          >
            <div className="flex items-center gap-2">
              <span className={cn("grid h-8 w-8 place-items-center rounded-full", card.meta.softClass)}>{card.meta.icon}</span>
              <p className="text-xs font-black text-ink/55">{card.label}</p>
            </div>
            <strong className="mt-3 block text-2xl text-ink">{card.value}</strong>
            <p className="mt-2 text-xs text-ink/45">{card.hint}</p>
          </article>
        ))}
      </div>

      <div
        className="mt-4 overflow-x-auto rounded-lg border border-line p-3 cursor-grab active:cursor-grabbing"
        ref={scrollRef}
        style={{
          touchAction: "pan-y",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--admin-muted-surface) 92%, transparent), color-mix(in srgb, var(--admin-surface) 100%, transparent))"
        }}
        {...dragScrollProps}
      >
        <div className="min-w-max" style={{ width: totalWidth }}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {[
              { key: "bookings", label: seriesMeta.bookings.label, icon: seriesMeta.bookings.icon, color: seriesMeta.bookings.color },
              { key: "technicians", label: seriesMeta.technicians.label, icon: seriesMeta.technicians.icon, color: seriesMeta.technicians.color }
            ].map((legend) => (
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black text-ink"
                key={legend.key}
                style={{ background: "color-mix(in srgb, var(--admin-surface) 86%, transparent)" }}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full" style={{ backgroundColor: `${legend.color}22`, color: legend.color }}>
                  {legend.icon}
                </span>
                {legend.label}
              </span>
            ))}
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black text-ink/65"
              style={{ background: "color-mix(in srgb, var(--admin-surface) 86%, transparent)" }}
            >
              <span className="h-[2px] w-8 rounded-full bg-ink" />
              历史
            </span>
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black text-ink/65"
              style={{ background: "color-mix(in srgb, var(--admin-surface) 86%, transparent)" }}
            >
              <span className="h-[2px] w-8 border-t-2 border-dashed border-ink" />
              未来
            </span>
          </div>

          <div className="grid min-w-max" style={{ gridTemplateColumns: `${dispatchFrozenColumnWidth}px repeat(${buckets.length}, ${dataColumnWidth}px)` }}>
            <div
              className="sticky left-0 z-10 border-b border-r border-line px-4 py-3 text-xs font-black text-ink/45"
              style={{ background: "color-mix(in srgb, var(--admin-surface) 90%, transparent)" }}
            >
              日期 / 容量
            </div>
            {buckets.map((bucket) => {
              const heading = getBucketHeading(bucket, view, dispatchWeekdayLabels);
              const selected = selectedBucket?.key === bucket.key;

              return (
                <button
                  className={cn(
                    "focus-ring border-b border-r border-line px-2 py-3 text-center transition",
                    selected ? "text-ink" : "text-ink/60"
                  )}
                  key={`heading-${bucket.key}`}
                  onClick={() => setSelectedKey(bucket.key)}
                  type="button"
                  style={{
                    background: selected
                      ? "color-mix(in srgb, var(--admin-accent) 14%, var(--admin-surface))"
                      : "color-mix(in srgb, var(--admin-surface) 90%, transparent)"
                  }}
                >
                  <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-ink/40">{heading.eyebrow}</span>
                  <strong className="mt-1 block text-sm font-black">{heading.primary}</strong>
                  <span className="mt-1 block text-[10px] font-bold text-ink/40">{heading.secondary}</span>
                </button>
              );
            })}

            <div
              className="sticky left-0 z-10 border-r border-line px-4 py-3 text-[11px] font-black text-ink/45"
              style={{ background: "color-mix(in srgb, var(--admin-surface) 90%, transparent)" }}
            >
              拖动这里或下方日历，日期位置会同步。
            </div>
            <div className="border-b border-line border-r border-line px-2 py-2 text-[11px] font-black text-ink/45" style={{ gridColumn: `2 / span ${buckets.length}`, background: "color-mix(in srgb, var(--admin-topbar) 70%, transparent)" }}>
              与下方调度日历使用同一日期范围与横向位置，横向拖动任意一块都会同步对齐。
            </div>
            <div
              className="sticky left-0 z-10 border-r border-line"
              style={{ background: "color-mix(in srgb, var(--admin-surface) 90%, transparent)" }}
            />
            <svg
              className="overflow-visible"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              style={{ width: plotWidth, height: plot.height, gridColumn: `2 / span ${buckets.length}` }}
              viewBox={`0 0 ${plot.width} ${plot.height}`}
            >
              {Array.from({ length: maxValue + 1 }, (_, index) => {
                const y = plot.top + plot.usableHeight - (index / maxValue) * plot.usableHeight;

                return (
                  <g key={index}>
                    <line stroke="var(--admin-line)" strokeDasharray="4 4" strokeOpacity="0.55" strokeWidth="1" x1={plot.left} x2={plot.width - plot.left} y1={y} y2={y} />
                    <text fill="var(--admin-muted)" fontSize="11" fontWeight="700" textAnchor="end" x={plot.left - 8} y={y + 4}>
                      {index}
                    </text>
                  </g>
                );
              })}

              {plot.lines.map((line) =>
                line.path ? (
                  <path
                    d={line.path}
                    fill="none"
                    key={line.key}
                    stroke={line.color}
                    strokeDasharray={line.dashed ? "8 8" : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                  />
                ) : null
              )}

              {plot.points.map((point, index) => (
                <g key={point.key}>
                  <line
                    stroke={selectedBucket?.key === point.key ? "var(--admin-accent)" : "var(--admin-line)"}
                    strokeDasharray="3 5"
                    strokeOpacity={selectedBucket?.key === point.key ? "0.38" : "0.42"}
                    strokeWidth="1"
                    x1={point.x}
                    x2={point.x}
                    y1={plot.top}
                    y2={plot.height - plot.bottom}
                  />
                  <circle cx={point.x} cy={point.bookingY} fill={seriesMeta.bookings.color} r={selectedBucket?.key === point.key ? 6 : 4.5} />
                  <circle cx={point.x} cy={point.technicianY} fill={seriesMeta.technicians.color} r={selectedBucket?.key === point.key ? 6 : 4.5} />
                  <rect
                    data-scroll-drag-ignore="true"
                    fill="transparent"
                    height={plot.height}
                    onClick={() => setSelectedKey(point.key)}
                    rx="8"
                    width={dataColumnWidth}
                    x={point.x - dataColumnWidth / 2}
                    y={0}
                  />
                  <text
                    fill={selectedBucket?.key === point.key ? "var(--admin-text)" : "var(--admin-muted)"}
                    fontSize={view === "month" ? "10" : "11"}
                    fontWeight={selectedBucket?.key === point.key ? "800" : "700"}
                    textAnchor="middle"
                    x={point.x}
                    y={plot.height - 8}
                  >
                    {view === "month" && index % 2 === 1 ? "" : view === "day" ? buckets[index]?.shortLabel : dispatchWeekdayLabels[new Date(`${buckets[index]?.key}T00:00:00`).getDay()]}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
