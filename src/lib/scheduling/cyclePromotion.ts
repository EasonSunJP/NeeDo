import { dispatchReferenceDateKey, type DispatchCycle } from "../../features/dispatch-center/domain";

export type DispatchCycleLimitSummary = {
  activeCount: number;
  pendingCount: number;
  limitReached: boolean;
};

export function summarizeCycleLimits(cycles: DispatchCycle[], storeId: string): DispatchCycleLimitSummary {
  const scoped = cycles.filter((cycle) => cycle.storeId === storeId && cycle.status !== "completed" && cycle.status !== "archived" && cycle.status !== "cancelled");
  const activeCount = scoped.filter((cycle) => cycle.status === "active").length;
  const pendingCount = scoped.filter((cycle) => cycle.status !== "active").length;

  return {
    activeCount,
    pendingCount,
    limitReached: activeCount >= 1 && pendingCount >= 2
  };
}

export function promoteDispatchCycles(cycles: DispatchCycle[], referenceDate = dispatchReferenceDateKey) {
  const next = cycles.map((cycle) => ({ ...cycle }));
  const activeCycle = next.find((cycle) => cycle.status === "active");

  next.forEach((cycle) => {
    if (cycle.status === "active" && cycle.periodEnd < referenceDate) {
      cycle.status = "completed";
      cycle.currentStep = 4;
    }
  });

  if (activeCycle && activeCycle.periodEnd >= referenceDate) {
    return next;
  }

  const promotable = next
    .filter((cycle) => (cycle.status === "confirmed" || cycle.status === "final_confirmed") && cycle.periodStart <= referenceDate)
    .sort((left, right) => left.periodStart.localeCompare(right.periodStart))[0];

  if (promotable) {
    promotable.status = "active";
    promotable.currentStep = 4;
    promotable.activeAt = promotable.activeAt ?? `${promotable.periodStart}T00:00:00+09:00`;
  }

  return next;
}
