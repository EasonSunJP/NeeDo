import type { PrismaClient } from "@prisma/client";
import { OrderFinanceRepository } from "../src/repositories/order-finance.repository";

describe("OrderFinanceRepository compensation basis", () => {
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
