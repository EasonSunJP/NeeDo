import { useEffect, useMemo, useState } from "react";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { useI18n } from "../../../i18n/I18nProvider";
import { cn } from "../../../lib/utils";
import type { Technician } from "../../../types/domain";
import {
  getCycleModeLabel,
  getCycleStatusLabel,
  type DispatchCycle
} from "../../dispatch-center/domain";
import {
  closeDispatchFeedback,
  getDispatchCycleLimitSummary,
  getPlanningFeedbackRowsForCycle,
  sendDispatchFeedbackReminder
} from "../../dispatch-center/store";
import { ScheduleFloatingActions } from "./ScheduleFloatingActions";

type FeedbackFilter = "submitted" | "updated" | "pending" | "exception";

const feedbackFilters: Array<{ key: FeedbackFilter; label: string }> = [
  { key: "submitted", label: "已提交" },
  { key: "updated", label: "已更新" },
  { key: "pending", label: "未反馈" },
  { key: "exception", label: "异常数量" }
];

const lifecycleSteps = ["模式选择", "规则设定", "技师反馈", "最终确认"];

function formatDateKey(dateKey: string, language: ReturnType<typeof useI18n>["language"]) {
  const locale = language === "zh-Hant" ? "zh-TW" : language === "zh" ? "zh-CN" : language;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Tokyo"
  }).format(new Date(`${dateKey}T00:00:00+09:00`));
}

function formatDeadline(value: string | null, language: ReturnType<typeof useI18n>["language"]) {
  if (!value) {
    return "未设置";
  }

  const [date = "", rawTime = ""] = value.split("T");
  return `${formatDateKey(date, language)} ${rawTime.slice(0, 5)}`;
}

function technicianIdentityLabel(technician: Technician | undefined) {
  if (technician?.identityLabel) {
    return technician.identityLabel;
  }

  const roleLabels: Record<Technician["role"], string> = {
    cleaner: "清洁技师",
    driver: "司机",
    staff: "店铺员工",
    storeManager: "店铺负责人",
    therapist: "店铺技师"
  };

  return technician ? roleLabels[technician.role] : "排班技师";
}

function feedbackStatusCopy(
  cycle: DispatchCycle,
  row: ReturnType<typeof getPlanningFeedbackRowsForCycle>[number],
  filter: FeedbackFilter
) {
  if (filter === "exception") {
    if (row.note) {
      return row.note;
    }
    return "存在需关注时段";
  }

  if (cycle.mode === "STORE_ASSIGN_FINAL") {
    if (filter === "pending") {
      return "尚未确认店铺排班";
    }
    if (filter === "updated") {
      return "已提交请假或调整信息";
    }
    return "已确认店铺排班";
  }

  if (filter === "pending") {
    return "未完成下一周期排班";
  }
  if (filter === "updated") {
    return "已更新下一周期排班";
  }
  return "已完成下一周期排班";
}

export function SchedulePlanningOverview({
  cycle,
  hasBuilderCycle,
  onMessage,
  onOpenBuilder,
  onOpenConfirmation,
  operatorId,
  storeId,
  surface,
  technicians
}: {
  cycle: DispatchCycle | null;
  hasBuilderCycle: boolean;
  onMessage: (message: string) => void;
  onOpenBuilder: () => void;
  onOpenConfirmation: () => void;
  operatorId: string;
  storeId: string;
  surface: "desktop" | "mobile";
  technicians: Technician[];
}) {
  const { language } = useI18n();
  const [selectedFilter, setSelectedFilter] = useState<FeedbackFilter>("pending");
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [reminderSentForCycleId, setReminderSentForCycleId] = useState<string | null>(null);
  const isMobileSurface = surface === "mobile";
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const cardClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-card";
  const cycleRows = cycle ? getPlanningFeedbackRowsForCycle(cycle.id) : [];
  const technicianMap = useMemo(
    () => new Map(technicians.map((technician) => [technician.id, technician])),
    [technicians]
  );
  const limitSummary = getDispatchCycleLimitSummary(storeId);
  const counts: Record<FeedbackFilter, number> = {
    submitted: cycleRows.filter((row) => row.hasSubmitted && !row.hasUpdated).length,
    updated: cycleRows.filter((row) => row.hasUpdated).length,
    pending: cycleRows.filter((row) => !row.hasSubmitted).length,
    exception: cycleRows.filter((row) => row.hasException).length
  };
  const selectedRows = cycleRows.filter((row) => {
    if (selectedFilter === "submitted") return row.hasSubmitted && !row.hasUpdated;
    if (selectedFilter === "updated") return row.hasUpdated;
    if (selectedFilter === "pending") return !row.hasSubmitted;
    return row.hasException;
  });
  const canCollectFeedback = cycle?.status === "collecting_feedback";
  const canRemind = Boolean(canCollectFeedback && counts.pending > 0 && reminderSentForCycleId !== cycle?.id);
  const canCreateCycle = hasBuilderCycle || !limitSummary.limitReached;

  useEffect(() => {
    setSelectedFilter("pending");
    setConfirmCloseOpen(false);
    setReminderSentForCycleId(null);
  }, [cycle?.id]);

  const runReminder = () => {
    if (!cycle || !canRemind) {
      return;
    }

    const result = sendDispatchFeedbackReminder(cycle.id, operatorId);
    if (result.ok) {
      setReminderSentForCycleId(cycle.id);
    }
    onMessage(result.ok ? "已提醒未反馈技师。" : result.message ?? "提醒失败。");
  };

  const confirmClose = () => {
    if (!cycle || !canCollectFeedback) {
      return;
    }

    const result = closeDispatchFeedback(cycle.id, operatorId);
    setConfirmCloseOpen(false);
    onMessage(result.ok ? "已提前结束反馈并进入最终确认。" : result.message ?? "无法结束反馈收集。");
  };

  return (
    <div
      className={cn("space-y-4", isMobileSurface && "pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]")}
      data-schedule-planning-overview="true"
    >
      <section className={cn("rounded-[28px] border p-4", sectionClass)}>
        {cycle ? (
          <>
            <p className="text-xs font-black tracking-[0.14em] text-ink/45">下一周期</p>
            <h2 className="mt-1 text-lg font-black">
              下一周期 {formatDateKey(cycle.periodStart, language)} ～ {formatDateKey(cycle.periodEnd, language)}
            </h2>
            <div className="mt-4 grid grid-cols-4 gap-2" aria-label="排班流程">
              {lifecycleSteps.map((label, index) => {
                const step = index + 1;
                const active = cycle.currentStep === step;
                const complete = cycle.currentStep > step;
                return (
                  <div className="min-w-0 text-center" key={label}>
                    <span
                      className={cn(
                        "mx-auto grid h-9 w-9 place-items-center rounded-full border text-sm font-black",
                        active || complete
                          ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                          : "border-line bg-white/65 text-ink/45"
                      )}
                    >
                      {step}
                    </span>
                    <span className="mt-2 block text-[11px] font-black leading-4">{label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="yellow">{getCycleStatusLabel(cycle.status)}</Badge>
              <Badge tone="neutral">{getCycleModeLabel(cycle.mode)}</Badge>
            </div>
          </>
        ) : (
          <div className="py-2">
            <h2 className="text-lg font-black">下一周期尚未创建</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">新建周期后，这里会显示进度、技师反馈和确认入口。</p>
          </div>
        )}
      </section>

      <section className={cn("rounded-[28px] border p-4", sectionClass)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black">技师反馈</h2>
            <p className="mt-1 text-sm font-semibold text-ink/55">
              反馈截止：{formatDeadline(cycle?.feedbackDeadline ?? null, language)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!canRemind} onClick={runReminder} size="sm">
              {reminderSentForCycleId === cycle?.id ? "已发送提醒" : "提醒未反馈"}
            </Button>
            <Button
              disabled={!canCollectFeedback}
              onClick={() => setConfirmCloseOpen(true)}
              size="sm"
              variant="secondary"
            >
              提前结束收集
            </Button>
          </div>
        </div>

        {cycle ? (
          <p className={cn("mt-3 rounded-2xl px-4 py-3 text-sm leading-6", isMobileSurface ? "bg-paper/70 text-ink/65" : "merchant-dispatch-soft-panel")}>
            {cycle.mode === "STORE_ASSIGN_FINAL"
              ? "店铺先完成下一周期排班；技师确认店铺排班，或提交请假与调整信息。"
              : "技师直接完成自己的下一周期排班；商户只跟踪是否完成或更新，不下发可排班范围供技师选择。"}
          </p>
        ) : null}

        {confirmCloseOpen ? (
          <div className={cn("mt-3 rounded-[20px] border p-4", cardClass)} role="alert">
            <p className="text-sm font-black">确认提前结束反馈收集？</p>
            <p className="mt-1 text-xs leading-5 text-ink/55">结束后将进入最终确认，未反馈技师会保留在统计中。</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={() => setConfirmCloseOpen(false)} size="sm" variant="secondary">继续收集</Button>
              <Button onClick={confirmClose} size="sm">确认结束</Button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="收集情况">
          {feedbackFilters.map((filter) => (
            <button
              aria-label={filter.label}
              aria-pressed={selectedFilter === filter.key}
              className={cn(
                "rounded-[20px] border px-3 py-3 text-left transition",
                cardClass,
                selectedFilter === filter.key && "border-[color:var(--client-primary)] ring-2 ring-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)]"
              )}
              key={filter.key}
              onClick={() => setSelectedFilter(filter.key)}
              type="button"
            >
              <span className="block text-xs font-bold text-ink/55">{filter.label}</span>
              <strong className="mt-1 block text-xl font-black">{counts[filter.key]}</strong>
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3" data-feedback-technician-list={selectedFilter}>
          {selectedRows.length > 0 ? selectedRows.map((row) => {
            const technician = technicianMap.get(row.technicianId);
            const name = technician?.nickname || technician?.name || "排班技师";
            return (
              <article className={cn("flex items-center gap-3 rounded-[20px] border p-3", cardClass)} key={row.technicianId}>
                {technician?.avatar ? (
                  <AvatarImage alt={name} className="h-11 w-11 shrink-0 rounded-[14px]" src={technician.avatar} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[color:color-mix(in_srgb,var(--client-primary)_15%,white)] text-sm font-black text-[color:var(--client-primary)]"
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate text-sm font-black">{name}</strong>
                    <Badge tone={selectedFilter === "exception" ? "red" : selectedFilter === "pending" ? "yellow" : "green"}>
                      {feedbackStatusCopy(cycle as DispatchCycle, row, selectedFilter)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-ink/50">
                    {technician ? technicianIdentityLabel(technician) : row.technicianId}
                  </p>
                </div>
              </article>
            );
          }) : (
            <p className={cn("rounded-[18px] border px-4 py-3 text-sm font-semibold text-ink/50", cardClass)}>
              当前状态下没有技师记录。
            </p>
          )}
        </div>
      </section>

      <ScheduleFloatingActions
        desktopClassName="grid grid-cols-2 gap-3"
        mobileColumnsClassName="grid-cols-2"
        surface={surface}
      >
        <Button className="w-full min-w-0" disabled={!cycle} onClick={onOpenConfirmation} variant="secondary">
          下一周期确认
        </Button>
        <Button className={cn("w-full min-w-0", isMobileSurface && "schedule-wizard-primary-action")} disabled={!canCreateCycle} onClick={onOpenBuilder}>
          新建周期
        </Button>
      </ScheduleFloatingActions>
    </div>
  );
}
