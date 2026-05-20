import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ScheduleCycleBoard } from "../../../components/scheduling/ScheduleCycleBoard";
import { ScheduleContactInfoPanel } from "../../../components/scheduling/ScheduleContactInfoPanel";
import {
  isSchedulingLiveCycle,
  resolveSchedulingCycleSlots,
  resolveSchedulingCurrentCycle,
  resolveSchedulingCycleTone,
  SchedulingCycleTabs,
  type SchedulingCycleSlotKey
} from "../../../components/scheduling/SchedulingCycleTabs";
import { cn } from "../../../lib/utils";
import {
  cancelDispatchCycle,
  createDispatchCycleDraft,
  getDispatchCycleLimitSummary,
  getDispatchCycleList,
  saveDispatchCycleDraft,
  useDispatchCenterStore
} from "../../dispatch-center/store";
import { getCycleModeLabel, getCycleStatusLabel, type DispatchCycle, type DispatchStep } from "../../dispatch-center/domain";
import { StepCreateCycle } from "./StepCreateCycle";
import { StepFeedbackCollection } from "./StepFeedbackCollection";
import { StepFinalConfirmation } from "./StepFinalConfirmation";
import { StepModeSelection } from "./StepModeSelection";

type CycleSlot = SchedulingCycleSlotKey;

const stepItems: Array<{ step: DispatchStep; label: string }> = [
  { step: 1, label: "模式选择" },
  { step: 2, label: "规则设定" },
  { step: 3, label: "技师反馈" },
  { step: 4, label: "最终确认" }
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

function EmptyCyclePanel({
  canCreate,
  isMobileSurface,
  onCreate,
  slotHeader,
  title
}: {
  canCreate: boolean;
  isMobileSurface: boolean;
  onCreate: () => void;
  slotHeader: ReactNode;
  title: string;
}) {
  return (
    <div className={cn("merchant-dispatch-cycle-cluster rounded-[28px] border p-3 sm:p-4", isMobileSurface ? "border-line bg-white/80" : "")}>
      {slotHeader}
      <h3 className="mt-5 text-lg font-black">{title}</h3>
      <div className="mt-3">
        <Button disabled={!canCreate} onClick={onCreate}>
          新建周期
        </Button>
      </div>
    </div>
  );
}

function CycleWorkflowPanel({
  cycle,
  onDelete,
  onMessage,
  hideFeedbackMatrix = false,
  hideFinalConfirmationBoard = false,
  operatorId,
  scheduleStickyTop,
  slotHeader,
  storeId,
  surface
}: {
  cycle: DispatchCycle;
  onDelete: (cycle: DispatchCycle) => void;
  hideFeedbackMatrix?: boolean;
  hideFinalConfirmationBoard?: boolean;
  onMessage: (message: string) => void;
  operatorId: string;
  scheduleStickyTop?: string;
  slotHeader?: ReactNode;
  storeId: string;
  surface: "desktop" | "mobile";
}) {
  const isMobileSurface = surface === "mobile";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;

  return (
    <div className="space-y-4">
      <div className={cn("merchant-dispatch-cycle-cluster rounded-[28px] border p-3 sm:p-4", isMobileSurface ? "border-line bg-white/80" : "")}>
        {slotHeader}
        <div className={cn(slotHeader ? "mt-5" : "")}>
          <CompactStepProgress currentStep={cycle.currentStep} surface={surface} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={resolveSchedulingCycleTone(cycle)}>{getCycleStatusLabel(cycle.status)}</Badge>
            <Badge tone="neutral">{getCycleModeLabel(cycle.mode)}</Badge>
            {cycle.currentStep === 4 && cycle.status !== "active" ? (
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
        <StepCreateCycle cycle={cycle} onCycleChange={() => undefined} onMessage={onMessage} operatorId={operatorId} storeId={storeId} surface={surface} />
      ) : null}
      {cycle.currentStep === 3 ? (
        <StepFeedbackCollection cycle={cycle} hideMatrix={hideFeedbackMatrix} onMessage={onMessage} operatorId={operatorId} surface={surface} />
      ) : null}
      {cycle.currentStep === 4 ? (
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
  surface
}: {
  operatorId: string;
  scheduleStickyTop?: string;
  storeId: string;
  surface: "desktop" | "mobile";
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CycleSlot>("current");
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
  const activeCycle =
    selectedSlot === "current"
      ? currentCycle
      : selectedSlot === "next"
        ? nextCycle
        : builderCycle;
  const activeCycleUsesBoard = activeCycle ? isScheduleBoardCycle(activeCycle) : false;
  const shouldShowNextCycleBoard = selectedSlot === "next" && Boolean(activeCycle) && !activeCycleUsesBoard;
  const activeContactScope = selectedSlot === "current" ? "current" : selectedSlot === "next" ? "next" : "builder";
  const contactExcludedRanges = useMemo(
    () => [currentCycle, nextCycle]
      .filter((item): item is DispatchCycle => Boolean(item))
      .map((item) => ({ start: item.periodStart, end: item.periodEnd })),
    [currentCycle, nextCycle]
  );
  const shouldShowStandaloneContactPanel = isMobileSurface && Boolean(activeCycle) && !activeCycleUsesBoard && !shouldShowNextCycleBoard;
  const builderLabel = builderCycle?.status === "confirmed" || builderCycle?.status === "final_confirmed" ? "待执行周期" : "新建周期";
  const openBuilderCycleFromModeSelection = (cycle: DispatchCycle) => {
    if (cycle.currentStep <= 1 && cycle.status === "draft") {
      setSelectedSlot("builder");
      return;
    }

    const result = saveDispatchCycleDraft({
      ...cycle,
      status: "draft",
      currentStep: 1
    });

    setSelectedSlot("builder");
    setMessage(result.ok ? "新建周期已回到模式选择。" : result.message ?? "无法回到模式选择。");
  };
  const slotHeader = (
    <SchedulingCycleTabs
      activeSlot={selectedSlot}
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
              openBuilderCycleFromModeSelection(builderCycle);
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

  const createCycle = () => {
    if (limitSummary.limitReached || builderCycle) {
      setMessage("当前已有执行周期和待执行周期，无法继续新建。");
      return;
    }

    const cycle = createDispatchCycleDraft(storeId);
    setSelectedSlot("builder");
    setMessage(`${cycle.name} 已创建。`);
  };

  const deleteCycle = (cycle: DispatchCycle) => {
    const result = cancelDispatchCycle(cycle.id, operatorId);

    if (!result.ok) {
      setMessage(result.message ?? "删除失败。");
      return;
    }

    setSelectedSlot("builder");
    setMessage("周期已删除，可以重新新建周期。");
  };

  return (
    <section className="space-y-4">
      <div>
        {activeCycle ? (
          activeCycleUsesBoard || shouldShowNextCycleBoard ? (
            <div className="space-y-4">
              {shouldShowNextCycleBoard ? (
                <CycleWorkflowPanel
                  cycle={activeCycle}
                  hideFeedbackMatrix
                  hideFinalConfirmationBoard
                  onDelete={deleteCycle}
                  onMessage={setMessage}
                  operatorId={operatorId}
                  scheduleStickyTop={scheduleStickyTop}
                  slotHeader={slotHeader}
                  storeId={storeId}
                  surface={surface}
                />
              ) : null}
              <ScheduleCycleBoard
                cycle={activeCycle}
                drawerTitle={selectedSlot === "next" ? "下一周期排班表" : "修改排班"}
                editingToggle={activeCycleUsesBoard}
                headerContent={shouldShowNextCycleBoard ? undefined : slotHeader}
                onMessage={setMessage}
                operatorId={operatorId}
                scheduleStickyTop={scheduleStickyTop}
                selectable={activeCycleUsesBoard}
                storeId={storeId}
                surface={surface}
                toolbarActions={
                  activeCycleUsesBoard && activeCycle.status !== "active" ? (
                    <Button onClick={() => deleteCycle(activeCycle)} size="sm" variant="danger">
                      删除周期
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              <CycleWorkflowPanel
                cycle={activeCycle}
                onDelete={deleteCycle}
                onMessage={setMessage}
                operatorId={operatorId}
                scheduleStickyTop={scheduleStickyTop}
                slotHeader={slotHeader}
                storeId={storeId}
                surface={surface}
              />
              {shouldShowStandaloneContactPanel ? (
                <ScheduleContactInfoPanel
                  cycle={activeCycle}
                  excludedRanges={contactExcludedRanges}
                  scope={activeContactScope}
                  storeId={storeId}
                />
              ) : null}
            </div>
          )
        ) : (
          <EmptyCyclePanel
            canCreate={selectedSlot === "builder" && !limitSummary.limitReached}
            isMobileSurface={isMobileSurface}
            onCreate={createCycle}
            slotHeader={slotHeader}
            title={selectedSlot === "next" ? "下一周期尚未确定" : selectedSlot === "current" ? "暂无当前周期" : "尚未新建周期"}
          />
        )}
      </div>
      {message ? <p className={cn("mt-4 rounded-2xl px-4 py-3 text-sm font-semibold", alertClass)}>{message}</p> : null}
    </section>
  );
}
