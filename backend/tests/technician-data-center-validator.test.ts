import { technicianDataCenterQuerySchema } from "../src/validators/technician-data-center.validator";

describe("technician data center query", () => {
  it("defaults to seven days and accepts every supported period", () => {
    expect(technicianDataCenterQuerySchema.parse({})).toEqual({ period: "last7days" });
    for (const period of ["last7days", "last30days", "week", "month", "year"]) {
      expect(technicianDataCenterQuerySchema.parse({ period })).toEqual({ period });
    }
  });

  it("rejects unsupported period aliases", () => {
    expect(() => technicianDataCenterQuerySchema.parse({ period: "30d" })).toThrow();
  });
});
