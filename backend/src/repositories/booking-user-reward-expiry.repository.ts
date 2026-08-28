import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  BookingUserRewardExpiryRecord,
  BookingUserRewardExpiryRepositoryPort,
  BookingUserRewardExpiryTransactionClient,
  BookingUserRewardStatus
} from "../services/booking-user-reward-expiry.service";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";

type BookingUserRewardExpiryPrismaClient = PrismaClient | Prisma.TransactionClient;

const rewardSelect = {
  id: true,
  bookingOrderId: true,
  userRewardStatus: true,
  userRewardDeadlineAt: true
} satisfies Prisma.OrderFinancialSelect;

type BookingUserRewardDbRecord = Prisma.OrderFinancialGetPayload<{ select: typeof rewardSelect }>;

export class BookingUserRewardExpiryRepository
  implements BookingUserRewardExpiryRepositoryPort
{
  public constructor(private readonly client: BookingUserRewardExpiryPrismaClient = prisma) {}

  public async listExpiryCandidateIds(input: {
    now: Date;
    batchSize: number;
    afterId: number;
  }): Promise<number[]> {
    const rows = await this.client.orderFinancial.findMany({
      where: {
        id: { gt: input.afterId },
        userRewardStatus: "PENDING",
        userRewardDeadlineAt: { lte: input.now },
        deletedAt: null
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: input.batchSize
    });
    return rows.map((row) => row.id);
  }

  public async runInTransaction<T>(
    handler: (
      repository: BookingUserRewardExpiryRepositoryPort,
      transactionClient?: BookingUserRewardExpiryTransactionClient
    ) => Promise<T>
  ): Promise<T> {
    if (this.canStartTransaction(this.client)) {
      return runWithTransactionConflictRetry(() =>
        this.client.$transaction((transactionClient) =>
          handler(new BookingUserRewardExpiryRepository(transactionClient), transactionClient)
        )
      );
    }
    return handler(new BookingUserRewardExpiryRepository(this.client), this.client);
  }

  public async lockReward(id: number): Promise<BookingUserRewardExpiryRecord | null> {
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM order_financials WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`
    );
    if (rows.length !== 1) {
      return null;
    }
    const reward = await this.client.orderFinancial.findFirst({
      where: { id: Number(rows[0].id), deletedAt: null },
      select: rewardSelect
    });
    return reward ? this.mapReward(reward) : null;
  }

  public async expireReward(input: {
    id: number;
    expectedDeadlineAt: Date;
  }): Promise<boolean> {
    const update = await this.client.orderFinancial.updateMany({
      where: {
        id: input.id,
        userRewardStatus: "PENDING",
        userRewardDeadlineAt: input.expectedDeadlineAt,
        deletedAt: null
      },
      data: {
        userRewardStatus: "EXPIRED",
        userRewardNdp: 0,
        userRewardGrantedAt: null
      }
    });
    return update.count === 1;
  }

  public async createAuditLog(input: {
    action: "booking.user_reward.expired";
    financialId: number;
    bookingOrderId: number;
    deadlineAt: Date;
    expiredAt: Date;
  }): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: null,
        action: input.action,
        targetType: "order_financial",
        targetId: input.financialId,
        metadata: {
          bookingOrderId: input.bookingOrderId,
          deadlineAt: input.deadlineAt.toISOString(),
          expiredAt: input.expiredAt.toISOString()
        }
      }
    });
  }

  private canStartTransaction(client: BookingUserRewardExpiryPrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }

  private mapReward(reward: BookingUserRewardDbRecord): BookingUserRewardExpiryRecord {
    return {
      id: reward.id,
      bookingOrderId: reward.bookingOrderId,
      userRewardStatus: reward.userRewardStatus.toLowerCase() as BookingUserRewardStatus,
      userRewardDeadlineAt: reward.userRewardDeadlineAt
    };
  }
}
