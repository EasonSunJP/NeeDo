import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../../lib/utils";

export type ChartPointerState = {
  index: number;
  clientX?: number;
  clientY?: number;
  localX: number;
  localY: number;
  viewX: number;
  viewY: number;
};

export type ChartPointerTooltipItem = {
  label: string;
  value: string;
  detail?: string;
  color?: string;
  muted?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function resolveChartPointerState(
  event: ReactPointerEvent<SVGSVGElement>,
  {
    width,
    height,
    pointCount,
    xFor
  }: {
    width: number;
    height: number;
    pointCount: number;
    xFor: (index: number) => number;
  }
): ChartPointerState | null {
  if (pointCount <= 0) {
    return null;
  }

  const rect = event.currentTarget.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const localX = clamp(event.clientX - rect.left, 0, rect.width);
  const localY = clamp(event.clientY - rect.top, 0, rect.height);
  const viewX = (localX / rect.width) * width;
  const viewY = (localY / rect.height) * height;
  let index = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let candidateIndex = 0; candidateIndex < pointCount; candidateIndex += 1) {
    const distance = Math.abs(xFor(candidateIndex) - viewX);

    if (distance < nearestDistance) {
      index = candidateIndex;
      nearestDistance = distance;
    }
  }

  return {
    clientX: event.clientX,
    clientY: event.clientY,
    index,
    localX,
    localY,
    viewX,
    viewY
  };
}

export function ChartPointerTooltip({
  state,
  items,
  dark = false,
  strategy = "absolute",
  className
}: {
  state: ChartPointerState | null;
  items: ChartPointerTooltipItem[];
  dark?: boolean;
  strategy?: "absolute" | "fixed";
  className?: string;
}) {
  if (!state || items.length === 0) {
    return null;
  }

  const viewportWidth = typeof window === "undefined" ? 390 : window.innerWidth;
  const anchorX = strategy === "fixed" ? state.clientX ?? state.localX : state.localX;
  const anchorY = strategy === "fixed" ? state.clientY ?? state.localY : state.localY;
  const transformX = strategy === "fixed"
    ? anchorX > viewportWidth - 190
      ? "translateX(calc(-100% - 12px))"
      : "translateX(12px)"
    : state.localX > 190
      ? "translateX(calc(-100% - 12px))"
      : "translateX(12px)";
  const transformY = strategy === "fixed" && anchorY < 96 ? "translateY(14px)" : "translateY(calc(-100% - 14px))";

  return (
    <div
      className={cn(
        "pointer-events-none min-w-[154px] rounded-[16px] border px-3 py-2 text-left text-[11px] font-bold shadow-[0_18px_38px_rgba(0,0,0,0.26)] backdrop-blur-xl",
        strategy === "fixed" ? "fixed z-[220] max-w-[min(236px,calc(100vw-18px))]" : "absolute z-30 max-w-[min(236px,calc(100%-18px))]",
        dark
          ? "border-white/14 bg-[rgba(7,9,18,0.88)] text-white"
          : "border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_94%,white_6%)] text-[color:var(--client-text)]",
        className
      )}
      style={{
        left: anchorX,
        top: anchorY,
        transform: `${transformX} ${transformY}`
      }}
    >
      <div className="space-y-2">
        {items.map((item) => (
          <div className="min-w-0" key={`${item.label}-${item.value}-${item.detail ?? ""}`}>
            <div className="flex min-w-0 items-center gap-2">
              {item.color ? <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} /> : null}
              <span className={cn("truncate", item.muted ? (dark ? "text-white/55" : "text-[color:var(--client-muted)]") : dark ? "text-white/72" : "text-[color:var(--client-muted)]")}>
                {item.label}
              </span>
            </div>
            <strong className={cn("mt-0.5 block truncate text-[13px] font-black", item.muted ? (dark ? "text-white/68" : "text-[color:var(--client-muted)]") : dark ? "text-white" : "text-[color:var(--client-text)]")}>
              {item.value}
            </strong>
            {item.detail ? (
              <span className={cn("mt-0.5 block truncate", dark ? "text-white/52" : "text-[color:var(--client-soft-muted)]")}>
                {item.detail}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
