import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { useI18n } from "../../../i18n/I18nProvider";
import { cn } from "../../../lib/utils";
import {
  getCycleModeLabel,
  getCycleStatusLabel,
  type DispatchCycle
} from "../../dispatch-center/domain";
import { getDispatchCycleLimitSummary } from "../../dispatch-center/store";
import { ScheduleFloatingActions } from "./ScheduleFloatingActions";

const lifecycleSteps = ["模式选择", "规则设定", "最终确认"];

function formatDateKey(dateKey: string, language: ReturnType<typeof useI18n>["language"]) {
  const locale = language === "zh-Hant" ? "zh-TW" : language === "zh" ? "zh-CN" : language;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Tokyo"
  }).format(new Date(`${dateKey}T00:00:00+09:00`));
}

export function SchedulePlanningOverview({
  cycle,
  hasBuilderCycle,
  onOpenBuilder,
  onOpenConfirmation,
  storeId,
  surface
}: {
  cycle: DispatchCycle | null;
  hasBuilderCycle: boolean;
  onOpenBuilder: () => void;
  onOpenConfirmation: () => void;
  storeId: string;
  surface: "desktop" | "mobile";
}) {
  const { language } = useI18n();
  const isMobileSurface = surface === "mobile";
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const limitSummary = getDispatchCycleLimitSummary(storeId);
  const canCreateCycle = hasBuilderCycle || !limitSummary.limitReached;

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
            <div className="mt-4 grid grid-cols-3 gap-2" aria-label="排班流程">
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
            <p className="mt-2 text-sm leading-6 text-ink/60">新建周期后，这里会显示规则设定进度和最终确认入口。</p>
          </div>
        )}
      </section>

      {cycle ? (
        <section className={cn("rounded-[28px] border p-4", sectionClass)}>
          <h2 className="text-lg font-black">当前周期模式</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">
            {formatDateKey(cycle.periodStart, language)}~{formatDateKey(cycle.periodEnd, language)}周期，开启
            {getCycleModeLabel(cycle.mode)}模式，同周期无法开启其他模式排班。如果想更换排班模式，请提前终止该周期。
          </p>
        </section>
      ) : null}

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
