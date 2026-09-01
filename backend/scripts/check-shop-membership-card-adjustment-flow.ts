import {
  ShopCustomerMembershipSource,
  ShopCustomerMembershipStatus,
  ShopMembershipCardStatus,
  ShopMembershipCardType,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuditLogRepository } from "../src/repositories/audit-log.repository";
import { ShopMembershipCardAdjustmentRepository } from "../src/repositories/shop-membership-card-adjustment.repository";
import { AuditLogService } from "../src/services/audit-log.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { ShopMembershipCardAdjustmentService } from "../src/services/shop-membership-card-adjustment.service";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

function assertSafeLocalDatabase(): string {
  assert(!["production", "prod", "staging"].includes((process.env.NODE_ENV ?? "").toLowerCase()), "membership card adjustment check rejects production-like NODE_ENV");
  assert(!["production", "prod", "staging"].includes((process.env.DEPLOY_ENV ?? "").toLowerCase()), "membership card adjustment check rejects production-like DEPLOY_ENV");
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "membership card adjustment check only accepts a local database host");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(/(?:test|dev|local)/i.test(databaseName), "membership card adjustment check requires a test, dev, or local database name");
  assert(!/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName), "membership card adjustment check rejects production-looking database names");
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
  notifications: await client.notification.count(),
  audits: await client.auditLog.count(),
  financial: await captureFinancialState(client)
});

const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

async function verifyPhysicalMigration(client: PrismaClient) {
  const columns = await client.$queryRaw<Array<{ columnName: string }>>`
    SELECT COLUMN_NAME AS columnName
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shop_membership_card_adjustment_requests'
  `;
  const constraints = await client.$queryRaw<Array<{ constraintName: string; constraintType: string }>>`
    SELECT CONSTRAINT_NAME AS constraintName, CONSTRAINT_TYPE AS constraintType
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shop_membership_card_adjustment_requests'
  `;
  const indexes = await client.$queryRaw<Array<{ indexName: string; nonUnique: number }>>`
    SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shop_membership_card_adjustment_requests'
  `;
  const cardColumns = await client.$queryRaw<Array<{ columnName: string }>>`
    SELECT COLUMN_NAME AS columnName
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shop_membership_cards'
  `;
  const requiredColumns = [
    "public_id", "card_id", "shop_id", "requested_by_id", "status", "pending_key",
    "before_principal_balance_jpy", "target_principal_balance_jpy", "before_remaining_uses",
    "target_remaining_uses", "card_lock_version_before", "request_idempotency_key",
    "request_fingerprint", "decision_idempotency_key", "decision_fingerprint", "expires_at",
    "decided_at", "cancelled_at", "invalidated_at", "deleted_at"
  ];
  const requiredConstraints = [
    "shop_membership_card_adjustments_values_nonnegative",
    "shop_membership_card_adjustments_value_pair",
    "shop_membership_card_adjustments_card_id_fkey",
    "shop_membership_card_adjustments_shop_id_fkey",
    "shop_membership_card_adjustments_requested_by_id_fkey",
    "shop_membership_card_adjustments_decided_by_id_fkey",
    "shop_membership_card_adjustments_cancelled_by_id_fkey"
  ];
  const requiredUniqueIndexes = [
    "shop_membership_card_adjustments_public_id_key",
    "shop_membership_card_adjustments_pending_key",
    "shop_membership_card_adjustments_request_idempotency_key",
    "shop_membership_card_adjustments_decision_idempotency_key"
  ];
  const columnNames = new Set(columns.map((row) => row.columnName));
  const constraintNames = new Set(constraints.map((row) => row.constraintName));
  assert(requiredColumns.every((name) => columnNames.has(name)), "physical adjustment columns are incomplete");
  assert(requiredConstraints.every((name) => constraintNames.has(name)), "physical adjustment checks or foreign keys are incomplete");
  assert(requiredUniqueIndexes.every((name) => indexes.some((row) => row.indexName === name && Number(row.nonUnique) === 0)), "physical adjustment unique indexes are incomplete");
  assert(cardColumns.some((row) => row.columnName === "lock_version"), "physical membership card lock_version column is missing");

  const migration = await client.$queryRaw<Array<{ migrationName: string; finishedAt: Date | null }>>`
    SELECT migration_name AS migrationName, finished_at AS finishedAt
    FROM _prisma_migrations
    WHERE migration_name = '20260831170000_shop_membership_card_adjustment_approval'
  `;
  assert(migration.length === 1 && migration[0].finishedAt !== null, "adjustment migration is not recorded as applied");
  const permission = await client.permission.findFirst({
    where: { code: "shop.member.card.adjust.request", deletedAt: null },
    select: {
      rolePermissions: {
        where: { deletedAt: null, role: { deletedAt: null } },
        select: { role: { select: { code: true } } }
      }
    }
  });
  assert(permission, "shop.member.card.adjust.request permission is missing");
  const defaultRoles = permission.rolePermissions.map((entry) => entry.role.code).sort();
  assert(defaultRoles.includes("admin") && defaultRoles.includes("merchant_owner"), "admin and merchant_owner must receive adjustment permission");
  assert(!defaultRoles.includes("merchant_staff"), "merchant_staff must not receive adjustment permission by default");
  return { columns: requiredColumns.length, constraints: requiredConstraints.length, uniqueIndexes: requiredUniqueIndexes.length, lockVersion: true, defaultRoles };
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

async function verifyCommittedConcurrencyAndRollback(
  client: PrismaClient,
  createClient: () => PrismaClient,
  marker: string
) {
  const before = await captureProtectedState(client);
  let membershipId: number | null = null;
  const requestPublicIds: string[] = [];
  const workerA = createClient();
  const workerB = createClient();
  const failureBase = createClient();

  try {
    const shop = await client.shop.findFirst({
      where: { deletedAt: null },
      orderBy: { id: "asc" },
      select: { id: true }
    });
    const actor = await client.user.findFirst({
      where: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } },
      orderBy: { id: "asc" },
      select: { id: true, email: true }
    });
    assert(shop && actor, "committed concurrency check requires a local shop and active actor");
    const customer = await client.customerProfile.findFirst({
      where: {
        deletedAt: null,
        userId: { not: actor.id },
        user: { is: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } } }
      },
      orderBy: { id: "asc" },
      select: { id: true, user: { select: { id: true, email: true } } }
    });
    assert(customer, "committed concurrency check requires a different active customer");

    const fixture = await client.$transaction(async (transaction) => {
      const membership = await transaction.shopCustomerMembership.create({
        data: {
          shopId: shop.id,
          customerProfileId: customer.id,
          status: ShopCustomerMembershipStatus.ACTIVE,
          source: ShopCustomerMembershipSource.MERCHANT_MANUAL,
          activeKey: marker,
          createdById: actor.id,
          updatedById: actor.id
        },
        select: { id: true }
      });
      const createCard = (suffix: string, principalBalanceJpy: number) => transaction.shopMembershipCard.create({
        data: {
          membershipId: membership.id,
          issuedById: actor.id,
          cardNo: `NMC-ADJ-${Date.now()}-${suffix}`,
          name: `并发回滚校验卡-${suffix}`,
          type: ShopMembershipCardType.STORED_VALUE,
          status: ShopMembershipCardStatus.ACTIVE,
          initialPrincipalJpy: principalBalanceJpy,
          lockVersion: 1,
          principalBalanceJpy,
          bonusBalanceJpy: 300,
          issuedAt: new Date()
        },
        select: { publicId: true }
      });
      const [raceCard, doubleApprovalCard, cancelRaceCard, expiryRaceCard, rollbackCard] = await Promise.all([
        createCard("race", 10_000),
        createCard("double", 11_000),
        createCard("cancel", 12_000),
        createCard("expiry", 13_000),
        createCard("rollback", 20_000)
      ]);
      return { membershipId: membership.id, raceCard, doubleApprovalCard, cancelRaceCard, expiryRaceCard, rollbackCard };
    });
    membershipId = fixture.membershipId;

    const merchantActor: AuthenticatedAccessContext = {
      userId: actor.id,
      email: actor.email,
      accessTokenJti: `${marker}-merchant`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: shop.id,
      roles: ["merchant_owner"],
      permissions: ["shop.member.card.adjust.request"]
    };
    const customerActor: AuthenticatedAccessContext = {
      userId: customer.user.id,
      email: customer.user.email,
      accessTokenJti: `${marker}-customer`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: customer.id,
      roles: ["customer"],
      permissions: ["customer-profile:read"]
    };
    const requestContext = { ip: "127.0.0.1", userAgent: marker };
    const serviceFor = (prismaClient: PrismaClient) => new ShopMembershipCardAdjustmentService(
      new ShopMembershipCardAdjustmentRepository(prismaClient),
      new AuditLogService(new AuditLogRepository(prismaClient))
    );
    const serviceA = serviceFor(workerA);
    const serviceB = serviceFor(workerB);
    const notificationCountFor = async (requestPublicId: string) => {
      const rows = await client.notification.findMany({
        where: { title: { startsWith: "shop_membership.card_adjustment." } },
        select: { payload: true }
      });
      return rows.filter((notification) => notification.payload
        && typeof notification.payload === "object"
        && !Array.isArray(notification.payload)
        && (notification.payload as Record<string, unknown>).requestPublicId === requestPublicId).length;
    };
    const terminalAuditCountFor = async (requestId: number) => client.auditLog.count({
      where: {
        targetType: "ShopMembershipCardAdjustmentRequest",
        targetId: requestId,
        action: {
          in: [
            "customer.shop_membership_card.adjustment.approve",
            "customer.shop_membership_card.adjustment.reject",
            "merchant.shop_membership_card.adjustment.cancel",
            "system.shop_membership_card.adjustment.expire"
          ]
        }
      }
    });
    const raceRequest = await serviceA.create(merchantActor, requestContext, fixture.raceCard.publicId, {
      targetPrincipalBalanceJpy: 15_000,
      targetRemainingUses: null,
      reason: "双连接并发决策校验",
      idempotencyKey: `${marker}-race-request`
    });
    requestPublicIds.push(raceRequest.publicId);
    const raceResults = await Promise.allSettled([
      serviceA.decide(customerActor, requestContext, raceRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-race-approve` }),
      serviceB.decide(customerActor, requestContext, raceRequest.publicId, { decision: "reject", idempotencyKey: `${marker}-race-reject` })
    ]);
    assert(raceResults.filter((result) => result.status === "fulfilled").length === 1, "concurrent opposing decisions did not produce exactly one winner");
    const raceState = await client.shopMembershipCardAdjustmentRequest.findUniqueOrThrow({
      where: { publicId: raceRequest.publicId },
      select: { id: true, status: true, decisionIdempotencyKey: true, card: { select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true } } }
    });
    assert(raceState.status === "APPROVED" || raceState.status === "REJECTED", "concurrent decision did not reach one terminal status");
    assert(raceState.status === "APPROVED"
      ? raceState.card.principalBalanceJpy === 15_000 && raceState.card.lockVersion === 2
      : raceState.card.principalBalanceJpy === 10_000 && raceState.card.lockVersion === 1,
    "concurrent decision card mutation did not match the winning terminal status");
    assert(raceState.card.bonusBalanceJpy === 300, "concurrent decision changed the bonus balance");
    assert(await terminalAuditCountFor(raceState.id) === 1, "opposing decisions did not create exactly one winning terminal audit");
    assert(await notificationCountFor(raceRequest.publicId) === 2, "opposing decisions did not create exactly one outcome notification");

    const doubleApprovalRequest = await serviceA.create(merchantActor, requestContext, fixture.doubleApprovalCard.publicId, {
      targetPrincipalBalanceJpy: 16_000,
      targetRemainingUses: null,
      reason: "双连接重复同意校验",
      idempotencyKey: `${marker}-double-request`
    });
    requestPublicIds.push(doubleApprovalRequest.publicId);
    const doubleApprovalResults = await Promise.allSettled([
      serviceA.decide(customerActor, requestContext, doubleApprovalRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-double-approve-a` }),
      serviceB.decide(customerActor, requestContext, doubleApprovalRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-double-approve-b` })
    ]);
    assert(doubleApprovalResults.filter((result) => result.status === "fulfilled").length === 1, "double approval did not produce exactly one winner");
    const doubleApprovalState = await client.shopMembershipCardAdjustmentRequest.findUniqueOrThrow({
      where: { publicId: doubleApprovalRequest.publicId },
      select: { id: true, status: true, card: { select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true } } }
    });
    assert(doubleApprovalState.status === "APPROVED" && doubleApprovalState.card.principalBalanceJpy === 16_000 && doubleApprovalState.card.lockVersion === 2, "double approval did not mutate the card exactly once");
    assert(doubleApprovalState.card.bonusBalanceJpy === 300, "double approval changed the bonus balance");
    assert(await terminalAuditCountFor(doubleApprovalState.id) === 1, "double approval did not create exactly one terminal audit");
    assert(await notificationCountFor(doubleApprovalRequest.publicId) === 2, "double approval did not create exactly one outcome notification");

    const cancelRaceRequest = await serviceA.create(merchantActor, requestContext, fixture.cancelRaceCard.publicId, {
      targetPrincipalBalanceJpy: 17_000,
      targetRemainingUses: null,
      reason: "同意与撤回竞争校验",
      idempotencyKey: `${marker}-cancel-race-request`
    });
    requestPublicIds.push(cancelRaceRequest.publicId);
    const cancelRaceResults = await Promise.allSettled([
      serviceA.decide(customerActor, requestContext, cancelRaceRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-cancel-race-approve` }),
      serviceB.cancel(merchantActor, requestContext, cancelRaceRequest.publicId)
    ]);
    assert(cancelRaceResults.filter((result) => result.status === "fulfilled").length === 1, "approve-versus-cancel did not produce exactly one winner");
    const cancelRaceState = await client.shopMembershipCardAdjustmentRequest.findUniqueOrThrow({
      where: { publicId: cancelRaceRequest.publicId },
      select: { id: true, status: true, card: { select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true } } }
    });
    assert(cancelRaceState.status === "APPROVED" || cancelRaceState.status === "CANCELLED", "approve-versus-cancel did not reach a valid terminal status");
    assert(cancelRaceState.status === "APPROVED"
      ? cancelRaceState.card.principalBalanceJpy === 17_000 && cancelRaceState.card.lockVersion === 2
      : cancelRaceState.card.principalBalanceJpy === 12_000 && cancelRaceState.card.lockVersion === 1,
    "approve-versus-cancel card mutation did not match the winner");
    assert(cancelRaceState.card.bonusBalanceJpy === 300, "approve-versus-cancel changed the bonus balance");
    assert(await terminalAuditCountFor(cancelRaceState.id) === 1, "approve-versus-cancel did not create exactly one terminal audit");
    assert(await notificationCountFor(cancelRaceRequest.publicId) === 2, "approve-versus-cancel did not create exactly one outcome notification");

    const expiryRaceRequest = await serviceA.create(merchantActor, requestContext, fixture.expiryRaceCard.publicId, {
      targetPrincipalBalanceJpy: 18_000,
      targetRemainingUses: null,
      reason: "同意与到期竞争校验",
      idempotencyKey: `${marker}-expiry-race-request`
    });
    requestPublicIds.push(expiryRaceRequest.publicId);
    await client.shopMembershipCardAdjustmentRequest.update({
      where: { publicId: expiryRaceRequest.publicId },
      data: { expiresAt: new Date(Date.now() - 1_000) }
    });
    await Promise.allSettled([
      serviceA.decide(customerActor, requestContext, expiryRaceRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-expiry-race-approve` }),
      new ShopMembershipCardAdjustmentRepository(workerB).expireDue({ batchSize: 100, shopId: shop.id })
    ]);
    const expiryRaceState = await client.shopMembershipCardAdjustmentRequest.findUniqueOrThrow({
      where: { publicId: expiryRaceRequest.publicId },
      select: { id: true, status: true, card: { select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true } } }
    });
    assert(expiryRaceState.status === "EXPIRED", "approve-versus-expiry did not preserve expiry as the only winner after the deadline");
    assert(expiryRaceState.card.principalBalanceJpy === 13_000 && expiryRaceState.card.bonusBalanceJpy === 300 && expiryRaceState.card.lockVersion === 1, "approve-versus-expiry changed the card");
    assert(await terminalAuditCountFor(expiryRaceState.id) === 1, "approve-versus-expiry did not create exactly one terminal audit");
    assert(await notificationCountFor(expiryRaceRequest.publicId) === 3, "approve-versus-expiry did not create the exact request and expiry notification set");

    const rollbackRequest = await serviceA.create(merchantActor, requestContext, fixture.rollbackCard.publicId, {
      targetPrincipalBalanceJpy: 25_000,
      targetRemainingUses: null,
      reason: "审计故障事务回滚校验",
      idempotencyKey: `${marker}-rollback-request`
    });
    requestPublicIds.push(rollbackRequest.publicId);
    const rollbackBefore = await client.shopMembershipCardAdjustmentRequest.findUniqueOrThrow({
      where: { publicId: rollbackRequest.publicId },
      select: { id: true, status: true, decisionIdempotencyKey: true, card: { select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true } } }
    });
    const failureClient = failureBase.$extends({
      query: {
        auditLog: {
          async create({ args, query }) {
            const action = typeof args.data.action === "string" ? args.data.action : "";
            if (action === "customer.shop_membership_card.adjustment.approve") throw new Error("injected_adjustment_audit_failure");
            return query(args);
          }
        }
      }
    }) as unknown as PrismaClient;
    let injectedFailureObserved = false;
    try {
      await serviceFor(failureClient).decide(customerActor, requestContext, rollbackRequest.publicId, {
        decision: "approve",
        idempotencyKey: `${marker}-rollback-approve`
      });
    } catch (error) {
      injectedFailureObserved = error instanceof Error && error.message === "injected_adjustment_audit_failure";
    }
    assert(injectedFailureObserved, "failure injection did not reach the post-card-update audit write");
    const rollbackAfter = await client.shopMembershipCardAdjustmentRequest.findUniqueOrThrow({
      where: { publicId: rollbackRequest.publicId },
      select: { id: true, status: true, decisionIdempotencyKey: true, card: { select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true } } }
    });
    assert(sameValue(rollbackAfter, rollbackBefore), "audit failure did not roll back the request and card atomically");
    const rolledBackApprovalAudits = await client.auditLog.count({
      where: { targetType: "ShopMembershipCardAdjustmentRequest", targetId: rollbackAfter.id, action: "customer.shop_membership_card.adjustment.approve" }
    });
    assert(rolledBackApprovalAudits === 0, "failed approval left an audit row behind");

    return {
      separateClients: 3,
      concurrentDecisionWinner: raceState.status.toLowerCase(),
      concurrentDecisionSingleWinner: true,
      doubleApprovalSingleMutation: true,
      approveVersusCancelSingleWinner: true,
      approveVersusExpiryPreservesDeadline: true,
      exactAuditAndNotificationSets: true,
      failureInjectionObserved: true,
      failureRollbackAtomic: true
    };
  } finally {
    await Promise.allSettled([workerA.$disconnect(), workerB.$disconnect(), failureBase.$disconnect()]);
    if (membershipId !== null) {
      const requests = await client.shopMembershipCardAdjustmentRequest.findMany({
        where: { card: { membershipId } },
        select: { id: true, publicId: true }
      });
      const requestIds = requests.map((request) => request.id);
      const requestPublicIdSet = new Set([...requestPublicIds, ...requests.map((request) => request.publicId)]);
      const notifications = await client.notification.findMany({
        where: { title: { startsWith: "shop_membership.card_adjustment." } },
        select: { id: true, payload: true }
      });
      const notificationIds = notifications.filter((notification) => {
        if (!notification.payload || typeof notification.payload !== "object" || Array.isArray(notification.payload)) return false;
        const requestPublicId = (notification.payload as Record<string, unknown>).requestPublicId;
        return typeof requestPublicId === "string" && requestPublicIdSet.has(requestPublicId);
      }).map((notification) => notification.id);
      if (notificationIds.length) await client.notification.deleteMany({ where: { id: { in: notificationIds } } });
      if (requestIds.length) await client.auditLog.deleteMany({ where: { targetType: "ShopMembershipCardAdjustmentRequest", targetId: { in: requestIds } } });
      await client.shopMembershipCardAdjustmentRequest.deleteMany({ where: { card: { membershipId } } });
      await client.shopMembershipCard.deleteMany({ where: { membershipId } });
      await client.shopCustomerMembership.delete({ where: { id: membershipId } });
    }
    const after = await captureProtectedState(client);
    assert(sameValue(after, before), "committed concurrency fixture cleanup did not restore the protected database state");
  }
}

let closeDatabase: (() => Promise<void>) | undefined;

async function main(): Promise<void> {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const loaded = await import("../src/prisma/client");
  const { prisma, disconnectPrisma, createPrismaClient } = (loaded.default ?? loaded) as typeof import("../src/prisma/client");
  closeDatabase = disconnectPrisma;
  const migrationEvidence = await verifyPhysicalMigration(prisma);
  const before = await captureProtectedState(prisma);
  const marker = `membership-card-adjustment-check-${Date.now()}`;
  let report: Record<string, unknown> | null = null;

  try {
    await prisma.$transaction(async (transaction) => {
      const shop = await transaction.shop.findFirst({
        where: { deletedAt: null },
        orderBy: { id: "asc" },
        select: { id: true, name: true }
      });
      const actor = await transaction.user.findFirst({
        where: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } },
        orderBy: { id: "asc" },
        select: { id: true, email: true }
      });
      assert(shop, "adjustment check requires one local shop");
      assert(actor, "adjustment check requires one active user with an identity");
      const customer = await transaction.customerProfile.findFirst({
        where: {
          deletedAt: null,
          userId: { not: actor.id },
          user: { is: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } } }
        },
        orderBy: { id: "asc" },
        select: { id: true, user: { select: { id: true, email: true } } }
      });
      assert(customer, "adjustment check requires a different active customer with an identity");
      const membership = await transaction.shopCustomerMembership.create({
        data: {
          shopId: shop.id,
          customerProfileId: customer.id,
          status: ShopCustomerMembershipStatus.ACTIVE,
          source: ShopCustomerMembershipSource.MERCHANT_MANUAL,
          activeKey: marker,
          createdById: actor.id,
          updatedById: actor.id
        },
        select: { id: true }
      });
      let cardSequence = 0;
      const createCard = (type: ShopMembershipCardType, input: { principal?: number; bonus?: number; remaining?: number; total?: number }) =>
        transaction.shopMembershipCard.create({
          data: {
            membershipId: membership.id,
            issuedById: actor.id,
            cardNo: `NMC-ADJ-${Date.now()}-${++cardSequence}`,
            name: type === ShopMembershipCardType.STORED_VALUE ? `回滚校验储值卡-${cardSequence}` : `回滚校验次卡-${cardSequence}`,
            type,
            status: ShopMembershipCardStatus.ACTIVE,
            initialPrincipalJpy: input.principal ?? null,
            initialUses: input.total ?? null,
            lockVersion: 1,
            principalBalanceJpy: input.principal ?? null,
            bonusBalanceJpy: input.bonus ?? null,
            remainingUses: input.remaining ?? null,
            totalUses: input.total ?? null,
            issuedAt: new Date()
          },
          select: { publicId: true }
        });
      const [storedCard, countCard, rejectedCard, cancelledCard, expiredCard, invalidatedCard, crossCustomerCard] = await Promise.all([
        createCard(ShopMembershipCardType.STORED_VALUE, { principal: 10_000, bonus: 500 }),
        createCard(ShopMembershipCardType.COUNT, { remaining: 4, total: 10 }),
        createCard(ShopMembershipCardType.STORED_VALUE, { principal: 2_000, bonus: 0 }),
        createCard(ShopMembershipCardType.COUNT, { remaining: 3, total: 8 }),
        createCard(ShopMembershipCardType.STORED_VALUE, { principal: 3_000, bonus: 100 }),
        createCard(ShopMembershipCardType.STORED_VALUE, { principal: 4_000, bonus: 200 }),
        createCard(ShopMembershipCardType.COUNT, { remaining: 2, total: 5 })
      ]);

      const transactionClient = transactionBoundClient(transaction);
      const service = new ShopMembershipCardAdjustmentService(
        new ShopMembershipCardAdjustmentRepository(transactionClient),
        new AuditLogService(new AuditLogRepository(transactionClient))
      );
      const merchantActor: AuthenticatedAccessContext = {
        userId: actor.id,
        email: actor.email,
        accessTokenJti: marker,
        accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: shop.id,
        roles: ["merchant_owner"],
        permissions: ["shop.member.card.adjust.request"]
      };
      const customerActor: AuthenticatedAccessContext = {
        userId: customer.user.id,
        email: customer.user.email,
        accessTokenJti: `${marker}-customer`,
        accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: customer.id,
        roles: ["customer"],
        permissions: ["customer-profile:read"]
      };
      const requestContext = { ip: "127.0.0.1", userAgent: marker };
      const financialBefore = await captureFinancialState(transaction);

      const storedInput = { targetPrincipalBalanceJpy: 12_000, targetRemainingUses: null, reason: "线下付款核对", idempotencyKey: `${marker}-stored-request` };
      const storedRequest = await service.create(merchantActor, requestContext, storedCard.publicId, storedInput);
      const storedBeforeApproval = await transaction.shopMembershipCard.findUniqueOrThrow({ where: { publicId: storedCard.publicId }, select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true } });
      assert(storedBeforeApproval.principalBalanceJpy === 10_000 && storedBeforeApproval.bonusBalanceJpy === 500 && storedBeforeApproval.lockVersion === 1, "request creation changed the stored-value card before approval");
      const idempotentReplay = await service.create(merchantActor, requestContext, storedCard.publicId, storedInput);
      assert(idempotentReplay.replayed && idempotentReplay.publicId === storedRequest.publicId, "identical request retry did not replay");
      await service.decide(customerActor, requestContext, storedRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-stored-approve` });
      const storedAfterApproval = await transaction.shopMembershipCard.findUniqueOrThrow({ where: { publicId: storedCard.publicId }, select: { principalBalanceJpy: true, bonusBalanceJpy: true, lockVersion: true } });
      assert(storedAfterApproval.principalBalanceJpy === 12_000 && storedAfterApproval.bonusBalanceJpy === 500 && storedAfterApproval.lockVersion === 2, "approval did not change principal exactly once while preserving bonus");
      const decisionReplay = await service.decide(customerActor, requestContext, storedRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-stored-approve` });
      assert(decisionReplay.replayed, "identical decision retry did not replay");

      const countRequest = await service.create(merchantActor, requestContext, countCard.publicId, { targetPrincipalBalanceJpy: null, targetRemainingUses: 6, reason: "补登记两次服务", idempotencyKey: `${marker}-count-request` });
      await service.decide(customerActor, requestContext, countRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-count-approve` });
      const countAfterApproval = await transaction.shopMembershipCard.findUniqueOrThrow({ where: { publicId: countCard.publicId }, select: { remainingUses: true, totalUses: true } });
      assert(countAfterApproval.remainingUses === 6 && countAfterApproval.totalUses === 12, "count approval did not preserve the six consumed uses");

      const rejectedRequest = await service.create(merchantActor, requestContext, rejectedCard.publicId, { targetPrincipalBalanceJpy: 2_500, targetRemainingUses: null, reason: "账目复核", idempotencyKey: `${marker}-reject-request` });
      await service.decide(customerActor, requestContext, rejectedRequest.publicId, { decision: "reject", idempotencyKey: `${marker}-reject-decision` });
      const rejectedValue = await transaction.shopMembershipCard.findUniqueOrThrow({ where: { publicId: rejectedCard.publicId }, select: { principalBalanceJpy: true } });
      assert(rejectedValue.principalBalanceJpy === 2_000, "rejection changed the card");

      const cancelledRequest = await service.create(merchantActor, requestContext, cancelledCard.publicId, { targetPrincipalBalanceJpy: null, targetRemainingUses: 5, reason: "历史漏记", idempotencyKey: `${marker}-cancel-request` });
      await service.cancel(merchantActor, requestContext, cancelledRequest.publicId);
      const cancelledValue = await transaction.shopMembershipCard.findUniqueOrThrow({ where: { publicId: cancelledCard.publicId }, select: { remainingUses: true, totalUses: true } });
      assert(cancelledValue.remainingUses === 3 && cancelledValue.totalUses === 8, "cancellation changed the card");

      const expiredRequest = await service.create(merchantActor, requestContext, expiredCard.publicId, { targetPrincipalBalanceJpy: 3_500, targetRemainingUses: null, reason: "到期校验", idempotencyKey: `${marker}-expire-request` });
      await transaction.shopMembershipCardAdjustmentRequest.update({ where: { publicId: expiredRequest.publicId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
      await assertRejectedCode(
        () => service.decide(customerActor, requestContext, expiredRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-expire-decision` }),
        ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRED,
        "expired request was not rejected"
      );
      const expiredState = await transaction.shopMembershipCardAdjustmentRequest.findUniqueOrThrow({ where: { publicId: expiredRequest.publicId }, select: { status: true, pendingKey: true } });
      const expiredValue = await transaction.shopMembershipCard.findUniqueOrThrow({ where: { publicId: expiredCard.publicId }, select: { principalBalanceJpy: true, bonusBalanceJpy: true } });
      assert(expiredState.status === "EXPIRED" && expiredState.pendingKey === null && expiredValue.principalBalanceJpy === 3_000 && expiredValue.bonusBalanceJpy === 100, "expiry did not remain terminal and non-mutating");

      const invalidatedRequest = await service.create(merchantActor, requestContext, invalidatedCard.publicId, { targetPrincipalBalanceJpy: 5_000, targetRemainingUses: null, reason: "快照校验", idempotencyKey: `${marker}-invalidate-request` });
      await transaction.shopMembershipCard.update({ where: { publicId: invalidatedCard.publicId }, data: { principalBalanceJpy: 4_500, lockVersion: { increment: 1 } } });
      await assertRejectedCode(
        () => service.decide(customerActor, requestContext, invalidatedRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-invalidate-decision` }),
        ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_SNAPSHOT_CONFLICT,
        "stale snapshot was not invalidated"
      );
      const invalidatedState = await transaction.shopMembershipCardAdjustmentRequest.findUniqueOrThrow({ where: { publicId: invalidatedRequest.publicId }, select: { status: true, pendingKey: true } });
      const invalidatedValue = await transaction.shopMembershipCard.findUniqueOrThrow({ where: { publicId: invalidatedCard.publicId }, select: { principalBalanceJpy: true } });
      assert(invalidatedState.status === "INVALIDATED" && invalidatedState.pendingKey === null && invalidatedValue.principalBalanceJpy === 4_500, "snapshot invalidation overwrote newer card data");

      let crossShopRejected = false;
      await assertRejectedCode(
        () => service.create({ ...merchantActor, currentIdentityScopeId: shop.id + 9_999_999 }, requestContext, rejectedCard.publicId, { targetPrincipalBalanceJpy: 2_700, targetRemainingUses: null, reason: "跨店校验", idempotencyKey: `${marker}-cross-shop` }),
        ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_NOT_FOUND,
        "cross-shop request was not hidden"
      ).then(() => { crossShopRejected = true; });
      const crossCustomerRequest = await service.create(merchantActor, requestContext, crossCustomerCard.publicId, { targetPrincipalBalanceJpy: null, targetRemainingUses: 4, reason: "跨用户校验", idempotencyKey: `${marker}-cross-customer-request` });
      let crossCustomerRejected = false;
      await assertRejectedCode(
        () => service.decide({ ...customerActor, userId: actor.id, currentIdentityScopeId: customer.id + 9_999_999 }, requestContext, crossCustomerRequest.publicId, { decision: "approve", idempotencyKey: `${marker}-cross-customer-decision` }),
        ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_NOT_FOUND,
        "cross-customer decision was not hidden"
      ).then(() => { crossCustomerRejected = true; });

      const financialAfter = await captureFinancialState(transaction);
      assert(sameValue(financialAfter, financialBefore), "membership card adjustments changed wallets or NDP ledger rows");
      const audits = await transaction.auditLog.findMany({
        where: { userAgent: marker, action: { contains: "shop_membership_card.adjustment" } },
        select: { action: true }
      });
      const auditActions = new Set(audits.map((entry) => entry.action));
      for (const action of [
        "merchant.shop_membership_card.adjustment.request",
        "customer.shop_membership_card.adjustment.approve",
        "customer.shop_membership_card.adjustment.reject",
        "merchant.shop_membership_card.adjustment.cancel"
      ]) assert(auditActions.has(action), `missing actor audit action: ${action}`);
      const systemRequestIds = (await transaction.shopMembershipCardAdjustmentRequest.findMany({
        where: { publicId: { in: [expiredRequest.publicId, invalidatedRequest.publicId] } },
        select: { id: true }
      })).map((request) => request.id);
      const systemAudits = await transaction.auditLog.findMany({
        where: {
          targetType: "ShopMembershipCardAdjustmentRequest",
          targetId: { in: systemRequestIds },
          action: { in: ["system.shop_membership_card.adjustment.expire", "system.shop_membership_card.adjustment.invalidate"] }
        },
        select: { action: true }
      });
      assert(systemAudits.some((entry) => entry.action === "system.shop_membership_card.adjustment.expire"), "missing expiry audit");
      assert(systemAudits.some((entry) => entry.action === "system.shop_membership_card.adjustment.invalidate"), "missing invalidation audit");
      const checkedRequestPublicIds = new Set([
        storedRequest.publicId,
        countRequest.publicId,
        rejectedRequest.publicId,
        cancelledRequest.publicId,
        expiredRequest.publicId,
        invalidatedRequest.publicId,
        crossCustomerRequest.publicId
      ]);
      const notificationRows = await transaction.notification.findMany({
        where: { title: { startsWith: "shop_membership.card_adjustment." } },
        select: { payload: true }
      });
      const notificationCount = notificationRows.filter((notification) => {
        if (!notification.payload || typeof notification.payload !== "object" || Array.isArray(notification.payload)) return false;
        const requestPublicId = (notification.payload as Record<string, unknown>).requestPublicId;
        return typeof requestPublicId === "string" && checkedRequestPublicIds.has(requestPublicId);
      }).length;
      assert(notificationCount === 15, "adjustment flow did not create exactly 15 request-scoped notifications");

      report = {
        databaseName,
        ready: true,
        migrationEvidence,
        storedApproval: { before: 10_000, target: storedAfterApproval.principalBalanceJpy, bonusUnchanged: storedAfterApproval.bonusBalanceJpy },
        countApproval: { beforeRemaining: 4, beforeTotal: 10, targetRemaining: countAfterApproval.remainingUses, targetTotal: countAfterApproval.totalUses, consumedUses: 6 },
        rejectedUnchanged: rejectedValue.principalBalanceJpy,
        cancelledUnchanged: cancelledValue,
        expiredUnchanged: expiredValue,
        snapshotInvalidatedWithoutOverwrite: invalidatedValue.principalBalanceJpy,
        idempotentReplay: idempotentReplay.replayed && decisionReplay.replayed,
        crossShopRejected,
        crossCustomerRejected,
        actorAuditCount: audits.length,
        systemAuditCount: systemAudits.length,
        notificationCount,
        walletAndNdpLedgerUnchanged: sameValue(financialAfter, financialBefore)
      };
      throw new RollbackVerifiedFlow();
    }, { maxWait: 10_000, timeout: 60_000 });
  } catch (error) {
    if (!(error instanceof RollbackVerifiedFlow)) throw error;
  }

  const after = await captureProtectedState(prisma);
  const cleanupVerified = sameValue(after, before);
  assert(cleanupVerified, "rollback cleanup did not restore the protected database state");
  const concurrencyAndRollback = await verifyCommittedConcurrencyAndRollback(prisma, createPrismaClient, `${marker}-committed`);
  console.log(JSON.stringify({ ...report, cleanupVerified, concurrencyAndRollback }, null, 2));
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
