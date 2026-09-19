import type { PrismaClient } from "@prisma/client";
import { OrderFinanceRepository } from "../src/repositories/order-finance.repository";

describe("OrderFinanceRepository compensation basis", () => {
  it("projects a verifiable checkout split for completed historical orders without component columns", async () => {
    const timestamp = new Date("2026-09-20T00:00:00.000Z");
    const repository = new OrderFinanceRepository({
      bookingOrder: {
        findFirst: jest.fn(async () => ({
          id: 24410,
          orderType: "BOOKING",
          orderNo: "ND24410",
          status: "COMPLETED",
          customerUserId: 1,
          shopId: 12,
          technicianProfileId: 42,
          serviceNameSnapshot: "护理",
          priceAmount: 8_200,
          startsAt: timestamp,
          endsAt: new Date("2026-09-20T01:45:00.000Z"),
          serviceSnapshotJson: { compensationBasisVersion: "shop_default:73" },
          shop: { name: "Shop" },
          technicianProfile: { displayName: "Mika" },
          checkout: {
            payableNdp: 14_850,
            baseAmountJpy: 8_200,
            addOnAmountJpy: 6_650,
            travelFareAmountJpy: 0,
            discountAmountJpy: 0,
            checkoutAmountJpy: 14_850
          },
          financial: {
            id: 301,
            ndpCurrency: "TEST_NDP",
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
            serviceIncomeStatus: "confirmed",
            bPlatformFeeHoldNdp: 500,
            bPlatformFeeActualNdp: 500,
            cRequestFeeHoldNdp: 0,
            cRequestFeeActualNdp: 0,
            userRewardNdp: 0,
            campaignDiscountNdp: 0,
            releasedNdp: 0,
            penaltyNdp: 0,
            compensationToUserNdp: 0,
            appliedFeeRuleIdsJson: [],
            moneyTimelineJson: [],
            serviceIncomeReportedById: null,
            serviceIncomeReportedAt: null,
            serviceIncomeConfirmedById: null,
            serviceIncomeConfirmedAt: timestamp,
            serviceIncomeNote: null,
            serviceIncomeProofUrl: null,
            settlementStatus: "settled",
            createdAt: timestamp,
            updatedAt: timestamp
          },
          createdAt: timestamp,
          updatedAt: timestamp
        }))
      },
      shopFinanceRuleSet: {
        findFirst: jest.fn(async () => ({
          id: 73,
          shopId: 12,
          name: "Full split",
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
        }))
      },
      technicianCompensationProfile: { findFirst: jest.fn() }
    } as unknown as PrismaClient);

    const result = await repository.findOrderFinance(24410);

    expect(result?.financial).toMatchObject({
      baseServiceAmountJpy: 8_200,
      extensionAmountJpy: 6_650,
      nominationChargeAmountJpy: 0,
      wasTechnicianNominated: false,
      compensationBasisVersion: "shop_default:73"
    });
  });

  it("moves a completed paid and confirmed income report to ready_for_payroll", async () => {
    const upsert = jest.fn(async () => ({}));
    const transaction = {
      bookingOrder: {
        findFirstOrThrow: jest.fn(async () => ({
          id: 81,
          orderType: "BOOKING",
          customerUserId: 1,
          shopId: 9,
          technicianProfileId: 3,
          status: "COMPLETED",
          paymentStatus: "CONFIRMED"
        }))
      },
      orderFinancial: { upsert }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<void>) => operation(transaction))
    };
    const repository = new OrderFinanceRepository(client as unknown as PrismaClient);
    jest.spyOn(repository, "findOrderFinance").mockResolvedValue({} as never);

    await repository.upsertServiceIncomeReport({
      bookingOrderId: 81,
      serviceAmountJpy: 10_000,
      baseServiceAmountJpy: 10_000,
      extensionAmountJpy: 0,
      nominationChargeAmountJpy: 0,
      wasTechnicianNominated: false,
      compensationBasisVersion: "technician_override:71",
      platformCollectedServiceAmountJpy: 10_000,
      offlineReportedServiceAmountJpy: 0,
      unknownOrUnreportedServiceAmountJpy: 0,
      paymentChannel: "platform_online",
      serviceIncomeStatus: "confirmed",
      reportedById: 4,
      confirmedById: 4,
      note: null,
      proofUrl: null,
      moneyTimeline: []
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ settlementStatus: "ready_for_payroll" }),
        create: expect.objectContaining({ settlementStatus: "ready_for_payroll" })
      })
    );
  });

  it("loads the compensation rule captured by the booking snapshot", async () => {
    const timestamp = new Date("2026-09-01T00:00:00.000Z");
    const bookingOrder = {
      id: 81,
      orderType: "BOOKING",
      orderNo: "ND81",
      status: "COMPLETED",
      customerUserId: 1,
      shopId: 9,
      technicianProfileId: 3,
      serviceNameSnapshot: "护理",
      priceAmount: 10_000,
      startsAt: timestamp,
      endsAt: new Date("2026-09-01T01:00:00.000Z"),
      serviceSnapshotJson: { compensationBasisVersion: "technician_override:71" },
      shop: { name: "Shop" },
      technicianProfile: { displayName: "Mika" },
      financial: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const archivedRule = {
      id: 71,
      shopId: 9,
      technicianProfileId: 3,
      name: "30 percent",
      status: "archived",
      version: 1,
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
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null
    };
    const technicianFindFirst = jest.fn(async () => archivedRule);
    const repository = new OrderFinanceRepository({
      bookingOrder: { findFirst: jest.fn(async () => bookingOrder) },
      technicianCompensationProfile: { findFirst: technicianFindFirst },
      shopFinanceRuleSet: { findFirst: jest.fn() }
    } as unknown as PrismaClient);

    const result = await repository.findOrderFinance(81);

    expect(result?.activeCompensationRule).toMatchObject({
      id: 71,
      sourceType: "technician_override",
      commissionRatePercent: 30
    });
    expect(technicianFindFirst).toHaveBeenCalledWith({
      where: { id: 71, shopId: 9, technicianProfileId: 3 }
    });
  });
});
