export type PayrollCadence = "daily" | "weekly" | "monthly";
export type PayrollHolidayAdjustment = "previous_business_day" | "next_business_day";

export interface PayrollScheduleRule {
  cadence: PayrollCadence;
  weeklySettlementWeekday: number | null;
  monthlySettlementDay: number | null;
  holidayAdjustment: PayrollHolidayAdjustment;
  timezone: string;
}

export interface PayrollSchedulePreview {
  periodStart: string;
  periodEnd: string;
  naturalSettlementDate: string;
  plannedPaymentDate: string;
  adjustmentReason: "weekend" | "public_holiday" | null;
}

export interface ShopPayrollSchedulePolicyPayload extends PayrollScheduleRule {
  id: number;
  shopId: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "archived";
  version: number;
  createdById: number | null;
  updatedById: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeePayrollScheduleOverridePayload {
  id: number;
  technicianShopAffiliationId: number;
  inheritShopPolicy: boolean;
  cadence: PayrollCadence | null;
  weeklySettlementWeekday: number | null;
  monthlySettlementDay: number | null;
  holidayAdjustment: PayrollHolidayAdjustment | null;
  timezone: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "archived";
  version: number;
  createdById: number | null;
  updatedById: number | null;
  createdAt: string;
  updatedAt: string;
}

interface PayrollSchedulePreviewInput {
  rule: PayrollScheduleRule;
  referenceDate: string;
  nonBusinessDates: ReadonlySet<string>;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(value: string): Date {
  if (!DATE_KEY_PATTERN.test(value)) {
    throw new Error("error.payroll_schedule.date_invalid");
  }

  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || toDateKey(result) !== value) {
    throw new Error("error.payroll_schedule.date_invalid");
  }
  return result;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function monthlySettlementDate(year: number, monthIndex: number, settlementDay: number): Date {
  return new Date(
    Date.UTC(year, monthIndex, Math.min(settlementDay, daysInMonth(year, monthIndex)))
  );
}

function isoWeekday(value: Date): number {
  const weekday = value.getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function isWeekend(value: Date): boolean {
  return value.getUTCDay() === 0 || value.getUTCDay() === 6;
}

function isBusinessDay(value: Date, nonBusinessDates: ReadonlySet<string>): boolean {
  return !isWeekend(value) && !nonBusinessDates.has(toDateKey(value));
}

function resolveNaturalWindow(
  rule: PayrollScheduleRule,
  referenceDate: Date
): { start: Date; end: Date } {
  if (rule.cadence === "daily") {
    return { start: referenceDate, end: referenceDate };
  }

  if (rule.cadence === "weekly") {
    if (
      rule.weeklySettlementWeekday === null ||
      rule.weeklySettlementWeekday < 1 ||
      rule.weeklySettlementWeekday > 7
    ) {
      throw new Error("error.payroll_schedule.weekday_invalid");
    }
    const daysUntilSettlement = (rule.weeklySettlementWeekday - isoWeekday(referenceDate) + 7) % 7;
    const end = addDays(referenceDate, daysUntilSettlement);
    return { start: addDays(end, -6), end };
  }

  if (
    rule.monthlySettlementDay === null ||
    rule.monthlySettlementDay < 1 ||
    rule.monthlySettlementDay > 31
  ) {
    throw new Error("error.payroll_schedule.month_day_invalid");
  }

  const year = referenceDate.getUTCFullYear();
  const monthIndex = referenceDate.getUTCMonth();
  let end = monthlySettlementDate(year, monthIndex, rule.monthlySettlementDay);
  if (end < referenceDate) {
    end = monthlySettlementDate(year, monthIndex + 1, rule.monthlySettlementDay);
  }
  const previousEnd = monthlySettlementDate(
    end.getUTCFullYear(),
    end.getUTCMonth() - 1,
    rule.monthlySettlementDay
  );
  return { start: addDays(previousEnd, 1), end };
}

export function calculatePayrollSchedulePreview({
  rule,
  referenceDate,
  nonBusinessDates
}: PayrollSchedulePreviewInput): PayrollSchedulePreview {
  if (rule.timezone !== "Asia/Tokyo") {
    throw new Error("error.payroll_schedule.timezone_unsupported");
  }

  const reference = parseDateKey(referenceDate);
  const window = resolveNaturalWindow(rule, reference);
  const naturalSettlementDate = toDateKey(window.end);
  let plannedPayment = window.end;
  const adjustmentReason = nonBusinessDates.has(naturalSettlementDate)
    ? "public_holiday"
    : isWeekend(window.end)
      ? "weekend"
      : null;

  if (adjustmentReason !== null) {
    const direction = rule.holidayAdjustment === "previous_business_day" ? -1 : 1;
    do {
      plannedPayment = addDays(plannedPayment, direction);
    } while (!isBusinessDay(plannedPayment, nonBusinessDates));
  }

  return {
    periodStart: toDateKey(window.start),
    periodEnd: toDateKey(window.end),
    naturalSettlementDate,
    plannedPaymentDate: toDateKey(plannedPayment),
    adjustmentReason
  };
}
