import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  ShopMembershipCardAdjustmentService,
  type ShopMembershipCardAdjustmentRecord,
  type ShopMembershipCardAdjustmentRepositoryPort
} from "../src/services/shop-membership-card-adjustment.service";

const now = new Date("2026-08-31T03:00:00.000Z");
const cardPublicId = "00000000-0000-4000-8000-000000000601";
const requestPublicId = "00000000-0000-4000-8000-000000000602";
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
  permissions: ["shop.member.card.adjust.request"],
  ...overrides
});

const record = (
  overrides: Partial<ShopMembershipCardAdjustmentRecord> = {}
): ShopMembershipCardAdjustmentRecord => ({
  internalId: 81,
  publicId: requestPublicId,
  status: "pending",
  reason: "线下账目核对后修正",
  beforePrincipalBalanceJpy: 10_000,
  targetPrincipalBalanceJpy: 12_000,
  beforeRemainingUses: null,
  targetRemainingUses: null,
  cardLockVersionBefore: 1,
  requestFingerprint: "request-fingerprint",
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

const repository = (overrides: Partial<ShopMembershipCardAdjustmentRepositoryPort> = {}) =>
  ({
    findByRequestIdempotencyKey: jest.fn(async () => null),
    getMerchantCardContext: jest.fn(async () => ({ kind: "ready" as const, value: record().card })),
    createRequestWithAuditAndNotification: jest.fn(async (input) => ({
      kind: "created" as const,
      value: record({
        reason: input.reason,
        beforePrincipalBalanceJpy: input.beforePrincipalBalanceJpy,
        targetPrincipalBalanceJpy: input.targetPrincipalBalanceJpy,
        beforeRemainingUses: input.beforeRemainingUses,
        targetRemainingUses: input.targetRemainingUses,
        requestFingerprint: input.requestFingerprint
      })
    })),
    findByDecisionIdempotencyKey: jest.fn(async () => null),
    decideRequestWithAuditAndNotification: jest.fn(async (input) => ({
      kind: input.decision === "approve" ? ("approved" as const) : ("rejected" as const),
      value: record({
        status: input.decision === "approve" ? "approved" : "rejected",
        decisionFingerprint: input.decisionFingerprint,
        decidedAt: now
      })
    })),
    cancelRequestWithAuditAndNotification: jest.fn(async () => ({
      kind: "cancelled" as const,
      value: record({ status: "cancelled", cancelledAt: now })
    })),
    ...overrides
  }) as jest.Mocked<ShopMembershipCardAdjustmentRepositoryPort>;

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

describe("ShopMembershipCardAdjustmentService", () => {
  it("submits a stored-value target without mutating or accepting a client before value", async () => {
    const repo = repository();
    const service = new ShopMembershipCardAdjustmentService(repo, audit, () => now);

    const result = await service.create(
      actor(),
      { ip: "127.0.0.1", userAgent: "jest" },
      cardPublicId,
      {
        targetPrincipalBalanceJpy: 12_000,
        targetRemainingUses: null,
        reason: "  线下账目核对后修正  ",
        idempotencyKey: "adjustment-request-001"
      }
    );

    expect(result).toMatchObject({
      status: "pending",
      dimension: "principal_balance",
      beforeValue: 10_000,
      targetValue: 12_000,
      difference: 2_000,
      remainingSeconds: 72 * 60 * 60,
      replayed: false
    });
    expect(repo.createRequestWithAuditAndNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 9,
        shopId: 71,
        cardPublicId,
        reason: "线下账目核对后修正",
        beforePrincipalBalanceJpy: 10_000,
        targetPrincipalBalanceJpy: 12_000,
        beforeRemainingUses: null,
        targetRemainingUses: null,
        audit: expect.objectContaining({
          action: "merchant.shop_membership_card.adjustment.request"
        })
      })
    );
  });

  it("submits a count-card remaining target and rejects mixed or unchanged values", async () => {
    const countCard = {
      ...record().card,
      type: "count" as const,
      principalBalanceJpy: null,
      bonusBalanceJpy: null,
      remainingUses: 4,
      totalUses: 10
    };
    const repo = repository({
      getMerchantCardContext: jest.fn(async () => ({ kind: "ready" as const, value: countCard }))
    });
    const service = new ShopMembershipCardAdjustmentService(repo, audit, () => now);

    await expect(
      service.create(actor(), requestContext, cardPublicId, {
        targetPrincipalBalanceJpy: null,
        targetRemainingUses: 6,
        reason: "补记遗漏次数",
        idempotencyKey: "adjustment-count-001"
      })
    ).resolves.toMatchObject({
      dimension: "remaining_uses",
      beforeValue: 4,
      targetValue: 6,
      difference: 2
    });
    await expect(
      service.create(actor(), requestContext, cardPublicId, {
        targetPrincipalBalanceJpy: null,
        targetRemainingUses: 4,
        reason: "未发生变化",
        idempotencyKey: "adjustment-count-002"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_INVALID_VALUE });
  });

  it("rejects benefit cards and non-shop merchant scope before mutation", async () => {
    const benefitRepo = repository({
      getMerchantCardContext: jest.fn(async () => ({
        kind: "ready" as const,
        value: { ...record().card, type: "benefit" as const }
      }))
    });
    const service = new ShopMembershipCardAdjustmentService(benefitRepo, audit, () => now);
    await expect(
      service.create(actor(), requestContext, cardPublicId, {
        targetPrincipalBalanceJpy: 1,
        targetRemainingUses: null,
        reason: "无效卡型",
        idempotencyKey: "adjustment-benefit-001"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_INVALID_STATE });

    const forbiddenRepo = repository();
    const forbiddenService = new ShopMembershipCardAdjustmentService(
      forbiddenRepo,
      audit,
      () => now
    );
    await expect(
      forbiddenService.create(
        actor({ currentIdentityScopeType: "global", currentIdentityScopeId: null }),
        requestContext,
        cardPublicId,
        {
          targetPrincipalBalanceJpy: 1,
          targetRemainingUses: null,
          reason: "无店铺范围",
          idempotencyKey: "adjustment-forbidden-001"
        }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(forbiddenRepo.findByRequestIdempotencyKey).not.toHaveBeenCalled();
  });

  it("replays only the same normalized creation request", async () => {
    const firstRepo = repository();
    const firstService = new ShopMembershipCardAdjustmentService(firstRepo, audit, () => now);
    const input = {
      targetPrincipalBalanceJpy: 12_000,
      targetRemainingUses: null,
      reason: "修正",
      idempotencyKey: "adjustment-replay-001"
    };
    await firstService.create(actor(), requestContext, cardPublicId, input);
    const createdInput = firstRepo.createRequestWithAuditAndNotification.mock.calls[0][0];
    const existing = record({
      requestFingerprint: createdInput.requestFingerprint,
      reason: "修正"
    });
    const replayRepo = repository({ findByRequestIdempotencyKey: jest.fn(async () => existing) });
    const replayService = new ShopMembershipCardAdjustmentService(replayRepo, audit, () => now);
    await expect(
      replayService.create(actor(), requestContext, cardPublicId, input)
    ).resolves.toMatchObject({ replayed: true, publicId: requestPublicId });
    expect(replayRepo.getMerchantCardContext).not.toHaveBeenCalled();

    const conflictRepo = repository({
      findByRequestIdempotencyKey: jest.fn(async () => record({ requestFingerprint: "different" }))
    });
    await expect(
      new ShopMembershipCardAdjustmentService(conflictRepo, audit, () => now).create(
        actor(),
        requestContext,
        cardPublicId,
        input
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_IDEMPOTENCY_CONFLICT,
      statusCode: 409
    });
  });

  it.each(["approve", "reject"] as const)(
    "allows only the owning customer to %s and maps terminal results",
    async (decision) => {
      const repo = repository();
      const service = new ShopMembershipCardAdjustmentService(repo, audit, () => now);
      const customer = actor({
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: 51,
        userId: 41,
        roles: ["customer"],
        permissions: ["customer-profile:read"]
      });

      await expect(
        service.decide(customer, { ip: "127.0.0.1" }, requestPublicId, {
          decision,
          idempotencyKey: `decision-${decision}-001`
        })
      ).resolves.toMatchObject({
        status: decision === "approve" ? "approved" : "rejected",
        replayed: false
      });
      expect(repo.decideRequestWithAuditAndNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          customerUserId: 41,
          requestPublicId,
          decision,
          audit: expect.objectContaining({
            action: `customer.shop_membership_card.adjustment.${decision}`
          })
        })
      );
    }
  );

  it("maps expiry and snapshot invalidation without presenting a successful approval", async () => {
    const customer = actor({
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 51,
      userId: 41
    });
    for (const kind of ["expired", "invalidated"] as const) {
      const repo = repository({
        decideRequestWithAuditAndNotification: jest.fn(async () => ({
          kind,
          value: record({ status: kind, invalidatedAt: kind === "invalidated" ? now : null })
        }))
      });
      const service = new ShopMembershipCardAdjustmentService(repo, audit, () => now);
      await expect(
        service.decide(customer, requestContext, requestPublicId, {
          decision: "approve",
          idempotencyKey: `decision-${kind}-001`
        })
      ).rejects.toMatchObject({
        code:
          kind === "expired"
            ? ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRED
            : ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_SNAPSHOT_CONFLICT,
        statusCode: 409
      });
    }
  });

  it.each(["expired", "invalidated"] as const)(
    "replays a decision-triggered %s outcome as the same conflict",
    async (status) => {
      const customer = actor({
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: 51,
        userId: 41
      });
      const firstRepository = repository({
        decideRequestWithAuditAndNotification: jest.fn(async (input) => ({
          kind: status,
          value: record({
            status,
            decisionFingerprint: input.decisionFingerprint,
            invalidatedAt: status === "invalidated" ? now : null
          })
        }))
      });
      const input = { decision: "approve" as const, idempotencyKey: `decision-${status}-replay` };
      const expectedError =
        status === "expired"
          ? ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRED
          : ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_SNAPSHOT_CONFLICT;

      await expect(
        new ShopMembershipCardAdjustmentService(firstRepository, audit, () => now).decide(
          customer,
          requestContext,
          requestPublicId,
          input
        )
      ).rejects.toMatchObject({ code: expectedError, statusCode: 409 });
      const decisionFingerprint =
        firstRepository.decideRequestWithAuditAndNotification.mock.calls[0][0].decisionFingerprint;
      const replayRepository = repository({
        findByDecisionIdempotencyKey: jest.fn(async () =>
          record({
            status,
            decisionFingerprint,
            invalidatedAt: status === "invalidated" ? now : null
          })
        )
      });

      await expect(
        new ShopMembershipCardAdjustmentService(replayRepository, audit, () => now).decide(
          customer,
          requestContext,
          requestPublicId,
          input
        )
      ).rejects.toMatchObject({ code: expectedError, statusCode: 409 });
      expect(replayRepository.decideRequestWithAuditAndNotification).not.toHaveBeenCalled();
    }
  );

  it("lets the scoped shop cancel a pending request", async () => {
    const repo = repository();
    const service = new ShopMembershipCardAdjustmentService(repo, audit, () => now);
    await expect(
      service.cancel(actor(), { ip: "127.0.0.1" }, requestPublicId)
    ).resolves.toMatchObject({ status: "cancelled", replayed: false });
    expect(repo.cancelRequestWithAuditAndNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 71,
        actorId: 9,
        requestPublicId,
        audit: expect.objectContaining({
          action: "merchant.shop_membership_card.adjustment.cancel"
        })
      })
    );
  });

  it("expires due requests before returning merchant and customer lists", async () => {
    const expireDue = jest.fn().mockResolvedValue({ scanned: 1, expired: 1, failed: 0 });
    const listMerchantRequests = jest.fn().mockResolvedValue({
      list: [record({ status: "expired" })],
      total: 1,
      page: 1,
      page_size: 20
    });
    const listCustomerRequests = jest.fn().mockResolvedValue({
      list: [record({ status: "expired" })],
      total: 1,
      page: 1,
      page_size: 20
    });
    const repo = repository({ expireDue, listMerchantRequests, listCustomerRequests });
    const service = new ShopMembershipCardAdjustmentService(repo, audit, () => now);
    const customer = actor({
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 51,
      userId: 41
    });

    await service.listMerchant(actor(), { page: 1, pageSize: 20 });
    await service.listCustomer(customer, { page: 1, pageSize: 20 });

    expect(expireDue).toHaveBeenNthCalledWith(1, { batchSize: 100, shopId: 71 });
    expect(expireDue).toHaveBeenNthCalledWith(2, { batchSize: 100, customerUserId: 41 });
    expect(listMerchantRequests.mock.invocationCallOrder[0]).toBeGreaterThan(
      expireDue.mock.invocationCallOrder[0]
    );
    expect(listCustomerRequests.mock.invocationCallOrder[0]).toBeGreaterThan(
      expireDue.mock.invocationCallOrder[1]
    );
  });
});
