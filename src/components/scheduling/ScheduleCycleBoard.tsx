import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppIcon, ScheduleViewSegmentedTabs } from "../client-ui/AppScaffold";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { resolveScheduleEventDetailTarget } from "../../lib/scheduleDetailTarget";
import { useEntityStore } from "../../state/entityStore";
import {
  adjustDispatchFinalShift,
  getDispatchCycleList,
  getDispatchScheduleGrid,
  useDispatchCenterStore,
  type DispatchScheduleCell
} from "../../features/dispatch-center/store";
import {
  addDays,
  dispatchReferenceDateKey,
  parseDateKey,
  type DispatchCycle
} from "../../features/dispatch-center/domain";
import { ScheduleGrid } from "../../features/dispatch-center/components/ScheduleGrid";
import {
  isSchedulingLiveCycle,
  resolveSchedulingCurrentCycle,
  resolveSchedulingCycleSlots
} from "./SchedulingCycleTabs";
import { ScheduleContactInfoPanel } from "./ScheduleContactInfoPanel";

type ScheduleCycleBoardSurface = "desktop" | "mobile";
type ScheduleCycleBoardView = "day" | "week" | "month";

function getDefaultDateForCycle(cycle: DispatchCycle) {
  if (cycle.periodStart <= dispatchReferenceDateKey && cycle.periodEnd >= dispatchReferenceDateKey) {
    return dispatchReferenceDateKey;
  }

  return cycle.periodStart;
}

function formatScheduleDateLabel(dateKey: string) {
  const date = parseDateKey(dateKey);

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function ScheduleCycleBoard({
  cycle,
  drawerTitle,
  editingToggle = false,
  headerContent,
  onMessage,
  operatorId,
  scheduleStickyTop,
  selectable = true,
  storeId,
  surface,
  toolbarActions
}: {
  cycle: DispatchCycle;
  drawerTitle?: string;
  editingToggle?: boolean;
  headerContent?: ReactNode;
  onMessage: (message: string) => void;
  operatorId: string;
  scheduleStickyTop?: string;
  selectable?: boolean;
  storeId: string;
  surface: ScheduleCycleBoardSurface;
  toolbarActions?: ReactNode;
}) {
  const [view, setView] = useState<ScheduleCycleBoardView>("day");
  const [dateKey, setDateKey] = useState(getDefaultDateForCycle(cycle));
  const [editing, setEditing] = useState(!editingToggle);
  const [collapsedTechnicians, setCollapsedTechnicians] = useState(false);
  const [selectedCell, setSelectedCell] = useState<DispatchScheduleCell | null>(null);
  const navigate = useNavigate();
  const { language } = useI18n();
  const { stores } = useEntityStore();
  const dispatchSnapshot = useDispatchCenterStore();
  const isMobileSurface = surface === "mobile";
  const currentStore = useMemo(() => stores.find((store) => store.id === storeId) ?? stores[0], [storeId, stores]);
  const fieldClass = isMobileSurface ? "border-line bg-white/80 text-ink" : "merchant-dispatch-field";
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;
  const cycleClusterClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-cycle-cluster";
  const editIconButtonClass = cn(
    "focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border transition",
    isMobileSurface
      ? editing
        ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]"
        : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] text-[color:var(--client-muted)] hover:text-[color:var(--client-primary)]"
      : editing
        ? "border-[color:var(--admin-accent)] bg-[color:var(--admin-accent)] text-[color:var(--merchant-dispatch-on-accent,#fff)] shadow-[0_12px_26px_color-mix(in_srgb,var(--admin-accent)_26%,transparent)]"
        : "merchant-dispatch-toggle"
  );
  const grid = useMemo(() => getDispatchScheduleGrid(storeId, view, dateKey, cycle.id), [cycle.id, dateKey, storeId, view]);
  const schedulingCycles = useMemo(
    () => getDispatchCycleList(storeId).filter(isSchedulingLiveCycle).sort((left, right) => left.periodStart.localeCompare(right.periodStart)),
    [dispatchSnapshot.revision, storeId]
  );
  const schedulingCurrentCycle = useMemo(() => resolveSchedulingCurrentCycle(schedulingCycles), [schedulingCycles]);
  const schedulingCycleSlots = useMemo(() => resolveSchedulingCycleSlots(schedulingCycles, schedulingCurrentCycle), [schedulingCurrentCycle, schedulingCycles]);
  const contactScope = cycle.id === schedulingCurrentCycle?.id ? "current" : cycle.id === schedulingCycleSlots.nextCycle?.id ? "next" : "builder";
  const showActualWorkStatus = contactScope === "current" && cycle.periodStart <= dispatchReferenceDateKey;
  const contactExcludedRanges = useMemo(
    () => [schedulingCurrentCycle, schedulingCycleSlots.nextCycle]
      .filter((item): item is DispatchCycle => Boolean(item))
      .map((item) => ({ start: item.periodStart, end: item.periodEnd })),
    [schedulingCurrentCycle, schedulingCycleSlots.nextCycle]
  );
  const canSelectCells = selectable && (!editingToggle || editing);
  const t = (text: string) => translateText(text, language);
  const dateNavigatorControlClass = cn(
    "focus-ring h-12 rounded-full border px-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-45 sm:px-4",
    fieldClass
  );
  const dateNavigatorIconButtonClass =
    "focus-ring grid h-9 w-9 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-sm font-black text-[color:var(--client-text)] transition disabled:cursor-not-allowed disabled:opacity-45";
  const canGoPreviousDay = dateKey > cycle.periodStart;
  const canGoNextDay = dateKey < cycle.periodEnd;

  useEffect(() => {
    setDateKey(getDefaultDateForCycle(cycle));
    setEditing(!editingToggle);
    setSelectedCell(null);
  }, [cycle.id, editingToggle]);

  const clampDateToCycle = (nextDateKey: string) => {
    if (nextDateKey < cycle.periodStart) {
      return cycle.periodStart;
    }

    if (nextDateKey > cycle.periodEnd) {
      return cycle.periodEnd;
    }

    return nextDateKey;
  };

  const changeScheduleDate = (nextDateKey: string) => {
    setDateKey(clampDateToCycle(nextDateKey || getDefaultDateForCycle(cycle)));
    setSelectedCell(null);
  };

  const shiftScheduleDate = (amount: number) => {
    changeScheduleDate(addDays(dateKey, amount));
  };

  const openDateSchedule = (nextDateKey: string) => {
    setDateKey(clampDateToCycle(nextDateKey));
    setView("day");
    setSelectedCell(null);
  };

  const selectScheduleCell = (cell: DispatchScheduleCell) => {
    if (cell.hour == null && view !== "day") {
      openDateSchedule(cell.date);
      return;
    }

    const target = resolveScheduleEventDetailTarget(cell, "merchant-admin");
    if (target.action === "open" && target.targetType === "order_detail") {
      navigate(target.route);
      return;
    }

    setSelectedCell(cell);
  };

  const adjustSelectedCell = (status: "confirmed" | "waitlisted" | "cancelled") => {
    if (!selectedCell?.technicianId || selectedCell.hour == null) {
      return;
    }

    const result = adjustDispatchFinalShift({
      cycleId: cycle.id,
      technicianId: selectedCell.technicianId,
      date: selectedCell.date,
      hour: selectedCell.hour,
      status,
      operatorId
    });

    if (!result.ok) {
      onMessage(result.message ? t(result.message) : t("调整失败。"));
      return;
    }

    const statusLabel = status === "confirmed" ? "确认班次" : status === "waitlisted" ? "候补班次" : "取消班次";
    onMessage(t(`已调整为${statusLabel}，并通知相关技师。`));
    setSelectedCell(null);
  };

  return (
    <div className="space-y-4">
      {headerContent ? (
        <div className={cn("rounded-[28px] border p-3 sm:p-4", cycleClusterClass)}>
          {headerContent}
        </div>
      ) : null}

      <div className="space-y-0">
        <div className={cn("rounded-t-[28px] rounded-b-none border border-b-0 p-3 sm:p-4", cycleClusterClass)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="min-w-0 text-xl font-black text-ink">{t("排班详细")}</h3>
            <div className="flex min-w-0 flex-wrap justify-end gap-2">
              {editingToggle ? (
                <button
                  aria-label={t(editing ? "完成修改" : "修改排班")}
                  className={editIconButtonClass}
                  onClick={() => setEditing((current) => !current)}
                  title={t(editing ? "完成修改" : "修改排班")}
                  type="button"
                >
                  <AppIcon className="h-4 w-4" name="edit" />
                </button>
              ) : null}
              <ScheduleViewSegmentedTabs onChange={(nextView) => setView(nextView as ScheduleCycleBoardView)} value={view} />
            </div>
          </div>
          {isMobileSurface ? (
            <div className="client-sticky-control-panel mt-3">
              <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
                <button
                  aria-label={t("前一天")}
                  className={dateNavigatorIconButtonClass}
                  disabled={!canGoPreviousDay}
                  onClick={() => shiftScheduleDate(-1)}
                  type="button"
                >
                  ‹
                </button>
                <div className="min-w-0 text-center">
                  <strong className="block truncate text-sm font-black text-[color:var(--client-text)]" data-no-i18n>
                    {formatScheduleDateLabel(dateKey)}
                  </strong>
                  <span className="mt-0.5 block truncate text-[11px] font-bold text-[color:var(--client-muted)]">
                    {currentStore?.name ?? storeId} · {t("排班")}
                  </span>
                </div>
                <button
                  aria-label={t("后一天")}
                  className={dateNavigatorIconButtonClass}
                  disabled={!canGoNextDay}
                  onClick={() => shiftScheduleDate(1)}
                  type="button"
                >
                  ›
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
              <button
                className={dateNavigatorControlClass}
                disabled={!canGoPreviousDay}
                onClick={() => shiftScheduleDate(-1)}
                type="button"
              >
                {t("前一天")}
              </button>
              <input
                aria-label={t("日期")}
                className={cn(dateNavigatorControlClass, "min-w-0 px-4 text-center text-base outline-none")}
                max={cycle.periodEnd}
                min={cycle.periodStart}
                onChange={(event) => changeScheduleDate(event.target.value)}
                type="date"
                value={dateKey}
              />
              <button
                className={dateNavigatorControlClass}
                disabled={!canGoNextDay}
                onClick={() => shiftScheduleDate(1)}
                type="button"
              >
                {t("后一天")}
              </button>
            </div>
          )}
        </div>

        <ScheduleGrid
          className="rounded-t-none rounded-b-[28px]"
          collapsedTechnicians={collapsedTechnicians}
          data={grid}
          legendActions={toolbarActions}
          onSelectDate={openDateSchedule}
          onSelectCell={canSelectCells ? selectScheduleCell : undefined}
          onToggleCollapsed={() => setCollapsedTechnicians((current) => !current)}
          showActualWorkStatus={showActualWorkStatus}
          stickyTop={scheduleStickyTop}
          surface={surface}
        />
      </div>

      {isMobileSurface ? (
        <ScheduleContactInfoPanel
          cycle={cycle}
          excludedRanges={contactExcludedRanges}
          scope={contactScope}
          storeId={storeId}
        />
      ) : null}

      <Drawer onClose={() => setSelectedCell(null)} open={Boolean(selectedCell)} title={drawerTitle ? t(drawerTitle) : t(selectedCell?.hour == null ? "当天排班明细" : "手动修改班次")}>
        {selectedCell ? (
          <div className="space-y-4">
            <div className={cn("rounded-[22px] p-4", isMobileSurface ? "bg-paper/70" : "merchant-dispatch-soft-panel")}>
              <p className="text-sm font-black text-ink">{selectedCell.date} {selectedCell.hour != null ? `${String(selectedCell.hour).padStart(2, "0")}:00` : ""}</p>
              <h4 className="mt-2 text-xl font-black text-ink">{t(selectedCell.title)}</h4>
              <p className="mt-2 text-sm leading-6 text-ink/60">{selectedCell.technicianName ? `${selectedCell.technicianName} · ` : ""}{t(selectedCell.detail)}</p>
              {selectedCell.hour == null ? <p className="mt-3 text-xs font-bold text-ink/45">{t("周 / 月视图用于查看当天汇总；要逐小时修改，请切到日视图或点击当天 24 小时明细。")}</p> : null}
            </div>
            {selectedCell.hour != null ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <Button onClick={() => adjustSelectedCell("confirmed")}>{t("标记确认")}</Button>
                <Button className={secondaryButtonClass} onClick={() => adjustSelectedCell("waitlisted")} variant="secondary">{t("标记候补")}</Button>
                <Button onClick={() => adjustSelectedCell("cancelled")} variant="danger">{t("取消班次")}</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
