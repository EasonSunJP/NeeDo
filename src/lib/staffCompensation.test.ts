import { describe, expect, it } from "vitest";
import { buildStaffCompensationRule, calculateStaffCompensation } from "./staffCompensation";

describe("staff compensation rules", () => {
  it("keeps salary, commission, nomination fee, bonus amount, and conditions as separate rule fields", () => {
    const rule = buildStaffCompensationRule({ id: "tech-1", orderCount: 968, rating: 4.96 }, { settlementBasis: "商户后台导出" });

    expect(rule.salaryMonthly).toBe(244000);
    expect(rule.commissionRate).toBe(38);
    expect(rule.nominationFeeRate).toBe(6);
    expect(rule.bonusAmount).toBe(40000);
    expect(rule.bonusCondition).toBe("评分 4.90 以上，本月完单 80 单以上");
    expect(rule.settlementBasis).toBe("商户后台导出");
  });

  it("calculates monthly compensation from the reusable rule", () => {
    const rule = buildStaffCompensationRule({ id: "tech-1", orderCount: 968, rating: 4.96 });
    const result = calculateStaffCompensation(rule, {
      salesAmount: 100000,
      nominatedSalesAmount: 20000,
      completedOrders: 90,
      visitCount: 3,
      penaltyCount: 2,
      rating: 4.96
    });

    expect(result).toEqual({
      salaryAmount: 244000,
      commissionAmount: 38000,
      nominationFeeAmount: 1200,
      bonusAmount: 40000,
      transportAllowanceAmount: 4800,
      penaltyAmount: 3000,
      totalAmount: 325000
    });
  });
});
