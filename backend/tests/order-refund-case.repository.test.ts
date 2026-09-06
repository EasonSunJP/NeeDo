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

    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).confirmCustomerReceipt(receiptCommand)).rejects.toThrow("error.order_refund.affiliate_invariant_failed");
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
    const client = { orderRefundDispute: { findMany, count }, affiliateReward: { findFirst: jest.fn(async () => null) } };
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
    const tx = { $queryRaw: jest.fn(async () => [{ id: 1 }]), orderRefundDisputeRevision: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) }, orderRefundDispute: { findFirst: jest.fn().mockResolvedValueOnce({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71, status: "OPEN", version: 3 }).mockResolvedValueOnce({ id: 91, orderRefundCaseId: 81, bookingOrderId: 71, status: "OPEN", version: 3 }), update: jest.fn(async () => ({})) }, orderRefundCase: { findFirst: jest.fn(async () => disputedCase), update: jest.fn(async () => ({ ...disputedCase, status: "DISPUTE_REJECTED", version: 6 })) }, orderRefundCaseEvent: { create: jest.fn(async () => ({})) }, affiliateReward: { findFirst: jest.fn(async () => null) }, auditLog: { create: jest.fn(async () => ({})) }, notification: { create: jest.fn(async () => ({})) } };
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
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).confirmCustomerReceipt(receipt)).rejects.toThrow("error.order_refund.affiliate_invariant_failed");
    expect(tx.orderRefundCaseEvent.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([["deleted case"], ["order-case mismatch"]])("hides %s nested targets", async () => {
    const tx = { $queryRaw: jest.fn(async () => []), orderRefundCase: { findFirst: jest.fn(async () => refundCase) } };
    const client = { $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    await expect(new OrderRefundCaseRepository(client as unknown as PrismaClient).merchantDecision({ ...command, casePublicId: refundCase.publicId, decision: "approve", shopId: 31, expectedVersion: 1, idempotencyKey: `refund-hidden-${Math.random()}`, payload: { note: "x" } })).resolves.toMatchObject({ kind: "not_found" });
    expect(tx.orderRefundCase.findFirst).not.toHaveBeenCalled();
  });
});
