import {
  Prisma,
  type AffiliateBudgetStatus as PrismaAffiliateBudgetStatus,
  type AffiliateTaskStatus as PrismaAffiliateTaskStatus,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliateTaskExpiryRepositoryPort,
  AffiliateTaskExpiryTaskRecord,
  AffiliateTaskExpiryTransactionClient
} from "../services/affiliate-task-expiry.service";
import type {
  AffiliateBudgetReservationRecord,
  AffiliateBudgetStatus,
  AffiliatePublisherType
} from "../services/affiliate-task.service";
import type { AffiliateTaskStatus } from "../services/affiliate-state-machine.service";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";

type AffiliateTaskExpiryPrismaClient = PrismaClient | Prisma.TransactionClient;

const taskSelect = {
  id: true,
  publisherType: true,
  publisherMerchantAccountId: true,
  publisherShopId: true,
  status: true,
  taskStartsAt: true,
  taskEndsAt: true,
  rewardNdpPerCompletedOrder: true,
  totalBudgetNdp: true,
  reservedBudgetNdp: true,
  allocatedBudgetNdp: true,
  settledBudgetNdp: true,
  releasedBudgetNdp: true,
  platformFeeBps: true,
  platformFeeReserveNdp: true,
  settledPlatformFeeNdp: true,
  releasedPlatformFeeNdp: true,
  endedAt: true
} satisfies Prisma.AffiliateTaskSelect;

const reservationSelect = {
  id: true,
  taskId: true,
  walletId: true,
  totalFrozenNdp: true,
  commissionFrozenNdp: true,
  platformFeeFrozenNdp: true,
  allocatedNdp: true,
  capturedNdp: true,
  platformFeeCapturedNdp: true,
  releasedNdp: true,
  platformFeeReleasedNdp: true,
  status: true,
  idempotencyKey: true,
  frozenAt: true,
  releasedAt: true
} satisfies Prisma.AffiliateBudgetReservationSelect;

type AffiliateTaskDbRecord = Prisma.AffiliateTaskGetPayload<{ select: typeof taskSelect }>;
type AffiliateBudgetReservationDbRecord = Prisma.AffiliateBudgetReservationGetPayload<{
  select: typeof reservationSelect;
}>;

export class AffiliateTaskExpiryRepository implements AffiliateTaskExpiryRepositoryPort {
  private readonly lockedTasks = new Map<number, AffiliateTaskExpiryTaskRecord>();
  private readonly lockedReservations = new Map<number, AffiliateBudgetReservationRecord>();

  public constructor(private readonly client: AffiliateTaskExpiryPrismaClient = prisma) {}

  public async listExpiryCandidateTaskIds(input: {
    now: Date;
    batchSize: number;
    afterTaskId: number;
  }): Promise<number[]> {
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT task.id
        FROM affiliate_tasks AS task
        INNER JOIN affiliate_budget_reservations AS reservation
          ON reservation.task_id = task.id
        WHERE task.deleted_at IS NULL
          AND reservation.deleted_at IS NULL
          AND task.id > ${input.afterTaskId}
          AND (
            (
              task.status IN ('scheduled', 'active', 'paused', 'budget_exhausted')
              AND task.task_ends_at <= ${input.now}
            )
            OR (
              task.status = 'ended'
              AND (
                reservation.commission_frozen_ndp > reservation.allocated_ndp + reservation.captured_ndp + reservation.released_ndp
                OR reservation.platform_fee_frozen_ndp >
                  reservation.platform_fee_captured_ndp
                  + reservation.platform_fee_released_ndp
                  + (
                    reservation.allocated_ndp DIV task.reward_ndp_per_completed_order
                  ) * FLOOR(task.reward_ndp_per_completed_order * task.platform_fee_bps / 10000)
              )
            )
          )
        ORDER BY task.id ASC
        LIMIT ${input.batchSize}
      `
    );
    return rows.map((row) => Number(row.id));
  }

  public async runInTransaction<T>(
    handler: (
      repository: AffiliateTaskExpiryRepositoryPort,
      transactionClient?: AffiliateTaskExpiryTransactionClient
    ) => Promise<T>
  ): Promise<T> {
    if (this.canStartTransaction(this.client)) {
      return runWithTransactionConflictRetry(() =>
        this.client.$transaction((transactionClient) =>
          handler(new AffiliateTaskExpiryRepository(transactionClient), transactionClient)
        )
      );
    }
    return handler(new AffiliateTaskExpiryRepository(this.client), this.client);
  }

  public async lockTask(taskId: number): Promise<AffiliateTaskExpiryTaskRecord | null> {
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM affiliate_tasks WHERE id = ${taskId} AND deleted_at IS NULL FOR UPDATE`
    );
    if (rows.length !== 1) {
      return null;
    }
    const task = await this.client.affiliateTask.findFirst({
      where: { id: Number(rows[0].id), deletedAt: null },
      select: taskSelect
    });
    if (!task) {
      return null;
    }
    const mapped = this.mapTask(task);
    this.lockedTasks.set(mapped.id, mapped);
    return mapped;
  }

  public async lockBudgetReservation(
    taskId: number
  ): Promise<AffiliateBudgetReservationRecord | null> {
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM affiliate_budget_reservations WHERE task_id = ${taskId} AND deleted_at IS NULL FOR UPDATE`
    );
    if (rows.length !== 1) {
      return null;
    }
    const reservation = await this.client.affiliateBudgetReservation.findFirst({
      where: { id: Number(rows[0].id), deletedAt: null },
      select: reservationSelect
    });
    if (!reservation) {
      return null;
    }
    const mapped = this.mapReservation(reservation);
    this.lockedReservations.set(mapped.taskId, mapped);
    return mapped;
  }

  public async markTaskEnded(input: {
    taskId: number;
    expectedStatus: "scheduled" | "active" | "paused" | "budget_exhausted";
    endedAt: Date;
  }): Promise<void> {
    const task = this.lockedTasks.get(input.taskId);
    if (!task || task.status !== input.expectedStatus) {
      this.throwConflict();
    }
    const update = await this.client.affiliateTask.updateMany({
      where: this.taskGuard(task, input.expectedStatus),
      data: {
        status: "ENDED",
        endedAt: input.endedAt,
        lockVersion: { increment: 1 }
      }
    });
    if (update.count !== 1) {
      this.throwConflict();
    }
    this.lockedTasks.set(input.taskId, { ...task, status: "ended", endedAt: input.endedAt });
  }

  public async recordBudgetRelease(input: {
    taskId: number;
    reservationId: number;
    releasedAfterNdp: number;
    platformFeeReleasedAfterNdp: number;
    reservationStatus: AffiliateBudgetStatus;
    releasedAt: Date | null;
  }): Promise<void> {
    const task = this.lockedTasks.get(input.taskId);
    const reservation = this.lockedReservations.get(input.taskId);
    if (
      !task ||
      !reservation ||
      reservation.id !== input.reservationId ||
      input.releasedAfterNdp < task.releasedBudgetNdp ||
      input.releasedAfterNdp < reservation.releasedNdp ||
      input.platformFeeReleasedAfterNdp < task.releasedPlatformFeeNdp ||
      input.platformFeeReleasedAfterNdp < reservation.platformFeeReleasedNdp
    ) {
      this.throwConflict();
    }
    const taskReleaseDelta = input.releasedAfterNdp - task.releasedBudgetNdp;
    const reservationReleaseDelta = input.releasedAfterNdp - reservation.releasedNdp;
    const taskPlatformFeeReleaseDelta =
      input.platformFeeReleasedAfterNdp - task.releasedPlatformFeeNdp;
    const reservationPlatformFeeReleaseDelta =
      input.platformFeeReleasedAfterNdp - reservation.platformFeeReleasedNdp;
    if (
      taskReleaseDelta !== reservationReleaseDelta ||
      taskPlatformFeeReleaseDelta !== reservationPlatformFeeReleaseDelta
    ) {
      this.throwConflict();
    }

    const taskUpdate = await this.client.affiliateTask.updateMany({
      where: this.taskGuard(task, task.status),
      data: {
        releasedBudgetNdp: { increment: taskReleaseDelta },
        releasedPlatformFeeNdp: { increment: taskPlatformFeeReleaseDelta }
      }
    });
    if (taskUpdate.count !== 1) {
      this.throwConflict();
    }

    const reservationUpdate = await this.client.affiliateBudgetReservation.updateMany({
      where: {
        id: reservation.id,
        taskId: input.taskId,
        status: this.budgetStatusToDb(reservation.status),
        totalFrozenNdp: reservation.totalFrozenNdp,
        commissionFrozenNdp: reservation.commissionFrozenNdp,
        platformFeeFrozenNdp: reservation.platformFeeFrozenNdp,
        allocatedNdp: reservation.allocatedNdp,
        capturedNdp: reservation.capturedNdp,
        platformFeeCapturedNdp: reservation.platformFeeCapturedNdp,
        releasedNdp: reservation.releasedNdp,
        platformFeeReleasedNdp: reservation.platformFeeReleasedNdp,
        deletedAt: null
      },
      data: {
        releasedNdp: { increment: reservationReleaseDelta },
        platformFeeReleasedNdp: { increment: reservationPlatformFeeReleaseDelta },
        status: this.budgetStatusToDb(input.reservationStatus),
        releasedAt: input.releasedAt
      }
    });
    if (reservationUpdate.count !== 1) {
      this.throwConflict();
    }

    this.lockedTasks.set(input.taskId, {
      ...task,
      releasedBudgetNdp: input.releasedAfterNdp,
      releasedPlatformFeeNdp: input.platformFeeReleasedAfterNdp
    });
    this.lockedReservations.set(input.taskId, {
      ...reservation,
      releasedNdp: input.releasedAfterNdp,
      platformFeeReleasedNdp: input.platformFeeReleasedAfterNdp,
      status: input.reservationStatus,
      releasedAt: input.releasedAt
    });
  }

  public async createBudgetTransactionLink(input: {
    reservationId: number;
    ledgerTransactionId: number;
    kind: "release";
    amountNdp: number;
  }): Promise<void> {
    await this.client.affiliateBudgetTransaction.create({
      data: {
        budgetReservationId: input.reservationId,
        ledgerTransactionId: input.ledgerTransactionId,
        kind: "RELEASE",
        amountNdp: input.amountNdp
      }
    });
  }

  public async createAuditLog(input: {
    actorUserId: number | null;
    action: string;
    taskId: number;
    metadata?: unknown;
  }): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: input.action,
        targetType: "affiliate_task",
        targetId: input.taskId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  private canStartTransaction(client: AffiliateTaskExpiryPrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }

  private taskGuard(
    task: AffiliateTaskExpiryTaskRecord,
    status: AffiliateTaskStatus
  ): Prisma.AffiliateTaskWhereInput {
    return {
      id: task.id,
      status: this.taskStatusToDb(status),
      totalBudgetNdp: task.totalBudgetNdp,
      reservedBudgetNdp: task.reservedBudgetNdp,
      allocatedBudgetNdp: task.allocatedBudgetNdp,
      settledBudgetNdp: task.settledBudgetNdp,
      releasedBudgetNdp: task.releasedBudgetNdp,
      platformFeeBps: task.platformFeeBps,
      platformFeeReserveNdp: task.platformFeeReserveNdp,
      settledPlatformFeeNdp: task.settledPlatformFeeNdp,
      releasedPlatformFeeNdp: task.releasedPlatformFeeNdp,
      deletedAt: null
    };
  }

  private taskStatusToDb(status: AffiliateTaskStatus): PrismaAffiliateTaskStatus {
    switch (status) {
      case "scheduled":
        return "SCHEDULED";
      case "active":
        return "ACTIVE";
      case "paused":
        return "PAUSED";
      case "budget_exhausted":
        return "BUDGET_EXHAUSTED";
      case "ended":
        return "ENDED";
      case "draft":
        return "DRAFT";
      case "pending_review":
        return "PENDING_REVIEW";
      case "cancelled":
        return "CANCELLED";
      case "rejected":
        return "REJECTED";
    }
  }

  private budgetStatusToDb(status: AffiliateBudgetStatus): PrismaAffiliateBudgetStatus {
    if (status === "active") {
      return "ACTIVE";
    }
    return status === "exhausted" ? "EXHAUSTED" : "RELEASED";
  }

  private mapTask(task: AffiliateTaskDbRecord): AffiliateTaskExpiryTaskRecord {
    return {
      id: task.id,
      publisherType: task.publisherType.toLowerCase() as AffiliatePublisherType,
      publisherMerchantAccountId: task.publisherMerchantAccountId,
      publisherShopId: task.publisherShopId,
      status: task.status.toLowerCase() as AffiliateTaskStatus,
      taskStartsAt: task.taskStartsAt,
      taskEndsAt: task.taskEndsAt,
      rewardNdpPerCompletedOrder: task.rewardNdpPerCompletedOrder,
      totalBudgetNdp: task.totalBudgetNdp,
      reservedBudgetNdp: task.reservedBudgetNdp,
      allocatedBudgetNdp: task.allocatedBudgetNdp,
      settledBudgetNdp: task.settledBudgetNdp,
      releasedBudgetNdp: task.releasedBudgetNdp,
      platformFeeBps: task.platformFeeBps,
      platformFeeReserveNdp: task.platformFeeReserveNdp,
      settledPlatformFeeNdp: task.settledPlatformFeeNdp,
      releasedPlatformFeeNdp: task.releasedPlatformFeeNdp,
      endedAt: task.endedAt
    };
  }

  private mapReservation(
    reservation: AffiliateBudgetReservationDbRecord
  ): AffiliateBudgetReservationRecord {
    return {
      id: reservation.id,
      taskId: reservation.taskId,
      walletId: reservation.walletId,
      totalFrozenNdp: reservation.totalFrozenNdp,
      commissionFrozenNdp: reservation.commissionFrozenNdp,
      platformFeeFrozenNdp: reservation.platformFeeFrozenNdp,
      allocatedNdp: reservation.allocatedNdp,
      capturedNdp: reservation.capturedNdp,
      platformFeeCapturedNdp: reservation.platformFeeCapturedNdp,
      releasedNdp: reservation.releasedNdp,
      platformFeeReleasedNdp: reservation.platformFeeReleasedNdp,
      status: reservation.status.toLowerCase() as AffiliateBudgetStatus,
      idempotencyKey: reservation.idempotencyKey,
      frozenAt: reservation.frozenAt,
      releasedAt: reservation.releasedAt
    };
  }

  private throwConflict(): never {
    throw new Error("error.affiliate.task_expiry_conflict");
  }
}
