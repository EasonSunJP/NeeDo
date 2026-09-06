import {
  AffiliateRewardStatus,
  BookingOrderStatus,
  OrderRefundCaseAction,
  OrderRefundCaseStatus,
  OrderRefundDisputeResolution,
  OrderRefundDisputeStatus,
  NotificationType,
  Prisma,
  ServicePaymentStatus,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  ConfirmRefundReceiptCommand,
  ListRefundDisputesInput,
  MerchantRefundDecisionCommand,
  OpenRefundComplaintCommand,
  OrderRefundCaseRepositoryPort,
  OrderRefundCaseView,
  OrderRefundMutationResult,
  PaginatedRefundDisputes,
  RequestRefundCommand,
  ResolveRefundDisputeCommand,
  SubmitRefundEvidenceCommand
} from "../services/order-refund-case.service";
import { transitionOrderRefundCase } from "../services/order-refund-case-state-machine";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import { toAuditLogCreateData } from "./audit-log.repository";

const refundCaseInclude = {
  bookingOrder: { select: { orderNo: true } },
  shop: { select: { shopNo: true, name: true } },
  customer: { select: { needoId: true, username: true, customerProfile: { select: { displayName: true } } } },
  disputes: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      publicId: true,
      status: true,
      resolution: true,
      version: true,
      reason: true,
      createdAt: true,
      resolvedAt: true,
      publicResolutionReason: true
    }
  }
} satisfies Prisma.OrderRefundCaseInclude;

type RefundCaseRecord = Prisma.OrderRefundCaseGetPayload<{ include: typeof refundCaseInclude }>;
type Tx = Prisma.TransactionClient;

const caseAction = (action: "request" | "approve" | "reject" | "complaint" | "evidence" | "receipt") => {
  const actions = {
    request: OrderRefundCaseAction.REQUEST,
    approve: OrderRefundCaseAction.MERCHANT_APPROVE,
    reject: OrderRefundCaseAction.MERCHANT_REJECT,
    complaint: OrderRefundCaseAction.OPEN_COMPLAINT,
    evidence: OrderRefundCaseAction.SUBMIT_REFUND_EVIDENCE,
    receipt: OrderRefundCaseAction.CONFIRM_CUSTOMER_RECEIPT
  };
  return actions[action];
};

/**
 * The only persistence boundary for post-completion refund cases.  It never
 * calls the Affiliate ledger: confirmation instead snapshots and proves the
 * settled reward projection is byte-for-byte unchanged in the same transaction.
 */
export class OrderRefundCaseRepository implements OrderRefundCaseRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public request(input: RequestRefundCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      await this.lockOrder(tx, input.orderId);
      const order = await tx.bookingOrder.findFirst({
        where: { id: input.orderId, deletedAt: null },
        select: {
          id: true, shopId: true, customerUserId: true, status: true, paymentStatus: true,
          paymentAmountJpy: true, paymentRefundedAt: true, currency: true
        }
      });
      if (!order) return { kind: "not_found" };
      const eligible = order.status === BookingOrderStatus.COMPLETED &&
        order.customerUserId === input.actorUserId &&
        order.paymentStatus === ServicePaymentStatus.CONFIRMED &&
        order.paymentAmountJpy > 0 && order.paymentRefundedAt === null;
      if (!eligible) return { kind: "invalid_state" };
      const activeKey = `booking:${order.id}`;
      const active = await tx.orderRefundCase.findFirst({ where: { activeKey, deletedAt: null }, include: refundCaseInclude });
      if (active) return { kind: "active_conflict", current: await this.view(tx, active) };
      const created = await tx.orderRefundCase.create({
        data: {
          bookingOrderId: order.id, shopId: order.shopId, customerUserId: order.customerUserId,
          status: OrderRefundCaseStatus.MERCHANT_REVIEW_PENDING, responsibility: "shop",
          refundAmountJpy: order.paymentAmountJpy, currency: order.currency, activeKey,
          requestReason: input.payload.reason, requestedByIdentityId: input.actorIdentityId
        }, include: refundCaseInclude
      });
      await this.event(tx, created.id, order.id, caseAction("request"), null, created.status, input, { reason: input.payload.reason });
      await this.audit(tx, input, created.id);
      return { kind: "created", value: await this.view(tx, created) };
    });
  }

  public merchantDecision(input: MerchantRefundDecisionCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      const found = await this.lockCaseForOrder(tx, input.casePublicId, input.orderId);
      if (!found) return { kind: "not_found" };
      if (found.shopId !== input.shopId) return { kind: "scope_mismatch" };
      if (found.version !== input.expectedVersion) return { kind: "version_conflict", current: await this.view(tx, found) };
      const action = input.decision === "approve" ? "merchant_approve" : "merchant_reject";
      const transition = transitionOrderRefundCase(this.status(found.status), action);
      if (!transition.ok) return { kind: "invalid_state", current: await this.view(tx, found) };
      const updated = await tx.orderRefundCase.update({
        where: { id: found.id },
        data: {
          status: this.statusDb(transition.status), version: { increment: 1 },
          merchantDecisionReason: input.payload.note, merchantDecidedByUserId: input.actorUserId,
          merchantDecidedByIdentityId: input.actorIdentityId, merchantDecidedAt: new Date()
        }, include: refundCaseInclude
      });
      await this.event(tx, found.id, found.bookingOrderId, caseAction(input.decision === "approve" ? "approve" : "reject"), found.status, updated.status, input, { note: input.payload.note });
      await this.audit(tx, input, found.id);
      await this.notify(tx, found.customerUserId, found.requestedByIdentityId, input, "order_refund.merchant_decision.title", "order_refund.merchant_decision.body", { casePublicId: updated.publicId, status: this.status(updated.status) });
      return { kind: "updated", value: await this.view(tx, updated) };
    });
  }

  public openComplaint(input: OpenRefundComplaintCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      const found = await this.lockCaseForOrder(tx, input.casePublicId, input.orderId);
      if (!found) return { kind: "not_found" };
      const customerOwns = input.shopId === null && found.customerUserId === input.actorUserId;
      const merchantOwns = input.shopId !== null && found.shopId === input.shopId;
      if (!customerOwns && !merchantOwns) return { kind: "scope_mismatch" };
      if (found.version !== input.expectedVersion) return { kind: "version_conflict", current: await this.view(tx, found) };
      const transition = transitionOrderRefundCase(this.status(found.status), "open_complaint");
      if (!transition.ok) return { kind: "invalid_state", current: await this.view(tx, found) };
      const active = await tx.orderRefundDispute.findFirst({ where: { activeKey: `refund-case:${found.id}`, deletedAt: null }, select: { id: true } });
      if (active) return { kind: "active_conflict", current: await this.view(tx, found) };
      await tx.orderRefundDispute.create({
        data: {
          orderRefundCaseId: found.id, bookingOrderId: found.bookingOrderId, shopId: found.shopId,
          customerUserId: found.customerUserId, activeKey: `refund-case:${found.id}`,
          openedByUserId: input.actorUserId, openedByIdentityId: input.actorIdentityId, reason: input.payload.reason
        }
      });
      const updated = await tx.orderRefundCase.update({
        where: { id: found.id }, data: { status: this.statusDb(transition.status), version: { increment: 1 } }, include: refundCaseInclude
      });
      await this.event(tx, found.id, found.bookingOrderId, caseAction("complaint"), found.status, updated.status, input, { reason: input.payload.reason });
      await this.audit(tx, input, found.id);
      if (found.merchantDecidedByUserId && found.merchantDecidedByIdentityId) {
        await this.notify(tx, found.merchantDecidedByUserId, found.merchantDecidedByIdentityId, input, "order_refund.complaint.title", "order_refund.complaint.body", { casePublicId: updated.publicId });
      }
      return { kind: "updated", value: await this.view(tx, updated) };
    });
  }

  public resolveDispute(input: ResolveRefundDisputeCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      const replay = await this.replayDisputeRevision(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      const candidate = await tx.orderRefundDispute.findFirst({
        where: { publicId: input.disputePublicId, deletedAt: null }, select: { id: true, orderRefundCaseId: true, bookingOrderId: true, status: true, version: true }
      });
      if (!candidate) return { kind: "not_found" };
      // Keep every multi-row command in the same deterministic order.
      await this.lockOrder(tx, candidate.bookingOrderId);
      await this.lockCase(tx, candidate.orderRefundCaseId);
      await this.lockDispute(tx, candidate.id);
      const dispute = await tx.orderRefundDispute.findFirst({
        where: { id: candidate.id, deletedAt: null }, select: { id: true, orderRefundCaseId: true, bookingOrderId: true, status: true, version: true }
      });
      if (!dispute) return { kind: "not_found" };
      const caseRow = await tx.orderRefundCase.findFirst({ where: { id: dispute.orderRefundCaseId, deletedAt: null }, include: refundCaseInclude });
      if (!caseRow) return { kind: "not_found" };
      if (dispute.version !== input.expectedVersion) return { kind: "version_conflict", current: await this.view(tx, caseRow) };
      if (dispute.status !== OrderRefundDisputeStatus.OPEN || this.status(caseRow.status) !== "disputed") return { kind: "dispute_required", current: await this.view(tx, caseRow) };
      const transition = transitionOrderRefundCase("disputed", input.resolution === "refund" ? "resolve_dispute_refund" : "resolve_dispute_reject");
      if (!transition.ok) return { kind: "invalid_state", current: await this.view(tx, caseRow) };
      const nextVersion = dispute.version + 1;
      await tx.orderRefundDispute.update({
        where: { id: dispute.id }, data: {
          status: OrderRefundDisputeStatus.RESOLVED, resolution: input.resolution === "refund" ? OrderRefundDisputeResolution.REFUND : OrderRefundDisputeResolution.REJECT,
          version: nextVersion, activeKey: null, resolvedByUserId: input.actorUserId, resolvedByIdentityId: input.actorIdentityId,
          resolvedAt: new Date(), publicResolutionReason: input.payload.publicReason, internalNote: input.payload.internalNote ?? null
        }
      });
      await tx.orderRefundDisputeRevision.create({ data: {
        orderRefundDisputeId: dispute.id, orderRefundCaseId: caseRow.id, bookingOrderId: caseRow.bookingOrderId,
        resolution: input.resolution === "refund" ? OrderRefundDisputeResolution.REFUND : OrderRefundDisputeResolution.REJECT,
        previousVersion: dispute.version, nextVersion, resolvedByUserId: input.actorUserId, resolvedByIdentityId: input.actorIdentityId,
        publicResolutionReason: input.payload.publicReason, internalNote: input.payload.internalNote ?? null,
        idempotencyKey: input.idempotencyKey, requestFingerprint: input.fingerprint
      }});
      const updated = await tx.orderRefundCase.update({ where: { id: caseRow.id }, data: {
        status: this.statusDb(transition.status), version: { increment: 1 }, activeKey: input.resolution === "reject" ? null : undefined
      }, include: refundCaseInclude });
      await this.event(tx, caseRow.id, caseRow.bookingOrderId, input.resolution === "refund" ? OrderRefundCaseAction.RESOLVE_DISPUTE_REFUND : OrderRefundCaseAction.RESOLVE_DISPUTE_REJECT, caseRow.status, updated.status, input, { publicReason: input.payload.publicReason });
      await this.audit(tx, input, dispute.id);
      await this.notify(tx, caseRow.customerUserId, caseRow.requestedByIdentityId, input, "order_refund.dispute_resolved.title", "order_refund.dispute_resolved.body", { casePublicId: updated.publicId, resolution: input.resolution });
      return { kind: "updated", value: await this.view(tx, updated) };
    });
  }

  public submitEvidence(input: SubmitRefundEvidenceCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      const found = await this.lockCaseForOrder(tx, input.casePublicId, input.orderId);
      if (!found) return { kind: "not_found" };
      if (found.shopId !== input.shopId) return { kind: "scope_mismatch" };
      if (found.version !== input.expectedVersion) return { kind: "version_conflict", current: await this.view(tx, found) };
      const transition = transitionOrderRefundCase(this.status(found.status), "submit_refund_evidence");
      if (!transition.ok) return { kind: "invalid_state", current: await this.view(tx, found) };
      const updated = await tx.orderRefundCase.update({ where: { id: found.id }, data: {
        status: this.statusDb(transition.status), version: { increment: 1 }, refundEvidence: { reference: input.payload.reference },
        refundEvidenceSubmittedById: input.actorUserId, refundEvidenceIdentityId: input.actorIdentityId, refundEvidenceSubmittedAt: new Date()
      }, include: refundCaseInclude });
      await this.event(tx, found.id, found.bookingOrderId, caseAction("evidence"), found.status, updated.status, input, { reference: input.payload.reference });
      await this.audit(tx, input, found.id);
      await this.notify(tx, found.customerUserId, found.requestedByIdentityId, input, "order_refund.evidence_submitted.title", "order_refund.evidence_submitted.body", { casePublicId: updated.publicId });
      return { kind: "updated", value: await this.view(tx, updated) };
    });
  }

  public confirmCustomerReceipt(input: ConfirmRefundReceiptCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      await this.lockOrder(tx, input.orderId);
      const found = await this.lockCaseForOrder(tx, input.casePublicId, input.orderId);
      if (!found) return { kind: "not_found" };
      if (found.customerUserId !== input.actorUserId) return { kind: "scope_mismatch" };
      if (found.version !== input.expectedVersion) return { kind: "version_conflict", current: await this.view(tx, found) };
      const transition = transitionOrderRefundCase(this.status(found.status), "confirm_customer_receipt");
      if (!transition.ok) return { kind: "invalid_state", current: await this.view(tx, found) };
      const affiliateBefore = await this.affiliateSnapshot(tx, found.bookingOrderId);
      if (affiliateBefore && affiliateBefore.status !== AffiliateRewardStatus.SETTLED) return { kind: "affiliate_invariant_failed" };
      const orderUpdated = await tx.bookingOrder.updateMany({ where: {
        id: found.bookingOrderId, status: BookingOrderStatus.COMPLETED, paymentStatus: ServicePaymentStatus.CONFIRMED,
        paymentRefundedAt: null, deletedAt: null
      }, data: { paymentStatus: ServicePaymentStatus.REFUNDED, paymentRefundedAt: new Date(), paymentRefundedById: input.actorUserId, paymentRefundReference: this.evidenceReference(found.refundEvidence), paymentRefundReason: found.requestReason } });
      if (orderUpdated.count !== 1) return { kind: "invalid_state", current: await this.view(tx, found) };
      await tx.orderFinancial.updateMany({ where: { bookingOrderId: found.bookingOrderId, deletedAt: null }, data: { settlementStatus: "refunded" } });
      const updated = await tx.orderRefundCase.update({ where: { id: found.id }, data: {
        status: this.statusDb(transition.status), version: { increment: 1 }, activeKey: null, customerConfirmedAt: new Date()
      }, include: refundCaseInclude });
      const affiliateAfter = await this.affiliateSnapshot(tx, found.bookingOrderId);
      if (JSON.stringify(affiliateBefore) !== JSON.stringify(affiliateAfter)) throw new Error("error.order_refund.affiliate_invariant_failed");
      await this.event(tx, found.id, found.bookingOrderId, caseAction("receipt"), found.status, updated.status, input, {});
      await this.audit(tx, input, found.id);
      if (found.merchantDecidedByUserId && found.merchantDecidedByIdentityId) {
        await this.notify(tx, found.merchantDecidedByUserId, found.merchantDecidedByIdentityId, input, "order_refund.customer_confirmed.title", "order_refund.customer_confirmed.body", { casePublicId: updated.publicId });
      }
      return { kind: "updated", value: await this.view(tx, updated) };
    });
  }

  public async listDisputes(input: ListRefundDisputesInput): Promise<PaginatedRefundDisputes> {
    const where = this.disputeWhere(input);
    const [rows, total] = await Promise.all([
      this.client.orderRefundDispute.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (input.page - 1) * input.page_size, take: input.page_size, select: { refundCase: { include: refundCaseInclude } } }),
      this.client.orderRefundDispute.count({ where })
    ]);
    return { list: await Promise.all(rows.map((row) => this.view(this.client, row.refundCase))), total, page: input.page, page_size: input.page_size };
  }

  private mutate(operation: (tx: Tx) => Promise<OrderRefundMutationResult>): Promise<OrderRefundMutationResult> {
    return runWithTransactionConflictRetry(() => this.client.$transaction((tx) => operation(tx)));
  }

  private async lockOrder(tx: Tx, id: number): Promise<void> { await tx.$queryRaw(Prisma.sql`SELECT id FROM booking_orders WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`); }
  private async lockCase(tx: Tx, id: number): Promise<void> { await tx.$queryRaw(Prisma.sql`SELECT id FROM order_refund_cases WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`); }
  private async lockDispute(tx: Tx, id: number): Promise<void> { await tx.$queryRaw(Prisma.sql`SELECT id FROM order_refund_disputes WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`); }

  private async lockCaseForOrder(tx: Tx, publicId: string, orderId: number): Promise<RefundCaseRecord | null> {
    const found = await tx.orderRefundCase.findFirst({ where: { publicId, bookingOrderId: orderId, deletedAt: null }, include: refundCaseInclude });
    if (found) await this.lockCase(tx, found.id);
    return found;
  }

  private async replayCaseEvent(tx: Tx, idempotencyKey: string, fingerprint: string): Promise<OrderRefundMutationResult | null> {
    const event = await tx.orderRefundCaseEvent.findFirst({ where: { idempotencyKey, deletedAt: null }, select: { requestFingerprint: true, refundCase: { include: refundCaseInclude } } });
    if (!event) return null;
    return event.requestFingerprint === fingerprint ? { kind: "replayed", value: await this.view(tx, event.refundCase) } : { kind: "idempotency_conflict" };
  }

  private async replayDisputeRevision(tx: Tx, idempotencyKey: string, fingerprint: string): Promise<OrderRefundMutationResult | null> {
    const revision = await tx.orderRefundDisputeRevision.findFirst({ where: { idempotencyKey, deletedAt: null }, select: { requestFingerprint: true, refundCase: { include: refundCaseInclude } } });
    if (!revision) return null;
    return revision.requestFingerprint === fingerprint ? { kind: "replayed", value: await this.view(tx, revision.refundCase) } : { kind: "idempotency_conflict" };
  }

  private async event(tx: Tx, caseId: number, orderId: number, action: OrderRefundCaseAction, fromStatus: OrderRefundCaseStatus | null, toStatus: OrderRefundCaseStatus, input: { actorUserId: number; actorIdentityId: number; idempotencyKey: string; fingerprint: string }, metadata: Record<string, unknown>): Promise<void> {
    await tx.orderRefundCaseEvent.create({ data: { orderRefundCaseId: caseId, bookingOrderId: orderId, action, fromStatus, toStatus, actorUserId: input.actorUserId, actorIdentityId: input.actorIdentityId, idempotencyKey: input.idempotencyKey, requestFingerprint: input.fingerprint, metadata: metadata as Prisma.InputJsonValue } });
  }

  private async audit(tx: Tx, input: { audit: Parameters<typeof toAuditLogCreateData>[0] }, targetId: number): Promise<void> { await tx.auditLog.create({ data: toAuditLogCreateData({ ...input.audit, targetId }) }); }

  private async notify(tx: Tx, recipientUserId: number, recipientIdentityId: number, input: { actorUserId: number; actorIdentityId: number }, title: string, body: string, payload: Record<string, unknown>): Promise<void> {
    await tx.notification.create({ data: { recipientUserId, recipientIdentityId, actorUserId: input.actorUserId, actorIdentityId: input.actorIdentityId, type: NotificationType.SYSTEM, title, body, payload: payload as Prisma.InputJsonValue } });
  }

  private async affiliateSnapshot(tx: Tx, bookingOrderId: number) {
    return tx.affiliateReward.findFirst({ where: { bookingOrderId, deletedAt: null }, select: {
      id: true, status: true, rewardNdp: true, platformFeeNdp: true, reversalRequiredNdp: true, reversedNdp: true, outstandingRecoveryNdp: true,
      claimantWallet: { select: { id: true, availableBalance: true, frozenBalance: true } },
      transactions: { where: { deletedAt: null }, select: { id: true, kind: true, ledgerTransactionId: true, amountNdp: true }, orderBy: { id: "asc" } }
    }});
  }

  private disputeWhere(input: ListRefundDisputesInput): Prisma.OrderRefundDisputeWhereInput {
    const search = input.search?.trim();
    return { deletedAt: null, ...(input.status ? { status: input.status === "open" ? OrderRefundDisputeStatus.OPEN : OrderRefundDisputeStatus.RESOLVED } : {}), ...(search ? { OR: [
      { bookingOrder: { orderNo: { contains: search } } }, { refundCase: { publicId: { contains: search } } },
      { customer: { needoId: { contains: search } } }, { shop: { shopNo: { contains: search } } }, { shop: { name: { contains: search } } }
    ] } : {}) };
  }

  private async view(client: Pick<PrismaClient, "affiliateReward"> | Tx, row: RefundCaseRecord): Promise<OrderRefundCaseView> {
    const reward = await client.affiliateReward.findFirst({ where: { bookingOrderId: row.bookingOrderId, deletedAt: null }, select: { status: true, rewardNdp: true } });
    const dispute = row.disputes[0] ?? null;
    return {
      publicId: row.publicId, orderNo: row.bookingOrder.orderNo, shop: { shopNo: row.shop.shopNo, name: row.shop.name },
      customer: { needoId: row.customer.needoId, displayName: row.customer.customerProfile?.displayName ?? row.customer.username },
      status: this.status(row.status), responsibility: "shop", refundAmountJpy: row.refundAmountJpy, currency: row.currency, version: row.version,
      requestReason: row.requestReason, merchantDecisionNote: row.merchantDecisionReason, refundReference: this.evidenceReference(row.refundEvidence),
      requestedAt: row.requestedAt.toISOString(), merchantDecisionAt: row.merchantDecidedAt?.toISOString() ?? null, refundSubmittedAt: row.refundEvidenceSubmittedAt?.toISOString() ?? null, customerConfirmedAt: row.customerConfirmedAt?.toISOString() ?? null,
      dispute: dispute ? { publicId: dispute.publicId, status: dispute.status === OrderRefundDisputeStatus.OPEN ? "open" : "resolved", resolution: dispute.resolution === OrderRefundDisputeResolution.REFUND ? "refund" : dispute.resolution === OrderRefundDisputeResolution.REJECT ? "reject" : null, version: dispute.version, reason: dispute.reason, openedAt: dispute.createdAt.toISOString(), resolvedAt: dispute.resolvedAt?.toISOString() ?? null, publicResolutionReason: dispute.publicResolutionReason } : null,
      affiliateReward: reward?.status === AffiliateRewardStatus.SETTLED ? { status: "settled", rewardNdp: reward.rewardNdp } : null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private evidenceReference(value: Prisma.JsonValue | null): string | null { return value && typeof value === "object" && !Array.isArray(value) && typeof value.reference === "string" ? value.reference : null; }
  private status(value: OrderRefundCaseStatus): OrderRefundCaseView["status"] { return value.toLowerCase() as OrderRefundCaseView["status"]; }
  private statusDb(value: OrderRefundCaseView["status"]): OrderRefundCaseStatus { return value.toUpperCase() as OrderRefundCaseStatus; }
}
