/* eslint-disable @typescript-eslint/no-explicit-any -- guarded real-MySQL fixture coordination */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  cleanupExchangeBookingFixture,
  countExchangeBookingMarkerRows,
  createExchangeBookingFixture,
  createExchangeBookingService,
  ownerAccess,
  type ExchangeBookingFixture
} from "../scripts/check-exchange-booking-conversion-flow";
import { requireExchangeCancellationScratchEnvironment } from "../scripts/check-exchange-cancellation-flow";
import { BookingRepository } from "../src/repositories/booking.repository";
import { ExchangeCancellationRepository } from "../src/repositories/exchange-cancellation.repository";
import { FeeRuleRepository } from "../src/repositories/fee-rule.repository";
import { LedgerRepository } from "../src/repositories/ledger.repository";
import { FeeCalculationService } from "../src/services/fee-calculation.service";
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
  // Committed race fixtures share the scratch DB; reserve a distinct order-number range per post.
  const service = await createExchangeBookingService(
    client,
    fixture,
    [],
    fixture.exchangePostId * 100
  );
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
  const orderIds = participants.map(
    (participant: { bookingOrderId: number | null }) => participant.bookingOrderId
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

type FinanceClient = PrismaClient | Prisma.TransactionClient;
const platformWalletKey = {
  ownerType_ownerId_currency: { ownerType: "PLATFORM" as const, ownerId: 1, currency: "TEST_NDP" }
};

async function financeEvidence(client: FinanceClient, fixture: ExchangeBookingFixture) {
  const orders = await client.bookingOrder.findMany({
    where: { customerUserId: fixture.ownerUserId },
    select: { id: true }
  });
  return {
    payer: await client.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } }),
    platform: await client.wallet.findUnique({ where: platformWalletKey }),
    transactions: await client.ledgerTransaction.findMany({
      where: {
        OR: [
          { referenceType: "exchange_request", referenceId: fixture.exchangePostId },
          { referenceType: "booking_order", referenceId: { in: orders.map(({ id }) => id) } }
        ]
      },
      include: { entries: { orderBy: { id: "asc" } }, reconciliation: true },
      orderBy: { id: "asc" }
    })
  };
}

function expectPublicationConservation(
  before: Awaited<ReturnType<typeof financeEvidence>>,
  after: Awaited<ReturnType<typeof financeEvidence>>
) {
  expect(after.platform).not.toBeNull();
  expect(after.platform!.availableBalance - (before.platform?.availableBalance ?? 0)).toBe(500);
  expect(after.platform!.frozenBalance - (before.platform?.frozenBalance ?? 0)).toBe(0);
  const total = (e: typeof before) =>
    e.payer.availableBalance +
    e.payer.frozenBalance +
    (e.platform?.availableBalance ?? 0) +
    (e.platform?.frozenBalance ?? 0);
  expect(total(after)).toBe(total(before));
  const captures = after.transactions.filter(
    (row) => row.type === "EXCHANGE_REQUEST_PUBLICATION_CAPTURE"
  );
  expect(captures).toHaveLength(1);
  const capture = captures[0]!;
  expect(capture).toMatchObject({ amount: 500, currency: "TEST_NDP", status: "APPLIED" });
  expect(capture.entries).toHaveLength(2);
  expect(capture.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        walletId: after.payer.id,
        direction: "FROZEN_DEBIT",
        amount: 500,
        availableDelta: 0,
        frozenDelta: -500
      }),
      expect.objectContaining({
        walletId: after.platform!.id,
        direction: "AVAILABLE_CREDIT",
        amount: 500,
        availableDelta: 500,
        frozenDelta: 0
      })
    ])
  );
  expect(
    capture.entries.reduce((sum, entry) => sum + entry.availableDelta + entry.frozenDelta, 0)
  ).toBe(0);
  expect(capture.reconciliation).toMatchObject({
    transactionId: capture.id,
    referenceType: "exchange_request",
    referenceId: capture.referenceId,
    status: "TEST_ONLY",
    currency: "TEST_NDP",
    expectedAmount: 500,
    actualAmount: 500,
    differenceAmount: 0
  });
}

// Only fixture-referenced ledger rows are removed. Undo their platform delta, never reset the
// shared platform wallet to a stale snapshot. This helper is used only inside the guarded scratch DB.
async function cleanupCommittedCancellation(client: PrismaClient, fixture: ExchangeBookingFixture) {
  await client.$transaction(
    async (tx) => {
      const evidence = await financeEvidence(tx, fixture);
      const ids = evidence.transactions.map(({ id }) => id);
      if (evidence.platform) {
        const entries = evidence.transactions
          .flatMap(({ entries }) => entries)
          .filter(({ walletId }) => walletId === evidence.platform!.id);
        await tx.wallet.update({
          where: { id: evidence.platform.id },
          data: {
            availableBalance: {
              decrement: entries.reduce((sum, entry) => sum + entry.availableDelta, 0)
            },
            frozenBalance: { decrement: entries.reduce((sum, entry) => sum + entry.frozenDelta, 0) }
          }
        });
      }
      await tx.auditLog.deleteMany({
        where: { targetType: "ledger_transaction", targetId: { in: ids } }
      });
      await tx.financeReconciliation.deleteMany({ where: { transactionId: { in: ids } } });
      await tx.walletLedger.deleteMany({ where: { transactionId: { in: ids } } });
      await tx.ledgerTransaction.deleteMany({ where: { id: { in: ids } } });
      await cleanupExchangeBookingFixture(tx, fixture);
      expect(await tx.financeReconciliation.count({ where: { transactionId: { in: ids } } })).toBe(
        0
      );
      expect(await tx.walletLedger.count({ where: { transactionId: { in: ids } } })).toBe(0);
      expect(await tx.ledgerTransaction.count({ where: { id: { in: ids } } })).toBe(0);
    },
    { timeout: 30_000 }
  );
  expect(await countExchangeBookingMarkerRows(client, fixture.marker)).toBe(0);
}

describeIntegration("Exchange cancellation guarded MySQL integration", () => {
  let rootClient: PrismaClient;
  let clientA: PrismaClient;
  let clientB: PrismaClient;

  beforeAll(async () => {
    const target = requireExchangeCancellationScratchEnvironment(
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

  it("concurrently accepts two matched orders on independent connections and captures one balanced Demand fee", async () => {
    const marker = `exchange-cancel-two-accept-${randomUUID()}`;
    let fixture: ExchangeBookingFixture | null = null;
    try {
      fixture = await rootClient.$transaction((tx) => createExchangeBookingFixture(tx, marker));
      const currentFixture = fixture;
      const orderIds = await convertFixture(rootClient, fixture);
      expect(orderIds).toHaveLength(2);
      const customer = customerActor(fixture);
      const providers = await Promise.all(
        orderIds.map((_, index) => providerActor(rootClient, currentFixture, index))
      );
      for (const [index, orderId] of orderIds.entries()) {
        await expect(
          new ExchangeCancellationRepository(rootClient).command(
            cancellationInput(
              fixture,
              customer,
              orderId,
              "request",
              0,
              `concurrent-request-${index}`
            ),
            noSettlement
          )
        ).resolves.toMatchObject({ outcome: "created" });
      }
      const before = await financeEvidence(rootClient, fixture);
      const connections = new Set<string>();
      let ready = 0;
      let start!: () => void;
      const bothConnected = new Promise<void>((resolve) => {
        start = resolve;
      });
      const results = await Promise.allSettled(
        [clientA, clientB].map((client, index) =>
          // Two root clients each own a transaction. The barrier proves both connections are
          // open together before either accept; there is no encompassing rollback transaction.
          client.$transaction(
            async (tx) => {
              const [connection] = await tx.$queryRaw<
                Array<{ id: bigint }>
              >`SELECT CONNECTION_ID() AS id`;
              connections.add(String(connection!.id));
              if (++ready === 2) start();
              let timer: ReturnType<typeof setTimeout> | undefined;
              try {
                await Promise.race([
                  bothConnected,
                  new Promise<never>((_, reject) => {
                    timer = setTimeout(
                      () => reject(new Error("both MySQL connections did not open")),
                      10_000
                    );
                  })
                ]);
              } finally {
                clearTimeout(timer);
              }
              const ledger = new LedgerService(
                new LedgerRepository(tx),
                undefined,
                undefined,
                () => currentFixture.now
              );
              return new ExchangeCancellationRepository(tx).command(
                cancellationInput(
                  currentFixture,
                  providers[index]!,
                  orderIds[index]!,
                  "accept",
                  1,
                  `concurrent-accept-${index}`
                ),
                {
                  capturePublicationFee: async (input) => {
                    await ledger.captureExchangeRequestPublication(
                      { exchangePostId: input.exchangePostId, actorUserId: input.actorUserId },
                      { transactionClient: input.transactionClient }
                    );
                  },
                  releaseBookingHold: async () => {
                    throw new Error("pending order has no booking hold");
                  }
                }
              );
            },
            { maxWait: 10_000, timeout: 30_000 }
          )
        )
      );
      expect(connections.size).toBe(2);
      expect(results).toEqual([
        { status: "fulfilled", value: expect.objectContaining({ outcome: "created" }) },
        { status: "fulfilled", value: expect.objectContaining({ outcome: "created" }) }
      ]);
      expect(
        await rootClient.bookingOrder.count({
          where: { id: { in: orderIds }, status: "CANCELLED" }
        })
      ).toBe(2);
      expect(
        await rootClient.exchangeBookingCancellation.count({
          where: { bookingOrderId: { in: orderIds }, status: "ACCEPTED" }
        })
      ).toBe(2);
      expect(
        await rootClient.scheduleSlot.count({
          where: { id: { in: fixture.participantSlotIds }, bookedCount: 0, status: "AVAILABLE" }
        })
      ).toBe(2);
      const after = await financeEvidence(rootClient, fixture);
      expectPublicationConservation(before, after);
      expect(after.payer).toMatchObject({ availableBalance: 99_500, frozenBalance: 0 });
      expect(
        await rootClient.exchangeRequestFinancial.findUniqueOrThrow({
          where: { id: fixture.requestFinancialId }
        })
      ).toMatchObject({ state: "CAPTURED" });
      expect(
        await rootClient.walletHold.findUniqueOrThrow({ where: { id: fixture.walletHoldId } })
      ).toMatchObject({ status: "captured", capturedAmountNdp: 500 });
    } finally {
      if (fixture) await cleanupCommittedCancellation(rootClient, fixture);
    }
  });

  it.each(["confirm", "start", "payment"] as const)(
    "serializes cancellation against a real %s transition",
    async (transition) => {
      // Committed race fixtures remain only in the dedicated scratch DB. The checker drops
      // and verifies that entire DB after the suite, including on failure.
      const marker = `exchange-cancellation-${transition}-race-${Date.now()}`;
      const fixture = await rootClient.$transaction((tx) =>
        createExchangeBookingFixture(tx, marker)
      );
      const [orderId] = await convertFixture(rootClient, fixture);
      const customer = customerActor(fixture);
      const provider = await providerActor(rootClient, fixture, 0);
      await rootClient.platformFeeRuleSet.update({
        where: { id: fixture.feeRuleSetId },
        data: { status: "active" }
      });
      await rootClient.platformFeeRule.create({
        data: {
          ruleSetId: fixture.feeRuleSetId,
          feeType: "c_request_dispatch_fee",
          orderType: "request",
          payerType: "user",
          baseAmountNdp: 300,
          status: "active"
        }
      });
      const ledger = new LedgerService(
        new LedgerRepository(rootClient),
        new FeeCalculationService(new FeeRuleRepository(rootClient)),
        undefined,
        () => fixture.now
      );
      const booking = new BookingRepository(clientA);
      const confirm = () =>
        booking.transitionOrderWithScheduleGuard(
          {
            id: orderId!,
            fromStatus: "pending",
            toStatus: "confirmed",
            actorUserId: provider.actorUserId,
            actor: {
              userId: provider.actorUserId,
              identityId: provider.actorIdentityId,
              identityType: "technician"
            }
          },
          {
            settle: async ({ transactionClient, order }) => {
              await ledger.freezeBookingAcceptance(
                {
                  bookingOrderId: order.id,
                  orderType: "request",
                  shopId: order.shopId,
                  technicianProfileId: order.technicianProfileId,
                  serviceId: order.serviceId,
                  serviceAmountJpy: Number(order.priceAmount),
                  scheduledStartAt: order.startsAt,
                  acceptedAt: fixture.now,
                  customerUserId: order.customerUserId,
                  actorUserId: provider.actorUserId
                },
                { transactionClient }
              );
            }
          }
        );
      if (transition !== "confirm")
        await expect(confirm()).resolves.toMatchObject({ outcome: "ok" });
      const repository = new ExchangeCancellationRepository(clientB, () => fixture.now);
      const settlement: ExchangeCancellationSettlementOptions = {
        capturePublicationFee: async (input) => {
          await ledger.captureExchangeRequestPublication(
            { exchangePostId: input.exchangePostId, actorUserId: input.actorUserId },
            { transactionClient: input.transactionClient }
          );
        },
        releaseBookingHold: async (input) => {
          await ledger.releaseBookingHold(
            { ...input, orderType: "request" },
            { transactionClient: input.transactionClient }
          );
        }
      };
      await repository.command(
        cancellationInput(fixture, customer, orderId!, "request", 0, "race-request"),
        settlement
      );
      const orderPrice = (
        await rootClient.bookingOrder.findUniqueOrThrow({ where: { id: orderId } })
      ).priceAmount;
      const mutate = () =>
        transition === "confirm"
          ? confirm()
          : transition === "start"
            ? booking.startService({
                orderId: orderId!,
                actorUserId: customer.actorUserId,
                actor: "customer",
                technicianProfileId: null,
                verificationCode: null,
                idempotencyKey: `${marker}:start`,
                requestContext: { ip: "127.0.0.1", userAgent: marker }
              })
            : booking.confirmManualPayment({
                orderId: orderId!,
                actorUserId: provider.actorUserId,
                scope: "merchant",
                shopId: fixture.shopId,
                method: "onsite",
                amountJpy: Number(orderPrice),
                reference: marker
              });
      const [changed, cancelled] = await Promise.all([
        mutate(),
        repository.command(
          cancellationInput(fixture, provider, orderId!, "accept", 1, "race-accept"),
          settlement
        )
      ]);
      const persisted = await rootClient.bookingOrder.findUniqueOrThrow({ where: { id: orderId } });
      const cancellation = await rootClient.exchangeBookingCancellation.findFirstOrThrow({
        where: { bookingOrderId: orderId }
      });
      const slot = await rootClient.scheduleSlot.findUniqueOrThrow({
        where: { id: fixture.participantSlotIds[0] }
      });
      const wallet = await rootClient.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } });
      if (cancelled.outcome === "created") {
        expect(persisted.status).toBe("CANCELLED");
        expect(persisted.paymentConfirmedAt).toBeNull();
        expect(cancellation.status).toBe("ACCEPTED");
        expect(slot.bookedCount).toBe(0);
        expect(wallet).toMatchObject({ availableBalance: 99_500, frozenBalance: 0 });
        if (transition !== "confirm") expect(changed.outcome).not.toBe("ok");
        expect((await mutate()).outcome).not.toBe("ok");
      } else {
        expect(transition).not.toBe("confirm");
        expect(changed.outcome).toBe("ok");
        expect(cancelled).toEqual({ outcome: "invalid_state" });
        expect(cancellation).toMatchObject({ status: "PENDING", version: 1 });
        expect(slot.bookedCount).toBe(1);
        expect(wallet).toMatchObject({ availableBalance: 99_200, frozenBalance: 800 });
        if (transition === "start") expect(persisted.status).toBe("IN_SERVICE");
        else expect(persisted.paymentStatus).toBe("CONFIRMED");
        await expect(
          repository.command(
            cancellationInput(fixture, provider, orderId!, "accept", 1, "persisted-recheck"),
            settlement
          )
        ).resolves.toEqual({ outcome: "invalid_state" });
      }
      await rootClient.platformFeeRuleSet.update({
        where: { id: fixture.feeRuleSetId },
        data: { status: "draft" }
      });
    }
  );

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
      expect([resultA.outcome, resultB.outcome].sort()).toEqual(["created", "version_conflict"]);
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
      await expect(
        rootClient.exchangeBookingCancellation.count({
          where: { bookingOrderId: orderId, status: "PENDING", activeOrderId: orderId }
        })
      ).resolves.toBe(1);
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
      await expect(
        repository.command(
          cancellationInput(fixture, customer, orderId!, "request", 0, "rollback-request"),
          noSettlement
        )
      ).resolves.toMatchObject({ outcome: "created" });

      const settlementFailure = new Error("guarded settlement failure");
      const walletBefore = await rootClient.wallet.findUniqueOrThrow({
        where: { id: fixture.walletId }
      });
      const holdBefore = await rootClient.walletHold.findUniqueOrThrow({
        where: { id: fixture.walletHoldId }
      });
      const financeBefore = await financeEvidence(rootClient, fixture);
      const ledger = new LedgerService(
        new LedgerRepository(rootClient),
        undefined,
        undefined,
        () => fixture!.now
      );
      await expect(
        repository.command(
          cancellationInput(fixture, provider, orderId!, "accept", 1, "rollback-accept"),
          {
            capturePublicationFee: async (input) => {
              await ledger.captureExchangeRequestPublication(
                { exchangePostId: input.exchangePostId, actorUserId: input.actorUserId },
                { transactionClient: input.transactionClient }
              );
              // Verify real payer debit, platform credit and reconciliation exist inside the
              // doomed transaction before injecting failure, then prove all are rolled back.
              expectPublicationConservation(
                financeBefore,
                await financeEvidence(input.transactionClient as Prisma.TransactionClient, fixture!)
              );
              throw settlementFailure;
            },
            releaseBookingHold: async () => undefined
          }
        )
      ).rejects.toBe(settlementFailure);
      expect(await financeEvidence(rootClient, fixture)).toEqual(financeBefore);
      await expect(
        rootClient.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } })
      ).resolves.toEqual(walletBefore);
      await expect(
        rootClient.ledgerTransaction.count({
          where: {
            referenceType: "exchange_request",
            referenceId: fixture.exchangePostId,
            type: "EXCHANGE_REQUEST_PUBLICATION_CAPTURE"
          }
        })
      ).resolves.toBe(0);
      await expect(
        rootClient.walletHold.findUniqueOrThrow({ where: { id: fixture.walletHoldId } })
      ).resolves.toEqual(holdBefore);

      await expect(
        rootClient.bookingOrder.findUniqueOrThrow({ where: { id: orderId } })
      ).resolves.toMatchObject({ status: "PENDING" });
      await expect(
        rootClient.scheduleSlot.findUniqueOrThrow({
          where: { id: fixture.participantSlotIds[0] }
        })
      ).resolves.toMatchObject({ bookedCount: 1, status: "BOOKED" });
      await expect(
        rootClient.exchangeBookingCancellation.findFirstOrThrow({
          where: { bookingOrderId: orderId, deletedAt: null }
        })
      ).resolves.toMatchObject({ status: "PENDING", version: 1 });
      await expect(
        rootClient.exchangeBookingCancellationEvent.count({
          where: { bookingOrderId: orderId }
        })
      ).resolves.toBe(1);
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
      await rootClient.$transaction(
        async (transaction) => {
          const fixture = await createExchangeBookingFixture(transaction, marker);
          const orderIds = await convertFixture(transaction, fixture);
          const customer = customerActor(fixture);
          const providers = await Promise.all([
            providerActor(transaction, fixture, 0),
            providerActor(transaction, fixture, 1)
          ]);
          const repository = new ExchangeCancellationRepository(transaction, () => fixture.now);
          const ledger = new LedgerService(
            new LedgerRepository(transaction),
            undefined,
            undefined,
            () => fixture.now
          );
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
            conservation: await financeEvidence(transaction, fixture),
            wallet: await transaction.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } }),
            hold: await transaction.walletHold.findUniqueOrThrow({
              where: { id: fixture.walletHoldId }
            }),
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
            cancellationInput(
              fixture,
              customer,
              orderIds[0]!,
              "request",
              4,
              "accept-first-request"
            ),
            settlement
          );
          await expect(
            repository.command(
              cancellationInput(fixture, providers[0]!, orderIds[0]!, "accept", 5, "accept-first"),
              settlement
            )
          ).resolves.toMatchObject({ outcome: "created", payload: { orderStatus: "cancelled" } });
          await expect(
            transaction.bookingOrder.findUniqueOrThrow({ where: { id: orderIds[1] } })
          ).resolves.toMatchObject({ status: "PENDING" });

          await repository.command(
            cancellationInput(
              fixture,
              providers[1]!,
              orderIds[1]!,
              "request",
              0,
              "accept-second-request"
            ),
            settlement
          );
          await expect(
            repository.command(
              cancellationInput(fixture, customer, orderIds[1]!, "accept", 1, "accept-second"),
              settlement
            )
          ).resolves.toMatchObject({ outcome: "created", payload: { orderStatus: "cancelled" } });

          const captureCount = await transaction.ledgerTransaction.count({
            where: {
              type: "EXCHANGE_REQUEST_PUBLICATION_CAPTURE",
              referenceType: "exchange_request",
              referenceId: fixture.exchangePostId,
              deletedAt: null
            }
          });
          expect(captureCount).toBe(1);
          expectPublicationConservation(
            before.conservation,
            await financeEvidence(transaction, fixture)
          );
          await expect(
            transaction.exchangeRequestFinancial.findUniqueOrThrow({
              where: { id: fixture.requestFinancialId }
            })
          ).resolves.toMatchObject({ state: "CAPTURED" });
          await expect(
            transaction.walletHold.findUniqueOrThrow({
              where: { id: fixture.walletHoldId }
            })
          ).resolves.toMatchObject({ status: "captured", capturedAmountNdp: 500 });
          await expect(
            transaction.bookingOrder.findMany({
              where: { id: { in: orderIds } },
              orderBy: { id: "asc" }
            })
          ).resolves.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ status: "CANCELLED" }),
              expect.objectContaining({ status: "CANCELLED" })
            ])
          );
          await expect(
            transaction.scheduleSlot.findMany({
              where: { id: { in: fixture.participantSlotIds } }
            })
          ).resolves.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ bookedCount: 0, status: "AVAILABLE" }),
              expect.objectContaining({ bookedCount: 0, status: "AVAILABLE" })
            ])
          );
          report = { orderCount: orderIds.length, captureCount };
          throw new RollbackVerifiedExchangeCancellation();
        },
        { maxWait: 10_000, timeout: 60_000 }
      );
    } catch (error) {
      if (!(error instanceof RollbackVerifiedExchangeCancellation)) throw error;
    }

    expect(report).toEqual({ orderCount: 2, captureCount: 1 });
    expect(await countExchangeBookingMarkerRows(rootClient, marker)).toBe(0);
  });

  it("releases a confirmed Request booking hold while retaining the captured Demand publication fee", async () => {
    const marker = `exchange-cancellation-confirmed-${Date.now()}`;
    let report: {
      availableBalance: number;
      frozenBalance: number;
      publicationCaptureCount: number;
      bookingReleaseCount: number;
    } | null = null;
    try {
      await rootClient.$transaction(
        async (transaction) => {
          const fixture = await createExchangeBookingFixture(transaction, marker);
          const [orderId] = await convertFixture(transaction, fixture);
          const customer = customerActor(fixture);
          const provider = await providerActor(transaction, fixture, 0);
          await transaction.platformFeeRuleSet.update({
            where: { id: fixture.feeRuleSetId },
            data: { status: "active" }
          });
          await transaction.platformFeeRule.create({
            data: {
              ruleSetId: fixture.feeRuleSetId,
              feeType: "c_request_dispatch_fee",
              orderType: "request",
              payerType: "user",
              baseAmountNdp: 300,
              status: "active"
            }
          });
          await transaction.bookingOrder.update({
            where: { id: orderId },
            data: { status: "CONFIRMED" }
          });

          const ledger = new LedgerService(
            new LedgerRepository(transaction),
            new FeeCalculationService(new FeeRuleRepository(transaction)),
            undefined,
            () => fixture.now
          );
          const order = await transaction.bookingOrder.findUniqueOrThrow({
            where: { id: orderId }
          });
          await ledger.freezeBookingAcceptance(
            {
              bookingOrderId: order.id,
              orderType: "request",
              shopId: order.shopId,
              technicianProfileId: order.technicianProfileId,
              serviceId: order.serviceId,
              serviceAmountJpy: Number(order.priceAmount),
              scheduledStartAt: order.startsAt,
              acceptedAt: fixture.now,
              customerUserId: order.customerUserId,
              actorUserId: provider.actorUserId
            },
            { transactionClient: transaction }
          );
          await expect(
            transaction.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } })
          ).resolves.toMatchObject({ availableBalance: 99_200, frozenBalance: 800 });
          const beforeCancellation = await financeEvidence(transaction, fixture);

          const settlement: ExchangeCancellationSettlementOptions = {
            capturePublicationFee: async (input) => {
              await ledger.captureExchangeRequestPublication(
                { exchangePostId: input.exchangePostId, actorUserId: input.actorUserId },
                { transactionClient: input.transactionClient }
              );
            },
            releaseBookingHold: async (input) => {
              await ledger.releaseBookingHold(
                { ...input, orderType: "request" },
                { transactionClient: input.transactionClient }
              );
            }
          };
          const repository = new ExchangeCancellationRepository(transaction, () => fixture.now);
          await repository.command(
            cancellationInput(fixture, customer, orderId!, "request", 0, "confirmed-request"),
            settlement
          );
          await expect(
            repository.command(
              cancellationInput(fixture, provider, orderId!, "accept", 1, "confirmed-accept"),
              settlement
            )
          ).resolves.toMatchObject({ outcome: "created", payload: { orderStatus: "cancelled" } });

          const [
            wallet,
            bookingHold,
            orderFinancial,
            publicationCaptureCount,
            bookingReleaseCount
          ] = await Promise.all([
            transaction.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } }),
            transaction.walletHold.findFirstOrThrow({
              where: { bookingOrderId: orderId, feeType: "c_request_dispatch_fee" }
            }),
            transaction.orderFinancial.findUniqueOrThrow({ where: { bookingOrderId: orderId } }),
            transaction.ledgerTransaction.count({
              where: {
                type: "EXCHANGE_REQUEST_PUBLICATION_CAPTURE",
                referenceType: "exchange_request",
                referenceId: fixture.exchangePostId,
                deletedAt: null
              }
            }),
            transaction.ledgerTransaction.count({
              where: {
                type: "BOOKING_CANCEL_UNFREEZE",
                referenceType: "booking_order",
                referenceId: orderId,
                deletedAt: null
              }
            })
          ]);
          expect(wallet).toMatchObject({ availableBalance: 99_500, frozenBalance: 0 });
          expect(bookingHold).toMatchObject({
            status: "released",
            holdAmountNdp: 300,
            releasedAmountNdp: 300
          });
          expect(orderFinancial).toMatchObject({
            orderType: "request",
            cRequestFeeHoldNdp: 300,
            releasedNdp: 300,
            settlementStatus: "cancelled"
          });
          expect(publicationCaptureCount).toBe(1);
          expect(bookingReleaseCount).toBe(1);
          const afterCancellation = await financeEvidence(transaction, fixture);
          expectPublicationConservation(beforeCancellation, afterCancellation);
          const release = afterCancellation.transactions.filter(
            (row) => row.type === "BOOKING_CANCEL_UNFREEZE"
          );
          expect(release).toHaveLength(1);
          expect(release[0]).toMatchObject({
            amount: 300,
            currency: "TEST_NDP",
            reconciliation: null
          });
          expect(release[0]!.entries).toEqual([
            expect.objectContaining({
              walletId: wallet.id,
              direction: "UNFREEZE",
              amount: 300,
              availableDelta: 300,
              frozenDelta: -300
            })
          ]);
          // Formal booking TEST_NDP mutations have no FinanceReconciliation; publication
          // capture has its dedicated TEST_ONLY record. Neither can enter NDP reconciliation.
          expect(
            afterCancellation.transactions.flatMap((row) =>
              row.reconciliation ? [row.reconciliation] : []
            )
          ).toEqual([
            expect.objectContaining({
              currency: "TEST_NDP",
              status: "TEST_ONLY",
              differenceAmount: 0
            })
          ]);
          report = {
            availableBalance: wallet.availableBalance,
            frozenBalance: wallet.frozenBalance,
            publicationCaptureCount,
            bookingReleaseCount
          };
          throw new RollbackVerifiedExchangeCancellation();
        },
        { maxWait: 10_000, timeout: 60_000 }
      );
    } catch (error) {
      if (!(error instanceof RollbackVerifiedExchangeCancellation)) throw error;
    }

    expect(report).toEqual({
      availableBalance: 99_500,
      frozenBalance: 0,
      publicationCaptureCount: 1,
      bookingReleaseCount: 1
    });
    expect(await countExchangeBookingMarkerRows(rootClient, marker)).toBe(0);
  });
});
