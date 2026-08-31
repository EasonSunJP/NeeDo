import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";

const mocked = vi.hoisted(() => ({
  dashboard: vi.fn()
}));

vi.mock("../../api/backofficeRealData", () => ({
  backofficeRealDataApi: {
    dashboard: mocked.dashboard
  }
}));

import {
  invalidateMerchantAdminDashboard,
  loadMerchantAdminDashboard
} from "./dashboardResource";

const last7daysQuery = { period: "last7days" as const };
const monthQuery = { period: "month" as const };

describe("merchant admin dashboard resource", () => {
  beforeEach(() => {
    mocked.dashboard.mockReset();
    invalidateMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery);
    invalidateMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", monthQuery);
    invalidateMerchantAdminDashboard("user:2:identity:22:shop:shop0000000002", last7daysQuery);
  });

  it("shares one in-flight formal request for the same merchant scope", async () => {
    let resolveRequest!: (value: { shops: Array<{ id: number }> }) => void;
    const pending = new Promise<{ shops: Array<{ id: number }> }>((resolve) => {
      resolveRequest = resolve;
    });
    mocked.dashboard.mockReturnValue(pending);

    const first = loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery);
    const second = loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery);

    expect(first).toBe(second);
    expect(mocked.dashboard).toHaveBeenCalledTimes(1);
    expect(mocked.dashboard).toHaveBeenCalledWith("merchant-admin", last7daysQuery);

    resolveRequest({ shops: [{ id: 1 }] });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { shops: [{ id: 1 }] },
      { shops: [{ id: 1 }] }
    ]);
  });

  it("reuses a recent resolved payload until that merchant scope is invalidated", async () => {
    mocked.dashboard
      .mockResolvedValueOnce({ shops: [{ id: 1 }] })
      .mockResolvedValueOnce({ shops: [{ id: 2 }] });

    await expect(loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery)).resolves.toEqual({ shops: [{ id: 1 }] });
    await expect(loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery)).resolves.toEqual({ shops: [{ id: 1 }] });
    expect(mocked.dashboard).toHaveBeenCalledTimes(1);

    invalidateMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery);

    await expect(loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery)).resolves.toEqual({ shops: [{ id: 2 }] });
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("does not share a cached payload across merchant scopes", async () => {
    mocked.dashboard
      .mockResolvedValueOnce({ shops: [{ id: 1 }] })
      .mockResolvedValueOnce({ shops: [{ id: 2 }] });

    await expect(loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery)).resolves.toEqual({ shops: [{ id: 1 }] });
    await expect(loadMerchantAdminDashboard("user:2:identity:22:shop:shop0000000002", last7daysQuery)).resolves.toEqual({ shops: [{ id: 2 }] });
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("shares one bounded retry sequence after a transient timeout", async () => {
    mocked.dashboard
      .mockRejectedValueOnce(new ApiClientError("error.network.timeout", 408, 408))
      .mockResolvedValueOnce({ shops: [{ id: 1 }] });

    const first = loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery);
    const second = loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery);

    expect(first).toBe(second);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { shops: [{ id: 1 }] },
      { shops: [{ id: 1 }] }
    ]);
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("does not retry a deterministic dashboard rejection", async () => {
    const error = new ApiClientError("error.forbidden", 403, 403);
    mocked.dashboard.mockRejectedValue(error);

    await expect(loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery)).rejects.toBe(error);
    expect(mocked.dashboard).toHaveBeenCalledTimes(1);
  });

  it("clears a failed request so an explicit retry can reach the formal API", async () => {
    const error = new Error("temporary failure");
    mocked.dashboard
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ shops: [{ id: 1 }] });

    await expect(loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery)).rejects.toBe(error);
    await expect(loadMerchantAdminDashboard("user:1:identity:11:shop:shop0000000001", last7daysQuery)).resolves.toEqual({ shops: [{ id: 1 }] });
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("keeps period and range dimensions in the cache key", async () => {
    mocked.dashboard
      .mockResolvedValueOnce({ filter: { period: "last7days" } })
      .mockResolvedValueOnce({ filter: { period: "month" } });
    const scopeKey = "user:1:identity:11:shop:shop0000000001";

    await expect(loadMerchantAdminDashboard(scopeKey, last7daysQuery)).resolves.toEqual({
      filter: { period: "last7days" }
    });
    await expect(loadMerchantAdminDashboard(scopeKey, monthQuery)).resolves.toEqual({
      filter: { period: "month" }
    });

    expect(mocked.dashboard).toHaveBeenNthCalledWith(1, "merchant-admin", last7daysQuery);
    expect(mocked.dashboard).toHaveBeenNthCalledWith(2, "merchant-admin", monthQuery);
  });

  it("keeps from, to, and city dimensions in the exact cache key", async () => {
    const scopeKey = "user:3:identity:33:shop:shop0000000003";
    const tokyoQuery = {
      period: "custom" as const,
      from: "2026-08-01",
      to: "2026-08-15",
      city: "Tokyo"
    };
    const osakaQuery = {
      period: "custom" as const,
      from: "2026-08-16",
      to: "2026-08-31",
      city: "Osaka"
    };
    invalidateMerchantAdminDashboard(scopeKey, tokyoQuery);
    invalidateMerchantAdminDashboard(scopeKey, osakaQuery);
    mocked.dashboard
      .mockResolvedValueOnce({ filter: { city: "Tokyo" } })
      .mockResolvedValueOnce({ filter: { city: "Osaka" } });

    await expect(loadMerchantAdminDashboard(scopeKey, tokyoQuery)).resolves.toEqual({
      filter: { city: "Tokyo" }
    });
    await expect(loadMerchantAdminDashboard(scopeKey, osakaQuery)).resolves.toEqual({
      filter: { city: "Osaka" }
    });

    expect(mocked.dashboard).toHaveBeenNthCalledWith(1, "merchant-admin", tokyoQuery);
    expect(mocked.dashboard).toHaveBeenNthCalledWith(2, "merchant-admin", osakaQuery);
  });

  it("invalidates only the exact scope and query key for manual retry", async () => {
    mocked.dashboard
      .mockResolvedValueOnce({ filter: { period: "last7days" }, revision: 1 })
      .mockResolvedValueOnce({ filter: { period: "month" }, revision: 1 })
      .mockResolvedValueOnce({ filter: { period: "last7days" }, revision: 2 });
    const scopeKey = "user:1:identity:11:shop:shop0000000001";

    await loadMerchantAdminDashboard(scopeKey, last7daysQuery);
    await loadMerchantAdminDashboard(scopeKey, monthQuery);
    invalidateMerchantAdminDashboard(scopeKey, last7daysQuery);

    await expect(loadMerchantAdminDashboard(scopeKey, monthQuery)).resolves.toEqual({
      filter: { period: "month" },
      revision: 1
    });
    await expect(loadMerchantAdminDashboard(scopeKey, last7daysQuery)).resolves.toEqual({
      filter: { period: "last7days" },
      revision: 2
    });
    expect(mocked.dashboard).toHaveBeenCalledTimes(3);
  });

  it("does not let a late Shop A response replace the Shop B cache", async () => {
    let resolveShopA!: (value: { scope: { shopPublicId: string } }) => void;
    const shopARequest = new Promise<{ scope: { shopPublicId: string } }>((resolve) => {
      resolveShopA = resolve;
    });
    mocked.dashboard
      .mockReturnValueOnce(shopARequest)
      .mockResolvedValueOnce({ scope: { shopPublicId: "shop0000000002" } });

    const shopA = loadMerchantAdminDashboard(
      "user:1:identity:11:shop:shop0000000001",
      last7daysQuery
    );
    const shopB = loadMerchantAdminDashboard(
      "user:1:identity:11:shop:shop0000000002",
      last7daysQuery
    );

    await expect(shopB).resolves.toEqual({
      scope: { shopPublicId: "shop0000000002" }
    });
    resolveShopA({ scope: { shopPublicId: "shop0000000001" } });
    await expect(shopA).resolves.toEqual({
      scope: { shopPublicId: "shop0000000001" }
    });
    await expect(
      loadMerchantAdminDashboard(
        "user:1:identity:11:shop:shop0000000002",
        last7daysQuery
      )
    ).resolves.toEqual({ scope: { shopPublicId: "shop0000000002" } });
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });
});
