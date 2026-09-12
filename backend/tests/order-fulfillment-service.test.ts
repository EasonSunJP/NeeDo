import { ERROR_CODES } from "../src/constants/error-codes";
import { Prisma } from "@prisma/client";
import type {
  BookingOrderPayload,
  BookingRepositoryPort,
  FulfillmentMutationResult,
  OrderTransitionRepositoryInput
} from "../src/repositories/booking.repository";
import {
  BookingRepository,
  deriveOrderServiceVerificationCode
} from "../src/repositories/booking.repository";
import { BookingService } from "../src/services/booking.service";
import type { AuthRequestContext } from "../src/services/auth.service";

const now = new Date("2026-09-01T10:00:00.000Z");
const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "fulfillment-test" };
const customer = {
  userId: 101,
  roles: ["customer"],
  currentIdentityId: 1501,
  currentIdentityType: "customer",
  currentIdentityScopeType: "customer_profile",
  currentIdentityScopeId: 501
};
const assignedTechnician = {
  userId: 202,
  roles: ["technician"],
  currentIdentityId: 1702,
  currentIdentityType: "technician",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 702
};

const makeOrder = (
  status: BookingOrderPayload["status"],
  overrides: Partial<BookingOrderPayload> = {}
): BookingOrderPayload => ({
  id: 41,
  orderNo: "ND202609010041",
  orderType: "booking",
  status,
  paymentMethod: "onsite",
  paymentStatus: "pending",
  paymentAmountJpy: 8_800,
  paymentConfirmedById: null,
  paymentConfirmedAt: null,
  paymentReference: null,
  paymentNote: null,
  paymentRefundedById: null,
  paymentRefundedAt: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
  customerUserId: customer.userId,
  serviceId: 11,
  technicianServiceId: null,
  shopId: 12,
  technicianProfileId: assignedTechnician.currentIdentityScopeId,
  scheduleSlotId: 13,
  fulfillmentMode: "store",
  serviceName: "舒缓 60 分钟",
  pricingModeSnapshot: "merchant",
  serviceOwnerType: "shop",
  serviceOwnerId: 11,
  serviceNameSnapshot: "舒缓 60 分钟",
  servicePriceSnapshot: "8800.00",
  serviceDurationSnapshot: 60,
  serviceSnapshot: { serviceId: 11, durationMinutes: 60 },
  rebook: {
    action: "checkout",
    serviceType: "shop_service",
    serviceId: 11,
    shopId: 12,
    technicianProfileId: assignedTechnician.currentIdentityScopeId,
    fulfillmentMode: "store"
  },
  shopName: "銀座店",
  technicianName: "Misaki",
  priceAmount: "8800.00",
  currency: "JPY",
  startsAt: now,
  endsAt: new Date("2026-09-01T11:00:00.000Z"),
  note: null,
  cancelReason: null,
  affiliate: null,
  serviceSession: null,
  createdAt: now,
  updatedAt: now,
  statusHistory: [],
  ...overrides,
  fulfillmentAddressSnapshot: overrides.fulfillmentAddressSnapshot ?? null,
  performanceAssessment: overrides.performanceAssessment ?? null,
  timelineEvents: overrides.timelineEvents ?? []
});

const ok = (order: BookingOrderPayload, applied = true): FulfillmentMutationResult => ({
  outcome: "ok",
  order,
  applied
});

const createRepository = (
  order: BookingOrderPayload,
  result: FulfillmentMutationResult = ok(order)
): jest.Mocked<BookingRepositoryPort> =>
  ({
    listAvailableSlots: jest.fn(),
    createBooking: jest.fn(),
    listOrders: jest.fn(),
    findOrderById: jest.fn().mockResolvedValue(order),
    transitionOrder: jest.fn(),
    findScheduleSlotById: jest.fn(),
    listScheduleSlots: jest.fn(),
    createScheduleSlot: jest.fn(),
    updateScheduleSlot: jest.fn(),
    deleteScheduleSlot: jest.fn(),
    confirmManualPayment: jest.fn(),
    refundManualPayment: jest.fn(),
    getServiceVerificationCode: jest.fn().mockResolvedValue("829104"),
    startService: jest.fn().mockResolvedValue(result),
    resolveOverdueAppointment: jest.fn(),
    createOrderAddOn: jest.fn().mockResolvedValue(result),
    decideOrderAddOn: jest.fn().mockResolvedValue(result),
    endService: jest.fn().mockResolvedValue(result)
  }) as unknown as jest.Mocked<BookingRepositoryPort>;

describe("formal order fulfillment service", () => {
  it("starts a confirmed order as its owning customer without accepting client duration", async () => {
    const started = makeOrder("inService", {
      serviceSession: {
        startedAt: now,
        expectedEndsAt: new Date("2026-09-01T11:00:00.000Z"),
        endedAt: null,
        addOns: []
      }
    });
    const repository = createRepository(makeOrder("confirmed"), ok(started));
    const service = new BookingService(repository);

    await expect(
      service.startService(
        customer,
        41,
        { actor: "customer", idempotencyKey: "customer-start-000001" },
        context
      )
    ).resolves.toEqual(started);
    expect(repository.startService).toHaveBeenCalledWith({
      orderId: 41,
      actorUserId: customer.userId,
      actor: "customer",
      technicianProfileId: null,
      verificationCode: null,
      idempotencyKey: "customer-start-000001",
      requestContext: context
    });
  });

  it("requires a correct code for the assigned technician and maps verification failure", async () => {
    const repository = createRepository(makeOrder("confirmed"), {
      outcome: "verification_failed"
    });
    const service = new BookingService(repository);

    await expect(
      service.startService(
        assignedTechnician,
        41,
        {
          actor: "technician",
          verificationCode: "000000",
          idempotencyKey: "technician-start-001"
        },
        context
      )
    ).rejects.toMatchObject({
      message: "error.order.verification_code_invalid",
      statusCode: 400
    });
  });

  it("returns the narrow overdue appointment projection when start is blocked", async () => {
    const overdueAppointment = {
      orderId: 17,
      orderNo: "ND202608310017",
      serviceName: "此前的到店护理",
      startsAt: new Date("2026-08-31T08:00:00.000Z"),
      endsAt: new Date("2026-08-31T09:00:00.000Z")
    };
    const repository = createRepository(makeOrder("confirmed"), {
      outcome: "overdue_appointment_blocked",
      overdueAppointment
    });
    const service = new BookingService(repository);

    await expect(
      service.startService(
        customer,
        41,
        { actor: "customer", idempotencyKey: "customer-overdue-blocked-01" },
        context
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.ORDER_OVERDUE_APPOINTMENT_BLOCKED,
      message: "error.order.overdue_appointment_blocked",
      statusCode: 409,
      data: { overdueAppointment }
    });
  });

  it("resolves a participant no-show through the repository and wires prepaid settlement", async () => {
    const cancelled = makeOrder("cancelled", {
      paymentStatus: "confirmed",
      paymentAmountJpy: 8_800,
      cancelReason: "overdue_customer_no_show"
    });
    const repository = createRepository(makeOrder("confirmed"));
    repository.resolveOverdueAppointment.mockImplementation(async (_input, options) => {
      await options?.settle?.({ transactionClient: {} as never, order: cancelled });
      return {
        outcome: "ok",
        applied: true,
        resolution: {
          orderId: 41,
          orderNo: cancelled.orderNo,
          resolution: "customer_no_show",
          resolvedAt: now,
          systemReviewId: 901,
          order: cancelled
        }
      };
    });
    const ledger = { settleBookingCompletion: jest.fn() };
    const service = new BookingService(repository, ledger as never);

    await expect(
      service.resolveOverdueAppointment(
        customer,
        41,
        { resolution: "customer_no_show", idempotencyKey: "overdue-customer-no-show-01" },
        context
      )
    ).resolves.toMatchObject({ resolution: "customer_no_show", systemReviewId: 901 });
    expect(repository.resolveOverdueAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "customer",
        actorUserId: 101,
        resolvedByIdentityId: 1501,
        resolution: "customer_no_show"
      }),
      expect.objectContaining({ settle: expect.any(Function) })
    );
    expect(ledger.settleBookingCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingOrderId: 41,
        customerUserId: 101,
        serviceAmountJpy: 8_800
      }),
      expect.objectContaining({ transactionClient: expect.anything() })
    );
  });

  it("rejects overdue resolution without an active identity before repository mutation", async () => {
    const repository = createRepository(makeOrder("confirmed"));
    const service = new BookingService(repository);

    await expect(
      service.resolveOverdueAppointment(
        { ...customer, currentIdentityId: undefined },
        41,
        { resolution: "customer_no_show", idempotencyKey: "overdue-missing-identity-01" },
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(repository.resolveOverdueAppointment).not.toHaveBeenCalled();
  });

  it("rejects client actor mismatch before calling the repository", async () => {
    const repository = createRepository(makeOrder("confirmed"));
    const service = new BookingService(repository);

    await expect(
      service.startService(
        customer,
        41,
        {
          actor: "technician",
          verificationCode: "829104",
          idempotencyKey: "actor-mismatch-0001"
        },
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN, statusCode: 403 });
    expect(repository.startService).not.toHaveBeenCalled();
  });

  it.each([
    [
      { ...customer, userId: 999 },
      makeOrder("confirmed"),
      { actor: "customer" as const, idempotencyKey: "unrelated-customer-01" }
    ],
    [
      { ...assignedTechnician, currentIdentityScopeId: 999 },
      makeOrder("confirmed"),
      {
        actor: "technician" as const,
        verificationCode: "829104",
        idempotencyKey: "unrelated-technician"
      }
    ],
    [
      customer,
      makeOrder("confirmed", { technicianProfileId: null, technicianName: null }),
      { actor: "customer" as const, idempotencyKey: "missing-technician-01" }
    ]
  ])(
    "rejects unrelated or incomplete participants at the service boundary",
    async (requestActor, order, input) => {
      const repository = createRepository(order);
      const service = new BookingService(repository);
      await expect(service.startService(requestActor, 41, input, context)).rejects.toMatchObject({
        code: ERROR_CODES.NOT_FOUND,
        statusCode: 404
      });
      expect(repository.startService).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["not_found", ERROR_CODES.NOT_FOUND, 404],
    ["forbidden", ERROR_CODES.NOT_FOUND, 404],
    ["invalid_transition", ERROR_CODES.ORDER_INVALID_TRANSITION, 409],
    ["unresolved_add_on", ERROR_CODES.ORDER_INVALID_TRANSITION, 409],
    ["service_start_too_early", ERROR_CODES.ORDER_SERVICE_START_TOO_EARLY, 409],
    ["service_end_too_early", ERROR_CODES.ORDER_SERVICE_END_TOO_EARLY, 409],
    ["conflict", ERROR_CODES.IDEMPOTENCY_KEY_REUSED, 409]
  ] as const)(
    "maps repository outcome %s without participant leakage",
    async (outcome, code, statusCode) => {
      const repository = createRepository(makeOrder("inService"), { outcome });
      const service = new BookingService(repository);

      await expect(
        service.endService(
          customer,
          41,
          { reason: "customer_completed", idempotencyKey: "customer-end-0000001" },
          context
        )
      ).rejects.toMatchObject({ code, statusCode });
    }
  );

  it("maps invalid add-on catalog selections to a validated client error", async () => {
    const repository = createRepository(makeOrder("inService"), { outcome: "invalid_service" });
    const service = new BookingService(repository);

    await expect(
      service.createOrderAddOn(
        customer,
        41,
        { serviceId: 999, idempotencyKey: "add-on-invalid-0001" },
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION, statusCode: 400 });
  });

  it("passes add-on proposal and opposite-party decisions with authenticated actor scope", async () => {
    const order = makeOrder("inService");
    const repository = createRepository(order);
    const service = new BookingService(repository);

    await service.createOrderAddOn(
      assignedTechnician,
      41,
      { serviceId: 19, idempotencyKey: "add-on-propose-0001" },
      context
    );
    await service.acceptOrderAddOn(
      customer,
      41,
      9,
      { idempotencyKey: "add-on-accept-00001" },
      context
    );
    await service.rejectOrderAddOn(
      assignedTechnician,
      41,
      10,
      { idempotencyKey: "add-on-reject-00001" },
      context
    );

    expect(repository.createOrderAddOn).toHaveBeenCalledWith(
      expect.objectContaining({ actor: "technician", actorUserId: 202, serviceId: 19 })
    );
    expect(repository.decideOrderAddOn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ actor: "customer", decision: "accept", addOnId: 9 })
    );
    expect(repository.decideOrderAddOn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ actor: "technician", decision: "reject", addOnId: 10 })
    );
  });

  it("does not notify on an idempotent replay and ends service at awaiting checkout", async () => {
    const ended = makeOrder("awaitingCheckout", {
      serviceSession: {
        startedAt: now,
        expectedEndsAt: new Date("2026-09-01T11:00:00.000Z"),
        endedAt: new Date("2026-09-01T10:55:00.000Z"),
        addOns: []
      }
    });
    const repository = createRepository(makeOrder("inService"), ok(ended, false));
    const notifications = { notifyOrderStatusChanged: jest.fn() };
    const service = new BookingService(repository, undefined, notifications);

    await expect(
      service.endService(
        customer,
        41,
        { reason: "customer_completed", idempotencyKey: "customer-end-replay01" },
        context
      )
    ).resolves.toMatchObject({ status: "awaitingCheckout" });
    expect(notifications.notifyOrderStatusChanged).not.toHaveBeenCalled();
  });

  it("emits an exact-identity realtime change when a customer proposes an add-on", async () => {
    const inService = makeOrder("inService", {
      serviceSession: {
        startedAt: now,
        expectedEndsAt: new Date("2026-09-01T11:00:00.000Z"),
        endedAt: null,
        addOns: []
      }
    });
    const repository = createRepository(inService, ok(inService));
    repository.findOrderRealtimeRecipients = jest.fn().mockResolvedValue([
      { userId: 101, identityId: 1501 },
      { userId: 202, identityId: 1702 }
    ]);
    const notifications = {
      notifyOrderStatusChanged: jest.fn(),
      notifyOrderChanged: jest.fn()
    };
    const service = new BookingService(repository, undefined, notifications);

    await service.createOrderAddOn(
      customer,
      41,
      { serviceId: 19, idempotencyKey: "customer-addon-realtime-01" },
      context
    );

    expect(notifications.notifyOrderChanged).toHaveBeenCalledWith({
      actorIdentityId: 1501,
      actorUserId: 101,
      changeType: "add_on",
      orderId: 41,
      orderNo: "ND202609010041",
      recipients: [
        { userId: 101, identityId: 1501 },
        { userId: 202, identityId: 1702 }
      ]
    });
  });

  it("shows the stable code only on the owning customer detail and never exposes a hash", async () => {
    const order = makeOrder("confirmed");
    const repository = createRepository(order);
    const service = new BookingService(repository);

    const customerDetail = await service.getOrder(customer, 41);
    const technicianDetail = await service.getOrder(assignedTechnician, 41);
    const merchantDetail = await service.getOrder(
      {
        userId: 303,
        roles: ["merchant_owner"],
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 12
      },
      41
    );
    const platformDetail = await service.getOrder(
      {
        userId: 404,
        roles: ["operator"],
        currentIdentityType: "platform",
        currentIdentityScopeType: "global"
      },
      41
    );

    expect(customerDetail.serviceVerificationCode).toBe("829104");
    expect(technicianDetail.serviceVerificationCode).toBeUndefined();
    expect(merchantDetail.serviceVerificationCode).toBeUndefined();
    expect(platformDetail.serviceVerificationCode).toBeUndefined();
    expect(JSON.stringify(customerDetail)).not.toContain("verificationHash");
    expect(JSON.stringify(technicianDetail)).not.toContain("verificationHash");
  });
});

type RepositoryHarnessOptions = {
  status?: "CONFIRMED" | "IN_SERVICE";
  session?: boolean;
  guardedOrderUpdateCount?: number;
  startsAt?: Date;
  endsAt?: Date;
  sessionExpectedEndsAt?: Date;
  anytimeServiceTestEnabled?: boolean;
  overdueAppointmentGateEnabled?: boolean;
  overdueAppointment?: {
    orderId: number;
    orderNo: string;
    serviceName: string;
    startsAt: Date;
    endsAt: Date;
  };
  prepaid?: boolean;
  platformFeeAmountNdpSnapshot?: number;
  orderType?: "BOOKING" | "REQUEST";
  activePlatformSettingMissing?: boolean;
  service?: {
    id?: number;
    shopId?: number;
    status?: string;
    currency?: string;
    priceAmount?: string;
    durationMinutes?: number;
  } | null;
};

type HarnessSession = {
  id: number;
  bookingOrderId: number;
  verificationHash: string;
  startedAt: Date;
  expectedEndsAt: Date;
  endedAt: Date | null;
  deletedAt: Date | null;
  [key: string]: unknown;
};

type HarnessEvent = {
  id: number;
  idempotencyKey: string;
  eventType: string;
  actorUserId: number | null;
  bookingOrderId: number;
  orderAddOnId: number | null;
  [key: string]: unknown;
};

type HarnessAddOn = {
  id: number;
  status: string;
  proposedByUserId: number;
  durationMinutes: number;
  [key: string]: unknown;
};

const createRepositoryHarness = (options: RepositoryHarnessOptions = {}) => {
  const baseOrder = makeOrder(options.status === "IN_SERVICE" ? "inService" : "confirmed");
  const dbOrder = {
    ...baseOrder,
    orderType: "BOOKING",
    status: options.status ?? "CONFIRMED",
    paymentMethod: "ONSITE",
    paymentStatus: "PENDING",
    priceAmount: new Prisma.Decimal(baseOrder.priceAmount),
    pricingModeSnapshot: "MERCHANT",
    serviceOwnerType: "SHOP",
    servicePriceSnapshot: new Prisma.Decimal(baseOrder.servicePriceSnapshot!),
    serviceSnapshotJson: baseOrder.serviceSnapshot,
    fulfillmentMode: "store",
    customer: {
      id: customer.userId,
      needoId: "u0000000101",
      username: "预约用户",
      avatarUrl: null,
      avatarBootstrapUrl: null,
      customerProfile: null
    },
    service: { id: 11, name: baseOrder.serviceName },
    technicianService: null,
    shop: { id: 12, name: baseOrder.shopName },
    technicianProfile: {
      id: assignedTechnician.currentIdentityScopeId,
      userId: assignedTechnician.userId,
      displayName: baseOrder.technicianName
    },
    affiliateAttributions: [],
    statusHistory: [] as Array<Record<string, unknown>>,
    deletedAt: null
  };
  dbOrder.startsAt = options.startsAt ?? dbOrder.startsAt;
  dbOrder.endsAt = options.endsAt ?? dbOrder.endsAt;
  if (options.prepaid) {
    dbOrder.paymentStatus = "CONFIRMED";
    dbOrder.paymentAmountJpy = 8_800;
  }
  dbOrder.orderType = options.orderType ?? dbOrder.orderType;
  let session: HarnessSession | null = options.session
    ? {
        id: 81,
        bookingOrderId: dbOrder.id,
        verificationHash: "stored-hash",
        startedByUserId: customer.userId,
        startedAt: now,
        expectedEndsAt:
          options.sessionExpectedEndsAt ?? new Date("2026-09-01T11:00:00.000Z"),
        endedByUserId: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      }
    : null;
  const events: HarnessEvent[] = [];
  const addOns: HarnessAddOn[] = [];
  const overdueResolutions: Array<Record<string, unknown>> = [];
  const systemReviews: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const serviceOption = options.service === undefined ? {} : options.service;
  const catalogService =
    serviceOption === null
      ? null
      : {
          id: serviceOption.id ?? 19,
          publicId: "00000000-0000-4000-8000-000000000019",
          shopId: serviceOption.shopId ?? dbOrder.shopId,
          categoryId: 7,
          status: serviceOption.status ?? "published",
          name: "追加舒缓 30 分钟",
          description: "肩颈放松",
          priceAmount: new Prisma.Decimal(serviceOption.priceAmount ?? "4000.00"),
          currency: serviceOption.currency ?? "JPY",
          durationMinutes: serviceOption.durationMinutes ?? 30,
          createdAt: now,
          deletedAt: null
        };
  const projectedOrder = () => ({
    ...dbOrder,
    serviceSession: session ? { ...session, addOns: [...addOns] } : null
  });
  const workState={technicianProfileId:702,status:'on_duty',version:0,syncedAt:null as Date|null};
  const workEvents:Record<string,unknown>[]=[];
  let rawQueryCount = 0;
  const tx = {
    platformSettingVersion: {
      findFirst: jest.fn(async () =>
        options.activePlatformSettingMissing
          ? null
          : {
              anytimeServiceTestEnabled: options.anytimeServiceTestEnabled ?? false,
              overdueAppointmentGateEnabled: options.overdueAppointmentGateEnabled ?? false
            }
      )
    },
    technicianWorkState:{upsert:jest.fn(async()=>workState),update:jest.fn(async()=>workState),findFirst:jest.fn(async()=>({...workState})),updateMany:jest.fn(async({where,data}:{where:{version:number};data:{status:string;version:{increment:number};syncedAt:Date}})=>{if(where.version!==workState.version)return {count:0};workState.status=data.status;workState.version+=data.version.increment;workState.syncedAt=data.syncedAt;return {count:1}})},
    technicianWorkEvent:{create:jest.fn(async({data}:{data:Record<string,unknown>})=>{workEvents.push(data);return data})},
    auditLog:{create:jest.fn(async()=>({}))},
    orderFinancial: {
      findUnique: jest.fn(async () => options.prepaid ? ({
        platformFeeEnabledSnapshot: true,
        platformFeeAmountNdpSnapshot: options.platformFeeAmountNdpSnapshot ?? 500,
        platformFeePayerType: "shop",
        platformFeePayerId: 12,
        platformFeeWalletOwnerType: "SHOP",
        platformFeeWalletOwnerId: 12,
        cRequestFeeHoldNdp: 500,
        compensationBasisVersion: "compensation:v1",
        deletedAt: null
      }) : null),
      updateMany: jest.fn(async () => ({ count: options.prepaid ? 1 : 0 }))
    },
    orderOverdueResolution: {
      findUnique: jest.fn(async ({ where }: { where: { idempotencyKey?: string; bookingOrderId?: number } }) =>
        overdueResolutions.find((item) =>
          where.idempotencyKey ? item.idempotencyKey === where.idempotencyKey : item.bookingOrderId === where.bookingOrderId
        ) ?? null
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: overdueResolutions.length + 1, publicId: "00000000-0000-4000-8000-000000000099", systemReviewId: null, ...data };
        overdueResolutions.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        const row = overdueResolutions.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      })
    },
    orderReview: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: systemReviews.length + 901, tags: [], ...data };
        systemReviews.push(row);
        return row;
      }),
      findMany: jest.fn(async () => systemReviews)
    },
    customerProfile: { findFirst: jest.fn(async () => ({ id: 501, userId: 101 })) },
    technicianProfile: { findFirst: jest.fn(async () => ({ id: 702, userId: 202 })) },
    reviewSummary: { upsert: jest.fn(async () => ({})) },
    userIdentity: { findFirst: jest.fn(async () => ({ id: 1702 })) },
    notification: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { notifications.push(data); return data; }) },
    $queryRaw: jest.fn(async () => {
      rawQueryCount += 1;
      if (rawQueryCount === 1 || !options.overdueAppointment) return [{ id: dbOrder.id }];
      return [{
        order_id: options.overdueAppointment.orderId,
        order_no: options.overdueAppointment.orderNo,
        service_name: options.overdueAppointment.serviceName,
        starts_at: options.overdueAppointment.startsAt,
        effective_ends_at: options.overdueAppointment.endsAt
      }];
    }),
    bookingOrder: {
      findFirst: jest.fn(async (input?:{where?:{status?:string}}) => input?.where?.status&&input.where.status!==dbOrder.status?null:projectedOrder()),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(dbOrder, data);
        return { count: options.guardedOrderUpdateCount ?? 1 };
      })
    },
    orderStatusHistory: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        dbOrder.statusHistory.push({ id: dbOrder.statusHistory.length + 1, ...data });
        return dbOrder.statusHistory.at(-1);
      })
    },
    orderServiceSession: {
      findUnique: jest.fn(async () => session),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        session = {
          id: 81,
          endedByUserId: null,
          endedAt: null,
          deletedAt: null,
          ...data
        } as unknown as HarnessSession;
        return session;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(session!, data);
        return session;
      })
    },
    orderServiceEvent: {
      findUnique: jest.fn(
        async ({ where }: { where: { idempotencyKey: string } }) =>
          events.find((event) => event.idempotencyKey === where.idempotencyKey) ?? null
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const event = { id: events.length + 1, orderAddOnId: null, ...data } as HarnessEvent;
        events.push(event);
        return event;
      })
    },
    service: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (!catalogService) return null;
        if (
          catalogService.id !== where.id ||
          catalogService.shopId !== where.shopId ||
          catalogService.status !== where.status ||
          catalogService.deletedAt !== where.deletedAt
        ) {
          return null;
        }
        return catalogService;
      })
    },
    orderAddOn: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const addOn = {
          id: addOns.length + 9,
          acceptedByUserId: null,
          acceptedAt: null,
          rejectedByUserId: null,
          rejectedAt: null,
          resolutionReason: null,
          deletedAt: null,
          ...data
        } as unknown as HarnessAddOn;
        addOns.push(addOn);
        return addOn;
      }),
      findFirst: jest.fn(
        async ({ where }: { where: { id: number } }) =>
          addOns.find((addOn) => addOn.id === where.id) ?? null
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: { id: number; status: string }; data: object }) => {
          const addOn = addOns.find(
            (candidate) => candidate.id === where.id && candidate.status === where.status
          );
          if (!addOn) return { count: 0 };
          Object.assign(addOn, data);
          return { count: 1 };
        }
      ),
      count: jest.fn(
        async ({ where }: { where: { status: string } }) =>
          addOns.filter((addOn) => addOn.status === where.status).length
      )
    }
  };
  const client = {
    bookingOrder: tx.bookingOrder,
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => {
      const orderSnapshot = {
        ...dbOrder,
        statusHistory: dbOrder.statusHistory.map((entry) => ({ ...entry }))
      };
      const sessionSnapshot = session ? { ...session } : null;
      const eventSnapshot = events.map((event) => ({ ...event }));
      const addOnSnapshot = addOns.map((addOn) => ({ ...addOn }));
      const workSnapshot={...workState};const workEventCount=workEvents.length;
      try {
        return await callback(tx);
      } catch (error) {
        Object.assign(dbOrder, orderSnapshot);Object.assign(workState,workSnapshot);workEvents.splice(workEventCount);
        dbOrder.statusHistory.splice(
          0,
          dbOrder.statusHistory.length,
          ...orderSnapshot.statusHistory
        );
        session = sessionSnapshot;
        events.splice(0, events.length, ...eventSnapshot);
        addOns.splice(0, addOns.length, ...addOnSnapshot);
        throw error;
      }
    })
  };
  return {
    repository: new BookingRepository(client as never),
    workState,workEvents,
    dbOrder,
    events,
    addOns,
    overdueResolutions,
    systemReviews,
    notifications,
    tx,
    getSession: () => session
  };
};

const repositoryActor = {
  actorUserId: customer.userId,
  actor: "customer" as const,
  technicianProfileId: null,
  requestContext: context
};

const legalGenericTransition = {
  id: 41,
  actorUserId: customer.userId,
  fromStatus: "pending",
  toStatus: "confirmed"
} satisfies OrderTransitionRepositoryInput;

const illegalGenericTransition: OrderTransitionRepositoryInput = {
  ...legalGenericTransition,
  // @ts-expect-error generic transitions must not express fulfillment or completion pairs
  toStatus: "inService"
};
void illegalGenericTransition;

describe("formal order fulfillment repository transactions", () => {
  it("persists exactly one system zero rating and first-valid no-show resolution", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const harness = createRepositoryHarness({
        endsAt: new Date(now.getTime() - 60_000),
        overdueAppointmentGateEnabled: true
      });
      const input = {
        ...repositoryActor,
        orderId: 41,
        resolvedByIdentityId: 1501,
        resolution: "technician_no_show" as const,
        idempotencyKey: "repository-overdue-tech-no-show",
        requestFingerprint: "a".repeat(64)
      };

      await expect(harness.repository.resolveOverdueAppointment(input)).resolves.toMatchObject({
        outcome: "ok",
        applied: true,
        resolution: { resolution: "technician_no_show", systemReviewId: 901 }
      });
      expect(harness.dbOrder.status).toBe("CANCELLED");
      expect(harness.systemReviews).toEqual([
        expect.objectContaining({ authorType: "SYSTEM", rating: 0, reviewerUserId: null, targetType: "TECHNICIAN" })
      ]);
      expect(harness.notifications).toHaveLength(1);

      await expect(harness.repository.resolveOverdueAppointment(input)).resolves.toMatchObject({
        outcome: "ok",
        applied: false
      });
      expect(harness.systemReviews).toHaveLength(1);
      expect(harness.notifications).toHaveLength(1);

      await expect(harness.repository.resolveOverdueAppointment({
        ...input,
        resolution: "actually_completed",
        idempotencyKey: "repository-overdue-second-choice",
        requestFingerprint: "b".repeat(64)
      })).resolves.toEqual({ outcome: "already_resolved" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("targets the customer, never the technician actor, for a customer no-show rating", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const harness = createRepositoryHarness({
        endsAt: new Date(now.getTime() - 60_000),
        overdueAppointmentGateEnabled: true
      });
      await expect(harness.repository.resolveOverdueAppointment({
        actorUserId: assignedTechnician.userId,
        actor: "technician",
        technicianProfileId: assignedTechnician.currentIdentityScopeId,
        requestContext: context,
        orderId: 41,
        resolvedByIdentityId: assignedTechnician.currentIdentityId,
        resolution: "customer_no_show",
        idempotencyKey: "repository-overdue-customer-no-show",
        requestFingerprint: "c".repeat(64)
      })).resolves.toMatchObject({ outcome: "ok", applied: true });
      expect(harness.systemReviews).toEqual([
        expect.objectContaining({
          authorType: "SYSTEM",
          customerProfileId: 501,
          rating: 0,
          reviewerUserId: null,
          targetType: "CUSTOMER"
        })
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("replays normal service history for an actually-completed unpaid appointment without settlement", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const harness = createRepositoryHarness({ endsAt: new Date(now.getTime() - 60_000) });
      await expect(harness.repository.resolveOverdueAppointment({
        ...repositoryActor,
        orderId: 41,
        resolvedByIdentityId: 1501,
        resolution: "actually_completed",
        idempotencyKey: "repository-overdue-actually-completed",
        requestFingerprint: "d".repeat(64)
      })).resolves.toMatchObject({
        outcome: "ok",
        applied: true,
        resolution: { order: { status: "awaitingCheckout" }, systemReviewId: null }
      });
      expect(harness.dbOrder.statusHistory.map((item) => item.toStatus)).toEqual([
        "IN_SERVICE",
        "AWAITING_CHECKOUT"
      ]);
      expect(harness.events.map((item) => item.eventType)).toEqual([
        "SERVICE_STARTED",
        "SERVICE_ENDED"
      ]);
      expect(harness.systemReviews).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("settles prepaid no-show only from an exact 500 NDP frozen fee snapshot and marks payroll ready", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const valid = createRepositoryHarness({
        endsAt: new Date(now.getTime() - 60_000),
        prepaid: true,
        overdueAppointmentGateEnabled: true
      });
      const settle = jest.fn();
      const input = {
        ...repositoryActor,
        orderId: 41,
        resolvedByIdentityId: 1501,
        resolution: "technician_no_show" as const,
        idempotencyKey: "repository-overdue-prepaid-no-show",
        requestFingerprint: "e".repeat(64)
      };
      await expect(valid.repository.resolveOverdueAppointment(input, { settle })).resolves.toMatchObject({
        outcome: "ok",
        applied: true
      });
      expect(settle).toHaveBeenCalledTimes(1);
      expect(valid.tx.orderFinancial.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { settlementStatus: "ready_for_payroll", updatedAt: now } })
      );

      const invalid = createRepositoryHarness({
        endsAt: new Date(now.getTime() - 60_000),
        prepaid: true,
        overdueAppointmentGateEnabled: true,
        platformFeeAmountNdpSnapshot: 499
      });
      await expect(invalid.repository.resolveOverdueAppointment({
        ...input,
        idempotencyKey: "repository-overdue-invalid-fee",
        requestFingerprint: "f".repeat(64)
      }, { settle })).resolves.toEqual({ outcome: "invalid_state" });
      expect(invalid.overdueResolutions).toHaveLength(0);

      const requestOrder = createRepositoryHarness({
        endsAt: new Date(now.getTime() - 60_000),
        orderType: "REQUEST",
        prepaid: true,
        overdueAppointmentGateEnabled: true
      });
      await expect(requestOrder.repository.resolveOverdueAppointment({
        ...input,
        idempotencyKey: "repository-overdue-request-prepaid",
        requestFingerprint: "1".repeat(64)
      }, { settle: jest.fn() })).resolves.toMatchObject({ outcome: "ok", applied: true });
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps resolution available while the gate is off without automatic rating or settlement", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const harness = createRepositoryHarness({
        endsAt: new Date(now.getTime() - 60_000),
        prepaid: true,
        overdueAppointmentGateEnabled: false
      });
      const settle = jest.fn();

      await expect(harness.repository.resolveOverdueAppointment({
        ...repositoryActor,
        orderId: 41,
        resolvedByIdentityId: 1501,
        resolution: "technician_no_show",
        idempotencyKey: "repository-overdue-disabled-resolution",
        requestFingerprint: "2".repeat(64)
      }, { settle })).resolves.toMatchObject({
        outcome: "ok",
        applied: true,
        resolution: { systemReviewId: null }
      });

      expect(harness.dbOrder.status).toBe("CANCELLED");
      expect(harness.systemReviews).toHaveLength(0);
      expect(settle).not.toHaveBeenCalled();
      expect(harness.tx.orderFinancial.updateMany).not.toHaveBeenCalled();
      expect(harness.notifications).toHaveLength(1);

      const completed = createRepositoryHarness({
        endsAt: new Date(now.getTime() - 60_000),
        prepaid: true,
        overdueAppointmentGateEnabled: false
      });
      const completedSettle = jest.fn();
      await expect(completed.repository.resolveOverdueAppointment({
        ...repositoryActor,
        orderId: 41,
        resolvedByIdentityId: 1501,
        resolution: "actually_completed",
        idempotencyKey: "repository-overdue-disabled-completed",
        requestFingerprint: "3".repeat(64)
      }, { settle: completedSettle })).resolves.toMatchObject({
        outcome: "ok",
        applied: true,
        resolution: { order: { status: "awaitingCheckout" }, systemReviewId: null }
      });
      expect(completedSettle).not.toHaveBeenCalled();
      expect(completed.dbOrder.statusHistory.map((item) => item.toStatus)).toEqual([
        "IN_SERVICE",
        "AWAITING_CHECKOUT"
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("checks and locks an earlier unresolved appointment only when the gate is enabled", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    const overdueAppointment = {
      orderId: 17,
      orderNo: "ND202608310017",
      serviceName: "此前的到店护理",
      startsAt: new Date("2026-08-31T08:00:00.000Z"),
      endsAt: new Date("2026-08-31T09:00:00.000Z")
    };
    try {
      const enabled = createRepositoryHarness({
        overdueAppointmentGateEnabled: true,
        overdueAppointment
      });
      await expect(
        enabled.repository.startService({
          ...repositoryActor,
          orderId: 41,
          verificationCode: null,
          idempotencyKey: "repository-overdue-blocked"
        })
      ).resolves.toEqual({ outcome: "overdue_appointment_blocked", overdueAppointment });
      expect(enabled.events).toHaveLength(0);

      const disabled = createRepositoryHarness({
        overdueAppointmentGateEnabled: false,
        overdueAppointment
      });
      await expect(
        disabled.repository.startService({
          ...repositoryActor,
          orderId: 41,
          verificationCode: null,
          idempotencyKey: "repository-overdue-disabled"
        })
      ).resolves.toMatchObject({ outcome: "ok", applied: true });
    } finally {
      jest.useRealTimers();
    }
  });

  it("enforces the 30-minute start boundary unless anytime service testing is enabled", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const tooEarly = createRepositoryHarness({
        startsAt: new Date(now.getTime() + 30 * 60_000 + 1)
      });
      await expect(
        tooEarly.repository.startService({
          ...repositoryActor,
          orderId: 41,
          verificationCode: null,
          idempotencyKey: "repository-start-too-early"
        })
      ).resolves.toEqual({ outcome: "service_start_too_early" });
      expect(tooEarly.events).toHaveLength(0);

      const boundary = createRepositoryHarness({
        startsAt: new Date(now.getTime() + 30 * 60_000)
      });
      await expect(
        boundary.repository.startService({
          ...repositoryActor,
          orderId: 41,
          verificationCode: null,
          idempotencyKey: "repository-start-boundary"
        })
      ).resolves.toMatchObject({ outcome: "ok", applied: true });

      const enabled = createRepositoryHarness({
        startsAt: new Date(now.getTime() + 24 * 60 * 60_000),
        anytimeServiceTestEnabled: true
      });
      await expect(
        enabled.repository.startService({
          ...repositoryActor,
          orderId: 41,
          verificationCode: null,
          idempotencyKey: "repository-start-anytime"
        })
      ).resolves.toMatchObject({ outcome: "ok", applied: true });
      expect(enabled.tx.platformSettingVersion.findFirst).toHaveBeenCalled();

      const missingSettingUsesTestStageDefault = createRepositoryHarness({
        startsAt: new Date(now.getTime() + 24 * 60 * 60_000),
        activePlatformSettingMissing: true
      });
      await expect(
        missingSettingUsesTestStageDefault.repository.startService({
          ...repositoryActor,
          orderId: 41,
          verificationCode: null,
          idempotencyKey: "repository-start-default-on"
        })
      ).resolves.toMatchObject({ outcome: "ok", applied: true });
    } finally {
      jest.useRealTimers();
    }
  });

  it("requires expected service end time unless anytime service testing is enabled", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    try {
      const beforeEnd = createRepositoryHarness({
        status: "IN_SERVICE",
        session: true,
        sessionExpectedEndsAt: new Date(now.getTime() + 1)
      });
      await expect(
        beforeEnd.repository.endService({
          ...repositoryActor,
          orderId: 41,
          reason: "customer_completed",
          idempotencyKey: "repository-end-too-early"
        })
      ).resolves.toEqual({ outcome: "service_end_too_early" });
      expect(beforeEnd.events).toHaveLength(0);

      const boundary = createRepositoryHarness({
        status: "IN_SERVICE",
        session: true,
        sessionExpectedEndsAt: now
      });
      await expect(
        boundary.repository.endService({
          ...repositoryActor,
          orderId: 41,
          reason: "customer_completed",
          idempotencyKey: "repository-end-boundary"
        })
      ).resolves.toMatchObject({ outcome: "ok", applied: true });

      const enabled = createRepositoryHarness({
        status: "IN_SERVICE",
        session: true,
        sessionExpectedEndsAt: new Date(now.getTime() + 24 * 60 * 60_000),
        anytimeServiceTestEnabled: true
      });
      await expect(
        enabled.repository.endService({
          ...repositoryActor,
          orderId: 41,
          reason: "test_completed",
          idempotencyKey: "repository-end-anytime"
        })
      ).resolves.toMatchObject({ outcome: "ok", applied: true });
    } finally {
      jest.useRealTimers();
    }
  });

  it("uses the existing three-attempt bound and maps exhausted write conflicts", async () => {
    const transaction = jest.fn().mockRejectedValue({ code: "P2034" });
    const repository = new BookingRepository({ $transaction: transaction } as never);

    await expect(
      repository.startService({
        ...repositoryActor,
        orderId: 41,
        verificationCode: null,
        idempotencyKey: "repository-write-conflict"
      })
    ).resolves.toEqual({ outcome: "conflict" });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("starts from the immutable duration, stores only a domain hash, and replays once", async () => {
    const harness = createRepositoryHarness();
    const input = {
      ...repositoryActor,
      orderId: 41,
      verificationCode: null,
      idempotencyKey: "repository-start-0001"
    };

    await expect(harness.repository.startService(input)).resolves.toMatchObject({
      outcome: "ok",
      applied: true,
      order: { status: "inService" }
    });
    const firstExpectedEndsAt = harness.getSession()!.expectedEndsAt;
    expect(firstExpectedEndsAt.getTime() - harness.getSession()!.startedAt.getTime()).toBe(
      60 * 60_000
    );
    expect(harness.getSession()!.verificationHash).not.toBe(deriveOrderServiceVerificationCode(41));
    expect(harness.getSession()!.verificationHash).not.toMatch(/^\d{6}$/);
    expect(harness.events).toHaveLength(1);

    await expect(harness.repository.startService(input)).resolves.toMatchObject({
      outcome: "ok",
      applied: false
    });
    expect(harness.events).toHaveLength(1);
    expect(harness.getSession()!.expectedEndsAt).toEqual(firstExpectedEndsAt);
  });

  it("conflicts when the same user reuses a start key through another actor identity", async () => {
    const harness = createRepositoryHarness();
    const idempotencyKey = "repository-start-actor-change";
    await harness.repository.startService({
      ...repositoryActor,
      orderId: 41,
      verificationCode: null,
      idempotencyKey
    });
    harness.dbOrder.technicianProfile.userId = customer.userId;

    await expect(
      harness.repository.startService({
        actorUserId: customer.userId,
        actor: "technician",
        technicianProfileId: assignedTechnician.currentIdentityScopeId,
        requestContext: context,
        orderId: 41,
        verificationCode: deriveOrderServiceVerificationCode(41),
        idempotencyKey
      })
    ).resolves.toEqual({ outcome: "conflict" });
  });

  it("rejects a technician's wrong code and global key reuse by another actor", async () => {
    const harness = createRepositoryHarness();
    const technicianInput = {
      actorUserId: assignedTechnician.userId,
      actor: "technician" as const,
      technicianProfileId: assignedTechnician.currentIdentityScopeId,
      requestContext: context,
      orderId: 41,
      verificationCode: "000000",
      idempotencyKey: "repository-tech-start1"
    };
    await expect(harness.repository.startService(technicianInput)).resolves.toEqual({
      outcome: "verification_failed"
    });

    await harness.repository.startService({
      ...repositoryActor,
      orderId: 41,
      verificationCode: null,
      idempotencyKey: technicianInput.idempotencyKey
    });
    await expect(harness.repository.startService(technicianInput)).resolves.toEqual({
      outcome: "conflict"
    });
  });

  it("lets only the assigned technician start with the derived six-digit code", async () => {
    const harness = createRepositoryHarness();

    await expect(
      harness.repository.startService({
        actorUserId: assignedTechnician.userId,
        actor: "technician",
        technicianProfileId: assignedTechnician.currentIdentityScopeId,
        requestContext: context,
        orderId: 41,
        verificationCode: deriveOrderServiceVerificationCode(41),
        idempotencyKey: "repository-tech-start2"
      })
    ).resolves.toMatchObject({
      outcome: "ok",
      applied: true,
      order: { status: "inService" }
    });
  });

  it("rejects a wrong technician code before replaying a successful start key", async () => {
    const harness = createRepositoryHarness();
    const input = {
      actorUserId: assignedTechnician.userId,
      actor: "technician" as const,
      technicianProfileId: assignedTechnician.currentIdentityScopeId,
      requestContext: context,
      orderId: 41,
      verificationCode: deriveOrderServiceVerificationCode(41),
      idempotencyKey: "repository-tech-replay-code"
    };
    await harness.repository.startService(input);
    const expectedEndsAt = harness.getSession()!.expectedEndsAt;

    await expect(
      harness.repository.startService({ ...input, verificationCode: "000000" })
    ).resolves.toEqual({ outcome: "verification_failed" });
    expect(harness.events).toHaveLength(1);
    expect(harness.getSession()!.expectedEndsAt).toEqual(expectedEndsAt);
    expect(harness.dbOrder.statusHistory).toHaveLength(1);
  });

  it.each([
    [{ shopId: 999 }, "cross-shop"],
    [{ status: "draft" }, "unpublished"],
    [{ currency: "usd" }, "non-JPY"],
    [{ priceAmount: "4000.50" }, "fractional-JPY"]
  ] as const)(
    "rejects %s catalog data instead of trusting a client snapshot",
    async (service, label) => {
      const harness = createRepositoryHarness({ status: "IN_SERVICE", session: true, service });
      await expect(
        harness.repository.createOrderAddOn({
          ...repositoryActor,
          orderId: 41,
          serviceId: 19,
          idempotencyKey: `invalid-addon-${label.padEnd(20, "0")}`
        })
      ).resolves.toEqual({ outcome: "invalid_service" });
      expect(harness.addOns).toHaveLength(0);
    }
  );

  it("conflicts when a proposal key is reused with a different service", async () => {
    const harness = createRepositoryHarness({ status: "IN_SERVICE", session: true });
    const idempotencyKey = "repository-addon-service-change";
    await harness.repository.createOrderAddOn({
      ...repositoryActor,
      orderId: 41,
      serviceId: 19,
      idempotencyKey
    });

    await expect(
      harness.repository.createOrderAddOn({
        ...repositoryActor,
        orderId: 41,
        serviceId: 20,
        idempotencyKey
      })
    ).resolves.toEqual({ outcome: "conflict" });
  });

  it("snapshots a same-shop service and lets only the opposite participant accept once", async () => {
    const harness = createRepositoryHarness({ status: "IN_SERVICE", session: true });
    await harness.repository.createOrderAddOn({
      ...repositoryActor,
      orderId: 41,
      serviceId: 19,
      idempotencyKey: "repository-addon-propose"
    });
    expect(harness.addOns[0]).toMatchObject({
      serviceId: 19,
      serviceNameSnapshot: "追加舒缓 30 分钟",
      priceAmountJpy: 4000,
      currency: "JPY",
      durationMinutes: 30,
      proposedByUserId: customer.userId
    });
    const originalEnd = harness.getSession()!.expectedEndsAt;
    const decisionInput = {
      actorUserId: assignedTechnician.userId,
      actor: "technician" as const,
      technicianProfileId: assignedTechnician.currentIdentityScopeId,
      requestContext: context,
      orderId: 41,
      addOnId: harness.addOns[0].id,
      decision: "accept" as const,
      idempotencyKey: "repository-addon-accept1"
    };

    await expect(harness.repository.decideOrderAddOn(decisionInput)).resolves.toMatchObject({
      outcome: "ok",
      applied: true
    });
    expect(harness.getSession()!.expectedEndsAt.getTime() - originalEnd.getTime()).toBe(
      30 * 60_000
    );
    const acceptedEnd = harness.getSession()!.expectedEndsAt;
    await expect(harness.repository.decideOrderAddOn(decisionInput)).resolves.toMatchObject({
      outcome: "ok",
      applied: false
    });
    expect(harness.getSession()!.expectedEndsAt).toEqual(acceptedEnd);
  });

  it("blocks self-decision, does not extend on reject, and blocks end until resolved", async () => {
    const harness = createRepositoryHarness({ status: "IN_SERVICE", session: true });
    await harness.repository.createOrderAddOn({
      ...repositoryActor,
      orderId: 41,
      serviceId: 19,
      idempotencyKey: "repository-addon-propose2"
    });
    await expect(
      harness.repository.decideOrderAddOn({
        ...repositoryActor,
        orderId: 41,
        addOnId: harness.addOns[0].id,
        decision: "accept",
        idempotencyKey: "repository-self-accept01"
      })
    ).resolves.toEqual({ outcome: "forbidden" });
    await expect(
      harness.repository.endService({
        ...repositoryActor,
        orderId: 41,
        reason: "customer_completed",
        idempotencyKey: "repository-end-blocked"
      })
    ).resolves.toEqual({ outcome: "unresolved_add_on" });

    const beforeReject = harness.getSession()!.expectedEndsAt;
    await harness.repository.decideOrderAddOn({
      actorUserId: assignedTechnician.userId,
      actor: "technician",
      technicianProfileId: assignedTechnician.currentIdentityScopeId,
      requestContext: context,
      orderId: 41,
      addOnId: harness.addOns[0].id,
      decision: "reject",
      idempotencyKey: "repository-addon-reject1"
    });
    expect(harness.getSession()!.expectedEndsAt).toEqual(beforeReject);
    await expect(
      harness.repository.endService({
        ...repositoryActor,
        orderId: 41,
        reason: "customer_completed",
        idempotencyKey: "repository-end-success"
      })
    ).resolves.toMatchObject({
      outcome: "ok",
      applied: true,
      order: { status: "awaitingCheckout" }
    });
    expect(harness.dbOrder.status).toBe("AWAITING_CHECKOUT");
    expect(harness.events.at(-1)).toMatchObject({ eventType: "SERVICE_ENDED" });
  });

  it("conflicts when a decision key changes decision or add-on", async () => {
    const harness = createRepositoryHarness({ status: "IN_SERVICE", session: true });
    await harness.repository.createOrderAddOn({
      ...repositoryActor,
      orderId: 41,
      serviceId: 19,
      idempotencyKey: "repository-decision-proposal1"
    });
    await harness.repository.createOrderAddOn({
      ...repositoryActor,
      orderId: 41,
      serviceId: 19,
      idempotencyKey: "repository-decision-proposal2"
    });
    const firstAddOnId = harness.addOns[0].id;
    const secondAddOnId = harness.addOns[1].id;
    const decisionKey = "repository-decision-equivalence";
    const technicianDecision = {
      actorUserId: assignedTechnician.userId,
      actor: "technician" as const,
      technicianProfileId: assignedTechnician.currentIdentityScopeId,
      requestContext: context,
      orderId: 41,
      idempotencyKey: decisionKey
    };
    await harness.repository.decideOrderAddOn({
      ...technicianDecision,
      addOnId: firstAddOnId,
      decision: "accept"
    });

    await expect(
      harness.repository.decideOrderAddOn({
        ...technicianDecision,
        addOnId: firstAddOnId,
        decision: "reject"
      })
    ).resolves.toEqual({ outcome: "conflict" });
    await expect(
      harness.repository.decideOrderAddOn({
        ...technicianDecision,
        addOnId: secondAddOnId,
        decision: "accept"
      })
    ).resolves.toEqual({ outcome: "conflict" });
  });

  it("conflicts when an end key is reused with another reason", async () => {
    const harness = createRepositoryHarness({ status: "IN_SERVICE", session: true });
    const idempotencyKey = "repository-end-reason-change";
    await harness.repository.endService({
      ...repositoryActor,
      orderId: 41,
      reason: "customer_completed",
      idempotencyKey
    });

    await expect(
      harness.repository.endService({
        ...repositoryActor,
        orderId: 41,
        reason: "technician_completed",
        idempotencyKey
      })
    ).resolves.toEqual({ outcome: "conflict" });
  });

  it("fails closed for unknown projected add-on actors without exposing secrets", async () => {
    const harness = createRepositoryHarness({ status: "IN_SERVICE", session: true });
    harness.addOns.push({
      id: 99,
      serviceId: 19,
      serviceSessionId: 81,
      bookingOrderId: 41,
      status: "ACCEPTED",
      serviceNameSnapshot: "异常追加服务",
      priceAmountJpy: 1000,
      currency: "JPY",
      durationMinutes: 10,
      serviceSnapshotJson: {},
      proposedByUserId: 999,
      proposedAt: now,
      acceptedByUserId: 998,
      acceptedAt: now,
      rejectedByUserId: null,
      rejectedAt: null,
      resolutionReason: null,
      deletedAt: null
    });

    const projected = await harness.repository.findOrderById(41);
    expect(projected?.serviceSession?.addOns[0]).toMatchObject({
      proposedBy: null,
      resolvedBy: null
    });
    expect(JSON.stringify(projected)).not.toContain("verificationHash");
    expect(JSON.stringify(projected)).not.toContain("serviceVerificationCode");
  });

  it.each([
    ["start", { status: "CONFIRMED" as const, session: false }],
    ["end", { status: "IN_SERVICE" as const, session: true }]
  ])("rolls back %s when its guarded order update loses the race", async (command, setup) => {
    const harness = createRepositoryHarness({ ...setup, guardedOrderUpdateCount: 0 });
    const result =
      command === "start"
        ? await harness.repository.startService({
            ...repositoryActor,
            orderId: 41,
            verificationCode: null,
            idempotencyKey: "repository-start-rollback"
          })
        : await harness.repository.endService({
            ...repositoryActor,
            orderId: 41,
            reason: "customer_completed",
            idempotencyKey: "repository-end-rollback"
          });

    expect(result).toEqual({ outcome: "invalid_transition" });
    expect(harness.dbOrder.status).toBe(setup.status);
    expect(harness.dbOrder.statusHistory).toHaveLength(0);
    expect(harness.events).toHaveLength(0);
    if (command === "start") {
      expect(harness.getSession()).toBeNull();
    } else {
      expect(harness.getSession()).toMatchObject({ endedAt: null, endedByUserId: null });
    }
  });

  it("rejects a generic illegal transition before opening a transaction", async () => {
    const transaction = jest.fn();
    const repository = new BookingRepository({ $transaction: transaction } as never);

    await expect(
      repository.transitionOrder({
        id: 41,
        actorUserId: customer.userId,
        fromStatus: "pending",
        toStatus: "inService"
      } as never)
    ).resolves.toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('work status post-commit notification',()=>{
 it('notifies assigned technician after an applied start and end, but never on failed mutation',async()=>{
  const notifier={notifyTechnician:jest.fn(async()=>undefined)};
  const repository=createRepository(makeOrder('confirmed'),ok(makeOrder('inService')));
  repository.findLiveDashboardOrderEvents = jest.fn(async () => [{ orderId: 41, scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" }, orderNo: "order-41", status: "inService" as const, serviceName: "service", amountJpy: 8800 }]);
  const live = { publish: jest.fn(async () => null) };
  const service=new BookingService(repository,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,notifier,live);
  await service.startService(customer,41,{actor:'customer',idempotencyKey:'work-start-1'},context);
  expect(notifier.notifyTechnician).toHaveBeenCalledWith(702);
  expect(live.publish).toHaveBeenCalledTimes(2);
  expect(repository.startService.mock.invocationCallOrder[0]).toBeLessThan(notifier.notifyTechnician.mock.invocationCallOrder[0]!);
  expect(repository.startService.mock.invocationCallOrder[0]).toBeLessThan(live.publish.mock.invocationCallOrder[0]!);
  repository.findOrderById.mockResolvedValue(makeOrder('inService'));
  repository.endService.mockResolvedValue(ok(makeOrder('awaitingCheckout')));
  await service.endService(customer,41,{reason:'customer_completed',idempotencyKey:'work-end-1'},context);
  expect(notifier.notifyTechnician).toHaveBeenCalledTimes(2);
  expect(live.publish).toHaveBeenCalledTimes(4);
  repository.endService.mockResolvedValue({outcome:'invalid_transition'});
  await expect(service.endService(customer,41,{reason:'customer_completed',idempotencyKey:'work-end-2'},context)).rejects.toThrow();
  expect(notifier.notifyTechnician).toHaveBeenCalledTimes(2);
  expect(live.publish).toHaveBeenCalledTimes(4);
 });
});
