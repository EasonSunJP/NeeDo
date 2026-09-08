import { BookingRepository } from "../src/repositories/booking.repository";

const now = new Date("2026-09-06T00:00:00.000Z");
const startsAt = new Date("2026-09-06T03:00:00.000Z");
const endsAt = new Date("2026-09-06T04:00:00.000Z");

const service = {
  id: 41,
  publicId: "service-public-41",
  categoryId: 4,
  shopId: 11,
  technicianProfileId: null,
  name: "Current catalog name",
  description: "Formal service",
  city: "Tokyo",
  serviceMode: "store",
  priceAmount: 12_000,
  currency: "JPY",
  durationMinutes: 60,
  status: "published",
  isRecommended: false,
  sortOrder: 0,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: now,
  deletedAt: null,
  category: { isActive: true, deletedAt: null },
  shop: {
    id: 11,
    ownerUserId: 21,
    name: "Formal shop",
    pricingMode: "MERCHANT",
    status: "published",
    deletedAt: null,
    serviceLocation: {
      countryCode: "JP",
      admin1RegionId: 1300,
      admin2RegionId: 13104,
      datasetVersion: "N03-20260101",
      admin1Region: { officialCode: "13" },
      admin2Region: { officialCode: "13104" },
      deletedAt: null
    },
    publicIdentifier: { kind: "SHOP", status: "ACTIVE", deletedAt: null },
    entitySuspensions: []
  }
};

const intelligence = {
  id: 71,
  postId: 61,
  serviceId: 41,
  technicianServiceId: null,
  serviceNameSnapshot: "Published campaign name",
  serviceDurationSnapshot: 60,
  serviceMode: "STORE",
  addressLabel: "Tokyo",
  serviceAreas: ["Tokyo"],
  originalPriceJpy: 10_000,
  campaignPriceJpy: 8_800,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  post: {
    id: 61,
    type: "INTELLIGENCE",
    status: "PUBLISHED",
    serviceStartAt: new Date("2026-09-06T02:00:00.000Z"),
    serviceEndAt: new Date("2026-09-06T05:00:00.000Z"),
    expiresAt: new Date("2026-09-07T00:00:00.000Z"),
    deletedAt: null,
    ownerIdentity: {
      type: "merchant_owner",
      scopeType: "shop",
      scopeId: 11,
      isActive: true,
      deletedAt: null
    }
  },
  service,
  technicianService: null
};

const slot = {
  id: 51,
  serviceId: 41,
  technicianServiceId: null,
  shopId: 11,
  technicianProfileId: null,
  startsAt,
  endsAt,
  capacity: 1,
  bookedCount: 0,
  status: "AVAILABLE",
  deletedAt: null,
  service,
  technicianService: null,
  shop: service.shop,
  technicianProfile: null
};

interface BookingCreateDataFixture extends Record<string, unknown> {
  orderType: string;
  statusHistory: { create: Record<string, unknown> };
}

const createHarness = (
  overrides: {
    intelligence?: Record<string, unknown> | null;
    slot?: Record<string, unknown>;
  } = {}
) => {
  let persistedOrder: Record<string, unknown> | null = null;
  const create = jest.fn(async ({ data }: { data: BookingCreateDataFixture }) => {
    persistedOrder = {
      ...data,
    id: 301,
    orderNo: "ND202609060301",
    orderType: data.orderType,
    status: "PENDING",
    paymentStatus: "PENDING",
    paymentConfirmedById: null,
    paymentConfirmedAt: null,
    paymentReference: null,
    paymentNote: null,
    paymentRefundedById: null,
    paymentRefundedAt: null,
    paymentRefundReference: null,
    paymentRefundReason: null,
    fulfillmentAddressSnapshot: null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
    customer: null,
    service,
    technicianService: null,
    shop: service.shop,
    technicianProfile: null,
    serviceSession: null,
    statusHistory: [
      {
        id: 1,
        bookingOrderId: 301,
        ...data.statusHistory.create,
        reason: null,
        createdAt: now
      }
    ],
    timelineComments: [],
    performanceAssessment: null,
    performanceRevisions: [],
    affiliateAttributions: [],
    exchangeMatchParticipant: null,
      travelFareSnapshot: null
    };
    return persistedOrder;
  });
  const tx = {
    $queryRaw: jest.fn().mockImplementation(async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join(" ") ?? "";
      return sql.includes("administrative_regions")
        ? [
            { id: 1300, official_code: "13", level: "ADMIN1", parent_id: null, deleted_at: null },
            { id: 13104, official_code: "13104", level: "ADMIN2", parent_id: 1300, deleted_at: null }
          ]
        : [{ id: 7, post_id: 61 }];
    }),
    administrativeRegionLocale: {
      findMany: jest.fn().mockResolvedValue([
        { regionId: 1300, name: "東京都" },
        { regionId: 13104, name: "新宿区" }
      ])
    },
    customerProfile: { findFirst: jest.fn().mockResolvedValue({ membershipLevel: "black" }) },
    technicianProfile: { update: jest.fn().mockResolvedValue({ id: 91 }) },
    exchangeMatchParticipant: { findFirst: jest.fn().mockResolvedValue(null) },
    exchangeIntelligence: {
      findFirst: jest.fn().mockResolvedValue(
        overrides.intelligence === undefined
          ? intelligence
          : overrides.intelligence === null
            ? null
            : { ...intelligence, ...overrides.intelligence }
      )
    },
    shop: { update: jest.fn().mockResolvedValue({ id: 11 }) },
    scheduleSlot: {
      findFirst: jest.fn().mockResolvedValue({ ...slot, ...overrides.slot }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    bookingOrder: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.createIdempotencyKey ? persistedOrder : null
      ),
      findMany: jest.fn().mockResolvedValue([]),
      create
    },
    bookingServiceLocation: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
  };
  return {
    repository: new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never),
    tx,
    create
  };
};

describe("BookingRepository Exchange Intelligence source", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it("locks the source, applies the persisted campaign snapshot, and keeps checkout amount separate", async () => {
    const harness = createHarness();

    await expect(
      harness.repository.createBooking({
        customerUserId: 7,
        serviceId: 41,
        scheduleSlotId: 51,
        exchangeIntelligencePostId: 61,
        idempotencyKey: "intelligence-booking-0001",
        fulfillmentMode: "store",
        serviceLocation: { source: "SHOP_LOCATION" }
      })
    ).resolves.toMatchObject({
      order: {
        id: 301,
        exchangeIntelligencePostId: 61,
        servicePriceSnapshot: "8800.00",
        priceAmount: "8800.00",
        paymentAmountJpy: 8800
      }
    });

    expect(harness.tx.$queryRaw).toHaveBeenCalledTimes(7);
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          exchangeIntelligencePostId: 61,
          createIdempotencyKey: "intelligence-booking-0001",
          createRequestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
          serviceNameSnapshot: "Published campaign name",
          servicePriceSnapshot: 8800,
          serviceDurationSnapshot: 60,
          priceAmount: 8800,
          paymentAmountJpy: 8800,
          serviceSnapshotJson: expect.objectContaining({
            bookingSource: {
              type: "exchange_intelligence",
              postId: 61,
              serviceRef: "shop:41",
              catalogPriceJpy: 10000,
              campaignPriceJpy: 8800
            }
          })
        })
      })
    );
    expect(harness.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 7,
        action: "booking.exchange_intelligence.create",
        targetType: "booking_order",
        targetId: 301,
        metadata: expect.objectContaining({
          exchangeIntelligencePostId: 61,
          serviceRef: "shop:41",
          campaignPriceJpy: 8800
        })
      })
    });
  });

  it("fails closed when the persisted post is no longer published", async () => {
    const harness = createHarness({
      intelligence: { post: { ...intelligence.post, status: "WITHDRAWN" } }
    });

    await expect(
      harness.repository.createBooking({
        customerUserId: 7,
        serviceId: 41,
        scheduleSlotId: 51,
        exchangeIntelligencePostId: 61,
        idempotencyKey: "intelligence-booking-0001",
        fulfillmentMode: "store",
        serviceLocation: { source: "SHOP_LOCATION" }
      })
    ).resolves.toEqual({ intelligenceBookingError: "unavailable" });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("allows a shop-service Intelligence booking to use an assigned shop technician slot", async () => {
    const harness = createHarness({
      slot: {
        technicianProfileId: 91,
        technicianProfile: { id: 91, userId: 191, displayName: "Assigned technician" }
      }
    });

    await expect(
      harness.repository.createBooking({
        customerUserId: 7,
        serviceId: 41,
        scheduleSlotId: 51,
        exchangeIntelligencePostId: 61,
        idempotencyKey: "intelligence-booking-assigned-technician",
        fulfillmentMode: "store",
        serviceLocation: { source: "SHOP_LOCATION" }
      })
    ).resolves.toMatchObject({
      order: {
        id: 301,
        exchangeIntelligencePostId: 61,
        technicianProfileId: 91
      }
    });
    expect(harness.tx.scheduleSlot.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects a different requested service before changing slot capacity", async () => {
    const harness = createHarness();
    await expect(
      harness.repository.createBooking({
        customerUserId: 7,
        serviceId: 42,
        scheduleSlotId: 51,
        exchangeIntelligencePostId: 61,
        idempotencyKey: "intelligence-booking-0001",
        fulfillmentMode: "store",
        serviceLocation: { source: "SHOP_LOCATION" }
      })
    ).resolves.toEqual({ intelligenceBookingError: "service_mismatch" });
    expect(harness.tx.scheduleSlot.updateMany).not.toHaveBeenCalled();
  });

  it("replays one order for the same key and conflicts when the source request changes", async () => {
    const harness = createHarness();
    const base = {
      customerUserId: 7,
      serviceId: 41,
      scheduleSlotId: 51,
      exchangeIntelligencePostId: 61,
      idempotencyKey: "intelligence-booking-0001",
      fulfillmentMode: "store" as const,
      serviceLocation: { source: "SHOP_LOCATION" as const }
    };

    const first = await harness.repository.createBooking(base);
    const replay = await harness.repository.createBooking(base);
    const conflict = await harness.repository.createBooking({ ...base, paymentMethod: "bank_transfer" });

    expect(first).toMatchObject({ order: { id: 301 } });
    expect(replay).toMatchObject({ order: { id: 301 }, supersededOrders: [] });
    expect(conflict).toEqual({ intelligenceBookingError: "idempotency_conflict" });
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.tx.scheduleSlot.updateMany).toHaveBeenCalledTimes(1);
  });
});
