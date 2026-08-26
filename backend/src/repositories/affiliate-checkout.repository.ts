import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliateCancellationAuditInput,
  AffiliateCancellationRecord,
  AffiliateCancellationReleaseInput,
  AffiliateCompletionAttributionStatus,
  AffiliateCompletionRecord,
  AffiliateCompletionRewardStatus,
  AffiliateCheckoutAttributionInput,
  AffiliateCheckoutAuditInput,
  AffiliateCheckoutBudgetStatus,
  AffiliateCheckoutClaimRecord,
  AffiliateCheckoutClaimStatus,
  AffiliateCheckoutRepositoryPort,
  AffiliateCheckoutSource,
  AffiliateCheckoutTaskStatus,
  AffiliateCheckoutTouchInput,
  AffiliateCheckoutTransactionClient,
  AffiliateRewardCaptureInput,
  AffiliateRewardQualificationInput,
  AffiliateRewardQualificationResult,
  AffiliateRewardSettlementAuditInput,
  AffiliateValidationSlotRecord
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

  public async resolvePromotion(input: {
    source: AffiliateCheckoutSource;
    lookupValue: string;
  }): Promise<AffiliateCheckoutClaimRecord | null> {
    const claim = await this.client.affiliateClaim.findFirst({
      where: {
        deletedAt: null,
        ...(input.source === "code"
          ? { publicCode: input.lookupValue }
          : { publicTokenId: input.lookupValue })
      },
      include: claimInclude
    });
    return claim ? this.mapClaim(claim) : null;
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

  public async findValidationSlot(
    scheduleSlotId: number
  ): Promise<AffiliateValidationSlotRecord | null> {
    const slot = await this.client.scheduleSlot.findFirst({
      where: {
        id: scheduleSlotId,
        deletedAt: null,
        status: "AVAILABLE",
        shop: {
          deletedAt: null,
          status: "published",
          entitySuspensions: {
            none: {
              activeKey: { not: null },
              status: "active",
              deletedAt: null
            }
          }
        }
      },
      include: {
        service: true,
        technicianService: true,
        shop: true
      }
    });
    if (!slot || slot.bookedCount >= slot.capacity) {
      return null;
    }
    const technicianPricing = slot.shop.pricingMode === "TECHNICIAN";
    if (technicianPricing) {
      const service = slot.technicianService;
      if (
        !service ||
        !service.sourceShopServiceId ||
        service.deletedAt ||
        !service.isActive ||
        !service.isBookable
      ) {
        return null;
      }
      return {
        shopId: slot.shopId,
        serviceId: service.sourceShopServiceId,
        originalPriceJpy: service.priceAmount,
        scheduledStartAt: slot.startsAt
      };
    }
    const service = slot.service;
    if (!service || service.deletedAt || service.status !== "published") {
      return null;
    }
    return {
      shopId: slot.shopId,
      serviceId: service.id,
      originalPriceJpy: Math.round(Number(service.priceAmount.toString())),
      scheduledStartAt: slot.startsAt
    };
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

  public async lockActiveAttributionForCancellation(
    bookingOrderId: number
  ): Promise<AffiliateCancellationRecord | null> {
    const rows = await this.client.$queryRaw<
      Array<{
        attributionId: number;
        taskId: number;
        claimId: number;
        rewardAllocatedNdp: number;
        taskStatus: string;
        taskStartsAt: Date;
        taskEndsAt: Date;
      }>
    >(
      Prisma.sql`
        SELECT attribution.id AS attributionId,
               attribution.task_id AS taskId,
               attribution.claim_id AS claimId,
               attribution.reward_allocated_ndp AS rewardAllocatedNdp,
               task.status AS taskStatus,
               task.task_starts_at AS taskStartsAt,
               task.task_ends_at AS taskEndsAt
        FROM affiliate_attributions AS attribution
        INNER JOIN affiliate_tasks AS task ON task.id = attribution.task_id
        INNER JOIN affiliate_budget_reservations AS reservation
          ON reservation.task_id = task.id
        WHERE attribution.booking_order_id = ${bookingOrderId}
          AND attribution.status = 'attributed'
          AND attribution.active_key IS NOT NULL
          AND attribution.deleted_at IS NULL
          AND task.deleted_at IS NULL
          AND reservation.deleted_at IS NULL
        FOR UPDATE
      `
    );
    const row = rows[0];
    return row
      ? {
          attributionId: Number(row.attributionId),
          taskId: Number(row.taskId),
          claimId: Number(row.claimId),
          rewardAllocatedNdp: Number(row.rewardAllocatedNdp),
          taskStatus: row.taskStatus.toLowerCase() as AffiliateCheckoutTaskStatus,
          taskStartsAt: row.taskStartsAt,
          taskEndsAt: row.taskEndsAt
        }
      : null;
  }

  public async lockAttributionForCompletion(
    bookingOrderId: number
  ): Promise<AffiliateCompletionRecord | null> {
    const rows = await this.client.$queryRaw<
      Array<{
        attributionId: number;
        attributionStatus: string;
        taskId: number;
        claimId: number;
        claimantUserId: number;
        customerUserId: number;
        shopId: number;
        serviceId: number;
        rewardAllocatedNdp: number;
        maxCompletedOrdersPerClaim: number | null;
        maxCompletedOrdersPerCustomer: number | null;
        claimCompletedOrderCount: number;
        reservationId: number;
        publisherWalletId: number;
        publisherOwnerType: string;
        publisherMerchantAccountId: number | null;
        publisherShopId: number | null;
        rewardId: number | null;
        rewardStatus: string | null;
        rewardNdp: number | null;
        rewardLedgerTransactionId: number | null;
        rewardPublisherWalletId: number | null;
        rewardClaimantWalletId: number | null;
      }>
    >(
      Prisma.sql`
        SELECT attribution.id AS attributionId,
               attribution.status AS attributionStatus,
               attribution.task_id AS taskId,
               attribution.claim_id AS claimId,
               attribution.claimant_user_id AS claimantUserId,
               attribution.customer_user_id AS customerUserId,
               attribution.shop_id AS shopId,
               attribution.service_id AS serviceId,
               attribution.reward_allocated_ndp AS rewardAllocatedNdp,
               task.max_completed_orders_per_claim AS maxCompletedOrdersPerClaim,
               task.max_completed_orders_per_customer AS maxCompletedOrdersPerCustomer,
               claim.completed_order_count AS claimCompletedOrderCount,
               reservation.id AS reservationId,
               reservation.wallet_id AS publisherWalletId,
               task.publisher_type AS publisherOwnerType,
               task.publisher_merchant_account_id AS publisherMerchantAccountId,
               task.publisher_shop_id AS publisherShopId,
               reward.id AS rewardId,
               reward.status AS rewardStatus,
               reward.reward_ndp AS rewardNdp,
               reward_transaction.ledger_transaction_id AS rewardLedgerTransactionId,
               reward.publisher_wallet_id AS rewardPublisherWalletId,
               reward.claimant_wallet_id AS rewardClaimantWalletId
        FROM affiliate_attributions AS attribution
        INNER JOIN affiliate_tasks AS task
          ON task.id = attribution.task_id
        INNER JOIN affiliate_claims AS claim
          ON claim.id = attribution.claim_id
        INNER JOIN affiliate_budget_reservations AS reservation
          ON reservation.task_id = task.id
        LEFT JOIN affiliate_rewards AS reward
          ON reward.attribution_id = attribution.id
         AND reward.deleted_at IS NULL
        LEFT JOIN affiliate_reward_transactions AS reward_transaction
          ON reward_transaction.reward_id = reward.id
         AND reward_transaction.kind = 'settlement'
         AND reward_transaction.deleted_at IS NULL
        WHERE attribution.booking_order_id = ${bookingOrderId}
          AND attribution.deleted_at IS NULL
          AND task.deleted_at IS NULL
          AND claim.deleted_at IS NULL
          AND reservation.deleted_at IS NULL
        LIMIT 2
        FOR UPDATE
      `
    );
    if (rows.length > 1) {
      throw new Error("error.affiliate.reward_settlement_conflict");
    }
    const row = rows[0];
    if (!row) {
      return null;
    }

    const publisherOwnerType = row.publisherOwnerType.toLowerCase() as
      | "merchant_account"
      | "shop";
    const publisherOwnerId =
      publisherOwnerType === "merchant_account"
        ? row.publisherMerchantAccountId
        : row.publisherShopId;
    if (!publisherOwnerId) {
      throw new Error("error.affiliate.reward_settlement_conflict");
    }

    return {
      attributionId: Number(row.attributionId),
      attributionStatus: row.attributionStatus.toLowerCase() as AffiliateCompletionAttributionStatus,
      taskId: Number(row.taskId),
      claimId: Number(row.claimId),
      claimantUserId: Number(row.claimantUserId),
      customerUserId: Number(row.customerUserId),
      shopId: Number(row.shopId),
      serviceId: Number(row.serviceId),
      rewardAllocatedNdp: Number(row.rewardAllocatedNdp),
      maxCompletedOrdersPerClaim:
        row.maxCompletedOrdersPerClaim === null
          ? null
          : Number(row.maxCompletedOrdersPerClaim),
      maxCompletedOrdersPerCustomer:
        row.maxCompletedOrdersPerCustomer === null
          ? null
          : Number(row.maxCompletedOrdersPerCustomer),
      claimCompletedOrderCount: Number(row.claimCompletedOrderCount),
      reservationId: Number(row.reservationId),
      publisherWalletId: Number(row.publisherWalletId),
      publisherOwnerType,
      publisherOwnerId: Number(publisherOwnerId),
      rewardId: row.rewardId === null ? null : Number(row.rewardId),
      rewardStatus:
        row.rewardStatus === null
          ? null
          : (row.rewardStatus.toLowerCase() as AffiliateCompletionRewardStatus),
      rewardNdp: row.rewardNdp === null ? null : Number(row.rewardNdp),
      rewardLedgerTransactionId:
        row.rewardLedgerTransactionId === null
          ? null
          : Number(row.rewardLedgerTransactionId),
      rewardPublisherWalletId:
        row.rewardPublisherWalletId === null
          ? null
          : Number(row.rewardPublisherWalletId),
      rewardClaimantWalletId:
        row.rewardClaimantWalletId === null
          ? null
          : Number(row.rewardClaimantWalletId)
    };
  }

  public countSettledCustomerOrders(input: {
    taskId: number;
    customerUserId: number;
  }): Promise<number> {
    return this.client.affiliateAttribution.count({
      where: {
        taskId: input.taskId,
        customerUserId: input.customerUserId,
        status: "SETTLED",
        deletedAt: null
      }
    });
  }

  public async qualifyAttributionAndCreateReward(
    input: AffiliateRewardQualificationInput
  ): Promise<AffiliateRewardQualificationResult> {
    const claimantWallet = await this.client.wallet.upsert({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: input.claimantUserId,
          currency: "NDP"
        }
      },
      create: {
        ownerType: "USER",
        ownerId: input.claimantUserId,
        currency: "NDP"
      },
      update: { deletedAt: null }
    });
    const attribution = await this.client.affiliateAttribution.updateMany({
      where: {
        id: input.attributionId,
        taskId: input.taskId,
        claimId: input.claimId,
        bookingOrderId: input.bookingOrderId,
        status: "ATTRIBUTED",
        deletedAt: null
      },
      data: {
        status: "QUALIFIED",
        qualifiedAt: input.qualifiedAt
      }
    });
    if (attribution.count !== 1) {
      throw new Error("error.affiliate.reward_settlement_conflict");
    }

    const reward = await this.client.affiliateReward.create({
      data: {
        attributionId: input.attributionId,
        taskId: input.taskId,
        claimId: input.claimId,
        bookingOrderId: input.bookingOrderId,
        publisherWalletId: input.publisherWalletId,
        claimantWalletId: claimantWallet.id,
        rewardNdp: input.rewardNdp,
        status: "PENDING"
      },
      select: { id: true }
    });

    return {
      rewardId: reward.id,
      publisherWalletId: input.publisherWalletId,
      claimantWalletId: claimantWallet.id
    };
  }

  public async settleRewardAndCaptureBudget(
    input: AffiliateRewardCaptureInput
  ): Promise<void> {
    const attribution = await this.client.affiliateAttribution.updateMany({
      where: {
        id: input.attributionId,
        taskId: input.taskId,
        claimId: input.claimId,
        status: "QUALIFIED",
        deletedAt: null
      },
      data: {
        status: "SETTLED",
        settledAt: input.settledAt
      }
    });
    const reward = await this.client.affiliateReward.updateMany({
      where: {
        id: input.rewardId,
        attributionId: input.attributionId,
        taskId: input.taskId,
        claimId: input.claimId,
        rewardNdp: input.rewardNdp,
        status: "PENDING",
        deletedAt: null
      },
      data: {
        status: "SETTLED",
        settledAt: input.settledAt
      }
    });
    const reservation = await this.client.affiliateBudgetReservation.updateMany({
      where: {
        id: input.reservationId,
        taskId: input.taskId,
        allocatedNdp: { gte: input.rewardNdp },
        deletedAt: null
      },
      data: {
        allocatedNdp: { decrement: input.rewardNdp },
        capturedNdp: { increment: input.rewardNdp }
      }
    });
    const task = await this.client.affiliateTask.updateMany({
      where: {
        id: input.taskId,
        allocatedBudgetNdp: { gte: input.rewardNdp },
        deletedAt: null
      },
      data: {
        allocatedBudgetNdp: { decrement: input.rewardNdp },
        settledBudgetNdp: { increment: input.rewardNdp }
      }
    });
    const claim = await this.client.affiliateClaim.updateMany({
      where: {
        id: input.claimId,
        taskId: input.taskId,
        deletedAt: null
      },
      data: {
        completedOrderCount: { increment: 1 },
        settledRewardNdp: { increment: input.rewardNdp }
      }
    });

    if (
      attribution.count !== 1 ||
      reward.count !== 1 ||
      reservation.count !== 1 ||
      task.count !== 1 ||
      claim.count !== 1
    ) {
      throw new Error("error.affiliate.reward_settlement_conflict");
    }

    await this.client.affiliateBudgetTransaction.create({
      data: {
        budgetReservationId: input.reservationId,
        ledgerTransactionId: input.ledgerTransactionId,
        kind: "SETTLEMENT",
        amountNdp: input.rewardNdp
      }
    });
    await this.client.affiliateRewardTransaction.create({
      data: {
        rewardId: input.rewardId,
        ledgerTransactionId: input.ledgerTransactionId,
        kind: "SETTLEMENT",
        amountNdp: input.rewardNdp
      }
    });
  }

  public async createRewardSettlementAudit(
    input: AffiliateRewardSettlementAuditInput
  ): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: "affiliate.reward.settled",
        targetType: "booking_order",
        targetId: input.bookingOrderId,
        metadata: {
          attributionId: input.attributionId,
          taskId: input.taskId,
          claimId: input.claimId,
          rewardId: input.rewardId,
          ledgerTransactionId: input.ledgerTransactionId,
          rewardSettledNdp: input.rewardSettledNdp
        }
      }
    });
  }

  public async invalidateAttributionAndRelease(
    input: AffiliateCancellationReleaseInput
  ): Promise<void> {
    const attribution = await this.client.affiliateAttribution.updateMany({
      where: {
        id: input.attributionId,
        taskId: input.taskId,
        status: "ATTRIBUTED",
        activeKey: { not: null },
        deletedAt: null
      },
      data: {
        status: "INVALIDATED",
        activeKey: null,
        invalidatedAt: input.invalidatedAt,
        invalidationReason: input.reason
      }
    });
    if (attribution.count !== 1) {
      throw new Error("error.affiliate.attribution_release_conflict");
    }

    const reservation = await this.client.affiliateBudgetReservation.updateMany({
      where: {
        taskId: input.taskId,
        deletedAt: null,
        allocatedNdp: { gte: input.rewardNdp }
      },
      data: {
        allocatedNdp: { decrement: input.rewardNdp },
        ...(input.restoreTaskStatus ? { status: "ACTIVE" as const } : {})
      }
    });
    if (reservation.count !== 1) {
      throw new Error("error.affiliate.attribution_release_conflict");
    }

    const task = await this.client.affiliateTask.updateMany({
      where: {
        id: input.taskId,
        deletedAt: null,
        allocatedBudgetNdp: { gte: input.rewardNdp },
        ...(input.restoreTaskStatus ? { status: "BUDGET_EXHAUSTED" as const } : {})
      },
      data: {
        allocatedBudgetNdp: { decrement: input.rewardNdp },
        ...(input.restoreTaskStatus
          ? {
              status:
                input.restoreTaskStatus === "scheduled" ? "SCHEDULED" : "ACTIVE"
            }
          : {})
      }
    });
    if (task.count !== 1) {
      throw new Error("error.affiliate.attribution_release_conflict");
    }
  }

  public async createInvalidationAudit(
    input: AffiliateCancellationAuditInput
  ): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: "affiliate.attribution.invalidated",
        targetType: "booking_order",
        targetId: input.bookingOrderId,
        metadata: {
          attributionId: input.attributionId,
          taskId: input.taskId,
          claimId: input.claimId,
          rewardReleasedNdp: input.rewardReleasedNdp,
          reason: input.reason
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
