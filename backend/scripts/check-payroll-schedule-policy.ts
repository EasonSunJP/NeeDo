import { prisma } from "../src/prisma/client";

interface Issue {
  code: string;
  recordType: string;
  recordId?: number;
  detail: string;
}

function hasValidCadenceFields(record: {
  cadence: string | null;
  weeklySettlementWeekday: number | null;
  monthlySettlementDay: number | null;
}): boolean {
  if (record.cadence === "daily") {
    return record.weeklySettlementWeekday === null && record.monthlySettlementDay === null;
  }
  if (record.cadence === "weekly") {
    return (
      record.weeklySettlementWeekday !== null &&
      record.weeklySettlementWeekday >= 1 &&
      record.weeklySettlementWeekday <= 7 &&
      record.monthlySettlementDay === null
    );
  }
  if (record.cadence === "monthly") {
    return (
      record.weeklySettlementWeekday === null &&
      record.monthlySettlementDay !== null &&
      record.monthlySettlementDay >= 1 &&
      record.monthlySettlementDay <= 31
    );
  }
  return false;
}

async function main(): Promise<void> {
  const [shopPolicies, employeeOverrides, holidaySummary] = await Promise.all([
    prisma.shopPayrollSchedulePolicy.findMany({
      where: { status: "active", deletedAt: null },
      select: {
        id: true,
        cadence: true,
        weeklySettlementWeekday: true,
        monthlySettlementDay: true,
        holidayAdjustment: true,
        timezone: true
      }
    }),
    prisma.technicianPayrollScheduleOverride.findMany({
      where: { status: "active", deletedAt: null },
      select: {
        id: true,
        inheritShopPolicy: true,
        cadence: true,
        weeklySettlementWeekday: true,
        monthlySettlementDay: true,
        holidayAdjustment: true,
        timezone: true
      }
    }),
    prisma.businessCalendarDate.aggregate({
      where: {
        countryCode: "JP",
        isPublicHoliday: true,
        isBusinessDay: false,
        sourceVersion: "cabinet-office-2026-08-29",
        calendarDate: {
          gte: new Date("2025-01-01T00:00:00.000Z"),
          lte: new Date("2027-12-31T00:00:00.000Z")
        },
        deletedAt: null
      },
      _count: { id: true },
      _min: { calendarDate: true },
      _max: { calendarDate: true }
    })
  ]);
  const issues: Issue[] = [];

  for (const policy of shopPolicies) {
    if (
      !hasValidCadenceFields(policy) ||
      !["previous_business_day", "next_business_day"].includes(policy.holidayAdjustment) ||
      policy.timezone !== "Asia/Tokyo"
    ) {
      issues.push({
        code: "SHOP_POLICY_INVALID",
        recordType: "shop_payroll_schedule_policy",
        recordId: policy.id,
        detail: "cadence, holiday adjustment, or timezone is inconsistent"
      });
    }
  }

  for (const override of employeeOverrides) {
    const inheritedFieldsAreNull =
      override.cadence === null &&
      override.weeklySettlementWeekday === null &&
      override.monthlySettlementDay === null &&
      override.holidayAdjustment === null &&
      override.timezone === null;
    const individualRuleIsValid =
      override.cadence !== null &&
      override.holidayAdjustment !== null &&
      override.timezone === "Asia/Tokyo" &&
      ["previous_business_day", "next_business_day"].includes(override.holidayAdjustment) &&
      hasValidCadenceFields(override);
    if (
      (override.inheritShopPolicy && !inheritedFieldsAreNull) ||
      (!override.inheritShopPolicy && !individualRuleIsValid)
    ) {
      issues.push({
        code: "EMPLOYEE_OVERRIDE_INVALID",
        recordType: "technician_payroll_schedule_override",
        recordId: override.id,
        detail: "inheritance and cadence-specific fields are inconsistent"
      });
    }
  }

  if (
    holidaySummary._count.id !== 54 ||
    holidaySummary._min.calendarDate?.toISOString().slice(0, 10) !== "2025-01-01" ||
    holidaySummary._max.calendarDate?.toISOString().slice(0, 10) !== "2027-11-23"
  ) {
    issues.push({
      code: "JP_HOLIDAY_SOURCE_INCOMPLETE",
      recordType: "business_calendar_date",
      detail: `expected 54 official rows for 2025-2027, found ${holidaySummary._count.id}`
    });
  }

  const result = {
    ready: issues.length === 0,
    activeShopPolicies: shopPolicies.length,
    activeEmployeeOverrides: employeeOverrides.length,
    officialJapanHolidayRows: holidaySummary._count.id,
    sourceVersion: "cabinet-office-2026-08-29",
    issues
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ready) process.exitCode = 1;
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
