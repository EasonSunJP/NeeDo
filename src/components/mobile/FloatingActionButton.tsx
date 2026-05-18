import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { Link } from "react-router-dom";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { cn } from "../../lib/utils";
import { NotificationBadge } from "../ui/NotificationBadge";

const LONG_PRESS_MS = 280;
const DRAG_CANCEL_DISTANCE = 8;
const EDGE_GAP = 12;
const DEFAULT_BUTTON_SIZE = 58;

type FloatingActionPosition = "standard" | "raised" | "low";

type FloatingActionButtonProps = {
  ariaLabel: string;
  badge?: number | string | null;
  children: ReactNode;
  className?: string;
  iconClassName?: string;
  onClick?: () => void;
  position?: FloatingActionPosition;
  srText?: string;
  storageKey?: string;
  title?: string;
  to?: string;
};

type DragState = {
  dragging: boolean;
  offsetX: number;
  offsetY: number;
  pointerId: number;
  startX: number;
  startY: number;
  timer: number | null;
};

const positionClassName: Record<FloatingActionPosition, string> = {
  low: "bottom-[calc(env(safe-area-inset-bottom)+24px)] right-4",
  raised: "bottom-[calc(env(safe-area-inset-bottom)+180px)] right-4",
  standard: "bottom-[calc(env(safe-area-inset-bottom)+104px)] right-4"
};

function clampPosition(x: number, y: number, width: number, height: number) {
  if (typeof window === "undefined") {
    return { x, y };
  }

  return {
    x: Math.min(Math.max(EDGE_GAP, x), Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP)),
    y: Math.min(Math.max(EDGE_GAP, y), Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP))
  };
}

function isStoredPosition(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybePosition = value as { x?: unknown; y?: unknown };
  return typeof maybePosition.x === "number" && typeof maybePosition.y === "number";
}

export function FloatingActionButton({
  ariaLabel,
  badge,
  children,
  className,
  iconClassName,
  onClick,
  position = "standard",
  srText,
  storageKey,
  title,
  to
}: FloatingActionButtonProps) {
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    const storedPosition = parseBrowserStorageJson<unknown>(storageKey, null, {
      removeOnError: true,
      silent: true
    });

    if (isStoredPosition(storedPosition)) {
      setDragPosition(clampPosition(storedPosition.x, storedPosition.y, DEFAULT_BUTTON_SIZE, DEFAULT_BUTTON_SIZE));
    }
  }, [storageKey]);

  useEffect(() => {
    const syncPosition = () => {
      setDragPosition((current) => current ? clampPosition(current.x, current.y, DEFAULT_BUTTON_SIZE, DEFAULT_BUTTON_SIZE) : current);
    };

    window.addEventListener("resize", syncPosition);
    window.addEventListener("orientationchange", syncPosition);

    return () => {
      if (dragStateRef.current?.timer != null) {
        window.clearTimeout(dragStateRef.current.timer);
      }

      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("orientationchange", syncPosition);
    };
  }, []);

  useEffect(() => {
    if (!storageKey || !dragPosition) {
      return;
    }

    writeBrowserStorage(storageKey, JSON.stringify(dragPosition), { silent: true });
  }, [dragPosition, storageKey]);

  const beginLongPress = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();

    target.setPointerCapture(event.pointerId);

    if (dragStateRef.current?.timer != null) {
      window.clearTimeout(dragStateRef.current.timer);
    }

    setDragging(false);
    dragStateRef.current = {
      dragging: false,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: window.setTimeout(() => {
        dragStateRef.current = dragStateRef.current
          ? { ...dragStateRef.current, dragging: true, timer: null }
          : null;
        setDragging(true);
        setDragPosition(clampPosition(rect.left, rect.top, rect.width, rect.height));
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

      if (movedDistance > DRAG_CANCEL_DISTANCE && state.timer != null) {
        window.clearTimeout(state.timer);
        dragStateRef.current = { ...state, timer: null };
      }

      return;
    }

    event.preventDefault();
    setDragPosition(
      clampPosition(
        event.clientX - state.offsetX,
        event.clientY - state.offsetY,
        event.currentTarget.clientWidth,
        event.currentTarget.clientHeight
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
    setDragging(false);
  };

  const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      return;
    }

    onClick?.();
  };

  const floatingStyle: CSSProperties | undefined = dragPosition
    ? { bottom: "auto", left: dragPosition.x, right: "auto", top: dragPosition.y }
    : undefined;
  const rootClassName = cn(
    "focus-ring client-floating-action-button fixed z-50 grid place-items-center",
    positionClassName[position],
    dragging && "client-floating-action-button--dragging",
    className
  );
  const content = (
    <>
      <span aria-hidden="true" className="client-floating-action-button__shine" />
      <span className={cn("client-floating-action-button__icon", iconClassName)}>{children}</span>
      {typeof badge === "number" && badge > 0 ? (
        <NotificationBadge className="client-floating-action-button__badge" count={badge} size="lg" />
      ) : badge ? (
        <span className="client-floating-action-button__badge client-floating-action-button__text-badge">{badge}</span>
      ) : null}
      {srText ? <span className="sr-only">{srText}</span> : null}
    </>
  );

  if (to) {
    return (
      <Link
        aria-label={ariaLabel}
        className={rootClassName}
        draggable={false}
        onClick={handleClick}
        onPointerCancel={finishDragging}
        onPointerDown={beginLongPress}
        onPointerMove={moveWhileDragging}
        onPointerUp={finishDragging}
        style={floatingStyle}
        title={title}
        to={to}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      aria-label={ariaLabel}
      className={rootClassName}
      draggable={false}
      onClick={handleClick}
      onPointerCancel={finishDragging}
      onPointerDown={beginLongPress}
      onPointerMove={moveWhileDragging}
      onPointerUp={finishDragging}
      style={floatingStyle}
      title={title}
      type="button"
    >
      {content}
    </button>
  );
}
