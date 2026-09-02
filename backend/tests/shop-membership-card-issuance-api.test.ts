import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type { ShopMembershipCardIssuanceRepositoryPort } from "../src/services/shop-membership-card-issuance.service";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-08-31T03:00:00.000Z");
const membershipPublicId = "00000000-0000-4000-8000-000000000401";
const planPublicId = "00000000-0000-4000-8000-000000000402";
const planVersionPublicId = "00000000-0000-4000-8000-000000000403";
const idempotencyKey = "00000000-0000-4000-8000-000000000404";

const body = {
  planPublicId,
  initialPrincipalJpy: 10_000,
  initialUses: null,
  issuanceSource: "offline_paid" as const,
  issuanceReference: "receipt-1",
  issuanceNote: "客户已在线下付款",
  idempotencyKey
};

const issuanceContext = {
  membership: { internalId: 31, publicId: membershipPublicId, customerUserId: 41, customerNeedoId: "u0000000041", customerDisplayName: "王小美" },
  shop: { internalId: 71, shopNo: "s000000071", name: "青山护理店" },
  plan: { internalId: 51, publicId: planPublicId },
  version: {
    internalId: 61,
    publicId: planVersionPublicId,
    version: 3,
    name: "青山储值会员卡",
    cardType: "stored_value" as const,
    validity: { mode: "fixed_days" as const, days: 30 },
    minInitialPrincipalJpy: 1_000,
    maxInitialPrincipalJpy: 50_000,
    minInitialUses: null,
    maxInitialUses: null,
    platformFeeRateBps: 1_000
  }
};

function record(fingerprint: string) {
  return {
    internalId: 81,
    shopId: 71,
    publicId: "00000000-0000-4000-8000-000000000481",
    cardNo: "NMC-00112233445566778899AABB",
    name: "青山储值会员卡",
    type: "stored_value" as const,
    status: "active" as const,
    principalBalanceJpy: 10_000,
    bonusBalanceJpy: 0,
    remainingUses: null,
    totalUses: null,
    initialPrincipalJpy: 10_000,
    initialUses: null,
    issuanceSource: "offline_paid" as const,
    issuanceReference: "receipt-1",
    issuanceNote: "客户已在线下付款",
    issuedAt: now,
    expiresAt: new Date("2026-09-30T03:00:00.000Z"),
    frozenAt: null,
    platformFeeRateBpsSnapshot: 1_000,
    issuanceFingerprint: fingerprint,
    planPublicId,
    planVersionPublicId,
    planVersion: 3,
    customerNeedoId: "u0000000041",
    customerDisplayName: "王小美"
  };
}

function repository(overrides: Partial<ShopMembershipCardIssuanceRepositoryPort> = {}) {
  return {
    findByIdempotencyKey: jest.fn(async () => null),
    getIssuanceContext: jest.fn(async () => ({ kind: "ready" as const, value: issuanceContext })),
    issueCardWithAuditAndNotification: jest.fn(async (input) => ({ kind: "created" as const, value: record(input.issuanceFingerprint) })),
    ...overrides
  } as jest.Mocked<ShopMembershipCardIssuanceRepositoryPort>;
}

function makeUser(permissions: string[]) {
  return {
    id: 90,
    needoId: "u0000000090",
    email: "card-issuance-api@example.com",
    emailVerifiedAt: now,
    phone: null,
    passwordHash: null,
    username: "Card Issuer",
    avatarUrl: null,
    isActive: true,
    isTestAccount: false,
    accessState: { disabled: false, restricted: false },
    sessionGeneration: 0,
    lastLoginAt: null,
    deletedAt: null,
    identities: [{ id: 900, userId: 90, type: "merchant_owner", scopeType: "shop", scopeId: 71, displayName: "青山店主", isDefault: true, isActive: true, deletedAt: null }],
    identityApplications: [],
    userRoles: [{ deletedAt: null, role: { code: "merchant_owner", deletedAt: null, rolePermissions: permissions.map((code) => ({ deletedAt: null, permission: { code, type: "api", deletedAt: null } })) } }]
  };
}

function fixture(permissions: string[], overrides: Partial<ShopMembershipCardIssuanceRepositoryPort> = {}) {
  const user = makeUser(permissions);
  const issuanceRepository = repository(overrides);
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async (id: number) => id === user.id ? user : null) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 71 }),
    shopMembershipCardIssuanceRepository: issuanceRepository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({ id: user.id, email: user.email, currentIdentityId: user.identities[0].id, sessionGeneration: 0 }).token;
  return { app, repository: issuanceRepository, token };
}

const path = `/api/v1/merchant-admin/shop-memberships/${membershipPublicId}/cards`;

describe("shop membership card issuance API", () => {
  it("requires authentication and the exact issue permission", async () => {
    const noPermission = fixture([]);
    await request(noPermission.app).post(path).send(body).expect(401);
    await request(noPermission.app).post(path).set("Authorization", `Bearer ${noPermission.token}`).send(body).expect(403);
    expect(noPermission.repository.issueCardWithAuditAndNotification).not.toHaveBeenCalled();
  });

  it("strictly rejects client shop scope and malformed type fields", async () => {
    const issuer = fixture(["shop.member.card.issue"]);
    await request(issuer.app).post(path).set("Authorization", `Bearer ${issuer.token}`).send({ ...body, shopId: 999 }).expect(400);
    await request(issuer.app).post(path).set("Authorization", `Bearer ${issuer.token}`).send({ ...body, initialUses: 2 }).expect(400);
    await request(issuer.app).post(path).set("Authorization", `Bearer ${issuer.token}`).send({ ...body, idempotencyKey: "short" }).expect(400);
    expect(issuer.repository.issueCardWithAuditAndNotification).not.toHaveBeenCalled();
  });

  it("returns 201 and the safe immutable issuance snapshot on first issue", async () => {
    const issuer = fixture(["shop.member.card.issue"]);
    const response = await request(issuer.app).post(path).set("Authorization", `Bearer ${issuer.token}`).send(body).expect(201);

    expect(response.body.data).toMatchObject({
      publicId: "00000000-0000-4000-8000-000000000481",
      cardNoMasked: "•••• •••• •••• AABB",
      initialPrincipalJpy: 10_000,
      platformFeeRateBpsSnapshot: 1_000,
      planPublicId,
      planVersionPublicId,
      planVersion: 3,
      replayed: false
    });
    expect(response.body.data).not.toHaveProperty("internalId");
    expect(response.body.data).not.toHaveProperty("cardNo");
  });

  it("returns 200 for an exact idempotent replay and 409 for a changed request", async () => {
    const first = fixture(["shop.member.card.issue"]);
    await request(first.app).post(path).set("Authorization", `Bearer ${first.token}`).send(body).expect(201);
    const createInput = first.repository.issueCardWithAuditAndNotification.mock.calls[0][0];

    const replay = fixture(["shop.member.card.issue"], { findByIdempotencyKey: jest.fn(async () => record(createInput.issuanceFingerprint)) });
    await request(replay.app).post(path).set("Authorization", `Bearer ${replay.token}`).send(body).expect(200);
    expect(replay.repository.issueCardWithAuditAndNotification).not.toHaveBeenCalled();

    const conflict = fixture(["shop.member.card.issue"], { findByIdempotencyKey: jest.fn(async () => record("different")) });
    await request(conflict.app).post(path).set("Authorization", `Bearer ${conflict.token}`).send(body).expect(409);
  });

  it("keeps cross-shop and inactive records behind stable errors", async () => {
    const missing = fixture(["shop.member.card.issue"], { getIssuanceContext: jest.fn(async () => ({ kind: "not_found" as const })) });
    await request(missing.app).post(path).set("Authorization", `Bearer ${missing.token}`).send(body).expect(404);
    const inactive = fixture(["shop.member.card.issue"], { getIssuanceContext: jest.fn(async () => ({ kind: "invalid_state" as const })) });
    await request(inactive.app).post(path).set("Authorization", `Bearer ${inactive.token}`).send(body).expect(409);
  });
});
