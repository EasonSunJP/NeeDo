import type { ScheduleDetailTargetType, ScheduleEventType } from "../../lib/scheduleDetailTarget";

export type TechnicianScheduleView = "day" | "week" | "month";
export type TechnicianScheduleDensityMode = "entries" | "all";
export type TechnicianScheduleEventKind = "availability" | "leave" | "locked" | "rest" | "travel" | "other";
export type TechnicianScheduleEventPreset =
  | "availability"
  | "leave"
  | "locked"
  | "rest"
  | "travel"
  | "meeting"
  | "meal"
  | "date"
  | "holiday";
export type TechnicianScheduleSyncTargetType = "store" | "technician" | "friend" | "group";
export type TechnicianScheduleTransferStatus =
  | "transfer_pending"
  | "transfer_completed"
  | "transfer_failed"
  | "transfer_cancelled";
export type TechnicianScheduleTransferInvitationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "failed_conflict"
  | "failed_capacity"
  | "cancelled";

export type TechnicianScheduleSyncTarget = {
  id: string;
  type: TechnicianScheduleSyncTargetType;
  label: string;
};

export type TechnicianDutyShift = {
  id: string;
  technicianId: string;
  storeId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  shiftLabel: string;
};

export type TechnicianScheduleBooking = {
  id: string;
  technicianId: string;
  storeId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  customerName: string;
  amount?: number | null;
  orderId?: string;
  parentOrderId?: string;
  appointmentId?: string;
  eventType?: ScheduleEventType;
  isClickable?: boolean;
  detailTargetType?: ScheduleDetailTargetType;
  detailTargetId?: string;
  note?: string;
};

export type TechnicianScheduleCustomEvent = {
  id: string;
  technicianId: string;
  storeId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  kind: TechnicianScheduleEventKind;
  preset?: TechnicianScheduleEventPreset;
  note?: string;
  location?: string;
  allDay?: boolean;
  repeatRule?: string;
  reminder?: string;
  visibility?: string;
  syncTargets: TechnicianScheduleSyncTarget[];
  createdAt: string;
  updatedAt: string;
};

export type TechnicianScheduleTransferRequest = {
  id: string;
  shiftId: string;
  requesterId: string;
  storeId: string;
  requestedCount: number;
  candidateIds: string[];
  status: TechnicianScheduleTransferStatus;
  createdAt: string;
  updatedAt: string;
};

export type TechnicianScheduleTransferInvitation = {
  id: string;
  requestId: string;
  candidateId: string;
  status: TechnicianScheduleTransferInvitationStatus;
  invitedAt: string;
  respondedAt?: string;
};

export type TechnicianScheduleSnapshot = {
  dutyShifts: TechnicianDutyShift[];
  bookings: TechnicianScheduleBooking[];
  customEvents: TechnicianScheduleCustomEvent[];
  transferRequests: TechnicianScheduleTransferRequest[];
  transferInvitations: TechnicianScheduleTransferInvitation[];
  revision: number;
};

export type ScheduleInterval = {
  date: string;
  startTime: string;
  endTime: string;
};

export type TechnicianCalendarItemSource = "shift" | "booking" | "custom";

export type TechnicianCalendarItem = {
  id: string;
  sourceId: string;
  sourceType: TechnicianCalendarItemSource;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  subtitle: string;
  amount?: number | null;
  orderId?: string;
  parentOrderId?: string;
  appointmentId?: string;
  eventType?: ScheduleEventType;
  isClickable?: boolean;
  detailTargetType?: ScheduleDetailTargetType;
  detailTargetId?: string;
  kind: "confirmed" | "booked" | "tentative" | TechnicianScheduleEventKind;
  preset?: TechnicianScheduleEventPreset;
  readOnly: boolean;
  withinConfirmedShift: boolean;
  transferStatus?: TechnicianScheduleTransferStatus;
  requestId?: string;
  linkedShiftId?: string;
  note?: string;
  syncTargets?: TechnicianScheduleSyncTarget[];
  badgeLabel?: string;
};

export type TechnicianScheduleSummary = {
  confirmedHours: number;
  bookedHours: number;
  freeHours: number;
  tentativeHours: number;
};

export type TechnicianScheduleBrief = {
  orderCount: number;
  hasConflict: boolean;
  estimatedRevenue: number | null;
};

export type TechnicianSchedulePeriod = {
  anchorDate: string;
  startDate: string;
  endDate: string;
  label: string;
  dates: string[];
};

export type MinuteRange = {
  start: number;
  end: number;
};

export function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

export function parseDateKey(date: string) {
  return new Date(`${date}T00:00:00`);
}

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

export function getTodayDateKey() {
  return formatDateKey(new Date());
}

export function addDays(date: string, amount: number) {
  const next = parseDateKey(date);
  next.setDate(next.getDate() + amount);
  return formatDateKey(next);
}

export function addMonths(date: string, amount: number) {
  const next = parseDateKey(date);
  next.setMonth(next.getMonth() + amount);
  return formatDateKey(next);
}

export function getStartOfWeek(date: string) {
  const current = parseDateKey(date);
  const offset = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - offset);
  return formatDateKey(current);
}

export function getEndOfWeek(date: string) {
  return addDays(getStartOfWeek(date), 6);
}

export function getStartOfMonth(date: string) {
  const current = parseDateKey(date);
  current.setDate(1);
  return formatDateKey(current);
}

export function getEndOfMonth(date: string) {
  const current = parseDateKey(date);
  current.setMonth(current.getMonth() + 1, 0);
  return formatDateKey(current);
}

export function getMonthGridStart(date: string) {
  return getStartOfWeek(getStartOfMonth(date));
}

export function getMonthGridDates(date: string) {
  const start = getMonthGridStart(date);
  return Array.from({ length: 35 }, (_, index) => addDays(start, index));
}

export function getWeekDates(date: string) {
  const start = getStartOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getPeriod(view: TechnicianScheduleView, anchorDate: string): TechnicianSchedulePeriod {
  if (view === "day") {
    return {
      anchorDate,
      startDate: anchorDate,
      endDate: anchorDate,
      label: formatLongDate(anchorDate),
      dates: [anchorDate]
    };
  }

  if (view === "week") {
    const startDate = getStartOfWeek(anchorDate);
    const endDate = getEndOfWeek(anchorDate);
    return {
      anchorDate,
      startDate,
      endDate,
      label: `${formatLongDate(startDate)} - ${formatLongDate(endDate)}`,
      dates: getWeekDates(anchorDate)
    };
  }

  const startDate = getStartOfMonth(anchorDate);
  const endDate = getEndOfMonth(anchorDate);
  const current = parseDateKey(anchorDate);
  return {
    anchorDate,
    startDate,
    endDate,
    label: `${current.getFullYear()}年${current.getMonth() + 1}月`,
    dates: Array.from(
      { length: Math.max(1, Math.round((parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) / 86400000) + 1) },
      (_, index) => addDays(startDate, index)
    )
  };
}

export function shiftAnchorDate(view: TechnicianScheduleView, anchorDate: string, direction: -1 | 1) {
  if (view === "day") {
    return addDays(anchorDate, direction);
  }

  if (view === "week") {
    return addDays(anchorDate, direction * 7);
  }

  return addMonths(anchorDate, direction);
}

export function resolveSelectedScheduleDate(view: TechnicianScheduleView, anchorDate: string, selectedDate: string) {
  const period = getPeriod(view, anchorDate);

  if (view === "day") {
    return anchorDate;
  }

  return period.dates.includes(selectedDate) ? selectedDate : period.dates[0] ?? anchorDate;
}

export function shiftScheduleSelection(
  view: TechnicianScheduleView,
  anchorDate: string,
  selectedDate: string,
  direction: -1 | 1
) {
  const nextAnchorDate = shiftAnchorDate(view, anchorDate, direction);

  return {
    anchorDate: nextAnchorDate,
    selectedDate: resolveSelectedScheduleDate(view, nextAnchorDate, selectedDate)
  };
}

export function timeToMinutes(time: string) {
  const [hour = "00", minute = "00"] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function minutesToTime(value: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, value));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${padNumber(hour)}:${padNumber(minute)}`;
}

export function rangeDurationHours(range: MinuteRange) {
  return Math.max(0, range.end - range.start) / 60;
}

export function intervalToRange(interval: ScheduleInterval): MinuteRange {
  return {
    start: timeToMinutes(interval.startTime),
    end: timeToMinutes(interval.endTime)
  };
}

export function overlapsRange(left: MinuteRange, right: MinuteRange) {
  return left.start < right.end && right.start < left.end;
}

export function containsRange(outer: MinuteRange, inner: MinuteRange) {
  return outer.start <= inner.start && outer.end >= inner.end;
}

export function intersectRange(left: MinuteRange, right: MinuteRange): MinuteRange | null {
  const start = Math.max(left.start, right.start);
  const end = Math.min(left.end, right.end);
  return end > start ? { start, end } : null;
}

export function mergeRanges(ranges: MinuteRange[]) {
  if (ranges.length === 0) {
    return [] as MinuteRange[];
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged: MinuteRange[] = [{ ...sorted[0] }];

  sorted.slice(1).forEach((range) => {
    const current = merged[merged.length - 1];
    if (range.start <= current.end) {
      current.end = Math.max(current.end, range.end);
      return;
    }

    merged.push({ ...range });
  });

  return merged;
}

export function subtractRanges(baseRanges: MinuteRange[], subtractingRanges: MinuteRange[]) {
  const normalizedBase = mergeRanges(baseRanges);
  const normalizedSubtracting = mergeRanges(subtractingRanges);

  return normalizedBase.flatMap((baseRange) => {
    let segments = [{ ...baseRange }];

    normalizedSubtracting.forEach((subtractingRange) => {
      segments = segments.flatMap((segment) => {
        const overlap = intersectRange(segment, subtractingRange);
        if (!overlap) {
          return [segment];
        }

        const nextSegments: MinuteRange[] = [];
        if (segment.start < overlap.start) {
          nextSegments.push({ start: segment.start, end: overlap.start });
        }
        if (segment.end > overlap.end) {
          nextSegments.push({ start: overlap.end, end: segment.end });
        }
        return nextSegments;
      });
    });

    return segments;
  });
}

export function totalHoursFromRanges(ranges: MinuteRange[]) {
  return mergeRanges(ranges).reduce((sum, range) => sum + rangeDurationHours(range), 0);
}

export function formatHours(hours: number) {
  return `${hours.toFixed(1)}`;
}

export function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "待接入";
  }

  return `¥${value.toLocaleString("ja-JP")}`;
}

export function formatLongDate(date: string) {
  const current = parseDateKey(date);
  return `${current.getFullYear()}年${current.getMonth() + 1}月${current.getDate()}日`;
}

export function formatShortDate(date: string) {
  const current = parseDateKey(date);
  return `${current.getMonth() + 1}/${current.getDate()}`;
}

export function getWeekdayLabel(date: string) {
  const weekdayIndex = (parseDateKey(date).getDay() + 6) % 7;
  return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][weekdayIndex];
}

export function getWeekdayHeaderLabel() {
  return ["一", "二", "三", "四", "五", "六", "日"];
}

export function getEventKindLabel(kind: TechnicianCalendarItem["kind"]) {
  switch (kind) {
    case "confirmed":
      return "已排班";
    case "booked":
      return "已定预约";
    case "tentative":
      return "待定";
    case "availability":
      return "可排班";
    case "leave":
      return "请假";
    case "locked":
      return "锁定";
    case "rest":
      return "休息";
    case "travel":
      return "移动";
    case "other":
      return "其他行程";
    default:
      return "行程";
  }
}

export function getScheduleEventPresetLabel(preset: TechnicianScheduleEventPreset) {
  switch (preset) {
    case "availability":
      return "可排班";
    case "leave":
      return "请假";
    case "locked":
      return "锁定";
    case "rest":
      return "休息";
    case "travel":
      return "移动";
    case "meeting":
      return "会议";
    case "meal":
      return "会食";
    case "date":
      return "约会";
    case "holiday":
      return "假期";
    default:
      return "行程";
  }
}

export function getScheduleEventKindForPreset(preset: TechnicianScheduleEventPreset): TechnicianScheduleEventKind {
  switch (preset) {
    case "availability":
      return "availability";
    case "leave":
    case "holiday":
      return "leave";
    case "locked":
      return "locked";
    case "rest":
      return "rest";
    case "travel":
      return "travel";
    case "meeting":
    case "meal":
    case "date":
      return "other";
    default:
      return "other";
  }
}

export function resolveScheduleEventPreset(
  kind: TechnicianScheduleEventKind,
  title?: string,
  preset?: TechnicianScheduleEventPreset
): TechnicianScheduleEventPreset {
  if (preset) {
    return preset;
  }

  const normalizedTitle = title?.trim();
  if (normalizedTitle === "会议") {
    return "meeting";
  }
  if (normalizedTitle === "会食") {
    return "meal";
  }
  if (normalizedTitle === "约会") {
    return "date";
  }
  if (normalizedTitle === "假期") {
    return "holiday";
  }

  switch (kind) {
    case "availability":
      return "availability";
    case "leave":
      return "leave";
    case "locked":
      return "locked";
    case "rest":
      return "rest";
    case "travel":
      return "travel";
    case "other":
      return "meeting";
    default:
      return "availability";
  }
}

export function getTransferStatusLabel(status?: TechnicianScheduleTransferStatus) {
  switch (status) {
    case "transfer_pending":
      return "转让中";
    case "transfer_completed":
      return "已转让";
    case "transfer_failed":
      return "转让失败";
    case "transfer_cancelled":
      return "已取消";
    default:
      return "";
  }
}

export function getInvitationStatusLabel(status: TechnicianScheduleTransferInvitationStatus) {
  switch (status) {
    case "pending":
      return "待处理";
    case "accepted":
      return "已接受";
    case "rejected":
      return "已拒绝";
    case "failed_conflict":
      return "时间冲突";
    case "failed_capacity":
      return "名额已满";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

export function isBlockingCustomEvent(kind: TechnicianScheduleEventKind) {
  return kind === "leave" || kind === "locked" || kind === "rest" || kind === "travel" || kind === "other";
}

export function sortByDateTime<T extends ScheduleInterval>(items: T[]) {
  return [...items].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    const startCompare = left.startTime.localeCompare(right.startTime);
    if (startCompare !== 0) {
      return startCompare;
    }
    return left.endTime.localeCompare(right.endTime);
  });
}

export function isDateInPeriod(date: string, period: TechnicianSchedulePeriod) {
  return date >= period.startDate && date <= period.endDate;
}
