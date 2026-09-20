import { readFileSync } from "node:fs";
import { BookingRepository } from "../src/repositories/booking.repository";

const availabilityClient = (delegates: Record<string, unknown>) => {
  const client: Record<string, unknown> = {
    ...delegates,
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (operation: (transaction: unknown) => unknown) => operation(client))
  };
  return client as never;
};

const currentShopServiceLocation = (shopId: number, admin2RegionId = 725) => ({
  shopId,
  countryCode: "JP",
  admin1RegionId: 14,
  admin2RegionId,
  datasetVersion: "N03-20260101",
  deletedAt: null,
  admin1Region: {
    id: 14,
    countryCode: "JP",
    officialCode: "13",
    sourceVersion: "N03-20260101",
    level: "ADMIN1",
    parentId: 1,
    deletedAt: null,
    locales: [{ name: "東京都" }]
  },
  admin2Region: {
    id: admin2RegionId,
    countryCode: "JP",
    officialCode: admin2RegionId === 725 ? "13113" : "13103",
    sourceVersion: "N03-20260101",
    level: "ADMIN2",
    parentId: 14,
    deletedAt: null,
    locales: [{ name: admin2RegionId === 725 ? "渋谷区" : "港区" }]
  }
});

const makeTransitionOrderRecord = (
  status: "PENDING" | "CONFIRMED" | "IN_SERVICE" | "COMPLETED" | "CANCELLED"
) => ({
  id: 701,
  orderNo: "ND202609010701",
  orderType: "BOOKING",
  status,
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
  customerUserId: 101,
  serviceId: 11,
  technicianServiceId: null,
  shopId: 16,
  technicianProfileId: 31,
  scheduleSlotId: 501,
  fulfillmentMode: "store",
  priceAmount: 8800,
  currency: "JPY",
  pricingModeSnapshot: "MERCHANT",
  serviceOwnerType: "SHOP",
  serviceOwnerId: 11,
  serviceNameSnapshot: "肩颈调理",
  servicePriceSnapshot: 8800,
  serviceDurationSnapshot: 60,
  serviceSnapshotJson: null,
  startsAt: new Date("2026-09-01T06:00:00.000Z"),
  endsAt: new Date("2026-09-01T07:00:00.000Z"),
  note: null,
  cancelReason: status === "CANCELLED" ? "技师临时无法到达" : null,
  createdAt: new Date("2026-09-01T03:00:00.000Z"),
  updatedAt: new Date("2026-09-01T04:00:00.000Z"),
  service: null,
  technicianService: null,
  shop: { name: "LifeDance" },
  customer: {
    id: 101,
    needoId: "u0000000101",
    username: "预约用户 山田",
    avatarUrl: "/uploads/customers/101.jpg",
    avatarBootstrapUrl: null,
    customerProfile: {
      id: 17,
      displayName: "预约用户 山田",
      membershipLevel: "premium",
      membershipGrantMode: "SELF_SERVICE",
      membershipStartsAt: null,
      membershipExpiresAt: null,
      mediaAssets: [],
      reviewSummary: {
        ratingAverage: 4.8,
        reviewCount: 12,
        latestReviewAt: new Date("2026-08-31T04:00:00.000Z"),
        highlights: []
      }
    }
  },
  technicianProfile: { id: 31, userId: 707, displayName: "Misaki" },
  statusHistory: [],
  performanceAssessment: null,
  performanceRevisions: [],
  affiliateAttributions: []
});

describe("schedule list projection", () => {
  it("selects only fields needed by the schedule list payload", async () => {
    const row = {
      id: 1,
      serviceId: 2,
      technicianServiceId: null,
      shopId: 3,
      technicianProfileId: 4,
      startsAt: new Date("2026-09-13T00:00:00.000Z"),
      endsAt: new Date("2026-09-13T01:00:00.000Z"),
      capacity: 1,
      bookedCount: 0,
      status: "AVAILABLE",
      availability: { sourceType: "SHOP" },
      service: { name: "Aroma", priceAmount: 10000, currency: "JPY", durationMinutes: 60 },
      technicianService: null,
      shop: { name: "NeeDo" },
      technicianProfile: { displayName: "Mika" }
    };
    const scheduleSlot = {
      findMany: jest.fn(async (query: Record<string, unknown>) => {
        void query;
        return [row];
      }),
      count: jest.fn(async () => 1)
    };
    const repository = new BookingRepository({ scheduleSlot } as never);

    await repository.listScheduleSlots({
      scope: "merchant",
      shopId: 3,
      from: new Date("2026-09-13T00:00:00.000Z"),
      to: new Date("2026-09-14T00:00:00.000Z"),
      page: 1,
      pageSize: 100
    });

    const query = scheduleSlot.findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query).not.toHaveProperty("include");
    expect(query.select).toMatchObject({
      id: true,
      availability: { select: { sourceType: true } },
      service: { select: { name: true, priceAmount: true, currency: true, durationMinutes: true } },
      shop: { select: { name: true } },
      technicianProfile: { select: { displayName: true } }
    });
  });
});

const createCancellationTransaction = () => {
  const current = makeTransitionOrderRecord("PENDING");
  const next = makeTransitionOrderRecord("CANCELLED");
  return {
    bookingOrder: {
      findFirst: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(next),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0)
    },
    scheduleSlot: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    userIdentity: {
      findFirst: jest.fn().mockResolvedValue({
        id: 16,
        type: "merchant_owner",
        scopeType: "shop",
        displayName: "Eason",
        user: { username: "Eason" }
      })
    },
    orderStatusHistory: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    orderPerformanceAssessment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 81,
        bookingOrderId: 701,
        technicianProfileId: 31,
        outcome: "TECHNICIAN_CANCELLED",
        treatment: "COUNTED",
        version: 1,
        currentRevisionId: null,
        createdAt: current.updatedAt,
        updatedAt: current.updatedAt,
        deletedAt: null
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn().mockResolvedValue([
        {
          outcome: "TECHNICIAN_CANCELLED",
          treatment: "COUNTED",
          _count: { _all: 1 }
        }
      ])
    },
    orderPerformanceAssessmentRevision: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 91 })
    },
    technicianPerformanceSummary: {
      upsert: jest.fn().mockResolvedValue({ id: 1 })
    }
  };
};

type PendingReplacementOrder = {
  id: number;
  customerUserId: number;
  scheduleSlotId: number;
  status: string;
  deletedAt: null;
  exchangeMatchParticipant: { id: number } | null;
  cancelReason: string | null;
  [key: string]: unknown;
};
type PendingReplacementSlot = ReturnType<typeof makeReplacementSlot>;
type PendingReplacementHistory = Record<string, unknown>;

type PendingReplacementHarnessState = {
  orders: PendingReplacementOrder[];
  slots: PendingReplacementSlot[];
  statusHistory: PendingReplacementHistory[];
  nextOrderId: number;
};

type SlotUpdateArgs = {
  where: {
    id: number;
    bookedCount?: { gte?: number; lt?: number };
    status?: PendingReplacementSlot["status"];
  };
  data: {
    bookedCount?: { decrement?: number; increment?: number };
    status?: PendingReplacementSlot["status"];
  };
};

type BookingWhere = {
  customerUserId?: number;
  status?: string;
  deletedAt?: null;
  exchangeMatchParticipant?: { is: null };
  id?: { in: number[] };
};

type BookingUpdateArgs = {
  where: Required<Pick<BookingWhere, "customerUserId" | "status" | "deletedAt" | "id">> &
    Pick<BookingWhere, "exchangeMatchParticipant">;
  data: { status: string; cancelReason: string };
};

type BookingCreateArgs = {
  data: {
    scheduleSlotId: number;
    statusHistory: { create: Record<string, unknown> };
    [key: string]: unknown;
  };
};

const clonePendingReplacementState = (state: PendingReplacementHarnessState) =>
  structuredClone(state);

const makePendingReplacementOrder = (
  id: number,
  scheduleSlotId: number,
  exchangeMatchParticipant: { id: number } | null
) => ({
  ...makeTransitionOrderRecord("PENDING"),
  id,
  scheduleSlotId,
  exchangeMatchParticipant,
  deletedAt: null,
  shop: { name: "LifeDance", ownerUserId: 202 },
  fulfillmentAddressSnapshot: null
});

const makeReplacementSlot = (id: number, bookedCount: number, status: "AVAILABLE" | "BOOKED") => ({
  id,
  serviceId: 11,
  technicianServiceId: null,
  shopId: 16,
  technicianProfileId: null,
  startsAt: new Date("2026-10-01T06:00:00.000Z"),
  endsAt: new Date("2026-10-01T07:00:00.000Z"),
  capacity: 2,
  bookedCount,
  status,
  deletedAt: null as Date | null,
  service: {
    id: 11,
    publicId: "svc-replacement-11",
    categoryId: 7,
    name: "肩颈调理",
    description: "正式服务",
    priceAmount: 8800,
    currency: "JPY",
    durationMinutes: 60,
    createdAt: new Date("2026-09-01T00:00:00.000Z")
  },
  technicianService: null,
  shop: { id: 16, name: "LifeDance", ownerUserId: 202, pricingMode: "MERCHANT",
    serviceLocation: { countryCode: "JP", admin1RegionId: 13, admin2RegionId: 13104, datasetVersion: "N03-20260101", deletedAt: null,
      admin1Region: { officialCode: "13" }, admin2Region: { officialCode: "13104" } } },
  technicianProfile: null
});

const relationIsNull = (order: PendingReplacementOrder) => order.exchangeMatchParticipant == null;

const createPendingReplacementHarness = (
  options: { deletedPendingSlot?: boolean; linkAfterSelection?: boolean } = {}
) => {
  let committed: PendingReplacementHarnessState = {
    orders: [
      makePendingReplacementOrder(501, 601, null),
      makePendingReplacementOrder(502, 602, { id: 81 })
    ],
    slots: [
      {
        ...makeReplacementSlot(601, 1, "BOOKED"),
        deletedAt: options.deletedPendingSlot ? new Date("2026-09-02T00:00:00.000Z") : null
      },
      makeReplacementSlot(602, 1, "BOOKED"),
      makeReplacementSlot(603, 0, "AVAILABLE")
    ],
    statusHistory: [],
    nextOrderId: 701
  };
  let concurrentLinkApplied = false;

  const transactionClient = (working: PendingReplacementHarnessState) => ({
    $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 101 }]).mockResolvedValue([
      { id: 13, official_code: "13", level: "ADMIN1", parent_id: null, deleted_at: null },
      { id: 13104, official_code: "13104", level: "ADMIN2", parent_id: 13, deleted_at: null }
    ]),
    administrativeRegionLocale: { findMany: jest.fn().mockResolvedValue([{ regionId: 13, name: "東京都" }, { regionId: 13104, name: "新宿区" }]) },
    bookingServiceLocation: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    customerProfile: {
      findFirst: jest.fn().mockResolvedValue({ membershipLevel: "standard" })
    },
    technicianCompensationProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    shopFinanceRuleSet: { findFirst: jest.fn().mockResolvedValue(null) },
    shopAutoDispatchRule: { findFirst: jest.fn().mockResolvedValue(null) },
    shop: { update: jest.fn().mockResolvedValue({ id: 16 }) },
    scheduleSlot: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: number } }) =>
          working.slots.find((slot) => slot.id === where.id) ?? null
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { id: number } }) =>
          working.slots.find((slot) => slot.id === where.id) ?? null
      ),
      updateMany: jest.fn(async ({ where, data }: SlotUpdateArgs) => {
        const slot = working.slots.find((candidate) => candidate.id === where.id);
        if (!slot || slot.deletedAt !== null) return { count: 0 };
        if (where.bookedCount?.gte !== undefined && slot.bookedCount < where.bookedCount.gte) {
          return { count: 0 };
        }
        if (where.bookedCount?.lt !== undefined && slot.bookedCount >= where.bookedCount.lt) {
          return { count: 0 };
        }
        if (where.status && slot.status !== where.status) return { count: 0 };
        if (data.bookedCount?.decrement) slot.bookedCount -= data.bookedCount.decrement;
        if (data.bookedCount?.increment) slot.bookedCount += data.bookedCount.increment;
        if (data.status) slot.status = data.status;
        return { count: 1 };
      })
    },
    bookingOrder: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn(async ({ where }: { where: BookingWhere }) => {
        if (where.customerUserId !== undefined) {
          const selected = working.orders
            .filter(
              (order) =>
                order.customerUserId === where.customerUserId &&
                order.status === where.status &&
                order.deletedAt === where.deletedAt &&
                (!where.exchangeMatchParticipant || relationIsNull(order))
            )
            .map((order) => structuredClone(order));
          if (options.linkAfterSelection && !concurrentLinkApplied && selected.length > 0) {
            concurrentLinkApplied = true;
            const targetId = selected[0].id;
            const committedTarget = committed.orders.find((order) => order.id === targetId)!;
            const workingTarget = working.orders.find((order) => order.id === targetId)!;
            committedTarget.exchangeMatchParticipant = { id: 82 };
            workingTarget.exchangeMatchParticipant = { id: 82 };
          }
          return selected;
        }
        const ids = where.id?.in;
        if (ids) {
          return working.orders
            .filter((order) => ids.includes(order.id) && order.deletedAt === null)
            .map((order) => structuredClone(order));
        }
        return [];
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn(async ({ where, data }: BookingUpdateArgs) => {
        const matched = working.orders.filter(
          (order) =>
            where.id.in.includes(order.id) &&
            order.customerUserId === where.customerUserId &&
            order.status === where.status &&
            order.deletedAt === where.deletedAt &&
            (!where.exchangeMatchParticipant || relationIsNull(order))
        );
        for (const order of matched) {
          order.status = data.status;
          order.cancelReason = data.cancelReason;
        }
        return { count: matched.length };
      }),
      create: jest.fn(async ({ data }: BookingCreateArgs) => {
        const slot = working.slots.find((candidate) => candidate.id === data.scheduleSlotId)!;
        const order = {
          ...makePendingReplacementOrder(working.nextOrderId++, data.scheduleSlotId, null),
          ...data,
          id: working.nextOrderId - 1,
          service: slot.service,
          technicianService: null,
          shop: slot.shop,
          technicianProfile: null,
          statusHistory: [
            {
              id: 1,
              bookingOrderId: working.nextOrderId - 1,
              ...data.statusHistory.create,
              reason: null,
              createdAt: new Date("2026-09-03T00:00:00.000Z")
            }
          ]
        };
        working.orders.push(order);
        return structuredClone(order);
      })
    },
    orderStatusHistory: {
      createMany: jest.fn(async ({ data }: { data: PendingReplacementHistory[] }) => {
        working.statusHistory.push(...structuredClone(data));
        return { count: data.length };
      })
    }
  });

  const client = {
    $transaction: jest.fn(
      async (callback: (tx: ReturnType<typeof transactionClient>) => unknown) => {
        const working = clonePendingReplacementState(committed);
        const result = await callback(transactionClient(working));
        committed = working;
        return result;
      }
    )
  };

  return {
    client,
    state: () => clonePendingReplacementState(committed)
  };
};

describe("BookingRepository order list scope", () => {
  it("rejects a multi-service bundle unless its selected slots form one continuous technician timeline", async () => {
    const firstStartsAt = new Date("2026-10-01T01:00:00.000Z");
    const firstEndsAt = new Date("2026-10-01T02:00:00.000Z");
    const secondStartsAt = new Date("2026-10-01T02:30:00.000Z");
    const secondEndsAt = new Date("2026-10-01T03:00:00.000Z");
    const slot = (id: number, technicianServiceId: number, startsAt: Date, endsAt: Date) => ({
      id,
      availabilityId: 900,
      serviceId: null,
      technicianServiceId,
      shopId: 16,
      technicianProfileId: 47,
      startsAt,
      endsAt,
      capacity: 1,
      bookedCount: 0,
      status: "AVAILABLE",
      createdAt: firstStartsAt,
      updatedAt: firstStartsAt,
      deletedAt: null,
      availability: { sourceType: "TECHNICIAN" },
      service: null,
      technicianService: {
        id: technicianServiceId,
        name: `Service ${technicianServiceId}`,
        priceAmount: 5_000,
        currency: "JPY",
        durationMinutes: 60
      },
      shop: { id: 16, pricingMode: "TECHNICIAN", serviceLocation: null },
      technicianProfile: { id: 47, userId: 707 }
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 101 }]),
      scheduleSlot: {
        findMany: jest.fn().mockResolvedValue([
          slot(201, 101, firstStartsAt, firstEndsAt),
          slot(202, 102, secondStartsAt, secondEndsAt)
        ])
      }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(repository.createBooking({
      customerUserId: 101,
      technicianServiceId: 101,
      technicianServiceIds: [101, 102],
      scheduleSlotId: 201,
      scheduleSlotIds: [201, 202],
      expectedPriceAmountJpy: 10_000,
      fulfillmentMode: "store",
      serviceLocation: { source: "SHOP_LOCATION" }
    })).resolves.toBeNull();
  });

  it("uses overlap bounds without dropping merchant and technician identity scope", async () => {
    const bookingOrder = { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) };
    const repository = new BookingRepository({ bookingOrder } as never);
    const from = new Date("2026-09-06T15:00:00.000Z");
    const to = new Date("2026-09-07T15:00:00.000Z");
    await repository.listOrders({ shopId: 16, technicianProfileId: 31, from, to, dateMode: "overlaps", page: 1, pageSize: 20 });
    const where = { shopId: 16, technicianProfileId: 31, deletedAt: null, startsAt: { lt: to }, endsAt: { gt: from } };
    expect(bookingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(bookingOrder.count).toHaveBeenCalledWith({ where });
  });

  it("lets direct shop scheduling create a shop-owned slot without technician availability", async () => {
    const startsAt = new Date("2026-08-29T13:00:00.000Z");
    const endsAt = new Date("2026-08-29T14:00:00.000Z");
    const scheduleFindFirst = jest.fn().mockResolvedValue(null);
    const availabilityCreate = jest.fn().mockResolvedValue({ id: 501 });
    const createdSlot = {
      id: 601,
      availabilityId: 501,
      serviceId: 20,
      technicianServiceId: null,
      shopId: 16,
      technicianProfileId: 47,
      startsAt,
      endsAt,
      capacity: 1,
      bookedCount: 0,
      status: "AVAILABLE",
      createdAt: startsAt,
      updatedAt: startsAt,
      deletedAt: null,
      service: {
        name: "Aroma 60",
        priceAmount: 12000,
        currency: "JPY",
        durationMinutes: 60
      },
      technicianService: null,
      shop: { name: "LifeDance" },
      technicianProfile: { displayName: "斋藤 健太" }
    };
    const tx = {
      entitySuspension: { findFirst: jest.fn().mockResolvedValue(null) },
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 16 }) },
      service: {
        findFirst: jest.fn().mockResolvedValue({ id: 20, durationMinutes: 60 })
      },
      technicianShopAffiliation: {
        findFirst: jest.fn().mockResolvedValue({ id: 91, relationshipType: "PARTNER" })
      },
      technicianProfile: { update: jest.fn().mockResolvedValue({ id: 47 }) },
      scheduleSlot: {
        findFirst: scheduleFindFirst,
        create: jest.fn().mockResolvedValue(createdSlot)
      },
      bookingOrder: { findFirst: jest.fn().mockResolvedValue({ id: 700 }) },
      availability: {
        create: availabilityCreate
      }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(
      repository.createScheduleSlot({
        scope: "merchant",
        shopId: 16,
        serviceId: 20,
        technicianProfileId: 47,
        startsAt,
        endsAt,
        capacity: 1
      })
    ).resolves.toMatchObject({ outcome: "ok" });

    expect(scheduleFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        technicianProfileId: 47,
        availability: { is: { sourceType: "SHOP" } }
      })
    }));
    expect(scheduleFindFirst.mock.calls[0]?.[0]?.where).not.toHaveProperty("shopId");
    expect(availabilityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceType: "SHOP", visibility: "SHOP_ONLY" })
    });
    expect(tx.scheduleSlot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ availabilityId: 501 }) })
    );
  });

  it("projects technician-owned slots onto the selected technician service shop", async () => {
    const startsAt = new Date("2026-09-21T01:00:00.000Z");
    const endsAt = new Date("2026-09-21T02:00:00.000Z");
    const availabilityCreate = jest.fn().mockResolvedValue({ id: 49018 });
    const scheduleCreate = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 49019,
        availabilityId: 49018,
        serviceId: null,
        technicianServiceId: 201,
        shopId: data.shopId,
        technicianProfileId: 22,
        startsAt,
        endsAt,
        capacity: 1,
        bookedCount: 0,
        status: "AVAILABLE",
        createdAt: startsAt,
        updatedAt: startsAt,
        deletedAt: null,
        availability: { sourceType: "TECHNICIAN" },
        service: null,
        technicianService: {
          name: "StagingTest service",
          priceAmount: 10_000,
          currency: "JPY",
          durationMinutes: 60
        },
        shop: { name: "StagingTest" },
        technicianProfile: { displayName: "Staging technician" }
      })
    );
    const shopFindFirst = jest
      .fn()
      .mockImplementation(({ where }) => Promise.resolve({ id: where.id }));
    const tx = {
      entitySuspension: { findFirst: jest.fn().mockResolvedValue(null) },
      shop: { findFirst: shopFindFirst },
      technicianProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 22,
          technicianShopAffiliations: [{ shopId: 5 }]
        }),
        update: jest.fn().mockResolvedValue({ id: 22 })
      },
      technicianService: {
        findFirst: jest.fn().mockResolvedValue({
          id: 201,
          technicianId: 22,
          shopId: 11,
          durationMinutes: 60
        })
      },
      technicianShopAffiliation: {
        findFirst: jest.fn().mockResolvedValue({ id: 91 })
      },
      scheduleSlot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: scheduleCreate
      },
      availability: { create: availabilityCreate }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(
      repository.createScheduleSlot({
        scope: "technician",
        technicianProfileId: 22,
        technicianServiceId: 201,
        startsAt,
        endsAt,
        capacity: 1
      })
    ).resolves.toMatchObject({
      outcome: "ok",
      slot: { id: 49019, shopId: 11, technicianServiceId: 201 }
    });

    expect(shopFindFirst).toHaveBeenCalledWith({
      where: { id: 11, deletedAt: null, status: "published" },
      select: { id: true }
    });
    expect(availabilityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: 11,
        technicianProfileId: 22,
        sourceType: "TECHNICIAN",
        visibility: "TECHNICIAN_SHOPS"
      })
    });
    expect(scheduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: 11,
          technicianProfileId: 22,
          technicianServiceId: 201,
          serviceId: null
        })
      })
    );
  });

  it("rejects merchant schedule creation when profile.shopId has no formal affiliation", async () => {
    const startsAt = new Date("2026-08-29T13:00:00.000Z");
    const endsAt = new Date("2026-08-29T14:00:00.000Z");
    const tx = {
      entitySuspension: { findFirst: jest.fn().mockResolvedValue(null) },
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 16 }) },
      service: { findFirst: jest.fn().mockResolvedValue({ id: 20, durationMinutes: 60 }) },
      technicianShopAffiliation: { findFirst: jest.fn().mockResolvedValue(null) }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(repository.createScheduleSlot({
      scope: "merchant", shopId: 16, serviceId: 20, technicianProfileId: 47,
      startsAt, endsAt, capacity: 1
    })).resolves.toEqual({ outcome: "not_found" });
  });

  it("rejects merchant schedule creation outside technician-owned availability", async () => {
    const startsAt = new Date("2026-09-21T01:00:00.000Z");
    const endsAt = new Date("2026-09-21T02:00:00.000Z");
    const tx = {
      entitySuspension: { findFirst: jest.fn().mockResolvedValue(null) },
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 16 }) },
      service: { findFirst: jest.fn().mockResolvedValue({ id: 20, durationMinutes: 60 }) },
      technicianShopAffiliation: {
        findFirst: jest.fn().mockResolvedValue({ id: 91, relationshipType: "PARTNER" })
      },
      technicianProfile: { update: jest.fn().mockResolvedValue({ id: 47 }) },
      scheduleCycle: { findFirst: jest.fn().mockResolvedValue({ id: 301 }) },
      availability: { findFirst: jest.fn().mockResolvedValue(null) }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(repository.createScheduleSlot({
      scope: "merchant",
      shopId: 16,
      serviceId: 20,
      technicianProfileId: 47,
      startsAt,
      endsAt,
      capacity: 1
    })).resolves.toEqual({ outcome: "outside_availability" });

    expect(tx.availability.findFirst).toHaveBeenCalledWith({
      where: {
        technicianProfileId: 47,
        sourceType: "TECHNICIAN",
        visibility: "TECHNICIAN_SHOPS",
        isActive: true,
        isScheduleControlWindow: true,
        deletedAt: null,
        startsAt: { lte: startsAt },
        endsAt: { gte: endsAt }
      },
      select: { id: true }
    });
  });

  it("rejects moving a merchant schedule outside technician-owned availability", async () => {
    const startsAt = new Date("2026-09-22T01:00:00.000Z");
    const endsAt = new Date("2026-09-22T02:00:00.000Z");
    const existingStartsAt = new Date("2026-09-21T01:00:00.000Z");
    const existingEndsAt = new Date("2026-09-21T02:00:00.000Z");
    const tx = {
      entitySuspension: { findFirst: jest.fn().mockResolvedValue(null) },
      technicianProfile: { update: jest.fn().mockResolvedValue({ id: 47 }) },
      scheduleCycle: { findFirst: jest.fn().mockResolvedValue({ id: 301 }) },
      scheduleSlot: {
        findFirst: jest.fn().mockResolvedValue({
          id: 49019,
          shopId: 16,
          technicianProfileId: 47,
          serviceId: 20,
          technicianServiceId: null,
          startsAt: existingStartsAt,
          endsAt: existingEndsAt,
          capacity: 1,
          bookedCount: 0,
          status: "AVAILABLE",
          availabilityId: 49018,
          availability: { sourceType: "TECHNICIAN" },
          service: { durationMinutes: 60 },
          technicianService: null
        })
      },
      availability: { findFirst: jest.fn().mockResolvedValue(null) }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(repository.updateScheduleSlot({
      scope: "merchant",
      shopId: 16,
      id: 49019,
      startsAt,
      endsAt
    })).resolves.toEqual({ outcome: "outside_availability" });

    expect(tx.availability.findFirst).toHaveBeenCalledWith({
      where: {
        technicianProfileId: 47,
        sourceType: "TECHNICIAN",
        visibility: "TECHNICIAN_SHOPS",
        isActive: true,
        isScheduleControlWindow: true,
        deletedAt: null,
        startsAt: { lte: startsAt },
        endsAt: { gte: endsAt }
      },
      select: { id: true }
    });
  });

  it("does not resolve profile.shopId as an effective technician affiliation", async () => {
    const technicianProfile = { findFirst: jest.fn().mockResolvedValue({
      shopId: 16,
      technicianShopAffiliations: []
    }) };
    const repository = new BookingRepository({ technicianProfile } as never);
    await expect(repository.findTechnicianShopId(47)).resolves.toBeNull();
  });

  it("publishes technician-owned availability to affiliated shops", async () => {
    const source = readFileSync(
      require.resolve("../src/repositories/booking.repository.ts"),
      "utf8"
    );

    expect(source).toContain('input.scope === "technician" ? "TECHNICIAN" : "SHOP"');
    expect(source).toContain('input.scope === "technician" ? "TECHNICIAN_SHOPS" : "SHOP_ONLY"');
  });

  it("serializes and fingerprints technician manual-booking schedule creation for idempotent retries", async () => {
    const source = readFileSync(
      require.resolve("../src/repositories/booking.repository.ts"),
      "utf8"
    );

    expect(source).toContain("await this.lockScheduleOwner(transaction, target.shopId, target.technicianProfileId)");
    expect(source).toContain("manualBookingIdempotencyKey: input.manualBookingIdempotencyKey");
    expect(source).toContain("manualBookingRequestFingerprint !== manualBookingRequestFingerprint");
    expect(source).toContain("idempotentReplay: true");
  });

  it("reads only a schedule slot owned by the active technician scope", async () => {
    const scheduleSlot = {
      findFirst: jest.fn(async () => null)
    };
    const repository = new BookingRepository({ scheduleSlot } as never);

    await expect(
      repository.findScheduleSlotById({
        scope: "technician",
        technicianProfileId: 31,
        id: 10
      })
    ).resolves.toBeNull();

    expect(scheduleSlot.findFirst).toHaveBeenCalledWith({
      where: { id: 10, technicianProfileId: 31, deletedAt: null },
      include: expect.any(Object)
    });
  });

  it("keeps public availability safety predicates on technician-only queries", async () => {
    const capacityField = Symbol("capacity");
    const scheduleSlot = {
      fields: { capacity: capacityField },
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
        void args;
        return [];
      }),
      count: jest.fn(async () => 0)
    };
    const repository = new BookingRepository(availabilityClient({
      scheduleSlot,
      shopServiceLocation: { findMany: jest.fn(async () => [currentShopServiceLocation(11)]) }
    }));

    await repository.listAvailableSlots({
      technicianId: 17,
      from: new Date("2026-08-31T15:00:00.000Z"),
      to: new Date("2026-10-01T15:00:00.000Z"),
      page: 1,
      pageSize: 100
    });

    const expectedWhere = expect.objectContaining({
      deletedAt: null,
      status: "AVAILABLE",
      bookedCount: { lt: capacityField },
      technicianProfileId: 17,
      startsAt: {
        gte: new Date("2026-08-31T15:00:00.000Z"),
        lt: new Date("2026-10-01T15:00:00.000Z")
      },
      shop: {
        deletedAt: null,
        status: "published",
        visibility: "public",
        publicIdentifier: { is: { kind: "SHOP", status: "ACTIVE", deletedAt: null } },
        entitySuspensions: {
          none: { activeKey: { not: null }, status: "active", deletedAt: null }
        }
      },
      AND: expect.arrayContaining([
        {
          OR: [
            { serviceId: null },
            {
              service: {
                is: {
                  deletedAt: null,
                  status: "published",
                  category: { is: { deletedAt: null, isActive: true } }
                }
              }
            }
          ]
        },
        {
          OR: [
            { technicianServiceId: null },
            {
              technicianService: {
                is: {
                  deletedAt: null,
                  isActive: true,
                  isBookable: true,
                  reviewStatus: "APPROVED",
                  category: { is: { deletedAt: null, isActive: true } },
                  technicianProfile: {
                    is: {
                      deletedAt: null,
                      status: "published",
                      user: { is: { deletedAt: null, isActive: true } }
                    }
                  }
                }
              }
            }
          ]
        },
        { OR: [{ serviceId: { not: null } }, { technicianServiceId: { not: null } }] },
        {
          OR: [
            { shopId: { in: [11] } },
            { service: { is: { serviceMode: { in: ["home", "home_visit", "onsite"] } } } },
            {
              technicianService: {
                is: {
                  sourceShopService: {
                    is: { serviceMode: { in: ["home", "home_visit", "onsite"] } }
                  }
                }
              }
            }
          ]
        }
      ])
    });
    const actualWhere = scheduleSlot.findMany.mock.calls[0]?.[0]?.where;
    expect(actualWhere).not.toHaveProperty("endsAt");
    expect(scheduleSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere
      })
    );
    expect(scheduleSlot.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("filters store-capable slots by current shop location while retaining home-only sources", async () => {
    const capacityField = Symbol("capacity");
    const scheduleSlot = {
      fields: { capacity: capacityField },
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
        void args;
        return [];
      }),
      count: jest.fn(async () => 0)
    };
    const shopServiceLocation = {
      findMany: jest.fn(async () => [
        currentShopServiceLocation(11, 725),
        currentShopServiceLocation(16, 715),
        { ...currentShopServiceLocation(21, 725), datasetVersion: "N03-20250101" },
        {
          ...currentShopServiceLocation(22, 725),
          admin2Region: { ...currentShopServiceLocation(22, 725).admin2Region, parentId: 99 }
        },
        { ...currentShopServiceLocation(23, 725), deletedAt: new Date("2026-09-01T00:00:00.000Z") },
        { ...currentShopServiceLocation(24, 725), countryCode: "US" },
        {
          ...currentShopServiceLocation(25, 725),
          admin1Region: {
            ...currentShopServiceLocation(25, 725).admin1Region,
            sourceVersion: "N03-20250101"
          }
        },
        {
          ...currentShopServiceLocation(26, 725),
          admin2Region: {
            ...currentShopServiceLocation(26, 725).admin2Region,
            locales: [{ name: "" }]
          }
        }
      ])
    };
    const repository = new BookingRepository(availabilityClient({
      service: { findFirst: jest.fn(async () => ({ shopId: 16 })) },
      scheduleSlot,
      shopServiceLocation
    }));

    await repository.listAvailableSlots({
      serviceId: 79,
      from: new Date("2026-09-13T00:00:00.000Z"),
      to: new Date("2026-09-14T00:00:00.000Z"),
      page: 1,
      pageSize: 100
    });

    expect(shopServiceLocation.findMany).toHaveBeenCalledTimes(1);
    const where = scheduleSlot.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual(expect.objectContaining({
      AND: expect.arrayContaining([
        {
          OR: expect.arrayContaining([
            { shopId: { in: [11, 16] } },
            { service: { is: { serviceMode: { in: ["home", "home_visit", "onsite"] } } } }
          ])
        }
      ])
    }));
    expect(scheduleSlot.count).toHaveBeenCalledWith({ where });
  });

  it("keeps shop-service technician slots on the service shop and a current public affiliation", async () => {
    const capacityField = Symbol("capacity");
    const scheduleSlot = {
      fields: { capacity: capacityField },
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
        void args;
        return [];
      }),
      count: jest.fn(async () => 0)
    };
    const service = {
      findFirst: jest.fn(async () => ({ shopId: 16 }))
    };
    const repository = new BookingRepository(availabilityClient({
      service,
      scheduleSlot,
      shopServiceLocation: { findMany: jest.fn(async () => [currentShopServiceLocation(16)]) }
    }));

    await repository.listAvailableSlots({
      serviceId: 79,
      from: new Date("2026-09-13T00:00:00.000Z"),
      to: new Date("2026-09-14T00:00:00.000Z"),
      page: 1,
      pageSize: 100
    });

    expect(service.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 79, deletedAt: null, status: "published" }),
      select: { shopId: true }
    }));
    const where = scheduleSlot.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual(expect.objectContaining({
      serviceId: 79,
      technicianServiceId: null,
      shopId: 16
    }));
    expect(where.AND).toEqual(expect.arrayContaining([
      {
        OR: [
          { technicianProfileId: null },
          {
            technicianProfile: {
              is: expect.objectContaining({
                deletedAt: null,
                status: "published",
                visibility: "public",
                user: {
                  is: expect.objectContaining({
                    deletedAt: null,
                    isActive: true,
                    identities: {
                      some: expect.objectContaining({
                        deletedAt: null,
                        isActive: true,
                        publicIdentifier: {
                          is: { kind: "S", status: "ACTIVE", deletedAt: null }
                        }
                      })
                    }
                  })
                },
                technicianShopAffiliations: {
                  some: expect.objectContaining({
                    shopId: 16,
                    activeKey: { not: null },
                    workStatus: "ACTIVE",
                    startsAt: { lte: expect.any(Date) },
                    OR: [{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }],
                    deletedAt: null
                  })
                }
              })
            }
          }
        ]
      }
    ]));
  });

  it("returns no public slots when the requested shop service is not currently publishable", async () => {
    const scheduleSlot = {
      fields: { capacity: Symbol("capacity") },
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0)
    };
    const shopServiceLocation = { findMany: jest.fn(async () => []) };
    const repository = new BookingRepository(availabilityClient({
      service: { findFirst: jest.fn(async () => null) },
      scheduleSlot,
      shopServiceLocation
    }));

    await expect(repository.listAvailableSlots({
      serviceId: 79,
      from: new Date("2026-09-13T00:00:00.000Z"),
      to: new Date("2026-09-14T00:00:00.000Z"),
      page: 1,
      pageSize: 100
    })).resolves.toEqual({ list: [], total: 0, page: 1, page_size: 100 });
    expect(shopServiceLocation.findMany).not.toHaveBeenCalled();
    expect(scheduleSlot.findMany).not.toHaveBeenCalled();
    expect(scheduleSlot.count).not.toHaveBeenCalled();
  });

  it("requires every present source relation to remain currently bookable", async () => {
    const scheduleSlot = {
      fields: { capacity: Symbol("capacity") },
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
        void args;
        return [];
      }),
      count: jest.fn(async () => 0)
    };
    const repository = new BookingRepository(availabilityClient({
      service: { findFirst: jest.fn(async () => ({ shopId: 11 })) },
      scheduleSlot,
      shopServiceLocation: { findMany: jest.fn(async () => [currentShopServiceLocation(11)]) }
    }));

    await repository.listAvailableSlots({
      serviceId: 12,
      from: new Date("2026-09-02T15:00:00.000Z"),
      to: new Date("2026-09-03T15:00:00.000Z"),
      page: 1,
      pageSize: 100
    });

    const where = scheduleSlot.findMany.mock.calls[0]?.[0]?.where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { serviceId: null },
            expect.objectContaining({
              service: expect.objectContaining({
                is: expect.objectContaining({ deletedAt: null, status: "published" })
              })
            })
          ])
        }),
        expect.objectContaining({
          OR: expect.arrayContaining([
            { technicianServiceId: null },
            expect.objectContaining({
              technicianService: expect.objectContaining({
                is: expect.objectContaining({
                  deletedAt: null,
                  isActive: true,
                  isBookable: true,
                  reviewStatus: "APPROVED"
                })
              })
            })
          ])
        })
      ])
    );
    expect(scheduleSlot.count).toHaveBeenCalledWith({ where });
  });

  it("includes formal unavailable rows only when the public caller opts in", async () => {
    const scheduleSlot = {
      fields: { capacity: Symbol("capacity") },
      findMany: jest.fn(async (args: { where: unknown }) => {
        void args;
        return [];
      }),
      count: jest.fn(async () => 0)
    };
    const repository = new BookingRepository(availabilityClient({
      service: { findFirst: jest.fn(async () => ({ shopId: 11 })) },
      scheduleSlot,
      shopServiceLocation: { findMany: jest.fn(async () => [currentShopServiceLocation(11)]) }
    }));

    await repository.listAvailableSlots({
      serviceId: 12,
      includeUnavailable: true,
      from: new Date("2026-09-02T15:00:00.000Z"),
      to: new Date("2026-09-03T15:00:00.000Z"),
      page: 1,
      pageSize: 100
    });

    const where = scheduleSlot.findMany.mock.calls[0]?.[0]?.where;
    expect(where).not.toHaveProperty("status");
    expect(where).not.toHaveProperty("bookedCount");
    expect(where).toEqual(
      expect.objectContaining({
        deletedAt: null,
        serviceId: 12,
        startsAt: {
          gte: new Date("2026-09-02T15:00:00.000Z"),
          lt: new Date("2026-09-03T15:00:00.000Z")
        },
        service: { deletedAt: null, status: "published" },
        shop: expect.objectContaining({ deletedAt: null, status: "published" })
      })
    );
    expect(scheduleSlot.count).toHaveBeenCalledWith({ where });
  });

  it("checks occupancy only after paging include-unavailable slots", async () => {
    const slot = {
      id: 501,
      serviceId: 12,
      technicianServiceId: null,
      shopId: 11,
      technicianProfileId: null,
      startsAt: new Date("2026-09-03T01:00:00.000Z"),
      endsAt: new Date("2026-09-03T02:00:00.000Z"),
      capacity: 1,
      bookedCount: 0,
      status: "AVAILABLE",
      availability: { sourceType: "SHOP" },
      service: { name: "Aroma", priceAmount: 8800, currency: "JPY", durationMinutes: 60 },
      technicianService: null,
      shop: { name: "StagingTest" },
      technicianProfile: null
    };
    const scheduleSlot = {
      fields: { capacity: Symbol("capacity") },
      findMany: jest.fn(async () => [slot]),
      count: jest.fn(async () => 1)
    };
    const client = availabilityClient({
      customerProfile: {
        findFirst: jest.fn(async () => ({ membershipLevel: "standard" }))
      },
      service: { findFirst: jest.fn(async () => ({ shopId: 11 })) },
      scheduleSlot,
      shopServiceLocation: { findMany: jest.fn(async () => [currentShopServiceLocation(11)]) }
    });
    const queryRaw = (client as unknown as { $queryRaw: jest.Mock }).$queryRaw;
    const repository = new BookingRepository(client);

    await repository.listAvailableSlots({
      serviceId: 12,
      includeUnavailable: true,
      from: new Date("2026-09-02T15:00:00.000Z"),
      to: new Date("2026-09-03T15:00:00.000Z"),
      page: 1,
      pageSize: 100
    }, { visibility: "public" }, 77);

    expect(scheduleSlot.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      queryRaw.mock.invocationCallOrder[0]
    );
    const query = queryRaw.mock.calls[0]?.[0] as {
      strings?: readonly string[];
      values?: readonly unknown[];
    };
    expect(query.strings?.join(" ")).toMatch(/s\.id IN/u);
    expect(query.values).toContain(slot.id);
  });

  it("rejects a partial affiliate hook pair before opening the booking transaction", async () => {
    const client = { $transaction: jest.fn().mockResolvedValue(null) };
    const repository = new BookingRepository(client as never);

    await expect(
      repository.createBooking(
        {
          customerUserId: 7,
          expectedPriceAmountJpy: 8_800,
          serviceId: 1,
          scheduleSlotId: 11,
          fulfillmentMode: "store",
          serviceLocation: { source: "SHOP_LOCATION" }
        },
        {
          prepareAffiliate: jest.fn()
        }
      )
    ).rejects.toThrow("error.affiliate.checkout_hook_invalid");
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("returns the transaction-current database price before reserving a slot", async () => {
    const startsAt = new Date("2026-09-10T03:00:00.000Z");
    const endsAt = new Date("2026-09-10T04:00:00.000Z");
    const slot = {
      id: 611,
      availabilityId: 511,
      serviceId: 21,
      technicianServiceId: null,
      shopId: 16,
      technicianProfileId: null,
      startsAt,
      endsAt,
      capacity: 1,
      bookedCount: 0,
      status: "AVAILABLE",
      createdAt: startsAt,
      updatedAt: startsAt,
      deletedAt: null,
      service: {
        id: 21,
        publicId: "SVC-000021",
        categoryId: 3,
        name: "数据库最新价格服务",
        description: "",
        priceAmount: 9_800,
        currency: "JPY",
        durationMinutes: 60,
        createdAt: startsAt
      },
      technicianService: null,
      shop: {
        id: 16,
        name: "LifeDance",
        pricingMode: "MERCHANT",
        serviceLocation: {
          countryCode: "JP",
          admin1RegionId: 13,
          admin2RegionId: 13104,
          datasetVersion: "2026-09",
          deletedAt: null,
          admin1Region: { officialCode: "13" },
          admin2Region: { officialCode: "13104" }
        }
      },
      technicianProfile: null
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      customerProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      scheduleSlot: { findFirst: jest.fn().mockResolvedValue(slot), updateMany: jest.fn() },
      shop: { update: jest.fn().mockResolvedValue({ id: 16 }) },
      bookingOrder: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn()
      },
      exchangeMatchParticipant: { findFirst: jest.fn().mockResolvedValue(null) }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);
    (repository as unknown as {
      administrativeRegionRepository: { resolveVerifiedScope: jest.Mock };
    }).administrativeRegionRepository = {
      resolveVerifiedScope: jest.fn().mockResolvedValue({
        countryCode: "JP",
        admin1Code: "13",
        admin1NameJa: "東京都",
        admin1RegionId: 13,
        admin2Code: "13104",
        admin2NameJa: "新宿区",
        admin2RegionId: 13104,
        datasetVersion: "2026-09"
      })
    };

    await expect(repository.createBooking({
      customerUserId: 7,
      expectedPriceAmountJpy: 8_800,
      serviceId: 21,
      scheduleSlotId: 611,
      fulfillmentMode: "store",
      serviceLocation: { source: "SHOP_LOCATION" }
    })).resolves.toEqual({ outcome: "price_changed", currentPriceAmountJpy: 9_800 });
    expect(tx.scheduleSlot.updateMany).not.toHaveBeenCalled();
    expect(tx.bookingOrder.create).not.toHaveBeenCalled();
  });

  it("rejects a slot at the current server time during transactional revalidation and aborts pending replacement", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-03T01:00:00.000Z"));
    try {
      const pastSlot = {
        id: 701,
        shopId: 16,
        technicianProfileId: null,
        startsAt: new Date("2026-09-03T01:00:00.000Z"),
        endsAt: new Date("2026-09-03T02:00:00.000Z"),
        capacity: 1,
        bookedCount: 0,
        status: "AVAILABLE"
      };
      const scheduleFindFirst = jest
        .fn()
        .mockResolvedValueOnce(pastSlot)
        .mockResolvedValueOnce(null);
      const cancelPending = jest.fn().mockResolvedValue({ count: 1 });
      const releasePendingSlot = jest.fn().mockResolvedValue({ count: 1 });
      const createOrder = jest.fn();
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 101 }]),
        customerProfile: {
          findFirst: jest.fn().mockResolvedValue({ membershipLevel: "standard" })
        },
        shop: { update: jest.fn().mockResolvedValue({ id: 16 }) },
        scheduleSlot: {
          findUnique: jest.fn().mockResolvedValue({ deletedAt: null }),
          findFirst: scheduleFindFirst,
          updateMany: releasePendingSlot
        },
        bookingOrder: {
          findMany: jest.fn().mockResolvedValue([{ id: 501, scheduleSlotId: 601 }]),
          updateMany: cancelPending,
          create: createOrder
        }
      };
      const repository = new BookingRepository({
        $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
      } as never);

      await expect(
        repository.createBooking({
          customerUserId: 101,
          serviceId: 31,
          scheduleSlotId: 701,
fulfillmentMode: "store",
serviceLocation: { source: "SHOP_LOCATION" }
        })
      ).resolves.toBeNull();

      const expectedFutureGuard = { gt: new Date("2026-09-03T01:00:00.000Z") };
      expect(scheduleFindFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ startsAt: expectedFutureGuard })
        })
      );
      expect(scheduleFindFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ startsAt: expectedFutureGuard })
        })
      );
      expect(cancelPending).toHaveBeenCalledTimes(1);
      expect(releasePendingSlot).toHaveBeenCalledTimes(1);
      expect(createOrder).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("replaces only the ordinary pending order while retaining the Exchange-linked pending order", async () => {
    const harness = createPendingReplacementHarness();
    const repository = new BookingRepository(harness.client as never);
    const invalidateSupersededAffiliate = jest.fn().mockResolvedValue(undefined);

    const result = await repository.createBooking(
      {
        customerUserId: 101,
        serviceId: 11,
        scheduleSlotId: 603,
fulfillmentMode: "store",
serviceLocation: { source: "SHOP_LOCATION" }
      },
      { invalidateSupersededAffiliate }
    );

    expect(result).toMatchObject({
      order: { id: 701, status: "pending", scheduleSlotId: 603 },
      supersededOrders: [{ order: { id: 501, status: "cancelled" } }]
    });
    expect(harness.state()).toMatchObject({
      orders: expect.arrayContaining([
        expect.objectContaining({ id: 501, status: "CANCELLED" }),
        expect.objectContaining({
          id: 502,
          status: "PENDING",
          exchangeMatchParticipant: { id: 81 }
        }),
        expect.objectContaining({ id: 701, status: "PENDING", scheduleSlotId: 603 })
      ]),
      slots: expect.arrayContaining([
        expect.objectContaining({ id: 601, bookedCount: 0, status: "AVAILABLE" }),
        expect.objectContaining({ id: 602, bookedCount: 1, status: "BOOKED" }),
        expect.objectContaining({ id: 603, bookedCount: 1, status: "AVAILABLE" })
      ]),
      statusHistory: [
        expect.objectContaining({
          bookingOrderId: 501,
          fromStatus: "PENDING",
          toStatus: "CANCELLED",
          reason: "superseded_by_new_pending_order"
        })
      ]
    });
    expect(invalidateSupersededAffiliate).toHaveBeenCalledWith(
      expect.objectContaining({ bookingOrderId: 501, actorUserId: 101 })
    );
  });

  it("replaces a pending order whose old schedule slot was already soft-deleted", async () => {
    const harness = createPendingReplacementHarness({ deletedPendingSlot: true });
    const repository = new BookingRepository(harness.client as never);

    const result = await repository.createBooking({
      customerUserId: 101,
      serviceId: 11,
      scheduleSlotId: 603,
      fulfillmentMode: "store",
      serviceLocation: { source: "SHOP_LOCATION" }
    });

    expect(result).toMatchObject({
      order: { id: 701, status: "pending", scheduleSlotId: 603 },
      supersededOrders: [{ order: { id: 501, status: "cancelled" } }]
    });
    expect(harness.state()).toMatchObject({
      orders: expect.arrayContaining([
        expect.objectContaining({ id: 501, status: "CANCELLED" }),
        expect.objectContaining({ id: 701, status: "PENDING", scheduleSlotId: 603 })
      ]),
      slots: expect.arrayContaining([
        expect.objectContaining({
          id: 601,
          bookedCount: 1,
          status: "BOOKED",
          deletedAt: new Date("2026-09-02T00:00:00.000Z")
        }),
        expect.objectContaining({ id: 603, bookedCount: 1 })
      ])
    });
  });

  it("rolls back all local replacement writes when a selected pending order gains an Exchange link", async () => {
    const harness = createPendingReplacementHarness({ linkAfterSelection: true });
    const repository = new BookingRepository(harness.client as never);
    const invalidateSupersededAffiliate = jest.fn().mockResolvedValue(undefined);
    const prepareAffiliate = jest.fn();
    const persistAffiliate = jest.fn();

    await expect(
      repository.createBooking(
        {
          customerUserId: 101,
          serviceId: 11,
          scheduleSlotId: 603,
fulfillmentMode: "store",
serviceLocation: { source: "SHOP_LOCATION" }
        },
        {
          invalidateSupersededAffiliate,
          prepareAffiliate,
          persistAffiliate
        }
      )
    ).rejects.toThrow("error.booking.pending_replacement_conflict");

    expect(harness.state()).toMatchObject({
      orders: expect.arrayContaining([
        expect.objectContaining({
          id: 501,
          status: "PENDING",
          exchangeMatchParticipant: { id: 82 }
        }),
        expect.objectContaining({
          id: 502,
          status: "PENDING",
          exchangeMatchParticipant: { id: 81 }
        })
      ]),
      slots: expect.arrayContaining([
        expect.objectContaining({ id: 601, bookedCount: 1, status: "BOOKED" }),
        expect.objectContaining({ id: 602, bookedCount: 1, status: "BOOKED" }),
        expect.objectContaining({ id: 603, bookedCount: 0, status: "AVAILABLE" })
      ]),
      statusHistory: []
    });
    expect(harness.state().orders).toHaveLength(2);
    expect(invalidateSupersededAffiliate).not.toHaveBeenCalled();
    expect(prepareAffiliate).not.toHaveBeenCalled();
    expect(persistAffiliate).not.toHaveBeenCalled();
  });

  it("applies customer, shop, and technician identity filters to Prisma", async () => {
    const bookingOrder = {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0)
    };
    const repository = new BookingRepository({ bookingOrder } as never);

    await repository.listOrders({
      customerUserId: 7,
      shopId: 11,
      technicianProfileId: 17,
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-12-01T00:00:00.000Z"),
      page: 1,
      pageSize: 20
    });

    expect(bookingOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          customerUserId: 7,
          shopId: 11,
          technicianProfileId: 17,
          startsAt: {
            gte: new Date("2026-09-01T00:00:00.000Z"),
            lt: new Date("2026-12-01T00:00:00.000Z")
          }
        }
      })
    );
    expect(bookingOrder.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        customerUserId: 7,
        shopId: 11,
        technicianProfileId: 17,
        startsAt: {
          gte: new Date("2026-09-01T00:00:00.000Z"),
          lt: new Date("2026-12-01T00:00:00.000Z")
        }
      }
    });
  });

  it("rejects the retired generic completion pair before opening a transaction", async () => {
    const transaction = jest.fn();
    const repository = new BookingRepository({ $transaction: transaction } as never);

    await expect(
      repository.transitionOrder({
        id: 1,
        actorUserId: 7,
        fromStatus: "inService",
        toStatus: "completed"
      } as never)
    ).resolves.toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not retry a formal order transition after a non-transient failure", async () => {
    const failure = new Error("validation failed");
    const transaction = jest.fn().mockRejectedValue(failure);
    const repository = new BookingRepository({ $transaction: transaction } as never);

    await expect(
      repository.transitionOrder({
        id: 1,
        actorUserId: 7,
        fromStatus: "confirmed",
        toStatus: "cancelled"
      })
    ).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("classifies a cancellation only when the transition actor is the assigned technician user", async () => {
    const tx = createCancellationTransaction();
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(
      repository.transitionOrder({
        id: 701,
        actorUserId: 707,
        fromStatus: "pending",
        toStatus: "cancelled",
        reason: "技师临时无法到达"
      })
    ).resolves.toMatchObject({ status: "cancelled" });

    expect(tx.orderPerformanceAssessment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingOrderId: 701,
        technicianProfileId: 31,
        outcome: "TECHNICIAN_CANCELLED",
        treatment: "COUNTED"
      })
    });
    expect(tx.orderPerformanceAssessmentRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CLASSIFY_TECHNICIAN_CANCELLED",
        publicReason: "技师临时无法到达"
      }),
      select: { id: true }
    });
    expect(tx.technicianPerformanceSummary.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["customer", 101],
    ["shop", 202],
    ["platform", 303]
  ])("does not classify a %s-initiated cancellation", async (_actorType, actorUserId) => {
    const tx = createCancellationTransaction();
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await repository.transitionOrder({
      id: 701,
      actorUserId,
      fromStatus: "pending",
      toStatus: "cancelled",
      reason: "取消"
    });

    expect(tx.orderPerformanceAssessment.create).not.toHaveBeenCalled();
    expect(tx.orderPerformanceAssessmentRevision.create).not.toHaveBeenCalled();
    expect(tx.technicianPerformanceSummary.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["PENDING", undefined],
    ["CONFIRMED", "REFUND_PENDING"]
  ] as const)(
    "commits a confirmed cancellation with %s payment through the shared settlement transaction",
    async (paymentStatus, expectedPaymentStatus) => {
      const tx = createCancellationTransaction();
      const current = {
        ...makeTransitionOrderRecord("CONFIRMED"),
        paymentStatus,
        exchangeMatchParticipant: null
      };
      const next = {
        ...makeTransitionOrderRecord("CANCELLED"),
        paymentStatus: expectedPaymentStatus ?? paymentStatus,
        exchangeMatchParticipant: null
      };
      tx.bookingOrder.findFirst = jest
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(next);
      const settle = jest.fn().mockResolvedValue(undefined);
      const repository = new BookingRepository({
        $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
      } as never);

      await expect(
        repository.transitionOrderWithScheduleGuard(
          {
            id: 701,
            actorUserId: 202,
            actor: { userId: 202, identityId: 16, identityType: "merchant_owner" },
            fromStatus: "confirmed",
            toStatus: "cancelled",
            reason: "商户无法履约"
          },
          { settle }
        )
      ).resolves.toMatchObject({ outcome: "ok", order: { status: "cancelled" } });

      expect(tx.bookingOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 701, deletedAt: null, status: "CONFIRMED" },
        data: {
          status: "CANCELLED",
          cancelReason: "商户无法履约",
          paymentStatus: expectedPaymentStatus
        }
      });
      expect(tx.scheduleSlot.updateMany).toHaveBeenCalledWith({
        where: { id: 501, bookedCount: { gt: 0 } },
        data: { bookedCount: { decrement: 1 }, status: "AVAILABLE" }
      });
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          bookingOrderId: 701,
          fromStatus: "CONFIRMED",
          toStatus: "CANCELLED",
          actorUserId: 202,
          reason: "商户无法履约",
          metadata: {
            actor: {
              identityId: 16,
              identityType: "merchant_owner",
              source: "merchant",
              displayName: "Eason"
            }
          }
        }
      });
      expect(settle).toHaveBeenCalledWith({
        transactionClient: tx,
        order: expect.objectContaining({ id: 701 })
      });
      expect(tx.orderPerformanceAssessment.create).not.toHaveBeenCalled();
    }
  );

  it("persists and projects the authenticated merchant identity for a cancellation", async () => {
    const tx = createCancellationTransaction();
    const current = makeTransitionOrderRecord("CONFIRMED");
    const next = {
      ...makeTransitionOrderRecord("CANCELLED"),
      statusHistory: [{
        id: 91,
        bookingOrderId: 701,
        fromStatus: "CONFIRMED",
        toStatus: "CANCELLED",
        actorUserId: 202,
        actor: { username: "Eason", avatarUrl: null, avatarBootstrapUrl: null },
        reason: null,
        metadata: {
          actor: {
            identityId: 16,
            identityType: "merchant_owner",
            source: "merchant",
            displayName: "Eason"
          }
        },
        createdAt: new Date("2026-09-20T13:24:00.000Z")
      }]
    };
    tx.bookingOrder.findFirst = jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(next);
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    const result = await repository.transitionOrderWithScheduleGuard({
      id: 701,
      actorUserId: 202,
      actor: { userId: 202, identityId: 16, identityType: "merchant_owner" },
      fromStatus: "confirmed",
      toStatus: "cancelled"
    });

    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          actor: {
            identityId: 16,
            identityType: "merchant_owner",
            source: "merchant",
            displayName: "Eason"
          }
        }
      })
    });
    expect(result).toMatchObject({
      outcome: "ok",
      order: {
        timelineEvents: [expect.objectContaining({
          type: "ORDER_STATUS_CHANGED",
          actorIdentityId: 16,
          actorSource: "merchant",
          actorDisplayName: "Eason"
        })]
      }
    });
  });

  it("returns an active acceptance pause before mutating or settling a confirmation", async () => {
    const settle = jest.fn();
    const updateMany = jest.fn();
    const startsAt = new Date("2026-08-29T01:00:00.000Z");
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 16 }])
        .mockResolvedValueOnce([]),
      bookingOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 101,
          status: "PENDING",
          shopId: 16,
          technicianProfileId: 47
        }),
        updateMany
      },
      orderAcceptancePause: {
        findMany: jest.fn().mockResolvedValue([
          {
            subjectType: "SHOP",
            authorityType: "OPERATIONS",
            reasonCode: "insufficient_ndp",
            startsAt
          }
        ])
      },
      technicianShopAffiliation: { findFirst: jest.fn().mockResolvedValue({ id: 701 }) },
      technicianProfile: { update: jest.fn() }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(
      repository.transitionOrderWithScheduleGuard(
        {
          id: 101,
          actorUserId: 7,
          fromStatus: "pending",
          toStatus: "confirmed"
        },
        { settle }
      )
    ).resolves.toEqual({
      outcome: "acceptance_paused",
      pauses: [
        {
          subjectType: "shop",
          authorityType: "operations",
          reasonCode: "insufficient_ndp",
          startsAt
        }
      ]
    });

    expect(updateMany).not.toHaveBeenCalled();
    expect(tx.technicianProfile.update).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it("rejects order confirmation when the assigned technician has no active shop affiliation", async () => {
    const settle = jest.fn();
    const updateMany = jest.fn();
    const tx = {
      bookingOrder: {
        findFirst: jest.fn().mockResolvedValue({ id: 101, status: "PENDING", shopId: 16, technicianProfileId: 47 }),
        updateMany
      },
      technicianShopAffiliation: { findFirst: jest.fn().mockResolvedValue(null) },
      orderAcceptancePause: { findMany: jest.fn() }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(repository.transitionOrderWithScheduleGuard({
      id: 101,
      actorUserId: 707,
      actor: { userId: 707, identityId: 61, identityType: "technician" },
      fromStatus: "pending",
      toStatus: "confirmed"
    }, { settle })).resolves.toEqual({ outcome: "invalid_state" });
    expect(tx.orderAcceptancePause.findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it("locks the technician and rejects a concurrent confirmed overlap before mutation", async () => {
    const settle = jest.fn();
    const updateMany = jest.fn();
    const technicianUpdate = jest.fn().mockResolvedValue({ id: 47 });
    const bookingFindFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 101,
        status: "PENDING",
        shopId: 16,
        technicianProfileId: 47,
        scheduleSlotId: 201,
        startsAt: new Date("2026-08-29T13:00:00.000Z"),
        endsAt: new Date("2026-08-29T15:00:00.000Z")
      })
      .mockResolvedValueOnce({ id: 102 });
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 16 }])
        .mockResolvedValueOnce([]),
      bookingOrder: { findFirst: bookingFindFirst, updateMany },
      technicianShopAffiliation: { findFirst: jest.fn().mockResolvedValue({ id: 701 }) },
      orderAcceptancePause: { findMany: jest.fn().mockResolvedValue([]) },
      technicianProfile: { update: technicianUpdate }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(
      repository.transitionOrderWithScheduleGuard(
        {
          id: 101,
          actorUserId: 7,
          fromStatus: "pending",
          toStatus: "confirmed"
        },
        { settle }
      )
    ).resolves.toEqual({ outcome: "schedule_conflict" });

    expect(technicianUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 47 } }));
    expect(bookingFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 101 },
          technicianProfileId: 47,
          status: { in: ["CONFIRMED", "IN_SERVICE"] }
        })
      })
    );
    expect(updateMany).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it("treats an overlapping Exchange match participant as a confirmation conflict", async () => {
    const settle = jest.fn();
    const updateMany = jest.fn();
    const current = {
      id: 101,
      status: "PENDING",
      shopId: 16,
      technicianProfileId: 47,
      scheduleSlotId: 201,
      startsAt: new Date("2026-08-29T13:00:00.000Z"),
      endsAt: new Date("2026-08-29T15:00:00.000Z")
    };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 16 }])
        .mockResolvedValueOnce([]),
      bookingOrder: {
        findFirst: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(null),
        updateMany
      },
      technicianShopAffiliation: { findFirst: jest.fn().mockResolvedValue({ id: 701 }) },
      exchangeMatchParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: 71 })
      },
      orderAcceptancePause: { findMany: jest.fn().mockResolvedValue([]) },
      technicianProfile: { update: jest.fn().mockResolvedValue({ id: 47 }) }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(
      repository.transitionOrderWithScheduleGuard(
        {
          id: 101,
          actorUserId: 7,
          fromStatus: "pending",
          toStatus: "confirmed"
        },
        { settle }
      )
    ).resolves.toEqual({ outcome: "schedule_conflict" });
    expect(tx.exchangeMatchParticipant.findFirst).toHaveBeenCalledWith({
      where: {
        technicianProfileId: 47,
        estimatedStartsAt: { lt: current.endsAt },
        estimatedEndsAt: { gt: current.startsAt },
        activeReservationKey: { not: null },
        deletedAt: null
      },
      select: { id: true }
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it("rejects generic cancellation of an Exchange-linked order before all writes", async () => {
    const current = {
      ...makeTransitionOrderRecord("PENDING"),
      exchangeMatchParticipant: { id: 71 }
    };
    const orderUpdate = jest.fn();
    const slotUpdate = jest.fn();
    const historyCreate = jest.fn();
    const tx = {
      bookingOrder: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: orderUpdate
      },
      scheduleSlot: { updateMany: slotUpdate },
      orderStatusHistory: { create: historyCreate }
    };
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await expect(
      repository.transitionOrderWithScheduleGuard({
        id: 701,
        actorUserId: 101,
        fromStatus: "pending",
        toStatus: "cancelled",
        reason: "changed mind"
      })
    ).resolves.toEqual({ outcome: "exchange_cancellation_required" });

    expect(orderUpdate).not.toHaveBeenCalled();
    expect(slotUpdate).not.toHaveBeenCalled();
    expect(historyCreate).not.toHaveBeenCalled();
  });

  it("merges public performance revisions into a stable timeline without exposing internal notes", async () => {
    const order = {
      ...makeTransitionOrderRecord("CANCELLED"),
      statusHistory: [
        {
          id: 11,
          bookingOrderId: 701,
          fromStatus: null,
          toStatus: "PENDING",
          actorUserId: 101,
          reason: null,
          createdAt: new Date("2026-09-01T03:00:00.000Z")
        },
        {
          id: 12,
          bookingOrderId: 701,
          fromStatus: "PENDING",
          toStatus: "CANCELLED",
          actorUserId: 707,
          reason: "技师临时无法到达",
          createdAt: new Date("2026-09-01T04:00:00.000Z")
        }
      ],
      performanceAssessment: {
        id: 81,
        bookingOrderId: 701,
        technicianProfileId: 31,
        outcome: "TECHNICIAN_CANCELLED",
        treatment: "COUNTED",
        version: 3,
        currentRevisionId: 93,
        createdAt: new Date("2026-09-01T04:00:00.000Z"),
        updatedAt: new Date("2026-09-01T06:00:00.000Z")
      },
      performanceRevisions: [
        {
          id: 91,
          action: "CLASSIFY_TECHNICIAN_CANCELLED",
          actorUserId: 707,
          publicReason: "技师临时无法到达",
          createdAt: new Date("2026-09-01T04:00:00.000Z")
        },
        {
          id: 92,
          action: "APPLY_SPECIAL_EXCLUSION",
          actorUserId: 9,
          publicReason: "已核实不可抗力",
          createdAt: new Date("2026-09-01T05:00:00.000Z")
        },
        {
          id: 93,
          action: "REVOKE_SPECIAL_EXCLUSION",
          actorUserId: 10,
          publicReason: "用户投诉后复核恢复计入",
          createdAt: new Date("2026-09-01T06:00:00.000Z")
        }
      ]
    };
    const findFirst = jest.fn().mockResolvedValue(order);
    const repository = new BookingRepository({ bookingOrder: { findFirst } } as never);

    const result = await repository.findOrderById(701);

    expect(result?.statusHistory).toEqual([
      expect.objectContaining({ id: 11, toStatus: "pending" }),
      expect.objectContaining({ id: 12, toStatus: "cancelled" })
    ]);
    expect(result?.customer).toEqual({
      userId: 101,
      profileId: 17,
      publicId: "u0000000101",
      displayName: "预约用户 山田",
      avatarUrl: "/uploads/customers/101.jpg",
      membershipLevel: "premium",
      ratingAverage: "4.80",
      reviewCount: 12
    });
    expect(result?.performanceAssessment).toMatchObject({
      outcome: "technician_cancelled",
      treatment: "counted",
      version: 3
    });
    expect(result?.timelineEvents).toEqual([
      expect.objectContaining({ id: "status:11", type: "ORDER_STATUS_CHANGED" }),
      expect.objectContaining({ id: "performance:91", type: "TECHNICIAN_CANCEL_CLASSIFIED" }),
      expect.objectContaining({ id: "status:12", type: "ORDER_STATUS_CHANGED" }),
      expect.objectContaining({ id: "performance:92", type: "SPECIAL_CANCELLATION_APPLIED" }),
      expect.objectContaining({ id: "performance:93", type: "SPECIAL_CANCELLATION_REVOKED" })
    ]);
    expect(JSON.stringify(result?.timelineEvents)).not.toContain("internalNote");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          performanceRevisions: expect.objectContaining({
            select: expect.not.objectContaining({ internalNote: expect.anything() })
          })
        })
      })
    );
  });

  it("projects only a structurally valid fulfillment address snapshot", async () => {
    const order = {
      ...makeTransitionOrderRecord("PENDING"),
      fulfillmentAddressSnapshot: {
        line1: "東京都渋谷区",
        line2: "神南1-2-3",
        line3: 99,
        privateNote: "do not expose"
      }
    };
    const repository = new BookingRepository({
      bookingOrder: { findFirst: jest.fn().mockResolvedValue(order) }
    } as never);

    await expect(repository.findOrderById(701)).resolves.toMatchObject({
      fulfillmentAddressSnapshot: {
        line1: "東京都渋谷区",
        line2: "神南1-2-3",
        line3: null
      }
    });
  });

  it("omits fulfillment addresses from non-detail order list projections", async () => {
    const order = {
      ...makeTransitionOrderRecord("PENDING"),
      fulfillmentAddressSnapshot: {
        line1: "東京都渋谷区",
        line2: "神南1-2-3",
        line3: null
      }
    };
    const repository = new BookingRepository({
      bookingOrder: {
        findMany: jest.fn().mockResolvedValue([order]),
        count: jest.fn().mockResolvedValue(1)
      }
    } as never);

    await expect(repository.listOrders({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: [{ fulfillmentAddressSnapshot: null }]
    });
  });

  it.each([
    [
      "the persisted order total before checkout",
      { status: "CONFIRMED", paymentAmountJpy: 8_000, checkout: null },
      8_000
    ],
    [
      "the checkout total while settlement is pending",
      {
        status: "AWAITING_CHECKOUT",
        paymentAmountJpy: 8_000,
        checkout: {
          checkoutAmountJpy: 14_500,
          payableNdp: 14_500,
          paymentMethod: null,
          otherMethodCode: null,
          otherMethodLabel: null,
          deletedAt: null,
          ledgerTransaction: null
        }
      },
      14_500
    ],
    [
      "the completed checkout total instead of mutable service income",
      {
        status: "COMPLETED",
        paymentAmountJpy: 8_000,
        checkout: {
          checkoutAmountJpy: 14_500,
          payableNdp: 14_500,
          paymentMethod: "NDP",
          otherMethodCode: null,
          otherMethodLabel: null,
          deletedAt: null,
          ledgerTransaction: { currency: "NDP", deletedAt: null }
        }
      },
      14_500
    ],
    [
      "the persisted payment total after checkout is retired",
      {
        status: "CANCELLED",
        paymentAmountJpy: 14_500,
        checkout: {
          checkoutAmountJpy: 14_000,
          payableNdp: 14_000,
          paymentMethod: "NDP",
          otherMethodCode: null,
          otherMethodLabel: null,
          ledgerTransaction: null,
          deletedAt: new Date("2026-09-10T03:00:00.000Z")
        }
      },
      14_500
    ]
  ])("projects %s for customer order lists", async (_label, amountState, expectedAmountJpy) => {
    const order = {
      ...makeTransitionOrderRecord("COMPLETED"),
      priceAmount: 8_000,
      ...amountState
    };
    const repository = new BookingRepository({
      bookingOrder: {
        findMany: jest.fn().mockResolvedValue([order]),
        count: jest.fn().mockResolvedValue(1)
      }
    } as never);

    await expect(repository.listOrders({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: [{ paymentAmountJpy: expectedAmountJpy, priceAmount: "8000.00" }]
    });
  });

  it("keeps checkout payment selection nullable and carries a custom method label", async () => {
    const order = {
      ...makeTransitionOrderRecord("COMPLETED"),
      checkout: {
        checkoutAmountJpy: 14_500,
        payableNdp: 0,
        paymentMethod: "OTHER",
        otherMethodCode: "paypay",
        otherMethodLabel: "PayPay",
        deletedAt: null,
        ledgerTransaction: null
      }
    };
    const repository = new BookingRepository({
      bookingOrder: {
        findMany: jest.fn().mockResolvedValue([order]),
        count: jest.fn().mockResolvedValue(1)
      }
    } as never);

    await expect(repository.listOrders({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: [{
        paymentMethod: "onsite",
        effectivePaymentMethod: "other",
        otherMethodCode: "paypay",
        otherMethodLabel: "PayPay"
      }]
    });
  });

  it("keeps an effective shop service on the fast rebook checkout path", async () => {
    const order = {
      ...makeTransitionOrderRecord("COMPLETED"),
      service: {
        id: 11,
        shopId: 16,
        status: "published",
        deletedAt: null,
        category: { isActive: true, deletedAt: null }
      },
      shop: {
        id: 16,
        name: "LifeDance",
        status: "published",
        pricingMode: "MERCHANT",
        deletedAt: null,
        publicIdentifier: { kind: "SHOP", status: "ACTIVE", deletedAt: null },
        entitySuspensions: []
      }
    };
    const repository = new BookingRepository({
      bookingOrder: {
        findMany: jest.fn().mockResolvedValue([order]),
        count: jest.fn().mockResolvedValue(1)
      }
    } as never);

    await expect(repository.listOrders({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: [{
        serviceId: 11,
        serviceNameSnapshot: "肩颈调理",
        rebook: {
          action: "checkout",
          serviceType: "shop_service",
          serviceId: 11,
          shopId: 16,
          technicianProfileId: 31,
          fulfillmentMode: "store"
        }
      }]
    });
  });

  it("keeps an effective technician service on checkout with its current shop and technician context", async () => {
    const order = {
      ...makeTransitionOrderRecord("COMPLETED"),
      serviceId: null,
      technicianServiceId: 77,
      service: null,
      technicianService: {
        id: 77,
        shopId: 16,
        technicianId: 31,
        isActive: true,
        isBookable: true,
        reviewStatus: "APPROVED",
        deletedAt: null,
        category: { isActive: true, deletedAt: null },
        technicianProfile: {
          status: "published",
          visibility: "public",
          deletedAt: null,
          user: {
            isActive: true,
            deletedAt: null,
            identities: [{
              type: "technician",
              isActive: true,
              deletedAt: null,
              publicIdentifier: { kind: "S", status: "ACTIVE", deletedAt: null }
            }]
          },
          technicianShopAffiliations: [{
            shopId: 16,
            workStatus: "ACTIVE",
            activeKey: "technician:31:shop:16",
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
            endsAt: null,
            deletedAt: null
          }]
        }
      },
      shop: {
        id: 16,
        name: "LifeDance",
        status: "published",
        pricingMode: "TECHNICIAN",
        deletedAt: null,
        publicIdentifier: { kind: "SHOP", status: "ACTIVE", deletedAt: null },
        entitySuspensions: []
      }
    };
    const repository = new BookingRepository({
      bookingOrder: {
        findMany: jest.fn().mockResolvedValue([order]),
        count: jest.fn().mockResolvedValue(1)
      }
    } as never);

    await expect(repository.listOrders({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: [{
        rebook: {
          action: "checkout",
          serviceType: "technician_service",
          serviceId: 77,
          shopId: 16,
          technicianProfileId: 31,
          fulfillmentMode: "store"
        }
      }]
    });
  });

  it("routes a stopped historical service to the still-effective original shop service list", async () => {
    const order = {
      ...makeTransitionOrderRecord("COMPLETED"),
      service: {
        id: 11,
        shopId: 16,
        status: "stopped",
        deletedAt: null,
        category: { isActive: true, deletedAt: null }
      },
      shop: {
        id: 16,
        name: "LifeDance",
        status: "published",
        pricingMode: "MERCHANT",
        deletedAt: null,
        publicIdentifier: { kind: "SHOP", status: "ACTIVE", deletedAt: null },
        entitySuspensions: []
      }
    };
    const repository = new BookingRepository({
      bookingOrder: {
        findMany: jest.fn().mockResolvedValue([order]),
        count: jest.fn().mockResolvedValue(1)
      }
    } as never);

    await expect(repository.listOrders({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: [{
        serviceId: 11,
        serviceNameSnapshot: "肩颈调理",
        rebook: {
          action: "select_service",
          shopId: 16,
          reason: "original_service_unavailable"
        }
      }]
    });
  });

  it.each([
    ["unpublished", { status: "closed", deletedAt: null }],
    ["deleted", { status: "published", deletedAt: new Date("2026-09-10T00:00:00.000Z") }]
  ])("disables direct rebooking when the original shop is %s", async (_label, shopState) => {
    const order = {
      ...makeTransitionOrderRecord("COMPLETED"),
      service: {
        id: 11,
        shopId: 16,
        status: "published",
        deletedAt: null,
        category: { isActive: true, deletedAt: null }
      },
      shop: {
        id: 16,
        name: "LifeDance",
        pricingMode: "MERCHANT",
        publicIdentifier: { kind: "SHOP", status: "ACTIVE", deletedAt: null },
        entitySuspensions: [],
        ...shopState
      }
    };
    const repository = new BookingRepository({
      bookingOrder: {
        findMany: jest.fn().mockResolvedValue([order]),
        count: jest.fn().mockResolvedValue(1)
      }
    } as never);

    await expect(repository.listOrders({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      list: [{
        serviceId: 11,
        serviceNameSnapshot: "肩颈调理",
        rebook: { action: "unavailable", reason: "shop_unavailable" }
      }]
    });
  });
});
