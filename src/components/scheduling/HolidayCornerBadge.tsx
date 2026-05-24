import { getJapaneseHoliday } from "../../lib/japaneseHolidays";
import { cn } from "../../lib/utils";

type HolidayCornerBadgeProps = {
  className?: string;
  date: string;
};

export function HolidayCornerBadge({ className, date }: HolidayCornerBadgeProps) {
  const holiday = getJapaneseHoliday(date);

  if (!holiday) {
    return null;
  }

  return (
    <span
      aria-label={`${holiday.title} · 祝日`}
      className={cn(
        "pointer-events-none absolute right-1 top-1 z-[6] inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,#ff5b57_72%,var(--client-bg)_28%)] bg-[#ff5b57] px-1 text-[9px] font-black leading-none text-white shadow-[0_0_12px_rgba(255,91,87,0.34)]",
        className
      )}
      title={holiday.title}
    >
      祝
    </span>
  );
}
