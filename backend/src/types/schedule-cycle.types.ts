export type ScheduleCycleModeValue = "TECH_SELF_FINAL" | "STORE_ASSIGN_FINAL";
export type ScheduleCycleStatusValue =
  | "DRAFT"
  | "RULE_SETTING"
  | "FINAL_CONFIRMING"
  | "COLLECTING_FEEDBACK"
  | "FEEDBACK_CLOSED"
  | "CONFIRMED"
  | "ACTIVE"
  | "CANCELLED"
  | "COMPLETED"
  | "ARCHIVED";

export interface ScheduleCycleFeedbackPayload {
  technicianProfileId: number;
  date: string;
  hour: number;
  status: "AVAILABLE" | "UNAVAILABLE" | "UPDATED";
  note: string;
  submittedAt: string;
  updatedAt: string;
}

export interface ScheduleCycleFinalShiftPayload {
  id: number;
  technicianProfileId: number;
  date: string;
  hour: number;
  status: "CONFIRMED" | "WAITLISTED" | "CANCELLED";
  source: "AUTO" | "MANUAL";
  confirmedAt: string;
}

export interface ScheduleCyclePayload {
  id: string;
  shopId: number;
  name: string;
  creationMethod: string;
  mode: ScheduleCycleModeValue;
  status: ScheduleCycleStatusValue;
  currentStep: number;
  templateType: "DAY" | "WEEK" | "MONTH";
  periodStart: string;
  periodEnd: string;
  targetTechnicianIds: number[];
  feedbackDeadline: string | null;
  templateMatrix: boolean[][];
  regularHolidayWeekdays: number[];
  ruleSet: Record<string, unknown>;
  launchedAt: string | null;
  finalizedAt: string | null;
  activeAt: string | null;
  cancelledAt: string | null;
  lastAutoConfirmAt: string | null;
  autoConfirmSummary: {
    confirmedCount: number;
    waitlistedCount: number;
    shortageCount: number;
    overflowCount: number;
  } | null;
  feedbackRows: ScheduleCycleFeedbackPayload[];
  finalShifts: ScheduleCycleFinalShiftPayload[];
  version: number;
  updatedAt: string;
}

export interface ScheduleCyclePage {
  list: ScheduleCyclePayload[];
  total: number;
  page: number;
  page_size: number;
}
