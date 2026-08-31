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
  extensionCommissionRatePercent: 50,
  nominationFeeJpy: 0,
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

  it("calculates service, extension, and nomination compensation independently", () => {
    const result = engine.calculate(
      {
        ...baseRuleSet,
        fixedOrderPayJpy: 0,
        commissionRatePercent: 20,
        extensionCommissionRatePercent: 60,
        nominationFeeJpy: 1_500,
        ndpFeeBearer: "shop"
      },
      {
        baseServiceAmountJpy: 10_000,
        extensionAmountJpy: 4_000,
        nominated: true,
        platformFeeNdp: 0
      }
    );

    expect(result).toMatchObject({
      serviceAmountJpy: 14_000,
      baseServiceAmountJpy: 10_000,
      extensionAmountJpy: 4_000,
      nominated: true,
      serviceCommissionPayJpy: 2_000,
      extensionCommissionPayJpy: 2_400,
      nominationPayJpy: 1_500,
      commissionPayJpy: 4_400,
      technicianGrossIncomeJpy: 5_900,
      technicianNetIncomeJpy: 5_900,
      shopEstimatedGrossProfitJpy: 8_100
    });
  });

  it("keeps aggregate-only historical calculations on the service commission rate", () => {
    const result = engine.calculate(
      {
        ...baseRuleSet,
        fixedOrderPayJpy: 0,
        commissionRatePercent: 20,
        extensionCommissionRatePercent: 60,
        nominationFeeJpy: 1_500,
        ndpFeeBearer: "shop"
      },
      { serviceAmountJpy: 14_000, platformFeeNdp: 0 }
    );

    expect(result).toMatchObject({
      serviceAmountJpy: 14_000,
      baseServiceAmountJpy: 14_000,
      extensionAmountJpy: 0,
      nominated: false,
      serviceCommissionPayJpy: 2_800,
      extensionCommissionPayJpy: 0,
      nominationPayJpy: 0,
      commissionPayJpy: 2_800
    });
  });
});
