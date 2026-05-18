import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function FloatingHomeHeader({
  children,
  dark = false,
  stacked = false,
  className,
  panelClassName,
  spacerClassName
}: {
  children: ReactNode;
  dark?: boolean;
  stacked?: boolean;
  className?: string;
  panelClassName?: string;
  spacerClassName?: string;
}) {
  return (
    <>
      <div aria-hidden="true" className={spacerClassName ?? (stacked ? "h-[calc(env(safe-area-inset-top)+140px)]" : "h-[calc(env(safe-area-inset-top)+80px)]")} />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[35]">
        <div className="pointer-events-auto mx-auto w-full max-w-[1600px] px-4">
          <div
            className={cn(
              "safe-header-top rounded-b-[28px] border px-4 pb-3 backdrop-blur-xl",
              dark
                ? "border-white/10 bg-[linear-gradient(180deg,rgba(11,15,14,0.94),rgba(17,24,23,0.84))] text-white shadow-[0_20px_42px_rgba(0,0,0,0.32)]"
                : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] text-[color:var(--client-text)] shadow-[0_18px_40px_rgba(0,0,0,0.1)]",
              panelClassName
            )}
          >
            <div className={cn("flex flex-col gap-3", className)}>{children}</div>
          </div>
        </div>
      </div>
    </>
  );
}
