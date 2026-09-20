import { describe, expect, it } from "vitest";
import {
  buildTechnicianServiceCheckoutRoute,
  parseTechnicianServiceBundleIds,
  parseCheckoutServiceRoute
} from "./checkoutServiceRoute";

describe("parseCheckoutServiceRoute", () => {
  it("accepts a formal shop service id", () => {
    expect(parseCheckoutServiceRoute("42", new URLSearchParams())).toEqual({
      kind: "shop",
      serviceId: 42
    });
  });

  it("accepts a technician service only with its shop and technician scope", () => {
    expect(parseCheckoutServiceRoute(
      "technician-service-77",
      new URLSearchParams("shop=4&technician=9")
    )).toEqual({
      kind: "technician",
      serviceId: 77,
      shopId: 4,
      technicianId: 9
    });
  });

  it("rejects an unscoped or malformed technician service route", () => {
    expect(parseCheckoutServiceRoute("technician-service-77", new URLSearchParams())).toBeNull();
    expect(parseCheckoutServiceRoute("technician-service-nope", new URLSearchParams("shop=4&technician=9"))).toBeNull();
  });

  it("builds the canonical technician-service checkout route with the selected schedule", () => {
    expect(buildTechnicianServiceCheckoutRoute(202, {
      date: "2026-09-28",
      people: "1名",
      scheduleSlotId: 49020,
      time: "11:30"
    })).toBe(
      "/checkout/technician-service/202?mode=store&date=2026-09-28&people=1%E5%90%8D&time=11%3A30&scheduleSlotId=49020"
    );
  });

  it("does not copy an invalid slot id into a technician-service checkout route", () => {
    expect(buildTechnicianServiceCheckoutRoute(202, {
      date: "2026-09-28",
      scheduleSlotId: "expired-slot",
      time: "11:30"
    })).toBe(
      "/checkout/technician-service/202?mode=store&date=2026-09-28&time=11%3A30"
    );
  });

  it("keeps a dynamic availability selector in the checkout route", () => {
    expect(buildTechnicianServiceCheckoutRoute(202, {
      scheduleSlotId: -657504,
      time: "17:05"
    })).toBe(
      "/checkout/technician-service/202?mode=store&time=17%3A05&scheduleSlotId=-657504"
    );
  });

  it("keeps the ordered technician-service bundle in the checkout route", () => {
    expect(buildTechnicianServiceCheckoutRoute(202, {
      serviceIds: [202, 204, 203]
    })).toBe(
      "/checkout/technician-service/202?mode=store&serviceIds=202%2C204%2C203"
    );
  });

  it("parses only an ordered unique bundle anchored to the primary service", () => {
    expect(parseTechnicianServiceBundleIds(202, "202,204,203")).toEqual([202, 204, 203]);
    expect(parseTechnicianServiceBundleIds(202, "204,202")).toEqual([202]);
    expect(parseTechnicianServiceBundleIds(202, "202,202")).toEqual([202]);
  });
});
