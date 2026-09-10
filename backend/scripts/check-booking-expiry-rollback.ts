import { Prisma, type PrismaClient } from "@prisma/client";
import { loadAndValidateFormalEnvironment } from "./check-order-fulfillment-checkout-flow";

type Assert = (condition: unknown, message: string) => asserts condition;

const assert: Assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function awaitOldSlotLockOrThrow(
  oldSlotLocked: Promise<void>,
  lockTransaction: Promise<unknown>
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    void oldSlotLocked.then(resolve, reject);
    void lockTransaction.then(
      () => reject(new Error("lock transaction completed before acquiring the old-slot lock")),
      reject
    );
  });
}

export async function runBookingExpiryRollbackLifecycle({
  execute,
  settle,
  cleanupMarker,
  disconnectClients
}: {
  execute: () => Promise<void>;
  settle: () => Promise<void>;
  cleanupMarker: () => Promise<void>;
  disconnectClients: readonly (() => Promise<void>)[];
}): Promise<void> {
  try {
    await execute();
  } finally {
    try {
      await settle();
    } finally {
      try {
        await cleanupMarker();
      } finally {
        await Promise.all(disconnectClients.map((disconnect) => disconnect()));
      }
    }
  }
}

type Fixture = {
  marker: string;
  customerUserId: number;
  ownerUserId: number;
  categoryId: number;
  shopId: number;
  serviceId: number;
  oldSlotId: number;
  targetSlotId: number;
  oldOrderId: number;
  targetStartsAt: Date;
};

type RollbackEvidence = {
  bookingCount: number;
  order: {
    id: number;
    status: string;
    cancelReason: string | null;
    scheduleSlotId: number;
  } | null;
  oldSlot: { id: number; bookedCount: number; status: string } | null;
  targetSlot: { id: number; bookedCount: number; status: string } | null;
  histories: Array<{
    bookingOrderId: number;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
  }>;
  affiliateAttributionCount: number;
  affiliateTouchCount: number;
};

type ProcessRow = {
  Id?: number | bigint;
  State?: string | null;
  Info?: string | null;
  id?: number | bigint;
  state?: string | null;
  info?: string | null;
};

const accountNumber = (sequence: number) =>
  `${String(Date.now() % 100_000_000).padStart(8, "0")}${String(sequence).padStart(2, "0")}`;

async function createFixture(prisma: PrismaClient, marker: string): Promise<Fixture> {
  const customerAccountNo = accountNumber(1);
  const ownerAccountNo = accountNumber(2);
  const customer = await prisma.user.create({
    data: {
      needoId: `u${customerAccountNo}`,
      accountNo: customerAccountNo,
      primaryIdentityType: "U",
      email: `${marker}-customer@needo.test`,
      username: `${marker} customer`,
      customerProfile: {
        create: {
          displayName: `${marker} customer`,
          city: "Tokyo",
          membershipLevel: "standard"
        }
      }
    }
  });
  const owner = await prisma.user.create({
    data: {
      needoId: `u${ownerAccountNo}`,
      accountNo: ownerAccountNo,
      primaryIdentityType: "U",
      email: `${marker}-owner@needo.test`,
      username: `${marker} owner`
    }
  });
  const category = await prisma.category.create({
    data: { code: marker, name: `${marker} category` }
  });
  const shop = await prisma.shop.create({
    data: {
      ownerUserId: owner.id,
      name: `${marker} shop`,
      city: "Tokyo",
      address: `${marker} rollback fixture`,
      status: "published"
    }
  });
  const service = await prisma.service.create({
    data: {
      categoryId: category.id,
      shopId: shop.id,
      name: `${marker} service`,
      city: "Tokyo",
      priceAmount: 8_800,
      durationMinutes: 60,
      status: "published"
    }
  });
  const oldStartsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const oldSlot = await prisma.scheduleSlot.create({
    data: {
      serviceId: service.id,
      shopId: shop.id,
      startsAt: oldStartsAt,
      endsAt: new Date(oldStartsAt.getTime() + 60 * 60 * 1000),
      capacity: 1,
      bookedCount: 1,
      status: "BOOKED"
    }
  });
  const targetStartsAt = new Date(Date.now() + 3_000);
  const targetSlot = await prisma.scheduleSlot.create({
    data: {
      serviceId: service.id,
      shopId: shop.id,
      startsAt: targetStartsAt,
      endsAt: new Date(targetStartsAt.getTime() + 60 * 60 * 1000),
      capacity: 1,
      bookedCount: 0,
      status: "AVAILABLE"
    }
  });
  const oldOrder = await prisma.bookingOrder.create({
    data: {
      orderNo: `BER${Date.now()}${process.pid}`,
      customerUserId: customer.id,
      serviceId: service.id,
      shopId: shop.id,
      scheduleSlotId: oldSlot.id,
      status: "PENDING",
      fulfillmentMode: "store",
      priceAmount: 8_800,
      paymentAmountJpy: 8_800,
      serviceNameSnapshot: service.name,
      servicePriceSnapshot: 8_800,
      serviceDurationSnapshot: 60,
      startsAt: oldSlot.startsAt,
      endsAt: oldSlot.endsAt,
      statusHistory: {
        create: {
          fromStatus: null,
          toStatus: "PENDING",
          actorUserId: customer.id
        }
      }
    }
  });

  return {
    marker,
    customerUserId: customer.id,
    ownerUserId: owner.id,
    categoryId: category.id,
    shopId: shop.id,
    serviceId: service.id,
    oldSlotId: oldSlot.id,
    targetSlotId: targetSlot.id,
    oldOrderId: oldOrder.id,
    targetStartsAt
  };
}

async function captureEvidence(prisma: PrismaClient, fixture: Fixture): Promise<RollbackEvidence> {
  const [bookingCount, order, oldSlot, targetSlot, histories, affiliateAttributionCount, affiliateTouchCount] =
    await Promise.all([
      prisma.bookingOrder.count({
        where: { customerUserId: fixture.customerUserId, deletedAt: null }
      }),
      prisma.bookingOrder.findUnique({
        where: { id: fixture.oldOrderId },
        select: { id: true, status: true, cancelReason: true, scheduleSlotId: true }
      }),
      prisma.scheduleSlot.findUnique({
        where: { id: fixture.oldSlotId },
        select: { id: true, bookedCount: true, status: true }
      }),
      prisma.scheduleSlot.findUnique({
        where: { id: fixture.targetSlotId },
        select: { id: true, bookedCount: true, status: true }
      }),
      prisma.orderStatusHistory.findMany({
        where: { bookingOrderId: fixture.oldOrderId, deletedAt: null },
        orderBy: { id: "asc" },
        select: {
          bookingOrderId: true,
          fromStatus: true,
          toStatus: true,
          reason: true
        }
      }),
      prisma.affiliateAttribution.count({
        where: { customerUserId: fixture.customerUserId, deletedAt: null }
      }),
      prisma.affiliateTouch.count({
        where: { customerUserId: fixture.customerUserId, deletedAt: null }
      })
    ]);
  return {
    bookingCount,
    order,
    oldSlot,
    targetSlot,
    histories,
    affiliateAttributionCount,
    affiliateTouchCount
  };
}

function assertRollbackEvidence(before: RollbackEvidence, after: RollbackEvidence): void {
  assert(JSON.stringify(after) === JSON.stringify(before), "failed replacement left partial writes");
  assert(after.bookingCount === 1, "failed replacement created a new order");
  assert(after.order?.status === "PENDING", "old order was not restored to PENDING");
  assert(after.order.cancelReason === null, "old order retained a cancellation reason");
  assert(
    after.oldSlot?.bookedCount === 1 && after.oldSlot.status === "BOOKED",
    "old slot capacity or status changed"
  );
  assert(
    after.targetSlot?.bookedCount === 0 && after.targetSlot.status === "AVAILABLE",
    "expired target slot changed"
  );
  assert(after.histories.length === 1, "failed replacement left status history residue");
  assert(after.affiliateAttributionCount === 0, "failed replacement left Affiliate attribution residue");
  assert(after.affiliateTouchCount === 0, "failed replacement left Affiliate touch residue");
}

async function waitForBlockedSlotRelease(
  observer: PrismaClient,
  isAttemptSettled: () => boolean
): Promise<string> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const rows = await observer.$queryRawUnsafe<ProcessRow[]>("SHOW FULL PROCESSLIST");
    const blockedRelease = rows.find((row) => {
      const info = row.Info ?? row.info ?? "";
      return /schedule_slots/i.test(info) && /booked_count/i.test(info);
    });
    if (blockedRelease) return blockedRelease.State ?? blockedRelease.state ?? "waiting";
    if (isAttemptSettled()) {
      throw new Error("replacement settled before reaching the old-slot release lock");
    }
    await delay(25);
  }
  throw new Error("replacement did not reach the old-slot release lock before expiry");
}

async function cleanupMarkerFixture(prisma: PrismaClient, marker: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const markerUsers = await tx.user.findMany({
      where: { email: { startsWith: marker } },
      select: { id: true }
    });
    const markerShops = await tx.shop.findMany({
      where: { name: { startsWith: marker } },
      select: { id: true }
    });
    const markerCategories = await tx.category.findMany({
      where: { code: { startsWith: marker } },
      select: { id: true }
    });
    const userIds = markerUsers.map((user) => user.id);
    const shopIds = markerShops.map((shop) => shop.id);
    const bookingIds = (
      await tx.bookingOrder.findMany({
        where: {
          OR: [
            { customerUserId: { in: userIds } },
            { shopId: { in: shopIds } }
          ]
        },
        select: { id: true }
      })
    ).map((order) => order.id);
    await tx.affiliateAttribution.deleteMany({ where: { bookingOrderId: { in: bookingIds } } });
    await tx.affiliateTouch.deleteMany({ where: { customerUserId: { in: userIds } } });
    await tx.orderStatusHistory.deleteMany({ where: { bookingOrderId: { in: bookingIds } } });
    await tx.bookingOrder.deleteMany({ where: { id: { in: bookingIds } } });
    await tx.scheduleSlot.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.service.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.shop.deleteMany({ where: { id: { in: shopIds } } });
    await tx.category.deleteMany({ where: { id: { in: markerCategories.map((category) => category.id) } } });
    await tx.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
}

async function assertMarkerCleanup(prisma: PrismaClient, marker: string): Promise<void> {
  const [users, shops, services] = await Promise.all([
    prisma.user.count({ where: { email: { startsWith: marker } } }),
    prisma.shop.count({ where: { name: { startsWith: marker } } }),
    prisma.service.count({ where: { name: { startsWith: marker } } })
  ]);
  assert(users === 0 && shops === 0 && services === 0, "marker fixture cleanup left residue");
}

export async function runBookingExpiryRollbackCheck(): Promise<void> {
  const formalEnvironment = loadAndValidateFormalEnvironment(process.env);
  for (const [name, value] of Object.entries(formalEnvironment.values)) process.env[name] = value;
  const [{ BookingRepository }, prismaModule] = await Promise.all([
    import("../src/repositories/booking.repository"),
    import("../src/prisma/client")
  ]);
  const { createPrismaClient, prisma: fixtureClient } = prismaModule;
  const attemptClient = createPrismaClient();
  const lockClient = createPrismaClient();
  const observerClient = createPrismaClient();
  const marker = `booking-expiry-rollback-${Date.now()}-${process.pid}`;
  let fixture: Fixture | null = null;
  let releaseOldSlotLock: (() => void) | null = null;
  let lockTransaction: Promise<unknown> | null = null;
  let replacementAttempt: Promise<unknown> | null = null;

  await runBookingExpiryRollbackLifecycle({
    execute: async () => {
      await assertMarkerCleanup(observerClient, marker);
      fixture = await createFixture(fixtureClient, marker);
      const before = await captureEvidence(observerClient, fixture);
      let confirmOldSlotLocked: (() => void) | null = null;
      const oldSlotLocked = new Promise<void>((resolve) => {
        confirmOldSlotLocked = resolve;
      });
      const oldSlotLockReleased = new Promise<void>((resolve) => {
        releaseOldSlotLock = resolve;
      });
      lockTransaction = lockClient.$transaction(
        async (tx) => {
          await tx.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT \`id\` FROM \`schedule_slots\` WHERE \`id\` = ${fixture?.oldSlotId ?? -1} FOR UPDATE`
          );
          confirmOldSlotLocked?.();
          await oldSlotLockReleased;
        },
        { maxWait: 5_000, timeout: 15_000 }
      );
      await awaitOldSlotLockOrThrow(oldSlotLocked, lockTransaction);

      const repository = new BookingRepository(attemptClient);
      let attemptSettled = false;
      const replacement = repository.createBooking({
        customerUserId: fixture.customerUserId,
        serviceId: fixture.serviceId,
        scheduleSlotId: fixture.targetSlotId,
        fulfillmentMode: "store",
        serviceLocation: { source: "SHOP_LOCATION" }
      });
      replacementAttempt = replacement;
      void replacement.then(
        () => { attemptSettled = true; },
        () => { attemptSettled = true; }
      );
      const waitState = await waitForBlockedSlotRelease(observerClient, () => attemptSettled);
      const waitUntilExpiredMs = Math.max(0, fixture.targetStartsAt.getTime() + 250 - Date.now());
      await delay(waitUntilExpiredMs);
      const releaseLock = releaseOldSlotLock;
      assert(releaseLock !== null, "old-slot lock release callback was not initialized");
      releaseLock();
      releaseOldSlotLock = null;
      await lockTransaction;
      lockTransaction = null;

      const result = await replacement;
      replacementAttempt = null;
      assert(result === null, "expired replacement unexpectedly created an order");
      const after = await captureEvidence(observerClient, fixture);
      assertRollbackEvidence(before, after);

      process.stdout.write(
        `${JSON.stringify({
          status: "ok",
          database: formalEnvironment.databaseName,
          marker,
          firstValidationPassed: true,
          blockedAfterPendingCancellation: true,
          observedProcessState: waitState,
          expiredAtSecondValidation: true,
          independentRollbackEvidence: after
        }, null, 2)}\n`
      );
      console.log("PASS booking expiry replacement rolled back without residue");
    },
    settle: async () => {
      if (releaseOldSlotLock && fixture && replacementAttempt) {
        await delay(Math.max(0, fixture.targetStartsAt.getTime() + 250 - Date.now()));
      }
      releaseOldSlotLock?.();
      await Promise.allSettled([
        lockTransaction ?? Promise.resolve(),
        replacementAttempt ?? Promise.resolve()
      ]);
    },
    cleanupMarker: async () => {
      await cleanupMarkerFixture(fixtureClient, marker);
      await assertMarkerCleanup(observerClient, marker);
    },
    disconnectClients: [
      () => fixtureClient.$disconnect(),
      () => attemptClient.$disconnect(),
      () => lockClient.$disconnect(),
      () => observerClient.$disconnect()
    ]
  });
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runBookingExpiryRollbackCheck().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}
