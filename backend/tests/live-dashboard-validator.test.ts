import { liveDashboardQuerySchema } from "../src/validators/live-dashboard.validator";

describe("liveDashboardQuerySchema", () => {
  it("defaults a Japan-wide request to today's period", () => {
    expect(liveDashboardQuerySchema.parse({ country: "JP" })).toEqual({
      country: "JP",
      period: "today"
    });
  });

  it("rejects an admin2 code without an admin1 code", () => {
    expect(liveDashboardQuerySchema.safeParse({ country: "JP", admin2: "13104" }).success).toBe(
      false
    );
  });

  it("rejects unsupported countries, malformed codes, and unknown fields", () => {
    expect(liveDashboardQuerySchema.safeParse({ country: "US" }).success).toBe(false);
    expect(liveDashboardQuerySchema.safeParse({ country: "JP", admin1: "1" }).success).toBe(false);
    expect(liveDashboardQuerySchema.safeParse({ country: "JP", extra: "unsafe" }).success).toBe(
      false
    );
  });
});
