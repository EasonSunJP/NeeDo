import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent as ReactUIEvent } from "react";
import { Badge, type BadgeTone } from "../../../components/ui/Badge";
import { NotificationBadge } from "../../../components/ui/NotificationBadge";
import { useI18n } from "../../../i18n/I18nProvider";
import { translateText, type Language, type LocalizedText } from "../../../i18n/translations";
import { useHorizontalDragScroll } from "../../../lib/useHorizontalDragScroll";
import { cn } from "../../../lib/utils";
import { HolidayCornerBadge } from "../../../components/scheduling/HolidayCornerBadge";
import { getScheduleClosedCellStyle } from "../../../components/scheduling/scheduleGridVisuals";
import type { DispatchScheduleCell, DispatchScheduleCellStatus, DispatchScheduleGridData } from "../store";
import { TechnicianAvatarBadge, TechnicianColumnToggleIcon } from "./TechnicianListUi";

function getScheduleCellCssTone(status: DispatchScheduleCellStatus) {
  if (status === "open") {
    return "available";
  }

  if (status === "confirmed") {
    return "scheduled";
  }

  if (status === "booked") {
    return "booked";
  }

  if (status === "conflict" || status === "pending") {
    return "conflict-pending";
  }

  if (status === "other") {
    return "other";
  }

  return "closed";
}

function getCellClassName(cell: DispatchScheduleCell, surface: "desktop" | "mobile") {
  const isMobileSurface = surface === "mobile";
  if (cell.status === "confirmed") {
    return isMobileSurface
      ? "schedule-legend-badge schedule-legend-badge--scheduled"
      : "merchant-dispatch-cell-confirmed";
  }

  if (cell.status === "booked") {
    return isMobileSurface ? "schedule-legend-badge schedule-legend-badge--booked" : "merchant-dispatch-cell-booked";
  }

  if (cell.status === "conflict") {
    return isMobileSurface ? "schedule-legend-badge schedule-legend-badge--conflict-pending" : "merchant-dispatch-cell-conflict";
  }

  if (cell.status === "pending") {
    return isMobileSurface ? "schedule-legend-badge schedule-legend-badge--conflict-pending border-dashed" : "merchant-dispatch-cell-pending border-dashed";
  }

  if (cell.status === "other") {
    return isMobileSurface ? "schedule-legend-badge schedule-legend-badge--other" : "merchant-dispatch-cell-other";
  }

  if (cell.status === "closed") {
    return isMobileSurface ? "schedule-legend-badge schedule-legend-badge--closed" : "merchant-dispatch-cell-closed";
  }

  return isMobileSurface
    ? "schedule-legend-badge schedule-legend-badge--available"
    : "merchant-dispatch-cell-available";
}

function getMobilePeriodCellToneStyle(status: DispatchScheduleCellStatus) {
  const cssTone = getScheduleCellCssTone(status);

  return {
    background: `var(--schedule-tone-${cssTone}-bg)`,
    borderColor: `var(--schedule-tone-${cssTone}-border)`,
    color: `var(--schedule-tone-${cssTone}-text)`,
    textShadow: `var(--schedule-tone-${cssTone}-text-shadow, none)`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)"
  } satisfies CSSProperties;
}

type PeriodTimelineRange = {
  startHour: number;
  endHour: number;
};

type ScheduleGridDayCellAction = {
  className?: string;
  onClick?: () => void;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
  onMouseUp?: () => void;
  title?: string;
};

type ScheduleGridDayPrimaryRangeResize = {
  endIndex: number;
  nextEndIndex: number;
  nextStartIndex: number;
  rowIndex: number;
  startIndex: number;
};

type ScheduleGridResizePreview = ScheduleGridDayPrimaryRangeResize;

type ScheduleGridRowHeaderContext = {
  collapsedTechnicians: boolean;
  isMobileSurface: boolean;
  rowIndex: number;
  surface: "desktop" | "mobile";
};

export type ScheduleLegendFilter = "available" | "scheduled" | "booked" | "conflictPending" | "other" | "standby" | "travel" | "inService" | "extraTime" | "breakBuffer";

export const scheduleLegendItems: Array<{
  className: string;
  label: string;
  tone: BadgeTone;
  value: ScheduleLegendFilter;
}> = [
  { className: "schedule-legend-badge schedule-legend-badge--scheduled", label: "已排班", tone: "green", value: "scheduled" },
  { className: "schedule-legend-badge schedule-legend-badge--booked", label: "有预约", tone: "green", value: "booked" },
  { className: "schedule-legend-badge schedule-legend-badge--conflict-pending", label: "冲突 / 待定", tone: "red", value: "conflictPending" },
  { className: "schedule-legend-badge schedule-legend-badge--other", label: "其他行程", tone: "yellow", value: "other" },
  { className: "schedule-legend-badge schedule-legend-badge--standby", label: "待机", tone: "dark", value: "standby" },
  { className: "schedule-legend-badge schedule-legend-badge--travel", label: "移动", tone: "blue", value: "travel" },
  { className: "schedule-legend-badge schedule-legend-badge--in-service", label: "服务中", tone: "blue", value: "inService" },
  { className: "schedule-legend-badge schedule-legend-badge--extra-time", label: "加钟", tone: "red", value: "extraTime" },
  { className: "schedule-legend-badge schedule-legend-badge--break-buffer", label: "休息/缓冲", tone: "red", value: "breakBuffer" }
];

const periodWorkStatuses = new Set<DispatchScheduleCellStatus>(["confirmed", "booked", "conflict", "pending"]);
const openWorkStatuses = new Set<DispatchScheduleCellStatus>(["open"]);
const bookedAppointmentStatuses = new Set<DispatchScheduleCellStatus>(["booked"]);
const dayScheduledBaseStatuses = new Set<DispatchScheduleCellStatus>(["confirmed", "booked", "conflict", "pending"]);
const dayAppointmentBarStatuses = new Set<DispatchScheduleCellStatus>(["booked", "conflict", "pending"]);
const dayConfirmedWorkStatuses = new Set<DispatchScheduleCellStatus>(["confirmed", "booked"]);
const dayPendingWorkStatuses = new Set<DispatchScheduleCellStatus>(["pending"]);
const actualWorkLegendFilters = new Set<ScheduleLegendFilter>(["standby", "travel", "inService", "extraTime", "breakBuffer"]);
const travelFilterPattern = /移动|移動|travel|traffic|路程|路线|上门前|预计移动/i;
const inServiceFilterPattern = /服务中|服務中|service|inService|进行中|進行中|履约|履約/i;
const extraTimeFilterPattern = /加钟|加鐘|延長|extension|overtime|연장/i;

type DayTimelineLane = "primary" | "exception";
type DayTimelineRange = {
  appointmentCount: number;
  cells: DispatchScheduleCell[];
  endHour: number;
  endIndex: number;
  isCurrent: boolean;
  lane: DayTimelineLane;
  representativeCell: DispatchScheduleCell;
  startHour: number;
  startIndex: number;
  status: DispatchScheduleCellStatus;
};

type DayWorkStatus = "standby" | "travel" | "inService" | "extraTime" | "breakBuffer" | "serviceException";

type DayWorkStatusRange = {
  endHour: number;
  endIndex: number;
  label: string;
  representativeCell: DispatchScheduleCell;
  startHour: number;
  startIndex: number;
  status: DayWorkStatus;
};

type DayClosedRange = {
  endIndex: number;
  startIndex: number;
};

type DayClosedBlock = DayClosedRange & {
  endRow: number;
  startRow: number;
};

function formatPeriodHour(hour: number) {
  return `${String(Math.min(hour, 24)).padStart(2, "0")}:00`;
}

function getLocalizedTimelineLabel(
  key: "work" | "storeOpen" | "pending" | "appointments" | "exception",
  language: Language,
  count = 0
) {
  if (key === "appointments") {
    if (language === "ja") {
      return `予約 ${count}件`;
    }

    if (language === "en") {
      return `${count} appt${count === 1 ? "" : "s"}`;
    }

    if (language === "ko") {
      return `예약 ${count}건`;
    }

    return `${language === "zh-Hant" ? "預約" : "预约"} ${count}件`;
  }

  const labels: Record<Exclude<typeof key, "appointments">, LocalizedText> = {
    work: {
      zh: "上班",
      "zh-Hant": "上班",
      ja: "勤務",
      en: "Work",
      ko: "근무"
    },
    storeOpen: {
      zh: "店铺开放",
      "zh-Hant": "店舖開放",
      ja: "店舗開放",
      en: "Store open",
      ko: "매장 오픈"
    },
    pending: {
      zh: "待技师确认",
      "zh-Hant": "待技師確認",
      ja: "スタッフ未確認",
      en: "Awaiting tech",
      ko: "기사 미확정"
    },
    exception: {
      zh: "异常",
      "zh-Hant": "異常",
      ja: "異常",
      en: "Exception",
      ko: "예외"
    }
  };

  return labels[key][language];
}

function countBookedAppointmentSegmentsInCells(cells: DispatchScheduleCell[]) {
  return cells.reduce((count, cell, index) => {
    if (cell.status !== "booked") {
      return count;
    }

    const previousCell = cells[index - 1];
    return previousCell?.status === "booked" && getAppointmentMergeKey(previousCell) === getAppointmentMergeKey(cell) ? count : count + 1;
  }, 0);
}

function hasOrderDetailTarget(cell: DispatchScheduleCell | undefined) {
  return Boolean(cell?.detailTargetType === "order_detail" && cell.detailTargetId) || Boolean(cell?.orderId);
}

function getAppointmentIdentity(cell: Pick<DispatchScheduleCell, "appointmentId" | "date" | "detailTargetId" | "hour" | "orderId">) {
  return cell.orderId ?? cell.detailTargetId ?? cell.appointmentId ?? `${cell.date}:${cell.hour ?? "day"}`;
}

function getAppointmentMergeKey(cell: DispatchScheduleCell) {
  return `${cell.status}:${getAppointmentIdentity(cell)}`;
}

function hasActualService(cell: DispatchScheduleCell) {
  return cell.serviceStatus === "inService" || cell.serviceStatus === "completed" || cell.eventType === "attendance";
}

function isMissingServiceExceptionCell(cell: DispatchScheduleCell) {
  return cell.status === "booked" && !hasActualService(cell);
}

function isDayExceptionCell(cell: DispatchScheduleCell) {
  return cell.status === "conflict" || cell.status === "pending" || isMissingServiceExceptionCell(cell);
}

function getDayTimelineMergeKey(status: DispatchScheduleCellStatus) {
  if (status === "booked") {
    return "booked";
  }

  if (status === "confirmed") {
    return "confirmed";
  }

  if (status === "conflict" || status === "pending") {
    return "conflictPending";
  }

  return status;
}

function buildDayTimelineRanges(
  cells: DispatchScheduleCell[],
  statuses: Set<DispatchScheduleCellStatus>,
  lane: DayTimelineLane,
  options: {
    includeCell?: (cell: DispatchScheduleCell) => boolean;
    mergeKey?: (cell: DispatchScheduleCell) => string;
  } = {}
) {
  return cells.reduce<DayTimelineRange[]>((ranges, cell, index) => {
    if (!statuses.has(cell.status) || options.includeCell?.(cell) === false) {
      return ranges;
    }

    const previous = ranges[ranges.length - 1];
    const cellHour = cell.hour ?? index;
    const previousCell = previous?.cells[previous.cells.length - 1];
    const previousMergeKey = previousCell ? options.mergeKey?.(previousCell) ?? getDayTimelineMergeKey(previousCell.status) : null;
    const currentMergeKey = options.mergeKey?.(cell) ?? getDayTimelineMergeKey(cell.status);

    if (previous && previous.endIndex === index && previousMergeKey === currentMergeKey) {
      previous.cells.push(cell);
      previous.endIndex = index + 1;
      previous.endHour = cellHour + 1;
      previous.appointmentCount = countBookedAppointmentSegmentsInCells(previous.cells);
      previous.isCurrent = previous.isCurrent || cell.isCurrent;
      if (!hasOrderDetailTarget(previous.representativeCell) && hasOrderDetailTarget(cell)) {
        previous.representativeCell = cell;
      }
      return ranges;
    }

    ranges.push({
      appointmentCount: cell.status === "booked" ? 1 : 0,
      cells: [cell],
      endHour: cellHour + 1,
      endIndex: index + 1,
      isCurrent: cell.isCurrent,
      lane,
      representativeCell: cell,
      startHour: cellHour,
      startIndex: index,
      status: cell.status
    });

    return ranges;
  }, []);
}

function buildClosedTimelineRanges(cells: DispatchScheduleCell[]) {
  return cells.reduce<DayClosedRange[]>((ranges, cell, index) => {
    if (cell.status !== "closed") {
      return ranges;
    }

    const previous = ranges[ranges.length - 1];

    if (previous && previous.endIndex === index) {
      previous.endIndex = index + 1;
      return ranges;
    }

    ranges.push({
      endIndex: index + 1,
      startIndex: index
    });
    return ranges;
  }, []);
}

function buildClosedTimelineBlocks(rows: DispatchScheduleGridData["rows"]) {
  return rows.reduce<DayClosedBlock[]>((blocks, row, rowIndex) => {
    buildClosedTimelineRanges(row.cells).forEach((range) => {
      const previousBlock = blocks.find(
        (block) =>
          block.endRow === rowIndex &&
          block.startIndex === range.startIndex &&
          block.endIndex === range.endIndex
      );

      if (previousBlock) {
        previousBlock.endRow = rowIndex + 1;
        return;
      }

      blocks.push({
        ...range,
        endRow: rowIndex + 1,
        startRow: rowIndex
      });
    });

    return blocks;
  }, []);
}

function getStableTechnicianSeed(technicianId: string | undefined) {
  return (technicianId ?? "schedule-row").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildContiguousCellRanges(
  cells: DispatchScheduleCell[],
  predicate: (cell: DispatchScheduleCell) => boolean
) {
  return cells.reduce<Array<{ endIndex: number; startIndex: number }>>((ranges, cell, index) => {
    if (!predicate(cell)) {
      return ranges;
    }

    const previous = ranges[ranges.length - 1];
    if (previous && previous.endIndex === index) {
      previous.endIndex = index + 1;
      return ranges;
    }

    ranges.push({ startIndex: index, endIndex: index + 1 });
    return ranges;
  }, []);
}

function isWorkStatusCell(cell: DispatchScheduleCell) {
  return cell.status !== "closed";
}

function getRepresentativeCell(cells: DispatchScheduleCell[], startIndex: number) {
  return cells[startIndex] ?? cells.find(isWorkStatusCell) ?? cells[0];
}

function findNearestOrderTargetCell(
  cells: DispatchScheduleCell[],
  startIndex: number,
  endIndex: number,
  searchStartIndex = startIndex,
  searchEndIndex = endIndex
) {
  const clampedSearchStartIndex = Math.max(0, searchStartIndex);
  const clampedSearchEndIndex = Math.min(cells.length, searchEndIndex);
  let nearestCell: DispatchScheduleCell | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (index < clampedSearchStartIndex || index >= clampedSearchEndIndex || !hasOrderDetailTarget(cell)) {
      continue;
    }

    const distance = index < startIndex ? startIndex - index : index >= endIndex ? index - endIndex + 1 : 0;

    if (distance < nearestDistance) {
      nearestCell = cell;
      nearestDistance = distance;
    }
  }

  return nearestCell;
}

function toWorkStatusRange(
  cells: DispatchScheduleCell[],
  status: DayWorkStatus,
  startIndex: number,
  endIndex: number,
  targetSearchRange?: { startIndex: number; endIndex: number },
  label?: string
): DayWorkStatusRange | null {
  const orderTargetCell =
    status === "standby" || status === "breakBuffer"
      ? null
      : findNearestOrderTargetCell(
          cells,
          startIndex,
          endIndex,
          targetSearchRange?.startIndex ?? startIndex,
          targetSearchRange?.endIndex ?? endIndex
        );
  const representativeCell = orderTargetCell ?? getRepresentativeCell(cells, startIndex);
  if (!representativeCell || endIndex <= startIndex) {
    return null;
  }

  const startHour = cells[startIndex]?.hour ?? startIndex;
  const lastIndex = Math.max(startIndex, endIndex - 1);
  const endHour = (cells[lastIndex]?.hour ?? lastIndex) + 1;

  return {
    endHour,
    endIndex,
    label: label ?? (status === "standby" ? "待机" : status === "travel" ? "移动中" : status === "inService" ? "服务中" : status === "extraTime" ? "加钟" : status === "serviceException" ? "待处理" : "休息/缓冲"),
    representativeCell,
    startHour,
    startIndex,
    status
  };
}

function canUseStatusWindow(startIndex: number, endIndex: number, occupied: Set<number>) {
  for (let index = startIndex; index < endIndex; index += 1) {
    if (occupied.has(index)) {
      return false;
    }
  }

  return true;
}

function markStatusWindow(startIndex: number, endIndex: number, occupied: Set<number>) {
  for (let index = startIndex; index < endIndex; index += 1) {
    occupied.add(index);
  }
}

function findStatusWindow(
  preferredStartIndex: number,
  length: number,
  minIndex: number,
  maxIndex: number,
  occupied: Set<number>
) {
  const maxStartIndex = maxIndex - length;
  if (maxStartIndex < minIndex) {
    return null;
  }

  const clampedPreferredStartIndex = Math.min(Math.max(preferredStartIndex, minIndex), maxStartIndex);
  for (let index = clampedPreferredStartIndex; index <= maxStartIndex; index += 1) {
    if (canUseStatusWindow(index, index + length, occupied)) {
      return index;
    }
  }

  for (let index = clampedPreferredStartIndex - 1; index >= minIndex; index -= 1) {
    if (canUseStatusWindow(index, index + length, occupied)) {
      return index;
    }
  }

  return null;
}

function clampTimelineIndex(index: number, minIndex: number, maxIndex: number) {
  return Math.min(Math.max(index, minIndex), maxIndex);
}

function shouldUseRichActualRoute(seed: number) {
  return seed % 5 === 0 || seed % 5 === 2 || seed % 5 === 4;
}

function getServiceRangeLabel(cells: DispatchScheduleCell[], startIndex: number, endIndex: number) {
  return cells.slice(startIndex, endIndex).some((cell) => cell.serviceStatus === "completed") ? "已完成" : "服务中";
}

function getExceptionRangeLabel(cells: DispatchScheduleCell[], startIndex: number, endIndex: number) {
  const cell = cells.slice(startIndex, endIndex).find(isDayExceptionCell) ?? cells[startIndex];

  if (!cell) {
    return "待处理";
  }

  if (cell.status === "conflict") {
    return "预约冲突";
  }

  if (cell.status === "pending") {
    return "待确认";
  }

  return cell.serviceExceptionLabel ?? "待处理";
}

function buildDayWorkStatusRanges(cells: DispatchScheduleCell[], _technicianId?: string) {
  const workSpans = buildContiguousCellRanges(cells, (cell) => dayScheduledBaseStatuses.has(cell.status));
  const ranges: DayWorkStatusRange[] = [];

  workSpans.forEach((span) => {
    const overlayRanges: DayWorkStatusRange[] = [];

    const appendOverlayRange = (status: Exclude<DayWorkStatus, "standby">, startIndex: number, endIndex: number, label?: string) => {
      const range = toWorkStatusRange(cells, status, startIndex, endIndex, {
        startIndex: span.startIndex,
        endIndex: span.endIndex
      }, label);
      if (!range) {
        return;
      }

      overlayRanges.push(range);
    };

    buildContiguousCellRanges(cells, (cell) => hasActualService(cell)).forEach((range) => {
      if (range.startIndex >= span.startIndex && range.endIndex <= span.endIndex) {
        appendOverlayRange("inService", range.startIndex, range.endIndex, getServiceRangeLabel(cells, range.startIndex, range.endIndex));
      }
    });

    buildContiguousCellRanges(cells, (cell) => cell.status === "other").forEach((range) => {
      if (range.startIndex >= span.startIndex && range.endIndex <= span.endIndex) {
        appendOverlayRange("breakBuffer", range.startIndex, range.endIndex);
      }
    });

    buildContiguousCellRanges(cells, isDayExceptionCell).forEach((range) => {
      if (range.startIndex >= span.startIndex && range.endIndex <= span.endIndex) {
        appendOverlayRange("serviceException", range.startIndex, range.endIndex, getExceptionRangeLabel(cells, range.startIndex, range.endIndex));
      }
    });
    const standbyRange = toWorkStatusRange(cells, "standby", span.startIndex, span.endIndex);
    if (standbyRange) {
      ranges.push(standbyRange);
    }

    ranges.push(...overlayRanges.sort((left, right) => left.startIndex - right.startIndex || left.endIndex - right.endIndex));
  });

  return ranges;
}

function getPrimaryRangeTone(range: DayTimelineRange) {
  if (range.cells.some((cell) => dayConfirmedWorkStatuses.has(cell.status))) {
    return "confirmed";
  }

  if (range.cells.some((cell) => dayPendingWorkStatuses.has(cell.status))) {
    return "pending";
  }

  return "open";
}

type DayTimelineLegendTone = "available" | "scheduled" | "booked" | "conflictPending" | "other" | "standby" | "travel" | "inService" | "extraTime" | "breakBuffer";

function getScheduleToneStyle(tone: DayTimelineLegendTone) {
  const cssTone =
    tone === "conflictPending"
      ? "conflict-pending"
      : tone === "inService"
        ? "in-service"
        : tone === "extraTime"
          ? "extra-time"
        : tone === "breakBuffer"
          ? "break-buffer"
          : tone;
  const shouldShowBorder = tone === "available" || tone === "conflictPending" || tone === "standby" || tone === "extraTime" || tone === "breakBuffer";

  return {
    background: `var(--schedule-tone-${cssTone}-bg)`,
    border: shouldShowBorder ? `1px solid var(--schedule-tone-${cssTone}-border)` : "0",
    color: `var(--schedule-tone-${cssTone}-text)`,
    textShadow: `var(--schedule-tone-${cssTone}-text-shadow, none)`
  } satisfies CSSProperties;
}

function getCellLegendSearchText(cell: DispatchScheduleCell) {
  return [
    cell.status,
    cell.title,
    cell.detail,
    cell.serviceExceptionLabel ?? "",
    ...(cell.dayTimeline?.flatMap((slot) => [slot.status, slot.title, slot.detail, slot.serviceExceptionLabel ?? ""]) ?? [])
  ].join(" ");
}

function cellMatchesLegendFilter(cell: DispatchScheduleCell, filter: ScheduleLegendFilter) {
  const statuses = [cell.status, ...(cell.dayTimeline?.map((slot) => slot.status) ?? [])];

  if (filter === "available") {
    return statuses.includes("open");
  }

  if (filter === "scheduled") {
    return statuses.includes("confirmed");
  }

  if (filter === "booked") {
    return statuses.includes("booked");
  }

  if (filter === "conflictPending") {
    return statuses.some((status) => status === "conflict" || status === "pending") ||
      Boolean(cell.serviceExceptionLabel) ||
      Boolean(cell.dayTimeline?.some((slot) => slot.serviceExceptionLabel));
  }

  if (filter === "other") {
    return statuses.includes("other");
  }

  if (filter === "standby") {
    return statuses.some((status) => status !== "closed");
  }

  if (filter === "breakBuffer") {
    return statuses.includes("other") || /休息|休憩|break|buffer|缓冲|緩衝|휴식/i.test(getCellLegendSearchText(cell));
  }

  const text = getCellLegendSearchText(cell);

  if (filter === "travel") {
    return travelFilterPattern.test(text);
  }

  if (filter === "inService") {
    return inServiceFilterPattern.test(text);
  }

  if (filter === "extraTime") {
    return extraTimeFilterPattern.test(text);
  }

  return false;
}

function rowMatchesLegendFilter(
  row: DispatchScheduleGridData["rows"][number],
  filter: ScheduleLegendFilter,
  showActualWorkStatus: boolean
) {
  if (!showActualWorkStatus && actualWorkLegendFilters.has(filter)) {
    return false;
  }

  const isDayGridRow = row.cells.some((cell) => cell.hour != null);

  if (isDayGridRow && filter === "conflictPending") {
    return row.cells.some(isDayExceptionCell);
  }

  if (isDayGridRow && actualWorkLegendFilters.has(filter)) {
    const workStatusFilter: DayWorkStatus =
      filter === "standby" ? "standby" : filter === "travel" ? "travel" : filter === "inService" ? "inService" : filter === "extraTime" ? "extraTime" : "breakBuffer";
    return buildDayWorkStatusRanges(row.cells, row.technicianId).some((range) => range.status === workStatusFilter);
  }

  return row.cells.some((cell) => cellMatchesLegendFilter(cell, filter));
}

function getDayTimelineLegendTone(range: DayTimelineRange): DayTimelineLegendTone {
  if (range.lane === "exception") {
    return range.cells.some((cell) => cell.status === "conflict") ? "conflictPending" : "other";
  }

  if (range.cells.some((cell) => cell.status === "conflict" || cell.status === "pending")) {
    return "conflictPending";
  }

  if (range.cells.some((cell) => cell.status === "other")) {
    return "other";
  }

  if (range.appointmentCount > 0 || range.cells.some((cell) => cell.status === "booked")) {
    return "booked";
  }

  if (range.cells.some((cell) => cell.status === "confirmed")) {
    return "scheduled";
  }

  return "available";
}

function getDayTimelineBarStyle(
  range: DayTimelineRange,
  _surface: "desktop" | "mobile"
) {
  return getScheduleToneStyle(getDayTimelineLegendTone(range));
}

function getPrimaryRangeLabel(range: DayTimelineRange, language: Language) {
  if (range.cells.every((cell) => cell.title === "OK")) {
    return "OK";
  }

  const statusLabel = getPrimaryRangeTone(range) === "confirmed"
    ? getLocalizedTimelineLabel("work", language)
    : range.cells.some((cell) => cell.status === "pending")
      ? getLocalizedTimelineLabel("pending", language)
      : getLocalizedTimelineLabel("storeOpen", language);

  return `${formatPeriodHour(range.startHour)}-${formatPeriodHour(range.endHour)} ${statusLabel}`;
}

function getAppointmentRangeLabel(range: DayTimelineRange, language: Language) {
  const statusLabel = range.cells.some((cell) => cell.status === "conflict")
    ? translateText("预约冲突", language)
    : range.cells.some((cell) => cell.status === "pending")
      ? translateText("待确认", language)
      : translateText("有预约", language);

  return `${formatPeriodHour(range.startHour)}-${formatPeriodHour(range.endHour)} ${statusLabel}`;
}

function buildPeriodTimelineRanges(cell: DispatchScheduleCell, statuses: Set<DispatchScheduleCellStatus>) {
  const timeline = cell.dayTimeline ?? [];

  return timeline.reduce<PeriodTimelineRange[]>((ranges, slot) => {
    if (!statuses.has(slot.status)) {
      return ranges;
    }

    const previous = ranges[ranges.length - 1];
    if (previous && previous.endHour === slot.hour) {
      previous.endHour = slot.hour + 1;
      return ranges;
    }

    ranges.push({ startHour: slot.hour, endHour: slot.hour + 1 });
    return ranges;
  }, []);
}

function getPeriodWorkTimeLabel(cell: DispatchScheduleCell, language: Language) {
  const ranges = buildPeriodTimelineRanges(cell, periodWorkStatuses);
  const visibleRanges = ranges.length > 0 ? ranges : buildPeriodTimelineRanges(cell, openWorkStatuses);

  if (visibleRanges.length === 0) {
    return translateText("未排班", language);
  }

  const displayedRanges = visibleRanges
    .slice(0, 2)
    .map((range) => `${formatPeriodHour(range.startHour)}-${formatPeriodHour(range.endHour)}`);

  return displayedRanges.join("\n");
}

function countBookedAppointmentSegments(cell: DispatchScheduleCell) {
  return buildPeriodTimelineRanges(cell, bookedAppointmentStatuses).length;
}

const initialScheduleScrollStyle = {
  "--schedule-grid-scroll-left": "0px",
  "--schedule-grid-scroll-offset": "0px"
} as CSSProperties;

export function ScheduleGrid({
  collapsedTechnicians = false,
  compactHeader = false,
  data,
  legendFilter,
  legendActions,
  className,
  onLegendFilterChange,
  onSelectDate,
  onSelectCell,
  onResizeDayPrimaryRange,
  onToggleCollapsed,
  getDayCellAction,
  renderRowHeader,
  showActualWorkStatus = true,
  stickyHeaderLabel,
  stickyColumnWidthPx: stickyColumnWidthPxOverride,
  stickyTop,
  surface
}: {
  collapsedTechnicians?: boolean;
  compactHeader?: boolean;
  data: DispatchScheduleGridData;
  className?: string;
  getDayCellAction?: (cell: DispatchScheduleCell, row: DispatchScheduleGridData["rows"][number], rowIndex: number, cellIndex: number) => ScheduleGridDayCellAction | null;
  legendActions?: ReactNode;
  legendFilter?: ScheduleLegendFilter | null;
  onLegendFilterChange?: (filter: ScheduleLegendFilter | null) => void;
  onResizeDayPrimaryRange?: (resize: ScheduleGridDayPrimaryRangeResize) => void;
  onSelectDate?: (dateKey: string) => void;
  onSelectCell?: (cell: DispatchScheduleCell) => void;
  onToggleCollapsed?: () => void;
  renderRowHeader?: (row: DispatchScheduleGridData["rows"][number], context: ScheduleGridRowHeaderContext) => ReactNode;
  showActualWorkStatus?: boolean;
  stickyColumnWidthPx?: number;
  stickyHeaderLabel?: string;
  stickyTop?: string;
  surface: "desktop" | "mobile";
}) {
  const isMobileSurface = surface === "mobile";
  const { language } = useI18n();
  const isPeriodGrid = data.dates.length > 1;
  const isDayGrid = !isPeriodGrid;
  const stickyColumnWidthPx = collapsedTechnicians
    ? surface === "mobile" ? 72 : 84
    : stickyColumnWidthPxOverride ?? (surface === "mobile" ? 176 : 248);
  const stickyColumnWidth = `${stickyColumnWidthPx}px`;
  const dataColumnWidthPx = isPeriodGrid ? (isMobileSurface ? 96 : 112) : 58;
  const columnWidth = isPeriodGrid ? `${dataColumnWidthPx}px` : "minmax(58px,1fr)";
  const [internalLegendFilter, setInternalLegendFilter] = useState<ScheduleLegendFilter | null>(null);
  const activeLegendFilter = legendFilter === undefined ? internalLegendFilter : legendFilter;
  const visibleRows = activeLegendFilter ? data.rows.filter((row) => rowMatchesLegendFilter(row, activeLegendFilter, showActualWorkStatus)) : data.rows;
  const [scheduleScrollMetrics, setScheduleScrollMetrics] = useState({
    columnWidthPx: dataColumnWidthPx,
    scrollLeft: 0
  });
  const [resizePreview, setResizePreview] = useState<ScheduleGridResizePreview | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const shouldTrackTimelineLabelScroll = isDayGrid && (
    showActualWorkStatus ||
    data.rows.some((row) =>
      row.cells.some((cell) =>
        dayAppointmentBarStatuses.has(cell.status) ||
        (dayScheduledBaseStatuses.has(cell.status) && cell.title !== "OK")
      )
    )
  );
  const getRenderedDataColumnWidth = useCallback((element?: HTMLDivElement | null) => {
    if (!element || data.headers.length === 0) {
      return dataColumnWidthPx;
    }

    const contentElement = element.firstElementChild instanceof HTMLElement ? element.firstElementChild : null;
    const scrollableWidth = contentElement?.scrollWidth ?? element.scrollWidth;
    const dataWidth = Math.max(data.headers.length * dataColumnWidthPx, scrollableWidth - stickyColumnWidthPx);

    return dataWidth / data.headers.length;
  }, [data.headers.length, dataColumnWidthPx, stickyColumnWidthPx]);
  const syncHeaderScrollLeft = useCallback((scrollLeft: number, element?: HTMLDivElement | null) => {
    const nextLeft = `${scrollLeft}px`;
    const nextOffset = `${-scrollLeft}px`;
    const columnWidthPx = isDayGrid ? getRenderedDataColumnWidth(element) : dataColumnWidthPx;

    if (shouldTrackTimelineLabelScroll) {
      setScheduleScrollMetrics((previous) =>
        Math.abs(previous.scrollLeft - scrollLeft) < 0.5 && Math.abs(previous.columnWidthPx - columnWidthPx) < 0.5
          ? previous
          : { columnWidthPx, scrollLeft }
      );
    }
    wrapperRef.current?.style.setProperty("--schedule-grid-scroll-left", nextLeft);
    wrapperRef.current?.style.setProperty("--schedule-grid-scroll-offset", nextOffset);
  }, [dataColumnWidthPx, getRenderedDataColumnWidth, isDayGrid, shouldTrackTimelineLabelScroll]);
  const handleScheduleScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    syncHeaderScrollLeft(event.currentTarget.scrollLeft, event.currentTarget);
  }, [syncHeaderScrollLeft]);
  const { scrollRef, dragScrollProps } = useHorizontalDragScroll({ onScrollLeftChange: syncHeaderScrollLeft });
  const scheduleHeaderHeight = isMobileSurface ? "72px" : "72px";
  const scheduleRowHeightPx = isPeriodGrid ? (isMobileSurface ? 72 : 76) : isMobileSurface ? 104 : 96;
  const scheduleRowHeight = `${scheduleRowHeightPx}px`;
  const wrapperClass = isMobileSurface
    ? "bg-transparent shadow-none backdrop-blur-0"
    : "merchant-dispatch-surface";
  const wrapperFrameClass = isMobileSurface ? "" : "border";
  const headerBgClass = isMobileSurface ? "" : "merchant-dispatch-table-header";
  const rowBgClass = isMobileSurface ? "" : "merchant-dispatch-card";
  const toggleClass = isMobileSurface ? "border-line bg-white/80 text-ink/60 hover:border-moss hover:text-ink" : "merchant-dispatch-toggle";
  const closedCellStyle = getScheduleClosedCellStyle(surface);
  const stickySurfaceStyle = {
    background: isMobileSurface
      ? "var(--client-schedule-sticky-bg, var(--client-elevated))"
      : "var(--merchant-dispatch-table-sticky-bg, var(--admin-bg-soft, var(--admin-surface, #ffffff)))",
    minWidth: stickyColumnWidth,
    width: stickyColumnWidth
  } satisfies CSSProperties;
  const headerBackgroundStyle = {
    background: isMobileSurface
      ? "var(--client-schedule-sticky-bg, var(--client-bg))"
      : "var(--merchant-dispatch-table-header-bg, var(--merchant-dispatch-table-sticky-bg, var(--admin-bg-soft, #ffffff)))"
  } satisfies CSSProperties;
  const pageMaskStyle = {
    background: isMobileSurface
      ? "var(--client-schedule-mask-bg, var(--client-bg))"
      : "var(--merchant-dispatch-table-mask-bg, var(--admin-bg, #ffffff))"
  } satisfies CSSProperties;
  const scheduleSurfaceBackground = isMobileSurface
    ? "var(--client-schedule-sticky-bg, var(--client-bg))"
    : "var(--merchant-dispatch-table-sticky-bg, var(--admin-surface, #ffffff))";
  const scheduleSurfaceStyle = {
    background: scheduleSurfaceBackground
  } satisfies CSSProperties;
  const edgeGuardStyle = {
    background: scheduleSurfaceBackground
  } satisfies CSSProperties;
  const stickyHeaderStyle = {
    ...stickySurfaceStyle,
    height: scheduleHeaderHeight
  } satisfies CSSProperties;
  const stickyRowStyle = {
    ...stickySurfaceStyle,
    height: scheduleRowHeight,
    boxShadow: isMobileSurface ? "var(--client-schedule-sticky-shadow)" : undefined,
    maxWidth: stickyColumnWidth,
    minHeight: scheduleRowHeight,
    width: stickyColumnWidth
  } satisfies CSSProperties;
  const scrollGridMinWidth = isPeriodGrid
    ? `${data.headers.length * dataColumnWidthPx}px`
    : `max(${data.headers.length * dataColumnWidthPx}px, calc(1024px - ${stickyColumnWidth}))`;
  const mobileHeaderToggleClass =
    "focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] shadow-[0_12px_24px_rgba(0,0,0,0.12)] transition";
  const resolvedStickyHeaderLabel = stickyHeaderLabel ?? translateText(data.dates.length === 1 ? "技师 / 小时" : "技师 / 日期", language);
  const hasInteractiveDateHeaders = isPeriodGrid && Boolean(onSelectDate);
  const updateLegendFilter = (nextFilter: ScheduleLegendFilter | null) => {
    if (legendFilter === undefined) {
      setInternalLegendFilter(nextFilter);
    }

    onLegendFilterChange?.(nextFilter);
  };
  const handleLegendFilterClick = (filter: ScheduleLegendFilter) => {
    updateLegendFilter(activeLegendFilter === filter ? null : filter);
  };
  const stickyHeaderTop =
    stickyTop ??
    (isMobileSurface
      ? compactHeader
        ? "var(--client-sticky-tab-double-grid-top)"
        : "var(--client-sticky-tab-single-grid-top)"
      : "88px");

  const dayTimelineGridStyle = {
    gridTemplateColumns: `repeat(${data.headers.length}, minmax(${dataColumnWidthPx}px, 1fr))`
  } satisfies CSSProperties;
  const getDayTimelineLabelStyle = (range: Pick<DayTimelineRange, "startIndex" | "endIndex">) => {
    const insetPx = 8;
    const renderedColumnWidthPx = Math.max(dataColumnWidthPx, scheduleScrollMetrics.columnWidthPx);
    const visibleScrollLeft = Math.max(0, scheduleScrollMetrics.scrollLeft);
    const rangeStartPx = range.startIndex * renderedColumnWidthPx;
    const rangeWidthPx = Math.max(renderedColumnWidthPx, (range.endIndex - range.startIndex) * renderedColumnWidthPx);
    const desiredOffsetPx = Math.max(insetPx, visibleScrollLeft - rangeStartPx + insetPx);
    const maxOffsetPx = Math.max(insetPx, rangeWidthPx - insetPx);
    const offsetPx = Math.min(desiredOffsetPx, maxOffsetPx);
    const availableWidthPx = Math.max(0, rangeWidthPx - offsetPx - insetPx);

    return {
      left: `${offsetPx}px`,
      maxWidth: `${availableWidthPx}px`,
      opacity: 1
    } satisfies CSSProperties;
  };
  const startDayPrimaryRangeResize = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    rowIndex: number,
    range: Pick<DayTimelineRange, "endIndex" | "startIndex">,
    edge: "start" | "end"
  ) => {
    if (!onResizeDayPrimaryRange) {
      return;
    }
    const resizeHandler = onResizeDayPrimaryRange;

    event.preventDefault();
    event.stopPropagation();
    const handleElement = event.currentTarget;
    const pointerId = event.pointerId;
    const rowElement = handleElement.closest("[data-schedule-day-row]");
    if (!(rowElement instanceof HTMLElement)) {
      return;
    }

    const columnCount = Math.max(1, data.headers.length);
    let nextStartIndex = range.startIndex;
    let nextEndIndex = range.endIndex;
    const clampIndex = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    const updateResizePreview = () => {
      setResizePreview((previous) => {
        if (
          previous?.rowIndex === rowIndex &&
          previous.startIndex === range.startIndex &&
          previous.endIndex === range.endIndex &&
          previous.nextStartIndex === nextStartIndex &&
          previous.nextEndIndex === nextEndIndex
        ) {
          return previous;
        }

        return {
          endIndex: range.endIndex,
          nextEndIndex,
          nextStartIndex,
          rowIndex,
          startIndex: range.startIndex
        };
      });
    };
    const updateFromClientX = (clientX: number) => {
      const rect = rowElement.getBoundingClientRect();
      const columnWidthPx = rect.width / columnCount;
      const rawIndex = clampIndex(Math.floor((clientX - rect.left) / Math.max(1, columnWidthPx)), 0, columnCount - 1);

      if (edge === "start") {
        nextStartIndex = clampIndex(rawIndex, 0, range.endIndex - 1);
      } else {
        nextEndIndex = clampIndex(rawIndex + 1, range.startIndex + 1, columnCount);
      }
      updateResizePreview();
    };
    function cleanupResizeListeners() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
      try {
        handleElement.releasePointerCapture(pointerId);
      } catch {
        // no-op
      }
      setResizePreview(null);
    }
    function handlePointerMove(moveEvent: PointerEvent) {
      updateFromClientX(moveEvent.clientX);
    }
    function finishResize(upEvent: PointerEvent) {
      updateFromClientX(upEvent.clientX);
      cleanupResizeListeners();

      if (nextStartIndex === range.startIndex && nextEndIndex === range.endIndex) {
        return;
      }

      resizeHandler({
        endIndex: range.endIndex,
        nextEndIndex,
        nextStartIndex,
        rowIndex,
        startIndex: range.startIndex
      });
    }
    function cancelResize() {
      cleanupResizeListeners();
    }

    try {
      handleElement.setPointerCapture(pointerId);
    } catch {
      // no-op
    }
    updateFromClientX(event.clientX);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("pointercancel", cancelResize, { once: true });
  }, [data.headers.length, onResizeDayPrimaryRange]);

  const renderDayTimelineRow = (row: DispatchScheduleGridData["rows"][number], rowIndex: number) => {
    const primaryRanges = buildDayTimelineRanges(row.cells, dayScheduledBaseStatuses, "primary", {
      mergeKey: (cell) => cell.title === "OK" ? "draft-ok" : "scheduled-base"
    });
    const appointmentRanges = buildDayTimelineRanges(row.cells, dayAppointmentBarStatuses, "primary", {
      mergeKey: getAppointmentMergeKey
    });
    const workStatusRanges = showActualWorkStatus ? buildDayWorkStatusRanges(row.cells, row.technicianId) : [];
    const isLastRow = rowIndex === visibleRows.length - 1;
    const standbyRanges = workStatusRanges.filter((range) => range.status === "standby");
    const activeWorkStatusRanges = workStatusRanges.filter((range) => range.status !== "standby");
    const hasOpenCells = row.cells.some((cell) => cell.status === "open");
    const hasTimelineContent = hasOpenCells || primaryRanges.length > 0 || appointmentRanges.length > 0 || standbyRanges.length > 0 || activeWorkStatusRanges.length > 0;
    const dayCellActions = getDayCellAction
      ? row.cells.map((cell, cellIndex) => getDayCellAction(cell, row, rowIndex, cellIndex))
      : [];
    const hasDayCellActions = dayCellActions.some(Boolean);

    return (
      <div
        data-schedule-day-row
        className={cn(
          "relative overflow-hidden border-b border-r border-line",
          rowBgClass,
          isMobileSurface ? "bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]" : "",
          isLastRow && "rounded-br-[28px]"
        )}
        style={{
          ...scheduleSurfaceStyle,
          gridColumn: `span ${data.headers.length}`,
          height: scheduleRowHeight,
          minHeight: scheduleRowHeight
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 grid"
          style={dayTimelineGridStyle}
        >
          {row.cells.map((cell, index) => (
            <span
              className={cn(
                "border-r border-line/70 last:border-r-0",
                cell.darkened && "bg-black/10",
                cell.isCurrent && (isMobileSurface ? "bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]" : "merchant-dispatch-cell-current")
              )}
              key={`${cell.id}-track-${index}`}
            />
          ))}
        </div>

        <div
          className="absolute inset-x-0 top-2 z-30 grid h-[38px] items-center"
          style={dayTimelineGridStyle}
        >
          {primaryRanges.map((range) => {
            const label = getPrimaryRangeLabel(range, language);
            const showResizeHandles = label === "OK";
            const displayedRange =
              resizePreview?.rowIndex === rowIndex &&
              resizePreview.startIndex === range.startIndex &&
              resizePreview.endIndex === range.endIndex
                ? {
                    ...range,
                    endIndex: resizePreview.nextEndIndex,
                    startIndex: resizePreview.nextStartIndex
                  }
                : range;

            return (
              <button
                aria-label={label}
                className={cn(
                  "focus-ring relative h-full min-w-0 overflow-hidden rounded-none border px-2 text-left text-[11px] font-black leading-4 shadow-[0_10px_20px_rgba(0,0,0,0.16)] transition hover:brightness-110",
                  showResizeHandles && "px-6 text-center text-[13px]",
                  range.isCurrent && "brightness-105"
                )}
                key={`${row.technicianId}-primary-${range.startIndex}-${range.endIndex}`}
                onClick={() => onSelectCell?.(range.representativeCell)}
                style={{
                  ...getScheduleToneStyle("scheduled"),
                  gridColumn: `${displayedRange.startIndex + 1} / ${displayedRange.endIndex + 1}`,
                  marginInline: "3px"
                }}
                title={label}
                type="button"
              >
                {showResizeHandles ? (
                  <>
                    <span aria-hidden="true" className="pointer-events-none absolute left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-black/45 shadow-[0_0_0_1px_rgba(255,255,255,0.32)]" />
                    <span aria-hidden="true" className="pointer-events-none absolute right-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-black/45 shadow-[0_0_0_1px_rgba(255,255,255,0.32)]" />
                  </>
                ) : null}
                <span
                  className={cn(
                    "pointer-events-none absolute inset-y-0 flex items-center whitespace-nowrap transition-opacity",
                    showResizeHandles && "left-6 right-6 justify-center"
                  )}
                  style={showResizeHandles ? { opacity: 1 } : getDayTimelineLabelStyle(displayedRange)}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className={cn(
            "absolute inset-x-0 z-[38] grid items-center",
            isMobileSurface ? "top-[12px] h-[28px]" : "top-[11px] h-[30px]"
          )}
          style={dayTimelineGridStyle}
        >
          {appointmentRanges.map((range) => {
            const label = getAppointmentRangeLabel(range, language);

            return (
              <button
                aria-label={label}
                className={cn(
                  "focus-ring relative min-w-0 overflow-hidden rounded-[5px] border px-1.5 text-left font-black leading-none shadow-[0_8px_18px_rgba(0,0,0,0.22)] transition hover:brightness-110",
                  isMobileSurface ? "h-[24px] text-[10px]" : "h-[26px] text-[10px]"
                )}
                key={`${row.technicianId}-appointment-${range.startIndex}-${range.endIndex}-${getAppointmentIdentity(range.representativeCell)}`}
                onClick={() => onSelectCell?.(range.representativeCell)}
                style={{
                  ...getDayTimelineBarStyle(range, surface),
                  gridColumn: `${range.startIndex + 1} / ${range.endIndex + 1}`,
                  marginInline: "7px"
                }}
                title={label}
                type="button"
              >
                <span className="pointer-events-none absolute inset-y-0 flex items-center whitespace-nowrap transition-opacity" style={getDayTimelineLabelStyle(range)}>{label}</span>
              </button>
            );
          })}
        </div>

        <div
          className={cn(
            "absolute inset-x-0 z-[35] grid items-center",
            isMobileSurface ? "top-[44px] h-[18px]" : "top-[40px] h-[16px]"
          )}
          style={dayTimelineGridStyle}
        >
          {standbyRanges.map((range) => {
            const label = `${formatPeriodHour(range.startHour)}-${formatPeriodHour(range.endHour)} ${translateText(range.label, language)}`;

            return (
              <button
                aria-label={label}
                className={cn(
                  "focus-ring relative min-w-0 overflow-hidden rounded-[6px] border px-1.5 text-left text-[9px] font-black leading-none shadow-[0_8px_16px_rgba(0,0,0,0.14)] transition hover:brightness-110",
                  isMobileSurface ? "h-[16px]" : "h-[14px]"
                )}
                key={`${row.technicianId}-standby-${range.startIndex}-${range.endIndex}`}
                onClick={() => onSelectCell?.(range.representativeCell)}
                style={{
                  ...getScheduleToneStyle("standby"),
                  gridColumn: `${range.startIndex + 1} / ${range.endIndex + 1}`,
                  gridRow: "1",
                  marginInline: "3px"
                }}
                title={label}
                type="button"
              >
                <span className="pointer-events-none absolute inset-y-0 flex items-center whitespace-nowrap transition-opacity" style={getDayTimelineLabelStyle(range)}>{label}</span>
              </button>
            );
          })}
        </div>

        <div
          className={cn(
            "absolute inset-x-0 z-40 grid items-center",
            isMobileSurface ? "bottom-[7px] h-[30px]" : "bottom-[6px] h-[26px]"
          )}
          style={dayTimelineGridStyle}
        >
          {activeWorkStatusRanges.map((range) => {
            const tone = range.status === "serviceException" ? "conflictPending" : range.status === "breakBuffer" ? "breakBuffer" : range.status === "extraTime" ? "extraTime" : range.status;
            const label = translateText(range.label, language);

            return (
              <button
                aria-label={`${formatPeriodHour(range.startHour)}-${formatPeriodHour(range.endHour)} ${label}`}
                className={cn(
                  "focus-ring relative min-w-0 overflow-hidden rounded-[7px] border px-1.5 text-center font-black leading-none shadow-[0_10px_18px_rgba(0,0,0,0.2)] transition hover:brightness-110",
                  isMobileSurface ? "h-[28px] text-[10px]" : "h-[24px] text-[9px]"
                )}
                key={`${row.technicianId}-${range.status}-${range.startIndex}-${range.endIndex}`}
                onClick={() => onSelectCell?.(range.representativeCell)}
                style={{
                  ...getScheduleToneStyle(tone),
                  gridColumn: `${range.startIndex + 1} / ${range.endIndex + 1}`,
                  gridRow: "1",
                  marginInline: "4px",
                  zIndex: range.status === "serviceException" ? 5 : range.status === "extraTime" ? 4 : range.status === "inService" ? 3 : range.status === "breakBuffer" ? 2 : 1
                }}
                title={`${formatPeriodHour(range.startHour)}-${formatPeriodHour(range.endHour)} ${label}`}
                type="button"
              >
                <span className="pointer-events-none flex h-full min-w-0 items-center justify-center truncate">{label}</span>
              </button>
            );
          })}
        </div>

        {hasDayCellActions ? (
          <div
            className="absolute inset-0 z-[55] grid"
            style={dayTimelineGridStyle}
          >
            {row.cells.map((cell, cellIndex) => {
              const action = dayCellActions[cellIndex];

              return (
                <button
                  aria-label={action?.title ?? `${formatPeriodHour(cell.hour ?? 0)} ${translateText(cell.title, language)} ${translateText(cell.detail, language)}`}
                  className={cn("focus-ring min-w-0 border-r border-transparent text-left transition hover:bg-white/10", action?.className)}
                  key={`${cell.id}-action`}
                  onClick={(event) => {
                    if (event.currentTarget.dataset.schedulePointerHandled === "true") {
                      delete event.currentTarget.dataset.schedulePointerHandled;
                      return;
                    }

                    if (action?.onClick) {
                      action.onClick();
                      return;
                    }

                    action?.onMouseDown?.();
                  }}
                  onMouseEnter={action?.onMouseEnter}
                  onMouseUp={action?.onMouseUp}
                  onPointerDown={(event) => {
                    if (!action?.onMouseDown) {
                      return;
                    }

                    event.currentTarget.dataset.schedulePointerHandled = "true";
                    action.onMouseDown();
                  }}
                  title={action?.title}
                  type="button"
                />
              );
            })}
          </div>
        ) : onSelectCell ? (
          <div
            className="absolute inset-0 z-20 grid"
            style={dayTimelineGridStyle}
          >
            {row.cells.map((cell) => (
              <button
                aria-label={`${formatPeriodHour(cell.hour ?? 0)} ${translateText(cell.title, language)} ${translateText(cell.detail, language)}`}
                className="focus-ring min-w-0 border-r border-transparent text-left transition hover:bg-white/10"
                key={`${cell.id}-hit`}
                onClick={() => onSelectCell(cell)}
                type="button"
              />
            ))}
          </div>
        ) : null}

        {onResizeDayPrimaryRange ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-2 z-[65] grid h-[38px] items-center"
            style={dayTimelineGridStyle}
          >
            {primaryRanges.map((range) => {
              const label = getPrimaryRangeLabel(range, language);

              if (label !== "OK") {
                return null;
              }
              const displayedRange =
                resizePreview?.rowIndex === rowIndex &&
                resizePreview.startIndex === range.startIndex &&
                resizePreview.endIndex === range.endIndex
                  ? {
                      ...range,
                      endIndex: resizePreview.nextEndIndex,
                      startIndex: resizePreview.nextStartIndex
                    }
                  : range;

              return (
                <span
                  className="pointer-events-none relative h-full min-w-0"
                  key={`${row.technicianId}-resize-${range.startIndex}-${range.endIndex}`}
                  style={{
                    gridColumn: `${displayedRange.startIndex + 1} / ${displayedRange.endIndex + 1}`,
                    marginInline: "3px"
                  }}
                >
                  <button
                    aria-label="调整开始时间"
                    className="pointer-events-auto absolute left-0 top-1/2 h-8 w-5 -translate-y-1/2 cursor-ew-resize rounded-full"
                    data-scroll-drag-ignore="true"
                    onPointerDown={(event) => startDayPrimaryRangeResize(event, rowIndex, range, "start")}
                    style={{ touchAction: "none" }}
                    type="button"
                  />
                  <button
                    aria-label="调整结束时间"
                    className="pointer-events-auto absolute right-0 top-1/2 h-8 w-5 -translate-y-1/2 cursor-ew-resize rounded-full"
                    data-scroll-drag-ignore="true"
                    onPointerDown={(event) => startDayPrimaryRangeResize(event, rowIndex, range, "end")}
                    style={{ touchAction: "none" }}
                    type="button"
                  />
                </span>
              );
            })}
          </div>
        ) : null}

        {!hasTimelineContent ? (
          <div className="relative z-20 flex h-full items-center px-3 text-xs font-black text-ink/45">
            {translateText("未排班", language)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderClosedTimelineLayer = () => {
    if (!isDayGrid || visibleRows.length === 0) {
      return null;
    }

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 z-10 grid"
        style={{
          gridTemplateColumns: `repeat(${data.headers.length}, minmax(${dataColumnWidthPx}px, 1fr))`,
          gridTemplateRows: `repeat(${visibleRows.length}, ${scheduleRowHeight})`,
          height: `${visibleRows.length * scheduleRowHeightPx}px`,
          left: stickyColumnWidth,
          width: scrollGridMinWidth
        }}
      >
        {buildClosedTimelineBlocks(visibleRows).map((block) => (
            <span
              key={`closed-${block.startRow}-${block.endRow}-${block.startIndex}-${block.endIndex}`}
              style={{
                ...getScheduleClosedCellStyle(surface, block.startIndex * dataColumnWidthPx, block.startRow * scheduleRowHeightPx),
                gridColumn: `${block.startIndex + 1} / ${block.endIndex + 1}`,
                gridRow: `${block.startRow + 1} / ${block.endRow + 1}`
              }}
            />
          ))}
      </div>
    );
  };

  const renderScheduleHeader = () => (
    <div
      className={cn("sticky overflow-visible", isMobileSurface ? "z-[80]" : "z-[50]")}
      data-testid="schedule-grid-sticky-header"
      style={{
        height: scheduleHeaderHeight,
        top: stickyHeaderTop,
        ...pageMaskStyle
      }}
    >
      <div
        className={cn(
          "relative h-full overflow-hidden"
        )}
        style={headerBackgroundStyle}
      >
        <div
          aria-hidden={hasInteractiveDateHeaders ? undefined : true}
          className={cn("absolute inset-0 z-0 grid", !hasInteractiveDateHeaders && "pointer-events-none")}
          style={{
            gridTemplateColumns: `${stickyColumnWidth} repeat(${data.headers.length}, ${columnWidth})`,
            minWidth: `calc(${stickyColumnWidth} + ${scrollGridMinWidth})`,
            transform: "translate3d(var(--schedule-grid-scroll-offset, 0px), 0, 0)"
          }}
        >
          <span aria-hidden="true" style={{ height: scheduleHeaderHeight, minWidth: stickyColumnWidth, ...headerBackgroundStyle }} />
          {data.headers.map((header) => {
            const headerClassName = cn(
              "overflow-hidden border-b border-line px-2 py-3 text-center shadow-[0_14px_28px_rgba(0,0,0,0.14)]",
              headerBgClass,
              hasInteractiveDateHeaders && "focus-ring cursor-pointer transition hover:brightness-95 active:brightness-90"
            );
            const headerStyle = { height: scheduleHeaderHeight, ...headerBackgroundStyle };
            const headerContent = (
              <>
                <p className="text-xs font-black text-ink">{translateText(header.label, language)}</p>
                <p className={cn("mt-1 text-[11px]", isMobileSurface ? "text-ink/45" : "text-ink/45")}>{translateText(header.sublabel, language)}</p>
              </>
            );

            return hasInteractiveDateHeaders ? (
              <button
                aria-label={`${header.key} ${translateText("日视图", language)}`}
                className={headerClassName}
                key={header.key}
                onClick={() => onSelectDate?.(header.key)}
                style={headerStyle}
                type="button"
              >
                {headerContent}
              </button>
            ) : (
              <span className={headerClassName} key={header.key} style={headerStyle}>
                {headerContent}
              </span>
            );
          })}
        </div>
        <div
          className={cn(
            "absolute left-0 top-0 z-10 isolate overflow-hidden border-b border-r border-line py-3 text-left shadow-[0_14px_28px_rgba(0,0,0,0.14)]",
            headerBgClass,
            collapsedTechnicians ? "px-2" : "px-4"
          )}
          style={stickyHeaderStyle}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={stickySurfaceStyle} />
          <div className={cn("relative z-10 flex gap-2", collapsedTechnicians ? "justify-center" : "items-start justify-between")}>
            {!collapsedTechnicians ? (
              <div className="min-w-0">
                <p className={cn("text-xs font-black uppercase tracking-[0.16em]", isMobileSurface ? "text-ink/45" : "text-ink/45")}>{resolvedStickyHeaderLabel}</p>
              </div>
            ) : null}
            {onToggleCollapsed && isMobileSurface ? (
              <button
                aria-label={translateText(collapsedTechnicians ? "展开技师列" : "折叠为头像", language)}
                className={cn(
                  mobileHeaderToggleClass,
                  collapsedTechnicians
                    ? "border-[color:color-mix(in_srgb,var(--client-primary)_34%,transparent)] bg-[color:var(--client-primary-soft)]"
                    : "text-[color:var(--client-muted)] hover:border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] hover:text-[color:var(--client-primary)]"
                )}
                onClick={onToggleCollapsed}
                type="button"
              >
                <TechnicianColumnToggleIcon className={cn("transition-transform", collapsedTechnicians && "scale-x-[-1]")} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn("relative isolate overflow-visible", wrapperFrameClass, wrapperClass, className)}
      ref={wrapperRef}
      style={{
        ...initialScheduleScrollStyle,
        ...scheduleSurfaceStyle
      }}
    >
      {!isMobileSurface ? (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-px z-[95] w-[2px]" style={edgeGuardStyle} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -right-px z-[95] w-[2px]" style={edgeGuardStyle} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-px z-[95] h-[2px]" style={edgeGuardStyle} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-px z-[95] h-[2px]" style={edgeGuardStyle} />
        </>
      ) : null}
      {!compactHeader ? (
        <div className="flex items-center justify-end gap-3 border-b border-line px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {scheduleLegendItems.map((item) => {
              const active = activeLegendFilter === item.value;

              return (
                <button
                  aria-label={translateText(active ? `取消${item.label}筛选` : `仅显示${item.label}`, language)}
                  aria-pressed={active}
                  className={cn(
                    "focus-ring rounded-md transition",
                    active && "ring-2 ring-[color:color-mix(in_srgb,var(--client-primary,var(--admin-accent,#7f6df2))_70%,transparent)] ring-offset-2 ring-offset-transparent",
                    activeLegendFilter && !active && "opacity-45 hover:opacity-100"
                  )}
                  key={item.value}
                  onClick={() => handleLegendFilterClick(item.value)}
                  type="button"
                >
                  <Badge className={item.className} tone={item.tone}>{translateText(item.label, language)}</Badge>
                </button>
              );
            })}
            {legendActions}
            {onToggleCollapsed && !isMobileSurface ? (
              <button
                className={cn(
                  "rounded-full border px-3 py-2 text-xs font-black transition",
                  toggleClass
                )}
                onClick={onToggleCollapsed}
                type="button"
              >
                {translateText(collapsedTechnicians ? "展开技师列" : "折叠为头像", language)}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="relative overflow-visible" style={scheduleSurfaceStyle}>
        {renderScheduleHeader()}

        <div
          className="scrollbar-none cursor-grab overflow-x-auto overflow-y-visible active:cursor-grabbing"
          ref={scrollRef}
          style={{
            ...scheduleSurfaceStyle,
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorX: "contain"
          }}
          {...dragScrollProps}
          onScroll={handleScheduleScroll}
        >
          <div
            className="relative grid"
            style={{
              ...scheduleSurfaceStyle,
              gridTemplateColumns: `${stickyColumnWidth} repeat(${data.headers.length}, ${columnWidth})`,
              minWidth: `calc(${stickyColumnWidth} + ${scrollGridMinWidth})`
            }}
          >
            {renderClosedTimelineLayer()}
            {visibleRows.map((row, rowIndex) => (
              <div
                className="contents"
                key={row.technicianId}
              >
              <div
                className={cn(
                  "sticky left-0 z-[70] isolate overflow-hidden border-b border-r border-line py-3",
                  rowBgClass,
                  collapsedTechnicians ? "px-2" : "px-3",
                  rowIndex === visibleRows.length - 1 && "rounded-bl-[28px]"
                )}
                style={stickyRowStyle}
              >
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={stickySurfaceStyle} />
                {renderRowHeader ? (
                  renderRowHeader(row, { collapsedTechnicians, isMobileSurface, rowIndex, surface })
                ) : (
                  <div className={cn("relative z-10 flex min-w-0 items-center gap-2.5", collapsedTechnicians ? "justify-center" : "")}>
                    <TechnicianAvatarBadge alt={row.technicianName} className={cn(isMobileSurface ? "h-10 w-10" : "h-11 w-11")} src={row.technicianAvatar} />
                    <div className={cn("min-w-0", collapsedTechnicians && "hidden")}>
                      <p className="truncate text-sm font-black text-ink">{row.technicianName}</p>
                      <p className={cn("mt-1 truncate text-xs", isMobileSurface ? "text-ink/50" : "text-ink/50")}>{row.technicianSubtitle}</p>
                    </div>
                  </div>
                )}
              </div>
              {isDayGrid ? renderDayTimelineRow(row, rowIndex) : row.cells.map((cell, cellIndex) => {
                const hasPeriodTimeline = cell.hour == null && Boolean(cell.dayTimeline?.length);
                const mobilePeriodCellToneStyle =
                  hasPeriodTimeline && isMobileSurface ? getMobilePeriodCellToneStyle(cell.status) : undefined;
                const bookedAppointmentCount = hasPeriodTimeline ? countBookedAppointmentSegments(cell) : 0;
                const periodWorkTimeLabel = hasPeriodTimeline ? getPeriodWorkTimeLabel(cell, language) : "";
                const isLastCell = rowIndex === visibleRows.length - 1 && cellIndex === row.cells.length - 1;

                return (
                  <button
                    className={cn(
                      "relative overflow-hidden border-b border-r px-2 py-2 text-left transition",
                      !isMobileSurface && "merchant-dispatch-cell-hover hover:z-[1]",
                      getCellClassName(cell, surface),
                      cell.darkened && "brightness-[0.82]",
                      !isMobileSurface && cell.isCurrent && "merchant-dispatch-cell-current",
                      isLastCell && "rounded-br-[28px]"
                    )}
                    key={cell.id}
                    onClick={() => {
                      if (isPeriodGrid && onSelectDate) {
                        onSelectDate(cell.date);
                        return;
                      }

                      onSelectCell?.(cell);
                    }}
                    style={{
                      ...(cell.status === "closed" ? closedCellStyle : undefined),
                      ...mobilePeriodCellToneStyle,
                      height: scheduleRowHeight,
                      minHeight: scheduleRowHeight
                    }}
                    type="button"
                  >
                    {isPeriodGrid ? (
                      <HolidayCornerBadge
                        className={bookedAppointmentCount > 0 ? "left-1 right-auto" : undefined}
                        date={cell.date}
                      />
                    ) : null}
                    <p
                      className={cn(
                        hasPeriodTimeline
                          ? cn(
                              "whitespace-pre pr-2 font-normal tabular-nums",
                              bookedAppointmentCount > 0 && "pt-5",
                              isMobileSurface ? "text-[13px] leading-[16px]" : "text-[13px] leading-4"
                            )
                          : "text-xs font-black"
                      )}
                      title={hasPeriodTimeline ? periodWorkTimeLabel : translateText(cell.title, language)}
                    >
                      {hasPeriodTimeline ? periodWorkTimeLabel : translateText(cell.title, language)}
                    </p>
                    {hasPeriodTimeline ? (
                      bookedAppointmentCount > 0 ? (
                        <NotificationBadge className="absolute right-1 top-1 z-10" count={bookedAppointmentCount} size="sm" />
                      ) : null
                    ) : (
                      <p className="mt-2 text-[11px] leading-5 opacity-90">{translateText(cell.detail, language)}</p>
                    )}
                  </button>
                );
              })}
              </div>
            ))}
          </div>
        </div>
        {visibleRows.length === 0 ? (
          <div className="border-t border-line px-4 py-6 text-center text-sm font-bold text-ink/45">
            {translateText("没有符合筛选条件的排班记录。", language)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
