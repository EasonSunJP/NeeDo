import { BookingRepository } from "../src/repositories/booking.repository";

describe("BookingRepository order list scope", () => {
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

    expect(bookingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
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
    }));
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
});
