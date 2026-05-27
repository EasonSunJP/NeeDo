import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../../lib/utils";

const floatingHeaderFrameGapPx = 8;

export const floatingHeaderLiquidGlassClassName = "client-liquid-glass-header";
export const floatingHeaderGlassPanelClassName =
  `${floatingHeaderLiquidGlassClassName} client-floating-header-glass-frame !rounded-b-[28px] !rounded-t-none !border-transparent !px-0 !pb-0 !shadow-none`;
export const floatingHeaderInnerClassName = "px-3 pb-3";
export const floatingHeaderPillSurfaceClassName =
  "rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] shadow-[0_12px_30px_rgba(0,0,0,0.07)]";
export const floatingHeaderSearchRowClassName = "flex h-10 w-full items-center gap-1.5";
export const floatingHeaderSearchFieldClassName =
  `flex h-10 min-w-0 flex-1 items-center gap-2.5 px-3 ${floatingHeaderPillSurfaceClassName} bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)]`;
export const floatingHeaderSearchIconClassName = "h-4 w-4 shrink-0 text-[color:var(--client-soft-muted)]";
export const floatingHeaderSearchTextClassName = "min-w-0 flex-1 truncate text-[13px] font-semibold leading-none text-[color:var(--client-muted)]";
export const floatingHeaderSearchInputClassName =
  "h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)]";
export const floatingHeaderSearchActionClassName =
  "focus-ring inline-flex h-10 min-w-[60px] shrink-0 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-3.5 text-[14px] font-black text-[color:var(--pin-badge-glyph)] shadow-[0_8px_18px_color-mix(in_srgb,var(--client-primary)_22%,transparent)] transition active:scale-[0.97]";

export function FloatingHomeHeader({
  children,
  dark = false,
  stacked = false,
  className,
  frameClassName,
  maxWidth = "var(--client-bottom-nav-max-width, 880px)",
  inlineGap = "var(--client-bottom-nav-inline-gap, 12px)",
  panelClassName,
  spacerClassName,
  showSpacer = true,
  spacerGapPx = floatingHeaderFrameGapPx
}: {
  children: ReactNode;
  dark?: boolean;
  stacked?: boolean;
  className?: string;
  frameClassName?: string;
  maxWidth?: CSSProperties["maxWidth"];
  inlineGap?: CSSProperties["paddingLeft"];
  panelClassName?: string;
  spacerClassName?: string;
  showSpacer?: boolean;
  spacerGapPx?: number;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [measuredSpacerHeight, setMeasuredSpacerHeight] = useState<number | null>(null);
  const fallbackSpacerClassName = stacked ? "h-[calc(env(safe-area-inset-top)+140px)]" : "h-[calc(env(safe-area-inset-top)+80px)]";
  const spacerStyle: CSSProperties | undefined = showSpacer && !spacerClassName && measuredSpacerHeight ? { height: measuredSpacerHeight } : undefined;

  useEffect(() => {
    if (spacerClassName || !showSpacer) {
      return undefined;
    }

    const panel = panelRef.current;
    if (!panel) {
      return undefined;
    }

    const updateSpacerHeight = () => {
      setMeasuredSpacerHeight(Math.ceil(panel.getBoundingClientRect().height) + spacerGapPx);
    };

    updateSpacerHeight();

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateSpacerHeight);
    resizeObserver?.observe(panel);
    window.addEventListener("resize", updateSpacerHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateSpacerHeight);
    };
  }, [showSpacer, spacerClassName, spacerGapPx]);

  return (
    <>
      {showSpacer ? <div aria-hidden="true" className={spacerClassName ?? fallbackSpacerClassName} style={spacerStyle} /> : null}
      <div className={cn("pointer-events-none fixed inset-x-0 top-0 z-[35] !mt-0", frameClassName)} data-page-drag-ignore="true">
        <div
          className="pointer-events-auto mx-auto w-full"
          style={{
            maxWidth,
            paddingLeft: inlineGap,
            paddingRight: inlineGap
          }}
        >
          <div
            ref={panelRef}
            className={cn(
              floatingHeaderLiquidGlassClassName,
              "safe-header-top rounded-b-[28px] border px-4 pb-3 backdrop-blur-2xl backdrop-saturate-150",
              dark
                ? "border-white/10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-top-chrome-bg)_28%,transparent),color-mix(in_srgb,var(--client-bg)_10%,transparent))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_42px_color-mix(in_srgb,var(--client-bg)_22%,transparent)]"
                : "border-[color:color-mix(in_srgb,var(--client-line)_52%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_34%,transparent),color-mix(in_srgb,var(--client-bg)_8%,transparent))] text-[color:var(--client-text)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--client-elevated)_22%,transparent),0_18px_40px_color-mix(in_srgb,var(--client-bg)_18%,transparent)]",
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
