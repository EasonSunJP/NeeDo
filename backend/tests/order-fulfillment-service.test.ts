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
  ])("rejects unrelated or incomplete participants at the service boundary", async (requestActor, order, input) => {
    const repository = createRepository(order);
    const service = new BookingService(repository);
    await expect(service.startService(requestActor, 41, input, context)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      statusCode: 404
    });
    expect(repository.startService).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", ERROR_CODES.NOT_FOUND, 404],
    ["forbidden", ERROR_CODES.NOT_FOUND, 404],
    ["invalid_transition", ERROR_CODES.ORDER_INVALID_TRANSITION, 409],
    ["unresolved_add_on", ERROR_CODES.ORDER_INVALID_TRANSITION, 409],
    ["conflict", ERROR_CODES.IDEMPOTENCY_KEY_REUSED, 409]
  ] as const)("maps repository outcome %s without participant leakage", async (outcome, code, statusCode) => {
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
  });

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
  let session: HarnessSession | null = options.session
    ? {
        id: 81,
        bookingOrderId: dbOrder.id,
        verificationHash: "stored-hash",
        startedByUserId: customer.userId,
        startedAt: now,
        expectedEndsAt: new Date("2026-09-01T11:00:00.000Z"),
        endedByUserId: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      }
    : null;
  const events: HarnessEvent[] = [];
  const addOns: HarnessAddOn[] = [];
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
  const tx = {
    $queryRaw: jest.fn(async () => [{ id: dbOrder.id }]),
    bookingOrder: {
      findFirst: jest.fn(async () => projectedOrder()),
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
      try {
        return await callback(tx);
      } catch (error) {
        Object.assign(dbOrder, orderSnapshot);
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
    dbOrder,
    events,
    addOns,
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
    expect(harness.getSession()!.verificationHash).not.toBe(
      deriveOrderServiceVerificationCode(41)
    );
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
  ] as const)("rejects %s catalog data instead of trusting a client snapshot", async (service, label) => {
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
  });

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
