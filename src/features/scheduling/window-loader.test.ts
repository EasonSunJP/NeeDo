import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingOrder, BookingScheduleSlot } from "../booking/api";

const apiMocks = vi.hoisted(() => ({
  listOrders: vi.fn(),
  listSlots: vi.fn()
}));

vi.mock("../booking/api", () => ({ bookingApi: { listOrders: apiMocks.listOrders } }));
vi.mock("./api", () => ({ schedulingApi: { listSlots: apiMocks.listSlots } }));

import { loadEveryTechnicianOrder, loadManagedScheduleWindow } from "./window-loader";

const makeSlot = (id: number, startsAt: string): BookingScheduleSlot => ({
  id,
  serviceId: null,
  technicianServiceId: 102,
  shopId: 11,
  technicianProfileId: 31,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(),
  capacity: 1,
  bookedCount: 0,
  status: "available",
  serviceName: `Service ${id}`,
  shopName: "Formal Shop",
  technicianName: "Formal Technician",
  priceAmount: "10000.00",
  currency: "JPY",
  durationMinutes: 60
});

const makeOrder = (id: number, startsAt: string): BookingOrder => ({
  id,
  startsAt,
  orderNo: `ND${id}`
} as BookingOrder);

describe("formal schedule window loaders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads every schedule page once and sorts by start time then numeric ID", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      makeSlot(100 - index, `2026-09-${String((index % 20) + 1).padStart(2, "0")}T10:00:00.000Z`)
    );
    const lastSlot = makeSlot(101, "2026-09-01T09:00:00.000Z");
    apiMocks.listSlots
      .mockResolvedValueOnce({ list: firstPage, total: 101, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ list: [lastSlot], total: 101, page: 2, page_size: 100 });
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2027-03-01T00:00:00.000Z");

    const result = await loadManagedScheduleWindow("technician", { from, to });

    expect(apiMocks.listSlots).toHaveBeenNthCalledWith(1, "technician", { from, to, page: 1, pageSize: 100 });
    expect(apiMocks.listSlots).toHaveBeenNthCalledWith(2, "technician", { from, to, page: 2, pageSize: 100 });
    expect(result).toHaveLength(101);
    expect(result[0]?.id).toBe(101);
    expect(result.slice(1, 6).map((slot) => slot.id)).toEqual([20, 40, 60, 80, 100]);
  });

  it("loads every technician order page and sorts newest first with a stable ID tie-break", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      makeOrder(index + 1, `2026-09-${String((index % 20) + 1).padStart(2, "0")}T10:00:00.000Z`)
    );
    apiMocks.listOrders
      .mockResolvedValueOnce({ list: firstPage, total: 101, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ list: [makeOrder(101, "2026-09-20T10:00:00.000Z")], total: 101, page: 2, page_size: 100 });

    const result = await loadEveryTechnicianOrder();

    expect(apiMocks.listOrders).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
    expect(apiMocks.listOrders).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });
    expect(result).toHaveLength(101);
    expect(result.slice(0, 6).map((order) => order.id)).toEqual([101, 100, 80, 60, 40, 20]);
  });

  it("rejects invalid page sizes and repeated response pages", async () => {
    apiMocks.listSlots.mockResolvedValueOnce({ list: [], total: 1, page: 1, page_size: 0 });
    await expect(loadManagedScheduleWindow("technician", {
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2027-03-01T00:00:00.000Z")
    })).rejects.toThrow("error.pagination.invalid_page_size");

    apiMocks.listOrders
      .mockResolvedValueOnce({
        list: Array.from({ length: 100 }, (_, index) => makeOrder(index + 1, "2026-09-01T10:00:00.000Z")),
        total: 101,
        page: 1,
        page_size: 100
      })
      .mockResolvedValueOnce({ list: [makeOrder(101, "2026-09-02T10:00:00.000Z")], total: 101, page: 1, page_size: 100 });
    await expect(loadEveryTechnicianOrder()).rejects.toThrow("error.pagination.no_progress");
  });
});
