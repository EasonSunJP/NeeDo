import {
  availabilityListQuerySchema,
  bookingCreateBodySchema,
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

describe("bookingCreateBodySchema", () => {
  it("keeps store bookings server-authoritative for service location", () => {
    const parsed = bookingCreateBodySchema.parse({
      serviceId: 1,
      scheduleSlotId: 2,
      fulfillmentMode: "store",
      paymentMethod: "onsite"
    });

    expect(parsed).not.toHaveProperty("serviceLocation");
    expect(
      bookingCreateBodySchema.safeParse({
        serviceId: 1,
        scheduleSlotId: 2,
        fulfillmentMode: "store",
        paymentMethod: "onsite",
        serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" }
      }).success
    ).toBe(false);
  });

  it("requires a verified Japanese administrative pair for home bookings", () => {
    const parsed = bookingCreateBodySchema.parse({
      serviceId: 1,
      scheduleSlotId: 2,
      fulfillmentMode: "home",
      paymentMethod: "onsite",
      fulfillmentAddress: { postalCode: "160-0022", prefecture: "東京都", city: "新宿区", addressLine1: "新宿1-1-1" },
      travelEstimatePublicId: "00000000-0000-4000-8000-000000000001",
      serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" }
    });

    expect(
      (parsed as unknown as { serviceLocation: { admin2Code: string } }).serviceLocation.admin2Code
    ).toBe("13104");
    expect(
      bookingCreateBodySchema.safeParse({
        serviceId: 1,
        scheduleSlotId: 2,
        fulfillmentMode: "home",
        paymentMethod: "onsite"
      }).success
    ).toBe(false);
    expect(
      bookingCreateBodySchema.safeParse({
        serviceId: 1,
        scheduleSlotId: 2,
        fulfillmentMode: "home",
        paymentMethod: "onsite",
        serviceLocation: { countryCode: "JP", admin1Code: "1", admin2Code: "1310" }
      }).success
    ).toBe(false);
  });
});

describe("orderListQuerySchema", () => {
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
