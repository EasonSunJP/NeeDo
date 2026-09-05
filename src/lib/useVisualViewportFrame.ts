import { useLayoutEffect, type RefObject } from "react";

export function useVisualViewportFrame<T extends HTMLElement>(ref: RefObject<T | null>) {
  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || typeof window === "undefined") {
      return undefined;
    }

    const previousHeight = element.style.getPropertyValue("--im-visual-viewport-height");
    const previousTop = element.style.getPropertyValue("--im-visual-viewport-top");

    const updateFrame = () => {
      const viewport = window.visualViewport;
      const height = Math.max(1, Math.ceil(viewport?.height ?? window.innerHeight));
      const top = Math.max(0, Math.floor(viewport?.offsetTop ?? 0));
      element.style.setProperty("--im-visual-viewport-height", `${height}px`);
      element.style.setProperty("--im-visual-viewport-top", `${top}px`);
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
    };
  }, [ref]);
}
