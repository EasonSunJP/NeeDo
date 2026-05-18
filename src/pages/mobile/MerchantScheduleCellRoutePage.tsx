import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { ScheduleCellDetailContent } from "../../features/dispatch-center/components/ScheduleCellDetailContent";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import {
  getDispatchOverviewSummary,
  getDispatchScheduleGrid,
  useDispatchCenterStore,
  type DispatchScheduleCell,
  type DispatchScheduleRow
} from "../../features/dispatch-center/store";
import { useEntityStore } from "../../state/entityStore";

const fullscreenHeaderClassName =
  "";

function summarizeRowDate(row: DispatchScheduleRow, date: string): DispatchScheduleCell {
  const bookedCount = row.cells.filter((cell) => cell.status === "booked").length;
  const confirmedCount = row.cells.filter((cell) => cell.status === "confirmed").length;
  const conflictCount = row.cells.filter((cell) => cell.status === "conflict").length;
  const pendingCount = row.cells.filter((cell) => cell.status === "pending").length;
  const otherCount = row.cells.filter((cell) => cell.status === "other").length;
  const openCount = row.cells.filter((cell) => cell.status === "open").length;
  const status: DispatchScheduleCell["status"] =
    conflictCount > 0
      ? "conflict"
      : bookedCount > 0
        ? "booked"
        : confirmedCount > 0
          ? "confirmed"
          : pendingCount > 0
            ? "pending"
            : otherCount > 0
              ? "other"
              : openCount > 0
                ? "open"
                : "closed";

  return {
    id: `${row.technicianId}-${date}-day`,
    date,
    hour: null,
    technicianId: row.technicianId,
    technicianName: row.technicianName,
    status,
    title:
      conflictCount > 0
        ? `${conflictCount} 个冲突`
        : bookedCount > 0
          ? `${bookedCount} 个预约`
          : confirmedCount > 0
            ? `${confirmedCount} 个确认班次`
            : pendingCount > 0
              ? `${pendingCount} 个待定`
              : openCount > 0
                ? "开放中"
                : "未开放",
    detail: `${confirmedCount} 确认 / ${bookedCount} 预约 / ${pendingCount} 待定 / ${otherCount} 其他`,
    darkened: row.cells.every((cell) => cell.darkened),
    isCurrent: row.cells.some((cell) => cell.isCurrent)
  };
}

function findRouteCell({
  activeCycleId,
  date,
  slot,
  storeId,
  technicianId
}: {
  activeCycleId?: string | null;
  date?: string;
  slot?: string;
  storeId: string;
  technicianId?: string;
}) {
  if (!date || !slot) {
    return null;
  }

  const grid = getDispatchScheduleGrid(storeId, "day", date, activeCycleId ?? null);
  const decodedTechnicianId = technicianId ? decodeURIComponent(technicianId) : "";
  const row =
    grid.rows.find((item) => item.technicianId === decodedTechnicianId) ??
    grid.rows[0];

  if (!row) {
    return null;
  }

  if (slot === "day") {
    return summarizeRowDate(row, date);
  }

  const hour = Number(slot);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }

  return row.cells.find((cell) => cell.hour === hour) ?? null;
}

export function MerchantScheduleCellRoutePage() {
  const navigate = useNavigate();
  const { date, slot, technicianId } = useParams();
  const { language } = useI18n();
  const { session } = useAuth();
  const { stores } = useEntityStore();
  const dispatchSnapshot = useDispatchCenterStore();
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const summary = useMemo(() => getDispatchOverviewSummary(store.id), [dispatchSnapshot.revision, store.id]);
  const cell = useMemo(
    () =>
      findRouteCell({
        activeCycleId: summary.activeCycle?.id,
        date,
        slot,
        storeId: store.id,
        technicianId
      }),
    [date, dispatchSnapshot.revision, slot, store.id, summary.activeCycle?.id, technicianId]
  );
  const t = (text: string) => translateText(text, language);

  return (
    <MobileShell navItems={[]}>
      <MobileFullscreenPage>
        <MobileFullscreenHeader
          className={fullscreenHeaderClassName}
          onClose={() => navigate("/merchant/schedule")}
          title={t("日程格详情")}
        />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28">
          {cell ? (
            <ScheduleCellDetailContent cell={cell} surface="mobile" />
          ) : (
            <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] p-4">
              <p className="text-sm font-black text-[color:var(--client-text)]">{t("当前日程记录不存在")}</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{t("可能已被调整或不属于当前门店，请返回日程重新选择。")}</p>
            </section>
          )}
        </main>
      </MobileFullscreenPage>
    </MobileShell>
  );
}
