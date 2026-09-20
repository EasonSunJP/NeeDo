import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { realtimeApi, subscribeRealtimeEvents, type RealtimeUnreadCounts } from "./api";

const emptyCounts: RealtimeUnreadCounts = {
  conversations: 0,
  friendRequests: 0,
  notifications: 0,
  total: 0
};

const RealtimeUnreadCountsContext = createContext<RealtimeUnreadCounts>(emptyCounts);

export function RealtimeUnreadCountsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isRestoring, session } = useAuth();
  const location = useLocation();
  const enabled = isAuthenticated && Boolean(session) && !isRestoring && !location.pathname.startsWith("/login");
  const [counts, setCounts] = useState<RealtimeUnreadCounts>(emptyCounts);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCounts(emptyCounts);
      return;
    }

    try {
      setCounts(await realtimeApi.unreadCounts());
    } catch {
      // Preserve the last durable count while a reconnect is in progress.
    }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!enabled) return undefined;

    return subscribeRealtimeEvents({
      onEvent: () => { void refresh(); }
    });
  }, [enabled, refresh]);

  return createElement(RealtimeUnreadCountsContext.Provider, { value: counts }, children);
}

export function useRealtimeUnreadCounts() {
  return useContext(RealtimeUnreadCountsContext);
}
