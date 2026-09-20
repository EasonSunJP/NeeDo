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

  it("keeps a legacy unpaid cancelled booking out of revenue and compensation projections", async () => {
    const settlement = {
      id: 902,
      bookingOrderId: 24_418,
      orderType: "booking",
      ndpCurrency: "TEST_NDP",
      shopId: 11,
      technicianProfileId: 42,
      serviceAmountJpy: 8_800,
      baseServiceAmountJpy: 8_800,
      extensionAmountJpy: 0,
      nominationChargeAmountJpy: 0,
      wasTechnicianNominated: false,
      compensationBasisVersion: "shop_default:73",
      platformCollectedServiceAmountJpy: 0,
      offlineReportedServiceAmountJpy: 0,
      unknownOrUnreportedServiceAmountJpy: 8_800,
      paymentChannel: "unknown",
      serviceIncomeStatus: "unreported",
      bPlatformFeeHoldNdp: 0,
      bPlatformFeeActualNdp: 0,
      cRequestFeeHoldNdp: 0,
      cRequestFeeActualNdp: 0,
      userRewardNdp: 0,
      penaltyNdp: 0,
      compensationToUserNdp: 0,
      campaignDiscountNdp: 0,
      releasedNdp: 0,
      appliedFeeRuleIdsJson: [],
      moneyTimelineJson: [
        {
          type: "technician_income_estimated",
          amountJpy: 1_760,
          metadata: { shopEstimatedGrossProfitJpy: 7_040 }
        }
      ],
      settlementStatus: "compensated",
      createdAt: new Date("2026-09-20T13:24:00.000Z"),
      bookingOrder: {
        id: 24_418,
        orderNo: "ND202609200104226905",
        shopId: 11,
        technicianProfileId: 42,
        status: "CANCELLED",
        paymentStatus: "PENDING",
        serviceSnapshotJson: { compensationBasisVersion: "shop_default:73" },
        startsAt: new Date("2026-09-24T09:00:00.000Z"),
        endsAt: new Date("2026-09-24T10:00:00.000Z"),
        technicianProfile: { displayName: "技师 42" },
        shop: { name: "StagingTest" },
        checkout: null
      }
    };
    const client = {
      orderFinancial: {
        findMany: jest.fn(async () => [settlement]),
        count: jest.fn(async () => 1)
      },
      technicianCompensationProfile: { findMany: jest.fn(async () => []) },
      shopFinanceRuleSet: { findMany: jest.fn(async () => []) }
    };
    const repository = new BackofficeRepository(client as never);

    const result = await repository.listFinanceSettlements({
      scope: "platform",
      page: 1,
      pageSize: 20
    });

    expect(result.list[0]).toMatchObject({
      status: "cancelled",
      estimatedServiceGmvJpy: 0,
      unknownOrUnreportedServiceAmountJpy: 0,
      serviceIncomeStatus: "cancelled",
      technicianEstimatedIncomeJpy: 0,
      shopEstimatedGrossProfitJpy: 0,
      moneyTimelineStatus: "cancelled"
    });
    expect(result.list[0]?.moneyTimeline).toEqual([]);
    expect(client.technicianCompensationProfile.findMany).not.toHaveBeenCalled();
    expect(client.shopFinanceRuleSet.findMany).not.toHaveBeenCalled();

    const exported = await repository.exportFinanceSettlements({
      scope: "platform",
      page: 1,
      pageSize: 20
    });
    const [headerLine, rowLine] = exported.content.split("\n");
    const header = headerLine!.split(",");
    const row = rowLine!.split(",");
    const value = (name: string) => row[header.indexOf(name)];
    expect(value("status")).toBe("cancelled");
    expect(value("serviceIncomeStatus")).toBe("cancelled");
    expect(value("estimatedServiceGmvJpy")).toBe("0");
    expect(value("unknownOrUnreportedServiceAmountJpy")).toBe("0");
    expect(value("technicianEstimatedIncomeJpy")).toBe("0");
    expect(value("shopEstimatedGrossProfitJpy")).toBe("0");
    expect(value("moneyTimelineStatus")).toBe("cancelled");

    settlement.penaltyNdp = 500;
    settlement.compensationToUserNdp = 500;
    const compensatedHistory = await repository.listFinanceSettlements({
      scope: "platform",
      page: 1,
      pageSize: 20
    });
    expect(compensatedHistory.list[0]).toMatchObject({
      status: "compensated",
      estimatedServiceGmvJpy: 0,
      serviceIncomeStatus: "cancelled",
      penaltyNdp: 500,
      compensationToUserNdp: 500
    });
  });
});
