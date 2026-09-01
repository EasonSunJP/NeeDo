import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import {
  evaluateMembershipRewardRules,
  type MembershipRewardPreviewFacts,
  type MembershipRewardPreviewResult,
  type MembershipRewardRuleHit
} from "../domain/shop-membership-reward-rule";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type {
  LedgerTransactionClient,
  SettleShopMembershipRewardInput,
  ShopMembershipRewardLedgerResult
} from "./ledger.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

export interface ShopMembershipCardRedemptionCreateInput {
  orderNo: string;
  idempotencyKey: string;
}

export interface ShopMembershipCardRedemptionListInput extends PaginationInput {
  cardPublicId?: string;
}

export interface ShopMembershipCardRedemptionCandidateContext {
  bookingOrderId: number;
  orderNo: string;
  serviceName: string;
  servicePublicId: string | null;
  serviceCategoryCode: string | null;
  serviceStartedAt: Date;
  serviceCompletedAt: Date;
  eligibleAmountJpy: number;
  consumedPrincipalJpy: number;
  consumedUses: number;
  principalBalanceBeforeJpy: number | null;
  principalBalanceAfterJpy: number | null;
  remainingUsesBefore: number | null;
  remainingUsesAfter: number | null;
  cardLockVersionBefore: number;
  rules: unknown;
  caps: unknown;
  platformFeeRateBps: number;
  facts: MembershipRewardPreviewFacts;
}

export interface ShopMembershipCardRedemptionRecord {
  internalId: number;
  publicId: string;
  requestFingerprint: string;
  status: "applied" | "refunded";
  rewardStatus: "none" | "pending_funds" | "paid" | "reversed";
  rewardFacts: MembershipRewardPreviewFacts;
  rewardHits: MembershipRewardRuleHit[];
  rawRewardNdp: number;
  customerRewardNdp: number;
  platformFeeRateBps: number;
  platformFeeNdp: number;
  totalShopDebitNdp: number;
  rewardCapped: boolean;
  outstandingRewardNdp: number;
  consumedPrincipalJpy: number;
  consumedUses: number;
  principalBalanceBeforeJpy: number | null;
  principalBalanceAfterJpy: number | null;
  remainingUsesBefore: number | null;
  remainingUsesAfter: number | null;
  redeemedAt: Date;
  rewardSettledAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  card: {
    publicId: string;
    cardNo: string;
    name: string;
    type: "stored_value" | "count" | "benefit";
    status: "active" | "frozen" | "expired" | "void";
    principalBalanceJpy: number | null;
    bonusBalanceJpy: number | null;
    remainingUses: number | null;
    lockVersion: number;
  };
  order: {
    orderNo: string;
    serviceName: string;
    servicePublicId: string | null;
    serviceCategoryCode: string | null;
    serviceStartedAt: Date;
    serviceCompletedAt: Date;
    eligibleAmountJpy: number;
    paymentStatus: "pending" | "confirmed" | "refundPending" | "refunded";
    paymentRefundedAt: Date | null;
  };
  shop: { shopNo: string | null; name: string };
  customer: { userId: number; needoId: string; displayName: string };
  redeemedBy: { needoId: string; displayName: string };
  ledgerTransactionNo: string | null;
  refund: null | {
    publicId: string;
    reason: string;
    reversalMode: "none" | "cancelled_pending" | "ledger_reversed";
    restoredPrincipalJpy: number;
    restoredUses: number;
    customerRewardReversedNdp: number;
    platformFeeReversedNdp: number;
    totalShopCreditNdp: number;
    customerBalanceBeforeNdp: number | null;
    customerBalanceAfterNdp: number | null;
    refundedAt: Date;
    refundedBy: { needoId: string; displayName: string };
    reversalLedgerTransactionNo: string | null;
  };
}

export interface CreateShopMembershipCardRedemptionRepositoryInput {
  actorId: number;
  shopId: number;
  cardPublicId: string;
  orderNo: string;
  idempotencyKey: string;
  requestFingerprint: string;
  audit: AuditLogCreateInput;
}

export type ShopMembershipCardRedemptionMutationResult =
  | { kind: "created" | "replayed"; value: ShopMembershipCardRedemptionRecord }
  | {
      kind:
        | "not_found"
        | "invalid_state"
        | "pending_conflict"
        | "order_not_eligible"
        | "insufficient_card_value"
        | "concurrency_conflict"
        | "idempotency_conflict";
    };

export type MembershipRewardEvaluator = (
  context: ShopMembershipCardRedemptionCandidateContext
) => MembershipRewardPreviewResult;

export type MembershipRewardSettlement = (
  input: SettleShopMembershipRewardInput,
  transactionClient: LedgerTransactionClient
) => Promise<ShopMembershipRewardLedgerResult | null>;

export interface ShopMembershipCardRedemptionRepositoryPort {
  findByIdempotencyKey: (
    shopId: number,
    idempotencyKey: string
  ) => Promise<ShopMembershipCardRedemptionRecord | null>;
  listCandidates: (
    shopId: number,
    cardPublicId: string,
    input: PaginationInput
  ) => Promise<{
    list: ShopMembershipCardRedemptionCandidateContext[];
    total: number;
    page: number;
    page_size: number;
  }>;
  createWithEvaluationAndSettlement: (
    input: CreateShopMembershipCardRedemptionRepositoryInput,
    evaluate: MembershipRewardEvaluator,
    settle: MembershipRewardSettlement
  ) => Promise<ShopMembershipCardRedemptionMutationResult>;
  listMerchant: (
    shopId: number,
    input: ShopMembershipCardRedemptionListInput
  ) => Promise<{ list: ShopMembershipCardRedemptionRecord[]; total: number; page: number; page_size: number }>;
  listCustomer: (
    customerUserId: number,
    input: ShopMembershipCardRedemptionListInput
  ) => Promise<{ list: ShopMembershipCardRedemptionRecord[]; total: number; page: number; page_size: number }>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;
type SettlementPort = {
  settleShopMembershipReward: (
    input: SettleShopMembershipRewardInput,
    context?: { transactionClient?: LedgerTransactionClient }
  ) => Promise<ShopMembershipRewardLedgerResult | null>;
};

export class ShopMembershipCardRedemptionService {
  public constructor(
    private readonly repository: ShopMembershipCardRedemptionRepositoryPort,
    private readonly settlement: SettlementPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public async create(
    actor: AuthenticatedAccessContext,
    requestContext: AuthRequestContext,
    cardPublicId: string,
    rawInput: ShopMembershipCardRedemptionCreateInput
  ) {
    const shopId = requireMerchantShopId(actor);
    const normalizedCardPublicId = cardPublicId.trim();
    const input = this.normalizeCreateInput(rawInput);
    if (!normalizedCardPublicId) throw this.invalidValue();
    const requestFingerprint = this.fingerprint({
      cardPublicId: normalizedCardPublicId,
      orderNo: input.orderNo
    });
    const existing = await this.repository.findByIdempotencyKey(shopId, input.idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
      return this.toPublic(existing, true);
    }
    const audit = this.auditInputFactory.createInput({
      actor,
      context: requestContext,
      action: "merchant.shop_membership_card.redemption.create",
      targetType: "ShopMembershipCardRedemption",
      metadata: {
        cardPublicId: normalizedCardPublicId,
        orderNo: input.orderNo,
        idempotencyKeyHash: this.fingerprint(input.idempotencyKey)
      }
    });
    const result = await this.repository.createWithEvaluationAndSettlement(
      {
        actorId: actor.userId,
        shopId,
        cardPublicId: normalizedCardPublicId,
        orderNo: input.orderNo,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        audit
      },
      (context) => evaluateMembershipRewardRules({
        rules: context.rules,
        caps: context.caps,
        facts: context.facts,
        platformFeeRateBps: context.platformFeeRateBps
      }),
      (settlementInput, transactionClient) =>
        this.settlement.settleShopMembershipReward(settlementInput, { transactionClient })
    );
    if (result.kind === "created" || result.kind === "replayed") {
      if (result.value.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
      return this.toPublic(result.value, result.kind === "replayed");
    }
    this.throwMutationError(result.kind);
  }

  public async listCandidates(
    actor: AuthenticatedAccessContext,
    cardPublicId: string,
    input: PaginationInput
  ) {
    const normalizedCardPublicId = cardPublicId.trim();
    if (!normalizedCardPublicId) throw this.invalidValue();
    const page = await this.repository.listCandidates(
      requireMerchantShopId(actor),
      normalizedCardPublicId,
      input
    );
    return {
      ...page,
      list: page.list.map((candidate) => ({
        orderNo: candidate.orderNo,
        serviceName: candidate.serviceName,
        servicePublicId: candidate.servicePublicId,
        serviceCategoryCode: candidate.serviceCategoryCode,
        serviceStartedAt: candidate.serviceStartedAt,
        serviceCompletedAt: candidate.serviceCompletedAt,
        eligibleAmountJpy: candidate.eligibleAmountJpy,
        consumption: {
          principalJpy: candidate.consumedPrincipalJpy,
          uses: candidate.consumedUses,
          principalBalanceBeforeJpy: candidate.principalBalanceBeforeJpy,
          principalBalanceAfterJpy: candidate.principalBalanceAfterJpy,
          remainingUsesBefore: candidate.remainingUsesBefore,
          remainingUsesAfter: candidate.remainingUsesAfter
        },
        reward: evaluateMembershipRewardRules({
          rules: candidate.rules,
          caps: candidate.caps,
          facts: candidate.facts,
          platformFeeRateBps: candidate.platformFeeRateBps
        })
      }))
    };
  }

  public async listMerchant(
    actor: AuthenticatedAccessContext,
    input: ShopMembershipCardRedemptionListInput
  ) {
    const page = await this.repository.listMerchant(requireMerchantShopId(actor), input);
    return { ...page, list: page.list.map((record) => this.toPublic(record, false)) };
  }

  public async listCustomer(
    actor: AuthenticatedAccessContext,
    input: ShopMembershipCardRedemptionListInput
  ) {
    const page = await this.repository.listCustomer(this.requireCustomer(actor), input);
    return { ...page, list: page.list.map((record) => this.toPublic(record, false)) };
  }

  private normalizeCreateInput(
    input: ShopMembershipCardRedemptionCreateInput
  ): ShopMembershipCardRedemptionCreateInput {
    const orderNo = input.orderNo?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      !orderNo ||
      orderNo.length > 40 ||
      !idempotencyKey ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 160
    ) {
      throw this.invalidValue();
    }
    return { orderNo, idempotencyKey };
  }

  private toPublic(record: ShopMembershipCardRedemptionRecord, replayed: boolean) {
    return {
      publicId: record.publicId,
      status: record.status,
      rewardStatus: record.rewardStatus,
      rewardFacts: record.rewardFacts,
      rewardHits: record.rewardHits,
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
      customer: {
        needoId: record.customer.needoId,
        displayName: record.customer.displayName
      },
      redeemedBy: record.redeemedBy,
      ledgerTransactionNo: record.ledgerTransactionNo,
      refund: record.refund,
      replayed
    };
  }

  private requireCustomer(actor: AuthenticatedAccessContext): number {
    if (
      actor.currentIdentityType !== "customer" ||
      actor.currentIdentityScopeType !== "customer_profile" ||
      !actor.currentIdentityScopeId
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
    return actor.userId;
  }

  private throwMutationError(kind: Exclude<ShopMembershipCardRedemptionMutationResult, { kind: "created" | "replayed" }>["kind"]): never {
    if (kind === "not_found") throw this.notFound();
    if (kind === "invalid_state") throw this.invalidState();
    if (kind === "pending_conflict") throw this.pendingConflict();
    if (kind === "order_not_eligible") throw this.orderNotEligible();
    if (kind === "insufficient_card_value") throw this.insufficientCardValue();
    if (kind === "concurrency_conflict") throw this.concurrencyConflict();
    throw this.idempotencyConflict();
  }

  private fingerprint(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private maskCardNumber(cardNo: string): string {
    if (cardNo.length <= 8) return "****";
    return `${cardNo.slice(0, 4)}${"*".repeat(cardNo.length - 8)}${cardNo.slice(-4)}`;
  }

  private notFound(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_NOT_FOUND, message: "error.shop_membership_card_redemption.not_found", statusCode: 404 });
  }

  private invalidValue(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_INVALID_VALUE, message: "error.shop_membership_card_redemption.invalid_value", statusCode: 400 });
  }

  private invalidState(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_INVALID_STATE, message: "error.shop_membership_card_redemption.invalid_state", statusCode: 409 });
  }

  private pendingConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_PENDING_CONFLICT, message: "error.shop_membership_card_redemption.pending_conflict", statusCode: 409 });
  }

  private orderNotEligible(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_ORDER_NOT_ELIGIBLE, message: "error.shop_membership_card_redemption.order_not_eligible", statusCode: 409 });
  }

  private insufficientCardValue(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_INSUFFICIENT_CARD_VALUE, message: "error.shop_membership_card_redemption.insufficient_card_value", statusCode: 409 });
  }

  private concurrencyConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_CONCURRENCY_CONFLICT, message: "error.shop_membership_card_redemption.concurrency_conflict", statusCode: 409 });
  }

  private idempotencyConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_IDEMPOTENCY_CONFLICT, message: "error.shop_membership_card_redemption.idempotency_conflict", statusCode: 409 });
  }
}
