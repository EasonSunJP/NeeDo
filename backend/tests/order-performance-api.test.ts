import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type { OrderPerformanceRepositoryPort } from "../src/repositories/order-performance.repository";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-09-01T04:00:00.000Z");
const assessment = {
  id: 41,
  bookingOrderId: 71,
  technicianProfileId: 31,
  outcome: "technician_cancelled" as const,
  treatment: "special_excluded" as const,
  version: 2,
  currentRevisionId: 91,
  createdAt: now,
  updatedAt: now
};

const createFixture = (permissions = ["backoffice:order-performance:write"]) => {
  const user = {
    id: 9,
    email: "operator@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Operations",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 900,
        userId: 9,
        type: "platform_operator",
        scopeType: "global",
        scopeId: null,
        displayName: "Operations",
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
          code: "operator",
          deletedAt: null,
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const ok = { outcome: "ok" as const, assessment, replayed: false };
  const repository: jest.Mocked<OrderPerformanceRepositoryPort> = {
    classifyTechnicianUncompleted: jest.fn().mockResolvedValue(ok),
    applySpecialExclusion: jest.fn().mockResolvedValue(ok),
    revokeSpecialExclusion: jest.fn().mockResolvedValue(ok),
    rebuildTechnicianSummary: jest.fn()
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    orderPerformanceRepository: repository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: 900
  }).token;
  return { app, token, repository };
};

const validBody = {
  publicReason: "交通中断による例外対応",
  internalNote: "运营确认 JR 全线停运",
  idempotencyKey: "order-performance-command-0001",
  expectedRevision: 1
};

describe("order performance HTTP API", () => {
  it("requires authentication and the dedicated operations permission", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/orders/71/special-cancellation")
      .send(validBody)
      .expect(401);

    const forbidden = createFixture([]);
    await request(forbidden.app)
      .post("/api/v1/backoffice/orders/71/special-cancellation")
      .set("Authorization", `Bearer ${forbidden.token}`)
      .send(validBody)
      .expect(403);
  });

  it.each([
    [{ ...validBody, publicReason: "" }],
    [{ ...validBody, idempotencyKey: "short" }],
    [{ ...validBody, expectedRevision: -1 }],
    [{ ...validBody, acceptanceRate: 100 }]
  ])("rejects invalid or percentage-bearing command bodies", async (body) => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/orders/71/special-cancellation")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(body)
      .expect(400);
    expect(fixture.repository.applySpecialExclusion).not.toHaveBeenCalled();
  });

  it("exposes classify, apply, and revoke commands with the standard success envelope", async () => {
    const fixture = createFixture();
    const commands = [
      ["/api/v1/backoffice/orders/71/technician-uncompleted", "classifyTechnicianUncompleted"],
      ["/api/v1/backoffice/orders/71/special-cancellation", "applySpecialExclusion"],
      ["/api/v1/backoffice/orders/71/special-cancellation/revoke", "revokeSpecialExclusion"]
    ] as const;

    for (const [path, method] of commands) {
      await request(fixture.app)
        .post(path)
        .set("Authorization", `Bearer ${fixture.token}`)
        .send({ ...validBody, idempotencyKey: `${validBody.idempotencyKey}-${method}` })
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({
            code: 0,
            message: "success",
            data: { assessment: { bookingOrderId: 71 }, replayed: false }
          });
        });
      expect(fixture.repository[method]).toHaveBeenCalledWith(
        expect.objectContaining({ bookingOrderId: 71, actorUserId: 9 })
      );
    }
  });

  it("returns replay status and stable conflict or ineligible HTTP statuses", async () => {
    const replay = createFixture();
    replay.repository.applySpecialExclusion.mockResolvedValue({
      outcome: "ok",
      assessment,
      replayed: true
    });
    await request(replay.app)
      .post("/api/v1/backoffice/orders/71/special-cancellation")
      .set("Authorization", `Bearer ${replay.token}`)
      .send(validBody)
      .expect(200)
      .expect((response) => expect(response.body.data.replayed).toBe(true));

    for (const [outcome, status] of [
      ["version_conflict", 409],
      ["idempotency_conflict", 409],
      ["ineligible", 422]
    ] as const) {
      const fixture = createFixture();
      fixture.repository.applySpecialExclusion.mockResolvedValue({ outcome });
      await request(fixture.app)
        .post("/api/v1/backoffice/orders/71/special-cancellation")
        .set("Authorization", `Bearer ${fixture.token}`)
        .send(validBody)
        .expect(status);
    }
  });
});
