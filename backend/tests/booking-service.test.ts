import { ERROR_CODES } from "../src/constants/error-codes";
import type { BookingOrderPayload, BookingRepositoryPort } from "../src/repositories/booking.repository";
import { BookingService } from "../src/services/booking.service";

const now = new Date("2026-05-25T00:00:00.000Z");
const actor = { userId: 1, roles: ["customer"] };

const makeOrder = (status: BookingOrderPayload["status"]): BookingOrderPayload => ({
  id: 1,
  orderNo: "ND202605260001",
  orderType: "booking",
  status,
  paymentStatus: "unpaid",
  customerUserId: 1,
  serviceId: 1,
  shopId: 1,
  technicianProfileId: 1,
  scheduleSlotId: 11,
  fulfillmentMode: "store",
  serviceName: "Shiatsu Recovery",
  shopName: "Aoyama Care Studio",
  technicianName: "Mika Tanaka",
  priceAmount: "8800.00",
  currency: "JPY",
  startsAt: new Date("2026-05-26T01:00:00.000Z"),
  endsAt: new Date("2026-05-26T02:00:00.000Z"),
  note: null,
  cancelReason: null,
  createdAt: now,
  updatedAt: now,
  statusHistory: [
    {
      id: 1,
      orderId: 1,
      fromStatus: null,
      toStatus: status,
      actorUserId: 1,
      reason: null,
      createdAt: now
    }
  ]
});

const createRepository = (order: BookingOrderPayload | null): jest.Mocked<BookingRepositoryPort> =>
  ({
    listAvailableSlots: jest.fn(),
    createBooking: jest.fn(async () => order),
    listOrders: jest.fn(),
    findOrderById: jest.fn(async () => order),
    transitionOrder: jest.fn(async (input) =>
      order
        ? {
            ...order,
            status: input.toStatus,
            statusHistory: [
              ...order.statusHistory,
              {
                id: 2,
                orderId: order.id,
                fromStatus: input.fromStatus,
                toStatus: input.toStatus,
                actorUserId: input.actorUserId,
                reason: input.reason ?? null,
                createdAt: now
              }
            ]
          }
        : null
    )
  }) as unknown as jest.Mocked<BookingRepositoryPort>;

describe("BookingService state machine", () => {
  it("rejects booking creation when the repository reports an unavailable slot", async () => {
    const repository = createRepository(null);
    const service = new BookingService(repository);

    await expect(
      service.createBooking(actor, {
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
      message: "error.booking.slot_unavailable"
    });
  });

  it("allows confirmed orders to start service and blocks cancelling completed orders", async () => {
    const repository = createRepository(makeOrder("confirmed"));
    const service = new BookingService(repository);

    const started = await service.transitionOrder(actor, 1, "start");

    expect(started.status).toBe("inService");
    expect(repository.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: "confirmed",
        toStatus: "inService"
      })
    );

    const completedService = new BookingService(createRepository(makeOrder("completed")));
    await expect(completedService.transitionOrder(actor, 1, "cancel", "too late")).rejects.toMatchObject({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message: "error.order.invalid_transition"
    });
  });
});
