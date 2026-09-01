import { CompensationProfileRepository } from "../src/repositories/compensation-profile.repository";

describe("CompensationProfileRepository employee scope", () => {
  it("maps independent service, extension, and nomination compensation components", async () => {
    const common = {
      id: 51,
      shopId: 16,
      name: "银座技师收入模型",
      wageMode: "base_plus_commission",
      baseSalaryJpy: 240_000,
      hourlyRateJpy: 0,
      dailyRateJpy: 0,
      fixedOrderPayJpy: 0,
      commissionRateBps: 2_000,
      extensionCommissionRateBps: 6_000,
      nominationFeeJpy: 1_500,
      guaranteedMinimumJpy: 0,
      ndpFeeBearer: "shop",
      technicianNdpShareBps: 0,
      bonusRulesJson: [],
      deductionRulesJson: [],
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      deletedAt: null
    };
    const repository = new CompensationProfileRepository({
      technicianCompensationProfile: {
        findFirst: jest.fn(async () => ({
          ...common,
          technicianProfileId: 71,
          status: "active",
          version: 3,
          createdById: 9,
          updatedById: 9
        }))
      },
      shopFinanceRuleSet: {
        findFirst: jest.fn(async () => ({ ...common, status: "active" }))
      }
    } as never);

    await expect(repository.findActiveProfile(16, 71)).resolves.toMatchObject({
      commissionRatePercent: 20,
      extensionCommissionRatePercent: 60,
      nominationFeeJpy: 1_500
    });
    await expect(repository.findShopFallbackRule(16)).resolves.toMatchObject({
      commissionRatePercent: 20,
      extensionCommissionRatePercent: 60,
      nominationFeeJpy: 1_500
    });
  });

  it("resolves only a current employee affiliation from the shop and canonical NeeDoID", async () => {
    const findFirst = jest.fn(async () => ({ id: 47, technicianProfileId: 71 }));
    const repository = new CompensationProfileRepository({
      technicianShopAffiliation: { findFirst }
    } as never);

    await expect(
      repository.findCurrentEmployeeAffiliation(16, "s0000000047")
    ).resolves.toEqual({ id: 47, technicianProfileId: 71 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 16,
          activeKey: { not: null },
          workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
          endsAt: null,
          deletedAt: null,
          technicianProfile: expect.objectContaining({
            user: expect.objectContaining({
              identities: {
                some: expect.objectContaining({
                  publicIdentifier: {
                    is: expect.objectContaining({
                      publicId: "s0000000047",
                      kind: "S",
                      status: "ACTIVE",
                      deletedAt: null
                    })
                  }
                })
              }
            })
          })
        }),
        select: { id: true, technicianProfileId: true }
      })
    );
  });

  it("returns an explicit zero summary when no formal payslip exists", async () => {
    const repository = new CompensationProfileRepository({
      payslip: { findFirst: jest.fn(async () => null) }
    } as never);

    await expect(repository.findEmployeePayrollSummary(16, 71)).resolves.toEqual({
      payslipId: null,
      periodStart: null,
      periodEnd: null,
      status: null,
      disputeStatus: null,
      completedOrderCount: 0,
      workedMinutes: 0,
      serviceIncomeJpy: 0,
      basePayJpy: 0,
      commissionJpy: 0,
      bonusJpy: 0,
      allowanceJpy: 0,
      deductionJpy: 0,
      platformFeeShareDeductionJpy: 0,
      netPayJpy: 0,
      paidAmountJpy: 0,
      unpaidAmountJpy: 0,
      payoutRecordCount: 0
    });
  });

  it("maps the latest exact-shop payslip and its formal order-finance sources", async () => {
    const payslipFindFirst = jest.fn(async () => ({
      id: 801,
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-31T23:59:59.999Z"),
      status: "scheduled",
      disputeStatus: "none",
      baseSalaryJpy: 230_000,
      annualSalaryProratedJpy: 0,
      dailyWageJpy: 0,
      hourlyWageJpy: 0,
      commissionJpy: 4_000,
      guaranteeTopupJpy: 0,
      bonusJpy: 1_000,
      allowanceJpy: 500,
      deductionJpy: 300,
      platformFeeShareDeductionJpy: 200,
      netPayJpy: 235_000,
      paidAmountJpy: 100_000,
      unpaidAmountJpy: 135_000,
      lines: [{ orderId: 91 }, { orderId: 91 }, { orderId: 92 }]
    }));
    const bookingFindMany = jest.fn(async () => [
      {
        id: 91,
        startsAt: new Date("2026-08-10T01:00:00.000Z"),
        endsAt: new Date("2026-08-10T02:00:00.000Z")
      },
      {
        id: 92,
        startsAt: new Date("2026-08-11T01:00:00.000Z"),
        endsAt: new Date("2026-08-11T02:30:00.000Z")
      }
    ]);
    const aggregate = jest.fn(async () => ({ _sum: { serviceAmountJpy: 20_000 } }));
    const payoutCount = jest.fn(async () => 1);
    const repository = new CompensationProfileRepository({
      payslip: { findFirst: payslipFindFirst },
      bookingOrder: { findMany: bookingFindMany },
      orderFinancial: { aggregate },
      payoutRecord: { count: payoutCount }
    } as never);

    await expect(repository.findEmployeePayrollSummary(16, 71)).resolves.toMatchObject({
      payslipId: 801,
      completedOrderCount: 2,
      workedMinutes: 150,
      serviceIncomeJpy: 20_000,
      basePayJpy: 230_000,
      commissionJpy: 4_000,
      netPayJpy: 235_000,
      paidAmountJpy: 100_000,
      unpaidAmountJpy: 135_000,
      payoutRecordCount: 1
    });
    expect(payslipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId: 16,
          technicianProfileId: 71,
          deletedAt: null,
          payRun: { deletedAt: null }
        },
        orderBy: [{ periodEnd: "desc" }, { id: "desc" }]
      })
    );
    expect(bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [91, 92] },
          shopId: 16,
          technicianProfileId: 71,
          status: "COMPLETED",
          deletedAt: null
        })
      })
    );
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookingOrderId: { in: [91, 92] },
          shopId: 16,
          technicianProfileId: 71,
          serviceIncomeStatus: { in: ["reported", "confirmed"] },
          deletedAt: null
        })
      })
    );
  });
});
