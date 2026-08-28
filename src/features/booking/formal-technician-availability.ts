import type { TechnicianPublicAvailabilityRange } from "../../lib/technicianPublicAvailability";
import type { BookingScheduleSlot } from "./api";

const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const jstTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit"
});

function partsByType(formatter: Intl.DateTimeFormat, value: Date) {
  return new Map(formatter.formatToParts(value).map((part) => [part.type, part.value]));
}

function formatJstDate(value: Date) {
  const parts = partsByType(jstDateFormatter, value);
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

function formatJstTime(value: Date) {
  const parts = partsByType(jstTimeFormatter, value);
  return `${parts.get("hour")}:${parts.get("minute")}`;
}

export function groupFormalAvailabilityByJstDate(
  slots: BookingScheduleSlot[]
): Map<string, TechnicianPublicAvailabilityRange[]> {
  const grouped = new Map<string, TechnicianPublicAvailabilityRange[]>();
  const availableSlots = slots
    .filter((slot) => slot.status === "available" && slot.bookedCount < slot.capacity)
    .map((slot) => ({
      slot,
      startsAt: new Date(slot.startsAt),
      endsAt: new Date(slot.endsAt)
    }))
    .filter(({ startsAt, endsAt }) => (
      Number.isFinite(startsAt.getTime()) &&
      Number.isFinite(endsAt.getTime()) &&
      startsAt.getTime() < endsAt.getTime()
    ))
    .sort((left, right) => (
      left.startsAt.getTime() - right.startsAt.getTime() || left.slot.id - right.slot.id
    ));

  availableSlots.forEach(({ startsAt, endsAt }) => {
    const date = formatJstDate(startsAt);
    const range: TechnicianPublicAvailabilityRange = {
      date,
      startTime: formatJstTime(startsAt),
      endTime: formatJstTime(endsAt)
    };
    grouped.set(date, [...(grouped.get(date) ?? []), range]);
  });

  return grouped;
}
