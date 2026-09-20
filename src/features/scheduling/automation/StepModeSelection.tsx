import { useEffect, useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { InfoTooltipTrigger } from "../../../components/ui/TitleWithInfo";
import { cn } from "../../../lib/utils";
import { addDays, getCycleModeLabel, type DispatchCycle, type DispatchCycleMode } from "../../dispatch-center/domain";
import { ScheduleFloatingActions } from "./ScheduleFloatingActions";

const modeOptions: Array<{
  mode: DispatchCycleMode;
  title: string;
  scenario: string;
  merchantRole: string;
  technicianRole: string;
  confirmation: string;
  recommended?: boolean;
}> = [
  {
    mode: "TECH_SELF_FINAL",
    title: "技师自主排班",
    scenario: "自由技师、轻管理店铺",
    merchantRole: "跟踪技师是否完成或更新下一周期排班",
    technicianRole: "直接完成自己的下一周期排班",
    confirmation: "完成状态汇总",
    recommended: true
  },
  {
    mode: "STORE_ASSIGN_FINAL",
    title: "商户直接排班",
    scenario: "传统强管理门店",
    merchantRole: "直接安排每个技师的班次",
    technicianRole: "确认店铺排班，可提交请假 / 调整申请",
    confirmation: "确认与调整反馈"
  }
];

export function StepModeSelection({
  cycle,
  onCycleChange,
  onMessage,
  onSaveCycle,
  surface
}: {
  cycle: DispatchCycle;
  onCycleChange: (cycle: DispatchCycle) => void;
  onMessage: (message: string) => void;
  onSaveCycle: (cycle: DispatchCycle) => Promise<DispatchCycle>;
  surface: "desktop" | "mobile";
}) {
  const [draft, setDraft] = useState(cycle);
  const isMobileSurface = surface === "mobile";
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const cardClass = isMobileSurface ? "schedule-mode-choice-card" : "merchant-dispatch-choice";
  const activeCardClass = "is-active";
  const softPanelClass = isMobileSurface ? "bg-paper/70" : "merchant-dispatch-soft-panel";
  const quietTextClass = isMobileSurface ? "text-ink/60" : "text-ink/58";
  const labelTextClass = isMobileSurface ? "text-ink/45" : "text-moss/70";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;
  const primaryButtonClass = isMobileSurface ? "schedule-wizard-primary-action" : undefined;

  useEffect(() => {
    setDraft(cycle);
  }, [cycle]);

  const updateMode = (mode: DispatchCycleMode) => {
    const nextDraft = {
      ...draft,
      mode,
      feedbackDeadline: mode === "STORE_ASSIGN_FINAL"
        ? draft.feedbackDeadline ?? `${addDays(draft.periodStart, -2)}T18:00:00+09:00`
        : null
    };

    setDraft(nextDraft);
    onCycleChange(nextDraft);
  };

  return (
    <div
      className={cn(
        "space-y-5",
        isMobileSurface && "pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]"
      )}
    >
      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={cn("text-xs font-black tracking-[0.16em]", labelTextClass)}>步骤 1</p>
            <h3 className="mt-1 text-lg font-black">模式选择</h3>
            <p className={cn("mt-1 text-sm leading-6", quietTextClass)}>
              先确定商户和技师的权限边界。后续规则设定、技师端可编辑状态、最终可预约时间来源都会跟随该模式。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="blue">{getCycleModeLabel(draft.mode)}</Badge>
            <Badge tone="neutral">{cycle.name}</Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {modeOptions.map((item) => {
            const active = draft.mode === item.mode;

            return (
              <div className="relative" key={item.mode}>
                <button
                  aria-label={item.title}
                  className={cn(
                    "w-full rounded-[24px] border p-4 text-left transition",
                    cardClass,
                    active && activeCardClass
                  )}
                  onClick={() => updateMode(item.mode)}
                  type="button"
                >
                  <div className="flex flex-wrap items-center gap-2 pr-8">
                    <strong className="text-xl font-black leading-tight">{item.title}</strong>
                    {item.recommended ? <Badge className={active ? "schedule-highlight-badge" : undefined} tone={active ? "yellow" : "green"}>默认推荐</Badge> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className={active ? "schedule-highlight-badge" : undefined} tone="neutral">{item.scenario}</Badge>
                    <Badge className={active ? "schedule-highlight-badge" : undefined} tone={item.confirmation.includes("自动") ? "green" : "yellow"}>
                      {item.confirmation}
                    </Badge>
                  </div>
                </button>
                <InfoTooltipTrigger
                  className={cn("absolute right-4 top-4", active ? "schedule-highlight-badge" : undefined)}
                  content={
                    <div className="space-y-2">
                      <p><span className="font-black">商户：</span>{item.merchantRole}</p>
                      <p><span className="font-black">技师：</span>{item.technicianRole}</p>
                      <p><span className="font-black">确认：</span>{item.confirmation}</p>
                    </div>
                  }
                  label={`${item.title}说明`}
                  variant={surface === "mobile" ? "client" : "paper"}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div className={cn("rounded-[24px] p-4", softPanelClass)}>
          <p className={cn("text-xs font-black uppercase tracking-[0.16em]", labelTextClass)}>权限和同步边界</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[
              ["正式排班来源", draft.mode === "TECH_SELF_FINAL" ? "技师发布后投影" : "商户直接生成"],
              ["技师端反馈", draft.mode === "STORE_ASSIGN_FINAL" ? "确认 + 请假 / 调整申请" : "完成 / 更新自己的排班"],
              ["用户端可约", "只读取最终 confirmed slots"]
            ].map(([label, value]) => (
              <article className={cn("rounded-[20px] border px-4 py-3", isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-card")} key={label}>
                <p className="text-xs font-bold opacity-60">{label}</p>
                <strong className="mt-2 block text-sm font-black">{value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ScheduleFloatingActions
        mobileColumnsClassName="grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
        surface={surface}
      >
        <Button
          className={cn(
            secondaryButtonClass,
            isMobileSurface ? "w-full min-w-0" : "min-w-[132px]"
          )}
          variant="secondary"
          onClick={async () => {
            try {
              await onSaveCycle(draft);
              onMessage("模式草稿已保存。");
            } catch {
              // The parent owns the formal API error message.
            }
          }}
        >
          保存草稿
        </Button>
        <Button
          className={cn(
            primaryButtonClass,
            isMobileSurface ? "w-full min-w-0" : "min-w-[196px]"
          )}
          onClick={async () => {
            const nextDraft = { ...draft, currentStep: 2 as const };
            try {
              const saved = await onSaveCycle(nextDraft);
              onCycleChange(saved);
              onMessage("模式已确认，继续进入规则设定。");
            } catch {
              // The parent owns the formal API error message.
            }
          }}
        >
          下一步：规则设定
        </Button>
      </ScheduleFloatingActions>
    </div>
  );
}
