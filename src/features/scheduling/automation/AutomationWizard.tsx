import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ScheduleContactInfoPanel } from "../../../components/scheduling/ScheduleContactInfoPanel";
import {
  isSchedulingLiveCycle,
  resolveSchedulingCycleSlots,
  resolveSchedulingCurrentCycle,
  resolveSchedulingCycleTone
} from "../../../components/scheduling/SchedulingCycleTabs";
import { cn } from "../../../lib/utils";
import type { Technician } from "../../../types/domain";
import { createDispatchCenterApi } from "../../dispatch-center/api";
import { getDispatchTodayDateKey, getCycleModeLabel, getCycleStatusLabel, type DispatchCycle, type DispatchStep } from "../../dispatch-center/domain";
import { summarizeCycleLimits, type DispatchCycleLimitSummary } from "../../../lib/scheduling/cyclePromotion";
import { StepCreateCycle } from "./StepCreateCycle";
import { StepFinalConfirmation } from "./StepFinalConfirmation";
import { StepModeSelection } from "./StepModeSelection";
import { SchedulePlanningOverview } from "./SchedulePlanningOverview";

type PlanningView = "home" | "confirmation" | "builder";

const selfSchedulingStepItems: Array<{ step: DispatchStep; label: string }> = [
  { step: 1, label: "模式选择" },
  { step: 2, label: "规则设定" },
  { step: 3, label: "最终确认" }
];

const directSchedulingStepItems: Array<{ step: DispatchStep; label: string }> = [
  { step: 1, label: "模式选择" },
  { step: 2, label: "规则设定" },
  { step: 3, label: "技师反馈" },
  { step: 4, label: "最终确认" }
];

function isScheduleBoardCycle(cycle: DispatchCycle) {
  return cycle.status === "active" || cycle.status === "confirmed" || cycle.status === "final_confirmed";
}

function CompactStepProgress({ cycle, surface }: { cycle: DispatchCycle; surface: "desktop" | "mobile" }) {
  const isMobileSurface = surface === "mobile";
  const stepItems = cycle.mode === "STORE_ASSIGN_FINAL" ? directSchedulingStepItems : selfSchedulingStepItems;
  const activeDotClass = isMobileSurface
    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
    : "border-[color:color-mix(in_srgb,var(--admin-accent)_42%,var(--admin-line))] bg-[color:var(--admin-accent)] text-[color:var(--merchant-dispatch-on-accent)]";
  const inactiveDotClass = isMobileSurface
    ? "border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] text-[color:var(--client-muted)]"
    : "border-[color:var(--admin-line)] bg-[color:color-mix(in_srgb,var(--admin-surface)_86%,transparent)] text-[color:var(--admin-muted)]";
  const activeLineClass = isMobileSurface ? "bg-[color:var(--client-primary)]" : "bg-[color:var(--admin-accent)]";
  const inactiveLineClass = isMobileSurface ? "bg-[color:var(--client-line)]" : "bg-[color:var(--admin-line)]";

  return (
    <div className="w-full">
      <div className={cn("flex w-full items-start", isMobileSurface ? "gap-1" : "gap-2")}>
        {stepItems.map((item, index) => {
          const active = cycle.currentStep === item.step;
          const done = cycle.currentStep > item.step;

          return (
            <div className="flex min-w-0 flex-1 items-start" key={item.step}>
              <div className="min-w-0 flex-1 text-center">
                <div
                  className={cn(
                    "mx-auto grid h-9 w-9 place-items-center rounded-full border text-sm font-black transition sm:h-11 sm:w-11 sm:text-base",
                    active || done ? activeDotClass : inactiveDotClass
                  )}
                >
                  {item.step}
                </div>
                <p
                  className={cn(
                    "mt-2 text-[11px] font-black leading-4 sm:text-sm sm:leading-5",
                    isMobileSurface ? "text-[color:var(--client-text)]" : "text-[color:var(--admin-text)]"
                  )}
                >
                  {item.label}
                </p>
              </div>
              {index < stepItems.length - 1 ? (
                <div className={cn("mt-[18px] h-[2px] w-5 shrink-0 sm:mt-[21px] sm:w-12", done ? activeLineClass : inactiveLineClass)} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CycleWorkflowPanel({
  cycle,
  limitSummary,
  onDelete,
  onFinalizeCycle,
  onLaunchCycle,
  onMessage,
  onRunAutoConfirm,
  onSaveCycle,
  storeId,
  surface,
  technicians
}: {
  cycle: DispatchCycle;
  limitSummary: DispatchCycleLimitSummary;
  onDelete: (cycle: DispatchCycle) => void;
  onFinalizeCycle: (cycleId: string) => Promise<DispatchCycle>;
  onLaunchCycle: (cycle: DispatchCycle) => Promise<DispatchCycle>;
  onMessage: (message: string) => void;
  onRunAutoConfirm: (cycleId: string) => Promise<{ cycle: DispatchCycle; summary: NonNullable<DispatchCycle["autoConfirmSummary"]> }>;
  onSaveCycle: (cycle: DispatchCycle) => Promise<DispatchCycle>;
  storeId: string;
  surface: "desktop" | "mobile";
  technicians: Technician[];
}) {
  const isMobileSurface = surface === "mobile";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;
  const finalStep = cycle.mode === "STORE_ASSIGN_FINAL" ? 4 : 3;

  return (
    <div className="space-y-4">
      <div className={cn("merchant-dispatch-cycle-cluster rounded-[28px] border p-3 sm:p-4", isMobileSurface ? "border-line bg-white/80" : "")}>
        <div>
          <CompactStepProgress cycle={cycle} surface={surface} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={resolveSchedulingCycleTone(cycle)}>{getCycleStatusLabel(cycle.status)}</Badge>
            <Badge tone="neutral">{getCycleModeLabel(cycle.mode)}</Badge>
            {cycle.currentStep === finalStep && cycle.status !== "active" ? (
              <Button className={secondaryButtonClass} onClick={() => onDelete(cycle)} size="sm" variant="danger">
                删除周期
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {cycle.currentStep === 1 ? (
        <StepModeSelection cycle={cycle} onCycleChange={() => undefined} onMessage={onMessage} onSaveCycle={onSaveCycle} surface={surface} />
      ) : null}
      {cycle.currentStep === 2 ? (
        <StepCreateCycle
          key={cycle.id}
          cycle={cycle}
          onCycleChange={() => undefined}
          onMessage={onMessage}
          onLaunchCycle={onLaunchCycle}
          onSaveCycle={onSaveCycle}
          onCancelEditing={() => onDelete(cycle)}
          storeId={storeId}
          surface={surface}
          technicians={technicians}
        />
      ) : null}
      {cycle.currentStep === finalStep ? (
        <StepFinalConfirmation
          cycle={cycle}
          limitSummary={limitSummary}
          onMessage={onMessage}
          onFinalizeCycle={onFinalizeCycle}
          onRunAutoConfirm={onRunAutoConfirm}
          surface={surface}
        />
      ) : null}
    </div>
  );
}

export function AutomationWizard({
  operatorId,
  storeId,
  surface,
  technicians = []
}: {
  operatorId: string;
  scheduleStickyTop?: string;
  storeId: string;
  surface: "desktop" | "mobile";
  technicians?: Technician[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [cycles, setCycles] = useState<DispatchCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<PlanningView>("home");
  const [builderCycleId, setBuilderCycleId] = useState<string | null>(null);
  const api = useMemo(() => createDispatchCenterApi(operatorId), [operatorId]);
  const today = getDispatchTodayDateKey();
  const visibleCycles = useMemo(
    () => cycles.filter((cycle) => isSchedulingLiveCycle(cycle) && cycle.periodEnd >= today).sort((left, right) => left.periodStart.localeCompare(right.periodStart)),
    [cycles, today]
  );
  const currentCycle = useMemo(() => resolveSchedulingCurrentCycle(visibleCycles.filter(isScheduleBoardCycle)), [visibleCycles]);
  const { nextCycle, builderCycle } = useMemo(() => resolveSchedulingCycleSlots(visibleCycles, currentCycle), [currentCycle, visibleCycles]);
  const limitSummary = useMemo(() => summarizeCycleLimits(visibleCycles, storeId), [storeId, visibleCycles]);
  const isMobileSurface = surface === "mobile";
  const alertClass = isMobileSurface ? "bg-lemon/25 text-[#795b00]" : "merchant-dispatch-alert";
  const overviewCycle = nextCycle ?? builderCycle ?? (currentCycle && currentCycle.status !== "active" ? currentCycle : null);
  const builderViewCycle = visibleCycles.find((cycle) => cycle.id === builderCycleId) ?? null;
  const contactExcludedRanges = useMemo(
    () => [currentCycle, nextCycle]
      .filter((item): item is DispatchCycle => Boolean(item))
      .map((item) => ({ start: item.periodStart, end: item.periodEnd })),
    [currentCycle, nextCycle]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listCycles(storeId)
      .then((page) => {
        if (active) setCycles(page.list);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "排班周期读取失败。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [api, storeId]);

  const upsertCycle = (cycle: DispatchCycle) => {
    setCycles((current) => current.some((item) => item.id === cycle.id)
      ? current.map((item) => item.id === cycle.id ? cycle : item)
      : [...current, cycle]);
    return cycle;
  };

  const runCycleCommand = async <T,>(command: () => Promise<T>, success: (value: T) => void) => {
    try {
      const value = await command();
      success(value);
      return value;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "排班周期操作失败。");
      throw error;
    }
  };

  const saveCycle = (cycle: DispatchCycle) => runCycleCommand(() => api.saveCycleDraft(cycle), upsertCycle);
  const launchCycle = (cycle: DispatchCycle) => runCycleCommand(() => api.launchCycle(cycle.id), upsertCycle);
  const closeFeedback = (cycleId: string) => runCycleCommand(() => api.closeFeedback(cycleId), upsertCycle);
  const finalizeCycle = (cycleId: string) => runCycleCommand(() => api.finalizeCycle(cycleId), upsertCycle);
  const runAutoConfirm = (cycleId: string) => runCycleCommand(() => api.runAutoConfirm(cycleId), (result) => upsertCycle(result.cycle));

  const createCycle = async () => {
    if (builderCycle) {
      setBuilderCycleId(builderCycle.id);
      setView("builder");
      return;
    }

    if (limitSummary.limitReached) {
      setMessage("当前已有执行周期和待执行周期，无法继续新建。");
      return;
    }

    const targetIds = technicians.map((technician) => technician.id).filter((id) => Number.isInteger(Number(id)) && Number(id) > 0);
    try {
      const cycle = await runCycleCommand(() => api.createCycleDraft(storeId, targetIds), upsertCycle);
      setBuilderCycleId(cycle.id);
      setView("builder");
      setMessage(`${cycle.name} 已创建。`);
    } catch {
      // runCycleCommand has already exposed the formal API error.
    }
  };

  const deleteCycle = async (cycle: DispatchCycle) => {
    try {
      await runCycleCommand(() => api.cancelCycle(cycle.id), upsertCycle);
      setBuilderCycleId(null);
      setView("home");
      setMessage("周期已删除，可以重新新建周期。");
    } catch {
      // runCycleCommand has already exposed the formal API error.
    }
  };

  return (
    <section className="space-y-4" data-schedule-planning-view={view}>
      {view === "home" ? (
        <SchedulePlanningOverview
          cycle={overviewCycle}
          hasBuilderCycle={Boolean(builderCycle)}
          limitSummary={limitSummary}
          onCloseFeedback={closeFeedback}
          onMessage={setMessage}
          onOpenBuilder={createCycle}
          onOpenConfirmation={() => setView("confirmation")}
          surface={surface}
          technicians={technicians}
        />
      ) : null}

      {view === "confirmation" ? (
        <div className="space-y-4">
          <div className={cn("flex items-center justify-between gap-3 rounded-[24px] border p-3", isMobileSurface ? "border-line bg-white/90 shadow-panel" : "merchant-dispatch-surface")}>
            <div>
              <p className="text-xs font-black text-ink/45">下一周期确认</p>
              <h2 className="mt-1 text-base font-black">下一周期排班表</h2>
            </div>
            <Button onClick={() => setView("home")} size="sm" variant="secondary">返回排班首页</Button>
          </div>
          {overviewCycle ? (
            <div className={cn("rounded-[24px] border p-4", isMobileSurface ? "border-line bg-white/90 shadow-panel" : "merchant-dispatch-surface")}>
              <h3 className="font-black">服务端周期班次</h3>
              <p className="mt-2 text-sm font-semibold text-ink/55">已持久化班次 {(overviewCycle.finalShifts ?? []).length} 格；正式发布后用户端读取服务端可预约时段。</p>
            </div>
          ) : (
            <p className="rounded-[20px] border border-line bg-white/80 px-4 py-3 text-sm font-semibold text-ink/55">下一周期尚未创建。</p>
          )}
        </div>
      ) : null}

      {view === "builder" ? (
        builderViewCycle ? (
          <div className="space-y-4">
            <div className={cn("flex items-center justify-between gap-3 rounded-[24px] border p-3", isMobileSurface ? "border-line bg-white/90 shadow-panel" : "merchant-dispatch-surface")}>
              <div>
                <p className="text-xs font-black text-ink/45">新建周期</p>
                <h2 className="mt-1 text-base font-black">{builderViewCycle.name}</h2>
              </div>
              <Button onClick={() => setView("home")} size="sm" variant="secondary">返回排班首页</Button>
            </div>
            <CycleWorkflowPanel
              cycle={builderViewCycle}
              limitSummary={limitSummary}
              onDelete={deleteCycle}
              onFinalizeCycle={finalizeCycle}
              onLaunchCycle={launchCycle}
              onMessage={setMessage}
              onRunAutoConfirm={runAutoConfirm}
              onSaveCycle={saveCycle}
              storeId={storeId}
              surface={surface}
              technicians={technicians}
            />
            {builderViewCycle.mode === "STORE_ASSIGN_FINAL" && builderViewCycle.currentStep === 3 ? (
              <div className={cn("rounded-[24px] border p-4", isMobileSurface ? "border-line bg-white/90 shadow-panel" : "merchant-dispatch-surface")}>
                <h3 className="text-base font-black">已进入技师反馈</h3>
                <p className="mt-2 text-sm leading-6 text-ink/60">返回排班首页可查看确认、请假和调整反馈，并提醒未反馈技师。</p>
                <Button className="mt-3" onClick={() => setView("home")} size="sm">查看反馈进度</Button>
              </div>
            ) : null}
            {isMobileSurface && !isScheduleBoardCycle(builderViewCycle) && builderViewCycle.currentStep !== 3 ? (
              <ScheduleContactInfoPanel
                cycle={builderViewCycle}
                excludedRanges={contactExcludedRanges}
                scope="builder"
                storeId={storeId}
              />
            ) : null}
          </div>
        ) : (
          <div className="rounded-[24px] border border-line bg-white/80 p-4">
            <h2 className="text-lg font-black">尚未新建周期</h2>
            <Button className="mt-3" disabled={loading || limitSummary.limitReached} onClick={createCycle}>{loading ? "读取中…" : "新建周期"}</Button>
          </div>
        )
      ) : null}
      {message ? <p className={cn("mt-4 rounded-2xl px-4 py-3 text-sm font-semibold", alertClass)}>{message}</p> : null}
    </section>
  );
}
