import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent as ReactChangeEvent, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type UIEvent as ReactUIEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppIcon, floatingHeaderControlButtonClassName, type IconName } from "../client-ui/AppScaffold";
import { FloatingActionButton } from "../mobile/FloatingActionButton";
import { MobileFullscreenCloseButton, MobileFullscreenHeader } from "../mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../mobile/MobileFullscreenPage";
import { HolidayCornerBadge } from "./HolidayCornerBadge";
import { ScheduleDraftRangeBlock, scheduleDraftRangeVisualMinHeight } from "./ScheduleDraftRangeBlock";
import { ScheduleViewPicker } from "./ScheduleViewPicker";
import { ScheduleCacheRefreshIndicator } from "./ScheduleCacheRefreshIndicator";
import type {
  CalendarParticipantOption,
  CalendarParticipantTimelineRenderInput,
} from "./CalendarParticipantFlow";
import { AvatarImage } from "../ui/AvatarImage";
import { ConversationListItem } from "../ui/ConversationListItem";
import { bookingApi, mapBookingOrderToDomainOrder, type BookingOrder, type BookingScheduleSlot } from "../../features/booking/api";
import { loadCustomerOrderWindow } from "../../features/booking/window-loaders";
import { mapScheduleSlotToCalendarItem } from "../../features/scheduling/api";
import { loadEveryScopedOrder, loadManagedScheduleWindow } from "../../features/scheduling/window-loader";
import { readFormalScheduleWindow, refreshFormalScheduleWindow } from "../../features/scheduling/formalScheduleWindowCache";
import { calendarEventApi, type FormalCalendarEvent, type FormalCalendarEventInput } from "../../features/scheduling/calendar-event-api";
import { availabilityWindowApi, type AvailabilityWindow } from "../../features/scheduling/availability-window-api";
import { useDispatchCenterStore } from "../../features/dispatch-center/store";
import type { DispatchArrangement } from "../../features/dispatch-center/domain";
import { getDisplayName, type ContactRelation, type Conversation, type ImRoleType, type ImUser } from "../../features/im/model";
import { getImRoleConfig, isContactVisibleForRole } from "../../features/im/role-config";
import { useImStore } from "../../features/im/store";
import { useHorizontalDragScroll } from "../../lib/useHorizontalDragScroll";
import { cn, statusLabel } from "../../lib/utils";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { getJapaneseHoliday } from "../../lib/japaneseHolidays";
import { getNeedoAppBookingTitle } from "../../lib/scheduleBookingTitle";
import { getScheduleOrderDetailRoute, type ScheduleDetailTargetType } from "../../lib/scheduleDetailTarget";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { getScopedTechnicianDynamicPath } from "../../shared/profile-card";
import { getScopedProfileDetailPath } from "../../shared/profile-detail";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import {
  fetchGoogleCalendarApi,
  getGoogleCalendarActorId,
  googleCalendarIconSrc,
  type GoogleCalendarApiExportResponse,
  type GoogleCalendarApiImportResponse,
  type GoogleCalendarConnectionStatus,
  type GoogleCalendarSyncActionResult
} from "../../lib/googleCalendarApi";
import { googleAccountIconSrc } from "../../lib/googleAccountApi";
import { useEntityStore } from "../../state/entityStore";
import { useScheduleStore } from "../../state/scheduleStore";
import { useTechnicianScheduleStore } from "../../state/technicianScheduleStore";
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

const CalendarParticipantFlow = lazy(() => import("./CalendarParticipantFlow").then((module) => ({
  default: module.CalendarParticipantFlow,
})));

export type UnifiedCalendarView = "day" | "threeDay" | "week" | "month" | "agenda";
type UnifiedCalendarScope = "user" | "technician" | "merchant";
type UnifiedCalendarDisplayMode = "personal" | "parallel";
type MerchantCalendarLaneMode = "technician" | "appointmentStatus";
export type UnifiedCalendarSourceId = "user" | "technician" | "merchant" | "todo" | "birthday" | "holiday";
export type UnifiedCalendarTechnician = Pick<Technician, "id" | "name" | "storeId" | "avatar"> &
  Partial<Omit<Technician, "id" | "name" | "storeId" | "avatar">>;
type CalendarRepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly";
type TechnicianCreationMode = "private" | "availability" | "manualBooking";

type CalendarAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

type SyncContactOption = {
  id: string;
  label: string;
  description: string;
  avatar?: string;
  count?: number;
  kind?: SyncContactFilterMode;
};

type CalendarEventCreator = {
  label: string;
  userId?: string;
  entityType?: ImUser["entityType"];
  entityId?: string;
};

export type UnifiedCalendarParticipant = {
  id: string;
  name: string;
  avatar?: string;
  meta?: string;
  role?: string;
  to?: string;
};

export type UnifiedCalendarLane = {
  id: string;
  label: string;
  caption?: string;
  accent: string;
  avatar?: string;
  centerHeader?: boolean;
  detailPath?: string;
  onRemove?: () => void;
};

export type UnifiedCalendarEvent = {
  id: string;
  scheduleSlotId?: number;
  availabilityWindowId?: number;
  availabilitySourceType?: AvailabilityWindow["sourceType"];
  sourceId: UnifiedCalendarSourceId;
  calendarId?: string;
  calendarLabel?: string;
  date: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  title: string;
  subtitle: string;
  badge: string;
  readOnly: boolean;
  orderId?: string;
  detailTargetType?: ScheduleDetailTargetType;
  detailTargetId?: string;
  location?: string;
  note?: string;
  url?: string;
  images?: CalendarAttachment[];
  reminder?: string;
  allDay?: boolean;
  repeatRule?: CalendarRepeatRule;
  syncContactLabels?: string[];
  visibility?: string;
  birthdayContactId?: string;
  birthdayTags?: string[];
  birthdayScope?: "self" | "contact";
  creatorLabel?: string;
  creatorUserId?: string;
  creatorEntityType?: ImUser["entityType"];
  creatorEntityId?: string;
  participants?: UnifiedCalendarParticipant[];
  bookingConflict?: boolean;
};

type FormalCalendarCacheValue = {
  orders: Order[];
  merchantOrders: BookingOrder[];
  scheduleSlots: BookingScheduleSlot[];
  availabilityWindows: AvailabilityWindow[];
};

type LocalCalendarEvent = {
  id: string;
  calendarId: string;
  calendarLabel: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string;
  note: string;
  url: string;
  images: CalendarAttachment[];
  reminder: string;
  allDay: boolean;
  repeatRule: CalendarRepeatRule;
  syncContactIds: string[];
  visibility: string;
  googleEventId?: string;
  googleCalendarId?: string;
  createdAt: string;
  updatedAt: string;
};

type GoogleCalendarApiEventPayload = Pick<
  UnifiedCalendarEvent,
  "id" | "sourceId" | "calendarId" | "calendarLabel" | "date" | "endDate" | "startTime" | "endTime" | "title" | "subtitle" | "location" | "note" | "url" | "allDay" | "repeatRule"
>;

type CalendarEditorDraft = Omit<LocalCalendarEvent, "createdAt" | "updatedAt">;

type SyncContactFilterMode = "common" | "tags" | "groups";
type MerchantAppointmentStatusFilter = "all" | "assigned" | "unassigned";

type BirthdaySourceFilters = {
  self: boolean;
  contacts: boolean;
  contactIds: string[];
  tags: string[];
};

export type UnifiedUserCalendarProps = {
  currentCustomer?: Customer;
  currentTechnician?: UnifiedCalendarTechnician;
  currentStore?: Store;
  displayMode?: UnifiedCalendarDisplayMode;
  formalOnly?: boolean;
  initialSelectedDate?: string;
  merchantLaneMode?: MerchantCalendarLaneMode;
  searchQuery?: string;
  showSourceDrawer?: boolean;
  scope?: UnifiedCalendarScope;
  technicians?: Technician[];
};

type UnifiedCalendarPeriod = {
  startDate: string;
  endDate: string;
  label: string;
  dates: string[];
};

type AgendaDateWindow = {
  startDate: string;
  endDate: string;
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
const timelineTimeColumnWidth = 58;
const timelineLaneMinWidth = 136;
const timelineOverflowLaneWidth = 148;
const availabilityStripInset = 4;
const availabilityStripWidth = 24;
const availabilityContentOffset = availabilityStripInset + availabilityStripWidth + 4;
const scheduleDraftMinDurationMinutes = 30;
const scheduleDraftSnapMinutes = 15;
const agendaInitialPastDays = 90;
const agendaInitialFutureDays = 365;
const agendaExtendChunkDays = 180;
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
const personalSourceIds: UnifiedCalendarSourceId[] = ["todo", "birthday"];

const viewOptions: Array<{ value: Exclude<UnifiedCalendarView, "agenda">; label: string }> = [
  { value: "day", label: "1日" },
  { value: "threeDay", label: "3日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" }
];

const repeatOptions: Array<{ value: CalendarRepeatRule; label: string }> = [
  { value: "none", label: "不重复" },
  { value: "daily", label: "每日" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" }
];

const reminderOptions = [
  { value: "10 分钟前", label: "10 分钟前" },
  { value: "30 分钟前", label: "30 分钟前" },
  { value: "1 小时前", label: "1 小时前" },
  { value: "不提醒", label: "不提醒" },
] as const;

const merchantAppointmentStatusFilterOptions: Array<{ value: MerchantAppointmentStatusFilter; label: string }> = [
  { value: "all", label: "全预约" },
  { value: "assigned", label: "已排预约" },
  { value: "unassigned", label: "未排预约" }
];

const merchantAssignedAppointmentLaneId = "merchant:assigned-appointments";
const merchantUnassignedAppointmentLaneId = "merchant:unassigned-appointments";

const unifiedCalendarSurfaceClassName = "relative overflow-visible";
const scheduleInsetClass =
  "rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)]";
const inputClass =
  "focus-ring h-11 min-w-0 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-3.5 text-sm font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]";
const temporalInputClass = "calendar-event-editor__temporal-input mt-1 text-center";

function CalendarHolidayNameStrip({ className, compact = false, date }: { className?: string; compact?: boolean; date: string }) {
  const holidayTitle = getJapaneseHoliday(date)?.title.trim();

  if (!holidayTitle) {
    return null;
  }

  return (
    <div
      aria-label={`${formatLongDate(date)} · ${holidayTitle}`}
      className={cn(
        "min-w-0 rounded-[7px] border border-[color:color-mix(in_srgb,var(--calendar-accent)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--calendar-accent)_74%,var(--client-elevated)_26%)] text-left font-black leading-none text-[color:var(--calendar-contrast)] shadow-[0_8px_16px_color-mix(in_srgb,var(--calendar-accent)_10%,transparent)]",
        compact ? "h-[20px] w-full px-0.5 py-1 text-[8px]" : "h-[24px] w-full px-2 py-1.5 text-[11px]",
        className
      )}
      data-calendar-holiday-name="true"
      role="note"
      style={{
        "--calendar-accent": sourceConfigs.holiday.accent,
        "--calendar-contrast": sourceConfigs.holiday.contrast
      } as CSSProperties}
      title={`${formatLongDate(date)} · ${holidayTitle}`}
    >
      <span className="block truncate">{holidayTitle}</span>
    </div>
  );
}

export function UnifiedCalendarSurface({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn(unifiedCalendarSurfaceClassName, className)} {...props}>
      {children}
    </section>
  );
}

function addMinutesToTime(time: string, minutes: number) {
  return minutesToTime(timeToMinutes(time) + minutes);
}

function normalizeCalendarRepeatRule(value: string | undefined): CalendarRepeatRule {
  return repeatOptions.some((option) => option.value === value) ? (value as CalendarRepeatRule) : "none";
}

function formatCalendarEditorDateTimeInputValue(date: string, time: string) {
  return date && time ? `${date}T${time}` : "";
}

function parseCalendarEditorDateTimeInputValue(value: string) {
  const [date, timeValue] = value.split("T");
  const time = timeValue?.slice(0, 5);

  if (!date || !time) {
    return null;
  }

  return { date, time };
}

function applyCalendarEditorDateTimeChange(draft: CalendarEditorDraft, value: string, target: "start" | "end"): CalendarEditorDraft {
  const parsed = parseCalendarEditorDateTimeInputValue(value);

  if (!parsed) {
    return draft;
  }

  if (target === "start") {
    const endDateTracksStartDate = !draft.endDate || draft.endDate === draft.date;
    return {
      ...draft,
      date: parsed.date,
      endDate: endDateTracksStartDate ? parsed.date : draft.endDate,
      startTime: parsed.time
    };
  }

  return {
    ...draft,
    endDate: parsed.date,
    endTime: parsed.time
  };
}

function applyCalendarAllDayChange(draft: CalendarEditorDraft, allDay: boolean): CalendarEditorDraft {
  return {
    ...draft,
    allDay,
    startTime: allDay ? "00:00" : draft.startTime,
    endTime: allDay ? "23:59" : draft.endTime,
    endDate: draft.endDate || draft.date
  };
}

function getGoogleCalendarSettingsPath(scope: UnifiedCalendarScope) {
  if (scope === "merchant") {
    return "/merchant/settings/account?section=google-account";
  }

  if (scope === "technician") {
    return "/technician/settings/account?section=google-account";
  }

  return "/me/settings/account?section=google-account";
}

function toGoogleCalendarApiPayload(event: UnifiedCalendarEvent): GoogleCalendarApiEventPayload {
  return {
    id: event.id,
    sourceId: event.sourceId,
    calendarId: event.calendarId,
    calendarLabel: event.calendarLabel,
    date: event.date,
    endDate: event.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    title: event.title,
    subtitle: event.subtitle,
    location: event.location,
    note: event.note,
    url: event.url,
    allDay: event.allDay,
    repeatRule: event.repeatRule
  };
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
  return [target, order.mode === "home" ? "到府服务" : "到店服务"].filter(Boolean).join(" · ");
}

function getSyncContactLabels(contactIds: string[], options: SyncContactOption[]) {
  return contactIds.map((contactId) => options.find((option) => option.id === contactId)?.label).filter((label): label is string => Boolean(label));
}

function getTechnicianCalendarLaneId(technicianId: string) {
  return `technician:${technicianId}`;
}

function getLocalCalendarEvents(localEvents: LocalCalendarEvent[], syncContactOptions: SyncContactOption[], creator?: CalendarEventCreator): UnifiedCalendarEvent[] {
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
    url: event.url,
    images: event.images,
    reminder: event.reminder,
    allDay: event.allDay,
    repeatRule: event.repeatRule,
    syncContactLabels: getSyncContactLabels(event.syncContactIds, syncContactOptions),
    visibility: getSyncContactLabels(event.syncContactIds, syncContactOptions).join("、") || "未同步",
    participants: event.syncContactIds
      .map((contactId) => syncContactOptions.find((option) => option.id === contactId))
      .filter((option): option is SyncContactOption => Boolean(option))
      .map((option) => ({
        id: option.id,
        name: option.label,
        avatar: option.avatar,
        meta: option.description,
        role: option.id.startsWith("group:") ? "群组" : option.id.startsWith("tag:") ? "标签" : "参加者"
      })),
    ...getCalendarCreatorFields(creator)
  }));
}

function getFormalPersonalCalendarEvents(events: FormalCalendarEvent[], creator?: CalendarEventCreator): UnifiedCalendarEvent[] {
  return events.flatMap((event) => getFormalCalendarSegments(event.startsAt, event.endsAt).map((segment) => ({
    ...segment,
    id: `calendar-event-${event.id}-${segment.date}`,
    sourceId: "user" as const,
    calendarId: "formal:personal",
    calendarLabel: "我的行程",
    endDate: segment.date,
    title: event.title,
    subtitle: event.location || "个人行程",
    badge: "个人行程",
    readOnly: false,
    location: event.location,
    note: event.note,
    url: event.url,
    images: event.imageUrls.map((dataUrl, index) => ({ id: `formal-image-${event.id}-${index}`, name: `图片 ${index + 1}`, dataUrl })),
    reminder: event.reminderMinutes === null ? "不提醒" : event.reminderMinutes === 60 ? "1 小时前" : `${event.reminderMinutes} 分钟前`,
    allDay: event.allDay,
    repeatRule: event.repeatRule,
    syncContactLabels: [],
    visibility: event.visibility === "participants" ? "参加者" : "仅自己",
    participants: [],
    ...getCalendarCreatorFields(creator)
  })));
}

function formalCalendarEventId(eventId: string): number | null {
  const match = /^calendar-event-(\d+)-/.exec(eventId);
  return match ? Number(match[1]) : null;
}

function reminderMinutes(label: string): number | null {
  if (label === "10 分钟前") return 10;
  if (label === "30 分钟前") return 30;
  if (label === "1 小时前") return 60;
  return null;
}

function toFormalCalendarEventInput(draft: CalendarEditorDraft): FormalCalendarEventInput {
  const date = draft.date || getTodayDateKey();
  const startTime = draft.allDay ? "00:00" : draft.startTime || "10:00";
  let endDate = draft.allDay ? date : draft.endDate || date;
  let endTime = draft.allDay ? "23:59" : draft.endTime || "";
  if (`${endDate}T${endTime}` <= `${date}T${startTime}`) {
    endDate = date;
    endTime = addMinutesToTime(startTime, 60);
  }
  const participantIdentityIds = draft.syncContactIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return {
    title: draft.title.trim() || "（无标题）",
    startsAt: new Date(`${date}T${startTime}:00`).toISOString(),
    endsAt: new Date(`${endDate}T${endTime}:00`).toISOString(),
    allDay: draft.allDay,
    reminderMinutes: reminderMinutes(draft.reminder),
    repeatRule: normalizeCalendarRepeatRule(draft.repeatRule),
    location: draft.location.trim(),
    url: draft.url.trim(),
    note: draft.note.trim(),
    visibility: participantIdentityIds.length ? "participants" : "private",
    participantIdentityIds,
    imageUrls: draft.images.map((image) => image.dataUrl),
  };
}

function getOrderEvents(
  currentCustomer: Customer,
  orderRows: Order[],
  ordersAreServerScoped = false
): UnifiedCalendarEvent[] {
  return orderRows
    .filter((order) => (
      ordersAreServerScoped || order.customerId === currentCustomer.id
    ) && order.status !== "cancelled" && order.status !== "refunded")
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
        title: getCalendarBookingTitle(order.id, order.itemName),
        subtitle: getOrderSubtitle(order),
        badge: order.status === "inService" ? "服务中" : "我的行程",
        readOnly: true,
        orderId: order.id,
        location: order.area,
        participants: dedupeCalendarParticipants([
          getCustomerParticipant(currentCustomer, "user", "参加者")
        ]),
        ...getCalendarCreatorFields(getCustomerCreator(currentCustomer))
      };
    })
    .filter((event): event is UnifiedCalendarEvent => Boolean(event));
}

function getFormalCalendarSegments(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!(end.getTime() > start.getTime())) return [];
  const segments: Array<{ date: string; startTime: string; endTime: string }> = [];
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  while (day < end) {
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const segmentStart = new Date(Math.max(start.getTime(), day.getTime()));
    const segmentEnd = new Date(Math.min(end.getTime(), nextDay.getTime()));
    segments.push({
      date: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
      startTime: `${pad(segmentStart.getHours())}:${pad(segmentStart.getMinutes())}`,
      endTime: segmentEnd.getTime() === nextDay.getTime() ? "24:00" : `${pad(segmentEnd.getHours())}:${pad(segmentEnd.getMinutes())}`
    });
    day.setTime(nextDay.getTime());
  }
  return segments;
}

export function getFormalScheduleEvents(slots: BookingScheduleSlot[], scope: "merchant" | "technician"): UnifiedCalendarEvent[] {
  return slots.flatMap((slot) => {
    const item = mapScheduleSlotToCalendarItem(slot);
    return getFormalCalendarSegments(slot.startsAt, slot.endsAt).map((segment) => ({
      ...segment,
      id: `${item.id}-${segment.date}`,
      scheduleSlotId: slot.id,
      availabilitySourceType: slot.availabilitySourceType ?? undefined,
      sourceId: scope,
      calendarId: slot.technicianProfileId ? getTechnicianCalendarLaneId(String(slot.technicianProfileId)) : "merchant:unassigned",
      calendarLabel: slot.technicianName ?? "未指定技师",
      title: scope === "technician"
        ? slot.availabilitySourceType === "shop"
          ? `${slot.shopName}店铺排班（可排班日程）`
          : "自由排班"
        : item.title,
      subtitle: item.subtitle,
      badge: item.badge,
      readOnly: true,
      detailTargetType: "none" as const
    }));
  });
}

export function getFormalAvailabilityWindowEvents(
  windows: AvailabilityWindow[],
  scope: "merchant" | "technician"
): UnifiedCalendarEvent[] {
  return windows.flatMap((window) => getFormalCalendarSegments(window.startsAt, window.endsAt).map((segment) => ({
    ...segment,
    id: `availability-window-${window.id}-${segment.date}`,
    availabilityWindowId: window.id,
    availabilitySourceType: window.sourceType,
    sourceId: scope,
    calendarId: getTechnicianCalendarLaneId(String(window.technicianProfileId)),
    calendarLabel: window.sourceType === "shop" ? window.shopName : "自由排班",
    title: window.sourceType === "shop" ? `${window.shopName}店铺排班（可排班日程）` : "自由排班",
    subtitle: "可排班 ≠ 当前空闲",
    badge: "可排班",
    readOnly: scope !== "technician",
    detailTargetType: "none" as const
  })));
}

export function getFormalMerchantOrderEvents(orders: BookingOrder[], sourceId: "merchant" | "technician" = "merchant"): UnifiedCalendarEvent[] {
  return orders.filter((order) => order.status !== "cancelled").flatMap((order) =>
    getFormalCalendarSegments(order.startsAt, order.endsAt).map((segment) => ({
      ...segment,
      id: `formal-order-${order.id}-${segment.date}`,
      orderId: String(order.id),
      sourceId,
      calendarId: order.technicianProfileId ? getTechnicianCalendarLaneId(String(order.technicianProfileId)) : "merchant:unassigned",
      calendarLabel: order.technicianName ?? "未指定技师",
      title: getCalendarBookingTitle(String(order.id), order.serviceName),
      subtitle: [order.orderNo, order.technicianName, order.shopName].filter(Boolean).join(" · "),
      badge: statusLabel(order.status),
      readOnly: true,
      detailTargetType: "order_detail" as const,
      detailTargetId: String(order.id)
    }))
  );
}

function getRelevantTechnicianIds(arrangements: DispatchArrangement[], currentCustomer: Customer, technicians: Technician[], orderRows: Order[]) {
  const relevantIds = new Set(
    arrangements
      .filter((arrangement) => arrangement.customerId === currentCustomer.id && arrangement.technicianId)
      .map((arrangement) => arrangement.technicianId as string)
  );

  orderRows
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
  return technician?.nickname?.trim() || technician?.name || "技师";
}

function getStoreName(stores: ReturnType<typeof useEntityStore>["stores"], storeId: string) {
  return stores.find((store) => store.id === storeId)?.name ?? "店铺";
}

function getCustomerDisplayName(customer: Customer) {
  return customer.nickname?.trim() || customer.name;
}

function getTechnicianDisplayName(technician: UnifiedCalendarTechnician) {
  return technician.nickname?.trim() || technician.name;
}

function getCustomerCreator(customer: Customer): CalendarEventCreator {
  return {
    label: getCustomerDisplayName(customer),
    entityType: "user",
    entityId: customer.id
  };
}

function getStoreCreator(stores: ReturnType<typeof useEntityStore>["stores"], storeId: string): CalendarEventCreator {
  return {
    label: getStoreName(stores, storeId),
    entityType: "shop",
    entityId: storeId
  };
}

function getCurrentScopeCreator(
  scope: UnifiedCalendarScope,
  currentCustomer: Customer | undefined,
  currentTechnician: UnifiedCalendarTechnician | undefined,
  currentStore: Store | undefined
): CalendarEventCreator | undefined {
  if (scope === "merchant" && currentStore) {
    return { label: currentStore.name, entityType: "shop", entityId: currentStore.id };
  }

  if (scope === "technician" && currentTechnician) {
    return { label: getTechnicianDisplayName(currentTechnician), entityType: "technician", entityId: currentTechnician.id };
  }

  if (currentCustomer) {
    return getCustomerCreator(currentCustomer);
  }

  return { label: "我" };
}

function dedupeCalendarParticipants(participants: Array<UnifiedCalendarParticipant | null | undefined>) {
  const seen = new Set<string>();
  return participants.filter((participant): participant is UnifiedCalendarParticipant => {
    if (!participant?.name.trim()) {
      return false;
    }

    const key = participant.id || participant.name;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getCustomerParticipant(customer: Customer | undefined, scope: UnifiedCalendarScope, role = "参加者"): UnifiedCalendarParticipant | null {
  if (!customer) {
    return null;
  }

  return {
    id: `customer:${customer.id}`,
    name: customer.nickname?.trim() || customer.name,
    avatar: customer.avatar,
    meta: [customer.memberLevel, customer.systemId].filter(Boolean).join(" · "),
    role,
    to: getScopedProfileDetailPath(scope, "user", customer.id)
  };
}

function getTechnicianParticipant(technician: Technician | undefined, scope: UnifiedCalendarScope, role = "参加者"): UnifiedCalendarParticipant | null {
  if (!technician) {
    return null;
  }

  return {
    id: `technician:${technician.id}`,
    name: technician.nickname?.trim() || technician.name,
    avatar: technician.avatar,
    meta: [technician.identityLabel, technician.status === "busy" ? "服务中" : technician.status === "off" ? "休息" : "可排班"].filter(Boolean).join(" · "),
    role,
    to: getScopedTechnicianDynamicPath(scope, technician)
  };
}

function getStoreParticipant(store: Store | undefined, scope: UnifiedCalendarScope, role = "创建者"): UnifiedCalendarParticipant | null {
  if (!store) {
    return null;
  }

  return {
    id: `store:${store.id}`,
    name: store.name,
    avatar: store.cover,
    meta: [store.area, store.tags[0]].filter(Boolean).join(" · "),
    role,
    to: getScopedProfileDetailPath(scope, "shop", store.id)
  };
}

function getNamedParticipant(name: string | undefined, role = "参加者", meta?: string): UnifiedCalendarParticipant | null {
  const label = name?.trim();
  if (!label) {
    return null;
  }

  return {
    id: `named:${label}`,
    name: label,
    meta,
    role
  };
}

function getCalendarCreatorFields(creator?: CalendarEventCreator) {
  if (!creator) {
    return {};
  }

  return {
    creatorLabel: creator.label,
    creatorUserId: creator.userId,
    creatorEntityType: creator.entityType,
    creatorEntityId: creator.entityId
  } satisfies Pick<UnifiedCalendarEvent, "creatorLabel" | "creatorUserId" | "creatorEntityType" | "creatorEntityId">;
}

function findCalendarCreatorUser(event: UnifiedCalendarEvent, users: ImUser[]) {
  if (event.creatorUserId) {
    return users.find((user) => user.id === event.creatorUserId);
  }

  if (!event.creatorEntityType || !event.creatorEntityId) {
    return undefined;
  }

  return users.find((user) => user.entityType === event.creatorEntityType && user.entityId === event.creatorEntityId);
}

function resolveCalendarCreator(event: UnifiedCalendarEvent, users: ImUser[]): UnifiedCalendarEvent {
  const creatorUser = findCalendarCreatorUser(event, users);

  if (!creatorUser) {
    return event;
  }

  return {
    ...event,
    creatorLabel: event.creatorLabel?.trim() || creatorUser.nickname,
    creatorUserId: creatorUser.id
  };
}

function getBookingBadge(eventType?: string) {
  if (eventType === "extension") {
    return "加钟";
  }
  if (eventType === "reschedule") {
    return "改期";
  }
  return "服务";
}

function getCalendarBookingTitle(orderId: string | undefined, fallbackTitle: string) {
  return getNeedoAppBookingTitle(orderId, fallbackTitle) ?? fallbackTitle;
}

function getCalendarAppointmentDetailId(event: UnifiedCalendarEvent) {
  if (event.detailTargetType === "none" || event.detailTargetType === "attendance_detail") {
    return null;
  }

  return event.detailTargetId ?? event.orderId ?? null;
}

function getTechnicianEvents(
  currentCustomer: Customer,
  relevantTechnicianIds: Set<string>,
  snapshot: ReturnType<typeof useTechnicianScheduleStore>,
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[],
  orderRows: Order[]
): UnifiedCalendarEvent[] {
  const customerOrderIds = new Set(orderRows.filter((order) => order.customerId === currentCustomer.id).map((order) => order.id));
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
      title: getCalendarBookingTitle(booking.orderId, booking.title),
      subtitle: `${getTechnicianName(technicians, booking.technicianId)} · ${getStoreName(stores, booking.storeId)}`,
      badge: getBookingBadge(booking.eventType),
      readOnly: true,
      orderId: booking.orderId,
      detailTargetType: booking.detailTargetType,
      detailTargetId: booking.detailTargetId,
      participants: dedupeCalendarParticipants([
        getCustomerParticipant(currentCustomer, "user", "参加者"),
        getTechnicianParticipant(technicians.find((item) => item.id === booking.technicianId), "user", "参加者")
      ]),
      ...getCalendarCreatorFields(getCustomerCreator(currentCustomer))
    }));

  return bookingEvents;
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
      readOnly: true,
      participants: dedupeCalendarParticipants([
        getTechnicianParticipant(technicians.find((item) => item.id === shift.technicianId), "technician", "参加者"),
        getStoreParticipant(stores.find((item) => item.id === shift.storeId), "technician", "创建者")
      ]),
      ...getCalendarCreatorFields(getStoreCreator(stores, shift.storeId))
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
      title: getCalendarBookingTitle(booking.orderId, booking.title),
      subtitle: `${booking.customerName} · ${getStoreName(stores, booking.storeId)}`,
      badge: getBookingBadge(booking.eventType),
      readOnly: true,
      orderId: booking.orderId,
      detailTargetType: booking.detailTargetType,
      detailTargetId: booking.detailTargetId,
      participants: dedupeCalendarParticipants([
        getTechnicianParticipant(technicians.find((item) => item.id === booking.technicianId), "technician", "参加者"),
        getNamedParticipant(booking.customerName, "参加者", "顾客")
      ]),
      ...getCalendarCreatorFields({ label: booking.customerName })
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
      visibility: event.visibility,
      participants: dedupeCalendarParticipants([
        getTechnicianParticipant(technicians.find((item) => item.id === event.technicianId), "technician", "参加者"),
        getStoreParticipant(stores.find((item) => item.id === event.storeId), "technician", "创建者")
      ]),
      ...getCalendarCreatorFields(getStoreCreator(stores, event.storeId))
    }));

  return [...shiftEvents, ...bookingEvents, ...customEvents];
}

function getMerchantScheduleBadge(schedule: Schedule) {
  if (schedule.status === "booked") {
    return schedule.eventType === "extension" ? "加钟" : "已预约";
  }
  if (schedule.status === "blocked") {
    return schedule.eventType === "break" ? "休息" : "锁定";
  }
  return "可预约";
}

function getMerchantEvents(
  currentCustomer: Customer,
  relevantTechnicianIds: Set<string>,
  arrangements: DispatchArrangement[],
  technicianSnapshot: ReturnType<typeof useTechnicianScheduleStore>,
  scheduleSnapshot: ReturnType<typeof useScheduleStore>,
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[],
  orderRows: Order[]
): UnifiedCalendarEvent[] {
  const customerOrderIds = new Set(orderRows.filter((order) => order.customerId === currentCustomer.id).map((order) => order.id));
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
      title: getCalendarBookingTitle(arrangement.orderId, arrangement.serviceName),
      subtitle: `${arrangement.technicianLabel ?? "待定技师"} · ${arrangement.roomLabel}`,
      badge: arrangement.status === "inService" ? "服务中" : arrangement.status === "pending" ? "待确认" : "商户安排",
      readOnly: true,
      orderId: arrangement.orderId,
      detailTargetType: "order_detail",
      detailTargetId: arrangement.orderId,
      location: arrangement.address,
      participants: dedupeCalendarParticipants([
        getCustomerParticipant(currentCustomer, "user", "参加者"),
        getTechnicianParticipant(technicians.find((item) => item.id === arrangement.technicianId), "user", "参加者"),
        getStoreParticipant(stores.find((item) => item.id === arrangement.storeId), "user", "创建者")
      ]),
      ...getCalendarCreatorFields(getStoreCreator(stores, arrangement.storeId))
    }));

  const scheduleEvents = scheduleSnapshot.schedules
    .filter((schedule) => schedule.orderId && customerOrderIds.has(schedule.orderId))
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
        title: getCalendarBookingTitle(schedule.orderId, `${technician?.nickname?.trim() || technician?.name || "技师"} ${getMerchantScheduleBadge(schedule)}`),
        subtitle: technician ? getStoreName(stores, technician.storeId) : "商户排班",
        badge: getMerchantScheduleBadge(schedule),
        readOnly: true,
        orderId: schedule.orderId,
        detailTargetType: schedule.detailTargetType,
        detailTargetId: schedule.detailTargetId,
        participants: dedupeCalendarParticipants([
          getTechnicianParticipant(technician, "user", "参加者"),
          getCustomerParticipant(currentCustomer, "user", "参加者")
        ]),
        ...getCalendarCreatorFields(technician ? getStoreCreator(stores, technician.storeId) : { label: "商户排班" })
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
      title: getCalendarBookingTitle(booking.orderId, booking.title),
      subtitle: `${getStoreName(stores, booking.storeId)} · ${getTechnicianName(technicians, booking.technicianId)}`,
      badge: booking.eventType === "extension" ? "商户加钟" : booking.eventType === "reschedule" ? "商户改期" : "商户确认",
      readOnly: true,
      orderId: booking.orderId,
      detailTargetType: booking.detailTargetType,
      detailTargetId: booking.detailTargetId,
      participants: dedupeCalendarParticipants([
        getCustomerParticipant(currentCustomer, "user", "参加者"),
        getTechnicianParticipant(technicians.find((item) => item.id === booking.technicianId), "user", "参加者")
      ]),
      ...getCalendarCreatorFields(getStoreCreator(stores, booking.storeId))
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
      title: getCalendarBookingTitle(arrangement.orderId, arrangement.serviceName),
      subtitle: `${arrangement.customerName} · ${arrangement.roomLabel}`,
      badge: getArrangementStatusBadge(arrangement.status),
      readOnly: true,
      orderId: arrangement.orderId,
      detailTargetType: "order_detail",
      detailTargetId: arrangement.orderId,
      location: arrangement.address,
      participants: dedupeCalendarParticipants([
        getTechnicianParticipant(technicians.find((item) => item.id === technicianId), "technician", "参加者"),
        getNamedParticipant(arrangement.customerName, "参加者", "顾客"),
        getStoreParticipant(stores.find((item) => item.id === arrangement.storeId), "technician", "创建者")
      ]),
      ...getCalendarCreatorFields(getStoreCreator(stores, arrangement.storeId))
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
      title: getCalendarBookingTitle(schedule.orderId, `${getTechnicianName(technicians, schedule.staffId)} ${getMerchantScheduleBadge(schedule)}`),
      subtitle: technician ? getStoreName(stores, technician.storeId) : "商户排班",
      badge: getMerchantScheduleBadge(schedule),
      readOnly: true,
      orderId: schedule.orderId,
      detailTargetType: schedule.detailTargetType,
      detailTargetId: schedule.detailTargetId,
      participants: dedupeCalendarParticipants([
        getTechnicianParticipant(technicians.find((item) => item.id === schedule.staffId), "technician", "参加者"),
        getStoreParticipant(technician ? stores.find((item) => item.id === technician.storeId) : undefined, "technician", "创建者")
      ]),
      ...getCalendarCreatorFields(technician ? getStoreCreator(stores, technician.storeId) : { label: "商户排班" })
    }));

  return [...arrangementEvents, ...scheduleEvents];
}

function getStoreTechnicians(currentStore: Store | undefined, technicians: Technician[]) {
  if (!currentStore) {
    return [];
  }

  return technicians.filter((technician) => technician.storeId === currentStore.id || technician.relatedStoreIds?.includes(currentStore.id));
}

function getMerchantAppointmentStatusLaneId(technicianId?: string | null) {
  return technicianId ? merchantAssignedAppointmentLaneId : merchantUnassignedAppointmentLaneId;
}

function getMerchantAppointmentStatusLaneLabel(technicianId?: string | null) {
  return technicianId ? "已排预约" : "未排预约";
}

function matchesMerchantAppointmentStatusFilter(event: UnifiedCalendarEvent, filter: MerchantAppointmentStatusFilter) {
  const assigned = event.calendarId?.startsWith("technician:") ?? false;

  if (filter === "assigned") {
    return assigned || event.calendarId === merchantAssignedAppointmentLaneId;
  }

  if (filter === "unassigned") {
    return !assigned && (event.calendarId === "merchant:unassigned" || event.calendarId === merchantUnassignedAppointmentLaneId);
  }

  return true;
}

function getDefaultLocalCalendarTarget(scope: UnifiedCalendarScope) {
  if (scope === "merchant") {
    return { calendarId: "merchant:local", calendarLabel: sourceConfigs.merchant.label };
  }

  if (scope === "technician") {
    return { calendarId: "technician:local", calendarLabel: sourceConfigs.technician.label };
  }

  return { calendarId: "user:me", calendarLabel: sourceConfigs.user.label };
}

function getMerchantEventsForStore(
  currentStore: Store,
  arrangements: DispatchArrangement[],
  technicianSnapshot: ReturnType<typeof useTechnicianScheduleStore>,
  scheduleSnapshot: ReturnType<typeof useScheduleStore>,
  customers: Customer[],
  stores: ReturnType<typeof useEntityStore>["stores"],
  technicians: Technician[],
  laneMode: MerchantCalendarLaneMode = "technician"
) {
  const storeTechnicians = getStoreTechnicians(currentStore, technicians);
  const storeTechnicianIds = new Set(storeTechnicians.map((technician) => technician.id));
  const technicianEvents = laneMode === "technician"
    ? storeTechnicians.flatMap((technician) => getTechnicianEventsForTechnician(technician.id, technicianSnapshot, stores, technicians))
    : [];
  const arrangementEvents = arrangements
    .filter((arrangement) => arrangement.storeId === currentStore.id && arrangement.status !== "cancelled")
    .map((arrangement): UnifiedCalendarEvent => ({
      id: `merchant-arrangement-${arrangement.id}`,
      sourceId: "merchant",
      calendarId: laneMode === "appointmentStatus"
        ? getMerchantAppointmentStatusLaneId(arrangement.technicianId)
        : arrangement.technicianId ? getTechnicianCalendarLaneId(arrangement.technicianId) : "merchant:unassigned",
      calendarLabel: laneMode === "appointmentStatus"
        ? getMerchantAppointmentStatusLaneLabel(arrangement.technicianId)
        : arrangement.technicianLabel ?? "待定技师",
      date: arrangement.date,
      startTime: arrangement.startTime,
      endTime: arrangement.endTime,
      title: getCalendarBookingTitle(arrangement.orderId, arrangement.serviceName),
      subtitle: laneMode === "appointmentStatus"
        ? `${arrangement.customerName} · ${arrangement.technicianLabel ?? "未安排担当"}`
        : `${arrangement.customerName} · ${arrangement.roomLabel}`,
      badge: getArrangementStatusBadge(arrangement.status),
      readOnly: true,
      orderId: arrangement.orderId,
      detailTargetType: "order_detail",
      detailTargetId: arrangement.orderId,
      location: arrangement.address,
      participants: dedupeCalendarParticipants([
        getCustomerParticipant(customers.find((item) => item.id === arrangement.customerId), "merchant", "参加者"),
        getTechnicianParticipant(technicians.find((item) => item.id === arrangement.technicianId), "merchant", "参加者"),
        getStoreParticipant(currentStore, "merchant", "创建者")
      ]),
      ...getCalendarCreatorFields(getStoreCreator(stores, arrangement.storeId))
    }));
  const scheduleEvents = scheduleSnapshot.schedules
    .filter((schedule) => storeTechnicianIds.has(schedule.staffId))
    .filter((schedule) => laneMode === "technician" || schedule.status === "booked" || Boolean(schedule.orderId))
    .map((schedule): UnifiedCalendarEvent => ({
      id: `merchant-schedule-${schedule.id}`,
      sourceId: "merchant",
      calendarId: laneMode === "appointmentStatus" ? merchantAssignedAppointmentLaneId : getTechnicianCalendarLaneId(schedule.staffId),
      calendarLabel: laneMode === "appointmentStatus" ? "已排预约" : getTechnicianName(technicians, schedule.staffId),
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      title: getCalendarBookingTitle(schedule.orderId, `${getTechnicianName(technicians, schedule.staffId)} ${getMerchantScheduleBadge(schedule)}`),
      subtitle: laneMode === "appointmentStatus" ? `${getTechnicianName(technicians, schedule.staffId)} · ${currentStore.name}` : `${currentStore.name} · 商户排班`,
      badge: getMerchantScheduleBadge(schedule),
      readOnly: true,
      orderId: schedule.orderId,
      detailTargetType: schedule.detailTargetType,
      detailTargetId: schedule.detailTargetId,
      participants: dedupeCalendarParticipants([
        getTechnicianParticipant(technicians.find((item) => item.id === schedule.staffId), "merchant", "参加者"),
        getStoreParticipant(currentStore, "merchant", "创建者")
      ]),
      ...getCalendarCreatorFields(getStoreCreator(stores, currentStore.id))
    }));

  const arrangementEventKeys = new Set(arrangementEvents.map((event) => `${event.orderId ?? event.id}:${event.date}`));
  const scheduleEventKeys = new Set(scheduleEvents.map((event) => `${event.orderId ?? event.id}:${event.date}`));
  const bookingBackfillEvents = laneMode === "appointmentStatus"
    ? technicianSnapshot.bookings
        .filter((booking) => booking.storeId === currentStore.id)
        .filter((booking) => !arrangementEventKeys.has(`${booking.orderId ?? booking.id}:${booking.date}`))
        .filter((booking) => !scheduleEventKeys.has(`${booking.orderId ?? booking.id}:${booking.date}`))
        .map((booking): UnifiedCalendarEvent => ({
          id: `merchant-booking-sync-${booking.id}`,
          sourceId: "merchant",
          calendarId: merchantAssignedAppointmentLaneId,
          calendarLabel: "已排预约",
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          title: getCalendarBookingTitle(booking.orderId, booking.title),
          subtitle: `${booking.customerName} · ${getTechnicianName(technicians, booking.technicianId)}`,
          badge: booking.eventType === "extension" ? "加钟" : booking.eventType === "reschedule" ? "改期" : "已排预约",
          readOnly: true,
          orderId: booking.orderId,
          detailTargetType: booking.detailTargetType,
          detailTargetId: booking.detailTargetId,
          participants: dedupeCalendarParticipants([
            getNamedParticipant(booking.customerName, "参加者", "顾客"),
            getTechnicianParticipant(technicians.find((item) => item.id === booking.technicianId), "merchant", "参加者"),
            getStoreParticipant(currentStore, "merchant", "创建者")
          ]),
          ...getCalendarCreatorFields(getStoreCreator(stores, booking.storeId))
        }))
    : [];

  return [...technicianEvents, ...arrangementEvents, ...scheduleEvents, ...bookingBackfillEvents];
}

function getParallelCalendarLanes(
  currentStore: Store | undefined,
  currentTechnician: UnifiedCalendarTechnician | undefined,
  technicians: Technician[],
  merchantLaneMode: MerchantCalendarLaneMode = "technician"
): UnifiedCalendarLane[] {
  if (currentStore) {
    if (merchantLaneMode === "appointmentStatus") {
      return [
        {
          id: merchantAssignedAppointmentLaneId,
          label: "已排预约",
          caption: "已安排担当技师",
          accent: "var(--client-primary)"
        },
        {
          id: merchantUnassignedAppointmentLaneId,
          label: "未排预约",
          caption: "待安排担当技师",
          accent: "var(--client-warning)"
        }
      ];
    }

    const storeTechnicians = getStoreTechnicians(currentStore, technicians);
    return [
      ...storeTechnicians.map((technician, index): UnifiedCalendarLane => ({
        id: getTechnicianCalendarLaneId(technician.id),
        label: technician.nickname?.trim() || technician.name,
        caption: technician.status === "busy" ? "服务中" : technician.status === "off" ? "休息" : "可排班",
        accent: parallelLaneAccents[index % parallelLaneAccents.length] ?? "var(--client-primary)",
        avatar: technician.avatar,
        detailPath: `/merchant/staff/${encodeURIComponent(technician.id)}`
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
        accent: "var(--client-primary)",
        avatar: currentTechnician.avatar,
        detailPath: getScopedTechnicianDynamicPath("technician", currentTechnician)
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

function getCalendarParticipantOptions(
  contacts: ContactRelation[],
  usersById: Record<string, ImUser>,
  conversations: Conversation[]
): CalendarParticipantOption[] {
  return contacts.flatMap((contact) => {
    const identityId = Number(contact.contactIdentityId);
    const user = usersById[contact.targetUserId];

    if (!user || !Number.isInteger(identityId) || identityId <= 0) {
      return [];
    }

    const tags = getCalendarContactTags(contact, user);
    const groupIds = conversations
      .filter((conversation) => conversation.type === "group" && !conversation.isDeleted && conversation.memberIds.includes(contact.targetUserId))
      .map((conversation) => conversation.id);

    return [{
      id: String(identityId),
      identityId,
      label: getDisplayName(user, contact),
      description: [contact.isStarred ? "常用" : "联系人", tags.slice(0, 2).join(" / ")].filter(Boolean).join(" · "),
      avatar: user.avatar,
      tags,
      groupIds,
      isCommon: true,
    }];
  });
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
            avatar: user.avatar,
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
      avatar: conversation.avatar,
      count: conversation.memberIds.length,
      kind: "groups" as const
    }));
}

function getCompleteSyncContactOptions(baseOptions: SyncContactOption[], commonOptions: SyncContactOption[], tagOptions: SyncContactOption[], groupOptions: SyncContactOption[]) {
  return dedupeSyncContactOptions([...commonOptions, ...baseOptions.map((option) => ({ ...option, kind: option.kind ?? "common" as const })), ...tagOptions, ...groupOptions]);
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
  technicians: Technician[],
  orderRows: Order[]
) {
  if (!currentCustomer) {
    return [];
  }

  const customerOrders = orderRows.filter((order) => order.customerId === currentCustomer.id);
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
      avatar: technicians.find((technician) => technician.id === technicianId)?.avatar,
      id: `technician:${technicianId}`,
      label: getTechnicianName(technicians, technicianId),
      description: "技师端"
    })),
    ...Array.from(storeIds).map((storeId): SyncContactOption => ({
      avatar: stores.find((store) => store.id === storeId)?.cover,
      id: `merchant:${storeId}`,
      label: getStoreName(stores, storeId),
      description: "商户端"
    }))
  ]);
}

function getTechnicianSyncContactOptions(
  currentTechnician: UnifiedCalendarTechnician | undefined,
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
      avatar: technician.avatar,
      id: `technician:${technician.id}`,
      label: technician.nickname?.trim() || technician.name,
      description: "技师端"
    }));

  return dedupeSyncContactOptions([
    ...Array.from(storeIds).map((storeId): SyncContactOption => ({
      avatar: stores.find((store) => store.id === storeId)?.cover,
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
    avatar: technician.avatar,
    id: getTechnicianCalendarLaneId(technician.id),
    label: technician.nickname?.trim() || technician.name,
    description: "技师端"
  }));
}

function buildBirthdayEventDate(anchorYear: number, birthday: string) {
  return `${anchorYear}-${birthday.slice(5)}`;
}

function getBirthdayCalendarEvents(
  period: UnifiedCalendarPeriod,
  currentCustomer: Customer | undefined,
  currentTechnician: UnifiedCalendarTechnician | undefined,
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

function normalizeCalendarSearchValue(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeCalendarReminderLabel(value: string) {
  return value.replaceAll("分鐘", "分钟").replaceAll("小時", "小时");
}

function getCalendarSearchFields(event: UnifiedCalendarEvent, view: UnifiedCalendarView) {
  if (view === "agenda") {
    return [
      event.title,
      event.startTime,
      event.endTime,
      event.url,
      `${event.startTime} - ${event.endTime}`,
      sourceConfigs[event.sourceId].label
    ].filter((field): field is string => Boolean(field && field.trim()));
  }

  return [
    event.title,
    event.subtitle,
    event.badge,
    event.date,
    event.url,
    event.date.replaceAll("-", "/"),
    formatLongDate(event.date),
    formatShortDate(event.date),
    event.startTime,
    event.endTime,
    `${event.startTime} - ${event.endTime}`,
    event.calendarLabel,
    event.location,
    event.note,
    event.reminder,
    event.visibility,
    sourceConfigs[event.sourceId].label,
    sourceConfigs[event.sourceId].shortLabel,
    ...(event.syncContactLabels ?? []),
    ...(event.birthdayTags ?? [])
  ].filter((field): field is string => Boolean(field && field.trim()));
}

function matchesCalendarSearch(event: UnifiedCalendarEvent, normalizedQuery: string, view: UnifiedCalendarView) {
  if (!normalizedQuery) {
    return true;
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const haystack = normalizeCalendarSearchValue(getCalendarSearchFields(event, view).join(" "));
  return tokens.every((token) => haystack.includes(token));
}

function createAgendaDateWindow(anchorDate: string): AgendaDateWindow {
  return {
    startDate: addDays(anchorDate, -agendaInitialPastDays),
    endDate: addDays(anchorDate, agendaInitialFutureDays)
  };
}

function getDateRange(startDate: string, endDate: string) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  return Array.from({ length: dayCount }, (_, index) => addDays(startDate, index));
}

function getAgendaDates(window: AgendaDateWindow) {
  return getDateRange(window.startDate, window.endDate);
}

function getThreeDayDates(anchorDate: string) {
  return Array.from({ length: 3 }, (_, index) => addDays(anchorDate, index));
}

function getCalendarPeriod(view: UnifiedCalendarView, anchorDate: string, agendaDateWindow = createAgendaDateWindow(anchorDate)): UnifiedCalendarPeriod {
  if (view === "day") {
    return {
      startDate: anchorDate,
      endDate: anchorDate,
      label: formatLongDate(anchorDate),
      dates: [anchorDate]
    };
  }

  if (view === "threeDay") {
    const dates = getThreeDayDates(anchorDate);
    return {
      startDate: dates[0] ?? anchorDate,
      endDate: dates[dates.length - 1] ?? anchorDate,
      label: `${formatShortDate(dates[0] ?? anchorDate)} - ${formatShortDate(dates[dates.length - 1] ?? anchorDate)}`,
      dates
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
    const dates = getAgendaDates(agendaDateWindow);
    return {
      startDate: agendaDateWindow.startDate,
      endDate: agendaDateWindow.endDate,
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
  if (view === "threeDay") {
    return addDays(anchorDate, direction * 3);
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

export function getBookingConflictEventIds(events: UnifiedCalendarEvent[]): Set<string> {
  const conflicts = new Set<string>();
  const bookings = events.filter((event) => Boolean(event.orderId));
  for (let leftIndex = 0; leftIndex < bookings.length; leftIndex += 1) {
    const left = bookings[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < bookings.length; rightIndex += 1) {
      const right = bookings[rightIndex]!;
      if (left.date !== right.date || left.orderId === right.orderId) continue;
      if (timeToMinutes(left.startTime) < timeToMinutes(right.endTime) && timeToMinutes(right.startTime) < timeToMinutes(left.endTime)) {
        conflicts.add(left.id);
        conflicts.add(right.id);
      }
    }
  }
  return conflicts;
}

function markBookingConflicts(events: UnifiedCalendarEvent[]): UnifiedCalendarEvent[] {
  const conflicts = getBookingConflictEventIds(events);
  return events.map((event) => conflicts.has(event.id) ? { ...event, bookingConflict: true } : event);
}

type TimelineAutoScrollAnchor = {
  eventKey: string;
  startMinute: number;
};

function isFullDayTimelineEvent(event: UnifiedCalendarEvent) {
  const start = timeToMinutes(event.startTime);
  const end = timeToMinutes(event.endTime);

  return start <= dayStartHour * 60 && end >= dayEndHour * 60 - 1;
}

function getTimelineAutoScrollAnchor(events: UnifiedCalendarEvent[], dates: string[]): TimelineAutoScrollAnchor | null {
  const dateSet = new Set(dates);
  const anchorEvent = events
    .filter((event) => dateSet.has(event.date) && !isFullDayTimelineEvent(event))
    .map((event) => ({
      event,
      startMinute: timeToMinutes(event.startTime),
      endMinute: timeToMinutes(event.endTime)
    }))
    .filter(({ startMinute, endMinute }) => endMinute > dayStartHour * 60 && startMinute < dayEndHour * 60)
    .sort((left, right) => (
      left.event.date.localeCompare(right.event.date) ||
      left.startMinute - right.startMinute ||
      left.event.id.localeCompare(right.event.id)
    ))[0];

  if (!anchorEvent) {
    return null;
  }

  return {
    eventKey: `${anchorEvent.event.date}:${anchorEvent.event.id}:${anchorEvent.event.startTime}`,
    startMinute: Math.max(dayStartHour * 60, Math.min(anchorEvent.startMinute, dayEndHour * 60))
  };
}

function getTimelineVerticalScrollContainer(target: HTMLElement) {
  let element = target.parentElement;

  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const canScrollVertically = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;

    if (canScrollVertically) {
      return element;
    }

    element = element.parentElement;
  }

  return document.scrollingElement ?? document.documentElement;
}

function scrollTimelineToFirstEvent(canvas: HTMLElement | null, anchor: TimelineAutoScrollAnchor | null) {
  if (!canvas || !anchor || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const scrollContainer = getTimelineVerticalScrollContainer(canvas);
  const isDocumentScroll = scrollContainer === document.scrollingElement || scrollContainer === document.documentElement || scrollContainer === document.body;
  const containerRectTop = isDocumentScroll ? 0 : scrollContainer.getBoundingClientRect().top;
  const viewportHeight = isDocumentScroll ? window.innerHeight : scrollContainer.clientHeight;
  const currentScrollTop = isDocumentScroll ? scrollContainer.scrollTop || window.scrollY : scrollContainer.scrollTop;
  const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
  const eventTop = ((anchor.startMinute - dayStartHour * 60) / 60) * hourRowHeight + 6;
  const targetCenterOffset = Math.max(160, viewportHeight * 0.5);
  const nextScrollTop = Math.max(
    0,
    Math.min(maxScrollTop, currentScrollTop + canvas.getBoundingClientRect().top - containerRectTop + eventTop - targetCenterOffset)
  );

  scrollContainer.scrollTo({ top: nextScrollTop, behavior: "auto" });
}

function useTimelineFirstEventAutoScroll(autoScrollKey: string, anchor: TimelineAutoScrollAnchor | null, canvasRef: RefObject<HTMLElement | null>) {
  const lastAutoScrollKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!anchor || lastAutoScrollKeyRef.current === autoScrollKey || typeof window === "undefined") {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollTimelineToFirstEvent(canvasRef.current, anchor);
      lastAutoScrollKeyRef.current = autoScrollKey;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [anchor, autoScrollKey, canvasRef]);
}

function getEventStyle(event: UnifiedCalendarEvent): CSSProperties {
  if (event.visibility === "busy_redacted") {
    return {
      "--calendar-accent": "color-mix(in srgb, var(--client-muted) 72%, var(--client-line) 28%)",
      "--calendar-soft": "color-mix(in srgb, var(--client-muted) 18%, var(--client-elevated) 82%)",
      "--calendar-text": "color-mix(in srgb, var(--client-text) 70%, var(--client-muted) 30%)",
      "--calendar-contrast": "var(--client-text)"
    } as CSSProperties;
  }
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
    endDate: event.endDate ?? event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    title: event.title ?? "",
    location: event.location ?? "",
    note: event.note ?? "",
    url: event.url ?? "",
    images,
    reminder: normalizeCalendarReminderLabel(event.reminder ?? "30 分钟前"),
    allDay: Boolean(event.allDay),
    repeatRule: normalizeCalendarRepeatRule(event.repeatRule),
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

async function loadFormalCustomerOrderPeriod(from: Date, to: Date) {
  const maxWindowMs = 93 * 24 * 60 * 60 * 1000;
  const orders = [];
  let cursor = from;

  while (cursor.getTime() < to.getTime()) {
    const next = new Date(Math.min(cursor.getTime() + maxWindowMs, to.getTime()));
    orders.push(...await loadCustomerOrderWindow(cursor, next));
    cursor = next;
  }

  return orders;
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
  googleConnectionStatus,
  googleSyncEventCount,
  formalOnly,
  open,
  sourceCounts,
  sourceVisibility,
  onGoogleConnect,
  onGoogleExport,
  onGoogleImport,
  onGoogleStatusRefresh,
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
  googleConnectionStatus: GoogleCalendarConnectionStatus | null;
  googleSyncEventCount: number;
  formalOnly: boolean;
  open: boolean;
  sourceCounts: Record<UnifiedCalendarSourceId, number>;
  sourceVisibility: Record<UnifiedCalendarSourceId, boolean>;
  onGoogleConnect: () => Promise<GoogleCalendarSyncActionResult>;
  onGoogleExport: () => Promise<GoogleCalendarSyncActionResult>;
  onGoogleImport: () => Promise<GoogleCalendarSyncActionResult>;
  onGoogleStatusRefresh: () => Promise<GoogleCalendarConnectionStatus>;
  onBirthdayExpandToggle: () => void;
  onBirthdayContactQueryChange: (query: string) => void;
  onBirthdayContactToggle: (contactId: string) => void;
  onBirthdayFilterToggle: (key: "self" | "contacts") => void;
  onBirthdayTagToggle: (tag: string) => void;
  onClose: () => void;
  onToggle: (sourceId: UnifiedCalendarSourceId) => void;
}) {
  const [googleSyncExpanded, setGoogleSyncExpanded] = useState(false);
  const [googleSyncMessage, setGoogleSyncMessage] = useState("");
  const [googleSyncBusy, setGoogleSyncBusy] = useState<"status" | "connect" | "export" | "import" | null>(null);

  useEffect(() => {
    if (!open || !googleSyncExpanded) {
      return;
    }

    let cancelled = false;
    setGoogleSyncBusy("status");
    onGoogleStatusRefresh()
      .then((status) => {
        if (!cancelled) {
          setGoogleSyncMessage(status.message);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setGoogleSyncMessage(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGoogleSyncBusy(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [googleSyncExpanded, open]);

  if (!open) {
    return null;
  }

  const runGoogleAction = async (busyKey: "connect" | "export" | "import", action: () => Promise<GoogleCalendarSyncActionResult>) => {
    if (googleSyncBusy) {
      return;
    }

    setGoogleSyncBusy(busyKey);
    try {
      const result = await action();
      setGoogleSyncMessage(result.message);
    } catch (error) {
      setGoogleSyncMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setGoogleSyncBusy(null);
    }
  };
  const googleConnected = Boolean(googleConnectionStatus?.connected);

  return (
    <>
      <button
        aria-label="关闭日历来源遮罩"
        className="fixed inset-0 z-[145] bg-[color:color-mix(in_srgb,var(--client-bg)_40%,transparent)] backdrop-blur-md"
        onClick={onClose}
        type="button"
      />
      <aside className="client-nav-aligned-panel fixed left-1/2 top-1/2 z-[150] max-h-[calc(100dvh-64px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_96%,transparent)] shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl" role="menu">
        <div className="flex items-center justify-between border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3.5 py-3">
          <div>
            <strong className="block text-sm font-black text-[color:var(--client-text)]">日历来源</strong>
            <span className="mt-1 block text-[10px] font-black text-[color:var(--client-muted)]">选择显示在当前视图里的行程</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-expanded={googleSyncExpanded}
              aria-label="同步 Google 日历"
              className={cn(floatingHeaderControlButtonClassName, "h-11 w-11 p-2")}
              onClick={() => {
                if (formalOnly) {
                  void runGoogleAction("connect", onGoogleConnect);
                  return;
                }
                setGoogleSyncExpanded((current) => !current);
              }}
              type="button"
            >
              <img alt="" className="h-6 w-6 object-contain" src={googleCalendarIconSrc} />
            </button>
            <MobileFullscreenCloseButton label="关闭日历来源" onClose={onClose} />
          </div>
        </div>

        {googleSyncExpanded ? (
          <section className="border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3.5 py-3">
            <div className="grid gap-2">
              {googleConnected ? (
                <>
                  <button
                    className="focus-ring flex min-h-[58px] items-center gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-3 text-left disabled:opacity-55"
                    disabled={Boolean(googleSyncBusy)}
                    onClick={() => runGoogleAction("export", onGoogleExport)}
                    type="button"
                  >
                    <img alt="" className="h-8 w-8 shrink-0 object-contain" src={googleCalendarIconSrc} />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-[12px] font-black text-[color:var(--client-text)]">NeeDo → Google 日历</strong>
                      <span className="mt-0.5 block text-[10px] font-bold leading-4 text-[color:var(--client-muted)]">通过接口同步当前视图 {googleSyncEventCount} 件行程</span>
                    </span>
                  </button>
                  <button
                    className="focus-ring flex min-h-[58px] items-center gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-3 text-left disabled:opacity-55"
                    disabled={Boolean(googleSyncBusy)}
                    onClick={() => runGoogleAction("import", onGoogleImport)}
                    type="button"
                  >
                    <img alt="" className="h-8 w-8 shrink-0 object-contain" src={googleCalendarIconSrc} />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-[12px] font-black text-[color:var(--client-text)]">Google 日历 → NeeDo</strong>
                      <span className="mt-0.5 block text-[10px] font-bold leading-4 text-[color:var(--client-muted)]">通过接口拉取当前日期范围的行程</span>
                    </span>
                  </button>
                  {googleSyncMessage ? (
                    <p className="rounded-[14px] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)] px-3 py-2 text-[10px] font-bold leading-4 text-[color:var(--client-muted)]">
                      {googleSyncBusy ? "处理中：" : ""}{googleSyncMessage}
                    </p>
                  ) : null}
                </>
              ) : (
                <button
                  className="focus-ring flex min-h-[58px] items-center gap-3 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 text-left disabled:opacity-55"
                  disabled={Boolean(googleSyncBusy)}
                  onClick={() => runGoogleAction("connect", onGoogleConnect)}
                  type="button"
                >
                  <img alt="" className="h-8 w-8 shrink-0 object-contain" src={googleAccountIconSrc} />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[12px] font-black text-[color:var(--client-text)]">连接 Google 账号</strong>
                    <span className="mt-0.5 block text-[10px] font-bold leading-4 text-[color:var(--client-muted)]">前往设置页面加入 Google 账号绑定</span>
                  </span>
                </button>
              )}
            </div>
          </section>
        ) : null}

        <div className="max-h-[calc(100dvh-220px)] space-y-4 overflow-y-auto px-3.5 py-3">
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
    </>
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
  const badgeLabel =
    event.visibility === "busy_redacted" || event.scheduleSlotId != null || event.orderId != null
      ? event.badge
      : compact
        ? source.shortLabel
        : event.badge;
  return (
    <button
      className={cn(
        "focus-ring h-full w-full overflow-hidden rounded-[16px] border px-3 py-2.5 text-left shadow-[0_12px_24px_color-mix(in_srgb,var(--calendar-accent)_12%,transparent)] transition active:scale-[0.99]",
        event.bookingConflict
          ? "border-2 border-red-500 bg-[color:color-mix(in_srgb,#ef4444_12%,var(--client-elevated))] shadow-[0_12px_26px_rgba(239,68,68,0.28)]"
          : "border-[color:color-mix(in_srgb,var(--calendar-accent)_38%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--calendar-soft)_88%,var(--client-elevated)),color-mix(in_srgb,var(--client-elevated)_88%,transparent))]"
      )}
      data-booking-conflict={event.bookingConflict ? "true" : undefined}
      data-calendar-event-card="true"
      onClick={() => onOpen(event)}
      style={getEventStyle(event)}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--calendar-accent)]" />
        <span className={cn("truncate text-[11px] font-black", event.bookingConflict ? "text-red-500" : "text-[color:var(--calendar-text)]")}>{event.bookingConflict ? "预约冲突" : badgeLabel}</span>
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

export function UnifiedCalendarEventCard({
  event,
  compact = false,
  onOpen
}: {
  event: UnifiedCalendarEvent;
  compact?: boolean;
  onOpen: (event: UnifiedCalendarEvent) => void;
}) {
  return <CalendarEventCard compact={compact} event={event} onOpen={onOpen} />;
}

function CalendarLaneAvatar({ calendar, floating = false }: { calendar: UnifiedCalendarLane; floating?: boolean }) {
  const avatarClassName = cn(
    floating ? "h-11 w-11" : "h-10 w-10",
    "border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] shadow-[0_8px_18px_rgba(0,0,0,0.16)]"
  );

  return (
    <span className="relative shrink-0">
      {calendar.avatar ? (
        <AvatarImage
          alt={calendar.label}
          className={avatarClassName}
          src={calendar.avatar}
          style={floating ? { borderRadius: 14 } : undefined}
        />
      ) : (
        <span
          className={cn(
            "inline-flex items-center justify-center border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[12px] font-black text-[color:var(--client-muted)]",
            floating ? "h-11 w-11 rounded-[14px]" : "h-10 w-10 avatar-shape"
          )}
        >
          {calendar.label.slice(0, 1)}
        </span>
      )}
      {calendar.onRemove ? (
        <button
          aria-label={`删除${calendar.label}`}
          className="focus-ring absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[color:var(--client-elevated)] bg-[color:var(--client-primary)] text-[12px] font-black leading-none text-[color:var(--client-primary-contrast)] shadow-[0_5px_12px_rgba(0,0,0,0.24)]"
          data-calendar-participant-remove="true"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            calendar.onRemove?.();
          }}
          type="button"
        >
          ×
        </button>
      ) : (
        <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[color:var(--client-elevated)]" style={{ backgroundColor: calendar.accent }} />
      )}
    </span>
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
    cappedLaneCount: Math.max(1, Math.min(3, lanes.length)),
    laneCount: Math.max(1, lanes.length),
    events: laidOut
  };
}

function isAvailabilityMarkerEvent(event: UnifiedCalendarEvent) {
  return Boolean(event.availabilityWindowId)
    || Boolean(event.availabilitySourceType && !event.orderId)
    || Boolean(event.scheduleSlotId && !event.orderId && (event.availabilitySourceType || event.badge === "可预约"));
}

function getAvailabilityStripLabel(event: UnifiedCalendarEvent) {
  if (event.availabilitySourceType !== "shop") {
    return "自由排班";
  }

  const shopNameFromTitle = event.title.match(/^(.*?)店铺排班/)?.[1]?.trim();
  const shopName = shopNameFromTitle || event.calendarLabel?.trim() || "店铺";
  return `${shopName}排班`;
}

function mergeAvailabilityStripEvents(events: UnifiedCalendarEvent[]) {
  const merged: UnifiedCalendarEvent[] = [];
  const sorted = [...events].sort((left, right) => {
    const laneComparison = (left.calendarId ?? "user:me").localeCompare(right.calendarId ?? "user:me");
    return laneComparison || timeToMinutes(left.startTime) - timeToMinutes(right.startTime);
  });

  sorted.forEach((event) => {
    const previous = merged.at(-1);
    const sameLane = previous && (previous.calendarId ?? "user:me") === (event.calendarId ?? "user:me");
    const sameSource = previous && getAvailabilityStripLabel(previous) === getAvailabilityStripLabel(event);
    const touchesPrevious = previous && timeToMinutes(event.startTime) <= timeToMinutes(previous.endTime);

    if (previous && sameLane && sameSource && touchesPrevious) {
      if (timeToMinutes(event.endTime) > timeToMinutes(previous.endTime)) {
        previous.endTime = event.endTime;
      }
      return;
    }

    merged.push({ ...event });
  });

  return merged;
}

function CalendarAvailabilityStrip({
  event,
  onOpen,
  style
}: {
  event: UnifiedCalendarEvent;
  onOpen: (event: UnifiedCalendarEvent) => void;
  style: CSSProperties;
}) {
  const label = getAvailabilityStripLabel(event);

  return (
    <button
      aria-label={`${event.startTime}-${event.endTime} ${label}`}
      className="focus-ring absolute z-[12] overflow-hidden rounded-[9px] border border-emerald-200/80 bg-emerald-400/90 text-emerald-950 shadow-[0_0_16px_rgba(52,211,153,0.42)]"
      data-calendar-availability-strip="true"
      data-calendar-availability-source={event.availabilitySourceType ?? "technician"}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onOpen(event);
      }}
      style={{ ...style, width: `${availabilityStripWidth}px` }}
      title={`${event.startTime} - ${event.endTime} ${label}`}
      type="button"
    >
      <span
        aria-hidden="true"
        className="flex h-full w-full items-center overflow-hidden px-1 py-1.5 text-[9px] font-black leading-none"
        style={{ letterSpacing: 0, textOrientation: "upright", writingMode: "vertical-rl" }}
      >
        {label}
      </span>
    </button>
  );
}

export type UnifiedCalendarDraftRange = {
  start: number;
  end: number;
};

type DraftRange = UnifiedCalendarDraftRange;

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

type DayTimelineProps = {
  calendarLanes?: UnifiedCalendarLane[];
  date: string;
  draftConflictCalendarIds?: Set<string>;
  draftRangeValue?: UnifiedCalendarDraftRange | null;
  emptySearchQuery?: string;
  events: UnifiedCalendarEvent[];
  onDraftRangeChange?: (range: UnifiedCalendarDraftRange) => void;
  onCreate?: (date: string, startTime: string, endTime: string, calendarId?: string, calendarLabel?: string) => void;
  onOpen: (event: UnifiedCalendarEvent) => void;
  spanDraftAcrossLanes?: boolean;
};

function DayTimeline({
  calendarLanes,
  date,
  draftConflictCalendarIds,
  draftRangeValue,
  emptySearchQuery,
  events,
  onDraftRangeChange,
  onCreate,
  onOpen,
  spanDraftAcrossLanes = false
}: DayTimelineProps) {
  const now = new Date();
  const today = getTodayDateKey();
  const activeCalendarLanes = calendarLanes?.length ? calendarLanes : null;
  const hasParallelCalendars = Boolean(activeCalendarLanes?.length);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const timelineRootRef = useRef<HTMLDivElement | null>(null);
  const timelineHeaderRef = useRef<HTMLDivElement | null>(null);
  const [internalDraftRange, setInternalDraftRange] = useState<DraftRange | null>(null);
  const draftRange = draftRangeValue === undefined ? internalDraftRange : draftRangeValue;
  const setDraftRange = (range: DraftRange | null) => {
    if (draftRangeValue === undefined) {
      setInternalDraftRange(range);
    }
    if (range) {
      onDraftRangeChange?.(range);
    }
  };
  const [draftCalendarId, setDraftCalendarId] = useState(activeCalendarLanes?.[0]?.id ?? "user:me");
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [floatingLaneFrame, setFloatingLaneFrame] = useState({ left: 0, top: 0, width: 0, visible: false });
  const draftRangeRef = useRef<DraftRange | null>(null);
  const dragModeRef = useRef<DraftDragMode | null>(null);
  const dragBaseRangeRef = useRef<DraftRange | null>(null);
  const dragPointerStartRef = useRef<number | null>(null);
  const pointerDownMinuteRef = useRef<number | null>(null);
  const suppressNextCanvasClickRef = useRef(false);
  const suppressNextOutsideClickRef = useRef(false);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = date === today && nowMinutes >= dayStartHour * 60 && nowMinutes <= dayEndHour * 60;
  const availabilityEvents = mergeAvailabilityStripEvents(events.filter(isAvailabilityMarkerEvent));
  const contentEvents = events.filter((event) => !isAvailabilityMarkerEvent(event));
  const layout = getLayoutEvents(contentEvents);
  const handleTimelineScrollLeftChange = useCallback((scrollLeft: number) => {
    setTimelineScrollLeft((current) => (Math.abs(current - scrollLeft) < 0.5 ? current : scrollLeft));
  }, []);
  const { scrollRef, dragScrollProps } = useHorizontalDragScroll({ onScrollLeftChange: handleTimelineScrollLeftChange });
  const parallelLayouts = activeCalendarLanes
    ? activeCalendarLanes.flatMap((calendar, calendarIndex) => {
        const calendarLayout = getLayoutEvents(contentEvents.filter((event) => (event.calendarId ?? "user:me") === calendar.id));
        return calendarLayout.events.map((item) => ({
          ...item,
          calendar,
          calendarIndex,
          calendarLaneCount: calendarLayout.cappedLaneCount
        }));
      })
    : [];
  const totalHeight = (dayEndHour - dayStartHour) * hourRowHeight;
  const parallelMinWidth = activeCalendarLanes ? Math.max(320, activeCalendarLanes.length * timelineLaneMinWidth) : 0;
  const hasOverflowLayout = !hasParallelCalendars && layout.laneCount > layout.cappedLaneCount;
  const hasHorizontalTimeline = hasParallelCalendars || hasOverflowLayout;
  const overflowContentMinWidth = hasOverflowLayout ? Math.max(320, layout.laneCount * timelineOverflowLaneWidth + 16) : 0;
  const timelineMinWidth = hasParallelCalendars
    ? parallelMinWidth + timelineTimeColumnWidth
    : hasOverflowLayout
      ? overflowContentMinWidth + timelineTimeColumnWidth
      : undefined;
  const overflowDraftViewportWidth = timelineViewportWidth || (typeof window === "undefined" ? 390 : Math.max(0, window.innerWidth - 32));
  const visibleOverflowDraftWidth = hasOverflowLayout
    ? Math.max(
        176,
        Math.min(
          overflowContentMinWidth - 16,
          overflowDraftViewportWidth - timelineTimeColumnWidth - 16
        )
      )
    : undefined;
  const timelineAutoScrollAnchor = useMemo(() => getTimelineAutoScrollAnchor(events, [date]), [date, events]);
  const dayTimelineAutoScrollKey = timelineAutoScrollAnchor ? `${date}:${timelineAutoScrollAnchor.eventKey}` : `${date}:empty`;

  useTimelineFirstEventAutoScroll(dayTimelineAutoScrollKey, timelineAutoScrollAnchor, canvasRef);

  useEffect(() => {
    draftRangeRef.current = draftRange;
  }, [draftRange]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const isDraftInteractionTarget = (target: EventTarget | null) => {
      const element =
        target instanceof HTMLElement
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      return Boolean(element?.closest("[data-schedule-draft-range-block],[data-schedule-range-handle],[data-schedule-create-action]"));
    };

    const resetDraftInteraction = () => {
      dragModeRef.current = null;
      dragPointerStartRef.current = null;
      dragBaseRangeRef.current = null;
      pointerDownMinuteRef.current = null;
    };

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (draftRangeValue !== undefined || !draftRangeRef.current || isDraftInteractionTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressNextCanvasClickRef.current = true;
      suppressNextOutsideClickRef.current = true;
      window.setTimeout(() => {
        suppressNextCanvasClickRef.current = false;
        suppressNextOutsideClickRef.current = false;
      }, 180);
      resetDraftInteraction();
      setDraftRange(null);
    };

    const handleOutsideClick = (event: MouseEvent) => {
      if (!suppressNextOutsideClickRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressNextCanvasClickRef.current = false;
      suppressNextOutsideClickRef.current = false;
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    document.addEventListener("click", handleOutsideClick, true);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      document.removeEventListener("click", handleOutsideClick, true);
    };
  }, [draftRangeValue]);

  useEffect(() => {
    if (!hasOverflowLayout) {
      setTimelineViewportWidth((current) => (current === 0 ? current : 0));
      return undefined;
    }

    const root = timelineRootRef.current;
    if (!root) {
      return undefined;
    }

    const updateTimelineViewportWidth = () => {
      setTimelineViewportWidth((current) => {
        const next = root.clientWidth;
        return Math.abs(current - next) < 0.5 ? current : next;
      });
    };

    updateTimelineViewportWidth();

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(updateTimelineViewportWidth);
      resizeObserver.observe(root);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateTimelineViewportWidth);
    return () => window.removeEventListener("resize", updateTimelineViewportWidth);
  }, [hasOverflowLayout]);

  useEffect(() => {
    if (!hasParallelCalendars) {
      setFloatingLaneFrame((current) => (current.visible ? { ...current, visible: false } : current));
      return undefined;
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    let frameId = 0;
    const updateFloatingLaneFrame = () => {
      frameId = 0;
      const root = timelineRootRef.current;
      const header = timelineHeaderRef.current;

      if (!root || !header) {
        setFloatingLaneFrame((current) => (current.visible ? { ...current, visible: false } : current));
        return;
      }

      const rootRect = root.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const topFixedLayerBottom = Array.from(document.querySelectorAll<HTMLElement>(".fixed")).reduce((bottom, element) => {
        if (element.hasAttribute("data-calendar-floating-lane-rail")) {
          return bottom;
        }

        const rect = element.getBoundingClientRect();
        if (rect.top > 8 || rect.bottom < 48 || rect.bottom > viewportHeight * 0.42) {
          return bottom;
        }

        return Math.max(bottom, rect.bottom);
      }, 0);
      const stickyTop = topFixedLayerBottom > 0
        ? Math.round(topFixedLayerBottom + 8)
        : Math.max(88, Math.min(108, Math.round(viewportHeight * 0.1)));
      const left = Math.max(12, Math.round(rootRect.left));
      const right = Math.min(viewportWidth - 12, Math.round(rootRect.right));
      const width = Math.max(0, right - left);
      const visible =
        headerRect.bottom <= stickyTop + 6 &&
        rootRect.bottom > stickyTop + 74 &&
        rootRect.top < viewportHeight - 120 &&
        width > timelineTimeColumnWidth + 80;
      const nextFrame = {
        left,
        top: stickyTop,
        width,
        visible
      };

      setFloatingLaneFrame((current) => (
        current.visible === nextFrame.visible &&
        current.left === nextFrame.left &&
        current.top === nextFrame.top &&
        current.width === nextFrame.width
          ? current
          : nextFrame
      ));
    };

    const scheduleFloatingFrameUpdate = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(updateFloatingLaneFrame);
    };

    scheduleFloatingFrameUpdate();
    const scrollOptions = { capture: true, passive: true } as AddEventListenerOptions;
    document.addEventListener("scroll", scheduleFloatingFrameUpdate, scrollOptions);
    window.addEventListener("resize", scheduleFloatingFrameUpdate);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      document.removeEventListener("scroll", scheduleFloatingFrameUpdate, true);
      window.removeEventListener("resize", scheduleFloatingFrameUpdate);
    };
  }, [activeCalendarLanes?.length, hasParallelCalendars]);

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
    if (!onCreate) {
      pointerDownMinuteRef.current = null;
      return;
    }

    if ((event.button !== 0 && event.pointerType === "mouse") || isInteractiveTarget(event.target)) {
      pointerDownMinuteRef.current = null;
      return;
    }

    pointerDownMinuteRef.current = getDraftPointerMinute(event, event.currentTarget);
    setDraftCalendarId(getPointerCalendarId(event, event.currentTarget));
  };

  const handleCanvasClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onCreate) {
      pointerDownMinuteRef.current = null;
      return;
    }

    if (suppressNextCanvasClickRef.current) {
      suppressNextCanvasClickRef.current = false;
      pointerDownMinuteRef.current = null;
      return;
    }

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
    if (!draftRange || !onCreate) {
      return;
    }

    const draftLane = activeCalendarLanes?.find((calendar) => calendar.id === draftCalendarId);
    onCreate(date, minutesToTime(draftRange.start), minutesToTime(draftRange.end), draftLane?.id, draftLane?.label);
    setDraftRange(null);
  };

  const draftCalendarIndex = Math.max(0, activeCalendarLanes?.findIndex((calendar) => calendar.id === draftCalendarId) ?? 0);
  const parallelColumnWidth = activeCalendarLanes?.length ? 100 / activeCalendarLanes.length : 100;
  const renderFloatingLaneButton = (calendar: UnifiedCalendarLane) => {
    const buttonClassName =
      "focus-ring pointer-events-auto flex h-[54px] w-[54px] items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] shadow-[0_12px_26px_rgba(0,0,0,0.26)] backdrop-blur-xl transition active:scale-95";

    return (
      <div className="flex min-w-[136px] flex-1 items-center justify-center" key={calendar.id}>
        {calendar.detailPath ? (
          <Link
            aria-label={`浮动查看${calendar.label}详情`}
            className={buttonClassName}
            data-calendar-floating-lane-button="true"
            to={calendar.detailPath}
          >
            <CalendarLaneAvatar calendar={calendar} floating />
          </Link>
        ) : (
          <div aria-label={calendar.label} className={buttonClassName} data-calendar-floating-lane-button="true">
            <CalendarLaneAvatar calendar={calendar} floating />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="overflow-visible rounded-none border-0 bg-transparent"
      data-calendar-day-timeline="true"
      ref={timelineRootRef}
    >
      <CalendarHolidayNameStrip date={date} />
      {floatingLaneFrame.visible && hasParallelCalendars && activeCalendarLanes ? (
        <div
          className="pointer-events-none fixed z-[30]"
          data-calendar-floating-lane-rail="true"
          style={{ left: floatingLaneFrame.left, top: floatingLaneFrame.top, width: floatingLaneFrame.width }}
        >
          <div
            className="overflow-hidden"
            style={{
              marginLeft: timelineTimeColumnWidth,
              width: Math.max(0, floatingLaneFrame.width - timelineTimeColumnWidth)
            }}
          >
            <div
              className="flex h-14 items-center"
              style={{
                minWidth: parallelMinWidth,
                transform: `translateX(${-timelineScrollLeft}px)`
              }}
            >
              {activeCalendarLanes.map((calendar) => renderFloatingLaneButton(calendar))}
            </div>
          </div>
        </div>
      ) : null}
      <div
        className={cn("min-w-0", hasHorizontalTimeline && "scrollbar-none cursor-grab overflow-x-auto overflow-y-visible overscroll-x-contain active:cursor-grabbing")}
        data-calendar-day-timeline-scroll="true"
        ref={hasHorizontalTimeline ? scrollRef : undefined}
        style={hasHorizontalTimeline ? { touchAction: "pan-y" } : undefined}
        {...(hasHorizontalTimeline ? dragScrollProps : {})}
      >
        <div style={timelineMinWidth ? { minWidth: timelineMinWidth } : undefined}>
          {hasParallelCalendars && activeCalendarLanes ? (
            <div
              className="flex border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)]"
              data-calendar-lane-header="true"
              ref={timelineHeaderRef}
            >
              <div
                className="sticky left-0 z-[12] shrink-0 border-r border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-transparent"
                data-calendar-time-corner="true"
                style={{ width: timelineTimeColumnWidth }}
              />
              <div className="flex min-w-0 flex-1" data-calendar-lane-header-track="true">
                {activeCalendarLanes.map((calendar) => {
                  const content = (
                    <>
                      <CalendarLaneAvatar calendar={calendar} />
                      <span className="min-w-0">
                        <strong className="block truncate text-[12px] font-black text-[color:var(--client-text)]">{calendar.label}</strong>
                        {calendar.caption ? <span className="mt-0.5 block truncate text-[10px] font-black text-[color:var(--client-muted)]">{calendar.caption}</span> : null}
                      </span>
                    </>
                  );
                  const laneClassName = cn(
                    "focus-ring flex min-h-[68px] min-w-[136px] flex-1 items-center gap-2 border-r border-[color:color-mix(in_srgb,var(--client-line)_46%,transparent)] px-2.5 py-2 text-left transition last:border-r-0",
                    calendar.centerHeader && "flex-col justify-center gap-1 text-center",
                    calendar.detailPath ? "hover:bg-[color:color-mix(in_srgb,var(--client-primary-soft)_34%,transparent)] active:brightness-95" : "cursor-default"
                  );

                  return calendar.detailPath ? (
                    <Link aria-label={`查看${calendar.label}详情`} className={laneClassName} data-calendar-lane-heading="true" key={calendar.id} to={calendar.detailPath}>
                      {content}
                    </Link>
                  ) : (
                    <div aria-label={calendar.label} className={laneClassName} data-calendar-lane-heading="true" key={calendar.id}>
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="flex" data-calendar-timeline-body="true">
            <div
              className="sticky left-0 z-[12] shrink-0 border-r border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-transparent shadow-none"
              data-calendar-time-column="true"
              style={{ width: timelineTimeColumnWidth }}
            >
              {Array.from({ length: dayEndHour - dayStartHour }, (_, index) => {
                const hour = dayStartHour + index;
                return (
                  <div
                    className="flex items-start justify-center border-b border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] px-1 pt-2 last:border-b-0"
                    data-calendar-time-row="true"
                    key={hour}
                    style={{ height: hourRowHeight }}
                  >
                    <span
                      className="inline-flex h-6 min-w-[50px] items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] px-1 text-[10px] font-black leading-none text-[color:var(--client-muted)] shadow-[0_8px_16px_rgba(0,0,0,0.12)]"
                      data-calendar-time-tag="true"
                    >
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="relative min-w-0 flex-1 touch-pan-y" data-calendar-time-canvas="true" onClick={handleCanvasClick} onPointerDown={handleCanvasPointerDown} ref={canvasRef} style={{ height: totalHeight }}>
              {Array.from({ length: dayEndHour - dayStartHour }, (_, index) => (
                <div
                  className="absolute inset-x-0 border-b border-[color:color-mix(in_srgb,var(--client-line)_46%,transparent)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary-soft)_38%,transparent)]"
                  data-calendar-hour-line="true"
                  key={index}
                  style={{ top: index * hourRowHeight, height: hourRowHeight }}
                />
              ))}

              {hasParallelCalendars && activeCalendarLanes
                ? activeCalendarLanes.map((calendar, index) => (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 border-l border-[color:color-mix(in_srgb,var(--client-line)_38%,transparent)]"
                      data-calendar-lane-line="true"
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

              {emptySearchQuery && events.length === 0 ? (
                <div className="pointer-events-none absolute left-3 right-3 top-3 z-[3] rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-3 py-2.5 text-center shadow-[0_14px_28px_rgba(0,0,0,0.12)] backdrop-blur-md">
                  <strong className="block text-[12px] font-black text-[color:var(--client-text)]">没有符合「{emptySearchQuery}」的行程</strong>
                  <span className="mt-1 block text-[10px] font-bold text-[color:var(--client-muted)]">清空搜索后会恢复全部排班。</span>
                </div>
              ) : null}

              {draftRange && hasParallelCalendars && activeCalendarLanes
                ? activeCalendarLanes.map((calendar, index) => draftConflictCalendarIds?.has(calendar.id) ? (
                    <div
                      aria-label={`${calendar.label}时间冲突`}
                      className="pointer-events-none absolute z-[8] border-y border-red-400 bg-red-500/12"
                      data-calendar-conflict-lane="true"
                      key={`draft-conflict-${calendar.id}`}
                      style={{
                        left: `${index * parallelColumnWidth}%`,
                        width: `${parallelColumnWidth}%`,
                        top: ((draftRange.start - dayStartHour * 60) / 60) * hourRowHeight,
                        height: Math.max(((draftRange.end - draftRange.start) / 60) * hourRowHeight, scheduleDraftRangeVisualMinHeight),
                      }}
                    />
                  ) : null)
                : null}

              {availabilityEvents.map((event) => {
                const start = Math.max(timeToMinutes(event.startTime), dayStartHour * 60);
                const end = Math.min(timeToMinutes(event.endTime), dayEndHour * 60);
                if (end <= start) return null;
                const calendarIndex = activeCalendarLanes?.findIndex((calendar) => calendar.id === (event.calendarId ?? "user:me")) ?? -1;
                if (hasParallelCalendars && calendarIndex < 0) return null;
                return (
                  <CalendarAvailabilityStrip
                    event={event}
                    key={`availability-strip-${event.id}`}
                    onOpen={onOpen}
                    style={{
                      left: hasParallelCalendars ? `calc(${calendarIndex * parallelColumnWidth}% + ${availabilityStripInset}px)` : `${availabilityStripInset}px`,
                      top: ((start - dayStartHour * 60) / 60) * hourRowHeight + 4,
                      height: Math.max(((end - start) / 60) * hourRowHeight - 8, 18),
                    }}
                  />
                );
              })}

              {hasParallelCalendars
                ? parallelLayouts.map(({ event, start, end, lane, calendarIndex, calendarLaneCount }) => {
                    const calendarHasAvailability = availabilityEvents.some((availability) => availability.calendarId === event.calendarId);
                    const contentStart = calendarHasAvailability ? availabilityContentOffset : 8;
                    const contentGutters = calendarHasAvailability ? availabilityContentOffset + 8 : 16;
                    const width =
                      calendarLaneCount > 1
                        ? `calc((${parallelColumnWidth}% - ${contentGutters}px) / ${calendarLaneCount})`
                        : `calc(${parallelColumnWidth}% - ${contentGutters}px)`;
                    const left =
                      calendarLaneCount > 1
                        ? `calc(${calendarIndex * parallelColumnWidth}% + ${contentStart}px + ${Math.min(lane, calendarLaneCount - 1)} * ((${parallelColumnWidth}% - ${contentGutters}px) / ${calendarLaneCount}))`
                        : `calc(${calendarIndex * parallelColumnWidth}% + ${contentStart}px)`;
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
                    const laneCount = hasOverflowLayout ? layout.laneCount : layout.cappedLaneCount;
                    const displayLane = hasOverflowLayout ? lane : Math.min(lane, laneCount - 1);
                    const availabilityOffset = availabilityEvents.length > 0 ? availabilityContentOffset - 8 : 0;
                    const width = hasOverflowLayout
                      ? timelineOverflowLaneWidth - 12
                      : laneCount > 1 ? `calc((100% - ${18 + availabilityOffset}px) / ${laneCount})` : `calc(100% - ${16 + availabilityOffset}px)`;
                    const left = hasOverflowLayout
                      ? 8 + availabilityOffset + displayLane * timelineOverflowLaneWidth
                      : laneCount > 1 ? `calc(${8 + availabilityOffset}px + ${displayLane} * ((100% - ${18 + availabilityOffset}px) / ${laneCount}))` : `${8 + availabilityOffset}px`;
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

              {(onCreate || onDraftRangeChange) && draftRange ? (
                <ScheduleDraftRangeBlock
                  action={onCreate && !spanDraftAcrossLanes ? (
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
                  ) : undefined}
                  className={hasParallelCalendars || hasOverflowLayout ? "" : "left-2 right-2"}
                  conflict={Boolean(draftConflictCalendarIds?.size)}
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
                    height: Math.max(((draftRange.end - draftRange.start) / 60) * hourRowHeight - 12, scheduleDraftRangeVisualMinHeight),
                    ...(spanDraftAcrossLanes
                      ? {
                          left: "8px",
                          width: "calc(100% - 16px)"
                        }
                      : hasParallelCalendars
                      ? {
                          left: `calc(${draftCalendarIndex * parallelColumnWidth}% + 8px)`,
                          width: `calc(${parallelColumnWidth}% - 16px)`
                        }
                      : hasOverflowLayout
                        ? {
                            left: timelineScrollLeft + 8,
                            width: visibleOverflowDraftWidth
                          }
                      : {})
                  }}
                  subtitle="拖动整块调整开始时间，拖动上下手柄调整时长"
                  timeRange={`${minutesToTime(draftRange.start)} - ${minutesToTime(draftRange.end)}`}
                  title={draftConflictCalendarIds?.size ? "时间冲突（仍可继续）" : "新建行程"}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UnifiedCalendarDayTimeline(props: DayTimelineProps) {
  return <DayTimeline {...props} />;
}

function CalendarTimelineEventPill({
  event,
  dense = false,
  onOpen
}: {
  event: UnifiedCalendarEvent;
  dense?: boolean;
  onOpen: (event: UnifiedCalendarEvent) => void;
}) {
  const denseLabelStyle = dense
    ? ({
        letterSpacing: 0,
        textOrientation: "upright",
        writingMode: "vertical-rl"
      } satisfies CSSProperties)
    : undefined;

  return (
    <button
      className={cn(
        "focus-ring h-full w-full overflow-hidden rounded-[8px] border font-black shadow-[0_8px_16px_color-mix(in_srgb,var(--calendar-accent)_14%,transparent)] transition active:scale-[0.99]",
        "border-[color:color-mix(in_srgb,var(--calendar-accent)_46%,transparent)] bg-[color:color-mix(in_srgb,var(--calendar-accent)_78%,var(--client-elevated)_22%)] text-[color:var(--calendar-contrast)]",
        dense ? "grid place-items-center px-0.5 py-1 text-center text-[8px] leading-[9px]" : "px-2 py-1.5 text-left text-[11px] leading-[1.05]"
      )}
      onClick={() => onOpen(event)}
      style={getEventStyle(event)}
      title={`${event.startTime} - ${event.endTime} ${event.title}`}
      type="button"
    >
      <span className={cn("block max-h-full overflow-hidden", dense ? "max-w-full" : "truncate")} style={denseLabelStyle}>{event.title}</span>
    </button>
  );
}

type MultiDayTimelineProps = {
  dates: string[];
  emptySearchQuery?: string;
  events: UnifiedCalendarEvent[];
  onCreate?: (date: string, startTime: string, endTime: string) => void;
  onOpen: (event: UnifiedCalendarEvent) => void;
  onSelectDate?: (date: string) => void;
  selectedDate?: string;
};

type MultiDayDraftRange = DraftRange & {
  date: string;
};

export function UnifiedCalendarMultiDayTimeline({
  dates,
  emptySearchQuery,
  events,
  onCreate,
  onOpen,
  onSelectDate,
  selectedDate
}: MultiDayTimelineProps) {
  const today = getTodayDateKey();
  const groupedEvents = groupEventsByDate(events);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [draftRange, setDraftRange] = useState<MultiDayDraftRange | null>(null);
  const draftRangeRef = useRef<MultiDayDraftRange | null>(null);
  const dragModeRef = useRef<DraftDragMode | null>(null);
  const dragBaseRangeRef = useRef<MultiDayDraftRange | null>(null);
  const dragPointerStartRef = useRef<number | null>(null);
  const pointerDownTargetRef = useRef<{ date: string; minute: number } | null>(null);
  const suppressNextCanvasClickRef = useRef(false);
  const totalHeight = (dayEndHour - dayStartHour) * hourRowHeight;
  const hasThreeDayLayout = dates.length <= 3;
  const contentMinWidth = hasThreeDayLayout ? timelineTimeColumnWidth + dates.length * 110 : undefined;
  const dayWidth = 100 / Math.max(1, dates.length);
  const getPointerTarget = (event: { clientX: number; clientY: number }, canvas: HTMLElement) => {
    const rect = canvas.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(rect.width - 1, event.clientX - rect.left));
    const dateIndex = Math.min(dates.length - 1, Math.max(0, Math.floor(relativeX / (rect.width / dates.length))));

    return {
      date: dates[dateIndex] ?? dates[0] ?? today,
      minute: getDraftPointerMinute(event, canvas)
    };
  };
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && target.closest("button,input,select,textarea,[data-schedule-range-handle],[data-schedule-create-action],[data-schedule-draft-range-block]");

  useEffect(() => {
    draftRangeRef.current = draftRange;
  }, [draftRange]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const isDraftInteractionTarget = (target: EventTarget | null) => {
      const element =
        target instanceof HTMLElement
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      return Boolean(element?.closest("[data-schedule-draft-range-block],[data-schedule-range-handle],[data-schedule-create-action]"));
    };

    const resetDraftInteraction = () => {
      dragModeRef.current = null;
      dragPointerStartRef.current = null;
      dragBaseRangeRef.current = null;
      pointerDownTargetRef.current = null;
    };

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!draftRangeRef.current || isDraftInteractionTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressNextCanvasClickRef.current = true;
      window.setTimeout(() => {
        suppressNextCanvasClickRef.current = false;
      }, 180);
      resetDraftInteraction();
      setDraftRange(null);
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, []);

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onCreate) {
      pointerDownTargetRef.current = null;
      return;
    }

    if ((event.button !== 0 && event.pointerType === "mouse") || isInteractiveTarget(event.target)) {
      pointerDownTargetRef.current = null;
      return;
    }

    pointerDownTargetRef.current = getPointerTarget(event, event.currentTarget);
  };

  const handleCanvasClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onCreate) {
      pointerDownTargetRef.current = null;
      return;
    }

    if (suppressNextCanvasClickRef.current) {
      suppressNextCanvasClickRef.current = false;
      pointerDownTargetRef.current = null;
      return;
    }

    if (isInteractiveTarget(event.target)) {
      pointerDownTargetRef.current = null;
      return;
    }

    const target = pointerDownTargetRef.current ?? getPointerTarget(event, event.currentTarget);
    const startMinute = clampDraftMinute(target.minute, 0, 24 * 60 - 60);
    const range = normalizeDraftRange(startMinute, startMinute + 60);
    const nextDraftRange = { ...range, date: target.date };
    pointerDownTargetRef.current = null;
    dragBaseRangeRef.current = nextDraftRange;
    setDraftRange(nextDraftRange);
  };

  const updateDraftRangeFromPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    const mode = dragModeRef.current;
    const baseRange = dragBaseRangeRef.current;

    if (!canvas || !mode || !baseRange) {
      return;
    }

    const target = getPointerTarget(event, canvas);

    if (mode === "resize-start") {
      setDraftRange({
        date: baseRange.date,
        start: clampDraftMinute(target.minute, 0, baseRange.end - scheduleDraftMinDurationMinutes),
        end: baseRange.end
      });
      return;
    }

    if (mode === "resize-end") {
      setDraftRange({
        date: baseRange.date,
        start: baseRange.start,
        end: clampDraftMinute(target.minute, baseRange.start + scheduleDraftMinDurationMinutes, 24 * 60 - 1)
      });
      return;
    }

    const duration = baseRange.end - baseRange.start;
    const pointerStart = dragPointerStartRef.current ?? target.minute;
    const nextStart = clampDraftMinute(baseRange.start + target.minute - pointerStart, 0, 24 * 60 - 1 - duration);
    setDraftRange({
      date: target.date,
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
    if (!draftRange || !onCreate) {
      return;
    }

    onCreate(draftRange.date, minutesToTime(draftRange.start), minutesToTime(draftRange.end));
    setDraftRange(null);
  };
  const draftDateIndex = draftRange ? Math.max(0, dates.indexOf(draftRange.date)) : 0;
  const draftDateInset = hasThreeDayLayout ? 6 : 3;
  const useCompactDraftAction = !hasThreeDayLayout;
  const timelineAutoScrollAnchor = useMemo(() => getTimelineAutoScrollAnchor(events, dates), [dates, events]);
  const multiDayTimelineAutoScrollKey = timelineAutoScrollAnchor ? `${dates.join(",")}:${timelineAutoScrollAnchor.eventKey}` : `${dates.join(",")}:empty`;

  useTimelineFirstEventAutoScroll(multiDayTimelineAutoScrollKey, timelineAutoScrollAnchor, canvasRef);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)]">
      <div className={cn(hasThreeDayLayout && "scrollbar-none overflow-x-auto overscroll-x-contain")}>
        <div style={contentMinWidth ? { minWidth: contentMinWidth } : undefined}>
          <div
            className="grid border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)]"
            style={{ gridTemplateColumns: `${timelineTimeColumnWidth}px repeat(${dates.length}, minmax(0, 1fr))` }}
          >
            <div className="border-r border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)]" />
            {dates.map((date) => {
              const isSelected = selectedDate === date;
              const isToday = today === date;

              return (
                <button
                  aria-pressed={isSelected}
                  className={cn(
                    "focus-ring relative min-h-[58px] border-r border-[color:color-mix(in_srgb,var(--client-line)_42%,transparent)] px-1 py-2 text-center last:border-r-0",
                    isSelected && "bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
                  )}
                  key={date}
                  onClick={() => onSelectDate?.(date)}
                  type="button"
                >
                  <span className={cn("block text-[10px] font-black", isToday ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-muted)]")}>
                    {getWeekdayLabel(date).replace("周", "")}
                  </span>
                  <strong
                    className={cn(
                      "mx-auto mt-1 grid h-7 w-7 place-items-center rounded-full text-[16px] font-black leading-none",
                      isSelected || isToday
                        ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                        : "text-[color:var(--client-text)]"
                    )}
                  >
                    {Number(date.slice(-2))}
                  </strong>
                  <CalendarHolidayNameStrip className="mt-1" compact={dates.length > 3} date={date} />
                </button>
              );
            })}
          </div>

          <div className="grid" style={{ gridTemplateColumns: `${timelineTimeColumnWidth}px minmax(0, 1fr)` }}>
            <div className="border-r border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)]">
              {Array.from({ length: dayEndHour - dayStartHour }, (_, index) => {
                const hour = dayStartHour + index;
                return (
                  <div
                    className="flex items-start justify-center border-b border-[color:color-mix(in_srgb,var(--client-line)_48%,transparent)] px-1 pt-2 last:border-b-0"
                    key={hour}
                    style={{ height: hourRowHeight }}
                  >
                    <span className="text-[10px] font-black leading-none text-[color:var(--client-muted)]">{String(hour).padStart(2, "0")}:00</span>
                  </div>
                );
              })}
            </div>

            <div
              className="relative touch-pan-y"
              onClick={handleCanvasClick}
              onPointerDown={handleCanvasPointerDown}
              ref={canvasRef}
              style={{ height: totalHeight }}
            >
              {Array.from({ length: dayEndHour - dayStartHour }, (_, index) => (
                <div
                  className="absolute inset-x-0 border-b border-[color:color-mix(in_srgb,var(--client-line)_44%,transparent)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary-soft)_34%,transparent)]"
                  key={index}
                  style={{ top: index * hourRowHeight, height: hourRowHeight }}
                />
              ))}

              {emptySearchQuery && events.length === 0 ? (
                <div className="absolute left-3 right-3 top-3 z-[3] rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)] px-3 py-2 text-center shadow-[0_14px_28px_rgba(0,0,0,0.12)]">
                  <strong className="block text-[12px] font-black text-[color:var(--client-text)]">没有符合「{emptySearchQuery}」的行程</strong>
                </div>
              ) : null}

              {dates.map((date, dateIndex) => {
                const dateEvents = groupedEvents[date] ?? [];
                const dateAvailabilityEvents = mergeAvailabilityStripEvents(dateEvents.filter(isAvailabilityMarkerEvent));
                const dateLayout = getLayoutEvents(dateEvents.filter((event) => !isAvailabilityMarkerEvent(event)).sort(sortEvents));
                const inset = hasThreeDayLayout ? 4 : 2;
                const contentStartInset = dateAvailabilityEvents.length > 0 ? availabilityContentOffset : inset;
                const totalContentInset = contentStartInset + inset;
                const dense = true;

                return (
                  <div
                    className="absolute bottom-0 top-0 border-l border-[color:color-mix(in_srgb,var(--client-line)_38%,transparent)] last:border-r"
                    data-calendar-date-column={date}
                    key={date}
                    style={{ left: `${dateIndex * dayWidth}%`, width: `${dayWidth}%` }}
                  >
                    {dateAvailabilityEvents.map((event) => {
                      const start = Math.max(timeToMinutes(event.startTime), dayStartHour * 60);
                      const end = Math.min(timeToMinutes(event.endTime), dayEndHour * 60);
                      if (end <= start) return null;

                      return (
                        <CalendarAvailabilityStrip
                          event={event}
                          key={`availability-strip-${event.id}`}
                          onOpen={onOpen}
                          style={{
                            left: `${availabilityStripInset}px`,
                            top: ((start - dayStartHour * 60) / 60) * hourRowHeight + 4,
                            height: Math.max(((end - start) / 60) * hourRowHeight - 8, 18),
                          }}
                        />
                      );
                    })}
                    {dateLayout.events.map(({ event, start, end, lane }) => {
                      const laneCount = Math.max(1, dateLayout.cappedLaneCount);
                      const displayLane = Math.min(lane, laneCount - 1);
                      const clampedStart = Math.max(start, dayStartHour * 60);
                      const clampedEnd = Math.min(end, dayEndHour * 60);

                      return (
                        <div
                          className="absolute z-[2]"
                          key={event.id}
                          style={{
                            left: laneCount > 1 ? `calc(${contentStartInset}px + ${displayLane} * ((100% - ${totalContentInset}px) / ${laneCount}))` : contentStartInset,
                            width: laneCount > 1 ? `calc((100% - ${totalContentInset}px) / ${laneCount})` : `calc(100% - ${totalContentInset}px)`,
                            top: ((clampedStart - dayStartHour * 60) / 60) * hourRowHeight + 4,
                            height: Math.max(((clampedEnd - clampedStart) / 60) * hourRowHeight - 8, dense ? 34 : 42)
                          }}
                        >
                          <CalendarTimelineEventPill dense={dense} event={event} onOpen={onOpen} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {onCreate && draftRange ? (
                <ScheduleDraftRangeBlock
                  action={(
                    <button
                      aria-label="下一步"
                      className={cn(
                        "rounded-full bg-[color:var(--client-primary)] text-[11px] font-black text-[color:var(--client-primary-contrast)] shadow-[0_10px_20px_color-mix(in_srgb,var(--client-primary)_26%,transparent)]",
                        useCompactDraftAction ? "grid h-7 w-7 place-items-center" : "px-3 py-1.5"
                      )}
                      data-schedule-create-action="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        confirmDraftRange();
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      type="button"
                    >
                      {useCompactDraftAction ? <AppIcon className="h-3.5 w-3.5" name="check" /> : "下一步"}
                    </button>
                  )}
                  compact={useCompactDraftAction}
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
                    left: `calc(${draftDateIndex * dayWidth}% + ${draftDateInset}px)`,
                    width: `calc(${dayWidth}% - ${draftDateInset * 2}px)`,
                    top: ((draftRange.start - dayStartHour * 60) / 60) * hourRowHeight + 6,
                    height: Math.max(((draftRange.end - draftRange.start) / 60) * hourRowHeight - 12, scheduleDraftRangeVisualMinHeight)
                  }}
                  subtitle="拖动整块调整开始时间，拖动上下手柄调整时长"
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

type CalendarMonthGridProps = {
  anchorDate: string;
  dates: string[];
  eventsByDate: Record<string, UnifiedCalendarEvent[]>;
  onOpen: (event: UnifiedCalendarEvent) => void;
  onSelectDate?: (date: string) => void;
  selectedDate?: string;
};

export function UnifiedCalendarMonthGrid({
  anchorDate,
  dates,
  eventsByDate,
  onOpen,
  onSelectDate,
  selectedDate
}: CalendarMonthGridProps) {
  const today = getTodayDateKey();
  const monthKey = anchorDate.slice(0, 7);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)]">
      <div className="grid grid-cols-7 border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] text-center text-[11px] font-black text-[color:var(--client-muted)]">
        {getWeekdayHeaderLabel().map((label) => (
          <span className="border-r border-[color:color-mix(in_srgb,var(--client-line)_38%,transparent)] py-2 last:border-r-0" key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dates.map((date, index) => {
          const dateEvents = eventsByDate[date] ?? [];
          const availabilityEvents = mergeAvailabilityStripEvents(dateEvents.filter(isAvailabilityMarkerEvent));
          const contentEvents = dateEvents.filter((event) => !isAvailabilityMarkerEvent(event));
          const availabilityEvent = availabilityEvents[0];
          const inMonth = date.slice(0, 7) === monthKey;
          const selected = selectedDate === date;
          const isToday = today === date;
          const overflowCount = Math.max(0, contentEvents.length - 3);
          const selectDate = () => onSelectDate?.(date);

          return (
            <div
              aria-label={`选择 ${formatLongDate(date)}`}
              className={cn(
                "focus-ring relative min-h-[86px] cursor-pointer border-b border-r border-[color:color-mix(in_srgb,var(--client-line)_42%,transparent)] px-1 py-1.5",
                (index + 1) % 7 === 0 && "border-r-0",
                index >= dates.length - 7 && "border-b-0",
                selected && "bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]",
                !inMonth && "opacity-38"
              )}
              key={date}
              onClick={selectDate}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }

                event.preventDefault();
                selectDate();
              }}
              role="button"
              tabIndex={0}
            >
              {availabilityEvent ? (
                <button
                  aria-label={`${formatLongDate(date)} ${getAvailabilityStripLabel(availabilityEvent)}`}
                  className="focus-ring absolute bottom-1 top-9 z-[2] rounded-r-full border border-l-0 border-emerald-200/80 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.36)]"
                  data-calendar-availability-strip="true"
                  data-calendar-month-availability-strip="true"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    if (onSelectDate) {
                      onSelectDate(date);
                      return;
                    }
                    onOpen(availabilityEvent);
                  }}
                  style={{ left: 0, width: "6px" }}
                  title={getAvailabilityStripLabel(availabilityEvent)}
                  type="button"
                />
              ) : null}
              <HolidayCornerBadge date={date} />
              <strong
                className={cn(
                  "relative z-[1] mx-auto grid h-6 w-6 place-items-center rounded-full text-[12px] font-black leading-none",
                  selected || isToday
                    ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                    : "text-[color:var(--client-text)]"
                )}
              >
                {Number(date.slice(-2))}
              </strong>
              <div className="relative z-[2] mt-1 space-y-1">
                {contentEvents.slice(0, 3).map((event) => (
                  <button
                    className="focus-ring block h-[14px] w-full truncate rounded-[4px] bg-[color:color-mix(in_srgb,var(--calendar-accent)_78%,var(--client-elevated)_22%)] px-0.5 text-left text-[8px] font-black leading-[14px] text-[color:var(--calendar-contrast)]"
                    key={event.id}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      if (onSelectDate) {
                        onSelectDate(date);
                        return;
                      }

                      onOpen(event);
                    }}
                    style={getEventStyle(event)}
                    title={`${formatLongDate(date)} · ${event.startTime} - ${event.endTime} ${event.title}`}
                    type="button"
                  >
                    {event.title}
                  </button>
                ))}
                {overflowCount > 0 ? (
                  <span className="block truncate text-[9px] font-black text-[color:var(--client-muted)]">+{overflowCount}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyCalendarState({ date, onCreate, searchQuery }: { date: string; onCreate?: () => void; searchQuery?: string }) {
  const hasSearch = Boolean(searchQuery?.trim());
  return (
    <div className="rounded-[20px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-4 py-5 text-center">
      <strong className="block text-sm font-black text-[color:var(--client-text)]">
        {hasSearch ? `没有符合「${searchQuery?.trim()}」的行程` : `${formatLongDate(date)} 暂无行程`}
      </strong>
      {hasSearch ? (
        <p className="mt-2 text-[11px] font-bold text-[color:var(--client-muted)]">换个关键词，或清空搜索后查看全部行程。</p>
      ) : onCreate ? (
        <button
          className="focus-ring mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-contrast)]"
          onClick={onCreate}
          type="button"
        >
          <AppIcon className="h-4 w-4" name="plus" />
          新增
        </button>
      ) : (
        <p className="mt-2 text-[11px] font-bold text-[color:var(--client-muted)]">当前日期没有预约。</p>
      )}
    </div>
  );
}

function getEventParticipantFallback(event: UnifiedCalendarEvent, creatorLabel: string, sourceLabel: string) {
  return dedupeCalendarParticipants([
    ...(event.participants ?? []),
    event.creatorLabel ? getNamedParticipant(creatorLabel, "创建者", sourceLabel) : null,
    ...(event.syncContactLabels ?? []).map((label) => getNamedParticipant(label, "参加者", "同步联系人")),
    event.calendarLabel ? getNamedParticipant(event.calendarLabel, "参加者", event.calendarId) : null
  ]);
}

function EventParticipantAvatar({
  participant,
  className
}: {
  participant: UnifiedCalendarParticipant;
  className?: string;
}) {
  if (participant.avatar) {
    return <AvatarImage alt={participant.name} className={cn("border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)]", className)} src={participant.avatar} />;
  }

  return (
    <span className={cn("grid place-items-center rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[12px] font-black text-[color:var(--client-muted)]", className)}>
      {participant.name.trim().slice(0, 1) || "参"}
    </span>
  );
}

function EventParticipantStack({ participants }: { participants: UnifiedCalendarParticipant[] }) {
  const previewParticipants = participants.slice(0, 4);
  const overflowCount = Math.max(0, participants.length - previewParticipants.length);

  return (
    <div className="flex shrink-0 items-center">
      {previewParticipants.map((participant, index) => (
        <EventParticipantAvatar
          className={cn("h-9 w-9 shadow-[0_8px_18px_rgba(0,0,0,0.18)]", index > 0 && "-ml-2")}
          key={participant.id}
          participant={participant}
        />
      ))}
      {overflowCount > 0 ? (
        <span className="-ml-2 grid h-9 min-w-9 place-items-center rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_86%,transparent)] px-2 text-[11px] font-black text-[color:var(--client-muted)]">
          +{overflowCount}
        </span>
      ) : null}
    </div>
  );
}

function EventDetailIconButton({
  disabled,
  icon,
  label,
  onClick,
  tone = "default"
}: {
  disabled?: boolean;
  icon: IconName;
  label: string;
  onClick?: () => void;
  tone?: "default" | "primary";
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        floatingHeaderControlButtonClassName,
        "shrink-0",
        tone === "primary" && "text-[color:var(--client-primary)]",
        disabled && "cursor-not-allowed opacity-45"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <AppIcon className="h-5 w-5" name={icon} />
    </button>
  );
}

function EventDetailMoreMenuItem({
  danger,
  disabled,
  icon,
  label,
  onClick
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "focus-ring flex w-full items-center gap-3 whitespace-nowrap rounded-[16px] px-3 py-3 text-left text-[14px] font-black transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]",
        danger ? "text-[#ff7f74]" : "text-[color:var(--client-text)]",
        disabled && "cursor-not-allowed opacity-45"
      )}
      data-no-i18n
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)] text-[color:var(--client-primary)]",
          danger && "bg-[color:color-mix(in_srgb,var(--client-accent)_12%,transparent)] text-[#ff9b92]"
        )}
      >
        <AppIcon className="h-4.5 w-4.5" name={icon} />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function EventDetailField({
  icon,
  label,
  value
}: {
  icon: "calendar" | "map" | "manager" | "bell" | "clock" | "globe";
  label: string;
  value?: ReactNode;
}) {
  if (!value) {
    return null;
  }

  return (
    <div
      className="flex w-full items-start gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] px-3 py-3"
      data-calendar-event-detail-field="true"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] text-[color:var(--client-muted)]">
        <AppIcon className="h-5 w-5" name={icon} />
      </span>
      <span className="min-w-0 flex-1" data-calendar-event-detail-content="true">
        <span className="block text-[11px] font-black text-[color:var(--client-muted)]">{label}</span>
        <span
          className="mt-1 block min-w-0 whitespace-normal text-sm font-black leading-5 text-[color:var(--client-text)]"
          data-calendar-event-detail-value="true"
          style={{ overflowWrap: "anywhere" }}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function isNeedoAppointmentEvent(event: UnifiedCalendarEvent) {
  return Boolean(getCalendarAppointmentDetailId(event) && (event.sourceId === "user" || event.sourceId === "technician" || event.sourceId === "merchant"));
}

export function UnifiedCalendarEventDetailPage({
  event,
  onBack,
  onEdit,
  onDelete,
  onSync,
  onContactCreator,
  onOpenAppointmentDetail
}: {
  event: UnifiedCalendarEvent;
  onBack: () => void;
  onEdit?: (event: UnifiedCalendarEvent) => void;
  onDelete?: (event: UnifiedCalendarEvent) => void;
  onSync?: (event: UnifiedCalendarEvent) => void;
  onContactCreator?: (event: UnifiedCalendarEvent) => void;
  onOpenAppointmentDetail?: (event: UnifiedCalendarEvent) => void;
}) {
  const { language } = useI18n();
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<"detail" | "participants">("detail");
  const [status, setStatus] = useState<"已承诺" | "辞退" | "保留">("已承诺");
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [scheduleImpactAction, setScheduleImpactAction] = useState<"edit" | "delete" | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const actionMenuOverlayRef = useRef<HTMLDivElement | null>(null);
  const source = sourceConfigs[event.sourceId];
  const creatorLabel = event.creatorLabel?.trim() || source.label;
  const participants = getEventParticipantFallback(event, creatorLabel, source.label);
  const canContactCreator = Boolean(event.creatorUserId && onContactCreator);
  const contactCreatorLabel = `${translateText("联系创建者", language)}：${creatorLabel}`;
  const canEdit = Boolean(onEdit);
  const canDelete = Boolean(onDelete);
  const canOpenAppointmentDetail = isNeedoAppointmentEvent(event) && Boolean(onOpenAppointmentDetail);
  const headerTitle = detailMode === "participants" ? "参加者" : "行程详情";
  const repeatLabel = repeatOptions.find((option) => option.value === event.repeatRule)?.label;
  const eventEndDate = event.endDate || event.date;
  const dateTimeLabel = event.allDay
    ? `${formatLongDate(event.date)} 终日`
    : eventEndDate !== event.date
      ? `${formatLongDate(event.date)} ${event.startTime} - ${formatLongDate(eventEndDate)} ${event.endTime}`
      : `${formatLongDate(event.date)} ${event.startTime} - ${event.endTime}`;

  const closeActionSheet = () => setActionSheetOpen(false);
  const closeStatusSheet = () => setStatusSheetOpen(false);
  const handleDelete = () => {
    if (!canDelete) {
      return;
    }
    closeActionSheet();
    if (event.availabilityWindowId && scheduleImpactAction !== "delete") {
      setScheduleImpactAction("delete");
      return;
    }
    onDelete?.(event);
  };
  const handleEdit = () => {
    if (!canEdit) return;
    if (event.availabilityWindowId && scheduleImpactAction !== "edit") {
      setScheduleImpactAction("edit");
      return;
    }
    onEdit?.(event);
  };

  useEffect(() => {
    if (!actionSheetOpen || typeof document === "undefined") {
      return undefined;
    }

    const handlePointerDown = (pointerEvent: PointerEvent) => {
      const target = pointerEvent.target;

      if (target instanceof Node && (actionMenuRef.current?.contains(target) || actionMenuOverlayRef.current?.contains(target))) {
        return;
      }

      setActionSheetOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [actionSheetOpen]);

  const renderParticipants = () => (
    <div className="space-y-3">
      <section className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_78%,transparent)] px-4 py-3">
        <p className="text-[11px] font-black text-[color:var(--client-muted)]">当前行程参加者</p>
        <strong className="mt-1 block text-xl font-black text-[color:var(--client-text)]">{participants.length} 名</strong>
      </section>
      <section className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]">
        {participants.length > 0 ? participants.map((participant, index) => {
          const row = (
            <ConversationListItem
              avatar={participant.avatar ?? ""}
              avatarNode={participant.avatar ? undefined : <EventParticipantAvatar className="h-12 w-12" participant={participant} />}
              className="px-4 py-3"
              meta={participant.role ?? "参加者"}
              preview={participant.meta}
              sideText={participant.to ? "详细" : undefined}
              title={participant.name}
            />
          );

          return participant.to ? (
            <Link
              className={cn("block transition active:bg-[color:color-mix(in_srgb,var(--client-primary-soft)_38%,transparent)]", index > 0 && "border-t border-[color:color-mix(in_srgb,var(--client-line)_40%,transparent)]")}
              key={participant.id}
              to={participant.to}
            >
              {row}
            </Link>
          ) : (
            <article className={cn(index > 0 && "border-t border-[color:color-mix(in_srgb,var(--client-line)_40%,transparent)]")} key={participant.id}>
              {row}
            </article>
          );
        }) : (
          <p className="px-4 py-5 text-sm font-bold text-[color:var(--client-muted)]">当前行程没有同步参加者。</p>
        )}
      </section>
    </div>
  );

  const renderDetail = () => (
    <>
      <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--calendar-accent)_36%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--calendar-soft)_92%,var(--client-elevated)),color-mix(in_srgb,var(--client-surface)_90%,transparent))] px-4 py-4 shadow-[0_18px_42px_color-mix(in_srgb,var(--calendar-accent)_12%,transparent)]" style={getEventStyle(event)}>
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-[5px] bg-[color:var(--calendar-accent)]" />
          <span className="rounded-[8px] bg-[color:color-mix(in_srgb,var(--calendar-accent)_20%,transparent)] px-2 py-1 text-[11px] font-black text-[color:var(--calendar-text)]">{event.badge}</span>
        </div>
        <h2 className="mt-5 text-[28px] font-black leading-tight text-[color:var(--client-text)]">{event.title || "（无标题）"}</h2>
      </section>

      <div className="space-y-3">
        <EventDetailField icon="calendar" label="日期时间" value={dateTimeLabel} />
        <EventDetailField icon="map" label="地址" value={event.location || event.subtitle} />
        <EventDetailField
          icon="globe"
          label="URL"
          value={event.url ? <a className="break-all text-[color:var(--client-primary)]" href={event.url} rel="noreferrer" target="_blank">{event.url}</a> : undefined}
        />
        <EventDetailField
          icon="manager"
          label={translateText("创建者", language)}
          value={(
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{creatorLabel}</span>
              {canContactCreator ? (
                <button
                  aria-label={contactCreatorLabel}
                  className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                  onClick={() => onContactCreator?.(event)}
                  title={contactCreatorLabel}
                  type="button"
                >
                  <AppIcon className="h-4 w-4" name="chat" />
                </button>
              ) : null}
            </span>
          )}
        />
        <button
          className="focus-ring grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] px-3 py-3 text-left transition active:scale-[0.99]"
          onClick={() => setDetailMode("participants")}
          type="button"
        >
          <span className="grid h-9 w-9 place-items-center rounded-[14px] text-[color:var(--client-muted)]">
            <AppIcon className="h-5 w-5" name="manager" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black text-[color:var(--client-muted)]">参加者</span>
            <span className="mt-1 block text-sm font-black leading-5 text-[color:var(--client-text)]">{participants.length} 名</span>
          </span>
          <EventParticipantStack participants={participants} />
        </button>
        <EventDetailField icon="bell" label="提醒时间" value={event.reminder ?? "5 分前"} />
        <EventDetailField icon="clock" label="重复" value={repeatLabel && repeatLabel !== "不重复" ? repeatLabel : undefined} />
        {scheduleImpactAction ? (
          <section className="rounded-[18px] border-2 border-red-500 bg-red-500/10 px-4 py-4" role="alert">
            <p className="text-sm font-black leading-6 text-red-500">
              {event.availabilitySourceType === "shop"
                ? "这是店铺安排的可排班日程。修改或取消可能影响店铺安排；该时段若已有确定预约，预约记录仍会保留。是否真的执行？"
                : "修改或取消可排班时间不会删除已有预约，但会影响之后的自动接单与自动抢单。是否真的执行？"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="focus-ring min-h-11 rounded-full border border-[color:var(--client-line)] font-black" onClick={() => setScheduleImpactAction(null)} type="button">返回</button>
              <button
                className="focus-ring min-h-11 rounded-full bg-red-500 font-black text-white"
                onClick={() => scheduleImpactAction === "edit" ? onEdit?.(event) : onDelete?.(event)}
                type="button"
              >
                {scheduleImpactAction === "edit" ? "确认修改排班" : "确认取消排班"}
              </button>
            </div>
          </section>
        ) : null}
        {canOpenAppointmentDetail ? (
          <button
            className="focus-ring flex w-full items-center justify-between gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:var(--client-primary-soft)] px-4 py-3 text-left text-[color:var(--client-primary-strong)] shadow-[0_14px_34px_color-mix(in_srgb,var(--client-primary)_12%,transparent)] transition active:scale-[0.99]"
            onClick={() => onOpenAppointmentDetail?.(event)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block text-[11px] font-black opacity-75">{translateText("预约详情页", language)}</span>
              <span className="mt-1 block truncate text-sm font-black">{translateText("预约详情", language)}</span>
            </span>
            <AppIcon className="h-5 w-5 shrink-0" name="calendar" />
          </button>
        ) : null}
      </div>

      {event.images && event.images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {event.images.map((image) => (
            <img alt={image.name} className="aspect-square rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] object-cover" key={image.id} src={image.dataUrl} />
          ))}
        </div>
      ) : null}
    </>
  );

  const headerActions = detailMode === "detail" ? (
    <>
      <EventDetailIconButton disabled={!onSync} icon="share" label="同步行程" onClick={onSync ? () => onSync(event) : undefined} />
      <EventDetailIconButton disabled={!canEdit} icon="edit" label="编辑行程" onClick={canEdit ? handleEdit : undefined} />
      <div className="relative" ref={actionMenuRef}>
        <EventDetailIconButton icon="more" label="更多行程操作" onClick={() => setActionSheetOpen((current) => !current)} tone="primary" />
      </div>
    </>
  ) : null;
  const headerOverlay = detailMode === "detail" && actionSheetOpen ? (
    <div
      className="absolute right-3 top-2 z-[90] w-[224px] rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-text)_12%)] p-2 shadow-[0_20px_48px_rgba(0,0,0,0.26)] backdrop-blur-xl"
      data-calendar-event-more-menu="true"
      ref={actionMenuOverlayRef}
    >
      <EventDetailMoreMenuItem icon="plus" label="制作一个复制" onClick={closeActionSheet} />
      <EventDetailMoreMenuItem icon="share" label="日程转让" onClick={closeActionSheet} />
      <EventDetailMoreMenuItem danger disabled={!canDelete} icon="trash" label="日程删除" onClick={handleDelete} />
      <EventDetailMoreMenuItem icon="close" label="取消" onClick={closeActionSheet} />
    </div>
  ) : null;
  const statusOptions = ["已承诺", "辞退", "保留"] as const;

  return (
    <MobileFullscreenPage className="z-[120]" innerClassName="client-glass-page-surface">
      <MobileFullscreenHeader
        action={headerActions}
        backLabel={detailMode === "participants" ? "返回行程详情" : "返回"}
        className="client-mobile-schedule-detail__floating-header"
        info={detailMode === "participants" ? "和通讯录列表一致，只显示当前行程参加者。" : "统一行程详情页，适用于预约、排班和可排班行程。"}
        onBack={detailMode === "participants" ? () => setDetailMode("detail") : onBack}
        overlay={headerOverlay}
        showSpacer={false}
        title={headerTitle}
      />
      <main className="client-app-gutter scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+104px)] pt-[calc(env(safe-area-inset-top)+92px)]">
        {detailMode === "participants" ? renderParticipants() : renderDetail()}
      </main>

      {detailMode === "detail" ? (
        <footer className="safe-bottom client-app-frame client-app-gutter fixed inset-x-0 bottom-0 z-[122] pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          {statusSheetOpen ? (
            <>
              <button
                aria-label="关闭状态选择"
                className="fixed inset-0 z-[120] bg-transparent"
                onClick={closeStatusSheet}
                type="button"
              />
              <section className="relative z-[124] mb-2 overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_96%,transparent)] shadow-[0_22px_72px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
                {statusOptions.map((option) => (
                  <button
                    aria-pressed={status === option}
                    className={cn(
                      "focus-ring flex h-14 w-full items-center justify-between border-b border-[color:color-mix(in_srgb,var(--client-line)_46%,transparent)] px-4 text-left text-sm font-black last:border-b-0",
                      status === option ? "text-[color:var(--client-primary-strong)]" : "text-[color:var(--client-text)]"
                    )}
                    key={option}
                    onClick={() => {
                      setStatus(option);
                      closeStatusSheet();
                    }}
                    type="button"
                  >
                    <span>{option}</span>
                    {status === option ? <AppIcon className="h-5 w-5" name="check" /> : null}
                  </button>
                ))}
              </section>
            </>
          ) : null}
          <button
            aria-expanded={statusSheetOpen}
            className={cn(
              "focus-ring relative z-[126] flex min-h-14 w-full items-center justify-center rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] px-5 shadow-[0_18px_52px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition active:scale-[0.99]",
              statusSheetOpen
                ? "bg-[color:color-mix(in_srgb,var(--client-surface)_94%,transparent)] text-[color:var(--client-text)]"
                : "bg-[color:color-mix(in_srgb,var(--client-primary-soft)_82%,var(--client-surface)_18%)] text-[color:var(--client-primary-strong)]"
            )}
            data-calendar-status-trigger="true"
            onClick={statusSheetOpen ? closeStatusSheet : () => setStatusSheetOpen(true)}
            type="button"
          >
            {statusSheetOpen ? (
              <>
                <span className="absolute inset-x-12 text-center text-base font-black" data-calendar-status-label="true" data-no-i18n>取消</span>
                <AppIcon className="absolute right-5 h-5 w-5" name="close" />
              </>
            ) : (
              <>
                <span className="absolute inset-x-12 text-center text-base font-black" data-calendar-status-label="true" data-no-i18n>{status}</span>
                <AppIcon className="absolute right-5 h-5 w-5" name="more" />
              </>
            )}
          </button>
        </footer>
      ) : null}
    </MobileFullscreenPage>
  );
}

function CalendarEventEditorPage({
  availabilityCapacity,
  draft,
  onChange,
  onClose,
  onAvailabilityCapacityChange,
  onOpenParticipantFlow,
  onSave,
  saveDisabled = false,
  technicianCreationMode,
  onTechnicianCreationModeChange
}: {
  availabilityCapacity?: number;
  draft: CalendarEditorDraft;
  onChange: (draft: CalendarEditorDraft) => void;
  onClose: () => void;
  onAvailabilityCapacityChange?: (capacity: number) => void;
  onOpenParticipantFlow: () => void;
  onSave: () => void | Promise<void>;
  saveDisabled?: boolean;
  technicianCreationMode?: TechnicianCreationMode;
  onTechnicianCreationModeChange?: (mode: TechnicianCreationMode) => void;
}) {
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

  const title = draft.id ? "编辑行程" : "新增行程";

  return (
    <MobileFullscreenPage className="z-[130]" innerClassName="client-glass-page-surface">
      <MobileFullscreenHeader
        className="client-mobile-schedule-detail__floating-header"
        closeLabel={`关闭${title}`}
        info={draft.id ? "编辑完整行程信息" : "新建完整行程信息"}
        onClose={onClose}
        showSpacer={false}
        title={title}
      />
      <main
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+104px)] pt-[calc(env(safe-area-inset-top)+92px)] [-webkit-overflow-scrolling:touch]"
        data-page-drag-ignore="true"
        data-scroll-drag-ignore="true"
      >
        <div className="space-y-3">
        {technicianCreationMode && onTechnicianCreationModeChange ? (
          <section className="grid grid-cols-2 gap-3" aria-label="日程业务类型">
            {([
              ["availability", "可排班"],
              ["manualBooking", "手动预约"]
            ] as const).map(([mode, label]) => {
              const active = technicianCreationMode === mode;
              return (
                <button
                  aria-checked={active}
                  aria-label={label}
                  className={cn(
                    "focus-ring flex min-h-12 items-center justify-between rounded-full border px-4 text-sm font-black transition",
                    active
                      ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                      : "border-[color:var(--client-line)] bg-[color:var(--client-elevated)] text-[color:var(--client-muted)]"
                  )}
                  onClick={() => onTechnicianCreationModeChange(active ? "private" : mode)}
                  role="switch"
                  type="button"
                >
                  <span>{label}</span>
                  <span aria-hidden="true" className={cn("relative h-6 w-11 rounded-full transition", active ? "bg-[color:var(--client-primary)]" : "bg-[color:var(--client-line)]") }>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", active ? "left-[22px]" : "left-0.5")} />
                  </span>
                </button>
              );
            })}
          </section>
        ) : null}
        {technicianCreationMode === "availability" && availabilityCapacity !== undefined && onAvailabilityCapacityChange ? (
          <section className={cn(scheduleInsetClass, "space-y-3 px-4 py-4")}>
            <div>
              <h2 className="text-base font-black text-[color:var(--client-text)]">自由排班</h2>
              <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">
                直接保存到当前日程表；已有预约只占用其中一段时间，不会缩短或关闭此范围。
              </p>
            </div>
            <label className="block text-[11px] font-black text-[color:var(--client-muted)]">
              同时可接数量
              <input
                className={cn(inputClass, "mt-1")}
                max={100}
                min={1}
                name="availabilityCapacity"
                onChange={(event) => onAvailabilityCapacityChange(Number(event.target.value))}
                type="number"
                value={availabilityCapacity}
              />
            </label>
            {!Number.isInteger(availabilityCapacity) || availabilityCapacity < 1 || availabilityCapacity > 100 ? (
              <p className="text-xs font-black text-red-500" role="alert">容量必须为 1 到 100 的整数</p>
            ) : null}
          </section>
        ) : null}
        <input
          className={cn(inputClass, "h-12 text-base")}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="新增标题"
          value={draft.title}
        />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <label className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            日期
            <input
              className={cn(inputClass, temporalInputClass)}
              onChange={(event) =>
                onChange({
                  ...draft,
                  date: event.target.value,
                  endDate: !draft.endDate || draft.endDate === draft.date ? event.target.value : draft.endDate
                })
              }
              type="date"
              value={draft.date}
            />
          </label>
          <label className="focus-within:ring-focus mb-px flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-3 text-[12px] font-black text-[color:var(--client-text)]">
            <span>终日</span>
            <input
              checked={draft.allDay}
              className="sr-only"
              onChange={(event) => onChange(applyCalendarAllDayChange(draft, event.target.checked))}
              type="checkbox"
            />
            <span
              aria-hidden="true"
              className={cn(
                "relative h-5 w-9 rounded-full transition",
                draft.allDay ? "bg-[color:var(--client-primary)]" : "bg-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)]"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-[color:var(--client-primary-contrast)] shadow transition",
                  draft.allDay ? "left-[18px]" : "left-0.5"
                )}
              />
            </span>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            提醒
            <ScheduleViewPicker
              ariaLabel="选择提醒时间"
              className="mt-1"
              label=""
              onChange={(reminder) => onChange({ ...draft, reminder })}
              options={[...reminderOptions]}
              value={normalizeCalendarReminderLabel(draft.reminder)}
              variant="field"
            />
          </div>
          <div className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            重复
            <ScheduleViewPicker
              ariaLabel="选择重复方式"
              className="mt-1"
              label=""
              onChange={(repeatRule) => onChange({ ...draft, repeatRule: normalizeCalendarRepeatRule(repeatRule) })}
              options={repeatOptions}
              value={draft.repeatRule}
              variant="field"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            开始
            <input
              className={cn(inputClass, temporalInputClass)}
              onChange={(event) => onChange(applyCalendarEditorDateTimeChange(draft, event.target.value, "start"))}
              type="datetime-local"
              value={formatCalendarEditorDateTimeInputValue(draft.date, draft.startTime)}
            />
          </label>
          <label className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            结束
            <input
              className={cn(inputClass, temporalInputClass)}
              onChange={(event) => onChange(applyCalendarEditorDateTimeChange(draft, event.target.value, "end"))}
              type="datetime-local"
              value={formatCalendarEditorDateTimeInputValue(draft.endDate || draft.date, draft.endTime)}
            />
          </label>
        </div>
        <input
          className={inputClass}
          onChange={(event) => onChange({ ...draft, location: event.target.value })}
          placeholder="地点"
          value={draft.location}
        />
        <input
          className={inputClass}
          onChange={(event) => onChange({ ...draft, url: event.target.value })}
          placeholder="URL"
          type="url"
          value={draft.url}
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
            <span className="text-[12px] font-black text-[color:var(--client-text)]">参加者</span>
            <span className="text-[10px] font-black text-[color:var(--client-muted)]">{draft.syncContactIds.length} 个</span>
          </div>
          <button
            className="focus-ring flex min-h-12 w-full items-center justify-between rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] px-4 text-left transition active:scale-[0.99]"
            onClick={onOpenParticipantFlow}
            type="button"
          >
            <span className="text-[12px] font-black text-[color:var(--client-text)]">
              {draft.syncContactIds.length > 0 ? (
                <><span>已选择</span> <span data-no-i18n>{draft.syncContactIds.length}</span> <span>位</span></>
              ) : "选择参加者"}
            </span>
            <AppIcon className="h-4 w-4 -rotate-90 text-[color:var(--client-muted)]" name="down" />
          </button>
        </section>
      </div>
      </main>
      <footer className="safe-bottom client-app-frame client-app-gutter pointer-events-none fixed inset-x-0 bottom-0 z-[132] pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-12">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[140px] bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_76%,transparent)_42%,var(--client-bg)_100%)]" />
        <div className="pointer-events-auto relative z-10 grid grid-cols-[0.9fr_1.1fr] gap-2">
          <button
            aria-label={`取消${title}`}
            className="focus-ring flex h-12 min-w-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,transparent)] px-3 text-sm font-black text-[color:var(--client-text)] shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            aria-label={`完成${title}`}
            className="focus-ring flex h-12 min-w-0 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-3 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_16px_36px_color-mix(in_srgb,var(--client-primary)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={saveDisabled}
            onClick={onSave}
            type="button"
          >
            完成
          </button>
        </div>
      </footer>
    </MobileFullscreenPage>
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
      <strong className="absolute left-5 top-5 text-3xl font-black text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.32)]">{current.getFullYear()}年{current.getMonth() + 1}月</strong>
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
      data-agenda-event-row="true"
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

export function UnifiedCalendarAgendaView({
  dates,
  events,
  onCreate,
  onExtendFuture,
  onExtendPast,
  onOpen,
  scrollTargetDate,
  scrollTargetRequestId,
  searchQuery
}: {
  dates: string[];
  events: UnifiedCalendarEvent[];
  onCreate?: (date: string) => void;
  onExtendFuture: () => void;
  onExtendPast: () => void;
  onOpen: (event: UnifiedCalendarEvent) => void;
  scrollTargetDate?: string;
  scrollTargetRequestId: number;
  searchQuery?: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const prependScrollHeightRef = useRef<number | null>(null);
  const pendingExtendRef = useRef<"past" | "future" | null>(null);
  const normalizedSearchQuery = normalizeCalendarSearchValue(searchQuery ?? "");
  const hasSearch = Boolean(normalizedSearchQuery);
  const groupedEvents = groupEventsByDate(events);
  const renderedDates = hasSearch ? dates.filter((date) => (groupedEvents[date] ?? []).length > 0) : dates;
  const rows: ReactNode[] = [];
  let lastMonth = "";
  let renderedEventCount = 0;
  const firstDate = dates[0] ?? "";
  const lastDate = dates[dates.length - 1] ?? "";
  const firstRenderedDate = renderedDates[0] ?? "";

  useEffect(() => {
    const list = listRef.current;
    const previousScrollHeight = prependScrollHeightRef.current;

    if (list && previousScrollHeight !== null) {
      list.scrollTop += list.scrollHeight - previousScrollHeight;
    }

    prependScrollHeightRef.current = null;
    pendingExtendRef.current = null;
  }, [firstDate, lastDate]);

  useEffect(() => {
    if (!hasSearch || typeof window === "undefined") {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [firstRenderedDate, hasSearch, normalizedSearchQuery]);

  const handleScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;

    if (hasSearch || pendingExtendRef.current) {
      return;
    }

    if (list.scrollTop < 96) {
      pendingExtendRef.current = "past";
      prependScrollHeightRef.current = list.scrollHeight;
      onExtendPast();
      return;
    }

    if (list.scrollHeight - list.scrollTop - list.clientHeight < 180) {
      pendingExtendRef.current = "future";
      onExtendFuture();
    }
  };

  renderedDates.forEach((date, index) => {
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

    rows.push(<span aria-hidden="true" className="block h-0" data-agenda-date={date} key={`anchor-${date}`} />);

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

  useEffect(() => {
    if (!scrollTargetDate || scrollTargetRequestId === 0 || typeof window === "undefined") {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      const target = list?.querySelector<HTMLElement>(`[data-agenda-date="${scrollTargetDate}"]`);

      if (!list || !target) {
        return;
      }

      const listRect = list.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const nextTop = list.scrollTop + targetRect.top - listRect.top - 12;
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      list.scrollTo({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        top: Math.max(0, nextTop)
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [firstDate, lastDate, renderedEventCount, scrollTargetDate, scrollTargetRequestId]);

  return (
    <div
      className={cn(
        "mt-3 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] touch-pan-y",
        hasSearch
          ? "overflow-visible pb-[calc(env(safe-area-inset-bottom)+168px)]"
          : "max-h-[68vh] overflow-y-auto overscroll-contain"
      )}
      onScroll={handleScroll}
      ref={listRef}
    >
      {renderedEventCount > 0 ? rows : (
        <div className="px-3 py-3">
          <EmptyCalendarState date={getTodayDateKey()} onCreate={onCreate ? () => onCreate(getTodayDateKey()) : undefined} searchQuery={searchQuery} />
        </div>
      )}
    </div>
  );
}

export function UnifiedUserCalendar({
  currentCustomer,
  currentTechnician,
  currentStore,
  displayMode,
  formalOnly = false,
  initialSelectedDate,
  merchantLaneMode = "technician",
  searchQuery = "",
  showSourceDrawer = !formalOnly,
  scope = "user",
  technicians: providedTechnicians
}: UnifiedUserCalendarProps) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const { customers, stores, technicians: entityTechnicians } = useEntityStore();
  const technicians = providedTechnicians ?? entityTechnicians;
  const scheduleSnapshot = useScheduleStore();
  const technicianSnapshot = useTechnicianScheduleStore();
  const dispatchSnapshot = useDispatchCenterStore();
  const activeScope: UnifiedCalendarScope = scope === "merchant" && currentStore ? "merchant" : scope === "technician" && currentTechnician ? "technician" : "user";
  const imScope: ImRoleType = activeScope;
  const imStore = useImStore(imScope);
  const resolvedDisplayMode: UnifiedCalendarDisplayMode = displayMode ?? (activeScope === "merchant" ? "parallel" : "personal");
  const effectiveMerchantLaneMode: MerchantCalendarLaneMode = activeScope === "merchant" ? merchantLaneMode : "technician";
  const isMerchantAppointmentStatusMode = activeScope === "merchant" && effectiveMerchantLaneMode === "appointmentStatus";
  const [view, setView] = useState<UnifiedCalendarView>("day");
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(initialSelectedDate ?? "") ? initialSelectedDate! : getTodayDateKey();
  const [anchorDate, setAnchorDate] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [agendaDateWindow, setAgendaDateWindow] = useState<AgendaDateWindow>(() => createAgendaDateWindow(initialDate));
  const period = getCalendarPeriod(view, anchorDate, agendaDateWindow);
  const formalCacheScope = getAuthenticatedPersistentCacheScope();
  const formalCacheKey = [
    "calendar",
    activeScope,
    currentStore?.id ?? currentTechnician?.id ?? currentCustomer?.id ?? "self",
    formalOnly ? "formal" : "combined",
    isMerchantAppointmentStatusMode ? "appointments" : "schedule",
    period.startDate,
    period.endDate
  ].join(":");
  const cachedFormalData = formalCacheScope
    ? persistentResourceCache.peek<FormalCalendarCacheValue>(formalCacheScope, formalCacheKey)
    : undefined;
  const [agendaScrollRequestId, setAgendaScrollRequestId] = useState(0);
  const [sourceVisibility, setSourceVisibility] = useState(defaultSourceVisibility);
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [birthdayExpanded, setBirthdayExpanded] = useState(false);
  const [birthdayFilters, setBirthdayFilters] = useState<BirthdaySourceFilters>(defaultBirthdaySourceFilters);
  const [birthdayContactQuery, setBirthdayContactQuery] = useState("");
  const [localEvents, setLocalEvents] = useState<LocalCalendarEvent[]>(() => formalOnly ? [] : loadLocalCalendarEvents());
  const [editorDraft, setEditorDraft] = useState<CalendarEditorDraft | null>(null);
  const [participantFlowOpen, setParticipantFlowOpen] = useState(false);
  const [technicianCreationMode, setTechnicianCreationMode] = useState<TechnicianCreationMode>("private");
  const [availabilityCapacity, setAvailabilityCapacity] = useState(1);
  const [editingAvailabilityWindowId, setEditingAvailabilityWindowId] = useState<number | null>(null);
  const [activeEvent, setActiveEvent] = useState<UnifiedCalendarEvent | null>(null);
  const [googleConnectionStatus, setGoogleConnectionStatus] = useState<GoogleCalendarConnectionStatus | null>(null);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<MerchantAppointmentStatusFilter>("all");
  const [formalOrders, setFormalOrders] = useState<Order[]>(() => cachedFormalData?.orders ?? []);
  const [formalMerchantOrders, setFormalMerchantOrders] = useState<BookingOrder[]>(() => cachedFormalData?.merchantOrders ?? []);
  const [formalScheduleSlots, setFormalScheduleSlots] = useState<BookingScheduleSlot[]>(() => cachedFormalData?.scheduleSlots ?? []);
  const [formalAvailabilityWindows, setFormalAvailabilityWindows] = useState<AvailabilityWindow[]>(() => cachedFormalData?.availabilityWindows ?? []);
  const [formalCalendarEvents, setFormalCalendarEvents] = useState<FormalCalendarEvent[]>([]);
  const [formalDataLoading, setFormalDataLoading] = useState(() => cachedFormalData === undefined);
  const [formalScheduleCacheRefreshing, setFormalScheduleCacheRefreshing] = useState(false);
  const [formalDataError, setFormalDataError] = useState("");
  const [formalDataReloadKey, setFormalDataReloadKey] = useState(0);
  const formalDataRequestId = useRef(0);
  const googleCalendarActorId = getGoogleCalendarActorId(activeScope, currentCustomer, currentTechnician, currentStore);
  const appointmentStatusFilterLabel =
    merchantAppointmentStatusFilterOptions.find((option) => option.value === appointmentStatusFilter)?.label ?? "全预约";
  const currentScopeCreator = useMemo(
    () => getCurrentScopeCreator(activeScope, currentCustomer, currentTechnician, currentStore),
    [activeScope, currentCustomer, currentStore, currentTechnician]
  );
  const currentCalendarParticipant = useMemo<CalendarParticipantOption>(() => ({
    id: "self",
    identityId: 0,
    label: currentScopeCreator?.label ?? "我",
    description: "当前用户",
    avatar: activeScope === "technician" ? currentTechnician?.avatar : activeScope === "user" ? currentCustomer?.avatar : undefined,
    tags: [],
    groupIds: [],
    isCommon: true,
  }), [activeScope, currentCustomer?.avatar, currentScopeCreator?.label, currentTechnician?.avatar]);
  const imConfig = getImRoleConfig(imScope);

  useEffect(() => {
    const requestId = formalDataRequestId.current + 1;
    formalDataRequestId.current = requestId;
    let alive = true;
    const isCurrentRequest = () => alive && formalDataRequestId.current === requestId;
    const scheduleFrom = parseDateKey(period.startDate);
    const scheduleTo = parseDateKey(addDays(period.endDate, 1));
    const scheduleResourceKey = activeScope === "merchant" ? currentStore?.id : currentTechnician?.id;
    const scheduleWindowCacheInput =
      formalCacheScope &&
      scheduleResourceKey &&
      activeScope !== "user" &&
      !isMerchantAppointmentStatusMode
        ? {
            cacheScope: formalCacheScope,
            from: scheduleFrom,
            resourceKey: scheduleResourceKey,
            scheduleScope: activeScope === "merchant" ? "merchant-admin" as const : "technician" as const,
            to: scheduleTo
          }
        : null;
    const loadFormalDataFromServer = async (): Promise<FormalCalendarCacheValue> => {
      if (activeScope === "user") {
        if (formalOnly) {
          const from = parseDateKey(period.startDate);
          const to = parseDateKey(addDays(period.endDate, 1));
          const orders = await loadFormalCustomerOrderPeriod(from, to);
          return { orders: orders.map(mapBookingOrderToDomainOrder), merchantOrders: [], scheduleSlots: [], availabilityWindows: [] };
        }
        const response = await bookingApi.listOrders({ page: 1, pageSize: 100 });
        return { orders: response.list.map(mapBookingOrderToDomainOrder), merchantOrders: [], scheduleSlots: [], availabilityWindows: [] };
      }
      const from = scheduleFrom;
      const to = scheduleTo;
      if (isMerchantAppointmentStatusMode) {
        const orders = await loadEveryScopedOrder({ from: from.toISOString(), to: to.toISOString(), dateMode: "overlaps" });
        return { orders: [], merchantOrders: orders, scheduleSlots: [], availabilityWindows: [] };
      }
      const scope = activeScope === "merchant" ? "merchant-admin" : "technician";
      const loadSlots = () => loadManagedScheduleWindow(scope, { from, to });
      const [slots, orders, availabilityWindows] = await Promise.all([
        scheduleWindowCacheInput
          ? refreshFormalScheduleWindow(scheduleWindowCacheInput, loadSlots)
          : loadSlots(),
        activeScope === "technician"
          ? loadEveryScopedOrder({ from: from.toISOString(), to: to.toISOString(), dateMode: "overlaps" })
          : Promise.resolve([]),
        availabilityWindowApi.listAll(scope, { from, to })
      ]);
      return { orders: [], merchantOrders: orders, scheduleSlots: slots, availabilityWindows };
    };
    const applyFormalData = (data: FormalCalendarCacheValue) => {
      if (!isCurrentRequest()) return;
      setFormalOrders(data.orders);
      setFormalMerchantOrders(data.merchantOrders);
      setFormalScheduleSlots(data.scheduleSlots);
      setFormalAvailabilityWindows(data.availabilityWindows ?? []);
      setFormalDataError("");
      setFormalDataLoading(false);
    };
    const unsubscribe = formalCacheScope
      ? persistentResourceCache.subscribe<FormalCalendarCacheValue>(formalCacheScope, formalCacheKey, applyFormalData)
      : () => undefined;
    const loadFormalData = async () => {
      if (scheduleWindowCacheInput) {
        const cachedSchedule = await readFormalScheduleWindow(scheduleWindowCacheInput).catch(() => null);
        if (cachedSchedule && isCurrentRequest()) {
          setFormalScheduleSlots(cachedSchedule);
          setFormalDataLoading(false);
          setFormalScheduleCacheRefreshing(true);
        }
      }
      const cached = formalCacheScope
        ? persistentResourceCache.peek<FormalCalendarCacheValue>(formalCacheScope, formalCacheKey)
        : undefined;
      if (cached) applyFormalData(cached);
      else setFormalDataLoading(true);
      setFormalDataError("");
      try {
        const data = formalCacheScope
          ? await persistentResourceCache.load({
              force: formalDataReloadKey > 0,
              key: formalCacheKey,
              load: loadFormalDataFromServer,
              scope: formalCacheScope
            })
          : await loadFormalDataFromServer();
        applyFormalData(data);
      } catch (error) {
        if (isCurrentRequest()) {
          const fallback = formalCacheScope
            ? persistentResourceCache.peek<FormalCalendarCacheValue>(formalCacheScope, formalCacheKey)
            : undefined;
          if (fallback) applyFormalData(fallback);
          else {
            setFormalDataError(error instanceof Error ? error.message : String(error));
            setFormalOrders([]);
            setFormalMerchantOrders([]);
            setFormalScheduleSlots([]);
            setFormalAvailabilityWindows([]);
          }
        }
      } finally {
        if (isCurrentRequest()) {
          setFormalDataLoading(false);
          setFormalScheduleCacheRefreshing(false);
        }
      }
    };
    void loadFormalData();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [activeScope, formalCacheKey, formalCacheScope, formalDataReloadKey, formalOnly, isMerchantAppointmentStatusMode, period.endDate, period.startDate]);

  useEffect(() => {
    if (!formalOnly || activeScope === "merchant") {
      setFormalCalendarEvents([]);
      return;
    }
    let alive = true;
    const from = parseDateKey(period.startDate);
    const to = parseDateKey(addDays(period.endDate, 1));
    void calendarEventApi.list({ from, to }).then((response) => {
      if (alive) setFormalCalendarEvents(response.list);
    }).catch((error) => {
      if (alive) setFormalDataError((current) => current || (error instanceof Error ? error.message : String(error)));
    });
    return () => { alive = false; };
  }, [activeScope, formalDataReloadKey, formalOnly, period.endDate, period.startDate]);

  useEffect(() => {
    if (!formalOnly) {
      writeBrowserStorage(localCalendarStorageKey, JSON.stringify(localEvents), { silent: true });
    }
  }, [formalOnly, localEvents]);

  const visibleImContacts = useMemo(
    () => getVisibleCalendarContacts(imStore.contacts, imStore.usersById, imScope),
    [imScope, imStore.contacts, imStore.usersById]
  );
  const calendarParticipantOptions = useMemo(
    () => getCalendarParticipantOptions(visibleImContacts, imStore.usersById, imStore.conversations),
    [imStore.conversations, imStore.usersById, visibleImContacts]
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
    return getRelevantTechnicianIds(dispatchSnapshot.arrangements, currentCustomer, technicians, formalOrders);
  }, [activeScope, currentCustomer, currentStore, currentTechnician, dispatchSnapshot.arrangements, formalOrders, technicians]);

  const syncContactOptions = useMemo(() => {
    const baseOptions =
      activeScope === "merchant"
        ? getMerchantSyncContactOptions(currentStore, technicians)
        : activeScope === "technician"
        ? getTechnicianSyncContactOptions(currentTechnician, stores, technicians)
        : getUserSyncContactOptions(currentCustomer, dispatchSnapshot.arrangements, relevantTechnicianIds, stores, technicians, formalOrders);

    return getCompleteSyncContactOptions(baseOptions, commonSyncContactOptions, tagSyncContactOptions, groupSyncContactOptions);
  }, [
    activeScope,
    commonSyncContactOptions,
    currentCustomer,
    currentStore,
    currentTechnician,
    dispatchSnapshot.arrangements,
    groupSyncContactOptions,
    formalOrders,
    relevantTechnicianIds,
    stores,
    tagSyncContactOptions,
    technicians
  ]);

  const parallelCalendarLanes = useMemo(() => {
    if (resolvedDisplayMode !== "parallel") return undefined;
    const lanes = getParallelCalendarLanes(activeScope === "merchant" ? currentStore : undefined, currentTechnician, technicians, "technician");
    const laneIds = new Set(lanes.map((lane) => lane.id));
    for (const slot of [...formalScheduleSlots, ...formalMerchantOrders]) {
      const id = slot.technicianProfileId ? getTechnicianCalendarLaneId(String(slot.technicianProfileId)) : "merchant:unassigned";
      if (laneIds.has(id)) continue;
      laneIds.add(id);
      lanes.push({ id, label: slot.technicianName ?? "未指定技师", accent: "var(--client-muted)" });
    }
    return lanes;
  }, [activeScope, currentStore, currentTechnician, formalMerchantOrders, formalScheduleSlots, resolvedDisplayMode, technicians]);

  const allEvents = useMemo(() => {
    const birthdayEvents = formalOnly ? [] : getBirthdayCalendarEvents(period, currentCustomer, currentTechnician, currentStore, birthdayContactOptions);
    const localCalendarEvents = formalOnly
      ? getFormalPersonalCalendarEvents(formalCalendarEvents, currentScopeCreator)
      : getLocalCalendarEvents(localEvents, syncContactOptions, currentScopeCreator);
    const neeDoEvents = activeScope === "user" && currentCustomer
      ? getOrderEvents(currentCustomer, formalOrders, formalOnly)
      : isMerchantAppointmentStatusMode
        ? getFormalMerchantOrderEvents(formalMerchantOrders)
      : activeScope === "merchant" || activeScope === "technician"
        ? [
            ...getFormalAvailabilityWindowEvents(formalAvailabilityWindows, activeScope),
            ...getFormalScheduleEvents(formalScheduleSlots, activeScope),
            ...(activeScope === "technician" ? getFormalMerchantOrderEvents(formalMerchantOrders, "technician") : []),
          ]
        : [];

    if (isMerchantAppointmentStatusMode) {
      return markBookingConflicts([
        ...localCalendarEvents,
        ...neeDoEvents
      ].map((event) => resolveCalendarCreator(event, imStore.users)).sort(sortEvents));
    }

    return markBookingConflicts([
      ...localCalendarEvents,
      ...neeDoEvents,
      ...birthdayEvents
    ].map((event) => resolveCalendarCreator(event, imStore.users)).sort(sortEvents));
  }, [
    activeScope,
    birthdayContactOptions,
    customers,
    currentCustomer,
    currentStore,
    currentTechnician,
    currentScopeCreator,
    dispatchSnapshot.arrangements,
    effectiveMerchantLaneMode,
    formalOrders,
    formalAvailabilityWindows,
    formalScheduleSlots,
    formalMerchantOrders,
    formalCalendarEvents,
    formalOnly,
    imStore.users,
    isMerchantAppointmentStatusMode,
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
  const normalizedSearchQuery = normalizeCalendarSearchValue(searchQuery);
  const searchFilterView = normalizedSearchQuery ? "agenda" : view;
  const sourceCounts = useMemo(() => {
    const counts = Object.fromEntries((Object.keys(sourceConfigs) as UnifiedCalendarSourceId[]).map((sourceId) => [sourceId, 0])) as Record<UnifiedCalendarSourceId, number>;
    periodEvents.forEach((event) => {
      counts[event.sourceId] += 1;
    });
    return counts;
  }, [periodEvents]);
  const visiblePeriodEvents = useMemo(() => periodEvents.filter((event) => {
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
  }), [birthdayFilters, periodEvents, sourceVisibility]);
  const filteredVisiblePeriodEvents = useMemo(
    () => isMerchantAppointmentStatusMode
      ? visiblePeriodEvents.filter((event) => event.sourceId !== "merchant" || matchesMerchantAppointmentStatusFilter(event, appointmentStatusFilter))
      : visiblePeriodEvents,
    [appointmentStatusFilter, isMerchantAppointmentStatusMode, visiblePeriodEvents]
  );
  const searchedVisiblePeriodEvents = useMemo(
    () => filteredVisiblePeriodEvents.filter((event) => matchesCalendarSearch(event, normalizedSearchQuery, searchFilterView)),
    [filteredVisiblePeriodEvents, normalizedSearchQuery, searchFilterView]
  );
  const groupedVisibleEvents = groupEventsByDate(searchedVisiblePeriodEvents);
  const selectedDateEvents = (groupedVisibleEvents[selectedDate] ?? []).sort(sortEvents);
  const displayActiveEvent = activeEvent ? allEvents.find((event) => event.id === activeEvent.id) ?? activeEvent : null;
  const currentImUserId = imStore.currentUserId;
  const ensureCreatorConversation = imStore.ensureDirectConversation;

  const openCreatorChat = useCallback(async (event: UnifiedCalendarEvent) => {
    if (!event.creatorUserId || event.creatorUserId === currentImUserId) {
      return;
    }

    const conversation = await ensureCreatorConversation(event.creatorUserId);
    setActiveEvent(null);
    navigate(imConfig.routes.conversation(conversation.id));
  }, [currentImUserId, ensureCreatorConversation, imConfig.routes, navigate]);

  useEffect(() => {
    if (formalOnly || !normalizedSearchQuery || view === "agenda") {
      return;
    }

    setView("agenda");
    setAgendaDateWindow(createAgendaDateWindow(anchorDate));
  }, [anchorDate, formalOnly, normalizedSearchQuery, view]);

  const extendAgendaDateWindow = (direction: -1 | 1) => {
    setAgendaDateWindow((current) => (
      direction < 0
        ? { ...current, startDate: addDays(current.startDate, -agendaExtendChunkDays) }
        : { ...current, endDate: addDays(current.endDate, agendaExtendChunkDays) }
    ));
  };

  const shiftPeriod = (direction: -1 | 1) => {
    const nextAnchorDate = shiftCalendarAnchor(view, anchorDate, direction);
    setAnchorDate(nextAnchorDate);
    if (view === "agenda") {
      setAgendaDateWindow(createAgendaDateWindow(nextAnchorDate));
    }
    if (view === "day" || view === "threeDay" || view === "week" || view === "agenda") {
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
    if (nextView === "agenda" && !isDateInRange(selectedDate, agendaDateWindow.startDate, agendaDateWindow.endDate)) {
      setAgendaDateWindow(createAgendaDateWindow(selectedDate));
    }
    if (nextView === "agenda") {
      setAgendaScrollRequestId((current) => current + 1);
    }
    if (nextView === "day" || nextView === "threeDay") {
      setAnchorDate(selectedDate);
    }
  };
  const openDateInDayView = (date: string) => {
    setSelectedDate(date);
    setAnchorDate(date);
    setView("day");
  };

  const jumpToToday = () => {
    const today = getTodayDateKey();
    setAnchorDate(today);
    setSelectedDate(today);
    if (view === "agenda") {
      setAgendaDateWindow(createAgendaDateWindow(today));
      setAgendaScrollRequestId((current) => current + 1);
    }
  };

  const openCreate = (date = selectedDate, startTime?: string, endTime?: string, calendarId?: string, calendarLabel?: string) => {
    setParticipantFlowOpen(false);
    setTechnicianCreationMode("private");
    setAvailabilityCapacity(1);
    setEditingAvailabilityWindowId(null);
    const defaultCalendarTarget = getDefaultLocalCalendarTarget(activeScope);
    const resolvedCalendarId = calendarId ?? defaultCalendarTarget.calendarId;
    const resolvedCalendarLabel = calendarLabel ?? defaultCalendarTarget.calendarLabel;
    const defaultStartMinute =
      startTime === undefined && date === getTodayDateKey()
        ? clampDraftMinute(new Date().getHours() * 60 + new Date().getMinutes(), 0, 24 * 60 - 60)
        : timeToMinutes(startTime ?? "10:00");
    const defaultRange = normalizeDraftRange(defaultStartMinute, endTime ? timeToMinutes(endTime) : defaultStartMinute + 60);
    setEditorDraft({
      id: "",
      calendarId: resolvedCalendarId,
      calendarLabel: resolvedCalendarLabel,
      date,
      endDate: date,
      startTime: minutesToTime(defaultRange.start),
      endTime: minutesToTime(defaultRange.end),
      title: "",
      location: resolvedCalendarId === "user:me" ? "" : resolvedCalendarLabel,
      note: "",
      url: "",
      images: [],
      reminder: "30 分钟前",
      allDay: false,
      repeatRule: "none",
      syncContactIds: [],
      visibility: "未同步"
    });
  };

  const saveDraft = async () => {
    if (!editorDraft) {
      return;
    }

    if (formalOnly) {
      try {
        const input = toFormalCalendarEventInput(editorDraft);
        if (activeScope === "technician" && technicianCreationMode === "availability") {
          if (!Number.isInteger(availabilityCapacity) || availabilityCapacity < 1 || availabilityCapacity > 100) return;
          const availabilityInput = {
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            capacity: availabilityCapacity
          };
          const saved = editingAvailabilityWindowId === null
            ? await availabilityWindowApi.create("technician", availabilityInput)
            : await availabilityWindowApi.update("technician", editingAvailabilityWindowId, availabilityInput);
          setFormalAvailabilityWindows((windows) => editingAvailabilityWindowId === null
            ? [...windows, saved]
            : windows.map((window) => window.id === saved.id ? saved : window));
          setSelectedDate(editorDraft.date);
          setAnchorDate(editorDraft.date);
          setView("day");
          setTechnicianCreationMode("private");
          setEditingAvailabilityWindowId(null);
          setEditorDraft(null);
          return;
        }
        if (activeScope === "technician" && technicianCreationMode === "manualBooking") {
          const query = new URLSearchParams({
            mode: technicianCreationMode,
            startsAt: input.startsAt,
            endsAt: input.endsAt
          });
          navigate(`/technician/schedule/new?${query.toString()}`);
          setEditorDraft(null);
          return;
        }
        const id = formalCalendarEventId(editorDraft.id);
        const current = id === null ? null : formalCalendarEvents.find((event) => event.id === id) ?? null;
        const saved = current
          ? await calendarEventApi.update(current.id, { ...input, expectedVersion: current.version })
          : await calendarEventApi.create(input, globalThis.crypto?.randomUUID?.() ?? `calendar-${Date.now()}`);
        setFormalCalendarEvents((events) => current
          ? events.map((event) => event.id === saved.id ? saved : event)
          : [...events, saved]);
        const start = new Date(saved.startsAt);
        const pad = (value: number) => String(value).padStart(2, "0");
        const savedDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
        setSelectedDate(savedDate);
        setAnchorDate(savedDate);
        setView("day");
        setFormalDataError("");
        setEditorDraft(null);
      } catch (error) {
        setFormalDataError(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    const now = new Date().toISOString();
    const normalizedDate = editorDraft.date || getTodayDateKey();
    const normalizedStart = editorDraft.allDay ? "00:00" : editorDraft.startTime || "10:00";
    let normalizedEndDate = editorDraft.allDay ? normalizedDate : editorDraft.endDate || normalizedDate;
    let normalizedEnd = editorDraft.allDay ? "23:59" : editorDraft.endTime || "";

    if (`${normalizedEndDate}T${normalizedEnd}` <= `${normalizedDate}T${normalizedStart}`) {
      normalizedEndDate = normalizedDate;
      normalizedEnd = addMinutesToTime(normalizedStart, 60);
    }

    const syncContactLabels = getSyncContactLabels(editorDraft.syncContactIds, syncContactOptions);
    const normalized: LocalCalendarEvent = {
      ...editorDraft,
      id: editorDraft.id || `user-local-${Date.now()}`,
      calendarId: editorDraft.calendarId,
      calendarLabel: editorDraft.calendarLabel,
      date: normalizedDate,
      endDate: normalizedEndDate,
      title: editorDraft.title.trim() || "（无标题）",
      note: editorDraft.note.trim(),
      url: editorDraft.url.trim(),
      images: editorDraft.images,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      allDay: editorDraft.allDay,
      repeatRule: normalizeCalendarRepeatRule(editorDraft.repeatRule),
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
    setParticipantFlowOpen(false);
    if (formalOnly) {
      if (event.availabilityWindowId) {
        const window = formalAvailabilityWindows.find((item) => item.id === event.availabilityWindowId);
        if (!window) return;
        const start = new Date(window.startsAt);
        const end = new Date(window.endsAt);
        const pad = (value: number) => String(value).padStart(2, "0");
        const dateValue = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
        const timeValue = (value: Date) => `${pad(value.getHours())}:${pad(value.getMinutes())}`;
        setActiveEvent(null);
        setParticipantFlowOpen(false);
        setTechnicianCreationMode("availability");
        setAvailabilityCapacity(window.capacity);
        setEditingAvailabilityWindowId(window.id);
        setEditorDraft({
          id: event.id,
          calendarId: event.calendarId ?? "formal:personal",
          calendarLabel: event.calendarLabel ?? "我的行程",
          date: dateValue(start),
          endDate: dateValue(end),
          startTime: timeValue(start),
          endTime: timeValue(end),
          title: event.title,
          location: "",
          note: "",
          url: "",
          images: [],
          reminder: "不提醒",
          allDay: false,
          repeatRule: "none",
          syncContactIds: [],
          visibility: "未同步"
        });
        return;
      }
      setEditingAvailabilityWindowId(null);
      const id = formalCalendarEventId(event.id);
      const formalEvent = id === null ? null : formalCalendarEvents.find((item) => item.id === id);
      if (!formalEvent) return;
      const start = new Date(formalEvent.startsAt);
      const end = new Date(formalEvent.endsAt);
      const pad = (value: number) => String(value).padStart(2, "0");
      const dateValue = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
      const timeValue = (value: Date) => `${pad(value.getHours())}:${pad(value.getMinutes())}`;
      setActiveEvent(null);
      setEditorDraft({
        id: event.id,
        calendarId: "formal:personal",
        calendarLabel: "我的行程",
        date: dateValue(start),
        endDate: dateValue(end),
        startTime: timeValue(start),
        endTime: timeValue(end),
        title: formalEvent.title,
        location: formalEvent.location,
        note: formalEvent.note,
        url: formalEvent.url,
        images: formalEvent.imageUrls.map((dataUrl, index) => ({ id: `formal-image-${index}`, name: `图片 ${index + 1}`, dataUrl })),
        reminder: formalEvent.reminderMinutes === null ? "不提醒" : formalEvent.reminderMinutes === 60 ? "1 小时前" : `${formalEvent.reminderMinutes} 分钟前`,
        allDay: formalEvent.allDay,
        repeatRule: formalEvent.repeatRule,
        syncContactIds: formalEvent.participantIdentityIds.map(String),
        visibility: formalEvent.visibility === "participants" ? "参加者" : "仅自己"
      });
      return;
    }
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
      endDate: localEvent.endDate || localEvent.date,
      startTime: localEvent.startTime,
      endTime: localEvent.endTime,
      title: localEvent.title,
      location: localEvent.location,
      note: localEvent.note,
      url: localEvent.url,
      images: localEvent.images,
      reminder: normalizeCalendarReminderLabel(localEvent.reminder),
      allDay: localEvent.allDay,
      repeatRule: normalizeCalendarRepeatRule(localEvent.repeatRule),
      syncContactIds: localEvent.syncContactIds,
      visibility: localEvent.visibility
    });
  };

  const deleteEvent = (event: UnifiedCalendarEvent) => {
    if (formalOnly) {
      if (event.availabilityWindowId) {
        void availabilityWindowApi.delete("technician", event.availabilityWindowId).then(() => {
          setFormalAvailabilityWindows((windows) => windows.filter((window) => window.id !== event.availabilityWindowId));
          setActiveEvent(null);
        }).catch((error) => setFormalDataError(error instanceof Error ? error.message : String(error)));
        return;
      }
      const id = formalCalendarEventId(event.id);
      const current = id === null ? null : formalCalendarEvents.find((item) => item.id === id);
      if (!current) return;
      void calendarEventApi.remove(current.id, current.version).then(() => {
        setFormalCalendarEvents((events) => events.filter((item) => item.id !== current.id));
        setActiveEvent(null);
      }).catch((error) => setFormalDataError(error instanceof Error ? error.message : String(error)));
      return;
    }
    setLocalEvents((current) => current.filter((item) => item.id !== event.id));
    setActiveEvent(null);
  };

  const openCalendarEvent = (event: UnifiedCalendarEvent) => {
    setActiveEvent(event);
  };

  const renderParticipantTimeline = ({
    busyRanges,
    conflictIdentityIds,
    draft,
    onParticipantRemove,
    onTimeChange,
    participants,
  }: CalendarParticipantTimelineRenderInput) => {
    const laneId = (participant: CalendarParticipantOption) => `participant:${participant.id}`;
    const participantByIdentityId = new Map(participants.map((participant) => [participant.identityId, participant]));
    const lanes: UnifiedCalendarLane[] = participants.map((participant, index) => ({
      id: laneId(participant),
      label: participant.label,
      caption: participant.description,
      accent: conflictIdentityIds.has(participant.identityId) ? "#ef4444" : "#36d67b",
      avatar: participant.avatar,
      centerHeader: true,
      onRemove: index === 0 ? undefined : () => onParticipantRemove(participant.id),
    }));
    const personalEvents = allEvents
      .filter((event) => event.date === draft.date)
      .map((event) => ({
        ...event,
        calendarId: laneId(currentCalendarParticipant),
        calendarLabel: currentCalendarParticipant.label,
      }));
    const privateBusyEvents: UnifiedCalendarEvent[] = busyRanges.flatMap((busy, busyIndex) => {
      const participant = participantByIdentityId.get(busy.participantIdentityId);
      if (!participant) return [];
      return getFormalCalendarSegments(busy.startsAt, busy.endsAt)
        .filter((segment) => segment.date === draft.date)
        .map((segment) => ({
          id: `participant-busy-${busy.participantIdentityId}-${busyIndex}-${segment.date}`,
          sourceId: "user" as const,
          calendarId: laneId(participant),
          calendarLabel: participant.label,
          date: segment.date,
          startTime: segment.startTime,
          endTime: segment.endTime,
          title: "已锁定",
          subtitle: "占用",
          badge: "已锁定",
          readOnly: true,
          visibility: "已锁定",
        }));
    });
    const conflictLaneIds = new Set(
      participants
        .filter((participant) => conflictIdentityIds.has(participant.identityId))
        .map(laneId)
    );

    return (
      <UnifiedCalendarDayTimeline
        calendarLanes={lanes}
        date={draft.date}
        draftConflictCalendarIds={conflictLaneIds}
        draftRangeValue={{ start: timeToMinutes(draft.startTime), end: timeToMinutes(draft.endTime) }}
        events={[...personalEvents, ...privateBusyEvents]}
        onDraftRangeChange={(range) => onTimeChange(minutesToTime(range.start), minutesToTime(range.end))}
        onOpen={() => undefined}
        spanDraftAcrossLanes
      />
    );
  };

  const refreshGoogleCalendarStatus = async () => {
    const status = await fetchGoogleCalendarApi<GoogleCalendarConnectionStatus>(
      `/api/google-calendar/status?actorId=${encodeURIComponent(googleCalendarActorId)}`
    );
    setGoogleConnectionStatus(status);
    return status;
  };

  const connectGoogleCalendar = async () => {
    if (typeof window !== "undefined") {
      window.location.hash = getGoogleCalendarSettingsPath(activeScope);
    }

    return {
      count: 0,
      message: "已前往设置页面绑定 Google 账号。"
    };
  };

  const exportGoogleCalendarEvents = async () => {
    const exportableEvents = searchedVisiblePeriodEvents.filter((event) => event.date && event.startTime && event.endTime);
    if (exportableEvents.length === 0) {
      return {
        count: 0,
        message: "当前视图没有可同步到 Google 日历的行程。"
      };
    }

    const response = await fetchGoogleCalendarApi<GoogleCalendarApiExportResponse>("/api/google-calendar/export", {
      method: "POST",
      body: JSON.stringify({
        actorId: googleCalendarActorId,
        calendarId: "primary",
        events: exportableEvents.map(toGoogleCalendarApiPayload)
      })
    });
    await refreshGoogleCalendarStatus().catch(() => null);

    return {
      count: response.count,
      message: response.message ?? `已通过接口同步 ${response.count} 件 NeeDo 行程到 Google 日历。`
    };
  };

  const importGoogleCalendarEvents = async () => {
    const timeMaxDate = addDays(period.endDate, 1);
    const response = await fetchGoogleCalendarApi<GoogleCalendarApiImportResponse<LocalCalendarEvent>>("/api/google-calendar/import", {
      method: "POST",
      body: JSON.stringify({
        actorId: googleCalendarActorId,
        calendarId: "primary",
        timeMin: `${period.startDate}T00:00:00+09:00`,
        timeMax: `${timeMaxDate}T00:00:00+09:00`,
        maxResults: 120
      })
    });
    const importedEvents = (response.events ?? [])
      .map(normalizeLocalCalendarEvent)
      .filter((event): event is LocalCalendarEvent => Boolean(event));

    if (importedEvents.length > 0) {
      setLocalEvents((current) => {
        const next = [...current];
        importedEvents.forEach((event) => {
          const existingIndex = next.findIndex((item) => item.id === event.id || (event.googleEventId && item.googleEventId === event.googleEventId));
          if (existingIndex >= 0) {
            next[existingIndex] = {
              ...next[existingIndex],
              ...event,
              createdAt: next[existingIndex].createdAt,
              updatedAt: new Date().toISOString()
            };
            return;
          }
          next.push(event);
        });
        return next;
      });
      const firstEvent = importedEvents[0];
      if (firstEvent) {
        setSelectedDate(firstEvent.date);
        setAnchorDate(firstEvent.date);
        setView("day");
      }
    }
    await refreshGoogleCalendarStatus().catch(() => null);

    return {
      count: importedEvents.length,
      message:
        response.message ??
        (importedEvents.length > 0
          ? `已通过接口从 Google 日历导入 ${importedEvents.length} 件行程。`
          : "Google 日历在当前日期范围内没有可导入行程。")
    };
  };

  return (
    <UnifiedCalendarSurface data-unified-user-calendar="true">
      {formalScheduleCacheRefreshing ? (
        <ScheduleCacheRefreshIndicator label={translateText("加载正式排班中", language)} />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {showSourceDrawer ? <button
            aria-label="打开日历来源"
            className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)]"
            onClick={() => setSourceDrawerOpen((current) => !current)}
            type="button"
          >
            <AppIcon name="menu" />
          </button> : null}
          <div className="min-w-0">
            <strong className="block truncate text-lg font-black text-[color:var(--client-text)]">{period.label}</strong>
            <span className="mt-0.5 block text-[11px] font-black text-[color:var(--client-muted)]">
              {activeScope === "merchant"
                ? isMerchantAppointmentStatusMode ? appointmentStatusFilterLabel : "多技师并行日程"
                : activeScope === "technician" ? "我的排班" : "我的同步日程"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            className="focus-ring h-9 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3 text-[12px] font-black text-[color:var(--client-text)]"
            onClick={jumpToToday}
            type="button"
          >
            今天
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
        <ScheduleViewPicker
          ariaLabel="切换日程展示范围"
          label="显示"
          onChange={(nextView) => changeView(nextView as UnifiedCalendarView)}
          options={viewOptions}
          value={view === "agenda" ? "day" : view}
        />
        <button
          className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-lg font-black text-[color:var(--client-text)]"
          onClick={() => shiftPeriod(1)}
          type="button"
        >
          ›
        </button>
      </div>

      {normalizedSearchQuery ? (
        <div className="mt-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary-soft)_52%,var(--client-elevated)_48%)] px-3 py-2 text-[11px] font-black text-[color:var(--client-accent-text)]">
          搜索「{searchQuery.trim()}」 · 当前视图 {searchedVisiblePeriodEvents.length} 件
        </div>
      ) : null}

      {formalDataLoading ? <div className="mt-2 rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3 py-2 text-[11px] font-black text-[color:var(--client-muted)]">正在读取正式日程...</div> : null}
      {formalDataError ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-[16px] border border-red-300 bg-red-50 px-3 py-2 text-[11px] font-black text-red-700" role="alert">
          <span>正式日程读取失败：{formalDataError}</span>
          <button
            className="focus-ring shrink-0 rounded-full border border-red-300 px-3 py-1.5"
            onClick={() => setFormalDataReloadKey((current) => current + 1)}
            type="button"
          >
            重试
          </button>
        </div>
      ) : null}

      {isMerchantAppointmentStatusMode ? (
        <div className="mt-3 grid grid-cols-3 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_84%,transparent)] p-1">
          {merchantAppointmentStatusFilterOptions.map((option) => (
            <button
              className={cn(
                "focus-ring h-9 min-w-0 rounded-full px-1 text-[12px] font-black transition",
                appointmentStatusFilter === option.value
                  ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_10px_20px_color-mix(in_srgb,var(--client-primary)_20%,transparent)]"
                  : "text-[color:var(--client-muted)]"
              )}
              key={option.value}
              onClick={() => setAppointmentStatusFilter(option.value)}
              type="button"
            >
              <span className="block truncate">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {view === "day" ? (
        <div className="mt-3">
          <DayTimeline
            calendarLanes={parallelCalendarLanes}
            date={selectedDate}
            emptySearchQuery={normalizedSearchQuery ? searchQuery.trim() : undefined}
            events={selectedDateEvents}
            onCreate={formalOnly && activeScope === "merchant" ? undefined : openCreate}
            onOpen={openCalendarEvent}
          />
        </div>
      ) : view === "threeDay" || view === "week" ? (
        <div className="mt-3">
          <UnifiedCalendarMultiDayTimeline
            dates={view === "threeDay" ? getThreeDayDates(anchorDate) : getWeekDates(anchorDate)}
            emptySearchQuery={normalizedSearchQuery ? searchQuery.trim() : undefined}
            events={searchedVisiblePeriodEvents}
            onCreate={formalOnly && activeScope === "merchant" ? undefined : openCreate}
            onOpen={openCalendarEvent}
            onSelectDate={openDateInDayView}
            selectedDate={selectedDate}
          />
        </div>
      ) : view === "month" ? (
        <div className="mt-3">
          <UnifiedCalendarMonthGrid
            anchorDate={anchorDate}
            dates={getMonthGridDates(anchorDate)}
            eventsByDate={groupedVisibleEvents}
            onOpen={openCalendarEvent}
            onSelectDate={openDateInDayView}
            selectedDate={selectedDate}
          />
        </div>
      ) : (
        <UnifiedCalendarAgendaView
          dates={period.dates}
          events={searchedVisiblePeriodEvents}
          onCreate={formalOnly && activeScope === "merchant" ? undefined : (date) => openCreate(date)}
          onExtendFuture={() => extendAgendaDateWindow(1)}
          onExtendPast={() => extendAgendaDateWindow(-1)}
          onOpen={openCalendarEvent}
          scrollTargetDate={selectedDate}
          scrollTargetRequestId={agendaScrollRequestId}
          searchQuery={searchQuery}
        />
      )}

      {editorDraft && (!formalOnly || activeScope !== "merchant") ? (
        <CalendarEventEditorPage
          availabilityCapacity={activeScope === "technician" ? availabilityCapacity : undefined}
          draft={editorDraft}
          onChange={setEditorDraft}
          onClose={() => {
            setParticipantFlowOpen(false);
            setEditingAvailabilityWindowId(null);
            setEditorDraft(null);
          }}
          onOpenParticipantFlow={() => setParticipantFlowOpen(true)}
          onAvailabilityCapacityChange={activeScope === "technician" ? setAvailabilityCapacity : undefined}
          onSave={saveDraft}
          saveDisabled={activeScope === "technician" && technicianCreationMode === "availability"
            ? !Number.isInteger(availabilityCapacity) || availabilityCapacity < 1 || availabilityCapacity > 100
            : false}
          technicianCreationMode={activeScope === "technician" ? technicianCreationMode : undefined}
          onTechnicianCreationModeChange={activeScope === "technician" ? setTechnicianCreationMode : undefined}
        />
      ) : null}
      {editorDraft && participantFlowOpen && (!formalOnly || activeScope !== "merchant") ? (
        <Suspense fallback={null}>
          <CalendarParticipantFlow
            currentParticipant={currentCalendarParticipant}
            draft={editorDraft}
            onClose={() => setParticipantFlowOpen(false)}
            onComplete={(draft) => {
              setEditorDraft((current) => current ? { ...current, ...draft } : current);
              setParticipantFlowOpen(false);
            }}
            onDraftChange={(draft) => setEditorDraft((current) => current ? { ...current, ...draft } : current)}
            options={calendarParticipantOptions}
            renderTimeline={renderParticipantTimeline}
          />
        </Suspense>
      ) : null}
      {displayActiveEvent ? (
        <UnifiedCalendarEventDetailPage
          event={displayActiveEvent}
          onBack={() => setActiveEvent(null)}
          onContactCreator={displayActiveEvent.creatorUserId && displayActiveEvent.creatorUserId !== imStore.currentUserId ? openCreatorChat : undefined}
          onDelete={displayActiveEvent.readOnly ? undefined : deleteEvent}
          onEdit={displayActiveEvent.readOnly ? undefined : openEdit}
          onOpenAppointmentDetail={(event) => {
            const appointmentDetailId = getCalendarAppointmentDetailId(event);

            if (!appointmentDetailId) {
              return;
            }

            setActiveEvent(null);
            navigate(getScheduleOrderDetailRoute(appointmentDetailId, activeScope));
          }}
          onSync={formalOnly ? undefined : (event) => {
            setActiveEvent(null);
            setSourceDrawerOpen(true);
            void event;
          }}
        />
      ) : null}
      {showSourceDrawer ? <CalendarSourceDrawer
        birthdayContactOptions={birthdayContactOptions}
        birthdayContactQuery={birthdayContactQuery}
        birthdayExpanded={birthdayExpanded}
        birthdayFilters={birthdayFilters}
        birthdayTagOptions={calendarContactTagOptions}
        googleConnectionStatus={googleConnectionStatus}
        googleSyncEventCount={searchedVisiblePeriodEvents.length}
        formalOnly={formalOnly}
        onGoogleConnect={connectGoogleCalendar}
        onGoogleExport={exportGoogleCalendarEvents}
        onGoogleImport={importGoogleCalendarEvents}
        onGoogleStatusRefresh={refreshGoogleCalendarStatus}
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
      /> : null}
      {(!formalOnly || activeScope !== "merchant") ? <FloatingActionButton
        ariaLabel="新增行程"
        onClick={() => openCreate(selectedDate)}
        storageKey={`needo.fab.schedule-create.${activeScope}`}
        title="新增行程"
      >
        <AppIcon name="plus" />
      </FloatingActionButton> : null}
    </UnifiedCalendarSurface>
  );
}
