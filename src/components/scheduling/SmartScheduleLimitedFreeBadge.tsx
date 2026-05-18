import { cn } from "../../lib/utils";

export function SmartScheduleLimitedFreeBadge({
  className,
  surface = "desktop"
}: {
  className?: string;
  surface?: "desktop" | "mobile";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-black leading-4",
        surface === "mobile"
          ? "border-[color:color-mix(in_srgb,var(--client-warm)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--client-warm)_16%,transparent)] text-[color:color-mix(in_srgb,var(--client-warm)_84%,var(--client-text)_16%)]"
          : "border-[color:color-mix(in_srgb,var(--admin-warning)_34%,var(--admin-line))] bg-[color:var(--merchant-dispatch-warning-bg)] text-[color:var(--merchant-dispatch-warning-text)]",
        className
      )}
    >
      限定免费
    </span>
  );
}
