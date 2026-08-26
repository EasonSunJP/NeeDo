import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import type {
  AffiliateTaskExpiryFailureReporter,
  AffiliateTaskExpiryRepositoryPort,
  AffiliateTaskExpiryTaskRecord,
  AffiliateTaskExpiryTransactionClient
} from "../src/services/affiliate-task-expiry.service";
import type { AffiliateBudgetReservationRecord } from "../src/services/affiliate-task.service";
import { assertSafeAffiliateCompletionDatabase } from "./lib/assert-safe-affiliate-completion-database";

const REWARD_NDP = 500;
const SERVICE_PRICE_JPY = 8_800;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

class FixtureOwnedAffiliateTaskExpiryRepository implements AffiliateTaskExpiryRepositoryPort {
  public readonly listInputs: Array<{ now: Date; batchSize: number; afterTaskId: number }> = [];
  public lastRejectedTaskIds: number[] = [];
  public readonly transactionErrors: unknown[] = [];

  public constructor(
    private readonly delegate: AffiliateTaskExpiryRepositoryPort,
    private readonly allowedTaskIds: ReadonlySet<number>
  ) {}

  public async listExpiryCandidateTaskIds(input: {
    now: Date;
    batchSize: number;
    afterTaskId: number;
  }): Promise<number[]> {
    this.listInputs.push(input);
    const candidateTaskIds = await this.delegate.listExpiryCandidateTaskIds(input);
    this.lastRejectedTaskIds = candidateTaskIds.filter(
      (taskId) => !this.allowedTaskIds.has(taskId)
    );
    if (this.lastRejectedTaskIds.length > 0) {
      throw new Error(
        `fixture-owned expiry candidate allow-set rejected task: ${this.lastRejectedTaskIds.join(",")}`
      );
    }
    return candidateTaskIds;
  }

  public async runInTransaction<T>(
    handler: (
      repository: AffiliateTaskExpiryRepositoryPort,
      transactionClient?: AffiliateTaskExpiryTransactionClient
    ) => Promise<T>
  ): Promise<T> {
    try {
      return await this.delegate.runInTransaction(handler);
    } catch (error) {
      this.transactionErrors.push(error);
      throw error;
    }
  }

  public lockTask(taskId: number): Promise<AffiliateTaskExpiryTaskRecord | null> {
    return this.delegate.lockTask(taskId);
  }

  public lockBudgetReservation(taskId: number): Promise<AffiliateBudgetReservationRecord | null> {
    return this.delegate.lockBudgetReservation(taskId);
  }

  public markTaskEnded(
    input: Parameters<AffiliateTaskExpiryRepositoryPort["markTaskEnded"]>[0]
  ): Promise<void> {
    return this.delegate.markTaskEnded(input);
  }

  public recordBudgetRelease(
    input: Parameters<AffiliateTaskExpiryRepositoryPort["recordBudgetRelease"]>[0]
  ): Promise<void> {
    return this.delegate.recordBudgetRelease(input);
  }

  public createBudgetTransactionLink(
    input: Parameters<AffiliateTaskExpiryRepositoryPort["createBudgetTransactionLink"]>[0]
  ): Promise<void> {
    return this.delegate.createBudgetTransactionLink(input);
  }

  public createAuditLog(
    input: Parameters<AffiliateTaskExpiryRepositoryPort["createAuditLog"]>[0]
  ): Promise<void> {
    return this.delegate.createAuditLog(input);
  }
}

const isRetryableDeadlock = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown; message?: unknown };
  };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const metaCode = typeof candidate.meta?.code === "string" ? candidate.meta.code : "";
  const message = [candidate.message, candidate.meta?.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return code === "P2034" || metaCode === "1213" || /deadlock|1213|40001/i.test(message);
};

const sameDate = (left: Date | null, right: Date | null): boolean =>
  left?.getTime() === right?.getTime();

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeAffiliateCompletionDatabase();
  const [
    { AffiliateCheckoutRepository },
    { AffiliateCheckoutService },
    { AffiliateLinkTokenService },
    { AffiliateTaskExpiryRepository },
    { AffiliateTaskExpiryService },
    { BookingRepository },
    { BookingService },
    { LedgerRepository },
    { LedgerService },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/affiliate-checkout.repository"),
    import("../src/services/affiliate-checkout.service"),
    import("../src/services/affiliate-link-token.service"),
    import("../src/repositories/affiliate-task-expiry.repository"),
    import("../src/services/affiliate-task-expiry.service"),
    import("../src/repositories/booking.repository"),
    import("../src/services/booking.service"),
    import("../src/repositories/ledger.repository"),
    import("../src/services/ledger.service"),
    import("../src/prisma/client")
  ]);

  const marker = `affiliate-task-expiry-${Date.now()}-${process.pid}`;
  const allowedTaskIds = new Set<number>();
  const taskIds: number[] = [];
  const claimIds: number[] = [];
  const slotIds: number[] = [];
  const bookingIds: number[] = [];
  const userIds: number[] = [];
  const walletIds: number[] = [];
  const ledgerTransactionIds: number[] = [];
  let categoryId: number | null = null;
  let shopId: number | null = null;
  let serviceId: number | null = null;
  let result: Record<string, unknown> | null = null;

  try {
    const now = new Date();
    const taskStartsAt = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const dueAt = new Date(now.getTime() - 60_000);
    const futureAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
    const passwordHash = await hash("AffiliateExpiryAcceptance.2026!", 12);
    const createUser = async (label: string) => {
      const user = await prisma.user.create({
        data: {
          email: `${marker}-${label}@needo.test`,
          username: `${marker} ${label}`,
          passwordHash
        }
      });
      userIds.push(user.id);
      return user;
    };

    const publisher = await createUser("publisher");
    const claimantPartial = await createUser("claimant-partial");
    const claimantZero = await createUser("claimant-zero");
    const claimantIncremental = await createUser("claimant-incremental");
    const claimantCompletionRace = await createUser("claimant-completion-race");
    const claimantCancellationRace = await createUser("claimant-cancellation-race");
    const customerPartialSettled = await createUser("customer-partial-settled");
    const customerPartialActive = await createUser("customer-partial-active");
    const customerZero = await createUser("customer-zero");
    const customerIncremental = await createUser("customer-incremental");
    const customerCompletionRace = await createUser("customer-completion-race");
    const customerCancellationRace = await createUser("customer-cancellation-race");

    const category = await prisma.category.create({
      data: { code: `${marker}-category`, name: `${marker} category` }
    });
    categoryId = category.id;
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: publisher.id,
        name: `${marker} shop`,
        city: "Tokyo",
        address: "Local affiliate expiry cross-flow acceptance",
        status: "published",
        pricingMode: "MERCHANT"
      }
    });
    shopId = shop.id;
    const service = await prisma.service.create({
      data: {
        categoryId: category.id,
        shopId: shop.id,
        name: `${marker} service`,
        city: "Tokyo",
        priceAmount: SERVICE_PRICE_JPY,
        durationMinutes: 60,
        status: "published"
      }
    });
    serviceId = service.id;
    const publisherWallet = await prisma.wallet.create({
      data: { ownerType: "SHOP", ownerId: shop.id, availableBalance: 1_000, frozenBalance: 0 }
    });
    walletIds.push(publisherWallet.id);

    const linkTokens = new AffiliateLinkTokenService({
      secret: process.env.AFFILIATE_LINK_SECRET || "",
      publicBaseUrl: process.env.AFFILIATE_PUBLIC_BASE_URL || ""
    });
    const ledger = new LedgerService(new LedgerRepository(prisma));
    const affiliateCheckout = new AffiliateCheckoutService(
      new AffiliateCheckoutRepository(prisma),
      linkTokens,
      { rewardLedger: ledger }
    );
    const booking = new BookingService(
      new BookingRepository(prisma),
      ledger,
      undefined,
      undefined,
      affiliateCheckout
    );
    const guardedRepository = new FixtureOwnedAffiliateTaskExpiryRepository(
      new AffiliateTaskExpiryRepository(prisma),
      allowedTaskIds
    );
    const createExpiry = (reportFailure?: AffiliateTaskExpiryFailureReporter) =>
      new AffiliateTaskExpiryService(guardedRepository, ledger, reportFailure);

    type TaskFixture = {
      task: { id: number };
      claim: { id: number; publicCode: string } | null;
    };
    const createTask = async (input: {
      label: string;
      totalBudgetNdp: number;
      claimantUserId?: number;
      allowed?: boolean;
      endsAt?: Date;
    }): Promise<TaskFixture> => {
      const task = await prisma.$transaction(async (transaction) => {
        const created = await transaction.affiliateTask.create({
          data: {
            taskCode: `${marker}-${input.label}`,
            lineageKey: `${marker}-${input.label}`,
            publisherType: "SHOP",
            publisherShopId: shop.id,
            name: `${marker} ${input.label}`,
            rewardNdpPerCompletedOrder: REWARD_NDP,
            totalBudgetNdp: input.totalBudgetNdp,
            reservedBudgetNdp: input.totalBudgetNdp,
            customerDiscountType: "NONE",
            claimStartsAt: taskStartsAt,
            claimEndsAt: futureAt,
            taskStartsAt,
            taskEndsAt: input.endsAt ?? futureAt,
            attributionWindowDays: 14,
            serviceScopeMode: "SELECTED_SERVICES",
            status: "ACTIVE",
            reviewedById: publisher.id,
            reviewedAt: now,
            submittedAt: now,
            activatedAt: now,
            shops: { create: { shopId: shop.id, shopNameSnapshot: shop.name } },
            services: {
              create: {
                shopId: shop.id,
                serviceId: service.id,
                serviceNameSnapshot: service.name,
                servicePriceJpySnapshot: SERVICE_PRICE_JPY
              }
            },
            budgetReservation: {
              create: {
                walletId: publisherWallet.id,
                totalFrozenNdp: input.totalBudgetNdp,
                idempotencyKey: `${marker}-${input.label}-reservation`
              }
            }
          }
        });
        await transaction.wallet.update({
          where: { id: publisherWallet.id },
          data: { frozenBalance: { increment: input.totalBudgetNdp } }
        });
        return created;
      });
      taskIds.push(task.id);
      if (input.allowed !== false) allowedTaskIds.add(task.id);
      if (input.claimantUserId === undefined) return { task, claim: null };

      const issued = linkTokens.issue({
        taskId: task.id,
        userId: input.claimantUserId,
        expiresAt: futureAt
      });
      const claim = await prisma.affiliateClaim.create({
        data: {
          taskId: task.id,
          userId: input.claimantUserId,
          activeKey: `${task.id}:${input.claimantUserId}`,
          publicCode: `NDO-${task.id}-${input.label}`.slice(0, 40).toUpperCase(),
          publicTokenId: issued.publicTokenId,
          tokenHash: issued.tokenHash,
          status: "ACTIVE",
          expiresAt: futureAt
        }
      });
      claimIds.push(claim.id);
      return { task, claim };
    };

    let slotOffsetMinutes = 10;
    const actor = (userId: number) => ({ userId, roles: ["customer"] });
    const createAttributedOrder = async (fixture: TaskFixture, customerUserId: number) => {
      assert(fixture.claim !== null, "createAttributedOrder requires a real AffiliateClaim");
      const startsAt = new Date(now.getTime() + slotOffsetMinutes * 60_000);
      slotOffsetMinutes += 90;
      const slot = await prisma.scheduleSlot.create({
        data: {
          serviceId: service.id,
          shopId: shop.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * 60 * 1_000),
          capacity: 1,
          status: "AVAILABLE"
        }
      });
      slotIds.push(slot.id);
      const order = await booking.createBooking(actor(customerUserId), {
        serviceId: service.id,
        scheduleSlotId: slot.id,
        fulfillmentMode: "store",
        affiliateCode: fixture.claim.publicCode
      });
      bookingIds.push(order.id);
      const attribution = await prisma.affiliateAttribution.findFirstOrThrow({
        where: { bookingOrderId: order.id, deletedAt: null }
      });
      assert(
        attribution.status === "ATTRIBUTED" &&
          attribution.activeKey === `booking:${order.id}` &&
          attribution.rewardAllocatedNdp === REWARD_NDP,
        "real AffiliateAttribution fixture was not ATTRIBUTED"
      );
      return { order, attribution };
    };

    const settleCompletedBooking = (bookingOrderId: number, customerUserId: number) =>
      prisma.$transaction((transaction) =>
        affiliateCheckout.settleCompletedBooking({
          bookingOrderId,
          customerUserId,
          shopId: shop.id,
          serviceId: service.id,
          actorUserId: customerUserId,
          transactionClient: transaction
        })
      );
    const invalidateCancelledBooking = (bookingOrderId: number, customerUserId: number) =>
      prisma.$transaction((transaction) =>
        affiliateCheckout.invalidateCancelledBooking({
          bookingOrderId,
          actorUserId: customerUserId,
          transactionClient: transaction
        })
      );
    const makeDue = (taskId: number) =>
      prisma.affiliateTask.update({ where: { id: taskId }, data: { taskEndsAt: dueAt } });
    const budgetState = async (taskId: number) => {
      const [task, reservation] = await Promise.all([
        prisma.affiliateTask.findUniqueOrThrow({ where: { id: taskId } }),
        prisma.affiliateBudgetReservation.findUniqueOrThrow({ where: { taskId } })
      ]);
      assert(
        task.totalBudgetNdp === task.reservedBudgetNdp &&
          task.totalBudgetNdp === reservation.totalFrozenNdp &&
          task.allocatedBudgetNdp === reservation.allocatedNdp &&
          task.settledBudgetNdp === reservation.capturedNdp &&
          task.releasedBudgetNdp === reservation.releasedNdp,
        "Task/Reservation equality is incorrect"
      );
      return { task, reservation };
    };
    const drainExpiry = async (batchSize = 2) => {
      const expiry = createExpiry();
      const total = { scanned: 0, ended: 0, released: 0, failed: 0, releasedNdp: 0 };
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const summary = await expiry.expireDue({ now, batchSize });
        total.scanned += summary.scanned;
        total.ended += summary.ended;
        total.released += summary.released;
        total.failed += summary.failed;
        total.releasedNdp += summary.releasedNdp;
        if (summary.scanned === 0) return total;
      }
      throw new Error("expiry drain exceeded bounded attempts");
    };

    // deliberately NOT allowed due sentinel
    const sentinel = await createTask({
      label: "refusal-sentinel",
      totalBudgetNdp: REWARD_NDP,
      allowed: false,
      endsAt: dueAt
    });
    const [sentinelTaskBefore, sentinelReservationBefore, sentinelWalletBefore] = await Promise.all(
      [
        prisma.affiliateTask.findUniqueOrThrow({ where: { id: sentinel.task.id } }),
        prisma.affiliateBudgetReservation.findUniqueOrThrow({
          where: { taskId: sentinel.task.id }
        }),
        prisma.wallet.findUniqueOrThrow({ where: { id: publisherWallet.id } })
      ]
    );
    const sentinelLedgerBefore = await prisma.ledgerTransaction.count({
      where: { referenceType: "affiliate_task", referenceId: sentinel.task.id }
    });
    const sentinelAuditBefore = await prisma.auditLog.count({
      where: { targetType: "affiliate_task", targetId: sentinel.task.id }
    });
    let sentinelRefusedBeforeMutation = false;
    try {
      await createExpiry().expireDue({ now, batchSize: 500 });
    } catch (error) {
      sentinelRefusedBeforeMutation =
        error instanceof Error &&
        error.message.includes("fixture-owned expiry candidate allow-set rejected task") &&
        guardedRepository.lastRejectedTaskIds.includes(sentinel.task.id);
    }
    assert(sentinelRefusedBeforeMutation, "due sentinel was not rejected by the real query guard");
    const [sentinelTaskAfter, sentinelReservationAfter, sentinelWalletAfter] = await Promise.all([
      prisma.affiliateTask.findUniqueOrThrow({ where: { id: sentinel.task.id } }),
      prisma.affiliateBudgetReservation.findUniqueOrThrow({
        where: { taskId: sentinel.task.id }
      }),
      prisma.wallet.findUniqueOrThrow({ where: { id: publisherWallet.id } })
    ]);
    assert(
      sentinelTaskAfter.status === sentinelTaskBefore.status &&
        sameDate(sentinelTaskAfter.endedAt, sentinelTaskBefore.endedAt) &&
        sentinelTaskAfter.releasedBudgetNdp === sentinelTaskBefore.releasedBudgetNdp &&
        sentinelReservationAfter.status === sentinelReservationBefore.status &&
        sentinelReservationAfter.allocatedNdp === sentinelReservationBefore.allocatedNdp &&
        sentinelReservationAfter.capturedNdp === sentinelReservationBefore.capturedNdp &&
        sentinelReservationAfter.releasedNdp === sentinelReservationBefore.releasedNdp &&
        sentinelWalletAfter.availableBalance === sentinelWalletBefore.availableBalance &&
        sentinelWalletAfter.frozenBalance === sentinelWalletBefore.frozenBalance &&
        (await prisma.ledgerTransaction.count({
          where: { referenceType: "affiliate_task", referenceId: sentinel.task.id }
        })) === sentinelLedgerBefore &&
        (await prisma.auditLog.count({
          where: { targetType: "affiliate_task", targetId: sentinel.task.id }
        })) === sentinelAuditBefore,
      "sentinel refusal mutated fixture state"
    );
    await prisma.affiliateTask.update({
      where: { id: sentinel.task.id },
      data: { taskEndsAt: futureAt }
    });

    // fully unallocated due task
    const fullyUnallocated = await createTask({
      label: "fully-unallocated",
      totalBudgetNdp: 1_000
    });
    // partially allocated and captured due task
    const partial = await createTask({
      label: "partial-real-attribution",
      totalBudgetNdp: 2_000,
      claimantUserId: claimantPartial.id
    });
    const partialSettledOrder = await createAttributedOrder(partial, customerPartialSettled.id);
    const partialActiveOrder = await createAttributedOrder(partial, customerPartialActive.id);
    const partialSettlement = await settleCompletedBooking(
      partialSettledOrder.order.id,
      customerPartialSettled.id
    );
    assert(partialSettlement.status === "settled", "partial fixture was not formally SETTLED");

    const zeroUnallocated = await createTask({
      label: "zero-unallocated",
      totalBudgetNdp: REWARD_NDP,
      claimantUserId: claimantZero.id
    });
    const zeroOrder = await createAttributedOrder(zeroUnallocated, customerZero.id);
    const zeroSettlement = await settleCompletedBooking(zeroOrder.order.id, customerZero.id);
    assert(
      zeroSettlement.status === "settled",
      "zero-unallocated fixture was not formally SETTLED"
    );
    await Promise.all([
      makeDue(fullyUnallocated.task.id),
      makeDue(partial.task.id),
      makeDue(zeroUnallocated.task.id)
    ]);

    const walletBeforeExpiry = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const initialSummary = await drainExpiry(2);
    const walletAfterInitialExpiry = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    assert(
      initialSummary.scanned === 3 &&
        initialSummary.ended === 3 &&
        initialSummary.released === 2 &&
        initialSummary.failed === 0 &&
        initialSummary.releasedNdp === 2_000,
      "initial expiry batch summary is incorrect"
    );
    assert(
      walletAfterInitialExpiry.availableBalance - walletBeforeExpiry.availableBalance === 2_000 &&
        walletAfterInitialExpiry.frozenBalance - walletBeforeExpiry.frozenBalance === -2_000,
      "initial expiry wallet delta is incorrect"
    );

    const fullState = await budgetState(fullyUnallocated.task.id);
    const partialState = await budgetState(partial.task.id);
    const zeroState = await budgetState(zeroUnallocated.task.id);
    const partialActiveAttribution = await prisma.affiliateAttribution.findUniqueOrThrow({
      where: { id: partialActiveOrder.attribution.id }
    });
    assert(
      fullState.task.status === "ENDED" &&
        fullState.task.endedAt !== null &&
        fullState.task.totalBudgetNdp === 1_000 &&
        fullState.task.reservedBudgetNdp === 1_000 &&
        fullState.task.allocatedBudgetNdp === 0 &&
        fullState.task.settledBudgetNdp === 0 &&
        fullState.task.releasedBudgetNdp === 1_000 &&
        fullState.reservation.totalFrozenNdp === 1_000 &&
        fullState.reservation.allocatedNdp === 0 &&
        fullState.reservation.capturedNdp === 0 &&
        fullState.reservation.releasedNdp === 1_000 &&
        fullState.reservation.status === "RELEASED",
      "fully unallocated due task did not end and release its full budget"
    );
    assert(
      partialState.task.status === "ENDED" &&
        partialState.task.endedAt !== null &&
        partialState.task.totalBudgetNdp === 2_000 &&
        partialState.task.reservedBudgetNdp === 2_000 &&
        partialState.task.allocatedBudgetNdp === REWARD_NDP &&
        partialState.task.settledBudgetNdp === REWARD_NDP &&
        partialState.task.releasedBudgetNdp === 1_000 &&
        partialState.reservation.totalFrozenNdp === 2_000 &&
        partialState.reservation.allocatedNdp === REWARD_NDP &&
        partialState.reservation.capturedNdp === REWARD_NDP &&
        partialState.reservation.releasedNdp === 1_000 &&
        partialActiveAttribution.status === "ATTRIBUTED" &&
        partialActiveAttribution.activeKey !== null,
      "partially allocated and captured due task did not preserve real attribution"
    );
    assert(
      zeroState.task.status === "ENDED" &&
        zeroState.task.endedAt !== null &&
        zeroState.task.totalBudgetNdp === REWARD_NDP &&
        zeroState.task.allocatedBudgetNdp === 0 &&
        zeroState.task.settledBudgetNdp === REWARD_NDP &&
        zeroState.task.releasedBudgetNdp === 0 &&
        zeroState.reservation.totalFrozenNdp === REWARD_NDP &&
        zeroState.reservation.allocatedNdp === 0 &&
        zeroState.reservation.capturedNdp === REWARD_NDP &&
        zeroState.reservation.releasedNdp === 0 &&
        zeroState.reservation.status === "RELEASED" &&
        (await prisma.ledgerTransaction.count({
          where: {
            type: "AFFILIATE_TASK_BUDGET_RELEASE",
            referenceType: "affiliate_task",
            referenceId: zeroUnallocated.task.id,
            deletedAt: null
          }
        })) === 0,
      "zero-unallocated task did not create an empty release ledger transaction"
    );

    // ended task later incremental release
    const laterIncremental = await createTask({
      label: "later-incremental-real-attribution",
      totalBudgetNdp: 1_200,
      claimantUserId: claimantIncremental.id
    });
    const incrementalOrder = await createAttributedOrder(laterIncremental, customerIncremental.id);
    await makeDue(laterIncremental.task.id);
    const walletBeforeIncrementalExpiry = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const firstIncrementalSummary = await drainExpiry();
    const firstIncrementalState = await budgetState(laterIncremental.task.id);
    const endedAtBeforeCancellation = firstIncrementalState.task.endedAt;
    const walletAfterFirstIncrementalExpiry = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    assert(
      firstIncrementalSummary.scanned === 1 &&
        firstIncrementalSummary.releasedNdp === 700 &&
        firstIncrementalState.task.status === "ENDED" &&
        endedAtBeforeCancellation !== null &&
        firstIncrementalState.task.allocatedBudgetNdp === REWARD_NDP &&
        firstIncrementalState.task.settledBudgetNdp === 0 &&
        firstIncrementalState.task.releasedBudgetNdp === 700 &&
        firstIncrementalState.reservation.allocatedNdp === REWARD_NDP &&
        firstIncrementalState.reservation.capturedNdp === 0 &&
        firstIncrementalState.reservation.releasedNdp === 700 &&
        walletAfterFirstIncrementalExpiry.availableBalance -
          walletBeforeIncrementalExpiry.availableBalance ===
          700 &&
        walletAfterFirstIncrementalExpiry.frozenBalance -
          walletBeforeIncrementalExpiry.frozenBalance ===
          -700,
      "first incremental expiry did not preserve the actual ATTRIBUTED row"
    );
    const walletBeforeFormalCancellation = walletAfterFirstIncrementalExpiry;
    await invalidateCancelledBooking(incrementalOrder.order.id, customerIncremental.id);
    const [incrementalInvalidated, walletAfterFormalCancellation] = await Promise.all([
      prisma.affiliateAttribution.findUniqueOrThrow({
        where: { id: incrementalOrder.attribution.id }
      }),
      prisma.wallet.findUniqueOrThrow({ where: { id: publisherWallet.id } })
    ]);
    assert(
      incrementalInvalidated.status === "INVALIDATED" &&
        incrementalInvalidated.activeKey === null &&
        incrementalInvalidated.invalidationReason === "booking_cancelled" &&
        walletAfterFormalCancellation.availableBalance ===
          walletBeforeFormalCancellation.availableBalance &&
        walletAfterFormalCancellation.frozenBalance ===
          walletBeforeFormalCancellation.frozenBalance,
      "formal cancellation did not invalidate the later incremental attribution"
    );
    const walletBeforeSecondIncrementalExpiry = walletAfterFormalCancellation;
    const secondIncrementalSummary = await drainExpiry();
    const incrementalState = await budgetState(laterIncremental.task.id);
    const walletAfterIncrementalExpiry = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    assert(
      secondIncrementalSummary.scanned === 1 &&
        secondIncrementalSummary.ended === 0 &&
        secondIncrementalSummary.releasedNdp === REWARD_NDP &&
        incrementalState.task.status === "ENDED" &&
        sameDate(incrementalState.task.endedAt, endedAtBeforeCancellation) &&
        incrementalState.task.totalBudgetNdp === 1_200 &&
        incrementalState.task.allocatedBudgetNdp === 0 &&
        incrementalState.task.settledBudgetNdp === 0 &&
        incrementalState.task.releasedBudgetNdp === 1_200 &&
        incrementalState.reservation.allocatedNdp === 0 &&
        incrementalState.reservation.capturedNdp === 0 &&
        incrementalState.reservation.releasedNdp === 1_200 &&
        incrementalState.reservation.status === "RELEASED" &&
        walletAfterIncrementalExpiry.availableBalance -
          walletBeforeSecondIncrementalExpiry.availableBalance ===
          REWARD_NDP &&
        walletAfterIncrementalExpiry.frozenBalance -
          walletBeforeSecondIncrementalExpiry.frozenBalance ===
          -REWARD_NDP,
      "ended task later incremental release did not preserve cumulative budget state or immutable endedAt"
    );
    const incrementalReleaseLedgers = await prisma.ledgerTransaction.findMany({
      where: {
        type: "AFFILIATE_TASK_BUDGET_RELEASE",
        referenceType: "affiliate_task",
        referenceId: laterIncremental.task.id,
        deletedAt: null
      },
      orderBy: { id: "asc" }
    });
    assert(
      incrementalReleaseLedgers.length === 2 &&
        incrementalReleaseLedgers[0].amount === 700 &&
        incrementalReleaseLedgers[0].idempotencyKey ===
          `affiliate-task:${laterIncremental.task.id}:expiry-release:to:700` &&
        incrementalReleaseLedgers[1].amount === REWARD_NDP &&
        incrementalReleaseLedgers[1].idempotencyKey ===
          `affiliate-task:${laterIncremental.task.id}:expiry-release:to:1200` &&
        new Set(incrementalReleaseLedgers.map((row) => row.idempotencyKey)).size === 2,
      "incremental cumulative release keys or ledger uniqueness are incorrect"
    );

    const completionRaceFixture = await createTask({
      label: "completion-race",
      totalBudgetNdp: 1_500,
      claimantUserId: claimantCompletionRace.id
    });
    const completionRaceOrder = await createAttributedOrder(
      completionRaceFixture,
      customerCompletionRace.id
    );
    await makeDue(completionRaceFixture.task.id);
    const completionPublisherBefore = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const completionExpiryFailures: Array<{ taskId: number; code: number; message: string }> = [];
    const completionTransactionErrorStart = guardedRepository.transactionErrors.length;
    const completionRuns = await Promise.allSettled([
      createExpiry((failure) => completionExpiryFailures.push(failure)).expireDue({
        now,
        batchSize: 500
      }),
      settleCompletedBooking(completionRaceOrder.order.id, customerCompletionRace.id)
    ]);
    assert(completionRuns[0].status === "fulfilled", "completion expiry race scan rejected");
    let completionExpirySummary = completionRuns[0].value;
    let completionFormalResult =
      completionRuns[1].status === "fulfilled" ? completionRuns[1].value : null;
    let completionDeadlockRetries = 0;
    const completionExpiryWasDeadlock = completionExpirySummary.failed === 1;
    const completionFormalWasDeadlock = completionRuns[1].status === "rejected";
    assert(
      !(completionExpiryWasDeadlock && completionFormalWasDeadlock),
      "completion expiry race lost both operations"
    );
    if (completionExpiryWasDeadlock) {
      const raceError = guardedRepository.transactionErrors[completionTransactionErrorStart];
      assert(
        completionExpiryFailures.length === 1 && isRetryableDeadlock(raceError),
        "completion expiry race failed for a non-deadlock reason"
      );
      const rollbackTask = await prisma.affiliateTask.findUniqueOrThrow({
        where: { id: completionRaceFixture.task.id }
      });
      assert(
        rollbackTask.endedAt === null &&
          (await prisma.ledgerTransaction.count({
            where: {
              type: "AFFILIATE_TASK_BUDGET_RELEASE",
              referenceType: "affiliate_task",
              referenceId: completionRaceFixture.task.id
            }
          })) === 0 &&
          (await prisma.auditLog.count({
            where: {
              targetType: "affiliate_task",
              targetId: completionRaceFixture.task.id,
              action: "affiliate.task.expired"
            }
          })) === 0,
        "completion expiry deadlock victim did not roll back"
      );
      completionExpirySummary = await createExpiry().expireDue({ now, batchSize: 500 });
      completionDeadlockRetries += 1;
    }
    if (completionFormalWasDeadlock) {
      assert(
        isRetryableDeadlock(completionRuns[1].reason),
        "completion race formal operation failed for a non-deadlock reason"
      );
      const rollbackAttribution = await prisma.affiliateAttribution.findUniqueOrThrow({
        where: { id: completionRaceOrder.attribution.id }
      });
      assert(
        rollbackAttribution.status === "ATTRIBUTED" &&
          (await prisma.affiliateReward.count({
            where: { attributionId: completionRaceOrder.attribution.id, deletedAt: null }
          })) === 0 &&
          (await prisma.wallet.count({
            where: {
              ownerType: "USER",
              ownerId: claimantCompletionRace.id,
              currency: "NDP"
            }
          })) === 0,
        "completion formal deadlock victim did not roll back"
      );
      completionFormalResult = await settleCompletedBooking(
        completionRaceOrder.order.id,
        customerCompletionRace.id
      );
      completionDeadlockRetries += 1;
    }
    assert(
      completionExpirySummary.failed === 0 && completionFormalResult?.status === "settled",
      "completion expiry race did not finish both formal operations"
    );
    const completionState = await budgetState(completionRaceFixture.task.id);
    const completionAttribution = await prisma.affiliateAttribution.findUniqueOrThrow({
      where: { id: completionRaceOrder.attribution.id }
    });
    const completionReward = await prisma.affiliateReward.findUniqueOrThrow({
      where: { attributionId: completionAttribution.id },
      include: { transactions: true }
    });
    const completionSettlementLedger = await prisma.ledgerTransaction.findFirstOrThrow({
      where: {
        type: "AFFILIATE_REWARD_SETTLEMENT",
        referenceType: "affiliate_reward",
        referenceId: completionReward.id,
        deletedAt: null
      },
      include: { entries: true, reconciliation: true, affiliateBudgetTransactions: true }
    });
    const completionClaimantWallet = await prisma.wallet.findUniqueOrThrow({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: claimantCompletionRace.id,
          currency: "NDP"
        }
      }
    });
    walletIds.push(completionClaimantWallet.id);
    const completionPublisherAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const completionEndedAt = completionState.task.endedAt;
    assert(
      completionAttribution.status === "SETTLED" &&
        completionReward.status === "SETTLED" &&
        completionReward.rewardNdp === REWARD_NDP &&
        completionReward.transactions.length === 1 &&
        completionReward.transactions[0].kind === "SETTLEMENT" &&
        completionState.task.status === "ENDED" &&
        completionEndedAt !== null &&
        completionState.task.allocatedBudgetNdp === 0 &&
        completionState.task.settledBudgetNdp === REWARD_NDP &&
        completionState.task.releasedBudgetNdp === 1_000 &&
        completionState.reservation.allocatedNdp === 0 &&
        completionState.reservation.capturedNdp === REWARD_NDP &&
        completionState.reservation.releasedNdp === 1_000 &&
        completionPublisherAfter.availableBalance - completionPublisherBefore.availableBalance ===
          1_000 &&
        completionPublisherAfter.frozenBalance - completionPublisherBefore.frozenBalance ===
          -1_500 &&
        completionClaimantWallet.availableBalance === REWARD_NDP &&
        completionSettlementLedger.entries.length === 2 &&
        completionSettlementLedger.reconciliation?.differenceAmount === 0 &&
        completionSettlementLedger.affiliateBudgetTransactions.length === 1 &&
        completionSettlementLedger.affiliateBudgetTransactions[0].kind === "SETTLEMENT" &&
        completionPublisherBefore.availableBalance + completionPublisherBefore.frozenBalance ===
          completionPublisherAfter.availableBalance +
            completionPublisherAfter.frozenBalance +
            completionClaimantWallet.availableBalance,
      "completion expiry race violated reward uniqueness or wallet conservation"
    );
    assert(
      completionState.reservation.status === "RELEASED",
      "completion expiry race left the exhausted reservation non-RELEASED"
    );
    const completionReleaseLedgers = await prisma.ledgerTransaction.findMany({
      where: {
        type: "AFFILIATE_TASK_BUDGET_RELEASE",
        referenceType: "affiliate_task",
        referenceId: completionRaceFixture.task.id,
        deletedAt: null
      }
    });
    assert(
      completionReleaseLedgers.length === 1 &&
        completionReleaseLedgers[0].amount === 1_000 &&
        completionReleaseLedgers[0].idempotencyKey ===
          `affiliate-task:${completionRaceFixture.task.id}:expiry-release:to:1000`,
      "completion expiry race release key or ledger uniqueness is incorrect"
    );

    const cancellationRaceFixture = await createTask({
      label: "cancellation-race",
      totalBudgetNdp: 1_500,
      claimantUserId: claimantCancellationRace.id
    });
    const cancellationRaceOrder = await createAttributedOrder(
      cancellationRaceFixture,
      customerCancellationRace.id
    );
    await makeDue(cancellationRaceFixture.task.id);
    const cancellationWalletBefore = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const cancellationExpiryFailures: Array<{ taskId: number; code: number; message: string }> = [];
    const cancellationTransactionErrorStart = guardedRepository.transactionErrors.length;
    const cancellationRuns = await Promise.allSettled([
      createExpiry((failure) => cancellationExpiryFailures.push(failure)).expireDue({
        now,
        batchSize: 500
      }),
      invalidateCancelledBooking(cancellationRaceOrder.order.id, customerCancellationRace.id)
    ]);
    assert(cancellationRuns[0].status === "fulfilled", "cancellation expiry race scan rejected");
    let cancellationExpirySummary = cancellationRuns[0].value;
    let cancellationDeadlockRetries = 0;
    const cancellationExpiryWasDeadlock = cancellationExpirySummary.failed === 1;
    const cancellationFormalWasDeadlock = cancellationRuns[1].status === "rejected";
    assert(
      !(cancellationExpiryWasDeadlock && cancellationFormalWasDeadlock),
      "cancellation expiry race lost both operations"
    );
    if (cancellationExpiryWasDeadlock) {
      const raceError = guardedRepository.transactionErrors[cancellationTransactionErrorStart];
      assert(
        cancellationExpiryFailures.length === 1 && isRetryableDeadlock(raceError),
        "cancellation expiry race failed for a non-deadlock reason"
      );
      const rollbackTask = await prisma.affiliateTask.findUniqueOrThrow({
        where: { id: cancellationRaceFixture.task.id }
      });
      assert(
        rollbackTask.endedAt === null &&
          (await prisma.ledgerTransaction.count({
            where: {
              type: "AFFILIATE_TASK_BUDGET_RELEASE",
              referenceType: "affiliate_task",
              referenceId: cancellationRaceFixture.task.id
            }
          })) === 0,
        "cancellation expiry deadlock victim did not roll back"
      );
      cancellationExpirySummary = await createExpiry().expireDue({ now, batchSize: 500 });
      cancellationDeadlockRetries += 1;
    }
    if (cancellationFormalWasDeadlock) {
      assert(
        isRetryableDeadlock(cancellationRuns[1].reason),
        "cancellation race formal operation failed for a non-deadlock reason"
      );
      const rollbackAttribution = await prisma.affiliateAttribution.findUniqueOrThrow({
        where: { id: cancellationRaceOrder.attribution.id }
      });
      assert(
        rollbackAttribution.status === "ATTRIBUTED" &&
          rollbackAttribution.activeKey !== null &&
          (await prisma.auditLog.count({
            where: {
              action: "affiliate.attribution.invalidated",
              targetType: "booking_order",
              targetId: cancellationRaceOrder.order.id
            }
          })) === 0,
        "cancellation formal deadlock victim did not roll back"
      );
      await invalidateCancelledBooking(cancellationRaceOrder.order.id, customerCancellationRace.id);
      cancellationDeadlockRetries += 1;
    }
    assert(cancellationExpirySummary.failed === 0, "cancellation expiry race did not end task");
    const cancellationEndedState = await budgetState(cancellationRaceFixture.task.id);
    const cancellationEndedAt = cancellationEndedState.task.endedAt;
    assert(cancellationEndedAt !== null, "cancellation expiry race did not record endedAt");
    const laterCancellationSummary = await drainExpiry();
    const cancellationState = await budgetState(cancellationRaceFixture.task.id);
    const cancellationAttribution = await prisma.affiliateAttribution.findUniqueOrThrow({
      where: { id: cancellationRaceOrder.attribution.id }
    });
    const cancellationWalletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const cancellationReleaseLedgers = await prisma.ledgerTransaction.findMany({
      where: {
        type: "AFFILIATE_TASK_BUDGET_RELEASE",
        referenceType: "affiliate_task",
        referenceId: cancellationRaceFixture.task.id,
        deletedAt: null
      }
    });
    assert(
      cancellationAttribution.status === "INVALIDATED" &&
        cancellationAttribution.activeKey === null &&
        cancellationAttribution.invalidationReason === "booking_cancelled" &&
        cancellationState.task.status === "ENDED" &&
        sameDate(cancellationState.task.endedAt, cancellationEndedAt) &&
        cancellationState.task.allocatedBudgetNdp === 0 &&
        cancellationState.task.settledBudgetNdp === 0 &&
        cancellationState.task.releasedBudgetNdp === 1_500 &&
        cancellationState.reservation.allocatedNdp === 0 &&
        cancellationState.reservation.capturedNdp === 0 &&
        cancellationState.reservation.releasedNdp === 1_500 &&
        cancellationState.reservation.status === "RELEASED" &&
        cancellationWalletAfter.availableBalance - cancellationWalletBefore.availableBalance ===
          1_500 &&
        cancellationWalletAfter.frozenBalance - cancellationWalletBefore.frozenBalance === -1_500 &&
        cancellationReleaseLedgers.length >= 1 &&
        cancellationReleaseLedgers.length <= 2 &&
        cancellationReleaseLedgers.reduce((sum, row) => sum + row.amount, 0) === 1_500 &&
        cancellationReleaseLedgers.some(
          (row) =>
            row.idempotencyKey ===
            `affiliate-task:${cancellationRaceFixture.task.id}:expiry-release:to:1500`
        ) &&
        new Set(cancellationReleaseLedgers.map((row) => row.idempotencyKey)).size ===
          cancellationReleaseLedgers.length &&
        laterCancellationSummary.failed === 0,
      "cancellation expiry race violated cumulative release, conservation, or immutable endedAt"
    );

    const concurrent = await createTask({
      label: "expiry-vs-expiry-concurrent",
      totalBudgetNdp: 1_000,
      endsAt: dueAt
    });
    const concurrentWalletBefore = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const concurrentRuns = await Promise.allSettled([
      createExpiry().expireDue({ now, batchSize: 500 }),
      createExpiry().expireDue({ now, batchSize: 500 })
    ]);
    assert(
      concurrentRuns.every((run) => run.status === "fulfilled") &&
        concurrentRuns.reduce(
          (sum, run) => sum + (run.status === "fulfilled" ? run.value.releasedNdp : 0),
          0
        ) === 1_000,
      "concurrent expireDue calls did not produce exactly one release"
    );
    const concurrentState = await budgetState(concurrent.task.id);
    const concurrentWalletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    assert(
      concurrentState.task.status === "ENDED" &&
        concurrentState.task.endedAt !== null &&
        concurrentState.task.totalBudgetNdp === 1_000 &&
        concurrentState.task.reservedBudgetNdp === 1_000 &&
        concurrentState.task.allocatedBudgetNdp === 0 &&
        concurrentState.task.settledBudgetNdp === 0 &&
        concurrentState.task.releasedBudgetNdp === 1_000 &&
        concurrentState.reservation.totalFrozenNdp === 1_000 &&
        concurrentState.reservation.allocatedNdp === 0 &&
        concurrentState.reservation.capturedNdp === 0 &&
        concurrentState.reservation.releasedNdp === 1_000 &&
        concurrentState.reservation.status === "RELEASED" &&
        concurrentWalletAfter.availableBalance - concurrentWalletBefore.availableBalance ===
          1_000 &&
        concurrentWalletAfter.frozenBalance - concurrentWalletBefore.frozenBalance === -1_000,
      "concurrent expiry wallet delta is incorrect"
    );

    const markerRewards = await prisma.affiliateReward.findMany({
      where: { taskId: { in: taskIds }, deletedAt: null },
      select: { id: true }
    });
    const markerRewardIds = markerRewards.map((row) => row.id);
    const releaseTransactions = await prisma.ledgerTransaction.findMany({
      where: {
        type: "AFFILIATE_TASK_BUDGET_RELEASE",
        referenceType: "affiliate_task",
        referenceId: { in: taskIds },
        deletedAt: null
      },
      include: { entries: true, reconciliation: true, affiliateBudgetTransactions: true }
    });
    const settlementTransactions = await prisma.ledgerTransaction.findMany({
      where: {
        type: "AFFILIATE_REWARD_SETTLEMENT",
        referenceType: "affiliate_reward",
        referenceId: { in: markerRewardIds },
        deletedAt: null
      },
      include: {
        entries: true,
        reconciliation: true,
        affiliateBudgetTransactions: true,
        affiliateRewardTransactions: true
      }
    });
    ledgerTransactionIds.push(
      ...releaseTransactions.map((transaction) => transaction.id),
      ...settlementTransactions.map((transaction) => transaction.id)
    );
    assert(
      releaseTransactions.length >= 7 &&
        releaseTransactions.length <= 8 &&
        releaseTransactions.every(
          (transaction) =>
            transaction.actorUserId === null &&
            transaction.entries.length === 1 &&
            transaction.entries[0].availableDelta === transaction.amount &&
            transaction.entries[0].frozenDelta === -transaction.amount &&
            transaction.entries[0].reason === "affiliate_task_budget_release" &&
            transaction.reconciliation?.differenceAmount === 0 &&
            transaction.affiliateBudgetTransactions.length === 1 &&
            transaction.affiliateBudgetTransactions[0].kind === "RELEASE" &&
            transaction.affiliateBudgetTransactions[0].amountNdp === transaction.amount
        ),
      "affiliate_task_budget_release LedgerTransaction, WalletLedger, FinanceReconciliation, or budget links are incomplete"
    );
    assert(
      settlementTransactions.length === 3 &&
        settlementTransactions.every(
          (transaction) =>
            transaction.entries.length === 2 &&
            transaction.reconciliation?.differenceAmount === 0 &&
            transaction.affiliateBudgetTransactions.length === 1 &&
            transaction.affiliateBudgetTransactions[0].kind === "SETTLEMENT" &&
            transaction.affiliateRewardTransactions.length === 1 &&
            transaction.affiliateRewardTransactions[0].kind === "SETTLEMENT"
        ),
      "AffiliateRewardTransaction or formal settlement finance evidence is incomplete"
    );

    const auditRows = await prisma.auditLog.findMany({
      where: {
        deletedAt: null,
        OR: [
          { actorId: { in: userIds } },
          { targetType: "affiliate_task", targetId: { in: taskIds } },
          { targetType: "ledger_transaction", targetId: { in: ledgerTransactionIds } }
        ]
      }
    });
    assert(
      auditRows.filter((row) => row.actorId === null && row.action === "affiliate.task.expired")
        .length === 7 &&
        auditRows.filter(
          (row) => row.actorId === null && row.action === "affiliate.task.expiry_budget_released"
        ).length === releaseTransactions.length &&
        auditRows.filter(
          (row) => row.actorId === null && row.action === "ledger.affiliate_task_budget.release"
        ).length === releaseTransactions.length &&
        auditRows.filter((row) => row.action === "affiliate.attribution.created").length === 6 &&
        auditRows.filter((row) => row.action === "affiliate.reward.settled").length === 3 &&
        auditRows.filter((row) => row.action === "affiliate.attribution.invalidated").length ===
          2 &&
        auditRows.filter((row) => row.action === "ledger.affiliate_reward.settlement").length === 3,
      "null system audits or formal attribution/reward/cancellation audits are incomplete"
    );

    const releaseCountBeforeRepeat = releaseTransactions.length;
    const repeatedSummary = await drainExpiry();
    const completionAfterRepeat = await prisma.affiliateTask.findUniqueOrThrow({
      where: { id: completionRaceFixture.task.id }
    });
    assert(
      repeatedSummary.scanned === 0 &&
        repeatedSummary.ended === 0 &&
        repeatedSummary.released === 0 &&
        repeatedSummary.failed === 0 &&
        repeatedSummary.releasedNdp === 0 &&
        sameDate(completionAfterRepeat.endedAt, completionEndedAt) &&
        (await prisma.ledgerTransaction.count({
          where: {
            type: "AFFILIATE_TASK_BUDGET_RELEASE",
            referenceType: "affiliate_task",
            referenceId: { in: taskIds },
            deletedAt: null
          }
        })) === releaseCountBeforeRepeat,
      "repeated expiry execution was not idempotent"
    );
    assert(
      guardedRepository.listInputs.some((input) => input.afterTaskId > 0),
      "guarded production query did not cover keyset cursor pages"
    );
    assert(
      completionState.task.totalBudgetNdp ===
        completionState.task.settledBudgetNdp + completionState.task.releasedBudgetNdp &&
        cancellationState.task.totalBudgetNdp === cancellationState.task.releasedBudgetNdp,
      "cross-flow final budget conservation is incorrect"
    );

    result = {
      database: databaseName,
      isolation: {
        sentinelRefusedBeforeMutation,
        guardedQueries: guardedRepository.listInputs.length,
        keysetPages: true
      },
      attributionPreservation: {
        partialActive: partialActiveAttribution.status === "ATTRIBUTED",
        laterIncremental: incrementalInvalidated.status === "INVALIDATED"
      },
      completionRace: {
        settled: completionAttribution.status === "SETTLED",
        deadlockRetries: completionDeadlockRetries
      },
      cancellationRace: {
        invalidated: cancellationAttribution.status === "INVALIDATED",
        releaseTransactions: cancellationReleaseLedgers.length,
        deadlockRetries: cancellationDeadlockRetries
      },
      expiry: {
        full: true,
        partial: true,
        laterIncremental: true,
        zeroRelease: true,
        exactlyOneConcurrentRelease: true,
        repeatIdempotent: true
      },
      finance: {
        releaseTransactions: releaseTransactions.length,
        settlementTransactions: settlementTransactions.length,
        reconciled: true,
        audited: true
      },
      cleanup: "pending",
      status: "ok"
    };
  } finally {
    await prisma.$transaction(async (transaction) => {
      const markerTasks = await transaction.affiliateTask.findMany({
        where: { taskCode: { startsWith: marker } },
        select: { id: true }
      });
      for (const task of markerTasks) {
        if (!taskIds.includes(task.id)) taskIds.push(task.id);
      }
      const markerBookings = await transaction.bookingOrder.findMany({
        where: {
          customerUserId: { in: userIds },
          ...(shopId === null ? {} : { shopId })
        },
        select: { id: true, scheduleSlotId: true }
      });
      for (const booking of markerBookings) {
        if (!bookingIds.includes(booking.id)) bookingIds.push(booking.id);
        if (!slotIds.includes(booking.scheduleSlotId)) slotIds.push(booking.scheduleSlotId);
      }
      const rewards = await transaction.affiliateReward.findMany({
        where: { taskId: { in: taskIds } },
        select: { id: true }
      });
      const rewardIds = rewards.map((row) => row.id);
      const linkedLedgerRows = await transaction.ledgerTransaction.findMany({
        where: {
          OR: [
            {
              type: "AFFILIATE_TASK_BUDGET_RELEASE",
              referenceType: "affiliate_task",
              referenceId: { in: taskIds }
            },
            {
              type: "AFFILIATE_REWARD_SETTLEMENT",
              referenceType: "affiliate_reward",
              referenceId: { in: rewardIds }
            }
          ]
        },
        select: { id: true }
      });
      for (const row of linkedLedgerRows) {
        if (!ledgerTransactionIds.includes(row.id)) ledgerTransactionIds.push(row.id);
      }

      if (taskIds.length > 0 || bookingIds.length > 0 || ledgerTransactionIds.length > 0) {
        await transaction.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: userIds } },
              { targetType: "affiliate_task", targetId: { in: taskIds } },
              { targetType: "booking_order", targetId: { in: bookingIds } },
              { targetType: "ledger_transaction", targetId: { in: ledgerTransactionIds } }
            ]
          }
        });
      }
      if (rewardIds.length > 0) {
        await transaction.affiliateRewardTransaction.deleteMany({
          where: { rewardId: { in: rewardIds } }
        });
      }
      if (ledgerTransactionIds.length > 0) {
        await transaction.affiliateBudgetTransaction.deleteMany({
          where: { ledgerTransactionId: { in: ledgerTransactionIds } }
        });
        await transaction.financeReconciliation.deleteMany({
          where: { transactionId: { in: ledgerTransactionIds } }
        });
        await transaction.walletLedger.deleteMany({
          where: { transactionId: { in: ledgerTransactionIds } }
        });
      }
      if (taskIds.length > 0) {
        await transaction.affiliateRiskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateReward.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateAttribution.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateTouch.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateClaim.deleteMany({ where: { taskId: { in: taskIds } } });
      }
      if (bookingIds.length > 0) {
        await transaction.orderStatusHistory.deleteMany({
          where: { bookingOrderId: { in: bookingIds } }
        });
        await transaction.bookingOrder.deleteMany({ where: { id: { in: bookingIds } } });
      }
      if (slotIds.length > 0) {
        await transaction.scheduleSlot.deleteMany({ where: { id: { in: slotIds } } });
      }
      if (taskIds.length > 0) {
        await transaction.affiliateBudgetReservation.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTaskService.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateTaskShop.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateTask.deleteMany({ where: { id: { in: taskIds } } });
      }
      if (ledgerTransactionIds.length > 0) {
        await transaction.ledgerTransaction.deleteMany({
          where: { id: { in: ledgerTransactionIds } }
        });
      }
      const markerWallets = await transaction.wallet.findMany({
        where: {
          OR: [
            { id: { in: walletIds } },
            { ownerType: "USER", ownerId: { in: userIds } },
            ...(shopId === null ? [] : [{ ownerType: "SHOP" as const, ownerId: shopId }])
          ]
        },
        select: { id: true }
      });
      if (markerWallets.length > 0) {
        await transaction.wallet.deleteMany({
          where: { id: { in: markerWallets.map((row) => row.id) } }
        });
      }
      if (serviceId !== null) await transaction.service.deleteMany({ where: { id: serviceId } });
      if (shopId !== null) await transaction.shop.deleteMany({ where: { id: shopId } });
      if (categoryId !== null) await transaction.category.deleteMany({ where: { id: categoryId } });
      if (userIds.length > 0) {
        await transaction.user.deleteMany({ where: { id: { in: userIds } } });
      }
    });

    const cleanupCounts = await Promise.all([
      prisma.user.count({ where: { email: { startsWith: marker } } }),
      prisma.shop.count({ where: { name: { startsWith: marker } } }),
      prisma.category.count({ where: { code: { startsWith: marker } } }),
      prisma.service.count({ where: { name: { startsWith: marker } } }),
      prisma.affiliateTask.count({ where: { taskCode: { startsWith: marker } } }),
      prisma.affiliateClaim.count({ where: { id: { in: claimIds } } }),
      prisma.affiliateTouch.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateAttribution.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateReward.count({ where: { taskId: { in: taskIds } } }),
      prisma.bookingOrder.count({ where: { id: { in: bookingIds } } }),
      prisma.scheduleSlot.count({ where: { id: { in: slotIds } } }),
      prisma.affiliateBudgetReservation.count({ where: { taskId: { in: taskIds } } }),
      prisma.ledgerTransaction.count({ where: { id: { in: ledgerTransactionIds } } }),
      prisma.auditLog.count({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { targetType: "affiliate_task", targetId: { in: taskIds } },
            { targetType: "booking_order", targetId: { in: bookingIds } },
            { targetType: "ledger_transaction", targetId: { in: ledgerTransactionIds } }
          ]
        }
      })
    ]);
    assert(
      cleanupCounts.every((count) => count === 0),
      "marker cleanup left affiliate expiry rows behind"
    );
    await disconnectPrisma();
  }

  assert(result !== null, "affiliate expiry acceptance did not complete");
  console.log(JSON.stringify({ ...result, cleanup: "exact" }));
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
