import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createMariaDbPoolConfig } from "../src/config/database";
import { ShopVisibilityRepository } from "../src/repositories/shop-visibility.repository";
import type { ShopVisibilityViewer } from "../src/repositories/shop-visibility.repository";
import { CoreReadRepository } from "../src/repositories/core-read.repository";
import { CoreReadService } from "../src/services/core-read.service";
import { toShopVisibilityViewer } from "../src/services/shop-visibility.service";
import { randomInt } from "node:crypto";
import { assertSafeCustomerProfileRepositoryDatabaseUrl } from "./customer-profile-repository-integration-safety";

const integrationDatabaseUrl = process.env.SHOP_VISIBILITY_INTEGRATION_DATABASE_URL;
if (integrationDatabaseUrl) assertSafeCustomerProfileRepositoryDatabaseUrl(integrationDatabaseUrl);
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

  it("enforces the four modes in real search totals and direct reads without borrowing another identity's relationships", async () => {
    const rollback = new Error("rollback isolated visibility matrix");
    const marker = `privacy-${Date.now()}`;
    await expect(client.$transaction(async (tx) => {
      const db = tx as unknown as PrismaClient;
      const policy = new ShopVisibilityRepository(db);
      const reads = new CoreReadRepository(db);
      const service = new CoreReadService(reads);
      const customer = async (label: string) => {
        const user = await tx.user.create({ data: {
          needoId: `n${randomInt(1_000_000_000, 10_000_000_000)}`,
          email: `${marker}-${label}@needo.local`, username: label
        } });
        const profile = await tx.customerProfile.create({ data: {
          userId: user.id, displayName: label, visibility: "privateAll", isPublic: false
        } });
        const identity = await tx.userIdentity.create({ data: {
          userId: user.id, type: "customer", scopeType: "customer_profile", scopeId: profile.id
        } });
        return { user, profile, identity, viewer: {
          userId: user.id, identityId: identity.id, identityType: identity.type,
          identityScopeType: identity.scopeType, identityScopeId: identity.scopeId
        } satisfies ShopVisibilityViewer };
      };
      const owner = await customer("owner");
      const shop = await tx.shop.create({ data: {
        ownerUserId: owner.user.id, name: marker, city: "Tokyo", address: "Local matrix",
        visibility: "public", status: "published"
      } });
      const numberPart = String(randomInt(1_000_000_000, 10_000_000_000));
      const identifier = await tx.publicIdentifier.create({ data: {
        publicId: `shop${numberPart}`, numberPart, kind: "SHOP", shopId: shop.id
      } });
      const merchant = await tx.userIdentity.create({ data: {
        userId: owner.user.id, type: "merchant_owner", scopeType: "shop", scopeId: shop.id
      } });
      const ownerViewer = { ...owner.viewer, identityId: merchant.id,
        identityType: merchant.type, identityScopeType: "shop", identityScopeId: shop.id };
      const technician = await tx.technicianProfile.create({ data: {
        userId: owner.user.id, shopId: shop.id, displayName: marker, city: "Tokyo", visibility: "public"
      } });
      const technicianIdentity = await tx.userIdentity.create({ data: {
        userId: owner.user.id, type: "technician", scopeType: "technician_profile", scopeId: technician.id
      } });
      const technicianNumber = String(randomInt(1_000_000_000, 10_000_000_000));
      await tx.publicIdentifier.create({ data: {
        kind: "S", publicId: `s${technicianNumber}`, numberPart: technicianNumber,
        userIdentityId: technicianIdentity.id
      } });
      const technicianViewer = { ...owner.viewer, identityId: technicianIdentity.id,
        identityType: "technician", identityScopeType: "technician_profile", identityScopeId: technician.id };
      const affiliation = await tx.technicianShopAffiliation.create({ data: {
        technicianProfileId: technician.id, shopId: shop.id, relationshipType: "PARTNER",
        workStatus: "ACTIVE", activeKey: `${marker}-tech`, startsAt: new Date(0)
      } });
      const shopFriend = await customer("shop-friend");
      const technicianFriend = await customer("technician-friend");
      const stranger = await customer("stranger");
      const network = await customer("network");
      const business = await customer("business");
      const scout = await customer("scout");
      const scoutIdentity = await tx.userIdentity.create({ data: {
        userId: scout.user.id, type: "scout", scopeType: "global"
      } });
      const scoutViewer = { ...scout.viewer, identityId: scoutIdentity.id,
        identityType: "scout", identityScopeType: "global", identityScopeId: null };
      const organization = await customer("organization");
      const account = await tx.merchantAccount.create({ data: {
        code: marker, name: marker, ownerUserId: organization.user.id
      } });
      const accountMembership = await tx.merchantShopMembership.create({ data: {
        merchantAccountId: account.id, shopId: shop.id, activeKey: marker, startsAt: new Date(0)
      } });
      const accountIdentity = await tx.userIdentity.create({ data: {
        userId: organization.user.id, type: "merchant_organization",
        scopeType: "merchant_account", scopeId: account.id
      } });
      const accountViewer = toShopVisibilityViewer({
        userId: organization.user.id, currentIdentityId: accountIdentity.id,
        currentIdentityType: accountIdentity.type, currentIdentityScopeType: accountIdentity.scopeType,
        currentIdentityScopeId: accountIdentity.scopeId, selectedMerchantShopId: shop.id
      });
      const partner = await tx.platformPartnerProfile.create({ data: {
        userId: scout.user.id, partnerType: "AGENT", activatedAt: new Date(0),
        markedById: owner.user.id, reason: marker
      } });
      const referral = await tx.agentShopReferral.create({ data: {
        agentProfileId: partner.id, shopId: shop.id, status: "ACTIVE", source: marker,
        confirmedAt: new Date(0), confirmedById: owner.user.id, reason: marker
      } });
      const membership = await tx.shopCustomerMembership.create({ data: {
        shopId: shop.id, customerProfileId: network.profile.id, activeKey: `${marker}-member`
      } });
      const contact = (from: typeof merchant, to: typeof merchant, source = "friend_request") =>
        tx.contact.create({ data: { ownerUserId: from.userId, ownerIdentityId: from.id,
          contactUserId: to.userId, contactIdentityId: to.id, source } });
      const forward = await contact(shopFriend.identity, merchant);
      await contact(merchant, shopFriend.identity);
      await contact(technicianFriend.identity, technicianIdentity);
      await contact(technicianIdentity, technicianFriend.identity);
      await contact(business.identity, merchant, "manual");

      const assertVisible = async (viewer: ShopVisibilityViewer | undefined, visible: boolean) => {
        const search = await reads.searchShops({ entityType: "shop", keyword: marker,
          keywords: [], categoryIds: [], page: 1, pageSize: 1 }, viewer);
        expect(search.total).toBe(visible ? 1 : 0);
        expect(search.list.map((item) => item.id)).toEqual(visible ? [shop.id] : []);
        expect(await policy.canView(shop.id, viewer)).toBe(visible);
        for (const id of [shop.id, identifier.publicId]) {
          if (visible) {
            expect(await service.getShopDetail(id, undefined, viewer)).toMatchObject({ id: shop.id });
          } else {
            await expect(service.getShopDetail(id, undefined, viewer)).rejects.toMatchObject({
              statusCode: 404, message: "error.shop.not_found"
            });
          }
        }
      };
      for (const mode of ["public", "privateAll", "limited", "network"] as const) {
        await tx.shop.update({ where: { id: shop.id }, data: { visibility: mode } });
        await assertVisible(undefined, mode === "public");
        await assertVisible(ownerViewer, true);
        await assertVisible(owner.viewer, mode === "public");
        await assertVisible(shopFriend.viewer, mode !== "privateAll");
        await assertVisible(technicianFriend.viewer, mode === "public");
        await assertVisible(stranger.viewer, mode === "public");
        await assertVisible(technicianViewer, mode === "public" || mode === "network");
        await assertVisible(network.viewer, mode === "public" || mode === "network");
        await assertVisible(business.viewer, mode === "public" || mode === "network");
        await assertVisible(scoutViewer, mode === "public" || mode === "network");
        await assertVisible(scout.viewer, mode === "public");
        await assertVisible(accountViewer, mode === "public" || mode === "network");
        await assertVisible(organization.viewer, mode === "public");
        // Customer privacy never hides the same account's public technician identity.
        expect(await reads.findTechnicianDetail(technician.id)).toMatchObject({
          id: technician.id, shop: mode === "public" ? expect.objectContaining({ id: shop.id }) : null
        });
      }
      await tx.shop.update({ where: { id: shop.id }, data: { visibility: "limited" } });
      await tx.contact.update({ where: { id: forward.id }, data: { blockedAt: new Date() } });
      await assertVisible(shopFriend.viewer, false);
      await tx.contact.update({ where: { id: forward.id }, data: { blockedAt: null, deletedAt: new Date() } });
      await assertVisible(shopFriend.viewer, false);
      await tx.shop.update({ where: { id: shop.id }, data: { visibility: "network" } });
      await tx.shopCustomerMembership.update({ where: { id: membership.id }, data: { endedAt: new Date() } });
      await assertVisible(network.viewer, false);
      await tx.technicianShopAffiliation.update({ where: { id: affiliation.id }, data: { endsAt: new Date(1) } });
      await assertVisible(technicianViewer, false);
      await tx.agentShopReferral.update({ where: { id: referral.id }, data: { status: "REVOKED" } });
      await assertVisible(scoutViewer, false);
      await tx.merchantShopMembership.update({ where: { id: accountMembership.id }, data: { endsAt: new Date(1) } });
      await assertVisible(accountViewer, false);
      await tx.agentShopReferral.update({ where: { id: referral.id }, data: { status: "ACTIVE" } });
      await tx.platformPartnerProfile.update({ where: { id: partner.id }, data: { endsAt: new Date(1) } });
      await assertVisible(scoutViewer, false);
      throw rollback;
    }, { timeout: 90_000 })).rejects.toBe(rollback);
    expect(await client.shop.count({ where: { name: marker } })).toBe(0);
    expect(await client.user.count({ where: { email: { startsWith: `${marker}-` } } })).toBe(0);
  }, 100_000);

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
