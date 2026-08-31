import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  EmployeePayrollScheduleOverridePayload,
  ShopPayrollSchedulePolicyPayload
} from "../src/domain/payroll-schedule-policy";
import {
  PayrollSchedulePolicyService,
  type PayrollSchedulePolicyRepositoryPort
} from "../src/services/payroll-schedule-policy.service";
import type { AuditLogRecordInput } from "../src/services/audit-log.service";

const context = { ip: "127.0.0.1", userAgent: "jest" };
const actor = {
  userId: 7,
  email: "finance@lifedance.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityType: "merchant_staff",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 16,
  roles: ["merchant_finance"],
  permissions: ["merchant-admin:payroll:read", "merchant-admin:payroll:write"]
};

const shopPolicy: ShopPayrollSchedulePolicyPayload = {
  id: 3,
  shopId: 16,
  cadence: "monthly",
  weeklySettlementWeekday: null,
  monthlySettlementDay: 31,
  holidayAdjustment: "next_business_day",
  timezone: "Asia/Tokyo",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  status: "active",
  version: 3,
  createdById: 7,
  updatedById: 7,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const employeeOverride: EmployeePayrollScheduleOverridePayload = {
  id: 4,
  technicianShopAffiliationId: 47,
  inheritShopPolicy: false,
  cadence: "weekly",
  weeklySettlementWeekday: 5,
  monthlySettlementDay: null,
  holidayAdjustment: "previous_business_day",
  timezone: "Asia/Tokyo",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  status: "active",
  version: 2,
  createdById: 7,
  updatedById: 7,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const createRepository = (): jest.Mocked<PayrollSchedulePolicyRepositoryPort> =>
  ({
    findActiveShopPolicy: jest.fn(async () => shopPolicy),
    replaceShopPolicy: jest.fn(async () => ({ ...shopPolicy, version: 4 })),
    findCurrentEmployeeAffiliation: jest.fn(async () => ({
      id: 47,
      technicianProfileId: 71
    })),
    findActiveEmployeeOverride: jest.fn(async () => null),
    replaceEmployeeOverride: jest.fn(async () => employeeOverride),
    listNonBusinessDateKeys: jest.fn(async () => [])
  }) as unknown as jest.Mocked<PayrollSchedulePolicyRepositoryPort>;

describe("PayrollSchedulePolicyService", () => {
  it("returns the effective shop policy and a backend-calculated payment preview", async () => {
    const repository = createRepository();
    repository.listNonBusinessDateKeys.mockResolvedValue(["2026-08-31"]);
    const service = new PayrollSchedulePolicyService(
      repository,
      { record: jest.fn() },
      () => "2026-08-29"
    );

    const result = await service.getShopPolicy(actor, context, "2026-08-29");

    expect(result.configured).toBe(true);
    expect(result.source).toBe("shop");
    expect(result.effectivePolicy?.version).toBe(3);
    expect(result.preview).toMatchObject({
      naturalSettlementDate: "2026-08-31",
      plannedPaymentDate: "2026-09-01",
      adjustmentReason: "public_holiday"
    });
    expect(repository.listNonBusinessDateKeys).toHaveBeenCalledWith(
      "JP",
      "2026-08-17",
      "2026-09-14"
    );
  });

  it("inherits the shop policy when the employee has no individual override", async () => {
    const service = new PayrollSchedulePolicyService(
      createRepository(),
      { record: jest.fn() },
      () => "2026-08-29"
    );

    const result = await service.getEmployeePolicy(actor, context, "s0000000047", "2026-08-29");

    expect(result.source).toBe("shop");
    expect(result.inheritShopPolicy).toBe(true);
    expect(result.employeeOverride).toBeNull();
    expect(result.effectivePolicy?.cadence).toBe("monthly");
  });

  it("uses an employee override only inside the employee's current shop affiliation", async () => {
    const repository = createRepository();
    repository.findActiveEmployeeOverride.mockResolvedValue(employeeOverride);
    const service = new PayrollSchedulePolicyService(
      repository,
      { record: jest.fn() },
      () => "2026-08-29"
    );

    const result = await service.getEmployeePolicy(actor, context, "s0000000047", "2026-08-29");

    expect(result.source).toBe("employee_override");
    expect(result.effectivePolicy?.cadence).toBe("weekly");
    expect(result.preview?.naturalSettlementDate).toBe("2026-09-04");
    expect(repository.findActiveEmployeeOverride).toHaveBeenCalledWith(47, "2026-08-29");
  });

  it("fails closed when the technician is not currently affiliated to the JWT shop", async () => {
    const repository = createRepository();
    repository.findCurrentEmployeeAffiliation.mockResolvedValue(null);
    const service = new PayrollSchedulePolicyService(
      repository,
      { record: jest.fn() },
      () => "2026-08-29"
    );

    await expect(
      service.getEmployeePolicy(actor, context, "s0000000099", "2026-08-29")
    ).rejects.toMatchObject({
      code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
      statusCode: 404
    });
  });

  it("versions a shop policy and records only policy metadata in audit", async () => {
    const repository = createRepository();
    const audit = {
      record: jest.fn(async (input: AuditLogRecordInput) => {
        void input;
      })
    };
    const service = new PayrollSchedulePolicyService(repository, audit, () => "2026-08-29");
    const body = {
      cadence: "weekly" as const,
      weeklySettlementWeekday: 5,
      monthlySettlementDay: null,
      holidayAdjustment: "previous_business_day" as const,
      timezone: "Asia/Tokyo" as const,
      effectiveFrom: "2026-08-29",
      effectiveTo: null
    };

    await service.updateShopPolicy(actor, context, body);

    expect(repository.replaceShopPolicy).toHaveBeenCalledWith(16, body, 7);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.payroll_schedule_policy.update",
        targetType: "shop",
        targetId: 16,
        metadata: expect.objectContaining({ cadence: "monthly", version: 4 })
      })
    );
    const recorded = audit.record.mock.calls[0]?.[0] as { metadata?: unknown } | undefined;
    expect(JSON.stringify(recorded?.metadata)).not.toContain("finance@lifedance.com");
  });

  it("rejects access without an active shop identity scope", async () => {
    const service = new PayrollSchedulePolicyService(
      createRepository(),
      { record: jest.fn() },
      () => "2026-08-29"
    );

    await expect(
      service.getShopPolicy(
        { ...actor, currentIdentityScopeType: "platform", currentIdentityScopeId: 1 },
        context,
        "2026-08-29"
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
  });
});
