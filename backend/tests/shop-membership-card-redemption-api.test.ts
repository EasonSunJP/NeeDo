import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type {
  ShopMembershipCardRedemptionCandidateContext,
  ShopMembershipCardRedemptionRecord,
  ShopMembershipCardRedemptionRepositoryPort
} from "../src/services/shop-membership-card-redemption.service";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-09-01T03:00:00.000Z");
const cardPublicId = "00000000-0000-4000-8000-000000000801";
const redemptionPublicId = "00000000-0000-4000-8000-000000000802";
const createBody = { orderNo: "B202609010001", idempotencyKey: "redemption-api-request-001" };
const scope = {
  servicePublicIds: [], categoryCodes: [], excludedServicePublicIds: [], excludedCategoryCodes: [],
  activeFrom: null, activeTo: null
};

const candidate = (): ShopMembershipCardRedemptionCandidateContext => ({
  bookingOrderId: 181,
  orderNo: createBody.orderNo,
  serviceName: "护理服务",
  servicePublicId: null,
  serviceCategoryCode: "body-care",
  serviceStartedAt: now,
  serviceCompletedAt: now,
  eligibleAmountJpy: 10_000,
  consumedPrincipalJpy: 10_000,
  consumedUses: 0,
  principalBalanceBeforeJpy: 20_000,
  principalBalanceAfterJpy: 10_000,
  remainingUsesBefore: null,
  remainingUsesAfter: null,
  cardLockVersionBefore: 2,
  rules: [{ kind: "fixed_per_completion", rewardNdp: 1_000, scope }],
  caps: {},
  platformFeeRateBps: 1_000,
  facts: {
    eligibleAmountJpy: 10_000,
    servicePublicId: null,
    categoryCode: "body-care",
    occurredAt: now.toISOString(),
    completedCountBefore: 0,
    lifetimeEligibleSpendJpyBefore: 0,
    isFirstCardUse: true,
    customerBirthMonth: null,
    birthdayRewardsThisYear: 0,
    consecutiveEligibleMonths: 0,
    rewardedConsecutiveMonthMilestones: [],
    alreadyRewardedTodayNdp: 0,
    alreadyRewardedMonthNdp: 0,
    alreadyRewardedLifetimeNdp: 0
  }
});

const record = (overrides: Partial<ShopMembershipCardRedemptionRecord> = {}): ShopMembershipCardRedemptionRecord => ({
  internalId: 191,
  publicId: redemptionPublicId,
  requestFingerprint: "fingerprint",
  status: "applied",
  rewardStatus: "paid",
  rewardFacts: candidate().facts,
  rewardHits: [],
  rawRewardNdp: 1_000,
  customerRewardNdp: 1_000,
  platformFeeRateBps: 1_000,
  platformFeeNdp: 100,
  totalShopDebitNdp: 1_100,
  rewardCapped: false,
  outstandingRewardNdp: 0,
  consumedPrincipalJpy: 10_000,
  consumedUses: 0,
  principalBalanceBeforeJpy: 20_000,
  principalBalanceAfterJpy: 10_000,
  remainingUsesBefore: null,
  remainingUsesAfter: null,
  redeemedAt: now,
  rewardSettledAt: now,
  refundedAt: null,
  createdAt: now,
  updatedAt: now,
  card: {
    publicId: cardPublicId,
    cardNo: "NMC-00112233445566778899AABB",
    name: "青山储值会员卡",
    type: "stored_value",
    status: "active",
    principalBalanceJpy: 10_000,
    bonusBalanceJpy: 3_000,
    remainingUses: null,
    lockVersion: 3
  },
  order: {
    orderNo: createBody.orderNo,
    serviceName: "护理服务",
    servicePublicId: null,
    serviceCategoryCode: "body-care",
    serviceStartedAt: now,
    serviceCompletedAt: now,
    eligibleAmountJpy: 10_000
  },
  shop: { shopNo: "s000000071", name: "青山护理店" },
  customer: { userId: 41, needoId: "u0000000041", displayName: "王小美" },
  redeemedBy: { needoId: "u0000000090", displayName: "店员" },
  ledgerTransactionNo: "LT-001",
  ...overrides
});

const repository = (overrides: Partial<ShopMembershipCardRedemptionRepositoryPort> = {}) => ({
  findByIdempotencyKey: jest.fn(async () => null),
  listCandidates: jest.fn(async () => ({ list: [candidate()], total: 1, page: 1, page_size: 20 })),
  createWithEvaluationAndSettlement: jest.fn(async (input) => ({
    kind: "created" as const,
    value: record({ requestFingerprint: input.requestFingerprint })
  })),
  listMerchant: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
  listCustomer: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
  ...overrides
}) as jest.Mocked<ShopMembershipCardRedemptionRepositoryPort>;

function makeUser(kind: "merchant" | "customer", permissions: string[]) {
  const merchant = kind === "merchant";
  return {
    id: merchant ? 90 : 41,
    needoId: merchant ? "u0000000090" : "u0000000041",
    email: `${kind}-card-redemption-api@example.com`,
    emailVerifiedAt: now,
    phone: null,
    passwordHash: null,
    username: merchant ? "Redemption Operator" : "王小美",
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
      type: merchant ? "merchant_staff" : "customer",
      scopeType: merchant ? "shop" : "customer_profile",
      scopeId: merchant ? 71 : 51,
      displayName: merchant ? "核销店员" : "王小美",
      isDefault: true,
      isActive: true,
      deletedAt: null
    }],
    identityApplications: [],
    userRoles: [{
      deletedAt: null,
      role: {
        code: merchant ? "merchant_staff" : "customer",
        deletedAt: null,
        rolePermissions: permissions.map((code) => ({
          deletedAt: null,
          permission: { code, type: "api", deletedAt: null }
        }))
      }
    }]
  };
}

function fixture(kind: "merchant" | "customer", permissions: string[]) {
  const user = makeUser(kind, permissions);
  const redemptionRepository = repository();
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async (id: number) => id === user.id ? user : null) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 71 }),
    shopMembershipCardRedemptionRepository: redemptionRepository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: user.identities[0].id,
    sessionGeneration: 0
  }).token;
  return { app, repository: redemptionRepository, token };
}

const candidatesPath = `/api/v1/merchant-admin/shop-membership-cards/${cardPublicId}/redemption-candidates`;
const createPath = `/api/v1/merchant-admin/shop-membership-cards/${cardPublicId}/redemptions`;
const merchantListPath = "/api/v1/merchant-admin/shop-membership-card-redemptions";
const customerListPath = "/api/v1/customer-profile/me/shop-membership-card-redemptions";

describe("shop membership card redemption API", () => {
  it("requires authentication and the exact daily redemption permission", async () => {
    const merchant = fixture("merchant", []);
    await request(merchant.app).post(createPath).send(createBody).expect(401);
    await request(merchant.app).post(createPath).set("Authorization", `Bearer ${merchant.token}`).send(createBody).expect(403);
    expect(merchant.repository.createWithEvaluationAndSettlement).not.toHaveBeenCalled();
  });

  it("rejects client financial fields and returns only safe immutable evidence", async () => {
    const merchant = fixture("merchant", ["shop.member.card.redeem"]);
    await request(merchant.app).post(createPath).set("Authorization", `Bearer ${merchant.token}`)
      .send({ ...createBody, shopId: 999, amountJpy: 1, rewardNdp: 999999 }).expect(400);
    const response = await request(merchant.app).post(createPath)
      .set("Authorization", `Bearer ${merchant.token}`).send(createBody).expect(201);
    expect(response.body.data).toMatchObject({
      publicId: redemptionPublicId,
      consumedPrincipalJpy: 10_000,
      customerRewardNdp: 1_000,
      platformFeeNdp: 100,
      rewardStatus: "paid",
      card: { publicId: cardPublicId, cardNoMasked: "NMC-********************AABB" }
    });
    expect(response.body.data).not.toHaveProperty("internalId");
    expect(response.body.data.card).not.toHaveProperty("cardNo");
  });

  it("serves merchant candidate/history scope and customer-owned history", async () => {
    const merchant = fixture("merchant", ["shop.member.card.redeem", "shop.member.view"]);
    const candidates = await request(merchant.app).get(`${candidatesPath}?page=1&pageSize=20`)
      .set("Authorization", `Bearer ${merchant.token}`).expect(200);
    expect(candidates.body.data.list[0]).toMatchObject({
      orderNo: createBody.orderNo,
      consumption: { principalJpy: 10_000 },
      reward: { totalShopDebitNdp: 1_100 }
    });
    await request(merchant.app).get(merchantListPath)
      .set("Authorization", `Bearer ${merchant.token}`).expect(200);

    const customer = fixture("customer", ["customer-profile:read"]);
    const history = await request(customer.app).get(customerListPath)
      .set("Authorization", `Bearer ${customer.token}`).expect(200);
    expect(history.body.data.list[0]).toMatchObject({ publicId: redemptionPublicId });
    expect(customer.repository.listCustomer).toHaveBeenCalledWith(41, expect.any(Object));
  });
});
