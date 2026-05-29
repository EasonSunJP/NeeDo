import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "../../lib/utils";

type ScheduleDraftRangeBlockProps = {
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  onBlockPointerCancel?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBlockPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBlockPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBlockPointerUp?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onEndHandlePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onHandlePointerCancel?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onHandlePointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onHandlePointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onStartHandlePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
  subtitle?: ReactNode;
  timeRange: string;
  title: string;
};

export const scheduleDraftRangeVisualMinHeight = 34;

export function ScheduleDraftRangeBlock({
  action,
  className,
  compact = false,
  onBlockPointerCancel,
  onBlockPointerDown,
  onBlockPointerMove,
  onBlockPointerUp,
  onEndHandlePointerDown,
  onHandlePointerCancel,
  onHandlePointerMove,
  onHandlePointerUp,
  onStartHandlePointerDown,
  style,
  subtitle,
  timeRange,
  title
}: ScheduleDraftRangeBlockProps) {
  const handleClassName =
    cn("pointer-events-auto absolute left-1/2 z-30 grid h-7 -translate-x-1/2 touch-none place-items-center rounded-full text-[color:var(--client-primary)]", compact ? "w-16" : "w-28");
  const handleBarClassName = cn(
    "h-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_70%,white_30%)] bg-[color:var(--client-primary)] shadow-[0_0_10px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]",
    compact ? "w-10" : "w-20"
  );

  return (
    <div
      className={cn(
        "absolute z-20 overflow-visible border border-[color:color-mix(in_srgb,var(--client-primary)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,var(--client-surface)_86%)] text-[color:var(--client-primary-strong)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-primary)_12%,transparent)]",
        compact ? "rounded-[12px] px-1 py-1" : "rounded-[16px] px-3 py-1",
        onBlockPointerDown && "touch-none cursor-grab active:cursor-grabbing",
        className
      )}
      data-schedule-draft-range-block="true"
      onPointerCancel={onBlockPointerCancel}
      onPointerDown={onBlockPointerDown}
      onPointerMove={onBlockPointerMove}
      onPointerUp={onBlockPointerUp}
      style={style}
    >
      <button
        aria-label="向上拉伸开始时间"
        className={cn(handleClassName, "top-0 -translate-y-1/2")}
        data-schedule-range-handle="start"
        onPointerCancel={onHandlePointerCancel}
        onPointerDown={onStartHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        type="button"
      >
        <span className={handleBarClassName} />
      </button>
      <button
        aria-label="向下拉伸结束时间"
        className={cn(handleClassName, "bottom-0 translate-y-1/2")}
        data-schedule-range-handle="end"
        onPointerCancel={onHandlePointerCancel}
        onPointerDown={onEndHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        type="button"
      >
        <span className={handleBarClassName} />
      </button>

      <div className={cn("pointer-events-none flex min-h-full min-w-0 flex-col justify-center", action ? compact ? "pr-8" : "pr-24" : "")}>
        <strong className={cn("block truncate font-black", compact ? "text-[10px] leading-[11px]" : "text-[12px] leading-[14px]")}>{title}</strong>
        <span className={cn("block truncate font-bold opacity-80", compact ? "text-[9px] leading-[10px]" : "text-[10px] leading-[11px]")}>{timeRange}</span>
        {subtitle ? <span className="sr-only">{subtitle}</span> : null}
      </div>
      {action ? <div className={cn("pointer-events-auto absolute top-1/2 z-30 -translate-y-1/2", compact ? "right-1" : "right-3")}>{action}</div> : null}
    </div>
  );
}
