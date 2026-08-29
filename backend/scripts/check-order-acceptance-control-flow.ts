import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { BookingOrderPayload } from "../src/repositories/booking.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { AppError } from "../src/utils/app-error";

const BLOCKED_ENVIRONMENTS = new Set(["staging", "prod", "production"]);
const SERVICE_PRICE_JPY = 8_800;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const normalizeEnvironment = (value: string | undefined): string =>
  value?.trim().toLowerCase() ?? "";

const assertSafeLocalDatabase = (): string => {
  assert(
    !BLOCKED_ENVIRONMENTS.has(normalizeEnvironment(process.env.NODE_ENV)),
    "order acceptance control check rejects staging and production node environments"
  );
  assert(
    !BLOCKED_ENVIRONMENTS.has(normalizeEnvironment(process.env.DEPLOY_ENV)),
    "order acceptance control check rejects staging and production deploy environments"
  );
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "order acceptance control check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName),
    "order acceptance control check rejects production-looking database names"
  );
  return databaseName;
};

interface FixtureState {
  marker: string;
  userIds: number[];
  shopId: number | null;
  serviceId: number | null;
  categoryId: number | null;
  merchantAccountId: number | null;
  membershipId: number | null;
  slotIds: number[];
  bookingIds: number[];
  pauseIds: number[];
}

const captureBaseline = async (prisma: PrismaClient) => {
  const [
    users,
    customers,
    merchantAccounts,
    merchantMemberships,
    shops,
    categories,
    services,
    slots,
    slotBookedCount,
    bookings,
    pendingBookings,
    confirmedBookings,
    cancelledBookings,
    histories,
    pauses,
    activePauses,
    policies,
    audits,
    financials,
    ledgerTransactions
  ] = await Promise.all([
    prisma.user.count(),
    prisma.customerProfile.count(),
    prisma.merchantAccount.count(),
    prisma.merchantShopMembership.count(),
    prisma.shop.count(),
    prisma.category.count(),
    prisma.service.count(),
    prisma.scheduleSlot.count(),
    prisma.scheduleSlot.aggregate({ _sum: { bookedCount: true } }),
    prisma.bookingOrder.count(),
    prisma.bookingOrder.count({ where: { status: "PENDING", deletedAt: null } }),
    prisma.bookingOrder.count({ where: { status: "CONFIRMED", deletedAt: null } }),
    prisma.bookingOrder.count({ where: { status: "CANCELLED", deletedAt: null } }),
    prisma.orderStatusHistory.count(),
    prisma.orderAcceptancePause.count(),
    prisma.orderAcceptancePause.count({
      where: { status: "ACTIVE", activeKey: { not: null }, deletedAt: null }
    }),
    prisma.shopPlatformFeePolicy.count(),
    prisma.auditLog.count(),
    prisma.orderFinancial.count(),
    prisma.ledgerTransaction.count()
  ]);
  return {
    users,
    customers,
    merchantAccounts,
    merchantMemberships,
    shops,
    categories,
    services,
    slots,
    slotBookedCount: slotBookedCount._sum.bookedCount ?? 0,
    bookings,
    pendingBookings,
    confirmedBookings,
    cancelledBookings,
    histories,
    pauses,
    activePauses,
    policies,
    audits,
    financials,
    ledgerTransactions
  };
};

const assertExactBaseline = (before: unknown, after: unknown): void => {
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    `marker cleanup did not restore exact database baseline: ${JSON.stringify({ before, after })}`
  );
};

const assertFixtureOwnership = async (
  prisma: PrismaClient,
  fixture: FixtureState
): Promise<void> => {
  const [users, shop, service, merchant, slots, bookings, pauses] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: fixture.userIds } },
      select: { email: true }
    }),
    fixture.shopId
      ? prisma.shop.findUnique({ where: { id: fixture.shopId }, select: { name: true } })
      : null,
    fixture.serviceId
      ? prisma.service.findUnique({ where: { id: fixture.serviceId }, select: { name: true } })
      : null,
    fixture.merchantAccountId
      ? prisma.merchantAccount.findUnique({
          where: { id: fixture.merchantAccountId },
          select: { code: true }
        })
      : null,
    prisma.scheduleSlot.findMany({
      where: { id: { in: fixture.slotIds } },
      select: { shopId: true }
    }),
    prisma.bookingOrder.findMany({
      where: { id: { in: fixture.bookingIds } },
      select: { customerUserId: true, shopId: true }
    }),
    prisma.orderAcceptancePause.findMany({
      where: { id: { in: fixture.pauseIds } },
      select: { createdById: true }
    })
  ]);
  assert(users.length === fixture.userIds.length, "marker user ownership is incomplete");
  assert(
    users.every((user) => user.email.startsWith(fixture.marker)),
    "cleanup refused a non-marker user"
  );
  if (fixture.shopId) {
    assert(shop?.name.startsWith(fixture.marker), "cleanup refused a non-marker shop");
    assert(service?.name.startsWith(fixture.marker), "cleanup refused a non-marker service");
    assert(merchant?.code.startsWith(fixture.marker), "cleanup refused a non-marker merchant");
    assert(
      slots.length === fixture.slotIds.length &&
        slots.every((slot) => slot.shopId === fixture.shopId),
      "cleanup refused a schedule slot outside the marker shop"
    );
    assert(
      bookings.length === fixture.bookingIds.length &&
        bookings.every(
          (booking) =>
            booking.shopId === fixture.shopId && fixture.userIds.includes(booking.customerUserId)
        ),
      "cleanup refused an order outside the marker fixture"
    );
    assert(
      pauses.length === fixture.pauseIds.length &&
        pauses.every((pause) => fixture.userIds.includes(pause.createdById)),
      "cleanup refused a pause outside the marker fixture"
    );
  }
};

const cleanupFixture = async (prisma: PrismaClient, fixture: FixtureState): Promise<void> => {
  if (fixture.userIds.length === 0) return;
  await assertFixtureOwnership(prisma, fixture);
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { actorId: { in: fixture.userIds } } });
    await tx.orderStatusHistory.deleteMany({
      where: { bookingOrderId: { in: fixture.bookingIds } }
    });
    await tx.bookingOrder.deleteMany({ where: { id: { in: fixture.bookingIds } } });
    await tx.scheduleSlot.deleteMany({ where: { id: { in: fixture.slotIds } } });
    await tx.orderAcceptancePause.deleteMany({ where: { id: { in: fixture.pauseIds } } });
    if (fixture.shopId) {
      await tx.shopPlatformFeePolicy.deleteMany({ where: { shopId: fixture.shopId } });
    }
    if (fixture.membershipId) {
      await tx.merchantShopMembership.deleteMany({ where: { id: fixture.membershipId } });
    }
    if (fixture.serviceId) {
      await tx.service.deleteMany({ where: { id: fixture.serviceId } });
    }
    if (fixture.shopId) {
      await tx.shop.deleteMany({ where: { id: fixture.shopId } });
    }
    if (fixture.merchantAccountId) {
      await tx.merchantAccount.deleteMany({ where: { id: fixture.merchantAccountId } });
    }
    if (fixture.categoryId) {
      await tx.category.deleteMany({ where: { id: fixture.categoryId } });
    }
    await tx.customerProfile.deleteMany({ where: { userId: { in: fixture.userIds } } });
    await tx.user.deleteMany({ where: { id: { in: fixture.userIds } } });
  });
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const [
    { AuditLogRepository },
    { BookingRepository },
    { OrderAcceptancePauseRepository },
    { AuditLogService },
    { BookingService },
    { OrderAcceptancePauseService },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/audit-log.repository"),
    import("../src/repositories/booking.repository"),
    import("../src/repositories/order-acceptance-pause.repository"),
    import("../src/services/audit-log.service"),
    import("../src/services/booking.service"),
    import("../src/services/order-acceptance-pause.service"),
    import("../src/prisma/client")
  ]);
  const marker = `booking-acceptance-control-${Date.now()}-${process.pid}`;
  const fixture: FixtureState = {
    marker,
    userIds: [],
    shopId: null,
    serviceId: null,
    categoryId: null,
    merchantAccountId: null,
    membershipId: null,
    slotIds: [],
    bookingIds: [],
    pauseIds: []
  };
  const baselineBefore = await captureBaseline(prisma);
  const financialBaseline = {
    financials: baselineBefore.financials,
    ledgerTransactions: baselineBefore.ledgerTransactions
  };
  let accountCounter = 0;
  let slotCounter = 0;

  try {
    const createUser = async (label: string, membershipLevel?: string) => {
      accountCounter += 1;
      const accountNo = `${String(Date.now() % 100_000_000).padStart(8, "0")}${String(accountCounter).padStart(2, "0")}`;
      const user = await prisma.user.create({
        data: {
          needoId: `u${accountNo}`,
          accountNo,
          primaryIdentityType: "U",
          email: `${marker}-${label}@needo.test`,
          username: `${marker} ${label}`,
          ...(membershipLevel
            ? {
                customerProfile: {
                  create: {
                    displayName: `${marker} ${label}`,
                    city: "Tokyo",
                    membershipLevel
                  }
                }
              }
            : {})
        }
      });
      fixture.userIds.push(user.id);
      return user;
    };

    const operationsUser = await createUser("operations");
    const merchantUser = await createUser("merchant");
    const pausedCustomer = await createUser("paused-customer", "standard");
    const ordinaryCustomer = await createUser("ordinary-customer", "standard");
    const concurrentCustomer = await createUser("concurrent-customer", "standard");
    const rollbackCustomer = await createUser("rollback-customer", "standard");
    const membershipRaceCustomer = await createUser("membership-race-customer", "standard");
    const blackCustomer = await createUser("black-customer", "black");

    const category = await prisma.category.create({
      data: { code: marker, name: `${marker} category` }
    });
    fixture.categoryId = category.id;
    const merchantAccount = await prisma.merchantAccount.create({
      data: {
        code: `${marker}-merchant`,
        ownerUserId: merchantUser.id,
        name: `${marker} merchant`
      }
    });
    fixture.merchantAccountId = merchantAccount.id;
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: merchantUser.id,
        name: `${marker} shop`,
        city: "Tokyo",
        address: `${marker} local address`,
        status: "published"
      }
    });
    fixture.shopId = shop.id;
    const membership = await prisma.merchantShopMembership.create({
      data: {
        merchantAccountId: merchantAccount.id,
        shopId: shop.id,
        activeKey: `${merchantAccount.id}:${shop.id}`,
        startsAt: new Date(Date.now() - 60_000),
        createdById: merchantUser.id
      }
    });
    fixture.membershipId = membership.id;
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
    fixture.serviceId = service.id;
    await prisma.shopPlatformFeePolicy.create({
      data: {
        shopId: shop.id,
        feeEnabled: false,
        payerType: "SHOP",
        version: 1,
        createdById: operationsUser.id,
        updatedById: operationsUser.id
      }
    });

    const createSlot = async (label: string, booked = false) => {
      slotCounter += 1;
      const startsAt = new Date(Date.now() + (24 + slotCounter * 2) * 60 * 60 * 1000);
      const slot = await prisma.scheduleSlot.create({
        data: {
          serviceId: service.id,
          shopId: shop.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
          capacity: 1,
          bookedCount: booked ? 1 : 0,
          status: booked ? "BOOKED" : "AVAILABLE"
        }
      });
      fixture.slotIds.push(slot.id);
      return { ...slot, label };
    };

    const bookingRepository = new BookingRepository(prisma);
    const bookingService = new BookingService(bookingRepository);
    const auditService = new AuditLogService(new AuditLogRepository(prisma));
    const pauseService = new OrderAcceptancePauseService(
      new OrderAcceptancePauseRepository(prisma),
      auditService
    );
    const context = { ip: "127.0.0.1", userAgent: "order-acceptance-control-check" };
    const baseAccess: AuthenticatedAccessContext = {
      userId: operationsUser.id,
      email: operationsUser.email,
      roles: ["operator"],
      permissions: [],
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null,
      accessTokenJti: `${marker}-operations`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900
    };
    const merchantAccess: AuthenticatedAccessContext = {
      ...baseAccess,
      userId: merchantUser.id,
      email: merchantUser.email,
      roles: ["merchant_owner"],
      currentIdentityScopeType: "merchant_account",
      currentIdentityScopeId: merchantAccount.id,
      accessTokenJti: `${marker}-merchant`
    };
    const shopAccess: AuthenticatedAccessContext = {
      ...merchantAccess,
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: shop.id,
      accessTokenJti: `${marker}-shop`
    };
    const providerActor = {
      userId: merchantUser.id,
      roles: ["merchant_owner"],
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: shop.id
    };
    const createBooking = async (customerUserId: number, slotId: number) => {
      const order = await bookingService.createBooking(
        { userId: customerUserId, roles: ["customer"] },
        {
          serviceId: service.id,
          scheduleSlotId: slotId,
          fulfillmentMode: "store"
        }
      );
      fixture.bookingIds.push(order.id);
      return order;
    };
    const expectPaused = async (order: BookingOrderPayload, expectedCount: number) => {
      try {
        await bookingService.transitionOrder(providerActor, order.id, "confirm");
        throw new Error("paused order unexpectedly confirmed");
      } catch (error) {
        assert(error instanceof AppError, "paused confirmation did not return AppError");
        assert(error.code === ERROR_CODES.ORDER_ACCEPTANCE_PAUSED, "wrong pause error code");
        const data = error.data as { pauses?: unknown[] };
        assert(data.pauses?.length === expectedCount, "wrong active pause count in safe error");
        assert(
          JSON.stringify(data).includes("reasonDetail") === false,
          "customer-safe pause error leaked internal reason detail"
        );
      }
    };

    const operationsPause = await pauseService.createPause(baseAccess, context, {
      subjectType: "merchant_account",
      subjectId: merchantAccount.id,
      reasonCode: "operations_balance_review",
      reasonDetail: "Marker-only operations review"
    });
    fixture.pauseIds.push(operationsPause.id);
    const pauseSlot = await createSlot("pause");
    const visibleWhilePaused = await bookingRepository.listAvailableSlots({
      shopId: shop.id,
      serviceId: service.id,
      from: new Date(),
      to: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      page: 1,
      pageSize: 100
    });
    assert(
      visibleWhilePaused.list.some((slot) => slot.id === pauseSlot.id),
      "acceptance pause incorrectly hid an available schedule slot"
    );
    const pausedOrder = await createBooking(pausedCustomer.id, pauseSlot.id);
    let settlementCalls = 0;
    const pausedTransition = await bookingRepository.transitionOrder(
      {
        id: pausedOrder.id,
        actorUserId: merchantUser.id,
        fromStatus: "pending",
        toStatus: "confirmed"
      },
      {
        settle: async () => {
          settlementCalls += 1;
        }
      }
    );
    assert(
      pausedTransition &&
        "kind" in pausedTransition &&
        pausedTransition.kind === "acceptance_paused",
      "repository did not block confirmation under operations pause"
    );
    assert(settlementCalls === 0, "paused confirmation invoked settlement");
    await expectPaused(pausedOrder, 1);
    const persistedPausedOrder = await prisma.bookingOrder.findUniqueOrThrow({
      where: { id: pausedOrder.id }
    });
    assert(persistedPausedOrder.status === "PENDING", "paused order state was mutated");
    try {
      await pauseService.releasePause(merchantAccess, context, operationsPause.id, {
        releaseReason: "merchant override"
      });
      throw new Error("merchant released operations pause");
    } catch (error) {
      assert(
        error instanceof AppError && error.code === ERROR_CODES.IDENTITY_FORBIDDEN,
        "merchant override did not fail closed"
      );
    }
    await pauseService.releasePause(baseAccess, context, operationsPause.id, {
      releaseReason: "operations review complete"
    });

    const merchantPause = await pauseService.createPause(merchantAccess, context, {
      subjectType: "merchant_account",
      subjectId: merchantAccount.id,
      reasonCode: "merchant_manual_pause",
      reasonDetail: "Marker-only merchant pause"
    });
    const shopPause = await pauseService.createPause(shopAccess, context, {
      subjectType: "shop",
      subjectId: shop.id,
      reasonCode: "shop_manual_pause",
      reasonDetail: "Marker-only shop pause"
    });
    fixture.pauseIds.push(merchantPause.id, shopPause.id);
    await expectPaused(pausedOrder, 2);
    await pauseService.releasePause(shopAccess, context, shopPause.id, {
      releaseReason: "shop reopened"
    });
    await expectPaused(pausedOrder, 1);
    await pauseService.releasePause(merchantAccess, context, merchantPause.id, {
      releaseReason: "group reopened"
    });
    const confirmed = await bookingRepository.transitionOrder(
      {
        id: pausedOrder.id,
        actorUserId: merchantUser.id,
        fromStatus: "pending",
        toStatus: "confirmed"
      },
      {
        settle: async () => {
          settlementCalls += 1;
        }
      }
    );
    assert(confirmed && !("kind" in confirmed), "released pause did not allow confirmation");
    assert(settlementCalls === 1, "released confirmation did not invoke settlement exactly once");

    const ordinarySlotOne = await createSlot("ordinary-one");
    const ordinarySlotTwo = await createSlot("ordinary-two");
    const ordinaryFirst = await createBooking(ordinaryCustomer.id, ordinarySlotOne.id);
    const ordinarySecond = await createBooking(ordinaryCustomer.id, ordinarySlotTwo.id);
    const [ordinaryFirstRow, ordinaryFirstSlot, ordinaryPendingCount, replacementHistory] =
      await Promise.all([
        prisma.bookingOrder.findUniqueOrThrow({ where: { id: ordinaryFirst.id } }),
        prisma.scheduleSlot.findUniqueOrThrow({ where: { id: ordinarySlotOne.id } }),
        prisma.bookingOrder.count({
          where: { customerUserId: ordinaryCustomer.id, status: "PENDING", deletedAt: null }
        }),
        prisma.orderStatusHistory.findFirst({
          where: {
            bookingOrderId: ordinaryFirst.id,
            toStatus: "CANCELLED",
            reason: "superseded_by_new_pending_order",
            deletedAt: null
          }
        })
      ]);
    assert(ordinaryFirstRow.status === "CANCELLED", "old ordinary pending was not cancelled");
    assert(
      ordinaryFirstRow.cancelReason === "superseded_by_new_pending_order",
      "old ordinary pending has wrong cancel reason"
    );
    assert(ordinaryFirstSlot.bookedCount === 0, "old ordinary slot capacity was not released");
    assert(ordinaryPendingCount === 1, "ordinary customer retained multiple pending orders");
    assert(replacementHistory, "ordinary replacement history was not persisted");
    assert(
      (replacementHistory.metadata as { supersededByBookingOrderId?: number })
        .supersededByBookingOrderId === ordinarySecond.id,
      "replacement history did not identify the new pending order"
    );

    const concurrentSlotOne = await createSlot("concurrent-one");
    const concurrentSlotTwo = await createSlot("concurrent-two");
    const concurrentOrders = await Promise.all([
      createBooking(concurrentCustomer.id, concurrentSlotOne.id),
      createBooking(concurrentCustomer.id, concurrentSlotTwo.id)
    ]);
    const concurrentRows = await prisma.bookingOrder.findMany({
      where: { id: { in: concurrentOrders.map((order) => order.id) } },
      select: { status: true }
    });
    assert(
      concurrentRows.filter((order) => order.status === "PENDING").length === 1 &&
        concurrentRows.filter((order) => order.status === "CANCELLED").length === 1,
      "concurrent ordinary creation did not converge to exactly one pending order"
    );

    const rollbackOldSlot = await createSlot("rollback-old");
    const rollbackTargetSlot = await createSlot("rollback-target", true);
    const rollbackOldOrder = await createBooking(rollbackCustomer.id, rollbackOldSlot.id);
    try {
      await createBooking(rollbackCustomer.id, rollbackTargetSlot.id);
      throw new Error("unavailable replacement unexpectedly succeeded");
    } catch (error) {
      assert(
        error instanceof AppError && error.code === ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
        "unavailable replacement returned wrong error"
      );
    }
    const [rollbackOrderRow, rollbackOldSlotRow, rollbackPendingCount] = await Promise.all([
      prisma.bookingOrder.findUniqueOrThrow({ where: { id: rollbackOldOrder.id } }),
      prisma.scheduleSlot.findUniqueOrThrow({ where: { id: rollbackOldSlot.id } }),
      prisma.bookingOrder.count({
        where: { customerUserId: rollbackCustomer.id, status: "PENDING", deletedAt: null }
      })
    ]);
    assert(rollbackOrderRow.status === "PENDING", "failed replacement committed old cancellation");
    assert(rollbackOldSlotRow.bookedCount === 1, "failed replacement released old slot capacity");
    assert(rollbackPendingCount === 1, "failed replacement changed ordinary pending cardinality");

    const blackSlotOne = await createSlot("black-one");
    const blackSlotTwo = await createSlot("black-two");
    await createBooking(blackCustomer.id, blackSlotOne.id);
    await createBooking(blackCustomer.id, blackSlotTwo.id);
    const blackPendingCount = await prisma.bookingOrder.count({
      where: { customerUserId: blackCustomer.id, status: "PENDING", deletedAt: null }
    });
    assert(blackPendingCount === 2, "black member did not retain multiple pending orders");

    const merchantVisible = await pauseService.listPauses(merchantAccess, {
      status: "released",
      page: 1,
      pageSize: 20
    });
    assert(merchantVisible.total === 3, "merchant scoped pause history is incomplete");

    const membershipRacePause = await pauseService.createPause(merchantAccess, context, {
      subjectType: "merchant_account",
      subjectId: merchantAccount.id,
      reasonCode: "membership_race_pause",
      reasonDetail: "Marker-only membership race pause"
    });
    fixture.pauseIds.push(membershipRacePause.id);
    const membershipRaceOrder = await createBooking(
      membershipRaceCustomer.id,
      (await createSlot("membership-race")).id
    );
    let markMembershipLocked: (() => void) | undefined;
    let allowMembershipUnlink: (() => void) | undefined;
    const membershipLocked = new Promise<void>((resolve) => {
      markMembershipLocked = resolve;
    });
    const membershipUnlinkAllowed = new Promise<void>((resolve) => {
      allowMembershipUnlink = resolve;
    });
    const unlinkMembership = prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id
        FROM merchant_shop_memberships
        WHERE id = ${membership.id}
        FOR UPDATE
      `;
      markMembershipLocked?.();
      await membershipUnlinkAllowed;
      await tx.merchantShopMembership.update({
        where: { id: membership.id },
        data: {
          activeKey: null,
          endsAt: new Date(),
          removedReason: "membership_race_check",
          removedById: operationsUser.id
        }
      });
    });
    await membershipLocked;
    let membershipRaceSettlementCalls = 0;
    const confirmAfterUnlink = bookingRepository.transitionOrder(
      {
        id: membershipRaceOrder.id,
        actorUserId: merchantUser.id,
        fromStatus: "pending",
        toStatus: "confirmed"
      },
      {
        settle: async () => {
          membershipRaceSettlementCalls += 1;
        }
      }
    );
    const confirmationBeforeUnlinkCommit = await Promise.race([
      confirmAfterUnlink.then((result) => ({ state: "resolved" as const, result })),
      new Promise<{ state: "blocked" }>((resolve) => {
        setTimeout(() => resolve({ state: "blocked" }), 150);
      })
    ]);
    allowMembershipUnlink?.();
    await unlinkMembership;
    assert(
      confirmationBeforeUnlinkCommit.state === "blocked",
      "confirmation did not serialize against an in-flight membership unlink"
    );
    const membershipRaceResult = await confirmAfterUnlink;
    assert(
      membershipRaceResult &&
        !("kind" in membershipRaceResult) &&
        membershipRaceResult.status === "confirmed" &&
        membershipRaceSettlementCalls === 1,
      "confirmation did not use the committed post-unlink membership snapshot"
    );
    const financialAfter = await captureBaseline(prisma);
    assert(
      financialAfter.financials === financialBaseline.financials &&
        financialAfter.ledgerTransactions === financialBaseline.ledgerTransactions,
      "acceptance control check unexpectedly changed formal financial records"
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "ok",
          database: databaseName,
          marker,
          scenarios: {
            pausedSlotsRemainVisible: true,
            pausedPendingCreationAllowed: true,
            pausedConfirmationBlockedBeforeSettlement: true,
            stackedAuthorityPausesRequireFullRelease: true,
            ordinaryReplacement: {
              finalPending: ordinaryPendingCount,
              oldOrderStatus: ordinaryFirstRow.status,
              oldSlotBookedCount: ordinaryFirstSlot.bookedCount
            },
            concurrentOrdinaryReplacement: {
              attempted: concurrentOrders.length,
              finalPending: concurrentRows.filter((order) => order.status === "PENDING").length
            },
            failedReplacementRolledBack: true,
            blackMembershipPending: blackPendingCount,
            membershipUnlinkSerialized: true,
            financialRowsChanged: 0,
            ledgerTransactionsChanged: 0
          }
        },
        null,
        2
      )}\n`
    );
  } finally {
    try {
      await cleanupFixture(prisma, fixture);
      assertExactBaseline(baselineBefore, await captureBaseline(prisma));
    } finally {
      await disconnectPrisma();
    }
  }
};

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exitCode = 1;
});
