import {
  BookingOrderStatus,
  Prisma,
  ShopCustomerMembershipSource,
  ShopCustomerMembershipStatus,
  ShopMembershipCardPlanStatus,
  ShopMembershipCardPlanValidityMode,
  ShopMembershipCardPlanVersionStatus,
  ShopMembershipCardRedemptionStatus,
  ShopMembershipCardRewardStatus,
  ShopMembershipCardStatus,
  ShopMembershipCardType,
  ShopMembershipRewardRuleGroup,
  ShopMembershipRewardRuleKind,
  WalletOwnerType,
  type PrismaClient,
  type Prisma as PrismaNamespace
} from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { AuditLogRepository } from "../src/repositories/audit-log.repository";
import { LedgerRepository } from "../src/repositories/ledger.repository";
import { ShopMembershipCardRedemptionRepository } from "../src/repositories/shop-membership-card-redemption.repository";
import { AuditLogService } from "../src/services/audit-log.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { LedgerService } from "../src/services/ledger.service";
import { ShopMembershipCardRedemptionService } from "../src/services/shop-membership-card-redemption.service";
import { ShopMembershipRewardDebtAllocator } from "../src/services/shop-membership-reward-debt-allocator.service";

const CUSTOMER_REWARD_NDP = 1_000;
const PLATFORM_FEE_RATE_BPS = 1_000;
const PLATFORM_FEE_NDP = 100;
const TOTAL_SHOP_DEBIT_NDP = 1_100;

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

function assertSafeLocalDatabase(): string {
  assert(!["production", "prod", "staging"].includes((process.env.NODE_ENV ?? "").toLowerCase()), "redemption check rejects production-like NODE_ENV");
  assert(!["production", "prod", "staging"].includes((process.env.DEPLOY_ENV ?? "").toLowerCase()), "redemption check rejects production-like DEPLOY_ENV");
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "redemption check only accepts a local database host");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  assert(/(?:test|dev|local)/i.test(databaseName), "redemption check requires a test, dev, or local database name");
  assert(!/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName), "redemption check rejects production-looking database names");
  return databaseName;
}

type FlowClient = PrismaClient | PrismaNamespace.TransactionClient;

const captureProtectedState = async (client: FlowClient) => ({
  memberships: await client.shopCustomerMembership.count(),
  plans: await client.shopMembershipCardPlan.count(),
  planVersions: await client.shopMembershipCardPlanVersion.count(),
  rules: await client.shopMembershipRewardRule.count(),
  cards: await client.shopMembershipCard.count(),
  redemptions: await client.shopMembershipCardRedemption.count(),
  bookingOrders: await client.bookingOrder.count(),
  statusHistory: await client.orderStatusHistory.count(),
  wallets: await client.wallet.findMany({
    where: { deletedAt: null },
    orderBy: { id: "asc" },
    select: { id: true, availableBalance: true, frozenBalance: true, updatedAt: true }
  }),
  ledgerTransactions: await client.ledgerTransaction.count(),
  ledgerEntries: await client.walletLedger.count(),
  reconciliations: await client.financeReconciliation.count(),
  notifications: await client.notification.count(),
  audits: await client.auditLog.count()
});

async function verifyPhysicalMigration(client: PrismaClient) {
  const columns = await client.$queryRaw<Array<{ columnName: string }>>`
    SELECT COLUMN_NAME AS columnName
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_membership_card_redemptions'
  `;
  const constraints = await client.$queryRaw<Array<{ constraintName: string }>>`
    SELECT CONSTRAINT_NAME AS constraintName
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_membership_card_redemptions'
  `;
  const indexes = await client.$queryRaw<Array<{ indexName: string; nonUnique: number }>>`
    SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_membership_card_redemptions'
  `;
  const enumRows = await client.$queryRaw<Array<{ columnType: string }>>`
    SELECT COLUMN_TYPE AS columnType
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_transactions' AND COLUMN_NAME = 'type'
  `;
  const requiredColumns = [
    "public_id", "card_id", "shop_id", "customer_user_id", "booking_order_id", "plan_version_id",
    "redeemed_by_id", "eligible_amount_jpy", "consumed_principal_jpy", "consumed_uses", "reward_facts",
    "reward_hits", "customer_reward_ndp", "platform_fee_rate_bps", "platform_fee_ndp", "total_shop_debit_ndp",
    "reward_status", "outstanding_reward_ndp", "ledger_transaction_id", "idempotency_key", "request_fingerprint"
  ];
  const requiredConstraints = [
    "shop_membership_card_redemptions_card_consumption_mode",
    "shop_membership_card_redemptions_principal_conservation",
    "shop_membership_card_redemptions_uses_conservation",
    "shop_membership_card_redemptions_reward_conservation",
    "shop_membership_card_redemptions_reward_state",
    "shop_membership_card_redemptions_lifecycle_state",
    "shop_membership_card_redemptions_booking_order_id_fkey",
    "shop_membership_card_redemptions_ledger_transaction_id_fkey"
  ];
  const columnNames = new Set(columns.map((row) => row.columnName));
  const constraintNames = new Set(constraints.map((row) => row.constraintName));
  assert(requiredColumns.every((name) => columnNames.has(name)), "physical redemption columns are incomplete");
  assert(requiredConstraints.every((name) => constraintNames.has(name)), "physical redemption checks or foreign keys are incomplete");
  assert(indexes.some((row) => row.indexName === "shop_membership_card_redemptions_booking_order_id_key" && Number(row.nonUnique) === 0), "one-redemption-per-order index is missing");
  assert(indexes.some((row) => row.indexName === "shop_membership_card_redemptions_idempotency_key" && Number(row.nonUnique) === 0), "redemption idempotency index is missing");
  assert(enumRows[0]?.columnType.includes("shop_membership_reward_settlement"), "membership reward ledger enum is missing");

  const migration = await client.$queryRaw<Array<{ migrationName: string; finishedAt: Date | null }>>`
    SELECT migration_name AS migrationName, finished_at AS finishedAt
    FROM _prisma_migrations
    WHERE migration_name = '20260901050000_shop_membership_card_redemption'
  `;
  assert(migration.length === 1 && migration[0].finishedAt !== null, "redemption migration is not recorded as applied");
  const permission = await client.permission.findFirst({
    where: { code: "shop.member.card.redeem", deletedAt: null },
    select: {
      rolePermissions: {
        where: { deletedAt: null, role: { deletedAt: null } },
        select: { role: { select: { code: true } } }
      }
    }
  });
  assert(permission, "shop.member.card.redeem permission is missing");
  const roles = permission.rolePermissions.map((entry) => entry.role.code).sort();
  assert(["admin", "merchant_owner", "merchant_staff"].every((role) => roles.includes(role)), "default redemption RBAC grants are incomplete");
  return { columns: requiredColumns.length, constraints: requiredConstraints.length, roles };
}

function transactionBoundClient(transaction: PrismaNamespace.TransactionClient): PrismaClient {
  return new Proxy(transaction as object, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async (callback: (client: PrismaNamespace.TransactionClient) => Promise<unknown>) => callback(transaction);
      }
      return Reflect.get(target, property, receiver);
    }
  }) as PrismaClient;
}

async function upsertWallet(
  client: PrismaNamespace.TransactionClient,
  ownerType: WalletOwnerType,
  ownerId: number,
  availableBalance: number
) {
  const existing = await client.wallet.findUnique({
    where: { ownerType_ownerId_currency: { ownerType, ownerId, currency: "NDP" } },
    select: { id: true }
  });
  if (existing) {
    return client.wallet.update({
      where: { id: existing.id },
      data: { availableBalance, frozenBalance: 0, deletedAt: null }
    });
  }
  return client.wallet.create({ data: { ownerType, ownerId, currency: "NDP", availableBalance, frozenBalance: 0 } });
}

class RollbackVerifiedFlow extends Error {}

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
  const migration = await verifyPhysicalMigration(prisma);
  const before = await captureProtectedState(prisma);
  const marker = `membership-redemption-${Date.now()}-${process.pid}`;
  const fixedNow = new Date();
  let report: Record<string, unknown> | null = null;

  try {
    await prisma.$transaction(async (transaction) => {
      const customer = await transaction.customerProfile.findFirst({
        where: {
          deletedAt: null,
          user: { is: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } } }
        },
        orderBy: { id: "asc" },
        select: { id: true, user: { select: { id: true, email: true } } }
      });
      const slot = await transaction.scheduleSlot.findFirst({
        where: { deletedAt: null, shop: { deletedAt: null } },
        orderBy: { id: "asc" },
        select: { id: true, shopId: true, startsAt: true, endsAt: true }
      });
      const actor = await transaction.user.findFirst({
        where: {
          isActive: true,
          deletedAt: null,
          identities: { some: { isActive: true, deletedAt: null } },
          ...(customer ? { id: { not: customer.user.id } } : {})
        },
        orderBy: { id: "asc" },
        select: { id: true, email: true }
      });
      assert(customer && slot && actor, "redemption check requires an active customer, actor, and shop schedule slot");

      const membership = await transaction.shopCustomerMembership.create({
        data: {
          shopId: slot.shopId,
          customerProfileId: customer.id,
          status: ShopCustomerMembershipStatus.ACTIVE,
          source: ShopCustomerMembershipSource.MERCHANT_MANUAL,
          activeKey: marker,
          startedAt: fixedNow,
          createdById: actor.id,
          updatedById: actor.id
        }
      });
      const plan = await transaction.shopMembershipCardPlan.create({
        data: {
          shopId: slot.shopId,
          status: ShopMembershipCardPlanStatus.ACTIVE,
          createdById: actor.id,
          updatedById: actor.id
        }
      });
      const version = await transaction.shopMembershipCardPlanVersion.create({
        data: {
          planId: plan.id,
          version: 1,
          status: ShopMembershipCardPlanVersionStatus.PUBLISHED,
          name: "核销回滚校验储值卡",
          description: marker,
          cardType: ShopMembershipCardType.STORED_VALUE,
          validityMode: ShopMembershipCardPlanValidityMode.NEVER,
          rewardCaps: {},
          platformFeeRateBps: PLATFORM_FEE_RATE_BPS,
          publishedById: actor.id,
          publishedAt: fixedNow,
          rules: {
            create: {
              kind: ShopMembershipRewardRuleKind.FIXED_PER_COMPLETION,
              ruleGroup: ShopMembershipRewardRuleGroup.BASE,
              config: {
                kind: "fixed_per_completion",
                rewardNdp: CUSTOMER_REWARD_NDP,
                scope: {
                  servicePublicIds: [],
                  categoryCodes: [],
                  excludedServicePublicIds: [],
                  excludedCategoryCodes: [],
                  activeFrom: null,
                  activeTo: null
                }
              },
              sortOrder: 0
            }
          }
        }
      });
      await transaction.shopMembershipCardPlan.update({
        where: { id: plan.id },
        data: { currentVersionId: version.id }
      });
      const card = await transaction.shopMembershipCard.create({
        data: {
          membershipId: membership.id,
          planId: plan.id,
          planVersionId: version.id,
          issuedById: actor.id,
          cardNo: `NMC-RD-${Date.now()}`,
          name: "核销回滚校验储值卡",
          type: ShopMembershipCardType.STORED_VALUE,
          status: ShopMembershipCardStatus.ACTIVE,
          initialPrincipalJpy: 20_000,
          principalBalanceJpy: 20_000,
          bonusBalanceJpy: 500,
          platformFeeRateBpsSnapshot: PLATFORM_FEE_RATE_BPS,
          issuedAt: fixedNow
        }
      });

      const createCompletedOrder = async (suffix: string, amountJpy: number) => transaction.bookingOrder.create({
        data: {
          orderNo: `NDR-${Date.now().toString(36)}-${suffix}`.toUpperCase(),
          customerUserId: customer.user.id,
          shopId: slot.shopId,
          scheduleSlotId: slot.id,
          status: BookingOrderStatus.COMPLETED,
          fulfillmentMode: "store",
          priceAmount: new Prisma.Decimal(amountJpy),
          currency: "JPY",
          serviceNameSnapshot: `核销校验服务 ${suffix}`,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          statusHistory: {
            create: {
              fromStatus: BookingOrderStatus.IN_PROGRESS,
              toStatus: BookingOrderStatus.COMPLETED,
              actorUserId: actor.id,
              reason: marker,
              createdAt: fixedNow
            }
          }
        }
      });
      const paidOrder = await createCompletedOrder("P", 10_000);
      const pendingOrder = await createCompletedOrder("D", 1_000);

      const shopWallet = await upsertWallet(transaction, WalletOwnerType.SHOP, slot.shopId, TOTAL_SHOP_DEBIT_NDP);
      const customerWallet = await upsertWallet(transaction, WalletOwnerType.USER, customer.user.id, 0);
      const platformWallet = await upsertWallet(transaction, WalletOwnerType.PLATFORM, 1, 0);
      const txClient = transactionBoundClient(transaction);
      const repository = new ShopMembershipCardRedemptionRepository(txClient);
      const ledger = new LedgerService(new LedgerRepository(transaction));
      const service = new ShopMembershipCardRedemptionService(
        repository,
        ledger,
        new AuditLogService(new AuditLogRepository(txClient))
      );
      const merchantActor: AuthenticatedAccessContext = {
        userId: actor.id,
        email: actor.email,
        accessTokenJti: marker,
        accessTokenExpiresAt: Math.floor(Date.now() / 1_000) + 900,
        currentIdentityType: "merchant_staff",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: slot.shopId,
        roles: ["merchant_staff"],
        permissions: ["shop.member.card.redeem"]
      };
      const requestContext = { ip: "127.0.0.1", userAgent: marker };

      const candidates = await service.listCandidates(merchantActor, card.publicId, { page: 1, pageSize: 20 });
      assert(candidates.total === 2 && candidates.list.length === 2, "completed eligible orders were not returned as card-scoped candidates");
      const paid = await service.create(merchantActor, requestContext, card.publicId, {
        orderNo: paidOrder.orderNo,
        idempotencyKey: `${marker}-paid`
      });
      assert(paid.rewardStatus === "paid", "funded redemption did not settle immediately");
      assert(paid.consumedPrincipalJpy === 10_000 && paid.principalBalanceAfterJpy === 10_000, "paid redemption principal snapshots are incorrect");
      assert(paid.card.bonusBalanceJpy === 500, "redemption must never consume bonus balance");
      assert(paid.customerRewardNdp === CUSTOMER_REWARD_NDP && paid.platformFeeNdp === PLATFORM_FEE_NDP && paid.totalShopDebitNdp === TOTAL_SHOP_DEBIT_NDP, "reward and platform fee amounts are incorrect");
      const replay = await service.create(merchantActor, requestContext, card.publicId, {
        orderNo: paidOrder.orderNo,
        idempotencyKey: `${marker}-paid`
      });
      assert(replay.replayed && replay.publicId === paid.publicId, "identical redemption retry did not replay exactly");

      const paidPersisted = await transaction.shopMembershipCardRedemption.findUniqueOrThrow({
        where: { publicId: paid.publicId },
        include: { ledgerTransaction: { include: { entries: true, reconciliation: true } } }
      });
      assert(paidPersisted.status === ShopMembershipCardRedemptionStatus.APPLIED && paidPersisted.rewardStatus === ShopMembershipCardRewardStatus.PAID, "paid redemption state was not persisted");
      assert(paidPersisted.ledgerTransaction?.entries.length === 3, "paid reward must create one debit and two credits");
      const ledgerSum = paidPersisted.ledgerTransaction!.entries.reduce((sum, entry) => sum + entry.availableDelta, 0);
      assert(ledgerSum === 0, "membership reward ledger entries are not balanced");
      assert(paidPersisted.ledgerTransaction?.reconciliation?.expectedAmount === TOTAL_SHOP_DEBIT_NDP, "membership reward reconciliation is missing");

      const pending = await service.create(merchantActor, requestContext, card.publicId, {
        orderNo: pendingOrder.orderNo,
        idempotencyKey: `${marker}-pending`
      });
      assert(pending.rewardStatus === "pending_funds" && pending.outstandingRewardNdp === TOTAL_SHOP_DEBIT_NDP, "insufficient shop wallet did not produce exact pending reward debt");
      assert(pending.consumedPrincipalJpy === 1_000 && pending.principalBalanceAfterJpy === 9_000, "card consumption must commit even when reward funds are pending");
      const walletBeforeAllocation = await transaction.wallet.findMany({
        where: { id: { in: [shopWallet.id, customerWallet.id, platformWallet.id] } },
        orderBy: { id: "asc" },
        select: { id: true, availableBalance: true }
      });
      assert(walletBeforeAllocation.find((wallet) => wallet.id === shopWallet.id)?.availableBalance === 0, "funded settlement did not debit the shop exactly");
      assert(walletBeforeAllocation.find((wallet) => wallet.id === customerWallet.id)?.availableBalance === CUSTOMER_REWARD_NDP, "pending attempt partially changed the customer wallet");
      assert(walletBeforeAllocation.find((wallet) => wallet.id === platformWallet.id)?.availableBalance === PLATFORM_FEE_NDP, "pending attempt partially changed the platform wallet");

      await transaction.wallet.update({
        where: { id: shopWallet.id },
        data: { availableBalance: { increment: TOTAL_SHOP_DEBIT_NDP } }
      });
      const allocator = new ShopMembershipRewardDebtAllocator(repository, ledger, () => fixedNow);
      await allocator.allocatePendingForShopWallet({
        walletId: shopWallet.id,
        shopId: slot.shopId,
        actorUserId: actor.id,
        transactionClient: transaction
      });
      const settledPending = await transaction.shopMembershipCardRedemption.findUniqueOrThrow({
        where: { publicId: pending.publicId },
        include: { ledgerTransaction: { include: { entries: true } } }
      });
      assert(settledPending.rewardStatus === ShopMembershipCardRewardStatus.PAID && settledPending.outstandingRewardNdp === 0, "wallet funding did not settle pending reward FIFO");
      assert(settledPending.ledgerTransaction?.entries.length === 3, "deferred reward settlement is not balanced evidence");

      const persistedCard = await transaction.shopMembershipCard.findUniqueOrThrow({
        where: { id: card.id },
        select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true }
      });
      assert(persistedCard.principalBalanceJpy === 9_000 && persistedCard.bonusBalanceJpy === 500 && persistedCard.lockVersion === 3, "card principal-only conservation failed across redemptions");
      const cardHistory = await service.listMerchant(merchantActor, { page: 1, pageSize: 20, cardPublicId: card.publicId });
      assert(cardHistory.total === 2 && cardHistory.list.every((item) => item.card.publicId === card.publicId), "merchant history is not shop/card scoped");
      const customerActor: AuthenticatedAccessContext = {
        userId: customer.user.id,
        email: customer.user.email,
        accessTokenJti: `${marker}-customer`,
        accessTokenExpiresAt: Math.floor(Date.now() / 1_000) + 900,
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: customer.id,
        roles: ["customer"],
        permissions: []
      };
      const customerHistory = await service.listCustomer(customerActor, { page: 1, pageSize: 20, cardPublicId: card.publicId });
      assert(customerHistory.total === 2 && customerHistory.list.every((item) => item.customer.needoId), "customer history is not customer/card scoped");
      const auditCount = await transaction.auditLog.count({
        where: {
          action: { in: [
            "merchant.shop_membership_card.redemption.create",
            "ledger.shop_membership_reward.settlement",
            "merchant.shop_membership_card.redemption.reward_settled"
          ] },
          createdAt: { gte: new Date(fixedNow.getTime() - 1_000) }
        }
      });
      const notificationCount = await transaction.notification.count({
        where: { recipientUserId: customer.user.id, createdAt: { gte: new Date(fixedNow.getTime() - 1_000) } }
      });
      assert(auditCount >= 5, "redemption and reward audit trail is incomplete");
      assert(notificationCount >= 3, "customer redemption and deferred settlement notifications are incomplete");

      report = {
        databaseName,
        migration,
        candidates: candidates.total,
        redemptions: 2,
        immediateReward: { customerNdp: CUSTOMER_REWARD_NDP, platformFeeNdp: PLATFORM_FEE_NDP, shopDebitNdp: TOTAL_SHOP_DEBIT_NDP },
        deferredReward: "pending_funds -> paid",
        card: { principalBeforeJpy: 20_000, principalAfterJpy: 9_000, bonusUnchangedJpy: 500 },
        ledgerEntriesPerSettlement: 3,
        idempotentReplay: true,
        merchantAndCustomerHistoryScoped: true,
        transactionRolledBack: true
      };
      throw new RollbackVerifiedFlow();
    }, { timeout: 30_000 });
  } catch (error) {
    if (!(error instanceof RollbackVerifiedFlow)) throw error;
  }

  const after = await captureProtectedState(prisma);
  assert(JSON.stringify(after) === JSON.stringify(before), "redemption flow changed protected database state after rollback");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase?.();
  });
