import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { AppError } from "../src/utils/app-error";

const TASK_BUDGET_NDP = 2_000_000;
const REWARD_NDP = 1_000;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertSafeLocalDatabase = (): string => {
  assert(
    process.env.NODE_ENV !== "production",
    "affiliate marketplace claim check rejects NODE_ENV=production"
  );
  assert(
    !["staging", "prod"].includes(process.env.DEPLOY_ENV || ""),
    "affiliate marketplace claim check rejects staging and production deploy environments"
  );
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "affiliate marketplace claim check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName),
    "affiliate marketplace claim check rejects production-looking database names"
  );
  return databaseName;
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const [
    { AffiliateMarketplaceRepository },
    { AffiliateLinkTokenService },
    { AffiliateMarketplaceService },
    { createFormalTestUser, deleteFormalTestUserFoundations },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/affiliate-marketplace.repository"),
    import("../src/services/affiliate-link-token.service"),
    import("../src/services/affiliate-marketplace.service"),
    import("./support/formal-test-user"),
    import("../src/prisma/client")
  ]);
  const marker = `affiliate-marketplace-claim-${Date.now()}-${process.pid}`;
  const userIds: number[] = [];
  const roleIds: number[] = [];
  const permissionIds: number[] = [];
  const taskIds: number[] = [];
  const claimIds: number[] = [];
  let categoryId: number | null = null;
  let shopId: number | null = null;
  let serviceId: number | null = null;
  let walletId: number | null = null;

  try {
    const passwordHash = await hash("AffiliateClaimFlow.2026!", 12);
    const createUser = (email: string, username: string) =>
      createFormalTestUser(prisma, { email, passwordHash, username });
    const publisher = await createUser(`${marker}-publisher@needo.test`, `${marker} publisher`);
    const claimant = await createUser(`${marker}-claimant@needo.test`, `${marker} claimant`);
    const otherUser = await createUser(`${marker}-other@needo.test`, `${marker} other`);
    userIds.push(publisher.id, claimant.id, otherUser.id);

    const fullRole = await prisma.role.create({
      data: {
        name: `${marker} full role`,
        code: `${marker}-full-role`,
        description: "Local affiliate marketplace acceptance role"
      }
    });
    const readRole = await prisma.role.create({
      data: {
        name: `${marker} read role`,
        code: `${marker}-read-role`,
        description: "Local affiliate marketplace read acceptance role"
      }
    });
    roleIds.push(fullRole.id, readRole.id);
    const readPermission = await prisma.permission.create({
      data: {
        name: `${marker} read permission`,
        code: `${marker}-read-permission`,
        type: "page",
        module: "affiliate",
        description: "Local affiliate marketplace read acceptance permission"
      }
    });
    const claimPermission = await prisma.permission.create({
      data: {
        name: `${marker} claim permission`,
        code: `${marker}-claim-permission`,
        type: "button",
        module: "affiliate",
        description: "Local affiliate marketplace claim acceptance permission"
      }
    });
    permissionIds.push(readPermission.id, claimPermission.id);
    await prisma.rolePermission.createMany({
      data: [
        { roleId: fullRole.id, permissionId: readPermission.id },
        { roleId: fullRole.id, permissionId: claimPermission.id },
        { roleId: readRole.id, permissionId: readPermission.id }
      ]
    });
    const identities = [claimant, otherUser].map((user) => user.identities[0]!);
    await prisma.userRole.createMany({
      data: [
        { userId: claimant.id, roleId: fullRole.id, scopeType: "global" },
        { userId: otherUser.id, roleId: readRole.id, scopeType: "global" }
      ]
    });

    const category = await prisma.category.create({
      data: { code: `${marker}-category`, name: `${marker} category` }
    });
    categoryId = category.id;
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: publisher.id,
        name: `${marker} Shibuya shop`,
        city: "Tokyo",
        address: "Local affiliate acceptance address",
        status: "published"
      }
    });
    shopId = shop.id;
    const serviceRecord = await prisma.service.create({
      data: {
        categoryId: category.id,
        shopId: shop.id,
        name: `${marker} Aroma 60`,
        city: "Tokyo",
        priceAmount: 8_800,
        durationMinutes: 60,
        status: "published"
      }
    });
    serviceId = serviceRecord.id;
    const wallet = await prisma.wallet.create({
      data: {
        ownerType: "SHOP",
        ownerId: shop.id,
        availableBalance: 1_000_000,
        frozenBalance: TASK_BUDGET_NDP
      }
    });
    walletId = wallet.id;

    const currentTime = new Date();
    const claimStartsAt = new Date(currentTime.getTime() - 60_000);
    const claimEndsAt = new Date(currentTime.getTime() + 7 * 24 * 60 * 60 * 1_000);
    const taskEndsAt = new Date(currentTime.getTime() + 14 * 24 * 60 * 60 * 1_000);
    const activeTask = await prisma.affiliateTask.create({
      data: {
        taskCode: `${marker}-active`,
        lineageKey: `${marker}-active`,
        publisherType: "SHOP",
        publisherShopId: shop.id,
        name: `${marker} completed-service reward`,
        description: "Formal local claim acceptance",
        rewardNdpPerCompletedOrder: REWARD_NDP,
        totalBudgetNdp: TASK_BUDGET_NDP,
        reservedBudgetNdp: TASK_BUDGET_NDP,
        customerDiscountType: "FIXED_JPY",
        fixedDiscountJpy: 500,
        minimumOrderAmountJpy: 5_000,
        claimStartsAt,
        claimEndsAt,
        taskStartsAt: claimStartsAt,
        taskEndsAt,
        attributionWindowDays: 30,
        maxCompletedOrdersPerClaim: 20,
        maxCompletedOrdersPerCustomer: 1,
        serviceScopeMode: "SELECTED_SERVICES",
        status: "ACTIVE",
        reviewedById: publisher.id,
        reviewedAt: currentTime,
        submittedAt: currentTime,
        activatedAt: currentTime,
        shops: {
          create: { shopId: shop.id, shopNameSnapshot: shop.name }
        },
        services: {
          create: {
            shopId: shop.id,
            serviceId: serviceRecord.id,
            serviceNameSnapshot: serviceRecord.name,
            servicePriceJpySnapshot: 8_800
          }
        },
        budgetReservation: {
          create: {
            walletId: wallet.id,
            totalFrozenNdp: TASK_BUDGET_NDP,
            status: "ACTIVE",
            idempotencyKey: `${marker}-reservation`
          }
        }
      }
    });
    taskIds.push(activeTask.id);
    const pausedTask = await prisma.affiliateTask.create({
      data: {
        taskCode: `${marker}-paused`,
        lineageKey: `${marker}-paused`,
        publisherType: "SHOP",
        publisherShopId: shop.id,
        name: `${marker} paused reward`,
        rewardNdpPerCompletedOrder: REWARD_NDP,
        totalBudgetNdp: REWARD_NDP,
        claimStartsAt,
        claimEndsAt,
        taskStartsAt: claimStartsAt,
        taskEndsAt,
        attributionWindowDays: 30,
        maxCompletedOrdersPerCustomer: 1,
        serviceScopeMode: "SELECTED_SERVICES",
        status: "PAUSED",
        shops: {
          create: { shopId: shop.id, shopNameSnapshot: shop.name }
        },
        services: {
          create: {
            shopId: shop.id,
            serviceId: serviceRecord.id,
            serviceNameSnapshot: serviceRecord.name,
            servicePriceJpySnapshot: 8_800
          }
        }
      }
    });
    taskIds.push(pausedTask.id);

    const repository = new AffiliateMarketplaceRepository(prisma);
    const marketplace = new AffiliateMarketplaceService(
      repository,
      new AffiliateLinkTokenService({
        secret: process.env.AFFILIATE_LINK_SECRET || "",
        publicBaseUrl: process.env.AFFILIATE_PUBLIC_BASE_URL || ""
      })
    );
    const claimantActor = {
      userId: claimant.id,
      email: claimant.email,
      accessTokenJti: `${marker}-claimant-token`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      currentIdentityId: identities[0].id,
      currentIdentityType: "customer",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null,
      roles: [fullRole.code],
      permissions: ["page:affiliate-marketplace", "button:affiliate-claim"]
    };
    const otherActor = {
      ...claimantActor,
      userId: otherUser.id,
      email: otherUser.email,
      accessTokenJti: `${marker}-other-token`,
      currentIdentityId: identities[1].id,
      roles: [readRole.code],
      permissions: ["page:affiliate-marketplace"]
    };

    const taskPage = await marketplace.listTasks(claimantActor, {
      keyword: marker,
      shopId: shop.id,
      serviceId: serviceRecord.id,
      customerDiscountType: "fixed_jpy",
      page: 1,
      pageSize: 20
    });
    assert(
      taskPage.total === 1 && taskPage.list[0]?.id === activeTask.id,
      "marketplace eligibility filters exposed a paused or unrelated task"
    );
    assert(
      !Object.prototype.hasOwnProperty.call(taskPage.list[0], "budgetReservation") &&
        !Object.prototype.hasOwnProperty.call(taskPage.list[0], "publisherShopId"),
      "marketplace response exposed internal publisher or budget data"
    );
    console.log("PASS marketplace returns only the eligible public task view");

    const walletBeforeClaim = await prisma.wallet.findUniqueOrThrow({
      where: { id: wallet.id }
    });
    const concurrent = await Promise.all([
      marketplace.claimTask(claimantActor, activeTask.id),
      marketplace.claimTask(claimantActor, activeTask.id)
    ]);
    const concurrentClaimIds = new Set(concurrent.map((item) => item.claim.id));
    assert(concurrentClaimIds.size === 1, "concurrent claim requests returned different claims");
    assert(
      concurrent.filter((item) => item.created).length === 1,
      "concurrent claim requests did not produce exactly one creation"
    );
    const createdClaim = concurrent[0].claim;
    claimIds.push(createdClaim.id);
    const duplicate = await marketplace.claimTask(claimantActor, activeTask.id);
    assert(!duplicate.created, "duplicate claim request was not idempotent");
    assert(
      duplicate.claim.id === createdClaim.id &&
        duplicate.claim.publicCode === createdClaim.publicCode &&
        duplicate.claim.promotionUrl === createdClaim.promotionUrl,
      "duplicate claim did not return the stable code and promotion URL"
    );
    const persistedClaims = await prisma.affiliateClaim.findMany({
      where: { taskId: activeTask.id, userId: claimant.id, deletedAt: null }
    });
    assert(persistedClaims.length === 1, "database contains duplicate active claims");
    assert(
      persistedClaims[0].tokenHash.length === 64 &&
        !createdClaim.promotionUrl.includes(persistedClaims[0].tokenHash),
      "claim token hash was not stored separately from the signed URL"
    );
    console.log("PASS concurrent and repeated claims return one stable credential set");

    const publicToken = createdClaim.promotionUrl.split("/r/")[1];
    assert(publicToken, "promotion URL did not contain a public token");
    const resolved = await marketplace.resolveLink(publicToken);
    assert(
      resolved.claimId === createdClaim.id && resolved.task.id === activeTask.id,
      "signed link did not resolve to the claimed public task"
    );
    let tamperRejected = false;
    try {
      await marketplace.resolveLink(`${publicToken}x`);
    } catch (error) {
      tamperRejected =
        error instanceof AppError && error.message === "error.affiliate.link_invalid";
    }
    assert(tamperRejected, "tampered signed link was accepted");
    let crossUserHidden = false;
    try {
      await marketplace.getMyClaim(otherActor, createdClaim.id);
    } catch (error) {
      crossUserHidden =
        error instanceof AppError && error.message === "error.affiliate.claim_not_found";
    }
    assert(crossUserHidden, "another user could read the claimant's private claim");
    console.log("PASS signed-link validation and current-user claim isolation");

    const walletAfterClaim = await prisma.wallet.findUniqueOrThrow({
      where: { id: wallet.id }
    });
    assert(
      walletAfterClaim.availableBalance === walletBeforeClaim.availableBalance &&
        walletAfterClaim.frozenBalance === walletBeforeClaim.frozenBalance,
      "wallet changed while claiming"
    );
    const claimAudits = await prisma.auditLog.findMany({
      where: {
        action: "affiliate.claim.created",
        targetType: "affiliate_claim",
        targetId: createdClaim.id,
        actorId: claimant.id,
        deletedAt: null
      }
    });
    assert(claimAudits.length === 1, "claim creation audit evidence is missing or duplicated");
    const auditJson = JSON.stringify(claimAudits[0].metadata);
    assert(
      auditJson.includes(createdClaim.publicCode) &&
        !auditJson.includes(persistedClaims[0].publicTokenId) &&
        !auditJson.includes(persistedClaims[0].tokenHash),
      "claim audit leaked a token or omitted the public code"
    );
    console.log("PASS claiming preserves the frozen wallet and writes token-free audit evidence");

    console.log(
      JSON.stringify(
        {
          database: databaseName,
          marker,
          marketplace: { filtered: true, currentUserIsolated: true },
          claim: { concurrentIdempotency: true, stableCredentials: true },
          signedLink: { resolved: true, tamperRejected: true },
          finance: { walletUnchanged: true, audited: true },
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$transaction(async (transaction) => {
      if (claimIds.length > 0) {
        await transaction.auditLog.deleteMany({
          where: { targetType: "affiliate_claim", targetId: { in: claimIds } }
        });
      }
      if (taskIds.length > 0) {
        await transaction.affiliateClaim.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateBudgetReservation.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTaskService.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTaskShop.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTask.deleteMany({ where: { id: { in: taskIds } } });
      }
      if (walletId) {
        await transaction.wallet.deleteMany({ where: { id: walletId } });
      }
      if (serviceId) {
        await transaction.service.deleteMany({ where: { id: serviceId } });
      }
      if (shopId) {
        await transaction.shop.deleteMany({ where: { id: shopId } });
      }
      if (categoryId) {
        await transaction.category.deleteMany({ where: { id: categoryId } });
      }
      if (userIds.length > 0) {
        await transaction.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
        await deleteFormalTestUserFoundations(transaction, userIds);
      }
      if (roleIds.length > 0) {
        await transaction.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
        await transaction.role.deleteMany({ where: { id: { in: roleIds } } });
      }
      if (permissionIds.length > 0) {
        await transaction.permission.deleteMany({ where: { id: { in: permissionIds } } });
      }
      if (userIds.length > 0) {
        await transaction.user.deleteMany({ where: { id: { in: userIds } } });
      }
    });
    const cleanupRows = await Promise.all([
      prisma.user.count({ where: { email: { startsWith: marker } } }),
      prisma.role.count({ where: { code: { startsWith: marker } } }),
      prisma.permission.count({ where: { code: { startsWith: marker } } }),
      prisma.category.count({ where: { code: { startsWith: marker } } }),
      prisma.shop.count({ where: { name: { startsWith: marker } } }),
      prisma.service.count({ where: { name: { startsWith: marker } } }),
      prisma.affiliateTask.count({ where: { taskCode: { startsWith: marker } } })
    ]);
    assert(
      cleanupRows.every((count) => count === 0),
      "marker cleanup left rows behind"
    );
    console.log("PASS marker-owned acceptance rows were removed exactly");
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
