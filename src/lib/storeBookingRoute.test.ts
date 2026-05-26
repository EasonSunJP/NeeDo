import { describe, expect, it } from "vitest";
import { buildStoreBookingRoute, buildStoreCheckoutRoute } from "./storeBookingRoute";

describe("storeBookingRoute", () => {
  it("builds a store booking page route with technician and schedule defaults", () => {
    expect(
      buildStoreBookingRoute({
        date: "2026-05-26",
        storeId: "store-1",
        technicianId: "tech-1",
        time: "08:00"
      })
    ).toBe("/stores/store-1?technician=tech-1&date=2026-05-26&time=08%3A00");
  });

  it("builds checkout routes in store mode while preserving the selected technician", () => {
    expect(
      buildStoreCheckoutRoute("svc-1", {
        date: "2026-05-26",
        people: "1名",
        storeId: "store-1",
        technicianId: "tech-1",
        time: "08:00"
      })
    ).toBe("/checkout/svc-1?mode=store&store=store-1&technician=tech-1&date=2026-05-26&people=1%E5%90%8D&time=08%3A00");
  });
});
