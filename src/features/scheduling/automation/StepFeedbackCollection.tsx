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
  sendDispatchFeedbackReminder
} from "../../dispatch-center/store";
import { TechnicianAvatarBadge } from "../../dispatch-center/components/TechnicianListUi";

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
  const stickyColumnWidth = "190px";
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
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const cardClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-card";
  const labelTextClass = isMobileSurface ? "text-ink/45" : "text-ink/45";
  const toggleClass = isMobileSurface ? "border-line bg-white/80 text-ink/60" : "merchant-dispatch-toggle";
  const toggleActiveClass = isMobileSurface ? "border-moss bg-moss text-white" : "is-active";
  const deadlineClass = isMobileSurface ? "border-line bg-white/80 text-ink" : "merchant-dispatch-field";
  const feedbackActionClass = "w-full px-3 font-black";
  const tableShellClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-table-shell";
  const tableHeaderClass = isMobileSurface ? "bg-paper/70 text-ink/45" : "merchant-dispatch-table-header text-ink/45";
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

        <div className="mt-4 overflow-x-auto">
          <div className={cn("min-w-[1180px] rounded-[24px] border", tableShellClass)}>
            <div
              className={cn("grid border-b border-line text-center text-[11px] font-black", tableHeaderClass)}
              style={{ gridTemplateColumns: `${stickyColumnWidth} repeat(24, minmax(40px, 1fr))` }}
            >
              <div className="sticky left-0 z-20 px-3 py-3 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span>技师 / 小时</span>
                </div>
              </div>
              {Array.from({ length: 24 }, (_, hour) => (
                <div className="border-l border-line px-1 py-3" key={hour}>{String(hour).padStart(2, "0")}</div>
              ))}
            </div>

            {rows.map((row) => (
              <div
                className="grid border-b border-line last:border-b-0"
                key={row.technicianId}
                style={{ gridTemplateColumns: `${stickyColumnWidth} repeat(24, minmax(40px, 1fr))` }}
              >
                <div
                  className={cn(
                    "sticky left-0 z-10 flex items-center gap-3 border-r border-line px-3 py-3",
                    isMobileSurface ? "bg-white/80" : "bg-white"
                  )}
                >
                  <TechnicianAvatarBadge alt={row.technicianName} className="h-10 w-10" src={technicianAvatarMap.get(row.technicianId)} />
                  <div className="min-w-0">
                    <p className="text-sm font-black text-ink">{row.technicianName}</p>
                    <p className={cn("mt-1 text-xs", isMobileSurface ? "text-ink/50" : "text-ink/50")}>{row.submittedHours} 格可上班 · {row.unavailableHours} 格不可上班</p>
                  </div>
                </div>
                {row.cells.map((cell) => (
                  <div
                    className={cn(
                      "border-l border-line px-1 py-3 text-[11px] font-black",
                      cell.status === "available"
                        ? isMobileSurface
                          ? "bg-moss/15 text-moss"
                          : "merchant-dispatch-feedback-available"
                        : cell.status === "updated"
                          ? isMobileSurface
                            ? "bg-lemon/25 text-[#795b00]"
                            : "merchant-dispatch-feedback-updated"
                          : cell.status === "unavailable"
                            ? isMobileSurface
                              ? "bg-coral/15 text-coral"
                              : "merchant-dispatch-feedback-unavailable"
                            : isMobileSurface
                              ? "bg-white/80 text-ink/45"
                              : "merchant-dispatch-feedback-empty"
                    )}
                    key={`${row.technicianId}-${cell.hour}`}
                    title={cell.label}
                  >
                    {cell.status === "none" ? "" : cell.status === "updated" ? "改" : cell.status === "available" ? "可" : "不可"}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
