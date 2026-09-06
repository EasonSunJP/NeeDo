import { useLayoutEffect, type RefObject } from "react";
import { isPwaStandaloneWindow } from "./pwaInstall";

const isKeyboardEditor = (element: Element | null): boolean => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  return element instanceof HTMLElement && element.isContentEditable;
};

// In an installed iPhone app with viewport-fit=cover, WebKit can size a
// fixed inset frame against the safe-area viewport instead of the full display.
// Screen dimensions are CSS pixels and only apply here to a full-width iPhone
// standalone window. Browser chrome and iPad windowed modes retain inset sizing.
function iphoneStandaloneDisplayHeight(): number | undefined {
  if (!/iPhone|iPod/i.test(window.navigator.userAgent) || !isPwaStandaloneWindow(window)) {
    return undefined;
  }
  const { width, height } = window.screen;
  if (!(width > 0 && height > 0)) return undefined;
  if (Math.abs(window.innerWidth - width) < 1) return height;
  if (Math.abs(window.innerWidth - height) < 1) return width;
  return undefined;
}

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

    const updateFrame = () => {
      const viewport = window.visualViewport;
      // Focus survives keyboard dismissal on iOS. Only constrain the frame when
      // the software keyboard actually reduces the visible viewport.
      const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
      const keyboardOpen = Boolean(
        viewport && isKeyboardEditor(document.activeElement) && layoutHeight - viewport.height > 100
      );

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

      const displayHeight = iphoneStandaloneDisplayHeight();
      element.style.setProperty("--im-visual-viewport-height", displayHeight ? `${displayHeight}px` : "auto");
      element.style.setProperty("--im-visual-viewport-top", "0px");
      element.style.setProperty("--im-visual-viewport-bottom", displayHeight ? "auto" : "0px");
      element.style.setProperty("--im-visual-viewport-width", "auto");
      element.style.setProperty("--im-visual-viewport-left", "0px");
      element.style.setProperty("--im-visual-viewport-right", "0px");
    };

    updateFrame();
    window.addEventListener("resize", updateFrame);
    window.addEventListener("pageshow", updateFrame);
    document.addEventListener("visibilitychange", updateFrame);
    document.addEventListener("focusin", updateFrame);
    document.addEventListener("focusout", updateFrame);
    window.visualViewport?.addEventListener("resize", updateFrame);
    window.visualViewport?.addEventListener("scroll", updateFrame, { passive: true });

    return () => {
      window.removeEventListener("resize", updateFrame);
      window.removeEventListener("pageshow", updateFrame);
      document.removeEventListener("visibilitychange", updateFrame);
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
