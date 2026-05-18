import { useEffect, useRef } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  UIEvent as ReactUIEvent
} from "react";

type UseHorizontalDragScrollOptions = {
  scrollLeft?: number;
  onScrollLeftChange?: (scrollLeft: number, element: HTMLDivElement) => void;
};

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  captured: boolean;
};

function shouldIgnoreDragTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  return Boolean(
    target.closest("[data-scroll-drag-ignore='true']") ??
      target.closest("input, select, textarea, option, a, [contenteditable='true']")
  );
}

export function useHorizontalDragScroll({ scrollLeft = 0, onScrollLeftChange }: UseHorizontalDragScrollOptions) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const syncingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element || Math.abs(element.scrollLeft - scrollLeft) < 1) {
      return;
    }

    syncingRef.current = true;
    element.scrollLeft = scrollLeft;

    const frame = window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [scrollLeft]);

  const handleScroll = (_event: ReactUIEvent<HTMLDivElement>) => {
    const element = scrollRef.current;

    if (!element || syncingRef.current) {
      return;
    }

    onScrollLeftChange?.(element.scrollLeft, element);
  };

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const startTouchDrag = (event: TouchEvent) => {
      if (event.touches.length !== 1 || shouldIgnoreDragTarget(event.target)) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      dragSessionRef.current = {
        pointerId: -1,
        startX: touch.clientX,
        startY: touch.clientY,
        startScrollLeft: element.scrollLeft,
        captured: false
      };
      dragMovedRef.current = false;
    };

    const moveTouchDrag = (event: TouchEvent) => {
      const dragSession = dragSessionRef.current;
      const touch = event.touches[0];

      if (!dragSession || dragSession.pointerId !== -1 || !touch) {
        return;
      }

      const deltaX = touch.clientX - dragSession.startX;
      const deltaY = touch.clientY - dragSession.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!dragSession.captured && absY > absX && absY > 8) {
        dragSessionRef.current = null;
        dragMovedRef.current = false;
        return;
      }

      if (absX > 4) {
        dragMovedRef.current = true;
        dragSession.captured = true;
      }

      if (!dragMovedRef.current) {
        return;
      }

      element.scrollLeft = dragSession.startScrollLeft - deltaX;
      onScrollLeftChange?.(element.scrollLeft, element);

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
    };

    const stopTouchDrag = () => {
      if (dragSessionRef.current?.pointerId !== -1) {
        return;
      }

      stopDrag(-1);
    };

    element.addEventListener("touchstart", startTouchDrag, { passive: true });
    element.addEventListener("touchmove", moveTouchDrag, { passive: false });
    element.addEventListener("touchend", stopTouchDrag, { passive: true });
    element.addEventListener("touchcancel", stopTouchDrag, { passive: true });

    return () => {
      element.removeEventListener("touchstart", startTouchDrag);
      element.removeEventListener("touchmove", moveTouchDrag);
      element.removeEventListener("touchend", stopTouchDrag);
      element.removeEventListener("touchcancel", stopTouchDrag);

      if (dragSessionRef.current?.pointerId === -1) {
        dragSessionRef.current = null;
        dragMovedRef.current = false;
      }
    };
  }, [onScrollLeftChange]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      return;
    }

    if (shouldIgnoreDragTarget(event.target)) {
      return;
    }

    const element = scrollRef.current;

    if (!element) {
      return;
    }

    dragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: element.scrollLeft,
      captured: false
    };
    dragMovedRef.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    const dragSession = dragSessionRef.current;

    if (!element || !dragSession || dragSession.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragSession.startX;
    const deltaY = event.clientY - dragSession.startY;

    if (!dragSession.captured && Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      dragSessionRef.current = null;
      dragMovedRef.current = false;
      return;
    }

    if (Math.abs(deltaX) > 4) {
      dragMovedRef.current = true;
    }

    if (!dragMovedRef.current) {
      return;
    }

    if (dragMovedRef.current && !dragSession.captured) {
      try {
        element.setPointerCapture(event.pointerId);
        dragSession.captured = true;
      } catch {
        // no-op
      }
    }

    const nextScrollLeft = dragSession.startScrollLeft - deltaX;
    element.scrollLeft = nextScrollLeft;
    onScrollLeftChange?.(element.scrollLeft, element);

    if (dragMovedRef.current) {
      event.preventDefault();
    }
  };

  const stopDrag = (pointerId: number) => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    try {
      element.releasePointerCapture(pointerId);
    } catch {
      // no-op
    }

    if (dragMovedRef.current) {
      suppressClickUntilRef.current = Date.now() + 180;
    }

    dragSessionRef.current = null;
    dragMovedRef.current = false;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragSessionRef.current?.pointerId !== event.pointerId) {
      return;
    }

    stopDrag(event.pointerId);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragSessionRef.current?.pointerId !== event.pointerId) {
      return;
    }

    stopDrag(event.pointerId);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClickUntilRef.current <= Date.now()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  return {
    scrollRef,
    dragScrollProps: {
      onClickCapture: handleClickCapture,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onScroll: handleScroll
    }
  };
}
