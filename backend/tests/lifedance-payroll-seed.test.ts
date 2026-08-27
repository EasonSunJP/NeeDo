import type { PayRunPayload, PayslipPayload } from "../src/services/payroll.service";
import {
  LIFEDANCE_PAYROLL_PERIODS,
  resetLifeDancePayrollPeriods,
  runLifeDancePayrollWorkflow,
  type LifeDancePayrollPort
} from "../src/simulation/lifedance-payroll-seed";

const merchantActor = {
  userId: 1,
  email: "admin@lifedance.com",
  accessTokenJti: "lifedance-payroll-seed",
  accessTokenExpiresAt: Date.now() + 900_000,
  currentIdentityId: 10,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 16,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:payroll:write"]
};

const technicianActors = Array.from({ length: 20 }, (_, index) => ({
  technicianProfileId: 170 + index,
  actor: {
    userId: 70 + index,
    email: `sim.tech.${String(index + 1).padStart(3, "0")}@needo.local`,
    accessTokenJti: `lifedance-tech-${index + 1}`,
    accessTokenExpiresAt: Date.now() + 900_000,
    currentIdentityId: 100 + index,
    currentIdentityType: "technician",
    currentIdentityScopeType: "technician_profile",
    currentIdentityScopeId: 170 + index,
    roles: ["technician"],
    permissions: ["technician:payslip:confirm", "technician:payout-record:confirm"]
  }
}));

const buildPayRun = (periodIndex: number, status: string): PayRunPayload =>
  ({
    id: 61 + periodIndex,
    shopId: 16,
    status,
    payslips: technicianActors.map(({ technicianProfileId }, index) => ({
      id: 8000 + periodIndex * 100 + index,
      payRunId: 61 + periodIndex,
      shopId: 16,
      technicianProfileId,
      status,
      netPayJpy: 230_000 + index,
      paidAmountJpy: status === "paid" ? 230_000 + index : 0,
      unpaidAmountJpy: status === "paid" ? 0 : 230_000 + index,
      payoutRecords: []
    }))
  }) as unknown as PayRunPayload;

describe("LifeDance payroll service orchestration", () => {
  it("runs generate, publish, staff confirmation, approval and two paid months in order", async () => {
    const calls: string[] = [];
    let periodIndex = -1;
    const port: LifeDancePayrollPort = {
      generateMerchantPayRun: jest.fn(async () => {
        periodIndex += 1;
        calls.push(`m${periodIndex}:generate`);
        return buildPayRun(periodIndex, "draft");
      }),
      publishMerchantPayRun: jest.fn(async (_actor, _context, payRunId) => {
        calls.push(`m${periodIndex}:publish:${payRunId}`);
        return buildPayRun(periodIndex, "published");
      }),
      confirmTechnicianPayslip: jest.fn(async (_actor, _context, payslipId) => {
        calls.push(`m${periodIndex}:confirm:${payslipId}`);
        return { id: payslipId, status: "confirmed" } as PayslipPayload;
      }),
      approveMerchantPayRun: jest.fn(async (_actor, _context, payRunId) => {
        calls.push(`m${periodIndex}:approve:${payRunId}`);
        return buildPayRun(periodIndex, "approved");
      }),
      recordMerchantPayout: jest.fn(async (_actor, _context, payslipId, input) => {
        calls.push(`m${periodIndex}:payout:${payslipId}`);
        return {
          id: payslipId,
          status: "paid",
          payoutRecords: [{ id: payslipId + 50_000 }],
          unpaidAmountJpy: 0,
          paidAmountJpy: input.amountJpy
        } as PayslipPayload;
      }),
      confirmTechnicianPayoutRecord: jest.fn(
        async (_actor, _context, payslipId, payoutRecordId) => {
          calls.push(`m${periodIndex}:payout-confirm:${payslipId}:${payoutRecordId}`);
          return { id: payslipId, status: "paid" } as PayslipPayload;
        }
      )
    };

    await runLifeDancePayrollWorkflow(port, {
      shopId: 16,
      merchantActor,
      technicianActors,
      context: { ip: "127.0.0.1", userAgent: "lifedance-payroll-seed" }
    });

    expect(port.generateMerchantPayRun).toHaveBeenCalledTimes(3);
    expect(port.publishMerchantPayRun).toHaveBeenCalledTimes(3);
    expect(port.confirmTechnicianPayslip).toHaveBeenCalledTimes(60);
    expect(port.approveMerchantPayRun).toHaveBeenCalledTimes(3);
    expect(port.recordMerchantPayout).toHaveBeenCalledTimes(40);
    expect(port.confirmTechnicianPayoutRecord).toHaveBeenCalledTimes(40);
    for (const monthIndex of [0, 1, 2]) {
      const monthCalls = calls.filter((call) => call.startsWith(`m${monthIndex}:`));
      expect(monthCalls[0]).toBe(`m${monthIndex}:generate`);
      expect(monthCalls[1]).toBe(`m${monthIndex}:publish:${61 + monthIndex}`);
      expect(monthCalls.slice(2, 22).every((call) => call.includes(":confirm:"))).toBe(true);
      expect(monthCalls[22]).toBe(`m${monthIndex}:approve:${61 + monthIndex}`);
      expect(monthCalls.filter((call) => call.includes(":payout:"))).toHaveLength(
        monthIndex < 2 ? 20 : 0
      );
    }
    for (const call of (port.confirmTechnicianPayslip as jest.Mock).mock.calls) {
      expect(call[0].currentIdentityScopeType).toBe("technician_profile");
      expect(call[0].currentIdentityScopeId).toBeGreaterThanOrEqual(170);
    }
    for (const period of LIFEDANCE_PAYROLL_PERIODS) {
      expect(period.periodStart).toMatch(/Z$/);
      expect(period.periodEnd).toMatch(/Z$/);
    }
  });
});

describe("LifeDance payroll reset safety", () => {
  it("refuses to retire a pay run whose order lines are outside the cohort namespace", async () => {
    const prisma = {
      payRun: {
        findMany: jest.fn(async () => [
          {
            id: 61,
            payslips: [{ id: 801, lines: [{ sourceType: "order", orderId: 1001 }] }]
          }
        ])
      },
      bookingOrder: {
        findMany: jest.fn(async () => [
          { id: 1001, serviceSnapshotJson: { namespace: "outside_cohort" } }
        ])
      },
      $transaction: jest.fn()
    };

    await expect(resetLifeDancePayrollPeriods(prisma as never, 16)).rejects.toThrow(
      "LIFEDANCE_PAYROLL_PERIOD_CONFLICT:NON_COHORT_ORDER"
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("retires payout evidence before lines, slips and pay runs, then resets verified orders", async () => {
    const calls: string[] = [];
    const transaction = {
      payoutRecord: {
        updateMany: jest.fn(async () => {
          calls.push("payout");
          return { count: 1 };
        })
      },
      payslipLine: {
        updateMany: jest.fn(async () => {
          calls.push("line");
          return { count: 2 };
        })
      },
      payslip: {
        updateMany: jest.fn(async () => {
          calls.push("slip");
          return { count: 1 };
        })
      },
      payRun: {
        updateMany: jest.fn(async () => {
          calls.push("run");
          return { count: 1 };
        })
      },
      orderFinancial: {
        updateMany: jest.fn(async () => {
          calls.push("financial");
          return { count: 1 };
        })
      }
    };
    const prisma = {
      payRun: {
        findMany: jest.fn(async () => [
          {
            id: 61,
            payslips: [{ id: 801, lines: [{ sourceType: "order", orderId: 1001 }] }]
          }
        ])
      },
      bookingOrder: {
        findMany: jest.fn(async () => [
          { id: 1001, serviceSnapshotJson: { namespace: "lifedance_real_ops_v1" } }
        ])
      },
      $transaction: jest.fn(async (work: (tx: typeof transaction) => Promise<void>) =>
        work(transaction)
      )
    };

    await expect(resetLifeDancePayrollPeriods(prisma as never, 16)).resolves.toBe(1);
    expect(calls).toEqual(["payout", "line", "slip", "run", "financial"]);
    expect(transaction.orderFinancial.updateMany).toHaveBeenCalledWith({
      where: {
        bookingOrderId: { in: [1001] },
        settlementStatus: { in: ["payroll_approved", "settled"] },
        deletedAt: null
      },
      data: { settlementStatus: "ready_for_payroll" }
    });
  });
});
