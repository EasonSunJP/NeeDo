import { BookingOrderStatus, NotificationType, type Prisma } from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import {
  buildClassificationManifest,
  reconcileExpectedRows
} from "../src/simulation/future-operations-reconciliation";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const readJsonRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const stableSetEquals = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
};

const countOverlaps = (rows: Array<{ ownerId: number; startsAt: Date; endsAt: Date }>): number => {
  const byOwner = new Map<number, Array<{ startsAt: Date; endsAt: Date }>>();
  for (const row of rows) byOwner.set(row.ownerId, [...(byOwner.get(row.ownerId) ?? []), row]);
  let count = 0;
  for (const items of byOwner.values()) {
    const sorted = [...items].sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime()
    );
    let latestEnd: Date | null = null;
    for (const item of sorted) {
      if (latestEnd && item.startsAt < latestEnd) count += 1;
      if (!latestEnd || item.endsAt > latestEnd) latestEnd = item.endsAt;
    }
  }
  return count;
};

const toTokyoMonthKey = (value: Date): string =>
  new Date(value.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 7);
const toUtcDay = (value: Date): string => value.toISOString().slice(0, 10);

const main = async (): Promise<void> => {
  const preview = process.argv.includes("--preview");
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
    const technicianProfileIds = cohort.technicians.map((row) => row.technicianProfileId);
    const customerUserIds = cohort.customers.map((row) => row.userId);
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
          sourceType: true,
          visibility: true,
          startsAt: true,
          endsAt: true,
          isActive: true,
          isScheduleControlWindow: true,
          createdAt: true,
          shop: { select: { shopNo: true, name: true } },
          technicianProfile: { select: { displayName: true, user: { select: { needoId: true } } } },
          _count: { select: { scheduleSlots: true } }
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
          bookedCount: true,
          createdAt: true,
          manualBookingIdempotencyKey: true,
          availability: {
            select: { sourceType: true, visibility: true, isScheduleControlWindow: true }
          },
          shop: { select: { shopNo: true, name: true } },
          technicianProfile: { select: { displayName: true, user: { select: { needoId: true } } } },
          service: { select: { name: true, status: true, deletedAt: true } },
          technicianService: {
            select: {
              name: true,
              isActive: true,
              isBookable: true,
              reviewStatus: true,
              deletedAt: true
            }
          },
          _count: {
            select: {
              bookingOrders: true,
              routeEstimates: true,
              exchangeClaims: true,
              exchangeMatchParticipants: true
            }
          }
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
          priceAmount: true,
          paymentAmountJpy: true,
          createdAt: true,
          updatedAt: true,
          serviceSnapshotJson: true,
          customer: { select: { needoId: true } },
          technicianProfile: { select: { displayName: true, user: { select: { needoId: true } } } },
          shop: { select: { shopNo: true, name: true } },
          service: { select: { name: true, status: true, deletedAt: true } },
          technicianService: {
            select: {
              name: true,
              isActive: true,
              isBookable: true,
              reviewStatus: true,
              deletedAt: true
            }
          },
          scheduleSlot: {
            select: {
              status: true,
              bookedCount: true,
              createdAt: true,
              availability: {
                select: { sourceType: true, visibility: true, isScheduleControlWindow: true }
              }
            }
          }
        }
      })
    ]);

    const availabilityKey = (row: {
      technicianProfileId: number | null;
      shopId: number;
      startsAt: Date;
      endsAt: Date;
      isActive: boolean;
    }): string =>
      [
        row.technicianProfileId,
        row.shopId,
        row.startsAt.toISOString(),
        row.endsAt.toISOString(),
        row.isActive
      ].join("|");
    const expectedAvailabilityKeys = plan.availabilities.map((row) =>
      [row.technicianProfileId, row.shopId, row.startsAt, row.endsAt, row.isActive].join("|")
    );
    const availabilityReconciliation = reconcileExpectedRows(
      availabilities,
      expectedAvailabilityKeys,
      availabilityKey
    );
    const datasetAvailabilityIds = new Set(
      availabilityReconciliation.matchedRows.map((row) => row.id)
    );
    const coexistingAvailabilityIds = new Set(
      availabilityReconciliation.coexistingRows.map((row) => row.id)
    );

    const stableSlotKey = (row: {
      technicianProfileId: number | null;
      shopId: number;
      startsAt: Date;
      endsAt: Date;
    }): string =>
      [
        row.technicianProfileId,
        row.shopId,
        row.startsAt.toISOString(),
        row.endsAt.toISOString()
      ].join("|");
    const expectedSlotKeys = plan.slots.map((row) =>
      [row.technicianProfileId, row.shopId, row.startsAt, row.endsAt].join("|")
    );
    const datasetSlotCandidates = slots.filter(
      (row) => row.availabilityId !== null && datasetAvailabilityIds.has(row.availabilityId)
    );
    const slotReconciliation = reconcileExpectedRows(
      datasetSlotCandidates,
      expectedSlotKeys,
      stableSlotKey
    );
    const datasetSlotIds = new Set(slotReconciliation.matchedRows.map((row) => row.id));
    const coexistingSlots = slots.filter((row) => !datasetSlotIds.has(row.id));
    const expectedSlotStateByKey = new Map(
      plan.slots.map((row) => [
        [row.technicianProfileId, row.shopId, row.startsAt, row.endsAt].join("|"),
        `${row.status}|${row.bookedCount}`
      ])
    );
    const datasetLineageStateChanges = slotReconciliation.matchedRows.filter(
      (row) => expectedSlotStateByKey.get(stableSlotKey(row)) !== `${row.status}|${row.bookedCount}`
    );

    const namespacedBookings = bookings.filter(
      (row) => readJsonRecord(row.serviceSnapshotJson)?.namespace === FUTURE_OPERATIONS_NAMESPACE
    );
    const coexistingBookings = bookings.filter(
      (row) => readJsonRecord(row.serviceSnapshotJson)?.namespace !== FUTURE_OPERATIONS_NAMESPACE
    );
    const stableBookingKey = (row: (typeof bookings)[number]): string => {
      const snapshot = readJsonRecord(row.serviceSnapshotJson);
      return [
        row.orderNo,
        row.customerUserId,
        row.technicianProfileId,
        row.shopId,
        row.startsAt.toISOString(),
        row.endsAt.toISOString(),
        row.status,
        Number(row.priceAmount),
        row.paymentAmountJpy,
        snapshot?.slotKey,
        snapshot?.namespace
      ].join("|");
    };
    const expectedBookingKeys = plan.bookings.map((row) =>
      [
        row.orderNo,
        row.customerUserId,
        row.technicianProfileId,
        row.shopId,
        row.startsAt,
        row.endsAt,
        row.status,
        row.priceAmountJpy,
        row.priceAmountJpy,
        row.slotKey,
        FUTURE_OPERATIONS_NAMESPACE
      ].join("|")
    );
    const bookingReconciliation = reconcileExpectedRows(
      namespacedBookings,
      expectedBookingKeys,
      stableBookingKey
    );
    const datasetBookings = bookingReconciliation.matchedRows;
    const datasetBookingIds = datasetBookings.map((row) => row.id);

    const [histories, notificationCandidates, orderFinancials, walletHolds, reviews] =
      await Promise.all([
        prisma.orderStatusHistory.findMany({
          where: { bookingOrderId: { in: datasetBookingIds }, deletedAt: null },
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
          select: { recipientUserId: true, actorUserId: true, payload: true, createdAt: true }
        }),
        prisma.orderFinancial.count({
          where: { bookingOrderId: { in: datasetBookingIds }, deletedAt: null }
        }),
        prisma.walletHold.count({
          where: { bookingOrderId: { in: datasetBookingIds }, deletedAt: null }
        }),
        prisma.orderReview.count({
          where: { bookingOrderId: { in: datasetBookingIds }, deletedAt: null }
        })
      ]);
    const notifications = notificationCandidates.filter(
      (row) => readJsonRecord(row.payload)?.namespace === FUTURE_OPERATIONS_NAMESPACE
    );
    const expectedHistoryKeys = plan.histories.map((row) =>
      [
        row.orderNo,
        row.fromStatus ?? "null",
        row.toStatus,
        row.actorUserId,
        row.reason,
        row.createdAt,
        FUTURE_OPERATIONS_NAMESPACE
      ].join("|")
    );
    const actualHistoryKeys = histories.map((row) =>
      [
        row.bookingOrder.orderNo,
        row.fromStatus ?? "null",
        row.toStatus,
        row.actorUserId,
        row.reason,
        row.createdAt.toISOString(),
        readJsonRecord(row.metadata)?.namespace
      ].join("|")
    );
    const latestHistoryAt = new Map<string, string>();
    for (const history of plan.histories) latestHistoryAt.set(history.orderNo, history.createdAt);
    const expectedNotificationKeys = plan.bookings.map((row) =>
      [
        row.customerUserId,
        row.shopOwnerUserId,
        row.orderNo,
        row.status,
        latestHistoryAt.get(row.orderNo),
        FUTURE_OPERATIONS_NAMESPACE
      ].join("|")
    );
    const actualNotificationKeys = notifications.map((row) => {
      const payload = readJsonRecord(row.payload);
      return [
        row.recipientUserId,
        row.actorUserId,
        payload?.orderNo,
        payload?.status,
        row.createdAt.toISOString(),
        payload?.namespace
      ].join("|");
    });

    const availabilityById = new Map(
      availabilityReconciliation.matchedRows.map((row) => [row.id, row])
    );
    const slotById = new Map(slots.map((row) => [row.id, row]));
    const invalidSlots = slotReconciliation.matchedRows.filter((slot) => {
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
    const invalidBookings = datasetBookings.filter((booking) => {
      const slot = slotById.get(booking.scheduleSlotId);
      return (
        !slot ||
        slot.technicianProfileId !== booking.technicianProfileId ||
        slot.technicianServiceId !== booking.technicianServiceId ||
        slot.shopId !== booking.shopId ||
        slot.serviceId !== booking.serviceId ||
        slot.startsAt.getTime() !== booking.startsAt.getTime() ||
        slot.endsAt.getTime() !== booking.endsAt.getTime() ||
        Number(booking.priceAmount) !== booking.paymentAmountJpy ||
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
      slotReconciliation.matchedRows.flatMap((slot) =>
        slot.technicianProfileId === null
          ? []
          : [{ ownerId: slot.technicianProfileId, startsAt: slot.startsAt, endsAt: slot.endsAt }]
      )
    );
    const customerOverlapCount = countOverlaps(
      datasetBookings
        .filter((row) => row.status !== BookingOrderStatus.CANCELLED)
        .map((row) => ({ ownerId: row.customerUserId, startsAt: row.startsAt, endsAt: row.endsAt }))
    );
    const duplicateOrderNoCount =
      namespacedBookings.length - new Set(namespacedBookings.map((row) => row.orderNo)).size;
    const invalidRelationshipCount = invalidSlots + invalidBookings;
    const futureTerminalStatusCount = namespacedBookings.filter(
      (row) => !allowedStatuses.has(row.status)
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
    for (const row of availabilityReconciliation.matchedRows)
      months[toTokyoMonthKey(row.startsAt)]!.availabilities += 1;
    for (const row of slotReconciliation.matchedRows)
      months[toTokyoMonthKey(row.startsAt)]!.slots += 1;
    for (const row of datasetBookings) {
      const month = months[toTokyoMonthKey(row.startsAt)]!;
      month.bookings += 1;
      if (row.status === BookingOrderStatus.PENDING) month.statuses.PENDING += 1;
      if (row.status === BookingOrderStatus.CONFIRMED) month.statuses.CONFIRMED += 1;
      if (row.status === BookingOrderStatus.CANCELLED) month.statuses.CANCELLED += 1;
    }

    const serviceState = (row: (typeof slots)[number]): string =>
      row.serviceId === null
        ? "none"
        : !row.service
          ? "missing"
          : row.service.deletedAt
            ? "deleted"
            : row.service.status;
    const technicianServiceState = (row: (typeof slots)[number]): string =>
      row.technicianServiceId === null
        ? "none"
        : !row.technicianService
          ? "missing"
          : row.technicianService.deletedAt
            ? "deleted"
            : `${row.technicianService.reviewStatus}:${row.technicianService.isActive}:${row.technicianService.isBookable}`;
    const repairBatch = (row: (typeof slots)[number]): string => {
      const key = row.manualBookingIdempotencyKey;
      return key?.startsWith("stale-slot-repair:") ? key.split(":").slice(0, 2).join(":") : "none";
    };
    const slotLineage = (row: (typeof slots)[number]): string => {
      const batch = repairBatch(row);
      if (batch !== "none") return batch;
      if (row.availabilityId && coexistingAvailabilityIds.has(row.availabilityId)) {
        return "later_operational_availability";
      }
      if (row.availabilityId && datasetAvailabilityIds.has(row.availabilityId)) {
        return "dataset_lineage_unexpected";
      }
      return "unlinked";
    };
    const coexistenceManifest = {
      availabilities: buildClassificationManifest(availabilityReconciliation.coexistingRows, {
        source: (row) =>
          `${row.sourceType}|${row.visibility}|control=${row.isScheduleControlWindow}|active=${row.isActive}`,
        owner: (row) =>
          `${row.technicianProfileId}:${row.technicianProfile?.user.needoId ?? "none"}:${row.technicianProfile?.displayName ?? "none"}`,
        shop: (row) => `${row.shopId}:${row.shop.shopNo ?? "none"}:${row.shop.name}`,
        service: () => "not_applicable",
        month: (row) => toTokyoMonthKey(row.startsAt),
        creationPattern: (row) =>
          `${toUtcDay(row.createdAt)}|slotFanout=${row._count.scheduleSlots}`
      }),
      scheduleSlots: buildClassificationManifest(coexistingSlots, {
        lineage: slotLineage,
        source: (row) =>
          `${row.availability?.sourceType ?? "NO_AVAILABILITY"}|${row.availability?.visibility ?? "none"}|control=${row.availability?.isScheduleControlWindow ?? false}`,
        owner: (row) =>
          `${row.technicianProfileId}:${row.technicianProfile?.user.needoId ?? "none"}:${row.technicianProfile?.displayName ?? "none"}`,
        shop: (row) => `${row.shopId}:${row.shop.shopNo ?? "none"}:${row.shop.name}`,
        service: (row) =>
          `${row.serviceId ?? "none"}:${row.service?.name ?? "none"}:${serviceState(row)}|technicianService=${row.technicianServiceId ?? "none"}:${row.technicianService?.name ?? "none"}:${technicianServiceState(row)}`,
        catalogState: (row) =>
          `service=${serviceState(row)}|technicianService=${technicianServiceState(row)}`,
        month: (row) => toTokyoMonthKey(row.startsAt),
        creationPattern: (row) => `${toUtcDay(row.createdAt)}|repairBatch=${repairBatch(row)}`,
        stateAndRelations: (row) =>
          `${row.status}|booked=${row.bookedCount}|bookings=${row._count.bookingOrders}|routes=${row._count.routeEstimates}|claims=${row._count.exchangeClaims}|matches=${row._count.exchangeMatchParticipants}`
      }),
      bookings: buildClassificationManifest(coexistingBookings, {
        source: (row) =>
          String(readJsonRecord(row.serviceSnapshotJson)?.namespace ?? "formal_non_namespaced"),
        owner: (row) =>
          `customer=${row.customerUserId}:${row.customer.needoId}|technician=${row.technicianProfileId}:${row.technicianProfile?.user.needoId ?? "none"}`,
        shop: (row) => `${row.shopId}:${row.shop.shopNo ?? "none"}:${row.shop.name}`,
        service: (row) =>
          `${row.serviceId ?? "none"}:${row.service?.name ?? "none"}:${row.service?.deletedAt ? "deleted" : (row.service?.status ?? "missing")}`,
        month: (row) => toTokyoMonthKey(row.startsAt),
        creationPattern: (row) => toUtcDay(row.createdAt),
        status: (row) => row.status
      }),
      datasetLineageStateChanges: buildClassificationManifest(datasetLineageStateChanges, {
        owner: (row) =>
          `${row.technicianProfileId}:${row.technicianProfile?.user.needoId ?? "none"}:${row.technicianProfile?.displayName ?? "none"}`,
        shop: (row) => `${row.shopId}:${row.shop.shopNo ?? "none"}:${row.shop.name}`,
        service: (row) =>
          `${row.serviceId ?? "none"}:${row.service?.name ?? "none"}:${serviceState(row)}`,
        month: (row) => toTokyoMonthKey(row.startsAt),
        creationPattern: (row) => `${toUtcDay(row.createdAt)}|repairBatch=${repairBatch(row)}`,
        stateAndRelations: (row) =>
          `${row.status}|booked=${row.bookedCount}|bookings=${row._count.bookingOrders}`
      })
    };

    const conflictIds = coexistingBookings.map((row) => row.id);
    const [conflictHistories, conflictFinancials, conflictWalletHolds, conflictReviews] =
      await Promise.all([
        prisma.orderStatusHistory.findMany({
          where: { bookingOrderId: { in: conflictIds }, deletedAt: null },
          select: {
            bookingOrderId: true,
            fromStatus: true,
            toStatus: true,
            actorUserId: true,
            reason: true,
            createdAt: true
          }
        }),
        prisma.orderFinancial.findMany({
          where: { bookingOrderId: { in: conflictIds }, deletedAt: null },
          select: { id: true, bookingOrderId: true, settlementStatus: true }
        }),
        prisma.walletHold.findMany({
          where: { bookingOrderId: { in: conflictIds }, deletedAt: null },
          select: { id: true, bookingOrderId: true, status: true }
        }),
        prisma.orderReview.findMany({
          where: { bookingOrderId: { in: conflictIds }, deletedAt: null },
          select: { id: true, bookingOrderId: true }
        })
      ]);
    const conflictEvidence = coexistingBookings.map((row) => {
      const technicianOverlaps = bookings.filter(
        (candidate) =>
          candidate.id !== row.id &&
          candidate.status !== BookingOrderStatus.CANCELLED &&
          candidate.technicianProfileId === row.technicianProfileId &&
          candidate.startsAt < row.endsAt &&
          row.startsAt < candidate.endsAt
      );
      const customerOverlaps = bookings.filter(
        (candidate) =>
          candidate.id !== row.id &&
          candidate.status !== BookingOrderStatus.CANCELLED &&
          candidate.customerUserId === row.customerUserId &&
          candidate.startsAt < row.endsAt &&
          row.startsAt < candidate.endsAt
      );
      const pendingOnlyOverlap = [...technicianOverlaps, ...customerOverlaps].every(
        (candidate) => candidate.status === BookingOrderStatus.PENDING
      );
      return {
        bookingId: row.id,
        orderNo: row.orderNo,
        namespace: readJsonRecord(row.serviceSnapshotJson)?.namespace ?? null,
        status: row.status,
        customer: { userId: row.customerUserId, needoId: row.customer.needoId },
        technician: {
          profileId: row.technicianProfileId,
          needoId: row.technicianProfile?.user.needoId ?? null,
          displayName: row.technicianProfile?.displayName ?? null
        },
        shop: { id: row.shopId, shopNo: row.shop.shopNo, name: row.shop.name },
        service: {
          id: row.serviceId,
          name: row.service?.name ?? null,
          state: row.service?.deletedAt ? "deleted" : (row.service?.status ?? "missing")
        },
        technicianService: {
          id: row.technicianServiceId,
          name: row.technicianService?.name ?? null,
          state: row.technicianService?.deletedAt
            ? "deleted"
            : row.technicianService
              ? `${row.technicianService.reviewStatus}:${row.technicianService.isActive}:${row.technicianService.isBookable}`
              : "none"
        },
        scheduleSlot: {
          id: row.scheduleSlotId,
          status: row.scheduleSlot.status,
          bookedCount: row.scheduleSlot.bookedCount,
          createdAt: row.scheduleSlot.createdAt,
          source: row.scheduleSlot.availability
        },
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        overlapClassification:
          technicianOverlaps.length + customerOverlaps.length === 0
            ? "none"
            : pendingOnlyOverlap
              ? "pending_only_soft_conflict"
              : "effective_booking_conflict",
        technicianOverlaps: technicianOverlaps.map((candidate) => ({
          bookingId: candidate.id,
          orderNo: candidate.orderNo,
          status: candidate.status,
          namespace: readJsonRecord(candidate.serviceSnapshotJson)?.namespace ?? null,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt
        })),
        customerOverlaps: customerOverlaps.map((candidate) => ({
          bookingId: candidate.id,
          orderNo: candidate.orderNo,
          status: candidate.status,
          namespace: readJsonRecord(candidate.serviceSnapshotJson)?.namespace ?? null,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt
        })),
        histories: conflictHistories.filter((history) => history.bookingOrderId === row.id),
        financialEvidence: {
          financials: conflictFinancials.filter((item) => item.bookingOrderId === row.id),
          walletHolds: conflictWalletHolds.filter((item) => item.bookingOrderId === row.id),
          reviews: conflictReviews.filter((item) => item.bookingOrderId === row.id)
        }
      };
    });

    const inventory = buildThreeMonthSimulationPlan();
    const ownerEmails = inventory.shops.map((shop) => shop.ownerEmail);
    const technicianEmails = inventory.technicians.map((row) => row.email);
    const historicalCustomerEmails = inventory.customers.map((row) => row.email);
    const historicalUsers = await prisma.user.findMany({
      where: {
        email: { in: [...ownerEmails, ...technicianEmails, ...historicalCustomerEmails] },
        deletedAt: null
      },
      select: { id: true, email: true }
    });
    const historicalUserIdByEmail = new Map(historicalUsers.map((row) => [row.email, row.id]));
    const idsFor = (emails: string[]): number[] =>
      emails.flatMap((email) => {
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
        where: { userId: { in: idsFor(technicianEmails) }, deletedAt: null }
      }),
      prisma.customerProfile.count({
        where: { userId: { in: idsFor(historicalCustomerEmails) }, deletedAt: null }
      }),
      prisma.shop.count({ where: { ownerUserId: { in: idsFor(ownerEmails) }, deletedAt: null } }),
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
      availabilities: availabilityReconciliation.missingExpectedKeys.length === 0,
      slots:
        slotReconciliation.missingExpectedKeys.length === 0 &&
        slotReconciliation.coexistingRows.length === 0,
      bookings:
        bookingReconciliation.missingExpectedKeys.length === 0 &&
        bookingReconciliation.coexistingRows.length === 0,
      histories: stableSetEquals(expectedHistoryKeys, actualHistoryKeys),
      notifications: stableSetEquals(expectedNotificationKeys, actualNotificationKeys)
    };
    const databaseSummary = {
      availabilities: availabilityReconciliation.matchedRows.length,
      slots: slotReconciliation.matchedRows.length,
      bookings: datasetBookings.length,
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
    const report = {
      database: seedConfig.databaseName,
      namespace: FUTURE_OPERATIONS_NAMESPACE,
      status: preview ? "preview" : "ok",
      databaseSummary,
      coexistenceManifest,
      conflictEvidence,
      repairDecision: {
        databaseMutationRequired: false,
        reason:
          "Coexisting schedules and bookings are outside the dataset namespace; stale service-slot repair is owned by codex/repair-stale-schedule-slots."
      }
    };

    if (preview) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    assert(
      databaseSummary.availabilities === plan.availabilities.length,
      "Namespaced Availability rows are incomplete."
    );
    assert(
      databaseSummary.slots === plan.slots.length,
      "Namespaced ScheduleSlot lineage is incomplete."
    );
    assert(
      databaseSummary.bookings === plan.bookings.length,
      "Namespaced Booking rows are incomplete."
    );
    assert(
      databaseSummary.histories === plan.histories.length,
      "Namespaced status history count mismatch."
    );
    assert(
      databaseSummary.notifications === plan.bookings.length,
      "Namespaced notification count mismatch."
    );
    assert(
      Object.values(exactMatches).every(Boolean),
      "Namespaced dataset rows do not match stable deterministic facts."
    );
    assert(
      JSON.stringify(months) === JSON.stringify(planSummary.months),
      "Namespaced monthly summary mismatch."
    );
    assert(
      databaseSummary.technicianOverlapCount === 0,
      "Namespaced technician schedule overlap detected."
    );
    assert(
      databaseSummary.customerOverlapCount === 0,
      "Namespaced customer booking overlap detected."
    );
    assert(
      databaseSummary.duplicateOrderNoCount === 0,
      "Namespaced duplicate order number detected."
    );
    assert(
      databaseSummary.invalidRelationshipCount === 0,
      "Namespaced cross-entity relationship mismatch detected."
    );
    assert(
      databaseSummary.futureTerminalStatusCount === 0,
      "Namespaced future completed or in-service booking detected."
    );
    assert(
      databaseSummary.orderFinancials === 0,
      "Namespaced future financial records must not exist."
    );
    assert(databaseSummary.walletHolds === 0, "Namespaced future wallet holds must not exist.");
    assert(databaseSummary.reviews === 0, "Namespaced future reviews must not exist.");
    assert(historicalBaseline.accounts === 210, "Historical account baseline changed.");
    assert(historicalBaseline.shops === 10, "Historical shop baseline changed.");
    assert(historicalBaseline.technicians === 100, "Historical technician baseline changed.");
    assert(historicalBaseline.customers === 100, "Historical customer baseline changed.");
    assert(historicalBaseline.slots === 2600, "Historical schedule slot baseline changed.");
    assert(historicalBaseline.bookings === 1957, "Historical booking baseline changed.");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Future operations check failed.");
  process.exitCode = 1;
});
