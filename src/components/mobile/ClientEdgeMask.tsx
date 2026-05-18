import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { useClientTheme } from "../../theme/ClientThemeProvider";

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
  const { isNight } = useClientTheme();
  const maskStyle = {
    "--client-edge-mask-rgb": isNight ? "0 0 0" : "255 255 255",
    ...style
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "client-edge-mask",
        edge === "top" ? "client-edge-mask--top" : "client-edge-mask--bottom",
        mode === "absolute" ? "client-edge-mask--absolute" : "",
        className
      )}
      style={maskStyle}
    />
  );
}
