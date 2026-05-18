import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import {
  applyMatrixPreset,
  cloneSlotMatrix,
  copyMatrixDay,
  fillMatrixHourRange,
  formatHourLabel,
  getTemplateDayLabels,
  normalizeSlotMatrix
} from "../../lib/shiftPlanning";
import type { ShiftTemplateType, SlotMatrix } from "../../types/shiftPlanning";
import { useHorizontalDragScroll } from "../../lib/useHorizontalDragScroll";
import { cn } from "../../lib/utils";

type ShiftMatrixEditorProps = {
  title: string;
  caption: string;
  templateType: ShiftTemplateType;
  startDate: string;
  matrix: SlotMatrix;
  accent: "store" | "technician";
  onChange: (nextMatrix: SlotMatrix) => void;
  getCellDisabled?: (dayIndex: number, hour: number) => boolean;
  getCellHint?: (dayIndex: number, hour: number, active: boolean, disabled: boolean) => string;
  activeLabel: string;
  inactiveLabel: string;
  disabledLabel: string;
  stickyAxis?: boolean;
  layout?: "panel" | "connected";
  getDayActionState?: (dayIndex: number) => { rest: boolean; overtimeBlocked: boolean };
  onToggleDayRest?: (dayIndex: number) => void;
  onToggleDayOvertimeBlocked?: (dayIndex: number) => void;
};

const matrixPanelClass =
  "min-w-0 max-w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-surface)_84%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]";
const matrixInsetClass =
  "rounded-[18px] border border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_90%,transparent)]";
const matrixInputClass =
  "h-9 rounded-full border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-surface)_78%,transparent)] px-3 text-xs font-black text-[color:var(--matrix-text)] outline-none";
const matrixStickyColumnWidth = "176px";
const matrixColumnMinWidth = 58;
const matrixHeaderHeight = "72px";
const matrixRowHeight = "88px";

type DisabledMatrixBlock = {
  endHour: number;
  endRow: number;
  startHour: number;
  startRow: number;
};

const matrixThemeStyle = {
  "--matrix-surface": "var(--admin-surface, var(--client-surface))",
  "--matrix-elevated": "var(--admin-muted-surface, var(--client-elevated))",
  "--matrix-line": "var(--admin-line, var(--client-line))",
  "--matrix-text": "var(--admin-text, var(--client-text))",
  "--matrix-muted": "var(--admin-muted, var(--client-muted))",
  "--matrix-primary": "var(--admin-accent, var(--client-primary))",
  "--matrix-primary-strong": "var(--admin-accent-strong, var(--client-primary-strong, var(--admin-accent, var(--client-primary))))",
  "--matrix-primary-soft": "var(--client-primary-soft, color-mix(in srgb, var(--admin-accent, #4b7cff) 14%, transparent))",
  "--matrix-success": "var(--admin-success, var(--client-primary))",
  "--matrix-warning": "var(--admin-warning, var(--client-warm))",
  "--matrix-danger": "var(--admin-danger, var(--client-accent))",
  "--matrix-on-accent": "#f7fbff"
} as CSSProperties;

function MatrixBadge({
  children,
  tone,
  className
}: {
  children: ReactNode;
  tone: "green" | "yellow" | "red" | "blue" | "neutral" | "dark";
  className?: string;
}) {
  const toneClassName =
    tone === "red"
      ? "border-[color:color-mix(in_srgb,var(--matrix-danger)_36%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-danger)_16%,transparent)] text-[color:color-mix(in_srgb,var(--matrix-danger)_88%,var(--matrix-text)_12%)]"
      : tone === "yellow"
        ? "border-[color:color-mix(in_srgb,var(--matrix-warning)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-warning)_18%,transparent)] text-[color:color-mix(in_srgb,var(--matrix-warning)_90%,var(--matrix-text)_10%)]"
        : tone === "dark"
          ? "border-[color:color-mix(in_srgb,var(--matrix-primary)_42%,transparent)] bg-[color:var(--matrix-primary)] text-[color:var(--matrix-on-accent)]"
          : tone === "neutral"
            ? "border-[color:color-mix(in_srgb,var(--matrix-line)_84%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_90%,transparent)] text-[color:color-mix(in_srgb,var(--matrix-muted)_90%,var(--matrix-text)_10%)]"
            : tone === "green"
              ? "border-[color:color-mix(in_srgb,var(--matrix-success)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-success)_18%,transparent)] text-[color:color-mix(in_srgb,var(--matrix-success)_90%,var(--matrix-text)_10%)]"
              : "border-[color:color-mix(in_srgb,var(--matrix-primary)_36%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-primary)_18%,transparent)] text-[color:color-mix(in_srgb,var(--matrix-primary)_90%,var(--matrix-text)_10%)]";

  return (
    <Badge
      className={cn("border px-2.5 py-1 text-[11px] font-black backdrop-blur", toneClassName, className)}
      tone={tone}
    >
      {children}
    </Badge>
  );
}

function getCellClassName(accent: ShiftMatrixEditorProps["accent"], active: boolean, disabled: boolean) {
  if (disabled) {
    return "cursor-not-allowed border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] bg-transparent text-[color:color-mix(in_srgb,var(--matrix-muted)_40%,transparent)]";
  }

  if (active) {
    return "border-[color:var(--schedule-tone-available-border)] bg-[color:var(--schedule-tone-available-bg)] text-[color:var(--schedule-tone-available-text)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]";
  }

  return "border-[color:color-mix(in_srgb,var(--matrix-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-surface)_80%,transparent)] text-[color:var(--matrix-muted)] hover:border-[color:color-mix(in_srgb,var(--matrix-primary)_32%,transparent)] hover:text-[color:var(--matrix-primary-strong)]";
}

function buildDisabledHourRanges(dayIndex: number, getCellDisabled?: ShiftMatrixEditorProps["getCellDisabled"]) {
  const ranges: Array<{ endHour: number; startHour: number }> = [];

  if (!getCellDisabled) {
    return ranges;
  }

  for (let hour = 0; hour < 24; hour += 1) {
    if (!getCellDisabled(dayIndex, hour)) {
      continue;
    }

    const previous = ranges[ranges.length - 1];

    if (previous && previous.endHour === hour) {
      previous.endHour = hour + 1;
      continue;
    }

    ranges.push({
      endHour: hour + 1,
      startHour: hour
    });
  }

  return ranges;
}

function buildDisabledMatrixBlocks(dayCount: number, getCellDisabled?: ShiftMatrixEditorProps["getCellDisabled"]) {
  const blocks: DisabledMatrixBlock[] = [];

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    buildDisabledHourRanges(dayIndex, getCellDisabled).forEach((range) => {
      const previousBlock = blocks.find(
        (block) =>
          block.endRow === dayIndex &&
          block.startHour === range.startHour &&
          block.endHour === range.endHour
      );

      if (previousBlock) {
        previousBlock.endRow = dayIndex + 1;
        return;
      }

      blocks.push({
        ...range,
        endRow: dayIndex + 1,
        startRow: dayIndex
      });
    });
  }

  return blocks;
}

function updateCell(matrix: SlotMatrix, dayIndex: number, hour: number, nextValue: boolean) {
  const next = cloneSlotMatrix(matrix);
  next[dayIndex][hour] = nextValue;
  return next;
}

export function ShiftMatrixEditor({
  title,
  caption,
  templateType,
  startDate,
  matrix,
  accent,
  onChange,
  getCellDisabled,
  getCellHint,
  activeLabel,
  inactiveLabel,
  disabledLabel,
  stickyAxis = true,
  layout = "panel",
  getDayActionState,
  onToggleDayRest,
  onToggleDayOvertimeBlocked
}: ShiftMatrixEditorProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [dayActionIndex, setDayActionIndex] = useState<number | null>(null);
  const [paintValue, setPaintValue] = useState<boolean | null>(null);
  const [fillStartHour, setFillStartHour] = useState(10);
  const [fillEndHour, setFillEndHour] = useState(17);
  const { scrollRef, dragScrollProps } = useHorizontalDragScroll({});
  const normalizedMatrix = useMemo(() => normalizeSlotMatrix(templateType, matrix), [matrix, templateType]);
  const dayLabels = useMemo(() => getTemplateDayLabels(templateType, startDate), [startDate, templateType]);
  const connectedLayout = layout === "connected";
  const dayActionsEnabled = Boolean(getDayActionState || onToggleDayRest || onToggleDayOvertimeBlocked);
  const rootClassName = connectedLayout ? "min-w-0 max-w-full" : matrixPanelClass;
  const connectedDividerClass = "border-[color:color-mix(in_srgb,var(--matrix-line)_62%,transparent)]";
  const stickyColumnWidth = connectedLayout ? "86px" : matrixStickyColumnWidth;
  const columnMinWidth = connectedLayout ? 48 : matrixColumnMinWidth;
  const columnWidth = `minmax(${columnMinWidth}px,1fr)`;
  const headerHeight = connectedLayout ? "54px" : matrixHeaderHeight;
  const rowHeight = connectedLayout ? "58px" : matrixRowHeight;
  const matrixGridTemplateColumns = `${stickyColumnWidth} repeat(24, ${columnWidth})`;
  const matrixGridMinWidth = `calc(${stickyColumnWidth} + ${24 * columnMinWidth}px)`;
  const stickyCellPaddingClass = connectedLayout ? "px-3 py-2" : "px-4 py-3";
  const stickyDayNumberClass = connectedLayout
    ? "relative z-10 block text-[10px] font-black tracking-[0.12em] text-[color:var(--matrix-muted)]"
    : "relative z-10 block text-xs font-black uppercase tracking-[0.16em] text-[color:var(--matrix-muted)]";
  const stickyDayLabelClass = connectedLayout
    ? "relative z-10 mt-0.5 block truncate text-[13px] font-black"
    : "relative z-10 mt-2 block truncate text-base font-black";
  const batchFillClassName = connectedLayout
    ? cn("mt-4 border-t pt-4", connectedDividerClass)
    : cn(matrixInsetClass, "mt-3 p-3");
  const matrixShellClassName = connectedLayout
    ? cn("mt-4 min-w-0 max-w-full overflow-hidden border-y bg-transparent [contain:layout_paint]", connectedDividerClass)
    : "mt-4 min-w-0 max-w-full overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-surface)_84%,transparent)] shadow-[0_16px_38px_rgba(0,0,0,0.16)] [contain:layout_paint]";
  const matrixGridStyle = {
    gridTemplateColumns: matrixGridTemplateColumns,
    minWidth: matrixGridMinWidth
  } satisfies CSSProperties;
  const disabledMatrixBlocks = useMemo(
    () => buildDisabledMatrixBlocks(dayLabels.length, getCellDisabled),
    [dayLabels.length, getCellDisabled]
  );
  const disabledMatrixOverlayStyle = {
    gridTemplateColumns: `repeat(24, ${columnWidth})`,
    gridTemplateRows: `repeat(${dayLabels.length}, ${rowHeight})`,
    left: stickyColumnWidth,
    minWidth: `calc(${24 * columnMinWidth}px)`,
    right: 0
  } satisfies CSSProperties;
  const disabledMatrixPatternStyle = {
    backgroundImage:
      "repeating-linear-gradient(135deg, rgba(0,0,0,0.24) 0, rgba(0,0,0,0.24) 16px, rgba(255,255,255,0.08) 16px, rgba(255,255,255,0.08) 32px)"
  } satisfies CSSProperties;
  const renderLegendSample = (label: string, active: boolean, disabled = false) => (
    active && !disabled ? (
      <span className="schedule-legend-badge schedule-legend-badge--available px-2.5 py-1 text-[11px] font-black">{label}</span>
    ) : (
      <span
        className={cn(
          "relative inline-flex min-h-8 min-w-[72px] items-center justify-center overflow-hidden border px-3 py-1.5 text-[11px] font-black leading-none",
          getCellClassName(accent, active, disabled)
        )}
      >
        {disabled ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={disabledMatrixPatternStyle} /> : null}
        <span className="relative z-10 whitespace-nowrap">{label}</span>
      </span>
    )
  );
  const matrixStickySurfaceStyle = {
    background: "var(--client-schedule-sticky-bg, var(--merchant-dispatch-table-sticky-bg, color-mix(in srgb, var(--matrix-elevated) 92%, transparent)))",
    minWidth: stickyColumnWidth,
    width: stickyColumnWidth
  } satisfies CSSProperties;
  const matrixHeaderSurfaceStyle = {
    background: "var(--client-schedule-sticky-bg, var(--merchant-dispatch-table-header-bg, color-mix(in srgb, var(--matrix-elevated) 92%, transparent)))"
  } satisfies CSSProperties;
  const matrixStickyHeaderStyle = {
    ...matrixStickySurfaceStyle,
    height: headerHeight,
    minHeight: headerHeight
  } satisfies CSSProperties;
  const matrixStickyRowStyle = {
    ...matrixStickySurfaceStyle,
    boxShadow: "var(--client-schedule-sticky-shadow, 14px 0 24px rgba(0, 0, 0, 0.16))",
    height: rowHeight,
    maxWidth: stickyColumnWidth,
    minHeight: rowHeight
  } satisfies CSSProperties;

  useEffect(() => {
    const stopPainting = () => setPaintValue(null);
    window.addEventListener("mouseup", stopPainting);
    return () => window.removeEventListener("mouseup", stopPainting);
  }, []);

  useEffect(() => {
    setSelectedDayIndex((current) => Math.min(current, Math.max(dayLabels.length - 1, 0)));
  }, [dayLabels.length]);

  const applyCell = (dayIndex: number, hour: number, nextValue: boolean) => {
    onChange(updateCell(normalizedMatrix, dayIndex, hour, nextValue));
  };

  const applyPreset = (preset: "all" | "none" | "invert" | "workdays" | "weekend") => {
    onChange(applyMatrixPreset(normalizedMatrix, templateType, preset));
  };

  const activeHourCount = normalizedMatrix.reduce(
    (sum, row) => sum + row.filter(Boolean).length,
    0
  );
  const selectedDayActionState = dayActionIndex == null ? null : getDayActionState?.(dayActionIndex) ?? { rest: false, overtimeBlocked: false };

  return (
    <section className={rootClassName} style={matrixThemeStyle}>
      <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between", connectedLayout && "border-t pt-4", connectedLayout && connectedDividerClass)}>
        {connectedLayout ? null : (
          <TitleWithInfo
            info={caption}
            infoClassName="h-5 w-5 border-[color:color-mix(in_srgb,var(--matrix-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_82%,transparent)] text-[color:var(--matrix-muted)]"
            label={`查看${title}说明`}
            title={<span className="truncate text-[18px] font-black tracking-[-0.02em] text-[color:var(--matrix-text)]">{title}</span>}
            titleClassName="min-w-0"
            variant="client"
          />
        )}
        <div className="flex flex-wrap gap-2">
          {renderLegendSample(activeLabel, true)}
          {!connectedLayout ? renderLegendSample(inactiveLabel, false) : null}
          {renderLegendSample(disabledLabel, false, true)}
          {!connectedLayout ? <MatrixBadge tone="yellow">{activeHourCount} 个小时格</MatrixBadge> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_86%,transparent)] text-[color:var(--matrix-text)]" size="sm" variant="secondary" onClick={() => applyPreset("all")}>全选</Button>
        <Button className="border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_86%,transparent)] text-[color:var(--matrix-text)]" size="sm" variant="secondary" onClick={() => applyPreset("none")}>全不选</Button>
        <Button className="border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_86%,transparent)] text-[color:var(--matrix-text)]" size="sm" variant="secondary" onClick={() => applyPreset("invert")}>批量反选</Button>
        {!connectedLayout && templateType !== "day" ? <Button className="border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_86%,transparent)] text-[color:var(--matrix-text)]" size="sm" variant="secondary" onClick={() => applyPreset("workdays")}>工作日套用</Button> : null}
        {!connectedLayout && templateType !== "day" ? <Button className="border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_86%,transparent)] text-[color:var(--matrix-text)]" size="sm" variant="secondary" onClick={() => applyPreset("weekend")}>周末套用</Button> : null}
        <Button
          className="border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_86%,transparent)] text-[color:var(--matrix-text)]"
          size="sm"
          variant="secondary"
          disabled={selectedDayIndex <= 0}
          onClick={() => onChange(copyMatrixDay(normalizedMatrix, selectedDayIndex, selectedDayIndex - 1))}
        >
          复制上一天
        </Button>
        {!connectedLayout ? (
          <Button
            className="border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_86%,transparent)] text-[color:var(--matrix-text)]"
            size="sm"
            variant="secondary"
            disabled={templateType === "day" || selectedDayIndex <= 6}
            onClick={() => onChange(copyMatrixDay(normalizedMatrix, selectedDayIndex, selectedDayIndex - 7))}
          >
            复制上一周
          </Button>
        ) : null}
      </div>

      <div className={batchFillClassName}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[color:var(--matrix-muted)]">
            <span>批量填充</span>
            <select
              className={matrixInputClass}
              onChange={(event) => setFillStartHour(Number(event.target.value))}
              value={fillStartHour}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={`fill-start-${hour}`} value={hour}>{String(hour).padStart(2, "0")}:00</option>
              ))}
            </select>
            <span>至</span>
            <select
              className={matrixInputClass}
              onChange={(event) => setFillEndHour(Number(event.target.value))}
              value={fillEndHour}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={`fill-end-${hour}`} value={hour}>{String(hour).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-[color:var(--matrix-primary)] text-[color:var(--matrix-on-accent)] shadow-[0_14px_30px_color-mix(in_srgb,var(--matrix-primary)_24%,transparent)]"
              size="sm"
              onClick={() =>
                onChange(fillMatrixHourRange(normalizedMatrix, Math.min(fillStartHour, fillEndHour), Math.max(fillStartHour, fillEndHour), true))
              }
            >
              批量点亮
            </Button>
            <Button
              className="border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_86%,transparent)] text-[color:var(--matrix-text)]"
              size="sm"
              variant="secondary"
              onClick={() =>
                onChange(fillMatrixHourRange(normalizedMatrix, Math.min(fillStartHour, fillEndHour), Math.max(fillStartHour, fillEndHour), false))
              }
            >
              批量关闭
            </Button>
          </div>
        </div>
      </div>

      <div className={matrixShellClassName}>
        <div
          className="scrollbar-none max-w-full cursor-grab overflow-x-auto overflow-y-visible overscroll-x-contain active:cursor-grabbing"
          data-page-drag-ignore="true"
          ref={scrollRef}
          style={{
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorX: "contain"
          }}
          {...dragScrollProps}
        >
          <div style={{ minWidth: matrixGridMinWidth }}>
            <div className="grid text-center text-[11px] font-black text-[color:var(--matrix-muted)]" style={matrixGridStyle}>
              <div
                className={cn(
                  "isolate flex flex-col items-start justify-center overflow-hidden border-b border-r border-[color:color-mix(in_srgb,var(--matrix-line)_68%,transparent)] text-left",
                  stickyCellPaddingClass,
                  stickyAxis ? "sticky left-0 z-30 shadow-[0_14px_28px_rgba(0,0,0,0.14)]" : "relative z-[1]"
                )}
                style={matrixStickyHeaderStyle}
              >
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={matrixStickySurfaceStyle} />
                <span className="relative z-10 text-xs font-black uppercase tracking-[0.16em] text-[color:var(--matrix-muted)]">模板日</span>
                <span className="relative z-10 mt-1 text-sm font-black text-[color:var(--matrix-text)]">/ 小时</span>
              </div>
              {Array.from({ length: 24 }, (_, hour) => (
                <div
                  className="flex items-center justify-center border-b border-r border-[color:color-mix(in_srgb,var(--matrix-line)_62%,transparent)] px-1"
                  key={`hour-${hour}`}
                  style={{ ...matrixHeaderSurfaceStyle, height: headerHeight, minHeight: headerHeight }}
                >
                  {String(hour).padStart(2, "0")}
                </div>
              ))}
            </div>

            <div className="relative">
              {disabledMatrixBlocks.length > 0 ? (
                <div aria-hidden="true" className="pointer-events-none absolute top-0 z-0 grid" style={disabledMatrixOverlayStyle}>
                  {disabledMatrixBlocks.map((block) => (
                    <span
                      key={`disabled-${block.startRow}-${block.endRow}-${block.startHour}-${block.endHour}`}
                      style={{
                        ...disabledMatrixPatternStyle,
                        gridColumn: `${block.startHour + 1} / ${block.endHour + 1}`,
                        gridRow: `${block.startRow + 1} / ${block.endRow + 1}`
                      }}
                    />
                  ))}
                </div>
              ) : null}

              <div className="relative z-10 grid" style={matrixGridStyle}>
                {normalizedMatrix.map((row, dayIndex) => (
                  <div className="contents" key={dayLabels[dayIndex] ?? dayIndex}>
                    <button
                      className={cn(
                        "isolate overflow-hidden border-b border-r border-[color:color-mix(in_srgb,var(--matrix-line)_66%,transparent)] text-left transition",
                        stickyCellPaddingClass,
                        stickyAxis ? "sticky left-0 z-30" : "relative z-[1]",
                        selectedDayIndex === dayIndex
                          ? "text-[color:var(--matrix-primary-strong)]"
                          : "text-[color:var(--matrix-text)] hover:text-[color:var(--matrix-primary-strong)]"
                      )}
                      onClick={() => {
                        setSelectedDayIndex(dayIndex);
                        if (dayActionsEnabled) {
                          setDayActionIndex(dayIndex);
                        }
                      }}
                      style={matrixStickyRowStyle}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-0"
                        style={{
                          ...matrixStickySurfaceStyle,
                          background:
                            selectedDayIndex === dayIndex
                              ? "color-mix(in srgb, var(--matrix-primary) 20%, var(--client-schedule-sticky-bg, var(--matrix-elevated)))"
                              : matrixStickySurfaceStyle.background
                        }}
                      />
                      <span className={stickyDayNumberClass}>{String(dayIndex + 1).padStart(2, "0")}</span>
                      <span className={stickyDayLabelClass}>{dayLabels[dayIndex]}</span>
                      {getDayActionState?.(dayIndex).overtimeBlocked ? (
                        <span className="absolute right-1.5 top-1.5 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--matrix-warning)] px-1 text-[9px] font-black leading-none text-[color:var(--matrix-text)] shadow-[0_6px_14px_color-mix(in_srgb,var(--matrix-warning)_30%,transparent)]">禁</span>
                      ) : null}
                      {getDayActionState?.(dayIndex).rest ? (
                        <span className="absolute right-1.5 top-1.5 z-20 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--matrix-danger)] px-1 text-[10px] font-black leading-none text-white shadow-[0_6px_14px_color-mix(in_srgb,var(--matrix-danger)_34%,transparent)]">休</span>
                      ) : null}
                    </button>

                    {row.map((active, hour) => {
                      const disabled = getCellDisabled?.(dayIndex, hour) ?? false;
                      const hint = getCellHint?.(dayIndex, hour, active, disabled) ?? `${dayLabels[dayIndex]} ${formatHourLabel(hour)}`;

                      return (
                        <button
                          className={cn(
                            "relative overflow-hidden border-b border-r px-0 transition",
                            getCellClassName(accent, active, disabled),
                            selectedDayIndex === dayIndex && !disabled && "ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--matrix-primary)_24%,transparent)]"
                          )}
                          key={`${dayIndex}-${hour}`}
                          onMouseDown={() => {
                            if (disabled) {
                              return;
                            }

                            const nextValue = !active;
                            setPaintValue(nextValue);
                            applyCell(dayIndex, hour, nextValue);
                          }}
                          onMouseEnter={() => {
                            if (disabled || paintValue == null) {
                              return;
                            }

                            applyCell(dayIndex, hour, paintValue);
                          }}
                          onMouseUp={() => setPaintValue(null)}
                          style={{ height: rowHeight, minHeight: rowHeight }}
                          title={hint}
                          type="button"
                        >
                          <span className="sr-only">{hint}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {connectedLayout ? (
        <div className={cn("mt-4 grid gap-3 border-t pt-3 text-xs font-semibold leading-5 text-[color:var(--matrix-muted)] lg:grid-cols-3", connectedDividerClass)}>
          <p><span className="font-black text-[color:var(--matrix-text)]">当前选中：</span>{dayLabels[selectedDayIndex]}，点按左侧模板日可切换焦点。</p>
          <p><span className="font-black text-[color:var(--matrix-text)]">快捷复制：</span>复制上一天 / 上一周会复制整行 24 小时状态。</p>
          <p><span className="font-black text-[color:var(--matrix-text)]">填充提示：</span>先设好时间范围，再批量点亮或关闭。</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className={cn(matrixInsetClass, "p-3")}>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--matrix-muted)]">当前选中</p>
            <strong className="mt-2 block text-base font-black text-[color:var(--matrix-text)]">{dayLabels[selectedDayIndex]}</strong>
            <p className="mt-1 text-xs leading-5 text-[color:var(--matrix-muted)]">点按左侧模板日可切换当前焦点，支持拖拽批量点亮 / 熄灭。</p>
          </div>
          <div className={cn(matrixInsetClass, "p-3")}>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--matrix-muted)]">快捷复制</p>
            <p className="mt-2 text-sm font-semibold text-[color:color-mix(in_srgb,var(--matrix-text)_78%,transparent)]">“复制上一天 / 上一周”都会复制整行 24 小时状态，适合快速排固定班型。</p>
          </div>
          <div className={cn(matrixInsetClass, "p-3")}>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--matrix-muted)]">填充提示</p>
            <p className="mt-2 text-sm font-semibold text-[color:color-mix(in_srgb,var(--matrix-text)_78%,transparent)]">先设好时间范围，再用“批量点亮 / 关闭”一次性应用到整个模板。</p>
          </div>
        </div>
      )}

      {dayActionIndex != null ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/78 px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-6 backdrop-blur-md" onClick={() => setDayActionIndex(null)}>
          <section
            className="w-full max-w-[360px] rounded-[24px] border border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] bg-[#202348] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.42)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[color:var(--matrix-muted)]">模板日设置</p>
                <h4 className="mt-1 text-lg font-black text-[color:var(--matrix-text)]">{dayLabels[dayActionIndex]}</h4>
              </div>
              <button
                className="rounded-full border border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] px-3 py-1.5 text-xs font-black text-[color:var(--matrix-muted)]"
                onClick={() => setDayActionIndex(null)}
                type="button"
              >
                关闭
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              <Button
                className="w-full justify-center bg-[color:var(--matrix-primary)] text-[color:var(--matrix-on-accent)]"
                disabled={!onToggleDayRest}
                onClick={() => {
                  onToggleDayRest?.(dayActionIndex);
                  setDayActionIndex(null);
                }}
              >
                {selectedDayActionState?.rest ? "取消休息日" : "设为休息日"}
              </Button>
              <Button
                className="w-full justify-center border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_86%,transparent)] text-[color:var(--matrix-text)]"
                disabled={!onToggleDayOvertimeBlocked}
                variant="secondary"
                onClick={() => {
                  onToggleDayOvertimeBlocked?.(dayActionIndex);
                  setDayActionIndex(null);
                }}
              >
                {selectedDayActionState?.overtimeBlocked ? "取消禁止加班日" : "设为禁止加班日"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
