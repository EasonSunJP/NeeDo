import { createHash, randomBytes } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type ShopMembershipCardIssuanceSourcePayload =
  | "offline_paid"
  | "historical_replacement"
  | "manual_grant";
export type ShopMembershipCardIssuanceTypePayload = "stored_value" | "count" | "benefit";
export type ShopMembershipCardIssuanceStatusPayload = "active" | "frozen" | "expired" | "void";

export interface ShopMembershipCardIssuanceInput {
  planPublicId: string;
  initialPrincipalJpy: number | null;
  initialUses: number | null;
  issuanceSource: ShopMembershipCardIssuanceSourcePayload;
  issuanceReference: string | null;
  issuanceNote: string | null;
  idempotencyKey: string;
}

export type ShopMembershipCardIssuanceValidity =
  | { mode: "never" }
  | { mode: "fixed_days"; days: number }
  | { mode: "fixed_date"; expiresAt: Date };

export interface ShopMembershipCardIssuanceContext {
  membership: {
    internalId: number;
    publicId: string;
    customerUserId: number;
    customerNeedoId: string;
    customerDisplayName: string;
  };
  shop: { internalId: number; publicId: string; shopNo: string | null; name: string };
  plan: { internalId: number; publicId: string };
  version: {
    internalId: number;
    publicId: string;
    version: number;
    name: string;
    cardType: ShopMembershipCardIssuanceTypePayload;
    validity: ShopMembershipCardIssuanceValidity;
    minInitialPrincipalJpy: number | null;
    maxInitialPrincipalJpy: number | null;
    minInitialUses: number | null;
    maxInitialUses: number | null;
    platformFeeRateBps: number | null;
  };
}

export interface IssuedMembershipCardRecord {
  internalId: number;
  publicId: string;
  cardNo: string;
  name: string;
  type: ShopMembershipCardIssuanceTypePayload;
  status: ShopMembershipCardIssuanceStatusPayload;
  principalBalanceJpy: number | null;
  bonusBalanceJpy: number | null;
  remainingUses: number | null;
  totalUses: number | null;
  initialPrincipalJpy: number | null;
  initialUses: number | null;
  issuanceSource: ShopMembershipCardIssuanceSourcePayload;
  issuanceReference: string | null;
  issuanceNote: string | null;
  issuedAt: Date;
  expiresAt: Date | null;
  frozenAt: Date | null;
  platformFeeRateBpsSnapshot: number;
  issuanceFingerprint: string;
  planPublicId: string;
  planVersionPublicId: string;
  planVersion: number;
  customerNeedoId: string;
  customerDisplayName: string;
}

export interface CreateMembershipCardIssuanceRepositoryInput {
  actorId: number;
  shopId: number;
  membershipPublicId: string;
  planPublicId: string;
  expectedPlanVersionPublicId: string;
  cardNo: string;
  type: ShopMembershipCardIssuanceTypePayload;
  name: string;
  principalBalanceJpy: number | null;
  bonusBalanceJpy: number | null;
  remainingUses: number | null;
  totalUses: number | null;
  initialPrincipalJpy: number | null;
  initialUses: number | null;
  issuanceSource: ShopMembershipCardIssuanceSourcePayload;
  issuanceReference: string | null;
  issuanceNote: string | null;
  platformFeeRateBpsSnapshot: number;
  issuanceIdempotencyKey: string;
  issuanceFingerprint: string;
  issuedAt: Date;
  expiresAt: Date | null;
  audit: AuditLogCreateInput;
}

export type ShopMembershipCardIssuanceContextResult =
  | { kind: "ready"; value: ShopMembershipCardIssuanceContext }
  | { kind: "not_found" }
  | { kind: "invalid_state" };

export type ShopMembershipCardIssuanceMutationResult =
  | { kind: "created" | "replayed"; value: IssuedMembershipCardRecord }
  | { kind: "not_found" }
  | { kind: "invalid_state" }
  | { kind: "idempotency_conflict" }
  | { kind: "card_number_conflict" };

export interface ShopMembershipCardIssuanceRepositoryPort {
  findByIdempotencyKey: (shopId: number, idempotencyKey: string) => Promise<IssuedMembershipCardRecord | null>;
  getIssuanceContext: (shopId: number, membershipPublicId: string, planPublicId: string) => Promise<ShopMembershipCardIssuanceContextResult>;
  issueCardWithAuditAndNotification: (input: CreateMembershipCardIssuanceRepositoryInput) => Promise<ShopMembershipCardIssuanceMutationResult>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;
const merchantIdentityTypes = new Set(["merchant", "merchant_owner", "merchant_staff"]);
const validSources = new Set<ShopMembershipCardIssuanceSourcePayload>([
  "offline_paid",
  "historical_replacement",
  "manual_grant"
]);

export class ShopMembershipCardIssuanceService {
  public constructor(
    private readonly repository: ShopMembershipCardIssuanceRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory,
    private readonly now: () => Date = () => new Date(),
    private readonly generateCardNumber: () => string = () => `NMC-${randomBytes(12).toString("hex").toUpperCase()}`
  ) {}

  public async issue(
    actor: AuthenticatedAccessContext,
    requestContext: AuthRequestContext,
    membershipPublicId: string,
    rawInput: ShopMembershipCardIssuanceInput
  ) {
    const shopId = this.requireMerchantShop(actor);
    const input = this.normalizeInput(rawInput);
    const issuanceFingerprint = this.fingerprint(membershipPublicId, input);
    const existing = await this.repository.findByIdempotencyKey(shopId, input.idempotencyKey);
    if (existing) {
      if (existing.issuanceFingerprint !== issuanceFingerprint) throw this.idempotencyConflict();
      return this.toPublic(existing, true);
    }

    const contextResult = await this.repository.getIssuanceContext(shopId, membershipPublicId, input.planPublicId);
    if (contextResult.kind === "not_found") throw this.notFound();
    if (contextResult.kind === "invalid_state") throw this.invalidState();
    const issuanceContext = contextResult.value;
    const issuedAt = this.now();
    const values = this.resolveValues(issuanceContext, input);
    const expiresAt = this.resolveExpiry(issuanceContext.version.validity, issuedAt);
    const platformFeeRateBpsSnapshot = issuanceContext.version.platformFeeRateBps;
    if (platformFeeRateBpsSnapshot === null || platformFeeRateBpsSnapshot < 0 || platformFeeRateBpsSnapshot > 10_000) {
      throw this.invalidState();
    }

    const audit = this.auditInputFactory.createInput({
      actor,
      context: requestContext,
      action: "merchant.shop_membership_card.issue",
      targetType: "ShopMembershipCard",
      metadata: {
        membershipPublicId,
        customerNeedoId: issuanceContext.membership.customerNeedoId,
        shopNo: issuanceContext.shop.shopNo,
        planPublicId: issuanceContext.plan.publicId,
        planVersionPublicId: issuanceContext.version.publicId,
        planVersion: issuanceContext.version.version,
        cardType: issuanceContext.version.cardType,
        initialPrincipalJpy: values.initialPrincipalJpy,
        initialUses: values.initialUses,
        issuanceSource: input.issuanceSource,
        platformFeeRateBpsSnapshot
      }
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await this.repository.issueCardWithAuditAndNotification({
        actorId: actor.userId,
        shopId,
        membershipPublicId,
        planPublicId: issuanceContext.plan.publicId,
        expectedPlanVersionPublicId: issuanceContext.version.publicId,
        cardNo: this.generateCardNumber(),
        type: issuanceContext.version.cardType,
        name: issuanceContext.version.name,
        ...values,
        issuanceSource: input.issuanceSource,
        issuanceReference: input.issuanceReference,
        issuanceNote: input.issuanceNote,
        platformFeeRateBpsSnapshot,
        issuanceIdempotencyKey: input.idempotencyKey,
        issuanceFingerprint,
        issuedAt,
        expiresAt,
        audit
      });
      if (result.kind === "created") return this.toPublic(result.value, false);
      if (result.kind === "replayed") {
        if (result.value.issuanceFingerprint !== issuanceFingerprint) throw this.idempotencyConflict();
        return this.toPublic(result.value, true);
      }
      if (result.kind === "not_found") throw this.notFound();
      if (result.kind === "invalid_state") throw this.invalidState();
      if (result.kind === "idempotency_conflict") throw this.idempotencyConflict();
      if (attempt === 2) throw this.invalidState();
    }
    throw this.invalidState();
  }

  private normalizeInput(input: ShopMembershipCardIssuanceInput): ShopMembershipCardIssuanceInput {
    const issuanceReference = this.normalizeOptionalText(input.issuanceReference);
    const issuanceNote = this.normalizeOptionalText(input.issuanceNote);
    const planPublicId = input.planPublicId?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!planPublicId || !idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160 || !validSources.has(input.issuanceSource)) {
      throw this.invalidValue();
    }
    if (input.issuanceSource === "offline_paid" && !issuanceReference && !issuanceNote) throw this.invalidValue();
    if (input.issuanceSource !== "offline_paid" && !issuanceNote) throw this.invalidValue();
    this.assertOptionalSafeNonNegativeInteger(input.initialPrincipalJpy);
    this.assertOptionalSafeNonNegativeInteger(input.initialUses);
    return { ...input, planPublicId, idempotencyKey, issuanceReference, issuanceNote };
  }

  private resolveValues(context: ShopMembershipCardIssuanceContext, input: ShopMembershipCardIssuanceInput) {
    const version = context.version;
    if (version.cardType === "stored_value") {
      if (input.initialPrincipalJpy === null || input.initialUses !== null) throw this.invalidValue();
      this.assertWithinRange(input.initialPrincipalJpy, version.minInitialPrincipalJpy, version.maxInitialPrincipalJpy);
      return {
        initialPrincipalJpy: input.initialPrincipalJpy,
        initialUses: null,
        principalBalanceJpy: input.initialPrincipalJpy,
        bonusBalanceJpy: 0,
        remainingUses: null,
        totalUses: null
      };
    }
    if (version.cardType === "count") {
      if (input.initialUses === null || input.initialPrincipalJpy !== null) throw this.invalidValue();
      this.assertWithinRange(input.initialUses, version.minInitialUses, version.maxInitialUses);
      return {
        initialPrincipalJpy: null,
        initialUses: input.initialUses,
        principalBalanceJpy: null,
        bonusBalanceJpy: null,
        remainingUses: input.initialUses,
        totalUses: input.initialUses
      };
    }
    if (input.initialPrincipalJpy !== null || input.initialUses !== null) throw this.invalidValue();
    return {
      initialPrincipalJpy: null,
      initialUses: null,
      principalBalanceJpy: null,
      bonusBalanceJpy: null,
      remainingUses: null,
      totalUses: null
    };
  }

  private resolveExpiry(validity: ShopMembershipCardIssuanceValidity, issuedAt: Date): Date | null {
    if (validity.mode === "never") return null;
    if (validity.mode === "fixed_days") {
      if (!Number.isSafeInteger(validity.days) || validity.days <= 0) throw this.invalidState();
      return new Date(issuedAt.getTime() + validity.days * 24 * 60 * 60 * 1000);
    }
    if (!(validity.expiresAt instanceof Date) || Number.isNaN(validity.expiresAt.getTime()) || validity.expiresAt <= issuedAt) {
      throw this.invalidState();
    }
    return new Date(validity.expiresAt);
  }

  private fingerprint(membershipPublicId: string, input: ShopMembershipCardIssuanceInput): string {
    return createHash("sha256").update(JSON.stringify({
      membershipPublicId,
      planPublicId: input.planPublicId,
      initialPrincipalJpy: input.initialPrincipalJpy,
      initialUses: input.initialUses,
      issuanceSource: input.issuanceSource,
      issuanceReference: input.issuanceReference,
      issuanceNote: input.issuanceNote
    })).digest("hex");
  }

  private toPublic(record: IssuedMembershipCardRecord, replayed: boolean) {
    return {
      publicId: record.publicId,
      cardNoMasked: this.maskCardNumber(record.cardNo),
      name: record.name,
      type: record.type,
      status: record.status,
      principalBalanceJpy: record.principalBalanceJpy,
      bonusBalanceJpy: record.bonusBalanceJpy,
      remainingUses: record.remainingUses,
      totalUses: record.totalUses,
      initialPrincipalJpy: record.initialPrincipalJpy,
      initialUses: record.initialUses,
      issuanceSource: record.issuanceSource,
      issuanceReference: record.issuanceReference,
      issuanceNote: record.issuanceNote,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      frozenAt: record.frozenAt,
      platformFeeRateBpsSnapshot: record.platformFeeRateBpsSnapshot,
      planPublicId: record.planPublicId,
      planVersionPublicId: record.planVersionPublicId,
      planVersion: record.planVersion,
      customerNeedoId: record.customerNeedoId,
      customerDisplayName: record.customerDisplayName,
      replayed
    };
  }

  private requireMerchantShop(actor: AuthenticatedAccessContext): number {
    if (!actor.currentIdentityType || !merchantIdentityTypes.has(actor.currentIdentityType) || actor.currentIdentityScopeType !== "shop" || !actor.currentIdentityScopeId) {
      throw new AppError({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.auth.identity_forbidden", statusCode: 403 });
    }
    return actor.currentIdentityScopeId;
  }

  private normalizeOptionalText(value: string | null): string | null {
    const normalized = value?.trim() ?? "";
    return normalized || null;
  }

  private assertOptionalSafeNonNegativeInteger(value: number | null): void {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw this.invalidValue();
  }

  private assertWithinRange(value: number, minimum: number | null, maximum: number | null): void {
    if ((minimum !== null && value < minimum) || (maximum !== null && value > maximum)) throw this.invalidValue();
  }

  private maskCardNumber(cardNo: string): string {
    if (cardNo.length <= 8) return "****";
    return `${cardNo.slice(0, 4)}${"*".repeat(cardNo.length - 8)}${cardNo.slice(-4)}`;
  }

  private notFound(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_NOT_FOUND, message: "error.shop_membership_card_issuance.not_found", statusCode: 404 });
  }

  private invalidValue(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_INVALID_VALUE, message: "error.shop_membership_card_issuance.invalid_value", statusCode: 400 });
  }

  private invalidState(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_INVALID_STATE, message: "error.shop_membership_card_issuance.invalid_state", statusCode: 409 });
  }

  private idempotencyConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_IDEMPOTENCY_CONFLICT, message: "error.shop_membership_card_issuance.idempotency_conflict", statusCode: 409 });
  }
}
