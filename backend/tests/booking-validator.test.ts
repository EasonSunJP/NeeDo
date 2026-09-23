import {
  availabilityListQuerySchema,
  availabilityWindowListQuerySchema,
  bookingCreateBodySchema,
  bookingGroupCreateBodySchema,
  merchantOrderEditBodySchema,
  manualPaymentConfirmBodySchema,
  orderListQuerySchema,
  startServiceBodySchema
} from "../src/validators/booking.validator";
import * as bookingValidators from "../src/validators/booking.validator";

describe("bookingGroupCreateBodySchema", () => {
  const assignment = {
    technicianProfileId: 11,
    technicianServiceIds: [101, 102],
    scheduleSlotIds: [-201, -202],
    expectedPriceAmountJpy: 12_000
  };
  const base = {
    shopId: 5,
    startsAt: "2026-10-02T01:00:00.000Z",
    guests: [
      { label: "客人 1", assignments: [assignment] },
      { label: "客人 2", assignments: [{ ...assignment, technicianProfileId: 12, technicianServiceIds: [103], scheduleSlotIds: [-203] }] }
    ],
    paymentMethod: "onsite"
  };

  it("accepts a multi-guest booking with distinct technician and slot selectors", () => {
    expect(bookingGroupCreateBodySchema.parse(base)).toMatchObject(base);
  });

  it("does not offer bank transfer for a new group booking", () => {
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, paymentMethod: "bank_transfer" }).success).toBe(false);
  });

  it("rejects guest counts outside one to ten and empty assignments", () => {
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: [] }).success).toBe(false);
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: Array.from({ length: 11 }, (_, index) => ({ label: `客人 ${index}`, assignments: [{ ...assignment, technicianProfileId: index + 1, scheduleSlotIds: [index * 2 + 1, index * 2 + 2] }] })) }).success).toBe(false);
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: [{ label: "客人 1", assignments: [] }] }).success).toBe(false);
  });

  it("rejects duplicate technician and slot selectors across guests", () => {
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: [...base.guests, { label: "客人 3", assignments: [assignment] }] }).success).toBe(false);
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: [...base.guests, { label: "客人 3", assignments: [{ ...assignment, technicianProfileId: 13 }] }] }).success).toBe(false);
  });

  it("requires one catalog type and a slot for each selected service", () => {
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: [{ label: "客人 1", assignments: [{ ...assignment, serviceIds: [1, 2] }] }] }).success).toBe(false);
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: [{ label: "客人 1", assignments: [{ ...assignment, scheduleSlotIds: [-201] }] }] }).success).toBe(false);
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: [{ label: "客人 1", assignments: [{ ...assignment, technicianServiceIds: [101, 101] }] }] }).success).toBe(false);
  });

  it("rejects blank guest labels and invalid expected prices", () => {
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: [{ label: " ", assignments: [assignment] }] }).success).toBe(false);
    expect(bookingGroupCreateBodySchema.safeParse({ ...base, guests: [{ label: "客人 1", assignments: [{ ...assignment, expectedPriceAmountJpy: -1 }] }] }).success).toBe(false);
  });
});

describe("group mutation validators", () => {
  it("requires a version and one valid replacement assignment", () => {
    const schema = (bookingValidators as unknown as { bookingGroupRevisionBodySchema: {
      safeParse: (value: unknown) => { success: boolean }
    } }).bookingGroupRevisionBodySchema;
    const body = { expectedUpdatedAt: "2026-10-01T00:00:00.000Z", assignment: {
      technicianProfileId: 1, serviceIds: [2], scheduleSlotIds: [3], expectedPriceAmountJpy: 1000
    } };
    expect(schema.safeParse(body).success).toBe(true);
    expect(schema.safeParse({ ...body, expectedUpdatedAt: "today" }).success).toBe(false);
    expect(schema.safeParse({ ...body, assignment: { ...body.assignment, scheduleSlotIds: [] } }).success).toBe(false);
  });

  it("requires distinct versioned order ids for guest removal", () => {
    const schema = (bookingValidators as unknown as { bookingGroupGuestRemovalBodySchema: {
      safeParse: (value: unknown) => { success: boolean }
    } }).bookingGroupGuestRemovalBodySchema;
    const order = { id: 1, updatedAt: "2026-10-01T00:00:00.000Z" };
    expect(schema.safeParse({ expectedOrders: [order] }).success).toBe(true);
    expect(schema.safeParse({ expectedOrders: [order, order] }).success).toBe(false);
    expect(schema.safeParse({ expectedOrders: [] }).success).toBe(false);
  });
});

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

  it("parses the opt-in daily availability summary flag strictly", () => {
    expect(availabilityListQuerySchema.parse(base)).not.toHaveProperty("summaryByDate");
    expect(availabilityListQuerySchema.parse({ ...base, summaryByDate: "true" }).summaryByDate).toBe(true);
    expect(availabilityListQuerySchema.parse({ ...base, summaryByDate: "false" }).summaryByDate).toBe(false);
    expect(availabilityListQuerySchema.safeParse({ ...base, summaryByDate: "1" }).success).toBe(false);
  });

  it("limits daily calendar summaries to one 35-day page", () => {
    expect(availabilityListQuerySchema.safeParse({
      ...base,
      summaryByDate: "true",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-06T00:00:00.000Z"
    }).success).toBe(true);
    expect(availabilityListQuerySchema.safeParse({
      ...base,
      summaryByDate: "true",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-06T00:00:00.001Z"
    }).success).toBe(false);
  });

  it("parses start summaries strictly and rejects combining both summary projections", () => {
    expect(availabilityListQuerySchema.parse(base)).not.toHaveProperty("summaryByStart");
    expect(availabilityListQuerySchema.parse({ ...base, summaryByStart: "true" }).summaryByStart).toBe(true);
    expect(availabilityListQuerySchema.safeParse({ ...base, summaryByStart: "1" }).success).toBe(false);
    expect(availabilityListQuerySchema.safeParse({
      ...base,
      summaryByDate: "true",
      summaryByStart: "true"
    }).success).toBe(false);
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
  it("rejects bank transfer on new bookings and payment changes", () => {
    expect(bookingCreateBodySchema.safeParse({
      expectedPriceAmountJpy: 8_800,
      serviceId: 1,
      scheduleSlotId: 2,
      fulfillmentMode: "store",
      paymentMethod: "bank_transfer"
    }).success).toBe(false);
    expect(merchantOrderEditBodySchema.safeParse({ paymentMethod: "bank_transfer" }).success).toBe(false);
    expect(manualPaymentConfirmBodySchema.safeParse({ method: "bank_transfer", amountJpy: 8_800 }).success).toBe(false);
  });
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
    }).success).toBe(true);
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

  it("accepts non-zero dynamic selectors for every service in a technician-service bundle", () => {
    const dynamicBundle = {
      expectedPriceAmountJpy: 12_100,
      technicianServiceId: 301,
      technicianServiceIds: [301, 307],
      scheduleSlotId: -64_320_701_317,
      scheduleSlotIds: [-64_320_701_317, -64_320_701_377],
      nominatedTechnicianProfileId: 133,
      fulfillmentMode: "store" as const
    };

    expect(bookingCreateBodySchema.safeParse(dynamicBundle).success).toBe(true);
    expect(bookingCreateBodySchema.safeParse({
      ...dynamicBundle,
      scheduleSlotIds: [-64_320_701_317, 0]
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
