import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("BackofficeRepository compensation projection", () => {
  it("derives technician and shop estimates from an immutable checkout snapshot", async () => {
    const settlement = {
      id: 901,
      bookingOrderId: 24_410,
      orderType: "booking",
      ndpCurrency: "NDP",
      shopId: 12,
      technicianProfileId: 42,
      serviceAmountJpy: 14_850,
      baseServiceAmountJpy: null,
      extensionAmountJpy: null,
      nominationChargeAmountJpy: null,
      wasTechnicianNominated: null,
      compensationBasisVersion: null,
      platformCollectedServiceAmountJpy: 0,
      offlineReportedServiceAmountJpy: 14_850,
      unknownOrUnreportedServiceAmountJpy: 0,
      paymentChannel: "offline_cash",
      serviceIncomeStatus: "unreported",
      bPlatformFeeHoldNdp: 500,
      bPlatformFeeActualNdp: 500,
      cRequestFeeHoldNdp: 0,
      cRequestFeeActualNdp: 0,
      userRewardNdp: 0,
      penaltyNdp: 0,
      compensationToUserNdp: 0,
      campaignDiscountNdp: 0,
      releasedNdp: 0,
      appliedFeeRuleIdsJson: [],
      moneyTimelineJson: [],
      settlementStatus: "ready_for_payroll",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      bookingOrder: {
        id: 24_410,
        orderNo: "24410",
        shopId: 12,
        technicianProfileId: 42,
        status: "COMPLETED",
        paymentStatus: "CONFIRMED",
        serviceSnapshotJson: { compensationBasisVersion: "shop_default:73" },
        startsAt: new Date("2026-08-31T01:00:00.000Z"),
        endsAt: new Date("2026-08-31T02:45:00.000Z"),
        technicianProfile: { displayName: "技师 42" },
        shop: { name: "店铺 12" },
        checkout: {
          payableNdp: 0,
          baseAmountJpy: 8_200,
          addOnAmountJpy: 6_650,
          travelFareAmountJpy: 0,
          discountAmountJpy: 0,
          checkoutAmountJpy: 14_850
        }
      }
    };
    const client = {
      orderFinancial: {
        findMany: jest.fn(async () => [settlement]),
        count: jest.fn(async () => 1)
      },
      technicianCompensationProfile: { findMany: jest.fn(async () => []) },
      shopFinanceRuleSet: {
        findMany: jest.fn(async () => [
          {
            id: 73,
            shopId: 12,
            name: "店铺默认 100/100",
            wageMode: "commission",
            baseSalaryJpy: 0,
            hourlyRateJpy: 0,
            dailyRateJpy: 0,
            fixedOrderPayJpy: 0,
            commissionRateBps: 10_000,
            extensionCommissionRateBps: 10_000,
            nominationFeeJpy: 0,
            guaranteedMinimumJpy: 0,
            ndpFeeBearer: "shop",
            technicianNdpShareBps: 0,
            bonusRulesJson: [],
            deductionRulesJson: []
          }
        ])
      }
    };
    const repository = new BackofficeRepository(client as never);

    const result = await repository.listFinanceSettlements({
      scope: "platform",
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]).toMatchObject({
      technicianEstimatedIncomeJpy: 14_850,
      shopEstimatedGrossProfitJpy: -500
    });
    expect(client.shopFinanceRuleSet.findMany).toHaveBeenCalledWith({
      where: { id: { in: [73] }, shopId: { in: [12] } }
    });
  });
});
