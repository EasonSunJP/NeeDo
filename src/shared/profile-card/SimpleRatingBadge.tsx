import { cn } from "../../lib/utils";

export function SimpleRatingBadge({ className, value }: { className?: string; value: number | string }) {
  const label = typeof value === "number" ? value.toFixed(1) : value;

  return (
    <span
      className={cn(
        "inline-flex h-[29px] min-w-12 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--client-text)_92%,transparent)] px-2 text-[12px] font-black leading-none text-[color:var(--client-surface)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-bg)_28%,transparent)] backdrop-blur-md",
        className
      )}
    >
      {label}
    </span>
  );
}
