import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  ShopMembershipCardIssuanceService,
  type IssuedMembershipCardRecord,
  type ShopMembershipCardIssuanceInput,
  type ShopMembershipCardIssuanceRepositoryPort
} from "../src/services/shop-membership-card-issuance.service";

const now = new Date("2026-08-31T03:00:00.000Z");
const membershipPublicId = "00000000-0000-4000-8000-000000000401";
const planPublicId = "00000000-0000-4000-8000-000000000402";
const planVersionPublicId = "00000000-0000-4000-8000-000000000403";
const idempotencyKey = "00000000-0000-4000-8000-000000000404";

const owner = (overrides: Partial<AuthenticatedAccessContext> = {}): AuthenticatedAccessContext => ({
  userId: 9,
  email: "owner@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 71,
  roles: ["merchant_owner"],
  permissions: ["shop.member.card.issue"],
  ...overrides
});

const context = (overrides: Record<string, unknown> = {}) => ({
  membership: {
    internalId: 31,
    publicId: membershipPublicId,
    customerUserId: 41,
    customerNeedoId: "u0000000041",
    customerDisplayName: "王小美"
  },
  shop: { internalId: 71, publicId: "00000000-0000-4000-8000-000000000471", shopNo: "s000000071", name: "青山护理店" },
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
  },
  ...overrides
});

const storedValueInput = {
  planPublicId,
  initialPrincipalJpy: 10_000,
  initialUses: null,
  issuanceSource: "offline_paid" as const,
  issuanceReference: "receipt-20260831-001",
  issuanceNote: "客户已在线下付款",
  idempotencyKey
};

function issuedCard(overrides: Partial<IssuedMembershipCardRecord> = {}): IssuedMembershipCardRecord {
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
    issuanceReference: "receipt-20260831-001",
    issuanceNote: "客户已在线下付款",
    issuedAt: now,
    expiresAt: new Date("2026-09-30T03:00:00.000Z"),
    frozenAt: null,
    platformFeeRateBpsSnapshot: 1_000,
    issuanceFingerprint: "fingerprint",
    planPublicId,
    planVersionPublicId,
    planVersion: 3,
    customerNeedoId: "u0000000041",
    customerDisplayName: "王小美",
    ...overrides
  };
}

function repository(overrides: Partial<ShopMembershipCardIssuanceRepositoryPort> = {}) {
  return {
    findByIdempotencyKey: jest.fn(async () => null),
    getIssuanceContext: jest.fn(async () => ({ kind: "ready" as const, value: context() })),
    issueCardWithAuditAndNotification: jest.fn(async (input) => ({
      kind: "created" as const,
      value: issuedCard({ issuanceFingerprint: input.issuanceFingerprint, issuanceSource: input.issuanceSource })
    })),
    ...overrides
  } as jest.Mocked<ShopMembershipCardIssuanceRepositoryPort>;
}

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

describe("ShopMembershipCardIssuanceService", () => {
  it("rejects non-shop identities before any repository access", async () => {
    const repo = repository();
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now, () => "NMC-00112233445566778899AABB");

    await expect(service.issue(owner({ currentIdentityScopeType: "global", currentIdentityScopeId: null }), { ip: "127.0.0.1" }, membershipPublicId, storedValueInput))
      .rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(repo.findByIdempotencyKey).not.toHaveBeenCalled();
  });

  it("issues stored value with the published version expiry and immutable fee snapshot", async () => {
    const repo = repository();
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now, () => "NMC-00112233445566778899AABB");

    const result = await service.issue(owner(), { ip: "127.0.0.1", userAgent: "jest" }, membershipPublicId, storedValueInput);

    expect(result).toMatchObject({ replayed: false, cardNoMasked: "NMC-********************AABB", initialPrincipalJpy: 10_000, platformFeeRateBpsSnapshot: 1_000 });
    expect(repo.issueCardWithAuditAndNotification).toHaveBeenCalledWith(expect.objectContaining({
      shopId: 71,
      actorId: 9,
      membershipPublicId,
      planPublicId,
      expectedPlanVersionPublicId: planVersionPublicId,
      cardNo: "NMC-00112233445566778899AABB",
      principalBalanceJpy: 10_000,
      bonusBalanceJpy: 0,
      remainingUses: null,
      totalUses: null,
      expiresAt: new Date("2026-09-30T03:00:00.000Z"),
      platformFeeRateBpsSnapshot: 1_000,
      audit: expect.objectContaining({
        action: "merchant.shop_membership_card.issue",
        metadata: expect.not.objectContaining({ cardNo: expect.anything() })
      })
    }));
  });

  it.each([
    ["stored value mixed uses", storedValueInput, context(), { initialUses: 2 }],
    ["stored value below minimum", storedValueInput, context(), { initialPrincipalJpy: 999 }],
    ["count mixed principal", { ...storedValueInput, initialPrincipalJpy: null, initialUses: 8 }, context({ version: { ...context().version, cardType: "count", minInitialPrincipalJpy: null, maxInitialPrincipalJpy: null, minInitialUses: 1, maxInitialUses: 20 } }), { initialPrincipalJpy: 1 }],
    ["benefit with value", { ...storedValueInput, initialPrincipalJpy: null, issuanceSource: "manual_grant", issuanceReference: null, issuanceNote: "赠送原因" }, context({ version: { ...context().version, cardType: "benefit", validity: { mode: "never" }, minInitialPrincipalJpy: null, maxInitialPrincipalJpy: null } }), { initialUses: 1 }]
  ])("rejects invalid %s fields", async (_label, base, issuanceContext, invalid) => {
    const repo = repository({ getIssuanceContext: jest.fn(async () => ({ kind: "ready" as const, value: issuanceContext as ReturnType<typeof context> })) });
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now, () => "NMC-00112233445566778899AABB");

    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, { ...base, ...invalid } as ShopMembershipCardIssuanceInput))
      .rejects.toMatchObject({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_INVALID_VALUE, statusCode: 400 });
    expect(repo.issueCardWithAuditAndNotification).not.toHaveBeenCalled();
  });

  it("requires a reference or note for offline payment and a note for manual sources", async () => {
    const repo = repository();
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now, () => "NMC-00112233445566778899AABB");

    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, { ...storedValueInput, issuanceReference: " ", issuanceNote: null }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, { ...storedValueInput, issuanceSource: "historical_replacement", issuanceReference: null, issuanceNote: " " }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it.each(["offline_paid", "online_paid"] as const)("accepts %s with visible payment evidence", async (issuanceSource) => {
    const repo = repository();
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now, () => "NMC-00112233445566778899AABB");
    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, {
      ...storedValueInput, issuanceSource, issuanceNote: null
    })).resolves.toMatchObject({ replayed: false, issuanceSource });
    expect(repo.issueCardWithAuditAndNotification).toHaveBeenCalledWith(expect.objectContaining({ issuanceSource }));
  });

  it.each(["gift", "trial"] as const)("requires a visible note for %s while allowing no reference", async (issuanceSource) => {
    const repo = repository();
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now, () => "NMC-00112233445566778899AABB");
    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, {
      ...storedValueInput, issuanceSource, issuanceReference: null, issuanceNote: " "
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, {
      ...storedValueInput, issuanceSource, issuanceReference: null, issuanceNote: "活动赠送"
    })).resolves.toMatchObject({ replayed: false });
  });

  it.each([
    ["offline_paid", null, null],
    ["online_paid", null, null],
    ["renewal", null, null],
    ["gift", "reference-only", null],
    ["trial", "reference-only", null],
    ["historical_replacement", "reference-only", null],
    ["manual_grant", "reference-only", null]
  ] as const)("rejects missing required evidence for %s", async (issuanceSource, issuanceReference, issuanceNote) => {
    const repo = repository();
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now);
    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, {
      ...storedValueInput, issuanceSource, issuanceReference, issuanceNote
    })).rejects.toMatchObject({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_INVALID_VALUE });
    expect(repo.issueCardWithAuditAndNotification).not.toHaveBeenCalled();
  });

  it.each([
    ["offline_paid", "paid-ref", null],
    ["online_paid", null, "gateway evidence"],
    ["renewal", "renewal-ref", null],
    ["gift", null, "gift campaign"],
    ["trial", null, "trial campaign"],
    ["historical_replacement", null, "historical repair"],
    ["manual_grant", null, "operator reason"]
  ] as const)("accepts exact evidence contract for %s", async (issuanceSource, issuanceReference, issuanceNote) => {
    const repo = repository();
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now, () => "NMC-00112233445566778899AABB");
    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, {
      ...storedValueInput, issuanceSource, issuanceReference, issuanceNote
    })).resolves.toMatchObject({ issuanceSource });
  });

  it("replays the same normalized request without creating a second card", async () => {
    const firstRepo = repository();
    const firstService = new ShopMembershipCardIssuanceService(firstRepo, audit, () => now, () => "NMC-00112233445566778899AABB");
    const first = await firstService.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, storedValueInput);
    const persisted = await firstRepo.issueCardWithAuditAndNotification.mock.results[0].value;
    if (persisted.kind !== "created") throw new Error("expected created card");
    const replayRepo = repository({ findByIdempotencyKey: jest.fn(async () => persisted.value) });
    const replayService = new ShopMembershipCardIssuanceService(replayRepo, audit, () => new Date("2026-09-01T03:00:00.000Z"), () => "NMC-DIFFERENT");

    const replay = await replayService.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, storedValueInput);

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ publicId: first.publicId, replayed: true });
    expect(replayRepo.getIssuanceContext).not.toHaveBeenCalled();
    expect(replayRepo.issueCardWithAuditAndNotification).not.toHaveBeenCalled();
  });

  it("rejects same idempotency key with a different normalized request", async () => {
    const repo = repository({ findByIdempotencyKey: jest.fn(async () => issuedCard({
      principalBalanceJpy: 5_000,
      initialPrincipalJpy: 5_000,
      issuanceReference: "another",
      issuanceNote: null,
      expiresAt: null,
      issuanceFingerprint: "different-fingerprint"
    })) });
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now, () => "NMC-00112233445566778899AABB");

    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, storedValueInput)).rejects.toMatchObject({
      code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_IDEMPOTENCY_CONFLICT,
      statusCode: 409
    });
  });

  it("rejects a globally reused key from another shop even with the same fingerprint", async () => {
    const existing = issuedCard({ shopId: 72 });
    const fingerprintRepo = repository();
    const fingerprintService = new ShopMembershipCardIssuanceService(fingerprintRepo, audit, () => now);
    await fingerprintService.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, storedValueInput);
    const fingerprint = fingerprintRepo.issueCardWithAuditAndNotification.mock.calls[0]![0].issuanceFingerprint;
    const repo = repository({ findByIdempotencyKey: jest.fn(async () => ({ ...existing, issuanceFingerprint: fingerprint })) });
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now);
    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, storedValueInput)).rejects.toMatchObject({
      code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_IDEMPOTENCY_CONFLICT
    });
    expect(repo.getIssuanceContext).not.toHaveBeenCalled();
  });

  it("rejects an already expired fixed-date version", async () => {
    const repo = repository({
      getIssuanceContext: jest.fn(async () => ({ kind: "ready" as const, value: context({ version: { ...context().version, validity: { mode: "fixed_date", expiresAt: new Date("2026-08-31T02:59:59.000Z") } } }) }))
    });
    const service = new ShopMembershipCardIssuanceService(repo, audit, () => now, () => "NMC-00112233445566778899AABB");

    await expect(service.issue(owner(), { ip: "127.0.0.1" }, membershipPublicId, storedValueInput)).rejects.toMatchObject({
      code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_INVALID_STATE,
      statusCode: 409
    });
  });
});
