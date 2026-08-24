import { BookingRepository } from "../src/repositories/booking.repository";

describe("BookingRepository order list scope", () => {
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
