import { useEffect, useMemo, useRef, useState } from "react";
import { ShiftMatrixEditor } from "../../../components/scheduling/ShiftMatrixEditor";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { TitleWithInfo } from "../../../components/ui/TitleWithInfo";
import { cn } from "../../../lib/utils";
import { useEntityStore } from "../../../state/entityStore";
import {
  dispatchLanguageOptions,
  dispatchWeekdayLabels,
  getCycleModeLabel,
  getTemplateRowWeekday,
  type DispatchCycle
} from "../../dispatch-center/domain";
import { getDispatchContactGroup, getDispatchHolidayRules, previewDispatchNotificationTemplate, saveDispatchCycleDraft, launchDispatchCycle } from "../../dispatch-center/store";

function NumberStepper({
  label,
  onChange,
  surface,
  value
}: {
  label: string;
  onChange: (value: number) => void;
  surface: "desktop" | "mobile";
  value: number;
}) {
  return (
    <div className={cn("rounded-[22px] border px-4 py-3", surface === "mobile" ? "border-line bg-white/80" : "merchant-dispatch-card")}>
      <p className="text-xs font-bold text-ink/45">{label}</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full border text-sm font-black",
            surface === "mobile" ? "border-line bg-white/80 text-ink/60" : "merchant-dispatch-toggle"
          )}
          onClick={() => onChange(Math.max(0, value - 1))}
          type="button"
        >
          -
        </button>
        <div className="min-w-[52px] text-center text-lg font-black">{value}</div>
        <button
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full border text-sm font-black",
            surface === "mobile" ? "border-line bg-white/80 text-ink/60" : "merchant-dispatch-toggle"
          )}
          onClick={() => onChange(value + 1)}
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
}

type RulePhase =
  | "history"
  | "period"
  | "template"
  | "openTime"
  | "holiday"
  | "staffing"
  | "hours"
  | "priority"
  | "technicians"
  | "notify";

const rulePhases: Array<{ value: RulePhase; label: string; caption: string }> = [
  { value: "history", label: "导入历史模板", caption: "新建、导入历史、复制当前周期" },
  { value: "period", label: "时间区间与截止", caption: "周期名称、开始结束、反馈截止" },
  { value: "template", label: "模板类型", caption: "日模板、周模板、4 周模板" },
  { value: "openTime", label: "商户开放时间", caption: "店铺可排班时间矩阵" },
  { value: "holiday", label: "日本节假日增减", caption: "自动读取当前周期内的日本节假日" },
  { value: "staffing", label: "每日人数", caption: "最小、目标、最大人数与星期增减" },
  { value: "hours", label: "工时限制", caption: "日/周工时、休息天、服务缓冲" },
  { value: "priority", label: "特殊规则与优先级", caption: "临时技师、语言、工时优先" },
  { value: "technicians", label: "适用技师", caption: "本周期参与反馈或执行对象" },
  { value: "notify", label: "通知模板", caption: "对象、渠道、阈值、模板预览" }
];

function RuleCardTitle({
  className = "mt-3",
  info,
  surface,
  title
}: {
  className?: string;
  info: string;
  surface: "desktop" | "mobile";
  title: string;
}) {
  return (
    <TitleWithInfo
      as="h3"
      className={className}
      info={info}
      label={`${title}说明`}
      title={title}
      titleClassName="text-lg font-black"
      variant={surface === "mobile" ? "client" : "paper"}
    />
  );
}

function getCycleValidationMessage(cycle: DispatchCycle) {
  const start = new Date(`${cycle.periodStart}T00:00:00`).getTime();
  const end = new Date(`${cycle.periodEnd}T00:00:00`).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "周期日期不完整。";
  }

  if (start > end) {
    return "周期开始日期不能晚于结束日期。";
  }

  const dayCount = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;

  if (dayCount > 365) {
    return "排班周期最长 1 年。";
  }

  if (cycle.mode === "STORE_COLLECT_CONFIRM" && (!cycle.feedbackDeadline || cycle.feedbackDeadline.slice(0, 10) >= cycle.periodStart)) {
    return "技师反馈截止时间必须早于周期开始日。";
  }

  if (cycle.ruleSet.minStaff > cycle.ruleSet.targetStaff || cycle.ruleSet.targetStaff > cycle.ruleSet.maxStaff) {
    return "人数规则必须满足 最小人数 <= 目标人数 <= 最大人数。";
  }

  if (cycle.targetTechnicianIds.length === 0) {
    return "排班对象不能为空。";
  }

  return null;
}

export function StepCreateCycle({
  cycle,
  onCycleChange,
  onMessage,
  operatorId,
  storeId,
  surface
}: {
  cycle: DispatchCycle;
  onCycleChange: (cycle: DispatchCycle) => void;
  onMessage: (message: string) => void;
  operatorId: string;
  storeId: string;
  surface: "desktop" | "mobile";
}) {
  const { technicians } = useEntityStore();
  const storeTechnicians = useMemo(() => technicians.filter((technician) => technician.storeId === storeId), [storeId, technicians]);
  const tempStaffGroup = getDispatchContactGroup(storeId);
  const [draft, setDraft] = useState<DispatchCycle>(cycle);
  const [rulePhase, setRulePhase] = useState<RulePhase>("history");
  const [slideDirection, setSlideDirection] = useState<"next" | "previous">("next");
  const [notificationPreview, setNotificationPreview] = useState("");
  const pageTopRef = useRef<HTMLDivElement>(null);
  const isMobileSurface = surface === "mobile";
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const softPanelClass = isMobileSurface ? "bg-paper/70" : "merchant-dispatch-soft-panel";
  const quietTextClass = isMobileSurface ? "text-ink/60" : "text-ink/58";
  const labelTextClass = isMobileSurface ? "text-ink/45" : "text-moss/70";
  const mutedChoiceClass = isMobileSurface ? "border-line bg-white/80 text-ink" : "merchant-dispatch-choice";
  const mutedPillClass = isMobileSurface ? "border-line bg-white/80 text-ink/60" : "merchant-dispatch-toggle";
  const activeChoiceClass = isMobileSurface ? "border-moss bg-moss text-white" : "is-active";
  const activeMutedPillClass = isMobileSurface ? "border-line bg-paper text-ink" : "is-active";
  const inputClass = isMobileSurface
    ? "mt-2 w-full rounded-2xl border border-line bg-white/80 px-4 py-3 text-ink outline-none"
    : "merchant-dispatch-field mt-2 w-full rounded-2xl border px-4 py-3 outline-none";
  const compactInputClass = isMobileSurface
    ? "w-24 rounded-xl border border-line bg-white/80 px-3 py-2 text-right text-ink outline-none"
    : "merchant-dispatch-field merchant-dispatch-field-compact w-24 rounded-xl border px-3 py-2 text-right outline-none";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;
  const panelCardClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-card";
  const noteClass = isMobileSurface ? "bg-paper/70 text-ink/60" : "merchant-dispatch-soft-note";

  useEffect(() => {
    setDraft(cycle);
  }, [cycle]);

  const weekdayHolidaySet = new Set(draft.regularHolidayWeekdays);
  const overtimeBlockedWeekdaySet = new Set(draft.ruleSet.overtimeBlockedWeekdays ?? []);
  const cycleHolidayRules = useMemo(
    () => getDispatchHolidayRules(storeId, draft.periodStart, draft.periodEnd),
    [draft.periodEnd, draft.periodStart, storeId]
  );
  const rulePhaseIndex = rulePhases.findIndex((phase) => phase.value === rulePhase);
  const isFirstRulePhase = rulePhaseIndex <= 0;
  const isLastRulePhase = rulePhaseIndex >= rulePhases.length - 1;
  const validationMessage = getCycleValidationMessage(draft);
  const canSaveCycle = !validationMessage;
  const actionColumnCount = isFirstRulePhase || isLastRulePhase ? 3 : 4;

  const updateDraft = (changes: Partial<DispatchCycle>) => {
    const nextDraft = {
      ...draft,
      ...changes,
      updatedAt: "2026-04-20T10:30:00+09:00"
    };
    setDraft(nextDraft);
    onCycleChange(nextDraft);
  };

  const toggleTechnician = (technicianId: string) => {
    const selected = new Set(draft.targetTechnicianIds);
    if (selected.has(technicianId)) {
      selected.delete(technicianId);
    } else {
      selected.add(technicianId);
    }
    updateDraft({ targetTechnicianIds: [...selected] });
  };

  const toggleRegularHoliday = (weekday: number) => {
    const selected = new Set(draft.regularHolidayWeekdays);
    if (selected.has(weekday)) {
      selected.delete(weekday);
    } else {
      selected.add(weekday);
    }
    updateDraft({ regularHolidayWeekdays: [...selected].sort((left, right) => left - right) });
  };

  const toggleOvertimeBlockedWeekday = (weekday: number) => {
    const selected = new Set(draft.ruleSet.overtimeBlockedWeekdays ?? []);
    if (selected.has(weekday)) {
      selected.delete(weekday);
    } else {
      selected.add(weekday);
    }

    updateDraft({
      ruleSet: {
        ...draft.ruleSet,
        overtimeBlockedWeekdays: [...selected].sort((left, right) => left - right)
      }
    });
  };

  const moveRulePhase = (nextIndex: number) => {
    const boundedIndex = Math.min(rulePhases.length - 1, Math.max(0, nextIndex));
    setSlideDirection(boundedIndex >= rulePhaseIndex ? "next" : "previous");
    setRulePhase(rulePhases[boundedIndex].value);
    requestAnimationFrame(() => {
      pageTopRef.current?.scrollIntoView({ block: "start" });
      window.scrollTo({ top: 0 });
    });
  };

  const cancelEditing = () => {
    setDraft(cycle);
    onCycleChange(cycle);
    setNotificationPreview("");
    onMessage("已取消本页编辑，草稿恢复到最近保存状态。");
  };

  return (
    <div className="space-y-5" ref={pageTopRef}>
      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={cn("text-xs font-black tracking-[0.16em]", labelTextClass)}>步骤 2</p>
            <RuleCardTitle
              className="mt-1"
              info="每次只显示一张规则卡片，点击下一步时下一张卡会从右侧横移进入。"
              surface={surface}
              title="规则设定"
            />
          </div>
        </div>
      </section>

      <div className={cn("overflow-hidden", slideDirection === "next" ? "rule-card-slide-next" : "rule-card-slide-previous")} key={rulePhase}>
      {rulePhase === "history" ? (
        <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">1/10</Badge>
            <Badge tone="neutral">导入历史模板</Badge>
            <Badge tone="neutral">{getCycleModeLabel(draft.mode)}</Badge>
            <Badge tone="yellow">{draft.periodStart} - {draft.periodEnd}</Badge>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className={cn("rounded-[24px] p-4", softPanelClass)}>
              <p className={cn("text-xs font-black uppercase tracking-[0.16em]", labelTextClass)}>创建方式</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["import_history", "导入历史设置"],
                  ["copy_current", "复制当前周期"],
                  ["new", "新建空白周期"]
                ].map(([value, label]) => (
                  <button
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-black transition",
                      mutedPillClass,
                      draft.creationMethod === value && activeChoiceClass
                    )}
                    key={value}
                    onClick={() => updateDraft({ creationMethod: value as DispatchCycle["creationMethod"] })}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className={cn("mt-3 text-sm leading-6", quietTextClass)}>
                文档要求先导入或复用历史模板，再继续设置时间、容量和通知；没有合适模板时再新建空白周期。
              </p>
            </div>

            <div className={cn("rounded-[24px] p-4", softPanelClass)}>
              <p className={cn("text-xs font-black uppercase tracking-[0.16em]", labelTextClass)}>当前模式与权限边界</p>
              <div className={cn("mt-3 rounded-[22px] border px-4 py-4", panelCardClass)}>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-base font-black">{getCycleModeLabel(draft.mode)}</strong>
                  <Badge tone={draft.mode === "STORE_COLLECT_CONFIRM" ? "blue" : "green"}>
                    {draft.mode === "STORE_COLLECT_CONFIRM" ? "商户最终确认" : "自动进入最终结果"}
                  </Badge>
                </div>
                <p className={cn("mt-2 text-sm leading-6", quietTextClass)}>如需改变模式，请回到步骤 1。规则设定阶段只调整该模式下的周期、矩阵、容量和通知。</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {rulePhase === "period" ? (
        <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">2/10</Badge>
            <Badge tone="neutral">时间区间与截止</Badge>
            <Badge tone="neutral">{getCycleModeLabel(draft.mode)}</Badge>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold text-ink">
              周期名称
              <input
                className={inputClass}
                onChange={(event) => updateDraft({ name: event.target.value })}
                value={draft.name}
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              周期开始
              <input
                className={inputClass}
                onChange={(event) => updateDraft({ periodStart: event.target.value })}
                type="date"
                value={draft.periodStart}
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              周期结束
              <input
                className={inputClass}
                onChange={(event) => updateDraft({ periodEnd: event.target.value })}
                type="date"
                value={draft.periodEnd}
              />
            </label>
            {draft.mode === "STORE_COLLECT_CONFIRM" ? (
              <label className="text-sm font-semibold text-ink">
                反馈截止
                <input
                  className={inputClass}
                  onChange={(event) => updateDraft({ feedbackDeadline: event.target.value })}
                  type="datetime-local"
                  value={(draft.feedbackDeadline ?? "").slice(0, 16)}
                />
              </label>
            ) : null}
          </div>
        </section>
      ) : null}

      {rulePhase === "template" ? (
        <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge tone="blue">3/10</Badge>
              <RuleCardTitle
                info="模板类型单独成卡，避免和周期截止、适用技师混在同一步里。"
                surface={surface}
                title="选择模板粒度"
              />
            </div>
            <Badge tone="neutral">{draft.templateType === "day" ? "日模板" : draft.templateType === "week" ? "周模板" : "4 周模板"}</Badge>
          </div>
          <div className="mt-4 max-w-xl">
            <label className="text-sm font-semibold text-ink">
              模板类型
              <select
                className={inputClass}
                onChange={(event) => updateDraft({ templateType: event.target.value as DispatchCycle["templateType"] })}
                value={draft.templateType}
              >
                <option value="day">日模板</option>
                <option value="week">周模板</option>
                <option value="month">4 周模板</option>
              </select>
            </label>
          </div>
        </section>
      ) : null}

      {rulePhase === "technicians" ? (
        <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge tone="blue">9/10</Badge>
              <RuleCardTitle
                info="商户确认模式下这些技师会收到反馈任务；直接排班模式下这些技师会收到正式排班和确认收到入口。"
                surface={surface}
                title="选择本周期对象"
              />
            </div>
            <Badge tone={draft.targetTechnicianIds.length > 0 ? "green" : "red"}>{draft.targetTechnicianIds.length} 人</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {storeTechnicians.map((technician) => {
              const active = draft.targetTechnicianIds.includes(technician.id);

              return (
                <button
                  className={cn(
                    "flex items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition",
                    mutedChoiceClass,
                    active && activeChoiceClass
                  )}
                  key={technician.id}
                  onClick={() => toggleTechnician(technician.id)}
                  type="button"
                >
                  <img alt={technician.name} className="avatar-shape h-10 w-10 object-cover" src={technician.avatar} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{technician.nickname || technician.name}</p>
                    <p className="mt-1 truncate text-xs opacity-80">{technician.name} · {technician.languages.join(" / ")}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {rulePhase === "openTime" ? (
      <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Badge tone="blue">4/10</Badge>
            <RuleCardTitle
              info="这里只维护商户开放时间；定休日与节假日增减会在下一张卡片单独处理。"
              surface={surface}
              title="店铺开放时段矩阵"
            />
          </div>
          <Badge tone="neutral">{draft.templateType === "day" ? "日模板" : draft.templateType === "week" ? "周模板" : "4 周模板"}</Badge>
        </div>

        <div className="mt-4">
          <ShiftMatrixEditor
            accent="store"
            activeLabel="店铺开放 / 可排班"
            caption="图例与当前主题联动，主色浅底表示开放时段；定休日整行不可编辑。"
            disabledLabel="定休日 / 不可编辑"
            getCellDisabled={(dayIndex) => weekdayHolidaySet.has(getTemplateRowWeekday(draft.templateType, dayIndex, draft.periodStart))}
            getDayActionState={(dayIndex) => {
              const weekday = getTemplateRowWeekday(draft.templateType, dayIndex, draft.periodStart);

              return {
                rest: weekdayHolidaySet.has(weekday),
                overtimeBlocked: overtimeBlockedWeekdaySet.has(weekday)
              };
            }}
            inactiveLabel="关闭 / 不开放"
            layout="connected"
            matrix={draft.templateMatrix}
            onChange={(matrix) => updateDraft({ templateMatrix: matrix })}
            onToggleDayOvertimeBlocked={(dayIndex) => toggleOvertimeBlockedWeekday(getTemplateRowWeekday(draft.templateType, dayIndex, draft.periodStart))}
            onToggleDayRest={(dayIndex) => toggleRegularHoliday(getTemplateRowWeekday(draft.templateType, dayIndex, draft.periodStart))}
            startDate={draft.periodStart}
            templateType={draft.templateType}
            title="店铺开放时段矩阵"
          />
        </div>
      </section>
      ) : null}

      {rulePhase === "holiday" ? (
        <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge tone="blue">5/10</Badge>
              <RuleCardTitle
                info="休息日已在店铺开放时段矩阵里设定；这里只自动读取选中周期内的日本节假日，并调整当天所需人数。"
                surface={surface}
                title="日本节假日增减"
              />
            </div>
            <Badge tone="neutral">{cycleHolidayRules.length} 个节假日</Badge>
          </div>

          <div className={cn("mt-4 rounded-[22px] p-4", softPanelClass)}>
            <p className="text-sm font-black text-ink">当前周期内的日本节假日</p>
            <div className="mt-3 grid gap-3">
              {cycleHolidayRules.length > 0 ? (
                cycleHolidayRules.map((holiday) => {
                  const date = holiday.holidayDate;
                  const value = draft.ruleSet.holidayAdjustments[date] ?? holiday.deltaStaff;

                  return (
                    <label className={cn("grid gap-3 rounded-2xl border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]", panelCardClass)} key={date}>
                      <span className="min-w-0">
                        <span className="block text-sm font-black">{date}</span>
                        <span className="mt-1 block truncate text-xs font-semibold text-ink/55">{holiday.nameZh} / {holiday.nameJa}</span>
                      </span>
                      <span className="flex items-center justify-end gap-2">
                        <input
                          className={compactInputClass}
                          onChange={(event) =>
                            updateDraft({
                              ruleSet: {
                                ...draft.ruleSet,
                                holidayAdjustments: {
                                  ...draft.ruleSet.holidayAdjustments,
                                  [date]: Number(event.target.value || 0)
                                }
                              }
                            })
                          }
                          type="number"
                          value={value}
                        />
                        <span className="text-sm font-black text-ink/55">人</span>
                      </span>
                    </label>
                  );
                })
              ) : (
                <div className={cn("rounded-2xl border px-4 py-5 text-sm font-semibold text-ink/55", panelCardClass)}>
                  当前选中周期内没有日本节假日。
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {rulePhase === "staffing" ? (
        <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge tone="blue">6/10</Badge>
              <RuleCardTitle
                info="先设每天最小、目标、最大人数，再按星期补充 +X / -X 的容量变化。"
                surface={surface}
                title="人数基准与星期维度增减"
              />
            </div>
            <Badge tone={draft.ruleSet.minStaff <= draft.ruleSet.targetStaff && draft.ruleSet.targetStaff <= draft.ruleSet.maxStaff ? "green" : "red"}>
              {draft.ruleSet.minStaff} / {draft.ruleSet.targetStaff} / {draft.ruleSet.maxStaff}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <NumberStepper label="最低人数" onChange={(value) => updateDraft({ ruleSet: { ...draft.ruleSet, minStaff: value } })} surface={surface} value={draft.ruleSet.minStaff} />
            <NumberStepper label="目标人数" onChange={(value) => updateDraft({ ruleSet: { ...draft.ruleSet, targetStaff: value } })} surface={surface} value={draft.ruleSet.targetStaff} />
            <NumberStepper label="最大人数" onChange={(value) => updateDraft({ ruleSet: { ...draft.ruleSet, maxStaff: value } })} surface={surface} value={draft.ruleSet.maxStaff} />
          </div>

          <div className={cn("mt-5 rounded-[22px] p-4", softPanelClass)}>
            <p className="text-sm font-black text-ink">星期维度增减</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {dispatchWeekdayLabels.map((label, weekday) => (
                <label className={cn("rounded-2xl border px-4 py-3 text-sm font-semibold text-ink", panelCardClass)} key={label}>
                  {label} 默认值 +X / -X 人
                  <input
                    className={cn("mt-2 w-full rounded-xl border px-3 py-2 outline-none", isMobileSurface ? "border-line bg-white/80 text-ink" : "merchant-dispatch-field")}
                    onChange={(event) =>
                      updateDraft({
                        ruleSet: {
                          ...draft.ruleSet,
                          weekdayAdjustments: {
                            ...draft.ruleSet.weekdayAdjustments,
                            [weekday]: Number(event.target.value || 0)
                          }
                        }
                      })
                    }
                    type="number"
                    value={draft.ruleSet.weekdayAdjustments[weekday] ?? 0}
                  />
                </label>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {rulePhase === "hours" ? (
        <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge tone="blue">7/10</Badge>
              <RuleCardTitle
                info="这些限制会参与自动生成、冲突校验和最终确认，不再和人数规则挤在同一张卡里。"
                surface={surface}
                title="工时、休息天与服务缓冲"
              />
            </div>
            <Badge tone="neutral">日 {draft.ruleSet.maxDailyHours}h / 周 {draft.ruleSet.maxWeeklyHours}h</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <NumberStepper label="最大工时 / 天" onChange={(value) => updateDraft({ ruleSet: { ...draft.ruleSet, maxDailyHours: value } })} surface={surface} value={draft.ruleSet.maxDailyHours} />
            <NumberStepper label="最大工时 / 周" onChange={(value) => updateDraft({ ruleSet: { ...draft.ruleSet, maxWeeklyHours: value } })} surface={surface} value={draft.ruleSet.maxWeeklyHours} />
            <NumberStepper label="最少休息天 / 周" onChange={(value) => updateDraft({ ruleSet: { ...draft.ruleSet, minRestDaysPerWeek: value } })} surface={surface} value={draft.ruleSet.minRestDaysPerWeek} />
            <NumberStepper label="服务前缓冲 / 5分钟" onChange={(value) => updateDraft({ ruleSet: { ...draft.ruleSet, preBufferMinutes: value * 5 } })} surface={surface} value={Math.round(draft.ruleSet.preBufferMinutes / 5)} />
            <NumberStepper label="服务后缓冲 / 5分钟" onChange={(value) => updateDraft({ ruleSet: { ...draft.ruleSet, postBufferMinutes: value * 5 } })} surface={surface} value={Math.round(draft.ruleSet.postBufferMinutes / 5)} />
          </div>
        </section>
      ) : null}

      {rulePhase === "priority" ? (
        <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge tone="blue">8/10</Badge>
              <RuleCardTitle
                info="把特殊规则集中在一张卡里，和适用技师名单区分开，便于后续审计。"
                surface={surface}
                title="临时技师、语言与工时优先"
              />
            </div>
            <Badge tone={draft.ruleSet.tempStaffEnabled ? "green" : "neutral"}>{draft.ruleSet.tempStaffEnabled ? "临时池开启" : "临时池关闭"}</Badge>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className={cn("rounded-[22px] p-4", softPanelClass)}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-ink">临时技师招募</p>
                  <p className="mt-1 text-xs text-ink/50">绑定联系人列表的临时员工池，池子为空时不能开启。</p>
                </div>
                <button
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-black",
                    mutedPillClass,
                    draft.ruleSet.tempStaffEnabled && activeChoiceClass
                  )}
                  onClick={() =>
                    updateDraft({
                      ruleSet: {
                        ...draft.ruleSet,
                        tempStaffEnabled: tempStaffGroup ? !draft.ruleSet.tempStaffEnabled : false
                      }
                    })}
                  type="button"
                >
                  {draft.ruleSet.tempStaffEnabled ? "已开启" : "未开启"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {tempStaffGroup?.members.map((member) => {
                  const active = draft.ruleSet.tempStaffIds.includes(member.id);

                  return (
                    <button
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-black",
                        mutedPillClass,
                        active && activeChoiceClass
                      )}
                      key={member.id}
                      onClick={() =>
                        updateDraft({
                          ruleSet: {
                            ...draft.ruleSet,
                            tempStaffIds: active
                              ? draft.ruleSet.tempStaffIds.filter((id) => id !== member.id)
                              : [...draft.ruleSet.tempStaffIds, member.id]
                          }
                        })}
                      type="button"
                    >
                      {member.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={cn("rounded-[22px] p-4", softPanelClass)}>
              <p className="text-sm font-black text-ink">优先规则</p>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {storeTechnicians.map((technician) => {
                    const active = draft.ruleSet.priorityRules.selectedTechnicianIds.includes(technician.id);
                    return (
                      <button
                        className={cn(
                          "rounded-full border px-4 py-2 text-sm font-black",
                          mutedPillClass,
                          active && activeChoiceClass
                        )}
                        key={technician.id}
                        onClick={() =>
                          updateDraft({
                            ruleSet: {
                              ...draft.ruleSet,
                              priorityRules: {
                                ...draft.ruleSet.priorityRules,
                                selectedTechnicianIds: active
                                  ? draft.ruleSet.priorityRules.selectedTechnicianIds.filter((id) => id !== technician.id)
                                  : [...draft.ruleSet.priorityRules.selectedTechnicianIds, technician.id]
                              }
                            }
                          })}
                        type="button"
                      >
                        {technician.nickname || technician.name}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {dispatchLanguageOptions.map((language) => {
                    const active = draft.ruleSet.priorityRules.selectedLanguages.includes(language);
                    return (
                      <button
                        className={cn(
                          "rounded-full border px-4 py-2 text-sm font-black",
                          mutedPillClass,
                          active && activeChoiceClass
                        )}
                        key={language}
                        onClick={() =>
                          updateDraft({
                            ruleSet: {
                              ...draft.ruleSet,
                              priorityRules: {
                                ...draft.ruleSet.priorityRules,
                                selectedLanguages: active
                                  ? draft.ruleSet.priorityRules.selectedLanguages.filter((item) => item !== language)
                                  : [...draft.ruleSet.priorityRules.selectedLanguages, language]
                              }
                            }
                          })}
                        type="button"
                      >
                        {language}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-left text-sm font-black",
                      mutedPillClass,
                      draft.ruleSet.priorityRules.requireForeignerSupport && activeChoiceClass
                    )}
                    onClick={() =>
                      updateDraft({
                        ruleSet: {
                          ...draft.ruleSet,
                          priorityRules: {
                            ...draft.ruleSet.priorityRules,
                            requireForeignerSupport: !draft.ruleSet.priorityRules.requireForeignerSupport
                          }
                        }
                      })}
                    type="button"
                  >
                    可对应外国人
                  </button>
                  <select
                    className={cn("rounded-2xl border px-4 py-3 text-sm font-semibold outline-none", isMobileSurface ? "border-line bg-white/80 text-ink" : "merchant-dispatch-field")}
                    onChange={(event) =>
                      updateDraft({
                        ruleSet: {
                          ...draft.ruleSet,
                          priorityRules: {
                            ...draft.ruleSet.priorityRules,
                            confirmedHoursPriority: event.target.value as DispatchCycle["ruleSet"]["priorityRules"]["confirmedHoursPriority"]
                          }
                        }
                      })}
                    value={draft.ruleSet.priorityRules.confirmedHoursPriority}
                  >
                    <option value="less_first">工时更少优先</option>
                    <option value="more_first">工时更多优先</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {rulePhase === "notify" ? (
        <section className={cn("rounded-[28px] border p-4 shadow-panel", sectionClass)}>
          <div className="grid gap-5 xl:grid-cols-[1fr,0.9fr]">
            <div>
              <Badge tone="blue">10/10</Badge>
              <RuleCardTitle
                info="通知模板保留系统变量，商户只能调整阈值和附加文案，避免误删技师名、店铺名、周期和截止时间。"
                surface={surface}
                title="通知对象与渠道"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {["全部排班对象", "仅未反馈", "仅已变更", "仅指定技师"].map((label, index) => (
                  <div className={cn("rounded-[22px] border px-4 py-3", panelCardClass)} key={label}>
                    <p className="text-sm font-black">{label}</p>
                    <Badge className="mt-3" tone={index === 0 ? "blue" : "neutral"}>{index === 0 ? "默认" : "可选"}</Badge>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {["App Push", "站内通知", "邮件", "短信", "LINE 通知"].map((channel) => (
                  <Badge key={channel} tone={channel === "LINE 通知" ? "green" : "neutral"}>{channel}</Badge>
                ))}
              </div>
            </div>

            <div className={cn("rounded-[24px] p-4", softPanelClass)}>
              <h3 className="text-lg font-black">通知规则</h3>
              <div className="mt-4 space-y-3">
                <label className={cn("flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold", panelCardClass)}>
                  <span>超额通知阈值</span>
                  <input
                    className={compactInputClass}
                    onChange={(event) =>
                      updateDraft({
                        ruleSet: {
                          ...draft.ruleSet,
                          notificationRules: {
                            ...draft.ruleSet.notificationRules,
                            overbookThreshold: Number(event.target.value || 0)
                          }
                        }
                      })}
                    type="number"
                    value={draft.ruleSet.notificationRules.overbookThreshold}
                  />
                </label>
                <label className={cn("flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold", panelCardClass)}>
                  <span>低预约阈值</span>
                  <input
                    className={compactInputClass}
                    onChange={(event) =>
                      updateDraft({
                        ruleSet: {
                          ...draft.ruleSet,
                          notificationRules: {
                            ...draft.ruleSet.notificationRules,
                            lowBookingThreshold: Number(event.target.value || 0)
                          }
                        }
                      })}
                    type="number"
                    value={draft.ruleSet.notificationRules.lowBookingThreshold}
                  />
                </label>
                <label className={cn("block rounded-2xl border px-4 py-3 text-sm font-semibold", panelCardClass)}>
                  商户附加通知文字
                  <input
                    className={cn("mt-2 w-full rounded-xl border px-3 py-2 outline-none", isMobileSurface ? "border-line bg-white/80 text-ink" : "merchant-dispatch-field")}
                    onChange={(event) =>
                      updateDraft({
                        ruleSet: {
                          ...draft.ruleSet,
                          notificationRules: {
                            ...draft.ruleSet.notificationRules,
                            discountTemplate: event.target.value
                          }
                        }
                      })}
                    value={draft.ruleSet.notificationRules.discountTemplate}
                  />
                </label>
                <Button
                  className={secondaryButtonClass}
                  variant="secondary"
                  onClick={() =>
                    setNotificationPreview(
                      previewDispatchNotificationTemplate(storeId, "深层清洁套餐", draft.periodStart, "18:00-20:00")
                    )}
                >
                  预览通知模板
                </Button>
                {notificationPreview ? <p className={cn("rounded-2xl px-4 py-3 text-sm leading-6", noteClass)}>{notificationPreview}</p> : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}
      </div>

      {validationMessage ? (
        <p className={cn("rounded-2xl px-4 py-3 text-sm font-semibold", isMobileSurface ? "bg-coral/15 text-coral" : "merchant-dispatch-alert")}>
          {validationMessage}
        </p>
      ) : null}

      <div className="sticky bottom-4 z-10">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${actionColumnCount}, minmax(0, 1fr))` }}>
          {!isFirstRulePhase ? (
            <Button
              className={cn(secondaryButtonClass, "w-full min-w-0 whitespace-nowrap px-2 text-[12px] sm:px-4 sm:text-sm")}
              variant="secondary"
              onClick={() => moveRulePhase(rulePhaseIndex - 1)}
            >
              上一步
            </Button>
          ) : null}
          <Button
            className={cn(secondaryButtonClass, "w-full min-w-0 whitespace-nowrap px-2 text-[12px] sm:px-4 sm:text-sm")}
            variant="secondary"
            onClick={() => {
              const result = saveDispatchCycleDraft(draft);
              onMessage(result.ok ? "排班草稿已保存，后台和商户端都可继续接着编辑。" : result.message ?? "保存失败。");
            }}
          >
            保存草稿
          </Button>
          {isLastRulePhase ? (
            <Button
              className="w-full min-w-0 whitespace-nowrap px-2 text-[12px] sm:px-4 sm:text-sm"
              disabled={!canSaveCycle}
              onClick={() => {
                const saved = saveDispatchCycleDraft(draft);

                if (!saved.ok) {
                  onMessage(saved.message ?? "保存失败。");
                  return;
                }

                const launched = launchDispatchCycle(draft.id, operatorId);
                onMessage(
                  launched.ok
                    ? draft.mode === "STORE_ASSIGN_FINAL"
                      ? `已保存 ${draft.name}，商户直接排班已正式生效并生成 confirmed slots。`
                      : `已发起 ${draft.name}，当前停留在 ${draft.mode === "STORE_COLLECT_CONFIRM" ? "步骤 3" : "步骤 4"}。`
                    : launched.message ?? "发起失败。"
                );
              }}
            >
              发起
            </Button>
          ) : (
            <Button
              className={cn(secondaryButtonClass, "w-full min-w-0 whitespace-nowrap px-2 text-[12px] sm:px-4 sm:text-sm")}
              variant="secondary"
              onClick={cancelEditing}
            >
              取消编辑
            </Button>
          )}
          {!isLastRulePhase ? (
            <Button
              className="w-full min-w-0 whitespace-nowrap px-2 text-[12px] sm:px-4 sm:text-sm"
              onClick={() => moveRulePhase(rulePhaseIndex + 1)}
            >
              下一步
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
