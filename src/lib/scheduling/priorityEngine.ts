import type { DispatchCandidate, DispatchCycle } from "../../features/dispatch-center/domain";

function compareBoolean(left: boolean, right: boolean) {
  return Number(right) - Number(left);
}

export function rankDispatchCandidates(cycle: DispatchCycle, candidates: DispatchCandidate[]) {
  const rules = cycle.ruleSet.priorityRules;

  return [...candidates].sort((left, right) => {
    const preferredDelta = compareBoolean(left.isPreferredTechnician, right.isPreferredTechnician);
    if (preferredDelta !== 0) {
      return preferredDelta;
    }

    const languageDelta = compareBoolean(left.supportsSelectedLanguage, right.supportsSelectedLanguage);
    if (languageDelta !== 0) {
      return languageDelta;
    }

    if (rules.requireForeignerSupport) {
      const foreignerDelta = compareBoolean(left.supportsForeigners, right.supportsForeigners);
      if (foreignerDelta !== 0) {
        return foreignerDelta;
      }
    }

    if (rules.confirmedHoursPriority === "less_first" && left.confirmedHours !== right.confirmedHours) {
      return left.confirmedHours - right.confirmedHours;
    }

    if (rules.confirmedHoursPriority === "more_first" && left.confirmedHours !== right.confirmedHours) {
      return right.confirmedHours - left.confirmedHours;
    }

    if (rules.preferEarlyResponder && left.responseTimestamp !== right.responseTimestamp) {
      return left.responseTimestamp - right.responseTimestamp;
    }

    if (rules.useIdFallback) {
      return left.technician.id.localeCompare(right.technician.id, "ja");
    }

    return 0;
  });
}

