import {
  Prisma,
  ServicePaymentStatus,
  ShopMembershipCardAdjustmentStatus,
  ShopMembershipCardRedemptionStatus,
  ShopMembershipCardRefundStatus,
  ShopMembershipCardRewardStatus,
  ShopMembershipCardStatus,
  ShopMembershipCardType,
  ShopMembershipRewardReversalMode,
  type PrismaClient
} from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  CreateShopMembershipCardRefundRepositoryInput,
  ShopMembershipCardRefundRecord,
  ShopMembershipCardRefundRepositoryPort,
  ShopMembershipRewardReversal
} from "../services/shop-membership-card-refund.service";
import { AppError } from "../utils/app-error";
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
  lockVersion: true
});

const refundSelect = Prisma.validator<Prisma.ShopMembershipCardRedemptionRefundSelect>()({
  id: true,
  publicId: true,
  requestFingerprint: true,
  status: true,
  reason: true,
  rewardStatusBefore: true,
  reversalMode: true,
  restoredPrincipalJpy: true,
  restoredUses: true,
  principalBalanceBeforeJpy: true,
  principalBalanceAfterJpy: true,
  remainingUsesBefore: true,
  remainingUsesAfter: true,
  customerRewardReversedNdp: true,
  platformFeeReversedNdp: true,
  totalShopCreditNdp: true,
  customerBalanceBeforeNdp: true,
  customerBalanceAfterNdp: true,
  orderPaymentRefundedAt: true,
  refundedAt: true,
  createdAt: true,
  updatedAt: true,
  redemption: { select: { publicId: true } },
  card: { select: cardSelect },
  bookingOrder: { select: { orderNo: true, serviceNameSnapshot: true } },
  shop: { select: { shopNo: true, name: true } },
  customer: {
    select: { needoId: true, customerProfile: { select: { displayName: true } } }
  },
  refundedBy: { select: { needoId: true, username: true } },
  reversalLedgerTransaction: { select: { transactionNo: true } }
});

const redemptionForRefundSelect = Prisma.validator<Prisma.ShopMembershipCardRedemptionSelect>()({
  id: true,
  publicId: true,
  shopId: true,
  cardId: true,
  bookingOrderId: true,
  customerUserId: true,
  status: true,
  rewardStatus: true,
  outstandingRewardNdp: true,
  customerRewardNdp: true,
  platformFeeNdp: true,
  totalShopDebitNdp: true,
  consumedPrincipalJpy: true,
  consumedUses: true,
  shopWalletId: true,
  customerWalletId: true,
  platformWalletId: true,
  card: { select: cardSelect },
  bookingOrder: {
    select: {
      orderNo: true,
      serviceNameSnapshot: true,
      paymentStatus: true,
      paymentRefundedAt: true,
      paymentRefundReference: true
    }
  },
  refund: { select: { id: true } }
});

type RefundRecord = Prisma.ShopMembershipCardRedemptionRefundGetPayload<{
  select: typeof refundSelect;
}>;
type RedemptionForRefundRecord = Prisma.ShopMembershipCardRedemptionGetPayload<{
  select: typeof redemptionForRefundSelect;
}>;

export class ShopMembershipCardRefundRepository implements ShopMembershipCardRefundRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findByIdempotencyKey(
    shopId: number,
    idempotencyKey: string
  ): Promise<ShopMembershipCardRefundRecord | null> {
    const record = await this.client.shopMembershipCardRedemptionRefund.findFirst({
      where: { shopId, idempotencyKey, deletedAt: null },
      select: refundSelect
    });
    return record ? this.mapRefund(record) : null;
  }

  public async refundWithReversalAuditAndNotification(
    input: CreateShopMembershipCardRefundRepositoryInput,
    reverse: ShopMembershipRewardReversal
  ) {
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => {
          const replay = await transaction.shopMembershipCardRedemptionRefund.findFirst({
            where: { shopId: input.shopId, idempotencyKey: input.idempotencyKey, deletedAt: null },
            select: refundSelect
          });
          if (replay) {
            return replay.requestFingerprint === input.requestFingerprint
              ? { kind: "replayed" as const, value: this.mapRefund(replay) }
              : { kind: "idempotency_conflict" as const };
          }

          const candidate = await transaction.shopMembershipCardRedemption.findFirst({
            where: {
              publicId: input.redemptionPublicId,
              shopId: input.shopId,
              deletedAt: null
            },
            select: { id: true, cardId: true, bookingOrderId: true }
          });
          if (!candidate) return { kind: "not_found" as const };
          const lockedRedemption = await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM shop_membership_card_redemptions WHERE id = ${candidate.id} AND deleted_at IS NULL FOR UPDATE`
          );
          if (lockedRedemption.length !== 1) return { kind: "not_found" as const };
          const lockedCard = await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM shop_membership_cards WHERE id = ${candidate.cardId} AND deleted_at IS NULL FOR UPDATE`
          );
          if (lockedCard.length !== 1) return { kind: "not_found" as const };
          const lockedOrder = await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM booking_orders WHERE id = ${candidate.bookingOrderId} AND deleted_at IS NULL FOR UPDATE`
          );
          if (lockedOrder.length !== 1) return { kind: "not_found" as const };

          const databaseNow = await this.getDatabaseNow(transaction);
          const redemption = await transaction.shopMembershipCardRedemption.findFirst({
            where: { id: candidate.id, shopId: input.shopId, deletedAt: null },
            select: redemptionForRefundSelect
          });
          if (!redemption) return { kind: "not_found" as const };
          if (
            redemption.status !== ShopMembershipCardRedemptionStatus.APPLIED
            || redemption.refund
            || redemption.rewardStatus === ShopMembershipCardRewardStatus.REVERSED
          ) return { kind: "invalid_state" as const };
          if (
            redemption.bookingOrder.paymentStatus !== ServicePaymentStatus.REFUNDED
            || !redemption.bookingOrder.paymentRefundedAt
          ) return { kind: "order_not_refunded" as const };

          const pendingAdjustment = await transaction.shopMembershipCardAdjustmentRequest.findFirst({
            where: {
              cardId: redemption.cardId,
              status: ShopMembershipCardAdjustmentStatus.PENDING,
              expiresAt: { gt: databaseNow },
              deletedAt: null
            },
            select: { id: true }
          });
          if (pendingAdjustment) return { kind: "pending_conflict" as const };

          const restoration = this.restoration(redemption);
          if (!restoration) return { kind: "invalid_state" as const };
          const updatedCard = await transaction.shopMembershipCard.updateMany({
            where: {
              id: redemption.cardId,
              lockVersion: redemption.card.lockVersion,
              deletedAt: null,
              ...(redemption.card.type === ShopMembershipCardType.STORED_VALUE
                ? { principalBalanceJpy: restoration.principalBalanceBeforeJpy }
                : redemption.card.type === ShopMembershipCardType.COUNT
                  ? { remainingUses: restoration.remainingUsesBefore }
                  : {})
            },
            data: {
              ...(redemption.card.type === ShopMembershipCardType.STORED_VALUE
                ? { principalBalanceJpy: restoration.principalBalanceAfterJpy }
                : redemption.card.type === ShopMembershipCardType.COUNT
                  ? { remainingUses: restoration.remainingUsesAfter }
                  : {}),
              lockVersion: { increment: 1 }
            }
          });
          if (updatedCard.count !== 1) return { kind: "concurrency_conflict" as const };

          let reversal = null;
          if (redemption.rewardStatus === ShopMembershipCardRewardStatus.PAID) {
            if (
              !redemption.shopWalletId
              || !redemption.customerWalletId
              || (redemption.platformFeeNdp > 0 && !redemption.platformWalletId)
            ) return { kind: "invalid_state" as const };
            reversal = await reverse({
              redemptionId: redemption.id,
              shopId: redemption.shopId,
              customerUserId: redemption.customerUserId,
              customerRewardNdp: redemption.customerRewardNdp,
              platformFeeNdp: redemption.platformFeeNdp,
              shopWalletId: redemption.shopWalletId,
              customerWalletId: redemption.customerWalletId,
              platformWalletId: redemption.platformWalletId,
              idempotencyKey: `membership-redemption:${redemption.id}:refund:reversal`,
              actorUserId: input.actorId
            }, transaction);
          }

          const reversalMode = redemption.rewardStatus === ShopMembershipCardRewardStatus.PAID
            ? ShopMembershipRewardReversalMode.LEDGER_REVERSED
            : redemption.rewardStatus === ShopMembershipCardRewardStatus.PENDING_FUNDS
              ? ShopMembershipRewardReversalMode.CANCELLED_PENDING
              : ShopMembershipRewardReversalMode.NONE;
          const created = await transaction.shopMembershipCardRedemptionRefund.create({
            data: {
              redemptionId: redemption.id,
              cardId: redemption.cardId,
              shopId: redemption.shopId,
              bookingOrderId: redemption.bookingOrderId,
              customerUserId: redemption.customerUserId,
              refundedById: input.actorId,
              reason: input.reason,
              orderPaymentRefundedAt: redemption.bookingOrder.paymentRefundedAt,
              orderPaymentRefundReference: redemption.bookingOrder.paymentRefundReference,
              redemptionStatusBefore: redemption.status,
              rewardStatusBefore: redemption.rewardStatus,
              ...restoration,
              cardLockVersionBefore: redemption.card.lockVersion,
              reversalMode,
              customerRewardReversedNdp: reversal ? redemption.customerRewardNdp : 0,
              platformFeeReversedNdp: reversal ? redemption.platformFeeNdp : 0,
              totalShopCreditNdp: reversal ? redemption.totalShopDebitNdp : 0,
              shopWalletId: reversal?.shopWalletId ?? null,
              customerWalletId: reversal?.customerWalletId ?? null,
              platformWalletId: reversal?.platformWalletId ?? null,
              customerBalanceBeforeNdp: reversal?.customerBalanceBeforeNdp ?? null,
              customerBalanceAfterNdp: reversal?.customerBalanceAfterNdp ?? null,
              reversalLedgerTransactionId: reversal?.transaction.id ?? null,
              status: ShopMembershipCardRefundStatus.APPLIED,
              refundedAt: databaseNow,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: input.requestFingerprint,
              createdAt: databaseNow
            },
            select: { id: true, publicId: true }
          });
          const updatedRedemption = await transaction.shopMembershipCardRedemption.updateMany({
            where: {
              id: redemption.id,
              status: ShopMembershipCardRedemptionStatus.APPLIED,
              rewardStatus: redemption.rewardStatus,
              refundedAt: null,
              deletedAt: null
            },
            data: {
              status: ShopMembershipCardRedemptionStatus.REFUNDED,
              rewardStatus: redemption.rewardStatus === ShopMembershipCardRewardStatus.NONE
                ? ShopMembershipCardRewardStatus.NONE
                : ShopMembershipCardRewardStatus.REVERSED,
              outstandingRewardNdp: 0,
              refundedAt: databaseNow
            }
          });
          if (updatedRedemption.count !== 1) return { kind: "concurrency_conflict" as const };

          const recipientIdentityId = await resolveCanonicalPersonalIdentityId(transaction, redemption.customerUserId);
          const actorIdentityId = await resolveCanonicalPersonalIdentityId(transaction, input.actorId);
          if (!recipientIdentityId || !actorIdentityId) {
            throw new AppError({
              code: ERROR_CODES.IDENTITY_NOT_FOUND,
              message: "error.auth.identity_not_found",
              statusCode: 403
            });
          }
          const metadata = {
            ...this.metadata(input.audit.metadata),
            refundPublicId: created.publicId,
            redemptionPublicId: redemption.publicId,
            cardPublicId: redemption.card.publicId,
            orderNo: redemption.bookingOrder.orderNo,
            restoredPrincipalJpy: restoration.restoredPrincipalJpy,
            restoredUses: restoration.restoredUses,
            reversalMode: this.reversalMode(reversalMode),
            customerRewardReversedNdp: reversal ? redemption.customerRewardNdp : 0,
            platformFeeReversedNdp: reversal ? redemption.platformFeeNdp : 0,
            totalShopCreditNdp: reversal ? redemption.totalShopDebitNdp : 0,
            customerBalanceAfterNdp: reversal?.customerBalanceAfterNdp ?? null,
            customerBalanceNegative: Boolean(reversal && reversal.customerBalanceAfterNdp < 0)
          };
          await transaction.auditLog.create({
            data: {
              ...toAuditLogCreateData({ ...input.audit, targetId: created.id, metadata }),
              createdAt: databaseNow
            }
          });
          await transaction.notification.create({
            data: {
              recipientUserId: redemption.customerUserId,
              recipientIdentityId,
              actorUserId: input.actorId,
              actorIdentityId,
              type: "SYSTEM",
              title: "shop_membership.card_refund.applied.title",
              body: reversal && reversal.customerBalanceAfterNdp < 0
                ? "shop_membership.card_refund.applied_negative.body"
                : "shop_membership.card_refund.applied.body",
              payload: metadata,
              createdAt: databaseNow
            }
          });
          const persisted = await transaction.shopMembershipCardRedemptionRefund.findUniqueOrThrow({
            where: { id: created.id },
            select: refundSelect
          });
          return { kind: "created" as const, value: this.mapRefund(persisted) };
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
      if (targets.some((target) =>
        target.includes("redemption_id") || target.includes("booking_order_id")
      )) return { kind: "invalid_state" as const };
      throw error;
    }
  }

  private restoration(redemption: RedemptionForRefundRecord) {
    if (redemption.card.type === ShopMembershipCardType.STORED_VALUE) {
      if (
        redemption.consumedPrincipalJpy <= 0 || redemption.consumedUses !== 0
        || redemption.card.principalBalanceJpy === null
      ) return null;
      const after = redemption.card.principalBalanceJpy + redemption.consumedPrincipalJpy;
      if (!Number.isSafeInteger(after) || after > 2_147_483_647) return null;
      return {
        restoredPrincipalJpy: redemption.consumedPrincipalJpy,
        restoredUses: 0,
        principalBalanceBeforeJpy: redemption.card.principalBalanceJpy,
        principalBalanceAfterJpy: after,
        remainingUsesBefore: null,
        remainingUsesAfter: null
      };
    }
    if (redemption.card.type === ShopMembershipCardType.COUNT) {
      if (
        redemption.consumedPrincipalJpy !== 0 || redemption.consumedUses <= 0
        || redemption.card.remainingUses === null
      ) return null;
      const after = redemption.card.remainingUses + redemption.consumedUses;
      if (!Number.isSafeInteger(after) || after > 2_147_483_647) return null;
      return {
        restoredPrincipalJpy: 0,
        restoredUses: redemption.consumedUses,
        principalBalanceBeforeJpy: null,
        principalBalanceAfterJpy: null,
        remainingUsesBefore: redemption.card.remainingUses,
        remainingUsesAfter: after
      };
    }
    if (redemption.consumedPrincipalJpy !== 0 || redemption.consumedUses !== 0) return null;
    return {
      restoredPrincipalJpy: 0,
      restoredUses: 0,
      principalBalanceBeforeJpy: null,
      principalBalanceAfterJpy: null,
      remainingUsesBefore: null,
      remainingUsesAfter: null
    };
  }

  private async getDatabaseNow(client: Prisma.TransactionClient): Promise<Date> {
    const rows = await client.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS now`
    );
    const now = rows[0]?.now;
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new Error("error.database_clock_unavailable");
    }
    return now;
  }

  private mapRefund(record: RefundRecord): ShopMembershipCardRefundRecord {
    return {
      internalId: record.id,
      publicId: record.publicId,
      requestFingerprint: record.requestFingerprint,
      status: "applied",
      reason: record.reason,
      reversalMode: this.reversalMode(record.reversalMode),
      restoredPrincipalJpy: record.restoredPrincipalJpy,
      restoredUses: record.restoredUses,
      principalBalanceBeforeJpy: record.principalBalanceBeforeJpy,
      principalBalanceAfterJpy: record.principalBalanceAfterJpy,
      remainingUsesBefore: record.remainingUsesBefore,
      remainingUsesAfter: record.remainingUsesAfter,
      customerRewardReversedNdp: record.customerRewardReversedNdp,
      platformFeeReversedNdp: record.platformFeeReversedNdp,
      totalShopCreditNdp: record.totalShopCreditNdp,
      customerBalanceBeforeNdp: record.customerBalanceBeforeNdp,
      customerBalanceAfterNdp: record.customerBalanceAfterNdp,
      orderPaymentRefundedAt: record.orderPaymentRefundedAt,
      refundedAt: record.refundedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      redemption: {
        publicId: record.redemption.publicId,
        rewardStatusBefore: this.rewardStatus(record.rewardStatusBefore)
      },
      card: {
        publicId: record.card.publicId,
        cardNo: record.card.cardNo,
        name: record.card.name,
        type: record.card.type === ShopMembershipCardType.STORED_VALUE
          ? "stored_value"
          : record.card.type === ShopMembershipCardType.COUNT ? "count" : "benefit",
        status: record.card.status === ShopMembershipCardStatus.ACTIVE
          ? "active"
          : record.card.status === ShopMembershipCardStatus.FROZEN
            ? "frozen"
            : record.card.status === ShopMembershipCardStatus.EXPIRED ? "expired" : "void",
        principalBalanceJpy: record.card.principalBalanceJpy,
        bonusBalanceJpy: record.card.bonusBalanceJpy,
        remainingUses: record.card.remainingUses
      },
      order: {
        orderNo: record.bookingOrder.orderNo,
        serviceName: record.bookingOrder.serviceNameSnapshot?.trim() || "membership.service.unknown"
      },
      shop: record.shop,
      customer: {
        needoId: record.customer.needoId,
        displayName: record.customer.customerProfile?.displayName ?? record.customer.needoId
      },
      refundedBy: {
        needoId: record.refundedBy.needoId,
        displayName: record.refundedBy.username
      },
      reversalLedgerTransactionNo: record.reversalLedgerTransaction?.transactionNo ?? null
    };
  }

  private rewardStatus(value: ShopMembershipCardRewardStatus) {
    if (value === ShopMembershipCardRewardStatus.PENDING_FUNDS) return "pending_funds" as const;
    if (value === ShopMembershipCardRewardStatus.PAID) return "paid" as const;
    return "none" as const;
  }

  private reversalMode(value: ShopMembershipRewardReversalMode) {
    if (value === ShopMembershipRewardReversalMode.CANCELLED_PENDING) return "cancelled_pending" as const;
    if (value === ShopMembershipRewardReversalMode.LEDGER_REVERSED) return "ledger_reversed" as const;
    return "none" as const;
  }

  private metadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private isUniqueConflict(error: unknown): error is { code: string; meta?: { target?: unknown } } {
    return Boolean(error && typeof error === "object" && "code" in error
      && (error as { code?: unknown }).code === "P2002");
  }

  private uniqueTargets(error: { meta?: { target?: unknown } }): string[] {
    const target = error.meta?.target;
    return Array.isArray(target) ? target.map(String) : target ? [String(target)] : [];
  }
}
