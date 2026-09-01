import {
  ShopCustomerMembershipSource,
  ShopCustomerMembershipStatus,
  ShopMembershipCardAdjustmentStatus,
  ShopMembershipCardStatus,
  ShopMembershipCardType,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuditLogRepository } from "../src/repositories/audit-log.repository";
import { ShopMembershipCardTopUpRepository } from "../src/repositories/shop-membership-card-topup.repository";
import { AuditLogService } from "../src/services/audit-log.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { ShopMembershipCardTopUpService } from "../src/services/shop-membership-card-topup.service";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

function assertSafeLocalDatabase(): string {
  assert(!["production", "prod", "staging"].includes((process.env.NODE_ENV ?? "").toLowerCase()), "membership card top-up check rejects production-like NODE_ENV");
  assert(!["production", "prod", "staging"].includes((process.env.DEPLOY_ENV ?? "").toLowerCase()), "membership card top-up check rejects production-like DEPLOY_ENV");
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "membership card top-up check only accepts a local database host");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(/(?:test|dev|local)/i.test(databaseName), "membership card top-up check requires a test, dev, or local database name");
  assert(!/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName), "membership card top-up check rejects production-looking database names");
  return databaseName;
}

type FlowClient = PrismaClient | Prisma.TransactionClient;

const captureFinancialState = async (client: FlowClient) => ({
  wallets: await client.wallet.findMany({
    where: { deletedAt: null },
    orderBy: { id: "asc" },
    select: { id: true, availableBalance: true, frozenBalance: true, updatedAt: true }
  }),
  ledgerTransactions: await client.ledgerTransaction.count(),
  ledgerEntries: await client.walletLedger.count()
});

const captureProtectedState = async (client: FlowClient) => ({
  memberships: await client.shopCustomerMembership.count(),
  cards: await client.shopMembershipCard.count(),
  adjustments: await client.shopMembershipCardAdjustmentRequest.count(),
  topUps: await client.shopMembershipCardTopUp.count(),
  notifications: await client.notification.count(),
  audits: await client.auditLog.count(),
  financial: await captureFinancialState(client)
});

const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

async function verifyPhysicalMigration(client: PrismaClient) {
  const columns = await client.$queryRaw<Array<{ columnName: string }>>`
    SELECT COLUMN_NAME AS columnName
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_membership_card_topups'
  `;
  const constraints = await client.$queryRaw<Array<{ constraintName: string }>>`
    SELECT CONSTRAINT_NAME AS constraintName
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_membership_card_topups'
  `;
  const indexes = await client.$queryRaw<Array<{ indexName: string; nonUnique: number }>>`
    SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_membership_card_topups'
  `;
  const requiredColumns = [
    "public_id", "card_id", "shop_id", "created_by_id", "amount_jpy", "payment_method",
    "payment_reference", "note", "principal_balance_before_jpy", "principal_balance_after_jpy",
    "card_lock_version_before", "idempotency_key", "request_fingerprint", "created_at", "updated_at", "deleted_at"
  ];
  const requiredConstraints = [
    "shop_membership_card_topups_amount_positive",
    "shop_membership_card_topups_snapshot_nonnegative",
    "shop_membership_card_topups_balance_conservation",
    "shop_membership_card_topups_lock_version_positive",
    "shop_membership_card_topups_card_id_fkey",
    "shop_membership_card_topups_shop_id_fkey",
    "shop_membership_card_topups_created_by_id_fkey"
  ];
  const columnNames = new Set(columns.map((row) => row.columnName));
  const constraintNames = new Set(constraints.map((row) => row.constraintName));
  assert(requiredColumns.every((name) => columnNames.has(name)), "physical top-up columns are incomplete");
  assert(requiredConstraints.every((name) => constraintNames.has(name)), "physical top-up checks or foreign keys are incomplete");
  assert(indexes.some((row) => row.indexName === "shop_membership_card_topups_idempotency_key" && Number(row.nonUnique) === 0), "physical top-up idempotency index is missing or not unique");

  const migration = await client.$queryRaw<Array<{ migrationName: string; finishedAt: Date | null }>>`
    SELECT migration_name AS migrationName, finished_at AS finishedAt
    FROM _prisma_migrations
    WHERE migration_name = '20260901040000_shop_membership_card_topup'
  `;
  assert(migration.length === 1 && migration[0].finishedAt !== null, "top-up migration is not recorded as applied");
  const permission = await client.permission.findFirst({
    where: { code: "shop.member.card.topup.create", deletedAt: null },
    select: {
      rolePermissions: {
        where: { deletedAt: null, role: { deletedAt: null } },
        select: { role: { select: { code: true } } }
      }
    }
  });
  assert(permission, "shop.member.card.topup.create permission is missing");
  const defaultRoles = permission.rolePermissions.map((entry) => entry.role.code).sort();
  assert(defaultRoles.includes("admin") && defaultRoles.includes("merchant_owner"), "admin and merchant_owner must receive top-up permission");
  assert(!defaultRoles.includes("merchant_staff"), "merchant_staff must remain read-only by default");
  return { columns: requiredColumns.length, constraints: requiredConstraints.length, uniqueIdempotencyIndex: true, defaultRoles };
}

function transactionBoundClient(transaction: Prisma.TransactionClient): PrismaClient {
  return new Proxy(transaction as object, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(transaction);
      }
      return Reflect.get(target, property, receiver);
    }
  }) as PrismaClient;
}

class RollbackVerifiedFlow extends Error {}

async function assertRejectedCode(action: () => Promise<unknown>, expectedCode: number, message: string) {
  let matched = false;
  try {
    await action();
  } catch (error) {
    matched = Boolean(error && typeof error === "object" && "code" in error && error.code === expectedCode);
  }
  assert(matched, message);
}

let closeDatabase: (() => Promise<void>) | undefined;

async function main(): Promise<void> {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const loaded = await import("../src/prisma/client");
  const { prisma, disconnectPrisma } = (loaded.default ?? loaded) as typeof import("../src/prisma/client");
  closeDatabase = disconnectPrisma;
  const migrationEvidence = await verifyPhysicalMigration(prisma);
  const before = await captureProtectedState(prisma);
  const marker = `membership-card-topup-check-${Date.now()}`;
  const fixedNow = new Date();
  let report: Record<string, unknown> | null = null;

  try {
    await prisma.$transaction(async (transaction) => {
      const shop = await transaction.shop.findFirst({
        where: { deletedAt: null },
        orderBy: { id: "asc" },
        select: { id: true }
      });
      const actor = await transaction.user.findFirst({
        where: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } },
        orderBy: { id: "asc" },
        select: { id: true, email: true }
      });
      assert(shop && actor, "top-up check requires one local shop and active actor with identity");
      const customer = await transaction.customerProfile.findFirst({
        where: {
          deletedAt: null,
          userId: { not: actor.id },
          user: { is: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } } }
        },
        orderBy: { id: "asc" },
        select: { id: true, user: { select: { id: true } } }
      });
      assert(customer, "top-up check requires a different active customer with identity");

      const membership = await transaction.shopCustomerMembership.create({
        data: {
          shopId: shop.id,
          customerProfileId: customer.id,
          status: ShopCustomerMembershipStatus.ACTIVE,
          source: ShopCustomerMembershipSource.MERCHANT_MANUAL,
          activeKey: marker,
          startedAt: fixedNow,
          createdById: actor.id,
          updatedById: actor.id
        },
        select: { id: true }
      });
      const card = await transaction.shopMembershipCard.create({
        data: {
          membershipId: membership.id,
          issuedById: actor.id,
          cardNo: `NMC-TOP-${Date.now()}`,
          name: "充值回滚校验储值卡",
          type: ShopMembershipCardType.STORED_VALUE,
          status: ShopMembershipCardStatus.ACTIVE,
          initialPrincipalJpy: 10_000,
          principalBalanceJpy: 10_000,
          bonusBalanceJpy: 500,
          lockVersion: 1,
          issuedAt: fixedNow,
          expiresAt: new Date(fixedNow.getTime() + 30 * 24 * 60 * 60 * 1_000)
        },
        select: { id: true, publicId: true }
      });

      const merchantActor: AuthenticatedAccessContext = {
        userId: actor.id,
        email: actor.email,
        accessTokenJti: marker,
        accessTokenExpiresAt: Math.floor(Date.now() / 1_000) + 900,
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: shop.id,
        roles: ["merchant_owner"],
        permissions: ["shop.member.card.topup.create"]
      };
      const requestContext = { ip: "127.0.0.1", userAgent: marker };
      const transactionClient = transactionBoundClient(transaction);
      const service = new ShopMembershipCardTopUpService(
        new ShopMembershipCardTopUpRepository(transactionClient),
        new AuditLogService(new AuditLogRepository(transactionClient))
      );
      const financialBefore = await captureFinancialState(transaction);
      const input = {
        amountJpy: 5_000,
        paymentMethod: "cash" as const,
        paymentReference: `${marker}-receipt`,
        note: "线下现金已核对",
        idempotencyKey: `${marker}-create`
      };
      const created = await service.create(merchantActor, requestContext, card.publicId, input);
      assert(created.amountJpy === 5_000 && created.principalBalanceBeforeJpy === 10_000 && created.principalBalanceAfterJpy === 15_000, "top-up did not preserve exact paid-principal snapshots");
      assert(created.card.principalBalanceJpy === 15_000 && created.card.bonusBalanceJpy === 500, "top-up changed the wrong card balance dimension");
      const persistedCard = await transaction.shopMembershipCard.findUnique({ where: { id: card.id }, select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true } });
      assert(persistedCard?.principalBalanceJpy === 15_000 && persistedCard.bonusBalanceJpy === 500 && persistedCard.lockVersion === 2, "card principal or lock version was not persisted atomically");

      const replay = await service.create(merchantActor, requestContext, card.publicId, input);
      const idempotentReplay = replay.replayed && replay.publicId === created.publicId;
      assert(idempotentReplay, "identical top-up retry did not replay the original mutation");
      await assertRejectedCode(
        () => service.create(merchantActor, requestContext, card.publicId, { ...input, amountJpy: 6_000 }),
        ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_IDEMPOTENCY_CONFLICT,
        "changed payload reused with the same idempotency key was not rejected"
      );
      const idempotencyConflictRejected = true;

      await transaction.shopMembershipCardAdjustmentRequest.create({
        data: {
          cardId: card.id,
          shopId: shop.id,
          requestedById: actor.id,
          status: ShopMembershipCardAdjustmentStatus.PENDING,
          pendingKey: `${card.id}:pending`,
          reason: "待客户确认",
          beforePrincipalBalanceJpy: 15_000,
          targetPrincipalBalanceJpy: 16_000,
          beforeRemainingUses: null,
          targetRemainingUses: null,
          cardLockVersionBefore: 2,
          requestIdempotencyKey: `${marker}-adjustment`,
          requestFingerprint: "a".repeat(64),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1_000)
        }
      });
      await assertRejectedCode(
        () => service.create(merchantActor, requestContext, card.publicId, { ...input, idempotencyKey: `${marker}-pending` }),
        ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_PENDING_CONFLICT,
        "live pending customer adjustment did not block top-up"
      );
      const pendingAdjustmentRejected = true;

      const crossShopActor = { ...merchantActor, currentIdentityScopeId: 2_000_000_000 };
      await assertRejectedCode(
        () => service.create(crossShopActor, requestContext, card.publicId, { ...input, idempotencyKey: `${marker}-cross-shop` }),
        ERROR_CODES.SHOP_MEMBERSHIP_CARD_TOPUP_NOT_FOUND,
        "cross-shop top-up did not remain hidden behind not-found"
      );
      const crossShopRejected = true;

      const merchantHistory = await service.listMerchant(merchantActor, { page: 1, pageSize: 20, cardPublicId: card.publicId });
      const customerActor: AuthenticatedAccessContext = {
        userId: customer.user.id,
        email: "customer-check@example.com",
        accessTokenJti: `${marker}-customer`,
        accessTokenExpiresAt: Math.floor(Date.now() / 1_000) + 900,
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: customer.id,
        roles: ["customer"],
        permissions: ["customer-profile:read"]
      };
      const customerHistory = await service.listCustomer(customerActor, { page: 1, pageSize: 20, cardPublicId: card.publicId });
      assert(merchantHistory.total === 1 && customerHistory.total === 1 && customerHistory.list[0]?.publicId === created.publicId, "shop or customer history scope did not return the exact top-up");

      const audits = await transaction.auditLog.findMany({
        where: { action: "merchant.shop_membership_card.topup.create", userAgent: marker },
        select: { targetType: true, targetId: true, metadata: true }
      });
      const notifications = await transaction.notification.findMany({
        where: { recipientUserId: customer.user.id, title: "shop_membership.card_topup.created.title" },
        select: { body: true, payload: true }
      });
      assert(audits.length === 1 && audits[0].targetType === "ShopMembershipCardTopUp" && audits[0].targetId !== null, "top-up audit evidence is not exact");
      assert(notifications.length === 1 && notifications[0].body === "shop_membership.card_topup.created.body", "top-up customer notification is missing or duplicated");
      const topUpCount = await transaction.shopMembershipCardTopUp.count({ where: { idempotencyKey: input.idempotencyKey } });
      assert(topUpCount === 1, "idempotent replay created another top-up record");
      const financialAfter = await captureFinancialState(transaction);
      const walletAndNdpLedgerUnchanged = sameValue(financialAfter, financialBefore);
      assert(walletAndNdpLedgerUnchanged, "membership card top-up must not change NDP wallets or ledgers");

      report = {
        databaseName,
        ready: true,
        migrationEvidence,
        exactPaidPrincipalJpy: created.amountJpy,
        principalBalanceBeforeJpy: created.principalBalanceBeforeJpy,
        principalBalanceAfterJpy: created.principalBalanceAfterJpy,
        bonusBalanceUnchangedJpy: created.card.bonusBalanceJpy,
        topUpCount,
        auditCount: audits.length,
        notificationCount: notifications.length,
        idempotentReplay,
        idempotencyConflictRejected,
        pendingAdjustmentRejected,
        crossShopRejected,
        merchantHistoryScoped: merchantHistory.total === 1,
        customerHistoryScoped: customerHistory.total === 1,
        walletAndNdpLedgerUnchanged
      };
      throw new RollbackVerifiedFlow();
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (!(error instanceof RollbackVerifiedFlow)) throw error;
  }

  const after = await captureProtectedState(prisma);
  const cleanupVerified = sameValue(after, before);
  assert(cleanupVerified, "rollback cleanup did not restore the protected database state");
  console.log(JSON.stringify({ ...report, cleanupVerified }, null, 2));
  await closeDatabase();
  closeDatabase = undefined;
}

main().catch(async (error) => {
  console.error(error);
  try {
    await closeDatabase?.();
  } finally {
    process.exitCode = 1;
  }
});
