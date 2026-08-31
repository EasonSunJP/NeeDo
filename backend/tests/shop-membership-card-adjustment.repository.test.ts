import type { PrismaClient } from "@prisma/client";
import { ShopMembershipCardAdjustmentRepository } from "../src/repositories/shop-membership-card-adjustment.repository";

const now = new Date("2026-08-31T03:00:00.000Z");
const expiresAt = new Date("2026-09-03T03:00:00.000Z");
const cardPublicId = "00000000-0000-4000-8000-000000000601";
const requestPublicId = "00000000-0000-4000-8000-000000000602";

const card = {
  id: 81,
  publicId: cardPublicId,
  cardNo: "NMC-00112233445566778899AABB",
  name: "青山储值会员卡",
  type: "STORED_VALUE",
  status: "ACTIVE",
  principalBalanceJpy: 10_000,
  bonusBalanceJpy: 0,
  remainingUses: null,
  totalUses: null,
  lockVersion: 1,
  expiresAt: new Date("2026-12-31T03:00:00.000Z"),
  membership: {
    status: "ACTIVE",
    deletedAt: null,
    shop: { id: 71, publicId: "00000000-0000-4000-8000-000000000671", shopNo: "s000000071", name: "青山护理店" },
    customerProfile: { displayName: "王小美", user: { id: 41, needoId: "u0000000041" } }
  }
};

const adjustment = (overrides: Record<string, unknown> = {}) => ({
  id: 91,
  publicId: requestPublicId,
  status: "PENDING",
  pendingKey: "card:81",
  reason: "线下账目核对后修正",
  beforePrincipalBalanceJpy: 10_000,
  targetPrincipalBalanceJpy: 12_000,
  beforeRemainingUses: null,
  targetRemainingUses: null,
  cardLockVersionBefore: 1,
  requestFingerprint: "request-fingerprint",
  decisionFingerprint: null,
  expiresAt,
  decidedAt: null,
  cancelledAt: null,
  invalidatedAt: null,
  createdAt: now,
  updatedAt: now,
  card,
  shop: card.membership.shop,
  requestedBy: { id: 9 },
  ...overrides
});

const createInput = {
  actorId: 9,
  shopId: 71,
  cardPublicId,
  reason: "线下账目核对后修正",
  beforePrincipalBalanceJpy: 10_000,
  targetPrincipalBalanceJpy: 12_000,
  beforeRemainingUses: null,
  targetRemainingUses: null,
  cardLockVersionBefore: 1,
  requestIdempotencyKey: "adjustment-request-001",
  requestFingerprint: "request-fingerprint",
  audit: {
    actorId: 9,
    action: "merchant.shop_membership_card.adjustment.request",
    targetType: "ShopMembershipCardAdjustmentRequest",
    ip: "127.0.0.1"
  }
};

const decisionInput = {
  customerUserId: 41,
  requestPublicId,
  decision: "approve" as const,
  decisionIdempotencyKey: "adjustment-decision-001",
  decisionFingerprint: "decision-fingerprint",
  audit: {
    actorId: 41,
    action: "customer.shop_membership_card.adjustment.approve",
    targetType: "ShopMembershipCardAdjustmentRequest",
    ip: "127.0.0.1"
  }
};

describe("ShopMembershipCardAdjustmentRepository", () => {
  it("creates a 72-hour pending request, audit and customer notification in one transaction", async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
      shopMembershipCard: { findFirst: jest.fn().mockResolvedValue(card) },
      shopMembershipCardAdjustmentRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(adjustment())
      },
      userIdentity: { findFirst: jest.fn().mockResolvedValueOnce({ id: 141 }).mockResolvedValueOnce({ id: 109 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 2 }) }
    };
    const client = { $transaction: jest.fn(async (callback) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new ShopMembershipCardAdjustmentRepository(client);

    await expect(repository.createRequestWithAuditAndNotification(createInput)).resolves.toMatchObject({
      kind: "created",
      value: { publicId: requestPublicId, status: "pending", expiresAt }
    });
    expect(transaction.shopMembershipCard.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { publicId: cardPublicId, membership: { shopId: 71, deletedAt: null }, deletedAt: null }
    }));
    expect(transaction.shopMembershipCardAdjustmentRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        cardId: 81,
        shopId: 71,
        requestedById: 9,
        status: "PENDING",
        pendingKey: "card:81",
        cardLockVersionBefore: 1,
        expiresAt
      })
    }));
    expect(transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: createInput.audit.action, targetId: 91 }) });
    expect(transaction.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      recipientUserId: 41,
      recipientIdentityId: 141,
      actorUserId: 9,
      actorIdentityId: 109,
      title: "shop_membership.card_adjustment.request.title",
      body: "shop_membership.card_adjustment.request.body"
    }) });
  });

  it("approves against the current snapshot and changes principal exactly once", async () => {
    const approved = adjustment({
      status: "APPROVED",
      pendingKey: null,
      decisionFingerprint: decisionInput.decisionFingerprint,
      decidedAt: now,
      card: { ...card, principalBalanceJpy: 12_000, lockVersion: 2 }
    });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 91 }]).mockResolvedValueOnce([{ now }]),
      shopMembershipCardAdjustmentRequest: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(adjustment()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(approved)
      },
      shopMembershipCard: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      userIdentity: { findFirst: jest.fn().mockResolvedValueOnce({ id: 109 }).mockResolvedValueOnce({ id: 141 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 2 }) }
    };
    const client = { $transaction: jest.fn(async (callback) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new ShopMembershipCardAdjustmentRepository(client);

    await expect(repository.decideRequestWithAuditAndNotification(decisionInput)).resolves.toMatchObject({
      kind: "approved",
      value: { status: "approved", card: { principalBalanceJpy: 12_000, lockVersion: 2 } }
    });
    expect(transaction.shopMembershipCard.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 81, lockVersion: 1, status: "ACTIVE", principalBalanceJpy: 10_000, deletedAt: null }),
      data: { principalBalanceJpy: 12_000, lockVersion: { increment: 1 } }
    });
    expect(transaction.shopMembershipCardAdjustmentRequest.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 91, status: "PENDING", pendingKey: "card:81", expiresAt: { gt: now }, deletedAt: null }),
      data: expect.objectContaining({ status: "APPROVED", pendingKey: null, decisionIdempotencyKey: decisionInput.decisionIdempotencyKey })
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: decisionInput.audit.action, targetId: 91 }) });
  });

  it("expires at the exact deadline without touching the card", async () => {
    const expired = adjustment({ status: "EXPIRED", pendingKey: null, updatedAt: expiresAt });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 91 }]).mockResolvedValueOnce([{ now: expiresAt }]),
      shopMembershipCardAdjustmentRequest: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(adjustment()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(expired)
      },
      shopMembershipCard: { updateMany: jest.fn() },
      userIdentity: { findFirst: jest.fn().mockResolvedValueOnce({ id: 141 }).mockResolvedValueOnce({ id: 109 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 2 }) }
    };
    const client = { $transaction: jest.fn(async (callback) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new ShopMembershipCardAdjustmentRepository(client);

    await expect(repository.decideRequestWithAuditAndNotification(decisionInput)).resolves.toMatchObject({ kind: "expired", value: { status: "expired" } });
    expect(transaction.shopMembershipCard.updateMany).not.toHaveBeenCalled();
    expect(transaction.shopMembershipCardAdjustmentRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 91, status: "PENDING", pendingKey: "card:81", expiresAt: { lte: expiresAt }, deletedAt: null },
      data: { status: "EXPIRED", pendingKey: null }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: null, action: "system.shop_membership_card.adjustment.expire" }) });
  });

  it("expires a scoped worker batch with audit and both notifications", async () => {
    const expired = adjustment({ status: "EXPIRED", pendingKey: null, updatedAt: expiresAt });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 91 }]).mockResolvedValueOnce([{ now: expiresAt }]),
      shopMembershipCardAdjustmentRequest: {
        findFirst: jest.fn().mockResolvedValue(adjustment()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(expired)
      },
      userIdentity: { findFirst: jest.fn().mockResolvedValueOnce({ id: 141 }).mockResolvedValueOnce({ id: 109 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 2 }) }
    };
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ now: expiresAt }]),
      shopMembershipCardAdjustmentRequest: {
        findMany: jest.fn().mockResolvedValue([{ publicId: requestPublicId }])
      },
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardAdjustmentRepository(client);

    await expect(repository.expireDue({ batchSize: 100, customerUserId: 41 })).resolves.toEqual({
      scanned: 1,
      expired: 1,
      failed: 0
    });
    expect(client.shopMembershipCardAdjustmentRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "PENDING",
        expiresAt: { lte: expiresAt },
        deletedAt: null,
        card: expect.objectContaining({ membership: expect.objectContaining({ customerProfile: { userId: 41 } }) })
      }),
      take: 100
    }));
    expect(transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorId: null,
      action: "system.shop_membership_card.adjustment.expire"
    }) });
    expect(transaction.notification.create).toHaveBeenCalledTimes(2);
  });

  it("invalidates a stale snapshot without overwriting the newer card", async () => {
    const stale = adjustment({ card: { ...card, lockVersion: 2, principalBalanceJpy: 11_000 } });
    const invalidated = adjustment({ status: "INVALIDATED", pendingKey: null, invalidatedAt: now, card: stale.card });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 91 }]).mockResolvedValueOnce([{ now }]),
      shopMembershipCardAdjustmentRequest: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(stale),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(invalidated)
      },
      shopMembershipCard: { updateMany: jest.fn() },
      userIdentity: { findFirst: jest.fn().mockResolvedValueOnce({ id: 141 }).mockResolvedValueOnce({ id: 109 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 2 }) }
    };
    const client = { $transaction: jest.fn(async (callback) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new ShopMembershipCardAdjustmentRepository(client);

    await expect(repository.decideRequestWithAuditAndNotification(decisionInput)).resolves.toMatchObject({ kind: "invalidated", value: { status: "invalidated" } });
    expect(transaction.shopMembershipCard.updateMany).not.toHaveBeenCalled();
    expect(transaction.shopMembershipCardAdjustmentRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 91, status: "PENDING", pendingKey: "card:81", deletedAt: null },
      data: expect.objectContaining({ status: "INVALIDATED", pendingKey: null, invalidatedAt: now })
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: null, action: "system.shop_membership_card.adjustment.invalidate" }) });
  });
});
