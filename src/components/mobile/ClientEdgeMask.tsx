import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";

export function ClientEdgeMask({
  edge,
  mode = "fixed",
  className,
  style
}: {
  edge: "top" | "bottom";
  mode?: "fixed" | "absolute";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "client-edge-mask",
        edge === "top" ? "client-edge-mask--top" : "client-edge-mask--bottom",
        mode === "absolute" ? "client-edge-mask--absolute" : "",
        className
      )}
      style={style}
    />
  );
}
