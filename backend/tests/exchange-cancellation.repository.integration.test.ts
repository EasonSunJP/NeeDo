/* eslint-disable @typescript-eslint/no-explicit-any -- guarded real-MySQL fixture coordination */
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
import { ExchangeCancellationRepository } from "../src/repositories/exchange-cancellation.repository";
import { LedgerRepository } from "../src/repositories/ledger.repository";
import { LedgerService } from "../src/services/ledger.service";
import type { ExchangeCancellationAction } from "../src/domain/exchange-cancellation";
import type {
  ExchangeCancellationActorInput,
  ExchangeCancellationSettlementOptions
} from "../src/types/exchange-cancellation.types";
import { sha256StableJson } from "../src/utils/stable-json";

const enabled = process.env.RUN_EXCHANGE_CANCELLATION_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;

jest.setTimeout(120_000);

class RollbackVerifiedExchangeCancellation extends Error {}

const cancellationInput = (
  fixture: ExchangeBookingFixture,
  actor: ExchangeCancellationActorInput,
  orderId: number,
  action: ExchangeCancellationAction,
  expectedVersion: number,
  suffix: string
) => ({
  ...actor,
  orderId,
  action,
  expectedVersion,
  reason: action === "request" ? `${fixture.marker} cancellation` : null,
  idempotencyKey: `${fixture.marker}:cancellation:${suffix}`,
  payloadFingerprint: sha256StableJson({
    actor,
    orderId,
    action,
    expectedVersion,
    suffix
  }),
  occurredAt: fixture.now,
  audit: {
    actorId: actor.actorUserId,
    action: `exchange.cancellation.${action}`,
    targetType: "booking_order",
    targetId: orderId,
    ip: "127.0.0.1",
    userAgent: fixture.marker
  }
});

const customerActor = (fixture: ExchangeBookingFixture): ExchangeCancellationActorInput => ({
  actorUserId: fixture.ownerUserId,
  actorIdentityId: fixture.ownerIdentityId,
  actorIdentityType: "customer",
  actorIdentityScopeType: null,
  actorIdentityScopeId: null,
  actorPublicId: fixture.ownerPublicId,
  actorScope: { kind: "customer" }
});

async function providerActor(
  client: any,
  fixture: ExchangeBookingFixture,
  index: number
): Promise<ExchangeCancellationActorInput> {
  const identity = await client.userIdentity.findUniqueOrThrow({
    where: { id: fixture.providerIdentityIds[index] },
    select: {
      id: true,
      userId: true,
      type: true,
      scopeType: true,
      scopeId: true,
      publicIdentifier: { select: { publicId: true } }
    }
  });
  if (!identity.publicIdentifier || identity.scopeId === null) {
    throw new Error("provider fixture identity is incomplete");
  }
  return {
    actorUserId: identity.userId,
    actorIdentityId: identity.id,
    actorIdentityType: identity.type,
    actorIdentityScopeType: identity.scopeType,
    actorIdentityScopeId: identity.scopeId,
    actorPublicId: identity.publicIdentifier.publicId,
    actorScope: { kind: "technician", technicianProfileId: identity.scopeId }
  };
}

async function convertFixture(client: any, fixture: ExchangeBookingFixture): Promise<number[]> {
  const service = await createExchangeBookingService(client, fixture, [], 7_100);
  await service.createBookings(
    ownerAccess(fixture),
    fixture.exchangePostId,
    { expectedVersion: 7 },
    `${fixture.marker}:bookings`,
    { ip: "127.0.0.1", userAgent: fixture.marker }
  );
  const participants = await client.exchangeMatchParticipant.findMany({
    where: { id: { in: fixture.participantIds } },
    orderBy: { id: "asc" },
    select: { bookingOrderId: true }
  });
  const orderIds = participants.map((participant: { bookingOrderId: number | null }) =>
    participant.bookingOrderId
  );
  if (orderIds.some((id: number | null): id is null => id === null)) {
    throw new Error("booking conversion did not link every participant order");
  }
  return orderIds as number[];
}

const noSettlement: ExchangeCancellationSettlementOptions = {
  capturePublicationFee: async () => undefined,
  releaseBookingHold: async () => undefined
};

describeIntegration("Exchange cancellation guarded MySQL integration", () => {
  let rootClient: PrismaClient;
  let clientA: PrismaClient;
  let clientB: PrismaClient;

  beforeAll(async () => {
    const target = requireSafeExchangeClaimFlowEnvironment(
      process.env.FORMAL_BACKEND_ENV_FILE
    );
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

  it("serializes two independent cancellation requests to one active request", async () => {
    const marker = `exchange-cancellation-race-${Date.now()}`;
    let fixture: ExchangeBookingFixture | null = null;
    try {
      fixture = await rootClient.$transaction((transaction) =>
        createExchangeBookingFixture(transaction, marker)
      );
      const [orderId] = await convertFixture(rootClient, fixture);
      const actor = customerActor(fixture);
      const [resultA, resultB] = await Promise.all([
        new ExchangeCancellationRepository(clientA).command(
          cancellationInput(fixture, actor, orderId!, "request", 0, "race-a"),
          noSettlement
        ),
        new ExchangeCancellationRepository(clientB).command(
          cancellationInput(fixture, actor, orderId!, "request", 0, "race-b"),
          noSettlement
        )
      ]);
      expect([resultA.outcome, resultB.outcome].sort()).toEqual([
        "created",
        "version_conflict"
      ]);
      expect([resultA, resultB].find((result) => result.outcome === "version_conflict")).toEqual({
        outcome: "version_conflict",
        currentVersion: 1
      });
      await expect(
        new ExchangeCancellationRepository(rootClient).command(
          cancellationInput(fixture, actor, orderId!, "request", 1, "current-version-pending"),
          noSettlement
        )
      ).resolves.toEqual({ outcome: "pending_conflict" });
      await expect(rootClient.exchangeBookingCancellation.count({
        where: { bookingOrderId: orderId, status: "PENDING", activeOrderId: orderId }
      })).resolves.toBe(1);
    } finally {
      if (fixture) {
        await cleanupExchangeBookingFixture(rootClient, fixture);
        expect(await countExchangeBookingMarkerRows(rootClient, marker)).toBe(0);
      }
    }
  });

  it("rolls the order, slot, and cancellation decision back when settlement fails", async () => {
    const marker = `exchange-cancellation-rollback-${Date.now()}`;
    let fixture: ExchangeBookingFixture | null = null;
    try {
      fixture = await rootClient.$transaction((transaction) =>
        createExchangeBookingFixture(transaction, marker)
      );
      const [orderId] = await convertFixture(rootClient, fixture);
      const customer = customerActor(fixture);
      const provider = await providerActor(rootClient, fixture, 0);
      const repository = new ExchangeCancellationRepository(rootClient);
      await expect(repository.command(
        cancellationInput(fixture, customer, orderId!, "request", 0, "rollback-request"),
        noSettlement
      )).resolves.toMatchObject({ outcome: "created" });

      const settlementFailure = new Error("guarded settlement failure");
      await expect(repository.command(
        cancellationInput(fixture, provider, orderId!, "accept", 1, "rollback-accept"),
        {
          capturePublicationFee: async () => { throw settlementFailure; },
          releaseBookingHold: async () => undefined
        }
      )).rejects.toBe(settlementFailure);

      await expect(rootClient.bookingOrder.findUniqueOrThrow({ where: { id: orderId } }))
        .resolves.toMatchObject({ status: "PENDING" });
      await expect(rootClient.scheduleSlot.findUniqueOrThrow({
        where: { id: fixture.participantSlotIds[0] }
      })).resolves.toMatchObject({ bookedCount: 1, status: "BOOKED" });
      await expect(rootClient.exchangeBookingCancellation.findFirstOrThrow({
        where: { bookingOrderId: orderId, deletedAt: null }
      })).resolves.toMatchObject({ status: "PENDING", version: 1 });
      await expect(rootClient.exchangeBookingCancellationEvent.count({
        where: { bookingOrderId: orderId }
      })).resolves.toBe(1);
    } finally {
      if (fixture) {
        await cleanupExchangeBookingFixture(rootClient, fixture);
        expect(await countExchangeBookingMarkerRows(rootClient, marker)).toBe(0);
      }
    }
  });

  it("keeps reject and withdraw finance-neutral and captures one Demand fee across two accepted orders", async () => {
    const marker = `exchange-cancellation-finance-${Date.now()}`;
    let report: { orderCount: number; captureCount: number } | null = null;
    try {
      await rootClient.$transaction(async (transaction) => {
        const fixture = await createExchangeBookingFixture(transaction, marker);
        const orderIds = await convertFixture(transaction, fixture);
        const customer = customerActor(fixture);
        const providers = await Promise.all([
          providerActor(transaction, fixture, 0),
          providerActor(transaction, fixture, 1)
        ]);
        const repository = new ExchangeCancellationRepository(transaction, () => fixture.now);
        const ledger = new LedgerService(new LedgerRepository(transaction), undefined, undefined, () => fixture.now);
        const settlement: ExchangeCancellationSettlementOptions = {
          capturePublicationFee: async (input) => {
            await ledger.captureExchangeRequestPublication(
              { exchangePostId: input.exchangePostId, actorUserId: input.actorUserId },
              { transactionClient: input.transactionClient }
            );
          },
          releaseBookingHold: async () => {
            throw new Error("pending Request order must not release a booking hold");
          }
        };
        const financeSnapshot = async () => ({
          wallet: await transaction.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } }),
          hold: await transaction.walletHold.findUniqueOrThrow({ where: { id: fixture.walletHoldId } }),
          financial: await transaction.exchangeRequestFinancial.findUniqueOrThrow({
            where: { id: fixture.requestFinancialId }
          }),
          ledgerCount: await transaction.ledgerTransaction.count({
            where: { referenceType: "exchange_request", referenceId: fixture.exchangePostId }
          })
        });
        const before = await financeSnapshot();

        await repository.command(
          cancellationInput(fixture, customer, orderIds[0]!, "request", 0, "withdraw-request"),
          settlement
        );
        await repository.command(
          cancellationInput(fixture, customer, orderIds[0]!, "withdraw", 1, "withdraw"),
          settlement
        );
        await repository.command(
          cancellationInput(fixture, providers[0]!, orderIds[0]!, "request", 2, "reject-request"),
          settlement
        );
        await repository.command(
          cancellationInput(fixture, customer, orderIds[0]!, "reject", 3, "reject"),
          settlement
        );
        expect(await financeSnapshot()).toEqual(before);

        await repository.command(
          cancellationInput(fixture, customer, orderIds[0]!, "request", 4, "accept-first-request"),
          settlement
        );
        await expect(repository.command(
          cancellationInput(fixture, providers[0]!, orderIds[0]!, "accept", 5, "accept-first"),
          settlement
        )).resolves.toMatchObject({ outcome: "created", payload: { orderStatus: "cancelled" } });
        await expect(transaction.bookingOrder.findUniqueOrThrow({ where: { id: orderIds[1] } }))
          .resolves.toMatchObject({ status: "PENDING" });

        await repository.command(
          cancellationInput(fixture, providers[1]!, orderIds[1]!, "request", 0, "accept-second-request"),
          settlement
        );
        await expect(repository.command(
          cancellationInput(fixture, customer, orderIds[1]!, "accept", 1, "accept-second"),
          settlement
        )).resolves.toMatchObject({ outcome: "created", payload: { orderStatus: "cancelled" } });

        const captureCount = await transaction.ledgerTransaction.count({
          where: {
            type: "EXCHANGE_REQUEST_PUBLICATION_CAPTURE",
            referenceType: "exchange_request",
            referenceId: fixture.exchangePostId,
            deletedAt: null
          }
        });
        expect(captureCount).toBe(1);
        await expect(transaction.exchangeRequestFinancial.findUniqueOrThrow({
          where: { id: fixture.requestFinancialId }
        })).resolves.toMatchObject({ state: "CAPTURED" });
        await expect(transaction.walletHold.findUniqueOrThrow({
          where: { id: fixture.walletHoldId }
        })).resolves.toMatchObject({ status: "captured", capturedAmountNdp: 500 });
        await expect(transaction.bookingOrder.findMany({
          where: { id: { in: orderIds } },
          orderBy: { id: "asc" }
        })).resolves.toEqual(expect.arrayContaining([
          expect.objectContaining({ status: "CANCELLED" }),
          expect.objectContaining({ status: "CANCELLED" })
        ]));
        await expect(transaction.scheduleSlot.findMany({
          where: { id: { in: fixture.participantSlotIds } }
        })).resolves.toEqual(expect.arrayContaining([
          expect.objectContaining({ bookedCount: 0, status: "AVAILABLE" }),
          expect.objectContaining({ bookedCount: 0, status: "AVAILABLE" })
        ]));
        report = { orderCount: orderIds.length, captureCount };
        throw new RollbackVerifiedExchangeCancellation();
      }, { maxWait: 10_000, timeout: 60_000 });
    } catch (error) {
      if (!(error instanceof RollbackVerifiedExchangeCancellation)) throw error;
    }

    expect(report).toEqual({ orderCount: 2, captureCount: 1 });
    expect(await countExchangeBookingMarkerRows(rootClient, marker)).toBe(0);
  });
});
