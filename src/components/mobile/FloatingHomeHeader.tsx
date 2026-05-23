import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../../lib/utils";

const floatingHeaderFrameGapPx = 8;

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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [measuredSpacerHeight, setMeasuredSpacerHeight] = useState<number | null>(null);
  const fallbackSpacerClassName = stacked ? "h-[calc(env(safe-area-inset-top)+140px)]" : "h-[calc(env(safe-area-inset-top)+80px)]";
  const spacerStyle: CSSProperties | undefined = !spacerClassName && measuredSpacerHeight ? { height: measuredSpacerHeight } : undefined;

  useEffect(() => {
    if (spacerClassName) {
      return undefined;
    }

    const panel = panelRef.current;
    if (!panel) {
      return undefined;
    }

    const updateSpacerHeight = () => {
      setMeasuredSpacerHeight(Math.ceil(panel.getBoundingClientRect().height) + floatingHeaderFrameGapPx);
    };

    updateSpacerHeight();

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateSpacerHeight);
    resizeObserver?.observe(panel);
    window.addEventListener("resize", updateSpacerHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateSpacerHeight);
    };
  }, [spacerClassName]);

  return (
    <>
      <div aria-hidden="true" className={spacerClassName ?? fallbackSpacerClassName} style={spacerStyle} />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[35]">
        <div className="pointer-events-auto mx-auto w-full max-w-[1600px] px-4">
          <div
            ref={panelRef}
            className={cn(
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
