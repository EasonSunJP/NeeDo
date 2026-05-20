import { useMemo, useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { useEntityStore } from "../../../state/entityStore";
import type { DispatchCycle } from "../../dispatch-center/domain";
import {
  closeDispatchFeedback,
  getCycleFeedbackMatrix,
  getPlanningProgressForCycle,
  sendDispatchFeedbackReminder,
  type DispatchScheduleCellStatus,
  type DispatchScheduleGridData
} from "../../dispatch-center/store";
import { ScheduleGrid } from "../../dispatch-center/components/ScheduleGrid";

function getFeedbackCellScheduleStatus(status: "available" | "unavailable" | "none" | "updated"): DispatchScheduleCellStatus {
  if (status === "available") {
    return "open";
  }

  if (status === "updated") {
    return "pending";
  }

  if (status === "unavailable") {
    return "conflict";
  }

  return "closed";
}

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
  const feedbackGrid = useMemo<DispatchScheduleGridData>(() => ({
    cycle,
    dates: [dateKey],
    headers: Array.from({ length: 24 }, (_, hour) => ({
      key: `${dateKey}-${hour}`,
      label: `${String(hour).padStart(2, "0")}:00`,
      sublabel: "1h"
    })),
    nowHour: 0,
    rows: rows.map((row) => ({
      technicianId: row.technicianId,
      technicianName: row.technicianName,
      technicianSubtitle: `${row.submittedHours} 格可上班 · ${row.unavailableHours} 格不可上班`,
      technicianAvatar: technicianAvatarMap.get(row.technicianId) ?? "",
      scheduledHours: row.submittedHours,
      cells: row.cells.map((cell) => {
        const title = getFeedbackCellTitle(cell.status);

        return {
          id: `feedback-${row.technicianId}-${cell.date}-${cell.hour}`,
          date: cell.date,
          detail: row.note || cell.label,
          darkened: false,
          hour: cell.hour,
          isCurrent: false,
          status: getFeedbackCellScheduleStatus(cell.status),
          technicianAvatar: technicianAvatarMap.get(row.technicianId) ?? "",
          technicianId: row.technicianId,
          technicianName: row.technicianName,
          title
        };
      })
    }))
  }), [cycle, dateKey, rows, technicianAvatarMap]);
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const cardClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-card";
  const labelTextClass = isMobileSurface ? "text-ink/45" : "text-ink/45";
  const toggleClass = isMobileSurface ? "border-line bg-white/80 text-ink/60" : "merchant-dispatch-toggle";
  const toggleActiveClass = isMobileSurface ? "border-moss bg-moss text-white" : "is-active";
  const deadlineClass = isMobileSurface ? "border-line bg-white/80 text-ink" : "merchant-dispatch-field";
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
            <article className={cn("ml-auto flex h-10 min-w-0 shrink items-center justify-end gap-2 rounded-full border px-3", deadlineClass)}>
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
          <ScheduleGrid
            compactHeader
            data={feedbackGrid}
            onSelectCell={(cell) => onMessage(`${cell.technicianName ?? "技师"} ${cell.date} ${String(cell.hour ?? 0).padStart(2, "0")}:00：${cell.title}`)}
            showActualWorkStatus={false}
            stickyTop={surface === "mobile" ? "var(--client-schedule-substicky-top, 0px)" : undefined}
            surface={surface}
          />
        </div>
      </section>
      )}
    </div>
  );
}
