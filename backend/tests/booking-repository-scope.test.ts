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

describe("BookingRepository order list scope", () => {
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

  it("rejects a partial affiliate hook pair before opening the booking transaction", async () => {
    const client = { $transaction: jest.fn().mockResolvedValue(null) };
    const repository = new BookingRepository(client as never);

    await expect(
      repository.createBooking(
        {
          customerUserId: 7,
          serviceId: 1,
          scheduleSlotId: 11,
          fulfillmentMode: "store"
        },
        {
          prepareAffiliate: jest.fn()
        }
      )
    ).rejects.toThrow("error.affiliate.checkout_hook_invalid");
    expect(client.$transaction).not.toHaveBeenCalled();
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

  it("retries a formal order transition after a Prisma deadlock conflict", async () => {
    const deadlock = Object.assign(new Error("Transaction failed due to a write conflict"), {
      code: "P2034"
    });
    const transaction = jest.fn().mockRejectedValueOnce(deadlock).mockResolvedValueOnce(null);
    const repository = new BookingRepository({ $transaction: transaction } as never);

    await expect(
      repository.transitionOrder({
        id: 1,
        actorUserId: 7,
        fromStatus: "inService",
        toStatus: "completed"
      })
    ).resolves.toBeNull();
    expect(transaction).toHaveBeenCalledTimes(2);
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

  it("rebuilds the assigned technician summary when an order completes", async () => {
    const tx = createCancellationTransaction();
    tx.bookingOrder.findFirst
      .mockReset()
      .mockResolvedValueOnce(makeTransitionOrderRecord("IN_SERVICE"))
      .mockResolvedValueOnce(makeTransitionOrderRecord("COMPLETED"));
    tx.bookingOrder.count.mockResolvedValue(1);
    tx.orderPerformanceAssessment.groupBy.mockResolvedValue([]);
    const repository = new BookingRepository({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    } as never);

    await repository.transitionOrder({
      id: 701,
      actorUserId: 707,
      fromStatus: "inService",
      toStatus: "completed"
    });

    expect(tx.technicianPerformanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          technicianProfileId: 31,
          completedOrderCount: 1,
          acceptanceRateBps: 10_000
        })
      })
    );
    expect(tx.orderPerformanceAssessment.create).not.toHaveBeenCalled();
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
});
