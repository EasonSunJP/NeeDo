import type { PrismaClient } from "@prisma/client";
import { MerchantFinanceRulesRepository } from "../src/repositories/merchant-finance-rules.repository";

describe("MerchantFinanceRulesRepository", () => {
  it("keeps the pricing-mode settlement mirror aligned and preserves archived rule history", async () => {
    const now = new Date("2026-09-08T00:00:00.000Z");
    const created = {
      id: 12,
      shopId: 9,
      name: "店铺全局分成",
      status: "active",
      wageMode: "commission",
      baseSalaryJpy: 0,
      hourlyRateJpy: 0,
      dailyRateJpy: 0,
      fixedOrderPayJpy: 0,
      commissionRateBps: 3_000,
      extensionCommissionRateBps: 3_000,
      nominationFeeJpy: 0,
      guaranteedMinimumJpy: 0,
      ndpFeeBearer: "shop",
      technicianNdpShareBps: 0,
      bonusRulesJson: [],
      deductionRulesJson: [],
      effectiveFrom: null,
      effectiveTo: null,
      createdById: 4,
      updatedById: 4,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    const transactionClient = {
      shopFinanceRuleSet: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => created)
      },
      shop: { update: jest.fn(async () => ({})) }
    };
    const repository = new MerchantFinanceRulesRepository({
      $transaction: jest.fn((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient))
    } as unknown as PrismaClient);

    await expect(repository.replaceActiveRuleSet(9, {
      name: "店铺全局分成",
      wageMode: "commission",
      baseSalaryJpy: 0,
      hourlyRateJpy: 0,
      dailyRateJpy: 0,
      fixedOrderPayJpy: 0,
      commissionRatePercent: 30,
      extensionCommissionRatePercent: 30,
      nominationFeeJpy: 0,
      guaranteedMinimumJpy: 0,
      ndpFeeBearer: "shop",
      technicianNdpSharePercent: 0,
      bonusRules: [],
      deductionRules: [],
      effectiveFrom: null,
      effectiveTo: null
    }, 4)).resolves.toMatchObject({ commissionRatePercent: 30 });

    expect(transactionClient.shopFinanceRuleSet.updateMany).toHaveBeenCalledWith({
      where: { shopId: 9, status: "active", deletedAt: null },
      data: { status: "archived", updatedById: 4 }
    });
    expect(transactionClient.shop.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { technicianPricingRatePercent: 30 }
    });
  });
});
