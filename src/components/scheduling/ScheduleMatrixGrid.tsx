import { useMemo, type CSSProperties } from "react";
import { ScheduleGrid } from "../../features/dispatch-center/components/ScheduleGrid";
import type { DispatchScheduleCell, DispatchScheduleGridData } from "../../features/dispatch-center/store";
import { cn } from "../../lib/utils";

export type ScheduleMatrixGridCell = {
  active: boolean;
  className?: string;
  disabled: boolean;
  hint: string;
  key: string;
  onClick?: () => void;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
  onMouseUp?: () => void;
  selected?: boolean;
};

export type ScheduleMatrixGridRow = {
  cells: ScheduleMatrixGridCell[];
  indexLabel: string;
  key: string;
  onSelect?: () => void;
  overtimeBlocked?: boolean;
  rest?: boolean;
  selected?: boolean;
  title: string;
};

type ScheduleMatrixGridProps = {
  activeCellLabel?: string;
  activeCellStatus?: Extract<DispatchScheduleCell["status"], "open" | "confirmed">;
  className?: string;
  headerBottomLabel?: string;
  headerTopLabel?: string;
  rows: ScheduleMatrixGridRow[];
  stickyColumnWidthPx?: number;
  stickyAxis?: boolean;
  onResizeActiveRange?: (rowIndex: number, startHour: number, endHour: number, nextStartHour: number, nextEndHour: number) => void;
};

const matrixThemeStyle = {
  "--matrix-surface": "var(--admin-surface, var(--client-surface))",
  "--matrix-elevated": "var(--admin-muted-surface, var(--client-elevated))",
  "--matrix-line": "var(--admin-line, var(--client-line))",
  "--matrix-text": "var(--admin-text, var(--client-text))",
  "--matrix-muted": "var(--admin-muted, var(--client-muted))",
  "--matrix-primary": "var(--admin-accent, var(--client-primary))",
  "--matrix-primary-strong": "var(--admin-accent-strong, var(--client-primary-strong, var(--admin-accent, var(--client-primary))))",
  "--matrix-primary-soft": "var(--client-primary-soft, color-mix(in srgb, var(--matrix-primary) 14%, transparent))"
} as CSSProperties;

export function getScheduleMatrixCellClassName(active: boolean, disabled: boolean) {
  if (disabled) {
    return "cursor-not-allowed";
  }

  if (active) {
    return "schedule-legend-badge schedule-legend-badge--available shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--matrix-primary)_18%,transparent)]";
  }

  return "border-line bg-[color:color-mix(in_srgb,var(--matrix-surface)_80%,transparent)] text-[color:var(--matrix-muted)] hover:border-[color:color-mix(in_srgb,var(--matrix-primary)_32%,transparent)] hover:text-[color:var(--matrix-primary-strong)]";
}

function buildMatrixCell({
  activeCellLabel,
  activeCellStatus,
  cell,
  hour,
  row,
  rowIndex
}: {
  activeCellLabel?: string;
  activeCellStatus: Extract<DispatchScheduleCell["status"], "open" | "confirmed">;
  cell: ScheduleMatrixGridCell;
  hour: number;
  row: ScheduleMatrixGridRow;
  rowIndex: number;
}): DispatchScheduleCell {
  const status = cell.disabled ? "closed" : cell.active ? activeCellStatus : "idle";
  const title = cell.active && activeCellLabel ? activeCellLabel : cell.hint;

  return {
    darkened: false,
    date: `matrix-row-${rowIndex + 1}`,
    detail: title,
    hour,
    id: `matrix-${row.key}-${cell.key}-${hour}`,
    isClickable: Boolean(cell.onClick || cell.onMouseDown),
    isCurrent: false,
    status,
    technicianId: row.key,
    technicianName: row.title,
    title
  };
}

export function ScheduleMatrixGrid({
  activeCellLabel,
  activeCellStatus = "open",
  className,
  headerBottomLabel = "/ 小时",
  headerTopLabel = "模板日",
  onResizeActiveRange,
  rows,
  stickyColumnWidthPx,
  stickyAxis = true
}: ScheduleMatrixGridProps) {
  void stickyAxis;
  const resolvedStickyColumnWidthPx = stickyColumnWidthPx ?? (headerTopLabel === "日期" ? 176 : 136);
  const actionCellMap = useMemo(() => {
    const next = new Map<string, ScheduleMatrixGridCell>();

    rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell, hour) => {
        next.set(`matrix-${row.key}-${cell.key}-${hour}`, cell);
      });
    });

    return next;
  }, [rows]);
  const gridData = useMemo<DispatchScheduleGridData>(() => ({
    cycle: null,
    dates: ["matrix"],
    headers: Array.from({ length: 24 }, (_, hour) => ({
      key: `matrix-hour-${hour}`,
      label: `${String(hour).padStart(2, "0")}:00`,
      sublabel: "1h"
    })),
    nowHour: -1,
    rows: rows.map((row, rowIndex) => ({
      cells: row.cells.map((cell, hour) => buildMatrixCell({ activeCellLabel, activeCellStatus, cell, hour, row, rowIndex })),
      scheduledHours: row.cells.filter((cell) => cell.active && !cell.disabled).length,
      technicianAvatar: "",
      technicianId: row.key,
      technicianName: row.title,
      technicianSubtitle: row.indexLabel
    }))
  }), [activeCellLabel, activeCellStatus, rows]);
  const rowMap = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);
  const stickyHeaderLabel = `${headerTopLabel} ${headerBottomLabel}`;

  return (
    <div className="mt-4" style={matrixThemeStyle}>
      <ScheduleGrid
        className={cn("rounded-[28px]", className)}
        compactHeader
        data={gridData}
        getDayCellAction={(cell) => {
          const actionCell = actionCellMap.get(cell.id);

          if (!actionCell) {
            return null;
          }

          return {
            className: cn(actionCell.selected && !actionCell.disabled && "ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--matrix-primary)_24%,transparent)]"),
            onClick: actionCell.onClick,
            onMouseDown: actionCell.onMouseDown,
            onMouseEnter: actionCell.onMouseEnter,
            onMouseUp: actionCell.onMouseUp,
            title: actionCell.hint
          };
        }}
        onResizeDayPrimaryRange={onResizeActiveRange
          ? ({ rowIndex, startIndex, endIndex, nextStartIndex, nextEndIndex }) =>
              onResizeActiveRange(rowIndex, startIndex, endIndex, nextStartIndex, nextEndIndex)
          : undefined}
        renderRowHeader={(scheduleRow) => {
          const row = rowMap.get(scheduleRow.technicianId);

          if (!row) {
            return null;
          }

          return (
            <button
              className={cn(
                "absolute inset-0 z-10 flex flex-col items-start justify-center px-4 py-3 text-left transition",
                row.selected
                  ? "bg-[color:color-mix(in_srgb,var(--matrix-primary)_20%,var(--client-schedule-sticky-bg,var(--matrix-elevated)))] text-[color:var(--matrix-primary-strong)]"
                  : "text-ink hover:text-[color:var(--matrix-primary-strong)]"
              )}
              onClick={row.onSelect}
              type="button"
            >
              <span className="block text-xs font-black uppercase tracking-[0.16em] text-ink/45">{row.indexLabel}</span>
              <span className="mt-2 block max-w-full truncate text-base font-black">{row.title}</span>
              {row.overtimeBlocked ? (
                <span className="absolute right-1.5 top-1.5 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--matrix-primary-soft)] px-1 text-[9px] font-black leading-none text-[color:var(--matrix-primary-strong)] shadow-[0_6px_14px_color-mix(in_srgb,var(--client-bg)_24%,transparent)]">禁</span>
              ) : null}
              {row.rest ? (
                <span className="absolute right-1.5 top-1.5 z-20 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--client-accent)] px-1 text-[10px] font-black leading-none text-[color:var(--client-bg)] shadow-[0_6px_14px_color-mix(in_srgb,var(--client-accent)_28%,transparent)]">休</span>
              ) : null}
            </button>
          );
        }}
        showActualWorkStatus={false}
        stickyColumnWidthPx={resolvedStickyColumnWidthPx}
        stickyHeaderLabel={stickyHeaderLabel}
        stickyTop="0px"
        surface="mobile"
      />
    </div>
  );
}
