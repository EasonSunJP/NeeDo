import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { AppIcon, IconButton, floatingHeaderControlButtonClassName } from "../../components/client-ui/AppScaffold";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderInnerClassName } from "../../components/mobile/FloatingHomeHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { roleBasedTabConfig, userNavItems } from "../../components/mobile/navItems";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { AvatarImage } from "../../components/ui/AvatarImage";
import {
  buildTechnicianPublicAvailabilityRanges,
  formatTechnicianPublicAvailabilityRange,
  type TechnicianPublicAvailabilityRange
} from "../../lib/technicianPublicAvailability";
import { resolveTechnicianScheduleRouteId } from "../../lib/technicianScheduleRoute";
import { getActivePolicyForStore } from "../../lib/shiftPlanning";
import { cn } from "../../lib/utils";
import { getCustomerLevelLabel } from "../../shared/profile-card/customerMembership";
import { useEntityStore } from "../../state/entityStore";
import { useHomeLayoutStore } from "../../state/homeLayoutStore";
import { useShiftPlanningStore } from "../../state/shiftPlanningStore";
import { useTechnicianScheduleStore } from "../../state/technicianScheduleStore";
import type { Technician } from "../../types/domain";
import {
  addDays,
  addMonths,
  formatLongDate,
  getMonthGridDates,
  getTodayDateKey,
  getWeekDates,
  getWeekdayHeaderLabel,
  getWeekdayLabel,
  timeToMinutes
} from "../../features/technician-schedule/model";

type AvailabilityView = "day" | "threeDay" | "week" | "month";

const viewOptions: Array<{ value: AvailabilityView; label: string }> = [
  { value: "day", label: "1日" },
  { value: "threeDay", label: "3日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" }
];

const hourRowHeight = 58;
const timeColumnWidth = 72;

function normalizeDateParam(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : getTodayDateKey();
}

function resolveBufferMinutes(technician: Technician, planningSnapshot: ReturnType<typeof useShiftPlanningStore>) {
  const policy = getActivePolicyForStore(technician.storeId, planningSnapshot.policies);
  const response = policy
    ? planningSnapshot.responses.find((item) => item.policyId === policy.id && item.technicianId === technician.id) ?? null
    : planningSnapshot.responses.find((item) => item.technicianId === technician.id) ?? null;

  if (!policy) {
    return {
      pre: response?.specialRules.preServiceBufferMinutes ?? 0,
      post: response?.specialRules.postServiceBufferMinutes ?? 0
    };
  }

  const forcePolicyBuffer = policy.forceInheritedRules.includes("buffers");

  return {
    pre: forcePolicyBuffer
      ? policy.preServiceBufferMinutes
      : Math.max(policy.preServiceBufferMinutes, response?.specialRules.preServiceBufferMinutes ?? 0),
    post: forcePolicyBuffer
      ? policy.postServiceBufferMinutes
      : Math.max(policy.postServiceBufferMinutes, response?.specialRules.postServiceBufferMinutes ?? 0)
  };
}

function formatPeriodLabel(view: AvailabilityView, anchorDate: string) {
  if (view === "month") {
    const date = new Date(`${anchorDate}T00:00:00`);
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }

  if (view === "week") {
    const dates = getWeekDates(anchorDate);
    const first = dates[0] ?? anchorDate;
    const last = dates[dates.length - 1] ?? anchorDate;
    return `${first.slice(5).replace("-", "/")} - ${last.slice(5).replace("-", "/")}`;
  }

  if (view === "threeDay") {
    const last = addDays(anchorDate, 2);
    return `${anchorDate.slice(5).replace("-", "/")} - ${last.slice(5).replace("-", "/")}`;
  }

  return formatLongDate(anchorDate);
}

function shiftAnchor(view: AvailabilityView, anchorDate: string, direction: -1 | 1) {
  if (view === "month") {
    return addMonths(anchorDate, direction);
  }

  if (view === "week") {
    return addDays(anchorDate, direction * 7);
  }

  if (view === "threeDay") {
    return addDays(anchorDate, direction * 3);
  }

  return addDays(anchorDate, direction);
}

function canNavigateBack() {
  return typeof window !== "undefined" && typeof window.history.state?.idx === "number" && window.history.state.idx > 0;
}

function AvailabilityTimeline({
  date,
  ranges,
  technician
}: {
  date: string;
  ranges: TechnicianPublicAvailabilityRange[];
  technician: Technician;
}) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, hour) => hour), []);

  return (
    <section className="overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_92%,transparent)] shadow-[var(--client-shadow)]">
      <div className="grid min-h-[92px] grid-cols-[72px,1fr] border-b border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)]">
        <div className="border-r border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)]" />
        <div className="flex min-w-0 items-center gap-3 px-4 py-3">
          <AvatarImage alt={technician.nickname ?? technician.name} className="h-14 w-14 rounded-[16px] object-cover" src={technician.avatar} />
          <div className="min-w-0">
            <strong className="block truncate text-lg font-black text-[color:var(--client-text)]">{technician.nickname ?? technician.name}</strong>
            <span className="mt-1 block truncate text-[12px] font-black text-[color:var(--client-muted)]">
              {ranges.length > 0 ? `${ranges.length} 段可预约` : "当前日期暂无可预约时段"}
            </span>
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: hourRowHeight * 24 }}>
        <div className="absolute inset-y-0 left-0 z-10 border-r border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)]" style={{ width: timeColumnWidth }}>
          {hours.map((hour) => (
            <div className="flex items-start justify-center border-t border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] pt-3" key={hour} style={{ height: hourRowHeight }}>
              <span className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-2 py-1 text-[11px] font-black text-[color:var(--client-muted)]">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>
        <div className="absolute inset-y-0 right-0" style={{ left: timeColumnWidth }}>
          {hours.map((hour) => (
            <div className="border-t border-[color:color-mix(in_srgb,var(--client-line)_48%,transparent)]" key={hour} style={{ height: hourRowHeight }} />
          ))}
          {ranges.map((range) => {
            const start = timeToMinutes(range.startTime);
            const end = range.endTime === "24:00" ? 24 * 60 : timeToMinutes(range.endTime);
            const top = (start / 60) * hourRowHeight;
            const height = Math.max(((end - start) / 60) * hourRowHeight - 8, 46);

            return (
              <div
                className="absolute left-3 right-3 overflow-hidden rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-primary)_52%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-elevated)_72%)] px-4 py-3 shadow-[0_18px_42px_color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
                key={`${range.date}-${range.startTime}-${range.endTime}`}
                style={{ top, height }}
              >
                <strong className="block text-[13px] font-black text-[color:var(--client-text)]">可预约</strong>
                <span className="mt-1 block text-[12px] font-black text-[color:var(--client-muted)]">
                  {formatTechnicianPublicAvailabilityRange(range)}
                </span>
              </div>
            );
          })}
          {ranges.length === 0 ? (
            <div className="absolute left-3 right-3 top-[34%] rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] px-4 py-5 text-center">
              <strong className="block text-sm font-black text-[color:var(--client-text)]">{formatLongDate(date)}</strong>
              <span className="mt-2 block text-[12px] font-black leading-5 text-[color:var(--client-muted)]">当前日期没有可预约的空档。</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function UserTechnicianScheduleDetailPage() {
  const navigate = useNavigate();
  const { technicianId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const initialDate = normalizeDateParam(searchParams.get("date"));
  const userPortalConfig = roleBasedTabConfig.user;
  const { session } = useAuth();
  const { customers, stores, technicians } = useEntityStore();
  const { config } = useHomeLayoutStore();
  const technicianSnapshot = useTechnicianScheduleStore();
  const planningSnapshot = useShiftPlanningStore();
  const [view, setView] = useState<AvailabilityView>("day");
  const [anchorDate, setAnchorDate] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const currentCustomer = customers.find((customer) => customer.id === session?.linkedCustomerId) ?? customers[0];
  const selectedLocation = config.locations.find((item) => item.id === config.selectedLocationId) ?? config.locations[0];
  const scheduleTechnicianId = resolveTechnicianScheduleRouteId(technicianId, technicians.map((item) => item.id));
  const technician = technicians.find((item) => item.id === scheduleTechnicianId) ?? null;
  const store = technician ? stores.find((item) => item.id === technician.storeId) ?? null : null;

  useEffect(() => {
    setAnchorDate(initialDate);
    setSelectedDate(initialDate);
  }, [initialDate]);

  const buffer = useMemo(
    () => (technician ? resolveBufferMinutes(technician, planningSnapshot) : { pre: 0, post: 0 }),
    [planningSnapshot, technician]
  );
  const selectedDateRanges = useMemo(
    () => technician
      ? buildTechnicianPublicAvailabilityRanges({
        date: selectedDate,
        preBufferMinutes: buffer.pre,
        postBufferMinutes: buffer.post,
        snapshot: technicianSnapshot,
        technicianId: technician.id
      })
      : [],
    [buffer.post, buffer.pre, selectedDate, technician, technicianSnapshot]
  );
  const threeDayDates = useMemo(() => Array.from({ length: 3 }, (_, index) => addDays(anchorDate, index)), [anchorDate]);
  const weekDates = useMemo(() => getWeekDates(anchorDate), [anchorDate]);
  const monthDates = useMemo(() => getMonthGridDates(anchorDate), [anchorDate]);
  const availabilityCountByDate = useMemo(() => {
    if (!technician) {
      return new Map<string, number>();
    }

    const dates = new Set([...threeDayDates, ...weekDates, ...monthDates, selectedDate]);
    return new Map(
      Array.from(dates).map((date) => [
        date,
        buildTechnicianPublicAvailabilityRanges({
          date,
          preBufferMinutes: buffer.pre,
          postBufferMinutes: buffer.post,
          snapshot: technicianSnapshot,
          technicianId: technician.id
        }).length
      ])
    );
  }, [buffer.post, buffer.pre, monthDates, selectedDate, technician, technicianSnapshot, threeDayDates, weekDates]);

  const changeView = (nextView: AvailabilityView) => {
    setView(nextView);
    if (nextView === "day" || nextView === "threeDay") {
      setAnchorDate(selectedDate);
    }
  };

  const shiftPeriod = (direction: -1 | 1) => {
    const next = shiftAnchor(view, anchorDate, direction);
    setAnchorDate(next);
    if (view === "day" || view === "threeDay" || view === "week") {
      setSelectedDate(next);
    }
  };

  const jumpToToday = () => {
    const today = getTodayDateKey();
    setAnchorDate(today);
    setSelectedDate(today);
  };
  const openDateInDayView = (date: string) => {
    setSelectedDate(date);
    setAnchorDate(date);
    setView("day");
  };
  const closeScheduleDetail = () => {
    if (canNavigateBack()) {
      navigate(-1);
      return;
    }

    navigate(userPortalConfig.secondary.to, { replace: true });
  };

  if (!currentCustomer || !selectedLocation) {
    return null;
  }

  if (!technician) {
    return (
      <MobileShell navItems={userNavItems}>
        <div className="px-4 py-10 text-center">
          <strong className="text-lg font-black text-[color:var(--client-text)]">未找到技师日程</strong>
          <button className={cn(floatingHeaderControlButtonClassName, "mx-auto mt-4")} onClick={() => navigate(-1)} type="button">
            返回
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell navItems={userNavItems}>
      <FloatingHomeHeader
        panelClassName={floatingHeaderGlassPanelClassName}
        stacked
      >
        <div className={floatingHeaderInnerClassName}>
          <SharedHomeHeader
            avatarAlt={currentCustomer.name}
            avatarLevelLabel={getCustomerLevelLabel(currentCustomer.activeScore)}
            avatarMembershipLevel={currentCustomer.memberLevel}
            avatarSrc={currentCustomer.avatar}
            avatarTo={userPortalConfig.myPath}
            locationLabel={selectedLocation.label}
            locationCaption="当前服务区域"
            locationTo="/me/settings/service-range"
            rightAction={
              <IconButton
                className="border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-[color:var(--client-primary)]"
                icon="close"
                label="关闭技师班表"
                onClick={closeScheduleDetail}
              />
            }
          />
        </div>
      </FloatingHomeHeader>

      <div className="space-y-3 px-4 pb-28 pt-2">
        <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] p-3 shadow-[var(--client-shadow)]">
          <div className="flex items-center justify-between gap-2">
            <button
              aria-label="返回动态"
              className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] text-lg font-black text-[color:var(--client-text)]"
              onClick={() => navigate(-1)}
              type="button"
            >
              ‹
            </button>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-lg font-black text-[color:var(--client-text)]">{formatPeriodLabel(view, anchorDate)}</strong>
              <span className="mt-0.5 block truncate text-[11px] font-black text-[color:var(--client-muted)]">
                {technician.nickname ?? technician.name} · {store?.name ?? "可预约日程"}
              </span>
            </div>
            <button
              className="focus-ring h-9 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-3 text-[12px] font-black text-[color:var(--client-text)]"
              onClick={jumpToToday}
              type="button"
            >
              今天
            </button>
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
                aria-label="切换技师可预约日程范围"
                className="h-9 w-full appearance-none rounded-full bg-transparent pl-12 pr-9 text-center text-[13px] font-black text-[color:var(--client-text)] outline-none"
                onChange={(event) => changeView(event.target.value as AvailabilityView)}
                value={view}
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

          {view === "threeDay" || view === "week" ? (
            <div className={cn("mt-3 grid gap-1", view === "threeDay" ? "grid-cols-3" : "grid-cols-7")}>
              {(view === "threeDay" ? threeDayDates : weekDates).map((date) => {
                const selected = date === selectedDate;
                const count = availabilityCountByDate.get(date) ?? 0;
                return (
                  <button
                    className={cn(
                      "focus-ring min-h-[64px] rounded-[16px] border px-1.5 py-2 text-center transition",
                      selected
                        ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)]"
                    )}
                    key={date}
                    onClick={() => openDateInDayView(date)}
                    type="button"
                  >
                    <span className="block text-[10px] font-black text-[color:var(--client-muted)]">{getWeekdayLabel(date).replace("周", "")}</span>
                    <strong className="mt-1 block text-[13px] font-black text-[color:var(--client-text)]">{Number(date.slice(-2))}</strong>
                    {count > 0 ? <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-[color:var(--client-primary)]" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {view === "month" ? (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-7 gap-1 px-1 text-center text-[10px] font-black text-[color:var(--client-muted)]">
                {getWeekdayHeaderLabel().map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDates.map((date) => {
                  const selected = date === selectedDate;
                  const inMonth = date.slice(0, 7) === anchorDate.slice(0, 7);
                  const count = availabilityCountByDate.get(date) ?? 0;
                  return (
                    <button
                      className={cn(
                        "focus-ring min-h-[54px] rounded-[13px] border px-1.5 py-1.5 text-left transition",
                        selected
                          ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)]"
                          : "border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)]",
                        !inMonth && "opacity-35"
                      )}
                      key={date}
                      onClick={() => openDateInDayView(date)}
                      type="button"
                    >
                      <strong className="block text-[12px] font-black text-[color:var(--client-text)]">{Number(date.slice(-2))}</strong>
                      {count > 0 ? <span className="mt-2 block h-1.5 rounded-full bg-[color:var(--client-primary)]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)] px-3 py-2 text-[11px] font-black leading-5 text-[color:var(--client-muted)]">
            <AppIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" name="clock" />
            已自动扣除已预约、休息、锁定以及前后缓冲时间。缓冲：前 {buffer.pre} 分 / 后 {buffer.post} 分。
          </div>
        </section>

        {view !== "month" ? <AvailabilityTimeline date={selectedDate} ranges={selectedDateRanges} technician={technician} /> : null}
      </div>
    </MobileShell>
  );
}
