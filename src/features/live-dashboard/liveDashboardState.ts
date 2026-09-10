import type {
  LiveDashboardEvent,
  LiveDashboardPeriod,
  LiveDashboardScope,
  LiveDashboardSnapshot
} from "../../api/liveDashboard";

export type LiveDashboardLoadStatus = "loading" | "ready" | "stale" | "error";
export type LiveDashboardRealtimeStatus = "connecting" | "connected" | "recovering";

export interface LiveDashboardState {
  requestedScope: LiveDashboardScope;
  committedScope: LiveDashboardScope;
  snapshot: LiveDashboardSnapshot | null;
  pendingTargetLabel: string | null;
  status: LiveDashboardLoadStatus;
  realtimeStatus: LiveDashboardRealtimeStatus;
  error: string | null;
  lastEventId: string | null;
  seenEventIds: readonly string[];
  activeRequestId: number;
}

export type LiveDashboardAction =
  | { type: "scopeRequested"; scope: LiveDashboardScope; targetLabel?: string | null }
  | { type: "snapshotStarted"; requestId: number; scope: LiveDashboardScope }
  | {
    type: "snapshotSucceeded";
    requestId: number;
    scope: LiveDashboardScope;
    snapshot: LiveDashboardSnapshot;
  }
  | { type: "snapshotFailed"; requestId: number; error: string }
  | { type: "eventReceived"; event: LiveDashboardEvent }
  | { type: "realtimeStatusChanged"; status: LiveDashboardRealtimeStatus };

const DEFAULT_SCOPE: LiveDashboardScope = { country: "JP", period: "today" };
const VALID_PERIODS = new Set<LiveDashboardPeriod>(["today", "last7days", "last30days"]);

export function parseLiveDashboardSearch(search: string): LiveDashboardScope {
  const params = new URLSearchParams(search);
  const country = params.get("country");
  const admin1 = params.get("admin1");
  const admin2 = params.get("admin2");
  const period = params.get("period");
  if (country && country !== "JP") return DEFAULT_SCOPE;
  if (period && !VALID_PERIODS.has(period as LiveDashboardPeriod)) return DEFAULT_SCOPE;
  if (admin1 && !/^\d{2}$/u.test(admin1)) return DEFAULT_SCOPE;
  if (admin2 && (!admin1 || !/^\d{5}$/u.test(admin2))) return DEFAULT_SCOPE;
  return {
    country: "JP",
    ...(admin1 ? { admin1 } : {}),
    ...(admin2 ? { admin2 } : {}),
    period: (period as LiveDashboardPeriod | null) ?? "today"
  };
}

export function snapshotMatchesScope(snapshot: LiveDashboardSnapshot, scope: LiveDashboardScope): boolean {
  return snapshot.scope.country === scope.country
    && snapshot.scope.admin1 === (scope.admin1 ?? null)
    && snapshot.scope.admin2 === (scope.admin2 ?? null);
}

function sameScope(left: LiveDashboardScope, right: LiveDashboardScope): boolean {
  return left.country === right.country
    && left.admin1 === right.admin1
    && left.admin2 === right.admin2
    && left.period === right.period;
}

function eventMatchesScope(event: LiveDashboardEvent, scope: LiveDashboardScope): boolean {
  if (event.scope.countryCode !== scope.country) return false;
  if (scope.admin1 && event.scope.admin1Code !== scope.admin1) return false;
  return !scope.admin2 || event.scope.admin2Code === scope.admin2;
}

function errorMessage(error: string): string {
  return error || "error.dashboard.unavailable";
}

export function createLiveDashboardState(scope: LiveDashboardScope): LiveDashboardState {
  return {
    requestedScope: scope,
    committedScope: scope,
    snapshot: null,
    pendingTargetLabel: null,
    status: "loading",
    realtimeStatus: "connecting",
    error: null,
    lastEventId: null,
    seenEventIds: [],
    activeRequestId: 0
  };
}

export function liveDashboardReducer(
  state: LiveDashboardState,
  action: LiveDashboardAction
): LiveDashboardState {
  switch (action.type) {
    case "scopeRequested":
      if (sameScope(action.scope, state.requestedScope)) return state;
      return {
        ...state,
        requestedScope: action.scope,
        pendingTargetLabel: action.targetLabel ?? null,
        status: "loading",
        error: null,
        realtimeStatus: "connecting"
      };
    case "snapshotStarted":
      return {
        ...state,
        requestedScope: action.scope,
        activeRequestId: action.requestId,
        status: state.snapshot ? "stale" : "loading",
        error: null
      };
    case "snapshotSucceeded":
      if (action.requestId !== state.activeRequestId) return state;
      if (!sameScope(action.scope, state.requestedScope) || !snapshotMatchesScope(action.snapshot, action.scope)) {
        return {
          ...state,
          status: state.snapshot ? "stale" : "error",
          error: "error.dashboard.scope_mismatch"
        };
      }
      return {
        ...state,
        committedScope: action.scope,
        snapshot: action.snapshot,
        pendingTargetLabel: null,
        status: "ready",
        error: null
      };
    case "snapshotFailed":
      if (action.requestId !== state.activeRequestId) return state;
      return {
        ...state,
        status: state.snapshot ? "stale" : "error",
        error: errorMessage(action.error)
      };
    case "realtimeStatusChanged":
      return state.realtimeStatus === action.status ? state : { ...state, realtimeStatus: action.status };
    case "eventReceived": { // Event IDs are retained even when the current drill-down filters out the payload.
      if (state.seenEventIds.includes(action.event.id)) return state;
      const seenEventIds = [...state.seenEventIds, action.event.id].slice(-100);
      const base = { ...state, seenEventIds, lastEventId: action.event.id };
      if (action.event.type !== "order.changed" || !state.snapshot || !eventMatchesScope(action.event, state.committedScope)) {
        return base;
      }
      const nextOrder = {
        ...action.event.payload,
        occurredAt: action.event.createdAt
      };
      const list = [
        nextOrder,
        ...state.snapshot.realtimeOrders.list.filter((order) => order.orderNo !== nextOrder.orderNo)
      ].slice(0, 20);
      return {
        ...base,
        snapshot: {
          ...state.snapshot,
          realtimeOrders: {
            ...state.snapshot.realtimeOrders,
            list,
            total: Math.max(state.snapshot.realtimeOrders.total, list.length)
          }
        }
      };
    }
  }
}
