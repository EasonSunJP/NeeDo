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

class RefundMutationAbort extends Error {
  public constructor(public readonly result: OrderRefundMutationResult) {
    super(result.kind);
  }
}

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
      if (!(await this.lockOrder(tx, input.orderId))) return { kind: "not_found" };
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
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
      await this.audit(tx, input, created.id, { refundAmountJpy: created.refundAmountJpy, currency: created.currency, fromStatus: null, toStatus: created.status, previousVersion: 0, nextVersion: created.version });
      return { kind: "created", value: await this.view(tx, created) };
    }, () => this.recoverCaseP2002(input, `booking:${input.orderId}`), ["order_refund_cases_active_key", "order_refund_case_events_idempotency_key", "active_key", "idempotency_key"]);
  }

  public merchantDecision(input: MerchantRefundDecisionCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      if (!(await this.lockOrder(tx, input.orderId))) return { kind: "not_found" };
      const found = await this.lockCaseForOrder(tx, input.casePublicId, input.orderId);
      if (!found) return { kind: "not_found" };
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
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
      await this.audit(tx, input, found.id, { refundAmountJpy: found.refundAmountJpy, currency: found.currency, fromStatus: found.status, toStatus: updated.status, previousVersion: found.version, nextVersion: updated.version, responsibility: "shop" });
      await this.notify(tx, found.customerUserId, found.requestedByIdentityId, input, "order_refund.merchant_decision.title", "order_refund.merchant_decision.body", { casePublicId: updated.publicId, status: this.status(updated.status) });
      return { kind: "updated", value: await this.view(tx, updated) };
    }, () => this.recoverCaseP2002(input), ["order_refund_case_events_idempotency_key", "idempotency_key"]);
  }

  public openComplaint(input: OpenRefundComplaintCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      if (!(await this.lockOrder(tx, input.orderId))) return { kind: "not_found" };
      const found = await this.lockCaseForOrder(tx, input.casePublicId, input.orderId);
      if (!found) return { kind: "not_found" };
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
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
      await this.audit(tx, input, found.id, { refundAmountJpy: found.refundAmountJpy, currency: found.currency, fromStatus: found.status, toStatus: updated.status, previousVersion: found.version, nextVersion: updated.version, disputeActiveKey: `refund-case:${found.id}` });
      if (found.merchantDecidedByUserId && found.merchantDecidedByIdentityId) {
        await this.notify(tx, found.merchantDecidedByUserId, found.merchantDecidedByIdentityId, input, "order_refund.complaint.title", "order_refund.complaint.body", { casePublicId: updated.publicId });
      }
      return { kind: "updated", value: await this.view(tx, updated) };
    }, () => this.recoverComplaintP2002(input), ["order_refund_disputes_active_key", "order_refund_case_events_idempotency_key", "active_key", "idempotency_key"]);
  }

  public async resolveDispute(input: ResolveRefundDisputeCommand): Promise<OrderRefundMutationResult> {
    // This preflight resolves only immutable foreign-key IDs. It is deliberately
    // outside the mutation transaction; state/version are never read from it.
    const target = await this.client.orderRefundDispute.findFirst({
      where: { publicId: input.disputePublicId, deletedAt: null },
      select: { id: true, orderRefundCaseId: true, bookingOrderId: true }
    });
    if (!target) return { kind: "not_found" };
    return this.mutate(async (tx) => {
      // Keep every multi-row command in the same deterministic order.
      if (!(await this.lockOrder(tx, target.bookingOrderId))) return { kind: "not_found" };
      await this.lockCase(tx, target.orderRefundCaseId);
      await this.lockDispute(tx, target.id);
      const replay = await this.replayDisputeRevision(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      const dispute = await tx.orderRefundDispute.findFirst({
        where: { id: target.id, deletedAt: null }, select: { id: true, orderRefundCaseId: true, bookingOrderId: true, status: true, version: true }
      });
      if (!dispute) return { kind: "not_found" };
      if (dispute.bookingOrderId !== target.bookingOrderId || dispute.orderRefundCaseId !== target.orderRefundCaseId) return { kind: "not_found" };
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
      await this.audit(tx, input, dispute.id, { refundAmountJpy: caseRow.refundAmountJpy, currency: caseRow.currency, fromStatus: caseRow.status, toStatus: updated.status, previousCaseVersion: caseRow.version, nextCaseVersion: updated.version, previousDisputeVersion: dispute.version, nextDisputeVersion: nextVersion, resolution: input.resolution });
      await this.notify(tx, caseRow.customerUserId, caseRow.requestedByIdentityId, input, "order_refund.dispute_resolved.title", "order_refund.dispute_resolved.body", { casePublicId: updated.publicId, resolution: input.resolution });
      return { kind: "updated", value: await this.view(tx, updated) };
    }, () => this.recoverDisputeP2002(input), ["order_refund_dispute_revisions_idempotency_key", "order_refund_case_events_idempotency_key", "idempotency_key"]);
  }

  public submitEvidence(input: SubmitRefundEvidenceCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      if (!(await this.lockOrder(tx, input.orderId))) return { kind: "not_found" };
      const found = await this.lockCaseForOrder(tx, input.casePublicId, input.orderId);
      if (!found) return { kind: "not_found" };
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      if (found.shopId !== input.shopId) return { kind: "scope_mismatch" };
      if (found.version !== input.expectedVersion) return { kind: "version_conflict", current: await this.view(tx, found) };
      const transition = transitionOrderRefundCase(this.status(found.status), "submit_refund_evidence");
      if (!transition.ok) return { kind: "invalid_state", current: await this.view(tx, found) };
      const updated = await tx.orderRefundCase.update({ where: { id: found.id }, data: {
        status: this.statusDb(transition.status), version: { increment: 1 }, refundEvidence: { reference: input.payload.reference },
        refundEvidenceSubmittedById: input.actorUserId, refundEvidenceIdentityId: input.actorIdentityId, refundEvidenceSubmittedAt: new Date()
      }, include: refundCaseInclude });
      await this.event(tx, found.id, found.bookingOrderId, caseAction("evidence"), found.status, updated.status, input, { reference: input.payload.reference });
      await this.audit(tx, input, found.id, { refundAmountJpy: found.refundAmountJpy, currency: found.currency, fromStatus: found.status, toStatus: updated.status, previousVersion: found.version, nextVersion: updated.version, refundReference: input.payload.reference });
      await this.notify(tx, found.customerUserId, found.requestedByIdentityId, input, "order_refund.evidence_submitted.title", "order_refund.evidence_submitted.body", { casePublicId: updated.publicId });
      return { kind: "updated", value: await this.view(tx, updated) };
    }, () => this.recoverCaseP2002(input), ["order_refund_case_events_idempotency_key", "idempotency_key"]);
  }

  public confirmCustomerReceipt(input: ConfirmRefundReceiptCommand): Promise<OrderRefundMutationResult> {
    return this.mutate(async (tx) => {
      if (!(await this.lockOrder(tx, input.orderId))) return { kind: "not_found" };
      const found = await this.lockCaseForOrder(tx, input.casePublicId, input.orderId);
      if (!found) return { kind: "not_found" };
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      if (found.customerUserId !== input.actorUserId) return { kind: "scope_mismatch" };
      if (found.version !== input.expectedVersion) return { kind: "version_conflict", current: await this.view(tx, found) };
      const transition = transitionOrderRefundCase(this.status(found.status), "confirm_customer_receipt");
      if (!transition.ok) return { kind: "invalid_state", current: await this.view(tx, found) };
      const affiliateBefore = await this.affiliateSnapshot(tx, found.bookingOrderId);
      if (affiliateBefore.some((reward) => reward.status.toUpperCase() !== AffiliateRewardStatus.SETTLED || reward.claimantWallet === null)) return { kind: "affiliate_invariant_failed" };
      const orderUpdated = await tx.bookingOrder.updateMany({ where: {
        id: found.bookingOrderId, status: BookingOrderStatus.COMPLETED, paymentStatus: ServicePaymentStatus.CONFIRMED,
        paymentRefundedAt: null, deletedAt: null
      }, data: { paymentStatus: ServicePaymentStatus.REFUNDED, paymentRefundedAt: new Date(), paymentRefundedById: input.actorUserId, paymentRefundReference: this.evidenceReference(found.refundEvidence), paymentRefundReason: found.requestReason } });
      if (orderUpdated.count !== 1) return { kind: "invalid_state", current: await this.view(tx, found) };
      const financialUpdated = await tx.orderFinancial.updateMany({ where: { bookingOrderId: found.bookingOrderId, deletedAt: null }, data: { settlementStatus: "refunded" } });
      if (financialUpdated.count !== 1) {
        throw new RefundMutationAbort({ kind: "invalid_state", current: await this.view(tx, found) });
      }
      const updated = await tx.orderRefundCase.update({ where: { id: found.id }, data: {
        status: this.statusDb(transition.status), version: { increment: 1 }, activeKey: null, customerConfirmedAt: new Date()
      }, include: refundCaseInclude });
      const affiliateAfter = await this.affiliateSnapshot(tx, found.bookingOrderId);
      if (JSON.stringify(affiliateBefore) !== JSON.stringify(affiliateAfter)) throw new Error("error.order_refund.affiliate_invariant_failed");
      await this.event(tx, found.id, found.bookingOrderId, caseAction("receipt"), found.status, updated.status, input, {});
      await this.audit(tx, input, found.id, { fromStatus: found.status, toStatus: updated.status, previousVersion: found.version, nextVersion: updated.version, refundAmountJpy: found.refundAmountJpy, currency: found.currency, customerConfirmed: true });
      if (found.merchantDecidedByUserId && found.merchantDecidedByIdentityId) {
        await this.notify(tx, found.merchantDecidedByUserId, found.merchantDecidedByIdentityId, input, "order_refund.customer_confirmed.title", "order_refund.customer_confirmed.body", { casePublicId: updated.publicId });
      }
      return { kind: "updated", value: await this.view(tx, updated) };
    }, () => this.recoverCaseP2002(input), ["order_refund_case_events_idempotency_key", "idempotency_key"]);
  }

  public async listDisputes(input: ListRefundDisputesInput): Promise<PaginatedRefundDisputes> {
    const where = this.disputeWhere(input);
    const [rows, total] = await Promise.all([
      this.client.orderRefundDispute.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (input.page - 1) * input.page_size, take: input.page_size, select: { refundCase: { include: refundCaseInclude } } }),
      this.client.orderRefundDispute.count({ where })
    ]);
    return { list: await Promise.all(rows.map((row) => this.view(this.client, row.refundCase))), total, page: input.page, page_size: input.page_size };
  }

  private async mutate(operation: (tx: Tx) => Promise<OrderRefundMutationResult>, recoverP2002?: () => Promise<OrderRefundMutationResult | null>, allowedP2002Targets: readonly string[] = []): Promise<OrderRefundMutationResult> {
    try {
      return await runWithTransactionConflictRetry(() => this.client.$transaction((tx) => operation(tx)));
    } catch (error) {
      if (error instanceof RefundMutationAbort) return error.result;
      if (recoverP2002 && this.isRelevantP2002(error, allowedP2002Targets)) {
        const recovered = await recoverP2002();
        if (recovered) return recovered;
      }
      throw error;
    }
  }

  private async lockOrder(tx: Tx, id: number): Promise<boolean> { return (await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT id FROM booking_orders WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`)).length === 1; }
  private async lockCase(tx: Tx, id: number): Promise<void> { await tx.$queryRaw(Prisma.sql`SELECT id FROM order_refund_cases WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`); }
  private async lockDispute(tx: Tx, id: number): Promise<void> { await tx.$queryRaw(Prisma.sql`SELECT id FROM order_refund_disputes WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`); }

  private async lockCaseForOrder(tx: Tx, publicId: string, orderId: number): Promise<RefundCaseRecord | null> {
    const locked = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT id FROM order_refund_cases WHERE public_id = ${publicId} AND booking_order_id = ${orderId} AND deleted_at IS NULL FOR UPDATE`);
    if (locked.length !== 1) return null;
    return tx.orderRefundCase.findFirst({ where: { id: locked[0].id, deletedAt: null }, include: refundCaseInclude });
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

  private async audit(tx: Tx, input: { idempotencyKey: string; audit: Parameters<typeof toAuditLogCreateData>[0] }, targetId: number, evidence: Record<string, unknown>): Promise<void> {
    const inherited = input.audit.metadata && typeof input.audit.metadata === "object" && !Array.isArray(input.audit.metadata) ? input.audit.metadata as Record<string, unknown> : {};
    await tx.auditLog.create({ data: toAuditLogCreateData({ ...input.audit, targetId, metadata: { ...inherited, idempotencyKey: input.idempotencyKey, ...evidence } }) });
  }

  private async notify(tx: Tx, recipientUserId: number, recipientIdentityId: number, input: { actorUserId: number; actorIdentityId: number }, title: string, body: string, payload: Record<string, unknown>): Promise<void> {
    await tx.notification.create({ data: { recipientUserId, recipientIdentityId, actorUserId: input.actorUserId, actorIdentityId: input.actorIdentityId, type: NotificationType.SYSTEM, title, body, payload: payload as Prisma.InputJsonValue } });
  }

  private async affiliateSnapshot(tx: Tx, bookingOrderId: number) {
    // In MySQL's default REPEATABLE READ, a prior ordinary Prisma read can
    // retain an older consistent snapshot. These locking reads are the source
    // of truth: next-key locks cover the indexed reward range and each child
    // transaction/wallet row before the comparison is constructed.
    const rewards = await tx.$queryRaw<Array<{
      id: number; status: string; rewardNdp: unknown; platformFeeNdp: unknown;
      reversalRequiredNdp: unknown; reversedNdp: unknown; outstandingRecoveryNdp: unknown;
      claimantWalletId: number;
    }>>(Prisma.sql`SELECT id, status, reward_ndp AS rewardNdp, platform_fee_ndp AS platformFeeNdp, reversal_required_ndp AS reversalRequiredNdp, reversed_ndp AS reversedNdp, outstanding_recovery_ndp AS outstandingRecoveryNdp, claimant_wallet_id AS claimantWalletId FROM affiliate_rewards WHERE booking_order_id = ${bookingOrderId} AND deleted_at IS NULL ORDER BY id FOR UPDATE`);
    const rewardIds = rewards.map((row) => row.id);
    if (rewardIds.length === 0) return [];
    const walletIds = [...new Set(rewards.map((reward) => reward.claimantWalletId))];
    const transactions = await tx.$queryRaw<Array<{ id: number; rewardId: number; kind: string; ledgerTransactionId: number; amountNdp: unknown }>>(Prisma.sql`SELECT id, reward_id AS rewardId, kind, ledger_transaction_id AS ledgerTransactionId, amount_ndp AS amountNdp FROM affiliate_reward_transactions WHERE reward_id IN (${Prisma.join(rewardIds)}) AND deleted_at IS NULL ORDER BY reward_id, id FOR UPDATE`);
    const wallets = walletIds.length === 0 ? [] : await tx.$queryRaw<Array<{ id: number; availableBalance: unknown; frozenBalance: unknown }>>(Prisma.sql`SELECT id, available_balance AS availableBalance, frozen_balance AS frozenBalance FROM wallets WHERE id IN (${Prisma.join(walletIds)}) AND deleted_at IS NULL ORDER BY id FOR UPDATE`);
    const byReward = new Map<number, Array<{ id: number; kind: string; ledgerTransactionId: number; amountNdp: unknown }>>();
    for (const transaction of transactions) byReward.set(transaction.rewardId, [...(byReward.get(transaction.rewardId) ?? []), { id: transaction.id, kind: transaction.kind, ledgerTransactionId: transaction.ledgerTransactionId, amountNdp: transaction.amountNdp }]);
    const byWallet = new Map(wallets.map((wallet) => [wallet.id, wallet]));
    return rewards.map((reward) => ({ ...reward, claimantWallet: byWallet.get(reward.claimantWalletId) ?? null, transactions: byReward.get(reward.id) ?? [] }));
  }

  private isRelevantP2002(error: unknown, allowedTargets: readonly string[]): boolean {
    if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return false;
    const meta = (error as { meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { index?: unknown; fields?: unknown } } } } }).meta;
    return [meta?.target, meta?.driverAdapterError?.cause?.constraint?.index, meta?.driverAdapterError?.cause?.constraint?.fields]
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .some((value) => {
        const normalized = String(value ?? "").toLowerCase();
        return allowedTargets.some((allowed) => normalized.includes(allowed));
      });
  }

  private async recoverCaseP2002(input: { idempotencyKey: string; fingerprint: string }, activeKey?: string): Promise<OrderRefundMutationResult | null> {
    return this.client.$transaction(async (tx) => {
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      if (!activeKey) return null;
      const active = await tx.orderRefundCase.findFirst({ where: { activeKey, deletedAt: null }, include: refundCaseInclude });
      return active ? { kind: "active_conflict", current: await this.view(tx, active) } : null;
    });
  }

  private async recoverDisputeP2002(input: { idempotencyKey: string; fingerprint: string }): Promise<OrderRefundMutationResult | null> {
    return this.client.$transaction((tx) => this.replayDisputeRevision(tx, input.idempotencyKey, input.fingerprint));
  }

  private async recoverComplaintP2002(input: OpenRefundComplaintCommand): Promise<OrderRefundMutationResult | null> {
    return this.client.$transaction(async (tx) => {
      const replay = await this.replayCaseEvent(tx, input.idempotencyKey, input.fingerprint);
      if (replay) return replay;
      const current = await tx.orderRefundCase.findFirst({ where: { publicId: input.casePublicId, bookingOrderId: input.orderId, deletedAt: null }, include: refundCaseInclude });
      if (!current) return null;
      const active = await tx.orderRefundDispute.findFirst({ where: { activeKey: `refund-case:${current.id}`, deletedAt: null }, select: { id: true } });
      return active ? { kind: "active_conflict", current: await this.view(tx, current) } : null;
    });
  }

  private disputeWhere(input: ListRefundDisputesInput): Prisma.OrderRefundDisputeWhereInput {
    const search = input.search?.trim();
    return { deletedAt: null, ...(input.status ? { status: input.status === "open" ? OrderRefundDisputeStatus.OPEN : OrderRefundDisputeStatus.RESOLVED } : {}), ...(search ? { OR: [
      { bookingOrder: { orderNo: { contains: search } } }, { refundCase: { publicId: { contains: search } } },
      { customer: { needoId: { contains: search } } }, { shop: { shopNo: { contains: search } } }, { shop: { name: { contains: search } } }
    ] } : {}) };
  }

  private async view(client: Pick<PrismaClient, "affiliateReward"> | Tx, row: RefundCaseRecord): Promise<OrderRefundCaseView> {
    const reward = await client.affiliateReward.findFirst({ where: { bookingOrderId: row.bookingOrderId, deletedAt: null }, orderBy: { id: "asc" }, select: { status: true, rewardNdp: true } });
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
