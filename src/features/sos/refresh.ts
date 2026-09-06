import { subscribeRealtimeEvents } from "../realtime/api";

// SSE is an invalidation hint; reconnects and bounded polling recover missed events.
export function subscribeSosRefresh(refresh: () => void) {
  const onVisible = () => { if (document.visibilityState !== "hidden") refresh(); };
  const unsubscribe = subscribeRealtimeEvents({ onEvent: (event) => {
    if (event.type === "connected" || event.type.startsWith("sos.") || event.type.startsWith("order.")) refresh();
  } });
  const timer = window.setInterval(onVisible, 20_000);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  return () => { unsubscribe(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
}
