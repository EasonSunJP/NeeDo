import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  BookingOrderPayload,
  BookingRepositoryPort
} from "../src/repositories/booking.repository";
import type { BookingLedgerSettlementPort } from "../src/services/ledger.service";
import type { OrderStatusNotificationPort } from "../src/services/realtime.service";
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
  technicianServiceId: null,
  shopId: 1,
  technicianProfileId: 1,
  scheduleSlotId: 11,
  fulfillmentMode: "store",
  serviceName: "Shiatsu Recovery",
  pricingModeSnapshot: "merchant",
  serviceOwnerType: "shop",
  serviceOwnerId: 1,
  serviceNameSnapshot: "Shiatsu Recovery",
  servicePriceSnapshot: "8800.00",
  serviceDurationSnapshot: 60,
  serviceSnapshot: null,
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
    transitionOrder: jest.fn(async (input, options) => {
      if (!order) {
        return null;
      }

      const nextOrder = {
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
      };

      await options?.settle?.({ transactionClient: {}, order: nextOrder });

      return nextOrder;
    })
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

  it("passes technician service booking requests to the repository", async () => {
    const repository = createRepository(makeOrder("pending"));
    const service = new BookingService(repository);

    await service.createBooking(actor, {
      technicianServiceId: 21,
      scheduleSlotId: 11,
      fulfillmentMode: "store"
    });

    expect(repository.createBooking).toHaveBeenCalledWith({
      customerUserId: 1,
      technicianServiceId: 21,
      scheduleSlotId: 11,
      fulfillmentMode: "store",
      note: undefined
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
      }),
      {}
    );

    const completedService = new BookingService(createRepository(makeOrder("completed")));
    await expect(
      completedService.transitionOrder(actor, 1, "cancel", "too late")
    ).rejects.toMatchObject({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message: "error.order.invalid_transition"
    });
  });

  it("settles ledger side effects when confirming, cancelling, and completing booking orders", async () => {
    const ledgerService: jest.Mocked<BookingLedgerSettlementPort> = {
      freezeBookingAcceptance: jest.fn(async (input, context) => {
        void input;
        void context;
        return undefined;
      }),
      releaseBookingHold: jest.fn(async (input, context) => {
        void input;
        void context;
        return undefined;
      }),
      settleBookingCompletion: jest.fn(async (input, context) => {
        void input;
        void context;
        return undefined;
      }),
      compensateCustomerForMerchantCancellation: jest.fn(async (input, context) => {
        void input;
        void context;
        return undefined;
      })
    };
    const providerActor = { userId: 2, roles: ["merchant_owner"] };

    await new BookingService(createRepository(makeOrder("pending")), ledgerService).transitionOrder(
      providerActor,
      1,
      "confirm"
    );
    expect(ledgerService.freezeBookingAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingOrderId: 1,
        shopId: 1,
        actorUserId: 2
      }),
      expect.anything()
    );

    await new BookingService(
      createRepository(makeOrder("inService")),
      ledgerService
    ).transitionOrder(providerActor, 1, "complete");
    expect(ledgerService.settleBookingCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingOrderId: 1,
        shopId: 1,
        customerUserId: 1,
        actorUserId: 2
      }),
      expect.anything()
    );

    await new BookingService(
      createRepository(makeOrder("confirmed")),
      ledgerService
    ).transitionOrder(actor, 1, "cancel", "customer changed plan");
    expect(ledgerService.releaseBookingHold).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingOrderId: 1,
        shopId: 1,
        actorUserId: 1
      }),
      expect.anything()
    );

    await new BookingService(
      createRepository(makeOrder("confirmed")),
      ledgerService
    ).transitionOrder(providerActor, 1, "cancel", "merchant force cancel");
    expect(ledgerService.compensateCustomerForMerchantCancellation).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingOrderId: 1,
        shopId: 1,
        customerUserId: 1,
        actorUserId: 2
      }),
      expect.anything()
    );
  });

  it("emits an order status notification after a successful transition", async () => {
    const notificationService: jest.Mocked<OrderStatusNotificationPort> = {
      notifyOrderStatusChanged: jest.fn(async (input) => {
        void input;
        return undefined;
      })
    };

    await new BookingService(
      createRepository(makeOrder("pending")),
      undefined,
      notificationService
    ).transitionOrder({ userId: 2, roles: ["merchant_owner"] }, 1, "confirm");

    expect(notificationService.notifyOrderStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 2,
        orderId: 1,
        orderNo: "ND202605260001",
        fromStatus: "pending",
        toStatus: "confirmed",
        recipientUserIds: [1]
      })
    );
  });
});
