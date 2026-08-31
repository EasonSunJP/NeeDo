import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

export type ShopMembershipCardAdjustmentStatusPayload =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "invalidated";
export type ShopMembershipCardAdjustmentDecision = "approve" | "reject";
export type ShopMembershipCardAdjustmentDimension = "principal_balance" | "remaining_uses";

export interface ShopMembershipCardAdjustmentCardContext {
  publicId: string;
  cardNo: string;
  name: string;
  type: "stored_value" | "count" | "benefit";
  status: "active" | "frozen" | "expired" | "void";
  principalBalanceJpy: number | null;
  bonusBalanceJpy: number | null;
  remainingUses: number | null;
  totalUses: number | null;
  lockVersion: number;
}

export interface ShopMembershipCardAdjustmentRecord {
  internalId: number;
  publicId: string;
  status: ShopMembershipCardAdjustmentStatusPayload;
  reason: string;
  beforePrincipalBalanceJpy: number | null;
  targetPrincipalBalanceJpy: number | null;
  beforeRemainingUses: number | null;
  targetRemainingUses: number | null;
  cardLockVersionBefore: number;
  requestFingerprint: string;
  decisionFingerprint: string | null;
  expiresAt: Date;
  decidedAt: Date | null;
  cancelledAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  card: ShopMembershipCardAdjustmentCardContext;
  shop: { shopNo: string | null; name: string };
  customer: { userId: number; needoId: string; displayName: string };
}

export interface ShopMembershipCardAdjustmentCreateInput {
  targetPrincipalBalanceJpy: number | null;
  targetRemainingUses: number | null;
  reason: string;
  idempotencyKey: string;
}

export interface ShopMembershipCardAdjustmentDecisionInput {
  decision: ShopMembershipCardAdjustmentDecision;
  idempotencyKey: string;
}

export interface CreateShopMembershipCardAdjustmentRepositoryInput {
  actorId: number;
  shopId: number;
  cardPublicId: string;
  reason: string;
  beforePrincipalBalanceJpy: number | null;
  targetPrincipalBalanceJpy: number | null;
  beforeRemainingUses: number | null;
  targetRemainingUses: number | null;
  cardLockVersionBefore: number;
  requestIdempotencyKey: string;
  requestFingerprint: string;
  audit: AuditLogCreateInput;
}

export interface DecideShopMembershipCardAdjustmentRepositoryInput {
  customerUserId: number;
  requestPublicId: string;
  decision: ShopMembershipCardAdjustmentDecision;
  decisionIdempotencyKey: string;
  decisionFingerprint: string;
  audit: AuditLogCreateInput;
}

export interface CancelShopMembershipCardAdjustmentRepositoryInput {
  actorId: number;
  shopId: number;
  requestPublicId: string;
  audit: AuditLogCreateInput;
}

export type ShopMembershipCardAdjustmentContextResult =
  | { kind: "ready"; value: ShopMembershipCardAdjustmentCardContext }
  | { kind: "not_found" }
  | { kind: "invalid_state" };

export type ShopMembershipCardAdjustmentCreateResult =
  | { kind: "created" | "replayed"; value: ShopMembershipCardAdjustmentRecord }
  | { kind: "not_found" | "invalid_state" | "pending_conflict" | "idempotency_conflict" };

export type ShopMembershipCardAdjustmentDecisionResult =
  | { kind: "approved" | "rejected" | "expired" | "invalidated" | "replayed"; value: ShopMembershipCardAdjustmentRecord }
  | { kind: "not_found" | "invalid_state" | "idempotency_conflict" };

export type ShopMembershipCardAdjustmentCancelResult =
  | { kind: "cancelled" | "replayed"; value: ShopMembershipCardAdjustmentRecord }
  | { kind: "not_found" | "invalid_state" | "expired" };

export interface ShopMembershipCardAdjustmentListInput extends PaginationInput {
  status?: ShopMembershipCardAdjustmentStatusPayload;
  cardPublicId?: string;
}

export interface ShopMembershipCardAdjustmentRepositoryPort {
  findByRequestIdempotencyKey: (shopId: number, idempotencyKey: string) => Promise<ShopMembershipCardAdjustmentRecord | null>;
  getMerchantCardContext: (shopId: number, cardPublicId: string) => Promise<ShopMembershipCardAdjustmentContextResult>;
  createRequestWithAuditAndNotification: (input: CreateShopMembershipCardAdjustmentRepositoryInput) => Promise<ShopMembershipCardAdjustmentCreateResult>;
  findByDecisionIdempotencyKey: (customerUserId: number, idempotencyKey: string) => Promise<ShopMembershipCardAdjustmentRecord | null>;
  decideRequestWithAuditAndNotification: (input: DecideShopMembershipCardAdjustmentRepositoryInput) => Promise<ShopMembershipCardAdjustmentDecisionResult>;
  cancelRequestWithAuditAndNotification: (input: CancelShopMembershipCardAdjustmentRepositoryInput) => Promise<ShopMembershipCardAdjustmentCancelResult>;
  expireDue?: (input: {
    batchSize: number;
    shopId?: number;
    customerUserId?: number;
  }) => Promise<{ scanned: number; expired: number; failed: number }>;
  listMerchantRequests?: (shopId: number, input: ShopMembershipCardAdjustmentListInput) => Promise<{ list: ShopMembershipCardAdjustmentRecord[]; total: number; page: number; page_size: number }>;
  listCustomerRequests?: (customerUserId: number, input: ShopMembershipCardAdjustmentListInput) => Promise<{ list: ShopMembershipCardAdjustmentRecord[]; total: number; page: number; page_size: number }>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export class ShopMembershipCardAdjustmentService {
  public constructor(
    private readonly repository: ShopMembershipCardAdjustmentRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async create(
    actor: AuthenticatedAccessContext,
    requestContext: AuthRequestContext,
    cardPublicId: string,
    rawInput: ShopMembershipCardAdjustmentCreateInput
  ) {
    const shopId = requireMerchantShopId(actor);
    const input = this.normalizeCreateInput(rawInput);
    const normalizedCardPublicId = cardPublicId.trim();
    const requestFingerprint = this.fingerprint({ cardPublicId: normalizedCardPublicId, ...input, idempotencyKey: undefined });
    const existing = await this.repository.findByRequestIdempotencyKey(shopId, input.idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
      return this.toPublic(existing, true);
    }

    const context = await this.repository.getMerchantCardContext(shopId, normalizedCardPublicId);
    if (context.kind === "not_found") throw this.notFound();
    if (context.kind === "invalid_state") throw this.invalidState();
    const values = this.resolveValues(context.value, input);
    const audit = this.auditInputFactory.createInput({
      actor,
      context: requestContext,
      action: "merchant.shop_membership_card.adjustment.request",
      targetType: "ShopMembershipCardAdjustmentRequest",
      metadata: {
        cardPublicId: normalizedCardPublicId,
        dimension: values.beforePrincipalBalanceJpy === null ? "remaining_uses" : "principal_balance",
        beforeValue: values.beforePrincipalBalanceJpy ?? values.beforeRemainingUses,
        targetValue: values.targetPrincipalBalanceJpy ?? values.targetRemainingUses,
        reason: input.reason,
        cardLockVersionBefore: context.value.lockVersion
      }
    });
    const result = await this.repository.createRequestWithAuditAndNotification({
      actorId: actor.userId,
      shopId,
      cardPublicId: normalizedCardPublicId,
      reason: input.reason,
      ...values,
      cardLockVersionBefore: context.value.lockVersion,
      requestIdempotencyKey: input.idempotencyKey,
      requestFingerprint,
      audit
    });
    if (result.kind === "created" || result.kind === "replayed") {
      if (result.value.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
      return this.toPublic(result.value, result.kind === "replayed");
    }
    if (result.kind === "not_found") throw this.notFound();
    if (result.kind === "pending_conflict") throw this.pendingConflict();
    if (result.kind === "idempotency_conflict") throw this.idempotencyConflict();
    throw this.invalidState();
  }

  public async decide(
    actor: AuthenticatedAccessContext,
    requestContext: AuthRequestContext,
    requestPublicId: string,
    rawInput: ShopMembershipCardAdjustmentDecisionInput
  ) {
    const customerUserId = this.requireCustomer(actor);
    const input = this.normalizeDecisionInput(rawInput);
    const normalizedPublicId = requestPublicId.trim();
    const decisionFingerprint = this.fingerprint({ requestPublicId: normalizedPublicId, decision: input.decision });
    const existing = await this.repository.findByDecisionIdempotencyKey(customerUserId, input.idempotencyKey);
    if (existing) {
      if (existing.decisionFingerprint !== decisionFingerprint) throw this.idempotencyConflict();
      return this.toPublic(existing, true);
    }
    const audit = this.auditInputFactory.createInput({
      actor,
      context: requestContext,
      action: `customer.shop_membership_card.adjustment.${input.decision}`,
      targetType: "ShopMembershipCardAdjustmentRequest",
      metadata: { requestPublicId: normalizedPublicId, decision: input.decision }
    });
    const result = await this.repository.decideRequestWithAuditAndNotification({
      customerUserId,
      requestPublicId: normalizedPublicId,
      decision: input.decision,
      decisionIdempotencyKey: input.idempotencyKey,
      decisionFingerprint,
      audit
    });
    if (result.kind === "approved" || result.kind === "rejected" || result.kind === "replayed") {
      return this.toPublic(result.value, result.kind === "replayed");
    }
    if (result.kind === "expired") throw this.expired();
    if (result.kind === "invalidated") throw this.snapshotConflict();
    if (result.kind === "not_found") throw this.notFound();
    if (result.kind === "idempotency_conflict") throw this.idempotencyConflict();
    throw this.invalidState();
  }

  public async cancel(
    actor: AuthenticatedAccessContext,
    requestContext: AuthRequestContext,
    requestPublicId: string
  ) {
    const shopId = requireMerchantShopId(actor);
    const normalizedPublicId = requestPublicId.trim();
    const audit = this.auditInputFactory.createInput({
      actor,
      context: requestContext,
      action: "merchant.shop_membership_card.adjustment.cancel",
      targetType: "ShopMembershipCardAdjustmentRequest",
      metadata: { requestPublicId: normalizedPublicId }
    });
    const result = await this.repository.cancelRequestWithAuditAndNotification({
      actorId: actor.userId,
      shopId,
      requestPublicId: normalizedPublicId,
      audit
    });
    if (result.kind === "cancelled" || result.kind === "replayed") return this.toPublic(result.value, result.kind === "replayed");
    if (result.kind === "expired") throw this.expired();
    if (result.kind === "not_found") throw this.notFound();
    throw this.invalidState();
  }

  public async listMerchant(actor: AuthenticatedAccessContext, input: ShopMembershipCardAdjustmentListInput) {
    if (!this.repository.listMerchantRequests) throw this.invalidState();
    const shopId = requireMerchantShopId(actor);
    await this.repository.expireDue?.({ batchSize: 100, shopId });
    const page = await this.repository.listMerchantRequests(shopId, input);
    return { ...page, list: page.list.map((item) => this.toPublic(item, false)) };
  }

  public async listCustomer(actor: AuthenticatedAccessContext, input: ShopMembershipCardAdjustmentListInput) {
    if (!this.repository.listCustomerRequests) throw this.invalidState();
    const customerUserId = this.requireCustomer(actor);
    await this.repository.expireDue?.({ batchSize: 100, customerUserId });
    const page = await this.repository.listCustomerRequests(customerUserId, input);
    return { ...page, list: page.list.map((item) => this.toPublic(item, false)) };
  }

  private normalizeCreateInput(input: ShopMembershipCardAdjustmentCreateInput): ShopMembershipCardAdjustmentCreateInput {
    const reason = input.reason?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!reason || reason.length > 500 || !idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160) throw this.invalidValue();
    this.assertOptionalDatabaseInt(input.targetPrincipalBalanceJpy);
    this.assertOptionalDatabaseInt(input.targetRemainingUses);
    if (Number(input.targetPrincipalBalanceJpy !== null) + Number(input.targetRemainingUses !== null) !== 1) throw this.invalidValue();
    return { ...input, reason, idempotencyKey };
  }

  private normalizeDecisionInput(input: ShopMembershipCardAdjustmentDecisionInput): ShopMembershipCardAdjustmentDecisionInput {
    const idempotencyKey = input.idempotencyKey?.trim();
    if ((input.decision !== "approve" && input.decision !== "reject") || !idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160) throw this.invalidValue();
    return { ...input, idempotencyKey };
  }

  private resolveValues(card: ShopMembershipCardAdjustmentCardContext, input: ShopMembershipCardAdjustmentCreateInput) {
    if (card.status !== "active") throw this.invalidState();
    if (card.type === "stored_value") {
      if (card.principalBalanceJpy === null || input.targetPrincipalBalanceJpy === null || input.targetRemainingUses !== null) throw this.invalidValue();
      if (card.principalBalanceJpy === input.targetPrincipalBalanceJpy) throw this.invalidValue();
      return {
        beforePrincipalBalanceJpy: card.principalBalanceJpy,
        targetPrincipalBalanceJpy: input.targetPrincipalBalanceJpy,
        beforeRemainingUses: null,
        targetRemainingUses: null
      };
    }
    if (card.type === "count") {
      if (card.remainingUses === null || card.totalUses === null || input.targetRemainingUses === null || input.targetPrincipalBalanceJpy !== null) throw this.invalidValue();
      if (card.remainingUses === input.targetRemainingUses) throw this.invalidValue();
      const targetTotalUses = card.totalUses + input.targetRemainingUses - card.remainingUses;
      if (!Number.isSafeInteger(targetTotalUses) || targetTotalUses < card.totalUses - card.remainingUses || targetTotalUses > 2_147_483_647) throw this.invalidValue();
      return {
        beforePrincipalBalanceJpy: null,
        targetPrincipalBalanceJpy: null,
        beforeRemainingUses: card.remainingUses,
        targetRemainingUses: input.targetRemainingUses
      };
    }
    throw this.invalidState();
  }

  private toPublic(record: ShopMembershipCardAdjustmentRecord, replayed: boolean) {
    const principal = record.beforePrincipalBalanceJpy !== null;
    const beforeValue = principal ? record.beforePrincipalBalanceJpy : record.beforeRemainingUses;
    const targetValue = principal ? record.targetPrincipalBalanceJpy : record.targetRemainingUses;
    if (beforeValue === null || targetValue === null) throw this.invalidState();
    return {
      publicId: record.publicId,
      status: record.status,
      reason: record.reason,
      dimension: (principal ? "principal_balance" : "remaining_uses") as ShopMembershipCardAdjustmentDimension,
      beforeValue,
      targetValue,
      difference: targetValue - beforeValue,
      expiresAt: record.expiresAt,
      remainingSeconds: Math.max(0, Math.floor((record.expiresAt.getTime() - this.now().getTime()) / 1000)),
      decidedAt: record.decidedAt,
      cancelledAt: record.cancelledAt,
      invalidatedAt: record.invalidatedAt,
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
        remainingUses: record.card.remainingUses,
        totalUses: record.card.totalUses
      },
      shop: record.shop,
      customer: { needoId: record.customer.needoId, displayName: record.customer.displayName },
      replayed
    };
  }

  private requireCustomer(actor: AuthenticatedAccessContext): number {
    if (actor.currentIdentityType !== "customer" || actor.currentIdentityScopeType !== "customer_profile" || !actor.currentIdentityScopeId) {
      throw new AppError({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.identity.forbidden", statusCode: 403 });
    }
    return actor.userId;
  }

  private assertOptionalDatabaseInt(value: number | null): void {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647)) throw this.invalidValue();
  }

  private fingerprint(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private maskCardNumber(cardNo: string): string {
    if (cardNo.length <= 8) return "****";
    return `${cardNo.slice(0, 4)}${"*".repeat(cardNo.length - 8)}${cardNo.slice(-4)}`;
  }

  private notFound(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_NOT_FOUND, message: "error.shop_membership_card_adjustment.not_found", statusCode: 404 });
  }

  private invalidValue(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_INVALID_VALUE, message: "error.shop_membership_card_adjustment.invalid_value", statusCode: 400 });
  }

  private invalidState(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_INVALID_STATE, message: "error.shop_membership_card_adjustment.invalid_state", statusCode: 409 });
  }

  private pendingConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_PENDING_CONFLICT, message: "error.shop_membership_card_adjustment.pending_conflict", statusCode: 409 });
  }

  private expired(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRED, message: "error.shop_membership_card_adjustment.expired", statusCode: 409 });
  }

  private snapshotConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_SNAPSHOT_CONFLICT, message: "error.shop_membership_card_adjustment.snapshot_conflict", statusCode: 409 });
  }

  private idempotencyConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_IDEMPOTENCY_CONFLICT, message: "error.shop_membership_card_adjustment.idempotency_conflict", statusCode: 409 });
  }
}
