import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  merchantEmployeeApi,
  type EmployeeScheduleEvent,
  type EmployeeScheduleProjection,
  type EmployeeScheduleView,
  type MerchantEmployee,
} from "../../features/merchant-admin/employeeApi";
import {
  addDays,
  formatShortDate,
  getMonthGridDates,
  getTodayDateKey,
  getWeekDates,
  getWeekdayLabel,
} from "../../features/technician-schedule/model";
import type {
  DispatchScheduleCell,
  DispatchScheduleCellStatus,
  DispatchScheduleGridData,
} from "../../features/dispatch-center/store";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import type {
  UnifiedCalendarEvent,
  UnifiedCalendarLane,
} from "../scheduling/UnifiedUserCalendar";
import {
  ScheduleCycleCalendarBoard,
  type ScheduleCycleCalendarBoardDataOverride,
  type ScheduleCycleCalendarBoardView,
} from "../scheduling/ScheduleCycleCalendarBoard";
import { Button } from "../ui/Button";

type EmployeeSchedulePanelProps = {
  employee: MerchantEmployee;
  readOnly?: boolean;
};

const statusPriority: Record<DispatchScheduleCellStatus, number> = {
  idle: 0,
  closed: 1,
  open: 2,
  confirmed: 3,
  pending: 4,
  other: 5,
  booked: 6,
  conflict: 7,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toTime(value: Date) {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function getViewDates(view: EmployeeScheduleView, dateKey: string) {
  if (view === "day") return [dateKey];
  if (view === "week") return getWeekDates(dateKey);
  return getMonthGridDates(dateKey);
}

function getViewQuery(view: EmployeeScheduleView, dateKey: string) {
  const dates = getViewDates(view, dateKey);
  const first = dates[0] ?? dateKey;
  const last = dates[dates.length - 1] ?? dateKey;
  return {
    dates,
    query: {
      from: new Date(`${first}T00:00:00`).toISOString(),
      to: new Date(`${addDays(last, 1)}T00:00:00`).toISOString(),
      view,
    },
  };
}

function toDispatchStatus(event: EmployeeScheduleEvent): DispatchScheduleCellStatus {
  if (event.kind === "busy_redacted") return "other";
  if (event.status === "available") return "open";
  if (event.status === "pending") return "pending";
  if (event.status === "confirmed" || event.status === "in_service" || event.status === "completed") {
    return "booked";
  }
  if (event.status === "blocked") return "other";
  return "confirmed";
}

function createCell(
  event: EmployeeScheduleEvent,
  employee: MerchantEmployee,
): DispatchScheduleCell {
  const startsAt = new Date(event.startsAt);
  const status = toDispatchStatus(event);
  const orderId = event.kind === "booking" && event.orderId
    ? String(event.orderId)
    : undefined;
  return {
    id: event.projectionId,
    date: toDateKey(startsAt),
    hour: startsAt.getHours(),
    technicianId: employee.needoId,
    technicianName: employee.displayName,
    status,
    title: event.title,
    detail: event.kind === "busy_redacted" ? "busy_redacted" : event.detail ?? event.title,
    orderId,
    eventType: orderId ? "booking" : undefined,
    isClickable: event.isClickable,
    detailTargetType: orderId ? "order_detail" : undefined,
    detailTargetId: orderId,
    privacyVisibility:
      event.visibility === "busy_redacted" ? "busy_redacted" : undefined,
    darkened: event.visibility === "busy_redacted",
    isCurrent: false,
  };
}

function eventOverlapsHour(event: EmployeeScheduleEvent, dateKey: string, hour: number) {
  const startsAt = new Date(event.startsAt).getTime();
  const endsAt = new Date(event.endsAt).getTime();
  const hourStart = new Date(`${dateKey}T00:00:00`);
  hourStart.setHours(hour, 0, 0, 0);
  const hourEnd = new Date(hourStart);
  hourEnd.setHours(hour + 1);
  return startsAt < hourEnd.getTime() && endsAt > hourStart.getTime();
}

function createDayGrid(
  dateKey: string,
  projection: EmployeeScheduleProjection,
  employee: MerchantEmployee,
): DispatchScheduleGridData {
  const cells = Array.from({ length: 24 }, (_, hour) => {
    const overlapping = projection.events
      .filter((event) => eventOverlapsHour(event, dateKey, hour))
      .sort(
        (left, right) =>
          statusPriority[toDispatchStatus(right)] - statusPriority[toDispatchStatus(left)],
      );
    const event = overlapping[0];
    if (!event) {
      return {
        id: `${employee.needoId}:${dateKey}:${hour}`,
        date: dateKey,
        hour,
        technicianId: employee.needoId,
        technicianName: employee.displayName,
        status: "idle" as const,
        title: "未排班",
        detail: "",
        darkened: false,
        isCurrent: false,
      };
    }
    return { ...createCell(event, employee), date: dateKey, hour };
  });
  return {
    cycle: null,
    dates: [dateKey],
    headers: [
      {
        key: dateKey,
        label: formatShortDate(dateKey),
        sublabel: getWeekdayLabel(dateKey),
      },
    ],
    nowHour: new Date().getHours(),
    rows: [
      {
        technicianId: employee.needoId,
        technicianName: employee.displayName,
        technicianSubtitle: "合作技师",
        technicianAvatar: employee.avatarUrl ?? "",
        scheduledHours: cells.filter((cell) => cell.status !== "idle").length,
        cells,
      },
    ],
  };
}

export function createEmployeeScheduleCalendarData(
  projection: EmployeeScheduleProjection,
  employee: MerchantEmployee,
  dates: string[],
  readOnly = false,
): ScheduleCycleCalendarBoardDataOverride {
  const cellByEventId = new Map<string, DispatchScheduleCell>();
  const events: UnifiedCalendarEvent[] = projection.events.map((event) => {
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    const cell = createCell(event, employee);
    cellByEventId.set(event.projectionId, cell);
    return {
      id: event.projectionId,
      sourceId:
        event.kind === "busy_redacted"
          ? "todo"
          : event.kind === "booking"
            ? "merchant"
            : "technician",
      calendarId: `employee:${employee.needoId}`,
      calendarLabel: employee.displayName,
      date: toDateKey(startsAt),
      endDate: toDateKey(endsAt),
      startTime: toTime(startsAt),
      endTime: toTime(endsAt),
      title: event.title,
      subtitle:
        event.kind === "busy_redacted"
          ? ""
          : event.detail ?? employee.displayName,
      badge:
        event.kind === "busy_redacted"
          ? "已锁定"
          : event.kind === "availability"
            ? "可排班"
            : event.kind === "booking"
              ? "本店预约"
              : "本店排班",
      readOnly: readOnly || !event.isEditable,
      orderId:
        event.kind === "booking" && event.orderId
          ? String(event.orderId)
          : undefined,
      detailTargetType:
        event.kind === "booking" && event.orderId ? "order_detail" : undefined,
      detailTargetId:
        event.kind === "booking" && event.orderId
          ? String(event.orderId)
          : undefined,
      visibility: event.visibility,
      participants:
        event.kind === "busy_redacted"
          ? []
          : [
              {
                id: employee.needoId,
                name: employee.displayName,
                avatar: employee.avatarUrl ?? undefined,
                role: "员工",
              },
            ],
    };
  });
  const lanes: UnifiedCalendarLane[] = [
    {
      id: `employee:${employee.needoId}`,
      label: employee.displayName,
      caption: "合作技师",
      accent: "var(--admin-accent, var(--client-primary))",
      avatar: employee.avatarUrl ?? undefined,
    },
  ];
  return {
    cellByEventId,
    dayGrids: dates.map((date) => createDayGrid(date, projection, employee)),
    events,
    lanes,
  };
}

export function EmployeeSchedulePanel({ employee, readOnly = false }: EmployeeSchedulePanelProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const [dateKey, setDateKey] = useState(getTodayDateKey());
  const [view, setView] = useState<EmployeeScheduleView>("week");
  const [projection, setProjection] = useState<EmployeeScheduleProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestIdRef = useRef(0);
  const { dates, query } = useMemo(
    () => getViewQuery(view, dateKey),
    [dateKey, view],
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    void merchantEmployeeApi
      .schedule(employee.needoId, query)
      .then((result) => {
        if (requestId === requestIdRef.current) setProjection(result);
      })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setProjection(null);
          setError(translateText("员工日程加载失败", language));
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [employee.needoId, language, query.from, query.to, query.view, reloadKey]);

  const dataOverride = useMemo(
    () =>
      projection
        ? createEmployeeScheduleCalendarData(projection, employee, dates, readOnly)
        : null,
    [dates, employee, projection, readOnly],
  );
  const changeView = useCallback((next: ScheduleCycleCalendarBoardView) => {
    if (next === "day" || next === "week" || next === "month") {
      setView(next);
    }
  }, []);

  return (
    <section
      className="rounded-[24px] border border-line bg-white p-5 shadow-sm sm:p-6"
      data-testid="employee-schedule-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky">
            03 · {t("日程")}
          </p>
          <h4 className="mt-1 text-xl font-black text-ink">{t("员工日程")}</h4>
          <p className="mt-1 text-sm font-bold leading-6 text-ink/55">
            {t("本店安排显示详情；其他从属店铺的已确认时段仅显示灰色锁定。")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-black">
          <span className="rounded-full border border-sky/25 bg-sky/10 px-2.5 py-1 text-sky">
            {t("本店安排")}
          </span>
          <span className="rounded-full border border-moss/25 bg-moss/10 px-2.5 py-1 text-moss">
            {t("合作技师可排班")}
          </span>
          <span
            className="rounded-full border border-ink/15 bg-ink/10 px-2.5 py-1 text-ink/60"
            data-employee-schedule-visibility="busy_redacted"
          >
            {t("其他店铺已有确认安排")}
          </span>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-coral/30 bg-coral/10 p-4" role="alert">
          <p className="text-sm font-black text-[#9b3f35]">{error}</p>
          <Button
            className="mt-3"
            onClick={() => setReloadKey((current) => current + 1)}
            size="sm"
            variant="secondary"
          >
            {t("重试")}
          </Button>
        </div>
      ) : null}

      {loading && !dataOverride ? (
        <div className="mt-5 rounded-2xl border border-line bg-paper/60 px-4 py-8 text-center text-sm font-black text-ink/55">
          {t("正在读取员工日程...")}
        </div>
      ) : null}

      {dataOverride ? (
        <div className={loading ? "mt-5 opacity-60" : "mt-5"}>
          <ScheduleCycleCalendarBoard
            availableViews={["day", "week", "month"]}
            dataOverride={dataOverride}
            dateKey={dateKey}
            onDateChange={setDateKey}
            onOpenCell={() => undefined}
            onViewChange={changeView}
            storeId={employee.affiliation.shop.publicId}
            subtitle={`${employee.displayName} · ${t("正式日程")}`}
            surface="desktop"
            view={view}
          />
        </div>
      ) : null}
    </section>
  );
}
