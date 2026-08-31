import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type {
  ShopMembershipCardAdjustmentRecord,
  ShopMembershipCardAdjustmentRepositoryPort
} from "../src/services/shop-membership-card-adjustment.service";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-08-31T03:00:00.000Z");
const cardPublicId = "00000000-0000-4000-8000-000000000601";
const requestPublicId = "00000000-0000-4000-8000-000000000602";
const createBody = {
  targetPrincipalBalanceJpy: 12_000,
  targetRemainingUses: null,
  reason: "线下账目核对后修正",
  idempotencyKey: "adjustment-request-api-001"
};

const record = (overrides: Partial<ShopMembershipCardAdjustmentRecord> = {}): ShopMembershipCardAdjustmentRecord => ({
  internalId: 91,
  publicId: requestPublicId,
  status: "pending",
  reason: createBody.reason,
  beforePrincipalBalanceJpy: 10_000,
  targetPrincipalBalanceJpy: 12_000,
  beforeRemainingUses: null,
  targetRemainingUses: null,
  cardLockVersionBefore: 1,
  requestFingerprint: "fingerprint",
  decisionFingerprint: null,
  expiresAt: new Date("2026-09-03T03:00:00.000Z"),
  decidedAt: null,
  cancelledAt: null,
  invalidatedAt: null,
  createdAt: now,
  updatedAt: now,
  card: {
    publicId: cardPublicId,
    cardNo: "NMC-00112233445566778899AABB",
    name: "青山储值会员卡",
    type: "stored_value",
    status: "active",
    principalBalanceJpy: 10_000,
    bonusBalanceJpy: 0,
    remainingUses: null,
    totalUses: null,
    lockVersion: 1
  },
  shop: { shopNo: "s000000071", name: "青山护理店" },
  customer: { userId: 41, needoId: "u0000000041", displayName: "王小美" },
  ...overrides
});

const repository = (overrides: Partial<ShopMembershipCardAdjustmentRepositoryPort> = {}) => ({
  findByRequestIdempotencyKey: jest.fn(async () => null),
  getMerchantCardContext: jest.fn(async () => ({ kind: "ready" as const, value: record().card })),
  createRequestWithAuditAndNotification: jest.fn(async (input) => ({ kind: "created" as const, value: record({ requestFingerprint: input.requestFingerprint }) })),
  findByDecisionIdempotencyKey: jest.fn(async () => null),
  decideRequestWithAuditAndNotification: jest.fn(async (input) => ({
    kind: input.decision === "approve" ? "approved" as const : "rejected" as const,
    value: record({ status: input.decision === "approve" ? "approved" : "rejected", decisionFingerprint: input.decisionFingerprint, decidedAt: now })
  })),
  cancelRequestWithAuditAndNotification: jest.fn(async () => ({ kind: "cancelled" as const, value: record({ status: "cancelled", cancelledAt: now }) })),
  listMerchantRequests: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
  listCustomerRequests: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
  ...overrides
}) as jest.Mocked<ShopMembershipCardAdjustmentRepositoryPort>;

function makeUser(kind: "merchant" | "customer", permissions: string[]) {
  const merchant = kind === "merchant";
  return {
    id: merchant ? 90 : 41,
    needoId: merchant ? "u0000000090" : "u0000000041",
    email: `${kind}-card-adjustment-api@example.com`,
    emailVerifiedAt: now,
    phone: null,
    passwordHash: null,
    username: merchant ? "Card Adjuster" : "王小美",
    avatarUrl: null,
    isActive: true,
    isTestAccount: false,
    accessState: { disabled: false, restricted: false },
    sessionGeneration: 0,
    lastLoginAt: null,
    deletedAt: null,
    identities: [{
      id: merchant ? 900 : 410,
      userId: merchant ? 90 : 41,
      type: merchant ? "merchant_owner" : "customer",
      scopeType: merchant ? "shop" : "customer_profile",
      scopeId: merchant ? 71 : 51,
      displayName: merchant ? "青山店主" : "王小美",
      isDefault: true,
      isActive: true,
      deletedAt: null
    }],
    identityApplications: [],
    userRoles: [{
      deletedAt: null,
      role: {
        code: merchant ? "merchant_owner" : "customer",
        deletedAt: null,
        rolePermissions: permissions.map((code) => ({ deletedAt: null, permission: { code, type: "api", deletedAt: null } }))
      }
    }]
  };
}

function fixture(kind: "merchant" | "customer", permissions: string[], overrides: Partial<ShopMembershipCardAdjustmentRepositoryPort> = {}) {
  const user = makeUser(kind, permissions);
  const adjustmentRepository = repository(overrides);
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async (id: number) => id === user.id ? user : null) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 71 }),
    shopMembershipCardAdjustmentRepository: adjustmentRepository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({ id: user.id, email: user.email, currentIdentityId: user.identities[0].id, sessionGeneration: 0 }).token;
  return { app, repository: adjustmentRepository, token };
}

const createPath = `/api/v1/merchant-admin/shop-membership-cards/${cardPublicId}/adjustment-requests`;
const merchantListPath = "/api/v1/merchant-admin/shop-membership-card-adjustment-requests";
const customerListPath = "/api/v1/customer-profile/me/shop-membership-card-adjustment-requests";
const decisionPath = `/api/v1/customer-profile/me/shop-membership-card-adjustment-requests/${requestPublicId}/decision`;

describe("shop membership card adjustment API", () => {
  it("requires authentication and the exact merchant adjustment permission", async () => {
    const merchant = fixture("merchant", []);
    await request(merchant.app).post(createPath).send(createBody).expect(401);
    await request(merchant.app).post(createPath).set("Authorization", `Bearer ${merchant.token}`).send(createBody).expect(403);
    expect(merchant.repository.createRequestWithAuditAndNotification).not.toHaveBeenCalled();
  });

  it("strictly rejects client scope and creates a safe pending request", async () => {
    const merchant = fixture("merchant", ["shop.member.card.adjust.request"]);
    await request(merchant.app).post(createPath).set("Authorization", `Bearer ${merchant.token}`).send({ ...createBody, shopId: 999 }).expect(400);
    const response = await request(merchant.app).post(createPath).set("Authorization", `Bearer ${merchant.token}`).send(createBody).expect(201);
    expect(response.body.data).toMatchObject({
      publicId: requestPublicId,
      status: "pending",
      beforeValue: 10_000,
      targetValue: 12_000,
      difference: 2_000,
      replayed: false
    });
    expect(response.body.data.remainingSeconds).toBeGreaterThan(0);
    expect(response.body.data.remainingSeconds).toBeLessThanOrEqual(259_200);
    expect(response.body.data).not.toHaveProperty("internalId");
    expect(response.body.data.card).not.toHaveProperty("cardNo");
  });

  it("returns paginated merchant history and supports cancellation", async () => {
    const merchant = fixture("merchant", ["shop.member.card.adjust.request"]);
    const list = await request(merchant.app).get(`${merchantListPath}?page=1&pageSize=20&status=pending`).set("Authorization", `Bearer ${merchant.token}`).expect(200);
    expect(list.body.data).toMatchObject({ total: 1, page: 1, page_size: 20, list: [expect.objectContaining({ publicId: requestPublicId })] });
    await request(merchant.app).post(`${merchantListPath}/${requestPublicId}/cancel`).set("Authorization", `Bearer ${merchant.token}`).send({}).expect(200);
  });

  it("lets only the customer identity list and decide its own requests", async () => {
    const customer = fixture("customer", ["customer-profile:read"]);
    const list = await request(customer.app).get(customerListPath).set("Authorization", `Bearer ${customer.token}`).expect(200);
    expect(list.body.data.total).toBe(1);
    const result = await request(customer.app).post(decisionPath).set("Authorization", `Bearer ${customer.token}`).send({ decision: "approve", idempotencyKey: "adjustment-decision-api-001" }).expect(200);
    expect(result.body.data).toMatchObject({ publicId: requestPublicId, status: "approved", replayed: false });
    expect(customer.repository.decideRequestWithAuditAndNotification).toHaveBeenCalledWith(expect.objectContaining({ customerUserId: 41, decision: "approve" }));
  });
});
