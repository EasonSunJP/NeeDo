/* eslint-disable @typescript-eslint/no-explicit-any -- stateful Prisma transaction harness */
import { BookingService } from "../src/services/booking.service";
import { BookingRepository } from "../src/repositories/booking.repository";
import { calculateOrderCheckoutSnapshot } from "../src/repositories/order-checkout-calculation";

const customer = {
  userId: 101,
  email: "customer@example.com",
  accessTokenJti: "checkout-customer-jti",
  accessTokenExpiresAt: 2_000_000_000,
  roles: ["customer"],
  permissions: [
    "order:checkout:read",
    "order:checkout:payment-method:write",
    "order:checkout:ndp:pay"
  ],
  currentIdentityType: "customer",
  currentIdentityScopeType: "customer_profile",
  currentIdentityScopeId: 501
};

describe("formal order checkout service", () => {
  it("calculates checkout as base plus accepted add-ons plus travel fare minus discount", () => {
    expect(calculateOrderCheckoutSnapshot({
      currency: "JPY", servicePrice: 8_800, travelFareAmountJpy: 500,
      addOns: [{ id: 1, status: "ACCEPTED", priceAmountJpy: 2_200, currency: "JPY", deletedAt: null }],
      affiliateAttribution: { originalPriceJpy: 8_800, customerDiscountJpy: 800, finalPriceJpy: 8_000 }
    }, { ruleId: 1, publicId: "rate-1", version: 1, ndpUnits: 1, jpyUnits: 1, effectiveFrom: new Date("2026-09-05T00:00:00.000Z") })).toMatchObject({
      baseAmountJpy: 8_800, addOnAmountJpy: 2_200, travelFareAmountJpy: 500,
      discountAmountJpy: 800, checkoutAmountJpy: 10_700, payableNdp: 10_700,
      calculation: { formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount", travelFareAmountJpy: 500 }
    });
  });
  it("creates and returns the immutable checkout projection for the owning customer", async () => {
    const repository = {
      getOrCreateCheckout: jest.fn(async () => ({
        outcome: "ok",
        applied: true,
        checkout: {
          orderId: 41,
          status: "awaitingCheckout",
          baseAmountJpy: 8_800,
          addOnAmountJpy: 2_200,
          discountAmountJpy: 800,
          checkoutAmountJpy: 10_200,
          payableNdp: 15_300,
          rate: { ruleId: 7, version: 3, ndpUnits: 3, jpyUnits: 2 },
          paymentMethod: null,
          paymentSelectedAt: null,
          otherMethod: null,
          paymentEvidence: null,
          createdAt: new Date("2026-09-01T10:00:00.000Z"),
          updatedAt: new Date("2026-09-01T10:00:00.000Z")
        }
      }))
    };
    const rateService = {
      resolveEffectiveRate: jest.fn(async () => ({
        ruleId: 7,
        publicId: "00000000-0000-4000-8000-000000000007",
        version: 3,
        ndpUnits: 3,
        jpyUnits: 2,
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z")
      }))
    };
    const service = new BookingService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      rateService as never
    );

    await expect(service.getCheckout(customer, 41)).resolves.toMatchObject({
      orderId: 41,
      checkoutAmountJpy: 10_200,
      payableNdp: 15_300,
      paymentEvidence: null
    });
    expect(repository.getOrCreateCheckout).toHaveBeenCalledTimes(1);
  });

  it("does not expose checkout to a non-participant", async () => {
    const repository = {
      getOrCreateCheckout: jest.fn(async () => ({ outcome: "not_found" }))
    };
    const service = new BookingService(repository as never);

    await expect(service.getCheckout(customer, 999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("captures one authoritative instant and passes the effective half-open rate snapshot once", async () => {
    const captured = new Date("2026-10-01T00:00:00.000Z");
    const repository = {
      getOrCreateCheckout: jest
        .fn()
        .mockResolvedValueOnce({ outcome: "rate_required" })
        .mockResolvedValueOnce({ outcome: "ok", applied: true, checkout: { orderId: 41 } })
    };
    const rateService = {
      resolveEffectiveRate: jest.fn(async (at: Date) => ({
        ruleId: 8,
        publicId: "00000000-0000-4000-8000-000000000008",
        version: 4,
        ndpUnits: 5,
        jpyUnits: 4,
        effectiveFrom: at
      }))
    };
    const service = new BookingService(
      repository as never,
      undefined,
      undefined,
      undefined,
      undefined,
      rateService as never,
      () => captured
    );
    await service.getCheckout(customer, 41);
    expect(rateService.resolveEffectiveRate).toHaveBeenCalledWith(captured);
    expect(repository.getOrCreateCheckout).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        rate: expect.objectContaining({ ruleId: 8, resolvedAt: captured })
      })
    );
  });

  it("keeps a committed NDP payment successful when the post-commit order lookup fails", async () => {
    const checkout = {
      id: 9,
      orderId: 41,
      status: "completed",
      paymentMethod: "ndp",
      paymentEvidence: "ndp_ledger"
    };
    const repository = {
      payCheckoutWithNdp: jest.fn(async () => ({ outcome: "ok", applied: true, checkout })),
      findOrderById: jest.fn(async () => {
        throw new Error("post-commit order lookup unavailable");
      })
    };
    const ledger = {
      debitCheckoutPayment: jest.fn(async () => ({ transactionId: 91 })),
      settleBookingCompletion: jest.fn(async () => undefined)
    };
    const service = new BookingService(repository as never, ledger as never);

    await expect(
      service.payCheckoutWithNdp(
        customer,
        41,
        { idempotencyKey: "checkout-service-best-effort-1" },
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).resolves.toMatchObject({
      ...checkout,
      availablePaymentMethods: ["cash", "ndp"]
    });
    expect(repository.findOrderById).toHaveBeenCalledWith(41);
  });

  it("still publishes a committed NDP completion when notification lookup finds no order", async () => {
    const checkout = {
      id: 9,
      orderId: 41,
      status: "completed",
      paymentMethod: "ndp",
      paymentEvidence: "ndp_ledger"
    };
    const repository = {
      payCheckoutWithNdp: jest.fn(async () => ({ outcome: "ok", applied: true, checkout })),
      findOrderById: jest.fn(async () => null),
      findLiveDashboardOrderEvents: jest.fn(async () => [
        {
          orderId: 41,
          scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
          orderNo: "ND41",
          status: "completed" as const,
          serviceName: "Service",
          amountJpy: 8_800
        }
      ])
    };
    const ledger = { debitCheckoutPayment: jest.fn(async () => ({ transactionId: 91 })) };
    const publisher = { publish: jest.fn(async () => null) };
    const service = new BookingService(
      repository as never,
      ledger as never,
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
      service.payCheckoutWithNdp(
        customer,
        41,
        { idempotencyKey: "checkout-null-notification-order-1" },
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).resolves.toEqual({ ...checkout, availablePaymentMethods: ["cash", "ndp"] });

    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });

  it("publishes every applied checkout advance once and skips idempotent replays", async () => {
    const cashCheckout = {
      id: 9,
      orderId: 41,
      status: "awaitingPaymentConfirmation",
      paymentMethod: "cash",
      paymentEvidence: null
    };
    const ndpCheckout = {
      ...cashCheckout,
      status: "completed",
      paymentMethod: "ndp",
      paymentEvidence: "ndp_ledger"
    };
    const repository = {
      selectCheckoutPaymentMethod: jest
        .fn()
        .mockResolvedValueOnce({ outcome: "ok", applied: true, checkout: cashCheckout })
        .mockResolvedValueOnce({ outcome: "ok", applied: false, checkout: cashCheckout }),
      payCheckoutWithNdp: jest
        .fn()
        .mockResolvedValueOnce({ outcome: "ok", applied: true, checkout: ndpCheckout })
        .mockResolvedValueOnce({ outcome: "ok", applied: false, checkout: ndpCheckout }),
      confirmCheckoutReceipt: jest
        .fn()
        .mockResolvedValueOnce({ outcome: "ok", applied: true, checkout: cashCheckout })
        .mockResolvedValueOnce({ outcome: "ok", applied: false, checkout: cashCheckout })
        .mockResolvedValueOnce({ outcome: "ok", applied: true, checkout: cashCheckout })
        .mockResolvedValueOnce({ outcome: "ok", applied: false, checkout: cashCheckout }),
      findOrderById: jest.fn(async () => ({
        id: 41,
        orderNo: "ND41",
        serviceName: "Service",
        customerUserId: 101,
        technicianProfileId: 702
      })),
      findLiveDashboardOrderEvents: jest.fn(async () => [
        {
          orderId: 41,
          scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
          orderNo: "ND41",
          status: "completed" as const,
          serviceName: "Service",
          amountJpy: 8_800
        }
      ])
    };
    const ledger = { debitCheckoutPayment: jest.fn(async () => ({ transactionId: 91 })) };
    const audit = {
      record: jest.fn(async () => undefined),
      createInput: jest.fn((input) => input)
    };
    const publisher = { publish: jest.fn(async () => null) };
    const technician = {
      ...customer,
      userId: 202,
      roles: ["technician"],
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician_profile",
      currentIdentityScopeId: 702
    };
    const operator = {
      ...customer,
      userId: 303,
      roles: ["operator"],
      currentIdentityType: "platform",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null
    };
    const service = new BookingService(
      repository as never,
      ledger as never,
      undefined,
      audit as never,
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

    await service.selectCheckoutPaymentMethod(
      customer,
      41,
      {
        method: "cash",
        idempotencyKey: "select-cash-live-1"
      },
      context
    );
    await service.selectCheckoutPaymentMethod(
      customer,
      41,
      {
        method: "cash",
        idempotencyKey: "select-cash-live-1"
      },
      context
    );
    await service.payCheckoutWithNdp(
      customer,
      41,
      {
        idempotencyKey: "pay-ndp-live-1"
      },
      context
    );
    await service.payCheckoutWithNdp(
      customer,
      41,
      {
        idempotencyKey: "pay-ndp-live-1"
      },
      context
    );
    await service.confirmCheckoutReceipt(
      technician as never,
      41,
      {
        reason: "cash received",
        idempotencyKey: "receipt-live-1"
      },
      context
    );
    await service.confirmCheckoutReceipt(
      technician as never,
      41,
      {
        reason: "cash received",
        idempotencyKey: "receipt-live-1"
      },
      context
    );
    await service.confirmCheckoutReceipt(
      operator as never,
      41,
      {
        reason: "terminal verified",
        idempotencyKey: "override-live-1"
      },
      context,
      true
    );
    await service.confirmCheckoutReceipt(
      operator as never,
      41,
      {
        reason: "terminal verified",
        idempotencyKey: "override-live-1"
      },
      context,
      true
    );

    expect(repository.findLiveDashboardOrderEvents).toHaveBeenCalledTimes(4);
    expect(repository.findLiveDashboardOrderEvents).toHaveBeenCalledWith([41]);
    expect(publisher.publish).toHaveBeenCalledTimes(8);
  });
});

const decimal = (value: number) => ({
  toString: () => String(value),
  toFixed: (places = 0) => value.toFixed(places)
});

const createRepositoryHarness = (
  options: {
    affiliateInvalid?: boolean;
    overflow?: boolean;
    auditFailure?: boolean;
    activeRefundCase?: boolean;
    refundUpdateConflict?: boolean;
  } = {}
) => {
  const order: any = {
    id: 41,
    orderNo: "ND41",
    orderType: "BOOKING",
    status: "AWAITING_CHECKOUT",
    paymentMethod: "ONSITE",
    paymentStatus: "PENDING",
    paymentAmountJpy: 0,
    paymentConfirmedById: null,
    paymentConfirmedAt: null,
    paymentReference: null,
    paymentNote: null,
    paymentRefundedById: null,
    paymentRefundedAt: null,
    paymentRefundReference: null,
    paymentRefundReason: null,
    customerUserId: 101,
    serviceId: 11,
    technicianServiceId: null,
    shopId: 12,
    technicianProfileId: 702,
    scheduleSlotId: 13,
    fulfillmentMode: "store",
    serviceNameSnapshot: "Service",
    pricingModeSnapshot: "merchant",
    serviceOwnerType: "shop",
    serviceOwnerId: 11,
    servicePriceSnapshot: decimal(options.overflow ? 2_147_483_647 : 8_800),
    serviceDurationSnapshot: 60,
    serviceSnapshotJson: {},
    service: { name: "Service" },
    technicianService: null,
    shop: { name: "Shop" },
    technicianProfile: { userId: 202, displayName: "Tech" },
    priceAmount: decimal(8_800),
    currency: "JPY",
    startsAt: new Date("2026-09-01T09:00:00.000Z"),
    endsAt: new Date("2026-09-01T10:00:00.000Z"),
    note: null,
    cancelReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    serviceSession: {
      id: 5,
      startedAt: new Date("2026-09-01T09:00:00.000Z"),
      expectedEndsAt: new Date("2026-09-01T10:00:00.000Z"),
      endedAt: new Date("2026-09-01T10:00:00.000Z"),
      addOns: [
        {
          id: 3,
          serviceId: 19,
          status: "ACCEPTED",
          serviceNameSnapshot: "Extra",
          priceAmountJpy: options.overflow ? 1 : 2_200,
          currency: "JPY",
          durationMinutes: 30,
          serviceSnapshotJson: {},
          proposedByUserId: 202,
          proposedAt: new Date(),
          acceptedByUserId: 101,
          acceptedAt: new Date(),
          rejectedByUserId: null,
          rejectedAt: null,
          resolutionReason: null,
          deletedAt: null
        }
      ]
    },
    statusHistory: [
      {
        id: 1,
        bookingOrderId: 41,
        fromStatus: "PENDING",
        toStatus: "CONFIRMED",
        actorUserId: 202,
        reason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      }
    ],
    performanceAssessment: null,
    performanceRevisions: [],
    affiliateAttributions: options.affiliateInvalid
      ? [
          {
            id: 1,
            taskId: 1,
            source: "CODE",
            originalPriceJpy: 8_800,
            customerDiscountJpy: 800,
            finalPriceJpy: 8_001,
            rewardAllocatedNdp: 10,
            status: "ATTRIBUTED",
            claim: { publicCode: "A" }
          }
        ]
      : [
          {
            id: 1,
            taskId: 1,
            source: "CODE",
            originalPriceJpy: options.overflow ? 2_147_483_647 : 8_800,
            customerDiscountJpy: options.overflow ? 0 : 800,
            finalPriceJpy: options.overflow ? 2_147_483_647 : 8_000,
            rewardAllocatedNdp: 10,
            status: "ATTRIBUTED",
            claim: { publicCode: "A" }
          }
        ]
  };
  let checkout: any = null;
  const events: any[] = [];
  const histories: any[] = [];
  const audits: any[] = [];
  const financial: any = {
    id: 77,
    bookingOrderId: order.id,
    moneyTimelineJson: [],
    paymentChannel: "unknown",
    serviceIncomeStatus: "unreported"
  };
  let nextCheckoutId = 9;
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-US");
  const tx: any = {
    $queryRaw: jest.fn(async () => [{ id: order.id }]),
    bookingOrder: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === order.id && !order.deletedAt ? order : null
      ),
      count: jest.fn(async ({ where }: any) =>
        where.technicianProfileId === order.technicianProfileId &&
        where.status === order.status &&
        !order.deletedAt
          ? 1
          : 0
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (options.refundUpdateConflict && data.paymentStatus === "REFUNDED") {
          return { count: 0 };
        }
        if (
          where.id !== order.id ||
          (where.status && where.status !== order.status) ||
          (where.paymentStatus && where.paymentStatus !== order.paymentStatus)
        )
          return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      })
    },
    orderPerformanceAssessment: {
      groupBy: jest.fn(async () => [])
    },
    technicianPerformanceSummary: {
      upsert: jest.fn(async ({ create, update }: any) => ({
        id: 1,
        technicianProfileId: order.technicianProfileId,
        ...(create ?? update),
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
        updatedAt: new Date("2026-09-01T10:00:00.000Z")
      }))
    },
    orderCheckout: {
      findUnique: jest.fn(async ({ where }: any) =>
        checkout &&
        ((where.bookingOrderId && where.bookingOrderId === checkout.bookingOrderId) ||
          (where.id && where.id === checkout.id))
          ? checkout
          : null
      ),
      create: jest.fn(async ({ data }: any) => {
        checkout = {
          id: nextCheckoutId++,
          paymentMethod: null,
          paymentSelectedAt: null,
          otherMethodCode: null,
          otherMethodLabel: null,
          otherPaymentReference: null,
          ledgerTransactionId: null,
          receiptConfirmedById: null,
          receiptConfirmedAt: null,
          receiptConfirmationReason: null,
          deletedAt: null,
          ...data
        };
        return checkout;
      }),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(checkout, data);
        return checkout;
      })
    },
    orderRefundCase: {
      findFirst: jest.fn(async () =>
        options.activeRefundCase ? { id: 81, activeKey: `booking:${order.id}` } : null
      )
    },
    orderServiceEvent: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          events.find(
            (event) => normalize(event.idempotencyKey) === normalize(where.idempotencyKey)
          ) ?? null
      ),
      findFirst: jest.fn(
        async () =>
          [...events].reverse().find((event) => event.eventType === "RECEIPT_CONFIRMED") ?? null
      ),
      create: jest.fn(async ({ data }: any) => {
        const event = { id: events.length + 1, deletedAt: null, ...data };
        events.push(event);
        return event;
      })
    },
    orderStatusHistory: {
      create: jest.fn(async ({ data }: any) => {
        histories.push(data);
        order.statusHistory.push({ id: histories.length + 10, deletedAt: null, ...data });
        return data;
      })
    },
    orderFinancial: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.bookingOrderId === order.id || where.id === financial.id ? financial : null
      ),
      update: jest.fn(async ({ where, data }: any) => {
        if (where.id !== financial.id) throw new Error("financial missing");
        Object.assign(financial, data);
        return financial;
      }),
      upsert: jest.fn(async () => null)
    },
    auditLog: {
      findFirst: jest.fn(
        async ({ where }: any) =>
          [...audits]
            .reverse()
            .find(
              (audit) =>
                audit.actorId === where.actorId &&
                audit.action === where.action &&
                audit.targetType === where.targetType &&
                audit.targetId === where.targetId &&
                !audit.deletedAt
            ) ?? null
      ),
      create: jest.fn(async ({ data }: any) => {
        if (options.auditFailure) throw new Error("audit failed");
        audits.push({ id: audits.length + 1, deletedAt: null, ...data });
        return data;
      })
    }
  };
  const client: any = {
    $transaction: jest.fn(async (handler: (value: any) => Promise<unknown>) => {
      const orderSnapshot = { ...order, statusHistory: [...order.statusHistory] };
      const checkoutSnapshot = checkout ? { ...checkout } : null;
      const eventLength = events.length;
      const historyLength = histories.length;
      const auditLength = audits.length;
      const financialSnapshot = { ...financial };
      try {
        return await handler(tx);
      } catch (error) {
        Object.keys(order).forEach((key) => delete order[key]);
        Object.assign(order, orderSnapshot);
        checkout = checkoutSnapshot;
        events.splice(eventLength);
        histories.splice(historyLength);
        audits.splice(auditLength);
        Object.keys(financial).forEach((key) => delete financial[key]);
        Object.assign(financial, financialSnapshot);
        throw error;
      }
    })
  };
  return {
    repository: new BookingRepository(client),
    order,
    events,
    histories,
    audits,
    financial,

    bookingOrderUpdateMany: tx.bookingOrder.updateMany,
    orderFinancialFindUnique: tx.orderFinancial.findUnique,
    orderFinancialUpdate: tx.orderFinancial.update,
    orderRefundCaseFindFirst: tx.orderRefundCase.findFirst,
    performanceSummaryUpsert: tx.technicianPerformanceSummary.upsert,
    transaction: client.$transaction,
    get checkout() {
      return checkout;
    }
  };
};

const rate = {
  ruleId: 7,
  publicId: "00000000-0000-4000-8000-000000000007",
  version: 3,
  ndpUnits: 3,
  jpyUnits: 2,
  effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
  resolvedAt: new Date("2026-09-01T10:00:00.000Z")
};
const customerInput = { orderId: 41, actorUserId: 101, technicianProfileId: null };
const completionOptions = {
  settle: async () => undefined,
  settleAffiliate: async () => undefined
};

describe("formal checkout repository state", () => {
  it("creates one immutable affiliate/add-on/rate snapshot with BigInt ceil and supports only exact participants", async () => {
    const h = createRepositoryHarness();
    const first = await h.repository.getOrCreateCheckout({ ...customerInput, rate });
    expect(first).toMatchObject({
      outcome: "ok",
      applied: true,
      checkout: {
        baseAmountJpy: 8_800,
        addOnAmountJpy: 2_200,
        discountAmountJpy: 800,
        checkoutAmountJpy: 10_200,
        payableNdp: 15_300
      }
    });
    const repeated = await h.repository.getOrCreateCheckout({
      ...customerInput,
      rate: { ...rate, ndpUnits: 99 }
    });
    expect(repeated).toMatchObject({
      outcome: "ok",
      applied: false,
      checkout: { payableNdp: 15_300 }
    });
    expect(h.events.filter((event) => event.eventType === "CHECKOUT_CREATED")).toHaveLength(1);
    await expect(
      h.repository.getOrCreateCheckout({
        orderId: 41,
        actorUserId: 202,
        technicianProfileId: 702,
        rate: null
      })
    ).resolves.toMatchObject({ outcome: "ok" });
    await expect(
      h.repository.getOrCreateCheckout({
        orderId: 41,
        actorUserId: 999,
        technicianProfileId: null,
        rate: null
      })
    ).resolves.toEqual({ outcome: "not_found" });
  });

  it("fails closed on inconsistent affiliate history and signed-INT overflow", async () => {
    await expect(
      createRepositoryHarness({ affiliateInvalid: true }).repository.getOrCreateCheckout({
        ...customerInput,
        rate
      })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });
    await expect(
      createRepositoryHarness({ overflow: true }).repository.getOrCreateCheckout({
        ...customerInput,
        rate
      })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });
  });

  it("rounds payable NDP upward with checked BigInt arithmetic", async () => {
    const h = createRepositoryHarness();
    h.order.affiliateAttributions[0].customerDiscountJpy = 801;
    h.order.affiliateAttributions[0].finalPriceJpy = 7_999;
    const result = await h.repository.getOrCreateCheckout({
      ...customerInput,
      rate: { ...rate, ndpUnits: 1, jpyUnits: 3 }
    });
    expect(result).toMatchObject({
      outcome: "ok",
      checkout: { checkoutAmountJpy: 10_199, payableNdp: 3_400 }
    });
  });

  it("fails closed before writes when completion hooks or evidence-specific audit are missing", async () => {
    const ndp = createRepositoryHarness();
    await ndp.repository.getOrCreateCheckout({ ...customerInput, rate });
    const debit = jest.fn(async () => ({ transactionId: 91 }));
    await expect(
      ndp.repository.payCheckoutWithNdp(
        { ...customerInput, idempotencyKey: "checkout-hooks-required-1" },
        { debit } as any
      )
    ).resolves.toEqual({ outcome: "invalid_snapshot" });
    expect(debit).not.toHaveBeenCalled();
    expect(ndp.order.status).toBe("AWAITING_CHECKOUT");
    expect(ndp.events.some((event) => event.idempotencyKey === "checkout-hooks-required-1")).toBe(
      false
    );

    const technician = createRepositoryHarness();
    await technician.repository.getOrCreateCheckout({ ...customerInput, rate });
    await technician.repository.selectCheckoutPaymentMethod({
      ...customerInput,
      method: "cash",
      idempotencyKey: "checkout-hooks-select-1"
    });
    await expect(
      (technician.repository.confirmCheckoutReceipt as any)({
        orderId: 41,
        actorUserId: 202,
        technicianProfileId: 702,
        reason: "cash received",
        idempotencyKey: "checkout-hooks-required-2",
        evidence: "technician_receipt_confirmation"
      })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });
    expect(technician.checkout.receiptConfirmedAt).toBeNull();

    const operations = createRepositoryHarness();
    await operations.repository.getOrCreateCheckout({ ...customerInput, rate });
    await operations.repository.selectCheckoutPaymentMethod({
      ...customerInput,
      method: "cash",
      idempotencyKey: "checkout-audit-select-required-1"
    });
    await expect(
      (operations.repository.confirmCheckoutReceipt as any)(
        {
          orderId: 41,
          actorUserId: 303,
          technicianProfileId: null,
          reason: "verified receipt",
          idempotencyKey: "checkout-audit-required-1",
          evidence: "operations_receipt_override"
        },
        { settle: async () => undefined, settleAffiliate: async () => undefined }
      )
    ).resolves.toEqual({ outcome: "invalid_snapshot" });
    expect(operations.checkout.receiptConfirmedAt).toBeNull();

    await expect(
      (operations.repository.confirmCheckoutReceipt as any)(
        {
          orderId: 41,
          actorUserId: 202,
          technicianProfileId: 702,
          reason: "cash received",
          idempotencyKey: "checkout-technician-audit-forbidden-1",
          evidence: "technician_receipt_confirmation",
          audit: {
            actorId: 202,
            action: "backoffice.order.checkout.receipt_override",
            targetType: "BookingOrder",
            targetId: 41
          }
        },
        { settle: async () => undefined, settleAffiliate: async () => undefined }
      )
    ).resolves.toEqual({ outcome: "invalid_snapshot" });
    expect(operations.checkout.receiptConfirmedAt).toBeNull();
  });

  it("rejects an unknown receipt evidence value before opening a transaction or writing", async () => {
    const h = createRepositoryHarness();
    await h.repository.getOrCreateCheckout({ ...customerInput, rate });
    await h.repository.selectCheckoutPaymentMethod({
      ...customerInput,
      method: "cash",
      idempotencyKey: "checkout-invalid-evidence-select-1"
    });
    const transactionCount = h.transaction.mock.calls.length;
    const eventCount = h.events.length;
    const historyCount = h.histories.length;

    await expect(
      (h.repository.confirmCheckoutReceipt as any)(
        {
          orderId: 41,
          actorUserId: 202,
          technicianProfileId: 702,
          reason: "cash received",
          idempotencyKey: "checkout-invalid-evidence-1",
          evidence: "unknown_receipt_evidence"
        },
        completionOptions
      )
    ).resolves.toEqual({ outcome: "invalid_snapshot" });
    expect(h.transaction).toHaveBeenCalledTimes(transactionCount);
    expect(h.events).toHaveLength(eventCount);
    expect(h.histories).toHaveLength(historyCount);
    expect(h.checkout.receiptConfirmedAt).toBeNull();
    expect(h.order.status).toBe("AWAITING_PAYMENT_CONFIRMATION");
  });

  it("does not move awaiting payment confirmation back to awaiting checkout", async () => {
    const h = createRepositoryHarness();
    await h.repository.getOrCreateCheckout({ ...customerInput, rate });
    await h.repository.selectCheckoutPaymentMethod({
      ...customerInput,
      method: "cash",
      idempotencyKey: "checkout-no-backward-select-1"
    });
    h.checkout.paymentMethod = null;
    h.checkout.paymentSelectedAt = null;

    await expect(
      h.repository.selectCheckoutPaymentMethod({
        ...customerInput,
        method: "ndp",
        idempotencyKey: "checkout-no-backward-select-2"
      })
    ).resolves.toEqual({ outcome: "invalid_state" });
    expect(h.order.status).toBe("AWAITING_PAYMENT_CONFIRMATION");
    expect(h.events.some((event) => event.idempotencyKey === "checkout-no-backward-select-2")).toBe(
      false
    );
  });

  it("selects cash without completing, then exact technician receipt completes once", async () => {
    const h = createRepositoryHarness();
    await h.repository.getOrCreateCheckout({ ...customerInput, rate });
    const selected = await h.repository.selectCheckoutPaymentMethod({
      ...customerInput,
      method: "cash",
      idempotencyKey: "checkout-select-cash-001"
    });
    expect(selected).toMatchObject({
      outcome: "ok",
      checkout: {
        status: "awaitingPaymentConfirmation",
        paymentMethod: "cash",
        paymentEvidence: null
      }
    });
    expect(h.order.status).toBe("AWAITING_PAYMENT_CONFIRMATION");
    const settle = jest.fn(async () => undefined);
    const affiliate = jest.fn(async () => undefined);
    const receipt = await h.repository.confirmCheckoutReceipt(
      {
        orderId: 41,
        actorUserId: 202,
        technicianProfileId: 702,
        reason: "cash received",
        idempotencyKey: "checkout-receipt-cash-01",
        evidence: "technician_receipt_confirmation"
      },
      { settle, settleAffiliate: affiliate }
    );
    expect(receipt).toMatchObject({
      outcome: "ok",
      applied: true,
      checkout: { status: "completed", paymentEvidence: "technician_receipt_confirmation" }
    });
    expect(h.performanceSummaryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          technicianProfileId: 702,
          completedOrderCount: 1,
          acceptanceRateBps: 10_000
        })
      })
    );
    expect(settle).toHaveBeenCalledTimes(1);
    expect(affiliate).toHaveBeenCalledTimes(1);
    const replay = await h.repository.confirmCheckoutReceipt(
      {
        orderId: 41,
        actorUserId: 202,
        technicianProfileId: 702,
        reason: "cash received",
        idempotencyKey: "checkout-receipt-cash-01",
        evidence: "technician_receipt_confirmation"
      },
      { settle, settleAffiliate: affiliate }
    );
    expect(replay).toMatchObject({ outcome: "ok", applied: false });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(affiliate).toHaveBeenCalledTimes(1);
  });

  it("fails closed when stored technician receipt evidence is missing, mismatched, or no longer assigned", async () => {
    let sequence = 0;
    const createCompletedTechnicianReceipt = async () => {
      sequence += 1;
      const h = createRepositoryHarness();
      await h.repository.getOrCreateCheckout({ ...customerInput, rate });
      await h.repository.selectCheckoutPaymentMethod({
        ...customerInput,
        method: "cash",
        idempotencyKey: `checkout-evidence-select-${sequence}`
      });
      await h.repository.confirmCheckoutReceipt(
        {
          orderId: 41,
          actorUserId: 202,
          technicianProfileId: 702,
          reason: "cash received",
          idempotencyKey: `checkout-evidence-receipt-${sequence}`,
          evidence: "technician_receipt_confirmation"
        },
        { settle: async () => undefined, settleAffiliate: async () => undefined }
      );
      return h;
    };

    const missingMetadata = await createCompletedTechnicianReceipt();
    missingMetadata.events.find((event) => event.eventType === "RECEIPT_CONFIRMED").metadata = {};
    await expect(
      missingMetadata.repository.getOrCreateCheckout({ ...customerInput, rate: null })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });

    const mismatchedActor = await createCompletedTechnicianReceipt();
    mismatchedActor.events.find((event) => event.eventType === "RECEIPT_CONFIRMED").actorUserId =
      999;
    await expect(
      mismatchedActor.repository.getOrCreateCheckout({ ...customerInput, rate: null })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });

    const mismatchedReason = await createCompletedTechnicianReceipt();
    mismatchedReason.events.find((event) => event.eventType === "RECEIPT_CONFIRMED").reason =
      "different reason";
    await expect(
      mismatchedReason.repository.getOrCreateCheckout({ ...customerInput, rate: null })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });

    const reassigned = await createCompletedTechnicianReceipt();
    reassigned.order.technicianProfile.userId = 404;
    await expect(
      reassigned.repository.getOrCreateCheckout({ ...customerInput, rate: null })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });
  });

  it("requires exact persisted operations audit method and integer checkout amount", async () => {
    let sequence = 0;
    const createCompletedOperationsReceipt = async () => {
      sequence += 1;
      const h = createRepositoryHarness();
      await h.repository.getOrCreateCheckout({ ...customerInput, rate });
      await h.repository.selectCheckoutPaymentMethod({
        ...customerInput,
        method: "cash",
        idempotencyKey: `checkout-ops-evidence-select-${sequence}`
      });
      await h.repository.confirmCheckoutReceipt(
        {
          orderId: 41,
          actorUserId: 303,
          technicianProfileId: null,
          reason: "verified receipt",
          idempotencyKey: `checkout-ops-evidence-receipt-${sequence}`,
          evidence: "operations_receipt_override",
          audit: {
            actorId: 303,
            action: "backoffice.order.checkout.receipt_override",
            targetType: "BookingOrder",
            targetId: 41,
            metadata: { reason: "verified receipt" }
          }
        },
        completionOptions
      );
      return h;
    };

    const missing = await createCompletedOperationsReceipt();
    missing.audits.splice(0);
    await expect(
      missing.repository.getOrCreateCheckout({ ...customerInput, rate: null })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });

    const methodMismatch = await createCompletedOperationsReceipt();
    methodMismatch.audits[0].metadata.selectedMethod = "other";
    await expect(
      methodMismatch.repository.getOrCreateCheckout({ ...customerInput, rate: null })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });

    const amountMismatch = await createCompletedOperationsReceipt();
    amountMismatch.audits[0].metadata.checkoutAmountJpy = "10200";
    await expect(
      amountMismatch.repository.getOrCreateCheckout({ ...customerInput, rate: null })
    ).resolves.toEqual({ outcome: "invalid_snapshot" });
  });

  it("rolls back every NDP completion write on settlement failure, then rejects collation-equivalent reuse", async () => {
    const h = createRepositoryHarness();
    await h.repository.getOrCreateCheckout({ ...customerInput, rate });
    await h.repository.selectCheckoutPaymentMethod({
      ...customerInput,
      method: "ndp",
      idempotencyKey: "checkout-select-ndp-001"
    });
    const debit = jest.fn(async () => ({ transactionId: 91 }));
    const failed = await h.repository
      .payCheckoutWithNdp(
        { ...customerInput, idempotencyKey: "Checkout-Pay-Key-0001" },
        {
          debit,
          settle: async () => {
            throw new Error("settlement failed");
          },
          settleAffiliate: completionOptions.settleAffiliate
        }
      )
      .catch((error) => error);
    expect(failed).toMatchObject({ message: "settlement failed" });
    expect(h.order.status).toBe("AWAITING_CHECKOUT");
    expect(h.checkout.ledgerTransactionId).toBeNull();
    expect(h.events.some((event) => event.eventType === "NDP_PAYMENT_APPLIED")).toBe(false);
    const applied = await h.repository.payCheckoutWithNdp(
      { ...customerInput, idempotencyKey: "Checkout-Pay-Key-0001" },
      { debit, ...completionOptions }
    );
    expect(applied).toMatchObject({
      outcome: "ok",
      checkout: { status: "completed", paymentEvidence: "ndp_ledger" }
    });
    expect(h.financial).toMatchObject({
      serviceAmountJpy: 10_200,
      baseServiceAmountJpy: 8_800,
      extensionAmountJpy: 2_200,
      platformCollectedServiceAmountJpy: 10_200,
      unknownOrUnreportedServiceAmountJpy: 0,
      paymentChannel: "platform_online",
      serviceIncomeStatus: "confirmed"
    });
    await expect(
      h.repository.payCheckoutWithNdp(
        { ...customerInput, idempotencyKey: "checkout-pay-key-0001" },
        { debit, ...completionOptions }
      )
    ).resolves.toEqual({ outcome: "conflict" });
    await expect(
      h.repository.payCheckoutWithNdp(
        { ...customerInput, idempotencyKey: "Ｃheckout-Pay-Key-0001" },
        { debit, ...completionOptions }
      )
    ).resolves.toEqual({ outcome: "conflict" });
  });

  it("writes operations receipt audit in the same transaction and distinguishes its evidence", async () => {
    const h = createRepositoryHarness();
    await h.repository.getOrCreateCheckout({ ...customerInput, rate });
    await h.repository.selectCheckoutPaymentMethod({
      ...customerInput,
      method: "other",
      otherMethodCode: "CARD",
      otherMethodLabel: "Card terminal",
      idempotencyKey: "checkout-select-other-01"
    });
    const result = await h.repository.confirmCheckoutReceipt(
      {
        orderId: 41,
        actorUserId: 303,
        technicianProfileId: null,
        reason: "verified terminal slip",
        idempotencyKey: "checkout-ops-override-01",
        evidence: "operations_receipt_override",
        audit: {
          actorId: 303,
          action: "backoffice.order.checkout.receipt_override",
          targetType: "BookingOrder",
          targetId: 41,
          ip: "127.0.0.1",
          userAgent: null,
          metadata: { reason: "verified terminal slip" }
        }
      },
      completionOptions
    );
    expect(result).toMatchObject({
      outcome: "ok",
      checkout: { paymentEvidence: "operations_receipt_override" }
    });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0].metadata).toEqual(
      expect.objectContaining({
        orderId: 41,
        checkoutId: 9,
        selectedMethod: "other",
        checkoutAmountJpy: 10_200,
        reason: "verified terminal slip"
      })
    );
  });

  it("rolls back operations completion when the same-transaction audit fails", async () => {
    const h = createRepositoryHarness({ auditFailure: true });
    await h.repository.getOrCreateCheckout({ ...customerInput, rate });
    await h.repository.selectCheckoutPaymentMethod({
      ...customerInput,
      method: "cash",
      idempotencyKey: "checkout-audit-select-01"
    });
    await expect(
      h.repository.confirmCheckoutReceipt(
        {
          orderId: 41,
          actorUserId: 303,
          technicianProfileId: null,
          reason: "verified receipt",
          idempotencyKey: "checkout-audit-failure-1",
          evidence: "operations_receipt_override",
          audit: {
            actorId: 303,
            action: "backoffice.order.checkout.receipt_override",
            targetType: "BookingOrder",
            targetId: 41
          }
        },
        completionOptions
      )
    ).rejects.toThrow("audit failed");
    expect(h.order.status).toBe("AWAITING_PAYMENT_CONFIRMATION");
    expect(h.checkout.receiptConfirmedAt).toBeNull();
    expect(h.events.some((event) => event.idempotencyKey === "checkout-audit-failure-1")).toBe(
      false
    );
  });

  it("closes every completed-order direct-refund bypass while preserving cancelled cash refunds", async () => {
    const formal = createRepositoryHarness();
    await expect(
      formal.repository.confirmManualPayment({
        scope: "backoffice",
        orderId: 41,
        actorUserId: 303,
        method: "onsite",
        amountJpy: 8_800
      })
    ).resolves.toEqual({ outcome: "invalid_state" });

    const ndp = createRepositoryHarness();
    await ndp.repository.getOrCreateCheckout({ ...customerInput, rate });
    await ndp.repository.payCheckoutWithNdp(
      { ...customerInput, idempotencyKey: "checkout-pay-refund-lock" },
      { debit: async () => ({ transactionId: 91 }), ...completionOptions }
    );
    await expect(
      ndp.repository.refundManualPayment({
        scope: "backoffice",
        orderId: 41,
        actorUserId: 303,
        reason: "refund requested"
      })
    ).resolves.toEqual({ outcome: "invalid_state" });

    const completedCash = createRepositoryHarness({ activeRefundCase: true });
    await completedCash.repository.getOrCreateCheckout({ ...customerInput, rate });
    await completedCash.repository.selectCheckoutPaymentMethod({
      ...customerInput,
      method: "cash",
      idempotencyKey: "checkout-select-refund-01"
    });
    await completedCash.repository.confirmCheckoutReceipt(
      {
        orderId: 41,
        actorUserId: 202,
        technicianProfileId: 702,
        reason: "cash received",
        idempotencyKey: "checkout-receipt-refund-1",
        evidence: "technician_receipt_confirmation"
      },
      completionOptions
    );
    const completedSnapshot = { ...completedCash.order };
    const orderMutationCount = completedCash.bookingOrderUpdateMany.mock.calls.length;
    const financialMutationCount = completedCash.orderFinancialUpdate.mock.calls.length;
    await expect(
      completedCash.repository.refundManualPayment({
        scope: "backoffice",
        orderId: 41,
        actorUserId: 303,
        reason: "cash returned"
      })
    ).resolves.toEqual({ outcome: "invalid_state" });
    expect(completedCash.order).toEqual(completedSnapshot);
    expect(completedCash.bookingOrderUpdateMany).toHaveBeenCalledTimes(orderMutationCount);
    expect(completedCash.orderFinancialUpdate).toHaveBeenCalledTimes(financialMutationCount);
    expect(completedCash.orderRefundCaseFindFirst).not.toHaveBeenCalled();

    const cancelledCash = createRepositoryHarness();
    cancelledCash.order.status = "CANCELLED";
    cancelledCash.order.paymentStatus = "REFUND_PENDING";
    cancelledCash.order.paymentAmountJpy = 8_800;
    await expect(
      cancelledCash.repository.refundManualPayment({
        scope: "merchant",
        shopId: 12,
        orderId: 41,
        actorUserId: 404,
        reason: "cancelled before completion",
        reference: "REF-CANCELLED-1"
      })
    ).resolves.toMatchObject({ outcome: "ok", order: { paymentStatus: "refunded" } });
  });

  it("returns a safe conflict when a cancelled refund loses its compare-and-swap race", async () => {
    const raced = createRepositoryHarness({ refundUpdateConflict: true });
    raced.order.status = "CANCELLED";
    raced.order.paymentStatus = "REFUND_PENDING";
    raced.order.paymentAmountJpy = 8_800;
    const initialOrder = { ...raced.order };

    await expect(
      raced.repository.refundManualPayment({
        scope: "backoffice",
        orderId: 41,
        actorUserId: 303,
        reason: "cancelled before completion",
        reference: "REF-CAS-RACE"
      })
    ).resolves.toEqual({ outcome: "conflict" });

    expect(raced.bookingOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 41,
          status: "CANCELLED",
          paymentStatus: "REFUND_PENDING"
        }),
        data: expect.objectContaining({ paymentStatus: "REFUNDED" })
      })
    );
    expect(raced.order).toEqual(initialOrder);
    expect(raced.orderFinancialFindUnique).not.toHaveBeenCalled();
    expect(raced.orderFinancialUpdate).not.toHaveBeenCalled();
  });
});
