import {
  availabilityListQuerySchema,
  orderListQuerySchema
} from "../src/validators/booking.validator";

describe("availabilityListQuerySchema", () => {
  const base = {
    serviceId: "12",
    from: "2026-09-02T15:00:00.000Z",
    to: "2026-09-03T15:00:00.000Z"
  };

  it("parses the opt-in unavailable-slot flag without changing the omitted default", () => {
    expect(availabilityListQuerySchema.parse(base)).not.toHaveProperty("includeUnavailable");
    expect(
      availabilityListQuerySchema.parse({ ...base, includeUnavailable: "true" }).includeUnavailable
    ).toBe(true);
    expect(
      availabilityListQuerySchema.parse({ ...base, includeUnavailable: "false" }).includeUnavailable
    ).toBe(false);
  });

  it("rejects ambiguous unavailable-slot query values", () => {
    expect(
      availabilityListQuerySchema.safeParse({ ...base, includeUnavailable: "1" }).success
    ).toBe(false);
    expect(
      availabilityListQuerySchema.safeParse({ ...base, includeUnavailable: "yes" }).success
    ).toBe(false);
  });
});

describe("orderListQuerySchema", () => {
  it("validates an explicit overlapping order window", () => {
    const window = { from: "2026-09-06T15:00:00.000Z", to: "2026-09-07T15:00:00.000Z" };
    expect(orderListQuerySchema.parse({ ...window, dateMode: "overlaps" })).toMatchObject({ dateMode: "overlaps" });
    expect(orderListQuerySchema.safeParse({ ...window, dateMode: "invalid" }).success).toBe(false);
    expect(orderListQuerySchema.safeParse({ dateMode: "overlaps" }).success).toBe(false);
  });

  it("accepts no date window or one complete date window up to 93 days", () => {
    expect(orderListQuerySchema.safeParse({ page: "1", pageSize: "20" }).success).toBe(true);

    const parsed = orderListQuerySchema.parse({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-12-03T00:00:00.000Z"
    });

    expect(parsed.from).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    expect(parsed.to).toEqual(new Date("2026-12-03T00:00:00.000Z"));
  });

  it("rejects partial, reversed, and longer-than-93-day date windows", () => {
    expect(
      orderListQuerySchema.safeParse({
        from: "2026-09-01T00:00:00.000Z"
      }).success
    ).toBe(false);
    expect(
      orderListQuerySchema.safeParse({
        from: "2026-09-02T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z"
      }).success
    ).toBe(false);
    expect(
      orderListQuerySchema.safeParse({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-12-03T00:00:00.001Z"
      }).success
    ).toBe(false);
  });
});
