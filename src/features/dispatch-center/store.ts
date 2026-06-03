import { useSyncExternalStore } from "react";
import { fieldJobs, orders } from "../../data/mock";
import {
  buildDemoAppointmentDispatchArrangements,
  demoAppointmentSeedStoreId
} from "../../data/demoAppointmentSeeds";
import { getEntityStoreSnapshot } from "../../state/entityStore";
import { addSharedSchedules, getScheduleStoreSnapshot, removeSharedSchedule } from "../../state/scheduleStore";
import { syncDispatchProjectionForStore } from "../../state/shiftPlanningStore";
import { buildCapacityForSlot } from "../../lib/scheduling/capacityEngine";
import { promoteDispatchCycles, summarizeCycleLimits } from "../../lib/scheduling/cyclePromotion";
import { rankDispatchCandidates } from "../../lib/scheduling/priorityEngine";
import { SmartScheduleEngine } from "../../lib/scheduling/smartScheduleEngine";
import { getNeedoAppBookingTitle } from "../../lib/scheduleBookingTitle";
import {
  addDays,
  addMinutes,
  buildEmptyTemplateMatrix,
  createDispatchId,
  dispatchReferenceDateKey,
  dispatchReferenceNow,
  enumerateDateKeys,
  getArrangementStatusLabel,
  getCycleModeLabel,
  getCycleStatusLabel,
  getFeedbackStatusLabel,
  getFinalShiftStatusLabel,
  getModeNeedsFeedback,
  getServiceModeLabel,
  getStepLabel,
  getTemplateDayLabel,
  getTemplateRowWeekday,
  getWeekday,
  parseDateKey,
  timeToMinutes,
  toIsoAtHour,
  type DispatchArrangement,
  type DispatchAuditLog,
  type DispatchBookableSlot,
  type DispatchCandidate,
  type DispatchContactGroup,
  type DispatchCycle,
  type DispatchFeedbackEntry,
  type DispatchFinalShift,
  type DispatchFloatingTask,
  type DispatchGridView,
  type DispatchHolidayRule,
  type DispatchServiceMode,
  type DispatchSpecialTask,
  type ScheduleAutomationPolicy,
  type ScheduleDemandForecast,
  type ScheduleExceptionQueueItem,
  type ScheduleOptimizationRun,
  type ScheduleRecommendation,
  type SmartScheduleReadiness,
  type SmartScheduleAutomationLevel,
  type SmartScheduleBillingStatus,
  type SmartScheduleRunType,
  type SmartScheduleColdStartStatus,
  type SmartScheduleDataSource,
  type SmartScheduleDataSourceType,
  type SmartScheduleDecision,
  type SmartScheduleManualOverride,
  type SmartScheduleRuleExplanation,
  type SmartScheduleSignal,
  type TechnicianSchedulePreference
} from "./domain";
import { readBrowserStorage, writeBrowserStorage } from "../../lib/browserStorage";
import type { ScheduleDetailTargetType, ScheduleEventType } from "../../lib/scheduleDetailTarget";

type DispatchCenterState = {
  cycles: DispatchCycle[];
  feedbacks: DispatchFeedbackEntry[];
  finalShifts: DispatchFinalShift[];
  finalBookableSlots: DispatchBookableSlot[];
  arrangements: DispatchArrangement[];
  specialTasks: DispatchSpecialTask[];
  floatingTasks: DispatchFloatingTask[];
  holidays: DispatchHolidayRule[];
  contactGroups: DispatchContactGroup[];
  auditLogs: DispatchAuditLog[];
  smartAutomationPolicies: ScheduleAutomationPolicy[];
  smartDemandForecasts: ScheduleDemandForecast[];
  smartTechnicianPreferences: TechnicianSchedulePreference[];
  smartOptimizationRuns: ScheduleOptimizationRun[];
  smartRecommendations: ScheduleRecommendation[];
  smartExceptionQueue: ScheduleExceptionQueueItem[];
  smartDataSources: SmartScheduleDataSource[];
  smartSignals: SmartScheduleSignal[];
  smartRuleExplanations: SmartScheduleRuleExplanation[];
  smartDecisions: SmartScheduleDecision[];
  smartManualOverrides: SmartScheduleManualOverride[];
};

type DispatchCenterSnapshot = DispatchCenterState & {
  revision: number;
};

export type DispatchOverviewSummary = {
  currentModeLabel: string;
  activePeriodLabel: string;
  effectiveTimeLabel: string;
  technicianCount: number;
  confirmedDayLabel: string;
  confirmedShiftLabel: string;
  confirmedArrangementLabel: string;
  applicationCountLabel: string;
  smartScheduleReadiness: SmartScheduleReadiness;
  smartScheduleLatestRun: ScheduleOptimizationRun | null;
  smartScheduleOpenExceptionCount: number;
  activeCycle: DispatchCycle | null;
  planningCycle: DispatchCycle | null;
};

export type DispatchOverviewRangeSummary = {
  effectiveTimeLabel: string;
  effectiveStartDate: string | null;
  effectiveStartDateLabel: string;
  effectiveEndDate: string | null;
  effectiveEndDateLabel: string;
  technicianCount: number;
  technicianCountLabel: string;
  confirmedDayLabel: string;
  confirmedOrderLabel: string;
  applicationCount: number;
  applicationCountLabel: string;
  conflictCount: number;
  conflictCountLabel: string;
};

export type DispatchScheduleCellStatus = "idle" | "open" | "confirmed" | "booked" | "conflict" | "pending" | "other" | "closed";
export type DispatchScheduleServiceStatus = "pending" | "inService" | "completed" | "exception";

export type DispatchScheduleDaySlot = {
  hour: number;
  status: DispatchScheduleCellStatus;
  title: string;
  detail: string;
  orderId?: string;
  parentOrderId?: string;
  appointmentId?: string;
  eventType?: ScheduleEventType;
  isClickable?: boolean;
  detailTargetType?: ScheduleDetailTargetType;
  detailTargetId?: string;
  serviceStatus?: DispatchScheduleServiceStatus;
  serviceExceptionLabel?: string;
  darkened: boolean;
  isCurrent: boolean;
};

export type DispatchScheduleCell = {
  id: string;
  date: string;
  hour: number | null;
  technicianId?: string;
  technicianName?: string;
  status: DispatchScheduleCellStatus;
  title: string;
  detail: string;
  orderId?: string;
  parentOrderId?: string;
  appointmentId?: string;
  eventType?: ScheduleEventType;
  isClickable?: boolean;
  detailTargetType?: ScheduleDetailTargetType;
  detailTargetId?: string;
  dayTimeline?: DispatchScheduleDaySlot[];
  serviceStatus?: DispatchScheduleServiceStatus;
  serviceExceptionLabel?: string;
  darkened: boolean;
  isCurrent: boolean;
};

export type DispatchScheduleRow = {
  technicianId: string;
  technicianName: string;
  technicianSubtitle: string;
  technicianAvatar: string;
  scheduledHours: number;
  cells: DispatchScheduleCell[];
};

export type DispatchScheduleGridData = {
  cycle: DispatchCycle | null;
  dates: string[];
  headers: Array<{ key: string; label: string; sublabel: string }>;
  rows: DispatchScheduleRow[];
  nowHour: number;
};

export type DispatchFeedbackMatrixRow = {
  technicianId: string;
  technicianName: string;
  note: string;
  cells: Array<{
    date: string;
    hour: number;
    status: DispatchFeedbackEntry["status"];
    label: string;
  }>;
  submittedHours: number;
  unavailableHours: number;
};

const storageKey = "needo.dispatch-center.v1";
const listeners = new Set<() => void>();
let hydrated = false;
let storageListenerBound = false;
let revision = 0;
let cachedSnapshot: DispatchCenterSnapshot | null = null;

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseBookedAt(bookedAt: string, durationMinutes = 90) {
  const [date = dispatchReferenceDateKey, startTime = "12:00"] = bookedAt.split(" ");
  return {
    date,
    startTime,
    endTime: addMinutes(startTime, durationMinutes)
  };
}

function getScheduleExceptionLabel(orderId: string | undefined, technicianId: string, hour: number) {
  const seed = `${orderId ?? "appointment"}:${technicianId}:${hour}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const labels = ["技师迟到", "客人迟到", "待取消"];

  return labels[seed % labels.length] ?? "待处理";
}

function fillMatrixHours(templateType: DispatchCycle["templateType"], ranges: Array<{ dayIndex: number; startHour: number; endHour: number }>) {
  const matrix = buildEmptyTemplateMatrix(templateType);

  ranges.forEach(({ dayIndex, startHour, endHour }) => {
    for (let hour = startHour; hour < endHour; hour += 1) {
      if (matrix[dayIndex]) {
        matrix[dayIndex][hour] = true;
      }
    }
  });

  return matrix;
}

function buildDefaultRuleSet(): DispatchCycle["ruleSet"] {
  return {
    minStaff: 1,
    targetStaff: 2,
    maxStaff: 3,
    maxDailyHours: 8,
    maxWeeklyHours: 42,
    minRestDaysPerWeek: 1,
    preBufferMinutes: 20,
    postBufferMinutes: 15,
    weekdayAdjustments: { 5: 1, 6: 1 },
    holidayAdjustments: {
      "2026-04-29": 1,
      "2026-05-03": 1,
      "2026-05-04": 1,
      "2026-05-05": 2
    },
    overtimeBlockedWeekdays: [],
    tempStaffEnabled: true,
    tempStaffIds: ["temp-1", "temp-2"],
    priorityRules: {
      selectedTechnicianIds: ["tech-1", "tech-4"],
      selectedLanguages: ["中文", "英语"],
      requireForeignerSupport: true,
      confirmedHoursPriority: "less_first",
      preferEarlyResponder: true,
      useIdFallback: true
    },
    notificationRules: {
      overbookEnabled: true,
      overbookThreshold: 2,
      lowBookingEnabled: true,
      lowBookingThreshold: 1,
      discountEnabled: true,
      discountTemplate: "{{name}}，{{storeName}} 已开放 {{date}} {{timeRange}} 的排班反馈，请在截止前确认。",
      activeTemplateId: "dispatch-template-feedback-reminder",
      templates: [
        {
          id: "dispatch-template-feedback-reminder",
          title: "反馈提醒模板",
          body: "{{name}}，{{storeName}} 已开放 {{date}} {{timeRange}} 的排班反馈，请在截止前确认。",
          updatedAt: dispatchReferenceNow
        }
      ]
    }
  };
}

function getStoreTechnicianIdsForDispatch(storeId: string) {
  const ids = getEntityStoreSnapshot().technicians
    .filter((technician) => technician.storeId === storeId)
    .map((technician) => technician.id);

  return ids.length > 0 ? ids : ["tech-1"];
}

function ensureCycleDisplayTechnicians(cycle: DispatchCycle) {
  const storeTechnicianIds = getStoreTechnicianIdsForDispatch(cycle.storeId);
  const visibleTargetCount = cycle.targetTechnicianIds.filter((technicianId) => storeTechnicianIds.includes(technicianId)).length;

  if (cycle.targetTechnicianIds.length > 0 && visibleTargetCount === cycle.targetTechnicianIds.length) {
    return cycle;
  }

  return {
    ...cycle,
    targetTechnicianIds: storeTechnicianIds
  };
}

function buildDefaultCycles(storeId: string): DispatchCycle[] {
  const targetTechnicianIds = getStoreTechnicianIdsForDispatch(storeId);
  const activeCycle: DispatchCycle = {
    id: "cycle-active-store-1",
    storeId,
    name: "当前执行周期",
    creationMethod: "copy_current",
    mode: "STORE_ASSIGN_FINAL",
    status: "active",
    currentStep: 4,
    templateType: "week",
    periodStart: "2026-04-14",
    periodEnd: "2026-04-27",
    targetTechnicianIds,
    feedbackDeadline: null,
    templateMatrix: fillMatrixHours("week", [
      { dayIndex: 1, startHour: 10, endHour: 22 },
      { dayIndex: 2, startHour: 10, endHour: 22 },
      { dayIndex: 3, startHour: 10, endHour: 22 },
      { dayIndex: 4, startHour: 10, endHour: 22 },
      { dayIndex: 5, startHour: 11, endHour: 23 },
      { dayIndex: 6, startHour: 12, endHour: 22 },
      { dayIndex: 0, startHour: 12, endHour: 20 }
    ]),
    regularHolidayWeekdays: [3],
    ruleSet: buildDefaultRuleSet(),
    launchedAt: "2026-04-10T09:30:00+09:00",
    finalizedAt: "2026-04-12T18:10:00+09:00",
    activeAt: "2026-04-14T00:00:00+09:00",
    cancelledAt: null,
    lastAutoConfirmAt: "2026-04-11T14:20:00+09:00",
    autoConfirmSummary: {
      confirmedCount: 148,
      waitlistedCount: 18,
      shortageCount: 3,
      overflowCount: 5
    },
    updatedAt: "2026-04-12T18:10:00+09:00"
  };

  const planningCycle: DispatchCycle = {
    id: "cycle-planning-store-1",
    storeId,
    name: "下个周期征集",
    creationMethod: "new",
    mode: "STORE_COLLECT_CONFIRM",
    status: "collecting_feedback",
    currentStep: 3,
    templateType: "week",
    periodStart: "2026-04-28",
    periodEnd: "2026-05-27",
    targetTechnicianIds,
    feedbackDeadline: "2026-04-24T18:00:00+09:00",
    templateMatrix: fillMatrixHours("week", [
      { dayIndex: 1, startHour: 10, endHour: 14 },
      { dayIndex: 1, startHour: 16, endHour: 22 },
      { dayIndex: 2, startHour: 10, endHour: 14 },
      { dayIndex: 2, startHour: 16, endHour: 22 },
      { dayIndex: 3, startHour: 10, endHour: 14 },
      { dayIndex: 3, startHour: 16, endHour: 22 },
      { dayIndex: 4, startHour: 10, endHour: 14 },
      { dayIndex: 4, startHour: 16, endHour: 22 },
      { dayIndex: 5, startHour: 11, endHour: 23 },
      { dayIndex: 6, startHour: 12, endHour: 22 },
      { dayIndex: 0, startHour: 12, endHour: 20 }
    ]),
    regularHolidayWeekdays: [3],
    ruleSet: buildDefaultRuleSet(),
    launchedAt: "2026-04-19T09:10:00+09:00",
    finalizedAt: null,
    activeAt: null,
    cancelledAt: null,
    lastAutoConfirmAt: null,
    autoConfirmSummary: null,
    updatedAt: "2026-04-20T09:50:00+09:00"
  };

  return [activeCycle, planningCycle];
}

function buildDefaultFeedbacks(
  cycleId: string,
  targetTechnicianIds: string[] = getStoreTechnicianIdsForDispatch("store-1"),
  periodStart = "2026-04-28"
) {
  const entries: DispatchFeedbackEntry[] = [];
  const noteSeeds = [
    "周五晚间可加班。",
    "周末希望 14 点后排班。",
    "黄金周可以连班。",
    "",
    "周三定休。",
    "希望避开早班。",
    "可支援英文客户。",
    "晚间只接店内服务。",
    "5/3 可临时加开。",
    "当天移动时间需要预留。"
  ];
  const technicians = targetTechnicianIds.map((id, index) => ({
    id,
    submittedAt: index % 7 === 3 || index % 11 === 8 ? null : `2026-04-${String(19 + (index % 2)).padStart(2, "0")}T${String(9 + (index % 9)).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}:00+09:00`,
    note: noteSeeds[index % noteSeeds.length]
  }));
  const dates = Array.from({ length: 4 }, (_, index) => addDays(periodStart, index));

  technicians.forEach((technician, techIndex) => {
    dates.forEach((date, dateIndex) => {
      for (let hour = 10; hour < 22; hour += 1) {
        const isSubmitted = Boolean(technician.submittedAt);
        const unavailableWindow =
          techIndex % 6 === 1
            ? hour < 14
            : techIndex % 6 === 5
              ? hour >= 18
              : techIndex === 0 && dateIndex === 2
                ? hour === 14 || hour === 15
                : techIndex % 7 === 4 && hour >= 12 && hour <= 13;
        const updated = techIndex % 4 === 2 && dateIndex === 2 && hour >= 18;

        entries.push({
          id: `${cycleId}-${technician.id}-${date}-${hour}`,
          cycleId,
          technicianId: technician.id,
          date,
          hour,
          status: !isSubmitted ? "none" : updated ? "updated" : unavailableWindow ? "unavailable" : "available",
          submittedAt: technician.submittedAt,
          updatedAt: updated ? "2026-04-20T08:50:00+09:00" : technician.submittedAt,
          note: technician.note,
          version: updated ? 2 : isSubmitted ? 1 : 0
        });
      }
    });

    if (!technician.submittedAt && techIndex % 2 === 0) {
      entries.push({
        id: `${cycleId}-${technician.id}-placeholder`,
        cycleId,
        technicianId: technician.id,
        date: dates[0],
        hour: 0,
        status: "none",
        submittedAt: null,
        updatedAt: null,
        note: "",
        version: 0
      });
    }
  });

  return entries;
}

function buildSeedFinalShifts(
  storeId: string,
  cycleId: string,
  targetTechnicianIds: string[] = getStoreTechnicianIdsForDispatch(storeId),
  seedStartDate = dispatchReferenceDateKey
): DispatchFinalShift[] {
  const technicians = targetTechnicianIds;
  const dates = Array.from({ length: 3 }, (_, index) => addDays(seedStartDate, index));
  const entries: DispatchFinalShift[] = [];

  dates.forEach((date, dateIndex) => {
    technicians.forEach((technicianId, techIndex) => {
      for (let hour = 10; hour < 21; hour += 1) {
        const status =
          techIndex % 6 === 5 && hour >= 18
            ? "waitlisted"
            : dateIndex === 1 && techIndex % 5 === 2 && hour === 14
              ? "cancelled"
              : "confirmed";

        entries.push({
          id: `${cycleId}-${technicianId}-${date}-${hour}`,
          cycleId,
          storeId,
          technicianId,
          date,
          hour,
          status,
          source: "auto",
          ruleSnapshot: status === "confirmed" ? "base_capacity+preferred_skill" : "overflow_buffer",
          confirmedAt: "2026-04-12T18:10:00+09:00",
          confirmedBy: "system"
        });
      }
    });
  });

  return entries;
}

function getCycleDisplaySeedStartDate(cycle: DispatchCycle) {
  if (cycle.periodStart <= dispatchReferenceDateKey && cycle.periodEnd >= dispatchReferenceDateKey) {
    return dispatchReferenceDateKey;
  }

  return cycle.periodStart;
}

function buildSeedArrangements(storeId: string) {
  const activeCycleSeedDates = [
    dispatchReferenceDateKey,
    dispatchReferenceDateKey,
    dispatchReferenceDateKey,
    dispatchReferenceDateKey,
    dispatchReferenceDateKey,
    addDays(dispatchReferenceDateKey, 1),
    addDays(dispatchReferenceDateKey, 2),
    addDays(dispatchReferenceDateKey, 4)
  ];

  const baselineArrangements = orders.slice(0, 8).map((order, index) => {
    const schedule = parseBookedAt(order.bookedAt, order.mode === "home" ? 120 : 90);
    const assignedTechnicianId = ["tech-1", "tech-4", "tech-8", "tech-12"][index % 4];
    const assignedTechnicianName = getEntityStoreSnapshot().technicians.find((technician) => technician.id === assignedTechnicianId)?.name ?? "待定";
    const date = activeCycleSeedDates[index] ?? schedule.date;

    return {
      id: `arrangement-${order.id}`,
      storeId,
      orderId: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId,
      customerName: order.customerName,
      serviceName: order.itemName,
      serviceMode: order.mode,
      date,
      startTime: index < 5 ? ["10:00", "11:30", "13:00", "15:00", "18:00"][index] : schedule.startTime,
      endTime: index < 5 ? ["11:30", "13:00", "14:30", "16:30", "19:30"][index] : schedule.endTime,
      address: order.mode === "home" ? `${order.area} · 上门地址已确认` : "店内 2F / Bed A",
      roomLabel: order.mode === "home" ? "用户约定地点" : `Bed ${String.fromCharCode(65 + (index % 4))}`,
      technicianId: index === 4 ? null : assignedTechnicianId,
      technicianLabel: index === 4 ? null : assignedTechnicianName,
      status: order.status === "completed" ? "completed" : index === 3 ? "inService" : index === 4 ? "pending" : "confirmed",
      note: order.remark ?? "",
      internalNote: index === 2 ? "已电话确认延后 10 分钟。" : "",
      amount: order.amount,
      source: "order"
    } satisfies DispatchArrangement;
  });

  return [...baselineArrangements, ...buildDemoDispatchArrangementsForStore(storeId)];
}

function buildDemoDispatchArrangementsForStore(storeId: string) {
  if (storeId !== demoAppointmentSeedStoreId) {
    return [];
  }

  const snapshot = getEntityStoreSnapshot();
  const store = snapshot.stores.find((item) => item.id === storeId) ?? null;

  return buildDemoAppointmentDispatchArrangements({
    customers: snapshot.customers,
    store,
    technicians: snapshot.technicians
  });
}

function buildSeedSpecialTasks(storeId: string) {
  const seeded: DispatchSpecialTask[] = fieldJobs.slice(0, 4).map((task, index) => ({
    id: `special-${task.id}`,
    storeId,
    source: index === 0 ? "unassigned_order" : index === 1 ? "merchant_manual" : index === 2 ? "admin_manual" : "overtime",
    serviceMode: index % 2 === 0 ? "home" : "store",
    date: dispatchReferenceDateKey,
    startTime: ["12:00", "14:30", "19:00", "21:00"][index] ?? "12:00",
    endTime: ["13:30", "16:00", "20:30", "22:30"][index] ?? "13:30",
    address: task.address,
    technicianId: index === 1 ? "tech-8" : null,
    orderId: task.orderId,
    status: index === 1 ? "assigned" : "pending",
    note: index === 0 ? "自动派单暂无可用技师。" : index === 2 ? "VIP 熟客电话加钟。" : task.serviceContent
  }));

  seeded.push({
    id: "special-walk-in",
    storeId,
    source: "merchant_manual",
    serviceMode: "store",
    date: dispatchReferenceDateKey,
    startTime: "20:00",
    endTime: "21:30",
    address: "店内前台临时加单",
    technicianId: null,
    orderId: null,
    status: "pending",
    note: "线下 walk-in，需要前台确认床位。"
  });
  seeded.push(buildOverviewRangeSeedTask(storeId));

  return seeded;
}

function buildOverviewRangeSeedTask(storeId: string): DispatchSpecialTask {
  return {
    id: "special-weekend-cover",
    storeId,
    source: "merchant_manual",
    serviceMode: "store",
    date: addDays(dispatchReferenceDateKey, 2),
    startTime: "18:30",
    endTime: "20:00",
    address: "店内周中加开席位",
    technicianId: null,
    orderId: null,
    status: "pending",
    note: "周中预约增长，需要临时确认一名员工。"
  };
}

const japanPublicHolidays2026: Array<Omit<DispatchHolidayRule, "storeId" | "deltaStaff" | "tempRecruitEnabled">> = [
  { holidayDate: "2026-01-01", nameJa: "元日", nameZh: "元日" },
  { holidayDate: "2026-01-12", nameJa: "成人の日", nameZh: "成人日" },
  { holidayDate: "2026-02-11", nameJa: "建国記念の日", nameZh: "建国纪念日" },
  { holidayDate: "2026-02-23", nameJa: "天皇誕生日", nameZh: "天皇诞生日" },
  { holidayDate: "2026-03-20", nameJa: "春分の日", nameZh: "春分日" },
  { holidayDate: "2026-04-29", nameJa: "昭和の日", nameZh: "昭和日" },
  { holidayDate: "2026-05-03", nameJa: "憲法記念日", nameZh: "宪法纪念日" },
  { holidayDate: "2026-05-04", nameJa: "みどりの日", nameZh: "绿之日" },
  { holidayDate: "2026-05-05", nameJa: "こどもの日", nameZh: "儿童节" },
  { holidayDate: "2026-05-06", nameJa: "休日", nameZh: "补休日" },
  { holidayDate: "2026-07-20", nameJa: "海の日", nameZh: "海之日" },
  { holidayDate: "2026-08-11", nameJa: "山の日", nameZh: "山之日" },
  { holidayDate: "2026-09-21", nameJa: "敬老の日", nameZh: "敬老日" },
  { holidayDate: "2026-09-22", nameJa: "休日", nameZh: "国民休日" },
  { holidayDate: "2026-09-23", nameJa: "秋分の日", nameZh: "秋分日" },
  { holidayDate: "2026-10-12", nameJa: "スポーツの日", nameZh: "体育日" },
  { holidayDate: "2026-11-03", nameJa: "文化の日", nameZh: "文化日" },
  { holidayDate: "2026-11-23", nameJa: "勤労感謝の日", nameZh: "勤劳感谢日" }
];

function getDefaultHolidayDelta(date: string) {
  if (date === "2026-05-05") {
    return 2;
  }

  return ["2026-04-29", "2026-05-03", "2026-05-04"].includes(date) ? 1 : 0;
}

function buildSeedHolidays(storeId: string): DispatchHolidayRule[] {
  return japanPublicHolidays2026.map((holiday) => ({
    ...holiday,
    storeId,
    deltaStaff: getDefaultHolidayDelta(holiday.holidayDate),
    tempRecruitEnabled: holiday.holidayDate >= "2026-05-03" && holiday.holidayDate <= "2026-05-06"
  }));
}

function buildSeedContactGroups(storeId: string): DispatchContactGroup[] {
  return [
    {
      id: "temp-staff-pool-store-1",
      storeId,
      groupType: "temp_staff_pool",
      locked: true,
      members: [
        { id: "temp-1", name: "临时技师 佐藤夜班", languages: ["日语"], supportsForeigners: false },
        { id: "temp-2", name: "临时技师 Amy", languages: ["英语", "中文"], supportsForeigners: true },
        { id: "temp-3", name: "临时技师 金慧珍", languages: ["韩语", "日语"], supportsForeigners: true }
      ]
    }
  ];
}

function buildSeedSmartPolicies(storeId: string): ScheduleAutomationPolicy[] {
  return [
    {
      id: `smart-policy-${storeId}`,
      shopId: storeId,
      enabled: false,
      automationLevel: "semi_auto",
      mode: "auto_schedule",
      minCycleDays: 30,
      autoExceptionActionDelayMinutes: 10,
      coldStartStatus: "not_enabled",
      dataCollectionEnabled: true,
      manualInputEnabled: false,
      qualityAutoConfirmThreshold: 90,
      qualityReviewThreshold: 70,
      coldStartRequiredDays: 14,
      coldStartStartedAt: "2026-04-08",
      coldStartEndsAt: "2026-04-21",
      minimumHistoricalOrderCount: 30,
      minimumPreferenceCoveragePercent: 80,
      autoCreateCycleEnabled: true,
      autoCollectFeedbackEnabled: true,
      autoSubmitFromHistoryEnabled: true,
      autoConfirmEnabled: true,
      autoConfirmScoreThreshold: 90,
      shortageStrategy: "candidate_pool",
      overflowStrategy: "move_to_waitlist",
      unsubmittedStaffStrategy: "auto_submit_from_history",
      smartScheduleFreeLimitedEnabled: true,
      smartScheduleBillingStatus: "free_limited",
      smartScheduleFreeUntil: "2026-06-30",
      smartSchedulePlanRequired: null,
      createdAt: dispatchReferenceNow,
      updatedAt: dispatchReferenceNow
    }
  ];
}

function buildSeedSmartDataSources(storeId: string): SmartScheduleDataSource[] {
  const seeds: Array<Pick<SmartScheduleDataSource, "sourceType" | "confidenceScore" | "fallbackUsed" | "missingReason">> = [
    { sourceType: "merchant_history", confidenceScore: 0.86, fallbackUsed: false, missingReason: null },
    { sourceType: "technician_preferences", confidenceScore: 0.9, fallbackUsed: false, missingReason: null },
    { sourceType: "platform_flow", confidenceScore: 0.82, fallbackUsed: false, missingReason: null },
    { sourceType: "current_booking_trend", confidenceScore: 0.78, fallbackUsed: false, missingReason: null },
    { sourceType: "weather", confidenceScore: 0.74, fallbackUsed: false, missingReason: null },
    { sourceType: "traffic", confidenceScore: 0.52, fallbackUsed: true, missingReason: "第一版未接入真实路况 API，使用默认通勤缓冲。" },
    { sourceType: "holiday", confidenceScore: 0.92, fallbackUsed: false, missingReason: null },
    { sourceType: "special_date_rules", confidenceScore: 0.84, fallbackUsed: false, missingReason: null },
    { sourceType: "campaign", confidenceScore: 0.66, fallbackUsed: true, missingReason: "当前活动流量使用平台 mock 基准。" },
    { sourceType: "local_event", confidenceScore: 0.58, fallbackUsed: true, missingReason: "商圈大型活动暂未接入实时数据。" }
  ];

  return seeds.map((seed) => ({
    id: `smart-source-${storeId}-${seed.sourceType}`,
    shopId: storeId,
    sourceType: seed.sourceType,
    enabled: true,
    status: seed.fallbackUsed ? "fallback" : "ready",
    confidenceScore: seed.confidenceScore,
    lastCollectedAt: dispatchReferenceNow,
    missingReason: seed.missingReason,
    fallbackUsed: seed.fallbackUsed,
    createdAt: dispatchReferenceNow,
    updatedAt: dispatchReferenceNow
  }));
}

function mergeSmartDataSourcesWithExisting(storeId: string, sources: SmartScheduleDataSource[]) {
  const existingByType = new Map(
    state.smartDataSources
      .filter((source) => source.shopId === storeId)
      .map((source) => [source.sourceType, source])
  );

  return sources.map((source) => {
    const existing = existingByType.get(source.sourceType);

    if (!existing) {
      return source;
    }

    const enabled = existing.enabled;

    return {
      ...source,
      enabled,
      status: enabled ? source.status : "missing",
      lastCollectedAt: enabled ? source.lastCollectedAt : existing.lastCollectedAt,
      updatedAt: dispatchReferenceNow
    };
  });
}

function withSmartPolicyDefaults(policy: ScheduleAutomationPolicy): ScheduleAutomationPolicy {
  const seed = buildSeedSmartPolicies(policy.shopId)[0];

  return {
    ...seed,
    ...policy,
    enabled: policy.enabled ?? seed.enabled,
    mode: policy.mode ?? seed.mode,
    minCycleDays: policy.minCycleDays ?? seed.minCycleDays,
    autoExceptionActionDelayMinutes: policy.autoExceptionActionDelayMinutes ?? seed.autoExceptionActionDelayMinutes,
    coldStartStatus: policy.coldStartStatus ?? seed.coldStartStatus,
    dataCollectionEnabled: policy.dataCollectionEnabled ?? seed.dataCollectionEnabled,
    manualInputEnabled: policy.manualInputEnabled ?? seed.manualInputEnabled,
    qualityAutoConfirmThreshold: policy.qualityAutoConfirmThreshold ?? policy.autoConfirmScoreThreshold ?? seed.qualityAutoConfirmThreshold,
    qualityReviewThreshold: policy.qualityReviewThreshold ?? seed.qualityReviewThreshold,
    coldStartRequiredDays: policy.coldStartRequiredDays ?? seed.coldStartRequiredDays,
    coldStartStartedAt: policy.coldStartStartedAt ?? seed.coldStartStartedAt,
    coldStartEndsAt: policy.coldStartEndsAt ?? seed.coldStartEndsAt,
    minimumHistoricalOrderCount: policy.minimumHistoricalOrderCount ?? seed.minimumHistoricalOrderCount,
    minimumPreferenceCoveragePercent: policy.minimumPreferenceCoveragePercent ?? seed.minimumPreferenceCoveragePercent,
    autoConfirmScoreThreshold: policy.autoConfirmScoreThreshold ?? policy.qualityAutoConfirmThreshold ?? seed.autoConfirmScoreThreshold
  };
}

function buildSeedSmartPreferences(storeId: string, technicianIds: string[]): TechnicianSchedulePreference[] {
  return technicianIds.flatMap((technicianId, technicianIndex) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const regularRest = weekday === 3 && technicianIndex % 2 === 0;

      return {
        id: `smart-pref-${storeId}-${technicianId}-${weekday}`,
        technicianId,
        shopId: storeId,
        weekday,
        startTime: weekday === 5 || weekday === 6 ? "12:00" : "10:00",
        endTime: weekday === 5 || weekday === 6 ? "22:00" : "21:00",
        available: !regularRest,
        maxHoursDay: 8,
        maxHoursWeek: 42,
        acceptOvertime: technicianIndex % 2 === 0,
        acceptHoliday: weekday === 0 || technicianIndex % 3 !== 0,
        acceptTempShift: technicianIndex % 2 !== 1,
        bufferMinutes: 20,
        autoSubmitEnabled: technicianIndex !== 2,
        priority: Math.max(1, 4 - technicianIndex),
        createdAt: dispatchReferenceNow,
        updatedAt: dispatchReferenceNow
      } satisfies TechnicianSchedulePreference;
    })
  );
}

function buildDefaultState(): DispatchCenterState {
  const storeId = "store-1";
  const cycles = buildDefaultCycles(storeId);
  const planningCycle = cycles.find((cycle) => cycle.status === "collecting_feedback");
  const activeCycle = cycles.find((cycle) => cycle.status === "active");
  const smartPreferenceTechnicianIds = activeCycle?.targetTechnicianIds ?? planningCycle?.targetTechnicianIds ?? getStoreTechnicianIdsForDispatch(storeId);

  return {
    cycles,
    feedbacks: planningCycle ? buildDefaultFeedbacks(planningCycle.id, planningCycle.targetTechnicianIds, planningCycle.periodStart) : [],
    finalShifts: activeCycle
      ? buildSeedFinalShifts(storeId, activeCycle.id, activeCycle.targetTechnicianIds, getCycleDisplaySeedStartDate(activeCycle))
      : [],
    finalBookableSlots: [],
    arrangements: buildSeedArrangements(storeId),
    specialTasks: buildSeedSpecialTasks(storeId),
    floatingTasks: [],
    holidays: buildSeedHolidays(storeId),
    contactGroups: buildSeedContactGroups(storeId),
    auditLogs: [],
    smartAutomationPolicies: buildSeedSmartPolicies(storeId),
    smartDemandForecasts: [],
    smartTechnicianPreferences: buildSeedSmartPreferences(storeId, smartPreferenceTechnicianIds),
    smartOptimizationRuns: [],
    smartRecommendations: [],
    smartExceptionQueue: [],
    smartDataSources: buildSeedSmartDataSources(storeId),
    smartSignals: [],
    smartRuleExplanations: [],
    smartDecisions: [],
    smartManualOverrides: []
  };
}

const defaultState = buildDefaultState();
const state: DispatchCenterState = cloneValue(defaultState);

function ensureCycleDisplayData() {
  const cycleTargetMap = new Map(state.cycles.map((cycle) => [cycle.id, new Set(cycle.targetTechnicianIds)]));

  state.feedbacks = state.feedbacks.filter((entry) => cycleTargetMap.get(entry.cycleId)?.has(entry.technicianId) ?? true);
  state.finalShifts = state.finalShifts.filter((shift) => cycleTargetMap.get(shift.cycleId)?.has(shift.technicianId) ?? true);

  state.cycles.forEach((cycle) => {
    if (cycle.status === "collecting_feedback") {
      const feedbackTechnicianIds = new Set(
        state.feedbacks.filter((entry) => entry.cycleId === cycle.id).map((entry) => entry.technicianId)
      );
      const missingTechnicianIds = cycle.targetTechnicianIds.filter((technicianId) => !feedbackTechnicianIds.has(technicianId));

      if (missingTechnicianIds.length > 0) {
        state.feedbacks.push(...buildDefaultFeedbacks(cycle.id, missingTechnicianIds, cycle.periodStart));
      }
    }

    if (
      cycle.status === "active" ||
      cycle.status === "confirmed" ||
      cycle.status === "final_confirmed" ||
      cycle.status === "final_confirming" ||
      cycle.status === "feedback_closed" ||
      cycle.status === "ready_to_confirm"
    ) {
      const finalShiftTechnicianIds = new Set(
        state.finalShifts.filter((shift) => shift.cycleId === cycle.id).map((shift) => shift.technicianId)
      );
      const missingTechnicianIds = cycle.targetTechnicianIds.filter((technicianId) => !finalShiftTechnicianIds.has(technicianId));

      if (missingTechnicianIds.length > 0) {
        state.finalShifts.push(
          ...buildSeedFinalShifts(cycle.storeId, cycle.id, missingTechnicianIds, getCycleDisplaySeedStartDate(cycle))
        );
      }

      const existingShiftKeys = new Set(
        state.finalShifts
          .filter((shift) => shift.cycleId === cycle.id)
          .map((shift) => `${shift.technicianId}:${shift.date}:${shift.hour}`)
      );
      const expectedDisplayShifts = buildSeedFinalShifts(cycle.storeId, cycle.id, cycle.targetTechnicianIds, getCycleDisplaySeedStartDate(cycle));
      state.finalShifts.push(
        ...expectedDisplayShifts.filter((shift) => !existingShiftKeys.has(`${shift.technicianId}:${shift.date}:${shift.hour}`))
      );
    }
  });
}

function ensureOverviewRangeDemoData() {
  let changed = false;
  const currentCycle = state.cycles.find((cycle) => cycle.id === "cycle-active-store-1" && cycle.status === "active");

  if (!currentCycle) {
    return changed;
  }

  const arrangementDateMap = new Map([
    ["arrangement-ord-grown-006", addDays(dispatchReferenceDateKey, 1)],
    ["arrangement-ord-grown-007", addDays(dispatchReferenceDateKey, 2)],
    ["arrangement-ord-grown-008", addDays(dispatchReferenceDateKey, 4)]
  ]);

  state.arrangements = state.arrangements.map((arrangement) => {
    const nextDate = arrangementDateMap.get(arrangement.id);

    if (!nextDate || arrangement.date === nextDate) {
      return arrangement;
    }

    changed = true;
    return { ...arrangement, date: nextDate };
  });

  if (!state.specialTasks.some((task) => task.id === "special-weekend-cover" && task.storeId === currentCycle.storeId)) {
    state.specialTasks.push(buildOverviewRangeSeedTask(currentCycle.storeId));
    changed = true;
  }

  return changed;
}

function ensureDemoAppointmentSeedData() {
  const existingIds = new Set(state.arrangements.map((arrangement) => arrangement.id));
  const missingArrangements = buildDemoDispatchArrangementsForStore(demoAppointmentSeedStoreId).filter(
    (arrangement) => !existingIds.has(arrangement.id)
  );

  if (missingArrangements.length === 0) {
    return false;
  }

  state.arrangements.push(...missingArrangements);
  return true;
}

function ensureSmartSchedulingData() {
  state.smartAutomationPolicies = state.smartAutomationPolicies.map(withSmartPolicyDefaults);
  const storeIds = Array.from(new Set(state.cycles.map((cycle) => cycle.storeId)));

  storeIds.forEach((storeId) => {
    if (!state.smartAutomationPolicies.some((policy) => policy.shopId === storeId)) {
      state.smartAutomationPolicies.push(...buildSeedSmartPolicies(storeId));
    }

    buildSeedSmartDataSources(storeId).forEach((source) => {
      const existing = state.smartDataSources.find((item) => item.shopId === storeId && item.sourceType === source.sourceType);

      if (existing) {
        Object.assign(existing, {
          enabled: existing.enabled ?? source.enabled,
          status: existing.status ?? source.status,
          confidenceScore: existing.confidenceScore ?? source.confidenceScore,
          lastCollectedAt: existing.lastCollectedAt ?? source.lastCollectedAt,
          missingReason: existing.missingReason ?? source.missingReason,
          fallbackUsed: existing.fallbackUsed ?? source.fallbackUsed,
          updatedAt: existing.updatedAt ?? source.updatedAt
        });
        return;
      }

      state.smartDataSources.push(source);
    });

    const technicianIds = Array.from(
      new Set(
        state.cycles
          .filter((cycle) => cycle.storeId === storeId)
          .flatMap((cycle) => cycle.targetTechnicianIds)
      )
    );

    technicianIds.forEach((technicianId) => {
      const hasPreferenceRows = state.smartTechnicianPreferences.some(
        (preference) => preference.shopId === storeId && preference.technicianId === technicianId
      );

      if (!hasPreferenceRows) {
        state.smartTechnicianPreferences.push(...buildSeedSmartPreferences(storeId, [technicianId]));
      }
    });
  });
}

function persist() {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(storageKey, JSON.stringify(state), { silent: true });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitUpdate() {
  revision += 1;
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function getSnapshot(): DispatchCenterSnapshot {
  hydrate();

  if (cachedSnapshot && cachedSnapshot.revision === revision) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    ...state,
    revision
  };

  return cachedSnapshot;
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

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    hydrated = true;
    return;
  }

  hydrated = true;
  bindStorageListener();
  const raw = readBrowserStorage(storageKey, { silent: true });

  if (!raw) {
    rebuildDerivedState();
    persist();
    return;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DispatchCenterState>;
    state.cycles = Array.isArray(parsed.cycles) ? parsed.cycles : cloneValue(defaultState.cycles);
    state.feedbacks = Array.isArray(parsed.feedbacks) ? parsed.feedbacks : cloneValue(defaultState.feedbacks);
    state.finalShifts = Array.isArray(parsed.finalShifts) ? parsed.finalShifts : cloneValue(defaultState.finalShifts);
    state.finalBookableSlots = Array.isArray(parsed.finalBookableSlots) ? parsed.finalBookableSlots : cloneValue(defaultState.finalBookableSlots);
    state.arrangements = Array.isArray(parsed.arrangements) ? parsed.arrangements : cloneValue(defaultState.arrangements);
    state.specialTasks = Array.isArray(parsed.specialTasks) ? parsed.specialTasks : cloneValue(defaultState.specialTasks);
    state.floatingTasks = Array.isArray(parsed.floatingTasks) ? parsed.floatingTasks : [];
    state.holidays = Array.isArray(parsed.holidays) ? parsed.holidays : cloneValue(defaultState.holidays);
    state.contactGroups = Array.isArray(parsed.contactGroups) ? parsed.contactGroups : cloneValue(defaultState.contactGroups);
    state.auditLogs = Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [];
    state.smartAutomationPolicies = Array.isArray(parsed.smartAutomationPolicies) ? parsed.smartAutomationPolicies : cloneValue(defaultState.smartAutomationPolicies);
    state.smartDemandForecasts = Array.isArray(parsed.smartDemandForecasts) ? parsed.smartDemandForecasts : [];
    state.smartTechnicianPreferences = Array.isArray(parsed.smartTechnicianPreferences) ? parsed.smartTechnicianPreferences : cloneValue(defaultState.smartTechnicianPreferences);
    state.smartOptimizationRuns = Array.isArray(parsed.smartOptimizationRuns) ? parsed.smartOptimizationRuns : [];
    state.smartRecommendations = Array.isArray(parsed.smartRecommendations) ? parsed.smartRecommendations : [];
    state.smartExceptionQueue = Array.isArray(parsed.smartExceptionQueue) ? parsed.smartExceptionQueue : [];
    state.smartDataSources = Array.isArray(parsed.smartDataSources) ? parsed.smartDataSources : cloneValue(defaultState.smartDataSources);
    state.smartSignals = Array.isArray(parsed.smartSignals) ? parsed.smartSignals : [];
    state.smartRuleExplanations = Array.isArray(parsed.smartRuleExplanations) ? parsed.smartRuleExplanations : [];
    state.smartDecisions = Array.isArray(parsed.smartDecisions) ? parsed.smartDecisions : [];
    state.smartManualOverrides = Array.isArray(parsed.smartManualOverrides) ? parsed.smartManualOverrides : [];
  } catch {
    Object.assign(state, cloneValue(defaultState));
  }

  state.cycles = state.cycles.map((cycle) => ensureCycleDisplayTechnicians(normalizeCycleStep(cycle)));
  ensureCycleDisplayData();
  const overviewRangeDataChanged = ensureOverviewRangeDemoData();
  const demoAppointmentSeedChanged = ensureDemoAppointmentSeedData();
  ensureSmartSchedulingData();
  rebuildDerivedState();
  if (overviewRangeDataChanged || demoAppointmentSeedChanged) {
    persist();
  }
}

function getCycleById(cycleId: string) {
  return state.cycles.find((cycle) => cycle.id === cycleId) ?? null;
}

function getStoreCycles(storeId: string) {
  return state.cycles
    .filter((cycle) => cycle.storeId === storeId)
    .sort((left, right) => left.periodStart.localeCompare(right.periodStart));
}

function getActiveExecutionCycle(storeId: string) {
  return (
    getStoreCycles(storeId).find((cycle) => cycle.status === "active")
    ?? getStoreCycles(storeId).find((cycle) => cycle.status === "confirmed")
    ?? getStoreCycles(storeId).find((cycle) => cycle.status === "final_confirmed")
    ?? null
  );
}

function getPlanningCycle(storeId: string) {
  const scoped = getStoreCycles(storeId);
  return (
    scoped.find((cycle) => cycle.status === "smart_exception_pending")
    ?? scoped.find((cycle) => cycle.status === "smart_generated")
    ?? scoped.find((cycle) => cycle.status === "smart_recalculating")
    ?? scoped.find((cycle) => cycle.status === "rule_setting")
    ?? scoped.find((cycle) => cycle.status === "rule_ready")
    ?? scoped.find((cycle) => cycle.status === "smart_generating")
    ?? scoped.find((cycle) => cycle.status === "manual_override")
    ?? scoped.find((cycle) => cycle.status === "final_confirming")
    ?? scoped.find((cycle) => cycle.status === "feedback_closed")
    ?? scoped.find((cycle) => cycle.status === "collecting_feedback")
    ?? scoped.find((cycle) => cycle.status === "ready_to_confirm")
    ?? scoped.find((cycle) => cycle.status === "draft")
    ?? scoped.find((cycle) => cycle.status === "confirmed")
    ?? scoped.find((cycle) => cycle.status === "final_confirmed")
    ?? scoped.find((cycle) => cycle.status === "active")
    ?? null
  );
}

function logAudit(entry: Omit<DispatchAuditLog, "id" | "createdAt">) {
  state.auditLogs.unshift({
    id: createDispatchId("audit"),
    createdAt: dispatchReferenceNow,
    ...entry
  });
}

function getEntityMaps(storeId: string) {
  const snapshot = getEntityStoreSnapshot();
  const technicians = snapshot.technicians.filter((technician) => technician.storeId === storeId);
  const technicianMap = new Map(technicians.map((technician) => [technician.id, technician]));
  return { technicians, technicianMap };
}

function diffDaysInclusive(startDate: string, endDate: string) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / dayMs) + 1);
}

function formatDateKeyForDisplay(dateKey: string, time: string) {
  const [year = "", month = "", day = ""] = dateKey.split("-");

  if (!(year && month && day)) {
    return dateKey;
  }

  return `${year}.${month}.${day} ${time}`;
}

function formatDateKeyForDateDisplay(dateKey: string | null | undefined) {
  if (!dateKey) {
    return "-";
  }

  const [year = "", month = "", day = ""] = dateKey.split("-");

  if (!(year && month && day)) {
    return dateKey;
  }

  return `${year}.${month}.${day}`;
}

function formatDispatchDateRangeLabel(startDate: string | null | undefined, endDate: string | null | undefined) {
  if (!startDate || !endDate) {
    return "-";
  }

  return `${formatDateKeyForDisplay(startDate, "00:00")}~${formatDateKeyForDisplay(endDate, "23:59")}`;
}

function isDateInRange(date: string | null | undefined, startDate: string, endDate: string) {
  return Boolean(date && date >= startDate && date <= endDate);
}

function getOverviewRange(dateKey: string, view: DispatchGridView, cycle: DispatchCycle | null) {
  const requestedEnd = view === "day" ? dateKey : addDays(dateKey, view === "week" ? 6 : 27);
  const start = cycle && dateKey < cycle.periodStart ? cycle.periodStart : dateKey;
  const end = cycle && requestedEnd > cycle.periodEnd ? cycle.periodEnd : requestedEnd;

  if (start > end) {
    return {
      start,
      end,
      dayCount: 0,
      hasOverlap: false
    };
  }

  return {
    start,
    end,
    dayCount: diffDaysInclusive(start, end),
    hasOverlap: true
  };
}

function buildDispatchOverviewRangeSummary(storeId: string, view: DispatchGridView, dateKey: string, cycle: DispatchCycle | null, fallbackCycle: DispatchCycle | null): DispatchOverviewRangeSummary {
  const range = getOverviewRange(dateKey, view, cycle);
  const confirmedShifts =
    cycle && range.hasOverlap
      ? state.finalShifts.filter((shift) => shift.cycleId === cycle.id && shift.status === "confirmed" && isDateInRange(shift.date, range.start, range.end))
      : [];
  const targetTechnicianCount = cycle?.targetTechnicianIds.length ?? fallbackCycle?.targetTechnicianIds.length ?? 0;
  const scheduledTechnicianCount = new Set(confirmedShifts.map((shift) => shift.technicianId)).size;
  const confirmedDayCount = new Set(confirmedShifts.map((shift) => shift.date)).size;
  const confirmedOrderCount = range.hasOverlap
    ? state.arrangements.filter((arrangement) => arrangement.storeId === storeId && arrangement.technicianId && arrangement.status !== "cancelled" && isDateInRange(arrangement.date, range.start, range.end)).length
    : 0;
  const rangeTasks = range.hasOverlap
    ? state.floatingTasks.filter((task) => task.storeId === storeId && (!task.anchorDate || isDateInRange(task.anchorDate, range.start, range.end)))
    : [];
  const conflictCount = rangeTasks.filter((task) => task.type === "conflict").length;
  const applicationCount = rangeTasks.filter((task) => task.type !== "conflict").length;

  return {
    effectiveTimeLabel: range.hasOverlap ? formatDispatchDateRangeLabel(range.start, range.end) : "-",
    effectiveStartDate: range.hasOverlap ? range.start : null,
    effectiveStartDateLabel: range.hasOverlap ? formatDateKeyForDateDisplay(range.start) : "-",
    effectiveEndDate: range.hasOverlap ? range.end : null,
    effectiveEndDateLabel: range.hasOverlap ? formatDateKeyForDateDisplay(range.end) : "-",
    technicianCount: targetTechnicianCount,
    technicianCountLabel: `${scheduledTechnicianCount}/${targetTechnicianCount}`,
    confirmedDayLabel: `${confirmedDayCount}/${range.dayCount} 天`,
    confirmedOrderLabel: `${confirmedOrderCount} 单`,
    applicationCount,
    applicationCountLabel: `${applicationCount} 件`,
    conflictCount,
    conflictCountLabel: `${conflictCount} 件`
  };
}

function getSmartScheduleHistoricalOrderCount(storeId: string) {
  const snapshot = getEntityStoreSnapshot();
  const store = snapshot.stores.find((item) => item.id === storeId) ?? null;
  const { technicians } = getEntityMaps(storeId);
  const technicianNames = new Set(technicians.map((technician) => technician.name));
  const usableOrderStatuses = new Set(["confirmed", "scheduled", "inService", "completed"]);
  const matchedOrderCount = orders.filter((order) => {
    if (!usableOrderStatuses.has(order.status)) {
      return false;
    }

    return (
      (store?.name && order.storeName === store.name)
      || (store?.area && order.area === store.area)
      || (order.technicianName && technicianNames.has(order.technicianName))
    );
  }).length;
  const arrangementSignalCount = state.arrangements.filter((arrangement) => arrangement.storeId === storeId && arrangement.status !== "cancelled").length;

  return matchedOrderCount + arrangementSignalCount;
}

function buildSmartScheduleReadiness(storeId: string): SmartScheduleReadiness {
  const policy = getOrCreateSmartPolicy(storeId);
  const { technicians } = getEntityMaps(storeId);
  const requiredDays = Math.max(0, policy.coldStartRequiredDays);
  const startDate = policy.coldStartStartedAt.slice(0, 10);
  const readyAt = policy.coldStartEndsAt?.slice(0, 10) || addDays(startDate, Math.max(0, requiredDays - 1));
  const daysCollected = requiredDays === 0 ? 0 : Math.min(requiredDays, diffDaysInclusive(startDate, dispatchReferenceDateKey));
  const daysRemaining = Math.max(0, requiredDays - daysCollected);
  const observedOrderCount = getSmartScheduleHistoricalOrderCount(storeId);
  const requiredOrderCount = Math.max(0, policy.minimumHistoricalOrderCount);
  const preferenceTechnicianIds = new Set(
    state.smartTechnicianPreferences
      .filter((preference) => preference.shopId === storeId)
      .map((preference) => preference.technicianId)
  );
  const totalTechnicianCount = technicians.length;
  const preferenceCoveredTechnicianCount = technicians.filter((technician) => preferenceTechnicianIds.has(technician.id)).length;
  const preferenceCoveragePercent =
    totalTechnicianCount > 0 ? Math.round((preferenceCoveredTechnicianCount / totalTechnicianCount) * 100) : 0;
  const requiredPreferenceCoveragePercent = Math.max(0, policy.minimumPreferenceCoveragePercent);
  const dayProgress = requiredDays === 0 ? 1 : daysCollected / requiredDays;
  const orderProgress = requiredOrderCount === 0 ? 1 : Math.min(1, observedOrderCount / requiredOrderCount);
  const preferenceProgress =
    requiredPreferenceCoveragePercent === 0
      ? 1
      : Math.min(1, preferenceCoveragePercent / requiredPreferenceCoveragePercent);
  const progressPercent = Math.min(100, Math.round((dayProgress * 0.45 + orderProgress * 0.35 + preferenceProgress * 0.2) * 100));
  const missingItems: string[] = [];

  if (daysRemaining > 0) {
    missingItems.push(`冷启动观察还差 ${daysRemaining} 天`);
  }

  if (observedOrderCount < requiredOrderCount) {
    missingItems.push(`历史预约样本还差 ${requiredOrderCount - observedOrderCount} 单`);
  }

  if (preferenceCoveragePercent < requiredPreferenceCoveragePercent) {
    missingItems.push(`技师偏好覆盖还差 ${requiredPreferenceCoveragePercent - preferenceCoveragePercent}%`);
  }

  const canRunSmartSchedule = missingItems.length === 0;

  return {
    status: canRunSmartSchedule ? "ready" : daysRemaining > 0 ? "cold_start" : "attention",
    canRunSmartSchedule,
    canEnableFullAutomation: canRunSmartSchedule,
    progressPercent,
    daysCollected,
    requiredDays,
    daysRemaining,
    observedOrderCount,
    requiredOrderCount,
    preferenceCoveragePercent,
    requiredPreferenceCoveragePercent,
    preferenceCoveredTechnicianCount,
    totalTechnicianCount,
    readyAt,
    missingItems
  };
}

function countConfirmedHours(cycleId: string, technicianId: string) {
  return state.finalShifts.filter(
    (shift) => shift.cycleId === cycleId && shift.technicianId === technicianId && shift.status === "confirmed"
  ).length;
}

function getResponseTimestamp(cycleId: string, technicianId: string) {
  const timestamps = state.feedbacks
    .filter((entry) => entry.cycleId === cycleId && entry.technicianId === technicianId && entry.submittedAt)
    .map((entry) => new Date(entry.updatedAt ?? entry.submittedAt ?? dispatchReferenceNow).getTime());

  return timestamps.length > 0 ? Math.min(...timestamps) : Number.POSITIVE_INFINITY;
}

function findFeedbackStatus(cycleId: string, technicianId: string, date: string, hour: number) {
  return state.feedbacks.find(
    (entry) => entry.cycleId === cycleId && entry.technicianId === technicianId && entry.date === date && entry.hour === hour
  )?.status ?? "none";
}

function buildPublishedBookableSlots() {
  const nextSlots: DispatchBookableSlot[] = [];

  state.finalShifts
    .filter((shift) => shift.status === "confirmed")
    .forEach((shift) => {
      const cycle = getCycleById(shift.cycleId);

      if (!cycle || !["active", "final_confirmed", "confirmed"].includes(cycle.status)) {
        return;
      }

      nextSlots.push({
        id: `bookable-${shift.id}`,
        cycleId: shift.cycleId,
        storeId: shift.storeId,
        technicianId: shift.technicianId,
        date: shift.date,
        startAt: `${shift.date}T${String(shift.hour).padStart(2, "0")}:00:00+09:00`,
        endAt: `${shift.date}T${String(shift.hour + 1).padStart(2, "0")}:00:00+09:00`,
        status: "available",
        serviceMode: "store",
        capacity: 1
      });
    });

  state.finalBookableSlots = nextSlots;
}

function syncScheduleStoreFromDispatch() {
  const scheduleSnapshot = getScheduleStoreSnapshot();

  scheduleSnapshot.schedules
    .filter((schedule) => schedule.id.startsWith("dispatch-arrangement-") || schedule.id.startsWith("dispatch-task-"))
    .forEach((schedule) => removeSharedSchedule(schedule.id));

  const nextSchedules = [
    ...state.arrangements
      .filter((arrangement) => arrangement.technicianId && arrangement.status !== "cancelled")
      .map((arrangement) => ({
        id: `dispatch-arrangement-${arrangement.id}`,
        staffId: arrangement.technicianId as string,
        date: arrangement.date,
        startTime: arrangement.startTime,
        endTime: arrangement.endTime,
        status: "booked" as const,
        orderId: arrangement.orderId
      })),
    ...state.specialTasks
      .filter((task) => task.technicianId && task.status === "assigned")
      .map((task) => ({
        id: `dispatch-task-${task.id}`,
        staffId: task.technicianId as string,
        date: task.date,
        startTime: task.startTime,
        endTime: task.endTime,
        status: "blocked" as const,
        orderId: task.orderId ?? undefined
      }))
  ];

  if (nextSchedules.length > 0) {
    addSharedSchedules(nextSchedules);
  }
}

function rebuildFloatingTasks() {
  const previousMinimized = new Map(state.floatingTasks.map((task) => [`${task.type}:${task.relatedId}`, task.minimized]));
  const nextTasks: DispatchFloatingTask[] = [];
  const scheduleSnapshot = getScheduleStoreSnapshot();

  state.cycles
    .filter((cycle) => cycle.status === "collecting_feedback")
    .forEach((cycle) => {
      const { technicians } = getEntityMaps(cycle.storeId);

      cycle.targetTechnicianIds.forEach((technicianId) => {
        const hasSubmitted = state.feedbacks.some(
          (entry) => entry.cycleId === cycle.id && entry.technicianId === technicianId && Boolean(entry.submittedAt)
        );

        if (!hasSubmitted) {
          const technician = technicians.find((item) => item.id === technicianId);
          nextTasks.push({
            id: `float-feedback-${cycle.id}-${technicianId}`,
            storeId: cycle.storeId,
            type: "feedback",
            severity: cycle.feedbackDeadline && cycle.feedbackDeadline < `${dispatchReferenceDateKey}T23:59:59+09:00` ? "high" : "medium",
            relatedId: `${cycle.id}:${technicianId}`,
            title: "技师反馈待确认",
            description: `${technician?.name ?? technicianId} 还未提交 ${cycle.name} 的 24 小时反馈。`,
            dueAt: cycle.feedbackDeadline,
            minimizable: true,
            closable: false,
            minimized: previousMinimized.get(`feedback:${cycle.id}:${technicianId}`) ?? false,
            anchorDate: cycle.periodStart,
            anchorHour: 10,
            anchorKind: "feedback"
          });
        }
      });
    });

  state.specialTasks
    .filter((task) => task.status === "pending" && !task.technicianId)
    .forEach((task) => {
      nextTasks.push({
        id: `float-task-${task.id}`,
        storeId: task.storeId,
        type: "unassigned",
        severity: "high",
        relatedId: task.id,
        title: "特派任务未分配",
        description: `${task.note} ${task.startTime}-${task.endTime} 仍未安排技师。`,
        dueAt: `${task.date}T${task.startTime}:00+09:00`,
        minimizable: true,
        closable: false,
        minimized: previousMinimized.get(`unassigned:${task.id}`) ?? false,
        anchorDate: task.date,
        anchorHour: Number(task.startTime.slice(0, 2)),
        anchorKind: "task"
      });
    });

  state.arrangements.forEach((arrangement) => {
    if (!arrangement.technicianId || arrangement.status === "cancelled") {
      return;
    }

    const overlaps = scheduleSnapshot.schedules.filter((schedule) => {
      if (schedule.staffId !== arrangement.technicianId || schedule.date !== arrangement.date) {
        return false;
      }

      if (schedule.id === `dispatch-arrangement-${arrangement.id}`) {
        return false;
      }

      return Math.max(timeToMinutes(schedule.startTime), timeToMinutes(arrangement.startTime)) < Math.min(timeToMinutes(schedule.endTime), timeToMinutes(arrangement.endTime));
    });

    if (overlaps.length > 0) {
      nextTasks.push({
        id: `float-conflict-${arrangement.id}`,
        storeId: arrangement.storeId,
        type: "conflict",
        severity: "high",
        relatedId: arrangement.id,
        title: "预约发生撞车",
        description: `${arrangement.serviceName} 与当前已排时段重叠，需要立即改派或改时。`,
        dueAt: `${arrangement.date}T${arrangement.startTime}:00+09:00`,
        minimizable: true,
        closable: false,
        minimized: previousMinimized.get(`conflict:${arrangement.id}`) ?? false,
        anchorDate: arrangement.date,
        anchorHour: Number(arrangement.startTime.slice(0, 2)),
        anchorKind: "arrangement"
      });
    }
  });

  state.floatingTasks = nextTasks.sort((left, right) => {
    const severityScore = { high: 0, medium: 1, low: 2 };
    const delta = severityScore[left.severity] - severityScore[right.severity];
    return delta !== 0 ? delta : (left.dueAt ?? "").localeCompare(right.dueAt ?? "");
  });
}

function syncShiftPlanningProjection() {
  const stores = Array.from(new Set(state.cycles.map((cycle) => cycle.storeId)));

  stores.forEach((storeId) => {
    const representativeCycle = getPlanningCycle(storeId) ?? getActiveExecutionCycle(storeId);
    syncDispatchProjectionForStore({
      storeId,
      mode: representativeCycle?.mode ?? "STORE_ASSIGN_FINAL",
      slots: state.finalBookableSlots.filter((slot) => slot.storeId === storeId)
    });
  });
}

function rebuildDerivedState() {
  state.cycles = promoteDispatchCycles(state.cycles);
  buildPublishedBookableSlots();
  syncScheduleStoreFromDispatch();
  rebuildFloatingTasks();
  syncShiftPlanningProjection();
}

function notify() {
  rebuildDerivedState();
  persist();
  emitUpdate();
}

function shiftTimeWindow(startTime: string, endTime: string, minutes: number) {
  return {
    startTime: addMinutes(startTime, minutes),
    endTime: addMinutes(endTime, minutes)
  };
}

function updateCycle(nextCycle: DispatchCycle) {
  const index = state.cycles.findIndex((cycle) => cycle.id === nextCycle.id);

  if (index === -1) {
    state.cycles.push(nextCycle);
    return;
  }

  state.cycles[index] = nextCycle;
}

function createBaseCycle(storeId: string, seed?: DispatchCycle | null): DispatchCycle {
  const reference = seed ?? getPlanningCycle(storeId) ?? getActiveExecutionCycle(storeId);
  const periodStart = reference ? addDays(reference.periodEnd, 1) : addDays(dispatchReferenceDateKey, 7);
  const periodEnd = addDays(periodStart, 29);
  const templateType = reference?.templateType ?? "week";

  return {
    id: createDispatchId("cycle"),
    storeId,
    name: "新的待执行周期",
    creationMethod: "new",
    mode: "STORE_COLLECT_CONFIRM",
    status: "draft",
    currentStep: 1,
    templateType,
    periodStart,
    periodEnd,
    targetTechnicianIds: reference?.targetTechnicianIds ?? getStoreTechnicianIdsForDispatch(storeId),
    feedbackDeadline: `${addDays(periodStart, -2)}T18:00:00+09:00`,
    templateMatrix: cloneValue(reference?.templateMatrix ?? fillMatrixHours(templateType, [{ dayIndex: 1, startHour: 10, endHour: 22 }])),
    regularHolidayWeekdays: [...(reference?.regularHolidayWeekdays ?? [3])],
    ruleSet: cloneValue(reference?.ruleSet ?? buildDefaultRuleSet()),
    launchedAt: null,
    finalizedAt: null,
    activeAt: null,
    cancelledAt: null,
    lastAutoConfirmAt: null,
    autoConfirmSummary: null,
    updatedAt: dispatchReferenceNow
  };
}

function getPublishedCycleStatus(cycle: Pick<DispatchCycle, "periodStart" | "periodEnd">): DispatchCycle["status"] {
  return cycle.periodStart <= dispatchReferenceDateKey && cycle.periodEnd >= dispatchReferenceDateKey ? "active" : "confirmed";
}

function materializeStoreDirectAssignments(cycle: DispatchCycle, operatorId: string) {
  const seededShifts = buildSeedFinalShifts(
    cycle.storeId,
    cycle.id,
    cycle.targetTechnicianIds,
    getCycleDisplaySeedStartDate(cycle)
  ).map((shift) => ({
    ...shift,
    source: "manual" as const,
    ruleSnapshot: "store_direct_assignment",
    confirmedAt: dispatchReferenceNow,
    confirmedBy: operatorId
  }));

  state.finalShifts = [
    ...state.finalShifts.filter((shift) => shift.cycleId !== cycle.id),
    ...seededShifts
  ];
}

function normalizeCycleRuleSet(cycle: DispatchCycle): DispatchCycle {
  const defaultRuleSet = buildDefaultRuleSet();

  return {
    ...cycle,
    ruleSet: {
      ...defaultRuleSet,
      ...cycle.ruleSet,
      overtimeBlockedWeekdays: Array.isArray(cycle.ruleSet?.overtimeBlockedWeekdays) ? cycle.ruleSet.overtimeBlockedWeekdays : [],
      priorityRules: {
        ...defaultRuleSet.priorityRules,
        ...cycle.ruleSet?.priorityRules
      },
      notificationRules: {
        ...defaultRuleSet.notificationRules,
        ...cycle.ruleSet?.notificationRules,
        templates: Array.isArray(cycle.ruleSet?.notificationRules?.templates)
          ? cycle.ruleSet.notificationRules.templates
          : defaultRuleSet.notificationRules.templates
      }
    }
  };
}

function normalizeCycleStep(cycle: DispatchCycle): DispatchCycle {
  const normalizedCycle = normalizeCycleRuleSet(cycle);

  if (normalizedCycle.status === "rule_setting" || normalizedCycle.status === "rule_ready") {
    return { ...normalizedCycle, currentStep: 2 };
  }

  if (normalizedCycle.status === "collecting_feedback") {
    return { ...normalizedCycle, currentStep: 3 };
  }

  if (
    normalizedCycle.status === "feedback_closed" ||
    normalizedCycle.status === "ready_to_confirm" ||
    normalizedCycle.status === "confirmed" ||
    normalizedCycle.status === "final_confirmed" ||
    normalizedCycle.status === "active" ||
    normalizedCycle.status === "completed" ||
    normalizedCycle.status === "reopened" ||
    normalizedCycle.status === "smart_generated" ||
    normalizedCycle.status === "smart_exception_pending" ||
    normalizedCycle.status === "final_confirming" ||
    normalizedCycle.status === "manual_override"
  ) {
    return { ...normalizedCycle, currentStep: 4 };
  }

  if (normalizedCycle.currentStep === 3 && normalizedCycle.status === "draft") {
    return { ...normalizedCycle, currentStep: 2 };
  }

  return normalizedCycle;
}

function validateDispatchCycleDraft(cycle: DispatchCycle) {
  const start = new Date(`${cycle.periodStart}T00:00:00`).getTime();
  const end = new Date(`${cycle.periodEnd}T00:00:00`).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "周期日期不完整，请先选择开始和结束日期。";
  }

  if (start > end) {
    return "周期开始日期不能晚于结束日期。";
  }

  const dayCount = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;

  if (dayCount > 365) {
    return "排班周期最长 1 年，请缩短周期后再保存。";
  }

  if (getModeNeedsFeedback(cycle.mode)) {
    if (!cycle.feedbackDeadline) {
      return "商户确认模式必须设置技师反馈截止时间。";
    }

    if (cycle.feedbackDeadline.slice(0, 10) >= cycle.periodStart) {
      return "技师反馈截止时间必须早于周期开始日。";
    }
  }

  if (cycle.targetTechnicianIds.length === 0) {
    return "排班对象不能为空。";
  }

  if (cycle.ruleSet.minStaff > cycle.ruleSet.targetStaff || cycle.ruleSet.targetStaff > cycle.ruleSet.maxStaff) {
    return "人数规则必须满足 最小人数 <= 目标人数 <= 最大人数。";
  }

  return null;
}

function getFutureCycleCount(storeId: string, ignoreCycleId?: string) {
  return state.cycles.filter((cycle) => {
    if (cycle.storeId !== storeId || cycle.id === ignoreCycleId) {
      return false;
    }

    return cycle.status !== "active" && cycle.status !== "completed" && cycle.status !== "archived" && cycle.status !== "cancelled";
  }).length;
}

function getPlanningProgress(cycleId: string) {
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return null;
  }

  const totals = new Map<string, { hasSubmitted: boolean; hasUpdated: boolean; note: string }>();

  cycle.targetTechnicianIds.forEach((technicianId) => {
    totals.set(technicianId, { hasSubmitted: false, hasUpdated: false, note: "" });
  });

  state.feedbacks
    .filter((entry) => entry.cycleId === cycleId)
    .forEach((entry) => {
      const current = totals.get(entry.technicianId) ?? { hasSubmitted: false, hasUpdated: false, note: "" };
      totals.set(entry.technicianId, {
        hasSubmitted: current.hasSubmitted || Boolean(entry.submittedAt),
        hasUpdated: current.hasUpdated || entry.status === "updated",
        note: current.note || entry.note
      });
    });

  const values = [...totals.values()];

  return {
    submittedCount: values.filter((value) => value.hasSubmitted && !value.hasUpdated).length,
    updatedCount: values.filter((value) => value.hasUpdated).length,
    pendingCount: values.filter((value) => !value.hasSubmitted).length,
    totalCount: values.length
  };
}

export function useDispatchCenterStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getDispatchCenterSnapshot() {
  return getSnapshot();
}

export function getSmartScheduleReadiness(storeId: string) {
  hydrate();
  return buildSmartScheduleReadiness(storeId);
}

export function getDispatchOverviewSummary(storeId: string): DispatchOverviewSummary {
  hydrate();
  const activeCycle = getActiveExecutionCycle(storeId);
  const planningCycle = getPlanningCycle(storeId);
  const smartScheduleReadiness = buildSmartScheduleReadiness(storeId);
  const smartScheduleLatestRun =
    state.smartOptimizationRuns
      .filter((run) => run.shopId === storeId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  const smartScheduleOpenExceptionCount = state.smartExceptionQueue.filter(
    (exception) => exception.shopId === storeId && exception.status === "open"
  ).length;
  const confirmedShifts = activeCycle
    ? state.finalShifts.filter((shift) => shift.cycleId === activeCycle.id && shift.status === "confirmed")
    : [];
  const confirmedShiftCount = confirmedShifts.length;
  const confirmedDayCount = new Set(confirmedShifts.map((shift) => shift.date)).size;
  const activeCycleDayCount = activeCycle ? diffDaysInclusive(activeCycle.periodStart, activeCycle.periodEnd) : 0;
  const arrangementCount = state.arrangements.filter((arrangement) => arrangement.storeId === storeId && arrangement.technicianId && arrangement.status !== "cancelled").length;
  const applicationCount = state.floatingTasks.filter((task) => task.storeId === storeId).length;

  return {
    currentModeLabel: getCycleModeLabel(planningCycle?.mode ?? activeCycle?.mode ?? "STORE_ASSIGN_FINAL"),
    activePeriodLabel: activeCycle ? `${activeCycle.periodStart} - ${activeCycle.periodEnd}` : "-",
    effectiveTimeLabel: activeCycle ? formatDispatchDateRangeLabel(activeCycle.periodStart, activeCycle.periodEnd) : "-",
    technicianCount: activeCycle?.targetTechnicianIds.length ?? planningCycle?.targetTechnicianIds.length ?? 0,
    confirmedDayLabel: activeCycle ? `${confirmedDayCount}/${activeCycleDayCount} 天` : "-",
    confirmedShiftLabel: activeCycle ? `${confirmedShiftCount}/${Math.max(confirmedShiftCount, activeCycle.targetTechnicianIds.length * 8)} 格` : "-",
    confirmedArrangementLabel: `${arrangementCount}/${state.arrangements.filter((arrangement) => arrangement.storeId === storeId).length} 单`,
    applicationCountLabel: `${applicationCount} 件`,
    smartScheduleReadiness,
    smartScheduleLatestRun,
    smartScheduleOpenExceptionCount,
    activeCycle,
    planningCycle
  };
}

export function getDispatchOverviewRangeSummary(storeId: string, view: DispatchGridView, dateKey: string, cycleId?: string | null): DispatchOverviewRangeSummary {
  hydrate();
  const activeCycle = cycleId ? getCycleById(cycleId) : getActiveExecutionCycle(storeId);
  const planningCycle = getPlanningCycle(storeId);

  return buildDispatchOverviewRangeSummary(storeId, view, dateKey, activeCycle, planningCycle);
}

function buildDayGrid(storeId: string, cycle: DispatchCycle | null, dateKey: string): DispatchScheduleGridData {
  const { technicians } = getEntityMaps(storeId);
  const scheduleSnapshot = getScheduleStoreSnapshot();
  const currentHour = Number(dispatchReferenceNow.slice(11, 13));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const arrangementByOrderId = new Map(
    state.arrangements
      .filter((arrangement) => arrangement.storeId === storeId && arrangement.date === dateKey)
      .map((arrangement) => [arrangement.orderId, arrangement])
  );
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const rows = technicians
    .filter((technician) => !cycle || cycle.targetTechnicianIds.includes(technician.id))
    .map((technician) => {
      const cells = hours.map((hour) => {
        const liveSchedules = scheduleSnapshot.schedules.filter((schedule) => {
          if (schedule.staffId !== technician.id || schedule.date !== dateKey) {
            return false;
          }

          return timeToMinutes(schedule.startTime) < (hour + 1) * 60 && timeToMinutes(schedule.endTime) > hour * 60;
        });
        const confirmedShift = cycle
          ? state.finalShifts.find(
              (shift) =>
                shift.cycleId === cycle.id &&
                shift.technicianId === technician.id &&
                shift.date === dateKey &&
                shift.hour === hour &&
                shift.status === "confirmed"
            )
          : null;
        const waitlistedShift = cycle
          ? state.finalShifts.find(
              (shift) =>
                shift.cycleId === cycle.id &&
                shift.technicianId === technician.id &&
                shift.date === dateKey &&
                shift.hour === hour &&
                shift.status === "waitlisted"
            )
          : null;
        const weekday = getWeekday(dateKey);
        const templateDayIndex =
          cycle?.templateType === "day"
            ? 0
            : cycle?.templateType === "week"
              ? weekday
              : cycle
                ? Math.min(Math.max(0, Math.floor((new Date(`${dateKey}T00:00:00`).getTime() - new Date(`${cycle.periodStart}T00:00:00`).getTime()) / (24 * 60 * 60 * 1000))), 27)
                : 0;
        const isOpen =
          cycle?.templateMatrix[templateDayIndex]?.[hour] &&
          !cycle.regularHolidayWeekdays.includes(weekday);

        let status: DispatchScheduleCell["status"] = isOpen ? "open" : "closed";
        let title = isOpen ? "店铺开放" : "未开放";
        let detail = isOpen ? "可排班 / 可预约" : "非开放时段";
        const linkedSchedule = liveSchedules.find((schedule) => schedule.orderId) ?? liveSchedules[0];
        const orderId = linkedSchedule?.orderId;
        const linkedArrangement = orderId ? arrangementByOrderId.get(orderId) : undefined;
        const linkedOrder = orderId ? orderById.get(orderId) : undefined;
        const linkedOrderStatus = linkedOrder?.status;
        const appBookingTitle = getNeedoAppBookingTitle(orderId, linkedArrangement?.serviceName ?? linkedOrder?.itemName);
        const serviceStatus: DispatchScheduleServiceStatus | undefined =
          linkedArrangement?.status === "inService" || linkedOrderStatus === "inService" || linkedSchedule?.eventType === "attendance"
            ? "inService"
            : linkedArrangement?.status === "completed" || linkedOrderStatus === "completed"
              ? "completed"
              : linkedArrangement?.status === "pending"
                ? "pending"
                : linkedArrangement || orderId
                  ? "exception"
                  : undefined;
        const eventType = linkedSchedule?.eventType ?? (orderId ? "booking" : undefined);
        const detailTargetType = linkedSchedule?.detailTargetType ?? (orderId ? "order_detail" : undefined);
        const detailTargetId = linkedSchedule?.detailTargetId ?? orderId;

        if (liveSchedules.length > 1) {
          status = "conflict";
          title = "撞车";
          detail = "当前时段存在重叠预约或任务。";
        } else if (liveSchedules.some((schedule) => schedule.status === "booked")) {
          status = "booked";
          title = appBookingTitle ?? "有预约";
          detail = liveSchedules[0]?.orderId ? `订单 ${liveSchedules[0].orderId}` : "已绑定预约";
        } else if (liveSchedules.some((schedule) => schedule.status === "blocked")) {
          status = "other";
          title = "其他行程";
          detail = "休息 / 培训 / 特派占用";
        } else if (confirmedShift) {
          status = "confirmed";
          title = "确认勤务";
          detail = getFinalShiftStatusLabel("confirmed");
        } else if (waitlistedShift) {
          status = "pending";
          title = "待定班次";
          detail = getFinalShiftStatusLabel("waitlisted");
        }

        const isPast = dateKey < dispatchReferenceDateKey || (dateKey === dispatchReferenceDateKey && hour < currentHour);

        return {
          id: `${technician.id}-${dateKey}-${hour}`,
          date: dateKey,
          hour,
          technicianId: technician.id,
          technicianName: technician.name,
          status,
          title,
          detail,
          orderId,
          parentOrderId: linkedSchedule?.parentOrderId,
          appointmentId: linkedSchedule?.appointmentId ?? linkedSchedule?.id,
          eventType,
          isClickable: linkedSchedule?.isClickable ?? Boolean(detailTargetId),
          detailTargetType,
          detailTargetId,
          serviceStatus: status === "booked" || status === "conflict" || status === "pending" ? serviceStatus : undefined,
          serviceExceptionLabel:
            status === "conflict"
              ? "预约冲突"
              : status === "pending" || serviceStatus === "pending"
                ? "待取消"
                : status === "booked" && serviceStatus !== "inService" && serviceStatus !== "completed"
                  ? getScheduleExceptionLabel(orderId, technician.id, hour)
                  : undefined,
          darkened: isPast,
          isCurrent: dateKey === dispatchReferenceDateKey && hour === currentHour
        } satisfies DispatchScheduleCell;
      });

      return {
        technicianId: technician.id,
        technicianName: technician.nickname ? `${technician.nickname}` : technician.name,
        technicianSubtitle: `${technician.name} · ${cells.filter((cell) => ["confirmed", "booked", "other"].includes(cell.status)).length}h`,
        technicianAvatar: technician.avatar,
        scheduledHours: cells.filter((cell) => ["confirmed", "booked", "other"].includes(cell.status)).length,
        cells
      } satisfies DispatchScheduleRow;
    });

  return {
    cycle,
    dates: [dateKey],
    headers: hours.map((hour) => ({
      key: `${hour}`,
      label: `${String(hour).padStart(2, "0")}:00`,
      sublabel: hour === currentHour ? "当前" : "1h"
    })),
    rows,
    nowHour: currentHour
  };
}

function buildPeriodGrid(storeId: string, cycle: DispatchCycle | null, startDate: string, dateCount: number): DispatchScheduleGridData {
  const dates = Array.from({ length: dateCount }, (_, index) => addDays(startDate, index));
  const dayGrids = dates.map((date) => buildDayGrid(storeId, cycle, date));

  return {
    cycle,
    dates,
    headers: dates.map((date) => ({
      key: date,
      label: date.slice(5),
      sublabel: getTemplateDayLabel("week", getWeekday(date), date)
    })),
    rows: dayGrids[0]?.rows.map((row, rowIndex) => ({
      technicianId: row.technicianId,
      technicianName: row.technicianName,
      technicianSubtitle: row.technicianSubtitle,
      technicianAvatar: row.technicianAvatar,
      scheduledHours: dayGrids.reduce((sum, grid) => sum + grid.rows[rowIndex].cells.filter((cell) => ["confirmed", "booked", "other"].includes(cell.status)).length, 0),
      cells: dates.map((date, dateIndex) => {
        const dayCells = dayGrids[dateIndex].rows[rowIndex].cells;
        const bookedCount = dayCells.filter((cell) => cell.status === "booked").length;
        const confirmedCount = dayCells.filter((cell) => cell.status === "confirmed").length;
        const conflictCount = dayCells.filter((cell) => cell.status === "conflict").length;
        const pendingCount = dayCells.filter((cell) => cell.status === "pending").length;
        const arrangedCount = confirmedCount + bookedCount + pendingCount;
        const firstOrderCell = dayCells.find((cell) => cell.detailTargetType === "order_detail" && cell.detailTargetId);

        const status = conflictCount > 0 ? "conflict" : bookedCount > 0 ? "booked" : confirmedCount > 0 ? "confirmed" : pendingCount > 0 ? "pending" : "open";

        return {
          id: `${row.technicianId}-${date}`,
          date,
          hour: null,
          technicianId: row.technicianId,
          technicianName: row.technicianName,
          status,
          title: conflictCount > 0 ? `${conflictCount} 个冲突` : arrangedCount > 0 ? `${arrangedCount} 个安排` : "开放中",
          detail: `${confirmedCount} 确认 / ${bookedCount} 预约 / ${pendingCount} 待定`,
          orderId: bookedCount === 1 ? firstOrderCell?.orderId : undefined,
          parentOrderId: bookedCount === 1 ? firstOrderCell?.parentOrderId : undefined,
          appointmentId: bookedCount === 1 ? firstOrderCell?.appointmentId : undefined,
          eventType: bookedCount === 1 ? firstOrderCell?.eventType : undefined,
          isClickable: bookedCount === 1 ? firstOrderCell?.isClickable : undefined,
          detailTargetType: bookedCount === 1 ? firstOrderCell?.detailTargetType : undefined,
          detailTargetId: bookedCount === 1 ? firstOrderCell?.detailTargetId : undefined,
          dayTimeline: dayCells.map((cell) => ({
            hour: cell.hour ?? 0,
            status: cell.status,
            title: cell.title,
            detail: cell.detail,
            orderId: cell.orderId,
            parentOrderId: cell.parentOrderId,
            appointmentId: cell.appointmentId,
            eventType: cell.eventType,
            isClickable: cell.isClickable,
            detailTargetType: cell.detailTargetType,
            detailTargetId: cell.detailTargetId,
            serviceStatus: cell.serviceStatus,
            serviceExceptionLabel: cell.serviceExceptionLabel,
            darkened: cell.darkened,
            isCurrent: cell.isCurrent
          })),
          darkened: date < dispatchReferenceDateKey,
          isCurrent: date === dispatchReferenceDateKey
        } satisfies DispatchScheduleCell;
      })
    })) ?? [],
    nowHour: Number(dispatchReferenceNow.slice(11, 13))
  };
}

export function getDispatchScheduleGrid(storeId: string, view: DispatchGridView, dateKey: string, cycleId?: string | null): DispatchScheduleGridData {
  hydrate();
  const cycle = cycleId ? getCycleById(cycleId) : getActiveExecutionCycle(storeId);

  if (view === "day") {
    return buildDayGrid(storeId, cycle, dateKey);
  }

  if (view === "week") {
    return buildPeriodGrid(storeId, cycle, dateKey, 7);
  }

  return buildPeriodGrid(storeId, cycle, dateKey, 28);
}

export function getTodayArrangements(storeId: string, serviceMode: DispatchServiceMode) {
  hydrate();
  return state.arrangements
    .filter((arrangement) => arrangement.storeId === storeId && arrangement.date === dispatchReferenceDateKey && arrangement.serviceMode === serviceMode)
    .sort((left, right) => left.startTime.localeCompare(right.startTime));
}

export function getDispatchArrangementByOrderId(storeId: string, orderId: string) {
  hydrate();
  return state.arrangements.find((arrangement) => arrangement.storeId === storeId && arrangement.orderId === orderId) ?? null;
}

export function getSpecialTasks(storeId: string) {
  hydrate();
  return state.specialTasks
    .filter((task) => task.storeId === storeId)
    .sort((left, right) => `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`));
}

export function getDispatchHolidayRules(storeId: string, startDate?: string, endDate?: string) {
  hydrate();
  const persistedHolidayMap = new Map(
    state.holidays
      .filter((holiday) => holiday.storeId === storeId)
      .map((holiday) => [holiday.holidayDate, holiday])
  );

  return japanPublicHolidays2026
    .map((holiday) => {
      const persisted = persistedHolidayMap.get(holiday.holidayDate);

      return {
        ...holiday,
        storeId,
        deltaStaff: persisted?.deltaStaff ?? getDefaultHolidayDelta(holiday.holidayDate),
        tempRecruitEnabled: persisted?.tempRecruitEnabled ?? false
      } satisfies DispatchHolidayRule;
    })
    .filter((holiday) => (!startDate || holiday.holidayDate >= startDate) && (!endDate || holiday.holidayDate <= endDate))
    .sort((left, right) => left.holidayDate.localeCompare(right.holidayDate));
}

export function getFloatingTasks(storeId: string) {
  hydrate();
  return state.floatingTasks.filter((task) => task.storeId === storeId);
}

export function getCycleFeedbackMatrix(cycleId: string, dateKey: string): DispatchFeedbackMatrixRow[] {
  hydrate();
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return [];
  }

  const { technicians } = getEntityMaps(cycle.storeId);

  return cycle.targetTechnicianIds.map((technicianId) => {
    const technician = technicians.find((item) => item.id === technicianId);
    const note = state.feedbacks.find((entry) => entry.cycleId === cycleId && entry.technicianId === technicianId && entry.note)?.note ?? "";
    const cells = Array.from({ length: 24 }, (_, hour) => {
      const status = findFeedbackStatus(cycleId, technicianId, dateKey, hour);

      return {
        date: dateKey,
        hour,
        status,
        label: getFeedbackStatusLabel(status)
      };
    });

    return {
      technicianId,
      technicianName: technician?.name ?? technicianId,
      note,
      cells,
      submittedHours: cells.filter((cell) => cell.status === "available" || cell.status === "updated").length,
      unavailableHours: cells.filter((cell) => cell.status === "unavailable").length
    };
  });
}

export function createDispatchCycleDraft(storeId: string) {
  hydrate();
  const cycle = createBaseCycle(storeId);
  updateCycle(cycle);
  logAudit({
    operatorId: storeId,
    action: "dispatch.cycle.create_draft",
    targetType: "cycle",
    targetId: cycle.id,
    before: "",
    after: JSON.stringify({ id: cycle.id, periodStart: cycle.periodStart, periodEnd: cycle.periodEnd }),
    reason: "创建新的排班草稿"
  });
  notify();
  return cycle;
}

export function saveDispatchCycleDraft(nextCycle: DispatchCycle) {
  hydrate();
  const futureCycleCount = getFutureCycleCount(nextCycle.storeId, nextCycle.id);

  if (futureCycleCount >= 2 && !getCycleById(nextCycle.id)) {
    return { ok: false, message: "待执行周期已达上限，请先取消或归档旧周期。" };
  }

  const previous = getCycleById(nextCycle.id);
  const normalizedCycle = normalizeCycleStep({
    ...nextCycle,
    status: nextCycle.status === "draft" && nextCycle.currentStep >= 2 ? "rule_setting" : nextCycle.status
  });
  const validationMessage = validateDispatchCycleDraft(normalizedCycle);

  if (validationMessage) {
    return { ok: false, message: validationMessage };
  }

  updateCycle({
    ...normalizedCycle,
    updatedAt: dispatchReferenceNow
  });
  logAudit({
    operatorId: nextCycle.storeId,
    action: "dispatch.cycle.save_draft",
    targetType: "cycle",
    targetId: nextCycle.id,
    before: previous ? JSON.stringify(previous) : "",
    after: JSON.stringify(nextCycle),
    reason: "保存自动化排班草稿"
  });
  notify();
  return { ok: true };
}

export function launchDispatchCycle(cycleId: string, operatorId: string) {
  hydrate();
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return { ok: false, message: "找不到要发起的排班周期。" };
  }

  if (cycle.targetTechnicianIds.length === 0) {
    return { ok: false, message: "排班对象不能为空。" };
  }

  const validationMessage = validateDispatchCycleDraft(cycle);

  if (validationMessage) {
    return { ok: false, message: validationMessage };
  }

  if (getFutureCycleCount(cycle.storeId, cycle.id) >= 2 && cycle.status === "draft") {
    return { ok: false, message: "待执行周期已达上限，无法继续发起。" };
  }

  const needsFeedback = getModeNeedsFeedback(cycle.mode);
  const storeDirectAssign = cycle.mode === "STORE_ASSIGN_FINAL";
  const nextCycle: DispatchCycle = {
    ...cycle,
    status: needsFeedback ? "collecting_feedback" : storeDirectAssign ? getPublishedCycleStatus(cycle) : "final_confirming",
    currentStep: needsFeedback ? 3 : 4,
    launchedAt: dispatchReferenceNow,
    finalizedAt: storeDirectAssign ? dispatchReferenceNow : cycle.finalizedAt,
    activeAt: storeDirectAssign && getPublishedCycleStatus(cycle) === "active" ? dispatchReferenceNow : cycle.activeAt,
    updatedAt: dispatchReferenceNow
  };

  updateCycle(nextCycle);
  if (storeDirectAssign) {
    materializeStoreDirectAssignments(nextCycle, operatorId);
  }
  logAudit({
    operatorId,
    action: "dispatch.cycle.launch",
    targetType: "cycle",
    targetId: cycleId,
    before: JSON.stringify(cycle),
    after: JSON.stringify(nextCycle),
    reason: needsFeedback ? "发起技师反馈收集" : storeDirectAssign ? "商户直接排班保存即正式生效" : "进入系统自动确认"
  });
  notify();
  return { ok: true, cycle: nextCycle };
}

export function sendDispatchFeedbackReminder(cycleId: string, operatorId: string) {
  hydrate();
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return { ok: false, message: "找不到排班周期。" };
  }

  logAudit({
    operatorId,
    action: "dispatch.feedback.remind",
    targetType: "cycle",
    targetId: cycleId,
    before: "",
    after: JSON.stringify(getPlanningProgress(cycleId)),
    reason: "提醒未反馈技师尽快提交"
  });
  notify();
  return { ok: true };
}

export function closeDispatchFeedback(cycleId: string, operatorId: string) {
  hydrate();
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return { ok: false, message: "找不到排班周期。" };
  }

  const nextCycle = {
    ...cycle,
    status: "feedback_closed" as const,
    currentStep: 4 as const,
    updatedAt: dispatchReferenceNow
  };

  updateCycle(nextCycle);
  logAudit({
    operatorId,
    action: "dispatch.feedback.close",
    targetType: "cycle",
    targetId: cycleId,
    before: JSON.stringify(cycle),
    after: JSON.stringify(nextCycle),
    reason: "提前结束反馈并进入最终确认"
  });
  notify();
  return { ok: true, cycle: nextCycle };
}

export function runDispatchAutoConfirm(cycleId: string, operatorId: string) {
  hydrate();
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return { ok: false, message: "找不到排班周期。" };
  }

  const { technicians } = getEntityMaps(cycle.storeId);
  const relevantDates = enumerateDateKeys(cycle.periodStart, cycle.periodEnd).slice(0, cycle.templateType === "day" ? 1 : cycle.templateType === "week" ? 7 : 28);
  const nextFinalShifts = state.finalShifts.filter((shift) => shift.cycleId !== cycleId);
  let confirmedCount = 0;
  let waitlistedCount = 0;
  let shortageCount = 0;
  let overflowCount = 0;

  relevantDates.forEach((dateKey) => {
    for (let hour = 0; hour < 24; hour += 1) {
      const weekday = getWeekday(dateKey);
      const templateDayIndex =
        cycle.templateType === "day" ? 0 : cycle.templateType === "week" ? weekday : Math.min(Math.max(0, relevantDates.indexOf(dateKey)), 27);
      const isOpen = cycle.templateMatrix[templateDayIndex]?.[hour] && !cycle.regularHolidayWeekdays.includes(weekday);

      if (!isOpen) {
        continue;
      }

      const capacity = buildCapacityForSlot(cycle, dateKey);

      if (capacity.maxCount === 0) {
        continue;
      }

      const candidates: DispatchCandidate[] = technicians
        .filter((technician) => cycle.targetTechnicianIds.includes(technician.id))
        .map((technician) => ({
          technician,
          confirmedHours: countConfirmedHours(cycleId, technician.id),
          responseTimestamp: getResponseTimestamp(cycleId, technician.id),
          supportsSelectedLanguage:
            cycle.ruleSet.priorityRules.selectedLanguages.length === 0
              ? false
              : technician.languages.some((language) => cycle.ruleSet.priorityRules.selectedLanguages.includes(language)),
          supportsForeigners: Boolean(technician.canServeForeigners),
          isPreferredTechnician: cycle.ruleSet.priorityRules.selectedTechnicianIds.includes(technician.id)
        }))
        .filter((candidate) => {
          if (cycle.mode === "STORE_COLLECT_CONFIRM") {
            const feedbackStatus = findFeedbackStatus(cycleId, candidate.technician.id, dateKey, hour);
            return feedbackStatus === "available" || feedbackStatus === "updated";
          }

          return true;
        });

      const ranked = rankDispatchCandidates(cycle, candidates).slice(0, capacity.maxCount + 2);

      if (ranked.length < capacity.targetCount) {
        shortageCount += 1;
      }

      if (ranked.length > capacity.maxCount) {
        overflowCount += 1;
      }

      ranked.forEach((candidate, index) => {
        const status = index < capacity.maxCount ? "confirmed" : "waitlisted";
        nextFinalShifts.push({
          id: `${cycleId}-${candidate.technician.id}-${dateKey}-${hour}`,
          cycleId,
          storeId: cycle.storeId,
          technicianId: candidate.technician.id,
          date: dateKey,
          hour,
          status,
          source: "auto",
          ruleSnapshot: JSON.stringify({
            targetCount: capacity.targetCount,
            maxCount: capacity.maxCount,
            candidateId: candidate.technician.id
          }),
          confirmedAt: dispatchReferenceNow,
          confirmedBy: operatorId
        });

        if (status === "confirmed") {
          confirmedCount += 1;
        } else {
          waitlistedCount += 1;
        }
      });
    }
  });

  state.finalShifts = nextFinalShifts;
  updateCycle({
    ...cycle,
    status: "final_confirming",
    currentStep: 4,
    lastAutoConfirmAt: dispatchReferenceNow,
    autoConfirmSummary: {
      confirmedCount,
      waitlistedCount,
      shortageCount,
      overflowCount
    },
    updatedAt: dispatchReferenceNow
  });
  logAudit({
    operatorId,
    action: "dispatch.auto_confirm.run",
    targetType: "cycle",
    targetId: cycleId,
    before: "",
    after: JSON.stringify({ confirmedCount, waitlistedCount, shortageCount, overflowCount }),
    reason: "执行自动确认算法"
  });
  notify();
  return {
    ok: true,
    summary: {
      confirmedCount,
      waitlistedCount,
      shortageCount,
      overflowCount
    }
  };
}

export function adjustDispatchFinalShift({
  cycleId,
  technicianId,
  date,
  hour,
  status,
  operatorId
}: {
  cycleId: string;
  technicianId: string;
  date: string;
  hour: number;
  status: DispatchFinalShift["status"];
  operatorId: string;
}) {
  hydrate();
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return { ok: false, message: "找不到排班周期。" };
  }

  state.finalShifts = state.finalShifts.filter(
    (shift) => !(shift.cycleId === cycleId && shift.technicianId === technicianId && shift.date === date && shift.hour === hour)
  );
  state.finalShifts.push({
    id: `${cycleId}-${technicianId}-${date}-${hour}`,
    cycleId,
    storeId: cycle.storeId,
    technicianId,
    date,
    hour,
    status,
    source: "manual",
    ruleSnapshot: "manual_adjustment",
    confirmedAt: dispatchReferenceNow,
    confirmedBy: operatorId
  });
  logAudit({
    operatorId,
    action: "dispatch.final_shift.adjust",
    targetType: "final_shift",
    targetId: `${cycleId}:${technicianId}:${date}:${hour}`,
    before: "",
    after: JSON.stringify({ status }),
    reason: "人工微调最终班表并通知相关技师"
  });
  notify();
  return { ok: true };
}

export function finalizeDispatchCycle(cycleId: string, operatorId: string) {
  hydrate();
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return { ok: false, message: "找不到排班周期。" };
  }

  const activeCount = state.cycles.filter((item) => item.storeId === cycle.storeId && item.status === "active").length;
  const futureCount = getFutureCycleCount(cycle.storeId, cycle.id);

  if (activeCount >= 1 && futureCount >= 2 && cycle.status !== "active") {
    return { ok: false, message: "当前已有执行周期和 2 个待执行周期，不能继续发布。" };
  }

  const nextStatus =
    cycle.periodStart <= dispatchReferenceDateKey && cycle.periodEnd >= dispatchReferenceDateKey
      ? "active"
      : "confirmed";

  const nextCycle: DispatchCycle = {
    ...cycle,
    status: nextStatus,
    currentStep: 4,
    finalizedAt: dispatchReferenceNow,
    activeAt: nextStatus === "active" ? dispatchReferenceNow : cycle.activeAt,
    updatedAt: dispatchReferenceNow
  };

  updateCycle(nextCycle);
  logAudit({
    operatorId,
    action: "dispatch.cycle.finalize",
    targetType: "cycle",
    targetId: cycleId,
    before: JSON.stringify(cycle),
    after: JSON.stringify(nextCycle),
    reason: "发布最终班表并生成最终可预约槽位"
  });
  notify();
  return { ok: true, cycle: nextCycle };
}

function getOrCreateSmartPolicy(storeId: string) {
  const existing = state.smartAutomationPolicies.find((policy) => policy.shopId === storeId);

  if (existing) {
    Object.assign(existing, withSmartPolicyDefaults(existing));
    return existing;
  }

  const [policy] = buildSeedSmartPolicies(storeId);
  state.smartAutomationPolicies.push(policy);
  return policy;
}

function getSmartCycleForStore(storeId: string, cycleId?: string | null) {
  if (cycleId) {
    return getCycleById(cycleId);
  }

  return getPlanningCycle(storeId) ?? getActiveExecutionCycle(storeId);
}

function isSameFinalShift(left: DispatchFinalShift, right: DispatchFinalShift) {
  return left.cycleId === right.cycleId && left.technicianId === right.technicianId && left.date === right.date && left.hour === right.hour;
}

function getSmartCycleDayCount(cycle: DispatchCycle) {
  return diffDaysInclusive(cycle.periodStart, cycle.periodEnd);
}

function deriveSmartColdStartStatus(storeId: string, policy: ScheduleAutomationPolicy): SmartScheduleColdStartStatus {
  if (!policy.enabled) {
    return "not_enabled";
  }

  if (policy.mode === "auto_schedule") {
    return "cold_start_ready";
  }

  const hasCountdown = state.smartExceptionQueue.some(
    (exception) => exception.shopId === storeId && exception.status === "auto_handling_countdown"
  );

  if (hasCountdown) {
    return "smart_auto_handling_countdown";
  }

  const hasOpenException = state.smartExceptionQueue.some(
    (exception) => exception.shopId === storeId && (exception.status === "open" || exception.status === "human_override_pending")
  );

  if (hasOpenException) {
    return "smart_exception_pending";
  }

  const readiness = buildSmartScheduleReadiness(storeId);

  if (!readiness.canRunSmartSchedule) {
    return "cold_start_collecting";
  }

  return policy.mode === "smart_schedule" ? "smart_running" : "cold_start_ready";
}

function refreshSmartPolicyStatus(storeId: string) {
  const policy = getOrCreateSmartPolicy(storeId);
  policy.coldStartStatus = deriveSmartColdStartStatus(storeId, policy);
  policy.updatedAt = dispatchReferenceNow;
  return policy;
}

export function updateSmartScheduleAutomationPolicy(
  storeId: string,
  patch: Partial<
    Pick<
      ScheduleAutomationPolicy,
      | "enabled"
      | "automationLevel"
      | "mode"
      | "minCycleDays"
      | "autoExceptionActionDelayMinutes"
      | "coldStartStatus"
      | "dataCollectionEnabled"
      | "manualInputEnabled"
      | "qualityAutoConfirmThreshold"
      | "qualityReviewThreshold"
      | "coldStartRequiredDays"
      | "coldStartStartedAt"
      | "coldStartEndsAt"
      | "minimumHistoricalOrderCount"
      | "minimumPreferenceCoveragePercent"
      | "autoCreateCycleEnabled"
      | "autoCollectFeedbackEnabled"
      | "autoSubmitFromHistoryEnabled"
      | "autoConfirmEnabled"
      | "autoConfirmScoreThreshold"
      | "shortageStrategy"
      | "overflowStrategy"
      | "unsubmittedStaffStrategy"
      | "smartScheduleBillingStatus"
      | "smartScheduleFreeUntil"
      | "smartSchedulePlanRequired"
    >
  >
) {
  hydrate();
  const policy = getOrCreateSmartPolicy(storeId);
  Object.assign(policy, patch, {
    autoConfirmScoreThreshold: patch.qualityAutoConfirmThreshold ?? patch.autoConfirmScoreThreshold ?? policy.autoConfirmScoreThreshold,
    mode: patch.manualInputEnabled || patch.dataCollectionEnabled === false ? "auto_schedule" : patch.mode ?? policy.mode,
    updatedAt: dispatchReferenceNow
  });
  refreshSmartPolicyStatus(storeId);
  notify();
  return policy;
}

export function updateSmartScheduleDataSource(
  storeId: string,
  sourceType: SmartScheduleDataSourceType,
  patch: Partial<Pick<SmartScheduleDataSource, "enabled" | "status" | "confidenceScore" | "lastCollectedAt" | "missingReason" | "fallbackUsed">>
) {
  hydrate();

  const seed = buildSeedSmartDataSources(storeId).find((source) => source.sourceType === sourceType);
  const existing = state.smartDataSources.find((source) => source.shopId === storeId && source.sourceType === sourceType);
  const source = existing ?? seed;

  if (!source) {
    return null;
  }

  if (!existing) {
    state.smartDataSources.push(source);
  }

  const enabled = patch.enabled ?? source.enabled;
  const fallbackUsed = patch.fallbackUsed ?? source.fallbackUsed;

  Object.assign(source, {
    ...patch,
    enabled,
    fallbackUsed,
    status: patch.status ?? (enabled ? (fallbackUsed ? "fallback" : "ready") : "missing"),
    lastCollectedAt: enabled ? (patch.lastCollectedAt ?? source.lastCollectedAt ?? dispatchReferenceNow) : source.lastCollectedAt,
    updatedAt: dispatchReferenceNow
  });

  notify();
  return source;
}

export function enableSmartSchedule(storeId: string, operatorId: string) {
  hydrate();
  const policy = updateSmartScheduleAutomationPolicy(storeId, {
    enabled: true,
    mode: "smart_schedule",
    dataCollectionEnabled: true,
    manualInputEnabled: false,
    automationLevel: "full_auto"
  });
  state.smartDataSources = [
    ...state.smartDataSources.filter((source) => source.shopId !== storeId),
    ...buildSeedSmartDataSources(storeId)
  ];
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.enable",
    targetType: "cycle",
    targetId: storeId,
    before: "",
    after: JSON.stringify({ policyId: policy.id, mode: policy.mode, status: policy.coldStartStatus }),
    reason: "启用全智能无人值守排班，商户端和技师端进入智能排班状态"
  });
  notify();
  return policy;
}

export function disableSmartSchedule(storeId: string, operatorId: string) {
  hydrate();
  const policy = updateSmartScheduleAutomationPolicy(storeId, {
    enabled: false,
    mode: "auto_schedule",
    automationLevel: "recommend_only",
    coldStartStatus: "not_enabled"
  });
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.disable",
    targetType: "cycle",
    targetId: storeId,
    before: "",
    after: JSON.stringify({ policyId: policy.id, mode: policy.mode, status: policy.coldStartStatus }),
    reason: "停用全智能排班"
  });
  notify();
  return policy;
}

export function switchSmartScheduleToAuto(storeId: string, operatorId: string, reason = "商户选择手动输入条件") {
  hydrate();
  const policy = updateSmartScheduleAutomationPolicy(storeId, {
    enabled: true,
    mode: "auto_schedule",
    automationLevel: "semi_auto",
    manualInputEnabled: true,
    dataCollectionEnabled: false
  });
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.switch_to_auto",
    targetType: "cycle",
    targetId: storeId,
    before: "",
    after: JSON.stringify({ policyId: policy.id, mode: policy.mode }),
    reason
  });
  notify();
  return policy;
}

export function upsertSmartTechnicianPreference(input: {
  storeId: string;
  technicianId: string;
  weekday: number;
  patch: Partial<Omit<TechnicianSchedulePreference, "id" | "shopId" | "technicianId" | "weekday" | "createdAt" | "updatedAt">>;
}) {
  hydrate();
  const existing = state.smartTechnicianPreferences.find(
    (preference) => preference.shopId === input.storeId && preference.technicianId === input.technicianId && preference.weekday === input.weekday
  );

  if (existing) {
    Object.assign(existing, input.patch, { updatedAt: dispatchReferenceNow });
    notify();
    return existing;
  }

  const [seed] = buildSeedSmartPreferences(input.storeId, [input.technicianId]).filter((preference) => preference.weekday === input.weekday);
  const nextPreference: TechnicianSchedulePreference = {
    ...(seed ?? {
      id: `smart-pref-${input.storeId}-${input.technicianId}-${input.weekday}`,
      technicianId: input.technicianId,
      shopId: input.storeId,
      weekday: input.weekday,
      startTime: "10:00",
      endTime: "21:00",
      available: true,
      maxHoursDay: 8,
      maxHoursWeek: 42,
      acceptOvertime: false,
      acceptHoliday: true,
      acceptTempShift: true,
      bufferMinutes: 20,
      autoSubmitEnabled: true,
      priority: 2,
      createdAt: dispatchReferenceNow,
      updatedAt: dispatchReferenceNow
    }),
    ...input.patch,
    updatedAt: dispatchReferenceNow
  };

  state.smartTechnicianPreferences.push(nextPreference);
  notify();
  return nextPreference;
}

export function runDispatchSmartSchedule({
  cycleId,
  operatorId,
  runType = "generate",
  storeId
}: {
  cycleId?: string | null;
  operatorId: string;
  runType?: SmartScheduleRunType;
  storeId: string;
}) {
  hydrate();
  const cycle = getSmartCycleForStore(storeId, cycleId);

  if (!cycle) {
    return { ok: false, message: "找不到可用于智能排班的周期。" };
  }

  const policy = getOrCreateSmartPolicy(cycle.storeId);
  const readiness = buildSmartScheduleReadiness(cycle.storeId);

  if (runType !== "preview" && !readiness.canRunSmartSchedule) {
    return {
      ok: false,
      message: `智能排班仍在冷启动预留期：${readiness.missingItems.join("，")}。可先运行模拟预览。`,
      readiness
    };
  }

  if (runType !== "preview" && policy.mode === "smart_schedule" && getSmartCycleDayCount(cycle) < policy.minCycleDays) {
    return {
      ok: false,
      message: `全智能排班最低周期为 ${policy.minCycleDays} 天。当前周期 ${cycle.periodStart} - ${cycle.periodEnd} 不足 1 个月，请延长后再生成。`
    };
  }

  const { technicians } = getEntityMaps(cycle.storeId);
  const engineContext = {
    cycle,
    policy,
    technicians,
    preferences: state.smartTechnicianPreferences.filter((preference) => preference.shopId === cycle.storeId),
    arrangements: state.arrangements.filter((arrangement) => arrangement.storeId === cycle.storeId),
    finalShifts: state.finalShifts.filter((shift) => shift.cycleId === cycle.id),
    runType,
    operatorId
  };
  const engine = new SmartScheduleEngine(engineContext);
  const result = engine.generateSmartSchedule(cycle.id);
  const enrichedExceptions = result.exceptions.map((exception, index) => {
    const recommendation = engine.recommendEmergencyAction(exception);
    const baseException: ScheduleExceptionQueueItem = {
      ...exception,
      recommendedActionJson: JSON.stringify({
        action: recommendation.action,
        api: `/api/merchant/schedule/smart/exceptions/${exception.id}/execute-now`
      }),
      reasonJson: recommendation.reasonJson,
      countdownSeconds: policy.autoExceptionActionDelayMinutes * 60,
      autoExecuteAt: null,
      humanOverride: false
    };
    const shouldStartCountdown =
      runType !== "preview" &&
      policy.enabled &&
      policy.mode === "smart_schedule" &&
      (exception.severity === "high" || index === 0);

    return shouldStartCountdown ? engine.startAutoActionCountdown(baseException) : baseException;
  });
  const effectiveAutoConfirmed = runType !== "preview" && result.autoConfirmed;
  const effectiveFinalShifts = runType === "preview" ? [] : result.finalShifts;
  const run = {
    ...result.run,
    autoConfirmed: effectiveAutoConfirmed,
    outputSnapshotJson: JSON.stringify({
      recommendationCount: result.recommendations.length,
      exceptionCount: enrichedExceptions.length,
      finalShiftCount: effectiveFinalShifts.length
    })
  };
  const manualShifts = state.finalShifts.filter((shift) => shift.cycleId === cycle.id && shift.source === "manual");
  const generatedShifts = effectiveFinalShifts.filter((shift) => !manualShifts.some((manualShift) => isSameFinalShift(manualShift, shift)));
  const hasHighOpenException = enrichedExceptions.some(
    (exception) => (exception.status === "open" || exception.status === "auto_handling_countdown") && exception.severity === "high"
  );
  const hasOpenException = enrichedExceptions.some(
    (exception) => exception.status === "open" || exception.status === "auto_handling_countdown" || exception.status === "human_override_pending"
  );
  const nextStatus: DispatchCycle["status"] =
    effectiveAutoConfirmed && policy.automationLevel === "full_auto" && !hasHighOpenException
      ? cycle.periodStart <= dispatchReferenceDateKey && cycle.periodEnd >= dispatchReferenceDateKey
        ? "active"
        : "confirmed"
      : hasOpenException
        ? "smart_exception_pending"
        : "smart_generated";

  state.smartDemandForecasts = [
    ...state.smartDemandForecasts.filter((forecast) => forecast.cycleId !== cycle.id),
    ...result.forecasts
  ];
  state.smartOptimizationRuns = [
    run,
    ...state.smartOptimizationRuns.filter((item) => item.id !== run.id)
  ];
  state.smartRecommendations = [
    ...state.smartRecommendations.filter((recommendation) => recommendation.cycleId !== cycle.id),
    ...result.recommendations
  ];
  state.smartExceptionQueue = [
    ...state.smartExceptionQueue.filter((exception) => exception.cycleId !== cycle.id),
    ...enrichedExceptions
  ];
  state.smartDataSources = [
    ...state.smartDataSources.filter((source) => source.shopId !== cycle.storeId),
    ...mergeSmartDataSourcesWithExisting(cycle.storeId, engine.collectColdStartData(cycle.storeId))
  ];
  state.smartSignals = [
    ...state.smartSignals.filter((signal) => signal.cycleId !== cycle.id),
    ...engine.collectExternalSignals(cycle.id)
  ];
  state.smartRuleExplanations = [
    ...state.smartRuleExplanations.filter((explanation) => explanation.cycleId !== cycle.id),
    ...engine.explainRules(cycle.id)
  ];
  state.smartDecisions = [
    ...state.smartDecisions.filter((decision) => decision.cycleId !== cycle.id),
    ...engine.buildDecisionLog(cycle.id, result.recommendations, enrichedExceptions)
  ];

  if (runType !== "preview") {
    state.finalShifts = [
      ...state.finalShifts.filter((shift) => shift.cycleId !== cycle.id || shift.source === "manual"),
      ...generatedShifts
    ];
  }

  updateCycle({
    ...cycle,
    mode: "STORE_ASSIGN_FINAL",
    status: nextStatus,
    currentStep: 4,
    lastAutoConfirmAt: effectiveAutoConfirmed ? dispatchReferenceNow : cycle.lastAutoConfirmAt,
    autoConfirmSummary: {
      confirmedCount: generatedShifts.filter((shift) => shift.status === "confirmed").length,
      waitlistedCount: generatedShifts.filter((shift) => shift.status === "waitlisted").length,
      shortageCount: run.shortageCount,
      overflowCount: run.overflowCount
    },
    finalizedAt: nextStatus === "confirmed" || nextStatus === "active" ? dispatchReferenceNow : cycle.finalizedAt,
    activeAt: nextStatus === "active" ? dispatchReferenceNow : cycle.activeAt,
    updatedAt: dispatchReferenceNow
  });
  refreshSmartPolicyStatus(cycle.storeId);
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.run",
    targetType: "cycle",
    targetId: cycle.id,
    before: JSON.stringify(cycle),
    after: JSON.stringify({ runId: run.id, score: run.score, status: nextStatus, autoConfirmed: effectiveAutoConfirmed }),
    reason: "执行智能排班生成、质量评分和异常队列计算"
  });
  notify();
  return {
    ok: true,
    cycle: getCycleById(cycle.id),
    run,
    result: { ...result, exceptions: enrichedExceptions, finalShifts: effectiveFinalShifts, autoConfirmed: effectiveAutoConfirmed }
  };
}

export function confirmDispatchSmartSchedule(cycleId: string, operatorId: string) {
  hydrate();
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return { ok: false, message: "找不到排班周期。" };
  }

  const latestRun = state.smartOptimizationRuns
    .filter((run) => run.cycleId === cycleId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const recommendations = state.smartRecommendations.filter(
    (recommendation) => recommendation.cycleId === cycleId && (!latestRun || recommendation.runId === latestRun.id)
  );

  if (recommendations.length === 0) {
    return { ok: false, message: "请先智能生成排班。" };
  }

  const manualShifts = state.finalShifts.filter((shift) => shift.cycleId === cycleId && shift.source === "manual");
  const smartShifts: DispatchFinalShift[] = recommendations
    .filter((recommendation) => recommendation.recommendationType === "confirm" || recommendation.recommendationType === "waitlist")
    .map((recommendation): DispatchFinalShift => ({
      id: `smart-confirm-${cycleId}-${recommendation.technicianId}-${recommendation.date}-${recommendation.startTime.replace(":", "")}`,
      cycleId,
      storeId: cycle.storeId,
      technicianId: recommendation.technicianId,
      date: recommendation.date,
      hour: Number(recommendation.startTime.slice(0, 2)),
      status: recommendation.recommendationType === "confirm" ? "confirmed" : "waitlisted",
      source: "auto",
      ruleSnapshot: recommendation.reasonJson,
      confirmedAt: dispatchReferenceNow,
      confirmedBy: operatorId
    }))
    .filter((shift) => !manualShifts.some((manualShift) => isSameFinalShift(manualShift, shift)));
  const nextStatus =
    cycle.periodStart <= dispatchReferenceDateKey && cycle.periodEnd >= dispatchReferenceDateKey
      ? "active"
      : "confirmed";
  const nextCycle: DispatchCycle = {
    ...cycle,
    status: nextStatus,
    currentStep: 4,
    finalizedAt: dispatchReferenceNow,
    activeAt: nextStatus === "active" ? dispatchReferenceNow : cycle.activeAt,
    updatedAt: dispatchReferenceNow
  };

  state.finalShifts = [
    ...state.finalShifts.filter((shift) => shift.cycleId !== cycleId || shift.source === "manual"),
    ...smartShifts
  ];
  state.smartRecommendations = state.smartRecommendations.map((recommendation) =>
    recommendation.cycleId === cycleId && recommendation.recommendationType === "confirm"
      ? { ...recommendation, status: "manual_confirmed" }
      : recommendation
  );
  updateCycle(nextCycle);
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.confirm",
    targetType: "cycle",
    targetId: cycleId,
    before: JSON.stringify(cycle),
    after: JSON.stringify({ confirmedCount: smartShifts.filter((shift) => shift.status === "confirmed").length, nextStatus }),
    reason: "人工确认智能排班结果并生成最终可预约槽位"
  });
  notify();
  return { ok: true, cycle: nextCycle };
}

export function resolveSmartScheduleException(exceptionId: string, operatorId: string, status: ScheduleExceptionQueueItem["status"] = "resolved") {
  hydrate();
  const exception = state.smartExceptionQueue.find((item) => item.id === exceptionId);

  if (!exception) {
    return { ok: false, message: "找不到智能排班异常。" };
  }

  exception.status = status;
  exception.resolvedBy = operatorId;
  exception.resolvedAt = dispatchReferenceNow;
  exception.updatedAt = dispatchReferenceNow;
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.exception.resolve",
    targetType: "cycle",
    targetId: exception.cycleId,
    before: JSON.stringify({ exceptionId, previousStatus: "open" }),
    after: JSON.stringify({ exceptionId, status }),
    reason: "处理智能排班异常队列"
  });
  notify();
  return { ok: true, exception };
}

function getSmartExceptionEngine(exception: ScheduleExceptionQueueItem, operatorId: string) {
  const cycle = getCycleById(exception.cycleId);

  if (!cycle) {
    return null;
  }

  const { technicians } = getEntityMaps(cycle.storeId);

  return new SmartScheduleEngine({
    cycle,
    policy: getOrCreateSmartPolicy(cycle.storeId),
    technicians,
    preferences: state.smartTechnicianPreferences.filter((preference) => preference.shopId === cycle.storeId),
    arrangements: state.arrangements.filter((arrangement) => arrangement.storeId === cycle.storeId),
    finalShifts: state.finalShifts.filter((shift) => shift.cycleId === cycle.id),
    runType: "recalculate",
    operatorId
  });
}

function replaceSmartException(nextException: ScheduleExceptionQueueItem) {
  state.smartExceptionQueue = state.smartExceptionQueue.map((exception) =>
    exception.id === nextException.id ? nextException : exception
  );
}

export function startSmartExceptionAutoActionCountdown(exceptionId: string, operatorId: string) {
  hydrate();
  const exception = state.smartExceptionQueue.find((item) => item.id === exceptionId);

  if (!exception) {
    return { ok: false, message: "找不到智能排班异常。" };
  }

  const engine = getSmartExceptionEngine(exception, operatorId);

  if (!engine) {
    return { ok: false, message: "找不到排班周期。" };
  }

  const nextException = engine.startAutoActionCountdown(exception);
  replaceSmartException(nextException);
  refreshSmartPolicyStatus(exception.shopId);
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.exception.countdown",
    targetType: "cycle",
    targetId: exception.cycleId,
    before: JSON.stringify(exception),
    after: JSON.stringify(nextException),
    reason: "启动异常自动处理倒计时"
  });
  notify();
  return { ok: true, exception: nextException };
}

export function cancelSmartExceptionAutoAction(exceptionId: string, operatorId: string) {
  hydrate();
  const exception = state.smartExceptionQueue.find((item) => item.id === exceptionId);

  if (!exception) {
    return { ok: false, message: "找不到智能排班异常。" };
  }

  const engine = getSmartExceptionEngine(exception, operatorId);

  if (!engine) {
    return { ok: false, message: "找不到排班周期。" };
  }

  const nextException = engine.cancelAutoAction(exception);
  replaceSmartException(nextException);
  refreshSmartPolicyStatus(exception.shopId);
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.exception.cancel_auto",
    targetType: "cycle",
    targetId: exception.cycleId,
    before: JSON.stringify(exception),
    after: JSON.stringify(nextException),
    reason: "商户取消本次自动处理"
  });
  notify();
  return { ok: true, exception: nextException };
}

export function markSmartExceptionHumanOverride(exceptionId: string, operatorId: string) {
  hydrate();
  const exception = state.smartExceptionQueue.find((item) => item.id === exceptionId);

  if (!exception) {
    return { ok: false, message: "找不到智能排班异常。" };
  }

  const engine = getSmartExceptionEngine(exception, operatorId);

  if (!engine) {
    return { ok: false, message: "找不到排班周期。" };
  }

  const nextException = engine.markHumanOverride(exception);
  replaceSmartException(nextException);
  state.smartManualOverrides.unshift({
    id: createDispatchId("smart-override"),
    exceptionId: exception.id,
    cycleId: exception.cycleId,
    shopId: exception.shopId,
    operatorId,
    action: "human_override",
    reason: "本次将由人工处理，智能系统不会自动执行该异常的推荐方案。",
    createdAt: dispatchReferenceNow
  });
  refreshSmartPolicyStatus(exception.shopId);
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.exception.human_override",
    targetType: "cycle",
    targetId: exception.cycleId,
    before: JSON.stringify(exception),
    after: JSON.stringify(nextException),
    reason: "商户选择本次人工处理"
  });
  notify();
  return { ok: true, exception: nextException };
}

export function executeSmartExceptionNow(exceptionId: string, operatorId: string) {
  hydrate();
  const exception = state.smartExceptionQueue.find((item) => item.id === exceptionId);

  if (!exception) {
    return { ok: false, message: "找不到智能排班异常。" };
  }

  const engine = getSmartExceptionEngine(exception, operatorId);

  if (!engine) {
    return { ok: false, message: "找不到排班周期。" };
  }

  const nextException = engine.executeAutoAction(exception);
  replaceSmartException(nextException);
  refreshSmartPolicyStatus(exception.shopId);
  logAudit({
    operatorId,
    action: "dispatch.smart_schedule.exception.execute_now",
    targetType: "cycle",
    targetId: exception.cycleId,
    before: JSON.stringify(exception),
    after: JSON.stringify(nextException),
    reason: "立即执行智能异常推荐处理"
  });
  notify();
  return { ok: true, exception: nextException };
}

export function cancelDispatchCycle(cycleId: string, operatorId: string) {
  hydrate();
  const cycle = getCycleById(cycleId);

  if (!cycle) {
    return { ok: false, message: "找不到排班周期。" };
  }

  const nextCycle = {
    ...cycle,
    status: "cancelled" as const,
    cancelledAt: dispatchReferenceNow,
    updatedAt: dispatchReferenceNow
  };
  updateCycle(nextCycle);
  logAudit({
    operatorId,
    action: "dispatch.cycle.cancel",
    targetType: "cycle",
    targetId: cycleId,
    before: JSON.stringify(cycle),
    after: JSON.stringify(nextCycle),
    reason: "取消待执行周期"
  });
  notify();
  return { ok: true };
}

export function minimizeFloatingTasks(taskIds: string[], minimized: boolean) {
  hydrate();
  const targetIds = new Set(taskIds);

  if (targetIds.size === 0) {
    return;
  }

  let changed = false;
  state.floatingTasks = state.floatingTasks.map((task) => {
    if (!targetIds.has(task.id) || task.minimized === minimized) {
      return task;
    }

    changed = true;
    return { ...task, minimized };
  });

  if (changed) {
    notify();
  }
}

export function minimizeFloatingTask(taskId: string, minimized: boolean) {
  minimizeFloatingTasks([taskId], minimized);
}

export function rescheduleArrangement(orderId: string, minutes: number, operatorId: string) {
  hydrate();
  const arrangement = state.arrangements.find((item) => item.orderId === orderId);

  if (!arrangement) {
    return { ok: false, message: "找不到今日预约安排。" };
  }

  const nextWindow = shiftTimeWindow(arrangement.startTime, arrangement.endTime, minutes);
  const nextArrangement = {
    ...arrangement,
    startTime: nextWindow.startTime,
    endTime: nextWindow.endTime,
    internalNote: `${arrangement.internalNote ? `${arrangement.internalNote} ` : ""}已顺延 ${Math.abs(minutes)} 分钟。`
  };
  state.arrangements = state.arrangements.map((item) => (item.id === arrangement.id ? nextArrangement : item));
  logAudit({
    operatorId,
    action: "dispatch.arrangement.reschedule",
    targetType: "arrangement",
    targetId: arrangement.id,
    before: JSON.stringify(arrangement),
    after: JSON.stringify(nextArrangement),
    reason: "调整预约时间并重新校验冲突"
  });
  notify();
  return { ok: true };
}

export function assignArrangementTechnician(orderId: string, technicianId: string | null, operatorId: string) {
  hydrate();
  const arrangement = state.arrangements.find((item) => item.orderId === orderId);

  if (!arrangement) {
    return { ok: false, message: "找不到今日预约安排。" };
  }

  const technician = technicianId ? getEntityStoreSnapshot().technicians.find((item) => item.id === technicianId) : null;
  const nextArrangement = {
    ...arrangement,
    technicianId,
    technicianLabel: technician?.name ?? null,
    status: technicianId ? "confirmed" as const : "pending" as const
  };
  state.arrangements = state.arrangements.map((item) => (item.id === arrangement.id ? nextArrangement : item));
  logAudit({
    operatorId,
    action: "dispatch.arrangement.assign",
    targetType: "arrangement",
    targetId: arrangement.id,
    before: JSON.stringify(arrangement),
    after: JSON.stringify(nextArrangement),
    reason: technicianId ? "变更预约担当技师" : "取消当前担当"
  });
  notify();
  return { ok: true };
}

export function annotateArrangement(orderId: string, operatorId: string) {
  hydrate();
  const arrangement = state.arrangements.find((item) => item.orderId === orderId);

  if (!arrangement) {
    return { ok: false, message: "找不到今日预约安排。" };
  }

  const nextArrangement = {
    ...arrangement,
    internalNote: `${arrangement.internalNote ? `${arrangement.internalNote} ` : ""}已由店长电话确认。`
  };
  state.arrangements = state.arrangements.map((item) => (item.id === arrangement.id ? nextArrangement : item));
  logAudit({
    operatorId,
    action: "dispatch.arrangement.annotate",
    targetType: "arrangement",
    targetId: arrangement.id,
    before: JSON.stringify(arrangement),
    after: JSON.stringify(nextArrangement),
    reason: "更新内部备注"
  });
  notify();
  return { ok: true };
}

export function cancelArrangement(orderId: string, operatorId: string) {
  hydrate();
  const arrangement = state.arrangements.find((item) => item.orderId === orderId);

  if (!arrangement) {
    return { ok: false, message: "找不到今日预约安排。" };
  }

  const nextArrangement = {
    ...arrangement,
    status: "cancelled" as const,
    technicianId: null,
    technicianLabel: null
  };
  state.arrangements = state.arrangements.map((item) => (item.id === arrangement.id ? nextArrangement : item));
  logAudit({
    operatorId,
    action: "dispatch.arrangement.cancel",
    targetType: "arrangement",
    targetId: arrangement.id,
    before: JSON.stringify(arrangement),
    after: JSON.stringify(nextArrangement),
    reason: "取消预约并释放占用"
  });
  notify();
  return { ok: true };
}

export function createSpecialTask(input: Omit<DispatchSpecialTask, "id">, operatorId: string) {
  hydrate();
  const nextTask: DispatchSpecialTask = {
    ...input,
    id: createDispatchId("special")
  };
  state.specialTasks = [nextTask, ...state.specialTasks];
  logAudit({
    operatorId,
    action: "dispatch.special_task.create",
    targetType: "special_task",
    targetId: nextTask.id,
    before: "",
    after: JSON.stringify(nextTask),
    reason: "创建特派任务"
  });
  notify();
  return { ok: true, task: nextTask };
}

export function updateSpecialTask(taskId: string, patch: Partial<DispatchSpecialTask>, operatorId: string) {
  hydrate();
  const task = state.specialTasks.find((item) => item.id === taskId);

  if (!task) {
    return { ok: false, message: "找不到特派任务。" };
  }

  const technician =
    patch.technicianId === undefined || patch.technicianId === null
      ? null
      : getEntityStoreSnapshot().technicians.find((item) => item.id === patch.technicianId);
  const nextTask = {
    ...task,
    ...patch,
    status: patch.status ?? (patch.technicianId ? "assigned" : task.status)
  };

  if (technician && patch.technicianId) {
    nextTask.technicianId = technician.id;
  }

  state.specialTasks = state.specialTasks.map((item) => (item.id === taskId ? nextTask : item));
  logAudit({
    operatorId,
    action: "dispatch.special_task.update",
    targetType: "special_task",
    targetId: taskId,
    before: JSON.stringify(task),
    after: JSON.stringify(nextTask),
    reason: "更新特派任务分配状态"
  });
  notify();
  return { ok: true };
}

export function previewDispatchNotificationTemplate(storeId: string, serviceName: string, date: string, timeRange: string) {
  hydrate();
  const store = getEntityStoreSnapshot().stores.find((item) => item.id === storeId);
  const cycle = getPlanningCycle(storeId);
  const template = cycle?.ruleSet.notificationRules.discountTemplate ?? "{{storeName}} {{date}} {{timeRange}} 空档提醒";

  return template
    .replaceAll("{{storeName}}", store?.name ?? "NeeDo")
    .replaceAll("{{name}}", "佐藤 美咲")
    .replaceAll("{{date}}", date)
    .replaceAll("{{timeRange}}", timeRange)
    .replaceAll("{{serviceName}}", serviceName)
    .replaceAll("{{couponName}}", "黄金周加钟券")
    .replaceAll("{{expireAt}}", `${date} 23:59`);
}

export function getDispatchCycleLimitSummary(storeId: string) {
  hydrate();
  return summarizeCycleLimits(state.cycles, storeId);
}

export function getDispatchContactGroup(storeId: string) {
  hydrate();
  return state.contactGroups.find((group) => group.storeId === storeId && group.groupType === "temp_staff_pool") ?? null;
}

export function getDispatchAuditLogs(storeId: string, limit = 8) {
  hydrate();
  const scopedCycleIds = new Set(state.cycles.filter((cycle) => cycle.storeId === storeId).map((cycle) => cycle.id));
  const scopedArrangementIds = new Set(state.arrangements.filter((arrangement) => arrangement.storeId === storeId).map((arrangement) => arrangement.id));
  const scopedTaskIds = new Set(state.specialTasks.filter((task) => task.storeId === storeId).map((task) => task.id));

  return state.auditLogs
    .filter((log) => {
      if (log.targetType === "cycle") {
        return scopedCycleIds.has(log.targetId);
      }

      if (log.targetType === "arrangement") {
        return scopedArrangementIds.has(log.targetId);
      }

      if (log.targetType === "special_task") {
        return scopedTaskIds.has(log.targetId);
      }

      if (log.targetType === "final_shift") {
        return [...scopedCycleIds].some((cycleId) => log.targetId.startsWith(`${cycleId}:`));
      }

      return false;
    })
    .slice(0, limit);
}

export function resetDispatchCenterStore() {
  Object.assign(state, cloneValue(defaultState));
  notify();
}

export function getPlanningCycleForStore(storeId: string) {
  hydrate();
  return getPlanningCycle(storeId);
}

export function getPlanningProgressForCycle(cycleId: string) {
  hydrate();
  return getPlanningProgress(cycleId);
}

export function getDispatchCycleList(storeId: string) {
  hydrate();
  return getStoreCycles(storeId);
}

export function getDispatchCycleStepCopy(cycle: DispatchCycle) {
  return {
    stepLabel: getStepLabel(cycle.currentStep),
    statusLabel: getCycleStatusLabel(cycle.status),
    modeLabel: getCycleModeLabel(cycle.mode),
    needsFeedback: getModeNeedsFeedback(cycle.mode),
    serviceLabel: getServiceModeLabel("store"),
    summary: getArrangementStatusLabel("confirmed"),
    feedbackLabel: getFeedbackStatusLabel("updated"),
    shiftLabel: getFinalShiftStatusLabel("confirmed")
  };
}
