import { beforeEach, describe, expect, it } from "vitest";
import storeSource from "./store.ts?raw";
import { addDays } from "./domain";
import {
  closeDispatchFeedback,
  createDispatchCycleDraft,
  getDispatchCenterSnapshot,
  getDispatchCycleList,
  getDispatchOverviewSummary,
  getDispatchScheduleGrid,
  getSmartScheduleReadiness,
  launchDispatchCycle,
  resetDispatchCenterStore,
  runDispatchAutoConfirm,
  runDispatchSmartSchedule,
  saveDispatchCycleDraft
} from "./store";

describe("dispatch center scheduling workflow", () => {
  beforeEach(() => {
    resetDispatchCenterStore();
  });

  it("starts new cycles at mode selection and moves collect-confirm cycles through feedback then final confirmation", () => {
    const cycle = createDispatchCycleDraft("store-1");

    expect(cycle.currentStep).toBe(1);

    const saved = saveDispatchCycleDraft({ ...cycle, currentStep: 2, mode: "STORE_COLLECT_CONFIRM" });
    expect(saved.ok).toBe(true);

    const launched = launchDispatchCycle(cycle.id, "store-1");
    expect(launched.ok).toBe(true);
    expect(launched.cycle?.currentStep).toBe(3);
    expect(launched.cycle?.status).toBe("collecting_feedback");

    const closed = closeDispatchFeedback(cycle.id, "store-1");
    expect(closed.ok).toBe(true);
    expect(closed.cycle?.currentStep).toBe(4);
    expect(closed.cycle?.status).toBe("feedback_closed");

    const confirmed = runDispatchAutoConfirm(cycle.id, "store-1");
    expect(confirmed.ok).toBe(true);
    const storedCycle = getDispatchCycleList("store-1").find((item) => item.id === cycle.id);
    expect(storedCycle?.status).toBe("final_confirming");
  });

  it("publishes direct-assign cycles without collecting feedback", () => {
    const cycle = createDispatchCycleDraft("store-1");
    const saved = saveDispatchCycleDraft({
      ...cycle,
      currentStep: 2,
      mode: "STORE_ASSIGN_FINAL",
      feedbackDeadline: null
    });

    expect(saved.ok).toBe(true);

    const launched = launchDispatchCycle(cycle.id, "store-1");
    expect(launched.ok).toBe(true);
    expect(launched.cycle?.currentStep).toBe(4);
    expect(launched.cycle?.status).toBe("confirmed");
    expect(getDispatchCenterSnapshot().feedbacks.some((entry) => entry.cycleId === cycle.id)).toBe(false);
    expect(getDispatchCenterSnapshot().finalBookableSlots.filter((slot) => slot.cycleId === cycle.id && slot.status === "available").length).toBeGreaterThan(0);
  });

  it("rejects cycles longer than one year before saving", () => {
    const cycle = createDispatchCycleDraft("store-1");
    const result = saveDispatchCycleDraft({
      ...cycle,
      periodEnd: addDays(cycle.periodStart, 365)
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("最长 1 年");

    const storedCycle = getDispatchCycleList("store-1").find((item) => item.id === cycle.id);
    expect(storedCycle?.periodEnd).toBe(cycle.periodEnd);
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
