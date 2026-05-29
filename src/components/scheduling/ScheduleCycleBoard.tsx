import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppIcon } from "../client-ui/AppScaffold";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { buildCurrentRoute, withReturnTo } from "../../lib/navigationReturn";
import { cn } from "../../lib/utils";
import { resolveScheduleEventDetailTarget } from "../../lib/scheduleDetailTarget";
import { useEntityStore } from "../../state/entityStore";
import {
  adjustDispatchFinalShift,
  getDispatchCycleList,
  useDispatchCenterStore,
  type DispatchScheduleCell
} from "../../features/dispatch-center/store";
import {
  dispatchReferenceDateKey,
  type DispatchCycle
} from "../../features/dispatch-center/domain";
import {
  isSchedulingLiveCycle,
  resolveSchedulingCurrentCycle,
  resolveSchedulingCycleSlots
} from "./SchedulingCycleTabs";
import { ScheduleContactInfoPanel } from "./ScheduleContactInfoPanel";
import { ScheduleCycleCalendarBoard, type ScheduleCycleCalendarBoardView } from "./ScheduleCycleCalendarBoard";

type ScheduleCycleBoardSurface = "desktop" | "mobile";

function getDefaultDateForCycle(cycle: DispatchCycle) {
  if (cycle.periodStart <= dispatchReferenceDateKey && cycle.periodEnd >= dispatchReferenceDateKey) {
    return dispatchReferenceDateKey;
  }

  return cycle.periodStart;
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
  const [view, setView] = useState<ScheduleCycleCalendarBoardView>("day");
  const [dateKey, setDateKey] = useState(getDefaultDateForCycle(cycle));
  const [editing, setEditing] = useState(!editingToggle);
  const [selectedCell, setSelectedCell] = useState<DispatchScheduleCell | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useI18n();
  const { stores } = useEntityStore();
  const dispatchSnapshot = useDispatchCenterStore();
  const isMobileSurface = surface === "mobile";
  const currentStore = useMemo(() => stores.find((store) => store.id === storeId) ?? stores[0], [storeId, stores]);
  const secondaryButtonClass = isMobileSurface ? "bg-white/80" : undefined;
  const cycleClusterClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-cycle-cluster";
  const editIconButtonClass = cn(
    "focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border transition",
    isMobileSurface
      ? editing
        ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_10px_24px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]"
        : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] text-[color:var(--client-muted)] hover:text-[color:var(--client-primary)]"
      : editing
        ? "border-[color:var(--admin-accent)] bg-[color:var(--admin-accent)] text-[color:var(--merchant-dispatch-on-accent,#fff)] shadow-[0_12px_26px_color-mix(in_srgb,var(--admin-accent)_26%,transparent)]"
        : "merchant-dispatch-toggle"
  );
  const schedulingCycles = useMemo(
    () => getDispatchCycleList(storeId).filter(isSchedulingLiveCycle).sort((left, right) => left.periodStart.localeCompare(right.periodStart)),
    [dispatchSnapshot.revision, storeId]
  );
  const schedulingCurrentCycle = useMemo(() => resolveSchedulingCurrentCycle(schedulingCycles), [schedulingCycles]);
  const schedulingCycleSlots = useMemo(() => resolveSchedulingCycleSlots(schedulingCycles, schedulingCurrentCycle), [schedulingCurrentCycle, schedulingCycles]);
  const contactScope = cycle.id === schedulingCurrentCycle?.id ? "current" : cycle.id === schedulingCycleSlots.nextCycle?.id ? "next" : "builder";
  const contactExcludedRanges = useMemo(
    () => [schedulingCurrentCycle, schedulingCycleSlots.nextCycle]
      .filter((item): item is DispatchCycle => Boolean(item))
      .map((item) => ({ start: item.periodStart, end: item.periodEnd })),
    [schedulingCurrentCycle, schedulingCycleSlots.nextCycle]
  );
  const canSelectCells = selectable && (!editingToggle || editing);
  const hasBoardToolbar = Boolean(editingToggle || toolbarActions);
  const t = (text: string) => translateText(text, language);

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
      const returnTo = buildCurrentRoute(location);
      navigate(withReturnTo(target.route, returnTo), { state: { returnTo } });
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

      <div className="space-y-3">
        {hasBoardToolbar ? (
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
            {toolbarActions}
          </div>
        ) : null}

        <ScheduleCycleCalendarBoard
          cycleId={cycle.id}
          dateKey={dateKey}
          getTechnicianDetailPath={(technicianId) => `/merchant/staff/${encodeURIComponent(technicianId)}`}
          onDateChange={changeScheduleDate}
          onOpenCell={canSelectCells ? selectScheduleCell : (cell) => openDateSchedule(cell.date)}
          onViewChange={setView}
          scheduleStickyTop={scheduleStickyTop}
          storeId={storeId}
          subtitle={`${currentStore?.name ?? storeId} · ${t("排班")}`}
          surface={surface}
          view={view}
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
