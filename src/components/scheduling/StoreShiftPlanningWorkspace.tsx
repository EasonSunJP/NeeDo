import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { ShiftMatrixEditor } from "./ShiftMatrixEditor";
import { useEntityStore } from "../../state/entityStore";
import {
  ensureStorePlanningCycle,
  manuallyAssignShift,
  publishStorePlanningCycle,
  reopenStorePlanningCycle,
  runStoreAutoConfirmCycle,
  switchStoreScheduleMode,
  upsertStorePlanningCycle,
  useShiftPlanningStore
} from "../../state/shiftPlanningStore";
import {
  adaptSlotMatrix,
  buildPolicyHourDetails,
  buildStorePolicySummary,
  buildScheduleModeImpactPreview,
  createDefaultStoreScheduleModeConfirmRules,
  createDefaultStoreScheduleModeSelfRules,
  formatHourLabel,
  getActiveModeConfigForStore,
  getActivePolicyForStore,
  getConfirmedShiftStatusLabel,
  getImportableTemplateOptions,
  getOpenSlotCountsForResponse,
  getPolicyStatusLabel,
  getResponseStatusLabel,
  getStoreScheduleModeLabel,
  getTemplateImportSourceLabel,
  isLongSchedulingRange,
  resolveImportedTemplateMatrix
} from "../../lib/shiftPlanning";
import type { CapacityRule, PriorityRule, StoreScheduleModeConfig, StoreSchedulePolicy } from "../../types/shiftPlanning";
import { cn } from "../../lib/utils";

type WorkspaceMode = "merchant" | "admin";

export type StoreShiftPlanningSection =
  | "full"
  | "automation-overview"
  | "template-settings"
  | "rule-settings"
  | "special-rules"
  | "priority-rules"
  | "notification-rules"
  | "auto-confirm";

const defaultSpecialCapacityRows: Array<{ scopeType: CapacityRule["scopeType"]; scopeValue: string; label: string }> = [
  { scopeType: "global", scopeValue: "default", label: "全局默认" },
  { scopeType: "weekday", scopeValue: "5", label: "周五" },
  { scopeType: "holiday", scopeValue: "1", label: "祝日" },
  { scopeType: "date", scopeValue: "2026-05-05", label: "特殊日期 05/05" }
];

const weekdayDemandRows = [
  { weekday: 1, label: "周一" },
  { weekday: 2, label: "周二" },
  { weekday: 3, label: "周三" },
  { weekday: 4, label: "周四" },
  { weekday: 5, label: "周五" },
  { weekday: 6, label: "周六" },
  { weekday: 0, label: "周日" }
];

function toneForPolicyStatus(status: StoreSchedulePolicy["status"]) {
  if (status === "opened" || status === "reopened") {
    return "green";
  }

  if (status === "confirmed") {
    return "blue";
  }

  if (status === "partially_confirmed") {
    return "yellow";
  }

  if (status === "locked" || status === "cancelled") {
    return "red";
  }

  return "neutral";
}

export function StoreShiftPlanningWorkspace({
  mode,
  initialStoreId,
  section = "full"
}: {
  mode: WorkspaceMode;
  initialStoreId?: string;
  section?: StoreShiftPlanningSection;
}) {
  const { canAccessFeature } = useAuth();
  const { stores, technicians } = useEntityStore();
  const shiftPlanning = useShiftPlanningStore();
  const [selectedStoreId, setSelectedStoreId] = useState(initialStoreId ?? stores[0]?.id ?? "store-1");
  const [selectedDate, setSelectedDate] = useState("2026-04-20");
  const [message, setMessage] = useState<string | null>(null);
  const [modeDraft, setModeDraft] = useState<{
    mode: StoreScheduleModeConfig["mode"];
    effectiveFrom: string;
    reason: string;
    selfModeRules: StoreScheduleModeConfig["selfModeRules"];
    confirmModeRules: StoreScheduleModeConfig["confirmModeRules"];
  } | null>(null);
  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? stores[0];
  const storeTechnicians = useMemo(
    () => technicians.filter((technician) => technician.storeId === selectedStoreId),
    [selectedStoreId, technicians]
  );
  const activePolicy = useMemo(
    () => getActivePolicyForStore(selectedStoreId, shiftPlanning.policies),
    [selectedStoreId, shiftPlanning.policies]
  );
  const activeModeConfig = useMemo(
    () => getActiveModeConfigForStore(selectedStoreId, shiftPlanning.modeConfigs),
    [selectedStoreId, shiftPlanning.modeConfigs]
  );
  const upcomingModeConfig = useMemo(
    () =>
      [...shiftPlanning.modeConfigs]
        .filter((config) => config.storeId === selectedStoreId && config.status === "scheduled")
        .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0] ?? null,
    [selectedStoreId, shiftPlanning.modeConfigs]
  );
  const storeTemplate = useMemo(
    () =>
      activePolicy
        ? shiftPlanning.templates.find((template) => template.ownerType === "store" && template.policyId === activePolicy.id) ?? null
        : null,
    [activePolicy, shiftPlanning.templates]
  );
  const policyResponses = useMemo(
    () => (activePolicy ? shiftPlanning.responses.filter((response) => response.policyId === activePolicy.id) : []),
    [activePolicy, shiftPlanning.responses]
  );
  const responseTemplates = useMemo(
    () =>
      activePolicy
        ? shiftPlanning.templates.filter((template) => template.ownerType === "technician" && template.policyId === activePolicy.id)
        : [],
    [activePolicy, shiftPlanning.templates]
  );
  const confirmedShifts = useMemo(
    () => (activePolicy ? shiftPlanning.confirmedShifts.filter((shift) => shift.policyId === activePolicy.id) : []),
    [activePolicy, shiftPlanning.confirmedShifts]
  );
  const policyCapacityRules = useMemo(
    () =>
      activePolicy
        ? shiftPlanning.capacityRules.filter((rule) => !rule.policyId || rule.policyId === activePolicy.id)
        : [],
    [activePolicy, shiftPlanning.capacityRules]
  );

  useEffect(() => {
    if (!selectedStoreId) {
      return;
    }

    if (!activePolicy) {
      ensureStorePlanningCycle(selectedStoreId);
    }
  }, [activePolicy, selectedStoreId]);

  useEffect(() => {
    const baseConfig = activeModeConfig ?? {
      mode: "STORE_CONFIRM_REQUIRED" as const,
      effectiveFrom: "2026-04-20",
      reason: "",
      selfModeRules: createDefaultStoreScheduleModeSelfRules(),
      confirmModeRules: createDefaultStoreScheduleModeConfirmRules()
    };

    setModeDraft({
      mode: baseConfig.mode,
      effectiveFrom: (upcomingModeConfig?.effectiveFrom ?? baseConfig.effectiveFrom).slice(0, 10),
      reason: upcomingModeConfig?.reason ?? baseConfig.reason,
      selfModeRules: { ...baseConfig.selfModeRules },
      confirmModeRules: { ...baseConfig.confirmModeRules }
    });
  }, [activeModeConfig, upcomingModeConfig]);

  const [draft, setDraft] = useState<null | {
    policyId: string | null;
    appliesToTechnicians: string[];
    templateType: StoreSchedulePolicy["templateType"];
    importSource: StoreSchedulePolicy["importSource"];
    repeatEnabled: boolean;
    startDate: string;
    endDate: string;
    feedbackDeadlineAt: string | null;
    holidayDemandPercent: number;
    weekdayDemandPercents: StoreSchedulePolicy["weekdayDemandPercents"];
    dailyMaxHours: number | null;
    weeklyMaxHours: number | null;
    monthlyMaxHours: number | null;
    unlimitedMaxHours: boolean;
    minRestDaysWeek: number | null;
    maxRestDaysWeek: number | null;
    minRestDaysMonth: number | null;
    maxRestDaysMonth: number | null;
    preServiceBufferMinutes: number;
    postServiceBufferMinutes: number;
    overbookingNotifyEnabled: boolean;
    overbookingThreshold: number;
    tempTechnicianEnabled: boolean;
    tempTechnicianConfig: string;
    lowBookingRestNotifyEnabled: boolean;
    lowBookingThreshold: number;
    discountPushEnabled: boolean;
    discountTemplate: string;
    priorityRules: PriorityRule[];
    defaultCapacityPerHour: number | null;
    defaultMaxConfirmPerHour: number | null;
    forceInheritedRules: StoreSchedulePolicy["forceInheritedRules"];
    slotMatrix: NonNullable<typeof storeTemplate>["slotMatrix"];
    capacityRules: CapacityRule[];
  }>(null);

  useEffect(() => {
    if (!activePolicy || !storeTemplate) {
      return;
    }

    setDraft({
      policyId: activePolicy.id,
      appliesToTechnicians: [...activePolicy.appliesToTechnicians],
      templateType: activePolicy.templateType,
      importSource: activePolicy.importSource,
      repeatEnabled: activePolicy.repeatEnabled,
      startDate: activePolicy.startDate,
      endDate: activePolicy.endDate,
      feedbackDeadlineAt: activePolicy.feedbackDeadlineAt,
      holidayDemandPercent: activePolicy.holidayDemandPercent,
      weekdayDemandPercents: { ...activePolicy.weekdayDemandPercents },
      dailyMaxHours: activePolicy.dailyMaxHours,
      weeklyMaxHours: activePolicy.weeklyMaxHours,
      monthlyMaxHours: activePolicy.monthlyMaxHours,
      unlimitedMaxHours: activePolicy.unlimitedMaxHours,
      minRestDaysWeek: activePolicy.minRestDaysWeek,
      maxRestDaysWeek: activePolicy.maxRestDaysWeek,
      minRestDaysMonth: activePolicy.minRestDaysMonth,
      maxRestDaysMonth: activePolicy.maxRestDaysMonth,
      preServiceBufferMinutes: activePolicy.preServiceBufferMinutes,
      postServiceBufferMinutes: activePolicy.postServiceBufferMinutes,
      overbookingNotifyEnabled: activePolicy.overbookingNotifyEnabled,
      overbookingThreshold: activePolicy.overbookingThreshold,
      tempTechnicianEnabled: activePolicy.tempTechnicianEnabled,
      tempTechnicianConfig: activePolicy.tempTechnicianConfig,
      lowBookingRestNotifyEnabled: activePolicy.lowBookingRestNotifyEnabled,
      lowBookingThreshold: activePolicy.lowBookingThreshold,
      discountPushEnabled: activePolicy.discountPushEnabled,
      discountTemplate: activePolicy.discountTemplate,
      priorityRules: activePolicy.priorityRules.map((rule) => ({ ...rule })),
      defaultCapacityPerHour: activePolicy.defaultCapacityPerHour,
      defaultMaxConfirmPerHour: activePolicy.defaultMaxConfirmPerHour,
      forceInheritedRules: [...activePolicy.forceInheritedRules],
      slotMatrix: storeTemplate.slotMatrix.map((row) => [...row]),
      capacityRules: defaultSpecialCapacityRows.map((seed) => {
        const matched = policyCapacityRules.find((rule) => rule.scopeType === seed.scopeType && rule.scopeValue === seed.scopeValue);

        return {
          id: matched?.id ?? "",
          storeId: selectedStoreId,
          policyId: activePolicy.id,
          scopeType: seed.scopeType,
          scopeValue: seed.scopeValue,
          targetCount: matched?.targetCount ?? null,
          maxConfirmCount: matched?.maxConfirmCount ?? null
        };
      })
    });
    setSelectedDate(activePolicy.startDate);
  }, [activePolicy, policyCapacityRules, selectedStoreId, storeTemplate]);

  const importOptions = useMemo(
    () =>
      draft
        ? getImportableTemplateOptions({
            templates: shiftPlanning.templates,
            ownerType: "store",
            ownerId: selectedStoreId,
            storeId: selectedStoreId,
            templateType: draft.templateType,
            policyId: draft.policyId
          })
        : [],
    [draft, selectedStoreId, shiftPlanning.templates]
  );
  const selectedImportOption = useMemo(
    () => importOptions.find((option) => option.source === draft?.importSource) ?? null,
    [draft?.importSource, importOptions]
  );
  const summary = useMemo(
    () =>
      activePolicy && storeTemplate
        ? buildStorePolicySummary({
            policy: activePolicy,
            storeTemplate,
            responses: policyResponses,
            responseTemplates,
            overrides: shiftPlanning.slotOverrides,
            confirmedShifts,
            capacityRules: policyCapacityRules
          })
        : null,
    [activePolicy, confirmedShifts, policyCapacityRules, policyResponses, responseTemplates, shiftPlanning.slotOverrides, storeTemplate]
  );
  const hourDetails = useMemo(
    () =>
      activePolicy && storeTemplate
        ? buildPolicyHourDetails({
            policy: activePolicy,
            storeTemplate,
            date: selectedDate,
            responses: policyResponses,
            responseTemplates,
            overrides: shiftPlanning.slotOverrides,
            confirmedShifts,
            capacityRules: policyCapacityRules
          })
        : [],
    [activePolicy, confirmedShifts, policyCapacityRules, policyResponses, responseTemplates, selectedDate, shiftPlanning.slotOverrides, storeTemplate]
  );

  const responseTemplateMap = useMemo(
    () => new Map(responseTemplates.map((template) => [template.id, template])),
    [responseTemplates]
  );
  const pendingTechnicians = useMemo(
    () =>
      activePolicy
        ? activePolicy.appliesToTechnicians
            .filter((technicianId) => !policyResponses.some((response) => response.technicianId === technicianId))
            .map((technicianId) => storeTechnicians.find((technician) => technician.id === technicianId))
            .filter((technician): technician is NonNullable<typeof technician> => Boolean(technician))
        : [],
    [activePolicy, policyResponses, storeTechnicians]
  );
  const scopedNotifications = useMemo(
    () =>
      shiftPlanning.notifications.filter(
        (notification) =>
          notification.storeId === selectedStoreId &&
          (notification.targetType === "store" || notification.targetType === "admin")
      ),
    [selectedStoreId, shiftPlanning.notifications]
  );
  const scopedFinalSlots = useMemo(
    () => shiftPlanning.finalBookableSlots.filter((slot) => slot.storeId === selectedStoreId),
    [selectedStoreId, shiftPlanning.finalBookableSlots]
  );
  const currentMode = activeModeConfig?.mode ?? "STORE_CONFIRM_REQUIRED";
  const isSelfManagedMode = currentMode === "TECHNICIAN_SELF_FINAL";
  const modeImpactPreview = useMemo(
    () =>
      modeDraft
        ? buildScheduleModeImpactPreview({
            storeId: selectedStoreId,
            targetMode: modeDraft.mode,
            modeConfigs: shiftPlanning.modeConfigs,
            responses: shiftPlanning.responses,
            finalBookableSlots: shiftPlanning.finalBookableSlots,
            technicians
          })
        : null,
    [modeDraft, selectedStoreId, shiftPlanning.finalBookableSlots, shiftPlanning.modeConfigs, shiftPlanning.responses, technicians]
  );

  const saveDraft = () => {
    if (!draft || !selectedStoreId) {
      return null;
    }

    const policyId = upsertStorePlanningCycle({
      policyId: draft.policyId,
      storeId: selectedStoreId,
      appliesToTechnicians: draft.appliesToTechnicians,
      templateType: draft.templateType,
      importSource: draft.importSource,
      repeatEnabled: draft.repeatEnabled,
      startDate: draft.startDate,
      endDate: draft.endDate,
      holidayDemandPercent: draft.holidayDemandPercent,
      weekdayDemandPercents: draft.weekdayDemandPercents,
      dailyMaxHours: draft.dailyMaxHours,
      weeklyMaxHours: draft.weeklyMaxHours,
      monthlyMaxHours: draft.monthlyMaxHours,
      unlimitedMaxHours: draft.unlimitedMaxHours,
      minRestDaysWeek: draft.minRestDaysWeek,
      maxRestDaysWeek: draft.maxRestDaysWeek,
      minRestDaysMonth: draft.minRestDaysMonth,
      maxRestDaysMonth: draft.maxRestDaysMonth,
      preServiceBufferMinutes: draft.preServiceBufferMinutes,
      postServiceBufferMinutes: draft.postServiceBufferMinutes,
      overbookingNotifyEnabled: draft.overbookingNotifyEnabled,
      overbookingThreshold: draft.overbookingThreshold,
      tempTechnicianEnabled: draft.tempTechnicianEnabled,
      tempTechnicianConfig: draft.tempTechnicianConfig,
      lowBookingRestNotifyEnabled: draft.lowBookingRestNotifyEnabled,
      lowBookingThreshold: draft.lowBookingThreshold,
      discountPushEnabled: draft.discountPushEnabled,
      discountTemplate: draft.discountTemplate,
      priorityRules: draft.priorityRules,
      defaultCapacityPerHour: draft.defaultCapacityPerHour,
      defaultMaxConfirmPerHour: draft.defaultMaxConfirmPerHour,
      feedbackDeadlineAt: draft.feedbackDeadlineAt,
      forceInheritedRules: draft.forceInheritedRules,
      slotMatrix: draft.slotMatrix,
      capacityRules: draft.capacityRules
    });

    setMessage("店铺排班草稿已保存。");
    return policyId;
  };

  const publishModeDraft = () => {
    if (!modeDraft || !selectedStoreId) {
      return;
    }

    switchStoreScheduleMode({
      storeId: selectedStoreId,
      mode: modeDraft.mode,
      effectiveFrom: modeDraft.effectiveFrom,
      reason: modeDraft.reason || "根据当前经营策略更新排班模式",
      actorId: mode === "admin" ? "admin" : selectedStoreId,
      selfModeRules: modeDraft.selfModeRules,
      confirmModeRules: {
        ...modeDraft.confirmModeRules,
        feedbackDeadlineAt: draft?.feedbackDeadlineAt ?? modeDraft.confirmModeRules.feedbackDeadlineAt
      }
    });
    setMessage(
      modeDraft.mode === "TECHNICIAN_SELF_FINAL"
        ? `已切换为技师自行排班模式，${modeDraft.effectiveFrom} 起技师发布后的时间会直接进入最终可预约时间。`
        : `已切换为店铺排班模式，${modeDraft.effectiveFrom} 起技师需要先提交申请，待店铺确认后才会对用户可见。`
    );
  };

  if (!selectedStore || !activePolicy || !storeTemplate || !draft || !summary) {
    return (
      <section className="rounded-[28px] border border-line bg-white p-6 shadow-panel">
        <p className="text-sm font-semibold text-ink/60">正在初始化排班工作台...</p>
      </section>
    );
  }

  const longPeriod = isLongSchedulingRange(draft.startDate, draft.endDate);
  const canSave = draft.startDate <= draft.endDate && draft.appliesToTechnicians.length > 0;
  const canEditAutomation = mode === "admin" || canAccessFeature("merchant", "store.scheduling.automation.edit");
  const canRunOneClick = mode === "admin" || canAccessFeature("merchant", "store.scheduling.one-click.run");
  const canRunBatchConfirm = mode === "admin" || canAccessFeature("merchant", "store.scheduling.batch-confirm.run");
  const showAutomationOverview = section === "automation-overview";
  const showTemplateSettings = section === "full" || section === "template-settings";
  const showRuleSettings = section === "full" || section === "rule-settings";
  const showSpecialRules = section === "full" || section === "special-rules";
  const showPriorityRules = section === "full" || section === "priority-rules";
  const showNotificationRules = section === "full" || section === "notification-rules";
  const showAutoConfirm = (section === "full" || section === "auto-confirm") && !isSelfManagedMode;
  const techniciansWithPublishedSlots = new Set(
    scopedFinalSlots
      .filter((slot) => slot.sourceType === "technician_published" && slot.status === "available")
      .map((slot) => slot.technicianId)
  );
  const topSummaryCards = isSelfManagedMode
    ? ([
        ["当前模式", getStoreScheduleModeLabel(currentMode), "green" as const],
        ["最终可约", `${scopedFinalSlots.filter((slot) => slot.status === "available").length} 格`, "blue" as const],
        ["冲突 / 屏蔽", `${scopedFinalSlots.filter((slot) => slot.status === "conflict").length} / ${scopedFinalSlots.filter((slot) => slot.status === "blocked_by_store").length}`, "red" as const],
        ["未发布时间技师", `${Math.max(0, storeTechnicians.length - techniciansWithPublishedSlots.size)} 人`, "yellow" as const]
      ] as Array<[string, string, BadgeTone]>)
    : ([
        ["开放时段", `${summary.openHourCount} 格`, "green" as const],
        ["待反馈技师", `${summary.feedbackPendingCount} 人`, "yellow" as const],
        ["已确认 / 候补", `${summary.confirmedCount} / ${summary.waitlistedCount}`, "blue" as const],
        ["缺人 / 超额", `${summary.shortageCount} / ${summary.overflowCount}`, "red" as const]
      ] as Array<[string, string, BadgeTone]>);

  return (
    <section className="space-y-5">
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black tracking-[0.16em] text-moss/75">{mode === "admin" ? "后台改排" : "店铺排班系统"}</p>
              <Badge tone={toneForPolicyStatus(activePolicy.status)}>{getPolicyStatusLabel(activePolicy.status)}</Badge>
              <Badge tone={isSelfManagedMode ? "green" : "blue"}>{getStoreScheduleModeLabel(currentMode)}</Badge>
              {longPeriod ? <Badge tone="yellow">长期周期</Badge> : null}
            </div>
            <TitleWithInfo
              as="h2"
              className="mt-2"
              info={
                isSelfManagedMode
                  ? "当前店铺处于技师自行排班模式。技师发布后的上班时间会经过店铺规则与冲突校验，再直接投影到最终可预约时间。"
                  : "当前店铺处于店铺排班模式。店铺开放时段、技师反馈、店铺最终确认和后台代操作仍走统一确认流程。"
              }
              label={`${selectedStore.name} 自动排班工作台说明`}
              title={`${selectedStore.name} 自动排班工作台`}
              titleClassName="text-2xl font-black"
              variant="paper"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {mode === "admin" ? (
              <select
                className="h-10 rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                onChange={(event) => setSelectedStoreId(event.target.value)}
                value={selectedStoreId}
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            ) : null}
            <Button disabled={!canSave || !canEditAutomation} onClick={() => saveDraft()} size="sm" variant="secondary">
              保存草稿
            </Button>
            {isSelfManagedMode ? (
              <Button disabled={!modeDraft || !canEditAutomation} onClick={publishModeDraft} size="sm">
                发布模式配置
              </Button>
            ) : (
              <>
                <Button
                  disabled={!canSave || !canRunOneClick}
                  onClick={() => {
                    const policyId = saveDraft();

                    if (!policyId) {
                      return;
                    }

                    publishStorePlanningCycle(policyId, mode === "admin" ? "admin" : selectedStoreId);
                    setMessage("排班周期已开放，技师端会收到新周期通知。");
                  }}
                  size="sm"
                >
                  开放反馈
                </Button>
                <Button
                  disabled={!canRunBatchConfirm}
                  onClick={() => {
                    const result = runStoreAutoConfirmCycle(activePolicy.id, mode === "admin" ? "admin" : selectedStoreId);

                    if (!result) {
                      return;
                    }

                    setMessage(`一键确认已完成：已确认 ${result.summary.confirmedCount} 格，候补 ${result.summary.waitlistedCount} 格，缺口 ${result.summary.shortageCount} 处。`);
                  }}
                  size="sm"
                  variant="secondary"
                >
                  一键确认
                </Button>
                <Button disabled={!canEditAutomation} onClick={() => reopenStorePlanningCycle(activePolicy.id)} size="sm" variant="secondary">
                  重新开放
                </Button>
              </>
            )}
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl border border-moss/25 bg-[#eff7f2] px-4 py-3 text-sm font-semibold text-[#245a43]">
            {message}
          </div>
        ) : null}

        {modeDraft ? (
          <section className="mt-4 rounded-[24px] border border-[color:color-mix(in_srgb,var(--admin-accent)_18%,var(--admin-line))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--admin-accent)_14%,transparent),transparent_34%),linear-gradient(135deg,color-mix(in_srgb,var(--admin-muted-surface)_94%,var(--admin-surface)),var(--admin-surface))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-black tracking-[0.16em] text-moss/75">模式优先</p>
                  <Badge tone={modeDraft.mode === "TECHNICIAN_SELF_FINAL" ? "green" : "blue"}>{getStoreScheduleModeLabel(modeDraft.mode)}</Badge>
                  {upcomingModeConfig ? <Badge tone="yellow">下次切换 {upcomingModeConfig.effectiveFrom.slice(0, 10)}</Badge> : null}
                </div>
                <TitleWithInfo
                  as="h3"
                  className="mt-2"
                  info="先决定这家店使用商户确认、技师自主，还是商户直接排班。技师端文案、主按钮和最终可预约时间来源都会随之变化。"
                  label="排班模式前置设置说明"
                  title="排班模式前置设置"
                  titleClassName="text-xl font-black"
                  variant="paper"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-3 xl:w-[640px]">
                {([
                  {
                    value: "TECHNICIAN_SELF_FINAL" as const,
                    title: "技师自主排班",
                    caption: "技师发布后直接进入最终可预约时间，店铺主要做规则、黑屏和冲突治理。"
                  },
                  {
                    value: "STORE_CONFIRM_REQUIRED" as const,
                    title: "商户确认模式",
                    caption: "商户先开放时段，技师提交反馈，最后由商户确认后才对用户可见。"
                  },
                  {
                    value: "STORE_DIRECT_ASSIGN" as const,
                    title: "商户直接排班",
                    caption: "商户直接安排正式班表，保存即生成 confirmed slots，技师只确认收到或申请更改。"
                  }
                ] as const).map((item) => (
                  <button
                    className={cn(
                      "rounded-[18px] border px-4 py-3 text-left transition",
                      modeDraft.mode === item.value
                        ? "border-[color:color-mix(in_srgb,var(--admin-accent)_48%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--admin-accent)_92%,#ffffff),var(--admin-accent-strong))] text-white shadow-[0_20px_38px_color-mix(in_srgb,var(--admin-accent)_24%,transparent)]"
                        : "border-line bg-[color:color-mix(in_srgb,var(--admin-surface)_94%,white)] text-ink/70 hover:border-[color:color-mix(in_srgb,var(--admin-accent)_30%,var(--admin-line))] hover:bg-[color:color-mix(in_srgb,var(--admin-accent)_6%,var(--admin-surface))]"
                    )}
                    key={item.value}
                    onClick={() => setModeDraft((current) => current ? { ...current, mode: item.value } : current)}
                    type="button"
                  >
                    <strong className="block text-sm font-black">{item.title}</strong>
                    <span className={cn("mt-1 block text-xs leading-5", modeDraft.mode === item.value ? "text-white/78" : "text-inherit")}>{item.caption}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-black text-ink/50">
                生效日期
                <input
                  className="mt-1 h-10 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none"
                  min="2026-04-20"
                  onChange={(event) => setModeDraft((current) => current ? { ...current, effectiveFrom: event.target.value || current.effectiveFrom } : current)}
                  type="date"
                  value={modeDraft.effectiveFrom}
                />
              </label>
              <label className="text-xs font-black text-ink/50 md:col-span-2">
                切换原因
                <input
                  className="mt-1 h-10 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none"
                  onChange={(event) => setModeDraft((current) => current ? { ...current, reason: event.target.value } : current)}
                  placeholder="例如：旺季临时收口，改由店铺统一确认"
                  type="text"
                  value={modeDraft.reason}
                />
              </label>
              <div className="rounded-2xl border border-line bg-white px-4 py-3">
                <p className="text-xs font-black text-ink/50">当前生效模式</p>
                <strong className="mt-1 block text-sm">{getStoreScheduleModeLabel(currentMode)}</strong>
                <p className="mt-1 text-xs text-ink/45">{activeModeConfig?.effectiveFrom.slice(0, 10) ?? "未设置"}</p>
              </div>
            </div>

            {modeDraft.mode === "TECHNICIAN_SELF_FINAL" ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink/70">
                  <input
                    checked={modeDraft.selfModeRules.businessHoursRequired}
                    onChange={(event) =>
                      setModeDraft((current) =>
                        current ? { ...current, selfModeRules: { ...current.selfModeRules, businessHoursRequired: event.target.checked } } : current
                      )
                    }
                    type="checkbox"
                  />
                  约束店铺营业时间
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink/70">
                  <input
                    checked={modeDraft.selfModeRules.resourceValidationRequired}
                    onChange={(event) =>
                      setModeDraft((current) =>
                        current ? { ...current, selfModeRules: { ...current.selfModeRules, resourceValidationRequired: event.target.checked } } : current
                      )
                    }
                    type="checkbox"
                  />
                  校验包房 / 资源容量
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink/70">
                  <input
                    checked={modeDraft.selfModeRules.allowStoreBlackout}
                    onChange={(event) =>
                      setModeDraft((current) =>
                        current ? { ...current, selfModeRules: { ...current.selfModeRules, allowStoreBlackout: event.target.checked } } : current
                      )
                    }
                    type="checkbox"
                  />
                  允许店铺黑屏 / 暂停时段
                </label>
                <label className="text-xs font-black text-ink/50">
                  开始前冻结修改（分钟）
                  <input
                    className="mt-1 h-10 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none"
                    min={0}
                    onChange={(event) =>
                      setModeDraft((current) =>
                        current
                          ? { ...current, selfModeRules: { ...current.selfModeRules, freezeBeforeStartMinutes: Number(event.target.value) || 0 } }
                          : current
                      )
                    }
                    type="number"
                    value={modeDraft.selfModeRules.freezeBeforeStartMinutes}
                  />
                </label>
              </div>
            ) : modeDraft.mode === "STORE_DIRECT_ASSIGN" ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-line bg-white px-4 py-3">
                  <p className="text-xs font-black text-ink/50">生效规则</p>
                  <strong className="mt-1 block text-sm">保存即正式排班</strong>
                  <p className="mt-1 text-xs text-ink/45">不强制收集技师反馈，技师端只读查看、确认收到或申请更改。</p>
                </div>
                <div className="rounded-2xl border border-line bg-white px-4 py-3">
                  <p className="text-xs font-black text-ink/50">用户端来源</p>
                  <strong className="mt-1 block text-sm">已确认班次</strong>
                  <p className="mt-1 text-xs text-ink/45">商户保存后的正式班表才会进入用户端可预约容量。</p>
                </div>
                <div className="rounded-2xl border border-line bg-white px-4 py-3 md:col-span-2">
                  <p className="text-xs font-black text-ink/50">当前影响预览</p>
                  <strong className="mt-1 block text-sm">{modeImpactPreview ? `${modeImpactPreview.affectedTechnicianCount} 名技师进入只读接收流程` : "-"}</strong>
                  <p className="mt-1 text-xs text-ink/45">已预约订单优先；请假、加班、时间调整通过申请进入商户处理。</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-black text-ink/50">
                  申请截止日
                  <input
                    className="mt-1 h-10 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none"
                    onChange={(event) =>
                      setModeDraft((current) =>
                        current
                          ? {
                              ...current,
                              confirmModeRules: {
                                ...current.confirmModeRules,
                                feedbackDeadlineAt: event.target.value ? `${event.target.value}T12:00:00.000Z` : null
                              }
                            }
                          : current
                      )
                    }
                    type="date"
                    value={modeDraft.confirmModeRules.feedbackDeadlineAt?.slice(0, 10) ?? ""}
                  />
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink/70">
                  <input
                    checked={modeDraft.confirmModeRules.autoLockAfterDeadline}
                    onChange={(event) =>
                      setModeDraft((current) =>
                        current
                          ? { ...current, confirmModeRules: { ...current.confirmModeRules, autoLockAfterDeadline: event.target.checked } }
                          : current
                      )
                    }
                    type="checkbox"
                  />
                  截止后自动锁定
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink/70">
                  <input
                    checked={modeDraft.confirmModeRules.autoConfirmEnabled}
                    onChange={(event) =>
                      setModeDraft((current) =>
                        current
                          ? { ...current, confirmModeRules: { ...current.confirmModeRules, autoConfirmEnabled: event.target.checked } }
                          : current
                      )
                    }
                    type="checkbox"
                  />
                  启用一键确认
                </label>
                <div className="rounded-2xl border border-line bg-white px-4 py-3">
                  <p className="text-xs font-black text-ink/50">当前影响预览</p>
                  <strong className="mt-1 block text-sm">{modeImpactPreview ? `${modeImpactPreview.pendingApplicationCount} 条待处理申请` : "-"}</strong>
                  <p className="mt-1 text-xs text-ink/45">切换前会保留已预约订单，未确认时段按新模式重新投影。</p>
                </div>
              </div>
            )}

            {modeImpactPreview ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {([
                  ["影响技师", `${modeImpactPreview.affectedTechnicianCount} 人`, "neutral" as const],
                  ["待确认申请", `${modeImpactPreview.pendingApplicationCount} 条`, "yellow" as const],
                  ["已发布自排", `${modeImpactPreview.publishedSelfSlotCount} 格`, "green" as const],
                  ["未来订单 / 冲突", `${modeImpactPreview.futureBookingCount} / ${modeImpactPreview.conflictSlotCount}`, "red" as const]
                ] as Array<[string, string, BadgeTone]>).map(([label, value, tone]) => (
                  <article className="rounded-2xl border border-line bg-white p-4" key={label}>
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/45">{label}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <strong className="text-lg font-black">{value}</strong>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {topSummaryCards.map(([label, value, tone]) => (
            <article className="rounded-2xl border border-line bg-paper p-4" key={label}>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/45">{label}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <strong className="text-2xl font-black">{value}</strong>
                <Badge tone={tone}>{label}</Badge>
              </div>
            </article>
          ))}
        </div>
      </section>

      {showAutomationOverview ? (
        <section className="grid gap-5 xl:grid-cols-[1.05fr,0.95fr]">
          <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.16em] text-moss/75">自动化总览</p>
                <TitleWithInfo
                  as="h3"
                  className="mt-1"
                  info="把模板、规则、优先级、通知和自动确认拆成独立页面，避免继续堆在同一个超长页面里。"
                  label="自动化排班设定入口说明"
                  title="自动化排班设定入口"
                  titleClassName="text-xl font-black"
                  variant="paper"
                />
              </div>
              <Badge tone="green">配置 / 规则</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ["模板设定", "/merchant-admin/dispatch-center/schedule?mode=auto", "在排班 > 自动中配置日 / 周 / 月模板、导入历史模板和生效周期。"],
                ["排班规则", "/merchant-admin/dispatch-center/schedule?mode=auto", "在排班 > 自动中配置工时上限、休息日、缓冲和默认容量边界。"],
                ["特殊规则", "/merchant-admin/dispatch-center/schedule?mode=auto", "在排班 > 自动中配置节假日、星期维度、特殊容量和临时技师策略。"],
                ["优先规则", "/merchant-admin/dispatch-center/schedule?mode=auto", "在排班 > 自动中配置分组、分类、标签等优先级栈。"],
                ["通知规则", "/merchant-admin/dispatch-center/schedule?mode=auto", "在排班 > 自动中配置超额、低预约、优惠推送和排班联动通知。"],
                ["自动确认设定", "/merchant-admin/dispatch-center/schedule?mode=auto", "在排班 > 自动中管理反馈进度、逐小时确认和批量确认入口。"]
              ].map(([label, to, caption]) => (
                <div className="rounded-2xl border border-line bg-paper p-4" key={label}>
                  <strong className="text-base font-black">{label}</strong>
                  <p className="mt-2 text-sm leading-6 text-ink/58">{caption}</p>
                  <div className="mt-4">
                    <Button size="sm" to={to} variant="secondary">进入</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
              <p className="text-xs font-black tracking-[0.16em] text-moss/75">当前策略</p>
              <h3 className="mt-1 text-xl font-black">{isSelfManagedMode ? "当前自排治理摘要" : "当前自动化摘要"}</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["当前模式", getStoreScheduleModeLabel(currentMode)],
                  ["模板类型", draft.templateType],
                  [isSelfManagedMode ? "冻结修改" : "反馈截止", isSelfManagedMode ? `${modeDraft?.selfModeRules.freezeBeforeStartMinutes ?? 0} 分钟` : draft.feedbackDeadlineAt ? draft.feedbackDeadlineAt.slice(0, 10) : "未设定"],
                  ["默认容量", draft.defaultCapacityPerHour != null ? `${draft.defaultCapacityPerHour} / 小时` : "未设定"],
                  [isSelfManagedMode ? "资源校验" : "默认最大确认", isSelfManagedMode ? (modeDraft?.selfModeRules.resourceValidationRequired ? "已启用" : "未启用") : draft.defaultMaxConfirmPerHour != null ? `${draft.defaultMaxConfirmPerHour} / 小时` : "未设定"],
                  ["适用技师", `${draft.appliesToTechnicians.length} 人`]
                ].map(([label, value]) => (
                  <div className="rounded-2xl bg-paper px-4 py-3" key={label}>
                    <p className="text-xs font-bold text-ink/45">{label}</p>
                    <strong className="mt-1 block text-sm">{value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
              <p className="text-xs font-black tracking-[0.16em] text-moss/75">执行状态</p>
              <h3 className="mt-1 text-xl font-black">{isSelfManagedMode ? "发布与覆盖状态" : "执行状态"}</h3>
              <div className="mt-4 space-y-2">
                {[
                  [isSelfManagedMode ? "允许自排时段" : "已开放时段", `${summary.openHourCount} 格`],
                  [isSelfManagedMode ? "已发布技师" : "已反馈技师", `${isSelfManagedMode ? techniciansWithPublishedSlots.size : policyResponses.length} / ${activePolicy.appliesToTechnicians.length}`],
                  [isSelfManagedMode ? "最终可约" : "已确认班次", `${isSelfManagedMode ? scopedFinalSlots.filter((slot) => slot.status === "available").length : summary.confirmedCount} 格`],
                  [isSelfManagedMode ? "冲突时段" : "候补班次", `${isSelfManagedMode ? scopedFinalSlots.filter((slot) => slot.status === "conflict").length : summary.waitlistedCount} 格`],
                  [isSelfManagedMode ? "店铺黑屏" : "缺人提示", `${isSelfManagedMode ? scopedFinalSlots.filter((slot) => slot.status === "blocked_by_store").length : summary.shortageCount} ${isSelfManagedMode ? "格" : "处"}`]
                ].map(([label, value]) => (
                  <div className="flex items-center justify-between rounded-2xl bg-paper px-4 py-3" key={label}>
                    <span className="text-sm font-semibold text-ink/60">{label}</span>
                    <strong className="text-sm font-black">{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </section>
      ) : null}

      {showTemplateSettings ? (
        <section className="grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
          <section className="space-y-5">
            <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black tracking-[0.16em] text-moss/75">周期设定</p>
                  <h3 className="mt-1 text-xl font-black">{isSelfManagedMode ? "营业时段与允许自排模板" : "模板设定与导入历史"}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{draft.templateType}</Badge>
                  {!isSelfManagedMode && draft.feedbackDeadlineAt ? <Badge tone="yellow">截止 {draft.feedbackDeadlineAt.slice(5, 16).replace("T", " ")}</Badge> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <label className="text-xs font-black text-ink/50">
                  模板类型
                  <select
                    className="mt-1 h-11 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                    disabled={!canEditAutomation}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              templateType: event.target.value as typeof current.templateType,
                              slotMatrix:
                                current.templateType === event.target.value
                                  ? current.slotMatrix
                                  : adaptSlotMatrix(current.slotMatrix, current.templateType, event.target.value as typeof current.templateType)
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
                <label className="text-xs font-black text-ink/50">
                  起始日期
                  <input
                    className="mt-1 h-11 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                    disabled={!canEditAutomation}
                    onChange={(event) => setDraft((current) => current ? { ...current, startDate: event.target.value || current.startDate } : current)}
                    type="date"
                    value={draft.startDate}
                  />
                </label>
                <label className="text-xs font-black text-ink/50">
                  终止日期
                  <input
                    className="mt-1 h-11 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                    disabled={!canEditAutomation}
                    onChange={(event) => setDraft((current) => current ? { ...current, endDate: event.target.value || current.endDate } : current)}
                    type="date"
                    value={draft.endDate}
                  />
                </label>
                {isSelfManagedMode ? (
                  <div className="rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-semibold text-ink/70">
                    <p className="text-xs font-black text-ink/50">模式说明</p>
                    <p className="mt-2 leading-6">该模板在自排模式下代表店铺允许技师发布的营业 / 可服务时间，而不是待申请开放窗口。</p>
                  </div>
                ) : (
                  <label className="text-xs font-black text-ink/50">
                    反馈截止
                    <input
                      className="mt-1 h-11 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                      disabled={!canEditAutomation}
                      onChange={(event) => setDraft((current) => current ? { ...current, feedbackDeadlineAt: event.target.value ? `${event.target.value}T12:00:00.000Z` : null } : current)}
                      type="date"
                      value={draft.feedbackDeadlineAt?.slice(0, 10) ?? ""}
                    />
                  </label>
                )}
                <label className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-semibold text-ink/70">
                  <input
                    checked={draft.repeatEnabled}
                    disabled={!canEditAutomation}
                    onChange={(event) => setDraft((current) => current ? { ...current, repeatEnabled: event.target.checked } : current)}
                    type="checkbox"
                  />
                  启用循环模板
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr,280px]">
                <div className="rounded-2xl border border-line bg-paper p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">导入历史模板</p>
                      <p className="mt-1 text-xs leading-5 text-ink/55">可导入上一日 / 周 / 月的模板；没有历史数据时会保持当前模板不变。</p>
                    </div>
                    <Badge tone={importOptions.length > 0 ? "green" : "neutral"}>
                      {importOptions.length > 0 ? `${importOptions.length} 个来源` : "暂无历史模板"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 md:flex-row">
                    <select
                      className="h-10 flex-1 rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={importOptions.length === 0 || !canEditAutomation}
                      onChange={(event) =>
                        setDraft((current) =>
                          current ? { ...current, importSource: event.target.value ? (event.target.value as typeof current.importSource) : null } : current
                        )
                      }
                      value={draft.importSource ?? ""}
                    >
                      <option value="">不导入历史</option>
                      {importOptions.map((option) => (
                        <option key={option.source} value={option.source}>{option.label}</option>
                      ))}
                    </select>
                    <Button
                      disabled={!selectedImportOption || !canEditAutomation}
                      onClick={() => {
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

                        setDraft((current) => current ? { ...current, slotMatrix: importedMatrix } : current);
                        setMessage(`已导入历史模板：${selectedImportOption.label}。`);
                      }}
                      size="sm"
                    >
                      导入
                    </Button>
                  </div>
                  {selectedImportOption ? (
                    <p className="mt-2 text-xs leading-5 text-ink/55">
                      当前选择：{getTemplateImportSourceLabel(selectedImportOption.source)}，最近更新时间 {selectedImportOption.updatedAt.slice(5, 16).replace("T", " ")}。
                    </p>
                  ) : (
                    <p className="mt-2 text-xs leading-5 text-ink/45">暂无可导入历史数据时，系统会保持当前编辑矩阵不变。</p>
                  )}
                </div>

                <div className="rounded-2xl border border-line bg-paper p-3">
                  <p className="text-sm font-black">适用技师</p>
                  <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
                    {storeTechnicians.map((technician) => {
                      const active = draft.appliesToTechnicians.includes(technician.id);

                      return (
                        <label className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ink/70" key={technician.id}>
                          <input
                            checked={active}
                            disabled={!canEditAutomation}
                            onChange={() =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      appliesToTechnicians: active
                                        ? current.appliesToTechnicians.filter((item) => item !== technician.id)
                                        : [...current.appliesToTechnicians, technician.id]
                                    }
                                  : current
                              )
                            }
                            type="checkbox"
                          />
                          <span className="flex-1">{technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}</span>
                          <Badge tone={active ? "green" : "neutral"}>{active ? "纳入" : "跳过"}</Badge>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <ShiftMatrixEditor
              accent="store"
              activeLabel={isSelfManagedMode ? "允许技师发布" : "可开放排班"}
              caption={
                isSelfManagedMode
                  ? "这里定义店铺允许技师发布上班时间的时段边界；技师发布时间仍会继续经过黑屏、容量和冲突校验。"
                  : "模板编辑器支持点击、拖拽、复制、填充和快捷套用，结果会映射为真实可开放时段。"
              }
              disabledLabel={isSelfManagedMode ? "灰色 = 店铺关闭 / 黑屏" : "灰色 = 未开放"}
              inactiveLabel={isSelfManagedMode ? "不可发布" : "关闭"}
              matrix={draft.slotMatrix}
              onChange={(nextMatrix) => setDraft((current) => current ? { ...current, slotMatrix: nextMatrix } : current)}
              startDate={draft.startDate}
              templateType={draft.templateType}
              title={isSelfManagedMode ? "店铺允许自排时段" : "店铺模板"}
            />
          </section>

          <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
            <p className="text-xs font-black tracking-[0.16em] text-moss/75">模板快照</p>
            <h3 className="mt-1 text-xl font-black">当前模板摘要</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["模板类型", draft.templateType],
                ["周期", `${draft.startDate} ~ ${draft.endDate}`],
                ["循环", draft.repeatEnabled ? "已启用" : "未启用"],
                ["历史导入", selectedImportOption?.label ?? "无"],
                ["纳入技师", `${draft.appliesToTechnicians.length} 人`],
                ["反馈截止", draft.feedbackDeadlineAt?.slice(0, 10) ?? "未设定"]
              ].map(([label, value]) => (
                <div className="rounded-2xl bg-paper px-4 py-3" key={label}>
                  <p className="text-xs font-bold text-ink/45">{label}</p>
                  <strong className="mt-1 block text-sm">{value}</strong>
                </div>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {showRuleSettings ? (
        <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.16em] text-moss/75">规则设定</p>
              <h3 className="mt-1 text-xl font-black">排班规则</h3>
            </div>
            <Badge tone="neutral">工时 / 休息 / 缓冲 / 容量</Badge>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-black text-ink/50">
              默认目标人数 / 小时
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                min={0}
                onChange={(event) => setDraft((current) => current ? { ...current, defaultCapacityPerHour: Number(event.target.value) || null } : current)}
                type="number"
                value={draft.defaultCapacityPerHour ?? ""}
              />
            </label>
            <label className="text-xs font-black text-ink/50">
              默认最大确认人数 / 小时
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                min={0}
                onChange={(event) => setDraft((current) => current ? { ...current, defaultMaxConfirmPerHour: Number(event.target.value) || null } : current)}
                type="number"
                value={draft.defaultMaxConfirmPerHour ?? ""}
              />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-semibold text-ink/70">
              <input
                checked={draft.unlimitedMaxHours}
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, unlimitedMaxHours: event.target.checked } : current)}
                type="checkbox"
              />
              最大工时无限制
            </label>
            <label className="text-xs font-black text-ink/50">
              日最大工时
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={draft.unlimitedMaxHours || !canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, dailyMaxHours: Number(event.target.value) || null } : current)}
                type="number"
                value={draft.dailyMaxHours ?? ""}
              />
            </label>
            <label className="text-xs font-black text-ink/50">
              周最大工时
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={draft.unlimitedMaxHours || !canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, weeklyMaxHours: Number(event.target.value) || null } : current)}
                type="number"
                value={draft.weeklyMaxHours ?? ""}
              />
            </label>
            <label className="text-xs font-black text-ink/50">
              月最大工时
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={draft.unlimitedMaxHours || !canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, monthlyMaxHours: Number(event.target.value) || null } : current)}
                type="number"
                value={draft.monthlyMaxHours ?? ""}
              />
            </label>
            <label className="text-xs font-black text-ink/50">
              周最少休息日
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, minRestDaysWeek: Number(event.target.value) || null } : current)}
                type="number"
                value={draft.minRestDaysWeek ?? ""}
              />
            </label>
            <label className="text-xs font-black text-ink/50">
              周最多休息日
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, maxRestDaysWeek: Number(event.target.value) || null } : current)}
                type="number"
                value={draft.maxRestDaysWeek ?? ""}
              />
            </label>
            <label className="text-xs font-black text-ink/50">
              月最少休息日
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, minRestDaysMonth: Number(event.target.value) || null } : current)}
                type="number"
                value={draft.minRestDaysMonth ?? ""}
              />
            </label>
            <label className="text-xs font-black text-ink/50">
              月最多休息日
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, maxRestDaysMonth: Number(event.target.value) || null } : current)}
                type="number"
                value={draft.maxRestDaysMonth ?? ""}
              />
            </label>
            <label className="text-xs font-black text-ink/50">
              服务前缓冲（分钟）
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, preServiceBufferMinutes: Number(event.target.value) || 0 } : current)}
                type="number"
                value={draft.preServiceBufferMinutes}
              />
            </label>
            <label className="text-xs font-black text-ink/50">
              服务后缓冲（分钟）
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, postServiceBufferMinutes: Number(event.target.value) || 0 } : current)}
                type="number"
                value={draft.postServiceBufferMinutes}
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-paper p-3">
            <p className="text-sm font-black">继承规则</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["hourLimits", "技师端继承工时上限"],
                ["restDays", "技师端继承休息规则"],
                ["buffers", "技师端继承缓冲规则"]
              ] as const).map(([key, label]) => {
                const active = draft.forceInheritedRules.includes(key);

                return (
                  <button
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-black transition",
                      active ? "bg-moss text-white" : "bg-white text-ink/60"
                    )}
                    disabled={!canEditAutomation}
                    key={key}
                    onClick={() =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              forceInheritedRules: active
                                ? current.forceInheritedRules.filter((item) => item !== key)
                                : [...current.forceInheritedRules, key]
                            }
                          : current
                      )
                    }
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {showSpecialRules ? (
        <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.16em] text-moss/75">特殊规则</p>
              <h3 className="mt-1 text-xl font-black">特殊规则</h3>
            </div>
            <Badge tone="yellow">节假日 / 星期 / 特殊容量</Badge>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-black text-ink/50">
              节假日需求增减 %
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, holidayDemandPercent: Number(event.target.value) || 0 } : current)}
                type="number"
                value={draft.holidayDemandPercent}
              />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-semibold text-ink/70">
              <input
                checked={draft.tempTechnicianEnabled}
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, tempTechnicianEnabled: event.target.checked } : current)}
                type="checkbox"
              />
              启用临时技师招募
            </label>
            <label className="text-xs font-black text-ink/50 md:col-span-2 xl:col-span-2">
              临时技师规则说明
              <input
                className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                disabled={!canEditAutomation}
                onChange={(event) => setDraft((current) => current ? { ...current, tempTechnicianConfig: event.target.value } : current)}
                placeholder="例如：超额 2 格以上时向兼职池发起招募"
                type="text"
                value={draft.tempTechnicianConfig}
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-paper p-3">
            <p className="text-sm font-black">星期维度需求增减 %</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {weekdayDemandRows.map((item) => (
                <label className="text-xs font-black text-ink/50" key={item.weekday}>
                  {item.label}
                  <input
                    className="mt-1 h-10 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none"
                    disabled={!canEditAutomation}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              weekdayDemandPercents: {
                                ...current.weekdayDemandPercents,
                                [item.weekday]: Number(event.target.value) || 0
                              }
                            }
                          : current
                      )
                    }
                    type="number"
                    value={draft.weekdayDemandPercents[item.weekday] ?? 0}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-paper p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black">特殊容量规则</p>
              <Badge tone="neutral">目标人数 / 最大确认人数</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {defaultSpecialCapacityRows.map((seed, index) => {
                const currentRule = draft.capacityRules[index];

                return (
                  <div className="grid grid-cols-[1fr,120px,120px] gap-2" key={`${seed.scopeType}-${seed.scopeValue}`}>
                    <div className="flex items-center rounded-full border border-line bg-white px-4 text-sm font-black text-ink/70">
                      {seed.label}
                    </div>
                    <input
                      className="h-10 rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none"
                      disabled={!canEditAutomation}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                capacityRules: current.capacityRules.map((rule, ruleIndex) =>
                                  ruleIndex === index ? { ...rule, targetCount: Number(event.target.value) || null } : rule
                                )
                              }
                            : current
                        )
                      }
                      placeholder="目标"
                      type="number"
                      value={currentRule?.targetCount ?? ""}
                    />
                    <input
                      className="h-10 rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none"
                      disabled={!canEditAutomation}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                capacityRules: current.capacityRules.map((rule, ruleIndex) =>
                                  ruleIndex === index ? { ...rule, maxConfirmCount: Number(event.target.value) || null } : rule
                                )
                              }
                            : current
                        )
                      }
                      placeholder="最大"
                      type="number"
                      value={currentRule?.maxConfirmCount ?? ""}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {showPriorityRules ? (
        <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.16em] text-moss/75">优先级栈</p>
              <h3 className="mt-1 text-xl font-black">优先规则</h3>
            </div>
            <Badge tone="neutral">可上下调整顺序</Badge>
          </div>

          <div className="mt-4 space-y-2">
            {draft.priorityRules.map((rule, index) => (
              <div className="grid grid-cols-[1fr,auto,auto,auto] items-center gap-2 rounded-2xl border border-line bg-paper p-3" key={rule.id}>
                <label className="flex items-center gap-3 text-sm font-semibold text-ink/70">
                  <input
                    checked={rule.enabled}
                    disabled={!canEditAutomation}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              priorityRules: current.priorityRules.map((item) => item.id === rule.id ? { ...item, enabled: event.target.checked } : item)
                            }
                          : current
                      )
                    }
                    type="checkbox"
                  />
                  <span>{rule.label}</span>
                </label>
                <Button
                  disabled={index === 0 || !canEditAutomation}
                  onClick={() =>
                    setDraft((current) => {
                      if (!current || index === 0) {
                        return current;
                      }

                      const nextRules = [...current.priorityRules];
                      [nextRules[index - 1], nextRules[index]] = [nextRules[index], nextRules[index - 1]];
                      return { ...current, priorityRules: nextRules.map((item, order) => ({ ...item, weight: order + 1 })) };
                    })
                  }
                  size="sm"
                  variant="secondary"
                >
                  上移
                </Button>
                <Button
                  disabled={index === draft.priorityRules.length - 1 || !canEditAutomation}
                  onClick={() =>
                    setDraft((current) => {
                      if (!current || index === current.priorityRules.length - 1) {
                        return current;
                      }

                      const nextRules = [...current.priorityRules];
                      [nextRules[index + 1], nextRules[index]] = [nextRules[index], nextRules[index + 1]];
                      return { ...current, priorityRules: nextRules.map((item, order) => ({ ...item, weight: order + 1 })) };
                    })
                  }
                  size="sm"
                  variant="secondary"
                >
                  下移
                </Button>
                <Badge tone={rule.enabled ? "green" : "neutral"}>{index + 1}</Badge>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showNotificationRules ? (
        <section className="space-y-5">
          <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.16em] text-moss/75">通知规则</p>
                <h3 className="mt-1 text-xl font-black">通知规则</h3>
              </div>
              <Badge tone="neutral">通知 / 应急 / 优惠</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 text-sm font-semibold text-ink/70">
                <input
                  checked={draft.overbookingNotifyEnabled}
                  disabled={!canEditAutomation}
                  onChange={(event) => setDraft((current) => current ? { ...current, overbookingNotifyEnabled: event.target.checked } : current)}
                  type="checkbox"
                />
                超额报名通知技师
              </label>
              <label className="text-xs font-black text-ink/50">
                超额通知阈值
                <input
                  className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                  disabled={!canEditAutomation}
                  onChange={(event) => setDraft((current) => current ? { ...current, overbookingThreshold: Number(event.target.value) || 0 } : current)}
                  type="number"
                  value={draft.overbookingThreshold}
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 text-sm font-semibold text-ink/70">
                <input
                  checked={draft.lowBookingRestNotifyEnabled}
                  disabled={!canEditAutomation}
                  onChange={(event) => setDraft((current) => current ? { ...current, lowBookingRestNotifyEnabled: event.target.checked } : current)}
                  type="checkbox"
                />
                预约不足时建议休息
              </label>
              <label className="text-xs font-black text-ink/50">
                低预约阈值
                <input
                  className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                  disabled={!canEditAutomation}
                  onChange={(event) => setDraft((current) => current ? { ...current, lowBookingThreshold: Number(event.target.value) || 0 } : current)}
                  type="number"
                  value={draft.lowBookingThreshold}
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 text-sm font-semibold text-ink/70">
                <input
                  checked={draft.discountPushEnabled}
                  disabled={!canEditAutomation}
                  onChange={(event) => setDraft((current) => current ? { ...current, discountPushEnabled: event.target.checked } : current)}
                  type="checkbox"
                />
                低预约发送优惠情报
              </label>
              <label className="text-xs font-black text-ink/50 md:col-span-2 xl:col-span-3">
                优惠通知模板
                <input
                  className="mt-1 h-10 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                  disabled={!canEditAutomation}
                  onChange={(event) => setDraft((current) => current ? { ...current, discountTemplate: event.target.value } : current)}
                  placeholder="例如：今晚 20:00 后预约可享 9 折"
                  type="text"
                  value={draft.discountTemplate}
                />
              </label>
            </div>
          </section>

          <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.16em] text-moss/75">通知记录</p>
                <h3 className="mt-1 text-xl font-black">排班联动通知</h3>
              </div>
              <Badge tone="neutral">{scopedNotifications.length} 条</Badge>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {scopedNotifications.slice(0, 8).map((notification) => (
                <article className="rounded-2xl border border-line bg-paper p-3" key={notification.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm font-black">{notification.notificationType}</strong>
                    <Badge tone={notification.status === "read" ? "neutral" : "yellow"}>{notification.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-ink/60">{notification.payload}</p>
                  <p className="mt-2 text-xs text-ink/45">{notification.scheduledAt.slice(5, 16).replace("T", " ")}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {showAutoConfirm ? (
        <section className="grid gap-5 xl:grid-cols-[0.95fr,1.05fr]">
          <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.16em] text-moss/75">反馈进度</p>
                <h3 className="mt-1 text-xl font-black">技师反馈进度</h3>
              </div>
              <Badge tone="yellow">{policyResponses.length} / {activePolicy.appliesToTechnicians.length}</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {policyResponses.map((response) => {
                const technician = storeTechnicians.find((item) => item.id === response.technicianId);
                const responseTemplate = responseTemplateMap.get(response.templateId) ?? null;
                const slotCounts = getOpenSlotCountsForResponse(activePolicy, storeTemplate, response, responseTemplate, shiftPlanning.slotOverrides);
                const confirmedCount = confirmedShifts.filter((shift) => shift.technicianId === response.technicianId && shift.shiftStatus === "confirmed").length;
                const waitlistedCount = confirmedShifts.filter((shift) => shift.technicianId === response.technicianId && shift.shiftStatus === "waitlisted").length;

                return (
                  <article className="rounded-2xl border border-line bg-paper p-3" key={response.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <strong className="text-base font-black">{technician?.nickname ? `${technician.nickname} / ${technician.name}` : technician?.name ?? response.technicianId}</strong>
                        <p className="mt-1 text-xs text-ink/50">
                          模板 {responseTemplate?.templateType ?? "-"} · 版本 v{response.version} · 最近更新 {response.updatedAt.slice(5, 16).replace("T", " ")}
                        </p>
                      </div>
                      <Badge tone={response.responseStatus === "updated" ? "yellow" : "green"}>{getResponseStatusLabel(response.responseStatus)}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-white px-3 py-2">
                        <p className="text-[11px] font-black text-ink/45">可接时段</p>
                        <strong className="mt-1 block text-sm">{slotCounts.availableCount}</strong>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        <p className="text-[11px] font-black text-ink/45">已确认</p>
                        <strong className="mt-1 block text-sm">{confirmedCount}</strong>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        <p className="text-[11px] font-black text-ink/45">候补</p>
                        <strong className="mt-1 block text-sm">{waitlistedCount}</strong>
                      </div>
                    </div>
                  </article>
                );
              })}

              {pendingTechnicians.length > 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-paper p-3">
                  <p className="text-sm font-black">待反馈</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pendingTechnicians.map((technician) => (
                      <Badge key={technician.id} tone="neutral">{technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black tracking-[0.16em] text-moss/75">确认面板</p>
                <h3 className="mt-1 text-xl font-black">逐小时确认面板</h3>
              </div>
              <input
                className="h-10 rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none"
                max={activePolicy.endDate}
                min={activePolicy.startDate}
                onChange={(event) => setSelectedDate(event.target.value || activePolicy.startDate)}
                type="date"
                value={selectedDate}
              />
            </div>

            <div className="mt-4 space-y-3">
              {hourDetails.filter((detail) => detail.slotStatus !== "closed").map((detail) => {
                const shortage = detail.targetCount != null ? Math.max(0, detail.targetCount - detail.confirmedTechnicianIds.length) : 0;
                const overflow = detail.maxConfirmCount != null ? Math.max(0, detail.availableTechnicianIds.length - detail.maxConfirmCount) : 0;

                return (
                  <article className="rounded-2xl border border-line bg-paper p-3" key={`${selectedDate}-${detail.hour}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong className="text-base font-black">{formatHourLabel(detail.hour)}</strong>
                        <p className="mt-1 text-xs text-ink/50">
                          目标 {detail.targetCount ?? "无限制"} · 最大确认 {detail.maxConfirmCount ?? "无限制"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {shortage > 0 ? <Badge tone="red">缺 {shortage}</Badge> : null}
                        {overflow > 0 ? <Badge tone="yellow">超额 {overflow}</Badge> : null}
                        <Badge tone={detail.slotStatus === "locked" ? "red" : "green"}>
                          {detail.slotStatus === "locked" ? "已锁定" : "开放中"}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2">
                      {detail.availableTechnicianIds.length > 0 ? detail.availableTechnicianIds.map((technicianId) => {
                        const technician = storeTechnicians.find((item) => item.id === technicianId);
                        const confirmed = detail.confirmedTechnicianIds.includes(technicianId);
                        const waitlisted = detail.waitlistedTechnicianIds.includes(technicianId);

                        return (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2" key={`${detail.hour}-${technicianId}`}>
                            <div className="flex items-center gap-2">
                              <strong className="text-sm font-black">{technician?.nickname ? `${technician.nickname} / ${technician.name}` : technician?.name ?? technicianId}</strong>
                              {confirmed ? <Badge tone="blue">{getConfirmedShiftStatusLabel("confirmed")}</Badge> : null}
                              {waitlisted ? <Badge tone="yellow">{getConfirmedShiftStatusLabel("waitlisted")}</Badge> : null}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                disabled={!canRunBatchConfirm}
                                onClick={() => {
                                  manuallyAssignShift({
                                    policyId: activePolicy.id,
                                    technicianId,
                                    date: selectedDate,
                                    hour: detail.hour,
                                    operatorId: mode === "admin" ? "admin" : selectedStoreId,
                                    shiftStatus: "confirmed"
                                  });
                                  setMessage(`已手动确认 ${technician?.name ?? technicianId} 在 ${selectedDate} ${String(detail.hour).padStart(2, "0")}:00 的班次。`);
                                }}
                                size="sm"
                                variant={confirmed ? "secondary" : "primary"}
                              >
                                单独确认
                              </Button>
                              <Button
                                disabled={!canRunBatchConfirm}
                                onClick={() => {
                                  manuallyAssignShift({
                                    policyId: activePolicy.id,
                                    technicianId,
                                    date: selectedDate,
                                    hour: detail.hour,
                                    operatorId: mode === "admin" ? "admin" : selectedStoreId,
                                    shiftStatus: "waitlisted"
                                  });
                                  setMessage(`已将 ${technician?.name ?? technicianId} 加入 ${selectedDate} ${String(detail.hour).padStart(2, "0")}:00 候补。`);
                                }}
                                size="sm"
                                variant="secondary"
                              >
                                候补
                              </Button>
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="rounded-xl bg-white px-3 py-3 text-sm font-semibold text-ink/55">
                          当前小时暂无可确认技师，适合触发临时技师通知或休息建议。
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      ) : null}
    </section>
  );
}
