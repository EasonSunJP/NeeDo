import { useDeferredValue, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { ScheduleViewSegmentedTabs } from "../../components/client-ui/AppScaffold";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { NotificationBadge } from "../../components/ui/NotificationBadge";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { ScheduleDraftRangeBlock } from "../../components/scheduling/ScheduleDraftRangeBlock";
import { useAuth } from "../../auth/AuthProvider";
import { orders as demoOrders, services } from "../../data/mock";
import { OrderDynamicStatusCard } from "../../shared/order-detail/OrderDynamicStatusCard";
import { SocialProfileMiniCard, buildServiceMiniCardData } from "../../shared/profile-card";
import { useEntityStore } from "../../state/entityStore";
import { getClientThemeClassName, useClientTheme } from "../../theme/ClientThemeProvider";
import { getScheduleOrderDetailRoute, resolveScheduleEventDetailTarget, type ScheduleDetailTargetActor } from "../../lib/scheduleDetailTarget";
import { buildCurrentRoute, readNavigationReturnTarget, withReturnTo } from "../../lib/navigationReturn";
import {
  cancelTechnicianScheduleTransferRequest,
  createTechnicianScheduleTransferRequest,
  deleteTechnicianScheduleEvent,
  getTechnicianScheduleStoreSnapshot,
  getTechnicianScheduleTransferPreview,
  getTechnicianShiftConflictState,
  respondToTechnicianScheduleTransferInvitation,
  saveTechnicianScheduleEvent,
  useTechnicianScheduleStore
} from "../../state/technicianScheduleStore";
import { cn, hasLocalizedTitleText } from "../../lib/utils";
import { ArrangementDetailContent } from "../dispatch-center/components/ArrangementDetailContent";
import { getDispatchArrangementByOrderId, useDispatchCenterStore } from "../dispatch-center/store";
import type {
  MinuteRange,
  TechnicianCalendarItem,
  TechnicianDutyShift,
  TechnicianScheduleBooking,
  TechnicianScheduleCustomEvent,
  TechnicianScheduleDensityMode,
  TechnicianScheduleEventPreset,
  TechnicianSchedulePeriod,
  TechnicianScheduleSnapshot,
  TechnicianScheduleSummary,
  TechnicianScheduleSyncTarget,
  TechnicianScheduleTransferInvitation,
  TechnicianScheduleTransferInvitationStatus,
  TechnicianScheduleTransferRequest,
  TechnicianScheduleTransferStatus,
  TechnicianScheduleView
} from "./model";
import {
  containsRange,
  formatCurrency,
  formatHours,
  formatLongDate,
  formatShortDate,
  getEventKindLabel,
  getInvitationStatusLabel,
  getMonthGridDates,
  getPeriod,
  getTodayDateKey,
  getTransferStatusLabel,
  getWeekDates,
  getWeekdayHeaderLabel,
  getWeekdayLabel,
  intersectRange,
  intervalToRange,
  isDateInPeriod,
  minutesToTime,
  padNumber,
  resolveScheduleEventPreset,
  getScheduleEventKindForPreset,
  getScheduleEventPresetLabel,
  resolveSelectedScheduleDate,
  shiftScheduleSelection,
  sortByDateTime,
  subtractRanges,
  totalHoursFromRanges
} from "./model";

type ResolvedShift = TechnicianDutyShift & {
  assignmentKind: "owned" | "accepted";
  ownerTechnicianId: string;
  transferRequest?: TechnicianScheduleTransferRequest | null;
  acceptedInvitationId?: string;
};

type ResolvedIncomingInvitation = {
  invitation: TechnicianScheduleTransferInvitation;
  request: TechnicianScheduleTransferRequest;
  shift: TechnicianDutyShift;
  requesterName: string;
};

type ScheduleBannerMessage = {
  tone: BadgeTone;
  text: string;
};

type ScheduleSelectableSyncTarget = Omit<TechnicianScheduleSyncTarget, "type"> & {
  type: "store" | "technician" | "friend";
};

type ResolvedScheduleSyncTarget = TechnicianScheduleSyncTarget & {
  avatarSrc?: string;
  typeLabel?: string;
  metaLine?: string;
  detailLine?: string;
  remark?: string;
  badgeLabel?: string;
  badgeTone?: BadgeTone;
};

type ScheduleContactTarget = ScheduleSelectableSyncTarget & ResolvedScheduleSyncTarget;
type ScheduleSyncTargetFilterTag = "all" | ScheduleSelectableSyncTarget["type"];

const scheduleSyncTargetFilterOptions: Array<{ value: ScheduleSyncTargetFilterTag; label: string }> = [
  { value: "all", label: "全部" },
  { value: "store", label: "店铺" },
  { value: "technician", label: "技师" },
  { value: "friend", label: "好友" }
];

const schedulePanelClass =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] shadow-[var(--client-shadow)]";
const scheduleInsetClass =
  "rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)]";
const scheduleInputClass =
  "focus-ring mt-2 h-11 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-4 text-sm font-black text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-muted)]";
const scheduleSelectClass = scheduleInputClass;
const scheduleTextareaClass =
  "focus-ring mt-2 min-h-[112px] w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-4 py-3 text-sm leading-6 text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-muted)]";

type ScheduleSemanticTone = "availability" | "confirmed" | "booked" | "conflict" | "tentative" | "other" | "travel";
type ScheduleToneCssKey = "available" | "scheduled" | "booked" | "conflict-pending" | "other" | "travel";

const scheduleSemanticToneCssKeyMap: Record<ScheduleSemanticTone, ScheduleToneCssKey> = {
  availability: "available",
  confirmed: "scheduled",
  booked: "booked",
  conflict: "conflict-pending",
  tentative: "conflict-pending",
  other: "other",
  travel: "travel"
};

const scheduleBadgeToneClassMap: Record<BadgeTone, string> = {
  green:
    "border-[color:var(--schedule-tone-scheduled-border)] bg-[color:var(--schedule-tone-scheduled-bg)] text-[color:var(--schedule-tone-scheduled-text)]",
  yellow:
    "border-[color:var(--schedule-tone-other-border)] bg-[color:var(--schedule-tone-other-bg)] text-[color:var(--schedule-tone-other-text)] [text-shadow:var(--schedule-tone-other-text-shadow)]",
  red:
    "border-[color:var(--schedule-tone-conflict-pending-border)] bg-[color:var(--schedule-tone-conflict-pending-bg)] text-[color:var(--schedule-tone-conflict-pending-text)] [text-shadow:var(--schedule-tone-conflict-pending-text-shadow)]",
  blue:
    "border-[color:var(--schedule-tone-available-border)] bg-[color:var(--schedule-tone-available-bg)] text-[color:var(--schedule-tone-available-text)]",
  neutral:
    "border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] text-[color:var(--client-muted)]",
  dark:
    "border-[color:var(--schedule-tone-booked-border)] bg-[color:var(--schedule-tone-booked-bg)] text-[color:var(--schedule-tone-booked-text)] [text-shadow:var(--schedule-tone-booked-text-shadow)]"
};

function useScheduleThemeRootClassName() {
  const { theme, isNight } = useClientTheme();
  return [
    isNight ? "client-theme-night" : "client-theme-day",
    getClientThemeClassName(theme)
  ].join(" ");
}

function buildScheduleSemanticStyle(
  tone: ScheduleSemanticTone,
  options?: {
    past?: boolean;
    badge?: boolean;
  }
) {
  const cssTone = scheduleSemanticToneCssKeyMap[tone];
  const fillOpacity = options?.past ? 72 : 100;

  return {
    "--schedule-semantic-fill": options?.past
      ? `color-mix(in srgb, var(--schedule-tone-${cssTone}-bg) ${fillOpacity}%, var(--client-surface) ${100 - fillOpacity}%)`
      : `var(--schedule-tone-${cssTone}-bg)`,
    "--schedule-semantic-fill-strong": `var(--schedule-tone-${cssTone}-bg)`,
    "--schedule-semantic-border": `var(--schedule-tone-${cssTone}-border)`,
    "--schedule-semantic-text": `var(--schedule-tone-${cssTone}-text)`,
    "--schedule-semantic-text-shadow": `var(--schedule-tone-${cssTone}-text-shadow, none)`,
    "--schedule-semantic-shadow": `color-mix(in srgb, var(--schedule-tone-${cssTone}-border) 18%, transparent)`
  } as CSSProperties;
}

function getScheduleSemanticTone(item: TechnicianCalendarItem, hasConflict: boolean): ScheduleSemanticTone {
  if (hasConflict) {
    return "conflict";
  }

  if (item.kind === "leave" || item.kind === "locked") {
    return "conflict";
  }

  if (item.kind === "travel" || item.preset === "travel") {
    return "travel";
  }

  switch (item.kind) {
    case "availability":
      return "availability";
    case "confirmed":
      return "confirmed";
    case "booked":
      return "booked";
    case "tentative":
      return "tentative";
    default:
      return "other";
  }
}

function getItemDisplayLabel(item: TechnicianCalendarItem) {
  if (item.eventType === "extension") {
    return "加钟";
  }

  if (item.eventType === "reschedule") {
    return "移动预约";
  }

  return item.preset ? getScheduleEventPresetLabel(item.preset) : getEventKindLabel(item.kind);
}

function isPastCalendarItem(item: TechnicianCalendarItem) {
  const endDateTime = new Date(`${item.date}T${item.endTime}:00`);
  return endDateTime.getTime() < Date.now();
}

function buildConflictItemIdSet(items: TechnicianCalendarItem[]) {
  const grouped = items.reduce<Record<string, TechnicianCalendarItem[]>>((accumulator, item) => {
    const current = accumulator[item.date] ?? [];
    current.push(item);
    accumulator[item.date] = current;
    return accumulator;
  }, {});
  const conflictItemIds = new Set<string>();

  Object.values(grouped).forEach((dateItems) => {
    const actionableItems = dateItems.filter((item) => item.kind !== "confirmed" && item.kind !== "availability");

    for (let index = 0; index < actionableItems.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < actionableItems.length; nextIndex += 1) {
        const current = actionableItems[index];
        const next = actionableItems[nextIndex];
        if (intersectRange(intervalToRange(current), intervalToRange(next))) {
          conflictItemIds.add(current.id);
          conflictItemIds.add(next.id);
        }
      }
    }
  });

  return conflictItemIds;
}

function getItemSurfacePresentation(item: TechnicianCalendarItem, hasConflict: boolean) {
  if (item.transferStatus === "transfer_completed") {
    return {
      className:
        "border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,var(--client-bg)_14%)] text-[color:var(--client-muted)]",
      style: undefined as CSSProperties | undefined
    };
  }

  const tone = getScheduleSemanticTone(item, hasConflict);
  return {
    className: [
      "border-[color:var(--schedule-semantic-border)]",
      "bg-[linear-gradient(180deg,var(--schedule-semantic-fill),var(--schedule-semantic-fill-strong))]",
      "text-[color:var(--schedule-semantic-text)]",
      "[text-shadow:var(--schedule-semantic-text-shadow)]",
      tone === "tentative" ? "border-dashed" : ""
    ]
      .filter(Boolean)
      .join(" "),
    style: buildScheduleSemanticStyle(tone, { past: isPastCalendarItem(item) })
  };
}

function getItemBadgePresentation(item: TechnicianCalendarItem, hasConflict: boolean) {
  if (item.transferStatus === "transfer_completed") {
    return {
      tone: "neutral",
      style: undefined
    } satisfies { tone: BadgeTone; style: CSSProperties | undefined };
  }

  const tone = getScheduleSemanticTone(item, hasConflict);

  return {
    tone: tone === "booked" ? "dark" : tone === "confirmed" ? "green" : tone === "other" ? "yellow" : tone === "conflict" || tone === "tentative" ? "red" : "blue",
    style: buildScheduleSemanticStyle(tone, { badge: true, past: isPastCalendarItem(item) })
  } satisfies { tone: BadgeTone; style: CSSProperties | undefined };
}

function ScheduleBadge({
  children,
  tone = "neutral",
  className,
  style
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Badge
      className={cn(
        "border px-2.5 py-1 text-[11px] font-black backdrop-blur",
        style
          ? "border-[color:var(--schedule-semantic-border)] bg-[color:var(--schedule-semantic-fill)] text-[color:var(--schedule-semantic-text)] [text-shadow:var(--schedule-semantic-text-shadow)]"
          : scheduleBadgeToneClassMap[tone],
        className
      )}
      style={style}
      tone={tone}
    >
      {children}
    </Badge>
  );
}

function getScheduleButtonClassName(variant: "primary" | "secondary" = "primary") {
  return variant === "primary"
    ? "bg-[color:var(--client-primary)] text-[#090806] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-primary)_22%,transparent)] hover:brightness-105"
    : "border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)] hover:border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)]";
}

function getScheduleShiftButtonLabel(view: TechnicianScheduleView, direction: -1 | 1) {
  const unit = view === "day" ? "天" : view === "week" ? "周" : "月";
  return `${direction === -1 ? "前" : "后"}一${unit}`;
}

function ScheduleDynamicText({ children }: { children: ReactNode }) {
  return <span data-no-i18n>{children}</span>;
}

function ScheduleSectionHeading({
  title,
  info,
  label,
  eyebrow,
  right,
  className
}: {
  title: ReactNode;
  info?: ReactNode;
  label?: string;
  eyebrow?: string;
  right?: ReactNode;
  className?: string;
}) {
  const showEyebrow = Boolean(eyebrow && hasLocalizedTitleText(eyebrow));

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        {showEyebrow ? (
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">{eyebrow}</p>
        ) : null}
        <TitleWithInfo
          info={info}
          infoClassName="h-5 w-5 border-[color:color-mix(in_srgb,var(--client-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] text-[color:var(--client-muted)]"
          label={label}
          title={<span className="truncate text-[18px] font-black tracking-[-0.02em] text-[color:var(--client-text)]">{title}</span>}
          titleClassName="min-w-0"
          variant="client"
        />
      </div>
      {right}
    </div>
  );
}

function getLatestRequestForShift(snapshot: TechnicianScheduleSnapshot, shiftId: string) {
  return snapshot.transferRequests
    .filter((request) => request.shiftId === shiftId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function getRequestInvitations(snapshot: TechnicianScheduleSnapshot, requestId: string) {
  return snapshot.transferInvitations.filter((invitation) => invitation.requestId === requestId);
}

function resolveAssignedShifts(snapshot: TechnicianScheduleSnapshot, technicianId: string) {
  const directShifts = snapshot.dutyShifts
    .filter((shift) => shift.technicianId === technicianId)
    .filter((shift) => getLatestRequestForShift(snapshot, shift.id)?.status !== "transfer_completed")
    .map(
      (shift): ResolvedShift => ({
        ...shift,
        assignmentKind: "owned",
        ownerTechnicianId: shift.technicianId,
        transferRequest: getLatestRequestForShift(snapshot, shift.id)
      })
    );

  const acceptedShifts = snapshot.transferInvitations
    .filter((invitation) => invitation.candidateId === technicianId && invitation.status === "accepted")
    .flatMap((invitation) => {
      const request = snapshot.transferRequests.find((item) => item.id === invitation.requestId);
      const shift = request ? snapshot.dutyShifts.find((item) => item.id === request.shiftId) : null;
      return request && shift
        ? [{
            ...shift,
            id: `${shift.id}__accepted__${invitation.id}`,
            technicianId,
            title: `${shift.title} · 接手班次`,
            shiftLabel: request.status === "transfer_completed" ? "已接手" : "转让中",
            assignmentKind: "accepted",
            ownerTechnicianId: shift.technicianId,
            transferRequest: request,
            acceptedInvitationId: invitation.id
          } satisfies ResolvedShift]
        : [];
    });

  return [...directShifts, ...acceptedShifts].sort((left, right) => {
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

function resolveTransferredAwayShifts(snapshot: TechnicianScheduleSnapshot, technicianId: string) {
  return snapshot.dutyShifts.filter(
    (shift) => shift.technicianId === technicianId && getLatestRequestForShift(snapshot, shift.id)?.status === "transfer_completed"
  );
}

function findContainingShift(shifts: ResolvedShift[], date: string, startTime: string, endTime: string) {
  const targetRange = intervalToRange({ date, startTime, endTime });
  return (
    shifts.find((shift) => shift.date === date && containsRange(intervalToRange(shift), targetRange)) ??
    shifts.find((shift) => shift.date === date && Boolean(intersectRange(intervalToRange(shift), targetRange))) ??
    null
  );
}

function resolveVisibleBookings(
  snapshot: TechnicianScheduleSnapshot,
  technicianId: string,
  assignedShifts: ResolvedShift[]
) {
  const transferredAwayShifts = resolveTransferredAwayShifts(snapshot, technicianId);

  return sortByDateTime(
    snapshot.bookings.filter((booking) => {
      if (booking.technicianId !== technicianId) {
        return false;
      }

      const bookingRange = intervalToRange(booking);
      return !transferredAwayShifts.some((shift) => shift.date === booking.date && Boolean(intersectRange(intervalToRange(shift), bookingRange)));
    })
  ).map((booking) => ({
    booking,
    shift: findContainingShift(assignedShifts, booking.date, booking.startTime, booking.endTime)
  }));
}

function resolveVisibleCustomEvents(snapshot: TechnicianScheduleSnapshot, technicianId: string, assignedShifts: ResolvedShift[]) {
  return sortByDateTime(snapshot.customEvents.filter((event) => event.technicianId === technicianId)).map((event) => ({
    event,
    shift: findContainingShift(assignedShifts, event.date, event.startTime, event.endTime)
  }));
}

function getTechnicianDisplayName(techniciansList: ReturnType<typeof useEntityStore>["technicians"], technicianId: string) {
  const technician = techniciansList.find((item) => item.id === technicianId);
  return technician?.nickname?.trim() || technician?.name || "未分配员工";
}

function resolveStoreShifts(
  snapshot: TechnicianScheduleSnapshot,
  storeId: string,
  techniciansList: ReturnType<typeof useEntityStore>["technicians"]
) {
  return sortByDateTime(
    snapshot.dutyShifts
      .filter((shift) => shift.storeId === storeId)
      .map(
        (shift): ResolvedShift => ({
          ...shift,
          title: `${getTechnicianDisplayName(techniciansList, shift.technicianId)} · ${shift.shiftLabel}`,
          assignmentKind: "owned",
          ownerTechnicianId: shift.technicianId,
          transferRequest: getLatestRequestForShift(snapshot, shift.id)
        })
      )
  );
}

function resolveStoreBookings(snapshot: TechnicianScheduleSnapshot, storeId: string, storeShifts: ResolvedShift[]) {
  return sortByDateTime(snapshot.bookings.filter((booking) => booking.storeId === storeId)).map((booking) => {
    const technicianShifts = storeShifts.filter((shift) => shift.technicianId === booking.technicianId);
    return {
      booking,
      shift: findContainingShift(technicianShifts, booking.date, booking.startTime, booking.endTime)
    };
  });
}

function buildStoreAppointmentCalendarItems(
  storeShifts: ResolvedShift[],
  storeBookings: ReturnType<typeof resolveStoreBookings>,
  techniciansList: ReturnType<typeof useEntityStore>["technicians"]
) {
  const shiftItems: TechnicianCalendarItem[] = storeShifts.map((shift) => {
    const technicianName = getTechnicianDisplayName(techniciansList, shift.technicianId);
    return {
      id: `merchant-calendar-shift-${shift.id}`,
      sourceId: shift.id,
      sourceType: "shift",
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      title: shift.title,
      subtitle: technicianName,
      kind: "confirmed",
      readOnly: true,
      withinConfirmedShift: true,
      transferStatus: shift.transferRequest?.status,
      requestId: shift.transferRequest?.id,
      linkedShiftId: shift.id,
      badgeLabel: "班次"
    };
  });

  const bookingItems: TechnicianCalendarItem[] = storeBookings.map(({ booking, shift }) => {
    const technicianName = getTechnicianDisplayName(techniciansList, booking.technicianId);
    return {
      id: `merchant-calendar-booking-${booking.id}`,
      sourceId: booking.orderId ?? booking.id,
      sourceType: "booking",
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      title: booking.title,
      subtitle: `${booking.customerName} · ${technicianName}`,
      amount: booking.amount ?? null,
      orderId: booking.orderId,
      parentOrderId: booking.parentOrderId,
      appointmentId: booking.appointmentId ?? booking.id,
      eventType: booking.eventType ?? "booking",
      isClickable: booking.isClickable ?? Boolean(booking.orderId ?? booking.detailTargetId),
      detailTargetType: booking.detailTargetType ?? "order_detail",
      detailTargetId: booking.detailTargetId ?? booking.orderId,
      kind: shift ? "booked" : "tentative",
      readOnly: true,
      withinConfirmedShift: Boolean(shift),
      transferStatus: shift?.transferRequest?.status,
      linkedShiftId: shift?.id,
      note: booking.note,
      badgeLabel: shift ? technicianName : "待确认"
    };
  });

  return sortByDateTime([...shiftItems, ...bookingItems]);
}

function buildCalendarItems(
  assignedShifts: ResolvedShift[],
  visibleBookings: ReturnType<typeof resolveVisibleBookings>,
  visibleCustomEvents: ReturnType<typeof resolveVisibleCustomEvents>
) {
  const shiftItems: TechnicianCalendarItem[] = assignedShifts.map((shift) => ({
    id: `calendar-${shift.id}`,
    sourceId: shift.assignmentKind === "accepted" ? shift.id.split("__accepted__")[0] : shift.id,
    sourceType: "shift",
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    title: shift.title,
    subtitle: shift.shiftLabel,
    kind: "confirmed",
    readOnly: true,
    withinConfirmedShift: true,
    transferStatus: shift.transferRequest?.status,
    requestId: shift.transferRequest?.id,
    linkedShiftId: shift.assignmentKind === "accepted" ? shift.id.split("__accepted__")[0] : shift.id,
    badgeLabel: shift.assignmentKind === "accepted" ? "接手" : undefined
  }));

  const bookingItems: TechnicianCalendarItem[] = visibleBookings.map(({ booking, shift }) => ({
    id: `calendar-${booking.id}`,
    sourceId: booking.orderId ?? booking.id,
    sourceType: "booking",
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    title: booking.title,
    subtitle: booking.customerName,
    amount: booking.amount ?? null,
    orderId: booking.orderId,
    parentOrderId: booking.parentOrderId,
    appointmentId: booking.appointmentId ?? booking.id,
    eventType: booking.eventType ?? "booking",
    isClickable: booking.isClickable ?? Boolean(booking.orderId ?? booking.detailTargetId),
    detailTargetType: booking.detailTargetType ?? "order_detail",
    detailTargetId: booking.detailTargetId ?? booking.orderId,
    kind: shift ? "booked" : "tentative",
    readOnly: true,
    withinConfirmedShift: Boolean(shift),
    transferStatus: shift?.transferRequest?.status,
    linkedShiftId: shift?.assignmentKind === "accepted" ? shift.id.split("__accepted__")[0] : shift?.id,
    note: booking.note,
    badgeLabel: shift ? undefined : "待确认"
  }));

  const customItems: TechnicianCalendarItem[] = visibleCustomEvents.map(({ event, shift }) => {
    const preset = resolveScheduleEventPreset(event.kind, event.title, event.preset);

    return {
      id: `calendar-${event.id}`,
      sourceId: event.id,
      sourceType: "custom",
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      title: event.title,
      subtitle: event.location || getScheduleEventPresetLabel(preset),
      kind: event.kind,
      preset,
      readOnly: Boolean(shift),
      withinConfirmedShift: Boolean(shift),
      transferStatus: shift?.transferRequest?.status,
      linkedShiftId: shift?.assignmentKind === "accepted" ? shift.id.split("__accepted__")[0] : shift?.id,
      note: event.note,
      syncTargets: event.syncTargets
    };
  });

  return sortByDateTime([...shiftItems, ...bookingItems, ...customItems]);
}

function buildRangesByDate(intervals: Array<{ date: string; startTime: string; endTime: string }>) {
  return intervals.reduce<Record<string, MinuteRange[]>>((accumulator, interval) => {
    const current = accumulator[interval.date] ?? [];
    current.push(intervalToRange(interval));
    accumulator[interval.date] = current;
    return accumulator;
  }, {});
}

function computeScheduleSummary(
  assignedShifts: ResolvedShift[],
  visibleBookings: ReturnType<typeof resolveVisibleBookings>,
  visibleCustomEvents: ReturnType<typeof resolveVisibleCustomEvents>,
  period: TechnicianSchedulePeriod
): TechnicianScheduleSummary {
  const confirmedRanges = buildRangesByDate(assignedShifts.filter((shift) => isDateInPeriod(shift.date, period)));
  const bookingRanges = buildRangesByDate(visibleBookings.map((item) => item.booking).filter((booking) => isDateInPeriod(booking.date, period)));
  const availabilityRanges = buildRangesByDate(
    visibleCustomEvents
      .map((item) => item.event)
      .filter((event) => event.kind === "availability" && isDateInPeriod(event.date, period))
  );

  const tentativeHours = period.dates.reduce((sum, date) => {
    const dayBookings = bookingRanges[date] ?? [];
    const dayConfirmed = confirmedRanges[date] ?? [];
    return sum + totalHoursFromRanges(subtractRanges(dayBookings, dayConfirmed));
  }, 0);

  const freeHours = period.dates.reduce((sum, date) => {
    const dayAvailability = availabilityRanges[date] ?? [];
    const dayBookings = bookingRanges[date] ?? [];
    return sum + totalHoursFromRanges(subtractRanges(dayAvailability, dayBookings));
  }, 0);

  return {
    confirmedHours: period.dates.reduce((sum, date) => sum + totalHoursFromRanges(confirmedRanges[date] ?? []), 0),
    bookedHours: period.dates.reduce((sum, date) => sum + totalHoursFromRanges(bookingRanges[date] ?? []), 0),
    freeHours,
    tentativeHours
  };
}

function computeScheduleBrief(items: TechnicianCalendarItem[], period: TechnicianSchedulePeriod) {
  const periodItems = items.filter((item) => isDateInPeriod(item.date, period));
  const bookingItems = periodItems.filter((item) => item.sourceType === "booking");
  const revenueItems = bookingItems.filter((item) => typeof item.amount === "number");
  const conflictItemIds = buildConflictItemIdSet(periodItems);

  return {
    itemCount: periodItems.length,
    orderCount: bookingItems.length,
    hasConflict: conflictItemIds.size > 0,
    estimatedRevenue:
      revenueItems.length > 0
        ? revenueItems.reduce((sum, item) => sum + (typeof item.amount === "number" ? item.amount : 0), 0)
        : null
  };
}

function computeStoreScheduleSummary(
  storeShifts: ResolvedShift[],
  storeBookings: ReturnType<typeof resolveStoreBookings>,
  period: TechnicianSchedulePeriod
): TechnicianScheduleSummary {
  const periodShifts = storeShifts.filter((shift) => isDateInPeriod(shift.date, period));
  const periodBookings = storeBookings.map((item) => item.booking).filter((booking) => isDateInPeriod(booking.date, period));
  const groupByTechnicianDate = (items: Array<{ technicianId: string; date: string; startTime: string; endTime: string }>) =>
    items.reduce<Record<string, MinuteRange[]>>((accumulator, item) => {
      const key = `${item.technicianId}:${item.date}`;
      const current = accumulator[key] ?? [];
      current.push(intervalToRange(item));
      accumulator[key] = current;
      return accumulator;
    }, {});
  const confirmedRanges = groupByTechnicianDate(periodShifts);
  const bookingRanges = groupByTechnicianDate(periodBookings);
  const groupKeys = Array.from(new Set([...Object.keys(confirmedRanges), ...Object.keys(bookingRanges)]));

  const tentativeHours = groupKeys.reduce((sum, key) => {
    const technicianBookings = bookingRanges[key] ?? [];
    const technicianConfirmed = confirmedRanges[key] ?? [];
    return sum + totalHoursFromRanges(subtractRanges(technicianBookings, technicianConfirmed));
  }, 0);

  const freeHours = groupKeys.reduce((sum, key) => {
    const technicianConfirmed = confirmedRanges[key] ?? [];
    const technicianBookings = bookingRanges[key] ?? [];
    return sum + totalHoursFromRanges(subtractRanges(technicianConfirmed, technicianBookings));
  }, 0);

  return {
    confirmedHours: Object.values(confirmedRanges).reduce((sum, ranges) => sum + totalHoursFromRanges(ranges), 0),
    bookedHours: Object.values(bookingRanges).reduce((sum, ranges) => sum + totalHoursFromRanges(ranges), 0),
    freeHours,
    tentativeHours
  };
}

function buildStoreBookingConflictItemIdSet(storeBookings: ReturnType<typeof resolveStoreBookings>) {
  const grouped = storeBookings.reduce<Record<string, TechnicianScheduleBooking[]>>((accumulator, { booking }) => {
    const key = `${booking.technicianId}:${booking.date}`;
    const current = accumulator[key] ?? [];
    current.push(booking);
    accumulator[key] = current;
    return accumulator;
  }, {});
  const conflictItemIds = new Set<string>();

  Object.values(grouped).forEach((dateBookings) => {
    for (let index = 0; index < dateBookings.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < dateBookings.length; nextIndex += 1) {
        const current = dateBookings[index];
        const next = dateBookings[nextIndex];
        if (intersectRange(intervalToRange(current), intervalToRange(next))) {
          conflictItemIds.add(`merchant-calendar-booking-${current.id}`);
          conflictItemIds.add(`merchant-calendar-booking-${next.id}`);
        }
      }
    }
  });

  return conflictItemIds;
}

function computeStoreAppointmentBrief(
  items: TechnicianCalendarItem[],
  storeBookings: ReturnType<typeof resolveStoreBookings>,
  period: TechnicianSchedulePeriod
) {
  const periodItems = items.filter((item) => isDateInPeriod(item.date, period));
  const bookingItems = periodItems.filter((item) => item.sourceType === "booking");
  const revenueItems = bookingItems.filter((item) => typeof item.amount === "number");
  const periodConflictIds = buildStoreBookingConflictItemIdSet(
    storeBookings.filter(({ booking }) => isDateInPeriod(booking.date, period))
  );

  return {
    orderCount: bookingItems.length,
    hasConflict: periodConflictIds.size > 0,
    estimatedRevenue:
      revenueItems.length > 0
        ? revenueItems.reduce((sum, item) => sum + (typeof item.amount === "number" ? item.amount : 0), 0)
        : null
  };
}

function resolveIncomingInvitations(snapshot: TechnicianScheduleSnapshot, technicianId: string, requesterNameMap: Map<string, string>) {
  return snapshot.transferInvitations
    .filter((invitation) => invitation.candidateId === technicianId && invitation.status === "pending")
    .map((invitation) => {
      const request = snapshot.transferRequests.find((item) => item.id === invitation.requestId);
      const shift = request ? snapshot.dutyShifts.find((item) => item.id === request.shiftId) : null;
      return request && shift
        ? ({
            invitation,
            request,
            shift,
            requesterName: requesterNameMap.get(request.requesterId) ?? "同事"
          } satisfies ResolvedIncomingInvitation)
        : null;
    })
    .filter((item): item is ResolvedIncomingInvitation => Boolean(item));
}

function getTransferTone(status?: TechnicianScheduleTransferStatus): BadgeTone {
  switch (status) {
    case "transfer_pending":
      return "yellow";
    case "transfer_completed":
      return "neutral";
    case "transfer_failed":
      return "red";
    case "transfer_cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

function getInvitationTone(status: TechnicianScheduleTransferInvitationStatus): BadgeTone {
  switch (status) {
    case "accepted":
      return "green";
    case "rejected":
      return "neutral";
    case "failed_conflict":
    case "failed_capacity":
      return "red";
    case "cancelled":
      return "neutral";
    default:
      return "yellow";
  }
}

function groupItemsByDate(items: TechnicianCalendarItem[]) {
  return items.reduce<Record<string, TechnicianCalendarItem[]>>((accumulator, item) => {
    const current = accumulator[item.date] ?? [];
    current.push(item);
    accumulator[item.date] = sortByDateTime(current);
    return accumulator;
  }, {});
}

function buildTimelineLayouts(items: TechnicianCalendarItem[]) {
  const foregroundItems = items.filter((item) => item.kind !== "confirmed" && item.kind !== "availability");
  const backgroundItems = items.filter((item) => item.kind === "confirmed" || item.kind === "availability");
  let maxLanes = 1;
  let active: Array<{ lane: number; end: number }> = [];

  const foregroundLayouts = foregroundItems.map((item) => {
    const range = intervalToRange(item);
    active = active.filter((entry) => entry.end > range.start);
    const usedLanes = new Set(active.map((entry) => entry.lane));
    let lane = 0;
    while (usedLanes.has(lane)) {
      lane += 1;
    }
    active.push({ lane, end: range.end });
    maxLanes = Math.max(maxLanes, active.length);
    return { item, lane, range };
  });

  return {
    backgroundItems,
    foregroundLayouts,
    laneCount: maxLanes
  };
}

function getStoreOpenStatusLabel(status: "open" | "resting" | "closed") {
  switch (status) {
    case "open":
      return "营业中";
    case "resting":
      return "休息中";
    case "closed":
      return "已打烊";
    default:
      return "营业状态";
  }
}

function getTechnicianPresenceLabel(status: "available" | "busy" | "off") {
  switch (status) {
    case "available":
      return "当前可用";
    case "busy":
      return "当前繁忙";
    case "off":
      return "当前休息";
    default:
      return "技师";
  }
}

function resolveScheduleContactTarget(
  target: TechnicianScheduleSyncTarget,
  currentStore: ReturnType<typeof useEntityStore>["stores"][number],
  techniciansList: ReturnType<typeof useEntityStore>["technicians"],
  customersList: ReturnType<typeof useEntityStore>["customers"]
): ResolvedScheduleSyncTarget {
  if (target.type === "store") {
    return {
      ...target,
      label: currentStore.name,
      avatarSrc: currentStore.cover,
      typeLabel: "店铺",
      metaLine: currentStore.address,
      detailLine: `营业时间 · ${currentStore.businessHours}`,
      badgeLabel: `★ ${currentStore.rating.toFixed(1)}`,
      badgeTone: "yellow"
    };
  }

  if (target.type === "technician") {
    const technician = techniciansList.find((item) => item.id === target.id);
    if (technician) {
      return {
        ...target,
        label: technician.nickname?.trim() || technician.name,
        avatarSrc: technician.avatar,
        typeLabel: "技师",
        remark: technician.bio?.trim() || "",
        badgeLabel: `★ ${technician.rating.toFixed(1)}`,
        badgeTone: "blue"
      };
    }
  }

  if (target.type === "friend") {
    const customer = customersList.find((item) => item.id === target.id);
    if (customer) {
      return {
        ...target,
        label: customer.nickname?.trim() || customer.name,
        avatarSrc: customer.avatar,
        remark: customer.bio?.trim() || ""
      };
    }
  }

  return {
    ...target,
    typeLabel: target.type === "technician" ? "技师" : undefined,
    remark: ""
  };
}

function buildContactTargets(
  currentStore: ReturnType<typeof useEntityStore>["stores"][number],
  technicianId: string,
  techniciansList: ReturnType<typeof useEntityStore>["technicians"],
  customersList: ReturnType<typeof useEntityStore>["customers"]
) {
  const storeTarget = [
    resolveScheduleContactTarget(
      { id: currentStore.id, type: "store", label: currentStore.name },
      currentStore,
      techniciansList,
      customersList
    ) as ScheduleContactTarget
  ];
  const colleagueTargets = techniciansList
    .filter((technician) => technician.storeId === currentStore.id && technician.id !== technicianId)
    .map((technician) =>
      resolveScheduleContactTarget(
        { id: technician.id, type: "technician", label: technician.nickname?.trim() || technician.name },
        currentStore,
        techniciansList,
        customersList
      ) as ScheduleContactTarget
    );
  const friendTargets = customersList.slice(0, 8).map((customer) =>
    resolveScheduleContactTarget(
      { id: customer.id, type: "friend", label: customer.nickname?.trim() || customer.name },
      currentStore,
      techniciansList,
      customersList
    ) as ScheduleContactTarget
  );

  return [...storeTarget, ...colleagueTargets, ...friendTargets];
}

function SyncTargetProfileCard({
  target,
  selected = false,
  actionLabel,
  onClick
}: {
  target: ResolvedScheduleSyncTarget;
  selected?: boolean;
  actionLabel?: string;
  onClick?: () => void;
}) {
  const avatarFallback = target.type === "store" ? "店" : target.type === "technician" ? "技" : "友";
  const avatarNode = target.avatarSrc ? (
    <AvatarImage
      alt={target.label}
      className="h-10 w-10 rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)]"
      src={target.avatarSrc}
    />
  ) : (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] text-sm font-black text-[color:var(--client-primary)]">
      {avatarFallback}
    </div>
  );
  const detailNode = (
    <div className="min-w-0 overflow-hidden">
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <strong className="min-w-0 flex-1 truncate text-sm font-black text-[color:var(--client-text)]">{target.label}</strong>
        {(target.typeLabel || target.badgeLabel) ? (
          <div className="flex shrink-0 items-center gap-1">
            {target.typeLabel ? (
              <ScheduleBadge className="px-1.5 py-0.5 text-[10px] leading-4" tone="neutral">
                {target.typeLabel}
              </ScheduleBadge>
            ) : null}
            {target.badgeLabel ? (
              <ScheduleBadge className="px-1.5 py-0.5 text-[10px] leading-4" tone={target.badgeTone ?? "neutral"}>
                {target.badgeLabel}
              </ScheduleBadge>
            ) : null}
          </div>
        ) : null}
      </div>
      {target.type === "store" ? (
        <>
          <p className="mt-0.5 truncate text-[11px] font-bold leading-4 text-[color:var(--client-muted)]">{target.metaLine}</p>
          <p className="mt-0.5 truncate text-[11px] font-bold leading-4 text-[color:var(--client-muted)] opacity-85">{target.detailLine}</p>
        </>
      ) : (
        <p className="mt-0.5 min-h-4 truncate text-[11px] font-bold leading-4 text-[color:var(--client-muted)]">
          {target.remark || "\u00A0"}
        </p>
      )}
    </div>
  );
  const actionNode = actionLabel ? (
    <ScheduleBadge className="shrink-0 self-center px-1.5 py-0.5 text-[10px] leading-4" tone={selected ? "green" : "neutral"}>
      {actionLabel}
    </ScheduleBadge>
  ) : null;

  if (onClick) {
    return (
      <button
        className={cn(
          "grid w-full max-w-full items-start gap-2.5 overflow-hidden rounded-[16px] border px-3.5 py-2.5 text-left transition",
          actionLabel ? "grid-cols-[40px_minmax(0,1fr)_auto]" : "grid-cols-[40px_minmax(0,1fr)]",
          selected
            ? "border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:var(--client-primary-soft)]"
            : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)]"
        )}
        onClick={onClick}
        type="button"
      >
        {avatarNode}
        {detailNode}
        {actionNode}
      </button>
    );
  }

  return (
    <div className="grid w-full max-w-full grid-cols-[40px_minmax(0,1fr)] items-start gap-2.5 overflow-hidden rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] px-3.5 py-2.5">
      {avatarNode}
      {detailNode}
    </div>
  );
}

function formatShiftSummary(shift: TechnicianDutyShift) {
  return `${formatLongDate(shift.date)} ${shift.startTime} - ${shift.endTime}`;
}

function useTechnicianScheduleContext() {
  const { session } = useAuth();
  const { customers, stores, technicians } = useEntityStore();
  const snapshot = useTechnicianScheduleStore();
  const technicianId = session?.linkedTechnicianId ?? technicians[0]?.id ?? "";
  const storeId = session?.linkedStoreId ?? technicians.find((item) => item.id === technicianId)?.storeId ?? stores[0]?.id ?? "";
  const currentTechnician = technicians.find((technician) => technician.id === technicianId) ?? technicians[0];
  const currentStore = stores.find((store) => store.id === storeId) ?? stores[0];

  if (!currentTechnician || !currentStore) {
    throw new Error("Technician schedule context requires seeded technician and store data.");
  }

  const sameStoreColleagues = technicians.filter(
    (technician) => technician.storeId === currentStore.id && technician.id !== currentTechnician.id
  );
  const requesterNameMap = new Map(technicians.map((technician) => [technician.id, technician.nickname?.trim() || technician.name]));
  const assignedShifts = resolveAssignedShifts(snapshot, currentTechnician.id);
  const visibleBookings = resolveVisibleBookings(snapshot, currentTechnician.id, assignedShifts);
  const visibleCustomEvents = resolveVisibleCustomEvents(snapshot, currentTechnician.id, assignedShifts);
  const items = buildCalendarItems(assignedShifts, visibleBookings, visibleCustomEvents);
  const incomingInvitations = resolveIncomingInvitations(snapshot, currentTechnician.id, requesterNameMap);

  return {
    customers,
    stores,
    technicians,
    snapshot,
    currentTechnician,
    currentStore,
    sameStoreColleagues,
    assignedShifts,
    visibleBookings,
    visibleCustomEvents,
    items,
    incomingInvitations
  };
}

function StandaloneSchedulePage({
  title,
  subtitle,
  action,
  onBack,
  children
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isNight } = useClientTheme();
  const scheduleThemeRootClass = useScheduleThemeRootClassName();
  const fallbackBackPath = location.pathname.startsWith("/schedule") ? "/schedule" : "/technician/schedule";

  return (
    <MobileShell navItems={[]}>
      <div
        className={cn(
          scheduleThemeRootClass,
          "mx-auto flex h-[100dvh] min-h-[100dvh] w-full max-w-[960px] flex-col overflow-hidden bg-[color:var(--client-bg)] text-[color:var(--client-text)]"
        )}
      >
        <MobileFullscreenHeader
          action={action}
          className="sticky top-0 z-50 border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_96%,transparent)] text-[color:var(--client-text)] backdrop-blur-xl"
          dark={isNight}
          onBack={onBack ?? (() => navigate(fallbackBackPath))}
          subtitle={subtitle}
          title={title}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 pb-8">{children}</main>
      </div>
    </MobileShell>
  );
}

function useScheduleBasePath() {
  const location = useLocation();
  return location.pathname.startsWith("/schedule") ? "/schedule" : "/technician/schedule";
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn(scheduleInsetClass, "min-w-0 px-2.5 py-2.5 sm:px-3")}>
      <p className="truncate text-[10px] font-black tracking-[0.02em] text-[color:var(--client-muted)] sm:text-[11px]">{label}</p>
      <div className="mt-1.5 flex items-end gap-1 whitespace-nowrap">
        <strong className="min-w-0 text-[17px] font-black leading-none tracking-[-0.04em] text-[color:var(--client-text)] tabular-nums min-[360px]:text-[18px] sm:text-[21px]">
          {formatHours(value)}
        </strong>
        <span className="shrink-0 pb-0.5 text-[10px] font-black text-[color:var(--client-muted)]">小时</span>
      </div>
    </div>
  );
}

function BriefCard({
  label,
  value,
  tone,
  wide = false
}: {
  label: string;
  value: string;
  tone?: BadgeTone;
  wide?: boolean;
}) {
  const statusDotClassName =
    tone === "green"
      ? "schedule-status-dot--scheduled"
      : tone === "red"
        ? "schedule-status-dot--conflict-pending"
        : tone === "blue"
          ? "schedule-status-dot--available"
          : tone === "dark"
            ? "schedule-status-dot--booked"
            : "schedule-status-dot--other";
  const statusTextClassName =
    tone === "green"
      ? "text-[color:var(--client-text)]"
      : tone === "red"
        ? "text-[color:var(--schedule-tone-conflict-pending-text)] [text-shadow:var(--schedule-tone-conflict-pending-text-shadow)]"
        : tone === "blue"
          ? "text-[color:var(--client-text)]"
          : tone === "dark"
            ? "text-[color:var(--schedule-tone-booked-text)] [text-shadow:var(--schedule-tone-booked-text-shadow)]"
            : "text-[color:var(--schedule-tone-other-text)] [text-shadow:var(--schedule-tone-other-text-shadow)]";

  return (
    <div className={cn(scheduleInsetClass, "min-w-0 px-3 py-2.5", wide && "px-3.5")}>
      <p className="truncate text-[11px] font-black tracking-[0.02em] text-[color:var(--client-muted)]">{label}</p>
      {tone ? (
        <div className="mt-2 flex items-center gap-2">
          <span className={cn("schedule-status-dot h-2.5 w-2.5 rounded-full", statusDotClassName)} />
          <strong className={cn("truncate text-[14px] font-black", statusTextClassName)}>{value}</strong>
        </div>
      ) : (
        <strong className={cn("mt-2 block truncate text-[15px] font-black text-[color:var(--client-text)]", wide && "text-base")}>
          {value}
        </strong>
      )}
    </div>
  );
}

function AgendaItemCard({
  item,
  hasConflict,
  onOpen,
  onInvite
}: {
  item: TechnicianCalendarItem;
  hasConflict: boolean;
  onOpen: (item: TechnicianCalendarItem) => void;
  onInvite?: (item: TechnicianCalendarItem) => void;
}) {
  const itemSurface = getItemSurfacePresentation(item, hasConflict);
  const itemBadge = getItemBadgePresentation(item, hasConflict);

  return (
    <article
      className={cn("w-full rounded-[18px] border px-3.5 py-3 text-left transition", itemSurface.className)}
      style={itemSurface.style}
    >
      <button className="block w-full text-left" onClick={() => onOpen(item)} type="button">
        <div className="flex flex-wrap items-center gap-2">
          <ScheduleBadge style={itemBadge.style} tone={itemBadge.tone}>{getItemDisplayLabel(item)}</ScheduleBadge>
          {item.transferStatus ? <ScheduleBadge tone={getTransferTone(item.transferStatus)}>{getTransferStatusLabel(item.transferStatus)}</ScheduleBadge> : null}
          {item.badgeLabel ? <ScheduleBadge tone="neutral">{item.badgeLabel}</ScheduleBadge> : null}
        </div>
        <div className="mt-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-black">{item.title}</h3>
            <p className="mt-1 text-xs font-bold opacity-75">
              {item.startTime} - {item.endTime} · {item.subtitle}
            </p>
            {item.note ? <p className="mt-2 text-xs leading-5 opacity-80">{item.note}</p> : null}
          </div>
          {typeof item.amount === "number" ? <strong className="text-sm font-black">{formatCurrency(item.amount)}</strong> : null}
        </div>
      </button>
      {onInvite ? (
        <button
          className="mt-3 inline-flex items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_62%,transparent)] px-3 py-1.5 text-[11px] font-black"
          onClick={() => onInvite(item)}
          type="button"
        >
          邀请
        </button>
      ) : null}
    </article>
  );
}

const scheduleDraftSnapMinutes = 15;
const scheduleDraftMinDurationMinutes = 30;

type ScheduleDraftDragMode = "resize-start" | "resize-end";

function snapScheduleDraftMinute(value: number) {
  return Math.round(value / scheduleDraftSnapMinutes) * scheduleDraftSnapMinutes;
}

function clampScheduleDraftMinute(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getScheduleDraftPointerMinute(event: { clientY: number }, element: HTMLElement, rowHeight: number) {
  const rect = element.getBoundingClientRect();
  const relativeY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  const rawMinute = (relativeY / rowHeight) * 60;

  return clampScheduleDraftMinute(snapScheduleDraftMinute(rawMinute), 0, 24 * 60 - 1);
}

function normalizeScheduleDraftRange(startMinute: number, endCandidate: number) {
  const clampedEnd = clampScheduleDraftMinute(snapScheduleDraftMinute(endCandidate), 0, 24 * 60 - 1);

  if (clampedEnd >= startMinute) {
    return {
      start: startMinute,
      end: clampScheduleDraftMinute(Math.max(clampedEnd, startMinute + scheduleDraftMinDurationMinutes), 0, 24 * 60 - 1)
    };
  }

  return {
    start: clampScheduleDraftMinute(Math.min(clampedEnd, startMinute - scheduleDraftMinDurationMinutes), 0, 24 * 60 - 1),
    end: startMinute
  };
}

function DayTimeline({
  date,
  items,
  conflictItemIds,
  onOpenItem,
  onCreate
}: {
  date: string;
  items: TechnicianCalendarItem[];
  conflictItemIds: Set<string>;
  onOpenItem: (item: TechnicianCalendarItem) => void;
  onCreate?: (date: string, startTime: string, endTime: string) => void;
}) {
  const { backgroundItems, foregroundLayouts, laneCount } = buildTimelineLayouts(items);
  const rowHeight = 64;
  const totalHeight = rowHeight * 24;
  const [draftRange, setDraftRange] = useState<MinuteRange | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasPressRef = useRef<{ moved: boolean; x: number; y: number } | null>(null);
  const dragModeRef = useRef<ScheduleDraftDragMode | null>(null);
  const dragRangeRef = useRef<MinuteRange | null>(null);
  const resizeBaseRangeRef = useRef<MinuteRange | null>(null);
  const setActiveDraftRange = (range: MinuteRange | null) => {
    dragRangeRef.current = range;
    setDraftRange(range);
  };

  useEffect(() => {
    dragModeRef.current = null;
    resizeBaseRangeRef.current = null;
    canvasPressRef.current = null;
    setActiveDraftRange(null);
  }, [date]);

  const updateDraftRangeFromPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    const mode = dragModeRef.current;

    if (!canvas || !mode) {
      return;
    }

    const pointerMinute = getScheduleDraftPointerMinute(event, canvas, rowHeight);

    const baseRange = resizeBaseRangeRef.current ?? dragRangeRef.current;

    if (!baseRange) {
      return;
    }

    if (mode === "resize-start") {
      setActiveDraftRange({
        end: baseRange.end,
        start: clampScheduleDraftMinute(pointerMinute, 0, baseRange.end - scheduleDraftMinDurationMinutes)
      });
      return;
    }

    setActiveDraftRange({
      end: clampScheduleDraftMinute(pointerMinute, baseRange.start + scheduleDraftMinDurationMinutes, 24 * 60 - 1),
      start: baseRange.start
    });
  };
  const handleDraftCanvasClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onCreate || event.button !== 0) {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("button,a,input,textarea,[data-schedule-range-handle],[data-schedule-create-action],[data-schedule-draft-range-block]")) {
      return;
    }

    if (canvasPressRef.current?.moved) {
      canvasPressRef.current = null;
      return;
    }

    canvasPressRef.current = null;
    const startMinute = clampScheduleDraftMinute(getScheduleDraftPointerMinute(event, event.currentTarget, rowHeight), 0, 24 * 60 - scheduleDraftMinDurationMinutes);
    const range = normalizeScheduleDraftRange(startMinute, startMinute + scheduleDraftMinDurationMinutes);

    resizeBaseRangeRef.current = range;
    setActiveDraftRange(range);
  };
  const handleDraftCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onCreate || (event.button !== 0 && event.pointerType === "mouse")) {
      canvasPressRef.current = null;
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("button,a,input,textarea,[data-schedule-range-handle],[data-schedule-create-action],[data-schedule-draft-range-block]")) {
      canvasPressRef.current = null;
      return;
    }

    canvasPressRef.current = {
      moved: false,
      x: event.clientX,
      y: event.clientY
    };
  };
  const handleDraftCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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
    resizeBaseRangeRef.current = dragRangeRef.current;
  };
  const handleDraftPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragModeRef.current = null;
    resizeBaseRangeRef.current = dragRangeRef.current;
  };
  const handleDraftResizePointerDown = (mode: ScheduleDraftDragMode, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draftRange || (event.button !== 0 && event.pointerType === "mouse")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragModeRef.current = mode;
    resizeBaseRangeRef.current = draftRange;
    dragRangeRef.current = draftRange;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const createDraftEvent = () => {
    if (!draftRange || !onCreate) {
      return;
    }

    onCreate(date, minutesToTime(draftRange.start), minutesToTime(draftRange.end));
  };

  return (
    <div className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)]">
      <div className="grid grid-cols-[68px,1fr]">
        <div className="border-r border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,transparent)]">
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              className="flex h-16 w-full items-start justify-center border-b border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] px-2 py-2.5 text-[11px] font-black text-[color:var(--client-muted)] last:border-b-0"
              key={hour}
            >
              {padNumber(hour)}:00
            </div>
          ))}
        </div>
        <div
          aria-label={onCreate ? "点击创建新行程时间，拖动手柄调整时长" : "日程时间轴"}
          className="relative select-none touch-pan-y"
          data-schedule-create-canvas="true"
          onClick={handleDraftCanvasClick}
          onPointerCancel={() => {
            canvasPressRef.current = null;
          }}
          onPointerDown={handleDraftCanvasPointerDown}
          onPointerMove={handleDraftCanvasPointerMove}
          ref={canvasRef}
          style={{ height: totalHeight }}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              className={cn(
                "absolute inset-x-0 border-b border-[color:color-mix(in_srgb,var(--client-line)_56%,transparent)] px-3 text-left last:border-b-0",
                onCreate && "hover:bg-[color:color-mix(in_srgb,var(--client-elevated)_58%,transparent)]"
              )}
              key={hour}
              style={{ top: hour * rowHeight, height: rowHeight }}
            >
              <span className="sr-only">{onCreate ? `点击添加 ${padNumber(hour)}:00 行程` : `${padNumber(hour)}:00 时段`}</span>
            </div>
          ))}

          {backgroundItems.map((item) => {
            const range = intervalToRange(item);
            const hasConflict = conflictItemIds.has(item.id);
            const itemSurface = getItemSurfacePresentation(item, hasConflict);
            const itemBadge = getItemBadgePresentation(item, hasConflict);
            return (
              <button
                className={cn("absolute left-2 right-2 rounded-[18px] border px-3 py-2.5 text-left", itemSurface.className)}
                key={item.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenItem(item);
                }}
                style={{
                  ...itemSurface.style,
                  top: (range.start / 60) * rowHeight + 6,
                  height: Math.max((Math.max(range.end - range.start, 30) / 60) * rowHeight - 12, 54),
                  opacity: item.kind === "availability" ? 0.82 : 0.9
                }}
                type="button"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ScheduleBadge style={itemBadge.style} tone={itemBadge.tone}>{getItemDisplayLabel(item)}</ScheduleBadge>
                  {item.transferStatus ? <ScheduleBadge tone={getTransferTone(item.transferStatus)}>{getTransferStatusLabel(item.transferStatus)}</ScheduleBadge> : null}
                </div>
                <h3 className="mt-2 text-sm font-black">{item.title}</h3>
                <p className="mt-1 text-xs font-bold opacity-75">
                  {item.startTime} - {item.endTime}
                </p>
              </button>
            );
          })}

          {foregroundLayouts.map(({ item, lane, range }) => {
            const width = laneCount > 1 ? `calc((100% - 16px) / ${laneCount})` : "calc(100% - 16px)";
            const left = laneCount > 1 ? `calc(8px + (${lane} * (100% - 16px) / ${laneCount}))` : "8px";
            const hasConflict = conflictItemIds.has(item.id);
            const itemSurface = getItemSurfacePresentation(item, hasConflict);
            const itemBadge = getItemBadgePresentation(item, hasConflict);
            return (
              <button
                className={cn(
                  "absolute overflow-hidden rounded-[16px] border px-3 py-2.5 text-left shadow-[0_12px_28px_var(--schedule-semantic-shadow)]",
                  itemSurface.className
                )}
                key={item.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenItem(item);
                }}
                style={{
                  ...itemSurface.style,
                  left,
                  width,
                  top: (range.start / 60) * rowHeight + 6,
                  height: Math.max((Math.max(range.end - range.start, 30) / 60) * rowHeight - 12, 56)
                }}
                type="button"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ScheduleBadge style={itemBadge.style} tone={itemBadge.tone}>{getItemDisplayLabel(item)}</ScheduleBadge>
                  {item.transferStatus ? <ScheduleBadge tone={getTransferTone(item.transferStatus)}>{getTransferStatusLabel(item.transferStatus)}</ScheduleBadge> : null}
                </div>
                <h3 className="mt-2 text-sm font-black leading-5">{item.title}</h3>
                <p className="mt-1 text-xs font-bold opacity-75">
                  {item.startTime} - {item.endTime}
                </p>
                <p className="mt-2 truncate text-xs leading-5 opacity-80">{item.subtitle}</p>
              </button>
            );
          })}

          {draftRange && onCreate ? (
            <ScheduleDraftRangeBlock
              action={(
                <button
                  className="rounded-full bg-[color:var(--client-primary)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary-contrast)] shadow-[0_10px_20px_color-mix(in_srgb,var(--client-primary)_26%,transparent)]"
                  data-schedule-create-action="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    createDraftEvent();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  type="button"
                >
                  创建
                </button>
              )}
              className="left-2 right-2"
              onEndHandlePointerDown={(event) => handleDraftResizePointerDown("resize-end", event)}
              onHandlePointerCancel={handleDraftPointerCancel}
              onHandlePointerMove={handleDraftPointerMove}
              onHandlePointerUp={handleDraftPointerUp}
              onStartHandlePointerDown={(event) => handleDraftResizePointerDown("resize-start", event)}
              style={{
                top: (draftRange.start / 60) * rowHeight + 6,
                height: Math.max((Math.max(draftRange.end - draftRange.start, scheduleDraftMinDurationMinutes) / 60) * rowHeight - 12, 58)
              }}
              subtitle="拖动上下手柄调整时间"
              timeRange={`${minutesToTime(draftRange.start)} - ${minutesToTime(draftRange.end)}`}
              title="新建行程"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyDayState({
  date,
  onCreate,
  title = "这一天还没有行程",
  caption = "可以直接在空白时间新建可排班、请假、锁定、休息或移动安排。",
  createLabel = "添加行程"
}: {
  date: string;
  onCreate: (date: string, startTime: string, endTime: string) => void;
  title?: string;
  caption?: string;
  createLabel?: string;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-4 text-sm leading-6 text-[color:var(--client-muted)]">
      <strong className="block text-[color:var(--client-text)]">{title}</strong>
      <p className="mt-1">{caption}</p>
      <Button className={cn("mt-3", getScheduleButtonClassName("primary"))} onClick={() => onCreate(date, "10:00", "11:00")} size="sm">
        {createLabel}
      </Button>
    </div>
  );
}

const scheduleEventCategoryOptions: Array<{ preset: TechnicianScheduleEventPreset; label: string }> = [
  { preset: "availability", label: "可排班" },
  { preset: "leave", label: "请假" },
  { preset: "locked", label: "锁定" },
  { preset: "rest", label: "休息" },
  { preset: "travel", label: "移动" },
  { preset: "meeting", label: "会议" },
  { preset: "meal", label: "会食" },
  { preset: "date", label: "约会" },
  { preset: "holiday", label: "假期" }
];

export type TechnicianScheduleWorkspaceCopy = {
  summaryLabels?: {
    confirmedHours?: string;
    bookedHours?: string;
    freeHours?: string;
    tentativeHours?: string;
  };
  tableInfo?: string;
  tableInfoLabel?: string;
  tableTitle?: string;
  countLabel?: string;
  countValue?: (brief: ReturnType<typeof computeScheduleBrief>) => string;
  statusLabel?: string;
  revenueLabel?: string;
  createButtonLabel?: string;
  displayInfoEntries?: string;
  displayInfoAll?: string;
  displayInfoLabel?: string;
  displayTitle?: string;
  dayHeadingSuffix?: string;
  emptyTitle?: string;
  emptyCaption?: string;
};

export type TechnicianScheduleWorkspaceProps = {
  basePath?: string;
  copy?: TechnicianScheduleWorkspaceCopy;
  detailActor?: ScheduleDetailTargetActor;
  revenueSlot?: "revenue" | "create";
};

function ScheduleCategoryIcon({ preset, className }: { preset: TechnicianScheduleEventPreset; className?: string }) {
  const sharedProps = {
    className: cn("h-4 w-4", className),
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 20 20"
  };

  switch (preset) {
    case "availability":
      return (
        <svg {...sharedProps}>
          <circle cx="10" cy="10" r="6.2" />
          <path d="M10 6.7v3.7l2.4 1.6" />
        </svg>
      );
    case "leave":
      return (
        <svg {...sharedProps}>
          <circle cx="10" cy="10" r="6.2" />
          <path d="M6.8 13.2 13.2 6.8" />
        </svg>
      );
    case "locked":
      return (
        <svg {...sharedProps}>
          <rect height="6.6" rx="1.7" width="8.2" x="5.9" y="9.1" />
          <path d="M7.4 9.1V7.6A2.6 2.6 0 0 1 10 5a2.6 2.6 0 0 1 2.6 2.6v1.5" />
        </svg>
      );
    case "rest":
      return (
        <svg {...sharedProps}>
          <path d="M6.2 6.2h5.2v4.1a2.6 2.6 0 0 1-2.6 2.6h0a2.6 2.6 0 0 1-2.6-2.6Z" />
          <path d="M11.4 7.2h1.8a1.8 1.8 0 0 1 0 3.6h-1.8" />
          <path d="M5.8 15.2h8.4" />
        </svg>
      );
    case "travel":
      return (
        <svg {...sharedProps}>
          <path d="M10 15.5s4-3.9 4-7.2A4 4 0 0 0 6 8.3c0 3.3 4 7.2 4 7.2Z" />
          <circle cx="10" cy="8.4" r="1.5" />
        </svg>
      );
    case "meeting":
      return (
        <svg {...sharedProps}>
          <circle cx="7.1" cy="8" r="1.8" />
          <circle cx="12.9" cy="8" r="1.8" />
          <path d="M4.9 14.4c.5-1.7 1.8-2.6 3.7-2.6s3.2.9 3.7 2.6" />
          <path d="M10.2 14.4c.4-1.3 1.4-2 2.7-2 1.4 0 2.4.7 2.9 2" />
        </svg>
      );
    case "meal":
      return (
        <svg {...sharedProps}>
          <path d="M7 4.8v5.7" />
          <path d="M5.6 4.8v3.1" />
          <path d="M8.4 4.8v3.1" />
          <path d="M7 10.5v4.7" />
          <path d="M12.8 4.8c1.4 1.6 1.4 4.1 0 5.7v4.7" />
        </svg>
      );
    case "date":
      return (
        <svg {...sharedProps}>
          <path d="M10 15.2 5.2 10.5a3 3 0 0 1 4.2-4.2L10 6.9l.6-.6a3 3 0 0 1 4.2 4.2Z" />
        </svg>
      );
    case "holiday":
      return (
        <svg {...sharedProps}>
          <circle cx="10" cy="10" r="2.6" />
          <path d="M10 4.4v1.7M10 13.9v1.7M4.4 10h1.7M13.9 10h1.7M6.1 6.1l1.2 1.2M12.7 12.7l1.2 1.2M13.9 6.1l-1.2 1.2M7.3 12.7l-1.2 1.2" />
        </svg>
      );
    default:
      return null;
  }
}

export function TechnicianScheduleWorkspace({
  basePath = "/technician/schedule",
  copy,
  detailActor = "technician",
  revenueSlot = "revenue"
}: TechnicianScheduleWorkspaceProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const scheduleThemeRootClass = useScheduleThemeRootClassName();
  const { customers, technicians, currentStore, currentTechnician, items, assignedShifts, visibleBookings, visibleCustomEvents, incomingInvitations } =
    useTechnicianScheduleContext();
  const [view, setView] = useState<TechnicianScheduleView>("day");
  const [densityMode, setDensityMode] = useState<TechnicianScheduleDensityMode>("entries");
  const [anchorDate, setAnchorDate] = useState(getTodayDateKey());
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
  const [banner, setBanner] = useState<ScheduleBannerMessage | null>(null);
  const [inviteItem, setInviteItem] = useState<TechnicianCalendarItem | null>(null);
  const [inviteTargetFilter, setInviteTargetFilter] = useState<ScheduleSyncTargetFilterTag>("all");
  const period = getPeriod(view, anchorDate);

  useEffect(() => {
    const nextSelectedDate = resolveSelectedScheduleDate(view, anchorDate, selectedDate);
    if (nextSelectedDate !== selectedDate) {
      setSelectedDate(nextSelectedDate);
    }
  }, [anchorDate, selectedDate, view]);

  const summary = computeScheduleSummary(assignedShifts, visibleBookings, visibleCustomEvents, period);
  const brief = computeScheduleBrief(items, period);
  const summaryLabels = {
    confirmedHours: copy?.summaryLabels?.confirmedHours ?? "确定上班",
    bookedHours: copy?.summaryLabels?.bookedHours ?? "已定预约",
    freeHours: copy?.summaryLabels?.freeHours ?? "空闲",
    tentativeHours: copy?.summaryLabels?.tentativeHours ?? "待定"
  };
  const countLabel = copy?.countLabel ?? "单数";
  const countValue = copy?.countValue?.(brief) ?? `${brief.orderCount} 单`;
  const periodItems = items.filter((item) => isDateInPeriod(item.date, period));
  const selectedDateItems = periodItems.filter((item) => item.date === selectedDate);
  const groupedPeriodItems = groupItemsByDate(periodItems);
  const selectedDateConflictItemIds = buildConflictItemIdSet(selectedDateItems);
  const inviteTargets = buildContactTargets(currentStore, currentTechnician.id, technicians, customers).filter((target) => target.type === "technician" || target.type === "friend");
  const filteredInviteTargets = inviteTargets.filter((target) => inviteTargetFilter === "all" || target.type === inviteTargetFilter);

  const openItem = (item: TechnicianCalendarItem) => {
    const target = resolveScheduleEventDetailTarget(item, detailActor);

    if (target.action === "open" && target.targetType === "order_detail") {
      const returnTo = buildCurrentRoute(location);
      navigate(withReturnTo(target.route, returnTo), { state: { returnTo } });
      return;
    }

    navigate(`${basePath}/events/${item.sourceId}`);
  };

  const openCreate = (date: string, startTime: string, endTime: string) => {
    navigate(`${basePath}/new?date=${date}&start=${startTime}&end=${endTime}`);
  };

  const changeView = (nextView: TechnicianScheduleView) => {
    setView(nextView);
    setSelectedDate(resolveSelectedScheduleDate(nextView, anchorDate, selectedDate));
  };

  const shiftPeriod = (direction: -1 | 1) => {
    const nextSelection = shiftScheduleSelection(view, anchorDate, selectedDate, direction);
    setAnchorDate(nextSelection.anchorDate);
    setSelectedDate(nextSelection.selectedDate);
  };

  const respondInvite = (invitationId: string, action: "accept" | "reject") => {
    const result = respondToTechnicianScheduleTransferInvitation(invitationId, action);
    setBanner({ tone: result.ok ? "green" : "red", text: result.message });
  };

  const renderSelectedDateContent = () => {
    if (densityMode === "all") {
      return (
        <DayTimeline
          conflictItemIds={selectedDateConflictItemIds}
          date={selectedDate}
          items={selectedDateItems}
          onCreate={openCreate}
          onOpenItem={openItem}
        />
      );
    }

    if (selectedDateItems.length === 0) {
      return (
        <EmptyDayState
          caption={copy?.emptyCaption}
          createLabel={copy?.createButtonLabel}
          date={selectedDate}
          onCreate={openCreate}
          title={copy?.emptyTitle}
        />
      );
    }

    return (
      <div className="space-y-3">
        {selectedDateItems.map((item) => (
          <AgendaItemCard hasConflict={selectedDateConflictItemIds.has(item.id)} item={item} key={item.id} onInvite={setInviteItem} onOpen={openItem} />
        ))}
      </div>
    );
  };

  return (
    <div className={cn(scheduleThemeRootClass, "space-y-3")}>
      <section className={cn(schedulePanelClass, "p-3")}>
        <div className="grid grid-cols-4 gap-2">
          <SummaryCard label={summaryLabels.confirmedHours} value={summary.confirmedHours} />
          <SummaryCard label={summaryLabels.bookedHours} value={summary.bookedHours} />
          <SummaryCard label={summaryLabels.freeHours} value={summary.freeHours} />
          <SummaryCard label={summaryLabels.tentativeHours} value={summary.tentativeHours} />
        </div>
      </section>

      <section className={cn(schedulePanelClass, "p-3")}>
        <ScheduleSectionHeading
          info={copy?.tableInfo ?? "按当前日 / 周 / 月视图切换查看同一套排班数据，统计与下方列表都会跟随当前周期同步。"}
          label={copy?.tableInfoLabel ?? "查看排班表说明"}
          right={
            <ScheduleViewSegmentedTabs onChange={(nextView) => changeView(nextView as TechnicianScheduleView)} value={view} />
          }
          title={copy?.tableTitle ?? "排班表"}
        />

        <div className="client-sticky-control-panel mt-3">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
            <button
              aria-label={getScheduleShiftButtonLabel(view, -1)}
              className="grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-sm font-black text-[color:var(--client-text)]"
              onClick={() => shiftPeriod(-1)}
              type="button"
            >
              ‹
            </button>
            <div className="text-center">
              <strong className="block text-sm font-black text-[color:var(--client-text)]">
                <ScheduleDynamicText>{period.label}</ScheduleDynamicText>
              </strong>
              <span className="mt-0.5 block text-[11px] font-bold text-[color:var(--client-muted)]">{currentStore.name} · {currentTechnician.nickname?.trim() || currentTechnician.name}</span>
            </div>
            <button
              aria-label={getScheduleShiftButtonLabel(view, 1)}
              className="grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-sm font-black text-[color:var(--client-text)]"
              onClick={() => shiftPeriod(1)}
              type="button"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[0.9fr_0.9fr_1.35fr] gap-2">
          <BriefCard label={countLabel} value={countValue} />
          <BriefCard
            label={copy?.statusLabel ?? "状态"}
            tone={brief.hasConflict ? "red" : "green"}
            value={brief.hasConflict ? "有冲突" : "正常"}
          />
          {revenueSlot === "create" ? (
            <button
              className={cn(scheduleInsetClass, "focus-ring min-w-0 px-3.5 py-2.5 text-left transition hover:border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)]")}
              onClick={() => openCreate(selectedDate, "10:00", "11:00")}
              type="button"
            >
              <p className="truncate text-[11px] font-black tracking-[0.02em] text-[color:var(--client-muted)]">{copy?.revenueLabel ?? "创建"}</p>
              <strong className="mt-2 flex items-center justify-between gap-2 text-base font-black text-[color:var(--client-text)]">
                {copy?.createButtonLabel ?? "创建"}
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]">+</span>
              </strong>
            </button>
          ) : (
            <BriefCard label={copy?.revenueLabel ?? "预计流水"} value={formatCurrency(brief.estimatedRevenue)} wide />
          )}
        </div>

        {banner ? (
          <div className="mt-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-3 py-2.5">
            <ScheduleBadge tone={banner.tone}>{banner.text}</ScheduleBadge>
          </div>
        ) : null}

        {incomingInvitations.length > 0 ? (
          <div className="mt-3 space-y-2.5">
            {incomingInvitations.map(({ invitation, request, shift, requesterName }) => (
              <article
                className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-warm)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--client-warm)_12%,var(--client-surface)_88%)] px-3.5 py-3"
                key={invitation.id}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ScheduleBadge tone="yellow">新的转让邀请</ScheduleBadge>
                      <ScheduleBadge tone="neutral">{requesterName}</ScheduleBadge>
                    </div>
                    <h3 className="mt-2 text-sm font-black text-[color:var(--client-text)]">{shift.title}</h3>
                    <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">
                      {formatShiftSummary(shift)} · 需要 {request.requestedCount} 人
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button className={getScheduleButtonClassName("primary")} onClick={() => respondInvite(invitation.id, "accept")} size="sm">
                      接受
                    </Button>
                    <Button className={getScheduleButtonClassName("secondary")} onClick={() => respondInvite(invitation.id, "reject")} size="sm" variant="secondary">
                      拒绝
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        <div className="mt-4 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)] p-3">
          <ScheduleSectionHeading
            info={densityMode === "entries" ? (copy?.displayInfoEntries ?? "只展示已有事件，列表更紧凑。") : (copy?.displayInfoAll ?? "显示完整时间轴，可直接点击空白时间新建行程。")}
            label={copy?.displayInfoLabel ?? "查看排班展示区说明"}
            right={
              <div className="client-segmented-tabs inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] p-1">
              {([
                ["entries", "仅行程"],
                ["all", "全时间"]
              ] as Array<[TechnicianScheduleDensityMode, string]>).map(([mode, label]) => (
                <button
                  className={cn(
                    "client-segmented-tab rounded-full px-3.5 py-1.5 text-sm font-black transition",
                    densityMode === mode
                      ? "bg-[color:var(--client-primary)] text-[#090806] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
                      : "text-[color:var(--client-muted)]"
                  )}
                  key={mode}
                  onClick={() => setDensityMode(mode)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            }
            title={copy?.displayTitle ?? "排班展示区"}
          />

          {view === "day" ? (
            <div className="mt-3">{renderSelectedDateContent()}</div>
          ) : view === "week" ? (
            <div className="mt-3 space-y-3">
              <div className="sticky top-[var(--client-schedule-substicky-top)] z-[8] grid grid-cols-7 gap-2 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,transparent)] p-1.5 backdrop-blur-xl">
                {getWeekDates(anchorDate).map((date) => {
                  const count = groupedPeriodItems[date]?.length ?? 0;
                  const isSelected = selectedDate === date;
                  return (
                    <button
                      className={cn(
                        "relative flex min-h-[72px] min-w-0 flex-col items-center justify-center rounded-[16px] border px-1 py-2 text-center transition",
                        isSelected
                          ? "border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                          : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-[color:var(--client-muted)]"
                      )}
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      type="button"
                    >
                      <span className="block text-[11px] font-bold">{getWeekdayLabel(date)}</span>
                      <strong className="mt-1 block text-[13px] font-black leading-none tracking-[-0.03em] sm:text-[14px] md:text-[15px]">
                        <ScheduleDynamicText>{formatShortDate(date)}</ScheduleDynamicText>
                      </strong>
                      {count > 0 ? (
                        <NotificationBadge className="absolute right-[-6px] top-[-6px] z-10" count={count} size="sm" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-black text-[color:var(--client-text)]">
                    <ScheduleDynamicText>{formatLongDate(selectedDate)}</ScheduleDynamicText> {copy?.dayHeadingSuffix ?? "排班"}
                  </h3>
                  <Button className={getScheduleButtonClassName("secondary")} onClick={() => openCreate(selectedDate, "10:00", "11:00")} size="sm" variant="secondary">
                    添加行程
                  </Button>
                </div>
                {renderSelectedDateContent()}
              </section>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="sticky top-[var(--client-schedule-substicky-top)] z-[8] grid grid-cols-7 gap-1 rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,transparent)] px-2 py-2 text-center text-[11px] font-black text-[color:var(--client-muted)] backdrop-blur-xl">
                {getWeekdayHeaderLabel().map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {getMonthGridDates(anchorDate).map((date) => {
                  const inMonth = date.slice(0, 7) === anchorDate.slice(0, 7);
                  const dateItems = groupedPeriodItems[date] ?? [];
                  const isSelected = selectedDate === date;
                  return (
                    <button
                      className={cn(
                        "relative min-h-[56px] rounded-[12px] border px-2 py-1.5 text-left transition",
                        isSelected
                          ? "border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:var(--client-primary-soft)]"
                          : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)]",
                        !inMonth && "opacity-35"
                      )}
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      type="button"
                    >
                      <strong className="block text-[13px] font-black leading-none text-[color:var(--client-text)] sm:text-[14px]">
                        {Number(date.slice(-2))}
                      </strong>
                      {dateItems.length > 0 ? (
                        <NotificationBadge className="absolute right-[-6px] top-[-6px] z-10" count={dateItems.length} size="sm" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-black text-[color:var(--client-text)]">
                    <ScheduleDynamicText>{formatLongDate(selectedDate)}</ScheduleDynamicText> {copy?.dayHeadingSuffix ?? "排班"}
                  </h3>
                  <Button className={getScheduleButtonClassName("secondary")} onClick={() => openCreate(selectedDate, "10:00", "11:00")} size="sm" variant="secondary">
                    添加行程
                  </Button>
                </div>
                {renderSelectedDateContent()}
              </section>
            </div>
          )}
        </div>
      </section>

      <Drawer
        defaultWidth={520}
        maxWidth={720}
        minWidth={320}
        onClose={() => setInviteItem(null)}
        open={Boolean(inviteItem)}
        resizable={false}
        title="邀请好友或同事"
      >
        {inviteItem ? (
          <div className="space-y-4">
            <div className={cn(scheduleInsetClass, "px-4 py-3")}>
              <ScheduleBadge tone="blue">日程邀请</ScheduleBadge>
              <h3 className="mt-2 text-base font-black text-[color:var(--client-text)]">{inviteItem.title}</h3>
              <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">
                {formatLongDate(inviteItem.date)} · {inviteItem.startTime} - {inviteItem.endTime}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {scheduleSyncTargetFilterOptions
                .filter((option) => option.value === "all" || option.value === "technician" || option.value === "friend")
                .map((option) => (
                  <button
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-black transition",
                      inviteTargetFilter === option.value
                        ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_80%,transparent)] text-[color:var(--client-muted)]"
                    )}
                    key={option.value}
                    onClick={() => setInviteTargetFilter(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
            </div>

            <div className="space-y-2.5">
              {filteredInviteTargets.map((target) => (
                <SyncTargetProfileCard
                  actionLabel="发送邀请"
                  key={`${target.type}-${target.id}`}
                  onClick={() => {
                    setBanner({ tone: "green", text: `已向 ${target.label} 发送日程邀请。` });
                    setInviteItem(null);
                  }}
                  target={target}
                />
              ))}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function EmptyAppointmentState({ date }: { date: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-4 text-sm leading-6 text-[color:var(--client-muted)]">
      <strong className="block text-[color:var(--client-text)]">
        <ScheduleDynamicText>{formatLongDate(date)}</ScheduleDynamicText> 暂无预约
      </strong>
      <p className="mt-1">切换日期或视图后，可以继续查看全店预约、班次背景和待确认时段。</p>
    </div>
  );
}

type MerchantAppointmentScheduleSurface = "desktop" | "mobile";

export function MerchantAppointmentScheduleWorkspace({
  storeId,
  surface = "mobile"
}: {
  storeId?: string;
  surface?: MerchantAppointmentScheduleSurface;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { stores, technicians } = useEntityStore();
  const snapshot = useTechnicianScheduleStore();
  const dispatchSnapshot = useDispatchCenterStore();
  const activeStoreId = storeId ?? session?.linkedStoreId ?? stores[0]?.id ?? "";
  const currentStore = stores.find((store) => store.id === activeStoreId) ?? stores[0];
  const isDesktopSurface = surface === "desktop";
  const [view, setView] = useState<TechnicianScheduleView>("day");
  const [densityMode, setDensityMode] = useState<TechnicianScheduleDensityMode>("entries");
  const [anchorDate, setAnchorDate] = useState(getTodayDateKey());
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
  const [banner, setBanner] = useState<ScheduleBannerMessage | null>(null);
  const [selectedArrangementOrderId, setSelectedArrangementOrderId] = useState<string | null>(null);
  const [hasAutoFocusedAppointments, setHasAutoFocusedAppointments] = useState(false);
  const period = getPeriod(view, anchorDate);
  const storeShifts = currentStore ? resolveStoreShifts(snapshot, currentStore.id, technicians) : [];
  const scheduleStoreBookings = currentStore ? resolveStoreBookings(snapshot, currentStore.id, storeShifts) : [];
  const scheduleBookingKeys = new Set(scheduleStoreBookings.map(({ booking }) => booking.orderId ?? booking.id));
  const arrangementBackfillBookings = currentStore
    ? dispatchSnapshot.arrangements
        .filter((arrangement) => arrangement.storeId === currentStore.id && arrangement.status !== "cancelled" && !scheduleBookingKeys.has(arrangement.orderId))
        .map((arrangement) => {
          const technicianShifts = arrangement.technicianId
            ? storeShifts.filter((shift) => shift.technicianId === arrangement.technicianId)
            : [];
          return {
            booking: {
              id: `dispatch-${arrangement.id}`,
              technicianId: arrangement.technicianId ?? "unassigned",
              storeId: arrangement.storeId,
              date: arrangement.date,
              startTime: arrangement.startTime,
              endTime: arrangement.endTime,
              title: arrangement.serviceName,
              customerName: arrangement.customerName,
              amount: arrangement.amount,
              orderId: arrangement.orderId,
              note: arrangement.internalNote || arrangement.note || "调度中心预约安排"
            } satisfies TechnicianScheduleBooking,
            shift: arrangement.technicianId
              ? findContainingShift(technicianShifts, arrangement.date, arrangement.startTime, arrangement.endTime)
              : null
          };
        })
    : [];
  const storeBookings = [...scheduleStoreBookings, ...arrangementBackfillBookings].sort((left, right) =>
    `${left.booking.date} ${left.booking.startTime}`.localeCompare(`${right.booking.date} ${right.booking.startTime}`)
  );
  const firstBookingDate = storeBookings[0]?.booking.date ?? null;
  const hasSelectedDateAppointments = storeBookings.some(({ booking }) => booking.date === selectedDate);
  const items = buildStoreAppointmentCalendarItems(storeShifts, storeBookings, technicians);
  const summary = computeStoreScheduleSummary(storeShifts, storeBookings, period);
  const brief = computeStoreAppointmentBrief(items, storeBookings, period);
  const periodItems = items.filter((item) => isDateInPeriod(item.date, period));
  const periodAppointmentItems = periodItems.filter((item) => item.sourceType === "booking");
  const selectedDateItems = periodItems.filter((item) => item.date === selectedDate);
  const selectedDateAppointmentItems = periodAppointmentItems.filter((item) => item.date === selectedDate);
  const groupedPeriodAppointments = groupItemsByDate(periodAppointmentItems);
  const selectedDateConflictItemIds = buildStoreBookingConflictItemIdSet(
    storeBookings.filter(({ booking }) => booking.date === selectedDate)
  );
  const selectedArrangement =
    currentStore && selectedArrangementOrderId
      ? getDispatchArrangementByOrderId(currentStore.id, selectedArrangementOrderId)
      : null;

  useEffect(() => {
    const nextSelectedDate = resolveSelectedScheduleDate(view, anchorDate, selectedDate);
    if (nextSelectedDate !== selectedDate) {
      setSelectedDate(nextSelectedDate);
    }
  }, [anchorDate, selectedDate, view]);

  useEffect(() => {
    if (hasAutoFocusedAppointments || !firstBookingDate) {
      return;
    }

    setHasAutoFocusedAppointments(true);

    if (!hasSelectedDateAppointments) {
      setAnchorDate(firstBookingDate);
      setSelectedDate(firstBookingDate);
    }
  }, [firstBookingDate, hasAutoFocusedAppointments, hasSelectedDateAppointments]);

  const changeView = (nextView: TechnicianScheduleView) => {
    setView(nextView);
    setSelectedDate(resolveSelectedScheduleDate(nextView, anchorDate, selectedDate));
  };

  const shiftPeriod = (direction: -1 | 1) => {
    const nextSelection = shiftScheduleSelection(view, anchorDate, selectedDate, direction);
    setAnchorDate(nextSelection.anchorDate);
    setSelectedDate(nextSelection.selectedDate);
  };

  const openItem = (item: TechnicianCalendarItem) => {
    if (item.sourceType !== "booking") {
      setBanner({ tone: "neutral", text: "班次背景用于辅助判断预约容量，请从排班页调整班次。" });
      return;
    }

    const target = resolveScheduleEventDetailTarget(item, isDesktopSurface ? "merchant-admin" : "merchant");

    if (target.action === "open" && target.targetType === "order_detail") {
      const returnTo = buildCurrentRoute(location);
      navigate(withReturnTo(target.route, returnTo), { state: { returnTo } });
      return;
    }

    const booking = storeBookings.find(({ booking: current }) => current.orderId === item.sourceId || current.id === item.appointmentId);
    if (!booking?.booking.orderId) {
      setBanner({ tone: "yellow", text: "这条预约暂未绑定订单详情。" });
      return;
    }

    if (isDesktopSurface) {
      const arrangement = currentStore ? getDispatchArrangementByOrderId(currentStore.id, booking.booking.orderId) : null;
      if (!arrangement) {
        setSelectedArrangementOrderId(null);
        setBanner({ tone: "yellow", text: "这条预约暂未绑定后台预约安排详情。" });
        return;
      }

      setBanner(null);
      setSelectedArrangementOrderId(booking.booking.orderId);
      return;
    }

    navigate(`/merchant/schedule/arrangements/${booking.booking.orderId}`);
  };

  const renderSelectedDateContent = () => {
    if (densityMode === "all") {
      if (selectedDateItems.length === 0) {
        return <EmptyAppointmentState date={selectedDate} />;
      }

      return (
        <DayTimeline
          conflictItemIds={selectedDateConflictItemIds}
          date={selectedDate}
          items={selectedDateItems}
          onOpenItem={openItem}
        />
      );
    }

    if (selectedDateAppointmentItems.length === 0) {
      return <EmptyAppointmentState date={selectedDate} />;
    }

    return (
      <div className="space-y-3">
        {selectedDateAppointmentItems.map((item) => (
          <AgendaItemCard hasConflict={selectedDateConflictItemIds.has(item.id)} item={item} key={item.id} onOpen={openItem} />
        ))}
      </div>
    );
  };

  if (!currentStore) {
    return (
      <div className={cn(schedulePanelClass, "p-4 text-sm font-black text-[color:var(--client-muted)]")}>
        暂无可展示的门店预约数据。
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", isDesktopSurface && "merchant-admin-schedule-parity")}>
      <section className={cn(isDesktopSurface ? "merchant-dispatch-surface rounded-[26px] border p-4" : schedulePanelClass, !isDesktopSurface && "p-3")}>
        <div className={cn("grid gap-2", isDesktopSurface ? "md:grid-cols-4" : "grid-cols-4")}>
          <SummaryCard label="确认班次" value={summary.confirmedHours} />
          <SummaryCard label="已定预约" value={summary.bookedHours} />
          <SummaryCard label="可预约" value={summary.freeHours} />
          <SummaryCard label="待确认" value={summary.tentativeHours} />
        </div>
      </section>

      <section className={cn(isDesktopSurface ? "merchant-dispatch-surface rounded-[26px] border p-4" : schedulePanelClass, !isDesktopSurface && "p-3")}>
        <ScheduleSectionHeading
          info="按日、周、月查看全店预约，班次会作为时间轴背景辅助判断预约容量。"
          label="查看预约一览说明"
          right={
            <ScheduleViewSegmentedTabs onChange={(nextView) => changeView(nextView as TechnicianScheduleView)} value={view} />
          }
          title="预约一览"
        />

        <div className="client-sticky-control-panel mt-3">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
            <button
              aria-label={getScheduleShiftButtonLabel(view, -1)}
              className="grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-sm font-black text-[color:var(--client-text)]"
              onClick={() => shiftPeriod(-1)}
              type="button"
            >
              ‹
            </button>
            <div className="text-center">
              <strong className="block text-sm font-black text-[color:var(--client-text)]">
                <ScheduleDynamicText>{period.label}</ScheduleDynamicText>
              </strong>
              <span className="mt-0.5 block text-[11px] font-bold text-[color:var(--client-muted)]">{currentStore.name} · 全店预约</span>
            </div>
            <button
              aria-label={getScheduleShiftButtonLabel(view, 1)}
              className="grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-sm font-black text-[color:var(--client-text)]"
              onClick={() => shiftPeriod(1)}
              type="button"
            >
              ›
            </button>
          </div>
        </div>

        <div className={cn("mt-3 grid gap-2", isDesktopSurface ? "md:grid-cols-[0.9fr_0.9fr_1.35fr]" : "grid-cols-[0.9fr_0.9fr_1.35fr]")}>
          <BriefCard label="预约单数" value={`${brief.orderCount} 单`} />
          <BriefCard
            label="状态"
            tone={brief.hasConflict ? "red" : "green"}
            value={brief.hasConflict ? "有冲突" : "正常"}
          />
          <BriefCard label="预计流水" value={formatCurrency(brief.estimatedRevenue)} wide />
        </div>

        {banner ? (
          <div className="mt-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-3 py-2.5">
            <ScheduleBadge tone={banner.tone}>{banner.text}</ScheduleBadge>
          </div>
        ) : null}

        <div className={cn(
          "mt-4 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)]",
          isDesktopSurface ? "p-4" : "p-3"
        )}>
          <ScheduleSectionHeading
            info={densityMode === "entries" ? "只展示预约记录，列表更适合前台快速核对。" : "显示完整时间轴，确认班次会作为背景一起展示。"}
            label="查看展示区说明"
            right={
              <div className="client-segmented-tabs inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] p-1">
                {([
                  ["entries", "仅预约"],
                  ["all", "全时间"]
                ] as Array<[TechnicianScheduleDensityMode, string]>).map(([mode, label]) => (
                  <button
                    className={cn(
                      "client-segmented-tab rounded-full px-3.5 py-1.5 text-sm font-black transition",
                      densityMode === mode
                        ? "bg-[color:var(--client-primary)] text-[#090806] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
                        : "text-[color:var(--client-muted)]"
                    )}
                    key={mode}
                    onClick={() => setDensityMode(mode)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
            title="排班展示区"
          />

          {view === "day" ? (
            <div className="mt-3">{renderSelectedDateContent()}</div>
          ) : view === "week" ? (
            <div className="mt-3 space-y-3">
              <div className="sticky top-[var(--client-schedule-substicky-top)] z-[8] grid grid-cols-7 gap-1.5 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,transparent)] p-1.5 backdrop-blur-xl">
                {getWeekDates(anchorDate).map((date) => {
                  const count = groupedPeriodAppointments[date]?.length ?? 0;
                  const isSelected = selectedDate === date;
                  return (
                    <button
                      className={cn(
                        "relative flex min-h-[72px] min-w-0 flex-col items-center justify-center rounded-[16px] border px-1 py-2 text-center transition",
                        isSelected
                          ? "border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                          : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-[color:var(--client-muted)]"
                      )}
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      type="button"
                    >
                      <span className="block text-[11px] font-bold">{getWeekdayLabel(date)}</span>
                      <strong className="mt-1 block w-full text-center text-[13px] font-black leading-none tabular-nums sm:text-[14px] md:text-[15px]">
                        <ScheduleDynamicText>{formatShortDate(date)}</ScheduleDynamicText>
                      </strong>
                      {count > 0 ? (
                        <NotificationBadge className="absolute right-[-6px] top-[-6px] z-10" count={count} size="sm" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <section className={cn("space-y-3", isDesktopSurface && "rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_62%,transparent)] p-3")}>
                <h3 className="text-base font-black text-[color:var(--client-text)]">
                  <ScheduleDynamicText>{formatLongDate(selectedDate)}</ScheduleDynamicText> 预约
                </h3>
                {renderSelectedDateContent()}
              </section>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="sticky top-[var(--client-schedule-substicky-top)] z-[8] grid grid-cols-7 gap-1 rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,transparent)] px-2 py-2 text-center text-[11px] font-black text-[color:var(--client-muted)] backdrop-blur-xl">
                {getWeekdayHeaderLabel().map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {getMonthGridDates(anchorDate).map((date) => {
                  const inMonth = date.slice(0, 7) === anchorDate.slice(0, 7);
                  const dateItems = groupedPeriodAppointments[date] ?? [];
                  const isSelected = selectedDate === date;
                  return (
                    <button
                      className={cn(
                        "relative min-h-[56px] rounded-[12px] border px-2 py-1.5 text-left transition",
                        isSelected
                          ? "border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:var(--client-primary-soft)]"
                          : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)]",
                        !inMonth && "opacity-35"
                      )}
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      type="button"
                    >
                      <strong className="block text-[13px] font-black leading-none text-[color:var(--client-text)] sm:text-[14px]">
                        {Number(date.slice(-2))}
                      </strong>
                      {dateItems.length > 0 ? (
                        <NotificationBadge className="absolute right-[-6px] top-[-6px] z-10" count={dateItems.length} size="sm" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <section className={cn("space-y-3", isDesktopSurface && "rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_62%,transparent)] p-3")}>
                <h3 className="text-base font-black text-[color:var(--client-text)]">
                  <ScheduleDynamicText>{formatLongDate(selectedDate)}</ScheduleDynamicText> 预约
                </h3>
                {renderSelectedDateContent()}
              </section>
            </div>
          )}
        </div>
      </section>

      {isDesktopSurface ? (
        <Drawer onClose={() => setSelectedArrangementOrderId(null)} open={Boolean(selectedArrangementOrderId)} title="预约安排详情">
          {selectedArrangement && currentStore ? (
            <ArrangementDetailContent
              arrangement={selectedArrangement}
              onActionComplete={(result) => setBanner(result.ok ? { tone: "green", text: "已同步到共享调度数据。" } : { tone: "yellow", text: result.message ?? "操作失败。" })}
              operatorId={currentStore.id}
              storeId={currentStore.id}
              surface="desktop"
            />
          ) : (
            <div className="rounded-[22px] border border-dashed border-line bg-white/80 p-4 text-sm leading-6 text-ink/60">
              当前预约安排不存在，可能已被调整或不属于当前门店。
            </div>
          )}
        </Drawer>
      ) : null}
    </div>
  );
}

function findScheduleBookingByOrderId(orderId?: string) {
  if (!orderId) {
    return null;
  }

  return getTechnicianScheduleStoreSnapshot().bookings.find(
    (booking) => booking.orderId === orderId || booking.detailTargetId === orderId
  ) ?? null;
}

function findServiceForOrderName(itemName?: string) {
  if (!itemName) {
    return services[0];
  }

  return services.find((service) => itemName.includes(service.name) || service.name.includes(itemName)) ?? services[0];
}

export function TechnicianOrderDetailRoutePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { stores, technicians, customers } = useEntityStore();
  const order = demoOrders.find((item) => item.id === orderId);
  const booking = findScheduleBookingByOrderId(orderId);
  const parentOrder = booking?.parentOrderId ? demoOrders.find((item) => item.id === booking.parentOrderId) : null;
  const returnTarget = readNavigationReturnTarget(location.search, location.state);
  const backToScheduleSource = () => {
    if (returnTarget) {
      navigate(returnTarget.to, { state: returnTarget.state });
      return;
    }

    navigate("/technician/schedule");
  };

  if (!order) {
    return (
      <StandaloneSchedulePage onBack={backToScheduleSource} subtitle="找不到对应预约订单。" title="预约订单详情">
        <div className={cn(schedulePanelClass, "px-4 py-4 text-sm leading-6 text-[color:var(--client-muted)]")}>
          这条排班事件没有绑定可访问的订单，或订单已经不在当前技师权限范围内。
        </div>
      </StandaloneSchedulePage>
    );
  }

  const store = stores.find((item) => item.name === order.storeName) ?? stores[0];
  const technician = technicians.find((item) => item.name === order.technicianName) ?? technicians.find((item) => item.id === booking?.technicianId) ?? technicians[0];
  const customer = customers.find((item) => item.id === order.customerId);
  const service = findServiceForOrderName(order.itemName);

  return (
    <StandaloneSchedulePage
      action={<Button className={getScheduleButtonClassName("secondary")} size="sm" to="/technician/schedule" variant="secondary">回排班表</Button>}
      onBack={backToScheduleSource}
      subtitle={`${order.bookedAt} · ${booking?.eventType === "extension" ? "加钟订单" : booking?.eventType === "reschedule" ? "移动后当前订单" : "普通预约"}`}
      title="预约订单详情"
    >
      <section className="space-y-4">
        <OrderDynamicStatusCard order={order} providerName={order.storeName ?? store?.name} />

        <article className={cn(schedulePanelClass, "px-4 py-4")}>
          <div className="flex flex-wrap items-center gap-2">
            <ScheduleBadge tone={booking?.eventType === "extension" ? "red" : booking?.eventType === "reschedule" ? "blue" : "green"}>
              {booking?.eventType === "extension" ? "加钟" : booking?.eventType === "reschedule" ? "移动预约" : "普通预约"}
            </ScheduleBadge>
            <ScheduleBadge tone="neutral">{order.orderNo}</ScheduleBadge>
          </div>
          <h2 className="mt-3 text-xl font-black text-[color:var(--client-text)]">{order.itemName}</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ["预约时间", order.bookedAt],
              ["预约金额", formatCurrency(order.amount)],
              ["支付状态", order.paymentStatus]
            ].map(([label, value]) => (
              <div className={cn(scheduleInsetClass, "px-3 py-3")} key={label}>
                <p className="text-[11px] font-black text-[color:var(--client-muted)]">{label}</p>
                <strong className="mt-1 block truncate text-sm font-black text-[color:var(--client-text)]">{value}</strong>
              </div>
            ))}
          </div>
          {booking?.note ? <p className="mt-3 text-sm leading-6 text-[color:var(--client-muted)]">{booking.note}</p> : null}
        </article>

        {parentOrder ? (
          <article className={cn(schedulePanelClass, "px-4 py-4")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-[color:var(--client-text)]">原订单入口</h3>
                <p className="mt-1 text-sm text-[color:var(--client-muted)]">{parentOrder.orderNo} · {parentOrder.itemName}</p>
              </div>
              <Button
                className={getScheduleButtonClassName("primary")}
                size="sm"
                to={getScheduleOrderDetailRoute(parentOrder.id, "technician")}
              >
                打开
              </Button>
            </div>
          </article>
        ) : null}

        <section>
          <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">服务</h2>
          {service && store ? (
            <SocialProfileMiniCard
              data={buildServiceMiniCardData(service, store)}
              detailTo={`/technician/profiles/shop/${store.id}`}
              showAction={false}
              topTags={[{ label: order.mode === "store" ? "到店预约" : "上门预约", tone: "purple" }]}
            />
          ) : null}
        </section>

        {store ? (
          <section>
            <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">店铺 / 服务方</h2>
            <SocialProfileMiniCard detailTo={`/technician/profiles/shop/${store.id}`} showAction={false} store={store} />
          </section>
        ) : null}

        {customer ? (
          <section>
            <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">预约用户</h2>
            <SocialProfileMiniCard customer={customer} detailTo={`/technician/profiles/user/${customer.id}`} showAction={false} />
          </section>
        ) : null}
      </section>
    </StandaloneSchedulePage>
  );
}

function useRouteItem(itemId?: string) {
  const { snapshot, items, assignedShifts, visibleBookings, visibleCustomEvents, currentTechnician, currentStore, sameStoreColleagues, technicians } =
    useTechnicianScheduleContext();
  const sourceItem = items.find((item) => item.sourceId === itemId) ?? null;
  const customEvent = visibleCustomEvents.find((item) => item.event.id === itemId)?.event ?? null;
  const booking = visibleBookings.find((item) => item.booking.id === itemId)?.booking ?? null;
  const shift =
    assignedShifts.find((item) => (item.assignmentKind === "accepted" ? item.id.split("__accepted__")[0] === itemId : item.id === itemId)) ??
    snapshot.dutyShifts.find((item) => item.id === itemId) ??
    null;
  const resolvedShiftId = shift
    ? "assignmentKind" in shift && shift.assignmentKind === "accepted"
      ? shift.id.split("__accepted__")[0]
      : shift.id
    : null;
  const owningShift = sourceItem?.linkedShiftId
    ? snapshot.dutyShifts.find((candidate) => candidate.id === sourceItem.linkedShiftId) ?? null
    : resolvedShiftId
      ? snapshot.dutyShifts.find((candidate) => candidate.id === resolvedShiftId) ?? null
      : null;
  const transferPreview = owningShift
    ? getTechnicianScheduleTransferPreview(owningShift.id)
    : resolvedShiftId
      ? getTechnicianScheduleTransferPreview(resolvedShiftId)
      : null;
  const relatedInvitations = transferPreview?.invitations ?? [];
  const acceptedCount = relatedInvitations.filter((invitation) => invitation.status === "accepted").length;

  return {
    snapshot,
    item: sourceItem,
    customEvent,
    booking,
    shift,
    owningShift,
    transferPreview,
    acceptedCount,
    currentTechnician,
    currentStore,
    sameStoreColleagues,
    technicians
  };
}

export function TechnicianScheduleDetailRoutePage() {
  const navigate = useNavigate();
  const scheduleBasePath = useScheduleBasePath();
  const { eventId } = useParams<{ eventId: string }>();
  const { snapshot, item, customEvent, booking, shift, owningShift, transferPreview, acceptedCount, currentTechnician, technicians } = useRouteItem(eventId);

  if (!item && !customEvent && !booking && !shift) {
    return (
      <StandaloneSchedulePage subtitle="找不到这条排班记录。" title="排班信息">
        <div className="rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-4 py-4 text-sm leading-6 text-[color:var(--client-muted)]">
          当前记录不存在，可能已经被删除或转让状态已变化。
        </div>
      </StandaloneSchedulePage>
    );
  }

  const displayTitle = item?.title ?? customEvent?.title ?? booking?.title ?? shift?.title ?? "排班信息";
  const displayDate = item?.date ?? customEvent?.date ?? booking?.date ?? shift?.date ?? getTodayDateKey();
  const displayStart = item?.startTime ?? customEvent?.startTime ?? booking?.startTime ?? shift?.startTime ?? "00:00";
  const displayEnd = item?.endTime ?? customEvent?.endTime ?? booking?.endTime ?? shift?.endTime ?? "00:00";
  const isEditableCustomEvent = Boolean(customEvent) && !item?.withinConfirmedShift;
  const activeShift = owningShift ?? (shift ? snapshot.dutyShifts.find((candidate) => candidate.id === eventId) ?? null : null);
  const latestRequest = transferPreview?.request ?? null;
  const detailItemBadge = item ? getItemBadgePresentation(item, false) : null;
  const requestCandidates = latestRequest
    ? transferPreview?.invitations.map((invitation) => {
        const technician = technicians.find((candidate) => candidate.id === invitation.candidateId);
        return {
          invitation,
          technicianName: technician?.nickname?.trim() || technician?.name || "同事"
        };
      }) ?? []
    : [];

  return (
    <StandaloneSchedulePage
      subtitle={`${formatLongDate(displayDate)} · ${displayStart} - ${displayEnd}`}
      title={displayTitle}
    >
      <section className="space-y-4">
        <article className={cn(schedulePanelClass, "px-4 py-4")}>
          <div className="flex flex-wrap items-center gap-2">
            {item && detailItemBadge ? (
              <ScheduleBadge style={detailItemBadge.style} tone={detailItemBadge.tone}>
                {getItemDisplayLabel(item)}
              </ScheduleBadge>
            ) : null}
            {item?.transferStatus ? <ScheduleBadge tone={getTransferTone(item.transferStatus)}>{getTransferStatusLabel(item.transferStatus)}</ScheduleBadge> : null}
            {item?.withinConfirmedShift ? <ScheduleBadge tone="neutral">确认班次内</ScheduleBadge> : null}
          </div>
          <h2 className="mt-3 text-xl font-black text-[color:var(--client-text)]">{displayTitle}</h2>
          <p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">
            {formatLongDate(displayDate)} · {displayStart} - {displayEnd}
          </p>
          {booking ? (
            <div className="mt-4 rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-3 text-sm leading-6 text-[color:var(--client-muted)]">
              <p>
                <strong className="text-[color:var(--client-text)]">预约客人：</strong>
                {booking.customerName}
              </p>
              <p>
                <strong className="text-[color:var(--client-text)]">预约金额：</strong>
                {formatCurrency(booking.amount ?? null)}
              </p>
              {booking.note ? <p>{booking.note}</p> : null}
            </div>
          ) : null}
          {customEvent ? (
            <div className="mt-4 rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-3 text-sm leading-6 text-[color:var(--client-muted)]">
              <p>
                <strong className="text-[color:var(--client-text)]">行程类型：</strong>
                {getScheduleEventPresetLabel(resolveScheduleEventPreset(customEvent.kind, customEvent.title, customEvent.preset))}
              </p>
              {customEvent.location ? (
                <p>
                  <strong className="text-[color:var(--client-text)]">地点：</strong>
                  {customEvent.location}
                </p>
              ) : null}
              {customEvent.note ? (
                <p>
                  <strong className="text-[color:var(--client-text)]">备注：</strong>
                  {customEvent.note}
                </p>
              ) : null}
              {customEvent.syncTargets.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customEvent.syncTargets.map((target) => (
                    <ScheduleBadge key={`${target.type}-${target.id}`} tone="neutral">
                      同步给 {target.label}
                    </ScheduleBadge>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </article>

        {item?.withinConfirmedShift || item?.kind === "confirmed" ? (
          <article className={cn(schedulePanelClass, "px-4 py-4")}>
            <ScheduleSectionHeading
              info="这段时间属于店铺已最终确认的上班时间，当前只提供查看模式，不能直接修改时间、类型或同步对象。"
              label="查看确认班次规则"
              title="确认班次规则"
            />
            {activeShift ? (
              <div className="mt-3 rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-3 text-sm leading-6 text-[color:var(--client-muted)]">
                <p>
                  <strong className="text-[color:var(--client-text)]">班次摘要：</strong>
                  {formatShiftSummary(activeShift)}
                </p>
                <p>
                  <strong className="text-[color:var(--client-text)]">班次标签：</strong>
                  {activeShift.shiftLabel}
                </p>
              </div>
            ) : null}
            {activeShift && activeShift.technicianId === currentTechnician.id ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className={getScheduleButtonClassName("primary")} onClick={() => navigate(`/technician/schedule/shifts/${activeShift.id}/transfer`)} size="sm">
                  {latestRequest?.status === "transfer_pending" ? "继续处理转让" : "转让给同事"}
                </Button>
                {latestRequest?.status === "transfer_pending" ? (
                  <Button
                    className={getScheduleButtonClassName("secondary")}
                    onClick={() => {
                      cancelTechnicianScheduleTransferRequest(latestRequest.id);
                      navigate(`${scheduleBasePath}/events/${eventId}`);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    取消转让
                  </Button>
                ) : null}
              </div>
            ) : null}
          </article>
        ) : null}

        {transferPreview ? (
          <article className={cn(schedulePanelClass, "px-4 py-4")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-[color:var(--client-text)]">转让状态</h3>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">
                  {acceptedCount} / {transferPreview.request.requestedCount} 人已接受
                </p>
              </div>
              <ScheduleBadge tone={getTransferTone(transferPreview.request.status)}>{getTransferStatusLabel(transferPreview.request.status)}</ScheduleBadge>
            </div>
            <div className="mt-3 space-y-2.5">
              {requestCandidates.map(({ invitation, technicianName }) => (
                <div className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-3" key={invitation.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm font-black text-[color:var(--client-text)]">{technicianName}</strong>
                    <ScheduleBadge tone={getInvitationTone(invitation.status)}>{getInvitationStatusLabel(invitation.status)}</ScheduleBadge>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {isEditableCustomEvent && customEvent ? (
          <div className="flex gap-2">
            <Button className={getScheduleButtonClassName("primary")} onClick={() => navigate(`${scheduleBasePath}/events/${customEvent.id}/edit`)} size="sm">
              编辑行程
            </Button>
            <Button
              className={getScheduleButtonClassName("secondary")}
              onClick={() => {
                deleteTechnicianScheduleEvent(customEvent.id);
                navigate(scheduleBasePath);
              }}
              size="sm"
              variant="secondary"
            >
              删除
            </Button>
          </div>
        ) : null}
      </section>
    </StandaloneSchedulePage>
  );
}

export function TechnicianScheduleEditorRoutePage() {
  const navigate = useNavigate();
  const scheduleBasePath = useScheduleBasePath();
  const [searchParams] = useSearchParams();
  const { eventId } = useParams<{ eventId: string }>();
  const { customers, technicians, currentStore, currentTechnician, assignedShifts, visibleCustomEvents } = useTechnicianScheduleContext();
  const editingEvent = visibleCustomEvents.find((item) => item.event.id === eventId)?.event ?? null;
  const [searchKeyword, setSearchKeyword] = useState("");
  const [syncTargetFilter, setSyncTargetFilter] = useState<ScheduleSyncTargetFilterTag>("all");
  const deferredSearchKeyword = useDeferredValue(searchKeyword);

  const initialDate = editingEvent?.date ?? searchParams.get("date") ?? getTodayDateKey();
  const initialStartTime = editingEvent?.startTime ?? searchParams.get("start") ?? "10:00";
  const initialEndTime = editingEvent?.endTime ?? searchParams.get("end") ?? "11:00";
  const initialPreset = resolveScheduleEventPreset(editingEvent?.kind ?? "availability", editingEvent?.title, editingEvent?.preset);
  const [title, setTitle] = useState(editingEvent?.title ?? "");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [allDay, setAllDay] = useState(Boolean(editingEvent?.allDay));
  const [eventPreset, setEventPreset] = useState<TechnicianScheduleEventPreset>(initialPreset);
  const [note, setNote] = useState(editingEvent?.note ?? "");
  const [location, setLocation] = useState(editingEvent?.location ?? "");
  const [repeatRule, setRepeatRule] = useState(editingEvent?.repeatRule ?? "不重复");
  const [reminder, setReminder] = useState(editingEvent?.reminder ?? "不提醒");
  const [visibility, setVisibility] = useState(editingEvent?.visibility ?? "默认");
  const [syncTargets, setSyncTargets] = useState(editingEvent?.syncTargets ?? []);
  const [banner, setBanner] = useState<ScheduleBannerMessage | null>(null);
  const [autoStoreSync, setAutoStoreSync] = useState(true);
  const [syncExpanded, setSyncExpanded] = useState(false);
  const kind = getScheduleEventKindForPreset(eventPreset);

  const storeTarget = {
    id: currentStore.id,
    type: "store" as const,
    label: currentStore.name
  };
  const normalizedSearchKeyword = deferredSearchKeyword.trim().toLowerCase();
  const candidateTargets = buildContactTargets(currentStore, currentTechnician.id, technicians, customers).filter((target) => {
    const matchesFilter = syncTargetFilter === "all" || target.type === syncTargetFilter;
    const matchesKeyword =
      normalizedSearchKeyword.length === 0 ||
      [target.label, target.typeLabel, target.metaLine, target.detailLine, target.remark]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedSearchKeyword));

    return matchesFilter && matchesKeyword;
  });
  const selectedTargetCards = syncTargets.map((target) => resolveScheduleContactTarget(target, currentStore, technicians, customers));
  const coveringShift = findContainingShift(assignedShifts, date, allDay ? "00:00" : startTime, allDay ? "23:59" : endTime);
  const withinConfirmedShift = Boolean(coveringShift);
  const hasStoreSelected = syncTargets.some((target) => target.type === "store" && target.id === currentStore.id);
  const syncSummary =
    syncTargets.length > 1
      ? `已选择 ${syncTargets.length} 个对象`
      : hasStoreSelected
        ? withinConfirmedShift && autoStoreSync
          ? "默认同步店铺"
          : "已同步给店铺"
        : syncTargets.length === 1
          ? "已选择 1 个对象"
          : "未设置";

  useEffect(() => {
    const hasStoreTarget = syncTargets.some((target) => target.type === "store" && target.id === currentStore.id);
    if (withinConfirmedShift && autoStoreSync && !hasStoreTarget) {
      setSyncTargets((current) => [storeTarget, ...current.filter((target) => !(target.type === "store" && target.id === currentStore.id))]);
      return;
    }

    if (!withinConfirmedShift && autoStoreSync && hasStoreTarget) {
      setSyncTargets((current) => current.filter((target) => !(target.type === "store" && target.id === currentStore.id)));
    }
  }, [autoStoreSync, currentStore.id, storeTarget, syncTargets, withinConfirmedShift]);

  const toggleSyncTarget = (target: ScheduleSelectableSyncTarget) => {
    if (target.type === "store") {
      setAutoStoreSync(false);
    }

    setSyncTargets((current) =>
      current.some((item) => item.id === target.id && item.type === target.type)
        ? current.filter((item) => !(item.id === target.id && item.type === target.type))
        : [...current, target]
    );
  };

  const saveEvent = () => {
    if ((allDay ? "00:00" : startTime) >= (allDay ? "23:59" : endTime)) {
      setBanner({ tone: "red", text: "结束时间需要晚于开始时间。" });
      return;
    }

    const nextId = saveTechnicianScheduleEvent({
      id: editingEvent?.id,
      technicianId: currentTechnician.id,
      storeId: currentStore.id,
      date,
      startTime: allDay ? "00:00" : startTime,
      endTime: allDay ? "23:59" : endTime,
      title: title.trim() || getScheduleEventPresetLabel(eventPreset),
      kind,
      preset: eventPreset,
      note: note.trim() || undefined,
      location: location.trim() || undefined,
      allDay,
      repeatRule,
      reminder,
      visibility,
      syncTargets
    });

    navigate(`${scheduleBasePath}/events/${nextId}`);
  };

  return (
    <StandaloneSchedulePage
      action={
        <Button
          className={cn("rounded-full px-5", getScheduleButtonClassName("primary"))}
          onClick={saveEvent}
          size="sm"
        >
          保存
        </Button>
      }
      subtitle={editingEvent ? "编辑完整行程信息" : "新建完整行程信息"}
      title={editingEvent ? "编辑行程" : "添加行程"}
    >
      <section className="space-y-4 pb-6">
        {banner ? <ScheduleBadge tone={banner.tone}>{banner.text}</ScheduleBadge> : null}

        <article className={cn(schedulePanelClass, "px-4 py-4")}>
          <label className="block">
            <span className="text-xs font-bold text-[color:var(--client-muted)]">添加标题</span>
            <input
              className={cn(scheduleInputClass, "h-12 rounded-[18px] text-base")}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：可排班、会议、会食或私人安排"
              value={title}
            />
          </label>
        </article>

        <article className={cn(schedulePanelClass, "px-4 py-4")}>
          <div className="flex items-center justify-between gap-3">
            <ScheduleSectionHeading
              info="设置日期、起止时间、全天与重复规则，不改变现有新建逻辑，只压缩布局和显色。"
              label="查看时间设置说明"
              title="时间设置"
            />
            <label className="inline-flex items-center gap-2 text-sm font-bold text-[color:var(--client-muted)]">
              <input checked={allDay} onChange={(event) => setAllDay(event.target.checked)} type="checkbox" />
              全天
            </label>
          </div>
          <div className="mt-4 grid gap-3">
            <label>
              <span className="text-xs font-bold text-[color:var(--client-muted)]">日期</span>
              <input
                className={scheduleInputClass}
                onChange={(event) => setDate(event.target.value)}
                type="date"
                value={date}
              />
            </label>
            {!allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="text-xs font-bold text-[color:var(--client-muted)]">开始时间</span>
                  <input
                    className={scheduleInputClass}
                    onChange={(event) => setStartTime(event.target.value)}
                    step={1800}
                    type="time"
                    value={startTime}
                  />
                </label>
                <label>
                  <span className="text-xs font-bold text-[color:var(--client-muted)]">结束时间</span>
                  <input
                    className={scheduleInputClass}
                    onChange={(event) => setEndTime(event.target.value)}
                    step={1800}
                    type="time"
                    value={endTime}
                  />
                </label>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-xs font-bold text-[color:var(--client-muted)]">重复规则</span>
                <select
                  className={scheduleSelectClass}
                  onChange={(event) => setRepeatRule(event.target.value)}
                  value={repeatRule}
                >
                  <option value="不重复">不重复</option>
                  <option value="每天">每天</option>
                  <option value="每周">每周</option>
                </select>
              </label>
              <label>
                <span className="text-xs font-bold text-[color:var(--client-muted)]">提醒</span>
                <select
                  className={scheduleSelectClass}
                  onChange={(event) => setReminder(event.target.value)}
                  value={reminder}
                >
                  <option value="不提醒">不提醒</option>
                  <option value="提前10分钟">提前10分钟</option>
                  <option value="提前30分钟">提前30分钟</option>
                </select>
              </label>
            </div>
          </div>
        </article>

        <article className={cn(schedulePanelClass, "px-4 py-4")}>
          <h3 className="text-base font-black text-[color:var(--client-text)]">行程种类</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {scheduleEventCategoryOptions.map(({ preset, label }) => (
              <button
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-xs font-black transition",
                  eventPreset === preset
                    ? "border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_16%,transparent)]"
                    : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-muted)]"
                )}
                key={preset}
                onClick={() => setEventPreset(preset)}
                type="button"
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full",
                    eventPreset === preset
                      ? "bg-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)]"
                      : "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]"
                  )}
                >
                  <ScheduleCategoryIcon preset={preset} />
                </span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </article>

        <article className={cn(schedulePanelClass, "px-4 py-4")}>
          <ScheduleSectionHeading
            info="补充备注、地点与可见性信息，说明不再常驻占位。"
            label="查看备注与其他字段说明"
            title="备注与其他字段"
          />
          <div className="mt-3 grid gap-3">
            <label>
              <span className="text-xs font-bold text-[color:var(--client-muted)]">备注 / 说明</span>
              <textarea
                className={scheduleTextareaClass}
                onChange={(event) => setNote(event.target.value)}
                placeholder="补充这段行程的说明、交接信息或注意事项"
                value={note}
              />
            </label>
            <label>
              <span className="text-xs font-bold text-[color:var(--client-muted)]">地点</span>
              <input
                className={scheduleInputClass}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="可选"
                value={location}
              />
            </label>
            <label>
              <span className="text-xs font-bold text-[color:var(--client-muted)]">可见性</span>
              <select
                className={scheduleSelectClass}
                onChange={(event) => setVisibility(event.target.value)}
                value={visibility}
              >
                <option value="默认">默认</option>
                <option value="仅自己">仅自己</option>
                <option value="同步对象可见">同步对象可见</option>
              </select>
            </label>
          </div>
        </article>

        <article className={cn(schedulePanelClass, "px-4 py-4")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TitleWithInfo
                  info={
                    withinConfirmedShift
                      ? "在店铺已确认班次内会优先同步店铺，也可继续添加其他对象。"
                      : "当前不在店铺确认班次内，可按需要手动选择同步对象。"
                  }
                  infoClassName="h-5 w-5 border-[color:color-mix(in_srgb,var(--client-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] text-[color:var(--client-muted)]"
                  label="查看同步对象说明"
                  title={<span className="text-base font-black text-[color:var(--client-text)]">同步对象</span>}
                  variant="client"
                />
                {withinConfirmedShift ? <ScheduleBadge tone="blue">默认同步店铺</ScheduleBadge> : null}
              </div>
            </div>
            <button
              className="flex shrink-0 items-center gap-2 text-right"
              onClick={() => setSyncExpanded((current) => !current)}
              type="button"
            >
              <span className="text-[11px] font-black text-[color:var(--client-muted)]">{syncSummary}</span>
              <span
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_84%,transparent)] text-[color:var(--client-muted)] transition",
                  syncExpanded && "rotate-180"
                )}
              >
                ⌄
              </span>
            </button>
          </div>

          {syncExpanded ? (
            <div className="mt-4 space-y-3">
              <div className={cn(scheduleInsetClass, "px-3.5 py-3 text-sm leading-6 text-[color:var(--client-muted)]")}>
                <p>
                  <strong className="text-[color:var(--client-text)]">当前默认：</strong>
                  {withinConfirmedShift ? "店铺会作为默认同步对象" : "当前没有默认同步对象"}
                </p>
                <p className="mt-1">
                  <strong className="text-[color:var(--client-text)]">已选对象：</strong>
                  {syncTargets.length > 0 ? `${syncTargets.length} 个` : "未设置"}
                </p>
              </div>

              {selectedTargetCards.length > 0 ? (
                <div className="grid gap-2">
                  {selectedTargetCards.map((target) => (
                    <SyncTargetProfileCard key={`${target.type}-${target.id}`} selected target={target} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[color:var(--client-muted)]">当前还没有选中同步对象。</p>
              )}

              <div className="flex items-center gap-2">
                <input
                  className={cn(scheduleInputClass, "mt-0 flex-1")}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="搜索店铺、同事或好友"
                  value={searchKeyword}
                />
                <div className="relative shrink-0">
                  <select
                    aria-label="同步对象标签筛选"
                    className={cn(scheduleSelectClass, "mt-0 h-11 w-[104px] appearance-none px-3 pr-8 text-xs")}
                    onChange={(event) => setSyncTargetFilter(event.target.value as ScheduleSyncTargetFilterTag)}
                    value={syncTargetFilter}
                  >
                    {scheduleSyncTargetFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-[color:var(--client-muted)]">
                    ⌄
                  </span>
                </div>
              </div>

              {candidateTargets.length > 0 ? (
                <div className="grid gap-2">
                  {candidateTargets.map((target) => {
                    const selected = syncTargets.some((item) => item.id === target.id && item.type === target.type);
                    return (
                      <SyncTargetProfileCard
                        actionLabel={selected ? "已选" : "可选"}
                        key={`${target.type}-${target.id}`}
                        onClick={() => toggleSyncTarget(target)}
                        selected={selected}
                        target={target}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className={cn(scheduleInsetClass, "px-3.5 py-3 text-sm font-bold text-[color:var(--client-muted)]")}>
                  当前筛选条件下没有可选对象，请尝试切换标签或调整搜索关键词。
                </div>
              )}
            </div>
          ) : null}
        </article>
      </section>

    </StandaloneSchedulePage>
  );
}

export function TechnicianScheduleTransferRoutePage() {
  const navigate = useNavigate();
  const { shiftId } = useParams<{ shiftId: string }>();
  const { currentTechnician, currentStore, sameStoreColleagues, technicians } = useTechnicianScheduleContext();
  const snapshot = getTechnicianScheduleStoreSnapshot();
  const shift = snapshot.dutyShifts.find((item) => item.id === shiftId && item.technicianId === currentTechnician.id) ?? null;
  const existingPreview = shift ? getTechnicianScheduleTransferPreview(shift.id) : null;
  const existingRequest = existingPreview?.request ?? null;
  const [requestedCount, setRequestedCount] = useState(1);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const deferredSearchKeyword = useDeferredValue(searchKeyword);
  const [banner, setBanner] = useState<ScheduleBannerMessage | null>(null);

  if (!shift) {
    return (
      <StandaloneSchedulePage subtitle="当前班次不存在或不属于你。" title="转让给同事">
        <div className="rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-4 py-4 text-sm leading-6 text-[color:var(--client-muted)]">
          只能对自己当前持有的已确认班次发起转让。
        </div>
      </StandaloneSchedulePage>
    );
  }

  const candidateOptions = sameStoreColleagues
    .filter((technician) => (technician.nickname?.trim() || technician.name).toLowerCase().includes(deferredSearchKeyword.trim().toLowerCase()))
    .map((technician) => {
      const hasConflict = getTechnicianShiftConflictState(technician.id, shift);
      return {
        technician,
        hasConflict
      };
    });

  const toggleCandidate = (candidateId: string, disabled: boolean) => {
    if (disabled) {
      return;
    }

    setSelectedCandidateIds((current) =>
      current.includes(candidateId) ? current.filter((item) => item !== candidateId) : [...current, candidateId]
    );
  };

  const submitTransfer = () => {
    if (selectedCandidateIds.length === 0) {
      setBanner({ tone: "red", text: "请先选择至少一位可接手的同事。" });
      return;
    }

    const requestId = createTechnicianScheduleTransferRequest({
      shiftId: shift.id,
      requesterId: currentTechnician.id,
      storeId: currentStore.id,
      requestedCount,
      candidateIds: selectedCandidateIds
    });

    if (!requestId) {
      setBanner({ tone: "red", text: "转让发起失败，请检查候选人范围和当前班次状态。" });
      return;
    }

    navigate(`/technician/schedule/events/${shift.id}`);
  };

  return (
    <StandaloneSchedulePage subtitle={formatShiftSummary(shift)} title="转让给同事">
      <section className="space-y-4">
        {banner ? <ScheduleBadge tone={banner.tone}>{banner.text}</ScheduleBadge> : null}

        <article className={cn(schedulePanelClass, "px-4 py-4")}>
          <h3 className="text-base font-black text-[color:var(--client-text)]">班次摘要</h3>
          <div className="mt-3 rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-3 text-sm leading-6 text-[color:var(--client-muted)]">
            <p>
              <strong className="text-[color:var(--client-text)]">店铺：</strong>
              {currentStore.name}
            </p>
            <p>
              <strong className="text-[color:var(--client-text)]">班次：</strong>
              {shift.shiftLabel}
            </p>
            <p>
              <strong className="text-[color:var(--client-text)]">时间：</strong>
              {formatShiftSummary(shift)}
            </p>
          </div>
        </article>

        {existingRequest && (existingRequest.status === "transfer_pending" || existingRequest.status === "transfer_completed") ? (
          <article className={cn(schedulePanelClass, "px-4 py-4")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-[color:var(--client-text)]">当前转让流程</h3>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">
                  已选 {existingRequest.candidateIds.length} 位候选，定员 {existingRequest.requestedCount} 人
                </p>
              </div>
              <ScheduleBadge tone={getTransferTone(existingRequest.status)}>{getTransferStatusLabel(existingRequest.status)}</ScheduleBadge>
            </div>
            <div className="mt-3 space-y-2.5">
              {(existingPreview?.invitations ?? []).map((invitation) => {
                const technician = technicians.find((candidate) => candidate.id === invitation.candidateId);
                return (
                  <div className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-3" key={invitation.id}>
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm font-black text-[color:var(--client-text)]">{technician?.nickname?.trim() || technician?.name || "同事"}</strong>
                      <ScheduleBadge tone={getInvitationTone(invitation.status)}>{getInvitationStatusLabel(invitation.status)}</ScheduleBadge>
                    </div>
                  </div>
                );
              })}
            </div>
            {existingRequest.status === "transfer_pending" ? (
              <div className="mt-3">
                <Button
                  className={getScheduleButtonClassName("secondary")}
                  onClick={() => {
                    cancelTechnicianScheduleTransferRequest(existingRequest.id);
                    navigate(`/technician/schedule/events/${shift.id}`);
                  }}
                  size="sm"
                  variant="secondary"
                >
                  取消当前转让
                </Button>
              </div>
            ) : null}
          </article>
        ) : (
          <>
            <article className={cn(schedulePanelClass, "px-4 py-4")}>
              <ScheduleSectionHeading
                info="你可以设置需要转让给几个人，也可以勾选超过定员的人数作为候选，系统会按最快确认接受的顺序占位。"
                label="查看转让定员说明"
                title="转让定员"
              />
              <div className="mt-4 flex items-center gap-3">
                <button
                  className="grid h-10 w-10 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] text-lg font-black text-[color:var(--client-text)]"
                  onClick={() => setRequestedCount((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  −
                </button>
                <div className="min-w-[72px] rounded-full bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-2 text-center text-lg font-black text-[color:var(--client-text)]">{requestedCount}</div>
                <button
                  className="grid h-10 w-10 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] text-lg font-black text-[color:var(--client-text)]"
                  onClick={() => setRequestedCount((current) => Math.min(Math.max(candidateOptions.length, 1), current + 1))}
                  type="button"
                >
                  +
                </button>
              </div>
            </article>

            <article className={cn(schedulePanelClass, "px-4 py-4")}>
              <div className="flex items-center justify-between gap-3">
                <ScheduleSectionHeading
                  info="仅限同一家商户的员工 / 技师，可多选。"
                  label="查看候选同事说明"
                  title="候选同事"
                />
                <ScheduleBadge tone="neutral">已选 {selectedCandidateIds.length}</ScheduleBadge>
              </div>

              <input
                className={scheduleInputClass}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="搜索同事"
                value={searchKeyword}
              />

              <div className="mt-3 space-y-2.5">
                {candidateOptions.map(({ technician, hasConflict }) => {
                  const selected = selectedCandidateIds.includes(technician.id);
                  return (
                    <button
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition",
                        hasConflict
                          ? "cursor-not-allowed border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] text-[color:var(--client-muted)]"
                          : selected
                            ? "border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-text)]"
                            : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] text-[color:var(--client-text)]"
                      )}
                      key={technician.id}
                      onClick={() => toggleCandidate(technician.id, hasConflict)}
                      type="button"
                    >
                      <AvatarImage alt={technician.name} className="h-12 w-12" src={technician.avatar} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="truncate text-sm font-black">{technician.nickname?.trim() || technician.name}</strong>
                          <ScheduleBadge tone={hasConflict ? "neutral" : "green"}>{hasConflict ? "时间冲突" : "可接手"}</ScheduleBadge>
                        </div>
                        <p className="mt-1 text-xs font-bold opacity-70">{technician.status === "busy" ? "当前繁忙" : technician.status === "off" ? "当前休息" : "当前可用"}</p>
                      </div>
                      <ScheduleBadge tone={selected ? "green" : "neutral"}>{selected ? "已选" : hasConflict ? "不可选" : "可选"}</ScheduleBadge>
                    </button>
                  );
                })}
              </div>
            </article>

            <div className="flex justify-end">
              <Button className={getScheduleButtonClassName("primary")} onClick={submitTransfer}>发送转让邀请</Button>
            </div>
          </>
        )}
      </section>
    </StandaloneSchedulePage>
  );
}
