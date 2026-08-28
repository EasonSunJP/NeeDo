import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  EmployeePayrollScheduleOverridePayload,
  PayrollCadence,
  PayrollHolidayAdjustment,
  ShopPayrollSchedulePolicyPayload
} from "../domain/payroll-schedule-policy";
import { prisma } from "../prisma/client";
import type {
  ParsedEmployeePayrollSchedulePolicyBody,
  ParsedShopPayrollSchedulePolicyBody
} from "../validators/payroll-schedule-policy.validator";

const CURRENT_WORK_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;

type ShopPolicyRecord = Prisma.ShopPayrollSchedulePolicyGetPayload<Record<string, never>>;
type EmployeeOverrideRecord = Prisma.TechnicianPayrollScheduleOverrideGetPayload<
  Record<string, never>
>;

function dateAtUtcMidnight(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function previousDate(value: string): Date {
  const result = dateAtUtcMidnight(value);
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class PayrollSchedulePolicyRepository {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findActiveShopPolicy(
    shopId: number,
    asOf: string
  ): Promise<ShopPayrollSchedulePolicyPayload | null> {
    const date = dateAtUtcMidnight(asOf);
    const record = await this.client.shopPayrollSchedulePolicy.findFirst({
      where: {
        shopId,
        status: "active",
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
        deletedAt: null
      },
      orderBy: [{ version: "desc" }, { id: "desc" }]
    });
    return record ? this.mapShopPolicy(record) : null;
  }

  public async replaceShopPolicy(
    shopId: number,
    input: ParsedShopPayrollSchedulePolicyBody,
    actorUserId: number
  ): Promise<ShopPayrollSchedulePolicyPayload> {
    const record = await this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM shops WHERE id = ${shopId} AND deleted_at IS NULL FOR UPDATE`
      );
      const latest = await transaction.shopPayrollSchedulePolicy.findFirst({
        where: { shopId },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: { version: true }
      });
      await transaction.shopPayrollSchedulePolicy.updateMany({
        where: { shopId, status: "active", deletedAt: null },
        data: {
          status: "archived",
          activeKey: null,
          effectiveTo: previousDate(input.effectiveFrom),
          updatedById: actorUserId
        }
      });
      return transaction.shopPayrollSchedulePolicy.create({
        data: {
          shopId,
          cadence: input.cadence,
          weeklySettlementWeekday: input.weeklySettlementWeekday,
          monthlySettlementDay: input.monthlySettlementDay,
          holidayAdjustment: input.holidayAdjustment,
          timezone: input.timezone,
          effectiveFrom: dateAtUtcMidnight(input.effectiveFrom),
          effectiveTo: input.effectiveTo ? dateAtUtcMidnight(input.effectiveTo) : null,
          status: "active",
          version: (latest?.version ?? 0) + 1,
          activeKey: `shop:${shopId}`,
          createdById: actorUserId,
          updatedById: actorUserId
        }
      });
    });
    return this.mapShopPolicy(record);
  }

  public async findCurrentEmployeeAffiliation(
    shopId: number,
    needoId: string
  ): Promise<{ id: number; technicianProfileId: number } | null> {
    return this.client.technicianShopAffiliation.findFirst({
      where: {
        shopId,
        activeKey: { not: null },
        workStatus: { in: [...CURRENT_WORK_STATUSES] },
        endsAt: null,
        deletedAt: null,
        technicianProfile: {
          deletedAt: null,
          user: {
            isActive: true,
            deletedAt: null,
            identities: {
              some: {
                type: "technician",
                isActive: true,
                deletedAt: null,
                publicIdentifier: {
                  is: {
                    publicId: needoId,
                    kind: "S",
                    status: "ACTIVE",
                    deletedAt: null
                  }
                }
              }
            }
          }
        }
      },
      select: { id: true, technicianProfileId: true }
    });
  }

  public async findActiveEmployeeOverride(
    technicianShopAffiliationId: number,
    asOf: string
  ): Promise<EmployeePayrollScheduleOverridePayload | null> {
    const date = dateAtUtcMidnight(asOf);
    const record = await this.client.technicianPayrollScheduleOverride.findFirst({
      where: {
        technicianShopAffiliationId,
        status: "active",
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
        deletedAt: null
      },
      orderBy: [{ version: "desc" }, { id: "desc" }]
    });
    return record ? this.mapEmployeeOverride(record) : null;
  }

  public async replaceEmployeeOverride(
    technicianShopAffiliationId: number,
    input: ParsedEmployeePayrollSchedulePolicyBody,
    actorUserId: number
  ): Promise<EmployeePayrollScheduleOverridePayload> {
    const record = await this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM technician_shop_affiliations WHERE id = ${technicianShopAffiliationId} AND deleted_at IS NULL FOR UPDATE`
      );
      const latest = await transaction.technicianPayrollScheduleOverride.findFirst({
        where: { technicianShopAffiliationId },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: { version: true }
      });
      await transaction.technicianPayrollScheduleOverride.updateMany({
        where: { technicianShopAffiliationId, status: "active", deletedAt: null },
        data: {
          status: "archived",
          activeKey: null,
          effectiveTo: previousDate(input.effectiveFrom),
          updatedById: actorUserId
        }
      });
      return transaction.technicianPayrollScheduleOverride.create({
        data: {
          technicianShopAffiliationId,
          inheritShopPolicy: input.inheritShopPolicy,
          cadence: input.cadence,
          weeklySettlementWeekday: input.weeklySettlementWeekday,
          monthlySettlementDay: input.monthlySettlementDay,
          holidayAdjustment: input.holidayAdjustment,
          timezone: input.timezone,
          effectiveFrom: dateAtUtcMidnight(input.effectiveFrom),
          effectiveTo: input.effectiveTo ? dateAtUtcMidnight(input.effectiveTo) : null,
          status: "active",
          version: (latest?.version ?? 0) + 1,
          activeKey: `affiliation:${technicianShopAffiliationId}`,
          createdById: actorUserId,
          updatedById: actorUserId
        }
      });
    });
    return this.mapEmployeeOverride(record);
  }

  public async listNonBusinessDateKeys(
    countryCode: string,
    from: string,
    to: string
  ): Promise<string[]> {
    const records = await this.client.businessCalendarDate.findMany({
      where: {
        countryCode,
        calendarDate: {
          gte: dateAtUtcMidnight(from),
          lte: dateAtUtcMidnight(to)
        },
        isBusinessDay: false,
        deletedAt: null
      },
      orderBy: { calendarDate: "asc" },
      select: { calendarDate: true }
    });
    return records.map((record) => toDateKey(record.calendarDate));
  }

  private mapShopPolicy(record: ShopPolicyRecord): ShopPayrollSchedulePolicyPayload {
    return {
      id: record.id,
      shopId: record.shopId,
      cadence: this.parseCadence(record.cadence),
      weeklySettlementWeekday: record.weeklySettlementWeekday,
      monthlySettlementDay: record.monthlySettlementDay,
      holidayAdjustment: this.parseHolidayAdjustment(record.holidayAdjustment),
      timezone: record.timezone,
      effectiveFrom: toDateKey(record.effectiveFrom),
      effectiveTo: record.effectiveTo ? toDateKey(record.effectiveTo) : null,
      status: record.status === "archived" ? "archived" : "active",
      version: record.version,
      createdById: record.createdById,
      updatedById: record.updatedById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private mapEmployeeOverride(
    record: EmployeeOverrideRecord
  ): EmployeePayrollScheduleOverridePayload {
    return {
      id: record.id,
      technicianShopAffiliationId: record.technicianShopAffiliationId,
      inheritShopPolicy: record.inheritShopPolicy,
      cadence: record.cadence ? this.parseCadence(record.cadence) : null,
      weeklySettlementWeekday: record.weeklySettlementWeekday,
      monthlySettlementDay: record.monthlySettlementDay,
      holidayAdjustment: record.holidayAdjustment
        ? this.parseHolidayAdjustment(record.holidayAdjustment)
        : null,
      timezone: record.timezone,
      effectiveFrom: toDateKey(record.effectiveFrom),
      effectiveTo: record.effectiveTo ? toDateKey(record.effectiveTo) : null,
      status: record.status === "archived" ? "archived" : "active",
      version: record.version,
      createdById: record.createdById,
      updatedById: record.updatedById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private parseCadence(value: string): PayrollCadence {
    if (value === "daily" || value === "weekly" || value === "monthly") return value;
    throw new Error("error.payroll_schedule.cadence_invalid");
  }

  private parseHolidayAdjustment(value: string): PayrollHolidayAdjustment {
    if (value === "previous_business_day" || value === "next_business_day") return value;
    throw new Error("error.payroll_schedule.holiday_adjustment_invalid");
  }
}
