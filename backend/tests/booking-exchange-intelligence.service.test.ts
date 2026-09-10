import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  BookingOrderPayload,
  BookingRepositoryPort
} from "../src/repositories/booking.repository";
import { BookingService } from "../src/services/booking.service";

const actor = {
  userId: 7,
  roles: ["customer"],
  currentIdentityId: 70,
  currentIdentityType: "customer"
};

const order = { id: 301 } as BookingOrderPayload;

const repository = (): jest.Mocked<BookingRepositoryPort> =>
  ({
    createBooking: jest.fn(async () => order),
    findScheduleSlotShopId: jest.fn(async () => 11)
  }) as unknown as jest.Mocked<BookingRepositoryPort>;

describe("BookingService Intelligence source", () => {
  it("requires and forwards a validated Idempotency-Key with the source post", async () => {
    const repo = repository();
    const service = new BookingService(repo);

    await expect(
      service.createBooking(
        actor,
        {
          expectedPriceAmountJpy: 8_800,
          serviceId: 41,
          scheduleSlotId: 51,
          exchangeIntelligencePostId: 61,
          fulfillmentMode: "store"
        },
        "intelligence-booking-0001"
      )
    ).resolves.toBe(order);

    expect(repo.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        customerUserId: 7,
        serviceId: 41,
        scheduleSlotId: 51,
        exchangeIntelligencePostId: 61,
        idempotencyKey: "intelligence-booking-0001"
      })
    );
  });

  it("rejects a missing idempotency key before repository mutation", async () => {
    const repo = repository();
    const service = new BookingService(repo);

    await expect(
      service.createBooking(actor, {
        expectedPriceAmountJpy: 8_800,
        serviceId: 41,
        scheduleSlotId: 51,
        exchangeIntelligencePostId: 61,
        fulfillmentMode: "store"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION, statusCode: 400 });
    expect(repo.createBooking).not.toHaveBeenCalled();
  });

  it.each([
    [
      "unavailable",
      "EXCHANGE_INTELLIGENCE_BOOKING_UNAVAILABLE",
      "error.exchange.intelligence_booking_unavailable"
    ],
    [
      "service_mismatch",
      "EXCHANGE_INTELLIGENCE_BOOKING_SERVICE_MISMATCH",
      "error.exchange.intelligence_booking_service_mismatch"
    ],
    [
      "idempotency_conflict",
      "BOOKING_CREATE_IDEMPOTENCY_CONFLICT",
      "error.booking.create_idempotency_conflict"
    ]
  ] as const)("maps %s without leaking repository details", async (reason, codeKey, message) => {
    const repo = repository();
    repo.createBooking.mockResolvedValue({ intelligenceBookingError: reason });
    const service = new BookingService(repo);

    await expect(
      service.createBooking(
        actor,
        {
          serviceId: 41,
          scheduleSlotId: 51,
          exchangeIntelligencePostId: 61,
          fulfillmentMode: "store"
        },
        "intelligence-booking-0001"
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES[codeKey],
      message,
      statusCode: 409
    });
  });

  it("does not permit Affiliate selectors on an Intelligence-priced booking", async () => {
    const repo = repository();
    const service = new BookingService(repo);

    await expect(
      service.createBooking(
        actor,
        {
          serviceId: 41,
          scheduleSlotId: 51,
          exchangeIntelligencePostId: 61,
          fulfillmentMode: "store",
          affiliateCode: "PROMO"
        },
        "intelligence-booking-0001"
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION, statusCode: 400 });
    expect(repo.createBooking).not.toHaveBeenCalled();
  });

  it("does not emit a second notification for an idempotent booking replay", async () => {
    const repo = repository();
    repo.createBooking.mockResolvedValue({
      order: {
        ...order,
        orderNo: "ND-REPLAY",
        serviceName: "Formal care"
      } as BookingOrderPayload,
      recipientUserIds: [91],
      supersededOrders: [],
      idempotentReplay: true
    });
    const notifications = { notifyOrderStatusChanged: jest.fn(async () => undefined) };
    const service = new BookingService(repo, undefined, notifications);

    await service.createBooking(
      actor,
      {
        serviceId: 41,
        scheduleSlotId: 51,
        exchangeIntelligencePostId: 61,
        fulfillmentMode: "store"
      },
      "intelligence-booking-0001"
    );

    expect(notifications.notifyOrderStatusChanged).not.toHaveBeenCalled();
  });
});
