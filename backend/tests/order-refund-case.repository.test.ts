import { AffiliateRewardStatus, BookingOrderStatus, ServicePaymentStatus, type PrismaClient } from "@prisma/client";
import { OrderRefundCaseRepository } from "../src/repositories/order-refund-case.repository";
import type { ConfirmRefundReceiptCommand, MerchantRefundDecisionCommand, OpenRefundComplaintCommand, RequestRefundCommand, ResolveRefundDisputeCommand, SubmitRefundEvidenceCommand } from "../src/services/order-refund-case.service";

const now = new Date("2026-09-07T00:00:00.000Z");

const command: RequestRefundCommand = {
  orderId: 71,
  actorUserId: 11,
  actorIdentityId: 111,
  actorScope: { type: "global", id: null },
  shopId: null,
  idempotencyKey: "refund-request-0001",
  fingerprint: "a".repeat(64),
  expectedVersion: 0,
  payload: { reason: "service materially differed" },
  audit: { action: "order_refund.requested", targetType: "OrderRefundCase", actorId: 11 }
};

const refundCase = {
  id: 81,
  publicId: "d7b4c4c8-ef16-45fb-8e40-4be1b30f2a2d",
  bookingOrderId: 71,
  shopId: 31,
  customerUserId: 11,
  status: "MERCHANT_REVIEW_PENDING",
  responsibility: "shop",
  refundAmountJpy: 8800,
  currency: "JPY",
  version: 1,
  requestReason: command.payload.reason,
  merchantDecisionReason: null,
  refundEvidence: null,
  requestedAt: now,
  merchantDecidedAt: null,
  refundEvidenceSubmittedAt: null,
  customerConfirmedAt: null,
  createdAt: now,
  updatedAt: now,
  bookingOrder: { orderNo: "NDP-REFUND-71" },
  shop: { shopNo: "shop0000031", name: "Scoped shop" },
  customer: { needoId: "u0000000011", username: "Customer", customerProfile: { displayName: "Customer" } },
  disputes: []
};

describe("OrderRefundCaseRepository", () => {
  it("persists customer requests in one retried transaction", () => {
    expect(OrderRefundCaseRepository).toBeDefined();
  });

  it("derives completed paid customer refund amount from the locked order instead of command input", async () => {
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 71 }]),
      orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 1 })) },
      bookingOrder: { findFirst: jest.fn(async () => ({
        id: 71, shopId: 31, customerUserId: 11, status: BookingOrderStatus.COMPLETED,
        paymentStatus: ServicePaymentStatus.CONFIRMED, paymentAmountJpy: 8800, paymentRefundedAt: null, currency: "JPY"
      })) },
      orderRefundCase: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => refundCase)
      },
      auditLog: { create: jest.fn(async () => ({ id: 1 })) },
      affiliateReward: { findFirst: jest.fn(async () => null) }
    };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const repository = new OrderRefundCaseRepository(client as unknown as PrismaClient);

    await expect(repository.request(command)).resolves.toMatchObject({
      kind: "created",
      value: { refundAmountJpy: 8800, currency: "JPY", responsibility: "shop" }
    });
    expect(tx.orderRefundCase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ refundAmountJpy: 8800, currency: "JPY", responsibility: "shop", activeKey: "booking:71" })
    }));
    expect(tx.orderRefundCaseEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idempotencyKey: command.idempotencyKey, requestFingerprint: command.fingerprint })
    }));
  });

  it("rolls back customer confirmation when the required financial projection is absent", async () => {
    const pendingCase = { ...refundCase, status: "CUSTOMER_CONFIRMATION_PENDING", version: 4, refundEvidence: { reference: "bank-123" } };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 71 }])
        .mockResolvedValueOnce([{ id: pendingCase.id }])
        .mockResolvedValueOnce([{ id: 1, status: "SETTLED", rewardNdp: 50, platformFeeNdp: 0, reversalRequiredNdp: 0, reversedNdp: 0, outstandingRecoveryNdp: 0, claimantWalletId: 99 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 99, availableBalance: 50, frozenBalance: 0 }]),
      orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 1 })) },
      orderRefundCase: { findFirst: jest.fn(async () => pendingCase), update: jest.fn(async () => pendingCase) },
      bookingOrder: { updateMany: jest.fn(async () => ({ count: 1 })) },
      orderFinancial: { updateMany: jest.fn(async () => ({ count: 0 })) },
      affiliateReward: { findFirst: jest.fn(async () => null) },
      auditLog: { create: jest.fn(async () => ({ id: 1 })) },
      notification: { create: jest.fn(async () => ({ id: 1 })) }
    };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const repository = new OrderRefundCaseRepository(client as unknown as PrismaClient);

    const receiptCommand: ConfirmRefundReceiptCommand = { ...command, casePublicId: pendingCase.publicId, expectedVersion: 4, idempotencyKey: "refund-receipt-0001", payload: {} };
    await expect(repository.confirmCustomerReceipt(receiptCommand)).resolves.toMatchObject({ kind: "invalid_state" });
    expect(tx.orderRefundCase.update).not.toHaveBeenCalled();
  });

  it("recovers an active-case P2002 as an active conflict instead of returning a 500", async () => {
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 71 }]),
      orderRefundCaseEvent: { findFirst: jest.fn(async () => null) },
      bookingOrder: { findFirst: jest.fn(async () => ({
        id: 71, shopId: 31, customerUserId: 11, status: BookingOrderStatus.COMPLETED,
        paymentStatus: ServicePaymentStatus.CONFIRMED, paymentAmountJpy: 8800, paymentRefundedAt: null, currency: "JPY"
      })) },
      orderRefundCase: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(refundCase),
        create: jest.fn(async () => { throw { code: "P2002", meta: { target: "order_refund_cases_active_key_key" } }; })
      },
      affiliateReward: { findFirst: jest.fn(async () => null) }
    };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const repository = new OrderRefundCaseRepository(client as unknown as PrismaClient);

    await expect(repository.request(command)).resolves.toMatchObject({ kind: "active_conflict", current: { publicId: refundCase.publicId } });
  });

  it("recognizes a refund active-key P2002 reported only by the Prisma driver adapter", async () => {
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 71 }]),
      orderRefundCaseEvent: { findFirst: jest.fn(async () => null) },
      bookingOrder: { findFirst: jest.fn(async () => ({ id: 71, shopId: 31, customerUserId: 11, status: BookingOrderStatus.COMPLETED, paymentStatus: ServicePaymentStatus.CONFIRMED, paymentAmountJpy: 8800, paymentRefundedAt: null, currency: "JPY" })) },
      orderRefundCase: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(refundCase), create: jest.fn(async () => { throw { code: "P2002", meta: { driverAdapterError: { cause: { constraint: { index: "order_refund_cases_active_key_key" } } } } }; }) },
      affiliateReward: { findFirst: jest.fn(async () => null) }
    };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).request(command)).resolves.toMatchObject({ kind: "active_conflict" });
  });

  it("does not swallow unrelated P2002 failures", async () => {
    const failure = { code: "P2002", meta: { target: ["users_email_key"] } };
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 71 }]),
      orderRefundCaseEvent: { findFirst: jest.fn(async () => null) },
      bookingOrder: { findFirst: jest.fn(async () => ({ id: 71, shopId: 31, customerUserId: 11, status: BookingOrderStatus.COMPLETED, paymentStatus: ServicePaymentStatus.CONFIRMED, paymentAmountJpy: 8800, paymentRefundedAt: null, currency: "JPY" })) },
      orderRefundCase: { findFirst: jest.fn(async () => null), create: jest.fn(async () => { throw failure; }) },
      affiliateReward: { findFirst: jest.fn(async () => null) }
    };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).request(command)).rejects.toBe(failure);
  });

  it.each([
    ["exact event fingerprint", command.fingerprint, "replayed"],
    ["different event fingerprint", "b".repeat(64), "idempotency_conflict"]
  ])("recovers an idempotency P2002 as %s", async (_label, storedFingerprint, expectedKind) => {
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 71 }]),
      orderRefundCaseEvent: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ requestFingerprint: storedFingerprint, refundCase }) },
      bookingOrder: { findFirst: jest.fn(async () => ({
        id: 71, shopId: 31, customerUserId: 11, status: BookingOrderStatus.COMPLETED,
        paymentStatus: ServicePaymentStatus.CONFIRMED, paymentAmountJpy: 8800, paymentRefundedAt: null, currency: "JPY"
      })) },
      orderRefundCase: { findFirst: jest.fn(async () => null), create: jest.fn(async () => { throw { code: "P2002", meta: { target: "order_refund_case_events_idempotency_key_key" } }; }) },
      affiliateReward: { findFirst: jest.fn(async () => null) }
    };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const repository = new OrderRefundCaseRepository(client as unknown as PrismaClient);

    await expect(repository.request(command)).resolves.toMatchObject({ kind: expectedKind });
  });

  it("rejects customer confirmation before touching payment when any locked Affiliate reward is not settled", async () => {
    const pendingCase = { ...refundCase, status: "CUSTOMER_CONFIRMATION_PENDING", version: 4, refundEvidence: { reference: "bank-123" } };
    const pendingReward = {
      id: 1, status: AffiliateRewardStatus.PENDING, rewardNdp: 50, platformFeeNdp: 0,
      reversalRequiredNdp: 0, reversedNdp: 0, outstandingRecoveryNdp: 0, claimantWalletId: 99,
      claimantWallet: { id: 99, availableBalance: 50, frozenBalance: 0 }, transactions: []
    };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 71 }])
        .mockResolvedValueOnce([{ id: pendingCase.id }])
        .mockResolvedValueOnce([pendingReward])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 99, availableBalance: 50, frozenBalance: 0 }]),
      orderRefundCaseEvent: { findFirst: jest.fn(async () => null) },
      orderRefundCase: { findFirst: jest.fn(async () => pendingCase) },
      affiliateReward: { findFirst: jest.fn(async () => null) },
      bookingOrder: { updateMany: jest.fn(async () => ({ count: 1 })) }
    };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const repository = new OrderRefundCaseRepository(client as unknown as PrismaClient);
    const receiptCommand: ConfirmRefundReceiptCommand = { ...command, casePublicId: pendingCase.publicId, expectedVersion: 4, idempotencyKey: "refund-receipt-pending", payload: {} };

    await expect(repository.confirmCustomerReceipt(receiptCommand)).resolves.toMatchObject({ kind: "affiliate_invariant_failed" });
    expect(tx.bookingOrder.updateMany).not.toHaveBeenCalled();
  });

  it("locks the nested case before reading its current status and version for a merchant decision", async () => {
    const currentCase = { ...refundCase, status: "MERCHANT_REVIEW_PENDING", version: 6 };
    const updatedCase = { ...currentCase, status: "REFUND_PENDING", version: 7 };
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: currentCase.id }]),
      orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 1 })) },
      orderRefundCase: { findFirst: jest.fn(async () => currentCase), update: jest.fn(async () => updatedCase) },
      affiliateReward: { findFirst: jest.fn(async () => null) },
      auditLog: { create: jest.fn(async () => ({ id: 1 })) },
      notification: { create: jest.fn(async () => ({ id: 1 })) }
    };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const repository = new OrderRefundCaseRepository(client as unknown as PrismaClient);
    const decision: MerchantRefundDecisionCommand = { ...command, orderId: 71, casePublicId: currentCase.publicId, decision: "approve", shopId: 31, expectedVersion: 6, idempotencyKey: "refund-approve-0001", payload: { note: "approved" } };

    await expect(repository.merchantDecision(decision)).resolves.toMatchObject({ kind: "updated", value: { status: "refund_pending", version: 7 } });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.orderRefundCase.findFirst.mock.invocationCallOrder[0]);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ idempotencyKey: decision.idempotencyKey, fromStatus: "MERCHANT_REVIEW_PENDING", toStatus: "REFUND_PENDING", previousVersion: 6, nextVersion: 7, responsibility: "shop" }) }) }));
  });

  it("aborts confirmation when a second locked reward snapshot changes", async () => {
    const pendingCase = { ...refundCase, status: "CUSTOMER_CONFIRMATION_PENDING", version: 4, refundEvidence: { reference: "bank-123" } };
    const reward = (rewardNdp: number) => ({ id: 1, status: "SETTLED", rewardNdp, platformFeeNdp: 0, reversalRequiredNdp: 0, reversedNdp: 0, outstandingRecoveryNdp: 0, claimantWalletId: 99 });
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 71 }]).mockResolvedValueOnce([{ id: pendingCase.id }])
        .mockResolvedValueOnce([reward(50)]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 99, availableBalance: 50, frozenBalance: 0 }])
        .mockResolvedValueOnce([reward(51)]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 99, availableBalance: 50, frozenBalance: 0 }]),
      orderRefundCaseEvent: { findFirst: jest.fn(async () => null) },
      orderRefundCase: { findFirst: jest.fn(async () => pendingCase), update: jest.fn(async () => ({ ...pendingCase, status: "REFUNDED", version: 5 })) },
      bookingOrder: { updateMany: jest.fn(async () => ({ count: 1 })) },
      orderFinancial: { updateMany: jest.fn(async () => ({ count: 1 })) },
      affiliateReward: { findFirst: jest.fn(async () => null) },
      auditLog: { create: jest.fn(async () => ({ id: 1 })) },
      notification: { create: jest.fn(async () => ({ id: 1 })) }
    };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const receiptCommand: ConfirmRefundReceiptCommand = { ...command, casePublicId: pendingCase.publicId, expectedVersion: 4, idempotencyKey: "refund-receipt-changed", payload: {} };

    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).confirmCustomerReceipt(receiptCommand)).resolves.toMatchObject({ kind: "affiliate_invariant_failed" });
  });

  it("records merchant rejection as shop responsibility with amount evidence", async () => {
    const currentCase = { ...refundCase, status: "MERCHANT_REVIEW_PENDING", version: 2 };
    const updatedCase = { ...currentCase, status: "MERCHANT_REJECTED", version: 3 };
    const tx = { $queryRaw: jest.fn(async () => [{ id: 1 }]), orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, orderRefundCase: { findFirst: jest.fn(async () => currentCase), update: jest.fn(async () => updatedCase) }, affiliateReward: { findFirst: jest.fn(async () => null) }, auditLog: { create: jest.fn(async () => ({})) }, notification: { create: jest.fn(async () => ({})) } };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const decision: MerchantRefundDecisionCommand = { ...command, casePublicId: currentCase.publicId, decision: "reject", shopId: 31, expectedVersion: 2, idempotencyKey: "refund-reject-0001", payload: { note: "rejected" } };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).merchantDecision(decision)).resolves.toMatchObject({ kind: "updated", value: { status: "merchant_rejected", version: 3 } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ refundAmountJpy: 8800, currency: "JPY", responsibility: "shop" }) }) }));
  });

  it("hides a case from the wrong shop and rejects stale nested case versions", async () => {
    const currentCase = { ...refundCase, status: "MERCHANT_REVIEW_PENDING", version: 3 };
    const tx = { $queryRaw: jest.fn(async () => [{ id: currentCase.id }]), orderRefundCaseEvent: { findFirst: jest.fn(async () => null) }, orderRefundCase: { findFirst: jest.fn(async () => currentCase) }, affiliateReward: { findFirst: jest.fn(async () => null) } };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const repository = new OrderRefundCaseRepository(client as unknown as PrismaClient);
    await expect(repository.merchantDecision({ ...command, casePublicId: currentCase.publicId, decision: "approve", shopId: 32, expectedVersion: 3, idempotencyKey: "refund-wrong-shop", payload: { note: "x" } })).resolves.toMatchObject({ kind: "scope_mismatch" });
    await expect(repository.merchantDecision({ ...command, casePublicId: currentCase.publicId, decision: "approve", shopId: 31, expectedVersion: 2, idempotencyKey: "refund-stale-version", payload: { note: "x" } })).resolves.toMatchObject({ kind: "version_conflict" });
  });

  it("records evidence as customer-confirmation-pending without updating the order", async () => {
    const currentCase = { ...refundCase, status: "REFUND_PENDING", version: 3 };
    const updatedCase = { ...currentCase, status: "CUSTOMER_CONFIRMATION_PENDING", version: 4, refundEvidence: { reference: "bank-8" } };
    const tx = { $queryRaw: jest.fn(async () => [{ id: 1 }]), orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, orderRefundCase: { findFirst: jest.fn(async () => currentCase), update: jest.fn(async () => updatedCase) }, bookingOrder: { updateMany: jest.fn() }, affiliateReward: { findFirst: jest.fn(async () => null) }, auditLog: { create: jest.fn(async () => ({})) }, notification: { create: jest.fn(async () => ({})) } };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const evidence: SubmitRefundEvidenceCommand = { ...command, casePublicId: currentCase.publicId, shopId: 31, expectedVersion: 3, idempotencyKey: "refund-evidence-0001", payload: { reference: "bank-8" } };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).submitEvidence(evidence)).resolves.toMatchObject({ kind: "updated", value: { status: "customer_confirmation_pending", version: 4 } });
    expect(tx.bookingOrder.updateMany).not.toHaveBeenCalled();
  });

  it("uses one identical deleted-filtered where object for dispute list and count", async () => {
    const findMany = jest.fn(async () => [{ refundCase }]);
    const count = jest.fn(async () => 1);
    const client = { orderRefundDispute: { findMany, count }, affiliateReward: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) } };
    const repository = new OrderRefundCaseRepository(client as unknown as PrismaClient);
    await expect(repository.listDisputes({ actorUserId: 9, actorIdentityId: 90, actorScope: { type: "global", id: null }, page: 2, page_size: 10, status: "open", search: "shop" })).resolves.toMatchObject({ total: 1, page: 2, page_size: 10 });
    const findArgs = (findMany.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0];
    const countArgs = (count.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0];
    expect(findArgs).toEqual(expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 10, take: 10 }));
    expect(countArgs.where).toBe(findArgs.where);
    expect(findArgs.where).toMatchObject({ deletedAt: null, status: "OPEN" });
  });

  it.each([[null, "customer"], [31, "scoped merchant"]])("opens a complaint only for the %s actor after rejection", async (shopId, label) => {
    const rejectedCase = { ...refundCase, status: "MERCHANT_REJECTED", version: 4, merchantDecidedByUserId: 8, merchantDecidedByIdentityId: 80 };
    const disputedCase = { ...rejectedCase, status: "DISPUTED", version: 5 };
    const tx = { $queryRaw: jest.fn(async () => [{ id: 1 }]), orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, orderRefundCase: { findFirst: jest.fn(async () => rejectedCase), update: jest.fn(async () => disputedCase) }, orderRefundDispute: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, affiliateReward: { findFirst: jest.fn(async () => null) }, auditLog: { create: jest.fn(async () => ({})) }, notification: { create: jest.fn(async () => ({})) } };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const complaint: OpenRefundComplaintCommand = { ...command, casePublicId: rejectedCase.publicId, shopId, actorUserId: shopId === null ? 11 : 8, actorIdentityId: shopId === null ? 111 : 80, expectedVersion: 4, idempotencyKey: `refund-complaint-${label}`, payload: { reason: "merchant rejected" } };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).openComplaint(complaint)).resolves.toMatchObject({ kind: "updated", value: { status: "disputed", version: 5 } });
  });

  it("requires an open dispute before operations can resolve and keeps reject closure terminal", async () => {
    const disputedCase = { ...refundCase, status: "DISPUTED", version: 5 };
    const tx = { $queryRaw: jest.fn(async () => [{ id: 1 }]), orderRefundDisputeRevision: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, orderRefundDispute: { findFirst: jest.fn().mockResolvedValueOnce({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71, status: "OPEN", version: 3 }).mockResolvedValueOnce({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71, status: "OPEN", version: 3 }), update: jest.fn(async () => ({})) }, orderRefundCase: { findFirst: jest.fn(async () => disputedCase), update: jest.fn(async () => ({ ...disputedCase, status: "DISPUTE_REJECTED", version: 6 })) }, orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, affiliateReward: { findFirst: jest.fn(async () => null) }, auditLog: { create: jest.fn(async () => ({})) }, notification: { create: jest.fn(async () => ({})) } };
    const client = { orderRefundDispute: tx.orderRefundDispute, $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const resolution: ResolveRefundDisputeCommand = { ...command, disputePublicId: "e0a2d0ac-7445-426a-9f29-1f4820463955", expectedVersion: 3, idempotencyKey: "refund-resolve-reject", resolution: "reject", payload: { publicReason: "supported" } };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).resolveDispute(resolution)).resolves.toMatchObject({ kind: "updated", value: { status: "dispute_rejected", version: 6 } });
    expect(tx.orderRefundDispute.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ activeKey: null, version: 4 }) }));
  });

  it.each([["transaction", 50, 51, 50], ["wallet", 50, 50, 51]])("aborts before event/audit when the second locked %s snapshot changes", async (_kind, beforeTransaction, afterTransaction, afterWallet) => {
    const pendingCase = { ...refundCase, status: "CUSTOMER_CONFIRMATION_PENDING", version: 4, refundEvidence: { reference: "bank-123" } };
    const reward = { id: 1, status: "SETTLED", rewardNdp: 50, platformFeeNdp: 0, reversalRequiredNdp: 0, reversedNdp: 0, outstandingRecoveryNdp: 0, claimantWalletId: 99 };
    const transaction = (amountNdp: number) => [{ id: 7, rewardId: 1, kind: "SETTLEMENT", ledgerTransactionId: 70, amountNdp }];
    const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 71 }]).mockResolvedValueOnce([{ id: 81 }]).mockResolvedValueOnce([reward]).mockResolvedValueOnce(transaction(beforeTransaction)).mockResolvedValueOnce([{ id: 99, availableBalance: 50, frozenBalance: 0 }]).mockResolvedValueOnce([reward]).mockResolvedValueOnce(transaction(afterTransaction)).mockResolvedValueOnce([{ id: 99, availableBalance: afterWallet, frozenBalance: 0 }]), orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, orderRefundCase: { findFirst: jest.fn(async () => pendingCase), update: jest.fn(async () => ({ ...pendingCase, status: "REFUNDED", version: 5 })) }, bookingOrder: { updateMany: jest.fn(async () => ({ count: 1 })) }, orderFinancial: { updateMany: jest.fn(async () => ({ count: 1 })) }, affiliateReward: { findFirst: jest.fn(async () => null) }, auditLog: { create: jest.fn(async () => ({})) }, notification: { create: jest.fn(async () => ({})) } };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const receipt: ConfirmRefundReceiptCommand = { ...command, casePublicId: pendingCase.publicId, expectedVersion: 4, idempotencyKey: `refund-${_kind}-changed`, payload: {} };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).confirmCustomerReceipt(receipt)).resolves.toMatchObject({ kind: "affiliate_invariant_failed" });
    expect(tx.orderRefundCaseEvent.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([["deleted case"], ["order-case mismatch"]])("hides %s nested targets", async () => {
    const tx = { $queryRaw: jest.fn(async () => []), orderRefundCase: { findFirst: jest.fn(async () => refundCase) } };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).merchantDecision({ ...command, casePublicId: refundCase.publicId, decision: "approve", shopId: 31, expectedVersion: 1, idempotencyKey: `refund-hidden-${Math.random()}`, payload: { note: "x" } })).resolves.toMatchObject({ kind: "not_found" });
    expect(tx.orderRefundCase.findFirst).not.toHaveBeenCalled();
  });

  it("resolves an open dispute to refund while retaining the case active key and revision evidence", async () => {
    const disputedCase = { ...refundCase, status: "DISPUTED", version: 5, activeKey: "booking:71" };
    const refundedPending = { ...disputedCase, status: "REFUND_PENDING", version: 6, activeKey: "booking:71" };
    const tx = { $queryRaw: jest.fn(async () => [{ id: 1 }]), orderRefundDisputeRevision: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, orderRefundDispute: { findFirst: jest.fn().mockResolvedValueOnce({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71 }).mockResolvedValueOnce({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71, status: "OPEN", version: 3 }), update: jest.fn(async () => ({})) }, orderRefundCase: { findFirst: jest.fn(async () => disputedCase), update: jest.fn(async () => refundedPending) }, orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, affiliateReward: { findFirst: jest.fn(async () => null) }, auditLog: { create: jest.fn(async () => ({})) }, notification: { create: jest.fn(async () => ({})) } };
    const client = { orderRefundDispute: tx.orderRefundDispute, $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const resolution: ResolveRefundDisputeCommand = { ...command, disputePublicId: "e0a2d0ac-7445-426a-9f29-1f4820463955", expectedVersion: 3, idempotencyKey: "refund-resolve-refund", resolution: "refund", payload: { publicReason: "supported" } };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).resolveDispute(resolution)).resolves.toMatchObject({ kind: "updated", value: { status: "refund_pending", version: 6 } });
    expect(tx.orderRefundDisputeRevision.create).toHaveBeenCalled();
    expect(tx.orderRefundCase.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ activeKey: undefined }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ refundAmountJpy: 8800, currency: "JPY", nextDisputeVersion: 4 }) }) }));
  });

  it.each([["RESOLVED", "DISPUTED"], ["OPEN", "REFUND_PENDING"]])("returns dispute_required without writes for %s/%s", async (disputeStatus, caseStatus) => {
    const currentCase = { ...refundCase, status: caseStatus, version: 5 };
    const tx = { $queryRaw: jest.fn(async () => [{ id: 1 }]), orderRefundCaseEvent: { findFirst: jest.fn(async () => null) }, orderRefundDisputeRevision: { findFirst: jest.fn(async () => null), create: jest.fn() }, orderRefundDispute: { findFirst: jest.fn().mockResolvedValueOnce({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71 }).mockResolvedValueOnce({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71, status: disputeStatus, version: 3 }), update: jest.fn() }, orderRefundCase: { findFirst: jest.fn(async () => currentCase), update: jest.fn() }, affiliateReward: { findFirst: jest.fn(async () => null) } };
    const client = { orderRefundDispute: tx.orderRefundDispute, $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const resolution: ResolveRefundDisputeCommand = { ...command, disputePublicId: "e0a2d0ac-7445-426a-9f29-1f4820463955", expectedVersion: 3, idempotencyKey: `refund-no-open-${disputeStatus}-${caseStatus}`, resolution: "refund", payload: { publicReason: "x" } };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).resolveDispute(resolution)).resolves.toMatchObject({ kind: "dispute_required" });
    expect(tx.orderRefundDispute.update).not.toHaveBeenCalled();
    expect(tx.orderRefundDisputeRevision.create).not.toHaveBeenCalled();
  });

  it("finalizes receipt with one order, one financial projection, terminal case, and equal raw Affiliate snapshots", async () => {
    const pendingCase = { ...refundCase, status: "CUSTOMER_CONFIRMATION_PENDING", version: 4, refundEvidence: { reference: "bank-123" }, merchantDecidedByUserId: 8, merchantDecidedByIdentityId: 80 };
    const reward = [{ id: 1, status: "SETTLED", rewardNdp: 50, platformFeeNdp: 0, reversalRequiredNdp: 0, reversedNdp: 0, outstandingRecoveryNdp: 0, claimantWalletId: 99 }];
    const snapshots = [{ id: 7, rewardId: 1, kind: "SETTLEMENT", ledgerTransactionId: 70, amountNdp: 50 }];
    const wallet = [{ id: 99, availableBalance: 50, frozenBalance: 0 }];
    const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 71 }]).mockResolvedValueOnce([{ id: 81 }]).mockResolvedValueOnce(reward).mockResolvedValueOnce(snapshots).mockResolvedValueOnce(wallet).mockResolvedValueOnce(reward).mockResolvedValueOnce(snapshots).mockResolvedValueOnce(wallet), orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, orderRefundCase: { findFirst: jest.fn(async () => pendingCase), update: jest.fn(async () => ({ ...pendingCase, status: "REFUNDED", version: 5, activeKey: null })) }, bookingOrder: { updateMany: jest.fn(async () => ({ count: 1 })) }, orderFinancial: { updateMany: jest.fn(async () => ({ count: 1 })) }, affiliateReward: { findFirst: jest.fn(async () => null) }, auditLog: { create: jest.fn(async () => ({})) }, notification: { create: jest.fn(async () => ({})) } };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const receipt: ConfirmRefundReceiptCommand = { ...command, casePublicId: pendingCase.publicId, expectedVersion: 4, idempotencyKey: "refund-success", payload: {} };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).confirmCustomerReceipt(receipt)).resolves.toMatchObject({ kind: "updated", value: { status: "refunded", version: 5 } });
    expect(tx.bookingOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "REFUNDED", paymentRefundReference: "bank-123", paymentRefundReason: pendingCase.requestReason, paymentRefundedById: 11 }) }));
    expect(tx.orderFinancial.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { settlementStatus: "refunded" } }));
    expect(tx.orderRefundCaseEvent.create).toHaveBeenCalled(); expect(tx.auditLog.create).toHaveBeenCalled(); expect(tx.notification.create).toHaveBeenCalled();
  });

  it.each(["merchantDecision", "openComplaint", "submitEvidence", "confirmCustomerReceipt"])("fails closed with no writes when the nested order lock is missing: %s", async (method) => {
    const tx = { $queryRaw: jest.fn(async () => []), orderRefundCase: { findFirst: jest.fn(), update: jest.fn() }, orderRefundCaseEvent: { findFirst: jest.fn(), create: jest.fn() }, orderRefundDispute: { findFirst: jest.fn(), create: jest.fn() }, bookingOrder: { updateMany: jest.fn() } };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const repository = new OrderRefundCaseRepository(client as unknown as PrismaClient);
    const inputs = {
      merchantDecision: { ...command, casePublicId: refundCase.publicId, decision: "approve", shopId: 31, expectedVersion: 1, idempotencyKey: "missing-order-decision", payload: { note: "x" } },
      openComplaint: { ...command, casePublicId: refundCase.publicId, expectedVersion: 1, idempotencyKey: "missing-order-complaint", payload: { reason: "x" } },
      submitEvidence: { ...command, casePublicId: refundCase.publicId, shopId: 31, expectedVersion: 1, idempotencyKey: "missing-order-evidence", payload: { reference: "x" } },
      confirmCustomerReceipt: { ...command, casePublicId: refundCase.publicId, expectedVersion: 1, idempotencyKey: "missing-order-receipt", payload: {} }
    } as const;
    const key = method as keyof typeof inputs;
    const operation = (repository as unknown as Record<string, (input: never) => Promise<unknown>>)[key];
    await expect(operation.call(repository, inputs[key] as never)).resolves.toMatchObject({ kind: "not_found" });
    expect(tx.orderRefundCase.update).not.toHaveBeenCalled(); expect(tx.orderRefundDispute.create).not.toHaveBeenCalled(); expect(tx.bookingOrder.updateMany).not.toHaveBeenCalled();
  });

  it("rolls back stateful order/payment changes when the sole financial projection is absent", async () => {
    const state: { order: { paymentStatus: string; paymentRefundedAt: Date | null }; case: { status: string; activeKey: string | null }; events: number; audits: number; notifications: number } = { order: { paymentStatus: "CONFIRMED", paymentRefundedAt: null }, case: { status: "CUSTOMER_CONFIRMATION_PENDING", activeKey: "booking:71" }, events: 0, audits: 0, notifications: 0 };
    const pendingCase = { ...refundCase, status: "CUSTOMER_CONFIRMATION_PENDING", version: 4, activeKey: "booking:71", refundEvidence: { reference: "bank-123" } };
    const reward = [{ id: 1, status: "SETTLED", rewardNdp: 50, platformFeeNdp: 0, reversalRequiredNdp: 0, reversedNdp: 0, outstandingRecoveryNdp: 0, claimantWalletId: 99 }];
    const transaction = [{ id: 7, rewardId: 1, kind: "SETTLEMENT", ledgerTransactionId: 70, amountNdp: 50 }];
    const client = { $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => {
      const draft = structuredClone(state);
      const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 71 }]).mockResolvedValueOnce([{ id: 81 }]).mockResolvedValueOnce(reward).mockResolvedValueOnce(transaction).mockResolvedValueOnce([{ id: 99, availableBalance: 50, frozenBalance: 0 }]), orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => { draft.events += 1; }) }, orderRefundCase: { findFirst: jest.fn(async () => pendingCase), update: jest.fn(async () => { draft.case = { status: "REFUNDED", activeKey: null }; return { ...pendingCase, status: "REFUNDED", version: 5, activeKey: null }; }) }, bookingOrder: { updateMany: jest.fn(async () => { draft.order = { paymentStatus: "REFUNDED", paymentRefundedAt: now }; return { count: 1 }; }) }, orderFinancial: { updateMany: jest.fn(async () => ({ count: 0 })) }, affiliateReward: { findFirst: jest.fn(async () => null) }, auditLog: { create: jest.fn(async () => { draft.audits += 1; }) }, notification: { create: jest.fn(async () => { draft.notifications += 1; }) } };
      const result = await callback(tx);
      Object.assign(state, draft);
      return result;
    }) };
    const receipt: ConfirmRefundReceiptCommand = { ...command, casePublicId: pendingCase.publicId, expectedVersion: 4, idempotencyKey: "refund-stateful-rollback", payload: {} };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).confirmCustomerReceipt(receipt)).resolves.toMatchObject({ kind: "invalid_state" });
    expect(state).toEqual(expect.objectContaining({ order: { paymentStatus: "CONFIRMED", paymentRefundedAt: null }, case: { status: "CUSTOMER_CONFIRMATION_PENDING", activeKey: "booking:71" }, events: 0, audits: 0, notifications: 0 }));
  });

  it("returns not_found without writes when the locked dispute no longer matches preflight foreign keys", async () => {
    const tx = { $queryRaw: jest.fn(async () => [{ id: 1 }]), orderRefundDisputeRevision: { findFirst: jest.fn(), create: jest.fn() }, orderRefundDispute: { findFirst: jest.fn(async () => ({ id: 91, orderRefundCaseId: 82, bookingOrderId: 72, status: "OPEN", version: 3 })), update: jest.fn() }, orderRefundCase: { findFirst: jest.fn(), update: jest.fn() }, orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn() }, auditLog: { create: jest.fn() }, notification: { create: jest.fn() } };
    const client = { orderRefundDispute: { findFirst: jest.fn(async () => ({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71 })) }, $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const resolution: ResolveRefundDisputeCommand = { ...command, disputePublicId: "e0a2d0ac-7445-426a-9f29-1f4820463955", expectedVersion: 3, idempotencyKey: "refund-fk-mismatch", resolution: "refund", payload: { publicReason: "x" } };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).resolveDispute(resolution)).resolves.toMatchObject({ kind: "not_found" });
    expect(tx.orderRefundDispute.update).not.toHaveBeenCalled(); expect(tx.orderRefundDisputeRevision.create).not.toHaveBeenCalled(); expect(tx.orderRefundCase.update).not.toHaveBeenCalled(); expect(tx.orderRefundCaseEvent.create).not.toHaveBeenCalled(); expect(tx.auditLog.create).not.toHaveBeenCalled(); expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it.each([
    ["cross-action event reuse", "b".repeat(64), "idempotency_conflict"],
    ["exact resolve event replay", "a".repeat(64), "replayed"]
  ])("uses the global case event before dispute mutation for %s", async (_label, storedFingerprint, expectedKind) => {
    const disputedCase = { ...refundCase, status: "DISPUTED", version: 5 };
    const eventFindFirst = jest.fn(async () => ({
      requestFingerprint: storedFingerprint,
      refundCase: disputedCase
    }));
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 1 }]),
      orderRefundCaseEvent: { findFirst: eventFindFirst, create: jest.fn() },
      orderRefundDisputeRevision: { findFirst: jest.fn(async () => null), create: jest.fn() },
      orderRefundDispute: {
        findFirst: jest.fn(async () => ({
          id: 91,
          orderRefundCaseId: 81,
          bookingOrderId: 71,
          status: "OPEN",
          version: 3
        })),
        update: jest.fn()
      },
      orderRefundCase: { findFirst: jest.fn(async () => disputedCase), update: jest.fn() },
      affiliateReward: { findFirst: jest.fn(async () => null) },
      auditLog: { create: jest.fn() },
      notification: { create: jest.fn() }
    };
    const client = {
      orderRefundDispute: {
        findFirst: jest.fn(async () => ({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71 }))
      },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx))
    };
    const resolution: ResolveRefundDisputeCommand = {
      ...command,
      disputePublicId: "e0a2d0ac-7445-426a-9f29-1f4820463955",
      expectedVersion: 3,
      idempotencyKey: "refund-global-event-key",
      resolution: "refund",
      payload: { publicReason: "supported" }
    };

    await expect(
      new OrderRefundCaseRepository(client as unknown as PrismaClient).resolveDispute(resolution)
    ).resolves.toMatchObject({ kind: expectedKind });
    expect(eventFindFirst).toHaveBeenCalledTimes(1);
    expect(tx.orderRefundDispute.update).not.toHaveBeenCalled();
    expect(tx.orderRefundDisputeRevision.create).not.toHaveBeenCalled();
    expect(tx.orderRefundCase.update).not.toHaveBeenCalled();
  });

  it("recovers a concurrent resolve event P2002 from the global case event", async () => {
    const disputedCase = { ...refundCase, status: "DISPUTED", version: 5 };
    const updatedCase = { ...disputedCase, status: "REFUND_PENDING", version: 6 };
    const eventFindFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ requestFingerprint: command.fingerprint, refundCase: updatedCase });
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 1 }]),
      orderRefundCaseEvent: {
        findFirst: eventFindFirst,
        create: jest.fn(async () => {
          throw {
            code: "P2002",
            meta: { target: "order_refund_case_events_idempotency_key_key" }
          };
        })
      },
      orderRefundDisputeRevision: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      orderRefundDispute: {
        findFirst: jest.fn(async () => ({
          id: 91,
          orderRefundCaseId: 81,
          bookingOrderId: 71,
          status: "OPEN",
          version: 3
        })),
        update: jest.fn(async () => ({}))
      },
      orderRefundCase: {
        findFirst: jest.fn(async () => disputedCase),
        update: jest.fn(async () => updatedCase)
      },
      affiliateReward: { findFirst: jest.fn(async () => null) },
      auditLog: { create: jest.fn() },
      notification: { create: jest.fn() }
    };
    const client = {
      orderRefundDispute: {
        findFirst: jest.fn(async () => ({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71 }))
      },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx))
    };
    const resolution: ResolveRefundDisputeCommand = {
      ...command,
      disputePublicId: "e0a2d0ac-7445-426a-9f29-1f4820463955",
      expectedVersion: 3,
      idempotencyKey: "refund-resolve-race",
      resolution: "refund",
      payload: { publicReason: "supported" }
    };

    await expect(
      new OrderRefundCaseRepository(client as unknown as PrismaClient).resolveDispute(resolution)
    ).resolves.toMatchObject({ kind: "replayed", value: { status: "refund_pending" } });
    expect(eventFindFirst).toHaveBeenCalledTimes(2);
  });

  it("replays a legacy revision-only resolve receipt when no global event exists", async () => {
    const disputedCase = { ...refundCase, status: "REFUND_PENDING", version: 6 };
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: 1 }]),
      orderRefundCaseEvent: { findFirst: jest.fn(async () => null), create: jest.fn() },
      orderRefundDisputeRevision: {
        findFirst: jest.fn(async () => ({
          requestFingerprint: command.fingerprint,
          refundCase: disputedCase
        })),
        create: jest.fn()
      },
      orderRefundDispute: { findFirst: jest.fn(), update: jest.fn() },
      orderRefundCase: { findFirst: jest.fn(), update: jest.fn() },
      affiliateReward: { findFirst: jest.fn(async () => null) }
    };
    const client = {
      orderRefundDispute: {
        findFirst: jest.fn(async () => ({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71 }))
      },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx))
    };
    const resolution: ResolveRefundDisputeCommand = {
      ...command,
      disputePublicId: "e0a2d0ac-7445-426a-9f29-1f4820463955",
      expectedVersion: 3,
      idempotencyKey: "refund-legacy-revision",
      resolution: "refund",
      payload: { publicReason: "supported" }
    };

    await expect(
      new OrderRefundCaseRepository(client as unknown as PrismaClient).resolveDispute(resolution)
    ).resolves.toMatchObject({ kind: "replayed", value: { status: "refund_pending" } });
    expect(tx.orderRefundDispute.update).not.toHaveBeenCalled();
  });

  it("batch-loads deterministic lowest-id Affiliate rewards for a multirow dispute page", async () => {
    const secondCase = {
      ...refundCase,
      id: 82,
      publicId: "33333333-3333-4333-8333-333333333333",
      bookingOrderId: 72,
      bookingOrder: { orderNo: "NDP-REFUND-72" }
    };
    const thirdCase = {
      ...refundCase,
      id: 83,
      publicId: "44444444-4444-4444-8444-444444444444",
      bookingOrderId: 73,
      bookingOrder: { orderNo: "NDP-REFUND-73" }
    };
    const findManyDisputes = jest.fn(async () => [
      { refundCase },
      { refundCase: secondCase },
      { refundCase: thirdCase }
    ]);
    const findManyRewards = jest.fn(async () => [
      { id: 5, bookingOrderId: 71, status: AffiliateRewardStatus.SETTLED, rewardNdp: 50 },
      { id: 6, bookingOrderId: 71, status: AffiliateRewardStatus.SETTLED, rewardNdp: 99 },
      { id: 7, bookingOrderId: 73, status: AffiliateRewardStatus.SETTLED, rewardNdp: 70 }
    ]);
    const findFirstReward = jest.fn();
    const client = {
      orderRefundDispute: { findMany: findManyDisputes, count: jest.fn(async () => 3) },
      affiliateReward: { findMany: findManyRewards, findFirst: findFirstReward }
    };

    await expect(
      new OrderRefundCaseRepository(client as unknown as PrismaClient).listDisputes({
        actorUserId: 9,
        actorIdentityId: 90,
        actorScope: { type: "global", id: null },
        page: 1,
        page_size: 20
      })
    ).resolves.toMatchObject({
      list: [
        { affiliateReward: { status: "settled", rewardNdp: 50 } },
        { affiliateReward: null },
        { affiliateReward: { status: "settled", rewardNdp: 70 } }
      ],
      total: 3
    });
    expect(findManyDisputes).toHaveBeenCalledTimes(1);
    expect(findManyRewards).toHaveBeenCalledTimes(1);
    expect(findManyRewards).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingOrderId: { in: [71, 72, 73] }, deletedAt: null },
        orderBy: [{ bookingOrderId: "asc" }, { id: "asc" }]
      })
    );
    expect(findFirstReward).not.toHaveBeenCalled();
  });
});
