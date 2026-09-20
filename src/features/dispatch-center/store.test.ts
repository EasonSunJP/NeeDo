import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import storeSource from "./store.ts?raw";
import { addDays } from "./domain";
import {
  closeDispatchFeedback,
  cancelDispatchCycle,
  createDispatchCycleDraft,
  finalizeDispatchCycle,
  getDispatchCenterSnapshot,
  getDispatchCycleList,
  getDispatchOverviewSummary,
  getDispatchScheduleGrid,
  getSmartScheduleReadiness,
  launchDispatchCycle,
  resetDispatchCenterStore,
  runDispatchAutoConfirm,
  runDispatchSmartSchedule,
  saveDispatchCycleDraft,
  sendDispatchFeedbackReminder
} from "./store";

describe("dispatch center scheduling workflow", () => {
  beforeEach(() => {
    resetDispatchCenterStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens final confirmation directly for technician self-scheduling", () => {
    const cycle = createDispatchCycleDraft("store-1");

    expect(cycle.currentStep).toBe(1);
    expect(cycle.mode).toBe("TECH_SELF_FINAL");
    expect(cycle.feedbackDeadline).toBeNull();

    const saved = saveDispatchCycleDraft({ ...cycle, currentStep: 2 });
    expect(saved.ok).toBe(true);

    const launched = launchDispatchCycle(cycle.id, "store-1");
    expect(launched.ok).toBe(true);
    expect(launched.cycle?.currentStep).toBe(3);
    expect(launched.cycle?.status).toBe("final_confirming");
    expect(getDispatchCenterSnapshot().finalBookableSlots.some((slot) => slot.cycleId === cycle.id)).toBe(false);
  });

  it("preserves technician feedback before final confirmation for merchant direct scheduling", () => {
    const cycle = createDispatchCycleDraft("store-1");
    const saved = saveDispatchCycleDraft({
      ...cycle,
      currentStep: 2,
      mode: "STORE_ASSIGN_FINAL",
      feedbackDeadline: `${cycle.periodStart}T18:00:00+09:00`
    });

    expect(saved.ok).toBe(true);

    const launched = launchDispatchCycle(cycle.id, "store-1");
    expect(launched.ok).toBe(true);
    expect(launched.cycle?.currentStep).toBe(3);
    expect(launched.cycle?.status).toBe("collecting_feedback");
    expect(launched.cycle?.feedbackDeadline).toBe(`${cycle.periodStart}T18:00:00+09:00`);
    expect(getDispatchCenterSnapshot().feedbacks.some((entry) => entry.cycleId === cycle.id)).toBe(false);
    expect(getDispatchCenterSnapshot().finalShifts.some((shift) => shift.cycleId === cycle.id)).toBe(true);
    expect(getDispatchCenterSnapshot().finalBookableSlots.some((slot) => slot.cycleId === cycle.id)).toBe(false);

    const closed = closeDispatchFeedback(cycle.id, "store-1");
    expect(closed.ok).toBe(true);
    expect(closed.cycle?.currentStep).toBe(4);

    const finalized = finalizeDispatchCycle(cycle.id, "store-1");
    expect(finalized.ok).toBe(true);
    expect(finalized.cycle?.status).toBe("confirmed");
    expect(getDispatchCenterSnapshot().finalBookableSlots.filter((slot) => slot.cycleId === cycle.id && slot.status === "available").length).toBeGreaterThan(0);
  });

  it("requires a feedback deadline only for merchant direct scheduling", () => {
    const cycle = createDispatchCycleDraft("store-1");
    saveDispatchCycleDraft({ ...cycle, currentStep: 2, mode: "STORE_ASSIGN_FINAL", feedbackDeadline: null });

    expect(launchDispatchCycle(cycle.id, "store-1")).toEqual({
      ok: false,
      message: "请设置技师反馈截止时间。"
    });
  });

  it("rejects feedback actions outside the collection state", () => {
    const cycle = createDispatchCycleDraft("store-1");

    expect(sendDispatchFeedbackReminder(cycle.id, "store-1")).toEqual({
      ok: false,
      message: "当前阶段不允许提醒反馈。"
    });
    expect(closeDispatchFeedback(cycle.id, "store-1")).toEqual({
      ok: false,
      message: "当前阶段不允许结束反馈收集。"
    });
  });

  it("saves incomplete drafts but rejects invalid rules before launch", () => {
    const cycle = createDispatchCycleDraft("store-1");
    const periodEnd = addDays(cycle.periodStart, 366);
    const saved = saveDispatchCycleDraft({
      ...cycle,
      currentStep: 2,
      periodEnd,
      targetTechnicianIds: []
    });

    expect(saved.ok).toBe(true);
    const launched = launchDispatchCycle(cycle.id, "store-1");
    expect(launched.ok).toBe(false);
    expect(launched.message).toContain("排班对象不能为空");

    const storedCycle = getDispatchCycleList("store-1").find((item) => item.id === cycle.id);
    expect(storedCycle?.periodEnd).toBe(periodEnd);
  });

  it("defaults a new cycle to today through one calendar month later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00+09:00"));
    const cycle = createDispatchCycleDraft("new-store");
    expect(cycle.periodStart).toBe("2026-09-20");
    expect(cycle.periodEnd).toBe("2026-10-20");
    expect(cycle.feedbackDeadline).toBeNull();
  });

  it("does not inherit a historical draft when creating a blank cycle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00+09:00"));
    const baseline = createDispatchCycleDraft("fresh-store", ["current-tech"]);
    const history = createDispatchCycleDraft("store-1", ["former-tech"]);
    const historicalDraft = {
      ...history,
      name: "历史草稿",
      periodStart: "2026-05-27",
      periodEnd: "2026-06-25",
      templateType: "day" as const,
      templateMatrix: [Array(24).fill(false)],
      regularHolidayWeekdays: [1, 2, 3, 4, 5],
      ruleSet: { ...history.ruleSet, minStaff: 9, targetStaff: 10, maxStaff: 11 }
    };
    saveDispatchCycleDraft(historicalDraft);

    const cycle = createDispatchCycleDraft("store-1", ["current-tech"]);

    expect(cycle).toMatchObject({
      periodStart: baseline.periodStart,
      periodEnd: baseline.periodEnd,
      templateType: baseline.templateType,
      templateMatrix: baseline.templateMatrix,
      regularHolidayWeekdays: baseline.regularHolidayWeekdays,
      ruleSet: baseline.ruleSet,
      targetTechnicianIds: ["current-tech"]
    });
    expect(cycle.id).not.toBe(history.id);
    expect(getDispatchCycleList("store-1").find((item) => item.id === history.id))
      .toMatchObject(historicalDraft);
  });

  it("discards a new cycle when editing is cancelled", () => {
    const cycle = createDispatchCycleDraft("store-1");
    expect(cancelDispatchCycle(cycle.id, "store-1").ok).toBe(true);
    expect(getDispatchCycleList("store-1").some((item) => item.id === cycle.id)).toBe(false);
  });

  it("starts the formal schedule views without generated technicians or shifts", () => {
    const weekGrid = getDispatchScheduleGrid("store-1", "week", "2026-04-20");
    const monthGrid = getDispatchScheduleGrid("store-1", "month", "2026-04-20");

    expect(weekGrid.rows).toEqual([]);
    expect(monthGrid.rows).toEqual([]);
    expect(getDispatchCenterSnapshot().arrangements).toEqual([]);
  });

  it("returns an honest empty summary when no formal schedule exists", () => {
    const summary = getDispatchOverviewSummary("store-1");

    expect(summary.effectiveTimeLabel).toBe("-");
    expect(summary.technicianCount).toBe(0);
    expect(summary.activeCycle).toBeNull();
  });

  it("keeps formal smart scheduling unavailable until its server contract exists", () => {
    const readiness = getSmartScheduleReadiness("store-1");

    expect(readiness.status).toBe("cold_start");
    expect(readiness.canRunSmartSchedule).toBe(false);

    const formalRun = runDispatchSmartSchedule({
      operatorId: "store-1",
      runType: "generate",
      storeId: "store-1"
    });

    expect(formalRun.ok).toBe(false);
    expect("message" in formalRun ? formalRun.message : "").toBe("error.feature_unavailable");

    const previewRun = runDispatchSmartSchedule({
      operatorId: "store-1",
      runType: "preview",
      storeId: "store-1"
    });

    expect(previewRun.ok).toBe(false);
  });
});

describe("dispatch center hydration safety", () => {
  it("defers cross-store projection updates until after React commits", () => {
    expect(storeSource).toContain('import { useEffect, useSyncExternalStore } from "react"');
    expect(storeSource).toContain("projectionSyncPending = true");
    expect(storeSource).toContain("useEffect(() => {");
    expect(storeSource).toContain("flushHydrationProjections()");
    expect(storeSource).not.toContain("function getSnapshot(): DispatchCenterSnapshot {\n  hydrate();\n  syncShiftPlanningProjection();");
  });
});
