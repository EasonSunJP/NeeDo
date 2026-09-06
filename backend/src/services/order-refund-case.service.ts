import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";
import type { OrderRefundCaseStatus } from "./order-refund-case-state-machine";

export type OrderRefundCaseView = {
  publicId: string;
  orderNo: string;
  shop: { shopNo: string | null; name: string };
  customer: { needoId: string; displayName: string };
  status: OrderRefundCaseStatus;
  responsibility: "shop";
  refundAmountJpy: number;
  currency: string;
  version: number;
  requestReason: string;
  merchantDecisionNote: string | null;
  refundReference: string | null;
  requestedAt: string;
  merchantDecisionAt: string | null;
  refundSubmittedAt: string | null;
  customerConfirmedAt: string | null;
  dispute: null | {
    publicId: string;
    status: "open" | "resolved";
    resolution: "refund" | "reject" | null;
    version: number;
    reason: string;
    openedAt: string;
    resolvedAt: string | null;
    publicResolutionReason: string | null;
  };
  affiliateReward: null | { status: "settled"; rewardNdp: number };
  createdAt: string;
  updatedAt: string;
};

export interface RefundActorScope {
  type: string | null;
  id: number | null;
}

interface RefundCommandBase {
  actorUserId: number;
  actorIdentityId: number;
  actorScope: RefundActorScope;
  shopId: number | null;
  idempotencyKey: string;
  fingerprint: string;
  expectedVersion: number;
  audit: AuditLogCreateInput;
}

export interface RequestRefundCommand extends RefundCommandBase {
  orderId: number;
  payload: { reason: string };
}

export interface MerchantRefundDecisionCommand extends RefundCommandBase {
  casePublicId: string;
  decision: "approve" | "reject";
  payload: { note: string };
}

export interface SubmitRefundEvidenceCommand extends RefundCommandBase {
  casePublicId: string;
  payload: { reference: string };
}

export interface ConfirmRefundReceiptCommand extends RefundCommandBase {
  casePublicId: string;
  payload: Record<string, never>;
}

export interface OpenRefundComplaintCommand extends RefundCommandBase {
  casePublicId: string;
  payload: { reason: string };
}

export interface ResolveRefundDisputeCommand extends RefundCommandBase {
  disputePublicId: string;
  resolution: "refund" | "reject";
  payload: { publicReason: string; internalNote?: string | null };
}

export interface ListRefundDisputesInput {
  actorUserId: number;
  actorIdentityId: number;
  actorScope: RefundActorScope;
  page: number;
  page_size: number;
  status?: "open" | "resolved";
  search?: string;
}

export interface PaginatedRefundDisputes {
  list: OrderRefundCaseView[];
  total: number;
  page: number;
  page_size: number;
}

export type OrderRefundMutationResult =
  | { kind: "created" | "updated" | "replayed"; value: OrderRefundCaseView }
  | {
      kind:
        | "not_found"
        | "invalid_state"
        | "version_conflict"
        | "idempotency_conflict"
        | "active_conflict"
        | "scope_mismatch"
        | "dispute_required"
        | "affiliate_invariant_failed";
      current?: OrderRefundCaseView;
    };

export interface OrderRefundCaseRepositoryPort {
  request(input: RequestRefundCommand): Promise<OrderRefundMutationResult>;
  merchantDecision(input: MerchantRefundDecisionCommand): Promise<OrderRefundMutationResult>;
  submitEvidence(input: SubmitRefundEvidenceCommand): Promise<OrderRefundMutationResult>;
  confirmCustomerReceipt(input: ConfirmRefundReceiptCommand): Promise<OrderRefundMutationResult>;
  openComplaint(input: OpenRefundComplaintCommand): Promise<OrderRefundMutationResult>;
  resolveDispute(input: ResolveRefundDisputeCommand): Promise<OrderRefundMutationResult>;
  listDisputes(input: ListRefundDisputesInput): Promise<PaginatedRefundDisputes>;
}

export interface RequestRefundInput {
  orderId: number;
  idempotencyKey: string;
  expectedVersion: number;
  reason: string;
}

export interface MerchantRefundDecisionInput {
  idempotencyKey: string;
  expectedVersion: number;
  note: string;
}

export interface SubmitRefundEvidenceInput {
  idempotencyKey: string;
  expectedVersion: number;
  reference: string;
}

export interface ConfirmRefundReceiptInput {
  idempotencyKey: string;
  expectedVersion: number;
}

export interface OpenRefundComplaintInput {
  idempotencyKey: string;
  expectedVersion: number;
  reason: string;
}

export interface ResolveRefundDisputeInput {
  idempotencyKey: string;
  expectedVersion: number;
  resolution: "refund" | "reject";
  publicReason: string;
  internalNote?: string | null;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;
type MutationTarget = "case" | "dispute";

export class OrderRefundCaseService {
  public constructor(
    private readonly repository: OrderRefundCaseRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public async request(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: RequestRefundInput
  ): Promise<OrderRefundCaseView> {
    this.assertNoProtectedPublicFields(input);
    this.requireCustomerIdentity(actor);
    const normalized = {
      orderId: this.positiveInteger(input.orderId),
      idempotencyKey: this.idempotencyKey(input.idempotencyKey),
      expectedVersion: this.initialVersion(input.expectedVersion),
      reason: this.text(input.reason, 500)
    };
    const actorScope = this.actorScope(actor);
    const command: RequestRefundCommand = {
      orderId: normalized.orderId,
      ...this.commandBase({
        actor,
        context,
        action: "order_refund.requested",
        ids: { orderId: normalized.orderId },
        actorScope,
        shopId: null,
        idempotencyKey: normalized.idempotencyKey,
        expectedVersion: normalized.expectedVersion,
        payload: { reason: normalized.reason }
      }),
      payload: { reason: normalized.reason }
    };
    return this.unwrap(await this.repository.request(command), "case");
  }

  public async merchantApprove(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    casePublicId: string,
    input: MerchantRefundDecisionInput
  ): Promise<OrderRefundCaseView> {
    return this.merchantDecision(actor, context, casePublicId, input, "approve");
  }

  public async merchantReject(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    casePublicId: string,
    input: MerchantRefundDecisionInput
  ): Promise<OrderRefundCaseView> {
    return this.merchantDecision(actor, context, casePublicId, input, "reject");
  }

  public async submitEvidence(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    casePublicId: string,
    input: SubmitRefundEvidenceInput
  ): Promise<OrderRefundCaseView> {
    this.assertNoProtectedPublicFields(input);
    const normalized = this.updateEnvelope(input);
    const reference = this.text(input.reference, 120);
    const shopId = this.requireMerchantWriteScope(actor);
    const actorScope = this.actorScope(actor);
    const publicId = this.publicId(casePublicId);
    const command: SubmitRefundEvidenceCommand = {
      casePublicId: publicId,
      ...this.commandBase({
        actor,
        context,
        action: "order_refund.evidence_submitted",
        ids: { casePublicId: publicId },
        actorScope,
        shopId,
        ...normalized,
        payload: { reference }
      }),
      payload: { reference }
    };
    return this.unwrap(await this.repository.submitEvidence(command), "case");
  }

  public async confirmCustomerReceipt(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    casePublicId: string,
    input: ConfirmRefundReceiptInput
  ): Promise<OrderRefundCaseView> {
    this.assertNoProtectedPublicFields(input);
    this.requireCustomerIdentity(actor);
    const normalized = this.updateEnvelope(input);
    const actorScope = this.actorScope(actor);
    const publicId = this.publicId(casePublicId);
    const command: ConfirmRefundReceiptCommand = {
      casePublicId: publicId,
      ...this.commandBase({
        actor,
        context,
        action: "order_refund.customer_receipt_confirmed",
        ids: { casePublicId: publicId },
        actorScope,
        shopId: null,
        ...normalized,
        payload: {}
      }),
      payload: {}
    };
    return this.unwrap(await this.repository.confirmCustomerReceipt(command), "case");
  }

  public async openComplaint(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    casePublicId: string,
    input: OpenRefundComplaintInput
  ): Promise<OrderRefundCaseView> {
    this.assertNoProtectedPublicFields(input);
    this.requireCustomerIdentity(actor);
    const normalized = this.updateEnvelope(input);
    const reason = this.text(input.reason, 500);
    const actorScope = this.actorScope(actor);
    const publicId = this.publicId(casePublicId);
    const command: OpenRefundComplaintCommand = {
      casePublicId: publicId,
      ...this.commandBase({
        actor,
        context,
        action: "order_refund.complaint_opened",
        ids: { casePublicId: publicId },
        actorScope,
        shopId: null,
        ...normalized,
        payload: { reason }
      }),
      payload: { reason }
    };
    return this.unwrap(await this.repository.openComplaint(command), "case");
  }

  public async resolveDispute(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    disputePublicId: string,
    input: ResolveRefundDisputeInput
  ): Promise<OrderRefundCaseView> {
    this.assertNoProtectedPublicFields(input);
    this.requirePlatformIdentity(actor);
    const normalized = this.updateEnvelope(input);
    if (input.resolution !== "refund" && input.resolution !== "reject") {
      throw this.validationError();
    }
    const publicReason = this.text(input.publicReason, 500);
    const internalNote = this.optionalText(input.internalNote, 1000);
    const actorScope = this.actorScope(actor);
    const publicId = this.publicId(disputePublicId);
    const payload = internalNote === undefined ? { publicReason } : { publicReason, internalNote };
    const command: ResolveRefundDisputeCommand = {
      disputePublicId: publicId,
      resolution: input.resolution,
      ...this.commandBase({
        actor,
        context,
        action:
          input.resolution === "refund"
            ? "order_refund.dispute_resolved_refund"
            : "order_refund.dispute_resolved_reject",
        ids: { disputePublicId: publicId },
        actorScope,
        shopId: null,
        ...normalized,
        payload
      }),
      payload
    };
    return this.unwrap(await this.repository.resolveDispute(command), "dispute");
  }

  public async listDisputes(
    actor: AuthenticatedAccessContext,
    input: Omit<ListRefundDisputesInput, "actorUserId" | "actorIdentityId" | "actorScope">
  ): Promise<PaginatedRefundDisputes> {
    this.requirePlatformIdentity(actor);
    const page = this.positiveInteger(input.page);
    const page_size = this.positiveInteger(input.page_size);
    if (page_size > 100 || (input.status !== undefined && input.status !== "open" && input.status !== "resolved")) {
      throw this.validationError();
    }
    const search = input.search === undefined ? undefined : this.text(input.search, 100);
    return this.repository.listDisputes({
      actorUserId: actor.userId,
      actorIdentityId: this.identityId(actor),
      actorScope: this.actorScope(actor),
      page,
      page_size,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(search === undefined ? {} : { search })
    });
  }

  private async merchantDecision(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    casePublicId: string,
    input: MerchantRefundDecisionInput,
    decision: "approve" | "reject"
  ): Promise<OrderRefundCaseView> {
    this.assertNoProtectedPublicFields(input);
    const normalized = this.updateEnvelope(input);
    const note = this.text(input.note, 500);
    const shopId = this.requireMerchantWriteScope(actor);
    const actorScope = this.actorScope(actor);
    const publicId = this.publicId(casePublicId);
    const command: MerchantRefundDecisionCommand = {
      casePublicId: publicId,
      decision,
      ...this.commandBase({
        actor,
        context,
        action:
          decision === "approve"
            ? "order_refund.merchant_approved"
            : "order_refund.merchant_rejected",
        ids: { casePublicId: publicId },
        actorScope,
        shopId,
        ...normalized,
        payload: { note }
      }),
      payload: { note }
    };
    return this.unwrap(await this.repository.merchantDecision(command), "case");
  }

  private commandBase(input: {
    actor: AuthenticatedAccessContext;
    context: AuthRequestContext;
    action: string;
    ids: Record<string, number | string>;
    actorScope: RefundActorScope;
    shopId: number | null;
    idempotencyKey: string;
    expectedVersion: number;
    payload: Record<string, unknown>;
  }): RefundCommandBase {
    return {
      actorUserId: input.actor.userId,
      actorIdentityId: this.identityId(input.actor),
      actorScope: input.actorScope,
      shopId: input.shopId,
      idempotencyKey: input.idempotencyKey,
      fingerprint: this.fingerprint({
        action: input.action,
        ids: input.ids,
        actor: { userId: input.actor.userId, identityId: this.identityId(input.actor) },
        scope: { ...input.actorScope, shopId: input.shopId },
        payload: input.payload,
        expectedVersion: input.expectedVersion
      }),
      expectedVersion: input.expectedVersion,
      audit: this.auditInputFactory.createInput({
        actor: input.actor,
        context: input.context,
        action: input.action,
        targetType: "OrderRefundCase",
        metadata: {
          ids: input.ids,
          actorIdentityId: this.identityId(input.actor),
          actorScope: input.actorScope,
          shopId: input.shopId,
          expectedVersion: input.expectedVersion
        }
      })
    };
  }

  private unwrap(result: OrderRefundMutationResult, target: MutationTarget): OrderRefundCaseView {
    if (result.kind === "created" || result.kind === "updated" || result.kind === "replayed") {
      return result.value;
    }
    if (result.kind === "not_found" || result.kind === "scope_mismatch") {
      throw new AppError({
        code:
          target === "dispute"
            ? ERROR_CODES.ORDER_REFUND_DISPUTE_NOT_FOUND
            : ERROR_CODES.ORDER_REFUND_CASE_NOT_FOUND,
        message:
          target === "dispute"
            ? "error.order_refund_dispute.not_found"
            : "error.order_refund_case.not_found",
        statusCode: 404
      });
    }
    const errors = {
      invalid_state: [ERROR_CODES.ORDER_REFUND_CASE_INVALID_STATE, "error.order_refund_case.invalid_state", 409],
      version_conflict: [ERROR_CODES.ORDER_REFUND_CASE_VERSION_CONFLICT, "error.order_refund_case.version_conflict", 409],
      idempotency_conflict: [ERROR_CODES.ORDER_REFUND_CASE_IDEMPOTENCY_CONFLICT, "error.order_refund_case.idempotency_conflict", 409],
      active_conflict: [ERROR_CODES.ORDER_REFUND_CASE_ACTIVE_CONFLICT, "error.order_refund_case.active_conflict", 409],
      dispute_required: [ERROR_CODES.ORDER_REFUND_DISPUTE_REQUIRED, "error.order_refund_dispute.required", 409],
      affiliate_invariant_failed: [
        ERROR_CODES.ORDER_REFUND_AFFILIATE_INVARIANT_FAILED,
        "error.order_refund_case.affiliate_invariant_failed",
        500
      ]
    } as const;
    const [code, message, statusCode] = errors[result.kind];
    throw new AppError({ code, message, statusCode });
  }

  private requireCustomerIdentity(actor: AuthenticatedAccessContext): void {
    if (actor.currentIdentityType === "customer" && this.identityId(actor) > 0) return;
    throw this.identityForbidden();
  }

  private requireMerchantWriteScope(actor: AuthenticatedAccessContext): number {
    if (actor.isReadOnlyMerchantPreview === true) throw this.identityForbidden();
    return requireMerchantShopId(actor);
  }

  private requirePlatformIdentity(actor: AuthenticatedAccessContext): void {
    const isGlobalPlatform =
      actor.currentIdentityType === "platform" &&
      (actor.currentIdentityScopeType === "global" || actor.currentIdentityScopeType === "platform");
    if (isGlobalPlatform && this.identityId(actor) > 0) return;
    throw this.identityForbidden();
  }

  private actorScope(actor: AuthenticatedAccessContext): RefundActorScope {
    return { type: actor.currentIdentityScopeType ?? null, id: actor.currentIdentityScopeId ?? null };
  }

  private identityId(actor: AuthenticatedAccessContext): number {
    const identityId = actor.currentIdentityId;
    if (typeof identityId !== "number" || !Number.isSafeInteger(identityId) || identityId < 1) {
      throw this.identityForbidden();
    }
    return identityId;
  }

  private assertNoProtectedPublicFields(input: object): void {
    for (const key of Object.keys(input)) {
      const normalized = key.toLowerCase();
      if (normalized === "responsibility" || normalized.includes("affiliate")) {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.order_refund_case.public_input_invalid",
          statusCode: 400
        });
      }
    }
  }

  private fingerprint(value: Record<string, unknown>): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private updateEnvelope(input: { idempotencyKey: string; expectedVersion: number }) {
    return {
      idempotencyKey: this.idempotencyKey(input.idempotencyKey),
      expectedVersion: this.laterVersion(input.expectedVersion)
    };
  }

  private initialVersion(value: number): number {
    if (value !== 0) throw this.validationError();
    return value;
  }

  private laterVersion(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) throw this.validationError();
    return value;
  }

  private idempotencyKey(value: string): string {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized.length < 8 || normalized.length > 160) throw this.validationError();
    return normalized;
  }

  private publicId(value: string): string {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(normalized)) {
      throw this.validationError();
    }
    return normalized;
  }

  private positiveInteger(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) throw this.validationError();
    return value;
  }

  private text(value: string, maxLength: number): string {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized.length < 2 || normalized.length > maxLength) throw this.validationError();
    return normalized;
  }

  private optionalText(value: string | null | undefined, maxLength: number): string | null | undefined {
    if (value === undefined || value === null) return value;
    return this.text(value, maxLength);
  }

  private validationError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.order_refund_case.public_input_invalid",
      statusCode: 400
    });
  }

  private identityForbidden(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }
}
