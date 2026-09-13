import { useLayoutEffect, type RefObject } from "react";
import { detectPwaInstallPlatform, isPwaStandaloneWindow } from "./pwaInstall";

const isKeyboardEditor = (element: Element | null): boolean => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  return element instanceof HTMLElement && element.isContentEditable;
};

const minimumKeyboardViewportReduction = 80;
const installedPwaRestingViewportTolerance = 96;
const installedIosPwaMinimumRestingViewportTolerance = 120;
const installedIosPwaMaximumRestingViewportTolerance = 240;
const installedIosPwaRestingViewportToleranceRatio = 0.22;
const installedPwaKeyboardReleaseSettleMs = 180;

const getInstalledIosPwaRestingViewportTolerance = (referenceHeight: number): number =>
  Math.min(
    installedIosPwaMaximumRestingViewportTolerance,
    Math.max(
      installedIosPwaMinimumRestingViewportTolerance,
      Math.round(referenceHeight * installedIosPwaRestingViewportToleranceRatio)
    )
  );

export function useVisualViewportFrame<T extends HTMLElement>(ref: RefObject<T | null>) {
  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || typeof window === "undefined") {
      return undefined;
    }

    const properties = [
      "--im-conversation-room-height",
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
    let keyboardViewportMinimumHeight: number | null = null;
    let keyboardReleaseTimer: number | null = null;
    let installedMobileRestingHeight: number | null = null;

    const clearKeyboardReleaseTimer = () => {
      if (keyboardReleaseTimer !== null) {
        window.clearTimeout(keyboardReleaseTimer);
        keyboardReleaseTimer = null;
      }
    };

    const updateFrame = (forceInstalledRestingFrame = false) => {
      if (!forceInstalledRestingFrame) {
        clearKeyboardReleaseTimer();
      }
      const viewport = window.visualViewport;
      const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
      const installPlatform = detectPwaInstallPlatform(window.navigator);
      const useInstalledMobileViewport = Boolean(
        viewport &&
        isPwaStandaloneWindow(window) &&
        (installPlatform === "ios" || installPlatform === "android")
      );
      const keyboardReferenceHeight = useInstalledMobileViewport && installedMobileRestingHeight !== null
        ? installedMobileRestingHeight
        : layoutHeight;
      const keyboardViewportReduction = viewport
        ? Math.max(0, keyboardReferenceHeight - viewport.height)
        : 0;
      const editorFocused = isKeyboardEditor(document.activeElement);
      // Installed iOS PWAs can report a resting visual viewport that is
      // materially shorter than innerHeight after the keyboard closes. Scale
      // this tolerance with the display so that the residual browser/display
      // inset does not become a permanent bottom offset, while a real keyboard
      // reduction remains large enough to keep the room above it.
      const installedMobileRestingViewportTolerance = installPlatform === "ios"
        ? getInstalledIosPwaRestingViewportTolerance(keyboardReferenceHeight)
        : installedPwaRestingViewportTolerance;
      const keyboardOpenThreshold = useInstalledMobileViewport
        ? installedMobileRestingViewportTolerance
        : minimumKeyboardViewportReduction;
      const keyboardRecoveryThreshold = useInstalledMobileViewport
        ? installedMobileRestingViewportTolerance
        : 2;
      const keyboardOpen = Boolean(
        viewport &&
        !forceInstalledRestingFrame &&
        ((editorFocused && keyboardViewportReduction >= keyboardOpenThreshold) ||
          (keyboardFrameActive && keyboardViewportReduction > keyboardRecoveryThreshold))
      );

      // Panning changes the origin, not the amount of visible height. Keep a
      // detected keyboard frame through blur until the viewport expands again.
      keyboardFrameActive = keyboardOpen;

      if (keyboardOpen) {
        keyboardViewportMinimumHeight = Math.min(
          keyboardViewportMinimumHeight ?? viewport!.height,
          viewport!.height
        );
        const viewportHeight = `${Math.max(1, Math.ceil(viewport!.height))}px`;
        const viewportBottom = Math.max(
          0,
          Math.floor(layoutHeight - (viewport!.offsetTop + viewport!.height))
        );
        element.style.setProperty(
          "--im-visual-viewport-height",
          viewportHeight
        );
        // Installed iOS PWAs mis-size fixed elements that simultaneously use
        // top, bottom, and an automatic height with viewport-fit=cover. Anchor
        // the room from its bottom edge and give it the measured height so the
        // composer follows the same reliable positioning model as bottom nav.
        element.style.setProperty("--im-conversation-room-height", viewportHeight);
        element.style.setProperty("--im-visual-viewport-top", "auto");
        element.style.setProperty("--im-visual-viewport-bottom", `${viewportBottom}px`);
        element.style.setProperty(
          "--im-visual-viewport-width",
          `${Math.max(1, Math.floor(viewport!.width))}px`
        );
        element.style.setProperty(
          "--im-visual-viewport-left",
          `${Math.max(0, Math.floor(viewport!.offsetLeft))}px`
        );
        element.style.setProperty("--im-visual-viewport-right", "auto");

        const viewportExpandedFromKeyboardMinimum =
          viewport!.height > keyboardViewportMinimumHeight;
        if (
          useInstalledMobileViewport &&
          viewport!.offsetTop <= 2 &&
          viewportExpandedFromKeyboardMinimum
        ) {
          const candidateHeight = viewport!.height;
          const candidateOffsetTop = viewport!.offsetTop;
          keyboardReleaseTimer = window.setTimeout(() => {
            keyboardReleaseTimer = null;
            const currentViewport = window.visualViewport;
            if (
              !currentViewport ||
              Math.abs(currentViewport.height - candidateHeight) > 2 ||
              Math.abs(currentViewport.offsetTop - candidateOffsetTop) > 2
            ) {
              return;
            }
            keyboardFrameActive = false;
            keyboardViewportMinimumHeight = null;
            installedMobileRestingHeight = currentViewport.height;
            updateFrame(true);
          }, installedPwaKeyboardReleaseSettleMs);
        }
        return;
      }

      keyboardViewportMinimumHeight = null;
      if (useInstalledMobileViewport) {
        installedMobileRestingHeight = viewport!.height;
        // The home navigation is fixed to the viewport bottom. Use the same
        // bottom anchor for the closed-keyboard chat room instead of turning a
        // possibly stale visualViewport height into an exposed bottom gap.
        // Keep the pixel height separately so expandable panels can still
        // size themselves against the actually visible space.
        element.style.setProperty(
          "--im-visual-viewport-height",
          `${Math.max(1, Math.ceil(viewport!.height))}px`
        );
        // Installed mobile browsers can retain a shortened `dvh` after the
        // software keyboard is dismissed or when the PWA is restored. `lvh`
        // is independent of that transient keyboard frame, so the closed room
        // continues to the display bottom while its composer handles the
        // safe-area inset on both iOS and Android.
        element.style.setProperty("--im-conversation-room-height", "100lvh");
        element.style.setProperty("--im-visual-viewport-top", "auto");
        element.style.setProperty("--im-visual-viewport-bottom", "0px");
        element.style.setProperty("--im-visual-viewport-width", "auto");
        element.style.setProperty("--im-visual-viewport-left", "0px");
        element.style.setProperty("--im-visual-viewport-right", "0px");
        return;
      }

      element.style.setProperty("--im-visual-viewport-height", "100dvh");
      element.style.setProperty("--im-conversation-room-height", "100dvh");
      element.style.setProperty("--im-visual-viewport-top", "auto");
      element.style.setProperty("--im-visual-viewport-bottom", "0px");
      element.style.setProperty("--im-visual-viewport-width", "auto");
      element.style.setProperty("--im-visual-viewport-left", "0px");
      element.style.setProperty("--im-visual-viewport-right", "0px");
    };

    const refreshRestoredFrame = () => {
      clearKeyboardReleaseTimer();
      keyboardFrameActive = false;
      keyboardViewportMinimumHeight = null;
      installedMobileRestingHeight = null;
      updateFrame();
    };

    const handleFrameChange = () => updateFrame();
    const handleFocusOut = () => {
      const installPlatform = detectPwaInstallPlatform(window.navigator);
      const installedMobilePwa =
        isPwaStandaloneWindow(window) &&
        (installPlatform === "ios" || installPlatform === "android");

      if (installedMobilePwa) {
        keyboardFrameActive = false;
        keyboardViewportMinimumHeight = null;
        updateFrame(true);
        return;
      }

      updateFrame();
    };

    updateFrame();
    window.addEventListener("resize", handleFrameChange);
    window.addEventListener("pageshow", refreshRestoredFrame);
    document.addEventListener("visibilitychange", refreshRestoredFrame);
    document.addEventListener("focusin", handleFrameChange);
    document.addEventListener("focusout", handleFocusOut);
    window.visualViewport?.addEventListener("resize", handleFrameChange);
    window.visualViewport?.addEventListener("scroll", handleFrameChange, { passive: true });

    return () => {
      clearKeyboardReleaseTimer();
      window.removeEventListener("resize", handleFrameChange);
      window.removeEventListener("pageshow", refreshRestoredFrame);
      document.removeEventListener("visibilitychange", refreshRestoredFrame);
      document.removeEventListener("focusin", handleFrameChange);
      document.removeEventListener("focusout", handleFocusOut);
      window.visualViewport?.removeEventListener("resize", handleFrameChange);
      window.visualViewport?.removeEventListener("scroll", handleFrameChange);

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
