import { PayrollSchedulePolicyRepository } from "../src/repositories/payroll-schedule-policy.repository";

const shopPolicyInput = {
  cadence: "weekly" as const,
  weeklySettlementWeekday: 5,
  monthlySettlementDay: null,
  holidayAdjustment: "previous_business_day" as const,
  timezone: "Asia/Tokyo" as const,
  effectiveFrom: "2026-08-29",
  effectiveTo: null
};

describe("PayrollSchedulePolicyRepository", () => {
  it("selects the latest effective shop policy inside the requested shop", async () => {
    const findFirst = jest.fn(async () => null);
    const repository = new PayrollSchedulePolicyRepository({
      shopPayrollSchedulePolicy: { findFirst }
    } as never);

    await repository.findActiveShopPolicy(16, "2026-08-29");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 16,
          status: "active",
          effectiveFrom: { lte: expect.any(Date) },
          deletedAt: null
        }),
        orderBy: [{ version: "desc" }, { id: "desc" }]
      })
    );
  });

  it("archives the current shop policy and inserts an immutable next version", async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 16 }]),
      shopPayrollSchedulePolicy: {
        findFirst: jest.fn(async () => ({ version: 3 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => ({
          id: 8,
          shopId: 16,
          ...shopPolicyInput,
          effectiveFrom: new Date("2026-08-29T00:00:00.000Z"),
          effectiveTo: null,
          status: "active",
          version: 4,
          createdById: 7,
          updatedById: 7,
          createdAt: new Date("2026-08-29T00:00:00.000Z"),
          updatedAt: new Date("2026-08-29T00:00:00.000Z")
        }))
      }
    };
    const repository = new PayrollSchedulePolicyRepository({
      $transaction: jest.fn(async (work: (client: typeof transaction) => Promise<unknown>) =>
        work(transaction)
      )
    } as never);

    const saved = await repository.replaceShopPolicy(16, shopPolicyInput, 7);

    expect(transaction.$queryRaw).toHaveBeenCalled();
    expect(transaction.shopPayrollSchedulePolicy.updateMany).toHaveBeenCalledWith({
      where: { shopId: 16, status: "active", deletedAt: null },
      data: expect.objectContaining({ status: "archived", updatedById: 7 })
    });
    expect(transaction.shopPayrollSchedulePolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ shopId: 16, version: 4, createdById: 7, updatedById: 7 })
    });
    expect(saved.version).toBe(4);
  });

  it("resolves only a current employee affiliation from the shop and canonical NeeDoID", async () => {
    const findFirst = jest.fn(async () => ({ id: 41, technicianProfileId: 72 }));
    const repository = new PayrollSchedulePolicyRepository({
      technicianShopAffiliation: { findFirst }
    } as never);

    await expect(repository.findCurrentEmployeeAffiliation(16, "s0000000047")).resolves.toEqual({
      id: 41,
      technicianProfileId: 72
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 16,
          activeKey: { not: null },
          endsAt: null,
          deletedAt: null,
          technicianProfile: expect.objectContaining({
            user: expect.objectContaining({ identities: expect.any(Object) })
          })
        })
      })
    );
  });

  it("versions an affiliation-bound employee override", async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 41 }]),
      technicianPayrollScheduleOverride: {
        findFirst: jest.fn(async () => ({ version: 1 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => ({
          id: 9,
          technicianShopAffiliationId: 41,
          inheritShopPolicy: true,
          cadence: null,
          weeklySettlementWeekday: null,
          monthlySettlementDay: null,
          holidayAdjustment: null,
          timezone: null,
          effectiveFrom: new Date("2026-08-29T00:00:00.000Z"),
          effectiveTo: null,
          status: "active",
          version: 2,
          createdById: 7,
          updatedById: 7,
          createdAt: new Date("2026-08-29T00:00:00.000Z"),
          updatedAt: new Date("2026-08-29T00:00:00.000Z")
        }))
      }
    };
    const repository = new PayrollSchedulePolicyRepository({
      $transaction: jest.fn(async (work: (client: typeof transaction) => Promise<unknown>) =>
        work(transaction)
      )
    } as never);

    const saved = await repository.replaceEmployeeOverride(
      41,
      {
        inheritShopPolicy: true,
        cadence: null,
        weeklySettlementWeekday: null,
        monthlySettlementDay: null,
        holidayAdjustment: null,
        timezone: null,
        effectiveFrom: "2026-08-29",
        effectiveTo: null
      },
      7
    );

    expect(transaction.technicianPayrollScheduleOverride.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        technicianShopAffiliationId: 41,
        inheritShopPolicy: true,
        version: 2
      })
    });
    expect(saved.inheritShopPolicy).toBe(true);
  });

  it("returns explicit non-business dates without relying on the frontend holiday list", async () => {
    const findMany = jest.fn(async () => [
      { calendarDate: new Date("2026-09-21T00:00:00.000Z") },
      { calendarDate: new Date("2026-09-22T00:00:00.000Z") }
    ]);
    const repository = new PayrollSchedulePolicyRepository({
      businessCalendarDate: { findMany }
    } as never);

    await expect(
      repository.listNonBusinessDateKeys("JP", "2026-09-18", "2026-09-25")
    ).resolves.toEqual(["2026-09-21", "2026-09-22"]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          countryCode: "JP",
          calendarDate: { gte: expect.any(Date), lte: expect.any(Date) },
          isBusinessDay: false,
          deletedAt: null
        }
      })
    );
  });
});
