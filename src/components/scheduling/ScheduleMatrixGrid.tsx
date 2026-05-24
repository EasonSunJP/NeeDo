import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { DispatchScheduleCell } from "../../features/dispatch-center/store";
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
  onPaint?: (active: boolean) => void;
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

type ActiveRange = {
  endHour: number;
  key: string;
  row: ScheduleMatrixGridRow;
  rowIndex: number;
  startHour: number;
  title: string;
};

type ResizeSession = {
  edge: "start" | "end";
  endHour: number;
  key: string;
  pointerId: number;
  rowIndex: number;
  startHour: number;
  startY: number;
};

type ResizePreview = {
  endHour: number;
  key: string;
  startHour: number;
};

type PaintSession = {
  hour: number;
  nextActive: boolean;
  pointerId: number;
  positionKey: string;
  rowIndex: number;
};

type MatrixCellPosition = {
  hour: number;
  rowIndex: number;
};

type MatrixCellRange = {
  endHour: number;
  key: string;
  rowIndex: number;
  startHour: number;
};

const matrixThemeStyle = {
  "--matrix-surface": "var(--admin-surface, var(--client-surface))",
  "--matrix-elevated": "var(--admin-muted-surface, var(--client-elevated))",
  "--matrix-line": "var(--admin-line, var(--client-line))",
  "--matrix-text": "var(--admin-text, var(--client-text))",
  "--matrix-muted": "var(--admin-muted, var(--client-muted))",
  "--matrix-primary": "var(--admin-accent, var(--client-primary))",
  "--matrix-primary-strong": "var(--admin-accent-strong, var(--client-primary-strong, var(--admin-accent, var(--client-primary))))",
  "--matrix-primary-soft": "var(--client-primary-soft, color-mix(in srgb, var(--matrix-primary) 14%, transparent))",
  "--matrix-header-chip-bg": "color-mix(in srgb, var(--matrix-elevated) 92%, var(--matrix-surface) 8%)",
  "--matrix-header-chip-selected-bg": "color-mix(in srgb, var(--matrix-primary) 20%, var(--matrix-elevated) 80%)",
  "--matrix-danger": "var(--admin-danger, var(--client-accent, #ef5b55))",
  "--matrix-on-danger": "var(--admin-danger-contrast, #ffffff)",
  "--matrix-disabled-bg": "color-mix(in srgb, var(--matrix-muted) 14%, var(--matrix-elevated) 86%)"
} as CSSProperties;

const matrixThemeVariableNames = [
  "--matrix-surface",
  "--matrix-elevated",
  "--matrix-line",
  "--matrix-text",
  "--matrix-muted",
  "--matrix-primary",
  "--matrix-primary-strong",
  "--matrix-primary-soft",
  "--matrix-header-chip-bg",
  "--matrix-header-chip-selected-bg",
  "--matrix-danger",
  "--matrix-on-danger",
  "--matrix-disabled-bg"
] as const;

const matrixHourRowHeight = 74;
const matrixLaneWidth = 144;
const defaultTimeColumnWidth = 76;

function readMatrixThemeStyle(element: HTMLElement) {
  const computedStyle = getComputedStyle(element);
  const style: Record<string, string> = {};

  matrixThemeVariableNames.forEach((variableName) => {
    const value = computedStyle.getPropertyValue(variableName).trim();

    if (value) {
      style[variableName] = value;
    }
  });

  return style as CSSProperties;
}

function isSameMatrixThemeStyle(current: CSSProperties, next: CSSProperties) {
  return matrixThemeVariableNames.every((variableName) => (
    current[variableName as keyof CSSProperties] === next[variableName as keyof CSSProperties]
  ));
}

export function getScheduleMatrixCellClassName(active: boolean, disabled: boolean) {
  if (disabled) {
    return "cursor-not-allowed";
  }

  if (active) {
    return "schedule-legend-badge schedule-legend-badge--available shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--matrix-primary)_18%,transparent)]";
  }

  return "border-line bg-[color:color-mix(in_srgb,var(--matrix-surface)_80%,transparent)] text-[color:var(--matrix-muted)] hover:border-[color:color-mix(in_srgb,var(--matrix-primary)_32%,transparent)] hover:text-[color:var(--matrix-primary-strong)]";
}

function formatHour(hour: number) {
  return `${String(Math.min(hour, 24)).padStart(2, "0")}:00`;
}

function clampHour(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildActiveRanges(rows: ScheduleMatrixGridRow[], activeCellLabel?: string) {
  return rows.flatMap((row, rowIndex) => {
    const ranges: ActiveRange[] = [];
    let startHour: number | null = null;

    for (let hour = 0; hour <= 24; hour += 1) {
      const cell = row.cells[hour];
      const active = Boolean(cell?.active && !cell.disabled);

      if (active && startHour == null) {
        startHour = hour;
      }

      if ((!active || hour === 24) && startHour != null) {
        const endHour = hour;
        const representative = row.cells[startHour];
        ranges.push({
          endHour,
          key: `${row.key}-${startHour}-${endHour}`,
          row,
          rowIndex,
          startHour,
          title: activeCellLabel ?? representative?.hint ?? row.title
        });
        startHour = null;
      }
    }

    return ranges;
  });
}

function buildCellRanges(
  rows: ScheduleMatrixGridRow[],
  predicate: (row: ScheduleMatrixGridRow, cell: ScheduleMatrixGridCell, hour: number) => boolean,
  keyPrefix: string
) {
  return rows.flatMap((row, rowIndex) => {
    const ranges: MatrixCellRange[] = [];
    let startHour: number | null = null;

    for (let hour = 0; hour <= 24; hour += 1) {
      const cell = row.cells[hour];
      const active = Boolean(cell && hour < 24 && predicate(row, cell, hour));

      if (active && startHour == null) {
        startHour = hour;
      }

      if ((!active || hour === 24) && startHour != null) {
        ranges.push({
          endHour: hour,
          key: `${keyPrefix}-${row.key}-${startHour}-${hour}`,
          rowIndex,
          startHour
        });
        startHour = null;
      }
    }

    return ranges;
  });
}

function getMatrixCellPosition(element: HTMLElement, clientX: number, clientY: number, rows: ScheduleMatrixGridRow[]) {
  const rect = element.getBoundingClientRect();
  const rowIndex = Math.floor((clientX - rect.left) / matrixLaneWidth);
  const hour = Math.floor((clientY - rect.top) / matrixHourRowHeight);

  if (rowIndex < 0 || rowIndex >= rows.length || hour < 0 || hour >= 24) {
    return null;
  }

  return { hour, rowIndex } satisfies MatrixCellPosition;
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
  void activeCellStatus;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const paintSessionRef = useRef<PaintSession | null>(null);
  const ignoreNextCellClickRef = useRef(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [floatingHeaderFrame, setFloatingHeaderFrame] = useState({ left: 0, top: 0, width: 0, visible: false });
  const [floatingThemeStyle, setFloatingThemeStyle] = useState<CSSProperties>(matrixThemeStyle);
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);
  const timeColumnWidth = Math.min(Math.max(stickyColumnWidthPx ?? defaultTimeColumnWidth, 68), 104);
  const canvasWidth = Math.max(matrixLaneWidth, rows.length * matrixLaneWidth);
  const totalHeight = 24 * matrixHourRowHeight;
  const activeRanges = useMemo(() => buildActiveRanges(rows, activeCellLabel), [activeCellLabel, rows]);
  const disabledRanges = useMemo(() => buildCellRanges(rows, (_row, cell) => cell.disabled, "disabled"), [rows]);
  const selectedColumnRanges = useMemo(() => buildCellRanges(rows, (row) => Boolean(row.selected), "selected"), [rows]);
  const renderedActiveRanges = useMemo(() => activeRanges.map((range) => (
    resizePreview?.key === range.key
      ? { ...range, startHour: resizePreview.startHour, endHour: resizePreview.endHour }
      : range
  )), [activeRanges, resizePreview]);
  const rootMinWidth = timeColumnWidth + canvasWidth;
  const topLabel = `${headerTopLabel} ${headerBottomLabel}`;

  useEffect(() => {
    const root = rootRef.current;

    if (!root || typeof window === "undefined") {
      return;
    }

    const nextFloatingThemeStyle = readMatrixThemeStyle(root);
    setFloatingThemeStyle((current) => (
      isSameMatrixThemeStyle(current, nextFloatingThemeStyle) ? current : nextFloatingThemeStyle
    ));
  }, [rows.length, stickyAxis]);

  const updateFloatingHeaderFrame = useCallback(() => {
    if (!stickyAxis || typeof window === "undefined" || typeof document === "undefined") {
      setFloatingHeaderFrame((current) => (current.visible ? { ...current, visible: false } : current));
      return;
    }

    const root = rootRef.current;
    const header = headerRef.current;

    if (!root || !header) {
      setFloatingHeaderFrame((current) => (current.visible ? { ...current, visible: false } : current));
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const topFixedLayerBottom = Array.from(document.querySelectorAll<HTMLElement>(".fixed, .client-sticky-control-panel")).reduce((bottom, element) => {
      if (element.hasAttribute("data-matrix-floating-header")) {
        return bottom;
      }
      if (root.contains(element)) {
        return bottom;
      }

      const rect = element.getBoundingClientRect();
      if (rect.top > 18 || rect.bottom < 48 || rect.bottom > viewportHeight * 0.45) {
        return bottom;
      }

      return Math.max(bottom, rect.bottom);
    }, 0);
    const scheduleStickyTop = Number.parseFloat(getComputedStyle(root).getPropertyValue("--client-schedule-substicky-top"));
    const fallbackTop = Number.isFinite(scheduleStickyTop) ? scheduleStickyTop : 92;
    const top = Math.round(Math.max(fallbackTop, topFixedLayerBottom > 0 ? topFixedLayerBottom + 8 : 0));
    const left = Math.max(12, Math.round(rootRect.left));
    const right = Math.min(window.innerWidth - 12, Math.round(rootRect.right));
    const width = Math.max(0, right - left);
    const visible = headerRect.top <= top + 6 && rootRect.bottom > top + 86 && rootRect.top < viewportHeight - 120 && width > timeColumnWidth + 80;
    const nextFrame = { left, top, width, visible };

    setFloatingHeaderFrame((current) => (
      current.left === nextFrame.left &&
      current.top === nextFrame.top &&
      current.width === nextFrame.width &&
      current.visible === nextFrame.visible
        ? current
        : nextFrame
    ));
  }, [stickyAxis, timeColumnWidth]);

  useEffect(() => {
    if (!stickyAxis || typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    let frameId = 0;
    const requestFrame = () => {
      if (frameId) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateFloatingHeaderFrame();
      });
    };

    requestFrame();
    const scrollOptions = { capture: true, passive: true } as AddEventListenerOptions;
    document.addEventListener("scroll", requestFrame, scrollOptions);
    window.addEventListener("resize", requestFrame);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      document.removeEventListener("scroll", requestFrame, true);
      window.removeEventListener("resize", requestFrame);
    };
  }, [stickyAxis, updateFloatingHeaderFrame]);

  const getResizeBounds = (session: ResizeSession, clientY: number) => {
    const deltaHours = Math.round((clientY - session.startY) / matrixHourRowHeight);
    const nextStartHour = session.edge === "start"
      ? clampHour(session.startHour + deltaHours, 0, session.endHour - 1)
      : session.startHour;
    const nextEndHour = session.edge === "end"
      ? clampHour(session.endHour + deltaHours, session.startHour + 1, 24)
      : session.endHour;

    return { nextEndHour, nextStartHour };
  };

  const setResizePreviewFromClientY = (session: ResizeSession, clientY: number) => {
    const { nextEndHour, nextStartHour } = getResizeBounds(session, clientY);

    setResizePreview((current) => (
      current?.key === session.key && current.startHour === nextStartHour && current.endHour === nextEndHour
        ? current
        : { endHour: nextEndHour, key: session.key, startHour: nextStartHour }
    ));
  };

  const commitResizeFromClientY = (session: ResizeSession, clientY: number) => {
    if (!onResizeActiveRange) {
      return;
    }

    const { nextEndHour, nextStartHour } = getResizeBounds(session, clientY);

    if (nextStartHour !== session.startHour || nextEndHour !== session.endHour) {
      onResizeActiveRange(session.rowIndex, session.startHour, session.endHour, nextStartHour, nextEndHour);
    }
  };

  useEffect(() => {
    if (!onResizeActiveRange || typeof window === "undefined") {
      return undefined;
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      const session = resizeSessionRef.current;

      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      setResizePreviewFromClientY(session, event.clientY);
    };

    const handleWindowPointerEnd = (event: PointerEvent) => {
      const session = resizeSessionRef.current;

      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      commitResizeFromClientY(session, event.clientY);
      resizeSessionRef.current = null;
      setResizePreview(null);
    };

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", handleWindowPointerEnd, { passive: false });
    window.addEventListener("pointercancel", handleWindowPointerEnd, { passive: false });

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerEnd);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
    };
  }, [onResizeActiveRange]);

  const handleResizePointerDown = (
    range: ActiveRange,
    edge: ResizeSession["edge"],
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!onResizeActiveRange) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    resizeSessionRef.current = {
      edge,
      endHour: range.endHour,
      key: range.key,
      pointerId: event.pointerId,
      rowIndex: range.rowIndex,
      startHour: range.startHour,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setResizePreview({ endHour: range.endHour, key: range.key, startHour: range.startHour });
  };

  const updateResizePreview = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = resizeSessionRef.current;

    if (!session) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setResizePreviewFromClientY(session, event.clientY);
  };

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = resizeSessionRef.current;

    if (!session || !onResizeActiveRange) {
      return;
    }

    commitResizeFromClientY(session, event.clientY);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeSessionRef.current = null;
    setResizePreview(null);
  };

  const cancelResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeSessionRef.current = null;
    setResizePreview(null);
  };

  const paintCell = (position: MatrixCellPosition, nextActive: boolean) => {
    const row = rows[position.rowIndex];
    const cell = row?.cells[position.hour];

    if (!row || !cell || cell.disabled) {
      return;
    }

    if (cell.onPaint) {
      cell.onPaint(nextActive);
      return;
    }

    cell.onMouseDown?.();
  };

  const finishCellPaint = (position?: MatrixCellPosition) => {
    if (!position) {
      return;
    }

    rows[position.rowIndex]?.cells[position.hour]?.onMouseUp?.();
  };

  const handleCellLayerClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (ignoreNextCellClickRef.current) {
      ignoreNextCellClickRef.current = false;
      return;
    }

    const position = getMatrixCellPosition(event.currentTarget, event.clientX, event.clientY, rows);

    if (!position) {
      return;
    }

    const row = rows[position.rowIndex];
    const cell = row?.cells[position.hour];

    if (!row || !cell) {
      return;
    }

    if (cell.disabled) {
      row.onSelect?.();
      return;
    }

    if (cell.onPaint) {
      cell.onPaint(!cell.active);
      return;
    }

    cell.onClick?.();
    cell.onMouseDown?.();
    cell.onMouseUp?.();
  };

  const handleCellPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    const position = getMatrixCellPosition(event.currentTarget, event.clientX, event.clientY, rows);
    const row = position ? rows[position.rowIndex] : undefined;
    const cell = position ? row?.cells[position.hour] : undefined;

    if (!position || !row || !cell || cell.disabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const nextActive = !cell.active;
    paintSessionRef.current = {
      hour: position.hour,
      nextActive,
      pointerId: event.pointerId,
      positionKey: `${position.rowIndex}-${position.hour}`,
      rowIndex: position.rowIndex
    };
    ignoreNextCellClickRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    paintCell(position, nextActive);
  };

  const handleCellPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = paintSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const position = getMatrixCellPosition(event.currentTarget, event.clientX, event.clientY, rows);
    const positionKey = position ? `${position.rowIndex}-${position.hour}` : "";

    if (!position || positionKey === session.positionKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    paintSessionRef.current = { ...session, hour: position.hour, positionKey, rowIndex: position.rowIndex };
    paintCell(position, session.nextActive);
  };

  const handleCellPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = paintSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    finishCellPaint({ hour: session.hour, rowIndex: session.rowIndex });
    paintSessionRef.current = null;
  };

  const renderAxisHeaderTag = (floating = false) => (
    <div
      className={cn(
        "flex items-center justify-center px-1",
        floating ? "min-h-[54px]" : "sticky left-0 z-[22] min-h-[72px] border-r border-[color:color-mix(in_srgb,var(--matrix-line)_58%,transparent)]"
      )}
    >
      <span
        className={cn(
          "inline-flex max-w-full items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--matrix-line)_68%,transparent)] bg-[color:var(--matrix-header-chip-bg)] px-2.5 text-center text-[10px] font-black leading-tight text-[color:var(--matrix-text)] shadow-[0_8px_14px_rgba(0,0,0,0.14)]",
          floating ? "min-h-9" : "min-h-10"
        )}
      >
        {topLabel}
      </span>
    </div>
  );

  const renderLaneHeaderButton = (row: ScheduleMatrixGridRow, floating = false) => (
    <button
      className={cn(
        "focus-ring relative flex min-w-0 items-center justify-center text-left transition",
        floating ? "pointer-events-auto min-h-[54px] px-1.5 py-1" : "min-h-[72px] border-r border-[color:color-mix(in_srgb,var(--matrix-line)_40%,transparent)] px-2 py-2 last:border-r-0 hover:bg-[color:color-mix(in_srgb,var(--matrix-primary-soft)_24%,transparent)]"
      )}
      key={row.key}
      onClick={row.onSelect}
      type="button"
    >
      <span
        className={cn(
          "relative flex w-full max-w-[112px] flex-col justify-center rounded-[18px] border px-3 text-left shadow-[0_8px_16px_rgba(0,0,0,0.12)] transition",
          floating ? "min-h-11" : "min-h-12",
          row.selected
            ? "border-[color:color-mix(in_srgb,var(--matrix-primary)_62%,var(--matrix-line)_38%)] bg-[color:var(--matrix-header-chip-selected-bg)] text-[color:var(--matrix-primary-strong)] shadow-[0_14px_28px_color-mix(in_srgb,var(--matrix-primary)_20%,transparent)]"
            : "border-[color:color-mix(in_srgb,var(--matrix-line)_68%,transparent)] bg-[color:var(--matrix-header-chip-bg)] text-[color:var(--matrix-text)]"
        )}
      >
        <span className={cn("text-[10px] font-black uppercase tracking-[0.12em]", row.selected ? "text-[color:var(--matrix-primary-strong)]" : "text-[color:var(--matrix-muted)]")}>{row.indexLabel}</span>
        <strong className="mt-0.5 block max-w-full truncate text-[14px] font-black leading-5">{row.title}</strong>
      </span>
      {row.overtimeBlocked ? (
        <span className="absolute right-3 top-2 z-10 grid h-5 min-w-5 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--matrix-primary)_42%,transparent)] bg-[color:var(--matrix-primary-soft)] px-1 text-[9px] font-black leading-none text-[color:var(--matrix-primary-strong)]">禁</span>
      ) : null}
      {row.rest ? (
        <span className="absolute right-3 top-2 z-20 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--matrix-danger)] px-1 text-[10px] font-black leading-none text-[color:var(--matrix-on-danger)] shadow-[0_8px_18px_color-mix(in_srgb,var(--matrix-danger)_24%,transparent)]">休</span>
      ) : null}
    </button>
  );

  const floatingHeader = floatingHeaderFrame.visible ? (
    <div
      className="pointer-events-none fixed z-[140]"
      data-matrix-floating-header="true"
      style={{ left: floatingHeaderFrame.left, top: floatingHeaderFrame.top, width: floatingHeaderFrame.width, ...matrixThemeStyle, ...floatingThemeStyle }}
    >
      <div className="grid" style={{ gridTemplateColumns: `${timeColumnWidth}px minmax(0,1fr)` }}>
        {renderAxisHeaderTag(true)}
        <div className="overflow-hidden">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, ${matrixLaneWidth}px)`,
              minWidth: canvasWidth,
              transform: `translateX(${-scrollLeft}px)`
            }}
          >
            {rows.length > 0 ? rows.map((row) => renderLaneHeaderButton(row, true)) : (
              <div className="flex min-h-[54px] items-center px-3 text-sm font-black text-[color:var(--matrix-muted)]">暂无模板日</div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className={cn("mt-4", className)} data-schedule-matrix-root="true" ref={rootRef} style={matrixThemeStyle}>
      {floatingHeader ? (typeof document === "undefined" ? floatingHeader : createPortal(floatingHeader, document.body)) : null}
      <div className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--matrix-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_92%,transparent)] shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
        <div
          className="scrollbar-none overflow-x-auto overscroll-x-contain"
          onScroll={(event) => {
            setScrollLeft(event.currentTarget.scrollLeft);
            updateFloatingHeaderFrame();
          }}
        >
          <div style={{ minWidth: rootMinWidth }}>
            <div
              className={cn(
                "grid border-b border-[color:color-mix(in_srgb,var(--matrix-line)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-surface)_70%,transparent)]",
                stickyAxis && "sticky top-0 z-20"
              )}
              ref={headerRef}
              style={{ gridTemplateColumns: `${timeColumnWidth}px ${canvasWidth}px` }}
            >
              {renderAxisHeaderTag()}
              <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, ${matrixLaneWidth}px)` }}>
                {rows.length > 0 ? rows.map((row) => renderLaneHeaderButton(row)) : (
                  <div className="flex min-h-[72px] items-center px-3 text-sm font-black text-[color:var(--matrix-muted)]">暂无模板日</div>
                )}
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: `${timeColumnWidth}px ${canvasWidth}px` }}>
              <div className="sticky left-0 z-[12] border-r border-[color:color-mix(in_srgb,var(--matrix-line)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_94%,transparent)] shadow-[12px_0_18px_rgba(0,0,0,0.10)]">
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    className="flex items-start justify-center border-b border-[color:color-mix(in_srgb,var(--matrix-line)_54%,transparent)] px-1 pt-2 last:border-b-0"
                    key={hour}
                    style={{ height: matrixHourRowHeight }}
                  >
                    <span className="inline-flex h-6 min-w-[50px] items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--matrix-line)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_82%,transparent)] px-1 text-[10px] font-black leading-none text-[color:var(--matrix-muted)] shadow-[0_8px_16px_rgba(0,0,0,0.12)]">
                      {formatHour(hour)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="relative" style={{ height: totalHeight, width: canvasWidth }}>
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    className="absolute inset-x-0 border-b border-[color:color-mix(in_srgb,var(--matrix-line)_46%,transparent)]"
                    key={`hour-line-${hour}`}
                    style={{ top: hour * matrixHourRowHeight, height: matrixHourRowHeight }}
                  />
                ))}

                {rows.map((row, rowIndex) => (
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 border-l border-[color:color-mix(in_srgb,var(--matrix-line)_38%,transparent)]"
                    key={`lane-line-${row.key}`}
                    style={{ left: rowIndex * matrixLaneWidth }}
                  />
                ))}

                {selectedColumnRanges.map((range) => (
                  <div
                    className="pointer-events-none absolute z-[1] bg-[color:color-mix(in_srgb,var(--matrix-primary-soft)_32%,transparent)]"
                    key={range.key}
                    style={{
                      bottom: 0,
                      left: range.rowIndex * matrixLaneWidth,
                      top: 0,
                      width: matrixLaneWidth
                    }}
                  />
                ))}

                {disabledRanges.map((range) => (
                  <div
                    className="pointer-events-none absolute z-[2] bg-[color:var(--matrix-disabled-bg)] opacity-70"
                    key={range.key}
                    style={{
                      height: (range.endHour - range.startHour) * matrixHourRowHeight,
                      left: range.rowIndex * matrixLaneWidth,
                      top: range.startHour * matrixHourRowHeight,
                      width: matrixLaneWidth
                    }}
                  />
                ))}

                {rows.map((row, rowIndex) => row.rest ? (
                  <button
                    aria-label={`${row.title} 定休日设置`}
                    className="absolute bottom-0 top-0 z-[5] flex items-start justify-center border-l border-r border-[color:color-mix(in_srgb,var(--matrix-line)_34%,transparent)] bg-[color:var(--matrix-disabled-bg)] px-2 pt-3 text-[11px] font-black text-[color:color-mix(in_srgb,var(--matrix-muted)_88%,transparent)] transition hover:text-[color:var(--matrix-primary-strong)]"
                    key={`rest-overlay-${row.key}`}
                    onClick={row.onSelect}
                    style={{ left: rowIndex * matrixLaneWidth, width: matrixLaneWidth }}
                    type="button"
                  >
                    定休日
                  </button>
                ) : null)}

                <div
                  aria-label="时间格选择区域"
                  className="absolute inset-0 z-[4] cursor-pointer touch-auto"
                  onClick={handleCellLayerClick}
                  onPointerCancel={handleCellPointerEnd}
                  onPointerDown={handleCellPointerDown}
                  onPointerMove={handleCellPointerMove}
                  onPointerUp={handleCellPointerEnd}
                  role="grid"
                />

                {renderedActiveRanges.map((range) => (
                  <div
                    className="pointer-events-none absolute z-10 overflow-visible rounded-[16px] border border-[color:color-mix(in_srgb,var(--matrix-primary)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-primary)_18%,var(--matrix-surface)_82%)] px-3 py-2 text-[color:var(--matrix-primary-strong)] shadow-[0_10px_18px_color-mix(in_srgb,var(--matrix-primary)_10%,transparent)]"
                    key={range.key}
                    style={{
                      height: Math.max((range.endHour - range.startHour) * matrixHourRowHeight - 14, 52),
                      left: range.rowIndex * matrixLaneWidth + 8,
                      top: range.startHour * matrixHourRowHeight + 7,
                      width: matrixLaneWidth - 16
                    }}
                  >
                    {onResizeActiveRange ? (
                      <>
                        <button
                          aria-label="向上拉伸开始时间"
                          className="pointer-events-auto absolute left-1/2 top-0 z-30 grid h-7 w-24 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full text-[color:var(--matrix-primary)]"
                          onPointerCancel={cancelResize}
                          onPointerDown={(event) => handleResizePointerDown(range, "start", event)}
                          onPointerMove={updateResizePreview}
                          onPointerUp={finishResize}
                          type="button"
                        >
                          <span className="h-1.5 w-16 rounded-full border border-[color:color-mix(in_srgb,var(--matrix-primary)_70%,white_30%)] bg-[color:var(--matrix-primary)] shadow-[0_0_10px_color-mix(in_srgb,var(--matrix-primary)_28%,transparent)]" />
                        </button>
                        <button
                          aria-label="向下拉伸结束时间"
                          className="pointer-events-auto absolute bottom-0 left-1/2 z-30 grid h-7 w-24 -translate-x-1/2 translate-y-1/2 touch-none place-items-center rounded-full text-[color:var(--matrix-primary)]"
                          onPointerCancel={cancelResize}
                          onPointerDown={(event) => handleResizePointerDown(range, "end", event)}
                          onPointerMove={updateResizePreview}
                          onPointerUp={finishResize}
                          type="button"
                        >
                          <span className="h-1.5 w-16 rounded-full border border-[color:color-mix(in_srgb,var(--matrix-primary)_70%,white_30%)] bg-[color:var(--matrix-primary)] shadow-[0_0_10px_color-mix(in_srgb,var(--matrix-primary)_28%,transparent)]" />
                        </button>
                      </>
                    ) : null}
                    <div className="flex h-full min-w-0 flex-col justify-center">
                      <strong className="block truncate text-[12px] font-black leading-[14px]">{range.title}</strong>
                      <span className="mt-0.5 block truncate text-[10px] font-bold leading-[12px] opacity-80">
                        {formatHour(range.startHour)} - {formatHour(range.endHour)}
                      </span>
                    </div>
                  </div>
                ))}

                {rows.length === 0 ? (
                  <div className="absolute inset-x-4 top-4 rounded-[18px] border border-dashed border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_88%,transparent)] px-4 py-5 text-center text-sm font-black text-[color:var(--matrix-muted)]">
                    暂无可排班对象
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
