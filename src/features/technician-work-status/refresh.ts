import { subscribeRealtimeEvents } from "../realtime/api";
export function subscribeWorkStatusRefresh(refresh: () => void) {
  const visible = () => {
    if (document.visibilityState !== "hidden") refresh();
  };
  const unsubscribe = subscribeRealtimeEvents({
    onEvent(event) {
      if (
        event.type === "connected" ||
        event.type.startsWith("technician.work_status") ||
        event.type.startsWith("order.")
      )
        visible();
    },
  });
  const timer = window.setInterval(visible, 30_000);
  window.addEventListener("focus", visible);
  document.addEventListener("visibilitychange", visible);
  return () => {
    unsubscribe();
    window.clearInterval(timer);
    window.removeEventListener("focus", visible);
    document.removeEventListener("visibilitychange", visible);
  };
}
