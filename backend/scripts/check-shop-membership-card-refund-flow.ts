import {
  BookingOrderStatus, Prisma, ServicePaymentStatus, ShopCustomerMembershipSource,
  ShopCustomerMembershipStatus, ShopMembershipCardPlanStatus,
  ShopMembershipCardPlanValidityMode, ShopMembershipCardPlanVersionStatus,
  ShopMembershipCardRedemptionStatus, ShopMembershipCardRewardStatus,
  ShopMembershipCardStatus, ShopMembershipCardType, ShopMembershipRewardRuleGroup,
  ShopMembershipRewardRuleKind, ShopMembershipRewardReversalMode, WalletOwnerType,
  type PrismaClient, type Prisma as PrismaNamespace
} from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuditLogRepository } from "../src/repositories/audit-log.repository";
import { LedgerRepository } from "../src/repositories/ledger.repository";
import { ShopMembershipCardRedemptionRepository } from "../src/repositories/shop-membership-card-redemption.repository";
import { ShopMembershipCardRefundRepository } from "../src/repositories/shop-membership-card-refund.repository";
import { AuditLogService } from "../src/services/audit-log.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { LedgerService } from "../src/services/ledger.service";
import { ShopMembershipCardRedemptionService } from "../src/services/shop-membership-card-redemption.service";
import { ShopMembershipCardRefundService } from "../src/services/shop-membership-card-refund.service";
import { AppError } from "../src/utils/app-error";

const REWARD = 1_000;
const FEE_BPS = 1_000;
const FEE = 100;
const GROSS = 1_100;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

function assertSafeLocalDatabase() {
  assert(!["production", "prod", "staging"].includes((process.env.NODE_ENV ?? "").toLowerCase()), "production-like NODE_ENV is forbidden");
  assert(!["production", "prod", "staging"].includes((process.env.DEPLOY_ENV ?? "").toLowerCase()), "production-like DEPLOY_ENV is forbidden");
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "only a local database host is allowed");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  assert(/(?:test|dev|local)/i.test(databaseName), "database name must contain test, dev, or local");
  assert(!/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName), "production-looking database name is forbidden");
  return databaseName;
}

type FlowClient = PrismaClient | PrismaNamespace.TransactionClient;
const captureState = async (client: FlowClient) => ({
  memberships: await client.shopCustomerMembership.count(),
  plans: await client.shopMembershipCardPlan.count(),
  versions: await client.shopMembershipCardPlanVersion.count(),
  rules: await client.shopMembershipRewardRule.count(),
  cards: await client.shopMembershipCard.count(),
  redemptions: await client.shopMembershipCardRedemption.count(),
  refunds: await client.shopMembershipCardRedemptionRefund.count(),
  orders: await client.bookingOrder.count(),
  histories: await client.orderStatusHistory.count(),
  wallets: await client.wallet.findMany({
    where: { deletedAt: null }, orderBy: { id: "asc" },
    select: { id: true, availableBalance: true, frozenBalance: true, updatedAt: true }
  }),
  transactions: await client.ledgerTransaction.count(),
  entries: await client.walletLedger.count(),
  reconciliations: await client.financeReconciliation.count(),
  notifications: await client.notification.count(),
  audits: await client.auditLog.count()
});

async function verifyPhysicalMigration(client: PrismaClient, requireRecord: boolean) {
  const columns = await client.$queryRawUnsafe<Array<{ columnName: string }>>(
    "SELECT COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    "shop_membership_card_redemption_refunds"
  );
  const constraints = await client.$queryRawUnsafe<Array<{ constraintName: string }>>(
    "SELECT CONSTRAINT_NAME AS constraintName FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    "shop_membership_card_redemption_refunds"
  );
  const indexes = await client.$queryRawUnsafe<Array<{ indexName: string; nonUnique: number }>>(
    "SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    "shop_membership_card_redemption_refunds"
  );
  const enumRows = await client.$queryRawUnsafe<Array<{ columnType: string }>>(
    "SELECT COLUMN_TYPE AS columnType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
    "ledger_transactions", "type"
  );
  const rewardStateRows = await client.$queryRawUnsafe<Array<{ checkClause: string }>>(
    "SELECT CHECK_CLAUSE AS checkClause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=?",
    "shop_membership_card_redemptions_reward_state"
  );
  const requiredColumns = [
    "public_id", "redemption_id", "card_id", "shop_id", "booking_order_id",
    "customer_user_id", "refunded_by_id", "reason", "order_payment_refunded_at",
    "redemption_status_before", "reward_status_before", "restored_principal_jpy",
    "restored_uses", "card_lock_version_before", "reversal_mode",
    "customer_reward_reversed_ndp", "platform_fee_reversed_ndp",
    "total_shop_credit_ndp", "shop_wallet_id", "customer_wallet_id",
    "platform_wallet_id", "customer_balance_before_ndp", "customer_balance_after_ndp",
    "reversal_ledger_transaction_id", "idempotency_key", "request_fingerprint"
  ];
  const requiredConstraints = [
    "shop_membership_card_refunds_restoration_nonnegative",
    "shop_membership_card_refunds_restoration_mode",
    "shop_membership_card_refunds_lock_version_positive",
    "shop_membership_card_refunds_reward_nonnegative",
    "shop_membership_card_refunds_reward_conservation",
    "shop_membership_card_refunds_reversal_state",
    "shop_membership_card_redemption_refunds_redemption_id_fkey",
    "shop_membership_card_redemption_refunds_card_id_fkey",
    "shop_membership_card_redemption_refunds_shop_id_fkey",
    "shop_membership_card_redemption_refunds_booking_order_id_fkey",
    "shop_membership_card_redemption_refunds_customer_user_id_fkey",
    "shop_membership_card_redemption_refunds_refunded_by_id_fkey",
    "shop_membership_card_redemption_refunds_shop_wallet_id_fkey",
    "shop_membership_card_redemption_refunds_customer_wallet_id_fkey",
    "shop_membership_card_redemption_refunds_platform_wallet_id_fkey",
    "shop_membership_card_refund_reversal_ledger_tx_fkey"
  ];
  const columnNames = new Set(columns.map((row) => row.columnName));
  const constraintNames = new Set(constraints.map((row) => row.constraintName));
  assert(requiredColumns.every((name) => columnNames.has(name)), "refund columns are incomplete");
  assert(requiredConstraints.every((name) => constraintNames.has(name)), "refund checks or foreign keys are incomplete");
  assert(indexes.some((row) => row.indexName === "shop_membership_card_redemption_refunds_redemption_id_key" && Number(row.nonUnique) === 0), "one-refund-per-redemption index is missing");
  assert(indexes.some((row) => row.indexName === "shop_membership_card_redemption_refunds_idempotency_key" && Number(row.nonUnique) === 0), "refund idempotency index is missing");
  const ledgerTypeEnum = enumRows[0]?.columnType ?? "";
  for (const type of [
    "shop_membership_reward_reversal",
    "service_consumption_settlement",
    "product_consumption_settlement",
    "platform_membership_purchase",
    "booking_consumption_refund",
    "service_consumption_refund",
    "product_consumption_refund"
  ]) {
    assert(ledgerTypeEnum.includes(type), "ledger enum is missing integrated type: " + type);
  }
  const rewardStateClause = (rewardStateRows[0]?.checkClause ?? "").replace(/\s+/g, " ").toLowerCase();
  assert(
    /reward_status.*reversed.*ledger_transaction_id.*is null.*reward_settled_at.*is null/.test(rewardStateClause),
    "pending reward cancellation is missing from the redemption reward-state constraint"
  );
  const permission = await client.permission.findFirst({
    where: { code: "shop.member.card.refund", deletedAt: null },
    select: { rolePermissions: {
      where: { deletedAt: null, role: { deletedAt: null } },
      select: { role: { select: { code: true } } }
    } }
  });
  assert(permission, "refund permission is missing");
  const roles = permission.rolePermissions.map((entry) => entry.role.code).sort();
  assert(roles.includes("admin") && roles.includes("merchant_owner"), "admin/owner grants are incomplete");
  assert(!roles.includes("merchant_staff"), "merchant staff received forbidden refund permission");
  const migrationRows = await client.$queryRawUnsafe<Array<{ migrationName: string; finishedAt: Date | null }>>(
    "SELECT migration_name AS migrationName, finished_at AS finishedAt FROM _prisma_migrations WHERE migration_name IN (?, ?, ?)",
    "20260901200000_shop_membership_card_refund",
    "20260901201000_shop_membership_card_refund_reward_state",
    "20260901211000_membership_refund_ndp_experience_ledger_types"
  );
  const migrationRecorded = [
    "20260901200000_shop_membership_card_refund",
    "20260901201000_shop_membership_card_refund_reward_state",
    "20260901211000_membership_refund_ndp_experience_ledger_types"
  ].every((name) => migrationRows.some((row) => row.migrationName === name && row.finishedAt !== null));
  if (requireRecord) assert(migrationRecorded, "refund migration is not recorded as applied");
  return {
    columns: requiredColumns.length,
    constraints: requiredConstraints.length,
    rewardStateSupportsPendingCancellation: true,
    roles,
    migrationRecorded
  };
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

async function setWallet(client: PrismaNamespace.TransactionClient, ownerType: WalletOwnerType, ownerId: number, balance: number) {
  const existing = await client.wallet.findUnique({
    where: { ownerType_ownerId_currency: { ownerType, ownerId, currency: "NDP" } },
    select: { id: true }
  });
  if (existing) {
    return client.wallet.update({ where: { id: existing.id }, data: { availableBalance: balance, frozenBalance: 0, deletedAt: null } });
  }
  return client.wallet.create({ data: { ownerType, ownerId, currency: "NDP", availableBalance: balance, frozenBalance: 0 } });
}

class RollbackVerified extends Error {}
let closeDatabase: (() => Promise<void>) | undefined;

async function main() {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), "environment file was not found: " + envFile);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const loaded = await import("../src/prisma/client");
  const { prisma, disconnectPrisma } = (loaded.default ?? loaded) as typeof import("../src/prisma/client");
  closeDatabase = disconnectPrisma;
  const physicalOnly = process.argv.includes("--physical-only");
  const migration = await verifyPhysicalMigration(prisma, !physicalOnly);
  if (physicalOnly) {
    console.log(JSON.stringify({ databaseName, migration, physicalOnly: true }, null, 2));
    return;
  }
  const before = await captureState(prisma);
  const marker = "membership-refund-" + Date.now() + "-" + process.pid;
  const fixedNow = new Date();
  let report: Record<string, unknown> | null = null;
  try {
    await prisma.$transaction(async (transaction) => {
      const customer = await transaction.customerProfile.findFirst({
        where: { deletedAt: null, user: { is: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } } } },
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
          isActive: true, deletedAt: null,
          identities: { some: { isActive: true, deletedAt: null } },
          ...(customer ? { id: { not: customer.user.id } } : {})
        },
        orderBy: { id: "asc" },
        select: { id: true, email: true }
      });
      assert(customer && slot && actor, "active customer, actor, and shop schedule slot are required");
      const membership = await transaction.shopCustomerMembership.create({
        data: {
          shopId: slot.shopId, customerProfileId: customer.id,
          status: ShopCustomerMembershipStatus.ACTIVE,
          source: ShopCustomerMembershipSource.MERCHANT_MANUAL,
          activeKey: marker, startedAt: fixedNow, createdById: actor.id, updatedById: actor.id
        }
      });

      const createCard = async (suffix: string, type: ShopMembershipCardType, reward: boolean) => {
        const plan = await transaction.shopMembershipCardPlan.create({
          data: { shopId: slot.shopId, status: ShopMembershipCardPlanStatus.ACTIVE, createdById: actor.id, updatedById: actor.id }
        });
        const version = await transaction.shopMembershipCardPlanVersion.create({
          data: {
            planId: plan.id, version: 1, status: ShopMembershipCardPlanVersionStatus.PUBLISHED,
            name: "退款回滚校验" + suffix, description: marker, cardType: type,
            validityMode: ShopMembershipCardPlanValidityMode.NEVER, rewardCaps: {},
            platformFeeRateBps: FEE_BPS, publishedById: actor.id, publishedAt: fixedNow,
            rules: { create: {
              kind: ShopMembershipRewardRuleKind.FIXED_PER_COMPLETION,
              ruleGroup: ShopMembershipRewardRuleGroup.BASE,
              config: {
                kind: "fixed_per_completion", rewardNdp: reward ? REWARD : 0,
                scope: { servicePublicIds: [], categoryCodes: [], excludedServicePublicIds: [], excludedCategoryCodes: [], activeFrom: null, activeTo: null }
              },
              sortOrder: 0
            } }
          }
        });
        await transaction.shopMembershipCardPlan.update({ where: { id: plan.id }, data: { currentVersionId: version.id } });
        return transaction.shopMembershipCard.create({
          data: {
            membershipId: membership.id, planId: plan.id, planVersionId: version.id,
            issuedById: actor.id, cardNo: ("NMC-RF-" + Date.now().toString(36) + "-" + suffix).toUpperCase(),
            name: "退款回滚校验" + suffix, type, status: ShopMembershipCardStatus.ACTIVE,
            initialPrincipalJpy: type === ShopMembershipCardType.STORED_VALUE ? 20_000 : null,
            principalBalanceJpy: type === ShopMembershipCardType.STORED_VALUE ? 20_000 : null,
            bonusBalanceJpy: type === ShopMembershipCardType.STORED_VALUE ? 500 : null,
            initialUses: type === ShopMembershipCardType.COUNT ? 5 : null,
            remainingUses: type === ShopMembershipCardType.COUNT ? 5 : null,
            totalUses: type === ShopMembershipCardType.COUNT ? 5 : null,
            platformFeeRateBpsSnapshot: FEE_BPS, issuedAt: fixedNow
          }
        });
      };
      const createOrder = (suffix: string, amountJpy: number) => transaction.bookingOrder.create({
        data: {
          orderNo: ("NDF-" + Date.now().toString(36) + "-" + suffix).toUpperCase(),
          customerUserId: customer.user.id, shopId: slot.shopId, scheduleSlotId: slot.id,
          status: BookingOrderStatus.COMPLETED, fulfillmentMode: "store",
          priceAmount: new Prisma.Decimal(amountJpy), currency: "JPY",
          serviceNameSnapshot: "退款校验服务 " + suffix, startsAt: slot.startsAt, endsAt: slot.endsAt,
          paymentStatus: ServicePaymentStatus.CONFIRMED, paymentAmountJpy: amountJpy,
          paymentConfirmedAt: fixedNow,
          statusHistory: { create: {
            fromStatus: BookingOrderStatus.IN_PROGRESS, toStatus: BookingOrderStatus.COMPLETED,
            actorUserId: actor.id, reason: marker, createdAt: fixedNow
          } }
        }
      });

      const storedCard = await createCard("STORED", ShopMembershipCardType.STORED_VALUE, true);
      const countCard = await createCard("COUNT", ShopMembershipCardType.COUNT, true);
      const benefitCard = await createCard("BENEFIT", ShopMembershipCardType.BENEFIT, false);
      const storedOrder = await createOrder("STORED", 10_000);
      const countOrder = await createOrder("COUNT", 8_000);
      const benefitOrder = await createOrder("BENEFIT", 6_000);
      const shopWallet = await setWallet(transaction, WalletOwnerType.SHOP, slot.shopId, GROSS);
      const customerWallet = await setWallet(transaction, WalletOwnerType.USER, customer.user.id, 0);
      const platformWallet = await setWallet(transaction, WalletOwnerType.PLATFORM, 1, 0);
      const txClient = transactionBoundClient(transaction);
      const redemptionRepository = new ShopMembershipCardRedemptionRepository(txClient);
      const refundRepository = new ShopMembershipCardRefundRepository(txClient);
      const ledger = new LedgerService(new LedgerRepository(transaction));
      const audit = new AuditLogService(new AuditLogRepository(txClient));
      const redemptionService = new ShopMembershipCardRedemptionService(redemptionRepository, ledger, audit);
      const refundService = new ShopMembershipCardRefundService(refundRepository, ledger, audit);
      const merchantActor: AuthenticatedAccessContext = {
        userId: actor.id, email: actor.email, accessTokenJti: marker,
        accessTokenExpiresAt: Math.floor(Date.now() / 1_000) + 900,
        currentIdentityType: "merchant_staff", currentIdentityScopeType: "shop",
        currentIdentityScopeId: slot.shopId, roles: ["merchant_owner"],
        permissions: ["shop.member.card.redeem", "shop.member.card.refund"]
      };
      const context = { ip: "127.0.0.1", userAgent: marker };
      const redeem = (cardPublicId: string, orderNo: string, suffix: string) =>
        redemptionService.create(merchantActor, context, cardPublicId, {
          orderNo, idempotencyKey: marker + "-redeem-" + suffix
        });
      const markOrderRefunded = (id: number, suffix: string) => transaction.bookingOrder.update({
        where: { id },
        data: {
          paymentStatus: ServicePaymentStatus.REFUNDED, paymentRefundedById: actor.id,
          paymentRefundedAt: fixedNow, paymentRefundReference: marker + "-payment-" + suffix,
          paymentRefundReason: "formal refund checker"
        }
      });
      const refund = (publicId: string, suffix: string) =>
        refundService.create(merchantActor, context, publicId, {
          reason: "正式订单退款 " + suffix, idempotencyKey: marker + "-refund-" + suffix
        });

      const storedRedemption = await redeem(storedCard.publicId, storedOrder.orderNo, "stored");
      assert(storedRedemption.rewardStatus === "paid", "stored-value reward did not settle");
      await transaction.wallet.update({ where: { id: customerWallet.id }, data: { availableBalance: 500 } });
      await transaction.wallet.update({ where: { id: platformWallet.id }, data: { availableBalance: 20 } });
      await markOrderRefunded(storedOrder.id, "stored");
      const storedRefund = await refund(storedRedemption.publicId, "stored");
      assert(storedRefund.reversalMode === "ledger_reversed", "paid reward was not reversed");
      assert(storedRefund.restoredPrincipalJpy === 10_000 && storedRefund.card.principalBalanceJpy === 20_000, "stored principal was not restored");
      assert(storedRefund.card.bonusBalanceJpy === 500, "bonus balance changed");
      assert(storedRefund.customerBalanceBeforeNdp === 500 && storedRefund.customerBalanceAfterNdp === -500, "negative customer balance evidence is wrong");
      const replay = await refund(storedRedemption.publicId, "stored");
      assert(replay.replayed && replay.publicId === storedRefund.publicId, "refund replay failed");

      await transaction.wallet.update({ where: { id: shopWallet.id }, data: { availableBalance: 0 } });
      const countRedemption = await redeem(countCard.publicId, countOrder.orderNo, "count");
      assert(countRedemption.rewardStatus === "pending_funds", "count reward was expected to be pending");
      let notRefundedCode: number | null = null;
      try { await refund(countRedemption.publicId, "count-before-order"); }
      catch (error) { if (error instanceof AppError) notRefundedCode = error.code; else throw error; }
      assert(notRefundedCode === ERROR_CODES.SHOP_MEMBERSHIP_CARD_REFUND_ORDER_NOT_REFUNDED, "order-refund evidence was not enforced");
      await markOrderRefunded(countOrder.id, "count");
      const countRefund = await refund(countRedemption.publicId, "count");
      assert(countRefund.reversalMode === "cancelled_pending", "pending reward was not cancelled");
      assert(countRefund.restoredUses === 1 && countRefund.card.remainingUses === 5, "count use was not restored");
      assert(countRefund.totalShopCreditNdp === 0 && !countRefund.reversalLedgerTransactionNo, "pending cancellation moved wallets");

      const benefitRedemption = await redeem(benefitCard.publicId, benefitOrder.orderNo, "benefit");
      assert(benefitRedemption.rewardStatus === "none", "benefit reward should be none");
      await markOrderRefunded(benefitOrder.id, "benefit");
      await transaction.shopMembershipCard.update({
        where: { id: benefitCard.id }, data: { status: ShopMembershipCardStatus.FROZEN, frozenAt: fixedNow }
      });
      const benefitRefund = await refund(benefitRedemption.publicId, "benefit");
      assert(benefitRefund.reversalMode === "none", "benefit refund created a reversal");
      assert(benefitRefund.restoredPrincipalJpy === 0 && benefitRefund.restoredUses === 0, "benefit refund changed numeric value");
      assert(benefitRefund.card.status === "frozen", "refund reactivated a frozen card");

      const paidPersisted = await transaction.shopMembershipCardRedemptionRefund.findUniqueOrThrow({
        where: { publicId: storedRefund.publicId },
        include: { redemption: true, reversalLedgerTransaction: { include: { entries: true, reconciliation: true } } }
      });
      assert(paidPersisted.redemption.status === ShopMembershipCardRedemptionStatus.REFUNDED, "redemption status is not refunded");
      assert(paidPersisted.redemption.rewardStatus === ShopMembershipCardRewardStatus.REVERSED, "reward status is not reversed");
      assert(paidPersisted.reversalMode === ShopMembershipRewardReversalMode.LEDGER_REVERSED, "refund reversal mode is wrong");
      assert(paidPersisted.reversalLedgerTransaction?.entries.length === 3, "paid refund needs three ledger entries");
      assert(paidPersisted.reversalLedgerTransaction!.entries.reduce((sum, entry) => sum + entry.availableDelta, 0) === 0, "refund ledger is not balanced");
      assert(paidPersisted.reversalLedgerTransaction?.reconciliation?.expectedAmount === GROSS, "refund reconciliation is missing");
      const wallets = await transaction.wallet.findMany({
        where: { id: { in: [shopWallet.id, customerWallet.id, platformWallet.id] } },
        select: { id: true, availableBalance: true }
      });
      assert(wallets.find((wallet) => wallet.id === customerWallet.id)?.availableBalance === -500, "customer negative balance did not persist");
      assert(wallets.find((wallet) => wallet.id === platformWallet.id)?.availableBalance === -80, "platform negative balance did not persist");
      const history = await redemptionService.listMerchant(merchantActor, { page: 1, pageSize: 20 });
      assert(history.list.filter((item) => item.refund).length === 3, "refund history summaries are incomplete");
      const auditCount = await transaction.auditLog.count({
        where: { action: { in: ["merchant.shop_membership_card.redemption.refund", "ledger.shop_membership_reward.reversal"] }, createdAt: { gte: new Date(fixedNow.getTime() - 1_000) } }
      });
      const notificationCount = await transaction.notification.count({
        where: { recipientUserId: customer.user.id, title: "shop_membership.card_refund.applied.title", createdAt: { gte: new Date(fixedNow.getTime() - 1_000) } }
      });
      assert(auditCount >= 4, "refund audit trail is incomplete");
      assert(notificationCount === 3, "refund notifications are incomplete");
      report = {
        databaseName, migration,
        storedValue: {
          principalRestoredJpy: storedRefund.restoredPrincipalJpy,
          bonusUnchangedJpy: storedRefund.card.bonusBalanceJpy,
          reversal: { customerNdp: REWARD, platformFeeNdp: FEE, shopCreditNdp: GROSS },
          customerBalance: [storedRefund.customerBalanceBeforeNdp, storedRefund.customerBalanceAfterNdp]
        },
        countCard: { usesRestored: countRefund.restoredUses, pendingReward: "cancelled" },
        benefitCard: { numericMutation: false, frozenStatusPreserved: true },
        ledgerEntries: 3, ledgerBalanced: true, idempotentReplay: true,
        orderRefundEvidenceRequired: true, auditAndNotification: true, transactionRolledBack: true
      };
      throw new RollbackVerified();
    }, { timeout: 30_000 });
  } catch (error) {
    if (!(error instanceof RollbackVerified)) throw error;
  }
  const after = await captureState(prisma);
  assert(JSON.stringify(after) === JSON.stringify(before), "refund checker changed protected database state after rollback");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await closeDatabase?.();
});
