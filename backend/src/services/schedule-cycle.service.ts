import type { ScheduleCycleRepositoryPort } from "../repositories/schedule-cycle.repository";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";
import { ERROR_CODES } from "../constants/error-codes";
import type { ScheduleCyclePayload } from "../types/schedule-cycle.types";
import { AppError } from "../utils/app-error";
import type { ParsedScheduleCycleUpdateBody } from "../validators/schedule-cycle.validator";
import type { ParsedScheduleCycleFeedbackBody } from "../validators/schedule-cycle.validator";

type AuditInputFactory = Pick<AuditLogService, "createInput">;

const enumerateDates = (from: string, to: string): string[] => {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const weekKey = (dateKey: string): string => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
};

export class ScheduleCycleService {
  public constructor(
    private readonly repository: ScheduleCycleRepositoryPort,
    private readonly audit: AuditInputFactory
  ) {}

  public async listForMerchant(
    actor: AuthenticatedAccessContext,
    _context: AuthRequestContext,
    input: { page: number; pageSize: number }
  ) {
    return this.repository.listForShop(requireMerchantShopId(actor), input);
  }

  public async listForTechnician(
    actor: AuthenticatedAccessContext,
    _context: AuthRequestContext,
    input: { page: number; pageSize: number }
  ) {
    return this.repository.listForTechnician(this.requireTechnicianProfileId(actor), input);
  }

  public async listForOperations(input: { shopId: number; page: number; pageSize: number }) {
    return this.repository.listForShop(input.shopId, { page: input.page, pageSize: input.pageSize });
  }

  public async submitTechnicianFeedback(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    cycleId: string,
    input: ParsedScheduleCycleFeedbackBody
  ) {
    const technicianProfileId = this.requireTechnicianProfileId(actor);
    return this.repository.submitFeedback(technicianProfileId, cycleId, input, this.audit.createInput({
      actor,
      action: "schedule_cycle.feedback.submit",
      targetType: "schedule_cycle",
      context,
      metadata: { technicianProfileId, version: input.version, entryCount: input.entries.length }
    }));
  }

  public async createDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    targetTechnicianIds: number[]
  ) {
    const shopId = requireMerchantShopId(actor);
    return this.repository.createDraft(
      shopId,
      actor.userId,
      [...new Set(targetTechnicianIds)],
      this.audit.createInput({
        actor,
        action: "schedule_cycle.create_draft",
        targetType: "schedule_cycle",
        context,
        metadata: { shopId, targetTechnicianIds }
      })
    );
  }

  public async updateDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    cycleId: string,
    input: ParsedScheduleCycleUpdateBody
  ) {
    const shopId = requireMerchantShopId(actor);
    return this.repository.updateDraft(shopId, cycleId, input, this.audit.createInput({
      actor,
      action: "schedule_cycle.update_draft",
      targetType: "schedule_cycle",
      context,
      metadata: { shopId, version: input.version }
    }));
  }

  public async launch(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    cycleId: string,
    idempotencyKey: string
  ) {
    const shopId = requireMerchantShopId(actor);
    return this.repository.launch(shopId, cycleId, idempotencyKey, actor.userId, this.audit.createInput({
      actor,
      action: "schedule_cycle.launch",
      targetType: "schedule_cycle",
      context,
      metadata: { shopId, idempotencyKey }
    }));
  }

  public async autoConfirm(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    cycleId: string,
    idempotencyKey: string
  ) {
    const shopId = requireMerchantShopId(actor);
    const cycle = await this.repository.findForShop(shopId, cycleId);
    if (!cycle) throw this.notFound();
    if (!["FINAL_CONFIRMING", "FEEDBACK_CLOSED", "COLLECTING_FEEDBACK"].includes(cycle.status)) {
      throw this.conflict("error.schedule_cycle.auto_confirm_invalid_state");
    }

    const plan = this.buildAutoConfirmPlan(cycle);
    return this.repository.replaceAutoConfirmedShifts(shopId, cycleId, {
      actorUserId: actor.userId,
      idempotencyKey,
      shifts: plan.shifts,
      summary: plan.summary
    }, this.audit.createInput({
      actor,
      action: "schedule_cycle.auto_confirm",
      targetType: "schedule_cycle",
      context,
      metadata: { shopId, idempotencyKey, summary: plan.summary }
    }));
  }

  public async closeFeedback(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    cycleId: string
  ) {
    const shopId = requireMerchantShopId(actor);
    return this.repository.closeFeedback(shopId, cycleId, actor.userId, this.audit.createInput({
      actor,
      action: "schedule_cycle.feedback.close",
      targetType: "schedule_cycle",
      context,
      metadata: { shopId }
    }));
  }

  public async finalize(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    cycleId: string,
    idempotencyKey: string
  ) {
    const shopId = requireMerchantShopId(actor);
    return this.repository.finalize(shopId, cycleId, idempotencyKey, actor.userId, this.audit.createInput({
      actor,
      action: "schedule_cycle.finalize",
      targetType: "schedule_cycle",
      context,
      metadata: { shopId, idempotencyKey }
    }));
  }

  public async cancel(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    cycleId: string
  ) {
    const shopId = requireMerchantShopId(actor);
    return this.repository.cancel(shopId, cycleId, actor.userId, this.audit.createInput({
      actor,
      action: "schedule_cycle.cancel",
      targetType: "schedule_cycle",
      context,
      metadata: { shopId }
    }));
  }

  private buildAutoConfirmPlan(cycle: ScheduleCyclePayload) {
    const rule = cycle.ruleSet as Record<string, unknown>;
    const targetCount = Number(rule.targetStaff ?? 1);
    const maxCount = Number(rule.maxStaff ?? targetCount);
    const maxDailyHours = Number(rule.maxDailyHours ?? 8);
    const maxWeeklyHours = Number(rule.maxWeeklyHours ?? 40);
    const weekdayAdjustments = (rule.weekdayAdjustments ?? {}) as Record<string, number>;
    const holidayAdjustments = (rule.holidayAdjustments ?? {}) as Record<string, number>;
    const feedback = new Map(cycle.feedbackRows.map((entry) => [
      `${entry.technicianProfileId}:${entry.date}:${entry.hour}`,
      entry
    ]));
    const submittedAt = new Map<number, number>();
    cycle.feedbackRows.forEach((entry) => {
      const timestamp = new Date(entry.submittedAt).getTime();
      submittedAt.set(entry.technicianProfileId, Math.min(submittedAt.get(entry.technicianProfileId) ?? Number.POSITIVE_INFINITY, timestamp));
    });
    const confirmedByTechnician = new Map<number, number>();
    const dailyHours = new Map<string, number>();
    const weeklyHours = new Map<string, number>();
    const shifts: Array<{ technicianProfileId: number; date: string; hour: number; status: "CONFIRMED" | "WAITLISTED"; ruleSnapshot: Record<string, unknown> }> = [];
    let confirmedCount = 0;
    let waitlistedCount = 0;
    let shortageCount = 0;
    let overflowCount = 0;

    enumerateDates(cycle.periodStart, cycle.periodEnd).forEach((date, dateIndex) => {
      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      const row = cycle.templateType === "DAY" ? 0 : cycle.templateType === "WEEK" ? weekday : dateIndex;
      for (let hour = 0; hour < 24; hour += 1) {
        if (!cycle.templateMatrix[row]?.[hour] || cycle.regularHolidayWeekdays.includes(weekday)) continue;
        const adjustment = Number(weekdayAdjustments[String(weekday)] ?? 0) + Number(holidayAdjustments[date] ?? 0);
        const slotTarget = Math.max(0, targetCount + adjustment);
        const slotMax = Math.max(slotTarget, maxCount + adjustment);
        if (slotMax === 0) continue;
        const candidates = cycle.targetTechnicianIds.filter((technicianId) => {
          if (cycle.mode === "STORE_ASSIGN_FINAL") return true;
          const entry = feedback.get(`${technicianId}:${date}:${hour}`);
          return entry?.status === "AVAILABLE" || entry?.status === "UPDATED";
        }).filter((technicianId) => {
          const day = dailyHours.get(`${technicianId}:${date}`) ?? 0;
          const week = weeklyHours.get(`${technicianId}:${weekKey(date)}`) ?? 0;
          return day < maxDailyHours && week < maxWeeklyHours;
        }).sort((left, right) =>
          (confirmedByTechnician.get(left) ?? 0) - (confirmedByTechnician.get(right) ?? 0) ||
          (submittedAt.get(left) ?? Number.POSITIVE_INFINITY) - (submittedAt.get(right) ?? Number.POSITIVE_INFINITY) ||
          left - right
        );
        if (candidates.length < slotTarget) shortageCount += 1;
        if (candidates.length > slotMax) overflowCount += 1;
        candidates.forEach((technicianProfileId, index) => {
          const status = index < slotMax ? "CONFIRMED" as const : "WAITLISTED" as const;
          shifts.push({ technicianProfileId, date, hour, status, ruleSnapshot: { slotTarget, slotMax } });
          if (status === "CONFIRMED") {
            confirmedCount += 1;
            confirmedByTechnician.set(technicianProfileId, (confirmedByTechnician.get(technicianProfileId) ?? 0) + 1);
            dailyHours.set(`${technicianProfileId}:${date}`, (dailyHours.get(`${technicianProfileId}:${date}`) ?? 0) + 1);
            weeklyHours.set(`${technicianProfileId}:${weekKey(date)}`, (weeklyHours.get(`${technicianProfileId}:${weekKey(date)}`) ?? 0) + 1);
          } else {
            waitlistedCount += 1;
          }
        });
      }
    });
    return { shifts, summary: { confirmedCount, waitlistedCount, shortageCount, overflowCount } };
  }

  private notFound() {
    return new AppError({ code: ERROR_CODES.NOT_FOUND, message: "error.schedule_cycle.not_found", statusCode: 404 });
  }

  private conflict(message: string) {
    return new AppError({ code: ERROR_CODES.SCHEDULE_CONFLICT, message, statusCode: 409 });
  }

  private requireTechnicianProfileId(actor: AuthenticatedAccessContext): number {
    if (actor.currentIdentityScopeType !== "technician_profile" || !actor.currentIdentityScopeId) {
      throw new AppError({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.identity.forbidden", statusCode: 403 });
    }
    return actor.currentIdentityScopeId;
  }
}
