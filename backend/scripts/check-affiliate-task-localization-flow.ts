import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { CONTENT_LOCALES } from "../src/constants/content-locales";
import { AppError } from "../src/utils/app-error";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOCAL_DATABASES = new Set(["needo_dev", "needo_test"]);
const TASK_BUDGET_NDP = 20_000;
const TASK_REWARD_NDP = 1_000;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

interface AffiliateTaskLocalizationSafetyInput {
  envFile: string;
  envFileExists: boolean;
  nodeEnv?: string;
  deployEnv?: string;
  databaseUrl?: string;
}

export const assertSafeAffiliateTaskLocalizationEnvironment = (
  input: AffiliateTaskLocalizationSafetyInput
): { databaseName: string; maskedDatabaseTarget: string } => {
  assert(input.envFile.trim(), "affiliate task localization check requires ENV_FILE");
  assert(input.envFileExists, `environment file was not found: ${input.envFile}`);
  const nodeEnv = input.nodeEnv?.trim().toLowerCase();
  const deployEnv = input.deployEnv?.trim().toLowerCase();
  assert(
    nodeEnv !== "production" && !["prod", "production", "staging"].includes(deployEnv ?? ""),
    "affiliate task localization check rejects production and staging environments"
  );
  assert(
    nodeEnv === "development" || nodeEnv === "test",
    "affiliate task localization check requires NODE_ENV=development or test"
  );
  assert(
    deployEnv === "local" || deployEnv === "test",
    "affiliate task localization check requires DEPLOY_ENV=local or test"
  );

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(input.databaseUrl ?? "");
  } catch {
    throw new Error("DATABASE_URL must be a valid URL");
  }
  assert(databaseUrl.protocol === "mysql:", "affiliate task localization check requires MySQL");
  assert(
    LOCAL_HOSTS.has(databaseUrl.hostname),
    "affiliate task localization check only accepts a local MySQL host"
  );
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""))
    .normalize("NFKC")
    .toLowerCase();
  assert(databaseName, "DATABASE_URL must include a database name");
  assert(
    !/(?:production|staging|prod)/u.test(databaseName.replace(/[^a-z0-9]/gu, "")),
    "affiliate task localization check rejects production-looking database names"
  );
  assert(
    LOCAL_DATABASES.has(databaseName),
    "affiliate task localization check requires database needo_dev or needo_test"
  );
  return {
    databaseName,
    maskedDatabaseTarget: `mysql://${databaseUrl.hostname}${
      databaseUrl.port ? `:${databaseUrl.port}` : ""
    }/${databaseName}`
  };
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE?.trim() ?? "";
  assert(envFile, "affiliate task localization check requires ENV_FILE");
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const safeTarget = assertSafeAffiliateTaskLocalizationEnvironment({
    envFile,
    envFileExists: existsSync(envFile),
    nodeEnv: process.env.NODE_ENV,
    deployEnv: process.env.DEPLOY_ENV,
    databaseUrl: process.env.DATABASE_URL
  });

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

  const marker = `affiliate-task-localization-${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const created = {
    userIds: [] as number[],
    categoryIds: [] as number[],
    shopIds: [] as number[],
    serviceIds: [] as number[],
    walletIds: [] as number[],
    affiliateTaskIds: [] as number[],
    affiliateTaskTranslationIds: [] as number[],
    ledgerTransactionIds: [] as number[],
    auditLogIds: [] as number[]
  };
  let operationError: unknown;
  const cleanupErrors: unknown[] = [];
  let evidence: Record<string, unknown> | null = null;

  try {
    const passwordHash = await hash("AffiliateLocalization.2026!", 12);
    const owner = await createFormalTestUser(prisma, {
      email: `${marker}-owner@needo.test`,
      passwordHash,
      username: `${marker} owner`
    });
    const operator = await createFormalTestUser(prisma, {
      email: `${marker}-operator@needo.test`,
      passwordHash,
      username: `${marker} operator`
    });
    created.userIds.push(owner.id, operator.id);

    const category = await prisma.category.create({
      data: { code: `${marker}-category`, name: `${marker} category` }
    });
    created.categoryIds.push(category.id);
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: owner.id,
        name: `${marker} shop`,
        city: "Tokyo",
        address: `${marker} address`,
        status: "published"
      }
    });
    created.shopIds.push(shop.id);
    const serviceRecord = await prisma.service.create({
      data: {
        categoryId: category.id,
        shopId: shop.id,
        name: `${marker} service`,
        city: "Tokyo",
        priceAmount: 8_800,
        durationMinutes: 60,
        status: "published"
      }
    });
    created.serviceIds.push(serviceRecord.id);
    const wallet = await prisma.wallet.create({
      data: {
        ownerType: "SHOP",
        ownerId: shop.id,
        availableBalance: TASK_BUDGET_NDP,
        frozenBalance: 0
      }
    });
    created.walletIds.push(wallet.id);

    const publisherActor = {
      userId: owner.id,
      email: owner.email,
      accessTokenJti: `${marker}-publisher-token`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      currentIdentityId: 1,
      currentIdentityType: "merchant" as const,
      currentIdentityScopeType: "shop" as const,
      currentIdentityScopeId: shop.id,
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
      currentIdentityType: "operator" as const,
      currentIdentityScopeType: "platform" as const,
      currentIdentityScopeId: null,
      roles: ["operator"],
      permissions: ["page:backoffice-affiliate", "button:backoffice-affiliate-review"]
    };
    const repository = new AffiliateTaskRepository(prisma);
    const ledgerService = new LedgerService(new LedgerRepository(prisma));
    assert(
      typeof ledgerService.freezeAffiliateTaskBudget === "function",
      "real freezeAffiliateTaskBudget service is unavailable"
    );
    const taskService = new AffiliateTaskService(repository, ledgerService);
    const taskStartsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const claimEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const taskEndsAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const draft = await taskService.createDraft(publisherActor, {
      publisherType: "shop",
      sourceLocale: "ja",
      name: `${marker} 日本語タスク`,
      description: `${marker} 日本語の説明`,
      coverMediaAssetId: null,
      rewardNdpPerCompletedOrder: TASK_REWARD_NDP,
      totalBudgetNdp: TASK_BUDGET_NDP,
      customerDiscountType: "none",
      fixedDiscountJpy: 0,
      discountRateBps: 0,
      discountCapJpy: 0,
      minimumOrderAmountJpy: 0,
      claimStartsAt: taskStartsAt,
      claimEndsAt,
      taskStartsAt,
      taskEndsAt,
      attributionWindowDays: 30,
      maxCompletedOrdersPerClaim: null,
      maxCompletedOrdersPerCustomer: 1,
      serviceScopeMode: "selected_services",
      selectedServiceIds: [serviceRecord.id]
    });
    created.affiliateTaskIds.push(draft.id);
    assert(
      Object.keys(draft.translations).length === CONTENT_LOCALES.length,
      "draft did not create five translations"
    );
    assert(
      CONTENT_LOCALES.every((locale) => draft.translations[locale]?.name === draft.name),
      "initial task content was not copied to every language"
    );
    console.log("PASS initial source content copied to five task languages");

    const independent = await taskService.updateDraftLocale(publisherActor, draft.id, "en", {
      lockVersion: draft.lockVersion,
      name: `${marker} English task`,
      description: `${marker} English description`,
      syncToAll: false
    });
    assert(
      independent.translations.en?.name === `${marker} English task`,
      "English edit was not saved"
    );
    assert(
      independent.translations.ja?.name === draft.translations.ja?.name,
      "independent edit changed Japanese"
    );
    console.log("PASS independent language edit persisted without cross-language overwrite");

    const synchronized = await taskService.updateDraftLocale(publisherActor, draft.id, "ja", {
      lockVersion: independent.lockVersion,
      name: `${marker} synchronized task`,
      description: `${marker} synchronized description`,
      syncToAll: true
    });
    assert(
      CONTENT_LOCALES.every(
        (locale) =>
          synchronized.translations[locale]?.name === `${marker} synchronized task` &&
          synchronized.translations[locale]?.sourceLocale === "ja"
      ),
      "synchronize-all did not replace every language"
    );
    console.log("PASS explicit synchronize-all replaced all five task languages");

    await prisma.affiliateTaskTranslation.updateMany({
      where: { taskId: draft.id, deletedAt: null },
      data: { deletedAt: new Date() }
    });
    let missingContentRejected = false;
    try {
      await taskService.submit(publisherActor, draft.id);
    } catch (error) {
      missingContentRejected =
        error instanceof AppError && error.message === "error.affiliate.task_content_required";
    }
    assert(missingContentRejected, "task without localized content did not reject submission");
    const walletBeforeContentSubmit = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    assert(
      walletBeforeContentSubmit?.availableBalance === TASK_BUDGET_NDP &&
        walletBeforeContentSubmit.frozenBalance === 0,
      "content-required rejection changed the wallet"
    );
    console.log("PASS task without content rejected before NDP freeze");

    const restored = await taskService.updateDraftLocale(publisherActor, draft.id, "ko", {
      lockVersion: synchronized.lockVersion,
      name: `${marker} 한국어 작업`,
      description: `${marker} 한국어 설명`,
      syncToAll: false
    });
    const submitted = await taskService.submit(publisherActor, restored.id);
    assert(submitted.status === "pending_review", "one-language task was not submitted");
    const walletAfterSubmit = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    assert(
      walletAfterSubmit?.availableBalance === 0 &&
        walletAfterSubmit.frozenBalance === TASK_BUDGET_NDP,
      "one-language submit did not freeze the exact task budget"
    );
    const translationRows = await prisma.affiliateTaskTranslation.findMany({
      where: { taskId: draft.id, deletedAt: null }
    });
    created.affiliateTaskTranslationIds.push(...translationRows.map((row) => row.id));
    assert(
      translationRows.length === 1,
      "one-language submit unexpectedly required other languages"
    );
    const freezeTransactions = await prisma.ledgerTransaction.findMany({
      where: { referenceType: "affiliate_task", referenceId: draft.id },
      select: { id: true }
    });
    created.ledgerTransactionIds.push(...freezeTransactions.map((row) => row.id));
    assert(
      freezeTransactions.length === 1,
      "one-language submit did not create exactly one freeze transaction"
    );
    const translationAudits = await prisma.auditLog.findMany({
      where: {
        targetType: "affiliate_task",
        targetId: draft.id,
        action: "affiliate.task.translation_updated"
      },
      select: { id: true }
    });
    assert(
      translationAudits.length === 3,
      "affiliate.task.translation_updated audit evidence is incomplete"
    );
    console.log("PASS one-language task submitted once with freeze and translation audit evidence");

    await taskService.reject(operatorActor, submitted.id, "local localization acceptance cleanup");
    evidence = {
      database: safeTarget.databaseName,
      target: safeTarget.maskedDatabaseTarget,
      marker,
      languages: CONTENT_LOCALES,
      independentEdit: true,
      synchronizedAll: true,
      missingContentRejectedBeforeFreeze: true,
      oneLanguageContentAccepted: true,
      oneLanguageSubmitFrozenOnce: true,
      audited: true,
      status: "ok"
    };
  } catch (error) {
    operationError = error;
  } finally {
    try {
      const ledgerRows =
        created.affiliateTaskIds.length > 0
          ? await prisma.ledgerTransaction.findMany({
              where: {
                referenceType: "affiliate_task",
                referenceId: { in: created.affiliateTaskIds }
              },
              select: { id: true }
            })
          : [];
      created.ledgerTransactionIds = [...new Set(ledgerRows.map((row) => row.id))];
      const auditRows =
        created.userIds.length > 0
          ? await prisma.auditLog.findMany({
              where: { actorId: { in: created.userIds } },
              select: { id: true }
            })
          : [];
      created.auditLogIds = auditRows.map((row) => row.id);
      await prisma.$transaction(async (transaction) => {
        if (created.auditLogIds.length > 0) {
          await transaction.auditLog.deleteMany({ where: { id: { in: created.auditLogIds } } });
        }
        if (created.affiliateTaskIds.length > 0) {
          await transaction.affiliateBudgetTransaction.deleteMany({
            where: { budgetReservation: { taskId: { in: created.affiliateTaskIds } } }
          });
          await transaction.affiliateBudgetReservation.deleteMany({
            where: { taskId: { in: created.affiliateTaskIds } }
          });
          await transaction.affiliateTaskService.deleteMany({
            where: { taskId: { in: created.affiliateTaskIds } }
          });
          await transaction.affiliateTaskShop.deleteMany({
            where: { taskId: { in: created.affiliateTaskIds } }
          });
          await transaction.affiliateTaskTranslation.deleteMany({
            where: { taskId: { in: created.affiliateTaskIds } }
          });
          await transaction.affiliateTask.deleteMany({
            where: { id: { in: created.affiliateTaskIds } }
          });
        }
        if (created.ledgerTransactionIds.length > 0) {
          await transaction.financeReconciliation.deleteMany({
            where: { transactionId: { in: created.ledgerTransactionIds } }
          });
          await transaction.walletLedger.deleteMany({
            where: { transactionId: { in: created.ledgerTransactionIds } }
          });
          await transaction.ledgerTransaction.deleteMany({
            where: { id: { in: created.ledgerTransactionIds } }
          });
        }
        if (created.walletIds.length > 0) {
          await transaction.wallet.deleteMany({ where: { id: { in: created.walletIds } } });
        }
        if (created.serviceIds.length > 0) {
          await transaction.service.deleteMany({ where: { id: { in: created.serviceIds } } });
        }
        if (created.shopIds.length > 0) {
          await transaction.shop.deleteMany({ where: { id: { in: created.shopIds } } });
        }
        if (created.categoryIds.length > 0) {
          await transaction.category.deleteMany({ where: { id: { in: created.categoryIds } } });
        }
        if (created.userIds.length > 0) {
          await deleteFormalTestUserFoundations(transaction, created.userIds);
          await transaction.user.deleteMany({ where: { id: { in: created.userIds } } });
        }
      });
      const residue = await Promise.all([
        prisma.user.count({ where: { id: { in: created.userIds } } }),
        prisma.category.count({ where: { id: { in: created.categoryIds } } }),
        prisma.shop.count({ where: { id: { in: created.shopIds } } }),
        prisma.service.count({ where: { id: { in: created.serviceIds } } }),
        prisma.wallet.count({ where: { id: { in: created.walletIds } } }),
        prisma.affiliateTask.count({ where: { id: { in: created.affiliateTaskIds } } }),
        prisma.affiliateTaskTranslation.count({
          where: { taskId: { in: created.affiliateTaskIds } }
        }),
        prisma.ledgerTransaction.count({ where: { id: { in: created.ledgerTransactionIds } } }),
        prisma.auditLog.count({ where: { id: { in: created.auditLogIds } } })
      ]);
      assert(
        residue.every((count) => count === 0),
        "cleanup residue verification failed"
      );
      console.log("PASS cleanup residue verification across exact marker-owned rows: 0");
    } catch (error) {
      cleanupErrors.push(error);
    }
    await disconnectPrisma().catch((error: unknown) => cleanupErrors.push(error));
  }

  if (operationError !== undefined && cleanupErrors.length > 0) {
    throw new AggregateError(
      [operationError, ...cleanupErrors],
      "affiliate task localization check operation and cleanup failed"
    );
  }
  if (operationError !== undefined) throw operationError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "affiliate task localization check cleanup failed");
  }
  assert(evidence, "affiliate task localization checker produced no evidence");
  console.log(JSON.stringify({ ...evidence, cleanup: "complete" }, null, 2));
};

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
