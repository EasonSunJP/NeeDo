import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ScheduleCycleBoard } from "../../../components/scheduling/ScheduleCycleBoard";
import { cn } from "../../../lib/utils";
import {
  finalizeDispatchCycle,
  getDispatchCycleLimitSummary,
  runDispatchAutoConfirm
} from "../../dispatch-center/store";
import type { DispatchCycle } from "../../dispatch-center/domain";
import { ScheduleFloatingActions } from "./ScheduleFloatingActions";

function formatCycleDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export function StepFinalConfirmation({
  cycle,
  hideBoard = false,
  onMessage,
  operatorId,
  scheduleStickyTop,
  storeId,
  surface
}: {
  cycle: DispatchCycle;
  hideBoard?: boolean;
  onMessage: (message: string) => void;
  operatorId: string;
  scheduleStickyTop?: string;
  storeId: string;
  surface: "desktop" | "mobile";
}) {
  const limitSummary = getDispatchCycleLimitSummary(storeId);
  const isMobileSurface = surface === "mobile";
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;

  return (
    <div className={cn("space-y-4", isMobileSurface && "pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]")}>
      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-black">最终确认 / 待执行周期</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={limitSummary.limitReached ? "red" : "blue"}>active {limitSummary.activeCount} / pending {limitSummary.pendingCount}</Badge>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold leading-6 text-ink/60">
          {formatCycleDate(cycle.periodStart)}~{formatCycleDate(cycle.periodEnd)}周期，开启
          {cycle.mode === "TECH_SELF_FINAL" ? "技师自主排班" : "商户直接排班"}模式，同周期无法开启其他模式排班。如果想更换排班模式，请提前终止该周期。
        </p>
      </section>

      {hideBoard ? null : (
        <ScheduleCycleBoard
          cycle={cycle}
          drawerTitle="人工微调班次"
          onMessage={onMessage}
          operatorId={operatorId}
          scheduleStickyTop={scheduleStickyTop}
          storeId={storeId}
          surface={surface}
        />
      )}

      <ScheduleFloatingActions
        desktopClassName="flex flex-wrap items-center justify-center gap-3"
        mobileColumnsClassName="grid-cols-2"
        surface={surface}
      >
        <Button
          className={cn(secondaryButtonClass, isMobileSurface && "w-full min-w-0")}
          variant="secondary"
          onClick={() => {
            const result = runDispatchAutoConfirm(cycle.id, operatorId);
            onMessage(result.ok ? `自动确认完成：${result.summary?.confirmedCount ?? 0} 格确认，${result.summary?.shortageCount ?? 0} 处缺人。` : result.message ?? "自动确认失败。");
          }}
        >
          运行自动确认
        </Button>
        <Button
          className={cn(isMobileSurface && "schedule-wizard-primary-action w-full min-w-0")}
          onClick={() => {
            const result = finalizeDispatchCycle(cycle.id, operatorId);
            onMessage(result.ok ? "最终班表已发布，用户端只会读取最终可预约时间。" : result.message ?? "发布失败。");
          }}
        >
          发布最终班表
        </Button>
      </ScheduleFloatingActions>
    </div>
  );
}
