import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingApi, type BookingOrder, type BookingScheduleSlot } from "./api";
import {
  loadAvailabilityDateSummaries,
  loadAvailabilityStartSummaries,
  loadCustomerOrderWindow,
  loadTechnicianAvailabilityWindow
} from "./window-loaders";

const from = new Date("2026-08-31T15:00:00.000Z");
const to = new Date("2026-10-01T15:00:00.000Z");

const makeSlot = (id: number): BookingScheduleSlot => {
  const startsAt = new Date(Date.UTC(2026, 8, 1, id));
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  return {
    id,
    serviceId: null,
    technicianServiceId: 701,
    shopId: 16,
    technicianProfileId: 17,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    capacity: 1,
    bookedCount: 0,
    status: "available",
    serviceName: "ボディケア",
    shopName: "LifeDance Wellness 渋谷",
    technicianName: "Formal Technician",
    priceAmount: "8000",
    currency: "JPY",
    durationMinutes: 60
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formal booking window loaders", () => {
  it("loads one compact 30-minute start summary page for a selected day", async () => {
    const summaries = [{
      startsAt: "2026-09-21T01:00:00.000Z",
      options: [{
        scheduleSlotId: 902,
        technicianProfileId: 17,
        technicianServiceId: 701,
        serviceId: null
      }]
    }];
    const availability = vi.spyOn(bookingApi, "listAvailability").mockResolvedValueOnce({
      list: summaries as never[],
      total: 1,
      page: 1,
      page_size: 100
    });

    await expect(loadAvailabilityStartSummaries({
      from: "2026-09-20T15:00:00.000Z",
      shopId: 16,
      to: "2026-09-21T15:00:00.000Z"
    })).resolves.toEqual(summaries);
    expect(availability).toHaveBeenCalledTimes(1);
    expect(availability).toHaveBeenCalledWith({
      from: "2026-09-20T15:00:00.000Z",
      page: 1,
      pageSize: 100,
      shopId: 16,
      summaryByStart: true,
      to: "2026-09-21T15:00:00.000Z"
    });
  });

  it("loads the server-side daily availability index without downloading every start time", async () => {
    vi.spyOn(bookingApi, "listAvailability").mockResolvedValueOnce({
      list: [
        { startsAt: "2026-09-01T00:00:00.000Z", availableStartCount: 8, availableTechnicianCount: 4 },
        { startsAt: "2026-09-02T00:00:00.000Z", availableStartCount: 2, availableTechnicianCount: 1 }
      ],
      total: 2,
      page: 1,
      page_size: 100
    });

    await expect(loadAvailabilityDateSummaries({
      from: from.toISOString(),
      shopId: 16,
      to: to.toISOString()
    })).resolves.toEqual([
      { availableStartCount: 8, availableTechnicianCount: 4, dateKey: "2026-09-01" },
      { availableStartCount: 2, availableTechnicianCount: 1, dateKey: "2026-09-02" }
    ]);
    expect(bookingApi.listAvailability).toHaveBeenCalledWith({
      from: from.toISOString(),
      page: 1,
      pageSize: 100,
      shopId: 16,
      summaryByDate: true,
      to: to.toISOString()
    });
  });

  it("rejects date-index windows longer than the 35-day calendar page limit", async () => {
    const availability = vi.spyOn(bookingApi, "listAvailability");

    await expect(loadAvailabilityDateSummaries({
      from: "2026-09-01T00:00:00.000Z",
      shopId: 16,
      to: "2026-10-07T00:00:00.000Z"
    })).rejects.toThrow("35 days");
    expect(availability).not.toHaveBeenCalled();
  });

  it("loads every page in a bounded technician window exactly once", async () => {
    const firstHundred = Array.from({ length: 100 }, (_, index) => makeSlot(index + 1));
    const lastSlot = makeSlot(101);
    vi.spyOn(bookingApi, "listAvailability")
      .mockResolvedValueOnce({ list: firstHundred, total: 101, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ list: [lastSlot], total: 101, page: 2, page_size: 100 });

    await expect(loadTechnicianAvailabilityWindow(17, from, to)).resolves.toEqual([
      ...firstHundred,
      lastSlot
    ]);
    expect(bookingApi.listAvailability).toHaveBeenNthCalledWith(1, {
      technicianId: 17,
      from: from.toISOString(),
      to: to.toISOString(),
      page: 1,
      pageSize: 100
    });
    expect(bookingApi.listAvailability).toHaveBeenNthCalledWith(2, {
      technicianId: 17,
      from: from.toISOString(),
      to: to.toISOString(),
      page: 2,
      pageSize: 100
    });
  });

  it("loads every customer order page and preserves API order", async () => {
    const first = { id: 11 } as BookingOrder;
    const second = { id: 12 } as BookingOrder;
    vi.spyOn(bookingApi, "listOrders")
      .mockResolvedValueOnce({ list: [first], total: 2, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ list: [second], total: 2, page: 2, page_size: 100 });

    await expect(loadCustomerOrderWindow(from, to)).resolves.toEqual([first, second]);
    expect(bookingApi.listOrders).toHaveBeenNthCalledWith(2, {
      from: from.toISOString(),
      to: to.toISOString(),
      page: 2,
      pageSize: 100
    });
  });

  it("rejects invalid windows before calling either formal API", async () => {
    const availability = vi.spyOn(bookingApi, "listAvailability");
    const orders = vi.spyOn(bookingApi, "listOrders");
    const tooFar = new Date(from.getTime() + 93 * 24 * 60 * 60 * 1000 + 1);

    await expect(loadTechnicianAvailabilityWindow(17, from, tooFar)).rejects.toThrow(
      "Formal schedule window must be between 1 ms and 93 days."
    );
    await expect(loadCustomerOrderWindow(to, from)).rejects.toThrow(
      "Formal schedule window must be between 1 ms and 93 days."
    );
    expect(availability).not.toHaveBeenCalled();
    expect(orders).not.toHaveBeenCalled();
  });
});
