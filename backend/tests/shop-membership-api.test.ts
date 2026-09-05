import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type { ShopMembershipRepositoryPort } from "../src/repositories/shop-membership.repository";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-08-31T03:00:00.000Z");
const shop = {
  id: 71,
  shopNo: "s000000071",
  name: "青山护理店",
  city: "东京",
  address: "港区青山 1-1"
};
const detail = {
  internalId: 31,
  publicId: "00000000-0000-4000-8000-000000000031",
  customerProfileId: 41,
  customerNeedoId: "u0000000041",
  displayName: "王小美",
  avatarUrl: null,
  city: "东京",
  status: "active" as const,
  source: "merchant_manual" as const,
  startedAt: now,
  endedAt: null,
  createdAt: now,
  updatedAt: now,
  cardCount: 0,
  activeCardCount: 0,
  lastActivityAt: now,
  shop,
  cards: []
};

function repository() {
  return {
    getOverview: jest.fn(async () => ({
      shop,
      activeMemberCount: 1,
      todayNewMemberCount: 1,
      activeCardCount: 0,
      expiringSoonCardCount: 0,
      recentActivities: []
    })),
    listMemberships: jest.fn(async () => ({ list: [detail], total: 1, page: 1, page_size: 20 })),
    findMembershipDetail: jest.fn(async () => detail),
    listCandidates: jest.fn(async () => ({
      list: [
        {
          customerNeedoId: "u0000000041",
          displayName: "王小美",
          avatarUrl: null,
          city: "东京",
          lastOrderAt: now
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    findCandidateByNeedoId: jest.fn(async () => ({
      customerProfileId: 41,
      customerNeedoId: "u0000000041",
      displayName: "王小美",
      avatarUrl: null,
      city: "东京",
      lastOrderAt: now,
      shopNo: "s000000071"
    })),
    createMembershipWithAudit: jest.fn(async () => detail),
    listCards: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    listActivities: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    getAnalytics: jest.fn(async (shopId, range) => ({
      period: range.period,
      from: range.from,
      to: range.to,
      activeMemberCount: shopId === 71 ? 1 : 0,
      newMemberCount: 1,
      cardStatusCounts: { active: 0, frozen: 0, expired: 0, void: 0 },
      dailyNewMembers: range.dateKeys.map((date: string) => ({ date, count: 0 }))
    })),
    listCustomerMemberships: jest.fn(async () => ({
      list: [
        {
          internalId: 31,
          publicId: detail.publicId,
          status: "active" as const,
          startedAt: now,
          endedAt: null,
          cardCount: 0,
          activeCardCount: 0,
          expiringSoonCardCount: 0,
          updatedAt: now,
          shop
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    findCustomerMembershipDetail: jest.fn(async () => ({
      internalId: 31,
      publicId: detail.publicId,
      status: "active" as const,
      startedAt: now,
      endedAt: null,
      cardCount: 0,
      activeCardCount: 0,
      expiringSoonCardCount: 0,
      updatedAt: now,
      shop,
      cards: []
    }))
  } as unknown as jest.Mocked<ShopMembershipRepositoryPort>;
}

function makeUser(input: {
  id: number;
  identityType: string;
  scopeType: string;
  scopeId: number;
  role: string;
  permissions: string[];
}) {
  return {
    id: input.id,
    needoId: `u${String(input.id).padStart(10, "0")}`,
    email: `member-api-${input.id}@example.com`,
    emailVerifiedAt: now,
    phone: null,
    passwordHash: null,
    username: `User ${input.id}`,
    avatarUrl: null,
    isActive: true,
    isTestAccount: false,
    accessState: { disabled: false, restricted: false },
    sessionGeneration: 0,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: input.id * 10,
        userId: input.id,
        type: input.identityType,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        displayName: `identity-${input.id}`,
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
          code: input.role,
          deletedAt: null,
          rolePermissions: input.permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
}

function fixture(user: ReturnType<typeof makeUser>) {
  const memberRepository = repository();
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async (id: number) => (id === user.id ? user : null)) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 71 }),
    shopMembershipRepository: memberRepository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: user.identities[0].id,
    sessionGeneration: 0
  }).token;
  return { app, repository: memberRepository, token };
}

describe("shop membership APIs", () => {
  it("requires authentication and the exact merchant read permission", async () => {
    const noPermission = fixture(
      makeUser({
        id: 78,
        identityType: "merchant",
        scopeType: "shop",
        scopeId: 71,
        role: "merchant_staff",
        permissions: []
      })
    );
    await request(noPermission.app).get("/api/v1/merchant-admin/shop-memberships").expect(401);
    await request(noPermission.app)
      .get("/api/v1/merchant-admin/shop-memberships")
      .set("Authorization", `Bearer ${noPermission.token}`)
      .expect(403);
  });

  it("allows staff reads but not enrollment, analytics, or operation logs", async () => {
    const staff = fixture(
      makeUser({
        id: 79,
        identityType: "merchant",
        scopeType: "shop",
        scopeId: 71,
        role: "merchant_staff",
        permissions: ["shop.member.view"]
      })
    );
    await request(staff.app)
      .get("/api/v1/merchant-admin/shop-memberships?page=1&pageSize=20&status=active")
      .set("Authorization", `Bearer ${staff.token}`)
      .expect(200);
    await request(staff.app)
      .post("/api/v1/merchant-admin/shop-memberships")
      .set("Authorization", `Bearer ${staff.token}`)
      .send({ customerNeedoId: "u0000000041" })
      .expect(403);
    await request(staff.app)
      .get("/api/v1/merchant-admin/shop-membership-analytics")
      .set("Authorization", `Bearer ${staff.token}`)
      .expect(403);
    await request(staff.app)
      .get("/api/v1/merchant-admin/shop-membership-activities")
      .set("Authorization", `Bearer ${staff.token}`)
      .expect(403);
  });

  it("strictly validates enrollment and returns only the public membership payload", async () => {
    const owner = fixture(
      makeUser({
        id: 80,
        identityType: "merchant",
        scopeType: "shop",
        scopeId: 71,
        role: "merchant_owner",
        permissions: [
          "shop.member.view",
          "shop.member.create",
          "shop.member.analytics.view",
          "shop.member.operation_log.view"
        ]
      })
    );
    await request(owner.app)
      .post("/api/v1/merchant-admin/shop-memberships")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ customerNeedoId: "u0000000041", shopId: 999 })
      .expect(400);
    const response = await request(owner.app)
      .post("/api/v1/merchant-admin/shop-memberships")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ customerNeedoId: "u0000000041" })
      .expect(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({ publicId: detail.publicId, customerNeedoId: "u0000000041" })
    );
    expect(response.body.data).not.toHaveProperty("internalId");
    expect(response.body.data).not.toHaveProperty("customerProfileId");
    expect(response.body.data).not.toHaveProperty("createdAt");
    expect(response.body.data).not.toHaveProperty("updatedAt");
    expect(owner.repository.findCandidateByNeedoId).toHaveBeenCalledWith(71, "u0000000041");
  });

  it("uses customer-profile self scope for customer list and detail", async () => {
    const customer = fixture(
      makeUser({
        id: 81,
        identityType: "customer",
        scopeType: "customer_profile",
        scopeId: 41,
        role: "customer",
        permissions: ["customer-profile:read"]
      })
    );
    const list = await request(customer.app)
      .get("/api/v1/customer-profile/me/shop-memberships?page=1&pageSize=20&status=active")
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(200);
    expect(list.body.data).toMatchObject({ total: 1, page: 1, page_size: 20 });
    await request(customer.app)
      .get(`/api/v1/customer-profile/me/shop-memberships/${detail.publicId}`)
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(200);
    expect(customer.repository.listCustomerMemberships).toHaveBeenCalledWith(41, {
      page: 1,
      pageSize: 20,
      status: "active"
    });
    expect(customer.repository.findCustomerMembershipDetail).toHaveBeenCalledWith(
      41,
      detail.publicId
    );
  });
});
