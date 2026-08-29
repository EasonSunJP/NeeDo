import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import type { AffiliateTaskExpiryFailureReporter } from "../src/services/affiliate-task-expiry.service";
import { assertSafeAffiliateCompletionDatabase } from "./lib/assert-safe-affiliate-completion-database";
import {
  FixtureOwnedAffiliateTaskExpiryRepository,
  requireSuccessfulExpirySummary,
  resolveProductionRaceOutcome
} from "./lib/affiliate-expiry-acceptance-guard";
import {
  affiliateRiskEventWhere,
  assertExactBaselinePrefix,
  assertTimestampOrder,
  assertTimestampWithinRace,
  type RaceTimestamp
} from "./lib/affiliate-expiry-race-evidence";

const REWARD_NDP = 500;
const BOOKING_FEE_NDP = 100;
const SERVICE_PRICE_JPY = 8_800;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
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
    { FeeRuleRepository },
    { FeeCalculationService },
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
    import("../src/repositories/fee-rule.repository"),
    import("../src/services/fee-calculation.service"),
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
  let feeRuleSetId: number | null = null;
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
    const feeRuleSet = await prisma.platformFeeRuleSet.create({
      data: {
        name: `${marker} booking fee`,
        status: "active",
        priority: -2_000_000_000,
        effectiveFrom: taskStartsAt,
        createdById: publisher.id,
        updatedById: publisher.id,
        rules: {
          create: [
            {
              feeType: "b_platform_fee",
              orderType: "booking",
              payerType: "shop",
              baseAmountNdp: BOOKING_FEE_NDP,
              priority: -2_000_000_000,
              conditionJson: { shopIds: [shop.id], serviceIds: [service.id] },
              status: "active",
              createdById: publisher.id,
              updatedById: publisher.id
            },
            {
              feeType: "user_reward",
              orderType: "booking",
              payerType: "platform",
              baseAmountNdp: 0,
              priority: -2_000_000_000,
              conditionJson: { shopIds: [shop.id], serviceIds: [service.id] },
              status: "active",
              createdById: publisher.id,
              updatedById: publisher.id
            }
          ]
        }
      },
      include: { rules: { orderBy: { id: "asc" } } }
    });
    feeRuleSetId = feeRuleSet.id;
    const bookingFeeRule = feeRuleSet.rules.find((rule) => rule.feeType === "b_platform_fee");
    const userRewardRule = feeRuleSet.rules.find((rule) => rule.feeType === "user_reward");
    assert(bookingFeeRule !== undefined, "marker booking fee rule was not created");
    assert(userRewardRule !== undefined, "marker user reward rule was not created");
    const bookingFeeRuleKey = `rule_set:${feeRuleSet.id}:rule:${bookingFeeRule.id}`;
    const userRewardRuleKey = `rule_set:${feeRuleSet.id}:rule:${userRewardRule.id}`;
    const ledger = new LedgerService(
      new LedgerRepository(prisma),
      new FeeCalculationService(new FeeRuleRepository(prisma))
    );
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
    const runRaceExpiry = async (
      failures: Array<{ taskId: number; code: number; message: string }>,
      expiryNow = now
    ) => {
      const transactionErrorStart = guardedRepository.transactionErrors.length;
      const failureStart = failures.length;
      const summary = await createExpiry((failure) => failures.push(failure)).expireDue({
        now: expiryNow,
        batchSize: 500
      });
      if (summary.failed !== 0) {
        const raceErrors = guardedRepository.transactionErrors.slice(transactionErrorStart);
        assert(
          summary.failed === 1 && failures.length - failureStart === 1 && raceErrors.length === 1,
          "expiry race did not expose exactly one rejected transaction"
        );
        throw raceErrors[0];
      }
      return requireSuccessfulExpirySummary(summary);
    };

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
    const advanceToInService = async (customerUserId: number, bookingOrderId: number) => {
      await booking.transitionOrder(actor(customerUserId), bookingOrderId, "confirm");
      return booking.transitionOrder(actor(customerUserId), bookingOrderId, "start");
    };
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
    const exactJson = (value: unknown): string => JSON.stringify(value);
    const assertExact = (actual: unknown, expected: unknown, message: string): void => {
      assert(exactJson(actual) === exactJson(expected), message);
    };
    type RaceBounds = { raceStartedAt: Date; raceSettledAt: Date };
    const withoutFields = (value: object, fields: readonly string[]): Record<string, unknown> => {
      const omitted = new Set(fields);
      return Object.fromEntries(Object.entries(value).filter(([field]) => !omitted.has(field)));
    };
    const assertBoundedRowChanges = (
      baseline: object,
      actual: object,
      changes: Record<string, unknown>,
      timestampFields: readonly string[],
      separatelyAssertedFields: readonly string[],
      bounds: RaceBounds,
      message: string
    ): void => {
      const ignoredFields = [...timestampFields, ...separatelyAssertedFields];
      assertExact(
        withoutFields(actual, ignoredFields),
        withoutFields({ ...baseline, ...changes }, ignoredFields),
        message
      );
      const actualRecord = actual as Record<string, RaceTimestamp>;
      for (const timestampField of timestampFields) {
        assertTimestampWithinRace(
          actualRecord[timestampField],
          bounds.raceStartedAt,
          bounds.raceSettledAt,
          `${message} ${timestampField}`
        );
      }
    };
    const assertCreatedTimestamps = (
      row: { createdAt: Date; updatedAt: Date },
      bounds: RaceBounds,
      label: string
    ): void => {
      assertTimestampWithinRace(
        row.createdAt,
        bounds.raceStartedAt,
        bounds.raceSettledAt,
        `${label} createdAt`
      );
      assertTimestampWithinRace(
        row.updatedAt,
        bounds.raceStartedAt,
        bounds.raceSettledAt,
        `${label} updatedAt`
      );
      assertTimestampOrder(row.createdAt, row.updatedAt, label);
    };
    const assertTimelineAppend = (
      baselineTimeline: unknown,
      actualTimeline: unknown,
      expectedEvent: Record<string, unknown>,
      bounds: RaceBounds,
      label: string
    ): void => {
      assert(Array.isArray(baselineTimeline), `${label} baseline timeline is not an array`);
      const baselineRows = baselineTimeline;
      assert(Array.isArray(actualTimeline), `${label} timeline is not an array`);
      assertExactBaselinePrefix(baselineRows, actualTimeline, `${label} timeline`);
      assert(actualTimeline.length === baselineRows.length + 1, `${label} timeline count changed`);
      const newEvent = actualTimeline[baselineRows.length];
      assert(
        typeof newEvent === "object" && newEvent !== null,
        `${label} timeline event is missing`
      );
      const { recordedAt, ...eventFields } = newEvent as Record<string, unknown>;
      assertExact(eventFields, expectedEvent, `${label} timeline event changed`);
      assertTimestampWithinRace(
        typeof recordedAt === "string" ? recordedAt : null,
        bounds.raceStartedAt,
        bounds.raceSettledAt,
        `${label} timeline recordedAt`
      );
    };
    const expectedFeeEvidence = (input: {
      feeType: "b_platform_fee" | "user_reward";
      stage: "capture";
      calculationLogId: number;
      bookingOrderId: number;
    }) => {
      const isBookingFee = input.feeType === "b_platform_fee";
      const amount = isBookingFee ? BOOKING_FEE_NDP : 0;
      const ruleKey = isBookingFee ? bookingFeeRuleKey : userRewardRuleKey;
      const payerType = isBookingFee ? "shop" : "platform";
      const payerId = isBookingFee ? shop.id : null;
      const explanation = [
        `Matched rule set: ${marker} booking fee`,
        `Base fee: ${amount} NDP`,
        `Final fee: ${amount} NDP`,
        `Hold amount: ${amount} NDP`
      ];
      return {
        bookingOrderId: input.bookingOrderId,
        orderType: "booking",
        stage: input.stage,
        feeType: input.feeType,
        payerType,
        payerId,
        baseFeeNdp: amount,
        tierAdjustmentNdp: 0,
        timeAdjustmentNdp: 0,
        campaignDiscountNdp: 0,
        finalFeeNdp: amount,
        holdAmountNdp: amount,
        completedOrderOrdinalInPeriod: null,
        appliedRuleIds: [ruleKey],
        explanation,
        calculationLogId: input.calculationLogId
      };
    };
    const expectedFeeMetadata = (
      evidence: ReturnType<typeof expectedFeeEvidence>
    ): Record<string, unknown> => ({
      feeType: evidence.feeType,
      stage: evidence.stage,
      payerType: evidence.payerType,
      payerId: evidence.payerId,
      baseFeeNdp: evidence.baseFeeNdp,
      tierAdjustmentNdp: evidence.tierAdjustmentNdp,
      timeAdjustmentNdp: evidence.timeAdjustmentNdp,
      campaignDiscountNdp: evidence.campaignDiscountNdp,
      finalFeeNdp: evidence.finalFeeNdp,
      holdAmountNdp: evidence.holdAmountNdp,
      completedOrderOrdinalInPeriod: evidence.completedOrderOrdinalInPeriod,
      appliedRuleIds: evidence.appliedRuleIds,
      explanation: evidence.explanation,
      calculationLogId: evidence.calculationLogId
    });
    const captureRaceSnapshot = async (input: {
      taskId: number;
      bookingOrderId: number;
      scheduleSlotId: number;
      claimId: number;
      attributionId: number;
      publisherWalletId: number;
      claimantUserId: number;
      customerUserId: number;
    }) => {
      const [
        bookingOrder,
        statusHistory,
        scheduleSlot,
        walletHolds,
        orderFinancial,
        feeCalculationLogs,
        affiliateTask,
        budgetReservation,
        publisherWallet,
        claimantWallet,
        customerWallet,
        affiliateClaim,
        attribution,
        affiliateRewards
      ] = await Promise.all([
        prisma.bookingOrder.findUniqueOrThrow({ where: { id: input.bookingOrderId } }),
        prisma.orderStatusHistory.findMany({
          where: { bookingOrderId: input.bookingOrderId },
          orderBy: { id: "asc" }
        }),
        prisma.scheduleSlot.findUniqueOrThrow({ where: { id: input.scheduleSlotId } }),
        prisma.walletHold.findMany({
          where: { bookingOrderId: input.bookingOrderId },
          orderBy: { id: "asc" }
        }),
        prisma.orderFinancial.findUniqueOrThrow({
          where: { bookingOrderId: input.bookingOrderId }
        }),
        prisma.feeCalculationLog.findMany({
          where: { bookingOrderId: input.bookingOrderId },
          orderBy: { id: "asc" }
        }),
        prisma.affiliateTask.findUniqueOrThrow({ where: { id: input.taskId } }),
        prisma.affiliateBudgetReservation.findUniqueOrThrow({ where: { taskId: input.taskId } }),
        prisma.wallet.findUniqueOrThrow({ where: { id: input.publisherWalletId } }),
        prisma.wallet.findUnique({
          where: {
            ownerType_ownerId_currency: {
              ownerType: "USER",
              ownerId: input.claimantUserId,
              currency: "NDP"
            }
          }
        }),
        prisma.wallet.findUnique({
          where: {
            ownerType_ownerId_currency: {
              ownerType: "USER",
              ownerId: input.customerUserId,
              currency: "NDP"
            }
          }
        }),
        prisma.affiliateClaim.findUniqueOrThrow({ where: { id: input.claimId } }),
        prisma.affiliateAttribution.findUniqueOrThrow({ where: { id: input.attributionId } }),
        prisma.affiliateReward.findMany({
          where: { attributionId: input.attributionId },
          include: { transactions: { orderBy: { id: "asc" } } },
          orderBy: { id: "asc" }
        })
      ]);
      const rewardIds = affiliateRewards.map((reward) => reward.id);
      const [bookingLedgers, affiliateLedgers, riskEvents] = await Promise.all([
        prisma.ledgerTransaction.findMany({
          where: {
            referenceType: "booking_order",
            referenceId: input.bookingOrderId
          },
          include: {
            entries: { orderBy: { id: "asc" } },
            reconciliation: true,
            affiliateBudgetTransactions: { orderBy: { id: "asc" } },
            affiliateRewardTransactions: { orderBy: { id: "asc" } }
          },
          orderBy: { id: "asc" }
        }),
        prisma.ledgerTransaction.findMany({
          where: {
            OR: [
              { referenceType: "affiliate_task", referenceId: input.taskId },
              ...(rewardIds.length === 0
                ? []
                : [{ referenceType: "affiliate_reward", referenceId: { in: rewardIds } }])
            ]
          },
          include: {
            entries: { orderBy: { id: "asc" } },
            reconciliation: true,
            affiliateBudgetTransactions: { orderBy: { id: "asc" } },
            affiliateRewardTransactions: { orderBy: { id: "asc" } }
          },
          orderBy: { id: "asc" }
        }),
        prisma.affiliateRiskEvent.findMany({
          where: affiliateRiskEventWhere({
            taskId: input.taskId,
            claimId: input.claimId,
            attributionId: input.attributionId,
            rewardIds
          }),
          orderBy: { id: "asc" }
        })
      ]);
      const ledgerIds = [...bookingLedgers, ...affiliateLedgers].map((ledgerRow) => ledgerRow.id);
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          OR: [
            { actorId: input.customerUserId },
            { targetType: "affiliate_task", targetId: input.taskId },
            { targetType: "booking_order", targetId: input.bookingOrderId },
            ...(ledgerIds.length === 0
              ? []
              : [{ targetType: "ledger_transaction", targetId: { in: ledgerIds } }])
          ]
        },
        orderBy: { id: "asc" }
      });
      return {
        bookingOrder,
        statusHistory,
        scheduleSlot,
        walletHolds,
        orderFinancial,
        feeCalculationLogs,
        bookingLedgers,
        affiliateTask,
        budgetReservation,
        publisherWallet,
        claimantWallet,
        customerWallet,
        affiliateClaim,
        attribution,
        affiliateRewards,
        affiliateLedgers,
        riskEvents,
        auditLogs
      };
    };
    type RaceSnapshot = Awaited<ReturnType<typeof captureRaceSnapshot>>;
    type RaceSnapshotInput = Parameters<typeof captureRaceSnapshot>[0];
    const assertBaselineAuditRowsPreserved = (
      baseline: RaceSnapshot,
      actual: RaceSnapshot,
      message: string
    ): void => {
      assertExactBaselinePrefix(baseline.auditLogs, actual.auditLogs, message);
    };
    const assertCreatedWallet = (
      baselineWallet: RaceSnapshot["claimantWallet"],
      wallet: RaceSnapshot["claimantWallet"],
      ownerId: number,
      availableBalance: number,
      bounds: RaceBounds,
      message: string
    ): void => {
      assert(
        baselineWallet === null &&
          wallet !== null &&
          wallet.ownerType === "USER" &&
          wallet.ownerId === ownerId &&
          wallet.currency === "NDP" &&
          wallet.id > 0 &&
          wallet.availableBalance === availableBalance &&
          wallet.frozenBalance === 0 &&
          wallet.deletedAt === null,
        message
      );
      assertCreatedTimestamps(wallet, bounds, message);
    };
    const assertExpiryWinner = (
      baseline: RaceSnapshot,
      actual: RaceSnapshot,
      input: RaceSnapshotInput,
      bounds: RaceBounds
    ): void => {
      const releaseAmount =
        baseline.budgetReservation.totalFrozenNdp -
        baseline.budgetReservation.allocatedNdp -
        baseline.budgetReservation.capturedNdp -
        baseline.budgetReservation.releasedNdp;
      assert(releaseAmount > 0, "expiry race baseline had no releasable budget");
      assertBoundedRowChanges(
        baseline.affiliateTask,
        actual.affiliateTask,
        {
          status: "ENDED",
          lockVersion: baseline.affiliateTask.lockVersion + 1,
          releasedBudgetNdp: baseline.affiliateTask.releasedBudgetNdp + releaseAmount
        },
        ["endedAt", "updatedAt"],
        [],
        bounds,
        "expiry winner was not fully committed: task"
      );
      assertTimestampOrder(
        actual.affiliateTask.endedAt,
        actual.affiliateTask.updatedAt,
        "expiry winner task"
      );
      const reservationTimestampFields = [
        "updatedAt",
        ...(baseline.budgetReservation.allocatedNdp === 0 ? ["releasedAt"] : [])
      ];
      assertBoundedRowChanges(
        baseline.budgetReservation,
        actual.budgetReservation,
        {
          releasedNdp: baseline.budgetReservation.releasedNdp + releaseAmount,
          status: baseline.budgetReservation.allocatedNdp === 0 ? "RELEASED" : "ACTIVE",
          releasedAt:
            baseline.budgetReservation.allocatedNdp === 0
              ? baseline.budgetReservation.releasedAt
              : baseline.budgetReservation.releasedAt
        },
        reservationTimestampFields,
        [],
        bounds,
        "expiry winner was not fully committed: reservation"
      );
      if (baseline.budgetReservation.allocatedNdp === 0) {
        assertTimestampOrder(
          actual.budgetReservation.releasedAt,
          actual.budgetReservation.updatedAt,
          "expiry winner reservation"
        );
      }
      assertBoundedRowChanges(
        baseline.publisherWallet,
        actual.publisherWallet,
        {
          availableBalance: baseline.publisherWallet.availableBalance + releaseAmount,
          frozenBalance: baseline.publisherWallet.frozenBalance - releaseAmount
        },
        ["updatedAt"],
        [],
        bounds,
        "expiry winner was not fully committed: publisher wallet"
      );
      assertExactBaselinePrefix(
        baseline.affiliateLedgers,
        actual.affiliateLedgers,
        "expiry winner affiliate finance"
      );
      assert(
        actual.affiliateLedgers.length === baseline.affiliateLedgers.length + 1,
        "expiry winner was not fully committed: ledger count"
      );
      const [releaseLedger] = actual.affiliateLedgers.slice(baseline.affiliateLedgers.length);
      assert(
        releaseLedger !== undefined &&
          releaseLedger.id > 0 &&
          releaseLedger.type === "AFFILIATE_TASK_BUDGET_RELEASE" &&
          releaseLedger.status === "APPLIED" &&
          releaseLedger.transactionNo.length > 0 &&
          releaseLedger.referenceType === "affiliate_task" &&
          releaseLedger.referenceId === input.taskId &&
          releaseLedger.actorUserId === null &&
          releaseLedger.amount === releaseAmount &&
          releaseLedger.currency === "NDP" &&
          releaseLedger.deletedAt === null &&
          exactJson(releaseLedger.metadata) ===
            exactJson({
              taskId: input.taskId,
              ownerType: "shop",
              ownerId: shop.id,
              walletId: input.publisherWalletId
            }) &&
          releaseLedger.idempotencyKey ===
            `affiliate-task:${input.taskId}:expiry-release:to:${actual.budgetReservation.releasedNdp}` &&
          releaseLedger.entries.length === 1 &&
          releaseLedger.entries[0].walletId === input.publisherWalletId &&
          releaseLedger.entries[0].transactionId === releaseLedger.id &&
          releaseLedger.entries[0].direction === "UNFREEZE" &&
          releaseLedger.entries[0].amount === releaseAmount &&
          releaseLedger.entries[0].availableDelta === releaseAmount &&
          releaseLedger.entries[0].frozenDelta === -releaseAmount &&
          releaseLedger.entries[0].availableBalanceAfter ===
            actual.publisherWallet.availableBalance &&
          releaseLedger.entries[0].frozenBalanceAfter === actual.publisherWallet.frozenBalance &&
          releaseLedger.entries[0].reason === "affiliate_task_budget_release" &&
          releaseLedger.entries[0].deletedAt === null &&
          releaseLedger.reconciliation !== null &&
          releaseLedger.reconciliation.transactionId === releaseLedger.id &&
          releaseLedger.reconciliation.referenceType === "affiliate_task" &&
          releaseLedger.reconciliation.referenceId === input.taskId &&
          releaseLedger.reconciliation.expectedAmount === releaseAmount &&
          releaseLedger.reconciliation.actualAmount === releaseAmount &&
          releaseLedger.reconciliation.differenceAmount === 0 &&
          releaseLedger.reconciliation.status === "PENDING" &&
          releaseLedger.reconciliation.currency === "NDP" &&
          releaseLedger.reconciliation.deletedAt === null &&
          releaseLedger.reconciliation.exportedAt === null &&
          releaseLedger.affiliateBudgetTransactions.length === 1 &&
          releaseLedger.affiliateBudgetTransactions[0].budgetReservationId ===
            actual.budgetReservation.id &&
          releaseLedger.affiliateBudgetTransactions[0].kind === "RELEASE" &&
          releaseLedger.affiliateBudgetTransactions[0].amountNdp === releaseAmount &&
          releaseLedger.affiliateBudgetTransactions[0].ledgerTransactionId === releaseLedger.id &&
          releaseLedger.affiliateBudgetTransactions[0].deletedAt === null &&
          releaseLedger.affiliateRewardTransactions.length === 0,
        "expiry winner was not fully committed: finance evidence"
      );
      assertCreatedTimestamps(releaseLedger, bounds, "expiry release ledger");
      assertCreatedTimestamps(releaseLedger.entries[0], bounds, "expiry release entry");
      assertCreatedTimestamps(
        releaseLedger.reconciliation,
        bounds,
        "expiry release reconciliation"
      );
      assertCreatedTimestamps(
        releaseLedger.affiliateBudgetTransactions[0],
        bounds,
        "expiry budget link"
      );
      assertTimestampOrder(
        releaseLedger.createdAt,
        releaseLedger.entries[0].createdAt,
        "expiry ledger to entry"
      );
      assertTimestampOrder(
        releaseLedger.createdAt,
        releaseLedger.reconciliation.createdAt,
        "expiry ledger to reconciliation"
      );
      assertTimestampOrder(
        releaseLedger.createdAt,
        releaseLedger.affiliateBudgetTransactions[0].createdAt,
        "expiry ledger to budget link"
      );
      assertBaselineAuditRowsPreserved(baseline, actual, "expiry winner rewrote baseline audits");
      const newAudits = actual.auditLogs.slice(baseline.auditLogs.length);
      assert(
        newAudits.length === 3 &&
          new Set(newAudits.map((audit) => audit.id)).size === newAudits.length &&
          newAudits.every((audit) => audit.actorId === null) &&
          newAudits.every((audit) => audit.id > 0 && audit.deletedAt === null) &&
          new Set(newAudits.map((audit) => audit.action)).size === 3 &&
          newAudits.some(
            (audit) =>
              audit.action === "affiliate.task.expired" &&
              audit.targetType === "affiliate_task" &&
              audit.targetId === input.taskId &&
              exactJson(audit.metadata) ===
                exactJson({ taskId: input.taskId, reservationId: actual.budgetReservation.id })
          ) &&
          newAudits.some(
            (audit) =>
              audit.action === "affiliate.task.expiry_budget_released" &&
              audit.targetType === "affiliate_task" &&
              audit.targetId === input.taskId &&
              exactJson(audit.metadata) ===
                exactJson({
                  taskId: input.taskId,
                  reservationId: actual.budgetReservation.id,
                  releaseAmountNdp: releaseAmount,
                  releasedBeforeNdp: baseline.budgetReservation.releasedNdp,
                  releasedAfterNdp: actual.budgetReservation.releasedNdp,
                  allocatedNdp: baseline.budgetReservation.allocatedNdp,
                  capturedNdp: baseline.budgetReservation.capturedNdp,
                  ledgerTransactionId: releaseLedger.id
                })
          ) &&
          newAudits.some(
            (audit) =>
              audit.action === "ledger.affiliate_task_budget.release" &&
              audit.targetType === "ledger_transaction" &&
              audit.targetId === releaseLedger.id &&
              exactJson(audit.metadata) ===
                exactJson({
                  referenceType: "affiliate_task",
                  referenceId: input.taskId,
                  amount: releaseAmount,
                  currency: "NDP"
                })
          ),
        "expiry winner was not fully committed: audit evidence"
      );
      for (const audit of newAudits) {
        assertCreatedTimestamps(audit, bounds, `expiry audit ${audit.action}`);
      }
      const expiredAudit = newAudits.find((audit) => audit.action === "affiliate.task.expired");
      const releaseLedgerAudit = newAudits.find(
        (audit) => audit.action === "ledger.affiliate_task_budget.release"
      );
      const releasedBudgetAudit = newAudits.find(
        (audit) => audit.action === "affiliate.task.expiry_budget_released"
      );
      assert(
        expiredAudit !== undefined &&
          releaseLedgerAudit !== undefined &&
          releasedBudgetAudit !== undefined,
        "expiry winner audit ordering evidence is incomplete"
      );
      assertTimestampOrder(
        actual.affiliateTask.endedAt,
        expiredAudit.createdAt,
        "expiry task to expired audit"
      );
      assertTimestampOrder(
        expiredAudit.createdAt,
        releaseLedger.createdAt,
        "expired audit to release ledger"
      );
      assertTimestampOrder(
        releaseLedger.createdAt,
        releaseLedgerAudit.createdAt,
        "release ledger to ledger audit"
      );
      assertTimestampOrder(
        releaseLedger.affiliateBudgetTransactions[0].createdAt,
        releasedBudgetAudit.createdAt,
        "expiry budget link to release audit"
      );
      assertExactBaselinePrefix(
        baseline.riskEvents,
        actual.riskEvents,
        "expiry winner risk events"
      );
      assert(
        actual.riskEvents.length === baseline.riskEvents.length,
        "expiry winner created unexpected risk events"
      );
    };
    const assertBookingLedgerWinner = (
      baseline: RaceSnapshot,
      actual: RaceSnapshot,
      input: RaceSnapshotInput,
      type: "BOOKING_COMPLETE_SETTLEMENT" | "BOOKING_CANCEL_UNFREEZE",
      availableDelta: number,
      frozenDelta: number,
      bounds: RaceBounds
    ): void => {
      assertExactBaselinePrefix(
        baseline.bookingLedgers,
        actual.bookingLedgers,
        "formal booking winner rewrote ordinary booking finance baseline"
      );
      assert(
        actual.bookingLedgers.length === baseline.bookingLedgers.length + 1,
        "formal booking winner ledger count is incorrect"
      );
      const [winnerLedger] = actual.bookingLedgers.slice(baseline.bookingLedgers.length);
      assert(
        winnerLedger !== undefined &&
          winnerLedger.id > 0 &&
          winnerLedger.type === type &&
          winnerLedger.status === "APPLIED" &&
          winnerLedger.transactionNo.length > 0 &&
          winnerLedger.referenceType === "booking_order" &&
          winnerLedger.referenceId === input.bookingOrderId &&
          winnerLedger.actorUserId === input.customerUserId &&
          winnerLedger.amount === BOOKING_FEE_NDP &&
          winnerLedger.currency === "NDP" &&
          winnerLedger.deletedAt === null &&
          winnerLedger.idempotencyKey ===
            `booking:${input.bookingOrderId}:${
              type === "BOOKING_COMPLETE_SETTLEMENT" ? "complete:settlement" : "cancel:unfreeze"
            }` &&
          winnerLedger.entries.length === 1 &&
          winnerLedger.entries[0].walletId === input.publisherWalletId &&
          winnerLedger.entries[0].transactionId === winnerLedger.id &&
          winnerLedger.entries[0].direction ===
            (type === "BOOKING_COMPLETE_SETTLEMENT" ? "FROZEN_DEBIT" : "UNFREEZE") &&
          winnerLedger.entries[0].amount === BOOKING_FEE_NDP &&
          winnerLedger.entries[0].availableDelta === availableDelta &&
          winnerLedger.entries[0].frozenDelta === frozenDelta &&
          winnerLedger.entries[0].availableBalanceAfter ===
            baseline.publisherWallet.availableBalance + availableDelta &&
          winnerLedger.entries[0].frozenBalanceAfter ===
            baseline.publisherWallet.frozenBalance + frozenDelta &&
          winnerLedger.entries[0].reason ===
            (type === "BOOKING_COMPLETE_SETTLEMENT"
              ? "booking_complete_merchant_debit"
              : "booking_cancel_unfreeze") &&
          winnerLedger.entries[0].deletedAt === null &&
          winnerLedger.reconciliation !== null &&
          winnerLedger.reconciliation.transactionId === winnerLedger.id &&
          winnerLedger.reconciliation.referenceType === "booking_order" &&
          winnerLedger.reconciliation.referenceId === input.bookingOrderId &&
          winnerLedger.reconciliation.expectedAmount === BOOKING_FEE_NDP &&
          winnerLedger.reconciliation.actualAmount === BOOKING_FEE_NDP &&
          winnerLedger.reconciliation.differenceAmount === 0 &&
          winnerLedger.reconciliation.status === "PENDING" &&
          winnerLedger.reconciliation.currency === "NDP" &&
          winnerLedger.reconciliation.deletedAt === null &&
          winnerLedger.reconciliation.exportedAt === null &&
          winnerLedger.affiliateBudgetTransactions.length === 0 &&
          winnerLedger.affiliateRewardTransactions.length === 0,
        "formal booking winner ordinary ledger evidence is incomplete"
      );
      assertCreatedTimestamps(winnerLedger, bounds, `formal booking ${type} ledger`);
      assertCreatedTimestamps(winnerLedger.entries[0], bounds, `formal booking ${type} entry`);
      assertCreatedTimestamps(
        winnerLedger.reconciliation,
        bounds,
        `formal booking ${type} reconciliation`
      );
      assertTimestampOrder(
        winnerLedger.createdAt,
        winnerLedger.entries[0].createdAt,
        `formal booking ${type} ledger to entry`
      );
      assertTimestampOrder(
        winnerLedger.createdAt,
        winnerLedger.reconciliation.createdAt,
        `formal booking ${type} ledger to reconciliation`
      );
    };
    const assertNoExpiryPartialArtifacts = (baseline: RaceSnapshot, actual: RaceSnapshot): void => {
      const expiryActions = new Set([
        "affiliate.task.expired",
        "affiliate.task.expiry_budget_released",
        "ledger.affiliate_task_budget.release"
      ]);
      assert(
        actual.affiliateLedgers.every(
          (transaction) => transaction.type !== "AFFILIATE_TASK_BUDGET_RELEASE"
        ) &&
          actual.auditLogs.every((audit) => !expiryActions.has(audit.action)) &&
          actual.affiliateTask.status === baseline.affiliateTask.status &&
          sameDate(actual.affiliateTask.endedAt, baseline.affiliateTask.endedAt) &&
          actual.affiliateTask.lockVersion === baseline.affiliateTask.lockVersion &&
          actual.affiliateTask.releasedBudgetNdp === baseline.affiliateTask.releasedBudgetNdp &&
          actual.budgetReservation.releasedNdp === baseline.budgetReservation.releasedNdp &&
          sameDate(actual.budgetReservation.releasedAt, baseline.budgetReservation.releasedAt),
        "expiry victim left partial artifacts"
      );
    };
    const assertFormalCompletionWinner = (
      baseline: RaceSnapshot,
      actual: RaceSnapshot,
      input: RaceSnapshotInput,
      bounds: RaceBounds
    ): void => {
      const hold = actual.walletHolds[0];
      const baselineHold = baseline.walletHolds[0];
      assert(
        baselineHold !== undefined && hold !== undefined,
        "completion hold fixture is missing"
      );
      assertExactBaselinePrefix(
        baseline.feeCalculationLogs,
        actual.feeCalculationLogs,
        "formal completion fee calculation logs"
      );
      const completionFeeLogs = actual.feeCalculationLogs.slice(baseline.feeCalculationLogs.length);
      assert(completionFeeLogs.length === 2, "formal completion winner fee log count is incorrect");
      const completionBookingFeeLog = completionFeeLogs.find(
        (row) => row.feeType === "b_platform_fee"
      );
      const completionRewardFeeLog = completionFeeLogs.find((row) => row.feeType === "user_reward");
      assert(
        completionBookingFeeLog !== undefined && completionRewardFeeLog !== undefined,
        "formal completion winner fee logs are incomplete"
      );
      const completionBookingFee = expectedFeeEvidence({
        bookingOrderId: input.bookingOrderId,
        feeType: "b_platform_fee",
        stage: "capture",
        calculationLogId: completionBookingFeeLog.id
      });
      const completionRewardFee = expectedFeeEvidence({
        bookingOrderId: input.bookingOrderId,
        feeType: "user_reward",
        stage: "capture",
        calculationLogId: completionRewardFeeLog.id
      });
      const assertFeeLog = (
        row: typeof completionBookingFeeLog,
        evidence: ReturnType<typeof expectedFeeEvidence>,
        label: string
      ): void => {
        assert(
          row.id > 0 &&
            row.bookingOrderId === evidence.bookingOrderId &&
            row.calculationStage === evidence.stage &&
            row.feeType === evidence.feeType &&
            row.payerType === evidence.payerType &&
            row.payerId === evidence.payerId &&
            row.baseFeeNdp === evidence.baseFeeNdp &&
            row.tierAdjustmentNdp === evidence.tierAdjustmentNdp &&
            row.timeAdjustmentNdp === evidence.timeAdjustmentNdp &&
            row.campaignDiscountNdp === evidence.campaignDiscountNdp &&
            row.finalFeeNdp === evidence.finalFeeNdp &&
            row.holdAmountNdp === evidence.holdAmountNdp &&
            exactJson(row.appliedRuleIdsJson) === exactJson(evidence.appliedRuleIds) &&
            exactJson(row.explanationJson) === exactJson(evidence.explanation) &&
            row.deletedAt === null,
          `${label} fields are incorrect`
        );
        assertTimestampWithinRace(
          row.calculatedAt,
          bounds.raceStartedAt,
          bounds.raceSettledAt,
          `${label} calculatedAt`
        );
        assertCreatedTimestamps(row, bounds, label);
        assertTimestampOrder(row.calculatedAt, row.createdAt, `${label} calculation to creation`);
      };
      assertFeeLog(completionBookingFeeLog, completionBookingFee, "completion booking fee log");
      assertFeeLog(completionRewardFeeLog, completionRewardFee, "completion reward fee log");
      assert(
        new Set(actual.feeCalculationLogs.map((row) => row.id)).size ===
          actual.feeCalculationLogs.length,
        "formal completion fee log IDs are not unique"
      );
      assertBoundedRowChanges(
        baseline.bookingOrder,
        actual.bookingOrder,
        { status: "COMPLETED" },
        ["updatedAt"],
        [],
        bounds,
        "formal completion winner was not fully committed: booking"
      );
      assertExactBaselinePrefix(
        baseline.statusHistory,
        actual.statusHistory,
        "formal completion winner rewrote status history baseline"
      );
      const [completedHistory] = actual.statusHistory.slice(baseline.statusHistory.length);
      assert(
        actual.statusHistory.length === baseline.statusHistory.length + 1 &&
          completedHistory?.bookingOrderId === input.bookingOrderId &&
          completedHistory.id > 0 &&
          completedHistory.fromStatus === "IN_SERVICE" &&
          completedHistory.toStatus === "COMPLETED" &&
          completedHistory.actorUserId === input.customerUserId &&
          completedHistory.reason === null &&
          completedHistory.metadata === null &&
          completedHistory.deletedAt === null,
        "formal completion winner was not fully committed: status history"
      );
      assertCreatedTimestamps(completedHistory, bounds, "completion status history");
      assertTimestampOrder(
        actual.bookingOrder.updatedAt,
        completedHistory.createdAt,
        "completion booking to status history"
      );
      assertExact(
        actual.scheduleSlot,
        baseline.scheduleSlot,
        "formal completion winner changed schedule slot state"
      );
      assertBoundedRowChanges(
        baselineHold,
        hold,
        {
          capturedAmountNdp: BOOKING_FEE_NDP,
          status: "captured"
        },
        ["capturedAt", "updatedAt"],
        ["metadata"],
        bounds,
        "formal completion winner was not fully committed: wallet hold"
      );
      assert(
        hold.releasedAt === null &&
          exactJson(hold.metadata) ===
            exactJson({
              holdMetadata: baselineHold.metadata,
              captureFee: expectedFeeMetadata(completionBookingFee),
              rewardFee: expectedFeeMetadata(completionRewardFee)
            }),
        "formal completion winner hold timestamps are incorrect"
      );
      assertTimestampOrder(hold.capturedAt, hold.updatedAt, "completion wallet hold");
      assertBoundedRowChanges(
        baseline.orderFinancial,
        actual.orderFinancial,
        {
          bPlatformFeeActualNdp: BOOKING_FEE_NDP,
          completedOrderOrdinalInPeriod: null,
          appliedFeeRuleIdsJson: [bookingFeeRuleKey, userRewardRuleKey],
          settlementStatus: "settled"
        },
        ["updatedAt"],
        ["moneyTimelineJson"],
        bounds,
        "formal completion winner was not fully committed: order financial"
      );
      assertTimelineAppend(
        baseline.orderFinancial.moneyTimelineJson,
        actual.orderFinancial.moneyTimelineJson,
        {
          action: "booking_complete_settlement",
          platformFeeNdp: BOOKING_FEE_NDP,
          releasedNdp: 0,
          userRewardNdp: 0,
          fee: completionBookingFee,
          reward: completionRewardFee
        },
        bounds,
        "formal completion order financial"
      );
      assertBookingLedgerWinner(
        baseline,
        actual,
        input,
        "BOOKING_COMPLETE_SETTLEMENT",
        0,
        -BOOKING_FEE_NDP,
        bounds
      );
      const completionBookingLedger = actual.bookingLedgers[baseline.bookingLedgers.length];
      assert(completionBookingLedger !== undefined, "completion booking ledger is missing");
      assertExact(
        completionBookingLedger.metadata,
        {
          shopId: shop.id,
          customerUserId: input.customerUserId,
          merchantDebitAmount: BOOKING_FEE_NDP,
          merchantReleaseAmount: 0,
          customerRewardAmount: 0,
          fee: completionBookingFee,
          reward: completionRewardFee
        },
        "formal completion booking ledger metadata is incorrect"
      );
      assertBoundedRowChanges(
        baseline.affiliateTask,
        actual.affiliateTask,
        {
          allocatedBudgetNdp: baseline.affiliateTask.allocatedBudgetNdp - REWARD_NDP,
          settledBudgetNdp: baseline.affiliateTask.settledBudgetNdp + REWARD_NDP
        },
        ["updatedAt"],
        [],
        bounds,
        "formal completion winner was not fully committed: task counters"
      );
      assertBoundedRowChanges(
        baseline.budgetReservation,
        actual.budgetReservation,
        {
          allocatedNdp: baseline.budgetReservation.allocatedNdp - REWARD_NDP,
          capturedNdp: baseline.budgetReservation.capturedNdp + REWARD_NDP
        },
        ["updatedAt"],
        [],
        bounds,
        "formal completion winner was not fully committed: reservation counters"
      );
      assertBoundedRowChanges(
        baseline.publisherWallet,
        actual.publisherWallet,
        {
          frozenBalance: baseline.publisherWallet.frozenBalance - REWARD_NDP - BOOKING_FEE_NDP
        },
        ["updatedAt"],
        [],
        bounds,
        "formal completion winner was not fully committed: publisher wallet"
      );
      assertCreatedWallet(
        baseline.claimantWallet,
        actual.claimantWallet,
        input.claimantUserId,
        REWARD_NDP,
        bounds,
        "formal completion winner claimant wallet is incomplete"
      );
      assertCreatedWallet(
        baseline.customerWallet,
        actual.customerWallet,
        input.customerUserId,
        0,
        bounds,
        "formal completion winner customer wallet is incomplete"
      );
      assertBoundedRowChanges(
        baseline.affiliateClaim,
        actual.affiliateClaim,
        {
          completedOrderCount: baseline.affiliateClaim.completedOrderCount + 1,
          settledRewardNdp: baseline.affiliateClaim.settledRewardNdp + REWARD_NDP
        },
        ["updatedAt"],
        [],
        bounds,
        "formal completion winner was not fully committed: claim counters"
      );
      assertBoundedRowChanges(
        baseline.attribution,
        actual.attribution,
        {
          status: "SETTLED"
        },
        ["qualifiedAt", "settledAt", "updatedAt"],
        [],
        bounds,
        "formal completion winner was not fully committed: attribution"
      );
      assert(
        actual.attribution.activeKey === baseline.attribution.activeKey &&
          actual.attribution.qualifiedAt !== null &&
          actual.attribution.settledAt !== null &&
          actual.attribution.invalidatedAt === null &&
          actual.attribution.invalidationReason === null &&
          actual.affiliateRewards.length === baseline.affiliateRewards.length + 1,
        "formal completion winner attribution timestamps or reward count are incorrect"
      );
      assertTimestampOrder(
        actual.attribution.qualifiedAt,
        actual.attribution.settledAt,
        "completion attribution qualification to settlement"
      );
      assertTimestampOrder(
        actual.attribution.settledAt,
        actual.attribution.updatedAt,
        "completion attribution settlement to update"
      );
      assertExactBaselinePrefix(
        baseline.affiliateRewards,
        actual.affiliateRewards,
        "formal completion affiliate rewards"
      );
      const [reward] = actual.affiliateRewards.slice(baseline.affiliateRewards.length);
      assert(
        reward.id > 0 &&
          reward.attributionId === input.attributionId &&
          reward.taskId === input.taskId &&
          reward.claimId === input.claimId &&
          reward.bookingOrderId === input.bookingOrderId &&
          reward.publisherWalletId === input.publisherWalletId &&
          reward.claimantWalletId === actual.claimantWallet?.id &&
          reward.rewardNdp === REWARD_NDP &&
          reward.reversalRequiredNdp === 0 &&
          reward.reversedNdp === 0 &&
          reward.outstandingRecoveryNdp === 0 &&
          reward.status === "SETTLED" &&
          reward.settledAt !== null &&
          reward.reversedAt === null &&
          reward.reversalReason === null &&
          reward.deletedAt === null &&
          reward.transactions.length === 1 &&
          reward.transactions[0].rewardId === reward.id &&
          reward.transactions[0].ledgerTransactionId > 0 &&
          reward.transactions[0].kind === "SETTLEMENT" &&
          reward.transactions[0].amountNdp === REWARD_NDP &&
          reward.transactions[0].deletedAt === null,
        "formal completion winner reward/link evidence is incomplete"
      );
      assertCreatedTimestamps(reward, bounds, "completion affiliate reward");
      assertTimestampWithinRace(
        reward.settledAt,
        bounds.raceStartedAt,
        bounds.raceSettledAt,
        "completion reward settledAt"
      );
      assertTimestampOrder(
        reward.createdAt,
        reward.settledAt,
        "completion reward creation to settlement"
      );
      assertTimestampOrder(
        reward.settledAt,
        reward.updatedAt,
        "completion reward settlement to update"
      );
      assertCreatedTimestamps(reward.transactions[0], bounds, "completion reward transaction link");
      assertExactBaselinePrefix(
        baseline.affiliateLedgers,
        actual.affiliateLedgers,
        "formal completion affiliate ledgers"
      );
      const newAffiliateLedgers = actual.affiliateLedgers.slice(baseline.affiliateLedgers.length);
      const settlementLedger = newAffiliateLedgers.find(
        (transaction) => transaction.type === "AFFILIATE_REWARD_SETTLEMENT"
      );
      assert(
        newAffiliateLedgers.length === 1 &&
          settlementLedger !== undefined &&
          settlementLedger.id > 0 &&
          settlementLedger.status === "APPLIED" &&
          settlementLedger.transactionNo.length > 0 &&
          settlementLedger.idempotencyKey ===
            `affiliate:task:${input.taskId}:booking:${input.bookingOrderId}:reward:settlement` &&
          settlementLedger.referenceType === "affiliate_reward" &&
          settlementLedger.referenceId === reward.id &&
          settlementLedger.actorUserId === input.customerUserId &&
          settlementLedger.amount === REWARD_NDP &&
          settlementLedger.currency === "NDP" &&
          settlementLedger.deletedAt === null &&
          exactJson(settlementLedger.metadata) ===
            exactJson({
              taskId: input.taskId,
              attributionId: input.attributionId,
              bookingOrderId: input.bookingOrderId,
              publisherOwnerType: "shop",
              publisherOwnerId: shop.id,
              publisherWalletId: input.publisherWalletId,
              claimantUserId: input.claimantUserId,
              claimantWalletId: actual.claimantWallet?.id
            }) &&
          settlementLedger.entries.length === 2 &&
          settlementLedger.entries.some(
            (entry) =>
              entry.transactionId === settlementLedger.id &&
              entry.walletId === input.publisherWalletId &&
              entry.direction === "FROZEN_DEBIT" &&
              entry.amount === REWARD_NDP &&
              entry.availableDelta === 0 &&
              entry.frozenDelta === -REWARD_NDP &&
              entry.availableBalanceAfter === actual.publisherWallet.availableBalance &&
              entry.frozenBalanceAfter === actual.publisherWallet.frozenBalance &&
              entry.reason === "affiliate_reward_publisher_frozen_debit" &&
              entry.deletedAt === null
          ) &&
          settlementLedger.entries.some(
            (entry) =>
              entry.transactionId === settlementLedger.id &&
              entry.walletId === actual.claimantWallet?.id &&
              entry.direction === "AVAILABLE_CREDIT" &&
              entry.amount === REWARD_NDP &&
              entry.availableDelta === REWARD_NDP &&
              entry.frozenDelta === 0 &&
              entry.availableBalanceAfter === REWARD_NDP &&
              entry.frozenBalanceAfter === 0 &&
              entry.reason === "affiliate_reward_claimant_available_credit" &&
              entry.deletedAt === null
          ) &&
          settlementLedger.reconciliation !== null &&
          settlementLedger.reconciliation.transactionId === settlementLedger.id &&
          settlementLedger.reconciliation.referenceType === "affiliate_reward" &&
          settlementLedger.reconciliation.referenceId === reward.id &&
          settlementLedger.reconciliation.status === "PENDING" &&
          settlementLedger.reconciliation.expectedAmount === REWARD_NDP &&
          settlementLedger.reconciliation.actualAmount === REWARD_NDP &&
          settlementLedger.reconciliation.differenceAmount === 0 &&
          settlementLedger.reconciliation.currency === "NDP" &&
          settlementLedger.reconciliation.deletedAt === null &&
          settlementLedger.reconciliation.exportedAt === null &&
          settlementLedger.affiliateBudgetTransactions.length === 1 &&
          settlementLedger.affiliateBudgetTransactions[0].budgetReservationId ===
            actual.budgetReservation.id &&
          settlementLedger.affiliateBudgetTransactions[0].kind === "SETTLEMENT" &&
          settlementLedger.affiliateBudgetTransactions[0].amountNdp === REWARD_NDP &&
          settlementLedger.affiliateBudgetTransactions[0].ledgerTransactionId ===
            settlementLedger.id &&
          settlementLedger.affiliateBudgetTransactions[0].deletedAt === null &&
          settlementLedger.affiliateRewardTransactions.length === 1 &&
          settlementLedger.affiliateRewardTransactions[0].rewardId === reward.id &&
          settlementLedger.affiliateRewardTransactions[0].kind === "SETTLEMENT" &&
          settlementLedger.affiliateRewardTransactions[0].amountNdp === REWARD_NDP &&
          settlementLedger.affiliateRewardTransactions[0].ledgerTransactionId ===
            settlementLedger.id &&
          settlementLedger.affiliateRewardTransactions[0].deletedAt === null,
        "formal completion winner affiliate ledger evidence is incomplete"
      );
      assertCreatedTimestamps(settlementLedger, bounds, "completion affiliate ledger");
      for (const entry of settlementLedger.entries) {
        assertCreatedTimestamps(entry, bounds, "completion affiliate ledger entry");
        assertTimestampOrder(
          settlementLedger.createdAt,
          entry.createdAt,
          "completion affiliate ledger to entry"
        );
      }
      assertCreatedTimestamps(
        settlementLedger.reconciliation,
        bounds,
        "completion affiliate reconciliation"
      );
      assertCreatedTimestamps(
        settlementLedger.affiliateBudgetTransactions[0],
        bounds,
        "completion affiliate budget link"
      );
      assertCreatedTimestamps(
        settlementLedger.affiliateRewardTransactions[0],
        bounds,
        "completion affiliate reward link"
      );
      assertTimestampOrder(
        settlementLedger.createdAt,
        settlementLedger.reconciliation.createdAt,
        "completion affiliate ledger to reconciliation"
      );
      assertTimestampOrder(
        settlementLedger.createdAt,
        settlementLedger.affiliateBudgetTransactions[0].createdAt,
        "completion affiliate ledger to budget link"
      );
      assertTimestampOrder(
        settlementLedger.createdAt,
        settlementLedger.affiliateRewardTransactions[0].createdAt,
        "completion affiliate ledger to reward link"
      );
      assertExactBaselinePrefix(
        baseline.riskEvents,
        actual.riskEvents,
        "formal completion risk events"
      );
      assert(
        actual.riskEvents.length === baseline.riskEvents.length,
        "formal completion winner created unexpected risk events"
      );
      assertBaselineAuditRowsPreserved(
        baseline,
        actual,
        "formal completion winner rewrote baseline audits"
      );
      const newAudits = actual.auditLogs.slice(baseline.auditLogs.length);
      const actions = newAudits.map((audit) => audit.action);
      const bookingLedger = actual.bookingLedgers.at(-1);
      assert(
        actions.length === 3 &&
          new Set(actions).size === 3 &&
          newAudits.every((audit) => audit.id > 0 && audit.deletedAt === null) &&
          newAudits.some(
            (audit) =>
              audit.actorId === input.customerUserId &&
              audit.action === "ledger.booking_complete.settlement" &&
              audit.targetType === "ledger_transaction" &&
              audit.targetId === bookingLedger?.id &&
              exactJson(audit.metadata) ===
                exactJson({
                  referenceType: "booking_order",
                  referenceId: input.bookingOrderId,
                  amount: BOOKING_FEE_NDP,
                  currency: "NDP"
                })
          ) &&
          newAudits.some(
            (audit) =>
              audit.actorId === input.customerUserId &&
              audit.action === "ledger.affiliate_reward.settlement" &&
              audit.targetType === "ledger_transaction" &&
              audit.targetId === settlementLedger.id &&
              exactJson(audit.metadata) ===
                exactJson({
                  referenceType: "affiliate_reward",
                  referenceId: reward.id,
                  amount: REWARD_NDP,
                  currency: "NDP"
                })
          ) &&
          newAudits.some(
            (audit) =>
              audit.actorId === input.customerUserId &&
              audit.action === "affiliate.reward.settled" &&
              audit.targetType === "booking_order" &&
              audit.targetId === input.bookingOrderId &&
              exactJson(audit.metadata) ===
                exactJson({
                  attributionId: input.attributionId,
                  taskId: input.taskId,
                  claimId: input.claimId,
                  rewardId: reward.id,
                  ledgerTransactionId: settlementLedger.id,
                  rewardSettledNdp: REWARD_NDP
                })
          ),
        "formal completion winner audit evidence is incomplete"
      );
      for (const audit of newAudits) {
        assertCreatedTimestamps(audit, bounds, `completion audit ${audit.action}`);
      }
      const bookingAudit = newAudits.find(
        (audit) => audit.action === "ledger.booking_complete.settlement"
      );
      const affiliateLedgerAudit = newAudits.find(
        (audit) => audit.action === "ledger.affiliate_reward.settlement"
      );
      const rewardAudit = newAudits.find((audit) => audit.action === "affiliate.reward.settled");
      assert(
        bookingAudit !== undefined &&
          affiliateLedgerAudit !== undefined &&
          rewardAudit !== undefined,
        "formal completion winner audit ordering evidence is incomplete"
      );
      assertTimestampOrder(
        completionBookingLedger.createdAt,
        bookingAudit.createdAt,
        "completion booking ledger to audit"
      );
      assertTimestampOrder(
        settlementLedger.createdAt,
        affiliateLedgerAudit.createdAt,
        "completion affiliate ledger to audit"
      );
      assertTimestampOrder(
        settlementLedger.affiliateRewardTransactions[0].createdAt,
        rewardAudit.createdAt,
        "completion reward link to audit"
      );
      assertNoExpiryPartialArtifacts(baseline, actual);
    };
    const assertFormalCancellationWinner = (
      baseline: RaceSnapshot,
      actual: RaceSnapshot,
      input: RaceSnapshotInput,
      bounds: RaceBounds
    ): void => {
      const reason = "expiry acceptance cancellation race";
      const hold = actual.walletHolds[0];
      const baselineHold = baseline.walletHolds[0];
      assert(
        baselineHold !== undefined && hold !== undefined,
        "cancellation hold fixture is missing"
      );
      assertBoundedRowChanges(
        baseline.bookingOrder,
        actual.bookingOrder,
        { status: "CANCELLED", cancelReason: reason },
        ["updatedAt"],
        [],
        bounds,
        "formal cancellation winner was not fully committed: booking"
      );
      assertExactBaselinePrefix(
        baseline.statusHistory,
        actual.statusHistory,
        "formal cancellation winner rewrote status history baseline"
      );
      const [cancelledHistory] = actual.statusHistory.slice(baseline.statusHistory.length);
      assert(
        actual.statusHistory.length === baseline.statusHistory.length + 1 &&
          cancelledHistory?.bookingOrderId === input.bookingOrderId &&
          cancelledHistory.id > 0 &&
          cancelledHistory.fromStatus === "CONFIRMED" &&
          cancelledHistory.toStatus === "CANCELLED" &&
          cancelledHistory.actorUserId === input.customerUserId &&
          cancelledHistory.reason === reason &&
          cancelledHistory.metadata === null &&
          cancelledHistory.deletedAt === null,
        "formal cancellation winner was not fully committed: status history"
      );
      assertCreatedTimestamps(cancelledHistory, bounds, "cancellation status history");
      assertTimestampOrder(
        actual.bookingOrder.updatedAt,
        cancelledHistory.createdAt,
        "cancellation booking to status history"
      );
      assertBoundedRowChanges(
        baseline.scheduleSlot,
        actual.scheduleSlot,
        { status: "AVAILABLE", bookedCount: 0 },
        ["updatedAt"],
        [],
        bounds,
        "formal cancellation winner was not fully committed: schedule slot"
      );
      assertBoundedRowChanges(
        baselineHold,
        hold,
        {
          releasedAmountNdp: BOOKING_FEE_NDP,
          status: "released"
        },
        ["releasedAt", "updatedAt"],
        [],
        bounds,
        "formal cancellation winner was not fully committed: wallet hold"
      );
      assert(hold.capturedAt === null, "formal cancellation winner hold timestamps are incorrect");
      assertTimestampOrder(hold.releasedAt, hold.updatedAt, "cancellation wallet hold");
      assertBoundedRowChanges(
        baseline.orderFinancial,
        actual.orderFinancial,
        {
          releasedNdp: BOOKING_FEE_NDP,
          settlementStatus: "cancelled"
        },
        ["updatedAt"],
        ["moneyTimelineJson"],
        bounds,
        "formal cancellation winner was not fully committed: order financial"
      );
      assertTimelineAppend(
        baseline.orderFinancial.moneyTimelineJson,
        actual.orderFinancial.moneyTimelineJson,
        { action: "booking_cancel_release", amountNdp: BOOKING_FEE_NDP },
        bounds,
        "formal cancellation order financial"
      );
      assertExactBaselinePrefix(
        baseline.feeCalculationLogs,
        actual.feeCalculationLogs,
        "formal cancellation winner changed fee calculation logs"
      );
      assert(
        actual.feeCalculationLogs.length === baseline.feeCalculationLogs.length,
        "formal cancellation winner created fee calculation logs"
      );
      assertBookingLedgerWinner(
        baseline,
        actual,
        input,
        "BOOKING_CANCEL_UNFREEZE",
        BOOKING_FEE_NDP,
        -BOOKING_FEE_NDP,
        bounds
      );
      const cancellationBookingLedger = actual.bookingLedgers[baseline.bookingLedgers.length];
      assert(cancellationBookingLedger !== undefined, "cancellation booking ledger is missing");
      assertExact(
        cancellationBookingLedger.metadata,
        { shopId: shop.id, holdId: hold.id },
        "formal cancellation booking ledger metadata is incorrect"
      );
      assertBoundedRowChanges(
        baseline.affiliateTask,
        actual.affiliateTask,
        {
          allocatedBudgetNdp: baseline.affiliateTask.allocatedBudgetNdp - REWARD_NDP
        },
        ["updatedAt"],
        [],
        bounds,
        "formal cancellation winner was not fully committed: task counters"
      );
      assertBoundedRowChanges(
        baseline.budgetReservation,
        actual.budgetReservation,
        {
          allocatedNdp: baseline.budgetReservation.allocatedNdp - REWARD_NDP
        },
        ["updatedAt"],
        [],
        bounds,
        "formal cancellation winner was not fully committed: reservation counters"
      );
      assertBoundedRowChanges(
        baseline.publisherWallet,
        actual.publisherWallet,
        {
          availableBalance: baseline.publisherWallet.availableBalance + BOOKING_FEE_NDP,
          frozenBalance: baseline.publisherWallet.frozenBalance - BOOKING_FEE_NDP
        },
        ["updatedAt"],
        [],
        bounds,
        "formal cancellation winner was not fully committed: publisher wallet"
      );
      assert(
        baseline.claimantWallet === null && baseline.customerWallet === null,
        "formal cancellation wallet baseline unexpectedly existed"
      );
      assertExact(
        actual.claimantWallet,
        baseline.claimantWallet,
        "formal cancellation winner created claimant wallet"
      );
      assertExact(
        actual.customerWallet,
        baseline.customerWallet,
        "formal cancellation winner created customer wallet"
      );
      assertExact(
        actual.affiliateClaim,
        baseline.affiliateClaim,
        "formal cancellation winner changed claim counters"
      );
      assertBoundedRowChanges(
        baseline.attribution,
        actual.attribution,
        {
          status: "INVALIDATED",
          activeKey: null,
          invalidationReason: "booking_cancelled"
        },
        ["invalidatedAt", "updatedAt"],
        [],
        bounds,
        "formal cancellation winner was not fully committed: attribution"
      );
      assert(
        actual.attribution.invalidatedAt !== null &&
          actual.attribution.qualifiedAt === null &&
          actual.attribution.settledAt === null &&
          actual.affiliateRewards.length === 0 &&
          actual.affiliateLedgers.length === baseline.affiliateLedgers.length,
        "formal cancellation winner left reward or affiliate ledger artifacts"
      );
      assertTimestampOrder(
        actual.attribution.invalidatedAt,
        actual.attribution.updatedAt,
        "cancellation attribution invalidation to update"
      );
      assertExactBaselinePrefix(
        baseline.affiliateRewards,
        actual.affiliateRewards,
        "formal cancellation affiliate rewards"
      );
      assert(
        actual.affiliateRewards.length === baseline.affiliateRewards.length,
        "formal cancellation winner created affiliate rewards"
      );
      assertExactBaselinePrefix(
        baseline.affiliateLedgers,
        actual.affiliateLedgers,
        "formal cancellation affiliate ledgers"
      );
      assertExactBaselinePrefix(
        baseline.riskEvents,
        actual.riskEvents,
        "formal cancellation winner changed risk events"
      );
      assert(
        actual.riskEvents.length === baseline.riskEvents.length,
        "formal cancellation winner created risk events"
      );
      assertBaselineAuditRowsPreserved(
        baseline,
        actual,
        "formal cancellation winner rewrote baseline audits"
      );
      const newAudits = actual.auditLogs.slice(baseline.auditLogs.length);
      const actions = newAudits.map((audit) => audit.action);
      const cancellationLedger = actual.bookingLedgers.at(-1);
      assert(
        actions.length === 2 &&
          new Set(actions).size === 2 &&
          newAudits.every((audit) => audit.id > 0 && audit.deletedAt === null) &&
          newAudits.some(
            (audit) =>
              audit.actorId === input.customerUserId &&
              audit.action === "ledger.booking_cancel.unfreeze" &&
              audit.targetType === "ledger_transaction" &&
              audit.targetId === cancellationLedger?.id &&
              exactJson(audit.metadata) ===
                exactJson({
                  referenceType: "booking_order",
                  referenceId: input.bookingOrderId,
                  amount: BOOKING_FEE_NDP,
                  currency: "NDP"
                })
          ) &&
          newAudits.some(
            (audit) =>
              audit.actorId === input.customerUserId &&
              audit.action === "affiliate.attribution.invalidated" &&
              audit.targetType === "booking_order" &&
              audit.targetId === input.bookingOrderId &&
              exactJson(audit.metadata) ===
                exactJson({
                  attributionId: input.attributionId,
                  taskId: input.taskId,
                  claimId: input.claimId,
                  rewardReleasedNdp: REWARD_NDP,
                  reason: "booking_cancelled"
                })
          ),
        "formal cancellation winner audit evidence is incomplete"
      );
      for (const audit of newAudits) {
        assertCreatedTimestamps(audit, bounds, `cancellation audit ${audit.action}`);
      }
      const cancellationLedgerAudit = newAudits.find(
        (audit) => audit.action === "ledger.booking_cancel.unfreeze"
      );
      const invalidationAudit = newAudits.find(
        (audit) => audit.action === "affiliate.attribution.invalidated"
      );
      assert(
        cancellationLedgerAudit !== undefined && invalidationAudit !== undefined,
        "formal cancellation winner audit ordering evidence is incomplete"
      );
      assertTimestampOrder(
        cancellationBookingLedger.createdAt,
        cancellationLedgerAudit.createdAt,
        "cancellation ledger to audit"
      );
      assertTimestampOrder(
        actual.attribution.invalidatedAt,
        invalidationAudit.createdAt,
        "cancellation attribution to audit"
      );
      assertNoExpiryPartialArtifacts(baseline, actual);
    };
    const assertExpiryVictimRollback = async (input: {
      flow: "completion" | "cancellation";
      baseline: RaceSnapshot;
      snapshotInput: RaceSnapshotInput;
      raceStartedAt: Date;
      raceSettledAt: Date;
    }): Promise<void> => {
      const actual = await captureRaceSnapshot(input.snapshotInput);
      const bounds = {
        raceStartedAt: input.raceStartedAt,
        raceSettledAt: input.raceSettledAt
      };
      if (input.flow === "completion") {
        assertFormalCompletionWinner(input.baseline, actual, input.snapshotInput, bounds);
      } else {
        assertFormalCancellationWinner(input.baseline, actual, input.snapshotInput, bounds);
      }
    };
    const assertBookingVictimRollback = async (input: {
      baseline: RaceSnapshot;
      snapshotInput: RaceSnapshotInput;
      raceStartedAt: Date;
      raceSettledAt: Date;
    }): Promise<void> => {
      const actual = await captureRaceSnapshot(input.snapshotInput);
      assertExact(
        actual.bookingOrder,
        input.baseline.bookingOrder,
        "booking victim left partial artifacts: booking"
      );
      assertExact(
        actual.statusHistory,
        input.baseline.statusHistory,
        "booking victim left partial artifacts: status history"
      );
      assertExact(
        actual.scheduleSlot,
        input.baseline.scheduleSlot,
        "booking victim left partial artifacts: schedule slot"
      );
      assertExact(
        actual.walletHolds,
        input.baseline.walletHolds,
        "booking victim left partial artifacts: wallet holds"
      );
      assertExact(
        actual.orderFinancial,
        input.baseline.orderFinancial,
        "booking victim left partial artifacts: order financial"
      );
      assertExact(
        actual.feeCalculationLogs,
        input.baseline.feeCalculationLogs,
        "booking victim left partial artifacts: fee logs"
      );
      assertExact(
        actual.bookingLedgers,
        input.baseline.bookingLedgers,
        "booking victim left partial artifacts: ordinary booking ledgers"
      );
      assert(
        input.baseline.claimantWallet === null && input.baseline.customerWallet === null,
        "booking victim wallet baseline unexpectedly existed"
      );
      assertExact(
        actual.claimantWallet,
        input.baseline.claimantWallet,
        "booking victim left partial artifacts: claimant wallet"
      );
      assertExact(
        actual.customerWallet,
        input.baseline.customerWallet,
        "booking victim left partial artifacts: customer wallet"
      );
      assertExact(
        actual.affiliateClaim,
        input.baseline.affiliateClaim,
        "booking victim left partial artifacts: claim"
      );
      assertExact(
        actual.attribution,
        input.baseline.attribution,
        "booking victim left partial artifacts: attribution"
      );
      assertExact(
        actual.affiliateRewards,
        input.baseline.affiliateRewards,
        "booking victim left partial artifacts: rewards"
      );
      assertExact(
        actual.riskEvents,
        input.baseline.riskEvents,
        "booking victim left partial artifacts: risk events"
      );
      assertExpiryWinner(input.baseline, actual, input.snapshotInput, {
        raceStartedAt: input.raceStartedAt,
        raceSettledAt: input.raceSettledAt
      });
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
    await advanceToInService(customerCompletionRace.id, completionRaceOrder.order.id);
    await makeDue(completionRaceFixture.task.id);
    assert(completionRaceFixture.claim !== null, "completion race claim fixture is missing");
    const completionSnapshotInput = {
      taskId: completionRaceFixture.task.id,
      bookingOrderId: completionRaceOrder.order.id,
      scheduleSlotId: completionRaceOrder.order.scheduleSlotId,
      claimId: completionRaceFixture.claim.id,
      attributionId: completionRaceOrder.attribution.id,
      publisherWalletId: publisherWallet.id,
      claimantUserId: claimantCompletionRace.id,
      customerUserId: customerCompletionRace.id
    };
    const completionPreRaceSnapshot = await captureRaceSnapshot(completionSnapshotInput);
    const completionPublisherBefore = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const completionExpiryFailures: Array<{ taskId: number; code: number; message: string }> = [];
    const completionRaceStartedAt = new Date();
    const completionRuns = await Promise.allSettled([
      runRaceExpiry(completionExpiryFailures, completionRaceStartedAt),
      booking.transitionOrder(
        actor(customerCompletionRace.id),
        completionRaceOrder.order.id,
        "complete"
      )
    ]);
    const completionRaceSettledAt = new Date();
    assert(
      !(completionRuns[0].status === "rejected" && completionRuns[1].status === "rejected"),
      "completion expiry race lost both operations"
    );
    const completionExpirySummary = await resolveProductionRaceOutcome({
      initial: completionRuns[0],
      verifyRollback: async () => {
        assert(
          completionExpiryFailures.length === 1,
          "completion expiry race did not report its exhausted transaction failure"
        );
        await assertExpiryVictimRollback({
          flow: "completion",
          baseline: completionPreRaceSnapshot,
          snapshotInput: completionSnapshotInput,
          raceStartedAt: completionRaceStartedAt,
          raceSettledAt: completionRaceSettledAt
        });
      },
      validateFulfilled: requireSuccessfulExpirySummary
    });
    const completionFormalResult = await resolveProductionRaceOutcome({
      initial: completionRuns[1],
      verifyRollback: async () => {
        await assertBookingVictimRollback({
          baseline: completionPreRaceSnapshot,
          snapshotInput: completionSnapshotInput,
          raceStartedAt: completionRaceStartedAt,
          raceSettledAt: completionRaceSettledAt
        });
      }
    });
    assert(
      completionExpiryFailures.length === 0 &&
        completionExpirySummary.failed === 0 &&
        completionFormalResult.status === "completed",
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
    const completionCustomerWallet = await prisma.wallet.findUniqueOrThrow({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: customerCompletionRace.id,
          currency: "NDP"
        }
      }
    });
    walletIds.push(completionCustomerWallet.id);
    const [
      completionBooking,
      completionHistory,
      completionSlot,
      completionHold,
      completionFinancial,
      completionBookingLedgers,
      completionFeeLogs
    ] = await Promise.all([
      prisma.bookingOrder.findUniqueOrThrow({ where: { id: completionRaceOrder.order.id } }),
      prisma.orderStatusHistory.findMany({
        where: { bookingOrderId: completionRaceOrder.order.id },
        orderBy: { id: "asc" }
      }),
      prisma.scheduleSlot.findUniqueOrThrow({
        where: { id: completionRaceOrder.order.scheduleSlotId }
      }),
      prisma.walletHold.findFirstOrThrow({
        where: { bookingOrderId: completionRaceOrder.order.id, deletedAt: null }
      }),
      prisma.orderFinancial.findUniqueOrThrow({
        where: { bookingOrderId: completionRaceOrder.order.id }
      }),
      prisma.ledgerTransaction.findMany({
        where: {
          type: { in: ["BOOKING_ACCEPT_FREEZE", "BOOKING_COMPLETE_SETTLEMENT"] },
          referenceType: "booking_order",
          referenceId: completionRaceOrder.order.id,
          deletedAt: null
        },
        include: { entries: true, reconciliation: true },
        orderBy: { id: "asc" }
      }),
      prisma.feeCalculationLog.findMany({
        where: { bookingOrderId: completionRaceOrder.order.id, deletedAt: null },
        orderBy: { id: "asc" }
      })
    ]);
    ledgerTransactionIds.push(...completionBookingLedgers.map((transaction) => transaction.id));
    const completionFormalAudits = await prisma.auditLog.findMany({
      where: {
        actorId: customerCompletionRace.id,
        action: {
          in: [
            "ledger.booking_accept.freeze",
            "ledger.booking_complete.settlement",
            "ledger.affiliate_reward.settlement",
            "affiliate.reward.settled"
          ]
        },
        deletedAt: null
      }
    });
    const completionEndedAt = completionState.task.endedAt;
    assert(
      completionBooking.status === "COMPLETED" &&
        completionHistory.length === 4 &&
        completionHistory[0].fromStatus === null &&
        completionHistory[0].toStatus === "PENDING" &&
        completionHistory[1].fromStatus === "PENDING" &&
        completionHistory[1].toStatus === "CONFIRMED" &&
        completionHistory[2].fromStatus === "CONFIRMED" &&
        completionHistory[2].toStatus === "IN_SERVICE" &&
        completionHistory[3].fromStatus === "IN_SERVICE" &&
        completionHistory[3].toStatus === "COMPLETED" &&
        completionSlot.status === "BOOKED" &&
        completionSlot.bookedCount === 1 &&
        completionHold.holdAmountNdp === BOOKING_FEE_NDP &&
        completionHold.capturedAmountNdp === BOOKING_FEE_NDP &&
        completionHold.releasedAmountNdp === 0 &&
        completionHold.status === "captured" &&
        completionHold.capturedAt !== null &&
        completionFinancial.bPlatformFeeHoldNdp === BOOKING_FEE_NDP &&
        completionFinancial.bPlatformFeeActualNdp === BOOKING_FEE_NDP &&
        completionFinancial.userRewardNdp === 0 &&
        completionFinancial.releasedNdp === 0 &&
        completionFinancial.settlementStatus === "settled" &&
        completionFeeLogs.length === 3 &&
        completionFeeLogs.filter((row) => row.calculationStage === "hold").length === 1 &&
        completionFeeLogs.filter((row) => row.calculationStage === "capture").length === 2 &&
        completionBookingLedgers.length === 2 &&
        completionBookingLedgers[0].type === "BOOKING_ACCEPT_FREEZE" &&
        completionBookingLedgers[0].amount === BOOKING_FEE_NDP &&
        completionBookingLedgers[0].entries.length === 1 &&
        completionBookingLedgers[0].entries[0].availableDelta === -BOOKING_FEE_NDP &&
        completionBookingLedgers[0].entries[0].frozenDelta === BOOKING_FEE_NDP &&
        completionBookingLedgers[0].reconciliation?.differenceAmount === 0 &&
        completionBookingLedgers[1].type === "BOOKING_COMPLETE_SETTLEMENT" &&
        completionBookingLedgers[1].amount === BOOKING_FEE_NDP &&
        completionBookingLedgers[1].entries.length === 1 &&
        completionBookingLedgers[1].entries[0].availableDelta === 0 &&
        completionBookingLedgers[1].entries[0].frozenDelta === -BOOKING_FEE_NDP &&
        completionBookingLedgers[1].reconciliation?.differenceAmount === 0 &&
        completionFormalAudits.length === 4 &&
        new Set(completionFormalAudits.map((row) => row.action)).size === 4 &&
        completionCustomerWallet.availableBalance === 0 &&
        completionCustomerWallet.frozenBalance === 0 &&
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
          -1_500 - BOOKING_FEE_NDP &&
        completionClaimantWallet.availableBalance === REWARD_NDP &&
        completionSettlementLedger.entries.length === 2 &&
        completionSettlementLedger.reconciliation?.differenceAmount === 0 &&
        completionSettlementLedger.affiliateBudgetTransactions.length === 1 &&
        completionSettlementLedger.affiliateBudgetTransactions[0].kind === "SETTLEMENT" &&
        completionPublisherBefore.availableBalance + completionPublisherBefore.frozenBalance ===
          completionPublisherAfter.availableBalance +
            completionPublisherAfter.frozenBalance +
            completionClaimantWallet.availableBalance +
            BOOKING_FEE_NDP,
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
    await booking.transitionOrder(
      actor(customerCancellationRace.id),
      cancellationRaceOrder.order.id,
      "confirm"
    );
    await makeDue(cancellationRaceFixture.task.id);
    assert(cancellationRaceFixture.claim !== null, "cancellation race claim fixture is missing");
    const cancellationSnapshotInput = {
      taskId: cancellationRaceFixture.task.id,
      bookingOrderId: cancellationRaceOrder.order.id,
      scheduleSlotId: cancellationRaceOrder.order.scheduleSlotId,
      claimId: cancellationRaceFixture.claim.id,
      attributionId: cancellationRaceOrder.attribution.id,
      publisherWalletId: publisherWallet.id,
      claimantUserId: claimantCancellationRace.id,
      customerUserId: customerCancellationRace.id
    };
    const cancellationPreRaceSnapshot = await captureRaceSnapshot(cancellationSnapshotInput);
    const cancellationWalletBefore = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const cancellationExpiryFailures: Array<{ taskId: number; code: number; message: string }> = [];
    const cancellationRaceStartedAt = new Date();
    const cancellationRuns = await Promise.allSettled([
      runRaceExpiry(cancellationExpiryFailures, cancellationRaceStartedAt),
      booking.transitionOrder(
        actor(customerCancellationRace.id),
        cancellationRaceOrder.order.id,
        "cancel",
        "expiry acceptance cancellation race"
      )
    ]);
    const cancellationRaceSettledAt = new Date();
    assert(
      !(cancellationRuns[0].status === "rejected" && cancellationRuns[1].status === "rejected"),
      "cancellation expiry race lost both operations"
    );
    const cancellationExpirySummary = await resolveProductionRaceOutcome({
      initial: cancellationRuns[0],
      verifyRollback: async () => {
        assert(
          cancellationExpiryFailures.length === 1,
          "cancellation expiry race did not report its exhausted transaction failure"
        );
        await assertExpiryVictimRollback({
          flow: "cancellation",
          baseline: cancellationPreRaceSnapshot,
          snapshotInput: cancellationSnapshotInput,
          raceStartedAt: cancellationRaceStartedAt,
          raceSettledAt: cancellationRaceSettledAt
        });
      },
      validateFulfilled: requireSuccessfulExpirySummary
    });
    const cancellationFormalResult = await resolveProductionRaceOutcome({
      initial: cancellationRuns[1],
      verifyRollback: async () => {
        await assertBookingVictimRollback({
          baseline: cancellationPreRaceSnapshot,
          snapshotInput: cancellationSnapshotInput,
          raceStartedAt: cancellationRaceStartedAt,
          raceSettledAt: cancellationRaceSettledAt
        });
      }
    });
    assert(
      cancellationExpiryFailures.length === 0 &&
        cancellationExpirySummary.failed === 0 &&
        cancellationFormalResult.status === "cancelled",
      "cancellation expiry race did not finish both formal operations"
    );
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
    const [
      cancellationBooking,
      cancellationHistory,
      cancellationSlot,
      cancellationHold,
      cancellationFinancial,
      cancellationBookingLedgers,
      cancellationFeeLogs
    ] = await Promise.all([
      prisma.bookingOrder.findUniqueOrThrow({ where: { id: cancellationRaceOrder.order.id } }),
      prisma.orderStatusHistory.findMany({
        where: { bookingOrderId: cancellationRaceOrder.order.id },
        orderBy: { id: "asc" }
      }),
      prisma.scheduleSlot.findUniqueOrThrow({
        where: { id: cancellationRaceOrder.order.scheduleSlotId }
      }),
      prisma.walletHold.findFirstOrThrow({
        where: { bookingOrderId: cancellationRaceOrder.order.id, deletedAt: null }
      }),
      prisma.orderFinancial.findUniqueOrThrow({
        where: { bookingOrderId: cancellationRaceOrder.order.id }
      }),
      prisma.ledgerTransaction.findMany({
        where: {
          type: { in: ["BOOKING_ACCEPT_FREEZE", "BOOKING_CANCEL_UNFREEZE"] },
          referenceType: "booking_order",
          referenceId: cancellationRaceOrder.order.id,
          deletedAt: null
        },
        include: { entries: true, reconciliation: true },
        orderBy: { id: "asc" }
      }),
      prisma.feeCalculationLog.findMany({
        where: { bookingOrderId: cancellationRaceOrder.order.id, deletedAt: null },
        orderBy: { id: "asc" }
      })
    ]);
    ledgerTransactionIds.push(...cancellationBookingLedgers.map((transaction) => transaction.id));
    const cancellationFormalAudits = await prisma.auditLog.findMany({
      where: {
        actorId: customerCancellationRace.id,
        action: {
          in: [
            "ledger.booking_accept.freeze",
            "ledger.booking_cancel.unfreeze",
            "affiliate.attribution.invalidated"
          ]
        },
        deletedAt: null
      }
    });
    assert(
      cancellationBooking.status === "CANCELLED" &&
        cancellationBooking.cancelReason === "expiry acceptance cancellation race" &&
        cancellationHistory.length === 3 &&
        cancellationHistory[0].fromStatus === null &&
        cancellationHistory[0].toStatus === "PENDING" &&
        cancellationHistory[1].fromStatus === "PENDING" &&
        cancellationHistory[1].toStatus === "CONFIRMED" &&
        cancellationHistory[2].fromStatus === "CONFIRMED" &&
        cancellationHistory[2].toStatus === "CANCELLED" &&
        cancellationHistory[2].reason === "expiry acceptance cancellation race" &&
        cancellationSlot.status === "AVAILABLE" &&
        cancellationSlot.bookedCount === 0 &&
        cancellationHold.holdAmountNdp === BOOKING_FEE_NDP &&
        cancellationHold.capturedAmountNdp === 0 &&
        cancellationHold.releasedAmountNdp === BOOKING_FEE_NDP &&
        cancellationHold.status === "released" &&
        cancellationHold.releasedAt !== null &&
        cancellationFinancial.bPlatformFeeHoldNdp === BOOKING_FEE_NDP &&
        cancellationFinancial.bPlatformFeeActualNdp === 0 &&
        cancellationFinancial.userRewardNdp === 0 &&
        cancellationFinancial.releasedNdp === BOOKING_FEE_NDP &&
        cancellationFinancial.settlementStatus === "cancelled" &&
        cancellationFeeLogs.length === 1 &&
        cancellationFeeLogs[0].calculationStage === "hold" &&
        cancellationBookingLedgers.length === 2 &&
        cancellationBookingLedgers[0].type === "BOOKING_ACCEPT_FREEZE" &&
        cancellationBookingLedgers[0].amount === BOOKING_FEE_NDP &&
        cancellationBookingLedgers[0].entries.length === 1 &&
        cancellationBookingLedgers[0].entries[0].availableDelta === -BOOKING_FEE_NDP &&
        cancellationBookingLedgers[0].entries[0].frozenDelta === BOOKING_FEE_NDP &&
        cancellationBookingLedgers[0].reconciliation?.differenceAmount === 0 &&
        cancellationBookingLedgers[1].type === "BOOKING_CANCEL_UNFREEZE" &&
        cancellationBookingLedgers[1].amount === BOOKING_FEE_NDP &&
        cancellationBookingLedgers[1].entries.length === 1 &&
        cancellationBookingLedgers[1].entries[0].availableDelta === BOOKING_FEE_NDP &&
        cancellationBookingLedgers[1].entries[0].frozenDelta === -BOOKING_FEE_NDP &&
        cancellationBookingLedgers[1].reconciliation?.differenceAmount === 0 &&
        cancellationFormalAudits.length === 3 &&
        new Set(cancellationFormalAudits.map((row) => row.action)).size === 3 &&
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
          1_500 + BOOKING_FEE_NDP &&
        cancellationWalletAfter.frozenBalance - cancellationWalletBefore.frozenBalance ===
          -1_500 - BOOKING_FEE_NDP &&
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
    const concurrentFailures: Array<{ taskId: number; code: number; message: string }> = [];
    const concurrentRuns = await Promise.allSettled([
      createExpiry((failure) => concurrentFailures.push(failure)).expireDue({
        now,
        batchSize: 500
      }),
      createExpiry((failure) => concurrentFailures.push(failure)).expireDue({
        now,
        batchSize: 500
      })
    ]);
    assert(
      concurrentRuns.every((run) => run.status === "fulfilled") &&
        concurrentRuns.every((run) => run.status === "fulfilled" && run.value.failed === 0) &&
        concurrentFailures.length === 0 &&
        concurrentRuns.reduce(
          (sum, run) => sum + (run.status === "fulfilled" ? run.value.released : 0),
          0
        ) === 1 &&
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
        bookingCompleted: completionBooking.status === "COMPLETED",
        settled: completionAttribution.status === "SETTLED",
        outerFinance: completionFinancial.settlementStatus === "settled"
      },
      cancellationRace: {
        bookingCancelled: cancellationBooking.status === "CANCELLED",
        invalidated: cancellationAttribution.status === "INVALIDATED",
        outerFinance: cancellationFinancial.settlementStatus === "cancelled",
        releaseTransactions: cancellationReleaseLedgers.length
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
        bookingTransactions: completionBookingLedgers.length + cancellationBookingLedgers.length,
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
            },
            {
              referenceType: "booking_order",
              referenceId: { in: bookingIds }
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
        await transaction.walletHold.deleteMany({
          where: { bookingOrderId: { in: bookingIds } }
        });
        await transaction.orderFinancial.deleteMany({
          where: { bookingOrderId: { in: bookingIds } }
        });
        await transaction.feeCalculationLog.deleteMany({
          where: { bookingOrderId: { in: bookingIds } }
        });
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
        await transaction.affiliateTaskTranslation.deleteMany({
          where: { taskId: { in: taskIds } }
        });
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
      if (feeRuleSetId !== null) {
        await transaction.platformFeeRule.deleteMany({ where: { ruleSetId: feeRuleSetId } });
        await transaction.platformFeeRuleSet.deleteMany({ where: { id: feeRuleSetId } });
      }
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
      prisma.affiliateTaskShop.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateTaskService.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateTaskTranslation.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateClaim.count({ where: { id: { in: claimIds } } }),
      prisma.affiliateTouch.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateAttribution.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateReward.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateRiskEvent.count({ where: { taskId: { in: taskIds } } }),
      prisma.bookingOrder.count({ where: { id: { in: bookingIds } } }),
      prisma.walletHold.count({ where: { bookingOrderId: { in: bookingIds } } }),
      prisma.orderFinancial.count({ where: { bookingOrderId: { in: bookingIds } } }),
      prisma.feeCalculationLog.count({ where: { bookingOrderId: { in: bookingIds } } }),
      prisma.orderStatusHistory.count({ where: { bookingOrderId: { in: bookingIds } } }),
      prisma.scheduleSlot.count({ where: { id: { in: slotIds } } }),
      prisma.affiliateBudgetReservation.count({ where: { taskId: { in: taskIds } } }),
      prisma.affiliateRewardTransaction.count({
        where: { ledgerTransactionId: { in: ledgerTransactionIds } }
      }),
      prisma.affiliateBudgetTransaction.count({
        where: { ledgerTransactionId: { in: ledgerTransactionIds } }
      }),
      prisma.walletLedger.count({ where: { transactionId: { in: ledgerTransactionIds } } }),
      prisma.financeReconciliation.count({
        where: { transactionId: { in: ledgerTransactionIds } }
      }),
      prisma.ledgerTransaction.count({ where: { id: { in: ledgerTransactionIds } } }),
      prisma.wallet.count({
        where: {
          OR: [
            { id: { in: walletIds } },
            { ownerType: "USER", ownerId: { in: userIds } },
            ...(shopId === null ? [] : [{ ownerType: "SHOP" as const, ownerId: shopId }])
          ]
        }
      }),
      prisma.auditLog.count({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { targetType: "affiliate_task", targetId: { in: taskIds } },
            { targetType: "booking_order", targetId: { in: bookingIds } },
            { targetType: "ledger_transaction", targetId: { in: ledgerTransactionIds } }
          ]
        }
      }),
      ...(feeRuleSetId === null
        ? []
        : [
            prisma.platformFeeRule.count({ where: { ruleSetId: feeRuleSetId } }),
            prisma.platformFeeRuleSet.count({ where: { id: feeRuleSetId } })
          ])
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
