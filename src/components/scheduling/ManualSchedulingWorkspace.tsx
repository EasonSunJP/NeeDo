import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { ScheduleCycleBoard } from "./ScheduleCycleBoard";
import {
  isSchedulingLiveCycle,
  resolveSchedulingCycleSlots,
  resolveSchedulingCurrentCycle,
  resolveSchedulingCycleTone,
  SchedulingCycleTabs,
  type SchedulingCycleSlotKey
} from "./SchedulingCycleTabs";
import { cn } from "../../lib/utils";
import {
  createDispatchCycleDraft,
  getDispatchCycleLimitSummary,
  getDispatchCycleList,
  useDispatchCenterStore
} from "../../features/dispatch-center/store";

type ManualSchedulingSurface = "desktop" | "mobile";
type ManualSchedulingMode = "merchant" | "admin";
type CycleSlot = SchedulingCycleSlotKey;

export function ManualSchedulingWorkspace({
  operatorId,
  scheduleStickyTop,
  storeId,
  surface
}: {
  mode: ManualSchedulingMode;
  operatorId: string;
  scheduleStickyTop?: string;
  storeId: string;
  surface: ManualSchedulingSurface;
}) {
  const dispatchSnapshot = useDispatchCenterStore();
  const [selectedSlot, setSelectedSlot] = useState<CycleSlot>("current");
  const [message, setMessage] = useState<string | null>(null);
  const isMobileSurface = surface === "mobile";
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const cycleClusterClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-cycle-cluster";
  const cycles = useMemo(
    () => getDispatchCycleList(storeId).filter(isSchedulingLiveCycle).sort((left, right) => left.periodStart.localeCompare(right.periodStart)),
    [dispatchSnapshot.revision, storeId]
  );
  const currentCycle = useMemo(() => resolveSchedulingCurrentCycle(cycles), [cycles]);
  const { nextCycle, builderCycle } = useMemo(() => resolveSchedulingCycleSlots(cycles, currentCycle), [currentCycle, cycles]);
  const activeCycle =
    selectedSlot === "current"
      ? currentCycle
      : selectedSlot === "next"
        ? nextCycle
        : builderCycle;
  const limitSummary = getDispatchCycleLimitSummary(storeId);

  const createCycle = () => {
    if (limitSummary.limitReached) {
      setMessage("待执行周期已达上限，请先处理已有周期。");
      return;
    }

    createDispatchCycleDraft(storeId);
    setSelectedSlot("builder");
    setMessage("已创建新周期，可以直接在日 / 周 / 月表里手动调整。");
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
          label: "新建周期",
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
    <div className="space-y-4">
      {activeCycle ? (
        <ScheduleCycleBoard
          cycle={activeCycle}
          headerContent={slotHeader}
          onMessage={setMessage}
          operatorId={operatorId}
          scheduleStickyTop={scheduleStickyTop}
          storeId={storeId}
          surface={surface}
        />
      ) : (
        <section className={cn("rounded-[28px] border p-5 shadow-panel", sectionClass, cycleClusterClass)}>
          {slotHeader}
          <p className="text-sm font-semibold text-ink/55">当前还没有可显示的排班周期。</p>
          <Button className="mt-4" disabled={limitSummary.limitReached} onClick={createCycle}>新建周期</Button>
        </section>
      )}
      {message ? (
        <div className={cn("rounded-2xl px-4 py-3 text-sm font-semibold", isMobileSurface ? "bg-lemon/25 text-[#795b00]" : "merchant-dispatch-alert")}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
