import {
  calculateAffiliateUnallocatedBudget,
  transitionAffiliateTask,
  type AffiliateTaskStatus
} from "./affiliate-state-machine.service";
import type {
  AffiliateBudgetReservationRecord,
  AffiliateBudgetStatus,
  AffiliateBudgetLedgerPort,
  AffiliatePublisherType
} from "./affiliate-task.service";
import type { ReleaseAffiliateTaskBudgetInput } from "./ledger.service";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export type AffiliateTaskExpiryTransactionClient = unknown;

export interface AffiliateTaskExpiryTaskRecord {
  id: number;
  publisherType: AffiliatePublisherType;
  publisherMerchantAccountId: number | null;
  publisherShopId: number | null;
  status: AffiliateTaskStatus;
  taskStartsAt: Date;
  taskEndsAt: Date;
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  reservedBudgetNdp: number;
  allocatedBudgetNdp: number;
  settledBudgetNdp: number;
  releasedBudgetNdp: number;
  endedAt: Date | null;
}

export interface AffiliateTaskExpiryRepositoryPort {
  listExpiryCandidateTaskIds: (input: {
    now: Date;
    batchSize: number;
    afterTaskId: number;
  }) => Promise<number[]>;
  runInTransaction: <T>(
    handler: (
      repository: AffiliateTaskExpiryRepositoryPort,
      transactionClient?: AffiliateTaskExpiryTransactionClient
    ) => Promise<T>
  ) => Promise<T>;
  lockTask: (taskId: number) => Promise<AffiliateTaskExpiryTaskRecord | null>;
  lockBudgetReservation: (taskId: number) => Promise<AffiliateBudgetReservationRecord | null>;
  markTaskEnded: (input: {
    taskId: number;
    expectedStatus: "scheduled" | "active" | "paused" | "budget_exhausted";
    endedAt: Date;
  }) => Promise<void>;
  recordBudgetRelease: (input: {
    taskId: number;
    reservationId: number;
    releasedAfterNdp: number;
    reservationStatus: AffiliateBudgetStatus;
    releasedAt: Date | null;
  }) => Promise<void>;
  createBudgetTransactionLink: (input: {
    reservationId: number;
    ledgerTransactionId: number;
    kind: "release";
    amountNdp: number;
  }) => Promise<void>;
  createAuditLog: (input: {
    actorUserId: number | null;
    action: string;
    taskId: number;
    metadata?: unknown;
  }) => Promise<void>;
}

export interface AffiliateTaskExpiryInput {
  now: Date;
  batchSize: number;
}

export interface AffiliateTaskExpiryBatchSummary {
  scanned: number;
  ended: number;
  released: number;
  failed: number;
  releasedNdp: number;
}

export interface AffiliateTaskExpiryOutcome {
  ended: boolean;
  released: boolean;
  releasedNdp: number;
}

export interface AffiliateTaskExpiryCandidateFailure {
  taskId: number;
  code: number;
  message: string;
}

export type AffiliateTaskExpiryFailureReporter = (
  failure: AffiliateTaskExpiryCandidateFailure
) => void | Promise<void>;

type ExpirableAffiliateTaskStatus = "scheduled" | "active" | "paused" | "budget_exhausted";

const EXPIRABLE_STATUSES: ExpirableAffiliateTaskStatus[] = [
  "scheduled",
  "active",
  "paused",
  "budget_exhausted"
];

const isNonNegativeSafeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

const isExpirableStatus = (status: AffiliateTaskStatus): status is ExpirableAffiliateTaskStatus =>
  EXPIRABLE_STATUSES.includes(status as ExpirableAffiliateTaskStatus);

export class AffiliateTaskExpiryService {
  private afterTaskId = 0;

  public constructor(
    private readonly repository: AffiliateTaskExpiryRepositoryPort,
    private readonly ledger: AffiliateBudgetLedgerPort,
    private readonly reportFailure?: AffiliateTaskExpiryFailureReporter
  ) {}

  public async expireDue(input: AffiliateTaskExpiryInput): Promise<AffiliateTaskExpiryBatchSummary> {
    this.validateInput(input);
    const candidateIds = await this.listCandidateIds(input);
    if (candidateIds.length > 0) {
      this.afterTaskId = candidateIds[candidateIds.length - 1];
    }
    const summary: AffiliateTaskExpiryBatchSummary = {
      scanned: candidateIds.length,
      ended: 0,
      released: 0,
      failed: 0,
      releasedNdp: 0
    };

    for (const taskId of candidateIds) {
      try {
        const outcome = await this.expireCandidate(taskId, input.now);
        summary.ended += outcome.ended ? 1 : 0;
        summary.released += outcome.released ? 1 : 0;
        summary.releasedNdp += outcome.releasedNdp;
      } catch (error) {
        summary.failed += 1;
        await this.reportCandidateFailure(taskId, error);
      }
    }

    return summary;
  }

  private async listCandidateIds(input: AffiliateTaskExpiryInput): Promise<number[]> {
    let candidateIds = (
      await this.repository.listExpiryCandidateTaskIds({
        now: input.now,
        batchSize: input.batchSize,
        afterTaskId: this.afterTaskId
      })
    ).slice(0, input.batchSize);

    if (candidateIds.length === 0 && this.afterTaskId !== 0) {
      this.afterTaskId = 0;
      candidateIds = (
        await this.repository.listExpiryCandidateTaskIds({
          now: input.now,
          batchSize: input.batchSize,
          afterTaskId: 0
        })
      ).slice(0, input.batchSize);
    }

    return candidateIds;
  }

  private async reportCandidateFailure(taskId: number, error: unknown): Promise<void> {
    if (!this.reportFailure) {
      return;
    }
    const failure: AffiliateTaskExpiryCandidateFailure =
      error instanceof AppError
        ? { taskId, code: error.code, message: error.message }
        : {
            taskId,
            code: ERROR_CODES.INTERNAL,
            message: "error.internal_server_error"
          };
    try {
      await this.reportFailure(failure);
    } catch {
      return;
    }
  }

  private expireCandidate(taskId: number, now: Date): Promise<AffiliateTaskExpiryOutcome> {
    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const task = await repository.lockTask(taskId);
      if (!task) {
        return this.noop();
      }
      if (task.status !== "ended" && !isExpirableStatus(task.status)) {
        return this.noop();
      }
      const reservation = await repository.lockBudgetReservation(taskId);
      if (!reservation) {
        return this.noop();
      }

      this.validateBudgetSnapshot(task, reservation);
      const transitioned = await this.endIfDue(repository, task, reservation, now);
      if (!transitioned && task.status !== "ended") {
        return this.noop();
      }

      const releaseAmount = calculateAffiliateUnallocatedBudget(reservation);
      const releasedAfterNdp = reservation.releasedNdp + releaseAmount;
      const reservationStatus = this.resolveReservationStatus(reservation, releasedAfterNdp);

      if (releaseAmount === 0) {
        if (
          reservation.status !== reservationStatus ||
          (reservationStatus === "released" && reservation.releasedAt === null)
        ) {
          await repository.recordBudgetRelease({
            taskId: task.id,
            reservationId: reservation.id,
            releasedAfterNdp,
            reservationStatus,
            releasedAt: reservationStatus === "released" ? now : reservation.releasedAt
          });
        }
        return { ended: transitioned, released: false, releasedNdp: 0 };
      }

      const ledgerInput = this.releaseLedgerInput(task, reservation, releaseAmount, releasedAfterNdp);
      const ledgerResult = await this.ledger.releaseAffiliateTaskBudget(ledgerInput, {
        transactionClient
      });
      await repository.createBudgetTransactionLink({
        reservationId: reservation.id,
        ledgerTransactionId: ledgerResult.transaction.id,
        kind: "release",
        amountNdp: releaseAmount
      });
      await repository.recordBudgetRelease({
        taskId: task.id,
        reservationId: reservation.id,
        releasedAfterNdp,
        reservationStatus,
        releasedAt: reservationStatus === "released" ? now : reservation.releasedAt
      });
      await repository.createAuditLog({
        actorUserId: null,
        action: "affiliate.task.expiry_budget_released",
        taskId: task.id,
        metadata: {
          taskId: task.id,
          reservationId: reservation.id,
          releaseAmountNdp: releaseAmount,
          releasedBeforeNdp: reservation.releasedNdp,
          releasedAfterNdp,
          allocatedNdp: reservation.allocatedNdp,
          capturedNdp: reservation.capturedNdp,
          ledgerTransactionId: ledgerResult.transaction.id
        }
      });

      return { ended: transitioned, released: true, releasedNdp: releaseAmount };
    });
  }

  private async endIfDue(
    repository: AffiliateTaskExpiryRepositoryPort,
    task: AffiliateTaskExpiryTaskRecord,
    reservation: AffiliateBudgetReservationRecord,
    now: Date
  ): Promise<boolean> {
    if (!isExpirableStatus(task.status)) {
      return false;
    }
    const transition = transitionAffiliateTask(task.status, "expire", {
      now,
      startsAt: task.taskStartsAt,
      endsAt: task.taskEndsAt,
      rewardNdpPerCompletedOrder: task.rewardNdpPerCompletedOrder,
      budget: reservation
    });
    if (!transition.ok || transition.status !== "ended") {
      return false;
    }

    await repository.markTaskEnded({
      taskId: task.id,
      expectedStatus: task.status,
      endedAt: now
    });
    await repository.createAuditLog({
      actorUserId: null,
      action: "affiliate.task.expired",
      taskId: task.id,
      metadata: { taskId: task.id, reservationId: reservation.id }
    });
    return true;
  }

  private validateBudgetSnapshot(
    task: AffiliateTaskExpiryTaskRecord,
    reservation: AffiliateBudgetReservationRecord
  ): void {
    const counters = [
      task.totalBudgetNdp,
      task.reservedBudgetNdp,
      task.allocatedBudgetNdp,
      task.settledBudgetNdp,
      task.releasedBudgetNdp,
      reservation.totalFrozenNdp,
      reservation.allocatedNdp,
      reservation.capturedNdp,
      reservation.releasedNdp
    ];
    if (!counters.every(isNonNegativeSafeInteger)) {
      throw new Error("error.affiliate.invalid_budget_snapshot");
    }
    if (
      task.totalBudgetNdp !== reservation.totalFrozenNdp ||
      task.reservedBudgetNdp !== reservation.totalFrozenNdp ||
      task.allocatedBudgetNdp !== reservation.allocatedNdp ||
      task.settledBudgetNdp !== reservation.capturedNdp ||
      task.releasedBudgetNdp !== reservation.releasedNdp
    ) {
      throw new Error("error.affiliate.invalid_budget_snapshot");
    }
    calculateAffiliateUnallocatedBudget(reservation);
  }

  private releaseLedgerInput(
    task: AffiliateTaskExpiryTaskRecord,
    reservation: AffiliateBudgetReservationRecord,
    amountNdp: number,
    releasedAfterNdp: number
  ): ReleaseAffiliateTaskBudgetInput {
    return {
      taskId: task.id,
      walletId: reservation.walletId,
      ownerType: task.publisherType,
      ownerId: this.publisherOwnerId(task),
      amountNdp,
      idempotencyKey: `affiliate-task:${task.id}:expiry-release:to:${releasedAfterNdp}`,
      actorUserId: null
    };
  }

  private publisherOwnerId(task: AffiliateTaskExpiryTaskRecord): number {
    const ownerId =
      task.publisherType === "merchant_account"
        ? task.publisherMerchantAccountId
        : task.publisherShopId;
    if (!ownerId || !Number.isSafeInteger(ownerId) || ownerId <= 0) {
      throw new Error("error.affiliate.invalid_budget_snapshot");
    }
    return ownerId;
  }

  private resolveReservationStatus(
    reservation: AffiliateBudgetReservationRecord,
    releasedAfterNdp: number
  ): AffiliateBudgetStatus {
    if (
      reservation.allocatedNdp === 0 &&
      reservation.capturedNdp + releasedAfterNdp === reservation.totalFrozenNdp
    ) {
      return "released";
    }
    if (reservation.status === "active" || reservation.status === "exhausted") {
      return reservation.status;
    }
    throw new Error("error.affiliate.invalid_budget_snapshot");
  }

  private validateInput(input: AffiliateTaskExpiryInput): void {
    if (!Number.isSafeInteger(input.batchSize) || input.batchSize <= 0) {
      throw new Error("error.affiliate.expiry_batch_size_invalid");
    }
  }

  private noop(): AffiliateTaskExpiryOutcome {
    return { ended: false, released: false, releasedNdp: 0 };
  }
}
