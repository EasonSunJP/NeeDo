import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuthTokenService } from "../src/services/auth-token.service";
import type {
  CompensationProfilePayload,
  CompensationProfileRepositoryPort
} from "../src/services/compensation-profile.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-08-29T00:00:00.000Z");

const activeProfile: CompensationProfilePayload = {
  id: 301,
  sourceType: "technician_override",
  shopId: 16,
  technicianProfileId: 71,
  name: "LifeDance 正式员工薪酬",
  wageMode: "base_plus_commission",
  baseSalaryJpy: 230_000,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 0,
  commissionRatePercent: 20,
  extensionCommissionRatePercent: 60,
  nominationFeeJpy: 1_500,
  guaranteedMinimumJpy: 0,
  ndpFeeBearer: "shop",
  technicianNdpSharePercent: 0,
  bonusRules: [],
  deductionRules: [],
  version: 2,
  status: "active",
  effectiveFrom: "2026-06-01T00:00:00.000Z",
  effectiveTo: null,
  createdById: 7,
  updatedById: 7,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
};

const payrollSummary = {
  payslipId: 801,
  periodStart: "2026-08-01T00:00:00.000Z",
  periodEnd: "2026-08-31T23:59:59.999Z",
  status: "scheduled" as const,
  disputeStatus: "none" as const,
  completedOrderCount: 2,
  workedMinutes: 120,
  serviceIncomeJpy: 20_000,
  basePayJpy: 230_000,
  commissionJpy: 4_000,
  bonusJpy: 0,
  allowanceJpy: 0,
  deductionJpy: 0,
  platformFeeShareDeductionJpy: 0,
  netPayJpy: 234_000,
  paidAmountJpy: 100_000,
  unpaidAmountJpy: 134_000,
  payoutRecordCount: 1
};

type CompensationRepositoryMock = jest.Mocked<CompensationProfileRepositoryPort> & {
  findCurrentEmployeeAffiliation: jest.Mock;
  findEmployeePayrollSummary: jest.Mock;
};

const createRepository = () =>
  ({
    findActiveProfile: jest.fn(async () => activeProfile),
    findShopFallbackRule: jest.fn(async () => null),
    replaceActiveProfile: jest.fn(async (_shopId, technicianProfileId, input, actorUserId) => ({
      ...activeProfile,
      ...input,
      id: 302,
      technicianProfileId,
      version: 3,
      createdById: actorUserId,
      updatedById: actorUserId
    })),
    findCurrentEmployeeAffiliation: jest.fn(async () => ({
      id: 47,
      technicianProfileId: 71
    })),
    findEmployeePayrollSummary: jest.fn(async () => payrollSummary)
  }) as unknown as CompensationRepositoryMock;

function createFixture(
  permissions = [
    "merchant-admin:compensation-profile:read",
    "merchant-admin:compensation-profile:write",
    "merchant-admin:compensation-profile:preview"
  ]
) {
  const user = {
    id: 7,
    email: "finance@lifedance.test",
    phone: null,
    passwordHash: "unused",
    username: "LifeDance 财务",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 70,
        userId: 7,
        type: "merchant_staff",
        scopeType: "shop",
        scopeId: 16,
        displayName: "LifeDance 财务",
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    identityApplications: [],
    userRoles: [
      {
        deletedAt: null,
        role: {
          code: "merchant_finance",
          deletedAt: null,
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const repository = createRepository();
  const auditLogRepository = { create: jest.fn(async () => undefined) };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository,
    compensationProfileRepository: repository,
    merchantShopContextRepository: createDirectShopContextRepository()
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: 70
  }).token;
  return { app, token, repository, auditLogRepository };
}

describe("merchant employee compensation profile API", () => {
  const endpoint = "/api/v1/merchant-admin/employees/s0000000047/compensation-profile";

  it("returns the current-shop rule and latest formal payroll summary by NeeDoID", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get(endpoint)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          employee: { needoId: "s0000000047" },
          profile: {
            sourceType: "technician_override",
            commissionRatePercent: 20
          },
          payrollSummary
        });
      });
    expect(fixture.repository.findCurrentEmployeeAffiliation).toHaveBeenCalledWith(
      16,
      "s0000000047"
    );
    expect(fixture.repository.findEmployeePayrollSummary).toHaveBeenCalledWith(16, 71);
  });

  it("updates and previews through the current affiliation without client internal IDs", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", authorization)
      .send({
        name: "LifeDance 正式员工薪酬 v3",
        wageMode: "base_plus_commission",
        baseSalaryJpy: 240_000,
        hourlyRateJpy: 0,
        dailyRateJpy: 0,
        fixedOrderPayJpy: 0,
        commissionRatePercent: 22,
        extensionCommissionRatePercent: 65,
        nominationFeeJpy: 1_800,
        guaranteedMinimumJpy: 0,
        ndpFeeBearer: "shop",
        technicianNdpSharePercent: 0,
        bonusRules: [],
        deductionRules: [],
        effectiveFrom: "2026-08-29T00:00:00.000Z",
        effectiveTo: null
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.profile).toMatchObject({
          version: 3,
          baseSalaryJpy: 240_000,
          commissionRatePercent: 22,
          extensionCommissionRatePercent: 65,
          nominationFeeJpy: 1_800
        });
      });
    expect(fixture.repository.replaceActiveProfile).toHaveBeenCalledWith(
      16,
      71,
      expect.objectContaining({
        baseSalaryJpy: 240_000,
        commissionRatePercent: 22,
        extensionCommissionRatePercent: 65,
        nominationFeeJpy: 1_800
      }),
      7
    );

    await request(fixture.app)
      .post(`${endpoint}/preview`)
      .set("Authorization", authorization)
      .send({
        baseServiceAmountJpy: 10_000,
        extensionAmountJpy: 4_000,
        nominated: true,
        platformFeeNdp: 0,
        workedMinutes: 120
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          employee: { needoId: "s0000000047" },
          preview: {
            serviceCommissionPayJpy: 2_000,
            extensionCommissionPayJpy: 2_400,
            nominationPayJpy: 1_500,
            technicianNetIncomeJpy: 5_900
          }
        });
      });
  });

  it("uses a safe 404 for an employee outside the current shop", async () => {
    const fixture = createFixture();
    fixture.repository.findCurrentEmployeeAffiliation.mockResolvedValue(null);
    await request(fixture.app)
      .get(endpoint)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({
          code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
          message: "error.technician_affiliation.not_found",
          data: null
        });
      });
    expect(fixture.repository.findActiveProfile).not.toHaveBeenCalled();
  });

  it("validates canonical technician IDs and separate read/write permissions", async () => {
    const readOnly = createFixture(["merchant-admin:compensation-profile:read"]);
    const authorization = `Bearer ${readOnly.token}`;
    await request(readOnly.app)
      .get("/api/v1/merchant-admin/employees/u0000000047/compensation-profile")
      .set("Authorization", authorization)
      .expect(400);
    await request(readOnly.app)
      .put(endpoint)
      .set("Authorization", authorization)
      .send({ name: "Not allowed", wageMode: "commission" })
      .expect(403);
  });
});
