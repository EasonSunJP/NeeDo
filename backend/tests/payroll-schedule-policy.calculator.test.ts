import {
  calculatePayrollSchedulePreview,
  type PayrollScheduleRule
} from "../src/domain/payroll-schedule-policy";

const calculate = (rule: PayrollScheduleRule, referenceDate: string, holidays: string[] = []) =>
  calculatePayrollSchedulePreview({
    rule,
    referenceDate,
    nonBusinessDates: new Set(holidays)
  });

describe("payroll schedule policy calculator", () => {
  it("uses the reference date as the daily settlement period", () => {
    expect(
      calculate(
        {
          cadence: "daily",
          weeklySettlementWeekday: null,
          monthlySettlementDay: null,
          holidayAdjustment: "next_business_day",
          timezone: "Asia/Tokyo"
        },
        "2026-08-28"
      )
    ).toEqual({
      periodStart: "2026-08-28",
      periodEnd: "2026-08-28",
      naturalSettlementDate: "2026-08-28",
      plannedPaymentDate: "2026-08-28",
      adjustmentReason: null
    });
  });

  it("builds a Monday through Sunday period for a Sunday weekly settlement", () => {
    expect(
      calculate(
        {
          cadence: "weekly",
          weeklySettlementWeekday: 7,
          monthlySettlementDay: null,
          holidayAdjustment: "next_business_day",
          timezone: "Asia/Tokyo"
        },
        "2026-08-26"
      )
    ).toEqual({
      periodStart: "2026-08-24",
      periodEnd: "2026-08-30",
      naturalSettlementDate: "2026-08-30",
      plannedPaymentDate: "2026-08-31",
      adjustmentReason: "weekend"
    });
  });

  it("uses the configured monthly settlement day and the previous day plus one as the period boundary", () => {
    expect(
      calculate(
        {
          cadence: "monthly",
          weeklySettlementWeekday: null,
          monthlySettlementDay: 25,
          holidayAdjustment: "next_business_day",
          timezone: "Asia/Tokyo"
        },
        "2026-08-10"
      )
    ).toEqual({
      periodStart: "2026-07-26",
      periodEnd: "2026-08-25",
      naturalSettlementDate: "2026-08-25",
      plannedPaymentDate: "2026-08-25",
      adjustmentReason: null
    });
  });

  it("falls back from day 31 to the last day in a short month", () => {
    const result = calculate(
      {
        cadence: "monthly",
        weeklySettlementWeekday: null,
        monthlySettlementDay: 31,
        holidayAdjustment: "next_business_day",
        timezone: "Asia/Tokyo"
      },
      "2026-02-10"
    );

    expect(result.periodStart).toBe("2026-02-01");
    expect(result.naturalSettlementDate).toBe("2026-02-28");
    expect(result.plannedPaymentDate).toBe("2026-03-02");
  });

  it("uses February 29 in a leap year", () => {
    const result = calculate(
      {
        cadence: "monthly",
        weeklySettlementWeekday: null,
        monthlySettlementDay: 31,
        holidayAdjustment: "previous_business_day",
        timezone: "Asia/Tokyo"
      },
      "2028-02-10"
    );

    expect(result.naturalSettlementDate).toBe("2028-02-29");
    expect(result.plannedPaymentDate).toBe("2028-02-29");
  });

  it("moves backward across a holiday and weekend chain", () => {
    expect(
      calculate(
        {
          cadence: "daily",
          weeklySettlementWeekday: null,
          monthlySettlementDay: null,
          holidayAdjustment: "previous_business_day",
          timezone: "Asia/Tokyo"
        },
        "2026-09-23",
        ["2026-09-21", "2026-09-22", "2026-09-23"]
      )
    ).toMatchObject({
      naturalSettlementDate: "2026-09-23",
      plannedPaymentDate: "2026-09-18",
      adjustmentReason: "public_holiday"
    });
  });

  it("moves forward across a holiday and weekend chain", () => {
    expect(
      calculate(
        {
          cadence: "daily",
          weeklySettlementWeekday: null,
          monthlySettlementDay: null,
          holidayAdjustment: "next_business_day",
          timezone: "Asia/Tokyo"
        },
        "2026-11-21",
        ["2026-11-23"]
      )
    ).toMatchObject({
      naturalSettlementDate: "2026-11-21",
      plannedPaymentDate: "2026-11-24",
      adjustmentReason: "weekend"
    });
  });

  it("rejects unsupported timezones instead of silently shifting payroll dates", () => {
    expect(() =>
      calculate(
        {
          cadence: "daily",
          weeklySettlementWeekday: null,
          monthlySettlementDay: null,
          holidayAdjustment: "next_business_day",
          timezone: "UTC"
        },
        "2026-08-28"
      )
    ).toThrow("error.payroll_schedule.timezone_unsupported");
  });
});
