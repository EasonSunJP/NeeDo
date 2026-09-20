import {
  availabilityListQuerySchema,
  availabilityWindowListQuerySchema,
  bookingCreateBodySchema,
  orderListQuerySchema,
  startServiceBodySchema
} from "../src/validators/booking.validator";

describe("startServiceBodySchema", () => {
  it("accepts an owning merchant only with the customer-visible verification code", () => {
    expect(startServiceBodySchema.safeParse({
      actor: "merchant",
      verificationCode: "482931",
      idempotencyKey: "merchant-start-00001"
    }).success).toBe(true);
    expect(startServiceBodySchema.safeParse({
      actor: "merchant",
      idempotencyKey: "merchant-start-00001"
    }).success).toBe(false);
  });
});

describe("availabilityWindowListQuerySchema", () => {
  it("accepts a bounded range and rejects reversed or unbounded calendar reads", () => {
    expect(availabilityWindowListQuerySchema.safeParse({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-30T00:00:00.000Z"
    }).success).toBe(true);
    expect(availabilityWindowListQuerySchema.safeParse({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z"
    }).success).toBe(false);
    expect(availabilityWindowListQuerySchema.safeParse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T00:00:00.000Z"
    }).success).toBe(false);
  });
});

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

  it("allows a shop-scoped availability projection for technician-pricing stores", () => {
    expect(availabilityListQuerySchema.safeParse({
      shopId: "11",
      from: base.from,
      to: base.to
    }).success).toBe(true);
    expect(availabilityListQuerySchema.safeParse({
      from: base.from,
      to: base.to
    }).success).toBe(false);
  });
});

describe("bookingCreateBodySchema", () => {
  it("accepts a negative dynamic availability selector but never zero", () => {
    const input = {
      expectedPriceAmountJpy: 8_800,
      serviceId: 1,
      fulfillmentMode: "store" as const,
      paymentMethod: "onsite" as const
    };
    expect(bookingCreateBodySchema.safeParse({ ...input, scheduleSlotId: -657504 }).success).toBe(true);
    expect(bookingCreateBodySchema.safeParse({ ...input, scheduleSlotId: 0 }).success).toBe(false);
    expect(bookingCreateBodySchema.safeParse({
      ...input,
      scheduleSlotId: -657504,
      fulfillmentMode: "home",
      serviceLocation: { countryCode: "JP", admin1Code: "12", admin2Code: "12100" },
      fulfillmentAddress: {
        countryCode: "JP",
        postalCode: "260-0013",
        prefecture: "千葉県",
        city: "千葉市",
        addressLine1: "中央区中央1-1"
      },
      travelEstimatePublicId: "00000000-0000-4000-8000-000000000001"
    }).success).toBe(false);
  });

  it("keeps store bookings server-authoritative for service location", () => {
    const parsed = bookingCreateBodySchema.parse({
      expectedPriceAmountJpy: 8_800,
      serviceId: 1,
      scheduleSlotId: 2,
      fulfillmentMode: "store",
      paymentMethod: "onsite"
    });

    expect(parsed).not.toHaveProperty("serviceLocation");
    expect(
      bookingCreateBodySchema.safeParse({
        expectedPriceAmountJpy: 8_800,
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
      expectedPriceAmountJpy: 8_800,
      serviceId: 1,
      scheduleSlotId: 2,
      fulfillmentMode: "home",
      paymentMethod: "onsite",
      fulfillmentAddress: { countryCode: "JP", postalCode: "160-0022", prefecture: "東京都", city: "新宿区", addressLine1: "新宿1-1-1" },
      travelEstimatePublicId: "00000000-0000-4000-8000-000000000001",
      serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" }
    });

    expect(
      (parsed as unknown as { serviceLocation: { admin2Code: string } }).serviceLocation.admin2Code
    ).toBe("13104");
    expect(
      bookingCreateBodySchema.safeParse({
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 2,
        fulfillmentMode: "home",
        paymentMethod: "onsite"
      }).success
    ).toBe(false);
    expect(
      bookingCreateBodySchema.safeParse({
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 2,
        fulfillmentMode: "home",
        paymentMethod: "onsite",
        serviceLocation: { countryCode: "JP", admin1Code: "1", admin2Code: "1310" }
      }).success
    ).toBe(false);
  });

  it("requires a non-negative integer price confirmation", () => {
    const base = {
      expectedPriceAmountJpy: 8_800,
      serviceId: 1,
      scheduleSlotId: 2,
      fulfillmentMode: "store"
    };
    expect(bookingCreateBodySchema.parse(base)).toMatchObject({ expectedPriceAmountJpy: 8_800 });
    expect(bookingCreateBodySchema.safeParse({ ...base, expectedPriceAmountJpy: undefined }).success).toBe(false);
    expect(bookingCreateBodySchema.safeParse({ ...base, expectedPriceAmountJpy: 8_800.5 }).success).toBe(false);
  });

  it("accepts an ordered store-only technician-service bundle and rejects mismatched selectors", () => {
    const bundle = {
      expectedPriceAmountJpy: 15_400,
      technicianServiceId: 101,
      technicianServiceIds: [101, 102],
      scheduleSlotId: 201,
      scheduleSlotIds: [201, 202],
      fulfillmentMode: "store" as const
    };

    expect(bookingCreateBodySchema.parse(bundle)).toMatchObject(bundle);
    expect(bookingCreateBodySchema.safeParse({
      ...bundle,
      technicianServiceIds: [102, 101]
    }).success).toBe(false);
    expect(bookingCreateBodySchema.safeParse({
      ...bundle,
      scheduleSlotIds: [201]
    }).success).toBe(false);
    expect(bookingCreateBodySchema.safeParse({
      ...bundle,
      fulfillmentMode: "home"
    }).success).toBe(false);
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
