import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
  rowIndex: number;
  startHour: number;
  startY: number;
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
  "--matrix-disabled-bg": "color-mix(in srgb, var(--matrix-muted) 14%, var(--matrix-elevated) 86%)"
} as CSSProperties;

const matrixHourRowHeight = 74;
const matrixLaneWidth = 144;
const defaultTimeColumnWidth = 76;

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
  const [scrollLeft, setScrollLeft] = useState(0);
  const [floatingHeaderFrame, setFloatingHeaderFrame] = useState({ left: 0, top: 0, width: 0, visible: false });
  const timeColumnWidth = Math.min(Math.max(stickyColumnWidthPx ?? defaultTimeColumnWidth, 68), 104);
  const canvasWidth = Math.max(matrixLaneWidth, rows.length * matrixLaneWidth);
  const totalHeight = 24 * matrixHourRowHeight;
  const activeRanges = useMemo(() => buildActiveRanges(rows, activeCellLabel), [activeCellLabel, rows]);
  const rootMinWidth = timeColumnWidth + canvasWidth;
  const topLabel = `${headerTopLabel} ${headerBottomLabel}`;

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
    const topFixedLayerBottom = Array.from(document.querySelectorAll<HTMLElement>(".fixed")).reduce((bottom, element) => {
      if (element.hasAttribute("data-matrix-floating-header")) {
        return bottom;
      }

      const rect = element.getBoundingClientRect();
      if (rect.top > 12 || rect.bottom < 48 || rect.bottom > viewportHeight * 0.36) {
        return bottom;
      }

      return Math.max(bottom, rect.bottom);
    }, 0);
    const top = topFixedLayerBottom > 0 ? Math.round(topFixedLayerBottom + 8) : 92;
    const left = Math.max(12, Math.round(rootRect.left));
    const right = Math.min(window.innerWidth - 12, Math.round(rootRect.right));
    const width = Math.max(0, right - left);
    const visible = headerRect.bottom <= top + 6 && rootRect.bottom > top + 86 && rootRect.top < viewportHeight - 120 && width > timeColumnWidth + 80;
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
      rowIndex: range.rowIndex,
      startHour: range.startHour,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = resizeSessionRef.current;

    if (!session || !onResizeActiveRange) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaHours = Math.round((event.clientY - session.startY) / matrixHourRowHeight);
    const nextStartHour = session.edge === "start"
      ? clampHour(session.startHour + deltaHours, 0, session.endHour - 1)
      : session.startHour;
    const nextEndHour = session.edge === "end"
      ? clampHour(session.endHour + deltaHours, session.startHour + 1, 24)
      : session.endHour;

    if (nextStartHour !== session.startHour || nextEndHour !== session.endHour) {
      onResizeActiveRange(session.rowIndex, session.startHour, session.endHour, nextStartHour, nextEndHour);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeSessionRef.current = null;
  };

  const cancelResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeSessionRef.current = null;
  };

  const renderLaneHeaderButton = (row: ScheduleMatrixGridRow, floating = false) => (
    <button
      className={cn(
        "focus-ring relative flex min-w-0 flex-col justify-center border-r border-[color:color-mix(in_srgb,var(--matrix-line)_46%,transparent)] px-3 py-2 text-left transition last:border-r-0",
        floating ? "min-h-[60px]" : "min-h-[72px]",
        row.selected
          ? "bg-[color:color-mix(in_srgb,var(--matrix-primary)_20%,var(--matrix-elevated))] text-[color:var(--matrix-primary-strong)]"
          : "text-[color:var(--matrix-text)] hover:bg-[color:color-mix(in_srgb,var(--matrix-primary-soft)_42%,transparent)]"
      )}
      key={row.key}
      onClick={row.onSelect}
      type="button"
    >
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--matrix-muted)]">{row.indexLabel}</span>
      <strong className="mt-1 block max-w-full truncate text-[15px] font-black">{row.title}</strong>
      {row.overtimeBlocked ? (
        <span className="absolute right-2 top-2 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--matrix-primary-soft)] px-1 text-[9px] font-black leading-none text-[color:var(--matrix-primary-strong)]">禁</span>
      ) : null}
      {row.rest ? (
        <span className="absolute right-2 top-2 z-20 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--client-accent)] px-1 text-[10px] font-black leading-none text-[color:var(--client-bg)]">休</span>
      ) : null}
    </button>
  );

  return (
    <div className={cn("mt-4", className)} ref={rootRef} style={matrixThemeStyle}>
      {floatingHeaderFrame.visible ? (
        <div
          className="fixed z-[70] overflow-hidden rounded-[20px] border border-[color:color-mix(in_srgb,var(--matrix-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_94%,transparent)] shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-xl"
          data-matrix-floating-header="true"
          style={{ left: floatingHeaderFrame.left, top: floatingHeaderFrame.top, width: floatingHeaderFrame.width }}
        >
          <div className="grid" style={{ gridTemplateColumns: `${timeColumnWidth}px minmax(0,1fr)` }}>
            <div className="flex items-center justify-center border-r border-[color:color-mix(in_srgb,var(--matrix-line)_58%,transparent)] px-1 text-center text-[10px] font-black leading-tight text-[color:var(--matrix-muted)]">
              {topLabel}
            </div>
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
                  <div className="flex min-h-[60px] items-center px-3 text-sm font-black text-[color:var(--matrix-muted)]">暂无模板日</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
                "grid border-b border-[color:color-mix(in_srgb,var(--matrix-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_96%,transparent)]",
                stickyAxis && "sticky top-0 z-20"
              )}
              ref={headerRef}
              style={{ gridTemplateColumns: `${timeColumnWidth}px ${canvasWidth}px` }}
            >
              <div className="sticky left-0 z-[22] flex items-center justify-center border-r border-[color:color-mix(in_srgb,var(--matrix-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_96%,transparent)] px-1 text-center text-[10px] font-black leading-tight text-[color:var(--matrix-muted)]">
                {topLabel}
              </div>
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

                {rows.flatMap((row, rowIndex) =>
                  row.cells.map((cell, hour) => (
                    <button
                      aria-label={cell.hint}
                      className={cn(
                        "absolute z-[4] border-b border-r border-[color:color-mix(in_srgb,var(--matrix-line)_26%,transparent)] transition focus:z-20 focus:outline-none",
                        cell.disabled
                          ? "cursor-pointer bg-[color:var(--matrix-disabled-bg)] opacity-70"
                          : "hover:bg-[color:color-mix(in_srgb,var(--matrix-primary-soft)_42%,transparent)] active:bg-[color:color-mix(in_srgb,var(--matrix-primary-soft)_64%,transparent)]",
                        cell.selected && !cell.disabled && "bg-[color:color-mix(in_srgb,var(--matrix-primary-soft)_42%,transparent)]"
                      )}
                      aria-disabled={cell.disabled}
                      key={`${row.key}-${cell.key}-${hour}`}
                      onClick={() => {
                        if (cell.disabled) {
                          row.onSelect?.();
                          return;
                        }
                        cell.onClick?.();
                      }}
                      onMouseDown={(event) => {
                        if (cell.disabled) {
                          event.preventDefault();
                          return;
                        }
                        event.preventDefault();
                        cell.onMouseDown?.();
                      }}
                      onMouseEnter={() => {
                        if (!cell.disabled) {
                          cell.onMouseEnter?.();
                        }
                      }}
                      onMouseUp={() => cell.onMouseUp?.()}
                      style={{
                        height: matrixHourRowHeight,
                        left: rowIndex * matrixLaneWidth,
                        top: hour * matrixHourRowHeight,
                        width: matrixLaneWidth
                      }}
                      title={cell.hint}
                      type="button"
                    />
                  ))
                )}

                {activeRanges.map((range) => (
                  <div
                    className="pointer-events-none absolute z-10 overflow-visible rounded-[16px] border border-[color:color-mix(in_srgb,var(--matrix-primary)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-primary)_18%,var(--matrix-surface)_82%)] px-3 py-2 text-[color:var(--matrix-primary-strong)] shadow-[0_14px_28px_color-mix(in_srgb,var(--matrix-primary)_14%,transparent)]"
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
