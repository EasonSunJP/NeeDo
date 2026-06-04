import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent as ReactChangeEvent, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type UIEvent as ReactUIEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppIcon, floatingHeaderControlButtonClassName, type IconName } from "../client-ui/AppScaffold";
import { FloatingActionButton } from "../mobile/FloatingActionButton";
import { MobileFullscreenCloseButton, MobileFullscreenHeader } from "../mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../mobile/MobileFullscreenPage";
import { HolidayCornerBadge } from "./HolidayCornerBadge";
import { ScheduleDraftRangeBlock, scheduleDraftRangeVisualMinHeight } from "./ScheduleDraftRangeBlock";
import { AvatarImage } from "../ui/AvatarImage";
import { ConversationListItem } from "../ui/ConversationListItem";
import { orders } from "../../data/mock";
import { useDispatchCenterStore } from "../../features/dispatch-center/store";
import type { DispatchArrangement } from "../../features/dispatch-center/domain";
import { getDisplayName, type ContactRelation, type Conversation, type ImRoleType, type ImUser } from "../../features/im/model";
import { getImRoleConfig, isContactVisibleForRole } from "../../features/im/role-config";
import { useImStore } from "../../features/im/store";
import { useHorizontalDragScroll } from "../../lib/useHorizontalDragScroll";
import { cn } from "../../lib/utils";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { japaneseHolidaySeeds } from "../../lib/japaneseHolidays";
import { getNeedoAppBookingTitle } from "../../lib/scheduleBookingTitle";
import { getScheduleOrderDetailRoute, type ScheduleDetailTargetType } from "../../lib/scheduleDetailTarget";
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

export type UnifiedCalendarView = "day" | "threeDay" | "week" | "month" | "agenda";
type UnifiedCalendarScope = "user" | "technician" | "merchant";
type UnifiedCalendarDisplayMode = "personal" | "parallel";
type MerchantCalendarLaneMode = "technician" | "appointmentStatus";
export type UnifiedCalendarSourceId = "user" | "technician" | "merchant" | "todo" | "birthday" | "holiday";
type CalendarRepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly";

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
  detailPath?: string;
};

export type UnifiedCalendarEvent = {
  id: string;
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

type UnifiedUserCalendarProps = {
  currentCustomer?: Customer;
  currentTechnician?: Technician;
  currentStore?: Store;
  displayMode?: UnifiedCalendarDisplayMode;
  merchantLaneMode?: MerchantCalendarLaneMode;
  searchQuery?: string;
  scope?: UnifiedCalendarScope;
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
const personalSourceIds: UnifiedCalendarSourceId[] = ["todo", "birthday", "holiday"];

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
  return technician?.nickname?.trim() || technician?.name || "技师";
}

function getStoreName(stores: ReturnType<typeof useEntityStore>["stores"], storeId: string) {
  return stores.find((store) => store.id === storeId)?.name ?? "店铺";
}

function getCustomerDisplayName(customer: Customer) {
  return customer.nickname?.trim() || customer.name;
}

function getTechnicianDisplayName(technician: Technician) {
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
  currentTechnician: Technician | undefined,
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
    to: getScopedProfileDetailPath(scope, "technician", technician.id)
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
  technicians: Technician[]
): UnifiedCalendarEvent[] {
  const customerOrderIds = new Set(orders.filter((order) => order.customerId === currentCustomer.id).map((order) => order.id));
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
  if (filter === "assigned") {
    return event.calendarId === merchantAssignedAppointmentLaneId;
  }

  if (filter === "unassigned") {
    return event.calendarId === merchantUnassignedAppointmentLaneId;
  }

  return true;
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
  currentTechnician: Technician | undefined,
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
        detailPath: getScopedProfileDetailPath("technician", "technician", currentTechnician.id)
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
              onClick={() => setGoogleSyncExpanded((current) => !current)}
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
  const badgeLabel = compact ? source.shortLabel : event.badge;
  return (
    <button
      className={cn(
        "focus-ring h-full w-full overflow-hidden rounded-[16px] border px-3 py-2.5 text-left shadow-[0_12px_24px_color-mix(in_srgb,var(--calendar-accent)_12%,transparent)] transition active:scale-[0.99]",
        "border-[color:color-mix(in_srgb,var(--calendar-accent)_38%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--calendar-soft)_88%,var(--client-elevated)),color-mix(in_srgb,var(--client-elevated)_88%,transparent))]"
      )}
      data-calendar-event-card="true"
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
            "grid place-items-center border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[12px] font-black text-[color:var(--client-muted)]",
            floating ? "h-11 w-11 rounded-[14px]" : "h-10 w-10 avatar-shape"
          )}
        >
          {calendar.label.slice(0, 1)}
        </span>
      )}
      <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[color:var(--client-elevated)]" style={{ backgroundColor: calendar.accent }} />
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

type DayTimelineProps = {
  calendarLanes?: UnifiedCalendarLane[];
  date: string;
  emptySearchQuery?: string;
  events: UnifiedCalendarEvent[];
  onCreate?: (date: string, startTime: string, endTime: string, calendarId?: string, calendarLabel?: string) => void;
  onOpen: (event: UnifiedCalendarEvent) => void;
};

function DayTimeline({
  calendarLanes,
  date,
  emptySearchQuery,
  events,
  onCreate,
  onOpen
}: DayTimelineProps) {
  const now = new Date();
  const today = getTodayDateKey();
  const activeCalendarLanes = calendarLanes?.length ? calendarLanes : null;
  const hasParallelCalendars = Boolean(activeCalendarLanes?.length);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const timelineRootRef = useRef<HTMLDivElement | null>(null);
  const timelineHeaderRef = useRef<HTMLDivElement | null>(null);
  const [draftRange, setDraftRange] = useState<DraftRange | null>(null);
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
  const layout = getLayoutEvents(events);
  const handleTimelineScrollLeftChange = useCallback((scrollLeft: number) => {
    setTimelineScrollLeft((current) => (Math.abs(current - scrollLeft) < 0.5 ? current : scrollLeft));
  }, []);
  const { scrollRef, dragScrollProps } = useHorizontalDragScroll({ onScrollLeftChange: handleTimelineScrollLeftChange });
  const parallelLayouts = activeCalendarLanes
    ? activeCalendarLanes.flatMap((calendar, calendarIndex) => {
        const calendarLayout = getLayoutEvents(events.filter((event) => (event.calendarId ?? "user:me") === calendar.id));
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
      if (!draftRangeRef.current || isDraftInteractionTarget(event.target)) {
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
  }, []);

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
      "focus-ring pointer-events-auto grid h-[54px] w-[54px] place-items-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] shadow-[0_12px_26px_rgba(0,0,0,0.26)] backdrop-blur-xl transition active:scale-95";

    return calendar.detailPath ? (
      <Link
        aria-label={`浮动查看${calendar.label}详情`}
        className={buttonClassName}
        data-calendar-floating-lane-button="true"
        key={calendar.id}
        to={calendar.detailPath}
      >
        <CalendarLaneAvatar calendar={calendar} floating />
      </Link>
    ) : (
      <div
        aria-disabled="true"
        aria-label={calendar.label}
        className={buttonClassName}
        data-calendar-floating-lane-button="true"
        key={calendar.id}
        role="button"
      >
        <CalendarLaneAvatar calendar={calendar} floating />
      </div>
    );
  };

  return (
    <div
      className="overflow-visible rounded-none border-0 bg-transparent"
      data-calendar-day-timeline="true"
      ref={timelineRootRef}
    >
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
              className="grid h-14 items-center justify-items-center"
              style={{
                gridTemplateColumns: `repeat(${activeCalendarLanes.length}, minmax(${timelineLaneMinWidth}px, 1fr))`,
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
              className="grid border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)]"
              data-calendar-lane-header="true"
              ref={timelineHeaderRef}
              style={{ gridTemplateColumns: `${timelineTimeColumnWidth}px minmax(0, 1fr)` }}
            >
              <div
                className="sticky left-0 z-[12] border-r border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-transparent"
                data-calendar-time-corner="true"
              />
              <div className="grid" style={{ gridTemplateColumns: `repeat(${activeCalendarLanes.length}, minmax(${timelineLaneMinWidth}px, 1fr))` }}>
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
                    "focus-ring flex min-h-[68px] min-w-0 items-center gap-2 border-r border-[color:color-mix(in_srgb,var(--client-line)_46%,transparent)] px-2.5 py-2 text-left transition last:border-r-0",
                    calendar.detailPath ? "hover:bg-[color:color-mix(in_srgb,var(--client-primary-soft)_34%,transparent)] active:brightness-95" : "cursor-default"
                  );

                  return calendar.detailPath ? (
                    <Link aria-label={`查看${calendar.label}详情`} className={laneClassName} data-calendar-lane-heading="true" key={calendar.id} to={calendar.detailPath}>
                      {content}
                    </Link>
                  ) : (
                    <div aria-disabled="true" aria-label={calendar.label} className={laneClassName} data-calendar-lane-heading="true" key={calendar.id} role="button">
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="grid" style={{ gridTemplateColumns: `${timelineTimeColumnWidth}px minmax(0, 1fr)` }}>
            <div
              className="sticky left-0 z-[12] border-r border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-transparent shadow-none"
              data-calendar-time-column="true"
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
            <div className="relative touch-pan-y" data-calendar-time-canvas="true" onClick={handleCanvasClick} onPointerDown={handleCanvasPointerDown} ref={canvasRef} style={{ height: totalHeight }}>
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
                    const laneCount = hasOverflowLayout ? layout.laneCount : layout.cappedLaneCount;
                    const displayLane = hasOverflowLayout ? lane : Math.min(lane, laneCount - 1);
                    const width = hasOverflowLayout
                      ? timelineOverflowLaneWidth - 12
                      : laneCount > 1 ? `calc((100% - 18px) / ${laneCount})` : "calc(100% - 16px)";
                    const left = hasOverflowLayout
                      ? 8 + displayLane * timelineOverflowLaneWidth
                      : laneCount > 1 ? `calc(8px + ${displayLane} * ((100% - 18px) / ${laneCount}))` : "8px";
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

              {onCreate && draftRange ? (
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
                  className={hasParallelCalendars || hasOverflowLayout ? "" : "left-2 right-2"}
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
                    ...(hasParallelCalendars
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
                  <HolidayCornerBadge date={date} />
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
                const dateLayout = getLayoutEvents((groupedEvents[date] ?? []).sort(sortEvents));
                const inset = hasThreeDayLayout ? 4 : 2;
                const dense = !hasThreeDayLayout;

                return (
                  <div
                    className="absolute bottom-0 top-0 border-l border-[color:color-mix(in_srgb,var(--client-line)_38%,transparent)] last:border-r"
                    key={date}
                    style={{ left: `${dateIndex * dayWidth}%`, width: `${dayWidth}%` }}
                  >
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
                            left: laneCount > 1 ? `calc(${inset}px + ${displayLane} * ((100% - ${inset * 2}px) / ${laneCount}))` : inset,
                            width: laneCount > 1 ? `calc((100% - ${inset * 2}px) / ${laneCount})` : `calc(100% - ${inset * 2}px)`,
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
          const inMonth = date.slice(0, 7) === monthKey;
          const selected = selectedDate === date;
          const isToday = today === date;
          const overflowCount = Math.max(0, dateEvents.length - 3);
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
                {dateEvents.slice(0, 3).map((event) => (
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

function SyncContactOptionAvatar({ option, active }: { option: SyncContactOption; active: boolean }) {
  if (option.avatar) {
    return (
      <AvatarImage
        alt={option.label}
        className={cn(
          "h-10 w-10 shrink-0 border",
          active ? "border-[color:color-mix(in_srgb,var(--client-primary)_54%,white_46%)]" : "border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)]"
        )}
        src={option.avatar}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border text-[13px] font-black",
        active
          ? "border-[color:color-mix(in_srgb,var(--client-primary)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_20%,transparent)] text-[color:var(--client-primary-strong)]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] text-[color:var(--client-muted)]"
      )}
    >
      {option.label.trim().slice(0, 1) || "同"}
    </span>
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
    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] px-3 py-3">
      <span className="grid h-9 w-9 place-items-center rounded-[14px] text-[color:var(--client-muted)]">
        <AppIcon className="h-5 w-5" name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-black text-[color:var(--client-muted)]">{label}</span>
        <span className="mt-1 block text-sm font-black leading-5 text-[color:var(--client-text)]">{value}</span>
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
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
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
    onDelete?.(event);
  };

  useEffect(() => {
    if (!actionSheetOpen || typeof document === "undefined") {
      return undefined;
    }

    const handlePointerDown = (pointerEvent: PointerEvent) => {
      const target = pointerEvent.target;

      if (target instanceof Node && actionMenuRef.current?.contains(target)) {
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
      <EventDetailIconButton disabled={!canEdit} icon="edit" label="编辑行程" onClick={canEdit ? () => onEdit?.(event) : undefined} />
      <div className="relative" ref={actionMenuRef}>
        <EventDetailIconButton icon="more" label="更多行程操作" onClick={() => setActionSheetOpen((current) => !current)} tone="primary" />
        {actionSheetOpen ? (
          <div className="absolute right-0 top-[calc(100%+10px)] z-[90] w-[224px] rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-text)_12%)] p-2 shadow-[0_20px_48px_rgba(0,0,0,0.26)] backdrop-blur-xl">
            <EventDetailMoreMenuItem icon="plus" label="制作一个复制" onClick={closeActionSheet} />
            <EventDetailMoreMenuItem icon="share" label="日程转让" onClick={closeActionSheet} />
            <EventDetailMoreMenuItem danger disabled={!canDelete} icon="trash" label="日程删除" onClick={handleDelete} />
            <EventDetailMoreMenuItem icon="close" label="取消" onClick={closeActionSheet} />
          </div>
        ) : null}
      </div>
    </>
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
        showSpacer={false}
        title={headerTitle}
      />
      <main className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+104px)] pt-[calc(env(safe-area-inset-top)+92px)]">
        {detailMode === "participants" ? renderParticipants() : renderDetail()}
      </main>

      {detailMode === "detail" ? (
        <footer className="safe-bottom fixed bottom-0 left-1/2 z-[122] w-full max-w-[480px] -translate-x-1/2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
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
              "focus-ring relative z-[126] flex min-h-14 w-full items-center justify-between rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] px-5 text-left shadow-[0_18px_52px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition active:scale-[0.99]",
              statusSheetOpen
                ? "bg-[color:color-mix(in_srgb,var(--client-surface)_94%,transparent)] text-[color:var(--client-text)]"
                : "bg-[color:color-mix(in_srgb,var(--client-primary-soft)_82%,var(--client-surface)_18%)] text-[color:var(--client-primary-strong)]"
            )}
            onClick={statusSheetOpen ? closeStatusSheet : () => setStatusSheetOpen(true)}
            type="button"
          >
            {statusSheetOpen ? (
              <>
                <span className="min-w-0 text-base font-black" data-no-i18n>取消</span>
                <AppIcon className="h-5 w-5 shrink-0" name="close" />
              </>
            ) : (
              <>
                <span className="min-w-0 text-base font-black" data-no-i18n>{status}</span>
                <AppIcon className="h-5 w-5 shrink-0" name="more" />
              </>
            )}
          </button>
        </footer>
      ) : null}
    </MobileFullscreenPage>
  );
}

function CalendarEventEditorPage({
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
    { value: "common", label: "常用", detail: "", emptyCaption: "当前没有常用联系人，保存后仅自己可见。" },
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
          <label className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            提醒
            <select className={cn(inputClass, "mt-1")} onChange={(event) => onChange({ ...draft, reminder: event.target.value })} value={normalizeCalendarReminderLabel(draft.reminder)}>
              <option value="10 分钟前">10 分钟前</option>
              <option value="30 分钟前">30 分钟前</option>
              <option value="1 小时前">1 小时前</option>
              <option value="不提醒">不提醒</option>
            </select>
          </label>
          <label className="block min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
            重复
            <select className={cn(inputClass, "mt-1")} onChange={(event) => onChange({ ...draft, repeatRule: normalizeCalendarRepeatRule(event.target.value) })} value={draft.repeatRule}>
              {repeatOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
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
          {activeSyncFilter.detail ? (
            <p className="text-[10px] font-bold leading-4 text-[color:var(--client-muted)]">{activeSyncFilter.detail}</p>
          ) : null}
          {visibleSyncContactOptions.length > 0 ? (
            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleSyncContactOptions.map((option) => {
                const active = draft.syncContactIds.includes(option.id);
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "focus-ring flex min-h-[58px] items-center gap-3 rounded-[15px] border px-3 py-2 text-left transition",
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
                    <SyncContactOptionAvatar active={active} option={option} />
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
      </div>
      </main>
      <footer className="safe-bottom pointer-events-none fixed bottom-0 left-1/2 z-[132] w-full max-w-[480px] -translate-x-1/2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-12">
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
            className="focus-ring flex h-12 min-w-0 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-3 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_16px_36px_color-mix(in_srgb,var(--client-primary)_22%,transparent)]"
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
  merchantLaneMode = "technician",
  searchQuery = "",
  scope = "user"
}: UnifiedUserCalendarProps) {
  const navigate = useNavigate();
  const { customers, stores, technicians } = useEntityStore();
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
  const [anchorDate, setAnchorDate] = useState(getTodayDateKey());
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
  const [agendaDateWindow, setAgendaDateWindow] = useState<AgendaDateWindow>(() => createAgendaDateWindow(getTodayDateKey()));
  const [agendaScrollRequestId, setAgendaScrollRequestId] = useState(0);
  const [sourceVisibility, setSourceVisibility] = useState(defaultSourceVisibility);
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [birthdayExpanded, setBirthdayExpanded] = useState(false);
  const [birthdayFilters, setBirthdayFilters] = useState<BirthdaySourceFilters>(defaultBirthdaySourceFilters);
  const [birthdayContactQuery, setBirthdayContactQuery] = useState("");
  const [localEvents, setLocalEvents] = useState<LocalCalendarEvent[]>(loadLocalCalendarEvents);
  const [editorDraft, setEditorDraft] = useState<CalendarEditorDraft | null>(null);
  const [activeEvent, setActiveEvent] = useState<UnifiedCalendarEvent | null>(null);
  const [googleConnectionStatus, setGoogleConnectionStatus] = useState<GoogleCalendarConnectionStatus | null>(null);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<MerchantAppointmentStatusFilter>("all");
  const period = getCalendarPeriod(view, anchorDate, agendaDateWindow);
  const googleCalendarActorId = getGoogleCalendarActorId(activeScope, currentCustomer, currentTechnician, currentStore);
  const appointmentStatusFilterLabel =
    merchantAppointmentStatusFilterOptions.find((option) => option.value === appointmentStatusFilter)?.label ?? "全预约";
  const currentScopeCreator = useMemo(
    () => getCurrentScopeCreator(activeScope, currentCustomer, currentTechnician, currentStore),
    [activeScope, currentCustomer, currentStore, currentTechnician]
  );
  const imConfig = getImRoleConfig(imScope);

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
    () => (resolvedDisplayMode === "parallel" && !isMerchantAppointmentStatusMode ? getParallelCalendarLanes(activeScope === "merchant" ? currentStore : undefined, currentTechnician, technicians, effectiveMerchantLaneMode) : undefined),
    [activeScope, currentStore, currentTechnician, effectiveMerchantLaneMode, isMerchantAppointmentStatusMode, resolvedDisplayMode, technicians]
  );

  const allEvents = useMemo(() => {
    const birthdayEvents = getBirthdayCalendarEvents(period, currentCustomer, currentTechnician, currentStore, birthdayContactOptions);
    const neeDoEvents = [
      ...(activeScope === "user" && currentCustomer ? getOrderEvents(currentCustomer) : []),
      ...(activeScope === "merchant" && currentStore
        ? getMerchantEventsForStore(currentStore, dispatchSnapshot.arrangements, technicianSnapshot, scheduleSnapshot, customers, stores, technicians, effectiveMerchantLaneMode)
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
          : [])
    ];

    if (isMerchantAppointmentStatusMode) {
      return neeDoEvents.map((event) => resolveCalendarCreator(event, imStore.users)).sort(sortEvents);
    }

    return [
      ...getLocalCalendarEvents(localEvents, syncContactOptions, currentScopeCreator),
      ...neeDoEvents,
      ...birthdayEvents,
      ...getReferenceCalendarEvents()
    ].map((event) => resolveCalendarCreator(event, imStore.users)).sort(sortEvents);
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
      ? visiblePeriodEvents.filter((event) => matchesMerchantAppointmentStatusFilter(event, appointmentStatusFilter))
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
    if (!normalizedSearchQuery || view === "agenda") {
      return;
    }

    setView("agenda");
    setAgendaDateWindow(createAgendaDateWindow(anchorDate));
  }, [anchorDate, normalizedSearchQuery, view]);

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
      endDate: date,
      startTime: minutesToTime(defaultRange.start),
      endTime: minutesToTime(defaultRange.end),
      title: "",
      location: calendarId === "user:me" ? "" : calendarLabel,
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

  const saveDraft = () => {
    if (!editorDraft) {
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
    setLocalEvents((current) => current.filter((item) => item.id !== event.id));
    setActiveEvent(null);
  };

  const openCalendarEvent = (event: UnifiedCalendarEvent) => {
    setActiveEvent(event);
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
        <label className="focus-within:ring-focus relative min-w-0 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] shadow-[0_10px_22px_rgba(0,0,0,0.08)]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-[color:var(--client-muted)]">显示</span>
          <select
            aria-label="切换日程展示范围"
            className="h-9 w-full appearance-none rounded-full bg-transparent pl-12 pr-9 text-center text-[13px] font-black text-[color:var(--client-text)] outline-none"
            onChange={(event) => changeView(event.target.value as UnifiedCalendarView)}
            value={view === "agenda" ? "day" : view}
          >
            {viewOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-black text-[color:var(--client-muted)]">⌄</span>
        </label>
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
            onCreate={isMerchantAppointmentStatusMode ? undefined : openCreate}
            onOpen={openCalendarEvent}
          />
        </div>
      ) : view === "threeDay" || view === "week" ? (
        <div className="mt-3">
          <UnifiedCalendarMultiDayTimeline
            dates={view === "threeDay" ? getThreeDayDates(anchorDate) : getWeekDates(anchorDate)}
            emptySearchQuery={normalizedSearchQuery ? searchQuery.trim() : undefined}
            events={searchedVisiblePeriodEvents}
            onCreate={isMerchantAppointmentStatusMode ? undefined : openCreate}
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
          onCreate={isMerchantAppointmentStatusMode ? undefined : (date) => openCreate(date)}
          onExtendFuture={() => extendAgendaDateWindow(1)}
          onExtendPast={() => extendAgendaDateWindow(-1)}
          onOpen={openCalendarEvent}
          scrollTargetDate={selectedDate}
          scrollTargetRequestId={agendaScrollRequestId}
          searchQuery={searchQuery}
        />
      )}

      {editorDraft ? (
        <CalendarEventEditorPage draft={editorDraft} onChange={setEditorDraft} onClose={() => setEditorDraft(null)} onSave={saveDraft} syncContactOptions={syncContactOptions} />
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
          onSync={(event) => {
            setActiveEvent(null);
            setSourceDrawerOpen(true);
            void event;
          }}
        />
      ) : null}
      <CalendarSourceDrawer
        birthdayContactOptions={birthdayContactOptions}
        birthdayContactQuery={birthdayContactQuery}
        birthdayExpanded={birthdayExpanded}
        birthdayFilters={birthdayFilters}
        birthdayTagOptions={calendarContactTagOptions}
        googleConnectionStatus={googleConnectionStatus}
        googleSyncEventCount={searchedVisiblePeriodEvents.length}
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
      />
      {!isMerchantAppointmentStatusMode ? (
        <FloatingActionButton
          ariaLabel="新增行程"
          onClick={() => openCreate(selectedDate)}
          storageKey={`needo.fab.schedule-create.${activeScope}`}
          title="新增行程"
        >
          <AppIcon name="plus" />
        </FloatingActionButton>
      ) : null}
    </UnifiedCalendarSurface>
  );
}
