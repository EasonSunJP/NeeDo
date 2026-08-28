export const FUTURE_OPERATIONS_NAMESPACE = "lifedance_future_ops_2026_09_2027_02_v1";
export const FUTURE_OPERATIONS_ORDER_PREFIX = "LDF26-";
export const FUTURE_OPERATIONS_START_AT = "2026-08-31T15:00:00.000Z";
export const FUTURE_OPERATIONS_END_EXCLUSIVE_AT = "2027-02-28T15:00:00.000Z";
export const FUTURE_OPERATIONS_AS_OF_AT = "2026-08-28T00:00:00.000Z";

export type FutureBookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type FutureSlotStatus = "AVAILABLE" | "BOOKED" | "BLOCKED";

export interface FutureOperationsCustomerInput {
  key: string;
  userId: number;
}

export interface FutureOperationsTechnicianInput {
  key: string;
  userId: number;
  technicianProfileId: number;
  shopId: number;
  shopOwnerUserId: number;
  serviceId: number;
  technicianServiceId: number;
  employmentType: "FULL_TIME" | "TEMPORARY";
  serviceName: string;
  durationMinutes: number;
  priceAmountJpy: number;
  fulfillmentMode: "store" | "home_visit";
}

export interface FutureOperationsCohort {
  customers: FutureOperationsCustomerInput[];
  technicians: FutureOperationsTechnicianInput[];
}

export interface FutureAvailabilityPlan {
  key: string;
  technicianProfileId: number;
  shopId: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

export interface FutureSlotPlan extends FutureAvailabilityPlan {
  serviceId: number;
  technicianServiceId: number;
  status: FutureSlotStatus;
  bookedCount: 0 | 1;
}

export interface FutureBookingPlan {
  orderNo: string;
  customerUserId: number;
  technicianProfileId: number;
  technicianServiceId: number;
  shopId: number;
  shopOwnerUserId: number;
  serviceId: number;
  slotKey: string;
  status: FutureBookingStatus;
  fulfillmentMode: "store" | "home_visit";
  serviceName: string;
  priceAmountJpy: number;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  cancelReason: string | null;
}

export interface FutureHistoryPlan {
  orderNo: string;
  fromStatus: FutureBookingStatus | null;
  toStatus: FutureBookingStatus;
  actorUserId: number;
  reason: string;
  createdAt: string;
}

export interface FutureOperationsPlan {
  availabilities: FutureAvailabilityPlan[];
  slots: FutureSlotPlan[];
  bookings: FutureBookingPlan[];
  histories: FutureHistoryPlan[];
}

export interface FutureOperationsValidation {
  technicianOverlapCount: number;
  customerOverlapCount: number;
  duplicateOrderNoCount: number;
  invalidRelationshipCount: number;
  futureTerminalStatusCount: number;
}

export interface FutureOperationsMonthSummary {
  availabilities: number;
  slots: number;
  bookings: number;
  statuses: Record<FutureBookingStatus, number>;
}

export interface FutureOperationsSummary {
  availabilities: number;
  slots: number;
  bookings: number;
  histories: number;
  months: Record<string, FutureOperationsMonthSummary>;
}

const MONTH_OCCUPANCY = new Map<string, number>([
  ["2026-09", 65],
  ["2026-10", 55],
  ["2026-11", 45],
  ["2026-12", 50],
  ["2027-01", 35],
  ["2027-02", 25]
]);

const stableNumber = (...values: number[]): number =>
  values.reduce((result, value, index) => (result * 131 + value * (index + 17)) % 100_003, 97);

const toTokyoDateKey = (instant: Date): string =>
  new Date(instant.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10);

const toTokyoMonthKey = (instant: Date): string => toTokyoDateKey(instant).slice(0, 7);

const atTokyoHour = (dateKey: string, hour: number): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid Tokyo date key: ${dateKey}`);
  }
  return new Date(Date.UTC(year, month - 1, day, hour - 9, 0, 0, 0));
};

const overlaps = (
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
): boolean => leftStart < rightEnd && rightStart < leftEnd;

const countOverlaps = (
  rows: Array<{ ownerId: number; startsAt: string; endsAt: string }>
): number => {
  const byOwner = new Map<number, Array<{ startsAt: string; endsAt: string }>>();
  for (const row of rows) {
    byOwner.set(row.ownerId, [...(byOwner.get(row.ownerId) ?? []), row]);
  }

  let count = 0;
  for (const intervals of byOwner.values()) {
    const sorted = [...intervals].sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt)
    );
    let latestEnd = "";
    for (const interval of sorted) {
      if (latestEnd && interval.startsAt < latestEnd) {
        count += 1;
      }
      if (interval.endsAt > latestEnd) {
        latestEnd = interval.endsAt;
      }
    }
  }
  return count;
};

const buildHistories = (booking: FutureBookingPlan): FutureHistoryPlan[] => {
  const histories: FutureHistoryPlan[] = [
    {
      orderNo: booking.orderNo,
      fromStatus: null,
      toStatus: "PENDING",
      actorUserId: booking.customerUserId,
      reason: "予約を受け付けました。",
      createdAt: booking.createdAt
    }
  ];
  if (booking.status === "PENDING") {
    return histories;
  }

  histories.push({
    orderNo: booking.orderNo,
    fromStatus: "PENDING",
    toStatus: booking.status,
    actorUserId:
      booking.status === "CANCELLED" ? booking.customerUserId : booking.shopOwnerUserId,
    reason:
      booking.status === "CANCELLED"
        ? booking.cancelReason ?? "お客様の予定変更によりキャンセルしました。"
        : "店舗が予約内容を確認しました。",
    createdAt: new Date(new Date(booking.createdAt).getTime() + 30 * 60_000).toISOString()
  });
  return histories;
};

export const buildFutureSixMonthOperationsPlan = (
  cohort: FutureOperationsCohort
): FutureOperationsPlan => {
  if (cohort.technicians.length !== 100 || cohort.customers.length !== 100) {
    throw new Error("Future operations require exactly 100 technicians and 100 customers.");
  }
  if (new Set(cohort.technicians.map((technician) => technician.technicianProfileId)).size !== 100) {
    throw new Error("Future operations require 100 unique technician profiles.");
  }
  if (new Set(cohort.customers.map((customer) => customer.userId)).size !== 100) {
    throw new Error("Future operations require 100 unique customer accounts.");
  }

  const availabilities: FutureAvailabilityPlan[] = [];
  const slots: FutureSlotPlan[] = [];
  const bookings: FutureBookingPlan[] = [];
  const customerBusy = new Map<number, Array<{ startsAt: string; endsAt: string }>>();
  let slotSequence = 0;
  let bookingSequence = 0;

  for (
    let cursor = new Date(FUTURE_OPERATIONS_START_AT), dayIndex = 0;
    cursor < new Date(FUTURE_OPERATIONS_END_EXCLUSIVE_AT);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000), dayIndex += 1
  ) {
    const dateKey = toTokyoDateKey(cursor);
    const dayOfWeek = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();

    for (const [technicianIndex, technician] of cohort.technicians.entries()) {
      const worksToday =
        technician.employmentType === "FULL_TIME"
          ? !new Set([technicianIndex % 7, (technicianIndex + 3) % 7]).has(dayOfWeek)
          : new Set([
              technicianIndex % 7,
              (technicianIndex + 2) % 7,
              (technicianIndex + 5) % 7
            ]).has(dayOfWeek);
      if (!worksToday) {
        continue;
      }

      const hours = technician.employmentType === "FULL_TIME" ? [10, 12, 14, 16] : [11, 14, 17];
      for (const [slotIndex, hour] of hours.entries()) {
        slotSequence += 1;
        const startsAtDate = atTokyoHour(dateKey, hour);
        const endsAtDate = new Date(
          startsAtDate.getTime() + technician.durationMinutes * 60_000
        );
        const startsAt = startsAtDate.toISOString();
        const endsAt = endsAtDate.toISOString();
        const slotKey = `future-slot-${String(slotSequence).padStart(6, "0")}`;
        const blocked = stableNumber(technicianIndex, dayIndex, slotIndex, 29) % 37 === 0;
        const occupancy = MONTH_OCCUPANCY.get(toTokyoMonthKey(startsAtDate));
        if (occupancy === undefined) {
          throw new Error(`Unsupported future month for ${startsAt}.`);
        }
        const selected =
          !blocked && stableNumber(technicianIndex, dayIndex, slotIndex, 43) % 100 < occupancy;
        const cancelled =
          selected && stableNumber(technicianIndex, dayIndex, slotIndex, 61) % 100 < 8;

        const customerOffset =
          stableNumber(technicianIndex, dayIndex, slotIndex, 73) % cohort.customers.length;
        const customer = selected
          ? Array.from(
              { length: cohort.customers.length },
              (_, offset) => cohort.customers[(customerOffset + offset) % cohort.customers.length]!
            ).find(
              (candidate) =>
                !(customerBusy.get(candidate.userId) ?? []).some((busy) =>
                  overlaps(startsAt, endsAt, busy.startsAt, busy.endsAt)
                )
            )
          : undefined;
        if (selected && !customer) {
          throw new Error(`No non-overlapping customer is available for ${slotKey}.`);
        }

        const slotStatus: FutureSlotStatus = blocked
          ? "BLOCKED"
          : selected && !cancelled
            ? "BOOKED"
            : "AVAILABLE";
        availabilities.push({
          key: `future-availability-${String(slotSequence).padStart(6, "0")}`,
          technicianProfileId: technician.technicianProfileId,
          shopId: technician.shopId,
          startsAt,
          endsAt,
          isActive: !blocked
        });
        slots.push({
          key: slotKey,
          technicianProfileId: technician.technicianProfileId,
          shopId: technician.shopId,
          serviceId: technician.serviceId,
          technicianServiceId: technician.technicianServiceId,
          startsAt,
          endsAt,
          isActive: !blocked,
          status: slotStatus,
          bookedCount: slotStatus === "BOOKED" ? 1 : 0
        });

        if (!selected || !customer) {
          continue;
        }

        bookingSequence += 1;
        customerBusy.set(customer.userId, [
          ...(customerBusy.get(customer.userId) ?? []),
          { startsAt, endsAt }
        ]);
        const bookingStatus: FutureBookingStatus = cancelled
          ? "CANCELLED"
          : stableNumber(bookingSequence, technicianIndex, 89) % 4 === 0
            ? "PENDING"
            : "CONFIRMED";
        const createdAt = new Date(
          Math.min(
            new Date(FUTURE_OPERATIONS_AS_OF_AT).getTime() -
              (1 + (bookingSequence % 14)) * 60 * 60_000,
            startsAtDate.getTime() - (3 + (bookingSequence % 45)) * 24 * 60 * 60_000
          )
        ).toISOString();
        const booking: FutureBookingPlan = {
          orderNo: `${FUTURE_OPERATIONS_ORDER_PREFIX}${String(bookingSequence).padStart(7, "0")}`,
          customerUserId: customer.userId,
          technicianProfileId: technician.technicianProfileId,
          technicianServiceId: technician.technicianServiceId,
          shopId: technician.shopId,
          shopOwnerUserId: technician.shopOwnerUserId,
          serviceId: technician.serviceId,
          slotKey,
          status: bookingStatus,
          fulfillmentMode: technician.fulfillmentMode,
          serviceName: technician.serviceName,
          priceAmountJpy: technician.priceAmountJpy,
          durationMinutes: technician.durationMinutes,
          startsAt,
          endsAt,
          createdAt,
          cancelReason:
            bookingStatus === "CANCELLED"
              ? "お客様の予定変更によりキャンセルしました。"
              : null
        };
        bookings.push(booking);
      }
    }
  }

  return {
    availabilities,
    slots,
    bookings,
    histories: bookings.flatMap(buildHistories)
  };
};

export const validateFutureOperationsPlan = (
  plan: FutureOperationsPlan
): FutureOperationsValidation => {
  const slotByKey = new Map(plan.slots.map((slot) => [slot.key, slot]));
  const bookingBySlot = new Map(plan.bookings.map((booking) => [booking.slotKey, booking]));
  const orderNumbers = plan.bookings.map((booking) => booking.orderNo);
  const invalidBookings = plan.bookings.filter((booking) => {
    const slot = slotByKey.get(booking.slotKey);
    return (
      !slot ||
      slot.technicianProfileId !== booking.technicianProfileId ||
      slot.technicianServiceId !== booking.technicianServiceId ||
      slot.shopId !== booking.shopId ||
      slot.serviceId !== booking.serviceId ||
      slot.startsAt !== booking.startsAt ||
      slot.endsAt !== booking.endsAt ||
      (booking.status === "CANCELLED" &&
        (slot.status !== "AVAILABLE" || slot.bookedCount !== 0)) ||
      (booking.status !== "CANCELLED" && (slot.status !== "BOOKED" || slot.bookedCount !== 1))
    );
  }).length;
  const invalidSlots = plan.slots.filter((slot) => {
    const booking = bookingBySlot.get(slot.key);
    return slot.status === "BOOKED" ? !booking || booking.status === "CANCELLED" : false;
  }).length;
  const allowedStatuses = new Set<string>(["PENDING", "CONFIRMED", "CANCELLED"]);

  return {
    technicianOverlapCount: countOverlaps(
      plan.slots.map((slot) => ({
        ownerId: slot.technicianProfileId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt
      }))
    ),
    customerOverlapCount: countOverlaps(
      plan.bookings
        .filter((booking) => booking.status !== "CANCELLED")
        .map((booking) => ({
          ownerId: booking.customerUserId,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt
        }))
    ),
    duplicateOrderNoCount: orderNumbers.length - new Set(orderNumbers).size,
    invalidRelationshipCount: invalidBookings + invalidSlots,
    futureTerminalStatusCount: plan.bookings.filter(
      (booking) => !allowedStatuses.has(booking.status)
    ).length
  };
};

export const summarizeFutureOperationsPlan = (
  plan: FutureOperationsPlan
): FutureOperationsSummary => {
  const months: Record<string, FutureOperationsMonthSummary> = {};
  for (const month of MONTH_OCCUPANCY.keys()) {
    months[month] = {
      availabilities: 0,
      slots: 0,
      bookings: 0,
      statuses: { PENDING: 0, CONFIRMED: 0, CANCELLED: 0 }
    };
  }
  for (const availability of plan.availabilities) {
    months[toTokyoMonthKey(new Date(availability.startsAt))]!.availabilities += 1;
  }
  for (const slot of plan.slots) {
    months[toTokyoMonthKey(new Date(slot.startsAt))]!.slots += 1;
  }
  for (const booking of plan.bookings) {
    const month = months[toTokyoMonthKey(new Date(booking.startsAt))]!;
    month.bookings += 1;
    month.statuses[booking.status] += 1;
  }

  return {
    availabilities: plan.availabilities.length,
    slots: plan.slots.length,
    bookings: plan.bookings.length,
    histories: plan.histories.length,
    months
  };
};
