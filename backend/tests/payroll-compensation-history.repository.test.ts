import type { PrismaClient } from "@prisma/client";
import { PayrollRepository } from "../src/repositories/payroll.repository";

const rule = (id: number, commissionRateBps: number, status = "active") => ({
  id,
  shopId: 9,
  technicianProfileId: 3,
  name: `Rule ${id}`,
  status,
  version: id,
  wageMode: "commission",
  baseSalaryJpy: 0,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 0,
  commissionRateBps,
  extensionCommissionRateBps: commissionRateBps,
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
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  deletedAt: null
});

describe("PayrollRepository compensation history", () => {
  it("uses the exact compensation basis saved on the order instead of the current technician override", async () => {
    const orderFinancial = {
      findMany: jest.fn(async () => [{
        bookingOrderId: 81,
        shopId: 9,
        technicianProfileId: 3,
        serviceAmountJpy: 10_000,
        bPlatformFeeActualNdp: 0,
        serviceIncomeStatus: "confirmed",
        compensationBasisVersion: "technician_override:71",
        bookingOrder: {
          orderNo: "ND81",
          serviceNameSnapshot: "护理",
          note: null,
          startsAt: new Date("2026-09-01T01:00:00.000Z"),
          endsAt: new Date("2026-09-01T02:00:00.000Z"),
          shop: { name: "Shop" },
          technicianProfile: { id: 3, displayName: "Mika", userId: 8 }
        }
      }])
    };
    const technicianCompensationProfile = {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([rule(72, 8_000)])
        .mockResolvedValueOnce([rule(71, 3_000, "archived")])
    };
    const shopFinanceRuleSet = {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => [])
    };
    const client = {
      orderFinancial,
      technicianCompensationProfile,
      shopFinanceRuleSet,
      $transaction: jest.fn((promises: Promise<unknown>[]) => Promise.all(promises))
    };
    const repository = new PayrollRepository(client as unknown as PrismaClient);

    const [source] = await repository.findPayrollSourceOrders({
      shopId: 9,
      periodStart: "2026-09-01T00:00:00.000Z",
      periodEnd: "2026-09-30T23:59:59.999Z"
    });

    expect(source?.compensationRule).toMatchObject({
      id: 71,
      sourceType: "technician_override",
      commissionRatePercent: 30
    });
  });
});
