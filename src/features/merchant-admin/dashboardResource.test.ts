import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("merchant admin dashboard resource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMerchantAdminDashboard("merchant:1:shop:1");
    invalidateMerchantAdminDashboard("merchant:2:shop:2");
  });

  it("shares one in-flight formal request for the same merchant scope", async () => {
    let resolveRequest!: (value: { shops: Array<{ id: number }> }) => void;
    const pending = new Promise<{ shops: Array<{ id: number }> }>((resolve) => {
      resolveRequest = resolve;
    });
    mocked.dashboard.mockReturnValue(pending);

    const first = loadMerchantAdminDashboard("merchant:1:shop:1");
    const second = loadMerchantAdminDashboard("merchant:1:shop:1");

    expect(first).toBe(second);
    expect(mocked.dashboard).toHaveBeenCalledTimes(1);
    expect(mocked.dashboard).toHaveBeenCalledWith("merchant-admin");

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

    await expect(loadMerchantAdminDashboard("merchant:1:shop:1")).resolves.toEqual({ shops: [{ id: 1 }] });
    await expect(loadMerchantAdminDashboard("merchant:1:shop:1")).resolves.toEqual({ shops: [{ id: 1 }] });
    expect(mocked.dashboard).toHaveBeenCalledTimes(1);

    invalidateMerchantAdminDashboard("merchant:1:shop:1");

    await expect(loadMerchantAdminDashboard("merchant:1:shop:1")).resolves.toEqual({ shops: [{ id: 2 }] });
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("does not share a cached payload across merchant scopes", async () => {
    mocked.dashboard
      .mockResolvedValueOnce({ shops: [{ id: 1 }] })
      .mockResolvedValueOnce({ shops: [{ id: 2 }] });

    await expect(loadMerchantAdminDashboard("merchant:1:shop:1")).resolves.toEqual({ shops: [{ id: 1 }] });
    await expect(loadMerchantAdminDashboard("merchant:2:shop:2")).resolves.toEqual({ shops: [{ id: 2 }] });
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });

  it("clears a failed request so an explicit retry can reach the formal API", async () => {
    const error = new Error("temporary failure");
    mocked.dashboard
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ shops: [{ id: 1 }] });

    await expect(loadMerchantAdminDashboard("merchant:1:shop:1")).rejects.toBe(error);
    await expect(loadMerchantAdminDashboard("merchant:1:shop:1")).resolves.toEqual({ shops: [{ id: 1 }] });
    expect(mocked.dashboard).toHaveBeenCalledTimes(2);
  });
});
