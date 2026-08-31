import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";

const mocked = vi.hoisted(() => ({
  credentialEpoch: 1,
  dashboard: vi.fn()
}));

vi.mock("../../api/backofficeRealData", () => ({
  backofficeRealDataApi: {
    dashboard: mocked.dashboard
  }
}));

vi.mock("../../auth/authCredentialCoordinator", () => {
  return {
    getAuthCredentialSnapshot: () => ({
      credentialVersion: mocked.credentialEpoch
    }),
    subscribeAuthCredentialSnapshot: () => () => undefined
  };
});

import {
  invalidateMerchantAdminDashboard,
  invalidateMerchantAdminDashboardOwner,
  loadMerchantAdminDashboard,
  type MerchantAdminDashboardOwner
} from "./dashboardResource";

const last7daysQuery = { period: "last7days" as const };
const monthQuery = { period: "month" as const };
const ownerA: MerchantAdminDashboardOwner = {
  credentialEpoch: 1,
  identityId: 11,
  shopPublicId: "shop0000000001",
  userId: 1
};
const ownerB: MerchantAdminDashboardOwner = {
  credentialEpoch: 2,
  identityId: 11,
  shopPublicId: "shop0000000002",
  userId: 1
};

function payload(shopPublicId: string, revision = 1) {
  return {
    revision,
    scope: { kind: "shop" as const, shopPublicId }
  };
}

describe("merchant admin dashboard resource", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocked.credentialEpoch = 1;
    mocked.dashboard.mockReset();
    invalidateMerchantAdminDashboardOwner(ownerA);
    invalidateMerchantAdminDashboardOwner(ownerB);
  });

  it("shares one in-flight request only for the same signed owner, epoch, and exact query", async () => {
    let resolveRequest!: (value: ReturnType<typeof payload>) => void;
    const pending = new Promise<ReturnType<typeof payload>>((resolve) => {
      resolveRequest = resolve;
    });
    mocked.dashboard.mockReturnValue(pending);

    const first = loadMerchantAdminDashboard(ownerA, last7daysQuery);
    const second = loadMerchantAdminDashboard(ownerA, last7daysQuery);

    expect(first).toBe(second);
    expect(mocked.dashboard).toHaveBeenCalledTimes(1);
    expect(mocked.dashboard).toHaveBeenCalledWith("merchant-admin", last7daysQuery, {
      signal: expect.any(AbortSignal)
    });

    resolveRequest(payload(ownerA.shopPublicId));
    await expect(Promise.all([first, second])).resolves.toEqual([
      payload(ownerA.shopPublicId),
      payload(ownerA.shopPublicId)
    ]);
  });

  it("reuses a recent payload until that exact owner and query are invalidated", async () => {
    mocked.dashboard
      .mockResolvedValueOnce(payload(ownerA.shopPublicId, 1))
      .mockResolvedValueOnce(payload(ownerA.shopPublicId, 2));

    await loadMerchantAdminDashboard(ownerA, last7daysQuery);
    await expect(loadMerchantAdminDashboard(ownerA, last7daysQuery)).resolves.toEqual(
      payload(ownerA.shopPublicId, 1)
    );
    invalidateMerchantAdminDashboard(ownerA, last7daysQuery);
    await expect(loadMerchantAdminDashboard(ownerA, last7daysQuery)).resolves.toEqual(
      payload(ownerA.shopPublicId, 2)
    );
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("checks the credential owner before returning a cached payload", async () => {
    mocked.dashboard.mockResolvedValue(payload(ownerA.shopPublicId));

    await loadMerchantAdminDashboard(ownerA, last7daysQuery);
    mocked.credentialEpoch = 2;

    await expect(loadMerchantAdminDashboard(ownerA, last7daysQuery)).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(mocked.dashboard).toHaveBeenCalledTimes(1);
  });

  it("keeps period, range, and city in the exact cache key", async () => {
    const customQuery = {
      city: "Tokyo",
      from: "2026-08-01",
      period: "custom" as const,
      to: "2026-08-31"
    };
    mocked.dashboard
      .mockResolvedValueOnce(payload(ownerA.shopPublicId, 1))
      .mockResolvedValueOnce(payload(ownerA.shopPublicId, 2))
      .mockResolvedValueOnce(payload(ownerA.shopPublicId, 3));

    await loadMerchantAdminDashboard(ownerA, last7daysQuery);
    await loadMerchantAdminDashboard(ownerA, monthQuery);
    await loadMerchantAdminDashboard(ownerA, customQuery);

    expect(mocked.dashboard).toHaveBeenNthCalledWith(3, "merchant-admin", customQuery, {
      signal: expect.any(AbortSignal)
    });
  });

  it("shares one bounded retry sequence for the exact owner key", async () => {
    mocked.dashboard
      .mockRejectedValueOnce(new ApiClientError("error.network.timeout", 408, 408))
      .mockResolvedValueOnce(payload(ownerA.shopPublicId));

    const first = loadMerchantAdminDashboard(ownerA, last7daysQuery);
    const second = loadMerchantAdminDashboard(ownerA, last7daysQuery);

    await expect(Promise.all([first, second])).resolves.toEqual([
      payload(ownerA.shopPublicId),
      payload(ownerA.shopPublicId)
    ]);
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("does not retry a deterministic dashboard rejection", async () => {
    const error = new ApiClientError("error.forbidden", 403, 403);
    mocked.dashboard.mockRejectedValue(error);

    await expect(loadMerchantAdminDashboard(ownerA, last7daysQuery)).rejects.toBe(error);
    expect(mocked.dashboard).toHaveBeenCalledTimes(1);
  });

  it("aborts and invalidates Shop A before a slow response can survive Shop B ownership", async () => {
    let resolveShopA!: (value: ReturnType<typeof payload>) => void;
    const shopARequest = new Promise<ReturnType<typeof payload>>((resolve) => {
      resolveShopA = resolve;
    });
    mocked.dashboard
      .mockReturnValueOnce(shopARequest)
      .mockResolvedValueOnce(payload(ownerB.shopPublicId));

    const shopA = loadMerchantAdminDashboard(ownerA, last7daysQuery);
    invalidateMerchantAdminDashboardOwner(ownerA);
    mocked.credentialEpoch = 2;
    const shopB = loadMerchantAdminDashboard(ownerB, last7daysQuery);

    await expect(shopB).resolves.toEqual(payload(ownerB.shopPublicId));
    resolveShopA(payload(ownerA.shopPublicId));
    await expect(shopA).rejects.toMatchObject({ name: "AbortError" });
  });

  it("stops Shop A transient retry after Shop B changes the credential epoch", async () => {
    vi.useFakeTimers();
    mocked.dashboard
      .mockRejectedValueOnce(new ApiClientError("error.network.timeout", 408, 408))
      .mockResolvedValueOnce(payload(ownerB.shopPublicId));

    const shopA = loadMerchantAdminDashboard(ownerA, last7daysQuery);
    const shopARejection = expect(shopA).rejects.toMatchObject({
      name: "AbortError"
    });
    await Promise.resolve();
    invalidateMerchantAdminDashboardOwner(ownerA);
    mocked.credentialEpoch = 2;
    const shopB = loadMerchantAdminDashboard(ownerB, last7daysQuery);
    await vi.advanceTimersByTimeAsync(300);

    await shopARejection;
    await expect(shopB).resolves.toEqual(payload(ownerB.shopPublicId));
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a prior login cache when the same IDs receive a new credential epoch", async () => {
    const reloggedOwner = { ...ownerA, credentialEpoch: 2 };
    mocked.dashboard
      .mockResolvedValueOnce(payload(ownerA.shopPublicId, 1))
      .mockResolvedValueOnce(payload(ownerA.shopPublicId, 2));

    await loadMerchantAdminDashboard(ownerA, last7daysQuery);
    mocked.credentialEpoch = 2;
    await expect(loadMerchantAdminDashboard(reloggedOwner, last7daysQuery)).resolves.toEqual(
      payload(ownerA.shopPublicId, 2)
    );
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("rejects a mismatched response scope and never caches it", async () => {
    mocked.dashboard
      .mockResolvedValueOnce(payload("shop0000000099"))
      .mockResolvedValueOnce(payload(ownerA.shopPublicId, 2));

    await expect(loadMerchantAdminDashboard(ownerA, last7daysQuery)).rejects.toThrow(
      "error.auth.dashboard_scope_mismatch"
    );
    await expect(loadMerchantAdminDashboard(ownerA, last7daysQuery)).resolves.toEqual(
      payload(ownerA.shopPublicId, 2)
    );
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("refuses to create an unselected merchant cache authority", async () => {
    await expect(
      loadMerchantAdminDashboard({ ...ownerA, shopPublicId: "unselected" }, last7daysQuery)
    ).rejects.toThrow("error.auth.merchant_shop_required");
    expect(mocked.dashboard).not.toHaveBeenCalled();
  });

  it("bounds resolved cache growth and evicts the least recently used entry", async () => {
    mocked.dashboard.mockResolvedValue(payload(ownerA.shopPublicId));
    const queries = Array.from({ length: 40 }, (_, index) => ({
      from: `2026-07-${String(index + 1).padStart(2, "0")}`,
      period: "custom" as const,
      to: `2026-08-${String(index + 1).padStart(2, "0")}`
    }));

    for (const query of queries) {
      await loadMerchantAdminDashboard(ownerA, query);
    }
    await loadMerchantAdminDashboard(ownerA, queries[0]);

    expect(mocked.dashboard).toHaveBeenCalledTimes(41);
  });

  it("sweeps concurrent requests to the cache bound by aborting the oldest entries", async () => {
    mocked.dashboard.mockResolvedValue(payload(ownerA.shopPublicId));
    const queries = Array.from({ length: 40 }, (_, index) => ({
      from: `2026-05-${String(index + 1).padStart(2, "0")}`,
      period: "custom" as const,
      to: `2026-06-${String(index + 1).padStart(2, "0")}`
    }));

    const results = await Promise.allSettled(
      queries.map((query) => loadMerchantAdminDashboard(ownerA, query))
    );
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(8);
    await loadMerchantAdminDashboard(ownerA, queries[0]);

    expect(mocked.dashboard).toHaveBeenCalledTimes(41);
  });

  it("counts in-flight entries toward the LRU bound and aborts the oldest request", async () => {
    const signals: AbortSignal[] = [];
    mocked.dashboard.mockImplementation(
      (_scope: string, _query: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal as AbortSignal;
          signals.push(signal);
          signal.addEventListener("abort", () => {
            reject(new DOMException("evicted", "AbortError"));
          });
        })
    );
    const queries = Array.from({ length: 33 }, (_, index) => ({
      from: `2026-03-${String(index + 1).padStart(2, "0")}`,
      period: "custom" as const,
      to: `2026-04-${String(index + 1).padStart(2, "0")}`
    }));

    const requests = queries.map((query) => loadMerchantAdminDashboard(ownerA, query));
    requests.forEach((request) => void request.catch(() => undefined));

    await expect(requests[0]).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[32]?.aborted).toBe(false);
  });
});
