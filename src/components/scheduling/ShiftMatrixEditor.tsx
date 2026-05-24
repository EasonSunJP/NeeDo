import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { MobileFullscreenCloseButton } from "../mobile/MobileFullscreenHeader";
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
import { cn } from "../../lib/utils";
import { ScheduleMatrixGrid, getScheduleMatrixCellClassName, type ScheduleMatrixGridRow } from "./ScheduleMatrixGrid";

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
  dayActionMode?: "availability" | "leave";
  getDayActionState?: (dayIndex: number) => { rest: boolean; overtimeBlocked: boolean };
  onRequestDayLeave?: (dayIndex: number) => void;
  onToggleDayRest?: (dayIndex: number) => void;
  onToggleDayOvertimeBlocked?: (dayIndex: number) => void;
};

const matrixPanelClass =
  "min-w-0 max-w-full rounded-[22px] border border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-surface)_84%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]";
const matrixInsetClass =
  "rounded-[18px] border border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-elevated)_90%,transparent)]";
const matrixInputClass =
  "h-9 rounded-full border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--matrix-surface)_78%,transparent)] px-3 text-xs font-black text-[color:var(--matrix-text)] outline-none";

const matrixThemeStyle = {
  "--matrix-bg-solid": "var(--admin-bg, var(--client-bg, #ffffff))",
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
  "--matrix-dialog-surface-base": "var(--client-schedule-sticky-bg, var(--client-top-chrome-bg, var(--matrix-bg-solid)))",
  "--matrix-dialog-surface-solid": "color-mix(in srgb, var(--matrix-dialog-surface-base) 92%, var(--matrix-text) 8%)",
  "--matrix-dialog-primary-bg": "var(--matrix-primary)",
  "--matrix-dialog-primary-text": "var(--merchant-dispatch-on-accent, var(--client-primary-contrast, var(--matrix-bg-solid)))",
  "--matrix-dialog-secondary-bg": "color-mix(in srgb, var(--matrix-dialog-surface-base) 56%, var(--matrix-bg-solid) 44%)",
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

function getCellClassName(_accent: ShiftMatrixEditorProps["accent"], active: boolean, disabled: boolean) {
  if (disabled) {
    return getScheduleMatrixCellClassName(active, disabled);
  }

  if (active) {
    return getScheduleMatrixCellClassName(active, disabled);
  }

  return getScheduleMatrixCellClassName(active, disabled);
}

function updateCell(matrix: SlotMatrix, dayIndex: number, hour: number, nextValue: boolean) {
  const next = matrix.map((row, index) => (index === dayIndex ? [...row] : row));
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
  dayActionMode = "availability",
  getDayActionState,
  onRequestDayLeave,
  onToggleDayRest,
  onToggleDayOvertimeBlocked
}: ShiftMatrixEditorProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [dayActionIndex, setDayActionIndex] = useState<number | null>(null);
  const [fillStartHour, setFillStartHour] = useState(10);
  const [fillEndHour, setFillEndHour] = useState(17);
  const normalizedMatrix = useMemo(() => normalizeSlotMatrix(templateType, matrix), [matrix, templateType]);
  const dayLabels = useMemo(() => getTemplateDayLabels(templateType, startDate), [startDate, templateType]);
  const connectedLayout = layout === "connected";
  const dayActionsEnabled = dayActionMode === "leave" || Boolean(getDayActionState || onToggleDayRest || onToggleDayOvertimeBlocked);
  const rootClassName = connectedLayout ? "min-w-0 max-w-full" : matrixPanelClass;
  const connectedDividerClass = "border-[color:color-mix(in_srgb,var(--matrix-line)_62%,transparent)]";
  const batchFillClassName = connectedLayout
    ? cn("mt-4 border-t pt-4", connectedDividerClass)
    : cn(matrixInsetClass, "mt-3 p-3");
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
        <span className="relative z-10 whitespace-nowrap">{label}</span>
      </span>
    )
  );

  useEffect(() => {
    setSelectedDayIndex((current) => Math.min(current, Math.max(dayLabels.length - 1, 0)));
  }, [dayLabels.length]);

  const applyCell = (dayIndex: number, hour: number, nextValue: boolean) => {
    onChange(updateCell(normalizedMatrix, dayIndex, hour, nextValue));
  };
  const resizeActiveRange = (dayIndex: number, startHour: number, endHour: number, nextStartHour: number, nextEndHour: number) => {
    if (!normalizedMatrix[dayIndex]) {
      return;
    }

    const nextMatrix = cloneSlotMatrix(normalizedMatrix);

    for (let hour = startHour; hour < endHour; hour += 1) {
      if (!(getCellDisabled?.(dayIndex, hour) ?? false)) {
        nextMatrix[dayIndex][hour] = false;
      }
    }

    for (let hour = nextStartHour; hour < nextEndHour; hour += 1) {
      if (!(getCellDisabled?.(dayIndex, hour) ?? false)) {
        nextMatrix[dayIndex][hour] = true;
      }
    }

    onChange(nextMatrix);
  };

  const applyPreset = (preset: "all" | "none" | "invert" | "workdays" | "weekend") => {
    onChange(applyMatrixPreset(normalizedMatrix, templateType, preset));
  };

  const activeHourCount = normalizedMatrix.reduce(
    (sum, row) => sum + row.filter(Boolean).length,
    0
  );
  const selectedDayActionState = dayActionIndex == null ? null : getDayActionState?.(dayActionIndex) ?? { rest: false, overtimeBlocked: false };
  const dayActionPortalTarget =
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(".client-shell, .admin-shell") ?? document.body;
  const dayActionDialogPanelStyle = {
    ...matrixThemeStyle,
    backgroundColor: "var(--matrix-dialog-surface-solid)",
    borderColor: "color-mix(in srgb, var(--matrix-line) 72%, transparent)",
    boxShadow: "0 24px 60px color-mix(in srgb, var(--matrix-bg-solid) 56%, transparent)",
    color: "var(--matrix-text)"
  } as CSSProperties;
  const dayActionDialogPrimaryButtonStyle = {
    backgroundColor: "var(--matrix-dialog-primary-bg)",
    borderColor: "color-mix(in srgb, var(--matrix-primary) 38%, var(--matrix-line) 62%)",
    color: "var(--matrix-dialog-primary-text)"
  } as CSSProperties;
  const dayActionDialogSecondaryButtonStyle = {
    backgroundColor: "var(--matrix-dialog-secondary-bg)",
    borderColor: "color-mix(in srgb, var(--matrix-line) 78%, transparent)",
    color: "var(--matrix-text)"
  } as CSSProperties;
  const dayActionDialogCloseButtonStyle = {
    ...dayActionDialogSecondaryButtonStyle,
    color: "var(--matrix-primary-strong)"
  } as CSSProperties;
  const matrixRows: ScheduleMatrixGridRow[] = normalizedMatrix.map((row, dayIndex) => {
    const actionState = getDayActionState?.(dayIndex);

    return {
      cells: row.map((active, hour) => {
        const disabled = getCellDisabled?.(dayIndex, hour) ?? false;
        const hint = getCellHint?.(dayIndex, hour, active, disabled) ?? `${dayLabels[dayIndex]} ${formatHourLabel(hour)}`;

        return {
          active,
          className: cn(
            getCellClassName(accent, active, disabled),
            selectedDayIndex === dayIndex && !disabled && "ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--matrix-primary)_24%,transparent)]"
          ),
          disabled,
          hint,
          key: `${dayIndex}-${hour}`,
          onPaint: (nextValue) => {
            if (disabled) {
              return;
            }

            applyCell(dayIndex, hour, nextValue);
          },
          selected: selectedDayIndex === dayIndex && !disabled
        };
      }),
      indexLabel: String(dayIndex + 1).padStart(2, "0"),
      key: `${dayIndex}-${dayLabels[dayIndex] ?? dayIndex}`,
      onSelect: () => {
        setSelectedDayIndex(dayIndex);
        if (dayActionsEnabled) {
          setDayActionIndex(dayIndex);
        }
      },
      overtimeBlocked: actionState?.overtimeBlocked,
      rest: actionState?.rest,
      selected: selectedDayIndex === dayIndex,
      title: dayLabels[dayIndex] ?? ""
    };
  });
  const dayActionDialog = dayActionIndex != null ? (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/78 px-4 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(7.5rem,env(safe-area-inset-bottom))] backdrop-blur-md" onClick={() => setDayActionIndex(null)}>
      <section
        className="w-full max-w-[360px] rounded-[24px] border border-[color:color-mix(in_srgb,var(--matrix-line)_72%,transparent)] bg-[color:var(--matrix-dialog-surface-solid)] p-4 text-[color:var(--matrix-text)] shadow-[0_24px_60px_color-mix(in_srgb,var(--matrix-bg-solid)_56%,transparent)]"
        onClick={(event) => event.stopPropagation()}
        style={dayActionDialogPanelStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-[color:var(--matrix-muted)]">模板日设置</p>
            <h4 className="mt-1 text-lg font-black text-[color:var(--matrix-text)]">{dayLabels[dayActionIndex]}</h4>
          </div>
          <MobileFullscreenCloseButton
            className="h-10 w-10 !border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] !bg-[color:var(--matrix-dialog-secondary-bg)] text-[color:var(--matrix-primary-strong)]"
            label="关闭模板日设置"
            onClose={() => setDayActionIndex(null)}
            style={dayActionDialogCloseButtonStyle}
          />
        </div>
        <div className="mt-4 grid gap-2">
          {dayActionMode === "leave" ? (
            <Button
              className="w-full justify-center !bg-[color:var(--matrix-dialog-primary-bg)] !text-[color:var(--matrix-dialog-primary-text)]"
              disabled={!onRequestDayLeave}
              onClick={() => {
                onRequestDayLeave?.(dayActionIndex);
                setDayActionIndex(null);
              }}
              style={dayActionDialogPrimaryButtonStyle}
            >
              请假申请
            </Button>
          ) : (
            <>
              <Button
                className="w-full justify-center !bg-[color:var(--matrix-dialog-primary-bg)] !text-[color:var(--matrix-dialog-primary-text)]"
                disabled={!onToggleDayRest}
                onClick={() => {
                  onToggleDayRest?.(dayActionIndex);
                  setDayActionIndex(null);
                }}
                style={dayActionDialogPrimaryButtonStyle}
              >
                {selectedDayActionState?.rest ? "取消休息日" : "设为休息日"}
              </Button>
              <Button
                className="w-full justify-center border border-[color:color-mix(in_srgb,var(--matrix-line)_78%,transparent)] !bg-[color:var(--matrix-dialog-secondary-bg)] !text-[color:var(--matrix-text)]"
                disabled={!onToggleDayOvertimeBlocked}
                variant="ghost"
                onClick={() => {
                  onToggleDayOvertimeBlocked?.(dayActionIndex);
                  setDayActionIndex(null);
                }}
                style={dayActionDialogSecondaryButtonStyle}
              >
                {selectedDayActionState?.overtimeBlocked ? "取消禁止加班日" : "设为禁止加班日"}
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  ) : null;

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

      <ScheduleMatrixGrid
        activeCellLabel={activeLabel}
        activeCellStatus={accent === "technician" ? "confirmed" : "open"}
        className={connectedLayout ? cn("-mx-4 rounded-none border-x-0 border-y bg-[color:var(--client-schedule-sticky-bg,var(--matrix-elevated))] shadow-none", connectedDividerClass) : undefined}
        headerBottomLabel="/ 小时"
        headerTopLabel="模板日"
        onResizeActiveRange={resizeActiveRange}
        rows={matrixRows}
        stickyAxis={stickyAxis}
      />

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

      {dayActionDialog ? (dayActionPortalTarget ? createPortal(dayActionDialog, dayActionPortalTarget) : dayActionDialog) : null}
    </section>
  );
}
