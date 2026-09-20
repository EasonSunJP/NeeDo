import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { hasActiveImMessageTextSelection } from "./components";

export const IM_LONG_PRESS_DELAY_MS = 380;
const IM_LONG_PRESS_MOVE_THRESHOLD_PX = 10;
const IM_LONG_PRESS_ACTIVATION_GUARD_MS = 800;

export function useImLongPressAction(onOpen: () => void) {
  const timerRef = useRef<number | null>(null);
  const activationGuardTimerRef = useRef<number | null>(null);
  const suppressNextActivationRef = useRef(false);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearPress = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pressStartRef.current = null;
  };

  const clearActivationGuard = () => {
    if (activationGuardTimerRef.current) {
      window.clearTimeout(activationGuardTimerRef.current);
    }
    activationGuardTimerRef.current = null;
    suppressNextActivationRef.current = false;
  };

  const releaseActivationGuardAfterPointerSequence = () => {
    if (!suppressNextActivationRef.current) return;
    if (activationGuardTimerRef.current) {
      window.clearTimeout(activationGuardTimerRef.current);
    }
    activationGuardTimerRef.current = window.setTimeout(
      clearActivationGuard,
      IM_LONG_PRESS_ACTIVATION_GUARD_MS,
    );
  };

  useEffect(() => () => {
    clearPress();
    clearActivationGuard();
  }, []);

  return {
    handlers: {
      onClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
        if (!suppressNextActivationRef.current) return;
        clearActivationGuard();
        event.preventDefault();
        event.stopPropagation();
      },
      onContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
        event.preventDefault();
        if (hasActiveImMessageTextSelection(event.currentTarget)) return;
        onOpen();
      },
      onPointerCancel() {
        clearPress();
        releaseActivationGuardAfterPointerSequence();
      },
      onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        clearPress();
        clearActivationGuard();
        if (hasActiveImMessageTextSelection(event.currentTarget)) return;
        pressStartRef.current = { x: event.clientX, y: event.clientY };
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          suppressNextActivationRef.current = true;
          onOpen();
        }, IM_LONG_PRESS_DELAY_MS);
      },
      onPointerLeave() {
        clearPress();
        releaseActivationGuardAfterPointerSequence();
      },
      onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const start = pressStartRef.current;
        if (!start) return;
        if (
          Math.abs(event.clientX - start.x) > IM_LONG_PRESS_MOVE_THRESHOLD_PX ||
          Math.abs(event.clientY - start.y) > IM_LONG_PRESS_MOVE_THRESHOLD_PX
        ) {
          clearPress();
        }
      },
      onPointerUp() {
        clearPress();
        releaseActivationGuardAfterPointerSequence();
      },
    },
  };
}
