import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent as ReactChangeEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AppIcon } from "../client-ui/AppScaffold";
import { MobileFullscreenCloseButton } from "../mobile/MobileFullscreenHeader";
import { ScheduleDraftRangeBlock } from "./ScheduleDraftRangeBlock";
import { orders } from "../../data/mock";
import { useDispatchCenterStore } from "../../features/dispatch-center/store";
import type { DispatchArrangement } from "../../features/dispatch-center/domain";
import { getDisplayName, type ContactRelation, type Conversation, type ImRoleType, type ImUser } from "../../features/im/model";
import { isContactVisibleForRole } from "../../features/im/role-config";
import { useImStore } from "../../features/im/store";
import { cn } from "../../lib/utils";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { useEntityStore } from "../../state/entityStore";
import { useScheduleStore } from "../../state/scheduleStore";
import { useTechnicianScheduleStore } from "../../state/technicianScheduleStore";
import { getClientThemeClassName, useClientTheme } from "../../theme/ClientThemeProvider";
import type { Customer, Order, Schedule, Store, Technician } from "../../types/domain";
import {
  addDays,
  addMonths,
  formatLongDate,
  formatShortDate,
  getMonthGridDates,
  getStartOfMonth,
  getTodayDateKey,
  getWeekDates,
  getWeekdayHeaderLabel,
  getWeekdayLabel,
  minutesToTime,
  parseDateKey,
  timeToMinutes
} from "../../features/technician-schedule/model";

type UnifiedCalendarView = "day" | "week" | "month" | "agenda";
type UnifiedCalendarScope = "user" | "technician" | "merchant";
type UnifiedCalendarDisplayMode = "personal" | "parallel";
type UnifiedCalendarSourceId = "user" | "technician" | "merchant" | "todo" | "birthday" | "holiday";

type CalendarAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

type SyncContactOption = {
  id: string;
  label: string;
  description: string;
  count?: number;
  kind?: SyncContactFilterMode;
};

type UnifiedCalendarLane = {
  id: string;
  label: string;
  caption?: string;
  accent: string;
};

type UnifiedCalendarEvent = {
  id: string;
  sourceId: UnifiedCalendarSourceId;
  calendarId?: string;
  calendarLabel?: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  subtitle: string;
  badge: string;
  readOnly: boolean;
  orderId?: string;
  location?: string;
  note?: string;
  images?: CalendarAttachment[];
  reminder?: string;
  syncContactLabels?: string[];
  visibility?: string;
  birthdayContactId?: string;
  birthdayTags?: string[];
  birthdayScope?: "self" | "contact";
};

type LocalCalendarEvent = {
  id: string;
  calendarId: string;
  calendarLabel: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string;
  note: string;
  images: CalendarAttachment[];
  reminder: string;
  syncContactIds: string[];
  visibility: string;
  createdAt: string;
  updatedAt: string;
};

type CalendarEditorDraft = Omit<LocalCalendarEvent, "createdAt" | "updatedAt">;

type SyncContactFilterMode = "common" | "tags" | "groups";

type BirthdaySourceFilters = {
  self: boolean;
  contacts: boolean;
  contactIds: string[];
  tags: string[];
};

type UnifiedUserCalendarProps = {
  currentCustomer?: Customer;
  currentTechnician?: Technician;
  currentStore?: Store;
  displayMode?: UnifiedCalendarDisplayMode;
  scope?: UnifiedCalendarScope;
};

type UnifiedCalendarPeriod = {
  startDate: string;
  endDate: string;
  label: string;
  dates: string[];
};

type CalendarContactTagOption = {
  tag: string;
  count: number;
};

type BirthdayContactOption = {
  id: string;
  label: string;
  description: string;
  tags: string[];
  birthday?: string;
};

type CalendarImTagListUiState = {
  customTags: string[];
  hiddenTags: string[];
};

const localCalendarStorageKey = "needo.user-unified-calendar.v1";
const dayStartHour = 0;
const dayEndHour = 24;
const hourRowHeight = 58;
const scheduleDraftMinDurationMinutes = 30;
const scheduleDraftSnapMinutes = 15;
const defaultSourceVisibility: Record<UnifiedCalendarSourceId, boolean> = {
  user: true,
  technician: true,
  merchant: true,
  todo: true,
  birthday: true,
  holiday: true
};
const defaultBirthdaySourceFilters: BirthdaySourceFilters = {
  self: true,
  contacts: false,
  contactIds: [],
  tags: []
};

const sourceConfigs: Record<UnifiedCalendarSourceId, { label: string; shortLabel: string; accent: string; soft: string; text: string; contrast: string }> = {
  user: {
    label: "我的行程",
    shortLabel: "我的",
    accent: "var(--client-primary)",
    soft: "color-mix(in srgb, var(--client-primary) 14%, var(--client-elevated) 86%)",
    text: "var(--client-accent-text)",
    contrast: "var(--pin-badge-glyph, var(--client-primary-contrast))"
  },
  technician: {
    label: "技师端行程",
    shortLabel: "技师",
    accent: "var(--client-warm)",
    soft: "color-mix(in srgb, var(--client-warm) 14%, var(--client-elevated) 86%)",
    text: "color-mix(in srgb, var(--client-warm) 76%, var(--client-text) 24%)",
    contrast: "var(--pin-badge-glyph, var(--client-primary-contrast))"
  },
  merchant: {
    label: "商户端行程",
    shortLabel: "商户",
    accent: "var(--client-accent)",
    soft: "color-mix(in srgb, var(--client-accent) 14%, var(--client-elevated) 86%)",
    text: "color-mix(in srgb, var(--client-accent) 76%, var(--client-text) 24%)",
    contrast: "var(--client-bg)"
  },
  todo: {
    label: "ToDo",
    shortLabel: "ToDo",
    accent: "color-mix(in srgb, var(--client-primary) 76%, var(--client-accent) 24%)",
    soft: "color-mix(in srgb, var(--client-primary) 10%, var(--client-elevated) 90%)",
    text: "color-mix(in srgb, var(--client-primary) 74%, var(--client-text) 26%)",
    contrast: "var(--pin-badge-glyph, var(--client-primary-contrast))"
  },
  birthday: {
    label: "生日",
    shortLabel: "生日",
    accent: "color-mix(in srgb, var(--client-accent) 62%, var(--client-primary) 38%)",
    soft: "color-mix(in srgb, var(--client-accent) 12%, var(--client-elevated) 88%)",
    text: "color-mix(in srgb, var(--client-accent) 70%, var(--client-text) 30%)",
    contrast: "var(--client-bg)"
  },
  holiday: {
    label: "祝日",
    shortLabel: "祝日",
    accent: "var(--client-warning)",
    soft: "color-mix(in srgb, var(--client-warning) 16%, var(--client-elevated) 84%)",
    text: "var(--client-warning-text)",
    contrast: "var(--client-warning-ink)"
  }
};

const parallelLaneAccents = [
  "var(--client-primary)",
  "var(--client-warm)",
  "var(--client-accent)",
  "var(--client-warning)",
  "color-mix(in srgb, var(--client-primary) 72%, var(--client-accent) 28%)",
  "color-mix(in srgb, var(--client-warm) 72%, var(--client-warning) 28%)"
];

const neeDoSourceIds: UnifiedCalendarSourceId[] = ["user", "technician", "merchant"];
const personalSourceIds: UnifiedCalendarSourceId[] = ["todo", "birthday", "holiday"];

const viewOptions: Array<{ value: UnifiedCalendarView; label: string }> = [
  { value: "day", label: "日" },
  { value: "week", label: "週" },
  { value: "month", label: "月" },
  { value: "agenda", label: "仅行程" }
];

const schedulePanelClass =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] shadow-[var(--client-shadow)]";
const scheduleInsetClass =
  "rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)]";
const inputClass =
  "focus-ring h-11 min-w-0 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-3.5 text-sm font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]";

function addMinutesToTime(time: string, minutes: number) {
  return minutesToTime(timeToMinutes(time) + minutes);
}

function normalizeDateTimeFromOrder(order: Order) {
  if (!order.bookedAt) {
    return null;
  }

  const [date, startTime] = order.bookedAt.split(" ");
  if (!date || !startTime) {
    return null;
  }

  const durationMatch = order.itemName.match(/(\d+)\s*分/);
  const duration = durationMatch ? Math.max(30, Math.min(240, Number(durationMatch[1]))) : order.mode === "home" ? 90 : 60;

  return {
    date,
    startTime,
    endTime: addMinutesToTime(startTime, duration)
  };
}

function getOrderSubtitle(order: Order) {
  const target = order.storeName ?? order.technicianName ?? order.area ?? order.city;
  return [target, order.mode === "home" ? "到府服務" : "到店服務"].filter(Boolean).join(" · ");
}

function getSyncContactLabels(contactIds: string[], options: SyncContactOption[]) {
  return contactIds.map((contactId) => options.find((option) => option.id === contactId)?.label).filter((label): label is string => Boolean(label));
}

function getTechnicianCalendarLaneId(technicianId: string) {
  return `technician:${technicianId}`;
}

function getLocalCalendarEvents(localEvents: LocalCalendarEvent[], syncContactOptions: SyncContactOption[]): UnifiedCalendarEvent[] {
  return localEvents.map((event): UnifiedCalendarEvent => ({
    id: event.id,
    sourceId: "user",
    calendarId: event.calendarId,
    calendarLabel: event.calendarLabel,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    title: event.title,
    subtitle: event.location || getSyncContactLabels(event.syncContactIds, syncContactOptions).join("、") || "个人行程",
    badge: "个人行程",
    readOnly: false,
    location: event.location,
    note: event.note,
    images: event.images,
    reminder: event.reminder,
    syncContactLabels: getSyncContactLabels(event.syncContactIds, syncContactOptions),
    visibility: getSyncContactLabels(event.syncContactIds, syncContactOptions).join("、") || "未同步"
  }));
}

function getOrderEvents(currentCustomer: Customer): UnifiedCalendarEvent[] {
  return orders
    .filter((order) => order.customerId === currentCustomer.id && order.status !== "cancelled" && order.status !== "refunded")
    .map((order): UnifiedCalendarEvent | null => {
      const schedule = normalizeDateTimeFromOrder(order);
      if (!schedule) {
        return null;
      }

      return {
        id: `user-order-${order.id}`,
        sourceId: "user",
        calendarId: "user:me",
        calendarLabel: "我的行程",
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        title: order.itemName,
        subtitle: getOrderSubtitle(order),
        badge: order.status === "inService" ? "服務中" : "我的行程",
        readOnly: true,
        orderId: order.id,
        location: order.area
      };
    })
    .filter((event): event is UnifiedCalendarEvent => Boolean(event));
}

function getRelevantTechnicianIds(arrangements: DispatchArrangement[], currentCustomer: Customer, technicians: Technician[]) {
  const relevantIds = new Set(
    arrangements
      .filter((arrangement) => arrangement.customerId === currentCustomer.id && arrangement.technicianId)
      .map((arrangement) => arrangement.technicianId as string)
  );

  orders
    .filter((order) => order.customerId === currentCustomer.id && order.technicianName)
    .forEach((order) => {
      const technician = technicians.find((item) => item.name === order.technicianName || item.nickname === order.technicianName);
      if (technician) {
        relevantIds.add(technician.id);
      }
    });

  return relevantIds;
}

function getTechnicianName(technicians: Technician[], technicianId: string) {
  const technician = technicians.find((item) => item.id === technicianId);
  return technician?.nickname?.trim() || technician?.name || "技師";
}

function getStoreName(stores: ReturnType<typeof useEntityStore>["stores"], storeId: string) {
  return stores.find((store) => store.id === storeId)?.name ?? "店鋪";
}

function getBookingBadge(eventType?: string) {
  if (eventType === "extension") {
    return "加鐘";
  }
  if (eventType === "reschedule") {
    return "改期";
  }
  return "服務";
}

function getTechnicianEvents(
  currentCustomer: Customer,
  relevantTechnicianIds: Set<string>,
  snapshot: ReturnType<typeof useTechnicianScheduleStore>,
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[]
): UnifiedCalendarEvent[] {
  const customerOrderIds = new Set(orders.filter((order) => order.customerId === currentCustomer.id).map((order) => order.id));
  const shiftEvents = snapshot.dutyShifts
    .filter((shift) => relevantTechnicianIds.has(shift.technicianId))
    .map((shift): UnifiedCalendarEvent => ({
      id: `technician-shift-${shift.id}`,
      sourceId: "technician",
      calendarId: getTechnicianCalendarLaneId(shift.technicianId),
      calendarLabel: getTechnicianName(technicians, shift.technicianId),
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      title: `${getTechnicianName(technicians, shift.technicianId)} 出勤`,
      subtitle: `${getStoreName(stores, shift.storeId)} · ${shift.shiftLabel}`,
      badge: "出勤",
      readOnly: true
    }));

  const bookingEvents = snapshot.bookings
    .filter((booking) => booking.customerName === currentCustomer.name || (booking.orderId && customerOrderIds.has(booking.orderId)))
    .map((booking): UnifiedCalendarEvent => ({
      id: `technician-booking-${booking.id}`,
      sourceId: "technician",
      calendarId: getTechnicianCalendarLaneId(booking.technicianId),
      calendarLabel: getTechnicianName(technicians, booking.technicianId),
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      title: booking.title,
      subtitle: `${getTechnicianName(technicians, booking.technicianId)} · ${getStoreName(stores, booking.storeId)}`,
      badge: getBookingBadge(booking.eventType),
      readOnly: true,
      orderId: booking.orderId
    }));

  return [...shiftEvents, ...bookingEvents];
}

function getTechnicianCustomEventBadge(kind: string) {
  if (kind === "availability") {
    return "出勤";
  }
  if (kind === "leave") {
    return "请假";
  }
  if (kind === "rest") {
    return "休息";
  }
  if (kind === "travel") {
    return "移动";
  }
  if (kind === "locked") {
    return "锁定";
  }
  return "行程";
}

function getTechnicianEventsForTechnician(
  technicianId: string,
  snapshot: ReturnType<typeof useTechnicianScheduleStore>,
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[]
): UnifiedCalendarEvent[] {
  const shiftEvents = snapshot.dutyShifts
    .filter((shift) => shift.technicianId === technicianId)
    .map((shift): UnifiedCalendarEvent => ({
      id: `technician-shift-${shift.id}`,
      sourceId: "technician",
      calendarId: getTechnicianCalendarLaneId(shift.technicianId),
      calendarLabel: getTechnicianName(technicians, shift.technicianId),
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      title: `${getTechnicianName(technicians, shift.technicianId)} 出勤`,
      subtitle: `${getStoreName(stores, shift.storeId)} · ${shift.shiftLabel}`,
      badge: "出勤",
      readOnly: true
    }));

  const bookingEvents = snapshot.bookings
    .filter((booking) => booking.technicianId === technicianId)
    .map((booking): UnifiedCalendarEvent => ({
      id: `technician-booking-${booking.id}`,
      sourceId: "technician",
      calendarId: getTechnicianCalendarLaneId(booking.technicianId),
      calendarLabel: getTechnicianName(technicians, booking.technicianId),
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      title: booking.title,
      subtitle: `${booking.customerName} · ${getStoreName(stores, booking.storeId)}`,
      badge: getBookingBadge(booking.eventType),
      readOnly: true,
      orderId: booking.orderId
    }));

  const customEvents = snapshot.customEvents
    .filter((event) => event.technicianId === technicianId)
    .map((event): UnifiedCalendarEvent => ({
      id: `technician-custom-${event.id}`,
      sourceId: "technician",
      calendarId: getTechnicianCalendarLaneId(event.technicianId),
      calendarLabel: getTechnicianName(technicians, event.technicianId),
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      title: event.title,
      subtitle: [getStoreName(stores, event.storeId), event.note].filter(Boolean).join(" · "),
      badge: getTechnicianCustomEventBadge(event.kind),
      readOnly: true,
      location: event.location,
      reminder: event.reminder,
      visibility: event.visibility
    }));

  return [...shiftEvents, ...bookingEvents, ...customEvents];
}

function getMerchantScheduleBadge(schedule: Schedule) {
  if (schedule.status === "booked") {
    return schedule.eventType === "extension" ? "加鐘" : "已預約";
  }
  if (schedule.status === "blocked") {
    return schedule.eventType === "break" ? "休息" : "鎖定";
  }
  return "可預約";
}

function getMerchantEvents(
  currentCustomer: Customer,
  relevantTechnicianIds: Set<string>,
  arrangements: DispatchArrangement[],
  technicianSnapshot: ReturnType<typeof useTechnicianScheduleStore>,
  scheduleSnapshot: ReturnType<typeof useScheduleStore>,
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[]
): UnifiedCalendarEvent[] {
  const customerOrderIds = new Set(orders.filter((order) => order.customerId === currentCustomer.id).map((order) => order.id));
  const arrangementEvents = arrangements
    .filter((arrangement) => arrangement.customerId === currentCustomer.id && arrangement.status !== "cancelled")
    .map((arrangement): UnifiedCalendarEvent => ({
      id: `merchant-arrangement-${arrangement.id}`,
      sourceId: "merchant",
      calendarId: arrangement.technicianId ? getTechnicianCalendarLaneId(arrangement.technicianId) : "merchant:unassigned",
      calendarLabel: arrangement.technicianLabel ?? "待定技师",
      date: arrangement.date,
      startTime: arrangement.startTime,
      endTime: arrangement.endTime,
      title: arrangement.serviceName,
      subtitle: `${arrangement.technicianLabel ?? "待定技師"} · ${arrangement.roomLabel}`,
      badge: arrangement.status === "inService" ? "服務中" : arrangement.status === "pending" ? "待確認" : "商戶安排",
      readOnly: true,
      orderId: arrangement.orderId,
      location: arrangement.address
    }));

  const scheduleEvents = scheduleSnapshot.schedules
    .filter((schedule) => relevantTechnicianIds.has(schedule.staffId) || (schedule.orderId && customerOrderIds.has(schedule.orderId)))
    .map((schedule): UnifiedCalendarEvent => {
      const technician = technicians.find((item) => item.id === schedule.staffId);
      return {
        id: `merchant-schedule-${schedule.id}`,
        sourceId: "merchant",
        calendarId: getTechnicianCalendarLaneId(schedule.staffId),
        calendarLabel: technician?.nickname?.trim() || technician?.name || "技师",
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        title: `${technician?.nickname?.trim() || technician?.name || "技師"} ${getMerchantScheduleBadge(schedule)}`,
        subtitle: technician ? getStoreName(stores, technician.storeId) : "商戶排班",
        badge: getMerchantScheduleBadge(schedule),
        readOnly: true,
        orderId: schedule.orderId
      };
    });

  const bookingBackfillEvents = technicianSnapshot.bookings
    .filter((booking) => booking.customerName === currentCustomer.name || (booking.orderId && customerOrderIds.has(booking.orderId)))
    .filter((booking) => !arrangementEvents.some((event) => event.orderId && event.orderId === booking.orderId && event.date === booking.date))
    .map((booking): UnifiedCalendarEvent => ({
      id: `merchant-booking-sync-${booking.id}`,
      sourceId: "merchant",
      calendarId: getTechnicianCalendarLaneId(booking.technicianId),
      calendarLabel: getTechnicianName(technicians, booking.technicianId),
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      title: booking.title,
      subtitle: `${getStoreName(stores, booking.storeId)} · ${getTechnicianName(technicians, booking.technicianId)}`,
      badge: booking.eventType === "extension" ? "商戶加鐘" : booking.eventType === "reschedule" ? "商戶改期" : "商戶確認",
      readOnly: true,
      orderId: booking.orderId
    }));

  return [...arrangementEvents, ...scheduleEvents, ...bookingBackfillEvents];
}

function getArrangementStatusBadge(status: DispatchArrangement["status"]) {
  if (status === "pending") {
    return "待确认";
  }
  if (status === "inService") {
    return "服务中";
  }
  if (status === "completed") {
    return "已完成";
  }
  return "商户安排";
}

function getMerchantEventsForTechnician(
  technicianId: string,
  arrangements: DispatchArrangement[],
  scheduleSnapshot: ReturnType<typeof useScheduleStore>,
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[]
): UnifiedCalendarEvent[] {
  const technician = technicians.find((item) => item.id === technicianId);
  const arrangementEvents = arrangements
    .filter((arrangement) => arrangement.technicianId === technicianId && arrangement.status !== "cancelled")
    .map((arrangement): UnifiedCalendarEvent => ({
      id: `merchant-arrangement-${arrangement.id}`,
      sourceId: "merchant",
      calendarId: getTechnicianCalendarLaneId(technicianId),
      calendarLabel: arrangement.technicianLabel ?? getTechnicianName(technicians, technicianId),
      date: arrangement.date,
      startTime: arrangement.startTime,
      endTime: arrangement.endTime,
      title: arrangement.serviceName,
      subtitle: `${arrangement.customerName} · ${arrangement.roomLabel}`,
      badge: getArrangementStatusBadge(arrangement.status),
      readOnly: true,
      orderId: arrangement.orderId,
      location: arrangement.address
    }));

  const scheduleEvents = scheduleSnapshot.schedules
    .filter((schedule) => schedule.staffId === technicianId)
    .map((schedule): UnifiedCalendarEvent => ({
      id: `merchant-schedule-${schedule.id}`,
      sourceId: "merchant",
      calendarId: getTechnicianCalendarLaneId(schedule.staffId),
      calendarLabel: getTechnicianName(technicians, schedule.staffId),
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      title: `${getTechnicianName(technicians, schedule.staffId)} ${getMerchantScheduleBadge(schedule)}`,
      subtitle: technician ? getStoreName(stores, technician.storeId) : "商户排班",
      badge: getMerchantScheduleBadge(schedule),
      readOnly: true,
      orderId: schedule.orderId
    }));

  return [...arrangementEvents, ...scheduleEvents];
}

function getStoreTechnicians(currentStore: Store | undefined, technicians: Technician[]) {
  if (!currentStore) {
    return [];
  }

  return technicians.filter((technician) => technician.storeId === currentStore.id || technician.relatedStoreIds?.includes(currentStore.id));
}

function getMerchantEventsForStore(
  currentStore: Store,
  arrangements: DispatchArrangement[],
  technicianSnapshot: ReturnType<typeof useTechnicianScheduleStore>,
  scheduleSnapshot: ReturnType<typeof useScheduleStore>,
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[]
) {
  const storeTechnicians = getStoreTechnicians(currentStore, technicians);
  const storeTechnicianIds = new Set(storeTechnicians.map((technician) => technician.id));
  const technicianEvents = storeTechnicians.flatMap((technician) => getTechnicianEventsForTechnician(technician.id, technicianSnapshot, stores, technicians));
  const arrangementEvents = arrangements
    .filter((arrangement) => arrangement.storeId === currentStore.id && arrangement.status !== "cancelled")
    .map((arrangement): UnifiedCalendarEvent => ({
      id: `merchant-arrangement-${arrangement.id}`,
      sourceId: "merchant",
      calendarId: arrangement.technicianId ? getTechnicianCalendarLaneId(arrangement.technicianId) : "merchant:unassigned",
      calendarLabel: arrangement.technicianLabel ?? "待定技师",
      date: arrangement.date,
      startTime: arrangement.startTime,
      endTime: arrangement.endTime,
      title: arrangement.serviceName,
      subtitle: `${arrangement.customerName} · ${arrangement.roomLabel}`,
      badge: getArrangementStatusBadge(arrangement.status),
      readOnly: true,
      orderId: arrangement.orderId,
      location: arrangement.address
    }));
  const scheduleEvents = scheduleSnapshot.schedules
    .filter((schedule) => storeTechnicianIds.has(schedule.staffId))
    .map((schedule): UnifiedCalendarEvent => ({
      id: `merchant-schedule-${schedule.id}`,
      sourceId: "merchant",
      calendarId: getTechnicianCalendarLaneId(schedule.staffId),
      calendarLabel: getTechnicianName(technicians, schedule.staffId),
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      title: `${getTechnicianName(technicians, schedule.staffId)} ${getMerchantScheduleBadge(schedule)}`,
      subtitle: `${currentStore.name} · 商户排班`,
      badge: getMerchantScheduleBadge(schedule),
      readOnly: true,
      orderId: schedule.orderId
    }));

  return [...technicianEvents, ...arrangementEvents, ...scheduleEvents];
}

function getParallelCalendarLanes(currentStore: Store | undefined, currentTechnician: Technician | undefined, technicians: Technician[]): UnifiedCalendarLane[] {
  if (currentStore) {
    const storeTechnicians = getStoreTechnicians(currentStore, technicians);
    return [
      ...storeTechnicians.map((technician, index): UnifiedCalendarLane => ({
        id: getTechnicianCalendarLaneId(technician.id),
        label: technician.nickname?.trim() || technician.name,
        caption: technician.status === "busy" ? "服务中" : technician.status === "off" ? "休息" : "可排班",
        accent: parallelLaneAccents[index % parallelLaneAccents.length] ?? "var(--client-primary)"
      })),
      { id: "merchant:unassigned", label: "待定", caption: "未指派", accent: "color-mix(in srgb, var(--client-muted) 82%, var(--client-elevated) 18%)" }
    ];
  }

  if (currentTechnician) {
    return [
      {
        id: getTechnicianCalendarLaneId(currentTechnician.id),
        label: currentTechnician.nickname?.trim() || currentTechnician.name,
        caption: "我的排班",
        accent: "var(--client-primary)"
      }
    ];
  }

  return [];
}

function getCalendarImTagListUiStorageKey(scope: ImRoleType) {
  return `needo.im.tags.ui.v1.${scope}`;
}

function readCalendarImTagListUiState(scope: ImRoleType): CalendarImTagListUiState {
  if (typeof window === "undefined") {
    return { customTags: [], hiddenTags: [] };
  }

  try {
    const raw = window.localStorage.getItem(getCalendarImTagListUiStorageKey(scope));
    const parsed = raw ? JSON.parse(raw) as Partial<CalendarImTagListUiState> : {};

    return {
      customTags: Array.isArray(parsed.customTags) ? parsed.customTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : [],
      hiddenTags: Array.isArray(parsed.hiddenTags) ? parsed.hiddenTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : []
    };
  } catch {
    return { customTags: [], hiddenTags: [] };
  }
}

function getVisibleCalendarContacts(
  contacts: ContactRelation[],
  usersById: Record<string, ImUser>,
  scope: ImRoleType
) {
  return contacts.filter((contact) => contact.relationStatus === "active" && !contact.isBlocked && isContactVisibleForRole(scope, usersById[contact.targetUserId], contact));
}

function getCalendarContactTags(contact: ContactRelation, user?: ImUser) {
  return Array.from(new Set([...contact.tags, ...(user?.tags ?? [])].map((tag) => tag.trim()).filter(Boolean)));
}

function buildCalendarContactTagOptions(
  contacts: ContactRelation[],
  usersById: Record<string, ImUser>,
  conversations: Conversation[],
  scope: ImRoleType
): CalendarContactTagOption[] {
  const state = readCalendarImTagListUiState(scope);
  const hiddenSet = new Set(state.hiddenTags);
  const counts = new Map<string, number>();

  contacts.forEach((contact) => {
    getCalendarContactTags(contact, usersById[contact.targetUserId]).forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  conversations.forEach((conversation) => {
    (conversation.tags ?? []).forEach((tag) => {
      const normalized = tag.trim();
      if (normalized && !counts.has(normalized)) {
        counts.set(normalized, 0);
      }
    });
  });

  state.customTags.forEach((tag) => {
    const normalized = tag.trim();
    if (normalized && !counts.has(normalized)) {
      counts.set(normalized, 0);
    }
  });

  return Array.from(counts.entries())
    .filter(([tag]) => !hiddenSet.has(tag))
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "zh-Hans-CN"));
}

function getContactConversationForUser(conversations: Conversation[], targetUserId: string) {
  return conversations.find((conversation) => conversation.type === "single" && conversation.contactUserId === targetUserId);
}

function getCommonSyncContactOptions(
  contacts: ContactRelation[],
  usersById: Record<string, ImUser>,
  conversations: Conversation[]
) {
  return contacts
    .flatMap((contact): Array<{ contact: ContactRelation; conversation?: Conversation; option: SyncContactOption }> => {
      const user = usersById[contact.targetUserId];
      if (!user) {
        return [];
      }
      const conversation = getContactConversationForUser(conversations, contact.targetUserId);
      return [
        {
          contact,
          conversation,
          option: {
            id: `im:${contact.targetUserId}`,
            label: getDisplayName(user, contact),
            description: [contact.isStarred ? "常用" : "最近联系", getCalendarContactTags(contact, user).slice(0, 2).join(" / ")].filter(Boolean).join(" · "),
            kind: "common" as const
          }
        }
      ];
    })
    .sort((left, right) => {
      const rightTime = right.conversation?.lastMessageTime ? new Date(right.conversation.lastMessageTime).getTime() : 0;
      const leftTime = left.conversation?.lastMessageTime ? new Date(left.conversation.lastMessageTime).getTime() : 0;
      return Number(right.contact.isStarred) - Number(left.contact.isStarred) || rightTime - leftTime || left.option.label.localeCompare(right.option.label, "zh-Hans-CN");
    })
    .map((item) => item.option);
}

function getTagSyncContactOptions(tags: CalendarContactTagOption[]): SyncContactOption[] {
  return tags.map(({ tag, count }) => ({
    id: `tag:${tag}`,
    label: tag,
    description: `通讯录标签 · ${count} 人`,
    count,
    kind: "tags"
  }));
}

function getGroupSyncContactOptions(conversations: Conversation[]): SyncContactOption[] {
  return conversations
    .filter((conversation) => conversation.type === "group" && !conversation.isDeleted)
    .sort((left, right) => new Date(right.lastMessageTime).getTime() - new Date(left.lastMessageTime).getTime())
    .map((conversation) => ({
      id: `group:${conversation.id}`,
      label: conversation.title || "未命名群组",
      description: `群组 · ${conversation.memberIds.length} 人`,
      count: conversation.memberIds.length,
      kind: "groups" as const
    }));
}

function getCompleteSyncContactOptions(baseOptions: SyncContactOption[], commonOptions: SyncContactOption[], tagOptions: SyncContactOption[], groupOptions: SyncContactOption[]) {
  return dedupeSyncContactOptions([...commonOptions, ...baseOptions.map((option) => ({ ...option, kind: option.kind ?? "common" as const })), ...tagOptions, ...groupOptions]);
}

function getSyncContactOptionKind(option: SyncContactOption): SyncContactFilterMode {
  if (option.kind) {
    return option.kind;
  }
  if (option.id.startsWith("tag:")) {
    return "tags";
  }
  if (option.id.startsWith("group:")) {
    return "groups";
  }
  return "common";
}

function getRuntimeDateField(value: unknown) {
  if (typeof value !== "object" || !value) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const rawValue = record.birthday ?? record.birthDate ?? record.dateOfBirth;
  return typeof rawValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? rawValue : undefined;
}

function getBirthdayContactOptions(contacts: ContactRelation[], usersById: Record<string, ImUser>): BirthdayContactOption[] {
  return contacts
    .flatMap((contact): BirthdayContactOption[] => {
      const user = usersById[contact.targetUserId];
      if (!user) {
        return [];
      }
      const tags = getCalendarContactTags(contact, user);
      const birthday = getRuntimeDateField(contact) ?? getRuntimeDateField(user);
      return [
        {
          id: contact.id,
          label: getDisplayName(user, contact),
          description: [birthday ? `生日 ${birthday.slice(5).replace("-", "/")}` : "生日未填写", tags.slice(0, 2).join(" / ")].filter(Boolean).join(" · "),
          tags,
          birthday
        }
      ];
    })
    .sort((left, right) => Number(Boolean(right.birthday)) - Number(Boolean(left.birthday)) || left.label.localeCompare(right.label, "zh-Hans-CN"));
}

function dedupeSyncContactOptions(options: SyncContactOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.id)) {
      return false;
    }
    seen.add(option.id);
    return true;
  });
}

function getUserSyncContactOptions(
  currentCustomer: Customer | undefined,
  arrangements: DispatchArrangement[],
  relevantTechnicianIds: Set<string>,
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[]
) {
  if (!currentCustomer) {
    return [];
  }

  const customerOrders = orders.filter((order) => order.customerId === currentCustomer.id);
  const storeIds = new Set(
    arrangements
      .filter((arrangement) => arrangement.customerId === currentCustomer.id)
      .map((arrangement) => arrangement.storeId)
  );

  customerOrders.forEach((order) => {
    const store = stores.find((item) => item.name === order.storeName);
    if (store) {
      storeIds.add(store.id);
    }
  });

  return dedupeSyncContactOptions([
    ...Array.from(relevantTechnicianIds).map((technicianId): SyncContactOption => ({
      id: `technician:${technicianId}`,
      label: getTechnicianName(technicians, technicianId),
      description: "技师端"
    })),
    ...Array.from(storeIds).map((storeId): SyncContactOption => ({
      id: `merchant:${storeId}`,
      label: getStoreName(stores, storeId),
      description: "商户端"
    }))
  ]);
}

function getTechnicianSyncContactOptions(
  currentTechnician: Technician | undefined,
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[]
) {
  if (!currentTechnician) {
    return [];
  }

  const storeIds = new Set([currentTechnician.storeId, ...(currentTechnician.relatedStoreIds ?? [])].filter(Boolean));
  const colleagueOptions = technicians
    .filter((technician) => technician.id !== currentTechnician.id && storeIds.has(technician.storeId))
    .slice(0, 4)
    .map((technician): SyncContactOption => ({
      id: `technician:${technician.id}`,
      label: technician.nickname?.trim() || technician.name,
      description: "技师端"
    }));

  return dedupeSyncContactOptions([
    ...Array.from(storeIds).map((storeId): SyncContactOption => ({
      id: `merchant:${storeId}`,
      label: getStoreName(stores, storeId),
      description: "商户端"
    })),
    ...colleagueOptions
  ]);
}

function getMerchantSyncContactOptions(currentStore: Store | undefined, technicians: Technician[]) {
  if (!currentStore) {
    return [];
  }

  return getStoreTechnicians(currentStore, technicians).map((technician): SyncContactOption => ({
    id: getTechnicianCalendarLaneId(technician.id),
    label: technician.nickname?.trim() || technician.name,
    description: "技师端"
  }));
}

const japaneseHolidaySeeds: Array<{ date: string; title: string }> = [
  { date: "2026-01-01", title: "元日" },
  { date: "2026-01-12", title: "成人の日" },
  { date: "2026-02-11", title: "建国記念の日" },
  { date: "2026-02-23", title: "天皇誕生日" },
  { date: "2026-03-20", title: "春分の日" },
  { date: "2026-04-29", title: "昭和の日" },
  { date: "2026-05-03", title: "憲法記念日" },
  { date: "2026-05-04", title: "みどりの日" },
  { date: "2026-05-05", title: "こどもの日" },
  { date: "2026-05-06", title: "休日" },
  { date: "2026-07-20", title: "海の日" },
  { date: "2026-08-11", title: "山の日" },
  { date: "2026-09-21", title: "敬老の日" },
  { date: "2026-09-22", title: "休日" },
  { date: "2026-09-23", title: "秋分の日" },
  { date: "2026-10-12", title: "スポーツの日" },
  { date: "2026-11-03", title: "文化の日" },
  { date: "2026-11-23", title: "勤労感謝の日" },
  { date: "2027-01-01", title: "元日" },
  { date: "2027-01-11", title: "成人の日" },
  { date: "2027-02-11", title: "建国記念の日" },
  { date: "2027-02-23", title: "天皇誕生日" },
  { date: "2027-03-21", title: "春分の日" },
  { date: "2027-03-22", title: "休日" },
  { date: "2027-04-29", title: "昭和の日" },
  { date: "2027-05-03", title: "憲法記念日" },
  { date: "2027-05-04", title: "みどりの日" },
  { date: "2027-05-05", title: "こどもの日" },
  { date: "2027-07-19", title: "海の日" },
  { date: "2027-08-11", title: "山の日" },
  { date: "2027-09-20", title: "敬老の日" },
  { date: "2027-09-23", title: "秋分の日" },
  { date: "2027-10-11", title: "スポーツの日" },
  { date: "2027-11-03", title: "文化の日" },
  { date: "2027-11-23", title: "勤労感謝の日" }
];

function getReferenceCalendarEvents(): UnifiedCalendarEvent[] {
  return japaneseHolidaySeeds.map((holiday) => ({
    id: `holiday-${holiday.date}`,
    sourceId: "holiday",
    date: holiday.date,
    startTime: "00:00",
    endTime: "23:59",
    title: holiday.title,
    subtitle: "日本祝日",
    badge: "祝日",
    readOnly: true
  }));
}

function buildBirthdayEventDate(anchorYear: number, birthday: string) {
  return `${anchorYear}-${birthday.slice(5)}`;
}

function getBirthdayCalendarEvents(
  period: UnifiedCalendarPeriod,
  currentCustomer: Customer | undefined,
  currentTechnician: Technician | undefined,
  currentStore: Store | undefined,
  birthdayContacts: BirthdayContactOption[]
): UnifiedCalendarEvent[] {
  const years = Array.from(new Set(period.dates.map((date) => Number(date.slice(0, 4)))));
  const events: UnifiedCalendarEvent[] = [];
  const selfBirthday = getRuntimeDateField(currentCustomer) ?? getRuntimeDateField(currentTechnician) ?? getRuntimeDateField(currentStore);
  const selfLabel = currentCustomer?.nickname ?? currentCustomer?.name ?? currentTechnician?.nickname ?? currentTechnician?.name ?? currentStore?.name ?? "自己";

  if (selfBirthday) {
    years.forEach((year) => {
      events.push({
        id: `birthday-self-${year}`,
        sourceId: "birthday",
        calendarId: "birthday:self",
        calendarLabel: "自己",
        date: buildBirthdayEventDate(year, selfBirthday),
        startTime: "00:00",
        endTime: "23:59",
        title: `${selfLabel} 生日`,
        subtitle: "自动同步设定里面的生日",
        badge: "生日",
        readOnly: true,
        birthdayScope: "self"
      });
    });
  }

  birthdayContacts
    .filter((contact) => contact.birthday)
    .forEach((contact) => {
      years.forEach((year) => {
        events.push({
          id: `birthday-contact-${contact.id}-${year}`,
          sourceId: "birthday",
          calendarId: `birthday:contact:${contact.id}`,
          calendarLabel: contact.label,
          date: buildBirthdayEventDate(year, contact.birthday as string),
          startTime: "00:00",
          endTime: "23:59",
          title: `${contact.label} 生日`,
          subtitle: contact.tags.length > 0 ? contact.tags.slice(0, 3).join(" / ") : "通讯录生日",
          badge: "生日",
          readOnly: true,
          birthdayContactId: contact.id,
          birthdayTags: contact.tags,
          birthdayScope: "contact"
        });
      });
    });

  return events.filter((event) => isDateInRange(event.date, period.startDate, period.endDate));
}

function sortEvents(left: UnifiedCalendarEvent, right: UnifiedCalendarEvent) {
  return `${left.date} ${left.startTime} ${left.id}`.localeCompare(`${right.date} ${right.startTime} ${right.id}`);
}

function isDateInRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function getAgendaDates(anchorDate: string) {
  const startDate = addDays(getStartOfMonth(anchorDate), -28);
  return Array.from({ length: 98 }, (_, index) => addDays(startDate, index));
}

function getCalendarPeriod(view: UnifiedCalendarView, anchorDate: string): UnifiedCalendarPeriod {
  if (view === "day") {
    return {
      startDate: anchorDate,
      endDate: anchorDate,
      label: formatLongDate(anchorDate),
      dates: [anchorDate]
    };
  }

  if (view === "week") {
    const dates = getWeekDates(anchorDate);
    return {
      startDate: dates[0] ?? anchorDate,
      endDate: dates[dates.length - 1] ?? anchorDate,
      label: `${formatShortDate(dates[0] ?? anchorDate)} - ${formatShortDate(dates[dates.length - 1] ?? anchorDate)}`,
      dates
    };
  }

  if (view === "agenda") {
    const dates = getAgendaDates(anchorDate);
    return {
      startDate: dates[0] ?? anchorDate,
      endDate: dates[dates.length - 1] ?? anchorDate,
      label: "近期行程",
      dates
    };
  }

  const monthStart = getStartOfMonth(anchorDate);
  const month = parseDateKey(anchorDate);
  return {
    startDate: monthStart,
    endDate: addMonths(monthStart, 1),
    label: `${month.getFullYear()}年${month.getMonth() + 1}月`,
    dates: getMonthGridDates(anchorDate)
  };
}

function shiftCalendarAnchor(view: UnifiedCalendarView, anchorDate: string, direction: -1 | 1) {
  if (view === "day") {
    return addDays(anchorDate, direction);
  }
  if (view === "week") {
    return addDays(anchorDate, direction * 7);
  }
  if (view === "agenda") {
    return addDays(anchorDate, direction * 14);
  }
  return addMonths(anchorDate, direction);
}

function groupEventsByDate(events: UnifiedCalendarEvent[]) {
  return events.reduce<Record<string, UnifiedCalendarEvent[]>>((grouped, event) => {
    grouped[event.date] = [...(grouped[event.date] ?? []), event];
    return grouped;
  }, {});
}

function getEventStyle(event: UnifiedCalendarEvent): CSSProperties {
  const source = sourceConfigs[event.sourceId];
  return {
    "--calendar-accent": source.accent,
    "--calendar-soft": source.soft,
    "--calendar-text": source.text,
    "--calendar-contrast": source.contrast
  } as CSSProperties;
}

function normalizeLocalCalendarEvent(event: Partial<LocalCalendarEvent> & { visibility?: string }): LocalCalendarEvent | null {
  if (!event?.id || !event.date || !event.startTime || !event.endTime) {
    return null;
  }

  const legacySyncContactIds = event.visibility && event.visibility !== "私人" && event.visibility !== "未同步" ? [event.visibility] : [];
  const images = Array.isArray(event.images)
    ? event.images.filter((image): image is CalendarAttachment => Boolean(image?.id && image?.name && image?.dataUrl))
    : [];

  return {
    id: event.id,
    calendarId: event.calendarId ?? "user:me",
    calendarLabel: event.calendarLabel ?? "我的行程",
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    title: event.title ?? "",
    location: event.location ?? "",
    note: event.note ?? "",
    images,
    reminder: event.reminder ?? "30 分钟前",
    syncContactIds: Array.isArray(event.syncContactIds) ? event.syncContactIds.filter((contactId): contactId is string => typeof contactId === "string") : legacySyncContactIds,
    visibility: event.visibility ?? "未同步",
    createdAt: event.createdAt ?? new Date().toISOString(),
    updatedAt: event.updatedAt ?? new Date().toISOString()
  };
}

function loadLocalCalendarEvents() {
  return parseBrowserStorageJson<Array<Partial<LocalCalendarEvent> & { visibility?: string }>>(localCalendarStorageKey, [], { removeOnError: true, silent: true })
    .map(normalizeLocalCalendarEvent)
    .filter((event): event is LocalCalendarEvent => Boolean(event));
}

function SourceToggle({
  sourceId,
  active,
  count,
  onToggle
}: {
  sourceId: UnifiedCalendarSourceId;
  active: boolean;
  count: number;
  onToggle: () => void;
}) {
  const source = sourceConfigs[sourceId];
  return (
    <button
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex min-h-10 w-full min-w-0 items-center gap-2 rounded-[16px] border px-2.5 py-2 text-left transition",
        active
          ? "border-[color:color-mix(in_srgb,var(--calendar-accent)_42%,transparent)] bg-[color:var(--calendar-soft)] text-[color:var(--calendar-text)]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)] text-[color:var(--client-muted)] opacity-62"
      )}
      onClick={onToggle}
      style={getEventStyle({ sourceId } as UnifiedCalendarEvent)}
      type="button"
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border text-[11px] font-black",
          active ? "border-[color:var(--calendar-accent)] bg-[color:var(--calendar-accent)] text-[color:var(--calendar-contrast)]" : "border-[color:color-mix(in_srgb,var(--client-line)_88%,transparent)]"
        )}
      >
        {active ? "✓" : ""}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-black leading-none">{source.label}</span>
        <span className="mt-1 block text-[10px] font-black opacity-70">{count} 件</span>
      </span>
    </button>
  );
}

function BirthdaySourceToggle({
  active,
  contactOptions,
  contactQuery,
  count,
  expanded,
  filters,
  onExpandToggle,
  onContactQueryChange,
  onContactToggle,
  onTagToggle,
  onToggle,
  onToggleFilter,
  tagOptions
}: {
  active: boolean;
  contactOptions: BirthdayContactOption[];
  contactQuery: string;
  count: number;
  expanded: boolean;
  filters: BirthdaySourceFilters;
  onExpandToggle: () => void;
  onContactQueryChange: (query: string) => void;
  onContactToggle: (contactId: string) => void;
  onTagToggle: (tag: string) => void;
  onToggle: () => void;
  onToggleFilter: (key: "self" | "contacts") => void;
  tagOptions: CalendarContactTagOption[];
}) {
  const source = sourceConfigs.birthday;
  const normalizedContactQuery = contactQuery.trim().toLowerCase();
  const filteredContactOptions = contactOptions.filter((contact) => {
    if (!normalizedContactQuery) {
      return true;
    }
    return [contact.label, contact.description, ...contact.tags].some((field) => field.toLowerCase().includes(normalizedContactQuery));
  });

  return (
    <div className="space-y-2" style={getEventStyle({ sourceId: "birthday" } as UnifiedCalendarEvent)}>
      <div
        className={cn(
          "flex min-h-10 w-full min-w-0 items-center gap-2 rounded-[16px] border px-2.5 py-2 text-left transition",
          active
            ? "border-[color:color-mix(in_srgb,var(--calendar-accent)_42%,transparent)] bg-[color:var(--calendar-soft)] text-[color:var(--calendar-text)]"
            : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)] text-[color:var(--client-muted)] opacity-62"
        )}
      >
        <button className="focus-ring flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onToggle} type="button">
          <span
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border text-[11px] font-black",
              active ? "border-[color:var(--calendar-accent)] bg-[color:var(--calendar-accent)] text-[color:var(--calendar-contrast)]" : "border-[color:color-mix(in_srgb,var(--client-line)_88%,transparent)]"
            )}
          >
            {active ? "✓" : ""}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-black leading-none">{source.label}</span>
            <span className="mt-1 block text-[10px] font-black opacity-70">{count} 件</span>
          </span>
        </button>
        <button
          aria-expanded={expanded}
          aria-label="展开生日来源"
          className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--calendar-accent)_30%,transparent)] text-[15px] font-black transition"
          onClick={onExpandToggle}
          type="button"
        >
          <span className={cn("transition", expanded ? "rotate-180" : "")}>⌄</span>
        </button>
      </div>

      {expanded ? (
        <div className="space-y-2 rounded-[16px] border border-[color:color-mix(in_srgb,var(--calendar-accent)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--calendar-soft)_55%,transparent)] px-3 py-3">
          {[
            { key: "self" as const, label: "自己", detail: "自动同步设定里面的生日" },
            { key: "contacts" as const, label: "他人", detail: "从通讯录中选择某些人的生日" }
          ].map((item) => (
            <button className="focus-ring flex w-full items-center gap-2 rounded-[12px] px-1 py-1.5 text-left" key={item.key} onClick={() => onToggleFilter(item.key)} type="button">
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border text-[11px] font-black",
                  filters[item.key] ? "border-[color:var(--calendar-accent)] bg-[color:var(--calendar-accent)] text-[color:var(--calendar-contrast)]" : "border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)]"
                )}
              >
                {filters[item.key] ? "✓" : ""}
              </span>
              <span className="min-w-0">
                <strong className="block text-[12px] font-black text-[color:var(--client-text)]">{item.label}</strong>
                <span className="mt-0.5 block truncate text-[10px] font-bold text-[color:var(--client-muted)]">{item.detail}</span>
              </span>
            </button>
          ))}
          {filters.contacts ? (
            <div className="space-y-2 rounded-[14px] border border-[color:color-mix(in_srgb,var(--calendar-accent)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_68%,transparent)] px-2 py-2">
              <input
                className="focus-ring h-9 w-full rounded-[12px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_48%,transparent)] px-3 text-[12px] font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
                onChange={(event) => onContactQueryChange(event.target.value)}
                placeholder="搜索通讯录"
                value={contactQuery}
              />
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filteredContactOptions.length > 0 ? (
                  filteredContactOptions.map((contact) => {
                    const selected = filters.contactIds.includes(contact.id);
                    return (
                      <button
                        aria-pressed={selected}
                        className="focus-ring flex w-full items-center gap-2 rounded-[12px] px-1.5 py-2 text-left transition hover:bg-[color:color-mix(in_srgb,var(--calendar-accent)_10%,transparent)]"
                        key={contact.id}
                        onClick={() => onContactToggle(contact.id)}
                        type="button"
                      >
                        <span
                          className={cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border text-[11px] font-black",
                            selected ? "border-[color:var(--calendar-accent)] bg-[color:var(--calendar-accent)] text-[color:var(--calendar-contrast)]" : "border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)]"
                          )}
                        >
                          {selected ? "✓" : ""}
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-[12px] font-black text-[color:var(--client-text)]">{contact.label}</strong>
                          <span className="mt-0.5 block truncate text-[10px] font-bold text-[color:var(--client-muted)]">{contact.description}</span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-1.5 py-2 text-[11px] font-bold text-[color:var(--client-muted)]">没有找到匹配的通讯录联系人。</p>
                )}
              </div>
            </div>
          ) : null}
          <div className="space-y-2 px-1 pt-1">
            <div>
              <strong className="block text-[12px] font-black text-[color:var(--client-text)]">通讯录标签</strong>
              <span className="mt-0.5 block text-[10px] font-bold text-[color:var(--client-muted)]">展示哪些标签的人的生日</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tagOptions.length > 0 ? tagOptions.map(({ tag, count: tagCount }) => {
                const selected = filters.tags.includes(tag);
                return (
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "focus-ring rounded-full border px-2.5 py-1 text-[10px] font-black transition",
                      selected
                        ? "border-[color:var(--calendar-accent)] bg-[color:var(--calendar-accent)] text-[color:var(--calendar-contrast)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] text-[color:var(--client-muted)]"
                    )}
                    key={tag}
                    onClick={() => onTagToggle(tag)}
                    type="button"
                  >
                    {tag}<span className="ml-1 opacity-65">{tagCount}</span>
                  </button>
                );
              }) : (
                <span className="text-[11px] font-bold text-[color:var(--client-muted)]">当前通讯录没有可用标签。</span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarSourceDrawer({
  birthdayContactOptions,
  birthdayContactQuery,
  birthdayExpanded,
  birthdayFilters,
  birthdayTagOptions,
  open,
  sourceCounts,
  sourceVisibility,
  onBirthdayExpandToggle,
  onBirthdayContactQueryChange,
  onBirthdayContactToggle,
  onBirthdayFilterToggle,
  onBirthdayTagToggle,
  onClose,
  onToggle
}: {
  birthdayContactOptions: BirthdayContactOption[];
  birthdayContactQuery: string;
  birthdayExpanded: boolean;
  birthdayFilters: BirthdaySourceFilters;
  birthdayTagOptions: CalendarContactTagOption[];
  open: boolean;
  sourceCounts: Record<UnifiedCalendarSourceId, number>;
  sourceVisibility: Record<UnifiedCalendarSourceId, boolean>;
  onBirthdayExpandToggle: () => void;
  onBirthdayContactQueryChange: (query: string) => void;
  onBirthdayContactToggle: (contactId: string) => void;
  onBirthdayFilterToggle: (key: "self" | "contacts") => void;
  onBirthdayTagToggle: (tag: string) => void;
  onClose: () => void;
  onToggle: (sourceId: UnifiedCalendarSourceId) => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside className="absolute left-3 top-[58px] z-[150] w-[min(340px,calc(100vw-56px))] overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_96%,transparent)] shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl" role="menu">
        <div className="flex items-center justify-between border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3.5 py-3">
          <div>
            <strong className="block text-sm font-black text-[color:var(--client-text)]">日历来源</strong>
            <span className="mt-1 block text-[10px] font-black text-[color:var(--client-muted)]">选择显示在当前视图里的行程</span>
          </div>
          <button aria-label="关闭日历来源" className="focus-ring grid h-8 w-8 place-items-center rounded-full text-[color:var(--client-muted)]" onClick={onClose} type="button">
            <AppIcon name="close" />
          </button>
        </div>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-3.5 py-3">
          <section className="space-y-2">
            <h3 className="px-1 text-[11px] font-black text-[color:var(--client-muted)]">NeeDo 同步</h3>
            {neeDoSourceIds.map((sourceId) => (
              <SourceToggle
                active={sourceVisibility[sourceId]}
                count={sourceCounts[sourceId]}
                key={sourceId}
                onToggle={() => onToggle(sourceId)}
                sourceId={sourceId}
              />
            ))}
          </section>

          <section className="space-y-2">
            <h3 className="px-1 text-[11px] font-black text-[color:var(--client-muted)]">个人日历</h3>
            {personalSourceIds.map((sourceId) => (
              sourceId === "birthday" ? (
                <BirthdaySourceToggle
                  active={sourceVisibility.birthday}
                  contactOptions={birthdayContactOptions}
                  contactQuery={birthdayContactQuery}
                  count={sourceCounts.birthday}
                  expanded={birthdayExpanded}
                  filters={birthdayFilters}
                  key={sourceId}
                  onContactQueryChange={onBirthdayContactQueryChange}
                  onContactToggle={onBirthdayContactToggle}
                  onExpandToggle={onBirthdayExpandToggle}
                  onTagToggle={onBirthdayTagToggle}
                  onToggle={() => onToggle("birthday")}
                  onToggleFilter={onBirthdayFilterToggle}
                  tagOptions={birthdayTagOptions}
                />
              ) : (
                <SourceToggle
                  active={sourceVisibility[sourceId]}
                  count={sourceCounts[sourceId]}
                  key={sourceId}
                  onToggle={() => onToggle(sourceId)}
                  sourceId={sourceId}
                />
              )
            ))}
          </section>
        </div>
    </aside>
  );
}

function CalendarEventCard({
  event,
  compact = false,
  onOpen
}: {
  event: UnifiedCalendarEvent;
  compact?: boolean;
  onOpen: (event: UnifiedCalendarEvent) => void;
}) {
  const source = sourceConfigs[event.sourceId];
  const badgeLabel = compact ? source.shortLabel : event.badge;
  return (
    <button
      className={cn(
        "focus-ring w-full overflow-hidden rounded-[16px] border px-3 py-2.5 text-left shadow-[0_12px_24px_color-mix(in_srgb,var(--calendar-accent)_12%,transparent)] transition active:scale-[0.99]",
        "border-[color:color-mix(in_srgb,var(--calendar-accent)_38%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--calendar-soft)_88%,var(--client-elevated)),color-mix(in_srgb,var(--client-elevated)_88%,transparent))]"
      )}
      onClick={() => onOpen(event)}
      style={getEventStyle(event)}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--calendar-accent)]" />
        <span className="truncate text-[11px] font-black text-[color:var(--calendar-text)]">{badgeLabel}</span>
        {!compact ? <span className="truncate text-[10px] font-black text-[color:var(--client-muted)]">{source.shortLabel}</span> : null}
      </div>
      <strong className={cn("mt-1 block truncate font-black text-[color:var(--client-text)]", compact ? "text-[12px]" : "text-sm")}>{event.title}</strong>
      {!compact ? (
        <p className="mt-1 truncate text-[11px] font-bold text-[color:var(--client-muted)]">
          {event.startTime} - {event.endTime} · {event.subtitle}
        </p>
      ) : null}
    </button>
  );
}

function getLayoutEvents(events: UnifiedCalendarEvent[]) {
  const lanes: Array<{ end: number }> = [];
  const sorted = [...events].sort(sortEvents);
  const laidOut = sorted.map((event) => {
    const start = timeToMinutes(event.startTime);
    const end = timeToMinutes(event.endTime);
    const lane = lanes.findIndex((item) => item.end <= start);

    if (lane === -1) {
      lanes.push({ end });
      return { event, start, end, lane: lanes.length - 1 };
    }

    lanes[lane] = { end };
    return { event, start, end, lane };
  });

  return {
    laneCount: Math.max(1, Math.min(3, lanes.length)),
    events: laidOut
  };
}

type DraftRange = {
  start: number;
  end: number;
};

type DraftDragMode = "move" | "resize-start" | "resize-end";

function clampDraftMinute(value: number, min = 0, max = 24 * 60 - 1) {
  const snapped = Math.round(value / scheduleDraftSnapMinutes) * scheduleDraftSnapMinutes;
  return Math.max(min, Math.min(max, snapped));
}

function normalizeDraftRange(start: number, end: number): DraftRange {
  const clampedStart = clampDraftMinute(start, 0, 24 * 60 - scheduleDraftMinDurationMinutes);
  const clampedEnd = clampDraftMinute(Math.max(end, clampedStart + scheduleDraftMinDurationMinutes), clampedStart + scheduleDraftMinDurationMinutes, 24 * 60 - 1);

  return {
    start: clampedStart,
    end: clampedEnd
  };
}

function getDraftPointerMinute(event: { clientY: number }, canvas: HTMLElement) {
  const rect = canvas.getBoundingClientRect();
  const relativeY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  return clampDraftMinute(dayStartHour * 60 + (relativeY / hourRowHeight) * 60);
}

function DayTimeline({
  calendarLanes,
  date,
  events,
  onCreate,
  onOpen
}: {
  calendarLanes?: UnifiedCalendarLane[];
  date: string;
  events: UnifiedCalendarEvent[];
  onCreate: (date: string, startTime: string, endTime: string, calendarId?: string, calendarLabel?: string) => void;
  onOpen: (event: UnifiedCalendarEvent) => void;
}) {
  const now = new Date();
  const today = getTodayDateKey();
  const activeCalendarLanes = calendarLanes?.length ? calendarLanes : null;
  const hasParallelCalendars = Boolean(activeCalendarLanes?.length);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [draftRange, setDraftRange] = useState<DraftRange | null>(null);
  const [draftCalendarId, setDraftCalendarId] = useState(activeCalendarLanes?.[0]?.id ?? "user:me");
  const dragModeRef = useRef<DraftDragMode | null>(null);
  const dragBaseRangeRef = useRef<DraftRange | null>(null);
  const dragPointerStartRef = useRef<number | null>(null);
  const pointerDownMinuteRef = useRef<number | null>(null);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = date === today && nowMinutes >= dayStartHour * 60 && nowMinutes <= dayEndHour * 60;
  const layout = getLayoutEvents(events);
  const parallelLayouts = activeCalendarLanes
    ? activeCalendarLanes.flatMap((calendar, calendarIndex) => {
        const calendarLayout = getLayoutEvents(events.filter((event) => (event.calendarId ?? "user:me") === calendar.id));
        return calendarLayout.events.map((item) => ({
          ...item,
          calendar,
          calendarIndex,
          calendarLaneCount: calendarLayout.laneCount
        }));
      })
    : [];
  const totalHeight = (dayEndHour - dayStartHour) * hourRowHeight;
  const parallelMinWidth = activeCalendarLanes ? Math.max(320, activeCalendarLanes.length * 136) : 0;

  const getPointerCalendarId = (event: { clientX: number }, canvas: HTMLElement) => {
    if (!activeCalendarLanes?.length) {
      return "user:me";
    }

    const rect = canvas.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(rect.width - 1, event.clientX - rect.left));
    const calendarIndex = Math.min(activeCalendarLanes.length - 1, Math.max(0, Math.floor(relativeX / (rect.width / activeCalendarLanes.length))));
    return activeCalendarLanes[calendarIndex]?.id ?? activeCalendarLanes[0].id;
  };

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && target.closest("button,input,select,textarea,[data-schedule-range-handle],[data-schedule-create-action],[data-schedule-draft-range-block]");

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.button !== 0 && event.pointerType === "mouse") || isInteractiveTarget(event.target)) {
      pointerDownMinuteRef.current = null;
      return;
    }

    pointerDownMinuteRef.current = getDraftPointerMinute(event, event.currentTarget);
    setDraftCalendarId(getPointerCalendarId(event, event.currentTarget));
  };

  const handleCanvasClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest("button,input,select,textarea,[data-schedule-range-handle],[data-schedule-create-action],[data-schedule-draft-range-block]")) {
      pointerDownMinuteRef.current = null;
      return;
    }

    const startMinute = clampDraftMinute(pointerDownMinuteRef.current ?? getDraftPointerMinute(event, event.currentTarget), 0, 24 * 60 - 60);
    const range = normalizeDraftRange(startMinute, startMinute + 60);
    setDraftCalendarId(getPointerCalendarId(event, event.currentTarget));
    pointerDownMinuteRef.current = null;
    dragBaseRangeRef.current = range;
    setDraftRange(range);
  };

  const updateDraftRangeFromPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    const mode = dragModeRef.current;
    const baseRange = dragBaseRangeRef.current;

    if (!canvas || !mode || !baseRange) {
      return;
    }

    const pointerMinute = getDraftPointerMinute(event, canvas);

    if (mode === "resize-start") {
      setDraftRange({
        start: clampDraftMinute(pointerMinute, 0, baseRange.end - scheduleDraftMinDurationMinutes),
        end: baseRange.end
      });
      return;
    }

    if (mode === "resize-end") {
      setDraftRange({
        start: baseRange.start,
        end: clampDraftMinute(pointerMinute, baseRange.start + scheduleDraftMinDurationMinutes, 24 * 60 - 1)
      });
      return;
    }

    const duration = baseRange.end - baseRange.start;
    const pointerStart = dragPointerStartRef.current ?? pointerMinute;
    const nextStart = clampDraftMinute(baseRange.start + pointerMinute - pointerStart, 0, 24 * 60 - 1 - duration);
    if (activeCalendarLanes?.length) {
      setDraftCalendarId(getPointerCalendarId(event, canvas));
    }
    setDraftRange({
      start: nextStart,
      end: nextStart + duration
    });
  };

  const handleDraftPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragModeRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateDraftRangeFromPointer(event);
  };

  const handleDraftPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragModeRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragModeRef.current = null;
    dragPointerStartRef.current = null;
    dragBaseRangeRef.current = draftRange;
  };

  const handleDraftPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragModeRef.current = null;
    dragPointerStartRef.current = null;
    dragBaseRangeRef.current = draftRange;
  };

  const handleDraftBlockPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draftRange || (event.button !== 0 && event.pointerType === "mouse")) {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("button,[data-schedule-range-handle],[data-schedule-create-action]")) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragModeRef.current = "move";
    dragBaseRangeRef.current = draftRange;
    dragPointerStartRef.current = getDraftPointerMinute(event, canvas);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDraftResizePointerDown = (mode: Exclude<DraftDragMode, "move">, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draftRange || (event.button !== 0 && event.pointerType === "mouse")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragModeRef.current = mode;
    dragBaseRangeRef.current = draftRange;
    dragPointerStartRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const confirmDraftRange = () => {
    if (!draftRange) {
      return;
    }

    const draftLane = activeCalendarLanes?.find((calendar) => calendar.id === draftCalendarId);
    onCreate(date, minutesToTime(draftRange.start), minutesToTime(draftRange.end), draftLane?.id, draftLane?.label);
    setDraftRange(null);
  };

  const draftCalendarIndex = Math.max(0, activeCalendarLanes?.findIndex((calendar) => calendar.id === draftCalendarId) ?? 0);
  const parallelColumnWidth = activeCalendarLanes?.length ? 100 / activeCalendarLanes.length : 100;

  return (
    <div className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)]">
      <div className={cn(hasParallelCalendars && "overflow-x-auto overscroll-x-contain")}>
        <div style={hasParallelCalendars ? { minWidth: parallelMinWidth + 54 } : undefined}>
          {hasParallelCalendars && activeCalendarLanes ? (
            <div className="grid grid-cols-[54px,1fr] border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)]">
              <div className="border-r border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)]" />
              <div className="grid" style={{ gridTemplateColumns: `repeat(${activeCalendarLanes.length}, minmax(136px, 1fr))` }}>
                {activeCalendarLanes.map((calendar) => (
                  <div className="min-w-0 border-r border-[color:color-mix(in_srgb,var(--client-line)_46%,transparent)] px-2.5 py-2 last:border-r-0" key={calendar.id}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: calendar.accent }} />
                      <strong className="truncate text-[12px] font-black text-[color:var(--client-text)]">{calendar.label}</strong>
                    </div>
                    {calendar.caption ? <span className="mt-0.5 block truncate text-[10px] font-black text-[color:var(--client-muted)]">{calendar.caption}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-[54px,1fr]">
            <div className="border-r border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)]">
              {Array.from({ length: dayEndHour - dayStartHour }, (_, index) => {
                const hour = dayStartHour + index;
                return (
                  <div
                    className="flex items-start justify-center border-b border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] pt-2 text-[10px] font-black text-[color:var(--client-muted)] last:border-b-0"
                    key={hour}
                    style={{ height: hourRowHeight }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </div>
                );
              })}
            </div>
            <div className="relative touch-pan-y" onClick={handleCanvasClick} onPointerDown={handleCanvasPointerDown} ref={canvasRef} style={{ height: totalHeight }}>
              {Array.from({ length: dayEndHour - dayStartHour }, (_, index) => (
                <div
                  className="absolute inset-x-0 border-b border-[color:color-mix(in_srgb,var(--client-line)_46%,transparent)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary-soft)_38%,transparent)]"
                  key={index}
                  style={{ top: index * hourRowHeight, height: hourRowHeight }}
                />
              ))}

              {hasParallelCalendars && activeCalendarLanes
                ? activeCalendarLanes.map((calendar, index) => (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 border-l border-[color:color-mix(in_srgb,var(--client-line)_38%,transparent)]"
                      key={`line-${calendar.id}`}
                      style={{ left: `calc(${index * parallelColumnWidth}%)` }}
                    />
                  ))
                : null}

              {showNow ? (
                <div className="pointer-events-none absolute left-0 right-1 z-[4]" style={{ top: ((nowMinutes - dayStartHour * 60) / 60) * hourRowHeight }}>
                  <span className="absolute -left-1 top-[-4px] h-2 w-2 rounded-full bg-[color:var(--client-primary)]" />
                  <span className="block h-[2px] bg-[color:var(--client-primary)]" />
                </div>
              ) : null}

              {hasParallelCalendars
                ? parallelLayouts.map(({ event, start, end, lane, calendarIndex, calendarLaneCount }) => {
                    const width =
                      calendarLaneCount > 1
                        ? `calc((${parallelColumnWidth}% - 16px) / ${calendarLaneCount})`
                        : `calc(${parallelColumnWidth}% - 16px)`;
                    const left =
                      calendarLaneCount > 1
                        ? `calc(${calendarIndex * parallelColumnWidth}% + 8px + ${Math.min(lane, calendarLaneCount - 1)} * ((${parallelColumnWidth}% - 16px) / ${calendarLaneCount}))`
                        : `calc(${calendarIndex * parallelColumnWidth}% + 8px)`;
                    const clampedStart = Math.max(start, dayStartHour * 60);
                    const clampedEnd = Math.min(end, dayEndHour * 60);
                    return (
                      <div
                        className="absolute"
                        key={event.id}
                        style={{
                          left,
                          width,
                          top: ((clampedStart - dayStartHour * 60) / 60) * hourRowHeight + 6,
                          height: Math.max(((clampedEnd - clampedStart) / 60) * hourRowHeight - 12, 54)
                        }}
                      >
                        <CalendarEventCard compact event={event} onOpen={onOpen} />
                      </div>
                    );
                  })
                : layout.events.map(({ event, start, end, lane }) => {
                    const laneCount = layout.laneCount;
                    const width = laneCount > 1 ? `calc((100% - 18px) / ${laneCount})` : "calc(100% - 16px)";
                    const left = laneCount > 1 ? `calc(8px + ${Math.min(lane, laneCount - 1)} * ((100% - 18px) / ${laneCount}))` : "8px";
                    const clampedStart = Math.max(start, dayStartHour * 60);
                    const clampedEnd = Math.min(end, dayEndHour * 60);
                    return (
                      <div
                        className="absolute"
                        key={event.id}
                        style={{
                          left,
                          width,
                          top: ((clampedStart - dayStartHour * 60) / 60) * hourRowHeight + 6,
                          height: Math.max(((clampedEnd - clampedStart) / 60) * hourRowHeight - 12, 54)
                        }}
                      >
                        <CalendarEventCard compact event={event} onOpen={onOpen} />
                      </div>
                    );
                  })}

              {draftRange ? (
                <ScheduleDraftRangeBlock
                  action={(
                    <button
                      className="rounded-full bg-[color:var(--client-primary)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary-contrast)] shadow-[0_10px_20px_color-mix(in_srgb,var(--client-primary)_26%,transparent)]"
                      data-schedule-create-action="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        confirmDraftRange();
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      type="button"
                    >
                      下一步
                    </button>
                  )}
                  className={hasParallelCalendars ? "" : "left-2 right-2"}
                  onBlockPointerCancel={handleDraftPointerCancel}
                  onBlockPointerDown={handleDraftBlockPointerDown}
                  onBlockPointerMove={handleDraftPointerMove}
                  onBlockPointerUp={handleDraftPointerUp}
                  onEndHandlePointerDown={(event) => handleDraftResizePointerDown("resize-end", event)}
                  onHandlePointerCancel={handleDraftPointerCancel}
                  onHandlePointerMove={handleDraftPointerMove}
                  onHandlePointerUp={handleDraftPointerUp}
                  onStartHandlePointerDown={(event) => handleDraftResizePointerDown("resize-start", event)}
                  style={{
                    top: ((draftRange.start - dayStartHour * 60) / 60) * hourRowHeight + 6,
                    height: Math.max(((draftRange.end - draftRange.start) / 60) * hourRowHeight - 12, 58),
                    ...(hasParallelCalendars
                      ? {
                          left: `calc(${draftCalendarIndex * parallelColumnWidth}% + 8px)`,
                          width: `calc(${parallelColumnWidth}% - 16px)`
                        }
                      : {})
                  }}
                  subtitle="拖動整塊調整開始時間，拖動上下手柄調整時長"
                  timeRange={`${minutesToTime(draftRange.start)} - ${minutesToTime(draftRange.end)}`}
                  title="新建行程"
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyCalendarState({ onCreate, date }: { onCreate: () => void; date: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-4 py-5 text-center">
      <strong className="block text-sm font-black text-[color:var(--client-text)]">{formatLongDate(date)} 暫無行程</strong>
      <button
        className="focus-ring mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-contrast)]"
        onClick={onCreate}
        type="button"
      >
        <AppIcon className="h-4 w-4" name="plus" />
        新增
      </button>
    </div>
  );
}

function BottomSheet({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/38 px-3 pb-3" role="dialog" aria-modal="true">
      <div className="w-full max-w-[480px] overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_96%,var(--client-bg)_4%)] shadow-[var(--client-shadow)] backdrop-blur-xl">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-4 py-3">
          <span aria-hidden="true" className="h-11 w-11" />
          <strong className="min-w-0 truncate text-center text-sm font-black text-[color:var(--client-text)]">{title}</strong>
          <MobileFullscreenCloseButton label={`关闭${title}`} onClose={onClose} />
        </div>
        <div className="max-h-[72vh] overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

function EventDetailSheet({
  event,
  onClose,
  onEdit,
  onDelete
}: {
  event: UnifiedCalendarEvent;
  onClose: () => void;
  onEdit: (event: UnifiedCalendarEvent) => void;
  onDelete: (event: UnifiedCalendarEvent) => void;
}) {
  const source = sourceConfigs[event.sourceId];
  return (
    <BottomSheet onClose={onClose} title="行程詳情">
      <div className="space-y-3">
        <div className={cn(scheduleInsetClass, "px-4 py-3")} style={getEventStyle(event)}>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[color:var(--calendar-accent)]" />
            <span className="text-xs font-black text-[color:var(--calendar-text)]">{source.label}</span>
            <span className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-2 py-0.5 text-[10px] font-black text-[color:var(--client-muted)]">
              {event.badge}
            </span>
          </div>
          <h3 className="mt-3 text-xl font-black leading-7 text-[color:var(--client-text)]">{event.title || "（無標題）"}</h3>
          <p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">
            {formatLongDate(event.date)} · {event.startTime} - {event.endTime}
          </p>
        </div>

        {[
          ["位置", event.location],
          ["备注", event.note],
          ["提醒", event.reminder],
          ["同步联系人", event.syncContactLabels?.join("、") || event.visibility],
          ["同步資訊", event.subtitle]
        ]
          .filter(([, value]) => Boolean(value))
          .map(([label, value]) => (
            <div className={cn(scheduleInsetClass, "px-4 py-3")} key={label}>
              <span className="text-[11px] font-black text-[color:var(--client-muted)]">{label}</span>
              <p className="mt-1 text-sm font-black text-[color:var(--client-text)]">{value}</p>
            </div>
          ))}

        {event.images && event.images.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {event.images.map((image) => (
              <img alt={image.name} className="aspect-square rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] object-cover" key={image.id} src={image.dataUrl} />
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          {!event.readOnly ? (
            <>
              <button
                className="focus-ring h-11 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:var(--client-primary-soft)] text-sm font-black text-[color:var(--client-primary-strong)]"
                onClick={() => onEdit(event)}
                type="button"
              >
                編輯
              </button>
              <button
                className="focus-ring h-11 rounded-full border border-[color:color-mix(in_srgb,var(--client-accent)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-accent)_12%,var(--client-elevated))] text-sm font-black text-[color:color-mix(in_srgb,var(--client-accent)_82%,var(--client-text)_18%)]"
                onClick={() => onDelete(event)}
                type="button"
              >
                刪除
              </button>
            </>
          ) : (
            <button
              className="focus-ring col-span-2 h-11 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] text-sm font-black text-[color:var(--client-muted)]"
              onClick={onClose}
              type="button"
            >
              只讀同步
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function EditorSheet({
  draft,
  onChange,
  onClose,
  onSave,
  syncContactOptions
}: {
  draft: CalendarEditorDraft;
  onChange: (draft: CalendarEditorDraft) => void;
  onClose: () => void;
  onSave: () => void;
  syncContactOptions: SyncContactOption[];
}) {
  const [syncContactFilterMode, setSyncContactFilterMode] = useState<SyncContactFilterMode>("common");
  const syncFilterOptions: Array<{ value: SyncContactFilterMode; label: string; detail: string; emptyCaption: string }> = [
    { value: "common", label: "常用", detail: "最近联系多的通讯录中的人", emptyCaption: "当前没有常用联系人，保存后仅自己可见。" },
    { value: "tags", label: "标签", detail: "调用通讯录标签，把当前行程同步给某类标签的人", emptyCaption: "当前通讯录没有可同步标签。" },
    { value: "groups", label: "群组", detail: "从群组列表中选择同步群组", emptyCaption: "当前没有可同步群组。" }
  ];
  const visibleSyncContactOptions = syncContactOptions.filter((option) => getSyncContactOptionKind(option) === syncContactFilterMode);
  const activeSyncFilter = syncFilterOptions.find((option) => option.value === syncContactFilterMode) ?? syncFilterOptions[0];

  const toggleSyncContact = (contactId: string) => {
    const nextContactIds = draft.syncContactIds.includes(contactId)
      ? draft.syncContactIds.filter((item) => item !== contactId)
      : [...draft.syncContactIds, contactId];
    onChange({ ...draft, syncContactIds: nextContactIds });
  };

  const handleImageUpload = (event: ReactChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 6 - draft.images.length);
    if (files.length === 0) {
      return;
    }

    Promise.all(
      files.map(
        (file) =>
          new Promise<CalendarAttachment | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve(
                typeof reader.result === "string"
                  ? {
                      id: `image-${Date.now()}-${file.name}`,
                      name: file.name,
                      dataUrl: reader.result
                    }
                  : null
              );
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          })
      )
    ).then((images) => {
      const nextImages = images.filter((image): image is CalendarAttachment => Boolean(image));
      if (nextImages.length > 0) {
        onChange({ ...draft, images: [...draft.images, ...nextImages].slice(0, 6) });
      }
    });
    event.currentTarget.value = "";
  };

  return (
    <BottomSheet onClose={onClose} title={draft.id ? "編輯行程" : "新增行程"}>
      <div className="space-y-3">
        <input
          className={cn(inputClass, "h-12 text-base")}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="新增標題"
          value={draft.title}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            日期
            <input className={cn(inputClass, "mt-1")} onChange={(event) => onChange({ ...draft, date: event.target.value })} type="date" value={draft.date} />
          </label>
          <label className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            提醒
            <select className={cn(inputClass, "mt-1")} onChange={(event) => onChange({ ...draft, reminder: event.target.value })} value={draft.reminder}>
              <option value="10 分鐘前">10 分鐘前</option>
              <option value="30 分鐘前">30 分鐘前</option>
              <option value="1 小時前">1 小時前</option>
              <option value="不提醒">不提醒</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            開始
            <input className={cn(inputClass, "mt-1")} onChange={(event) => onChange({ ...draft, startTime: event.target.value })} type="time" value={draft.startTime} />
          </label>
          <label className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            結束
            <input className={cn(inputClass, "mt-1")} onChange={(event) => onChange({ ...draft, endTime: event.target.value })} type="time" value={draft.endTime} />
          </label>
        </div>
        <input
          className={inputClass}
          onChange={(event) => onChange({ ...draft, location: event.target.value })}
          placeholder="地點"
          value={draft.location}
        />
        <textarea
          className={cn(inputClass, "h-24 resize-none py-3 leading-5")}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
          placeholder="备注"
          value={draft.note}
        />
        <section className={cn(scheduleInsetClass, "space-y-2 px-3 py-3")}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-black text-[color:var(--client-text)]">上传图片</span>
            <label className="focus-ring inline-flex h-8 cursor-pointer items-center justify-center rounded-full bg-[color:var(--client-primary-soft)] px-3 text-[11px] font-black text-[color:var(--client-primary-strong)]">
              选择图片
              <input accept="image/*" className="sr-only" multiple onChange={handleImageUpload} type="file" />
            </label>
          </div>
          {draft.images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {draft.images.map((image) => (
                <div className="group relative" key={image.id}>
                  <img alt={image.name} className="aspect-square rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] object-cover" src={image.dataUrl} />
                  <button
                    aria-label="删除图片"
                    className="focus-ring absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/58 text-white opacity-90"
                    onClick={() => onChange({ ...draft, images: draft.images.filter((item) => item.id !== image.id) })}
                    type="button"
                  >
                    <AppIcon className="h-3.5 w-3.5" name="close" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        <section className={cn(scheduleInsetClass, "space-y-2 px-3 py-3")}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-black text-[color:var(--client-text)]">选择同步联系人</span>
            <span className="text-[10px] font-black text-[color:var(--client-muted)]">{draft.syncContactIds.length} 个</span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_40%,transparent)] p-1">
            {syncFilterOptions.map((option) => {
              const active = syncContactFilterMode === option.value;
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "focus-ring min-h-9 rounded-full px-2 text-[12px] font-black transition",
                    active
                      ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                      : "text-[color:var(--client-muted)]"
                  )}
                  key={option.value}
                  onClick={() => setSyncContactFilterMode(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] font-bold leading-4 text-[color:var(--client-muted)]">{activeSyncFilter.detail}</p>
          {visibleSyncContactOptions.length > 0 ? (
            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleSyncContactOptions.map((option) => {
                const active = draft.syncContactIds.includes(option.id);
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "focus-ring flex min-h-11 items-center gap-2 rounded-[15px] border px-3 text-left transition",
                      active
                        ? "border-[color:color-mix(in_srgb,var(--client-primary)_48%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] text-[color:var(--client-text)]"
                    )}
                    key={option.id}
                    onClick={() => toggleSyncContact(option.id)}
                    type="button"
                  >
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border text-[11px] font-black",
                        active ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)]"
                      )}
                    >
                      {active ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[12px] font-black">{option.label}</strong>
                      <span className="block truncate text-[10px] font-black opacity-65">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] font-bold leading-5 text-[color:var(--client-muted)]">{activeSyncFilter.emptyCaption}</p>
          )}
        </section>
        <button
          className="focus-ring flex h-12 w-full items-center justify-center rounded-full bg-[color:var(--client-primary)] text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_16px_36px_color-mix(in_srgb,var(--client-primary)_22%,transparent)]"
          onClick={onSave}
          type="button"
        >
          完成
        </button>
      </div>
    </BottomSheet>
  );
}

function EventList({
  events,
  onOpen
}: {
  events: UnifiedCalendarEvent[];
  onOpen: (event: UnifiedCalendarEvent) => void;
}) {
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <CalendarEventCard event={event} key={event.id} onOpen={onOpen} />
      ))}
    </div>
  );
}

function getAgendaWeekRangeLabel(date: string) {
  const week = getWeekDates(date);
  return `${formatShortDate(week[0] ?? date)} - ${formatShortDate(week[week.length - 1] ?? date)}`;
}

function AgendaMonthBanner({ date }: { date: string }) {
  const current = parseDateKey(date);
  return (
    <div className="relative -mx-3 h-28 overflow-hidden bg-[url('/images/timeline-nearby-bg.png')] bg-cover bg-center">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.28),rgba(0,0,0,0.02))]" />
      <strong className="absolute left-5 top-5 text-3xl font-black text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.32)]">{current.getMonth() + 1}月</strong>
    </div>
  );
}

function AgendaEventRow({ event, onOpen }: { event: UnifiedCalendarEvent; onOpen: (event: UnifiedCalendarEvent) => void }) {
  const isAllDay = event.startTime === "00:00" && event.endTime === "23:59";
  return (
    <button
      className={cn(
        "focus-ring w-full rounded-[10px] border px-3 py-2.5 text-left transition active:scale-[0.99]",
        isAllDay
          ? "border-[color:color-mix(in_srgb,var(--calendar-accent)_46%,transparent)] bg-[color:var(--calendar-soft)] text-[color:var(--calendar-text)]"
          : "border-[color:color-mix(in_srgb,var(--calendar-accent)_34%,transparent)] bg-[color:var(--calendar-soft)]"
      )}
      onClick={() => onOpen(event)}
      style={getEventStyle(event)}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2">
        {!isAllDay ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--calendar-accent)]" /> : null}
        <strong className={cn("truncate text-sm font-black", isAllDay ? "text-[color:var(--calendar-text)]" : "text-[color:var(--client-text)]")}>{event.title}</strong>
      </div>
      {!isAllDay ? (
        <p className="mt-1 truncate text-[11px] font-bold text-[color:var(--client-muted)]">
          {event.startTime} - {event.endTime} · {sourceConfigs[event.sourceId].label}
        </p>
      ) : null}
    </button>
  );
}

function AgendaView({
  dates,
  events,
  onCreate,
  onOpen
}: {
  dates: string[];
  events: UnifiedCalendarEvent[];
  onCreate: (date: string) => void;
  onOpen: (event: UnifiedCalendarEvent) => void;
}) {
  const groupedEvents = groupEventsByDate(events);
  const rows: ReactNode[] = [];
  let lastMonth = "";
  let renderedEventCount = 0;

  dates.forEach((date, index) => {
    const monthKey = date.slice(0, 7);
    const currentDate = parseDateKey(date);
    const dateEvents = (groupedEvents[date] ?? []).sort(sortEvents);

    if (monthKey !== lastMonth) {
      rows.push(<AgendaMonthBanner date={date} key={`month-${monthKey}`} />);
      lastMonth = monthKey;
    }

    if (currentDate.getDay() === 1 || index === 0) {
      rows.push(
        <div className="px-[64px] py-3 text-[13px] font-black text-[color:var(--client-muted)]" key={`week-${date}`}>
          {getAgendaWeekRangeLabel(date)}
        </div>
      );
    }

    if (dateEvents.length === 0) {
      return;
    }

    renderedEventCount += dateEvents.length;
    rows.push(
      <section className="grid grid-cols-[50px,1fr] gap-3 px-3 py-2" key={`events-${date}`}>
        <div className="pt-1 text-center">
          <span className="block text-[12px] font-black text-[color:var(--client-muted)]">{getWeekdayLabel(date).replace("周", "")}</span>
          <strong className="mt-1 block text-[26px] font-black leading-none text-[color:var(--client-text)]">{currentDate.getDate()}</strong>
        </div>
        <div className="space-y-2">
          {dateEvents.map((event) => (
            <AgendaEventRow event={event} key={event.id} onOpen={onOpen} />
          ))}
        </div>
      </section>
    );
  });

  return (
    <div className="mt-3 max-h-[68vh] overflow-y-auto overscroll-contain rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] touch-pan-y">
      {renderedEventCount > 0 ? rows : (
        <div className="px-3 py-3">
          <EmptyCalendarState date={getTodayDateKey()} onCreate={() => onCreate(getTodayDateKey())} />
        </div>
      )}
    </div>
  );
}

export function UnifiedUserCalendar({ currentCustomer, currentTechnician, currentStore, displayMode, scope = "user" }: UnifiedUserCalendarProps) {
  const { theme, isNight } = useClientTheme();
  const { stores, technicians } = useEntityStore();
  const scheduleSnapshot = useScheduleStore();
  const technicianSnapshot = useTechnicianScheduleStore();
  const dispatchSnapshot = useDispatchCenterStore();
  const activeScope: UnifiedCalendarScope = scope === "merchant" && currentStore ? "merchant" : scope === "technician" && currentTechnician ? "technician" : "user";
  const imScope: ImRoleType = activeScope;
  const imStore = useImStore(imScope);
  const resolvedDisplayMode: UnifiedCalendarDisplayMode = displayMode ?? (activeScope === "merchant" ? "parallel" : "personal");
  const [view, setView] = useState<UnifiedCalendarView>("day");
  const [anchorDate, setAnchorDate] = useState(getTodayDateKey());
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
  const [sourceVisibility, setSourceVisibility] = useState(defaultSourceVisibility);
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [birthdayExpanded, setBirthdayExpanded] = useState(false);
  const [birthdayFilters, setBirthdayFilters] = useState<BirthdaySourceFilters>(defaultBirthdaySourceFilters);
  const [birthdayContactQuery, setBirthdayContactQuery] = useState("");
  const [localEvents, setLocalEvents] = useState<LocalCalendarEvent[]>(loadLocalCalendarEvents);
  const [editorDraft, setEditorDraft] = useState<CalendarEditorDraft | null>(null);
  const [activeEvent, setActiveEvent] = useState<UnifiedCalendarEvent | null>(null);
  const themeRootClassName = cn(isNight ? "client-theme-night" : "client-theme-day", getClientThemeClassName(theme));
  const period = getCalendarPeriod(view, anchorDate);

  useEffect(() => {
    writeBrowserStorage(localCalendarStorageKey, JSON.stringify(localEvents), { silent: true });
  }, [localEvents]);

  const visibleImContacts = useMemo(
    () => getVisibleCalendarContacts(imStore.contacts, imStore.usersById, imScope),
    [imScope, imStore.contacts, imStore.usersById]
  );
  const calendarContactTagOptions = useMemo(
    () => buildCalendarContactTagOptions(visibleImContacts, imStore.usersById, imStore.conversations, imScope),
    [imScope, imStore.conversations, imStore.usersById, visibleImContacts]
  );
  const birthdayContactOptions = useMemo(
    () => getBirthdayContactOptions(visibleImContacts, imStore.usersById),
    [imStore.usersById, visibleImContacts]
  );
  const commonSyncContactOptions = useMemo(
    () => getCommonSyncContactOptions(visibleImContacts, imStore.usersById, imStore.conversations),
    [imStore.conversations, imStore.usersById, visibleImContacts]
  );
  const tagSyncContactOptions = useMemo(
    () => getTagSyncContactOptions(calendarContactTagOptions),
    [calendarContactTagOptions]
  );
  const groupSyncContactOptions = useMemo(
    () => getGroupSyncContactOptions(imStore.conversations),
    [imStore.conversations]
  );

  const relevantTechnicianIds = useMemo(() => {
    if (activeScope === "merchant" && currentStore) {
      return new Set(getStoreTechnicians(currentStore, technicians).map((technician) => technician.id));
    }
    if (activeScope === "technician" && currentTechnician) {
      return new Set([currentTechnician.id]);
    }
    if (!currentCustomer) {
      return new Set<string>();
    }
    return getRelevantTechnicianIds(dispatchSnapshot.arrangements, currentCustomer, technicians);
  }, [activeScope, currentCustomer, currentStore, currentTechnician, dispatchSnapshot.arrangements, technicians]);

  const syncContactOptions = useMemo(() => {
    const baseOptions =
      activeScope === "merchant"
        ? getMerchantSyncContactOptions(currentStore, technicians)
        : activeScope === "technician"
        ? getTechnicianSyncContactOptions(currentTechnician, stores, technicians)
        : getUserSyncContactOptions(currentCustomer, dispatchSnapshot.arrangements, relevantTechnicianIds, stores, technicians);

    return getCompleteSyncContactOptions(baseOptions, commonSyncContactOptions, tagSyncContactOptions, groupSyncContactOptions);
  }, [
    activeScope,
    commonSyncContactOptions,
    currentCustomer,
    currentStore,
    currentTechnician,
    dispatchSnapshot.arrangements,
    groupSyncContactOptions,
    relevantTechnicianIds,
    stores,
    tagSyncContactOptions,
    technicians
  ]);

  const parallelCalendarLanes = useMemo(
    () => (resolvedDisplayMode === "parallel" ? getParallelCalendarLanes(activeScope === "merchant" ? currentStore : undefined, currentTechnician, technicians) : undefined),
    [activeScope, currentStore, currentTechnician, resolvedDisplayMode, technicians]
  );

  const allEvents = useMemo(() => {
    const birthdayEvents = getBirthdayCalendarEvents(period, currentCustomer, currentTechnician, currentStore, birthdayContactOptions);

    return [
      ...getLocalCalendarEvents(localEvents, syncContactOptions),
      ...(activeScope === "user" && currentCustomer ? getOrderEvents(currentCustomer) : []),
      ...(activeScope === "merchant" && currentStore
        ? getMerchantEventsForStore(currentStore, dispatchSnapshot.arrangements, technicianSnapshot, scheduleSnapshot, stores, technicians)
        : activeScope === "technician" && currentTechnician
        ? getTechnicianEventsForTechnician(currentTechnician.id, technicianSnapshot, stores, technicians)
        : currentCustomer
          ? getTechnicianEvents(currentCustomer, relevantTechnicianIds, technicianSnapshot, stores, technicians)
          : []),
      ...(activeScope === "merchant"
        ? []
        : activeScope === "technician" && currentTechnician
        ? getMerchantEventsForTechnician(currentTechnician.id, dispatchSnapshot.arrangements, scheduleSnapshot, stores, technicians)
        : currentCustomer
          ? getMerchantEvents(currentCustomer, relevantTechnicianIds, dispatchSnapshot.arrangements, technicianSnapshot, scheduleSnapshot, stores, technicians)
          : []),
      ...birthdayEvents,
      ...getReferenceCalendarEvents()
    ].sort(sortEvents);
  }, [
    activeScope,
    birthdayContactOptions,
    currentCustomer,
    currentStore,
    currentTechnician,
    dispatchSnapshot.arrangements,
    localEvents,
    period,
    relevantTechnicianIds,
    scheduleSnapshot,
    stores,
    syncContactOptions,
    technicianSnapshot,
    technicians
  ]);

  const periodEvents = useMemo(
    () => allEvents.filter((event) => isDateInRange(event.date, period.startDate, period.endDate)),
    [allEvents, period.endDate, period.startDate]
  );
  const sourceCounts = useMemo(() => {
    const counts = Object.fromEntries((Object.keys(sourceConfigs) as UnifiedCalendarSourceId[]).map((sourceId) => [sourceId, 0])) as Record<UnifiedCalendarSourceId, number>;
    periodEvents.forEach((event) => {
      counts[event.sourceId] += 1;
    });
    return counts;
  }, [periodEvents]);
  const visiblePeriodEvents = periodEvents.filter((event) => {
    if (!sourceVisibility[event.sourceId]) {
      return false;
    }
    if (event.sourceId !== "birthday") {
      return true;
    }
    if (event.birthdayScope === "self") {
      return birthdayFilters.self;
    }
    if (event.birthdayScope === "contact") {
      const matchesSelectedContact = birthdayFilters.contacts && birthdayFilters.contactIds.includes(event.birthdayContactId ?? "");
      const matchesSelectedTag = birthdayFilters.tags.length > 0 && (event.birthdayTags ?? []).some((tag) => birthdayFilters.tags.includes(tag));
      return matchesSelectedContact || matchesSelectedTag;
    }
    return true;
  });
  const groupedVisibleEvents = groupEventsByDate(visiblePeriodEvents);
  const selectedDateEvents = (groupedVisibleEvents[selectedDate] ?? []).sort(sortEvents);

  const shiftPeriod = (direction: -1 | 1) => {
    const nextAnchorDate = shiftCalendarAnchor(view, anchorDate, direction);
    setAnchorDate(nextAnchorDate);
    if (view === "day" || view === "agenda") {
      setSelectedDate(nextAnchorDate);
    }
  };

  const toggleSource = (sourceId: UnifiedCalendarSourceId) => {
    setSourceVisibility((current) => ({ ...current, [sourceId]: !current[sourceId] }));
  };

  const toggleBirthdayFilter = (key: "self" | "contacts") => {
    setBirthdayFilters((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleBirthdayContact = (contactId: string) => {
    setBirthdayFilters((current) => ({
      ...current,
      contacts: true,
      contactIds: current.contactIds.includes(contactId) ? current.contactIds.filter((item) => item !== contactId) : [...current.contactIds, contactId]
    }));
  };

  const toggleBirthdayTag = (tag: string) => {
    setBirthdayFilters((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag]
    }));
  };

  useEffect(() => {
    const validTagSet = new Set(calendarContactTagOptions.map((option) => option.tag));
    const validContactSet = new Set(birthdayContactOptions.map((option) => option.id));
    setBirthdayFilters((current) => {
      const nextTags = current.tags.filter((tag) => validTagSet.has(tag));
      const nextContactIds = current.contactIds.filter((contactId) => validContactSet.has(contactId));

      if (nextTags.length === current.tags.length && nextContactIds.length === current.contactIds.length) {
        return current;
      }

      return {
        ...current,
        contactIds: nextContactIds,
        tags: nextTags
      };
    });
  }, [birthdayContactOptions, calendarContactTagOptions]);

  const changeView = (nextView: UnifiedCalendarView) => {
    setView(nextView);
    if (nextView === "day") {
      setAnchorDate(selectedDate);
    }
  };

  const openCreate = (date = selectedDate, startTime?: string, endTime?: string, calendarId = "user:me", calendarLabel = "我的行程") => {
    const defaultStartMinute =
      startTime === undefined && date === getTodayDateKey()
        ? clampDraftMinute(new Date().getHours() * 60 + new Date().getMinutes(), 0, 24 * 60 - 60)
        : timeToMinutes(startTime ?? "10:00");
    const defaultRange = normalizeDraftRange(defaultStartMinute, endTime ? timeToMinutes(endTime) : defaultStartMinute + 60);
    setEditorDraft({
      id: "",
      calendarId,
      calendarLabel,
      date,
      startTime: minutesToTime(defaultRange.start),
      endTime: minutesToTime(defaultRange.end),
      title: "",
      location: calendarId === "user:me" ? "" : calendarLabel,
      note: "",
      images: [],
      reminder: "30 分钟前",
      syncContactIds: [],
      visibility: "未同步"
    });
  };

  const saveDraft = () => {
    if (!editorDraft) {
      return;
    }

    const now = new Date().toISOString();
    const normalizedStart = editorDraft.startTime || "10:00";
    const normalizedEnd =
      timeToMinutes(editorDraft.endTime || "") > timeToMinutes(normalizedStart)
        ? editorDraft.endTime
        : addMinutesToTime(normalizedStart, 60);
    const syncContactLabels = getSyncContactLabels(editorDraft.syncContactIds, syncContactOptions);
    const normalized: LocalCalendarEvent = {
      ...editorDraft,
      id: editorDraft.id || `user-local-${Date.now()}`,
      calendarId: editorDraft.calendarId,
      calendarLabel: editorDraft.calendarLabel,
      title: editorDraft.title.trim() || "（無標題）",
      note: editorDraft.note.trim(),
      images: editorDraft.images,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      syncContactIds: editorDraft.syncContactIds,
      visibility: syncContactLabels.join("、") || "未同步",
      createdAt: localEvents.find((event) => event.id === editorDraft.id)?.createdAt ?? now,
      updatedAt: now
    };

    setLocalEvents((current) => {
      const exists = current.some((event) => event.id === normalized.id);
      return exists ? current.map((event) => (event.id === normalized.id ? normalized : event)) : [...current, normalized];
    });
    setSelectedDate(normalized.date);
    setAnchorDate(normalized.date);
    setView("day");
    setEditorDraft(null);
  };

  const openEdit = (event: UnifiedCalendarEvent) => {
    const localEvent = localEvents.find((item) => item.id === event.id);
    if (!localEvent) {
      return;
    }

    setActiveEvent(null);
    setEditorDraft({
      id: localEvent.id,
      calendarId: localEvent.calendarId,
      calendarLabel: localEvent.calendarLabel,
      date: localEvent.date,
      startTime: localEvent.startTime,
      endTime: localEvent.endTime,
      title: localEvent.title,
      location: localEvent.location,
      note: localEvent.note,
      images: localEvent.images,
      reminder: localEvent.reminder,
      syncContactIds: localEvent.syncContactIds,
      visibility: localEvent.visibility
    });
  };

  const deleteEvent = (event: UnifiedCalendarEvent) => {
    setLocalEvents((current) => current.filter((item) => item.id !== event.id));
    setActiveEvent(null);
  };

  const renderSelectedDateList = () => {
    if (selectedDateEvents.length === 0) {
      return <EmptyCalendarState date={selectedDate} onCreate={() => openCreate(selectedDate)} />;
    }

    return <EventList events={selectedDateEvents} onOpen={setActiveEvent} />;
  };

  return (
    <section className={cn(themeRootClassName, schedulePanelClass, "relative overflow-visible p-3")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            aria-label="打开日历来源"
            className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)]"
            onClick={() => setSourceDrawerOpen((current) => !current)}
            type="button"
          >
            <AppIcon name="menu" />
          </button>
          <div className="min-w-0">
            <strong className="block truncate text-lg font-black text-[color:var(--client-text)]">{period.label}</strong>
            <span className="mt-0.5 block text-[11px] font-black text-[color:var(--client-muted)]">{activeScope === "merchant" ? "多技师并行日程" : activeScope === "technician" ? "我的排班" : "我的同步日程"}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            className="focus-ring h-9 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3 text-[12px] font-black text-[color:var(--client-text)]"
            onClick={() => {
              const today = getTodayDateKey();
              setAnchorDate(today);
              setSelectedDate(today);
            }}
            type="button"
          >
            今天
          </button>
          <button
            aria-label="新增行程"
            className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
            onClick={() => openCreate(selectedDate)}
            type="button"
          >
            <AppIcon name="plus" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[auto,1fr,auto] items-center gap-2">
        <button
          className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-lg font-black text-[color:var(--client-text)]"
          onClick={() => shiftPeriod(-1)}
          type="button"
        >
          ‹
        </button>
        <div className="grid grid-cols-4 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_84%,transparent)] p-1">
          {viewOptions.map((option) => (
            <button
              className={cn(
                "focus-ring h-8 rounded-full text-[12px] font-black transition",
                view === option.value
                  ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_10px_20px_color-mix(in_srgb,var(--client-primary)_20%,transparent)]"
                  : "text-[color:var(--client-muted)]"
              )}
              key={option.value}
              onClick={() => changeView(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-lg font-black text-[color:var(--client-text)]"
          onClick={() => shiftPeriod(1)}
          type="button"
        >
          ›
        </button>
      </div>

      {view === "day" ? (
        <div className="mt-3">
          <DayTimeline calendarLanes={parallelCalendarLanes} date={selectedDate} events={selectedDateEvents} onCreate={openCreate} onOpen={setActiveEvent} />
        </div>
      ) : view === "week" ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-7 gap-1">
            {getWeekDates(anchorDate).map((date) => {
              const count = (groupedVisibleEvents[date] ?? []).length;
              const selected = selectedDate === date;
              return (
                <button
                  className={cn(
                    "focus-ring min-h-[64px] rounded-[16px] border px-1.5 py-2 text-center transition",
                    selected
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)]"
                  )}
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  type="button"
                >
                  <span className="block text-[10px] font-black text-[color:var(--client-muted)]">{getWeekdayLabel(date).replace("周", "")}</span>
                  <strong className="mt-1 block text-[13px] font-black text-[color:var(--client-text)]">{Number(date.slice(-2))}</strong>
                  {count > 0 ? <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-[color:var(--client-primary)]" /> : null}
                </button>
              );
            })}
          </div>
          {renderSelectedDateList()}
        </div>
      ) : view === "month" ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-7 gap-1 px-1 text-center text-[10px] font-black text-[color:var(--client-muted)]">
            {getWeekdayHeaderLabel().map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {getMonthGridDates(anchorDate).map((date) => {
              const events = groupedVisibleEvents[date] ?? [];
              const selected = selectedDate === date;
              const inMonth = date.slice(0, 7) === anchorDate.slice(0, 7);
              return (
                <button
                  className={cn(
                    "focus-ring min-h-[66px] rounded-[13px] border px-1.5 py-1.5 text-left transition",
                    selected
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)]",
                    !inMonth && "opacity-35"
                  )}
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  type="button"
                >
                  <strong className="block text-[12px] font-black text-[color:var(--client-text)]">{Number(date.slice(-2))}</strong>
                  <span className="mt-2 flex flex-col gap-1">
                    {events.slice(0, 3).map((event) => (
                      <span
                        className="h-1.5 rounded-full bg-[color:var(--calendar-accent)]"
                        key={event.id}
                        style={getEventStyle(event)}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {renderSelectedDateList()}
        </div>
      ) : (
        <AgendaView dates={period.dates} events={visiblePeriodEvents} onCreate={(date) => openCreate(date)} onOpen={setActiveEvent} />
      )}

      {editorDraft ? (
        <EditorSheet draft={editorDraft} onChange={setEditorDraft} onClose={() => setEditorDraft(null)} onSave={saveDraft} syncContactOptions={syncContactOptions} />
      ) : null}
      {activeEvent ? <EventDetailSheet event={activeEvent} onClose={() => setActiveEvent(null)} onDelete={deleteEvent} onEdit={openEdit} /> : null}
      <CalendarSourceDrawer
        birthdayContactOptions={birthdayContactOptions}
        birthdayContactQuery={birthdayContactQuery}
        birthdayExpanded={birthdayExpanded}
        birthdayFilters={birthdayFilters}
        birthdayTagOptions={calendarContactTagOptions}
        onBirthdayContactQueryChange={setBirthdayContactQuery}
        onBirthdayContactToggle={toggleBirthdayContact}
        onBirthdayExpandToggle={() => setBirthdayExpanded((current) => !current)}
        onBirthdayFilterToggle={toggleBirthdayFilter}
        onBirthdayTagToggle={toggleBirthdayTag}
        onClose={() => setSourceDrawerOpen(false)}
        onToggle={toggleSource}
        open={sourceDrawerOpen}
        sourceCounts={sourceCounts}
        sourceVisibility={sourceVisibility}
      />
    </section>
  );
}
