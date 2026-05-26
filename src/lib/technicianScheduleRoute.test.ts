import { describe, expect, it } from "vitest";
import { resolveTechnicianScheduleRouteId } from "./technicianScheduleRoute";

describe("resolveTechnicianScheduleRouteId", () => {
  it("maps a numeric core-read technician route id to the matching local demo technician id", () => {
    expect(resolveTechnicianScheduleRouteId("1", ["tech-1", "tech-2"])).toBe("tech-1");
  });

  it("keeps an existing local technician id unchanged", () => {
    expect(resolveTechnicianScheduleRouteId("tech-1", ["tech-1", "tech-2"])).toBe("tech-1");
  });
});
