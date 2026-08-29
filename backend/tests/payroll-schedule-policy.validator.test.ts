import {
  employeePayrollSchedulePolicyBodySchema,
  employeePayrollSchedulePolicyParamSchema,
  shopPayrollSchedulePolicyBodySchema
} from "../src/validators/payroll-schedule-policy.validator";

describe("payroll schedule policy validators", () => {
  it("accepts a daily shop policy without cadence-specific fields", () => {
    expect(
      shopPayrollSchedulePolicyBodySchema.parse({
        cadence: "daily",
        weeklySettlementWeekday: null,
        monthlySettlementDay: null,
        holidayAdjustment: "next_business_day",
        timezone: "Asia/Tokyo",
        effectiveFrom: "2026-08-29"
      })
    ).toMatchObject({ cadence: "daily", effectiveFrom: "2026-08-29" });
  });

  it("requires exactly one weekly weekday for a weekly policy", () => {
    expect(() =>
      shopPayrollSchedulePolicyBodySchema.parse({
        cadence: "weekly",
        weeklySettlementWeekday: null,
        monthlySettlementDay: null,
        holidayAdjustment: "previous_business_day",
        timezone: "Asia/Tokyo",
        effectiveFrom: "2026-08-29"
      })
    ).toThrow();

    expect(
      shopPayrollSchedulePolicyBodySchema.parse({
        cadence: "weekly",
        weeklySettlementWeekday: 5,
        monthlySettlementDay: null,
        holidayAdjustment: "previous_business_day",
        timezone: "Asia/Tokyo",
        effectiveFrom: "2026-08-29"
      }).weeklySettlementWeekday
    ).toBe(5);
  });

  it("accepts day 31 for monthly policy and rejects contradictory weekly input", () => {
    expect(
      shopPayrollSchedulePolicyBodySchema.parse({
        cadence: "monthly",
        weeklySettlementWeekday: null,
        monthlySettlementDay: 31,
        holidayAdjustment: "next_business_day",
        timezone: "Asia/Tokyo",
        effectiveFrom: "2026-08-29"
      }).monthlySettlementDay
    ).toBe(31);

    expect(() =>
      shopPayrollSchedulePolicyBodySchema.parse({
        cadence: "monthly",
        weeklySettlementWeekday: 1,
        monthlySettlementDay: 31,
        holidayAdjustment: "next_business_day",
        timezone: "Asia/Tokyo",
        effectiveFrom: "2026-08-29"
      })
    ).toThrow();
  });

  it("rejects unsupported timezones and impossible effective ranges", () => {
    expect(() =>
      shopPayrollSchedulePolicyBodySchema.parse({
        cadence: "daily",
        weeklySettlementWeekday: null,
        monthlySettlementDay: null,
        holidayAdjustment: "next_business_day",
        timezone: "UTC",
        effectiveFrom: "2026-08-29"
      })
    ).toThrow();

    expect(() =>
      shopPayrollSchedulePolicyBodySchema.parse({
        cadence: "daily",
        weeklySettlementWeekday: null,
        monthlySettlementDay: null,
        holidayAdjustment: "next_business_day",
        timezone: "Asia/Tokyo",
        effectiveFrom: "2026-09-01",
        effectiveTo: "2026-08-31"
      })
    ).toThrow();
  });

  it("allows an employee to inherit the shop policy without duplicate rule fields", () => {
    expect(
      employeePayrollSchedulePolicyBodySchema.parse({
        inheritShopPolicy: true,
        cadence: null,
        weeklySettlementWeekday: null,
        monthlySettlementDay: null,
        holidayAdjustment: null,
        timezone: null,
        effectiveFrom: "2026-08-29"
      }).inheritShopPolicy
    ).toBe(true);
  });

  it("requires a complete employee rule when inheritance is disabled", () => {
    expect(() =>
      employeePayrollSchedulePolicyBodySchema.parse({
        inheritShopPolicy: false,
        cadence: "weekly",
        weeklySettlementWeekday: null,
        monthlySettlementDay: null,
        holidayAdjustment: "next_business_day",
        timezone: "Asia/Tokyo",
        effectiveFrom: "2026-08-29"
      })
    ).toThrow();
  });

  it("only accepts canonical technician NeeDoIDs in the employee route", () => {
    expect(employeePayrollSchedulePolicyParamSchema.parse({ needoId: "s0000000047" })).toEqual({
      needoId: "s0000000047"
    });
    expect(() =>
      employeePayrollSchedulePolicyParamSchema.parse({ needoId: "u0000000047" })
    ).toThrow();
  });
});
