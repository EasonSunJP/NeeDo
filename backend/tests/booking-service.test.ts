import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  BookingCreateRepositoryInput,
  BookingOrderPayload,
  BookingRepositoryPort,
  ConfirmManualPaymentRepositoryInput,
  LegacyServicePaymentMethodPayload,
  ScheduleSlotCreateInput,
  ScheduleSlotReadInput,
  ScheduleSlotPayload,
  ScheduleSlotUpdateInput
} from "../src/repositories/booking.repository";
import {
  bookingOrderStatusFromDb,
  bookingOrderStatusToDb,
  servicePaymentMethodFromDb,
  servicePaymentMethodToDb
} from "../src/repositories/booking.repository";
import type { BookingLedgerSettlementPort } from "../src/services/ledger.service";
import type { OrderStatusNotificationPort } from "../src/services/realtime.service";
import {
  BookingService,
  type AuthenticatedBookingActor,
  type BookingCreateInput
} from "../src/services/booking.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type {
  AffiliateCheckoutPrepared,
  AffiliateCheckoutService
} from "../src/services/affiliate-checkout.service";

const now = new Date("2026-05-25T00:00:00.000Z");
const actor = { userId: 1, roles: ["customer"] };
const technicianActor: AuthenticatedAccessContext = {
  userId: 3,
  email: "technician@example.com",
  accessTokenJti: "technician-access-jti",
  accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 300,
  roles: ["technician"],
  permissions: ["schedule:slots:list"],
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 31,
  currentIdentityId: 301,
  currentIdentityType: "technician"
};

type Assert<T extends true> = T;
type IsEqual<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2 ? true : false;
type BookingCreationPaymentBoundary = Assert<
  IsEqual<
    NonNullable<BookingCreateRepositoryInput["paymentMethod"]>,
    LegacyServicePaymentMethodPayload
  >
>;
type ManualConfirmationPaymentBoundary = Assert<
  IsEqual<ConfirmManualPaymentRepositoryInput["method"], LegacyServicePaymentMethodPayload>
>;
type BookingServicePaymentBoundary = Assert<
  IsEqual<NonNullable<BookingCreateInput["paymentMethod"]>, LegacyServicePaymentMethodPayload>
>;

const bookingCreationPaymentBoundary: BookingCreationPaymentBoundary = true;
const manualConfirmationPaymentBoundary: ManualConfirmationPaymentBoundary = true;
const bookingServicePaymentBoundary: BookingServicePaymentBoundary = true;

const scheduleSlot: ScheduleSlotPayload = {
  id: 10,
  serviceId: null,
  technicianServiceId: 20,
  shopId: 11,
  technicianProfileId: 31,
  startsAt: new Date("2026-08-26T01:00:00.000Z"),
  endsAt: new Date("2026-08-26T02:00:00.000Z"),
  capacity: 1,
  bookedCount: 0,
  status: "available",
  serviceName: "Aroma 60",
  shopName: "Aoyama Studio",
  technicianName: "Mika",
  priceAmount: "12000.00",
  currency: "JPY",
  durationMinutes: 60
};

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
  amountSource: "order_payment",
  effectivePaymentMethod: "onsite",
  otherMethodCode: null,
  otherMethodLabel: null,
  checkoutPaymentAmountNdp: null,
  ndpCurrency: null,
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
  rebook: {
    action: "checkout",
    serviceType: "shop_service",
    serviceId: 1,
    shopId: 1,
    technicianProfileId: 1,
    fulfillmentMode: "store"
  },
  fulfillmentAddressSnapshot: null,
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
  ],
  performanceAssessment: null,
  timelineEvents: [
    {
      type: "ORDER_STATUS_CHANGED",
      id: "status:1",
      createdAt: now,
      actorUserId: 1,
      fromStatus: null,
      toStatus: status,
      publicReason: null
    }
  ]
});

const createRepository = (order: BookingOrderPayload | null): jest.Mocked<BookingRepositoryPort> =>
  ({
    listAvailableSlots: jest.fn(),
    findActiveCustomerUserIdByIdentityId: jest.fn(async () => 44),
    createBooking: jest.fn(async () => order),
    listOrders: jest.fn(),
    findOrderById: jest.fn(async () => order),
    getServiceVerificationCode: jest.fn(async () => "829104"),
    startService: jest.fn(async () =>
      order
        ? { outcome: "ok", order: { ...order, status: "inService" }, applied: true }
        : { outcome: "not_found" }
    ),
    createOrderAddOn: jest.fn(async () =>
      order ? { outcome: "ok", order, applied: true } : { outcome: "not_found" }
    ),
    decideOrderAddOn: jest.fn(async () =>
      order ? { outcome: "ok", order, applied: true } : { outcome: "not_found" }
    ),
    endService: jest.fn(async () =>
      order
        ? { outcome: "ok", order: { ...order, status: "awaitingCheckout" }, applied: true }
        : { outcome: "not_found" }
    ),
    findScheduleSlotById: jest.fn(async () => scheduleSlot),
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
        ],
        timelineEvents: [
          ...order.timelineEvents,
          {
            type: "ORDER_STATUS_CHANGED" as const,
            id: "status:2",
            createdAt: now,
            actorUserId: input.actorUserId,
            fromStatus: input.fromStatus,
            toStatus: input.toStatus,
            publicReason: input.reason ?? null
          }
        ]
      };

      await options?.settle?.({ transactionClient: {}, order: nextOrder });

      return nextOrder;
    })
  }) as unknown as jest.Mocked<BookingRepositoryPort>;

describe("BookingService state machine", () => {
  it("returns the stable invalid-transition error when merchant editing loses the state race", async () => {
    const repository = createRepository(makeOrder("cancelled"));
    repository.editMerchantOrder = jest.fn(async () => ({ outcome: "invalid_state" as const }));
    const service = new BookingService(repository);
    const merchant = {
      userId: 7,
      roles: ["merchant_owner"],
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop" as const,
      currentIdentityScopeId: 1
    };

    await expect(service.editMerchantOrder(merchant, 1, { note: "late edit" })).rejects.toMatchObject({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message: "error.order.invalid_transition",
      statusCode: 409
    });
  });

  it("keeps confirmed merchant orders editable", async () => {
    const confirmed = makeOrder("confirmed");
    const repository = createRepository(confirmed);
    repository.editMerchantOrder = jest.fn(async () => ({ outcome: "ok" as const, order: confirmed }));
    const service = new BookingService(repository);
    const merchant = {
      userId: 7,
      roles: ["merchant_owner"],
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop" as const,
      currentIdentityScopeId: 1
    };

    await expect(service.editMerchantOrder(merchant, 1, { note: "confirmed edit" })).resolves.toBe(confirmed);
    expect(repository.editMerchantOrder).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 7,
      orderId: 1,
      shopId: 1
    }));
  });

  it("rejects direct booking when the selected identity cannot view the slot shop", async () => {
    const order = makeOrder("pending");
    const repository = createRepository(order);
    repository.findScheduleSlotShopId = jest.fn(async () => 11);
    const visibility = { canView: jest.fn(async () => false) };
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      visibility as never
    );

    await expect(
      service.createBooking(
        {
          userId: 1,
          roles: ["customer"],
          currentIdentityId: 10,
          currentIdentityType: "customer",
          currentIdentityScopeType: "customer_profile",
          currentIdentityScopeId: 12
        },
        {
          expectedPriceAmountJpy: 8_800,
          serviceId: 1,
          scheduleSlotId: 11,
          fulfillmentMode: "store"
        }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, statusCode: 404 });
    expect(visibility.canView).toHaveBeenCalledWith(11, {
      userId: 1,
      identityId: 10,
      identityType: "customer",
      identityScopeType: "customer_profile",
      identityScopeId: 12
    });
    expect(repository.createBooking).not.toHaveBeenCalled();
  });

  it("filters public availability before pagination with the same selected identity policy", async () => {
    const repository = createRepository(makeOrder("pending"));
    repository.listAvailableSlots.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    });
    const visibilityWhere = { OR: [{ visibility: "public" }, { ownerUserId: 1 }] };
    const visibility = {
      canView: jest.fn(),
      buildVisibilityWhere: jest.fn(async () => visibilityWhere)
    };
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      visibility as never
    );
    const input = {
      page: 1,
      pageSize: 20,
      from: new Date("2026-09-14T00:00:00.000Z"),
      to: new Date("2026-09-15T00:00:00.000Z")
    };
    const viewer = {
      userId: 1,
      identityId: 10,
      identityType: "customer",
      identityScopeType: "customer_profile",
      identityScopeId: 12
    };

    await service.listAvailableSlots(input, viewer);

    expect(repository.listAvailableSlots).toHaveBeenCalledWith(input, visibilityWhere, viewer.userId);
  });

  it("keeps merchant previews on the same visibility projection without customer-only pending replacement", async () => {
    const repository = createRepository(makeOrder("pending"));
    repository.listAvailableSlots.mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    });
    const visibilityWhere = { id: 11 };
    const visibility = {
      canView: jest.fn(),
      buildVisibilityWhere: jest.fn(async () => visibilityWhere)
    };
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      visibility as never
    );
    const input = {
      page: 1,
      pageSize: 20,
      from: new Date("2026-09-21T00:00:00.000Z"),
      to: new Date("2026-09-22T00:00:00.000Z"),
      shopId: 11
    };
    const viewer = {
      userId: 7,
      identityId: 70,
      identityType: "merchant_owner",
      identityScopeType: "shop" as const,
      identityScopeId: 11
    };

    await service.listAvailableSlots(input, viewer);

    expect(visibility.buildVisibilityWhere).toHaveBeenCalledWith(viewer);
    expect(repository.listAvailableSlots).toHaveBeenCalledWith(input, visibilityWhere);
  });

  it("forwards an explicit technician nomination to the repository price transaction", async () => {
    const order = makeOrder("pending");
    const repository = createRepository(order);
    repository.findScheduleSlotShopId = jest.fn(async () => 1);
    const service = new BookingService(repository);

    await service.createBooking(actor, {
      expectedPriceAmountJpy: 11_800,
      serviceId: 1,
      nominatedTechnicianProfileId: 31,
      scheduleSlotId: 11,
      fulfillmentMode: "store"
    });

    expect(repository.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPriceAmountJpy: 11_800,
        nominatedTechnicianProfileId: 31
      })
    );
  });

  it("cancels affected confirmed bookings through the formal transition before an impact-confirmed schedule edit", async () => {
    const confirmed = { ...makeOrder("confirmed"), technicianProfileId: 31, scheduleSlotId: scheduleSlot.id };
    const repository = createRepository(confirmed);
    repository.findScheduleSlotById = jest.fn(async (input: ScheduleSlotReadInput) => {
      void input;
      return scheduleSlot;
    });
    repository.listCancellableOrdersForScheduleSlot = jest.fn(async (scheduleSlotId: number) => {
      void scheduleSlotId;
      return [confirmed];
    });
    repository.updateScheduleSlot = jest.fn(async (input: ScheduleSlotUpdateInput) => {
      void input;
      return { outcome: "ok" as const, slot: scheduleSlot };
    });
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new BookingService(repository, undefined, undefined, auditLogService);

    await expect(service.updateScheduleSlot(
      technicianActor,
      scheduleSlot.id,
      { startsAt: new Date(scheduleSlot.startsAt.getTime() + 60_000), impactConfirmed: true },
      { ip: "127.0.0.1", userAgent: "jest" }
    )).resolves.toBe(scheduleSlot);

    expect(repository.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: confirmed.id,
        fromStatus: "confirmed",
        toStatus: "cancelled",
        reason: "技师确认修改排班，系统取消受影响预约"
      }),
      expect.any(Object)
    );
    expect(repository.updateScheduleSlot).toHaveBeenCalledWith(expect.objectContaining({
      id: scheduleSlot.id,
      scope: "technician",
      startsAt: expect.any(Date)
    }));
  });

  it("creates a technician manual booking for the selected formal customer and preserves the technician actor", async () => {
    const order = makeOrder("pending");
    const repository = createRepository(order);
    repository.createScheduleSlot = jest.fn(async (input: ScheduleSlotCreateInput) => {
      void input;
      return { outcome: "ok" as const, slot: scheduleSlot };
    });
    repository.deleteScheduleSlot = jest.fn();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new BookingService(repository, undefined, undefined, auditLogService);

    await expect(service.createTechnicianManualBooking(
      technicianActor,
      {
        customerIdentityId: 404,
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        startsAt: scheduleSlot.startsAt,
        endsAt: scheduleSlot.endsAt,
        paymentMethod: "onsite",
        note: "现场手动预约"
      },
      "manual-booking-key-1",
      { ip: "127.0.0.1", userAgent: "jest" }
    )).resolves.toBe(order);

    expect(repository.findActiveCustomerUserIdByIdentityId).toHaveBeenCalledWith(404);
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "technician.schedule_slot.create",
      targetId: scheduleSlot.id
    }));
    expect(repository.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      customerUserId: 44,
      createdByUserId: 3,
      idempotencyKey: "manual-booking-key-1"
    }));
    expect(repository.createScheduleSlot).toHaveBeenCalledWith(expect.objectContaining({
      createAvailability: false,
      manualBookingIdempotencyKey: "manual-booking-key-1",
      scope: "technician",
      technicianProfileId: 31
    }));
  });
  it("publishes compact regional order and invalidation events only after booking commit", async () => {
    const order = makeOrder("pending");
    const repository = createRepository(order);
    repository.findLiveDashboardOrderEvents = jest.fn(async () => [
      {
        orderId: order.id,
        scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
        orderNo: order.orderNo,
        status: order.status,
        serviceName: order.serviceName,
        amountJpy: 8800
      }
    ]);
    const publisher = { publish: jest.fn(async () => null) };
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      publisher
    );

    await expect(
      service.createBooking(actor, {
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).resolves.toBe(order);

    expect(repository.createBooking).toHaveBeenCalledTimes(1);
    expect(repository.findLiveDashboardOrderEvents).toHaveBeenCalledWith([order.id]);
    expect(publisher.publish).toHaveBeenNthCalledWith(1, {
      type: "order.changed",
      scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
      payload: {
        orderNo: order.orderNo,
        status: "pending",
        serviceName: order.serviceName,
        amountJpy: 8800
      }
    });
    expect(publisher.publish).toHaveBeenNthCalledWith(2, {
      type: "metrics.invalidate",
      scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
      payload: { sections: ["headline", "orders", "trend", "rankings"] }
    });
    expect(JSON.stringify(publisher.publish.mock.calls)).not.toMatch(
      /customer|address|phone|email|note|actorId|shopId|technicianId/i
    );
  });

  it("keeps a committed booking successful when event projection or publishing fails", async () => {
    const order = makeOrder("pending");
    const projectionFailureRepository = createRepository(order);
    projectionFailureRepository.findLiveDashboardOrderEvents = jest.fn(async () => {
      throw new Error("projection unavailable");
    });
    const publisher = { publish: jest.fn(async () => null) };
    const projectionFailureService = new BookingService(
      projectionFailureRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      publisher
    );
    await expect(
      projectionFailureService.createBooking(actor, {
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).resolves.toBe(order);
    expect(publisher.publish).not.toHaveBeenCalled();

    const publishFailureRepository = createRepository(order);
    publishFailureRepository.findLiveDashboardOrderEvents = jest.fn(async () => [
      {
        orderId: order.id,
        scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
        orderNo: order.orderNo,
        status: order.status,
        serviceName: order.serviceName,
        amountJpy: 8800
      }
    ]);
    const failingPublisher = {
      publish: jest.fn(async () => {
        throw new Error("redis unavailable");
      })
    };
    const publishFailureService = new BookingService(
      publishFailureRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      failingPublisher
    );
    await expect(
      publishFailureService.createBooking(actor, {
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).resolves.toBe(order);
    expect(failingPublisher.publish).toHaveBeenCalledTimes(2);
  });

  it("publishes only after an applied add-on mutation changes the compact order projection", async () => {
    const order = makeOrder("inService");
    const repository = createRepository(order);
    repository.findLiveDashboardOrderEvents = jest.fn(async () => [
      {
        orderId: order.id,
        scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
        orderNo: order.orderNo,
        status: order.status,
        serviceName: order.serviceName,
        amountJpy: 9800
      }
    ]);
    const publisher = { publish: jest.fn(async () => null) };
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      publisher
    );

    await service.createOrderAddOn(
      actor,
      order.id,
      { serviceId: 2, idempotencyKey: "add-on-live-event-0001" },
      { ip: "127.0.0.1", userAgent: "jest" }
    );

    expect(repository.createOrderAddOn).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });

  it("batch-projects every superseded cancellation and the new booking in one query", async () => {
    const created = makeOrder("pending");
    const superseded = [
      { ...makeOrder("cancelled"), id: 11, orderNo: "ND11" },
      { ...makeOrder("cancelled"), id: 12, orderNo: "ND12" }
    ];
    const repository = createRepository(created);
    repository.createBooking.mockResolvedValue({
      order: created,
      recipientUserIds: [created.customerUserId],
      supersededOrders: superseded.map((order) => ({
        order,
        recipientUserIds: [order.customerUserId]
      }))
    });
    repository.findLiveDashboardOrderEvents = jest.fn(async (ids) =>
      ids.map((id) => {
        const order = id === created.id ? created : superseded.find((item) => item.id === id)!;
        return {
          orderId: id,
          scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
          orderNo: order.orderNo,
          status: order.status,
          serviceName: order.serviceName,
          amountJpy: 8800
        };
      })
    );
    const publisher = { publish: jest.fn(async () => null) };
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      publisher
    );

    await service.createBooking(actor, {
      expectedPriceAmountJpy: 8_800,
      serviceId: 1,
      scheduleSlotId: 11,
      fulfillmentMode: "store"
    });

    expect(repository.findLiveDashboardOrderEvents).toHaveBeenCalledTimes(1);
    expect(repository.findLiveDashboardOrderEvents).toHaveBeenCalledWith([11, 12, 1]);
    expect(publisher.publish).toHaveBeenCalledTimes(6);
  });

  it("publishes fulfillment mutations only when applied, including both add-on decisions", async () => {
    const order = makeOrder("confirmed");
    const repository = createRepository(order);
    repository.findLiveDashboardOrderEvents = jest.fn(async () => [
      {
        orderId: order.id,
        scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
        orderNo: order.orderNo,
        status: order.status,
        serviceName: order.serviceName,
        amountJpy: 8800
      }
    ]);
    const publisher = { publish: jest.fn(async () => null) };
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      publisher
    );
    const context = { ip: "127.0.0.1", userAgent: "jest" };

    await service.startService(
      actor,
      1,
      { actor: "customer", idempotencyKey: "start-live-001" },
      context
    );
    await service.createOrderAddOn(
      actor,
      1,
      { serviceId: 2, idempotencyKey: "addon-live-001" },
      context
    );
    await service.acceptOrderAddOn(actor, 1, 21, { idempotencyKey: "accept-live-001" }, context);
    await service.rejectOrderAddOn(actor, 1, 22, { idempotencyKey: "reject-live-001" }, context);
    await service.endService(
      actor,
      1,
      { reason: "done", idempotencyKey: "end-live-0001" },
      context
    );

    expect(repository.findLiveDashboardOrderEvents).toHaveBeenCalledTimes(5);
    expect(publisher.publish).toHaveBeenCalledTimes(10);

    repository.startService.mockResolvedValue({ outcome: "ok", order, applied: false });
    repository.createOrderAddOn.mockResolvedValue({ outcome: "ok", order, applied: false });
    repository.decideOrderAddOn.mockResolvedValue({ outcome: "ok", order, applied: false });
    repository.endService.mockResolvedValue({ outcome: "ok", order, applied: false });
    await service.startService(
      actor,
      1,
      { actor: "customer", idempotencyKey: "start-live-001" },
      context
    );
    await service.createOrderAddOn(
      actor,
      1,
      { serviceId: 2, idempotencyKey: "addon-live-001" },
      context
    );
    await service.acceptOrderAddOn(actor, 1, 21, { idempotencyKey: "accept-live-001" }, context);
    await service.rejectOrderAddOn(actor, 1, 22, { idempotencyKey: "reject-live-001" }, context);
    await service.endService(
      actor,
      1,
      { reason: "done", idempotencyKey: "end-live-0001" },
      context
    );

    expect(repository.findLiveDashboardOrderEvents).toHaveBeenCalledTimes(5);
    expect(publisher.publish).toHaveBeenCalledTimes(10);
  });

  it("publishes normal confirmation and cancellation transitions", async () => {
    const publisher = { publish: jest.fn(async () => null) };
    const makeService = (status: "pending" | "confirmed") => {
      const repository = createRepository(makeOrder(status));
      repository.findLiveDashboardOrderEvents = jest.fn(async () => [
        {
          orderId: 1,
          scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
          orderNo: "ND202605260001",
          status,
          serviceName: "Shiatsu Recovery",
          amountJpy: 8800
        }
      ]);
      return {
        repository,
        service: new BookingService(
          repository,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          publisher
        )
      };
    };
    const confirmation = makeService("pending");
    const cancellation = makeService("confirmed");

    await confirmation.service.transitionOrder(actor, 1, "confirm");
    await cancellation.service.transitionOrder(actor, 1, "cancel", "cancelled");

    expect(confirmation.repository.findLiveDashboardOrderEvents).toHaveBeenCalledWith([1]);
    expect(cancellation.repository.findLiveDashboardOrderEvents).toHaveBeenCalledWith([1]);
    expect(publisher.publish).toHaveBeenCalledTimes(4);
  });

  it("keeps legacy creation/manual payment inputs narrower than order projections", () => {
    expect(bookingCreationPaymentBoundary).toBe(true);
    expect(manualConfirmationPaymentBoundary).toBe(true);
    expect(bookingServicePaymentBoundary).toBe(true);
  });

  it.each([
    ["PENDING", "pending"],
    ["CONFIRMED", "confirmed"],
    ["IN_SERVICE", "inService"],
    ["AWAITING_CHECKOUT", "awaitingCheckout"],
    ["AWAITING_PAYMENT_CONFIRMATION", "awaitingPaymentConfirmation"],
    ["COMPLETED", "completed"],
    ["CANCELLED", "cancelled"]
  ] as const)("roundtrips booking status %s", (databaseValue, payloadValue) => {
    expect(bookingOrderStatusFromDb(databaseValue)).toBe(payloadValue);
    expect(bookingOrderStatusToDb(payloadValue)).toBe(databaseValue);
  });

  it.each([
    ["ONSITE", "onsite"],
    ["BANK_TRANSFER", "bank_transfer"],
    ["CASH", "cash"],
    ["NDP", "ndp"],
    ["OTHER", "other"]
  ] as const)("roundtrips service payment method %s", (databaseValue, payloadValue) => {
    expect(servicePaymentMethodFromDb(databaseValue)).toBe(payloadValue);
    expect(servicePaymentMethodToDb(payloadValue)).toBe(databaseValue);
  });

  it("rejects unknown runtime status and payment enum values", () => {
    expect(() => bookingOrderStatusFromDb("UNKNOWN_STATUS" as never)).toThrow();
    expect(() => bookingOrderStatusToDb("unknownStatus" as never)).toThrow();
    expect(() => servicePaymentMethodFromDb("UNKNOWN_METHOD" as never)).toThrow();
    expect(() => servicePaymentMethodToDb("unknown_method" as never)).toThrow();
  });

  it("maps an atomic cross-shop confirmation collision to a non-leaking schedule conflict", async () => {
    const repository = createRepository(makeOrder("pending"));
    repository.transitionOrderWithScheduleGuard = jest
      .fn()
      .mockResolvedValue({ outcome: "schedule_conflict" });
    const service = new BookingService(repository);

    await expect(service.transitionOrder(actor, 1, "confirm")).rejects.toMatchObject({
      code: ERROR_CODES.SCHEDULE_CONFLICT,
      message: "error.schedule.conflict",
      statusCode: 409
    });
    expect(repository.transitionOrder).not.toHaveBeenCalled();
  });

  it("requires the Exchange cancellation protocol before any fallback transition or settlement", async () => {
    const repository = createRepository(makeOrder("pending"));
    repository.transitionOrderWithScheduleGuard = jest
      .fn()
      .mockResolvedValue({ outcome: "exchange_cancellation_required" });
    const ledgerService: jest.Mocked<BookingLedgerSettlementPort> = {
      freezeBookingAcceptance: jest.fn(),
      releaseBookingHold: jest.fn(),
      settleBookingCompletion: jest.fn(),
      compensateCustomerForMerchantCancellation: jest.fn()
    };
    const service = new BookingService(repository, ledgerService);

    await expect(service.transitionOrder(actor, 1, "cancel", "changed mind")).rejects.toMatchObject(
      {
        code: ERROR_CODES.EXCHANGE_MATCH_CANCELLATION_REQUIRED,
        message: "error.exchange.match_cancellation_required",
        statusCode: 409
      }
    );
    expect(repository.transitionOrder).not.toHaveBeenCalled();
    expect(ledgerService.releaseBookingHold).not.toHaveBeenCalled();
  });

  it("derives technician scope for a single schedule slot", async () => {
    const repository = createRepository(makeOrder("pending"));
    const service = new BookingService(repository);

    await expect(service.getScheduleSlot(technicianActor, 10)).resolves.toEqual(scheduleSlot);
    expect(repository.findScheduleSlotById).toHaveBeenCalledWith({
      scope: "technician",
      technicianProfileId: 31,
      id: 10
    });
  });

  it("returns safe not-found for a schedule slot outside the technician scope", async () => {
    const repository = createRepository(makeOrder("pending"));
    repository.findScheduleSlotById.mockResolvedValue(null);
    const service = new BookingService(repository);

    await expect(service.getScheduleSlot(technicianActor, 99)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      statusCode: 404,
      message: "error.schedule.slot_not_found"
    });
  });

  it("rejects booking creation when the repository reports an unavailable slot", async () => {
    const repository = createRepository(null);
    const service = new BookingService(repository);

    await expect(
      service.createBooking(actor, {
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
      message: "error.booking.slot_unavailable"
    });
  });

  it("reports a capacity race separately from a generally unavailable slot", async () => {
    const repository = createRepository(null);
    repository.createBooking.mockResolvedValue({
      bookingConflict: "concurrent_occupancy"
    });
    const service = new BookingService(repository);

    await expect(
      service.createBooking(actor, {
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.BOOKING_SLOT_CONCURRENT_OCCUPANCY,
      message: "error.booking.slot_concurrent_occupancy",
      statusCode: 409
    });
  });

  it("rejects a stale displayed price and returns the current authoritative amount", async () => {
    const repository = createRepository(makeOrder("pending"));
    repository.createBooking.mockResolvedValue({
      outcome: "price_changed",
      currentPriceAmountJpy: 9_800
    });
    const service = new BookingService(repository);

    await expect(
      service.createBooking(actor, {
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.BOOKING_PRICE_CHANGED,
      message: "error.booking.price_changed",
      statusCode: 409,
      data: { currentPriceAmountJpy: 9_800 }
    });
  });

  it("returns a structured conflict when an active acceptance pause blocks confirmation", async () => {
    const repository = createRepository(makeOrder("pending"));
    repository.transitionOrderWithScheduleGuard = jest.fn().mockResolvedValue({
      outcome: "acceptance_paused",
      pauses: [
        {
          subjectType: "merchant_account",
          authorityType: "operations",
          reasonCode: "risk_review",
          startsAt: new Date("2026-08-29T01:00:00.000Z")
        }
      ]
    });
    const ledgerService: jest.Mocked<BookingLedgerSettlementPort> = {
      freezeBookingAcceptance: jest.fn(),
      releaseBookingHold: jest.fn(),
      settleBookingCompletion: jest.fn(),
      compensateCustomerForMerchantCancellation: jest.fn()
    };
    const service = new BookingService(repository, ledgerService);

    await expect(service.transitionOrder(actor, 1, "confirm")).rejects.toMatchObject({
      code: ERROR_CODES.ORDER_ACCEPTANCE_PAUSED,
      message: "error.order.acceptance_paused",
      statusCode: 409,
      data: {
        pauses: [
          expect.objectContaining({
            subjectType: "merchant_account",
            authorityType: "operations",
            reasonCode: "risk_review"
          })
        ]
      }
    });
    expect(repository.transitionOrder).not.toHaveBeenCalled();
    expect(ledgerService.freezeBookingAcceptance).not.toHaveBeenCalled();
  });

  it("rejects only new bookings for a suspended shop and keeps existing order transitions available", async () => {
    const repository = createRepository(makeOrder("confirmed"));
    repository.findScheduleSlotShopId = jest.fn(async () => 1);
    repository.isShopSuspended = jest.fn(async () => true);
    const service = new BookingService(repository);

    await expect(
      service.createBooking(actor, {
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.ENTITY_SUSPENDED,
      message: "error.entity.suspended"
    });
    expect(repository.createBooking).not.toHaveBeenCalled();

    await expect(
      service.startService(
        actor,
        1,
        { actor: "customer", idempotencyKey: "suspended-start-001" },
        { ip: "127.0.0.1" }
      )
    ).resolves.toMatchObject({
      status: "inService"
    });
  });

  it("passes technician service booking requests to the repository", async () => {
    const repository = createRepository(makeOrder("pending"));
    const service = new BookingService(repository);

    await service.createBooking(actor, {
      expectedPriceAmountJpy: 12_000,
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
      expectedPriceAmountJpy: 8_800,
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
      expectedPriceAmountJpy: 8_800,
      serviceId: 1,
      scheduleSlotId: 11,
      fulfillmentMode: "store",
      affiliateCode: " NDO-VALID ",
      affiliatePublicToken: "ignored.signature"
    });

    const [, options] = repository.createBooking.mock.calls[0];
    expect(options).toEqual({
      prepareAffiliate: expect.any(Function),
      persistAffiliate: expect.any(Function),
      invalidateSupersededAffiliate: expect.any(Function)
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
      expectedPriceAmountJpy: 8_800,
      serviceId: 1,
      scheduleSlotId: 11,
      fulfillmentMode: "store"
    });

    expect(repository.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ customerUserId: actor.userId }),
      { invalidateSupersededAffiliate: expect.any(Function) }
    );
    expect(affiliateCheckout.prepareCheckout).not.toHaveBeenCalled();
  });

  it("forces customer order lists to the authenticated user scope", async () => {
    const repository = createRepository(makeOrder("pending"));
    const service = new BookingService(repository);
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-12-01T00:00:00.000Z");

    await service.listOrders(actor, {
      customerUserId: 999,
      from,
      to,
      page: 1,
      pageSize: 20
    });

    expect(repository.listOrders).toHaveBeenCalledWith({
      customerUserId: actor.userId,
      from,
      to,
      page: 1,
      pageSize: 20
    });
  });

  it("shares customer orders with affiliate identity but rejects unrelated identity fallback", async () => {
    const repository = createRepository(makeOrder("pending"));
    const service = new BookingService(repository);

    await service.listOrders(
      { userId: 1, roles: ["scout"], currentIdentityType: "scout" },
      { page: 1, pageSize: 20 }
    );
    expect(repository.listOrders).toHaveBeenLastCalledWith({
      customerUserId: 1,
      page: 1,
      pageSize: 20
    });

    await expect(
      service.listOrders(
        { userId: 1, roles: ["support"], currentIdentityType: "support" },
        { page: 1, pageSize: 20 }
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.auth.identity_forbidden",
      statusCode: 403
    });
  });

  it("scopes merchant and technician order lists to the active identity", async () => {
    const repository = createRepository(makeOrder("pending"));
    const service = new BookingService(repository);

    await service.listOrders(
      {
        userId: 2,
        roles: ["merchant_owner"],
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 11
      },
      { page: 1, pageSize: 20 }
    );
    expect(repository.listOrders).toHaveBeenLastCalledWith({
      shopId: 11,
      page: 1,
      pageSize: 20
    });

    await service.listOrders(
      {
        userId: 3,
        roles: ["technician"],
        currentIdentityScopeType: "technician_profile",
        currentIdentityScopeId: 17
      },
      { page: 1, pageSize: 20 }
    );
    expect(repository.listOrders).toHaveBeenLastCalledWith({
      technicianProfileId: 17,
      page: 1,
      pageSize: 20
    });
  });

  it("hides orders outside the active merchant and technician identity scope", async () => {
    const merchantService = new BookingService(
      createRepository({ ...makeOrder("pending"), shopId: 99 })
    );
    const technicianService = new BookingService(
      createRepository({ ...makeOrder("confirmed"), technicianProfileId: 99 })
    );

    await expect(
      merchantService.getOrder(
        {
          userId: 2,
          roles: ["merchant_owner"],
          currentIdentityType: "merchant_owner",
          currentIdentityScopeType: "shop",
          currentIdentityScopeId: 11
        },
        1
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });

    await expect(
      technicianService.startService(
        {
          userId: 3,
          roles: ["technician"],
          currentIdentityType: "technician",
          currentIdentityScopeType: "technician_profile",
          currentIdentityScopeId: 17
        },
        1,
        {
          actor: "technician",
          verificationCode: "829104",
          idempotencyKey: "hidden-technician-01"
        },
        { ip: "127.0.0.1" }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it("returns the sanitized home address only to authorized owner and provider actors", async () => {
    const order = {
      ...makeOrder("pending"),
      fulfillmentMode: "home" as const,
      fulfillmentAddressSnapshot: {
        line1: "東京都渋谷区",
        line2: "神南1-2-3",
        line3: null
      }
    };
    const service = new BookingService(createRepository(order));
    const providerActor = {
      userId: 2,
      roles: ["merchant_owner"],
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop" as const,
      currentIdentityScopeId: 1
    };

    await expect(service.getOrder(actor, 1)).resolves.toMatchObject({
      fulfillmentAddressSnapshot: order.fulfillmentAddressSnapshot
    });
    await expect(service.getOrder(providerActor, 1)).resolves.toMatchObject({
      fulfillmentAddressSnapshot: order.fulfillmentAddressSnapshot
    });
    await expect(service.getOrder({ userId: 99, roles: ["customer"] }, 1)).rejects.toMatchObject({
      statusCode: 404
    });
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

    const started = await service.startService(
      actor,
      1,
      { actor: "customer", idempotencyKey: "formal-customer-start" },
      { ip: "127.0.0.1" }
    );

    expect(started.status).toBe("inService");
    expect(repository.startService).toHaveBeenCalled();

    const completedService = new BookingService(createRepository(makeOrder("completed")));
    await expect(
      completedService.transitionOrder(actor, 1, "cancel", "too late")
    ).rejects.toMatchObject({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message: "error.order.invalid_transition"
    });
  });

  it("passes authenticated identity metadata into the atomic order transition", async () => {
    const repository = createRepository(makeOrder("pending"));
    const service = new BookingService(repository);
    const scopedTechnician = {
      userId: 3,
      roles: ["technician"],
      currentIdentityId: 303,
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician_profile",
      currentIdentityScopeId: 1
    };

    await service.transitionOrder(scopedTechnician, 1, "cancel", "临时无法到达");

    expect(repository.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 3,
        actor: {
          userId: 3,
          identityId: 303,
          identityType: "technician"
        }
      }),
      expect.any(Object)
    );
  });

  it("notifies the customer and assigned technician with authoritative merchant cancellation context", async () => {
    const confirmed = makeOrder("confirmed");
    const cancelled = {
      ...confirmed,
      status: "cancelled" as const,
      cancelReason: "店铺当天无法履约",
      timelineEvents: [
        ...confirmed.timelineEvents,
        {
          type: "ORDER_STATUS_CHANGED" as const,
          id: "status:2",
          createdAt: now,
          actorUserId: 2,
          actorIdentityId: 202,
          actorSource: "merchant" as const,
          actorDisplayName: "Eason",
          fromStatus: "confirmed" as const,
          toStatus: "cancelled" as const,
          publicReason: "店铺当天无法履约"
        }
      ]
    };
    const repository = createRepository(confirmed);
    repository.transitionOrder.mockResolvedValue(cancelled);
    repository.findOrderRealtimeRecipients = jest.fn(async () => [
      { userId: 1, identityId: 101 },
      { userId: 3, identityId: 303 }
    ]);
    const notifications: jest.Mocked<OrderStatusNotificationPort> = {
      notifyOrderStatusChanged: jest.fn(
        async (
          input: Parameters<OrderStatusNotificationPort["notifyOrderStatusChanged"]>[0]
        ) => {
          void input;
        }
      ),
      notifyOrderChanged: jest.fn(async () => undefined)
    };
    const service = new BookingService(repository, undefined, notifications);

    await service.transitionOrder(
      {
        userId: 2,
        roles: ["merchant_owner"],
        currentIdentityId: 202,
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 1
      },
      confirmed.id,
      "cancel",
      "店铺当天无法履约"
    );

    expect(notifications.notifyOrderStatusChanged).toHaveBeenCalledWith({
      actorUserId: 2,
      actorIdentityId: 202,
      actorSource: "merchant",
      actorDisplayName: "Eason",
      orderId: confirmed.id,
      orderNo: confirmed.orderNo,
      fromStatus: "confirmed",
      toStatus: "cancelled",
      serviceName: confirmed.serviceName,
      shopName: confirmed.shopName,
      startsAt: confirmed.startsAt,
      reason: "店铺当天无法履约",
      recipientUserIds: [1, 3],
      recipientIdentities: [
        { userId: 1, identityId: 101 },
        { userId: 3, identityId: 303 }
      ]
    });
  });

  it("does not report a committed cancellation as failed when recipient lookup fails", async () => {
    const confirmed = makeOrder("confirmed");
    const cancelled = { ...confirmed, status: "cancelled" as const };
    const repository = createRepository(confirmed);
    repository.transitionOrder.mockResolvedValue(cancelled);
    repository.findOrderRealtimeRecipients = jest.fn().mockRejectedValue(new Error("offline"));
    const notifications = {
      notifyOrderStatusChanged: jest.fn().mockResolvedValue(undefined),
      notifyOrderChanged: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<OrderStatusNotificationPort>;
    const service = new BookingService(repository, undefined, notifications);

    await expect(
      service.transitionOrder(
        {
          userId: 2,
          roles: ["merchant_owner"],
          currentIdentityId: 202,
          currentIdentityType: "merchant_owner",
          currentIdentityScopeType: "shop",
          currentIdentityScopeId: 1
        },
        confirmed.id,
        "cancel",
        "店铺当天无法履约"
      )
    ).resolves.toEqual(cancelled);
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

  it("settles ledger side effects when confirming and cancelling booking orders", async () => {
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
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 1
    };
    const insufficientBalanceConfirmation = {
      confirmed: true as const,
      idempotencyKey: "fee-confirm-1234567890",
      previewVersion: `sha256:${"a".repeat(64)}`
    };

    await new BookingService(createRepository(makeOrder("pending")), ledgerService).transitionOrder(
      providerActor,
      1,
      "confirm",
      undefined,
      { insufficientBalanceConfirmation }
    );
    expect(ledgerService.freezeBookingAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingOrderId: 1,
        shopId: 1,
        actorUserId: 2,
        insufficientBalanceConfirmation
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
        actorUserId: 2,
        insufficientBalanceConfirmation: undefined
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

  it("cancels an unpaid future booking without creating provider compensation", async () => {
    const ledgerService: jest.Mocked<BookingLedgerSettlementPort> = {
      freezeBookingAcceptance: jest.fn(),
      releaseBookingHold: jest.fn().mockResolvedValue(undefined),
      settleBookingCompletion: jest.fn(),
      compensateCustomerForMerchantCancellation: jest.fn().mockResolvedValue(undefined)
    };
    const providerActor = {
      userId: 2,
      roles: ["merchant_owner"],
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 1
    };
    const order = {
      ...makeOrder("confirmed"),
      paymentStatus: "pending" as const,
      startsAt: new Date("2026-09-24T09:00:00.000Z"),
      endsAt: new Date("2026-09-24T10:00:00.000Z")
    };

    await expect(
      new BookingService(
        createRepository(order),
        ledgerService,
        undefined,
        undefined,
        undefined,
        undefined,
        () => new Date("2026-09-20T13:24:00.000Z")
      ).transitionOrder(
        providerActor,
        order.id,
        "cancel",
        "merchant cancelled before service"
      )
    ).resolves.toMatchObject({ status: "cancelled" });

    expect(ledgerService.releaseBookingHold).toHaveBeenCalledTimes(1);
    expect(ledgerService.releaseBookingHold).toHaveBeenCalledWith(
      expect.objectContaining({ unpaidCancellation: true }),
      expect.anything()
    );
    expect(ledgerService.compensateCustomerForMerchantCancellation).not.toHaveBeenCalled();
  });

  it.each([
    ["customer", actor, "pending", "release"],
    [
      "merchant",
      {
        userId: 2,
        roles: ["merchant_owner"],
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 1
      },
      "confirmed",
      "compensate"
    ],
    [
      "technician",
      {
        userId: 3,
        roles: ["technician"],
        currentIdentityId: 303,
        currentIdentityType: "technician",
        currentIdentityScopeType: "technician_profile",
        currentIdentityScopeId: 1
      },
      "pending",
      "compensate"
    ],
    [
      "operations",
      {
        userId: 4,
        roles: ["operator"],
        currentIdentityType: "platform",
        currentIdentityScopeType: "global"
      },
      "confirmed",
      "release"
    ]
  ] as Array<
    [
      string,
      AuthenticatedBookingActor,
      BookingOrderPayload["paymentStatus"],
      "release" | "compensate"
    ]
  >)(
    "keeps confirmed cancellation atomic for the %s actor with %s payment",
    async (_label, cancellationActor, paymentStatus, expectedSettlement) => {
      const order = { ...makeOrder("confirmed"), paymentStatus } as BookingOrderPayload;
      const repository = createRepository(order);
      const ledgerService: jest.Mocked<BookingLedgerSettlementPort> = {
        freezeBookingAcceptance: jest.fn(),
        releaseBookingHold: jest.fn().mockResolvedValue(undefined),
        settleBookingCompletion: jest.fn(),
        compensateCustomerForMerchantCancellation: jest.fn().mockResolvedValue(undefined)
      };

      await expect(
        new BookingService(repository, ledgerService).transitionOrder(
          cancellationActor,
          order.id,
          "cancel",
          `${_label} cancellation`
        )
      ).resolves.toMatchObject({ status: "cancelled" });

      expect(repository.transitionOrder).toHaveBeenCalledTimes(1);
      expect(
        expectedSettlement === "compensate"
          ? ledgerService.compensateCustomerForMerchantCancellation
          : ledgerService.releaseBookingHold
      ).toHaveBeenCalledTimes(1);
      expect(
        expectedSettlement === "compensate"
          ? ledgerService.releaseBookingHold
          : ledgerService.compensateCustomerForMerchantCancellation
      ).not.toHaveBeenCalled();
    }
  );

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
    ).transitionOrder(
      {
        userId: 2,
        roles: ["merchant_owner"],
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 1
      },
      1,
      "confirm"
    );

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

  it("does not report a committed pending replacement as failed when notification delivery fails", async () => {
    const repository = createRepository(makeOrder("pending"));
    const replacement = makeOrder("pending");
    const superseded = {
      ...makeOrder("cancelled"),
      id: 2,
      orderNo: "ND202605260000"
    };
    repository.createBooking.mockResolvedValue({
      order: replacement,
      recipientUserIds: [2],
      supersededOrders: [{ order: superseded, recipientUserIds: [2] }]
    });
    const notificationService: jest.Mocked<OrderStatusNotificationPort> = {
      notifyOrderStatusChanged: jest.fn().mockRejectedValue(new Error("notification unavailable"))
    };
    const service = new BookingService(repository, undefined, notificationService);

    await expect(
      service.createBooking(actor, {
        expectedPriceAmountJpy: 8_800,
        serviceId: 1,
        scheduleSlotId: 11,
        fulfillmentMode: "store"
      })
    ).resolves.toEqual(replacement);

    expect(repository.createBooking).toHaveBeenCalledTimes(1);
    expect(notificationService.notifyOrderStatusChanged).toHaveBeenCalledTimes(2);
  });
});
