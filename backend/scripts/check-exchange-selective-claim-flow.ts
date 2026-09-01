import { randomUUID } from "node:crypto";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { requireSafeExchangeClaimFlowEnvironment } from "./support/exchange-claim-flow-safety";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectErrorMessage(operation: () => Promise<unknown>, expected: string): Promise<void> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error && caught.message === expected, `expected ${expected}`);
}

const main = async (): Promise<void> => {
  const target = requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
  process.env.ENV_FILE = target.envFile;
  console.log(JSON.stringify({ databaseTarget: target.maskedDatabaseTarget, safety: "local-only" }));

  const [
    { prisma, disconnectPrisma },
    { ExchangeClaimRepository },
    { ExchangePostRepository },
    { ExchangeClaimService },
    { ExchangeService }
  ] = await Promise.all([
    import("../src/prisma/client"),
    import("../src/repositories/exchange-claim.repository"),
    import("../src/repositories/exchange.repository"),
    import("../src/services/exchange-claim.service"),
    import("../src/services/exchange.service")
  ]);

  const marker = `exchange-claim-flow-${Date.now()}-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const baseNow = new Date();
  const fixtureStartedAt = new Date(baseNow.getTime() - 1_000);
  const startsAt = new Date(baseNow.getTime() + 2 * 60 * 60 * 1000);
  const endsAt = new Date(baseNow.getTime() + 3 * 60 * 60 * 1000);
  const context = { ip: "127.0.0.1", userAgent: marker };
  const captured = {
    userIds: [] as number[],
    identityIds: [] as number[],
    publicIdentifierIds: [] as number[],
    shopIds: [] as number[],
    technicianProfileIds: [] as number[],
    affiliationIds: [] as number[],
    categoryIds: [] as number[],
    serviceIds: [] as number[],
    scheduleSlotIds: [] as number[],
    postIds: [] as number[],
    claimIds: [] as number[],
    auditIds: [] as number[]
  };
  const allowedAuditActions = [
    "exchange.claim.create",
    "exchange.claim.withdraw",
    "exchange.claim.request_expired",
    "exchange.post.expire"
  ];
  const captureOwnedAuditIds = async (): Promise<void> => {
    const postIds = captured.postIds.length > 0 ? captured.postIds : [-1];
    const rows = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: fixtureStartedAt },
        action: { in: allowedAuditActions },
        OR: [
          { userAgent: marker },
          { targetType: "ExchangePost", targetId: { in: postIds } }
        ]
      },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        userAgent: true
      }
    });
    for (const row of rows) {
      const claimContextOwned = row.userAgent === marker;
      const terminalPostOwned =
        row.targetType === "ExchangePost" &&
        row.targetId !== null &&
        captured.postIds.includes(row.targetId) &&
        ["exchange.claim.request_expired", "exchange.post.expire"].includes(row.action);
      assert(claimContextOwned || terminalPostOwned, `audit ${row.id} is outside the fixture ownership boundary`);
      captured.auditIds.push(row.id);
    }
    captured.auditIds = [...new Set(captured.auditIds)];
  };
  console.log(JSON.stringify({ fixtureSetup: "direct-prisma-exact", namespace: marker }));

  const numberPartBase = String(
    Number.parseInt(marker.slice(-10, -2), 16) % 1_000_000_000
  ).padStart(9, "0");
  const numberPart = (sequence: number) => `${numberPartBase}${sequence}`;
  const createUser = async (role: string) => {
    const user = await prisma.user.create({
      data: {
        needoId: `flow-${marker.slice(-10)}-${role}`,
        email: `${marker}-${role}@needo.test`,
        username: `${marker} ${role}`,
        isTestAccount: true
      }
    });
    captured.userIds.push(user.id);
    return user;
  };
  const createIdentity = async (input: {
    userId: number;
    type: string;
    displayName: string;
    scopeType: string | null;
    scopeId: number | null;
    kind: "B" | "S";
    sequence: number;
  }) => {
    const identity = await prisma.userIdentity.create({
      data: {
        userId: input.userId,
        type: input.type,
        displayName: input.displayName,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        activeKey: `${marker}:identity:${input.sequence}`
      }
    });
    captured.identityIds.push(identity.id);
    const digits = numberPart(input.sequence);
    const publicIdentifier = await prisma.publicIdentifier.create({
      data: {
        publicId: `${input.kind.toLowerCase()}${digits}`,
        numberPart: digits,
        kind: input.kind,
        userIdentityId: identity.id,
        status: "ACTIVE"
      }
    });
    captured.publicIdentifierIds.push(publicIdentifier.id);
    return { identity, publicId: publicIdentifier.publicId };
  };

  try {
    const ownerUser = await createUser("owner");
    const claimantUser = await createUser("claimant");
    const technicianUser = await createUser("technician");
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: claimantUser.id,
        name: `${marker} shop`,
        city: "Tokyo",
        address: "Tokyo",
        status: "published",
        pricingMode: "MERCHANT"
      }
    });
    captured.shopIds.push(shop.id);
    const technician = await prisma.technicianProfile.create({
      data: {
        userId: technicianUser.id,
        shopId: shop.id,
        displayName: `${marker} technician`,
        city: "Tokyo",
        status: "published"
      }
    });
    captured.technicianProfileIds.push(technician.id);

    const owner = await createIdentity({
      userId: ownerUser.id,
      type: "merchant_owner",
      displayName: `${marker} owner`,
      scopeType: null,
      scopeId: null,
      kind: "B",
      sequence: 1
    });
    const claimant = await createIdentity({
      userId: claimantUser.id,
      type: "merchant_owner",
      displayName: `${marker} claimant`,
      scopeType: "shop",
      scopeId: shop.id,
      kind: "B",
      sequence: 2
    });
    await createIdentity({
      userId: technicianUser.id,
      type: "technician",
      displayName: `${marker} technician`,
      scopeType: "technician_profile",
      scopeId: technician.id,
      kind: "S",
      sequence: 3
    });

    const affiliation = await prisma.technicianShopAffiliation.create({
      data: {
        technicianProfileId: technician.id,
        shopId: shop.id,
        relationshipType: "EXCLUSIVE",
        workStatus: "ACTIVE",
        startsAt: new Date(baseNow.getTime() - 24 * 60 * 60 * 1000),
        activeKey: `${marker}:affiliation`
      }
    });
    captured.affiliationIds.push(affiliation.id);
    const category = await prisma.category.create({
      data: { code: `${marker.slice(-24)}-cat`, name: `${marker} category` }
    });
    captured.categoryIds.push(category.id);
    const serviceRecord = await prisma.service.create({
      data: {
        categoryId: category.id,
        shopId: shop.id,
        name: `${marker} service`,
        city: "Tokyo",
        priceAmount: 15_000,
        durationMinutes: 60,
        status: "published"
      }
    });
    captured.serviceIds.push(serviceRecord.id);
    const slot = await prisma.scheduleSlot.create({
      data: {
        serviceId: serviceRecord.id,
        shopId: shop.id,
        technicianProfileId: technician.id,
        startsAt,
        endsAt,
        capacity: 1,
        bookedCount: 0,
        status: "AVAILABLE"
      }
    });
    captured.scheduleSlotIds.push(slot.id);

    const createRequest = async (suffix: string, expiresAt: Date) => {
      const post = await prisma.exchangePost.create({
        data: {
          authorUserId: ownerUser.id,
          authorIdentityId: owner.identity.id,
          ownerIdentityId: owner.identity.id,
          publisherPublicId: owner.publicId,
          publisherIdentityType: "merchant_owner",
          publisherDisplayName: `${marker} owner`,
          type: "DEMAND",
          status: "PUBLISHED",
          title: `${marker} ${suffix}`,
          detail: "Formal selective claim flow fixture",
          contentLocale: "EN",
          areaLabel: "Tokyo",
          serviceStartAt: startsAt,
          serviceEndAt: endsAt,
          expiresAt,
          idempotencyKey: `${marker}:post:${suffix}`,
          demand: {
            create: {
              targetProviderCount: 1,
              targetProviderLimitSnapshot: 20,
              publisherCapacitySource: "SHOP_MERCHANT",
              matchMode: "SELECTIVE",
              budgetMode: "TOTAL",
              budgetMinJpy: 10_000,
              budgetMaxJpy: 30_000,
              addressLine1: "Tokyo"
            }
          }
        }
      });
      captured.postIds.push(post.id);
      return post;
    };
    const requestExpiry = new Date(baseNow.getTime() + 4 * 60 * 60 * 1000);
    const firstPost = await createRequest("first", requestExpiry);
    const overlapPost = await createRequest("overlap", requestExpiry);
    const expiryPost = await createRequest("expiry", requestExpiry);

    const claimantAccess: AuthenticatedAccessContext = {
      userId: claimantUser.id,
      email: claimantUser.email,
      accessTokenJti: marker,
      accessTokenExpiresAt: Date.now() + 60_000,
      currentIdentityId: claimant.identity.id,
      currentPublicId: claimant.publicId,
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: shop.id,
      selectedMerchantShopId: shop.id,
      roles: ["merchant_owner"],
      permissions: []
    };
    const ownerAccess: AuthenticatedAccessContext = {
      userId: ownerUser.id,
      email: ownerUser.email,
      accessTokenJti: `${marker}:owner`,
      accessTokenExpiresAt: Date.now() + 60_000,
      currentIdentityId: owner.identity.id,
      currentPublicId: owner.publicId,
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: null,
      currentIdentityScopeId: null,
      roles: ["merchant_owner"],
      permissions: []
    };

    const claimRepository = new ExchangeClaimRepository(prisma);
    const postRepository = new ExchangePostRepository(prisma);
    const claimService = new ExchangeClaimService(claimRepository, postRepository, () => baseNow);
    const options = await claimService.listOptions(claimantAccess, firstPost.id, {
      page: 1,
      page_size: 20
    });
    assert(options.total === 1 && options.list[0]?.scheduleSlotId === slot.id, "eligible option was not projected");
    console.log("PASS eligible option was projected from formal schedule data");

    const createInput = { scheduleSlotId: slot.id, quoteAmountJpy: 15_000, message: "正式验收留言" };
    const idempotencyKey = `${marker}:claim:first`;
    const firstClaim = await claimService.createClaim(
      claimantAccess,
      firstPost.id,
      createInput,
      idempotencyKey,
      context
    );
    captured.claimIds.push(firstClaim.id);
    const replay = await claimService.createClaim(
      claimantAccess,
      firstPost.id,
      createInput,
      idempotencyKey,
      context
    );
    assert(replay.id === firstClaim.id, "idempotent replay returned a different claim");
    assert((await claimService.getMine(claimantAccess, firstPost.id))?.id === firstClaim.id, "claim did not persist");
    assert((await claimService.listReceived(ownerAccess, firstPost.id, { page: 1, page_size: 20 })).total === 1, "owner could not read persisted claim");
    console.log("PASS create, persistence, owner pagination, and idempotent replay");

    await expectErrorMessage(
      () => claimService.createClaim(
        claimantAccess,
        firstPost.id,
        createInput,
        `${marker}:claim:duplicate`,
        context
      ),
      "error.exchange.claim_duplicate"
    );
    await expectErrorMessage(
      () => claimService.createClaim(
        claimantAccess,
        overlapPost.id,
        createInput,
        `${marker}:claim:overlap`,
        context
      ),
      "error.exchange.claim_time_conflict"
    );
    console.log("PASS duplicate and overlapping technician time were rejected");

    const withdrawn = await claimService.withdrawClaim(
      claimantAccess,
      firstClaim.id,
      `${marker}:withdraw:first`,
      context
    );
    assert(withdrawn.status === "withdrawn", "claim withdrawal was not persisted");
    const withdrawalReplay = await claimService.withdrawClaim(
      claimantAccess,
      firstClaim.id,
      `${marker}:withdraw:first`,
      context
    );
    assert(withdrawalReplay.id === withdrawn.id, "withdrawal idempotent replay changed the claim");
    const withdrawalAuditCount = await prisma.auditLog.count({
      where: {
        action: "exchange.claim.withdraw",
        targetType: "exchange_claim",
        targetId: firstClaim.id,
        userAgent: marker,
        createdAt: { gte: fixtureStartedAt }
      }
    });
    assert(withdrawalAuditCount === 1, "withdrawal idempotent replay duplicated its audit");
    console.log("PASS claimant withdrawal idempotent replay did not duplicate its audit");
    const releasedOptions = await claimService.listOptions(claimantAccess, overlapPost.id, {
      page: 1,
      page_size: 20
    });
    assert(releasedOptions.total === 1, "claim withdrawal did not release the technician time");
    console.log("PASS claimant withdrawal released the technician time");

    const expiryClaim = await claimService.createClaim(
      claimantAccess,
      expiryPost.id,
      createInput,
      `${marker}:claim:expiry`,
      context
    );
    captured.claimIds.push(expiryClaim.id);
    const expiryAt = new Date(requestExpiry.getTime() + 60 * 1000);
    const exchangeService = new ExchangeService(postRepository, () => expiryAt);
    assert(await exchangeService.expirePost(expiryPost.id, expiryAt), "Request did not expire");
    const expiredClaim = await prisma.exchangeClaim.findUniqueOrThrow({ where: { id: expiryClaim.id } });
    assert(
      expiredClaim.status === "REQUEST_EXPIRED" && expiredClaim.activeKey === null,
      "Request expiry did not release its active claim"
    );
    console.log("PASS Request expiry persisted terminal claim state and released the time");

    await captureOwnedAuditIds();
    assert(captured.auditIds.length >= 4, "expected claim and terminal audit records were not found");
    console.log("PASS claim lifecycle audit records were persisted");
    console.log(JSON.stringify({ result: "PASS", namespace: marker, createdClaims: captured.claimIds.length }));
  } finally {
    await captureOwnedAuditIds();
    if (captured.auditIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: captured.auditIds } } });
    }
    if (captured.claimIds.length > 0) {
      await prisma.exchangeClaim.deleteMany({ where: { id: { in: captured.claimIds } } });
    }
    if (captured.postIds.length > 0) {
      await prisma.exchangeDemand.deleteMany({ where: { postId: { in: captured.postIds } } });
      await prisma.exchangePost.deleteMany({ where: { id: { in: captured.postIds } } });
    }
    if (captured.scheduleSlotIds.length > 0) {
      await prisma.scheduleSlot.deleteMany({ where: { id: { in: captured.scheduleSlotIds } } });
    }
    if (captured.serviceIds.length > 0) {
      await prisma.service.deleteMany({ where: { id: { in: captured.serviceIds } } });
    }
    if (captured.categoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: captured.categoryIds } } });
    }
    if (captured.affiliationIds.length > 0) {
      await prisma.technicianShopAffiliation.deleteMany({ where: { id: { in: captured.affiliationIds } } });
    }
    if (captured.technicianProfileIds.length > 0) {
      await prisma.technicianProfile.deleteMany({ where: { id: { in: captured.technicianProfileIds } } });
    }
    if (captured.publicIdentifierIds.length > 0) {
      await prisma.publicIdentifier.deleteMany({ where: { id: { in: captured.publicIdentifierIds } } });
    }
    if (captured.identityIds.length > 0) {
      await prisma.userIdentity.deleteMany({ where: { id: { in: captured.identityIds } } });
    }
    if (captured.shopIds.length > 0) {
      await prisma.shop.deleteMany({ where: { id: { in: captured.shopIds } } });
    }
    if (captured.userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: captured.userIds } } });
    }
    console.log(JSON.stringify({ cleanup: "PASS", namespace: marker }));
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Exchange claim flow check failed");
  process.exitCode = 1;
});
