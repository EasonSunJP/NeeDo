import { cn } from "../../lib/utils";

export function SimpleRatingBadge({ className, compact = false, value }: { className?: string; compact?: boolean; value: number | string }) {
  const label = typeof value === "number" ? value.toFixed(1) : value;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--client-text)_92%,transparent)] font-black leading-none text-[color:var(--client-surface)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-bg)_28%,transparent)] backdrop-blur-md",
        compact ? "h-[25px] min-w-[38px] px-1.5 text-[11px]" : "h-[29px] min-w-12 px-2 text-[12px]",
        className
      )}
    >
      {label}
    </span>
  );
}
