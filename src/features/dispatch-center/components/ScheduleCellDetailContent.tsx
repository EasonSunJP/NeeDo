import type { CSSProperties } from "react";
import { Badge } from "../../../components/ui/Badge";
import type { BadgeTone } from "../../../components/ui/Badge";
import { useI18n } from "../../../i18n/I18nProvider";
import { translateText } from "../../../i18n/translations";
import { cn } from "../../../lib/utils";
import type { DispatchScheduleCell, DispatchScheduleCellStatus, DispatchScheduleDaySlot } from "../store";

type ScheduleDetailTone = "available" | "scheduled" | "booked" | "conflictPending" | "other" | "standby" | "travel" | "inService" | "extraTime" | "breakBuffer" | "closed";

const legendItems: Array<{ label: string; tone: ScheduleDetailTone }> = [
  { label: "已排班", tone: "scheduled" },
  { label: "有预约", tone: "booked" },
  { label: "冲突 / 待定", tone: "conflictPending" },
  { label: "其他行程", tone: "other" },
  { label: "待机", tone: "standby" },
  { label: "移动", tone: "travel" },
  { label: "服务中", tone: "inService" },
  { label: "加钟", tone: "extraTime" },
  { label: "休息/缓冲", tone: "breakBuffer" }
];

const daySlotStatusLabel: Record<DispatchScheduleCellStatus, string> = {
  idle: "未选择",
  open: "可排班",
  confirmed: "已排班",
  booked: "有预约",
  conflict: "冲突 / 待定",
  pending: "冲突 / 待定",
  other: "其他行程",
  closed: "未开放"
};

function getScheduleToneCssKey(tone: ScheduleDetailTone) {
  if (tone === "conflictPending") {
    return "conflict-pending";
  }

  if (tone === "inService") {
    return "in-service";
  }

  if (tone === "extraTime") {
    return "extra-time";
  }

  if (tone === "breakBuffer") {
    return "break-buffer";
  }

  return tone;
}

function getScheduleDetailTone(status: DispatchScheduleCellStatus): ScheduleDetailTone {
  if (status === "open") {
    return "available";
  }

  if (status === "confirmed") {
    return "scheduled";
  }

  if (status === "booked") {
    return "booked";
  }

  if (status === "conflict" || status === "pending") {
    return "conflictPending";
  }

  if (status === "other") {
    return "other";
  }

  return "closed";
}

function getScheduleToneClassName(tone: ScheduleDetailTone) {
  return `schedule-legend-badge schedule-legend-badge--${getScheduleToneCssKey(tone)}`;
}

function getScheduleToneStyle(tone: ScheduleDetailTone) {
  const cssTone = getScheduleToneCssKey(tone);

  return {
    background: `var(--schedule-tone-${cssTone}-bg)`,
    borderColor: `var(--schedule-tone-${cssTone}-border)`,
    color: `var(--schedule-tone-${cssTone}-text)`,
    textShadow: `var(--schedule-tone-${cssTone}-text-shadow, none)`
  } satisfies CSSProperties;
}

function getTimeSlotStyle(status: DispatchScheduleCellStatus) {
  return getScheduleToneStyle(getScheduleDetailTone(status));
}

function getSlotBadgeTone(status: DispatchScheduleCellStatus): BadgeTone {
  if (status === "booked") {
    return "green";
  }

  if (status === "confirmed" || status === "open") {
    return "blue";
  }

  if (status === "conflict" || status === "pending") {
    return "red";
  }

  if (status === "other") {
    return "yellow";
  }

  return "neutral";
}

function getLegendBadgeTone(tone: ScheduleDetailTone): BadgeTone {
  if (tone === "standby") {
    return "dark";
  }

  if (tone === "extraTime" || tone === "breakBuffer" || tone === "conflictPending") {
    return "red";
  }

  if (tone === "booked" || tone === "scheduled") {
    return "green";
  }

  if (tone === "available" || tone === "travel" || tone === "inService") {
    return "blue";
  }

  if (tone === "other") {
    return "yellow";
  }

  return "neutral";
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function buildDaySegments(dayTimeline: DispatchScheduleDaySlot[]) {
  return dayTimeline.reduce<Array<{
    startHour: number;
    endHour: number;
    status: DispatchScheduleCellStatus;
    title: string;
    detail: string;
  }>>((segments, slot) => {
    const previous = segments[segments.length - 1];

    if (previous && previous.endHour === slot.hour && previous.status === slot.status && previous.title === slot.title && previous.detail === slot.detail) {
      previous.endHour = slot.hour + 1;
      return segments;
    }

    segments.push({
      startHour: slot.hour,
      endHour: slot.hour + 1,
      status: slot.status,
      title: slot.title,
      detail: slot.detail
    });
    return segments;
  }, []);
}

export function ScheduleCellDetailContent({
  cell,
  surface
}: {
  cell: DispatchScheduleCell;
  surface: "desktop" | "mobile";
}) {
  const isMobileSurface = surface === "mobile";
  const { language } = useI18n();
  const t = (text: string) => translateText(text, language);
  const cardClass = isMobileSurface
    ? "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)]"
    : "merchant-dispatch-card";
  const softPanelClass = isMobileSurface
    ? "bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)]"
    : "merchant-dispatch-soft-panel";
  const titleTextClass = isMobileSurface ? "text-[color:var(--client-text)]" : "text-ink";
  const quietTextClass = isMobileSurface ? "text-[color:var(--client-muted)]" : "text-ink/58";
  const labelTextClass = isMobileSurface ? "text-[color:var(--client-muted)]" : "text-ink/45";
  const dayTimelineSegments = cell.dayTimeline ? buildDaySegments(cell.dayTimeline).filter((segment) => segment.status !== "closed") : [];

  return (
    <div className="space-y-4">
      <div className={cn("rounded-[22px] p-4", softPanelClass)}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("text-xs font-black uppercase tracking-[0.16em]", labelTextClass)}>{cell.date}</p>
            <h3 className={cn("mt-2 truncate text-2xl font-black", titleTextClass)}>{t(cell.title)}</h3>
            {cell.technicianName ? <p className={cn("mt-2 text-sm font-bold", quietTextClass)}>{cell.technicianName}</p> : null}
          </div>
          <Badge className={getScheduleToneClassName(getScheduleDetailTone(cell.status))} tone={getSlotBadgeTone(cell.status)}>
            {cell.hour == null ? t("区间") : `${String(cell.hour).padStart(2, "0")}:00`}
          </Badge>
        </div>
        <p className={cn("mt-4 text-sm leading-6", quietTextClass)}>{t(cell.detail)}</p>
      </div>

      {cell.dayTimeline?.length ? (
        <section className={cn("rounded-[22px] border p-4", cardClass)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={cn("text-xs font-black uppercase tracking-[0.16em]", labelTextClass)}>{t("当天明细")}</p>
              <h4 className={cn("mt-1 text-lg font-black", titleTextClass)}>{t("该技师当天时间安排")}</h4>
            </div>
            <Badge tone="blue">{cell.technicianName ?? t("单人视图")}</Badge>
          </div>

          <div className="mt-4">
            <div className="grid h-3 overflow-hidden rounded-full bg-black/10" style={{ gridTemplateColumns: "repeat(24,minmax(0,1fr))" }}>
              {cell.dayTimeline.map((slot) => (
                <span
                  aria-label={`${formatHour(slot.hour)} ${t(slot.title)}`}
                  key={`${cell.id}-detail-${slot.hour}`}
                  style={getTimeSlotStyle(slot.status)}
                />
              ))}
            </div>
            <div className={cn("mt-2 flex justify-between text-[10px] font-black", labelTextClass)}>
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {dayTimelineSegments.length > 0 ? (
              dayTimelineSegments.map((segment) => (
                <article className={cn("rounded-2xl border px-3 py-3", isMobileSurface ? "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]" : "border-line bg-white")} key={`${segment.startHour}-${segment.endHour}-${segment.status}-${segment.title}`}>
                  <div className="flex items-start justify-between gap-2">
                    <strong className={cn("text-sm font-black", titleTextClass)}>{formatHour(segment.startHour)}-{formatHour(segment.endHour)}</strong>
                    <Badge className={getScheduleToneClassName(getScheduleDetailTone(segment.status))} tone={getSlotBadgeTone(segment.status)}>
                      {t(daySlotStatusLabel[segment.status])}
                    </Badge>
                  </div>
                  <p className={cn("mt-2 text-sm font-black", titleTextClass)}>{t(segment.title)}</p>
                  <p className={cn("mt-1 text-xs leading-5", quietTextClass)}>{t(segment.detail)}</p>
                </article>
              ))
            ) : (
              <div className={cn("rounded-2xl border border-dashed px-4 py-4 text-sm font-bold", isMobileSurface ? "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-[color:var(--client-muted)]" : "border-line text-ink/45")}>
                {t("当天没有开放时段或排班记录。")}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {legendItems.map((item) => (
          <div className={cn("rounded-2xl border px-4 py-3", cardClass)} key={item.label}>
            <p className={cn("text-xs font-bold", labelTextClass)}>{t("图例")}</p>
            <Badge className={cn("mt-2", getScheduleToneClassName(item.tone))} tone={getLegendBadgeTone(item.tone)}>
              {t(item.label)}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
