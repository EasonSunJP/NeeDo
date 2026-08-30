import type { PrismaClient } from "@prisma/client";
import { ShopMembershipRepository } from "../src/repositories/shop-membership.repository";

const shop = { id: 71, shopNo: "s000000071", name: "青山护理店", city: "东京", address: "港区青山 1-1" };
const user = { needoId: "u0000000041", username: "王小美", avatarUrl: null };
const membership = {
  id: 31,
  publicId: "membership-31",
  shopId: 71,
  customerProfileId: 41,
  status: "ACTIVE",
  source: "MERCHANT_MANUAL",
  startedAt: new Date("2026-08-31T01:00:00.000Z"),
  endedAt: null,
  createdAt: new Date("2026-08-31T01:00:00.000Z"),
  updatedAt: new Date("2026-08-31T01:00:00.000Z"),
  shop,
  customerProfile: { displayName: "王小美", city: "东京", user },
  createdBy: { username: "店主" },
  cards: [],
  _count: { cards: 0 }
};

function prismaClient() {
  const transaction = {
    shopCustomerMembership: { create: jest.fn(async (input: unknown) => { void input; return membership; }) },
    auditLog: { create: jest.fn(async (input: unknown) => { void input; return undefined; }) }
  };
  return {
    client: {
      shopCustomerMembership: {
        findMany: jest.fn(async () => [membership]),
        count: jest.fn(async () => 1),
        create: jest.fn(),
        findFirst: jest.fn()
      },
      customerProfile: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
      shopMembershipCard: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
      shop: { findFirst: jest.fn(async () => shop) },
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
    },
    transaction
  };
}

describe("ShopMembershipRepository", () => {
  it("keeps merchant membership queries scoped to the authenticated shop", async () => {
    const { client } = prismaClient();
    const repository = new ShopMembershipRepository(client as unknown as PrismaClient);

    const result = await repository.listMemberships(71, { page: 1, pageSize: 20, status: "active" });

    expect(client.shopCustomerMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: 71, deletedAt: null, status: "ACTIVE" }),
        skip: 0,
        take: 20
      })
    );
    expect(client.shopCustomerMembership.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ shopId: 71, deletedAt: null, status: "ACTIVE" })
    });
    expect(result).toMatchObject({ total: 1, page: 1, page_size: 20 });
  });

  it("selects candidates inside the shop booking relation and excludes active members", async () => {
    const { client } = prismaClient();
    const repository = new ShopMembershipRepository(client as unknown as PrismaClient);

    await repository.listCandidates(71, { page: 1, pageSize: 20, keyword: "u0000000041" });

    expect(client.customerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          user: expect.objectContaining({
            bookingOrders: { some: { shopId: 71, deletedAt: null } }
          }),
          shopMemberships: {
            none: { shopId: 71, status: "ACTIVE", deletedAt: null }
          }
        })
      })
    );
    expect(client.customerProfile.findMany).toHaveBeenCalledTimes(1);
  });

  it("creates the relation and its safe audit record in one transaction", async () => {
    const { client, transaction } = prismaClient();
    const repository = new ShopMembershipRepository(client as unknown as PrismaClient);

    await repository.createMembershipWithAudit({
      actorId: 9,
      customerNeedoId: "u0000000041",
      customerProfileId: 41,
      shopId: 71,
      shopNo: "s000000071",
      audit: {
        actorId: 9,
        action: "merchant.shop_membership.create",
        targetType: "ShopCustomerMembership",
        ip: "127.0.0.1",
        metadata: { customerNeedoId: "u0000000041", shopNo: "s000000071", source: "merchant_manual" }
      }
    });

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.shopCustomerMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activeKey: "shop:71:customer:41",
          createdById: 9,
          customerProfileId: 41,
          shopId: 71,
          updatedById: 9
        })
      })
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "merchant.shop_membership.create",
        targetId: 31,
        targetType: "ShopCustomerMembership",
        metadata: expect.objectContaining({
          customerNeedoId: "u0000000041",
          membershipPublicId: "membership-31",
          shopNo: "s000000071"
        })
      })
    });
    expect(transaction.auditLog.create.mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({ data: expect.objectContaining({ customerProfileId: 41 }) })
    );
  });
});
