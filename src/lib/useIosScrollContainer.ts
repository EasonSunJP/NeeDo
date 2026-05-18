import { useEffect, type RefObject } from "react";

export function useDocumentScrollLock(active: boolean, className = "im-conversation-scroll-lock") {
  useEffect(() => {
    if (!active || typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }

    const root = document.documentElement;
    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previousBodyStyle = {
      left: body.style.left,
      overflow: body.style.overflow,
      position: body.style.position,
      right: body.style.right,
      top: body.style.top,
      width: body.style.width
    };
    const previousRootOverflow = root.style.overflow;

    root.classList.add(className);
    body.classList.add(className);
    root.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      root.classList.remove(className);
      body.classList.remove(className);
      root.style.overflow = previousRootOverflow;
      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.left = previousBodyStyle.left;
      body.style.right = previousBodyStyle.right;
      body.style.width = previousBodyStyle.width;
      body.style.overflow = previousBodyStyle.overflow;
      window.scrollTo(scrollX, scrollY);
    };
  }, [active, className]);
}

export function useIosScrollContainer<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const element = ref.current;

    if (!element || typeof window === "undefined") {
      return undefined;
    }

    let lastTouchY = 0;
    let startTouchY = 0;
    let dragOffsetY = 0;
    let rubberBandActive = false;
    let resetTimer: number | null = null;
    const previousInlineStyle = {
      transform: element.style.transform,
      transition: element.style.transition,
      willChange: element.style.willChange
    };

    const getMaxScrollTop = () => Math.max(0, element.scrollHeight - element.clientHeight);

    const dampenDragOffset = (offset: number) => {
      const sign = Math.sign(offset);
      const distance = Math.abs(offset);
      return sign * Math.min(56, Math.pow(distance, 0.82) * 0.92);
    };

    const clearResetTimer = () => {
      if (resetTimer) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
        return true;
      }

      return false;
    };

    const setRubberBandOffset = (offset: number) => {
      dragOffsetY = offset;
      rubberBandActive = true;
      element.style.willChange = "transform";
      element.style.transition = "";
      element.style.transform = `translate3d(0, ${offset}px, 0)`;
    };

    const resetRubberBandOffset = () => {
      if (!rubberBandActive && !dragOffsetY) {
        return;
      }

      clearResetTimer();
      dragOffsetY = 0;
      rubberBandActive = false;
      element.style.willChange = "transform";
      element.style.transition = "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
      element.style.transform = "translate3d(0, 0, 0)";
      resetTimer = window.setTimeout(() => {
        element.style.transition = previousInlineStyle.transition;
        element.style.transform = previousInlineStyle.transform;
        element.style.willChange = previousInlineStyle.willChange;
        resetTimer = null;
      }, 200);
    };

    const keepScrollInsideBounds = () => {
      const maxScrollTop = getMaxScrollTop();

      if (maxScrollTop <= 0) {
        return;
      }

      if (element.scrollTop <= 0) {
        element.scrollTop = 1;
        return;
      }

      if (element.scrollTop >= maxScrollTop) {
        element.scrollTop = Math.max(0, maxScrollTop - 1);
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }

      lastTouchY = event.touches[0]?.clientY ?? 0;
      startTouchY = lastTouchY;
      const interruptedReset = clearResetTimer();
      if (interruptedReset && !rubberBandActive) {
        element.style.transition = previousInlineStyle.transition;
        element.style.transform = previousInlineStyle.transform;
        element.style.willChange = previousInlineStyle.willChange;
      }
      if (dragOffsetY) {
        setRubberBandOffset(0);
      }
      keepScrollInsideBounds();
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }

      const currentTouchY = event.touches[0]?.clientY ?? lastTouchY;
      const deltaY = currentTouchY - lastTouchY;
      lastTouchY = currentTouchY;

      const maxScrollTop = getMaxScrollTop();

      if (maxScrollTop <= 0) {
        if (event.cancelable) {
          event.preventDefault();
        }
        setRubberBandOffset(dampenDragOffset(currentTouchY - startTouchY));
        event.stopPropagation();
        return;
      }

      const isAtTop = element.scrollTop <= 0;
      const isAtBottom = element.scrollTop >= maxScrollTop - 1;

      if ((isAtTop && deltaY > 0) || (isAtBottom && deltaY < 0)) {
        if (event.cancelable) {
          event.preventDefault();
        }
      }

      event.stopPropagation();
    };

    const handleTouchEnd = () => {
      lastTouchY = 0;
      startTouchY = 0;
      resetRubberBandOffset();
    };

    const touchStartOptions: AddEventListenerOptions = { capture: true, passive: true };
    const touchMoveOptions: AddEventListenerOptions = { capture: true, passive: false };

    element.addEventListener("touchstart", handleTouchStart, touchStartOptions);
    element.addEventListener("touchmove", handleTouchMove, touchMoveOptions);
    element.addEventListener("touchend", handleTouchEnd, touchStartOptions);
    element.addEventListener("touchcancel", handleTouchEnd, touchStartOptions);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart, touchStartOptions);
      element.removeEventListener("touchmove", handleTouchMove, touchMoveOptions);
      element.removeEventListener("touchend", handleTouchEnd, touchStartOptions);
      element.removeEventListener("touchcancel", handleTouchEnd, touchStartOptions);
      clearResetTimer();
      element.style.transition = previousInlineStyle.transition;
      element.style.transform = previousInlineStyle.transform;
      element.style.willChange = previousInlineStyle.willChange;
    };
  });
}
