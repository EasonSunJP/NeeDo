import { describe, expect, it, vi } from "vitest";
import {
  liveDashboardApi,
  requireLiveDashboardEvent,
  requireLiveDashboardSnapshot,
  serializeLiveDashboardQuery,
  type LiveDashboardScope
} from "./liveDashboard";
import { httpClient } from "./httpClient";

const requestedScope: LiveDashboardScope = {
  country: "JP",
  admin1: "13",
  admin2: "13104",
  period: "today"
};

const payload = {
  testNdpVisible: true,
  scope: {
    country: "JP",
    admin1: "13",
    admin2: "13104",
    breadcrumbs: [
      { level: "country", code: "JP", name: "日本" },
      { level: "admin1", code: "13", name: "東京都" },
      { level: "admin2", code: "13104", name: "新宿区" }
    ]
  },
  evaluatedAt: "2026-09-06T03:04:05.000Z",
  cachedAt: "2026-09-06T03:04:05.000Z",
  freshnessSeconds: 0,
  cacheStatus: "miss",
  children: [],
  headline: { newOrders: 1, completedOrders: 2, newCustomers: 3, onboardedTechnicians: 4 },
  confirmedPayments: { jpy: 9000, ndp: 2, testNdp: 3 },
  orders: {
    total: 2,
    serviceGmv: { jpy: 9000, ndp: 2, testNdp: 3 },
    platformNetRevenue: { jpy: -100, ndp: 0, testNdp: 0 },
    agentCommission: null
  },
  realtimeOrders: {
    list: [{ orderNo: "NDO-1", status: "confirmed", serviceName: "家政", amountJpy: 9000, occurredAt: "2026-09-06T03:03:05.000Z" }],
    total: 1,
    page: 1,
    page_size: 20
  },
  activity: [],
  trend: [{ key: "2026-09-06", label: "9/6", orderCount: 1, confirmedPayments: { jpy: 9000, ndp: 0, testNdp: 0 } }],
  serviceRanking: [{ rank: 1, entityPublicId: "svc1", displayName: "家政", avatarUrl: null, gmvJpy: 9000, completedCount: 1 }],
  technicianRanking: [],
  coverage: { total: 2, attributed: 1, unresolved: 1, completenessPercent: 50 }
};

describe("live dashboard API contracts", () => {
  it("serializes the one authoritative scope", () => {
    expect(serializeLiveDashboardQuery(requestedScope)).toEqual({
      country: "JP",
      admin1: "13",
      admin2: "13104",
      period: "today"
    });
  });

  it("accepts an exact matching snapshot and rejects mismatches or extra keys", () => {
    expect(requireLiveDashboardSnapshot(payload, requestedScope)).toEqual(payload);
    expect(() => requireLiveDashboardSnapshot({ ...payload, scope: { ...payload.scope, admin2: "27128" } }, requestedScope))
      .toThrow("error.dashboard.scope_mismatch");
    expect(() => requireLiveDashboardSnapshot({ ...payload, customerName: "private" }, requestedScope))
      .toThrow("error.dashboard.invalid_snapshot");
  });

  it("requires formal current-day and previous-day order evidence for map heat", () => {
    const nationalScope = { country: "JP", period: "today" } as const;
    const nationalPayload = {
      ...payload,
      scope: { country: "JP", admin1: null, admin2: null, breadcrumbs: [{ level: "country", code: "JP", name: "日本" }] },
      children: [{
        code: "13",
        name: "東京都",
        orderCount: 8,
        currentDayOrderCount: 5,
        previousDayOrderCount: 3,
        confirmedPayments: { jpy: 9000, ndp: 0, testNdp: 0 }
      }]
    };
    expect(requireLiveDashboardSnapshot(nationalPayload, nationalScope).children[0]).toMatchObject({
      currentDayOrderCount: 5,
      previousDayOrderCount: 3
    });
    const { previousDayOrderCount: _missing, ...invalidChild } = nationalPayload.children[0];
    expect(() => requireLiveDashboardSnapshot({ ...nationalPayload, children: [invalidChild] }, nationalScope))
      .toThrow("error.dashboard.invalid_snapshot");
  });

  it("rejects unsafe totals, invalid hierarchy, and lists beyond formal caps", () => {
    expect(() => requireLiveDashboardSnapshot({ ...payload, coverage: { ...payload.coverage, total: 3 } }, requestedScope))
      .toThrow("error.dashboard.invalid_snapshot");
    expect(() => requireLiveDashboardSnapshot({ ...payload, realtimeOrders: { ...payload.realtimeOrders, page: 2 } }, requestedScope))
      .toThrow("error.dashboard.invalid_snapshot");
    expect(() => requireLiveDashboardSnapshot({ ...payload, serviceRanking: Array.from({ length: 11 }, (_, rank) => ({ ...payload.serviceRanking[0], rank: rank + 1 })) }, requestedScope))
      .toThrow("error.dashboard.invalid_snapshot");
  });

  it("strictly validates supported SSE events", () => {
    expect(requireLiveDashboardEvent({
      id: "1700000000000-2",
      type: "order.changed",
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      payload: { orderNo: "NDO-1", status: "confirmed", serviceName: "家政", amountJpy: 9000 },
      createdAt: "2026-09-06T03:04:05.000Z"
    }).type).toBe("order.changed");
    expect(() => requireLiveDashboardEvent({ id: "1-0", type: "customer.changed", payload: {} }))
      .toThrow("error.dashboard.invalid_event");
  });

  it("reads a snapshot through the formal authenticated client", async () => {
    const request = vi.spyOn(httpClient, "request").mockResolvedValueOnce(payload);
    await expect(liveDashboardApi.snapshot(requestedScope)).resolves.toEqual(payload);
    expect(request).toHaveBeenCalledWith("/backoffice/dashboard/live-snapshot", {
      query: serializeLiveDashboardQuery(requestedScope),
      signal: undefined
    });
  });
});
