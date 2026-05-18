import { describe, expect, it } from "vitest";
import { AutoSchedulingEngine } from "./autoSchedulingEngine";
import {
  buildEmptyTemplateMatrix,
  dispatchReferenceNow,
  type DispatchCycle,
  type ScheduleAutomationPolicy,
  type TechnicianSchedulePreference
} from "../../features/dispatch-center/domain";
import type { Technician } from "../../types/domain";

function buildCycle(): DispatchCycle {
  const templateMatrix = buildEmptyTemplateMatrix("week");
  templateMatrix[1][10] = true;

  return {
    id: "cycle-smart-test",
    storeId: "store-smart-test",
    name: "智能排班测试周期",
    creationMethod: "new",
    mode: "STORE_ASSIGN_FINAL",
    status: "draft",
    currentStep: 2,
    templateType: "week",
    periodStart: "2026-04-20",
    periodEnd: "2026-04-26",
    targetTechnicianIds: ["tech-smart-1", "tech-smart-2"],
    feedbackDeadline: null,
    templateMatrix,
    regularHolidayWeekdays: [],
    ruleSet: {
      minStaff: 1,
      targetStaff: 1,
      maxStaff: 2,
      maxDailyHours: 8,
      maxWeeklyHours: 42,
      minRestDaysPerWeek: 1,
      preBufferMinutes: 20,
      postBufferMinutes: 15,
      weekdayAdjustments: {},
      holidayAdjustments: {},
      overtimeBlockedWeekdays: [],
      tempStaffEnabled: true,
      tempStaffIds: [],
      priorityRules: {
        selectedTechnicianIds: ["tech-smart-1"],
        selectedLanguages: ["中文"],
        requireForeignerSupport: false,
        confirmedHoursPriority: "less_first",
        preferEarlyResponder: true,
        useIdFallback: true
      },
      notificationRules: {
        overbookEnabled: true,
        overbookThreshold: 2,
        lowBookingEnabled: true,
        lowBookingThreshold: 1,
        discountEnabled: false,
        discountTemplate: ""
      }
    },
    launchedAt: null,
    finalizedAt: null,
    activeAt: null,
    cancelledAt: null,
    lastAutoConfirmAt: null,
    autoConfirmSummary: null,
    updatedAt: dispatchReferenceNow
  };
}

function buildPolicy(automationLevel: ScheduleAutomationPolicy["automationLevel"]): ScheduleAutomationPolicy {
  return {
    id: "smart-policy-test",
    shopId: "store-smart-test",
    enabled: true,
    automationLevel,
    mode: "smart_schedule",
    minCycleDays: 30,
    autoExceptionActionDelayMinutes: 10,
    coldStartStatus: "smart_running",
    dataCollectionEnabled: true,
    manualInputEnabled: false,
    qualityAutoConfirmThreshold: 90,
    qualityReviewThreshold: 70,
    coldStartRequiredDays: 0,
    coldStartStartedAt: "2026-04-01",
    coldStartEndsAt: "2026-04-01",
    minimumHistoricalOrderCount: 0,
    minimumPreferenceCoveragePercent: 0,
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
  };
}

const technicians: Technician[] = [
  {
    id: "tech-smart-1",
    systemId: "TECH-001",
    name: "智能一号",
    storeId: "store-smart-test",
    role: "therapist",
    status: "available",
    rating: 4.95,
    orderCount: 120,
    income: 800000,
    skills: ["美容", "护理"],
    serviceAreas: ["银座"],
    acceptRate: 96,
    cancelRate: 1,
    reviewCount: 88,
    languages: ["中文", "日语"],
    avatar: "",
    canServeForeigners: true
  },
  {
    id: "tech-smart-2",
    systemId: "TECH-002",
    name: "智能二号",
    storeId: "store-smart-test",
    role: "therapist",
    status: "available",
    rating: 4.86,
    orderCount: 90,
    income: 620000,
    skills: ["按摩"],
    serviceAreas: ["银座"],
    acceptRate: 93,
    cancelRate: 2,
    reviewCount: 64,
    languages: ["日语"],
    avatar: "",
    canServeForeigners: false
  }
];

const preferences: TechnicianSchedulePreference[] = technicians.map((technician, index) => ({
  id: `pref-${technician.id}`,
  technicianId: technician.id,
  shopId: "store-smart-test",
  weekday: 1,
  startTime: "10:00",
  endTime: "18:00",
  available: true,
  maxHoursDay: 8,
  maxHoursWeek: 42,
  acceptOvertime: index === 0,
  acceptHoliday: true,
  acceptTempShift: true,
  bufferMinutes: 20,
  autoSubmitEnabled: true,
  priority: 3 - index,
  createdAt: dispatchReferenceNow,
  updatedAt: dispatchReferenceNow
}));

describe("AutoSchedulingEngine", () => {
  it("keeps recommend_only output as recommendations without confirmed shifts", () => {
    const cycle = buildCycle();
    const engine = new AutoSchedulingEngine({
      cycle,
      policy: buildPolicy("recommend_only"),
      technicians,
      preferences,
      arrangements: [],
      finalShifts: [],
      runType: "generate",
      operatorId: "store-smart-test"
    });

    const result = engine.run(cycle.id);

    expect(result.recommendations.some((recommendation) => recommendation.recommendationType === "confirm")).toBe(true);
    expect(result.finalShifts).toHaveLength(0);
    expect(result.autoConfirmed).toBe(false);
  });

  it("auto-confirms full_auto results only through final shifts", () => {
    const cycle = buildCycle();
    const engine = new AutoSchedulingEngine({
      cycle,
      policy: buildPolicy("full_auto"),
      technicians,
      preferences,
      arrangements: [],
      finalShifts: [],
      runType: "generate",
      operatorId: "store-smart-test"
    });

    const result = engine.run(cycle.id);

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.autoConfirmed).toBe(true);
    expect(result.finalShifts.some((shift) => shift.status === "confirmed")).toBe(true);
    expect(result.recommendations.every((recommendation) => recommendation.recommendationType !== "confirm" || recommendation.status === "auto_confirmed")).toBe(true);
  });
});
