import type { PrismaClient } from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

function assertSafeLocalDatabase(): string {
  assert(!["production", "prod", "staging"].includes((process.env.NODE_ENV ?? "").toLowerCase()), "membership card plan check rejects production-like NODE_ENV");
  assert(!["production", "prod", "staging"].includes((process.env.DEPLOY_ENV ?? "").toLowerCase()), "membership card plan check rejects production-like DEPLOY_ENV");
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "membership card plan check only accepts a local database host");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(/(?:test|dev|local)/i.test(databaseName), "membership card plan check requires a test, dev, or local database name");
  assert(!/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName), "membership card plan check rejects production-looking database names");
  return databaseName;
}

const captureProtectedCounts = async (client: PrismaClient) => ({
  feePolicies: await client.membershipRewardFeePolicyVersion.count(),
  plans: await client.shopMembershipCardPlan.count(),
  versions: await client.shopMembershipCardPlanVersion.count(),
  rules: await client.shopMembershipRewardRule.count(),
  cards: await client.shopMembershipCard.count(),
  wallets: await client.wallet.count(),
  ledgerTransactions: await client.ledgerTransaction.count(),
  ledgerEntries: await client.walletLedger.count(),
  audits: await client.auditLog.count()
});

class RollbackVerifiedFlow extends Error {}

let closeDatabase: (() => Promise<void>) | undefined;

async function main(): Promise<void> {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const [{ prisma, disconnectPrisma }, { ShopMembershipCardPlanRepository }, { AuditLogRepository }, { AuditLogService }, { ShopMembershipCardPlanService }] = await Promise.all([
    import("../src/prisma/client"),
    import("../src/repositories/shop-membership-card-plan.repository"),
    import("../src/repositories/audit-log.repository"),
    import("../src/services/audit-log.service"),
    import("../src/services/shop-membership-card-plan.service")
  ]);
  closeDatabase = disconnectPrisma;
  const before = await captureProtectedCounts(prisma);
  const marker = `membership-plan-check-${Date.now()}`;
  const fixedNow = new Date();
  const shop = await prisma.shop.findFirst({ where: { deletedAt: null }, orderBy: { id: "asc" }, select: { id: true } });
  const actorUser = await prisma.user.findFirst({ where: { deletedAt: null, isActive: true }, orderBy: { id: "asc" }, select: { id: true, email: true } });
  assert(shop, "membership card plan check requires one non-deleted local shop");
  assert(actorUser, "membership card plan check requires one active local user");

  const merchantActor: AuthenticatedAccessContext = {
    userId: actorUser.id,
    email: actorUser.email,
    accessTokenJti: marker,
    accessTokenExpiresAt: Math.floor(fixedNow.getTime() / 1000) + 900,
    currentIdentityType: "merchant_owner",
    currentIdentityScopeType: "shop",
    currentIdentityScopeId: shop.id,
    roles: ["merchant_owner"],
    permissions: ["shop.member.card_plan.view", "shop.member.card_plan.manage", "shop.member.card_plan.publish"]
  };
  const operationsActor: AuthenticatedAccessContext = {
    ...merchantActor,
    currentIdentityType: "platform_admin",
    currentIdentityScopeType: "global",
    currentIdentityScopeId: null,
    roles: ["finance"],
    permissions: ["page:backoffice-membership-reward-fee", "button:backoffice-membership-reward-fee-create"]
  };
  const context = { ip: "127.0.0.1", userAgent: marker };
  const scope = { servicePublicIds: [], categoryCodes: [], excludedServicePublicIds: [], excludedCategoryCodes: [], activeFrom: null, activeTo: null };
  const caps = { perOrderNdp: null, perDayNdp: null, perMonthNdp: null, lifetimeNdp: null };
  const issuance = { minInitialPrincipalJpy: null, maxInitialPrincipalJpy: null, minInitialUses: null, maxInitialUses: null };
  let report: Record<string, unknown> | null = null;

  try {
    await prisma.$transaction(async (transaction) => {
      const client = transaction as unknown as PrismaClient;
      const repository = new ShopMembershipCardPlanRepository(client, () => fixedNow);
      const audit = new AuditLogService(new AuditLogRepository(client));
      const service = new ShopMembershipCardPlanService(repository, audit, () => fixedNow);
      const initialFee = await repository.getEffectiveFeePolicy(fixedNow);
      const feeRows = initialFee ? [] : await transaction.membershipRewardFeePolicyVersion.findMany({
        where: { deletedAt: null },
        select: { feeRateBps: true, effectiveFrom: true, effectiveTo: true }
      });
      assert(
        initialFee?.feeRateBps === 1000,
        `membership reward fee must start at the approved 10% default (evaluatedAt=${fixedNow.toISOString()}, resolved=${initialFee ? `${initialFee.feeRateBps}@${initialFee.effectiveFrom.toISOString()}` : "none"}, rows=${JSON.stringify(feeRows)})`
      );

      const bonusRules = [
        { kind: "first_card_use_bonus" as const, rewardNdp: 200, scope },
        { kind: "service_scope_bonus" as const, rewardNdp: 300, rewardRateBps: null, scope: { ...scope, activeFrom: "2099-01-01T00:00:00.000Z" } },
        { kind: "completion_milestone_bonus" as const, everyCompletions: 10, rewardNdp: 400, repeat: true, scope },
        { kind: "spend_milestone_bonus" as const, thresholdJpy: 1_000_000, rewardNdp: 500, repeat: false, scope },
        { kind: "birthday_month_bonus" as const, rewardNdp: 600, annualLimit: 1, scope },
        { kind: "schedule_window_bonus" as const, rewardNdp: 700, timezone: "Asia/Tokyo" as const, daysOfWeek: [0], startTime: "00:00", endTime: "00:01", scope: { ...scope, activeFrom: "2099-01-01T00:00:00.000Z" } },
        { kind: "consecutive_month_bonus" as const, consecutiveMonths: 12, rewardNdp: 800, scope }
      ];
      const mainPlan = await service.createPlan(merchantActor, context, {
        expectedLockVersion: 0, name: `${marker}-fixed`, description: "transactional acceptance", cardType: "benefit", validity: { mode: "never" }, issuance, caps,
        rules: [{ kind: "fixed_per_completion", rewardNdp: 1000, scope }, ...bonusRules]
      });
      const percentPlan = await service.createPlan(merchantActor, context, {
        expectedLockVersion: 0, name: `${marker}-percent`, description: null, cardType: "benefit", validity: { mode: "never" }, issuance, caps,
        rules: [{ kind: "percent_of_eligible_amount", rewardRateBps: 1000, scope }]
      });
      const blockPlan = await service.createPlan(merchantActor, context, {
        expectedLockVersion: 0, name: `${marker}-block`, description: null, cardType: "benefit", validity: { mode: "never" }, issuance, caps,
        rules: [{ kind: "spend_block", blockAmountJpy: 5000, rewardNdpPerBlock: 500, scope }]
      });

      const scenario = {
        eligibleAmountJpy: 10_000,
        servicePublicId: "00000000-0000-4000-8000-000000000001",
        categoryCode: "general",
        occurredAt: fixedNow.toISOString(),
        completedCountBefore: 0,
        lifetimeEligibleSpendJpyBefore: 0,
        isFirstCardUse: false,
        customerBirthMonth: ((fixedNow.getUTCMonth() + 1) % 12) + 1,
        birthdayRewardsThisYear: 0,
        consecutiveEligibleMonths: 0,
        rewardedConsecutiveMonthMilestones: [],
        alreadyRewardedTodayNdp: 0,
        alreadyRewardedMonthNdp: 0,
        alreadyRewardedLifetimeNdp: 0
      };
      const preview = await service.previewPlan(merchantActor, mainPlan.publicId, scenario);
      assert(preview.customerRewardNdp === 1000 && preview.platformFeeNdp === 100 && preview.totalShopDebitNdp === 1100, "server preview must equal 1000/100/1100");
      const crossShopRejected = await repository.findPlan(shop.id + 1_000_000_000, mainPlan.publicId) === null;
      assert(crossShopRejected, "cross-shop plan read was not rejected");
      const published = await service.publishPlan(merchantActor, context, mainPlan.publicId, { expectedLockVersion: mainPlan.draftVersion?.lockVersion ?? -1 });
      assert(published.currentVersion?.platformFeeRateBps === 1000, "published plan did not snapshot the 10% platform fee");

      const nextDraft = await service.updateDraft(merchantActor, context, mainPlan.publicId, {
        expectedLockVersion: published.currentVersion?.lockVersion ?? 0, name: `${marker}-fixed-v2`, description: "new draft", cardType: "benefit", validity: { mode: "never" }, issuance, caps,
        rules: [{ kind: "fixed_per_completion", rewardNdp: 1200, scope }]
      });
      assert(nextDraft.currentVersion?.version === 1 && nextDraft.currentVersion.platformFeeRateBps === 1000 && nextDraft.draftVersion?.version === 2, "editing a published plan must create a new draft without mutating the published version");

      const createdFee = await service.createFeePolicyVersion(operationsActor, context, { feeRateBps: 1200, expectedVersion: initialFee.version, effectiveFrom: fixedNow, reason: marker });
      assert(createdFee.feeRateBps === 1200, "temporary later fee version was not created");
      const persistedSnapshot = await repository.findPlan(shop.id, mainPlan.publicId);
      assert(persistedSnapshot?.currentVersion?.platformFeeRateBps === 1000, "later fee change modified an existing published snapshot");
      const audits = await transaction.auditLog.findMany({ where: { userAgent: marker }, select: { action: true } });
      for (const action of ["merchant.shop_membership_card_plan.create", "merchant.shop_membership_card_plan.publish", "merchant.shop_membership_card_plan.draft_update", "platform.membership_reward_fee.publish"]) {
        assert(audits.some((auditRow) => auditRow.action === action), `missing audit action: ${action}`);
      }
      const expectedRuleKinds = [
        "FIXED_PER_COMPLETION",
        "PERCENT_OF_ELIGIBLE_AMOUNT",
        "SPEND_BLOCK",
        "FIRST_CARD_USE_BONUS",
        "SERVICE_SCOPE_BONUS",
        "COMPLETION_MILESTONE_BONUS",
        "SPEND_MILESTONE_BONUS",
        "BIRTHDAY_MONTH_BONUS",
        "SCHEDULE_WINDOW_BONUS",
        "CONSECUTIVE_MONTH_BONUS"
      ];
      const createdRules = await transaction.shopMembershipRewardRule.findMany({
        where: {
          planVersion: {
            publicId: {
              in: [mainPlan.draftVersion?.publicId, percentPlan.draftVersion?.publicId, blockPlan.draftVersion?.publicId]
                .filter((publicId): publicId is string => Boolean(publicId))
            },
            plan: { shopId: shop.id }
          },
          deletedAt: null
        },
        select: { kind: true }
      });
      const createdRuleKinds = [...new Set(createdRules.map((rule) => rule.kind))].sort();
      const allRuleKindsPersisted = createdRules.length === expectedRuleKinds.length
        && createdRuleKinds.join(",") === expectedRuleKinds.sort().join(",");
      assert(allRuleKindsPersisted, "the transaction did not persist exactly the ten supported membership reward rule kinds");
      report = {
        databaseName,
        ready: true,
        preview: { customerRewardNdp: preview.customerRewardNdp, platformFeeNdp: preview.platformFeeNdp, totalShopDebitNdp: preview.totalShopDebitNdp },
        allRuleKindsPersisted,
        crossShopRejected,
        immutablePublishedSnapshot: persistedSnapshot.currentVersion.platformFeeRateBps === 1000,
        auditActions: [...new Set(audits.map((auditRow) => auditRow.action))]
      };
      throw new RollbackVerifiedFlow();
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (!(error instanceof RollbackVerifiedFlow)) throw error;
  }

  const after = await captureProtectedCounts(prisma);
  const cleanupIssues = Object.entries(before).filter(([key, value]) => after[key as keyof typeof after] !== value).map(([key]) => key);
  assert(cleanupIssues.length === 0, `rollback cleanup changed protected counts: ${cleanupIssues.join(", ")}`);
  console.log(JSON.stringify({ ...report, protectedCountDeltas: Object.fromEntries(Object.keys(before).map((key) => [key, after[key as keyof typeof after] - before[key as keyof typeof before]])), cleanupIssues }, null, 2));
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
