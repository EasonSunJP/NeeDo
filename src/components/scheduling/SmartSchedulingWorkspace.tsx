import { useEffect, useMemo, useState } from "react";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import {
  isSchedulingLiveCycle,
  resolveSchedulingCycleSlots,
  resolveSchedulingCurrentCycle,
  resolveSchedulingCycleTone,
  SchedulingCycleTabs,
  type SchedulingCycleSlotKey
} from "./SchedulingCycleTabs";
import { SmartScheduleLimitedFreeBadge } from "./SmartScheduleLimitedFreeBadge";
import { useEntityStore } from "../../state/entityStore";
import {
  cancelSmartExceptionAutoAction,
  createDispatchCycleDraft,
  enableSmartSchedule,
  getDispatchCycleLimitSummary,
  executeSmartExceptionNow,
  getSmartScheduleReadiness,
  markSmartExceptionHumanOverride,
  resolveSmartScheduleException,
  updateSmartScheduleAutomationPolicy,
  updateSmartScheduleDataSource,
  useDispatchCenterStore
} from "../../features/dispatch-center/store";
import {
  getCycleStatusLabel,
  getSmartColdStartStatusLabel,
  getSmartDataSourceTypeLabel,
  getSmartExceptionTypeLabel,
  getSmartReadinessStatusLabel,
  getSmartScheduleModeLabel,
  type ScheduleExceptionQueueItem,
  type ScheduleRecommendation
} from "../../features/dispatch-center/domain";
import { cn } from "../../lib/utils";

type SmartSchedulingSurface = "desktop" | "mobile";
type SmartCycleSlot = SchedulingCycleSlotKey;

function getQualityTone(score: number): BadgeTone {
  if (score >= 90) {
    return "green";
  }

  if (score >= 70) {
    return "yellow";
  }

  return "red";
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function readReasonPayload(recommendation: ScheduleRecommendation) {
  try {
    return JSON.parse(recommendation.reasonJson) as { score?: number; reasons?: string[] };
  } catch {
    return { score: recommendation.score, reasons: [] };
  }
}

function readReasonList(reasonJson?: string) {
  if (!reasonJson) {
    return [];
  }

  try {
    const payload = JSON.parse(reasonJson) as { reasons?: string[] };
    return Array.isArray(payload.reasons) ? payload.reasons : [];
  } catch {
    return [];
  }
}

function readRecommendedAction(exception: ScheduleExceptionQueueItem) {
  if (!exception.recommendedActionJson) {
    return exception.suggestedAction;
  }

  try {
    const payload = JSON.parse(exception.recommendedActionJson) as { action?: string };
    return payload.action ?? exception.suggestedAction;
  } catch {
    return exception.suggestedAction;
  }
}

function formatCountdown(seconds?: number) {
  const safeSeconds = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
}

function getExceptionStatusLabel(status: ScheduleExceptionQueueItem["status"]) {
  const labels: Record<ScheduleExceptionQueueItem["status"], string> = {
    open: "待处理",
    auto_handling_countdown: "自动处理倒计时",
    human_override_pending: "本次人工处理",
    resolved: "已处理",
    ignored: "已忽略",
    cancelled_auto_action: "已取消自动处理",
    executed: "已执行"
  };

  return labels[status];
}

function exceptionTone(exception: ScheduleExceptionQueueItem): BadgeTone {
  if (exception.status !== "open") {
    return "neutral";
  }

  return exception.severity === "high" ? "red" : exception.severity === "medium" ? "yellow" : "blue";
}

function readinessTone(status: ReturnType<typeof getSmartScheduleReadiness>["status"]): BadgeTone {
  if (status === "ready") {
    return "green";
  }

  if (status === "cold_start") {
    return "yellow";
  }

  return "red";
}

function toneDotClass(tone: BadgeTone) {
  const classes: Partial<Record<BadgeTone, string>> = {
    green: "bg-[color:var(--client-primary)]",
    blue: "bg-sky-400",
    yellow: "bg-[color:var(--client-warning)]",
    red: "bg-[color:var(--client-accent)]",
    neutral: "bg-[color:var(--client-muted)]"
  };

  return classes[tone] ?? classes.neutral;
}

export function SmartSchedulingWorkspace({
  operatorId,
  storeId,
  surface
}: {
  operatorId: string;
  storeId: string;
  surface: SmartSchedulingSurface;
}) {
  const dispatchCenter = useDispatchCenterStore();
  const { technicians } = useEntityStore();
  const isMobileSurface = surface === "mobile";
  const [selectedSlot, setSelectedSlot] = useState<SmartCycleSlot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enableConfirmOpen, setEnableConfirmOpen] = useState(false);
  const scopedCycles = useMemo(
    () =>
      dispatchCenter.cycles
        .filter((cycle) => cycle.storeId === storeId && isSchedulingLiveCycle(cycle))
        .sort((left, right) => left.periodStart.localeCompare(right.periodStart)),
    [dispatchCenter.cycles, storeId]
  );
  const currentCycle = useMemo(() => resolveSchedulingCurrentCycle(scopedCycles), [scopedCycles]);
  const { nextCycle, builderCycle } = useMemo(() => resolveSchedulingCycleSlots(scopedCycles, currentCycle), [currentCycle, scopedCycles]);
  const preferredCycle = useMemo(
    () =>
      scopedCycles.find((cycle) => cycle.status === "smart_exception_pending")
      ?? scopedCycles.find((cycle) => cycle.status === "smart_generated")
      ?? scopedCycles.find((cycle) => cycle.status === "collecting_feedback")
      ?? scopedCycles.find((cycle) => cycle.status === "feedback_closed")
      ?? scopedCycles.find((cycle) => cycle.status === "final_confirming")
      ?? scopedCycles.find((cycle) => cycle.status === "ready_to_confirm")
      ?? scopedCycles.find((cycle) => cycle.status === "active")
      ?? scopedCycles[0]
      ?? null,
    [scopedCycles]
  );
  const preferredSlot: SmartCycleSlot = preferredCycle?.id === nextCycle?.id
    ? "next"
    : preferredCycle?.id === builderCycle?.id
      ? "builder"
      : "current";
  const activeSlot = selectedSlot ?? preferredSlot;
  const selectedCycle =
    activeSlot === "current"
      ? currentCycle
      : activeSlot === "next"
        ? nextCycle
        : builderCycle;
  const limitSummary = getDispatchCycleLimitSummary(storeId);
  const policy = dispatchCenter.smartAutomationPolicies.find((item) => item.shopId === storeId) ?? null;
  const readiness = useMemo(() => getSmartScheduleReadiness(storeId), [dispatchCenter.revision, storeId]);
  const latestRun = useMemo(
    () =>
      selectedCycle
        ? dispatchCenter.smartOptimizationRuns
            .filter((run) => run.cycleId === selectedCycle.id)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
        : null,
    [dispatchCenter.smartOptimizationRuns, selectedCycle]
  );
  const forecasts = selectedCycle
    ? dispatchCenter.smartDemandForecasts.filter((forecast) => forecast.cycleId === selectedCycle.id)
    : [];
  const recommendations = selectedCycle
    ? dispatchCenter.smartRecommendations.filter((recommendation) => recommendation.cycleId === selectedCycle.id && (!latestRun || recommendation.runId === latestRun.id))
    : [];
  const exceptions = selectedCycle
    ? dispatchCenter.smartExceptionQueue.filter((exception) => exception.cycleId === selectedCycle.id)
    : [];
  const confirmedSlots = selectedCycle
    ? dispatchCenter.finalBookableSlots.filter((slot) => slot.cycleId === selectedCycle.id && slot.status === "available")
    : [];
  const dataSources = dispatchCenter.smartDataSources.filter((source) => source.shopId === storeId);
  const signals = selectedCycle ? dispatchCenter.smartSignals.filter((signal) => signal.cycleId === selectedCycle.id) : [];
  const ruleExplanations = selectedCycle
    ? dispatchCenter.smartRuleExplanations.filter((explanation) => explanation.cycleId === selectedCycle.id)
    : [];
  const decisions = selectedCycle
    ? dispatchCenter.smartDecisions.filter((decision) => decision.cycleId === selectedCycle.id)
    : [];
  const storeTechnicians = technicians.filter((technician) => technician.storeId === storeId);
  const preferenceRows = dispatchCenter.smartTechnicianPreferences.filter((preference) => preference.shopId === storeId);
  const autoSubmitCount = new Set(preferenceRows.filter((preference) => preference.autoSubmitEnabled).map((preference) => preference.technicianId)).size;
  const openExceptionCount = exceptions.filter((exception) => exception.status === "open").length;
  const shortageCount = exceptions.filter((exception) => exception.status === "open" && exception.exceptionType === "shortage").length;
  const overflowCount = exceptions.filter((exception) => exception.status === "open" && exception.exceptionType === "overflow").length;
  const conflictCount = exceptions.filter((exception) => exception.status === "open" && (exception.exceptionType === "conflict" || exception.exceptionType === "order_conflict")).length;
  const confirmedRecommendationCount = recommendations.filter((recommendation) => recommendation.status === "auto_confirmed" || recommendation.status === "manual_confirmed").length;
  const confirmCandidateCount = recommendations.filter((recommendation) => recommendation.recommendationType === "confirm").length;
  const autoConfirmRatio = confirmCandidateCount > 0 ? Math.round((confirmedRecommendationCount / confirmCandidateCount) * 100) : 0;
  const score = latestRun?.score ?? 0;
  const policyModeLabel = policy ? getSmartScheduleModeLabel(policy.mode) : "未启用";
  const coldStartStatusLabel = policy ? getSmartColdStartStatusLabel(policy.coldStartStatus) : "未启用";
  const scheduleStatusHref = isMobileSurface ? "/merchant/schedule" : "/merchant-admin/dispatch-center/current";
  const sectionClass = isMobileSurface
    ? "rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] p-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.12)]"
    : "merchant-dispatch-surface rounded-[20px] border p-3 shadow-panel";
  const cardClass = isMobileSurface
    ? "rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)]"
    : "merchant-dispatch-card rounded-[16px] border";
  const softClass = isMobileSurface
    ? "rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_78%,transparent)]"
    : "merchant-dispatch-soft-panel rounded-[14px] border";
  const metricGridClass = isMobileSurface ? "mt-2 grid grid-cols-2 gap-2" : "mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4";
  const mutedTextClass = isMobileSurface ? "text-[color:var(--client-muted)]" : "text-ink/58";
  const titleVariant = isMobileSurface ? "client" : "paper";

  useEffect(() => {
    if (!selectedSlot) {
      setSelectedSlot(preferredSlot);
      return;
    }

    if (!selectedCycle && preferredSlot) {
      setSelectedSlot(preferredSlot);
    }
  }, [preferredSlot, selectedCycle, selectedSlot]);

  const enableSmart = () => {
    enableSmartSchedule(storeId, operatorId);
    setEnableConfirmOpen(false);
    setMessage("已启用全智能无人值守排班：商户端和技师端都会进入智能排班状态，系统开始冷启动或运行。");
  };

  const createCycle = () => {
    if (limitSummary.limitReached || builderCycle) {
      setMessage("当前已有执行周期和待执行周期，无法继续新建。");
      return;
    }

    const cycle = createDispatchCycleDraft(storeId);
    setSelectedSlot("builder");
    setMessage(`${cycle.name} 已创建，可以继续用智能排班生成推荐并进入确认。`);
  };

  const updateExceptionDelay = (value: number) => {
    updateSmartScheduleAutomationPolicy(storeId, { autoExceptionActionDelayMinutes: value });
    setMessage(`异常自动处理倒计时已设为 ${value} 分钟。`);
  };

  const toggleDataSource = (sourceType: (typeof dataSources)[number]["sourceType"], enabled: boolean) => {
    updateSmartScheduleDataSource(storeId, sourceType, { enabled });
  };

  const cancelExceptionAutoAction = (exceptionId: string) => {
    const result = cancelSmartExceptionAutoAction(exceptionId, operatorId);
    setMessage(result.ok ? "已取消本次自动处理，该异常会进入人工处理队列。" : result.message ?? "取消失败。");
  };

  const markExceptionHumanOverride = (exceptionId: string) => {
    const result = markSmartExceptionHumanOverride(exceptionId, operatorId);
    setMessage(result.ok ? "本次将由人工处理，长期智能规则保持不变。" : result.message ?? "切换失败。");
  };

  const executeExceptionNow = (exceptionId: string) => {
    const result = executeSmartExceptionNow(exceptionId, operatorId);
    setMessage(result.ok ? "已立即执行智能推荐处理，并写入智能处理日志。" : result.message ?? "执行失败。");
  };

  const builderLabel = builderCycle?.status === "confirmed" || builderCycle?.status === "final_confirmed" ? "待执行周期" : "新建周期";
  const cycleTabs = (
    <SchedulingCycleTabs
      activeSlot={activeSlot}
      slots={[
        {
          key: "current",
          cycle: currentCycle,
          label: "当前周期",
          onClick: () => setSelectedSlot("current"),
          tone: resolveSchedulingCycleTone(currentCycle)
        },
        {
          key: "next",
          cycle: nextCycle,
          disabled: !nextCycle,
          label: "下一周期",
          onClick: () => setSelectedSlot("next"),
          tone: resolveSchedulingCycleTone(nextCycle)
        },
        {
          key: "builder",
          cycle: builderCycle,
          disabled: !builderCycle && limitSummary.limitReached,
          label: builderLabel,
          onClick: () => {
            if (builderCycle) {
              setSelectedSlot("builder");
              return;
            }

            createCycle();
          },
          tone: resolveSchedulingCycleTone(builderCycle)
        }
      ]}
      surface={surface}
    />
  );

  return (
    <section className="space-y-3">
      <section className={sectionClass}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">智能排班引擎</Badge>
              <SmartScheduleLimitedFreeBadge surface={surface} />
              {policy ? <Badge tone="neutral">{policy.smartScheduleBillingStatus === "free_limited" ? "计费预留" : policy.smartScheduleBillingStatus}</Badge> : null}
            </div>
            <TitleWithInfo
              as="h2"
              className="mt-2"
              info="智能排班会读取商户规则、技师偏好、预约预测和冲突结果，先生成推荐班表；只有最终确认后才会写入 confirmed_slots 并影响用户端可预约时间。"
              label="智能排班说明"
              title="智能排班"
              titleClassName="text-xl font-black"
              variant={titleVariant}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={readinessTone(readiness.status)}>{getSmartReadinessStatusLabel(readiness.status)}</Badge>
              <span className={cn("text-xs font-semibold", mutedTextClass)}>
                冷启动 {readiness.daysCollected}/{readiness.requiredDays} 天 · 可开启日 {readiness.readyAt}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEnableConfirmOpen(true)} size="sm" variant={policy?.mode === "smart_schedule" && policy.enabled ? "secondary" : "primary"}>
              {policy?.mode === "smart_schedule" && policy.enabled ? "已启用全智能" : "启用全智能排班"}
            </Button>
            <Button size="sm" to={scheduleStatusHref} variant="secondary">查看排班状态</Button>
          </div>
        </div>

        {message ? (
          <div className={cn("mt-3 rounded-2xl px-3 py-2 text-sm font-semibold", isMobileSurface ? "border border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-bg)_70%)] text-[color:var(--client-primary-strong)]" : "merchant-dispatch-alert")}>
            {message}
          </div>
        ) : null}

        <div className={metricGridClass}>
          {[
            ["冷启动进度", `${readiness.progressPercent}%`, readinessTone(readiness.status)],
            ["当前模式", policyModeLabel, policy?.mode === "smart_schedule" ? "green" : policy?.mode === "auto_schedule" ? "yellow" : "neutral"],
            ["智能状态", coldStartStatusLabel, policy?.coldStartStatus === "smart_running" ? "green" : policy?.coldStartStatus === "smart_exception_pending" ? "red" : policy?.coldStartStatus === "smart_auto_handling_countdown" ? "yellow" : "blue"],
            ["排班质量", latestRun ? `${score}分` : "待生成", getQualityTone(score)],
            ["缺人 / 超员", `${shortageCount} / ${overflowCount}`, shortageCount > 0 ? "red" : "green"],
            ["冲突 / 异常", `${conflictCount} / ${openExceptionCount}`, openExceptionCount > 0 ? "yellow" : "green"],
            ["预约样本", `${readiness.observedOrderCount}/${readiness.requiredOrderCount} 单`, readiness.observedOrderCount >= readiness.requiredOrderCount ? "green" : "yellow"],
            ["偏好覆盖", `${readiness.preferenceCoveragePercent}%`, readiness.preferenceCoveragePercent >= readiness.requiredPreferenceCoveragePercent ? "green" : "yellow"],
            ["正式槽位", `${confirmedSlots.length} 格`, confirmedSlots.length > 0 ? "blue" : "neutral"]
          ].map(([label, value, tone]) => (
            <article className={cn(cardClass, isMobileSurface ? "px-3 py-2.5" : "p-3")} key={label}>
              <div className="flex items-center justify-between gap-2">
                <p className={cn("min-w-0 truncate text-[10px] font-black uppercase tracking-[0.08em]", mutedTextClass)}>{label}</p>
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", toneDotClass(tone as BadgeTone))} />
              </div>
              <strong className={cn("mt-1 block font-black leading-tight text-ink", isMobileSurface ? "text-[20px]" : "text-lg")}>{value}</strong>
            </article>
          ))}
        </div>

        {!readiness.canRunSmartSchedule ? (
          <div className={cn("mt-3 rounded-2xl px-3 py-2 text-xs font-semibold leading-5", isMobileSurface ? "border border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-bg)_70%)] text-[color:var(--client-primary-strong)]" : "merchant-dispatch-alert")}>
            正式开启前需要补齐：{readiness.missingItems.join("、")}。冷启动期间系统会保留监控和数据收集，避免把低置信度结果直接写入正式班表。
          </div>
        ) : null}
      </section>

      <section className={sectionClass}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TitleWithInfo
            as="h3"
            info="全智能排班必须显示当前用了哪些数据、哪些缺失、哪些使用平台默认补齐。"
            label="数据来源说明"
            title="数据来源"
            titleClassName="text-lg font-black"
            variant={titleVariant}
          />
          <Badge tone="neutral">ExternalSignalAdapter · mock 可替换</Badge>
        </div>
        <div className={cn("mt-2 grid gap-2", isMobileSurface ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3")}>
          {dataSources.map((source) => (
            <article className={cn(softClass, isMobileSurface ? "px-3 py-2" : "p-3")} key={source.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-black text-ink">{getSmartDataSourceTypeLabel(source.sourceType)}</strong>
                  <p className={cn("mt-0.5 truncate text-[11px] font-semibold", mutedTextClass)}>
                    置信 {Math.round(source.confidenceScore * 100)}% · {source.lastCollectedAt?.slice(5, 16).replace("T", " ") ?? "未收集"}
                  </p>
                </div>
                <ToggleSwitch
                  ariaLabel={`${getSmartDataSourceTypeLabel(source.sourceType)}${source.enabled ? "关闭" : "开启"}`}
                  checked={source.enabled}
                  onChange={(checked) => toggleDataSource(source.sourceType, checked)}
                />
              </div>
              {source.missingReason ? <p className={cn("mt-1 line-clamp-2 text-[11px] leading-4", mutedTextClass)}>{source.missingReason}</p> : null}
            </article>
          ))}
        </div>
        {ruleExplanations.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {ruleExplanations.slice(0, isMobileSurface ? 4 : 10).map((rule) => {
              const reasons = readReasonList(rule.reasonJson);

              return (
                <article className={cn(cardClass, "p-3")} key={rule.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm font-black text-ink">{rule.title}</strong>
                    <Badge tone={rule.confidenceScore >= 0.85 ? "green" : "yellow"}>置信 {Math.round(rule.confidenceScore * 100)}%</Badge>
                  </div>
                  <p className={cn("mt-2 text-xs leading-5", mutedTextClass)}>{reasons.slice(0, 3).join(" / ")}</p>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className={sectionClass}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <TitleWithInfo
            as="h3"
            info="智能排班可以处理当前周期、下期周期或新建周期；不管哪种方式，最终都必须进入当前周期确认。"
            label="周期选择说明"
            title="周期选择"
            titleClassName="text-lg font-black"
            variant={titleVariant}
          />
          {selectedCycle ? <Badge tone="neutral">{getCycleStatusLabel(selectedCycle.status)} · {selectedCycle.periodStart} - {selectedCycle.periodEnd}</Badge> : null}
        </div>
        <div className="mt-3">
          {cycleTabs}
        </div>
        {selectedCycle ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {[
              ["周期", `${selectedCycle.periodStart} - ${selectedCycle.periodEnd}`],
              ["推荐结果", recommendations.length > 0 ? `${recommendations.length} 条推荐 / ${confirmedRecommendationCount} 条已确认` : "待生成"],
              ["确认状态", `${confirmedSlots.length} 个正式槽位 / ${openExceptionCount} 个异常`]
            ].map(([label, value]) => (
              <article className={cn(softClass, "p-3")} key={label}>
                <p className={cn("text-[11px] font-black uppercase tracking-[0.12em]", mutedTextClass)}>{label}</p>
                <strong className="mt-2 block text-sm font-black leading-6 text-ink">{value}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className={cn(cardClass, "mt-3 border-dashed p-3 text-sm font-semibold", mutedTextClass)}>
            当前还没有可确认的排班周期，请先从“新建周期”开始。
          </div>
        )}
      </section>

      <section className={sectionClass}>
        <TitleWithInfo
          as="h3"
          info="这里把商户规则、技师规则、预约预测和优先策略压缩成摘要，详细矩阵留给 PC 后台。"
          label="规则摘要说明"
          title="智能规则摘要"
          titleClassName="text-lg font-black"
          variant={titleVariant}
        />
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["商户规则", selectedCycle ? `最低 ${selectedCycle.ruleSet.minStaff} / 目标 ${selectedCycle.ruleSet.targetStaff} / 最大 ${selectedCycle.ruleSet.maxStaff}` : "-"],
            ["技师规则", `${autoSubmitCount}/${Math.max(1, storeTechnicians.length)} 人开启自动提交`],
            ["预约预测", forecasts.length > 0 ? `${Math.max(...forecasts.map((forecast) => forecast.requiredStaffCount))} 人峰值 / ${forecasts.length} 小时` : "待生成"],
            ["人数规则", selectedCycle ? `周五周末系数 + 节假日规则 ${Object.keys(selectedCycle.ruleSet.holidayAdjustments).length} 条` : "-"],
            ["工时规则", selectedCycle ? `日 ${selectedCycle.ruleSet.maxDailyHours}h / 周 ${selectedCycle.ruleSet.maxWeeklyHours}h` : "-"],
            ["优先策略", selectedCycle ? `${selectedCycle.ruleSet.priorityRules.selectedTechnicianIds.length} 名优先技师 / 语言 ${selectedCycle.ruleSet.priorityRules.selectedLanguages.join("、")}` : "-"]
          ].map(([label, value]) => (
            <article className={cn(softClass, "p-3")} key={label}>
              <p className={cn("text-xs font-black uppercase tracking-[0.16em]", mutedTextClass)}>{label}</p>
              <strong className="mt-2 block text-sm font-black leading-6 text-ink">{value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TitleWithInfo
            as="h3"
            info="推荐班表不会直接展示给用户端。需要进入排班状态确认，或全自动达标后确认，才会生成用户端读取的 confirmed_slots。"
            label="推荐班表说明"
            title="推荐班表"
            titleClassName="text-lg font-black"
            variant={titleVariant}
          />
          <div className="flex flex-wrap gap-2">
            <Badge tone="blue">自动确认比例 {autoConfirmRatio}%</Badge>
            <Button size="sm" to={scheduleStatusHref}>查看排班状态</Button>
            <Button onClick={() => setMessage("已切换为手动接管：你可以到手动排班里逐小时调整，智能结果不会覆盖人工修改。")} size="sm" variant="secondary">手动接管</Button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 xl:grid-cols-2">
          {recommendations.filter((recommendation) => recommendation.recommendationType !== "exclude").slice(0, isMobileSurface ? 6 : 10).map((recommendation) => {
            const technician = technicians.find((item) => item.id === recommendation.technicianId);
            const reasonPayload = readReasonPayload(recommendation);

            return (
              <article className={cn(cardClass, "p-3")} key={recommendation.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={recommendation.recommendationType === "confirm" ? "blue" : "yellow"}>
                        {recommendation.recommendationType === "confirm" ? "推荐确认" : "候补"}
                      </Badge>
                      <Badge tone={recommendation.score >= 80 ? "green" : recommendation.score >= 65 ? "yellow" : "red"}>{recommendation.score}分</Badge>
                    </div>
                    <h4 className="mt-2 text-base font-black text-ink">{recommendation.date} {recommendation.startTime}-{recommendation.endTime}</h4>
                    <p className={cn("mt-1 text-sm font-semibold", mutedTextClass)}>{technician?.nickname ? `${technician.nickname} / ${technician.name}` : technician?.name ?? recommendation.technicianId}</p>
                  </div>
                  <Badge tone={recommendation.status === "auto_confirmed" || recommendation.status === "manual_confirmed" ? "green" : "neutral"}>{recommendation.status}</Badge>
                </div>
                <p className={cn("mt-3 text-xs leading-5", mutedTextClass)}>{(reasonPayload.reasons ?? []).slice(0, 4).join(" / ") || "等待计算理由"}</p>
              </article>
            );
          })}
          {recommendations.length === 0 ? (
            <div className={cn(cardClass, "border-dashed p-3 text-sm font-semibold", mutedTextClass)}>
              尚未生成推荐班表。
            </div>
          ) : null}
        </div>
      </section>

      <section className={sectionClass}>
        <TitleWithInfo
          as="h3"
          info="异常队列必须可解释：缺人、超员、冲突、未反馈、低评分都在这里处理，不会被隐藏。"
          label="异常队列说明"
          title="异常队列"
          titleClassName="text-lg font-black"
          variant={titleVariant}
        />
        <div className="mt-3 space-y-2">
          {exceptions.length > 0 ? exceptions.slice(0, isMobileSurface ? 5 : 12).map((exception) => (
            <article className={cn(cardClass, "p-3")} key={exception.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={exceptionTone(exception)}>{getSmartExceptionTypeLabel(exception.exceptionType)}</Badge>
                    <Badge tone="neutral">{exception.targetDate} {formatHour(exception.targetHour)}</Badge>
                    <Badge tone={exception.status === "auto_handling_countdown" ? "yellow" : exception.status === "human_override_pending" ? "neutral" : exception.status === "executed" || exception.status === "resolved" ? "green" : "blue"}>
                      {getExceptionStatusLabel(exception.status)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-black text-ink">{exception.description}</p>
                  <p className={cn("mt-1 text-xs font-semibold", mutedTextClass)}>推荐处理：{readRecommendedAction(exception)}</p>
                  {exception.status === "auto_handling_countdown" ? (
                    <p className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700">
                      系统将在 {formatCountdown(exception.countdownSeconds)} 后自动处理
                    </p>
                  ) : null}
                  {readReasonList(exception.reasonJson).length > 0 ? (
                    <p className={cn("mt-2 text-xs leading-5", mutedTextClass)}>
                      {readReasonList(exception.reasonJson).slice(0, 3).join(" / ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => executeExceptionNow(exception.id)} size="sm" variant="secondary">立即执行</Button>
                  <Button onClick={() => cancelExceptionAutoAction(exception.id)} size="sm" variant="secondary">取消自动处理</Button>
                  <Button onClick={() => markExceptionHumanOverride(exception.id)} size="sm" variant="ghost">本次人工处理</Button>
                  <Button onClick={() => resolveSmartScheduleException(exception.id, operatorId, "ignored")} size="sm" variant="ghost">忽略</Button>
                </div>
              </div>
            </article>
          )) : (
            <div className={cn(cardClass, "border-dashed p-3 text-sm font-semibold", mutedTextClass)}>
              当前没有异常，智能排班结果可进入最终确认。
            </div>
          )}
        </div>
      </section>

      {!isMobileSurface ? (
        <section className={sectionClass}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TitleWithInfo
              as="h3"
              info="PC 后台保留完整控制台：预测明细、阈值、日志和结果导出都在这里集中。"
              label="PC 智能控制台说明"
              title="PC 智能控制台"
              titleClassName="text-lg font-black"
              variant="paper"
            />
            {policy ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-black text-ink/55">
                  自动确认阈值
                  <input
                    className="ml-2 h-9 w-20 rounded-full border border-line bg-white px-3 text-sm font-black text-ink outline-none"
                    max={100}
                    min={70}
                    onChange={(event) => updateSmartScheduleAutomationPolicy(storeId, { qualityAutoConfirmThreshold: Number(event.target.value) || 90 })}
                    type="number"
                    value={policy.qualityAutoConfirmThreshold}
                  />
                </label>
                <label className="text-xs font-black text-ink/55">
                  异常倒计时
                  <select
                    className="ml-2 h-9 rounded-full border border-line bg-white px-3 text-sm font-black text-ink outline-none"
                    onChange={(event) => updateExceptionDelay(Number(event.target.value) || 10)}
                    value={policy.autoExceptionActionDelayMinutes}
                  >
                    {[3, 5, 10, 15, 30].map((value) => (
                      <option key={value} value={value}>{value} 分钟</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2 xl:grid-cols-3">
            <article className={cn(softClass, "p-3 xl:col-span-2")}>
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-black text-ink">需求预测</h4>
                <Badge tone="blue">{forecasts.length} 条</Badge>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {forecasts.slice(0, 8).map((forecast) => (
                  <div className="rounded-2xl bg-white/70 px-3 py-2 text-sm font-semibold text-ink" key={forecast.id}>
                    {forecast.date} {formatHour(forecast.hour)} · 预测 {forecast.predictedOrders} 单 · 建议 {forecast.requiredStaffCount} 人 · 置信 {Math.round(forecast.confidenceScore * 100)}%
                  </div>
                ))}
                {forecasts.length === 0 ? <p className={cn("text-sm font-semibold", mutedTextClass)}>生成后会显示逐小时预测。</p> : null}
              </div>
            </article>
            <article className={cn(softClass, "p-3")}>
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-black text-ink">智能排班日志</h4>
                <Badge tone="neutral">{dispatchCenter.smartOptimizationRuns.filter((run) => run.shopId === storeId).length} 次</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {dispatchCenter.smartOptimizationRuns.filter((run) => run.shopId === storeId).slice(0, 5).map((run) => (
                  <div className="rounded-2xl bg-white/70 px-3 py-2 text-xs font-semibold leading-5 text-ink" key={run.id}>
                    {run.createdAt.slice(5, 16).replace("T", " ")} · {run.runType} · {run.score}分 · {run.status}
                  </div>
                ))}
              </div>
            </article>
            <article className={cn(softClass, "p-3 xl:col-span-2")}>
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-black text-ink">天气 / 路况信号</h4>
                <Badge tone="neutral">{signals.length} 条</Badge>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {signals.slice(0, 9).map((signal) => (
                  <div className="rounded-2xl bg-white/70 px-3 py-2 text-xs font-semibold leading-5 text-ink" key={signal.id}>
                    {signal.signalDate} · {signal.signalType} · 置信 {Math.round(signal.confidenceScore * 100)}%
                  </div>
                ))}
                {signals.length === 0 ? <p className={cn("text-sm font-semibold", mutedTextClass)}>生成后会显示天气、路况、节假日和平台流量信号。</p> : null}
              </div>
            </article>
            <article className={cn(softClass, "p-3")}>
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-black text-ink">智能决策日志</h4>
                <Badge tone="neutral">{decisions.length} 条</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {decisions.slice(0, 5).map((decision) => (
                  <div className="rounded-2xl bg-white/70 px-3 py-2 text-xs font-semibold leading-5 text-ink" key={decision.id}>
                    {decision.targetDate} {decision.targetTime} · {decision.action}
                  </div>
                ))}
                {decisions.length === 0 ? <p className={cn("text-sm font-semibold", mutedTextClass)}>生成后会记录系统为什么做出每一步处理。</p> : null}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <Drawer onClose={() => setEnableConfirmOpen(false)} open={enableConfirmOpen} title="启用全智能排班系统">
        <div className="space-y-4">
          <p className="text-sm font-semibold leading-7 text-[color:var(--client-muted)]">
            启用后，系统将自动收集商户端、技师端、平台客流、预约趋势、天气、路况等数据，并自动生成和确认排班。
            商户端和技师端都会进入全智能排班状态。系统会在异常和冲突时提示处理方案，并在设定的缓冲时间后自动执行。
          </p>
          <p className="rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,var(--client-bg)_86%)] px-3 py-3 text-sm font-semibold leading-6 text-[color:var(--client-text)]">
            智能排班开始后，会在下一个排班周期自动开始执行；如果目前没有正在执行中的周期，则会马上开始。
          </p>
          <p className="rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_46%,var(--client-bg)_54%)] px-3 py-3 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">
            你仍然可以随时取消自动处理，并将本次改为人工处理；confirmed_slots 仍然是用户端可预约时间的唯一来源。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={() => setEnableConfirmOpen(false)} variant="secondary">取消</Button>
            <Button onClick={enableSmart}>启用全智能排班</Button>
          </div>
        </div>
      </Drawer>
    </section>
  );
}
