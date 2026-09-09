import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

export function ScheduleFloatingActions({
  children,
  columnCount,
  desktopClassName,
  mobileColumnsClassName,
  surface
}: {
  children: ReactNode;
  columnCount?: number;
  desktopClassName?: string;
  mobileColumnsClassName?: string;
  surface: "desktop" | "mobile";
}) {
  const isMobileSurface = surface === "mobile";

  return (
    <div
      className={cn(
        isMobileSurface
          ? "schedule-wizard-floating-frame pointer-events-none fixed inset-x-0 z-[100] mx-auto w-full pt-8"
          : desktopClassName ?? "flex flex-wrap items-center justify-center gap-3"
      )}
      data-schedule-wizard-bottom-actions="true"
      style={isMobileSurface
        ? {
            maxWidth: "var(--client-bottom-nav-max-width, 880px)",
            paddingLeft: "var(--client-bottom-nav-inline-gap, 12px)",
            paddingRight: "var(--client-bottom-nav-inline-gap, 12px)"
          }
        : columnCount
          ? { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }
          : undefined}
    >
      <div
        className={cn(
          isMobileSurface
            ? "schedule-wizard-floating-actions pointer-events-auto grid gap-3"
            : "contents",
          isMobileSurface && mobileColumnsClassName
        )}
        style={isMobileSurface && columnCount
          ? { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }
          : undefined}
      >
        {children}
      </div>
    </div>
  );
}
