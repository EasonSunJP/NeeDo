export type ShiftTemplateType = "day" | "week" | "month";
export type ScheduleOwnerType = "store" | "technician";
export type StoreScheduleMode = "TECHNICIAN_SELF_FINAL" | "STORE_CONFIRM_REQUIRED" | "STORE_DIRECT_ASSIGN";
export type StoreScheduleModeStatus = "draft" | "scheduled" | "active" | "archived";
export type ScheduleContextType = "INDIVIDUAL_SELF_FINAL" | "STORE_TECH_SELF_FINAL" | "STORE_CONFIRM_REQUIRED" | "STORE_DIRECT_ASSIGN";
export type EditableSlotScope = "published_availability" | "store_application";
export type StorePlanningStatus = "draft" | "opened" | "locked" | "partially_confirmed" | "confirmed" | "reopened" | "cancelled";
export type StoreOpenSlotStatus = "closed" | "opened" | "locked";
export type TechnicianSlotStatus = "none" | "available" | "unavailable";
export type TechnicianResponseStatus = "none" | "submitted" | "updated";
export type ConfirmedShiftStatus = "confirmed" | "waitlisted" | "cancelled";
export type FinalBookableSlotStatus = "available" | "held" | "booked" | "blocked_by_store" | "conflict";
export type FinalBookableSlotSourceType = "technician_published" | "store_confirmed";
export type TemplateImportSource =
  | "last_same_type"
  | "previous_day"
  | "previous_week"
  | "previous_month"
  | "last_year_same_period";
export type ScheduleSlotOverrideStatus = StoreOpenSlotStatus | TechnicianSlotStatus;
export type ScheduleSlotOverrideSourceType = "manual" | "template" | "imported" | "locked";
export type ForceInheritedRule = "hourLimits" | "restDays" | "buffers";
export type PriorityRuleType =
  | "technician"
  | "group"
  | "category"
  | "tag"
  | "currentConfirmedHoursLess"
  | "longestSinceLastAssigned"
  | "earliestResponse"
  | "technicianId";
export type CapacityRuleScopeType = "global" | "weekday" | "date" | "holiday";
export type NotificationTargetType = "store" | "technician" | "admin";
export type NotificationStatus = "pending" | "sent" | "read";
export type NotificationType =
  | "store_opened_period"
  | "store_updated_period"
  | "store_locked_period"
  | "mode_switch_announced"
  | "technician_submitted_response"
  | "technician_updated_response"
  | "technician_published_availability"
  | "shortage_detected"
  | "overflow_detected"
  | "auto_confirm_ready"
  | "auto_confirm_completed"
  | "shift_confirmed"
  | "shift_waitlisted"
  | "projection_rebuilt"
  | "reopen_requested";
export type SlotMatrix = boolean[][];

export type StoreScheduleModeSelfRules = {
  businessHoursRequired: boolean;
  resourceValidationRequired: boolean;
  freezeBeforeStartMinutes: number;
  autoPublishAfterValidation: boolean;
  allowStoreBlackout: boolean;
};

export type StoreScheduleModeConfirmRules = {
  feedbackDeadlineAt: string | null;
  autoLockAfterDeadline: boolean;
  autoConfirmEnabled: boolean;
};

export type PriorityRule = {
  id: string;
  type: PriorityRuleType;
  label: string;
  weight: number;
  enabled: boolean;
  technicianIds?: string[];
  values?: string[];
};

export type StoreScheduleModeConfig = {
  id: string;
  storeId: string;
  mode: StoreScheduleMode;
  scopeType: "global" | "technician" | "serviceType" | "dateRange";
  scopeValue: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: StoreScheduleModeStatus;
  selfModeRules: StoreScheduleModeSelfRules;
  confirmModeRules: StoreScheduleModeConfirmRules;
  version: number;
  reason: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleContext = {
  technicianId: string;
  storeId: string | null;
  mode: StoreScheduleMode | null;
  context: ScheduleContextType;
  canSelfPublish: boolean;
  requiresStoreConfirmation: boolean;
  editableSlotScope: EditableSlotScope;
  storeRules: {
    businessHoursRequired: boolean;
    resourceValidationRequired: boolean;
    freezeBeforeStartMinutes: number;
    allowStoreBlackout: boolean;
    feedbackDeadlineAt: string | null;
    autoLockAfterDeadline: boolean;
    autoConfirmEnabled: boolean;
  };
  uiHints: {
    title: string;
    primaryAction: string;
    description: string;
    disabledReason: string | null;
  };
};

export type StoreSchedulePolicy = {
  id: string;
  storeId: string;
  appliesToTechnicians: string[];
  templateType: ShiftTemplateType;
  importSource: TemplateImportSource | null;
  repeatEnabled: boolean;
  startDate: string;
  endDate: string;
  holidayDemandPercent: number;
  weekdayDemandPercents: Partial<Record<number, number>>;
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
  forceInheritedRules: ForceInheritedRule[];
  publishedAt: string | null;
  status: StorePlanningStatus;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleTemplate = {
  id: string;
  ownerType: ScheduleOwnerType;
  ownerId: string;
  targetStoreId: string;
  policyId: string | null;
  templateType: ShiftTemplateType;
  cycleLength: number;
  slotMatrix: SlotMatrix;
  repeatEnabled: boolean;
  startDate: string;
  endDate: string;
  importSource: TemplateImportSource | null;
  version: number;
  status: "draft" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type ScheduleSlotOverride = {
  id: string;
  ownerType: ScheduleOwnerType;
  ownerId: string;
  targetStoreId: string;
  policyId: string | null;
  date: string;
  hour: number;
  status: ScheduleSlotOverrideStatus;
  reason: string;
  sourceType: ScheduleSlotOverrideSourceType;
  createdAt: string;
};

export type TechnicianSpecialRules = {
  holidayPreferencePercent: number;
  weekdayPreferencePercents: Partial<Record<number, number>>;
  dailyMaxHours: number | null;
  weeklyMaxHours: number | null;
  monthlyMaxHours: number | null;
  minRestDaysWeek: number | null;
  maxRestDaysWeek: number | null;
  minRestDaysMonth: number | null;
  maxRestDaysMonth: number | null;
  preServiceBufferMinutes: number;
  postServiceBufferMinutes: number;
  acceptsPeakTimeAssignments: boolean;
  acceptsTemporaryAssignments: boolean;
};

export type TechnicianScheduleResponse = {
  id: string;
  technicianId: string;
  storeId: string;
  policyId: string;
  periodStart: string;
  periodEnd: string;
  responseStatus: TechnicianResponseStatus;
  submittedAt: string | null;
  updatedAt: string;
  templateId: string;
  slotOverrideIds: string[];
  specialRules: TechnicianSpecialRules;
  version: number;
};

export type ConfirmedShift = {
  id: string;
  storeId: string;
  technicianId: string;
  policyId: string;
  date: string;
  hour: number;
  shiftStatus: ConfirmedShiftStatus;
  source: "manual" | "auto";
  ruleSnapshot: string;
  confirmedAt: string;
  confirmedBy: string;
};

export type FinalBookableSlot = {
  id: string;
  storeId: string | null;
  technicianId: string;
  policyId: string | null;
  date: string;
  hour: number;
  status: FinalBookableSlotStatus;
  context: ScheduleContextType;
  sourceType: FinalBookableSlotSourceType;
  validationSummary: string;
  updatedAt: string;
};

export type CapacityRule = {
  id: string;
  storeId: string;
  policyId: string | null;
  scopeType: CapacityRuleScopeType;
  scopeValue: string;
  targetCount: number | null;
  maxConfirmCount: number | null;
};

export type NotificationTask = {
  id: string;
  targetType: NotificationTargetType;
  targetId: string;
  storeId: string;
  policyId: string | null;
  notificationType: NotificationType;
  payload: string;
  scheduledAt: string;
  status: NotificationStatus;
};

export type ShiftShortageSummary = {
  date: string;
  hour: number;
  targetCount: number;
  confirmedCount: number;
  availableCount: number;
  missingCount: number;
};

export type ShiftOverflowSummary = {
  date: string;
  hour: number;
  maxConfirmCount: number;
  availableCount: number;
  waitlistCount: number;
};

export type AutoConfirmSummary = {
  confirmedCount: number;
  waitlistedCount: number;
  shortageCount: number;
  overflowCount: number;
  shortageHours: number;
  overflowHours: number;
};

export type AutoConfirmResult = {
  confirmed: ConfirmedShift[];
  waitlisted: ConfirmedShift[];
  shortage: ShiftShortageSummary[];
  overflow: ShiftOverflowSummary[];
  notifications: NotificationTask[];
  summary: AutoConfirmSummary;
};

export type StorePolicySummary = {
  openHourCount: number;
  lockedHourCount: number;
  applicableTechnicianCount: number;
  feedbackSubmittedCount: number;
  feedbackUpdatedCount: number;
  feedbackPendingCount: number;
  availableHourCount: number;
  unavailableHourCount: number;
  confirmedCount: number;
  waitlistedCount: number;
  shortageCount: number;
  overflowCount: number;
};

export type ScheduleModeImpactPreview = {
  currentMode: StoreScheduleMode | null;
  targetMode: StoreScheduleMode;
  affectedTechnicianCount: number;
  pendingApplicationCount: number;
  publishedSelfSlotCount: number;
  futureBookingCount: number;
  conflictSlotCount: number;
};

export type ImportableTemplateOption = {
  source: TemplateImportSource;
  label: string;
  templateId: string;
  updatedAt: string;
};

export type TechnicianAutoGenerateSummary = {
  openSlotCount: number;
  lockedSlotCount: number;
  generatedAvailableCount: number;
  generatedUnavailableCount: number;
  workingDayCount: number;
  restDayCount: number;
  overrideCount: number;
  importedTemplateUsed: boolean;
};
