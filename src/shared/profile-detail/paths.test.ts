import { describe, expect, it } from "vitest";
import { getScopedTechnicianServiceListPath } from "./paths";

describe("getScopedTechnicianServiceListPath", () => {
  it("preserves the store booking selection when opening a technician service list", () => {
    expect(getScopedTechnicianServiceListPath("user", "11", "23", {
      date: "2026-09-28",
      people: "1名",
      time: "11:30"
    })).toBe(
      "/stores/11/technicians/23/services?date=2026-09-28&people=1%E5%90%8D&time=11%3A30"
    );
  });

  it("keeps the same selection in a scoped portal route", () => {
    expect(getScopedTechnicianServiceListPath("merchant", "shop/11", "tech/23", {
      date: "2026-09-28",
      time: "11:30"
    })).toBe(
      "/merchant/stores/shop%2F11/technicians/tech%2F23/services?date=2026-09-28&time=11%3A30"
    );
  });
});
