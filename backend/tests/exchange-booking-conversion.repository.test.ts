/* eslint-disable @typescript-eslint/no-explicit-any -- stateful Prisma transaction harness */
import { Prisma, type PrismaClient } from "@prisma/client";
import { ExchangeBookingConversionRepository } from "../src/repositories/exchange-booking-conversion.repository";
import type { ExchangeBookingConversionInput } from "../src/types/exchange-booking-conversion.types";

const occurredAt = new Date("2026-09-03T00:00:00.000Z");
const startsAt = new Date("2026-09-04T01:00:00.000Z");
const endsAt = new Date("2026-09-04T02:00:00.000Z");

const input = (
  overrides: Partial<ExchangeBookingConversionInput> = {}
): ExchangeBookingConversionInput => ({
  exchangePostId: 42,
  actorUserId: 9,
  actorIdentityId: 19,
  expectedVersion: 7,
  idempotencyKey: "exchange-booking-command-0001",
  payloadFingerprint: "a".repeat(64),
  occurredAt,
  audit: {
    actorId: 9,
    action: "exchange.matching.bookings.create",
    targetType: "exchange_request_matching",
    targetId: null,
    ip: "127.0.0.1",
    userAgent: "repository-test"
  },
  ...overrides
});

type Participant = ReturnType<typeof makeParticipants>[number];

const makeParticipants = () => [
  {
    id: 11,
    matchingId: 77,
    exchangePostId: 42,
    exchangeClaimId: 101,
    participantUserId: 20,
    participantIdentityId: 120,
    shopId: 200,
    technicianProfileId: 20,
    serviceId: 501,
    technicianServiceId: null,
    scheduleSlotId: 30,
    quoteAmountJpy: 12_000,
    currency: "JPY",
    estimatedStartsAt: startsAt,
    estimatedEndsAt: endsAt,
    serviceNameSnapshot: "Home care 60",
    serviceDurationSnapshot: 60,
    bookingOrderId: null as number | null,
    bookedAt: null as Date | null,
    activeReservationKey: "exchange:participant:11" as string | null,
    deletedAt: null,
    exchangeClaim: {
      id: 101,
      exchangePostId: 42,
      claimantUserId: 20,
      claimantIdentityId: 120,
      shopId: 200,
      technicianProfileId: 20,
      serviceId: 501,
      technicianServiceId: null,
      scheduleSlotId: 30,
      quoteAmountJpy: 12_000,
      status: "MATCHED",
      deletedAt: null
    },
    participantIdentity: { publicIdentifier: { publicId: "s0000000020" } },
    bookingOrder: null
  },
  {
    id: 12,
    matchingId: 77,
    exchangePostId: 42,
    exchangeClaimId: 102,
    participantUserId: 21,
    participantIdentityId: 121,
    shopId: 201,
    technicianProfileId: 21,
    serviceId: null,
    technicianServiceId: 601,
    scheduleSlotId: 31,
    quoteAmountJpy: 15_000,
    currency: "JPY",
    estimatedStartsAt: startsAt,
    estimatedEndsAt: endsAt,
    serviceNameSnapshot: "Technician care 60",
    serviceDurationSnapshot: 60,
    bookingOrderId: null as number | null,
    bookedAt: null as Date | null,
    activeReservationKey: "exchange:participant:12" as string | null,
    deletedAt: null,
    exchangeClaim: {
      id: 102,
      exchangePostId: 42,
      claimantUserId: 21,
      claimantIdentityId: 121,
      shopId: 201,
      technicianProfileId: 21,
      serviceId: null,
      technicianServiceId: 601,
      scheduleSlotId: 31,
      quoteAmountJpy: 15_000,
      status: "MATCHED",
      deletedAt: null
    },
    participantIdentity: { publicIdentifier: { publicId: "s0000000021" } },
    bookingOrder: null
  }
];

const makeSlots = () => [
  {
    id: 30,
    serviceId: 501,
    technicianServiceId: null,
    shopId: 200,
    technicianProfileId: 20,
    startsAt,
    endsAt,
    capacity: 2,
    bookedCount: 0,
    status: "AVAILABLE",
    deletedAt: null,
    shop: { id: 200, status: "published", deletedAt: null },
    service: {
      id: 501,
      shopId: 200,
      technicianProfileId: 20,
      name: "Current catalog name",
      durationMinutes: 60,
      status: "published",
      deletedAt: null
    },
    technicianService: null
  },
  {
    id: 31,
    serviceId: null,
    technicianServiceId: 601,
    shopId: 201,
    technicianProfileId: 21,
    startsAt,
    endsAt,
    capacity: 1,
    bookedCount: 0,
    status: "AVAILABLE",
    deletedAt: null,
    shop: { id: 201, status: "published", deletedAt: null },
    service: null,
    technicianService: {
      id: 601,
      shopId: 201,
      technicianId: 21,
      name: "Current technician catalog name",
      durationMinutes: 60,
      isActive: true,
      isBookable: true,
      deletedAt: null
    }
  }
];

interface HarnessOptions {
  membershipLevel?: string;
  failSlotUpdateId?: number;
  ordinaryPending?: boolean;
  customerConflict?: boolean;
  serviceMode?: "HOME" | "STORE";
  participantMutator?: (participants: Participant[]) => void;
}

const createHarness = (options: HarnessOptions = {}) => {
  const lockOrder: string[] = [];
  const committedWrites: Array<{ kind: string; data?: any }> = [];
  const financeWrites: string[] = [];
  const participants = makeParticipants();
  options.participantMutator?.(participants);
  const slots = makeSlots();
  const events: any[] = [];
  const notifications: any[] = [];
  const audits: any[] = [];
  const orders: any[] = options.ordinaryPending
    ? [
        {
          id: 800,
          orderNo: "NDOLD",
          customerUserId: 9,
          scheduleSlotId: 40,
          status: "PENDING",
          startsAt: new Date("2026-09-05T01:00:00.000Z"),
          endsAt: new Date("2026-09-05T02:00:00.000Z"),
          deletedAt: null,
          exchangeMatchParticipant: null
        }
      ]
    : [];
  if (options.ordinaryPending) {
    slots.push({
      ...makeSlots()[0],
      id: 40,
      startsAt: new Date("2026-09-05T01:00:00.000Z"),
      endsAt: new Date("2026-09-05T02:00:00.000Z"),
      capacity: 1,
      bookedCount: 1,
      status: "BOOKED"
    });
  }

  const post = {
    id: 42,
    authorUserId: 9,
    ownerIdentityId: 19,
    type: "DEMAND",
    status: "MATCHED",
    deletedAt: null,
    demand: {
      serviceMode: options.serviceMode ?? "HOME",
      addressLine1: "Tokyo-to",
      addressLine2: "Shibuya-ku",
      addressLine3: "Private room 3"
    }
  };
  const matching = {
    id: 77,
    exchangePostId: 42,
    status: "MATCHED",
    effectiveTargetProviderCount: 2,
    version: 7,
    deletedAt: null,
    exchangePost: post
  };

  let nextOrderId = 500;
  let nextNotificationId = 900;

  const transaction = async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
    const stagedWrites: Array<{ kind: string; data?: any }> = [];
    const stagedParticipants = structuredClone(participants) as Participant[];
    const stagedSlots = structuredClone(slots) as typeof slots;
    const stagedOrders = structuredClone(orders);
    const stagedEvents = structuredClone(events);
    const stagedNotifications = structuredClone(notifications);
    const stagedAudits = structuredClone(audits);
    const stagedMatching = { ...matching };
    let stagedNextOrderId = nextOrderId;
    let stagedNextNotificationId = nextNotificationId;

    const sqlText = (query: any) =>
      typeof query?.sql === "string"
        ? query.sql
        : Array.isArray(query?.strings)
          ? query.strings.join("?")
          : "";
    const queryValues = (query: any): number[] =>
      Array.isArray(query?.values)
        ? query.values
            .flat(Infinity)
            .filter((value: unknown): value is number => typeof value === "number")
        : [];

    const tx = {
      $queryRaw: jest.fn(async (query: any) => {
        const sql = sqlText(query);
        const values = queryValues(query);
        if (/\busers\b/.test(sql)) {
          lockOrder.push(`customer:${values[0]}`);
          return values[0] === 9 ? [{ id: 9 }] : [];
        }
        if (/\bexchange_posts\b/.test(sql)) {
          lockOrder.push(`post:${values[0]}`);
          return values[0] === 42 ? [{ id: 42 }] : [];
        }
        if (/\bexchange_request_matchings\b/.test(sql)) {
          lockOrder.push("matching:77");
          return [{ id: 77 }];
        }
        if (/\bexchange_match_participants\b/.test(sql)) {
          lockOrder.push(`participants:${values.join(",")}`);
          return stagedParticipants.map(({ id }) => ({ id }));
        }
        if (/\btechnician_profiles\b/.test(sql)) {
          lockOrder.push(`technicians:${values.join(",")}`);
          return values.map((id) => ({ id }));
        }
        if (/\bschedule_slots\b/.test(sql)) {
          lockOrder.push(`slots:${values.join(",")}`);
          return values.map((id) => ({ id }));
        }
        return [];
      }),
      exchangeMatchEvent: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.idempotencyKey) {
            return (
              stagedEvents.find((event) => event.idempotencyKey === where.idempotencyKey) ?? null
            );
          }
          return (
            stagedEvents.find(
              (event) => event.matchingId === where.matchingId && event.type === where.type
            ) ?? null
          );
        }),
        create: jest.fn(async ({ data }: any) => {
          const event = { id: 1000 + stagedEvents.length, ...data };
          stagedEvents.push(event);
          stagedWrites.push({ kind: "event", data });
          return event;
        })
      },
      exchangePost: {
        findFirst: jest.fn(async ({ where }: any) => {
          const visible =
            where.id === post.id &&
            (where.OR?.some((candidate: any) => candidate.ownerIdentityId === 19) ?? true);
          return visible ? post : null;
        })
      },
      exchangeRequestMatching: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.exchangePostId === 42
            ? {
                ...stagedMatching,
                exchangePost: post,
                participants: stagedParticipants.map((participant) => ({
                  ...participant,
                  bookingOrder:
                    stagedOrders.find((order) => order.id === participant.bookingOrderId) ?? null
                }))
              }
            : null
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (
            where.id !== stagedMatching.id ||
            where.version !== stagedMatching.version ||
            where.status !== "MATCHED"
          ) {
            return { count: 0 };
          }
          stagedMatching.version = data.version;
          stagedWrites.push({ kind: "matching", data });
          return { count: 1 };
        })
      },
      customerProfile: {
        findFirst: jest.fn(async () => ({ membershipLevel: options.membershipLevel ?? "standard" }))
      },
      exchangeMatchParticipant: {
        findMany: jest.fn(async () => stagedParticipants),
        findFirst: jest.fn(async () => null),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const participant = stagedParticipants.find(
            (candidate) =>
              candidate.id === where.id &&
              candidate.bookingOrderId === null &&
              candidate.activeReservationKey !== null
          );
          if (!participant) return { count: 0 };
          Object.assign(participant, data);
          stagedWrites.push({ kind: "participant", data: { id: participant.id, ...data } });
          return { count: 1 };
        })
      },
      scheduleSlot: {
        findMany: jest.fn(async ({ where }: any) =>
          stagedSlots.filter((slot) => where.id.in.includes(slot.id))
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const slot = stagedSlots.find((candidate) => candidate.id === where.id);
          if (!slot) return { count: 0 };
          if (data.bookedCount?.increment) {
            if (
              slot.id === options.failSlotUpdateId ||
              slot.deletedAt ||
              slot.status !== "AVAILABLE" ||
              slot.bookedCount >= slot.capacity
            ) {
              return { count: 0 };
            }
            slot.bookedCount += data.bookedCount.increment;
            slot.status = data.status;
          } else if (data.bookedCount?.decrement) {
            if (slot.bookedCount < data.bookedCount.decrement) return { count: 0 };
            slot.bookedCount -= data.bookedCount.decrement;
            slot.status = data.status;
          }
          stagedWrites.push({ kind: "slot", data: { id: slot.id, ...data } });
          return { count: 1 };
        })
      },
      bookingOrder: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (options.customerConflict && where.customerUserId === 9) return { id: 700 };
          return null;
        }),
        findMany: jest.fn(async ({ where }: any) =>
          stagedOrders.filter(
            (order) =>
              order.customerUserId === where.customerUserId &&
              order.status === "PENDING" &&
              order.deletedAt === null &&
              order.exchangeMatchParticipant === null
          )
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const candidates = stagedOrders.filter(
            (order) => where.id.in.includes(order.id) && order.status === "PENDING"
          );
          candidates.forEach((order) => Object.assign(order, data));
          stagedWrites.push({ kind: "cancel", data });
          return { count: candidates.length };
        }),
        create: jest.fn(async ({ data }: any) => {
          const order = {
            id: stagedNextOrderId++,
            ...data,
            createdAt: occurredAt,
            updatedAt: occurredAt,
            deletedAt: null
          };
          stagedOrders.push(order);
          stagedWrites.push({ kind: "order", data: order });
          return order;
        })
      },
      orderStatusHistory: {
        createMany: jest.fn(async ({ data }: any) => {
          stagedWrites.push({ kind: "history", data });
          return { count: data.length };
        })
      },
      notification: {
        create: jest.fn(async ({ data }: any) => {
          const notification = {
            id: stagedNextNotificationId++,
            ...data,
            readAt: null,
            updatedAt: occurredAt,
            deletedAt: null
          };
          stagedNotifications.push(notification);
          stagedWrites.push({ kind: "notification", data });
          return notification;
        })
      },
      auditLog: {
        create: jest.fn(async ({ data }: any) => {
          const audit = { id: 1100 + stagedAudits.length, ...data };
          stagedAudits.push(audit);
          stagedWrites.push({ kind: "audit", data });
          return audit;
        })
      }
    };

    const result = await callback(tx);
    participants.splice(0, participants.length, ...stagedParticipants);
    slots.splice(0, slots.length, ...stagedSlots);
    orders.splice(0, orders.length, ...stagedOrders);
    events.splice(0, events.length, ...stagedEvents);
    notifications.splice(0, notifications.length, ...stagedNotifications);
    audits.splice(0, audits.length, ...stagedAudits);
    Object.assign(matching, stagedMatching);
    nextOrderId = stagedNextOrderId;
    nextNotificationId = stagedNextNotificationId;
    committedWrites.push(...stagedWrites);
    return result;
  };

  const client = {
    $transaction: jest.fn(transaction),
    exchangePost: {
      findFirst: jest.fn(async () => post)
    },
    wallet: { create: jest.fn(() => financeWrites.push("wallet")) },
    walletHold: { create: jest.fn(() => financeWrites.push("walletHold")) },
    walletLedger: { create: jest.fn(() => financeWrites.push("walletLedger")) },
    ledgerTransaction: { create: jest.fn(() => financeWrites.push("ledgerTransaction")) },
    financeReconciliation: { create: jest.fn(() => financeWrites.push("financeReconciliation")) },
    orderFinancial: { create: jest.fn(() => financeWrites.push("orderFinancial")) }
  } as unknown as PrismaClient;

  return {
    client,
    lockOrder,
    committedWrites,
    financeWrites,
    participants,
    slots,
    events,
    notifications,
    audits,
    orders
  };
};

describe("ExchangeBookingConversionRepository", () => {
  it("finds owner context for an owner or matched participant without exposing the address", async () => {
    const h = createHarness();
    const repository = new ExchangeBookingConversionRepository(h.client);

    await expect(repository.findOwnerContext(42, 19)).resolves.toEqual({
      ownerUserId: 9,
      ownerIdentityId: 19,
      serviceMode: "home"
    });
  });

  it("locks in deterministic order and atomically creates one authoritative Request order per participant", async () => {
    const h = createHarness();
    const invalidateSupersededAffiliate = jest.fn(async () => undefined);
    const repository = new ExchangeBookingConversionRepository(h.client);

    const result = await repository.convert(input(), { invalidateSupersededAffiliate });

    expect(result).toMatchObject({
      outcome: "created",
      payload: {
        exchangePostId: 42,
        matchingVersion: 8,
        bookedAt: occurredAt.toISOString(),
        orders: [
          { exchangeClaimId: 101, quoteAmountJpy: 12_000, status: "pending" },
          { exchangeClaimId: 102, quoteAmountJpy: 15_000, status: "pending" }
        ]
      }
    });
    expect(h.lockOrder).toEqual([
      "customer:9",
      "post:42",
      "matching:77",
      "participants:11,12",
      "technicians:20,21",
      "slots:30,31"
    ]);
    const createdOrders = h.committedWrites
      .filter((write) => write.kind === "order")
      .map((write) => write.data);
    expect(createdOrders).toHaveLength(2);
    expect(createdOrders.map((order) => order.orderType)).toEqual(["REQUEST", "REQUEST"]);
    expect(createdOrders.map((order) => String(order.priceAmount))).toEqual(["12000", "15000"]);
    expect(createdOrders.map((order) => order.paymentMethod)).toEqual(["ONSITE", "ONSITE"]);
    expect(createdOrders.map((order) => order.paymentStatus)).toEqual(["PENDING", "PENDING"]);
    expect(createdOrders[0].serviceNameSnapshot).toBe("Home care 60");
    expect(createdOrders[1].serviceNameSnapshot).toBe("Technician care 60");
    expect(createdOrders[0].fulfillmentAddressSnapshot).toEqual({
      line1: "Tokyo-to",
      line2: "Shibuya-ku",
      line3: "Private room 3"
    });
    expect(createdOrders[1].fulfillmentAddressSnapshot).toEqual(
      createdOrders[0].fulfillmentAddressSnapshot
    );
    expect(h.participants.every((participant) => participant.activeReservationKey === null)).toBe(
      true
    );
    expect(h.participants.every((participant) => participant.bookingOrderId !== null)).toBe(true);
    expect(h.notifications).toHaveLength(2);
    expect(h.audits).toHaveLength(1);
    expect(invalidateSupersededAffiliate).not.toHaveBeenCalled();
    expect(h.financeWrites).toEqual([]);
    expect(JSON.stringify(h.events[0]?.payload)).not.toMatch(/address|phone|email|token/i);
    expect(JSON.stringify(h.audits[0]?.metadata)).not.toMatch(/address|phone|email|token/i);
  });

  it("replays the same key and fingerprint with zero writes, and rejects both idempotency conflicts", async () => {
    const h = createHarness();
    const repository = new ExchangeBookingConversionRepository(h.client);
    const first = await repository.convert(input());
    if (first.outcome !== "created") throw new Error("expected created conversion");
    const writesAfterCreate = h.committedWrites.length;

    await expect(repository.convert(input())).resolves.toMatchObject({
      outcome: "replayed",
      payload: first.payload,
      notifications: []
    });
    expect(h.committedWrites).toHaveLength(writesAfterCreate);

    await expect(
      repository.convert(input({ payloadFingerprint: "b".repeat(64) }))
    ).resolves.toEqual({ outcome: "idempotency_conflict" });
    await expect(
      repository.convert(input({ idempotencyKey: "exchange-booking-command-0002" }))
    ).resolves.toEqual({ outcome: "already_created" });
    expect(h.committedWrites).toHaveLength(writesAfterCreate);
  });

  it("stores database null rather than an address or JSON null for store fulfillment", async () => {
    const h = createHarness({ serviceMode: "STORE" });
    const repository = new ExchangeBookingConversionRepository(h.client);

    await expect(repository.convert(input())).resolves.toMatchObject({ outcome: "created" });
    const createdOrders = h.committedWrites
      .filter((write) => write.kind === "order")
      .map((write) => write.data);
    expect(createdOrders).toHaveLength(2);
    expect(
      createdOrders.every(
        (order) =>
          order.fulfillmentMode === "store" && order.fulfillmentAddressSnapshot === Prisma.DbNull
      )
    ).toBe(true);
  });

  it("returns the locked current version and performs zero writes for a stale command", async () => {
    const h = createHarness();
    const repository = new ExchangeBookingConversionRepository(h.client);

    await expect(repository.convert(input({ expectedVersion: 6 }))).resolves.toEqual({
      outcome: "version_conflict",
      currentVersion: 7
    });
    expect(h.committedWrites).toEqual([]);
  });

  it("rolls back the first order, capacity, participant and replacement writes if a later slot loses capacity", async () => {
    const h = createHarness({ failSlotUpdateId: 31, ordinaryPending: true });
    const invalidateSupersededAffiliate = jest.fn(async () => undefined);
    const repository = new ExchangeBookingConversionRepository(h.client);

    await expect(repository.convert(input(), { invalidateSupersededAffiliate })).resolves.toEqual({
      outcome: "slot_unavailable"
    });

    expect(h.committedWrites).toEqual([]);
    expect(h.orders).toEqual([
      expect.objectContaining({ id: 800, status: "PENDING", exchangeMatchParticipant: null })
    ]);
    expect(h.slots.find((slot) => slot.id === 30)?.bookedCount).toBe(0);
    expect(h.slots.find((slot) => slot.id === 40)?.bookedCount).toBe(1);
    expect(h.participants.every((participant) => participant.bookingOrderId === null)).toBe(true);
    expect(h.events).toEqual([]);
    expect(h.notifications).toEqual([]);
    expect(h.audits).toEqual([]);
    expect(h.financeWrites).toEqual([]);
  });

  it("replaces only ordinary unlinked pending orders and invalidates their Affiliate attribution in-transaction", async () => {
    const h = createHarness({ ordinaryPending: true });
    const invalidateSupersededAffiliate = jest.fn(async ({ transactionClient, bookingOrderId }) => {
      expect(transactionClient).toBeDefined();
      expect(bookingOrderId).toBe(800);
    });
    const repository = new ExchangeBookingConversionRepository(h.client);

    await expect(
      repository.convert(input(), { invalidateSupersededAffiliate })
    ).resolves.toMatchObject({
      outcome: "created"
    });
    expect(h.orders.find((order) => order.id === 800)?.status).toBe("CANCELLED");
    expect(h.slots.find((slot) => slot.id === 40)).toMatchObject({
      bookedCount: 0,
      status: "AVAILABLE"
    });
    expect(h.committedWrites.filter((write) => write.kind === "history")).toHaveLength(1);
    expect(invalidateSupersededAffiliate).toHaveBeenCalledTimes(1);
    expect(h.financeWrites).toEqual([]);
  });

  it("applies the Black-member pending overlap rule only to pre-existing orders", async () => {
    const h = createHarness({ membershipLevel: "black", customerConflict: true });
    const repository = new ExchangeBookingConversionRepository(h.client);

    await expect(repository.convert(input())).resolves.toEqual({ outcome: "slot_unavailable" });
    expect(h.committedWrites).toEqual([]);
  });

  it("rejects duplicate technicians before any write", async () => {
    const h = createHarness({
      participantMutator: (participants) => {
        participants[1].technicianProfileId = participants[0].technicianProfileId;
        participants[1].exchangeClaim.technicianProfileId = participants[0].technicianProfileId;
      }
    });
    const repository = new ExchangeBookingConversionRepository(h.client);

    await expect(repository.convert(input())).resolves.toEqual({ outcome: "slot_unavailable" });
    expect(h.committedWrites).toEqual([]);
  });
});
