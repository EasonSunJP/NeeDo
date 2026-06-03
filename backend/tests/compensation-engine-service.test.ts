import {
  CompensationEngine,
  type CompensationRuleSet
} from "../src/services/compensation-engine.service";

const baseRuleSet: CompensationRuleSet = {
  id: 1,
  sourceType: "shop_default",
  shopId: 11,
  technicianProfileId: null,
  name: "Aoyama default compensation",
  wageMode: "base_plus_commission",
  baseSalaryJpy: 0,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 1000,
  commissionRatePercent: 50,
  guaranteedMinimumJpy: 0,
  ndpFeeBearer: "split",
  technicianNdpSharePercent: 30,
  bonusRules: [
    {
      id: "monthly-100",
      name: "月 100 单突破奖金",
      triggerType: "monthly_order_count",
      threshold: 100,
      amountJpy: 3000,
      active: true
    }
  ],
  deductionRules: []
};

describe("CompensationEngine", () => {
  const engine = new CompensationEngine();

  it("calculates hybrid compensation with bonus, NDP split, technician net, and shop margin", () => {
    const result = engine.calculate(baseRuleSet, {
      serviceAmountJpy: 8800,
      platformFeeNdp: 500,
      workedMinutes: 60,
      monthlyCompletedOrders: 101,
      monthlyServiceGmvJpy: 900_000,
      ratingAverage: 4.8,
      lateCancellationCount: 0
    });

    expect(result).toMatchObject({
      serviceAmountJpy: 8800,
      platformFeeNdp: 500,
      basePayJpy: 1000,
      commissionPayJpy: 4400,
      bonusPayJpy: 3000,
      deductionJpy: 0,
      technicianGrossIncomeJpy: 8400,
      technicianNdpShareNdp: 150,
      shopNdpShareNdp: 350,
      technicianNetIncomeJpy: 8250,
      shopEstimatedGrossProfitJpy: 50
    });
    expect(result.appliedBonusRules).toEqual([
      expect.objectContaining({ id: "monthly-100", amountJpy: 3000 })
    ]);
    expect(result.explanation).toEqual(
      expect.arrayContaining([
        "source:shop_default",
        "wage_mode:base_plus_commission",
        "ndp_fee_bearer:split"
      ])
    );
  });

  it("applies technician override rules, hourly pay, guarantee top-up, deductions, and technician-paid NDP", () => {
    const result = engine.calculate(
      {
        ...baseRuleSet,
        id: 7,
        sourceType: "technician_override",
        technicianProfileId: 21,
        wageMode: "hourly",
        hourlyRateJpy: 3600,
        guaranteedMinimumJpy: 7000,
        ndpFeeBearer: "technician",
        technicianNdpSharePercent: 100,
        bonusRules: [],
        deductionRules: [
          {
            id: "rating-below-4",
            name: "低評価控除",
            triggerType: "rating_average_below",
            threshold: 4,
            amountJpy: 800,
            active: true
          }
        ]
      },
      {
        serviceAmountJpy: 12000,
        platformFeeNdp: 500,
        workedMinutes: 90,
        ratingAverage: 3.8
      }
    );

    expect(result).toMatchObject({
      basePayJpy: 5400,
      commissionPayJpy: 0,
      minimumGuaranteeAdjustmentJpy: 1600,
      deductionJpy: 800,
      technicianGrossIncomeJpy: 6200,
      technicianNdpShareNdp: 500,
      shopNdpShareNdp: 0,
      technicianNetIncomeJpy: 5700,
      shopEstimatedGrossProfitJpy: 5800
    });
    expect(result.appliedDeductionRules).toEqual([
      expect.objectContaining({ id: "rating-below-4", amountJpy: 800 })
    ]);
  });
});
