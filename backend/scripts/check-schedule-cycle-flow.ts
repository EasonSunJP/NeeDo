import { AuditLogRepository } from "../src/repositories/audit-log.repository";
import { ScheduleCycleRepository } from "../src/repositories/schedule-cycle.repository";
import { prisma } from "../src/prisma/client";
import { AuditLogService } from "../src/services/audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import { ScheduleCycleService } from "../src/services/schedule-cycle.service";

const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "schedule-cycle-local-check" };

async function main() {
  const fixture = await prisma.shop.findFirst({
    where: {
      deletedAt: null,
      status: "published",
      ownerUserId: { not: null },
      pricingMode: "MERCHANT",
      technicians: { some: { deletedAt: null, status: "published" } },
      services: { some: { deletedAt: null, status: "published" } }
    },
    select: {
      id: true,
      ownerUserId: true,
      technicians: { where: { deletedAt: null, status: "published" }, select: { id: true }, take: 1 }
    }
  });
  const technicianProfileId = fixture?.technicians[0]?.id;
  if (!fixture?.ownerUserId || !technicianProfileId) throw new Error("No eligible local shop fixture");

  const merchant: AuthenticatedAccessContext = {
    userId: fixture.ownerUserId,
    email: "local-check@needo.test",
    accessTokenJti: "local-check-merchant",
    accessTokenExpiresAt: Date.now() + 60_000,
    currentIdentityType: "merchant_owner",
    currentIdentityScopeType: "shop",
    currentIdentityScopeId: fixture.id,
    roles: ["merchant_owner"],
    permissions: ["schedule:slots:list", "schedule:slots:write"]
  };
  const technician: AuthenticatedAccessContext = {
    userId: fixture.ownerUserId,
    email: "local-check@needo.test",
    accessTokenJti: "local-check-technician",
    accessTokenExpiresAt: Date.now() + 60_000,
    currentIdentityType: "technician",
    currentIdentityScopeType: "technician_profile",
    currentIdentityScopeId: technicianProfileId,
    roles: ["technician"],
    permissions: ["schedule:slots:list", "schedule:slots:write"]
  };
  const repository = new ScheduleCycleRepository();
  const service = new ScheduleCycleService(repository, new AuditLogService(new AuditLogRepository()));
  let internalCycleId: number | null = null;

  try {
    const created = await service.createDraft(merchant, context, [technicianProfileId]);
    internalCycleId = (await prisma.scheduleCycle.findUniqueOrThrow({ where: { publicId: created.id }, select: { id: true } })).id;
    const date = "2036-01-07";
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(false) as boolean[]);
    matrix[weekday]![10] = true;
    matrix[weekday]![11] = true;
    const saved = await service.updateDraft(merchant, context, created.id, {
      name: "LOCAL schedule cycle authority check",
      mode: "TECH_SELF_FINAL",
      currentStep: 2,
      templateType: "WEEK",
      periodStart: date,
      periodEnd: date,
      targetTechnicianIds: [technicianProfileId],
      feedbackDeadline: null,
      templateMatrix: matrix,
      regularHolidayWeekdays: [],
      ruleSet: {
        minStaff: 1, targetStaff: 1, maxStaff: 1,
        maxDailyHours: 8, maxWeeklyHours: 40, minRestDaysPerWeek: 1,
        weekdayAdjustments: {}, holidayAdjustments: {}
      },
      version: created.version
    });
    const launched = await service.launch(merchant, context, saved.id, `${saved.id}:launch`);
    const technicianView = await service.listForTechnician(technician, context, { page: 1, pageSize: 20 });
    if (!technicianView.list.some((cycle) => cycle.id === launched.id)) throw new Error("Technician cannot read launched cycle");
    await service.submitTechnicianFeedback(technician, context, launched.id, {
      version: launched.version,
      entries: [10, 11].map((hour) => ({ date, hour, status: "AVAILABLE" as const, note: "" }))
    });
    const firstSession = await service.listForMerchant(merchant, context, { page: 1, pageSize: 20 });
    const secondSession = await service.listForMerchant({ ...merchant, accessTokenJti: "local-check-merchant-2" }, context, { page: 1, pageSize: 20 });
    if (!firstSession.list.some((cycle) => cycle.id === launched.id) || !secondSession.list.some((cycle) => cycle.id === launched.id)) {
      throw new Error("Independent merchant sessions did not read the same cycle");
    }
    const confirmed = await service.autoConfirm(merchant, context, launched.id, `${launched.id}:auto-confirm`);
    if (confirmed.summary.confirmedCount !== 2 || confirmed.summary.shortageCount !== 0) throw new Error("Unexpected auto-confirm result");
    await service.finalize(merchant, context, launched.id, `${launched.id}:finalize`);
    const projection = await prisma.scheduleCycleFinalShift.findMany({
      where: { cycleId: internalCycleId, status: "CONFIRMED", deletedAt: null },
      select: { availabilityId: true }
    });
    const availabilityIds = [...new Set(projection.map((shift) => shift.availabilityId).filter((id): id is number => id !== null))];
    const slots = await prisma.scheduleSlot.count({ where: { availabilityId: { in: availabilityIds }, deletedAt: null, status: "AVAILABLE" } });
    if (projection.length !== 2 || availabilityIds.length !== 1 || slots < 1) throw new Error("Final user-bookable projection was not created");
    const operationsView = await service.listForOperations({ shopId: fixture.id, page: 1, pageSize: 20 });
    if (!operationsView.list.some((cycle) => cycle.id === launched.id)) throw new Error("Operations reconciliation cannot read cycle");
    console.log(JSON.stringify({
      crossSession: true,
      technicianFeedbackRows: 2,
      confirmedShifts: projection.length,
      bookableSlots: slots,
      operationsVisible: true
    }));
  } finally {
    if (internalCycleId !== null) {
      const shifts = await prisma.scheduleCycleFinalShift.findMany({ where: { cycleId: internalCycleId }, select: { availabilityId: true } });
      const availabilityIds = [...new Set(shifts.map((shift) => shift.availabilityId).filter((id): id is number => id !== null))];
      if (availabilityIds.length > 0) await prisma.scheduleSlot.deleteMany({ where: { availabilityId: { in: availabilityIds } } });
      await prisma.scheduleCycleFinalShift.deleteMany({ where: { cycleId: internalCycleId } });
      if (availabilityIds.length > 0) await prisma.availability.deleteMany({ where: { id: { in: availabilityIds } } });
      await prisma.scheduleCycleFeedback.deleteMany({ where: { cycleId: internalCycleId } });
      await prisma.scheduleCycleTarget.deleteMany({ where: { cycleId: internalCycleId } });
      await prisma.auditLog.deleteMany({ where: { targetType: "schedule_cycle", targetId: internalCycleId } });
      await prisma.scheduleCycle.delete({ where: { id: internalCycleId } });
    }
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
