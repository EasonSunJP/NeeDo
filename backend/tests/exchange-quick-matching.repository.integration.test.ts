import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import {
  assertRepositoryMigrationsApplied,
  cleanupQuickMatchingFixture,
  countQuickMatchingMarkerRows,
  createQuickMatchingFixture,
  createQuickMatchingServices,
  ownerAccess,
  providerAccess,
  type QuickMatchingFixture
} from "../scripts/check-exchange-quick-matching-flow";
import { requireSafeExchangeClaimFlowEnvironment } from "../scripts/support/exchange-claim-flow-safety";

const enabled =
  process.env.RUN_EXCHANGE_QUICK_MATCHING_INTEGRATION === "true" &&
  process.env.ALLOW_EXCHANGE_QUICK_MATCHING_DEV_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;

jest.setTimeout(120_000);

function startGate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

describeIntegration("Exchange Quick matching guarded concurrency", () => {
  let rootClient: PrismaClient;
  let clientA: PrismaClient;
  let clientB: PrismaClient;

  beforeAll(async () => {
    const target = requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
    expect(target.databaseName).toMatch(/(?:^|[_-])(?:dev|test)(?:$|[_-])/iu);
    process.env.ENV_FILE = target.envFile;
    const { createPrismaClient } = await import("../src/prisma/client");
    rootClient = createPrismaClient();
    clientA = createPrismaClient();
    clientB = createPrismaClient();
    await assertRepositoryMigrationsApplied(rootClient);
  });

  afterAll(async () => {
    await Promise.all(
      [rootClient, clientA, clientB].filter(Boolean).map((client) => client.$disconnect())
    );
  });

  it("atomically matches the final two concurrent provider claims exactly once", async () => {
    const marker = `exchange-quick-claim-race-${Date.now()}`;
    let fixture: QuickMatchingFixture | null = null;

    try {
      fixture = await rootClient.$transaction(
        (transaction) => createQuickMatchingFixture(transaction, marker, 25_000),
        { maxWait: 10_000, timeout: 30_000 }
      );
      const [servicesA, servicesB] = await Promise.all([
        createQuickMatchingServices(clientA, fixture),
        createQuickMatchingServices(clientB, fixture)
      ]);
      const gate = startGate();
      const context = { ip: "127.0.0.1", userAgent: marker };
      const commands = [
        gate.wait.then(() =>
          servicesA.claim.createClaim(
            providerAccess(fixture!, 0),
            fixture!.exchangePostId,
            {
              scheduleSlotId: fixture!.participantSlotIds[0]!,
              quoteAmountJpy: 11_000,
              message: "race-one"
            },
            `${marker}:claim:one`,
            context
          )
        ),
        gate.wait.then(() =>
          servicesB.claim.createClaim(
            providerAccess(fixture!, 1),
            fixture!.exchangePostId,
            {
              scheduleSlotId: fixture!.participantSlotIds[1]!,
              quoteAmountJpy: 12_000,
              message: "race-two"
            },
            `${marker}:claim:two`,
            context
          )
        )
      ];
      gate.release();
      const outcomes = await Promise.allSettled(commands);
      expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);

      const [matching, claims, participants, quickEvents] = await Promise.all([
        rootClient.exchangeRequestMatching.findUniqueOrThrow({
          where: { id: fixture.matchingId }
        }),
        rootClient.exchangeClaim.findMany({
          where: { exchangePostId: fixture.exchangePostId, deletedAt: null }
        }),
        rootClient.exchangeMatchParticipant.findMany({
          where: { exchangePostId: fixture.exchangePostId, deletedAt: null }
        }),
        rootClient.exchangeMatchEvent.findMany({
          where: { matchingId: fixture.matchingId, type: "QUICK_MATCHED", deletedAt: null }
        })
      ]);
      expect(matching).toMatchObject({ status: "MATCHED", selectedQuoteTotalJpy: 23_000 });
      expect(claims).toHaveLength(2);
      expect(claims.every((claim) => claim.status === "MATCHED")).toBe(true);
      expect(participants).toHaveLength(2);
      expect(quickEvents).toHaveLength(1);
    } finally {
      if (fixture) {
        await cleanupQuickMatchingFixture(rootClient, fixture);
        expect(await countQuickMatchingMarkerRows(rootClient, marker)).toBe(0);
      }
    }
  });

  it("has one terminal winner when exact owner confirmation races, then replays identically", async () => {
    const marker = `exchange-quick-confirm-race-${Date.now()}`;
    let fixture: QuickMatchingFixture | null = null;

    try {
      fixture = await rootClient.$transaction(
        (transaction) => createQuickMatchingFixture(transaction, marker, 30_000),
        { maxWait: 10_000, timeout: 30_000 }
      );
      const rootServices = await createQuickMatchingServices(rootClient, fixture);
      const context = { ip: "127.0.0.1", userAgent: marker };
      await rootServices.claim.createClaim(
        providerAccess(fixture, 0),
        fixture.exchangePostId,
        { scheduleSlotId: fixture.participantSlotIds[0]!, quoteAmountJpy: 16_000, message: null },
        `${marker}:claim:one`,
        context
      );
      await rootServices.claim.createClaim(
        providerAccess(fixture, 1),
        fixture.exchangePostId,
        { scheduleSlotId: fixture.participantSlotIds[1]!, quoteAmountJpy: 16_000, message: null },
        `${marker}:claim:two`,
        context
      );
      const open = await rootServices.matching.getMatching(
        ownerAccess(fixture),
        fixture.exchangePostId
      );
      expect(open.quickBudgetDecision?.requiredBudgetMaxJpy).toBe(32_000);

      const [servicesA, servicesB] = await Promise.all([
        createQuickMatchingServices(clientA, fixture),
        createQuickMatchingServices(clientB, fixture)
      ]);
      const input = {
        expectedVersion: open.version,
        budgetConfirmation: {
          action: "increase_to_selected_total" as const,
          confirmedBudgetMaxJpy: 32_000
        }
      };
      const idempotencyKey = `${marker}:confirm`;
      const gate = startGate();
      const commands = [servicesA, servicesB].map((services) =>
        gate.wait.then(() =>
          services.matching.confirmQuickBudget(
            ownerAccess(fixture!),
            fixture!.exchangePostId,
            input,
            idempotencyKey,
            context
          )
        )
      );
      gate.release();
      const outcomes = await Promise.allSettled(commands);
      const fulfilled = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<Awaited<(typeof commands)[number]>> =>
          outcome.status === "fulfilled"
      );
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      const replay = await servicesA.matching.confirmQuickBudget(
        ownerAccess(fixture),
        fixture.exchangePostId,
        input,
        idempotencyKey,
        context
      );
      expect(replay).toEqual(fulfilled[0]!.value);
      const [budgetEvents, quickEvents, audits] = await Promise.all([
        rootClient.exchangeMatchEvent.count({
          where: { matchingId: fixture.matchingId, type: "BUDGET_INCREASED", deletedAt: null }
        }),
        rootClient.exchangeMatchEvent.count({
          where: { matchingId: fixture.matchingId, type: "QUICK_MATCHED", deletedAt: null }
        }),
        rootClient.auditLog.count({
          where: {
            action: "exchange.matching.quick.confirm_budget",
            targetType: "exchange_request_matching",
            targetId: fixture.matchingId
          }
        })
      ]);
      expect({ budgetEvents, quickEvents, audits }).toEqual({
        budgetEvents: 1,
        quickEvents: 1,
        audits: 1
      });
    } finally {
      if (fixture) {
        await cleanupQuickMatchingFixture(rootClient, fixture);
        expect(await countQuickMatchingMarkerRows(rootClient, marker)).toBe(0);
      }
    }
  });
});
