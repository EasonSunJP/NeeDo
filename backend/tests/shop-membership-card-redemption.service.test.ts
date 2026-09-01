import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  ShopMembershipCardRedemptionService,
  type ShopMembershipCardRedemptionCandidateContext,
  type ShopMembershipCardRedemptionRecord,
  type ShopMembershipCardRedemptionRepositoryPort
} from "../src/services/shop-membership-card-redemption.service";

const now = new Date("2026-09-01T00:00:00.000Z");
const cardPublicId = "00000000-0000-4000-8000-000000000801";
const redemptionPublicId = "00000000-0000-4000-8000-000000000802";
const requestContext = { ip: "127.0.0.1", userAgent: "jest" };

const actor = (overrides: Partial<AuthenticatedAccessContext> = {}): AuthenticatedAccessContext => ({
  userId: 9,
  email: "staff@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  currentIdentityType: "merchant_staff",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 71,
  roles: ["merchant_staff"],
  permissions: ["shop.member.card.redeem"],
  ...overrides
});

const scope = {
  servicePublicIds: [],
  categoryCodes: [],
  excludedServicePublicIds: [],
  excludedCategoryCodes: [],
  activeFrom: null,
  activeTo: null
};

const candidate = (): ShopMembershipCardRedemptionCandidateContext => ({
  bookingOrderId: 181,
  orderNo: "B202609010001",
  serviceName: "护理服务",
  servicePublicId: null,
  serviceCategoryCode: "body-care",
  serviceStartedAt: now,
  serviceCompletedAt: now,
  eligibleAmountJpy: 10_000,
  consumedPrincipalJpy: 10_000,
  consumedUses: 0,
  principalBalanceBeforeJpy: 20_000,
  principalBalanceAfterJpy: 10_000,
  remainingUsesBefore: null,
  remainingUsesAfter: null,
  cardLockVersionBefore: 2,
  rules: [{ kind: "fixed_per_completion", rewardNdp: 1_000, scope }],
  caps: {},
  platformFeeRateBps: 1_000,
  facts: {
    eligibleAmountJpy: 10_000,
    servicePublicId: null,
    categoryCode: "body-care",
    occurredAt: now.toISOString(),
    completedCountBefore: 0,
    lifetimeEligibleSpendJpyBefore: 0,
    isFirstCardUse: true,
    customerBirthMonth: null,
    birthdayRewardsThisYear: 0,
    consecutiveEligibleMonths: 0,
    rewardedConsecutiveMonthMilestones: [],
    alreadyRewardedTodayNdp: 0,
    alreadyRewardedMonthNdp: 0,
    alreadyRewardedLifetimeNdp: 0
  }
});

const record = (overrides: Partial<ShopMembershipCardRedemptionRecord> = {}): ShopMembershipCardRedemptionRecord => ({
  internalId: 191,
  publicId: redemptionPublicId,
  requestFingerprint: "fingerprint",
  status: "applied",
  rewardStatus: "paid",
  rewardFacts: candidate().facts,
  rewardHits: [{ ruleIndex: 0, kind: "fixed_per_completion", basis: { rewardNdp: 1_000 }, rewardNdp: 1_000 }],
  rawRewardNdp: 1_000,
  customerRewardNdp: 1_000,
  platformFeeRateBps: 1_000,
  platformFeeNdp: 100,
  totalShopDebitNdp: 1_100,
  rewardCapped: false,
  outstandingRewardNdp: 0,
  consumedPrincipalJpy: 10_000,
  consumedUses: 0,
  principalBalanceBeforeJpy: 20_000,
  principalBalanceAfterJpy: 10_000,
  remainingUsesBefore: null,
  remainingUsesAfter: null,
  redeemedAt: now,
  rewardSettledAt: now,
  refundedAt: null,
  createdAt: now,
  updatedAt: now,
  card: {
    publicId: cardPublicId,
    cardNo: "NMC-00112233445566778899AABB",
    name: "青山储值会员卡",
    type: "stored_value",
    status: "active",
    principalBalanceJpy: 10_000,
    bonusBalanceJpy: 3_000,
    remainingUses: null,
    lockVersion: 3
  },
  order: {
    orderNo: "B202609010001",
    serviceName: "护理服务",
    servicePublicId: null,
    serviceCategoryCode: "body-care",
    serviceStartedAt: now,
    serviceCompletedAt: now,
    eligibleAmountJpy: 10_000
  },
  shop: { shopNo: "s000000071", name: "青山护理店" },
  customer: { userId: 41, needoId: "u0000000041", displayName: "王小美" },
  redeemedBy: { needoId: "u0000000009", displayName: "店员" },
  ledgerTransactionNo: "LT-001",
  ...overrides
});

const repository = (overrides: Partial<ShopMembershipCardRedemptionRepositoryPort> = {}) => ({
  findByIdempotencyKey: jest.fn(async () => null),
  listCandidates: jest.fn(async () => ({ list: [candidate()], total: 1, page: 1, page_size: 20 })),
  createWithEvaluationAndSettlement: jest.fn(async (input, evaluate, settle) => {
    const context = candidate();
    const reward = evaluate(context);
    const settlement = await settle({
      redemptionId: 191,
      shopId: input.shopId,
      customerUserId: 41,
      customerRewardNdp: reward.customerRewardNdp,
      platformFeeNdp: reward.platformFeeNdp,
      platformFeeRateBps: reward.platformFeeRateBps,
      idempotencyKey: "membership-redemption:191:reward:settlement",
      actorUserId: input.actorId
    }, { transaction: true });
    return {
      kind: "created" as const,
      value: record({
        requestFingerprint: input.requestFingerprint,
        rewardStatus: settlement ? "paid" : "pending_funds",
        outstandingRewardNdp: settlement ? 0 : reward.totalShopDebitNdp,
        rewardSettledAt: settlement ? now : null,
        ledgerTransactionNo: settlement?.transaction.transactionNo ?? null
      })
    };
  }),
  listMerchant: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
  listCustomer: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
  ...overrides
}) as jest.Mocked<ShopMembershipCardRedemptionRepositoryPort>;

const settlement = {
  settleShopMembershipReward: jest.fn(async () => ({
    transaction: {
      id: 201,
      transactionNo: "LT-001",
      idempotencyKey: "membership-redemption:191:reward:settlement",
      type: "shop_membership_reward_settlement" as const,
      status: "applied" as const,
      referenceType: "shop_membership_card_redemption",
      referenceId: 191,
      actorUserId: 9,
      amount: 1_100,
      currency: "NDP" as const,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      entries: []
    },
    shopWalletId: 301,
    customerWalletId: 302,
    platformWalletId: 303
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

describe("ShopMembershipCardRedemptionService", () => {
  it("evaluates the immutable plan and settles the exact reward while consuming principal only", async () => {
    const repo = repository();
    const service = new ShopMembershipCardRedemptionService(repo, settlement, audit);

    await expect(service.create(actor(), requestContext, cardPublicId, {
      orderNo: " B202609010001 ",
      idempotencyKey: "redemption-service-001"
    })).resolves.toMatchObject({
      publicId: redemptionPublicId,
      consumedPrincipalJpy: 10_000,
      consumedUses: 0,
      customerRewardNdp: 1_000,
      platformFeeNdp: 100,
      totalShopDebitNdp: 1_100,
      rewardStatus: "paid",
      replayed: false,
      card: { cardNoMasked: "NMC-********************AABB", bonusBalanceJpy: 3_000 }
    });
    expect(settlement.settleShopMembershipReward).toHaveBeenCalledWith(
      expect.objectContaining({ customerRewardNdp: 1_000, platformFeeNdp: 100, platformFeeRateBps: 1_000 }),
      expect.objectContaining({ transactionClient: { transaction: true } })
    );
    expect(repo.createWithEvaluationAndSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 71,
        actorId: 9,
        cardPublicId,
        orderNo: "B202609010001",
        audit: expect.objectContaining({ action: "merchant.shop_membership_card.redemption.create" })
      }),
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("previews candidates using the same rule evaluator as the write path", async () => {
    const service = new ShopMembershipCardRedemptionService(repository(), settlement, audit);
    await expect(service.listCandidates(actor(), cardPublicId, { page: 1, pageSize: 20 }))
      .resolves.toMatchObject({
        list: [{
          orderNo: "B202609010001",
          consumption: { principalJpy: 10_000, uses: 0 },
          reward: { customerRewardNdp: 1_000, platformFeeNdp: 100, totalShopDebitNdp: 1_100 }
        }],
        total: 1
      });
  });

  it("replays only an identical normalized request and rejects invalid input before mutation", async () => {
    const firstRepo = repository();
    const firstService = new ShopMembershipCardRedemptionService(firstRepo, settlement, audit);
    const input = { orderNo: "B202609010001", idempotencyKey: "redemption-service-002" };
    await firstService.create(actor(), requestContext, cardPublicId, input);
    const fingerprint = firstRepo.createWithEvaluationAndSettlement.mock.calls[0][0].requestFingerprint;
    const replayRepo = repository({ findByIdempotencyKey: jest.fn(async () => record({ requestFingerprint: fingerprint })) });
    await expect(new ShopMembershipCardRedemptionService(replayRepo, settlement, audit)
      .create(actor(), requestContext, cardPublicId, input))
      .resolves.toMatchObject({ replayed: true });

    const conflictRepo = repository({ findByIdempotencyKey: jest.fn(async () => record({ requestFingerprint: "different" })) });
    await expect(new ShopMembershipCardRedemptionService(conflictRepo, settlement, audit)
      .create(actor(), requestContext, cardPublicId, input))
      .rejects.toMatchObject({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_IDEMPOTENCY_CONFLICT });

    const invalidRepo = repository();
    await expect(new ShopMembershipCardRedemptionService(invalidRepo, settlement, audit)
      .create(actor(), requestContext, cardPublicId, { orderNo: "", idempotencyKey: "short" }))
      .rejects.toMatchObject({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_REDEMPTION_INVALID_VALUE });
    expect(invalidRepo.findByIdempotencyKey).not.toHaveBeenCalled();
  });
});
