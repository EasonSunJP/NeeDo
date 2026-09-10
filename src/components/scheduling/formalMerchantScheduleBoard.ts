import type { BookingScheduleSlot } from "../../features/booking/api";
import { addDays, getTodayDateKey, getWeekdayLabel } from "../../features/technician-schedule/model";
import type { DispatchScheduleCell, DispatchScheduleGridData, DispatchScheduleRow } from "../../features/dispatch-center/store";
import type { Technician } from "../../types/domain";
import type { UnifiedCalendarEvent, UnifiedCalendarLane } from "./UnifiedUserCalendar";

type FormalMerchantScheduleCycleRange = {
  periodEnd: string;
  periodStart: string;
};

type FormalMerchantScheduleBoardInput = {
  dateKey: string;
  range: FormalMerchantScheduleCycleRange;
  shop: { cover: string; id: string; name: string };
  slots: BookingScheduleSlot[];
  technicians: Array<Pick<Technician, "avatar" | "id" | "identityLabel" | "name" | "nickname">>;
};

type FormalMerchantScheduleBoardResult = {
  dataOverride: {
    cellByEventId: ReadonlyMap<string, DispatchScheduleCell>;
    cycle: FormalMerchantScheduleCycleRange;
    dayGrids: DispatchScheduleGridData[];
    events: UnifiedCalendarEvent[];
    lanes: UnifiedCalendarLane[];
  };
  periodLabel: string;
  summary: {
    bookedCount: number;
    scheduledDayCount: number;
    scheduledTechnicianCount: number;
    technicianCount: number;
  };
};

type FormalScheduleLane = {
  avatar: string;
  caption: string;
  id: string;
  label: string;
  technicianProfileId: number | null;
};

const laneAccents = [
  "var(--client-primary)",
  "var(--client-warm)",
  "var(--client-accent)",
  "var(--client-warning)",
  "color-mix(in srgb, var(--client-primary) 72%, var(--client-accent) 28%)"
];
const formalCycleAnchorDate = "2026-04-14";
const formalCycleLengthDays = 14;

const jstDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Tokyo",
  year: "numeric"
});

function enumerateDateKeys(periodStart: string, periodEnd: string) {
  const dates: string[] = [];
  let cursor = periodStart;

  while (cursor <= periodEnd && dates.length < 62) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function getJstDateTimeParts(value: string) {
  const parts = Object.fromEntries(
    jstDateTimeFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value])
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`
  };
}

function getSlotStatus(slot: BookingScheduleSlot): DispatchScheduleCell["status"] {
  if (slot.status === "booked" || slot.bookedCount > 0) {
    return "booked";
  }

  if (slot.status === "blocked") {
    return "other";
  }

  return "open";
}

function getSlotBadge(slot: BookingScheduleSlot) {
  if (slot.status === "booked" || slot.bookedCount > 0) {
    return "有预约";
  }

  return slot.status === "blocked" ? "已锁定" : "可预约";
}

function getSlotDetail(slot: BookingScheduleSlot) {
  return `${slot.shopName} · ${slot.bookedCount}/${slot.capacity}`;
}

function getSlotPriority(slot: BookingScheduleSlot) {
  if (slot.status === "booked" || slot.bookedCount > 0) return 3;
  if (slot.status === "blocked") return 2;
  return 1;
}

function resolveLaneForSlot(slot: BookingScheduleSlot, lanes: FormalScheduleLane[]) {
  if (slot.technicianProfileId == null) {
    return lanes.find((lane) => lane.technicianProfileId == null);
  }

  return lanes.find((lane) => lane.technicianProfileId === slot.technicianProfileId);
}

function buildFormalScheduleLanes(input: FormalMerchantScheduleBoardInput): FormalScheduleLane[] {
  const lanes = input.technicians.map((technician) => ({
    avatar: technician.avatar,
    caption: [technician.identityLabel, technician.nickname ? technician.name : null].filter(Boolean).join(" · "),
    id: technician.id,
    label: technician.nickname?.trim() || technician.name,
    technicianProfileId: Number.isInteger(Number(technician.id)) ? Number(technician.id) : null
  }));
  const knownTechnicianIds = new Set(lanes.map((lane) => lane.technicianProfileId).filter((id): id is number => id != null));

  input.slots.forEach((slot) => {
    if (slot.technicianProfileId == null || knownTechnicianIds.has(slot.technicianProfileId)) {
      return;
    }

    knownTechnicianIds.add(slot.technicianProfileId);
    lanes.push({
      avatar: "",
      caption: "正式排班记录",
      id: String(slot.technicianProfileId),
      label: slot.technicianName?.trim() || `技师 ${slot.technicianProfileId}`,
      technicianProfileId: slot.technicianProfileId
    });
  });

  if (input.slots.some((slot) => slot.technicianProfileId == null)) {
    lanes.push({
      avatar: input.shop.cover,
      caption: "未指定技师",
      id: `shop-${input.shop.id}`,
      label: "店铺公共",
      technicianProfileId: null
    });
  }

  return lanes;
}

function buildScheduleCell(date: string, hour: number, lane: FormalScheduleLane, slots: BookingScheduleSlot[]): DispatchScheduleCell {
  const cellStartsAt = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+09:00`).getTime();
  const cellEndsAt = cellStartsAt + 60 * 60 * 1000;
  const overlappingSlots = slots
    .filter((slot) => {
      const laneForSlot = slot.technicianProfileId === lane.technicianProfileId;
      const startsAt = new Date(slot.startsAt).getTime();
      const endsAt = new Date(slot.endsAt).getTime();
      return laneForSlot && startsAt < cellEndsAt && endsAt > cellStartsAt;
    })
    .sort((left, right) => getSlotPriority(right) - getSlotPriority(left) || left.id - right.id);
  const slot = overlappingSlots[0];
  const status = slot ? getSlotStatus(slot) : "idle";

  return {
    darkened: false,
    date,
    detail: slot ? getSlotDetail(slot) : "暂无正式排班",
    hour,
    id: `formal-${lane.id}-${date}-${hour}`,
    isClickable: false,
    isCurrent: date === getTodayDateKey() && hour === new Date().getHours(),
    status,
    technicianId: lane.id,
    technicianName: lane.label,
    title: slot?.serviceName ?? "未排班"
  };
}

function buildScheduleRow(date: string, lane: FormalScheduleLane, slots: BookingScheduleSlot[]): DispatchScheduleRow {
  const cells = Array.from({ length: 24 }, (_, hour) => buildScheduleCell(date, hour, lane, slots));

  return {
    cells,
    scheduledHours: cells.filter((cell) => cell.status !== "idle").length,
    technicianAvatar: lane.avatar,
    technicianId: lane.id,
    technicianName: lane.label,
    technicianSubtitle: lane.caption
  };
}

export function getFormalMerchantScheduleCycleRange(dateKey: string): FormalMerchantScheduleCycleRange {
  const anchorTime = new Date(`${formalCycleAnchorDate}T00:00:00Z`).getTime();
  const targetTime = new Date(`${dateKey}T00:00:00Z`).getTime();
  const elapsedDays = Math.floor((targetTime - anchorTime) / (24 * 60 * 60 * 1000));
  const cycleOffset = Math.floor(elapsedDays / formalCycleLengthDays) * formalCycleLengthDays;
  const periodStart = addDays(formalCycleAnchorDate, cycleOffset);

  return {
    periodEnd: addDays(periodStart, formalCycleLengthDays - 1),
    periodStart
  };
}

export function buildFormalMerchantScheduleBoard(input: FormalMerchantScheduleBoardInput): FormalMerchantScheduleBoardResult {
  const dates = enumerateDateKeys(input.range.periodStart, input.range.periodEnd);
  const scheduleLanes = buildFormalScheduleLanes(input);
  const lanes: UnifiedCalendarLane[] = scheduleLanes.map((lane, index) => ({
    accent: laneAccents[index % laneAccents.length] ?? "var(--client-primary)",
    avatar: lane.avatar,
    caption: lane.caption,
    detailPath: lane.technicianProfileId == null ? undefined : `/merchant/staff/${encodeURIComponent(lane.id)}`,
    id: `technician:${lane.id}`,
    label: lane.label
  }));
  const dayGrids: DispatchScheduleGridData[] = dates.map((date) => ({
    cycle: null,
    dates: [date],
    headers: [{ key: date, label: date.slice(5), sublabel: getWeekdayLabel(date) }],
    nowHour: new Date().getHours(),
    rows: scheduleLanes.map((lane) => buildScheduleRow(date, lane, input.slots))
  }));
  const cellByEventId = new Map<string, DispatchScheduleCell>();
  const events = input.slots.flatMap((slot): UnifiedCalendarEvent[] => {
    const lane = resolveLaneForSlot(slot, scheduleLanes);
    if (!lane) return [];
    const slotStart = new Date(slot.startsAt).getTime();
    const slotEnd = new Date(slot.endsAt).getTime();
    return dates.flatMap((date): UnifiedCalendarEvent[] => {
      const dayStart = new Date(`${date}T00:00:00+09:00`).getTime();
      const dayEnd = new Date(`${addDays(date, 1)}T00:00:00+09:00`).getTime();
      if (slotStart >= dayEnd || slotEnd <= dayStart) return [];
      const start = getJstDateTimeParts(new Date(Math.max(slotStart, dayStart)).toISOString());
      const end = slotEnd >= dayEnd
        ? { date, time: "24:00" }
        : getJstDateTimeParts(slot.endsAt);
      const eventId = `formal-slot-${slot.id}-${date}`;
      const eventHour = Number(start.time.slice(0, 2));
      const eventCell = dayGrids
        .find((grid) => grid.dates[0] === start.date)
        ?.rows.find((row) => row.technicianId === lane.id)
        ?.cells.find((cell) => cell.hour === eventHour);

      if (eventCell) {
        cellByEventId.set(eventId, eventCell);
      }

      return [{
        badge: getSlotBadge(slot),
        calendarId: `technician:${lane.id}`,
        calendarLabel: lane.label,
        creatorEntityId: input.shop.id,
        creatorEntityType: "shop",
        creatorLabel: input.shop.name,
        date: start.date,
        endDate: end.date,
        endTime: end.time,
        id: eventId,
        scheduleSlotId: slot.id,
        participants: [
          { avatar: lane.avatar, id: `technician:${lane.id}`, meta: lane.caption, name: lane.label, role: "参加者" },
          { avatar: input.shop.cover, id: `store:${input.shop.id}`, name: input.shop.name, role: "创建者" }
        ],
        readOnly: true,
        sourceId: slot.status === "booked" || slot.bookedCount > 0 ? "merchant" : "technician",
        startTime: start.time,
        subtitle: `${lane.label} · ${getSlotDetail(slot)}`,
        title: slot.serviceName
      }];
    });
  }).sort((left, right) => `${left.date} ${left.startTime} ${left.id}`.localeCompare(`${right.date} ${right.startTime} ${right.id}`));
  const scheduledTechnicianIds = new Set(input.slots.map((slot) => slot.technicianProfileId).filter((id): id is number => id != null));
  const scheduledDates = new Set(events.map((event) => event.date));

  return {
    dataOverride: {
      cellByEventId,
      cycle: input.range,
      dayGrids,
      events,
      lanes
    },
    periodLabel: `${input.range.periodStart} - ${input.range.periodEnd}`,
    summary: {
      bookedCount: input.slots.filter((slot) => slot.status === "booked" || slot.bookedCount > 0).length,
      scheduledDayCount: scheduledDates.size,
      scheduledTechnicianCount: scheduledTechnicianIds.size,
      technicianCount: input.technicians.length
    }
  };
}
