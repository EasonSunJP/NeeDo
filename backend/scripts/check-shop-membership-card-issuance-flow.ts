import {
  ShopCustomerMembershipSource,
  ShopCustomerMembershipStatus,
  ShopMembershipCardPlanStatus,
  ShopMembershipCardPlanValidityMode,
  ShopMembershipCardPlanVersionStatus,
  ShopMembershipCardType,
  ShopMembershipRewardRuleGroup,
  ShopMembershipRewardRuleKind,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuditLogRepository } from "../src/repositories/audit-log.repository";
import { ShopMembershipCardIssuanceRepository } from "../src/repositories/shop-membership-card-issuance.repository";
import { AuditLogService } from "../src/services/audit-log.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { ShopMembershipCardIssuanceService } from "../src/services/shop-membership-card-issuance.service";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

function assertSafeLocalDatabase(): string {
  assert(!["production", "prod", "staging"].includes((process.env.NODE_ENV ?? "").toLowerCase()), "membership card issuance check rejects production-like NODE_ENV");
  assert(!["production", "prod", "staging"].includes((process.env.DEPLOY_ENV ?? "").toLowerCase()), "membership card issuance check rejects production-like DEPLOY_ENV");
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "membership card issuance check only accepts a local database host");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(/(?:test|dev|local)/i.test(databaseName), "membership card issuance check requires a test, dev, or local database name");
  assert(!/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName), "membership card issuance check rejects production-looking database names");
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
  plans: await client.shopMembershipCardPlan.count(),
  versions: await client.shopMembershipCardPlanVersion.count(),
  rules: await client.shopMembershipRewardRule.count(),
  cards: await client.shopMembershipCard.count(),
  notifications: await client.notification.count(),
  audits: await client.auditLog.count(),
  financial: await captureFinancialState(client)
});

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function verifyPhysicalMigration(client: PrismaClient) {
  const columns = await client.$queryRaw<Array<{ columnName: string }>>`
    SELECT COLUMN_NAME AS columnName
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shop_membership_cards'
  `;
  const constraints = await client.$queryRaw<Array<{ constraintName: string; constraintType: string }>>`
    SELECT CONSTRAINT_NAME AS constraintName, CONSTRAINT_TYPE AS constraintType
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shop_membership_cards'
  `;
  const indexes = await client.$queryRaw<Array<{ indexName: string; nonUnique: number }>>`
    SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'shop_membership_cards'
  `;
  const requiredColumns = [
    "plan_id",
    "plan_version_id",
    "issued_by_id",
    "issuance_source",
    "issuance_reference",
    "issuance_note",
    "initial_principal_jpy",
    "initial_uses",
    "platform_fee_rate_bps_snapshot",
    "issuance_idempotency_key",
    "issuance_fingerprint"
  ];
  const requiredConstraints = [
    "shop_membership_cards_initial_principal_nonnegative",
    "shop_membership_cards_initial_uses_nonnegative",
    "shop_membership_cards_fee_snapshot_range",
    "shop_membership_cards_plan_id_fkey",
    "shop_membership_cards_plan_version_id_fkey",
    "shop_membership_cards_issued_by_id_fkey"
  ];
  const columnNames = new Set(columns.map((row) => row.columnName));
  const constraintNames = new Set(constraints.map((row) => row.constraintName));
  assert(requiredColumns.every((name) => columnNames.has(name)), "physical shop_membership_cards columns do not match the issuance schema");
  assert(requiredConstraints.every((name) => constraintNames.has(name)), "physical shop_membership_cards checks or foreign keys are incomplete");
  assert(indexes.some((row) => row.indexName === "shop_membership_cards_issuance_idempotency_key" && Number(row.nonUnique) === 0), "physical issuance idempotency index is missing or not unique");

  const permission = await client.permission.findFirst({
    where: { code: "shop.member.card.issue", deletedAt: null },
    select: {
      code: true,
      rolePermissions: {
        where: { deletedAt: null, role: { deletedAt: null } },
        select: { role: { select: { code: true } } }
      }
    }
  });
  assert(permission, "shop.member.card.issue permission is missing from the physical database");
  const defaultRoles = permission.rolePermissions.map((entry) => entry.role.code).sort();
  assert(defaultRoles.includes("admin") && defaultRoles.includes("merchant_owner"), "admin and merchant_owner must receive the issuance permission by default");
  assert(!defaultRoles.includes("merchant_staff"), "merchant_staff must remain read-only by default");
  return {
    columns: requiredColumns.length,
    checksAndForeignKeys: requiredConstraints.length,
    uniqueIdempotencyIndex: true,
    defaultRoles
  };
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

type PlanFixtureInput = {
  suffix: string;
  name: string;
  cardType: ShopMembershipCardType;
  validityMode: ShopMembershipCardPlanValidityMode;
  validityDays: number | null;
  fixedExpiryAt: Date | null;
  minInitialPrincipalJpy: number | null;
  maxInitialPrincipalJpy: number | null;
  minInitialUses: number | null;
  maxInitialUses: number | null;
};

async function createPublishedPlanFixture(
  transaction: Prisma.TransactionClient,
  shopId: number,
  actorId: number,
  fixedNow: Date,
  marker: string,
  input: PlanFixtureInput
) {
  const plan = await transaction.shopMembershipCardPlan.create({
    data: {
      shopId,
      status: ShopMembershipCardPlanStatus.DRAFT,
      createdById: actorId,
      updatedById: actorId
    },
    select: { id: true, publicId: true }
  });
  const version = await transaction.shopMembershipCardPlanVersion.create({
    data: {
      planId: plan.id,
      version: 1,
      status: ShopMembershipCardPlanVersionStatus.PUBLISHED,
      draftKey: null,
      lockVersion: 1,
      name: input.name,
      description: `${marker}-${input.suffix}`,
      cardType: input.cardType,
      validityMode: input.validityMode,
      validityDays: input.validityDays,
      fixedExpiryAt: input.fixedExpiryAt,
      minInitialPrincipalJpy: input.minInitialPrincipalJpy,
      maxInitialPrincipalJpy: input.maxInitialPrincipalJpy,
      minInitialUses: input.minInitialUses,
      maxInitialUses: input.maxInitialUses,
      rewardCaps: {
        perOrderNdp: null,
        perDayNdp: null,
        perMonthNdp: null,
        lifetimeNdp: null
      },
      platformFeeRateBps: 1_000,
      publishedById: actorId,
      publishedAt: fixedNow
    },
    select: { id: true, publicId: true }
  });
  await transaction.shopMembershipRewardRule.create({
    data: {
      planVersionId: version.id,
      kind: ShopMembershipRewardRuleKind.FIXED_PER_COMPLETION,
      ruleGroup: ShopMembershipRewardRuleGroup.BASE,
      config: {
        rewardNdp: 1_000,
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
  });
  await transaction.shopMembershipCardPlan.update({
    where: { id: plan.id },
    data: { status: ShopMembershipCardPlanStatus.ACTIVE, currentVersionId: version.id },
    select: { id: true }
  });
  return { planPublicId: plan.publicId, versionPublicId: version.publicId };
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
  const migrationEvidence = await verifyPhysicalMigration(prisma);
  const before = await captureProtectedState(prisma);
  const fixedNow = new Date();
  const marker = `membership-card-issuance-check-${fixedNow.getTime()}`;
  let report: Record<string, unknown> | null = null;

  try {
    await prisma.$transaction(async (transaction) => {
      const shop = await transaction.shop.findFirst({
        where: { deletedAt: null },
        orderBy: { id: "asc" },
        select: { id: true, shopNo: true, name: true }
      });
      const actor = await transaction.user.findFirst({
        where: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } },
        orderBy: { id: "asc" },
        select: { id: true, email: true }
      });
      assert(shop, "membership card issuance check requires one non-deleted local shop");
      assert(actor, "membership card issuance check requires one active user with an identity");
      const customer = await transaction.customerProfile.findFirst({
        where: {
          deletedAt: null,
          userId: { not: actor.id },
          user: { is: { isActive: true, deletedAt: null, identities: { some: { isActive: true, deletedAt: null } } } }
        },
        orderBy: { id: "asc" },
        select: { id: true, displayName: true, user: { select: { id: true, needoId: true } } }
      });
      assert(customer, "membership card issuance check requires one customer profile with an active identity");

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
        select: { publicId: true }
      });
      const fixedDateExpiry = new Date(fixedNow.getTime() + 90 * 24 * 60 * 60 * 1_000);
      const [storedPlan, countPlan, benefitPlan] = await Promise.all([
        createPublishedPlanFixture(transaction, shop.id, actor.id, fixedNow, marker, {
          suffix: "stored",
          name: "回滚校验储值卡",
          cardType: ShopMembershipCardType.STORED_VALUE,
          validityMode: ShopMembershipCardPlanValidityMode.FIXED_DAYS,
          validityDays: 30,
          fixedExpiryAt: null,
          minInitialPrincipalJpy: 1_000,
          maxInitialPrincipalJpy: 50_000,
          minInitialUses: null,
          maxInitialUses: null
        }),
        createPublishedPlanFixture(transaction, shop.id, actor.id, fixedNow, marker, {
          suffix: "count",
          name: "回滚校验次卡",
          cardType: ShopMembershipCardType.COUNT,
          validityMode: ShopMembershipCardPlanValidityMode.NEVER,
          validityDays: null,
          fixedExpiryAt: null,
          minInitialPrincipalJpy: null,
          maxInitialPrincipalJpy: null,
          minInitialUses: 1,
          maxInitialUses: 20
        }),
        createPublishedPlanFixture(transaction, shop.id, actor.id, fixedNow, marker, {
          suffix: "benefit",
          name: "回滚校验权益卡",
          cardType: ShopMembershipCardType.BENEFIT,
          validityMode: ShopMembershipCardPlanValidityMode.FIXED_DATE,
          validityDays: null,
          fixedExpiryAt: fixedDateExpiry,
          minInitialPrincipalJpy: null,
          maxInitialPrincipalJpy: null,
          minInitialUses: null,
          maxInitialUses: null
        })
      ]);

      const merchantActor: AuthenticatedAccessContext = {
        userId: actor.id,
        email: actor.email,
        accessTokenJti: marker,
        accessTokenExpiresAt: Math.floor(fixedNow.getTime() / 1_000) + 900,
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: shop.id,
        roles: ["merchant_owner"],
        permissions: ["shop.member.card.issue"]
      };
      let cardSequence = 0;
      const cardNumberPrefix = fixedNow.getTime().toString(16).toUpperCase().padStart(20, "0").slice(-20);
      const transactionClient = transactionBoundClient(transaction);
      const repository = new ShopMembershipCardIssuanceRepository(transactionClient);
      const audit = new AuditLogService(new AuditLogRepository(transactionClient));
      const service = new ShopMembershipCardIssuanceService(
        repository,
        audit,
        () => fixedNow,
        () => `NMC-${cardNumberPrefix}${String(++cardSequence).padStart(4, "0")}`
      );
      const requestContext = { ip: "127.0.0.1", userAgent: marker };
      const financialBefore = await captureFinancialState(transaction);
      const storedInput = {
        planPublicId: storedPlan.planPublicId,
        initialPrincipalJpy: 5_000,
        initialUses: null,
        issuanceSource: "offline_paid" as const,
        issuanceReference: `${marker}-receipt`,
        issuanceNote: null,
        idempotencyKey: `${marker}-stored`
      };
      const stored = await service.issue(merchantActor, requestContext, membership.publicId, storedInput);
      const count = await service.issue(merchantActor, requestContext, membership.publicId, {
        planPublicId: countPlan.planPublicId,
        initialPrincipalJpy: null,
        initialUses: 4,
        issuanceSource: "historical_replacement",
        issuanceReference: null,
        issuanceNote: "历史次卡补录",
        idempotencyKey: `${marker}-count`
      });
      const benefit = await service.issue(merchantActor, requestContext, membership.publicId, {
        planPublicId: benefitPlan.planPublicId,
        initialPrincipalJpy: null,
        initialUses: null,
        issuanceSource: "manual_grant",
        issuanceReference: null,
        issuanceNote: "店铺人工发放",
        idempotencyKey: `${marker}-benefit`
      });
      const financialAfter = await captureFinancialState(transaction);
      assert(sameValue(financialAfter, financialBefore), "card issuance must not change wallets or create NDP ledger records");
      assert(stored.principalBalanceJpy === 5_000 && stored.bonusBalanceJpy === 0 && stored.initialPrincipalJpy === 5_000, "stored-value issuance did not persist the exact offline-paid principal");
      assert(stored.expiresAt?.getTime() === fixedNow.getTime() + 30 * 24 * 60 * 60 * 1_000, "fixed-days expiry was not derived from the published plan");
      assert(count.remainingUses === 4 && count.totalUses === 4 && count.initialUses === 4, "count-card issuance did not persist the exact initial uses");
      assert(count.expiresAt === null, "never-expiring count card unexpectedly received an expiry");
      assert(benefit.initialPrincipalJpy === null && benefit.initialUses === null && benefit.expiresAt?.getTime() === fixedDateExpiry.getTime(), "benefit-card issuance values or fixed expiry are incorrect");
      assert([stored, count, benefit].every((card) => card.platformFeeRateBpsSnapshot === 1_000), "issued cards did not snapshot the published 10% platform fee rate");
      assert(stored.planVersionPublicId === storedPlan.versionPublicId && count.planVersionPublicId === countPlan.versionPublicId && benefit.planVersionPublicId === benefitPlan.versionPublicId, "issued cards do not reference the exact published plan versions");

      const cardsBeforeReplay = await transaction.shopMembershipCard.count({ where: { membershipId: { gt: 0 }, issuanceIdempotencyKey: { startsWith: marker } } });
      const auditsBeforeReplay = await transaction.auditLog.count({ where: { action: "merchant.shop_membership_card.issue", userAgent: marker } });
      const notificationsBeforeReplay = await transaction.notification.count({
        where: { recipientUserId: customer.user.id, actorUserId: actor.id, title: "shop_membership.card_issued.title", createdAt: fixedNow }
      });
      const replay = await service.issue(merchantActor, requestContext, membership.publicId, storedInput);
      const cardsAfterReplay = await transaction.shopMembershipCard.count({ where: { membershipId: { gt: 0 }, issuanceIdempotencyKey: { startsWith: marker } } });
      const auditsAfterReplay = await transaction.auditLog.count({ where: { action: "merchant.shop_membership_card.issue", userAgent: marker } });
      const notificationsAfterReplay = await transaction.notification.count({
        where: { recipientUserId: customer.user.id, actorUserId: actor.id, title: "shop_membership.card_issued.title", createdAt: fixedNow }
      });
      assert(replay.replayed && replay.publicId === stored.publicId, "same idempotency key and payload did not replay the original card");
      assert(cardsBeforeReplay === 3 && cardsAfterReplay === 3, "idempotent replay created another membership card");
      assert(auditsBeforeReplay === 3 && auditsAfterReplay === 3, "idempotent replay created another audit log");
      assert(notificationsBeforeReplay === 3 && notificationsAfterReplay === 3, "idempotent replay created another customer notification");

      let idempotencyConflictRejected = false;
      try {
        await service.issue(merchantActor, requestContext, membership.publicId, {
          ...storedInput,
          initialPrincipalJpy: 6_000
        });
      } catch (error) {
        idempotencyConflictRejected = Boolean(
          error && typeof error === "object" && "code" in error && error.code === ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_IDEMPOTENCY_CONFLICT
        );
      }
      assert(idempotencyConflictRejected, "same idempotency key with a changed payload was not rejected");

      const audits = await transaction.auditLog.findMany({
        where: { action: "merchant.shop_membership_card.issue", userAgent: marker },
        orderBy: { id: "asc" },
        select: { action: true, targetType: true, targetId: true, metadata: true }
      });
      const notifications = await transaction.notification.findMany({
        where: { recipientUserId: customer.user.id, actorUserId: actor.id, title: "shop_membership.card_issued.title", createdAt: fixedNow },
        orderBy: { id: "asc" },
        select: { type: true, title: true, body: true, payload: true }
      });
      assert(audits.length === 3 && audits.every((entry) => entry.targetType === "ShopMembershipCard" && entry.targetId !== null), "each issued card must have one exact audit row");
      assert(notifications.length === 3 && notifications.every((entry) => entry.type === "SYSTEM" && entry.body === "shop_membership.card_issued.body"), "each issued card must have one customer notification");
      const persistedCards = await transaction.shopMembershipCard.findMany({
        where: { issuanceIdempotencyKey: { startsWith: marker }, deletedAt: null },
        orderBy: { id: "asc" },
        select: { publicId: true, planId: true, planVersionId: true, issuedById: true, issuanceSource: true, platformFeeRateBpsSnapshot: true }
      });
      assert(persistedCards.length === 3 && persistedCards.every((card) => card.planId !== null && card.planVersionId !== null && card.issuedById === actor.id), "formal issuance snapshot columns were not populated for every card");

      report = {
        databaseName,
        ready: true,
        cardTypes: [stored.type, count.type, benefit.type],
        exactInitialValues: { storedPrincipalJpy: stored.initialPrincipalJpy, countUses: count.initialUses },
        derivedExpiryModes: { fixedDays: stored.expiresAt?.toISOString(), never: count.expiresAt, fixedDate: benefit.expiresAt?.toISOString() },
        platformFeeRateBpsSnapshot: stored.platformFeeRateBpsSnapshot,
        migrationEvidence,
        cardCount: persistedCards.length,
        auditCount: audits.length,
        notificationCount: notifications.length,
        idempotentReplay: replay.replayed,
        idempotencyConflictRejected,
        walletAndNdpLedgerUnchanged: sameValue(financialAfter, financialBefore)
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
