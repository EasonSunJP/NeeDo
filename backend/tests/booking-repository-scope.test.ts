import { readFileSync } from "node:fs";
import { BookingRepository } from "../src/repositories/booking.repository";

const makeTransitionOrderRecord = (
  status: "PENDING" | "IN_SERVICE" | "COMPLETED" | "CANCELLED"
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
  deletedAt: null,
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

const createPendingReplacementHarness = (options: { linkAfterSelection?: boolean } = {}) => {
  let committed: PendingReplacementHarnessState = {
    orders: [
      makePendingReplacementOrder(501, 601, null),
      makePendingReplacementOrder(502, 602, { id: 81 })
    ],
    slots: [
      makeReplacementSlot(601, 1, "BOOKED"),
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
    shop: { update: jest.fn().mockResolvedValue({ id: 16 }) },
    scheduleSlot: {
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

  it("creates an affiliated merchant plan as shop-private and limits plan overlap to that shop", async () => {
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
      bookingOrder: { findFirst: jest.fn().mockResolvedValue(null) },
      availability: { create: availabilityCreate }
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

    expect(scheduleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: 16, technicianProfileId: 47 })
      })
    );
    expect(availabilityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: "SHOP",
        visibility: "SHOP_ONLY"
      })
    });
  });

  it("publishes technician-owned availability to affiliated shops", async () => {
    const source = readFileSync(
      require.resolve("../src/repositories/booking.repository.ts"),
      "utf8"
    );

    expect(source).toContain('input.scope === "technician" ? "TECHNICIAN" : "SHOP"');
    expect(source).toContain('input.scope === "technician" ? "AFFILIATED_SHOPS" : "SHOP_ONLY"');
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
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0)
    };
    const repository = new BookingRepository({ scheduleSlot } as never);

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
      startsAt: { gte: new Date("2026-08-31T15:00:00.000Z") },
      endsAt: { lte: new Date("2026-10-01T15:00:00.000Z") },
      shop: {
        deletedAt: null,
        status: "published",
        entitySuspensions: {
          none: { activeKey: { not: null }, status: "active", deletedAt: null }
        }
      }
    });
    expect(scheduleSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere
      })
    );
    expect(scheduleSlot.count).toHaveBeenCalledWith({ where: expectedWhere });
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
    const repository = new BookingRepository({ scheduleSlot } as never);

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
        startsAt: { gte: new Date("2026-09-02T15:00:00.000Z") },
        endsAt: { lte: new Date("2026-09-03T15:00:00.000Z") },
        service: { deletedAt: null, status: "published" },
        shop: expect.objectContaining({ deletedAt: null, status: "published" })
      })
    );
    expect(scheduleSlot.count).toHaveBeenCalledWith({ where });
  });

  it("rejects a partial affiliate hook pair before opening the booking transaction", async () => {
    const client = { $transaction: jest.fn().mockResolvedValue(null) };
    const repository = new BookingRepository(client as never);

    await expect(
      repository.createBooking(
        {
          customerUserId: 7,
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
});
