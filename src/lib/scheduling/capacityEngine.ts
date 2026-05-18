import {
  getWeekday,
  type DispatchCapacitySummary,
  type DispatchCycle
} from "../../features/dispatch-center/domain";

function clampInteger(value: number) {
  return Math.max(0, Math.round(value));
}

export function buildCapacityForSlot(cycle: DispatchCycle, dateKey: string): DispatchCapacitySummary {
  const weekday = getWeekday(dateKey);
  const isRegularHoliday = cycle.regularHolidayWeekdays.includes(weekday);
  const holidayDelta = cycle.ruleSet.holidayAdjustments[dateKey] ?? 0;
  const weekdayDelta = cycle.ruleSet.weekdayAdjustments[weekday] ?? 0;

  if (isRegularHoliday) {
    return {
      isHoliday: holidayDelta !== 0,
      isRegularHoliday: true,
      minCount: 0,
      targetCount: 0,
      maxCount: 0
    };
  }

  const minCount = clampInteger(cycle.ruleSet.minStaff);
  const maxCount = Math.max(minCount, clampInteger(cycle.ruleSet.maxStaff));
  const targetCount = Math.max(minCount, Math.min(maxCount, clampInteger(cycle.ruleSet.targetStaff + weekdayDelta + holidayDelta)));

  return {
    isHoliday: holidayDelta !== 0,
    isRegularHoliday: false,
    minCount,
    targetCount,
    maxCount
  };
}

