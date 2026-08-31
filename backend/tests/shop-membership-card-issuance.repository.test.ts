import type { PrismaClient } from "@prisma/client";
import { ShopMembershipCardIssuanceRepository } from "../src/repositories/shop-membership-card-issuance.repository";

const now = new Date("2026-08-31T03:00:00.000Z");
const membershipPublicId = "00000000-0000-4000-8000-000000000401";
const planPublicId = "00000000-0000-4000-8000-000000000402";
const planVersionPublicId = "00000000-0000-4000-8000-000000000403";

const membership = {
  id: 31,
  publicId: membershipPublicId,
  status: "ACTIVE",
  shop: { id: 71, publicId: "00000000-0000-4000-8000-000000000471", shopNo: "s000000071", name: "青山护理店" },
  customerProfile: { displayName: "王小美", user: { id: 41, needoId: "u0000000041" } }
};

const plan = {
  id: 51,
  publicId: planPublicId,
  status: "ACTIVE",
  currentVersionId: 61,
  currentVersion: {
    id: 61,
    publicId: planVersionPublicId,
    version: 3,
    status: "PUBLISHED",
    name: "青山储值会员卡",
    cardType: "STORED_VALUE",
    validityMode: "FIXED_DAYS",
    validityDays: 30,
    fixedExpiryAt: null,
    minInitialPrincipalJpy: 1_000,
    maxInitialPrincipalJpy: 50_000,
    minInitialUses: null,
    maxInitialUses: null,
    platformFeeRateBps: 1_000
  }
};

const card = {
  id: 81,
  publicId: "00000000-0000-4000-8000-000000000481",
  cardNo: "NMC-00112233445566778899AABB",
  name: "青山储值会员卡",
  type: "STORED_VALUE",
  status: "ACTIVE",
  principalBalanceJpy: 10_000,
  bonusBalanceJpy: 0,
  remainingUses: null,
  totalUses: null,
  initialPrincipalJpy: 10_000,
  initialUses: null,
  issuanceSource: "OFFLINE_PAID",
  issuanceReference: "receipt-1",
  issuanceNote: "线下付款",
  issuedAt: now,
  expiresAt: new Date("2026-09-30T03:00:00.000Z"),
  frozenAt: null,
  platformFeeRateBpsSnapshot: 1_000,
  issuanceFingerprint: "fingerprint",
  plan: { publicId: planPublicId },
  planVersion: { publicId: planVersionPublicId, version: 3 },
  membership: { customerProfile: { displayName: "王小美", user: { needoId: "u0000000041" } } }
};

const issuanceInput = {
  actorId: 9,
  shopId: 71,
  membershipPublicId,
  planPublicId,
  expectedPlanVersionPublicId: planVersionPublicId,
  cardNo: card.cardNo,
  type: "stored_value" as const,
  name: card.name,
  principalBalanceJpy: 10_000,
  bonusBalanceJpy: 0,
  remainingUses: null,
  totalUses: null,
  initialPrincipalJpy: 10_000,
  initialUses: null,
  issuanceSource: "offline_paid" as const,
  issuanceReference: "receipt-1",
  issuanceNote: "线下付款",
  platformFeeRateBpsSnapshot: 1_000,
  issuanceIdempotencyKey: "00000000-0000-4000-8000-000000000404",
  issuanceFingerprint: "fingerprint",
  issuedAt: now,
  expiresAt: card.expiresAt,
  audit: {
    actorId: 9,
    action: "merchant.shop_membership_card.issue",
    targetType: "ShopMembershipCard",
    ip: "127.0.0.1",
    metadata: { membershipPublicId, planPublicId }
  }
};

describe("ShopMembershipCardIssuanceRepository", () => {
  it("loads only the current shop active membership and published current version", async () => {
    const client = {
      shopCustomerMembership: { findFirst: jest.fn().mockResolvedValue(membership) },
      shopMembershipCardPlan: { findFirst: jest.fn().mockResolvedValue(plan) }
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(repository.getIssuanceContext(71, membershipPublicId, planPublicId)).resolves.toMatchObject({
      kind: "ready",
      value: {
        membership: { customerUserId: 41, customerNeedoId: "u0000000041" },
        version: { cardType: "stored_value", validity: { mode: "fixed_days", days: 30 }, platformFeeRateBps: 1_000 }
      }
    });
    expect(client.shopCustomerMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { publicId: membershipPublicId, shopId: 71, deletedAt: null }
    }));
    expect(client.shopMembershipCardPlan.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { publicId: planPublicId, shopId: 71, deletedAt: null }
    }));
  });

  it("rejects a published version whose persisted validity shape is incomplete", async () => {
    const client = {
      shopCustomerMembership: { findFirst: jest.fn().mockResolvedValue(membership) },
      shopMembershipCardPlan: {
        findFirst: jest.fn().mockResolvedValue({
          ...plan,
          currentVersion: { ...plan.currentVersion, validityMode: "FIXED_DAYS", validityDays: null }
        })
      }
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(repository.getIssuanceContext(71, membershipPublicId, planPublicId)).resolves.toEqual({ kind: "invalid_state" });
  });

  it("creates card, exact audit, and customer notification in one transaction", async () => {
    const transaction = {
      shopMembershipCard: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(card)
      },
      shopCustomerMembership: { findFirst: jest.fn().mockResolvedValue(membership) },
      shopMembershipCardPlan: { findFirst: jest.fn().mockResolvedValue(plan) },
      userIdentity: { findFirst: jest.fn().mockResolvedValueOnce({ id: 141 }).mockResolvedValueOnce({ id: 109 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 91 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 92 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(repository.issueCardWithAuditAndNotification(issuanceInput)).resolves.toMatchObject({
      kind: "created",
      value: { publicId: card.publicId, planVersion: 3, customerNeedoId: "u0000000041" }
    });

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.shopMembershipCard.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        membershipId: 31,
        planId: 51,
        planVersionId: 61,
        issuedById: 9,
        cardNo: card.cardNo,
        type: "STORED_VALUE",
        issuanceSource: "OFFLINE_PAID",
        principalBalanceJpy: 10_000,
        bonusBalanceJpy: 0,
        issuanceIdempotencyKey: issuanceInput.issuanceIdempotencyKey,
        issuanceFingerprint: "fingerprint"
      })
    }));
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "merchant.shop_membership_card.issue",
        targetId: 81,
        metadata: expect.objectContaining({ cardPublicId: card.publicId, membershipPublicId, planPublicId })
      })
    });
    expect(transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 41,
        recipientIdentityId: 141,
        actorUserId: 9,
        actorIdentityId: 109,
        type: "SYSTEM",
        title: "shop_membership.card_issued.title",
        body: "shop_membership.card_issued.body",
        payload: expect.objectContaining({ cardPublicId: card.publicId, membershipPublicId, planPublicId })
      })
    });
  });

  it("returns the same card on a transactional replay without duplicate audit or notification", async () => {
    const transaction = {
      shopMembershipCard: { findFirst: jest.fn().mockResolvedValue(card), create: jest.fn() },
      shopCustomerMembership: { findFirst: jest.fn() },
      shopMembershipCardPlan: { findFirst: jest.fn() },
      userIdentity: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
      notification: { create: jest.fn() }
    };
    const client = { $transaction: jest.fn(async (callback) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(repository.issueCardWithAuditAndNotification(issuanceInput)).resolves.toMatchObject({ kind: "replayed", value: { publicId: card.publicId } });
    expect(transaction.shopMembershipCard.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(transaction.notification.create).not.toHaveBeenCalled();
  });

  it("rejects a same-key transaction replay with a different fingerprint", async () => {
    const transaction = {
      shopMembershipCard: { findFirst: jest.fn().mockResolvedValue({ ...card, issuanceFingerprint: "different" }), create: jest.fn() }
    };
    const client = { $transaction: jest.fn(async (callback) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new ShopMembershipCardIssuanceRepository(client);

    await expect(repository.issueCardWithAuditAndNotification(issuanceInput)).resolves.toEqual({ kind: "idempotency_conflict" });
    expect(transaction.shopMembershipCard.create).not.toHaveBeenCalled();
  });
});
