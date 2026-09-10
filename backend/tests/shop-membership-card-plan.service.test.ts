import { ERROR_CODES } from "../src/constants/error-codes";
import type { ShopMembershipCardPlanRepositoryPort } from "../src/repositories/shop-membership-card-plan.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { ShopMembershipCardPlanService } from "../src/services/shop-membership-card-plan.service";

const now = new Date("2026-08-31T03:00:00.000Z");
const planPublicId = "00000000-0000-4000-8000-000000000301";
const servicePublicId = "00000000-0000-4000-8000-000000000101";
const scope = {
  servicePublicIds: [servicePublicId],
  categoryCodes: ["body-care"],
  excludedServicePublicIds: [],
  excludedCategoryCodes: [],
  activeFrom: null,
  activeTo: null
};
const draftInput = {
  expectedLockVersion: 2,
  name: "青山 NDP 会员卡",
  description: null,
  cardType: "benefit" as const,
  validity: { mode: "never" as const },
  issuance: {
    minInitialPrincipalJpy: null,
    maxInitialPrincipalJpy: null,
    minInitialUses: null,
    maxInitialUses: null
  },
  caps: { perOrderNdp: null, perDayNdp: null, perMonthNdp: null, lifetimeNdp: null },
  rules: [{ kind: "fixed_per_completion" as const, rewardNdp: 1000, scope }]
};

const owner = (
  overrides: Partial<AuthenticatedAccessContext> = {}
): AuthenticatedAccessContext => ({
  userId: 9,
  email: "owner@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 71,
  roles: ["merchant_owner"],
  permissions: [
    "shop.member.card_plan.view",
    "shop.member.card_plan.manage",
    "shop.member.card_plan.publish"
  ],
  ...overrides
});

const version = {
  internalId: 41,
  publicId: "00000000-0000-4000-8000-000000000302",
  version: 1,
  status: "draft" as const,
  lockVersion: 2,
  name: draftInput.name,
  description: null,
  cardType: "benefit" as const,
  validity: { mode: "never" as const },
  issuance: draftInput.issuance,
  caps: draftInput.caps,
  platformFeePolicyPublicId: null,
  platformFeeRateBps: null,
  publishedAt: null,
  rules: draftInput.rules.map((rule, index) => ({
    publicId: `rule-${index}`,
    ruleGroup: "base" as const,
    sortOrder: index,
    ...rule
  }))
};
const plan = {
  internalId: 31,
  publicId: planPublicId,
  status: "draft" as const,
  currentVersion: null,
  draftVersion: version,
  createdAt: now,
  updatedAt: now
};

function repository(overrides: Partial<jest.Mocked<ShopMembershipCardPlanRepositoryPort>> = {}) {
  return {
    listPlans: jest.fn(async () => ({ list: [plan], total: 1, page: 1, page_size: 20 })),
    findPlan: jest.fn(async () => plan),
    createPlanWithDraft: jest.fn(async () => plan),
    updateDraftWithAudit: jest.fn(async () => ({ kind: "updated" as const, value: plan })),
    publishDraftWithAudit: jest.fn(async () => ({
      kind: "published" as const,
      value: {
        ...plan,
        status: "active" as const,
        currentVersion: {
          ...version,
          status: "published" as const,
          platformFeePolicyPublicId: "fee-1",
          platformFeeRateBps: 1000
        },
        draftVersion: null
      }
    })),
    retirePlanWithAudit: jest.fn(async () => ({
      kind: "retired" as const,
      value: { ...plan, status: "retired" as const }
    })),
    validateShopRuleReferences: jest.fn(async () => true),
    getEffectiveFeePolicy: jest.fn(async () => ({
      publicId: "fee-1",
      version: 1,
      feeRateBps: 1000,
      effectiveFrom: now,
      effectiveTo: null,
      reason: "initial",
      createdByNeedoId: null,
      createdAt: now
    })),
    listFeePolicies: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    getFeePolicySummary: jest.fn(async () => ({
      evaluatedAt: now,
      current: null,
      nextScheduled: null,
      latestVersion: 1
    })),
    createFeePolicyVersionWithAudit: jest.fn(),
    ...overrides
  } as jest.Mocked<ShopMembershipCardPlanRepositoryPort>;
}

const audit = {
  createInput: jest.fn((input) => ({
    actorId: input.actor.userId,
    action: input.action,
    targetType: input.targetType,
    metadata: input.metadata
  }))
};

describe("ShopMembershipCardPlanService", () => {
  it("rejects non-shop identities before repository access", async () => {
    const repo = repository();
    const service = new ShopMembershipCardPlanService(repo, audit, () => now);

    await expect(
      service.listPlans(
        owner({ currentIdentityScopeType: "global", currentIdentityScopeId: null }),
        { page: 1, pageSize: 20 }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(repo.listPlans).not.toHaveBeenCalled();
  });

  it("rejects card-type fields that could silently add amount or uses", async () => {
    const repo = repository();
    const service = new ShopMembershipCardPlanService(repo, audit, () => now);

    await expect(
      service.updateDraft(owner(), { ip: "127.0.0.1" }, planPublicId, {
        ...draftInput,
        issuance: { ...draftInput.issuance, minInitialUses: 1, maxInitialUses: 10 }
      })
    ).rejects.toMatchObject({
      message: "error.shop_membership_card_plan.invalid_card_fields",
      statusCode: 400
    });
    expect(repo.updateDraftWithAudit).not.toHaveBeenCalled();
  });

  it("validates service and category references inside the current shop before saving", async () => {
    const repo = repository({
      validateShopRuleReferences: jest.fn(async (...args: [number, string[], string[]]) => {
        void args;
        return false;
      })
    });
    const service = new ShopMembershipCardPlanService(repo, audit, () => now);

    await expect(
      service.updateDraft(owner(), { ip: "127.0.0.1" }, planPublicId, draftInput)
    ).rejects.toMatchObject({
      message: "error.shop_membership_card_plan.rule_reference_not_found",
      statusCode: 404
    });
    expect(repo.validateShopRuleReferences).toHaveBeenCalledWith(
      71,
      [servicePublicId],
      ["body-care"]
    );
    expect(repo.updateDraftWithAudit).not.toHaveBeenCalled();
  });

  it("previews customer NDP and the extra platform fee without wallet mutation", async () => {
    const repo = repository();
    const service = new ShopMembershipCardPlanService(repo, audit, () => now);

    await expect(
      service.previewPlan(owner(), planPublicId, {
        eligibleAmountJpy: 10_000,
        servicePublicId,
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
      })
    ).resolves.toMatchObject({
      customerRewardNdp: 1000,
      platformFeeNdp: 100,
      totalShopDebitNdp: 1100
    });
    expect(repo.getEffectiveFeePolicy).toHaveBeenCalledWith(now);
  });

  it("publishes with the expected lock and safe audit metadata", async () => {
    const repo = repository();
    const service = new ShopMembershipCardPlanService(repo, audit, () => now);

    await expect(
      service.publishPlan(owner(), { ip: "127.0.0.1" }, planPublicId, { expectedLockVersion: 2 })
    ).resolves.toMatchObject({ currentVersion: { status: "published", platformFeeRateBps: 1000 } });
    expect(repo.publishDraftWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 9,
        shopId: 71,
        planPublicId,
        expectedLockVersion: 2,
        audit: expect.objectContaining({
          action: "merchant.shop_membership_card_plan.publish",
          metadata: { planPublicId, expectedLockVersion: 2 }
        })
      })
    );
  });
});
