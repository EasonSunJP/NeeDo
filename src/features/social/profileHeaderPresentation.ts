import {
  addDays,
  getStartOfWeek,
  getTodayDateKey,
  type TechnicianScheduleSnapshot
} from "../technician-schedule/model";

export type TechnicianWeeklyScheduleTone = "available" | "booked" | "blocked" | "empty";

export type TechnicianWeeklyScheduleItem = {
  id: string;
  date: string;
  dayNumber: string;
  weekdayLabel: string;
  href: string;
  statusLabel: string;
  tone: TechnicianWeeklyScheduleTone;
  meta?: string;
  isToday: boolean;
};

const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

type ScheduleLike = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title?: string;
};

function sortByTime<T extends ScheduleLike>(items: T[]) {
  return [...items].sort((left, right) => `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`));
}

function formatTimeRange(item: ScheduleLike) {
  return `${item.startTime}-${item.endTime}`;
}

export function buildTechnicianWeeklyScheduleItems(
  technicianId: string,
  snapshot: TechnicianScheduleSnapshot,
  anchorDate = getTodayDateKey()
): TechnicianWeeklyScheduleItem[] {
  const startDate = getStartOfWeek(anchorDate);
  const today = getTodayDateKey();

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(startDate, index);
    const shifts = sortByTime(snapshot.dutyShifts.filter((item) => item.technicianId === technicianId && item.date === date));
    const bookings = sortByTime(snapshot.bookings.filter((item) => item.technicianId === technicianId && item.date === date));
    const customEvents = sortByTime(snapshot.customEvents.filter((item) => item.technicianId === technicianId && item.date === date));
    const availabilityEvents = customEvents.filter((item) => item.kind === "availability");
    const blockingEvents = customEvents.filter((item) => item.kind !== "availability");
    const primary = bookings[0] ?? shifts[0] ?? availabilityEvents[0] ?? blockingEvents[0];
    const href = primary
      ? `/technician/schedule/events/${encodeURIComponent(primary.id)}`
      : `/technician/schedule?date=${encodeURIComponent(date)}&technicianId=${encodeURIComponent(technicianId)}`;

    if (bookings.length > 0) {
      return {
        id: date,
        date,
        dayNumber: date.slice(-2),
        weekdayLabel: weekdayLabels[index] ?? "",
        href,
        statusLabel: `${bookings.length}件`,
        tone: "booked",
        meta: formatTimeRange(bookings[0]),
        isToday: date === today
      };
    }

    if (shifts.length > 0 || availabilityEvents.length > 0) {
      const availableItem = shifts[0] ?? availabilityEvents[0];

      return {
        id: date,
        date,
        dayNumber: date.slice(-2),
        weekdayLabel: weekdayLabels[index] ?? "",
        href,
        statusLabel: "可约",
        tone: "available",
        meta: availableItem ? formatTimeRange(availableItem) : undefined,
        isToday: date === today
      };
    }

    if (blockingEvents.length > 0) {
      return {
        id: date,
        date,
        dayNumber: date.slice(-2),
        weekdayLabel: weekdayLabels[index] ?? "",
        href,
        statusLabel: "休",
        tone: "blocked",
        meta: formatTimeRange(blockingEvents[0]),
        isToday: date === today
      };
    }

    return {
      id: date,
      date,
      dayNumber: date.slice(-2),
      weekdayLabel: weekdayLabels[index] ?? "",
      href,
      statusLabel: "待定",
      tone: "empty",
      isToday: date === today
    };
  });
}
