import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";
import type { ScheduleCyclePage, ScheduleCyclePayload } from "../types/schedule-cycle.types";
import type { ParsedScheduleCycleUpdateBody } from "../validators/schedule-cycle.validator";

const cycleInclude = {
  targets: { where: { deletedAt: null }, orderBy: { technicianProfileId: "asc" } },
  feedbacks: {
    where: { deletedAt: null },
    orderBy: [{ date: "asc" }, { hour: "asc" }, { technicianProfileId: "asc" }]
  },
  finalShifts: {
    where: { deletedAt: null },
    orderBy: [{ date: "asc" }, { hour: "asc" }, { technicianProfileId: "asc" }]
  }
} satisfies Prisma.ScheduleCycleInclude;

type CycleRecord = Prisma.ScheduleCycleGetPayload<{ include: typeof cycleInclude }>;

export interface ScheduleCycleRepositoryPort {
  listForShop(shopId: number, input: { page: number; pageSize: number }): Promise<ScheduleCyclePage>;
  listForTechnician(technicianProfileId: number, input: { page: number; pageSize: number }): Promise<ScheduleCyclePage>;
  createDraft(shopId: number, actorUserId: number, targetTechnicianIds: number[], audit: AuditLogCreateInput): Promise<ScheduleCyclePayload>;
  updateDraft(shopId: number, cycleId: string, input: ParsedScheduleCycleUpdateBody, audit: AuditLogCreateInput): Promise<ScheduleCyclePayload>;
  launch(shopId: number, cycleId: string, idempotencyKey: string, actorUserId: number, audit: AuditLogCreateInput): Promise<ScheduleCyclePayload>;
  closeFeedback(shopId: number, cycleId: string, actorUserId: number, audit: AuditLogCreateInput): Promise<ScheduleCyclePayload>;
  findForShop(shopId: number, cycleId: string): Promise<ScheduleCyclePayload | null>;
  replaceAutoConfirmedShifts(shopId: number, cycleId: string, input: {
    actorUserId: number;
    idempotencyKey: string;
    shifts: Array<{ technicianProfileId: number; date: string; hour: number; status: "CONFIRMED" | "WAITLISTED"; ruleSnapshot: Record<string, unknown> }>;
    summary: { confirmedCount: number; waitlistedCount: number; shortageCount: number; overflowCount: number };
  }, audit: AuditLogCreateInput): Promise<{ cycle: ScheduleCyclePayload; summary: typeof input.summary }>;
  finalize(shopId: number, cycleId: string, idempotencyKey: string, actorUserId: number, audit: AuditLogCreateInput): Promise<ScheduleCyclePayload>;
  cancel(shopId: number, cycleId: string, actorUserId: number, audit: AuditLogCreateInput): Promise<ScheduleCyclePayload>;
  submitFeedback(technicianProfileId: number, cycleId: string, input: {
    version: number;
    entries: Array<{ date: string; hour: number; status: "AVAILABLE" | "UNAVAILABLE" | "UPDATED"; note: string }>;
  }, audit: AuditLogCreateInput): Promise<ScheduleCyclePayload>;
}

const dateKey = (value: Date): string => value.toISOString().slice(0, 10);
const iso = (value: Date | null): string | null => value?.toISOString() ?? null;
const dateValue = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const tokyoDateKey = (): string => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const oneMonthAfter = (value: string): string => {
  const date = dateValue(value);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return dateKey(date);
};

const defaultRuleSet = {
  minStaff: 1,
  targetStaff: 1,
  maxStaff: 1,
  maxDailyHours: 8,
  maxWeeklyHours: 40,
  minRestDaysPerWeek: 1,
  preBufferMinutes: 0,
  postBufferMinutes: 0,
  weekdayAdjustments: {},
  holidayAdjustments: {},
  overtimeBlockedWeekdays: [],
  tempStaffEnabled: false,
  tempStaffIds: [],
  priorityRules: {
    selectedTechnicianIds: [],
    selectedLanguages: [],
    requireForeignerSupport: false,
    confirmedHoursPriority: "less_first",
    preferEarlyResponder: true,
    useIdFallback: true
  },
  notificationRules: {
    overbookEnabled: false,
    overbookThreshold: 0,
    lowBookingEnabled: false,
    lowBookingThreshold: 0,
    discountEnabled: false,
    discountTemplate: ""
  }
};

const defaultTemplateMatrix = Array.from({ length: 7 }, (_, day) =>
  Array.from({ length: 24 }, (_, hour) => day > 0 && day < 6 && hour >= 10 && hour < 18)
);

const scheduleCycleTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 30_000
} as const;

export class ScheduleCycleRepository implements ScheduleCycleRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listForShop(
    shopId: number,
    input: { page: number; pageSize: number }
  ): Promise<ScheduleCyclePage> {
    const where = { shopId, deletedAt: null } satisfies Prisma.ScheduleCycleWhereInput;
    const [list, total] = await this.client.$transaction([
      this.client.scheduleCycle.findMany({
        where,
        include: cycleInclude,
        orderBy: [{ periodStart: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize
      }),
      this.client.scheduleCycle.count({ where })
    ]);
    return {
      list: list.map((record) => this.mapCycle(record)),
      total,
      page: input.page,
      page_size: input.pageSize
    };
  }

  public async listForTechnician(
    technicianProfileId: number,
    input: { page: number; pageSize: number }
  ): Promise<ScheduleCyclePage> {
    const where = {
      deletedAt: null,
      status: { notIn: ["DRAFT", "RULE_SETTING", "CANCELLED", "ARCHIVED"] },
      targets: { some: { technicianProfileId, deletedAt: null } }
    } satisfies Prisma.ScheduleCycleWhereInput;
    const [list, total] = await this.client.$transaction([
      this.client.scheduleCycle.findMany({
        where, include: cycleInclude,
        orderBy: [{ periodStart: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize, take: input.pageSize
      }),
      this.client.scheduleCycle.count({ where })
    ]);
    return { list: list.map((record) => this.mapCycle(record)), total, page: input.page, page_size: input.pageSize };
  }

  public async findForShop(shopId: number, cycleId: string): Promise<ScheduleCyclePayload | null> {
    const record = await this.client.scheduleCycle.findFirst({
      where: { publicId: cycleId, shopId, deletedAt: null },
      include: cycleInclude
    });
    return record ? this.mapCycle(record) : null;
  }

  public async createDraft(
    shopId: number,
    actorUserId: number,
    targetTechnicianIds: number[],
    audit: AuditLogCreateInput
  ): Promise<ScheduleCyclePayload> {
    const record = await this.client.$transaction(async (transaction) => {
      await this.assertTargets(transaction, shopId, targetTechnicianIds);
      const today = tokyoDateKey();
      const created = await transaction.scheduleCycle.create({
        data: {
          shopId,
          name: "新的待执行周期",
          mode: "TECH_SELF_FINAL",
          status: "DRAFT",
          currentStep: 1,
          templateType: "WEEK",
          periodStart: dateValue(today),
          periodEnd: dateValue(oneMonthAfter(today)),
          templateMatrix: defaultTemplateMatrix,
          regularHolidayWeekdays: [],
          ruleSet: defaultRuleSet,
          createdById: actorUserId,
          updatedById: actorUserId,
          targets: { create: targetTechnicianIds.map((technicianProfileId) => ({ technicianProfileId })) }
        }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...audit, targetId: created.id }) });
      return transaction.scheduleCycle.findUniqueOrThrow({ where: { id: created.id }, include: cycleInclude });
    }, scheduleCycleTransactionOptions);
    return this.mapCycle(record);
  }

  public async updateDraft(
    shopId: number,
    cycleId: string,
    input: ParsedScheduleCycleUpdateBody,
    audit: AuditLogCreateInput
  ): Promise<ScheduleCyclePayload> {
    const record = await this.client.$transaction(async (transaction) => {
      const current = await transaction.scheduleCycle.findFirst({
        where: { publicId: cycleId, shopId, deletedAt: null }
      });
      if (!current) throw this.notFound();
      if (!["DRAFT", "RULE_SETTING"].includes(current.status)) throw this.conflict("error.schedule_cycle.not_editable");
      if (current.version !== input.version) throw this.conflict("error.schedule_cycle.version_conflict");
      await this.assertTargets(transaction, shopId, input.targetTechnicianIds);
      const now = new Date();
      await transaction.scheduleCycleTarget.updateMany({
        where: { cycleId: current.id, deletedAt: null },
        data: { deletedAt: now }
      });
      const targetTechnicianIds = [...new Set(input.targetTechnicianIds)];
      await transaction.scheduleCycleTarget.updateMany({
        where: { cycleId: current.id, technicianProfileId: { in: targetTechnicianIds } },
        data: { deletedAt: null }
      });
      await transaction.scheduleCycleTarget.createMany({
        data: targetTechnicianIds.map((technicianProfileId) => ({
          cycleId: current.id,
          technicianProfileId
        })),
        skipDuplicates: true
      });
      await transaction.scheduleCycle.update({
        where: { id: current.id },
        data: {
          name: input.name,
          mode: input.mode,
          status: input.currentStep >= 2 ? "RULE_SETTING" : "DRAFT",
          currentStep: input.currentStep,
          templateType: input.templateType,
          periodStart: dateValue(input.periodStart),
          periodEnd: dateValue(input.periodEnd),
          feedbackDeadline: input.feedbackDeadline ? new Date(input.feedbackDeadline) : null,
          templateMatrix: input.templateMatrix,
          regularHolidayWeekdays: input.regularHolidayWeekdays,
          ruleSet: input.ruleSet as Prisma.InputJsonValue,
          updatedById: audit.actorId ?? current.updatedById,
          version: { increment: 1 }
        }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...audit, targetId: current.id }) });
      return transaction.scheduleCycle.findUniqueOrThrow({ where: { id: current.id }, include: cycleInclude });
    }, scheduleCycleTransactionOptions);
    return this.mapCycle(record);
  }

  public async launch(
    shopId: number,
    cycleId: string,
    idempotencyKey: string,
    actorUserId: number,
    audit: AuditLogCreateInput
  ): Promise<ScheduleCyclePayload> {
    const record = await this.client.$transaction(async (transaction) => {
      const current = await transaction.scheduleCycle.findFirst({
        where: { publicId: cycleId, shopId, deletedAt: null }, include: cycleInclude
      });
      if (!current) throw this.notFound();
      if (current.launchIdempotencyKey === idempotencyKey) return current;
      if (current.launchIdempotencyKey) throw this.conflict("error.schedule_cycle.idempotency_conflict");
      if (!["DRAFT", "RULE_SETTING"].includes(current.status)) throw this.conflict("error.schedule_cycle.launch_invalid_state");
      if (current.targets.length === 0) throw this.conflict("error.schedule_cycle.targets_required");
      const overlapping = await transaction.scheduleCycle.findFirst({
        where: {
          id: { not: current.id }, shopId, deletedAt: null,
          status: { notIn: ["CANCELLED", "COMPLETED", "ARCHIVED"] },
          periodStart: { lte: current.periodEnd }, periodEnd: { gte: current.periodStart }
        }, select: { id: true }
      });
      if (overlapping) throw this.conflict("error.schedule_cycle.period_overlap");
      await transaction.scheduleCycle.update({
        where: { id: current.id },
        data: {
          status: current.mode === "STORE_ASSIGN_FINAL" ? "COLLECTING_FEEDBACK" : "FINAL_CONFIRMING",
          currentStep: 3,
          launchedAt: new Date(),
          launchIdempotencyKey: idempotencyKey,
          updatedById: actorUserId,
          version: { increment: 1 }
        }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...audit, targetId: current.id }) });
      return transaction.scheduleCycle.findUniqueOrThrow({ where: { id: current.id }, include: cycleInclude });
    }, scheduleCycleTransactionOptions);
    return this.mapCycle(record);
  }

  public async replaceAutoConfirmedShifts(
    shopId: number,
    cycleId: string,
    input: {
      actorUserId: number;
      idempotencyKey: string;
      shifts: Array<{ technicianProfileId: number; date: string; hour: number; status: "CONFIRMED" | "WAITLISTED"; ruleSnapshot: Record<string, unknown> }>;
      summary: { confirmedCount: number; waitlistedCount: number; shortageCount: number; overflowCount: number };
    },
    audit: AuditLogCreateInput
  ): Promise<{ cycle: ScheduleCyclePayload; summary: typeof input.summary }> {
    const record = await this.client.$transaction(async (transaction) => {
      const current = await transaction.scheduleCycle.findFirst({ where: { publicId: cycleId, shopId, deletedAt: null }, include: cycleInclude });
      if (!current) throw this.notFound();
      if (current.autoConfirmIdempotencyKey === input.idempotencyKey) return current;
      if (current.autoConfirmIdempotencyKey) throw this.conflict("error.schedule_cycle.idempotency_conflict");
      const now = new Date();
      await transaction.scheduleCycleFinalShift.updateMany({ where: { cycleId: current.id, deletedAt: null }, data: { deletedAt: now } });
      for (const shift of input.shifts) {
        await transaction.scheduleCycleFinalShift.upsert({
          where: { cycleId_technicianProfileId_date_hour: {
            cycleId: current.id,
            technicianProfileId: shift.technicianProfileId,
            date: dateValue(shift.date),
            hour: shift.hour
          } },
          create: {
            cycleId: current.id,
            technicianProfileId: shift.technicianProfileId,
            date: dateValue(shift.date),
            hour: shift.hour,
            status: shift.status,
            source: "AUTO",
            ruleSnapshot: shift.ruleSnapshot as Prisma.InputJsonValue,
            confirmedAt: now,
            confirmedById: input.actorUserId
          },
          update: {
            deletedAt: null,
            status: shift.status,
            source: "AUTO",
            ruleSnapshot: shift.ruleSnapshot as Prisma.InputJsonValue,
            confirmedAt: now,
            confirmedById: input.actorUserId,
            availabilityId: null
          }
        });
      }
      await transaction.scheduleCycle.update({
        where: { id: current.id },
        data: {
          status: "FINAL_CONFIRMING",
          currentStep: current.mode === "STORE_ASSIGN_FINAL" ? 4 : 3,
          lastAutoConfirmAt: now,
          autoConfirmSummary: input.summary,
          autoConfirmIdempotencyKey: input.idempotencyKey,
          updatedById: input.actorUserId,
          version: { increment: 1 }
        }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...audit, targetId: current.id }) });
      return transaction.scheduleCycle.findUniqueOrThrow({ where: { id: current.id }, include: cycleInclude });
    }, scheduleCycleTransactionOptions);
    return { cycle: this.mapCycle(record), summary: input.summary };
  }

  public async closeFeedback(
    shopId: number,
    cycleId: string,
    actorUserId: number,
    audit: AuditLogCreateInput
  ): Promise<ScheduleCyclePayload> {
    const record = await this.client.$transaction(async (transaction) => {
      const current = await transaction.scheduleCycle.findFirst({
        where: { publicId: cycleId, shopId, deletedAt: null }, include: cycleInclude
      });
      if (!current) throw this.notFound();
      if (current.status === "FEEDBACK_CLOSED") return current;
      if (current.status !== "COLLECTING_FEEDBACK") {
        throw this.conflict("error.schedule_cycle.feedback_close_invalid_state");
      }
      await transaction.scheduleCycle.update({
        where: { id: current.id },
        data: {
          status: "FEEDBACK_CLOSED",
          currentStep: 4,
          updatedById: actorUserId,
          version: { increment: 1 }
        }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...audit, targetId: current.id }) });
      return transaction.scheduleCycle.findUniqueOrThrow({ where: { id: current.id }, include: cycleInclude });
    }, scheduleCycleTransactionOptions);
    return this.mapCycle(record);
  }

  public async finalize(
    shopId: number,
    cycleId: string,
    idempotencyKey: string,
    actorUserId: number,
    audit: AuditLogCreateInput
  ): Promise<ScheduleCyclePayload> {
    const record = await this.client.$transaction(async (transaction) => {
      const current = await transaction.scheduleCycle.findFirst({
        where: { publicId: cycleId, shopId, deletedAt: null }, include: cycleInclude
      });
      if (!current) throw this.notFound();
      if (current.finalizeIdempotencyKey === idempotencyKey) return current;
      if (current.finalizeIdempotencyKey) throw this.conflict("error.schedule_cycle.idempotency_conflict");
      if (current.status !== "FINAL_CONFIRMING") throw this.conflict("error.schedule_cycle.finalize_invalid_state");
      const confirmed = current.finalShifts.filter((shift) => shift.status === "CONFIRMED" && !shift.deletedAt);
      if (confirmed.length === 0) throw this.conflict("error.schedule_cycle.no_confirmed_shifts");

      const shop = await transaction.shop.findFirst({
        where: { id: shopId, deletedAt: null },
        select: { pricingMode: true }
      });
      if (!shop) throw this.notFound();
      const merchantServices = shop.pricingMode === "MERCHANT"
        ? await transaction.service.findMany({
            where: { shopId, status: "published", deletedAt: null },
            select: { id: true, durationMinutes: true }
          })
        : [];
      const technicianServices = shop.pricingMode === "TECHNICIAN"
        ? await transaction.technicianService.findMany({
            where: {
              technicianId: { in: [...new Set(confirmed.map((shift) => shift.technicianProfileId))] },
              shopId,
              isActive: true,
              isBookable: true,
              reviewStatus: "APPROVED",
              deletedAt: null
            },
            select: { id: true, technicianId: true, durationMinutes: true }
          })
        : [];
      if (merchantServices.length === 0 && technicianServices.length === 0) {
        throw this.conflict("error.schedule_cycle.no_bookable_services");
      }

      const grouped = new Map<string, typeof confirmed>();
      confirmed.forEach((shift) => {
        const key = `${shift.technicianProfileId}:${dateKey(shift.date)}`;
        grouped.set(key, [...(grouped.get(key) ?? []), shift]);
      });
      for (const shifts of grouped.values()) {
        shifts.sort((left, right) => left.hour - right.hour);
        const segments: Array<typeof shifts> = [];
        shifts.forEach((shift) => {
          const last = segments.at(-1);
          if (last && (last.at(-1)?.hour ?? -2) + 1 === shift.hour) last.push(shift);
          else segments.push([shift]);
        });
        for (const segment of segments) {
          const first = segment[0]!;
          const last = segment.at(-1)!;
          const date = dateKey(first.date);
          const startsAt = this.tokyoHour(date, first.hour);
          const endsAt = this.tokyoHour(date, last.hour + 1);
          const conflict = await transaction.scheduleSlot.findFirst({
            where: {
              technicianProfileId: first.technicianProfileId,
              deletedAt: null,
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
              status: { in: ["AVAILABLE", "BOOKED"] }
            },
            select: { id: true }
          });
          if (conflict) throw this.conflict("error.schedule.conflict");
          const availability = await transaction.availability.create({
            data: {
              shopId,
              technicianProfileId: first.technicianProfileId,
              sourceType: current.mode === "TECH_SELF_FINAL" ? "TECHNICIAN" : "SHOP",
              visibility: current.mode === "TECH_SELF_FINAL" ? "TECHNICIAN_SHOPS" : "SHOP_ONLY",
              startsAt,
              endsAt,
              capacity: 1,
              isActive: true
            }
          });
          await transaction.scheduleCycleFinalShift.updateMany({
            where: { id: { in: segment.map((shift) => shift.id) } },
            data: { availabilityId: availability.id }
          });
          const offerings = shop.pricingMode === "MERCHANT"
            ? merchantServices.map((service) => ({ serviceId: service.id, technicianServiceId: null, durationMinutes: service.durationMinutes }))
            : technicianServices
                .filter((service) => service.technicianId === first.technicianProfileId)
                .map((service) => ({ serviceId: null, technicianServiceId: service.id, durationMinutes: service.durationMinutes }));
          for (let startHour = first.hour; startHour <= last.hour; startHour += 1) {
            for (const offering of offerings) {
              const slotStartsAt = this.tokyoHour(date, startHour);
              const slotEndsAt = new Date(slotStartsAt.getTime() + offering.durationMinutes * 60_000);
              if (slotEndsAt > endsAt) continue;
              await transaction.scheduleSlot.create({
                data: {
                  availabilityId: availability.id,
                  serviceId: offering.serviceId,
                  technicianServiceId: offering.technicianServiceId,
                  shopId,
                  technicianProfileId: first.technicianProfileId,
                  startsAt: slotStartsAt,
                  endsAt: slotEndsAt,
                  capacity: 1,
                  status: "AVAILABLE"
                }
              });
            }
          }
        }
      }
      const now = new Date();
      const today = tokyoDateKey();
      await transaction.scheduleCycle.update({
        where: { id: current.id },
        data: {
          status: dateKey(current.periodStart) <= today && dateKey(current.periodEnd) >= today ? "ACTIVE" : "CONFIRMED",
          finalizedAt: now,
          activeAt: dateKey(current.periodStart) <= today && dateKey(current.periodEnd) >= today ? now : current.activeAt,
          finalizeIdempotencyKey: idempotencyKey,
          updatedById: actorUserId,
          version: { increment: 1 }
        }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...audit, targetId: current.id }) });
      return transaction.scheduleCycle.findUniqueOrThrow({ where: { id: current.id }, include: cycleInclude });
    }, scheduleCycleTransactionOptions);
    return this.mapCycle(record);
  }

  public async cancel(
    shopId: number,
    cycleId: string,
    actorUserId: number,
    audit: AuditLogCreateInput
  ): Promise<ScheduleCyclePayload> {
    const record = await this.client.$transaction(async (transaction) => {
      const current = await transaction.scheduleCycle.findFirst({
        where: { publicId: cycleId, shopId, deletedAt: null }, include: cycleInclude
      });
      if (!current) throw this.notFound();
      if (current.status === "CANCELLED") return current;
      if (["ACTIVE", "COMPLETED", "ARCHIVED"].includes(current.status)) {
        throw this.conflict("error.schedule_cycle.cancel_invalid_state");
      }
      await transaction.scheduleCycle.update({
        where: { id: current.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), updatedById: actorUserId, version: { increment: 1 } }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...audit, targetId: current.id }) });
      return transaction.scheduleCycle.findUniqueOrThrow({ where: { id: current.id }, include: cycleInclude });
    }, scheduleCycleTransactionOptions);
    return this.mapCycle(record);
  }

  public async submitFeedback(
    technicianProfileId: number,
    cycleId: string,
    input: {
      version: number;
      entries: Array<{ date: string; hour: number; status: "AVAILABLE" | "UNAVAILABLE" | "UPDATED"; note: string }>;
    },
    audit: AuditLogCreateInput
  ): Promise<ScheduleCyclePayload> {
    const record = await this.client.$transaction(async (transaction) => {
      const current = await transaction.scheduleCycle.findFirst({
        where: {
          publicId: cycleId,
          deletedAt: null,
          targets: { some: { technicianProfileId, deletedAt: null } }
        },
        include: cycleInclude
      });
      if (!current) throw this.notFound();
      if (!["FINAL_CONFIRMING", "COLLECTING_FEEDBACK"].includes(current.status)) {
        throw this.conflict("error.schedule_cycle.feedback_invalid_state");
      }
      const from = dateKey(current.periodStart);
      const to = dateKey(current.periodEnd);
      if (input.entries.some((entry) => entry.date < from || entry.date > to)) {
        throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.schedule_cycle.feedback_out_of_range", statusCode: 400 });
      }
      const now = new Date();
      await transaction.scheduleCycleFeedback.updateMany({
        where: { cycleId: current.id, technicianProfileId, deletedAt: null },
        data: { deletedAt: now }
      });
      for (const entry of input.entries) {
        await transaction.scheduleCycleFeedback.upsert({
          where: { cycleId_technicianProfileId_date_hour: {
            cycleId: current.id, technicianProfileId, date: dateValue(entry.date), hour: entry.hour
          } },
          create: {
            cycleId: current.id, technicianProfileId, date: dateValue(entry.date), hour: entry.hour,
            status: entry.status, note: entry.note, submittedAt: now
          },
          update: { deletedAt: null, status: entry.status, note: entry.note, submittedAt: now }
        });
      }
      await transaction.scheduleCycle.update({
        where: { id: current.id },
        data: { version: { increment: 1 } }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...audit, targetId: current.id }) });
      return transaction.scheduleCycle.findUniqueOrThrow({ where: { id: current.id }, include: cycleInclude });
    }, scheduleCycleTransactionOptions);
    return this.mapCycle(record);
  }

  private async assertTargets(
    transaction: Prisma.TransactionClient,
    shopId: number,
    technicianProfileIds: number[]
  ): Promise<void> {
    if (technicianProfileIds.length === 0) return;
    const uniqueIds = [...new Set(technicianProfileIds)];
    const count = await transaction.technicianProfile.count({
      where: {
        id: { in: uniqueIds },
        status: "published",
        deletedAt: null,
        OR: [
          { shopId },
          { technicianShopAffiliations: { some: {
            shopId,
            workStatus: "ACTIVE",
            activeKey: { not: null },
            deletedAt: null,
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
          } } }
        ]
      }
    });
    if (count !== uniqueIds.length) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.schedule_cycle.target_forbidden",
        statusCode: 403
      });
    }
  }

  private tokyoHour(date: string, hour: number): Date {
    const nextDate = new Date(`${date}T00:00:00+09:00`);
    nextDate.setTime(nextDate.getTime() + hour * 60 * 60_000);
    return nextDate;
  }

  private notFound(): AppError {
    return new AppError({ code: ERROR_CODES.NOT_FOUND, message: "error.schedule_cycle.not_found", statusCode: 404 });
  }

  private conflict(message: string): AppError {
    return new AppError({ code: ERROR_CODES.SCHEDULE_CONFLICT, message, statusCode: 409 });
  }

  private mapCycle(record: CycleRecord): ScheduleCyclePayload {
    return {
      id: record.publicId,
      shopId: record.shopId,
      name: record.name,
      creationMethod: record.creationMethod,
      mode: record.mode,
      status: record.status,
      currentStep: record.currentStep,
      templateType: record.templateType,
      periodStart: dateKey(record.periodStart),
      periodEnd: dateKey(record.periodEnd),
      targetTechnicianIds: record.targets.map((target) => target.technicianProfileId),
      feedbackDeadline: iso(record.feedbackDeadline),
      templateMatrix: record.templateMatrix as boolean[][],
      regularHolidayWeekdays: record.regularHolidayWeekdays as number[],
      ruleSet: record.ruleSet as Record<string, unknown>,
      launchedAt: iso(record.launchedAt),
      finalizedAt: iso(record.finalizedAt),
      activeAt: iso(record.activeAt),
      cancelledAt: iso(record.cancelledAt),
      lastAutoConfirmAt: iso(record.lastAutoConfirmAt),
      autoConfirmSummary: record.autoConfirmSummary as ScheduleCyclePayload["autoConfirmSummary"],
      feedbackRows: record.feedbacks.map((feedback) => ({
        technicianProfileId: feedback.technicianProfileId,
        date: dateKey(feedback.date),
        hour: feedback.hour,
        status: feedback.status,
        note: feedback.note,
        submittedAt: feedback.submittedAt.toISOString(),
        updatedAt: feedback.updatedAt.toISOString()
      })),
      finalShifts: record.finalShifts.map((shift) => ({
        id: shift.id,
        technicianProfileId: shift.technicianProfileId,
        date: dateKey(shift.date),
        hour: shift.hour,
        status: shift.status,
        source: shift.source,
        confirmedAt: shift.confirmedAt.toISOString()
      })),
      version: record.version,
      updatedAt: record.updatedAt.toISOString()
    };
  }
}
