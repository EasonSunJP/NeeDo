import type { PrismaClient } from "@prisma/client";
import { PlatformFeePolicyRepository } from "../src/repositories/platform-fee-policy.repository";

const changedAt = new Date("2026-08-29T02:00:00.000Z");
const audit = {
  actorId: 1,
  action: "backoffice.platform_fee.global_amount.update",
  targetType: "platform_fee_rule_set",
  targetId: null,
  metadata: { amountNdp: 700 }
};
const shopProjection = {
  id: 11,
  name: "Aoyama Care Studio",
  publicIdentifier: {
    publicId: "b0000000011",
    status: "ACTIVE",
    deletedAt: null
  }
};
const policyProjection = {
  id: 31,
  shopId: 11,
  feeEnabled: true,
  payerType: "SHOP",
  version: 1,
  updatedAt: changedAt,
  shop: shopProjection
};
const currentRuleSet = {
  id: 21,
  name: "Default Booking NDP Rules",
  description: "Booking finance",
  scopeType: "platform",
  familyCode: "booking_default",
  priority: 100,
  status: "active",
  version: 1,
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  effectiveTo: null,
  createdById: 1,
  updatedById: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
  rules: [
    {
      id: 101,
      ruleSetId: 21,
      feeType: "b_platform_fee",
      orderType: "booking",
      payerType: "shop",
      baseAmountNdp: 500,
      calculationMode: "fixed",
      holdStrategy: "max_possible_fee",
      pricingLockMode: "recalculate_at_complete",
      stackingMode: "sum",
      priority: 100,
      conditionJson: null,
      formulaJson: null,
      capJson: null,
      status: "active",
      effectiveFrom: null,
      effectiveTo: null,
      createdById: 1,
      updatedById: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
      tiers: [
        {
          id: 1001,
          ruleId: 101,
          tierBasis: "monthly_completed_orders",
          tierMode: "progressive",
          minValue: 0,
          maxValue: 10,
          feeAmountNdp: 500,
          adjustmentAmountNdp: null,
          adjustmentPercent: null,
          createdAt: changedAt,
          updatedAt: changedAt,
          deletedAt: null
        }
      ],
      timeWindows: [
        {
          id: 2001,
          ruleId: 101,
          timeBasis: "scheduled_start_at",
          timezone: "Asia/Tokyo",
          dayOfWeekMask: null,
          holidayCalendarId: null,
          startTime: "22:00",
          endTime: "03:00",
          crossDay: true,
          adjustmentType: "fixed_amount",
          adjustmentValueNdp: 100,
          createdAt: changedAt,
          updatedAt: changedAt,
          deletedAt: null
        }
      ]
    },
    {
      id: 102,
      ruleSetId: 21,
      feeType: "user_reward",
      orderType: "booking",
      payerType: "platform",
      baseAmountNdp: 100,
      calculationMode: "fixed",
      holdStrategy: "exact_estimate",
      pricingLockMode: "recalculate_at_complete",
      stackingMode: "sum",
      priority: 110,
      conditionJson: null,
      formulaJson: null,
      capJson: null,
      status: "active",
      effectiveFrom: null,
      effectiveTo: null,
      createdById: 1,
      updatedById: 1,
      createdAt: changedAt,
      updatedAt: changedAt,
      deletedAt: null,
      tiers: [],
      timeWindows: []
    }
  ]
};

describe("PlatformFeePolicyRepository", () => {
  it("reads the active effective-dated canonical Booking fee", async () => {
    const findFirst = jest.fn().mockResolvedValue(currentRuleSet);
    const client = { platformFeeRuleSet: { findFirst } } as unknown as PrismaClient;
    const repository = new PlatformFeePolicyRepository(client);

    await expect(repository.findGlobalBookingFee(changedAt)).resolves.toEqual({
      amountNdp: 500,
      version: 1,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      source: "persisted"
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyCode: "booking_default",
          status: "active",
          deletedAt: null,
          effectiveFrom: { lte: changedAt }
        })
      })
    );
  });

  it("closes and clones the full family while changing only the Booking fee", async () => {
    const tx = createGlobalTransaction();
    const client = {
      $transaction: jest.fn(async (callback) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new PlatformFeePolicyRepository(client);

    await expect(
      repository.updateGlobalAmount({
        amountNdp: 700,
        expectedVersion: 1,
        actorUserId: 1,
        changedAt,
        audit
      })
    ).resolves.toMatchObject({
      kind: "updated",
      value: { amountNdp: 700, version: 2, source: "persisted" }
    });

    expect(tx.platformFeeRuleSet.updateMany).toHaveBeenCalledWith({
      where: { id: 21, version: 1, effectiveTo: null, deletedAt: null },
      data: { effectiveTo: changedAt, updatedById: 1 }
    });
    const createdRules = tx.platformFeeRule.create.mock.calls.map(
      (call) => (call[0] as { data: unknown }).data
    );
    expect(createdRules).toEqual([
      expect.objectContaining({ feeType: "b_platform_fee", baseAmountNdp: 700, ruleSetId: 22 }),
      expect.objectContaining({ feeType: "user_reward", baseAmountNdp: 100, ruleSetId: 22 })
    ]);
    expect(tx.platformFeeTier.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ ruleId: 201, feeAmountNdp: 500 })]
    });
    expect(tx.platformFeeTimeWindow.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ ruleId: 201, timezone: "Asia/Tokyo" })]
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("does not audit a stale global version", async () => {
    const tx = createGlobalTransaction();
    tx.platformFeeRuleSet.findFirst.mockResolvedValue({ ...currentRuleSet, version: 2 });
    const client = {
      $transaction: jest.fn(async (callback) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new PlatformFeePolicyRepository(client);

    await expect(
      repository.updateGlobalAmount({
        amountNdp: 700,
        expectedVersion: 1,
        actorUserId: 1,
        changedAt,
        audit
      })
    ).resolves.toEqual({ kind: "version_conflict" });
    expect(tx.platformFeeRuleSet.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("pages shops and keeps shops without policy visible", async () => {
    const client = {
      shop: {
        findMany: jest.fn().mockResolvedValue([
          { ...shopProjection, platformFeePolicy: policyProjection },
          {
            id: 12,
            name: "Shibuya Care Studio",
            publicIdentifier: null,
            platformFeePolicy: null
          }
        ]),
        count: jest.fn().mockResolvedValue(2)
      }
    } as unknown as PrismaClient;
    const repository = new PlatformFeePolicyRepository(client);

    await expect(repository.listShopPolicies({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      total: 2,
      list: [
        { shopId: 11, policy: expect.objectContaining({ version: 1 }) },
        { shopId: 12, policy: null }
      ]
    });
    expect(client.shop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null }, skip: 0, take: 20 })
    );
  });

  it("creates an enabled override from version zero without changing the default payer", async () => {
    const tx = createShopTransaction(null, policyProjection);
    const client = {
      $transaction: jest.fn(async (callback) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new PlatformFeePolicyRepository(client);

    await expect(
      repository.updateShopFeeEnabled({
        shopId: 11,
        feeEnabled: false,
        expectedVersion: 0,
        actorUserId: 1,
        audit
      })
    ).resolves.toMatchObject({ kind: "updated" });
    expect(tx.shopPlatformFeePolicy.create).toHaveBeenCalledWith({
      data: {
        shopId: 11,
        feeEnabled: false,
        payerType: "SHOP",
        version: 1,
        createdById: 1,
        updatedById: 1
      }
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("changes only payerType with an optimistic version guard", async () => {
    const updated = { ...policyProjection, payerType: "TECHNICIAN", version: 2 };
    const tx = createShopTransaction(policyProjection, updated);
    tx.merchantShopMembership.findFirst.mockResolvedValue({ id: 91 });
    const client = {
      $transaction: jest.fn(async (callback) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new PlatformFeePolicyRepository(client);

    await repository.updateShopPayerType({
      shopId: 11,
      payerType: "technician",
      expectedVersion: 1,
      actorUserId: 7,
      merchantScope: { scopeType: "merchant_account", scopeId: 4 },
      audit
    });

    expect(tx.shopPlatformFeePolicy.updateMany).toHaveBeenCalledWith({
      where: { shopId: 11, version: 1, deletedAt: null },
      data: { payerType: "TECHNICIAN", version: { increment: 1 }, updatedById: 7 }
    });
    expect(tx.shopPlatformFeePolicy.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      "feeEnabled"
    );
  });

  it("checks exact shop scope and active merchant membership", async () => {
    const shopCount = jest.fn().mockResolvedValue(1);
    const membership = jest.fn().mockResolvedValue({ id: 91 });
    const client = {
      shop: { count: shopCount },
      merchantShopMembership: { findFirst: membership }
    } as unknown as PrismaClient;
    const repository = new PlatformFeePolicyRepository(client);

    await expect(
      repository.hasMerchantShopScope({ scopeType: "shop", scopeId: 12, shopId: 11 })
    ).resolves.toBe(false);
    await expect(
      repository.hasMerchantShopScope({ scopeType: "shop", scopeId: 11, shopId: 11 })
    ).resolves.toBe(true);
    await expect(
      repository.hasMerchantShopScope({
        scopeType: "merchant_account",
        scopeId: 4,
        shopId: 11
      })
    ).resolves.toBe(true);
    expect(membership).toHaveBeenCalledWith({
      where: expect.objectContaining({
        merchantAccountId: 4,
        shopId: 11,
        deletedAt: null,
        startsAt: { lte: expect.any(Date) }
      }),
      select: { id: true }
    });
  });
});

function createGlobalTransaction() {
  let createdRuleId = 200;
  return {
    platformFeeRuleSet: {
      findFirst: jest.fn().mockResolvedValue(currentRuleSet),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({
        ...currentRuleSet,
        id: 22,
        version: 2,
        effectiveFrom: changedAt,
        rules: []
      })
    },
    platformFeeRule: {
      create: jest.fn(async (input: unknown) => {
        void input;
        return { id: ++createdRuleId };
      })
    },
    platformFeeTier: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    platformFeeTimeWindow: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
  };
}

function createShopTransaction(existing: unknown, updated: unknown) {
  return {
    shop: { findFirst: jest.fn().mockResolvedValue(shopProjection) },
    shopPlatformFeePolicy: {
      findFirst: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue({ id: 31 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue(updated)
    },
    merchantShopMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
  };
}
