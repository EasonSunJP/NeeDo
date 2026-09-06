/* eslint-disable @typescript-eslint/no-explicit-any -- stateful Prisma transaction harness */
import { OrderServiceExpiryRepository } from "../src/repositories/order-service-expiry.repository";

const now = new Date("2026-09-01T10:00:00.000Z");
const dueAt = new Date("2026-09-01T09:59:59.000Z");
const decimal = (value: number) => ({
  toString: () => String(value),
  toFixed: (places = 0) => value.toFixed(places)
});

const makeOrder = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  orderNo: `ND-${id}`,
  status: "IN_SERVICE",
  deletedAt: null,
  currency: "JPY",
  priceAmount: decimal(8_800),
  servicePriceSnapshot: decimal(8_800),
  serviceSession: {
    id: 500 + id,
    bookingOrderId: id,
    startedAt: new Date("2026-09-01T09:00:00.000Z"),
    expectedEndsAt: dueAt,
    endedByUserId: null,
    endedAt: null,
    deletedAt: null,
    addOns: [
      {
        id: 700 + id,
        bookingOrderId: id,
        serviceSessionId: 500 + id,
        status: "ACCEPTED",
        priceAmountJpy: 2_200,
        currency: "JPY",
        deletedAt: null
      }
    ]
  },
  affiliateAttributions: [
    {
      originalPriceJpy: 8_800,
      customerDiscountJpy: 800,
      finalPriceJpy: 8_000,
      deletedAt: null
    }
  ],
  ...overrides
});

const validRate = {
  id: 7,
  publicId: "00000000-0000-4000-8000-000000000007",
  version: 3,
  ndpUnits: 3,
  jpyUnits: 2,
  effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
  effectiveTo: null,
  deletedAt: null
};

const createHarness = (
  input: {
    orders?: any[];
    rates?: any[];
    preexistingHistories?: any[];
    failCheckoutForOrderId?: number;
    preexistingCheckoutOrderId?: number;
  } = {}
) => {
  const orders = input.orders ?? [makeOrder(41)];
  const rates = input.rates ?? [validRate];
  const histories: any[] = [...(input.preexistingHistories ?? [])];
  const events: any[] = [];
  const checkouts = new Map<number, any>();
  if (input.preexistingCheckoutOrderId) {
    checkouts.set(input.preexistingCheckoutOrderId, {
      id: 90,
      bookingOrderId: input.preexistingCheckoutOrderId,
      deletedAt: null
    });
  }
  let nextCheckoutId = 100;
  let transactionTail = Promise.resolve();

  const findOrder = (id: number) => orders.find((order) => order.id === id) ?? null;
  const tx: any = {
    $queryRaw: jest.fn(async (query: any) => {
      const orderId = Number(query.values?.[0]);
      return findOrder(orderId) ? [{ id: orderId }] : [];
    }),
    bookingOrder: {
      findFirst: jest.fn(async ({ where }: any) => {
        const order = findOrder(where.id);
        return order && !order.deletedAt ? order : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const order = findOrder(where.id);
        if (!order || order.deletedAt || order.status !== where.status) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      })
    },
    orderServiceSession: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const order = findOrder(where.bookingOrderId);
        const session = order?.serviceSession;
        if (
          !session ||
          session.id !== where.id ||
          session.deletedAt ||
          session.endedAt ||
          session.expectedEndsAt.getTime() !== where.expectedEndsAt.getTime()
        )
          return { count: 0 };
        Object.assign(session, data);
        return { count: 1 };
      })
    },
    orderStatusHistory: {
      findMany: jest.fn(async ({ where }: any) =>
        histories.filter(
          (history) =>
            history.bookingOrderId === where.bookingOrderId &&
            history.toStatus === where.toStatus &&
            !history.deletedAt
        )
      ),
      create: jest.fn(async ({ data }: any) => {
        histories.push({ id: histories.length + 1, ...data });
        return histories.at(-1);
      })
    },
    orderServiceEvent: {
      findMany: jest.fn(async ({ where }: any) =>
        events.filter((event) => event.bookingOrderId === where.bookingOrderId && !event.deletedAt)
      ),
      create: jest.fn(async ({ data }: any) => {
        const event = { id: events.length + 1, deletedAt: null, ...data };
        events.push(event);
        return event;
      })
    },
    orderCheckout: {
      findUnique: jest.fn(async ({ where }: any) => checkouts.get(where.bookingOrderId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        if (data.bookingOrderId === input.failCheckoutForOrderId) {
          throw new Error("checkout write failed");
        }
        const checkout = {
          id: nextCheckoutId++,
          paymentMethod: null,
          paymentSelectedAt: null,
          ledgerTransactionId: null,
          receiptConfirmedAt: null,
          deletedAt: null,
          ...data
        };
        checkouts.set(data.bookingOrderId, checkout);
        return checkout;
      })
    },
    ndpExchangeRateRule: {
      findMany: jest.fn(async ({ where, take }: any) =>
        rates
          .filter(
            (rate) =>
              !rate.deletedAt &&
              rate.effectiveFrom <= where.effectiveFrom.lte &&
              (rate.effectiveTo === null || rate.effectiveTo > where.effectiveFrom.lte)
          )
          .slice(0, take)
      )
    }
  };

  const client: any = {
    orderServiceSession: {
      findMany: jest.fn(async ({ where, take }: any) =>
        orders
          .filter(
            (order) =>
              !order.deletedAt &&
              order.status === "IN_SERVICE" &&
              order.serviceSession &&
              !order.serviceSession.deletedAt &&
              !order.serviceSession.endedAt &&
              order.serviceSession.expectedEndsAt <= where.expectedEndsAt.lte
          )
          .sort(
            (left, right) =>
              left.serviceSession.expectedEndsAt.getTime() -
                right.serviceSession.expectedEndsAt.getTime() || left.id - right.id
          )
          .slice(0, take)
          .map((order) => ({ bookingOrderId: order.id }))
      )
    },
    $transaction: jest.fn((handler: (transaction: any) => Promise<unknown>) => {
      const run = transactionTail.then(async () => {
        const snapshots = orders.map((order) => ({
          order,
          status: order.status,
          endedAt: order.serviceSession?.endedAt ?? null,
          endedByUserId: order.serviceSession?.endedByUserId ?? null
        }));
        const historyLength = histories.length;
        const eventLength = events.length;
        const checkoutSnapshot = new Map(checkouts);
        try {
          return await handler(tx);
        } catch (error) {
          for (const snapshot of snapshots) {
            snapshot.order.status = snapshot.status;
            if (snapshot.order.serviceSession) {
              snapshot.order.serviceSession.endedAt = snapshot.endedAt;
              snapshot.order.serviceSession.endedByUserId = snapshot.endedByUserId;
            }
          }
          histories.splice(historyLength);
          events.splice(eventLength);
          checkouts.clear();
          for (const [key, value] of checkoutSnapshot) checkouts.set(key, value);
          throw error;
        }
      });
      transactionTail = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    })
  };

  return {
    client,
    orders,
    histories,
    events,
    checkouts,
    tx,
    repository: (reportFailure?: jest.Mock) =>
      new OrderServiceExpiryRepository(client, reportFailure)
  };
};

describe("OrderServiceExpiryRepository", () => {
  it("atomically ends a due session and creates one immutable checkout evidence chain", async () => {
    const h = createHarness();

    await expect(
      h.repository().moveDueSessionsToCheckout({ now, batchSize: 100 })
    ).resolves.toEqual([41]);

    expect(h.client.orderServiceSession.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        endedAt: null,
        expectedEndsAt: { lte: now },
        bookingOrder: { status: "IN_SERVICE", deletedAt: null }
      },
      select: { bookingOrderId: true },
      orderBy: [{ expectedEndsAt: "asc" }, { bookingOrderId: "asc" }],
      take: 100
    });
    expect(h.orders[0].status).toBe("AWAITING_CHECKOUT");
    expect(h.orders[0].serviceSession.endedAt).toEqual(dueAt);
    expect(h.orders[0].serviceSession.endedByUserId).toBeNull();
    expect(h.histories).toEqual([
      expect.objectContaining({
        bookingOrderId: 41,
        fromStatus: "IN_SERVICE",
        toStatus: "AWAITING_CHECKOUT",
        actorUserId: null,
        reason: "automatic_timer_elapsed"
      })
    ]);
    const endEvent = h.events.find((event) => event.eventType === "SERVICE_ENDED");
    expect(endEvent).toEqual(
      expect.objectContaining({
        actorUserId: null,
        reason: "automatic_timer_elapsed",
        idempotencyKey: `order-service:auto-end:v1:41:${dueAt.toISOString()}`,
        metadata: expect.objectContaining({
          trigger: "system_timer",
          expectedEndsAt: dueAt.toISOString()
        })
      })
    );
    const checkout = h.checkouts.get(41);
    expect(checkout).toEqual(
      expect.objectContaining({
        baseAmountJpy: 8_800,
        addOnAmountJpy: 2_200,
        discountAmountJpy: 800,
        checkoutAmountJpy: 10_200,
        payableNdp: 15_300,
        ndpRateRuleId: 7,
        rateSnapshotJson: expect.objectContaining({ ruleId: 7, ndpUnits: 3, jpyUnits: 2 }),
        calculationSnapshotJson: expect.objectContaining({ acceptedAddOnIds: [741] })
      })
    );
    expect(h.events.find((event) => event.eventType === "CHECKOUT_CREATED")).toEqual(
      expect.objectContaining({
        orderCheckoutId: checkout.id,
        actorUserId: null,
        idempotencyKey: `order-service:auto-checkout:v1:41:${dueAt.toISOString()}`,
        metadata: expect.objectContaining({ trigger: "system_timer", payableNdp: 15_300 })
      })
    );
    expect(h.tx.ndpExchangeRateRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          effectiveFrom: { lte: dueAt },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: dueAt } }]
        },
        take: 2
      })
    );
  });

  it("does not advance future, completed, deleted, ended, or unresolved-add-on candidates", async () => {
    const future = makeOrder(1, {
      serviceSession: {
        ...makeOrder(1).serviceSession,
        expectedEndsAt: new Date(now.getTime() + 1)
      }
    });
    const completed = makeOrder(2, { status: "COMPLETED" });
    const deleted = makeOrder(3, { deletedAt: now });
    const ended = makeOrder(4, {
      serviceSession: { ...makeOrder(4).serviceSession, endedAt: dueAt }
    });
    const unresolved = makeOrder(5, {
      serviceSession: {
        ...makeOrder(5).serviceSession,
        addOns: [{ ...makeOrder(5).serviceSession.addOns[0], status: "PROPOSED" }]
      }
    });
    const h = createHarness({ orders: [future, completed, deleted, ended, unresolved] });

    await expect(h.repository().moveDueSessionsToCheckout({ now, batchSize: 5 })).resolves.toEqual(
      []
    );
    expect(h.histories).toHaveLength(0);
    expect(h.events).toHaveLength(0);
    expect(h.checkouts.size).toBe(0);
    expect(unresolved.status).toBe("IN_SERVICE");
  });

  it.each([
    ["missing", []],
    [
      "ambiguous",
      [validRate, { ...validRate, id: 8, publicId: "00000000-0000-4000-8000-000000000008" }]
    ],
    ["corrupt", [{ ...validRate, ndpUnits: 0 }]]
  ])("rolls back every write for %s effective rate evidence", async (_label, rates) => {
    const reportFailure = jest.fn();
    const h = createHarness({ rates });

    await expect(
      h.repository(reportFailure).moveDueSessionsToCheckout({ now, batchSize: 100 })
    ).resolves.toEqual([]);
    expect(h.orders[0].status).toBe("IN_SERVICE");
    expect(h.orders[0].serviceSession.endedAt).toBeNull();
    expect(h.histories).toHaveLength(0);
    expect(h.events).toHaveLength(0);
    expect(h.checkouts.size).toBe(0);
    expect(reportFailure).toHaveBeenCalledWith({
      orderId: 41,
      code: 50001,
      message: "error.internal_server_error"
    });
  });

  it("rolls back a mid-transaction failure and advances the next candidate", async () => {
    const reportFailure = jest.fn();
    const first = makeOrder(41);
    const second = makeOrder(42);
    const h = createHarness({ orders: [first, second], failCheckoutForOrderId: 41 });

    await expect(
      h.repository(reportFailure).moveDueSessionsToCheckout({ now, batchSize: 100 })
    ).resolves.toEqual([42]);
    expect(first.status).toBe("IN_SERVICE");
    expect(first.serviceSession.endedAt).toBeNull();
    expect(second.status).toBe("AWAITING_CHECKOUT");
    expect(h.events.filter((event) => event.bookingOrderId === 41)).toHaveLength(0);
    expect(h.events.filter((event) => event.bookingOrderId === 42)).toHaveLength(2);
    expect(reportFailure).toHaveBeenCalledWith({
      orderId: 41,
      code: 50001,
      message: "error.internal_server_error"
    });
  });

  it("allows two racing repositories to create only one evidence chain", async () => {
    const h = createHarness();
    const first = h.repository();
    const second = h.repository();

    const results = await Promise.all([
      first.moveDueSessionsToCheckout({ now, batchSize: 100 }),
      second.moveDueSessionsToCheckout({ now, batchSize: 100 })
    ]);

    expect(results.flat()).toEqual([41]);
    expect(h.histories).toHaveLength(1);
    expect(h.events.filter((event) => event.eventType === "SERVICE_ENDED")).toHaveLength(1);
    expect(h.events.filter((event) => event.eventType === "CHECKOUT_CREATED")).toHaveLength(1);
    expect(h.checkouts.size).toBe(1);
    await expect(first.moveDueSessionsToCheckout({ now, batchSize: 100 })).resolves.toEqual([]);
  });

  it("fails closed on a pre-existing partial checkout without repairing it", async () => {
    const reportFailure = jest.fn();
    const h = createHarness({ preexistingCheckoutOrderId: 41 });

    await expect(
      h.repository(reportFailure).moveDueSessionsToCheckout({ now, batchSize: 100 })
    ).resolves.toEqual([]);
    expect(h.orders[0].status).toBe("IN_SERVICE");
    expect(h.events).toHaveLength(0);
    expect(h.histories).toHaveLength(0);
    expect(h.checkouts.size).toBe(1);
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });

  it("fails closed before writes when an awaiting-checkout target history already exists", async () => {
    const reportFailure = jest.fn();
    const existingHistory = {
      id: 91,
      bookingOrderId: 41,
      fromStatus: "IN_SERVICE",
      toStatus: "AWAITING_CHECKOUT",
      actorUserId: null,
      reason: "preexisting_partial_state",
      deletedAt: null
    };
    const h = createHarness({ preexistingHistories: [existingHistory] });

    await expect(
      h.repository(reportFailure).moveDueSessionsToCheckout({ now, batchSize: 100 })
    ).resolves.toEqual([]);
    expect(h.orders[0].status).toBe("IN_SERVICE");
    expect(h.orders[0].serviceSession.endedAt).toBeNull();
    expect(h.orders[0].serviceSession.endedByUserId).toBeNull();
    expect(h.histories).toEqual([existingHistory]);
    expect(h.events).toHaveLength(0);
    expect(h.checkouts.size).toBe(0);
    expect(h.tx.orderServiceSession.updateMany).not.toHaveBeenCalled();
    expect(h.tx.bookingOrder.updateMany).not.toHaveBeenCalled();
    expect(h.tx.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(h.tx.orderServiceEvent.create).not.toHaveBeenCalled();
    expect(h.tx.orderCheckout.create).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });

  it("fails closed before writes when an unended session already names an ending actor", async () => {
    const reportFailure = jest.fn();
    const inconsistentOrder = makeOrder(41, {
      serviceSession: { ...makeOrder(41).serviceSession, endedByUserId: 27, endedAt: null }
    });
    const h = createHarness({ orders: [inconsistentOrder] });

    await expect(
      h.repository(reportFailure).moveDueSessionsToCheckout({ now, batchSize: 100 })
    ).resolves.toEqual([]);
    expect(inconsistentOrder.status).toBe("IN_SERVICE");
    expect(inconsistentOrder.serviceSession.endedAt).toBeNull();
    expect(inconsistentOrder.serviceSession.endedByUserId).toBe(27);
    expect(h.histories).toHaveLength(0);
    expect(h.events).toHaveLength(0);
    expect(h.checkouts.size).toBe(0);
    expect(h.tx.orderServiceSession.updateMany).not.toHaveBeenCalled();
    expect(h.tx.bookingOrder.updateMany).not.toHaveBeenCalled();
    expect(h.tx.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(h.tx.orderServiceEvent.create).not.toHaveBeenCalled();
    expect(h.tx.orderCheckout.create).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });
});
