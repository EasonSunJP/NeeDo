import type {
  AffiliateTaskExpiryBatchSummary,
  AffiliateTaskExpiryRepositoryPort,
  AffiliateTaskExpiryTaskRecord,
  AffiliateTaskExpiryTransactionClient
} from "../../src/services/affiliate-task-expiry.service";
import type { AffiliateBudgetReservationRecord } from "../../src/services/affiliate-task.service";

export class FixtureOwnedAffiliateTaskExpiryRepository implements AffiliateTaskExpiryRepositoryPort {
  public readonly listInputs: Array<{ now: Date; batchSize: number; afterTaskId: number }> = [];
  public lastRejectedTaskIds: number[] = [];
  public readonly transactionErrors: unknown[] = [];

  public constructor(
    private readonly delegate: AffiliateTaskExpiryRepositoryPort,
    private readonly allowedTaskIds: ReadonlySet<number>
  ) {}

  public async listExpiryCandidateTaskIds(input: {
    now: Date;
    batchSize: number;
    afterTaskId: number;
  }): Promise<number[]> {
    this.listInputs.push(input);
    const candidateTaskIds = await this.delegate.listExpiryCandidateTaskIds(input);
    this.lastRejectedTaskIds = candidateTaskIds.filter(
      (taskId) => !this.allowedTaskIds.has(taskId)
    );
    if (this.lastRejectedTaskIds.length > 0) {
      throw new Error(
        `fixture-owned expiry candidate allow-set rejected task: ${this.lastRejectedTaskIds.join(",")}`
      );
    }
    return candidateTaskIds;
  }

  public async runInTransaction<T>(
    handler: (
      repository: AffiliateTaskExpiryRepositoryPort,
      transactionClient?: AffiliateTaskExpiryTransactionClient
    ) => Promise<T>
  ): Promise<T> {
    try {
      return await this.delegate.runInTransaction(handler);
    } catch (error) {
      this.transactionErrors.push(error);
      throw error;
    }
  }

  public lockTask(taskId: number): Promise<AffiliateTaskExpiryTaskRecord | null> {
    return this.delegate.lockTask(taskId);
  }

  public lockBudgetReservation(taskId: number): Promise<AffiliateBudgetReservationRecord | null> {
    return this.delegate.lockBudgetReservation(taskId);
  }

  public markTaskEnded(
    input: Parameters<AffiliateTaskExpiryRepositoryPort["markTaskEnded"]>[0]
  ): Promise<void> {
    return this.delegate.markTaskEnded(input);
  }

  public recordBudgetRelease(
    input: Parameters<AffiliateTaskExpiryRepositoryPort["recordBudgetRelease"]>[0]
  ): Promise<void> {
    return this.delegate.recordBudgetRelease(input);
  }

  public createBudgetTransactionLink(
    input: Parameters<AffiliateTaskExpiryRepositoryPort["createBudgetTransactionLink"]>[0]
  ): Promise<void> {
    return this.delegate.createBudgetTransactionLink(input);
  }

  public createAuditLog(
    input: Parameters<AffiliateTaskExpiryRepositoryPort["createAuditLog"]>[0]
  ): Promise<void> {
    return this.delegate.createAuditLog(input);
  }
}

export const requireSuccessfulExpirySummary = <
  T extends Pick<AffiliateTaskExpiryBatchSummary, "failed">
>(
  summary: T
): T => {
  if (summary.failed !== 0) {
    throw new Error("fulfilled expireDue summary reported candidate failure");
  }
  return summary;
};

export const resolveProductionRaceOutcome = async <T>(input: {
  initial: PromiseSettledResult<T>;
  verifyRollback: () => void | Promise<void>;
  validateFulfilled?: (value: T) => T;
}): Promise<T> => {
  const validate = input.validateFulfilled ?? ((value: T) => value);
  if (input.initial.status === "fulfilled") {
    return validate(input.initial.value);
  }
  await input.verifyRollback();
  throw input.initial.reason;
};
