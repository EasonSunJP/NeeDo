import {
  evaluateMembershipRewardRules,
  membershipRewardRuleListSchema,
  membershipRewardRuleSchema,
  type MembershipRewardPreviewFacts
} from "../src/domain/shop-membership-reward-rule";

const serviceId = "00000000-0000-4000-8000-000000000101";
const categoryId = "00000000-0000-4000-8000-000000000201";

const baseFacts: MembershipRewardPreviewFacts = {
  eligibleAmountJpy: 10_000,
  servicePublicId: serviceId,
  categoryPublicId: categoryId,
  occurredAt: "2026-08-31T03:00:00.000Z",
  completedCountBefore: 0,
  lifetimeEligibleSpendJpyBefore: 0,
  isFirstCardUse: true,
  customerBirthMonth: 8,
  birthdayRewardsThisYear: 0,
  consecutiveEligibleMonths: 3,
  rewardedConsecutiveMonthMilestones: [],
  alreadyRewardedTodayNdp: 0,
  alreadyRewardedMonthNdp: 0,
  alreadyRewardedLifetimeNdp: 0
};

const allScope = {
  servicePublicIds: [],
  categoryPublicIds: [],
  excludedServicePublicIds: [],
  excludedCategoryPublicIds: [],
  activeFrom: null,
  activeTo: null
};

describe("membership NDP reward rules", () => {
  it("calculates the customer reward, ceil platform fee, and total shop cost", () => {
    const result = evaluateMembershipRewardRules({
      rules: [{ kind: "fixed_per_completion", rewardNdp: 1000, scope: allScope }],
      caps: { perOrderNdp: null, perDayNdp: null, perMonthNdp: null, lifetimeNdp: null },
      facts: baseFacts,
      platformFeeRateBps: 1000
    });

    expect(result).toMatchObject({
      rawCustomerRewardNdp: 1000,
      customerRewardNdp: 1000,
      platformFeeNdp: 100,
      totalShopDebitNdp: 1100,
      capped: false
    });
    expect(result.hits).toEqual([
      expect.objectContaining({ kind: "fixed_per_completion", rewardNdp: 1000 })
    ]);
  });

  it("supports percentage and spend-block base formulas with integer floor", () => {
    const percentage = evaluateMembershipRewardRules({
      rules: [{ kind: "percent_of_eligible_amount", rewardRateBps: 333, scope: allScope }],
      caps: {},
      facts: { ...baseFacts, eligibleAmountJpy: 999 },
      platformFeeRateBps: 1000
    });
    const blocks = evaluateMembershipRewardRules({
      rules: [{ kind: "spend_block", blockAmountJpy: 300, rewardNdpPerBlock: 17, scope: allScope }],
      caps: {},
      facts: { ...baseFacts, eligibleAmountJpy: 999 },
      platformFeeRateBps: 1000
    });

    expect(percentage.customerRewardNdp).toBe(33);
    expect(percentage.platformFeeNdp).toBe(4);
    expect(blocks.customerRewardNdp).toBe(51);
  });

  it("evaluates every approved bonus kind and only once where history says it was used", () => {
    const result = evaluateMembershipRewardRules({
      rules: [
        { kind: "fixed_per_completion", rewardNdp: 100, scope: allScope },
        { kind: "first_card_use_bonus", rewardNdp: 10, scope: allScope },
        { kind: "service_scope_bonus", rewardNdp: 20, rewardRateBps: null, scope: { ...allScope, servicePublicIds: [serviceId] } },
        { kind: "completion_milestone_bonus", everyCompletions: 1, rewardNdp: 30, repeat: false, scope: allScope },
        { kind: "spend_milestone_bonus", thresholdJpy: 10_000, rewardNdp: 40, repeat: false, scope: allScope },
        { kind: "birthday_month_bonus", rewardNdp: 50, annualLimit: 1, scope: allScope },
        { kind: "schedule_window_bonus", rewardNdp: 60, timezone: "Asia/Tokyo", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "23:59", scope: allScope },
        { kind: "consecutive_month_bonus", consecutiveMonths: 3, rewardNdp: 70, scope: allScope }
      ],
      caps: {},
      facts: baseFacts,
      platformFeeRateBps: 1000
    });

    expect(result.hits.map((hit) => hit.kind)).toEqual([
      "fixed_per_completion",
      "first_card_use_bonus",
      "service_scope_bonus",
      "completion_milestone_bonus",
      "spend_milestone_bonus",
      "birthday_month_bonus",
      "schedule_window_bonus",
      "consecutive_month_bonus"
    ]);
    expect(result.customerRewardNdp).toBe(380);

    const repeated = evaluateMembershipRewardRules({
      rules: [
        { kind: "fixed_per_completion", rewardNdp: 100, scope: allScope },
        { kind: "first_card_use_bonus", rewardNdp: 10, scope: allScope },
        { kind: "consecutive_month_bonus", consecutiveMonths: 3, rewardNdp: 70, scope: allScope }
      ],
      caps: {},
      facts: {
        ...baseFacts,
        completedCountBefore: 4,
        isFirstCardUse: false,
        rewardedConsecutiveMonthMilestones: [3]
      },
      platformFeeRateBps: 1000
    });
    expect(repeated.hits.map((hit) => hit.kind)).toEqual(["fixed_per_completion"]);
  });

  it("applies exclusions before inclusions and returns no fee for zero reward", () => {
    const result = evaluateMembershipRewardRules({
      rules: [{
        kind: "fixed_per_completion",
        rewardNdp: 1000,
        scope: {
          ...allScope,
          servicePublicIds: [serviceId],
          excludedCategoryPublicIds: [categoryId]
        }
      }],
      caps: {},
      facts: baseFacts,
      platformFeeRateBps: 1000
    });

    expect(result).toMatchObject({
      rawCustomerRewardNdp: 0,
      customerRewardNdp: 0,
      platformFeeNdp: 0,
      totalShopDebitNdp: 0,
      hits: []
    });
  });

  it("applies the smallest remaining cap and clips ordered hit amounts", () => {
    const result = evaluateMembershipRewardRules({
      rules: [
        { kind: "fixed_per_completion", rewardNdp: 100, scope: allScope },
        { kind: "first_card_use_bonus", rewardNdp: 80, scope: allScope }
      ],
      caps: { perOrderNdp: 150, perDayNdp: 200, perMonthNdp: 1000, lifetimeNdp: 10_000 },
      facts: { ...baseFacts, alreadyRewardedTodayNdp: 25 },
      platformFeeRateBps: 1000
    });

    expect(result.rawCustomerRewardNdp).toBe(180);
    expect(result.customerRewardNdp).toBe(150);
    expect(result.hits.map((hit) => hit.rewardNdp)).toEqual([100, 50]);
    expect(result.capped).toBe(true);
  });

  it("rejects missing or multiple base rules and every non-NDP reward field", () => {
    expect(() => membershipRewardRuleListSchema.parse([
      { kind: "first_card_use_bonus", rewardNdp: 100, scope: allScope }
    ])).toThrow();
    expect(() => membershipRewardRuleListSchema.parse([
      { kind: "fixed_per_completion", rewardNdp: 100, scope: allScope },
      { kind: "spend_block", blockAmountJpy: 100, rewardNdpPerBlock: 1, scope: allScope }
    ])).toThrow();
    expect(() => membershipRewardRuleSchema.parse({
      kind: "completion_milestone_bonus",
      everyCompletions: 5,
      rewardNdp: 100,
      repeat: true,
      gift: "free_service",
      scope: allScope
    })).toThrow();
    expect(() => membershipRewardRuleSchema.parse({
      kind: "fixed_per_completion",
      rewardNdp: Number.MAX_SAFE_INTEGER + 1,
      scope: allScope
    })).toThrow();
  });
});
