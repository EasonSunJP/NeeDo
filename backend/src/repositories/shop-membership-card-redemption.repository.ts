import {
  BookingOrderStatus,
  Prisma,
  ServicePaymentStatus,
  ShopCustomerMembershipStatus,
  ShopMembershipCardAdjustmentStatus,
  ShopMembershipCardPlanVersionStatus,
  ShopMembershipCardRedemptionStatus,
  ShopMembershipCardRewardStatus,
  ShopMembershipCardStatus,
  ShopMembershipCardType,
  ShopMembershipRewardReversalMode,
  type PrismaClient
} from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  MembershipRewardPreviewFacts,
  MembershipRewardRuleHit
} from "../domain/shop-membership-reward-rule";
import { prisma } from "../prisma/client";
import type {
  CreateShopMembershipCardRedemptionRepositoryInput,
  MembershipRewardEvaluator,
  MembershipRewardSettlement,
  ShopMembershipCardRedemptionCandidateContext,
  ShopMembershipCardRedemptionListInput,
  ShopMembershipCardRedemptionRecord,
  ShopMembershipCardRedemptionRepositoryPort
} from "../services/shop-membership-card-redemption.service";
import type {
  PendingShopMembershipReward,
  ShopMembershipRewardDebtRepositoryPort
} from "../services/shop-membership-reward-debt-allocator.service";
import { AppError } from "../utils/app-error";
import {
  buildPaginatedResponse,
  toPrismaPagination,
  type PaginationInput
} from "../utils/pagination";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import { toAuditLogCreateData } from "./audit-log.repository";
import { resolveCanonicalPersonalIdentityId } from "./personal-identity-scope.repository";

const cardSelect = Prisma.validator<Prisma.ShopMembershipCardSelect>()({
  id: true,
  publicId: true,
  cardNo: true,
  name: true,
  type: true,
  status: true,
  principalBalanceJpy: true,
  bonusBalanceJpy: true,
  remainingUses: true,
  expiresAt: true,
  lockVersion: true,
  platformFeeRateBpsSnapshot: true,
  membership: {
    select: {
      status: true,
      shop: { select: { id: true, shopNo: true, name: true } },
      customerProfile: {
        select: {
          displayName: true,
          user: { select: { id: true, needoId: true } }
        }
      }
    }
  },
  planVersion: {
    select: {
      id: true,
      status: true,
      cardType: true,
      rewardCaps: true,
      platformFeeRateBps: true,
      publishedAt: true,
      deletedAt: true,
      rules: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { config: true }
      }
    }
  }
});

const orderSelect = Prisma.validator<Prisma.BookingOrderSelect>()({
  id: true,
  orderNo: true,
  customerUserId: true,
  shopId: true,
  status: true,
  priceAmount: true,
  currency: true,
  serviceNameSnapshot: true,
  startsAt: true,
  endsAt: true,
  service: {
    select: {
      publicId: true,
      category: { select: { code: true } }
    }
  },
  technicianService: {
    select: {
      sourceShopService: { select: { publicId: true } },
      category: { select: { code: true } }
    }
  },
  statusHistory: {
    where: { toStatus: BookingOrderStatus.COMPLETED, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: { createdAt: true }
  }
});

const redemptionSelect = Prisma.validator<Prisma.ShopMembershipCardRedemptionSelect>()({
  id: true,
  publicId: true,
  requestFingerprint: true,
  status: true,
  rewardStatus: true,
  rewardFacts: true,
  rewardHits: true,
  rawRewardNdp: true,
  customerRewardNdp: true,
  platformFeeRateBps: true,
  platformFeeNdp: true,
  totalShopDebitNdp: true,
  rewardCapped: true,
  outstandingRewardNdp: true,
  consumedPrincipalJpy: true,
  consumedUses: true,
  principalBalanceBeforeJpy: true,
  principalBalanceAfterJpy: true,
  remainingUsesBefore: true,
  remainingUsesAfter: true,
  orderNoSnapshot: true,
  serviceNameSnapshot: true,
  servicePublicId: true,
  serviceCategoryCode: true,
  serviceStartedAt: true,
  serviceCompletedAt: true,
  eligibleAmountJpy: true,
  redeemedAt: true,
  rewardSettledAt: true,
  refundedAt: true,
  createdAt: true,
  updatedAt: true,
  card: {
    select: {
      publicId: true,
      cardNo: true,
      name: true,
      type: true,
      status: true,
      principalBalanceJpy: true,
      bonusBalanceJpy: true,
      remainingUses: true,
      lockVersion: true
    }
  },
  shop: { select: { shopNo: true, name: true } },
  customer: {
    select: { id: true, needoId: true, customerProfile: { select: { displayName: true } } }
  },
  redeemedBy: { select: { needoId: true, username: true } },
  ledgerTransaction: { select: { transactionNo: true } },
  bookingOrder: {
    select: { paymentStatus: true, paymentRefundedAt: true }
  },
  refund: {
    select: {
      publicId: true,
      reason: true,
      reversalMode: true,
      restoredPrincipalJpy: true,
      restoredUses: true,
      customerRewardReversedNdp: true,
      platformFeeReversedNdp: true,
      totalShopCreditNdp: true,
      customerBalanceBeforeNdp: true,
      customerBalanceAfterNdp: true,
      refundedAt: true,
      refundedBy: { select: { needoId: true, username: true } },
      reversalLedgerTransaction: { select: { transactionNo: true } }
    }
  }
});

type CardRecord = Prisma.ShopMembershipCardGetPayload<{ select: typeof cardSelect }>;
type OrderRecord = Prisma.BookingOrderGetPayload<{ select: typeof orderSelect }>;
type RedemptionRecord = Prisma.ShopMembershipCardRedemptionGetPayload<{
  select: typeof redemptionSelect;
}>;

export class ShopMembershipCardRedemptionRepository
  implements ShopMembershipCardRedemptionRepositoryPort, ShopMembershipRewardDebtRepositoryPort
{
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findByIdempotencyKey(
    shopId: number,
    idempotencyKey: string
  ): Promise<ShopMembershipCardRedemptionRecord | null> {
    const record = await this.client.shopMembershipCardRedemption.findFirst({
      where: { shopId, idempotencyKey, deletedAt: null },
      select: redemptionSelect
    });
    return record ? this.mapRedemption(record) : null;
  }

  public async listCandidates(shopId: number, cardPublicId: string, input: PaginationInput) {
    const databaseNow = await this.getDatabaseNow(this.client);
    const card = await this.loadCard(this.client, shopId, cardPublicId);
    if (!card) throw this.notFoundError();
    if (!this.isCardEligible(card, databaseNow)) throw this.invalidStateError();
    const pendingAdjustment = await this.client.shopMembershipCardAdjustmentRequest.findFirst({
      where: {
        cardId: card.id,
        status: ShopMembershipCardAdjustmentStatus.PENDING,
        expiresAt: { gt: databaseNow },
        deletedAt: null
      },
      select: { id: true }
    });
    if (pendingAdjustment) throw this.pendingConflictError();

    if (
      (card.type === ShopMembershipCardType.STORED_VALUE &&
        (card.principalBalanceJpy === null || card.principalBalanceJpy <= 0)) ||
      (card.type === ShopMembershipCardType.COUNT &&
        (card.remainingUses === null || card.remainingUses < 1))
    ) {
      return buildPaginatedResponse([], 0, input);
    }

    const where: Prisma.BookingOrderWhereInput = {
      shopId,
      customerUserId: card.membership.customerProfile.user.id,
      status: BookingOrderStatus.COMPLETED,
      currency: "JPY",
      priceAmount: {
        gt: 0,
        ...(card.type === ShopMembershipCardType.STORED_VALUE
          ? { lte: card.principalBalanceJpy! }
          : {})
      },
      membershipCardRedemption: null,
      deletedAt: null
    };
    const pagination = toPrismaPagination(input);
    const [orders, total] = await Promise.all([
      this.client.bookingOrder.findMany({
        where,
        orderBy: [{ endsAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: orderSelect
      }),
      this.client.bookingOrder.count({ where })
    ]);
    const contexts = await Promise.all(
      orders.map((order) => this.buildCandidateContext(this.client, card, order))
    );
    return buildPaginatedResponse(
      contexts.filter((context): context is ShopMembershipCardRedemptionCandidateContext =>
        Boolean(context)
      ),
      total,
      input
    );
  }

  public async createWithEvaluationAndSettlement(
    input: CreateShopMembershipCardRedemptionRepositoryInput,
    evaluate: MembershipRewardEvaluator,
    settle: MembershipRewardSettlement
  ) {
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => {
          const replay = await transaction.shopMembershipCardRedemption.findFirst({
            where: { shopId: input.shopId, idempotencyKey: input.idempotencyKey, deletedAt: null },
            select: redemptionSelect
          });
          if (replay) {
            return replay.requestFingerprint === input.requestFingerprint
              ? { kind: "replayed" as const, value: this.mapRedemption(replay) }
              : { kind: "idempotency_conflict" as const };
          }

          const candidateCard = await this.loadCard(transaction, input.shopId, input.cardPublicId);
          if (!candidateCard) return { kind: "not_found" as const };
          const lockedCardRows = await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM shop_membership_cards WHERE id = ${candidateCard.id} AND deleted_at IS NULL FOR UPDATE`
          );
          if (lockedCardRows.length !== 1) return { kind: "not_found" as const };
          const databaseNow = await this.getDatabaseNow(transaction);
          const card = await this.loadCard(transaction, input.shopId, input.cardPublicId);
          if (!card) return { kind: "not_found" as const };
          if (!this.isCardEligible(card, databaseNow)) return { kind: "invalid_state" as const };
          const pendingAdjustment = await transaction.shopMembershipCardAdjustmentRequest.findFirst(
            {
              where: {
                cardId: card.id,
                status: ShopMembershipCardAdjustmentStatus.PENDING,
                expiresAt: { gt: databaseNow },
                deletedAt: null
              },
              select: { id: true }
            }
          );
          if (pendingAdjustment) return { kind: "pending_conflict" as const };

          const candidateOrder = await this.loadOrder(
            transaction,
            input.shopId,
            card.membership.customerProfile.user.id,
            input.orderNo
          );
          if (!candidateOrder) return { kind: "order_not_eligible" as const };
          const lockedOrderRows = await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM booking_orders WHERE id = ${candidateOrder.id} AND deleted_at IS NULL FOR UPDATE`
          );
          if (lockedOrderRows.length !== 1) return { kind: "order_not_eligible" as const };
          const order = await this.loadOrder(
            transaction,
            input.shopId,
            card.membership.customerProfile.user.id,
            input.orderNo
          );
          if (!order) return { kind: "order_not_eligible" as const };
          const duplicate = await transaction.shopMembershipCardRedemption.findFirst({
            where: { bookingOrderId: order.id, deletedAt: null },
            select: { id: true }
          });
          if (duplicate) return { kind: "order_not_eligible" as const };

          const orderAmountJpy = Number(order.priceAmount.toString());
          if (Number.isSafeInteger(orderAmountJpy) && orderAmountJpy > 0) {
            if (
              card.type === ShopMembershipCardType.STORED_VALUE &&
              (card.principalBalanceJpy === null || card.principalBalanceJpy < orderAmountJpy)
            ) {
              return { kind: "insufficient_card_value" as const };
            }
            if (
              card.type === ShopMembershipCardType.COUNT &&
              (card.remainingUses === null || card.remainingUses < 1)
            ) {
              return { kind: "insufficient_card_value" as const };
            }
          }

          const context = await this.buildCandidateContext(transaction, card, order);
          if (!context) return { kind: "order_not_eligible" as const };
          if (
            (card.type === ShopMembershipCardType.STORED_VALUE &&
              context.consumedPrincipalJpy <= 0) ||
            (card.type === ShopMembershipCardType.COUNT && context.consumedUses !== 1)
          ) {
            return { kind: "insufficient_card_value" as const };
          }
          const reward = evaluate(context);
          const updatedCard = await transaction.shopMembershipCard.updateMany({
            where: {
              id: card.id,
              lockVersion: card.lockVersion,
              status: ShopMembershipCardStatus.ACTIVE,
              deletedAt: null,
              ...(card.type === ShopMembershipCardType.STORED_VALUE
                ? { principalBalanceJpy: context.principalBalanceBeforeJpy }
                : card.type === ShopMembershipCardType.COUNT
                  ? { remainingUses: context.remainingUsesBefore }
                  : {})
            },
            data: {
              ...(card.type === ShopMembershipCardType.STORED_VALUE
                ? { principalBalanceJpy: context.principalBalanceAfterJpy }
                : card.type === ShopMembershipCardType.COUNT
                  ? { remainingUses: context.remainingUsesAfter }
                  : {}),
              lockVersion: { increment: 1 }
            }
          });
          if (updatedCard.count !== 1) return { kind: "concurrency_conflict" as const };

          const created = await transaction.shopMembershipCardRedemption.create({
            data: {
              cardId: card.id,
              shopId: input.shopId,
              customerUserId: card.membership.customerProfile.user.id,
              bookingOrderId: order.id,
              planVersionId: card.planVersion!.id,
              redeemedById: input.actorId,
              orderNoSnapshot: context.orderNo,
              serviceNameSnapshot: context.serviceName,
              servicePublicId: context.servicePublicId,
              serviceCategoryCode: context.serviceCategoryCode,
              serviceStartedAt: context.serviceStartedAt,
              serviceCompletedAt: context.serviceCompletedAt,
              eligibleAmountJpy: context.eligibleAmountJpy,
              consumedPrincipalJpy: context.consumedPrincipalJpy,
              consumedUses: context.consumedUses,
              principalBalanceBeforeJpy: context.principalBalanceBeforeJpy,
              principalBalanceAfterJpy: context.principalBalanceAfterJpy,
              remainingUsesBefore: context.remainingUsesBefore,
              remainingUsesAfter: context.remainingUsesAfter,
              cardLockVersionBefore: context.cardLockVersionBefore,
              rewardFacts: context.facts as unknown as Prisma.InputJsonValue,
              rewardHits: reward.hits as unknown as Prisma.InputJsonValue,
              rawRewardNdp: reward.rawCustomerRewardNdp,
              customerRewardNdp: reward.customerRewardNdp,
              platformFeeRateBps: reward.platformFeeRateBps,
              platformFeeNdp: reward.platformFeeNdp,
              totalShopDebitNdp: reward.totalShopDebitNdp,
              rewardCapped: reward.capped,
              rewardStatus:
                reward.totalShopDebitNdp > 0
                  ? ShopMembershipCardRewardStatus.PENDING_FUNDS
                  : ShopMembershipCardRewardStatus.NONE,
              outstandingRewardNdp: reward.totalShopDebitNdp,
              status: ShopMembershipCardRedemptionStatus.APPLIED,
              redeemedAt: databaseNow,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: input.requestFingerprint,
              createdAt: databaseNow
            },
            select: { id: true, publicId: true }
          });

          let settlementResult = null;
          if (reward.totalShopDebitNdp > 0) {
            settlementResult = await settle(
              {
                redemptionId: created.id,
                shopId: input.shopId,
                customerUserId: card.membership.customerProfile.user.id,
                customerRewardNdp: reward.customerRewardNdp,
                platformFeeNdp: reward.platformFeeNdp,
                platformFeeRateBps: reward.platformFeeRateBps,
                idempotencyKey: `membership-redemption:${created.id}:reward:settlement`,
                actorUserId: input.actorId
              },
              transaction
            );
          }
          if (settlementResult) {
            await transaction.shopMembershipCardRedemption.update({
              where: { id: created.id },
              data: {
                rewardStatus: ShopMembershipCardRewardStatus.PAID,
                outstandingRewardNdp: 0,
                shopWalletId: settlementResult.shopWalletId,
                customerWalletId: settlementResult.customerWalletId,
                platformWalletId: settlementResult.platformWalletId,
                ledgerTransactionId: settlementResult.transaction.id,
                rewardSettledAt: databaseNow
              }
            });
          }

          const recipientUserId = card.membership.customerProfile.user.id;
          const recipientIdentityId = await resolveCanonicalPersonalIdentityId(
            transaction,
            recipientUserId
          );
          const actorIdentityId = await resolveCanonicalPersonalIdentityId(
            transaction,
            input.actorId
          );
          if (!recipientIdentityId || !actorIdentityId) {
            throw new AppError({
              code: ERROR_CODES.IDENTITY_NOT_FOUND,
              message: "error.auth.identity_not_found",
              statusCode: 403
            });
          }
          const metadata = {
            ...this.metadata(input.audit.metadata),
            redemptionPublicId: created.publicId,
            cardPublicId: card.publicId,
            orderNo: order.orderNo,
            shopNo: card.membership.shop.shopNo,
            customerNeedoId: card.membership.customerProfile.user.needoId,
            consumedPrincipalJpy: context.consumedPrincipalJpy,
            consumedUses: context.consumedUses,
            customerRewardNdp: reward.customerRewardNdp,
            platformFeeNdp: reward.platformFeeNdp,
            totalShopDebitNdp: reward.totalShopDebitNdp,
            rewardStatus: settlementResult
              ? "paid"
              : reward.totalShopDebitNdp > 0
                ? "pending_funds"
                : "none"
          };
          await transaction.auditLog.create({
            data: {
              ...toAuditLogCreateData({ ...input.audit, targetId: created.id, metadata }),
              createdAt: databaseNow
            }
          });
          await transaction.notification.create({
            data: {
              recipientUserId,
              recipientIdentityId,
              actorUserId: input.actorId,
              actorIdentityId,
              type: "SYSTEM",
              title: "shop_membership.card_redemption.created.title",
              body: "shop_membership.card_redemption.created.body",
              payload: metadata,
              createdAt: databaseNow
            }
          });
          const persisted = await transaction.shopMembershipCardRedemption.findUniqueOrThrow({
            where: { id: created.id },
            select: redemptionSelect
          });
          return { kind: "created" as const, value: this.mapRedemption(persisted) };
        })
      );
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const targets = this.uniqueTargets(error);
      if (targets.some((target) => target.includes("idempotency_key"))) {
        const existing = await this.findByIdempotencyKey(input.shopId, input.idempotencyKey);
        if (!existing) throw error;
        return existing.requestFingerprint === input.requestFingerprint
          ? { kind: "replayed" as const, value: existing }
          : { kind: "idempotency_conflict" as const };
      }
      if (targets.some((target) => target.includes("booking_order_id"))) {
        return { kind: "order_not_eligible" as const };
      }
      throw error;
    }
  }

  public listMerchant(shopId: number, input: ShopMembershipCardRedemptionListInput) {
    const where: Prisma.ShopMembershipCardRedemptionWhereInput = {
      shopId,
      ...(input.cardPublicId ? { card: { publicId: input.cardPublicId, deletedAt: null } } : {}),
      deletedAt: null
    };
    return this.list(where, input);
  }

  public listCustomer(customerUserId: number, input: ShopMembershipCardRedemptionListInput) {
    const where: Prisma.ShopMembershipCardRedemptionWhereInput = {
      customerUserId,
      ...(input.cardPublicId ? { card: { publicId: input.cardPublicId, deletedAt: null } } : {}),
      deletedAt: null
    };
    return this.list(where, input);
  }

  public async listPendingRewardIds(
    shopId: number,
    limit: number,
    transactionClient?: unknown
  ): Promise<number[]> {
    const client = this.transactionClient(transactionClient);
    const records = await client.shopMembershipCardRedemption.findMany({
      where: {
        shopId,
        status: ShopMembershipCardRedemptionStatus.APPLIED,
        rewardStatus: ShopMembershipCardRewardStatus.PENDING_FUNDS,
        outstandingRewardNdp: { gt: 0 },
        deletedAt: null
      },
      orderBy: [{ redeemedAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true }
    });
    return records.map((record) => record.id);
  }

  public async lockPendingReward(
    redemptionId: number,
    transactionClient?: unknown
  ): Promise<PendingShopMembershipReward | null> {
    const client = this.transactionClient(transactionClient);
    const rows = await client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM shop_membership_card_redemptions WHERE id = ${redemptionId} AND deleted_at IS NULL FOR UPDATE`
    );
    if (rows.length !== 1) return null;
    const record = await client.shopMembershipCardRedemption.findFirst({
      where: {
        id: redemptionId,
        status: ShopMembershipCardRedemptionStatus.APPLIED,
        rewardStatus: ShopMembershipCardRewardStatus.PENDING_FUNDS,
        outstandingRewardNdp: { gt: 0 },
        deletedAt: null
      },
      select: {
        id: true,
        shopId: true,
        customerUserId: true,
        customerRewardNdp: true,
        platformFeeNdp: true,
        platformFeeRateBps: true,
        totalShopDebitNdp: true,
        outstandingRewardNdp: true
      }
    });
    return record ? { ...record, rewardStatus: "pending_funds" } : null;
  }

  public async markPendingRewardPaid(
    input: {
      redemptionId: number;
      expectedOutstandingRewardNdp: number;
      shopWalletId: number;
      customerWalletId: number;
      platformWalletId: number | null;
      ledgerTransactionId: number;
      actorUserId: number;
      settledAt: Date;
    },
    transactionClient?: unknown
  ): Promise<void> {
    const client = this.transactionClient(transactionClient);
    const updated = await client.shopMembershipCardRedemption.updateMany({
      where: {
        id: input.redemptionId,
        status: ShopMembershipCardRedemptionStatus.APPLIED,
        rewardStatus: ShopMembershipCardRewardStatus.PENDING_FUNDS,
        outstandingRewardNdp: input.expectedOutstandingRewardNdp,
        ledgerTransactionId: null,
        deletedAt: null
      },
      data: {
        rewardStatus: ShopMembershipCardRewardStatus.PAID,
        outstandingRewardNdp: 0,
        shopWalletId: input.shopWalletId,
        customerWalletId: input.customerWalletId,
        platformWalletId: input.platformWalletId,
        ledgerTransactionId: input.ledgerTransactionId,
        rewardSettledAt: input.settledAt
      }
    });
    if (updated.count !== 1) {
      throw new Error("error.shop_membership_card_redemption.pending_settlement_conflict");
    }
    const redemption = await client.shopMembershipCardRedemption.findUniqueOrThrow({
      where: { id: input.redemptionId },
      select: {
        publicId: true,
        customerUserId: true,
        customerRewardNdp: true,
        platformFeeNdp: true,
        totalShopDebitNdp: true,
        card: { select: { publicId: true } },
        shop: { select: { shopNo: true } }
      }
    });
    const recipientIdentityId = await resolveCanonicalPersonalIdentityId(
      client,
      redemption.customerUserId
    );
    const actorIdentityId = await resolveCanonicalPersonalIdentityId(client, input.actorUserId);
    if (!recipientIdentityId || !actorIdentityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.auth.identity_not_found",
        statusCode: 403
      });
    }
    await client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: "merchant.shop_membership_card.redemption.reward_settled",
        targetType: "ShopMembershipCardRedemption",
        targetId: input.redemptionId,
        metadata: {
          redemptionPublicId: redemption.publicId,
          ledgerTransactionId: input.ledgerTransactionId,
          shopWalletId: input.shopWalletId,
          customerWalletId: input.customerWalletId,
          platformWalletId: input.platformWalletId,
          customerRewardNdp: redemption.customerRewardNdp,
          platformFeeNdp: redemption.platformFeeNdp,
          totalShopDebitNdp: redemption.totalShopDebitNdp
        },
        createdAt: input.settledAt
      }
    });
    await client.notification.create({
      data: {
        recipientUserId: redemption.customerUserId,
        recipientIdentityId,
        actorUserId: input.actorUserId,
        actorIdentityId,
        type: "SYSTEM",
        title: "shop_membership.card_redemption.reward_settled.title",
        body: "shop_membership.card_redemption.reward_settled.body",
        payload: {
          redemptionPublicId: redemption.publicId,
          cardPublicId: redemption.card.publicId,
          shopNo: redemption.shop.shopNo,
          customerRewardNdp: redemption.customerRewardNdp,
          platformFeeNdp: redemption.platformFeeNdp,
          totalShopDebitNdp: redemption.totalShopDebitNdp
        },
        createdAt: input.settledAt
      }
    });
  }

  private async list(
    where: Prisma.ShopMembershipCardRedemptionWhereInput,
    input: ShopMembershipCardRedemptionListInput
  ) {
    const pagination = toPrismaPagination(input);
    const [records, total] = await Promise.all([
      this.client.shopMembershipCardRedemption.findMany({
        where,
        orderBy: [{ redeemedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: redemptionSelect
      }),
      this.client.shopMembershipCardRedemption.count({ where })
    ]);
    return buildPaginatedResponse(
      records.map((record) => this.mapRedemption(record)),
      total,
      input
    );
  }

  private transactionClient(value?: unknown): PrismaClient | Prisma.TransactionClient {
    return value ? (value as Prisma.TransactionClient) : this.client;
  }

  private loadCard(
    client: PrismaClient | Prisma.TransactionClient,
    shopId: number,
    cardPublicId: string
  ): Promise<CardRecord | null> {
    return client.shopMembershipCard.findFirst({
      where: { publicId: cardPublicId, membership: { shopId, deletedAt: null }, deletedAt: null },
      select: cardSelect
    });
  }

  private loadOrder(
    client: PrismaClient | Prisma.TransactionClient,
    shopId: number,
    customerUserId: number,
    orderNo: string
  ): Promise<OrderRecord | null> {
    return client.bookingOrder.findFirst({
      where: {
        orderNo,
        shopId,
        customerUserId,
        status: BookingOrderStatus.COMPLETED,
        currency: "JPY",
        deletedAt: null
      },
      select: orderSelect
    });
  }

  private isCardEligible(card: CardRecord, databaseNow: Date): boolean {
    return (
      card.status === ShopMembershipCardStatus.ACTIVE &&
      card.membership.status === ShopCustomerMembershipStatus.ACTIVE &&
      (!card.expiresAt || card.expiresAt > databaseNow) &&
      card.planVersion !== null &&
      card.planVersion.deletedAt === null &&
      card.planVersion.status !== ShopMembershipCardPlanVersionStatus.DRAFT &&
      card.planVersion.publishedAt !== null &&
      card.planVersion.cardType === card.type &&
      card.platformFeeRateBpsSnapshot !== null &&
      card.planVersion.platformFeeRateBps === card.platformFeeRateBpsSnapshot
    );
  }

  private async buildCandidateContext(
    client: PrismaClient | Prisma.TransactionClient,
    card: CardRecord,
    order: OrderRecord
  ): Promise<ShopMembershipCardRedemptionCandidateContext | null> {
    if (!card.planVersion || card.platformFeeRateBpsSnapshot === null) return null;
    const serviceCompletedAt = order.statusHistory[0]?.createdAt;
    const eligibleAmountJpy = Number(order.priceAmount.toString());
    if (
      !serviceCompletedAt ||
      order.status !== BookingOrderStatus.COMPLETED ||
      order.currency !== "JPY" ||
      !Number.isSafeInteger(eligibleAmountJpy) ||
      eligibleAmountJpy <= 0
    )
      return null;

    let consumedPrincipalJpy = 0;
    let consumedUses = 0;
    let principalBalanceBeforeJpy: number | null = null;
    let principalBalanceAfterJpy: number | null = null;
    let remainingUsesBefore: number | null = null;
    let remainingUsesAfter: number | null = null;
    if (card.type === ShopMembershipCardType.STORED_VALUE) {
      if (card.principalBalanceJpy === null || card.principalBalanceJpy < eligibleAmountJpy)
        return null;
      consumedPrincipalJpy = eligibleAmountJpy;
      principalBalanceBeforeJpy = card.principalBalanceJpy;
      principalBalanceAfterJpy = card.principalBalanceJpy - eligibleAmountJpy;
    } else if (card.type === ShopMembershipCardType.COUNT) {
      if (card.remainingUses === null || card.remainingUses < 1) return null;
      consumedUses = 1;
      remainingUsesBefore = card.remainingUses;
      remainingUsesAfter = card.remainingUses - 1;
    }

    const servicePublicId =
      order.service?.publicId ?? order.technicianService?.sourceShopService?.publicId ?? null;
    const serviceCategoryCode =
      order.service?.category.code ?? order.technicianService?.category.code ?? null;
    const facts = await this.buildRewardFacts(
      client,
      card.id,
      eligibleAmountJpy,
      servicePublicId,
      serviceCategoryCode,
      serviceCompletedAt
    );
    return {
      bookingOrderId: order.id,
      orderNo: order.orderNo,
      serviceName: order.serviceNameSnapshot?.trim() || "membership.service.unknown",
      servicePublicId,
      serviceCategoryCode,
      serviceStartedAt: order.startsAt,
      serviceCompletedAt,
      eligibleAmountJpy,
      consumedPrincipalJpy,
      consumedUses,
      principalBalanceBeforeJpy,
      principalBalanceAfterJpy,
      remainingUsesBefore,
      remainingUsesAfter,
      cardLockVersionBefore: card.lockVersion,
      rules: card.planVersion.rules.map((rule) => rule.config),
      caps: card.planVersion.rewardCaps,
      platformFeeRateBps: card.platformFeeRateBpsSnapshot,
      facts
    };
  }

  private async buildRewardFacts(
    client: PrismaClient | Prisma.TransactionClient,
    cardId: number,
    eligibleAmountJpy: number,
    servicePublicId: string | null,
    categoryCode: string | null,
    occurredAt: Date
  ): Promise<MembershipRewardPreviewFacts> {
    const prior = await client.shopMembershipCardRedemption.findMany({
      where: {
        cardId,
        status: ShopMembershipCardRedemptionStatus.APPLIED,
        deletedAt: null
      },
      orderBy: [{ serviceCompletedAt: "asc" }, { id: "asc" }],
      select: {
        serviceCompletedAt: true,
        eligibleAmountJpy: true,
        customerRewardNdp: true,
        rewardHits: true
      }
    });
    const dayKey = this.japanDayKey(occurredAt);
    const monthKey = dayKey.slice(0, 7);
    const yearKey = dayKey.slice(0, 4);
    const rewardedConsecutiveMonthMilestones = new Set<number>();
    let birthdayRewardsThisYear = 0;
    for (const redemption of prior) {
      const hits = this.rewardHits(redemption.rewardHits);
      if (
        this.japanDayKey(redemption.serviceCompletedAt).startsWith(yearKey) &&
        hits.some((hit) => hit.kind === "birthday_month_bonus")
      )
        birthdayRewardsThisYear += 1;
      for (const hit of hits) {
        if (hit.kind !== "consecutive_month_bonus") continue;
        const milestone = hit.basis.consecutiveMonths;
        if (typeof milestone === "number" && Number.isSafeInteger(milestone) && milestone > 0) {
          rewardedConsecutiveMonthMilestones.add(milestone);
        }
      }
    }
    const months = new Set(
      prior.map((redemption) => this.japanDayKey(redemption.serviceCompletedAt).slice(0, 7))
    );
    months.add(monthKey);
    return {
      eligibleAmountJpy,
      servicePublicId,
      categoryCode: categoryCode ?? "membership-category-unknown",
      occurredAt: occurredAt.toISOString(),
      completedCountBefore: prior.length,
      lifetimeEligibleSpendJpyBefore: prior.reduce(
        (total, redemption) => total + redemption.eligibleAmountJpy,
        0
      ),
      isFirstCardUse: prior.length === 0,
      customerBirthMonth: null,
      birthdayRewardsThisYear,
      consecutiveEligibleMonths: this.consecutiveMonthCount(months, monthKey),
      rewardedConsecutiveMonthMilestones: [...rewardedConsecutiveMonthMilestones].sort(
        (left, right) => left - right
      ),
      alreadyRewardedTodayNdp: prior
        .filter((redemption) => this.japanDayKey(redemption.serviceCompletedAt) === dayKey)
        .reduce((total, redemption) => total + redemption.customerRewardNdp, 0),
      alreadyRewardedMonthNdp: prior
        .filter((redemption) =>
          this.japanDayKey(redemption.serviceCompletedAt).startsWith(monthKey)
        )
        .reduce((total, redemption) => total + redemption.customerRewardNdp, 0),
      alreadyRewardedLifetimeNdp: prior.reduce(
        (total, redemption) => total + redemption.customerRewardNdp,
        0
      )
    };
  }

  private consecutiveMonthCount(months: Set<string>, currentMonthKey: string): number {
    const [year, month] = currentMonthKey.split("-").map(Number);
    let cursor = new Date(Date.UTC(year, month - 1, 1));
    let count = 0;
    while (true) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!months.has(key)) return count;
      count += 1;
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1));
    }
  }

  private japanDayKey(value: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(value);
  }

  private rewardHits(value: Prisma.JsonValue): MembershipRewardRuleHit[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((hit) =>
      hit && typeof hit === "object" && !Array.isArray(hit) && "kind" in hit && "basis" in hit
        ? [hit as unknown as MembershipRewardRuleHit]
        : []
    );
  }

  private async getDatabaseNow(client: PrismaClient | Prisma.TransactionClient): Promise<Date> {
    const rows = await client.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS now`
    );
    const databaseNow = rows[0]?.now;
    if (!(databaseNow instanceof Date) || Number.isNaN(databaseNow.getTime())) {
      throw new Error("error.database_clock_unavailable");
    }
    return databaseNow;
  }

  private mapRedemption(record: RedemptionRecord): ShopMembershipCardRedemptionRecord {
    return {
      internalId: record.id,
      publicId: record.publicId,
      requestFingerprint: record.requestFingerprint,
      status: record.status === ShopMembershipCardRedemptionStatus.APPLIED ? "applied" : "refunded",
      rewardStatus: this.rewardStatus(record.rewardStatus),
      rewardFacts: record.rewardFacts as unknown as MembershipRewardPreviewFacts,
      rewardHits: this.rewardHits(record.rewardHits),
      rawRewardNdp: record.rawRewardNdp,
      customerRewardNdp: record.customerRewardNdp,
      platformFeeRateBps: record.platformFeeRateBps,
      platformFeeNdp: record.platformFeeNdp,
      totalShopDebitNdp: record.totalShopDebitNdp,
      rewardCapped: record.rewardCapped,
      outstandingRewardNdp: record.outstandingRewardNdp,
      consumedPrincipalJpy: record.consumedPrincipalJpy,
      consumedUses: record.consumedUses,
      principalBalanceBeforeJpy: record.principalBalanceBeforeJpy,
      principalBalanceAfterJpy: record.principalBalanceAfterJpy,
      remainingUsesBefore: record.remainingUsesBefore,
      remainingUsesAfter: record.remainingUsesAfter,
      redeemedAt: record.redeemedAt,
      rewardSettledAt: record.rewardSettledAt,
      refundedAt: record.refundedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      card: {
        publicId: record.card.publicId,
        cardNo: record.card.cardNo,
        name: record.card.name,
        type:
          record.card.type === ShopMembershipCardType.STORED_VALUE
            ? "stored_value"
            : record.card.type === ShopMembershipCardType.COUNT
              ? "count"
              : "benefit",
        status:
          record.card.status === ShopMembershipCardStatus.ACTIVE
            ? "active"
            : record.card.status === ShopMembershipCardStatus.FROZEN
              ? "frozen"
              : record.card.status === ShopMembershipCardStatus.EXPIRED
                ? "expired"
                : "void",
        principalBalanceJpy: record.card.principalBalanceJpy,
        bonusBalanceJpy: record.card.bonusBalanceJpy,
        remainingUses: record.card.remainingUses,
        lockVersion: record.card.lockVersion
      },
      order: {
        orderNo: record.orderNoSnapshot,
        serviceName: record.serviceNameSnapshot,
        servicePublicId: record.servicePublicId,
        serviceCategoryCode: record.serviceCategoryCode,
        serviceStartedAt: record.serviceStartedAt,
        serviceCompletedAt: record.serviceCompletedAt,
        eligibleAmountJpy: record.eligibleAmountJpy,
        paymentStatus: this.paymentStatus(record.bookingOrder.paymentStatus),
        paymentRefundedAt: record.bookingOrder.paymentRefundedAt
      },
      shop: record.shop,
      customer: {
        userId: record.customer.id,
        needoId: record.customer.needoId,
        displayName: record.customer.customerProfile?.displayName ?? record.customer.needoId
      },
      redeemedBy: {
        needoId: record.redeemedBy.needoId,
        displayName: record.redeemedBy.username
      },
      ledgerTransactionNo: record.ledgerTransaction?.transactionNo ?? null,
      refund: record.refund
        ? {
            publicId: record.refund.publicId,
            reason: record.refund.reason,
            reversalMode:
              record.refund.reversalMode === ShopMembershipRewardReversalMode.CANCELLED_PENDING
                ? "cancelled_pending"
                : record.refund.reversalMode === ShopMembershipRewardReversalMode.LEDGER_REVERSED
                  ? "ledger_reversed"
                  : "none",
            restoredPrincipalJpy: record.refund.restoredPrincipalJpy,
            restoredUses: record.refund.restoredUses,
            customerRewardReversedNdp: record.refund.customerRewardReversedNdp,
            platformFeeReversedNdp: record.refund.platformFeeReversedNdp,
            totalShopCreditNdp: record.refund.totalShopCreditNdp,
            customerBalanceBeforeNdp: record.refund.customerBalanceBeforeNdp,
            customerBalanceAfterNdp: record.refund.customerBalanceAfterNdp,
            refundedAt: record.refund.refundedAt,
            refundedBy: {
              needoId: record.refund.refundedBy.needoId,
              displayName: record.refund.refundedBy.username
            },
            reversalLedgerTransactionNo:
              record.refund.reversalLedgerTransaction?.transactionNo ?? null
          }
        : null
    };
  }

  private paymentStatus(
    value: ServicePaymentStatus
  ): ShopMembershipCardRedemptionRecord["order"]["paymentStatus"] {
    if (value === ServicePaymentStatus.CONFIRMED) return "confirmed";
    if (value === ServicePaymentStatus.REFUND_PENDING) return "refundPending";
    if (value === ServicePaymentStatus.REFUNDED) return "refunded";
    return "pending";
  }

  private rewardStatus(
    value: ShopMembershipCardRewardStatus
  ): ShopMembershipCardRedemptionRecord["rewardStatus"] {
    if (value === ShopMembershipCardRewardStatus.PENDING_FUNDS) return "pending_funds";
    if (value === ShopMembershipCardRewardStatus.PAID) return "paid";
    if (value === ShopMembershipCardRewardStatus.REVERSED) return "reversed";
    return "none";
  }

  private metadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private isUniqueConflict(error: unknown): error is { code: string; meta?: { target?: unknown } } {
    return Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }

  private uniqueTargets(error: { meta?: { target?: unknown } }): string[] {
    const target = error.meta?.target;
    return Array.isArray(target) ? target.map(String) : target ? [String(target)] : [];
  }

  private notFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_NOT_FOUND,
      message: "error.shop_membership_card_redemption.not_found",
      statusCode: 404
    });
  }

  private invalidStateError(): AppError {
    return new AppError({
      code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_INVALID_STATE,
      message: "error.shop_membership_card_redemption.invalid_state",
      statusCode: 409
    });
  }

  private pendingConflictError(): AppError {
    return new AppError({
      code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_PENDING_CONFLICT,
      message: "error.shop_membership_card_redemption.pending_conflict",
      statusCode: 409
    });
  }
}
