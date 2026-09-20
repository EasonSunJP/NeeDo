import type { ScheduleViewSegmentedValue } from "../../components/client-ui/AppScaffold";
import type { BookingScheduleSlot } from "../booking/api";
import { addDays } from "../technician-schedule/model";

export type FormalScheduleStatusBucket = {
  key: string;
  label: string;
  scheduleAvailableHours: number;
  scheduleBookedHours: number;
  scheduleAttendanceCount: number;
};

type CycleRange = { periodStart: string; periodEnd: string };

type BucketWindow = FormalScheduleStatusBucket & { from: number; to: number };

const hourMs = 60 * 60 * 1000;

function rangeDayCount(start: string, end: string) {
  if (start > end) return 0;
  const startTime = new Date(`${start}T00:00:00+09:00`).getTime();
  const endTime = new Date(`${end}T00:00:00+09:00`).getTime();
  return Math.floor((endTime - startTime) / (24 * hourMs)) + 1;
}

function getRange(cycleRange: CycleRange, dateKey: string, view: ScheduleViewSegmentedValue) {
  const requestedEnd = view === "day" ? dateKey : addDays(dateKey, view === "week" ? 6 : 27);
  const start = dateKey < cycleRange.periodStart ? cycleRange.periodStart : dateKey;
  const end = requestedEnd > cycleRange.periodEnd ? cycleRange.periodEnd : requestedEnd;
  return { start, end, dayCount: rangeDayCount(start, end) };
}

function enumerateDates(start: string, dayCount: number) {
  return Array.from({ length: dayCount }, (_, index) => addDays(start, index));
}

function buildBucketWindows(range: ReturnType<typeof getRange>, view: ScheduleViewSegmentedValue): BucketWindow[] {
  if (range.dayCount === 0) return [];
  if (view === "day") {
    return Array.from({ length: 24 }, (_, hour) => {
      const from = new Date(`${range.start}T${String(hour).padStart(2, "0")}:00:00+09:00`).getTime();
      return {
        key: `${range.start}T${String(hour).padStart(2, "0")}`,
        label: `${String(hour).padStart(2, "0")}:00`,
        from,
        to: from + hourMs,
        scheduleAvailableHours: 0,
        scheduleBookedHours: 0,
        scheduleAttendanceCount: 0
      };
    });
  }

  return enumerateDates(range.start, range.dayCount).map((date) => ({
    key: date,
    label: date.slice(5),
    from: new Date(`${date}T00:00:00+09:00`).getTime(),
    to: new Date(`${addDays(date, 1)}T00:00:00+09:00`).getTime(),
    scheduleAvailableHours: 0,
    scheduleBookedHours: 0,
    scheduleAttendanceCount: 0
  }));
}

function isBooked(slot: BookingScheduleSlot) {
  return slot.status === "booked" || slot.bookedCount > 0;
}

function isCounted(slot: BookingScheduleSlot) {
  return slot.status !== "blocked";
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildFormalScheduleStatusStatistics({
  cycleRange,
  dateKey,
  slots,
  view
}: {
  cycleRange: CycleRange;
  dateKey: string;
  slots: BookingScheduleSlot[];
  view: ScheduleViewSegmentedValue;
}) {
  const range = getRange(cycleRange, dateKey, view);
  const windows = buildBucketWindows(range, view);
  const activeSlots = slots.filter(isCounted);
  const attendanceByBucket = windows.map(() => new Set<number>());

  windows.forEach((bucket, bucketIndex) => {
    activeSlots.forEach((slot) => {
      const startsAt = new Date(slot.startsAt).getTime();
      const endsAt = new Date(slot.endsAt).getTime();
      const overlapMs = Math.max(0, Math.min(endsAt, bucket.to) - Math.max(startsAt, bucket.from));
      if (overlapMs === 0) return;
      const overlapHours = overlapMs / hourMs;
      if (isBooked(slot)) bucket.scheduleBookedHours += overlapHours;
      else bucket.scheduleAvailableHours += overlapHours;
      if (slot.technicianProfileId != null) attendanceByBucket[bucketIndex]?.add(slot.technicianProfileId);
    });
  });

  const buckets = windows.map((bucket, index) => ({
    key: bucket.key,
    label: bucket.label,
    scheduleAvailableHours: roundHours(bucket.scheduleAvailableHours),
    scheduleBookedHours: roundHours(bucket.scheduleBookedHours),
    scheduleAttendanceCount: attendanceByBucket[index]?.size ?? 0
  }));
  const rangeStart = windows[0]?.from ?? Number.POSITIVE_INFINITY;
  const rangeEnd = windows.at(-1)?.to ?? Number.NEGATIVE_INFINITY;
  const overlappingSlots = activeSlots.filter((slot) => {
    const startsAt = new Date(slot.startsAt).getTime();
    const endsAt = new Date(slot.endsAt).getTime();
    return startsAt < rangeEnd && endsAt > rangeStart;
  });
  const scheduledTechnicianIds = new Set(
    overlappingSlots.map((slot) => slot.technicianProfileId).filter((id): id is number => id != null)
  );
  const scheduledDates = new Set(
    windows.filter((bucket) => bucket.scheduleAvailableHours > 0 || bucket.scheduleBookedHours > 0)
      .map((bucket) => bucket.key.slice(0, 10))
  );

  return {
    buckets,
    range,
    summary: {
      availableHours: roundHours(buckets.reduce((sum, bucket) => sum + bucket.scheduleAvailableHours, 0)),
      bookedHours: roundHours(buckets.reduce((sum, bucket) => sum + bucket.scheduleBookedHours, 0)),
      bookedSlotCount: overlappingSlots.filter(isBooked).length,
      scheduledDayCount: scheduledDates.size,
      scheduledTechnicianCount: scheduledTechnicianIds.size
    }
  };
}
