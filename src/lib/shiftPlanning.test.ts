import { describe, expect, it } from "vitest";
import type { Schedule, Technician } from "../types/domain";
import type { ConfirmedShift, ScheduleSlotOverride, ScheduleTemplate, StoreScheduleModeConfig, StoreSchedulePolicy, TechnicianScheduleResponse } from "../types/shiftPlanning";
import {
  buildFinalBookableSlotsForTechnician,
  createDefaultStoreScheduleModeConfirmRules,
  createDefaultStoreScheduleModeSelfRules,
  createDefaultTechnicianSpecialRules,
  resolveScheduleContext
} from "./shiftPlanning";

function makeTechnician(overrides: Partial<Technician> = {}): Technician {
  return {
    id: "tech-1",
    systemId: "TECH-001",
    name: "Mia",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    rating: 4.9,
    orderCount: 32,
    income: 120000,
    skills: ["肩颈放松"],
    serviceAreas: ["银座"],
    acceptRate: 98,
    cancelRate: 1,
    reviewCount: 20,
    languages: ["日本語"],
    avatar: "https://example.com/avatar.png",
    ...overrides
  };
}

function makeModeConfig(mode: StoreScheduleModeConfig["mode"]): StoreScheduleModeConfig {
  return {
    id: `mode-${mode}`,
    storeId: "store-1",
    mode,
    scopeType: "global",
    scopeValue: null,
    effectiveFrom: "2026-04-20T00:00:00.000Z",
    effectiveTo: null,
    status: "active",
    selfModeRules: createDefaultStoreScheduleModeSelfRules(),
    confirmModeRules: createDefaultStoreScheduleModeConfirmRules(),
    version: 1,
    reason: "test",
    createdBy: "store-1",
    updatedBy: "store-1",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z"
  };
}

function makePolicy(): StoreSchedulePolicy {
  return {
    id: "policy-1",
    storeId: "store-1",
    appliesToTechnicians: ["tech-1"],
    templateType: "day",
    importSource: null,
    repeatEnabled: true,
    startDate: "2026-04-20",
    endDate: "2026-04-20",
    holidayDemandPercent: 0,
    weekdayDemandPercents: {},
    dailyMaxHours: 8,
    weeklyMaxHours: 40,
    monthlyMaxHours: 160,
    unlimitedMaxHours: false,
    minRestDaysWeek: 1,
    maxRestDaysWeek: 3,
    minRestDaysMonth: 4,
    maxRestDaysMonth: 10,
    preServiceBufferMinutes: 0,
    postServiceBufferMinutes: 0,
    overbookingNotifyEnabled: true,
    overbookingThreshold: 2,
    tempTechnicianEnabled: false,
    tempTechnicianConfig: "",
    lowBookingRestNotifyEnabled: false,
    lowBookingThreshold: 0,
    discountPushEnabled: false,
    discountTemplate: "",
    priorityRules: [],
    defaultCapacityPerHour: 1,
    defaultMaxConfirmPerHour: 1,
    feedbackDeadlineAt: "2026-04-19T12:00:00.000Z",
    forceInheritedRules: [],
    publishedAt: "2026-04-18T12:00:00.000Z",
    status: "opened",
    createdAt: "2026-04-18T12:00:00.000Z",
    updatedAt: "2026-04-18T12:00:00.000Z"
  };
}

function makeStoreTemplate(): ScheduleTemplate {
  return {
    id: "template-store-1",
    ownerType: "store",
    ownerId: "store-1",
    targetStoreId: "store-1",
    policyId: "policy-1",
    templateType: "day",
    cycleLength: 1,
    slotMatrix: [[false, false, false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false, false, false, false, false, false, false]],
    repeatEnabled: true,
    startDate: "2026-04-20",
    endDate: "2026-04-20",
    importSource: null,
    version: 1,
    status: "published",
    createdAt: "2026-04-18T12:00:00.000Z",
    updatedAt: "2026-04-18T12:00:00.000Z"
  };
}

function makeResponseTemplate(): ScheduleTemplate {
  const row = Array.from({ length: 24 }, (_, hour) => hour === 10 || hour === 11);

  return {
    id: "template-tech-1",
    ownerType: "technician",
    ownerId: "tech-1",
    targetStoreId: "store-1",
    policyId: "policy-1",
    templateType: "day",
    cycleLength: 1,
    slotMatrix: [row],
    repeatEnabled: true,
    startDate: "2026-04-20",
    endDate: "2026-04-20",
    importSource: null,
    version: 1,
    status: "published",
    createdAt: "2026-04-18T12:00:00.000Z",
    updatedAt: "2026-04-18T12:00:00.000Z"
  };
}

function makeResponse(): TechnicianScheduleResponse {
  return {
    id: "response-1",
    technicianId: "tech-1",
    storeId: "store-1",
    policyId: "policy-1",
    periodStart: "2026-04-20",
    periodEnd: "2026-04-20",
    responseStatus: "submitted",
    submittedAt: "2026-04-18T12:00:00.000Z",
    updatedAt: "2026-04-18T12:00:00.000Z",
    templateId: "template-tech-1",
    slotOverrideIds: [],
    specialRules: createDefaultTechnicianSpecialRules(),
    version: 1
  };
}

describe("shift planning schedule context", () => {
  it("treats technicians without an active store affiliation as independent self-final", () => {
    const context = resolveScheduleContext({
      technician: makeTechnician({
        storeId: "",
        identityLabel: "个人技师"
      }),
      modeConfigs: []
    });

    expect(context.context).toBe("INDIVIDUAL_SELF_FINAL");
    expect(context.requiresStoreConfirmation).toBe(false);
    expect(context.uiHints.primaryAction).toContain("发布");
  });

  it("resolves store technician self-final mode from the store mode config", () => {
    const context = resolveScheduleContext({
      technician: makeTechnician(),
      modeConfigs: [makeModeConfig("TECHNICIAN_SELF_FINAL")]
    });

    expect(context.context).toBe("STORE_TECH_SELF_FINAL");
    expect(context.canSelfPublish).toBe(true);
  });

  it("falls back to store confirm required when no self-final config is active", () => {
    const context = resolveScheduleContext({
      technician: makeTechnician(),
      modeConfigs: []
    });

    expect(context.context).toBe("STORE_CONFIRM_REQUIRED");
    expect(context.requiresStoreConfirmation).toBe(true);
  });

  it("makes store direct assignment read-only for technicians", () => {
    const context = resolveScheduleContext({
      technician: makeTechnician(),
      modeConfigs: [makeModeConfig("STORE_DIRECT_ASSIGN")]
    });

    expect(context.context).toBe("STORE_DIRECT_ASSIGN");
    expect(context.canSelfPublish).toBe(false);
    expect(context.uiHints.primaryAction).toContain("确认收到");
  });
});

describe("final bookable slot projection", () => {
  it("projects published technician slots and marks blocked / booked outcomes in self-final mode", () => {
    const slots = buildFinalBookableSlotsForTechnician({
      technician: makeTechnician(),
      modeConfigs: [makeModeConfig("TECHNICIAN_SELF_FINAL")],
      policies: [makePolicy()],
      templates: [makeStoreTemplate(), makeResponseTemplate()],
      overrides: [] satisfies ScheduleSlotOverride[],
      responses: [makeResponse()],
      confirmedShifts: [] satisfies ConfirmedShift[],
      busySchedules: [
        {
          id: "schedule-1",
          staffId: "tech-1",
          date: "2026-04-20",
          startTime: "10:00",
          endTime: "11:00",
          status: "booked"
        }
      ] satisfies Schedule[],
      atDate: "2026-04-20T09:00:00.000Z"
    });

    expect(slots.find((slot) => slot.hour === 10)?.status).toBe("booked");
    expect(slots.find((slot) => slot.hour === 11)?.status).toBe("blocked_by_store");
  });

  it("only uses confirmed shifts as the final source in store confirm mode", () => {
    const slots = buildFinalBookableSlotsForTechnician({
      technician: makeTechnician(),
      modeConfigs: [makeModeConfig("STORE_CONFIRM_REQUIRED")],
      policies: [makePolicy()],
      templates: [makeStoreTemplate(), makeResponseTemplate()],
      overrides: [] satisfies ScheduleSlotOverride[],
      responses: [makeResponse()],
      confirmedShifts: [
        {
          id: "confirmed-1",
          storeId: "store-1",
          technicianId: "tech-1",
          policyId: "policy-1",
          date: "2026-04-20",
          hour: 10,
          shiftStatus: "confirmed",
          source: "manual",
          ruleSnapshot: "manual",
          confirmedAt: "2026-04-20T09:00:00.000Z",
          confirmedBy: "store-1"
        }
      ] satisfies ConfirmedShift[],
      busySchedules: [] satisfies Schedule[],
      atDate: "2026-04-20T09:00:00.000Z"
    });

    expect(slots).toHaveLength(1);
    expect(slots[0]?.sourceType).toBe("store_confirmed");
    expect(slots[0]?.status).toBe("available");
  });
});
