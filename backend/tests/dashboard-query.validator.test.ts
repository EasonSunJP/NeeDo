import {
  backofficeDashboardQuerySchema,
  merchantDashboardQuerySchema
} from "../src/validators/backoffice.validator";

describe("dashboard query validation", () => {
  it("defaults the backoffice period", () => {
    expect(backofficeDashboardQuerySchema.parse({})).toEqual({ period: "last7days" });
  });

  it("accepts a city-scoped inclusive custom period", () => {
    expect(
      backofficeDashboardQuerySchema.parse({
        period: "custom",
        from: "2024-02-29",
        to: "2025-02-28",
        city: " Tokyo "
      })
    ).toEqual({ period: "custom", from: "2024-02-29", to: "2025-02-28", city: "Tokyo" });
  });

  it.each([
    { shopId: "1" },
    { unexpected: "value" },
    { period: "custom", from: "2026-02-30", to: "2026-03-01" },
    { period: "custom", from: "2026-03-02", to: "2026-03-01" },
    { period: "custom", from: "2025-01-01", to: "2026-01-02" },
    { period: "month", from: "2026-08-01" },
    { period: "custom", from: "2026-08-01" },
    { period: "custom", to: "2026-08-31" }
  ])("rejects invalid backoffice dashboard query %#", (value) => {
    expect(backofficeDashboardQuerySchema.safeParse(value).success).toBe(false);
  });

  it.each([{ city: "Tokyo" }, { shopId: "1" }, { unexpected: "value" }])(
    "rejects non-merchant fields in merchant dashboard queries %#",
    (value) => {
      expect(merchantDashboardQuerySchema.safeParse(value).success).toBe(false);
    }
  );
});
