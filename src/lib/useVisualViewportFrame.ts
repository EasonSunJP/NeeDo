import { useLayoutEffect, type RefObject } from "react";

export function useVisualViewportFrame<T extends HTMLElement>(ref: RefObject<T | null>) {
  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || typeof window === "undefined") {
      return undefined;
    }

    const previousHeight = element.style.getPropertyValue("--im-visual-viewport-height");
    const previousTop = element.style.getPropertyValue("--im-visual-viewport-top");
    const previousWidth = element.style.getPropertyValue("--im-visual-viewport-width");
    const previousLeft = element.style.getPropertyValue("--im-visual-viewport-left");

    const updateFrame = () => {
      const viewport = window.visualViewport;
      const height = Math.max(1, Math.ceil(viewport?.height ?? window.innerHeight));
      const top = Math.max(0, Math.floor(viewport?.offsetTop ?? 0));
      const width = Math.max(1, Math.floor(viewport?.width ?? window.innerWidth));
      const left = Math.max(0, Math.floor(viewport?.offsetLeft ?? 0));
      element.style.setProperty("--im-visual-viewport-height", `${height}px`);
      element.style.setProperty("--im-visual-viewport-top", `${top}px`);
      element.style.setProperty("--im-visual-viewport-width", `${width}px`);
      element.style.setProperty("--im-visual-viewport-left", `${left}px`);
    };

    updateFrame();
    window.addEventListener("resize", updateFrame);
    window.visualViewport?.addEventListener("resize", updateFrame);
    window.visualViewport?.addEventListener("scroll", updateFrame, { passive: true });

    return () => {
      window.removeEventListener("resize", updateFrame);
      window.visualViewport?.removeEventListener("resize", updateFrame);
      window.visualViewport?.removeEventListener("scroll", updateFrame);

      if (previousHeight) {
        element.style.setProperty("--im-visual-viewport-height", previousHeight);
      } else {
        element.style.removeProperty("--im-visual-viewport-height");
      }

      if (previousTop) {
        element.style.setProperty("--im-visual-viewport-top", previousTop);
      } else {
        element.style.removeProperty("--im-visual-viewport-top");
      }

      if (previousWidth) {
        element.style.setProperty("--im-visual-viewport-width", previousWidth);
      } else {
        element.style.removeProperty("--im-visual-viewport-width");
      }

      if (previousLeft) {
        element.style.setProperty("--im-visual-viewport-left", previousLeft);
      } else {
        element.style.removeProperty("--im-visual-viewport-left");
      }
    };
  }, [ref]);
}
