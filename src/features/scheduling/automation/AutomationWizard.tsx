import { useMemo, useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ScheduleCycleBoard } from "../../../components/scheduling/ScheduleCycleBoard";
import { ScheduleContactInfoPanel } from "../../../components/scheduling/ScheduleContactInfoPanel";
import {
  isSchedulingLiveCycle,
  resolveSchedulingCycleSlots,
  resolveSchedulingCurrentCycle,
  resolveSchedulingCycleTone
} from "../../../components/scheduling/SchedulingCycleTabs";
import { cn } from "../../../lib/utils";
import type { Technician } from "../../../types/domain";
import {
  cancelDispatchCycle,
  createDispatchCycleDraft,
  getDispatchCycleLimitSummary,
  getDispatchCycleList,
  useDispatchCenterStore
} from "../../dispatch-center/store";
import { getCycleModeLabel, getCycleStatusLabel, type DispatchCycle, type DispatchStep } from "../../dispatch-center/domain";
import { StepCreateCycle } from "./StepCreateCycle";
import { StepFinalConfirmation } from "./StepFinalConfirmation";
import { StepModeSelection } from "./StepModeSelection";
import { SchedulePlanningOverview } from "./SchedulePlanningOverview";

type PlanningView = "home" | "confirmation" | "builder";

const stepItems: Array<{ step: DispatchStep; label: string }> = [
  { step: 1, label: "模式选择" },
  { step: 2, label: "规则设定" },
  { step: 3, label: "最终确认" }
];

function isScheduleBoardCycle(cycle: DispatchCycle) {
  return cycle.status === "active" || cycle.status === "confirmed" || cycle.status === "final_confirmed";
}

function CompactStepProgress({ currentStep, surface }: { currentStep: DispatchStep; surface: "desktop" | "mobile" }) {
  const isMobileSurface = surface === "mobile";
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
          const active = currentStep === item.step;
          const done = currentStep > item.step;

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
  onDelete,
  onMessage,
  hideFinalConfirmationBoard = false,
  operatorId,
  scheduleStickyTop,
  storeId,
  surface,
  technicians
}: {
  cycle: DispatchCycle;
  onDelete: (cycle: DispatchCycle) => void;
  hideFinalConfirmationBoard?: boolean;
  onMessage: (message: string) => void;
  operatorId: string;
  scheduleStickyTop?: string;
  storeId: string;
  surface: "desktop" | "mobile";
  technicians: Technician[];
}) {
  const isMobileSurface = surface === "mobile";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;

  return (
    <div className="space-y-4">
      <div className={cn("merchant-dispatch-cycle-cluster rounded-[28px] border p-3 sm:p-4", isMobileSurface ? "border-line bg-white/80" : "")}>
        <div>
          <CompactStepProgress currentStep={cycle.currentStep} surface={surface} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={resolveSchedulingCycleTone(cycle)}>{getCycleStatusLabel(cycle.status)}</Badge>
            <Badge tone="neutral">{getCycleModeLabel(cycle.mode)}</Badge>
            {cycle.currentStep === 3 && cycle.status !== "active" ? (
              <Button className={secondaryButtonClass} onClick={() => onDelete(cycle)} size="sm" variant="danger">
                删除周期
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {cycle.currentStep === 1 ? (
        <StepModeSelection cycle={cycle} onCycleChange={() => undefined} onMessage={onMessage} surface={surface} />
      ) : null}
      {cycle.currentStep === 2 ? (
        <StepCreateCycle
          cycle={cycle}
          onCycleChange={() => undefined}
          onMessage={onMessage}
          onCancelEditing={() => onDelete(cycle)}
          operatorId={operatorId}
          storeId={storeId}
          surface={surface}
          technicians={technicians}
        />
      ) : null}
      {cycle.currentStep === 3 ? (
        <StepFinalConfirmation
          cycle={cycle}
          hideBoard={hideFinalConfirmationBoard}
          onMessage={onMessage}
          operatorId={operatorId}
          scheduleStickyTop={scheduleStickyTop}
          storeId={storeId}
          surface={surface}
        />
      ) : null}
    </div>
  );
}

export function AutomationWizard({
  operatorId,
  scheduleStickyTop,
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
  const [view, setView] = useState<PlanningView>("home");
  const [builderCycleId, setBuilderCycleId] = useState<string | null>(null);
  const dispatchSnapshot = useDispatchCenterStore();
  const cycles = useMemo(
    () => getDispatchCycleList(storeId).filter(isSchedulingLiveCycle).sort((left, right) => left.periodStart.localeCompare(right.periodStart)),
    [dispatchSnapshot.revision, storeId]
  );
  const currentCycle = useMemo(() => resolveSchedulingCurrentCycle(cycles), [cycles]);
  const { nextCycle, builderCycle } = useMemo(() => resolveSchedulingCycleSlots(cycles, currentCycle), [currentCycle, cycles]);
  const limitSummary = getDispatchCycleLimitSummary(storeId);
  const isMobileSurface = surface === "mobile";
  const alertClass = isMobileSurface ? "bg-lemon/25 text-[#795b00]" : "merchant-dispatch-alert";
  const overviewCycle = nextCycle ?? builderCycle ?? (currentCycle && currentCycle.status !== "active" ? currentCycle : null);
  const builderViewCycle = cycles.find((cycle) => cycle.id === builderCycleId) ?? builderCycle;
  const contactExcludedRanges = useMemo(
    () => [currentCycle, nextCycle]
      .filter((item): item is DispatchCycle => Boolean(item))
      .map((item) => ({ start: item.periodStart, end: item.periodEnd })),
    [currentCycle, nextCycle]
  );

  const createCycle = () => {
    if (builderCycle) {
      setBuilderCycleId(builderCycle.id);
      setView("builder");
      return;
    }

    if (limitSummary.limitReached) {
      setMessage("当前已有执行周期和待执行周期，无法继续新建。");
      return;
    }

    const cycle = createDispatchCycleDraft(storeId, technicians.map((technician) => technician.id));
    setBuilderCycleId(cycle.id);
    setView("builder");
    setMessage(`${cycle.name} 已创建。`);
  };

  const deleteCycle = (cycle: DispatchCycle) => {
    const result = cancelDispatchCycle(cycle.id, operatorId);

    if (!result.ok) {
      setMessage(result.message ?? "删除失败。");
      return;
    }

    setBuilderCycleId(null);
    setView("home");
    setMessage("周期已删除，可以重新新建周期。");
  };

  return (
    <section className="space-y-4" data-schedule-planning-view={view}>
      {view === "home" ? (
        <SchedulePlanningOverview
          cycle={overviewCycle}
          hasBuilderCycle={Boolean(builderCycle)}
          onOpenBuilder={createCycle}
          onOpenConfirmation={() => setView("confirmation")}
          storeId={storeId}
          surface={surface}
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
            <ScheduleCycleBoard
              cycle={overviewCycle}
              drawerTitle="下一周期排班表"
              onMessage={setMessage}
              operatorId={operatorId}
              scheduleStickyTop={scheduleStickyTop}
              storeId={storeId}
              surface={surface}
            />
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
              onDelete={deleteCycle}
              onMessage={setMessage}
              operatorId={operatorId}
              scheduleStickyTop={scheduleStickyTop}
              storeId={storeId}
              surface={surface}
              technicians={technicians}
            />
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
            <Button className="mt-3" disabled={limitSummary.limitReached} onClick={createCycle}>新建周期</Button>
          </div>
        )
      ) : null}
      {message ? <p className={cn("mt-4 rounded-2xl px-4 py-3 text-sm font-semibold", alertClass)}>{message}</p> : null}
    </section>
  );
}
