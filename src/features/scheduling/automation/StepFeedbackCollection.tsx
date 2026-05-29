import { useMemo, useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import {
  UnifiedCalendarDayTimeline,
  type UnifiedCalendarEvent,
  type UnifiedCalendarLane,
  type UnifiedCalendarSourceId
} from "../../../components/scheduling/UnifiedUserCalendar";
import { cn } from "../../../lib/utils";
import { useEntityStore } from "../../../state/entityStore";
import type { DispatchCycle } from "../../dispatch-center/domain";
import {
  closeDispatchFeedback,
  getCycleFeedbackMatrix,
  getPlanningProgressForCycle,
  sendDispatchFeedbackReminder,
  type DispatchScheduleCell
} from "../../dispatch-center/store";

function getFeedbackCellTitle(status: "available" | "unavailable" | "none" | "updated") {
  if (status === "available") {
    return "可上班";
  }

  if (status === "updated") {
    return "已更新";
  }

  if (status === "unavailable") {
    return "不可上班";
  }

  return "未反馈";
}

function getFeedbackCellSource(status: "available" | "unavailable" | "none" | "updated"): UnifiedCalendarSourceId {
  if (status === "available" || status === "updated") {
    return "technician";
  }

  if (status === "unavailable") {
    return "merchant";
  }

  return "todo";
}

function formatFeedbackHour(hour: number) {
  return `${String(Math.min(hour, 24)).padStart(2, "0")}:00`;
}

export function StepFeedbackCollection({
  cycle,
  hideMatrix = false,
  onMessage,
  operatorId,
  surface
}: {
  cycle: DispatchCycle;
  hideMatrix?: boolean;
  onMessage: (message: string) => void;
  operatorId: string;
  surface: "desktop" | "mobile";
}) {
  const dateKey = cycle.periodStart;
  const [filter, setFilter] = useState<"all" | "pending" | "updated" | "available" | "unavailable" | "application">("all");
  const { technicians } = useEntityStore();
  const progress = getPlanningProgressForCycle(cycle.id);
  const isMobileSurface = surface === "mobile";
  const allRows = useMemo(() => getCycleFeedbackMatrix(cycle.id, dateKey), [cycle.id, dateKey]);
  const rows = useMemo(() => {
    if (filter === "all") {
      return allRows;
    }

    if (filter === "pending") {
      return allRows.filter((row) => row.submittedHours === 0 && row.unavailableHours === 0);
    }

    if (filter === "updated") {
      return allRows.filter((row) => row.cells.some((cell) => cell.status === "updated"));
    }

    if (filter === "available") {
      return allRows.filter((row) => row.submittedHours > 0);
    }

    if (filter === "unavailable") {
      return allRows.filter((row) => row.unavailableHours > 0);
    }

    return allRows.filter((row) => row.note.trim().length > 0);
  }, [allRows, filter]);
  const exceptionCount = allRows.filter((row) => row.unavailableHours > 0 || row.note.trim().length > 0).length;
  const technicianAvatarMap = useMemo(() => new Map(technicians.map((technician) => [technician.id, technician.avatar])), [technicians]);
  const feedbackCalendar = useMemo(() => {
    const cellByEventId = new Map<string, DispatchScheduleCell>();
    const lanes: UnifiedCalendarLane[] = rows.map((row, index) => ({
      accent: [
        "var(--client-primary)",
        "var(--client-warm)",
        "var(--client-accent)",
        "var(--client-warning)"
      ][index % 4] ?? "var(--client-primary)",
      avatar: technicianAvatarMap.get(row.technicianId) ?? "",
      caption: `${row.submittedHours} 可上班 · ${row.unavailableHours} 不可上班`,
      id: `feedback:${row.technicianId}`,
      label: row.technicianName
    }));
    const events = rows.flatMap((row) => {
      const ranges: Array<{
        cells: typeof row.cells;
        endHour: number;
        startHour: number;
        status: "available" | "unavailable" | "none" | "updated";
      }> = [];

      row.cells.forEach((cell) => {
        if (cell.status === "none") {
          return;
        }

        const previous = ranges[ranges.length - 1];
        if (previous && previous.status === cell.status && previous.endHour === cell.hour) {
          previous.cells.push(cell);
          previous.endHour = cell.hour + 1;
          return;
        }

        ranges.push({
          cells: [cell],
          endHour: cell.hour + 1,
          startHour: cell.hour,
          status: cell.status
        });
      });

      return ranges.map((range): UnifiedCalendarEvent => {
        const representative = range.cells[0];
        const title = getFeedbackCellTitle(range.status);
        const eventId = `feedback-${row.technicianId}-${representative?.date ?? dateKey}-${range.startHour}-${range.endHour}-${range.status}`;
        cellByEventId.set(eventId, {
          date: representative?.date ?? dateKey,
          darkened: false,
          detail: row.note || representative?.label || title,
          hour: range.startHour,
          id: eventId,
          isCurrent: false,
          status: range.status === "available" ? "open" : range.status === "updated" ? "pending" : "conflict",
          technicianId: row.technicianId,
          technicianName: row.technicianName,
          title
        });

        return {
          badge: title,
          calendarId: `feedback:${row.technicianId}`,
          calendarLabel: row.technicianName,
          date: representative?.date ?? dateKey,
          endTime: formatFeedbackHour(range.endHour),
          id: eventId,
          readOnly: true,
          sourceId: getFeedbackCellSource(range.status),
          startTime: formatFeedbackHour(range.startHour),
          subtitle: row.note || `${row.technicianName} · ${range.cells.length} 小时`,
          title
        };
      });
    });

    return { cellByEventId, events, lanes };
  }, [dateKey, rows, technicianAvatarMap]);
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const cardClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-card";
  const labelTextClass = isMobileSurface ? "text-ink/45" : "text-ink/45";
  const toggleClass = isMobileSurface ? "border-line bg-white/80 text-ink/60" : "merchant-dispatch-toggle";
  const toggleActiveClass = isMobileSurface ? "border-moss bg-moss text-white" : "is-active";
  const feedbackActionClass = "w-full px-3 font-black";
  const feedbackSummaryItems = [
    { label: "已提交", tone: "blue" as const, value: `${progress?.submittedCount ?? 0} 人` },
    { label: "已更新", tone: "yellow" as const, value: `${progress?.updatedCount ?? 0} 人` },
    { label: "未反馈", tone: "red" as const, value: `${progress?.pendingCount ?? 0} 人` },
    { label: "异常数量", tone: "red" as const, value: `${exceptionCount} 件` }
  ];
  const feedbackDeadlineLabel = cycle.feedbackDeadline ? cycle.feedbackDeadline.slice(5, 16).replace("T", " ") : "无需截止";

  return (
    <div className="space-y-5">
      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="min-w-0 text-lg font-black">技师反馈</h3>
            <article className="ml-auto flex min-w-0 shrink items-center justify-end gap-2">
              <p className={cn("shrink-0 text-xs font-black", labelTextClass)}>反馈截止</p>
              <Badge className="min-w-0 justify-center truncate rounded-xl px-2.5 py-1 text-sm" tone="blue">{feedbackDeadlineLabel}</Badge>
            </article>
          </div>
          <div className="mt-3 grid w-full grid-cols-2 gap-2">
            <Button className={feedbackActionClass} size="lg" onClick={() => {
              const result = sendDispatchFeedbackReminder(cycle.id, operatorId);
              onMessage(result.ok ? "未反馈技师已收到催促提醒。" : result.message ?? "催促失败。");
            }}>
              提醒未反馈
            </Button>
            <Button className={feedbackActionClass} size="lg" onClick={() => {
              const result = closeDispatchFeedback(cycle.id, operatorId);
              onMessage(result.ok ? "已提前结束反馈并进入最终确认。" : result.message ?? "操作失败。");
            }}>
              提前结束收集
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <div className="grid grid-cols-4 gap-2">
            {feedbackSummaryItems.map((item) => (
              <article className={cn("flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-2 text-center", cardClass)} key={item.label}>
                <p className={cn("w-full truncate text-[11px] font-black leading-tight", labelTextClass)}>{item.label}</p>
                <Badge className="min-w-0 max-w-full justify-center px-1.5 py-0.5 text-[11px] leading-tight" tone={item.tone}>{item.value}</Badge>
              </article>
            ))}
          </div>
        </div>
      </section>

      {hideMatrix ? null : (
      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "全部"],
            ["pending", "只看未反馈"],
            ["updated", "只看有更新"],
            ["available", "只看可上班"],
            ["unavailable", "只看不可上班"],
            ["application", "只看申请"]
          ] as const).map(([value, label]) => (
            <button
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-black transition",
                toggleClass,
                filter === value && toggleActiveClass
              )}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <UnifiedCalendarDayTimeline
            calendarLanes={feedbackCalendar.lanes}
            date={dateKey}
            events={feedbackCalendar.events}
            onOpen={(event) => {
              const cell = feedbackCalendar.cellByEventId.get(event.id);
              onMessage(`${cell?.technicianName ?? event.calendarLabel ?? "技师"} ${event.date} ${event.startTime}：${event.title}`);
            }}
          />
        </div>
      </section>
      )}
    </div>
  );
}
