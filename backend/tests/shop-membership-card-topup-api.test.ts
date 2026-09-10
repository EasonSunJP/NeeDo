import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import type {
  ShopMembershipCardTopUpRecord,
  ShopMembershipCardTopUpRepositoryPort
} from "../src/services/shop-membership-card-topup.service";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const now = new Date("2026-09-01T03:00:00.000Z");
const cardPublicId = "00000000-0000-4000-8000-000000000701";
const topUpPublicId = "00000000-0000-4000-8000-000000000702";
const createBody = {
  amountJpy: 5_000,
  paymentMethod: "cash" as const,
  paymentReference: "receipt-topup-001",
  note: "店内现金充值",
  idempotencyKey: "topup-api-request-001"
};

const record = (
  overrides: Partial<ShopMembershipCardTopUpRecord> = {}
): ShopMembershipCardTopUpRecord => ({
  internalId: 101,
  publicId: topUpPublicId,
  amountJpy: createBody.amountJpy,
  paymentMethod: createBody.paymentMethod,
  paymentReference: createBody.paymentReference,
  note: createBody.note,
  principalBalanceBeforeJpy: 10_000,
  principalBalanceAfterJpy: 15_000,
  cardLockVersionBefore: 2,
  requestFingerprint: "fingerprint",
  createdAt: now,
  updatedAt: now,
  card: {
    publicId: cardPublicId,
    cardNo: "NMC-00112233445566778899AABB",
    name: "青山储值会员卡",
    type: "stored_value",
    status: "active",
    principalBalanceJpy: 15_000,
    bonusBalanceJpy: 0,
    expiresAt: new Date("2027-09-01T03:00:00.000Z"),
    lockVersion: 3
  },
  shop: { shopNo: "s000000071", name: "青山护理店" },
  customer: { userId: 41, needoId: "u0000000041", displayName: "王小美" },
  createdBy: { needoId: "u0000000090", displayName: "青山店主" },
  ...overrides
});

const repository = (overrides: Partial<ShopMembershipCardTopUpRepositoryPort> = {}) =>
  ({
    findByIdempotencyKey: jest.fn(async () => null),
    createWithAuditAndNotification: jest.fn(async (input) => ({
      kind: "created" as const,
      value: record({ requestFingerprint: input.requestFingerprint })
    })),
    listMerchant: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
    listCustomer: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
    ...overrides
  }) as jest.Mocked<ShopMembershipCardTopUpRepositoryPort>;

function makeUser(kind: "merchant" | "customer", permissions: string[]) {
  const merchant = kind === "merchant";
  return {
    id: merchant ? 90 : 41,
    needoId: merchant ? "u0000000090" : "u0000000041",
    email: `${kind}-card-topup-api@example.com`,
    emailVerifiedAt: now,
    phone: null,
    passwordHash: null,
    username: merchant ? "Card Top-up Operator" : "王小美",
    avatarUrl: null,
    isActive: true,
    isTestAccount: false,
    accessState: { disabled: false, restricted: false },
    sessionGeneration: 0,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: merchant ? 900 : 410,
        userId: merchant ? 90 : 41,
        type: merchant ? "merchant_owner" : "customer",
        scopeType: merchant ? "shop" : "customer_profile",
        scopeId: merchant ? 71 : 51,
        displayName: merchant ? "青山店主" : "王小美",
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
          code: merchant ? "merchant_owner" : "customer",
          deletedAt: null,
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
}

function fixture(
  kind: "merchant" | "customer",
  permissions: string[],
  overrides: Partial<ShopMembershipCardTopUpRepositoryPort> = {}
) {
  const user = makeUser(kind, permissions);
  const topUpRepository = repository(overrides);
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async (id: number) => (id === user.id ? user : null)) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    auditLogRepository: { create: jest.fn(async () => undefined) },
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 71 }),
    shopMembershipCardTopUpRepository: topUpRepository
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: user.identities[0].id,
    sessionGeneration: 0
  }).token;
  return { app, repository: topUpRepository, token };
}

const createPath = `/api/v1/merchant-admin/shop-membership-cards/${cardPublicId}/top-ups`;
const merchantListPath = "/api/v1/merchant-admin/shop-membership-card-top-ups";
const customerListPath = "/api/v1/customer-profile/me/shop-membership-card-top-ups";

describe("shop membership card top-up API", () => {
  it("requires authentication and the exact merchant top-up permission", async () => {
    const merchant = fixture("merchant", []);
    await request(merchant.app).post(createPath).send(createBody).expect(401);
    await request(merchant.app)
      .post(createPath)
      .set("Authorization", `Bearer ${merchant.token}`)
      .send(createBody)
      .expect(403);
    expect(merchant.repository.createWithAuditAndNotification).not.toHaveBeenCalled();
  });

  it("strictly rejects client scope and creates a safe immutable top-up", async () => {
    const merchant = fixture("merchant", ["shop.member.card.topup.create"]);
    await request(merchant.app)
      .post(createPath)
      .set("Authorization", `Bearer ${merchant.token}`)
      .send({ ...createBody, shopId: 999 })
      .expect(400);
    const response = await request(merchant.app)
      .post(createPath)
      .set("Authorization", `Bearer ${merchant.token}`)
      .send(createBody)
      .expect(201);
    expect(response.body.data).toMatchObject({
      publicId: topUpPublicId,
      amountJpy: 5_000,
      principalBalanceBeforeJpy: 10_000,
      principalBalanceAfterJpy: 15_000,
      replayed: false,
      card: { publicId: cardPublicId, cardNoMasked: "NMC-********************AABB" }
    });
    expect(response.body.data).not.toHaveProperty("internalId");
    expect(response.body.data.card).not.toHaveProperty("cardNo");
  });

  it("returns 200 for an exact replay and 409 for changed contents", async () => {
    const first = fixture("merchant", ["shop.member.card.topup.create"]);
    await request(first.app)
      .post(createPath)
      .set("Authorization", `Bearer ${first.token}`)
      .send(createBody)
      .expect(201);
    const input = first.repository.createWithAuditAndNotification.mock.calls[0][0];

    const replay = fixture("merchant", ["shop.member.card.topup.create"], {
      findByIdempotencyKey: jest.fn(async () =>
        record({ requestFingerprint: input.requestFingerprint })
      )
    });
    await request(replay.app)
      .post(createPath)
      .set("Authorization", `Bearer ${replay.token}`)
      .send(createBody)
      .expect(200);
    expect(replay.repository.createWithAuditAndNotification).not.toHaveBeenCalled();

    const conflict = fixture("merchant", ["shop.member.card.topup.create"], {
      findByIdempotencyKey: jest.fn(async () => record({ requestFingerprint: "different" }))
    });
    await request(conflict.app)
      .post(createPath)
      .set("Authorization", `Bearer ${conflict.token}`)
      .send(createBody)
      .expect(409);
  });

  it("returns shop-scoped merchant history and customer-owned history", async () => {
    const merchant = fixture("merchant", ["shop.member.view"]);
    await request(merchant.app)
      .post(createPath)
      .set("Authorization", `Bearer ${merchant.token}`)
      .send(createBody)
      .expect(403);
    const merchantPage = await request(merchant.app)
      .get(`${merchantListPath}?page=1&pageSize=20&cardPublicId=${cardPublicId}`)
      .set("Authorization", `Bearer ${merchant.token}`)
      .expect(200);
    expect(merchantPage.body.data).toMatchObject({ total: 1, page: 1, page_size: 20 });

    const customer = fixture("customer", ["customer-profile:read"]);
    const customerPage = await request(customer.app)
      .get(`${customerListPath}?page=1&pageSize=20`)
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(200);
    expect(customerPage.body.data.list[0]).toMatchObject({
      publicId: topUpPublicId,
      amountJpy: 5_000
    });
    expect(customer.repository.listCustomer).toHaveBeenCalledWith(
      41,
      expect.objectContaining({ page: 1, pageSize: 20 })
    );
  });
});
