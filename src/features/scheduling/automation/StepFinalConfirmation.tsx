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
    <div className="space-y-5">
      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-black">最终确认 / 待执行周期</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={limitSummary.limitReached ? "red" : "blue"}>active {limitSummary.activeCount} / pending {limitSummary.pendingCount}</Badge>
            <Button
              className={secondaryButtonClass}
              variant="secondary"
              onClick={() => {
                const result = runDispatchAutoConfirm(cycle.id, operatorId);
                onMessage(result.ok ? `自动确认完成：${result.summary?.confirmedCount ?? 0} 格确认，${result.summary?.shortageCount ?? 0} 处缺人。` : result.message ?? "自动确认失败。");
              }}
            >
              运行自动确认
            </Button>
            <Button
              onClick={() => {
                const result = finalizeDispatchCycle(cycle.id, operatorId);
                onMessage(result.ok ? "最终班表已发布，用户端只会读取最终可预约时间。" : result.message ?? "发布失败。");
              }}
            >
              发布最终班表
            </Button>
          </div>
        </div>
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
    </div>
  );
}
