import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuthTokenService } from "../src/services/auth-token.service";
import type {
  MerchantEmployeePayload,
  TechnicianShopAffiliationRepositoryPort
} from "../src/services/technician-shop-affiliation.service";

const employee: MerchantEmployeePayload = {
  needoId: "s0000000086",
  displayName: "斋藤 健太",
  avatarUrl: "/avatar.png",
  email: "staff@example.com",
  phone: "+81-90-0000-0000",
  profileStatus: "published",
  verifiedAt: "2026-05-25T00:00:00.000Z",
  affiliation: {
    id: 91,
    relationshipType: "partner",
    workStatus: "active",
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: null,
    shop: {
      id: 16,
      publicId: "shop0000000016",
      name: "LifeDance Wellness"
    }
  }
};

const createRepository = (): jest.Mocked<TechnicianShopAffiliationRepositoryPort> =>
  ({
    listCurrentShopEmployees: jest.fn(async () => ({
      list: [employee],
      total: 1,
      page: 1,
      page_size: 20
    })),
    findCurrentShopEmployee: jest.fn(async () => employee),
    upsertCurrentAffiliation: jest.fn(async () => employee)
  }) as unknown as jest.Mocked<TechnicianShopAffiliationRepositoryPort>;

const createFixture = (
  permissions: string[] = [
    "merchant-admin:employee-affiliation:read",
    "merchant-admin:employee-affiliation:write"
  ]
) => {
  const user = {
    id: 7,
    email: "merchant@example.test",
    phone: null,
    passwordHash: "unused",
    username: "LifeDance 管理员",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 70,
        userId: 7,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: 16,
        displayName: "LifeDance 管理员",
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
          code: "merchant_owner",
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
  const publicIdentifierRepository = {
    findActiveByPublicId: jest.fn(async (publicId: string) =>
      publicId === "s0000000086"
        ? {
            id: 86,
            publicId,
            numberPart: "0000000086",
            kind: "S" as const,
            loginAllowed: false,
            searchable: true,
            status: "ACTIVE" as const,
            userIdentityId: 86,
            shopId: null,
            merchantAccountId: null,
            customerSupportAccountId: null
          }
        : null
    )
  };
  const auditLogRepository = { create: jest.fn(async () => undefined) };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    technicianShopAffiliationRepository: repository,
    publicIdentifierRepository,
    auditLogRepository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: 70
  }).token;
  return { app, token, repository, auditLogRepository, publicIdentifierRepository };
};

describe("merchant employee affiliation HTTP API", () => {
  it("requires authentication and the dedicated read permission", async () => {
    const fixture = createFixture([]);
    await request(fixture.app).get("/api/v1/merchant-admin/employees").expect(401);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/employees")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(403);
  });

  it("returns the current-shop paginated employee list without accepting a client shopId", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get(
        "/api/v1/merchant-admin/employees?page=1&pageSize=20&keyword=%E6%96%8B%E8%97%A4&relationshipType=partner&workStatus=active"
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 0,
          message: "success",
          data: { total: 1, page: 1, page_size: 20, list: [{ needoId: "s0000000086" }] }
        });
      });
    expect(fixture.repository.listCurrentShopEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 16,
        page: 1,
        pageSize: 20,
        keyword: "斋藤",
        relationshipType: "partner",
        workStatus: "active"
      })
    );

    await request(fixture.app)
      .get("/api/v1/merchant-admin/employees?shopId=99")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(400);
  });

  it("rejects malformed or non-technician public identifiers before lookup", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    await request(fixture.app)
      .get("/api/v1/merchant-admin/employees/u0000000086")
      .set("Authorization", authorization)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/employees/not-an-id")
      .set("Authorization", authorization)
      .expect(400);
    expect(fixture.publicIdentifierRepository.findActiveByPublicId).not.toHaveBeenCalled();
  });

  it("uses one safe 404 when the employee is outside the current shop", async () => {
    const fixture = createFixture();
    fixture.repository.findCurrentShopEmployee.mockResolvedValue(null);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/employees/s0000000086")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({
          code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
          message: "error.technician_affiliation.not_found",
          data: null
        });
      });
  });

  it("validates strict mutation dates and maps an exclusivity collision to safe 409", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    const endpoint = "/api/v1/merchant-admin/employees/s0000000086/affiliation";
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", authorization)
      .send({
        relationshipType: "partner",
        workStatus: "active",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-08-02T00:00:00.000Z"
      })
      .expect(400);
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", authorization)
      .send({
        relationshipType: "partner",
        workStatus: "ended",
        startsAt: "2026-08-03T00:00:00.000Z",
        endsAt: "2026-08-02T00:00:00.000Z"
      })
      .expect(400);
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", authorization)
      .send({
        relationshipType: "partner",
        workStatus: "active",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: null,
        shopId: 99
      })
      .expect(400);

    fixture.repository.upsertCurrentAffiliation.mockResolvedValue("exclusive_conflict");
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", authorization)
      .send({
        relationshipType: "exclusive",
        workStatus: "active",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: null
      })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.TECHNICIAN_AFFILIATION_CONFLICT,
          message: "error.technician_affiliation.exclusive_conflict"
        });
      });
  });

  it("requires the dedicated write permission and passes parsed dates only after validation", async () => {
    const readOnly = createFixture(["merchant-admin:employee-affiliation:read"]);
    const body = {
      relationshipType: "partner",
      workStatus: "active",
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: null
    };
    await request(readOnly.app)
      .put("/api/v1/merchant-admin/employees/s0000000086/affiliation")
      .set("Authorization", `Bearer ${readOnly.token}`)
      .send(body)
      .expect(403);

    const fixture = createFixture();
    await request(fixture.app)
      .put("/api/v1/merchant-admin/employees/s0000000086/affiliation")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(body)
      .expect(200);
    expect(fixture.repository.upsertCurrentAffiliation).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        startsAt: new Date(body.startsAt),
        endsAt: null
      })
    );
    expect(fixture.auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.employee_affiliation.update",
        metadata: expect.not.objectContaining({
          needoId: expect.anything(),
          email: expect.anything(),
          phone: expect.anything()
        })
      })
    );
  });
});
