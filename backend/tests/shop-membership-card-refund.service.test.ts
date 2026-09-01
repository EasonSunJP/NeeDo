import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  ShopMembershipCardRefundService,
  type ShopMembershipCardRefundRecord,
  type ShopMembershipCardRefundRepositoryPort
} from "../src/services/shop-membership-card-refund.service";

const now = new Date("2026-09-01T00:00:00.000Z");
const redemptionPublicId = "00000000-0000-4000-8000-000000000802";
const actor: AuthenticatedAccessContext = {
  userId: 9,
  email: "owner@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  currentIdentityType: "merchant_staff",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 71,
  roles: ["merchant_owner"],
  permissions: ["shop.member.card.refund"]
};
const requestContext = { ip: "127.0.0.1", userAgent: "jest" };

const record = (overrides: Partial<ShopMembershipCardRefundRecord> = {}): ShopMembershipCardRefundRecord => ({
  internalId: 301,
  publicId: "00000000-0000-4000-8000-000000000803",
  requestFingerprint: "fingerprint",
  status: "applied",
  reason: "订单已完成原路退款",
  reversalMode: "ledger_reversed",
  restoredPrincipalJpy: 10_000,
  restoredUses: 0,
  principalBalanceBeforeJpy: 10_000,
  principalBalanceAfterJpy: 20_000,
  remainingUsesBefore: null,
  remainingUsesAfter: null,
  customerRewardReversedNdp: 1_000,
  platformFeeReversedNdp: 100,
  totalShopCreditNdp: 1_100,
  customerBalanceBeforeNdp: 500,
  customerBalanceAfterNdp: -500,
  orderPaymentRefundedAt: now,
  refundedAt: now,
  createdAt: now,
  updatedAt: now,
  redemption: { publicId: redemptionPublicId, rewardStatusBefore: "paid" },
  card: {
    publicId: "00000000-0000-4000-8000-000000000801",
    cardNo: "NMC-00112233445566778899AABB",
    name: "青山储值会员卡",
    type: "stored_value",
    status: "active",
    principalBalanceJpy: 20_000,
    bonusBalanceJpy: 3_000,
    remainingUses: null
  },
  order: { orderNo: "B202609010001", serviceName: "护理服务" },
  shop: { shopNo: "s000000071", name: "青山护理店" },
  customer: { needoId: "u0000000041", displayName: "王小美" },
  refundedBy: { needoId: "u0000000009", displayName: "店主" },
  reversalLedgerTransactionNo: "LT-REV-001",
  ...overrides
});

const repository = (overrides: Partial<ShopMembershipCardRefundRepositoryPort> = {}) => ({
  findByIdempotencyKey: jest.fn(async () => null),
  refundWithReversalAuditAndNotification: jest.fn(async (input, reverse) => {
    await reverse({
      redemptionId: 191,
      shopId: input.shopId,
      customerUserId: 41,
      customerRewardNdp: 1_000,
      platformFeeNdp: 100,
      shopWalletId: 301,
      customerWalletId: 302,
      platformWalletId: 303,
      idempotencyKey: "membership-redemption:191:refund:reversal",
      actorUserId: input.actorId
    }, { transaction: true });
    return { kind: "created" as const, value: record({ requestFingerprint: input.requestFingerprint }) };
  }),
  ...overrides
}) as jest.Mocked<ShopMembershipCardRefundRepositoryPort>;

const reversal = {
  reverseShopMembershipReward: jest.fn(async () => ({
    transaction: { id: 401, transactionNo: "LT-REV-001" },
    shopWalletId: 301,
    customerWalletId: 302,
    platformWalletId: 303,
    customerBalanceBeforeNdp: 500,
    customerBalanceAfterNdp: -500
  }))
};
const audit = {
  createInput: jest.fn((input) => ({
    actorId: input.actor.userId,
    action: input.action,
    targetType: input.targetType,
    ip: input.context.ip,
    userAgent: input.context.userAgent,
    metadata: input.metadata
  }))
};

describe("ShopMembershipCardRefundService", () => {
  it("restores the immutable consumption and reverses customer reward plus platform fee exactly", async () => {
    const repo = repository();
    const service = new ShopMembershipCardRefundService(repo, reversal, audit);
    await expect(service.create(actor, requestContext, redemptionPublicId, {
      reason: " 订单已完成原路退款 ",
      idempotencyKey: "membership-refund-001"
    })).resolves.toMatchObject({
      restoredPrincipalJpy: 10_000,
      customerRewardReversedNdp: 1_000,
      platformFeeReversedNdp: 100,
      totalShopCreditNdp: 1_100,
      customerBalanceBeforeNdp: 500,
      customerBalanceAfterNdp: -500,
      card: { cardNoMasked: "NMC-********************AABB", bonusBalanceJpy: 3_000 },
      replayed: false
    });
    expect(reversal.reverseShopMembershipReward).toHaveBeenCalledWith(
      expect.objectContaining({ customerRewardNdp: 1_000, platformFeeNdp: 100 }),
      expect.objectContaining({ transactionClient: { transaction: true } })
    );
    expect(repo.refundWithReversalAuditAndNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 71,
        actorId: 9,
        reason: "订单已完成原路退款",
        audit: expect.objectContaining({ action: "merchant.shop_membership_card.redemption.refund" })
      }),
      expect.any(Function)
    );
  });

  it("replays only the same normalized request", async () => {
    const initial = repository();
    const input = { reason: "订单退款", idempotencyKey: "membership-refund-002" };
    await new ShopMembershipCardRefundService(initial, reversal, audit)
      .create(actor, requestContext, redemptionPublicId, input);
    const fingerprint = initial.refundWithReversalAuditAndNotification.mock.calls[0][0].requestFingerprint;
    const replay = repository({ findByIdempotencyKey: jest.fn(async () => record({ requestFingerprint: fingerprint })) });
    await expect(new ShopMembershipCardRefundService(replay, reversal, audit)
      .create(actor, requestContext, redemptionPublicId, input))
      .resolves.toMatchObject({ replayed: true });
    expect(replay.refundWithReversalAuditAndNotification).not.toHaveBeenCalled();

    const conflict = repository({ findByIdempotencyKey: jest.fn(async () => record({ requestFingerprint: "different" })) });
    await expect(new ShopMembershipCardRefundService(conflict, reversal, audit)
      .create(actor, requestContext, redemptionPublicId, input))
      .rejects.toMatchObject({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_IDEMPOTENCY_CONFLICT });
  });

  it.each([
    ["not_found", ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_NOT_FOUND],
    ["invalid_state", ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_INVALID_STATE],
    ["order_not_refunded", ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_ORDER_NOT_REFUNDED],
    ["pending_conflict", ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_PENDING_CONFLICT],
    ["concurrency_conflict", ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_CONCURRENCY_CONFLICT],
    ["idempotency_conflict", ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_IDEMPOTENCY_CONFLICT]
  ] as const)("maps %s to the formal error contract", async (kind, code) => {
    const repo = repository({ refundWithReversalAuditAndNotification: jest.fn(async () => ({ kind })) });
    await expect(new ShopMembershipCardRefundService(repo, reversal, audit).create(
      actor, requestContext, redemptionPublicId,
      { reason: "订单退款", idempotencyKey: `refund-${kind}` }
    )).rejects.toMatchObject({ code });
  });

  it("rejects invalid input before accessing persistence", async () => {
    const repo = repository();
    await expect(new ShopMembershipCardRefundService(repo, reversal, audit).create(
      actor, requestContext, redemptionPublicId,
      { reason: " ", idempotencyKey: "short" }
    )).rejects.toMatchObject({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_INVALID_VALUE });
    expect(repo.findByIdempotencyKey).not.toHaveBeenCalled();
  });
});
