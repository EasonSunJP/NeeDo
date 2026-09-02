import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import {
  MembershipAnalyticsIncompleteHistoryError,
  type MembershipAnalyticsListInput,
  type MembershipAnalyticsRepositoryInput,
  type MembershipTrendSeries
} from "../src/domain/membership-analytics";
import type { MembershipAnalyticsRepositoryPort } from "../src/repositories/membership-analytics.repository";
import {
  MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS
} from "../src/routes/membership-analytics.routes";
import { AuthTokenService } from "../src/services/auth-token.service";
import {
  createDirectShopContextRepository,
  createMerchantAccountShopContextRepository
} from "./helpers/merchant-shop-context";

const now = new Date("2026-09-01T05:30:00.000Z");
const shopPublicId = "shop0000000071";
const pointKeys = ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"];
const series: MembershipTrendSeries = [
  { seriesKey: "added", label: "Added members", unit: "people", points: pointKeys.map((key) => ({ key, label: key.slice(5), value: 1 })) },
  { seriesKey: "removed", label: "Removed members", unit: "people", points: pointKeys.map((key) => ({ key, label: key.slice(5), value: 0 })) },
  { seriesKey: "net", label: "Net members", unit: "people", points: pointKeys.map((key) => ({ key, label: key.slice(5), value: 1 })) }
];

const listItem = {
  userNeedoId: "u0000000041",
  nickname: "美咲",
  city: "东京",
  shopPublicId,
  shopName: "青山护理店",
  membershipPublicId: "00000000-0000-4000-8000-000000000031",
  planName: "月度会员",
  cardPublicId: "00000000-0000-4000-8000-000000000481",
  cardNoMasked: "•••• •••• •••• AABB",
  acquisitionSource: "offline_paid" as const,
  addedAt: "2026-08-30T03:00:00.000Z",
  firstPaidAt: "2026-05-01T03:00:00.000Z",
  memberStatus: "active" as const,
  cardStatus: "active" as const,
  expiresAt: "2026-09-30T03:00:00.000Z"
};

const makeUser = (input: {
  id: number;
  identityType: string;
  scopeType: string;
  scopeId: number | null;
  role: string;
  permissions: string[];
}) => ({
  id: input.id,
  needoId: `u${String(input.id).padStart(10, "0")}`,
  email: `membership-analytics-${input.id}@example.com`,
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
  identities: [{
    id: input.id * 10,
    userId: input.id,
    type: input.identityType,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    displayName: `identity-${input.id}`,
    isDefault: true,
    isActive: true,
    deletedAt: null
  }],
  identityApplications: [],
  userRoles: [{
    deletedAt: null,
    role: {
      code: input.role,
      deletedAt: null,
      rolePermissions: input.permissions.map((code) => ({
        deletedAt: null,
        permission: { code, type: "api", deletedAt: null }
      }))
    }
  }]
});

const createRepository = (): jest.Mocked<MembershipAnalyticsRepositoryPort> => ({
  getTrend: jest.fn<Promise<MembershipTrendSeries>, [MembershipAnalyticsRepositoryInput]>(async () => series),
  listAddedMembers: jest.fn<ReturnType<MembershipAnalyticsRepositoryPort["listAddedMembers"]>, [MembershipAnalyticsListInput]>(async (input) => ({
    list: [listItem], total: 1, page: input.page, page_size: input.pageSize
  }))
});

const fixture = (user: ReturnType<typeof makeUser>, selectedShop = false) => {
  const repository = createRepository();
  const auditCreate = jest.fn(async () => undefined);
  const merchantShopContextRepository = selectedShop
    ? createMerchantAccountShopContextRepository({
        merchantAccountId: user.identities[0].scopeId ?? 501,
        shopId: 71,
        shopPublicId
      })
    : createDirectShopContextRepository({ shopId: 71, shopPublicId });
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserById: jest.fn(async (id: number) => id === user.id ? user : null)
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository: { create: auditCreate },
    merchantShopContextRepository,
    membershipAnalyticsRepository: repository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: user.identities[0].id,
    sessionGeneration: 0,
    ...(selectedShop ? { merchantShopPublicId: shopPublicId } : {})
  }).token;
  return { app, repository, auditCreate, token };
};

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("formal membership analytics API", () => {
  it("serves platform trend and paginated list through actual createApp routes", async () => {
    const operator = fixture(makeUser({
      id: 91, identityType: "platform", scopeType: "global", scopeId: null,
      role: "operator", permissions: [MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.backoffice]
    }));
    const trend = await request(operator.app)
      .get("/api/v1/backoffice/analytics/members/trend?period=last7days&city=%E4%B8%9C%E4%BA%AC")
      .set(bearer(operator.token))
      .expect(200);
    expect(trend.body.data).toMatchObject({
      dataStatus: "ready",
      filter: { period: "last7days", city: "东京", timeZone: "Asia/Tokyo" },
      series: [{ seriesKey: "added" }, { seriesKey: "removed" }, { seriesKey: "net" }]
    });

    const list = await request(operator.app)
      .get("/api/v1/backoffice/analytics/members?period=last7days&city=%E4%B8%9C%E4%BA%AC&needoId=u0000000041&nickname=%E7%BE%8E%E5%92%B2&page=1&pageSize=20")
      .set(bearer(operator.token))
      .expect(200);
    expect(list.body.data).toEqual({ list: [listItem], total: 1, page: 1, page_size: 20 });
    expect(JSON.stringify(list.body)).not.toContain("NMC-00112233445566778899AABB");
    expect(JSON.stringify(list.body)).not.toMatch(/customerProfileId|cardId|deletedAt|issuanceNote|issuanceReference/u);
    expect(operator.repository.listAddedMembers).toHaveBeenCalledWith(expect.objectContaining({
      scope: { kind: "platform" }, city: "东京", needoId: "u0000000041", nickname: "美咲"
    }));
  });

  it("uses the merchant-account selected shop and rejects client scope overrides", async () => {
    const owner = fixture(makeUser({
      id: 92, identityType: "merchant_owner", scopeType: "merchant_account", scopeId: 501,
      role: "merchant_owner", permissions: [MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.merchant]
    }), true);
    await request(owner.app)
      .get("/api/v1/merchant-admin/analytics/members/trend?period=last30days")
      .set(bearer(owner.token))
      .expect(200);
    expect(owner.repository.getTrend).toHaveBeenCalledWith(expect.objectContaining({
      scope: { kind: "shop", shopId: 71 }, city: null
    }));

    await request(owner.app)
      .get("/api/v1/merchant-admin/analytics/members/trend?period=last30days&city=%E4%B8%9C%E4%BA%AC")
      .set(bearer(owner.token))
      .expect(400);
    await request(owner.app)
      .get("/api/v1/merchant-admin/analytics/members?period=last30days&shopId=72")
      .set(bearer(owner.token))
      .expect(400);
  });

  it("accepts the largest page whose maximum page-size offset remains a safe integer", async () => {
    const operator = fixture(makeUser({
      id: 192, identityType: "platform", scopeType: "global", scopeId: null,
      role: "operator", permissions: [MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.backoffice]
    }));
    await request(operator.app)
      .get("/api/v1/backoffice/analytics/members?period=last7days&page=90071992547409&pageSize=100")
      .set(bearer(operator.token))
      .expect(200);
    expect(operator.repository.listAddedMembers).toHaveBeenCalledWith(expect.objectContaining({
      page: 90071992547409,
      pageSize: 100
    }));
  });

  it("requires authentication and exact permissions for both scopes", async () => {
    const noPermission = fixture(makeUser({
      id: 93, identityType: "platform", scopeType: "global", scopeId: null,
      role: "viewer", permissions: []
    }));
    await request(noPermission.app).get("/api/v1/backoffice/analytics/members/trend").expect(401);
    await request(noPermission.app)
      .get("/api/v1/backoffice/analytics/members/trend")
      .set(bearer(noPermission.token))
      .expect(403);

    const staff = fixture(makeUser({
      id: 94, identityType: "merchant", scopeType: "shop", scopeId: 71,
      role: "merchant_staff", permissions: []
    }));
    await request(staff.app)
      .get("/api/v1/merchant-admin/analytics/members")
      .set(bearer(staff.token))
      .expect(403);
  });

  it("rejects platform permissions when the active identity is scout", async () => {
    const switched = fixture(makeUser({
      id: 193,
      identityType: "scout",
      scopeType: "global",
      scopeId: null,
      role: "operator",
      permissions: [MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.backoffice]
    }));
    await request(switched.app)
      .get("/api/v1/backoffice/analytics/members/trend")
      .set(bearer(switched.token))
      .expect(403);
    await request(switched.app)
      .get("/api/v1/backoffice/analytics/members")
      .set(bearer(switched.token))
      .expect(403);
    expect(switched.repository.getTrend).not.toHaveBeenCalled();
    expect(switched.repository.listAddedMembers).not.toHaveBeenCalled();
  });

  it.each([
    ["customer", "customer_profile", 41],
    ["technician", "technician_profile", 51],
    ["merchant", "shop", 72]
  ])("fails closed for %s merchant analytics access", async (identityType, scopeType, scopeId) => {
    const outsider = fixture(makeUser({
      id: 95 + scopeId, identityType, scopeType, scopeId,
      role: identityType, permissions: [MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.merchant]
    }));
    await request(outsider.app)
      .get("/api/v1/merchant-admin/analytics/members/trend")
      .set(bearer(outsider.token))
      .expect(403);
    expect(outsider.repository.getTrend).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/v1/backoffice/analytics/members/trend?period=custom&from=2026-08-01", "operator"],
    ["/api/v1/backoffice/analytics/members?period=last7days&pageSize=101", "operator"],
    ["/api/v1/backoffice/analytics/members?period=last7days&page=90071992547410", "operator"],
    ["/api/v1/backoffice/analytics/members?period=last7days&needoId=U0000000041", "operator"],
    ["/api/v1/backoffice/analytics/members?period=last7days&nickname=%20", "operator"],
    ["/api/v1/merchant-admin/analytics/members?period=last7days&unknown=true", "merchant"]
  ])("strictly rejects malformed query %s", async (path, kind) => {
    const isMerchant = kind === "merchant";
    const invalid = fixture(makeUser({
      id: isMerchant ? 191 : 190,
      identityType: isMerchant ? "merchant" : "operator",
      scopeType: isMerchant ? "shop" : "global",
      scopeId: isMerchant ? 71 : null,
      role: isMerchant ? "merchant_owner" : "operator",
      permissions: [isMerchant
        ? MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.merchant
        : MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.backoffice]
    }));
    await request(invalid.app).get(path).set(bearer(invalid.token)).expect(400).expect({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      data: null
    });
  });

  it("publishes incomplete authority as the stable 409 without a partial payload", async () => {
    const operator = fixture(makeUser({
      id: 192, identityType: "platform", scopeType: "global", scopeId: null,
      role: "operator", permissions: [MEMBERSHIP_ANALYTICS_ROUTE_PERMISSIONS.backoffice]
    }));
    operator.repository.getTrend.mockRejectedValueOnce(new MembershipAnalyticsIncompleteHistoryError());
    await request(operator.app)
      .get("/api/v1/backoffice/analytics/members/trend")
      .set(bearer(operator.token))
      .expect(409)
      .expect({
        code: ERROR_CODES.MEMBERSHIP_ANALYTICS_INCOMPLETE_HISTORY,
        message: "error.membership_analytics.incomplete_history",
        data: null
      });
  });
});
