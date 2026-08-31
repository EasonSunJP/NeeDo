import { ERROR_CODES } from "../constants/error-codes";
import {
  calculatePayrollSchedulePreview,
  type EmployeePayrollScheduleOverridePayload,
  type PayrollSchedulePreview,
  type PayrollScheduleRule,
  type ShopPayrollSchedulePolicyPayload
} from "../domain/payroll-schedule-policy";
import { AppError } from "../utils/app-error";
import type {
  ParsedEmployeePayrollSchedulePolicyBody,
  ParsedShopPayrollSchedulePolicyBody
} from "../validators/payroll-schedule-policy.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

export interface PayrollSchedulePolicyRepositoryPort {
  findActiveShopPolicy: (
    shopId: number,
    asOf: string
  ) => Promise<ShopPayrollSchedulePolicyPayload | null>;
  replaceShopPolicy: (
    shopId: number,
    input: ParsedShopPayrollSchedulePolicyBody,
    actorUserId: number
  ) => Promise<ShopPayrollSchedulePolicyPayload>;
  findCurrentEmployeeAffiliation: (
    shopId: number,
    needoId: string
  ) => Promise<{ id: number; technicianProfileId: number } | null>;
  findActiveEmployeeOverride: (
    technicianShopAffiliationId: number,
    asOf: string
  ) => Promise<EmployeePayrollScheduleOverridePayload | null>;
  replaceEmployeeOverride: (
    technicianShopAffiliationId: number,
    input: ParsedEmployeePayrollSchedulePolicyBody,
    actorUserId: number
  ) => Promise<EmployeePayrollScheduleOverridePayload>;
  listNonBusinessDateKeys: (countryCode: string, from: string, to: string) => Promise<string[]>;
}

type AuditRecorder = Pick<AuditLogService, "record">;

export interface EffectivePayrollSchedulePolicy extends PayrollScheduleRule {
  id: number;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ShopPayrollSchedulePolicyResult {
  configured: boolean;
  source: "shop" | "shop_unconfigured";
  shopPolicy: ShopPayrollSchedulePolicyPayload | null;
  effectivePolicy: EffectivePayrollSchedulePolicy | null;
  preview: PayrollSchedulePreview | null;
}

export interface EmployeePayrollSchedulePolicyResult {
  configured: boolean;
  source: "shop" | "employee_override" | "shop_unconfigured";
  inheritShopPolicy: boolean;
  shopPolicy: ShopPayrollSchedulePolicyPayload | null;
  employeeOverride: EmployeePayrollScheduleOverridePayload | null;
  effectivePolicy: EffectivePayrollSchedulePolicy | null;
  preview: PayrollSchedulePreview | null;
}

function addDays(dateKey: string, days: number): string {
  const result = new Date(`${dateKey}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function tokyoDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export class PayrollSchedulePolicyService {
  public constructor(
    private readonly repository: PayrollSchedulePolicyRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly today: () => string = () => tokyoDateKey()
  ) {}

  public async getShopPolicy(
    actor: AuthenticatedAccessContext,
    _context: AuthRequestContext,
    referenceDate = this.today()
  ): Promise<ShopPayrollSchedulePolicyResult> {
    const shopId = this.requireShopScope(actor);
    const shopPolicy = await this.repository.findActiveShopPolicy(shopId, referenceDate);
    return this.buildShopResult(shopPolicy, referenceDate);
  }

  public async updateShopPolicy(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: ParsedShopPayrollSchedulePolicyBody
  ): Promise<ShopPayrollSchedulePolicyResult> {
    const shopId = this.requireShopScope(actor);
    this.assertNotFutureEffectiveDate(input.effectiveFrom);
    const next = await this.repository.replaceShopPolicy(shopId, input, actor.userId);
    await this.auditLogService.record({
      actor,
      action: "merchant_admin.payroll_schedule_policy.update",
      targetType: "shop",
      targetId: shopId,
      context,
      metadata: {
        version: next.version,
        cadence: next.cadence,
        holidayAdjustment: next.holidayAdjustment,
        changedFields: [
          "cadence",
          "weeklySettlementWeekday",
          "monthlySettlementDay",
          "holidayAdjustment",
          "timezone",
          "effectiveFrom",
          "effectiveTo"
        ]
      }
    });
    return this.buildShopResult(next, this.today());
  }

  public async getEmployeePolicy(
    actor: AuthenticatedAccessContext,
    _context: AuthRequestContext,
    needoId: string,
    referenceDate = this.today()
  ): Promise<EmployeePayrollSchedulePolicyResult> {
    const shopId = this.requireShopScope(actor);
    const affiliation = await this.requireCurrentAffiliation(shopId, needoId);
    const [shopPolicy, employeeOverride] = await Promise.all([
      this.repository.findActiveShopPolicy(shopId, referenceDate),
      this.repository.findActiveEmployeeOverride(affiliation.id, referenceDate)
    ]);
    return this.buildEmployeeResult(shopPolicy, employeeOverride, referenceDate);
  }

  public async updateEmployeePolicy(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    needoId: string,
    input: ParsedEmployeePayrollSchedulePolicyBody
  ): Promise<EmployeePayrollSchedulePolicyResult> {
    const shopId = this.requireShopScope(actor);
    this.assertNotFutureEffectiveDate(input.effectiveFrom);
    const affiliation = await this.requireCurrentAffiliation(shopId, needoId);
    const employeeOverride = await this.repository.replaceEmployeeOverride(
      affiliation.id,
      input,
      actor.userId
    );
    const shopPolicy = await this.repository.findActiveShopPolicy(shopId, this.today());
    await this.auditLogService.record({
      actor,
      action: "merchant_admin.employee_payroll_schedule_override.update",
      targetType: "technician_shop_affiliation",
      targetId: affiliation.id,
      context,
      metadata: {
        shopId,
        version: employeeOverride.version,
        inheritShopPolicy: employeeOverride.inheritShopPolicy,
        cadence: employeeOverride.cadence,
        holidayAdjustment: employeeOverride.holidayAdjustment,
        changedFields: [
          "inheritShopPolicy",
          "cadence",
          "weeklySettlementWeekday",
          "monthlySettlementDay",
          "holidayAdjustment",
          "timezone",
          "effectiveFrom",
          "effectiveTo"
        ]
      }
    });
    return this.buildEmployeeResult(shopPolicy, employeeOverride, this.today());
  }

  private async buildShopResult(
    shopPolicy: ShopPayrollSchedulePolicyPayload | null,
    referenceDate: string
  ): Promise<ShopPayrollSchedulePolicyResult> {
    const effectivePolicy = shopPolicy ? this.toEffectivePolicy(shopPolicy) : null;
    return {
      configured: effectivePolicy !== null,
      source: effectivePolicy ? "shop" : "shop_unconfigured",
      shopPolicy,
      effectivePolicy,
      preview: effectivePolicy ? await this.calculatePreview(effectivePolicy, referenceDate) : null
    };
  }

  private async buildEmployeeResult(
    shopPolicy: ShopPayrollSchedulePolicyPayload | null,
    employeeOverride: EmployeePayrollScheduleOverridePayload | null,
    referenceDate: string
  ): Promise<EmployeePayrollSchedulePolicyResult> {
    const inheritShopPolicy = employeeOverride?.inheritShopPolicy ?? true;
    const source =
      !inheritShopPolicy && employeeOverride
        ? "employee_override"
        : shopPolicy
          ? "shop"
          : "shop_unconfigured";
    const effectivePolicy =
      source === "employee_override" && employeeOverride
        ? this.toEffectivePolicy(employeeOverride)
        : shopPolicy
          ? this.toEffectivePolicy(shopPolicy)
          : null;
    return {
      configured: effectivePolicy !== null,
      source,
      inheritShopPolicy,
      shopPolicy,
      employeeOverride,
      effectivePolicy,
      preview: effectivePolicy ? await this.calculatePreview(effectivePolicy, referenceDate) : null
    };
  }

  private async calculatePreview(
    policy: EffectivePayrollSchedulePolicy,
    referenceDate: string
  ): Promise<PayrollSchedulePreview> {
    const initial = calculatePayrollSchedulePreview({
      rule: policy,
      referenceDate,
      nonBusinessDates: new Set()
    });
    const nonBusinessDates = await this.repository.listNonBusinessDateKeys(
      "JP",
      addDays(initial.naturalSettlementDate, -14),
      addDays(initial.naturalSettlementDate, 14)
    );
    return calculatePayrollSchedulePreview({
      rule: policy,
      referenceDate,
      nonBusinessDates: new Set(nonBusinessDates)
    });
  }

  private toEffectivePolicy(
    policy: ShopPayrollSchedulePolicyPayload | EmployeePayrollScheduleOverridePayload
  ): EffectivePayrollSchedulePolicy {
    if (policy.cadence === null || policy.holidayAdjustment === null || policy.timezone === null) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.payroll_schedule.policy_incomplete",
        statusCode: 500
      });
    }
    return {
      id: policy.id,
      version: policy.version,
      cadence: policy.cadence,
      weeklySettlementWeekday: policy.weeklySettlementWeekday,
      monthlySettlementDay: policy.monthlySettlementDay,
      holidayAdjustment: policy.holidayAdjustment,
      timezone: policy.timezone,
      effectiveFrom: policy.effectiveFrom,
      effectiveTo: policy.effectiveTo
    };
  }

  private requireShopScope(actor: AuthenticatedAccessContext): number {
    return requireMerchantShopId(actor);
  }

  private async requireCurrentAffiliation(shopId: number, needoId: string) {
    const affiliation = await this.repository.findCurrentEmployeeAffiliation(shopId, needoId);
    if (affiliation) return affiliation;
    throw new AppError({
      code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
      message: "error.technician_affiliation.not_found",
      statusCode: 404
    });
  }

  private assertNotFutureEffectiveDate(effectiveFrom: string): void {
    if (effectiveFrom <= this.today()) return;
    throw new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.payroll_schedule.future_effective_date_not_supported",
      statusCode: 400
    });
  }
}
