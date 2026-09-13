import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createMariaDbPoolConfig } from "../src/config/database";
import { ShopVisibilityRepository } from "../src/repositories/shop-visibility.repository";

const integrationDatabaseUrl = process.env.SHOP_VISIBILITY_INTEGRATION_DATABASE_URL;
const describeDatabase = integrationDatabaseUrl ? describe : describe.skip;

describeDatabase("ShopVisibilityRepository MySQL integration", () => {
  const databaseUrl = integrationDatabaseUrl ?? "mysql://invalid@127.0.0.1:1/invalid";
  const poolConfig = createMariaDbPoolConfig({
    DATABASE_URL: databaseUrl,
    DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: false,
    DATABASE_POOL_CONNECTION_LIMIT: 2,
    DATABASE_POOL_ACQUIRE_TIMEOUT_MS: 5_000,
    DATABASE_POOL_IDLE_TIMEOUT_MS: 5_000,
    DATABASE_POOL_CONNECT_TIMEOUT_MS: 5_000
  });
  const client = new PrismaClient({
    adapter: new PrismaMariaDb(poolConfig, { database: poolConfig.database })
  });
  const repository = new ShopVisibilityRepository(client);
  const suffix = `${process.pid}-${Date.now()}`;
  const userIds: number[] = [];

  afterAll(async () => {
    if (userIds.length > 0) {
      await client.contact.deleteMany({
        where: { OR: [{ ownerUserId: { in: userIds } }, { contactUserId: { in: userIds } }] }
      });
      await client.shop.deleteMany({ where: { ownerUserId: { in: userIds } } });
      await client.userIdentity.deleteMany({ where: { userId: { in: userIds } } });
      await client.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await client.$disconnect();
  });

  it("keeps list, count, and direct checks aligned to the exact shop identity", async () => {
    const [owner, viewer] = await Promise.all([
      client.user.create({
        data: {
          needoId: `owner-${suffix}`,
          email: `owner-${suffix}@needo.local`,
          username: "Visibility Owner"
        }
      }),
      client.user.create({
        data: {
          needoId: `viewer-${suffix}`,
          email: `viewer-${suffix}@needo.local`,
          username: "Visibility Viewer"
        }
      })
    ]);
    userIds.push(owner.id, viewer.id);
    const [oneWayShop, reciprocalShop, inactiveShop] = await Promise.all(
      ["one-way", "reciprocal", "inactive"].map((name) =>
        client.shop.create({
          data: {
            ownerUserId: owner.id,
            name: `${name}-${suffix}`,
            city: "Tokyo",
            address: "Local integration only",
            status: "published",
            visibility: "limited"
          }
        })
      )
    );
    const viewerIdentity = await client.userIdentity.create({
      data: {
        userId: viewer.id,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: 1,
        activeKey: `viewer-${suffix}`
      }
    });
    const [oneWayIdentity, reciprocalIdentity, inactiveIdentity] = await Promise.all([
      client.userIdentity.create({
        data: {
          userId: owner.id,
          type: "merchant",
          scopeType: "shop",
          scopeId: oneWayShop.id,
          activeKey: `shop-one-way-${suffix}`
        }
      }),
      client.userIdentity.create({
        data: {
          userId: owner.id,
          type: "merchant",
          scopeType: "shop",
          scopeId: reciprocalShop.id,
          activeKey: `shop-reciprocal-${suffix}`
        }
      }),
      client.userIdentity.create({
        data: {
          userId: owner.id,
          type: "merchant",
          scopeType: "shop",
          scopeId: inactiveShop.id,
          isActive: false
        }
      })
    ]);
    const createContact = (ownerIdentityId: number, contactIdentityId: number) =>
      client.contact.create({
        data: {
          ownerUserId: ownerIdentityId === viewerIdentity.id ? viewer.id : owner.id,
          ownerIdentityId,
          contactUserId: contactIdentityId === viewerIdentity.id ? viewer.id : owner.id,
          contactIdentityId,
          source: "friend_request"
        }
      });
    await Promise.all([
      createContact(viewerIdentity.id, oneWayIdentity.id),
      createContact(viewerIdentity.id, reciprocalIdentity.id),
      createContact(reciprocalIdentity.id, viewerIdentity.id),
      createContact(viewerIdentity.id, inactiveIdentity.id),
      createContact(inactiveIdentity.id, viewerIdentity.id)
    ]);

    const visibilityViewer = {
      userId: viewer.id,
      identityId: viewerIdentity.id,
      identityType: "customer",
      identityScopeType: "customer_profile",
      identityScopeId: 1
    };
    const visibilityWhere = await repository.buildVisibilityWhere(visibilityViewer);
    const targetIds = [oneWayShop.id, reciprocalShop.id, inactiveShop.id];
    const [visibleShops, visibleCount, oneWayVisible, reciprocalVisible, inactiveVisible] =
      await Promise.all([
        client.shop.findMany({
          where: { id: { in: targetIds }, ...visibilityWhere },
          select: { id: true },
          orderBy: { id: "asc" }
        }),
        client.shop.count({ where: { id: { in: targetIds }, ...visibilityWhere } }),
        repository.canView(oneWayShop.id, visibilityViewer),
        repository.canView(reciprocalShop.id, visibilityViewer),
        repository.canView(inactiveShop.id, visibilityViewer)
      ]);

    expect(visibleShops).toEqual([{ id: reciprocalShop.id }]);
    expect(visibleCount).toBe(1);
    expect(oneWayVisible).toBe(false);
    expect(reciprocalVisible).toBe(true);
    expect(inactiveVisible).toBe(false);
  });
});
