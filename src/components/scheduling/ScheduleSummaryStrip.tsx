import type { CSSProperties } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";

export type ScheduleSummaryStats = {
  booked: number;
  confirmed: number;
  conflicts: number;
  pending: number;
};

type ScheduleSummarySurface = "desktop" | "mobile";

export function summarizeDispatchScheduleCells(cells: Array<{ status: string }>): ScheduleSummaryStats {
  return {
    booked: cells.filter((cell) => cell.status === "booked").length,
    confirmed: cells.filter((cell) => cell.status === "confirmed").length,
    conflicts: cells.filter((cell) => cell.status === "conflict").length,
    pending: cells.filter((cell) => cell.status === "pending").length
  };
}

function getSummaryItems(stats: ScheduleSummaryStats) {
  return [
    {
      accent: "var(--schedule-tone-scheduled-bg)",
      key: "confirmed",
      label: "已排班",
      value: stats.confirmed
    },
    {
      accent: "var(--schedule-tone-booked-bg)",
      key: "booked",
      label: "有预约",
      value: stats.booked
    },
    {
      accent: "var(--schedule-tone-conflict-pending-bg)",
      key: "conflicts",
      label: "冲突",
      value: stats.conflicts
    },
    {
      accent: "var(--schedule-tone-conflict-pending-bg)",
      key: "pending",
      label: "待定",
      value: stats.pending
    }
  ];
}

export function ScheduleSummaryStrip({
  className,
  stats,
  surface
}: {
  className?: string;
  stats: ScheduleSummaryStats;
  surface: ScheduleSummarySurface;
}) {
  const isMobileSurface = surface === "mobile";
  const { language } = useI18n();

  return (
    <div className={cn("grid grid-cols-4 gap-1.5 sm:gap-2", className)}>
      {getSummaryItems(stats).map((item) => (
        <article
          className={cn(
            "min-w-0 rounded-[14px] border px-2 py-2 sm:rounded-2xl sm:px-3",
            isMobileSurface
              ? "border-[color:color-mix(in_srgb,var(--schedule-summary-accent)_34%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--schedule-summary-accent)_10%,var(--client-surface)_90%)] text-[color:var(--client-text)]"
              : "border-[color:color-mix(in_srgb,var(--schedule-summary-accent)_32%,var(--admin-line))] bg-[color:color-mix(in_srgb,var(--schedule-summary-accent)_8%,var(--admin-surface)_92%)] text-[color:var(--admin-text)]"
          )}
          key={item.key}
          style={{ "--schedule-summary-accent": item.accent } as CSSProperties}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--schedule-summary-accent)] shadow-[0_0_12px_color-mix(in_srgb,var(--schedule-summary-accent)_58%,transparent)]" />
            <p className={cn("min-w-0 truncate text-[10px] font-black leading-3 sm:text-[11px]", isMobileSurface ? "text-[color:var(--client-muted)]" : "text-[color:var(--admin-muted)]")}>
              {translateText(item.label, language)}
            </p>
          </div>
          <strong className="mt-1 block truncate text-lg font-black leading-none sm:text-xl">{item.value}</strong>
        </article>
      ))}
    </div>
  );
}
