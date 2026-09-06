import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  liveDashboardApi,
  serializeLiveDashboardQuery,
  type LiveDashboardEvent,
  type LiveDashboardScope
} from "../../api/liveDashboard";
import { openAuthenticatedSseStream } from "../../api/sseFetchStream";
import { createLiveDashboardState, liveDashboardReducer } from "./liveDashboardState";

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
const INVALIDATION_WINDOW_MS = 60 * 1000;

export const retryDelayMs = (attempt: number, jitter: number): number =>
  Math.min(1000 * 2 ** Math.max(0, attempt), 30_000) + Math.floor(Math.max(0, Math.min(1, jitter)) * 750);

const errorKey = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "error.dashboard.unavailable";

export function useLiveDashboard(scope: LiveDashboardScope) {
  const normalizedScope = useMemo<LiveDashboardScope>(() => ({
    country: "JP",
    ...(scope.admin1 ? { admin1: scope.admin1 } : {}),
    ...(scope.admin2 ? { admin2: scope.admin2 } : {}),
    period: scope.period
  }), [scope.admin1, scope.admin2, scope.period]);
  const [state, dispatch] = useReducer(liveDashboardReducer, normalizedScope, createLiveDashboardState);
  const scopeRef = useRef(normalizedScope);
  const requestIdRef = useRef(0);
  const snapshotAbortRef = useRef<AbortController | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const reconcileTimerRef = useRef<number | null>(null);
  const invalidationTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(false);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    lastEventIdRef.current = state.lastEventId;
  }, [state.lastEventId]);

  const clearTimer = useCallback((ref: { current: number | null }) => {
    if (ref.current !== null) window.clearTimeout(ref.current);
    ref.current = null;
  }, []);

  const fetchSnapshot = useCallback(async () => {
    if (!mountedRef.current || document.visibilityState === "hidden") return;
    snapshotAbortRef.current?.abort();
    const controller = new AbortController();
    snapshotAbortRef.current = controller;
    const requestId = ++requestIdRef.current;
    const requestedScope = scopeRef.current;
    dispatch({ type: "snapshotStarted", requestId, scope: requestedScope });
    try {
      const snapshot = await liveDashboardApi.snapshot(requestedScope, controller.signal);
      if (!controller.signal.aborted && mountedRef.current) {
        dispatch({ type: "snapshotSucceeded", requestId, scope: requestedScope, snapshot });
      }
    } catch (error) {
      if (!controller.signal.aborted && mountedRef.current) {
        dispatch({ type: "snapshotFailed", requestId, error: errorKey(error) });
      }
    } finally {
      if (snapshotAbortRef.current === controller) snapshotAbortRef.current = null;
    }
  }, []);

  const scheduleInvalidationRead = useCallback(() => {
    if (invalidationTimerRef.current !== null) return;
    invalidationTimerRef.current = window.setTimeout(() => {
      invalidationTimerRef.current = null;
      void fetchSnapshot();
    }, INVALIDATION_WINDOW_MS);
  }, [fetchSnapshot]);

  const handleEvent = useCallback((event: LiveDashboardEvent) => {
    dispatch({ type: "eventReceived", event });
    if (event.type === "metrics.invalidate") scheduleInvalidationRead();
  }, [scheduleInvalidationRead]);

  const startStreamRef = useRef<() => void>(() => undefined);
  const startStream = useCallback(() => {
    if (!mountedRef.current || document.visibilityState === "hidden") return;
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    dispatch({ type: "realtimeStatusChanged", status: reconnectAttemptRef.current ? "recovering" : "connecting" });
    void openAuthenticatedSseStream({
      path: "/backoffice/dashboard/live-events",
      query: serializeLiveDashboardQuery(scopeRef.current),
      signal: controller.signal,
      lastEventId: lastEventIdRef.current,
      onEvent: (event) => {
        reconnectAttemptRef.current = 0;
        dispatch({ type: "realtimeStatusChanged", status: "connected" });
        handleEvent(event);
      }
    }).then(() => {
      if (controller.signal.aborted || !mountedRef.current || document.visibilityState === "hidden") return;
      dispatch({ type: "realtimeStatusChanged", status: "recovering" });
      const attempt = reconnectAttemptRef.current++;
      reconnectTimerRef.current = window.setTimeout(() => startStreamRef.current(), retryDelayMs(attempt, Math.random()));
    }).catch(() => {
      if (controller.signal.aborted || !mountedRef.current || document.visibilityState === "hidden") return;
      dispatch({ type: "realtimeStatusChanged", status: "recovering" });
      const attempt = reconnectAttemptRef.current++;
      reconnectTimerRef.current = window.setTimeout(() => startStreamRef.current(), retryDelayMs(attempt, Math.random()));
    });
  }, [handleEvent]);
  startStreamRef.current = startStream;

  const startVisibleLifecycle = useCallback((readImmediately: boolean) => {
    clearTimer(reconcileTimerRef);
    clearTimer(reconnectTimerRef);
    if (readImmediately) void fetchSnapshot();
    reconcileTimerRef.current = window.setInterval(() => void fetchSnapshot(), RECONCILE_INTERVAL_MS);
    startStreamRef.current();
  }, [clearTimer, fetchSnapshot]);

  const stopVisibleLifecycle = useCallback(() => {
    snapshotAbortRef.current?.abort();
    snapshotAbortRef.current = null;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    clearTimer(reconcileTimerRef);
    clearTimer(reconnectTimerRef);
    clearTimer(invalidationTimerRef);
  }, [clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    scopeRef.current = normalizedScope;
    dispatch({ type: "scopeRequested", scope: normalizedScope });
    reconnectAttemptRef.current = 0;
    if (document.visibilityState !== "hidden") startVisibleLifecycle(true);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stopVisibleLifecycle();
      else {
        reconnectAttemptRef.current = 0;
        startVisibleLifecycle(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopVisibleLifecycle();
      mountedRef.current = false;
    };
  }, [normalizedScope, startVisibleLifecycle, stopVisibleLifecycle]);

  return {
    state,
    retry: fetchSnapshot
  };
}
