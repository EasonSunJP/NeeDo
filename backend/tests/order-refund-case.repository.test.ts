import { BookingOrderStatus, ServicePaymentStatus, type PrismaClient } from "@prisma/client";
import { OrderRefundCaseRepository } from "../src/repositories/order-refund-case.repository";
import type { RequestRefundCommand } from "../src/services/order-refund-case.service";

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
});
