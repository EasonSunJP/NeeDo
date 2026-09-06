import { AffiliateRewardStatus, BookingOrderStatus, ServicePaymentStatus, type PrismaClient } from "@prisma/client";
import { OrderRefundCaseRepository } from "../src/repositories/order-refund-case.repository";
import type { ConfirmRefundReceiptCommand, MerchantRefundDecisionCommand, RequestRefundCommand } from "../src/services/order-refund-case.service";

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
});
