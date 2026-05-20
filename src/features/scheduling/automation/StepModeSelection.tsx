import { useEffect, useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { InfoTooltipTrigger } from "../../../components/ui/TitleWithInfo";
import { cn } from "../../../lib/utils";
import { addDays, getCycleModeLabel, type DispatchCycle, type DispatchCycleMode } from "../../dispatch-center/domain";
import { saveDispatchCycleDraft } from "../../dispatch-center/store";

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
    mode: "STORE_COLLECT_CONFIRM",
    title: "商户确认模式",
    scenario: "多数机构店铺",
    merchantRole: "设定可排班时段，处理冲突并最终确认",
    technicianRole: "提交可上班 / 不可上班反馈，可发起申请",
    confirmation: "商户必须最终确认",
    recommended: true
  },
  {
    mode: "TECH_SELF_FINAL",
    title: "技师自主排班",
    scenario: "自由技师、轻管理店铺",
    merchantRole: "设定基本边界规则，查看结果与冲突",
    technicianRole: "自行设定并保存上班时间",
    confirmation: "系统自动确认"
  },
  {
    mode: "STORE_ASSIGN_FINAL",
    title: "商户直接排班",
    scenario: "传统强管理门店",
    merchantRole: "直接安排每个技师的班次",
    technicianRole: "查看结果，可提交请假 / 加班 / 退职申请",
    confirmation: "商户保存即正式排班"
  }
];

export function StepModeSelection({
  cycle,
  onCycleChange,
  onMessage,
  surface
}: {
  cycle: DispatchCycle;
  onCycleChange: (cycle: DispatchCycle) => void;
  onMessage: (message: string) => void;
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
      feedbackDeadline:
        mode === "STORE_COLLECT_CONFIRM"
          ? draft.feedbackDeadline ?? `${addDays(draft.periodStart, -2)}T18:00`
          : null
    };

    setDraft(nextDraft);
    onCycleChange(nextDraft);
  };

  return (
    <div className="space-y-5">
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
              <button
                className={cn(
                  "rounded-[24px] border p-4 text-left transition",
                  cardClass,
                  active && activeCardClass
                )}
                key={item.mode}
                onClick={() => updateMode(item.mode)}
                type="button"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-xl font-black leading-tight">{item.title}</strong>
                  <InfoTooltipTrigger
                    className={active ? "schedule-highlight-badge" : undefined}
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
                  {item.recommended ? <Badge className={active ? "schedule-highlight-badge" : undefined} tone={active ? "yellow" : "green"}>默认推荐</Badge> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className={active ? "schedule-highlight-badge" : undefined} tone="neutral">{item.scenario}</Badge>
                  <Badge className={active ? "schedule-highlight-badge" : undefined} tone={item.confirmation.includes("自动") ? "green" : "yellow"}>
                    {item.confirmation}
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div className={cn("rounded-[24px] p-4", softPanelClass)}>
          <p className={cn("text-xs font-black uppercase tracking-[0.16em]", labelTextClass)}>权限和同步边界</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[
              ["正式排班来源", draft.mode === "TECH_SELF_FINAL" ? "技师发布后投影" : draft.mode === "STORE_ASSIGN_FINAL" ? "商户直接生成" : "反馈经商户确认"],
              ["技师端编辑", draft.mode === "STORE_ASSIGN_FINAL" ? "只读 + 申请入口" : "可提交 / 修改"],
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

      <div className={cn("flex flex-wrap justify-center gap-3 pt-1", isMobileSurface && "schedule-wizard-action-dock rounded-[28px] p-2")}>
        <Button
          className={cn(secondaryButtonClass, "min-w-[132px]")}
          variant="secondary"
          onClick={() => {
            const result = saveDispatchCycleDraft(draft);
            onMessage(result.ok ? "模式草稿已保存。" : result.message ?? "保存失败。");
          }}
        >
          保存草稿
        </Button>
        <Button
          className={cn(primaryButtonClass, "min-w-[196px]")}
          onClick={() => {
            const nextDraft = { ...draft, currentStep: 2 as const };
            const result = saveDispatchCycleDraft(nextDraft);

            if (!result.ok) {
              onMessage(result.message ?? "保存失败。");
              return;
            }

            onCycleChange(nextDraft);
            onMessage("模式已确认，继续进入规则设定。");
          }}
        >
          下一步：规则设定
        </Button>
      </div>
    </div>
  );
}
