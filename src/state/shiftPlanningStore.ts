import { useSyncExternalStore } from "react";
import { getEntityStoreSnapshot } from "./entityStore";
import { getScheduleStoreSnapshot } from "./scheduleStore";
import {
  buildFinalBookableSlotsForTechnician,
  createDefaultStoreScheduleModeConfirmRules,
  createDefaultStoreScheduleModeSelfRules,
  createDefaultTechnicianSpecialRules,
  createEmptySlotMatrix,
  getActivePolicyForStore,
  getDateKeysBetween,
  getTemplateCycleLength,
  runAutoConfirm
} from "../lib/shiftPlanning";
import type {
  CapacityRule,
  ConfirmedShift,
  FinalBookableSlot,
  NotificationTask,
  PriorityRule,
  ScheduleSlotOverride,
  ScheduleTemplate,
  ShiftTemplateType,
  StoreScheduleMode,
  StoreScheduleModeConfig,
  StorePlanningStatus,
  StoreSchedulePolicy,
  TechnicianScheduleResponse,
  TechnicianSpecialRules
} from "../types/shiftPlanning";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

type ShiftPlanningState = {
  modeConfigs: StoreScheduleModeConfig[];
  policies: StoreSchedulePolicy[];
  templates: ScheduleTemplate[];
  slotOverrides: ScheduleSlotOverride[];
  responses: TechnicianScheduleResponse[];
  confirmedShifts: ConfirmedShift[];
  finalBookableSlots: FinalBookableSlot[];
  capacityRules: CapacityRule[];
  notifications: NotificationTask[];
};

type ShiftPlanningSnapshot = ShiftPlanningState & {
  revision: number;
};

export type StorePlanningDraftInput = {
  policyId?: string | null;
  storeId: string;
  appliesToTechnicians: string[];
  templateType: ShiftTemplateType;
  importSource: StoreSchedulePolicy["importSource"];
  repeatEnabled: boolean;
  startDate: string;
  endDate: string;
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
  feedbackDeadlineAt: string | null;
  forceInheritedRules: StoreSchedulePolicy["forceInheritedRules"];
  slotMatrix: ScheduleTemplate["slotMatrix"];
  capacityRules: CapacityRule[];
};

export type TechnicianResponseDraftInput = {
  policyId: string;
  storeId: string;
  technicianId: string;
  templateType: ShiftTemplateType;
  importSource: ScheduleTemplate["importSource"];
  repeatEnabled: boolean;
  startDate: string;
  endDate: string;
  slotMatrix: ScheduleTemplate["slotMatrix"];
  specialRules: TechnicianSpecialRules;
  slotOverrides: Array<{
    date: string;
    hour: number;
    status: Extract<ScheduleSlotOverride["status"], "available" | "unavailable">;
    reason: string;
  }>;
};

export type StoreScheduleModeSwitchInput = {
  storeId: string;
  mode: StoreScheduleMode;
  effectiveFrom: string;
  reason: string;
  actorId: string;
  selfModeRules: StoreScheduleModeConfig["selfModeRules"];
  confirmModeRules: StoreScheduleModeConfig["confirmModeRules"];
};

const storageKey = "needo.shift-planning.v2";
const listeners = new Set<() => void>();

let hydrated = false;
let storageListenerBound = false;
let revision = 0;
let cachedSnapshot: ShiftPlanningSnapshot | null = null;

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createWeeklyMatrix(input: { weekdayHours: Array<[number, number]>; weekendHours: Array<[number, number]> }) {
  const matrix = createEmptySlotMatrix("week");

  matrix.forEach((row, dayIndex) => {
    const isWeekend = dayIndex >= 5;
    const source = isWeekend ? input.weekendHours : input.weekdayHours;

    source.forEach(([startHour, endHour]) => {
      for (let hour = startHour; hour < endHour; hour += 1) {
        row[hour] = true;
      }
    });
  });

  return matrix;
}

function createMonthMatrix() {
  const matrix = createEmptySlotMatrix("month");

  matrix.forEach((row, dayIndex) => {
    const weekday = (dayIndex % 7) + 1;
    const isWeekend = weekday >= 6;
    const start = isWeekend ? 12 : 11;
    const end = isWeekend ? 20 : 21;

    for (let hour = start; hour < end; hour += 1) {
      row[hour] = true;
    }
  });

  return matrix;
}

function createDayMatrix(startHour: number, endHour: number) {
  const matrix = createEmptySlotMatrix("day");

  for (let hour = startHour; hour < endHour; hour += 1) {
    matrix[0][hour] = true;
  }

  return matrix;
}

function createNotificationSeed(
  input: Omit<NotificationTask, "id" | "status">
): NotificationTask {
  return {
    ...input,
    id: createId("notify"),
    status: "pending"
  };
}

function toEffectiveDateTime(value: string) {
  if (value.includes("T")) {
    return value;
  }

  return `${value}T00:00:00.000Z`;
}

function rebuildProjectedSlots(nextState: ShiftPlanningState) {
  const entitySnapshot = getEntityStoreSnapshot();
  const scheduleSnapshot = getScheduleStoreSnapshot();

  nextState.finalBookableSlots = entitySnapshot.technicians.flatMap((technician) =>
    buildFinalBookableSlotsForTechnician({
      technician,
      modeConfigs: nextState.modeConfigs,
      policies: nextState.policies,
      templates: nextState.templates,
      overrides: nextState.slotOverrides,
      responses: nextState.responses,
      confirmedShifts: nextState.confirmedShifts,
      busySchedules: scheduleSnapshot.schedules,
      atDate: new Date().toISOString()
    })
  );
}

function buildDefaultState(): ShiftPlanningState {
  const entitySnapshot = getEntityStoreSnapshot();
  const storeId = "store-1";
  const appliesToTechnicians = entitySnapshot.technicians.filter((technician) => technician.storeId === storeId).slice(0, 6).map((technician) => technician.id);
  const now = "2026-04-17T09:00:00.000Z";
  const previousPolicyId = "policy-store-1-previous";
  const currentPolicyId = "policy-store-1-current";
  const previousStoreTemplateId = "template-store-1-previous";
  const currentStoreTemplateId = "template-store-1-current";
  const previousPolicy: StoreSchedulePolicy = {
    id: previousPolicyId,
    storeId,
    appliesToTechnicians,
    templateType: "month",
    importSource: null,
    repeatEnabled: true,
    startDate: "2026-03-16",
    endDate: "2026-04-12",
    holidayDemandPercent: 15,
    weekdayDemandPercents: { 5: 10, 6: 20 },
    dailyMaxHours: 8,
    weeklyMaxHours: 40,
    monthlyMaxHours: 140,
    unlimitedMaxHours: false,
    minRestDaysWeek: 1,
    maxRestDaysWeek: 3,
    minRestDaysMonth: 6,
    maxRestDaysMonth: 12,
    preServiceBufferMinutes: 15,
    postServiceBufferMinutes: 15,
    overbookingNotifyEnabled: true,
    overbookingThreshold: 2,
    tempTechnicianEnabled: false,
    tempTechnicianConfig: "",
    lowBookingRestNotifyEnabled: true,
    lowBookingThreshold: 1,
    discountPushEnabled: true,
    discountTemplate: "周中低峰 95 折",
    priorityRules: [
      { id: "priority-hours", type: "currentConfirmedHoursLess", label: "当前周期工时更少优先", weight: 1, enabled: true },
      { id: "priority-early", type: "earliestResponse", label: "反馈更早优先", weight: 2, enabled: true },
      { id: "priority-id", type: "technicianId", label: "技师 ID 稳定排序", weight: 3, enabled: true }
    ],
    defaultCapacityPerHour: 2,
    defaultMaxConfirmPerHour: 3,
    feedbackDeadlineAt: "2026-03-15T12:00:00.000Z",
    forceInheritedRules: ["hourLimits", "buffers"],
    publishedAt: "2026-03-10T10:00:00.000Z",
    status: "confirmed",
    createdAt: "2026-03-10T10:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z"
  };
  const currentPolicy: StoreSchedulePolicy = {
    id: currentPolicyId,
    storeId,
    appliesToTechnicians,
    templateType: "week",
    importSource: "previous_month",
    repeatEnabled: true,
    startDate: "2026-04-20",
    endDate: "2026-05-31",
    holidayDemandPercent: 20,
    weekdayDemandPercents: { 1: -10, 5: 15, 6: 20 },
    dailyMaxHours: 8,
    weeklyMaxHours: 42,
    monthlyMaxHours: 160,
    unlimitedMaxHours: false,
    minRestDaysWeek: 1,
    maxRestDaysWeek: 3,
    minRestDaysMonth: 6,
    maxRestDaysMonth: 12,
    preServiceBufferMinutes: 20,
    postServiceBufferMinutes: 15,
    overbookingNotifyEnabled: true,
    overbookingThreshold: 2,
    tempTechnicianEnabled: true,
    tempTechnicianConfig: "优先通知夜班临时技师群组",
    lowBookingRestNotifyEnabled: true,
    lowBookingThreshold: 1,
    discountPushEnabled: true,
    discountTemplate: "平日午间加钟优惠",
    priorityRules: [
      { id: "priority-tech", type: "technician", label: "指定技师优先", weight: 1, enabled: true, technicianIds: appliesToTechnicians.slice(0, 2) },
      { id: "priority-tag", type: "tag", label: "中文 / 外国人対応优先", weight: 2, enabled: true, values: ["🀄 中文", "外国人対応"] },
      { id: "priority-hours-current", type: "currentConfirmedHoursLess", label: "当前周期已确认工时更少优先", weight: 3, enabled: true },
      { id: "priority-last", type: "longestSinceLastAssigned", label: "最近一次被排班更久者优先", weight: 4, enabled: true },
      { id: "priority-response", type: "earliestResponse", label: "响应更早者优先", weight: 5, enabled: true },
      { id: "priority-id-current", type: "technicianId", label: "技师 ID 稳定排序", weight: 6, enabled: true }
    ],
    defaultCapacityPerHour: 2,
    defaultMaxConfirmPerHour: 3,
    feedbackDeadlineAt: "2026-04-19T12:00:00.000Z",
    forceInheritedRules: ["hourLimits", "buffers"],
    publishedAt: "2026-04-17T09:00:00.000Z",
    status: "opened",
    createdAt: now,
    updatedAt: now
  };

  const modeConfigs: StoreScheduleModeConfig[] = [
    {
      id: "mode-store-1-default",
      storeId,
      mode: "STORE_CONFIRM_REQUIRED",
      scopeType: "global",
      scopeValue: null,
      effectiveFrom: "2026-04-17T09:00:00.000Z",
      effectiveTo: null,
      status: "active",
      selfModeRules: {
        ...createDefaultStoreScheduleModeSelfRules(),
        freezeBeforeStartMinutes: 180
      },
      confirmModeRules: {
        ...createDefaultStoreScheduleModeConfirmRules(),
        feedbackDeadlineAt: currentPolicy.feedbackDeadlineAt
      },
      version: 1,
      reason: "默认沿用旧版店铺确认流程",
      createdBy: storeId,
      updatedBy: storeId,
      createdAt: now,
      updatedAt: now
    }
  ];

  const templates: ScheduleTemplate[] = [
    {
      id: previousStoreTemplateId,
      ownerType: "store",
      ownerId: storeId,
      targetStoreId: storeId,
      policyId: previousPolicyId,
      templateType: "month",
      cycleLength: getTemplateCycleLength("month"),
      slotMatrix: createMonthMatrix(),
      repeatEnabled: true,
      startDate: previousPolicy.startDate,
      endDate: previousPolicy.endDate,
      importSource: null,
      version: 1,
      status: "published",
      createdAt: previousPolicy.createdAt,
      updatedAt: previousPolicy.updatedAt
    },
    {
      id: currentStoreTemplateId,
      ownerType: "store",
      ownerId: storeId,
      targetStoreId: storeId,
      policyId: currentPolicyId,
      templateType: "week",
      cycleLength: getTemplateCycleLength("week"),
      slotMatrix: createWeeklyMatrix({
        weekdayHours: [[10, 14], [16, 22]],
        weekendHours: [[12, 20]]
      }),
      repeatEnabled: true,
      startDate: currentPolicy.startDate,
      endDate: currentPolicy.endDate,
      importSource: "previous_month",
      version: 2,
      status: "published",
      createdAt: currentPolicy.createdAt,
      updatedAt: currentPolicy.updatedAt
    }
  ];

  const technicianTemplates: ScheduleTemplate[] = [
    {
      id: "template-tech-1-current",
      ownerType: "technician",
      ownerId: appliesToTechnicians[0],
      targetStoreId: storeId,
      policyId: currentPolicyId,
      templateType: "week",
      cycleLength: getTemplateCycleLength("week"),
      slotMatrix: createWeeklyMatrix({
        weekdayHours: [[10, 18]],
        weekendHours: [[12, 18]]
      }),
      repeatEnabled: true,
      startDate: currentPolicy.startDate,
      endDate: currentPolicy.endDate,
      importSource: "previous_week",
      version: 1,
      status: "published",
      createdAt: now,
      updatedAt: "2026-04-17T09:30:00.000Z"
    },
    {
      id: "template-tech-4-current",
      ownerType: "technician",
      ownerId: appliesToTechnicians[1],
      targetStoreId: storeId,
      policyId: currentPolicyId,
      templateType: "week",
      cycleLength: getTemplateCycleLength("week"),
      slotMatrix: createWeeklyMatrix({
        weekdayHours: [[12, 20]],
        weekendHours: [[14, 20]]
      }),
      repeatEnabled: true,
      startDate: currentPolicy.startDate,
      endDate: currentPolicy.endDate,
      importSource: "last_same_type",
      version: 2,
      status: "published",
      createdAt: now,
      updatedAt: "2026-04-17T10:00:00.000Z"
    },
    {
      id: "template-tech-8-current",
      ownerType: "technician",
      ownerId: appliesToTechnicians[2],
      targetStoreId: storeId,
      policyId: currentPolicyId,
      templateType: "month",
      cycleLength: getTemplateCycleLength("month"),
      slotMatrix: createMonthMatrix(),
      repeatEnabled: true,
      startDate: currentPolicy.startDate,
      endDate: currentPolicy.endDate,
      importSource: "previous_month",
      version: 1,
      status: "published",
      createdAt: now,
      updatedAt: "2026-04-17T10:20:00.000Z"
    },
    {
      id: "template-tech-12-current",
      ownerType: "technician",
      ownerId: appliesToTechnicians[3],
      targetStoreId: storeId,
      policyId: currentPolicyId,
      templateType: "day",
      cycleLength: getTemplateCycleLength("day"),
      slotMatrix: createDayMatrix(18, 23),
      repeatEnabled: true,
      startDate: currentPolicy.startDate,
      endDate: currentPolicy.endDate,
      importSource: "previous_day",
      version: 1,
      status: "published",
      createdAt: now,
      updatedAt: "2026-04-17T11:00:00.000Z"
    }
  ];

  const slotOverrides: ScheduleSlotOverride[] = [
    {
      id: "override-store-1-current-1",
      ownerType: "store",
      ownerId: storeId,
      targetStoreId: storeId,
      policyId: currentPolicyId,
      date: "2026-04-24",
      hour: 19,
      status: "locked",
      reason: "包厢维护",
      sourceType: "locked",
      createdAt: now
    },
    {
      id: "override-tech-1-current-1",
      ownerType: "technician",
      ownerId: appliesToTechnicians[0],
      targetStoreId: storeId,
      policyId: currentPolicyId,
      date: "2026-04-28",
      hour: 14,
      status: "unavailable",
      reason: "医院复诊",
      sourceType: "manual",
      createdAt: now
    },
    {
      id: "override-tech-4-current-1",
      ownerType: "technician",
      ownerId: appliesToTechnicians[1],
      targetStoreId: storeId,
      policyId: currentPolicyId,
      date: "2026-04-30",
      hour: 20,
      status: "available",
      reason: "愿意加班",
      sourceType: "manual",
      createdAt: now
    }
  ];

  const responses: TechnicianScheduleResponse[] = [
    {
      id: "response-tech-1-current",
      technicianId: appliesToTechnicians[0],
      storeId,
      policyId: currentPolicyId,
      periodStart: currentPolicy.startDate,
      periodEnd: currentPolicy.endDate,
      responseStatus: "submitted",
      submittedAt: "2026-04-17T09:30:00.000Z",
      updatedAt: "2026-04-17T09:30:00.000Z",
      templateId: "template-tech-1-current",
      slotOverrideIds: ["override-tech-1-current-1"],
      specialRules: {
        ...createDefaultTechnicianSpecialRules(),
        holidayPreferencePercent: 10,
        dailyMaxHours: 7
      },
      version: 1
    },
    {
      id: "response-tech-4-current",
      technicianId: appliesToTechnicians[1],
      storeId,
      policyId: currentPolicyId,
      periodStart: currentPolicy.startDate,
      periodEnd: currentPolicy.endDate,
      responseStatus: "updated",
      submittedAt: "2026-04-17T09:40:00.000Z",
      updatedAt: "2026-04-17T10:05:00.000Z",
      templateId: "template-tech-4-current",
      slotOverrideIds: ["override-tech-4-current-1"],
      specialRules: {
        ...createDefaultTechnicianSpecialRules(),
        weekdayPreferencePercents: { 5: 10 },
        preServiceBufferMinutes: 10
      },
      version: 2
    },
    {
      id: "response-tech-8-current",
      technicianId: appliesToTechnicians[2],
      storeId,
      policyId: currentPolicyId,
      periodStart: currentPolicy.startDate,
      periodEnd: currentPolicy.endDate,
      responseStatus: "submitted",
      submittedAt: "2026-04-17T10:20:00.000Z",
      updatedAt: "2026-04-17T10:20:00.000Z",
      templateId: "template-tech-8-current",
      slotOverrideIds: [],
      specialRules: {
        ...createDefaultTechnicianSpecialRules(),
        minRestDaysWeek: 2
      },
      version: 1
    }
  ];

  const previousConfirmedShifts: ConfirmedShift[] = getDateKeysBetween(previousPolicy.startDate, "2026-03-23").flatMap((date, index) =>
    appliesToTechnicians.slice(0, 2).map((technicianId, techIndex) => ({
      id: `shift-prev-${technicianId}-${date}-${techIndex}`,
      storeId,
      technicianId,
      policyId: previousPolicyId,
      date,
      hour: 11 + ((index + techIndex) % 6),
      shiftStatus: "confirmed" as const,
      source: "auto" as const,
      ruleSnapshot: "历史确认",
      confirmedAt: "2026-03-15T18:00:00.000Z",
      confirmedBy: "system"
    }))
  );

  const capacityRules: CapacityRule[] = [
    {
      id: "capacity-global-current",
      storeId,
      policyId: currentPolicyId,
      scopeType: "global",
      scopeValue: "default",
      targetCount: 2,
      maxConfirmCount: 3
    },
    {
      id: "capacity-friday-current",
      storeId,
      policyId: currentPolicyId,
      scopeType: "weekday",
      scopeValue: "5",
      targetCount: 4,
      maxConfirmCount: 5
    },
    {
      id: "capacity-holiday-current",
      storeId,
      policyId: currentPolicyId,
      scopeType: "holiday",
      scopeValue: "1",
      targetCount: 5,
      maxConfirmCount: 6
    },
    {
      id: "capacity-0505-current",
      storeId,
      policyId: currentPolicyId,
      scopeType: "date",
      scopeValue: "2026-05-05",
      targetCount: 6,
      maxConfirmCount: 8
    }
  ];

  const notifications: NotificationTask[] = [
    createNotificationSeed({
      targetType: "technician",
      targetId: appliesToTechnicians[0],
      storeId,
      policyId: currentPolicyId,
      notificationType: "store_opened_period",
      payload: "门店已开放 4/20 - 5/31 可排班反馈，请在截止前提交。",
      scheduledAt: "2026-04-17T09:00:00.000Z"
    }),
    createNotificationSeed({
      targetType: "technician",
      targetId: appliesToTechnicians[1],
      storeId,
      policyId: currentPolicyId,
      notificationType: "store_opened_period",
      payload: "门店已开放 4/20 - 5/31 可排班反馈，请在截止前提交。",
      scheduledAt: "2026-04-17T09:00:00.000Z"
    }),
    createNotificationSeed({
      targetType: "store",
      targetId: storeId,
      storeId,
      policyId: currentPolicyId,
      notificationType: "technician_submitted_response",
      payload: "Mia 已提交当前周期排班反馈。",
      scheduledAt: "2026-04-17T09:30:00.000Z"
    }),
    createNotificationSeed({
      targetType: "store",
      targetId: storeId,
      storeId,
      policyId: currentPolicyId,
      notificationType: "technician_updated_response",
      payload: "高桥 莉子 已更新当前周期排班反馈。",
      scheduledAt: "2026-04-17T10:05:00.000Z"
    })
  ];

  const nextState: ShiftPlanningState = {
    modeConfigs,
    policies: [previousPolicy, currentPolicy],
    templates: [...templates, ...technicianTemplates],
    slotOverrides,
    responses,
    confirmedShifts: previousConfirmedShifts,
    finalBookableSlots: [],
    capacityRules,
    notifications
  };

  rebuildProjectedSlots(nextState);
  return nextState;
}

const defaultState = buildDefaultState();
const state: ShiftPlanningState = cloneValue(defaultState);

function persist() {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(storageKey, JSON.stringify(state), { silent: true });
}

function emitUpdate() {
  revision += 1;
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function notify() {
  persist();
  emitUpdate();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    hydrated = true;
    return;
  }

  hydrated = true;
  bindStorageListener();
  const raw = readBrowserStorage(storageKey, { silent: true });

  if (!raw) {
    persist();
    return;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ShiftPlanningState>;
    state.modeConfigs = Array.isArray(parsed.modeConfigs) ? parsed.modeConfigs : cloneValue(defaultState.modeConfigs);
    state.policies = Array.isArray(parsed.policies) ? parsed.policies : cloneValue(defaultState.policies);
    state.templates = Array.isArray(parsed.templates) ? parsed.templates : cloneValue(defaultState.templates);
    state.slotOverrides = Array.isArray(parsed.slotOverrides) ? parsed.slotOverrides : cloneValue(defaultState.slotOverrides);
    state.responses = Array.isArray(parsed.responses) ? parsed.responses : cloneValue(defaultState.responses);
    state.confirmedShifts = Array.isArray(parsed.confirmedShifts) ? parsed.confirmedShifts : cloneValue(defaultState.confirmedShifts);
    state.finalBookableSlots = Array.isArray(parsed.finalBookableSlots) ? parsed.finalBookableSlots : cloneValue(defaultState.finalBookableSlots);
    state.capacityRules = Array.isArray(parsed.capacityRules) ? parsed.capacityRules : cloneValue(defaultState.capacityRules);
    state.notifications = Array.isArray(parsed.notifications) ? parsed.notifications : cloneValue(defaultState.notifications);
  } catch {
    persist();
  }
}

function bindStorageListener() {
  if (storageListenerBound || typeof window === "undefined") {
    return;
  }

  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage || event.key !== storageKey) {
      return;
    }

    hydrated = false;
    hydrate();
    emitUpdate();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ShiftPlanningSnapshot {
  hydrate();

  if (cachedSnapshot && cachedSnapshot.revision === revision) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    modeConfigs: state.modeConfigs,
    policies: state.policies,
    templates: state.templates,
    slotOverrides: state.slotOverrides,
    responses: state.responses,
    confirmedShifts: state.confirmedShifts,
    finalBookableSlots: state.finalBookableSlots,
    capacityRules: state.capacityRules,
    notifications: state.notifications,
    revision
  };

  return cachedSnapshot;
}

function replaceArrayItem<T extends { id: string }>(collection: T[], nextItem: T) {
  const nextIndex = collection.findIndex((item) => item.id === nextItem.id);

  if (nextIndex === -1) {
    collection.push(nextItem);
    return;
  }

  collection[nextIndex] = nextItem;
}

function getStoreTemplate(policyId: string) {
  return state.templates.find((template) => template.ownerType === "store" && template.policyId === policyId) ?? null;
}

function upsertNotifications(nextNotifications: NotificationTask[]) {
  if (nextNotifications.length === 0) {
    return;
  }

  state.notifications = [...nextNotifications, ...state.notifications];
}

export function useShiftPlanningStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getShiftPlanningStoreSnapshot() {
  return getSnapshot();
}

export function upsertStorePlanningCycle(input: StorePlanningDraftInput) {
  hydrate();
  const now = new Date().toISOString();
  const existingPolicy = input.policyId ? state.policies.find((policy) => policy.id === input.policyId) ?? null : null;
  const policyId = existingPolicy?.id ?? createId("policy");
  const nextPolicy: StoreSchedulePolicy = {
    id: policyId,
    storeId: input.storeId,
    appliesToTechnicians: [...input.appliesToTechnicians],
    templateType: input.templateType,
    importSource: input.importSource,
    repeatEnabled: input.repeatEnabled,
    startDate: input.startDate,
    endDate: input.endDate,
    holidayDemandPercent: input.holidayDemandPercent,
    weekdayDemandPercents: { ...input.weekdayDemandPercents },
    dailyMaxHours: input.dailyMaxHours,
    weeklyMaxHours: input.weeklyMaxHours,
    monthlyMaxHours: input.monthlyMaxHours,
    unlimitedMaxHours: input.unlimitedMaxHours,
    minRestDaysWeek: input.minRestDaysWeek,
    maxRestDaysWeek: input.maxRestDaysWeek,
    minRestDaysMonth: input.minRestDaysMonth,
    maxRestDaysMonth: input.maxRestDaysMonth,
    preServiceBufferMinutes: input.preServiceBufferMinutes,
    postServiceBufferMinutes: input.postServiceBufferMinutes,
    overbookingNotifyEnabled: input.overbookingNotifyEnabled,
    overbookingThreshold: input.overbookingThreshold,
    tempTechnicianEnabled: input.tempTechnicianEnabled,
    tempTechnicianConfig: input.tempTechnicianConfig,
    lowBookingRestNotifyEnabled: input.lowBookingRestNotifyEnabled,
    lowBookingThreshold: input.lowBookingThreshold,
    discountPushEnabled: input.discountPushEnabled,
    discountTemplate: input.discountTemplate,
    priorityRules: cloneValue(input.priorityRules),
    defaultCapacityPerHour: input.defaultCapacityPerHour,
    defaultMaxConfirmPerHour: input.defaultMaxConfirmPerHour,
    feedbackDeadlineAt: input.feedbackDeadlineAt,
    forceInheritedRules: [...input.forceInheritedRules],
    publishedAt: existingPolicy?.publishedAt ?? null,
    status: existingPolicy?.status ?? "draft",
    createdAt: existingPolicy?.createdAt ?? now,
    updatedAt: now
  };
  const existingTemplate = existingPolicy ? getStoreTemplate(existingPolicy.id) : null;
  const nextTemplate: ScheduleTemplate = {
    id: existingTemplate?.id ?? createId("template"),
    ownerType: "store",
    ownerId: input.storeId,
    targetStoreId: input.storeId,
    policyId,
    templateType: input.templateType,
    cycleLength: getTemplateCycleLength(input.templateType),
    slotMatrix: cloneValue(input.slotMatrix),
    repeatEnabled: input.repeatEnabled,
    startDate: input.startDate,
    endDate: input.endDate,
    importSource: input.importSource,
    version: (existingTemplate?.version ?? 0) + 1,
    status: nextPolicy.status === "draft" ? "draft" : "published",
    createdAt: existingTemplate?.createdAt ?? now,
    updatedAt: now
  };

  replaceArrayItem(state.policies, nextPolicy);
  replaceArrayItem(state.templates, nextTemplate);
  state.capacityRules = [
    ...state.capacityRules.filter((rule) => rule.policyId !== policyId),
    ...input.capacityRules.map((rule) => ({
      ...rule,
      storeId: input.storeId,
      policyId,
      id: rule.id || createId("capacity")
    }))
  ];
  state.modeConfigs = state.modeConfigs.map((config) =>
    config.storeId === input.storeId && config.status !== "archived"
      ? {
          ...config,
          confirmModeRules: {
            ...config.confirmModeRules,
            feedbackDeadlineAt: input.feedbackDeadlineAt
          },
          updatedAt: now
        }
      : config
  );
  rebuildProjectedSlots(state);
  notify();
  return policyId;
}

export function publishStorePlanningCycle(policyId: string, actorId: string) {
  hydrate();
  const policy = state.policies.find((item) => item.id === policyId);

  if (!policy) {
    return;
  }

  const now = new Date().toISOString();
  const nextStatus: StorePlanningStatus = policy.status === "confirmed" || policy.status === "locked" ? "reopened" : "opened";
  policy.status = nextStatus;
  policy.publishedAt = now;
  policy.updatedAt = now;
  const template = getStoreTemplate(policyId);

  if (template) {
    template.status = "published";
    template.updatedAt = now;
  }

  upsertNotifications(
    policy.appliesToTechnicians.map((technicianId) =>
      createNotificationSeed({
        targetType: "technician",
        targetId: technicianId,
        storeId: policy.storeId,
        policyId,
        notificationType: nextStatus === "reopened" ? "store_updated_period" : "store_opened_period",
        payload: nextStatus === "reopened" ? "店铺重新开放了排班周期，请重新确认可排班反馈。" : "店铺已开放新的排班周期，请尽快反馈可排班时段。",
        scheduledAt: now
      })
    )
  );

  upsertNotifications([
    createNotificationSeed({
      targetType: "admin",
      targetId: actorId,
      storeId: policy.storeId,
      policyId,
      notificationType: "store_opened_period",
      payload: "店铺开放排班周期成功，已通知相关技师。",
      scheduledAt: now
    })
  ]);
  rebuildProjectedSlots(state);
  notify();
}

export function lockStorePlanningCycle(policyId: string) {
  hydrate();
  const policy = state.policies.find((item) => item.id === policyId);

  if (!policy) {
    return;
  }

  const now = new Date().toISOString();
  policy.status = "locked";
  policy.updatedAt = now;
  upsertNotifications(
    policy.appliesToTechnicians.map((technicianId) =>
      createNotificationSeed({
        targetType: "technician",
        targetId: technicianId,
        storeId: policy.storeId,
        policyId,
        notificationType: "store_locked_period",
        payload: "店铺已锁定当前排班反馈窗口，后续修改需等待重新开放。",
        scheduledAt: now
      })
    )
  );
  rebuildProjectedSlots(state);
  notify();
}

export function reopenStorePlanningCycle(policyId: string) {
  hydrate();
  const policy = state.policies.find((item) => item.id === policyId);

  if (!policy) {
    return;
  }

  const now = new Date().toISOString();
  policy.status = "reopened";
  policy.updatedAt = now;
  upsertNotifications(
    policy.appliesToTechnicians.map((technicianId) =>
      createNotificationSeed({
        targetType: "technician",
        targetId: technicianId,
        storeId: policy.storeId,
        policyId,
        notificationType: "store_updated_period",
        payload: "店铺已重新开放当前周期，可继续提交或修改排班反馈。",
        scheduledAt: now
      })
    )
  );
  rebuildProjectedSlots(state);
  notify();
}

export function saveTechnicianResponse(input: TechnicianResponseDraftInput) {
  hydrate();
  const now = new Date().toISOString();
  const existingResponse = state.responses.find(
    (response) => response.policyId === input.policyId && response.technicianId === input.technicianId
  ) ?? null;
  const nextTemplateId = existingResponse
    ? state.templates.find((template) => template.id === existingResponse.templateId)?.id ?? createId("template")
    : createId("template");
  const nextTemplate: ScheduleTemplate = {
    id: nextTemplateId,
    ownerType: "technician",
    ownerId: input.technicianId,
    targetStoreId: input.storeId,
    policyId: input.policyId,
    templateType: input.templateType,
    cycleLength: getTemplateCycleLength(input.templateType),
    slotMatrix: cloneValue(input.slotMatrix),
    repeatEnabled: input.repeatEnabled,
    startDate: input.startDate,
    endDate: input.endDate,
    importSource: input.importSource,
    version: (state.templates.find((template) => template.id === nextTemplateId)?.version ?? 0) + 1,
    status: "published",
    createdAt: state.templates.find((template) => template.id === nextTemplateId)?.createdAt ?? now,
    updatedAt: now
  };

  replaceArrayItem(state.templates, nextTemplate);

  const existingOverrideIds = new Set(existingResponse?.slotOverrideIds ?? []);
  state.slotOverrides = state.slotOverrides.filter((override) => !existingOverrideIds.has(override.id));
  const nextOverrides = input.slotOverrides.map((override) => ({
    id: createId("override"),
    ownerType: "technician" as const,
    ownerId: input.technicianId,
    targetStoreId: input.storeId,
    policyId: input.policyId,
    date: override.date,
    hour: override.hour,
    status: override.status,
    reason: override.reason,
    sourceType: "manual" as const,
    createdAt: now
  }));
  state.slotOverrides = [...state.slotOverrides, ...nextOverrides];

  const nextResponse: TechnicianScheduleResponse = {
    id: existingResponse?.id ?? createId("response"),
    technicianId: input.technicianId,
    storeId: input.storeId,
    policyId: input.policyId,
    periodStart: input.startDate,
    periodEnd: input.endDate,
    responseStatus: existingResponse ? "updated" : "submitted",
    submittedAt: existingResponse?.submittedAt ?? now,
    updatedAt: now,
    templateId: nextTemplate.id,
    slotOverrideIds: nextOverrides.map((override) => override.id),
    specialRules: cloneValue(input.specialRules),
    version: (existingResponse?.version ?? 0) + 1
  };

  replaceArrayItem(state.responses, nextResponse);
  const policy = state.policies.find((item) => item.id === input.policyId);

  if (policy) {
    upsertNotifications([
      createNotificationSeed({
        targetType: "store",
        targetId: policy.storeId,
        storeId: policy.storeId,
        policyId: input.policyId,
        notificationType: existingResponse ? "technician_updated_response" : "technician_submitted_response",
        payload: existingResponse ? "技师已更新当前周期排班反馈。" : "技师已提交当前周期排班反馈。",
        scheduledAt: now
      })
    ]);
  }

  rebuildProjectedSlots(state);
  notify();
}

export function runStoreAutoConfirmCycle(policyId: string, operatorId: string) {
  hydrate();
  const policy = state.policies.find((item) => item.id === policyId);
  const storeTemplate = getStoreTemplate(policyId);

  if (!policy || !storeTemplate) {
    return null;
  }

  const entitySnapshot = getEntityStoreSnapshot();
  const scheduleSnapshot = getScheduleStoreSnapshot();
  const result = runAutoConfirm({
    policy,
    storeTemplate,
    responses: state.responses.filter((response) => response.policyId === policyId),
    responseTemplates: state.templates.filter((template) => template.ownerType === "technician" && template.policyId === policyId),
    overrides: state.slotOverrides.filter((override) => override.policyId === policyId),
    capacityRules: state.capacityRules.filter((rule) => !rule.policyId || rule.policyId === policyId),
    technicians: entitySnapshot.technicians.filter((technician) => policy.appliesToTechnicians.includes(technician.id)),
    existingShifts: state.confirmedShifts.filter((shift) => shift.policyId === policyId),
    busySchedules: scheduleSnapshot.schedules.filter((schedule) => policy.appliesToTechnicians.includes(schedule.staffId)),
    operatorId
  });

  const manualShifts = state.confirmedShifts.filter((shift) => shift.policyId === policyId && shift.source === "manual");
  state.confirmedShifts = [
    ...state.confirmedShifts.filter((shift) => shift.policyId !== policyId),
    ...manualShifts,
    ...result.confirmed,
    ...result.waitlisted
  ];
  state.notifications = [...result.notifications, ...state.notifications];
  policy.status = result.summary.shortageCount > 0 ? "partially_confirmed" : "confirmed";
  policy.updatedAt = new Date().toISOString();
  rebuildProjectedSlots(state);
  notify();
  return result;
}

export function manuallyAssignShift({
  policyId,
  technicianId,
  date,
  hour,
  operatorId,
  shiftStatus
}: {
  policyId: string;
  technicianId: string;
  date: string;
  hour: number;
  operatorId: string;
  shiftStatus: ConfirmedShift["shiftStatus"];
}) {
  hydrate();
  const policy = state.policies.find((item) => item.id === policyId);

  if (!policy) {
    return;
  }

  const now = new Date().toISOString();
  state.confirmedShifts = state.confirmedShifts.filter(
    (shift) => !(shift.policyId === policyId && shift.technicianId === technicianId && shift.date === date && shift.hour === hour)
  );
  state.confirmedShifts.push({
    id: createId("shift"),
    storeId: policy.storeId,
    technicianId,
    policyId,
    date,
    hour,
    shiftStatus,
    source: "manual",
    ruleSnapshot: "manual_override",
    confirmedAt: now,
    confirmedBy: operatorId
  });
  policy.status = "partially_confirmed";
  policy.updatedAt = now;
  upsertNotifications([
    createNotificationSeed({
      targetType: "technician",
      targetId: technicianId,
      storeId: policy.storeId,
      policyId,
      notificationType: shiftStatus === "confirmed" ? "shift_confirmed" : "shift_waitlisted",
      payload: shiftStatus === "confirmed" ? `店铺已手动确认 ${date} ${String(hour).padStart(2, "0")}:00 的班次。` : `店铺已将 ${date} ${String(hour).padStart(2, "0")}:00 放入候补。`,
      scheduledAt: now
    })
  ]);
  rebuildProjectedSlots(state);
  notify();
}

export function switchStoreScheduleMode(input: StoreScheduleModeSwitchInput) {
  hydrate();
  const now = new Date().toISOString();
  const effectiveFrom = toEffectiveDateTime(input.effectiveFrom);
  const effectiveTime = new Date(effectiveFrom).getTime();
  const nowTime = new Date(now).getTime();
  const nextStatus: StoreScheduleModeConfig["status"] = effectiveTime > nowTime ? "scheduled" : "active";

  if (nextStatus === "active") {
    state.modeConfigs = state.modeConfigs.map((config) =>
      config.storeId === input.storeId && config.status === "active"
        ? {
            ...config,
            effectiveTo: effectiveFrom,
            status: "archived",
            updatedAt: now,
            updatedBy: input.actorId
          }
        : config
    );
  }

  state.modeConfigs = [
    ...state.modeConfigs,
    {
      id: createId("mode"),
      storeId: input.storeId,
      mode: input.mode,
      scopeType: "global",
      scopeValue: null,
      effectiveFrom,
      effectiveTo: null,
      status: nextStatus,
      selfModeRules: cloneValue(input.selfModeRules),
      confirmModeRules: cloneValue(input.confirmModeRules),
      version: state.modeConfigs.filter((config) => config.storeId === input.storeId).length + 1,
      reason: input.reason,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      createdAt: now,
      updatedAt: now
    }
  ];

  upsertNotifications(
    getEntityStoreSnapshot()
      .technicians.filter((technician) => technician.storeId === input.storeId)
      .map((technician) =>
        createNotificationSeed({
          targetType: "technician",
          targetId: technician.id,
          storeId: input.storeId,
          policyId: null,
          notificationType: "mode_switch_announced",
          payload:
            input.mode === "TECHNICIAN_SELF_FINAL"
              ? "商户已切换为技师自主排班模式，发布后的上班时间会直接进入最终可预约时间。"
              : input.mode === "STORE_DIRECT_ASSIGN"
                ? "商户已切换为商户直接排班模式，正式班表由商户安排；你可以确认收到或申请更改。"
                : "商户已切换为商户确认模式，后续需在开放时段内提交排班反馈并等待确认。",
          scheduledAt: now
        })
      )
  );
  rebuildProjectedSlots(state);
  notify();
}

export function markShiftPlanningNotificationRead(notificationId: string) {
  hydrate();
  const notification = state.notifications.find((item) => item.id === notificationId);

  if (!notification) {
    return;
  }

  notification.status = "read";
  notify();
}

export function syncDispatchProjectionForStore(input: {
  storeId: string;
  mode: "TECH_SELF_FINAL" | "STORE_COLLECT_CONFIRM" | "STORE_ASSIGN_FINAL" | "INDIVIDUAL_SELF_FINAL";
  slots: Array<{
    id: string;
    cycleId: string;
    storeId: string;
    technicianId: string;
    date: string;
    startAt: string;
    endAt: string;
    status: "available" | "booked" | "waitlisted" | "blocked";
    capacity: number;
  }>;
}) {
  hydrate();
  const now = new Date().toISOString();
  const nextMode: StoreScheduleMode =
    input.mode === "TECH_SELF_FINAL"
      ? "TECHNICIAN_SELF_FINAL"
      : input.mode === "STORE_ASSIGN_FINAL"
        ? "STORE_DIRECT_ASSIGN"
        : "STORE_CONFIRM_REQUIRED";
  const activeConfig = state.modeConfigs.find((config) => config.storeId === input.storeId && config.status === "active");

  if (activeConfig) {
    activeConfig.mode = nextMode;
    activeConfig.updatedAt = now;
  } else {
    state.modeConfigs.push({
      id: createId("mode"),
      storeId: input.storeId,
      mode: nextMode,
      scopeType: "global",
      scopeValue: null,
      effectiveFrom: now,
      effectiveTo: null,
      status: "active",
      selfModeRules: createDefaultStoreScheduleModeSelfRules(),
      confirmModeRules: createDefaultStoreScheduleModeConfirmRules(),
      version: 1,
      reason: "dispatch-center compatibility sync",
      createdBy: input.storeId,
      updatedBy: input.storeId,
      createdAt: now,
      updatedAt: now
    });
  }

  state.finalBookableSlots = [
    ...state.finalBookableSlots.filter((slot) => slot.storeId !== input.storeId),
    ...input.slots.map((slot) => {
      const nextStatus: FinalBookableSlot["status"] =
        slot.status === "booked"
          ? "booked"
          : slot.status === "waitlisted"
            ? "held"
            : slot.status === "blocked"
              ? "blocked_by_store"
              : "available";
      const nextContext: FinalBookableSlot["context"] =
        nextMode === "TECHNICIAN_SELF_FINAL"
          ? "STORE_TECH_SELF_FINAL"
          : nextMode === "STORE_DIRECT_ASSIGN"
            ? "STORE_DIRECT_ASSIGN"
            : "STORE_CONFIRM_REQUIRED";
      const nextSourceType: FinalBookableSlot["sourceType"] = nextMode === "TECHNICIAN_SELF_FINAL" ? "technician_published" : "store_confirmed";

      return {
        id: `dispatch-sync-${slot.id}`,
        storeId: slot.storeId,
        technicianId: slot.technicianId,
        policyId: slot.cycleId,
        date: slot.date,
        hour: Number(slot.startAt.slice(11, 13)),
        status: nextStatus,
        context: nextContext,
        sourceType: nextSourceType,
        validationSummary: `dispatch-center:${slot.cycleId}:capacity=${slot.capacity}`,
        updatedAt: now
      } satisfies FinalBookableSlot;
    })
  ];

  notify();
}

export function resetShiftPlanningStore() {
  hydrate();
  state.modeConfigs = cloneValue(defaultState.modeConfigs);
  state.policies = cloneValue(defaultState.policies);
  state.templates = cloneValue(defaultState.templates);
  state.slotOverrides = cloneValue(defaultState.slotOverrides);
  state.responses = cloneValue(defaultState.responses);
  state.confirmedShifts = cloneValue(defaultState.confirmedShifts);
  state.finalBookableSlots = cloneValue(defaultState.finalBookableSlots);
  state.capacityRules = cloneValue(defaultState.capacityRules);
  state.notifications = cloneValue(defaultState.notifications);
  notify();
}

export function ensureStorePlanningCycle(storeId: string) {
  hydrate();
  const existingPolicy = getActivePolicyForStore(storeId, state.policies);
  const existingMode = state.modeConfigs.find((config) => config.storeId === storeId && config.status !== "archived") ?? null;

  if (!existingMode) {
    state.modeConfigs.push({
      id: createId("mode"),
      storeId,
      mode: "STORE_CONFIRM_REQUIRED",
      scopeType: "global",
      scopeValue: null,
      effectiveFrom: new Date().toISOString(),
      effectiveTo: null,
      status: "active",
      selfModeRules: createDefaultStoreScheduleModeSelfRules(),
      confirmModeRules: createDefaultStoreScheduleModeConfirmRules(),
      version: 1,
      reason: "为新店铺补齐默认排班模式",
      createdBy: storeId,
      updatedBy: storeId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  if (existingPolicy) {
    rebuildProjectedSlots(state);
    notify();
    return existingPolicy.id;
  }

  const entitySnapshot = getEntityStoreSnapshot();
  const technicians = entitySnapshot.technicians.filter((technician) => technician.storeId === storeId).slice(0, 6);

  return upsertStorePlanningCycle({
    storeId,
    appliesToTechnicians: technicians.map((technician) => technician.id),
    templateType: "week",
    importSource: null,
    repeatEnabled: true,
    startDate: "2026-04-20",
    endDate: "2026-05-17",
    holidayDemandPercent: 0,
    weekdayDemandPercents: {},
    dailyMaxHours: 8,
    weeklyMaxHours: 40,
    monthlyMaxHours: 160,
    unlimitedMaxHours: false,
    minRestDaysWeek: 1,
    maxRestDaysWeek: 3,
    minRestDaysMonth: 6,
    maxRestDaysMonth: 12,
    preServiceBufferMinutes: 15,
    postServiceBufferMinutes: 15,
    overbookingNotifyEnabled: true,
    overbookingThreshold: 2,
    tempTechnicianEnabled: false,
    tempTechnicianConfig: "",
    lowBookingRestNotifyEnabled: true,
    lowBookingThreshold: 1,
    discountPushEnabled: false,
    discountTemplate: "",
    priorityRules: [
      { id: createId("priority"), type: "currentConfirmedHoursLess", label: "工时更少优先", weight: 1, enabled: true },
      { id: createId("priority"), type: "earliestResponse", label: "反馈更早优先", weight: 2, enabled: true },
      { id: createId("priority"), type: "technicianId", label: "稳定排序", weight: 3, enabled: true }
    ],
    defaultCapacityPerHour: 2,
    defaultMaxConfirmPerHour: 3,
    feedbackDeadlineAt: null,
    forceInheritedRules: ["hourLimits"],
    slotMatrix: createWeeklyMatrix({
      weekdayHours: [[10, 14], [16, 22]],
      weekendHours: [[12, 20]]
    }),
    capacityRules: [
      {
        id: createId("capacity"),
        storeId,
        policyId: null,
        scopeType: "global",
        scopeValue: "default",
        targetCount: 2,
        maxConfirmCount: 3
      }
    ]
  });
}
