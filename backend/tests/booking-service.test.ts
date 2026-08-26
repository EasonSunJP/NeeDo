import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  BookingOrderPayload,
  BookingRepositoryPort
} from "../src/repositories/booking.repository";
import type { BookingLedgerSettlementPort } from "../src/services/ledger.service";
import type { OrderStatusNotificationPort } from "../src/services/realtime.service";
import { BookingService } from "../src/services/booking.service";
import type {
  AffiliateCheckoutPrepared,
  AffiliateCheckoutService
} from "../src/services/affiliate-checkout.service";

const now = new Date("2026-05-25T00:00:00.000Z");
const actor = { userId: 1, roles: ["customer"] };

const makeOrder = (
  status: BookingOrderPayload["status"],
  orderType: BookingOrderPayload["orderType"] = "booking"
): BookingOrderPayload => ({
  id: 1,
  orderNo: "ND202605260001",
  orderType,
  status,
  paymentMethod: "onsite",
  paymentStatus: "pending",
  paymentAmountJpy: 8800,
  paymentConfirmedById: null,
  paymentConfirmedAt: null,
  paymentReference: null,
  paymentNote: null,
  paymentRefundedById: null,
  paymentRefundedAt: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
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
  affiliate: null,
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

  it("rejects only new bookings for a suspended shop and keeps existing order transitions available", async () => {
    const repository = createRepository(makeOrder("confirmed"));
    repository.findScheduleSlotShopId = jest.fn(async () => 1);
    repository.isShopSuspended = jest.fn(async () => true);
    const service = new BookingService(repository);

    await expect(
      service.createBooking(actor, {
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.ENTITY_SUSPENDED,
      message: "error.entity.suspended"
    });
    expect(repository.createBooking).not.toHaveBeenCalled();

    await expect(service.transitionOrder(actor, 1, "start")).resolves.toMatchObject({
      status: "inService"
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

    expect(repository.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        customerUserId: 1,
        technicianServiceId: 21,
        orderType: "booking",
        scheduleSlotId: 11,
        fulfillmentMode: "store",
        note: undefined
      })
    );
  });

  it("passes request order creation through without downgrading it to booking", async () => {
    const repository = createRepository(makeOrder("pending", "request"));
    const service = new BookingService(repository);

    await service.createBooking(actor, {
      orderType: "request",
      serviceId: 1,
      scheduleSlotId: 11,
      fulfillmentMode: "store"
    });

    expect(repository.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        customerUserId: 1,
        orderType: "request",
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store",
        note: undefined
      })
    );
  });

  it("binds an explicit affiliate code to the repository transaction hooks", async () => {
    const repository = createRepository(makeOrder("pending"));
    const prepared: AffiliateCheckoutPrepared = {
      claimId: 41,
      taskId: 31,
      claimantUserId: 701,
      publicCode: "NDO-VALID",
      source: "code",
      originalPriceJpy: 8_800,
      customerDiscountJpy: 800,
      finalPriceJpy: 8_000,
      rewardAllocatedNdp: 1_000,
      attributionStatus: "attributed",
      attributedAt: now,
      expiresAt: new Date("2026-06-08T00:00:00.000Z")
    };
    const affiliateCheckout: jest.Mocked<
      Pick<
        AffiliateCheckoutService,
        | "prepareCheckout"
        | "persistAttribution"
        | "invalidateCancelledBooking"
        | "settleCompletedBooking"
      >
    > = {
      prepareCheckout: jest.fn().mockResolvedValue(prepared),
      persistAttribution: jest.fn().mockResolvedValue(undefined),
      invalidateCancelledBooking: jest.fn().mockResolvedValue(undefined),
      settleCompletedBooking: jest.fn()
    };
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      affiliateCheckout
    );

    await service.createBooking(actor, {
      serviceId: 1,
      scheduleSlotId: 11,
      fulfillmentMode: "store",
      affiliateCode: " NDO-VALID ",
      affiliatePublicToken: "ignored.signature"
    });

    const [, options] = repository.createBooking.mock.calls[0];
    expect(options).toEqual({
      prepareAffiliate: expect.any(Function),
      persistAffiliate: expect.any(Function)
    });
    const transactionClient = { booking: "transaction" };
    const context = {
      transactionClient,
      customerUserId: actor.userId,
      shopId: 1,
      serviceId: 1,
      originalPriceJpy: 8_800,
      scheduledStartAt: new Date("2026-05-26T01:00:00.000Z")
    };
    await expect(options!.prepareAffiliate!(context)).resolves.toBe(prepared);
    expect(affiliateCheckout.prepareCheckout).toHaveBeenCalledWith({
      ...context,
      selector: { source: "code", value: "NDO-VALID" }
    });
    await options!.persistAffiliate!({
      ...context,
      bookingOrderId: 1,
      prepared
    });
    expect(affiliateCheckout.persistAttribution).toHaveBeenCalledWith({
      bookingOrderId: 1,
      customerUserId: actor.userId,
      shopId: 1,
      serviceId: 1,
      prepared,
      transactionClient
    });
  });

  it("does not install affiliate transaction hooks for an ordinary booking", async () => {
    const repository = createRepository(makeOrder("pending"));
    const affiliateCheckout = {
      prepareCheckout: jest.fn(),
      persistAttribution: jest.fn(),
      invalidateCancelledBooking: jest.fn(),
      settleCompletedBooking: jest.fn()
    } as unknown as Pick<
      AffiliateCheckoutService,
      | "prepareCheckout"
      | "persistAttribution"
      | "invalidateCancelledBooking"
      | "settleCompletedBooking"
    >;
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      affiliateCheckout
    );

    await service.createBooking(actor, {
      serviceId: 1,
      scheduleSlotId: 11,
      fulfillmentMode: "store"
    });

    expect(repository.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ customerUserId: actor.userId })
    );
    expect(affiliateCheckout.prepareCheckout).not.toHaveBeenCalled();
  });

  it("forces customer order lists to the authenticated user scope", async () => {
    const repository = createRepository(makeOrder("pending"));
    const service = new BookingService(repository);

    await service.listOrders(actor, {
      customerUserId: 999,
      page: 1,
      pageSize: 20
    });

    expect(repository.listOrders).toHaveBeenCalledWith({
      customerUserId: actor.userId,
      page: 1,
      pageSize: 20
    });
  });

  it("scopes merchant and technician order lists to the active identity", async () => {
    const repository = createRepository(makeOrder("pending"));
    const service = new BookingService(repository);

    await service.listOrders({
      userId: 2,
      roles: ["merchant_owner"],
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 11
    }, { page: 1, pageSize: 20 });
    expect(repository.listOrders).toHaveBeenLastCalledWith({
      shopId: 11,
      page: 1,
      pageSize: 20
    });

    await service.listOrders({
      userId: 3,
      roles: ["technician"],
      currentIdentityScopeType: "technician_profile",
      currentIdentityScopeId: 17
    }, { page: 1, pageSize: 20 });
    expect(repository.listOrders).toHaveBeenLastCalledWith({
      technicianProfileId: 17,
      page: 1,
      pageSize: 20
    });
  });

  it("hides orders outside the active merchant and technician identity scope", async () => {
    const merchantService = new BookingService(createRepository({ ...makeOrder("pending"), shopId: 99 }));
    const technicianService = new BookingService(createRepository({ ...makeOrder("confirmed"), technicianProfileId: 99 }));

    await expect(merchantService.getOrder({
      userId: 2,
      roles: ["merchant_owner"],
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 11
    }, 1)).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });

    await expect(technicianService.transitionOrder({
      userId: 3,
      roles: ["technician"],
      currentIdentityScopeType: "technician_profile",
      currentIdentityScopeId: 17
    }, 1, "start")).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it("hides other customers' orders from customer actors", async () => {
    const repository = createRepository({ ...makeOrder("pending"), customerUserId: 999 });
    const service = new BookingService(repository);

    await expect(service.getOrder(actor, 1)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.order.not_found"
    });

    await expect(service.transitionOrder(actor, 1, "cancel", "not mine")).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.order.not_found"
    });
    expect(repository.transitionOrder).not.toHaveBeenCalled();
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

  it("runs affiliate cancellation inside the transition transaction without a ledger service", async () => {
    const repository = createRepository(makeOrder("pending"));
    const affiliateCheckout = {
      prepareCheckout: jest.fn(),
      persistAttribution: jest.fn(),
      invalidateCancelledBooking: jest.fn().mockResolvedValue(undefined),
      settleCompletedBooking: jest.fn()
    } as unknown as Pick<
      AffiliateCheckoutService,
      | "prepareCheckout"
      | "persistAttribution"
      | "invalidateCancelledBooking"
      | "settleCompletedBooking"
    >;
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      affiliateCheckout
    );

    await service.transitionOrder(actor, 1, "cancel", "changed plan");

    expect(affiliateCheckout.invalidateCancelledBooking).toHaveBeenCalledWith({
      bookingOrderId: 1,
      actorUserId: actor.userId,
      transactionClient: expect.anything()
    });
  });

  it("composes confirmed-order ledger release with affiliate cancellation", async () => {
    const ledgerService: jest.Mocked<BookingLedgerSettlementPort> = {
      freezeBookingAcceptance: jest.fn(),
      releaseBookingHold: jest.fn().mockResolvedValue(undefined),
      settleBookingCompletion: jest.fn(),
      compensateCustomerForMerchantCancellation: jest.fn()
    };
    const affiliateCheckout = {
      prepareCheckout: jest.fn(),
      persistAttribution: jest.fn(),
      invalidateCancelledBooking: jest.fn().mockResolvedValue(undefined),
      settleCompletedBooking: jest.fn()
    } as unknown as Pick<
      AffiliateCheckoutService,
      | "prepareCheckout"
      | "persistAttribution"
      | "invalidateCancelledBooking"
      | "settleCompletedBooking"
    >;
    const service = new BookingService(
      createRepository(makeOrder("confirmed")),
      ledgerService,
      undefined,
      undefined,
      affiliateCheckout
    );

    await service.transitionOrder(actor, 1, "cancel", "changed plan");

    expect(ledgerService.releaseBookingHold).toHaveBeenCalledTimes(1);
    expect(affiliateCheckout.invalidateCancelledBooking).toHaveBeenCalledTimes(1);
  });

  it("composes booking finance and affiliate reward settlement in the completion transaction", async () => {
    const ledgerService: jest.Mocked<BookingLedgerSettlementPort> = {
      freezeBookingAcceptance: jest.fn(),
      releaseBookingHold: jest.fn(),
      settleBookingCompletion: jest.fn().mockResolvedValue(undefined),
      compensateCustomerForMerchantCancellation: jest.fn()
    };
    const settleCompletedBooking = jest.fn().mockResolvedValue({
      status: "no_op",
      reason: "no_attribution"
    });
    const affiliateCheckout = {
      prepareCheckout: jest.fn(),
      persistAttribution: jest.fn(),
      invalidateCancelledBooking: jest.fn(),
      settleCompletedBooking
    } as unknown as Pick<
      AffiliateCheckoutService,
      | "prepareCheckout"
      | "persistAttribution"
      | "invalidateCancelledBooking"
      | "settleCompletedBooking"
    >;
    const providerActor = {
      userId: 2,
      roles: ["merchant_owner"],
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 1
    };
    const repository = createRepository(makeOrder("inService"));

    await new BookingService(
      repository,
      ledgerService,
      undefined,
      undefined,
      affiliateCheckout
    ).transitionOrder(providerActor, 1, "complete");

    expect(ledgerService.settleBookingCompletion).toHaveBeenCalledTimes(1);
    expect(settleCompletedBooking).toHaveBeenCalledWith({
      bookingOrderId: 1,
      customerUserId: 1,
      shopId: 1,
      serviceId: 1,
      actorUserId: 2,
      transactionClient: expect.anything()
    });
    const ledgerContext = ledgerService.settleBookingCompletion.mock.calls[0][1];
    const affiliateContext = settleCompletedBooking.mock.calls[0][0].transactionClient;
    expect(affiliateContext).toBe(ledgerContext?.transactionClient);
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
    const providerActor = {
      userId: 2,
      roles: ["merchant_owner"],
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 1
    };

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
      createRepository(makeOrder("pending", "request")),
      ledgerService
    ).transitionOrder(providerActor, 1, "confirm");
    expect(ledgerService.freezeBookingAcceptance).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bookingOrderId: 1,
        orderType: "request",
        customerUserId: 1,
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
      createRepository(makeOrder("confirmed", "request")),
      ledgerService
    ).transitionOrder(providerActor, 1, "cancel", "request not matched");
    expect(ledgerService.releaseBookingHold).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bookingOrderId: 1,
        orderType: "request",
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
    ).transitionOrder({
      userId: 2,
      roles: ["merchant_owner"],
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 1
    }, 1, "confirm");

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
