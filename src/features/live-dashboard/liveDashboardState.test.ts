import { describe, expect, it } from "vitest";
import type { LiveDashboardEvent, LiveDashboardScope, LiveDashboardSnapshot } from "../../api/liveDashboard";
import {
  createLiveDashboardState,
  liveDashboardReducer,
  parseLiveDashboardSearch,
  snapshotMatchesScope,
  type LiveDashboardState
} from "./liveDashboardState";

const scope: LiveDashboardScope = { country: "JP", admin1: "13", period: "today" };
const snapshot = {
  scope: { country: "JP", admin1: "13", admin2: null, breadcrumbs: [] },
  realtimeOrders: { list: [], total: 0, page: 1, page_size: 20 }
} as unknown as LiveDashboardSnapshot;

describe("live dashboard state", () => {
  it("parses only valid hierarchical URL scope", () => {
    expect(parseLiveDashboardSearch("")).toEqual({ country: "JP", period: "today" });
    expect(parseLiveDashboardSearch("?country=JP&admin1=13&admin2=13104&period=last7days"))
      .toEqual({ country: "JP", admin1: "13", admin2: "13104", period: "last7days" });
    expect(parseLiveDashboardSearch("?country=JP&admin2=13104"))
      .toEqual({ country: "JP", period: "today" });
    expect(parseLiveDashboardSearch("?country=US&admin1=x&period=forever"))
      .toEqual({ country: "JP", period: "today" });
  });

  it("rejects stale or mismatched responses without replacing committed data", () => {
    const ready = { ...createLiveDashboardState(scope), snapshot, status: "ready" as const, activeRequestId: 2 };
    const mismatched = liveDashboardReducer(ready, {
      type: "snapshotSucceeded",
      requestId: 2,
      scope: { ...scope, admin2: "13104" },
      snapshot
    });
    expect(mismatched.snapshot).toBe(snapshot);
    expect(mismatched.error).toBe("error.dashboard.scope_mismatch");
    expect(snapshotMatchesScope(snapshot, { ...scope, admin2: "13104" })).toBe(false);

    const latest = { ...ready, activeRequestId: 3 };
    const stale = liveDashboardReducer(latest, {
      type: "snapshotSucceeded",
      requestId: 2,
      scope,
      snapshot
    });
    expect(stale).toBe(latest);
    expect(stale.snapshot).toBe(snapshot);
  });

  it("deduplicates events, keeps 100 ids, and inserts matching orders at the top", () => {
    let state: LiveDashboardState = { ...createLiveDashboardState(scope), snapshot, status: "ready" };
    const event = {
      id: "1700000000000-1",
      type: "order.changed",
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      payload: { orderNo: "NDO-1", status: "confirmed", serviceName: "家政", amountJpy: 9000 },
      createdAt: "2026-09-06T03:04:05.000Z"
    } satisfies LiveDashboardEvent;
    state = liveDashboardReducer(state, { type: "eventReceived", event });
    state = liveDashboardReducer(state, { type: "eventReceived", event });
    expect(state.snapshot?.realtimeOrders.list).toHaveLength(1);
    expect(state.lastEventId).toBe(event.id);
    expect(state.seenEventIds).toEqual([event.id]);

    for (let index = 2; index <= 110; index += 1) {
      state = liveDashboardReducer(state, {
        type: "eventReceived",
        event: { ...event, id: `1700000000000-${index}`, payload: { ...event.payload, orderNo: `NDO-${index}` } }
      });
    }
    expect(state.seenEventIds).toHaveLength(100);
    expect(state.snapshot?.realtimeOrders.list).toHaveLength(20);
  });
});
