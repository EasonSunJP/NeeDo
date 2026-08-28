import {
  BookingOrderStatus,
  NotificationType,
  OrderType,
  ScheduleSlotStatus,
  ServiceOwnerType,
  ServicePaymentMethod,
  ServicePaymentStatus,
  ShopPricingMode,
  TechnicianEmploymentType,
  TechnicianServiceReviewStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";

import {
  FUTURE_OPERATIONS_END_EXCLUSIVE_AT,
  FUTURE_OPERATIONS_NAMESPACE,
  FUTURE_OPERATIONS_ORDER_PREFIX,
  FUTURE_OPERATIONS_START_AT,
  summarizeFutureOperationsPlan,
  validateFutureOperationsPlan,
  type FutureBookingStatus,
  type FutureOperationsCohort,
  type FutureOperationsPlan,
  type FutureOperationsSummary
} from "./future-six-month-operations-plan";
import { buildThreeMonthSimulationPlan } from "./three-month-simulation-plan";

export type FutureOperationsReadClient = Pick<
  PrismaClient,
  | "user"
  | "customerProfile"
  | "technicianProfile"
  | "technicianService"
  | "availability"
  | "scheduleSlot"
  | "bookingOrder"
>;

export interface FutureOperationsInspection {
  activeAvailabilities: number;
  activeSlots: number;
  namespacedBookings: number;
  conflictingBookings: number;
}

export interface FutureOperationsApplyResult {
  mode: "created" | "noop";
  summary: FutureOperationsSummary;
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readJsonRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toFulfillmentMode = (value: string): "store" | "home_visit" => {
  if (value !== "store" && value !== "home_visit") {
    throw new Error(`Unsupported service mode: ${value}`);
  }
  return value;
};

const toBookingStatus = (status: FutureBookingStatus): BookingOrderStatus => {
  const statuses: Record<FutureBookingStatus, BookingOrderStatus> = {
    PENDING: BookingOrderStatus.PENDING,
    CONFIRMED: BookingOrderStatus.CONFIRMED,
    CANCELLED: BookingOrderStatus.CANCELLED
  };
  return statuses[status];
};

const toSlotStatus = (status: "AVAILABLE" | "BOOKED" | "BLOCKED"): ScheduleSlotStatus => {
  const statuses = {
    AVAILABLE: ScheduleSlotStatus.AVAILABLE,
    BOOKED: ScheduleSlotStatus.BOOKED,
    BLOCKED: ScheduleSlotStatus.BLOCKED
  } as const;
  return statuses[status];
};

const chunkRows = <T>(rows: T[], size = 500): T[][] =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size)
  );

const getRequiredId = (ids: ReadonlyMap<string, number>, key: string, entity: string): number => {
  const id = ids.get(key);
  if (id === undefined) {
    throw new Error(`${entity} id is missing for ${key}.`);
  }
  return id;
};

const stableSetEquals = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
};

export const loadFutureOperationsCohort = async (
  prisma: FutureOperationsReadClient
): Promise<FutureOperationsCohort> => {
  const inventory = buildThreeMonthSimulationPlan();
  const technicianByEmail = new Map(
    inventory.technicians.map((technician) => [technician.email, technician])
  );
  const customerByEmail = new Map(
    inventory.customers.map((customer) => [customer.email, customer])
  );
  const emails = [...technicianByEmail.keys(), ...customerByEmail.keys()];
  const users = await prisma.user.findMany({
    where: {
      email: { in: emails },
      isActive: true,
      deletedAt: null
    },
    select: { id: true, email: true }
  });
  assert(users.length === 200, `Expected 200 existing test users, found ${users.length}.`);

  const userIdByEmail = new Map(users.map((user) => [user.email, user.id]));
  const customerUserIds = inventory.customers.map((customer) => {
    const userId = userIdByEmail.get(customer.email);
    assert(userId !== undefined, `Existing customer account is missing: ${customer.email}`);
    return userId;
  });
  const customerProfiles = await prisma.customerProfile.findMany({
    where: { userId: { in: customerUserIds }, deletedAt: null },
    select: { userId: true }
  });
  assert(
    customerProfiles.length === 100,
    `Expected 100 existing customer profiles, found ${customerProfiles.length}.`
  );
  const customerProfileUserIds = new Set(customerProfiles.map((profile) => profile.userId));

  const technicianUserIds = inventory.technicians.map((technician) => {
    const userId = userIdByEmail.get(technician.email);
    assert(userId !== undefined, `Existing technician account is missing: ${technician.email}`);
    return userId;
  });
  const technicianProfiles = await prisma.technicianProfile.findMany({
    where: {
      userId: { in: technicianUserIds },
      status: "published",
      deletedAt: null
    },
    select: {
      id: true,
      userId: true,
      shopId: true,
      employmentType: true,
      shop: {
        select: {
          id: true,
          ownerUserId: true,
          status: true,
          deletedAt: true
        }
      }
    }
  });
  assert(
    technicianProfiles.length === 100,
    `Expected 100 existing technician profiles, found ${technicianProfiles.length}.`
  );

  const technicianProfileIds = technicianProfiles.map((profile) => profile.id);
  const technicianServices = await prisma.technicianService.findMany({
    where: {
      technicianId: { in: technicianProfileIds },
      isActive: true,
      isBookable: true,
      reviewStatus: TechnicianServiceReviewStatus.APPROVED,
      deletedAt: null
    },
    select: {
      id: true,
      technicianId: true,
      shopId: true,
      sourceShopServiceId: true,
      name: true,
      durationMinutes: true,
      priceAmount: true,
      sourceShopService: {
        select: {
          id: true,
          shopId: true,
          serviceMode: true,
          status: true,
          deletedAt: true
        }
      }
    }
  });
  assert(
    technicianServices.length === 100,
    `Expected 100 active technician services, found ${technicianServices.length}.`
  );

  const profileByUserId = new Map(technicianProfiles.map((profile) => [profile.userId, profile]));
  const servicesByTechnicianId = new Map<number, (typeof technicianServices)[number][]>();
  for (const service of technicianServices) {
    servicesByTechnicianId.set(service.technicianId, [
      ...(servicesByTechnicianId.get(service.technicianId) ?? []),
      service
    ]);
  }

  const technicians = inventory.technicians.map((technician) => {
    const userId = userIdByEmail.get(technician.email);
    assert(userId !== undefined, `Existing technician account is missing: ${technician.email}`);
    const profile = profileByUserId.get(userId);
    assert(profile, `Existing technician profile is missing: ${technician.email}`);
    assert(
      profile.shopId !== null &&
        profile.shop?.id === profile.shopId &&
        profile.shop.ownerUserId !== null &&
        profile.shop.status === "published" &&
        profile.shop.deletedAt === null,
      `Active shop relation is missing: ${technician.email}`
    );
    assert(
      profile.employmentType === TechnicianEmploymentType.FULL_TIME ||
        profile.employmentType === TechnicianEmploymentType.TEMPORARY,
      `Unsupported employment type: ${technician.email}`
    );
    const assignments = servicesByTechnicianId.get(profile.id) ?? [];
    assert(
      assignments.length === 1,
      `Expected one active bookable technician service: ${technician.email}`
    );
    const assignment = assignments[0]!;
    const source = assignment.sourceShopService;
    assert(
      assignment.shopId === profile.shopId &&
        assignment.sourceShopServiceId !== null &&
        source?.id === assignment.sourceShopServiceId &&
        source.shopId === profile.shopId &&
        source.status === "published" &&
        source.deletedAt === null,
      `Cross-shop or inactive service relation: ${technician.email}`
    );
    const fulfillmentMode = toFulfillmentMode(source.serviceMode);
    assert(
      assignment.durationMinutes > 0 && assignment.priceAmount > 0,
      `Invalid technician service terms: ${technician.email}`
    );

    return {
      key: technician.key,
      userId,
      technicianProfileId: profile.id,
      shopId: profile.shopId,
      shopOwnerUserId: profile.shop.ownerUserId,
      serviceId: source.id,
      technicianServiceId: assignment.id,
      employmentType: profile.employmentType,
      serviceName: assignment.name,
      durationMinutes: assignment.durationMinutes,
      priceAmountJpy: assignment.priceAmount,
      fulfillmentMode
    };
  });

  const customers = inventory.customers.map((customer) => {
    const userId = userIdByEmail.get(customer.email);
    assert(userId !== undefined, `Existing customer account is missing: ${customer.email}`);
    assert(
      customerProfileUserIds.has(userId),
      `Existing customer profile is missing: ${customer.email}`
    );
    return { key: customer.key, userId };
  });

  return { customers, technicians };
};

export const inspectFutureOperationsWindow = async (
  prisma: FutureOperationsReadClient,
  plan: FutureOperationsPlan
): Promise<FutureOperationsInspection> => {
  const technicianProfileIds = [...new Set(plan.slots.map((slot) => slot.technicianProfileId))];
  const startsAt = {
    gte: new Date(FUTURE_OPERATIONS_START_AT),
    lt: new Date(FUTURE_OPERATIONS_END_EXCLUSIVE_AT)
  };
  const [activeAvailabilities, activeSlots, bookings] = await Promise.all([
    prisma.availability.count({
      where: {
        technicianProfileId: { in: technicianProfileIds },
        startsAt,
        deletedAt: null
      }
    }),
    prisma.scheduleSlot.count({
      where: {
        technicianProfileId: { in: technicianProfileIds },
        startsAt,
        deletedAt: null
      }
    }),
    prisma.bookingOrder.findMany({
      where: {
        technicianProfileId: { in: technicianProfileIds },
        startsAt,
        deletedAt: null
      },
      select: { serviceSnapshotJson: true }
    })
  ]);
  const namespacedBookings = bookings.filter(
    (booking) =>
      readJsonRecord(booking.serviceSnapshotJson)?.namespace === FUTURE_OPERATIONS_NAMESPACE
  ).length;

  return {
    activeAvailabilities,
    activeSlots,
    namespacedBookings,
    conflictingBookings: bookings.length - namespacedBookings
  };
};

const persistedPlanMatches = async (
  prisma: Prisma.TransactionClient,
  plan: FutureOperationsPlan
): Promise<boolean> => {
  const technicianProfileIds = [...new Set(plan.slots.map((slot) => slot.technicianProfileId))];
  const startsAt = {
    gte: new Date(FUTURE_OPERATIONS_START_AT),
    lt: new Date(FUTURE_OPERATIONS_END_EXCLUSIVE_AT)
  };
  const [availabilities, slots, bookings] = await Promise.all([
    prisma.availability.findMany({
      where: {
        technicianProfileId: { in: technicianProfileIds },
        startsAt,
        deletedAt: null
      },
      select: {
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
        startsAt,
        deletedAt: null
      },
      select: {
        id: true,
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
        startsAt,
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
        startsAt: true,
        endsAt: true,
        status: true,
        serviceSnapshotJson: true
      }
    })
  ]);

  const expectedAvailabilities = plan.availabilities.map((availability) =>
    [
      availability.technicianProfileId,
      availability.shopId,
      availability.startsAt,
      availability.endsAt,
      availability.isActive
    ].join("|")
  );
  const actualAvailabilities = availabilities.map((availability) =>
    [
      availability.technicianProfileId,
      availability.shopId,
      availability.startsAt.toISOString(),
      availability.endsAt.toISOString(),
      availability.isActive
    ].join("|")
  );
  if (!stableSetEquals(expectedAvailabilities, actualAvailabilities)) {
    return false;
  }

  const expectedSlots = plan.slots.map((slot) =>
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
  const actualSlots = slots.map((slot) =>
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
  if (!stableSetEquals(expectedSlots, actualSlots)) {
    return false;
  }

  const expectedBookings = plan.bookings.map((booking) =>
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
  const actualBookings = bookings.map((booking) => {
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
  if (!stableSetEquals(expectedBookings, actualBookings)) {
    return false;
  }

  const orderIds = bookings.map((booking) => booking.id);
  const [histories, notificationCandidates] = await Promise.all([
    prisma.orderStatusHistory.findMany({
      where: { bookingOrderId: { in: orderIds }, deletedAt: null },
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
        recipientUserId: {
          in: [...new Set(plan.bookings.map((booking) => booking.customerUserId))]
        },
        type: NotificationType.ORDER_STATUS,
        deletedAt: null
      },
      select: {
        recipientUserId: true,
        actorUserId: true,
        payload: true,
        createdAt: true
      }
    })
  ]);
  const expectedHistories = plan.histories.map((history) =>
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
  const actualHistories = histories.map((history) =>
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
  if (!stableSetEquals(expectedHistories, actualHistories)) {
    return false;
  }

  const latestHistoryAt = new Map<string, string>();
  for (const history of plan.histories) {
    latestHistoryAt.set(history.orderNo, history.createdAt);
  }
  const expectedNotifications = plan.bookings.map((booking) =>
    [
      booking.customerUserId,
      booking.shopOwnerUserId,
      booking.orderNo,
      booking.status,
      latestHistoryAt.get(booking.orderNo),
      FUTURE_OPERATIONS_NAMESPACE
    ].join("|")
  );
  const actualNotifications = notificationCandidates.flatMap((notification) => {
    const payload = readJsonRecord(notification.payload);
    if (payload?.namespace !== FUTURE_OPERATIONS_NAMESPACE) {
      return [];
    }
    return [
      [
        notification.recipientUserId,
        notification.actorUserId,
        payload.orderNo,
        payload.status,
        notification.createdAt.toISOString(),
        payload.namespace
      ].join("|")
    ];
  });
  return stableSetEquals(expectedNotifications, actualNotifications);
};

export const applyFutureOperationsPlan = async (
  prisma: PrismaClient,
  plan: FutureOperationsPlan
): Promise<FutureOperationsApplyResult> => {
  const validation = validateFutureOperationsPlan(plan);
  assert(
    Object.values(validation).every((count) => count === 0),
    `Future operations plan validation failed: ${JSON.stringify(validation)}`
  );
  const summary = summarizeFutureOperationsPlan(plan);
  const technicianProfileIds = [...new Set(plan.slots.map((slot) => slot.technicianProfileId))];
  const targetWindow = {
    gte: new Date(FUTURE_OPERATIONS_START_AT),
    lt: new Date(FUTURE_OPERATIONS_END_EXCLUSIVE_AT)
  };

  return prisma.$transaction(
    async (tx) => {
      const inspection = await inspectFutureOperationsWindow(tx, plan);
      const hasExistingRows =
        inspection.activeAvailabilities > 0 ||
        inspection.activeSlots > 0 ||
        inspection.namespacedBookings > 0 ||
        inspection.conflictingBookings > 0;
      if (hasExistingRows) {
        if (await persistedPlanMatches(tx, plan)) {
          return { mode: "noop" as const, summary };
        }
        throw new Error(
          "Target window contains non-matching operational data; refusing to overwrite it."
        );
      }

      const seedCreatedAt = new Date("2026-08-28T00:00:00.000Z");
      for (const rows of chunkRows(plan.availabilities)) {
        await tx.availability.createMany({
          data: rows.map(
            (availability): Prisma.AvailabilityCreateManyInput => ({
              shopId: availability.shopId,
              technicianProfileId: availability.technicianProfileId,
              startsAt: new Date(availability.startsAt),
              endsAt: new Date(availability.endsAt),
              capacity: 1,
              isActive: availability.isActive,
              createdAt: seedCreatedAt
            })
          )
        });
      }
      const availabilityRows = await tx.availability.findMany({
        where: {
          technicianProfileId: { in: technicianProfileIds },
          startsAt: targetWindow,
          deletedAt: null
        },
        select: { id: true, technicianProfileId: true, startsAt: true }
      });
      const availabilityIds = new Map(
        availabilityRows.map((availability) => [
          `${availability.technicianProfileId}:${availability.startsAt.toISOString()}`,
          availability.id
        ])
      );
      assert(
        availabilityIds.size === plan.availabilities.length,
        `Expected ${plan.availabilities.length} availability ids, found ${availabilityIds.size}.`
      );

      for (const rows of chunkRows(plan.slots)) {
        await tx.scheduleSlot.createMany({
          data: rows.map(
            (slot): Prisma.ScheduleSlotCreateManyInput => ({
              availabilityId: getRequiredId(
                availabilityIds,
                `${slot.technicianProfileId}:${slot.startsAt}`,
                "availability"
              ),
              serviceId: slot.serviceId,
              technicianServiceId: slot.technicianServiceId,
              shopId: slot.shopId,
              technicianProfileId: slot.technicianProfileId,
              startsAt: new Date(slot.startsAt),
              endsAt: new Date(slot.endsAt),
              capacity: 1,
              bookedCount: slot.bookedCount,
              status: toSlotStatus(slot.status),
              createdAt: seedCreatedAt
            })
          )
        });
      }
      const slotRows = await tx.scheduleSlot.findMany({
        where: {
          technicianProfileId: { in: technicianProfileIds },
          startsAt: targetWindow,
          deletedAt: null
        },
        select: { id: true, technicianProfileId: true, startsAt: true }
      });
      const slotIds = new Map(
        slotRows.map((slot) => [
          `${slot.technicianProfileId}:${slot.startsAt.toISOString()}`,
          slot.id
        ])
      );
      assert(
        slotIds.size === plan.slots.length,
        `Expected ${plan.slots.length} schedule slot ids, found ${slotIds.size}.`
      );

      for (const rows of chunkRows(plan.bookings)) {
        await tx.bookingOrder.createMany({
          data: rows.map(
            (booking): Prisma.BookingOrderCreateManyInput => ({
              orderNo: booking.orderNo,
              orderType: OrderType.BOOKING,
              customerUserId: booking.customerUserId,
              serviceId: booking.serviceId,
              technicianServiceId: booking.technicianServiceId,
              shopId: booking.shopId,
              technicianProfileId: booking.technicianProfileId,
              scheduleSlotId: getRequiredId(
                slotIds,
                `${booking.technicianProfileId}:${booking.startsAt}`,
                "schedule slot"
              ),
              status: toBookingStatus(booking.status),
              fulfillmentMode: booking.fulfillmentMode,
              priceAmount: booking.priceAmountJpy,
              currency: "JPY",
              pricingModeSnapshot: ShopPricingMode.MERCHANT,
              serviceOwnerType: ServiceOwnerType.SHOP,
              serviceOwnerId: booking.shopId,
              serviceNameSnapshot: booking.serviceName,
              servicePriceSnapshot: booking.priceAmountJpy,
              serviceDurationSnapshot: booking.durationMinutes,
              serviceSnapshotJson: {
                namespace: FUTURE_OPERATIONS_NAMESPACE,
                dataset: "future_six_month_operations",
                slotKey: booking.slotKey
              },
              startsAt: new Date(booking.startsAt),
              endsAt: new Date(booking.endsAt),
              note: "将来予約の正式ローカル運用テストデータです。",
              cancelReason: booking.cancelReason,
              paymentMethod: ServicePaymentMethod.ONSITE,
              paymentStatus: ServicePaymentStatus.PENDING,
              paymentAmountJpy: 0,
              createdAt: new Date(booking.createdAt)
            })
          )
        });
      }
      const orderRows = await tx.bookingOrder.findMany({
        where: {
          orderNo: { startsWith: FUTURE_OPERATIONS_ORDER_PREFIX },
          startsAt: targetWindow,
          deletedAt: null
        },
        select: { id: true, orderNo: true }
      });
      const orderIds = new Map(orderRows.map((order) => [order.orderNo, order.id]));
      assert(
        orderIds.size === plan.bookings.length,
        `Expected ${plan.bookings.length} booking order ids, found ${orderIds.size}.`
      );

      for (const rows of chunkRows(plan.histories)) {
        await tx.orderStatusHistory.createMany({
          data: rows.map(
            (history): Prisma.OrderStatusHistoryCreateManyInput => ({
              bookingOrderId: getRequiredId(orderIds, history.orderNo, "booking order"),
              fromStatus: history.fromStatus ? toBookingStatus(history.fromStatus) : null,
              toStatus: toBookingStatus(history.toStatus),
              actorUserId: history.actorUserId,
              reason: history.reason,
              metadata: { namespace: FUTURE_OPERATIONS_NAMESPACE },
              createdAt: new Date(history.createdAt)
            })
          )
        });
      }

      const latestHistoryAt = new Map<string, string>();
      for (const history of plan.histories) {
        latestHistoryAt.set(history.orderNo, history.createdAt);
      }
      for (const rows of chunkRows(plan.bookings)) {
        await tx.notification.createMany({
          data: rows.map(
            (booking): Prisma.NotificationCreateManyInput => ({
              recipientUserId: booking.customerUserId,
              actorUserId: booking.shopOwnerUserId,
              type: NotificationType.ORDER_STATUS,
              title: "将来予約状況のお知らせ",
              body: `${booking.orderNo} の予約状況が更新されました。`,
              payload: {
                namespace: FUTURE_OPERATIONS_NAMESPACE,
                dataset: "future_six_month_operations",
                orderNo: booking.orderNo,
                status: booking.status
              },
              readAt: null,
              createdAt: new Date(latestHistoryAt.get(booking.orderNo) ?? booking.createdAt)
            })
          )
        });
      }

      await tx.auditLog.create({
        data: {
          action: "simulation.future_operations.applied",
          targetType: "simulation_dataset",
          metadata: {
            namespace: FUTURE_OPERATIONS_NAMESPACE,
            startsAt: FUTURE_OPERATIONS_START_AT,
            endExclusiveAt: FUTURE_OPERATIONS_END_EXCLUSIVE_AT,
            availabilityCount: plan.availabilities.length,
            slotCount: plan.slots.length,
            bookingCount: plan.bookings.length,
            historyCount: plan.histories.length
          }
        }
      });

      assert(
        await persistedPlanMatches(tx, plan),
        "Persisted future operations data does not match the deterministic plan."
      );
      return { mode: "created" as const, summary };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 20_000,
      timeout: 300_000
    }
  );
};
