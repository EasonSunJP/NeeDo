import request from "supertest";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  EmployeePayrollScheduleOverridePayload,
  ShopPayrollSchedulePolicyPayload
} from "../src/domain/payroll-schedule-policy";
import { AuthTokenService } from "../src/services/auth-token.service";
import type { PayrollSchedulePolicyRepositoryPort } from "../src/services/payroll-schedule-policy.service";

const shopPolicy: ShopPayrollSchedulePolicyPayload = {
  id: 3,
  shopId: 16,
  cadence: "monthly",
  weeklySettlementWeekday: null,
  monthlySettlementDay: 25,
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

const inheritedOverride: EmployeePayrollScheduleOverridePayload = {
  id: 8,
  technicianShopAffiliationId: 47,
  inheritShopPolicy: true,
  cadence: null,
  weeklySettlementWeekday: null,
  monthlySettlementDay: null,
  holidayAdjustment: null,
  timezone: null,
  effectiveFrom: "2026-08-29",
  effectiveTo: null,
  status: "active",
  version: 1,
  createdById: 7,
  updatedById: 7,
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z"
};

const createRepository = (): jest.Mocked<PayrollSchedulePolicyRepositoryPort> =>
  ({
    findActiveShopPolicy: jest.fn(async () => shopPolicy),
    replaceShopPolicy: jest.fn(async (_shopId, input) => ({
      ...shopPolicy,
      ...input,
      version: 4
    })),
    findCurrentEmployeeAffiliation: jest.fn(async () => ({
      id: 47,
      technicianProfileId: 71
    })),
    findActiveEmployeeOverride: jest.fn(async () => null),
    replaceEmployeeOverride: jest.fn(async () => inheritedOverride),
    listNonBusinessDateKeys: jest.fn(async () => [])
  }) as unknown as jest.Mocked<PayrollSchedulePolicyRepositoryPort>;

function createFixture(
  permissions: string[] = ["merchant-admin:payroll:read", "merchant-admin:payroll:write"]
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
    payrollSchedulePolicyRepository: repository,
    merchantShopContextRepository: createDirectShopContextRepository()
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: 70
  }).token;
  return { app, token, repository, auditLogRepository };
}

describe("merchant payroll schedule policy HTTP API", () => {
  it("requires authentication and the existing payroll read permission", async () => {
    const fixture = createFixture([]);
    await request(fixture.app).get("/api/v1/merchant-admin/payroll-schedule-policy").expect(401);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/payroll-schedule-policy")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(403);
  });

  it("reads the JWT-scoped shop policy and rejects client shop IDs", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/merchant-admin/payroll-schedule-policy?referenceDate=2026-08-29")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 0,
          message: "success",
          data: {
            configured: true,
            source: "shop",
            effectivePolicy: { cadence: "monthly", monthlySettlementDay: 25 }
          }
        });
      });
    expect(fixture.repository.findActiveShopPolicy).toHaveBeenCalledWith(16, "2026-08-29");

    await request(fixture.app)
      .get("/api/v1/merchant-admin/payroll-schedule-policy?shopId=99")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(400);
  });

  it("validates cadence fields before writing and requires payroll write permission", async () => {
    const readOnly = createFixture(["merchant-admin:payroll:read"]);
    const endpoint = "/api/v1/merchant-admin/payroll-schedule-policy";
    const body = {
      cadence: "weekly",
      weeklySettlementWeekday: 5,
      monthlySettlementDay: null,
      holidayAdjustment: "previous_business_day",
      timezone: "Asia/Tokyo",
      effectiveFrom: "2026-08-29",
      effectiveTo: null
    };
    await request(readOnly.app)
      .put(endpoint)
      .set("Authorization", `Bearer ${readOnly.token}`)
      .send(body)
      .expect(403);

    const fixture = createFixture();
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ ...body, weeklySettlementWeekday: null })
      .expect(400);
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ ...body, shopId: 99 })
      .expect(400);
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(body)
      .expect(200);
    expect(fixture.repository.replaceShopPolicy).toHaveBeenCalledWith(16, body, 7);
  });

  it("reads and updates an employee override by canonical technician NeeDoID", async () => {
    const fixture = createFixture();
    const endpoint = "/api/v1/merchant-admin/employees/s0000000047/payroll-schedule-policy";
    const authorization = `Bearer ${fixture.token}`;
    await request(fixture.app)
      .get(`${endpoint}?referenceDate=2026-08-29`)
      .set("Authorization", authorization)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          source: "shop",
          inheritShopPolicy: true
        });
      });
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", authorization)
      .send({
        inheritShopPolicy: true,
        cadence: null,
        weeklySettlementWeekday: null,
        monthlySettlementDay: null,
        holidayAdjustment: null,
        timezone: null,
        effectiveFrom: "2026-08-29",
        effectiveTo: null
      })
      .expect(200);
    expect(fixture.repository.replaceEmployeeOverride).toHaveBeenCalledWith(
      47,
      expect.objectContaining({ inheritShopPolicy: true }),
      7
    );
  });

  it("rejects malformed/non-technician IDs and uses the same safe 404 outside the shop", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    await request(fixture.app)
      .get("/api/v1/merchant-admin/employees/u0000000047/payroll-schedule-policy")
      .set("Authorization", authorization)
      .expect(400);

    fixture.repository.findCurrentEmployeeAffiliation.mockResolvedValue(null);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/employees/s0000000099/payroll-schedule-policy")
      .set("Authorization", authorization)
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({
          code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
          message: "error.technician_affiliation.not_found",
          data: null
        });
      });
  });
});
