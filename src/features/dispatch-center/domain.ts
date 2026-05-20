import type { Technician } from "../../types/domain";

export type DispatchGridView = "day" | "week" | "month";
export type DispatchTemplateType = "day" | "week" | "month";
export type DispatchSurface = "desktop" | "mobile";
export type DispatchServiceMode = "store" | "home";
export type DispatchCycleMode = "TECH_SELF_FINAL" | "STORE_COLLECT_CONFIRM" | "STORE_ASSIGN_FINAL" | "INDIVIDUAL_SELF_FINAL";
export type DispatchCycleStatus =
  | "draft"
  | "rule_setting"
  | "rule_ready"
  | "smart_generating"
  | "smart_generated"
  | "smart_exception_pending"
  | "final_confirming"
  | "confirmed"
  | "collecting_feedback"
  | "feedback_closed"
  | "ready_to_confirm"
  | "final_confirmed"
  | "active"
  | "completed"
  | "archived"
  | "reopened"
  | "smart_failed"
  | "smart_recalculating"
  | "manual_override"
  | "cancelled";
export type DispatchStep = 1 | 2 | 3 | 4;
export type DispatchCreationMethod = "new" | "import_history" | "copy_current";
export type DispatchFeedbackStatus = "available" | "unavailable" | "none" | "updated";
export type DispatchFinalShiftStatus = "confirmed" | "waitlisted" | "cancelled";
export type DispatchBookableSlotStatus = "available" | "booked" | "waitlisted" | "blocked";
export type DispatchSpecialTaskSource = "merchant_manual" | "admin_manual" | "overtime" | "unassigned_order";
export type DispatchSpecialTaskStatus = "pending" | "assigned" | "cancelled" | "completed";
export type DispatchFloatingTaskType = "feedback" | "unassigned" | "conflict" | "application" | "reminder";
export type DispatchFloatingTaskSeverity = "high" | "medium" | "low";
export type DispatchArrangementStatus = "pending" | "confirmed" | "inService" | "completed" | "cancelled";
export type DispatchHoursPriority = "less_first" | "more_first";

export type DispatchPriorityRules = {
  selectedTechnicianIds: string[];
  selectedLanguages: string[];
  requireForeignerSupport: boolean;
  confirmedHoursPriority: DispatchHoursPriority;
  preferEarlyResponder: boolean;
  useIdFallback: boolean;
};

export type DispatchNotificationRules = {
  overbookEnabled: boolean;
  overbookThreshold: number;
  lowBookingEnabled: boolean;
  lowBookingThreshold: number;
  discountEnabled: boolean;
  discountTemplate: string;
  activeTemplateId?: string;
  templates?: DispatchNotificationTemplate[];
};

export type DispatchNotificationTemplate = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

export type DispatchRuleSet = {
  minStaff: number;
  targetStaff: number;
  maxStaff: number;
  maxDailyHours: number;
  maxWeeklyHours: number;
  minRestDaysPerWeek: number;
  preBufferMinutes: number;
  postBufferMinutes: number;
  weekdayAdjustments: Partial<Record<number, number>>;
  holidayAdjustments: Record<string, number>;
  overtimeBlockedWeekdays: number[];
  tempStaffEnabled: boolean;
  tempStaffIds: string[];
  priorityRules: DispatchPriorityRules;
  notificationRules: DispatchNotificationRules;
};

export type DispatchCycle = {
  id: string;
  storeId: string;
  name: string;
  creationMethod: DispatchCreationMethod;
  mode: DispatchCycleMode;
  status: DispatchCycleStatus;
  currentStep: DispatchStep;
  templateType: DispatchTemplateType;
  periodStart: string;
  periodEnd: string;
  targetTechnicianIds: string[];
  feedbackDeadline: string | null;
  templateMatrix: boolean[][];
  regularHolidayWeekdays: number[];
  ruleSet: DispatchRuleSet;
  launchedAt: string | null;
  finalizedAt: string | null;
  activeAt: string | null;
  cancelledAt: string | null;
  lastAutoConfirmAt: string | null;
  autoConfirmSummary: DispatchAutoConfirmSummary | null;
  updatedAt: string;
};

export type DispatchFeedbackEntry = {
  id: string;
  cycleId: string;
  technicianId: string;
  date: string;
  hour: number;
  status: DispatchFeedbackStatus;
  submittedAt: string | null;
  updatedAt: string | null;
  note: string;
  version: number;
};

export type DispatchFinalShift = {
  id: string;
  cycleId: string;
  storeId: string;
  technicianId: string;
  date: string;
  hour: number;
  status: DispatchFinalShiftStatus;
  source: "auto" | "manual";
  ruleSnapshot: string;
  confirmedAt: string;
  confirmedBy: string;
};

export type DispatchBookableSlot = {
  id: string;
  cycleId: string;
  storeId: string;
  technicianId: string;
  date: string;
  startAt: string;
  endAt: string;
  status: DispatchBookableSlotStatus;
  serviceMode: DispatchServiceMode;
  capacity: number;
};

export type DispatchArrangement = {
  id: string;
  storeId: string;
  orderId: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  serviceName: string;
  serviceMode: DispatchServiceMode;
  date: string;
  startTime: string;
  endTime: string;
  address: string;
  roomLabel: string;
  technicianId: string | null;
  technicianLabel: string | null;
  status: DispatchArrangementStatus;
  note: string;
  internalNote: string;
  amount: number;
  source: "order" | "manual";
};

export type DispatchSpecialTask = {
  id: string;
  storeId: string;
  source: DispatchSpecialTaskSource;
  serviceMode: DispatchServiceMode;
  date: string;
  startTime: string;
  endTime: string;
  address: string;
  technicianId: string | null;
  orderId: string | null;
  status: DispatchSpecialTaskStatus;
  note: string;
};

export type DispatchFloatingTask = {
  id: string;
  storeId: string;
  type: DispatchFloatingTaskType;
  severity: DispatchFloatingTaskSeverity;
  relatedId: string;
  title: string;
  description: string;
  dueAt: string | null;
  minimizable: boolean;
  closable: false;
  minimized: boolean;
  anchorDate: string | null;
  anchorHour: number | null;
  anchorKind: "arrangement" | "task" | "feedback" | "cycle";
};

export type DispatchHolidayRule = {
  storeId: string;
  holidayDate: string;
  nameJa: string;
  nameZh: string;
  deltaStaff: number;
  tempRecruitEnabled: boolean;
};

export type DispatchContactGroup = {
  id: string;
  storeId: string;
  groupType: "temp_staff_pool";
  locked: boolean;
  members: Array<{
    id: string;
    name: string;
    languages: string[];
    supportsForeigners: boolean;
  }>;
};

export type DispatchAuditLog = {
  id: string;
  operatorId: string;
  action: string;
  targetType: "cycle" | "arrangement" | "special_task" | "floating_task" | "final_shift";
  targetId: string;
  before: string;
  after: string;
  reason: string;
  createdAt: string;
};

export type DispatchAutoConfirmSummary = {
  confirmedCount: number;
  waitlistedCount: number;
  shortageCount: number;
  overflowCount: number;
};

export type DispatchCapacitySummary = {
  isHoliday: boolean;
  isRegularHoliday: boolean;
  minCount: number;
  targetCount: number;
  maxCount: number;
};

export type DispatchCandidate = {
  technician: Technician;
  confirmedHours: number;
  responseTimestamp: number;
  supportsSelectedLanguage: boolean;
  supportsForeigners: boolean;
  isPreferredTechnician: boolean;
};

export type SmartScheduleAutomationLevel = "recommend_only" | "semi_auto" | "full_auto";
export type SmartScheduleBillingStatus = "free_limited" | "trial" | "active" | "required" | "expired";
export type SmartScheduleMode = "manual_schedule" | "auto_schedule" | "smart_schedule";
export type SmartScheduleColdStartStatus =
  | "not_enabled"
  | "cold_start_collecting"
  | "cold_start_ready"
  | "smart_running"
  | "smart_exception_pending"
  | "smart_auto_handling_countdown"
  | "human_override"
  | "smart_paused";
export type SmartScheduleReadinessStatus = "cold_start" | "ready" | "attention";
export type SmartScheduleRunType = "generate" | "preview" | "optimize" | "recalculate";
export type SmartScheduleRunStatus = "running" | "completed" | "exception_pending" | "failed";
export type SmartScheduleRecommendationType = "confirm" | "waitlist" | "exclude";
export type SmartScheduleRecommendationStatus = "recommended" | "auto_confirmed" | "manual_confirmed" | "waitlisted" | "rejected";
export type SmartScheduleDataSourceType =
  | "merchant_history"
  | "technician_preferences"
  | "platform_flow"
  | "current_booking_trend"
  | "weather"
  | "traffic"
  | "holiday"
  | "special_date_rules"
  | "campaign"
  | "local_event";
export type SmartScheduleDataSourceStatus = "enabled" | "collecting" | "ready" | "missing" | "fallback";
export type SmartScheduleSignalType = "weather" | "traffic" | "holiday" | "campaign" | "platform_flow" | "booking_trend" | "local_event";
export type SmartScheduleRuleType = "automation_level" | "base_rule" | "staffing_rule" | "priority_technician" | "special_date_adjustment" | "external_signal";
export type SmartScheduleDecisionType = "generate_shift" | "add_staff" | "waitlist_staff" | "reduce_capacity" | "increase_buffer" | "notify_technician" | "manual_review";
export type SmartScheduleDecisionStatus = "recommended" | "scheduled" | "executed" | "cancelled" | "human_override";
export type SmartScheduleExceptionType =
  | "shortage"
  | "overflow"
  | "conflict"
  | "overtime"
  | "rest_violation"
  | "unavailable"
  | "order_conflict"
  | "unsubmitted"
  | "traffic_delay"
  | "weather_risk"
  | "demand_surge"
  | "demand_shortfall"
  | "external_data_missing"
  | "low_confidence"
  | "low_score";
export type SmartScheduleExceptionSeverity = "high" | "medium" | "low";
export type SmartScheduleExceptionStatus =
  | "open"
  | "auto_handling_countdown"
  | "human_override_pending"
  | "resolved"
  | "ignored"
  | "cancelled_auto_action"
  | "executed";

export type ScheduleAutomationPolicy = {
  id: string;
  shopId: string;
  enabled: boolean;
  automationLevel: SmartScheduleAutomationLevel;
  mode: SmartScheduleMode;
  minCycleDays: number;
  autoExceptionActionDelayMinutes: number;
  coldStartStatus: SmartScheduleColdStartStatus;
  dataCollectionEnabled: boolean;
  manualInputEnabled: boolean;
  qualityAutoConfirmThreshold: number;
  qualityReviewThreshold: number;
  coldStartRequiredDays: number;
  coldStartStartedAt: string;
  coldStartEndsAt: string;
  minimumHistoricalOrderCount: number;
  minimumPreferenceCoveragePercent: number;
  autoCreateCycleEnabled: boolean;
  autoCollectFeedbackEnabled: boolean;
  autoSubmitFromHistoryEnabled: boolean;
  autoConfirmEnabled: boolean;
  autoConfirmScoreThreshold: number;
  shortageStrategy: "candidate_pool" | "temp_staff" | "manual_queue";
  overflowStrategy: "move_to_waitlist" | "manual_queue";
  unsubmittedStaffStrategy: "auto_submit_from_history" | "remind" | "manual_queue";
  smartScheduleFreeLimitedEnabled: boolean;
  smartScheduleBillingStatus: SmartScheduleBillingStatus;
  smartScheduleFreeUntil: string;
  smartSchedulePlanRequired: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SmartScheduleDataSource = {
  id: string;
  shopId: string;
  sourceType: SmartScheduleDataSourceType;
  enabled: boolean;
  status: SmartScheduleDataSourceStatus;
  confidenceScore: number;
  lastCollectedAt: string | null;
  missingReason: string | null;
  fallbackUsed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SmartScheduleSignal = {
  id: string;
  shopId: string;
  cycleId: string;
  signalType: SmartScheduleSignalType;
  signalDate: string;
  signalHour: number | null;
  valueJson: string;
  confidenceScore: number;
  source: string;
  createdAt: string;
};

export type SmartScheduleRuleExplanation = {
  id: string;
  cycleId: string;
  ruleType: SmartScheduleRuleType;
  targetId: string | null;
  title: string;
  reasonJson: string;
  confidenceScore: number;
  createdAt: string;
};

export type SmartScheduleDecision = {
  id: string;
  cycleId: string;
  decisionType: SmartScheduleDecisionType;
  targetDate: string;
  targetTime: string;
  technicianId: string | null;
  action: string;
  reasonJson: string;
  confidenceScore: number;
  status: SmartScheduleDecisionStatus;
  createdAt: string;
};

export type SmartScheduleReadiness = {
  status: SmartScheduleReadinessStatus;
  canRunSmartSchedule: boolean;
  canEnableFullAutomation: boolean;
  progressPercent: number;
  daysCollected: number;
  requiredDays: number;
  daysRemaining: number;
  observedOrderCount: number;
  requiredOrderCount: number;
  preferenceCoveragePercent: number;
  requiredPreferenceCoveragePercent: number;
  preferenceCoveredTechnicianCount: number;
  totalTechnicianCount: number;
  readyAt: string;
  missingItems: string[];
};

export type ScheduleDemandForecast = {
  id: string;
  shopId: string;
  cycleId: string;
  date: string;
  hour: number;
  serviceCategoryId: string;
  predictedOrders: number;
  requiredStaffCount: number;
  confidenceScore: number;
  source: "rule_v1" | "history_same_weekday" | "existing_booking";
  createdAt: string;
};

export type TechnicianSchedulePreference = {
  id: string;
  technicianId: string;
  shopId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  available: boolean;
  maxHoursDay: number;
  maxHoursWeek: number;
  acceptOvertime: boolean;
  acceptHoliday: boolean;
  acceptTempShift: boolean;
  bufferMinutes: number;
  autoSubmitEnabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleOptimizationRun = {
  id: string;
  cycleId: string;
  shopId: string;
  runType: SmartScheduleRunType;
  status: SmartScheduleRunStatus;
  score: number;
  shortageCount: number;
  overflowCount: number;
  conflictCount: number;
  autoConfirmed: boolean;
  inputSnapshotJson: string;
  outputSnapshotJson: string;
  createdAt: string;
};

export type ScheduleRecommendation = {
  id: string;
  runId: string;
  cycleId: string;
  technicianId: string;
  date: string;
  startTime: string;
  endTime: string;
  recommendationType: SmartScheduleRecommendationType;
  score: number;
  reasonJson: string;
  status: SmartScheduleRecommendationStatus;
};

export type ScheduleExceptionQueueItem = {
  id: string;
  cycleId: string;
  shopId: string;
  exceptionType: SmartScheduleExceptionType;
  severity: SmartScheduleExceptionSeverity;
  targetDate: string;
  targetHour: number;
  technicianId: string | null;
  description: string;
  suggestedAction: "auto_fill" | "auto_reduce" | "manual_adjust" | "ignore" | "recalculate";
  recommendedActionJson?: string;
  reasonJson?: string;
  countdownSeconds?: number;
  autoExecuteAt?: string | null;
  status: SmartScheduleExceptionStatus;
  humanOverride?: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SmartScheduleManualOverride = {
  id: string;
  exceptionId: string;
  cycleId: string;
  shopId: string;
  operatorId: string;
  action: string;
  reason: string;
  createdAt: string;
};

export const dispatchReferenceDateKey = "2026-04-20";
export const dispatchReferenceNow = "2026-04-20T10:30:00+09:00";
export const dispatchWeekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const dispatchLanguageOptions = ["日语", "中文", "英语", "韩语"];

export function createDispatchId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return formatDateKey(date);
}

export function enumerateDateKeys(start: string, end: string) {
  const values: string[] = [];
  let current = start;

  while (current <= end) {
    values.push(current);
    current = addDays(current, 1);
  }

  return values;
}

export function toIsoAtHour(dateKey: string, hour: number) {
  return `${dateKey}T${String(hour).padStart(2, "0")}:00:00+09:00`;
}

export function getWeekday(dateKey: string) {
  return parseDateKey(dateKey).getDay();
}

export function timeToMinutes(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(value: number) {
  const safeValue = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(safeValue / 60);
  const minute = safeValue % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function addMinutes(time: string, minutes: number) {
  return minutesToTime(timeToMinutes(time) + minutes);
}

export function buildEmptyTemplateMatrix(templateType: DispatchTemplateType) {
  const rowCount = templateType === "day" ? 1 : templateType === "week" ? 7 : 28;
  return Array.from({ length: rowCount }, () => Array.from({ length: 24 }, () => false));
}

export function getTemplateDayLabel(templateType: DispatchTemplateType, dayIndex: number, periodStart: string) {
  if (templateType === "day") {
    return "当日模板";
  }

  if (templateType === "week") {
    return dispatchWeekdayLabels[dayIndex] ?? `第 ${dayIndex + 1} 天`;
  }

  return `${addDays(periodStart, dayIndex).slice(5)} · ${dispatchWeekdayLabels[(getWeekday(periodStart) + dayIndex) % 7]}`;
}

export function getCycleModeLabel(mode: DispatchCycleMode) {
  const labels: Record<DispatchCycleMode, string> = {
    TECH_SELF_FINAL: "技师自主排班",
    STORE_COLLECT_CONFIRM: "商户确认模式",
    STORE_ASSIGN_FINAL: "商户直接排班",
    INDIVIDUAL_SELF_FINAL: "个体技师独立排班"
  };

  return labels[mode];
}

export function getCycleStatusLabel(status: DispatchCycleStatus) {
  const labels: Record<DispatchCycleStatus, string> = {
    draft: "草稿",
    rule_setting: "规则设定中",
    rule_ready: "规则已就绪",
    smart_generating: "智能生成中",
    smart_generated: "智能已生成",
    smart_exception_pending: "智能异常待处理",
    final_confirming: "最终确认中",
    confirmed: "已最终确认",
    collecting_feedback: "收集反馈中",
    feedback_closed: "反馈已关闭",
    ready_to_confirm: "反馈已关闭",
    final_confirmed: "已确认，待执行",
    active: "执行中",
    completed: "已完成",
    archived: "已归档",
    reopened: "已重新开启",
    smart_failed: "智能生成失败",
    smart_recalculating: "智能重算中",
    manual_override: "人工接管",
    cancelled: "已取消"
  };

  return labels[status];
}

export function getSmartAutomationLevelLabel(level: SmartScheduleAutomationLevel) {
  const labels: Record<SmartScheduleAutomationLevel, string> = {
    recommend_only: "智能推荐",
    semi_auto: "智能半自动",
    full_auto: "全智能无人值守"
  };

  return labels[level];
}

export function getSmartScheduleModeLabel(mode: SmartScheduleMode) {
  const labels: Record<SmartScheduleMode, string> = {
    manual_schedule: "手动排班",
    auto_schedule: "自动排班",
    smart_schedule: "全智能无人值守排班"
  };

  return labels[mode];
}

export function getSmartColdStartStatusLabel(status: SmartScheduleColdStartStatus) {
  const labels: Record<SmartScheduleColdStartStatus, string> = {
    not_enabled: "未启用",
    cold_start_collecting: "冷启动自动收集中",
    cold_start_ready: "冷启动已就绪",
    smart_running: "全智能运行中",
    smart_exception_pending: "有异常待处理",
    smart_auto_handling_countdown: "异常自动处理倒计时",
    human_override: "本次人工处理",
    smart_paused: "智能系统暂停"
  };

  return labels[status];
}

export function getSmartDataSourceTypeLabel(type: SmartScheduleDataSourceType) {
  const labels: Record<SmartScheduleDataSourceType, string> = {
    merchant_history: "商户历史排班",
    technician_preferences: "技师反馈数据",
    platform_flow: "平台客流趋势",
    current_booking_trend: "当前预约趋势",
    weather: "天气数据",
    traffic: "路况数据",
    holiday: "节假日数据",
    special_date_rules: "特别日期规则",
    campaign: "活动数据",
    local_event: "商圈活动"
  };

  return labels[type];
}

export function getSmartReadinessStatusLabel(status: SmartScheduleReadinessStatus) {
  const labels: Record<SmartScheduleReadinessStatus, string> = {
    cold_start: "冷启动预留中",
    ready: "可正式开启",
    attention: "数据待补齐"
  };

  return labels[status];
}

export function getSmartExceptionTypeLabel(type: SmartScheduleExceptionType) {
  const labels: Record<SmartScheduleExceptionType, string> = {
    shortage: "缺人",
    overflow: "超员",
    conflict: "时间冲突",
    overtime: "工时超限",
    rest_violation: "休息不足",
    unavailable: "技师不可用",
    order_conflict: "订单冲突",
    unsubmitted: "技师未反馈",
    traffic_delay: "路况迟到风险",
    weather_risk: "天气移动风险",
    demand_surge: "预约量突增",
    demand_shortfall: "预约量不足",
    external_data_missing: "外部数据缺失",
    low_confidence: "低置信度排班",
    low_score: "质量评分偏低"
  };

  return labels[type];
}

export function getStepLabel(step: DispatchStep) {
  if (step === 1) {
    return "模式选择";
  }

  if (step === 2) {
    return "规则设定";
  }

  if (step === 3) {
    return "技师反馈";
  }

  return "最终确认";
}

export function getServiceModeLabel(mode: DispatchServiceMode) {
  return mode === "store" ? "到店服务" : "上门服务";
}

export function getArrangementStatusLabel(status: DispatchArrangementStatus) {
  const labels: Record<DispatchArrangementStatus, string> = {
    pending: "待确认",
    confirmed: "已确认",
    inService: "进行中",
    completed: "已完成",
    cancelled: "已取消"
  };

  return labels[status];
}

export function getFeedbackStatusLabel(status: DispatchFeedbackStatus) {
  const labels: Record<DispatchFeedbackStatus, string> = {
    available: "可上班",
    unavailable: "不可上班",
    none: "未反馈",
    updated: "已更新"
  };

  return labels[status];
}

export function getFinalShiftStatusLabel(status: DispatchFinalShiftStatus) {
  const labels: Record<DispatchFinalShiftStatus, string> = {
    confirmed: "已确认",
    waitlisted: "候补",
    cancelled: "已取消"
  };

  return labels[status];
}

export function getFloatingTaskTone(severity: DispatchFloatingTaskSeverity) {
  return severity === "high" ? "red" : severity === "medium" ? "yellow" : "blue";
}

export function getModeNeedsFeedback(mode: DispatchCycleMode) {
  return mode === "STORE_COLLECT_CONFIRM";
}

export function getTemplateRowWeekday(templateType: DispatchTemplateType, dayIndex: number, periodStart: string) {
  if (templateType === "day") {
    return getWeekday(periodStart);
  }

  if (templateType === "week") {
    return dayIndex;
  }

  return getWeekday(addDays(periodStart, dayIndex));
}
