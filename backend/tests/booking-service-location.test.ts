import { BookingRepository } from "../src/repositories/booking.repository";
import { BookingService } from "../src/services/booking.service";
import { hashRouteAddress, shopAddressToJapaneseRouteAddress } from "../src/services/route-estimate.service";

const fulfillmentAddress = { countryCode: "JP" as const, postalCode: "160-0022", prefecture: "東京都", city: "新宿区", addressLine1: "新宿1-1-1" };
const travelEstimatePublicId = "00000000-0000-4000-8000-000000000001";

const decimal = (value: string) => ({
  toFixed: () => value,
  toString: () => value
});

const createRepositoryHarness = (options?: {
  missingShopLocation?: boolean;
  invalidHierarchy?: boolean;
  softDeletedAdmin2?: boolean;
  missingJaOfficialName?: boolean;
  infrastructureError?: Error;
  otherValidRegion?: boolean;
}) => {
  const now = new Date("2026-09-06T01:00:00.000Z");
  const shopServiceLocation = options?.missingShopLocation
    ? null
    : {
        countryCode: "JP",
        admin1RegionId: 1300,
        admin2RegionId: 13104,
        datasetVersion: "N03-20260101",
        admin1Region: { officialCode: "13" },
        admin2Region: { officialCode: "13104" },
        deletedAt: null
      };
  const shop = {
    id: 7,
    name: "新宿ケア",
    ownerUserId: 71,
    pricingMode: "MERCHANT",
    city: "新宿区",
    address: "新宿1-1-1",
    serviceLocation: shopServiceLocation
  };
  const service = {
    id: 12,
    publicId: "svc-booking-location",
    categoryId: 3,
    name: "訪問ケア",
    description: null,
    priceAmount: decimal("8800.00"),
    currency: "JPY",
    durationMinutes: 60,
    createdAt: now
  };
  const slot = {
    id: 33,
    serviceId: 12,
    technicianServiceId: null,
    shopId: 7,
    technicianProfileId: null,
    startsAt: new Date("2026-09-07T01:00:00.000Z"),
    endsAt: new Date("2026-09-07T02:00:00.000Z"),
    capacity: 1,
    bookedCount: 0,
    status: "AVAILABLE",
    service,
    technicianService: null,
    shop,
    technicianProfile: null
  };
  const state = {
    bookings: [] as Array<Record<string, unknown>>,
    locations: [] as Array<Record<string, unknown>>,
    bookedCount: 0,
    transactionCount: 0
  };

  const tx = {
    routeEstimate: { findUnique: jest.fn(async () => ({
      id: 1, customerUserId: 5, shopId: 7, serviceId: 12, scheduleSlotId: 33,
      policyVersionId: 1, expiresAt: new Date(Date.now() + 60_000),
      policyVersion: { publicId: "00000000-0000-4000-8000-000000000002" },
      matchedBandId: 1, matchedBand: { maximumDistanceMeters: 10000 },
      providerCode: "test-contract", providerRequestId: null, distanceMeters: 1000, durationSeconds: 300, fareAmountJpy: 0,
      originAddressHash: hashRouteAddress(shopAddressToJapaneseRouteAddress(shop)),
      destinationAddressHash: hashRouteAddress(fulfillmentAddress)
    })), updateMany: jest.fn(async () => ({ count: 1 })) },
    bookingTravelFareSnapshot: { create: jest.fn(async () => ({ id: 1 })) },
    shopTravelFarePolicyVersion: { findFirst: jest.fn(async () => ({ id: 1 })) },
    $queryRaw: jest.fn(async () => {
      const call = tx.$queryRaw.mock.calls.length;
      if (call === 1) return [{ id: 5 }];
      if (options?.infrastructureError) throw options.infrastructureError;
      if (options?.otherValidRegion) return [
        { id: 2700, official_code: "27", level: "ADMIN1", parent_id: null, deleted_at: null },
        { id: 27128, official_code: "27128", level: "ADMIN2", parent_id: 2700, deleted_at: null }
      ];
      return [
        { id: 1300, official_code: "13", level: "ADMIN1", parent_id: null, deleted_at: null },
        {
          id: 13104,
          official_code: "13104",
          level: "ADMIN2",
          parent_id: options?.invalidHierarchy ? 2700 : 1300,
          deleted_at: options?.softDeletedAdmin2 ? now : null
        }
      ];
    }),
    administrativeRegionLocale: {
      findMany: jest.fn(async () =>
        options?.otherValidRegion
          ? [{ regionId: 2700, name: "大阪府" }, { regionId: 27128, name: "大阪市中央区" }]
          :
        options?.missingJaOfficialName
          ? [{ regionId: 1300, name: "東京都" }]
          : [
              { regionId: 1300, name: "東京都" },
              { regionId: 13104, name: "新宿区" }
            ]
      )
    },
    customerProfile: { findFirst: jest.fn(async () => ({ membershipLevel: "regular" })) },
    technicianCompensationProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    shopFinanceRuleSet: { findFirst: jest.fn().mockResolvedValue(null) },
    scheduleSlot: {
      findFirst: jest.fn(async () => ({ ...slot, bookedCount: state.bookedCount })),
      updateMany: jest.fn(async () => {
        state.bookedCount += 1;
        return { count: 1 };
      })
    },
    bookingOrder: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const booking = {
          ...data,
          id: 91,
          orderType: "BOOKING",
          status: "PENDING",
          fulfillmentMode: data.fulfillmentMode,
          paymentMethod: "ONSITE",
          paymentStatus: "PENDING",
          paymentAmountJpy: 8800,
          paymentConfirmedById: null,
          paymentConfirmedAt: null,
          paymentReference: null,
          paymentNote: null,
          paymentRefundedById: null,
          paymentRefundedAt: null,
          paymentRefundReference: null,
          paymentRefundReason: null,
          cancelReason: null,
          createdAt: now,
          updatedAt: now,
          service,
          technicianService: null,
          shop,
          technicianProfile: null,
          serviceSession: null,
          statusHistory: [
            {
              id: 1,
              bookingOrderId: 91,
              fromStatus: null,
              toStatus: "PENDING",
              actorUserId: 5,
              reason: null,
              createdAt: now
            }
          ],
          performanceAssessment: null,
          performanceRevisions: [],
          affiliateAttributions: []
        };
        state.bookings.push(booking);
        return booking;
      })
    },
    bookingServiceLocation: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.locations.push({ ...data });
        return data;
      })
    },
    exchangeMatchParticipant: { findFirst: jest.fn(async () => null) },
    shop: { update: jest.fn(async () => shop) }
  };
  const client = {
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      state.transactionCount += 1;
      const snapshot = {
        bookings: [...state.bookings],
        locations: [...state.locations],
        bookedCount: state.bookedCount
      };
      try {
        return await callback(tx);
      } catch (error) {
        state.bookings = snapshot.bookings;
        state.locations = snapshot.locations;
        state.bookedCount = snapshot.bookedCount;
        throw error;
      }
    })
  };

  return { repository: new BookingRepository(client as never), shopServiceLocation, state, tx };
};

describe("booking service-location snapshots", () => {
  it("persists matching official Japanese names with the accepted normalized address", async () => {
    const harness = createRepositoryHarness();
    const result = await harness.repository.createBooking({
      customerUserId: 5, serviceId: 12, scheduleSlotId: 33, fulfillmentMode: "home",
      fulfillmentAddress: { ...fulfillmentAddress, prefecture: " 東京都 ", city: " 新宿区 " }, travelEstimatePublicId,
      serviceLocation: { source: "CUSTOMER_SERVICE_LOCATION", countryCode: "JP", admin1Code: "13", admin2Code: "13104" }
    });
    expect(result).toHaveProperty("order.id", 91);
    expect(harness.state.locations[0]).toMatchObject({ admin1Name: "東京都", admin2Name: "新宿区", resolutionStatus: "VERIFIED" });
    expect(harness.tx.routeEstimate.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects a valid but unrelated region before reserving capacity or consuming the accepted address estimate", async () => {
    const harness = createRepositoryHarness({ otherValidRegion: true });
    await expect(harness.repository.createBooking({
      customerUserId: 5, serviceId: 12, scheduleSlotId: 33, fulfillmentMode: "home",
      fulfillmentAddress, travelEstimatePublicId,
      serviceLocation: { source: "CUSTOMER_SERVICE_LOCATION", countryCode: "JP", admin1Code: "27", admin2Code: "27128" }
    })).rejects.toMatchObject({ statusCode: 400, message: "error.administrative_region.address_mismatch" });
    expect(harness.state.bookings).toEqual([]);
    expect(harness.state.locations).toEqual([]);
    expect(harness.state.bookedCount).toBe(0);
    expect(harness.tx.scheduleSlot.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.routeEstimate.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.bookingTravelFareSnapshot.create).not.toHaveBeenCalled();
  });

  it("maps the discriminated API input to repository-owned location sources", async () => {
    const repository = {
      findScheduleSlotShopId: jest.fn(async () => 7),
      createBooking: jest.fn(async () => ({ id: 91 }))
    };
    const service = new BookingService(repository as never);
    const actor = { userId: 5, roles: ["customer"], currentIdentityType: "customer" };
    const createBooking = service.createBooking.bind(service) as unknown as (
      actorInput: typeof actor,
      input: Record<string, unknown>
    ) => Promise<unknown>;

    await createBooking(actor, {
      serviceId: 12,
      scheduleSlotId: 33,
      fulfillmentMode: "store"
    });
    await createBooking(actor, {
      serviceId: 12,
      scheduleSlotId: 34,
      fulfillmentMode: "home",
      fulfillmentAddress,
      travelEstimatePublicId,
      serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" }
    });

    expect(repository.createBooking).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ serviceLocation: { source: "SHOP_LOCATION" } })
    );
    expect(repository.createBooking).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        serviceLocation: {
          source: "CUSTOMER_SERVICE_LOCATION",
          countryCode: "JP",
          admin1Code: "13",
          admin2Code: "13104"
        }
      })
    );
  });

  it("creates the booking and copied official location snapshot in one transaction", async () => {
    const harness = createRepositoryHarness();

    await harness.repository.createBooking({
      customerUserId: 5,
      serviceId: 12,
      scheduleSlotId: 33,
      fulfillmentMode: "store",
      serviceLocation: { source: "SHOP_LOCATION" }
    } as never);

    expect(harness.state.transactionCount).toBe(1);
    expect(harness.state.bookings).toHaveLength(1);
    expect(harness.state.locations).toEqual([
      expect.objectContaining({
        bookingOrderId: 91,
        countryCode: "JP",
        admin1RegionCode: "13",
        admin1Name: "東京都",
        admin2RegionCode: "13104",
        admin2Name: "新宿区",
        source: "SHOP_LOCATION",
        resolutionStatus: "VERIFIED",
        datasetVersion: "N03-20260101"
      })
    ]);
  });

  it("rolls back booking, slot capacity, and location when the supplied hierarchy is invalid", async () => {
    const harness = createRepositoryHarness({ invalidHierarchy: true });

    await expect(
      harness.repository.createBooking({
        customerUserId: 5,
        serviceId: 12,
        scheduleSlotId: 33,
        fulfillmentMode: "home",
        fulfillmentAddress,
        travelEstimatePublicId,
        serviceLocation: {
          source: "CUSTOMER_SERVICE_LOCATION",
          countryCode: "JP",
          admin1Code: "13",
          admin2Code: "13104"
        }
      } as never)
    ).rejects.toMatchObject({
      message: "error.administrative_region.invalid_hierarchy",
      statusCode: 400
    });

    expect(harness.state.bookings).toHaveLength(0);
    expect(harness.state.locations).toHaveLength(0);
    expect(harness.state.bookedCount).toBe(0);
  });

  it("fails store bookings when the shop has no verified service location", async () => {
    const harness = createRepositoryHarness({ missingShopLocation: true });

    await expect(
      harness.repository.createBooking({
        customerUserId: 5,
        serviceId: 12,
        scheduleSlotId: 33,
        fulfillmentMode: "store",
        serviceLocation: { source: "SHOP_LOCATION" }
      } as never)
    ).rejects.toMatchObject({
      message: "error.booking.service_location_unresolved",
      statusCode: 409
    });
  });

  it.each([
    ["soft-deleted linked region", { softDeletedAdmin2: true }],
    ["broken linked hierarchy", { invalidHierarchy: true }]
  ])("maps a store-owned %s to the stable booking conflict", async (_label, options) => {
    const harness = createRepositoryHarness(options);

    await expect(
      harness.repository.createBooking({
        customerUserId: 5,
        serviceId: 12,
        scheduleSlotId: 33,
        fulfillmentMode: "store",
        serviceLocation: { source: "SHOP_LOCATION" }
      } as never)
    ).rejects.toMatchObject({
      message: "error.booking.service_location_unresolved",
      statusCode: 409
    });
    expect(harness.state.bookings).toHaveLength(0);
    expect(harness.state.locations).toHaveLength(0);
    expect(harness.state.bookedCount).toBe(0);
  });

  it("maps a missing store-owned Japanese official name to the stable booking conflict", async () => {
    const harness = createRepositoryHarness({ missingJaOfficialName: true });

    await expect(
      harness.repository.createBooking({
        customerUserId: 5,
        serviceId: 12,
        scheduleSlotId: 33,
        fulfillmentMode: "store",
        serviceLocation: { source: "SHOP_LOCATION" }
      } as never)
    ).rejects.toMatchObject({
      message: "error.booking.service_location_unresolved",
      statusCode: 409
    });
    expect(harness.state.bookings).toHaveLength(0);
    expect(harness.state.locations).toHaveLength(0);
    expect(harness.state.bookedCount).toBe(0);
  });

  it("propagates unexpected store location infrastructure failures", async () => {
    const infrastructureError = new Error("administrative region database unavailable");
    const harness = createRepositoryHarness({ infrastructureError });

    await expect(
      harness.repository.createBooking({
        customerUserId: 5,
        serviceId: 12,
        scheduleSlotId: 33,
        fulfillmentMode: "store",
        serviceLocation: { source: "SHOP_LOCATION" }
      } as never)
    ).rejects.toBe(infrastructureError);
    expect(harness.state.locations).toHaveLength(0);
  });

  it("keeps the booking snapshot immutable after the shop assignment changes", async () => {
    const harness = createRepositoryHarness();

    await harness.repository.createBooking({
      customerUserId: 5,
      serviceId: 12,
      scheduleSlotId: 33,
      fulfillmentMode: "store",
      serviceLocation: { source: "SHOP_LOCATION" }
    } as never);
    harness.shopServiceLocation!.admin1Region.officialCode = "27";
    harness.shopServiceLocation!.admin2Region.officialCode = "27128";

    expect(harness.state.locations[0]).toMatchObject({
      admin1RegionCode: "13",
      admin2RegionCode: "13104",
      admin1Name: "東京都",
      admin2Name: "新宿区"
    });
    expect("updateBookingServiceLocation" in harness.repository).toBe(false);
    expect("deleteBookingServiceLocation" in harness.repository).toBe(false);
  });
});
