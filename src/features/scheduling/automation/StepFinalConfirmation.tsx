import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import type { DispatchCycle } from "../../dispatch-center/domain";
import type { DispatchCycleLimitSummary } from "../../../lib/scheduling/cyclePromotion";
import { ScheduleFloatingActions } from "./ScheduleFloatingActions";

function formatCycleDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export function StepFinalConfirmation({
  cycle,
  limitSummary,
  onMessage,
  onFinalizeCycle,
  onRunAutoConfirm,
  surface
}: {
  cycle: DispatchCycle;
  limitSummary: DispatchCycleLimitSummary;
  onMessage: (message: string) => void;
  onFinalizeCycle: (cycleId: string) => Promise<DispatchCycle>;
  onRunAutoConfirm: (cycleId: string) => Promise<{ cycle: DispatchCycle; summary: NonNullable<DispatchCycle["autoConfirmSummary"]> }>;
  surface: "desktop" | "mobile";
}) {
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

      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)} data-server-final-shifts="true">
        <h3 className="text-base font-black">服务端确认结果</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">
          已确认 {cycle.autoConfirmSummary?.confirmedCount ?? 0} 格，缺人 {cycle.autoConfirmSummary?.shortageCount ?? 0} 处。
          发布后将由服务端生成正式可预约时段。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(cycle.finalShifts ?? []).slice(0, 24).map((shift) => (
            <Badge key={shift.id} tone={shift.status === "confirmed" ? "green" : "yellow"}>
              {shift.date} {String(shift.hour).padStart(2, "0")}:00 · #{shift.technicianId}
            </Badge>
          ))}
          {(cycle.finalShifts?.length ?? 0) === 0 ? <span className="text-sm font-semibold text-ink/45">尚未运行自动确认。</span> : null}
        </div>
      </section>

      <ScheduleFloatingActions
        desktopClassName="flex flex-wrap items-center justify-center gap-3"
        mobileColumnsClassName="grid-cols-2"
        surface={surface}
      >
        <Button
          className={cn(secondaryButtonClass, isMobileSurface && "w-full min-w-0")}
          variant="secondary"
          onClick={async () => {
            try {
              const result = await onRunAutoConfirm(cycle.id);
              onMessage(`自动确认完成：${result.summary.confirmedCount} 格确认，${result.summary.shortageCount} 处缺人。`);
            } catch {
              // The parent owns the formal API error message.
            }
          }}
        >
          运行自动确认
        </Button>
        <Button
          className={cn(isMobileSurface && "schedule-wizard-primary-action w-full min-w-0")}
          onClick={async () => {
            try {
              await onFinalizeCycle(cycle.id);
              onMessage("最终班表已发布，用户端只会读取服务端最终可预约时间。");
            } catch {
              // The parent owns the formal API error message.
            }
          }}
        >
          发布最终班表
        </Button>
      </ScheduleFloatingActions>
    </div>
  );
}
