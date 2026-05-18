import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { ClientEdgeMask } from "./ClientEdgeMask";

export function MobileBottomActionBar({
  children,
  className,
  contentClassName,
  maskClassName,
  maskStyle
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  maskClassName?: string;
  maskStyle?: CSSProperties;
}) {
  return (
    <>
      <ClientEdgeMask
        className={cn("z-20", maskClassName)}
        edge="bottom"
        mode="absolute"
        style={{
          "--client-edge-mask-bottom-height": "calc(env(safe-area-inset-bottom,0px) + 9.75rem)",
          "--client-edge-mask-bottom-mid-opacity": "0.58",
          "--client-edge-mask-bottom-mid-stop": "40%",
          "--client-edge-mask-bottom-strong-opacity": "0.94",
          "--client-edge-mask-bottom-strong-stop": "76%",
          ...maskStyle
        } as CSSProperties}
      />
      <footer
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+12px)] pt-10",
          className
        )}
      >
        <div className={cn("pointer-events-auto", contentClassName)}>
          {children}
        </div>
      </footer>
    </>
  );
}
