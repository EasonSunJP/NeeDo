import { useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { MobileFullscreenHeader } from "../mobile/MobileFullscreenHeader";
import { ScheduleViewSegmentedTabs } from "../client-ui/AppScaffold";
import { AutoDispatchModal } from "../scheduling/AutoDispatchModal";
import { AutoScheduleModal } from "../scheduling/AutoScheduleModal";
import { OneClickScheduleModal } from "../scheduling/OneClickScheduleModal";
import { AvatarImage } from "../ui/AvatarImage";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { formatFullDateLabel, getOneClickTargetDates, getWeekdayLabels, type OneClickScheduleConfig } from "../../lib/oneClickSchedule";
import { buildAutoDispatchDrafts, buildAutoScheduleDrafts } from "../../lib/scheduleAutomation";
import {
  addDays,
  dispatchCurrentHour,
  addMonths,
  dispatchFrozenColumnWidth,
  dispatchHours,
  dispatchTodayKey,
  formatDateKey,
  getCalendarTitle,
  getDispatchColumnWidth,
  getDisplayDates,
  parseDateKey,
  type DispatchCalendarView
} from "../../lib/dispatchCalendar";
import { useHorizontalDragScroll } from "../../lib/useHorizontalDragScroll";
import type { Order, Schedule, Technician } from "../../types/domain";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import {
  addSharedSchedules,
  removeSharedSchedule,
  replaceGeneratedSchedules,
  updateAutoDispatchSettings,
  updateAutoScheduleSettings,
  updateSharedAvailabilityWindow,
  updateSharedSchedule,
  updateSharedSchedulePlanTag,
  useScheduleStore,
  type AvailabilityWindow,
  type ScheduleEdit,
  type SchedulePlanTag
} from "../../state/scheduleStore";

type DayAssistantMode = "schedule" | "dispatch";
type BlockInteractionMode = "drag" | "resize-start" | "resize-end";
type CapacityBucket = {
  key: string;
  bookingCount: number;
  technicianCount: number;
  isFuture: boolean;
};
type DayHoverCell = {
  staffId: string;
  technicianName: string;
  dateKey: string;
  hour: number;
  x: number;
  y: number;
};
type GridHoverCell = {
  staffId: string;
  dateKey: string;
};
type DragScrollProps = ReturnType<typeof useHorizontalDragScroll>["dragScrollProps"];

type GoogleScheduleCalendarProps = {
  technicians: Technician[];
  initialDate?: string;
  onScheduleClick?: (schedule: Schedule) => void;
  onTechnicianClick?: (technician: Technician) => void;
  smartScheduleSignal?: number;
  view?: DispatchCalendarView;
  onViewChange?: (view: DispatchCalendarView) => void;
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  horizontalScrollLeft?: number;
  onHorizontalScroll?: (scrollLeft: number) => void;
  orders?: Order[];
  showIntegratedCapacityHeader?: boolean;
  detailPresentation?: "drawer" | "fullscreen";
  staffLabel?: "技师" | "员工";
};

type ScheduleBlock = {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: Schedule["status"];
  planTag: SchedulePlanTag;
  orderIds: string[];
  schedules: Schedule[];
};

const planTagCopy: Record<SchedulePlanTag, string> = {
  booked: "已定预约",
  expected: "可排班",
  locked: "锁定",
  leave: "请假",
  travel: "移动",
  break: "其他行程",
  expectedTravel: "预计移动",
  expectedBreak: "预计休息时间",
  overflow: "超出可排班时间"
};

const planTagCellClassName: Record<SchedulePlanTag, string> = {
  booked: "admin-schedule-cell admin-schedule-cell-booked",
  expected: "admin-schedule-cell admin-schedule-cell-free",
  locked: "admin-schedule-cell admin-schedule-cell-blocked",
  leave: "admin-schedule-cell admin-schedule-cell-blocked",
  travel: "admin-schedule-cell admin-schedule-cell-travel",
  break: "admin-schedule-cell admin-schedule-cell-other",
  expectedTravel: "admin-schedule-cell admin-schedule-cell-travel border-dashed",
  expectedBreak: "admin-schedule-cell admin-schedule-cell-other border-dashed",
  overflow: "admin-schedule-cell admin-schedule-cell-overflow"
};

const planTagBarClassName: Record<SchedulePlanTag, string> = {
  booked: "admin-schedule-bar-booked",
  expected: "admin-schedule-bar-free",
  locked: "admin-schedule-bar-blocked",
  leave: "admin-schedule-bar-blocked",
  travel: "admin-schedule-bar-travel",
  break: "admin-schedule-bar-other",
  expectedTravel: "admin-schedule-bar-travel border border-dashed",
  expectedBreak: "admin-schedule-bar-other border border-dashed",
  overflow: "admin-schedule-bar-overflow"
};

const planTagSoftClassName: Record<SchedulePlanTag, string> = {
  booked: "admin-schedule-soft admin-schedule-soft-booked",
  expected: "admin-schedule-soft admin-schedule-soft-free",
  locked: "admin-schedule-soft admin-schedule-soft-blocked",
  leave: "admin-schedule-soft admin-schedule-soft-blocked",
  travel: "admin-schedule-soft admin-schedule-soft-travel",
  break: "admin-schedule-soft admin-schedule-soft-other",
  expectedTravel: "admin-schedule-soft admin-schedule-soft-travel border border-dashed",
  expectedBreak: "admin-schedule-soft admin-schedule-soft-other border border-dashed",
  overflow: "admin-schedule-soft admin-schedule-soft-overflow"
};

function formatDateLabel(dateKey: string, language: Language) {
  const date = parseDateKey(dateKey);

  return formatFullDateLabel(date, language);
}

function timeToMinutes(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);

  return hour * 60 + minute;
}

function minutesToTime(minutes: number) {
  const safeMinutes = Math.max(0, Math.min(1440, minutes));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function minutesToHours(minutes: number) {
  return Math.max(0, Math.round((minutes / 60) * 10) / 10);
}

function scheduleDurationMinutes(schedule: Schedule | ScheduleBlock) {
  return Math.max(0, timeToMinutes(schedule.endTime) - timeToMinutes(schedule.startTime));
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatHourRange(hour: number) {
  return `${formatHour(hour)} - ${formatHour(hour + 1)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snapMinutes(minutes: number, step = 30) {
  return Math.round(minutes / step) * step;
}

function getAvailabilityKey(staffId: string, date: string) {
  return `${staffId}__${date}`;
}

function getDefaultPlanTag(schedule: Schedule): SchedulePlanTag {
  if (schedule.status === "booked") {
    return "booked";
  }

  return schedule.status === "blocked" ? "locked" : "expected";
}

function getPlanTag(schedule: Schedule, schedulePlanTags: Record<string, SchedulePlanTag>) {
  return schedule.status === "booked" ? "booked" : schedulePlanTags[schedule.id] ?? getDefaultPlanTag(schedule);
}

function isOutsideAvailabilityRange(
  staffId: string,
  date: string,
  startTime: string,
  endTime: string,
  availabilityMap: Record<string, AvailabilityWindow>
) {
  const availability = availabilityMap[getAvailabilityKey(staffId, date)];

  if (!availability) {
    return false;
  }

  return timeToMinutes(startTime) < timeToMinutes(availability.startTime) || timeToMinutes(endTime) > timeToMinutes(availability.endTime);
}

function getVisualPlanTag(
  schedule: Schedule,
  schedulePlanTags: Record<string, SchedulePlanTag>,
  availabilityMap: Record<string, AvailabilityWindow>
) {
  const basePlanTag = getPlanTag(schedule, schedulePlanTags);

  if ((basePlanTag === "booked" || basePlanTag === "expected") && isOutsideAvailabilityRange(schedule.staffId, schedule.date, schedule.startTime, schedule.endTime, availabilityMap)) {
    return "overflow";
  }

  return basePlanTag;
}

function isExpectedAdjustmentPlanTag(planTag: SchedulePlanTag) {
  return planTag === "expectedTravel" || planTag === "expectedBreak";
}

function getConfirmedAdjustmentPlanTag(planTag: SchedulePlanTag) {
  return planTag === "expectedTravel" ? "travel" : "break";
}

function createAvailabilityMap(
  schedules: Schedule[],
  overrides: Record<string, AvailabilityWindow>
) {
  const derived = schedules.reduce<Record<string, AvailabilityWindow>>((accumulator, schedule) => {
    if (schedule.status !== "free") {
      return accumulator;
    }

    const key = getAvailabilityKey(schedule.staffId, schedule.date);
    const current = accumulator[key];

    if (!current) {
      accumulator[key] = { startTime: schedule.startTime, endTime: schedule.endTime };
      return accumulator;
    }

    accumulator[key] = {
      startTime: timeToMinutes(schedule.startTime) < timeToMinutes(current.startTime) ? schedule.startTime : current.startTime,
      endTime: timeToMinutes(schedule.endTime) > timeToMinutes(current.endTime) ? schedule.endTime : current.endTime
    };

    return accumulator;
  }, {});

  return { ...derived, ...overrides };
}

function clampRangeToAvailability(
  staffId: string,
  date: string,
  startMinutes: number,
  endMinutes: number,
  availabilityMap: Record<string, AvailabilityWindow>
) {
  const availability = availabilityMap[getAvailabilityKey(staffId, date)];

  if (!availability) {
    return { startMinutes, endMinutes };
  }

  const minMinutes = timeToMinutes(availability.startTime);
  const maxMinutes = timeToMinutes(availability.endTime);
  const duration = Math.max(30, endMinutes - startMinutes);
  const clampedStart = clamp(startMinutes, minMinutes, Math.max(minMinutes, maxMinutes - duration));
  const clampedEnd = clamp(endMinutes, clampedStart + 30, maxMinutes);

  return {
    startMinutes: clampedStart,
    endMinutes: Math.max(clampedStart + 30, clampedEnd)
  };
}

function getScheduleBlocks(
  daySchedules: Schedule[],
  schedulePlanTags: Record<string, SchedulePlanTag>,
  availabilityMap: Record<string, AvailabilityWindow>
): ScheduleBlock[] {
  return [...daySchedules]
    .sort((a, b) => a.staffId.localeCompare(b.staffId) || a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .reduce<ScheduleBlock[]>((blocks, schedule) => {
      const last = blocks[blocks.length - 1];
      const planTag = getVisualPlanTag(schedule, schedulePlanTags, availabilityMap);
      const canMerge =
        last &&
        last.staffId === schedule.staffId &&
        last.date === schedule.date &&
        last.planTag === planTag &&
        last.endTime === schedule.startTime;

      if (canMerge) {
        last.endTime = schedule.endTime;
        last.schedules.push(schedule);

        if (schedule.orderId) {
          last.orderIds.push(schedule.orderId);
        }

        return blocks;
      }

      blocks.push({
        id: `block-${schedule.id}`,
        staffId: schedule.staffId,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        status: schedule.status,
        planTag,
        orderIds: schedule.orderId ? [schedule.orderId] : [],
        schedules: [schedule]
      });

      return blocks;
    }, []);
}

function getScheduleHours(schedules: Schedule[], status?: Schedule["status"]) {
  return minutesToHours(
    schedules
      .filter((schedule) => !status || schedule.status === status)
      .reduce((sum, schedule) => sum + scheduleDurationMinutes(schedule), 0)
  );
}

function getScheduleHoursByPlanTag(
  schedules: Schedule[],
  targetPlanTag: SchedulePlanTag,
  schedulePlanTags: Record<string, SchedulePlanTag>,
  availabilityMap: Record<string, AvailabilityWindow>
) {
  return minutesToHours(
    schedules
      .filter((schedule) => getVisualPlanTag(schedule, schedulePlanTags, availabilityMap) === targetPlanTag)
      .reduce((sum, schedule) => sum + scheduleDurationMinutes(schedule), 0)
  );
}

function overlapsHour(schedule: Schedule, hour: number) {
  const slotStart = hour * 60;
  const slotEnd = slotStart + 60;
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);

  return start < slotEnd && end > slotStart;
}

function buildCapacityBuckets(schedules: Schedule[], view: DispatchCalendarView, currentDate: Date) {
  const referenceDateKey = formatDateKey(currentDate);

  if (view === "day") {
    return dispatchHours.map((hour) => {
      const hourSchedules = schedules.filter((schedule) => schedule.date === referenceDateKey && overlapsHour(schedule, hour));

      return {
        key: `${referenceDateKey}-${hour}`,
        bookingCount: hourSchedules.filter((schedule) => schedule.status === "booked").length,
        technicianCount: new Set(hourSchedules.filter((schedule) => schedule.status !== "blocked").map((schedule) => schedule.staffId)).size,
        isFuture: referenceDateKey > dispatchTodayKey || (referenceDateKey === dispatchTodayKey && hour >= dispatchCurrentHour)
      };
    });
  }

  return getDisplayDates(currentDate, view).map((date) => {
    const dateKey = formatDateKey(date);
    const daySchedules = schedules.filter((schedule) => schedule.date === dateKey);

    return {
      key: dateKey,
      bookingCount: daySchedules.filter((schedule) => schedule.status === "booked").length,
      technicianCount: new Set(daySchedules.filter((schedule) => schedule.status !== "blocked").map((schedule) => schedule.staffId)).size,
      isFuture: dateKey > dispatchTodayKey
    };
  });
}

function getSeriesPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) {
    return "";
  }

  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function splitByFuture<T extends CapacityBucket & { x: number; y: number }>(rows: T[]) {
  const firstFutureIndex = rows.findIndex((row) => row.isFuture);

  if (firstFutureIndex <= 0) {
    return {
      past: rows,
      future: firstFutureIndex === -1 ? [] : rows
    };
  }

  return {
    past: rows.slice(0, firstFutureIndex + 1),
    future: rows.slice(firstFutureIndex)
  };
}

function groupSchedulesByStaffDate(schedules: Schedule[]) {
  return schedules.reduce<Record<string, Record<string, Schedule[]>>>((grouped, schedule) => {
    const staffGroup = grouped[schedule.staffId] ?? {};
    const dateSchedules = [...(staffGroup[schedule.date] ?? []), schedule].sort((a, b) => a.startTime.localeCompare(b.startTime));

    grouped[schedule.staffId] = { ...staffGroup, [schedule.date]: dateSchedules };

    return grouped;
  }, {});
}

function groupSchedulesByDate(schedules: Schedule[]) {
  return schedules.reduce<Record<string, Schedule[]>>((grouped, schedule) => {
    grouped[schedule.date] = [...(grouped[schedule.date] ?? []), schedule].sort(
      (a, b) => a.staffId.localeCompare(b.staffId) || a.startTime.localeCompare(b.startTime)
    );

    return grouped;
  }, {});
}

function getBlockGridPlacement(block: ScheduleBlock) {
  const startSlot = Math.max(0, Math.floor(timeToMinutes(block.startTime) / 60));
  const endSlot = Math.min(24, Math.max(startSlot + 1, Math.ceil(timeToMinutes(block.endTime) / 60)));

  return `${startSlot + 1} / ${endSlot + 1}`;
}

function getTimelineStyle(block: ScheduleBlock) {
  return getHorizontalRangeStyle(block.startTime, block.endTime);
}

function getHorizontalRangeStyle(startTime: string, endTime: string) {
  const start = Math.max(0, Math.min(1440, timeToMinutes(startTime)));
  const end = Math.max(start + 15, Math.min(1440, timeToMinutes(endTime)));

  return {
    left: `${(start / 1440) * 100}%`,
    width: `${((end - start) / 1440) * 100}%`
  };
}

function getVerticalTimelineStyle(block: ScheduleBlock) {
  return getVerticalRangeStyle(block.startTime, block.endTime);
}

function getVerticalRangeStyle(startTime: string, endTime: string) {
  const start = Math.max(0, Math.min(1440, timeToMinutes(startTime)));
  const end = Math.max(start + 15, Math.min(1440, timeToMinutes(endTime)));

  return {
    top: `${(start / 1440) * 100}%`,
    height: `${((end - start) / 1440) * 100}%`,
    minHeight: "34px"
  };
}

function hasScheduleConflict(schedules: Schedule[], staffId: string, date: string, startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  return schedules.some((schedule) => {
    if (schedule.staffId !== staffId || schedule.date !== date) {
      return false;
    }

    return start < timeToMinutes(schedule.endTime) && end > timeToMinutes(schedule.startTime);
  });
}

export function GoogleScheduleCalendar({
  technicians,
  initialDate = dispatchTodayKey,
  onScheduleClick,
  onTechnicianClick,
  smartScheduleSignal = 0,
  view: controlledView,
  onViewChange,
  currentDate: controlledCurrentDate,
  onCurrentDateChange,
  horizontalScrollLeft = 0,
  onHorizontalScroll,
  orders = [],
  showIntegratedCapacityHeader = false,
  detailPresentation = "drawer",
  staffLabel = "技师"
}: GoogleScheduleCalendarProps) {
  const { language } = useI18n();
  const weekdayLabels = getWeekdayLabels(language);
  const [localView, setLocalView] = useState<DispatchCalendarView>("week");
  const [localCurrentDate, setLocalCurrentDate] = useState(() => parseDateKey(initialDate));
  const [showTechnicianDetails, setShowTechnicianDetails] = useState(true);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [focusStaffId, setFocusStaffId] = useState<string | null>(null);
  const [dayAssistantMode, setDayAssistantMode] = useState<DayAssistantMode>("schedule");
  const [quickQuery, setQuickQuery] = useState("");
  const [smartScheduleOpen, setSmartScheduleOpen] = useState(false);
  const [autoScheduleOpen, setAutoScheduleOpen] = useState(false);
  const [autoDispatchOpen, setAutoDispatchOpen] = useState(false);
  const {
    schedules: workingSchedules,
    schedulePlanTags,
    availabilityOverrides,
    generatedScheduleSources,
    autoScheduleSettings,
    autoDispatchSettings
  } = useScheduleStore();
  const { scrollRef, dragScrollProps } = useHorizontalDragScroll({
    onScrollLeftChange: onHorizontalScroll,
    scrollLeft: horizontalScrollLeft
  });
  const view = controlledView ?? localView;
  const currentDate = controlledCurrentDate ?? localCurrentDate;

  const setView = (nextView: DispatchCalendarView) => {
    if (controlledView === undefined) {
      setLocalView(nextView);
    }

    onViewChange?.(nextView);
  };

  const setCurrentDate = (nextDate: Date | ((date: Date) => Date)) => {
    const resolvedDate = typeof nextDate === "function" ? nextDate(currentDate) : nextDate;

    if (controlledCurrentDate === undefined) {
      setLocalCurrentDate(resolvedDate);
    }

    onCurrentDateChange?.(resolvedDate);
  };

  const technicianMap = useMemo(() => new Map(technicians.map((technician) => [technician.id, technician])), [technicians]);
  const availabilityMap = useMemo(() => createAvailabilityMap(workingSchedules, availabilityOverrides), [availabilityOverrides, workingSchedules]);
  const filteredTechnicians = useMemo(() => {
    const query = quickQuery.trim().toLowerCase();

    return technicians
      .filter((technician) => {
        if (!query) {
          return true;
        }

        return [technician.name, technician.serviceAreas.join(" "), technician.skills.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [quickQuery, technicians]);

  const filteredStaffIds = useMemo(() => new Set(filteredTechnicians.map((technician) => technician.id)), [filteredTechnicians]);
  const filteredSchedules = useMemo(() => workingSchedules.filter((schedule) => filteredStaffIds.has(schedule.staffId)), [filteredStaffIds, workingSchedules]);
  const schedulesByStaffDate = useMemo(() => groupSchedulesByStaffDate(filteredSchedules), [filteredSchedules]);
  const schedulesByDate = useMemo(() => groupSchedulesByDate(filteredSchedules), [filteredSchedules]);
  const displayDates = useMemo(() => getDisplayDates(currentDate, view), [currentDate, view]);
  const selectedDaySchedules = selectedDayKey ? schedulesByDate[selectedDayKey] ?? [] : [];
  const selectedDayScopedSchedules = focusStaffId ? selectedDaySchedules.filter((schedule) => schedule.staffId === focusStaffId) : selectedDaySchedules;
  const selectedDayStats = {
    booked: getScheduleHoursByPlanTag(selectedDayScopedSchedules, "booked", schedulePlanTags, availabilityMap),
    free: getScheduleHoursByPlanTag(selectedDayScopedSchedules, "expected", schedulePlanTags, availabilityMap),
    blocked:
      getScheduleHoursByPlanTag(selectedDayScopedSchedules, "locked", schedulePlanTags, availabilityMap) +
      getScheduleHoursByPlanTag(selectedDayScopedSchedules, "leave", schedulePlanTags, availabilityMap) +
      getScheduleHoursByPlanTag(selectedDayScopedSchedules, "travel", schedulePlanTags, availabilityMap) +
      getScheduleHoursByPlanTag(selectedDayScopedSchedules, "break", schedulePlanTags, availabilityMap) +
      getScheduleHoursByPlanTag(selectedDayScopedSchedules, "expectedTravel", schedulePlanTags, availabilityMap) +
      getScheduleHoursByPlanTag(selectedDayScopedSchedules, "expectedBreak", schedulePlanTags, availabilityMap),
    overflow: getScheduleHoursByPlanTag(selectedDayScopedSchedules, "overflow", schedulePlanTags, availabilityMap)
  };
  const selectedCount = filteredTechnicians.length;
  const bookedHours = getScheduleHoursByPlanTag(filteredSchedules, "booked", schedulePlanTags, availabilityMap);
  const freeHours = getScheduleHoursByPlanTag(filteredSchedules, "expected", schedulePlanTags, availabilityMap);
  const blockedHours =
    getScheduleHoursByPlanTag(filteredSchedules, "locked", schedulePlanTags, availabilityMap) +
    getScheduleHoursByPlanTag(filteredSchedules, "leave", schedulePlanTags, availabilityMap) +
    getScheduleHoursByPlanTag(filteredSchedules, "travel", schedulePlanTags, availabilityMap) +
    getScheduleHoursByPlanTag(filteredSchedules, "break", schedulePlanTags, availabilityMap) +
    getScheduleHoursByPlanTag(filteredSchedules, "expectedTravel", schedulePlanTags, availabilityMap) +
    getScheduleHoursByPlanTag(filteredSchedules, "expectedBreak", schedulePlanTags, availabilityMap);
  const overflowHours = getScheduleHoursByPlanTag(filteredSchedules, "overflow", schedulePlanTags, availabilityMap);
  const capacityBuckets = useMemo(() => buildCapacityBuckets(filteredSchedules, view, currentDate), [filteredSchedules, view, currentDate]);
  const capacityMaxValue = useMemo(
    () => Math.max(1, ...capacityBuckets.flatMap((bucket) => [bucket.bookingCount, bucket.technicianCount])),
    [capacityBuckets]
  );
  const firstFreeSchedule = selectedDayScopedSchedules.find((schedule) => schedule.status === "free");
  const firstBookedSchedule = selectedDayScopedSchedules.find((schedule) => schedule.status === "booked");
  const firstFreeTechnician = firstFreeSchedule ? technicianMap.get(firstFreeSchedule.staffId) : undefined;
  const firstBookedTechnician = firstBookedSchedule ? technicianMap.get(firstBookedSchedule.staffId) : undefined;
  const focusTechnician = focusStaffId ? technicianMap.get(focusStaffId) : undefined;
  const detailTitle = selectedDayKey ? `${formatDateLabel(selectedDayKey, language)}${focusTechnician ? ` · ${focusTechnician.name}` : ""} 排班详细` : "排班详细";

  useEffect(() => {
    if (smartScheduleSignal > 0) {
      setSmartScheduleOpen(true);
    }
  }, [smartScheduleSignal]);

  useEffect(() => {
    const schedulesWithoutAutoSchedule = workingSchedules.filter((schedule) => generatedScheduleSources[schedule.id] !== "autoSchedule");
    const nextAutoSchedules = autoScheduleSettings.enabled
      ? buildAutoScheduleDrafts({
          technicians,
          schedules: schedulesWithoutAutoSchedule,
          availabilityOverrides,
          settings: autoScheduleSettings
        })
      : [];

    replaceGeneratedSchedules("autoSchedule", nextAutoSchedules);
  }, [autoScheduleSettings, availabilityOverrides, generatedScheduleSources, technicians, workingSchedules]);

  useEffect(() => {
    const schedulesWithoutAutoDispatch = workingSchedules.filter((schedule) => generatedScheduleSources[schedule.id] !== "autoDispatch");
    const nextAutoDispatchSchedules = autoDispatchSettings.enabled
      ? buildAutoDispatchDrafts({
          orders,
          technicians,
          schedules: schedulesWithoutAutoDispatch,
          availabilityOverrides,
          settings: autoDispatchSettings
        })
      : [];

    replaceGeneratedSchedules("autoDispatch", nextAutoDispatchSchedules);
  }, [autoDispatchSettings, availabilityOverrides, generatedScheduleSources, orders, technicians, workingSchedules]);

  const jumpDate = (direction: -1 | 1) => {
    if (view === "day") {
      setCurrentDate((date) => addDays(date, direction));
      return;
    }

    if (view === "week") {
      setCurrentDate((date) => addDays(date, direction * 7));
      return;
    }

    setCurrentDate((date) => addMonths(date, direction));
  };

  const updateSchedule = (scheduleId: string, changes: ScheduleEdit) => {
    updateSharedSchedule(scheduleId, changes);
  };

  const updateScheduleTime = (scheduleId: string, startMinutes: number, endMinutes: number) => {
    const schedule = workingSchedules.find((item) => item.id === scheduleId);

    if (!schedule) {
      return;
    }

    const nextRange = clampRangeToAvailability(schedule.staffId, schedule.date, startMinutes, endMinutes, availabilityMap);

    updateSchedule(scheduleId, {
      startTime: minutesToTime(nextRange.startMinutes),
      endTime: minutesToTime(nextRange.endMinutes)
    });
  };

  const updateSchedulePlanTag = (scheduleId: string, planTag: SchedulePlanTag) => {
    const schedule = workingSchedules.find((item) => item.id === scheduleId);

    if (!schedule || schedule.status === "booked") {
      return;
    }

    updateSharedSchedulePlanTag(scheduleId, planTag);
  };

  const confirmEstimatedAdjustment = (scheduleId: string) => {
    const planTag = schedulePlanTags[scheduleId];

    if (!planTag || !isExpectedAdjustmentPlanTag(planTag)) {
      return;
    }

    updateSharedSchedulePlanTag(scheduleId, getConfirmedAdjustmentPlanTag(planTag));
  };

  const cancelEstimatedAdjustment = (scheduleId: string) => {
    removeSharedSchedule(scheduleId);
  };

  const updateAvailabilityWindow = (staffId: string, date: string, startTime: string, endTime: string) => {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = Math.max(startMinutes + 30, timeToMinutes(endTime));
    const normalizedWindow = {
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes)
    };

    updateSharedAvailabilityWindow(staffId, date, normalizedWindow);

    (schedulesByStaffDate[staffId]?.[date] ?? []).forEach((schedule) => {
      if (schedule.status === "booked") {
        return;
      }

      const nextRange = clampRangeToAvailability(
        staffId,
        date,
        timeToMinutes(schedule.startTime),
        timeToMinutes(schedule.endTime),
        { ...availabilityMap, [getAvailabilityKey(staffId, date)]: normalizedWindow }
      );

      updateSharedSchedule(schedule.id, {
        startTime: minutesToTime(nextRange.startMinutes),
        endTime: minutesToTime(nextRange.endMinutes)
      });
    });
  };

  const updateBlockTime = (block: ScheduleBlock, mode: BlockInteractionMode, nextStartMinutes: number, nextEndMinutes: number) => {
    const blockSchedules = block.schedules;

    if (blockSchedules.length === 1) {
      updateScheduleTime(blockSchedules[0].id, nextStartMinutes, nextEndMinutes);
      return;
    }

    if (mode === "drag") {
      const originalStart = timeToMinutes(block.startTime);
      const delta = nextStartMinutes - originalStart;
      const firstStart = Math.min(...blockSchedules.map((schedule) => timeToMinutes(schedule.startTime)));
      const lastEnd = Math.max(...blockSchedules.map((schedule) => timeToMinutes(schedule.endTime)));
      const safeDelta = clamp(delta, -firstStart, 1440 - lastEnd);

      blockSchedules.forEach((schedule) => {
        updateScheduleTime(schedule.id, timeToMinutes(schedule.startTime) + safeDelta, timeToMinutes(schedule.endTime) + safeDelta);
      });
      return;
    }

    if (mode === "resize-start") {
      const firstSchedule = blockSchedules[0];
      updateScheduleTime(firstSchedule.id, clamp(nextStartMinutes, 0, timeToMinutes(firstSchedule.endTime) - 30), timeToMinutes(firstSchedule.endTime));
      return;
    }

    const lastSchedule = blockSchedules[blockSchedules.length - 1];
    updateScheduleTime(lastSchedule.id, timeToMinutes(lastSchedule.startTime), clamp(nextEndMinutes, timeToMinutes(lastSchedule.startTime) + 30, 1440));
  };

  const addSchedule = (staffId: string, date: string) => {
    const availability = availabilityMap[getAvailabilityKey(staffId, date)];

    if (!availability) {
      return;
    }

    const availabilityStart = timeToMinutes(availability.startTime);
    const availabilityEnd = timeToMinutes(availability.endTime);
    const existingSchedules = schedulesByStaffDate[staffId]?.[date] ?? [];
    const occupiedUntil = existingSchedules.reduce((latest, schedule) => Math.max(latest, timeToMinutes(schedule.endTime)), availabilityStart);
    const startMinutes = clamp(occupiedUntil, availabilityStart, Math.max(availabilityStart, availabilityEnd - 60));
    const endMinutes = clamp(startMinutes + 120, startMinutes + 30, availabilityEnd);
    const draftId = `sch-draft-${staffId}-${date}-${Date.now()}`;
    addSharedSchedules([
      {
        id: draftId,
        staffId,
        date,
        startTime: minutesToTime(startMinutes),
        endTime: minutesToTime(endMinutes),
        status: "free"
      }
    ]);
    updateSharedSchedulePlanTag(draftId, "expected");
  };

  const openDayDetail = (dateKey: string, staffId?: string) => {
    setSelectedDayKey(dateKey);
    setFocusStaffId(staffId ?? null);
    setCurrentDate(parseDateKey(dateKey));
    setDayAssistantMode("schedule");
  };

  const handleScheduleClick = (schedule: Schedule) => {
    openDayDetail(schedule.date, schedule.staffId);
    onScheduleClick?.(schedule);
  };

  const applySmartSchedule = (config: OneClickScheduleConfig) => {
    const baseDate = selectedDayKey ? parseDateKey(selectedDayKey) : currentDate;
    const targetDates = getOneClickTargetDates(baseDate, config);
    const knownSchedules = [...workingSchedules];
    const plannedSchedules: Schedule[] = [];
    const staffPool = filteredTechnicians;
    const maxDailyMinutes = config.maxWorkHoursPerDay === "ignore" ? Number.POSITIVE_INFINITY : config.maxWorkHoursPerDay * 60;

    targetDates.forEach((dateKey, dateIndex) => {
      config.slots.forEach((slot, slotIndex) => {
        const safeMax = Math.max(slot.minStaff, slot.maxStaff);
        const targetCount = Math.min(safeMax, staffPool.length);
        const slotMinutes = Math.max(30, timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime));
        const rotationOffset = (dateIndex + slotIndex) % Math.max(staffPool.length, 1);
        const rotatedStaff = [...staffPool.slice(rotationOffset), ...staffPool.slice(0, rotationOffset)];
        const availableCandidates = rotatedStaff.filter((technician) => {
          const sameDaySchedules = [...knownSchedules, ...plannedSchedules].filter((schedule) => schedule.staffId === technician.id && schedule.date === dateKey);
          const dayMinutes = sameDaySchedules.reduce((sum, schedule) => sum + scheduleDurationMinutes(schedule), 0);

          if (sameDaySchedules.length >= 4 || dayMinutes + slotMinutes > maxDailyMinutes) {
            return false;
          }

          return !hasScheduleConflict([...knownSchedules, ...plannedSchedules], technician.id, dateKey, slot.startTime, slot.endTime);
        });
        const withinWindowCandidates = availableCandidates.filter((technician) => !isOutsideAvailabilityRange(technician.id, dateKey, slot.startTime, slot.endTime, availabilityMap));
        const outsideWindowCandidates = availableCandidates.filter((technician) => isOutsideAvailabilityRange(technician.id, dateKey, slot.startTime, slot.endTime, availabilityMap));
        const selectedStaff = [...withinWindowCandidates, ...outsideWindowCandidates].slice(0, targetCount);

        selectedStaff.forEach((technician, staffIndex) => {
          plannedSchedules.push({
            id: `sch-smart-${dateKey}-${slot.id}-${technician.id}-${dateIndex}-${slotIndex}-${staffIndex}`,
            staffId: technician.id,
            date: dateKey,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: "free"
          });
        });
      });
    });

    addSharedSchedules(plannedSchedules.map((schedule) => ({ ...schedule, id: `${schedule.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })));
    setCurrentDate(baseDate);
    setView(config.cycle === "single" ? "day" : "week");
    setSmartScheduleOpen(false);
  };

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
        <header className="border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLike onClick={() => setCurrentDate(parseDateKey(dispatchTodayKey))}>今天</ButtonLike>
              <ButtonIcon label="上一段" onClick={() => jumpDate(-1)}>‹</ButtonIcon>
              <ButtonIcon label="下一段" onClick={() => jumpDate(1)}>›</ButtonIcon>
              <h2 className="min-w-[180px] text-xl font-black">{getCalendarTitle(currentDate, view, language)}</h2>
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <label className="relative min-w-[240px] max-w-sm flex-1 lg:flex-none">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35">⌕</span>
                <input
                  className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm font-bold outline-none focus:border-moss"
                  onChange={(event) => setQuickQuery(event.target.value)}
                  placeholder={`搜索${staffLabel} / 区域 / 技能`}
                  value={quickQuery}
                />
              </label>
              {[
                ["已定预约", `${bookedHours}h`, planTagSoftClassName.booked],
                ["可排班", `${freeHours}h`, planTagSoftClassName.expected],
                ["锁定 / 请假", `${blockedHours}h`, planTagSoftClassName.locked],
                ["超窗排班", `${overflowHours}h`, planTagSoftClassName.overflow]
              ].map(([label, value, className]) => (
                <span className={`rounded-full px-3 py-2 text-xs font-black ${className}`} key={label}>
                  {label} {value}
                </span>
              ))}
              <ScheduleViewSegmentedTabs onChange={setView} value={view} />
              <ButtonLike onClick={() => setAutoScheduleOpen(true)}>
                {`自动排班 ${autoScheduleSettings.enabled ? "ON" : "OFF"}`}
              </ButtonLike>
              <ButtonLike onClick={() => setAutoDispatchOpen(true)}>
                {`自动派单 ${autoDispatchSettings.enabled ? "ON" : "OFF"}`}
              </ButtonLike>
              <ButtonLike onClick={() => setSmartScheduleOpen(true)}>一键排班</ButtonLike>
            </div>
          </div>
          <p className="mt-2 text-xs font-bold text-ink/45">当前显示 {selectedCount} 名{staffLabel}。容量趋势、日期 / 时间表头和下方排班表已经合并到同一条时间轴里；横向拖动时会整体同步，折叠{staffLabel}昵称栏后也不会打乱对应关系。</p>
        </header>

        <main className="min-w-0">
          {view === "day" ? (
            <DayStaffHourGrid
              availabilityMap={availabilityMap}
              capacityBuckets={capacityBuckets}
              capacityMaxValue={capacityMaxValue}
              currentDate={currentDate}
              dragScrollProps={dragScrollProps}
              onBlockTimeChange={updateBlockTime}
              onDayClick={openDayDetail}
              onScheduleClick={handleScheduleClick}
              onTechnicianClick={onTechnicianClick}
              onToggleTechnicianDetails={() => setShowTechnicianDetails((current) => !current)}
              schedulePlanTags={schedulePlanTags}
              schedulesByStaffDate={schedulesByStaffDate}
              showIntegratedCapacityHeader={showIntegratedCapacityHeader}
              showTechnicianDetails={showTechnicianDetails}
              scrollRef={scrollRef}
              technicians={filteredTechnicians}
            />
          ) : (
            <StaffDateGrid
              availabilityMap={availabilityMap}
              capacityBuckets={capacityBuckets}
              capacityMaxValue={capacityMaxValue}
              dates={displayDates}
              dragScrollProps={dragScrollProps}
              onDayClick={openDayDetail}
              onTechnicianClick={onTechnicianClick}
              onToggleTechnicianDetails={() => setShowTechnicianDetails((current) => !current)}
              schedulePlanTags={schedulePlanTags}
              schedulesByStaffDate={schedulesByStaffDate}
              showIntegratedCapacityHeader={showIntegratedCapacityHeader}
              showTechnicianDetails={showTechnicianDetails}
              scrollRef={scrollRef}
              technicians={filteredTechnicians}
              view={view}
            />
          )}
        </main>
      </section>

      {detailPresentation === "fullscreen" ? (
        selectedDayKey ? (
          <div className="fixed inset-0 z-[90] flex flex-col bg-white text-ink">
            <MobileFullscreenHeader
              info={focusTechnician ? undefined : "支持直接编辑当天排班、自动排班和自动派单规则"}
              onClose={() => setSelectedDayKey(null)}
              subtitle={focusTechnician ? `当前${staffLabel}：${focusTechnician.name}` : undefined}
              title={detailTitle}
            />
            <div className="min-h-0 flex-1 overflow-y-auto bg-paper/65 px-4 py-4">
              <ScheduleDayDetailContent
                autoDispatchSettings={autoDispatchSettings}
                autoScheduleSettings={autoScheduleSettings}
                availabilityMap={availabilityMap}
                dayAssistantMode={dayAssistantMode}
                filteredTechnicians={filteredTechnicians}
                firstBookedTechnician={firstBookedTechnician}
                firstFreeTechnician={firstFreeTechnician}
                focusStaffId={focusStaffId}
                onAddSchedule={addSchedule}
                onAssistantModeChange={setDayAssistantMode}
                onAutoDispatchOpen={() => setAutoDispatchOpen(true)}
                onAutoScheduleOpen={() => setAutoScheduleOpen(true)}
                onCancelExpectedAdjustment={cancelEstimatedAdjustment}
                onConfirmExpectedAdjustment={confirmEstimatedAdjustment}
                onScheduleClick={handleScheduleClick}
                onSchedulePlanChange={updateSchedulePlanTag}
                onScheduleTimeChange={updateScheduleTime}
                onSmartScheduleOpen={() => setSmartScheduleOpen(true)}
                onTechnicianClick={onTechnicianClick}
                onAvailabilityChange={updateAvailabilityWindow}
                schedulePlanTags={schedulePlanTags}
                schedulesByStaffDate={schedulesByStaffDate}
                selectedDayKey={selectedDayKey}
                selectedDayScopedSchedules={selectedDayScopedSchedules}
                selectedDayStats={selectedDayStats}
              />
            </div>
          </div>
        ) : null
      ) : (
        <Drawer
          open={Boolean(selectedDayKey)}
          title={detailTitle}
          onClose={() => setSelectedDayKey(null)}
        >
          {selectedDayKey ? (
            <ScheduleDayDetailContent
              autoDispatchSettings={autoDispatchSettings}
              autoScheduleSettings={autoScheduleSettings}
              availabilityMap={availabilityMap}
              dayAssistantMode={dayAssistantMode}
              filteredTechnicians={filteredTechnicians}
              firstBookedTechnician={firstBookedTechnician}
              firstFreeTechnician={firstFreeTechnician}
              focusStaffId={focusStaffId}
              onAddSchedule={addSchedule}
              onAssistantModeChange={setDayAssistantMode}
              onAutoDispatchOpen={() => setAutoDispatchOpen(true)}
              onAutoScheduleOpen={() => setAutoScheduleOpen(true)}
              onCancelExpectedAdjustment={cancelEstimatedAdjustment}
              onConfirmExpectedAdjustment={confirmEstimatedAdjustment}
              onScheduleClick={handleScheduleClick}
              onSchedulePlanChange={updateSchedulePlanTag}
              onScheduleTimeChange={updateScheduleTime}
              onSmartScheduleOpen={() => setSmartScheduleOpen(true)}
              onTechnicianClick={onTechnicianClick}
              onAvailabilityChange={updateAvailabilityWindow}
              schedulePlanTags={schedulePlanTags}
              schedulesByStaffDate={schedulesByStaffDate}
              selectedDayKey={selectedDayKey}
              selectedDayScopedSchedules={selectedDayScopedSchedules}
              selectedDayStats={selectedDayStats}
            />
          ) : null}
        </Drawer>
      )}
      <OneClickScheduleModal
        baseDate={selectedDayKey ? parseDateKey(selectedDayKey) : currentDate}
        onApply={applySmartSchedule}
        onClose={() => setSmartScheduleOpen(false)}
        open={smartScheduleOpen}
        technicianCount={filteredTechnicians.length}
      />
      <AutoScheduleModal
        onClose={() => setAutoScheduleOpen(false)}
        onSave={(settings) => {
          updateAutoScheduleSettings(settings);
          setAutoScheduleOpen(false);
        }}
        open={autoScheduleOpen}
        settings={autoScheduleSettings}
        technicianCount={technicians.length}
      />
      <AutoDispatchModal
        onClose={() => setAutoDispatchOpen(false)}
        onSave={(settings) => {
          updateAutoDispatchSettings(settings);
          setAutoDispatchOpen(false);
        }}
        open={autoDispatchOpen}
        settings={autoDispatchSettings}
        staffLabel={staffLabel}
        technicians={technicians}
      />
    </>
  );
}

function TechnicianLabelToggleButton({
  expanded,
  onClick
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={expanded ? "隐藏技师昵称栏" : "显示技师昵称栏"}
      className="focus-ring ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-paper text-lg font-black text-ink/65 transition hover:border-moss hover:text-moss"
      onClick={onClick}
      type="button"
    >
      {expanded ? "−" : "+"}
    </button>
  );
}

function StaffDateGrid({
  availabilityMap,
  capacityBuckets,
  capacityMaxValue,
  dates,
  technicians,
  schedulesByStaffDate,
  schedulePlanTags,
  view,
  onDayClick,
  onTechnicianClick,
  onToggleTechnicianDetails,
  showIntegratedCapacityHeader,
  showTechnicianDetails,
  scrollRef,
  dragScrollProps
}: {
  availabilityMap: Record<string, AvailabilityWindow>;
  capacityBuckets: CapacityBucket[];
  capacityMaxValue: number;
  dates: Date[];
  technicians: Technician[];
  schedulesByStaffDate: Record<string, Record<string, Schedule[]>>;
  schedulePlanTags: Record<string, SchedulePlanTag>;
  view: "week" | "month";
  onDayClick: (dateKey: string, staffId?: string) => void;
  onTechnicianClick?: (technician: Technician) => void;
  onToggleTechnicianDetails: () => void;
  showIntegratedCapacityHeader: boolean;
  showTechnicianDetails: boolean;
  scrollRef: ReturnType<typeof useHorizontalDragScroll>["scrollRef"];
  dragScrollProps: DragScrollProps;
}) {
  const { language } = useI18n();
  const weekdayLabels = getWeekdayLabels(language);
  const [hoveredCell, setHoveredCell] = useState<GridHoverCell | null>(null);
  const dateColumnWidth = getDispatchColumnWidth(view);
  const frozenColumnWidth = showTechnicianDetails ? dispatchFrozenColumnWidth : 92;

  return (
    <div
      className="relative max-h-[72vh] overflow-auto cursor-grab active:cursor-grabbing"
      ref={scrollRef}
      style={{ touchAction: "pan-y" }}
      {...dragScrollProps}
    >
      <div className="grid min-w-max" onPointerLeave={() => setHoveredCell(null)} style={{ gridTemplateColumns: `${frozenColumnWidth}px repeat(${dates.length}, ${dateColumnWidth}px)` }}>
        {showIntegratedCapacityHeader ? (
          <IntegratedCapacityHeader
            buckets={capacityBuckets}
            columnWidth={dateColumnWidth}
            frozenColumnWidth={frozenColumnWidth}
            maxValue={capacityMaxValue}
            title="排班容量趋势"
          />
        ) : null}
        <div
          className={`sticky left-0 top-0 z-50 flex items-center gap-2 overflow-visible border-b border-r border-line bg-paper px-4 py-3 text-xs font-black text-ink/45 ${
            hoveredCell ? "admin-schedule-highlight-row" : ""
          }`}
        >
          <span className="truncate">技师 / 日期</span>
          <TechnicianLabelToggleButton expanded={showTechnicianDetails} onClick={onToggleTechnicianDetails} />
        </div>
        {dates.map((date) => {
          const dateKey = formatDateKey(date);
          const activeTechnicianCount = technicians.filter((technician) => (schedulesByStaffDate[technician.id]?.[dateKey] ?? []).length > 0).length;

          return (
            <button
              className={`focus-ring sticky top-0 z-40 border-b border-r border-line bg-paper px-3 py-3 text-center transition hover:bg-white ${
                dateKey === dispatchTodayKey ? "text-moss" : "text-ink/65"
              } ${hoveredCell?.dateKey === dateKey ? "admin-schedule-highlight-column" : ""}`}
              key={dateKey}
              onClick={() => onDayClick(dateKey)}
              onPointerEnter={() => setHoveredCell({ dateKey, staffId: "" })}
              type="button"
            >
              <span className="block text-xs font-black">{weekdayLabels[date.getDay()]}</span>
              <span className="mt-1 block text-lg font-black">{date.getDate()}</span>
              {activeTechnicianCount > 0 ? <span className="mt-1 block text-[10px] font-black text-ink/40">{activeTechnicianCount}人</span> : null}
            </button>
          );
        })}

        {technicians.map((technician) => (
        <StaffDateRow
            availabilityMap={availabilityMap}
            dates={dates}
            key={technician.id}
            hoveredCell={hoveredCell}
            onDayClick={onDayClick}
            onHoverCell={setHoveredCell}
            onTechnicianClick={onTechnicianClick}
            showTechnicianDetails={showTechnicianDetails}
            frozenColumnWidth={frozenColumnWidth}
            schedulePlanTags={schedulePlanTags}
            schedulesByStaffDate={schedulesByStaffDate}
            technician={technician}
            view={view}
          />
        ))}
      </div>
    </div>
  );
}

function StaffDateRow({
  availabilityMap,
  technician,
  dates,
  schedulesByStaffDate,
  schedulePlanTags,
  onDayClick,
  onTechnicianClick,
  showTechnicianDetails,
  frozenColumnWidth,
  hoveredCell,
  onHoverCell,
  view
}: {
  availabilityMap: Record<string, AvailabilityWindow>;
  technician: Technician;
  dates: Date[];
  schedulesByStaffDate: Record<string, Record<string, Schedule[]>>;
  schedulePlanTags: Record<string, SchedulePlanTag>;
  onDayClick: (dateKey: string, staffId?: string) => void;
  onTechnicianClick?: (technician: Technician) => void;
  showTechnicianDetails: boolean;
  frozenColumnWidth: number;
  hoveredCell: GridHoverCell | null;
  onHoverCell: (cell: GridHoverCell | null) => void;
  view: "week" | "month";
}) {
  return (
    <>
      <div
        className={`sticky left-0 z-10 flex min-h-[74px] items-center gap-3 border-b border-r border-line bg-white px-4 py-3 ${
          hoveredCell?.staffId === technician.id ? "admin-schedule-highlight-row" : ""
        }`}
        style={{ width: frozenColumnWidth }}
      >
        <button
          className="focus-ring shrink-0"
          onClick={() => onTechnicianClick?.(technician)}
          type="button"
        >
          <AvatarImage alt={technician.name} className="h-10 w-10" src={technician.avatar} />
        </button>
        {showTechnicianDetails ? (
          <span className="min-w-0">
            <button className="focus-ring block truncate text-left text-sm font-black text-moss hover:underline" onClick={() => onTechnicianClick?.(technician)} type="button">
              {technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}
            </button>
            <span className="block truncate text-xs text-ink/45">{technician.skills.slice(0, 2).join("、")}</span>
          </span>
        ) : null}
      </div>
      {dates.map((date) => {
        const dateKey = formatDateKey(date);
        const daySchedules = schedulesByStaffDate[technician.id]?.[dateKey] ?? [];
        const blocks = getScheduleBlocks(daySchedules, schedulePlanTags, availabilityMap);
        const totalHours = getScheduleHours(daySchedules);
        const bookedHours = getScheduleHoursByPlanTag(daySchedules, "booked", schedulePlanTags, availabilityMap);
        const freeHours = getScheduleHoursByPlanTag(daySchedules, "expected", schedulePlanTags, availabilityMap);
        const overflowHours = getScheduleHoursByPlanTag(daySchedules, "overflow", schedulePlanTags, availabilityMap);
        const availability = availabilityMap[getAvailabilityKey(technician.id, dateKey)];
        const availableHours = availability ? minutesToHours(timeToMinutes(availability.endTime) - timeToMinutes(availability.startTime)) : 0;

        return (
          <button
            className={`focus-ring min-h-[74px] border-b border-r border-line bg-white p-2 text-left transition hover:bg-paper/65 ${
              hoveredCell?.staffId === technician.id || hoveredCell?.dateKey === dateKey ? "admin-schedule-highlight-axis" : ""
            } ${hoveredCell?.staffId === technician.id && hoveredCell?.dateKey === dateKey ? "admin-schedule-highlight-cross" : ""}`}
            key={`${technician.id}-${dateKey}`}
            onClick={() => onDayClick(dateKey, technician.id)}
            onPointerEnter={() => onHoverCell({ dateKey, staffId: technician.id })}
            type="button"
          >
            {daySchedules.length > 0 || availability ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-ink">{daySchedules.length > 0 ? `${totalHours}h` : `${availableHours}h`}</strong>
                  <span className="text-[11px] font-black text-ink/45">{daySchedules.length > 0 ? `${daySchedules.length}段` : "仅可排班窗口"}</span>
                </div>
                <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-paper">
                  {availability ? (
                    <span
                      className="absolute top-0 h-full rounded-full bg-[rgba(120,208,146,0.38)]"
                      style={getHorizontalRangeStyle(availability.startTime, availability.endTime)}
                        title={`可排班 ${availability.startTime}-${availability.endTime}`}
                    />
                  ) : null}
                  {blocks.map((block) => (
                    <span
                      className={`absolute top-0 h-full rounded-full ${planTagBarClassName[block.planTag]}`}
                      key={block.id}
                      style={getTimelineStyle(block)}
                      title={`${planTagCopy[block.planTag]} ${block.startTime}-${block.endTime}`}
                    />
                  ))}
                </div>
                {view === "week" ? <span className="mt-2 block text-[10px] font-black text-ink/35">{date.getMonth() + 1}月{date.getDate()}日</span> : null}
                <div className="mt-2 flex flex-wrap gap-1">
                  {availableHours > 0 ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${planTagSoftClassName.expected}`}>可排班 {availableHours}h</span> : null}
                  {bookedHours > 0 ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${planTagSoftClassName.booked}`}>已定预约 {bookedHours}h</span> : null}
                  {freeHours > 0 ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${planTagSoftClassName.expected}`}>班 {freeHours}h</span> : null}
                  {overflowHours > 0 ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${planTagSoftClassName.overflow}`}>超窗 {overflowHours}h</span> : null}
                </div>
              </>
            ) : (
              <span className="grid h-full min-h-[54px] place-items-center rounded-md border border-dashed border-line text-xs font-black text-ink/30">
                未排
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function DayStaffHourGrid({
  availabilityMap,
  capacityBuckets,
  capacityMaxValue,
  currentDate,
  technicians,
  schedulesByStaffDate,
  schedulePlanTags,
  onDayClick,
  onScheduleClick,
  onBlockTimeChange,
  onTechnicianClick,
  onToggleTechnicianDetails,
  showIntegratedCapacityHeader,
  showTechnicianDetails,
  scrollRef,
  dragScrollProps
}: {
  availabilityMap: Record<string, AvailabilityWindow>;
  capacityBuckets: CapacityBucket[];
  capacityMaxValue: number;
  currentDate: Date;
  technicians: Technician[];
  schedulesByStaffDate: Record<string, Record<string, Schedule[]>>;
  schedulePlanTags: Record<string, SchedulePlanTag>;
  onDayClick: (dateKey: string, staffId?: string) => void;
  onScheduleClick: (schedule: Schedule) => void;
  onBlockTimeChange: (block: ScheduleBlock, mode: BlockInteractionMode, nextStartMinutes: number, nextEndMinutes: number) => void;
  onTechnicianClick?: (technician: Technician) => void;
  onToggleTechnicianDetails: () => void;
  showIntegratedCapacityHeader: boolean;
  showTechnicianDetails: boolean;
  scrollRef: ReturnType<typeof useHorizontalDragScroll>["scrollRef"];
  dragScrollProps: DragScrollProps;
}) {
  const dateKey = formatDateKey(currentDate);
  const frozenColumnWidth = showTechnicianDetails ? dispatchFrozenColumnWidth : 92;
  const [hoverCell, setHoverCell] = useState<DayHoverCell | null>(null);

  return (
    <div
      className="relative max-h-[72vh] overflow-auto cursor-grab active:cursor-grabbing"
      ref={scrollRef}
      style={{ touchAction: "pan-y" }}
      {...dragScrollProps}
    >
      <div className="grid min-w-max" style={{ gridTemplateColumns: `${frozenColumnWidth}px repeat(24, ${getDispatchColumnWidth("day")}px)` }}>
        {showIntegratedCapacityHeader ? (
          <IntegratedCapacityHeader
            buckets={capacityBuckets}
            columnWidth={getDispatchColumnWidth("day")}
            frozenColumnWidth={frozenColumnWidth}
            maxValue={capacityMaxValue}
            title={`${formatDateKey(currentDate)} · 24 小时容量`}
          />
        ) : null}
        <div
          className={`sticky left-0 top-0 z-40 flex items-center gap-2 overflow-visible border-b border-r border-line bg-paper px-4 py-3 text-xs font-black text-ink/45 ${
            hoverCell ? "admin-schedule-highlight-row" : ""
          }`}
        >
          <span className="truncate">技师 / 24小时</span>
          <TechnicianLabelToggleButton expanded={showTechnicianDetails} onClick={onToggleTechnicianDetails} />
        </div>
        {dispatchHours.map((hour) => (
          <div
            className={`sticky top-0 z-30 border-b border-r border-line bg-paper px-2 py-3 text-center text-[11px] font-black text-ink/45 ${
              hoverCell?.hour === hour ? "admin-schedule-highlight-column" : ""
            }`}
            key={hour}
          >
            {formatHour(hour)}
          </div>
        ))}

        {technicians.map((technician) => {
          const daySchedules = schedulesByStaffDate[technician.id]?.[dateKey] ?? [];
          const blocks = getScheduleBlocks(daySchedules, schedulePlanTags, availabilityMap);

          return (
            <DayStaffHourRow
              availabilityMap={availabilityMap}
              blocks={blocks}
              dateKey={dateKey}
              hoverCell={hoverCell}
              key={technician.id}
              onBlockTimeChange={onBlockTimeChange}
              onDayClick={onDayClick}
              onScheduleClick={onScheduleClick}
              onTechnicianClick={onTechnicianClick}
              onCellHover={setHoverCell}
              onCellLeave={() => setHoverCell(null)}
              showTechnicianDetails={showTechnicianDetails}
              frozenColumnWidth={frozenColumnWidth}
              technician={technician}
            />
          );
        })}
      </div>
      {hoverCell ? <DayHoverTooltip cell={hoverCell} /> : null}
    </div>
  );
}

function DayStaffHourRow({
  availabilityMap,
  technician,
  dateKey,
  blocks,
  onDayClick,
  onScheduleClick,
  onBlockTimeChange,
  onTechnicianClick,
  showTechnicianDetails,
  frozenColumnWidth,
  hoverCell,
  onCellHover,
  onCellLeave
}: {
  availabilityMap: Record<string, AvailabilityWindow>;
  technician: Technician;
  dateKey: string;
  blocks: ScheduleBlock[];
  onDayClick: (dateKey: string, staffId?: string) => void;
  onScheduleClick: (schedule: Schedule) => void;
  onBlockTimeChange: (block: ScheduleBlock, mode: BlockInteractionMode, nextStartMinutes: number, nextEndMinutes: number) => void;
  onTechnicianClick?: (technician: Technician) => void;
  showTechnicianDetails: boolean;
  frozenColumnWidth: number;
  hoverCell: DayHoverCell | null;
  onCellHover: (cell: DayHoverCell) => void;
  onCellLeave: () => void;
}) {
  const availability = availabilityMap[getAvailabilityKey(technician.id, dateKey)];

  const startBlockInteraction = (event: ReactPointerEvent<HTMLElement>, block: ScheduleBlock, mode: BlockInteractionMode) => {
    event.preventDefault();
    event.stopPropagation();

    const timeline = (event.currentTarget as HTMLElement).closest("[data-schedule-timeline]") as HTMLElement | null;

    if (!timeline) {
      return;
    }

    const rect = timeline.getBoundingClientRect();
    const originalStart = timeToMinutes(block.startTime);
    const originalEnd = timeToMinutes(block.endTime);
    const originalDuration = originalEnd - originalStart;
    const startX = event.clientX;
    let moved = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaMinutes = snapMinutes(((moveEvent.clientX - startX) / rect.width) * 1440);

      if (Math.abs(deltaMinutes) >= 30) {
        moved = true;
      }

      if (mode === "drag") {
        const nextStart = clamp(snapMinutes(originalStart + deltaMinutes), 0, 1440 - originalDuration);
        onBlockTimeChange(block, mode, nextStart, nextStart + originalDuration);
        return;
      }

      if (mode === "resize-start") {
        const nextStart = clamp(snapMinutes(originalStart + deltaMinutes), 0, originalEnd - 30);
        onBlockTimeChange(block, mode, nextStart, originalEnd);
        return;
      }

      const nextEnd = clamp(snapMinutes(originalEnd + deltaMinutes), originalStart + 30, 1440);
      onBlockTimeChange(block, mode, originalStart, nextEnd);
    };

    const stopInteraction = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);

      if (!moved && mode === "drag") {
        onScheduleClick(block.schedules[0]);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopInteraction);
  };

  return (
    <>
      <div
        className={`sticky left-0 z-20 flex min-h-[72px] items-center gap-3 border-b border-r border-line bg-white px-4 py-3 ${
          hoverCell?.staffId === technician.id ? "admin-schedule-highlight-row" : ""
        }`}
        style={{ width: frozenColumnWidth }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button className="focus-ring shrink-0" onClick={() => onTechnicianClick?.(technician)} type="button">
            <AvatarImage alt={technician.name} className="h-10 w-10" src={technician.avatar} />
          </button>
          {showTechnicianDetails ? (
            <span className="min-w-0">
              <button className="focus-ring block truncate text-left text-sm font-black text-moss hover:underline" onClick={() => onTechnicianClick?.(technician)} type="button">
                {technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}
              </button>
              <button className="focus-ring block truncate text-left text-xs text-ink/45 hover:text-moss" onClick={() => onDayClick(dateKey, technician.id)} type="button">
                {getScheduleHours(blocks.flatMap((block) => block.schedules))}h 已排
              </button>
            </span>
          ) : null}
        </div>
      </div>
      <div
        className={`relative grid min-h-[72px] border-b border-line bg-white ${hoverCell?.staffId === technician.id ? "admin-schedule-highlight-row" : ""}`}
        data-schedule-timeline
        style={{ gridColumn: "span 24", gridTemplateColumns: `repeat(24, ${getDispatchColumnWidth("day")}px)` }}
      >
        {dispatchHours.map((hour) => (
          <button
            aria-label={`${technician.name} ${dateKey} ${formatHour(hour)}`}
            className={`border-r border-line/80 transition hover:bg-paper/50 ${
              hoverCell?.staffId === technician.id || hoverCell?.hour === hour ? "admin-schedule-highlight-axis" : ""
            } ${hoverCell?.staffId === technician.id && hoverCell?.hour === hour ? "admin-schedule-highlight-cross" : ""}`}
            key={hour}
            onPointerEnter={(event) => onCellHover({ staffId: technician.id, technicianName: technician.name, dateKey, hour, x: event.clientX, y: event.clientY })}
            onPointerLeave={onCellLeave}
            onPointerMove={(event) => onCellHover({ staffId: technician.id, technicianName: technician.name, dateKey, hour, x: event.clientX, y: event.clientY })}
            onClick={() => onDayClick(dateKey, technician.id)}
            type="button"
          />
        ))}
        {availability ? (
          <span
            className="pointer-events-none absolute bottom-2 top-2 rounded-lg border border-[rgba(120,208,146,0.45)] bg-[rgba(120,208,146,0.12)]"
            style={getHorizontalRangeStyle(availability.startTime, availability.endTime)}
          />
        ) : null}
        {blocks.map((block) => (
          <button
            className={`focus-ring group relative z-10 m-2 cursor-grab overflow-hidden rounded-md border px-3 py-2 text-left text-xs font-black shadow-panel active:cursor-grabbing ${planTagCellClassName[block.planTag]}`}
            key={block.id}
            onClick={(event) => {
              event.stopPropagation();
              onScheduleClick(block.schedules[0]);
            }}
            onPointerDown={(event) => startBlockInteraction(event, block, "drag")}
            style={{ gridColumn: getBlockGridPlacement(block), gridRow: "1" }}
            type="button"
          >
            <span
              aria-label="向左拉伸"
              className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-current opacity-20 transition group-hover:opacity-40"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => startBlockInteraction(event, block, "resize-start")}
              role="button"
              tabIndex={-1}
            />
            <span className="block truncate">{block.startTime}-{block.endTime}</span>
            <span className="block truncate font-bold opacity-75">{planTagCopy[block.planTag]}{block.orderIds[0] ? ` · ${block.orderIds[0]}` : ""}</span>
            <span
              aria-label="向右拉伸"
              className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-current opacity-20 transition group-hover:opacity-40"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => startBlockInteraction(event, block, "resize-end")}
              role="button"
              tabIndex={-1}
            />
          </button>
        ))}
      </div>
    </>
  );
}

function ScheduleDayDetailContent({
  autoDispatchSettings,
  autoScheduleSettings,
  availabilityMap,
  dayAssistantMode,
  filteredTechnicians,
  firstBookedTechnician,
  firstFreeTechnician,
  focusStaffId,
  onAddSchedule,
  onAssistantModeChange,
  onAutoDispatchOpen,
  onAutoScheduleOpen,
  onAvailabilityChange,
  onCancelExpectedAdjustment,
  onConfirmExpectedAdjustment,
  onScheduleClick,
  onSchedulePlanChange,
  onScheduleTimeChange,
  onSmartScheduleOpen,
  onTechnicianClick,
  schedulePlanTags,
  schedulesByStaffDate,
  selectedDayKey,
  selectedDayScopedSchedules,
  selectedDayStats
}: {
  autoDispatchSettings: ReturnType<typeof useScheduleStore>["autoDispatchSettings"];
  autoScheduleSettings: ReturnType<typeof useScheduleStore>["autoScheduleSettings"];
  availabilityMap: Record<string, AvailabilityWindow>;
  dayAssistantMode: DayAssistantMode;
  filteredTechnicians: Technician[];
  firstBookedTechnician?: Technician;
  firstFreeTechnician?: Technician;
  focusStaffId: string | null;
  onAddSchedule: (staffId: string, date: string) => void;
  onAssistantModeChange: (mode: DayAssistantMode) => void;
  onAutoDispatchOpen: () => void;
  onAutoScheduleOpen: () => void;
  onAvailabilityChange: (staffId: string, date: string, startTime: string, endTime: string) => void;
  onCancelExpectedAdjustment: (scheduleId: string) => void;
  onConfirmExpectedAdjustment: (scheduleId: string) => void;
  onScheduleClick: (schedule: Schedule) => void;
  onSchedulePlanChange: (scheduleId: string, planTag: SchedulePlanTag) => void;
  onScheduleTimeChange: (scheduleId: string, startMinutes: number, endMinutes: number) => void;
  onSmartScheduleOpen: () => void;
  onTechnicianClick?: (technician: Technician) => void;
  schedulePlanTags: Record<string, SchedulePlanTag>;
  schedulesByStaffDate: Record<string, Record<string, Schedule[]>>;
  selectedDayKey: string;
  selectedDayScopedSchedules: Schedule[];
  selectedDayStats: {
    booked: number;
    free: number;
    blocked: number;
    overflow: number;
  };
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["总排班", `${getScheduleHours(selectedDayScopedSchedules)}h`, "bg-ink text-white"],
          ["已定预约", `${selectedDayStats.booked}h`, planTagSoftClassName.booked],
          ["可排班", `${selectedDayStats.free}h`, planTagSoftClassName.expected],
          ["锁定 / 请假", `${selectedDayStats.blocked}h`, planTagSoftClassName.locked],
          ["超窗排班", `${selectedDayStats.overflow}h`, planTagSoftClassName.overflow]
        ].map(([label, value, className]) => (
          <article className={`rounded-lg px-3 py-3 ${className}`} key={label}>
            <strong className="block text-xl">{value}</strong>
            <span className="text-xs font-black">{label}</span>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-line bg-paper p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button className={dayAssistantMode === "schedule" ? "" : "bg-white text-ink hover:border-moss"} variant={dayAssistantMode === "schedule" ? "primary" : "secondary"} onClick={() => onAssistantModeChange("schedule")}>
            一键排班
          </Button>
          <Button className={dayAssistantMode === "dispatch" ? "" : "bg-white text-ink hover:border-moss"} variant={dayAssistantMode === "dispatch" ? "primary" : "secondary"} onClick={() => onAssistantModeChange("dispatch")}>
            智能派单
          </Button>
        </div>
        <div className="mt-3 rounded-lg bg-white p-4">
          {dayAssistantMode === "schedule" ? (
            <div>
              <h4 className="font-black">一键排班建议</h4>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                系统会先合并连续空闲时段，再检查跨区移动、锁定冲突和高峰期缺口。
                {firstFreeTechnician ? ` 当前最适合补排的是 ${firstFreeTechnician.name}，可覆盖 ${firstFreeTechnician.serviceAreas.slice(0, 2).join("、")}。` : " 当前没有空闲技师，可先释放锁定时段或开启跨店支援。"}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Button size="sm" onClick={onSmartScheduleOpen}>打开一键排班</Button>
                <Button size="sm" variant="secondary" onClick={onAutoScheduleOpen}>
                  {autoScheduleSettings.enabled ? "查看自动排班规则" : "开启自动排班"}
                </Button>
                <Button size="sm" variant="secondary">检查冲突</Button>
              </div>
            </div>
          ) : (
            <div>
              <h4 className="font-black">智能派单建议</h4>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                系统会综合距离、技能、评分、接单率和是否连续服务来排序，优先派给当天空闲且移动时间最短的人。
                {firstBookedTechnician ? ` 已定预约时段可追踪 ${firstBookedTechnician.name} 的履约状态，并自动准备备选技师。` : " 当天暂无已定预约订单，可先从区域派单池导入需求。"}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Button size="sm" onClick={onAutoDispatchOpen}>
                  {autoDispatchSettings.enabled ? "查看自动派单规则" : "开启自动派单"}
                </Button>
                <Button size="sm" variant="secondary">查看备选技师</Button>
                <Button size="sm" variant="secondary">发送确认消息</Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <EditableScheduleList
        availabilityMap={availabilityMap}
        focusStaffId={focusStaffId}
        onAddSchedule={onAddSchedule}
        onAvailabilityChange={onAvailabilityChange}
        onCancelExpectedAdjustment={onCancelExpectedAdjustment}
        onConfirmExpectedAdjustment={onConfirmExpectedAdjustment}
        onSchedulePlanChange={onSchedulePlanChange}
        onScheduleTimeChange={onScheduleTimeChange}
        onTechnicianClick={onTechnicianClick}
        schedulePlanTags={schedulePlanTags}
        schedulesByStaffDate={schedulesByStaffDate}
        selectedDayKey={selectedDayKey}
        technicians={filteredTechnicians}
      />

      <DayDetailMatrix
        availabilityMap={availabilityMap}
        focusStaffId={focusStaffId}
        onScheduleClick={onScheduleClick}
        onTechnicianClick={onTechnicianClick}
        schedulePlanTags={schedulePlanTags}
        schedulesByStaffDate={schedulesByStaffDate}
        selectedDayKey={selectedDayKey}
        technicians={filteredTechnicians}
      />
    </div>
  );
}

function EditableScheduleList({
  selectedDayKey,
  technicians,
  schedulesByStaffDate,
  focusStaffId,
  schedulePlanTags,
  availabilityMap,
  onAvailabilityChange,
  onConfirmExpectedAdjustment,
  onCancelExpectedAdjustment,
  onScheduleTimeChange,
  onSchedulePlanChange,
  onAddSchedule,
  onTechnicianClick
}: {
  selectedDayKey: string;
  technicians: Technician[];
  schedulesByStaffDate: Record<string, Record<string, Schedule[]>>;
  focusStaffId: string | null;
  schedulePlanTags: Record<string, SchedulePlanTag>;
  availabilityMap: Record<string, AvailabilityWindow>;
  onAvailabilityChange: (staffId: string, date: string, startTime: string, endTime: string) => void;
  onConfirmExpectedAdjustment: (scheduleId: string) => void;
  onCancelExpectedAdjustment: (scheduleId: string) => void;
  onScheduleTimeChange: (scheduleId: string, startMinutes: number, endMinutes: number) => void;
  onSchedulePlanChange: (scheduleId: string, planTag: SchedulePlanTag) => void;
  onAddSchedule: (staffId: string, date: string) => void;
  onTechnicianClick?: (technician: Technician) => void;
}) {
  const targetTechnicians = focusStaffId ? technicians.filter((technician) => technician.id === focusStaffId) : technicians;
      const canEditFuture = selectedDayKey >= dispatchTodayKey;

  const shiftSchedule = (schedule: Schedule, deltaMinutes: number) => {
    const duration = scheduleDurationMinutes(schedule);
    const nextStart = clamp(timeToMinutes(schedule.startTime) + deltaMinutes, 0, 1440 - duration);

    onScheduleTimeChange(schedule.id, nextStart, nextStart + duration);
  };

  const extendSchedule = (schedule: Schedule, deltaMinutes: number) => {
    onScheduleTimeChange(schedule.id, timeToMinutes(schedule.startTime), clamp(timeToMinutes(schedule.endTime) + deltaMinutes, timeToMinutes(schedule.startTime) + 30, 1440));
  };

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TitleWithInfo
          as="h3"
          info="未来日期可以直接修改开始时间、结束时间和状态；日视图里也可以拖动或拉伸时间条。"
          label={`${focusStaffId ? "该技师当日排班编辑" : "当天排班编辑"}说明`}
          title={focusStaffId ? "该技师当日排班编辑" : "当天排班编辑"}
          titleClassName="font-black"
          variant="paper"
        />
        <span className={`rounded-full px-3 py-1 text-xs font-black ${canEditFuture ? planTagSoftClassName.expected : planTagSoftClassName.locked}`}>
          {canEditFuture ? "可修改未来排班" : "历史记录只读"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {targetTechnicians.map((technician) => {
          const schedules = schedulesByStaffDate[technician.id]?.[selectedDayKey] ?? [];
          const availability = availabilityMap[getAvailabilityKey(technician.id, selectedDayKey)] ?? { startTime: "10:00", endTime: "18:00" };
          const hasAvailability = Boolean(availabilityMap[getAvailabilityKey(technician.id, selectedDayKey)]);

          return (
            <article className="rounded-lg border border-line bg-paper p-3" key={technician.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AvatarImage alt={technician.name} className="h-10 w-10" src={technician.avatar} />
                  <div>
                    <button className="focus-ring block text-left font-black text-moss hover:underline" onClick={() => onTechnicianClick?.(technician)} type="button">
                      {technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}
                    </button>
                    <span className="text-xs font-bold text-ink/45">{getScheduleHours(schedules)}h 排班 · {technician.serviceAreas.slice(0, 2).join(" / ")}</span>
                  </div>
                </div>
                <Button disabled={!canEditFuture || !hasAvailability} size="sm" variant="secondary" onClick={() => onAddSchedule(technician.id, selectedDayKey)}>
                  新增排班段
                </Button>
              </div>

              <div className="mt-3 rounded-lg border border-line bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-black">可排班时间</h4>
                    <p className="mt-1 text-xs leading-5 text-ink/55">先设定技师这一天可以上班的时间窗口，再在窗口内安排店铺工作、锁定或请假。</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${hasAvailability ? planTagSoftClassName.expected : planTagSoftClassName.locked}`}>
                    {hasAvailability ? `${availability.startTime}-${availability.endTime}` : "尚未设定"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr,1fr,auto]">
                  <label className="text-xs font-black text-ink/50">
                    开始
                    <input
                      className="mt-1 h-9 w-full rounded-md border border-line bg-paper px-3 text-sm font-black text-ink outline-none focus:border-moss"
                      disabled={!canEditFuture}
                      onChange={(event) => onAvailabilityChange(technician.id, selectedDayKey, event.target.value, availability.endTime)}
                      step={1800}
                      type="time"
                      value={availability.startTime}
                    />
                  </label>
                  <label className="text-xs font-black text-ink/50">
                    结束
                    <input
                      className="mt-1 h-9 w-full rounded-md border border-line bg-paper px-3 text-sm font-black text-ink outline-none focus:border-moss"
                      disabled={!canEditFuture}
                      onChange={(event) => onAvailabilityChange(technician.id, selectedDayKey, availability.startTime, event.target.value)}
                      step={1800}
                      type="time"
                      value={availability.endTime}
                    />
                  </label>
                  <div className="flex items-end">
                    <Button disabled={!canEditFuture} size="sm" onClick={() => onAvailabilityChange(technician.id, selectedDayKey, availability.startTime, availability.endTime)}>
                      保存时间
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {schedules.length > 0 ? (
                  schedules.map((schedule) => (
                    <div className="grid gap-2 rounded-lg border border-line bg-white p-3 md:grid-cols-[1fr,1fr,1fr,auto]" key={schedule.id}>
                      <label className="text-xs font-black text-ink/50">
                        开始
                        <input
                          className="mt-1 h-9 w-full rounded-md border border-line bg-paper px-3 text-sm font-black text-ink outline-none focus:border-moss"
                          disabled={!canEditFuture || schedule.status === "booked"}
                          onChange={(event) => onScheduleTimeChange(schedule.id, timeToMinutes(event.target.value), timeToMinutes(schedule.endTime))}
                          step={1800}
                          type="time"
                          value={schedule.startTime}
                        />
                      </label>
                      <label className="text-xs font-black text-ink/50">
                        结束
                        <input
                          className="mt-1 h-9 w-full rounded-md border border-line bg-paper px-3 text-sm font-black text-ink outline-none focus:border-moss"
                          disabled={!canEditFuture || schedule.status === "booked"}
                          onChange={(event) => onScheduleTimeChange(schedule.id, timeToMinutes(schedule.startTime), timeToMinutes(event.target.value))}
                          step={1800}
                          type="time"
                          value={schedule.endTime}
                        />
                      </label>
                      <label className="text-xs font-black text-ink/50">
                        状态
                        <select
                          className="mt-1 h-9 w-full rounded-md border border-line bg-paper px-3 text-sm font-black text-ink outline-none focus:border-moss"
                          disabled={!canEditFuture || schedule.status === "booked"}
                          onChange={(event) => onSchedulePlanChange(schedule.id, event.target.value as SchedulePlanTag)}
                          value={getPlanTag(schedule, schedulePlanTags)}
                        >
                          {schedule.status === "booked" ? <option value="booked">已定预约</option> : null}
                          <option value="expected">可排班</option>
                          <option value="locked">锁定</option>
                          <option value="leave">请假</option>
                          <option value="expectedTravel">预计移动时间</option>
                          <option value="travel">移动时间</option>
                          <option value="expectedBreak">预计休息时间</option>
                          <option value="break">休息时间</option>
                        </select>
                      </label>
                      <div className="flex flex-wrap items-end gap-2">
                        <Button disabled={!canEditFuture || schedule.status === "booked"} size="sm" variant="secondary" onClick={() => shiftSchedule(schedule, -30)}>
                          前移
                        </Button>
                        <Button disabled={!canEditFuture || schedule.status === "booked"} size="sm" variant="secondary" onClick={() => shiftSchedule(schedule, 30)}>
                          后移
                        </Button>
                        <Button disabled={!canEditFuture || schedule.status === "booked"} size="sm" variant="secondary" onClick={() => extendSchedule(schedule, 30)}>
                          延长
                        </Button>
                        {isExpectedAdjustmentPlanTag(getPlanTag(schedule, schedulePlanTags)) ? (
                          <>
                            <Button disabled={!canEditFuture || schedule.status === "booked"} size="sm" onClick={() => onConfirmExpectedAdjustment(schedule.id)}>
                              确定
                            </Button>
                            <Button
                              className="border-[#d69b93] text-[#c85f56] hover:border-[#d97f75]"
                              disabled={!canEditFuture || schedule.status === "booked"}
                              size="sm"
                              variant="secondary"
                              onClick={() => onCancelExpectedAdjustment(schedule.id)}
                            >
                              取消
                            </Button>
                          </>
                        ) : null}
                      </div>
                      <p className="md:col-span-4 text-xs font-bold text-ink/45">
                        {planTagCopy[getVisualPlanTag(schedule, schedulePlanTags, availabilityMap)]}
                        {isExpectedAdjustmentPlanTag(getPlanTag(schedule, schedulePlanTags)) ? " · 等待确认" : ""}
                        {" · "}可排班时间 {availability.startTime}-{availability.endTime}
                        {schedule.orderId ? ` · 绑定订单 ${schedule.orderId}` : " · 未绑定订单"}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-line bg-white p-4 text-sm font-bold text-ink/45">
                    这一天还没有排班。先设定可排班时间，再新增店铺工作、锁定或请假时段。
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function IntegratedCapacityHeader({
  buckets,
  columnWidth,
  frozenColumnWidth,
  maxValue,
  title
}: {
  buckets: CapacityBucket[];
  columnWidth: number;
  frozenColumnWidth: number;
  maxValue: number;
  title: string;
}) {
  const plotHeight = 104;
  const plotWidth = Math.max(columnWidth * buckets.length, 1);
  const paddingX = columnWidth / 2;
  const usableWidth = Math.max(0, plotWidth - paddingX * 2);
  const chartTop = 14;
  const chartBottom = 12;
  const usableHeight = plotHeight - chartTop - chartBottom;
  const bookingColor = "#f3b33e";
  const technicianColor = "#66c2ff";

  const plotPoints = buckets.map((bucket, index) => {
    const x = buckets.length === 1 ? plotWidth / 2 : paddingX + (index / Math.max(1, buckets.length - 1)) * usableWidth;
    const bookingY = chartTop + usableHeight - (bucket.bookingCount / maxValue) * usableHeight;
    const technicianY = chartTop + usableHeight - (bucket.technicianCount / maxValue) * usableHeight;

    return { ...bucket, x, bookingY, technicianY };
  });

  const bookingSeries = splitByFuture(plotPoints.map((point) => ({ ...point, y: point.bookingY })));
  const technicianSeries = splitByFuture(plotPoints.map((point) => ({ ...point, y: point.technicianY })));

  return (
    <>
      <div className="sticky left-0 z-20 flex min-h-[104px] flex-col justify-between border-b border-r border-line bg-paper px-4 py-3">
        <div>
          <span className="block text-[11px] font-black text-ink/45">容量趋势</span>
          <strong className="mt-1 block text-sm font-black text-ink">{title}</strong>
        </div>
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 text-[11px] font-black text-ink/60">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: bookingColor }} />
            已定预约
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] font-black text-ink/60">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: technicianColor }} />
            可排班
          </span>
        </div>
      </div>
      <div
        className="relative border-b border-r border-line"
        style={{
          gridColumn: `2 / span ${buckets.length}`,
          height: `${plotHeight}px`,
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--admin-topbar) 68%, transparent), color-mix(in srgb, var(--admin-surface) 100%, transparent))"
        }}
      >
        <svg className="block h-full overflow-visible" preserveAspectRatio="xMidYMid meet" style={{ width: plotWidth }} viewBox={`0 0 ${plotWidth} ${plotHeight}`}>
          {plotPoints.map((point) => (
            <line
              key={`guide-${point.key}`}
              stroke="var(--admin-line)"
              strokeDasharray="3 5"
              strokeOpacity="0.42"
              strokeWidth="1"
              x1={point.x}
              x2={point.x}
              y1={0}
              y2={plotHeight}
            />
          ))}
          {[0, 0.5, 1].map((tick) => {
            const y = chartTop + usableHeight - tick * usableHeight;

            return (
              <line
                key={`tick-${tick}`}
                stroke="var(--admin-line)"
                strokeDasharray="4 4"
                strokeOpacity="0.48"
                strokeWidth="1"
                x1={0}
                x2={plotWidth}
                y1={y}
                y2={y}
              />
            );
          })}

          {[
            { key: "booking-past", rows: bookingSeries.past, color: bookingColor, dashed: false },
            { key: "booking-future", rows: bookingSeries.future, color: bookingColor, dashed: true },
            { key: "technician-past", rows: technicianSeries.past, color: technicianColor, dashed: false },
            { key: "technician-future", rows: technicianSeries.future, color: technicianColor, dashed: true }
          ].map((series) =>
            series.rows.length > 0 ? (
              <path
                d={getSeriesPath(series.rows.map((point) => ({ x: point.x, y: point.y })))}
                fill="none"
                key={series.key}
                stroke={series.color}
                strokeDasharray={series.dashed ? "8 8" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
            ) : null
          )}

          {plotPoints.map((point) => (
            <g key={`point-${point.key}`}>
              <circle cx={point.x} cy={point.bookingY} fill={bookingColor} r="4.5" />
              <circle cx={point.x} cy={point.technicianY} fill={technicianColor} r="4.5" />
            </g>
          ))}
        </svg>
      </div>
    </>
  );
}

function DayDetailMatrix({
  availabilityMap,
  selectedDayKey,
  technicians,
  schedulesByStaffDate,
  schedulePlanTags,
  focusStaffId,
  onScheduleClick,
  onTechnicianClick
}: {
  availabilityMap: Record<string, AvailabilityWindow>;
  selectedDayKey: string;
  technicians: Technician[];
  schedulesByStaffDate: Record<string, Record<string, Schedule[]>>;
  schedulePlanTags: Record<string, SchedulePlanTag>;
  focusStaffId: string | null;
  onScheduleClick: (schedule: Schedule) => void;
  onTechnicianClick?: (technician: Technician) => void;
}) {
  const visibleTechnicians = focusStaffId ? technicians.filter((technician) => technician.id === focusStaffId) : technicians;
  const detailGridHeight = dispatchHours.length * 56;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TitleWithInfo
          as="h3"
          info="横向是技师和当天工作时间，纵向是 0-23 点。连续空闲或预约会合并成长色块。"
          label="当天 24 小时明细说明"
          title="当天 24 小时明细"
          titleClassName="font-black"
          variant="paper"
        />
        <div className="flex flex-wrap gap-2">
          {(["booked", "expected", "locked", "leave", "overflow"] as const).map((status) => (
            <span className={`rounded-full px-3 py-1 text-xs font-black ${planTagSoftClassName[status]}`} key={status}>
              {planTagCopy[status]}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-auto rounded-lg border border-line">
        <div className="grid min-w-[980px]" style={{ gridTemplateColumns: `88px repeat(${visibleTechnicians.length}, minmax(160px, 1fr))` }}>
          <div className="sticky left-0 z-20 border-b border-r border-line bg-paper px-3 py-3 text-xs font-black text-ink/45">
            时间
          </div>
          {visibleTechnicians.map((technician) => {
            const daySchedules = schedulesByStaffDate[technician.id]?.[selectedDayKey] ?? [];

            return (
              <div className={`border-b border-r border-line bg-paper px-3 py-3 ${focusStaffId === technician.id ? "admin-schedule-focus" : ""}`} key={technician.id}>
                <div className="flex items-center gap-2">
                  <AvatarImage alt={technician.name} className="h-8 w-8" src={technician.avatar} />
                  <span className="min-w-0">
                    <button className="focus-ring block truncate text-left text-sm font-black text-moss hover:underline" onClick={() => onTechnicianClick?.(technician)} type="button">
                      {technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}
                    </button>
                    <span className="block truncate text-[11px] text-ink/45">{getScheduleHours(daySchedules)}h 已排</span>
                  </span>
                </div>
              </div>
            );
          })}

          <div className="sticky left-0 z-10 border-r border-line bg-white" style={{ height: detailGridHeight }}>
            {dispatchHours.map((hour) => (
              <div className="flex h-14 items-start justify-end border-b border-line px-3 py-2 text-xs font-black text-ink/45" key={hour}>
                {formatHour(hour)}
              </div>
            ))}
          </div>
          {visibleTechnicians.map((technician) => {
            const daySchedules = schedulesByStaffDate[technician.id]?.[selectedDayKey] ?? [];
            const blocks = getScheduleBlocks(daySchedules, schedulePlanTags, availabilityMap);
            const availability = availabilityMap[getAvailabilityKey(technician.id, selectedDayKey)];

            return (
              <div className="relative border-r border-line bg-white" key={`${technician.id}-timeline`} style={{ height: detailGridHeight }}>
                {dispatchHours.map((hour) => (
                  <button
                    aria-label={`${technician.name} ${selectedDayKey} ${formatHour(hour)}`}
                    className="absolute left-0 right-0 border-t border-line/80 transition hover:bg-paper/50"
                    key={`${technician.id}-${hour}`}
                    style={{ top: `${(hour / 24) * 100}%`, height: `${100 / 24}%` }}
                    type="button"
                  />
                ))}
                {availability ? (
                  <span
                    className="pointer-events-none absolute left-2 right-2 z-[1] rounded-lg border border-[rgba(120,208,146,0.42)] bg-[rgba(120,208,146,0.12)]"
                    style={getVerticalRangeStyle(availability.startTime, availability.endTime)}
                  />
                ) : null}
                {blocks.map((block) => (
                  <button
                    className={`focus-ring absolute left-2 right-2 z-10 overflow-hidden rounded-md border px-3 py-2 text-left text-xs font-black shadow-panel ${planTagCellClassName[block.planTag]}`}
                    key={block.id}
                    onClick={() => onScheduleClick(block.schedules[0])}
                    style={getVerticalTimelineStyle(block)}
                    type="button"
                  >
                    <span className="block truncate">{block.startTime}-{block.endTime}</span>
                    <span className="block truncate font-bold opacity-75">{planTagCopy[block.planTag]}{block.orderIds[0] ? ` · ${block.orderIds[0]}` : ""}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ButtonLike({ children, onClick }: { children: string; onClick?: () => void }) {
  return (
    <button className="focus-ring rounded-full border border-line bg-white px-4 py-2 text-xs font-black text-ink/65 transition hover:border-moss hover:text-moss" onClick={onClick} type="button">
      {children}
    </button>
  );
}

function DayHoverTooltip({ cell }: { cell: DayHoverCell }) {
  const { language } = useI18n();

  return (
    <div
      className="pointer-events-none fixed z-[80] rounded-lg border border-line bg-white/95 px-3 py-2 text-xs font-black text-ink shadow-panel backdrop-blur"
      style={{ left: cell.x + 16, top: cell.y + 16 }}
    >
      <span className="block text-[10px] text-moss">{cell.technicianName}</span>
      <strong className="mt-1 block">{formatDateLabel(cell.dateKey, language)}</strong>
      <span className="mt-1 block text-ink/55">{formatHourRange(cell.hour)}</span>
    </div>
  );
}

function ButtonIcon({ children, label, onClick }: { children: string; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-xl font-black text-ink/65 transition hover:border-moss hover:text-moss" onClick={onClick} type="button">
      {children}
    </button>
  );
}
