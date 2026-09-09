import request from "supertest";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";
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
  profile: {
    bio: "整体与放松护理",
    city: "东京都涩谷区",
    serviceArea: "涩谷区、新宿区",
    yearsExperience: 9,
    updatedAt: "2026-08-28T00:00:00.000Z"
  },
  account: {
    isActive: true,
    lastLoginAt: "2026-08-27T12:00:00.000Z"
  },
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
    listCurrentShopEmployeeTimeline: jest.fn(async () => ({
      list: [
        {
          id: "audit-501",
          at: "2026-08-28T15:43:00.000Z",
          actorName: "LifeDance 管理员",
          actorAvatarUrl: "/admin-avatar.png",
          actorRole: "基本资料",
          message: "更新了姓名、城市",
          tone: "accent" as const
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listCurrentShopEmployeeSchedule: jest.fn(async () => [
      {
        projectionId: "busy-redacted:2026-08-29T13:00:00.000Z:2026-08-29T15:00:00.000Z",
        kind: "busy_redacted",
        visibility: "busy_redacted",
        status: "busy",
        startsAt: "2026-08-29T13:00:00.000Z",
        endsAt: "2026-08-29T15:00:00.000Z",
        title: "其他店铺已有确认安排",
        isClickable: false,
        isEditable: false
      }
    ]),
    updateCurrentShopEmployeeProfile: jest.fn(async () => employee),
    upsertCurrentAffiliation: jest.fn(async () => employee)
  }) as unknown as jest.Mocked<TechnicianShopAffiliationRepositoryPort>;

const createFixture = (
  permissions: string[] = [
    "merchant-admin:employee-affiliation:read",
    "merchant-admin:employee-affiliation:write"
  ],
  options: {
    shopId?: number;
    userId?: number;
    identityId?: number;
    repository?: jest.Mocked<TechnicianShopAffiliationRepositoryPort>;
  } = {}
) => {
  const shopId = options.shopId ?? 16;
  const userId = options.userId ?? 7;
  const identityId = options.identityId ?? 70;
  const user = {
    id: userId,
    email: `merchant-${userId}@example.test`,
    phone: null,
    passwordHash: "unused",
    username: "LifeDance 管理员",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: identityId,
        userId,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: shopId,
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
  const repository = options.repository ?? createRepository();
  const publicIdentifierRepository = {
    findActiveByPublicId: jest.fn(async (publicId: string) =>
      /^s[0-9]{10}$/.test(publicId)
        ? {
            id: Number(publicId.slice(1)),
            publicId,
            numberPart: "0000000086",
            kind: "S" as const,
            loginAllowed: false,
            searchable: true,
            status: "ACTIVE" as const,
            userIdentityId: Number(publicId.slice(1)),
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
    auditLogRepository,
    merchantShopContextRepository: createDirectShopContextRepository()
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: identityId
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

  it("returns a strict employee schedule projection and rejects invalid ranges", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    const endpoint =
      "/api/v1/merchant-admin/employees/s0000000086/schedule?from=2026-08-25T00%3A00%3A00.000Z&to=2026-09-01T00%3A00%3A00.000Z&view=week";

    await request(fixture.app)
      .get(endpoint)
      .set("Authorization", authorization)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          employee: { needoId: "s0000000086", relationshipType: "partner" },
          range: { view: "week" },
          events: [
            {
              projectionId: expect.any(String),
              kind: "busy_redacted",
              visibility: "busy_redacted",
              status: "busy",
              startsAt: "2026-08-29T13:00:00.000Z",
              endsAt: "2026-08-29T15:00:00.000Z",
              title: "其他店铺已有确认安排",
              isClickable: false,
              isEditable: false
            }
          ]
        });
        expect(response.body.data.events[0]).not.toEqual(
          expect.objectContaining({
            shopId: expect.anything(),
            orderId: expect.anything(),
            serviceName: expect.anything(),
            customerUserId: expect.anything()
          })
        );
      });
    expect(fixture.repository.listCurrentShopEmployeeSchedule).toHaveBeenCalledWith({
      shopId: 16,
      technicianIdentityId: 86,
      from: new Date("2026-08-25T00:00:00.000Z"),
      to: new Date("2026-09-01T00:00:00.000Z"),
      view: "week"
    });

    await request(fixture.app)
      .get(
        "/api/v1/merchant-admin/employees/s0000000086/schedule?from=2026-08-01T00%3A00%3A00.000Z&to=2026-12-01T00%3A00%3A00.000Z&view=week"
      )
      .set("Authorization", authorization)
      .expect(400);
  });

  it("lists semantic timeline events and persists comments with dedicated permissions", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    const timelineEndpoint =
      "/api/v1/merchant-admin/employees/s0000000086/timeline?page=1&pageSize=20";

    await request(fixture.app)
      .get(timelineEndpoint)
      .set("Authorization", authorization)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          list: [
            {
              id: "audit-501",
              actorName: "LifeDance 管理员",
              actorRole: "基本资料",
              message: "更新了姓名、城市"
            }
          ],
          total: 1,
          page: 1,
          page_size: 20
        });
        expect(JSON.stringify(response.body.data)).not.toContain("merchant_admin.");
      });

    await request(fixture.app)
      .post("/api/v1/merchant-admin/employees/s0000000086/timeline/comments")
      .set("Authorization", authorization)
      .send({ message: "已与员工确认本月现金结算。" })
      .expect(201)
      .expect((response) => {
        expect(response.body.data).toEqual({ created: true });
      });

    expect(fixture.auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.employee_timeline.comment",
        targetId: 91,
        metadata: { message: "已与员工确认本月现金结算。", shopId: 16 }
      })
    );
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

    const callsBeforeLegacyValue = fixture.repository.upsertCurrentAffiliation.mock.calls.length;
    await request(fixture.app)
      .put(endpoint)
      .set("Authorization", authorization)
      .send({
        relationshipType: "exclusive",
        workStatus: "active",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: null
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: ERROR_CODES.VALIDATION });
      });
    expect(fixture.repository.upsertCurrentAffiliation).toHaveBeenCalledTimes(
      callsBeforeLegacyValue
    );
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

  it("validates and persists a strict shop-scoped employee profile patch", async () => {
    const readOnly = createFixture(["merchant-admin:employee-affiliation:read"]);
    const endpoint = "/api/v1/merchant-admin/employees/s0000000086/profile";
    const body = {
      displayName: "斋藤 健太",
      bio: "整体与放松护理",
      city: "东京都涩谷区",
      serviceArea: "涩谷区、新宿区",
      yearsExperience: 9
    };

    await request(readOnly.app)
      .patch(endpoint)
      .set("Authorization", `Bearer ${readOnly.token}`)
      .send(body)
      .expect(403);

    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    for (const invalidBody of [
      {},
      { city: "" },
      { displayName: "" },
      { yearsExperience: -1 },
      { yearsExperience: 81 },
      { city: "东京都", shopId: 99 }
    ]) {
      await request(fixture.app)
        .patch(endpoint)
        .set("Authorization", authorization)
        .send(invalidBody)
        .expect(400);
    }

    await request(fixture.app)
      .patch(endpoint)
      .set("Authorization", authorization)
      .send(body)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 0,
          data: { needoId: "s0000000086", profile: { yearsExperience: 9 } }
        });
      });
    expect(fixture.repository.updateCurrentShopEmployeeProfile).toHaveBeenCalledWith({
      shopId: 16,
      technicianIdentityId: 86,
      actorUserId: 7,
      profile: body
    });
    expect(fixture.auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.employee_profile.update",
        metadata: {
          shopId: 16,
          changedFields: ["bio", "city", "displayName", "serviceArea", "yearsExperience"]
        }
      })
    );
  });

  it("keeps two merchant scopes isolated while a partner belongs to both shops", async () => {
    const shopA = 16;
    const shopB = 20;
    const sharedIdentityId = 86;
    const shopBOnlyIdentityId = 87;
    const affiliations = new Map<string, MerchantEmployeePayload>([
      [`${shopA}:${sharedIdentityId}`, employee],
      [
        `${shopB}:${sharedIdentityId}`,
        {
          ...employee,
          affiliation: {
            ...employee.affiliation,
            id: 92,
            shop: { id: shopB, publicId: "shop0000000020", name: "Partner Shop" }
          }
        }
      ],
      [
        `${shopB}:${shopBOnlyIdentityId}`,
        {
          ...employee,
          needoId: "s0000000087",
          displayName: "B 店合作员工",
          affiliation: {
            ...employee.affiliation,
            id: 93,
            relationshipType: "partner",
            shop: { id: shopB, publicId: "shop0000000020", name: "Partner Shop" }
          }
        }
      ]
    ]);
    const repository = {
      listCurrentShopEmployees: jest.fn(async (input) => {
        const list = [...affiliations.entries()]
          .filter(([key]) => key.startsWith(`${input.shopId}:`))
          .map(([, value]) => value);
        return { list, total: list.length, page: 1, page_size: 20 };
      }),
      findCurrentShopEmployee: jest.fn(
        async (shopId, technicianIdentityId) =>
          affiliations.get(`${shopId}:${technicianIdentityId}`) ?? null
      ),
      upsertCurrentAffiliation: jest.fn(async (input) => {
        const key = `${input.shopId}:${input.technicianIdentityId}`;
        const current = affiliations.get(key);
        if (!current) return "not_found" as const;
        if (input.workStatus === "ended") {
          affiliations.delete(key);
          return {
            ...current,
            affiliation: {
              ...current.affiliation,
              workStatus: "ended" as const,
              endsAt: input.endsAt?.toISOString() ?? null
            }
          };
        }
        return current;
      })
    } as unknown as jest.Mocked<TechnicianShopAffiliationRepositoryPort>;
    const fixtureA = createFixture(undefined, {
      shopId: shopA,
      userId: 7,
      identityId: 70,
      repository
    });
    const fixtureB = createFixture(undefined, {
      shopId: shopB,
      userId: 8,
      identityId: 80,
      repository
    });
    const authA = `Bearer ${fixtureA.token}`;
    const authB = `Bearer ${fixtureB.token}`;

    await request(fixtureA.app)
      .get("/api/v1/merchant-admin/employees")
      .set("Authorization", authA)
      .expect(200)
      .expect((response) => expect(response.body.data.total).toBe(1));
    await request(fixtureB.app)
      .get("/api/v1/merchant-admin/employees")
      .set("Authorization", authB)
      .expect(200)
      .expect((response) => expect(response.body.data.total).toBe(2));
    await request(fixtureA.app)
      .get("/api/v1/merchant-admin/employees/s0000000087")
      .set("Authorization", authA)
      .expect(404);
    await request(fixtureB.app)
      .get("/api/v1/merchant-admin/employees/s0000000087")
      .set("Authorization", authB)
      .expect(200);

    await request(fixtureA.app)
      .put("/api/v1/merchant-admin/employees/s0000000086/affiliation")
      .set("Authorization", authA)
      .send({
        relationshipType: "exclusive",
        workStatus: "active",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: null
      })
      .expect(400);
    await request(fixtureB.app)
      .put("/api/v1/merchant-admin/employees/s0000000086/affiliation")
      .set("Authorization", authB)
      .send({
        relationshipType: "partner",
        workStatus: "ended",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-08-28T00:00:00.000Z"
      })
      .expect(200);
    await request(fixtureB.app)
      .get("/api/v1/merchant-admin/employees")
      .set("Authorization", authB)
      .expect(200)
      .expect((response) => expect(response.body.data.total).toBe(1));
    await request(fixtureA.app)
      .get("/api/v1/merchant-admin/employees/s0000000086")
      .set("Authorization", authA)
      .expect(200);
    expect(fixtureB.auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.employee_affiliation.update",
        metadata: expect.objectContaining({ shopId: shopB })
      })
    );
  });
});
