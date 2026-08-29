import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { AppError } from "../src/utils/app-error";
import { assertSafeAffiliateCompletionDatabase } from "./lib/assert-safe-affiliate-completion-database";

const REWARD_NDP = 1_000;
const BOOKING_FEE_NDP = 100;
const SERVICE_PRICE_JPY = 8_800;
const TOTAL_FROZEN_NDP = 10_000;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

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
    { BookingRepository },
    { BookingService },
    { FeeRuleRepository },
    { FeeCalculationService },
    { LedgerRepository },
    { LedgerService },
    { createFormalTestUser, deleteFormalTestUserFoundations },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/affiliate-checkout.repository"),
    import("../src/services/affiliate-checkout.service"),
    import("../src/services/affiliate-link-token.service"),
    import("../src/repositories/booking.repository"),
    import("../src/services/booking.service"),
    import("../src/repositories/fee-rule.repository"),
    import("../src/services/fee-calculation.service"),
    import("../src/repositories/ledger.repository"),
    import("../src/services/ledger.service"),
    import("./support/formal-test-user"),
    import("../src/prisma/client")
  ]);

  const marker = `affiliate-service-completion-${Date.now()}-${process.pid}`;
  const userIds: number[] = [];
  const taskIds: number[] = [];
  const claimIds: number[] = [];
  const slotIds: number[] = [];
  const bookingIds: number[] = [];
  const rewardIds: number[] = [];
  const ledgerTransactionIds: number[] = [];
  const walletIds: number[] = [];
  let categoryId: number | null = null;
  let shopId: number | null = null;
  let serviceId: number | null = null;
  let feeRuleSetId: number | null = null;

  try {
    const passwordHash = await hash("AffiliateCompletionFlow.2026!", 12);
    const createUser = async (label: string) => {
      const user = await createFormalTestUser(prisma, {
        email: `${marker}-${label}@needo.test`,
        passwordHash,
        username: `${marker} ${label}`
      });
      userIds.push(user.id);
      return user;
    };
    const publisher = await createUser("publisher");
    const claimantNormal = await createUser("claimant-normal");
    const claimantRace = await createUser("claimant-race");
    const claimantLimit = await createUser("claimant-limit");
    const claimantFailure = await createUser("claimant-failure");
    const claimantWalletRace = await createUser("claimant-wallet-race");
    const customerNormal = await createUser("customer-normal");
    const customerRace = await createUser("customer-race");
    const customerClaimLimit = await createUser("customer-claim-limit");
    const customerFailure = await createUser("customer-failure");

    const category = await prisma.category.create({
      data: { code: `${marker}-category`, name: `${marker} category` }
    });
    categoryId = category.id;
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: publisher.id,
        name: `${marker} shop`,
        city: "Tokyo",
        address: "Local affiliate completion acceptance",
        status: "published",
        pricingMode: "MERCHANT"
      }
    });
    shopId = shop.id;
    const service = await prisma.service.create({
      data: {
        categoryId: category.id,
        shopId: shop.id,
        name: `${marker} Aroma 60`,
        city: "Tokyo",
        priceAmount: SERVICE_PRICE_JPY,
        durationMinutes: 60,
        status: "published"
      }
    });
    serviceId = service.id;
    const publisherWallet = await prisma.wallet.create({
      data: {
        ownerType: "SHOP",
        ownerId: shop.id,
        availableBalance: 10_000,
        frozenBalance: TOTAL_FROZEN_NDP
      }
    });
    walletIds.push(publisherWallet.id);

    const linkTokens = new AffiliateLinkTokenService({
      secret: process.env.AFFILIATE_LINK_SECRET || "",
      publicBaseUrl: process.env.AFFILIATE_PUBLIC_BASE_URL || ""
    });
    const now = new Date();
    const feeRuleSet = await prisma.platformFeeRuleSet.create({
      data: {
        name: `${marker} booking fee`,
        status: "active",
        priority: 1,
        effectiveFrom: new Date(now.getTime() - 24 * 60 * 60 * 1_000),
        createdById: publisher.id,
        updatedById: publisher.id,
        rules: {
          create: {
            feeType: "b_platform_fee",
            orderType: "booking",
            payerType: "shop",
            baseAmountNdp: BOOKING_FEE_NDP,
            priority: 1,
            status: "active",
            createdById: publisher.id,
            updatedById: publisher.id
          }
        }
      }
    });
    feeRuleSetId = feeRuleSet.id;
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
    const actor = (userId: number) => ({ userId, roles: ["customer"] });
    const taskStartsAt = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const taskEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
    let slotOffsetHours = 2;

    const createClaim = async (input: {
      taskId: number;
      claimantUserId: number;
      label: string;
      completedOrderCount?: number;
    }) => {
      const issued = linkTokens.issue({
        taskId: input.taskId,
        userId: input.claimantUserId,
        expiresAt: taskEndsAt
      });
      const claim = await prisma.affiliateClaim.create({
        data: {
          taskId: input.taskId,
          userId: input.claimantUserId,
          activeKey: `${input.taskId}:${input.claimantUserId}`,
          publicCode: `NDO-${input.label}-${input.taskId}`.slice(0, 40).toUpperCase(),
          publicTokenId: issued.publicTokenId,
          tokenHash: issued.tokenHash,
          status: "ACTIVE",
          expiresAt: taskEndsAt,
          completedOrderCount: input.completedOrderCount ?? 0
        }
      });
      claimIds.push(claim.id);
      return claim;
    };

    const createTaskAndClaim = async (input: {
      label: string;
      claimantUserId: number;
      totalBudgetNdp: number;
      maxCompletedOrdersPerClaim?: number;
      maxCompletedOrdersPerCustomer?: number;
      completedOrderCount?: number;
    }) => {
      const task = await prisma.affiliateTask.create({
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
          claimEndsAt: taskEndsAt,
          taskStartsAt,
          taskEndsAt,
          attributionWindowDays: 14,
          maxCompletedOrdersPerClaim: input.maxCompletedOrdersPerClaim,
          maxCompletedOrdersPerCustomer: input.maxCompletedOrdersPerCustomer,
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
      taskIds.push(task.id);
      const claim = await createClaim({
        taskId: task.id,
        claimantUserId: input.claimantUserId,
        label: input.label,
        completedOrderCount: input.completedOrderCount
      });
      return { task, claim };
    };

    const createAttributedOrder = async (input: { customerUserId: number; publicCode: string }) => {
      const startsAt = new Date(now.getTime() + slotOffsetHours * 60 * 60 * 1_000);
      slotOffsetHours += 2;
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
      const order = await booking.createBooking(actor(input.customerUserId), {
        serviceId: service.id,
        scheduleSlotId: slot.id,
        fulfillmentMode: "store",
        affiliateCode: input.publicCode
      });
      bookingIds.push(order.id);
      return order;
    };

    const advanceToInService = async (customerUserId: number, bookingOrderId: number) => {
      await booking.transitionOrder(actor(customerUserId), bookingOrderId, "confirm");
      return booking.transitionOrder(actor(customerUserId), bookingOrderId, "start");
    };

    const normal = await createTaskAndClaim({
      label: "normal",
      claimantUserId: claimantNormal.id,
      totalBudgetNdp: 3_000,
      maxCompletedOrdersPerCustomer: 1
    });
    const normalOrder = await createAttributedOrder({
      customerUserId: customerNormal.id,
      publicCode: normal.claim.publicCode
    });
    assert(
      (await prisma.affiliateReward.count({
        where: { taskId: normal.task.id, deletedAt: null }
      })) === 0,
      "reward was created before service completion"
    );
    await advanceToInService(customerNormal.id, normalOrder.id);
    assert(
      (await prisma.affiliateReward.count({
        where: { taskId: normal.task.id, deletedAt: null }
      })) === 0,
      "reward was created before service completion"
    );

    const completedNormal = await booking.transitionOrder(
      actor(customerNormal.id),
      normalOrder.id,
      "complete"
    );
    const normalAttribution = await prisma.affiliateAttribution.findFirstOrThrow({
      where: { bookingOrderId: normalOrder.id, deletedAt: null }
    });
    const normalReward = await prisma.affiliateReward.findUniqueOrThrow({
      where: { attributionId: normalAttribution.id }
    });
    rewardIds.push(normalReward.id);
    const normalLedger = await prisma.ledgerTransaction.findFirstOrThrow({
      where: {
        type: "AFFILIATE_REWARD_SETTLEMENT",
        referenceType: "affiliate_reward",
        referenceId: normalReward.id,
        deletedAt: null
      },
      include: { entries: true, reconciliation: true }
    });
    ledgerTransactionIds.push(normalLedger.id);
    const normalBookingLedger = await prisma.ledgerTransaction.findFirstOrThrow({
      where: {
        type: "BOOKING_COMPLETE_SETTLEMENT",
        referenceType: "booking_order",
        referenceId: normalOrder.id,
        deletedAt: null
      }
    });
    ledgerTransactionIds.push(normalBookingLedger.id);
    const normalOrderFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: normalOrder.id }
    });
    const normalReservation = await prisma.affiliateBudgetReservation.findUniqueOrThrow({
      where: { taskId: normal.task.id }
    });
    const normalTask = await prisma.affiliateTask.findUniqueOrThrow({
      where: { id: normal.task.id }
    });
    const normalClaim = await prisma.affiliateClaim.findUniqueOrThrow({
      where: { id: normal.claim.id }
    });
    const publisherAfterNormal = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    const claimantNormalWallet = await prisma.wallet.findUniqueOrThrow({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: claimantNormal.id,
          currency: "NDP"
        }
      }
    });
    walletIds.push(claimantNormalWallet.id);
    assert(
      completedNormal.status === "completed" &&
        completedNormal.affiliate?.attributionStatus === "settled" &&
        normalAttribution.status === "SETTLED" &&
        normalReward.status === "SETTLED" &&
        publisherAfterNormal.frozenBalance === TOTAL_FROZEN_NDP - REWARD_NDP &&
        claimantNormalWallet.availableBalance === REWARD_NDP &&
        normalReservation.allocatedNdp === 0 &&
        normalReservation.capturedNdp === REWARD_NDP &&
        normalTask.allocatedBudgetNdp === 0 &&
        normalTask.settledBudgetNdp === REWARD_NDP &&
        normalClaim.completedOrderCount === 1 &&
        normalClaim.settledRewardNdp === REWARD_NDP &&
        normalOrderFinancial.settlementStatus === "settled" &&
        normalOrderFinancial.bPlatformFeeActualNdp === BOOKING_FEE_NDP,
      "service completion did not settle exact reward state"
    );
    assert(
      normalLedger.entries.length === 2 &&
        normalLedger.reconciliation?.differenceAmount === 0 &&
        (await prisma.affiliateBudgetTransaction.count({
          where: {
            ledgerTransactionId: normalLedger.id,
            kind: "SETTLEMENT",
            amountNdp: REWARD_NDP
          }
        })) === 1 &&
        (await prisma.affiliateRewardTransaction.count({
          where: {
            ledgerTransactionId: normalLedger.id,
            kind: "SETTLEMENT",
            amountNdp: REWARD_NDP
          }
        })) === 1,
      "affiliate_reward_settlement finance evidence is incomplete"
    );
    console.log("PASS service completion settles booking finance and exact affiliate reward");

    const repeatSettlement = () =>
      prisma.$transaction((transaction) =>
        affiliateCheckout.settleCompletedBooking({
          bookingOrderId: normalOrder.id,
          customerUserId: customerNormal.id,
          shopId: shop.id,
          serviceId: service.id,
          actorUserId: customerNormal.id,
          transactionClient: transaction
        })
      );
    const repeated = await Promise.allSettled([repeatSettlement(), repeatSettlement()]);
    assert(
      repeated.every((result) => result.status === "fulfilled" && result.value.idempotent),
      "concurrent settled reward retry was not idempotent"
    );
    assert(
      (await prisma.ledgerTransaction.count({
        where: {
          type: "AFFILIATE_REWARD_SETTLEMENT",
          referenceType: "affiliate_reward",
          referenceId: normalReward.id,
          deletedAt: null
        }
      })) === 1,
      "reward retry duplicated ledger transaction"
    );
    console.log("PASS repeated and concurrent settled retries are idempotent");

    const customerLimitOrder = await createAttributedOrder({
      customerUserId: customerNormal.id,
      publicCode: normal.claim.publicCode
    });
    await advanceToInService(customerNormal.id, customerLimitOrder.id);
    const customerLimitCompleted = await booking.transitionOrder(
      actor(customerNormal.id),
      customerLimitOrder.id,
      "complete"
    );
    const customerLimitAttribution = await prisma.affiliateAttribution.findFirstOrThrow({
      where: { bookingOrderId: customerLimitOrder.id, deletedAt: null }
    });
    assert(
      customerLimitCompleted.status === "completed" &&
        customerLimitAttribution.status === "INVALIDATED" &&
        customerLimitAttribution.invalidationReason === "customer_completed_order_limit_reached" &&
        (await prisma.affiliateReward.count({
          where: { attributionId: customerLimitAttribution.id, deletedAt: null }
        })) === 0,
      "customer_completed_order_limit_reached did not release without reward"
    );

    const claimLimit = await createTaskAndClaim({
      label: "claim-limit",
      claimantUserId: claimantLimit.id,
      totalBudgetNdp: 1_000,
      maxCompletedOrdersPerClaim: 1,
      completedOrderCount: 1
    });
    const claimLimitOrder = await createAttributedOrder({
      customerUserId: customerClaimLimit.id,
      publicCode: claimLimit.claim.publicCode
    });
    await advanceToInService(customerClaimLimit.id, claimLimitOrder.id);
    await booking.transitionOrder(actor(customerClaimLimit.id), claimLimitOrder.id, "complete");
    const claimLimitAttribution = await prisma.affiliateAttribution.findFirstOrThrow({
      where: { bookingOrderId: claimLimitOrder.id, deletedAt: null }
    });
    const claimLimitTask = await prisma.affiliateTask.findUniqueOrThrow({
      where: { id: claimLimit.task.id }
    });
    const claimLimitReservation = await prisma.affiliateBudgetReservation.findUniqueOrThrow({
      where: { taskId: claimLimit.task.id }
    });
    assert(
      claimLimitAttribution.status === "INVALIDATED" &&
        claimLimitAttribution.invalidationReason === "claim_completed_order_limit_reached" &&
        claimLimitTask.status === "ACTIVE" &&
        claimLimitReservation.status === "ACTIVE" &&
        (await prisma.affiliateReward.count({
          where: { attributionId: claimLimitAttribution.id, deletedAt: null }
        })) === 0,
      "claim_completed_order_limit_reached did not release without reward"
    );
    console.log("PASS claim and customer completion limits release without reward");

    const customerLimitRace = await createTaskAndClaim({
      label: "customer-limit-race",
      claimantUserId: claimantRace.id,
      totalBudgetNdp: 2_000,
      maxCompletedOrdersPerCustomer: 1
    });
    const customerLimitRaceSecondClaim = await createClaim({
      taskId: customerLimitRace.task.id,
      claimantUserId: claimantLimit.id,
      label: "customer-limit-race-second"
    });
    const customerLimitRaceOrders = [
      await createAttributedOrder({
        customerUserId: customerRace.id,
        publicCode: customerLimitRace.claim.publicCode
      }),
      await createAttributedOrder({
        customerUserId: customerRace.id,
        publicCode: customerLimitRaceSecondClaim.publicCode
      })
    ];
    for (const order of customerLimitRaceOrders) {
      await advanceToInService(customerRace.id, order.id);
    }
    const customerCompletionRace = await Promise.allSettled(
      customerLimitRaceOrders.map((order) =>
        booking.transitionOrder(actor(customerRace.id), order.id, "complete")
      )
    );
    assert(
      customerCompletionRace.every((result) => result.status === "fulfilled"),
      "concurrent customer-limit completions did not both finish the service orders"
    );
    const customerLimitRaceAttributions = await prisma.affiliateAttribution.findMany({
      where: {
        bookingOrderId: { in: customerLimitRaceOrders.map((order) => order.id) },
        deletedAt: null
      }
    });
    const customerLimitRaceReward = await prisma.affiliateReward.findFirstOrThrow({
      where: { taskId: customerLimitRace.task.id, deletedAt: null }
    });
    rewardIds.push(customerLimitRaceReward.id);
    const customerLimitRaceLedger = await prisma.ledgerTransaction.findFirstOrThrow({
      where: {
        type: "AFFILIATE_REWARD_SETTLEMENT",
        referenceType: "affiliate_reward",
        referenceId: customerLimitRaceReward.id,
        deletedAt: null
      }
    });
    ledgerTransactionIds.push(customerLimitRaceLedger.id);
    const customerLimitRaceTask = await prisma.affiliateTask.findUniqueOrThrow({
      where: { id: customerLimitRace.task.id }
    });
    const customerLimitRaceReservation = await prisma.affiliateBudgetReservation.findUniqueOrThrow({
      where: { taskId: customerLimitRace.task.id }
    });
    assert(
      customerLimitRaceAttributions.filter((row) => row.status === "SETTLED").length === 1 &&
        customerLimitRaceAttributions.filter(
          (row) =>
            row.status === "INVALIDATED" &&
            row.invalidationReason === "customer_completed_order_limit_reached"
        ).length === 1 &&
        (await prisma.affiliateReward.count({
          where: { taskId: customerLimitRace.task.id, deletedAt: null }
        })) === 1 &&
        customerLimitRaceTask.status === "ACTIVE" &&
        customerLimitRaceReservation.status === "ACTIVE" &&
        customerLimitRaceReservation.allocatedNdp === 0 &&
        customerLimitRaceReservation.capturedNdp === REWARD_NDP,
      "concurrent customer limit did not settle exactly one reward and release the other"
    );
    console.log("PASS concurrent different claims enforce one customer reward");

    const walletRaceFirst = await createTaskAndClaim({
      label: "claimant-wallet-race-first",
      claimantUserId: claimantWalletRace.id,
      totalBudgetNdp: 1_000
    });
    const walletRaceSecond = await createTaskAndClaim({
      label: "claimant-wallet-race-second",
      claimantUserId: claimantWalletRace.id,
      totalBudgetNdp: 1_000
    });
    const walletRaceOrders = [
      await createAttributedOrder({
        customerUserId: customerNormal.id,
        publicCode: walletRaceFirst.claim.publicCode
      }),
      await createAttributedOrder({
        customerUserId: customerRace.id,
        publicCode: walletRaceSecond.claim.publicCode
      })
    ];
    await advanceToInService(customerNormal.id, walletRaceOrders[0].id);
    await advanceToInService(customerRace.id, walletRaceOrders[1].id);
    const claimantWalletCompletionRace = await Promise.allSettled([
      booking.transitionOrder(actor(customerNormal.id), walletRaceOrders[0].id, "complete"),
      booking.transitionOrder(actor(customerRace.id), walletRaceOrders[1].id, "complete")
    ]);
    assert(
      claimantWalletCompletionRace.every((result) => result.status === "fulfilled"),
      "concurrent first claimant-wallet creation did not settle both rewards"
    );
    const walletRaceRewards = await prisma.affiliateReward.findMany({
      where: {
        taskId: { in: [walletRaceFirst.task.id, walletRaceSecond.task.id] },
        status: "SETTLED",
        deletedAt: null
      }
    });
    for (const reward of walletRaceRewards) rewardIds.push(reward.id);
    const walletRaceLedgers = await prisma.ledgerTransaction.findMany({
      where: {
        type: "AFFILIATE_REWARD_SETTLEMENT",
        referenceType: "affiliate_reward",
        referenceId: { in: walletRaceRewards.map((reward) => reward.id) },
        deletedAt: null
      }
    });
    for (const transaction of walletRaceLedgers) ledgerTransactionIds.push(transaction.id);
    const claimantWalletAfterRace = await prisma.wallet.findUniqueOrThrow({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: claimantWalletRace.id,
          currency: "NDP"
        }
      }
    });
    walletIds.push(claimantWalletAfterRace.id);
    assert(
      walletRaceRewards.length === 2 &&
        walletRaceLedgers.length === 2 &&
        claimantWalletAfterRace.availableBalance === 2 * REWARD_NDP,
      "concurrent first claimant-wallet creation lost or duplicated reward finance"
    );
    console.log("PASS concurrent tasks create one claimant wallet and settle both rewards");

    const race = await createTaskAndClaim({
      label: "completion-race",
      claimantUserId: claimantRace.id,
      totalBudgetNdp: 1_000
    });
    const raceOrder = await createAttributedOrder({
      customerUserId: customerRace.id,
      publicCode: race.claim.publicCode
    });
    await advanceToInService(customerRace.id, raceOrder.id);
    const completionRace = await Promise.allSettled([
      booking.transitionOrder(actor(customerRace.id), raceOrder.id, "complete"),
      booking.transitionOrder(actor(customerRace.id), raceOrder.id, "complete")
    ]);
    assert(
      completionRace.filter((result) => result.status === "fulfilled").length === 1,
      "concurrent order completion did not admit exactly one winner"
    );
    const raceAttribution = await prisma.affiliateAttribution.findFirstOrThrow({
      where: { bookingOrderId: raceOrder.id, deletedAt: null }
    });
    const raceReward = await prisma.affiliateReward.findUniqueOrThrow({
      where: { attributionId: raceAttribution.id }
    });
    rewardIds.push(raceReward.id);
    const raceLedger = await prisma.ledgerTransaction.findFirstOrThrow({
      where: {
        type: "AFFILIATE_REWARD_SETTLEMENT",
        referenceType: "affiliate_reward",
        referenceId: raceReward.id,
        deletedAt: null
      }
    });
    ledgerTransactionIds.push(raceLedger.id);
    assert(
      raceAttribution.status === "SETTLED" &&
        (await prisma.affiliateReward.count({
          where: { attributionId: raceAttribution.id, deletedAt: null }
        })) === 1,
      "completion race duplicated or lost the reward"
    );
    console.log("PASS concurrent order completion settles one reward");

    const failure = await createTaskAndClaim({
      label: "frozen-shortage",
      claimantUserId: claimantFailure.id,
      totalBudgetNdp: 1_000
    });
    const failureOrder = await createAttributedOrder({
      customerUserId: customerFailure.id,
      publicCode: failure.claim.publicCode
    });
    await advanceToInService(customerFailure.id, failureOrder.id);
    const failureAttributionBefore = await prisma.affiliateAttribution.findFirstOrThrow({
      where: { bookingOrderId: failureOrder.id, deletedAt: null }
    });
    const failureReservationBefore = await prisma.affiliateBudgetReservation.findUniqueOrThrow({
      where: { taskId: failure.task.id }
    });
    await prisma.wallet.update({
      where: { id: publisherWallet.id },
      data: { frozenBalance: BOOKING_FEE_NDP }
    });
    try {
      await booking.transitionOrder(actor(customerFailure.id), failureOrder.id, "complete");
      throw new Error("expected error.wallet.insufficient_frozen");
    } catch (error) {
      assert(
        error instanceof AppError && error.message === "error.wallet.insufficient_frozen",
        "expected error.wallet.insufficient_frozen"
      );
    }
    const failureOrderAfter = await prisma.bookingOrder.findUniqueOrThrow({
      where: { id: failureOrder.id }
    });
    const failureAttributionAfter = await prisma.affiliateAttribution.findUniqueOrThrow({
      where: { id: failureAttributionBefore.id }
    });
    const failureReservationAfter = await prisma.affiliateBudgetReservation.findUniqueOrThrow({
      where: { taskId: failure.task.id }
    });
    const failureFinancialAfter = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: failureOrder.id }
    });
    const publisherAfterFailure = await prisma.wallet.findUniqueOrThrow({
      where: { id: publisherWallet.id }
    });
    assert(
      failureOrderAfter.status === "IN_SERVICE" &&
        failureAttributionAfter.status === "ATTRIBUTED" &&
        failureReservationAfter.allocatedNdp === failureReservationBefore.allocatedNdp &&
        failureFinancialAfter.settlementStatus === "holding" &&
        failureFinancialAfter.bPlatformFeeActualNdp === 0 &&
        publisherAfterFailure.frozenBalance === BOOKING_FEE_NDP &&
        (await prisma.ledgerTransaction.count({
          where: {
            type: "BOOKING_COMPLETE_SETTLEMENT",
            referenceType: "booking_order",
            referenceId: failureOrder.id,
            deletedAt: null
          }
        })) === 0 &&
        (await prisma.affiliateReward.count({
          where: { attributionId: failureAttributionBefore.id, deletedAt: null }
        })) === 0,
      "completion rollback did not preserve order state"
    );
    console.log("PASS frozen shortage rolls back order and affiliate settlement");

    const rewardAudits = await prisma.auditLog.count({
      where: {
        action: "affiliate.reward.settled",
        targetId: { in: bookingIds },
        deletedAt: null
      }
    });
    assert(rewardAudits === 5, "reward settlement audit count is incorrect");
    console.log(
      JSON.stringify(
        {
          database: databaseName,
          marker,
          settlement: {
            exact: true,
            idempotent: true,
            concurrent: true,
            claimantWalletConcurrent: true
          },
          limits: { claim: true, customer: true, customerConcurrent: true },
          rollback: { insufficientFrozen: true, bookingFinanceAtomic: true },
          finance: { rewards: rewardIds.length, reconciled: true, audited: true },
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$transaction(async (transaction) => {
      const rewards =
        taskIds.length > 0
          ? await transaction.affiliateReward.findMany({
              where: { taskId: { in: taskIds } },
              select: { id: true }
            })
          : [];
      for (const reward of rewards) {
        if (!rewardIds.includes(reward.id)) rewardIds.push(reward.id);
      }
      const ledgerRows =
        rewardIds.length > 0 || bookingIds.length > 0
          ? await transaction.ledgerTransaction.findMany({
              where: {
                OR: [
                  {
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
            })
          : [];
      for (const ledger of ledgerRows) {
        if (!ledgerTransactionIds.includes(ledger.id)) {
          ledgerTransactionIds.push(ledger.id);
        }
      }
      if (ledgerTransactionIds.length > 0) {
        await transaction.affiliateRewardTransaction.deleteMany({
          where: { ledgerTransactionId: { in: ledgerTransactionIds } }
        });
        await transaction.affiliateBudgetTransaction.deleteMany({
          where: { ledgerTransactionId: { in: ledgerTransactionIds } }
        });
      }
      if (taskIds.length > 0) {
        await transaction.affiliateRiskEvent.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateReward.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateAttribution.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTouch.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateClaim.deleteMany({
          where: { taskId: { in: taskIds } }
        });
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
        await transaction.auditLog.deleteMany({
          where: { targetType: "booking_order", targetId: { in: bookingIds } }
        });
        await transaction.orderStatusHistory.deleteMany({
          where: { bookingOrderId: { in: bookingIds } }
        });
        await transaction.bookingOrder.deleteMany({
          where: { id: { in: bookingIds } }
        });
      }
      if (slotIds.length > 0) {
        await transaction.scheduleSlot.deleteMany({
          where: { id: { in: slotIds } }
        });
      }
      if (taskIds.length > 0) {
        await transaction.affiliateBudgetReservation.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTaskService.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTaskShop.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTaskTranslation.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTask.deleteMany({
          where: { id: { in: taskIds } }
        });
      }
      if (ledgerTransactionIds.length > 0) {
        await transaction.auditLog.deleteMany({
          where: {
            targetType: "ledger_transaction",
            targetId: { in: ledgerTransactionIds }
          }
        });
        await transaction.financeReconciliation.deleteMany({
          where: { transactionId: { in: ledgerTransactionIds } }
        });
        await transaction.walletLedger.deleteMany({
          where: { transactionId: { in: ledgerTransactionIds } }
        });
        await transaction.ledgerTransaction.deleteMany({
          where: { id: { in: ledgerTransactionIds } }
        });
      }
      if (userIds.length > 0) {
        const claimantWallets = await transaction.wallet.findMany({
          where: { ownerType: "USER", ownerId: { in: userIds }, currency: "NDP" },
          select: { id: true }
        });
        for (const wallet of claimantWallets) {
          if (!walletIds.includes(wallet.id)) walletIds.push(wallet.id);
        }
      }
      if (walletIds.length > 0) {
        await transaction.wallet.deleteMany({ where: { id: { in: walletIds } } });
      }
      if (serviceId) await transaction.service.deleteMany({ where: { id: serviceId } });
      if (shopId) await transaction.shop.deleteMany({ where: { id: shopId } });
      if (categoryId) await transaction.category.deleteMany({ where: { id: categoryId } });
      if (feeRuleSetId) {
        await transaction.platformFeeRule.deleteMany({ where: { ruleSetId: feeRuleSetId } });
        await transaction.platformFeeRuleSet.deleteMany({ where: { id: feeRuleSetId } });
      }
      if (userIds.length > 0) {
        await transaction.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
        await deleteFormalTestUserFoundations(transaction, userIds);
        await transaction.user.deleteMany({ where: { id: { in: userIds } } });
      }
    });
    const cleanupCounts = await Promise.all([
      prisma.user.count({ where: { email: { startsWith: marker } } }),
      prisma.shop.count({ where: { name: { startsWith: marker } } }),
      prisma.service.count({ where: { name: { startsWith: marker } } }),
      prisma.affiliateTask.count({ where: { taskCode: { startsWith: marker } } }),
      prisma.bookingOrder.count({ where: { id: { in: bookingIds } } }),
      prisma.affiliateReward.count({ where: { id: { in: rewardIds } } }),
      prisma.ledgerTransaction.count({
        where: { id: { in: ledgerTransactionIds } }
      })
    ]);
    assert(
      cleanupCounts.every((count) => count === 0),
      "marker cleanup left reward settlement rows behind"
    );
    console.log("PASS marker-owned reward settlement rows were removed exactly");
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
