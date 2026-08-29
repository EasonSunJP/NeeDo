import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { AppError } from "../src/utils/app-error";

const REWARD_NDP = 1_000;
const SERVICE_PRICE_JPY = 8_800;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const assertSafeLocalDatabase = (): string => {
  assert(process.env.NODE_ENV !== "production", "checkout check rejects production");
  assert(
    !["staging", "prod"].includes(process.env.DEPLOY_ENV || ""),
    "checkout check rejects staging and production deploy environments"
  );
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "checkout check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName),
    "checkout check rejects production-looking database names"
  );
  return databaseName;
};

const expectAppError = async (
  action: () => Promise<unknown>,
  expectedMessage: string
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    assert(
      error instanceof AppError && error.message === expectedMessage,
      `expected ${expectedMessage}`
    );
    return;
  }
  throw new Error(`expected ${expectedMessage}`);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const [
    { AffiliateCheckoutRepository },
    { AffiliateCheckoutService },
    { AffiliateLinkTokenService },
    { BookingRepository },
    { BookingService },
    { createFormalTestUser, deleteFormalTestUserFoundations },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/affiliate-checkout.repository"),
    import("../src/services/affiliate-checkout.service"),
    import("../src/services/affiliate-link-token.service"),
    import("../src/repositories/booking.repository"),
    import("../src/services/booking.service"),
    import("./support/formal-test-user"),
    import("../src/prisma/client")
  ]);

  const marker = `affiliate-checkout-attribution-${Date.now()}-${process.pid}`;
  const userIds: number[] = [];
  const taskIds: number[] = [];
  const claimIds: number[] = [];
  const slotIds: number[] = [];
  const bookingIds: number[] = [];
  let categoryId: number | null = null;
  let shopId: number | null = null;
  const serviceIds: number[] = [];
  let walletId: number | null = null;

  try {
    const passwordHash = await hash("AffiliateCheckoutFlow.2026!", 12);
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
    const claimantFixed = await createUser("claimant-fixed");
    const claimantPercent = await createUser("claimant-percent");
    const claimantNone = await createUser("claimant-none");
    const customerFixed = await createUser("customer-fixed");
    const customerPercent = await createUser("customer-percent");
    const customerNone = await createUser("customer-none");
    const customerRaceA = await createUser("customer-race-a");
    const customerRaceB = await createUser("customer-race-b");
    const customerReplacement = await createUser("customer-replacement");
    const claimantRaceA = await createUser("claimant-race-a");
    const claimantRaceB = await createUser("claimant-race-b");
    const claimantReplacement = await createUser("claimant-replacement");

    const category = await prisma.category.create({
      data: { code: `${marker}-category`, name: `${marker} category` }
    });
    categoryId = category.id;
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: publisher.id,
        name: `${marker} shop`,
        city: "Tokyo",
        address: "Local affiliate checkout acceptance",
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
    const outsideService = await prisma.service.create({
      data: {
        categoryId: category.id,
        shopId: shop.id,
        name: `${marker} Outside 60`,
        city: "Tokyo",
        priceAmount: SERVICE_PRICE_JPY,
        durationMinutes: 60,
        status: "published"
      }
    });
    serviceIds.push(service.id, outsideService.id);

    const wallet = await prisma.wallet.create({
      data: {
        ownerType: "SHOP",
        ownerId: shop.id,
        availableBalance: 5_000_000,
        frozenBalance: 50_000
      }
    });
    walletId = wallet.id;
    const walletBefore = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });

    const now = new Date();
    const taskStartsAt = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const taskEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
    let slotOffsetHours = 2;
    const createSlot = async (targetServiceId = service.id) => {
      const startsAt = new Date(now.getTime() + slotOffsetHours * 60 * 60 * 1_000);
      slotOffsetHours += 2;
      const slot = await prisma.scheduleSlot.create({
        data: {
          serviceId: targetServiceId,
          shopId: shop.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * 60 * 1_000),
          capacity: 1,
          status: "AVAILABLE"
        }
      });
      slotIds.push(slot.id);
      return slot;
    };

    const createTask = async (input: {
      label: string;
      totalBudgetNdp: number;
      status?: "ACTIVE" | "PAUSED" | "BUDGET_EXHAUSTED";
      discountType?: "NONE" | "FIXED_JPY" | "PERCENT";
      fixedDiscountJpy?: number;
      discountRateBps?: number;
      discountCapJpy?: number;
      minimumOrderAmountJpy?: number;
      allocatedNdp?: number;
      reservationStatus?: "ACTIVE" | "EXHAUSTED";
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
          allocatedBudgetNdp: input.allocatedNdp ?? 0,
          customerDiscountType: input.discountType ?? "NONE",
          fixedDiscountJpy: input.fixedDiscountJpy ?? 0,
          discountRateBps: input.discountRateBps ?? 0,
          discountCapJpy: input.discountCapJpy ?? 0,
          minimumOrderAmountJpy: input.minimumOrderAmountJpy ?? 0,
          claimStartsAt: taskStartsAt,
          claimEndsAt: taskEndsAt,
          taskStartsAt,
          taskEndsAt,
          attributionWindowDays: 14,
          serviceScopeMode: "SELECTED_SERVICES",
          status: input.status ?? "ACTIVE",
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
              walletId: wallet.id,
              totalFrozenNdp: input.totalBudgetNdp,
              allocatedNdp: input.allocatedNdp ?? 0,
              status: input.reservationStatus ?? "ACTIVE",
              idempotencyKey: `${marker}-${input.label}-reservation`
            }
          }
        }
      });
      taskIds.push(task.id);
      return task;
    };

    const linkTokens = new AffiliateLinkTokenService({
      secret: process.env.AFFILIATE_LINK_SECRET || "",
      publicBaseUrl: process.env.AFFILIATE_PUBLIC_BASE_URL || ""
    });
    const createClaim = async (taskId: number, userId: number, label: string) => {
      const issued = linkTokens.issue({ taskId, userId, expiresAt: taskEndsAt });
      const claim = await prisma.affiliateClaim.create({
        data: {
          taskId,
          userId,
          activeKey: `${taskId}:${userId}`,
          publicCode: `NDO-${label}-${Date.now()}`.slice(0, 40).toUpperCase(),
          publicTokenId: issued.publicTokenId,
          tokenHash: issued.tokenHash,
          status: "ACTIVE",
          expiresAt: taskEndsAt
        }
      });
      claimIds.push(claim.id);
      return { claim, publicToken: issued.publicToken };
    };

    const checkout = new AffiliateCheckoutService(
      new AffiliateCheckoutRepository(prisma),
      linkTokens
    );
    assert(
      typeof checkout.invalidateCancelledBooking === "function",
      "invalidateCancelledBooking is unavailable"
    );
    const booking = new BookingService(
      new BookingRepository(prisma),
      undefined,
      undefined,
      undefined,
      checkout
    );
    const actor = (userId: number) => ({ userId, roles: ["customer"] });
    const createBooking = async (input: {
      customerUserId: number;
      slotId: number;
      serviceId?: number;
      affiliateCode?: string;
      affiliatePublicToken?: string;
    }) => {
      const order = await booking.createBooking(actor(input.customerUserId), {
        serviceId: input.serviceId ?? service.id,
        scheduleSlotId: input.slotId,
        fulfillmentMode: "store",
        affiliateCode: input.affiliateCode,
        affiliatePublicToken: input.affiliatePublicToken
      });
      bookingIds.push(order.id);
      return order;
    };

    const fixedTask = await createTask({
      label: "fixed",
      totalBudgetNdp: 3_000,
      discountType: "FIXED_JPY",
      fixedDiscountJpy: 500,
      minimumOrderAmountJpy: 5_000
    });
    const fixedClaim = await createClaim(fixedTask.id, claimantFixed.id, "FIXED");
    const percentTask = await createTask({
      label: "percent",
      totalBudgetNdp: 2_000,
      discountType: "PERCENT",
      discountRateBps: 1_500,
      discountCapJpy: 1_000
    });
    const percentClaim = await createClaim(percentTask.id, claimantPercent.id, "PERCENT");
    const noneTask = await createTask({ label: "none", totalBudgetNdp: 1_000 });
    const noneClaim = await createClaim(noneTask.id, claimantNone.id, "NONE");

    const fixedOrder = await createBooking({
      customerUserId: customerFixed.id,
      slotId: (await createSlot()).id,
      affiliateCode: fixedClaim.claim.publicCode
    });
    assert(
      fixedOrder.affiliate?.customerDiscountJpy === 500 &&
        fixedOrder.affiliate.finalPriceJpy === 8_300 &&
        fixedOrder.priceAmount === "8300.00" &&
        fixedOrder.servicePriceSnapshot === "8800.00",
      "FIXED_JPY checkout price snapshot is incorrect"
    );
    const percentOrder = await createBooking({
      customerUserId: customerPercent.id,
      slotId: (await createSlot()).id,
      affiliatePublicToken: percentClaim.publicToken
    });
    assert(
      percentOrder.affiliate?.customerDiscountJpy === 1_000 &&
        percentOrder.affiliate.finalPriceJpy === 7_800,
      "PERCENT checkout price snapshot is incorrect"
    );
    const noneOrder = await createBooking({
      customerUserId: customerNone.id,
      slotId: (await createSlot()).id,
      affiliateCode: noneClaim.claim.publicCode
    });
    assert(
      noneOrder.affiliate?.customerDiscountJpy === 0 &&
        noneOrder.affiliate.finalPriceJpy === SERVICE_PRICE_JPY,
      "NONE checkout changed the customer price"
    );
    console.log("PASS fixed, percent, and no-discount price snapshots");

    const priorityOrder = await createBooking({
      customerUserId: customerRaceA.id,
      slotId: (await createSlot()).id,
      affiliateCode: fixedClaim.claim.publicCode,
      affiliatePublicToken: percentClaim.publicToken
    });
    assert(
      priorityOrder.affiliate?.taskId === fixedTask.id && priorityOrder.affiliate.source === "code",
      "explicit affiliateCode did not take priority over affiliatePublicToken"
    );
    console.log("PASS explicit code priority over signed URL");

    const selfSlot = await createSlot();
    await expectAppError(
      () =>
        booking.createBooking(actor(claimantFixed.id), {
          serviceId: service.id,
          scheduleSlotId: selfSlot.id,
          fulfillmentMode: "store",
          affiliateCode: fixedClaim.claim.publicCode
        }),
      "error.affiliate.self_attribution_forbidden"
    );
    const scopeSlot = await createSlot(outsideService.id);
    await expectAppError(
      () =>
        booking.createBooking(actor(customerRaceB.id), {
          serviceId: outsideService.id,
          scheduleSlotId: scopeSlot.id,
          fulfillmentMode: "store",
          affiliateCode: fixedClaim.claim.publicCode
        }),
      "error.affiliate.promotion_scope_mismatch"
    );
    const minimumTask = await createTask({
      label: "minimum",
      totalBudgetNdp: 1_000,
      minimumOrderAmountJpy: 9_000
    });
    const minimumClaim = await createClaim(minimumTask.id, claimantRaceA.id, "MIN");
    const minimumSlot = await createSlot();
    await expectAppError(
      () =>
        booking.createBooking(actor(customerRaceB.id), {
          serviceId: service.id,
          scheduleSlotId: minimumSlot.id,
          fulfillmentMode: "store",
          affiliateCode: minimumClaim.claim.publicCode
        }),
      "error.affiliate.minimum_order_amount_not_met"
    );
    const pausedTask = await createTask({
      label: "paused",
      totalBudgetNdp: 1_000,
      status: "PAUSED"
    });
    const pausedClaim = await createClaim(pausedTask.id, claimantRaceA.id, "PAUSED");
    const pausedSlot = await createSlot();
    await expectAppError(
      () =>
        booking.createBooking(actor(customerRaceB.id), {
          serviceId: service.id,
          scheduleSlotId: pausedSlot.id,
          fulfillmentMode: "store",
          affiliateCode: pausedClaim.claim.publicCode
        }),
      "error.affiliate.task_not_attributable"
    );
    const unavailableTask = await createTask({
      label: "unavailable",
      totalBudgetNdp: 1_000,
      allocatedNdp: 1_000
    });
    const unavailableClaim = await createClaim(unavailableTask.id, claimantRaceA.id, "EMPTY");
    const unavailableSlot = await createSlot();
    await expectAppError(
      () =>
        booking.createBooking(actor(customerRaceB.id), {
          serviceId: service.id,
          scheduleSlotId: unavailableSlot.id,
          fulfillmentMode: "store",
          affiliateCode: unavailableClaim.claim.publicCode
        }),
      "error.affiliate.budget_unavailable"
    );
    console.log("PASS self, scope, minimum, state, and budget rejection contracts");

    const budgetRaceTask = await createTask({
      label: "budget-race",
      totalBudgetNdp: 1_000
    });
    const budgetRaceClaimA = await createClaim(budgetRaceTask.id, claimantRaceA.id, "BRA");
    const budgetRaceClaimB = await createClaim(budgetRaceTask.id, claimantRaceB.id, "BRB");
    const budgetRaceSlotA = await createSlot();
    const budgetRaceSlotB = await createSlot();
    const budgetRace = await Promise.allSettled([
      createBooking({
        customerUserId: customerRaceA.id,
        slotId: budgetRaceSlotA.id,
        affiliateCode: budgetRaceClaimA.claim.publicCode
      }),
      createBooking({
        customerUserId: customerRaceB.id,
        slotId: budgetRaceSlotB.id,
        affiliateCode: budgetRaceClaimB.claim.publicCode
      })
    ]);
    const budgetRaceSuccesses = budgetRace.filter((result) => result.status === "fulfilled");
    assert(budgetRaceSuccesses.length === 1, "concurrent last budget was overspent");
    const budgetRaceReservation = await prisma.affiliateBudgetReservation.findUniqueOrThrow({
      where: { taskId: budgetRaceTask.id }
    });
    assert(
      budgetRaceReservation.allocatedNdp === REWARD_NDP,
      "concurrent budget allocation exceeded one reward"
    );

    const slotRaceTask = await createTask({
      label: "slot-race",
      totalBudgetNdp: 2_000
    });
    const slotRaceClaimA = await createClaim(slotRaceTask.id, claimantRaceA.id, "SRA");
    const slotRaceClaimB = await createClaim(slotRaceTask.id, claimantRaceB.id, "SRB");
    const sharedSlot = await createSlot();
    const slotRace = await Promise.allSettled([
      createBooking({
        customerUserId: customerRaceA.id,
        slotId: sharedSlot.id,
        affiliateCode: slotRaceClaimA.claim.publicCode
      }),
      createBooking({
        customerUserId: customerRaceB.id,
        slotId: sharedSlot.id,
        affiliateCode: slotRaceClaimB.claim.publicCode
      })
    ]);
    assert(
      slotRace.filter((result) => result.status === "fulfilled").length === 1,
      "concurrent last slot was oversold"
    );
    console.log("PASS concurrent last-budget and last-slot transactions");

    const replacementTask = await createTask({
      label: "pending-replacement",
      totalBudgetNdp: REWARD_NDP * 2
    });
    const replacementClaim = await createClaim(
      replacementTask.id,
      claimantReplacement.id,
      "REPLACE"
    );
    await prisma.customerProfile.update({
      where: { userId: customerReplacement.id },
      data: { membershipLevel: "black" }
    });
    const replacementOldOrderOne = await createBooking({
      customerUserId: customerReplacement.id,
      slotId: (await createSlot()).id,
      affiliateCode: replacementClaim.claim.publicCode
    });
    const replacementOldOrderTwo = await createBooking({
      customerUserId: customerReplacement.id,
      slotId: (await createSlot()).id,
      affiliateCode: replacementClaim.claim.publicCode
    });
    const exhaustedBeforeReplacement = await prisma.affiliateBudgetReservation.findUniqueOrThrow({
      where: { taskId: replacementTask.id }
    });
    assert(
      exhaustedBeforeReplacement.allocatedNdp === REWARD_NDP * 2 &&
        exhaustedBeforeReplacement.status === "EXHAUSTED",
      "replacement fixture did not consume the final task budget"
    );
    await prisma.customerProfile.update({
      where: { userId: customerReplacement.id },
      data: { membershipLevel: "standard" }
    });
    const replacementNewOrder = await createBooking({
      customerUserId: customerReplacement.id,
      slotId: (await createSlot()).id,
      affiliateCode: replacementClaim.claim.publicCode
    });
    const [replacementOldRows, replacementAttributions, replacementReservation] = await Promise.all(
      [
        prisma.bookingOrder.findMany({
          where: { id: { in: [replacementOldOrderOne.id, replacementOldOrderTwo.id] } },
          orderBy: { id: "asc" }
        }),
        prisma.affiliateAttribution.findMany({
          where: {
            bookingOrderId: {
              in: [replacementOldOrderOne.id, replacementOldOrderTwo.id, replacementNewOrder.id]
            },
            deletedAt: null
          },
          orderBy: { id: "asc" }
        }),
        prisma.affiliateBudgetReservation.findUniqueOrThrow({
          where: { taskId: replacementTask.id }
        })
      ]
    );
    assert(
      replacementOldRows.length === 2 &&
        replacementOldRows.every((order) => order.status === "CANCELLED") &&
        replacementAttributions.length === 3 &&
        replacementAttributions[0]?.status === "INVALIDATED" &&
        replacementAttributions[1]?.status === "INVALIDATED" &&
        replacementAttributions[2]?.status === "ATTRIBUTED" &&
        replacementReservation.allocatedNdp === REWARD_NDP &&
        replacementReservation.status === "ACTIVE",
      "multi-order same-task pending replacement did not atomically reuse Affiliate budget"
    );
    console.log("PASS multi-order same-task replacement reuses Affiliate budget atomically");

    const allocationBeforeCancel = await prisma.affiliateBudgetReservation.findUniqueOrThrow({
      where: { taskId: fixedTask.id }
    });
    const cancelled = await booking.transitionOrder(
      actor(customerFixed.id),
      fixedOrder.id,
      "cancel",
      "acceptance cancellation"
    );
    const allocationAfterCancel = await prisma.affiliateBudgetReservation.findUniqueOrThrow({
      where: { taskId: fixedTask.id }
    });
    const invalidated = await prisma.affiliateAttribution.findFirstOrThrow({
      where: { bookingOrderId: fixedOrder.id, deletedAt: null }
    });
    assert(
      cancelled.status === "cancelled" &&
        invalidated.status === "INVALIDATED" &&
        invalidated.activeKey === null &&
        allocationAfterCancel.allocatedNdp === allocationBeforeCancel.allocatedNdp - REWARD_NDP,
      "cancellation did not invalidate and release exactly one allocation"
    );

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    assert(
      walletAfter.availableBalance === walletBefore.availableBalance &&
        walletAfter.frozenBalance === walletBefore.frozenBalance,
      "wallet balances changed during checkout attribution"
    );
    const rewardCount = await prisma.affiliateReward.count({
      where: { taskId: { in: taskIds }, deletedAt: null }
    });
    assert(rewardCount === 0, "reward was created before service completion");
    const audits = await prisma.auditLog.findMany({
      where: {
        action: { in: ["affiliate.attribution.created", "affiliate.attribution.invalidated"] },
        actorId: { in: userIds },
        deletedAt: null
      }
    });
    const signedTokens = [fixedClaim.publicToken, percentClaim.publicToken];
    assert(
      audits.length > 0 && signedTokens.every((token) => !JSON.stringify(audits).includes(token)),
      "audit evidence leaked a signed token"
    );
    console.log("PASS cancellation release, wallet invariance, zero Reward, and safe audit");

    console.log(
      JSON.stringify(
        {
          database: databaseName,
          marker,
          prices: { fixed: true, percent: true, none: true },
          attribution: { code: true, url: true, codePriority: true },
          concurrency: { lastBudget: true, lastSlot: true },
          pendingReplacement: { finalBudgetReused: true },
          cancellation: { invalidated: true, allocationReleased: true },
          finance: { walletUnchanged: true, rewardsCreated: 0 },
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$transaction(async (transaction) => {
      if (userIds.length > 0) {
        await transaction.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
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
        await transaction.affiliateTaskService.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTaskShop.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTaskTranslation.deleteMany({
          where: { taskId: { in: taskIds } }
        });
        await transaction.affiliateTask.deleteMany({ where: { id: { in: taskIds } } });
      }
      if (walletId) await transaction.wallet.deleteMany({ where: { id: walletId } });
      if (serviceIds.length > 0) {
        await transaction.service.deleteMany({ where: { id: { in: serviceIds } } });
      }
      if (shopId) await transaction.shop.deleteMany({ where: { id: shopId } });
      if (categoryId) await transaction.category.deleteMany({ where: { id: categoryId } });
      if (userIds.length > 0) {
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
      prisma.affiliateAttribution.count({ where: { taskId: { in: taskIds } } })
    ]);
    assert(
      cleanupCounts.every((count) => count === 0),
      "marker cleanup left checkout rows behind"
    );
    console.log("PASS marker-owned checkout rows were removed exactly");
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
