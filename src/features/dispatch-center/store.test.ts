import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "./domain";
import {
  closeDispatchFeedback,
  createDispatchCycleDraft,
  getDispatchCenterSnapshot,
  getDispatchCycleList,
  getDispatchOverviewRangeSummary,
  getDispatchOverviewSummary,
  getDispatchScheduleGrid,
  getSmartScheduleReadiness,
  launchDispatchCycle,
  resetDispatchCenterStore,
  runDispatchAutoConfirm,
  runDispatchSmartSchedule,
  updateSmartScheduleAutomationPolicy,
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

  it("keeps a per-technician day timeline inside week and month cells", () => {
    const weekGrid = getDispatchScheduleGrid("store-1", "week", "2026-04-20");
    const monthGrid = getDispatchScheduleGrid("store-1", "month", "2026-04-20");
    const weekCell = weekGrid.rows[0]?.cells[0];
    const monthCell = monthGrid.rows[0]?.cells[0];

    expect(weekCell?.hour).toBeNull();
    expect(weekCell?.dayTimeline).toHaveLength(24);
    expect(weekCell?.dayTimeline?.every((slot) => slot.hour >= 0 && slot.hour <= 23)).toBe(true);
    expect(monthCell?.dayTimeline).toHaveLength(24);
  });

  it("summarizes current-cycle status without requiring schedule grid materialization", () => {
    const summary = getDispatchOverviewSummary("store-1");
    const daySummary = getDispatchOverviewRangeSummary("store-1", "day", "2026-04-20", summary.activeCycle?.id);
    const weekSummary = getDispatchOverviewRangeSummary("store-1", "week", "2026-04-20", summary.activeCycle?.id);
    const monthSummary = getDispatchOverviewRangeSummary("store-1", "month", "2026-04-20", summary.activeCycle?.id);

    expect(summary.effectiveTimeLabel).toMatch(/^2026\.04\.\d{2} 00:00~2026\.04\.\d{2} 23:59$/);
    expect(summary.confirmedDayLabel).toMatch(/^\d+\/\d+ 天$/);
    expect(summary.technicianCount).toBeGreaterThan(0);
    expect(summary.confirmedArrangementLabel).toContain("单");
    expect(summary.applicationCountLabel).toContain("件");
    expect(weekSummary.effectiveTimeLabel).toContain("~");
    expect(weekSummary.technicianCountLabel).toMatch(/^\d+\/\d+$/);
    expect(weekSummary.confirmedOrderLabel).toContain("单");
    expect(daySummary.effectiveEndDateLabel).toBe("2026.04.20");
    expect(weekSummary.effectiveEndDateLabel).toBe("2026.04.26");
    expect(monthSummary.effectiveEndDateLabel).toBe("2026.04.27");
    expect(daySummary.confirmedDayLabel).toBe("1/1 天");
    expect(weekSummary.confirmedDayLabel).toBe("3/7 天");
    expect(monthSummary.confirmedDayLabel).toBe("3/8 天");
    expect(daySummary.confirmedOrderLabel).not.toBe(weekSummary.confirmedOrderLabel);
    expect(daySummary.applicationCountLabel).not.toBe(weekSummary.applicationCountLabel);
  });

  it("keeps formal smart scheduling behind cold-start readiness while allowing previews", () => {
    const readiness = getSmartScheduleReadiness("store-1");

    expect(readiness.status).toBe("cold_start");
    expect(readiness.canRunSmartSchedule).toBe(false);

    const formalRun = runDispatchSmartSchedule({
      operatorId: "store-1",
      runType: "generate",
      storeId: "store-1"
    });

    expect(formalRun.ok).toBe(false);
    expect("message" in formalRun ? formalRun.message : "").toContain("冷启动");

    const previewRun = runDispatchSmartSchedule({
      operatorId: "store-1",
      runType: "preview",
      storeId: "store-1"
    });

    expect(previewRun.ok).toBe(true);
  });

  it("marks smart scheduling ready after the reserved period and data gates are met", () => {
    updateSmartScheduleAutomationPolicy("store-1", {
      coldStartStartedAt: "2026-03-01",
      coldStartEndsAt: "2026-03-14",
      minimumHistoricalOrderCount: 1,
      minimumPreferenceCoveragePercent: 50
    });

    const readiness = getSmartScheduleReadiness("store-1");

    expect(readiness.status).toBe("ready");
    expect(readiness.canRunSmartSchedule).toBe(true);
  });
});
