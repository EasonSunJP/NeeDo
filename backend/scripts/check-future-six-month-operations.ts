import { BookingOrderStatus, NotificationType, type Prisma } from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readJsonRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const stableSetEquals = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
};

const countOverlaps = (rows: Array<{ ownerId: number; startsAt: Date; endsAt: Date }>): number => {
  const byOwner = new Map<number, Array<{ startsAt: Date; endsAt: Date }>>();
  for (const row of rows) {
    byOwner.set(row.ownerId, [...(byOwner.get(row.ownerId) ?? []), row]);
  }

  let count = 0;
  for (const items of byOwner.values()) {
    const sorted = [...items].sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime()
    );
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index]!.startsAt < sorted[index - 1]!.endsAt) {
        count += 1;
      }
    }
  }
  return count;
};

const toTokyoMonthKey = (value: Date): string =>
  new Date(value.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 7);

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });

  const [
    { getSimulationSeedConfig },
    { prisma, disconnectPrisma },
    { loadFutureOperationsCohort },
    {
      FUTURE_OPERATIONS_END_EXCLUSIVE_AT,
      FUTURE_OPERATIONS_NAMESPACE,
      FUTURE_OPERATIONS_START_AT,
      buildFutureSixMonthOperationsPlan,
      summarizeFutureOperationsPlan
    },
    {
      SIMULATION_END_AT,
      SIMULATION_ORDER_PREFIX,
      SIMULATION_START_AT,
      buildThreeMonthSimulationPlan
    }
  ] = await Promise.all([
    import("../src/simulation/simulation-seed-config"),
    import("../src/prisma/client"),
    import("../src/simulation/future-six-month-operations-dataset"),
    import("../src/simulation/future-six-month-operations-plan"),
    import("../src/simulation/three-month-simulation-plan")
  ]);
  const seedConfig = getSimulationSeedConfig(process.env);

  try {
    const cohort = await loadFutureOperationsCohort(prisma);
    const plan = buildFutureSixMonthOperationsPlan(cohort);
    const planSummary = summarizeFutureOperationsPlan(plan);
    const technicianProfileIds = cohort.technicians.map(
      (technician) => technician.technicianProfileId
    );
    const customerUserIds = cohort.customers.map((customer) => customer.userId);
    const targetWindow = {
      gte: new Date(FUTURE_OPERATIONS_START_AT),
      lt: new Date(FUTURE_OPERATIONS_END_EXCLUSIVE_AT)
    };

    const [availabilities, slots, bookings] = await Promise.all([
      prisma.availability.findMany({
        where: {
          technicianProfileId: { in: technicianProfileIds },
          startsAt: targetWindow,
          deletedAt: null
        },
        select: {
          id: true,
          technicianProfileId: true,
          shopId: true,
          startsAt: true,
          endsAt: true,
          isActive: true
        }
      }),
      prisma.scheduleSlot.findMany({
        where: {
          technicianProfileId: { in: technicianProfileIds },
          startsAt: targetWindow,
          deletedAt: null
        },
        select: {
          id: true,
          availabilityId: true,
          technicianProfileId: true,
          technicianServiceId: true,
          shopId: true,
          serviceId: true,
          startsAt: true,
          endsAt: true,
          status: true,
          bookedCount: true
        }
      }),
      prisma.bookingOrder.findMany({
        where: {
          technicianProfileId: { in: technicianProfileIds },
          startsAt: targetWindow,
          deletedAt: null
        },
        select: {
          id: true,
          orderNo: true,
          customerUserId: true,
          technicianProfileId: true,
          technicianServiceId: true,
          shopId: true,
          serviceId: true,
          scheduleSlotId: true,
          startsAt: true,
          endsAt: true,
          status: true,
          serviceSnapshotJson: true
        }
      })
    ]);

    const bookingIds = bookings.map((booking) => booking.id);
    const [histories, notificationCandidates, orderFinancials, walletHolds, reviews] =
      await Promise.all([
        prisma.orderStatusHistory.findMany({
          where: { bookingOrderId: { in: bookingIds }, deletedAt: null },
          select: {
            bookingOrder: { select: { orderNo: true } },
            fromStatus: true,
            toStatus: true,
            actorUserId: true,
            reason: true,
            metadata: true,
            createdAt: true
          }
        }),
        prisma.notification.findMany({
          where: {
            recipientUserId: { in: customerUserIds },
            type: NotificationType.ORDER_STATUS,
            deletedAt: null
          },
          select: {
            recipientUserId: true,
            actorUserId: true,
            payload: true,
            createdAt: true
          }
        }),
        prisma.orderFinancial.count({
          where: { bookingOrderId: { in: bookingIds }, deletedAt: null }
        }),
        prisma.walletHold.count({
          where: { bookingOrderId: { in: bookingIds }, deletedAt: null }
        }),
        prisma.orderReview.count({
          where: { bookingOrderId: { in: bookingIds }, deletedAt: null }
        })
      ]);
    const notifications = notificationCandidates.filter(
      (notification) =>
        readJsonRecord(notification.payload)?.namespace === FUTURE_OPERATIONS_NAMESPACE
    );

    const expectedAvailabilityKeys = plan.availabilities.map((availability) =>
      [
        availability.technicianProfileId,
        availability.shopId,
        availability.startsAt,
        availability.endsAt,
        availability.isActive
      ].join("|")
    );
    const actualAvailabilityKeys = availabilities.map((availability) =>
      [
        availability.technicianProfileId,
        availability.shopId,
        availability.startsAt.toISOString(),
        availability.endsAt.toISOString(),
        availability.isActive
      ].join("|")
    );
    const expectedSlotKeys = plan.slots.map((slot) =>
      [
        slot.technicianProfileId,
        slot.technicianServiceId,
        slot.shopId,
        slot.serviceId,
        slot.startsAt,
        slot.endsAt,
        slot.status,
        slot.bookedCount
      ].join("|")
    );
    const actualSlotKeys = slots.map((slot) =>
      [
        slot.technicianProfileId,
        slot.technicianServiceId,
        slot.shopId,
        slot.serviceId,
        slot.startsAt.toISOString(),
        slot.endsAt.toISOString(),
        slot.status,
        slot.bookedCount
      ].join("|")
    );
    const expectedBookingKeys = plan.bookings.map((booking) =>
      [
        booking.orderNo,
        booking.customerUserId,
        booking.technicianProfileId,
        booking.technicianServiceId,
        booking.shopId,
        booking.serviceId,
        booking.startsAt,
        booking.endsAt,
        booking.status,
        booking.slotKey,
        FUTURE_OPERATIONS_NAMESPACE
      ].join("|")
    );
    const actualBookingKeys = bookings.map((booking) => {
      const snapshot = readJsonRecord(booking.serviceSnapshotJson);
      return [
        booking.orderNo,
        booking.customerUserId,
        booking.technicianProfileId,
        booking.technicianServiceId,
        booking.shopId,
        booking.serviceId,
        booking.startsAt.toISOString(),
        booking.endsAt.toISOString(),
        booking.status,
        snapshot?.slotKey,
        snapshot?.namespace
      ].join("|");
    });
    const expectedHistoryKeys = plan.histories.map((history) =>
      [
        history.orderNo,
        history.fromStatus ?? "null",
        history.toStatus,
        history.actorUserId,
        history.reason,
        history.createdAt,
        FUTURE_OPERATIONS_NAMESPACE
      ].join("|")
    );
    const actualHistoryKeys = histories.map((history) =>
      [
        history.bookingOrder.orderNo,
        history.fromStatus ?? "null",
        history.toStatus,
        history.actorUserId,
        history.reason,
        history.createdAt.toISOString(),
        readJsonRecord(history.metadata)?.namespace
      ].join("|")
    );
    const latestHistoryAt = new Map<string, string>();
    for (const history of plan.histories) {
      latestHistoryAt.set(history.orderNo, history.createdAt);
    }
    const expectedNotificationKeys = plan.bookings.map((booking) =>
      [
        booking.customerUserId,
        booking.shopOwnerUserId,
        booking.orderNo,
        booking.status,
        latestHistoryAt.get(booking.orderNo),
        FUTURE_OPERATIONS_NAMESPACE
      ].join("|")
    );
    const actualNotificationKeys = notifications.map((notification) => {
      const payload = readJsonRecord(notification.payload);
      return [
        notification.recipientUserId,
        notification.actorUserId,
        payload?.orderNo,
        payload?.status,
        notification.createdAt.toISOString(),
        payload?.namespace
      ].join("|");
    });

    const availabilityById = new Map(
      availabilities.map((availability) => [availability.id, availability])
    );
    const slotById = new Map(slots.map((slot) => [slot.id, slot]));
    const invalidSlots = slots.filter((slot) => {
      const availability = slot.availabilityId
        ? availabilityById.get(slot.availabilityId)
        : undefined;
      return (
        !availability ||
        availability.technicianProfileId !== slot.technicianProfileId ||
        availability.shopId !== slot.shopId ||
        availability.startsAt.getTime() !== slot.startsAt.getTime() ||
        availability.endsAt.getTime() !== slot.endsAt.getTime()
      );
    }).length;
    const invalidBookings = bookings.filter((booking) => {
      const slot = slotById.get(booking.scheduleSlotId);
      const snapshot = readJsonRecord(booking.serviceSnapshotJson);
      return (
        !slot ||
        slot.technicianProfileId !== booking.technicianProfileId ||
        slot.technicianServiceId !== booking.technicianServiceId ||
        slot.shopId !== booking.shopId ||
        slot.serviceId !== booking.serviceId ||
        slot.startsAt.getTime() !== booking.startsAt.getTime() ||
        slot.endsAt.getTime() !== booking.endsAt.getTime() ||
        snapshot?.namespace !== FUTURE_OPERATIONS_NAMESPACE ||
        (booking.status === BookingOrderStatus.CANCELLED
          ? slot.status !== "AVAILABLE" || slot.bookedCount !== 0
          : slot.status !== "BOOKED" || slot.bookedCount !== 1)
      );
    }).length;
    const allowedStatuses = new Set<BookingOrderStatus>([
      BookingOrderStatus.PENDING,
      BookingOrderStatus.CONFIRMED,
      BookingOrderStatus.CANCELLED
    ]);
    const technicianOverlapCount = countOverlaps(
      slots.flatMap((slot) =>
        slot.technicianProfileId === null
          ? []
          : [{ ownerId: slot.technicianProfileId, startsAt: slot.startsAt, endsAt: slot.endsAt }]
      )
    );
    const customerOverlapCount = countOverlaps(
      bookings
        .filter((booking) => booking.status !== BookingOrderStatus.CANCELLED)
        .map((booking) => ({
          ownerId: booking.customerUserId,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt
        }))
    );
    const duplicateOrderNoCount =
      bookings.length - new Set(bookings.map((booking) => booking.orderNo)).size;
    const invalidRelationshipCount = invalidSlots + invalidBookings;
    const futureTerminalStatusCount = bookings.filter(
      (booking) => !allowedStatuses.has(booking.status)
    ).length;

    const months = Object.fromEntries(
      Object.keys(planSummary.months).map((month) => [
        month,
        {
          availabilities: 0,
          slots: 0,
          bookings: 0,
          statuses: { PENDING: 0, CONFIRMED: 0, CANCELLED: 0 }
        }
      ])
    ) as Record<
      string,
      {
        availabilities: number;
        slots: number;
        bookings: number;
        statuses: { PENDING: number; CONFIRMED: number; CANCELLED: number };
      }
    >;
    for (const availability of availabilities) {
      months[toTokyoMonthKey(availability.startsAt)]!.availabilities += 1;
    }
    for (const slot of slots) {
      months[toTokyoMonthKey(slot.startsAt)]!.slots += 1;
    }
    for (const booking of bookings) {
      const month = months[toTokyoMonthKey(booking.startsAt)]!;
      month.bookings += 1;
      if (booking.status === BookingOrderStatus.PENDING) month.statuses.PENDING += 1;
      if (booking.status === BookingOrderStatus.CONFIRMED) month.statuses.CONFIRMED += 1;
      if (booking.status === BookingOrderStatus.CANCELLED) month.statuses.CANCELLED += 1;
    }

    const inventory = buildThreeMonthSimulationPlan();
    const ownerEmails = inventory.shops.map((shop) => shop.ownerEmail);
    const technicianEmails = inventory.technicians.map((technician) => technician.email);
    const historicalCustomerEmails = inventory.customers.map((customer) => customer.email);
    const historicalUsers = await prisma.user.findMany({
      where: {
        email: { in: [...ownerEmails, ...technicianEmails, ...historicalCustomerEmails] },
        deletedAt: null
      },
      select: { id: true, email: true }
    });
    const historicalUserIdByEmail = new Map(historicalUsers.map((user) => [user.email, user.id]));
    const historicalTechnicianUserIds = technicianEmails.flatMap((email) => {
      const id = historicalUserIdByEmail.get(email);
      return id === undefined ? [] : [id];
    });
    const historicalCustomerUserIds = historicalCustomerEmails.flatMap((email) => {
      const id = historicalUserIdByEmail.get(email);
      return id === undefined ? [] : [id];
    });
    const historicalOwnerUserIds = ownerEmails.flatMap((email) => {
      const id = historicalUserIdByEmail.get(email);
      return id === undefined ? [] : [id];
    });
    const historicalWindow = {
      gte: new Date(SIMULATION_START_AT),
      lte: new Date(SIMULATION_END_AT)
    };
    const [
      historicalTechnicians,
      historicalCustomers,
      historicalShops,
      historicalSlots,
      historicalBookings
    ] = await Promise.all([
      prisma.technicianProfile.count({
        where: { userId: { in: historicalTechnicianUserIds }, deletedAt: null }
      }),
      prisma.customerProfile.count({
        where: { userId: { in: historicalCustomerUserIds }, deletedAt: null }
      }),
      prisma.shop.count({
        where: { ownerUserId: { in: historicalOwnerUserIds }, deletedAt: null }
      }),
      prisma.scheduleSlot.count({
        where: {
          technicianProfileId: { in: technicianProfileIds },
          startsAt: historicalWindow,
          deletedAt: null
        }
      }),
      prisma.bookingOrder.count({
        where: { orderNo: { startsWith: SIMULATION_ORDER_PREFIX }, deletedAt: null }
      })
    ]);
    const historicalBaseline = {
      accounts: historicalUsers.length,
      shops: historicalShops,
      technicians: historicalTechnicians,
      customers: historicalCustomers,
      slots: historicalSlots,
      bookings: historicalBookings
    };

    const exactMatches = {
      availabilities: stableSetEquals(expectedAvailabilityKeys, actualAvailabilityKeys),
      slots: stableSetEquals(expectedSlotKeys, actualSlotKeys),
      bookings: stableSetEquals(expectedBookingKeys, actualBookingKeys),
      histories: stableSetEquals(expectedHistoryKeys, actualHistoryKeys),
      notifications: stableSetEquals(expectedNotificationKeys, actualNotificationKeys)
    };
    const databaseSummary = {
      availabilities: availabilities.length,
      slots: slots.length,
      bookings: bookings.length,
      histories: histories.length,
      notifications: notifications.length,
      months,
      technicianOverlapCount,
      customerOverlapCount,
      duplicateOrderNoCount,
      invalidRelationshipCount,
      futureTerminalStatusCount,
      orderFinancials,
      walletHolds,
      reviews,
      exactMatches,
      historicalBaseline
    };

    assert(
      databaseSummary.availabilities === plan.availabilities.length,
      "Availability count mismatch."
    );
    assert(databaseSummary.slots === plan.slots.length, "Schedule slot count mismatch.");
    assert(databaseSummary.bookings === plan.bookings.length, "Booking count mismatch.");
    assert(databaseSummary.histories === plan.histories.length, "Status history count mismatch.");
    assert(databaseSummary.notifications === plan.bookings.length, "Notification count mismatch.");
    assert(
      Object.values(exactMatches).every(Boolean),
      "Database rows do not exactly match the deterministic plan."
    );
    assert(
      JSON.stringify(months) === JSON.stringify(planSummary.months),
      "Monthly summary mismatch."
    );
    assert(databaseSummary.technicianOverlapCount === 0, "Technician schedule overlap detected.");
    assert(databaseSummary.customerOverlapCount === 0, "Customer booking overlap detected.");
    assert(databaseSummary.duplicateOrderNoCount === 0, "Duplicate order number detected.");
    assert(
      databaseSummary.invalidRelationshipCount === 0,
      "Cross-entity relationship mismatch detected."
    );
    assert(
      databaseSummary.futureTerminalStatusCount === 0,
      "Future completed or in-service booking detected."
    );
    assert(databaseSummary.orderFinancials === 0, "Future financial records must not exist.");
    assert(databaseSummary.walletHolds === 0, "Future wallet holds must not exist.");
    assert(databaseSummary.reviews === 0, "Future reviews must not exist.");
    assert(historicalBaseline.accounts === 210, "Historical account baseline changed.");
    assert(historicalBaseline.shops === 10, "Historical shop baseline changed.");
    assert(historicalBaseline.technicians === 100, "Historical technician baseline changed.");
    assert(historicalBaseline.customers === 100, "Historical customer baseline changed.");
    assert(historicalBaseline.slots === 2600, "Historical schedule slot baseline changed.");
    assert(historicalBaseline.bookings === 1957, "Historical booking baseline changed.");

    console.log(
      JSON.stringify(
        {
          database: seedConfig.databaseName,
          namespace: FUTURE_OPERATIONS_NAMESPACE,
          status: "ok",
          databaseSummary
        },
        null,
        2
      )
    );
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Future operations check failed.");
  process.exitCode = 1;
});
