import { Badge, type BadgeTone } from "../ui/Badge";
import {
  dispatchReferenceDateKey,
  getCycleStatusLabel,
  type DispatchCycle
} from "../../features/dispatch-center/domain";
import { cn } from "../../lib/utils";

export type SchedulingCycleSurface = "desktop" | "mobile";
export type SchedulingCycleSlotKey = "current" | "next" | "builder";

export type SchedulingCycleTab = {
  key: SchedulingCycleSlotKey;
  label: string;
  cycle: DispatchCycle | null;
  disabled?: boolean;
  onClick: () => void;
  tone?: BadgeTone;
};

export function isSchedulingLiveCycle(cycle: DispatchCycle) {
  return cycle.status !== "completed" && cycle.status !== "archived" && cycle.status !== "cancelled";
}

export function resolveSchedulingCurrentCycle(cycles: DispatchCycle[]) {
  return (
    cycles.find((cycle) => cycle.status === "active")
    ?? cycles.find((cycle) => cycle.periodStart <= dispatchReferenceDateKey && cycle.periodEnd >= dispatchReferenceDateKey)
    ?? cycles[0]
    ?? null
  );
}

export function resolveSchedulingCycleSlots(cycles: DispatchCycle[], currentCycle: DispatchCycle | null) {
  const futureCycles = cycles
    .filter((cycle) => cycle.id !== currentCycle?.id)
    .sort((left, right) => left.periodStart.localeCompare(right.periodStart));
  const builderCycle = futureCycles.find((cycle) => cycle.status === "draft" || cycle.status === "rule_setting" || cycle.status === "rule_ready") ?? null;
  const nextCycle = futureCycles.find((cycle) => cycle.id !== builderCycle?.id) ?? null;

  return {
    builderCycle: builderCycle ?? futureCycles.find((cycle) => cycle.id !== nextCycle?.id) ?? null,
    nextCycle
  };
}

export function resolveSchedulingCycleTone(cycle: DispatchCycle | null): BadgeTone {
  if (!cycle) {
    return "neutral";
  }

  if (cycle.status === "active") {
    return "green";
  }

  if (cycle.status === "final_confirmed" || cycle.status === "confirmed" || cycle.status === "smart_generated") {
    return "blue";
  }

  if (cycle.status === "feedback_closed" || cycle.status === "ready_to_confirm" || cycle.status === "smart_exception_pending" || cycle.status === "smart_failed" || cycle.status === "manual_override") {
    return "red";
  }

  if (cycle.status === "draft" || cycle.status === "rule_setting" || cycle.status === "rule_ready" || cycle.status === "collecting_feedback" || cycle.status === "smart_generating" || cycle.status === "smart_recalculating") {
    return "yellow";
  }

  return "neutral";
}

function formatCycleEndDate(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `~${Number(month)}月${Number(day)}日`;
}

function getSlotPeriod(cycle: DispatchCycle | null) {
  return cycle ? formatCycleEndDate(cycle.periodEnd) : "未创建";
}

function SchedulingCycleTabButton({
  active,
  cycle,
  disabled,
  label,
  onClick,
  surface,
  tone
}: Omit<SchedulingCycleTab, "key"> & {
  active: boolean;
  surface: SchedulingCycleSurface;
}) {
  const isMobileSurface = surface === "mobile";

  return (
    <button
      aria-pressed={active}
      className={cn(
        "h-full min-w-0 rounded-[18px] border px-2.5 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 sm:rounded-[22px] sm:px-4",
        isMobileSurface
          ? active
            ? "border-transparent bg-[color:var(--client-primary)] text-[#090806] shadow-[0_14px_34px_color-mix(in_srgb,var(--client-primary)_26%,transparent)]"
            : "border-[color:color-mix(in_srgb,var(--client-line)_44%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-text)] hover:border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)]"
          : "merchant-dispatch-cycle-card",
        !isMobileSurface && active && "is-active"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <strong className="truncate text-sm font-black sm:text-base">{label}</strong>
        <Badge className="max-w-full truncate px-1.5 text-[10px] sm:px-2 sm:text-xs" tone={tone ?? resolveSchedulingCycleTone(cycle)}>
          {cycle ? getCycleStatusLabel(cycle.status) : "未创建"}
        </Badge>
      </div>
      <p className="mt-2 truncate text-xs font-semibold opacity-75 sm:text-sm">{getSlotPeriod(cycle)}</p>
    </button>
  );
}

export function SchedulingCycleTabs({
  activeSlot,
  className,
  slots,
  surface
}: {
  activeSlot: SchedulingCycleSlotKey;
  className?: string;
  slots: SchedulingCycleTab[];
  surface: SchedulingCycleSurface;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-2 sm:gap-3", className)}>
      {slots.map((slot) => (
        <SchedulingCycleTabButton
          active={activeSlot === slot.key}
          cycle={slot.cycle}
          disabled={slot.disabled}
          key={slot.key}
          label={slot.label}
          onClick={slot.onClick}
          surface={surface}
          tone={slot.tone ?? resolveSchedulingCycleTone(slot.cycle)}
        />
      ))}
    </div>
  );
}
