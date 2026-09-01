import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

export interface ShopMembershipCardRefundCreateInput {
  reason: string;
  idempotencyKey: string;
}

export interface ShopMembershipRewardReversalInput {
  redemptionId: number;
  shopId: number;
  customerUserId: number;
  customerRewardNdp: number;
  platformFeeNdp: number;
  shopWalletId: number;
  customerWalletId: number;
  platformWalletId: number | null;
  idempotencyKey: string;
  actorUserId: number;
}

export interface ShopMembershipRewardReversalResult {
  transaction: { id: number; transactionNo: string };
  shopWalletId: number;
  customerWalletId: number;
  platformWalletId: number | null;
  customerBalanceBeforeNdp: number;
  customerBalanceAfterNdp: number;
}

export type ShopMembershipRewardReversal = (
  input: ShopMembershipRewardReversalInput,
  transactionClient: unknown
) => Promise<ShopMembershipRewardReversalResult>;

export interface ShopMembershipCardRefundRecord {
  internalId: number;
  publicId: string;
  requestFingerprint: string;
  status: "applied";
  reason: string;
  reversalMode: "none" | "cancelled_pending" | "ledger_reversed";
  restoredPrincipalJpy: number;
  restoredUses: number;
  principalBalanceBeforeJpy: number | null;
  principalBalanceAfterJpy: number | null;
  remainingUsesBefore: number | null;
  remainingUsesAfter: number | null;
  customerRewardReversedNdp: number;
  platformFeeReversedNdp: number;
  totalShopCreditNdp: number;
  customerBalanceBeforeNdp: number | null;
  customerBalanceAfterNdp: number | null;
  orderPaymentRefundedAt: Date;
  refundedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  redemption: { publicId: string; rewardStatusBefore: "none" | "pending_funds" | "paid" };
  card: {
    publicId: string;
    cardNo: string;
    name: string;
    type: "stored_value" | "count" | "benefit";
    status: "active" | "frozen" | "expired" | "void";
    principalBalanceJpy: number | null;
    bonusBalanceJpy: number | null;
    remainingUses: number | null;
  };
  order: { orderNo: string; serviceName: string };
  shop: { shopNo: string | null; name: string };
  customer: { needoId: string; displayName: string };
  refundedBy: { needoId: string; displayName: string };
  reversalLedgerTransactionNo: string | null;
}

export interface CreateShopMembershipCardRefundRepositoryInput {
  actorId: number;
  shopId: number;
  redemptionPublicId: string;
  reason: string;
  idempotencyKey: string;
  requestFingerprint: string;
  audit: AuditLogCreateInput;
}

export type ShopMembershipCardRefundMutationResult =
  | { kind: "created" | "replayed"; value: ShopMembershipCardRefundRecord }
  | {
      kind:
        | "not_found"
        | "invalid_state"
        | "order_not_refunded"
        | "pending_conflict"
        | "concurrency_conflict"
        | "idempotency_conflict";
    };

export interface ShopMembershipCardRefundRepositoryPort {
  findByIdempotencyKey: (
    shopId: number,
    idempotencyKey: string
  ) => Promise<ShopMembershipCardRefundRecord | null>;
  refundWithReversalAuditAndNotification: (
    input: CreateShopMembershipCardRefundRepositoryInput,
    reverse: ShopMembershipRewardReversal
  ) => Promise<ShopMembershipCardRefundMutationResult>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;
type ReversalPort = {
  reverseShopMembershipReward: (
    input: ShopMembershipRewardReversalInput,
    context?: { transactionClient?: unknown }
  ) => Promise<ShopMembershipRewardReversalResult>;
};

export class ShopMembershipCardRefundService {
  public constructor(
    private readonly repository: ShopMembershipCardRefundRepositoryPort,
    private readonly reversal: ReversalPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public async create(
    actor: AuthenticatedAccessContext,
    requestContext: AuthRequestContext,
    redemptionPublicId: string,
    rawInput: ShopMembershipCardRefundCreateInput
  ) {
    const shopId = requireMerchantShopId(actor);
    const normalizedRedemptionPublicId = redemptionPublicId.trim();
    const input = this.normalizeInput(rawInput);
    if (!normalizedRedemptionPublicId) throw this.invalidValue();
    const requestFingerprint = this.fingerprint({
      redemptionPublicId: normalizedRedemptionPublicId,
      shopId,
      reason: input.reason
    });
    const existing = await this.repository.findByIdempotencyKey(shopId, input.idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
      return this.toPublic(existing, true);
    }
    const audit = this.auditInputFactory.createInput({
      actor,
      context: requestContext,
      action: "merchant.shop_membership_card.redemption.refund",
      targetType: "ShopMembershipCardRedemptionRefund",
      metadata: {
        redemptionPublicId: normalizedRedemptionPublicId,
        reason: input.reason,
        idempotencyKeyHash: this.fingerprint(input.idempotencyKey)
      }
    });
    const result = await this.repository.refundWithReversalAuditAndNotification(
      {
        actorId: actor.userId,
        shopId,
        redemptionPublicId: normalizedRedemptionPublicId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        audit
      },
      (reversalInput, transactionClient) =>
        this.reversal.reverseShopMembershipReward(reversalInput, { transactionClient })
    );
    if (result.kind === "created" || result.kind === "replayed") {
      if (result.value.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
      return this.toPublic(result.value, result.kind === "replayed");
    }
    this.throwMutationError(result.kind);
  }

  private normalizeInput(input: ShopMembershipCardRefundCreateInput): ShopMembershipCardRefundCreateInput {
    const reason = input.reason?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      !reason || reason.length < 2 || reason.length > 500
      || !idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160
    ) throw this.invalidValue();
    return { reason, idempotencyKey };
  }

  private toPublic(record: ShopMembershipCardRefundRecord, replayed: boolean) {
    return {
      publicId: record.publicId,
      status: record.status,
      reason: record.reason,
      reversalMode: record.reversalMode,
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
      redemption: record.redemption,
      card: {
        publicId: record.card.publicId,
        cardNoMasked: this.maskCardNumber(record.card.cardNo),
        name: record.card.name,
        type: record.card.type,
        status: record.card.status,
        principalBalanceJpy: record.card.principalBalanceJpy,
        bonusBalanceJpy: record.card.bonusBalanceJpy,
        remainingUses: record.card.remainingUses
      },
      order: record.order,
      shop: record.shop,
      customer: record.customer,
      refundedBy: record.refundedBy,
      reversalLedgerTransactionNo: record.reversalLedgerTransactionNo,
      replayed
    };
  }

  private throwMutationError(
    kind: Exclude<ShopMembershipCardRefundMutationResult, { kind: "created" | "replayed" }>["kind"]
  ): never {
    if (kind === "not_found") throw this.notFound();
    if (kind === "order_not_refunded") throw this.orderNotRefunded();
    if (kind === "pending_conflict") throw this.pendingConflict();
    if (kind === "concurrency_conflict") throw this.concurrencyConflict();
    if (kind === "idempotency_conflict") throw this.idempotencyConflict();
    throw this.invalidState();
  }

  private fingerprint(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private maskCardNumber(cardNo: string): string {
    if (cardNo.length <= 8) return "****";
    return `${cardNo.slice(0, 4)}${"*".repeat(cardNo.length - 8)}${cardNo.slice(-4)}`;
  }

  private notFound() { return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_NOT_FOUND, message: "error.shop_membership_card_refund.not_found", statusCode: 404 }); }
  private invalidValue() { return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_INVALID_VALUE, message: "error.shop_membership_card_refund.invalid_value", statusCode: 400 }); }
  private invalidState() { return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_INVALID_STATE, message: "error.shop_membership_card_refund.invalid_state", statusCode: 409 }); }
  private orderNotRefunded() { return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_ORDER_NOT_REFUNDED, message: "error.shop_membership_card_refund.order_not_refunded", statusCode: 409 }); }
  private pendingConflict() { return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_PENDING_CONFLICT, message: "error.shop_membership_card_refund.pending_conflict", statusCode: 409 }); }
  private concurrencyConflict() { return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_CONCURRENCY_CONFLICT, message: "error.shop_membership_card_refund.concurrency_conflict", statusCode: 409 }); }
  private idempotencyConflict() { return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_IDEMPOTENCY_CONFLICT, message: "error.shop_membership_card_refund.idempotency_conflict", statusCode: 409 }); }
}
