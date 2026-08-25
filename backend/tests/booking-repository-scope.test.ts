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
      page: 1,
      pageSize: 20
    });

    expect(bookingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deletedAt: null,
        customerUserId: 7,
        shopId: 11,
        technicianProfileId: 17
      }
    }));
    expect(bookingOrder.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        customerUserId: 7,
        shopId: 11,
        technicianProfileId: 17
      }
    });
  });
});
