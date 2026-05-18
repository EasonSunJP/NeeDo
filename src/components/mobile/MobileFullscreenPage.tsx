import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { getClientThemeClassName, useClientTheme } from "../../theme/ClientThemeProvider";

export function MobileFullscreenPage({
  children,
  className,
  innerClassName
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const { theme, isNight } = useClientTheme();

  const shell = (
    <div
      className={cn(
        "client-shell client-mobile-fullscreen-page fixed inset-0 z-50 isolate bg-[color:var(--client-bg)] text-[color:var(--client-text)]",
        isNight ? "client-theme-night" : "client-theme-day",
        getClientThemeClassName(theme),
        className
      )}
    >
      <div
        className={cn(
          "mx-auto relative flex h-full w-full max-w-[480px] flex-col overflow-hidden bg-[color:var(--client-bg)] shadow-soft",
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  );

  return typeof document === "undefined" ? shell : createPortal(shell, document.body);
}
