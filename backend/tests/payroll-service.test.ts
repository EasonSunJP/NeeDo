import type {
  PayRunPayload,
  PayrollOrderFinancialSource,
  PayrollRepositoryPort,
  PayslipPayload
} from "../src/services/payroll.service";
import { PayrollService } from "../src/services/payroll.service";

const now = new Date("2026-06-03T00:00:00.000Z");

const actor = {
  userId: 2,
  email: "merchant@example.com",
  accessTokenJti: "payroll-service-token",
  accessTokenExpiresAt: Date.now() + 900_000,
  currentIdentityId: 20,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:payroll:write"]
};

const context = {
  ip: "127.0.0.1",
  userAgent: "jest",
  requestId: "payroll-service-test"
};

const compensationRule = {
  id: 8,
  sourceType: "technician_override" as const,
  shopId: 11,
  technicianProfileId: 21,
  name: "Misaki hybrid compensation",
  wageMode: "base_plus_commission" as const,
  baseSalaryJpy: 0,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 1000,
  commissionRatePercent: 50,
  guaranteedMinimumJpy: 0,
  ndpFeeBearer: "split" as const,
  technicianNdpSharePercent: 30,
  bonusRules: [
    {
      id: "monthly-2",
      name: "月2单奖金",
      triggerType: "monthly_order_count" as const,
      threshold: 2,
      amountJpy: 500,
      active: true
    }
  ],
  deductionRules: []
};

const sourceOrders: PayrollOrderFinancialSource[] = [
  {
    bookingOrderId: 101,
    orderNo: "BK-20260603-0001",
    shopId: 11,
    shopName: "GINZA Calm Body Lab",
    technicianProfileId: 21,
    technicianName: "Misaki",
    serviceName: "Aroma Treatment",
    completedAt: "2026-06-03T11:00:00.000Z",
    workedMinutes: 60,
    serviceAmountJpy: 8800,
    bPlatformFeeActualNdp: 500,
    serviceIncomeStatus: "confirmed",
    compensationRule
  },
  {
    bookingOrderId: 102,
    orderNo: "BK-20260604-0002",
    shopId: 11,
    shopName: "GINZA Calm Body Lab",
    technicianProfileId: 21,
    technicianName: "Misaki",
    serviceName: "Head Spa",
    completedAt: "2026-06-04T12:00:00.000Z",
    workedMinutes: 45,
    serviceAmountJpy: 12000,
    bPlatformFeeActualNdp: 300,
    serviceIncomeStatus: "reported",
    compensationRule
  }
];

const approvedAdjustment = {
  id: 501,
  shopId: 11,
  shopName: "GINZA Calm Body Lab",
  technicianProfileId: 21,
  technicianName: "Misaki",
  technicianUserId: 31,
  periodStart: "2026-06-01T00:00:00.000Z",
  periodEnd: "2026-06-30T23:59:59.000Z",
  adjustmentType: "bonus" as const,
  title: "客户好评奖金",
  amountJpy: 1200,
  reason: "本周期收到 5 星好评",
  proofUrl: null,
  status: "approved" as const,
  requestedById: 2,
  submittedAt: "2026-06-20T00:00:00.000Z",
  approvedById: 2,
  approvedAt: "2026-06-21T00:00:00.000Z",
  rejectedById: null,
  rejectedAt: null,
  rejectionReason: null,
  appliedPayRunId: null,
  appliedPayslipLineId: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
};

type PayrollRepositoryMock = jest.Mocked<PayrollRepositoryPort> & {
  listApprovedPayrollAdjustments: jest.Mock;
  createPayrollAdjustment: jest.Mock;
  resolvePayslipDispute: jest.Mock;
  confirmPayoutRecord: jest.Mock;
  hasClosedPayRunForPeriod: jest.Mock;
};

const createRepository = (
  adjustments = [] as (typeof approvedAdjustment)[]
): PayrollRepositoryMock => {
  let draft: PayRunPayload = {
    id: 9001,
    shopId: 11,
    shopName: "GINZA Calm Body Lab",
    periodStart: "2026-06-01T00:00:00.000Z",
    periodEnd: "2026-06-30T23:59:59.000Z",
    status: "draft" as const,
    totalBaseSalaryJpy: 2000,
    totalCommissionJpy: 10400,
    totalBonusJpy: 500,
    totalAllowanceJpy: 0,
    totalDeductionJpy: 240,
    totalNetPayJpy: 12660,
    paidAmountJpy: 0,
    unpaidAmountJpy: 12660,
    generatedById: 2,
    approvedById: null,
    lockedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    payslips: [
      {
        id: 8001,
        payRunId: 9001,
        shopId: 11,
        shopName: "GINZA Calm Body Lab",
        technicianProfileId: 21,
        technicianName: "Misaki",
        technicianUserId: 31,
        compensationProfileId: 8,
        periodStart: "2026-06-01T00:00:00.000Z",
        periodEnd: "2026-06-30T23:59:59.000Z",
        status: "draft" as const,
        disputeStatus: "none" as const,
        disputeReason: null,
        baseSalaryJpy: 2000,
        annualSalaryProratedJpy: 0,
        dailyWageJpy: 0,
        hourlyWageJpy: 0,
        commissionJpy: 10400,
        guaranteeTopupJpy: 0,
        bonusJpy: 500,
        allowanceJpy: 0,
        deductionJpy: 240,
        platformFeeShareDeductionJpy: 240,
        netPayJpy: 12660,
        paidAmountJpy: 0,
        unpaidAmountJpy: 12660,
        confirmedAt: null,
        disputedAt: null,
        disputeResolvedAt: null,
        disputeResolvedById: null,
        disputeResolutionNote: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        lines: [],
        payoutRecords: [
          {
            id: 7001,
            payslipId: 8001,
            shopId: 11,
            technicianProfileId: 21,
            amountJpy: 12660,
            payoutMethod: "bank_transfer" as const,
            payoutDate: "2026-07-10T00:00:00.000Z",
            referenceNo: "BANK-20260710-001",
            proofUrl: null,
            note: "7月工资",
            status: "completed" as const,
            confirmedByTechnician: false,
            technicianConfirmedAt: null,
            createdById: 2,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
          }
        ]
      }
    ]
  };

  return {
    listMerchantPayRuns: jest.fn(),
    listBackofficePayRuns: jest.fn(),
    listTechnicianPayslips: jest.fn(),
    findPayRunDetail: jest.fn(async () => draft),
    findPayslipDetail: jest.fn(async () => draft.payslips[0] ?? null),
    findPayrollSourceOrders: jest.fn(async () => sourceOrders),
    listApprovedPayrollAdjustments: jest.fn(async () => adjustments),
    savePayRunDraft: jest.fn(async (input) => {
      draft = {
        ...draft,
        ...input,
        id: draft.id,
        status: "draft",
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt
      };
      return draft;
    }),
    transitionPayRun: jest.fn(async (input) => {
      const nextPayslipStatus =
        input.status === "published" && draft.payslips[0]?.status === "draft"
          ? "published"
          : input.status === "approved" || input.status === "locked"
            ? input.status
            : draft.payslips[0]?.status;
      draft = {
        ...draft,
        status: input.status,
        approvedById: input.approvedById ?? draft.approvedById,
        lockedAt: input.lockedAt ?? draft.lockedAt,
        payslips: draft.payslips.map((payslip) => ({
          ...payslip,
          status: nextPayslipStatus ?? payslip.status
        }))
      };
      return draft;
    }),
    applyPayrollAdjustments: jest.fn(async () => undefined),
    transitionPayslip: jest.fn(async (input) => {
      const nextPayslip = {
        ...draft.payslips[0]!,
        status: input.status,
        disputeStatus: input.disputeStatus ?? draft.payslips[0]!.disputeStatus,
        disputeReason: input.disputeReason ?? draft.payslips[0]!.disputeReason,
        confirmedAt: input.confirmedAt ?? draft.payslips[0]!.confirmedAt,
        disputedAt: input.disputedAt ?? draft.payslips[0]!.disputedAt
      };
      draft = {
        ...draft,
        status: input.status === "confirmed" || input.status === "disputed" ? input.status : draft.status,
        payslips: [nextPayslip]
      };
      return nextPayslip;
    }),
    addPayoutRecord: jest.fn(async (input) => {
      const nextPayslip: PayslipPayload = {
        ...draft.payslips[0]!,
        status: input.nextPayslipStatus,
        paidAmountJpy: input.nextPaidAmountJpy,
        unpaidAmountJpy: input.nextUnpaidAmountJpy,
        payoutRecords: [
        {
          id: 7001,
          payslipId: 8001,
          shopId: 11,
          technicianProfileId: 21,
          amountJpy: input.amountJpy,
          payoutMethod: input.payoutMethod,
          payoutDate: input.payoutDate,
          referenceNo: input.referenceNo,
          proofUrl: input.proofUrl,
          note: input.note,
          status: "completed" as const,
          confirmedByTechnician: false,
          technicianConfirmedAt: null,
          createdById: 2,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        }
        ]
      };
      draft = {
        ...draft,
        paidAmountJpy: input.nextPaidAmountJpy,
        unpaidAmountJpy: input.nextUnpaidAmountJpy,
        status: input.nextUnpaidAmountJpy === 0 ? "paid" : "scheduled",
        payslips: [nextPayslip]
      };
      return nextPayslip;
    }),
    resolvePayslipDispute: jest.fn(async (input) => {
      const nextPayslip: PayslipPayload = {
        ...draft.payslips[0]!,
        status: input.status,
        disputeStatus: input.disputeStatus,
        disputeResolvedById: input.disputeResolvedById,
        disputeResolvedAt: input.disputeResolvedAt,
        disputeResolutionNote: input.disputeResolutionNote
      };
      draft = { ...draft, status: "published", payslips: [nextPayslip] };
      return nextPayslip;
    }),
    confirmPayoutRecord: jest.fn(async (input) => {
      const nextPayslip: PayslipPayload = {
        ...draft.payslips[0]!,
        payoutRecords: [
        {
          id: input.payoutRecordId,
          payslipId: 8001,
          shopId: 11,
          technicianProfileId: 21,
          amountJpy: 12660,
          payoutMethod: "bank_transfer",
          payoutDate: "2026-07-10T00:00:00.000Z",
          referenceNo: "BANK-20260710-001",
          proofUrl: null,
          note: null,
          status: "completed" as const,
          confirmedByTechnician: true,
          technicianConfirmedAt: input.technicianConfirmedAt,
          createdById: 2,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        }
        ]
      };
      draft = { ...draft, payslips: [nextPayslip] };
      return nextPayslip;
    }),
    createPayrollAdjustment: jest.fn(async (input) => ({
      ...approvedAdjustment,
      ...input,
      status: "draft" as const,
      submittedAt: null,
      approvedById: null,
      approvedAt: null,
      rejectedById: null,
      rejectedAt: null,
      rejectionReason: null
    })),
    hasClosedPayRunForPeriod: jest.fn(async () => false)
  } as unknown as PayrollRepositoryMock;
};

describe("PayrollService", () => {
  it("generates a draft pay run with traceable payslip lines from confirmed booking finance", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);

    const draft = await service.generateMerchantPayRun(actor, context, {
      shopId: 11,
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodEnd: new Date("2026-06-30T23:59:59.000Z"),
      manualLines: [
        {
          technicianProfileId: 21,
          lineType: "bonus",
          title: "店铺手动奖金",
          amountJpy: 300,
          explanation: "月度表现奖励"
        }
      ]
    });

    expect(repository.findPayrollSourceOrders).toHaveBeenCalledWith({
      shopId: 11,
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.000Z"
    });
    expect(repository.savePayRunDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 11,
        totalBaseSalaryJpy: 2000,
        totalCommissionJpy: 10400,
        totalBonusJpy: 1300,
        totalDeductionJpy: 240,
        totalNetPayJpy: 13460
      })
    );
    expect(draft.payslips[0]?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineType: "commission",
          sourceType: "order",
          sourceId: 101,
          amountJpy: 4400
        }),
        expect.objectContaining({
          lineType: "platform_fee_share_deduction",
          sourceType: "order",
          sourceId: 102,
          amountJpy: -90
        }),
        expect.objectContaining({
          lineType: "bonus",
          sourceType: "manual",
          amountJpy: 300
        })
      ])
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.payroll.generate",
        targetType: "pay_run"
      })
    );
  });

  it("blocks recalculation after publish and resolves disputes before technician confirmation", async () => {
    const repository = createRepository([approvedAdjustment]);
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);

    await service.publishMerchantPayRun(actor, context, 9001);
    await expect(service.recalculateMerchantPayRun(actor, context, 9001)).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.pay_run_not_recalculable"
    });

    const disputed = await service.disputeTechnicianPayslip(
      {
        ...actor,
        currentIdentityType: "technician",
        currentIdentityScopeType: "technician",
        currentIdentityScopeId: 21,
        permissions: ["technician:payslip:dispute"]
      },
      context,
      8001,
      { reason: "现金收款金额需要复核" }
    );
    expect(disputed).toMatchObject({
      status: "disputed",
      disputeStatus: "disputed",
      disputeReason: "现金收款金额需要复核"
    });

    await expect(
      service.confirmTechnicianPayslip(
        {
          ...actor,
          currentIdentityType: "technician",
          currentIdentityScopeType: "technician",
          currentIdentityScopeId: 21,
          permissions: ["technician:payslip:confirm"]
        },
        context,
        8001
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.payslip_not_confirmable"
    });

    const resolved = await service.resolveMerchantPayslipDispute(actor, context, 8001, {
      resolutionNote: "已按现金收据复核并重新发布"
    });
    expect(resolved).toMatchObject({
      status: "published",
      disputeStatus: "resolved",
      disputeResolvedById: 2,
      disputeResolutionNote: "已按现金收据复核并重新发布"
    });
    expect(repository.resolvePayslipDispute).toHaveBeenCalledWith(
      expect.objectContaining({
        payslipId: 8001,
        status: "published",
        disputeStatus: "resolved"
      })
    );
  });

  it("accepts seeded technician_profile identity scope for technician payslip lists", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);
    repository.listTechnicianPayslips.mockResolvedValue({
      list: [],
      total: 1,
      page: 1,
      page_size: 20
    });

    await service.listTechnicianPayslips(
      {
        ...actor,
        currentIdentityType: "technician",
        currentIdentityScopeType: "technician_profile",
        currentIdentityScopeId: 21,
        permissions: ["technician:payslip:read"]
      },
      context,
      { page: 1, pageSize: 20 }
    );

    expect(repository.listTechnicianPayslips).toHaveBeenCalledWith(21, {
      page: 1,
      pageSize: 20
    });
  });

  it("includes approved bonus and deduction adjustment requests in the draft payslip", async () => {
    const repository = createRepository([approvedAdjustment]);
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);

    const draft = await service.generateMerchantPayRun(actor, context, {
      shopId: 11,
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodEnd: new Date("2026-06-30T23:59:59.000Z"),
      manualLines: []
    });

    expect(repository.listApprovedPayrollAdjustments).toHaveBeenCalledWith({
      shopId: 11,
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.000Z"
    });
    expect(repository.savePayRunDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        totalBonusJpy: 2200,
        totalNetPayJpy: 14360
      })
    );
    expect(draft.payslips[0]?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineType: "bonus",
          sourceType: "adjustment",
          sourceId: 501,
          title: "客户好评奖金",
          amountJpy: 1200
        })
      ])
    );
  });

  it("allows payout records only after approval and requires full payment before lock", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);

    await expect(
      service.recordMerchantPayout(actor, context, 8001, {
        amountJpy: 12660,
        payoutMethod: "bank_transfer",
        payoutDate: new Date("2026-07-10T00:00:00.000Z"),
        referenceNo: "BANK-20260710-001",
        proofUrl: "https://example.test/payroll/proof",
        note: "7月工资"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.payslip_not_payable"
    });

    await expect(service.lockMerchantPayRun(actor, context, 9001)).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.pay_run_not_fully_paid"
    });
  });

  it("blocks overpayment and additional payouts after paid or locked states", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);
    const technicianActor = {
      ...actor,
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician",
      currentIdentityScopeId: 21,
      permissions: ["technician:payslip:confirm"]
    };

    await service.publishMerchantPayRun(actor, context, 9001);
    await service.confirmTechnicianPayslip(technicianActor, context, 8001);
    await service.approveMerchantPayRun(actor, context, 9001);

    await expect(
      service.recordMerchantPayout(actor, context, 8001, {
        amountJpy: 12661,
        payoutMethod: "bank_transfer",
        payoutDate: new Date("2026-07-10T00:00:00.000Z"),
        referenceNo: "BANK-20260710-OVER",
        proofUrl: null,
        note: "超付"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.invalid_payout_amount"
    });

    await service.recordMerchantPayout(actor, context, 8001, {
      amountJpy: 12660,
      payoutMethod: "bank_transfer",
      payoutDate: new Date("2026-07-10T00:00:00.000Z"),
      referenceNo: "BANK-20260710-001",
      proofUrl: null,
      note: "7月工资"
    });

    await expect(
      service.recordMerchantPayout(actor, context, 8001, {
        amountJpy: 1,
        payoutMethod: "cash",
        payoutDate: new Date("2026-07-11T00:00:00.000Z"),
        referenceNo: null,
        proofUrl: null,
        note: "重复支付"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.payslip_not_payable"
    });

    await service.lockMerchantPayRun(actor, context, 9001);

    await expect(
      service.recordMerchantPayout(actor, context, 8001, {
        amountJpy: 1,
        payoutMethod: "cash",
        payoutDate: new Date("2026-07-12T00:00:00.000Z"),
        referenceNo: null,
        proofUrl: null,
        note: "锁定后支付"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.payslip_not_payable"
    });
    expect(repository.addPayoutRecord).toHaveBeenCalledTimes(1);
  });

  it("blocks payslip confirmation and disputes after the payslip is paid or locked", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);
    const technicianActor = {
      ...actor,
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician",
      currentIdentityScopeId: 21,
      permissions: ["technician:payslip:confirm", "technician:payslip:dispute"]
    };

    await service.publishMerchantPayRun(actor, context, 9001);
    await service.confirmTechnicianPayslip(technicianActor, context, 8001);
    await service.approveMerchantPayRun(actor, context, 9001);
    await service.recordMerchantPayout(actor, context, 8001, {
      amountJpy: 12660,
      payoutMethod: "bank_transfer",
      payoutDate: new Date("2026-07-10T00:00:00.000Z"),
      referenceNo: "BANK-20260710-001",
      proofUrl: null,
      note: "7月工资"
    });

    await expect(
      service.confirmTechnicianPayslip(technicianActor, context, 8001)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.payslip_not_confirmable"
    });
    await expect(
      service.disputeTechnicianPayslip(technicianActor, context, 8001, {
        reason: "支付后申诉"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.payslip_not_disputable"
    });

    await service.lockMerchantPayRun(actor, context, 9001);

    await expect(
      service.confirmTechnicianPayslip(technicianActor, context, 8001)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.payslip_not_confirmable"
    });
    await expect(
      service.disputeTechnicianPayslip(technicianActor, context, 8001, {
        reason: "锁定后申诉"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.payslip_not_disputable"
    });
  });

  it("blocks payroll adjustment requests after the payroll period is closed", async () => {
    const repository = createRepository();
    repository.hasClosedPayRunForPeriod.mockResolvedValueOnce(true);
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);

    await expect(
      service.createMerchantPayrollAdjustment(actor, context, {
        shopId: 11,
        technicianProfileId: 21,
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
        periodEnd: new Date("2026-06-30T23:59:59.000Z"),
        adjustmentType: "bonus",
        title: "锁定后补贴",
        amountJpy: 1000,
        reason: "工资周期已关闭",
        proofUrl: null
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll_adjustment.period_closed"
    });
    expect(repository.createPayrollAdjustment).not.toHaveBeenCalled();
  });

  it("blocks merchant approval while a payslip has an unresolved dispute", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);
    await service.publishMerchantPayRun(actor, context, 9001);
    await service.disputeTechnicianPayslip(
      {
        ...actor,
        currentIdentityType: "technician",
        currentIdentityScopeType: "technician",
        currentIdentityScopeId: 21,
        permissions: ["technician:payslip:dispute"]
      },
      context,
      8001,
      { reason: "线下收入需要复核" }
    );

    await expect(service.approveMerchantPayRun(actor, context, 9001)).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.pay_run_has_unresolved_dispute"
    });
  });

  it("lets technicians confirm their payout record after the merchant records payment", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);
    const technicianActor = {
      ...actor,
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician",
      currentIdentityScopeId: 21,
      permissions: ["technician:payout-record:confirm"]
    };

    await service.publishMerchantPayRun(actor, context, 9001);
    await service.confirmTechnicianPayslip(technicianActor, context, 8001);
    await service.approveMerchantPayRun(actor, context, 9001);
    await service.recordMerchantPayout(actor, context, 8001, {
      amountJpy: 12660,
      payoutMethod: "bank_transfer",
      payoutDate: new Date("2026-07-10T00:00:00.000Z"),
      referenceNo: "BANK-20260710-001",
      proofUrl: "https://example.test/payroll/proof",
      note: "7月工资"
    });

    const confirmed = await service.confirmTechnicianPayoutRecord(
      technicianActor,
      context,
      8001,
      7001
    );

    expect(confirmed.payoutRecords[0]).toMatchObject({
      id: 7001,
      confirmedByTechnician: true
    });
    expect(confirmed.payoutRecords[0]?.technicianConfirmedAt).toEqual(expect.any(String));
    expect(repository.confirmPayoutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        payslipId: 8001,
        payoutRecordId: 7001,
        technicianProfileId: 21
      })
    );
  });

  it("blocks technician payout confirmation after the pay run is locked", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);
    const technicianActor = {
      ...actor,
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician",
      currentIdentityScopeId: 21,
      permissions: ["technician:payout-record:confirm"]
    };

    await service.publishMerchantPayRun(actor, context, 9001);
    await service.confirmTechnicianPayslip(technicianActor, context, 8001);
    await service.approveMerchantPayRun(actor, context, 9001);
    await service.recordMerchantPayout(actor, context, 8001, {
      amountJpy: 12660,
      payoutMethod: "bank_transfer",
      payoutDate: new Date("2026-07-10T00:00:00.000Z"),
      referenceNo: "BANK-20260710-001",
      proofUrl: null,
      note: "7月工资"
    });
    await service.lockMerchantPayRun(actor, context, 9001);

    await expect(
      service.confirmTechnicianPayoutRecord(technicianActor, context, 8001, 7001)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.payroll.payout_record_not_confirmable"
    });
    expect(repository.confirmPayoutRecord).not.toHaveBeenCalled();
  });
});
