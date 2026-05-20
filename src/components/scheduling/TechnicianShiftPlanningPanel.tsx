import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useEntityStore } from "../../state/entityStore";
import { saveTechnicianResponse, useShiftPlanningStore } from "../../state/shiftPlanningStore";
import {
  adaptSlotMatrix,
  createDefaultTechnicianSpecialRules,
  formatHourLabel,
  generateTechnicianAvailabilityDraft,
  getActivePolicyForStore,
  getConfirmedShiftStatusLabel,
  getEditableTemplateCellState,
  getFinalBookableSlotStatusLabel,
  getImportableTemplateOptions,
  getOpenSlotCountsForResponse,
  getPolicyStatusLabel,
  getResponseStatusLabel,
  getScheduleContextLabel,
  isLongSchedulingRange,
  resolveScheduleContext,
  resolveImportedTemplateMatrix,
  resolveStoreSlotStatus
} from "../../lib/shiftPlanning";
import { parseDateKey } from "../../lib/oneClickSchedule";
import type {
  ScheduleSlotOverride,
  ScheduleTemplate,
  ShiftTemplateType,
  StorePlanningStatus,
  TechnicianAutoGenerateSummary
} from "../../types/shiftPlanning";
import { cn, hasLocalizedTitleText } from "../../lib/utils";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { ShiftMatrixEditor } from "./ShiftMatrixEditor";
import { TechnicianSmartPreferencePanel } from "./TechnicianSmartPreferencePanel";

function toneForPolicyStatus(status: StorePlanningStatus) {
  if (status === "opened" || status === "reopened") {
    return "green";
  }

  if (status === "confirmed") {
    return "blue";
  }

  if (status === "partially_confirmed") {
    return "yellow";
  }

  if (status === "locked") {
    return "red";
  }

  return "neutral";
}

export type TechnicianPlanningStep = "rules" | "oneClick" | "manual" | "confirm";

type DayOverrideDraft = {
  date: string;
  hour: number;
  status: Extract<ScheduleSlotOverride["status"], "available" | "unavailable">;
  reason: string;
};

type TechnicianPlanningDraft = {
  templateType: ShiftTemplateType;
  importSource: ScheduleTemplate["importSource"];
  repeatEnabled: boolean;
  startDate: string;
  endDate: string;
  slotMatrix: NonNullable<ScheduleTemplate["slotMatrix"]>;
  specialRules: ReturnType<typeof createDefaultTechnicianSpecialRules>;
  dayOverrides: DayOverrideDraft[];
};

const weekdayRuleOptions = [
  { label: "周日", value: 0 },
  { label: "周一", value: 1 },
  { label: "周二", value: 2 },
  { label: "周三", value: 3 },
  { label: "周四", value: 4 },
  { label: "周五", value: 5 },
  { label: "周六", value: 6 }
] as const;

const scheduleRequestOptions = [
  { kind: "leave", label: "请假申请", message: "请假申请已记录为待商户处理，商户确认前最终排班不会自动变更。" },
  { kind: "overtime", label: "加班申请", message: "加班申请已记录为待商户处理，最终确认时会进入冲突与容量校验。" },
  { kind: "resignation", label: "退职日期", message: "退职日期申请已记录为待商户处理，退职日后的班次会在最终确认阶段阻断。" }
] as const;
type ScheduleRequestKind = (typeof scheduleRequestOptions)[number]["kind"];

const confirmationNotificationTypes = new Set([
  "store_opened_period",
  "store_updated_period",
  "store_locked_period",
  "technician_submitted_response",
  "technician_updated_response",
  "shift_confirmed",
  "shift_waitlisted"
] as const);

const planningSectionClass =
  "min-w-0 max-w-full rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]";
const planningInsetClass =
  "rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)]";
const planningInputClass =
  "mt-1 h-10 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-4 text-sm font-black text-[color:var(--client-text)] outline-none disabled:opacity-60";

function PlanningBadge({
  children,
  tone,
  className
}: {
  children: ReactNode;
  tone: BadgeTone;
  className?: string;
}) {
  const toneClassName =
    tone === "red"
      ? "border-[color:color-mix(in_srgb,var(--client-accent)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-accent)_14%,transparent)] text-[color:color-mix(in_srgb,var(--client-accent)_82%,white_18%)]"
      : tone === "yellow"
        ? "border-[color:color-mix(in_srgb,var(--client-warm)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-warm)_14%,transparent)] text-[color:color-mix(in_srgb,var(--client-warm)_76%,var(--client-text)_24%)]"
        : tone === "neutral"
          ? "border-[color:color-mix(in_srgb,var(--client-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_84%,transparent)] text-[color:var(--client-muted)]"
          : "border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] text-[color:var(--client-primary-strong)]";

  return (
    <Badge className={cn("border px-2.5 py-1 text-[11px] font-black backdrop-blur", toneClassName, className)} tone={tone}>
      {children}
    </Badge>
  );
}

function PlanningSectionHeading({
  eyebrow,
  title,
  info,
  right
}: {
  eyebrow?: string;
  title: string;
  info?: string;
  right?: ReactNode;
}) {
  const showEyebrow = Boolean(eyebrow && hasLocalizedTitleText(eyebrow));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        {showEyebrow ? <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">{eyebrow}</p> : null}
        <TitleWithInfo
          info={info}
          infoClassName="h-5 w-5 border-[color:color-mix(in_srgb,var(--client-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] text-[color:var(--client-muted)]"
          label={`查看${title}说明`}
          title={<span className="truncate text-[18px] font-black tracking-[-0.02em] text-[color:var(--client-text)]">{title}</span>}
          titleClassName="min-w-0"
          variant="client"
        />
      </div>
      {right}
    </div>
  );
}

function parseNullableNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const next = Number(trimmed);
  return Number.isFinite(next) ? next : null;
}

function formatRelativeRule(value: number | null, suffix: string) {
  return value == null ? "未限制" : `${value}${suffix}`;
}

function formatPreferenceValue(value: number) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function formatRuleStatusLabel(notificationType: string) {
  const labelMap: Record<string, string> = {
    store_opened_period: "商户开放排班",
    store_updated_period: "商户更新周期",
    store_locked_period: "商户锁定周期",
    technician_submitted_response: "已提交反馈",
    technician_updated_response: "已更新反馈",
    shift_confirmed: "排班已确认",
    shift_waitlisted: "进入候补"
  };

  return labelMap[notificationType] ?? notificationType;
}

export function TechnicianShiftPlanningPanel({
  technicianId,
  storeId,
  activeStep = "rules",
  selectedPlanningMethod = "oneClick",
  onStepChange
}: {
  technicianId: string;
  storeId: string;
  activeStep?: TechnicianPlanningStep;
  selectedPlanningMethod?: Extract<TechnicianPlanningStep, "oneClick" | "manual">;
  onStepChange?: (step: TechnicianPlanningStep) => void;
}) {
  const { technicians, stores } = useEntityStore();
  const shiftPlanning = useShiftPlanningStore();
  const technician = technicians.find((item) => item.id === technicianId) ?? technicians[0];
  const store = stores.find((item) => item.id === storeId) ?? stores[0];
  const scheduleContext = useMemo(
    () =>
      resolveScheduleContext({
        technician,
        storeId: technician?.storeId ?? storeId,
        modeConfigs: shiftPlanning.modeConfigs,
        atDate: new Date().toISOString()
      }),
    [shiftPlanning.modeConfigs, storeId, technician]
  );
  const policy = useMemo(
    () => getActivePolicyForStore(storeId, shiftPlanning.policies),
    [shiftPlanning.policies, storeId]
  );
  const storeTemplate = useMemo(
    () => (policy ? shiftPlanning.templates.find((template) => template.ownerType === "store" && template.policyId === policy.id) ?? null : null),
    [policy, shiftPlanning.templates]
  );
  const response = useMemo(
    () => (policy ? shiftPlanning.responses.find((item) => item.policyId === policy.id && item.technicianId === technicianId) ?? null : null),
    [policy, shiftPlanning.responses, technicianId]
  );
  const responseTemplate = useMemo(
    () => (response ? shiftPlanning.templates.find((template) => template.id === response.templateId) ?? null : null),
    [response, shiftPlanning.templates]
  );
  const responseOverrides = useMemo(
    () =>
      policy
        ? shiftPlanning.slotOverrides.filter((override) => override.ownerType === "technician" && override.policyId === policy.id && override.ownerId === technicianId)
        : [],
    [policy, shiftPlanning.slotOverrides, technicianId]
  );
  const confirmedShifts = useMemo(
    () => (policy ? shiftPlanning.confirmedShifts.filter((shift) => shift.policyId === policy.id && shift.technicianId === technicianId) : []),
    [policy, shiftPlanning.confirmedShifts, technicianId]
  );
  const finalBookableSlots = useMemo(
    () =>
      shiftPlanning.finalBookableSlots
        .filter((slot) => slot.technicianId === technicianId)
        .sort((left, right) => (left.date === right.date ? left.hour - right.hour : left.date.localeCompare(right.date))),
    [shiftPlanning.finalBookableSlots, technicianId]
  );
  const notifications = useMemo(
    () =>
      shiftPlanning.notifications
        .filter(
          (notification) => notification.targetType === "technician" && notification.targetId === technicianId && notification.storeId === storeId
        )
        .sort((left, right) => (left.scheduledAt < right.scheduledAt ? 1 : -1)),
    [shiftPlanning.notifications, storeId, technicianId]
  );
  const [message, setMessage] = useState<string | null>(null);
  const [selectedScheduleRequestKind, setSelectedScheduleRequestKind] = useState<ScheduleRequestKind | null>(null);
  const [selectedOverrideDate, setSelectedOverrideDate] = useState("2026-04-20");
  const [autoSummary, setAutoSummary] = useState<TechnicianAutoGenerateSummary | null>(null);
  const [draft, setDraft] = useState<TechnicianPlanningDraft | null>(null);

  useEffect(() => {
    if (!policy || !storeTemplate) {
      return;
    }

    setDraft({
      templateType: responseTemplate?.templateType ?? "week",
      importSource: responseTemplate?.importSource ?? null,
      repeatEnabled: responseTemplate?.repeatEnabled ?? true,
      startDate: response?.periodStart ?? policy.startDate,
      endDate: response?.periodEnd ?? policy.endDate,
      slotMatrix: responseTemplate?.slotMatrix?.map((row) => [...row]) ?? storeTemplate.slotMatrix.map((row) => row.map(() => false)),
      specialRules: response?.specialRules ?? createDefaultTechnicianSpecialRules(),
      dayOverrides: responseOverrides.map((override) => ({
        date: override.date,
        hour: override.hour,
        status: override.status as DayOverrideDraft["status"],
        reason: override.reason
      }))
    });
    setSelectedOverrideDate(response?.periodStart ?? policy.startDate);
    setAutoSummary(null);
    setMessage(null);
    setSelectedScheduleRequestKind(null);
  }, [policy, response, responseOverrides, responseTemplate, storeTemplate]);

  useEffect(() => {
    if (!policy) {
      return;
    }

    setSelectedOverrideDate((current) => {
      if (current >= policy.startDate && current <= policy.endDate) {
        return current;
      }

      return policy.startDate;
    });
  }, [policy]);

  const isStoreDirectAssignContext = scheduleContext.context === "STORE_DIRECT_ASSIGN";
  const canEdit = isStoreDirectAssignContext
    ? false
    : scheduleContext.requiresStoreConfirmation
    ? policy
      ? policy.status === "opened" || policy.status === "reopened"
      : false
    : policy
      ? policy.status !== "cancelled"
      : true;
  const inheritedRules = new Set(policy?.forceInheritedRules ?? []);
  const importOptions = useMemo(
    () =>
      draft && technician
        ? getImportableTemplateOptions({
            templates: shiftPlanning.templates,
            ownerType: "technician",
            ownerId: technician.id,
            storeId,
            templateType: draft.templateType,
            policyId: policy?.id
          })
        : [],
    [draft, policy?.id, shiftPlanning.templates, storeId, technician]
  );
  const selectedImportOption = useMemo(
    () => importOptions.find((option) => option.source === draft?.importSource) ?? null,
    [draft?.importSource, importOptions]
  );
  const counts = useMemo(
    () =>
      policy && storeTemplate
        ? getOpenSlotCountsForResponse(policy, storeTemplate, response, responseTemplate, shiftPlanning.slotOverrides)
        : { availableCount: 0, unavailableCount: 0 },
    [policy, response, responseTemplate, shiftPlanning.slotOverrides, storeTemplate]
  );
  const storeSlotSummary = useMemo(() => {
    if (!policy || !storeTemplate) {
      return { lockedCount: 0, openCount: 0 };
    }

    let openCount = 0;
    let lockedCount = 0;

    for (let date = policy.startDate; date <= policy.endDate; ) {
      for (let hour = 0; hour < 24; hour += 1) {
        const slotStatus = resolveStoreSlotStatus({
          policy,
          template: storeTemplate,
          overrides: shiftPlanning.slotOverrides,
          date,
          hour
        });

        if (slotStatus === "opened") {
          openCount += 1;
        } else if (slotStatus === "locked") {
          lockedCount += 1;
        }
      }

      const [year, month, day] = date.split("-").map(Number);
      const nextDate = new Date(year, month - 1, day + 1);
      date = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
    }

    return { lockedCount, openCount };
  }, [policy, shiftPlanning.slotOverrides, storeTemplate]);
  const confirmedCount = confirmedShifts.filter((shift) => shift.shiftStatus === "confirmed").length;
  const waitlistedCount = confirmedShifts.filter((shift) => shift.shiftStatus === "waitlisted").length;
  const finalAvailableCount = finalBookableSlots.filter((slot) => slot.status === "available").length;
  const finalConflictCount = finalBookableSlots.filter((slot) => slot.status === "conflict").length;
  const confirmationNotifications = notifications.filter((notification) => confirmationNotificationTypes.has(notification.notificationType as never));
  const selectedDateOverrides = useMemo(
    () => draft?.dayOverrides.filter((override) => override.date === selectedOverrideDate) ?? [],
    [draft?.dayOverrides, selectedOverrideDate]
  );
  const selectedDateOverrideMap = useMemo(
    () => new Map(selectedDateOverrides.map((override) => [override.hour, override])),
    [selectedDateOverrides]
  );
  const selectedOverrideDateMeta = useMemo(() => {
    const weekdayValue = parseDateKey(selectedOverrideDate).getDay();

    return {
      dateLabel: selectedOverrideDate.replace(/-/g, "/"),
      weekdayLabel: weekdayRuleOptions.find((option) => option.value === weekdayValue)?.label ?? ""
    };
  }, [selectedOverrideDate]);

  if (!policy || !storeTemplate || !draft || !technician || !store) {
    return (
      <section className={planningSectionClass}>
        <p className="text-sm font-semibold text-[color:var(--client-muted)]">正在加载店铺开放排班周期...</p>
      </section>
    );
  }

  const longPeriod = isLongSchedulingRange(policy.startDate, policy.endDate);
  const isSelfFinalContext = scheduleContext.context === "INDIVIDUAL_SELF_FINAL" || scheduleContext.context === "STORE_TECH_SELF_FINAL";
  const usesFinalBookableProjection = isSelfFinalContext || isStoreDirectAssignContext;
  const summaryCards: Array<[string, string, BadgeTone]> = [
    ["当前上下文", getScheduleContextLabel(scheduleContext.context), "blue"],
    [
      scheduleContext.context === "STORE_CONFIRM_REQUIRED" ? "商户开放" : isStoreDirectAssignContext ? "商户安排" : "店铺约束",
      scheduleContext.context === "STORE_CONFIRM_REQUIRED"
        ? `${storeSlotSummary.openCount} 格`
        : isStoreDirectAssignContext
          ? `${finalBookableSlots.length} 格已生效`
          : `${storeSlotSummary.openCount} 格允许发布`,
      "green"
    ],
    [
      isStoreDirectAssignContext ? "我的确认" : isSelfFinalContext ? "我的发布" : "我的反馈",
      isStoreDirectAssignContext ? "只读 / 可申请" : `${counts.availableCount} / ${counts.unavailableCount}`,
      "yellow"
    ],
    [
      usesFinalBookableProjection ? "最终可预约" : "最终确认",
      usesFinalBookableProjection ? `${finalAvailableCount} / ${finalConflictCount}` : `${confirmedCount} / ${waitlistedCount}`,
      "neutral"
    ]
  ];
  const manualStepCaption = isStoreDirectAssignContext ? "步骤 3" : selectedPlanningMethod === "manual" ? "步骤 1" : "步骤 2";
  const confirmStepCaption = selectedPlanningMethod === "manual" && !isStoreDirectAssignContext ? "步骤 2" : "步骤 3";
  const currentStepCopy: Record<TechnicianPlanningStep, { caption: string; title: string }> = {
    rules: {
      caption: "步骤 1",
      title: isStoreDirectAssignContext ? "查看商户直接排班" : isSelfFinalContext ? "发布规则设定" : "排班规则设定"
    },
    oneClick: {
      caption: "步骤 2",
      title: isStoreDirectAssignContext ? "确认收到" : isSelfFinalContext ? "发布上班时间" : "按规则自动生成反馈"
    },
    manual: {
      caption: manualStepCaption,
      title: isStoreDirectAssignContext ? "申请更改" : isSelfFinalContext ? "手动发布上班时间" : "手动提交反馈"
    },
    confirm: {
      caption: confirmStepCaption,
      title: usesFinalBookableProjection ? "最终可预约结果" : "确定排班"
    }
  };
  const methodChoices: Array<{
    step: Extract<TechnicianPlanningStep, "oneClick" | "manual">;
    title: string;
    caption: string;
    badge: string;
  }> = [
    {
      step: "oneClick",
      title: scheduleContext.requiresStoreConfirmation ? "按规则自动生成反馈" : "按规则自动生成上班时间",
      caption: scheduleContext.requiresStoreConfirmation
        ? "读取商户开放格子，按商户规则、个人偏好和历史模板生成可上班反馈，再提交给商户最终确认。"
        : "按店铺允许发布时段、店铺约束和个人偏好生成可发布上班时间。",
      badge: scheduleContext.requiresStoreConfirmation ? "生成反馈" : "生成发布"
    },
    {
      step: "manual",
      title: scheduleContext.requiresStoreConfirmation ? "手动提交反馈" : "手动发布上班时间",
      caption: scheduleContext.requiresStoreConfirmation
        ? "直接点选可上班 / 不可上班时段并提交，商户最终确认后才进入可预约结果。"
        : "手动点选上班时间并发布，通过店铺校验后直接进入最终可预约投影。",
      badge: scheduleContext.requiresStoreConfirmation ? "商户确认模式" : "技师自主排班"
    }
  ];
  const leaveRequestDate = selectedOverrideDate >= policy.startDate && selectedOverrideDate <= policy.endDate ? selectedOverrideDate : policy.startDate;
  const leaveReferencedSlots = finalBookableSlots
    .filter((slot) => slot.date === leaveRequestDate)
    .slice(0, 4)
    .map((slot) => ({
      id: slot.id,
      label: `${formatHourLabel(slot.hour)} ${getFinalBookableSlotStatusLabel(slot.status)}`,
      tone: slot.status === "available" ? "blue" as const : slot.status === "booked" ? "yellow" as const : "red" as const
    }));
  const leaveDraftSlots = draft.dayOverrides
    .filter((override) => override.date === leaveRequestDate)
    .sort((left, right) => left.hour - right.hour)
    .slice(0, 4)
    .map((override) => ({
      id: `${override.date}-${override.hour}`,
      label: `${formatHourLabel(override.hour)} ${override.status === "available" ? "可出勤" : "不可出勤"}`,
      tone: override.status === "available" ? "blue" as const : "red" as const
    }));
  const leaveCalendarSlots = leaveReferencedSlots.length > 0
    ? leaveReferencedSlots
    : leaveDraftSlots.length > 0
      ? leaveDraftSlots
      : [
          { id: "leave-fallback-work", label: "10:00-14:00 可出勤", tone: "blue" as const },
          { id: "leave-fallback-leave", label: "15:00-17:00 请假申请", tone: "red" as const },
          { id: "leave-fallback-pending", label: "18:00-20:00 待确认", tone: "yellow" as const }
        ];

  const setSpecialRule = <K extends keyof TechnicianPlanningDraft["specialRules"]>(key: K, value: TechnicianPlanningDraft["specialRules"][K]) => {
    setDraft((current) => (current ? { ...current, specialRules: { ...current.specialRules, [key]: value } } : current));
  };

  const setWeekdayPreference = (weekday: number, value: string) => {
    const nextValue = parseNullableNumber(value) ?? 0;
    setDraft((current) =>
      current
        ? {
            ...current,
            specialRules: {
              ...current.specialRules,
              weekdayPreferencePercents: {
                ...current.specialRules.weekdayPreferencePercents,
                [weekday]: nextValue
              }
            }
          }
        : current
    );
  };

  const applyOverrideToggle = (hour: number) => {
    const storeSlotStatus = resolveStoreSlotStatus({
      policy,
      template: storeTemplate,
      overrides: shiftPlanning.slotOverrides,
      date: selectedOverrideDate,
      hour
    });

    if (storeSlotStatus === "closed" || !canEdit) {
      return;
    }

    const existing = draft.dayOverrides.find((override) => override.date === selectedOverrideDate && override.hour === hour);
    const nextStatus: DayOverrideDraft["status"] = existing?.status === "available" ? "unavailable" : "available";

    setDraft((current) =>
      current
        ? {
            ...current,
            dayOverrides: [
              ...current.dayOverrides.filter((override) => !(override.date === selectedOverrideDate && override.hour === hour)),
              {
                date: selectedOverrideDate,
                hour,
                status: nextStatus,
                reason: "技师单日微调"
              }
            ]
          }
        : current
    );
  };

  const applyImportedTemplate = () => {
    if (!selectedImportOption) {
      return;
    }

    const importedMatrix = resolveImportedTemplateMatrix({
      option: selectedImportOption,
      templates: shiftPlanning.templates,
      targetTemplateType: draft.templateType
    });

    if (!importedMatrix) {
      return;
    }

    setDraft((current) => (current ? { ...current, slotMatrix: importedMatrix } : current));
    setMessage(`已导入历史模板：${selectedImportOption.label}。`);
  };

  const runOneClickGeneration = () => {
    const importedMatrix = selectedImportOption
      ? resolveImportedTemplateMatrix({
          option: selectedImportOption,
          templates: shiftPlanning.templates,
          targetTemplateType: draft.templateType
        })
      : null;
    const result = generateTechnicianAvailabilityDraft({
      policy,
      storeTemplate,
      overrides: shiftPlanning.slotOverrides,
      templateType: draft.templateType,
      startDate: draft.startDate,
      endDate: draft.endDate,
      repeatEnabled: draft.repeatEnabled,
      baseTemplateType: draft.templateType,
      baseMatrix: importedMatrix ?? draft.slotMatrix,
      importedTemplateUsed: Boolean(importedMatrix),
      specialRules: draft.specialRules
    });

    setDraft((current) =>
      current
        ? {
            ...current,
            slotMatrix: result.slotMatrix,
            dayOverrides: result.slotOverrides
          }
        : current
    );
    setAutoSummary(result.summary);
    setMessage(
      scheduleContext.requiresStoreConfirmation
        ? `按规则自动生成反馈已完成：生成 ${result.summary.generatedAvailableCount} 格可上班反馈，可继续按模板或按日微调后再提交。`
        : `一键生成已完成：生成 ${result.summary.generatedAvailableCount} 格可发布上班时间，可继续微调后再发布。`
    );
  };

  const submitResponse = () => {
    saveTechnicianResponse({
      policyId: policy.id,
      storeId,
      technicianId,
      templateType: draft.templateType,
      importSource: draft.importSource,
      repeatEnabled: draft.repeatEnabled,
      startDate: draft.startDate,
      endDate: draft.endDate,
      slotMatrix: draft.slotMatrix,
      specialRules: draft.specialRules,
      slotOverrides: draft.dayOverrides
    });
    setMessage(
      response
        ? scheduleContext.requiresStoreConfirmation
          ? "排班反馈已更新，商户端会看到“已更新”状态。"
          : "上班时间已重新发布，最终可预约时间投影已同步更新。"
        : scheduleContext.requiresStoreConfirmation
          ? "排班反馈已提交，商户端已收到通知。"
          : "上班时间已发布，通过校验的时段会直接对用户可预约。"
    );
  };

  const renderInheritedHint = (disabled: boolean) => {
    if (!disabled) {
      return null;
    }

    return <span className="mt-1 block text-[11px] text-[color:var(--client-muted)]">该规则由商户统一设定，不可修改。</span>;
  };

  return (
    <section className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden [overflow-x:clip]">
      {activeStep === "rules" || isStoreDirectAssignContext ? (
      <section className={planningSectionClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">{currentStepCopy[activeStep].caption}</p>
              <PlanningBadge tone="blue">{getScheduleContextLabel(scheduleContext.context)}</PlanningBadge>
              <PlanningBadge tone={toneForPolicyStatus(policy.status)}>{getPolicyStatusLabel(policy.status)}</PlanningBadge>
              {longPeriod ? <PlanningBadge tone="yellow">长周期</PlanningBadge> : null}
              {response ? <PlanningBadge tone={response.responseStatus === "updated" ? "yellow" : "green"}>{getResponseStatusLabel(response.responseStatus)}</PlanningBadge> : null}
              {autoSummary ? <PlanningBadge tone="blue">已生成预览</PlanningBadge> : null}
            </div>
            <div className="mt-2">
              <PlanningSectionHeading
                info={
                  isStoreDirectAssignContext
                    ? "商户直接排班模式下，商户保存后即正式生效。这里默认只读；如需调整，请通过确认收到或申请更改进入商户处理。"
                    : activeStep === "rules"
                    ? isSelfFinalContext
                      ? "这一步只负责设定个人规则、发布限制和继承约束，发布后的时间会直接进入最终可预约投影。"
                      : "这一步只负责设定个人规则、偏好和继承限制，不混入最终结果列表。"
                    : activeStep === "oneClick"
                      ? isSelfFinalContext
                        ? "根据店铺允许发布时段、店铺约束、你的个人规则和历史模板生成可发布上班时间，并支持继续微调。"
                        : "根据商户开放时段、商户强制规则、你的个人规则和历史模板自动生成可接受排班，并支持继续微调。"
                      : activeStep === "manual"
                        ? isSelfFinalContext
                          ? "直接手动选择要发布的上班时间，通过店铺规则校验后进入最终可预约投影。"
                          : "直接手动选择可接受排班并提交，商户会在最终确认里处理确认或候补。"
                      : isSelfFinalContext
                        ? "这里只看已经进入最终可预约时间的结果、冲突原因和投影状态。"
                        : "这里只看商户最终处理后的排班结果、确认时间和相关变更记录。"
                }
                title={currentStepCopy[activeStep].title}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <PlanningBadge tone="blue">{policy.startDate} - {policy.endDate}</PlanningBadge>
            {scheduleContext.requiresStoreConfirmation && policy.feedbackDeadlineAt ? <PlanningBadge tone="yellow">反馈截止 {policy.feedbackDeadlineAt.slice(5, 16).replace("T", " ")}</PlanningBadge> : null}
            <PlanningBadge tone={canEdit ? "green" : "red"}>
              {canEdit ? (scheduleContext.requiresStoreConfirmation ? "当前可提交反馈" : "当前可发布") : isStoreDirectAssignContext ? "商户直接排班只读" : "当前只读"}
            </PlanningBadge>
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-semibold text-[color:var(--client-primary-strong)]">
            {message}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(([label, value, tone]) => (
            <article className={cn(planningInsetClass, "p-3")} key={label}>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-muted)]">{label}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <strong className="text-lg font-black text-[color:var(--client-text)]">{value}</strong>
                <PlanningBadge tone={tone}>{label}</PlanningBadge>
              </div>
            </article>
          ))}
        </div>

        <div className={cn(planningInsetClass, "mt-4 p-3")}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <PlanningSectionHeading
              info="当前模式不允许直接修改的内容，需要通过请假、加班或退职申请进入商户处理和最终确认。"
              title="申请入口与锁定说明"
            />
            <PlanningBadge tone={canEdit ? "green" : "red"}>
              {canEdit ? "可编辑反馈" : isStoreDirectAssignContext ? "可确认收到 / 申请更改" : "锁定：需走申请"}
            </PlanningBadge>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {scheduleRequestOptions.map((item) => (
              <Button
                className="border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)]"
                key={item.label}
                onClick={() => {
                  setSelectedScheduleRequestKind(item.kind);
                  setMessage(item.message);
                }}
                size="sm"
                variant="secondary"
              >
                {item.label}
              </Button>
            ))}
          </div>
          {selectedScheduleRequestKind === "leave" ? (
            <div className={cn(planningInsetClass, "mt-3 p-3")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-black text-[color:var(--client-text)]">固定模板：请假申请</p>
                  <p className="mt-1 text-[11px] font-bold leading-5 text-[color:var(--client-muted)]">
                    技师端只引用自己的日历安排；店铺端审批时会查看当天所有技师安排。
                  </p>
                </div>
                <PlanningBadge tone="red">请假</PlanningBadge>
              </div>
              <div className="mt-3 grid gap-2">
                {[
                  ["申请人", technician.name],
                  ["申请类型", "请假"],
                  ["申请日期", leaveRequestDate.replace(/-/g, ".")],
                  ["申请时段", "15:00-17:00"],
                  ["申请理由", "临时私事，需要离开店铺 2 小时。"]
                ].map(([label, value]) => (
                  <div className="grid grid-cols-[72px,minmax(0,1fr)] gap-2 text-[12px] leading-5" key={label}>
                    <span className="font-black text-[color:var(--client-muted)]">{label}</span>
                    <span className="font-bold text-[color:var(--client-text)]">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-black text-[color:var(--client-text)]">引用日历：我的日历安排</p>
                  <span className="text-[11px] font-black text-[color:var(--client-muted)]">{leaveRequestDate.replace(/-/g, "/")}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {leaveCalendarSlots.map((slot) => (
                    <PlanningBadge key={slot.id} tone={slot.tone}>
                      {slot.label}
                    </PlanningBadge>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

      {activeStep !== "rules" && !isStoreDirectAssignContext && message ? (
        <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-semibold text-[color:var(--client-primary-strong)]">
          {message}
        </div>
      ) : null}

      {(activeStep === "rules" || activeStep === "oneClick" || activeStep === "manual") && isStoreDirectAssignContext ? (
        <>
          <section className={planningSectionClass}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <PlanningSectionHeading
                info="商户直接排班保存后即成为正式排班；技师确认收到只是已读回执，不会阻断排班生效。"
                title="商户已安排的正式排班"
              />
              <div className="flex flex-wrap gap-2">
                <Button className="bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" size="sm" onClick={() => setMessage("已确认收到本次商户直接排班，排班已合并到我的排班。")}>
                  确认收到
                </Button>
                <Button
                  className="border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)]"
                  size="sm"
                  variant="secondary"
                  onClick={() => setMessage("已打开申请更改入口，请选择请假、加班、时间调整或备注提交给商户处理。")}
                >
                  申请更改
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ["正式排班", `${finalBookableSlots.length} 格`, "blue" as const],
                ["可预约容量", `${finalAvailableCount} 格`, "green" as const],
                ["已占用 / 冲突", `${finalBookableSlots.filter((slot) => slot.status === "booked").length} / ${finalConflictCount}`, "yellow" as const],
                ["处理方式", "确认收到 / 申请更改", "neutral" as const]
              ] as Array<[string, string, BadgeTone]>).map(([label, value, tone]) => (
                <article className={cn(planningInsetClass, "p-3")} key={label}>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-muted)]">{label}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <strong className="text-lg font-black text-[color:var(--client-text)]">{value}</strong>
                    <PlanningBadge tone={tone}>{label}</PlanningBadge>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={planningSectionClass}>
            <div className="flex items-center justify-between gap-3">
              <PlanningSectionHeading title="只读排班详情" />
              <PlanningBadge tone="yellow">{finalBookableSlots.length > 0 ? "正式已生效" : "暂无新的排班需求"}</PlanningBadge>
            </div>
            <div className="mt-3 space-y-2">
              {finalBookableSlots.length > 0 ? finalBookableSlots.slice(0, 12).map((slot) => (
                <article className={cn(planningInsetClass, "px-3 py-3")} key={slot.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <strong className="text-sm font-black text-[color:var(--client-text)]">{slot.date} {formatHourLabel(slot.hour)}</strong>
                      <p className="mt-1 text-xs text-[color:var(--client-muted)]">{slot.validationSummary}</p>
                    </div>
                    <PlanningBadge tone={slot.status === "available" ? "blue" : slot.status === "booked" ? "yellow" : "red"}>
                      {getFinalBookableSlotStatusLabel(slot.status)}
                    </PlanningBadge>
                  </div>
                </article>
              )) : (
                <div className="rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-3 py-4 text-sm font-semibold text-[color:var(--client-muted)]">
                  暂无新的排班需求。收到商户直接排班后，这里会展示正式班表并点亮 New。
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}

      {activeStep === "rules" && !isStoreDirectAssignContext && (
        <>
          <TechnicianSmartPreferencePanel storeId={storeId} technicianId={technicianId} />

          <section className={planningSectionClass}>
            <PlanningSectionHeading
              info="先选择本次反馈方式。商户确认模式会把结果作为反馈提交给商户；技师自主排班模式会把发布结果直接投影到最终可预约时间。"
              title="反馈方式"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {methodChoices.map((item) => {
                const active = selectedPlanningMethod === item.step;

                return (
                  <button
                    className={cn(
                      "rounded-[20px] border px-4 py-4 text-left transition",
                      active
                        ? "border-[color:color-mix(in_srgb,var(--client-primary)_38%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-primary)_16%,transparent)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] text-[color:var(--client-text)]"
                    )}
                    key={item.step}
                    onClick={() => onStepChange?.(item.step)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-base font-black">{item.title}</strong>
                      <PlanningBadge tone={active ? "green" : "neutral"}>{item.badge}</PlanningBadge>
                    </div>
                    <span className={cn("mt-3 block text-sm font-semibold leading-6", active ? "text-[color:var(--client-primary-strong)]/82" : "text-[color:var(--client-muted)]")}>
                      {item.caption}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={planningSectionClass}>
            <div className="flex items-start justify-between gap-3">
              <PlanningSectionHeading
                info="定义本次反馈的模板周期、生效时间和是否循环。最终生成结果会在第二步里完成。"
                right={<PlanningBadge tone="neutral">{draft.templateType === "day" ? "日模板" : draft.templateType === "week" ? "周模板" : "月模板"}</PlanningBadge>}
                title="规则生效范围"
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-black text-[color:var(--client-muted)]">
                模板类型
                <select
                  className={planningInputClass}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            slotMatrix:
                              current.templateType === event.target.value
                                ? current.slotMatrix
                                : adaptSlotMatrix(current.slotMatrix, current.templateType, event.target.value as ShiftTemplateType),
                            templateType: event.target.value as ShiftTemplateType
                          }
                        : current
                    )
                  }
                  value={draft.templateType}
                >
                  <option value="day">日模板</option>
                  <option value="week">周模板</option>
                  <option value="month">月模板（4 周）</option>
                </select>
              </label>
              <label className="text-xs font-black text-[color:var(--client-muted)]">
                起始日期
                <input
                  className={planningInputClass}
                  disabled={!canEdit}
                  max={policy.endDate}
                  min={policy.startDate}
                  onChange={(event) => setDraft((current) => (current ? { ...current, startDate: event.target.value || current.startDate } : current))}
                  type="date"
                  value={draft.startDate}
                />
              </label>
              <label className="text-xs font-black text-[color:var(--client-muted)]">
                终止日期
                <input
                  className={planningInputClass}
                  disabled={!canEdit}
                  max={policy.endDate}
                  min={policy.startDate}
                  onChange={(event) => setDraft((current) => (current ? { ...current, endDate: event.target.value || current.endDate } : current))}
                  type="date"
                  value={draft.endDate}
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-3 text-sm font-semibold text-[color:var(--client-text)]/82">
                <input
                  checked={draft.repeatEnabled}
                  disabled={!canEdit}
                  onChange={(event) => setDraft((current) => (current ? { ...current, repeatEnabled: event.target.checked } : current))}
                  type="checkbox"
                />
                周期内循环套用
              </label>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <section className={planningSectionClass}>
              <PlanningSectionHeading title="偏好与需求权重" />
              <div className="mt-4 grid gap-3">
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  节假日偏好增减（%）
                  <input
                    className={planningInputClass}
                    disabled={!canEdit}
                    onChange={(event) => setSpecialRule("holidayPreferencePercent", parseNullableNumber(event.target.value) ?? 0)}
                    type="number"
                    value={draft.specialRules.holidayPreferencePercent}
                  />
                </label>
                <div>
                  <p className="text-xs font-black text-[color:var(--client-muted)]">按星期偏好增减</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {weekdayRuleOptions.map((option) => (
                      <label className="rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-3 py-3 text-xs font-black text-[color:var(--client-muted)]" key={option.value}>
                        <span className="block">{option.label}</span>
                        <input
                          className={planningInputClass}
                          disabled={!canEdit}
                          onChange={(event) => setWeekdayPreference(option.value, event.target.value)}
                          type="number"
                          value={draft.specialRules.weekdayPreferencePercents[option.value] ?? 0}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-3 text-sm font-semibold text-[color:var(--client-text)]/82">
                    <input
                      checked={draft.specialRules.acceptsPeakTimeAssignments}
                      disabled={!canEdit}
                      onChange={(event) => setSpecialRule("acceptsPeakTimeAssignments", event.target.checked)}
                      type="checkbox"
                    />
                    接受高峰期补排
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-3 text-sm font-semibold text-[color:var(--client-text)]/82">
                    <input
                      checked={draft.specialRules.acceptsTemporaryAssignments}
                      disabled={!canEdit}
                      onChange={(event) => setSpecialRule("acceptsTemporaryAssignments", event.target.checked)}
                      type="checkbox"
                    />
                    接受临时排班
                  </label>
                </div>
              </div>
            </section>

            <section className={planningSectionClass}>
              <PlanningSectionHeading title="个人限制与继承规则" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  日最大工时
                  <input
                    className={planningInputClass}
                    disabled={!canEdit || inheritedRules.has("hourLimits")}
                    onChange={(event) => setSpecialRule("dailyMaxHours", parseNullableNumber(event.target.value))}
                    type="number"
                    value={draft.specialRules.dailyMaxHours ?? ""}
                  />
                  {renderInheritedHint(inheritedRules.has("hourLimits"))}
                </label>
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  周最大工时
                  <input
                    className={planningInputClass}
                    disabled={!canEdit || inheritedRules.has("hourLimits")}
                    onChange={(event) => setSpecialRule("weeklyMaxHours", parseNullableNumber(event.target.value))}
                    type="number"
                    value={draft.specialRules.weeklyMaxHours ?? ""}
                  />
                  {renderInheritedHint(inheritedRules.has("hourLimits"))}
                </label>
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  月最大工时
                  <input
                    className={planningInputClass}
                    disabled={!canEdit || inheritedRules.has("hourLimits")}
                    onChange={(event) => setSpecialRule("monthlyMaxHours", parseNullableNumber(event.target.value))}
                    type="number"
                    value={draft.specialRules.monthlyMaxHours ?? ""}
                  />
                  {renderInheritedHint(inheritedRules.has("hourLimits"))}
                </label>
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  周最少休息日
                  <input
                    className={planningInputClass}
                    disabled={!canEdit || inheritedRules.has("restDays")}
                    onChange={(event) => setSpecialRule("minRestDaysWeek", parseNullableNumber(event.target.value))}
                    type="number"
                    value={draft.specialRules.minRestDaysWeek ?? ""}
                  />
                  {renderInheritedHint(inheritedRules.has("restDays"))}
                </label>
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  周最多休息日
                  <input
                    className={planningInputClass}
                    disabled={!canEdit || inheritedRules.has("restDays")}
                    onChange={(event) => setSpecialRule("maxRestDaysWeek", parseNullableNumber(event.target.value))}
                    type="number"
                    value={draft.specialRules.maxRestDaysWeek ?? ""}
                  />
                  {renderInheritedHint(inheritedRules.has("restDays"))}
                </label>
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  月最少休息日
                  <input
                    className={planningInputClass}
                    disabled={!canEdit || inheritedRules.has("restDays")}
                    onChange={(event) => setSpecialRule("minRestDaysMonth", parseNullableNumber(event.target.value))}
                    type="number"
                    value={draft.specialRules.minRestDaysMonth ?? ""}
                  />
                  {renderInheritedHint(inheritedRules.has("restDays"))}
                </label>
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  月最多休息日
                  <input
                    className={planningInputClass}
                    disabled={!canEdit || inheritedRules.has("restDays")}
                    onChange={(event) => setSpecialRule("maxRestDaysMonth", parseNullableNumber(event.target.value))}
                    type="number"
                    value={draft.specialRules.maxRestDaysMonth ?? ""}
                  />
                  {renderInheritedHint(inheritedRules.has("restDays"))}
                </label>
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  服务前缓冲（分钟）
                  <input
                    className={planningInputClass}
                    disabled={!canEdit || inheritedRules.has("buffers")}
                    onChange={(event) => setSpecialRule("preServiceBufferMinutes", parseNullableNumber(event.target.value) ?? 0)}
                    type="number"
                    value={draft.specialRules.preServiceBufferMinutes}
                  />
                  {renderInheritedHint(inheritedRules.has("buffers"))}
                </label>
                <label className="text-xs font-black text-[color:var(--client-muted)]">
                  服务后缓冲（分钟）
                  <input
                    className={planningInputClass}
                    disabled={!canEdit || inheritedRules.has("buffers")}
                    onChange={(event) => setSpecialRule("postServiceBufferMinutes", parseNullableNumber(event.target.value) ?? 0)}
                    type="number"
                    value={draft.specialRules.postServiceBufferMinutes}
                  />
                  {renderInheritedHint(inheritedRules.has("buffers"))}
                </label>
              </div>
            </section>
          </section>

          <div className="flex justify-end">
            <Button
              className="h-12 w-full bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-primary)_18%,transparent)] sm:w-auto sm:min-w-[220px]"
              onClick={() => onStepChange?.(selectedPlanningMethod)}
              size="lg"
            >
              {selectedPlanningMethod === "manual"
                ? scheduleContext.requiresStoreConfirmation ? "下一步：手动提交反馈" : "下一步：手动发布上班"
                : scheduleContext.requiresStoreConfirmation ? "下一步：自动生成反馈" : "下一步：自动生成上班"}
            </Button>
          </div>
        </>
      )}

      {(activeStep === "oneClick" || activeStep === "manual") && !isStoreDirectAssignContext && (
        <>
          <section className={planningSectionClass}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <PlanningSectionHeading
                info={
                  activeStep === "oneClick"
                    ? scheduleContext.requiresStoreConfirmation
                      ? "生成时会同时参考商户开放时段、商户强制规则、你的个人规则，以及你选择的历史模板或当前模板。"
                      : "生成时会同时参考店铺允许发布时段、店铺规则、你的个人规则，以及你选择的历史模板或当前模板。"
                    : scheduleContext.requiresStoreConfirmation
                      ? "手动提交反馈会直接编辑本周期可上班 / 不可上班时段，保存后进入商户最终确认流程。"
                      : "手动发布会直接编辑本周期上班时间，发布后进入最终可预约投影。"
                }
                title={
                  activeStep === "oneClick"
                    ? scheduleContext.requiresStoreConfirmation ? "按规则自动生成反馈" : "根据店铺规则生成可发布上班时间"
                    : scheduleContext.requiresStoreConfirmation ? "手动提交反馈" : "手动发布上班时间"
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  className="border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)]"
                  disabled={!canEdit || !selectedImportOption}
                  size="sm"
                  variant="secondary"
                  onClick={applyImportedTemplate}
                >
                  导入历史模板
                </Button>
                {activeStep === "oneClick" ? (
                  <Button className="bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" disabled={!canEdit} size="sm" onClick={runOneClickGeneration}>
                    {scheduleContext.requiresStoreConfirmation ? "一键生成" : "一键生成并预览发布"}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-black text-[color:var(--client-muted)]">
                模板类型
                <select
                  className={planningInputClass}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            slotMatrix:
                              current.templateType === event.target.value
                                ? current.slotMatrix
                                : adaptSlotMatrix(current.slotMatrix, current.templateType, event.target.value as ShiftTemplateType),
                            templateType: event.target.value as ShiftTemplateType
                          }
                        : current
                    )
                  }
                  value={draft.templateType}
                >
                  <option value="day">日模板</option>
                  <option value="week">周模板</option>
                  <option value="month">月模板（4 周）</option>
                </select>
              </label>
              <label className="text-xs font-black text-[color:var(--client-muted)]">
                导入历史模板
                <select
                  className={planningInputClass}
                  disabled={!canEdit || importOptions.length === 0}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, importSource: event.target.value ? (event.target.value as ScheduleTemplate["importSource"]) : null }
                        : current
                    )
                  }
                  value={draft.importSource ?? ""}
                >
                  <option value="">不导入历史</option>
                  {importOptions.map((option) => (
                    <option key={`${option.source}-${option.templateId}`} value={option.source}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className={cn(planningInsetClass, "px-4 py-3")}>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-muted)]">规则摘要</p>
                <p className="mt-2 text-sm font-black text-[color:var(--client-text)]">
                  {formatRelativeRule(draft.specialRules.dailyMaxHours, "h / 日")}
                </p>
                <p className="mt-1 text-xs text-[color:var(--client-muted)]">
                  周休 {formatRelativeRule(draft.specialRules.minRestDaysWeek, "天起")} / 月休 {formatRelativeRule(draft.specialRules.minRestDaysMonth, "天起")}
                </p>
              </div>
              <div className={cn(planningInsetClass, "px-4 py-3")}>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-muted)]">自动生成偏好</p>
                <p className="mt-2 text-sm font-black text-[color:var(--client-text)]">
                  节假日 {formatPreferenceValue(draft.specialRules.holidayPreferencePercent)}
                </p>
                <p className="mt-1 text-xs text-[color:var(--client-muted)]">
                  高峰补排 {draft.specialRules.acceptsPeakTimeAssignments ? "接受" : "不接受"} / 临时排班 {draft.specialRules.acceptsTemporaryAssignments ? "接受" : "不接受"}
                </p>
              </div>
            </div>

            {activeStep === "oneClick" && autoSummary ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {([
                  [scheduleContext.requiresStoreConfirmation ? "商户开放" : "店铺允许发布", `${autoSummary.openSlotCount} 格`, "green" as const],
                  [scheduleContext.requiresStoreConfirmation ? "生成可接受" : "生成可发布", `${autoSummary.generatedAvailableCount} 格`, "blue" as const],
                  [scheduleContext.requiresStoreConfirmation ? "生成不可接受" : "生成不可发布", `${autoSummary.generatedUnavailableCount} 格`, "yellow" as const],
                  ["差异覆盖", `${autoSummary.overrideCount} 条`, "neutral" as const]
                ] as Array<[string, string, BadgeTone]>).map(([label, value, tone]) => (
                  <article className={cn(planningInsetClass, "p-3")} key={label}>
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-muted)]">{label}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <strong className="text-lg font-black text-[color:var(--client-text)]">{value}</strong>
                      <PlanningBadge tone={tone}>{label}</PlanningBadge>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className={planningSectionClass}>
            <ShiftMatrixEditor
              accent="technician"
              activeLabel={scheduleContext.requiresStoreConfirmation ? "可接受排班" : "可发布上班"}
              caption={
                activeStep === "oneClick"
                  ? scheduleContext.requiresStoreConfirmation
                    ? "一键生成后可继续直接微调模板。灰色格子表示商户未开放或当前周期不可编辑。"
                    : "一键生成后可继续直接微调模板。灰色格子表示店铺不允许发布或当前周期不可编辑。"
                  : scheduleContext.requiresStoreConfirmation
                    ? "直接点选本周期可接受时段。灰色格子表示商户未开放或当前周期不可编辑。"
                    : "直接点选本周期可发布上班时段。灰色格子表示店铺不允许发布或当前周期不可编辑。"
              }
              disabledLabel={scheduleContext.requiresStoreConfirmation ? "商户未开放" : "店铺不允许发布"}
              getCellDisabled={(dayIndex, hour) =>
                !canEdit || !getEditableTemplateCellState({
                  templateType: draft.templateType,
                  dayIndex,
                  hour,
                  startDate: draft.startDate,
                  endDate: draft.endDate,
                  storePolicy: policy,
                  storeTemplate,
                  overrides: shiftPlanning.slotOverrides
                })
              }
              getCellHint={(dayIndex, hour, active, disabled) =>
                disabled
                  ? `${scheduleContext.requiresStoreConfirmation ? "商户未开放" : "店铺未允许发布"}：${formatHourLabel(hour)}`
                  : `${active ? (scheduleContext.requiresStoreConfirmation ? "可接受排班" : "可发布上班") : "不可排班"} · ${formatHourLabel(hour)}`
              }
              inactiveLabel="不可排班"
              matrix={draft.slotMatrix}
              onChange={(nextMatrix) => setDraft((current) => (current ? { ...current, slotMatrix: nextMatrix } : current))}
              startDate={draft.startDate}
              stickyAxis={false}
              templateType={draft.templateType}
              title={
                activeStep === "oneClick"
                  ? scheduleContext.requiresStoreConfirmation ? "自动生成反馈预览" : "发布结果预览"
                  : scheduleContext.requiresStoreConfirmation ? "手动反馈表" : "手动发布表"
              }
            />
          </section>

          <section className={planningSectionClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <PlanningSectionHeading
                info={
                  activeStep === "oneClick"
                    ? scheduleContext.requiresStoreConfirmation ? "生成完成后仍可按日期、按小时进一步修正可接受与不可接受排班。" : "生成完成后仍可按日期、按小时进一步修正可发布与不可发布时段。"
                    : scheduleContext.requiresStoreConfirmation ? "按日期、按小时补充单日手动反馈，结果会和模板一起提交。" : "按日期、按小时补充单日手动发布，结果会和模板一起发布。"
                }
                title="按日微调"
              />
              <input
                className="h-10 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-4 text-sm font-black text-[color:var(--client-text)] outline-none disabled:opacity-60"
                disabled={!canEdit}
                max={policy.endDate}
                min={policy.startDate}
                onChange={(event) => setSelectedOverrideDate(event.target.value || policy.startDate)}
                type="date"
                value={selectedOverrideDate}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <PlanningBadge tone="blue">{scheduleContext.requiresStoreConfirmation ? "可接受排班" : "可发布上班"}</PlanningBadge>
              <PlanningBadge tone="neutral">不可排班</PlanningBadge>
              <PlanningBadge tone="yellow">{scheduleContext.requiresStoreConfirmation ? "商户未开放" : "店铺关闭"}</PlanningBadge>
            </div>

            <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] [contain:layout_paint]">
              <div
                className="max-w-full overflow-x-auto overscroll-x-contain"
                data-page-drag-ignore="true"
                style={{
                  WebkitOverflowScrolling: "touch"
                }}
              >
                <div className="min-w-[1216px]">
                  <div className="grid grid-cols-[112px_repeat(24,minmax(46px,1fr))] border-b border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)] text-center text-[11px] font-black text-[color:var(--client-muted)]">
                    <div className="relative z-[1] flex flex-col items-start justify-center gap-0.5 border-r border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)] px-3 py-3 text-left">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--client-muted)]">日期</span>
                      <span className="text-xs font-black text-[color:var(--client-text)]">/ 小时</span>
                    </div>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <div className="border-l border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] px-1 py-3" key={`override-hour-${hour}`}>
                        {String(hour).padStart(2, "0")}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-[112px_repeat(24,minmax(46px,1fr))]">
                    <div className="relative z-[1] flex h-14 min-w-[112px] flex-col justify-center gap-0.5 border-r border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] px-3 text-left">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--client-muted)]">{selectedOverrideDateMeta.dateLabel}</span>
                      <span className="truncate text-sm font-black text-[color:var(--client-text)]">{selectedOverrideDateMeta.weekdayLabel}</span>
                    </div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const override = selectedDateOverrideMap.get(hour);
                      const storeSlotStatus = resolveStoreSlotStatus({
                        policy,
                        template: storeTemplate,
                        overrides: shiftPlanning.slotOverrides,
                        date: selectedOverrideDate,
                        hour
                      });
                      const disabled = storeSlotStatus === "closed" || !canEdit;
                      const active = override?.status === "available";
                      const hint = disabled
                        ? `${scheduleContext.requiresStoreConfirmation ? "商户未开放" : "店铺关闭"}：${formatHourLabel(hour)}`
                        : `${active ? (scheduleContext.requiresStoreConfirmation ? "可接受排班" : "可发布上班") : "不可排班"} · ${formatHourLabel(hour)}`;

                      return (
                        <button
                          className={cn(
                            "h-14 border-l px-0 transition",
                            disabled
                              ? "cursor-not-allowed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[repeating-linear-gradient(135deg,rgba(148,163,184,0.18)_0,rgba(148,163,184,0.18)_8px,rgba(255,255,255,0.88)_8px,rgba(255,255,255,0.88)_16px)] text-[color:color-mix(in_srgb,var(--client-muted)_40%,transparent)]"
                              : active
                                ? "border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                                : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-[color:var(--client-muted)] hover:border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] hover:text-[color:var(--client-primary-strong)]"
                          )}
                          key={`${selectedOverrideDate}-${hour}`}
                          onClick={() => applyOverrideToggle(hour)}
                          title={hint}
                          type="button"
                        >
                          <span className="sr-only">{hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="sticky bottom-4 z-10">
            <div className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)] backdrop-blur-xl">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm font-semibold text-[color:var(--client-muted)]">
                  {canEdit
                    ? scheduleContext.requiresStoreConfirmation
                      ? `当前已经选择 ${counts.availableCount} 格可接受排班。保存后商户端会收到新的反馈结果。`
                      : `当前已经选择 ${counts.availableCount} 格可发布上班时间。发布后通过校验的时段会直接进入最终可预约时间。`
                    : scheduleContext.requiresStoreConfirmation
                      ? "当前周期已锁定或已确认，如需变更请等待商户重新开放。"
                      : "当前时段暂不可发布，可能是店铺黑屏、营业时间限制或当前周期只读。"}
                </div>
                <Button className="bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] lg:min-w-[220px]" disabled={!canEdit} onClick={submitResponse}>
                  {response
                    ? scheduleContext.requiresStoreConfirmation
                      ? "更新排班反馈"
                      : "更新并重新发布"
                    : scheduleContext.requiresStoreConfirmation
                      ? "提交排班反馈"
                      : "发布上班时间"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeStep === "confirm" && (
        <>
          <section className={planningSectionClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <PlanningSectionHeading
                eyebrow={currentStepCopy.confirm.caption}
                info={
                  usesFinalBookableProjection
                    ? "这里只看已经进入最终可预约时间的结果、冲突原因和投影状态。"
                    : "这里只看商户最终处理后的排班结果、确认时间和相关变更记录。"
                }
                title={currentStepCopy.confirm.title}
              />
              <div className="flex flex-wrap gap-2">
                <PlanningBadge tone="blue">{policy.startDate} - {policy.endDate}</PlanningBadge>
                <PlanningBadge tone={response ? "green" : "neutral"}>{response ? getResponseStatusLabel(response.responseStatus) : "未提交"}</PlanningBadge>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              [isStoreDirectAssignContext ? "确认状态" : isSelfFinalContext ? "发布状态" : "反馈状态", isStoreDirectAssignContext ? "商户已正式安排" : response ? getResponseStatusLabel(response.responseStatus) : "未提交", "green" as const],
              [usesFinalBookableProjection ? "最终可预约" : "商户已确认", `${usesFinalBookableProjection ? finalAvailableCount : confirmedCount} 格`, "blue" as const],
              [usesFinalBookableProjection ? "冲突 / 占用" : "候补 / 调整", `${usesFinalBookableProjection ? `${finalConflictCount} / ${finalBookableSlots.filter((slot) => slot.status === "booked").length}` : waitlistedCount} 格`, "yellow" as const],
              ["结果通知", `${confirmationNotifications.length} 条`, "neutral" as const]
            ] as Array<[string, string, BadgeTone]>).map(([label, value, tone]) => (
              <article className={planningSectionClass} key={label}>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-muted)]">{label}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <strong className="text-lg font-black text-[color:var(--client-text)]">{value}</strong>
                  <PlanningBadge tone={tone}>{label}</PlanningBadge>
                </div>
              </article>
            ))}
          </section>

          <section className={planningSectionClass}>
            <div className="flex items-center justify-between gap-3">
              <PlanningSectionHeading title={usesFinalBookableProjection ? "已进入最终可预约时间的结果" : "商户最终确认后的排班"} />
              <PlanningBadge tone="yellow">{usesFinalBookableProjection ? finalBookableSlots.length : confirmedShifts.length} 格</PlanningBadge>
            </div>

            <div className="mt-3 space-y-2">
              {usesFinalBookableProjection ? (
                finalBookableSlots.length > 0 ? finalBookableSlots.map((slot) => (
                  <article className={cn(planningInsetClass, "px-3 py-3")} key={slot.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <strong className="text-sm font-black text-[color:var(--client-text)]">{slot.date} {formatHourLabel(slot.hour)}</strong>
                        <p className="mt-1 text-xs text-[color:var(--client-muted)]">{slot.validationSummary}</p>
                      </div>
                      <PlanningBadge tone={slot.status === "available" ? "blue" : slot.status === "booked" ? "yellow" : "red"}>
                        {getFinalBookableSlotStatusLabel(slot.status)}
                      </PlanningBadge>
                    </div>
                  </article>
                )) : (
                  <div className="rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-3 py-4 text-sm font-semibold text-[color:var(--client-muted)]">
                    {isStoreDirectAssignContext ? "暂无新的排班需求。商户直接排班生效后会同步到这里。" : "当前还没有进入最终可预约时间的发布结果，先在第二步生成并发布上班时间即可。"}
                  </div>
                )
              ) : confirmedShifts.length > 0 ? confirmedShifts.map((shift) => (
                <article className={cn(planningInsetClass, "px-3 py-3")} key={shift.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <strong className="text-sm font-black text-[color:var(--client-text)]">{shift.date} {formatHourLabel(shift.hour)}</strong>
                      <p className="mt-1 text-xs text-[color:var(--client-muted)]">
                        {shift.source === "manual" ? "商户手动处理" : "系统一键确认"} · {shift.confirmedAt.slice(5, 16).replace("T", " ")}
                      </p>
                    </div>
                    <PlanningBadge tone={shift.shiftStatus === "confirmed" ? "blue" : shift.shiftStatus === "waitlisted" ? "yellow" : "red"}>
                      {getConfirmedShiftStatusLabel(shift.shiftStatus)}
                    </PlanningBadge>
                  </div>
                </article>
              )) : (
                <div className="rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-3 py-4 text-sm font-semibold text-[color:var(--client-muted)]">
                  当前周期还没有商户最终确认结果，先在第二步提交你的排班反馈即可。
                </div>
              )}
            </div>
          </section>

          <section className={planningSectionClass}>
            <div className="flex items-center justify-between gap-3">
              <PlanningSectionHeading title="确认与变更记录" />
              <PlanningBadge tone="neutral">{confirmationNotifications.length} 条</PlanningBadge>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {confirmationNotifications.length > 0 ? confirmationNotifications.map((notification) => (
                <article className={cn(planningInsetClass, "p-3")} key={notification.id}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm font-black text-[color:var(--client-text)]">{formatRuleStatusLabel(notification.notificationType)}</strong>
                    <PlanningBadge tone={notification.status === "read" ? "neutral" : "yellow"}>{notification.status}</PlanningBadge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{notification.payload}</p>
                  <p className="mt-2 text-xs text-[color:var(--client-muted)]">{notification.scheduledAt.slice(5, 16).replace("T", " ")}</p>
                </article>
              )) : (
                <div className="rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-3 py-4 text-sm font-semibold text-[color:var(--client-muted)]">
                  暂无新的确认或调整记录。
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
