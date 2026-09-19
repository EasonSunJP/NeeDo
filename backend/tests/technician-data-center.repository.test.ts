import { TechnicianDataCenterRepository } from "../src/repositories/technician-data-center.repository";
import { resolveTechnicianDataCenterPeriod } from "../src/services/technician-data-center.service";

const now = new Date("2026-09-01T03:00:00.000Z");

describe("TechnicianDataCenterRepository", () => {
  it("loads only formally scoped orders, recognized payslip lines, and versioned compensation", async () => {
    const technicianProfile = {
      findFirst: jest.fn(async () => ({
        id: 31,
        userId: 9,
        shopId: 73,
        displayName: "Misaki",
        employmentStartedAt: new Date("2026-04-01T00:00:00.000Z")
      }))
    };
    const technicianShopAffiliation = {
      findMany: jest.fn(async () => [
        {
          shopId: 73,
          relationshipType: "EXCLUSIVE",
          startsAt: new Date("2026-04-01T00:00:00.000Z"),
          shop: { name: "GINZA Calm Body Lab" }
        }
      ])
    };
    const order = {
      id: 501,
      orderNo: "BK-501",
      status: "COMPLETED",
      paymentStatus: "CONFIRMED",
      startsAt: new Date("2026-08-31T01:00:00.000Z"),
      endsAt: new Date("2026-08-31T02:00:00.000Z"),
      serviceNameSnapshot: "肩颈护理",
      serviceSnapshotJson: { compensationBasisVersion: "shop_default:73" },
      service: { name: "旧名称" },
      shop: { name: "GINZA Calm Body Lab" },
      checkout: {
        baseAmountJpy: 8_200,
        addOnAmountJpy: 6_650,
        travelFareAmountJpy: 0,
        discountAmountJpy: 0,
        checkoutAmountJpy: 14_850
      },
      financial: {
        serviceIncomeStatus: "unreported",
        serviceAmountJpy: 14_850,
        baseServiceAmountJpy: null,
        extensionAmountJpy: null,
        nominationChargeAmountJpy: null,
        wasTechnicianNominated: null,
        compensationBasisVersion: null,
        bPlatformFeeActualNdp: 500
      }
    };
    const bookingOrder = {
      findMany: jest.fn().mockResolvedValueOnce([order]).mockResolvedValueOnce([order]),
      count: jest.fn(async () => 2),
      findFirst: jest.fn(async () => null)
    };
    const technicianCompensationProfile = {
      findFirst: jest.fn(async () => ({
        id: 81,
        shopId: 73,
        technicianProfileId: 31,
        name: "专属技师",
        status: "active",
        version: 3,
        wageMode: "commission",
        baseSalaryJpy: 280_000,
        hourlyRateJpy: 0,
        dailyRateJpy: 0,
        fixedOrderPayJpy: 0,
        commissionRateBps: 5000,
        extensionCommissionRateBps: 7000,
        nominationFeeJpy: 1_000,
        guaranteedMinimumJpy: 0,
        ndpFeeBearer: "shop",
        technicianNdpShareBps: 0,
        bonusRulesJson: [],
        deductionRulesJson: [],
        updatedAt: now
      })),
      findMany: jest.fn(async () => [
        {
          id: 81,
          shopId: 73,
          technicianProfileId: 31,
          name: "专属技师",
          wageMode: "commission",
          baseSalaryJpy: 280_000,
          hourlyRateJpy: 0,
          dailyRateJpy: 0,
          fixedOrderPayJpy: 0,
          commissionRateBps: 5000,
          extensionCommissionRateBps: 7000,
          nominationFeeJpy: 1_000,
          guaranteedMinimumJpy: 0,
          ndpFeeBearer: "shop",
          technicianNdpShareBps: 0,
          bonusRulesJson: [],
          deductionRulesJson: []
        }
      ])
    };
    const shopFinanceRuleSet = {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => [
        {
          id: 73,
          shopId: 73,
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
    };
    const payslipLine = {
      findMany: jest.fn(async () => [
        { orderId: 501, amountJpy: 4_000 },
        { orderId: 501, amountJpy: 1_000 }
      ])
    };
    const repository = new TechnicianDataCenterRepository({
      technicianProfile,
      technicianShopAffiliation,
      bookingOrder,
      technicianCompensationProfile,
      shopFinanceRuleSet,
      payslipLine
    } as never);

    const result = await repository.load(
      9,
      31,
      resolveTechnicianDataCenterPeriod("last7days", now)
    );

    expect(result).toMatchObject({
      technician: { id: 31, userId: 9, displayName: "Misaki" },
      affiliation: {
        shopId: 73,
        shopName: "GINZA Calm Body Lab",
        relationshipType: "partner"
      },
      incomeModel: {
        commissionRatePercent: 50,
        extensionCommissionRatePercent: 70,
        nominationFeeJpy: 1_000
      },
      recognizedIncomeByOrderId: { 501: 5_000 },
      recentOrders: [
        {
          id: 501,
          serviceName: "肩颈护理",
          status: "completed",
          financial: {
            serviceIncomeStatus: "confirmed",
            baseServiceAmountJpy: 8_200,
            extensionAmountJpy: 6_650,
            nominationChargeAmountJpy: 0,
            wasTechnicianNominated: false,
            compensationBasisVersion: "shop_default:73",
            platformFeeNdp: 500
          }
        }
      ]
    });
    expect(technicianProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 31, userId: 9, deletedAt: null }
      })
    );
    expect(bookingOrder.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        technicianProfileId: 31,
        status: "COMPLETED",
        paymentStatus: "CONFIRMED",
        deletedAt: null
      }
    });
    expect(bookingOrder.findMany.mock.calls[1]?.[0]).toMatchObject({ take: 3 });
    expect(payslipLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderId: { in: [501] },
          payslip: expect.objectContaining({
            technicianProfileId: 31,
            status: { in: ["published", "confirmed", "approved", "scheduled", "paid", "locked"] }
          })
        })
      })
    );
  });
});
