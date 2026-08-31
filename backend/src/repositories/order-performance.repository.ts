import {
  OrderPerformanceOutcome,
  OrderPerformanceRevisionAction,
  OrderPerformanceTreatment,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  calculateTechnicianPerformance,
  type TechnicianPerformanceProjection
} from "../services/order-performance-calculator";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export type OrderPerformanceOutcomePayload = "technician_cancelled" | "technician_uncompleted";
export type OrderPerformanceTreatmentPayload = "counted" | "special_excluded";

export type OrderPerformanceAssessmentPayload = {
  id: number;
  bookingOrderId: number;
  technicianProfileId: number;
  outcome: OrderPerformanceOutcomePayload;
  treatment: OrderPerformanceTreatmentPayload;
  version: number;
  currentRevisionId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TechnicianPerformanceSummaryPayload = TechnicianPerformanceProjection & {
  id: number;
  technicianProfileId: number;
  sourceCalculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderPerformanceCommand = {
  bookingOrderId: number;
  actorUserId: number;
  publicReason: string;
  internalNote: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
  expectedRevision: number;
  auditLog: AuditLogCreateInput;
};

export type OrderPerformanceMutationOutcome =
  | {
      outcome: "ok";
      assessment: OrderPerformanceAssessmentPayload;
      replayed: boolean;
    }
  | {
      outcome: "not_found" | "ineligible" | "version_conflict" | "idempotency_conflict";
    };

export interface OrderPerformanceRepositoryPort {
  classifyTechnicianUncompleted(
    input: OrderPerformanceCommand
  ): Promise<OrderPerformanceMutationOutcome>;
  applySpecialExclusion(input: OrderPerformanceCommand): Promise<OrderPerformanceMutationOutcome>;
  revokeSpecialExclusion(input: OrderPerformanceCommand): Promise<OrderPerformanceMutationOutcome>;
  rebuildTechnicianSummary(
    technicianProfileId: number
  ): Promise<TechnicianPerformanceSummaryPayload>;
}

export type AdverseOutcomeClassificationInput = {
  bookingOrderId: number;
  technicianProfileId: number;
  outcome: OrderPerformanceOutcome;
  actorUserId: number | null;
  publicReason: string | null;
  internalNote: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
  expectedRevision: number;
  calculatedAt: Date;
};

type AssessmentRecord = {
  id: number;
  bookingOrderId: number;
  technicianProfileId: number;
  outcome: OrderPerformanceOutcome;
  treatment: OrderPerformanceTreatment;
  version: number;
  currentRevisionId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const outcomeToPayload = (outcome: OrderPerformanceOutcome): OrderPerformanceOutcomePayload =>
  outcome === OrderPerformanceOutcome.TECHNICIAN_CANCELLED
    ? "technician_cancelled"
    : "technician_uncompleted";

const treatmentToPayload = (
  treatment: OrderPerformanceTreatment
): OrderPerformanceTreatmentPayload =>
  treatment === OrderPerformanceTreatment.SPECIAL_EXCLUDED ? "special_excluded" : "counted";

const mapAssessment = (assessment: AssessmentRecord): OrderPerformanceAssessmentPayload => ({
  id: assessment.id,
  bookingOrderId: assessment.bookingOrderId,
  technicianProfileId: assessment.technicianProfileId,
  outcome: outcomeToPayload(assessment.outcome),
  treatment: treatmentToPayload(assessment.treatment),
  version: assessment.version,
  currentRevisionId: assessment.currentRevisionId,
  createdAt: assessment.createdAt,
  updatedAt: assessment.updatedAt
});

const enrichedAuditData = (auditLog: AuditLogCreateInput, metadata: Record<string, unknown>) =>
  toAuditLogCreateData({
    ...auditLog,
    metadata: {
      ...(auditLog.metadata &&
      typeof auditLog.metadata === "object" &&
      !Array.isArray(auditLog.metadata)
        ? auditLog.metadata
        : {}),
      ...metadata
    }
  });

const classificationAction = (outcome: OrderPerformanceOutcome): OrderPerformanceRevisionAction =>
  outcome === OrderPerformanceOutcome.TECHNICIAN_CANCELLED
    ? OrderPerformanceRevisionAction.CLASSIFY_TECHNICIAN_CANCELLED
    : OrderPerformanceRevisionAction.CLASSIFY_TECHNICIAN_UNCOMPLETED;

const resolveReplay = async (
  transaction: Pick<PrismaClient, "orderPerformanceAssessmentRevision">,
  input: Pick<AdverseOutcomeClassificationInput, "idempotencyKey" | "requestFingerprint">
): Promise<OrderPerformanceMutationOutcome | null> => {
  const replay = await transaction.orderPerformanceAssessmentRevision.findFirst({
    where: {
      idempotencyKey: input.idempotencyKey,
      deletedAt: null,
      assessment: { deletedAt: null }
    },
    include: { assessment: true }
  });
  if (!replay) {
    return null;
  }
  if (replay.requestFingerprint !== input.requestFingerprint) {
    return { outcome: "idempotency_conflict" };
  }
  return {
    outcome: "ok",
    assessment: mapAssessment(replay.assessment),
    replayed: true
  };
};

export const recalculateTechnicianSummaryInTransaction = async (
  transaction: Prisma.TransactionClient,
  technicianProfileId: number,
  calculatedAt: Date
): Promise<TechnicianPerformanceSummaryPayload> => {
  const [completedOrderCount, groups] = await Promise.all([
    transaction.bookingOrder.count({
      where: {
        technicianProfileId,
        status: "COMPLETED",
        deletedAt: null
      }
    }),
    transaction.orderPerformanceAssessment.groupBy({
      by: ["outcome", "treatment"],
      where: { technicianProfileId, deletedAt: null },
      _count: { _all: true }
    })
  ]);

  const countGroup = (
    outcome: OrderPerformanceOutcome | undefined,
    treatment: OrderPerformanceTreatment
  ) =>
    groups
      .filter(
        (group) =>
          (outcome === undefined || group.outcome === outcome) && group.treatment === treatment
      )
      .reduce((total, group) => total + group._count._all, 0);

  const projection = calculateTechnicianPerformance({
    completedOrderCount,
    accountableCancellationCount: countGroup(
      OrderPerformanceOutcome.TECHNICIAN_CANCELLED,
      OrderPerformanceTreatment.COUNTED
    ),
    accountableUncompletedCount: countGroup(
      OrderPerformanceOutcome.TECHNICIAN_UNCOMPLETED,
      OrderPerformanceTreatment.COUNTED
    ),
    specialExcludedCount: countGroup(undefined, OrderPerformanceTreatment.SPECIAL_EXCLUDED)
  });
  const data = {
    ...projection,
    sourceCalculatedAt: calculatedAt,
    deletedAt: null
  };
  const summary = await transaction.technicianPerformanceSummary.upsert({
    where: { technicianProfileId },
    create: { technicianProfileId, ...data },
    update: data
  });

  return {
    id: summary.id,
    technicianProfileId,
    ...projection,
    sourceCalculatedAt: summary.sourceCalculatedAt,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt
  };
};

export const classifyAdverseOutcomeInTransaction = async (
  transaction: Prisma.TransactionClient,
  input: AdverseOutcomeClassificationInput
): Promise<OrderPerformanceMutationOutcome> => {
  const replay = await resolveReplay(transaction, input);
  if (replay) {
    return replay;
  }
  if (input.expectedRevision !== 0) {
    return { outcome: "version_conflict" };
  }

  const existing = await transaction.orderPerformanceAssessment.findFirst({
    where: { bookingOrderId: input.bookingOrderId, deletedAt: null }
  });
  if (existing) {
    return { outcome: "ineligible" };
  }

  const assessment = await transaction.orderPerformanceAssessment.create({
    data: {
      bookingOrderId: input.bookingOrderId,
      technicianProfileId: input.technicianProfileId,
      outcome: input.outcome,
      treatment: OrderPerformanceTreatment.COUNTED,
      version: 1
    }
  });
  const revision = await transaction.orderPerformanceAssessmentRevision.create({
    data: {
      assessmentId: assessment.id,
      bookingOrderId: input.bookingOrderId,
      technicianProfileId: input.technicianProfileId,
      action: classificationAction(input.outcome),
      previousTreatment: null,
      nextTreatment: OrderPerformanceTreatment.COUNTED,
      publicReason: input.publicReason,
      internalNote: input.internalNote,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      assessmentVersion: 1
    },
    select: { id: true }
  });
  const linked = await transaction.orderPerformanceAssessment.updateMany({
    where: {
      id: assessment.id,
      version: 1,
      currentRevisionId: null,
      deletedAt: null
    },
    data: { currentRevisionId: revision.id }
  });
  if (linked.count !== 1) {
    throw new Error("error.order_performance.transaction_conflict");
  }

  await recalculateTechnicianSummaryInTransaction(
    transaction,
    input.technicianProfileId,
    input.calculatedAt
  );
  return {
    outcome: "ok",
    assessment: mapAssessment({ ...assessment, currentRevisionId: revision.id }),
    replayed: false
  };
};

export class OrderPerformanceRepository implements OrderPerformanceRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public classifyTechnicianUncompleted(
    input: OrderPerformanceCommand
  ): Promise<OrderPerformanceMutationOutcome> {
    return this.runCommand(input, () =>
      runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => {
          const replay = await resolveReplay(transaction, input);
          if (replay) {
            return replay;
          }
          const order = await transaction.bookingOrder.findFirst({
            where: { id: input.bookingOrderId, deletedAt: null },
            select: { id: true, status: true, technicianProfileId: true }
          });
          if (!order) {
            return { outcome: "not_found" as const };
          }
          if (order.status !== "CANCELLED" || order.technicianProfileId === null) {
            return { outcome: "ineligible" as const };
          }

          const result = await classifyAdverseOutcomeInTransaction(transaction, {
            ...input,
            technicianProfileId: order.technicianProfileId,
            outcome: OrderPerformanceOutcome.TECHNICIAN_UNCOMPLETED,
            publicReason: input.publicReason.trim(),
            internalNote: input.internalNote?.trim() || null,
            calculatedAt: new Date()
          });
          if (result.outcome === "ok" && !result.replayed) {
            await transaction.auditLog.create({
              data: enrichedAuditData(input.auditLog, {
                assessmentId: result.assessment.id,
                bookingOrderId: result.assessment.bookingOrderId,
                technicianProfileId: result.assessment.technicianProfileId,
                outcome: result.assessment.outcome,
                previousTreatment: null,
                nextTreatment: result.assessment.treatment,
                assessmentVersion: result.assessment.version
              })
            });
          }
          return result;
        })
      )
    );
  }

  public applySpecialExclusion(
    input: OrderPerformanceCommand
  ): Promise<OrderPerformanceMutationOutcome> {
    return this.changeTreatment(
      input,
      OrderPerformanceTreatment.COUNTED,
      OrderPerformanceTreatment.SPECIAL_EXCLUDED,
      OrderPerformanceRevisionAction.APPLY_SPECIAL_EXCLUSION
    );
  }

  public revokeSpecialExclusion(
    input: OrderPerformanceCommand
  ): Promise<OrderPerformanceMutationOutcome> {
    return this.changeTreatment(
      input,
      OrderPerformanceTreatment.SPECIAL_EXCLUDED,
      OrderPerformanceTreatment.COUNTED,
      OrderPerformanceRevisionAction.REVOKE_SPECIAL_EXCLUSION
    );
  }

  public rebuildTechnicianSummary(
    technicianProfileId: number
  ): Promise<TechnicianPerformanceSummaryPayload> {
    return this.client.$transaction((transaction) =>
      recalculateTechnicianSummaryInTransaction(transaction, technicianProfileId, new Date())
    );
  }

  private changeTreatment(
    input: OrderPerformanceCommand,
    previousTreatment: OrderPerformanceTreatment,
    nextTreatment: OrderPerformanceTreatment,
    action: OrderPerformanceRevisionAction
  ): Promise<OrderPerformanceMutationOutcome> {
    return this.runCommand(input, () =>
      runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => {
          const replay = await resolveReplay(transaction, input);
          if (replay) {
            return replay;
          }
          const assessment = await transaction.orderPerformanceAssessment.findFirst({
            where: { bookingOrderId: input.bookingOrderId, deletedAt: null }
          });
          if (!assessment) {
            return { outcome: "not_found" as const };
          }
          if (assessment.version !== input.expectedRevision) {
            return { outcome: "version_conflict" as const };
          }
          if (assessment.treatment !== previousTreatment) {
            return { outcome: "ineligible" as const };
          }

          const nextVersion = assessment.version + 1;
          const updated = await transaction.orderPerformanceAssessment.updateMany({
            where: {
              id: assessment.id,
              version: input.expectedRevision,
              treatment: previousTreatment,
              deletedAt: null
            },
            data: { treatment: nextTreatment, version: { increment: 1 } }
          });
          if (updated.count !== 1) {
            return { outcome: "version_conflict" as const };
          }

          const revision = await transaction.orderPerformanceAssessmentRevision.create({
            data: {
              assessmentId: assessment.id,
              bookingOrderId: assessment.bookingOrderId,
              technicianProfileId: assessment.technicianProfileId,
              action,
              previousTreatment,
              nextTreatment,
              publicReason: input.publicReason.trim(),
              internalNote: input.internalNote?.trim() || null,
              actorUserId: input.actorUserId,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: input.requestFingerprint,
              assessmentVersion: nextVersion
            },
            select: { id: true }
          });
          const linked = await transaction.orderPerformanceAssessment.updateMany({
            where: { id: assessment.id, version: nextVersion, deletedAt: null },
            data: { currentRevisionId: revision.id }
          });
          if (linked.count !== 1) {
            throw new Error("error.order_performance.transaction_conflict");
          }

          await recalculateTechnicianSummaryInTransaction(
            transaction,
            assessment.technicianProfileId,
            new Date()
          );
          await transaction.auditLog.create({
            data: enrichedAuditData(input.auditLog, {
              assessmentId: assessment.id,
              bookingOrderId: assessment.bookingOrderId,
              technicianProfileId: assessment.technicianProfileId,
              outcome: outcomeToPayload(assessment.outcome),
              previousTreatment: treatmentToPayload(previousTreatment),
              nextTreatment: treatmentToPayload(nextTreatment),
              assessmentVersion: nextVersion
            })
          });

          return {
            outcome: "ok" as const,
            assessment: mapAssessment({
              ...assessment,
              treatment: nextTreatment,
              version: nextVersion,
              currentRevisionId: revision.id
            }),
            replayed: false
          };
        })
      )
    );
  }

  private async runCommand(
    input: Pick<OrderPerformanceCommand, "idempotencyKey" | "requestFingerprint">,
    operation: () => Promise<OrderPerformanceMutationOutcome>
  ): Promise<OrderPerformanceMutationOutcome> {
    try {
      return await operation();
    } catch (error) {
      if (!this.isUniqueConflict(error)) {
        throw error;
      }
      const replay = await resolveReplay(this.client, input);
      if (replay) {
        return replay;
      }
      throw error;
    }
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}
