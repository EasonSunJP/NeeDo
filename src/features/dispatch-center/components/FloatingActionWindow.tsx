import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { cn } from "../../../lib/utils";
import type { DispatchFloatingTask } from "../domain";

const LONG_PRESS_MS = 260;
const EDGE_GAP = 12;
const MINIMIZE_ANIMATION_MS = 220;
const WINDOW_COLLAPSE_MS = 280;

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  dragging: boolean;
  timer: number | null;
};

function getDragHost(element: HTMLElement) {
  return element.tagName === "BUTTON" ? element : (element.parentElement as HTMLElement | null) ?? element;
}

function FloatingTaskMinimizeIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M6.75 17.25V6.75h10.5v4.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      <path d="m11.75 12.25 5.5 5.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      <path d="M13.9 17.75h3.35V14.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  );
}

export function FloatingActionWindow({
  onMinimize,
  onRestoreAll,
  onSelect,
  surface,
  tasks
}: {
  onMinimize: (taskId: string, minimized: boolean) => void;
  onRestoreAll: () => void;
  onSelect: (task: DispatchFloatingTask) => void;
  surface: "desktop" | "mobile";
  tasks: DispatchFloatingTask[];
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [minimizingTaskIds, setMinimizingTaskIds] = useState<string[]>([]);
  const [windowCollapsing, setWindowCollapsing] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const animationTimersRef = useRef<Map<string, number>>(new Map());
  const suppressClickRef = useRef(false);
  const isMobileSurface = surface === "mobile";
  const allMinimized = tasks.every((task) => task.minimized);
  const visibleTaskCount = tasks.filter((task) => !task.minimized).length;
  const mobileWindowClassName =
    "w-[min(352px,calc(100vw-24px))] border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(54,45,44,0.96)_0%,rgba(24,27,29,0.98)_22%,rgba(16,18,20,0.99)_100%)] shadow-[0_28px_64px_rgba(0,0,0,0.58)] backdrop-blur-2xl";
  const mobileHeaderClassName =
    "touch-none bg-[linear-gradient(135deg,rgba(108,76,72,0.94)_0%,rgba(74,57,56,0.92)_58%,rgba(54,44,44,0.9)_100%)]";
  const mobileListClassName = "border-t border-[rgba(255,255,255,0.06)] bg-[rgba(11,13,15,0.2)]";
  const mobileCardClassName =
    "border-[rgba(255,255,255,0.1)] bg-[linear-gradient(180deg,rgba(66,69,72,0.9)_0%,rgba(44,47,50,0.92)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_36px_rgba(0,0,0,0.22)]";
  const mobileMinimizeClassName =
    "focus-ring grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] text-[color:var(--client-primary)] shadow-[0_12px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:bg-[color:var(--client-primary)] hover:text-[#090806]";
  const mobileActionClassName =
    "bg-[#c7ff00] text-[#1a1d12] shadow-[0_16px_30px_rgba(167,216,0,0.28)]";

  useEffect(() => {
    return () => {
      if (dragStateRef.current?.timer != null) {
        window.clearTimeout(dragStateRef.current.timer);
      }

      animationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      animationTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    setMinimizingTaskIds((current) => current.filter((taskId) => tasks.some((task) => task.id === taskId && !task.minimized)));
  }, [tasks]);

  if (tasks.length === 0) {
    return null;
  }

  const clampPosition = (x: number, y: number, width: number, height: number) => ({
    x: Math.min(Math.max(EDGE_GAP, x), Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP)),
    y: Math.min(Math.max(EDGE_GAP, y), Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP))
  });

  const beginLongPress = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isMobileSurface) {
      return;
    }

    const element = event.currentTarget;
    const host = getDragHost(element);
    const rect = host.getBoundingClientRect();
    element.setPointerCapture(event.pointerId);

    if (dragStateRef.current?.timer != null) {
      window.clearTimeout(dragStateRef.current.timer);
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      dragging: false,
      timer: window.setTimeout(() => {
        dragStateRef.current = dragStateRef.current
          ? { ...dragStateRef.current, dragging: true, timer: null }
          : null;
        setPosition(clampPosition(rect.left, rect.top, rect.width, rect.height));
      }, LONG_PRESS_MS)
    };
  };

  const moveWhileDragging = (event: ReactPointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    if (!state.dragging) {
      const movedDistance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (movedDistance > 8 && state.timer != null) {
        window.clearTimeout(state.timer);
        dragStateRef.current = { ...state, timer: null };
      }
      return;
    }

    event.preventDefault();
    const element = getDragHost(event.currentTarget);
    setPosition(
      clampPosition(
        event.clientX - state.offsetX,
        event.clientY - state.offsetY,
        element.clientWidth,
        element.clientHeight
      )
    );
  };

  const finishDragging = (event: ReactPointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    if (state.timer != null) {
      window.clearTimeout(state.timer);
    }

    suppressClickRef.current = state.dragging;
    dragStateRef.current = null;
  };

  const floatingStyle = position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined;
  const defaultAnchorClass = isMobileSurface ? "bottom-[calc(env(safe-area-inset-bottom)+104px)] right-4" : "bottom-5 right-5";
  const handleMinimize = (taskId: string) => {
    if (minimizingTaskIds.includes(taskId) || windowCollapsing) {
      return;
    }

    const shouldCollapseWindow = visibleTaskCount === 1;
    setMinimizingTaskIds((current) => [...current, taskId]);

    const minimizeTimer = window.setTimeout(() => {
      animationTimersRef.current.delete(taskId);

      if (shouldCollapseWindow) {
        setWindowCollapsing(true);
        const collapseTimer = window.setTimeout(() => {
          onMinimize(taskId, true);
          setMinimizingTaskIds((current) => current.filter((item) => item !== taskId));
          setWindowCollapsing(false);
          animationTimersRef.current.delete(`collapse:${taskId}`);
        }, WINDOW_COLLAPSE_MS);
        animationTimersRef.current.set(`collapse:${taskId}`, collapseTimer);
        return;
      }

      onMinimize(taskId, true);
      setMinimizingTaskIds((current) => current.filter((item) => item !== taskId));
    }, MINIMIZE_ANIMATION_MS);
    animationTimersRef.current.set(taskId, minimizeTimer);
  };

  if (allMinimized) {
    return (
      <button
        className={cn(
          "fixed z-40 grid place-items-center rounded-full",
          defaultAnchorClass,
          !isMobileSurface && "h-16 w-16 text-white merchant-dispatch-fab",
          isMobileSurface && "client-floating-action-button text-[22px] font-black",
          isMobileSurface && "touch-none"
        )}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          onRestoreAll();
        }}
        onPointerCancel={finishDragging}
        onPointerDown={beginLongPress}
        onPointerMove={moveWhileDragging}
        onPointerUp={finishDragging}
        style={floatingStyle}
        type="button"
      >
        <span className="text-xl font-black">{tasks.length}</span>
      </button>
    );
  }

  return (
    <>
      {windowCollapsing ? (
        <div
          aria-hidden="true"
          className={cn(
            "fixed z-[39] grid place-items-center rounded-full transition-transform duration-300 ease-out",
            defaultAnchorClass,
            !isMobileSurface && "h-16 w-16 text-white merchant-dispatch-fab",
            isMobileSurface && "client-floating-action-button text-[22px] font-black",
            isMobileSurface && "scale-100"
          )}
          style={floatingStyle}
        >
          <span className="text-xl font-black">{tasks.length}</span>
        </div>
      ) : null}
      {isMobileSurface ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-30 bg-[color:color-mix(in_srgb,var(--client-bg)_18%,transparent)] backdrop-blur-[6px]"
        />
      ) : null}
        <aside
          className={cn(
          "fixed z-40 rounded-[26px] border transition-[transform,opacity,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] origin-bottom-right",
          defaultAnchorClass,
          isMobileSurface ? mobileWindowClassName : "merchant-dispatch-floating-shell w-[min(360px,calc(100vw-32px))]",
          windowCollapsing && "pointer-events-none scale-[0.18] opacity-0 blur-[2px]"
        )}
        style={floatingStyle}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-t-[26px] px-4 py-4",
            isMobileSurface ? mobileHeaderClassName : "merchant-dispatch-floating-header"
          )}
          onPointerCancel={finishDragging}
          onPointerDown={beginLongPress}
          onPointerMove={moveWhileDragging}
          onPointerUp={finishDragging}
        >
          <div>
            <p className={cn("text-xs font-black uppercase tracking-[0.16em]", isMobileSurface ? "text-coral" : "text-coral")}>必须处理</p>
            <h3 className={cn("mt-1 text-lg font-black", isMobileSurface ? "text-white" : "text-ink")}>待办列表</h3>
            {isMobileSurface ? <p className="mt-1 text-[11px] font-semibold text-white/55">长按顶部可拖动</p> : null}
          </div>
          <Badge className={isMobileSurface ? "bg-[rgba(255,118,96,0.14)] text-[#ff9887]" : undefined} tone="red">
            {tasks.length} 件未处理
          </Badge>
        </div>
        <div className={cn("scrollbar-none max-h-[60vh] space-y-3 overflow-y-auto px-4 py-4", isMobileSurface && mobileListClassName)}>
          {tasks.filter((task) => !task.minimized).map((task) => (
            <div
              className={cn(
                "overflow-hidden transition-[max-height,opacity,transform,margin] duration-200 ease-out",
                minimizingTaskIds.includes(task.id) ? "pointer-events-none max-h-0 translate-x-6 scale-[0.96] opacity-0" : "max-h-[640px] opacity-100"
              )}
              key={task.id}
            >
              <article className={cn("rounded-[20px] border px-4 py-4", isMobileSurface ? mobileCardClassName : "merchant-dispatch-floating-card")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={
                          isMobileSurface
                            ? task.severity === "high"
                              ? "bg-[rgba(255,116,93,0.16)] text-[#ff8f7b]"
                              : task.severity === "medium"
                                ? "bg-[rgba(255,205,88,0.16)] text-[#ffd46b]"
                                : "bg-[rgba(114,182,255,0.18)] text-[#9ad0ff]"
                            : undefined
                        }
                        tone={task.severity === "high" ? "red" : task.severity === "medium" ? "yellow" : "blue"}
                      >
                        {task.severity === "high" ? "高风险" : task.severity === "medium" ? "处理中" : "提醒"}
                      </Badge>
                      <span className={cn("text-xs font-semibold", isMobileSurface ? "text-white/62" : "text-ink/45")}>
                        {task.dueAt ? task.dueAt.slice(5, 16).replace("T", " ") : "无截止"}
                      </span>
                    </div>
                    <h4 className={cn("mt-2 text-sm font-black", isMobileSurface ? "text-white" : "text-ink")}>{task.title}</h4>
                    <p className={cn("mt-2 text-xs leading-5", isMobileSurface ? "text-white/72" : "text-ink/60")}>{task.description}</p>
                  </div>
                  {isMobileSurface ? (
                    <button
                      aria-label="最小化待办项"
                      className={mobileMinimizeClassName}
                      onClick={() => handleMinimize(task.id)}
                      type="button"
                    >
                      <FloatingTaskMinimizeIcon />
                    </button>
                  ) : (
                    <button
                      className="merchant-dispatch-floating-minimize rounded-full border px-3 py-2 text-[11px] font-black"
                      onClick={() => handleMinimize(task.id)}
                      type="button"
                    >
                      最小化
                    </button>
                  )}
                </div>
                <button
                  className={cn(
                    "mt-4 w-full rounded-full px-3 py-2 text-sm font-black",
                    isMobileSurface ? mobileActionClassName : "merchant-dispatch-floating-action"
                  )}
                  onClick={() => onSelect(task)}
                  type="button"
                >
                  定位到对应记录
                </button>
              </article>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
