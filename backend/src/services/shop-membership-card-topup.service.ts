import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

export type ShopMembershipCardTopUpPaymentMethodPayload = "cash" | "card" | "paypay" | "bank_transfer" | "other";

export interface ShopMembershipCardTopUpCreateInput {
  amountJpy: number;
  paymentMethod: ShopMembershipCardTopUpPaymentMethodPayload;
  paymentReference: string | null;
  note: string | null;
  idempotencyKey: string;
}

export interface ShopMembershipCardTopUpListInput extends PaginationInput {
  cardPublicId?: string;
}

export interface ShopMembershipCardTopUpRecord {
  internalId: number;
  publicId: string;
  amountJpy: number;
  paymentMethod: ShopMembershipCardTopUpPaymentMethodPayload;
  paymentReference: string | null;
  note: string | null;
  principalBalanceBeforeJpy: number;
  principalBalanceAfterJpy: number;
  cardLockVersionBefore: number;
  requestFingerprint: string;
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
    expiresAt: Date | null;
    lockVersion: number;
  };
  shop: { shopNo: string | null; name: string };
  customer: { userId: number; needoId: string; displayName: string };
  createdBy: { needoId: string; displayName: string };
}

export interface CreateShopMembershipCardTopUpRepositoryInput {
  actorId: number;
  shopId: number;
  cardPublicId: string;
  amountJpy: number;
  paymentMethod: ShopMembershipCardTopUpPaymentMethodPayload;
  paymentReference: string | null;
  note: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
  audit: AuditLogCreateInput;
}

export type ShopMembershipCardTopUpMutationResult =
  | { kind: "created" | "replayed"; value: ShopMembershipCardTopUpRecord }
  | { kind: "not_found" | "invalid_state" | "pending_conflict" | "concurrency_conflict" | "idempotency_conflict" };

export interface ShopMembershipCardTopUpRepositoryPort {
  findByIdempotencyKey: (shopId: number, idempotencyKey: string) => Promise<ShopMembershipCardTopUpRecord | null>;
  createWithAuditAndNotification: (input: CreateShopMembershipCardTopUpRepositoryInput) => Promise<ShopMembershipCardTopUpMutationResult>;
  listMerchant: (shopId: number, input: ShopMembershipCardTopUpListInput) => Promise<{ list: ShopMembershipCardTopUpRecord[]; total: number; page: number; page_size: number }>;
  listCustomer: (customerUserId: number, input: ShopMembershipCardTopUpListInput) => Promise<{ list: ShopMembershipCardTopUpRecord[]; total: number; page: number; page_size: number }>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;
const validPaymentMethods = new Set<ShopMembershipCardTopUpPaymentMethodPayload>(["cash", "card", "paypay", "bank_transfer", "other"]);

export class ShopMembershipCardTopUpService {
  public constructor(
    private readonly repository: ShopMembershipCardTopUpRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public async create(
    actor: AuthenticatedAccessContext,
    requestContext: AuthRequestContext,
    cardPublicId: string,
    rawInput: ShopMembershipCardTopUpCreateInput
  ) {
    const shopId = requireMerchantShopId(actor);
    const normalizedCardPublicId = cardPublicId.trim();
    const input = this.normalizeInput(rawInput);
    const requestFingerprint = this.fingerprint({
      cardPublicId: normalizedCardPublicId,
      amountJpy: input.amountJpy,
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      note: input.note
    });
    const existing = await this.repository.findByIdempotencyKey(shopId, input.idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
      return this.toPublic(existing, true);
    }
    const audit = this.auditInputFactory.createInput({
      actor,
      context: requestContext,
      action: "merchant.shop_membership_card.topup.create",
      targetType: "ShopMembershipCardTopUp",
      metadata: {
        cardPublicId: normalizedCardPublicId,
        amountJpy: input.amountJpy,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        note: input.note,
        idempotencyKeyHash: this.fingerprint(input.idempotencyKey)
      }
    });
    const result = await this.repository.createWithAuditAndNotification({
      actorId: actor.userId,
      shopId,
      cardPublicId: normalizedCardPublicId,
      amountJpy: input.amountJpy,
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      audit
    });
    if (result.kind === "created" || result.kind === "replayed") {
      if (result.value.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
      return this.toPublic(result.value, result.kind === "replayed");
    }
    if (result.kind === "not_found") throw this.notFound();
    if (result.kind === "pending_conflict") throw this.pendingConflict();
    if (result.kind === "concurrency_conflict") throw this.concurrencyConflict();
    if (result.kind === "idempotency_conflict") throw this.idempotencyConflict();
    throw this.invalidState();
  }

  public async listMerchant(actor: AuthenticatedAccessContext, input: ShopMembershipCardTopUpListInput) {
    const page = await this.repository.listMerchant(requireMerchantShopId(actor), input);
    return { ...page, list: page.list.map((record) => this.toPublic(record, false)) };
  }

  public async listCustomer(actor: AuthenticatedAccessContext, input: ShopMembershipCardTopUpListInput) {
    const page = await this.repository.listCustomer(this.requireCustomer(actor), input);
    return { ...page, list: page.list.map((record) => this.toPublic(record, false)) };
  }

  private normalizeInput(input: ShopMembershipCardTopUpCreateInput): ShopMembershipCardTopUpCreateInput {
    const paymentReference = this.normalizeOptionalText(input.paymentReference);
    const note = this.normalizeOptionalText(input.note);
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!Number.isSafeInteger(input.amountJpy) || input.amountJpy < 1 || input.amountJpy > 10_000_000) throw this.invalidValue();
    if (!validPaymentMethods.has(input.paymentMethod)) throw this.invalidValue();
    if (!paymentReference && !note) throw this.invalidValue();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 160) throw this.invalidValue();
    return { ...input, paymentReference, note, idempotencyKey };
  }

  private normalizeOptionalText(value: string | null): string | null {
    if (value === null) return null;
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private toPublic(record: ShopMembershipCardTopUpRecord, replayed: boolean) {
    return {
      publicId: record.publicId,
      amountJpy: record.amountJpy,
      paymentMethod: record.paymentMethod,
      paymentReference: record.paymentReference,
      note: record.note,
      principalBalanceBeforeJpy: record.principalBalanceBeforeJpy,
      principalBalanceAfterJpy: record.principalBalanceAfterJpy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      card: {
        publicId: record.card.publicId,
        cardNoMasked: this.maskCardNumber(record.card.cardNo),
        name: record.card.name,
        type: record.card.type,
        status: record.card.status,
        principalBalanceJpy: record.card.principalBalanceJpy,
        bonusBalanceJpy: record.card.bonusBalanceJpy
      },
      shop: record.shop,
      customer: { needoId: record.customer.needoId, displayName: record.customer.displayName },
      createdBy: record.createdBy,
      replayed
    };
  }

  private requireCustomer(actor: AuthenticatedAccessContext): number {
    if (actor.currentIdentityType !== "customer" || actor.currentIdentityScopeType !== "customer_profile" || !actor.currentIdentityScopeId) {
      throw new AppError({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.identity.forbidden", statusCode: 403 });
    }
    return actor.userId;
  }

  private fingerprint(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private maskCardNumber(cardNo: string): string {
    if (cardNo.length <= 8) return "****";
    return `${cardNo.slice(0, 4)}${"*".repeat(cardNo.length - 8)}${cardNo.slice(-4)}`;
  }

  private notFound(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_NOT_FOUND, message: "error.shop_membership_card_topup.not_found", statusCode: 404 });
  }

  private invalidValue(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_INVALID_VALUE, message: "error.shop_membership_card_topup.invalid_value", statusCode: 400 });
  }

  private invalidState(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_INVALID_STATE, message: "error.shop_membership_card_topup.invalid_state", statusCode: 409 });
  }

  private pendingConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_PENDING_CONFLICT, message: "error.shop_membership_card_topup.pending_conflict", statusCode: 409 });
  }

  private concurrencyConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_CONCURRENCY_CONFLICT, message: "error.shop_membership_card_topup.concurrency_conflict", statusCode: 409 });
  }

  private idempotencyConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_IDEMPOTENCY_CONFLICT, message: "error.shop_membership_card_topup.idempotency_conflict", statusCode: 409 });
  }
}
