import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { ShopMembershipCardRedemptionRepository } from "../src/repositories/shop-membership-card-redemption.repository";

const now = new Date("2026-09-01T00:00:00.000Z");
const cardPublicId = "00000000-0000-4000-8000-000000000811";

const card = {
  id: 81,
  publicId: cardPublicId,
  cardNo: "NMC-00112233445566778899AABB",
  name: "青山储值会员卡",
  type: "STORED_VALUE",
  status: "ACTIVE",
  principalBalanceJpy: 10_000,
  bonusBalanceJpy: 2_000,
  remainingUses: null,
  expiresAt: null,
  lockVersion: 1,
  platformFeeRateBpsSnapshot: 1_000,
  membership: {
    status: "ACTIVE",
    shop: { id: 71, shopNo: "s000000071", name: "青山护理店" },
    customerProfile: {
      displayName: "王小美",
      user: { id: 41, needoId: "u0000000041" }
    }
  },
  planVersion: {
    id: 91,
    status: "PUBLISHED",
    cardType: "STORED_VALUE",
    rewardCaps: {},
    platformFeeRateBps: 1_000,
    publishedAt: now,
    deletedAt: null,
    rules: []
  }
};

const order = {
  id: 181,
  orderNo: "B202609010001",
  customerUserId: 41,
  shopId: 71,
  status: "COMPLETED",
  priceAmount: new Prisma.Decimal(12_000),
  currency: "JPY",
  serviceNameSnapshot: "护理服务",
  startsAt: now,
  endsAt: now,
  service: null,
  technicianService: null,
  statusHistory: [{ createdAt: now }]
};

const createInput = {
  actorId: 9,
  shopId: 71,
  cardPublicId,
  orderNo: order.orderNo,
  idempotencyKey: "redemption-repository-001",
  requestFingerprint: "fingerprint",
  audit: {
    actorId: 9,
    action: "merchant.shop_membership_card.redemption.create",
    targetType: "ShopMembershipCardRedemption",
    ip: "127.0.0.1",
    metadata: { cardPublicId, orderNo: order.orderNo }
  }
};

describe("ShopMembershipCardRedemptionRepository", () => {
  it("paginates only completed orders that the card principal can fully cover", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
      shopMembershipCard: { findFirst: jest.fn().mockResolvedValue(card) },
      shopMembershipCardAdjustmentRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      bookingOrder: { findMany, count }
    } as unknown as PrismaClient;

    await expect(
      new ShopMembershipCardRedemptionRepository(client).listCandidates(71, cardPublicId, {
        page: 2,
        pageSize: 20
      })
    ).resolves.toEqual({ list: [], total: 0, page: 2, page_size: 20 });

    const expectedWhere = {
      shopId: 71,
      customerUserId: 41,
      status: "COMPLETED",
      currency: "JPY",
      priceAmount: { gt: 0, lte: 10_000 },
      membershipCardRedemption: null,
      deletedAt: null
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        skip: 20,
        take: 20
      })
    );
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("returns an explicit insufficient-card result before any card or reward mutation", async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: card.id }])
        .mockResolvedValueOnce([{ now }])
        .mockResolvedValueOnce([{ id: order.id }]),
      shopMembershipCardRedemption: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      },
      shopMembershipCard: {
        findFirst: jest.fn().mockResolvedValue(card),
        updateMany: jest.fn()
      },
      shopMembershipCardAdjustmentRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      bookingOrder: { findFirst: jest.fn().mockResolvedValue(order) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(tx))
    } as unknown as PrismaClient;
    const evaluate = jest.fn();
    const settle = jest.fn();

    await expect(
      new ShopMembershipCardRedemptionRepository(client).createWithEvaluationAndSettlement(
        createInput,
        evaluate,
        settle
      )
    ).resolves.toEqual({ kind: "insufficient_card_value" });
    expect(tx.shopMembershipCard.updateMany).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it("returns no candidates when a count card has no remaining uses", async () => {
    const emptyCard = {
      ...card,
      type: "COUNT",
      principalBalanceJpy: null,
      remainingUses: 0,
      planVersion: { ...card.planVersion, cardType: "COUNT" }
    };
    const findMany = jest.fn();
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
      shopMembershipCard: { findFirst: jest.fn().mockResolvedValue(emptyCard) },
      shopMembershipCardAdjustmentRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      bookingOrder: { findMany, count: jest.fn() }
    } as unknown as PrismaClient;

    await expect(
      new ShopMembershipCardRedemptionRepository(client).listCandidates(71, cardPublicId, {
        page: 1,
        pageSize: 20
      })
    ).resolves.toEqual({ list: [], total: 0, page: 1, page_size: 20 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
