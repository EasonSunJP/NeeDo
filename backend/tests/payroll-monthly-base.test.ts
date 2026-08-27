import type {
  PayRunDraftSaveInput,
  PayRunPayload,
  PayrollOrderFinancialSource,
  PayrollRepositoryPort
} from "../src/services/payroll.service";
import { PayrollService } from "../src/services/payroll.service";

const merchantActor = {
  userId: 1,
  email: "admin@lifedance.com",
  accessTokenJti: "lifedance-payroll-test",
  accessTokenExpiresAt: Date.now() + 900_000,
  currentIdentityId: 10,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 16,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:payroll:write"]
};

const compensationRule = {
  id: 301,
  sourceType: "technician_override" as const,
  shopId: 16,
  technicianProfileId: 170,
  name: "LifeDance 正社員給与",
  wageMode: "base_plus_commission" as const,
  baseSalaryJpy: 230_000,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 0,
  commissionRatePercent: 20,
  guaranteedMinimumJpy: 0,
  ndpFeeBearer: "shop" as const,
  technicianNdpSharePercent: 0,
  bonusRules: [],
  deductionRules: []
};

const sourceOrders: PayrollOrderFinancialSource[] = [1, 2].map((sequence) => ({
  bookingOrderId: 1_000 + sequence,
  orderNo: `LD2026-000${sequence}`,
  shopId: 16,
  shopName: "LifeDance Wellness 渋谷",
  technicianProfileId: 170,
  technicianName: "佐藤 美咲",
  technicianUserId: 70,
  serviceName: "ボディケア 60分",
  completedAt: `2026-06-${String(10 + sequence).padStart(2, "0")}T03:00:00.000Z`,
  workedMinutes: 60,
  serviceAmountJpy: 10_000,
  bPlatformFeeActualNdp: 500,
  serviceIncomeStatus: "confirmed" as const,
  compensationRule
}));

describe("PayrollService monthly base salary", () => {
  it("adds one monthly rule line while retaining one source line per completed order", async () => {
    let savedDraft: PayRunDraftSaveInput | null = null;
    const repository = {
      findPayrollSourceOrders: jest.fn(async () => sourceOrders),
      listApprovedPayrollAdjustments: jest.fn(async () => []),
      savePayRunDraft: jest.fn(async (input: PayRunDraftSaveInput) => {
        savedDraft = input;
        return {
          ...input,
          id: 61,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z"
        } as PayRunPayload;
      })
    } as unknown as PayrollRepositoryPort;
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PayrollService(repository, auditLogService);

    await service.generateMerchantPayRun(
      merchantActor,
      { ip: "127.0.0.1", userAgent: "jest" },
      {
        shopId: 16,
        periodStart: new Date("2026-05-31T15:00:00.000Z"),
        periodEnd: new Date("2026-06-30T14:59:59.999Z"),
        manualLines: []
      }
    );

    expect(savedDraft).not.toBeNull();
    const payslip = savedDraft!.payslips[0]!;
    expect(payslip.baseSalaryJpy).toBe(230_000);
    expect(payslip.commissionJpy).toBe(4_000);
    expect(payslip.netPayJpy).toBe(234_000);
    expect(payslip.lines.filter((line) => line.lineType === "base_salary")).toEqual([
      expect.objectContaining({
        amountJpy: 230_000,
        sourceType: "rule",
        sourceId: compensationRule.id,
        orderId: null
      })
    ]);
    expect(payslip.lines.filter((line) => line.sourceType === "order")).toHaveLength(2);
  });
});
