import { useLayoutEffect, type RefObject } from "react";

const isKeyboardEditor = (element: Element | null): boolean => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  return element instanceof HTMLElement && element.isContentEditable;
};

const minimumKeyboardViewportReduction = 80;

export function useVisualViewportFrame<T extends HTMLElement>(ref: RefObject<T | null>) {
  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || typeof window === "undefined") {
      return undefined;
    }

    const properties = [
      "--im-visual-viewport-height",
      "--im-visual-viewport-top",
      "--im-visual-viewport-bottom",
      "--im-visual-viewport-width",
      "--im-visual-viewport-left",
      "--im-visual-viewport-right"
    ] as const;
    const previousValues = new Map(
      properties.map((property) => [property, element.style.getPropertyValue(property)])
    );

    let keyboardFrameActive = false;

    const updateFrame = () => {
      const viewport = window.visualViewport;
      const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
      const keyboardViewportReduction = viewport
        ? Math.max(0, layoutHeight - viewport.height)
        : 0;
      const editorFocused = isKeyboardEditor(document.activeElement);
      const keyboardOpen = Boolean(
        viewport &&
        ((editorFocused && keyboardViewportReduction >= minimumKeyboardViewportReduction) ||
          (keyboardFrameActive && keyboardViewportReduction > 0))
      );

      // Panning changes the origin, not the amount of visible height. Keep a
      // detected keyboard frame through blur until the viewport expands again.
      keyboardFrameActive = keyboardOpen;

      if (keyboardOpen) {
        element.style.setProperty(
          "--im-visual-viewport-height",
          `${Math.max(1, Math.ceil(viewport!.height))}px`
        );
        element.style.setProperty(
          "--im-visual-viewport-top",
          `${Math.max(0, Math.floor(viewport!.offsetTop))}px`
        );
        element.style.setProperty("--im-visual-viewport-bottom", "auto");
        element.style.setProperty(
          "--im-visual-viewport-width",
          `${Math.max(1, Math.floor(viewport!.width))}px`
        );
        element.style.setProperty(
          "--im-visual-viewport-left",
          `${Math.max(0, Math.floor(viewport!.offsetLeft))}px`
        );
        element.style.setProperty("--im-visual-viewport-right", "auto");
        return;
      }

      // iOS standalone can retain an oversized fixed-position layout viewport.
      // Keep the room bounded by the dynamic viewport when the keyboard is closed.
      element.style.setProperty("--im-visual-viewport-height", "100dvh");
      element.style.setProperty("--im-visual-viewport-top", "0px");
      element.style.setProperty("--im-visual-viewport-bottom", "auto");
      element.style.setProperty("--im-visual-viewport-width", "auto");
      element.style.setProperty("--im-visual-viewport-left", "0px");
      element.style.setProperty("--im-visual-viewport-right", "0px");
    };

    const refreshRestoredFrame = () => {
      keyboardFrameActive = false;
      updateFrame();
    };

    updateFrame();
    window.addEventListener("resize", updateFrame);
    window.addEventListener("pageshow", refreshRestoredFrame);
    document.addEventListener("visibilitychange", refreshRestoredFrame);
    document.addEventListener("focusin", updateFrame);
    document.addEventListener("focusout", updateFrame);
    window.visualViewport?.addEventListener("resize", updateFrame);
    window.visualViewport?.addEventListener("scroll", updateFrame, { passive: true });

    return () => {
      window.removeEventListener("resize", updateFrame);
      window.removeEventListener("pageshow", refreshRestoredFrame);
      document.removeEventListener("visibilitychange", refreshRestoredFrame);
      document.removeEventListener("focusin", updateFrame);
      document.removeEventListener("focusout", updateFrame);
      window.visualViewport?.removeEventListener("resize", updateFrame);
      window.visualViewport?.removeEventListener("scroll", updateFrame);

      for (const property of properties) {
        const previousValue = previousValues.get(property);

        if (previousValue) {
          element.style.setProperty(property, previousValue);
        } else {
          element.style.removeProperty(property);
        }
      }
    };
  }, [ref]);
}
