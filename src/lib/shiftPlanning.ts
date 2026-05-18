import type { Schedule, Technician } from "../types/domain";
import type {
  AutoConfirmResult,
  CapacityRule,
  ConfirmedShift,
  FinalBookableSlot,
  FinalBookableSlotStatus,
  ForceInheritedRule,
  ImportableTemplateOption,
  NotificationTask,
  ScheduleContext,
  ScheduleModeImpactPreview,
  PriorityRule,
  ScheduleSlotOverride,
  ScheduleTemplate,
  ShiftOverflowSummary,
  ShiftShortageSummary,
  ShiftTemplateType,
  SlotMatrix,
  StoreScheduleMode,
  StoreScheduleModeConfig,
  StoreOpenSlotStatus,
  StorePolicySummary,
  StoreSchedulePolicy,
  TechnicianAutoGenerateSummary,
  TechnicianScheduleResponse,
  TechnicianSlotStatus,
  TechnicianSpecialRules
} from "../types/shiftPlanning";
import { addDays, formatDateKey, parseDateKey, startOfWeek, timeToMinutes } from "./oneClickSchedule";

const templateDayCountMap: Record<ShiftTemplateType, number> = {
  day: 1,
  week: 7,
  month: 28
};

const importSourceLabels: Record<ImportableTemplateOption["source"], string> = {
  last_same_type: "上一次同类型模板",
  previous_day: "上一日模板",
  previous_week: "上一周模板",
  previous_month: "上一 4 周模板",
  last_year_same_period: "去年同期模板"
};

const scheduleModeLabels: Record<StoreScheduleMode, string> = {
  TECHNICIAN_SELF_FINAL: "技师自主排班",
  STORE_CONFIRM_REQUIRED: "商户确认模式",
  STORE_DIRECT_ASSIGN: "商户直接排班"
};

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const defaultHolidayDateKeys = new Set(["2026-04-29", "2026-05-03", "2026-05-04", "2026-05-05"]);

type CandidateContext = {
  technician: Technician;
  response: TechnicianScheduleResponse;
  confirmedHours: number;
  lastAssignedTimestamp: number;
  responseTimestamp: number;
};

function clampNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function createTimestamp(dateKey: string, hour: number) {
  return parseDateKey(dateKey).getTime() + hour * 60 * 60 * 1000;
}

function createShiftKey(storeId: string, technicianId: string, date: string, hour: number) {
  return `${storeId}__${technicianId}__${date}__${hour}`;
}

function createOverrideKey(ownerId: string, date: string, hour: number) {
  return `${ownerId}__${date}__${hour}`;
}

function getDayDiff(startDate: string, targetDate: string) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.floor((parseDateKey(targetDate).getTime() - parseDateKey(startDate).getTime()) / millisecondsPerDay);
}

function isDateInRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function getMatrixValue(matrix: SlotMatrix, dayIndex: number, hour: number) {
  return Boolean(matrix[dayIndex]?.[hour]);
}

function setMatrixValue(matrix: SlotMatrix, dayIndex: number, hour: number, value: boolean) {
  if (!matrix[dayIndex]) {
    return matrix;
  }

  const next = cloneSlotMatrix(matrix);
  next[dayIndex][hour] = value;
  return next;
}

function getActiveResponseOverrides(
  overrides: ScheduleSlotOverride[],
  ownerId: string,
  policyId: string,
  allowedStatuses: Set<ScheduleSlotOverride["status"]>
) {
  return overrides.filter((override) => override.ownerId === ownerId && override.policyId === policyId && allowedStatuses.has(override.status));
}

function getRuleValue(ruleType: PriorityRule["type"], technician: Technician) {
  if (ruleType === "group") {
    return technician.role;
  }

  if (ruleType === "category") {
    return technician.skills[0] ?? "";
  }

  return "";
}

function getConfirmedHoursMap(shifts: ConfirmedShift[]) {
  return shifts.reduce<Record<string, number>>((accumulator, shift) => {
    if (shift.shiftStatus !== "confirmed") {
      return accumulator;
    }

    accumulator[shift.technicianId] = (accumulator[shift.technicianId] ?? 0) + 1;
    return accumulator;
  }, {});
}

function getLastAssignedTimestampMap(shifts: ConfirmedShift[]) {
  return shifts.reduce<Record<string, number>>((accumulator, shift) => {
    if (shift.shiftStatus !== "confirmed") {
      return accumulator;
    }

    const timestamp = createTimestamp(shift.date, shift.hour);
    accumulator[shift.technicianId] = Math.max(accumulator[shift.technicianId] ?? 0, timestamp);
    return accumulator;
  }, {});
}

function hasScheduleConflict(
  schedules: Schedule[],
  technicianId: string,
  date: string,
  hour: number,
  preBufferMinutes: number,
  postBufferMinutes: number
) {
  const slotStart = hour * 60 - preBufferMinutes;
  const slotEnd = (hour + 1) * 60 + postBufferMinutes;

  return schedules.some((schedule) => {
    if (schedule.staffId !== technicianId || schedule.date !== date || schedule.status === "free") {
      return false;
    }

    const scheduleStart = timeToMinutes(schedule.startTime);
    const scheduleEnd = timeToMinutes(schedule.endTime);

    return slotStart < scheduleEnd && slotEnd > scheduleStart;
  });
}

function getBlockingScheduleForSlot(
  schedules: Schedule[],
  technicianId: string,
  date: string,
  hour: number,
  preBufferMinutes: number,
  postBufferMinutes: number
) {
  const slotStart = hour * 60 - preBufferMinutes;
  const slotEnd = (hour + 1) * 60 + postBufferMinutes;

  return schedules.find((schedule) => {
    if (schedule.staffId !== technicianId || schedule.date !== date || schedule.status === "free") {
      return false;
    }

    const scheduleStart = timeToMinutes(schedule.startTime);
    const scheduleEnd = timeToMinutes(schedule.endTime);
    return slotStart < scheduleEnd && slotEnd > scheduleStart;
  }) ?? null;
}

function getWeekBucketKey(date: string) {
  return formatDateKey(startOfWeek(parseDateKey(date)));
}

function getMonthBucketKey(date: string, policyStartDate: string) {
  const dayDiff = Math.max(0, getDayDiff(policyStartDate, date));
  const bucketIndex = Math.floor(dayDiff / 28);
  return `${policyStartDate}__${bucketIndex}`;
}

function getDateSetSize(value: Set<string>, date: string) {
  value.add(date);
  return value.size;
}

function getEffectiveRuleValue(policyValue: number | null, technicianValue: number | null, forced: boolean, mode: "min" | "max") {
  if (forced) {
    return policyValue;
  }

  if (policyValue == null) {
    return technicianValue;
  }

  if (technicianValue == null) {
    return policyValue;
  }

  return mode === "min" ? Math.min(policyValue, technicianValue) : Math.max(policyValue, technicianValue);
}

function mergeTechnicianSpecialRulesWithPolicy(policy: StoreSchedulePolicy, technicianRules: TechnicianSpecialRules | null | undefined) {
  const forcedRules = new Set<ForceInheritedRule>(policy.forceInheritedRules);
  const unlimited = policy.unlimitedMaxHours;

  return {
    holidayPreferencePercent: technicianRules?.holidayPreferencePercent ?? 0,
    weekdayPreferencePercents: technicianRules?.weekdayPreferencePercents ?? {},
    dailyMaxHours: unlimited ? null : getEffectiveRuleValue(policy.dailyMaxHours, technicianRules?.dailyMaxHours ?? null, forcedRules.has("hourLimits"), "min"),
    weeklyMaxHours: unlimited ? null : getEffectiveRuleValue(policy.weeklyMaxHours, technicianRules?.weeklyMaxHours ?? null, forcedRules.has("hourLimits"), "min"),
    monthlyMaxHours: unlimited ? null : getEffectiveRuleValue(policy.monthlyMaxHours, technicianRules?.monthlyMaxHours ?? null, forcedRules.has("hourLimits"), "min"),
    minRestDaysWeek: getEffectiveRuleValue(policy.minRestDaysWeek, technicianRules?.minRestDaysWeek ?? null, forcedRules.has("restDays"), "max"),
    maxRestDaysWeek: getEffectiveRuleValue(policy.maxRestDaysWeek, technicianRules?.maxRestDaysWeek ?? null, forcedRules.has("restDays"), "min"),
    minRestDaysMonth: getEffectiveRuleValue(policy.minRestDaysMonth, technicianRules?.minRestDaysMonth ?? null, forcedRules.has("restDays"), "max"),
    maxRestDaysMonth: getEffectiveRuleValue(policy.maxRestDaysMonth, technicianRules?.maxRestDaysMonth ?? null, forcedRules.has("restDays"), "min"),
    preServiceBufferMinutes: forcedRules.has("buffers")
      ? policy.preServiceBufferMinutes
      : Math.max(policy.preServiceBufferMinutes, technicianRules?.preServiceBufferMinutes ?? 0),
    postServiceBufferMinutes: forcedRules.has("buffers")
      ? policy.postServiceBufferMinutes
      : Math.max(policy.postServiceBufferMinutes, technicianRules?.postServiceBufferMinutes ?? 0),
    acceptsPeakTimeAssignments: technicianRules?.acceptsPeakTimeAssignments ?? true,
    acceptsTemporaryAssignments: technicianRules?.acceptsTemporaryAssignments ?? true
  };
}

function getEffectiveSpecialRules(policy: StoreSchedulePolicy, response: TechnicianScheduleResponse | null) {
  return mergeTechnicianSpecialRulesWithPolicy(policy, response?.specialRules);
}

type GeneratedAvailabilityOverride = {
  date: string;
  hour: number;
  status: Extract<ScheduleSlotOverride["status"], "available" | "unavailable">;
  reason: string;
};

function clampWithinRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sortHoursAscending(hours: number[]) {
  return [...hours].sort((left, right) => left - right);
}

function getDateRankingScore({
  preferredHours,
  openHours,
  preferenceScore
}: {
  preferredHours: number[];
  openHours: number[];
  preferenceScore: number;
}) {
  return preferenceScore * 1000 + preferredHours.length * 100 + openHours.length;
}

function toHourSet(hours: number[]) {
  return new Set(hours);
}

function compareByPriorityRules(left: CandidateContext, right: CandidateContext, priorityRules: PriorityRule[]) {
  for (const rule of priorityRules.filter((item) => item.enabled).sort((a, b) => a.weight - b.weight)) {
    if (rule.type === "technician" && rule.technicianIds && rule.technicianIds.length > 0) {
      const leftIndex = rule.technicianIds.indexOf(left.technician.id);
      const rightIndex = rule.technicianIds.indexOf(right.technician.id);

      if (leftIndex !== rightIndex) {
        if (leftIndex === -1) {
          return 1;
        }

        if (rightIndex === -1) {
          return -1;
        }

        return leftIndex - rightIndex;
      }
    }

    if ((rule.type === "group" || rule.type === "category" || rule.type === "tag") && rule.values && rule.values.length > 0) {
      const leftMatched = rule.type === "tag"
        ? rule.values.some((value) => [...(left.technician.profileTags ?? []), ...left.technician.skills].includes(value))
        : rule.values.includes(getRuleValue(rule.type, left.technician));
      const rightMatched = rule.type === "tag"
        ? rule.values.some((value) => [...(right.technician.profileTags ?? []), ...right.technician.skills].includes(value))
        : rule.values.includes(getRuleValue(rule.type, right.technician));

      if (leftMatched !== rightMatched) {
        return leftMatched ? -1 : 1;
      }
    }

    if (rule.type === "currentConfirmedHoursLess" && left.confirmedHours !== right.confirmedHours) {
      return left.confirmedHours - right.confirmedHours;
    }

    if (rule.type === "longestSinceLastAssigned" && left.lastAssignedTimestamp !== right.lastAssignedTimestamp) {
      return left.lastAssignedTimestamp - right.lastAssignedTimestamp;
    }

    if (rule.type === "earliestResponse" && left.responseTimestamp !== right.responseTimestamp) {
      return left.responseTimestamp - right.responseTimestamp;
    }
  }

  if (left.confirmedHours !== right.confirmedHours) {
    return left.confirmedHours - right.confirmedHours;
  }

  if (left.lastAssignedTimestamp !== right.lastAssignedTimestamp) {
    return left.lastAssignedTimestamp - right.lastAssignedTimestamp;
  }

  if (left.responseTimestamp !== right.responseTimestamp) {
    return left.responseTimestamp - right.responseTimestamp;
  }

  return left.technician.id.localeCompare(right.technician.id, "en");
}

function createNotification(input: Omit<NotificationTask, "id" | "status">): NotificationTask {
  return {
    ...input,
    id: `notify-${Math.random().toString(36).slice(2, 10)}`,
    status: "pending"
  };
}

function buildImportOption(
  source: ImportableTemplateOption["source"],
  templates: ScheduleTemplate[],
  matcher: (template: ScheduleTemplate) => boolean
) {
  const template = [...templates]
    .filter(matcher)
    .sort((left, right) => (right.updatedAt > left.updatedAt ? 1 : -1))[0];

  if (!template) {
    return null;
  }

  return {
    source,
    label: importSourceLabels[source],
    templateId: template.id,
    updatedAt: template.updatedAt
  } satisfies ImportableTemplateOption;
}

export function getOpenSlotCountsForResponse(
  policy: StoreSchedulePolicy,
  storeTemplate: ScheduleTemplate | null,
  response: TechnicianScheduleResponse | null,
  responseTemplate: ScheduleTemplate | null,
  overrides: ScheduleSlotOverride[]
) {
  const dates = getDateKeysBetween(policy.startDate, policy.endDate);
  let availableCount = 0;
  let unavailableCount = 0;

  dates.forEach((date) => {
    for (let hour = 0; hour < 24; hour += 1) {
      const openStatus = resolveStoreSlotStatus({
        policy,
        template: storeTemplate,
        overrides,
        date,
        hour
      });

      if (openStatus === "closed") {
        continue;
      }

      const slotStatus = resolveTechnicianSlotStatus({
        policy,
        storeTemplate,
        response,
        responseTemplate,
        overrides,
        date,
        hour
      });

      if (slotStatus === "available") {
        availableCount += 1;
      } else if (slotStatus === "unavailable") {
        unavailableCount += 1;
      }
    }
  });

  return {
    availableCount,
    unavailableCount
  };
}

export type PolicyHourDetail = {
  hour: number;
  slotStatus: StoreOpenSlotStatus;
  targetCount: number | null;
  maxConfirmCount: number | null;
  confirmedTechnicianIds: string[];
  waitlistedTechnicianIds: string[];
  availableTechnicianIds: string[];
};

export function getTemplateDayCount(templateType: ShiftTemplateType) {
  return templateDayCountMap[templateType];
}

export function getTemplateCycleLength(templateType: ShiftTemplateType) {
  return getTemplateDayCount(templateType);
}

export function createEmptySlotMatrix(templateType: ShiftTemplateType, fill = false): SlotMatrix {
  return Array.from({ length: getTemplateDayCount(templateType) }, () => Array.from({ length: 24 }, () => fill));
}

export function cloneSlotMatrix(matrix: SlotMatrix): SlotMatrix {
  return matrix.map((row) => [...row]);
}

export function normalizeSlotMatrix(templateType: ShiftTemplateType, raw?: SlotMatrix | null) {
  const expectedDays = getTemplateDayCount(templateType);

  if (!raw || raw.length !== expectedDays) {
    return createEmptySlotMatrix(templateType);
  }

  return Array.from({ length: expectedDays }, (_, dayIndex) =>
    Array.from({ length: 24 }, (_, hour) => Boolean(raw[dayIndex]?.[hour]))
  );
}

export function adaptSlotMatrix(
  matrix: SlotMatrix,
  sourceType: ShiftTemplateType,
  targetType: ShiftTemplateType
) {
  const normalizedSource = normalizeSlotMatrix(sourceType, matrix);
  const targetDays = getTemplateDayCount(targetType);
  const sourceDays = getTemplateDayCount(sourceType);

  return Array.from({ length: targetDays }, (_, dayIndex) =>
    Array.from({ length: 24 }, (_, hour) => normalizedSource[dayIndex % sourceDays]?.[hour] ?? false)
  );
}

export function formatHourLabel(hour: number) {
  const nextHour = (hour + 1) % 24;
  return `${String(hour).padStart(2, "0")}:00 - ${String(nextHour).padStart(2, "0")}:00`;
}

export function getWeekdayLabel(weekday: number) {
  return weekdayLabels[weekday] ?? String(weekday);
}

export function getTemplateDayLabels(templateType: ShiftTemplateType, startDate?: string) {
  if (templateType === "day") {
    if (!startDate) {
      return ["当日"];
    }

    const date = parseDateKey(startDate);
    return [`${startDate.slice(5)} ${weekdayLabels[date.getDay()]}`];
  }

  if (templateType === "week") {
    return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  }

  return Array.from({ length: 28 }, (_, index) => {
    const week = Math.floor(index / 7) + 1;
    const weekday = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index % 7];
    return `第 ${week} 周 ${weekday}`;
  });
}

export function getDateKeysBetween(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const result: string[] = [];
  let current = parseDateKey(startDate);
  const last = parseDateKey(endDate);

  while (current <= last) {
    result.push(formatDateKey(current));
    current = addDays(current, 1);
  }

  return result;
}

export function isLongSchedulingRange(startDate: string, endDate: string) {
  return getDayDiff(startDate, endDate) > 60;
}

export function getTemplateImportSourceLabel(source: ImportableTemplateOption["source"]) {
  return importSourceLabels[source];
}

export function getImportableTemplateOptions({
  templates,
  ownerType,
  ownerId,
  storeId,
  templateType,
  policyId
}: {
  templates: ScheduleTemplate[];
  ownerType: ScheduleTemplate["ownerType"];
  ownerId: string;
  storeId: string;
  templateType: ShiftTemplateType;
  policyId?: string | null;
}) {
  const scopedTemplates = templates.filter(
    (template) =>
      template.ownerType === ownerType &&
      template.ownerId === ownerId &&
      template.targetStoreId === storeId &&
      template.status !== "archived" &&
      template.policyId !== policyId
  );

  return [
    buildImportOption("last_same_type", scopedTemplates, (template) => template.templateType === templateType),
    buildImportOption("previous_day", scopedTemplates, (template) => template.templateType === "day"),
    buildImportOption("previous_week", scopedTemplates, (template) => template.templateType === "week"),
    buildImportOption("previous_month", scopedTemplates, (template) => template.templateType === "month"),
    buildImportOption(
      "last_year_same_period",
      scopedTemplates,
      (template) => getDayDiff(template.startDate, template.endDate) >= getDayDiff(template.startDate, template.startDate)
    )
  ].filter((item): item is ImportableTemplateOption => Boolean(item));
}

export function getTemplateDayIndex(template: Pick<ScheduleTemplate, "templateType" | "repeatEnabled" | "startDate" | "endDate">, date: string) {
  if (!isDateInRange(date, template.startDate, template.endDate)) {
    return -1;
  }

  const cycleLength = getTemplateDayCount(template.templateType);
  const dayDiff = getDayDiff(template.startDate, date);

  if (!template.repeatEnabled && dayDiff >= cycleLength) {
    return -1;
  }

  if (dayDiff < 0) {
    return -1;
  }

  return template.repeatEnabled ? dayDiff % cycleLength : dayDiff;
}

export function resolveTemplateSlotActive(
  template: Pick<ScheduleTemplate, "slotMatrix" | "templateType" | "repeatEnabled" | "startDate" | "endDate"> | null | undefined,
  date: string,
  hour: number
) {
  if (!template) {
    return false;
  }

  const dayIndex = getTemplateDayIndex(template, date);

  if (dayIndex === -1) {
    return false;
  }

  return Boolean(template.slotMatrix[dayIndex]?.[hour]);
}

export function resolveStoreSlotStatus({
  policy,
  template,
  overrides,
  date,
  hour
}: {
  policy: StoreSchedulePolicy | null | undefined;
  template: ScheduleTemplate | null | undefined;
  overrides: ScheduleSlotOverride[];
  date: string;
  hour: number;
}): StoreOpenSlotStatus {
  if (!policy || !template || !isDateInRange(date, policy.startDate, policy.endDate)) {
    return "closed";
  }

  const overrideMap = new Map(
    overrides
      .filter((override) => override.ownerType === "store" && override.ownerId === policy.storeId && override.policyId === policy.id)
      .map((override) => [createOverrideKey(override.ownerId, override.date, override.hour), override.status])
  );
  const overrideStatus = overrideMap.get(createOverrideKey(policy.storeId, date, hour));

  if (overrideStatus === "closed") {
    return "closed";
  }

  const active = overrideStatus === "opened" || overrideStatus === "locked" ? true : resolveTemplateSlotActive(template, date, hour);

  if (!active) {
    return "closed";
  }

  if (overrideStatus === "locked") {
    return "locked";
  }

  if (policy.status === "draft" || policy.status === "cancelled") {
    return "closed";
  }

  if (policy.status === "opened" || policy.status === "reopened") {
    return "opened";
  }

  return "locked";
}

export function resolveTechnicianSlotStatus({
  policy,
  storeTemplate,
  response,
  responseTemplate,
  overrides,
  date,
  hour
}: {
  policy: StoreSchedulePolicy | null | undefined;
  storeTemplate: ScheduleTemplate | null | undefined;
  response: TechnicianScheduleResponse | null | undefined;
  responseTemplate: ScheduleTemplate | null | undefined;
  overrides: ScheduleSlotOverride[];
  date: string;
  hour: number;
}): TechnicianSlotStatus {
  const storeSlotStatus = resolveStoreSlotStatus({
    policy,
    template: storeTemplate,
    overrides,
    date,
    hour
  });

  if (storeSlotStatus === "closed") {
    return "none";
  }

  if (!response || !responseTemplate) {
    return "none";
  }

  const overrideMap = new Map(
    overrides
      .filter((override) => override.ownerType === "technician" && override.ownerId === response.technicianId && override.policyId === response.policyId)
      .map((override) => [createOverrideKey(override.ownerId, override.date, override.hour), override.status])
  );
  const overrideStatus = overrideMap.get(createOverrideKey(response.technicianId, date, hour));

  if (overrideStatus === "available" || overrideStatus === "unavailable") {
    return overrideStatus;
  }

  return resolveTemplateSlotActive(responseTemplate, date, hour) ? "available" : "unavailable";
}

export function resolvePublishedTechnicianSlotStatus({
  response,
  responseTemplate,
  overrides,
  date,
  hour
}: {
  response: TechnicianScheduleResponse | null | undefined;
  responseTemplate: ScheduleTemplate | null | undefined;
  overrides: ScheduleSlotOverride[];
  date: string;
  hour: number;
}): TechnicianSlotStatus {
  if (!response || !responseTemplate || !isDateInRange(date, response.periodStart, response.periodEnd)) {
    return "none";
  }

  const overrideMap = new Map(
    overrides
      .filter((override) => override.ownerType === "technician" && override.ownerId === response.technicianId && override.policyId === response.policyId)
      .map((override) => [createOverrideKey(override.ownerId, override.date, override.hour), override.status])
  );
  const overrideStatus = overrideMap.get(createOverrideKey(response.technicianId, date, hour));

  if (overrideStatus === "available" || overrideStatus === "unavailable") {
    return overrideStatus;
  }

  return resolveTemplateSlotActive(responseTemplate, date, hour) ? "available" : "unavailable";
}

export function createDefaultStoreScheduleModeSelfRules(): StoreScheduleModeConfig["selfModeRules"] {
  return {
    businessHoursRequired: true,
    resourceValidationRequired: true,
    freezeBeforeStartMinutes: 180,
    autoPublishAfterValidation: true,
    allowStoreBlackout: true
  };
}

export function createDefaultStoreScheduleModeConfirmRules(): StoreScheduleModeConfig["confirmModeRules"] {
  return {
    feedbackDeadlineAt: null,
    autoLockAfterDeadline: true,
    autoConfirmEnabled: true
  };
}

export function getStoreScheduleModeLabel(mode: StoreScheduleMode) {
  return scheduleModeLabels[mode];
}

export function getActiveModeConfigForStore(
  storeId: string | null | undefined,
  modeConfigs: StoreScheduleModeConfig[],
  atDate = new Date().toISOString()
) {
  if (!storeId) {
    return null;
  }

  const targetTime = toTimestamp(atDate);
  const candidates = modeConfigs.filter((config) => config.storeId === storeId && config.status !== "archived");
  const activeCandidates = candidates.filter((config) => {
    const start = toTimestamp(config.effectiveFrom);
    const end = toTimestamp(config.effectiveTo);
    const statusAllowsUse = config.status === "active" || config.status === "scheduled";

    if (!statusAllowsUse || Number.isNaN(start)) {
      return false;
    }

    if (!Number.isNaN(targetTime) && start > targetTime) {
      return false;
    }

    if (!Number.isNaN(end) && !Number.isNaN(targetTime) && targetTime >= end) {
      return false;
    }

    return true;
  });

  if (activeCandidates.length > 0) {
    return [...activeCandidates].sort((left, right) => toTimestamp(right.effectiveFrom) - toTimestamp(left.effectiveFrom))[0] ?? null;
  }

  return [...candidates].sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))[0] ?? null;
}

export function getUpcomingModeConfigForStore(
  storeId: string | null | undefined,
  modeConfigs: StoreScheduleModeConfig[],
  atDate = new Date().toISOString()
) {
  if (!storeId) {
    return null;
  }

  const targetTime = toTimestamp(atDate);

  return [...modeConfigs]
    .filter((config) => config.storeId === storeId && config.status === "scheduled" && toTimestamp(config.effectiveFrom) > targetTime)
    .sort((left, right) => toTimestamp(left.effectiveFrom) - toTimestamp(right.effectiveFrom))[0] ?? null;
}

export function resolveScheduleContext({
  technician,
  modeConfigs,
  atDate = new Date().toISOString(),
  storeId
}: {
  technician: Technician | null | undefined;
  modeConfigs: StoreScheduleModeConfig[];
  atDate?: string;
  storeId?: string | null;
}): ScheduleContext {
  const scopedStoreId = storeId ?? technician?.storeId ?? null;
  const isIndependent = !scopedStoreId || technician?.identityLabel === "个人技师";

  if (!technician || isIndependent) {
    return {
      technicianId: technician?.id ?? "",
      storeId: null,
      mode: null,
      context: "INDIVIDUAL_SELF_FINAL",
      canSelfPublish: true,
      requiresStoreConfirmation: false,
      editableSlotScope: "published_availability",
      storeRules: {
        businessHoursRequired: false,
        resourceValidationRequired: false,
        freezeBeforeStartMinutes: 0,
        allowStoreBlackout: false,
        feedbackDeadlineAt: null,
        autoLockAfterDeadline: false,
        autoConfirmEnabled: false
      },
      uiHints: {
        title: "我的可预约时间",
        primaryAction: "发布我的可预约时间",
        description: "你发布并校验通过的时间会直接成为用户可预约时间。",
        disabledReason: null
      }
    };
  }

  const modeConfig = getActiveModeConfigForStore(scopedStoreId, modeConfigs, atDate);
  const mode = modeConfig?.mode ?? "STORE_CONFIRM_REQUIRED";
  const context =
    mode === "TECHNICIAN_SELF_FINAL"
      ? "STORE_TECH_SELF_FINAL"
      : mode === "STORE_DIRECT_ASSIGN"
        ? "STORE_DIRECT_ASSIGN"
        : "STORE_CONFIRM_REQUIRED";
  const requiresStoreConfirmation = context === "STORE_CONFIRM_REQUIRED";
  const isStoreDirectAssign = context === "STORE_DIRECT_ASSIGN";

  return {
    technicianId: technician.id,
    storeId: scopedStoreId,
    mode,
    context,
    canSelfPublish: !requiresStoreConfirmation && !isStoreDirectAssign,
    requiresStoreConfirmation,
    editableSlotScope: requiresStoreConfirmation || isStoreDirectAssign ? "store_application" : "published_availability",
    storeRules: {
      businessHoursRequired: modeConfig?.selfModeRules.businessHoursRequired ?? true,
      resourceValidationRequired: modeConfig?.selfModeRules.resourceValidationRequired ?? true,
      freezeBeforeStartMinutes: modeConfig?.selfModeRules.freezeBeforeStartMinutes ?? 180,
      allowStoreBlackout: modeConfig?.selfModeRules.allowStoreBlackout ?? true,
      feedbackDeadlineAt: modeConfig?.confirmModeRules.feedbackDeadlineAt ?? null,
      autoLockAfterDeadline: modeConfig?.confirmModeRules.autoLockAfterDeadline ?? true,
      autoConfirmEnabled: modeConfig?.confirmModeRules.autoConfirmEnabled ?? true
    },
    uiHints: isStoreDirectAssign
      ? {
          title: "商户直接排班",
          primaryAction: "确认收到 / 申请更改",
          description: "商户保存后即成为正式排班；你可以确认已读，或通过申请更改进入商户处理。",
          disabledReason: "商户直接排班模式下不可直接修改正式班表。"
        }
      : requiresStoreConfirmation
        ? {
            title: "排班申请 / 可上班反馈",
            primaryAction: "提交排班反馈",
            description: "只能在商户开放时段内提交反馈，最终需等待商户确认后才会进入用户可预约时间。",
            disabledReason: null
          }
        : {
            title: "我的上班时间",
            primaryAction: "发布我的上班时间",
            description: "发布后会经过商户规则校验，通过的时间会直接进入最终可预约时间。",
            disabledReason: null
          }
  };
}

export function getCapacityForHour({
  policy,
  capacityRules,
  date,
  holidayDateKeys = defaultHolidayDateKeys
}: {
  policy: StoreSchedulePolicy;
  capacityRules: CapacityRule[];
  date: string;
  holidayDateKeys?: Set<string>;
}) {
  const dateValue = date;
  const weekdayValue = String(parseDateKey(date).getDay());
  const isHoliday = holidayDateKeys.has(date);
  const scopedRules = capacityRules.filter((rule) => rule.storeId === policy.storeId && (!rule.policyId || rule.policyId === policy.id));
  const orderedScopes: Array<{ scopeType: CapacityRule["scopeType"]; scopeValue: string }> = [
    { scopeType: "date", scopeValue: dateValue },
    { scopeType: "holiday", scopeValue: isHoliday ? "1" : "__none__" },
    { scopeType: "weekday", scopeValue: weekdayValue },
    { scopeType: "global", scopeValue: "default" }
  ];

  const targetRule = orderedScopes
    .map((scope) => scopedRules.find((rule) => rule.scopeType === scope.scopeType && rule.scopeValue === scope.scopeValue && rule.targetCount != null))
    .find(Boolean);
  const maxRule = orderedScopes
    .map((scope) => scopedRules.find((rule) => rule.scopeType === scope.scopeType && rule.scopeValue === scope.scopeValue && rule.maxConfirmCount != null))
    .find(Boolean);
  const holidayAdjustment = isHoliday ? policy.holidayDemandPercent : 0;
  const weekdayAdjustment = policy.weekdayDemandPercents[parseDateKey(date).getDay()] ?? 0;
  const demandFactor = Math.max(0.2, 1 + (holidayAdjustment + weekdayAdjustment) / 100);
  const baseTargetCount = targetRule?.targetCount ?? policy.defaultCapacityPerHour;
  const targetCount = baseTargetCount == null ? null : Math.max(0, Math.ceil(baseTargetCount * demandFactor));
  const baseMaxConfirmCount = maxRule?.maxConfirmCount ?? policy.defaultMaxConfirmPerHour;
  const maxConfirmCount = baseMaxConfirmCount == null ? null : Math.max(targetCount ?? 0, Math.ceil(baseMaxConfirmCount * demandFactor));

  return {
    targetCount,
    maxConfirmCount,
    demandFactor
  };
}

export function buildStorePolicySummary({
  policy,
  storeTemplate,
  responses,
  responseTemplates,
  overrides,
  confirmedShifts,
  capacityRules
}: {
  policy: StoreSchedulePolicy;
  storeTemplate: ScheduleTemplate | null;
  responses: TechnicianScheduleResponse[];
  responseTemplates: ScheduleTemplate[];
  overrides: ScheduleSlotOverride[];
  confirmedShifts: ConfirmedShift[];
  capacityRules: CapacityRule[];
}): StorePolicySummary {
  const responseTemplateMap = new Map(responseTemplates.map((template) => [template.id, template]));
  const dates = getDateKeysBetween(policy.startDate, policy.endDate);
  let openHourCount = 0;
  let lockedHourCount = 0;

  dates.forEach((date) => {
    for (let hour = 0; hour < 24; hour += 1) {
      const slotStatus = resolveStoreSlotStatus({
        policy,
        template: storeTemplate,
        overrides,
        date,
        hour
      });

      if (slotStatus === "opened") {
        openHourCount += 1;
      } else if (slotStatus === "locked") {
        lockedHourCount += 1;
      }
    }
  });

  const responseCounts = responses.reduce(
    (accumulator, response) => {
      if (response.responseStatus === "updated") {
        accumulator.updated += 1;
      } else if (response.responseStatus === "submitted") {
        accumulator.submitted += 1;
      }

      const responseTemplate = responseTemplateMap.get(response.templateId) ?? null;
      const counts = getOpenSlotCountsForResponse(policy, storeTemplate, response, responseTemplate, overrides);

      accumulator.available += counts.availableCount;
      accumulator.unavailable += counts.unavailableCount;
      return accumulator;
    },
    {
      submitted: 0,
      updated: 0,
      available: 0,
      unavailable: 0
    }
  );

  const relevantShifts = confirmedShifts.filter((shift) => shift.policyId === policy.id);
  const { shortage, overflow } = summarizeShortageAndOverflow({
    policy,
    storeTemplate,
    responses,
    responseTemplates,
    overrides,
    confirmedShifts: relevantShifts,
    capacityRules
  });

  return {
    openHourCount,
    lockedHourCount,
    applicableTechnicianCount: policy.appliesToTechnicians.length,
    feedbackSubmittedCount: responseCounts.submitted,
    feedbackUpdatedCount: responseCounts.updated,
    feedbackPendingCount: Math.max(0, policy.appliesToTechnicians.length - responses.length),
    availableHourCount: responseCounts.available,
    unavailableHourCount: responseCounts.unavailable,
    confirmedCount: relevantShifts.filter((shift) => shift.shiftStatus === "confirmed").length,
    waitlistedCount: relevantShifts.filter((shift) => shift.shiftStatus === "waitlisted").length,
    shortageCount: shortage.length,
    overflowCount: overflow.length
  };
}

export function summarizeShortageAndOverflow({
  policy,
  storeTemplate,
  responses,
  responseTemplates,
  overrides,
  confirmedShifts,
  capacityRules
}: {
  policy: StoreSchedulePolicy;
  storeTemplate: ScheduleTemplate | null;
  responses: TechnicianScheduleResponse[];
  responseTemplates: ScheduleTemplate[];
  overrides: ScheduleSlotOverride[];
  confirmedShifts: ConfirmedShift[];
  capacityRules: CapacityRule[];
}) {
  const dates = getDateKeysBetween(policy.startDate, policy.endDate);
  const responseTemplateMap = new Map(responseTemplates.map((template) => [template.id, template]));
  const shortage: ShiftShortageSummary[] = [];
  const overflow: ShiftOverflowSummary[] = [];

  dates.forEach((date) => {
    for (let hour = 0; hour < 24; hour += 1) {
      const slotStatus = resolveStoreSlotStatus({
        policy,
        template: storeTemplate,
        overrides,
        date,
        hour
      });

      if (slotStatus === "closed") {
        continue;
      }

      const availabilityCount = responses.filter((response) => {
        const responseTemplate = responseTemplateMap.get(response.templateId) ?? null;
        return resolveTechnicianSlotStatus({
          policy,
          storeTemplate,
          response,
          responseTemplate,
          overrides,
          date,
          hour
        }) === "available";
      }).length;
      const confirmedCount = confirmedShifts.filter(
        (shift) => shift.date === date && shift.hour === hour && shift.shiftStatus === "confirmed"
      ).length;
      const waitlistedCount = confirmedShifts.filter(
        (shift) => shift.date === date && shift.hour === hour && shift.shiftStatus === "waitlisted"
      ).length;
      const capacity = getCapacityForHour({
        policy,
        capacityRules,
        date
      });

      if (capacity.targetCount != null && confirmedCount < capacity.targetCount) {
        shortage.push({
          date,
          hour,
          targetCount: capacity.targetCount,
          confirmedCount,
          availableCount: availabilityCount,
          missingCount: capacity.targetCount - confirmedCount
        });
      }

      if (capacity.maxConfirmCount != null && availabilityCount > capacity.maxConfirmCount) {
        overflow.push({
          date,
          hour,
          maxConfirmCount: capacity.maxConfirmCount,
          availableCount: availabilityCount,
          waitlistCount: Math.max(waitlistedCount, availabilityCount - capacity.maxConfirmCount)
        });
      }
    }
  });

  return { shortage, overflow };
}

export function buildPolicyHourDetails({
  policy,
  storeTemplate,
  date,
  responses,
  responseTemplates,
  overrides,
  confirmedShifts,
  capacityRules
}: {
  policy: StoreSchedulePolicy;
  storeTemplate: ScheduleTemplate | null;
  date: string;
  responses: TechnicianScheduleResponse[];
  responseTemplates: ScheduleTemplate[];
  overrides: ScheduleSlotOverride[];
  confirmedShifts: ConfirmedShift[];
  capacityRules: CapacityRule[];
}): PolicyHourDetail[] {
  const responseTemplateMap = new Map(responseTemplates.map((template) => [template.id, template]));

  return Array.from({ length: 24 }, (_, hour) => {
    const slotStatus = resolveStoreSlotStatus({
      policy,
      template: storeTemplate,
      overrides,
      date,
      hour
    });
    const confirmedTechnicianIds = confirmedShifts
      .filter((shift) => shift.date === date && shift.hour === hour && shift.shiftStatus === "confirmed")
      .map((shift) => shift.technicianId);
    const waitlistedTechnicianIds = confirmedShifts
      .filter((shift) => shift.date === date && shift.hour === hour && shift.shiftStatus === "waitlisted")
      .map((shift) => shift.technicianId);
    const availableTechnicianIds = responses
      .filter((response) => {
        const responseTemplate = responseTemplateMap.get(response.templateId) ?? null;
        return resolveTechnicianSlotStatus({
          policy,
          storeTemplate,
          response,
          responseTemplate,
          overrides,
          date,
          hour
        }) === "available";
      })
      .map((response) => response.technicianId);
    const capacity = getCapacityForHour({
      policy,
      capacityRules,
      date
    });

    return {
      hour,
      slotStatus,
      targetCount: capacity.targetCount,
      maxConfirmCount: capacity.maxConfirmCount,
      confirmedTechnicianIds,
      waitlistedTechnicianIds,
      availableTechnicianIds
    };
  });
}

export function getPolicyStatusLabel(status: StoreSchedulePolicy["status"]) {
  const labels: Record<StoreSchedulePolicy["status"], string> = {
    draft: "草稿",
    opened: "已开放",
    locked: "已锁定",
    partially_confirmed: "部分确认",
    confirmed: "已确认",
    reopened: "已重新开放",
    cancelled: "已取消"
  };

  return labels[status];
}

export function getStoreOpenStatusLabel(status: StoreOpenSlotStatus) {
  const labels: Record<StoreOpenSlotStatus, string> = {
    closed: "未开放",
    opened: "可反馈",
    locked: "已锁定"
  };

  return labels[status];
}

export function getTechnicianSlotStatusLabel(status: TechnicianSlotStatus) {
  const labels: Record<TechnicianSlotStatus, string> = {
    none: "待反馈",
    available: "可接受排班",
    unavailable: "不可排班"
  };

  return labels[status];
}

export function getResponseStatusLabel(status: TechnicianScheduleResponse["responseStatus"]) {
  const labels: Record<TechnicianScheduleResponse["responseStatus"], string> = {
    none: "未反馈",
    submitted: "已提交",
    updated: "已更新"
  };

  return labels[status];
}

export function getConfirmedShiftStatusLabel(status: ConfirmedShift["shiftStatus"]) {
  const labels: Record<ConfirmedShift["shiftStatus"], string> = {
    confirmed: "已确认",
    waitlisted: "候补",
    cancelled: "已取消"
  };

  return labels[status];
}

export function getScheduleContextLabel(context: ScheduleContext["context"]) {
  const labels: Record<ScheduleContext["context"], string> = {
    INDIVIDUAL_SELF_FINAL: "个体技师自排",
    STORE_TECH_SELF_FINAL: "技师自主排班",
    STORE_CONFIRM_REQUIRED: "商户确认模式",
    STORE_DIRECT_ASSIGN: "商户直接排班"
  };

  return labels[context];
}

export function getFinalBookableSlotStatusLabel(status: FinalBookableSlotStatus) {
  const labels: Record<FinalBookableSlotStatus, string> = {
    available: "可预约",
    held: "暂占中",
    booked: "已预约",
    blocked_by_store: "店铺不可用",
    conflict: "需处理冲突"
  };

  return labels[status];
}

export function buildScheduleModeImpactPreview({
  storeId,
  targetMode,
  modeConfigs,
  responses,
  finalBookableSlots,
  technicians
}: {
  storeId: string;
  targetMode: StoreScheduleMode;
  modeConfigs: StoreScheduleModeConfig[];
  responses: TechnicianScheduleResponse[];
  finalBookableSlots: FinalBookableSlot[];
  technicians: Technician[];
}): ScheduleModeImpactPreview {
  const scopedTechnicianIds = new Set(technicians.filter((technician) => technician.storeId === storeId).map((technician) => technician.id));

  return {
    currentMode: getActiveModeConfigForStore(storeId, modeConfigs)?.mode ?? null,
    targetMode,
    affectedTechnicianCount: scopedTechnicianIds.size,
    pendingApplicationCount: responses.filter((response) => response.storeId === storeId && scopedTechnicianIds.has(response.technicianId)).length,
    publishedSelfSlotCount: finalBookableSlots.filter(
      (slot) => slot.storeId === storeId && slot.sourceType === "technician_published"
    ).length,
    futureBookingCount: finalBookableSlots.filter((slot) => slot.storeId === storeId && slot.status === "booked").length,
    conflictSlotCount: finalBookableSlots.filter((slot) => slot.storeId === storeId && slot.status === "conflict").length
  };
}

function getProjectionRangeForTechnician({
  technician,
  policy,
  response
}: {
  technician: Technician;
  policy: StoreSchedulePolicy | null;
  response: TechnicianScheduleResponse | null;
}) {
  if (response) {
    return {
      startDate: response.periodStart,
      endDate: response.periodEnd
    };
  }

  if (policy) {
    return {
      startDate: policy.startDate,
      endDate: policy.endDate
    };
  }

  const baseDate = "2026-04-20";
  const endDate = formatDateKey(addDays(parseDateKey(baseDate), 27));

  return {
    startDate: baseDate,
    endDate
  };
}

export function buildFinalBookableSlotsForTechnician({
  technician,
  modeConfigs,
  policies,
  templates,
  overrides,
  responses,
  confirmedShifts,
  busySchedules,
  atDate = new Date().toISOString()
}: {
  technician: Technician;
  modeConfigs: StoreScheduleModeConfig[];
  policies: StoreSchedulePolicy[];
  templates: ScheduleTemplate[];
  overrides: ScheduleSlotOverride[];
  responses: TechnicianScheduleResponse[];
  confirmedShifts: ConfirmedShift[];
  busySchedules: Schedule[];
  atDate?: string;
}) {
  const context = resolveScheduleContext({
    technician,
    modeConfigs,
    atDate
  });
  const policy = context.storeId ? getActivePolicyForStore(context.storeId, policies) : null;
  const storeTemplate = policy
    ? templates.find((template) => template.ownerType === "store" && template.policyId === policy.id) ?? null
    : null;
  const response = policy
    ? responses.find((item) => item.policyId === policy.id && item.technicianId === technician.id) ?? null
    : responses.find((item) => item.technicianId === technician.id) ?? null;
  const responseTemplate = response ? templates.find((template) => template.id === response.templateId) ?? null : null;
  const { startDate, endDate } = getProjectionRangeForTechnician({
    technician,
    policy,
    response
  });
  const dates = getDateKeysBetween(startDate, endDate);
  const slots: FinalBookableSlot[] = [];

  dates.forEach((date) => {
    for (let hour = 0; hour < 24; hour += 1) {
      let sourceActive = false;
      let status: FinalBookableSlotStatus | null = null;
      let validationSummary = "";

      if (context.context === "STORE_CONFIRM_REQUIRED" || context.context === "STORE_DIRECT_ASSIGN") {
        const confirmedShift = confirmedShifts.find(
          (shift) =>
            shift.technicianId === technician.id &&
            shift.date === date &&
            shift.hour === hour &&
            shift.shiftStatus === "confirmed" &&
            (!policy || shift.policyId === policy.id)
        );

        if (!confirmedShift) {
          continue;
        }

        sourceActive = true;
        status = "available";
        validationSummary = context.context === "STORE_DIRECT_ASSIGN" ? "商户直接排班已生效" : "商户已确认班表";
      } else {
        const publishedStatus = resolvePublishedTechnicianSlotStatus({
          response,
          responseTemplate,
          overrides,
          date,
          hour
        });

        if (publishedStatus !== "available") {
          continue;
        }

        sourceActive = true;
        status = "available";
        validationSummary = context.context === "INDIVIDUAL_SELF_FINAL" ? "技师已发布可预约时间" : "技师已发布上班时间";

        if (context.context === "STORE_TECH_SELF_FINAL" && policy && storeTemplate) {
          const storeStatus = resolveStoreSlotStatus({
            policy,
            template: storeTemplate,
            overrides,
            date,
            hour
          });

          if (storeStatus === "closed" || storeStatus === "locked") {
            status = "blocked_by_store";
            validationSummary = storeStatus === "locked" ? "店铺当前锁定或黑屏该时段" : "超出店铺允许发布时段";
          }
        }
      }

      if (!sourceActive || !status) {
        continue;
      }

      const effectiveRules = policy ? mergeTechnicianSpecialRulesWithPolicy(policy, response?.specialRules) : createDefaultTechnicianSpecialRules();
      const blockingSchedule = getBlockingScheduleForSlot(
        busySchedules,
        technician.id,
        date,
        hour,
        effectiveRules.preServiceBufferMinutes,
        effectiveRules.postServiceBufferMinutes
      );

      if (status === "available" && blockingSchedule) {
        status = blockingSchedule.status === "booked" ? "booked" : "conflict";
        validationSummary = blockingSchedule.status === "booked" ? "已有订单占用该时段" : "与现有日程或缓冲规则冲突";
      }

      slots.push({
        id: `${context.context.toLowerCase()}-${technician.id}-${date}-${hour}`,
        storeId: context.storeId,
        technicianId: technician.id,
        policyId: policy?.id ?? null,
        date,
        hour,
        status,
        context: context.context,
        sourceType: context.context === "STORE_CONFIRM_REQUIRED" || context.context === "STORE_DIRECT_ASSIGN" ? "store_confirmed" : "technician_published",
        validationSummary,
        updatedAt: atDate
      });
    }
  });

  return slots;
}

export function applyMatrixPreset(
  matrix: SlotMatrix,
  templateType: ShiftTemplateType,
  preset: "all" | "none" | "invert" | "workdays" | "weekend",
  dayIndex?: number
) {
  const next = cloneSlotMatrix(matrix);

  if (preset === "all") {
    return next.map((row) => row.map(() => true));
  }

  if (preset === "none") {
    return next.map((row) => row.map(() => false));
  }

  if (preset === "invert") {
    return next.map((row) => row.map((value) => !value));
  }

  const dayCount = getTemplateDayCount(templateType);
  const weekdayFromIndex = (index: number) => {
    if (templateType === "day") {
      return 1;
    }

    if (templateType === "week") {
      return (index + 1) % 7;
    }

    return (index % 7 + 1) % 7;
  };

  return next.map((row, index) => {
    const weekday = weekdayFromIndex(index);
    const matched = preset === "workdays" ? weekday >= 1 && weekday <= 5 : weekday === 0 || weekday === 6;

    if (dayIndex != null && dayIndex !== index) {
      return row;
    }

    return row.map(() => matched);
  }).slice(0, dayCount);
}

export function copyMatrixDay(matrix: SlotMatrix, targetDayIndex: number, sourceDayIndex: number) {
  if (!matrix[targetDayIndex] || !matrix[sourceDayIndex]) {
    return cloneSlotMatrix(matrix);
  }

  const next = cloneSlotMatrix(matrix);
  next[targetDayIndex] = [...matrix[sourceDayIndex]];
  return next;
}

export function fillMatrixHourRange(
  matrix: SlotMatrix,
  startHour: number,
  endHour: number,
  nextValue: boolean,
  dayIndexes?: number[]
) {
  const next = cloneSlotMatrix(matrix);
  const targetDaySet = new Set(dayIndexes ?? next.map((_, index) => index));

  next.forEach((row, dayIndex) => {
    if (!targetDaySet.has(dayIndex)) {
      return;
    }

    for (let hour = startHour; hour <= endHour; hour += 1) {
      row[hour] = nextValue;
    }
  });

  return next;
}

export function resolveImportedTemplateMatrix({
  option,
  templates,
  targetTemplateType
}: {
  option: ImportableTemplateOption | null;
  templates: ScheduleTemplate[];
  targetTemplateType: ShiftTemplateType;
}) {
  if (!option) {
    return null;
  }

  const template = templates.find((item) => item.id === option.templateId);

  if (!template) {
    return null;
  }

  return adaptSlotMatrix(template.slotMatrix, template.templateType, targetTemplateType);
}

export function getEditableTemplateCellState({
  templateType,
  dayIndex,
  hour,
  startDate,
  endDate,
  storePolicy,
  storeTemplate,
  overrides
}: {
  templateType: ShiftTemplateType;
  dayIndex: number;
  hour: number;
  startDate: string;
  endDate: string;
  storePolicy: StoreSchedulePolicy;
  storeTemplate: ScheduleTemplate | null;
  overrides: ScheduleSlotOverride[];
}) {
  const dates = getDateKeysBetween(startDate, endDate).filter((date) => {
    const relativeIndex = getDayDiff(startDate, date) % getTemplateDayCount(templateType);
    return relativeIndex === dayIndex;
  });

  return dates.some((date) => resolveStoreSlotStatus({
    policy: storePolicy,
    template: storeTemplate,
    overrides,
    date,
    hour
  }) !== "closed");
}

export function createDefaultTechnicianSpecialRules(): TechnicianSpecialRules {
  return {
    holidayPreferencePercent: 0,
    weekdayPreferencePercents: {},
    dailyMaxHours: null,
    weeklyMaxHours: null,
    monthlyMaxHours: null,
    minRestDaysWeek: null,
    maxRestDaysWeek: null,
    minRestDaysMonth: null,
    maxRestDaysMonth: null,
    preServiceBufferMinutes: 0,
    postServiceBufferMinutes: 0,
    acceptsPeakTimeAssignments: true,
    acceptsTemporaryAssignments: true
  };
}

export function getActivePolicyForStore(storeId: string, policies: StoreSchedulePolicy[]) {
  return [...policies]
    .filter((policy) => policy.storeId === storeId && policy.status !== "cancelled")
    .sort((left, right) => (right.updatedAt > left.updatedAt ? 1 : -1))[0] ?? null;
}

export function generateTechnicianAvailabilityDraft({
  policy,
  storeTemplate,
  overrides,
  templateType,
  startDate,
  endDate,
  repeatEnabled,
  baseTemplateType,
  baseMatrix,
  specialRules,
  importedTemplateUsed = false
}: {
  policy: StoreSchedulePolicy;
  storeTemplate: ScheduleTemplate | null;
  overrides: ScheduleSlotOverride[];
  templateType: ShiftTemplateType;
  startDate: string;
  endDate: string;
  repeatEnabled: boolean;
  baseTemplateType: ShiftTemplateType;
  baseMatrix: SlotMatrix;
  specialRules: TechnicianSpecialRules;
  importedTemplateUsed?: boolean;
}) {
  const effectiveRules = mergeTechnicianSpecialRulesWithPolicy(policy, specialRules);
  const normalizedBaseMatrix = adaptSlotMatrix(baseMatrix, baseTemplateType, templateType);
  const dates = getDateKeysBetween(startDate, endDate);
  const dateMeta = dates.map((date) => {
    const weekday = parseDateKey(date).getDay();
    const isHoliday = defaultHolidayDateKeys.has(date);
    const templateDayIndex = getTemplateDayIndex(
      {
        templateType,
        repeatEnabled,
        startDate,
        endDate
      },
      date
    );
    const openHours: number[] = [];
    let lockedCount = 0;

    for (let hour = 0; hour < 24; hour += 1) {
      const slotStatus = resolveStoreSlotStatus({
        policy,
        template: storeTemplate,
        overrides,
        date,
        hour
      });

      if (slotStatus === "opened") {
        openHours.push(hour);
      } else if (slotStatus === "locked") {
        lockedCount += 1;
      }
    }

    const preferredHours = templateDayIndex === -1
      ? []
      : openHours.filter((hour) => Boolean(normalizedBaseMatrix[templateDayIndex]?.[hour]));
    const fallbackHours = openHours.filter((hour) => !preferredHours.includes(hour));
    const preferenceScore = (effectiveRules.weekdayPreferencePercents[weekday] ?? 0) + (isHoliday ? effectiveRules.holidayPreferencePercent : 0);
    const rankedHours = sortHoursAscending(preferredHours.length > 0 ? preferredHours : openHours);
    const extraHours = sortHoursAscending(fallbackHours);
    let selectedHours = [...rankedHours];

    if (selectedHours.length > 0 && preferenceScore > 0 && effectiveRules.acceptsPeakTimeAssignments && effectiveRules.acceptsTemporaryAssignments) {
      const extraCount = Math.ceil(extraHours.length * Math.min(preferenceScore, 100) / 100);
      selectedHours = sortHoursAscending([...selectedHours, ...extraHours.slice(0, extraCount)]);
    }

    if (selectedHours.length > 0 && preferenceScore < 0) {
      const removeCount = Math.ceil(selectedHours.length * Math.min(Math.abs(preferenceScore), 100) / 100);
      selectedHours = selectedHours.slice(0, Math.max(0, selectedHours.length - removeCount));
    }

    if (!effectiveRules.acceptsPeakTimeAssignments && (policy.weekdayDemandPercents[weekday] ?? 0) > 0) {
      selectedHours = selectedHours.filter((hour) => preferredHours.includes(hour));
    }

    if (!effectiveRules.acceptsTemporaryAssignments && policy.tempTechnicianEnabled && preferredHours.length > 0) {
      selectedHours = selectedHours.filter((hour) => preferredHours.includes(hour));
    }

    const dailyCap = effectiveRules.dailyMaxHours == null
      ? selectedHours.length
      : Math.max(0, effectiveRules.dailyMaxHours);

    return {
      date,
      monthBucketKey: getMonthBucketKey(date, policy.startDate),
      openHours,
      lockedCount,
      preferenceScore,
      preferredHours,
      rankedHours: selectedHours.slice(0, dailyCap),
      weekBucketKey: getWeekBucketKey(date)
    };
  });

  const selectedHoursByDate = new Map<string, number[]>();
  const dateMetaMap = new Map(dateMeta.map((item) => [item.date, item]));
  const groupedByWeek = dateMeta.reduce<Record<string, typeof dateMeta>>((accumulator, item) => {
    accumulator[item.weekBucketKey] = [...(accumulator[item.weekBucketKey] ?? []), item];
    return accumulator;
  }, {});

  Object.values(groupedByWeek).forEach((weekDates) => {
    const openDates = weekDates.filter((item) => item.openHours.length > 0);
    const initialWorkingDays = openDates.filter((item) => item.rankedHours.length > 0).length;
    const maxWorkingDays = effectiveRules.minRestDaysWeek == null
      ? openDates.length
      : clampWithinRange(weekDates.length - effectiveRules.minRestDaysWeek, 0, openDates.length);
    const minWorkingDays = effectiveRules.maxRestDaysWeek == null
      ? 0
      : clampWithinRange(weekDates.length - effectiveRules.maxRestDaysWeek, 0, openDates.length);
    const targetWorkingDays = clampWithinRange(initialWorkingDays, minWorkingDays, maxWorkingDays);
    const rankedDates = [...openDates].sort((left, right) => {
      const leftScore = getDateRankingScore(left);
      const rightScore = getDateRankingScore(right);

      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return left.date.localeCompare(right.date);
    });
    const selectedDateSet = new Set(rankedDates.slice(0, targetWorkingDays).map((item) => item.date));

    weekDates.forEach((item) => {
      selectedHoursByDate.set(item.date, selectedDateSet.has(item.date) ? [...item.rankedHours] : []);
    });
  });

  const groupedByMonth = dateMeta.reduce<Record<string, typeof dateMeta>>((accumulator, item) => {
    accumulator[item.monthBucketKey] = [...(accumulator[item.monthBucketKey] ?? []), item];
    return accumulator;
  }, {});

  Object.values(groupedByMonth).forEach((monthDates) => {
    const openDates = monthDates.filter((item) => item.openHours.length > 0);
    const chosenDates = openDates.filter((item) => (selectedHoursByDate.get(item.date) ?? []).length > 0);
    const maxWorkingDays = effectiveRules.minRestDaysMonth == null
      ? openDates.length
      : clampWithinRange(monthDates.length - effectiveRules.minRestDaysMonth, 0, openDates.length);
    const minWorkingDays = effectiveRules.maxRestDaysMonth == null
      ? 0
      : clampWithinRange(monthDates.length - effectiveRules.maxRestDaysMonth, 0, openDates.length);
    const rankedDates = [...openDates].sort((left, right) => {
      const leftScore = getDateRankingScore(left);
      const rightScore = getDateRankingScore(right);

      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return left.date.localeCompare(right.date);
    });

    if (chosenDates.length > maxWorkingDays) {
      const keepSet = new Set(rankedDates.slice(0, maxWorkingDays).map((item) => item.date));
      chosenDates.forEach((item) => {
        if (!keepSet.has(item.date)) {
          selectedHoursByDate.set(item.date, []);
        }
      });
    }

    if (chosenDates.length < minWorkingDays) {
      rankedDates.forEach((item) => {
        if ((selectedHoursByDate.get(item.date) ?? []).length > 0) {
          return;
        }

        const currentWorkingDays = openDates.filter((candidate) => (selectedHoursByDate.get(candidate.date) ?? []).length > 0).length;

        if (currentWorkingDays >= minWorkingDays) {
          return;
        }

        selectedHoursByDate.set(item.date, [...item.rankedHours]);
      });
    }
  });

  const finalHoursByDate = new Map<string, number[]>();
  const usedWeekHours: Record<string, number> = {};
  const usedMonthHours: Record<string, number> = {};

  dates.forEach((date) => {
    const meta = dateMetaMap.get(date);

    if (!meta) {
      finalHoursByDate.set(date, []);
      return;
    }

    const weekKey = meta.weekBucketKey;
    const monthKey = meta.monthBucketKey;
    const remainingWeekHours = effectiveRules.weeklyMaxHours == null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, effectiveRules.weeklyMaxHours - (usedWeekHours[weekKey] ?? 0));
    const remainingMonthHours = effectiveRules.monthlyMaxHours == null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, effectiveRules.monthlyMaxHours - (usedMonthHours[monthKey] ?? 0));
    const allowedCount = Math.max(
      0,
      Math.min(
        selectedHoursByDate.get(date)?.length ?? 0,
        Number.isFinite(remainingWeekHours) ? remainingWeekHours : Number.MAX_SAFE_INTEGER,
        Number.isFinite(remainingMonthHours) ? remainingMonthHours : Number.MAX_SAFE_INTEGER
      )
    );
    const nextHours = sortHoursAscending((selectedHoursByDate.get(date) ?? []).slice(0, allowedCount));

    finalHoursByDate.set(date, nextHours);
    usedWeekHours[weekKey] = (usedWeekHours[weekKey] ?? 0) + nextHours.length;
    usedMonthHours[monthKey] = (usedMonthHours[monthKey] ?? 0) + nextHours.length;
  });

  const slotMatrix = createEmptySlotMatrix(templateType);
  const datesByTemplateIndex = Array.from({ length: getTemplateDayCount(templateType) }, () => [] as string[]);

  dates.forEach((date) => {
    const dayIndex = getTemplateDayIndex(
      {
        templateType,
        repeatEnabled,
        startDate,
        endDate
      },
      date
    );

    if (dayIndex !== -1) {
      datesByTemplateIndex[dayIndex].push(date);
    }
  });

  datesByTemplateIndex.forEach((mappedDates, dayIndex) => {
    for (let hour = 0; hour < 24; hour += 1) {
      const comparableDates = mappedDates.filter((date) => {
        const slotStatus = resolveStoreSlotStatus({
          policy,
          template: storeTemplate,
          overrides,
          date,
          hour
        });

        return slotStatus !== "closed";
      });

      if (comparableDates.length === 0) {
        continue;
      }

      const activeCount = comparableDates.reduce((count, date) => {
        return count + (finalHoursByDate.get(date)?.includes(hour) ? 1 : 0);
      }, 0);

      slotMatrix[dayIndex][hour] = activeCount >= Math.ceil(comparableDates.length / 2);
    }
  });

  const slotOverrides: GeneratedAvailabilityOverride[] = [];

  dates.forEach((date) => {
    const dayIndex = getTemplateDayIndex(
      {
        templateType,
        repeatEnabled,
        startDate,
        endDate
      },
      date
    );

    if (dayIndex === -1) {
      return;
    }

    const activeHours = toHourSet(finalHoursByDate.get(date) ?? []);

    for (let hour = 0; hour < 24; hour += 1) {
      const slotStatus = resolveStoreSlotStatus({
        policy,
        template: storeTemplate,
        overrides,
        date,
        hour
      });

      if (slotStatus === "closed") {
        continue;
      }

      const matrixActive = Boolean(slotMatrix[dayIndex]?.[hour]);
      const actualActive = activeHours.has(hour);

      if (matrixActive === actualActive) {
        continue;
      }

      slotOverrides.push({
        date,
        hour,
        reason: actualActive ? "一键排班生成保留" : "一键排班生成排除",
        status: actualActive ? "available" : "unavailable"
      });
    }
  });

  const summary: TechnicianAutoGenerateSummary = {
    openSlotCount: dateMeta.reduce((count, item) => count + item.openHours.length, 0),
    lockedSlotCount: dateMeta.reduce((count, item) => count + item.lockedCount, 0),
    generatedAvailableCount: Array.from(finalHoursByDate.values()).reduce((count, hours) => count + hours.length, 0),
    generatedUnavailableCount: Math.max(
      0,
      dateMeta.reduce((count, item) => count + item.openHours.length, 0) - Array.from(finalHoursByDate.values()).reduce((count, hours) => count + hours.length, 0)
    ),
    workingDayCount: Array.from(finalHoursByDate.values()).filter((hours) => hours.length > 0).length,
    restDayCount: dates.length - Array.from(finalHoursByDate.values()).filter((hours) => hours.length > 0).length,
    overrideCount: slotOverrides.length,
    importedTemplateUsed
  };

  return {
    slotMatrix,
    slotOverrides,
    summary
  };
}

export function runAutoConfirm({
  policy,
  storeTemplate,
  responses,
  responseTemplates,
  overrides,
  capacityRules,
  technicians,
  existingShifts,
  busySchedules,
  operatorId,
  now = new Date().toISOString()
}: {
  policy: StoreSchedulePolicy;
  storeTemplate: ScheduleTemplate | null;
  responses: TechnicianScheduleResponse[];
  responseTemplates: ScheduleTemplate[];
  overrides: ScheduleSlotOverride[];
  capacityRules: CapacityRule[];
  technicians: Technician[];
  existingShifts: ConfirmedShift[];
  busySchedules: Schedule[];
  operatorId: string;
  now?: string;
}): AutoConfirmResult {
  const manualShifts = existingShifts.filter((shift) => shift.source === "manual");
  const manualShiftKeySet = new Set(manualShifts.map((shift) => createShiftKey(shift.storeId, shift.technicianId, shift.date, shift.hour)));
  const confirmedHoursMap = getConfirmedHoursMap(manualShifts);
  const lastAssignedTimestampMap = getLastAssignedTimestampMap(manualShifts);
  const responseTemplateMap = new Map(responseTemplates.map((template) => [template.id, template]));
  const confirmed: ConfirmedShift[] = [];
  const waitlisted: ConfirmedShift[] = [];
  const shortage: ShiftShortageSummary[] = [];
  const overflow: ShiftOverflowSummary[] = [];
  const workedDatesByTech = new Map<string, Set<string>>();
  const weekBucketsByTech = new Map<string, Record<string, number>>();
  const monthBucketsByTech = new Map<string, Record<string, number>>();
  const dayHoursByTech = new Map<string, Record<string, number>>();

  manualShifts.forEach((shift) => {
    if (shift.shiftStatus !== "confirmed") {
      return;
    }

    const workedDates = workedDatesByTech.get(shift.technicianId) ?? new Set<string>();
    workedDates.add(shift.date);
    workedDatesByTech.set(shift.technicianId, workedDates);

    const weekKey = getWeekBucketKey(shift.date);
    const monthKey = getMonthBucketKey(shift.date, policy.startDate);
    const dayHours = dayHoursByTech.get(shift.technicianId) ?? {};
    const weekHours = weekBucketsByTech.get(shift.technicianId) ?? {};
    const monthHours = monthBucketsByTech.get(shift.technicianId) ?? {};
    dayHours[shift.date] = (dayHours[shift.date] ?? 0) + 1;
    weekHours[weekKey] = (weekHours[weekKey] ?? 0) + 1;
    monthHours[monthKey] = (monthHours[monthKey] ?? 0) + 1;
    dayHoursByTech.set(shift.technicianId, dayHours);
    weekBucketsByTech.set(shift.technicianId, weekHours);
    monthBucketsByTech.set(shift.technicianId, monthHours);
  });

  const relevantTechnicians = technicians.filter((technician) => policy.appliesToTechnicians.includes(technician.id));
  const responseMap = new Map(responses.map((response) => [response.technicianId, response]));
  const dates = getDateKeysBetween(policy.startDate, policy.endDate);

  dates.forEach((date) => {
    for (let hour = 0; hour < 24; hour += 1) {
      const storeSlotStatus = resolveStoreSlotStatus({
        policy,
        template: storeTemplate,
        overrides,
        date,
        hour
      });

      if (storeSlotStatus === "closed") {
        continue;
      }

      const capacity = getCapacityForHour({
        policy,
        capacityRules,
        date
      });
      const fixedConfirmedCount = manualShifts.filter(
        (shift) => shift.date === date && shift.hour === hour && shift.shiftStatus === "confirmed"
      ).length;
      const fixedWaitlistedCount = manualShifts.filter(
        (shift) => shift.date === date && shift.hour === hour && shift.shiftStatus === "waitlisted"
      ).length;
      const maxConfirmCount = capacity.maxConfirmCount ?? Number.POSITIVE_INFINITY;
      const targetCount = capacity.targetCount;
      const candidateContexts = relevantTechnicians.flatMap((technician) => {
        if (manualShiftKeySet.has(createShiftKey(policy.storeId, technician.id, date, hour))) {
          return [];
        }

        const response = responseMap.get(technician.id) ?? null;
        const responseTemplate = response ? responseTemplateMap.get(response.templateId) ?? null : null;
        const slotStatus = resolveTechnicianSlotStatus({
          policy,
          storeTemplate,
          response,
          responseTemplate,
          overrides,
          date,
          hour
        });

        if (slotStatus !== "available" || !response) {
          return [];
        }

        const effectiveRules = getEffectiveSpecialRules(policy, response);
        const currentDayHours = dayHoursByTech.get(technician.id)?.[date] ?? 0;
        const currentWeekHours = weekBucketsByTech.get(technician.id)?.[getWeekBucketKey(date)] ?? 0;
        const currentMonthHours = monthBucketsByTech.get(technician.id)?.[getMonthBucketKey(date, policy.startDate)] ?? 0;
        const workedDates = workedDatesByTech.get(technician.id) ?? new Set<string>();
        const wouldAddNewWorkedDate = !workedDates.has(date);
        const maxWorkedDaysPerWeek = effectiveRules.minRestDaysWeek == null ? null : Math.max(0, 7 - effectiveRules.minRestDaysWeek);
        const maxWorkedDaysPerMonth = effectiveRules.minRestDaysMonth == null ? null : Math.max(0, 28 - effectiveRules.minRestDaysMonth);
        const weekWorkedDates = new Set(Array.from(workedDates).filter((workedDate) => getWeekBucketKey(workedDate) === getWeekBucketKey(date)));
        const monthWorkedDates = new Set(
          Array.from(workedDates).filter((workedDate) => getMonthBucketKey(workedDate, policy.startDate) === getMonthBucketKey(date, policy.startDate))
        );
        const exceedsDaily = effectiveRules.dailyMaxHours != null && currentDayHours + 1 > effectiveRules.dailyMaxHours;
        const exceedsWeekly = effectiveRules.weeklyMaxHours != null && currentWeekHours + 1 > effectiveRules.weeklyMaxHours;
        const exceedsMonthly = effectiveRules.monthlyMaxHours != null && currentMonthHours + 1 > effectiveRules.monthlyMaxHours;
        const exceedsWeeklyWorkedDays =
          maxWorkedDaysPerWeek != null && wouldAddNewWorkedDate && getDateSetSize(new Set(weekWorkedDates), date) > maxWorkedDaysPerWeek;
        const exceedsMonthlyWorkedDays =
          maxWorkedDaysPerMonth != null && wouldAddNewWorkedDate && getDateSetSize(new Set(monthWorkedDates), date) > maxWorkedDaysPerMonth;
        const busyConflict = hasScheduleConflict(
          busySchedules,
          technician.id,
          date,
          hour,
          effectiveRules.preServiceBufferMinutes,
          effectiveRules.postServiceBufferMinutes
        );

        if (
          exceedsDaily ||
          exceedsWeekly ||
          exceedsMonthly ||
          exceedsWeeklyWorkedDays ||
          exceedsMonthlyWorkedDays ||
          busyConflict
        ) {
          return [];
        }

        return [
          {
            technician,
            response,
            confirmedHours: confirmedHoursMap[technician.id] ?? 0,
            lastAssignedTimestamp: lastAssignedTimestampMap[technician.id] ?? 0,
            responseTimestamp: new Date(response.submittedAt ?? response.updatedAt).getTime()
          }
        ];
      });

      const sortedCandidates = [...candidateContexts].sort((left, right) => compareByPriorityRules(left, right, policy.priorityRules));
      const remainingCapacity = Math.max(0, maxConfirmCount - fixedConfirmedCount);
      const confirmedCandidates = sortedCandidates.slice(0, remainingCapacity);
      const waitlistedCandidates = maxConfirmCount === Number.POSITIVE_INFINITY ? [] : sortedCandidates.slice(remainingCapacity);

      confirmedCandidates.forEach((candidate) => {
        const shift: ConfirmedShift = {
          id: `shift-${candidate.technician.id}-${date}-${hour}`,
          storeId: policy.storeId,
          technicianId: candidate.technician.id,
          policyId: policy.id,
          date,
          hour,
          shiftStatus: "confirmed",
          source: "auto",
          ruleSnapshot: `target=${targetCount ?? "inf"} max=${maxConfirmCount === Number.POSITIVE_INFINITY ? "inf" : maxConfirmCount} demand=${capacity.demandFactor.toFixed(2)}`,
          confirmedAt: now,
          confirmedBy: operatorId
        };

        confirmed.push(shift);
        confirmedHoursMap[candidate.technician.id] = (confirmedHoursMap[candidate.technician.id] ?? 0) + 1;
        lastAssignedTimestampMap[candidate.technician.id] = createTimestamp(date, hour);
        const workedDates = workedDatesByTech.get(candidate.technician.id) ?? new Set<string>();
        workedDates.add(date);
        workedDatesByTech.set(candidate.technician.id, workedDates);
        const dayHours = dayHoursByTech.get(candidate.technician.id) ?? {};
        const weekHours = weekBucketsByTech.get(candidate.technician.id) ?? {};
        const monthHours = monthBucketsByTech.get(candidate.technician.id) ?? {};
        dayHours[date] = (dayHours[date] ?? 0) + 1;
        weekHours[getWeekBucketKey(date)] = (weekHours[getWeekBucketKey(date)] ?? 0) + 1;
        monthHours[getMonthBucketKey(date, policy.startDate)] = (monthHours[getMonthBucketKey(date, policy.startDate)] ?? 0) + 1;
        dayHoursByTech.set(candidate.technician.id, dayHours);
        weekBucketsByTech.set(candidate.technician.id, weekHours);
        monthBucketsByTech.set(candidate.technician.id, monthHours);
      });

      waitlistedCandidates.forEach((candidate) => {
        waitlisted.push({
          id: `waitlist-${candidate.technician.id}-${date}-${hour}`,
          storeId: policy.storeId,
          technicianId: candidate.technician.id,
          policyId: policy.id,
          date,
          hour,
          shiftStatus: "waitlisted",
          source: "auto",
          ruleSnapshot: `overflow max=${maxConfirmCount === Number.POSITIVE_INFINITY ? "inf" : maxConfirmCount}`,
          confirmedAt: now,
          confirmedBy: operatorId
        });
      });

      const totalConfirmedCount = fixedConfirmedCount + confirmedCandidates.length;
      const totalAvailableCount = sortedCandidates.length + fixedConfirmedCount;

      if (targetCount != null && totalConfirmedCount < targetCount) {
        shortage.push({
          date,
          hour,
          targetCount,
          confirmedCount: totalConfirmedCount,
          availableCount: totalAvailableCount,
          missingCount: targetCount - totalConfirmedCount
        });
      }

      if (Number.isFinite(maxConfirmCount) && totalAvailableCount > maxConfirmCount) {
        overflow.push({
          date,
          hour,
          maxConfirmCount,
          availableCount: totalAvailableCount,
          waitlistCount: waitlistedCandidates.length + fixedWaitlistedCount
        });
      }
    }
  });

  const notifications: NotificationTask[] = [
    createNotification({
      targetType: "store",
      targetId: policy.storeId,
      storeId: policy.storeId,
      policyId: policy.id,
      notificationType: "auto_confirm_completed",
      payload: `一键确认完成：已确认 ${confirmed.length} 小时格，候补 ${waitlisted.length} 小时格。`,
      scheduledAt: now
    }),
    ...shortage.slice(0, 12).map((item) =>
      createNotification({
        targetType: "store",
        targetId: policy.storeId,
        storeId: policy.storeId,
        policyId: policy.id,
        notificationType: "shortage_detected",
        payload: `${item.date} ${formatHourLabel(item.hour)} 仍缺 ${item.missingCount} 人。`,
        scheduledAt: now
      })
    ),
    ...overflow.slice(0, 12).map((item) =>
      createNotification({
        targetType: "store",
        targetId: policy.storeId,
        storeId: policy.storeId,
        policyId: policy.id,
        notificationType: "overflow_detected",
        payload: `${item.date} ${formatHourLabel(item.hour)} 超额报名 ${Math.max(0, item.availableCount - item.maxConfirmCount)} 人。`,
        scheduledAt: now
      })
    )
  ];

  return {
    confirmed,
    waitlisted,
    shortage,
    overflow,
    notifications,
    summary: {
      confirmedCount: confirmed.length,
      waitlistedCount: waitlisted.length,
      shortageCount: shortage.length,
      overflowCount: overflow.length,
      shortageHours: shortage.reduce((sum, item) => sum + item.missingCount, 0),
      overflowHours: overflow.reduce((sum, item) => sum + item.waitlistCount, 0)
    }
  };
}
