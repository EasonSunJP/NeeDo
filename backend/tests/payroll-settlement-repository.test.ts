import { PayrollRepository } from "../src/repositories/payroll.repository";

const attachIdentityMappers = (repository: PayrollRepository): void => {
  Object.assign(repository, {
    mapPayRun: (value: unknown) => value,
    mapPayslip: (value: unknown) => value
  });
};

describe("PayrollRepository order settlement transitions", () => {
  it("selects only ready-for-payroll completed source orders", async () => {
    const orderFinancial = { findMany: jest.fn(async () => []) };
    const technicianCompensationProfile = { findMany: jest.fn(async () => []) };
    const shopFinanceRuleSet = { findFirst: jest.fn(async () => null) };
    const prisma = {
      orderFinancial,
      technicianCompensationProfile,
      shopFinanceRuleSet,
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations))
    };
    const repository = new PayrollRepository(prisma as never);

    await repository.findPayrollSourceOrders({
      shopId: 16,
      periodStart: "2026-05-31T15:00:00.000Z",
      periodEnd: "2026-06-30T14:59:59.999Z"
    });

    expect(orderFinancial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 16,
          settlementStatus: "ready_for_payroll",
          bookingOrder: expect.objectContaining({ status: "COMPLETED" })
        })
      })
    );
  });

  it("moves only approved pay-run source orders into payroll_approved", async () => {
    const transaction = {
      payRun: {
        update: jest.fn(async () => ({ id: 61 })),
        findUniqueOrThrow: jest.fn(async () => ({ id: 61 }))
      },
      payslip: { updateMany: jest.fn(async () => ({ count: 20 })) },
      payslipLine: {
        findMany: jest.fn(async () => [{ orderId: 1001 }, { orderId: 1002 }])
      },
      orderFinancial: { updateMany: jest.fn(async () => ({ count: 2 })) }
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction)
      )
    };
    const repository = new PayrollRepository(prisma as never);
    attachIdentityMappers(repository);

    await repository.transitionPayRun({ payRunId: 61, status: "approved", approvedById: 1 });

    expect(transaction.payslipLine.findMany).toHaveBeenCalledWith({
      where: {
        payslip: { payRunId: 61, deletedAt: null },
        sourceType: "order",
        orderId: { not: null },
        deletedAt: null
      },
      select: { orderId: true }
    });
    expect(transaction.orderFinancial.updateMany).toHaveBeenCalledWith({
      where: {
        bookingOrderId: { in: [1001, 1002] },
        settlementStatus: "ready_for_payroll",
        deletedAt: null
      },
      data: { settlementStatus: "payroll_approved" }
    });
  });

  it("settles only a fully paid payslip and leaves a partial payout approved", async () => {
    const createFixture = (nextUnpaidAmountJpy: number) => {
      const transaction = {
        payslip: {
          update: jest.fn(async () => ({ id: 801, payRunId: 61 })),
          aggregate: jest.fn(async () => ({
            _sum: {
              paidAmountJpy: 234_000 - nextUnpaidAmountJpy,
              unpaidAmountJpy: nextUnpaidAmountJpy
            }
          }))
        },
        payRun: { update: jest.fn(async () => ({ id: 61 })) },
        payslipLine: {
          findMany: jest.fn(async () => [{ orderId: 1001 }, { orderId: 1002 }])
        },
        orderFinancial: { updateMany: jest.fn(async () => ({ count: 2 })) }
      };
      const prisma = {
        $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
          work(transaction)
        )
      };
      const repository = new PayrollRepository(prisma as never);
      attachIdentityMappers(repository);
      return { repository, transaction };
    };
    const input = {
      payslipId: 801,
      shopId: 16,
      technicianProfileId: 170,
      amountJpy: 234_000,
      payoutMethod: "cash" as const,
      payoutDate: "2026-07-05T00:00:00.000Z",
      referenceNo: "LD-PAYOUT-202606-001",
      proofUrl: null,
      note: "6月分給与",
      createdById: 1,
      nextPaidAmountJpy: 234_000,
      nextUnpaidAmountJpy: 0,
      nextPayslipStatus: "paid" as const
    };
    const fullyPaid = createFixture(0);
    await fullyPaid.repository.addPayoutRecord(input);
    expect(fullyPaid.transaction.orderFinancial.updateMany).toHaveBeenCalledWith({
      where: {
        bookingOrderId: { in: [1001, 1002] },
        settlementStatus: "payroll_approved",
        deletedAt: null
      },
      data: { settlementStatus: "settled" }
    });

    const partial = createFixture(100_000);
    await partial.repository.addPayoutRecord({
      ...input,
      amountJpy: 134_000,
      nextPaidAmountJpy: 134_000,
      nextUnpaidAmountJpy: 100_000,
      nextPayslipStatus: "scheduled"
    });
    expect(partial.transaction.payslipLine.findMany).not.toHaveBeenCalled();
    expect(partial.transaction.orderFinancial.updateMany).not.toHaveBeenCalled();
  });
});
