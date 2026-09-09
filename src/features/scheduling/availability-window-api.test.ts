import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { availabilityWindowApi } from "./availability-window-api";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));
vi.mock("../../lib/persistentCacheScope", () => ({ getAuthenticatedPersistentCacheScope: () => null }));

describe("availabilityWindowApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("creates an arbitrary-length technician availability window independently from service slots", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ id: 88 } as never);
    const startsAt = new Date("2026-09-10T09:00:00.000Z");
    const endsAt = new Date("2026-09-10T15:00:00.000Z");
    await availabilityWindowApi.create("technician", { startsAt, endsAt, capacity: 1 });
    expect(httpClient.request).toHaveBeenCalledWith("/technician/availability-windows", {
      body: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), capacity: 1 },
      method: "POST"
    });
  });

  it("loads every availability page so dense schedules are not truncated", async () => {
    const startsAt = new Date("2026-09-10T00:00:00.000Z");
    const endsAt = new Date("2026-09-17T00:00:00.000Z");
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ list: [{ id: 1 }], total: 101, page: 1, page_size: 100 } as never)
      .mockResolvedValueOnce({ list: [{ id: 101 }], total: 101, page: 2, page_size: 100 } as never);

    await expect(availabilityWindowApi.listAll("technician", { from: startsAt, to: endsAt }))
      .resolves.toEqual([{ id: 1 }, { id: 101 }]);
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/technician/availability-windows", {
      query: { from: startsAt.toISOString(), to: endsAt.toISOString(), page: 2, pageSize: 100 }
    });
  });
});
