import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { AppError } from "../src/utils/app-error";

const SHOP_BUDGET_NDP = 2_500_000;
const MERCHANT_BUDGET_NDP = 3_000_000;
const TASK_BUDGET_NDP = 2_000_000;
const REWARD_NDP = 1_000;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertLocalDatabase = (): string => {
  assert(process.env.NODE_ENV !== "production", "affiliate task check rejects NODE_ENV=production");
  assert(process.env.DEPLOY_ENV !== "prod", "affiliate task check rejects DEPLOY_ENV=prod");
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "affiliate task check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production)([_-]|$)/i.test(databaseName),
    "affiliate task check rejects production database names"
  );
  return databaseName;
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertLocalDatabase();
  const [
    { AffiliateTaskRepository },
    { LedgerRepository },
    { AffiliateTaskService },
    { LedgerService },
    { createFormalTestUser, deleteFormalTestUserFoundations },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/affiliate-task.repository"),
    import("../src/repositories/ledger.repository"),
    import("../src/services/affiliate-task.service"),
    import("../src/services/ledger.service"),
    import("./support/formal-test-user"),
    import("../src/prisma/client")
  ]);
  const marker = `affiliate-flow-${Date.now()}-${process.pid}`;
  const userIds: number[] = [];
  const shopIds: number[] = [];
  const serviceIds: number[] = [];
  const taskIds: number[] = [];
  const walletIds: number[] = [];
  let categoryId: number | null = null;
  let merchantAccountId: number | null = null;

  try {
    const passwordHash = await hash("AffiliateFlow.2026!", 12);
    const createUser = (email: string, username: string) =>
      createFormalTestUser(prisma, { email, passwordHash, username });
    const owner = await createUser(`${marker}-owner@needo.test`, `${marker} owner`);
    const operator = await createUser(`${marker}-operator@needo.test`, `${marker} operator`);
    userIds.push(owner.id, operator.id);

    const category = await prisma.category.create({
      data: {
        code: `${marker}-category`,
        name: `${marker} category`
      }
    });
    categoryId = category.id;
    const shops = await Promise.all(
      ["Shibuya", "Ebisu", "Outsider"].map((area) =>
        prisma.shop.create({
          data: {
            ownerUserId: owner.id,
            name: `${marker} ${area}`,
            city: "Tokyo",
            address: `${area} integration address`,
            status: "published"
          }
        })
      )
    );
    shopIds.push(...shops.map((shop) => shop.id));
    const [shibuyaShop, ebisuShop, outsiderShop] = shops;
    const services = await Promise.all([
      prisma.service.create({
        data: {
          categoryId: category.id,
          shopId: shibuyaShop.id,
          name: `${marker} Aroma 60`,
          city: "Tokyo",
          priceAmount: 8_800,
          durationMinutes: 60,
          status: "published"
        }
      }),
      prisma.service.create({
        data: {
          categoryId: category.id,
          shopId: ebisuShop.id,
          name: `${marker} Head Spa 45`,
          city: "Tokyo",
          priceAmount: 7_700,
          durationMinutes: 45,
          status: "published"
        }
      }),
      prisma.service.create({
        data: {
          categoryId: category.id,
          shopId: outsiderShop.id,
          name: `${marker} Outsider Service`,
          city: "Tokyo",
          priceAmount: 6_600,
          durationMinutes: 45,
          status: "published"
        }
      })
    ]);
    serviceIds.push(...services.map((service) => service.id));

    const merchantAccount = await prisma.merchantAccount.create({
      data: {
        code: `${marker}-merchant`,
        name: `${marker} merchant account`,
        ownerUserId: owner.id,
        status: "active"
      }
    });
    merchantAccountId = merchantAccount.id;
    await Promise.all(
      [shibuyaShop.id, ebisuShop.id].map((shopId) =>
        prisma.merchantShopMembership.create({
          data: {
            merchantAccountId: merchantAccount.id,
            shopId,
            activeKey: `${marker}-membership-${shopId}`,
            startsAt: new Date(Date.now() - 60_000),
            createdById: owner.id
          }
        })
      )
    );

    const shopWallet = await prisma.wallet.create({
      data: {
        ownerType: "SHOP",
        ownerId: shibuyaShop.id,
        availableBalance: SHOP_BUDGET_NDP,
        frozenBalance: 0
      }
    });
    const merchantWallet = await prisma.wallet.create({
      data: {
        ownerType: "MERCHANT_ACCOUNT",
        ownerId: merchantAccount.id,
        availableBalance: MERCHANT_BUDGET_NDP,
        frozenBalance: 0
      }
    });
    walletIds.push(shopWallet.id, merchantWallet.id);

    const publisherActor = {
      userId: owner.id,
      email: owner.email,
      accessTokenJti: `${marker}-publisher-token`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      currentIdentityId: 1,
      currentIdentityType: "merchant",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: shibuyaShop.id,
      roles: ["merchant_owner"],
      permissions: [
        "page:merchant-affiliate-task",
        "button:merchant-affiliate-task-create",
        "button:merchant-affiliate-task-submit"
      ]
    };
    const operatorActor = {
      ...publisherActor,
      userId: operator.id,
      email: operator.email,
      accessTokenJti: `${marker}-operator-token`,
      currentIdentityType: "operator",
      currentIdentityScopeType: "platform",
      currentIdentityScopeId: null,
      roles: ["operator"],
      permissions: ["page:backoffice-affiliate", "button:backoffice-affiliate-review"]
    };
    const taskRepository = new AffiliateTaskRepository(prisma);
    const taskService = new AffiliateTaskService(
      taskRepository,
      new LedgerService(new LedgerRepository(prisma))
    );
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const twentyDays = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const commonTask = {
      description: `${marker} service-completion-only reward`,
      coverMediaAssetId: null,
      rewardNdpPerCompletedOrder: REWARD_NDP,
      totalBudgetNdp: TASK_BUDGET_NDP,
      customerDiscountType: "none" as const,
      fixedDiscountJpy: 0,
      discountRateBps: 0,
      discountCapJpy: 0,
      minimumOrderAmountJpy: 0,
      claimStartsAt: tomorrow,
      claimEndsAt: twentyDays,
      taskStartsAt: tomorrow,
      taskEndsAt: thirtyDays,
      attributionWindowDays: 30,
      maxCompletedOrdersPerClaim: null,
      maxCompletedOrdersPerCustomer: 1,
      serviceScopeMode: "selected_services" as const
    };

    const shopDraft = await taskService.createDraft(publisherActor, {
      publisherType: "shop",
      ...commonTask,
      name: `${marker} shop task`,
      selectedServiceIds: [services[0].id]
    });
    taskIds.push(shopDraft.id);
    const walletAfterDraft = await prisma.wallet.findUnique({ where: { id: shopWallet.id } });
    assert(shopDraft.status === "draft", "shop task did not remain draft");
    assert(shopDraft.budgetReservation === null, "draft created a budget reservation");
    assert(
      walletAfterDraft?.availableBalance === SHOP_BUDGET_NDP &&
        walletAfterDraft.frozenBalance === 0,
      "draft changed the shop wallet"
    );
    console.log("PASS draft does not freeze NDP");

    await prisma.shop.update({
      where: { id: shibuyaShop.id },
      data: { name: `${marker} Shibuya refreshed` }
    });
    await prisma.service.update({
      where: { id: services[0].id },
      data: { name: `${marker} Aroma refreshed`, priceAmount: 9_900 }
    });
    const submittedShopTask = await taskService.submit(publisherActor, shopDraft.id);
    const submittedShopRetry = await taskService.submit(publisherActor, shopDraft.id);
    assert(submittedShopRetry.id === submittedShopTask.id, "submit retry changed task identity");
    assert(submittedShopTask.status === "pending_review", "shop task was not submitted");
    assert(
      submittedShopTask.shops[0]?.shopNameSnapshot === `${marker} Shibuya refreshed`,
      "submit did not refresh the shop snapshot"
    );
    assert(
      submittedShopTask.services[0]?.servicePriceJpySnapshot === 9_900,
      "submit did not refresh the service price snapshot"
    );
    const shopWalletFrozen = await prisma.wallet.findUnique({ where: { id: shopWallet.id } });
    assert(
      shopWalletFrozen?.availableBalance === SHOP_BUDGET_NDP - TASK_BUDGET_NDP &&
        shopWalletFrozen.frozenBalance === TASK_BUDGET_NDP,
      "shop submit did not freeze the exact full budget"
    );
    const shopFinanceEvidence = await prisma.ledgerTransaction.findMany({
      where: { referenceType: "affiliate_task", referenceId: shopDraft.id },
      include: { entries: true, reconciliation: true }
    });
    assert(shopFinanceEvidence.length === 1, "submit retry duplicated the freeze transaction");
    assert(shopFinanceEvidence[0].entries.length === 1, "freeze ledger entry is missing");
    assert(shopFinanceEvidence[0].reconciliation, "freeze reconciliation is missing");
    assert(submittedShopTask.budgetReservation, "submitted task has no reservation");
    console.log("PASS submit freezes full budget with snapshots and finance evidence");

    const insufficientDraft = await taskService.createDraft(publisherActor, {
      publisherType: "shop",
      ...commonTask,
      totalBudgetNdp: 600_000,
      name: `${marker} insufficient task`,
      selectedServiceIds: [services[0].id]
    });
    taskIds.push(insufficientDraft.id);
    let insufficientRejected = false;
    try {
      await taskService.submit(publisherActor, insufficientDraft.id);
    } catch (error) {
      insufficientRejected =
        error instanceof AppError && error.message === "error.wallet.insufficient_available";
    }
    assert(insufficientRejected, "insufficient task submission was not rejected");
    const insufficientAfter = await taskRepository.findTaskById(insufficientDraft.id);
    const walletAfterInsufficient = await prisma.wallet.findUnique({ where: { id: shopWallet.id } });
    assert(insufficientAfter?.status === "draft", "insufficient task state did not roll back");
    assert(insufficientAfter?.budgetReservation === null, "insufficient task kept a reservation");
    assert(
      walletAfterInsufficient?.availableBalance === SHOP_BUDGET_NDP - TASK_BUDGET_NDP &&
        walletAfterInsufficient.frozenBalance === TASK_BUDGET_NDP,
      "insufficient task changed the wallet"
    );
    console.log("PASS insufficient budget has no partial writes");

    let outsiderRejected = false;
    try {
      await taskService.createDraft(publisherActor, {
        publisherType: "merchant_account",
        merchantAccountId: merchantAccount.id,
        shopIds: [shibuyaShop.id, outsiderShop.id],
        ...commonTask,
        name: `${marker} outsider task`,
        selectedServiceIds: [services[0].id, services[2].id]
      });
    } catch (error) {
      outsiderRejected =
        error instanceof AppError &&
        error.message === "error.affiliate.publisher_scope_invalid";
    }
    assert(outsiderRejected, "out-of-scope merchant shop was accepted");
    console.log("PASS merchant scope rejects non-member shops");

    const merchantDraft = await taskService.createDraft(publisherActor, {
      publisherType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      shopIds: [shibuyaShop.id, ebisuShop.id],
      ...commonTask,
      name: `${marker} merchant task`,
      selectedServiceIds: [services[0].id, services[1].id]
    });
    taskIds.push(merchantDraft.id);
    const submittedMerchantTask = await taskService.submit(publisherActor, merchantDraft.id);
    const merchantWalletFrozen = await prisma.wallet.findUnique({
      where: { id: merchantWallet.id }
    });
    assert(submittedMerchantTask.shops.length === 2, "merchant task lost a member shop");
    assert(submittedMerchantTask.services.length === 2, "merchant task lost a selected service");
    assert(
      merchantWalletFrozen?.availableBalance === MERCHANT_BUDGET_NDP - TASK_BUDGET_NDP &&
        merchantWalletFrozen.frozenBalance === TASK_BUDGET_NDP,
      "merchant task did not freeze the merchant-account wallet"
    );
    const approved = await taskService.approve(operatorActor, merchantDraft.id);
    assert(approved.status === "scheduled", "future merchant task was not scheduled");
    console.log("PASS merchant multi-shop task freezes account wallet and approves");

    const rejected = await taskService.reject(
      operatorActor,
      shopDraft.id,
      "Local acceptance rejection"
    );
    const rejectedRetry = await taskService.reject(
      operatorActor,
      shopDraft.id,
      "Local acceptance rejection"
    );
    assert(rejectedRetry.id === rejected.id, "reject retry changed task identity");
    assert(rejected.status === "rejected", "task did not become rejected");
    assert(
      rejected.budgetReservation?.status === "released" &&
        rejected.budgetReservation.releasedNdp === TASK_BUDGET_NDP,
      "rejected task reservation was not fully released"
    );
    const shopWalletReleased = await prisma.wallet.findUnique({ where: { id: shopWallet.id } });
    assert(
      shopWalletReleased?.availableBalance === SHOP_BUDGET_NDP &&
        shopWalletReleased.frozenBalance === 0,
      "rejection did not fully unfreeze the shop wallet"
    );
    const rejectedFinanceEvidence = await prisma.ledgerTransaction.findMany({
      where: { referenceType: "affiliate_task", referenceId: shopDraft.id },
      include: { entries: true, reconciliation: true }
    });
    assert(rejectedFinanceEvidence.length === 2, "reject retry duplicated finance effects");
    assert(
      rejectedFinanceEvidence.every(
        (transaction) => transaction.entries.length === 1 && transaction.reconciliation
      ),
      "reject finance evidence is incomplete"
    );
    console.log("PASS rejection fully unfreezes once with finance evidence");

    const taskAudits = await prisma.auditLog.count({
      where: { targetType: "affiliate_task", targetId: { in: taskIds } }
    });
    assert(taskAudits >= 7, "affiliate task audit trail is incomplete");
    console.log(
      JSON.stringify(
        {
          database: databaseName,
          marker,
          tasks: {
            draftWithoutFreeze: true,
            insufficientRolledBack: true,
            merchantMultiShopApproved: true,
            rejectionReleasedBudget: true
          },
          finance: {
            submitIdempotent: true,
            rejectIdempotent: true,
            reconciled: true,
            audited: true
          },
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$transaction(async (transaction) => {
      const ledgerTransactions =
        taskIds.length > 0
          ? await transaction.ledgerTransaction.findMany({
              where: { referenceType: "affiliate_task", referenceId: { in: taskIds } },
              select: { id: true }
            })
          : [];
      const ledgerTransactionIds = ledgerTransactions.map((row) => row.id);
      if (taskIds.length > 0) {
        await transaction.auditLog.deleteMany({
          where: { targetType: "affiliate_task", targetId: { in: taskIds } }
        });
        await transaction.affiliateBudgetTransaction.deleteMany({
          where: { budgetReservation: { taskId: { in: taskIds } } }
        });
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
      if (ledgerTransactionIds.length > 0) {
        await transaction.auditLog.deleteMany({
          where: { targetType: "ledger_transaction", targetId: { in: ledgerTransactionIds } }
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
      }
      if (walletIds.length > 0) {
        await transaction.wallet.deleteMany({ where: { id: { in: walletIds } } });
      }
      if (merchantAccountId) {
        await transaction.merchantShopMembership.deleteMany({
          where: { merchantAccountId }
        });
        await transaction.merchantAccount.deleteMany({ where: { id: merchantAccountId } });
      }
      if (serviceIds.length > 0) {
        await transaction.service.deleteMany({ where: { id: { in: serviceIds } } });
      }
      if (shopIds.length > 0) {
        await transaction.shop.deleteMany({ where: { id: { in: shopIds } } });
      }
      if (categoryId) {
        await transaction.category.deleteMany({ where: { id: categoryId } });
      }
      if (userIds.length > 0) {
        await transaction.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
        await deleteFormalTestUserFoundations(transaction, userIds);
        await transaction.user.deleteMany({ where: { id: { in: userIds } } });
      }
    });
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
