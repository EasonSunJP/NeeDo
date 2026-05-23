import { useMemo } from "react";
import { AppIcon } from "../client-ui/AppScaffold";
import {
  UnifiedCalendarDayTimeline,
  UnifiedCalendarEventCard,
  type UnifiedCalendarEvent,
  type UnifiedCalendarLane,
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
  getDispatchScheduleGrid,
  useDispatchCenterStore,
  type DispatchScheduleCell,
  type DispatchScheduleCellStatus
} from "../../features/dispatch-center/store";
import { cn } from "../../lib/utils";

export type ScheduleCycleCalendarBoardView = "day" | "week" | "month";
export type ScheduleCycleCalendarStatusFilter = "all" | DispatchScheduleCellStatus;

type ScheduleCycleCalendarBoardProps = {
  className?: string;
  cycleId?: string | null;
  dateKey: string;
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
  { label: "月", value: "month" }
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

function getCycleCalendarPeriod(view: ScheduleCycleCalendarBoardView, dateKey: string): CycleCalendarPeriod {
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

  if (view === "week") {
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
  if (status === "open" || status === "confirmed" || status === "booked" || status === "conflict" || status === "pending") {
    return scheduleStatusLabel[status];
  }

  return representativeCell.title || scheduleStatusLabel[status];
}

function buildCycleCalendarData(
  dayGrids: ReturnType<typeof getDispatchScheduleGrid>[],
  normalizedSearchQuery: string,
  statusFilter: ScheduleCycleCalendarStatusFilter
) {
  const firstGrid = dayGrids[0];
  const lanes: UnifiedCalendarLane[] = (firstGrid?.rows ?? []).map((row, index) => ({
    accent: cycleLaneAccents[index % cycleLaneAccents.length] ?? "var(--client-primary)",
    avatar: row.technicianAvatar,
    caption: row.technicianSubtitle,
    id: `technician:${row.technicianId}`,
    label: row.technicianName
  }));
  const cellByEventId = new Map<string, DispatchScheduleCell>();
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
          date: representativeCell.date,
          endTime: formatCycleCalendarHour(range.endHour),
          id: eventId,
          orderId: representativeCell.orderId,
          readOnly: true,
          sourceId: scheduleStatusSource[range.status],
          startTime: formatCycleCalendarHour(range.startHour),
          subtitle: `${row.technicianName} · ${representativeCell.detail}`,
          title: getCycleCalendarEventTitle(range.status, representativeCell)
        };
      }).filter((event): event is UnifiedCalendarEvent => Boolean(event));
    })
  ).sort((left, right) => `${left.date} ${left.startTime} ${left.calendarId} ${left.id}`.localeCompare(`${right.date} ${right.startTime} ${right.calendarId} ${right.id}`));

  return { cellByEventId, events, lanes };
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

export function ScheduleCycleCalendarBoard({
  className,
  cycleId,
  dateKey,
  onDateChange,
  onOpenCell,
  onViewChange,
  searchQuery = "",
  statusFilter = "all",
  storeId,
  subtitle = "当前周期 · 多技师并行日程",
  view
}: ScheduleCycleCalendarBoardProps) {
  const dispatchSnapshot = useDispatchCenterStore();
  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const period = useMemo(() => getCycleCalendarPeriod(view, dateKey), [dateKey, view]);
  const periodKey = period.dates.join("|");
  const dayGrids = useMemo(
    () => period.dates.map((date) => getDispatchScheduleGrid(storeId, "day", date, cycleId)),
    [cycleId, dispatchSnapshot.revision, periodKey, storeId]
  );
  const { cellByEventId, events, lanes } = useMemo(
    () => buildCycleCalendarData(dayGrids, normalizedSearchQuery, statusFilter),
    [dayGrids, normalizedSearchQuery, statusFilter]
  );
  const groupedEvents = useMemo(() => groupEventsByDate(events), [events]);
  const selectedDateEvents = groupedEvents[dateKey] ?? [];
  const monthKey = dateKey.slice(0, 7);
  const openEvent = (event: UnifiedCalendarEvent) => {
    const cell = cellByEventId.get(event.id);

    if (cell) {
      onOpenCell(cell);
    }
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
    <section className={cn(
      "relative overflow-visible rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-3 shadow-[var(--client-shadow)]",
      className
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)]">
            <AppIcon name="calendar" />
          </span>
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
        <div className="grid grid-cols-3 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_84%,transparent)] p-1">
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
                    "focus-ring min-h-[64px] rounded-[16px] border px-1.5 py-2 text-center transition",
                    selected
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)]"
                  )}
                  key={date}
                  onClick={() => onDateChange(date)}
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
      ) : (
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
                    "focus-ring min-h-[66px] rounded-[13px] border px-1.5 py-1.5 text-left transition",
                    selected
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)]",
                    !inMonth && "opacity-35"
                  )}
                  key={date}
                  onClick={() => onDateChange(date)}
                  type="button"
                >
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
      )}
    </section>
  );
}
