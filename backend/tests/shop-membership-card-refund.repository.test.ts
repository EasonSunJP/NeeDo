import type { PrismaClient } from "@prisma/client";
import { ShopMembershipCardRefundRepository } from "../src/repositories/shop-membership-card-refund.repository";

const now = new Date("2026-09-01T00:00:00.000Z");
const input = {
  actorId: 9,
  shopId: 71,
  redemptionPublicId: "00000000-0000-4000-8000-000000000802",
  reason: "订单退款",
  idempotencyKey: "membership-refund-repository-001",
  requestFingerprint: "fingerprint",
  audit: {
    actorId: 9,
    action: "merchant.shop_membership_card.redemption.refund",
    targetType: "ShopMembershipCardRedemptionRefund",
    ip: "127.0.0.1",
    metadata: {}
  }
};

describe("ShopMembershipCardRefundRepository", () => {
  it("requires formal booking payment refund evidence before card or ledger mutation", async () => {
    const candidate = { id: 191, cardId: 81, bookingOrderId: 181 };
    const redemption = {
      ...candidate,
      publicId: input.redemptionPublicId,
      shopId: 71,
      customerUserId: 41,
      status: "APPLIED",
      rewardStatus: "PAID",
      outstandingRewardNdp: 0,
      customerRewardNdp: 1_000,
      platformFeeNdp: 100,
      totalShopDebitNdp: 1_100,
      consumedPrincipalJpy: 10_000,
      consumedUses: 0,
      shopWalletId: 301,
      customerWalletId: 302,
      platformWalletId: 303,
      card: {
        id: 81,
        publicId: "00000000-0000-4000-8000-000000000801",
        cardNo: "NMC-00112233445566778899AABB",
        name: "青山储值会员卡",
        type: "STORED_VALUE",
        status: "ACTIVE",
        principalBalanceJpy: 10_000,
        bonusBalanceJpy: 3_000,
        remainingUses: null,
        lockVersion: 3
      },
      bookingOrder: {
        orderNo: "B202609010001",
        serviceNameSnapshot: "护理服务",
        paymentStatus: "CONFIRMED",
        paymentRefundedAt: null,
        paymentRefundReference: null
      },
      refund: null
    };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 191 }])
        .mockResolvedValueOnce([{ id: 81 }])
        .mockResolvedValueOnce([{ id: 181 }])
        .mockResolvedValueOnce([{ now }]),
      shopMembershipCardRedemptionRefund: { findFirst: jest.fn().mockResolvedValue(null) },
      shopMembershipCardRedemption: {
        findFirst: jest.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(redemption)
      },
      shopMembershipCard: { updateMany: jest.fn() },
      shopMembershipCardAdjustmentRequest: { findFirst: jest.fn() }
    };
    const client = { $transaction: jest.fn(async (callback) => callback(tx)) } as unknown as PrismaClient;
    const reverse = jest.fn();

    await expect(new ShopMembershipCardRefundRepository(client)
      .refundWithReversalAuditAndNotification(input, reverse))
      .resolves.toEqual({ kind: "order_not_refunded" });
    expect(tx.shopMembershipCard.updateMany).not.toHaveBeenCalled();
    expect(tx.shopMembershipCardAdjustmentRequest.findFirst).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();
  });
});
