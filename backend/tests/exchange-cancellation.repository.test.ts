/* eslint-disable @typescript-eslint/no-explicit-any -- stateful Prisma transaction harness */
import type { PrismaClient } from "@prisma/client";
import { ExchangeCancellationRepository } from "../src/repositories/exchange-cancellation.repository";
import type {
  ExchangeCancellationActorInput,
  ExchangeCancellationCommandInput
} from "../src/types/exchange-cancellation.types";

const occurredAt = new Date("2026-09-05T03:00:00.000Z");
const startsAt = new Date("2026-09-06T03:00:00.000Z");

const customer: ExchangeCancellationActorInput = {
  actorUserId: 41,
  actorIdentityId: 410,
  actorIdentityType: "customer",
  actorIdentityScopeType: "customer_profile",
  actorIdentityScopeId: 4100,
  actorPublicId: "u0000000041",
  actorScope: { kind: "customer" }
};
const provider: ExchangeCancellationActorInput = {
  actorUserId: 51,
  actorIdentityId: 510,
  actorIdentityType: "technician",
  actorIdentityScopeType: "technician_profile",
  actorIdentityScopeId: 9,
  actorPublicId: "s0000000009",
  actorScope: { kind: "technician", technicianProfileId: 9 }
};
const merchantProvider: ExchangeCancellationActorInput = {
  actorUserId: 61,
  actorIdentityId: 610,
  actorIdentityType: "merchant_owner",
  actorIdentityScopeType: "merchant_account",
  actorIdentityScopeId: 77,
  actorPublicId: "m0000000077",
  actorScope: { kind: "merchant", shopId: 8 }
};

const command = (
  actor: ExchangeCancellationActorInput,
  action: ExchangeCancellationCommandInput["action"],
  expectedVersion: number,
  overrides: Partial<ExchangeCancellationCommandInput> = {}
): ExchangeCancellationCommandInput => ({
  ...actor,
  orderId: 501,
  action,
  expectedVersion,
  reason: action === "request" ? "time conflict" : null,
  idempotencyKey: `idem-${action}-${actor.actorUserId}-${expectedVersion}`,
  payloadFingerprint: action.repeat(64).slice(0, 64),
  occurredAt,
  audit: {
    actorId: actor.actorUserId,
    action: `exchange.cancellation.${action}`,
    targetType: "booking_order",
    targetId: 501,
    ip: "127.0.0.1",
    userAgent: "repository-test"
  },
  ...overrides
});

interface HarnessOptions {
  orderStatus?: "PENDING" | "CONFIRMED" | "CANCELLED";
  latest?: null | {
    id: number;
    status: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
    version: number;
    requestedVersion: number;
    initiatedByUserId: number;
    initiatedByIdentityId: number;
    initiatorParty: "CUSTOMER" | "PROVIDER";
    reason: string;
    createdAt: Date;
    resolvedAt: Date | null;
  };
  replay?: boolean;
}

const createHarness = (options: HarnessOptions = {}) => {
  const cancellations: any[] = options.latest
    ? [{ bookingOrderId: 501, deletedAt: null, ...options.latest }]
    : [];
  const events: any[] = [];
  const notifications: any[] = [];
  const audits: any[] = [];
  const lockSql: string[] = [];
  const order = {
    id: 501,
    orderType: "REQUEST",
    customerUserId: 41,
    serviceId: 10,
    technicianServiceId: null,
    shopId: 8,
    technicianProfileId: 9,
    scheduleSlotId: 30,
    status: options.orderStatus ?? "PENDING",
    priceAmount: 12_000,
    startsAt,
    paymentStatus: "PENDING",
    paymentConfirmedAt: null,
    paymentRefundedAt: null,
    deletedAt: null,
    shop: { id: 8, status: "published", deletedAt: null },
    technicianProfile: {
      id: 9,
      userId: 51,
      status: "published",
      deletedAt: null,
      user: { id: 51, isActive: true, deletedAt: null },
      technicianShopAffiliations: [
        {
          id: 91,
          shopId: 8,
          workStatus: "ACTIVE",
          activeKey: "affiliation:91",
          startsAt: new Date("2026-09-01T00:00:00.000Z"),
          endsAt: null,
          deletedAt: null
        }
      ]
    },
    serviceSession: null
  };
  const participant = {
    id: 71,
    exchangePostId: 42,
    participantUserId: 51,
    participantIdentityId: 510,
    shopId: 8,
    technicianProfileId: 9,
    bookingOrderId: 501,
    deletedAt: null,
    exchangePost: {
      id: 42,
      authorUserId: 41,
      ownerIdentityId: 410,
      deletedAt: null
    },
    bookingOrder: order,
    cancellations
  };
  let nextCancellationId = 800;
  let nextEventId = 900;
  let nextNotificationId = 1000;

  if (options.replay) {
    events.push({
      id: 899,
      cancellationId: cancellations[0]?.id ?? 799,
      bookingOrderId: 501,
      type: "REQUESTED",
      actorUserId: 41,
      actorIdentityId: 410,
      actorParty: "CUSTOMER",
      versionBefore: 0,
      versionAfter: 1,
      idempotencyKey: "idem-request-41-0",
      payloadFingerprint: "request".repeat(11).slice(0, 64),
      resultSnapshot: {
        orderId: 501,
        orderStatus: "pending",
        viewerParty: "customer",
        allowedActions: ["withdraw"],
        cancellation: {
          id: cancellations[0]?.id ?? 799,
          status: "pending",
          reason: "time conflict",
          initiatorParty: "customer",
          version: 1,
          requestedAt: occurredAt.toISOString(),
          resolvedAt: null
        }
      },
      deletedAt: null
    });
  }

  const client: any = {
    $queryRaw: jest.fn(async (query: { strings?: readonly string[]; sql?: string }) => {
      lockSql.push(query.sql ?? query.strings?.join("?") ?? "");
      return [{ id: 1 }];
    }),
    exchangeMatchParticipant: {
      findFirst: jest.fn(async () => participant)
    },
    merchantShopMembership: {
      findFirst: jest.fn(async () => ({ id: 701 }))
    },
    exchangeBookingCancellation: {
      findFirst: jest.fn(async () => cancellations.at(-1) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: nextCancellationId++,
          ...data,
          createdAt: data.createdAt,
          updatedAt: data.createdAt,
          resolvedAt: null
        };
        cancellations.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = cancellations.find(
          (item) => item.id === where.id && item.status === where.status && item.version === where.version
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      })
    },
    exchangeBookingCancellationEvent: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.idempotencyKey) {
          return events.find((item) => item.idempotencyKey === where.idempotencyKey) ?? null;
        }
        return null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextEventId++, ...data, createdAt: data.createdAt, readAt: null };
        events.push(row);
        return row;
      })
    },
    bookingOrder: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (order.id !== where.id || !where.status.in.includes(order.status)) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      })
    },
    scheduleSlot: {
      updateMany: jest.fn(async () => ({ count: 1 }))
    },
    orderStatusHistory: { create: jest.fn(async ({ data }: any) => data) },
    notification: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextNotificationId++, ...data, readAt: null, createdAt: data.createdAt };
        notifications.push(row);
        return row;
      })
    },
    auditLog: {
      create: jest.fn(async ({ data }: any) => {
        audits.push(data);
        return data;
      })
    }
  };
  const settlement = {
    capturePublicationFee: jest.fn(async () => undefined),
    releaseBookingHold: jest.fn(async () => undefined)
  };
  const repository = new ExchangeCancellationRepository(client as PrismaClient);
  return {
    repository,
    client,
    settlement,
    order,
    participant,
    cancellations,
    events,
    notifications,
    audits,
    lockSql
  };
};

describe("ExchangeCancellationRepository", () => {
  it("projects read state only to the exact customer or authorized provider scope", async () => {
    const state = createHarness();
    await expect(state.repository.get({ ...customer, orderId: 501 })).resolves.toMatchObject({
      outcome: "found",
      payload: { viewerParty: "customer", allowedActions: ["request"] }
    });
    await expect(state.repository.get({ ...provider, orderId: 501 })).resolves.toMatchObject({
      outcome: "found",
      payload: { viewerParty: "provider", allowedActions: ["request"] }
    });
    await expect(state.repository.get({ ...merchantProvider, orderId: 501 })).resolves.toMatchObject({
      outcome: "found",
      payload: { viewerParty: "provider", allowedActions: ["request"] }
    });
    await expect(
      state.repository.get({
        actorUserId: 99,
        actorIdentityId: 999,
        actorIdentityType: "merchant_owner",
        actorIdentityScopeType: "merchant_account",
        actorIdentityScopeId: 999,
        actorPublicId: "m0000000999",
        actorScope: { kind: "merchant", shopId: 999 },
        orderId: 501
      })
    ).resolves.toEqual({ outcome: "not_found" });
  });

  it("fails closed when the linked order no longer matches the persisted participant snapshot", async () => {
    for (const mutate of [
      (state: ReturnType<typeof createHarness>) => {
        state.participant.bookingOrder.customerUserId = 999;
      },
      (state: ReturnType<typeof createHarness>) => {
        state.participant.bookingOrder.shopId = 999;
      },
      (state: ReturnType<typeof createHarness>) => {
        state.participant.bookingOrder.technicianProfileId = 999;
      }
    ]) {
      const state = createHarness();
      mutate(state);
      await expect(state.repository.get({ ...customer, orderId: 501 })).resolves.toEqual({
        outcome: "not_found"
      });
    }
  });

  it("denies stale provider authority after technician affiliation or merchant membership is revoked", async () => {
    const technician = createHarness();
    technician.participant.bookingOrder.technicianProfile.technicianShopAffiliations = [];
    await expect(technician.repository.get({ ...provider, orderId: 501 })).resolves.toEqual({
      outcome: "not_found"
    });
    await expect(
      technician.repository.command(command(provider, "request", 0), technician.settlement)
    ).resolves.toEqual({ outcome: "not_allowed" });

    const merchant = createHarness();
    merchant.client.merchantShopMembership.findFirst.mockResolvedValue(null);
    await expect(merchant.repository.get({ ...merchantProvider, orderId: 501 })).resolves.toEqual({
      outcome: "not_found"
    });
    await expect(
      merchant.repository.command(command(merchantProvider, "request", 0), merchant.settlement)
    ).resolves.toEqual({ outcome: "not_allowed" });
  });

  it("fails closed before business writes when the exact actor identity cannot be locked", async () => {
    const state = createHarness();
    state.client.$queryRaw
      .mockResolvedValueOnce([{ id: customer.actorUserId }])
      .mockResolvedValueOnce([]);
    await expect(
      state.repository.command(command(customer, "request", 0), state.settlement)
    ).resolves.toEqual({ outcome: "not_allowed" });
    expect(state.client.exchangeBookingCancellation.create).not.toHaveBeenCalled();
    expect(state.client.exchangeBookingCancellationEvent.create).not.toHaveBeenCalled();
    expect(state.client.auditLog.create).not.toHaveBeenCalled();
  });

  it("locks the exact actor, order graph, provider authority, cancellation, and slot in deterministic order", async () => {
    const state = createHarness();
    await expect(
      state.repository.command(command(provider, "request", 0), state.settlement)
    ).resolves.toMatchObject({ outcome: "created" });

    const tables = state.lockSql.map((sql) =>
      [
        "users",
        "user_identities",
        "public_identifiers",
        "booking_orders",
        "exchange_match_participants",
        "exchange_posts",
        "shops",
        "technician_profiles",
        "technician_shop_affiliations",
        "exchange_booking_cancellations",
        "schedule_slots"
      ].find((table) => sql.includes(`FROM ${table}`))
    );
    expect(tables).toEqual([
      "users",
      "user_identities",
      "public_identifiers",
      "booking_orders",
      "exchange_match_participants",
      "exchange_posts",
      "shops",
      "technician_profiles",
      "technician_shop_affiliations",
      "exchange_booking_cancellations",
      "schedule_slots"
    ]);
  });

  it("creates one pending request and append-only event without financial or order effects", async () => {
    const state = createHarness();
    const result = await state.repository.command(command(customer, "request", 0), state.settlement);
    expect(result).toMatchObject({
      outcome: "created",
      payload: {
        orderId: 501,
        orderStatus: "pending",
        viewerParty: "customer",
        allowedActions: ["withdraw"],
        cancellation: { status: "pending", version: 1, initiatorParty: "customer" }
      }
    });
    expect(state.cancellations).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      bookingOrderId: 501,
      type: "REQUESTED",
      versionBefore: 0,
      versionAfter: 1
    });
    expect(state.client.bookingOrder.updateMany).not.toHaveBeenCalled();
    expect(state.client.scheduleSlot.updateMany).not.toHaveBeenCalled();
    expect(state.settlement.capturePublicationFee).not.toHaveBeenCalled();
    expect(state.settlement.releaseBookingHold).not.toHaveBeenCalled();
    expect(state.notifications).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
  });

  it("replays the exact command and rejects the same key with changed payload", async () => {
    const latest = {
      id: 799,
      status: "PENDING" as const,
      version: 1,
      requestedVersion: 1,
      initiatedByUserId: 41,
      initiatedByIdentityId: 410,
      initiatorParty: "CUSTOMER" as const,
      reason: "time conflict",
      createdAt: occurredAt,
      resolvedAt: null
    };
    const replay = createHarness({ latest, replay: true });
    await expect(replay.repository.command(command(customer, "request", 0), replay.settlement)).resolves.toMatchObject({
      outcome: "replayed",
      payload: { cancellation: { id: 799, status: "pending" } },
      notifications: []
    });
    await expect(
      replay.repository.command(
        command(customer, "request", 0, { payloadFingerprint: "f".repeat(64) }),
        replay.settlement
      )
    ).resolves.toEqual({ outcome: "idempotency_conflict" });
  });

  it("retries one unique-key race and returns the winner's exact committed replay", async () => {
    const latest = {
      id: 799,
      status: "PENDING" as const,
      version: 1,
      requestedVersion: 1,
      initiatedByUserId: 41,
      initiatedByIdentityId: 410,
      initiatorParty: "CUSTOMER" as const,
      reason: "time conflict",
      createdAt: occurredAt,
      resolvedAt: null
    };
    const winner = createHarness({ latest, replay: true });
    let attempts = 0;
    const root = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => {
        attempts += 1;
        if (attempts === 1) throw { code: "P2002" };
        return callback(winner.client);
      })
    } as unknown as PrismaClient;
    const repository = new ExchangeCancellationRepository(root);

    await expect(repository.command(command(customer, "request", 0), winner.settlement)).resolves.toMatchObject({
      outcome: "replayed",
      payload: { cancellation: { id: 799 } }
    });
    expect(attempts).toBe(2);
  });

  it("allows only the initiator to withdraw and only the opposite party to reject", async () => {
    const latest = {
      id: 800,
      status: "PENDING" as const,
      version: 1,
      requestedVersion: 1,
      initiatedByUserId: 41,
      initiatedByIdentityId: 410,
      initiatorParty: "CUSTOMER" as const,
      reason: "time conflict",
      createdAt: occurredAt,
      resolvedAt: null
    };
    const sameSide = createHarness({ latest });
    await expect(
      sameSide.repository.command(command(customer, "reject", 1), sameSide.settlement)
    ).resolves.toEqual({ outcome: "not_allowed" });

    const withdraw = createHarness({ latest });
    await expect(
      withdraw.repository.command(command(customer, "withdraw", 1), withdraw.settlement)
    ).resolves.toMatchObject({ outcome: "created", payload: { cancellation: { status: "withdrawn", version: 2 } } });
    expect(withdraw.client.bookingOrder.updateMany).not.toHaveBeenCalled();
    expect(withdraw.settlement.capturePublicationFee).not.toHaveBeenCalled();

    const reject = createHarness({ latest });
    await expect(
      reject.repository.command(command(provider, "reject", 1), reject.settlement)
    ).resolves.toMatchObject({ outcome: "created", payload: { cancellation: { status: "rejected", version: 2 } } });
    expect(reject.client.bookingOrder.updateMany).not.toHaveBeenCalled();
    expect(reject.settlement.capturePublicationFee).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "CONFIRMED"] as const)(
    "accepts the opposite party and atomically cancels a %s order",
    async (orderStatus) => {
      const latest = {
        id: 800,
        status: "PENDING" as const,
        version: 1,
        requestedVersion: 1,
        initiatedByUserId: 41,
        initiatedByIdentityId: 410,
        initiatorParty: "CUSTOMER" as const,
        reason: "time conflict",
        createdAt: occurredAt,
        resolvedAt: null
      };
      const state = createHarness({ latest, orderStatus });
      await expect(
        state.repository.command(command(provider, "accept", 1), state.settlement)
      ).resolves.toMatchObject({
        outcome: "created",
        payload: { orderStatus: "cancelled", cancellation: { status: "accepted", version: 2 } }
      });
      expect(state.order.status).toBe("CANCELLED");
      expect(state.client.scheduleSlot.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 30, bookedCount: { gt: 0 } }),
          data: { bookedCount: { decrement: 1 }, status: "AVAILABLE" }
        })
      );
      expect(state.client.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          bookingOrderId: 501,
          fromStatus: orderStatus,
          toStatus: "CANCELLED",
          actorUserId: 51,
          createdAt: occurredAt
        }
      });
      expect(state.settlement.capturePublicationFee).toHaveBeenCalledWith({
        exchangePostId: 42,
        actorUserId: 51,
        transactionClient: state.client
      });
      expect(state.settlement.releaseBookingHold).toHaveBeenCalledTimes(
        orderStatus === "CONFIRMED" ? 1 : 0
      );
    }
  );

  it.each([
    ["PENDING", "capturePublicationFee"],
    ["CONFIRMED", "releaseBookingHold"]
  ] as const)(
    "rolls back a %s acceptance when %s fails",
    async (orderStatus, failingCallback) => {
      const latest = {
        id: 800,
        status: "PENDING" as const,
        version: 1,
        requestedVersion: 1,
        initiatedByUserId: 41,
        initiatedByIdentityId: 410,
        initiatorParty: "CUSTOMER" as const,
        reason: "time conflict",
        createdAt: occurredAt,
        resolvedAt: null
      };
      const state = createHarness({ latest, orderStatus });
      const failure = new Error("ledger mutation failed");
      state.settlement[failingCallback].mockRejectedValueOnce(failure);
      const root = {
        $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => {
          const orderBefore = structuredClone(state.order);
          const cancellationBefore = structuredClone(state.cancellations);
          const eventCount = state.events.length;
          const notificationCount = state.notifications.length;
          const auditCount = state.audits.length;
          try {
            return await callback(state.client);
          } catch (error) {
            Object.assign(state.order, orderBefore);
            state.cancellations.splice(0, state.cancellations.length, ...cancellationBefore);
            state.events.splice(eventCount);
            state.notifications.splice(notificationCount);
            state.audits.splice(auditCount);
            throw error;
          }
        })
      } as unknown as PrismaClient;
      const repository = new ExchangeCancellationRepository(root);

      await expect(
        repository.command(command(provider, "accept", 1), state.settlement)
      ).rejects.toBe(failure);
      expect(state.order.status).toBe(orderStatus);
      expect(state.cancellations[0]).toMatchObject({ status: "PENDING", version: 1 });
      expect(state.events).toHaveLength(0);
      expect(state.notifications).toHaveLength(0);
      expect(state.audits).toHaveLength(0);
    }
  );

  it("returns stable conflicts for stale versions and slot release failures", async () => {
    const latest = {
      id: 800,
      status: "PENDING" as const,
      version: 1,
      requestedVersion: 1,
      initiatedByUserId: 41,
      initiatedByIdentityId: 410,
      initiatorParty: "CUSTOMER" as const,
      reason: "time conflict",
      createdAt: occurredAt,
      resolvedAt: null
    };
    const stale = createHarness({ latest });
    await expect(stale.repository.command(command(provider, "accept", 2), stale.settlement)).resolves.toEqual({
      outcome: "version_conflict",
      currentVersion: 1
    });

    const slot = createHarness({ latest });
    slot.client.scheduleSlot.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(slot.repository.command(command(provider, "accept", 1), slot.settlement)).resolves.toEqual({
      outcome: "slot_conflict"
    });
  });
});
