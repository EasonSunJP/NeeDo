import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export type BookingUserRewardStatus = "disabled" | "immediate" | "pending" | "paid" | "expired";

export type BookingUserRewardExpiryTransactionClient = unknown;

export interface BookingUserRewardExpiryRecord {
  id: number;
  bookingOrderId: number;
  userRewardStatus: BookingUserRewardStatus;
  userRewardDeadlineAt: Date | null;
}

export interface BookingUserRewardExpiryRepositoryPort {
  getDatabaseNow: () => Promise<Date>;
  listExpiryCandidateIds: (input: {
    now: Date;
    batchSize: number;
    afterId: number;
  }) => Promise<number[]>;
  runInTransaction: <T>(
    handler: (
      repository: BookingUserRewardExpiryRepositoryPort,
      transactionClient?: BookingUserRewardExpiryTransactionClient
    ) => Promise<T>
  ) => Promise<T>;
  lockReward: (id: number) => Promise<BookingUserRewardExpiryRecord | null>;
  expireReward: (input: { id: number; expectedDeadlineAt: Date }) => Promise<boolean>;
  createAuditLog: (input: {
    action: "booking.user_reward.expired";
    financialId: number;
    bookingOrderId: number;
    deadlineAt: Date;
    expiredAt: Date;
  }) => Promise<void>;
}

export interface BookingUserRewardExpiryInput {
  now: Date;
  batchSize: number;
}

export interface BookingUserRewardExpiryBatchSummary {
  scanned: number;
  expired: number;
  failed: number;
}

export interface BookingUserRewardExpiryCandidateFailure {
  financialId: number;
  code: number;
  message: string;
}

export type BookingUserRewardExpiryFailureReporter = (
  failure: BookingUserRewardExpiryCandidateFailure
) => void | Promise<void>;

export class BookingUserRewardExpiryService {
  private afterId = 0;

  public constructor(
    private readonly repository: BookingUserRewardExpiryRepositoryPort,
    private readonly reportFailure?: BookingUserRewardExpiryFailureReporter
  ) {}

  public async expireDue(
    input: BookingUserRewardExpiryInput
  ): Promise<BookingUserRewardExpiryBatchSummary> {
    this.validateInput(input);
    const databaseNow = await this.repository.getDatabaseNow();
    const candidateIds = await this.listCandidateIds({ ...input, now: databaseNow });
    const summary: BookingUserRewardExpiryBatchSummary = {
      scanned: candidateIds.length,
      expired: 0,
      failed: 0
    };

    for (const financialId of candidateIds) {
      try {
        if (await this.expireCandidate(financialId)) {
          summary.expired += 1;
        }
      } catch (error) {
        summary.failed += 1;
        await this.reportCandidateFailure(financialId, error);
      }
    }

    return summary;
  }

  private async listCandidateIds(input: BookingUserRewardExpiryInput): Promise<number[]> {
    let candidateIds = (
      await this.repository.listExpiryCandidateIds({
        now: input.now,
        batchSize: input.batchSize,
        afterId: this.afterId
      })
    ).slice(0, input.batchSize);

    if (candidateIds.length === 0 && this.afterId !== 0) {
      this.afterId = 0;
      candidateIds = (
        await this.repository.listExpiryCandidateIds({
          now: input.now,
          batchSize: input.batchSize,
          afterId: 0
        })
      ).slice(0, input.batchSize);
    }

    if (candidateIds.length > 0) {
      this.afterId = candidateIds[candidateIds.length - 1];
    }
    return candidateIds;
  }

  private expireCandidate(financialId: number): Promise<boolean> {
    return this.repository.runInTransaction(async (repository) => {
      const reward = await repository.lockReward(financialId);
      const databaseNow = await repository.getDatabaseNow();
      if (
        !reward ||
        reward.userRewardStatus !== "pending" ||
        reward.userRewardDeadlineAt === null ||
        reward.userRewardDeadlineAt > databaseNow
      ) {
        return false;
      }

      const expired = await repository.expireReward({
        id: reward.id,
        expectedDeadlineAt: reward.userRewardDeadlineAt
      });
      if (!expired) {
        return false;
      }

      await repository.createAuditLog({
        action: "booking.user_reward.expired",
        financialId: reward.id,
        bookingOrderId: reward.bookingOrderId,
        deadlineAt: reward.userRewardDeadlineAt,
        expiredAt: databaseNow
      });
      return true;
    });
  }

  private async reportCandidateFailure(financialId: number, error: unknown): Promise<void> {
    if (!this.reportFailure) {
      return;
    }
    const failure: BookingUserRewardExpiryCandidateFailure =
      error instanceof AppError
        ? { financialId, code: error.code, message: error.message }
        : {
            financialId,
            code: ERROR_CODES.INTERNAL,
            message: "error.internal_server_error"
          };
    try {
      await this.reportFailure(failure);
    } catch {
      return;
    }
  }

  private validateInput(input: BookingUserRewardExpiryInput): void {
    if (
      Number.isNaN(input.now.getTime()) ||
      !Number.isSafeInteger(input.batchSize) ||
      input.batchSize < 1 ||
      input.batchSize > 500
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }
  }
}
