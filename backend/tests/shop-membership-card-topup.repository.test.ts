import type { PrismaClient } from "@prisma/client";
import { ShopMembershipCardTopUpRepository } from "../src/repositories/shop-membership-card-topup.repository";

const now = new Date("2026-09-01T00:00:00.000Z");
const cardPublicId = "00000000-0000-4000-8000-000000000701";
const topUpPublicId = "00000000-0000-4000-8000-000000000702";

const card = {
  id: 81,
  publicId: cardPublicId,
  cardNo: "NMC-00112233445566778899AABB",
  name: "青山储值会员卡",
  type: "STORED_VALUE",
  status: "ACTIVE",
  principalBalanceJpy: 10_000,
  bonusBalanceJpy: 0,
  expiresAt: null,
  lockVersion: 1,
  membership: {
    status: "ACTIVE",
    shop: { id: 71, shopNo: "s000000071", name: "青山护理店" },
    customerProfile: { displayName: "王小美", user: { id: 41, needoId: "u0000000041" } }
  }
};

const createdTopUp = {
  id: 91,
  publicId: topUpPublicId,
  amountJpy: 5_000,
  paymentMethod: "CASH",
  paymentReference: "POS-20260901-001",
  note: null,
  principalBalanceBeforeJpy: 10_000,
  principalBalanceAfterJpy: 15_000,
  cardLockVersionBefore: 1,
  requestFingerprint: "fingerprint",
  createdAt: now,
  updatedAt: now,
  card: { ...card, principalBalanceJpy: 15_000, lockVersion: 2 },
  shop: { shopNo: "s000000071", name: "青山护理店" },
  createdBy: { needoId: "u0000000009", username: "店主" }
};

const input = {
  actorId: 9,
  shopId: 71,
  cardPublicId,
  amountJpy: 5_000,
  paymentMethod: "cash" as const,
  paymentReference: "POS-20260901-001",
  note: null,
  idempotencyKey: "topup-repository-001",
  requestFingerprint: "fingerprint",
  audit: {
    actorId: 9,
    action: "merchant.shop_membership_card.topup.create",
    targetType: "ShopMembershipCardTopUp",
    ip: "127.0.0.1",
    metadata: { cardPublicId, amountJpy: 5_000 }
  }
};

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([{ id: 81 }])
      .mockResolvedValueOnce([{ now }]),
    shopMembershipCardTopUp: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdTopUp),
      findMany: jest.fn(),
      count: jest.fn()
    },
    shopMembershipCard: {
      findFirst: jest.fn().mockResolvedValue(card),
      updateMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    shopMembershipCardAdjustmentRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    userIdentity: { findFirst: jest.fn().mockResolvedValueOnce({ id: 141 }).mockResolvedValueOnce({ id: 109 }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 201 }) },
    notification: { create: jest.fn().mockResolvedValue({ id: 202 }) },
    ...overrides
  };
}

describe("ShopMembershipCardTopUpRepository", () => {
  it("credits principal and creates top-up, audit, and notification in one transaction", async () => {
    const tx = transaction();
    const client = { $transaction: jest.fn(async (callback) => callback(tx)) } as unknown as PrismaClient;
    const repository = new ShopMembershipCardTopUpRepository(client);

    await expect(repository.createWithAuditAndNotification(input)).resolves.toMatchObject({
      kind: "created",
      value: { publicId: topUpPublicId, principalBalanceBeforeJpy: 10_000, principalBalanceAfterJpy: 15_000 }
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.shopMembershipCard.updateMany).toHaveBeenCalledWith({
      where: {
        id: 81,
        lockVersion: 1,
        type: "STORED_VALUE",
        status: "ACTIVE",
        principalBalanceJpy: 10_000,
        deletedAt: null
      },
      data: { principalBalanceJpy: 15_000, lockVersion: { increment: 1 } }
    });
    expect(tx.shopMembershipCardTopUp.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        cardId: 81,
        shopId: 71,
        createdById: 9,
        amountJpy: 5_000,
        paymentMethod: "CASH",
        principalBalanceBeforeJpy: 10_000,
        principalBalanceAfterJpy: 15_000,
        cardLockVersionBefore: 1,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: "fingerprint"
      })
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "merchant.shop_membership_card.topup.create",
      targetId: 91,
      metadata: expect.objectContaining({ topUpPublicId, principalBalanceBeforeJpy: 10_000, principalBalanceAfterJpy: 15_000 })
    }) });
    expect(tx.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      recipientUserId: 41,
      recipientIdentityId: 141,
      actorUserId: 9,
      actorIdentityId: 109,
      type: "SYSTEM",
      title: "shop_membership.card_topup.created.title",
      body: "shop_membership.card_topup.created.body",
      payload: expect.objectContaining({ topUpPublicId, amountJpy: 5_000, principalBalanceAfterJpy: 15_000 })
    }) });
  });

  it("returns exact transactional replay without another balance mutation", async () => {
    const tx = transaction({
      shopMembershipCardTopUp: {
        findFirst: jest.fn().mockResolvedValue(createdTopUp),
        create: jest.fn()
      }
    });
    const client = { $transaction: jest.fn(async (callback) => callback(tx)) } as unknown as PrismaClient;
    await expect(new ShopMembershipCardTopUpRepository(client).createWithAuditAndNotification(input))
      .resolves.toMatchObject({ kind: "replayed", value: { publicId: topUpPublicId } });
    expect(tx.shopMembershipCard.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it("rejects a reused key with another fingerprint", async () => {
    const tx = transaction({
      shopMembershipCardTopUp: {
        findFirst: jest.fn().mockResolvedValue({ ...createdTopUp, requestFingerprint: "different" }),
        create: jest.fn()
      }
    });
    const client = { $transaction: jest.fn(async (callback) => callback(tx)) } as unknown as PrismaClient;
    await expect(new ShopMembershipCardTopUpRepository(client).createWithAuditAndNotification(input))
      .resolves.toEqual({ kind: "idempotency_conflict" });
    expect(tx.shopMembershipCard.updateMany).not.toHaveBeenCalled();
  });

  it("blocks a live pending adjustment before changing the card", async () => {
    const tx = transaction({
      shopMembershipCardAdjustmentRequest: { findFirst: jest.fn().mockResolvedValue({ id: 301 }) }
    });
    const client = { $transaction: jest.fn(async (callback) => callback(tx)) } as unknown as PrismaClient;
    await expect(new ShopMembershipCardTopUpRepository(client).createWithAuditAndNotification(input))
      .resolves.toEqual({ kind: "pending_conflict" });
    expect(tx.shopMembershipCard.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a compare-and-set race without creating financial evidence", async () => {
    const tx = transaction({
      shopMembershipCard: {
        findFirst: jest.fn().mockResolvedValue(card),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    });
    const client = { $transaction: jest.fn(async (callback) => callback(tx)) } as unknown as PrismaClient;
    await expect(new ShopMembershipCardTopUpRepository(client).createWithAuditAndNotification(input))
      .resolves.toEqual({ kind: "concurrency_conflict" });
    expect(tx.shopMembershipCardTopUp.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...card, type: "COUNT" }, "invalid_state"],
    [{ ...card, status: "FROZEN" }, "invalid_state"],
    [{ ...card, expiresAt: now }, "invalid_state"],
    [{ ...card, membership: { ...card.membership, status: "ENDED" } }, "invalid_state"]
  ])("rejects an ineligible card before mutation", async (ineligibleCard, kind) => {
    const tx = transaction({ shopMembershipCard: { findFirst: jest.fn().mockResolvedValue(ineligibleCard), updateMany: jest.fn() } });
    const client = { $transaction: jest.fn(async (callback) => callback(tx)) } as unknown as PrismaClient;
    await expect(new ShopMembershipCardTopUpRepository(client).createWithAuditAndNotification(input))
      .resolves.toEqual({ kind });
    expect(tx.shopMembershipCard.updateMany).not.toHaveBeenCalled();
  });

  it("scopes paginated merchant and customer history on the server", async () => {
    const findMany = jest.fn().mockResolvedValue([createdTopUp]);
    const count = jest.fn().mockResolvedValue(1);
    const client = { shopMembershipCardTopUp: { findMany, count } } as unknown as PrismaClient;
    const repository = new ShopMembershipCardTopUpRepository(client);
    const query = { page: 2, pageSize: 20, cardPublicId };

    await repository.listMerchant(71, query);
    expect(findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { shopId: 71, card: { publicId: cardPublicId, deletedAt: null }, deletedAt: null },
      skip: 20,
      take: 20
    }));
    await repository.listCustomer(41, query);
    expect(findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        card: { publicId: cardPublicId, membership: { customerProfile: { userId: 41 }, deletedAt: null }, deletedAt: null },
        deletedAt: null
      },
      skip: 20,
      take: 20
    }));
  });
});
