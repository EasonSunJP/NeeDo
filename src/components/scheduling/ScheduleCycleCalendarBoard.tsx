import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { AppIcon } from "../client-ui/AppScaffold";
import { HolidayCornerBadge } from "./HolidayCornerBadge";
import { MobileFullscreenCloseButton } from "../mobile/MobileFullscreenHeader";
import {
  UnifiedCalendarAgendaView,
  UnifiedCalendarEventDetailPage,
  UnifiedCalendarDayTimeline,
  UnifiedCalendarEventCard,
  UnifiedCalendarSurface,
  type UnifiedCalendarEvent,
  type UnifiedCalendarLane,
  type UnifiedCalendarParticipant,
  type UnifiedCalendarSourceId
} from "./UnifiedUserCalendar";
import {
  addDays,
  addMonths,
  formatLongDate,
  formatShortDate,
  getMonthGridDates,
  getTodayDateKey,
  getWeekDates,
  getWeekdayHeaderLabel,
  getWeekdayLabel
} from "../../features/technician-schedule/model";
import {
  getDispatchCycleList,
  getDispatchScheduleGrid,
  useDispatchCenterStore,
  type DispatchScheduleCell,
  type DispatchScheduleCellStatus
} from "../../features/dispatch-center/store";
import { getNeedoAppBookingTitle } from "../../lib/scheduleBookingTitle";
import { cn } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import type { Customer, Store, Technician } from "../../types/domain";

export type ScheduleCycleCalendarBoardView = "day" | "week" | "month" | "agenda";
export type ScheduleCycleCalendarStatusFilter = "all" | DispatchScheduleCellStatus;

type ScheduleCycleCalendarBoardProps = {
  className?: string;
  cycleId?: string | null;
  dateKey: string;
  getTechnicianDetailPath?: (technicianId: string) => string | undefined;
  onDateChange: (dateKey: string) => void;
  onOpenCell: (cell: DispatchScheduleCell) => void;
  onViewChange: (view: ScheduleCycleCalendarBoardView) => void;
  searchQuery?: string;
  statusFilter?: ScheduleCycleCalendarStatusFilter;
  storeId: string;
  subtitle?: string;
  view: ScheduleCycleCalendarBoardView;
};

type CycleCalendarPeriod = {
  dates: string[];
  label: string;
};

const cycleCalendarViewOptions: Array<{ label: string; value: ScheduleCycleCalendarBoardView }> = [
  { label: "日", value: "day" },
  { label: "周", value: "week" },
  { label: "月", value: "month" },
  { label: "仅行程", value: "agenda" }
];

type CycleCalendarLabelOption = {
  accent: string;
  caption: string;
  id: string;
  label: string;
  statuses: DispatchScheduleCellStatus[];
};

const cycleCalendarLabelOptions: CycleCalendarLabelOption[] = [
  {
    accent: "var(--client-accent)",
    caption: "商户",
    id: "booked",
    label: "有预约",
    statuses: ["booked"]
  },
  {
    accent: "var(--client-primary)",
    caption: "技师",
    id: "confirmed",
    label: "已排班",
    statuses: ["confirmed"]
  },
  {
    accent: "var(--client-warning)",
    caption: "技师",
    id: "open",
    label: "可排班",
    statuses: ["open"]
  },
  {
    accent: "#ef5b55",
    caption: "处理",
    id: "conflict",
    label: "冲突 / 待定",
    statuses: ["conflict", "pending"]
  },
  {
    accent: "var(--client-warm)",
    caption: "商户",
    id: "other",
    label: "其他行程",
    statuses: ["other"]
  }
];

const cycleLaneAccents = [
  "var(--client-primary)",
  "var(--client-warm)",
  "var(--client-accent)",
  "var(--client-warning)",
  "color-mix(in srgb, var(--client-primary) 72%, var(--client-accent) 28%)",
  "color-mix(in srgb, var(--client-warm) 72%, var(--client-warning) 28%)"
];

const scheduleStatusLabel: Record<DispatchScheduleCellStatus, string> = {
  booked: "有预约",
  closed: "未开放",
  confirmed: "已排班",
  conflict: "冲突 / 待定",
  idle: "未排班",
  open: "可排班",
  other: "其他行程",
  pending: "冲突 / 待定"
};

const scheduleStatusSource: Record<DispatchScheduleCellStatus, UnifiedCalendarSourceId> = {
  booked: "merchant",
  closed: "holiday",
  confirmed: "technician",
  conflict: "merchant",
  idle: "todo",
  open: "technician",
  other: "merchant",
  pending: "merchant"
};

type CycleCalendarParticipantContext = {
  arrangements: ReturnType<typeof useDispatchCenterStore>["arrangements"];
  customers: Customer[];
  storeId: string;
  stores: Store[];
  technicians: Technician[];
};

function createDefaultCycleStatusVisibility(): Record<DispatchScheduleCellStatus, boolean> {
  return {
    booked: true,
    closed: false,
    confirmed: true,
    conflict: true,
    idle: false,
    open: true,
    other: true,
    pending: true
  };
}

function createEmptyCycleStatusCounts(): Record<DispatchScheduleCellStatus, number> {
  return {
    booked: 0,
    closed: 0,
    confirmed: 0,
    conflict: 0,
    idle: 0,
    open: 0,
    other: 0,
    pending: 0
  };
}

function getDateRangeDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = startDate;

  while (cursor <= endDate && dates.length < 62) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function getCycleCalendarPeriod(view: ScheduleCycleCalendarBoardView, dateKey: string, cycle?: { periodStart: string; periodEnd: string } | null): CycleCalendarPeriod {
  if (view === "day") {
    return {
      dates: [dateKey],
      label: formatLongDate(dateKey)
    };
  }

  if (view === "week") {
    const dates = getWeekDates(dateKey);
    return {
      dates,
      label: `${formatShortDate(dates[0] ?? dateKey)} - ${formatShortDate(dates[dates.length - 1] ?? dateKey)}`
    };
  }

  if (view === "agenda") {
    const dates = cycle ? getDateRangeDates(cycle.periodStart, cycle.periodEnd) : getWeekDates(dateKey);

    return {
      dates,
      label: cycle ? `${formatShortDate(cycle.periodStart)} - ${formatShortDate(cycle.periodEnd)}` : `${formatShortDate(dates[0] ?? dateKey)} - ${formatShortDate(dates[dates.length - 1] ?? dateKey)}`
    };
  }

  const date = new Date(`${dateKey}T00:00:00`);
  return {
    dates: getMonthGridDates(dateKey),
    label: `${date.getFullYear()}年${date.getMonth() + 1}月`
  };
}

function shiftCycleCalendarDate(view: ScheduleCycleCalendarBoardView, dateKey: string, direction: -1 | 1) {
  if (view === "day") {
    return addDays(dateKey, direction);
  }

  if (view === "week" || view === "agenda") {
    return addDays(dateKey, direction * 7);
  }

  return addMonths(dateKey, direction);
}

function formatCycleCalendarHour(hour: number) {
  return `${String(Math.min(hour, 24)).padStart(2, "0")}:00`;
}

function normalizeSearchValue(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function getCellSearchText(cell: DispatchScheduleCell) {
  return [
    cell.date,
    cell.title,
    cell.detail,
    cell.status,
    cell.technicianName,
    cell.orderId,
    cell.appointmentId
  ].filter(Boolean).join(" ");
}

function cellMatchesStatusFilter(cell: DispatchScheduleCell, filter: ScheduleCycleCalendarStatusFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "conflict") {
    return cell.status === "conflict" || cell.status === "pending";
  }

  return cell.status === filter;
}

function canRenderCycleCell(cell: DispatchScheduleCell, normalizedSearchQuery: string, statusFilter: ScheduleCycleCalendarStatusFilter) {
  if (cell.hour == null || cell.status === "closed" || cell.status === "idle") {
    return false;
  }

  if (!cellMatchesStatusFilter(cell, statusFilter)) {
    return false;
  }

  if (!normalizedSearchQuery) {
    return true;
  }

  const tokens = normalizedSearchQuery.split(" ").filter(Boolean);
  const haystack = normalizeSearchValue(getCellSearchText(cell));
  return tokens.every((token) => haystack.includes(token));
}

function getCycleCellMergeKey(cell: DispatchScheduleCell) {
  return [
    cell.status,
    cell.orderId ?? cell.detailTargetId ?? cell.appointmentId ?? "",
    cell.title,
    cell.detail
  ].join(":");
}

function getRepresentativeCell(cells: DispatchScheduleCell[]) {
  return cells.find((cell) => cell.detailTargetType || cell.orderId || cell.appointmentId) ?? cells[0];
}

function getCycleCalendarEventTitle(status: DispatchScheduleCellStatus, representativeCell: DispatchScheduleCell) {
  const needoAppBookingTitle = getNeedoAppBookingTitle(representativeCell.orderId, representativeCell.title);
  if (needoAppBookingTitle) {
    return needoAppBookingTitle;
  }

  if (status === "open" || status === "confirmed" || status === "booked" || status === "conflict" || status === "pending") {
    return scheduleStatusLabel[status];
  }

  return representativeCell.title || scheduleStatusLabel[status];
}

function dedupeCycleParticipants(participants: Array<UnifiedCalendarParticipant | null | undefined>) {
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

function getCycleTechnicianParticipant(technician: Technician | undefined, row: { technicianId: string; technicianName: string; technicianAvatar?: string }): UnifiedCalendarParticipant {
  return {
    id: `technician:${technician?.id ?? row.technicianId}`,
    name: technician?.nickname?.trim() || technician?.name || row.technicianName,
    avatar: technician?.avatar || row.technicianAvatar,
    meta: [technician?.identityLabel, technician?.status === "busy" ? "服务中" : technician?.status === "off" ? "休息" : "可排班"].filter(Boolean).join(" · "),
    role: "参加者",
    to: `/merchant/staff/${encodeURIComponent(technician?.id ?? row.technicianId)}`
  };
}

function getCycleCustomerParticipant(customer: Customer | undefined, fallbackName?: string | null): UnifiedCalendarParticipant | null {
  const name = customer?.nickname?.trim() || customer?.name || fallbackName?.trim();
  if (!name) {
    return null;
  }

  return {
    id: `customer:${customer?.id ?? name}`,
    name,
    avatar: customer?.avatar,
    meta: customer ? [customer.memberLevel, customer.systemId].filter(Boolean).join(" · ") : "顾客",
    role: "参加者",
    to: customer ? `/merchant/profiles/user/${customer.id}` : undefined
  };
}

function getCycleStoreParticipant(store: Store | undefined): UnifiedCalendarParticipant | null {
  if (!store) {
    return null;
  }

  return {
    id: `store:${store.id}`,
    name: store.name,
    avatar: store.cover,
    meta: [store.area, store.tags[0]].filter(Boolean).join(" · "),
    role: "创建者",
    to: `/merchant/profiles/shop/${store.id}`
  };
}

function getCycleEventParticipants(
  representativeCell: DispatchScheduleCell,
  row: { technicianId: string; technicianName: string; technicianAvatar?: string },
  context: CycleCalendarParticipantContext
) {
  const technician = context.technicians.find((item) => item.id === row.technicianId);
  const arrangement = representativeCell.orderId
    ? context.arrangements.find((item) => item.storeId === context.storeId && item.orderId === representativeCell.orderId && item.status !== "cancelled")
    : null;
  const customer = arrangement ? context.customers.find((item) => item.id === arrangement.customerId) : undefined;
  const store = context.stores.find((item) => item.id === context.storeId);

  return dedupeCycleParticipants([
    getCycleCustomerParticipant(customer, arrangement?.customerName),
    getCycleTechnicianParticipant(technician, row),
    getCycleStoreParticipant(store)
  ]);
}

function buildCycleCalendarData(
  dayGrids: ReturnType<typeof getDispatchScheduleGrid>[],
  context: CycleCalendarParticipantContext,
  getTechnicianDetailPath: ((technicianId: string) => string | undefined) | undefined,
  normalizedSearchQuery: string,
  statusFilter: ScheduleCycleCalendarStatusFilter,
  statusVisibility: Record<DispatchScheduleCellStatus, boolean>
) {
  const firstGrid = dayGrids[0];
  const lanes: UnifiedCalendarLane[] = (firstGrid?.rows ?? []).map((row, index) => ({
    accent: cycleLaneAccents[index % cycleLaneAccents.length] ?? "var(--client-primary)",
    avatar: row.technicianAvatar,
    caption: row.technicianSubtitle,
    detailPath: getTechnicianDetailPath?.(row.technicianId),
    id: `technician:${row.technicianId}`,
    label: row.technicianName
  }));
  const cellByEventId = new Map<string, DispatchScheduleCell>();
  const statusCounts = createEmptyCycleStatusCounts();
  const events = dayGrids.flatMap((grid) =>
    grid.rows.flatMap((row) => {
      const ranges: Array<{
        cells: DispatchScheduleCell[];
        endHour: number;
        mergeKey: string;
        startHour: number;
        status: DispatchScheduleCellStatus;
      }> = [];

      row.cells.forEach((cell) => {
        if (!canRenderCycleCell(cell, normalizedSearchQuery, statusFilter) || cell.hour == null) {
          return;
        }

        const mergeKey = getCycleCellMergeKey(cell);
        const previous = ranges[ranges.length - 1];

        if (previous && previous.endHour === cell.hour && previous.mergeKey === mergeKey) {
          previous.cells.push(cell);
          previous.endHour = cell.hour + 1;
          return;
        }

        ranges.push({
          cells: [cell],
          endHour: cell.hour + 1,
          mergeKey,
          startHour: cell.hour,
          status: cell.status
        });
      });

      return ranges.map((range): UnifiedCalendarEvent | null => {
        statusCounts[range.status] += 1;

        if (!statusVisibility[range.status]) {
          return null;
        }

        const representativeCell = getRepresentativeCell(range.cells);

        if (!representativeCell) {
          return null;
        }

        const eventId = `cycle-${row.technicianId}-${representativeCell.date}-${range.startHour}-${range.endHour}-${range.mergeKey}`;
        cellByEventId.set(eventId, representativeCell);

        return {
          badge: scheduleStatusLabel[range.status],
          calendarId: `technician:${row.technicianId}`,
          calendarLabel: row.technicianName,
          creatorEntityId: context.storeId,
          creatorEntityType: "shop",
          creatorLabel: context.stores.find((item) => item.id === context.storeId)?.name,
          date: representativeCell.date,
          endTime: formatCycleCalendarHour(range.endHour),
          id: eventId,
          location: context.stores.find((item) => item.id === context.storeId)?.address,
          orderId: representativeCell.orderId,
          participants: getCycleEventParticipants(representativeCell, row, context),
          readOnly: true,
          reminder: "5 分前",
          sourceId: scheduleStatusSource[range.status],
          startTime: formatCycleCalendarHour(range.startHour),
          subtitle: `${row.technicianName} · ${representativeCell.detail}`,
          title: getCycleCalendarEventTitle(range.status, representativeCell)
        };
      }).filter((event): event is UnifiedCalendarEvent => Boolean(event));
    })
  ).sort((left, right) => `${left.date} ${left.startTime} ${left.calendarId} ${left.id}`.localeCompare(`${right.date} ${right.startTime} ${right.calendarId} ${right.id}`));

  return { cellByEventId, events, lanes, statusCounts };
}

function groupEventsByDate(events: UnifiedCalendarEvent[]) {
  return events.reduce<Record<string, UnifiedCalendarEvent[]>>((grouped, event) => {
    grouped[event.date] = [...(grouped[event.date] ?? []), event];
    return grouped;
  }, {});
}

function EmptyCycleCalendarState({ dateKey, searchQuery }: { dateKey: string; searchQuery?: string }) {
  const hasSearch = Boolean(searchQuery?.trim());

  return (
    <div className="rounded-[20px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-4 py-5 text-center">
      <strong className="block text-sm font-black text-[color:var(--client-text)]">
        {hasSearch ? `没有符合「${searchQuery?.trim()}」的排班` : `${formatLongDate(dateKey)} 暂无排班`}
      </strong>
      <p className="mt-2 text-[11px] font-bold text-[color:var(--client-muted)]">
        {hasSearch ? "换个关键词，或清空搜索后查看全部周期排班。" : "切换日期后可以继续查看当前周期的并行排班。"}
      </p>
    </div>
  );
}

function getCycleLabelOptionCount(option: CycleCalendarLabelOption, statusCounts: Record<DispatchScheduleCellStatus, number>) {
  return option.statuses.reduce((total, status) => total + statusCounts[status], 0);
}

function CycleCalendarLabelDrawer({
  open,
  statusCounts,
  statusVisibility,
  onClose,
  onShowAll,
  onToggle
}: {
  open: boolean;
  statusCounts: Record<DispatchScheduleCellStatus, number>;
  statusVisibility: Record<DispatchScheduleCellStatus, boolean>;
  onClose: () => void;
  onShowAll: () => void;
  onToggle: (statuses: DispatchScheduleCellStatus[]) => void;
}) {
  if (!open) {
    return null;
  }

  const visibleCount = cycleCalendarLabelOptions.reduce(
    (total, option) => total + (option.statuses.some((status) => statusVisibility[status]) ? getCycleLabelOptionCount(option, statusCounts) : 0),
    0
  );

  return (
    <>
      <button
        aria-label="关闭排班标签遮罩"
        className="fixed inset-0 z-[145] bg-[color:color-mix(in_srgb,var(--client-bg)_40%,transparent)] backdrop-blur-md"
        onClick={onClose}
        type="button"
      />
      <aside className="client-nav-aligned-panel fixed left-1/2 top-1/2 z-[150] max-h-[calc(100dvh-64px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_96%,transparent)] shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl" role="menu">
        <div className="flex items-center justify-between border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3.5 py-3">
          <div className="min-w-0">
            <strong className="block text-sm font-black text-[color:var(--client-text)]">显示标签</strong>
            <span className="mt-1 block text-[10px] font-black text-[color:var(--client-muted)]">选择周期排班表里显示的状态</span>
          </div>
          <MobileFullscreenCloseButton className="h-10 w-10" label="关闭显示标签" onClose={onClose} />
        </div>

        <div className="max-h-[calc(100dvh-180px)] space-y-3 overflow-y-auto px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_78%,transparent)] px-3 py-2">
            <span className="text-[11px] font-black text-[color:var(--client-muted)]">当前显示</span>
            <strong className="text-[12px] font-black text-[color:var(--client-text)]">{visibleCount} 件</strong>
          </div>
          <div className="grid gap-2">
            {cycleCalendarLabelOptions.map((option) => {
              const active = option.statuses.some((status) => statusVisibility[status]);
              const count = getCycleLabelOptionCount(option, statusCounts);

              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "focus-ring flex min-h-[54px] items-center gap-3 rounded-[18px] border px-3 text-left transition",
                    active
                      ? "border-[color:color-mix(in_srgb,var(--cycle-label-accent)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--cycle-label-accent)_16%,var(--client-elevated)_84%)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] opacity-58"
                  )}
                  key={option.id}
                  onClick={() => onToggle(option.statuses)}
                  style={{ "--cycle-label-accent": option.accent } as CSSProperties}
                  type="button"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full bg-[color:var(--cycle-label-accent)]" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[12px] font-black text-[color:var(--client-text)]">{option.label}</strong>
                    <span className="mt-0.5 block truncate text-[10px] font-bold text-[color:var(--client-muted)]">{option.caption}</span>
                  </span>
                  <span className="rounded-full border border-[color:color-mix(in_srgb,var(--cycle-label-accent)_44%,transparent)] px-2 py-1 text-[11px] font-black text-[color:var(--client-text)]">{count}</span>
                </button>
              );
            })}
          </div>
          <button
            className="focus-ring h-10 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] text-[12px] font-black text-[color:var(--client-accent-text)]"
            onClick={onShowAll}
            type="button"
          >
            全部显示
          </button>
        </div>
      </aside>
    </>
  );
}

export function ScheduleCycleCalendarBoard({
  className,
  cycleId,
  dateKey,
  getTechnicianDetailPath,
  onDateChange,
  onOpenCell,
  onViewChange,
  searchQuery = "",
  statusFilter = "all",
  storeId,
  subtitle = "当前周期 · 多技师并行日程",
  view
}: ScheduleCycleCalendarBoardProps) {
  const navigate = useNavigate();
  const dispatchSnapshot = useDispatchCenterStore();
  const entitySnapshot = useEntityStore();
  const [labelDrawerOpen, setLabelDrawerOpen] = useState(false);
  const [activeDetail, setActiveDetail] = useState<{ cell: DispatchScheduleCell; event: UnifiedCalendarEvent } | null>(null);
  const [statusVisibility, setStatusVisibility] = useState(createDefaultCycleStatusVisibility);
  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const cycle = useMemo(
    () => (cycleId ? getDispatchCycleList(storeId).find((item) => item.id === cycleId) ?? null : null),
    [cycleId, dispatchSnapshot.revision, storeId]
  );
  const period = useMemo(() => getCycleCalendarPeriod(view, dateKey, cycle), [cycle, dateKey, view]);
  const periodKey = period.dates.join("|");
  const dayGrids = useMemo(
    () => period.dates.map((date) => getDispatchScheduleGrid(storeId, "day", date, cycleId)),
    [cycleId, dispatchSnapshot.revision, periodKey, storeId]
  );
  const { cellByEventId, events, lanes, statusCounts } = useMemo(
    () => buildCycleCalendarData(
      dayGrids,
      {
        arrangements: dispatchSnapshot.arrangements,
        customers: entitySnapshot.customers,
        storeId,
        stores: entitySnapshot.stores,
        technicians: entitySnapshot.technicians
      },
      getTechnicianDetailPath,
      normalizedSearchQuery,
      statusFilter,
      statusVisibility
    ),
    [dayGrids, dispatchSnapshot.arrangements, entitySnapshot.customers, entitySnapshot.stores, entitySnapshot.technicians, getTechnicianDetailPath, normalizedSearchQuery, statusFilter, statusVisibility, storeId]
  );
  const groupedEvents = useMemo(() => groupEventsByDate(events), [events]);
  const selectedDateEvents = groupedEvents[dateKey] ?? [];
  const monthKey = dateKey.slice(0, 7);
  const openEvent = (event: UnifiedCalendarEvent) => {
    const cell = cellByEventId.get(event.id);

    if (cell) {
      setActiveDetail({ cell, event });
    }
  };
  const toggleStatusLabels = (statuses: DispatchScheduleCellStatus[]) => {
    setStatusVisibility((current) => {
      const shouldShow = !statuses.some((status) => current[status]);
      const next = { ...current };
      statuses.forEach((status) => {
        next[status] = shouldShow;
      });
      return next;
    });
  };
  const showAllStatusLabels = () => {
    setStatusVisibility(createDefaultCycleStatusVisibility());
  };
  const renderSelectedDateList = () => (
    selectedDateEvents.length > 0 ? (
      <div className="space-y-2">
        {selectedDateEvents.map((event) => (
          <UnifiedCalendarEventCard event={event} key={event.id} onOpen={openEvent} />
        ))}
      </div>
    ) : (
      <EmptyCycleCalendarState dateKey={dateKey} searchQuery={searchQuery} />
    )
  );

  return (
    <UnifiedCalendarSurface
      className={className}
      data-schedule-cycle-calendar-board="true"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            aria-expanded={labelDrawerOpen}
            aria-label="打开排班标签显示选项"
            className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)]"
            onClick={() => setLabelDrawerOpen((current) => !current)}
            type="button"
          >
            <AppIcon name="menu" />
          </button>
          <div className="min-w-0">
            <strong className="block truncate text-lg font-black text-[color:var(--client-text)]">{period.label}</strong>
            <span className="mt-0.5 block truncate text-[11px] font-black text-[color:var(--client-muted)]">{subtitle}</span>
          </div>
        </div>
        <button
          className="focus-ring h-9 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3 text-[12px] font-black text-[color:var(--client-text)]"
          onClick={() => onDateChange(getTodayDateKey())}
          type="button"
        >
          今天
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[auto,1fr,auto] items-center gap-2">
        <button
          className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-lg font-black text-[color:var(--client-text)]"
          onClick={() => onDateChange(shiftCycleCalendarDate(view, dateKey, -1))}
          type="button"
        >
          ‹
        </button>
        <div
          className="grid rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_84%,transparent)] p-1"
          style={{ gridTemplateColumns: `repeat(${cycleCalendarViewOptions.length}, minmax(0, 1fr))` }}
        >
          {cycleCalendarViewOptions.map((option) => (
            <button
              aria-pressed={view === option.value}
              className={cn(
                "focus-ring h-8 rounded-full text-[12px] font-black transition",
                view === option.value
                  ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_10px_20px_color-mix(in_srgb,var(--client-primary)_20%,transparent)]"
                  : "text-[color:var(--client-muted)]"
              )}
              key={option.value}
              onClick={() => onViewChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-lg font-black text-[color:var(--client-text)]"
          onClick={() => onDateChange(shiftCycleCalendarDate(view, dateKey, 1))}
          type="button"
        >
          ›
        </button>
      </div>

      {normalizedSearchQuery ? (
        <div className="mt-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary-soft)_52%,var(--client-elevated)_48%)] px-3 py-2 text-[11px] font-black text-[color:var(--client-accent-text)]">
          搜索「{searchQuery.trim()}」 · 当前视图 {events.length} 件
        </div>
      ) : null}

      {view === "day" ? (
        <div className="mt-3">
          <UnifiedCalendarDayTimeline
            calendarLanes={lanes}
            date={dateKey}
            emptySearchQuery={normalizedSearchQuery ? searchQuery.trim() : undefined}
            events={selectedDateEvents}
            onOpen={openEvent}
          />
        </div>
      ) : view === "week" ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-7 gap-1">
            {getWeekDates(dateKey).map((date) => {
              const count = (groupedEvents[date] ?? []).length;
              const selected = dateKey === date;

              return (
                <button
                  className={cn(
                    "focus-ring relative min-h-[64px] rounded-[16px] border px-1.5 py-2 text-center transition",
                    selected
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)]"
                  )}
                  key={date}
                  onClick={() => onDateChange(date)}
                  type="button"
                >
                  <HolidayCornerBadge date={date} />
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
            {getMonthGridDates(dateKey).map((date) => {
              const dateEvents = groupedEvents[date] ?? [];
              const selected = dateKey === date;
              const inMonth = date.slice(0, 7) === monthKey;

              return (
                <button
                  className={cn(
                    "focus-ring relative min-h-[66px] rounded-[13px] border px-1.5 py-1.5 text-left transition",
                    selected
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)]",
                    !inMonth && "opacity-35"
                  )}
                  key={date}
                  onClick={() => onDateChange(date)}
                  type="button"
                >
                  <HolidayCornerBadge date={date} />
                  <strong className="block text-[12px] font-black text-[color:var(--client-text)]">{Number(date.slice(-2))}</strong>
                  <span className="mt-2 flex flex-col gap-1">
                    {dateEvents.slice(0, 3).map((event) => (
                      <span className="h-1.5 rounded-full bg-[color:var(--client-primary)]" key={event.id} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {renderSelectedDateList()}
        </div>
      ) : (
        events.length > 0 ? (
          <UnifiedCalendarAgendaView
            dates={period.dates}
            events={events}
            onCreate={() => undefined}
            onExtendFuture={() => undefined}
            onExtendPast={() => undefined}
            onOpen={openEvent}
            scrollTargetDate={dateKey}
            scrollTargetRequestId={1}
            searchQuery={searchQuery}
          />
        ) : (
          <div className="mt-3">
            <EmptyCycleCalendarState dateKey={dateKey} searchQuery={searchQuery} />
          </div>
        )
      )}
      <CycleCalendarLabelDrawer
        onClose={() => setLabelDrawerOpen(false)}
        onShowAll={showAllStatusLabels}
        onToggle={toggleStatusLabels}
        open={labelDrawerOpen}
        statusCounts={statusCounts}
        statusVisibility={statusVisibility}
      />
      {activeDetail ? (
        <UnifiedCalendarEventDetailPage
          event={activeDetail.event}
          onBack={() => setActiveDetail(null)}
          onEdit={() => {
            const cell = activeDetail.cell;
            setActiveDetail(null);
            onOpenCell(cell);
          }}
          onOpenAppointmentDetail={(event) => {
            if (!event.orderId) {
              return;
            }

            setActiveDetail(null);
            navigate(`/merchant/schedule/arrangements/${encodeURIComponent(event.orderId)}`);
          }}
        />
      ) : null}
    </UnifiedCalendarSurface>
  );
}
