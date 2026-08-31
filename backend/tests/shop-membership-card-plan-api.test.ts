import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type { ShopMembershipCardPlanRepositoryPort } from "../src/repositories/shop-membership-card-plan.repository";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-08-31T03:00:00.000Z");
const planPublicId = "00000000-0000-4000-8000-000000000301";
const servicePublicId = "00000000-0000-4000-8000-000000000101";
const emptyScope = {
  servicePublicIds: [], categoryCodes: [], excludedServicePublicIds: [],
  excludedCategoryCodes: [], activeFrom: null, activeTo: null
};
const draftBody = {
  expectedLockVersion: 0,
  name: "青山 NDP 会员卡",
  description: null,
  cardType: "benefit",
  validity: { mode: "never" },
  issuance: { minInitialPrincipalJpy: null, maxInitialPrincipalJpy: null, minInitialUses: null, maxInitialUses: null },
  caps: { perOrderNdp: null, perDayNdp: null, perMonthNdp: null, lifetimeNdp: null },
  rules: [{ kind: "fixed_per_completion", rewardNdp: 1000, scope: emptyScope }]
};
const previewBody = {
  eligibleAmountJpy: 10_000,
  servicePublicId,
  categoryCode: "body-care",
  scheduledAt: now.toISOString(),
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
};

const version = {
  internalId: 41,
  publicId: "00000000-0000-4000-8000-000000000302",
  version: 1,
  status: "draft" as const,
  lockVersion: 0,
  name: draftBody.name,
  description: null,
  cardType: "benefit" as const,
  validity: { mode: "never" as const },
  issuance: draftBody.issuance,
  caps: draftBody.caps,
  platformFeePolicyPublicId: null,
  platformFeeRateBps: null,
  publishedAt: null,
  rules: [{ publicId: "00000000-0000-4000-8000-000000000303", ruleGroup: "base" as const, sortOrder: 0, ...draftBody.rules[0] }]
};
const plan = {
  internalId: 31,
  publicId: planPublicId,
  status: "draft" as const,
  currentVersion: null,
  draftVersion: version,
  createdAt: now,
  updatedAt: now
};

function repository(overrides: Partial<jest.Mocked<ShopMembershipCardPlanRepositoryPort>> = {}) {
  return {
    listPlans: jest.fn(async () => ({ list: [plan], total: 1, page: 1, page_size: 20 })),
    findPlan: jest.fn(async () => plan),
    createPlanWithDraft: jest.fn(async () => plan),
    updateDraftWithAudit: jest.fn(async () => ({ kind: "updated" as const, value: plan })),
    publishDraftWithAudit: jest.fn(async () => ({
      kind: "published" as const,
      value: { ...plan, status: "active" as const, currentVersion: { ...version, status: "published" as const, platformFeePolicyPublicId: "fee-1", platformFeeRateBps: 1000 }, draftVersion: null }
    })),
    retirePlanWithAudit: jest.fn(async () => ({ kind: "retired" as const, value: { ...plan, status: "retired" as const } })),
    validateShopRuleReferences: jest.fn(async () => true),
    getEffectiveFeePolicy: jest.fn(async () => ({ publicId: "fee-1", version: 1, feeRateBps: 1000, effectiveFrom: now, effectiveTo: null, reason: "initial", createdByNeedoId: null, createdAt: now })),
    listFeePolicies: jest.fn(async () => ({ list: [{ publicId: "fee-1", version: 1, feeRateBps: 1000, effectiveFrom: now, effectiveTo: null, reason: "initial", createdByNeedoId: null, createdAt: now }], total: 1, page: 1, page_size: 20 })),
    getFeePolicySummary: jest.fn(async () => ({ evaluatedAt: now, current: { publicId: "fee-1", version: 1, feeRateBps: 1000, effectiveFrom: now, effectiveTo: null, reason: "initial", createdByNeedoId: null, createdAt: now }, nextScheduled: null, latestVersion: 1 })),
    createFeePolicyVersionWithAudit: jest.fn(async () => ({ kind: "created" as const, value: { publicId: "fee-2", version: 2, feeRateBps: 1200, effectiveFrom: now, effectiveTo: null, reason: "rate update", createdByNeedoId: "u0000000009", createdAt: now } })),
    ...overrides
  } as jest.Mocked<ShopMembershipCardPlanRepositoryPort>;
}

function makeUser(input: { id: number; identityType: string; scopeType: string; scopeId: number | null; role: string; permissions: string[] }) {
  return {
    id: input.id,
    needoId: `u${String(input.id).padStart(10, "0")}`,
    email: `card-plan-api-${input.id}@example.com`,
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
        rolePermissions: input.permissions.map((code) => ({ deletedAt: null, permission: { code, type: "api", deletedAt: null } }))
      }
    }]
  };
}

function fixture(user: ReturnType<typeof makeUser>, repositoryOverrides: Partial<jest.Mocked<ShopMembershipCardPlanRepositoryPort>> = {}) {
  const cardPlanRepository = repository(repositoryOverrides);
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async (id: number) => id === user.id ? user : null) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    shopMembershipCardPlanRepository: cardPlanRepository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: user.identities[0].id,
    sessionGeneration: 0
  }).token;
  return { app, repository: cardPlanRepository, token };
}

const merchantUser = (permissions: string[]) => makeUser({ id: 90, identityType: "merchant_owner", scopeType: "shop", scopeId: 71, role: "merchant_owner", permissions });
const operationsUser = (permissions: string[]) => makeUser({ id: 91, identityType: "platform_admin", scopeType: "global", scopeId: null, role: "finance", permissions });

describe("shop membership card plan APIs", () => {
  it("requires authentication and exact merchant permissions", async () => {
    const noPermission = fixture(merchantUser([]));
    await request(noPermission.app).get("/api/v1/merchant-admin/shop-membership-card-plans").expect(401);
    await request(noPermission.app).get("/api/v1/merchant-admin/shop-membership-card-plans").set("Authorization", `Bearer ${noPermission.token}`).expect(403);

    const readOnly = fixture(merchantUser(["shop.member.card_plan.view"]));
    await request(readOnly.app).get("/api/v1/merchant-admin/shop-membership-card-plans?page=1&pageSize=20").set("Authorization", `Bearer ${readOnly.token}`).expect(200);
    await request(readOnly.app).post("/api/v1/merchant-admin/shop-membership-card-plans").set("Authorization", `Bearer ${readOnly.token}`).send(draftBody).expect(403);
  });

  it("rejects client scope, fee, and unknown reward fields", async () => {
    const owner = fixture(merchantUser(["shop.member.card_plan.manage"]));
    await request(owner.app).post("/api/v1/merchant-admin/shop-membership-card-plans").set("Authorization", `Bearer ${owner.token}`).send({ ...draftBody, shopId: 999 }).expect(400);
    await request(owner.app).post("/api/v1/merchant-admin/shop-membership-card-plans").set("Authorization", `Bearer ${owner.token}`).send({ ...draftBody, platformFeeRateBps: 0 }).expect(400);
    await request(owner.app).post("/api/v1/merchant-admin/shop-membership-card-plans").set("Authorization", `Bearer ${owner.token}`).send({ ...draftBody, rules: [{ ...draftBody.rules[0], giftName: "free service" }] }).expect(400);
    expect(owner.repository.createPlanWithDraft).not.toHaveBeenCalled();
  });

  it("returns paginated public plans and server-authoritative reward cost preview", async () => {
    const owner = fixture(merchantUser(["shop.member.card_plan.view"]));
    const list = await request(owner.app).get("/api/v1/merchant-admin/shop-membership-card-plans?page=1&pageSize=20").set("Authorization", `Bearer ${owner.token}`).expect(200);
    expect(list.body.data).toMatchObject({ total: 1, page: 1, page_size: 20, list: [{ publicId: planPublicId }] });
    expect(list.body.data.list[0]).not.toHaveProperty("internalId");

    const preview = await request(owner.app).post(`/api/v1/merchant-admin/shop-membership-card-plans/${planPublicId}/preview`).set("Authorization", `Bearer ${owner.token}`).send(previewBody).expect(200);
    expect(preview.body.data).toMatchObject({ customerRewardNdp: 1000, platformFeeRateBps: 1000, platformFeeNdp: 100, totalShopDebitNdp: 1100 });
    expect(owner.repository.getEffectiveFeePolicy).toHaveBeenCalled();
  });

  it("returns 404 for a plan outside the shop and 409 for a stale draft lock", async () => {
    const missing = fixture(merchantUser(["shop.member.card_plan.view"]), { findPlan: jest.fn(async (...args: [number, string]) => {
      void args;
      return null;
    }) });
    await request(missing.app).get(`/api/v1/merchant-admin/shop-membership-card-plans/${planPublicId}`).set("Authorization", `Bearer ${missing.token}`).expect(404);

    const stale = fixture(merchantUser(["shop.member.card_plan.manage"]), { updateDraftWithAudit: jest.fn(async (...args: Parameters<ShopMembershipCardPlanRepositoryPort["updateDraftWithAudit"]>) => {
      void args;
      return { kind: "version_conflict" as const };
    }) });
    await request(stale.app).patch(`/api/v1/merchant-admin/shop-membership-card-plans/${planPublicId}/draft`).set("Authorization", `Bearer ${stale.token}`).send({ ...draftBody, expectedLockVersion: 9 }).expect(409);
  });

  it("publishes with its dedicated permission and returns the immutable fee snapshot", async () => {
    const publisher = fixture(merchantUser(["shop.member.card_plan.publish"]));
    const response = await request(publisher.app).post(`/api/v1/merchant-admin/shop-membership-card-plans/${planPublicId}/publish`).set("Authorization", `Bearer ${publisher.token}`).send({ expectedLockVersion: 0 }).expect(201);
    expect(response.body.data.currentVersion).toMatchObject({ status: "published", platformFeePolicyPublicId: "fee-1", platformFeeRateBps: 1000 });
  });

  it("protects fee history and immutable version creation with operations permissions", async () => {
    const reader = fixture(operationsUser(["page:backoffice-membership-reward-fee"]));
    const response = await request(reader.app).get("/api/v1/backoffice/membership-reward-fee-policy?page=1&pageSize=20").set("Authorization", `Bearer ${reader.token}`).expect(200);
    expect(response.body.data).toMatchObject({ summary: { latestVersion: 1 }, history: { total: 1, page_size: 20 } });
    const futureEffectiveFrom = "2099-08-31T03:00:00.000Z";
    await request(reader.app).post("/api/v1/backoffice/membership-reward-fee-policy/versions").set("Authorization", `Bearer ${reader.token}`).send({ feeRateBps: 1200, expectedVersion: 1, effectiveFrom: futureEffectiveFrom, reason: "rate update" }).expect(403);

    const writer = fixture(operationsUser(["button:backoffice-membership-reward-fee-create"]));
    await request(writer.app).post("/api/v1/backoffice/membership-reward-fee-policy/versions").set("Authorization", `Bearer ${writer.token}`).send({ feeRateBps: 1200, expectedVersion: 1, effectiveFrom: futureEffectiveFrom, reason: "rate update", shopId: 71 }).expect(400);
    await request(writer.app).post("/api/v1/backoffice/membership-reward-fee-policy/versions").set("Authorization", `Bearer ${writer.token}`).send({ feeRateBps: 1200, expectedVersion: 1, effectiveFrom: futureEffectiveFrom, reason: "rate update" }).expect(201);
  });
});
