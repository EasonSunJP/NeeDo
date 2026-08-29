import { readFileSync } from "node:fs";
import { BookingRepository } from "../src/repositories/booking.repository";

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
});
