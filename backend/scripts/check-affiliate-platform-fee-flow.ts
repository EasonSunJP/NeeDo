import type { Prisma, PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { AppError } from "../src/utils/app-error";
import type {
  AffiliateTaskExpiryRepositoryPort,
  AffiliateTaskExpiryTaskRecord,
  AffiliateTaskExpiryTransactionClient
} from "../src/services/affiliate-task-expiry.service";
import type { AffiliateBudgetReservationRecord } from "../src/services/affiliate-task.service";

const COMMISSION_BUDGET_NDP = 2_000_000;
const REWARD_NDP = 10_000;
const PLATFORM_FEE_BPS = 1_000;
const PLATFORM_FEE_RESERVE_NDP = 200_000;
const GROSS_RESERVE_NDP = 2_200_000;
const PLATFORM_FEE_PER_REWARD_NDP = 1_000;
const GROSS_REWARD_NDP = 11_000;
const LOCAL_DATABASE_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const assertSafeLocalDatabase = (): string => {
  assert(
    process.env.NODE_ENV !== "production",
    "Affiliate platform fee check rejects NODE_ENV=production"
  );
  assert(process.env.DEPLOY_ENV !== "prod", "Affiliate platform fee check rejects DEPLOY_ENV=prod");
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "Affiliate platform fee check only accepts a local MySQL host"
  );
  assert(
    LOCAL_DATABASE_HOSTS.includes(databaseUrl.hostname),
    "Affiliate platform fee check rejected the database host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production)([_-]|$)/i.test(databaseName),
    "Affiliate platform fee check rejects production-like database names"
  );
  return databaseName;
};

type Baseline = Awaited<ReturnType<typeof captureBaseline>>;

const captureBaseline = async (prisma: PrismaClient) => {
  const [
    users,
    shops,
    services,
    merchantAccounts,
    merchantMemberships,
    feeRules,
    tasks,
    translations,
    taskShops,
    taskServices,
    claims,
    touches,
    attributions,
    rewards,
    reservations,
    budgetTransactions,
    rewardTransactions,
    bookings,
    slots,
    transactions,
    entries,
    reconciliations,
    audits,
    wallets
  ] = await Promise.all([
    prisma.user.count(),
    prisma.shop.count(),
    prisma.service.count(),
    prisma.merchantAccount.count(),
    prisma.merchantShopMembership.count(),
    prisma.affiliatePlatformFeeRule.count(),
    prisma.affiliateTask.count(),
    prisma.affiliateTaskTranslation.count(),
    prisma.affiliateTaskShop.count(),
    prisma.affiliateTaskService.count(),
    prisma.affiliateClaim.count(),
    prisma.affiliateTouch.count(),
    prisma.affiliateAttribution.count(),
    prisma.affiliateReward.count(),
    prisma.affiliateBudgetReservation.count(),
    prisma.affiliateBudgetTransaction.count(),
    prisma.affiliateRewardTransaction.count(),
    prisma.bookingOrder.count(),
    prisma.scheduleSlot.count(),
    prisma.ledgerTransaction.count(),
    prisma.walletLedger.count(),
    prisma.financeReconciliation.count(),
    prisma.auditLog.count(),
    prisma.wallet.aggregate({
      _count: { _all: true },
      _sum: { availableBalance: true, frozenBalance: true }
    })
  ]);
  return {
    users,
    shops,
    services,
    merchantAccounts,
    merchantMemberships,
    feeRules,
    tasks,
    translations,
    taskShops,
    taskServices,
    claims,
    touches,
    attributions,
    rewards,
    reservations,
    budgetTransactions,
    rewardTransactions,
    bookings,
    slots,
    transactions,
    entries,
    reconciliations,
    audits,
    wallets: {
      count: wallets._count._all,
      availableBalance: wallets._sum.availableBalance ?? 0,
      frozenBalance: wallets._sum.frozenBalance ?? 0
    }
  };
};

const assertExactBaseline = (before: Baseline, after: Baseline): void => {
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    `exact cleanup baseline mismatch: ${JSON.stringify({ before, after })}`
  );
};

const cleanupMarkerFixture = async (prisma: PrismaClient, marker: string): Promise<void> => {
  const residue = await Promise.all([
    prisma.user.count({ where: { email: { startsWith: marker } } }),
    prisma.shop.count({ where: { name: { startsWith: marker } } }),
    prisma.service.count({ where: { name: { startsWith: marker } } }),
    prisma.merchantAccount.count({ where: { code: { startsWith: marker } } }),
    prisma.affiliateTask.count({ where: { taskCode: { startsWith: marker } } }),
    prisma.affiliatePlatformFeeRule.count({ where: { reason: { startsWith: marker } } })
  ]);
  assert(
    residue.every((count) => count === 0),
    "marker-owned rows remained after rollback"
  );
};

class FixtureOwnedAffiliateTaskExpiryRepository implements AffiliateTaskExpiryRepositoryPort {
  public constructor(
    private readonly inner: AffiliateTaskExpiryRepositoryPort,
    private readonly taskId: number
  ) {}

  public async listExpiryCandidateTaskIds(input: {
    now: Date;
    batchSize: number;
    afterTaskId: number;
  }): Promise<number[]> {
    const ids = await this.inner.listExpiryCandidateTaskIds(input);
    return ids.filter((id) => id === this.taskId);
  }

  public runInTransaction<T>(
    handler: (
      repository: AffiliateTaskExpiryRepositoryPort,
      transactionClient?: AffiliateTaskExpiryTransactionClient
    ) => Promise<T>
  ): Promise<T> {
    return this.inner.runInTransaction((repository, transactionClient) =>
      handler(
        new FixtureOwnedAffiliateTaskExpiryRepository(repository, this.taskId),
        transactionClient
      )
    );
  }

  public lockTask(taskId: number): Promise<AffiliateTaskExpiryTaskRecord | null> {
    assert(taskId === this.taskId, "expiry attempted to lock a non-marker task");
    return this.inner.lockTask(taskId);
  }

  public lockBudgetReservation(taskId: number): Promise<AffiliateBudgetReservationRecord | null> {
    assert(taskId === this.taskId, "expiry attempted to lock a non-marker reservation");
    return this.inner.lockBudgetReservation(taskId);
  }

  public markTaskEnded(input: {
    taskId: number;
    expectedStatus: "scheduled" | "active" | "paused" | "budget_exhausted";
    endedAt: Date;
  }): Promise<void> {
    assert(input.taskId === this.taskId, "expiry attempted to end a non-marker task");
    return this.inner.markTaskEnded(input);
  }

  public recordBudgetRelease(input: {
    taskId: number;
    reservationId: number;
    releasedAfterNdp: number;
    platformFeeReleasedAfterNdp: number;
    reservationStatus: "active" | "released" | "exhausted";
    releasedAt: Date | null;
  }): Promise<void> {
    assert(input.taskId === this.taskId, "expiry attempted to release a non-marker task");
    return this.inner.recordBudgetRelease(input);
  }

  public createBudgetTransactionLink(input: {
    reservationId: number;
    ledgerTransactionId: number;
    kind: "release";
    amountNdp: number;
  }): Promise<void> {
    return this.inner.createBudgetTransactionLink(input);
  }

  public createAuditLog(input: {
    actorUserId: number | null;
    action: string;
    taskId: number;
    metadata?: unknown;
  }): Promise<void> {
    assert(input.taskId === this.taskId, "expiry attempted to audit a non-marker task");
    return this.inner.createAuditLog(input);
  }
}

class RollbackCompletedScenario extends Error {}

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const [
    { AffiliatePlatformFeeRepository },
    { AffiliateTaskRepository },
    { AffiliateTaskExpiryRepository },
    { AffiliateCheckoutRepository },
    { LedgerRepository },
    { AuditLogRepository },
    { AffiliatePlatformFeeService },
    { AffiliateTaskService },
    { AffiliateTaskExpiryService },
    { AffiliateCheckoutService },
    { AffiliateLinkTokenService },
    { LedgerService },
    { AuditLogService },
    { createFormalTestUser },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/affiliate-platform-fee.repository"),
    import("../src/repositories/affiliate-task.repository"),
    import("../src/repositories/affiliate-task-expiry.repository"),
    import("../src/repositories/affiliate-checkout.repository"),
    import("../src/repositories/ledger.repository"),
    import("../src/repositories/audit-log.repository"),
    import("../src/services/affiliate-platform-fee.service"),
    import("../src/services/affiliate-task.service"),
    import("../src/services/affiliate-task-expiry.service"),
    import("../src/services/affiliate-checkout.service"),
    import("../src/services/affiliate-link-token.service"),
    import("../src/services/ledger.service"),
    import("../src/services/audit-log.service"),
    import("./support/formal-test-user"),
    import("../src/prisma/client")
  ]);
  const marker = `affiliate-platform-fee-${Date.now()}-${process.pid}`;
  const baselineBefore = await captureBaseline(prisma);

  try {
    try {
      await prisma.$transaction(
        async (transaction: Prisma.TransactionClient) => {
          const transactionClient = transaction as unknown as PrismaClient;
          const passwordHash = await hash("AffiliatePlatformFee.2026!", 12);
          const createUser = (label: string) =>
            createFormalTestUser(transactionClient, {
              email: `${marker}-${label}@needo.test`,
              passwordHash,
              username: `${marker} ${label}`
            });
          const publisher = await createUser("publisher");
          const operator = await createUser("operator");
          const claimant = await createUser("claimant");
          const customer = await createUser("customer");
          const now = new Date();
          const later = new Date(now.getTime() + 2_000);
          const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
          const category = await transaction.category.create({
            data: { code: `${marker}-category`, name: `${marker} category` }
          });
          const shops = await Promise.all(
            ["settlement", "release"].map((label) =>
              transaction.shop.create({
                data: {
                  ownerUserId: publisher.id,
                  name: `${marker} ${label}`,
                  city: "Tokyo",
                  address: `${marker} local acceptance`,
                  status: "published"
                }
              })
            )
          );
          const [settlementShop, releaseShop] = shops;
          const services = await Promise.all(
            shops.map((shop, index) =>
              transaction.service.create({
                data: {
                  categoryId: category.id,
                  shopId: shop.id,
                  name: `${marker} service ${index + 1}`,
                  city: "Tokyo",
                  priceAmount: 8_800,
                  durationMinutes: 60,
                  status: "published"
                }
              })
            )
          );
          const merchantAccount = await transaction.merchantAccount.create({
            data: {
              code: `${marker}-merchant`,
              name: `${marker} merchant`,
              ownerUserId: publisher.id,
              status: "active"
            }
          });
          await Promise.all(
            shops.map((shop) =>
              transaction.merchantShopMembership.create({
                data: {
                  merchantAccountId: merchantAccount.id,
                  shopId: shop.id,
                  activeKey: `${marker}-membership-${shop.id}`,
                  startsAt: new Date(now.getTime() - 60_000),
                  createdById: publisher.id
                }
              })
            )
          );
          const settlementWallet = await transaction.wallet.create({
            data: {
              ownerType: "SHOP",
              ownerId: settlementShop.id,
              availableBalance: 5_000_000,
              frozenBalance: 0
            }
          });
          const releaseWallet = await transaction.wallet.create({
            data: {
              ownerType: "SHOP",
              ownerId: releaseShop.id,
              availableBalance: 5_000_000,
              frozenBalance: 0
            }
          });
          const merchantWallet = await transaction.wallet.create({
            data: {
              ownerType: "MERCHANT_ACCOUNT",
              ownerId: merchantAccount.id,
              availableBalance: 5_000_000,
              frozenBalance: 0
            }
          });

          const publisherActor = (shopId: number) => ({
            userId: publisher.id,
            email: publisher.email,
            accessTokenJti: `${marker}-publisher-${shopId}`,
            accessTokenExpiresAt: Math.floor(Date.now() / 1_000) + 900,
            currentIdentityId: 1,
            currentIdentityType: "merchant",
            currentIdentityScopeType: "shop",
            currentIdentityScopeId: shopId,
            roles: ["merchant_owner"],
            permissions: [
              "page:merchant-affiliate-task",
              "button:merchant-affiliate-task-create",
              "button:merchant-affiliate-task-submit"
            ]
          });
          const operatorActor = {
            ...publisherActor(settlementShop.id),
            userId: operator.id,
            email: operator.email,
            accessTokenJti: `${marker}-operator`,
            currentIdentityType: "operator",
            currentIdentityScopeType: "platform",
            currentIdentityScopeId: null,
            roles: ["operator"],
            permissions: [
              "page:backoffice-affiliate",
              "button:backoffice-affiliate-review",
              "page:backoffice-affiliate-fee-rule",
              "button:backoffice-affiliate-fee-rule-create"
            ]
          };
          const audit = new AuditLogService(new AuditLogRepository(transactionClient));
          const feeService = new AffiliatePlatformFeeService(
            new AffiliatePlatformFeeRepository(transaction),
            audit
          );
          const context = { ip: "127.0.0.1", userAgent: `${marker} checker` };
          const v1Input = (shopId: number) => ({
            scopeType: "shop" as const,
            shopId,
            feeBps: PLATFORM_FEE_BPS,
            expectedVersion: 0,
            effectiveFrom: new Date(now.getTime() - 60 * 60 * 1_000),
            reason: `${marker} initial 10 percent`
          });
          const settlementRuleV1 = await feeService.createRuleVersion(
            operatorActor,
            context,
            v1Input(settlementShop.id)
          );
          await feeService.createRuleVersion(operatorActor, context, v1Input(releaseShop.id));
          const ruleCountBeforeRetry = await transaction.affiliatePlatformFeeRule.count({
            where: { reason: { startsWith: marker } }
          });
          let ruleRetryRejected = false;
          try {
            await feeService.createRuleVersion(operatorActor, context, v1Input(settlementShop.id));
          } catch (error) {
            ruleRetryRejected =
              error instanceof AppError &&
              error.message === "error.affiliate.platform_fee_version_conflict";
          }
          assert(ruleRetryRejected, "fee rule retry did not return its stable version conflict");
          assert(
            (await transaction.affiliatePlatformFeeRule.count({
              where: { reason: { startsWith: marker } }
            })) === ruleCountBeforeRetry,
            "fee rule retry duplicated rule or audit state"
          );

          const ledger = new LedgerService(new LedgerRepository(transaction));
          let taskSequence = 0;
          const createTaskService = (clock: Date) =>
            new AffiliateTaskService(new AffiliateTaskRepository(transaction), ledger, {
              now: () => clock,
              createTaskCode: () => `${marker}-task-${++taskSequence}`,
              platformFeeService: feeService
            });
          const taskService = createTaskService(now);
          const taskInput = (input: {
            name: string;
            budget: number;
            shopId: number;
            serviceId: number;
            taskEndsAt?: Date;
          }) => ({
            publisherType: "shop" as const,
            name: `${marker} ${input.name}`,
            description: `${marker} ${input.name} formal content`,
            coverMediaAssetId: null,
            rewardNdpPerCompletedOrder: REWARD_NDP,
            totalBudgetNdp: input.budget,
            customerDiscountType: "none" as const,
            fixedDiscountJpy: 0,
            discountRateBps: 0,
            discountCapJpy: 0,
            minimumOrderAmountJpy: 0,
            claimStartsAt: new Date(now.getTime() - 60 * 60 * 1_000),
            claimEndsAt: input.taskEndsAt ?? endsAt,
            taskStartsAt: new Date(now.getTime() - 60 * 60 * 1_000),
            taskEndsAt: input.taskEndsAt ?? endsAt,
            attributionWindowDays: 30,
            maxCompletedOrdersPerClaim: null,
            maxCompletedOrdersPerCustomer: 1,
            serviceScopeMode: "selected_services" as const,
            selectedServiceIds: [input.serviceId]
          });
          const settlementDraft = await taskService.createDraft(
            publisherActor(settlementShop.id),
            taskInput({
              name: "settlement",
              budget: COMMISSION_BUDGET_NDP,
              shopId: settlementShop.id,
              serviceId: services[0].id
            })
          );
          const submitted = await taskService.submit(
            publisherActor(settlementShop.id),
            settlementDraft.id
          );
          const submittedRetry = await taskService.submit(
            publisherActor(settlementShop.id),
            settlementDraft.id
          );
          const walletAfterFreeze = await transaction.wallet.findUniqueOrThrow({
            where: { id: settlementWallet.id }
          });
          assert(
            submitted.id === submittedRetry.id &&
              submitted.platformFeeBps === PLATFORM_FEE_BPS &&
              submitted.platformFeeReserveNdp === PLATFORM_FEE_RESERVE_NDP &&
              submitted.reservedBudgetNdp === GROSS_RESERVE_NDP &&
              submitted.budgetReservation?.commissionFrozenNdp === COMMISSION_BUDGET_NDP &&
              submitted.budgetReservation.platformFeeFrozenNdp === PLATFORM_FEE_RESERVE_NDP &&
              walletAfterFreeze.availableBalance === 5_000_000 - GROSS_RESERVE_NDP &&
              walletAfterFreeze.frozenBalance === GROSS_RESERVE_NDP,
            "2,200,000 gross freeze did not reserve commission plus fee exactly once"
          );
          assert(
            (await transaction.ledgerTransaction.count({
              where: {
                type: "AFFILIATE_TASK_BUDGET_FREEZE",
                referenceType: "affiliate_task",
                referenceId: settlementDraft.id
              }
            })) === 1,
            "idempotent retries duplicated the task freeze ledger"
          );
          await taskService.approve(operatorActor, settlementDraft.id);

          const settlementRuleV2 = await feeService.createRuleVersion(operatorActor, context, {
            scopeType: "shop",
            shopId: settlementShop.id,
            feeBps: 1_200,
            expectedVersion: 1,
            effectiveFrom: new Date(now.getTime() + 1_000),
            reason: `${marker} later 12 percent`
          });
          const snapshottedTask = await transaction.affiliateTask.findUniqueOrThrow({
            where: { id: settlementDraft.id }
          });
          const effectiveLater = await feeService.resolveForTask([settlementShop.id], later);
          assert(
            settlementRuleV1.id !== settlementRuleV2.id &&
              effectiveLater.ruleId === settlementRuleV2.id &&
              effectiveLater.feeBps === 1_200 &&
              snapshottedTask.platformFeeRuleId === settlementRuleV1.id &&
              snapshottedTask.platformFeeBps === PLATFORM_FEE_BPS &&
              snapshottedTask.platformFeeReserveNdp === PLATFORM_FEE_RESERVE_NDP,
            "immutable shop override snapshot changed after a later rule version"
          );

          const laterTaskService = createTaskService(later);
          const mixedDraft = await laterTaskService.createDraft(publisherActor(settlementShop.id), {
            ...taskInput({
              name: "mixed rate merchant",
              budget: 100_000,
              shopId: settlementShop.id,
              serviceId: services[0].id
            }),
            publisherType: "merchant_account" as const,
            merchantAccountId: merchantAccount.id,
            shopIds: shops.map((shop) => shop.id),
            selectedServiceIds: services.map((service) => service.id)
          });
          const merchantBeforeMismatch = await transaction.wallet.findUniqueOrThrow({
            where: { id: merchantWallet.id }
          });
          let mixedRateRejected = false;
          try {
            await laterTaskService.submit(publisherActor(settlementShop.id), mixedDraft.id);
          } catch (error) {
            mixedRateRejected =
              error instanceof AppError &&
              error.message === "error.affiliate.platform_fee_rate_mismatch";
          }
          const merchantAfterMismatch = await transaction.wallet.findUniqueOrThrow({
            where: { id: merchantWallet.id }
          });
          assert(
            mixedRateRejected &&
              merchantAfterMismatch.availableBalance === merchantBeforeMismatch.availableBalance &&
              merchantAfterMismatch.frozenBalance === merchantBeforeMismatch.frozenBalance &&
              (await transaction.affiliateBudgetReservation.count({
                where: { taskId: mixedDraft.id }
              })) === 0,
            "mixed-rate pre-wallet rejection mutated the merchant wallet"
          );

          const linkTokens = new AffiliateLinkTokenService({
            secret: `${marker}-local-secret`,
            publicBaseUrl: "http://127.0.0.1:5180"
          });
          const issued = linkTokens.issue({
            taskId: settlementDraft.id,
            userId: claimant.id,
            expiresAt: endsAt
          });
          const claim = await transaction.affiliateClaim.create({
            data: {
              taskId: settlementDraft.id,
              userId: claimant.id,
              activeKey: `${settlementDraft.id}:${claimant.id}`,
              publicCode: `AFPF-${settlementDraft.id}-${claimant.id}`,
              publicTokenId: issued.publicTokenId,
              tokenHash: issued.tokenHash,
              status: "ACTIVE",
              expiresAt: endsAt
            }
          });
          const scheduledStartAt = new Date(now.getTime() + 2 * 60 * 60 * 1_000);
          const slot = await transaction.scheduleSlot.create({
            data: {
              serviceId: services[0].id,
              shopId: settlementShop.id,
              startsAt: scheduledStartAt,
              endsAt: new Date(scheduledStartAt.getTime() + 60 * 60 * 1_000),
              capacity: 1,
              status: "AVAILABLE"
            }
          });
          const booking = await transaction.bookingOrder.create({
            data: {
              orderNo: `AFPF${Date.now()}${process.pid}`.slice(0, 40),
              customerUserId: customer.id,
              serviceId: services[0].id,
              shopId: settlementShop.id,
              scheduleSlotId: slot.id,
              priceAmount: 8_800,
              startsAt: scheduledStartAt,
              endsAt: new Date(scheduledStartAt.getTime() + 60 * 60 * 1_000),
              serviceNameSnapshot: services[0].name,
              servicePriceSnapshot: 8_800,
              serviceDurationSnapshot: 60
            }
          });
          const affiliateCheckout = new AffiliateCheckoutService(
            new AffiliateCheckoutRepository(transaction),
            linkTokens,
            { now: () => now, rewardLedger: ledger }
          );
          const prepared = await affiliateCheckout.prepareCheckout({
            selector: { source: "code", value: claim.publicCode },
            customerUserId: customer.id,
            shopId: settlementShop.id,
            serviceId: services[0].id,
            originalPriceJpy: 8_800,
            scheduledStartAt,
            transactionClient: transaction
          });
          await affiliateCheckout.persistAttribution({
            bookingOrderId: booking.id,
            customerUserId: customer.id,
            shopId: settlementShop.id,
            serviceId: services[0].id,
            prepared,
            transactionClient: transaction
          });
          const platformBefore = await transaction.wallet.findUnique({
            where: {
              ownerType_ownerId_currency: {
                ownerType: "PLATFORM",
                ownerId: 1,
                currency: "NDP"
              }
            }
          });
          const settled = await affiliateCheckout.settleCompletedBooking({
            bookingOrderId: booking.id,
            customerUserId: customer.id,
            shopId: settlementShop.id,
            serviceId: services[0].id,
            actorUserId: customer.id,
            transactionClient: transaction
          });
          const settledRetry = await affiliateCheckout.settleCompletedBooking({
            bookingOrderId: booking.id,
            customerUserId: customer.id,
            shopId: settlementShop.id,
            serviceId: services[0].id,
            actorUserId: customer.id,
            transactionClient: transaction
          });
          assert(
            settled.status === "settled" &&
              !settled.idempotent &&
              settled.rewardNdp === REWARD_NDP &&
              settled.platformFeeNdp === PLATFORM_FEE_PER_REWARD_NDP &&
              settledRetry.status === "settled" &&
              settledRetry.idempotent,
            "idempotent retries did not return the settled reward snapshot"
          );
          const [
            publisherAfterSettlement,
            claimantWallet,
            platformAfter,
            taskAfter,
            reservationAfter
          ] = await Promise.all([
            transaction.wallet.findUniqueOrThrow({ where: { id: settlementWallet.id } }),
            transaction.wallet.findUniqueOrThrow({
              where: {
                ownerType_ownerId_currency: {
                  ownerType: "USER",
                  ownerId: claimant.id,
                  currency: "NDP"
                }
              }
            }),
            transaction.wallet.findUniqueOrThrow({
              where: {
                ownerType_ownerId_currency: {
                  ownerType: "PLATFORM",
                  ownerId: 1,
                  currency: "NDP"
                }
              }
            }),
            transaction.affiliateTask.findUniqueOrThrow({
              where: { id: settlementDraft.id }
            }),
            transaction.affiliateBudgetReservation.findUniqueOrThrow({
              where: { taskId: settlementDraft.id }
            })
          ]);
          assert(
            walletAfterFreeze.frozenBalance - publisherAfterSettlement.frozenBalance ===
              GROSS_REWARD_NDP,
            "11,000 gross capture did not debit the publisher frozen wallet"
          );
          assert(
            claimantWallet.availableBalance === REWARD_NDP,
            "10,000 claimant credit was not exact"
          );
          assert(
            platformAfter.availableBalance ===
              (platformBefore?.availableBalance ?? 0) + PLATFORM_FEE_PER_REWARD_NDP,
            "1,000 platform credit was not exact"
          );
          assert(
            taskAfter.settledBudgetNdp === REWARD_NDP &&
              taskAfter.settledPlatformFeeNdp === PLATFORM_FEE_PER_REWARD_NDP &&
              reservationAfter.capturedNdp === REWARD_NDP &&
              reservationAfter.platformFeeCapturedNdp === PLATFORM_FEE_PER_REWARD_NDP,
            "reward and reservation fee evidence did not match the three-wallet settlement"
          );
          const reward = await transaction.affiliateReward.findUniqueOrThrow({
            where: { attributionId: settled.attributionId }
          });
          const rewardLedgers = await transaction.ledgerTransaction.findMany({
            where: {
              type: "AFFILIATE_REWARD_SETTLEMENT",
              referenceType: "affiliate_reward",
              referenceId: reward.id
            },
            include: { entries: true, reconciliation: true }
          });
          assert(
            reward.platformFeeNdp === PLATFORM_FEE_PER_REWARD_NDP &&
              reward.platformWalletId === platformAfter.id &&
              rewardLedgers.length === 1 &&
              rewardLedgers[0].amount === GROSS_REWARD_NDP &&
              rewardLedgers[0].entries.length === 3 &&
              rewardLedgers[0].reconciliation?.differenceAmount === 0,
            "settlement ledger or reconciliation was duplicated or incomplete"
          );

          const rejectionDraft = await taskService.createDraft(
            publisherActor(releaseShop.id),
            taskInput({
              name: "rejection",
              budget: 20_000,
              shopId: releaseShop.id,
              serviceId: services[1].id
            })
          );
          const releaseWalletBeforeReject = await transaction.wallet.findUniqueOrThrow({
            where: { id: releaseWallet.id }
          });
          await taskService.submit(publisherActor(releaseShop.id), rejectionDraft.id);
          const rejected = await taskService.reject(
            operatorActor,
            rejectionDraft.id,
            `${marker} local rejection`
          );
          const rejectedRetry = await taskService.reject(
            operatorActor,
            rejectionDraft.id,
            `${marker} local rejection`
          );
          const releaseWalletAfterReject = await transaction.wallet.findUniqueOrThrow({
            where: { id: releaseWallet.id }
          });
          assert(
            rejected.id === rejectedRetry.id &&
              rejected.releasedBudgetNdp === 20_000 &&
              rejected.releasedPlatformFeeNdp === 2_000 &&
              rejected.budgetReservation?.releasedNdp === 20_000 &&
              rejected.budgetReservation.platformFeeReleasedNdp === 2_000 &&
              releaseWalletAfterReject.availableBalance ===
                releaseWalletBeforeReject.availableBalance &&
              releaseWalletAfterReject.frozenBalance === releaseWalletBeforeReject.frozenBalance,
            "rejection releases commission and fee did not restore the publisher wallet once"
          );

          const expiryEndsAt = new Date(now.getTime() + 60 * 60 * 1_000);
          const expiryDraft = await taskService.createDraft(
            publisherActor(releaseShop.id),
            taskInput({
              name: "expiry",
              budget: 30_000,
              shopId: releaseShop.id,
              serviceId: services[1].id,
              taskEndsAt: expiryEndsAt
            })
          );
          const releaseWalletBeforeExpiry = await transaction.wallet.findUniqueOrThrow({
            where: { id: releaseWallet.id }
          });
          await taskService.submit(publisherActor(releaseShop.id), expiryDraft.id);
          await taskService.approve(operatorActor, expiryDraft.id);
          const expiryService = new AffiliateTaskExpiryService(
            new FixtureOwnedAffiliateTaskExpiryRepository(
              new AffiliateTaskExpiryRepository(transaction),
              expiryDraft.id
            ),
            ledger
          );
          const expirySummary = await expiryService.expireDue({
            now: new Date(expiryEndsAt.getTime() + 1_000),
            batchSize: 100
          });
          const expiryRetry = await expiryService.expireDue({
            now: new Date(expiryEndsAt.getTime() + 2_000),
            batchSize: 100
          });
          const [expiredTask, expiredReservation, releaseWalletAfterExpiry] = await Promise.all([
            transaction.affiliateTask.findUniqueOrThrow({ where: { id: expiryDraft.id } }),
            transaction.affiliateBudgetReservation.findUniqueOrThrow({
              where: { taskId: expiryDraft.id }
            }),
            transaction.wallet.findUniqueOrThrow({ where: { id: releaseWallet.id } })
          ]);
          assert(
            expirySummary.scanned === 1 &&
              expirySummary.ended === 1 &&
              expirySummary.released === 1 &&
              expirySummary.releasedNdp === 33_000 &&
              expiryRetry.releasedNdp === 0 &&
              expiredTask.status === "ENDED" &&
              expiredTask.releasedBudgetNdp === 30_000 &&
              expiredTask.releasedPlatformFeeNdp === 3_000 &&
              expiredReservation.releasedNdp === 30_000 &&
              expiredReservation.platformFeeReleasedNdp === 3_000 &&
              releaseWalletAfterExpiry.availableBalance ===
                releaseWalletBeforeExpiry.availableBalance &&
              releaseWalletAfterExpiry.frozenBalance === releaseWalletBeforeExpiry.frozenBalance,
            "expiry releases commission and fee did not restore the publisher wallet once"
          );

          const markerTaskIds = await transaction.affiliateTask.findMany({
            where: { taskCode: { startsWith: marker } },
            select: { id: true }
          });
          const markerIds = markerTaskIds.map((task) => task.id);
          assert(
            (await transaction.auditLog.count({
              where: {
                OR: [
                  { targetType: "affiliate_task", targetId: { in: markerIds } },
                  { action: "backoffice.affiliate_platform_fee_rule.version_created" }
                ]
              }
            })) >= 9,
            "idempotent retries did not preserve complete audit evidence"
          );
          assert(
            (await transaction.financeReconciliation.count({
              where: {
                transaction: {
                  OR: [
                    { referenceType: "affiliate_task", referenceId: { in: markerIds } },
                    { referenceType: "affiliate_reward", referenceId: reward.id }
                  ]
                }
              }
            })) ===
              (await transaction.ledgerTransaction.count({
                where: {
                  OR: [
                    { referenceType: "affiliate_task", referenceId: { in: markerIds } },
                    { referenceType: "affiliate_reward", referenceId: reward.id }
                  ]
                }
              })),
            "idempotent retries left ledger transactions without reconciliation"
          );

          console.log(
            JSON.stringify(
              {
                database: databaseName,
                marker,
                freeze: {
                  commissionNdp: COMMISSION_BUDGET_NDP,
                  platformFeeNdp: PLATFORM_FEE_RESERVE_NDP,
                  grossNdp: GROSS_RESERVE_NDP
                },
                settlement: {
                  grossCapturedNdp: GROSS_REWARD_NDP,
                  claimantCreditNdp: REWARD_NDP,
                  platformCreditNdp: PLATFORM_FEE_PER_REWARD_NDP
                },
                rules: { initialBps: PLATFORM_FEE_BPS, laterBps: 1_200, immutable: true },
                releases: { rejection: true, expiry: true },
                idempotent: true,
                status: "ok"
              },
              null,
              2
            )
          );
          throw new RollbackCompletedScenario("rollback verified fixture");
        },
        { maxWait: 10_000, timeout: 120_000 }
      );
    } catch (error) {
      if (!(error instanceof RollbackCompletedScenario)) throw error;
    }

    await cleanupMarkerFixture(prisma, marker);
    const baselineAfterCleanup = await captureBaseline(prisma);
    assertExactBaseline(baselineBefore, baselineAfterCleanup);
    console.log("PASS exact cleanup baseline restored after transactional rollback");
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
