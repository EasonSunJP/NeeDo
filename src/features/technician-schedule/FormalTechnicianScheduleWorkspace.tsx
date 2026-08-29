import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScheduleViewSegmentedTabs } from "../../components/client-ui/AppScaffold";
import { FormalTechnicianOrdersPanel } from "../../components/technician/FormalTechnicianOrdersPanel";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { cn, yen } from "../../lib/utils";
import { loadEveryTechnicianOrder, loadManagedScheduleWindow } from "../scheduling/window-loader";
import type { BookingOrder, BookingScheduleSlot } from "../booking/api";
import { buildFormalTechnicianCalendar } from "./formal-schedule-presentation";
import {
  formatLongDate,
  getMonthGridDates,
  getPeriod,
  getTodayDateKey,
  getWeekDates,
  getWeekdayLabel,
  shiftScheduleSelection,
  type TechnicianCalendarItem,
  type TechnicianScheduleView
} from "./model";

type WorkspaceTab = "calendar" | "orders";

const schedulePanelClass =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] shadow-[var(--client-shadow)]";
const scheduleInsetClass =
  "rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)]";

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function SummaryCard({ label, value, suffix = "小时" }: { label: string; value: string; suffix?: string }) {
  return (
    <div className={cn(scheduleInsetClass, "min-w-0 px-3 py-3")}>
      <p className="truncate text-[11px] font-black text-[color:var(--client-muted)]">{label}</p>
      <div className="mt-2 flex items-end gap-1">
        <strong className="truncate text-[20px] font-black leading-none tracking-[-0.04em] text-[color:var(--client-text)] tabular-nums">{value}</strong>
        <span className="shrink-0 pb-0.5 text-[10px] font-black text-[color:var(--client-muted)]">{suffix}</span>
      </div>
    </div>
  );
}

function itemTone(item: TechnicianCalendarItem) {
  if (item.kind === "availability") {
    return "border-[color:var(--schedule-tone-available-border)] bg-[color:var(--schedule-tone-available-bg)] text-[color:var(--schedule-tone-available-text)]";
  }
  if (item.kind === "locked") {
    return "border-[color:var(--schedule-tone-conflict-pending-border)] bg-[color:var(--schedule-tone-conflict-pending-bg)] text-[color:var(--schedule-tone-conflict-pending-text)]";
  }
  return "border-[color:var(--schedule-tone-booked-border)] bg-[color:var(--schedule-tone-booked-bg)] text-[color:var(--schedule-tone-booked-text)]";
}

function itemPath(item: TechnicianCalendarItem) {
  return item.orderId
    ? `/technician/orders/${item.orderId}`
    : `/technician/schedule/events/${item.sourceId}`;
}

function AgendaItem({ item }: { item: TechnicianCalendarItem }) {
  return (
    <Link
      className={cn("block rounded-[18px] border px-3.5 py-3 text-left transition", itemTone(item))}
      to={itemPath(item)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-current/20 bg-black/5 px-2 py-0.5 text-[10px] font-black">{item.badgeLabel}</span>
            <span className="text-[11px] font-black opacity-70">{item.startTime}–{item.endTime}</span>
          </div>
          <h3 className="mt-2 truncate text-sm font-black">{item.title}</h3>
          <p className="mt-1 truncate text-xs font-bold opacity-70">{item.subtitle}</p>
          {item.note ? <p className="mt-2 line-clamp-2 text-xs leading-5 opacity-75">{item.note}</p> : null}
        </div>
        {item.amount ? <strong className="shrink-0 text-sm font-black">{yen(item.amount)}</strong> : null}
      </div>
    </Link>
  );
}

function DayTimeline({ items }: { items: TechnicianCalendarItem[] }) {
  const startHour = Math.min(8, ...items.map((item) => Number(item.startTime.slice(0, 2))));
  const endHour = Math.max(20, ...items.map((item) => Number(item.endTime.slice(0, 2)) + 1));
  const hourCount = Math.max(1, endHour - startHour);
  const rowHeight = 58;
  const minuteOffset = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return ((hour - startHour) * 60 + minute) / 60 * rowHeight;
  };

  return (
    <div className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)]" data-testid="formal-schedule-day-timeline">
      <div className="grid grid-cols-[58px_minmax(0,1fr)]">
        <div className="border-r border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,transparent)]">
          {Array.from({ length: hourCount }, (_, index) => (
            <div className="h-[58px] border-b border-[color:color-mix(in_srgb,var(--client-line)_56%,transparent)] px-2 py-2 text-center text-[10px] font-black text-[color:var(--client-muted)]" key={index}>
              {String(startHour + index).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        <div className="relative" style={{ height: hourCount * rowHeight }}>
          {Array.from({ length: hourCount }, (_, index) => (
            <span className="absolute inset-x-0 border-b border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)]" key={index} style={{ top: (index + 1) * rowHeight }} />
          ))}
          {items.map((item, index) => {
            const top = minuteOffset(item.startTime) + 4;
            const height = Math.max(48, minuteOffset(item.endTime) - minuteOffset(item.startTime) - 8);
            return (
              <Link
                className={cn("absolute overflow-hidden rounded-[16px] border px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.12)]", itemTone(item))}
                key={item.id}
                style={{ top, height, left: 8 + (index % 2) * 5, right: 8 + ((index + 1) % 2) * 5 }}
                to={itemPath(item)}
              >
                <p className="truncate text-[10px] font-black opacity-70">{item.badgeLabel} · {item.startTime}–{item.endTime}</p>
                <h3 className="mt-1 truncate text-xs font-black">{item.title}</h3>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekCalendar({ dates, itemsByDate, selectedDate, onSelect }: {
  dates: string[];
  itemsByDate: Record<string, TechnicianCalendarItem[]>;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="max-w-full overflow-x-auto pb-1" data-testid="formal-schedule-week-grid">
      <div className="grid min-w-[760px] grid-cols-7 gap-2">
        {dates.map((date) => (
          <button
            className={cn(scheduleInsetClass, "min-h-[240px] p-2.5 text-left", date === selectedDate && "ring-2 ring-[color:var(--client-primary)]")}
            key={date}
            onClick={() => onSelect(date)}
            type="button"
          >
            <p className="text-center text-[11px] font-black text-[color:var(--client-muted)]">{getWeekdayLabel(date)}</p>
            <p className="mt-1 text-center text-lg font-black">{Number(date.slice(-2))}</p>
            <div className="mt-3 space-y-1.5">
              {(itemsByDate[date] ?? []).slice(0, 4).map((item) => (
                <span className={cn("block truncate rounded-[10px] border px-2 py-1.5 text-[10px] font-black", itemTone(item))} key={item.id}>
                  {item.startTime} {item.title}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthCalendar({ anchorDate, itemsByDate, selectedDate, onSelect }: {
  anchorDate: string;
  itemsByDate: Record<string, TechnicianCalendarItem[]>;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const dates = getMonthGridDates(anchorDate);
  return (
    <div className={cn(schedulePanelClass, "overflow-hidden p-2")} data-testid="formal-schedule-month-grid">
      <div className="grid grid-cols-7">
        {["日", "一", "二", "三", "四", "五", "六"].map((label) => (
          <span className="py-2 text-center text-[10px] font-black text-[color:var(--client-muted)]" key={label}>{label}</span>
        ))}
        {dates.map((date) => {
          const count = (itemsByDate[date] ?? []).length;
          const inMonth = date.slice(0, 7) === anchorDate.slice(0, 7);
          return (
            <button
              className={cn(
                "relative min-h-[64px] border-t border-[color:color-mix(in_srgb,var(--client-line)_52%,transparent)] p-1.5 text-left",
                !inMonth && "opacity-35",
                date === selectedDate && "bg-[color:var(--client-primary-soft)]"
              )}
              key={date}
              onClick={() => onSelect(date)}
              type="button"
            >
              <span className="text-[11px] font-black">{Number(date.slice(-2))}</span>
              {count > 0 ? (
                <span className="mt-1 block w-fit rounded-full bg-[color:var(--client-primary)] px-1.5 py-0.5 text-[9px] font-black text-[color:var(--client-needo-text)]">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FormalTechnicianScheduleWorkspace({ profileName, shopName }: { profileName: string; shopName: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<WorkspaceTab>("calendar");
  const [view, setView] = useState<TechnicianScheduleView>("day");
  const [anchorDate, setAnchorDate] = useState(getTodayDateKey);
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey);
  const [searchQuery, setSearchQuery] = useState("");
  const [slots, setSlots] = useState<BookingScheduleSlot[]>([]);
  const [orders, setOrders] = useState<BookingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const period = useMemo(() => getPeriod(view, anchorDate), [anchorDate, view]);

  useEffect(() => {
    let active = true;
    const from = new Date(`${period.startDate}T00:00:00`);
    const to = new Date(`${period.endDate}T23:59:59.999`);
    setLoading(true);
    setError("");
    Promise.all([
      loadManagedScheduleWindow("technician", { from, to }),
      loadEveryTechnicianOrder({ from: from.toISOString(), to: to.toISOString() })
    ]).then(([nextSlots, nextOrders]) => {
      if (!active) return;
      setSlots(nextSlots);
      setOrders(nextOrders);
      setLoading(false);
    }).catch((loadError: unknown) => {
      if (!active) return;
      setSlots([]);
      setOrders([]);
      setError(loadError instanceof Error ? loadError.message : "error.schedule.load_failed");
      setLoading(false);
    });
    return () => { active = false; };
  }, [period.endDate, period.startDate, revision]);

  const presentation = useMemo(
    () => buildFormalTechnicianCalendar(slots, orders, selectedDate),
    [orders, selectedDate, slots]
  );
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const selectedItems = presentation.dayItems.filter((item) =>
    !normalizedSearch || [item.title, item.subtitle, item.note ?? ""].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
  );
  const shiftPeriod = useCallback((direction: -1 | 1) => {
    const shifted = shiftScheduleSelection(view, anchorDate, selectedDate, direction);
    setAnchorDate(shifted.anchorDate);
    setSelectedDate(shifted.selectedDate);
  }, [anchorDate, selectedDate, view]);
  const changeView = (nextView: TechnicianScheduleView) => {
    setView(nextView);
    setSelectedDate(nextView === "day" ? anchorDate : getPeriod(nextView, anchorDate).startDate);
  };
  const selectDate = (date: string) => {
    setSelectedDate(date);
    if (view === "month") setAnchorDate(date);
  };

  return (
    <div className="space-y-4 text-[color:var(--client-text)]" data-testid="formal-technician-schedule-workspace">
      <section className={cn(schedulePanelClass, "overflow-hidden p-3")}>
        <div className="grid grid-cols-2 gap-2 rounded-full bg-[color:color-mix(in_srgb,var(--client-elevated)_84%,transparent)] p-1">
          {([['calendar', '我的排班'], ['orders', '预约订单']] as const).map(([value, label]) => (
            <button
              className={cn("rounded-full px-4 py-2.5 text-sm font-black transition", tab === value ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]" : "text-[color:var(--client-muted)]")}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >{label}</button>
          ))}
        </div>
      </section>

      {tab === "orders" ? (
        <section className="client-feature-panel rounded-[28px] border p-4 text-white shadow-[var(--client-shadow)]" data-testid="formal-schedule-orders-surface">
          <div className="mb-4">
            <p className="text-[11px] font-black text-white/50">{shopName}</p>
            <h2 className="mt-1 text-xl font-black">正式预约订单</h2>
          </div>
          <FormalTechnicianOrdersPanel />
        </section>
      ) : (
        <>
          <section className={cn(schedulePanelClass, "p-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-[color:var(--client-muted)]">{profileName} · {shopName}</p>
                <h2 className="mt-1 truncate text-xl font-black tracking-[-0.04em]">{period.label}</h2>
              </div>
              <ScheduleViewSegmentedTabs onChange={changeView} value={view} />
            </div>
            <div className="mt-4 grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
              <button aria-label="上一时段" className={scheduleInsetClass} onClick={() => shiftPeriod(-1)} type="button">‹</button>
              <button className={cn(scheduleInsetClass, "px-3 py-2.5 text-sm font-black")} onClick={() => { const today = getTodayDateKey(); setAnchorDate(today); setSelectedDate(today); }} type="button">回到今天</button>
              <button aria-label="下一时段" className={scheduleInsetClass} onClick={() => shiftPeriod(1)} type="button">›</button>
            </div>
            <label className="relative mt-3 block">
              <AppIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[color:var(--client-muted)]" name="search" />
              <input aria-label="搜索正式排班" className="h-10 w-full rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] pl-10 pr-4 text-sm font-bold outline-none" onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索服务、店铺或备注" value={searchQuery} />
            </label>
          </section>

          <section className={cn(schedulePanelClass, "p-3")}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryCard label="已确认排班" value={formatHours(presentation.summary.confirmedHours)} />
              <SummaryCard label="预约工时" value={formatHours(presentation.summary.bookedHours)} />
              <SummaryCard label="可预约" value={formatHours(presentation.summary.freeHours)} />
              <SummaryCard label="锁定时段" value={formatHours(presentation.summary.tentativeHours)} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <SummaryCard label="当日订单" suffix="单" value={String(presentation.brief.orderCount)} />
              <SummaryCard label="预计收入" suffix="円" value={presentation.brief.estimatedRevenue === null ? "—" : presentation.brief.estimatedRevenue.toLocaleString("ja-JP")} />
              <SummaryCard label="时间冲突" suffix="" value={presentation.brief.hasConflict ? "有" : "无"} />
            </div>
          </section>

          {loading ? <section className={cn(schedulePanelClass, "p-8 text-center text-sm font-black")} aria-live="polite">正在读取正式排班与预约</section> : null}
          {error ? (
            <section className={cn(schedulePanelClass, "p-5")} role="alert">
              <p className="break-words text-sm font-black text-red-500">正式排班加载失败：{error}</p>
              <button className="mt-3 rounded-full bg-[color:var(--client-primary)] px-4 py-2 text-xs font-black text-[color:var(--client-needo-text)]" onClick={() => setRevision((current) => current + 1)} type="button">重新加载</button>
            </section>
          ) : null}

          {!loading && !error && view === "day" ? <DayTimeline items={selectedItems} /> : null}
          {!loading && !error && view === "week" ? <WeekCalendar dates={getWeekDates(anchorDate)} itemsByDate={presentation.itemsByDate} onSelect={selectDate} selectedDate={selectedDate} /> : null}
          {!loading && !error && view === "month" ? <MonthCalendar anchorDate={anchorDate} itemsByDate={presentation.itemsByDate} onSelect={selectDate} selectedDate={selectedDate} /> : null}

          {!loading && !error ? (
            <section className={cn(schedulePanelClass, "p-4")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black text-[color:var(--client-muted)]">{formatLongDate(selectedDate)}</p>
                  <h2 className="mt-1 text-lg font-black">当日安排</h2>
                </div>
                <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-xs font-black">{selectedItems.length} 条</span>
              </div>
              <div className="mt-3 space-y-2">
                {selectedItems.length > 0 ? selectedItems.map((item) => <AgendaItem item={item} key={item.id} />) : (
                  <div className={cn(scheduleInsetClass, "px-4 py-7 text-center text-sm font-bold text-[color:var(--client-muted)]")}>当前日期没有正式排班或预约</div>
                )}
              </div>
            </section>
          ) : null}

          <button
            aria-label="新建正式排班"
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+24px)] right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_18px_42px_color-mix(in_srgb,var(--client-primary)_40%,transparent)]"
            onClick={() => navigate("/technician/schedule/new")}
            type="button"
          >
            <AppIcon name="plus" />
          </button>
        </>
      )}
    </div>
  );
}
