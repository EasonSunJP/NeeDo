import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "../../lib/utils";

type ScheduleDraftRangeBlockProps = {
  action?: ReactNode;
  className?: string;
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

export function ScheduleDraftRangeBlock({
  action,
  className,
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
    "pointer-events-auto absolute left-1/2 z-30 grid h-8 w-32 -translate-x-1/2 touch-none place-items-center rounded-full text-[color:var(--client-primary)]";
  const handleBarClassName = "h-2 w-24 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_84%,white_16%)] bg-[color:var(--client-primary)] shadow-[0_0_14px_color-mix(in_srgb,var(--client-primary)_36%,transparent)]";

  return (
    <div
      className={cn(
        "absolute z-20 overflow-visible rounded-[20px] border-2 border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-primary)_18%,var(--client-surface)_82%)] px-4 py-2.5 text-[color:var(--client-primary-strong)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--client-primary)_14%,transparent)]",
        className
      )}
      data-schedule-draft-range-block="true"
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

      <div className={cn("pointer-events-none flex min-h-full min-w-0 flex-col justify-center", action ? "pr-24" : "")}>
        <strong className="block truncate text-[14px] font-black leading-5">{title}</strong>
        <span className="mt-0.5 block truncate text-[13px] font-black leading-4">{timeRange}</span>
        {subtitle ? <span className="sr-only">{subtitle}</span> : null}
      </div>
      {action ? <div className="pointer-events-auto absolute right-3 top-1/2 z-30 -translate-y-1/2">{action}</div> : null}
    </div>
  );
}
