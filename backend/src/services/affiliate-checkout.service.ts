import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { AffiliateLinkTokenService } from "./affiliate-link-token.service";

export type AffiliateCheckoutSource = "code" | "url";
export type AffiliateCheckoutDiscountType = "none" | "fixed_jpy" | "percent";
export type AffiliateCheckoutClaimStatus = "active" | "expired" | "revoked";
export type AffiliateCheckoutTaskStatus =
  | "draft"
  | "pending_review"
  | "scheduled"
  | "active"
  | "paused"
  | "budget_exhausted"
  | "ended"
  | "cancelled"
  | "rejected";
export type AffiliateCheckoutBudgetStatus = "active" | "exhausted" | "released";
export type AffiliateCheckoutTransactionClient = unknown;

export type AffiliatePromotionSelector = {
  source: AffiliateCheckoutSource;
  value: string;
};

export interface AffiliatePromotionInput {
  affiliateCode?: string;
  affiliatePublicToken?: string;
}

export interface AffiliatePriceInput {
  originalPriceJpy: number;
  discountType: AffiliateCheckoutDiscountType;
  fixedDiscountJpy: number;
  discountRateBps: number;
  discountCapJpy: number;
}

export interface AffiliatePriceSnapshot {
  originalPriceJpy: number;
  customerDiscountJpy: number;
  finalPriceJpy: number;
}

export interface AffiliateCheckoutSummary extends AffiliatePriceSnapshot {
  taskId: number;
  publicCode: string;
  source: AffiliateCheckoutSource;
  rewardAllocatedNdp: number;
  attributionStatus: "attributed" | "invalidated";
}

export interface AffiliateCheckoutBudgetRecord {
  id: number;
  status: AffiliateCheckoutBudgetStatus;
  totalFrozenNdp: number;
  allocatedNdp: number;
  capturedNdp: number;
  releasedNdp: number;
}

export interface AffiliateCheckoutTaskRecord {
  id: number;
  status: AffiliateCheckoutTaskStatus;
  rewardNdpPerCompletedOrder: number;
  customerDiscountType: AffiliateCheckoutDiscountType;
  fixedDiscountJpy: number;
  discountRateBps: number;
  discountCapJpy: number;
  minimumOrderAmountJpy: number;
  taskStartsAt: Date;
  taskEndsAt: Date;
  attributionWindowDays: number;
  budgetReservation: AffiliateCheckoutBudgetRecord | null;
}

export interface AffiliateCheckoutClaimRecord {
  id: number;
  taskId: number;
  claimantUserId: number;
  publicCode: string;
  publicTokenId: string;
  tokenHash: string;
  status: AffiliateCheckoutClaimStatus;
  expiresAt: Date;
  task: AffiliateCheckoutTaskRecord;
}

export interface AffiliateCheckoutPrepared extends AffiliateCheckoutSummary {
  claimId: number;
  claimantUserId: number;
  attributedAt: Date;
  expiresAt: Date;
}

export interface AffiliateCheckoutTouchInput {
  taskId: number;
  claimId: number;
  claimantUserId: number;
  customerUserId: number;
  source: AffiliateCheckoutSource;
  shopId: number;
  serviceId: number;
  occurredAt: Date;
  expiresAt: Date;
}

export interface AffiliateCheckoutAttributionInput extends AffiliatePriceSnapshot {
  taskId: number;
  claimId: number;
  touchId: number;
  bookingOrderId: number;
  activeKey: string;
  claimantUserId: number;
  customerUserId: number;
  shopId: number;
  serviceId: number;
  source: AffiliateCheckoutSource;
  rewardAllocatedNdp: number;
  attributedAt: Date;
  expiresAt: Date;
}

export interface AffiliateCheckoutAuditInput extends AffiliatePriceSnapshot {
  actorUserId: number;
  bookingOrderId: number;
  taskId: number;
  claimId: number;
  publicCode: string;
  source: AffiliateCheckoutSource;
  rewardAllocatedNdp: number;
}

export interface AffiliateCheckoutRepositoryPort {
  forTransaction(
    transactionClient: AffiliateCheckoutTransactionClient
  ): AffiliateCheckoutRepositoryPort;
  resolveAndLockPromotion(input: {
    source: AffiliateCheckoutSource;
    lookupValue: string;
  }): Promise<AffiliateCheckoutClaimRecord | null>;
  serviceIsInTaskScope(
    taskId: number,
    shopId: number,
    serviceId: number
  ): Promise<boolean>;
  createTouch(input: AffiliateCheckoutTouchInput): Promise<number>;
  createAttribution(input: AffiliateCheckoutAttributionInput): Promise<void>;
  allocateAttribution(input: {
    taskId: number;
    claimId: number;
    rewardNdp: number;
    source: AffiliateCheckoutSource;
  }): Promise<void>;
  createAttributionAudit(input: AffiliateCheckoutAuditInput): Promise<void>;
}

export interface AffiliateCheckoutPrepareInput {
  selector: AffiliatePromotionSelector;
  customerUserId: number;
  shopId: number;
  serviceId: number;
  originalPriceJpy: number;
  scheduledStartAt: Date;
  transactionClient: AffiliateCheckoutTransactionClient;
}

export interface AffiliateCheckoutPersistInput {
  bookingOrderId: number;
  customerUserId: number;
  shopId: number;
  serviceId: number;
  prepared: AffiliateCheckoutPrepared;
  transactionClient: AffiliateCheckoutTransactionClient;
}

interface AffiliateCheckoutServiceOptions {
  now?: () => Date;
}

export class AffiliateCheckoutService {
  private readonly now: () => Date;

  public constructor(
    private readonly repository: AffiliateCheckoutRepositoryPort,
    private readonly linkTokens: AffiliateLinkTokenService,
    options: AffiliateCheckoutServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async prepareCheckout(
    input: AffiliateCheckoutPrepareInput
  ): Promise<AffiliateCheckoutPrepared> {
    const repository = this.repository.forTransaction(input.transactionClient);
    const lookupValue = this.resolveLookupValue(input.selector);
    const claim = await repository.resolveAndLockPromotion({
      source: input.selector.source,
      lookupValue
    });
    const currentTime = this.now();

    if (
      !claim ||
      claim.status !== "active" ||
      claim.expiresAt <= currentTime ||
      !this.hasValidSignature(claim, input.selector)
    ) {
      throw this.promotionInvalidError();
    }

    const task = claim.task;
    if (
      (task.status !== "scheduled" && task.status !== "active") ||
      task.taskEndsAt <= currentTime ||
      input.scheduledStartAt < task.taskStartsAt ||
      input.scheduledStartAt >= task.taskEndsAt
    ) {
      throw this.taskNotAttributableError();
    }
    if (claim.claimantUserId === input.customerUserId) {
      throw this.selfAttributionError();
    }
    if (
      !(await repository.serviceIsInTaskScope(
        task.id,
        input.shopId,
        input.serviceId
      ))
    ) {
      throw this.scopeMismatchError();
    }
    if (input.originalPriceJpy < task.minimumOrderAmountJpy) {
      throw this.minimumAmountError();
    }

    const reservation = task.budgetReservation;
    const remainingBudget = reservation
      ? reservation.totalFrozenNdp -
        reservation.allocatedNdp -
        reservation.capturedNdp -
        reservation.releasedNdp
      : 0;
    if (
      !reservation ||
      reservation.status !== "active" ||
      remainingBudget < task.rewardNdpPerCompletedOrder
    ) {
      throw this.budgetUnavailableError();
    }

    const price = calculateAffiliatePrice({
      originalPriceJpy: input.originalPriceJpy,
      discountType: task.customerDiscountType,
      fixedDiscountJpy: task.fixedDiscountJpy,
      discountRateBps: task.discountRateBps,
      discountCapJpy: task.discountCapJpy
    });
    const windowExpiresAt = new Date(
      currentTime.getTime() + task.attributionWindowDays * 24 * 60 * 60 * 1_000
    );

    return {
      claimId: claim.id,
      taskId: task.id,
      claimantUserId: claim.claimantUserId,
      publicCode: claim.publicCode,
      source: input.selector.source,
      ...price,
      rewardAllocatedNdp: task.rewardNdpPerCompletedOrder,
      attributionStatus: "attributed",
      attributedAt: currentTime,
      expiresAt:
        claim.expiresAt < windowExpiresAt ? claim.expiresAt : windowExpiresAt
    };
  }

  public async persistAttribution(
    input: AffiliateCheckoutPersistInput
  ): Promise<void> {
    const repository = this.repository.forTransaction(input.transactionClient);
    const touchId = await repository.createTouch({
      taskId: input.prepared.taskId,
      claimId: input.prepared.claimId,
      claimantUserId: input.prepared.claimantUserId,
      customerUserId: input.customerUserId,
      source: input.prepared.source,
      shopId: input.shopId,
      serviceId: input.serviceId,
      occurredAt: input.prepared.attributedAt,
      expiresAt: input.prepared.expiresAt
    });
    await repository.createAttribution({
      taskId: input.prepared.taskId,
      claimId: input.prepared.claimId,
      touchId,
      bookingOrderId: input.bookingOrderId,
      activeKey: `booking:${input.bookingOrderId}`,
      claimantUserId: input.prepared.claimantUserId,
      customerUserId: input.customerUserId,
      shopId: input.shopId,
      serviceId: input.serviceId,
      source: input.prepared.source,
      originalPriceJpy: input.prepared.originalPriceJpy,
      customerDiscountJpy: input.prepared.customerDiscountJpy,
      finalPriceJpy: input.prepared.finalPriceJpy,
      rewardAllocatedNdp: input.prepared.rewardAllocatedNdp,
      attributedAt: input.prepared.attributedAt,
      expiresAt: input.prepared.expiresAt
    });
    try {
      await repository.allocateAttribution({
        taskId: input.prepared.taskId,
        claimId: input.prepared.claimId,
        rewardNdp: input.prepared.rewardAllocatedNdp,
        source: input.prepared.source
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "error.affiliate.budget_unavailable"
      ) {
        throw this.budgetUnavailableError();
      }
      if (
        error instanceof Error &&
        error.message === "error.affiliate.promotion_invalid"
      ) {
        throw this.promotionInvalidError();
      }
      throw error;
    }
    await repository.createAttributionAudit({
      actorUserId: input.customerUserId,
      bookingOrderId: input.bookingOrderId,
      taskId: input.prepared.taskId,
      claimId: input.prepared.claimId,
      publicCode: input.prepared.publicCode,
      source: input.prepared.source,
      originalPriceJpy: input.prepared.originalPriceJpy,
      customerDiscountJpy: input.prepared.customerDiscountJpy,
      finalPriceJpy: input.prepared.finalPriceJpy,
      rewardAllocatedNdp: input.prepared.rewardAllocatedNdp
    });
  }

  private resolveLookupValue(selector: AffiliatePromotionSelector): string {
    if (selector.source === "code") {
      return selector.value.trim().toUpperCase();
    }
    const [publicTokenId, signature, extra] = selector.value.split(".");
    if (!publicTokenId || !signature || extra) {
      throw this.promotionInvalidError();
    }
    return publicTokenId;
  }

  private hasValidSignature(
    claim: AffiliateCheckoutClaimRecord,
    selector: AffiliatePromotionSelector
  ): boolean {
    if (selector.source === "code") {
      return true;
    }
    return this.linkTokens.verify({
      taskId: claim.taskId,
      userId: claim.claimantUserId,
      expiresAt: claim.expiresAt,
      publicTokenId: claim.publicTokenId,
      publicToken: selector.value,
      tokenHash: claim.tokenHash
    });
  }

  private promotionInvalidError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_PROMOTION_INVALID,
      message: "error.affiliate.promotion_invalid",
      statusCode: 404
    });
  }

  private taskNotAttributableError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_TASK_NOT_ATTRIBUTABLE,
      message: "error.affiliate.task_not_attributable",
      statusCode: 409
    });
  }

  private selfAttributionError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_SELF_ATTRIBUTION_FORBIDDEN,
      message: "error.affiliate.self_attribution_forbidden",
      statusCode: 409
    });
  }

  private scopeMismatchError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_PROMOTION_SCOPE_MISMATCH,
      message: "error.affiliate.promotion_scope_mismatch",
      statusCode: 409
    });
  }

  private minimumAmountError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_MINIMUM_ORDER_AMOUNT_NOT_MET,
      message: "error.affiliate.minimum_order_amount_not_met",
      statusCode: 409
    });
  }

  private budgetUnavailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_BUDGET_UNAVAILABLE,
      message: "error.affiliate.budget_unavailable",
      statusCode: 409
    });
  }
}

export const selectAffiliatePromotion = (
  input: AffiliatePromotionInput
): AffiliatePromotionSelector | null => {
  const code = input.affiliateCode?.trim();
  if (code) {
    return { source: "code", value: code };
  }
  const publicToken = input.affiliatePublicToken?.trim();
  return publicToken ? { source: "url", value: publicToken } : null;
};

export const calculateAffiliatePrice = (
  input: AffiliatePriceInput
): AffiliatePriceSnapshot => {
  assertPriceInput(input);

  let customerDiscountJpy = 0;
  if (input.discountType === "fixed_jpy") {
    customerDiscountJpy = Math.min(input.originalPriceJpy, input.fixedDiscountJpy);
  } else if (input.discountType === "percent") {
    customerDiscountJpy = Math.min(
      input.originalPriceJpy,
      input.discountCapJpy,
      Math.floor((input.originalPriceJpy * input.discountRateBps) / 10_000)
    );
  }

  return {
    originalPriceJpy: input.originalPriceJpy,
    customerDiscountJpy,
    finalPriceJpy: input.originalPriceJpy - customerDiscountJpy
  };
};

const assertPriceInput = (input: AffiliatePriceInput): void => {
  const integers = [
    input.originalPriceJpy,
    input.fixedDiscountJpy,
    input.discountRateBps,
    input.discountCapJpy
  ];
  const invalidInteger = integers.some(
    (value) => !Number.isSafeInteger(value) || value < 0
  );
  const invalidPercentage =
    input.discountType === "percent" &&
    (input.discountRateBps < 1 ||
      input.discountRateBps > 10_000 ||
      input.discountCapJpy < 1);

  if (invalidInteger || invalidPercentage) {
    throw new Error("error.affiliate.price_snapshot_invalid");
  }
};
