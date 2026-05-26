import type { TechnicianScheduleSnapshot } from "../features/technician-schedule/model";
import {
  intervalToRange,
  isBlockingCustomEvent,
  mergeRanges,
  minutesToTime,
  subtractRanges,
  type MinuteRange
} from "../features/technician-schedule/model";

export type TechnicianPublicAvailabilityRange = {
  date: string;
  startTime: string;
  endTime: string;
};

type BuildTechnicianPublicAvailabilityInput = {
  technicianId: string;
  date: string;
  snapshot: TechnicianScheduleSnapshot;
  bufferMinutes?: number;
  preBufferMinutes?: number;
  postBufferMinutes?: number;
  minDurationMinutes?: number;
};

function clampMinute(value: number) {
  return Math.max(0, Math.min(24 * 60, value));
}

function formatRange(date: string, range: MinuteRange): TechnicianPublicAvailabilityRange {
  return {
    date,
    startTime: minutesToTime(range.start),
    endTime: range.end >= 24 * 60 ? "24:00" : minutesToTime(range.end)
  };
}

export function formatTechnicianPublicAvailabilityRange(range: Pick<TechnicianPublicAvailabilityRange, "startTime" | "endTime">) {
  return `${range.startTime}-${range.endTime}`;
}

export function buildTechnicianPublicAvailabilityRanges({
  technicianId,
  date,
  snapshot,
  bufferMinutes = 0,
  preBufferMinutes = bufferMinutes,
  postBufferMinutes = bufferMinutes,
  minDurationMinutes = 15
}: BuildTechnicianPublicAvailabilityInput): TechnicianPublicAvailabilityRange[] {
  const baseRanges = mergeRanges([
    ...snapshot.dutyShifts
      .filter((shift) => shift.technicianId === technicianId && shift.date === date)
      .map(intervalToRange),
    ...snapshot.customEvents
      .filter((event) => event.technicianId === technicianId && event.date === date && event.kind === "availability")
      .map(intervalToRange)
  ]);

  if (baseRanges.length === 0) {
    return [];
  }

  const bookingBusyRanges = snapshot.bookings
    .filter((booking) => booking.technicianId === technicianId && booking.date === date)
    .map((booking) => {
      const range = intervalToRange(booking);
      return {
        start: clampMinute(range.start - preBufferMinutes),
        end: clampMinute(range.end + postBufferMinutes)
      };
    });

  const blockingEventRanges = snapshot.customEvents
    .filter((event) => event.technicianId === technicianId && event.date === date && isBlockingCustomEvent(event.kind))
    .map(intervalToRange);

  return subtractRanges(baseRanges, [...bookingBusyRanges, ...blockingEventRanges])
    .filter((range) => range.end - range.start >= minDurationMinutes)
    .map((range) => formatRange(date, range));
}
