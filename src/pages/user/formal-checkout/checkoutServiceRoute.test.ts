import { describe, expect, it } from "vitest";
import { parseCheckoutServiceRoute } from "./checkoutServiceRoute";

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
});
