import type { PrismaClient } from "@prisma/client";
import { ShopMembershipCardPlanRepository } from "../src/repositories/shop-membership-card-plan.repository";

const now = new Date("2026-08-31T03:00:00.000Z");
const planPublicId = "00000000-0000-4000-8000-000000000301";
const versionPublicId = "00000000-0000-4000-8000-000000000302";

const persistedRule = {
  id: 51,
  publicId: "00000000-0000-4000-8000-000000000303",
  kind: "FIXED_PER_COMPLETION",
  ruleGroup: "BASE",
  config: {
    kind: "fixed_per_completion",
    rewardNdp: 1000,
    scope: {
      servicePublicIds: [], categoryCodes: [], excludedServicePublicIds: [],
      excludedCategoryCodes: [], activeFrom: null, activeTo: null
    }
  },
  sortOrder: 0
};

const draftVersion = {
  id: 41,
  publicId: versionPublicId,
  planId: 31,
  version: 1,
  status: "DRAFT",
  draftKey: "plan:31",
  lockVersion: 2,
  name: "青山 NDP 会员卡",
  description: null,
  cardType: "BENEFIT",
  validityMode: "NEVER",
  validityDays: null,
  fixedExpiryAt: null,
  minInitialPrincipalJpy: null,
  maxInitialPrincipalJpy: null,
  minInitialUses: null,
  maxInitialUses: null,
  rewardCaps: { perOrderNdp: null, perDayNdp: null, perMonthNdp: null, lifetimeNdp: null },
  platformFeePolicyId: null,
  platformFeeRateBps: null,
  publishedAt: null,
  rules: [persistedRule]
};

const plan = {
  id: 31,
  publicId: planPublicId,
  shopId: 71,
  status: "DRAFT",
  currentVersionId: null,
  createdAt: now,
  updatedAt: now,
  currentVersion: null,
  versions: [draftVersion]
};

describe("ShopMembershipCardPlanRepository", () => {
  it("lists only non-deleted plans in the authenticated shop with bounded pagination", async () => {
    const client = {
      shopMembershipCardPlan: {
        findMany: jest.fn().mockResolvedValue([plan]),
        count: jest.fn().mockResolvedValue(1)
      }
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardPlanRepository(client);

    await expect(repository.listPlans(71, { page: 1, pageSize: 20 })).resolves.toMatchObject({
      total: 1,
      page: 1,
      page_size: 20,
      list: [{ publicId: planPublicId, draftVersion: { lockVersion: 2 } }]
    });
    expect(client.shopMembershipCardPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 71, deletedAt: null },
        skip: 0,
        take: 20
      })
    );
  });

  it("publishes the expected draft with the effective fee snapshot and one audit record", async () => {
    const feePolicy = {
      id: 11,
      publicId: "00000000-0000-4000-8000-000000000311",
      version: 1,
      feeRateBps: 1000,
      status: "ACTIVE",
      effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
      effectiveTo: null,
      activeKey: "membership_reward",
      reason: "initial",
      createdAt: now,
      updatedAt: now,
      createdBy: null,
      updatedBy: null
    };
    const transaction = {
      shopMembershipCardPlan: {
        findFirst: jest.fn().mockResolvedValue(plan),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      shopMembershipCardPlanVersion: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      membershipRewardFeePolicyVersion: {
        findFirst: jest.fn().mockResolvedValue(feePolicy)
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 91 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
      shopMembershipCardPlan: { findFirst: jest.fn().mockResolvedValue({
        ...plan,
        status: "ACTIVE",
        currentVersionId: 41,
        currentVersion: { ...draftVersion, status: "PUBLISHED", platformFeePolicyId: 11, platformFeeRateBps: 1000, publishedAt: now },
        versions: []
      }) }
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardPlanRepository(client, () => now);

    await expect(repository.publishDraftWithAudit({
      actorId: 9,
      shopId: 71,
      planPublicId,
      expectedLockVersion: 2,
      audit: { actorId: 9, action: "merchant.shop_membership_card_plan.publish", targetType: "ShopMembershipCardPlan" }
    })).resolves.toMatchObject({ kind: "published", value: { currentVersion: { platformFeeRateBps: 1000 } } });

    expect(transaction.shopMembershipCardPlanVersion.updateMany).toHaveBeenCalledWith({
      where: { id: 41, status: "DRAFT", lockVersion: 2, deletedAt: null },
      data: expect.objectContaining({
        status: "PUBLISHED",
        draftKey: null,
        platformFeePolicyId: 11,
        platformFeeRateBps: 1000,
        publishedById: 9,
        publishedAt: now,
        lockVersion: { increment: 1 }
      })
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "merchant.shop_membership_card_plan.publish",
        targetId: 31,
        metadata: expect.objectContaining({
          planPublicId,
          planVersionPublicId: versionPublicId,
          platformFeeRateBps: 1000
        })
      })
    });
  });

  it("closes the current fee interval and creates the next immutable version atomically", async () => {
    const current = {
      id: 11,
      publicId: "00000000-0000-4000-8000-000000000311",
      version: 1,
      feeRateBps: 1000,
      status: "ACTIVE",
      effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
      effectiveTo: null,
      activeKey: "membership_reward",
      reason: "initial",
      createdAt: now,
      updatedAt: now,
      createdBy: null,
      updatedBy: null
    };
    const created = { ...current, id: 12, version: 2, feeRateBps: 1200, reason: "new rate", createdBy: { needoId: "u0000000009" }, updatedBy: { needoId: "u0000000009" } };
    const transaction = {
      membershipRewardFeePolicyVersion: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(created)
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 92 }) }
    };
    const client = { $transaction: jest.fn(async (callback) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new ShopMembershipCardPlanRepository(client, () => now);

    await expect(repository.createFeePolicyVersionWithAudit({
      actorId: 9,
      feeRateBps: 1200,
      expectedVersion: 1,
      effectiveFrom: now,
      reason: "new rate",
      audit: { actorId: 9, action: "platform.membership_reward_fee.publish", targetType: "MembershipRewardFeePolicyVersion" }
    })).resolves.toMatchObject({ kind: "created", value: { version: 2, feeRateBps: 1200 } });

    expect(transaction.membershipRewardFeePolicyVersion.updateMany).toHaveBeenCalledWith({
      where: { id: 11, version: 1, deletedAt: null },
      data: { activeKey: null, effectiveTo: now, status: "SUPERSEDED", updatedById: 9 }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "platform.membership_reward_fee.publish",
        targetId: 12,
        metadata: expect.objectContaining({ previous: { feeRateBps: 1000, version: 1 }, next: { feeRateBps: 1200, version: 2 } })
      })
    });
  });
});
