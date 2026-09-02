import type { BookingScheduleSlot } from "../../../features/booking/api";

const tokyoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const tokyoTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit"
});

function parts(formatter: Intl.DateTimeFormat, value: Date) {
  return new Map(formatter.formatToParts(value).map((part) => [part.type, part.value]));
}

export function getTokyoSlotParts(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const dateParts = parts(tokyoDateFormatter, date);
  const timeParts = parts(tokyoTimeFormatter, date);
  return {
    date: `${dateParts.get("year")}-${dateParts.get("month")}-${dateParts.get("day")}`,
    time: `${timeParts.get("hour")}:${timeParts.get("minute")}`
  };
}

export function getTokyoDayWindow(date: string) {
  const from = new Date(`${date}T00:00:00+09:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(from.getTime())) return null;
  return {
    from: from.toISOString(),
    to: new Date(from.getTime() + 86_400_000).toISOString()
  };
}

export function remainingCheckoutCapacity(slot: BookingScheduleSlot) {
  return Math.max(0, slot.capacity - slot.bookedCount);
}

export function isCheckoutSlotBookable(slot: BookingScheduleSlot) {
  return slot.status === "available" && remainingCheckoutCapacity(slot) > 0;
}

export function slotsForCheckoutDate(slots: BookingScheduleSlot[], date: string) {
  return slots
    .filter((slot) => getTokyoSlotParts(slot.startsAt)?.date === date)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id - right.id);
}

export function resolveInitialCheckoutSlotId(slots: BookingScheduleSlot[], date: string, requestedTime: string | null) {
  const sameDay = slotsForCheckoutDate(slots, date);
  const requested = requestedTime
    ? sameDay.find((slot) => getTokyoSlotParts(slot.startsAt)?.time === requestedTime && isCheckoutSlotBookable(slot))
    : null;
  return requested?.id ?? sameDay.find(isCheckoutSlotBookable)?.id ?? null;
}
