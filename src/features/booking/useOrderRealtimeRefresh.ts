import { useEffect, useRef } from "react";
import { subscribeRealtimeEvents, type FormalRealtimeEvent } from "../realtime/api";

type OrderRealtimeRefreshOptions = {
  enabled?: boolean;
  onRefresh: () => Promise<unknown> | unknown;
  orderId?: number;
  pollingIntervalMs?: number;
};

function finiteOrderId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function getRealtimeOrderId(event: Pick<FormalRealtimeEvent, "payload" | "type">): number | null {
  if (!event.payload || typeof event.payload !== "object") return null;
  const payload = event.payload as Record<string, unknown>;

  if (event.type === "booking.order_changed") return finiteOrderId(payload.orderId);
  if (event.type !== "notification.order_status") return null;

  const notificationPayload = payload.payload;
  return notificationPayload && typeof notificationPayload === "object"
    ? finiteOrderId((notificationPayload as Record<string, unknown>).orderId)
    : null;
}

export function useOrderRealtimeRefresh({
  enabled = true,
  onRefresh,
  orderId,
  pollingIntervalMs = 15_000
}: OrderRealtimeRefreshOptions) {
  const refreshRef = useRef(onRefresh);
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    const refresh = () => {
      if (!active || inFlightRef.current) return inFlightRef.current;
      const request = Promise.resolve(refreshRef.current()).catch(() => undefined).finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
      inFlightRef.current = request;
      return request;
    };
    const matchesOrder = (event: FormalRealtimeEvent) => {
      const changedOrderId = getRealtimeOrderId(event);
      return changedOrderId !== null && (orderId === undefined || changedOrderId === orderId);
    };
    const unsubscribe = subscribeRealtimeEvents({
      onEvent(event) {
        if (matchesOrder(event)) void refresh();
      }
    });
    const intervalId = globalThis.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") void refresh();
    }, pollingIntervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      unsubscribe();
      globalThis.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, orderId, pollingIntervalMs]);
}
