import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliateCheckoutAttributionInput,
  AffiliateCheckoutAuditInput,
  AffiliateCheckoutBudgetStatus,
  AffiliateCheckoutClaimRecord,
  AffiliateCheckoutClaimStatus,
  AffiliateCheckoutRepositoryPort,
  AffiliateCheckoutSource,
  AffiliateCheckoutTaskStatus,
  AffiliateCheckoutTouchInput,
  AffiliateCheckoutTransactionClient
} from "../services/affiliate-checkout.service";

type AffiliateCheckoutPrismaClient = PrismaClient | Prisma.TransactionClient;

const claimInclude = {
  task: {
    include: {
      budgetReservation: true
    }
  }
} satisfies Prisma.AffiliateClaimInclude;

type AffiliateCheckoutClaimDbRecord = Prisma.AffiliateClaimGetPayload<{
  include: typeof claimInclude;
}>;

export class AffiliateCheckoutRepository implements AffiliateCheckoutRepositoryPort {
  public constructor(
    private readonly client: AffiliateCheckoutPrismaClient = prisma
  ) {}

  public forTransaction(
    transactionClient: AffiliateCheckoutTransactionClient
  ): AffiliateCheckoutRepositoryPort {
    return new AffiliateCheckoutRepository(
      transactionClient as AffiliateCheckoutPrismaClient
    );
  }

  public async resolveAndLockPromotion(input: {
    source: AffiliateCheckoutSource;
    lookupValue: string;
  }): Promise<AffiliateCheckoutClaimRecord | null> {
    const lookup =
      input.source === "code"
        ? Prisma.sql`claim.public_code = ${input.lookupValue}`
        : Prisma.sql`claim.public_token_id = ${input.lookupValue}`;
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT claim.id
        FROM affiliate_claims AS claim
        INNER JOIN affiliate_tasks AS task ON task.id = claim.task_id
        INNER JOIN affiliate_budget_reservations AS reservation
          ON reservation.task_id = task.id
        WHERE ${lookup}
          AND claim.deleted_at IS NULL
          AND task.deleted_at IS NULL
          AND reservation.deleted_at IS NULL
        FOR UPDATE
      `
    );
    if (rows.length !== 1) {
      return null;
    }
    const claim = await this.client.affiliateClaim.findFirst({
      where: { id: Number(rows[0].id), deletedAt: null },
      include: claimInclude
    });
    return claim ? this.mapClaim(claim) : null;
  }

  public async serviceIsInTaskScope(
    taskId: number,
    shopId: number,
    serviceId: number
  ): Promise<boolean> {
    const [taskShop, taskService] = await Promise.all([
      this.client.affiliateTaskShop.findFirst({
        where: { taskId, shopId, deletedAt: null },
        select: { id: true }
      }),
      this.client.affiliateTaskService.findFirst({
        where: { taskId, shopId, serviceId, deletedAt: null },
        select: { id: true }
      })
    ]);
    return Boolean(taskShop && taskService);
  }

  public async createTouch(input: AffiliateCheckoutTouchInput): Promise<number> {
    const touch = await this.client.affiliateTouch.create({
      data: {
        taskId: input.taskId,
        claimId: input.claimId,
        claimantUserId: input.claimantUserId,
        customerUserId: input.customerUserId,
        source: this.sourceToDb(input.source),
        shopId: input.shopId,
        serviceId: input.serviceId,
        occurredAt: input.occurredAt,
        expiresAt: input.expiresAt
      },
      select: { id: true }
    });
    return touch.id;
  }

  public async createAttribution(
    input: AffiliateCheckoutAttributionInput
  ): Promise<void> {
    await this.client.affiliateAttribution.create({
      data: {
        taskId: input.taskId,
        claimId: input.claimId,
        touchId: input.touchId,
        bookingOrderId: input.bookingOrderId,
        activeKey: input.activeKey,
        claimantUserId: input.claimantUserId,
        customerUserId: input.customerUserId,
        shopId: input.shopId,
        serviceId: input.serviceId,
        source: this.sourceToDb(input.source),
        originalPriceJpy: input.originalPriceJpy,
        customerDiscountJpy: input.customerDiscountJpy,
        finalPriceJpy: input.finalPriceJpy,
        rewardAllocatedNdp: input.rewardAllocatedNdp,
        status: "ATTRIBUTED",
        attributedAt: input.attributedAt,
        expiresAt: input.expiresAt
      }
    });
  }

  public async allocateAttribution(input: {
    taskId: number;
    claimId: number;
    rewardNdp: number;
    source: AffiliateCheckoutSource;
  }): Promise<void> {
    const reservationUpdated = await this.client.$executeRaw(
      Prisma.sql`
        UPDATE affiliate_budget_reservations
        SET allocated_ndp = allocated_ndp + ${input.rewardNdp},
            status = CASE
              WHEN total_frozen_ndp
                - (allocated_ndp + ${input.rewardNdp})
                - captured_ndp
                - released_ndp < ${input.rewardNdp}
              THEN 'exhausted'
              ELSE status
            END,
            updated_at = CURRENT_TIMESTAMP(3)
        WHERE task_id = ${input.taskId}
          AND deleted_at IS NULL
          AND status = 'active'
          AND total_frozen_ndp
            - allocated_ndp
            - captured_ndp
            - released_ndp >= ${input.rewardNdp}
      `
    );
    if (Number(reservationUpdated) !== 1) {
      throw new Error("error.affiliate.budget_unavailable");
    }

    const taskUpdated = await this.client.$executeRaw(
      Prisma.sql`
        UPDATE affiliate_tasks AS task
        SET allocated_budget_ndp = allocated_budget_ndp + ${input.rewardNdp},
            status = CASE
              WHEN (
                SELECT reservation.total_frozen_ndp
                  - reservation.allocated_ndp
                  - reservation.captured_ndp
                  - reservation.released_ndp
                FROM affiliate_budget_reservations AS reservation
                WHERE reservation.task_id = task.id
                  AND reservation.deleted_at IS NULL
              ) < task.reward_ndp_per_completed_order
              THEN 'budget_exhausted'
              ELSE status
            END,
            updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ${input.taskId}
          AND deleted_at IS NULL
          AND status IN ('scheduled', 'active')
      `
    );
    if (Number(taskUpdated) !== 1) {
      throw new Error("error.affiliate.budget_unavailable");
    }

    const claimUpdated = await this.client.affiliateClaim.updateMany({
      where: {
        id: input.claimId,
        taskId: input.taskId,
        status: "ACTIVE",
        deletedAt: null
      },
      data: {
        attributedOrderCount: { increment: 1 },
        ...(input.source === "code"
          ? { codeUseCount: { increment: 1 } }
          : {})
      }
    });
    if (claimUpdated.count !== 1) {
      throw new Error("error.affiliate.promotion_invalid");
    }
  }

  public async createAttributionAudit(
    input: AffiliateCheckoutAuditInput
  ): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: "affiliate.attribution.created",
        targetType: "booking_order",
        targetId: input.bookingOrderId,
        metadata: {
          taskId: input.taskId,
          claimId: input.claimId,
          publicCode: input.publicCode,
          source: input.source,
          originalPriceJpy: input.originalPriceJpy,
          customerDiscountJpy: input.customerDiscountJpy,
          finalPriceJpy: input.finalPriceJpy,
          rewardAllocatedNdp: input.rewardAllocatedNdp
        }
      }
    });
  }

  private mapClaim(claim: AffiliateCheckoutClaimDbRecord): AffiliateCheckoutClaimRecord {
    const reservation = claim.task.budgetReservation;
    return {
      id: claim.id,
      taskId: claim.taskId,
      claimantUserId: claim.userId,
      publicCode: claim.publicCode,
      publicTokenId: claim.publicTokenId,
      tokenHash: claim.tokenHash,
      status: claim.status.toLowerCase() as AffiliateCheckoutClaimStatus,
      expiresAt: claim.expiresAt,
      task: {
        id: claim.task.id,
        status: claim.task.status.toLowerCase() as AffiliateCheckoutTaskStatus,
        rewardNdpPerCompletedOrder:
          claim.task.rewardNdpPerCompletedOrder,
        customerDiscountType: claim.task.customerDiscountType.toLowerCase() as
          | "none"
          | "fixed_jpy"
          | "percent",
        fixedDiscountJpy: claim.task.fixedDiscountJpy,
        discountRateBps: claim.task.discountRateBps,
        discountCapJpy: claim.task.discountCapJpy,
        minimumOrderAmountJpy: claim.task.minimumOrderAmountJpy,
        taskStartsAt: claim.task.taskStartsAt,
        taskEndsAt: claim.task.taskEndsAt,
        attributionWindowDays: claim.task.attributionWindowDays,
        budgetReservation:
          reservation && !reservation.deletedAt
            ? {
                id: reservation.id,
                status: reservation.status.toLowerCase() as AffiliateCheckoutBudgetStatus,
                totalFrozenNdp: reservation.totalFrozenNdp,
                allocatedNdp: reservation.allocatedNdp,
                capturedNdp: reservation.capturedNdp,
                releasedNdp: reservation.releasedNdp
              }
            : null
      }
    };
  }

  private sourceToDb(source: AffiliateCheckoutSource): "CODE" | "URL" {
    return source === "code" ? "CODE" : "URL";
  }
}
