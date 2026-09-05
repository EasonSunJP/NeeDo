import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  ShopMembershipCardTopUpService,
  type ShopMembershipCardTopUpRecord,
  type ShopMembershipCardTopUpRepositoryPort
} from "../src/services/shop-membership-card-topup.service";

const now = new Date("2026-09-01T00:00:00.000Z");
const cardPublicId = "00000000-0000-4000-8000-000000000701";
const topUpPublicId = "00000000-0000-4000-8000-000000000702";
const requestContext = { ip: "127.0.0.1", userAgent: "jest" };

const actor = (
  overrides: Partial<AuthenticatedAccessContext> = {}
): AuthenticatedAccessContext => ({
  userId: 9,
  email: "owner@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 71,
  roles: ["merchant_owner"],
  permissions: ["shop.member.card.topup.create"],
  ...overrides
});

const record = (
  overrides: Partial<ShopMembershipCardTopUpRecord> = {}
): ShopMembershipCardTopUpRecord => ({
  internalId: 91,
  publicId: topUpPublicId,
  amountJpy: 5_000,
  paymentMethod: "cash",
  paymentReference: "POS-20260901-001",
  note: null,
  principalBalanceBeforeJpy: 10_000,
  principalBalanceAfterJpy: 15_000,
  cardLockVersionBefore: 1,
  requestFingerprint: "request-fingerprint",
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
    expiresAt: null,
    lockVersion: 2
  },
  shop: { shopNo: "s000000071", name: "青山护理店" },
  customer: { userId: 41, needoId: "u0000000041", displayName: "王小美" },
  createdBy: { needoId: "u0000000009", displayName: "店主" },
  ...overrides
});

const repository = (overrides: Partial<ShopMembershipCardTopUpRepositoryPort> = {}) =>
  ({
    findByIdempotencyKey: jest.fn(async () => null),
    createWithAuditAndNotification: jest.fn(async (input) => ({
      kind: "created" as const,
      value: record({
        amountJpy: input.amountJpy,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        note: input.note,
        requestFingerprint: input.requestFingerprint
      })
    })),
    listMerchant: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
    listCustomer: jest.fn(async () => ({ list: [record()], total: 1, page: 1, page_size: 20 })),
    ...overrides
  }) as jest.Mocked<ShopMembershipCardTopUpRepositoryPort>;

const audit = {
  createInput: jest.fn((input) => ({
    actorId: input.actor.userId,
    action: input.action,
    targetType: input.targetType,
    ip: input.context.ip,
    userAgent: input.context.userAgent,
    metadata: input.metadata
  }))
};

const validInput = {
  amountJpy: 5_000,
  paymentMethod: "cash" as const,
  paymentReference: " POS-20260901-001 ",
  note: null,
  idempotencyKey: "topup-service-001"
};

describe("ShopMembershipCardTopUpService", () => {
  it("creates an immediate principal top-up with normalized evidence and audit", async () => {
    const repo = repository();
    const service = new ShopMembershipCardTopUpService(repo, audit);

    await expect(
      service.create(actor(), requestContext, ` ${cardPublicId} `, validInput)
    ).resolves.toMatchObject({
      publicId: topUpPublicId,
      amountJpy: 5_000,
      principalBalanceBeforeJpy: 10_000,
      principalBalanceAfterJpy: 15_000,
      replayed: false,
      card: { publicId: cardPublicId, cardNoMasked: "NMC-********************AABB" }
    });
    expect(repo.createWithAuditAndNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 9,
        shopId: 71,
        cardPublicId,
        amountJpy: 5_000,
        paymentMethod: "cash",
        paymentReference: "POS-20260901-001",
        audit: expect.objectContaining({ action: "merchant.shop_membership_card.topup.create" })
      })
    );
  });

  it.each([
    [0, "reference"],
    [10_000_001, "reference"],
    [1.5, "reference"],
    [1000, ""]
  ])(
    "rejects invalid amount or evidence before repository mutation",
    async (amountJpy, paymentReference) => {
      const repo = repository();
      const service = new ShopMembershipCardTopUpService(repo, audit);
      await expect(
        service.create(actor(), requestContext, cardPublicId, {
          ...validInput,
          amountJpy,
          paymentReference,
          idempotencyKey: `invalid-${String(amountJpy)}-key`
        })
      ).rejects.toMatchObject({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_INVALID_VALUE });
      expect(repo.findByIdempotencyKey).not.toHaveBeenCalled();
    }
  );

  it("requires a selected merchant shop and an owning customer for history", async () => {
    const repo = repository();
    const service = new ShopMembershipCardTopUpService(repo, audit);
    await expect(
      service.create(
        actor({ currentIdentityScopeType: "global", currentIdentityScopeId: null }),
        requestContext,
        cardPublicId,
        validInput
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    await expect(service.listCustomer(actor(), { page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      statusCode: 403
    });
  });

  it("replays only an identical normalized request", async () => {
    const firstRepo = repository();
    await new ShopMembershipCardTopUpService(firstRepo, audit).create(
      actor(),
      requestContext,
      cardPublicId,
      validInput
    );
    const fingerprint =
      firstRepo.createWithAuditAndNotification.mock.calls[0][0].requestFingerprint;
    const replayRepo = repository({
      findByIdempotencyKey: jest.fn(async () => record({ requestFingerprint: fingerprint }))
    });
    await expect(
      new ShopMembershipCardTopUpService(replayRepo, audit).create(
        actor(),
        requestContext,
        cardPublicId,
        validInput
      )
    ).resolves.toMatchObject({ publicId: topUpPublicId, replayed: true });
    expect(replayRepo.createWithAuditAndNotification).not.toHaveBeenCalled();

    const conflictRepo = repository({
      findByIdempotencyKey: jest.fn(async () => record({ requestFingerprint: "different" }))
    });
    await expect(
      new ShopMembershipCardTopUpService(conflictRepo, audit).create(
        actor(),
        requestContext,
        cardPublicId,
        validInput
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_IDEMPOTENCY_CONFLICT,
      statusCode: 409
    });
  });

  it.each([
    ["not_found", "SHOP_MEMBERSHIP_CARD_TOPUP_NOT_FOUND"],
    ["invalid_state", "SHOP_MEMBERSHIP_CARD_TOPUP_INVALID_STATE"],
    ["pending_conflict", "SHOP_MEMBERSHIP_CARD_TOPUP_PENDING_CONFLICT"],
    ["concurrency_conflict", "SHOP_MEMBERSHIP_CARD_TOPUP_CONCURRENCY_CONFLICT"],
    ["idempotency_conflict", "SHOP_MEMBERSHIP_CARD_TOPUP_IDEMPOTENCY_CONFLICT"]
  ] as const)("maps repository %s to its structured error", async (kind, errorKey) => {
    const repo = repository({ createWithAuditAndNotification: jest.fn(async () => ({ kind })) });
    await expect(
      new ShopMembershipCardTopUpService(repo, audit).create(
        actor(),
        requestContext,
        cardPublicId,
        validInput
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES[errorKey],
      statusCode: kind === "not_found" ? 404 : 409
    });
  });

  it("returns merchant and customer histories through their server-owned scopes", async () => {
    const repo = repository();
    const service = new ShopMembershipCardTopUpService(repo, audit);
    const query = { page: 2, pageSize: 20, cardPublicId };
    const customer = actor({
      userId: 41,
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 51,
      roles: ["customer"],
      permissions: ["customer-profile:read"]
    });

    await service.listMerchant(actor(), query);
    await service.listCustomer(customer, query);
    expect(repo.listMerchant).toHaveBeenCalledWith(71, query);
    expect(repo.listCustomer).toHaveBeenCalledWith(41, query);
  });
});
