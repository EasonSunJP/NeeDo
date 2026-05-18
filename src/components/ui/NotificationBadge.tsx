import { cn } from "../../lib/utils";

type NotificationBadgeSize = "sm" | "md" | "lg";

const sizeClassName: Record<NotificationBadgeSize, string> = {
  sm: "h-5 min-w-5 px-1 text-[10px]",
  md: "h-6 min-w-6 px-1.5 text-[10px]",
  lg: "h-7 min-w-7 px-2 text-[11px]"
};

export function NotificationBadge({
  count,
  className,
  size = "md"
}: {
  count: number;
  className?: string;
  size?: NotificationBadgeSize;
}) {
  const displayCount = count > 99 ? "99+" : String(count);

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-white/75 bg-[linear-gradient(180deg,#ff8b7f_0%,#ff5f58_48%,#ff453f_100%)] font-black leading-none text-white shadow-[0_5px_14px_rgba(255,86,79,0.28)]",
        sizeClassName[size],
        className
      )}
    >
      {displayCount}
    </span>
  );
}
