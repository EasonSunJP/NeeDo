import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  OrderPerformanceAssessmentPayload,
  OrderPerformanceCommand,
  OrderPerformanceMutationOutcome,
  OrderPerformanceRepositoryPort,
  OrderPerformanceTreatmentPayload
} from "../repositories/order-performance.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogRecordInput, AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type OrderPerformanceCommandInput = {
  publicReason: string;
  internalNote?: string | null;
  idempotencyKey: string;
  expectedRevision: number;
};

export type OrderPerformanceCommandResult = {
  assessment: OrderPerformanceAssessmentPayload;
  replayed: boolean;
};

type AuditInputFactory = Pick<AuditLogService, "createInput">;
type RepositoryCommandMethod =
  | "classifyTechnicianUncompleted"
  | "applySpecialExclusion"
  | "revokeSpecialExclusion";

type CommandDefinition = {
  method: RepositoryCommandMethod;
  action: string;
  previousTreatment: OrderPerformanceTreatmentPayload | null;
  nextTreatment: OrderPerformanceTreatmentPayload;
};

const DEFINITIONS = {
  classifyTechnicianUncompleted: {
    method: "classifyTechnicianUncompleted",
    action: "order_performance.technician_uncompleted.classify",
    previousTreatment: null,
    nextTreatment: "counted"
  },
  applySpecialExclusion: {
    method: "applySpecialExclusion",
    action: "order_performance.special_exclusion.apply",
    previousTreatment: "counted",
    nextTreatment: "special_excluded"
  },
  revokeSpecialExclusion: {
    method: "revokeSpecialExclusion",
    action: "order_performance.special_exclusion.revoke",
    previousTreatment: "special_excluded",
    nextTreatment: "counted"
  }
} as const satisfies Record<RepositoryCommandMethod, CommandDefinition>;

export class OrderPerformanceService {
  public constructor(
    private readonly repository: OrderPerformanceRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public classifyTechnicianUncompleted(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    bookingOrderId: number,
    input: OrderPerformanceCommandInput
  ): Promise<OrderPerformanceCommandResult> {
    return this.execute(
      actor,
      context,
      bookingOrderId,
      input,
      DEFINITIONS.classifyTechnicianUncompleted
    );
  }

  public applySpecialExclusion(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    bookingOrderId: number,
    input: OrderPerformanceCommandInput
  ): Promise<OrderPerformanceCommandResult> {
    return this.execute(actor, context, bookingOrderId, input, DEFINITIONS.applySpecialExclusion);
  }

  public revokeSpecialExclusion(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    bookingOrderId: number,
    input: OrderPerformanceCommandInput
  ): Promise<OrderPerformanceCommandResult> {
    return this.execute(actor, context, bookingOrderId, input, DEFINITIONS.revokeSpecialExclusion);
  }

  private async execute(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    bookingOrderId: number,
    input: OrderPerformanceCommandInput,
    definition: CommandDefinition
  ): Promise<OrderPerformanceCommandResult> {
    const publicReason = input.publicReason.trim();
    const internalNote = input.internalNote?.trim() || null;
    const canonicalCommand = {
      action: definition.action,
      bookingOrderId,
      actorUserId: actor.userId,
      publicReason,
      internalNote,
      idempotencyKey: input.idempotencyKey,
      expectedRevision: input.expectedRevision
    };
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify(canonicalCommand))
      .digest("hex");
    const auditRecord: AuditLogRecordInput = {
      actor,
      context,
      action: definition.action,
      targetType: "booking_order",
      targetId: bookingOrderId,
      metadata: {
        bookingOrderId,
        expectedRevision: input.expectedRevision,
        previousTreatment: definition.previousTreatment,
        nextTreatment: definition.nextTreatment,
        publicReason,
        internalNote,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint
      }
    };
    const command: OrderPerformanceCommand = {
      ...canonicalCommand,
      requestFingerprint,
      auditLog: this.auditInputFactory.createInput(auditRecord)
    };
    const result = await this.repository[definition.method](command);

    return this.unwrap(result);
  }

  private unwrap(result: OrderPerformanceMutationOutcome): OrderPerformanceCommandResult {
    if (result.outcome === "ok") {
      return { assessment: result.assessment, replayed: result.replayed };
    }
    if (result.outcome === "not_found") {
      throw new AppError({
        code: ERROR_CODES.ORDER_PERFORMANCE_NOT_FOUND,
        message: "error.order_performance.not_found",
        statusCode: 404
      });
    }
    if (result.outcome === "ineligible") {
      throw new AppError({
        code: ERROR_CODES.ORDER_PERFORMANCE_INELIGIBLE,
        message: "error.order_performance.ineligible",
        statusCode: 422
      });
    }
    if (result.outcome === "version_conflict") {
      throw new AppError({
        code: ERROR_CODES.ORDER_PERFORMANCE_VERSION_CONFLICT,
        message: "error.order_performance.version_conflict",
        statusCode: 409
      });
    }
    throw new AppError({
      code: ERROR_CODES.ORDER_PERFORMANCE_IDEMPOTENCY_CONFLICT,
      message: "error.order_performance.idempotency_conflict",
      statusCode: 409
    });
  }
}
