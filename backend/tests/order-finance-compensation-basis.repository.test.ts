import type { PrismaClient } from "@prisma/client";
import { OrderFinanceRepository } from "../src/repositories/order-finance.repository";

describe("OrderFinanceRepository compensation basis", () => {
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
    expect(technicianFindFirst).toHaveBeenCalledWith({ where: { id: 71, shopId: 9 } });
  });
});
