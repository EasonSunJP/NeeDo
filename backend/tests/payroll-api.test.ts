import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import type {
  PayRunPayload,
  PayrollRepositoryPort,
  PayslipPayload
} from "../src/services/payroll.service";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();
  private readonly failureCounts = new Map<string, number>();

  public async getLoginLock(email: string): Promise<boolean> {
    return this.getValue(`login:lock:${email}`) !== null;
  }

  public async recordFailedLogin(
    ip: string,
    email: string,
    options: { failureLimit: number; windowSeconds: number; lockSeconds: number }
  ): Promise<{ count: number; locked: boolean }> {
    const key = `login:fail:${ip}:${email}`;
    const nextCount = (this.failureCounts.get(key) ?? 0) + 1;
    this.failureCounts.set(key, nextCount);
    this.setValue(key, String(nextCount), options.windowSeconds);
    if (nextCount >= options.failureLimit) {
      this.setValue(`login:lock:${email}`, "1", options.lockSeconds);
      return { count: nextCount, locked: true };
    }
    return { count: nextCount, locked: false };
  }

  public async clearFailedLogin(ip: string, email: string): Promise<void> {
    this.failureCounts.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:lock:${email}`);
  }

  public async storeOtp(email: string, otp: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:${email}`, otp, ttlSeconds);
  }

  public async getOtp(email: string): Promise<string | null> {
    return this.getValue(`otp:${email}`);
  }

  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
  }

  public async hasOtpCooldown(email: string): Promise<boolean> {
    return this.getValue(`otp:cooldown:${email}`) !== null;
  }

  public async storeOtpCooldown(email: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:cooldown:${email}`, "1", ttlSeconds);
  }

  public async clearOtpCooldown(email: string): Promise<void> {
    this.values.delete(`otp:cooldown:${email}`);
  }

  public async storeRefreshToken(userId: number, jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`refresh:${userId}:${jti}`, "1", ttlSeconds);
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.getValue(`refresh:${userId}:${jti}`) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`refresh:${userId}:${jti}`);
  }

  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`token:blacklist:${jti}`, "1", ttlSeconds);
  }

  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.getValue(`token:blacklist:${jti}`) !== null;
  }

  private setValue(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  private getValue(key: string): string | null {
    const stored = this.values.get(key);
    if (!stored) {
      return null;
    }
    if (stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return stored.value;
  }
}

const now = new Date("2026-06-03T00:00:00.000Z");

const makePermission = (code: string, index: number) => ({
  id: index + 1,
  name: code,
  code,
  type: code.startsWith("menu:") ? "menu" : "api",
  module: code.split(":")[0],
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const payRunDetail: PayRunPayload = {
  id: 9001,
  shopId: 11,
  shopName: "GINZA Calm Body Lab",
  periodStart: "2026-06-01T00:00:00.000Z",
  periodEnd: "2026-06-30T23:59:59.000Z",
  status: "draft" as const,
  totalBaseSalaryJpy: 2000,
  totalCommissionJpy: 10400,
  totalBonusJpy: 800,
  totalAllowanceJpy: 0,
  totalDeductionJpy: 240,
  totalNetPayJpy: 12960,
  paidAmountJpy: 0,
  unpaidAmountJpy: 12960,
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
      status: "published" as const,
      disputeStatus: "none" as const,
      disputeReason: null,
      baseSalaryJpy: 2000,
      annualSalaryProratedJpy: 0,
      dailyWageJpy: 0,
      hourlyWageJpy: 0,
      commissionJpy: 10400,
      guaranteeTopupJpy: 0,
      bonusJpy: 800,
      allowanceJpy: 0,
      deductionJpy: 240,
      platformFeeShareDeductionJpy: 240,
      netPayJpy: 12960,
      paidAmountJpy: 0,
      unpaidAmountJpy: 12960,
      confirmedAt: null,
      disputedAt: null,
      disputeResolvedAt: null,
      disputeResolvedById: null,
      disputeResolutionNote: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lines: [
        {
          id: 1,
          payslipId: 8001,
          lineType: "commission",
          title: "BK-20260603-0001 分成",
          amountJpy: 4400,
          quantity: 1,
          unitAmountJpy: 4400,
          formulaText: "8800 x 50%",
          sourceType: "order",
          sourceId: 101,
          ruleId: "8",
          orderId: 101,
          explanation: "Aroma Treatment",
          createdById: 2,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        }
      ],
      payoutRecords: [
        {
          id: 7001,
          payslipId: 8001,
          shopId: 11,
          technicianProfileId: 21,
          amountJpy: 12960,
          payoutMethod: "bank_transfer",
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

const payrollAdjustment = {
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
  status: "draft" as const,
  requestedById: 2,
  submittedAt: null,
  approvedById: null,
  approvedAt: null,
  rejectedById: null,
  rejectedAt: null,
  rejectionReason: null,
  appliedPayRunId: null,
  appliedPayslipLineId: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
};

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const permissionCodes = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "merchant-admin:payroll:read",
    "merchant-admin:payroll:write",
    "merchant-admin:payroll:publish",
    "merchant-admin:payroll:payout-record:write",
    "merchant-admin:payroll-dispute:resolve",
    "merchant-admin:payroll-adjustment:read",
    "merchant-admin:payroll-adjustment:write",
    "merchant-admin:payroll-adjustment:approve",
    "technician:payslip:read",
    "technician:payslip:confirm",
    "technician:payslip:dispute",
    "technician:payout-record:confirm",
    "backoffice:payroll:read",
    "menu:merchant-admin",
    "menu:technician-app"
  ];
  const permissions = permissionCodes.map(makePermission);
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));
  const rolePermissionsFor = (codes: string[], roleId: number, offset: number) =>
    codes.map((code, index) => ({
      id: offset + index,
      roleId,
      permissionId: permissionByCode.get(code)!.id,
      deletedAt: null,
      permission: permissionByCode.get(code)!
    }));
  const merchantRole = {
    id: 2,
    name: "Payroll",
    code: "merchant_owner",
    description: "Payroll API",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: rolePermissionsFor(
      [
        "auth:me",
        "auth:refresh",
        "auth:logout",
        "merchant-admin:payroll:read",
        "merchant-admin:payroll:write",
        "merchant-admin:payroll:publish",
        "merchant-admin:payroll:payout-record:write",
        "merchant-admin:payroll-dispute:resolve",
        "merchant-admin:payroll-adjustment:read",
        "merchant-admin:payroll-adjustment:write",
        "merchant-admin:payroll-adjustment:approve",
        "backoffice:payroll:read",
        "menu:merchant-admin"
      ],
      2,
      100
    )
  };
  const technicianRole = {
    id: 3,
    name: "Technician Payroll",
    code: "technician",
    description: "Technician payroll API",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: rolePermissionsFor(
      [
        "auth:me",
        "auth:refresh",
        "auth:logout",
        "technician:payslip:read",
        "technician:payslip:confirm",
        "technician:payslip:dispute",
        "technician:payout-record:confirm",
        "menu:technician-app"
      ],
      3,
      200
    )
  };
  const users = [
    {
      id: 2,
      email: "merchant@example.com",
      phone: null,
      passwordHash,
      username: "Merchant Owner",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 2,
          userId: 2,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 11,
          displayName: "Merchant Owner",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: merchantRole }]
    },
    {
      id: 31,
      email: "tech@example.com",
      phone: null,
      passwordHash,
      username: "Misaki",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 31,
          userId: 31,
          type: "technician",
          scopeType: "technician",
          scopeId: 21,
          displayName: "Misaki",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: technicianRole }]
    },
    {
      id: 41,
      email: "other-merchant@example.com",
      phone: null,
      passwordHash,
      username: "Other Merchant",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 41,
          userId: 41,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 99,
          displayName: "Other Merchant",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: merchantRole }]
    },
    {
      id: 42,
      email: "other-tech@example.com",
      phone: null,
      passwordHash,
      username: "Other Tech",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 42,
          userId: 42,
          type: "technician",
          scopeType: "technician",
          scopeId: 99,
          displayName: "Other Tech",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: technicianRole }]
    }
  ];
  const auditLogs: unknown[] = [];
  const authRepository = {
    findUserByEmail: jest.fn(
      async (email: string) =>
        users.find((user) => user.email === email && user.deletedAt === null) ?? null
    ),
    findUserByLoginIdentifier: jest.fn(
      async (identifier: string) =>
        users.find(
          (user) =>
            (user.email === identifier || user.username === identifier) && user.deletedAt === null
        ) ?? null
    ),
    findUserById: jest.fn(
      async (id: number) => users.find((user) => user.id === id && user.deletedAt === null) ?? null
    ),
    updateLastLoginAt: jest.fn(async (id: number, loggedInAt: Date) => {
      const user = users.find((item) => item.id === id);
      if (user) {
        user.lastLoginAt = loggedInAt;
      }
    }),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async (entry: unknown) => {
      auditLogs.push(entry);
    })
  };
  const auditLogRepository = {
    create: jest.fn(async (entry: unknown) => {
      auditLogs.push(entry);
    })
  };
  let currentPayRun = JSON.parse(JSON.stringify(payRunDetail)) as PayRunPayload;
  let currentPayrollAdjustment = payrollAdjustment;
  const payrollRepository: jest.Mocked<PayrollRepositoryPort> = {
    listMerchantPayRuns: jest.fn(async () => ({
      list: [currentPayRun],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listBackofficePayRuns: jest.fn(async () => ({
      list: [currentPayRun],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listTechnicianPayslips: jest.fn(async () => ({
      list: currentPayRun.payslips,
      total: 1,
      page: 1,
      page_size: 20
    })),
    findPayRunDetail: jest.fn(async () => currentPayRun),
    findPayslipDetail: jest.fn(async () => currentPayRun.payslips[0] ?? null),
    findPayrollSourceOrders: jest.fn(async () => []),
    savePayRunDraft: jest.fn(async () => currentPayRun),
    transitionPayRun: jest.fn(async (input) => {
      const nextPayslipStatus =
        input.status === "published" && currentPayRun.payslips[0]?.status === "draft"
          ? "published"
          : input.status === "approved" || input.status === "locked"
            ? input.status
            : currentPayRun.payslips[0]?.status;
      currentPayRun = {
        ...currentPayRun,
        status: input.status,
        approvedById: input.approvedById ?? currentPayRun.approvedById,
        lockedAt: input.lockedAt ?? currentPayRun.lockedAt,
        payslips: currentPayRun.payslips.map((payslip) => ({
          ...payslip,
          status: nextPayslipStatus ?? payslip.status
        }))
      };
      return currentPayRun;
    }),
    transitionPayslip: jest.fn(async (input) => {
      const nextPayslip: PayslipPayload = {
        ...currentPayRun.payslips[0]!,
        status: input.status,
        disputeStatus: input.disputeStatus ?? currentPayRun.payslips[0]!.disputeStatus,
        disputeReason: input.disputeReason ?? currentPayRun.payslips[0]!.disputeReason,
        confirmedAt: input.confirmedAt ?? currentPayRun.payslips[0]!.confirmedAt,
        disputedAt: input.disputedAt ?? currentPayRun.payslips[0]!.disputedAt
      };
      currentPayRun = {
        ...currentPayRun,
        status: input.status === "confirmed" || input.status === "disputed" ? input.status : currentPayRun.status,
        payslips: [nextPayslip]
      };
      return nextPayslip;
    }),
    addPayoutRecord: jest.fn(async (input) => {
      const nextPayslip: PayslipPayload = {
        ...currentPayRun.payslips[0]!,
        status: input.nextPayslipStatus,
        paidAmountJpy: input.nextPaidAmountJpy,
        unpaidAmountJpy: input.nextUnpaidAmountJpy,
        payoutRecords: currentPayRun.payslips[0]!.payoutRecords.map((record) => ({
          ...record,
          amountJpy: input.amountJpy,
          payoutMethod: input.payoutMethod,
          payoutDate: input.payoutDate,
          referenceNo: input.referenceNo,
          proofUrl: input.proofUrl,
          note: input.note,
          createdById: input.createdById
        }))
      };
      currentPayRun = {
        ...currentPayRun,
        paidAmountJpy: input.nextPaidAmountJpy,
        unpaidAmountJpy: input.nextUnpaidAmountJpy,
        status: input.nextUnpaidAmountJpy === 0 ? "paid" : "scheduled",
        payslips: [nextPayslip]
      };
      return nextPayslip;
    }),
    resolvePayslipDispute: jest.fn(async (input) => {
      const nextPayslip: PayslipPayload = {
        ...currentPayRun.payslips[0]!,
        status: input.status,
        disputeStatus: input.disputeStatus,
        disputeResolvedById: input.disputeResolvedById,
        disputeResolvedAt: input.disputeResolvedAt,
        disputeResolutionNote: input.disputeResolutionNote
      };
      currentPayRun = {
        ...currentPayRun,
        status: "published",
        payslips: [nextPayslip]
      };
      return nextPayslip;
    }),
    confirmPayoutRecord: jest.fn(async (input) => {
      const nextPayslip: PayslipPayload = {
        ...currentPayRun.payslips[0]!,
        payoutRecords: currentPayRun.payslips[0]!.payoutRecords.map((record) =>
          record.id === input.payoutRecordId
            ? {
                ...record,
                confirmedByTechnician: true,
                technicianConfirmedAt: input.technicianConfirmedAt
              }
            : record
        )
      };
      currentPayRun = { ...currentPayRun, payslips: [nextPayslip] };
      return nextPayslip;
    }),
    listMerchantPayrollAdjustments: jest.fn(async () => ({
      list: [currentPayrollAdjustment],
      total: 1,
      page: 1,
      page_size: 20
    })),
    createPayrollAdjustment: jest.fn(async (input) => {
      currentPayrollAdjustment = {
        ...payrollAdjustment,
        ...input,
        status: "draft",
        submittedAt: null,
        approvedById: null,
        approvedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null
      };
      return currentPayrollAdjustment;
    }),
    findPayrollAdjustment: jest.fn(async () => currentPayrollAdjustment),
    transitionPayrollAdjustment: jest.fn(async (input) => {
      currentPayrollAdjustment = {
        ...currentPayrollAdjustment,
        status: input.status,
        submittedAt: input.submittedAt ?? currentPayrollAdjustment.submittedAt,
        approvedById: input.approvedById ?? currentPayrollAdjustment.approvedById,
        approvedAt: input.approvedAt ?? currentPayrollAdjustment.approvedAt,
        rejectedById: input.rejectedById ?? currentPayrollAdjustment.rejectedById,
        rejectedAt: input.rejectedAt ?? currentPayrollAdjustment.rejectedAt,
        rejectionReason: input.rejectionReason ?? currentPayrollAdjustment.rejectionReason
      };
      return currentPayrollAdjustment;
    }),
    listApprovedPayrollAdjustments: jest.fn(async () => []),
    applyPayrollAdjustments: jest.fn(async () => undefined),
    hasClosedPayRunForPeriod: jest.fn(async () => false)
  } as unknown as jest.Mocked<PayrollRepositoryPort>;
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository,
    payrollRepository
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  return { app, login, payrollRepository, auditLogs };
};

describe("payroll API", () => {
  it("supports merchant pay run lifecycle and technician payslip actions", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");
    const technicianToken = await fixture.login("tech@example.com");

    const listResponse = await request(fixture.app)
      .get("/api/v1/merchant-admin/pay-runs?page=1&pageSize=20")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);
    expect(listResponse.body.data.list[0]).toMatchObject({
      id: 9001,
      totalNetPayJpy: 12960,
      unpaidAmountJpy: 12960
    });

    await request(fixture.app)
      .post("/api/v1/merchant-admin/pay-runs")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({
        shopId: 11,
        periodStart: "2026-06-01T00:00:00.000Z",
        periodEnd: "2026-06-30T23:59:59.000Z"
      })
      .expect(200);

    await request(fixture.app)
      .post("/api/v1/merchant-admin/pay-runs/9001/publish")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);

    const technicianList = await request(fixture.app)
      .get("/api/v1/technician/payslips")
      .set("Authorization", `Bearer ${technicianToken}`)
      .expect(200);
    expect(technicianList.body.data.list[0]).toMatchObject({
      id: 8001,
      technicianProfileId: 21,
      netPayJpy: 12960
    });

    const technicianExport = await request(fixture.app)
      .get("/api/v1/technician/payslips/export")
      .set("Authorization", `Bearer ${technicianToken}`)
      .expect(200);
    expect(technicianExport.body.data).toMatchObject({
      contentType: "text/csv; charset=utf-8"
    });
    expect(technicianExport.body.data.csv).toContain(
      "shop_name,technician_name,period_start,period_end,status"
    );
    expect(technicianExport.body.data.csv).toContain("Misaki");
    expect(technicianExport.body.data.csv).toContain("12960");

    const dispute = await request(fixture.app)
      .post("/api/v1/technician/payslips/8001/dispute")
      .set("Authorization", `Bearer ${technicianToken}`)
      .send({ reason: "线下收入需要复核" })
      .expect(200);
    expect(dispute.body.data).toMatchObject({
      status: "disputed",
      disputeStatus: "disputed",
      disputeReason: "线下收入需要复核"
    });

    const resolved = await request(fixture.app)
      .post("/api/v1/merchant-admin/payslips/8001/resolve-dispute")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ resolutionNote: "已复核现金收据并重新发布" })
      .expect(200);
    expect(resolved.body.data).toMatchObject({
      status: "published",
      disputeStatus: "resolved",
      disputeResolutionNote: "已复核现金收据并重新发布"
    });

    await request(fixture.app)
      .post("/api/v1/technician/payslips/8001/confirm")
      .set("Authorization", `Bearer ${technicianToken}`)
      .expect(200);

    await request(fixture.app)
      .post("/api/v1/merchant-admin/pay-runs/9001/approve")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);

    const payout = await request(fixture.app)
      .post("/api/v1/merchant-admin/payslips/8001/payout-records")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({
        amountJpy: 12960,
        payoutMethod: "bank_transfer",
        payoutDate: "2026-07-10",
        referenceNo: "BANK-20260710-001",
        proofUrl: "https://example.test/payroll/proof",
        note: "7月工资"
      })
      .expect(200);
    expect(payout.body.data).toMatchObject({
      status: "paid",
      paidAmountJpy: 12960,
      unpaidAmountJpy: 0
    });

    const payoutConfirm = await request(fixture.app)
      .post("/api/v1/technician/payslips/8001/payout-records/7001/confirm")
      .set("Authorization", `Bearer ${technicianToken}`)
      .expect(200);
    expect(payoutConfirm.body.data.payoutRecords[0]).toMatchObject({
      id: 7001,
      confirmedByTechnician: true
    });
    expect(payoutConfirm.body.data.payoutRecords[0].technicianConfirmedAt).toEqual(
      expect.any(String)
    );

    const backoffice = await request(fixture.app)
      .get("/api/v1/backoffice/pay-runs")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);
    expect(backoffice.body.data.total).toBe(1);

    const merchantExport = await request(fixture.app)
      .get("/api/v1/merchant-admin/pay-runs/export")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);
    expect(merchantExport.body.data).toMatchObject({
      contentType: "text/csv; charset=utf-8"
    });
    expect(merchantExport.body.data.csv).toContain("shop_name,period_start,period_end,status");
    expect(merchantExport.body.data.csv).toContain("GINZA Calm Body Lab");
    expect(merchantExport.body.data.csv).toContain("12960");

    const backofficeExport = await request(fixture.app)
      .get("/api/v1/backoffice/pay-runs/export")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);
    expect(backofficeExport.body.data.csv).toContain("total_net_pay_jpy");
  });

  it("supports merchant bonus adjustment request submission and approval", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");

    const created = await request(fixture.app)
      .post("/api/v1/merchant-admin/payroll-adjustments")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({
        shopId: 11,
        technicianProfileId: 21,
        periodStart: "2026-06-01T00:00:00.000Z",
        periodEnd: "2026-06-30T23:59:59.000Z",
        adjustmentType: "bonus",
        title: "客户好评奖金",
        amountJpy: 1200,
        reason: "本周期收到 5 星好评"
      })
      .expect(200);
    expect(created.body.data).toMatchObject({
      id: 501,
      adjustmentType: "bonus",
      status: "draft"
    });

    const listResponse = await request(fixture.app)
      .get("/api/v1/merchant-admin/payroll-adjustments?status=draft")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);
    expect(listResponse.body.data.list[0]).toMatchObject({
      id: 501,
      technicianProfileId: 21
    });

    await request(fixture.app)
      .post("/api/v1/merchant-admin/payroll-adjustments/501/submit")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/payroll-adjustments/501/approve")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/payroll-adjustments")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({
        shopId: 11,
        technicianProfileId: 21,
        periodStart: "2026-06-01T00:00:00.000Z",
        periodEnd: "2026-06-30T23:59:59.000Z",
        adjustmentType: "deduction",
        title: "迟到扣款",
        amountJpy: 500,
        reason: "排班签到迟到"
      })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/payroll-adjustments/501/submit")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/payroll-adjustments/501/reject")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ reason: "金额重复" })
      .expect(200);

    const adjustmentRepository = fixture.payrollRepository as jest.Mocked<PayrollRepositoryPort> & {
      createPayrollAdjustment: jest.Mock;
      transitionPayrollAdjustment: jest.Mock;
    };
    expect(adjustmentRepository.createPayrollAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustmentType: "bonus",
        amountJpy: 1200,
        requestedById: 2
      })
    );
    expect(adjustmentRepository.transitionPayrollAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ adjustmentId: 501, status: "approved", approvedById: 2 })
    );
  });

  it("rejects payroll dispute resolution and payout confirmation without the required permission", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");
    const technicianToken = await fixture.login("tech@example.com");
    const payrollRepository = fixture.payrollRepository as jest.Mocked<PayrollRepositoryPort>;
    payrollRepository.findPayslipDetail.mockResolvedValueOnce({
      ...payRunDetail.payslips[0]!,
      status: "disputed",
      disputeStatus: "disputed"
    });

    await request(fixture.app)
      .post("/api/v1/merchant-admin/payslips/8001/resolve-dispute")
      .set("Authorization", `Bearer ${technicianToken}`)
      .send({ resolutionNote: "不是商户权限" })
      .expect(403);

    await request(fixture.app)
      .post("/api/v1/technician/payslips/8001/payout-records/7001/confirm")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(403);
  });

  it("rejects dispute resolution and payout confirmation across shop and technician scopes", async () => {
    const fixture = await createFixture();
    const otherMerchantToken = await fixture.login("other-merchant@example.com");
    const otherTechnicianToken = await fixture.login("other-tech@example.com");
    const payrollRepository = fixture.payrollRepository as jest.Mocked<PayrollRepositoryPort>;
    payrollRepository.findPayslipDetail.mockResolvedValueOnce({
      ...payRunDetail.payslips[0]!,
      status: "disputed",
      disputeStatus: "disputed"
    });

    const disputeResponse = await request(fixture.app)
      .post("/api/v1/merchant-admin/payslips/8001/resolve-dispute")
      .set("Authorization", `Bearer ${otherMerchantToken}`)
      .send({ resolutionNote: "跨店处理申诉" })
      .expect(403);
    expect(disputeResponse.body).toMatchObject({
      message: "error.identity.forbidden",
      data: null
    });

    const payoutConfirmResponse = await request(fixture.app)
      .post("/api/v1/technician/payslips/8001/payout-records/7001/confirm")
      .set("Authorization", `Bearer ${otherTechnicianToken}`)
      .expect(403);
    expect(payoutConfirmResponse.body).toMatchObject({
      message: "error.identity.forbidden",
      data: null
    });
  });
});
