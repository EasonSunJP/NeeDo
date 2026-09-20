import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const cycle = {
  id: "9a2d59d0-3f2d-49dc-82af-c34371a3cd8d",
  shopId: 16,
  name: "2026-12 自主排班",
  mode: "TECH_SELF_FINAL",
  status: "FINAL_CONFIRMING",
  currentStep: 3,
  templateType: "WEEK",
  periodStart: "2026-12-01",
  periodEnd: "2026-12-20",
  targetTechnicianIds: [31],
  feedbackDeadline: null,
  templateMatrix: Array.from({ length: 7 }, () => Array(24).fill(false)),
  regularHolidayWeekdays: [],
  ruleSet: {},
  launchedAt: "2026-09-20T12:00:00.000Z",
  finalizedAt: null,
  activeAt: null,
  cancelledAt: null,
  lastAutoConfirmAt: null,
  autoConfirmSummary: null,
  feedbackRows: [],
  finalShifts: [],
  version: 2,
  updatedAt: "2026-09-20T12:00:00.000Z"
};

function createFixture() {
  const user = {
    id: 7,
    email: "owner@needo.test",
    phone: null,
    passwordHash: "unused",
    username: "Owner",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [{
      id: 70,
      userId: 7,
      type: "merchant_owner",
      scopeType: "shop",
      scopeId: 16,
      displayName: "Owner",
      isDefault: true,
      isActive: true,
      deletedAt: null
    }],
    identityApplications: [],
    userRoles: [{
      deletedAt: null,
      role: {
        code: "merchant_owner",
        deletedAt: null,
        rolePermissions: ["schedule:slots:list", "schedule:slots:write"].map((code) => ({
          deletedAt: null,
          permission: { code, type: "api", deletedAt: null }
        }))
      }
    }]
  };
  const repository = {
    listForShop: jest.fn(async () => ({ list: [cycle], total: 1, page: 1, page_size: 20 })),
    createDraft: jest.fn(async () => ({ ...cycle, status: "DRAFT", currentStep: 1, version: 1 })),
    updateDraft: jest.fn(async () => ({ ...cycle, status: "RULE_SETTING", currentStep: 2, version: 2 })),
    launch: jest.fn(async () => cycle),
    findForShop: jest.fn(async () => cycle),
    replaceAutoConfirmedShifts: jest.fn(async (_shopId, _cycleId, input) => ({
      cycle: { ...cycle, autoConfirmSummary: input.summary },
      summary: input.summary
    })),
    finalize: jest.fn(async () => ({ ...cycle, status: "CONFIRMED", finalizedAt: "2026-09-20T13:00:00.000Z" })),
    closeFeedback: jest.fn(async () => ({ ...cycle, status: "FEEDBACK_CLOSED", currentStep: 4 })),
    cancel: jest.fn(async () => ({ ...cycle, status: "CANCELLED" }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 16 }),
    scheduleCycleRepository: repository
  } as never);
  const tokens = [1, 2].map(() => new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: 70
  }).token);
  return { app, repository, tokens };
}

describe("schedule cycle HTTP API", () => {
  it("returns the same authoritative cycle in independent authenticated sessions", async () => {
    const fixture = createFixture();
    for (const token of fixture.tokens) {
      await request(fixture.app)
        .get("/api/v1/merchant-admin/schedule-cycles?page=1&pageSize=20")
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
        .expect((response) => {
          expect(response.body.data.list).toEqual([cycle]);
        });
    }
    expect(fixture.repository.listForShop).toHaveBeenCalledTimes(2);
    expect(fixture.repository.listForShop).toHaveBeenNthCalledWith(1, 16, { page: 1, pageSize: 20 });
    expect(fixture.repository.listForShop).toHaveBeenNthCalledWith(2, 16, { page: 1, pageSize: 20 });
  });

  it("persists the complete merchant lifecycle through scoped, audited commands", async () => {
    const fixture = createFixture();
    const authorization = { Authorization: `Bearer ${fixture.tokens[0]}` };
    const draftBody = {
      name: "2026-12 自主排班",
      mode: "TECH_SELF_FINAL",
      currentStep: 2,
      templateType: "WEEK",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-20",
      targetTechnicianIds: [31],
      feedbackDeadline: null,
      templateMatrix: Array.from({ length: 7 }, (_, day) =>
        Array.from({ length: 24 }, (_, hour) => day > 0 && day < 6 && hour >= 10 && hour < 18)
      ),
      regularHolidayWeekdays: [],
      ruleSet: {
        minStaff: 1,
        targetStaff: 1,
        maxStaff: 1,
        maxDailyHours: 8,
        maxWeeklyHours: 40,
        minRestDaysPerWeek: 1,
        weekdayAdjustments: {},
        holidayAdjustments: {}
      },
      version: 1
    };

    await request(fixture.app)
      .post("/api/v1/merchant-admin/schedule-cycles")
      .set(authorization)
      .send({ targetTechnicianIds: [31] })
      .expect(201);
    await request(fixture.app)
      .put(`/api/v1/merchant-admin/schedule-cycles/${cycle.id}`)
      .set(authorization)
      .send(draftBody)
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/schedule-cycles/${cycle.id}/launch`)
      .set(authorization)
      .send({ idempotencyKey: `${cycle.id}:launch` })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/schedule-cycles/${cycle.id}/close-feedback`)
      .set(authorization)
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/schedule-cycles/${cycle.id}/auto-confirm`)
      .set(authorization)
      .send({ idempotencyKey: `${cycle.id}:auto-confirm` })
      .expect(200);
    await request(fixture.app)
      .post(`/api/v1/merchant-admin/schedule-cycles/${cycle.id}/finalize`)
      .set(authorization)
      .send({ idempotencyKey: `${cycle.id}:finalize` })
      .expect(200);

    expect(fixture.repository.createDraft).toHaveBeenCalledWith(16, 7, [31], expect.any(Object));
    expect(fixture.repository.updateDraft).toHaveBeenCalledWith(16, cycle.id, expect.objectContaining({ version: 1 }), expect.any(Object));
    expect(fixture.repository.launch).toHaveBeenCalledWith(16, cycle.id, `${cycle.id}:launch`, 7, expect.any(Object));
    expect(fixture.repository.closeFeedback).toHaveBeenCalledWith(16, cycle.id, 7, expect.any(Object));
    expect(fixture.repository.replaceAutoConfirmedShifts).toHaveBeenCalledWith(
      16,
      cycle.id,
      expect.objectContaining({ idempotencyKey: `${cycle.id}:auto-confirm`, actorUserId: 7 }),
      expect.any(Object)
    );
    expect(fixture.repository.finalize).toHaveBeenCalledWith(16, cycle.id, `${cycle.id}:finalize`, 7, expect.any(Object));
  });

  it("exposes targeted cycles to technicians and accepts only their persisted feedback", async () => {
    const technicianUser = {
      id: 8,
      email: "technician@needo.test",
      phone: null,
      passwordHash: "unused",
      username: "Technician",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [{
        id: 80, userId: 8, type: "technician", scopeType: "technician_profile", scopeId: 31,
        displayName: "Technician", isDefault: true, isActive: true, deletedAt: null
      }],
      identityApplications: [],
      userRoles: [{ deletedAt: null, role: { code: "technician", deletedAt: null, rolePermissions: ["schedule:slots:list", "schedule:slots:write"].map((code) => ({ deletedAt: null, permission: { code, type: "api", deletedAt: null } })) } }]
    };
    const repository = {
      listForTechnician: jest.fn(async () => ({ list: [cycle], total: 1, page: 1, page_size: 20 })),
      submitFeedback: jest.fn(async () => ({ ...cycle, version: 3 }))
    };
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      testOnlyAllowLegacyAuthAdapters: true,
      authRepository: { findUserById: jest.fn(async () => technicianUser) },
      authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
      otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
      auditLogRepository: { create: jest.fn(async () => undefined) },
      scheduleCycleRepository: repository
    } as never);
    const token = new AuthTokenService(env).issueAccessToken({ id: 8, email: technicianUser.email, currentIdentityId: 80 }).token;
    const auth = { Authorization: `Bearer ${token}` };

    await request(app).get("/api/v1/technician/schedule-cycles?page=1&pageSize=20").set(auth).expect(200);
    await request(app)
      .put(`/api/v1/technician/schedule-cycles/${cycle.id}/feedback`)
      .set(auth)
      .send({ version: 2, entries: [{ date: "2026-12-01", hour: 10, status: "AVAILABLE", note: "" }] })
      .expect(200);

    expect(repository.listForTechnician).toHaveBeenCalledWith(31, { page: 1, pageSize: 20 });
    expect(repository.submitFeedback).toHaveBeenCalledWith(
      31,
      cycle.id,
      expect.objectContaining({ version: 2, entries: [expect.objectContaining({ date: "2026-12-01", hour: 10 })] }),
      expect.any(Object)
    );
  });

  it("gives operations a paginated read-only reconciliation view", async () => {
    const operationsUser = {
      id: 9, email: "ops@needo.test", phone: null, passwordHash: "unused", username: "Ops",
      avatarUrl: null, isActive: true, lastLoginAt: null, deletedAt: null,
      identities: [{ id: 90, userId: 9, type: "platform_admin", scopeType: "global", scopeId: null, displayName: "Ops", isDefault: true, isActive: true, deletedAt: null }],
      identityApplications: [],
      userRoles: [{ deletedAt: null, role: { code: "operations", deletedAt: null, rolePermissions: [{ deletedAt: null, permission: { code: "backoffice:schedule:list", type: "api", deletedAt: null } }] } }]
    };
    const repository = { listForShop: jest.fn(async () => ({ list: [cycle], total: 1, page: 1, page_size: 20 })) };
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      testOnlyAllowLegacyAuthAdapters: true,
      authRepository: { findUserById: jest.fn(async () => operationsUser) },
      authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
      otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
      auditLogRepository: { create: jest.fn(async () => undefined) },
      scheduleCycleRepository: repository
    } as never);
    const token = new AuthTokenService(env).issueAccessToken({ id: 9, email: operationsUser.email, currentIdentityId: 90 }).token;

    await request(app)
      .get("/api/v1/backoffice/schedule-cycles?shopId=16&page=1&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(repository.listForShop).toHaveBeenCalledWith(16, { page: 1, pageSize: 20 });
  });
});
