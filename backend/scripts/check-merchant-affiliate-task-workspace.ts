import type { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { AppError } from "../src/utils/app-error";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOCAL_DATABASES = new Set(["needo_dev", "needo_test"]);
const COMMISSION_BUDGET_NDP = 2_000_000;
const PLATFORM_FEE_BPS = 1_000;
const PLATFORM_FEE_RESERVE_NDP = 200_000;
const GROSS_FREEZE_NDP = 2_200_000;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

interface SafetyInput {
  envFile: string;
  envFileExists: boolean;
  nodeEnv?: string;
  deployEnv?: string;
  databaseUrl?: string;
}

export const assertSafeMerchantAffiliateTaskWorkspaceEnvironment = (
  input: SafetyInput
): { databaseName: string; maskedDatabaseTarget: string } => {
  assert(input.envFile.trim(), "merchant Affiliate task workspace check requires ENV_FILE");
  assert(input.envFileExists, `environment file was not found: ${input.envFile}`);
  const nodeEnv = input.nodeEnv?.trim().toLowerCase();
  const deployEnv = input.deployEnv?.trim().toLowerCase();
  assert(
    nodeEnv !== "production" && !["prod", "production", "staging"].includes(deployEnv ?? ""),
    "merchant Affiliate task workspace check rejects production and staging environments"
  );
  assert(
    nodeEnv === "development" || nodeEnv === "test",
    "merchant Affiliate task workspace check requires NODE_ENV=development or test"
  );
  assert(
    deployEnv === "local" || deployEnv === "test",
    "merchant Affiliate task workspace check requires DEPLOY_ENV=local or test"
  );

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(input.databaseUrl ?? "");
  } catch {
    throw new Error("DATABASE_URL must be a valid URL");
  }
  assert(databaseUrl.protocol === "mysql:", "merchant Affiliate task workspace check requires MySQL");
  assert(
    LOCAL_HOSTS.has(databaseUrl.hostname),
    "merchant Affiliate task workspace check only accepts a local MySQL host"
  );
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""))
    .normalize("NFKC")
    .toLowerCase();
  assert(databaseName, "DATABASE_URL must include a database name");
  assert(
    !/(?:production|staging|prod)/u.test(databaseName.replace(/[^a-z0-9]/gu, "")),
    "merchant Affiliate task workspace check rejects production-looking database names"
  );
  assert(
    LOCAL_DATABASES.has(databaseName),
    "merchant Affiliate task workspace check requires database needo_dev or needo_test"
  );
  return {
    databaseName,
    maskedDatabaseTarget: `mysql://${databaseUrl.hostname}${databaseUrl.port ? `:${databaseUrl.port}` : ""}/${databaseName}`
  };
};

const numberPart = (marker: string, label: string): string => {
  const hex = createHash("sha256").update(`${marker}:${label}`).digest("hex").slice(0, 16);
  return (BigInt(`0x${hex}`) % 10_000_000_000n).toString().padStart(10, "0");
};

const captureScopedState = async (
  prisma: PrismaClient,
  marker: string,
  taskIds: number[],
  walletIds: number[]
) => {
  const ledgerTransactions = taskIds.length
    ? await prisma.ledgerTransaction.findMany({
        where: { referenceType: "affiliate_task", referenceId: { in: taskIds } },
        select: { id: true },
        orderBy: { id: "asc" }
      })
    : [];
  const ledgerTransactionIds = ledgerTransactions.map((transaction) => transaction.id);
  const [wallets, reservations, budgetTransactions, walletEntries, reconciliations, audits, tasks, markerTaskCount] =
    await Promise.all([
      prisma.wallet.findMany({
        where: { id: { in: walletIds } },
        select: { id: true, availableBalance: true, frozenBalance: true },
        orderBy: { id: "asc" }
      }),
      prisma.affiliateBudgetReservation.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateBudgetTransaction.count({
        where: { budgetReservation: { taskId: { in: taskIds } } }
      }),
      prisma.walletLedger.count({ where: { transactionId: { in: ledgerTransactionIds } } }),
      prisma.financeReconciliation.count({ where: { transactionId: { in: ledgerTransactionIds } } }),
      prisma.auditLog.count({ where: { targetType: "affiliate_task", targetId: { in: taskIds } } }),
      prisma.affiliateTask.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, status: true, reservedBudgetNdp: true, platformFeeReserveNdp: true },
        orderBy: { id: "asc" }
      }),
      prisma.affiliateTask.count({ where: { taskCode: { startsWith: marker } } })
    ]);
  return {
    wallets,
    reservations,
    budgetTransactions,
    ledgerTransactions: ledgerTransactionIds,
    walletEntries,
    reconciliations,
    audits,
    tasks,
    markerTaskCount
  };
};

const assertSameState = (before: unknown, after: unknown, message: string): void => {
  assert(JSON.stringify(before) === JSON.stringify(after), message);
};

const expectAppError = async (operation: () => Promise<unknown>, message: string): Promise<void> => {
  let rejected = false;
  try {
    await operation();
  } catch (error) {
    rejected = error instanceof AppError;
  }
  assert(rejected, message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE?.trim() ?? "";
  assert(envFile, "merchant Affiliate task workspace check requires ENV_FILE");
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const safeTarget = assertSafeMerchantAffiliateTaskWorkspaceEnvironment({
    envFile,
    envFileExists: existsSync(envFile),
    nodeEnv: process.env.NODE_ENV,
    deployEnv: process.env.DEPLOY_ENV,
    databaseUrl: process.env.DATABASE_URL
  });

  const [
    { MerchantAffiliateTaskContextRepository },
    { AffiliateTaskRepository },
    { AffiliatePlatformFeeRepository },
    { LedgerRepository },
    { AuditLogRepository },
    { MerchantAffiliateTaskContextService },
    { AffiliateTaskService },
    { AffiliatePlatformFeeService },
    { LedgerService },
    { AuditLogService },
    { createFormalTestUser, deleteFormalTestUserFoundations },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/merchant-affiliate-task-context.repository"),
    import("../src/repositories/affiliate-task.repository"),
    import("../src/repositories/affiliate-platform-fee.repository"),
    import("../src/repositories/ledger.repository"),
    import("../src/repositories/audit-log.repository"),
    import("../src/services/merchant-affiliate-task-context.service"),
    import("../src/services/affiliate-task.service"),
    import("../src/services/affiliate-platform-fee.service"),
    import("../src/services/ledger.service"),
    import("../src/services/audit-log.service"),
    import("./support/formal-test-user"),
    import("../src/prisma/client")
  ]);

  const marker = `merchant-affiliate-task-${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const created = {
    userIds: [] as number[],
    categoryIds: [] as number[],
    shopIds: [] as number[],
    serviceIds: [] as number[],
    publicIdentifierIds: [] as number[],
    merchantAccountIds: [] as number[],
    membershipIds: [] as number[],
    walletIds: [] as number[],
    feeRuleIds: [] as number[],
    taskIds: [] as number[]
  };
  let operationError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    const passwordHash = await hash("MerchantAffiliateTask.2026!", 12);
    const publisher = await createFormalTestUser(prisma, {
      email: `${marker}-publisher@needo.test`,
      passwordHash,
      username: `${marker} publisher`
    });
    created.userIds.push(publisher.id);

    const category = await prisma.category.create({
      data: { code: `${marker}-category`, name: `${marker} category` }
    });
    created.categoryIds.push(category.id);

    const shopLabels = ["single", "multi", "mismatch", "outsider"] as const;
    const shops = [];
    const services = [];
    for (const label of shopLabels) {
      const shop = await prisma.shop.create({
        data: {
          ownerUserId: publisher.id,
          name: `${marker} ${label} shop`,
          city: "Tokyo",
          address: `${marker} ${label} address`,
          status: "published"
        }
      });
      created.shopIds.push(shop.id);
      const shopNumberPart = numberPart(marker, label);
      const identifier = await prisma.publicIdentifier.create({
        data: {
          publicId: `shop${shopNumberPart}`,
          numberPart: shopNumberPart,
          kind: "SHOP",
          shopId: shop.id,
          searchable: true,
          status: "ACTIVE"
        }
      });
      created.publicIdentifierIds.push(identifier.id);
      await prisma.shop.update({ where: { id: shop.id }, data: { shopNo: shopNumberPart } });
      const service = await prisma.service.create({
        data: {
          categoryId: category.id,
          shopId: shop.id,
          name: `${marker} ${label} service`,
          city: "Tokyo",
          currency: "JPY",
          priceAmount: 8_800,
          durationMinutes: 60,
          status: "published"
        }
      });
      created.serviceIds.push(service.id);
      shops.push({ ...shop, publicId: identifier.publicId });
      services.push(service);
    }
    const [singleShop, multiShop, mismatchShop, outsiderShop] = shops;
    const [singleService, multiService, mismatchService, outsiderService] = services;
    assert(singleShop && multiShop && mismatchShop && outsiderShop, "shop fixture creation failed");
    assert(singleService && multiService && mismatchService && outsiderService, "service fixture creation failed");

    const merchantAccount = await prisma.merchantAccount.create({
      data: {
        code: `${marker}-merchant`,
        name: `${marker} merchant group`,
        ownerUserId: publisher.id,
        status: "active"
      }
    });
    created.merchantAccountIds.push(merchantAccount.id);
    for (const shop of [singleShop, multiShop, mismatchShop]) {
      const membership = await prisma.merchantShopMembership.create({
        data: {
          merchantAccountId: merchantAccount.id,
          shopId: shop.id,
          activeKey: `${marker}-membership-${shop.id}`,
          startsAt: new Date(Date.now() - 60_000),
          createdById: publisher.id
        }
      });
      created.membershipIds.push(membership.id);
    }

    const shopWallet = await prisma.wallet.create({
      data: { ownerType: "SHOP", ownerId: singleShop.id, availableBalance: 5_000_000, frozenBalance: 0 }
    });
    const merchantWallet = await prisma.wallet.create({
      data: { ownerType: "MERCHANT_ACCOUNT", ownerId: merchantAccount.id, availableBalance: 10_000_000, frozenBalance: 0 }
    });
    created.walletIds.push(shopWallet.id, merchantWallet.id);

    const feeEffectiveFrom = new Date(Date.now() - 60 * 60 * 1_000);
    for (const [shop, feeBps] of [
      [singleShop, PLATFORM_FEE_BPS],
      [multiShop, PLATFORM_FEE_BPS],
      [mismatchShop, 1_200],
      [outsiderShop, PLATFORM_FEE_BPS]
    ] as const) {
      const rule = await prisma.affiliatePlatformFeeRule.create({
        data: {
          scopeType: "SHOP",
          scopeKey: `shop:${shop.id}`,
          shopId: shop.id,
          feeBps,
          version: 1,
          effectiveFrom: feeEffectiveFrom,
          activeKey: `shop:${shop.id}`,
          reason: `${marker} ${feeBps} bps`,
          createdById: publisher.id,
          updatedById: publisher.id
        }
      });
      created.feeRuleIds.push(rule.id);
    }

    const shopActor: AuthenticatedAccessContext = {
      userId: publisher.id,
      email: publisher.email,
      accessTokenJti: `${marker}-shop-token`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1_000) + 900,
      currentIdentityId: 1,
      currentIdentityType: "merchant",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: singleShop.id,
      roles: ["merchant_owner"],
      permissions: [
        "page:merchant-affiliate-task",
        "button:merchant-affiliate-task-create",
        "button:merchant-affiliate-task-submit"
      ]
    };
    const merchantActor: AuthenticatedAccessContext = {
      ...shopActor,
      accessTokenJti: `${marker}-merchant-token`,
      currentIdentityScopeType: "merchant_account",
      currentIdentityScopeId: merchantAccount.id
    };

    const auditService = new AuditLogService(new AuditLogRepository(prisma));
    const platformFeeService = new AffiliatePlatformFeeService(
      new AffiliatePlatformFeeRepository(prisma),
      auditService
    );
    const contextService = new MerchantAffiliateTaskContextService(
      new MerchantAffiliateTaskContextRepository(prisma),
      platformFeeService
    );
    const ledgerService = new LedgerService(new LedgerRepository(prisma));
    let taskSequence = 0;
    const taskService = new AffiliateTaskService(
      new AffiliateTaskRepository(prisma),
      ledgerService,
      {
        createTaskCode: () => `${marker}-task-${++taskSequence}`,
        platformFeeService
      }
    );

    const publisherPageOne = await contextService.listPublishers(shopActor, { page: 1, pageSize: 1 });
    const publisherPageTwo = await contextService.listPublishers(shopActor, { page: 2, pageSize: 1 });
    assert(
      publisherPageOne.total === 2 &&
        publisherPageOne.list[0]?.publisherType === "shop" &&
        publisherPageTwo.list[0]?.merchantAccountId === merchantAccount.id,
      "publisher list pagination failed"
    );
    console.log("PASS publisher list pagination");

    const merchantShops = await contextService.listShops(merchantActor, {
      publisherType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      page: 1,
      pageSize: 2
    });
    const merchantShopsPageTwo = await contextService.listShops(merchantActor, {
      publisherType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      page: 2,
      pageSize: 2
    });
    assert(
      merchantShops.total === 3 &&
        merchantShops.list.every((shop) => shop.publicId.startsWith("shop")) &&
        merchantShopsPageTwo.list.length === 1,
      "shop public identifier or pagination failed"
    );
    console.log("PASS shop public identifier");

    const taskDates = () => {
      const taskStartsAt = new Date(Date.now() + 60 * 60 * 1_000);
      return {
        taskStartsAt,
        claimStartsAt: taskStartsAt,
        claimEndsAt: new Date(taskStartsAt.getTime() + 10 * 24 * 60 * 60 * 1_000),
        taskEndsAt: new Date(taskStartsAt.getTime() + 20 * 24 * 60 * 60 * 1_000)
      };
    };
    const commonTaskInput = (name: string, budget: number, selectedServiceIds: number[]) => ({
      sourceLocale: "ja" as const,
      name: `${marker} ${name}`,
      description: `${marker} ${name} description`,
      coverMediaAssetId: null,
      rewardNdpPerCompletedOrder: 10_000,
      totalBudgetNdp: budget,
      customerDiscountType: "none" as const,
      fixedDiscountJpy: 0,
      discountRateBps: 0,
      discountCapJpy: 0,
      minimumOrderAmountJpy: 0,
      ...taskDates(),
      attributionWindowDays: 30,
      maxCompletedOrdersPerClaim: null,
      maxCompletedOrdersPerCustomer: 1,
      serviceScopeMode: "selected_services" as const,
      selectedServiceIds
    });

    const displayDraft = await taskService.createDraft(merchantActor, {
      publisherType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      shopIds: [singleShop.id, multiShop.id],
      ...commonTaskInput("display", COMMISSION_BUDGET_NDP, [singleService.id, multiService.id])
    });
    created.taskIds.push(displayDraft.id);
    const displayed = await contextService.presentTask(displayDraft);
    assert(
      displayed.publisherDisplayName === merchantAccount.name &&
        displayed.shops.map((shop) => shop.publicId).sort().join(",") ===
          [singleShop.publicId, multiShop.publicId].sort().join(","),
      "merchant task display projection failed"
    );
    console.log("PASS merchant task display projection");

    const previewBefore = await captureScopedState(prisma, marker, created.taskIds, created.walletIds);
    const preview = await contextService.previewFee(merchantActor, {
      publisherType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      shopIds: [singleShop.id, multiShop.id],
      totalBudgetNdp: COMMISSION_BUDGET_NDP
    });
    const previewAfter = await captureScopedState(prisma, marker, created.taskIds, created.walletIds);
    assert(
      preview.platformFeeBps === PLATFORM_FEE_BPS &&
        preview.platformFeeReserveNdp === PLATFORM_FEE_RESERVE_NDP &&
        preview.grossFreezeNdp === GROSS_FREEZE_NDP,
      "fee preview math was incorrect"
    );
    assertSameState(previewBefore, previewAfter, "fee preview mutated finance state");
    console.log("PASS fee preview has zero finance mutation");

    const singleDraft = await taskService.createDraft(shopActor, {
      publisherType: "shop",
      ...commonTaskInput("single", COMMISSION_BUDGET_NDP, [singleService.id])
    });
    created.taskIds.push(singleDraft.id);
    const singleSubmitted = await taskService.submit(shopActor, singleDraft.id);
    const shopWalletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: shopWallet.id } });
    assert(
      singleSubmitted.status === "pending_review" &&
        singleSubmitted.reservedBudgetNdp === GROSS_FREEZE_NDP &&
        shopWalletAfter.availableBalance === 5_000_000 - GROSS_FREEZE_NDP &&
        shopWalletAfter.frozenBalance === GROSS_FREEZE_NDP,
      "single-shop exact freeze failed"
    );
    console.log("PASS single-shop exact freeze");

    const walletBeforeDuplicate = { ...shopWalletAfter };
    await taskService.submit(shopActor, singleDraft.id);
    const shopWalletAfterDuplicate = await prisma.wallet.findUniqueOrThrow({ where: { id: shopWallet.id } });
    const singleFreezeCount = await prisma.ledgerTransaction.count({
      where: {
        type: "AFFILIATE_TASK_BUDGET_FREEZE",
        referenceType: "affiliate_task",
        referenceId: singleDraft.id
      }
    });
    assert(
      singleFreezeCount === 1 &&
        shopWalletAfterDuplicate.availableBalance === walletBeforeDuplicate.availableBalance &&
        shopWalletAfterDuplicate.frozenBalance === walletBeforeDuplicate.frozenBalance,
      "duplicate submit freezes once failed"
    );
    console.log("PASS duplicate submit freezes once");

    const multiDraft = await taskService.createDraft(merchantActor, {
      publisherType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      shopIds: [singleShop.id, multiShop.id],
      ...commonTaskInput("multi", COMMISSION_BUDGET_NDP, [singleService.id, multiService.id])
    });
    created.taskIds.push(multiDraft.id);
    const multiSubmitted = await taskService.submit(merchantActor, multiDraft.id);
    const merchantWalletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: merchantWallet.id } });
    assert(
      multiSubmitted.status === "pending_review" &&
        multiSubmitted.reservedBudgetNdp === GROSS_FREEZE_NDP &&
        merchantWalletAfter.availableBalance === 10_000_000 - GROSS_FREEZE_NDP &&
        merchantWalletAfter.frozenBalance === GROSS_FREEZE_NDP,
      "multi-shop exact freeze failed"
    );
    console.log("PASS multi-shop exact freeze");

    const mismatchDraft = await taskService.createDraft(merchantActor, {
      publisherType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      shopIds: [singleShop.id, mismatchShop.id],
      ...commonTaskInput("mismatch", COMMISSION_BUDGET_NDP, [singleService.id, mismatchService.id])
    });
    created.taskIds.push(mismatchDraft.id);
    const mismatchBefore = await captureScopedState(prisma, marker, created.taskIds, created.walletIds);
    await expectAppError(
      () => taskService.submit(merchantActor, mismatchDraft.id),
      "mixed-rate submission was not rejected"
    );
    const mismatchAfter = await captureScopedState(prisma, marker, created.taskIds, created.walletIds);
    assertSameState(mismatchBefore, mismatchAfter, "rate mismatch changed finance state");
    console.log("PASS rate mismatch has zero finance mutation");

    const insufficientDraft = await taskService.createDraft(merchantActor, {
      publisherType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      shopIds: [singleShop.id, multiShop.id],
      ...commonTaskInput("insufficient", 20_000_000, [singleService.id, multiService.id])
    });
    created.taskIds.push(insufficientDraft.id);
    const insufficientBefore = await captureScopedState(prisma, marker, created.taskIds, created.walletIds);
    await expectAppError(
      () => taskService.submit(merchantActor, insufficientDraft.id),
      "insufficient-balance submission was not rejected"
    );
    const insufficientAfter = await captureScopedState(prisma, marker, created.taskIds, created.walletIds);
    assertSameState(insufficientBefore, insufficientAfter, "insufficient balance changed finance state");
    console.log("PASS insufficient balance has zero finance mutation");

    const invalidScopeBefore = await captureScopedState(prisma, marker, created.taskIds, created.walletIds);
    await expectAppError(
      () => contextService.listServices(merchantActor, {
        publisherType: "merchant_account",
        merchantAccountId: merchantAccount.id,
        shopIds: [outsiderShop.id],
        page: 1,
        pageSize: 20
      }),
      "outsider shop was not rejected"
    );
    await expectAppError(
      () => taskService.createDraft(merchantActor, {
        publisherType: "merchant_account",
        merchantAccountId: merchantAccount.id,
        shopIds: [singleShop.id],
        ...commonTaskInput("invalid-service", COMMISSION_BUDGET_NDP, [outsiderService.id])
      }),
      "invalid service was not rejected"
    );
    const invalidScopeAfter = await captureScopedState(prisma, marker, created.taskIds, created.walletIds);
    assertSameState(invalidScopeBefore, invalidScopeAfter, "invalid scope changed finance state");
    console.log("PASS outsider shop and invalid service have zero finance mutation");

    const freshTaskService = new AffiliateTaskService(
      new AffiliateTaskRepository(prisma),
      new LedgerService(new LedgerRepository(prisma)),
      { platformFeeService }
    );
    const persisted = await freshTaskService.getPublisherTask(merchantActor, multiDraft.id);
    assert(
      persisted.status === "pending_review" &&
        Object.keys(persisted.translations).length === 5 &&
        persisted.shops.length === 2 &&
        persisted.platformFeeBps === PLATFORM_FEE_BPS,
      "fresh service did not reload persisted task state"
    );
    console.log(`PASS formal persistence through fresh services on ${safeTarget.maskedDatabaseTarget}`);
  } catch (error) {
    operationError = error;
  } finally {
    try {
      const taskIds = [...created.taskIds];
      const reservations = taskIds.length
        ? await prisma.affiliateBudgetReservation.findMany({
            where: { taskId: { in: taskIds } },
            select: { id: true }
          })
        : [];
      const reservationIds = reservations.map((reservation) => reservation.id);
      const ledgerTransactions = taskIds.length
        ? await prisma.ledgerTransaction.findMany({
            where: { referenceType: "affiliate_task", referenceId: { in: taskIds } },
            select: { id: true }
          })
        : [];
      const ledgerTransactionIds = ledgerTransactions.map((transaction) => transaction.id);
      await prisma.$transaction(async (transaction) => {
        await transaction.affiliateBudgetTransaction.deleteMany({
          where: { budgetReservationId: { in: reservationIds } }
        });
        await transaction.financeReconciliation.deleteMany({
          where: { transactionId: { in: ledgerTransactionIds } }
        });
        await transaction.walletLedger.deleteMany({
          where: { transactionId: { in: ledgerTransactionIds } }
        });
        await transaction.ledgerTransaction.deleteMany({
          where: { id: { in: ledgerTransactionIds } }
        });
        await transaction.affiliateBudgetReservation.deleteMany({
          where: { id: { in: reservationIds } }
        });
        await transaction.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: created.userIds } },
              { targetType: "affiliate_task", targetId: { in: taskIds } }
            ]
          }
        });
        await transaction.affiliateTaskService.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateTaskShop.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateTaskTranslation.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateTask.deleteMany({ where: { id: { in: taskIds } } });
        await transaction.affiliatePlatformFeeRule.deleteMany({ where: { id: { in: created.feeRuleIds } } });
        await transaction.merchantShopMembership.deleteMany({ where: { id: { in: created.membershipIds } } });
        await transaction.wallet.deleteMany({ where: { id: { in: created.walletIds } } });
        await transaction.service.deleteMany({ where: { id: { in: created.serviceIds } } });
        await transaction.publicIdentifier.deleteMany({ where: { id: { in: created.publicIdentifierIds } } });
        await transaction.merchantAccount.deleteMany({ where: { id: { in: created.merchantAccountIds } } });
        await transaction.shop.deleteMany({ where: { id: { in: created.shopIds } } });
        await transaction.category.deleteMany({ where: { id: { in: created.categoryIds } } });
        await deleteFormalTestUserFoundations(transaction, created.userIds);
        await transaction.user.deleteMany({ where: { id: { in: created.userIds } } });
      });

      const residue = await Promise.all([
        prisma.user.count({ where: { id: { in: created.userIds } } }),
        prisma.shop.count({ where: { id: { in: created.shopIds } } }),
        prisma.service.count({ where: { id: { in: created.serviceIds } } }),
        prisma.publicIdentifier.count({ where: { id: { in: created.publicIdentifierIds } } }),
        prisma.merchantAccount.count({ where: { id: { in: created.merchantAccountIds } } }),
        prisma.affiliatePlatformFeeRule.count({ where: { id: { in: created.feeRuleIds } } }),
        prisma.affiliateTask.count({ where: { id: { in: created.taskIds } } }),
        prisma.wallet.count({ where: { id: { in: created.walletIds } } }),
        prisma.ledgerTransaction.count({ where: { id: { in: ledgerTransactionIds } } })
      ]);
      assert(residue.every((count) => count === 0), "cleanup residue verification failed");
      console.log("PASS cleanup residue verification");
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    await disconnectPrisma().catch((disconnectError) => cleanupErrors.push(disconnectError));
  }

  if (operationError || cleanupErrors.length > 0) {
    throw new AggregateError(
      [operationError, ...cleanupErrors].filter((error): error is unknown => error !== undefined),
      "merchant Affiliate task workspace check failed"
    );
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
