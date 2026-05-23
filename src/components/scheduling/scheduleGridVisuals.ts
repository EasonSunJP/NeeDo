import type { CSSProperties } from "react";

export function getScheduleClosedCellStyle(surface: "desktop" | "mobile", backgroundOffsetX = 0, backgroundOffsetY = 0) {
  return {
    backgroundPosition: `${-backgroundOffsetX}px ${-backgroundOffsetY}px`,
    backgroundImage:
      surface === "mobile"
        ? "repeating-linear-gradient(135deg, color-mix(in srgb, var(--client-text) 26%, transparent) 0, color-mix(in srgb, var(--client-text) 26%, transparent) 16px, color-mix(in srgb, var(--client-elevated) 12%, transparent) 16px, color-mix(in srgb, var(--client-elevated) 12%, transparent) 32px)"
        : "repeating-linear-gradient(135deg, color-mix(in srgb, var(--client-text) 22%, transparent) 0, color-mix(in srgb, var(--client-text) 22%, transparent) 16px, color-mix(in srgb, var(--client-elevated) 12%, transparent) 16px, color-mix(in srgb, var(--client-elevated) 12%, transparent) 32px)"
  } satisfies CSSProperties;
}
