import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { buildAdminLoginScanRedirect } from "../../auth/adminLogin";
import { Button } from "../../components/ui/Button";
import { InteractiveAvatar } from "../../components/ui/InteractiveAvatar";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { ScheduleDraftRangeBlock } from "../../components/scheduling/ScheduleDraftRangeBlock";
import { MobileShell } from "../../components/mobile/MobileShell";
import type { MyQrCodePurpose } from "../../components/mobile/MyQrCodeButton";
import { UnifiedScanSimulator } from "../../components/mobile/UnifiedScanSimulator";
import { FloatingBackButton } from "../../components/client-ui/AppScaffold";
import { chatBgUrl } from "../../assets/runtime/images";
import { customers, imageBank, orders, services } from "../../data/mock";
import { parseBrowserStorageJson } from "../../lib/browserStorage";
import { clampMessageText } from "../../lib/messageTextLimits";
import { getStorePresentationConfig } from "../../lib/storePresentation";
import { useDocumentScrollLock, useIosScrollContainer } from "../../lib/useIosScrollContainer";
import {
  getMerchantStaffEmploymentLabel,
  getMerchantStaffRoleNames,
  getResolvedMerchantStaffRoleName,
  merchantManualEmployeeStorageKey,
  merchantStaffRoleLabelStorageKey,
  merchantTechnicianRoleName,
  normalizeMerchantStaffEmploymentTag,
  type MerchantManualStaffRoleRecord
} from "../../lib/merchantStaffRoles";
import { cn } from "../../lib/utils";
import { getCustomerLevelLabel } from "../../shared/profile-card/customerMembership";
import { SocialProfileMiniCard } from "../../shared/profile-card";
import { getScopedProfileDetailPath } from "../../shared/profile-detail";
import { updateTechnicianEntity, useEntityStore } from "../../state/entityStore";
import { getTechnicianScheduleStoreSnapshot } from "../../state/technicianScheduleStore";
import { useClientTheme } from "../../theme/ClientThemeProvider";
import {
  addDays,
  formatLongDate,
  formatShortDate,
  getTodayDateKey,
  getWeekDates,
  minutesToTime,
  padNumber,
  timeToMinutes
} from "../technician-schedule/model";
import { createImApi } from "./api";
import {
  ContactSummaryCard,
  ContactRow,
  ConversationRow,
  ImActorHeaderSummary,
  ImBottomSheet,
  ImChatComposer,
  ImEmptyState,
  ImEntryCell,
  ImHeaderAction,
  ImIcon,
  ImMessageActionSheet,
  ImMessageSelectionHandles,
  hasActiveImMessageTextSelection,
  type ImMessageActionSheetItem,
  type ImMessageReactionSummary,
  ImSearchTrigger,
  ImStandaloneShell,
  PrivateConversationTitle,
  SwipeActionRow,
  ImTopBar,
  MessageBubble,
  SectionTag,
  ToggleRow
} from "./components";
import {
  UnifiedChatHeaderAction,
  UnifiedChatHomePage,
  UnifiedConversationItem,
  UnifiedConversationList,
  UnifiedPinnedConversationDivider,
  UnifiedPinnedConversationToggle
} from "./chat-home";
import { buildShareableCardUsers, getShareableCardCaptionPrefix } from "./contact-card-sharing";
import {
  buildContactSections,
  buildConversationRowPreview,
  buildMessagePreview,
  buildMediaBuckets,
  buildTimeSeparatedMessages,
  formatConversationTime,
  getConversationById,
  getConversationMember,
  getDisplayName,
  getImContactSignatureCaption,
  getMessageDisappearingExpiresAt,
  getVisibleIndexLetters,
  getUserById,
  resolveIndexLetterFromTouchY,
  type ContactRelation,
  type ContactIndexLetter,
  type Conversation,
  type ConversationDisappearingCountdown,
  type ConversationDisappearingStartMode,
  type ConversationMessage,
  type FriendRequest,
  type GroupInfoEditPolicy,
  type ImMessageType,
  type ImRoleType,
  type ImSearchResult,
  type ImUser,
  type MessageCampaignImageInput,
  type MessageExt,
  type TagMessageCampaignEstimate,
  type TagMessageCampaignResult
} from "./model";
import { canShareUserCard, getImRoleConfig, getImUserProfileEntityType, isContactVisibleForRole, isProfileSearchableForRole, resolveImProfilePath } from "./role-config";
import { useImScope } from "./scope";
import {
  getBlockedContacts,
  getContactConversation,
  getConversationDisplayName,
  getConversationMessages,
  getCurrentUser,
  getQuotedMessage,
  getServiceContacts,
  useImStore
} from "./store";
import { useSocial } from "../social/context";
import { MediaPlayGlyph } from "../social/components/SocialUi";
import { socialPaths } from "../social/paths";
import type { SocialMediaItem, SocialPortalScope } from "../social/types";
import { profileKey } from "../social/utils";
import { useDineInStore } from "../dine-in/store";
import type { ServiceItem, Store, Technician } from "../../types/domain";

function buildContactCaption(user?: ImUser, _contact?: ContactRelation) {
  return getImContactSignatureCaption(user);
}

function getAddStaffMode(value?: string | null): "fullTime" | "partTime" {
  return value === "partTime" ? "partTime" : "fullTime";
}

function getAddStaffLabel(staffType: "fullTime" | "partTime") {
  return getMerchantStaffEmploymentLabel(staffType);
}

function getAddStaffTitle(staffType: "fullTime" | "partTime") {
  return `添加${getAddStaffLabel(staffType)}`;
}

function mergeTags(...groups: Array<Array<string | undefined>>) {
  return Array.from(new Set(groups.flat().filter((tag): tag is string => Boolean(tag))));
}

function ContactSelectionBadge({ selected }: { selected: boolean }) {
  return selected ? (
    <span className="grid h-5 w-5 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--pin-badge-glyph)_38%,transparent)] bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_4px_10px_color-mix(in_srgb,var(--client-primary)_32%,transparent)]">
      <ImIcon className="h-3 w-3" name="check" />
    </span>
  ) : (
    <span className="block h-5 w-5 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-transparent" />
  );
}

function AddStaffContactBadge({ adding }: { adding: boolean }) {
  return (
    <span className="grid h-5 w-5 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--pin-badge-glyph)_38%,transparent)] bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_4px_10px_color-mix(in_srgb,var(--client-primary)_32%,transparent)]">
      <ImIcon className="h-3 w-3" name={adding ? "check" : "add"} />
    </span>
  );
}

type GroupPrivacyCountdownField = keyof ConversationDisappearingCountdown;
type GroupPrivacyCountdownInput = Record<GroupPrivacyCountdownField, string>;

const defaultGroupPrivacyCountdownInput: GroupPrivacyCountdownInput = {
  months: "",
  days: "",
  hours: "",
  minutes: ""
};

const groupPrivacyCountdownLimits: Record<GroupPrivacyCountdownField, number> = {
  months: 12,
  days: 30,
  hours: 23,
  minutes: 59
};

const groupPrivacyCountdownLabels: Array<{ field: GroupPrivacyCountdownField; label: string; suffix: string }> = [
  { field: "months", label: "月", suffix: "月" },
  { field: "days", label: "日", suffix: "日" },
  { field: "hours", label: "小时", suffix: "小时" },
  { field: "minutes", label: "分钟", suffix: "分钟" }
];

const groupPrivacyStartModeOptions: Array<{ value: ConversationDisappearingStartMode; label: string; caption: string }> = [
  { value: "sent", label: "按发送时间", caption: "发出后立即倒计时" },
  { value: "read_by_all", label: "全员看过后", caption: "所有成员已读后倒计时" }
];

function parseCountdownInput(input: GroupPrivacyCountdownInput): ConversationDisappearingCountdown {
  return {
    months: Number(input.months) || 0,
    days: Number(input.days) || 0,
    hours: Number(input.hours) || 0,
    minutes: Number(input.minutes) || 0
  };
}

function createCountdownInput(countdown?: Partial<ConversationDisappearingCountdown>): GroupPrivacyCountdownInput {
  return {
    months: countdown?.months ? String(countdown.months) : "",
    days: countdown?.days ? String(countdown.days) : "",
    hours: countdown?.hours ? String(countdown.hours) : "",
    minutes: countdown?.minutes ? String(countdown.minutes) : ""
  };
}

function sanitizeCountdownInputValue(field: GroupPrivacyCountdownField, value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? String(Math.min(groupPrivacyCountdownLimits[field], Number(digits))) : "";
}

function resetImHorizontalScroll() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const scrollingElement = document.scrollingElement ?? document.documentElement;
  scrollingElement.scrollLeft = 0;
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
  window.scrollTo({ left: 0, top: window.scrollY, behavior: "auto" });
}

function releaseImInputFocus() {
  if (typeof document === "undefined" || typeof HTMLElement === "undefined") {
    return;
  }

  const activeElement = document.activeElement;

  if (
    activeElement instanceof HTMLElement &&
    ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement.tagName)
  ) {
    activeElement.blur();
  }
}

function stabilizeImMobileViewport() {
  releaseImInputFocus();
  resetImHorizontalScroll();

  if (typeof window !== "undefined") {
    window.requestAnimationFrame(resetImHorizontalScroll);
  }
}

function hasCountdownValue(countdown: ConversationDisappearingCountdown) {
  return countdown.months + countdown.days + countdown.hours + countdown.minutes > 0;
}

function formatConversationDisappearingCountdown(countdown?: Partial<ConversationDisappearingCountdown>) {
  if (!countdown) {
    return "";
  }

  const segments = groupPrivacyCountdownLabels
    .map(({ field, suffix }) => {
      const value = Number(countdown[field]) || 0;
      return value > 0 ? `${value}${suffix}` : "";
    })
    .filter(Boolean);

  return segments.join(" ");
}

function formatDisappearingStartModeLabel(mode?: ConversationDisappearingStartMode) {
  return mode === "read_by_all" ? "全员看过后开始倒计时" : "按发送时间开始倒计时";
}

type ImServiceShareOption = {
  service: ServiceItem;
  provider?: Store | Technician;
  providerType?: "store" | "technician";
  href?: string;
};

type ImScheduleInviteOption = NonNullable<MessageExt["scheduleInvite"]> & {
  endTime: string;
  id: string;
  meta: string;
  sourceType: "order" | "booking" | "shift" | "event" | "open";
  startTime: string;
};

function formatServicePriceLabel(service: ServiceItem) {
  return `¥${service.priceFrom.toLocaleString("ja-JP")} 起`;
}

function formatServiceDurationLabel(service: ServiceItem) {
  const duration = service.packages[0]?.durationMinutes;
  return duration ? `${duration} 分钟` : service.fastestArrival;
}

function getScopedStorePath(scope: ImRoleType, storeId?: string) {
  if (!storeId) {
    return undefined;
  }

  if (scope === "merchant") {
    return `/merchant/stores/${storeId}`;
  }

  return scope === "user" ? `/stores/${storeId}` : undefined;
}

function resolveCurrentServiceProvider(
  scope: ImRoleType,
  currentUser: ImUser | undefined,
  entityStore: ReturnType<typeof useEntityStore>
): { provider?: Store | Technician; providerType?: "store" | "technician"; homeStore?: Store } {
  if (scope === "merchant") {
    const homeStore = entityStore.stores.find((item) => item.id === currentUser?.entityId) ?? entityStore.stores[0];
    return { provider: homeStore, providerType: "store", homeStore };
  }

  if (scope === "technician") {
    const technician = entityStore.technicians.find((item) => item.id === currentUser?.entityId) ?? entityStore.technicians[0];
    const homeStore = entityStore.stores.find((item) => item.id === technician?.storeId) ?? entityStore.stores[0];
    return { provider: technician, providerType: "technician", homeStore };
  }

  return {};
}

function inferServiceCategoryIds(homeStore?: Store, provider?: Store | Technician) {
  const text = [
    ...(homeStore?.tags ?? []),
    homeStore?.description,
    ...(provider && "skills" in provider ? provider.skills : [])
  ].join(" ");
  const categoryIds: string[] = [];

  if (/按摩|护理|肩颈|芳疗|放松|理疗/.test(text)) {
    categoryIds.push("massage", "care");
  }

  if (/美甲|美睫|美业|皮肤|美容/.test(text)) {
    categoryIds.push("beauty");
  }

  if (/保洁|清扫|清洁|修水管|收纳/.test(text)) {
    categoryIds.push("cleaning", "deep", "storage");
  }

  if (/空调|家电/.test(text)) {
    categoryIds.push("appliance");
  }

  if (/宠物/.test(text)) {
    categoryIds.push("pet");
  }

  return Array.from(new Set(categoryIds));
}

function buildServiceShareOptions(scope: ImRoleType, currentUser: ImUser | undefined, entityStore: ReturnType<typeof useEntityStore>): ImServiceShareOption[] {
  const { provider, providerType, homeStore } = resolveCurrentServiceProvider(scope, currentUser, entityStore);

  if (!provider) {
    return [];
  }

  const configuredServiceIds = new Set(
    getStorePresentationConfig(homeStore).menuCards?.map((item) => item.sourceServiceId).filter(Boolean) ?? []
  );
  const configured = configuredServiceIds.size > 0
    ? services.filter((service) => configuredServiceIds.has(service.id))
    : [];
  const categoryIds = inferServiceCategoryIds(homeStore, provider);
  const inferred = categoryIds.length > 0
    ? services.filter((service) => categoryIds.includes(service.categoryId))
    : services.slice(0, 8);
  const ranked = [...configured, ...inferred, ...services].filter((service, index, list) => list.findIndex((item) => item.id === service.id) === index);
  const href = providerType === "store" ? getScopedStorePath(scope, provider.id) : undefined;

  return ranked.slice(0, 10).map((service) => ({
    href,
    provider,
    providerType,
    service
  }));
}

function normalizeClockTime(value: string | undefined, fallback = "10:00") {
  if (!value) {
    return fallback;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return fallback;
  }

  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));

  return `${padNumber(hour)}:${padNumber(minute)}`;
}

function inferOrderDurationMinutes(itemName: string) {
  const match = itemName.match(/(\d+)\s*分钟/);
  const duration = match ? Number(match[1]) : 60;

  return Number.isFinite(duration) && duration > 0 ? Math.min(duration, 240) : 60;
}

function parseOrderScheduleTime(bookedAt: string, itemName: string) {
  const [date = "", time = ""] = bookedAt.split(" ");
  const startTime = normalizeClockTime(time);
  const endTime = minutesToTime(timeToMinutes(startTime) + inferOrderDurationMinutes(itemName));

  return {
    date,
    endTime,
    startTime,
    timeRange: `${startTime} - ${endTime}`
  };
}

function buildScheduleInviteOptions(scope: ImRoleType, currentUser: ImUser | undefined, entityStore: ReturnType<typeof useEntityStore>): ImScheduleInviteOption[] {
  const scheduleSnapshot = getTechnicianScheduleStoreSnapshot();
  const currentStoreId = scope === "merchant"
    ? currentUser?.entityId
    : scope === "technician"
      ? entityStore.technicians.find((item) => item.id === currentUser?.entityId)?.storeId
      : undefined;
  const currentTechnicianId = scope === "technician" ? currentUser?.entityId : undefined;
  const currentCustomerId = scope === "user" ? currentUser?.entityId : undefined;

  const orderOptions = orders
    .filter((order) => !currentCustomerId || order.customerId === currentCustomerId)
    .filter((order) => ["pending", "unpaid", "confirmed", "scheduled", "inService"].includes(order.status))
    .slice(0, 6)
    .map((order): ImScheduleInviteOption => {
      const time = parseOrderScheduleTime(order.bookedAt, order.itemName);
      const href = scope === "merchant" ? `/merchant/orders/${order.id}` : scope === "technician" ? `/technician/orders/${order.id}` : `/orders/${order.id}`;

      return {
        endTime: time.endTime,
        id: `order-${order.id}`,
        scheduleId: order.id,
        title: order.itemName,
        date: time.date,
        timeRange: time.timeRange,
        location: order.storeName ?? `${order.city} / ${order.area}`,
        hostName: order.technicianName ?? order.storeName ?? order.customerName,
        note: order.remark ?? "邀请对方一起确认这段预约行程。",
        statusLabel: order.status === "inService" ? "服务中" : "待确认",
        href,
        meta: "预约",
        sourceType: "order",
        startTime: time.startTime
      };
    });

  const scheduleOptions = [
    ...scheduleSnapshot.bookings
      .filter((booking) => (!currentStoreId || booking.storeId === currentStoreId) && (!currentTechnicianId || booking.technicianId === currentTechnicianId))
      .map((booking): ImScheduleInviteOption => ({
        endTime: booking.endTime,
        id: `booking-${booking.id}`,
        scheduleId: booking.id,
        title: booking.title,
        date: booking.date,
        timeRange: `${booking.startTime} - ${booking.endTime}`,
        location: booking.customerName,
        hostName: booking.customerName,
        note: booking.note ?? "邀请对方加入这段预约日程。",
        statusLabel: "预约",
        href: booking.orderId ? (scope === "merchant" ? `/merchant/orders/${booking.orderId}` : scope === "technician" ? `/technician/orders/${booking.orderId}` : `/orders/${booking.orderId}`) : undefined,
        meta: "预约",
        sourceType: "booking",
        startTime: booking.startTime
      })),
    ...scheduleSnapshot.dutyShifts
      .filter((shift) => (!currentStoreId || shift.storeId === currentStoreId) && (!currentTechnicianId || shift.technicianId === currentTechnicianId))
      .map((shift): ImScheduleInviteOption => ({
        endTime: shift.endTime,
        id: `shift-${shift.id}`,
        scheduleId: shift.id,
        title: shift.title,
        date: shift.date,
        timeRange: `${shift.startTime} - ${shift.endTime}`,
        location: shift.shiftLabel,
        note: "邀请好友或同事一起确认这段日程。",
        statusLabel: "日程",
        href: scope === "technician" ? `/technician/schedule/events/${shift.id}` : undefined,
        meta: "排班",
        sourceType: "shift",
        startTime: shift.startTime
      })),
    ...scheduleSnapshot.customEvents
      .filter((event) => (!currentStoreId || event.storeId === currentStoreId) && (!currentTechnicianId || event.technicianId === currentTechnicianId))
      .map((event): ImScheduleInviteOption => ({
        endTime: event.endTime,
        id: `event-${event.id}`,
        scheduleId: event.id,
        title: event.title,
        date: event.date,
        timeRange: `${event.startTime} - ${event.endTime}`,
        location: event.location,
        note: event.note ?? "邀请对方一起加入这段日程。",
        statusLabel: "日程",
        href: scope === "technician" ? `/technician/schedule/events/${event.id}` : undefined,
        meta: "自建",
        sourceType: "event",
        startTime: event.startTime
      }))
  ];

  return [...scheduleOptions, ...orderOptions]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 12);
}

function compareScheduleInviteOptions(left: ImScheduleInviteOption, right: ImScheduleInviteOption) {
  const dateCompare = left.date.localeCompare(right.date);

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return left.startTime.localeCompare(right.startTime);
}

function buildOpenScheduleInviteOption({
  date,
  endTime,
  hostName,
  location,
  startTime
}: {
  date: string;
  endTime: string;
  hostName?: string;
  location?: string;
  startTime: string;
}): ImScheduleInviteOption {
  return {
    date,
    endTime,
    hostName,
    id: `open-${date}-${startTime}-${endTime}`,
    location,
    meta: "可选时间",
    scheduleId: `invite-${date}-${startTime}-${endTime}`,
    sourceType: "open",
    startTime,
    statusLabel: "邀请",
    timeRange: `${startTime} - ${endTime}`,
    title: "邀请参加行程"
  };
}

const SCHEDULE_INVITE_ROW_HEIGHT = 64;
const SCHEDULE_INVITE_SNAP_MINUTES = 15;
const SCHEDULE_INVITE_MIN_DURATION = 30;
const SCHEDULE_INVITE_DEFAULT_REMINDER = "开始前15分钟";
const SCHEDULE_INVITE_REMINDER_OPTIONS = ["开始时提醒", SCHEDULE_INVITE_DEFAULT_REMINDER, "开始前30分钟", "不提醒"];

type ScheduleInviteMinuteRange = {
  endMinute: number;
  startMinute: number;
};

type ScheduleInviteDragMode = "resize-start" | "resize-end";

function snapScheduleInviteMinute(value: number) {
  return Math.round(value / SCHEDULE_INVITE_SNAP_MINUTES) * SCHEDULE_INVITE_SNAP_MINUTES;
}

function clampScheduleInviteMinute(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getScheduleInviteTimelineBounds(options: ImScheduleInviteOption[]) {
  const starts = options.map((item) => timeToMinutes(item.startTime));
  const ends = options.map((item) => timeToMinutes(item.endTime));
  const earliest = starts.length > 0 ? Math.min(...starts) : 8 * 60;
  const latest = ends.length > 0 ? Math.max(...ends) : 22 * 60;
  const startHour = Math.max(6, Math.min(8, Math.floor(earliest / 60)));
  const endHour = Math.min(24, Math.max(23, Math.ceil(latest / 60)));

  return {
    endMinute: endHour * 60,
    startMinute: startHour * 60
  };
}

function getScheduleInvitePointerMinute(
  event: { clientY: number },
  element: HTMLElement,
  bounds: ScheduleInviteMinuteRange
) {
  const rect = element.getBoundingClientRect();
  const relativeY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  const rawMinute = bounds.startMinute + (relativeY / SCHEDULE_INVITE_ROW_HEIGHT) * 60;

  return clampScheduleInviteMinute(snapScheduleInviteMinute(rawMinute), bounds.startMinute, bounds.endMinute);
}

function getScheduleInviteCreateStartMinute(
  event: { clientY: number },
  element: HTMLElement,
  bounds: ScheduleInviteMinuteRange
) {
  return clampScheduleInviteMinute(getScheduleInvitePointerMinute(event, element, bounds), bounds.startMinute, bounds.endMinute - SCHEDULE_INVITE_MIN_DURATION);
}

function normalizeScheduleInviteDragRange(startMinute: number, endCandidate: number, bounds: ScheduleInviteMinuteRange) {
  const clampedEnd = clampScheduleInviteMinute(snapScheduleInviteMinute(endCandidate), bounds.startMinute, bounds.endMinute);

  if (clampedEnd >= startMinute) {
    return {
      startMinute,
      endMinute: clampScheduleInviteMinute(Math.max(clampedEnd, startMinute + SCHEDULE_INVITE_MIN_DURATION), bounds.startMinute, bounds.endMinute)
    };
  }

  return {
    startMinute: clampScheduleInviteMinute(Math.min(clampedEnd, startMinute - SCHEDULE_INVITE_MIN_DURATION), bounds.startMinute, bounds.endMinute),
    endMinute: startMinute
  };
}

function scheduleInviteRangeStyle(range: ScheduleInviteMinuteRange, bounds: ScheduleInviteMinuteRange) {
  const top = ((range.startMinute - bounds.startMinute) / 60) * SCHEDULE_INVITE_ROW_HEIGHT;
  const height = Math.max(58, ((range.endMinute - range.startMinute) / 60) * SCHEDULE_INVITE_ROW_HEIGHT);

  return {
    height,
    top
  };
}

function formatScheduleInviteEditorDate(date: string) {
  const [, month = "", day = ""] = date.split("-");
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][new Date(`${date}T00:00:00`).getDay()];

  return `${Number(month)}月 ${Number(day)}日（星期${weekday}）`;
}

type ScheduleInviteTimelineTone = "available" | "scheduled" | "booked" | "conflict-pending" | "other" | "travel";

function buildScheduleInviteTimelineStyle(tone: ScheduleInviteTimelineTone) {
  return {
    "--schedule-semantic-border": `var(--schedule-tone-${tone}-border)`,
    "--schedule-semantic-fill": `var(--schedule-tone-${tone}-bg)`,
    "--schedule-semantic-fill-strong": `var(--schedule-tone-${tone}-bg)`,
    "--schedule-semantic-shadow": `color-mix(in srgb, var(--schedule-tone-${tone}-border) 18%, transparent)`,
    "--schedule-semantic-text": `var(--schedule-tone-${tone}-text)`,
    "--schedule-semantic-text-shadow": `var(--schedule-tone-${tone}-text-shadow, none)`
  } as CSSProperties;
}

function getScheduleInviteTimelineTone(sourceType: ImScheduleInviteOption["sourceType"]): ScheduleInviteTimelineTone {
  if (sourceType === "shift") {
    return "scheduled";
  }

  if (sourceType === "booking" || sourceType === "order") {
    return "booked";
  }

  if (sourceType === "event") {
    return "other";
  }

  return "available";
}

function ImScheduleInviteTimeTable({
  className,
  date,
  hostName,
  location,
  onSelect,
  options,
  selectedInvite
}: {
  className?: string;
  date: string;
  hostName?: string;
  location?: string;
  onSelect: (invite: ImScheduleInviteOption) => void;
  options: ImScheduleInviteOption[];
  selectedInvite: ImScheduleInviteOption | null;
}) {
  const sortedOptions = [...options].sort(compareScheduleInviteOptions);
  const bounds = getScheduleInviteTimelineBounds(sortedOptions);
  const hours = Array.from(
    { length: Math.max(1, Math.ceil((bounds.endMinute - bounds.startMinute) / 60)) },
    (_, index) => Math.floor(bounds.startMinute / 60) + index
  );
  const canvasHeight = hours.length * SCHEDULE_INVITE_ROW_HEIGHT;
  const selectedRange =
    selectedInvite?.sourceType === "open"
      ? {
        endMinute: timeToMinutes(selectedInvite.endTime),
        startMinute: timeToMinutes(selectedInvite.startTime)
      }
      : null;
  const [draftRange, setDraftRange] = useState<ScheduleInviteMinuteRange | null>(selectedRange);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasPressRef = useRef<{ moved: boolean; x: number; y: number } | null>(null);
  const dragModeRef = useRef<ScheduleInviteDragMode | null>(null);
  const dragRangeRef = useRef<ScheduleInviteMinuteRange | null>(selectedRange);
  const resizeBaseRangeRef = useRef<ScheduleInviteMinuteRange | null>(selectedRange);

  useEffect(() => {
    const nextRange =
      selectedInvite?.sourceType === "open"
        ? {
          endMinute: timeToMinutes(selectedInvite.endTime),
          startMinute: timeToMinutes(selectedInvite.startTime)
        }
        : null;

    dragRangeRef.current = nextRange;
    dragModeRef.current = null;
    resizeBaseRangeRef.current = nextRange;
    setDraftRange(nextRange);
  }, [selectedInvite?.id]);

  const setActiveDragRange = (range: ScheduleInviteMinuteRange | null) => {
    dragRangeRef.current = range;
    setDraftRange(range);
  };

  const updateActiveRangeFromPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    const mode = dragModeRef.current;

    if (!canvas || !mode) {
      return;
    }

    const pointerMinute = getScheduleInvitePointerMinute(event, canvas, bounds);

    const baseRange = resizeBaseRangeRef.current ?? dragRangeRef.current;

    if (!baseRange) {
      return;
    }

    if (mode === "resize-start") {
      setActiveDragRange({
        endMinute: baseRange.endMinute,
        startMinute: clampScheduleInviteMinute(pointerMinute, bounds.startMinute, baseRange.endMinute - SCHEDULE_INVITE_MIN_DURATION)
      });
      return;
    }

    setActiveDragRange({
      endMinute: clampScheduleInviteMinute(pointerMinute, baseRange.startMinute + SCHEDULE_INVITE_MIN_DURATION, bounds.endMinute),
      startMinute: baseRange.startMinute
    });
  };

  const commitDragRange = (range: ScheduleInviteMinuteRange | null) => {
    if (!range) {
      return;
    }

    onSelect(buildOpenScheduleInviteOption({
      date,
      endTime: minutesToTime(range.endMinute),
      hostName,
      location,
      startTime: minutesToTime(range.startMinute)
    }));
  };

  const handleCanvasClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("[data-schedule-range-handle],[data-schedule-draft-range-block]")) {
      return;
    }

    if (canvasPressRef.current?.moved) {
      canvasPressRef.current = null;
      return;
    }

    canvasPressRef.current = null;
    const target = event.currentTarget;
    const startMinute = getScheduleInviteCreateStartMinute(event, target, bounds);
    const range = normalizeScheduleInviteDragRange(startMinute, startMinute + SCHEDULE_INVITE_MIN_DURATION, bounds);

    resizeBaseRangeRef.current = range;
    setActiveDragRange(range);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") {
      canvasPressRef.current = null;
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("[data-schedule-range-handle],[data-schedule-draft-range-block]")) {
      canvasPressRef.current = null;
      return;
    }

    canvasPressRef.current = {
      moved: false,
      x: event.clientX,
      y: event.clientY
    };
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = canvasPressRef.current;

    if (!press || press.moved) {
      return;
    }

    const deltaX = event.clientX - press.x;
    const deltaY = event.clientY - press.y;

    if (Math.hypot(deltaX, deltaY) > 8) {
      press.moved = true;
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragModeRef.current) {
      return;
    }

    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragModeRef.current = null;
    resizeBaseRangeRef.current = dragRangeRef.current;
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragModeRef.current = null;
    resizeBaseRangeRef.current = dragRangeRef.current;
  };
  const handleResizePointerDown = (mode: ScheduleInviteDragMode, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }

    const range = draftRange ?? selectedRange;

    if (!range) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragModeRef.current = mode;
    resizeBaseRangeRef.current = range;
    dragRangeRef.current = range;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragModeRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateActiveRangeFromPointer(event);
  };
  const activeRange = draftRange ?? selectedRange;

  return (
    <div className={cn("flex min-h-0 flex-col rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_72%,var(--client-surface)_28%)] p-2", className)}>
      <div className="mb-2 flex items-center justify-between gap-3 px-2 text-[11px] font-black text-[color:var(--client-muted)]">
        <span>创建邀请时间</span>
        <span className="shrink-0 text-[color:var(--client-primary)]">15分钟刻度</span>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_86%,transparent)]"
        data-im-schedule-invite-scroll="true"
      >
        <div className="grid grid-cols-[64px,minmax(0,1fr)]" style={{ height: canvasHeight }}>
          <div className="relative border-r border-[color:color-mix(in_srgb,var(--client-line)_56%,transparent)]">
            {hours.map((hour) => (
              <div
                className="absolute left-0 right-0 border-b border-[color:color-mix(in_srgb,var(--client-line)_45%,transparent)] px-2 pt-2 text-right text-[11px] font-black text-[color:var(--client-muted)]"
                key={`${date}-rail-${hour}`}
                style={{
                  height: SCHEDULE_INVITE_ROW_HEIGHT,
                  top: (hour * 60 - bounds.startMinute) / 60 * SCHEDULE_INVITE_ROW_HEIGHT
                }}
              >
                {padNumber(hour)}:00
              </div>
            ))}
          </div>
          <div
            aria-label="点击创建邀请时间，拖动手柄调整时长"
            className="relative select-none overflow-hidden touch-pan-y"
            data-im-schedule-invite-canvas="true"
            onClick={handleCanvasClick}
            onPointerCancel={() => {
              canvasPressRef.current = null;
            }}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            ref={canvasRef}
            style={{ height: canvasHeight }}
          >
            {hours.map((hour) => (
              <div
                className="absolute left-0 right-0 border-b border-[color:color-mix(in_srgb,var(--client-line)_34%,transparent)]"
                key={`${date}-line-${hour}`}
                style={{
                  height: SCHEDULE_INVITE_ROW_HEIGHT,
                  top: (hour * 60 - bounds.startMinute) / 60 * SCHEDULE_INVITE_ROW_HEIGHT
                }}
              />
            ))}
            {sortedOptions.map((invite) => {
              const range = {
                endMinute: timeToMinutes(invite.endTime),
                startMinute: timeToMinutes(invite.startTime)
              };
              const clampedRange = {
                endMinute: clampScheduleInviteMinute(range.endMinute, bounds.startMinute, bounds.endMinute),
                startMinute: clampScheduleInviteMinute(range.startMinute, bounds.startMinute, bounds.endMinute)
              };

              if (clampedRange.endMinute <= bounds.startMinute || clampedRange.startMinute >= bounds.endMinute) {
                return null;
              }

              const toneStyle = buildScheduleInviteTimelineStyle(getScheduleInviteTimelineTone(invite.sourceType));

              return (
                <div
                  className="pointer-events-none absolute left-3 right-3 overflow-hidden rounded-[16px] border border-[color:var(--schedule-semantic-border)] bg-[linear-gradient(180deg,var(--schedule-semantic-fill),var(--schedule-semantic-fill-strong))] px-3 py-2.5 text-left text-[color:var(--schedule-semantic-text)] opacity-90 shadow-[0_12px_28px_var(--schedule-semantic-shadow)] [text-shadow:var(--schedule-semantic-text-shadow)]"
                  key={invite.id}
                  style={{
                    ...scheduleInviteRangeStyle(clampedRange, bounds),
                    ...toneStyle
                  }}
                >
                  <span className="inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--schedule-semantic-border)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--schedule-semantic-fill)_72%,transparent)] px-2 py-0.5 text-[10px] font-black">
                    {invite.meta}
                  </span>
                  <strong className="mt-1.5 block truncate text-[13px] font-black leading-5">{invite.title}</strong>
                  <span className="mt-1 block truncate text-[11px] font-bold opacity-75">
                    {invite.startTime} - {invite.endTime}
                    {invite.location ? ` · ${invite.location}` : ""}
                  </span>
                </div>
              );
            })}
            {activeRange ? (
              <ScheduleDraftRangeBlock
                action={(
                  <button
                    className="rounded-full bg-[color:var(--client-primary)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary-contrast)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]"
                    onClick={(event) => {
                      event.stopPropagation();
                      commitDragRange(activeRange);
                    }}
                    type="button"
                  >
                    创建
                  </button>
                )}
                className="left-2 right-2"
                onEndHandlePointerDown={(event) => handleResizePointerDown("resize-end", event)}
                onHandlePointerCancel={handlePointerCancel}
                onHandlePointerMove={handleResizePointerMove}
                onHandlePointerUp={handlePointerUp}
                onStartHandlePointerDown={(event) => handleResizePointerDown("resize-start", event)}
                style={scheduleInviteRangeStyle(activeRange, bounds)}
                subtitle="拖动上下手柄调整时间"
                timeRange={`${minutesToTime(activeRange.startMinute)} - ${minutesToTime(activeRange.endMinute)}`}
                title="新建行程"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function getConversationAvatar(store: ReturnType<typeof useImStore>, conversation: Conversation) {
  if (conversation.contactUserId) {
    return store.usersById[conversation.contactUserId]?.avatar ?? conversation.avatar;
  }

  return conversation.avatar;
}

function getConversationPartner(store: ReturnType<typeof useImStore>, conversation: Conversation) {
  return conversation.contactUserId ? store.usersById[conversation.contactUserId] : undefined;
}

function getContactInfoSettingsTarget(config: ReturnType<typeof getImRoleConfig>, contact?: ContactRelation) {
  if (!contact) {
    return undefined;
  }

  return config.routes.contactDetail(contact.id);
}

function getConversationProfileTarget(scope: ReturnType<typeof useImScope>, store: ReturnType<typeof useImStore>, conversation: Conversation) {
  return resolveImProfilePath(scope, getConversationPartner(store, conversation));
}

function getImMePath(scope: ImRoleType) {
  if (scope === "merchant") {
    return "/merchant/me";
  }

  if (scope === "technician") {
    return "/technician/me";
  }

  return "/me";
}

function getScopeEntityType(scope: ImRoleType): "user" | "technician" | "shop" {
  if (scope === "merchant") {
    return "shop";
  }

  if (scope === "technician") {
    return "technician";
  }

  return "user";
}

function getScopeVerifiedStatus(scope: ImRoleType): "none" | "rising" | "verified" | "business" {
  if (scope === "merchant") {
    return "business";
  }

  if (scope === "technician") {
    return "verified";
  }

  return "rising";
}

function ImCurrentActorHeader({
  scope,
  subtitle,
  currentUser
}: {
  scope: ImRoleType;
  subtitle: string;
  currentUser?: ImUser;
}) {
  const { profiles, getActorForScope } = useSocial();
  const actor = profiles[getActorForScope(scope as SocialPortalScope)];
  const linkedCustomer = scope === "user"
    ? customers.find((customer) => customer.id === currentUser?.entityId || customer.id === actor?.id)
    : undefined;
  const customerLevelLabel = linkedCustomer ? getCustomerLevelLabel(linkedCustomer.activeScore) : undefined;
  const signature = actor?.headline ?? currentUser?.signature ?? actor?.bio ?? currentUser?.bio ?? subtitle;

  return (
    <ImActorHeaderSummary
      avatar={actor?.avatar ?? currentUser?.avatar}
      entityType={actor?.entityType ?? getScopeEntityType(scope)}
      levelLabel={customerLevelLabel}
      membershipLevel={linkedCustomer?.memberLevel}
      name={actor?.displayName ?? currentUser?.nickname ?? "当前账号"}
      subtitle={signature}
      to={getImMePath(scope)}
      verifiedStatus={actor?.verifiedStatus ?? getScopeVerifiedStatus(scope)}
    />
  );
}

function appendQuery(path: string, entries: Record<string, string | string[] | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(entries).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) => searchParams.append(key, item));
      return;
    }

    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

type ContactCardPayload = NonNullable<MessageExt["contactCard"]>;

function buildContactCardPayload(user: ImUser): ContactCardPayload {
  return {
    userId: user.id,
    avatar: user.avatar,
    displayName: user.nickname,
    profileKind: user.profileKind,
    entityType: getImUserProfileEntityType(user),
    entityId: user.entityId,
    userIdLabel: user.userIdLabel,
    headline: user.signature ?? user.region ?? user.bio ?? user.source
  };
}

function resolveContactCardProfileRef(card: ContactCardPayload, user?: ImUser) {
  const entityType = card.entityType ?? (user ? getImUserProfileEntityType(user) : undefined);
  const entityId = card.entityId ?? user?.entityId;

  if (!entityType || !entityId || card.profileKind === "service") {
    return undefined;
  }

  return {
    entityType,
    id: entityId
  };
}

function resolveImUserSocialKey(user?: ImUser) {
  const entityType = user ? getImUserProfileEntityType(user) : undefined;

  if (!user || !entityType || !user.entityId || user.profileKind === "service") {
    return undefined;
  }

  return profileKey({ entityType, id: user.entityId });
}

function ImContactMomentsEntry({
  media,
  to
}: {
  media: SocialMediaItem[];
  to: string;
}) {
  return (
    <Link
      aria-label="查看动态"
      className="focus-ring flex min-h-[84px] items-center gap-4 rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-5 py-4 text-[color:var(--client-text)] shadow-[0_18px_44px_color-mix(in_srgb,var(--client-shadow)_18%,transparent)] transition hover:border-[color:color-mix(in_srgb,var(--client-primary)_46%,var(--client-line))] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,var(--client-surface))]"
      to={to}
    >
      <span className="shrink-0 text-[15px] font-black">动态</span>
      <span className="ml-auto flex min-w-0 items-center justify-end gap-2">
        {media.length > 0 ? (
          <span className="flex min-w-0 items-center justify-end gap-1.5 overflow-hidden">
            {media.slice(0, 5).map((item, index) => (
              <ImContactMomentsMediaTile index={index} key={item.id} media={item} />
            ))}
          </span>
        ) : (
          <span className="truncate text-xs font-semibold text-[color:var(--client-muted)]">暂无动态</span>
        )}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--client-muted)]">
          <ImIcon className="h-4 w-4 -rotate-90" name="chevron-down" />
        </span>
      </span>
    </Link>
  );
}

function ImContactMomentsMediaTile({
  index,
  media
}: {
  index: number;
  media: SocialMediaItem;
}) {
  const previewUrl = media.type === "video" ? media.thumbnailUrl ?? media.url : media.url;
  const label = media.type === "video" ? "视频" : "图片";

  return (
    <span
      className={cn(
        "relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,var(--client-surface))]",
        index >= 4 ? "hidden min-[430px]:block" : ""
      )}
    >
      {media.type === "video" && !media.thumbnailUrl ? (
        <video className="h-full w-full object-cover" muted playsInline preload="metadata" src={media.url} />
      ) : (
        <img alt={media.alt ?? `动态${label}${index + 1}`} className="h-full w-full object-cover" src={previewUrl} />
      )}
      {media.type === "video" ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/18 text-white">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-black/58">
            <MediaPlayGlyph className="ml-0.5 h-2.5 w-2.5" />
          </span>
        </span>
      ) : null}
    </span>
  );
}

const maxVoiceRecordingSeconds = 60;
const preferredVoiceMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"] as const;

type VoiceRecordingState = {
  active: boolean;
  cancel: boolean;
  durationSeconds: number;
  startedAt?: number;
};

const idleVoiceRecordingState: VoiceRecordingState = {
  active: false,
  cancel: false,
  durationSeconds: 0
};

function getSupportedVoiceMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return preferredVoiceMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("Failed to read recorded audio"));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Recorded audio could not be serialized"));
    };

    reader.readAsDataURL(blob);
  });
}

function readImageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Failed to read image size"));
    image.src = src;
  });
}

const contactSectionScrollMargin = "calc(env(safe-area-inset-top) + 5rem)";
const contactIndexBottomGutter = "calc(6rem + env(safe-area-inset-bottom))";
const contactIndexFixedRight = "max(0.5rem, calc((100vw - min(100vw, 880px)) / 2 + 0.5rem))";
const contactIndexFixedBottom = "calc(7.5rem + env(safe-area-inset-bottom))";
const groupIndexBottomGutter = "calc(8rem + env(safe-area-inset-bottom))";
const groupIndexFixedBottom = "calc(8.75rem + env(safe-area-inset-bottom))";
const contactIndexBarClassName =
  "pointer-events-auto max-h-full touch-none select-none overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-1 py-2 shadow-[0_8px_18px_color-mix(in_srgb,var(--client-text)_10%,transparent)] ring-1 ring-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] backdrop-blur-xl";

function getContactIndexLetterClassName(active: boolean, sizeClassName: string) {
  return cn(
    "flex w-7 items-center justify-center rounded-full font-black transition-colors",
    sizeClassName,
    active
      ? "bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-primary)_32%,transparent)]"
      : "text-[color:color-mix(in_srgb,var(--client-primary)_78%,transparent)]"
  );
}

function useImRuntime() {
  const scope = useImScope();
  const config = getImRoleConfig(scope);
  const store = useImStore(scope);
  const api = useMemo(() => createImApi(scope), [scope]);

  return {
    scope,
    config,
    store,
    api
  };
}

function useRoomBackTarget() {
  const scope = useImScope();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const config = getImRoleConfig(scope);
  const returnTo = searchParams.get("returnTo");

  return () => {
    if (returnTo) {
      navigate(returnTo, { replace: true });
      return;
    }

    navigate(config.routes.messages);
  };
}

function MessagePressable({
  onOpenMenu,
  children
}: {
  onOpenMenu: () => void;
  children: ReactNode;
}) {
  const timerRef = useRef<number | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearPress = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pressStartRef.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    clearPress();

    if (hasActiveImMessageTextSelection(event.currentTarget)) {
      return;
    }

    pressStartRef.current = { x: event.clientX, y: event.clientY };
    timerRef.current = window.setTimeout(onOpenMenu, 380);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pressStartRef.current;

    if (!start) {
      return;
    }

    if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10) {
      clearPress();
    }
  };

  return (
    <div
      onContextMenu={(event) => {
        if (hasActiveImMessageTextSelection(event.currentTarget)) {
          return;
        }
        event.preventDefault();
        onOpenMenu();
      }}
      onPointerCancel={clearPress}
      onPointerDown={handlePointerDown}
      onPointerLeave={clearPress}
      onPointerMove={handlePointerMove}
      onPointerUp={clearPress}
    >
      {children}
    </div>
  );
}

function ImQuickMenuItem({
  icon,
  label,
  onClick
}: {
  icon: "group" | "friend" | "payment" | "scan" | "tag";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 whitespace-nowrap rounded-[16px] px-3 py-3 text-left text-[14px] font-medium text-[color:var(--client-text)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]"
      onClick={onClick}
      type="button"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)] text-[color:var(--client-primary)]">
        <ImIcon className="h-4.5 w-4.5" name={icon} />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export function ImMessagesEntryPage() {
  const [searchParams] = useSearchParams();
  const compatConversationId = searchParams.get("chat");

  if (compatConversationId) {
    return <ImConversationRoomPage conversationId={compatConversationId} />;
  }

  return <ImConversationListPage />;
}

export function ImConversationListPage() {
  const { store, config, scope } = useImRuntime();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = getCurrentUser(store);
  const queryFromParams = searchParams.get("q") ?? "";
  const selectedTags = useMemo(() => readTagFilterParams(searchParams), [searchParams]);
  const [query, setQuery] = useState(queryFromParams);
  const deferredQuery = useDeferredValue(query);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignTags, setCampaignTags] = useState<string[]>([]);
  const [campaignUserIds, setCampaignUserIds] = useState<string[]>([]);
  const [campaignContent, setCampaignContent] = useState("");
  const [campaignImage, setCampaignImage] = useState<MessageCampaignImageInput | null>(null);
  const [campaignSending, setCampaignSending] = useState(false);
  const [campaignEstimate, setCampaignEstimate] = useState<TagMessageCampaignEstimate | null>(null);
  const [campaignResult, setCampaignResult] = useState<TagMessageCampaignResult | null>(null);
  const [keywordResult, setKeywordResult] = useState<ImSearchResult>(emptySearchResult);
  const scrollStorageKey = `needo.im.messages.scroll.v2.${scope}`;
  const pinnedCollapsedStorageKey = `needo.im.messages.pinned-collapsed.v2.${scope}`;
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(pinnedCollapsedStorageKey) === "1";
  });
  const openConversation = (conversationId: string) => {
    store.setActiveConversation(conversationId);
    navigate(config.routes.conversation(conversationId));
  };

  const updateFilterParams = (nextQuery: string, nextTags: string[], options: { replace?: boolean } = { replace: true }) => {
    const nextParams = new URLSearchParams(searchParams);
    const normalizedQuery = nextQuery.trim();

    nextParams.delete("q");
    nextParams.delete("tag");
    nextParams.delete("tags");

    if (normalizedQuery) {
      nextParams.set("q", normalizedQuery);
    }

    Array.from(new Set(nextTags.filter(Boolean))).forEach((tag) => nextParams.append("tag", tag));
    setSearchParams(nextParams, { replace: options.replace ?? true });
  };

  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    updateFilterParams(nextQuery, selectedTags, { replace: true });
  };

  const toggleTagFilter = (tag: string) => {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((item) => item !== tag)
      : [...selectedTags, tag];

    updateFilterParams(query, nextTags, { replace: true });
  };

  const clearListFilters = () => {
    setQuery("");
    updateFilterParams("", [], { replace: true });
  };

  const removeTagFilter = (tag: string) => {
    updateFilterParams(query, selectedTags.filter((item) => item !== tag), { replace: true });
  };

  useEffect(() => {
    if (store.status !== "ready" || typeof window === "undefined") {
      return;
    }

    const saved = window.localStorage.getItem(scrollStorageKey);

    if (!saved) {
      return;
    }

    window.scrollTo({ top: Number(saved), behavior: "auto" });
  }, [store.status]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleScroll = () => {
      window.localStorage.setItem(scrollStorageKey, String(window.scrollY));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!quickMenuOpen || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && quickMenuRef.current?.contains(target)) {
        return;
      }

      setQuickMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [quickMenuOpen]);

  useEffect(() => {
    setQuery(queryFromParams);
  }, [queryFromParams]);

  useEffect(() => {
    const normalizedQuery = deferredQuery.trim();

    if (!normalizedQuery) {
      setKeywordResult((current) =>
        current.contacts.length || current.conversations.length || current.messages.length ? emptySearchResult : current
      );
      return;
    }

    let alive = true;
    startTransition(() => {
      void store.search(normalizedQuery).then((response) => {
        if (!alive) {
          return;
        }

        setKeywordResult({
          contacts: response.contacts.filter((contact) => isProfileSearchableForRole(scope, store.usersById[contact.targetUserId])),
          conversations: response.conversations,
          messages: response.messages
        });
      });
    });

    return () => {
      alive = false;
    };
  }, [deferredQuery, scope, store.search, store.usersById]);

  const visibleContacts = useMemo(() => getVisibleImContacts(store, scope), [scope, store.contacts, store.usersById]);
  const conversations = store.conversations;
  const contactLabelExcludedTags = useMemo(() => scope === "merchant" ? getMerchantOrganizationRoleTagNames() : [], [scope]);
  const availableTags = useMemo(
    () => buildManagedTagCounts(visibleContacts, readImTagListUiState(scope), conversations, contactLabelExcludedTags),
    [scope, conversations, contactLabelExcludedTags, visibleContacts]
  );
  const openTagCampaign = (tags = selectedTags) => {
    setCampaignTags(tags);
    setCampaignUserIds([]);
    setCampaignResult(null);
    setCampaignOpen(true);
    setQuickMenuOpen(false);
  };
  const toggleCampaignTag = (tag: string) => {
    setCampaignResult(null);
    setCampaignTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  };
  const toggleCampaignUser = (userId: string) => {
    setCampaignResult(null);
    setCampaignUserIds((current) => current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId]);
  };
  const changeCampaignImage = async (file?: File) => {
    setCampaignResult(null);

    if (!file) {
      setCampaignImage(null);
      return;
    }

    const url = await readBlobAsDataUrl(file);
    const size = await readImageSize(url).catch(() => undefined);

    setCampaignImage({
      url,
      thumbnailUrl: url,
      fileName: file.name || "campaign-image.jpg",
      fileSize: file.size,
      mimeType: file.type || "image/jpeg",
      width: size?.width,
      height: size?.height
    });
  };
  const submitTagCampaign = async () => {
    if (campaignSending || (campaignTags.length === 0 && campaignUserIds.length === 0) || (!campaignContent.trim() && !campaignImage)) {
      return;
    }

    setCampaignSending(true);

    try {
      const result = await store.sendTagMessageCampaign({
        tagIds: campaignTags,
        targetUserIds: campaignUserIds,
        content: campaignContent,
        image: campaignImage ?? undefined
      });
      setCampaignResult(result);
      setCampaignContent("");
      setCampaignImage(null);
    } finally {
      setCampaignSending(false);
    }
  };
  const activeKeyword = deferredQuery.trim();
  const taggedConversationIds = useMemo(
    () => getConversationIdsForTaggedContacts(conversations, visibleContacts, selectedTags),
    [conversations, selectedTags, visibleContacts]
  );
  const keywordConversationIds = useMemo(
    () => (activeKeyword ? getConversationIdsForSearchResult(conversations, keywordResult) : new Set<string>()),
    [activeKeyword, conversations, keywordResult]
  );
  const hasTagFilter = selectedTags.length > 0;
  const hasKeywordFilter = activeKeyword.length > 0;
  const hasActiveFilters = hasTagFilter || hasKeywordFilter;
  const filteredConversations = useMemo(
    () =>
      conversations.filter((conversation) => {
        if (hasTagFilter && !taggedConversationIds.has(conversation.id)) {
          return false;
        }

        if (hasKeywordFilter && !keywordConversationIds.has(conversation.id)) {
          return false;
        }

        return true;
      }),
    [conversations, hasKeywordFilter, hasTagFilter, keywordConversationIds, taggedConversationIds]
  );
  const pinnedConversations = filteredConversations.filter((conversation) => conversation.isPinned);
  const regularConversations = filteredConversations.filter((conversation) => !conversation.isPinned);
  const openQuickEntry = (mode: "group" | "friend" | "collect" | "scan") => {
    setQuickMenuOpen(false);
    navigate(appendQuery(config.routes.newConversation, { mode }));
  };

  useEffect(() => {
    if (!campaignOpen || (campaignTags.length === 0 && campaignUserIds.length === 0)) {
      setCampaignEstimate(null);
      return;
    }

    let alive = true;

    void store.estimateTagMessageCampaign({
      tagIds: campaignTags,
      targetUserIds: campaignUserIds
    }).then((estimate) => {
      if (alive) {
        setCampaignEstimate(estimate);
      }
    });

    return () => {
      alive = false;
    };
  }, [campaignOpen, campaignTags, campaignUserIds, store.estimateTagMessageCampaign]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(pinnedCollapsedStorageKey, pinnedCollapsed ? "1" : "0");
  }, [pinnedCollapsed, pinnedCollapsedStorageKey]);

  const renderConversationItem = (conversation: Conversation, showDivider: boolean) => {
    const preview = buildConversationRowPreview(conversation);
    const title = getConversationDisplayName(store, conversation);
    const pinActionLabel = conversation.isPinned ? "取消置顶" : "置顶";
    const avatarTarget = getConversationProfileTarget(scope, store, conversation);

    return (
      <UnifiedConversationItem
        actions={[
          {
            key: "pin",
            label: pinActionLabel,
            tone: "warning",
            width: 66,
            onClick: () => void store.pinConversation(conversation.id, !conversation.isPinned)
          },
          {
            key: "read",
            label: conversation.unreadCount > 0 ? "已读" : "未读",
            tone: "neutral",
            width: 58,
            onClick: () => void store.markConversationRead(conversation.id)
          },
          {
            key: "mute",
            label: conversation.isMuted ? "提醒" : "免打扰",
            tone: "neutral",
            width: 66,
            onClick: () => void store.muteConversation(conversation.id, !conversation.isMuted)
          },
          {
            key: "delete",
            label: "删除",
            tone: "danger",
            width: 64,
            onClick: () => void store.deleteConversation(conversation.id)
          }
        ]}
        avatar={getConversationAvatar(store, conversation)}
        avatarTo={avatarTarget}
        conversationType={conversation.type}
        group={conversation.type === "group"}
        key={conversation.id}
        mention={conversation.mentionAll ? "@所有人" : conversation.mentionMe ? "@我" : undefined}
        muted={conversation.isMuted}
        pinned={conversation.isPinned}
        privacyMode={conversation.privacyModeEnabled}
        preview={preview}
        showDivider={showDivider}
        time={formatConversationTime(conversation.lastMessageTime)}
        title={title}
        onClick={() => openConversation(conversation.id)}
        unreadCount={conversation.unreadCount}
      />
    );
  };

  if (store.status === "error") {
    return (
      <MobileShell navItems={config.navItems}>
        <ImEmptyState caption={store.error ?? "聊天模块加载失败"} title="暂时无法打开聊天" />
      </MobileShell>
    );
  }

  return (
    <MobileShell navItems={config.navItems}>
      <UnifiedChatHomePage
        actions={
          <div className="relative" ref={quickMenuRef}>
            <UnifiedChatHeaderAction label="更多操作" onClick={() => setQuickMenuOpen((current) => !current)}>
              <ImIcon name="add" />
            </UnifiedChatHeaderAction>
            {quickMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[224px] rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-text)_12%)] p-2 shadow-[0_20px_48px_rgba(0,0,0,0.26)] backdrop-blur-xl">
                <ImQuickMenuItem icon="group" label="发起群聊" onClick={() => openQuickEntry("group")} />
                <ImQuickMenuItem icon="friend" label="添加好友" onClick={() => openQuickEntry("friend")} />
                <ImQuickMenuItem icon="tag" label="群发" onClick={() => openTagCampaign()} />
                <ImQuickMenuItem icon="payment" label="发起收款" onClick={() => openQuickEntry("collect")} />
                <ImQuickMenuItem icon="scan" label="扫一扫" onClick={() => openQuickEntry("scan")} />
              </div>
            ) : null}
          </div>
        }
        roleType={scope}
        searchBar={
          <ImConversationListSearchBar
            activeTagCount={selectedTags.length}
            onFilterClick={() => setFilterSheetOpen(true)}
            onQueryChange={changeQuery}
            onQueryCommit={() => store.rememberSearchTerm(query)}
            placeholder="搜索联系人、群聊、聊天记录"
            query={query}
          />
        }
        title={<ImCurrentActorHeader currentUser={currentUser} scope={scope} subtitle="聊天" />}
      >
        {conversations.length === 0 ? (
          <ImEmptyState
            action={<Button size="md" to={config.routes.contacts}>去通讯录发起聊天</Button>}
            caption="先从通讯录里找一个联系人开始对话。"
            title="还没有会话"
          />
        ) : (
          <>
            {hasActiveFilters ? (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {activeKeyword ? (
                  <button
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--client-primary)]"
                    onClick={() => changeQuery("")}
                    type="button"
                  >
                    <span className="truncate">关键词：{activeKeyword}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ) : null}
                {selectedTags.map((tag) => (
                  <button
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--client-primary)]"
                    key={tag}
                    onClick={() => removeTagFilter(tag)}
                    type="button"
                  >
                    <span className="truncate">{tag}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
                {selectedTags.length > 0 ? (
                  <button
                    className="rounded-full bg-[color:var(--client-primary)] px-3 py-1.5 text-xs font-black text-[color:var(--pin-badge-glyph)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                    onClick={() => openTagCampaign(selectedTags)}
                    type="button"
                  >
                    群发给这些标签
                  </button>
                ) : null}
                <button
                  className="rounded-full px-2 py-1 text-xs font-semibold text-[color:var(--client-soft-muted)]"
                  onClick={clearListFilters}
                  type="button"
                >
                  清除
                </button>
              </div>
            ) : null}
            {filteredConversations.length === 0 ? (
              <ImEmptyState
                action={<Button onClick={clearListFilters} size="md" variant="secondary">清除筛选</Button>}
                caption="可以换个关键词，或减少标签后再看。"
                title="没有找到匹配聊天"
              />
            ) : (
              <UnifiedConversationList>
                {pinnedConversations.length > 0 ? (
                  pinnedCollapsed ? (
                    <UnifiedPinnedConversationToggle
                      collapsed
                      count={pinnedConversations.length}
                      onClick={() => setPinnedCollapsed(false)}
                    />
                  ) : (
                    <>
                      {pinnedConversations.map((conversation, index) => renderConversationItem(conversation, index < pinnedConversations.length - 1))}
                      <UnifiedPinnedConversationDivider onClick={() => setPinnedCollapsed(true)} />
                    </>
                  )
                ) : null}
                {regularConversations.map((conversation, index) => renderConversationItem(conversation, index < regularConversations.length - 1))}
              </UnifiedConversationList>
            )}
          </>
        )}
      </UnifiedChatHomePage>
      <ImTagFilterSheet
        availableTags={availableTags}
        onClear={clearListFilters}
        onClose={() => setFilterSheetOpen(false)}
        onToggleTag={toggleTagFilter}
        open={filterSheetOpen}
        selectedTags={selectedTags}
      />
      <ImTagCampaignSheet
        availableTags={availableTags}
        contacts={visibleContacts}
        content={campaignContent}
        estimate={campaignEstimate}
        image={campaignImage}
        onClose={() => setCampaignOpen(false)}
        onContentChange={(value) => {
          setCampaignResult(null);
          setCampaignContent(value);
        }}
        onImageChange={(file) => void changeCampaignImage(file)}
        onImageClear={() => void changeCampaignImage()}
        onSubmit={submitTagCampaign}
        onToggleTag={toggleCampaignTag}
        onToggleUser={toggleCampaignUser}
        open={campaignOpen}
        result={campaignResult}
        selectedTags={campaignTags}
        selectedUserIds={campaignUserIds}
        sending={campaignSending}
        usersById={store.usersById}
      />
    </MobileShell>
  );
}

export function ImContactsListPage() {
  const { store, config, scope } = useImRuntime();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = getCurrentUser(store);
  const entityStore = useEntityStore();
  const contactQueryFromParams = searchParams.get("q") ?? "";
  const selectedTags = useMemo(() => readTagFilterParams(searchParams), [searchParams]);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [editingRemarkContactId, setEditingRemarkContactId] = useState<string | null>(null);
  const [remarkValue, setRemarkValue] = useState("");
  const [addingContactId, setAddingContactId] = useState<string | null>(null);
  const [addStaffQuery, setAddStaffQuery] = useState("");
  const [contactQuery, setContactQuery] = useState(contactQueryFromParams);
  const deferredContactQuery = useDeferredValue(contactQuery);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const isAddStaffMode = scope === "merchant" && searchParams.get("intent") === "add-staff";
  const addStaffType = getAddStaffMode(searchParams.get("staffType"));
  const addStaffLabel = getAddStaffLabel(addStaffType);
  const addStaffRoleName = searchParams.get("roleName")?.trim() || merchantTechnicianRoleName;
  const visibleContacts = store.contacts.filter((contact) => isContactVisibleForRole(scope, store.usersById[contact.targetUserId], contact));
  const addStaffKeyword = addStaffQuery.trim().toLowerCase();
  const addStaffContacts = visibleContacts.filter((contact) => {
    const user = store.usersById[contact.targetUserId];

    if (!user || user.entityType !== "technician" || user.serviceAccount || contact.relationStatus !== "active" || contact.isBlocked) {
      return false;
    }

    if (!addStaffKeyword) {
      return true;
    }

    return [getDisplayName(user, contact), user.userIdLabel, buildContactCaption(user, contact), ...user.searchableFields].some((field) =>
      field.toLowerCase().includes(addStaffKeyword)
    );
  });
  const contactLabelExcludedTags = useMemo(() => scope === "merchant" ? getMerchantOrganizationRoleTagNames() : [], [scope]);
  const availableTags = useMemo(
    () => buildManagedTagCounts(visibleContacts, readImTagListUiState(scope), [], contactLabelExcludedTags),
    [contactLabelExcludedTags, scope, visibleContacts]
  );
  const activeContactKeyword = deferredContactQuery.trim();
  const normalizedContactKeyword = activeContactKeyword.toLowerCase();
  const filteredVisibleContacts = useMemo(() => {
    const selectedTagSet = new Set(selectedTags);

    return visibleContacts.filter((contact) => {
      const user = store.usersById[contact.targetUserId];

      if (!user) {
        return false;
      }

      if (selectedTagSet.size > 0 && !contact.tags.some((tag) => selectedTagSet.has(tag))) {
        return false;
      }

      if (normalizedContactKeyword && !doesContactMatchDirectoryKeyword(contact, user, normalizedContactKeyword)) {
        return false;
      }

      return true;
    });
  }, [normalizedContactKeyword, selectedTags, store.usersById, visibleContacts]);
  const hasTagFilter = selectedTags.length > 0;
  const hasKeywordFilter = activeContactKeyword.length > 0;
  const hasActiveFilters = hasTagFilter || hasKeywordFilter;
  const sectionContacts = isAddStaffMode ? addStaffContacts : filteredVisibleContacts;
  const sections = buildContactSections({
    users: store.users,
    contacts: sectionContacts
  });
  const visibleIndexLetters = getVisibleIndexLetters(sections, { includeSymbolFallback: true });
  const sectionRefs = useRef<Partial<Record<ContactIndexLetter, HTMLDivElement | null>>>({});
  const indexBarRef = useRef<HTMLDivElement | null>(null);
  const indexClearTimerRef = useRef<number | null>(null);
  const activeDragLetterRef = useRef<ContactIndexLetter | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [activeIndexLetter, setActiveIndexLetter] = useState<ContactIndexLetter | null>(null);
  const serviceContacts = getServiceContacts({
    ...store,
    contacts: visibleContacts
  });
  const organizationContacts = useMemo(
    () => getOrganizationContacts(store, scope, entityStore),
    [entityStore, scope, store.contacts, store.usersById]
  );
  const editingRemarkContact = visibleContacts.find((contact) => contact.id === editingRemarkContactId);
  const editingRemarkUser = editingRemarkContact ? store.usersById[editingRemarkContact.targetUserId] : undefined;
  const indexLetterClassName = visibleIndexLetters.length > 18
    ? "h-3.5 text-[9px] leading-[14px]"
    : visibleIndexLetters.length > 12
      ? "h-4 text-[10px] leading-4"
      : "h-5 text-[11px] leading-5";

  useEffect(() => {
    setContactQuery(contactQueryFromParams);
  }, [contactQueryFromParams]);

  useEffect(() => {
    setRemarkValue(editingRemarkContact?.remarkName ?? "");
  }, [editingRemarkContact?.id, editingRemarkContact?.remarkName]);

  useEffect(() => {
    if (!quickMenuOpen || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && quickMenuRef.current?.contains(target)) {
        return;
      }

      setQuickMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [quickMenuOpen]);

  useEffect(() => () => {
    if (indexClearTimerRef.current !== null) {
      window.clearTimeout(indexClearTimerRef.current);
    }
  }, []);

  const openQuickEntry = (mode: "group" | "friend" | "collect" | "scan") => {
    setQuickMenuOpen(false);
    navigate(appendQuery(config.routes.newConversation, { mode }));
  };

  const updateContactFilterParams = (nextQuery: string, nextTags: string[], options: { replace?: boolean } = { replace: true }) => {
    const nextParams = new URLSearchParams(searchParams);
    const normalizedQuery = nextQuery.trim();

    nextParams.delete("q");
    nextParams.delete("tag");
    nextParams.delete("tags");

    if (normalizedQuery) {
      nextParams.set("q", normalizedQuery);
    }

    Array.from(new Set(nextTags.filter(Boolean))).forEach((tag) => nextParams.append("tag", tag));
    setSearchParams(nextParams, { replace: options.replace ?? true });
  };

  const changeContactQuery = (nextQuery: string) => {
    setContactQuery(nextQuery);
    updateContactFilterParams(nextQuery, selectedTags, { replace: true });
  };

  const toggleContactTagFilter = (tag: string) => {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((item) => item !== tag)
      : [...selectedTags, tag];

    updateContactFilterParams(contactQuery, nextTags, { replace: true });
  };

  const clearContactFilters = () => {
    setContactQuery("");
    updateContactFilterParams("", [], { replace: true });
  };

  const removeContactTagFilter = (tag: string) => {
    updateContactFilterParams(contactQuery, selectedTags.filter((item) => item !== tag), { replace: true });
  };

  const handleAddStaffFromContact = async (contact: ContactRelation, user: ImUser) => {
    setAddingContactId(contact.id);

    try {
      await store.updateContactTags(contact.id, mergeTags(contact.tags, ["员工", addStaffLabel, addStaffRoleName]));

      if (user.entityType === "technician" && user.entityId) {
        updateTechnicianEntity(user.entityId, (technician) => ({
          identityLabel: addStaffType === "partTime" ? "个人技师" : "店铺所属技师",
          profileTags: mergeTags([addStaffLabel, addStaffRoleName], technician.profileTags ?? technician.skills),
          storeId: currentUser?.entityType === "shop" && currentUser.entityId ? currentUser.entityId : technician.storeId
        }));
      }

      navigate(`/merchant/staff?staffType=${addStaffType}`, { replace: true });
    } finally {
      setAddingContactId(null);
    }
  };

  const clearIndexHighlight = () => {
    if (indexClearTimerRef.current !== null) {
      window.clearTimeout(indexClearTimerRef.current);
      indexClearTimerRef.current = null;
    }
  };

  const scheduleIndexHighlightClear = () => {
    clearIndexHighlight();
    indexClearTimerRef.current = window.setTimeout(() => {
      setActiveIndexLetter(null);
      indexClearTimerRef.current = null;
    }, 420);
  };

  const scrollToIndexLetter = (
    letter: ContactIndexLetter,
    {
      behavior = "smooth",
      keepHighlight = false,
      dedupeDrag = false
    }: {
      behavior?: ScrollBehavior;
      keepHighlight?: boolean;
      dedupeDrag?: boolean;
    } = {}
  ) => {
    if (dedupeDrag && activeDragLetterRef.current === letter) {
      return;
    }

    activeDragLetterRef.current = keepHighlight ? letter : null;
    clearIndexHighlight();
    setActiveIndexLetter(letter);

    const fallbackLetter = letter === "#" ? sections.at(-1)?.letter : undefined;
    const targetSection = sectionRefs.current[letter] ?? (fallbackLetter ? sectionRefs.current[fallbackLetter] : undefined);
    targetSection?.scrollIntoView({ behavior, block: "start" });

    if (!keepHighlight) {
      scheduleIndexHighlightClear();
    }
  };

  const resolveIndexLetterFromPointer = (clientY: number) => {
    const container = indexBarRef.current;

    if (!container || visibleIndexLetters.length === 0) {
      return null;
    }

    const rect = container.getBoundingClientRect();
    return resolveIndexLetterFromTouchY(clientY, rect.top, rect.height / visibleIndexLetters.length, visibleIndexLetters);
  };

  const finishIndexDrag = (pointerId?: number, releaseTarget?: HTMLDivElement | null) => {
    if (pointerId !== undefined && releaseTarget?.hasPointerCapture(pointerId)) {
      releaseTarget.releasePointerCapture(pointerId);
    }

    activePointerIdRef.current = null;
    activeDragLetterRef.current = null;
    clearIndexHighlight();
    setActiveIndexLetter(null);
  };

  return (
    <MobileShell navItems={config.navItems}>
      <UnifiedChatHomePage
        actions={isAddStaffMode ? undefined : (
          <div className="relative" ref={quickMenuRef}>
            <UnifiedChatHeaderAction label="更多操作" onClick={() => setQuickMenuOpen((current) => !current)}>
              <ImIcon name="add" />
            </UnifiedChatHeaderAction>
            {quickMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[224px] rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_88%,var(--client-text)_12%)] p-2 shadow-[0_20px_48px_rgba(0,0,0,0.26)] backdrop-blur-xl">
                <ImQuickMenuItem icon="group" label="发起群聊" onClick={() => openQuickEntry("group")} />
                <ImQuickMenuItem icon="friend" label="添加好友" onClick={() => openQuickEntry("friend")} />
                <ImQuickMenuItem icon="payment" label="发起收款" onClick={() => openQuickEntry("collect")} />
                <ImQuickMenuItem icon="scan" label="扫一扫" onClick={() => openQuickEntry("scan")} />
              </div>
            ) : null}
          </div>
        )}
        roleType={scope}
        searchBar={isAddStaffMode ? (
          <label className="flex h-12 w-full items-center gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_46%,var(--client-bg)_54%)] px-4 text-[14px] text-[color:var(--client-muted)]">
            <ImIcon className="h-4 w-4 shrink-0 text-[color:var(--client-soft-muted)]" name="search" />
            <input
              aria-label="搜索联系人"
              className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
              onChange={(event) => setAddStaffQuery(event.target.value)}
              placeholder="搜索联系人"
              value={addStaffQuery}
            />
          </label>
        ) : (
          <ImConversationListSearchBar
            activeTagCount={selectedTags.length}
            onFilterClick={() => setFilterSheetOpen(true)}
            onQueryChange={changeContactQuery}
            onQueryCommit={() => {
              store.rememberSearchTerm(contactQuery);
            }}
            placeholder="搜索联系人、群聊、消息"
            query={contactQuery}
          />
        )}
        title={isAddStaffMode ? getAddStaffTitle(addStaffType) : <ImCurrentActorHeader currentUser={currentUser} scope={scope} subtitle="通讯录" />}
      >
      <div className="relative pb-8">
        {!isAddStaffMode ? (
          <>
            {hasActiveFilters ? (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {activeContactKeyword ? (
                  <button
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--client-primary)]"
                    onClick={() => changeContactQuery("")}
                    type="button"
                  >
                    <span className="truncate">搜索：{activeContactKeyword}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ) : null}
                {selectedTags.map((tag) => (
                  <button
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--client-primary)]"
                    key={tag}
                    onClick={() => removeContactTagFilter(tag)}
                    type="button"
                  >
                    <span className="truncate">{tag}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
                <button
                  className="rounded-full px-2 py-1 text-xs font-semibold text-[color:var(--client-soft-muted)]"
                  onClick={clearContactFilters}
                  type="button"
                >
                  清除
                </button>
              </div>
            ) : null}
            <section className="mt-3 divide-y divide-[color:color-mix(in_srgb,var(--client-line)_44%,transparent)] overflow-hidden rounded-2xl bg-transparent">
              <ImEntryCell badge={store.friendRequests.filter((request) => request.status === "pending").length || undefined} icon={<ImIcon name="friend" />} title="新的朋友" to={config.routes.friendRequests} />
              {scope !== "user" ? <ImEntryCell caption={`${organizationContacts.length} 人`} icon={<ImIcon name="organization" />} title="组织" to={config.routes.organization} /> : null}
              <ImEntryCell icon={<ImIcon name="group" />} title="群聊" to={appendQuery(config.routes.newConversation, { mode: "group" })} />
              <ImEntryCell icon={<ImIcon name="tag" />} title="标签" to={config.routes.tags} />
              {serviceContacts.length > 0 ? <ImEntryCell icon={<ImIcon name="service" />} title="服务号" to={config.routes.serviceAccounts} /> : null}
            </section>

            <div className="px-1 pt-3">
              <Link className="block rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_44%,transparent)] bg-transparent px-4 py-3 text-sm text-[color:var(--client-muted)]" to={config.routes.blacklist}>
                黑名单管理
                <span className="ml-2 text-xs text-[color:var(--client-soft-muted)]">已拉黑联系人统一在这里解除或继续保留</span>
              </Link>
            </div>
          </>
        ) : null}

        <div className="mt-3 overflow-hidden rounded-2xl bg-transparent">
          {sections.length > 0 ? sections.map((section) => (
            <div
              className="scroll-mt-24"
              key={section.letter}
              ref={(element) => {
                sectionRefs.current[section.letter] = element;
              }}
              style={{ scrollMarginTop: contactSectionScrollMargin }}
            >
              <SectionTag>{section.letter}</SectionTag>
              {section.items.map((contact) => {
                const user = store.usersById[contact.targetUserId];

                if (!user) {
                  return null;
                }

                const contactInfoTarget = getContactInfoSettingsTarget(config, contact);

                return isAddStaffMode ? (
                  <ContactRow
                    avatarBadge={<AddStaffContactBadge adding={addingContactId === contact.id} />}
                    caption={buildContactCaption(user, contact)}
                    contact={contact}
                    key={contact.id}
                    onClick={() => void handleAddStaffFromContact(contact, user)}
                    user={user}
                  />
                ) : (
                  <SwipeActionRow
                    actions={[
                      {
                        key: "delete",
                        label: "删除",
                        tone: "danger",
                        width: 76,
                        onClick: () => void store.deleteContact(contact.id)
                      },
                      {
                        key: "block",
                        label: "拉黑",
                        tone: "warning",
                        width: 76,
                        onClick: () => void store.blockContact(contact.id)
                      },
                      {
                        key: "remark",
                        label: "备注",
                        tone: "neutral",
                        width: 76,
                        onClick: () => setEditingRemarkContactId(contact.id)
                      }
                    ]}
                    key={contact.id}
                    variant="flat-list"
                  >
                    <ContactRow
                      avatarTo={resolveImProfilePath(scope, user)}
                      caption={buildContactCaption(user, contact)}
                      contact={contact}
                      to={contactInfoTarget}
                      user={user}
                    />
                  </SwipeActionRow>
                );
              })}
            </div>
          )) : isAddStaffMode ? (
            <ImEmptyState
              caption={addStaffQuery.trim() ? "换一个联系人名称或 ID 试试。" : "当前通讯录里还没有可添加为员工的联系人。"}
              title="暂无可添加员工"
            />
          ) : hasActiveFilters ? (
            <ImEmptyState
              action={<Button onClick={clearContactFilters} size="md" variant="secondary">清除筛选</Button>}
              caption="可以换个关键词，或减少标签后再看。"
              title="没有找到匹配联系人"
            />
          ) : null}
        </div>

        {visibleIndexLetters.length > 0 ? (
          <div
            className="pointer-events-none fixed z-20 overflow-hidden rounded-full"
            style={{
              bottom: contactIndexFixedBottom,
              right: contactIndexFixedRight,
              maxHeight: `max(3rem, calc(100dvh - 34dvh - ${contactIndexBottomGutter}))`
            }}
          >
            <div
              className={contactIndexBarClassName}
              onPointerCancel={(event) => finishIndexDrag(event.pointerId, event.currentTarget)}
              onPointerDown={(event) => {
                const letter = resolveIndexLetterFromPointer(event.clientY);

                if (!letter) {
                  return;
                }

                activePointerIdRef.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
                scrollToIndexLetter(letter, { behavior: "auto", keepHighlight: true });
              }}
              onPointerMove={(event) => {
                if (activePointerIdRef.current !== event.pointerId) {
                  return;
                }

                const letter = resolveIndexLetterFromPointer(event.clientY);

                if (!letter) {
                  return;
                }

                scrollToIndexLetter(letter, {
                  behavior: "auto",
                  keepHighlight: true,
                  dedupeDrag: true
                });
              }}
              onPointerUp={(event) => finishIndexDrag(event.pointerId, event.currentTarget)}
              ref={indexBarRef}
            >
              {visibleIndexLetters.map((letter) => (
                <button
                  aria-label={`跳转到 ${letter} 分组`}
                  className={getContactIndexLetterClassName(activeIndexLetter === letter, indexLetterClassName)}
                  key={letter}
                  onClick={() => scrollToIndexLetter(letter)}
                  type="button"
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      </UnifiedChatHomePage>

      <ImTagFilterSheet
        availableTags={availableTags}
        onClear={clearContactFilters}
        onClose={() => setFilterSheetOpen(false)}
        onToggleTag={toggleContactTagFilter}
        open={filterSheetOpen}
        selectedTags={selectedTags}
      />

      <ImBottomSheet onClose={() => setEditingRemarkContactId(null)} open={Boolean(editingRemarkContact && editingRemarkUser)} title="设置备注">
        <div className="space-y-3 pb-2">
          {editingRemarkUser ? (
            <p className="text-sm text-ink/45">
              当前联系人：{getDisplayName(editingRemarkUser, editingRemarkContact)}
            </p>
          ) : null}
          <input
            className="w-full rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-surface)] px-4 py-3 text-[15px] text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]"
            onChange={(event) => setRemarkValue(event.target.value)}
            placeholder="输入备注名"
            type="text"
            value={remarkValue}
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setEditingRemarkContactId(null)} variant="secondary">取消</Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (!editingRemarkContact) {
                  return;
                }

                void store.updateRemark(editingRemarkContact.id, remarkValue);
                setEditingRemarkContactId(null);
              }}
            >
              保存
            </Button>
          </div>
        </div>
      </ImBottomSheet>
    </MobileShell>
  );
}

export function ImFriendRequestsPage() {
  const { scope, store, config } = useImRuntime();
  const social = useSocial();
  const navigate = useNavigate();
  const pending = store.friendRequests
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const syncAcceptedFriendFollow = (request: FriendRequest, fromUser: ImUser) => {
    const currentUser = store.usersById[store.currentUserId ?? request.toUserId] ?? store.usersById[request.toUserId];
    const currentSocialKey = resolveImUserSocialKey(currentUser);
    const fromSocialKey = resolveImUserSocialKey(fromUser);

    if (!currentSocialKey || !fromSocialKey || !social.profiles[currentSocialKey] || !social.profiles[fromSocialKey]) {
      return;
    }

    social.ensureMutualFollow(currentSocialKey, fromSocialKey);
  };
  const handleAcceptFriendRequest = async (request: FriendRequest, fromUser: ImUser) => {
    await store.acceptFriendRequest(request.id);
    syncAcceptedFriendFollow(request, fromUser);
  };

  return (
    <ImStandaloneShell>
      <ImTopBar onBack={() => navigate(config.routes.contacts)} title="新的朋友" />
      <div className="space-y-3 px-4 py-4">
        {pending.map((request) => {
          const user = store.usersById[request.fromUserId];

          if (!user) {
            return null;
          }

          return (
            <section className="rounded-[24px] bg-white p-4 shadow-[0_12px_32px_rgba(20,20,20,0.06)]" key={request.id}>
              <div className="flex items-start gap-3">
                <InteractiveAvatar alt={user.nickname} className="h-14 w-14" src={user.avatar} to={resolveImProfilePath(scope, user)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="truncate text-base">{user.nickname}</strong>
                    <span className="text-xs text-ink/35">{formatConversationTime(request.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink/45">{request.source}</p>
                  <p className="mt-3 text-sm leading-6 text-ink">{request.requestMessage}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                {request.status === "pending" ? (
                  <>
                    <Button onClick={() => void store.rejectFriendRequest(request.id)} size="sm" variant="secondary">拒绝</Button>
                    <Button onClick={() => void handleAcceptFriendRequest(request, user)} size="sm">接受</Button>
                  </>
                ) : (
                  <span className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_64%,transparent)] px-3 py-2 text-xs font-semibold text-[color:var(--client-soft-muted)]">
                    {request.status === "accepted" ? "已通过" : request.status === "rejected" ? "已拒绝" : "已过期"}
                  </span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </ImStandaloneShell>
  );
}

export function ImContactDetailPage() {
  const { store, config } = useImRuntime();
  const navigate = useNavigate();
  const { contactId } = useParams();
  const [redirectFailed, setRedirectFailed] = useState(false);
  const contact = store.contacts.find((item) => item.id === contactId);
  const user = contact ? store.usersById[contact.targetUserId] : undefined;

  useEffect(() => {
    if (!contact || !user?.id) {
      return undefined;
    }

    let cancelled = false;
    const userId = user.id;

    setRedirectFailed(false);
    void store.ensureDirectConversation(userId)
      .then((conversation) => {
        if (!cancelled) {
          navigate(config.routes.conversationInfo(conversation.id), { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRedirectFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [config.routes, contact?.id, navigate, store, user?.id]);

  if (!contact || !user) {
    return (
      <ImStandaloneShell>
        <ImTopBar onBack={() => navigate(config.routes.contacts)} title="信息设置" />
        <ImEmptyState caption="这个联系人可能已经被删除或还没同步到本地。" title="找不到联系人" />
      </ImStandaloneShell>
    );
  }

  return (
    <ImStandaloneShell>
      <ImTopBar onBack={() => navigate(config.routes.contacts)} title="信息设置" />
      <ImEmptyState
        action={redirectFailed ? <Button onClick={() => navigate(config.routes.contacts)} size="md" variant="secondary">返回通讯录</Button> : undefined}
        caption={redirectFailed ? "暂时无法打开这个联系人的信息设置，请稍后再试。" : "正在进入信息设置..."}
        title={redirectFailed ? "打开失败" : "正在打开"}
      />
    </ImStandaloneShell>
  );
}

function buildSearchMessageSubtitle(store: ReturnType<typeof useImStore>, message: ConversationMessage) {
  const sender = store.usersById[message.senderId];
  const conversation = store.conversations.find((item) => item.id === message.conversationId);
  return `${conversation ? getConversationDisplayName(store, conversation) : "会话"} · ${sender?.nickname ?? "未知发送者"}`;
}

const emptySearchResult: { contacts: ContactRelation[]; conversations: Conversation[]; messages: ConversationMessage[] } = {
  contacts: [],
  conversations: [],
  messages: []
};

function readTagFilterParams(searchParams: URLSearchParams) {
  return Array.from(
    new Set(
      [
        ...searchParams.getAll("tag"),
        ...(searchParams.get("tags")?.split(",") ?? [])
      ]
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function getVisibleImContacts(store: ReturnType<typeof useImStore>, scope: ImRoleType) {
  return store.contacts.filter((contact) => isContactVisibleForRole(scope, store.usersById[contact.targetUserId], contact) && !contact.isBlocked);
}

function doesContactMatchDirectoryKeyword(contact: ContactRelation, user: ImUser, keyword: string) {
  return [
    getDisplayName(user, contact),
    user.nickname,
    user.userIdLabel,
    user.signature,
    user.region,
    user.bio,
    user.source,
    contact.remarkName,
    contact.source,
    contact.description,
    ...user.searchableFields,
    ...user.tags,
    ...contact.tags
  ]
    .filter((field): field is string => Boolean(field))
    .some((field) => field.toLowerCase().includes(keyword));
}

const merchantOrganizationMembershipTags = ["员工", "正社员", "临时工", "专职", "兼职"];
const technicianOrganizationMembershipTags = [...merchantOrganizationMembershipTags, "同事", "店铺", "所属门店", "门店", "前台"];

function hasOrganizationTag(contact: ContactRelation, user: ImUser, tags: string[]) {
  return [...contact.tags, ...user.tags].some((tag) => tags.includes(tag));
}

function getOrganizationContacts(store: ReturnType<typeof useImStore>, scope: ImRoleType, entityStore: ReturnType<typeof useEntityStore>) {
  const currentUser = getCurrentUser(store);

  if (!currentUser?.entityId) {
    return [];
  }

  const technicianById = new Map(entityStore.technicians.map((technician) => [technician.id, technician]));

  if (scope === "merchant") {
    if (currentUser.entityType !== "shop") {
      return [];
    }

    return getVisibleImContacts(store, scope).filter((contact) => {
      const user = store.usersById[contact.targetUserId];

      if (user?.profileKind !== "technician") {
        return false;
      }

      const technician = user.entityId ? technicianById.get(user.entityId) : undefined;
      const belongsToCurrentStore = technician?.storeId === currentUser.entityId;
      const markedAsStoreStaff = hasOrganizationTag(contact, user, merchantOrganizationMembershipTags);

      return belongsToCurrentStore || markedAsStoreStaff;
    });
  }

  if (scope !== "technician" || currentUser.entityType !== "technician") {
    return [];
  }

  const currentTechnician = technicianById.get(currentUser.entityId);
  const currentStoreId = currentTechnician?.storeId;

  return getVisibleImContacts(store, scope).filter((contact) => {
    const user = store.usersById[contact.targetUserId];

    if (!user) {
      return false;
    }

    if (user.profileKind === "store") {
      return Boolean(user.entityId && currentStoreId && user.entityId === currentStoreId) || hasOrganizationTag(contact, user, technicianOrganizationMembershipTags);
    }

    if (user.profileKind !== "technician" || user.entityId === currentUser.entityId) {
      return false;
    }

    const technician = user.entityId ? technicianById.get(user.entityId) : undefined;
    const belongsToCurrentStore = Boolean(currentStoreId && technician?.storeId === currentStoreId);
    const markedAsCoworker = hasOrganizationTag(contact, user, technicianOrganizationMembershipTags);

    return belongsToCurrentStore || markedAsCoworker;
  });
}

type OrganizationStaffFilter = "fullTime" | "partTime";

const organizationStaffFilterOptions: Array<{ label: string; value: OrganizationStaffFilter }> = [
  { label: "正社员", value: "fullTime" },
  { label: "临时工", value: "partTime" }
];

function readMerchantManualStaffRoleRecords() {
  return parseBrowserStorageJson<MerchantManualStaffRoleRecord[]>(merchantManualEmployeeStorageKey, [], {
    removeOnError: true,
    silent: true
  });
}

function readMerchantStaffRoleLabelOverrides() {
  return parseBrowserStorageJson<Record<string, string>>(merchantStaffRoleLabelStorageKey, {}, {
    removeOnError: true,
    silent: true
  });
}

function resolveOrganizationStaffFilter(contact: ContactRelation, user: ImUser, entityStore: ReturnType<typeof useEntityStore>): OrganizationStaffFilter {
  const tags = [...contact.tags, ...user.tags];

  if (tags.some((tag) => ["临时工", "兼职"].includes(tag))) {
    return "partTime";
  }

  if (tags.some((tag) => ["正社员", "专职"].includes(tag))) {
    return "fullTime";
  }

  const technician = user.entityId ? entityStore.technicians.find((item) => item.id === user.entityId) : undefined;

  return technician?.identityLabel === "个人技师" ? "partTime" : "fullTime";
}

function getOrganizationContactRoleNames(contact: ContactRelation, user: ImUser, roleOptions: string[], technicianRoleName: string) {
  const roleOptionSet = new Set(roleOptions);
  const roleNames = new Set<string>();

  if (user.profileKind === "store" && roleOptionSet.has("门店")) {
    roleNames.add("门店");
  }

  if (user.profileKind === "technician") {
    roleNames.add(technicianRoleName);
  }

  [...contact.tags, ...user.tags]
    .map(normalizeMerchantStaffEmploymentTag)
    .forEach((tag) => {
      if (roleOptionSet.has(tag)) {
        roleNames.add(tag);
      }
    });

  return Array.from(roleNames);
}

function isVisibleOrganizationRoleFilter(roleName: string) {
  return !["自定义", "自定义职务"].includes(roleName);
}

function getMerchantOrganizationRoleTagNames(roleOptions?: string[]) {
  const organizationRoleOptions = roleOptions ?? getMerchantStaffRoleNames(readMerchantManualStaffRoleRecords(), {
    includeTechnician: true,
    roleNameOverrides: readMerchantStaffRoleLabelOverrides()
  }).filter(isVisibleOrganizationRoleFilter);

  return Array.from(new Set(["员工", "正社员", "专职", "临时工", "兼职", ...organizationRoleOptions]));
}

function matchesMerchantOrganizationRoleTag(tag: string, roleTagSet: Set<string>) {
  return roleTagSet.has(tag) || roleTagSet.has(normalizeMerchantStaffEmploymentTag(tag));
}

function buildOrganizationStaffCaption(user: ImUser, contact: ContactRelation, entityStore: ReturnType<typeof useEntityStore>) {
  if (user.profileKind === "store") {
    const captionParts = [
      "门店",
      contact.remarkName,
      contact.description,
      buildContactCaption(user, contact)
    ].filter(Boolean);

    return Array.from(new Set(captionParts)).join(" · ");
  }

  const technician = user.entityId ? entityStore.technicians.find((item) => item.id === user.entityId) : undefined;
  const roleOptions = getMerchantStaffRoleNames(readMerchantManualStaffRoleRecords(), {
    includeTechnician: true,
    roleNameOverrides: readMerchantStaffRoleLabelOverrides()
  }).filter(isVisibleOrganizationRoleFilter);
  const technicianRoleName = getResolvedMerchantStaffRoleName(merchantTechnicianRoleName, readMerchantStaffRoleLabelOverrides());
  const roleTags = getOrganizationContactRoleNames(contact, user, roleOptions, technicianRoleName);
  const staffTags = Array.from(new Set(
    contact.tags
      .map(normalizeMerchantStaffEmploymentTag)
      .filter((tag) => ["员工", "正社员", "临时工"].includes(tag))
  ));
  const captionParts = [
    roleTags.length > 0 ? roleTags.join(" / ") : null,
    staffTags.length > 0 ? staffTags.join(" / ") : "员工",
    technician?.identityLabel,
    buildContactCaption(user, contact)
  ].filter(Boolean);

  return Array.from(new Set(captionParts)).join(" · ");
}

function buildTagCounts(contacts: ContactRelation[]) {
  const counts = new Map<string, number>();

  contacts.forEach((contact) => {
    contact.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
  });

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-Hans-CN"));
}

type ImTagListUiState = {
  pinnedTags: string[];
  hiddenTags: string[];
  customTags: string[];
};

const emptyImTagListUiState: ImTagListUiState = {
  pinnedTags: [],
  hiddenTags: [],
  customTags: []
};

function normalizeImTagName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isValidImTagName(value: string) {
  return normalizeImTagName(value).length > 0;
}

function mergeImTags(tags: string[]) {
  return Array.from(new Set(tags.map(normalizeImTagName).filter(Boolean)));
}

function addCustomImTag(state: ImTagListUiState, tag: string): ImTagListUiState {
  const normalized = normalizeImTagName(tag);

  if (!normalized) {
    return state;
  }

  return {
    ...state,
    customTags: state.customTags.includes(normalized) ? state.customTags : [normalized, ...state.customTags],
    hiddenTags: state.hiddenTags.filter((item) => item !== normalized)
  };
}

function getImTagListUiStorageKey(scope: ImRoleType) {
  return `needo.im.tags.ui.v1.${scope}`;
}

function readImTagListUiState(scope: ImRoleType): ImTagListUiState {
  if (typeof window === "undefined") {
    return emptyImTagListUiState;
  }

  try {
    const raw = window.localStorage.getItem(getImTagListUiStorageKey(scope));

    if (!raw) {
      return emptyImTagListUiState;
    }

    const parsed = JSON.parse(raw) as Partial<ImTagListUiState>;

    return {
      pinnedTags: Array.isArray(parsed.pinnedTags) ? parsed.pinnedTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : [],
      hiddenTags: Array.isArray(parsed.hiddenTags) ? parsed.hiddenTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : [],
      customTags: Array.isArray(parsed.customTags) ? parsed.customTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : []
    };
  } catch {
    return emptyImTagListUiState;
  }
}

function writeImTagListUiState(scope: ImRoleType, state: ImTagListUiState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getImTagListUiStorageKey(scope), JSON.stringify(state));
}

function buildManagedTagCounts(
  contacts: ContactRelation[],
  state: ImTagListUiState,
  conversations: Conversation[] = [],
  excludedTags: string[] = []
) {
  const hiddenSet = new Set(state.hiddenTags);
  const excludedTagSet = new Set(excludedTags);
  const isExcludedTag = (tag: string) => matchesMerchantOrganizationRoleTag(tag, excludedTagSet);
  const counts = new Map(buildTagCounts(contacts).filter(([tag]) => !isExcludedTag(tag)));

  conversations.forEach((conversation) => {
    (conversation.tags ?? []).forEach((tag) => {
      if (isExcludedTag(tag)) {
        return;
      }

      if (!counts.has(tag)) {
        counts.set(tag, 0);
      }
    });
  });

  state.customTags.forEach((tag) => {
    if (isExcludedTag(tag)) {
      return;
    }

    if (!counts.has(tag)) {
      counts.set(tag, 0);
    }
  });

  return Array.from(counts.entries())
    .filter(([tag]) => !hiddenSet.has(tag))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-Hans-CN"));
}

function getConversationIdsForTaggedContacts(conversations: Conversation[], contacts: ContactRelation[], selectedTags: string[]) {
  if (selectedTags.length === 0) {
    return new Set<string>();
  }

  const tagSet = new Set(selectedTags);
  const taggedUserIds = new Set(
    contacts
      .filter((contact) => contact.tags.some((tag) => tagSet.has(tag)))
      .map((contact) => contact.targetUserId)
  );

  return new Set(
    conversations
      .filter((conversation) =>
        conversation.tags?.some((tag) => tagSet.has(tag))
          ? true
          : conversation.contactUserId && taggedUserIds.has(conversation.contactUserId)
          ? true
          : conversation.type === "group" && conversation.memberIds.some((memberId) => taggedUserIds.has(memberId))
      )
      .map((conversation) => conversation.id)
  );
}

function getConversationIdsForSearchResult(conversations: Conversation[], result: ImSearchResult) {
  const matchedContactUserIds = new Set(result.contacts.map((contact) => contact.targetUserId));
  const matchedConversationIds = new Set([
    ...result.conversations.map((conversation) => conversation.id),
    ...result.messages.map((message) => message.conversationId)
  ]);

  conversations.forEach((conversation) => {
    if (conversation.contactUserId && matchedContactUserIds.has(conversation.contactUserId)) {
      matchedConversationIds.add(conversation.id);
      return;
    }

    if (conversation.type === "group" && conversation.memberIds.some((memberId) => matchedContactUserIds.has(memberId))) {
      matchedConversationIds.add(conversation.id);
    }
  });

  return matchedConversationIds;
}

function ImConversationListSearchBar({
  activeTagCount,
  filterActive,
  filterLabel = "筛选标签",
  onFilterClick,
  onQueryChange,
  onQueryCommit,
  placeholder,
  query
}: {
  activeTagCount: number;
  filterActive?: boolean;
  filterLabel?: string;
  onFilterClick: () => void;
  onQueryChange: (value: string) => void;
  onQueryCommit: () => void;
  placeholder: string;
  query: string;
}) {
  const hasActiveFilter = filterActive ?? activeTagCount > 0;

  return (
    <div className="flex h-12 w-full items-center gap-2 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_46%,var(--client-bg)_54%)] px-4 text-[14px] text-[color:var(--client-muted)]">
      <ImIcon className="h-4 w-4 shrink-0 text-[color:var(--client-soft-muted)]" name="search" />
      <input
        className="min-w-0 flex-1 bg-transparent text-[14px] text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onQueryCommit();
          }
        }}
        placeholder={placeholder}
        type="search"
        value={query}
      />
      {query.trim() ? (
        <button
          aria-label="清除搜索"
          className="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--client-soft-muted)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
          onClick={() => onQueryChange("")}
          type="button"
        >
          <span aria-hidden="true" className="text-base leading-none">×</span>
        </button>
      ) : null}
      <button
        aria-label={filterLabel}
        className={cn(
          "focus-ring relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
          hasActiveFilter
            ? "bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-primary)_30%,transparent)]"
            : "text-[color:var(--client-primary)] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
        )}
        onClick={onFilterClick}
        title={filterLabel}
        type="button"
      >
        <ImIcon className="h-5 w-5" name="filter" />
        {activeTagCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[1.125rem] rounded-full bg-[#ff6767] px-1 text-[10px] font-black leading-[1.125rem] text-white ring-2 ring-[color:var(--client-bg)]">
            {activeTagCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function ImTagFilterSheet({
  availableTags,
  clearLabel = "清除",
  emptyCaption = "当前通讯录里还没有可筛选的标签。",
  onClear,
  onClose,
  onToggleTag,
  open,
  selectedTags,
  title = "标签筛选"
}: {
  availableTags: Array<[string, number]>;
  clearLabel?: string;
  emptyCaption?: string;
  onClear: () => void;
  onClose: () => void;
  onToggleTag: (tag: string) => void;
  open: boolean;
  selectedTags: string[];
  title?: string;
}) {
  if (!open) {
    return null;
  }

  const selectedSet = new Set(selectedTags);

  return (
    <div
      aria-modal="true"
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--client-overlay)] px-5 py-[max(1.25rem,env(safe-area-inset-top))]",
        "pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      )}
      onClick={onClose}
      role="dialog"
    >
      <div
        className="w-full max-w-[420px] rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_92%,var(--client-bg)_8%)] p-4 shadow-[0_28px_80px_color-mix(in_srgb,var(--client-shadow)_36%,transparent)] backdrop-blur-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="mb-4 text-center text-[17px] font-black text-[color:var(--client-text)]">{title}</h3>
        <div className="space-y-4">
        {availableTags.length > 0 ? (
          <div className="flex max-h-[min(58dvh,430px)] flex-wrap gap-2 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {availableTags.map(([tag, count]) => {
              const active = selectedSet.has(tag);

              return (
                <button
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,var(--client-bg)_28%)] text-[color:var(--client-text)]"
                  )}
                  key={tag}
                  onClick={() => onToggleTag(tag)}
                  type="button"
                >
                  <span>{tag}</span>
                  <span className={cn("text-xs", active ? "text-[color:color-mix(in_srgb,var(--pin-badge-glyph)_76%,transparent)]" : "text-[color:var(--client-soft-muted)]")}>{count}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[color:var(--client-muted)]">{emptyCaption}</p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClear} variant="secondary">{clearLabel}</Button>
          <Button className="flex-1" onClick={onClose}>完成</Button>
        </div>
        </div>
      </div>
    </div>
  );
}

function ImTagCampaignSheet({
  availableTags,
  contacts,
  content,
  estimate,
  image,
  onClose,
  onContentChange,
  onImageChange,
  onImageClear,
  onSubmit,
  onToggleTag,
  onToggleUser,
  open,
  result,
  selectedTags,
  selectedUserIds,
  sending,
  usersById
}: {
  availableTags: Array<[string, number]>;
  contacts: ContactRelation[];
  content: string;
  estimate: TagMessageCampaignEstimate | null;
  image: MessageCampaignImageInput | null;
  onClose: () => void;
  onContentChange: (value: string) => void;
  onImageChange: (file?: File) => void;
  onImageClear: () => void;
  onSubmit: () => void;
  onToggleTag: (tag: string) => void;
  onToggleUser: (userId: string) => void;
  open: boolean;
  result: TagMessageCampaignResult | null;
  selectedTags: string[];
  selectedUserIds: string[];
  sending: boolean;
  usersById: Record<string, ImUser>;
}) {
  const [friendListOpen, setFriendListOpen] = useState(false);
  const [friendQuery, setFriendQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) {
    return null;
  }

  const selectedSet = new Set(selectedTags);
  const selectedUserSet = new Set(selectedUserIds);
  const recipientCount = estimate?.recipientCount ?? 0;
  const skippedCount = estimate?.skippedCount ?? 0;
  const normalizedFriendQuery = friendQuery.trim().toLowerCase();
  const selectedFriendContacts = selectedUserIds
    .map((userId) => contacts.find((contact) => contact.targetUserId === userId))
    .filter((contact): contact is ContactRelation => Boolean(contact));
  const filteredContacts = contacts.filter((contact) => {
    const user = usersById[contact.targetUserId];

    if (!user) {
      return false;
    }

    return !normalizedFriendQuery || doesContactMatchDirectoryKeyword(contact, user, normalizedFriendQuery);
  });
  const canSubmit = (selectedTags.length > 0 || selectedUserIds.length > 0) && (content.trim().length > 0 || Boolean(image)) && recipientCount > 0 && !sending;
  const handleImageInput = (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    onImageChange(file);
    event.currentTarget.value = "";
  };

  return (
    <div
      aria-modal="true"
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--client-overlay)] px-4 py-[max(1rem,env(safe-area-inset-top))]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      )}
      onClick={onClose}
      role="dialog"
    >
      <div
        className="w-full max-w-[440px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_94%,var(--client-bg)_6%)] p-4 shadow-[0_28px_80px_color-mix(in_srgb,var(--client-shadow)_36%,transparent)] backdrop-blur-2xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-black text-[color:var(--client-text)]">群发</h3>
            <p className="mt-1 text-xs text-[color:var(--client-muted)]">每位收件人会收到独立私聊，不创建公开群聊。</p>
          </div>
          <button
            aria-label="关闭"
            className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full text-[color:var(--client-soft-muted)] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)]"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true" className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black text-[color:var(--client-muted)]">收件标签</span>
              <span className="text-xs font-semibold text-[color:var(--client-primary)]">
                {recipientCount} 人可发送{skippedCount > 0 ? ` · ${skippedCount} 人已跳过` : ""}
              </span>
            </div>
            <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {availableTags.length > 0 ? availableTags.map(([tag, count]) => {
                const active = selectedSet.has(tag);

                return (
                  <button
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition-colors",
                      active
                        ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,var(--client-bg)_28%)] text-[color:var(--client-text)]"
                    )}
                    key={tag}
                    onClick={() => onToggleTag(tag)}
                    type="button"
                  >
                    <span>{tag}</span>
                    <span className={cn("text-[11px]", active ? "text-[color:color-mix(in_srgb,var(--pin-badge-glyph)_76%,transparent)]" : "text-[color:var(--client-soft-muted)]")}>{count}</span>
                  </button>
                );
              }) : (
                <p className="text-sm text-[color:var(--client-muted)]">当前通讯录还没有可群发的标签。</p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-black text-[color:var(--client-muted)]">指定朋友</span>
              <button
                className="inline-flex items-center gap-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] px-3 py-1.5 text-xs font-black text-[color:var(--client-text)]"
                onClick={() => setFriendListOpen((current) => !current)}
                type="button"
              >
                <ImIcon className="h-3.5 w-3.5" name={friendListOpen ? "chevron-down" : "friend"} />
                {friendListOpen ? "收起朋友列表" : `打开朋友列表${selectedUserIds.length > 0 ? ` · 已选 ${selectedUserIds.length}` : ""}`}
              </button>
            </div>

            {selectedFriendContacts.length > 0 ? (
              <div className="mb-2 flex max-h-16 flex-wrap gap-2 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {selectedFriendContacts.map((contact) => {
                  const user = usersById[contact.targetUserId];

                  if (!user) {
                    return null;
                  }

                  return (
                    <button
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-2.5 py-1.5 text-xs font-black text-[color:var(--client-primary)]"
                      key={contact.id}
                      onClick={() => onToggleUser(contact.targetUserId)}
                      type="button"
                    >
                      <span className="truncate">{getDisplayName(user, contact)}</span>
                      <span aria-hidden="true">×</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {friendListOpen ? (
              <div className="rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_64%,var(--client-surface)_36%)] p-3">
                <label className="flex h-10 items-center gap-2 rounded-[15px] border border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] px-3">
                  <ImIcon className="h-4 w-4 shrink-0 text-[color:var(--client-soft-muted)]" name="search" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
                    onChange={(event) => setFriendQuery(event.target.value)}
                    placeholder="搜索朋友昵称、ID、标签"
                    value={friendQuery}
                  />
                </label>
                <div className="mt-3 max-h-48 space-y-1 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {filteredContacts.length > 0 ? filteredContacts.map((contact) => {
                    const user = usersById[contact.targetUserId];
                    const selected = selectedUserSet.has(contact.targetUserId);

                    if (!user) {
                      return null;
                    }

                    return (
                      <button
                        aria-pressed={selected}
                        className={cn(
                          "flex min-h-[58px] w-full items-center gap-3 rounded-[16px] px-2.5 py-2 text-left transition-colors",
                          selected ? "bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)]" : "hover:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]"
                        )}
                        key={contact.id}
                        onClick={() => onToggleUser(contact.targetUserId)}
                        type="button"
                      >
                        <img alt={user.nickname} className="h-10 w-10 shrink-0 rounded-full object-cover" src={user.avatar} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-[color:var(--client-text)]">{getDisplayName(user, contact)}</span>
                          <span className="block truncate text-xs font-semibold text-[color:var(--client-muted)]">{buildContactCaption(user, contact) || user.userIdLabel}</span>
                        </span>
                        <ContactSelectionBadge selected={selected} />
                      </button>
                    );
                  }) : (
                    <p className="px-2 py-6 text-center text-sm text-[color:var(--client-muted)]">没有找到匹配朋友</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black text-[color:var(--client-muted)]">图片</span>
              {image ? (
                <button className="text-xs font-black text-[color:var(--client-primary)]" onClick={onImageClear} type="button">移除</button>
              ) : null}
            </div>
            <input accept="image/*" className="hidden" onChange={handleImageInput} ref={fileInputRef} type="file" />
            {image ? (
              <div className="flex items-center gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)] p-2.5">
                <img alt={image.fileName} className="h-16 w-16 shrink-0 rounded-[14px] object-cover" src={image.thumbnailUrl ?? image.url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-[color:var(--client-text)]">{image.fileName}</p>
                  <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{Math.max(1, Math.round(image.fileSize / 1024))} KB</p>
                </div>
                <button
                  aria-label="更换图片"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)]"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <ImIcon className="h-4 w-4" name="photo" />
                </button>
              </div>
            ) : (
              <button
                className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_62%,var(--client-surface)_38%)] text-sm font-black text-[color:var(--client-text)]"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <ImIcon className="h-4 w-4 text-[color:var(--client-primary)]" name="photo" />
                添加图片
              </button>
            )}
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">发送内容</span>
            <textarea
              className="min-h-[116px] w-full resize-none rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_70%,var(--client-surface)_30%)] px-3 py-3 text-sm leading-6 text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
              maxLength={600}
              onChange={(event) => onContentChange(event.target.value)}
              placeholder="输入要群发的内容"
              value={content}
            />
          </label>

          {result ? (
            <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)] px-3 py-2 text-sm font-semibold text-[color:var(--client-text)]">
              已发送 {result.campaign.sentCount} 人{result.campaign.skippedCount > 0 ? `，跳过 ${result.campaign.skippedCount} 人` : ""}。
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={onClose} variant="secondary">取消</Button>
            <Button className="flex-1" disabled={!canSubmit} onClick={onSubmit}>
              {sending ? "发送中" : "确认发送"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImSearchPage() {
  const { scope, store, config } = useImRuntime();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId") ?? undefined;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [result, setResult] = useState<{ contacts: ContactRelation[]; conversations: Conversation[]; messages: ConversationMessage[] }>(emptySearchResult);
  const searching = deferredQuery.trim().length > 0;

  useEffect(() => {
    if (!deferredQuery.trim()) {
      setResult((current) =>
        current.contacts.length || current.conversations.length || current.messages.length ? emptySearchResult : current
      );
      return;
    }

    let alive = true;
    startTransition(() => {
      void store.search(deferredQuery, conversationId).then((response) => {
        if (!alive) {
          return;
        }

        setResult({
          contacts: response.contacts.filter((contact) => isProfileSearchableForRole(scope, store.usersById[contact.targetUserId])),
          conversations: response.conversations,
          messages: response.messages
        });
      });
    });

    return () => {
      alive = false;
    };
  }, [conversationId, deferredQuery, scope, store.search, store.usersById]);

  return (
    <ImStandaloneShell>
      <div className="safe-header-top fixed inset-x-0 top-0 z-40 border-b border-black/5 bg-[#f6f6f6]/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[880px] px-4 pb-3">
          <FloatingBackButton onClick={() => navigate(-1)} />
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 pl-[56px] sm:pl-[60px]">
              <input
                className="h-10 w-full rounded-xl bg-[#efefef] px-4 text-[15px] outline-none"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    store.rememberSearchTerm(query);
                  }
                }}
                placeholder={conversationId ? "搜索当前聊天内容" : "搜索联系人、群聊、消息"}
                value={query}
              />
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="h-[calc(env(safe-area-inset-top)+5rem)]" />

      {!searching ? (
        <div className="space-y-4 px-4 py-4">
          <section className="rounded-[24px] bg-white p-4 shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-ink/65">最近搜索</h3>
              {store.ui.searchHistory.length > 0 ? <button className="text-xs text-ink/35" onClick={() => store.clearSearchHistory()} type="button">清空</button> : null}
            </div>
            {store.ui.searchHistory.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {store.ui.searchHistory.map((item) => (
                  <button
                    className="rounded-full bg-[#f2f5f3] px-3 py-2 text-sm text-[#31584b]"
                    key={item}
                    onClick={() => setQuery(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink/42">还没有搜索历史，输入关键词后会保留最近 8 条。</p>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          {result.contacts.length > 0 ? (
            <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
              <SectionTag>联系人</SectionTag>
              {result.contacts.map((contact) => {
                const user = store.usersById[contact.targetUserId];
                const contactInfoTarget = getContactInfoSettingsTarget(config, contact);
                return user ? <ContactRow avatarTo={resolveImProfilePath(scope, user)} contact={contact} key={contact.id} to={contactInfoTarget} user={user} /> : null;
              })}
            </section>
          ) : null}

          {result.conversations.length > 0 ? (
            <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
              <SectionTag>会话</SectionTag>
              {result.conversations.map((conversation) => (
                <ConversationRow
                  avatar={getConversationAvatar(store, conversation)}
                  avatarTo={getConversationProfileTarget(scope, store, conversation)}
                  group={conversation.type === "group"}
                  key={conversation.id}
                  privacyMode={conversation.privacyModeEnabled}
                  preview={buildConversationRowPreview(conversation)}
                  time={formatConversationTime(conversation.lastMessageTime)}
                  title={getConversationDisplayName(store, conversation)}
                  to={config.routes.conversation(conversation.id)}
                  unreadCount={conversation.unreadCount}
                />
              ))}
            </section>
          ) : null}

          {result.messages.length > 0 ? (
            <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
              <SectionTag>聊天记录</SectionTag>
              {result.messages.map((message) => (
                <Link
                  className="block border-b border-black/5 px-4 py-3 last:border-b-0"
                  key={message.id}
                  onClick={() => store.rememberSearchTerm(query)}
                  to={appendQuery(config.routes.conversation(message.conversationId), { highlight: message.id })}
                >
                  <p className="text-sm font-medium">{message.content || "已撤回消息"}</p>
                  <p className="mt-1 text-xs text-ink/42">{buildSearchMessageSubtitle(store, message)}</p>
                </Link>
              ))}
            </section>
          ) : null}

          {result.contacts.length === 0 && result.conversations.length === 0 && result.messages.length === 0 ? (
            <ImEmptyState caption="换个名字、备注、群名或消息关键词试试。" title="没有找到结果" />
          ) : null}
        </div>
      )}
    </ImStandaloneShell>
  );
}

export function ImOrganizationContactsPage() {
  const { scope, store, config } = useImRuntime();
  const entityStore = useEntityStore();
  const navigate = useNavigate();
  const [staffFilter, setStaffFilter] = useState<OrganizationStaffFilter>("fullTime");
  const currentUser = getCurrentUser(store);
  const currentStoreId = currentUser?.entityType === "shop" ? currentUser.entityId : undefined;
  const [manualStaffRoleRecords, setManualStaffRoleRecords] = useState<MerchantManualStaffRoleRecord[]>(readMerchantManualStaffRoleRecords);
  const [staffRoleNameOverrides, setStaffRoleNameOverrides] = useState<Record<string, string>>(readMerchantStaffRoleLabelOverrides);
  const technicianRoleName = getResolvedMerchantStaffRoleName(merchantTechnicianRoleName, staffRoleNameOverrides);
  const roleOptions = useMemo(
    () => {
      const merchantRoleOptions = getMerchantStaffRoleNames(
      manualStaffRoleRecords.filter((record) => !currentStoreId || record.storeId === currentStoreId),
      { includeTechnician: true, roleNameOverrides: staffRoleNameOverrides }
      );

      return scope === "technician" ? Array.from(new Set(["门店", ...merchantRoleOptions])) : merchantRoleOptions;
    },
    [currentStoreId, manualStaffRoleRecords, scope, staffRoleNameOverrides]
  );
  const visibleRoleOptions = useMemo(
    () => roleOptions.filter(isVisibleOrganizationRoleFilter),
    [roleOptions]
  );
  const previousVisibleRoleOptionsRef = useRef<string[] | null>(null);
  const [selectedRoleNames, setSelectedRoleNames] = useState<string[]>(() => visibleRoleOptions);
  const [organizationQuery, setOrganizationQuery] = useState("");
  const deferredOrganizationQuery = useDeferredValue(organizationQuery);
  const [roleFilterSheetOpen, setRoleFilterSheetOpen] = useState(false);
  const organizationContacts = useMemo(
    () => getOrganizationContacts(store, scope, entityStore),
    [entityStore, scope, store.contacts, store.usersById]
  );
  const normalizedOrganizationQuery = deferredOrganizationQuery.trim().toLowerCase();
  const contacts = useMemo(
    () => organizationContacts.filter((contact) => {
      const user = store.usersById[contact.targetUserId];

      if (!user || resolveOrganizationStaffFilter(contact, user, entityStore) !== staffFilter) {
        return false;
      }

      if (selectedRoleNames.length === 0) {
        return false;
      }

      const contactRoleNames = getOrganizationContactRoleNames(contact, user, visibleRoleOptions, technicianRoleName);

      if (!selectedRoleNames.some((roleName) => contactRoleNames.includes(roleName))) {
        return false;
      }

      if (!normalizedOrganizationQuery) {
        return true;
      }

      return [
        getDisplayName(user, contact),
        user.userIdLabel,
        user.accountId,
        user.signature,
        user.region,
        contact.description,
        getMerchantStaffEmploymentLabel(staffFilter),
        ...contactRoleNames,
        ...user.searchableFields
      ]
        .filter((field): field is string => Boolean(field))
        .some((field) => field.toLowerCase().includes(normalizedOrganizationQuery));
    }),
    [entityStore, normalizedOrganizationQuery, organizationContacts, selectedRoleNames, staffFilter, store.usersById, technicianRoleName, visibleRoleOptions]
  );
  const roleFilterCounts = useMemo(
    () => {
      const counts = new Map(visibleRoleOptions.map((roleName) => [roleName, 0]));

      organizationContacts.forEach((contact) => {
        const user = store.usersById[contact.targetUserId];

        if (!user || resolveOrganizationStaffFilter(contact, user, entityStore) !== staffFilter) {
          return;
        }

        getOrganizationContactRoleNames(contact, user, visibleRoleOptions, technicianRoleName).forEach((roleName) => {
          counts.set(roleName, (counts.get(roleName) ?? 0) + 1);
        });
      });

      return visibleRoleOptions.map((roleName) => [roleName, counts.get(roleName) ?? 0] as [string, number]);
    },
    [entityStore, organizationContacts, staffFilter, store.usersById, technicianRoleName, visibleRoleOptions]
  );

  useEffect(() => {
    setManualStaffRoleRecords(readMerchantManualStaffRoleRecords());
    setStaffRoleNameOverrides(readMerchantStaffRoleLabelOverrides());

    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === merchantManualEmployeeStorageKey) {
        setManualStaffRoleRecords(readMerchantManualStaffRoleRecords());
      }

      if (event.key === merchantStaffRoleLabelStorageKey) {
        setStaffRoleNameOverrides(readMerchantStaffRoleLabelOverrides());
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const previousVisibleRoleOptions = previousVisibleRoleOptionsRef.current;
    previousVisibleRoleOptionsRef.current = visibleRoleOptions;

    setSelectedRoleNames((current) => {
      if (previousVisibleRoleOptions === null) {
        return visibleRoleOptions;
      }

      const visibleRoleOptionSet = new Set(visibleRoleOptions);
      const keptRoleNames = current.filter((roleName) => visibleRoleOptionSet.has(roleName));
      const addedRoleNames = visibleRoleOptions.filter(
        (roleName) => !previousVisibleRoleOptions.includes(roleName) && !keptRoleNames.includes(roleName)
      );
      const nextRoleNames = [...keptRoleNames, ...addedRoleNames];

      return nextRoleNames.length === current.length && nextRoleNames.every((roleName, index) => roleName === current[index])
        ? current
        : nextRoleNames;
    });
  }, [visibleRoleOptions]);

  const toggleRoleName = (roleName: string) => {
    setSelectedRoleNames((current) =>
      current.includes(roleName) ? current.filter((item) => item !== roleName) : [...current, roleName]
    );
  };
  const resetRoleFilters = () => setSelectedRoleNames(visibleRoleOptions);
  const hasCustomRoleFilter = selectedRoleNames.length !== visibleRoleOptions.length;
  const emptyCaption = selectedRoleNames.length > 0
    ? normalizedOrganizationQuery
      ? `当前搜索和职务筛选下没有${scope === "technician" ? "组织成员" : "员工"}。`
      : `当前职务筛选下没有${scope === "technician" ? "组织成员" : "员工"}。`
    : "请选择至少一个职务标签。";
  const organizationFilterControls = scope !== "user" ? (
    <div className="flex items-center gap-1.5">
      <div className="inline-flex h-10 items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,var(--client-bg)_28%)] p-1 shadow-[0_10px_24px_rgba(0,0,0,0.1)]">
        {organizationStaffFilterOptions.map((option) => {
          const active = option.value === staffFilter;

          return (
            <button
              aria-pressed={active}
              className={cn(
                "h-8 rounded-full px-2.5 text-[12px] font-black transition",
                active
                  ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]"
                  : "text-[color:var(--client-muted)]"
              )}
              key={option.value}
              onClick={() => setStaffFilter(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {scope === "merchant" ? (
        <ImHeaderAction
          label={`添加${getAddStaffLabel(staffFilter)}`}
          onClick={() => navigate(appendQuery(config.routes.contacts, {
            intent: "add-staff",
            roleName: selectedRoleNames.length === 1 ? selectedRoleNames[0] : technicianRoleName,
            staffType: staffFilter
          }))}
        >
          <ImIcon name="add" />
        </ImHeaderAction>
      ) : null}
    </div>
  ) : undefined;

  return (
    <ImStandaloneShell>
      <ImTopBar
        actions={organizationFilterControls}
        footer={(
          <ImConversationListSearchBar
            activeTagCount={hasCustomRoleFilter ? selectedRoleNames.length : 0}
            filterActive={hasCustomRoleFilter}
            filterLabel="筛选职务标签"
            onFilterClick={() => setRoleFilterSheetOpen(true)}
            onQueryChange={setOrganizationQuery}
            onQueryCommit={() => undefined}
            placeholder={scope === "technician" ? "搜索组织成员、职务标签" : "搜索员工、职务标签"}
            query={organizationQuery}
          />
        )}
        onBack={() => navigate(config.routes.contacts)}
        title="组织"
      />
      <div className="px-4 py-4">
        {normalizedOrganizationQuery || hasCustomRoleFilter ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {normalizedOrganizationQuery ? (
              <button
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--client-primary)]"
                onClick={() => setOrganizationQuery("")}
                type="button"
              >
                <span className="truncate">搜索：{deferredOrganizationQuery.trim()}</span>
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
            {hasCustomRoleFilter ? (
              selectedRoleNames.length > 0 ? selectedRoleNames.map((roleName) => (
                <button
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--client-primary)]"
                  key={roleName}
                  onClick={() => toggleRoleName(roleName)}
                  type="button"
                >
                  <span className="truncate">{roleName}</span>
                  <span aria-hidden="true">×</span>
                </button>
              )) : (
                <span className="rounded-full bg-[rgba(255,103,103,0.14)] px-3 py-1.5 text-xs font-semibold text-[#ff6767]">未选择职务</span>
              )
            ) : null}
            {hasCustomRoleFilter ? (
              <button
                className="rounded-full px-2 py-1 text-xs font-semibold text-[color:var(--client-soft-muted)]"
                onClick={resetRoleFilters}
                type="button"
              >
                全部点亮
              </button>
            ) : null}
          </div>
        ) : null}
        {contacts.length > 0 ? (
          <div className="overflow-hidden rounded-[24px] bg-[color:var(--client-surface)] shadow-[0_12px_32px_color-mix(in_srgb,var(--client-shadow)_14%,transparent)]">
            {contacts.map((contact) => {
              const user = store.usersById[contact.targetUserId];
              const contactInfoTarget = getContactInfoSettingsTarget(config, contact);

              return user ? (
                <ContactRow
                  avatarTo={resolveImProfilePath(scope, user)}
                  caption={buildOrganizationStaffCaption(user, contact, entityStore)}
                  contact={contact}
                  key={contact.id}
                  to={contactInfoTarget}
                  user={user}
                />
              ) : null;
            })}
          </div>
        ) : (
          <ImEmptyState caption={emptyCaption} title={scope === "technician" ? "暂无组织成员" : "暂无员工"} />
        )}
      </div>
      <ImTagFilterSheet
        availableTags={roleFilterCounts}
        clearLabel="全部点亮"
        emptyCaption="当前还没有职务标签。"
        onClear={resetRoleFilters}
        onClose={() => setRoleFilterSheetOpen(false)}
        onToggleTag={toggleRoleName}
        open={roleFilterSheetOpen}
        selectedTags={selectedRoleNames}
        title="职务标签"
      />
    </ImStandaloneShell>
  );
}

export function ImBlacklistPage() {
  const { scope, store, config } = useImRuntime();
  const navigate = useNavigate();
  const contacts = getBlockedContacts(store);

  return (
    <ImStandaloneShell>
      <ImTopBar onBack={() => navigate(config.routes.contacts)} title="黑名单" />
      <div className="space-y-3 px-4 py-4">
        {contacts.length === 0 ? (
          <ImEmptyState caption="目前没有被拉黑的联系人。" title="黑名单为空" />
        ) : (
          contacts.map((contact) => {
            const user = store.usersById[contact.targetUserId];
            const caption = buildContactCaption(user, contact);

            return user ? (
              <section className="flex items-center gap-3 rounded-[24px] bg-white p-4 shadow-[0_12px_32px_rgba(20,20,20,0.06)]" key={contact.id}>
                <InteractiveAvatar alt={user.nickname} className="h-14 w-14" src={user.avatar} to={resolveImProfilePath(scope, user)} />
                <div className="min-w-0 flex-1">
                  <strong className="truncate text-[16px]">{getDisplayName(user, contact)}</strong>
                  {caption ? <p className="mt-1 text-sm text-ink/42">{caption}</p> : null}
                </div>
                <Button onClick={() => void store.unblockContact(contact.id)} size="sm" variant="secondary">解除</Button>
              </section>
            ) : null;
          })
        )}
      </div>
    </ImStandaloneShell>
  );
}

export function ImContactTagsPage() {
  const { scope, store, config } = useImRuntime();
  const navigate = useNavigate();
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [tagUiState, setTagUiState] = useState<ImTagListUiState>(() => readImTagListUiState(scope));
  const visibleContacts = useMemo(() => getVisibleImContacts(store, scope), [scope, store.contacts, store.usersById]);
  const contactLabelExcludedTags = useMemo(() => scope === "merchant" ? getMerchantOrganizationRoleTagNames() : [], [scope]);
  const tags = useMemo(() => {
    const pinnedIndex = new Map(tagUiState.pinnedTags.map((tag, index) => [tag, index]));
    const normalizedQuery = tagQuery.trim().toLowerCase();

    return buildManagedTagCounts(visibleContacts, tagUiState, store.conversations, contactLabelExcludedTags)
      .filter(([tag]) => !normalizedQuery || tag.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => {
        const leftPinned = pinnedIndex.get(left[0]);
        const rightPinned = pinnedIndex.get(right[0]);

        if (leftPinned !== undefined || rightPinned !== undefined) {
          return (leftPinned ?? Number.MAX_SAFE_INTEGER) - (rightPinned ?? Number.MAX_SAFE_INTEGER);
        }

        return right[1] - left[1] || left[0].localeCompare(right[0], "zh-Hans-CN");
      });
  }, [contactLabelExcludedTags, tagQuery, tagUiState, store.conversations, visibleContacts]);
  const pinnedTagSet = useMemo(() => new Set(tagUiState.pinnedTags), [tagUiState.pinnedTags]);

  useEffect(() => {
    setTagUiState(readImTagListUiState(scope));
  }, [scope]);

  useEffect(() => {
    writeImTagListUiState(scope, tagUiState);
  }, [scope, tagUiState]);

  const togglePinTag = (tag: string) => {
    setTagUiState((current) => ({
      ...current,
      pinnedTags: current.pinnedTags.includes(tag)
        ? current.pinnedTags.filter((item) => item !== tag)
        : [tag, ...current.pinnedTags.filter((item) => item !== tag)]
    }));
  };

  const deleteTag = (tag: string) => {
    setTagUiState((current) => ({
      pinnedTags: current.pinnedTags.filter((item) => item !== tag),
      hiddenTags: current.hiddenTags.includes(tag) ? current.hiddenTags : [...current.hiddenTags, tag],
      customTags: current.customTags.filter((item) => item !== tag)
    }));
  };

  const addManualTag = () => {
    const tag = normalizeImTagName(newTagName);

    if (!isValidImTagName(tag)) {
      return;
    }

    setTagUiState((current) => addCustomImTag(current, tag));
    setNewTagName("");
    setTagQuery("");
    setAddTagOpen(false);
  };

  return (
    <ImStandaloneShell>
      <ImTopBar
        actions={
          <div className="flex items-center gap-2">
            <ImHeaderAction label="搜索标签" onClick={() => setTagSearchOpen((current) => !current)}>
              <ImIcon name="search" />
            </ImHeaderAction>
            <ImHeaderAction label="添加标签" onClick={() => setAddTagOpen(true)}>
              <ImIcon name="add" />
            </ImHeaderAction>
          </div>
        }
        className="border-b border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:var(--client-bg)] shadow-[0_14px_30px_color-mix(in_srgb,var(--client-shadow)_18%,transparent)]"
        footer={tagSearchOpen ? (
          <div className="flex h-11 items-center gap-2 rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,var(--client-bg)_28%)] px-3">
            <ImIcon className="h-4 w-4 shrink-0 text-[color:var(--client-soft-muted)]" name="search" />
            <input
              className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]"
              onChange={(event) => setTagQuery(event.target.value)}
              placeholder="搜索标签"
              type="search"
              value={tagQuery}
            />
            {tagQuery.trim() ? (
              <button
                aria-label="清除标签搜索"
                className="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--client-soft-muted)]"
                onClick={() => setTagQuery("")}
                type="button"
              >
                <span aria-hidden="true" className="text-base leading-none">×</span>
              </button>
            ) : null}
          </div>
        ) : null}
        onBack={() => navigate(config.routes.contacts)}
        title="标签"
      />
      <div className="space-y-3 px-4 py-4">
        {tags.length > 0 ? tags.map(([tag, count]) => {
          const pinned = pinnedTagSet.has(tag);

          return (
          <SwipeActionRow
            actions={[
              {
                key: "pin",
                label: pinned ? "取消置顶" : "置顶",
                tone: "warning",
                width: pinned ? 86 : 66,
                onClick: () => togglePinTag(tag)
              },
              {
                key: "delete",
                label: "删除",
                tone: "danger",
                width: 64,
                onClick: () => deleteTag(tag)
              }
            ]}
            key={tag}
          >
            <button
              className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition-transform active:scale-[0.99]"
              onClick={() => navigate(appendQuery(config.routes.messages, { tag }))}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <h3 className="flex min-w-0 items-center gap-1.5 text-[16px] font-medium text-[color:var(--client-text)]">
                  {pinned ? <ImIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--client-primary)]" name="pin" /> : null}
                  <span className="truncate">{tag}</span>
                </h3>
              </div>
              <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-surface)_88%)] px-3 py-1.5 text-sm text-[color:var(--client-primary)]">{count} 人</span>
            </button>
          </SwipeActionRow>
          );
        }) : (
          <ImEmptyState
            caption={tagQuery.trim() ? "换个标签关键词再试试。" : "当前没有可展示的标签。"}
            title={tagQuery.trim() ? "没有找到标签" : "暂无标签"}
          />
        )}
      </div>
      <ImBottomSheet onClose={() => setAddTagOpen(false)} open={addTagOpen} title="添加标签">
        <div className="space-y-3 pb-2">
          <input
            className="w-full rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-surface)] px-4 py-3 text-[15px] text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
            onChange={(event) => setNewTagName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                addManualTag();
              }
            }}
            placeholder="输入标签名称"
            type="text"
            value={newTagName}
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setAddTagOpen(false)} variant="secondary">取消</Button>
            <Button className="flex-1" disabled={!isValidImTagName(newTagName)} onClick={addManualTag}>添加</Button>
          </div>
        </div>
      </ImBottomSheet>
    </ImStandaloneShell>
  );
}

export function ImServiceAccountsPage() {
  const { scope, store, config } = useImRuntime();
  const navigate = useNavigate();
  const contacts = getServiceContacts(store);

  return (
    <ImStandaloneShell>
      <ImTopBar onBack={() => navigate(config.routes.contacts)} title="服务号" />
      <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
        {contacts.map((contact) => {
          const user = store.usersById[contact.targetUserId];
          const contactInfoTarget = getContactInfoSettingsTarget(config, contact);
          return user ? <ContactRow avatarTo={resolveImProfilePath(scope, user)} caption={buildContactCaption(user, contact)} contact={contact} key={contact.id} to={contactInfoTarget} user={user} /> : null;
        })}
      </div>
    </ImStandaloneShell>
  );
}

function useConversationData(store: ReturnType<typeof useImStore>, conversationId?: string) {
  const conversation = conversationId ? store.conversations.find((item) => item.id === conversationId) : undefined;
  const messages = conversationId ? getConversationMessages(store, conversationId) : [];
  const members = conversationId ? store.members.filter((member) => member.conversationId === conversationId) : [];
  return { conversation, messages, members };
}

function isConversationNotFoundError(error: unknown) {
  return error instanceof Error && error.message.includes("Conversation not found");
}

type MessageMenuState = {
  message: ConversationMessage;
};

type ImReactionPerson = ImMessageReactionSummary["people"][number];
type ImMessageReactionState = Record<string, Record<string, ImReactionPerson[]>>;

const messageRecallTraceThresholdMs = 180_000;

export function ImConversationRoomRoutePage() {
  const { conversationId } = useParams();
  return conversationId ? <ImConversationRoomPage conversationId={conversationId} /> : null;
}

export function ImConversationRoomPage({
  conversationId
}: {
  conversationId: string;
}) {
  const { scope, store, config, api } = useImRuntime();
  const { isNight } = useClientTheme();
  const social = useSocial();
  const entityStore = useEntityStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const back = useRoomBackTarget();
  const { conversation, messages, members } = useConversationData(store, conversationId);
  const [draft, setDraft] = useState("");
  const [quotedMessageId, setQuotedMessageId] = useState<string | undefined>(undefined);
  const [panel, setPanel] = useState<"emoji" | "more" | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [recording, setRecording] = useState<VoiceRecordingState>(idleVoiceRecordingState);
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<MessageMenuState | null>(null);
  const [messageMenuExpanded, setMessageMenuExpanded] = useState(false);
  const [messageReactions, setMessageReactions] = useState<ImMessageReactionState>({});
  const [mediaPreview, setMediaPreview] = useState<ConversationMessage | null>(null);
  const [contactCardPickerOpen, setContactCardPickerOpen] = useState(false);
  const [contactCardQuery, setContactCardQuery] = useState("");
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [serviceCardQuery, setServiceCardQuery] = useState("");
  const [scheduleInvitePickerOpen, setScheduleInvitePickerOpen] = useState(false);
  const [scheduleInviteDate, setScheduleInviteDate] = useState(getTodayDateKey());
  const [selectedScheduleInvite, setSelectedScheduleInvite] = useState<ImScheduleInviteOption | null>(null);
  const [scheduleInviteEditorOpen, setScheduleInviteEditorOpen] = useState(false);
  const [scheduleInviteTitleInput, setScheduleInviteTitleInput] = useState("");
  const [scheduleInviteLocationInput, setScheduleInviteLocationInput] = useState("");
  const [scheduleInviteNoteInput, setScheduleInviteNoteInput] = useState("");
  const [scheduleInviteReminder, setScheduleInviteReminder] = useState(SCHEDULE_INVITE_DEFAULT_REMINDER);
  const [scheduleInviteExtraAttendeeIds, setScheduleInviteExtraAttendeeIds] = useState<string[]>([]);
  const [scheduleInviteAttendeePickerOpen, setScheduleInviteAttendeePickerOpen] = useState(false);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [disappearingNow, setDisappearingNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);
  const listWasNearBottomRef = useRef(true);
  const listStateRef = useRef({ conversationId: "", messageCount: 0 });
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recordingRef = useRef<VoiceRecordingState>(idleVoiceRecordingState);
  const recordingGestureStartYRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingDurationRef = useRef(0);
  const recordingPendingRef = useRef(false);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStopReasonRef = useRef<"send" | "cancel" | "timeout" | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  useDocumentScrollLock(true);
  useIosScrollContainer(listRef, Boolean(menuState));

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    let disposed = false;
    const handleConversationRequestError = (error: unknown) => {
      if (disposed) {
        return;
      }

      if (isConversationNotFoundError(error)) {
        store.setActiveConversation(undefined);
        navigate(config.routes.messages, { replace: true });
        return;
      }

      throw error;
    };

    void store.loadConversation(conversationId).catch(handleConversationRequestError);
    void store.loadMessages(conversationId, { reset: true, limit: 40 }).catch(handleConversationRequestError);
    store.setActiveConversation(conversationId);
    void store.markConversationRead(conversationId)
      .then(() => store.loadMessages(conversationId, { reset: true, limit: 40 }))
      .catch(handleConversationRequestError);

    return () => {
      disposed = true;
      store.setActiveConversation(undefined);
    };
  }, [config.routes.messages, conversationId, navigate]);

  useEffect(() => {
    setDraft(clampMessageText(conversation?.draftText ?? ""));
  }, [conversation?.draftText, conversationId]);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.min(132, textareaRef.current.scrollHeight)}px`;
  }, [draft]);

  const updateListNearBottom = (element: HTMLDivElement) => {
    listWasNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    const list = listRef.current;
    const previousState = listStateRef.current;
    const conversationChanged = previousState.conversationId !== conversationId;
    const previousMessageCount = conversationChanged ? 0 : previousState.messageCount;
    const latestMessage = messages.at(-1);

    listStateRef.current = { conversationId, messageCount: messages.length };

    const highlightId = searchParams.get("highlight");

    if (highlightId && messageRefs.current[highlightId]) {
      messageRefs.current[highlightId]?.scrollIntoView({ block: "center" });
      setFlashMessageId(highlightId);
      window.setTimeout(() => setFlashMessageId(null), 1_800);
      return;
    }

    const shouldStickToBottom =
      conversationChanged ||
      previousMessageCount === 0 ||
      listWasNearBottomRef.current ||
      latestMessage?.senderId === store.currentUserId;

    if (shouldStickToBottom) {
      const scrollToBottom = () => {
        list.scrollTop = list.scrollHeight;
        updateListNearBottom(list);
      };

      scrollToBottom();
      setNewMessageCount(0);
      const frame = window.requestAnimationFrame(scrollToBottom);
      return () => window.cancelAnimationFrame(frame);
    }

    if (messages.length > previousMessageCount) {
      setNewMessageCount((count) => count + 1);
    }
  }, [conversationId, messages.length, searchParams, store.currentUserId]);

  useEffect(() => {
    if (!menuState) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      messageRefs.current[menuState.message.id]?.scrollIntoView({ block: "end", behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [menuState?.message.id, messageMenuExpanded]);

  useEffect(() => {
    if (!recordingNotice || typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => setRecordingNotice(null), 2_600);
    return () => window.clearTimeout(timer);
  }, [recordingNotice]);

  useEffect(
    () => () => {
      if (recordingTimerRef.current !== null) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      recordingStreamRef.current = null;
      recordingPendingRef.current = false;
    },
    []
  );

  const rows = useMemo(
    () => buildTimeSeparatedMessages(messages.filter((message) => !hiddenMessageIds.includes(message.id)), store.config?.separatorThresholdMs ?? 300_000),
    [hiddenMessageIds, messages, store.config?.separatorThresholdMs]
  );
  const pinnedMessages = useMemo(
    () =>
      pinnedMessageIds
        .map((messageId) => messages.find((message) => message.id === messageId))
        .filter((message): message is ConversationMessage => message !== undefined && !hiddenMessageIds.includes(message.id) && message.type !== "recalled"),
    [hiddenMessageIds, messages, pinnedMessageIds]
  );
  const nextDisappearingExpiresAt = useMemo(() => {
    const now = Date.now();
    const futureExpiresAt = messages
      .map((message) => getMessageDisappearingExpiresAt(message))
      .map((expiresAt) => (expiresAt ? new Date(expiresAt).getTime() : Number.NaN))
      .filter((time) => Number.isFinite(time) && time > now);

    return futureExpiresAt.length > 0 ? Math.min(...futureExpiresAt) : undefined;
  }, [messages]);
  const hasRunningDisappearingCountdown = useMemo(
    () =>
      messages.some((message) => {
        const expiresAt = getMessageDisappearingExpiresAt(message);
        return expiresAt ? Number.isFinite(new Date(expiresAt).getTime()) : false;
      }),
    [messages]
  );

  useEffect(() => {
    if (!hasRunningDisappearingCountdown) {
      return undefined;
    }

    setDisappearingNow(Date.now());
    const timer = window.setInterval(() => setDisappearingNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [hasRunningDisappearingCountdown]);

  useEffect(() => {
    if (!nextDisappearingExpiresAt) {
      return undefined;
    }

    const delay = Math.max(80, nextDisappearingExpiresAt - Date.now() + 80);
    const timer = window.setTimeout(() => {
      const handleExpirationRefreshError = (error: unknown) => {
        if (isConversationNotFoundError(error)) {
          navigate(config.routes.messages, { replace: true });
          return;
        }

        throw error;
      };

      void store.loadConversation(conversationId).catch(handleExpirationRefreshError);
      void store.loadMessages(conversationId, { reset: true, limit: 40 }).catch(handleExpirationRefreshError);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [config.routes.messages, conversationId, navigate, nextDisappearingExpiresAt]);

  const quotedMessage = getQuotedMessage(store, conversationId, quotedMessageId);
  const contact = conversation?.contactUserId ? store.contacts.find((item) => item.targetUserId === conversation.contactUserId) : undefined;
  const partner = conversation?.contactUserId ? store.usersById[conversation.contactUserId] : undefined;
  const blocked = Boolean(contact?.isBlocked);
  const currentUser = store.currentUserId ? store.usersById[store.currentUserId] : undefined;
  const activeContactByUserId = useMemo(
    () =>
      new Map(
        store.contacts
          .filter((item) => item.relationStatus === "active" && !item.isBlocked)
          .map((item) => [item.targetUserId, item])
      ),
    [store.contacts]
  );
  const currentSocialActor = social.profiles[social.getActorForScope(scope as SocialPortalScope)];
  const currentReactionPerson = useMemo<ImReactionPerson>(() => {
    return {
      id: store.currentUserId ?? "me",
      name: currentSocialActor?.displayName ?? (currentUser ? getDisplayName(currentUser, activeContactByUserId.get(currentUser.id)) : "我"),
      avatar: currentSocialActor?.avatar ?? currentUser?.avatar
    };
  }, [activeContactByUserId, currentSocialActor?.avatar, currentSocialActor?.displayName, currentUser, store.currentUserId]);
  const scheduleInviteAttendeeLabel = partner ? getDisplayName(partner, contact) : conversation?.title ?? "当前会话";
  const shareableCardUsers = useMemo(() => {
    return buildShareableCardUsers({
      activeContactByUserId,
      currentUserId: store.currentUserId,
      scope,
      users: store.users
    });
  }, [activeContactByUserId, scope, store.currentUserId, store.users]);
  const filteredShareableCardUsers = useMemo(() => {
    const keyword = contactCardQuery.trim().toLowerCase();

    if (!keyword) {
      return shareableCardUsers;
    }

    return shareableCardUsers.filter((user) =>
      [user.nickname, user.userIdLabel, user.signature, user.region, user.bio, ...user.searchableFields]
        .some((field) => typeof field === "string" && field.toLowerCase().includes(keyword))
    );
  }, [contactCardQuery, shareableCardUsers]);
  const scheduleInviteSelectableAttendees = useMemo(() => {
    const excludedIds = new Set([partner?.id, store.currentUserId].filter((id): id is string => Boolean(id)));

    return shareableCardUsers.filter((user) => !excludedIds.has(user.id));
  }, [partner?.id, shareableCardUsers, store.currentUserId]);
  const scheduleInviteExtraAttendees = useMemo(() => {
    const selectedIds = new Set(scheduleInviteExtraAttendeeIds);

    return scheduleInviteSelectableAttendees
      .filter((user) => selectedIds.has(user.id))
      .map((user) => {
        const contactForUser = activeContactByUserId.get(user.id);
        const captionPrefix = getShareableCardCaptionPrefix(scope, user, store.currentUserId, currentUser);
        const caption = captionPrefix
          ? `${captionPrefix} · ${user.signature ?? user.region ?? user.userIdLabel}`
          : buildContactCaption(user, contactForUser) || user.userIdLabel;

        return {
          avatar: user.avatar,
          caption,
          id: user.id,
          label: getDisplayName(user, contactForUser)
        };
      });
  }, [activeContactByUserId, currentUser, scheduleInviteExtraAttendeeIds, scheduleInviteSelectableAttendees, scope, store.currentUserId]);
  const scheduleInviteAttendees = useMemo(() => {
    const primary = {
      avatar: partner?.avatar,
      caption: partner ? buildContactCaption(partner, contact) || partner.userIdLabel : "当前会话",
      id: partner?.id ?? conversation?.id ?? "current-conversation",
      label: scheduleInviteAttendeeLabel
    };

    return [primary, ...scheduleInviteExtraAttendees];
  }, [contact, conversation?.id, partner, scheduleInviteAttendeeLabel, scheduleInviteExtraAttendees]);
  const scheduleInviteAttendeeSummary = useMemo(
    () => scheduleInviteAttendees.map((attendee) => attendee.label).join("、"),
    [scheduleInviteAttendees]
  );
  const serviceShareOptions = useMemo(
    () => buildServiceShareOptions(scope, currentUser, entityStore),
    [currentUser, entityStore, scope]
  );
  const filteredServiceShareOptions = useMemo(() => {
    const keyword = serviceCardQuery.trim().toLowerCase();

    if (!keyword) {
      return serviceShareOptions;
    }

    return serviceShareOptions.filter(({ service, provider }) =>
      [service.name, service.summary, provider?.name, ...(service.tags ?? []), ...(service.serviceAreas ?? [])]
        .some((field) => typeof field === "string" && field.toLowerCase().includes(keyword))
    );
  }, [serviceCardQuery, serviceShareOptions]);
  const scheduleInviteOptions = useMemo(
    () => buildScheduleInviteOptions(scope, currentUser, entityStore),
    [currentUser, entityStore, scope]
  );
  const scheduleInviteCountByDate = useMemo(() => {
    return scheduleInviteOptions.reduce<Map<string, number>>((accumulator, invite) => {
      accumulator.set(invite.date, (accumulator.get(invite.date) ?? 0) + 1);
      return accumulator;
    }, new Map());
  }, [scheduleInviteOptions]);
  const scheduleInviteWeekDates = useMemo(() => getWeekDates(scheduleInviteDate), [scheduleInviteDate]);
  const scheduleInviteDayOptions = useMemo(
    () => scheduleInviteOptions.filter((invite) => invite.date === scheduleInviteDate).sort(compareScheduleInviteOptions),
    [scheduleInviteDate, scheduleInviteOptions]
  );
  const selectedScheduleInviteForDate = selectedScheduleInvite?.date === scheduleInviteDate ? selectedScheduleInvite : null;
  const scheduleInviteHostName = currentReactionPerson.name;
  const scheduleInviteLocation = useMemo(() => {
    if (scope === "merchant") {
      return entityStore.stores.find((item) => item.id === currentUser?.entityId)?.name;
    }

    if (scope === "technician") {
      const technician = entityStore.technicians.find((item) => item.id === currentUser?.entityId);
      return entityStore.stores.find((item) => item.id === technician?.storeId)?.name ?? technician?.serviceAreas[0];
    }

    return currentUser?.region;
  }, [currentUser?.entityId, currentUser?.region, entityStore.stores, entityStore.technicians, scope]);
  const wallpaperFilter = isNight ? "saturate(0.8) brightness(0.42)" : "saturate(0.76) brightness(1.08)";
  const wallpaperOverlay = isNight
    ? "linear-gradient(90deg, rgba(0,0,0,0.62) 0%, rgba(7,20,29,0.54) 100%), linear-gradient(180deg, rgba(4,4,4,0.12) 0%, rgba(4,4,4,0.18) 24%, rgba(4,4,4,0.52) 100%)"
    : "linear-gradient(90deg, rgba(255,255,255,0.68) 0%, rgba(237,244,242,0.62) 100%), linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.18) 24%, rgba(255,255,255,0.46) 100%)";
  const quotedBarClass = isNight
    ? "border-t border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] text-[color:var(--client-muted)] backdrop-blur-md"
    : "border-t border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,var(--client-bg)_16%)] text-[color:var(--client-muted)] backdrop-blur-md";
  const loadMoreButtonClass = isNight
    ? "rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_78%,var(--client-bg)_22%)] px-4 py-2 text-xs text-[color:var(--client-muted)] shadow-[0_6px_18px_rgba(0,0,0,0.18)]"
    : "rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_68%,var(--client-bg)_32%)] px-4 py-2 text-xs text-[color:var(--client-muted)] shadow-[0_6px_18px_rgba(0,0,0,0.08)]";
  const recordingHintClass = isNight
    ? "border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,var(--client-bg)_16%)] text-[color:var(--client-muted)] backdrop-blur-md"
    : "border-b border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_80%,var(--client-bg)_20%)] text-[color:var(--client-muted)] backdrop-blur-md";

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const stopRecordingStream = () => {
    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    recordingStreamRef.current = null;
  };

  const resetRecording = (preserveStopReason = false) => {
    clearRecordingTimer();
    stopRecordingStream();
    recordingPendingRef.current = false;
    recordingChunksRef.current = [];
    recordingDurationRef.current = 0;
    if (!preserveStopReason) {
      recordingStopReasonRef.current = null;
    }
    recordingGestureStartYRef.current = null;
    recordingRef.current = idleVoiceRecordingState;
    setRecording(idleVoiceRecordingState);
  };

  const updateRecordingCancel = (cancel: boolean) => {
    recordingRef.current = {
      ...recordingRef.current,
      cancel
    };
    setRecording((current) => (current.active && current.cancel !== cancel ? { ...current, cancel } : current));
  };

  const stopActiveRecording = (reason: "send" | "cancel" | "timeout") => {
    recordingStopReasonRef.current = reason;

    if (recordingPendingRef.current && !mediaRecorderRef.current) {
      resetRecording(true);
      return;
    }

    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      resetRecording();
      return;
    }

    recorder.stop();
  };

  const finalizeVoiceRecording = async (chunks: Blob[], mimeType: string, stopReason: "send" | "cancel" | "timeout" | null) => {
    const durationSeconds = Math.min(maxVoiceRecordingSeconds, Math.max(1, recordingDurationRef.current));
    resetRecording();

    if (stopReason === "cancel") {
      return;
    }

    if (chunks.length === 0) {
      setRecordingNotice("没有录到语音，请再试一次。");
      return;
    }

    try {
      const blob = new Blob(chunks, { type: mimeType });
      const audioUrl = await readBlobAsDataUrl(blob);

      await store.sendMessage(conversationId, "voice", audioUrl, {
        quotedMessageId,
        ext: {
          url: audioUrl,
          fileName: `voice-${Date.now()}.webm`,
          fileSize: blob.size,
          mimeType,
          duration: durationSeconds
        }
      });

      setQuotedMessageId(undefined);

      if (stopReason === "timeout") {
        setRecordingNotice("语音已录满 60 秒，已自动发送。");
      }
    } catch {
      setRecordingNotice("语音发送失败，请稍后重试。");
    }
  };

  const startRecordingTimer = (startedAt: number) => {
    clearRecordingTimer();
    recordingTimerRef.current = window.setInterval(() => {
      const elapsedSeconds = Math.min(maxVoiceRecordingSeconds, Math.max(1, Math.ceil((Date.now() - startedAt) / 1000)));
      recordingDurationRef.current = elapsedSeconds;
      recordingRef.current = {
        ...recordingRef.current,
        durationSeconds: elapsedSeconds
      };
      setRecording((current) => (current.active && current.durationSeconds !== elapsedSeconds ? { ...current, durationSeconds: elapsedSeconds } : current));

      if (elapsedSeconds >= maxVoiceRecordingSeconds) {
        stopActiveRecording("timeout");
      }
    }, 250);
  };

  const sendText = async () => {
    const messageText = clampMessageText(draft.trim());

    if (!messageText) {
      return;
    }

    try {
      await store.sendMessage(conversationId, "text", messageText, {
        quotedMessageId
      });
      setDraft("");
      setQuotedMessageId(undefined);
      setPanel(null);
    } catch {
      // failed state is rendered by optimistic message
    }
  };

  const resolveContactCardDetailPath = (card: ContactCardPayload) => {
    const cardUser = store.usersById[card.userId];
    const directPath = resolveImProfilePath(scope, cardUser);

    if (directPath) {
      return directPath;
    }

    const profileRef = resolveContactCardProfileRef(card, cardUser);
    return profileRef ? getScopedProfileDetailPath(scope, profileRef.entityType, profileRef.id) : undefined;
  };

  const openContactCardProfile = (card: ContactCardPayload) => {
    const detailPath = resolveContactCardDetailPath(card);

    if (detailPath) {
      navigate(detailPath);
      return;
    }

    const targetContact = activeContactByUserId.get(card.userId);

    if (targetContact) {
      navigate(config.routes.contactDetail(targetContact.id));
    }
  };

  const sendContactCard = async (cardUser: ImUser) => {
    if (blocked || !canShareUserCard(scope, cardUser)) {
      return;
    }

    await store.sendMessage(conversationId, "contact-card", cardUser.nickname, {
      quotedMessageId,
      ext: {
        contactCard: buildContactCardPayload(cardUser)
      }
    });
    setQuotedMessageId(undefined);
    setContactCardPickerOpen(false);
    setContactCardQuery("");
  };

  const sendServiceCard = async ({ service, provider, providerType, href }: ImServiceShareOption) => {
    if (blocked || !config.chatCapabilityConfig.allowedMessageTypes.includes("service-card")) {
      return;
    }

    await store.sendMessage(conversationId, "service-card", service.name, {
      quotedMessageId,
      ext: {
        serviceCard: {
          serviceId: service.id,
          name: service.name,
          cover: service.cover,
          summary: service.summary,
          priceLabel: formatServicePriceLabel(service),
          durationLabel: formatServiceDurationLabel(service),
          providerName: provider?.name,
          providerId: provider?.id,
          providerType,
          href,
          tags: service.tags.slice(0, 4)
        }
      }
    });
    setQuotedMessageId(undefined);
    setServicePickerOpen(false);
    setServiceCardQuery("");
    setPanel(null);
  };

  const closeScheduleInvitePicker = () => {
    setScheduleInvitePickerOpen(false);
    setSelectedScheduleInvite(null);
    setScheduleInviteEditorOpen(false);
    setScheduleInviteTitleInput("");
    setScheduleInviteLocationInput("");
    setScheduleInviteNoteInput("");
    setScheduleInviteReminder(SCHEDULE_INVITE_DEFAULT_REMINDER);
    setScheduleInviteExtraAttendeeIds([]);
    setScheduleInviteAttendeePickerOpen(false);
  };

  const openScheduleInvitePicker = () => {
    setPanel(null);
    setScheduleInviteDate(getTodayDateKey());
    setSelectedScheduleInvite(null);
    setScheduleInviteEditorOpen(false);
    setScheduleInviteTitleInput("");
    setScheduleInviteLocationInput("");
    setScheduleInviteNoteInput("");
    setScheduleInviteReminder(SCHEDULE_INVITE_DEFAULT_REMINDER);
    setScheduleInviteExtraAttendeeIds([]);
    setScheduleInviteAttendeePickerOpen(false);
    setScheduleInvitePickerOpen(true);
  };

  const selectScheduleInviteDate = (date: string) => {
    setScheduleInviteDate(date);
    setSelectedScheduleInvite(null);
    setScheduleInviteEditorOpen(false);
  };

  const shiftScheduleInviteWeek = (direction: -1 | 1) => {
    setScheduleInviteDate((current) => addDays(current, direction * 7));
    setSelectedScheduleInvite(null);
    setScheduleInviteEditorOpen(false);
  };

  const openScheduleInviteEditor = (invite: ImScheduleInviteOption) => {
    setSelectedScheduleInvite(invite);
    setScheduleInviteTitleInput(invite.sourceType === "open" ? "" : invite.title || "");
    setScheduleInviteLocationInput(invite.location ?? scheduleInviteLocation ?? "");
    setScheduleInviteNoteInput(invite.note ?? "");
    setScheduleInviteReminder(invite.reminderLabel ?? SCHEDULE_INVITE_DEFAULT_REMINDER);
    setScheduleInviteAttendeePickerOpen(false);
    setScheduleInviteEditorOpen(true);
  };

  const toggleScheduleInviteExtraAttendee = (userId: string) => {
    setScheduleInviteExtraAttendeeIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  };

  const sendScheduleInvite = async (invite: ImScheduleInviteOption) => {
    if (blocked || !config.chatCapabilityConfig.allowedMessageTypes.includes("schedule-invite")) {
      return;
    }

    const preparedInvite: ImScheduleInviteOption = {
      ...invite,
      attendeeLabel: scheduleInviteAttendeeSummary,
      location: scheduleInviteLocationInput.trim() || undefined,
      note: scheduleInviteNoteInput.trim() || undefined,
      reminderLabel: scheduleInviteReminder,
      title: scheduleInviteTitleInput.trim() || "（无标题）"
    };

    await store.sendMessage(conversationId, "schedule-invite", preparedInvite.title, {
      quotedMessageId,
      ext: {
        scheduleInvite: {
          scheduleId: preparedInvite.scheduleId,
          title: preparedInvite.title,
          date: preparedInvite.date,
          timeRange: preparedInvite.timeRange,
          location: preparedInvite.location,
          hostName: preparedInvite.hostName,
          note: preparedInvite.note,
          attendeeLabel: preparedInvite.attendeeLabel,
          reminderLabel: preparedInvite.reminderLabel,
          statusLabel: preparedInvite.statusLabel,
          href: preparedInvite.href
        }
      }
    });
    setQuotedMessageId(undefined);
    setScheduleInvitePickerOpen(false);
    setSelectedScheduleInvite(null);
    setScheduleInviteEditorOpen(false);
    setScheduleInviteExtraAttendeeIds([]);
    setScheduleInviteAttendeePickerOpen(false);
    setPanel(null);
  };

  const renderContactCardAction = (card: ContactCardPayload, message?: ConversationMessage) => {
    const cardUser = store.usersById[card.userId];
    const contactFromCard = activeContactByUserId.get(card.userId);
    const profileRef = resolveContactCardProfileRef(card, cardUser);
    const targetKey = profileRef ? profileKey(profileRef) : undefined;
    const actorKey = social.getActorForScope(scope as SocialPortalScope);
    const statusClassName = "whitespace-nowrap text-[11px] font-black text-[color:var(--client-muted)]";
    const actionClassName =
      "rounded-full bg-[color:var(--client-primary)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary-contrast)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-primary)_30%,transparent)]";
    const renderActionButton = (label: string, run: () => unknown | Promise<unknown>) => (
      <button
        className={actionClassName}
        onClick={(event) => {
          event.stopPropagation();
          void run();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        {label}
      </button>
    );

    if (card.userId === store.currentUserId || (targetKey && targetKey === actorKey)) {
      return <span className={statusClassName}>我的名片</span>;
    }

    if (contactFromCard || (message?.senderId === store.currentUserId && card.profileKind === "person")) {
      return <span className={statusClassName}>好友</span>;
    }

    if (targetKey && social.profiles[targetKey]) {
      const following = social.getFollowing(actorKey).some((profile) => profileKey(profile) === targetKey);
      const targetFollowsActor = social.getFollowing(targetKey).some((profile) => profileKey(profile) === actorKey);

      if (following && targetFollowsActor) {
        return <span className={statusClassName}>好友</span>;
      }

      if (following) {
        return (
          <span className={`${statusClassName} inline-flex items-center gap-1`}>
            已关注
            <ImIcon className="h-3 w-3" name="check" />
          </span>
        );
      }

      return renderActionButton("关注", () => social.toggleFollow(actorKey, targetKey));
    }

    if (card.profileKind === "person") {
      return renderActionButton("添加好友", () =>
        store.addContact(card.userId, "聊天名片", "通过好友分享的名片添加")
      );
    }

    return renderActionButton("添加", () =>
      store.addContact(card.userId, "聊天名片", "通过好友分享的名片添加")
    );
  };

  const renderContactCard = (card: ContactCardPayload, message?: ConversationMessage) => {
    const profileRef = resolveContactCardProfileRef(card, store.usersById[card.userId]);
    const detailTo = resolveContactCardDetailPath(card);
    const actionSlot = renderContactCardAction(card, message);
    const cardClassName = "w-[330px] max-w-[84vw] shadow-[0_8px_20px_rgba(0,0,0,0.08)]";

    if (profileRef?.entityType === "shop") {
      const shop = entityStore.stores.find((item) => item.id === profileRef.id);

      if (shop) {
        return (
          <SocialProfileMiniCard
            actionSlot={actionSlot}
            className={cardClassName}
            detailTo={detailTo}
            onOpenDetails={detailTo ? undefined : () => openContactCardProfile(card)}
            store={shop}
          />
        );
      }
    }

    if (profileRef?.entityType === "technician") {
      const technician = entityStore.technicians.find((item) => item.id === profileRef.id);

      if (technician) {
        return (
          <SocialProfileMiniCard
            actionSlot={actionSlot}
            className={cardClassName}
            detailTo={detailTo}
            onOpenDetails={detailTo ? undefined : () => openContactCardProfile(card)}
            technician={technician}
          />
        );
      }
    }

    if (profileRef?.entityType === "user") {
      const customer = entityStore.customers.find((item) => item.id === profileRef.id);

      if (customer) {
        return (
          <SocialProfileMiniCard
            actionSlot={actionSlot}
            className={cardClassName}
            customer={customer}
            detailTo={detailTo}
            onOpenDetails={detailTo ? undefined : () => openContactCardProfile(card)}
          />
        );
      }
    }

    return undefined;
  };

  const sendPresetMessage = async (type: ImMessageType) => {
    if (blocked) {
      return;
    }

    if (type === "image") {
      const upload = await api.uploadInit("image");
      await store.sendMessage(conversationId, "image", upload.fileUrl, {
        ext: {
          url: upload.fileUrl,
          thumbnailUrl: upload.fileUrl,
          fileName: "album-image.jpg",
          fileSize: 380_000,
          mimeType: "image/jpeg",
          width: 960,
          height: 1280
        }
      });
      setPanel(null);
      return;
    }

    if (type === "video") {
      await store.sendMessage(conversationId, "video", "https://example.com/video/mock.mp4", {
        ext: {
          url: "https://example.com/video/mock.mp4",
          thumbnailUrl: imageBank.cleaningPortrait,
          fileName: "preview.mp4",
          fileSize: 1_820_000,
          mimeType: "video/mp4",
          duration: 11,
          width: 720,
          height: 960
        }
      });
      setPanel(null);
      return;
    }

    if (type === "file") {
      await store.sendMessage(conversationId, "file", "https://example.com/files/im-note.pdf", {
        ext: {
          url: "https://example.com/files/im-note.pdf",
          fileName: "预约说明.pdf",
          fileSize: 1_420_000,
          mimeType: "application/pdf"
        }
      });
      setPanel(null);
      return;
    }

    if (type === "location") {
      await store.sendMessage(conversationId, "location", "门店位置", {
        ext: {
          location: {
            title: "东京都中央区 银座 4-2-11",
            address: "最近地铁站出口步行 3 分钟",
            latitude: 35.6721,
            longitude: 139.7649
          }
        }
      });
      setPanel(null);
      return;
    }

    if (type === "contact-card") {
      setPanel(null);
      setContactCardQuery("");
      setContactCardPickerOpen(true);
    }
  };

  const startRecording = async (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (blocked || recordingPendingRef.current || recordingRef.current.active) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingNotice("当前设备不支持浏览器录音。");
      return;
    }

    const button = event.currentTarget;
    button.setPointerCapture(event.pointerId);
    recordingPendingRef.current = true;
    recordingStopReasonRef.current = null;
    recordingGestureStartYRef.current = event.clientY;
    recordingChunksRef.current = [];
    setPanel(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (recordingStopReasonRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        resetRecording();
        return;
      }

      const mimeType = getSupportedVoiceMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const startedAt = Date.now();

      recordingPendingRef.current = false;
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingDurationRef.current = 0;
      recordingRef.current = {
        active: true,
        cancel: false,
        startedAt,
        durationSeconds: 0
      };
      setRecording(recordingRef.current);

      recorder.ondataavailable = (dataEvent) => {
        if (dataEvent.data.size > 0) {
          recordingChunksRef.current.push(dataEvent.data);
        }
      };

      recorder.onerror = () => {
        setRecordingNotice("录音时出了点问题，请再试一次。");
        resetRecording();
      };

      recorder.onstop = () => {
        const chunks = [...recordingChunksRef.current];
        const stopReason = recordingStopReasonRef.current;
        const nextMimeType = recorder.mimeType || chunks[0]?.type || mimeType || "audio/webm";

        void finalizeVoiceRecording(chunks, nextMimeType, stopReason);
      };

      recorder.start(250);
      startRecordingTimer(startedAt);
    } catch {
      if (recordingStopReasonRef.current) {
        resetRecording();
        return;
      }

      recordingPendingRef.current = false;
      setRecordingNotice("请先允许麦克风权限，才能发送语音。");
      resetRecording();
    }
  };

  const moveRecording = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!recordingRef.current.active) {
      return;
    }

    const gestureStartY = recordingGestureStartYRef.current ?? event.clientY;
    updateRecordingCancel(gestureStartY - event.clientY > 56);
  };

  const endRecording = async () => {
    if (!recordingPendingRef.current && !recordingRef.current.active) {
      return;
    }

    stopActiveRecording(recordingRef.current.cancel ? "cancel" : "send");
  };

  const closeMessageMenu = () => {
    setMenuState(null);
    setMessageMenuExpanded(false);
    window.getSelection()?.removeAllRanges();
  };

  const closeConversationFloatingUi = () => {
    if (panel) {
      setPanel(null);
    }

    if (menuState) {
      closeMessageMenu();
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleConversationPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest("[data-im-composer-root='true'], [data-im-message-action-sheet='true']")) {
      return;
    }

    if (menuState && hasActiveImMessageTextSelection(messageRefs.current[menuState.message.id])) {
      return;
    }

    closeConversationFloatingUi();
  };

  const selectMessageText = (message: ConversationMessage) => {
    window.requestAnimationFrame(() => {
      const root = messageRefs.current[message.id];
      const target = root?.querySelector<HTMLElement>("[data-im-message-selectable-text='true']");

      if (!target) {
        return;
      }

      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };

  const openMessageMenu = (message: ConversationMessage) => {
    setPanel(null);
    setVoiceMode(false);
    setMessageMenuExpanded(false);
    setMenuState({ message });
    selectMessageText(message);
  };

  const toggleMessageReaction = (message: ConversationMessage, reaction: string, closeAfter = true) => {
    setMessageReactions((current) => {
      const groups = current[message.id] ?? {};
      const people = groups[reaction] ?? [];
      const reactedByMe = people.some((person) => person.id === currentReactionPerson.id);
      const nextPeople = reactedByMe
        ? people.filter((person) => person.id !== currentReactionPerson.id)
        : [...people, currentReactionPerson];
      const nextGroups = { ...groups };
      const nextState = { ...current };

      if (nextPeople.length > 0) {
        nextGroups[reaction] = nextPeople;
      } else {
        delete nextGroups[reaction];
      }

      if (Object.keys(nextGroups).length > 0) {
        nextState[message.id] = nextGroups;
      } else {
        delete nextState[message.id];
      }

      return nextState;
    });
    if (closeAfter) {
      closeMessageMenu();
    }
  };

  const getMessageReactionSummaries = (messageId: string): ImMessageReactionSummary[] =>
    Object.entries(messageReactions[messageId] ?? {}).map(([emoji, people]) => ({
      emoji,
      people: people.map((person) => (person.id === currentReactionPerson.id ? currentReactionPerson : person)),
      reactedByMe: people.some((person) => person.id === currentReactionPerson.id)
    }));

  const copyMessageContent = (message: ConversationMessage) => {
    const root = messageRefs.current[message.id];
    const selection = window.getSelection();
    const selectedContent = selection && !selection.isCollapsed && root && selection.anchorNode && selection.focusNode && root.contains(selection.anchorNode) && root.contains(selection.focusNode)
      ? selection.toString().trim()
      : "";
    const content = selectedContent || message.content || message.ext?.previewText || "媒体消息";
    navigator.clipboard?.writeText(content).catch(() => undefined);
    closeMessageMenu();
  };

  const isOwnRecallableMessage = (message: ConversationMessage) =>
    message.senderId === store.currentUserId && message.type !== "system" && message.type !== "recalled" && message.status !== "failed";

  const isQuickRecallMessage = (message: ConversationMessage) => {
    const sentAt = new Date(message.sentAt).getTime();

    if (!Number.isFinite(sentAt)) {
      return false;
    }

    return Date.now() - sentAt <= messageRecallTraceThresholdMs;
  };

  const scrollToMessage = (messageId: string) => {
    messageRefs.current[messageId]?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashMessageId(messageId);
    window.setTimeout(() => setFlashMessageId(null), 1_800);
  };

  const togglePinnedMessage = (message: ConversationMessage) => {
    setPinnedMessageIds((current) =>
      current.includes(message.id)
        ? current.filter((messageId) => messageId !== message.id)
        : [...current.filter((messageId) => messages.some((item) => item.id === messageId)), message.id].slice(-3)
    );
    closeMessageMenu();
  };

  const recallMessage = (message: ConversationMessage) => {
    if (!isOwnRecallableMessage(message)) {
      return;
    }

    setPinnedMessageIds((current) => current.filter((messageId) => messageId !== message.id));

    if (isQuickRecallMessage(message)) {
      setHiddenMessageIds((current) => current.includes(message.id) ? current : [...current, message.id]);
      closeMessageMenu();
      return;
    }

    void store.recallMessage(message.id).catch(() => undefined);
    closeMessageMenu();
  };

  const createMessageActions = (message: ConversationMessage) => {
    const canRecall = isOwnRecallableMessage(message);
    const pinned = pinnedMessageIds.includes(message.id);
    const primaryActions: ImMessageActionSheetItem[] = [
      {
        key: "reply",
        label: "回复",
        icon: "reply",
        onClick: () => {
          setQuotedMessageId(message.id);
          closeMessageMenu();
          window.requestAnimationFrame(() => textareaRef.current?.focus());
        }
      },
      {
        key: "forward",
        label: "转发",
        icon: "forward",
        onClick: () => {
          closeMessageMenu();
          navigate(appendQuery(config.routes.newConversation, { mode: "forward", messageId: message.id }));
        }
      },
      {
        key: "translate",
        label: "翻译",
        icon: "translate",
        onClick: closeMessageMenu
      },
      {
        key: "copy",
        label: "复制",
        icon: "copy",
        onClick: () => copyMessageContent(message)
      },
      {
        key: "multi-select",
        label: "多选",
        icon: "select",
        onClick: closeMessageMenu
      },
      {
        key: "pin-message",
        label: pinned ? "取消信息置顶" : "信息置顶",
        icon: "pin",
        onClick: () => togglePinnedMessage(message)
      },
      {
        key: "recall",
        label: "撤回",
        icon: "delete",
        disabled: !canRecall,
        onClick: () => recallMessage(message)
      }
    ];

    primaryActions.push({
      key: "delete-local",
      label: "删除",
      icon: "delete",
      tone: "danger",
      onClick: () => {
        setHiddenMessageIds((current) => [...current, message.id]);
        setPinnedMessageIds((current) => current.filter((messageId) => messageId !== message.id));
        closeMessageMenu();
      }
    });

    return { primaryActions, listActions: [] };
  };

  const availableMoreActions = [
    { key: "image", label: "相册", icon: "photo" as const, run: () => void sendPresetMessage("image") },
    { key: "camera", label: "拍照", icon: "camera" as const, run: () => void sendPresetMessage("image") },
    { key: "file", label: "文件", icon: "file" as const, run: () => void sendPresetMessage("file") },
    { key: "location", label: "位置", icon: "location" as const, run: () => void sendPresetMessage("location") },
    { key: "card", label: "名片", icon: "card" as const, run: () => void sendPresetMessage("contact-card") },
    { key: "service", label: "发送服务", icon: "service" as const, run: () => {
      setPanel(null);
      setServicePickerOpen(true);
    } },
    { key: "schedule", label: "日程邀请", icon: "calendar" as const, run: () => {
      openScheduleInvitePicker();
    } },
    { key: "group", label: "发起群聊", icon: "group" as const, run: () => navigate(appendQuery(config.routes.newConversation, { mode: "group", from: conversationId })) }
  ].filter((action) => {
    if (action.key === "group") {
      return config.chatCapabilityConfig.allowGroupConversation;
    }

    if (action.key === "card") {
      return config.chatCapabilityConfig.allowedMessageTypes.includes("contact-card");
    }

    if (action.key === "service") {
      return scope !== "user" && config.chatCapabilityConfig.allowedMessageTypes.includes("service-card");
    }

    if (action.key === "schedule") {
      return config.chatCapabilityConfig.allowedMessageTypes.includes("schedule-invite");
    }

    if (action.key === "image" || action.key === "camera") {
      return config.chatCapabilityConfig.allowedMessageTypes.includes("image");
    }

    if (action.key === "file") {
      return config.chatCapabilityConfig.allowedMessageTypes.includes("file");
    }

    if (action.key === "location") {
      return config.chatCapabilityConfig.allowedMessageTypes.includes("location");
    }

    return true;
  });

  if (!conversation) {
    return (
      <ImStandaloneShell>
        <ImTopBar onBack={back} title="聊天" />
        <ImEmptyState caption="会话可能已被删除，或者还没完成本地同步。" title="找不到会话" />
      </ImStandaloneShell>
    );
  }

  return (
    <ImStandaloneShell>
      <div
        className="im-conversation-room-shell fixed inset-x-0 inset-y-0 z-20 mx-auto flex h-[100dvh] w-full min-w-0 max-w-full flex-col overflow-hidden overscroll-none [overflow-x:clip]"
        onPointerDownCapture={handleConversationPointerDownCapture}
        style={{ maxWidth: "min(880px, 100%)" }}
      >
        <ImTopBar
          actions={
            <ImHeaderAction label="更多" onClick={() => navigate(config.routes.conversationInfo(conversationId))}>
              <ImIcon name="more" />
            </ImHeaderAction>
          }
          centerTitle
          onBack={back}
          subtitle={conversation.type === "group" ? `${members.length} 人` : partner?.signature}
          title={
            conversation.privacyModeEnabled ? (
              <h1 className="flex w-full min-w-0 max-w-full items-center justify-center text-[18px] font-black tracking-[-0.02em] text-[color:var(--client-text)]">
                <PrivateConversationTitle privateMode title={getConversationDisplayName(store, conversation)} />
              </h1>
            ) : (
              getConversationDisplayName(store, conversation)
            )
          }
        />

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden overscroll-none">
          <div aria-hidden="true" className="im-conversation-wallpaper pointer-events-none absolute inset-0 overflow-hidden">
            <img
              alt=""
              aria-hidden="true"
              className={cn("absolute inset-0 h-full w-full object-cover", isNight ? "opacity-[0.96]" : "opacity-[0.48]")}
              src={chatBgUrl}
              style={{ filter: wallpaperFilter }}
            />
            <div className={cn("absolute inset-0", isNight ? "bg-black/10" : "bg-white/8")} />
            <div
              className="absolute inset-0"
              style={{
                background: wallpaperOverlay
              }}
            />
          </div>

          {blocked ? (
            <div className="relative z-10 border-b border-[color:color-mix(in_srgb,var(--client-accent)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--client-accent)_12%,var(--client-bg)_88%)] px-4 py-3 text-sm text-[color:var(--client-accent)]">你已将对方加入黑名单，无法继续发起新消息。</div>
          ) : null}

          {pinnedMessages.length > 0 ? (
            <section className={cn("relative z-10 border-b px-3 py-2", isNight ? "border-white/8 bg-[#1f1f20]/88" : "border-[color:color-mix(in_srgb,var(--client-line)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)]")}>
              <div className="space-y-1.5">
                {pinnedMessages.map((message) => {
                  const sender = store.usersById[message.senderId];
                  const senderName = sender ? getDisplayName(sender, activeContactByUserId.get(sender.id)) : "消息";
                  const preview = buildMessagePreview(message, store.currentUserId ?? "", store.usersById);

                  return (
                    <div className={cn("flex min-w-0 items-center gap-2 rounded-[16px] px-2 py-2", isNight ? "bg-white/[0.05]" : "bg-black/[0.035]")} key={message.id}>
                      <button
                        className="focus-ring flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => scrollToMessage(message.id)}
                        type="button"
                      >
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[10px]", isNight ? "bg-white/[0.08] text-white/70" : "bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] text-[color:var(--client-primary)]")}>
                          <ImIcon className="h-4 w-4" name="top" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-black text-[color:var(--client-muted)]">信息置顶 · {senderName}</span>
                          <span className="mt-0.5 block truncate text-[13px] font-black text-[color:var(--client-text)]">{preview}</span>
                        </span>
                      </button>
                      <button
                        aria-label="取消信息置顶"
                        className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--client-muted)] transition hover:bg-black/[0.06]"
                        onClick={() => setPinnedMessageIds((current) => current.filter((messageId) => messageId !== message.id))}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div
            className={cn("im-conversation-scroll scrollbar-none relative z-10 min-h-0 flex-1 touch-pan-y overflow-y-scroll overscroll-y-contain px-1 py-3", menuState && "im-conversation-scroll--text-selecting")}
            data-page-drag-ignore="true"
            data-scroll-drag-ignore="true"
            onClick={() => {
              if (menuState && hasActiveImMessageTextSelection(messageRefs.current[menuState.message.id])) {
                return;
              }

              if (menuState) {
                closeMessageMenu();
              }
            }}
            onScroll={(event) => {
              const target = event.currentTarget;
              updateListNearBottom(target);
              if (listWasNearBottomRef.current) {
                setNewMessageCount(0);
              }
            }}
            ref={listRef}
          >
            {store.paginationByConversation[conversationId]?.hasMore ? (
              <div className="relative z-10 pb-3 text-center">
                <button className={loadMoreButtonClass} onClick={() => void store.loadMessages(conversationId)} type="button">
                  加载更早消息
                </button>
              </div>
            ) : null}

            {rows.map((row) => {
              if (row.kind === "divider") {
                return (
                  <div className="relative z-10 px-8 py-2 text-center text-xs text-[color:var(--client-soft-muted)]" key={row.id}>
                    {row.label}
                  </div>
                );
              }

              const message = row.message;
              const sender = store.usersById[message.senderId];
              const senderProfilePath = sender ? resolveImProfilePath(scope, sender) : undefined;
              const isMine = message.senderId === store.currentUserId;
              const showSender = conversation.type === "group" && !isMine;
              const quoted = getQuotedMessage(store, conversationId, message.quotedMessageId);
              const quotedSender = quoted ? store.usersById[quoted.senderId] : undefined;

              return (
                <div
                  className={cn("relative rounded-3xl transition", menuState ? "z-20" : "z-10", flashMessageId === message.id && "bg-[#fff7d4]", menuState?.message.id === message.id && "bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]")}
                  data-im-message-selected={menuState?.message.id === message.id ? "true" : undefined}
                  key={message.id}
                  ref={(element) => {
                    messageRefs.current[message.id] = element;
                  }}
                >
                  <MessagePressable onOpenMenu={() => openMessageMenu(message)}>
                    <MessageBubble
                      avatar={sender?.avatar}
                      avatarTo={senderProfilePath}
                      disappearingNow={hasRunningDisappearingCountdown ? disappearingNow : undefined}
                      isMine={isMine}
                      message={message}
                      onOpenContact={(userId) => {
                        const targetContact = store.contacts.find((item) => item.targetUserId === userId);
                        const targetUser = store.usersById[userId];
                        const targetProfilePath = resolveImProfilePath(scope, targetUser);
                        if (targetProfilePath) {
                          navigate(targetProfilePath);
                          return;
                        }

                        if (targetContact) {
                          navigate(config.routes.contactDetail(targetContact.id));
                        }
                      }}
                      onPreviewMedia={setMediaPreview}
                      quotedMessage={quoted}
                      quotedSenderAvatar={quotedSender?.avatar}
                      quotedSenderName={quotedSender ? getDisplayName(quotedSender, activeContactByUserId.get(quotedSender.id)) : undefined}
                      onToggleReaction={(reaction) => toggleMessageReaction(message, reaction, false)}
                      reactions={getMessageReactionSummaries(message.id)}
                      renderContactCard={renderContactCard}
                      renderContactCardAction={renderContactCardAction}
                      senderName={sender?.nickname}
                      showSender={showSender}
                    />
                  </MessagePressable>
                </div>
              );
            })}
          </div>

          {newMessageCount > 0 && !menuState ? (
            <button
              className="absolute bottom-[140px] right-4 z-20 rounded-full bg-[color:var(--client-primary)] px-4 py-2 text-xs font-medium text-[color:var(--pin-badge-glyph)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_32%,transparent)]"
              onClick={() => {
                listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
                setNewMessageCount(0);
              }}
              type="button"
            >
              {newMessageCount} 条新消息
            </button>
          ) : null}

          {recordingNotice ? (
            <div className={cn("relative z-10 px-4 py-2 text-xs", recordingHintClass)}>
              <p>{recordingNotice}</p>
            </div>
          ) : null}

          {menuState ? (
            (() => {
              const { primaryActions, listActions } = createMessageActions(menuState.message);

              return (
                <>
                  <ImMessageSelectionHandles active messageRoot={messageRefs.current[menuState.message.id]} />
                  <ImMessageActionSheet
                    actions={primaryActions}
                    expanded={messageMenuExpanded}
                    isNight={isNight}
                    listActions={listActions}
                    onClose={closeMessageMenu}
                    onExpandedChange={setMessageMenuExpanded}
                    onReact={(reaction) => toggleMessageReaction(menuState.message, reaction)}
                  />
                </>
              );
            })()
          ) : (
            <>
              {quotedMessage ? (
                <div className={cn("relative z-10 px-4 py-2 text-xs", quotedBarClass)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">回复消息</p>
                      <p className="mt-1 truncate">{quotedMessage.content || "媒体消息"}</p>
                    </div>
                    <button className="text-ink/32" onClick={() => setQuotedMessageId(undefined)} type="button">
                      取消
                    </button>
                  </div>
                </div>
              ) : null}

              <ImChatComposer
                actions={availableMoreActions}
                blocked={blocked}
                draft={draft}
                isNight={isNight}
                maxVoiceRecordingSeconds={maxVoiceRecordingSeconds}
                onCancelRecording={() => stopActiveRecording("cancel")}
                onDraftChange={(value) => {
                  const nextDraft = clampMessageText(value);
                  setDraft(nextDraft);
                  store.setDraft(conversationId, nextDraft);
                }}
                onEndRecording={() => void endRecording()}
                onMoveRecording={moveRecording}
                onPanelChange={setPanel}
                onSend={() => void sendText()}
                onStartRecording={(event) => void startRecording(event)}
                onToggleVoice={() => {
                  if (recordingPendingRef.current || recordingRef.current.active) {
                    return;
                  }

                  setVoiceMode((value) => !value);
                }}
                panel={panel}
                recording={recording}
                textareaRef={textareaRef}
                voiceMode={voiceMode}
              />
            </>
          )}
        </div>
      </div>

      <ImBottomSheet onClose={() => setContactCardPickerOpen(false)} open={contactCardPickerOpen} title="发送名片">
        <div className="space-y-3 pb-2">
          <input
            className="h-11 w-full rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-surface)] px-4 text-[15px] text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
            onChange={(event) => setContactCardQuery(event.target.value)}
            placeholder="搜索用户、店铺或技师名片"
            value={contactCardQuery}
          />

          <section className="max-h-[62dvh] overflow-y-auto rounded-[24px] bg-[color:color-mix(in_srgb,var(--client-bg)_72%,var(--client-surface)_28%)]">
            {filteredShareableCardUsers.length > 0 ? (
              filteredShareableCardUsers.map((user) => {
                const contactForUser = activeContactByUserId.get(user.id);
                const currentUser = store.currentUserId ? store.usersById[store.currentUserId] : undefined;
                const captionPrefix = getShareableCardCaptionPrefix(scope, user, store.currentUserId, currentUser);
                const caption = captionPrefix
                  ? `${captionPrefix} · ${user.signature ?? user.region ?? user.userIdLabel}`
                  : buildContactCaption(user, contactForUser) || user.userIdLabel;

                return (
                  <ContactRow
                    caption={caption}
                    contact={contactForUser}
                    key={user.id}
                    onClick={() => void sendContactCard(user)}
                    user={user}
                  />
                );
              })
            ) : (
              <div className="px-4 py-10 text-center text-sm text-[color:var(--client-muted)]">
                没有可发送的名片
              </div>
            )}
          </section>
        </div>
      </ImBottomSheet>

      <ImBottomSheet onClose={() => setServicePickerOpen(false)} open={servicePickerOpen} title="发送服务">
        <div className="space-y-3 pb-2">
          <input
            className="h-11 w-full rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-surface)] px-4 text-[15px] text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
            onChange={(event) => setServiceCardQuery(event.target.value)}
            placeholder="从店铺服务列表中选择"
            value={serviceCardQuery}
          />

          <section className="max-h-[62dvh] space-y-2 overflow-y-auto rounded-[24px] bg-[color:color-mix(in_srgb,var(--client-bg)_72%,var(--client-surface)_28%)] p-2">
            {filteredServiceShareOptions.length > 0 ? (
              filteredServiceShareOptions.map((option) => (
                <button
                  className="grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-[color:var(--client-surface)] p-2 text-left"
                  key={option.service.id}
                  onClick={() => void sendServiceCard(option)}
                  type="button"
                >
                  <img alt={option.service.name} className="h-16 w-16 rounded-[18px] object-cover" src={option.service.cover} />
                  <span className="min-w-0">
                    <strong className="block truncate text-[14px] font-black text-[color:var(--client-text)]">{option.service.name}</strong>
                    <span className="mt-1 line-clamp-2 text-[11px] font-bold leading-4 text-[color:var(--client-muted)]">{option.service.summary}</span>
                    <span className="mt-1 block truncate text-[11px] font-black text-[color:var(--client-primary)]">
                      {option.provider?.name ?? "店铺服务"} · {formatServicePriceLabel(option.service)}
                    </span>
                  </span>
                  <span className="rounded-full bg-[color:var(--client-primary)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary-contrast)]">发送</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-[color:var(--client-muted)]">
                当前店铺还没有可发送服务
              </div>
            )}
          </section>
        </div>
      </ImBottomSheet>

      <ImBottomSheet
        bodyClassName="min-h-0 flex-1 overflow-visible"
        closeLabel="关闭行程邀请"
        onClose={closeScheduleInvitePicker}
        open={scheduleInvitePickerOpen}
        panelClassName="flex h-[78dvh] max-h-[calc(100dvh-72px)] flex-col bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,var(--client-bg)_10%)]"
        showCloseButton
        title={scheduleInviteEditorOpen ? "设置行程邀请" : "选择日程邀请时间"}
      >
        {scheduleInviteEditorOpen && selectedScheduleInviteForDate ? (
          <div className="flex h-full min-h-0 flex-col gap-3 pb-2" data-im-schedule-invite-editor="true">
            <section className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,var(--client-bg)_24%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.10)]">
              <input
                className="h-12 w-full !rounded-none border-b border-[color:color-mix(in_srgb,var(--client-primary)_56%,var(--client-line))] bg-transparent px-0 text-[24px] font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
                onChange={(event) => setScheduleInviteTitleInput(event.target.value)}
                placeholder="添加标题"
                value={scheduleInviteTitleInput}
              />

              <div className="grid grid-cols-[36px,minmax(0,1fr)] gap-3">
                <span className="mt-0.5 grid h-9 w-9 place-items-center text-[color:var(--client-muted)]">
                  <ImIcon name="calendar" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-black text-[color:var(--client-text)]">
                    {formatScheduleInviteEditorDate(selectedScheduleInviteForDate.date)}　{selectedScheduleInviteForDate.timeRange}
                  </p>
                  <p className="mt-1 text-[12px] font-bold text-[color:var(--client-muted)]">时区 · 不重复</p>
                </div>
              </div>

              <div className="grid grid-cols-[36px,minmax(0,1fr)] gap-3 border-y border-[color:color-mix(in_srgb,var(--client-line)_46%,transparent)] py-3">
                <span className="mt-0.5 grid h-9 w-9 place-items-center text-[color:var(--client-muted)]">
                  <ImIcon name="group" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-black text-[color:var(--client-text)]">邀请对象</p>
                    </div>
                    <button
                      aria-expanded={scheduleInviteAttendeePickerOpen}
                      aria-label="添加邀请对象"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,var(--client-surface)_86%)] text-[color:var(--client-primary)] transition active:scale-95"
                      onClick={() => setScheduleInviteAttendeePickerOpen((open) => !open)}
                      type="button"
                    >
                      <ImIcon className="h-4 w-4" name="plus" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {scheduleInviteAttendees.map((attendee) => (
                      <span
                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] px-2.5 py-1.5 text-[12px] font-black text-[color:var(--client-text)]"
                        key={attendee.id}
                      >
                        {attendee.avatar ? <img alt="" className="h-5 w-5 rounded-full object-cover" src={attendee.avatar} /> : <ImIcon className="h-3.5 w-3.5 text-[color:var(--client-muted)]" name="group" />}
                        <span className="max-w-[168px] truncate">{attendee.label}</span>
                      </span>
                    ))}
                  </div>

                  {scheduleInviteAttendeePickerOpen ? (
                    <div className="mt-3 max-h-44 space-y-2 overflow-y-auto border-t border-[color:color-mix(in_srgb,var(--client-line)_42%,transparent)] pt-3">
                      {scheduleInviteSelectableAttendees.length > 0 ? (
                        scheduleInviteSelectableAttendees.map((user) => {
                          const selected = scheduleInviteExtraAttendeeIds.includes(user.id);
                          const contactForUser = activeContactByUserId.get(user.id);
                          const captionPrefix = getShareableCardCaptionPrefix(scope, user, store.currentUserId, currentUser);
                          const caption = captionPrefix
                            ? `${captionPrefix} · ${user.signature ?? user.region ?? user.userIdLabel}`
                            : buildContactCaption(user, contactForUser) || user.userIdLabel;

                          return (
                            <button
                              className={cn(
                                "grid w-full grid-cols-[36px,minmax(0,1fr)_28px] items-center gap-3 rounded-[16px] border px-2.5 py-2 text-left transition",
                                selected
                                  ? "border-[color:color-mix(in_srgb,var(--client-primary)_54%,transparent)] bg-[color:var(--client-primary-soft)]"
                                  : "border-[color:color-mix(in_srgb,var(--client-line)_52%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_62%,transparent)]"
                              )}
                              key={user.id}
                              onClick={() => toggleScheduleInviteExtraAttendee(user.id)}
                              type="button"
                            >
                              <img alt="" className="h-9 w-9 rounded-full object-cover" src={user.avatar} />
                              <span className="min-w-0">
                                <strong className="block truncate text-[13px] font-black text-[color:var(--client-text)]">{getDisplayName(user, contactForUser)}</strong>
                                <span className="mt-0.5 block truncate text-[11px] font-bold text-[color:var(--client-muted)]">{caption}</span>
                              </span>
                              <span
                                className={cn(
                                  "grid h-7 w-7 place-items-center rounded-full border",
                                  selected
                                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                                    : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] text-[color:var(--client-muted)]"
                                )}
                              >
                                <ImIcon className="h-3.5 w-3.5" name={selected ? "check" : "plus"} />
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <p className="rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_48%,transparent)] px-3 py-3 text-center text-[12px] font-bold text-[color:var(--client-muted)]">暂无可添加对象</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-[36px,minmax(0,1fr)] gap-3">
                <span className="mt-0.5 grid h-9 w-9 place-items-center text-[color:var(--client-muted)]">
                  <ImIcon name="location" />
                </span>
                <input
                  className="h-10 min-w-0 !rounded-none border-b border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-transparent px-0 text-[15px] font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
                  onChange={(event) => setScheduleInviteLocationInput(event.target.value)}
                  placeholder="添加地点"
                  value={scheduleInviteLocationInput}
                />
              </div>

              <div className="grid grid-cols-[36px,minmax(0,1fr)] gap-3">
                <span className="mt-1 grid h-9 w-9 place-items-center text-[color:var(--client-muted)]">
                  <ImIcon name="edit" />
                </span>
                <textarea
                  className="min-h-[76px] min-w-0 resize-none rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_58%,var(--client-surface)_42%)] px-3 py-2.5 text-[14px] font-bold leading-5 text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
                  onChange={(event) => setScheduleInviteNoteInput(event.target.value)}
                  placeholder="添加说明"
                  value={scheduleInviteNoteInput}
                />
              </div>

              <div className="grid grid-cols-[36px,minmax(0,1fr)] gap-3">
                <span className="mt-0.5 grid h-9 w-9 place-items-center text-[color:var(--client-muted)]">
                  <ImIcon name="calendar" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-black text-[color:var(--client-text)]">NeeDo 日程</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SCHEDULE_INVITE_REMINDER_OPTIONS.map((option) => (
                      <button
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[11px] font-black transition",
                          scheduleInviteReminder === option
                            ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                            : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_58%,transparent)] text-[color:var(--client-muted)]"
                        )}
                        key={option}
                        onClick={() => setScheduleInviteReminder(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <div className="flex shrink-0 items-center justify-end gap-3 overflow-visible px-1.5 pb-3 pt-1">
              <button
                className="rounded-full px-4 py-2.5 text-[13px] font-black text-[color:var(--client-primary)]"
                onClick={() => setScheduleInviteEditorOpen(false)}
                type="button"
              >
                调整时间
              </button>
              <button
                className="rounded-full bg-[color:var(--client-primary)] px-5 py-2.5 text-[13px] font-black text-[color:var(--client-primary-contrast)] shadow-[0_12px_24px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]"
                onClick={() => void sendScheduleInvite(selectedScheduleInviteForDate)}
                type="button"
              >
                保存并发送
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3 pb-2">
            <section className="shrink-0 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,var(--client-bg)_24%)] p-3 shadow-[0_18px_42px_rgba(0,0,0,0.10)]">
              <div className="grid grid-cols-[40px,1fr,40px] items-center gap-2">
                <button
                  aria-label="上一周"
                  className="grid h-10 w-10 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] text-lg font-black text-[color:var(--client-text)]"
                  onClick={() => shiftScheduleInviteWeek(-1)}
                  type="button"
                >
                  ‹
                </button>
                <div className="min-w-0 text-center">
                  <strong className="block truncate text-sm font-black text-[color:var(--client-text)]">我的日程表</strong>
                  <span className="mt-0.5 block truncate text-[11px] font-bold text-[color:var(--client-muted)]">{formatLongDate(scheduleInviteDate)}</span>
                </div>
                <button
                  aria-label="下一周"
                  className="grid h-10 w-10 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] text-lg font-black text-[color:var(--client-text)]"
                  onClick={() => shiftScheduleInviteWeek(1)}
                  type="button"
                >
                  ›
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1.5">
                {scheduleInviteWeekDates.map((date) => {
                  const selected = date === scheduleInviteDate;
                  const count = scheduleInviteCountByDate.get(date) ?? 0;
                  return (
                    <button
                      className={cn(
                        "relative min-h-[58px] rounded-[16px] border px-1 py-2 text-center transition",
                        selected
                          ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                          : "border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-[color:var(--client-muted)]"
                      )}
                      key={date}
                      onClick={() => selectScheduleInviteDate(date)}
                      type="button"
                    >
                      <span className="block text-[10px] font-bold">{date === getTodayDateKey() ? "今天" : formatShortDate(date).replace("/", ".")}</span>
                      <strong className="mt-1 block text-[12px] font-black">{["日", "一", "二", "三", "四", "五", "六"][new Date(`${date}T00:00:00`).getDay()]}</strong>
                      {count > 0 ? (
                        <span className="absolute right-[-5px] top-[-5px] grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-[#ef4f3f] px-1 text-[10px] font-black text-white">
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <ImScheduleInviteTimeTable
              className="min-h-0 flex-1"
              date={scheduleInviteDate}
              hostName={scheduleInviteHostName}
              location={scheduleInviteLocation}
              onSelect={openScheduleInviteEditor}
              options={scheduleInviteDayOptions}
              selectedInvite={selectedScheduleInviteForDate}
            />
          </div>
        )}
      </ImBottomSheet>

      <ImBottomSheet onClose={() => setMediaPreview(null)} open={Boolean(mediaPreview)}>
        {mediaPreview ? (
          <div className="pb-3">
            {mediaPreview.type === "image" ? (
              <img alt={mediaPreview.ext?.fileName ?? "图片"} className="w-full rounded-[24px]" src={mediaPreview.ext?.url ?? mediaPreview.content} />
            ) : mediaPreview.type === "video" ? (
              <div className="overflow-hidden rounded-[24px] bg-black/90">
                <img alt={mediaPreview.ext?.fileName ?? "视频"} className="w-full opacity-85" src={mediaPreview.ext?.thumbnailUrl ?? mediaPreview.content} />
              </div>
            ) : null}
          </div>
        ) : null}
      </ImBottomSheet>
    </ImStandaloneShell>
  );
}

export function ImConversationInfoPage() {
  const { scope, store, config } = useImRuntime();
  const entityStore = useEntityStore();
  const social = useSocial();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const conversation = conversationId ? store.conversations.find((item) => item.id === conversationId) : undefined;
  const contact = conversation?.contactUserId ? store.contacts.find((item) => item.targetUserId === conversation.contactUserId) : undefined;
  const user = conversation?.contactUserId ? store.usersById[conversation.contactUserId] : undefined;
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(Boolean(conversation?.privacyModeEnabled));
  const [privacyCountdownInput, setPrivacyCountdownInput] = useState<GroupPrivacyCountdownInput>(() => createCountdownInput(conversation?.disappearingCountdown));
  const [privacyStartMode, setPrivacyStartMode] = useState<ConversationDisappearingStartMode>(conversation?.disappearingStartMode ?? "sent");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [conversationTagInput, setConversationTagInput] = useState("");
  const [conversationTagUiState, setConversationTagUiState] = useState<ImTagListUiState>(() => readImTagListUiState(scope));
  const toastIdRef = useRef(0);
  const [infoToast, setInfoToast] = useState<{ id: number; message: string } | null>(null);
  const infoRoleTagSet = useMemo(() => new Set(scope === "merchant" ? getMerchantOrganizationRoleTagNames() : []), [scope]);
  const privacyCountdown = useMemo(() => parseCountdownInput(privacyCountdownInput), [privacyCountdownInput]);
  const hasPrivacyCountdown = hasCountdownValue(privacyCountdown);
  const privacyCountdownSummary = formatConversationDisappearingCountdown(privacyCountdown);
  const currentGroupMember = conversation && store.currentUserId
    ? getConversationMember({ members: store.members }, conversation.id, store.currentUserId)
    : undefined;
  const isGroupOwner = currentGroupMember?.role === "owner";
  const canManageGroupPrivacy = isGroupOwner;
  const canEditGroupTitle = isGroupOwner || (conversation?.titleEditPolicy ?? "owner") === "members";
  const canEditGroupAnnouncement = isGroupOwner || (conversation?.announcementEditPolicy ?? "owner") === "members";
  const [groupTitleInput, setGroupTitleInput] = useState(conversation?.title ?? "");
  const [groupAnnouncementInput, setGroupAnnouncementInput] = useState(conversation?.announcement ?? "");
  const [groupNicknameInput, setGroupNicknameInput] = useState(currentGroupMember?.nicknameInGroup ?? conversation?.nicknameInGroup ?? "");
  const [groupTitleEditPolicy, setGroupTitleEditPolicy] = useState<GroupInfoEditPolicy>(conversation?.titleEditPolicy ?? "owner");
  const [groupAnnouncementEditPolicy, setGroupAnnouncementEditPolicy] = useState<GroupInfoEditPolicy>(conversation?.announcementEditPolicy ?? "owner");
  const rawSelectedInfoTags = mergeImTags(contact ? contact.tags : conversation?.tags ?? []);
  const selectedInfoTags = rawSelectedInfoTags.filter((tag) => !matchesMerchantOrganizationRoleTag(tag, infoRoleTagSet));
  const selectedInfoTagSet = new Set(selectedInfoTags);
  const normalizedConversationTagInput = normalizeImTagName(conversationTagInput);
  const canAddConversationTag = isValidImTagName(normalizedConversationTagInput) && !selectedInfoTagSet.has(normalizedConversationTagInput) && !matchesMerchantOrganizationRoleTag(normalizedConversationTagInput, infoRoleTagSet);
  const visibleInfoContacts = useMemo(() => getVisibleImContacts(store, scope), [scope, store.contacts, store.usersById]);
  const availableInfoTags = useMemo(() => {
    const selectedSet = new Set(selectedInfoTags);
    const counts = new Map(buildManagedTagCounts(visibleInfoContacts, conversationTagUiState, store.conversations, Array.from(infoRoleTagSet)));

    selectedInfoTags.forEach((tag) => {
      if (!counts.has(tag)) {
        counts.set(tag, 0);
      }
    });

    return Array.from(counts.entries())
      .filter(([tag]) => !conversationTagUiState.hiddenTags.includes(tag) || selectedSet.has(tag))
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-Hans-CN"));
  }, [conversationTagUiState, infoRoleTagSet, selectedInfoTags, store.conversations, visibleInfoContacts]);

  const showInfoToast = (message: string) => {
    toastIdRef.current += 1;
    setInfoToast({ id: toastIdRef.current, message });
  };

  useEffect(() => {
    if (conversationId) {
      void store.loadConversation(conversationId).catch((error: unknown) => {
        if (isConversationNotFoundError(error)) {
          navigate(config.routes.messages, { replace: true });
          return;
        }

        throw error;
      });
    }
  }, [config.routes.messages, conversationId, navigate]);

  useEffect(() => {
    if (!conversation) {
      return;
    }

    setPrivacyModeEnabled(Boolean(conversation.privacyModeEnabled));
    setPrivacyCountdownInput(createCountdownInput(conversation.disappearingCountdown));
    setPrivacyStartMode(conversation.disappearingStartMode ?? "sent");
  }, [conversation?.id]);

  useEffect(() => {
    if (!conversation) {
      return;
    }

    setGroupTitleInput(conversation.title);
    setGroupAnnouncementInput(conversation.announcement ?? "");
    setGroupNicknameInput(currentGroupMember?.nicknameInGroup ?? conversation.nicknameInGroup ?? "");
    setGroupTitleEditPolicy(conversation.titleEditPolicy ?? "owner");
    setGroupAnnouncementEditPolicy(conversation.announcementEditPolicy ?? "owner");
  }, [conversation?.id, currentGroupMember?.id]);

  useEffect(() => {
    setConversationTagUiState(readImTagListUiState(scope));
  }, [scope]);

  useEffect(() => {
    writeImTagListUiState(scope, conversationTagUiState);
  }, [scope, conversationTagUiState]);

  useEffect(() => {
    if (!infoToast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setInfoToast((current) => (current?.id === infoToast.id ? null : current));
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [infoToast]);

  const updatePrivacyCountdownInput = (field: GroupPrivacyCountdownField, value: string) => {
    setPrivacyCountdownInput((current) => ({
      ...current,
      [field]: sanitizeCountdownInputValue(field, value)
    }));
  };

  const savePrivacySettings = async () => {
    if (!conversation || conversation.type !== "group") {
      return;
    }

    if (!canManageGroupPrivacy) {
      showInfoToast("只有群主可以开启或关闭隐私模式");
      return;
    }

    if (privacyModeEnabled && !hasPrivacyCountdown) {
      showInfoToast("请先设置消失倒计时");
      return;
    }

    await store.updateConversationPrivacy(
      conversation.id,
      privacyModeEnabled
        ? {
            privacyModeEnabled: true,
            disappearingCountdown: privacyCountdown,
            disappearingStartMode: privacyStartMode
          }
        : {
            privacyModeEnabled: false
          }
    );
    showInfoToast("隐私模式设置已保存");
  };

  const saveGroupInfoSettings = async () => {
    if (!conversation || conversation.type !== "group") {
      return;
    }

    if (canEditGroupTitle && !groupTitleInput.trim()) {
      showInfoToast("群名称不能为空");
      return;
    }

    await store.updateConversationGroupInfo(conversation.id, {
      title: canEditGroupTitle ? groupTitleInput : undefined,
      announcement: canEditGroupAnnouncement ? groupAnnouncementInput : undefined,
      nicknameInGroup: groupNicknameInput,
      titleEditPolicy: isGroupOwner ? groupTitleEditPolicy : undefined,
      announcementEditPolicy: isGroupOwner ? groupAnnouncementEditPolicy : undefined
    });
    showInfoToast("群资料设置已保存");
  };

  const saveInfoTags = async (nextTags: string[]) => {
    if (!conversation) {
      return;
    }

    try {
      const preservedRoleTags = contact ? contact.tags.filter((tag) => matchesMerchantOrganizationRoleTag(tag, infoRoleTagSet)) : [];
      const tags = mergeImTags([...preservedRoleTags, ...nextTags]);

      if (contact) {
        await store.updateContactTags(contact.id, tags);
      } else {
        await store.updateConversationTags(conversation.id, tags);
      }

      showInfoToast("标签已更新");
    } catch {
      showInfoToast("标签保存失败，请稍后再试");
    }
  };

  const toggleInfoTag = (tag: string) => {
    const normalized = normalizeImTagName(tag);

    if (!normalized) {
      return;
    }

    const nextTags = selectedInfoTagSet.has(normalized)
      ? selectedInfoTags.filter((item) => item !== normalized)
      : [...selectedInfoTags, normalized];

    void saveInfoTags(nextTags);
  };

  const addInfoTag = () => {
    if (!canAddConversationTag) {
      return;
    }

    setConversationTagUiState((current) => addCustomImTag(current, normalizedConversationTagInput));
    setConversationTagInput("");
    void saveInfoTags([...selectedInfoTags, normalizedConversationTagInput]);
  };

  if (!conversation || !conversationId) {
    return (
      <ImStandaloneShell>
        <ImTopBar onBack={() => navigate(-1)} title="信息设置" />
        <ImEmptyState caption="会话信息还没同步完成。" title="暂无聊天信息" />
      </ImStandaloneShell>
    );
  }

  const members = store.members
    .filter((member) => member.conversationId === conversation.id)
    .map((member) => ({ member, user: store.usersById[member.userId] }))
    .filter((item): item is { member: typeof item.member; user: ImUser } => Boolean(item.user));
  const groupOwner = members.find(({ member }) => member.role === "owner");
  const groupOwnerDisplayName = groupOwner ? groupOwner.member.nicknameInGroup ?? groupOwner.user.nickname : "";
  const groupOwnerProfilePath = groupOwner ? resolveImProfilePath(scope, groupOwner.user) : undefined;
  const infoCardProfileRef = user ? resolveContactCardProfileRef(buildContactCardPayload(user), user) : undefined;
  const infoCardDetailTo = user
    ? resolveImProfilePath(scope, user) ?? (infoCardProfileRef ? getScopedProfileDetailPath(scope, infoCardProfileRef.entityType, infoCardProfileRef.id) : undefined)
    : undefined;
  const infoCardClassName = "w-full shadow-[0_18px_44px_color-mix(in_srgb,var(--client-shadow)_24%,transparent)]";
  const infoCardActionLabel = contact ? "好友" : "关注";
  const infoMiniCard = (() => {
    if (!user || !infoCardProfileRef) {
      return undefined;
    }

    if (infoCardProfileRef.entityType === "shop") {
      const shop = entityStore.stores.find((item) => item.id === infoCardProfileRef.id);
      return shop ? <SocialProfileMiniCard actionLabel={infoCardActionLabel} className={infoCardClassName} detailTo={infoCardDetailTo} store={shop} /> : undefined;
    }

    if (infoCardProfileRef.entityType === "technician") {
      const technician = entityStore.technicians.find((item) => item.id === infoCardProfileRef.id);
      return technician ? <SocialProfileMiniCard actionLabel={infoCardActionLabel} className={infoCardClassName} detailTo={infoCardDetailTo} technician={technician} /> : undefined;
    }

    const customer = entityStore.customers.find((item) => item.id === infoCardProfileRef.id);
    return customer ? <SocialProfileMiniCard actionLabel={infoCardActionLabel} className={infoCardClassName} customer={customer} detailTo={infoCardDetailTo} /> : undefined;
  })();
  const socialScope = scope as SocialPortalScope;
  const infoSocialProfileKey = infoCardProfileRef ? profileKey(infoCardProfileRef) : undefined;
  const infoSocialProfile = infoSocialProfileKey ? social.profiles[infoSocialProfileKey] : undefined;
  const infoSocialProfileTo = infoCardProfileRef && infoSocialProfile ? socialPaths.profile(socialScope, infoCardProfileRef) : undefined;
  const infoSocialActorKey = social.getActorForScope(socialScope);
  const infoSocialPreviewMedia = infoSocialProfileKey && infoSocialProfile
    ? social.getProfilePosts(infoSocialProfileKey, "media", infoSocialActorKey).flatMap((post) => post.media).slice(0, 5)
    : [];

  return (
    <ImStandaloneShell>
      <div className="contents">
        <header className="safe-header-top fixed inset-x-0 top-0 z-40 border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_94%,transparent)] backdrop-blur-xl">
          <FloatingBackButton onClick={() => navigate(-1)} />
          <div className="mx-auto flex h-[60px] w-full max-w-[880px] items-center px-4">
            <div className="min-w-0 pl-[56px] pr-[56px] sm:pl-[60px] sm:pr-[60px]">
              <h1 className="truncate text-[20px] font-black tracking-[-0.02em] text-[color:var(--client-text)]">信息设置</h1>
            </div>
          </div>
        </header>
        <div aria-hidden="true" className="h-[calc(env(safe-area-inset-top)+5.75rem)]" />
      </div>
      <div className="space-y-4 px-4 py-4">
        {infoMiniCard ?? (user ? <ContactSummaryCard contact={contact} detailTo={infoCardDetailTo} showTags={false} user={user} /> : null)}
        {infoSocialProfileTo ? <ImContactMomentsEntry media={infoSocialPreviewMedia} to={infoSocialProfileTo} /> : null}

        <section className="rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-5 py-4 shadow-[0_18px_44px_color-mix(in_srgb,var(--client-shadow)_18%,transparent)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-black text-[color:var(--client-text)]">标签</h2>
            <button
              aria-label="添加标签"
              className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)] text-[color:var(--client-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_22%,transparent)]"
              onClick={() => setTagPickerOpen(true)}
              title="添加标签"
              type="button"
            >
              <ImIcon className="h-5 w-5" name="edit" />
            </button>
          </div>
          {selectedInfoTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedInfoTags.map((tag) => (
                <button
                  aria-label={`移除标签${tag}`}
                  className="focus-ring inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-3 text-sm font-black text-[color:var(--client-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_22%,transparent)]"
                  key={tag}
                  onClick={() => void saveInfoTags(selectedInfoTags.filter((item) => item !== tag))}
                  type="button"
                >
                  <span className="truncate">{tag}</span>
                  <span aria-hidden="true" className="text-base leading-none">×</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-[color:var(--client-muted)]">还没有添加标签</p>
          )}
        </section>

        {conversation.type === "group" ? (
          <section className="rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-5 py-4 shadow-[0_18px_44px_color-mix(in_srgb,var(--client-shadow)_18%,transparent)]">
            <div className="space-y-4">
              {groupOwner ? (
                <div className="border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] pb-4">
                  <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_66%,var(--client-surface))] px-4 py-3">
                    <span className="shrink-0 text-sm font-bold text-[color:var(--client-muted)]">群主</span>
                    <div className="min-w-0 flex items-center gap-2 text-right">
                      <InteractiveAvatar
                        alt={groupOwnerDisplayName}
                        className="h-8 w-8"
                        src={groupOwner.user.avatar}
                        to={groupOwnerProfilePath}
                      />
                      {groupOwnerProfilePath ? (
                        <Link
                          className="truncate text-sm font-black text-[color:var(--client-text)]"
                          to={groupOwnerProfilePath}
                        >
                          {groupOwnerDisplayName}
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-black text-[color:var(--client-text)]">{groupOwnerDisplayName}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <label
                className={cn(
                  "block",
                  isGroupOwner ? "" : "border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] pb-4"
                )}
              >
                <span className="mb-2 block text-sm font-bold text-[color:var(--client-muted)]">群名称</span>
                <input
                  className="h-11 w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,var(--client-surface))] px-4 text-[15px] font-black text-[color:var(--client-text)] outline-none transition placeholder:text-[color:color-mix(in_srgb,var(--client-muted)_56%,transparent)] focus:border-[color:var(--client-primary)] disabled:opacity-55"
                  disabled={!canEditGroupTitle}
                  onChange={(event) => setGroupTitleInput(event.target.value)}
                  placeholder="请输入群名称"
                  value={groupTitleInput}
                />
                {!canEditGroupTitle ? <p className="mt-2 text-xs font-semibold text-[color:var(--client-muted)]">群主未开放编辑</p> : null}
              </label>

              {isGroupOwner ? (
                <div className="border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] pb-4">
                  <p className="mb-2 text-xs font-black text-[color:var(--client-muted)]">群名编辑权限</p>
                  <div className="grid grid-cols-2 gap-2 rounded-full bg-[color:color-mix(in_srgb,var(--client-bg)_62%,transparent)] p-1">
                    {([
                      ["owner", "仅群主可编辑"],
                      ["members", "所有成员可编辑"]
                    ] as Array<[GroupInfoEditPolicy, string]>).map(([value, label]) => {
                      const active = groupTitleEditPolicy === value;

                      return (
                        <button
                          aria-pressed={active}
                          className={cn(
                            "min-h-10 rounded-full px-3 text-xs font-black transition",
                            active
                              ? "bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                              : "text-[color:var(--client-muted)]"
                          )}
                          key={value}
                          onClick={() => setGroupTitleEditPolicy(value)}
                          type="button"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <label
                className={cn(
                  "block",
                  isGroupOwner ? "" : "border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] pb-4"
                )}
              >
                <span className="mb-2 block text-sm font-bold text-[color:var(--client-muted)]">群公告</span>
                <textarea
                  className="min-h-[92px] w-full resize-none rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,var(--client-surface))] px-4 py-3 text-[15px] font-semibold leading-6 text-[color:var(--client-text)] outline-none transition placeholder:text-[color:color-mix(in_srgb,var(--client-muted)_56%,transparent)] focus:border-[color:var(--client-primary)] disabled:opacity-55"
                  disabled={!canEditGroupAnnouncement}
                  onChange={(event) => setGroupAnnouncementInput(event.target.value)}
                  placeholder="暂未设置群公告"
                  value={groupAnnouncementInput}
                />
                {!canEditGroupAnnouncement ? <p className="mt-2 text-xs font-semibold text-[color:var(--client-muted)]">群主未开放编辑</p> : null}
              </label>

              {isGroupOwner ? (
                <div className="border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] pb-4">
                  <p className="mb-2 text-xs font-black text-[color:var(--client-muted)]">群公告编辑权限</p>
                  <div className="grid grid-cols-2 gap-2 rounded-full bg-[color:color-mix(in_srgb,var(--client-bg)_62%,transparent)] p-1">
                    {([
                      ["owner", "仅群主可编辑"],
                      ["members", "所有成员可编辑"]
                    ] as Array<[GroupInfoEditPolicy, string]>).map(([value, label]) => {
                      const active = groupAnnouncementEditPolicy === value;

                      return (
                        <button
                          aria-pressed={active}
                          className={cn(
                            "min-h-10 rounded-full px-3 text-xs font-black transition",
                            active
                              ? "bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                              : "text-[color:var(--client-muted)]"
                          )}
                          key={value}
                          onClick={() => setGroupAnnouncementEditPolicy(value)}
                          type="button"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-[color:var(--client-muted)]">我的群昵称</span>
                <input
                  className="h-11 w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,var(--client-surface))] px-4 text-[15px] font-black text-[color:var(--client-text)] outline-none transition placeholder:text-[color:color-mix(in_srgb,var(--client-muted)_56%,transparent)] focus:border-[color:var(--client-primary)]"
                  onChange={(event) => setGroupNicknameInput(event.target.value)}
                  placeholder="未设置"
                  value={groupNicknameInput}
                />
                <p className="mt-2 text-xs font-semibold text-[color:var(--client-muted)]">只有你自己可以修改自己的群昵称。</p>
              </label>

              <div>
                <button
                  className="focus-ring inline-flex h-11 w-full items-center justify-center rounded-full bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--pin-badge-glyph)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] transition disabled:cursor-not-allowed disabled:bg-[color:color-mix(in_srgb,var(--client-line)_70%,var(--client-surface))] disabled:text-[color:var(--client-muted)] disabled:shadow-none"
                  onClick={() => void saveGroupInfoSettings()}
                  type="button"
                >
                  保存群资料
                </button>
              </div>
            </div>

            <div className="mt-5 border-t border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] pt-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[color:var(--client-text)]">隐私模式</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">
                    {!canManageGroupPrivacy
                      ? "只有群主可以开启或关闭隐私模式"
                      : privacyModeEnabled
                        ? privacyCountdownSummary
                          ? `${privacyCountdownSummary}后对话消失 · ${formatDisappearingStartModeLabel(privacyStartMode)}`
                          : "开启后需设置对话消失倒计时"
                      : "关闭后，新消息按普通聊天保留"}
                  </p>
                </div>
                <ToggleSwitch
                  ariaLabel="是否开启隐私模式"
                  checked={privacyModeEnabled}
                  disabled={!canManageGroupPrivacy}
                  onChange={setPrivacyModeEnabled}
                  size="md"
                />
              </div>

              {privacyModeEnabled ? (
                <>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {groupPrivacyCountdownLabels.map(({ field, label }) => (
                      <label className="min-w-0" key={field}>
                        <span className="mb-1 block text-center text-[11px] font-black text-[color:var(--client-muted)]">{label}</span>
                        <input
                          aria-label={`对话消失倒计时${label}`}
                          className="h-10 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,var(--client-surface))] px-2 text-center text-[15px] font-black text-[color:var(--client-text)] outline-none transition placeholder:text-[color:color-mix(in_srgb,var(--client-muted)_54%,transparent)] focus:border-[color:var(--client-primary)] disabled:cursor-not-allowed disabled:opacity-55"
                          disabled={!canManageGroupPrivacy}
                          inputMode="numeric"
                          min={0}
                          max={groupPrivacyCountdownLimits[field]}
                          onChange={(event) => updatePrivacyCountdownInput(field, event.target.value)}
                          placeholder="0"
                          type="text"
                          value={privacyCountdownInput[field]}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-full bg-[color:color-mix(in_srgb,var(--client-bg)_62%,transparent)] p-1">
                    {groupPrivacyStartModeOptions.map((option) => {
                      const active = privacyStartMode === option.value;

                      return (
                        <button
                          aria-pressed={active}
                          className={cn(
                            "min-h-11 rounded-full px-3 text-center transition",
                            active
                              ? "bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                              : "text-[color:var(--client-muted)]",
                            "disabled:cursor-not-allowed disabled:opacity-55"
                          )}
                          disabled={!canManageGroupPrivacy}
                          key={option.value}
                          onClick={() => setPrivacyStartMode(option.value)}
                          type="button"
                        >
                          <span className="block text-xs font-black">{option.label}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold opacity-75">{option.caption}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">隐私模式以外发送的信息不会被加入消失倒计时。</p>
              )}

              <div className="mt-4">
                <button
                  className="focus-ring inline-flex h-10 w-full items-center justify-center rounded-full bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--pin-badge-glyph)] transition disabled:cursor-not-allowed disabled:bg-[color:color-mix(in_srgb,var(--client-line)_70%,var(--client-surface))] disabled:text-[color:var(--client-muted)]"
                  disabled={!canManageGroupPrivacy || (privacyModeEnabled && !hasPrivacyCountdown)}
                  onClick={() => void savePrivacySettings()}
                  type="button"
                >
                  {!canManageGroupPrivacy ? "仅群主可保存隐私设置" : privacyModeEnabled && !hasPrivacyCountdown ? "请设置消失倒计时" : "保存隐私设置"}
                </button>
              </div>
            </div>
            <div className="pt-3">
              <p className="mb-3 text-sm text-[color:var(--client-muted)]">群成员</p>
              <div className="grid grid-cols-5 gap-3">
                {members.map(({ member, user }) => (
                  <div className="text-center" key={member.id}>
                    <InteractiveAvatar alt={member.nicknameInGroup ?? user.nickname} className="mx-auto h-12 w-12" src={user.avatar} to={resolveImProfilePath(scope, user)} />
                    <p className="mt-2 truncate text-[11px] text-[color:var(--client-muted)]">{member.nicknameInGroup ?? user.nickname}</p>
                    {member.role === "owner" ? (
                      <p className="mx-auto mt-1 w-fit rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] px-2 py-0.5 text-[10px] font-black text-[color:var(--client-primary)]">
                        群主
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <ToggleRow caption="关闭后会话仍会更新，但不再弹出打扰提醒。" checked={conversation.isMuted} onChange={(next) => void store.muteConversation(conversation.id, next)} title="消息免打扰" />
        <ToggleRow caption="置顶后会优先固定在会话列表顶部。" checked={conversation.isPinned} onChange={(next) => void store.pinConversation(conversation.id, next)} title="置顶聊天" />

        <section className="overflow-hidden rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] shadow-[0_18px_44px_color-mix(in_srgb,var(--client-shadow)_18%,transparent)]">
          <Link className="block border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] px-5 py-4 text-[15px] text-[color:var(--client-text)]" to={appendQuery(config.routes.search, { conversationId: conversation.id })}>查找聊天内容</Link>
          <Link className="block border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] px-5 py-4 text-[15px] text-[color:var(--client-text)]" to={config.routes.conversationMedia(conversation.id)}>媒体、文件、链接</Link>
          <button className="block w-full border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] px-5 py-4 text-left text-[15px] text-[color:var(--client-text)]" onClick={() => void store.clearConversation(conversation.id)} type="button">清空聊天记录</button>
          {conversation.type === "group" ? (
            <button className="block w-full px-5 py-4 text-left text-[15px] text-[#ef4f3f]" onClick={() => void store.removeConversationMember(conversation.id, store.currentUserId ?? "")} type="button">
              退出群聊
            </button>
          ) : (
            <>
              {contact && config.messageActionConfig.detailToggles.includes("blacklist") ? (
                <button className="block w-full border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] px-5 py-4 text-left text-[15px] text-[color:var(--client-text)]" onClick={() => void store.blockContact(contact.id)} type="button">
                  加入黑名单
                </button>
              ) : null}
              {contact && config.messageActionConfig.detailToggles.includes("deleteContact") ? (
                <button className="block w-full px-5 py-4 text-left text-[15px] text-[#ef4f3f]" onClick={() => void store.deleteContact(contact.id)} type="button">
                  删除联系人
                </button>
              ) : null}
            </>
          )}
        </section>
      </div>
      <ImBottomSheet onClose={() => setTagPickerOpen(false)} open={tagPickerOpen} title="添加标签">
        <div className="space-y-4 pb-2">
          {availableInfoTags.length > 0 ? (
            <div className="flex max-h-[34dvh] flex-wrap gap-2 overflow-y-auto pr-1">
              {availableInfoTags.map(([tag, count]) => {
                const active = selectedInfoTagSet.has(tag);

                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "focus-ring inline-flex h-10 max-w-full items-center gap-2 rounded-full px-3.5 text-sm font-black transition",
                      active
                        ? "bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                        : "bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,var(--client-surface))] text-[color:var(--client-text)] hover:bg-[color:color-mix(in_srgb,var(--client-primary)_14%,var(--client-surface))]"
                    )}
                    key={tag}
                    onClick={() => toggleInfoTag(tag)}
                    type="button"
                  >
                    <span className="truncate">{tag}</span>
                    {count > 0 ? <span className="text-xs opacity-70">{count}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-[20px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-5 text-center text-sm font-semibold text-[color:var(--client-muted)]">
              暂无可选标签
            </p>
          )}

          <div className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-surface)] px-4 py-3 text-[15px] text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
              onChange={(event) => setConversationTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  addInfoTag();
                }
              }}
              placeholder="新建标签"
              type="text"
              value={conversationTagInput}
            />
            <Button disabled={!canAddConversationTag} onClick={addInfoTag}>添加</Button>
          </div>
        </div>
      </ImBottomSheet>
      {infoToast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] z-50 flex justify-center px-4">
          <div className="w-[calc(100vw-32px)] max-w-[420px] rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,var(--client-surface))] px-5 py-3 text-center text-sm font-black text-[color:var(--client-text)] shadow-[0_18px_44px_color-mix(in_srgb,var(--client-shadow)_28%,transparent)] backdrop-blur-xl">
            {infoToast.message}
          </div>
        </div>
      ) : null}
    </ImStandaloneShell>
  );
}

export function ImMediaRecordsPage() {
  const { store } = useImRuntime();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [activeTab, setActiveTab] = useState<"media" | "files" | "links">("media");
  const [preview, setPreview] = useState<ConversationMessage | null>(null);

  useEffect(() => {
    if (conversationId) {
      void store.loadMessages(conversationId, { reset: true, limit: 120 });
    }
  }, [conversationId]);

  if (!conversationId) {
    return null;
  }

  const databaseLike = {
    currentUserId: store.currentUserId ?? "",
    config: store.config ?? {
      allowStrangerMessaging: true,
      preserveConversationAfterDelete: true,
      recallWindowMs: 120_000,
      separatorThresholdMs: 300_000,
      syncDraftAcrossDevices: false
    },
    users: store.users,
    contacts: store.contacts,
    friendRequests: store.friendRequests,
    conversations: store.conversations,
    members: store.members,
    messages: getConversationMessages(store, conversationId),
    attachments: [],
    readCursors: [],
    messageCampaigns: [],
    messageCampaignRecipients: []
  };
  const buckets = buildMediaBuckets(databaseLike, conversationId);

  return (
    <ImStandaloneShell>
      <ImTopBar onBack={() => navigate(-1)} title="媒体、文件、链接" />
      <div className="space-y-4 px-4 py-4">
        <div className="grid grid-cols-3 gap-2 rounded-[24px] bg-white p-2 shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
          {[
            ["media", "媒体"],
            ["files", "文件"],
            ["links", "链接"]
          ].map(([value, label]) => (
            <button
              className={cn("rounded-2xl px-3 py-3 text-sm", activeTab === value ? "bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)]" : "text-[color:var(--client-muted)]")}
              key={value}
              onClick={() => setActiveTab(value as "media" | "files" | "links")}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "media" ? (
          <div className="grid grid-cols-3 gap-2">
            {buckets.media.map((message) => (
              <button className="overflow-hidden rounded-[18px] bg-white" key={message.id} onClick={() => setPreview(message)} type="button">
                <img alt={message.ext?.fileName ?? "媒体"} className="aspect-square w-full object-cover" src={message.ext?.thumbnailUrl ?? message.content} />
              </button>
            ))}
          </div>
        ) : null}

        {activeTab === "files" ? (
          <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
            {buckets.files.map((message) => (
              <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3 last:border-b-0" key={message.id}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f5f5f5]">
                  <ImIcon name="file" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{message.ext?.fileName ?? "未命名文件"}</p>
                  <p className="mt-1 text-xs text-ink/42">{message.ext?.fileSize ? `${Math.round(message.ext.fileSize / 1000)} KB` : "未知大小"}</p>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {activeTab === "links" ? (
          <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
            {buckets.links.map((message) => (
              <div className="border-b border-black/5 px-4 py-3 last:border-b-0" key={message.id}>
                <p className="truncate text-sm text-[#1f6f4d]">{message.content.match(/https?:\/\/[^\s]+/i)?.[0] ?? message.content}</p>
                <p className="mt-1 text-xs text-ink/42">{message.content}</p>
              </div>
            ))}
          </section>
        ) : null}
      </div>

      <ImBottomSheet onClose={() => setPreview(null)} open={Boolean(preview)}>
        {preview ? <img alt={preview.ext?.fileName ?? "媒体"} className="w-full rounded-[24px]" src={preview.ext?.url ?? preview.content} /> : null}
      </ImBottomSheet>
    </ImStandaloneShell>
  );
}

export function ImNewConversationPage() {
  const { scope, store, config } = useImRuntime();
  const { actions: dineInActions } = useDineInStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const isGroupMode = mode === "group";
  const isFriendMode = mode === "friend";
  const isCollectMode = mode === "collect";
  const isScanMode = mode === "scan";
  const pageTitle = isGroupMode
    ? "发起群聊"
    : isFriendMode
      ? "添加好友"
      : isCollectMode
        ? "发起收款"
        : isScanMode
          ? "扫一扫"
          : mode === "forward"
            ? "选择聊天"
            : "新建聊天";
  const groupSourceConversationId = isGroupMode ? searchParams.get("from") : null;
  const forwardMessageId = searchParams.get("messageId");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(false);
  const [privacyCountdownInput, setPrivacyCountdownInput] = useState<GroupPrivacyCountdownInput>(defaultGroupPrivacyCountdownInput);
  const [privacyStartMode, setPrivacyStartMode] = useState<ConversationDisappearingStartMode>("sent");
  const [selectedCollectUserId, setSelectedCollectUserId] = useState<string | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [scannedUserId, setScannedUserId] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState("qr-table-a08");
  const [scanError, setScanError] = useState<string | null>(null);
  const [myQrPurpose, setMyQrPurpose] = useState<MyQrCodePurpose>("friend");
  const contacts = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase();
    return store.contacts.filter((contact) => {
      if (!isContactVisibleForRole(scope, store.usersById[contact.targetUserId], contact) || contact.isBlocked) {
        return false;
      }

      const user = store.usersById[contact.targetUserId];

      if (!user) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [getDisplayName(user, contact), user.userIdLabel, ...user.searchableFields].some((field) => field.toLowerCase().includes(keyword));
    });
  }, [deferredQuery, store.contacts, store.usersById]);
  const groupedContacts = useMemo(
    () => buildContactSections({ users: store.users, contacts }),
    [contacts, store.users]
  );
  const activeContactUserIds = useMemo(
    () => new Set(store.contacts.filter((contact) => contact.relationStatus === "active" && !contact.isBlocked).map((contact) => contact.targetUserId)),
    [store.contacts]
  );
  const selectableGroupContactUserIds = useMemo(() => {
    return new Set(
      store.contacts
        .filter((contact) => {
          const user = store.usersById[contact.targetUserId];

          return Boolean(user) && contact.relationStatus === "active" && !contact.isBlocked && isContactVisibleForRole(scope, user, contact);
        })
        .map((contact) => contact.targetUserId)
    );
  }, [scope, store.contacts, store.usersById]);
  const availableFriendCandidates = useMemo(() => store.users.filter((user) => {
    if (user.id === store.currentUserId || user.serviceAccount) {
      return false;
    }

    if (!isProfileSearchableForRole(scope, user)) {
      return false;
    }

    return !activeContactUserIds.has(user.id);
  }), [activeContactUserIds, scope, store.currentUserId, store.users]);
  const filteredFriendCandidates = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase();

    return availableFriendCandidates.filter((user) =>
      !keyword || [user.nickname, user.userIdLabel, ...user.searchableFields].some((field) => field.toLowerCase().includes(keyword))
    );
  }, [availableFriendCandidates, deferredQuery]);
  const collectAmountValue = Number(collectAmount.replace(/[^\d]/g, ""));
  const canSubmitCollection = Boolean(selectedCollectUserId && Number.isFinite(collectAmountValue) && collectAmountValue > 0);
  const privacyCountdown = useMemo(() => parseCountdownInput(privacyCountdownInput), [privacyCountdownInput]);
  const hasPrivacyCountdown = hasCountdownValue(privacyCountdown);
  const canCreateGroup = selectedIds.length > 0 && (!privacyModeEnabled || hasPrivacyCountdown);
  const privacyCountdownSummary = formatConversationDisappearingCountdown(privacyCountdown);
  const visibleIndexLetters = useMemo(() => getVisibleIndexLetters(groupedContacts, { includeSymbolFallback: true }), [groupedContacts]);
  const sectionRefs = useRef<Partial<Record<ContactIndexLetter, HTMLDivElement | null>>>({});
  const indexBarRef = useRef<HTMLDivElement | null>(null);
  const indexClearTimerRef = useRef<number | null>(null);
  const activeDragLetterRef = useRef<ContactIndexLetter | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const groupSourceSelectionRef = useRef<string | null>(null);
  const [activeIndexLetter, setActiveIndexLetter] = useState<ContactIndexLetter | null>(null);
  const scannedUser = scannedUserId
    ? availableFriendCandidates.find((user) => user.id === scannedUserId) ?? null
    : null;
  const indexLetterClassName = visibleIndexLetters.length > 18
    ? "h-3.5 text-[9px] leading-[14px]"
    : visibleIndexLetters.length > 12
      ? "h-4 text-[10px] leading-4"
      : "h-5 text-[11px] leading-5";

  useEffect(() => () => {
    if (indexClearTimerRef.current !== null) {
      window.clearTimeout(indexClearTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isGroupMode) {
      groupSourceSelectionRef.current = null;
      return;
    }

    if (!groupSourceConversationId || groupSourceSelectionRef.current === groupSourceConversationId) {
      return;
    }

    const sourceConversation = store.conversations.find((conversation) => conversation.id === groupSourceConversationId);

    if (!sourceConversation) {
      return;
    }

    const sourceMemberIds = sourceConversation.contactUserId ? [sourceConversation.contactUserId] : sourceConversation.memberIds;
    const nextSelectedIds = sourceMemberIds.filter(
      (userId) => userId !== store.currentUserId && selectableGroupContactUserIds.has(userId)
    );

    if (nextSelectedIds.length === 0) {
      return;
    }

    groupSourceSelectionRef.current = groupSourceConversationId;
    setSelectedIds((current) => Array.from(new Set([...nextSelectedIds, ...current])));
  }, [groupSourceConversationId, isGroupMode, selectableGroupContactUserIds, store.conversations, store.currentUserId]);

  const clearIndexHighlight = () => {
    if (indexClearTimerRef.current !== null) {
      window.clearTimeout(indexClearTimerRef.current);
      indexClearTimerRef.current = null;
    }
  };

  const scheduleIndexHighlightClear = () => {
    clearIndexHighlight();
    indexClearTimerRef.current = window.setTimeout(() => {
      setActiveIndexLetter(null);
      indexClearTimerRef.current = null;
    }, 420);
  };

  const scrollToIndexLetter = (
    letter: ContactIndexLetter,
    {
      behavior = "smooth",
      keepHighlight = false,
      dedupeDrag = false
    }: {
      behavior?: ScrollBehavior;
      keepHighlight?: boolean;
      dedupeDrag?: boolean;
    } = {}
  ) => {
    if (dedupeDrag && activeDragLetterRef.current === letter) {
      return;
    }

    activeDragLetterRef.current = keepHighlight ? letter : null;
    clearIndexHighlight();
    setActiveIndexLetter(letter);

    const fallbackLetter = letter === "#" ? groupedContacts.at(-1)?.letter : undefined;
    const targetSection = sectionRefs.current[letter] ?? (fallbackLetter ? sectionRefs.current[fallbackLetter] : undefined);
    targetSection?.scrollIntoView({ behavior, block: "start" });

    if (!keepHighlight) {
      scheduleIndexHighlightClear();
    }
  };

  const resolveIndexLetterFromPointer = (clientY: number) => {
    const container = indexBarRef.current;

    if (!container || visibleIndexLetters.length === 0) {
      return null;
    }

    const rect = container.getBoundingClientRect();
    return resolveIndexLetterFromTouchY(clientY, rect.top, rect.height / visibleIndexLetters.length, visibleIndexLetters);
  };

  const finishIndexDrag = (pointerId?: number, releaseTarget?: HTMLDivElement | null) => {
    if (pointerId !== undefined && releaseTarget?.hasPointerCapture(pointerId)) {
      releaseTarget.releasePointerCapture(pointerId);
    }

    activePointerIdRef.current = null;
    activeDragLetterRef.current = null;
    clearIndexHighlight();
    setActiveIndexLetter(null);
  };

  const toggleSelectedContact = (userId: string) => {
    setSelectedIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId]
    );
  };

  const updatePrivacyCountdownInput = (field: GroupPrivacyCountdownField, value: string) => {
    setPrivacyCountdownInput((current) => ({
      ...current,
      [field]: sanitizeCountdownInputValue(field, value)
    }));
  };

  const addFriendAndOpen = async (userId: string) => {
    await store.addContact(userId, "聊天页添加好友", "通过聊天页手动添加为好友");
    const conversation = await store.ensureDirectConversation(userId);
    navigate(config.routes.conversation(conversation.id));
  };

  const createCollection = async () => {
    if (!selectedCollectUserId || !canSubmitCollection) {
      return;
    }

    const conversation = await store.ensureDirectConversation(selectedCollectUserId);
    const amountLabel = `¥${Math.round(collectAmountValue).toLocaleString("ja-JP")}`;
    const note = collectNote.trim();

    await store.sendMessage(
      conversation.id,
      "text",
      note ? `收款请求 · ${amountLabel} · ${note}` : `收款请求 · ${amountLabel}`
    );
    navigate(config.routes.conversation(conversation.id));
  };

  const simulateScan = () => {
    const candidate = availableFriendCandidates.find((user) => Boolean(user.userIdLabel)) ?? availableFriendCandidates[0] ?? null;

    if (!candidate) {
      return;
    }

    setScanError(null);
    setScannedUserId(candidate.id);
  };

  const resolveScanToken = (nextToken: string) => {
    const adminLoginRedirect = buildAdminLoginScanRedirect(nextToken);

    if (adminLoginRedirect) {
      setScanError(null);
      navigate(adminLoginRedirect);
      return;
    }

    try {
      const resolution = dineInActions.resolveQrToken(nextToken);
      setScanError(null);
      navigate(resolution.action.url);
    } catch (scanError) {
      setScanError(scanError instanceof Error ? scanError.message : "二维码解析失败");
    }
  };

  const createOrForward = async (userId: string) => {
    if (mode === "forward" && forwardMessageId) {
      const conversation = await store.ensureDirectConversation(userId);
      await store.forwardMessage(forwardMessageId, conversation.id);
      navigate(config.routes.conversation(conversation.id));
      return;
    }

    const conversation = await store.ensureDirectConversation(userId);
    navigate(config.routes.conversation(conversation.id));
  };

  const createGroup = async () => {
    if (!canCreateGroup) {
      return;
    }

    stabilizeImMobileViewport();

    const conversation = await store.createGroupConversation(
      selectedIds,
      groupTitle.trim() || undefined,
      privacyModeEnabled
        ? {
            privacyModeEnabled: true,
            disappearingCountdown: privacyCountdown,
            disappearingStartMode: privacyStartMode
          }
        : undefined
    );
    stabilizeImMobileViewport();
    navigate(config.routes.conversation(conversation.id));
  };

  const groupContentBottomPaddingClassName = privacyModeEnabled
    ? "pb-[calc(380px+env(safe-area-inset-bottom))]"
    : "pb-[calc(184px+env(safe-area-inset-bottom))]";
  const groupIndexBottom = privacyModeEnabled ? "calc(22.75rem + env(safe-area-inset-bottom))" : groupIndexFixedBottom;
  const groupIndexGutter = privacyModeEnabled ? "calc(22rem + env(safe-area-inset-bottom))" : groupIndexBottomGutter;

  return (
    <ImStandaloneShell>
      {isGroupMode ? (
        <ImTopBar
          centerTitle
          className="border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_94%,transparent)] backdrop-blur-xl"
          fixed
          footer={
            <div className="space-y-2">
              <input
                className="h-11 w-full rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-4 text-[15px] text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索联系人并多选"
                value={query}
              />
              <div className="flex h-11 items-center gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] px-3">
                <span className="shrink-0 text-xs font-black text-[color:var(--client-muted)]">已选 {selectedIds.length} 人</span>
                <input
                  className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[color:var(--client-text)] outline-none placeholder:text-[color:color-mix(in_srgb,var(--client-muted)_72%,transparent)]"
                  onChange={(event) => setGroupTitle(event.target.value)}
                  placeholder="可选：自定义群名称"
                  value={groupTitle}
                />
              </div>
            </div>
          }
          key={`new-group-header-${selectedIds.length}`}
          onBack={() => navigate(-1)}
          subtitle={selectedIds.length > 0 ? `${selectedIds.length} 人已选` : "选择联系人"}
          title={pageTitle}
        />
      ) : (
        <ImTopBar
          onBack={() => navigate(-1)}
          title={pageTitle}
        />
      )}

      {isGroupMode ? (
        <div className={cn("space-y-4 px-4 pt-[calc(env(safe-area-inset-top)+11.75rem)]", groupContentBottomPaddingClassName)}>
          <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
            {groupedContacts.length > 0 ? (
              groupedContacts.map((section) => (
                <div
                  className="scroll-mt-24"
                  key={section.letter}
                  ref={(element) => {
                    sectionRefs.current[section.letter] = element;
                  }}
                  style={{ scrollMarginTop: contactSectionScrollMargin }}
                >
                  <SectionTag>{section.letter}</SectionTag>
                  {section.items.map((contact) => {
                    const user = store.usersById[contact.targetUserId];

                    if (!user) {
                      return null;
                    }

                    return (
                      <ContactRow
                        avatarBadge={<ContactSelectionBadge selected={selectedIds.includes(contact.targetUserId)} />}
                        caption={buildContactCaption(user, contact)}
                        contact={contact}
                        key={contact.id}
                        onAvatarClick={() => toggleSelectedContact(contact.targetUserId)}
                        onClick={() => toggleSelectedContact(contact.targetUserId)}
                        user={user}
                      />
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-ink/42">没有找到匹配联系人</div>
            )}
          </section>
        </div>
      ) : isFriendMode ? (
        <div className="space-y-4 px-4 py-4">
          <input
            className="h-11 w-full rounded-2xl bg-white px-4 text-[15px] outline-none shadow-[0_12px_32px_rgba(20,20,20,0.06)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入名字或 ID 搜索好友"
            value={query}
          />

          <section className="rounded-[24px] bg-white p-4 text-sm leading-6 text-ink/55 shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
            从可搜索用户中添加联系人。点击某一项后，会直接加入通讯录并进入聊天窗口。
          </section>

          <section className="rounded-[24px] bg-white p-3 shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
            {filteredFriendCandidates.length > 0 ? (
              <div className="space-y-2">
                {filteredFriendCandidates.map((user) => (
                  <ContactRow
                    caption={user.signature ?? user.region ?? user.bio ?? `${user.userIdLabel} · 添加后可直接开始聊天`}
                    key={user.id}
                    onClick={() => void addFriendAndOpen(user.id)}
                    user={user}
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-ink/42">没有找到可添加的好友</div>
            )}
          </section>
        </div>
      ) : isCollectMode ? (
        <div className="space-y-4 px-4 py-4">
          <section className="rounded-[24px] bg-white p-4 shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink/65">收款金额</span>
              <input
                className="h-11 w-full rounded-2xl bg-[#f5f5f5] px-4 text-[15px] outline-none"
                inputMode="numeric"
                onChange={(event) => setCollectAmount(event.target.value)}
                placeholder="输入金额，如 8800"
                value={collectAmount}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-2 block text-sm font-medium text-ink/65">备注</span>
              <input
                className="h-11 w-full rounded-2xl bg-[#f5f5f5] px-4 text-[15px] outline-none"
                onChange={(event) => setCollectNote(event.target.value)}
                placeholder="可选：例如 预约定金 / 补差价"
                value={collectNote}
              />
            </label>
          </section>

          <input
            className="h-11 w-full rounded-2xl bg-white px-4 text-[15px] outline-none shadow-[0_12px_32px_rgba(20,20,20,0.06)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索要收款的联系人"
            value={query}
          />

          <section className="rounded-[24px] bg-white p-3 shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
            {contacts.length > 0 ? (
              <div className="space-y-2">
                {contacts.map((contact) => {
                  const user = store.usersById[contact.targetUserId];

                  if (!user) {
                    return null;
                  }

                  return (
                    <ContactRow
                      avatarBadge={<ContactSelectionBadge selected={selectedCollectUserId === contact.targetUserId} />}
                      caption={buildContactCaption(user, contact)}
                      contact={contact}
                      key={contact.id}
                      onAvatarClick={() => setSelectedCollectUserId(contact.targetUserId)}
                      onClick={() => setSelectedCollectUserId(contact.targetUserId)}
                      user={user}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-ink/42">没有找到可收款的联系人</div>
            )}
          </section>

          <Button className="w-full rounded-2xl" disabled={!canSubmitCollection} onClick={() => void createCollection()} size="lg">
            发送收款请求
          </Button>
        </div>
      ) : isScanMode ? (
        <div className="space-y-4 px-4 py-4">
          <UnifiedScanSimulator
            error={scanError}
            friendResult={scannedUser ? (
              <section className="rounded-[24px] bg-white p-4 shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
                <p className="text-xs font-black text-[color:var(--client-primary)]">扫码识别结果</p>
                <div className="mt-3">
                  <ContactRow
                    caption={scannedUser.signature ?? scannedUser.region ?? scannedUser.bio ?? scannedUser.userIdLabel}
                    user={scannedUser}
                  />
                </div>
                <Button className="mt-4 w-full rounded-2xl" onClick={() => void addFriendAndOpen(scannedUser.id)} size="lg">
                  添加好友并开始聊天
                </Button>
              </section>
            ) : undefined}
            friendScanDisabled={availableFriendCandidates.length === 0}
            myQrPurpose={myQrPurpose}
            onMyQrPurposeChange={setMyQrPurpose}
            onResolveToken={resolveScanToken}
            onScanFriend={simulateScan}
            onTokenChange={setScanToken}
            token={scanToken}
          />
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          <input
            className="h-11 w-full rounded-2xl bg-white px-4 text-[15px] outline-none shadow-[0_12px_32px_rgba(20,20,20,0.06)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mode === "forward" ? "搜索联系人" : "搜索联系人"}
            value={query}
          />

          <section className="overflow-hidden rounded-[24px] bg-white shadow-[0_12px_32px_rgba(20,20,20,0.06)]">
            {contacts.map((contact) => {
              const user = store.usersById[contact.targetUserId];

              if (!user) {
                return null;
              }

              return (
                <ContactRow
                  avatarTo={resolveImProfilePath(scope, user)}
                  caption={buildContactCaption(user, contact)}
                  contact={contact}
                  key={contact.id}
                  onClick={() => void createOrForward(user.id)}
                  user={user}
                />
              );
            })}
          </section>
        </div>
      )}

      {isGroupMode && visibleIndexLetters.length > 0 ? (
        <div
          className="pointer-events-none fixed z-20 overflow-hidden rounded-full"
          style={{
            bottom: groupIndexBottom,
            right: contactIndexFixedRight,
            maxHeight: `max(3rem, calc(100dvh - 34dvh - ${groupIndexGutter}))`
          }}
        >
          <div
            className={contactIndexBarClassName}
            onPointerCancel={(event) => finishIndexDrag(event.pointerId, event.currentTarget)}
            onPointerDown={(event) => {
              const letter = resolveIndexLetterFromPointer(event.clientY);

              if (!letter) {
                return;
              }

              activePointerIdRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
              scrollToIndexLetter(letter, { behavior: "auto", keepHighlight: true });
            }}
            onPointerMove={(event) => {
              if (activePointerIdRef.current !== event.pointerId) {
                return;
              }

              const letter = resolveIndexLetterFromPointer(event.clientY);

              if (!letter) {
                return;
              }

              scrollToIndexLetter(letter, {
                behavior: "auto",
                keepHighlight: true,
                dedupeDrag: true
              });
            }}
            onPointerUp={(event) => finishIndexDrag(event.pointerId, event.currentTarget)}
            ref={indexBarRef}
          >
            {visibleIndexLetters.map((letter) => (
              <button
                aria-label={`跳转到 ${letter} 分组`}
                className={getContactIndexLetterClassName(activeIndexLetter === letter, indexLetterClassName)}
                key={letter}
                onClick={() => scrollToIndexLetter(letter)}
                type="button"
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isGroupMode ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 max-w-full overflow-x-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-16 [overflow-x:clip] sm:px-6">
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_86%,transparent)_38%,var(--client-bg)_100%)]",
              privacyModeEnabled ? "h-[372px]" : "h-[188px]"
            )}
          />
          <div className="pointer-events-auto relative mx-auto w-full min-w-0 max-w-[880px] space-y-3 overflow-x-hidden [overflow-x:clip]">
            <section className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] px-4 py-3 backdrop-blur-xl">
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-black text-[color:var(--client-text)]">隐私模式</p>
                  <p className="mt-1 truncate text-xs font-semibold text-[color:var(--client-muted)]">
                    {privacyModeEnabled
                      ? privacyCountdownSummary || "开启后需设置对话消失倒计时"
                      : "关闭时群聊内容按普通聊天保留"}
                  </p>
                </div>
                <ToggleSwitch ariaLabel="是否开启隐私模式" checked={privacyModeEnabled} onChange={setPrivacyModeEnabled} size="md" />
              </div>

              {privacyModeEnabled ? (
                <>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {groupPrivacyCountdownLabels.map(({ field, label }) => (
                      <label className="min-w-0" key={field}>
                        <span className="mb-1 block text-center text-[11px] font-black text-[color:var(--client-muted)]">{label}</span>
                        <input
                          aria-label={`对话消失倒计时${label}`}
                          className="h-10 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_76%,var(--client-surface))] px-2 text-center text-[15px] font-black text-[color:var(--client-text)] outline-none transition placeholder:text-[color:color-mix(in_srgb,var(--client-muted)_54%,transparent)] focus:border-[color:var(--client-primary)]"
                          inputMode="numeric"
                          min={0}
                          max={groupPrivacyCountdownLimits[field]}
                          onChange={(event) => updatePrivacyCountdownInput(field, event.target.value)}
                          placeholder="0"
                          type="text"
                          value={privacyCountdownInput[field]}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-full bg-[color:color-mix(in_srgb,var(--client-bg)_68%,transparent)] p-1">
                    {groupPrivacyStartModeOptions.map((option) => {
                      const active = privacyStartMode === option.value;

                      return (
                        <button
                          aria-pressed={active}
                          className={cn(
                            "min-h-11 rounded-full px-3 text-center transition",
                            active
                              ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                              : "text-[color:var(--client-muted)]"
                          )}
                          key={option.value}
                          onClick={() => setPrivacyStartMode(option.value)}
                          type="button"
                        >
                          <span className="block text-xs font-black">{option.label}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold opacity-75">{option.caption}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </section>
            <button
              className="focus-ring inline-flex min-h-14 w-full items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[color:var(--client-primary)] px-7 text-[15px] font-black text-[color:var(--client-primary-contrast)] shadow-[0_18px_36px_color-mix(in_srgb,var(--client-primary)_34%,transparent)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] disabled:bg-[color:color-mix(in_srgb,var(--client-line)_62%,var(--client-surface))] disabled:text-[color:var(--client-muted)] disabled:shadow-none"
              disabled={!canCreateGroup}
              onClick={() => void createGroup()}
              onPointerDown={stabilizeImMobileViewport}
              type="button"
            >
              {privacyModeEnabled && !hasPrivacyCountdown ? "请设置消失倒计时" : "创建群聊"}
            </button>
          </div>
        </div>
      ) : null}
    </ImStandaloneShell>
  );
}
