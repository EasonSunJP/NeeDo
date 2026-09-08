import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import {
  cleanupExchangeBookingFixture,
  countExchangeBookingMarkerRows,
  createExchangeBookingFixture,
  createExchangeBookingService,
  ownerAccess,
  type ExchangeBookingFixture
} from "../scripts/check-exchange-booking-conversion-flow";
import { requireSafeExchangeClaimFlowEnvironment } from "../scripts/support/exchange-claim-flow-safety";

const enabled = process.env.RUN_EXCHANGE_BOOKING_CONVERSION_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;

jest.setTimeout(120_000);

describeIntegration("Exchange booking conversion concurrency", () => {
  let rootClient: PrismaClient;
  let clientA: PrismaClient;
  let clientB: PrismaClient;

  beforeAll(async () => {
    const target = requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
    process.env.ENV_FILE = target.envFile;
    const { createPrismaClient } = await import("../src/prisma/client");
    rootClient = createPrismaClient();
    clientA = createPrismaClient();
    clientB = createPrismaClient();
  });

  afterAll(async () => {
    await Promise.all(
      [rootClient, clientA, clientB].filter(Boolean).map((client) => client.$disconnect())
    );
  });

  it("allows exactly one of two independent connections to commit", async () => {
    const marker = `exchange-booking-race-${Date.now()}`;
    let fixture: ExchangeBookingFixture | null = null;

    try {
      fixture = await rootClient.$transaction(
        (transaction) => createExchangeBookingFixture(transaction, marker),
        { maxWait: 10_000, timeout: 30_000 }
      );
      const access = ownerAccess(fixture);
      const context = { ip: "127.0.0.1", userAgent: marker };
      const invalidatedByA: number[] = [];
      const invalidatedByB: number[] = [];
      const [serviceA, serviceB] = await Promise.all([
        createExchangeBookingService(clientA, fixture, invalidatedByA, 5100),
        createExchangeBookingService(clientB, fixture, invalidatedByB, 6100)
      ]);

      const results = await Promise.allSettled([
        serviceA.createBookings(
          access,
          fixture.exchangePostId,
          { expectedVersion: 7 },
          `${marker}:command:a`,
          context
        ),
        serviceB.createBookings(
          access,
          fixture.exchangePostId,
          { expectedVersion: 7 },
          `${marker}:command:b`,
          context
        )
      ]);
      const fulfilled = results.filter(
        (
          result
        ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof serviceA.createBookings>>> =>
          result.status === "fulfilled"
      );
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({
        message: expect.stringMatching(
          /^error\.exchange\.match_booking_(?:already_created|version_conflict)$/u
        )
      });

      const [participants, orders, slots, events, matching] = await Promise.all([
        rootClient.exchangeMatchParticipant.findMany({
          where: { id: { in: fixture.participantIds } },
          orderBy: { id: "asc" }
        }),
        rootClient.bookingOrder.findMany({
          where: { customerUserId: fixture.ownerUserId },
          orderBy: { id: "asc" }
        }),
        rootClient.scheduleSlot.findMany({
          where: { id: { in: [...fixture.participantSlotIds, fixture.oldSlotId] } },
          orderBy: { id: "asc" }
        }),
        rootClient.exchangeMatchEvent.findMany({
          where: { matchingId: fixture.matchingId, type: "BOOKINGS_CREATED" }
        }),
        rootClient.exchangeRequestMatching.findUniqueOrThrow({
          where: { id: fixture.matchingId }
        })
      ]);
      const createdOrders = orders.filter((order) => order.id !== fixture?.oldOrderId);
      expect(participants).toHaveLength(fixture.participantIds.length);
      expect(participants.every((participant) => participant.bookingOrderId !== null)).toBe(true);
      expect(createdOrders).toHaveLength(fixture.participantIds.length);
      expect(createdOrders.every((order) => order.status === "PENDING")).toBe(true);
      expect(events).toHaveLength(1);
      expect(matching.version).toBe(8);
      expect(
        slots
          .filter((slot) => fixture?.participantSlotIds.includes(slot.id))
          .every((slot) => slot.bookedCount === 1 && slot.status === "BOOKED")
      ).toBe(true);
      expect(slots.find((slot) => slot.id === fixture?.oldSlotId)).toMatchObject({
        bookedCount: 0,
        status: "AVAILABLE"
      });
      expect([...invalidatedByA, ...invalidatedByB]).toEqual([fixture.oldOrderId]);
    } finally {
      if (fixture) {
        await cleanupExchangeBookingFixture(rootClient, fixture);
        expect(await countExchangeBookingMarkerRows(rootClient, marker)).toBe(0);
      }
    }
  });
});
