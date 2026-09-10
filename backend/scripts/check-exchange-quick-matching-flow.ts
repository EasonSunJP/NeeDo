import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  cleanupExchangeBookingFixture,
  countExchangeBookingMarkerRows,
  createExchangeBookingFixture,
  type ExchangeBookingFixture
} from "./check-exchange-booking-conversion-flow";
import { requireSafeExchangeClaimFlowEnvironment } from "./support/exchange-claim-flow-safety";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function expectErrorMessage(
  operation: () => Promise<unknown>,
  expected: string
): Promise<void> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error && caught.message === expected, `expected ${expected}`);
}

export type QuickMatchingFixture = ExchangeBookingFixture & {
  providerEmails: string[];
  providerPublicIds: string[];
  shopName: string;
  serviceName: string;
};

type QuickMatchingPrismaClient = PrismaClient | Prisma.TransactionClient;

export async function assertRepositoryMigrationsApplied(
  client: PrismaClient,
  migrationsDirectory = join(process.cwd(), "prisma", "migrations")
): Promise<void> {
  const repositoryMigrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(migrationsDirectory, entry.name, "migration.sql"))
    )
    .map((entry) => entry.name)
    .sort();
  const appliedRows = await client.$queryRawUnsafe<Array<{ migrationName: string }>>(
    "SELECT migration_name AS migrationName FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"
  );
  const applied = new Set(appliedRows.map((row) => row.migrationName));
  const missing = repositoryMigrations.filter((migration) => !applied.has(migration));
  assert(
    missing.length === 0,
    `Exchange Quick matching checker requires all repository migrations: ${missing.join(", ")}`
  );
}

export async function createQuickMatchingFixture(
  client: QuickMatchingPrismaClient,
  marker: string,
  effectiveBudgetMaxJpy: number,
  now = new Date()
): Promise<QuickMatchingFixture> {
  const base = await createExchangeBookingFixture(client, marker, now);

  await client.exchangeMatchEvent.deleteMany({ where: { matchingId: base.matchingId } });
  await client.exchangeMatchParticipant.deleteMany({
    where: { exchangePostId: base.exchangePostId }
  });
  await client.exchangeClaim.deleteMany({ where: { exchangePostId: base.exchangePostId } });
  await client.bookingOrder.deleteMany({ where: { id: base.oldOrderId } });
  await client.scheduleSlot.deleteMany({ where: { id: base.oldSlotId } });
  await client.exchangePost.update({
    where: { id: base.exchangePostId },
    data: { status: "PUBLISHED" }
  });
  await client.exchangeDemand.update({
    where: { postId: base.exchangePostId },
    data: {
      matchMode: "QUICK",
      targetProviderCount: 2,
      membershipLevelSnapshot: "standard",
      budgetMinJpy: 10_000,
      budgetMaxJpy: effectiveBudgetMaxJpy
    }
  });
  await client.exchangeRequestMatching.update({
    where: { id: base.matchingId },
    data: {
      status: "OPEN",
      effectiveTargetProviderCount: 2,
      effectiveBudgetMaxJpy,
      selectedQuoteTotalJpy: 0,
      version: 1,
      matchedAt: null
    }
  });
  await client.exchangeMatchEvent.create({
    data: {
      matchingId: base.matchingId,
      sequence: 1,
      type: "OPENED",
      actorUserId: base.ownerUserId,
      actorIdentityId: base.ownerIdentityId,
      versionBefore: 0,
      versionAfter: 1,
      payload: { exchangePostId: base.exchangePostId, marker },
      createdAt: now
    }
  });

  const numberPart = String(Number.parseInt(randomUUID().slice(0, 8), 16)).padStart(10, "0");
  const thirdUser = await client.user.create({
    data: {
      needoId: `needo${numberPart}`,
      email: `${marker}-provider-three@needo.test`,
      username: `${marker} provider three`,
      emailVerifiedAt: now,
      isTestAccount: true
    }
  });
  const thirdTechnician = await client.technicianProfile.create({
    data: {
      userId: thirdUser.id,
      shopId: base.shopId,
      displayName: `${marker} technician three`,
      city: "Tokyo",
      status: "published"
    }
  });
  const thirdIdentity = await client.userIdentity.create({
    data: {
      userId: thirdUser.id,
      type: "technician",
      displayName: `${marker} provider three`,
      scopeType: "technician_profile",
      scopeId: thirdTechnician.id,
      activeKey: `${marker}:identity:third`
    }
  });
  const thirdPublicIdentifier = await client.publicIdentifier.create({
    data: {
      publicId: `s${numberPart}`,
      numberPart,
      kind: "S",
      userIdentityId: thirdIdentity.id,
      status: "ACTIVE"
    }
  });
  const thirdAffiliation = await client.technicianShopAffiliation.create({
    data: {
      technicianProfileId: thirdTechnician.id,
      shopId: base.shopId,
      relationshipType: "EXCLUSIVE",
      workStatus: "ACTIVE",
      startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      activeKey: `${marker}:affiliation:third`
    }
  });
  const thirdSlot = await client.scheduleSlot.create({
    data: {
      serviceId: base.serviceId,
      shopId: base.shopId,
      technicianProfileId: thirdTechnician.id,
      startsAt: base.startsAt,
      endsAt: base.endsAt,
      capacity: 1,
      bookedCount: 0,
      status: "AVAILABLE"
    }
  });

  const providerUserIds = [...base.providerUserIds, thirdUser.id];
  const providerIdentityIds = [...base.providerIdentityIds, thirdIdentity.id];
  const [users, identifiers, shop, service] = await Promise.all([
    client.user.findMany({
      where: { id: { in: providerUserIds } },
      select: { id: true, email: true }
    }),
    client.publicIdentifier.findMany({
      where: { userIdentityId: { in: providerIdentityIds } },
      select: { userIdentityId: true, publicId: true }
    }),
    client.shop.findUniqueOrThrow({ where: { id: base.shopId }, select: { name: true } }),
    client.service.findUniqueOrThrow({
      where: { id: base.serviceId },
      select: { name: true }
    })
  ]);
  const emailByUserId = new Map(users.map((user) => [user.id, user.email]));
  const publicIdByIdentityId = new Map(
    identifiers.map((identifier) => [identifier.userIdentityId, identifier.publicId])
  );

  return {
    ...base,
    providerUserIds,
    providerIdentityIds,
    providerEmails: providerUserIds.map((userId) => String(emailByUserId.get(userId))),
    providerPublicIds: providerIdentityIds.map((identityId) =>
      String(publicIdByIdentityId.get(identityId))
    ),
    publicIdentifierIds: [...base.publicIdentifierIds, thirdPublicIdentifier.id],
    technicianProfileIds: [...base.technicianProfileIds, thirdTechnician.id],
    affiliationIds: [...base.affiliationIds, thirdAffiliation.id],
    participantSlotIds: [...base.participantSlotIds, thirdSlot.id],
    claimIds: [],
    participantIds: [],
    shopName: shop.name,
    serviceName: service.name
  };
}

export async function createQuickMatchingServices(
  client: QuickMatchingPrismaClient,
  fixture: QuickMatchingFixture
) {
  const [
    claimRepositoryModule,
    matchingRepositoryModule,
    postRepositoryModule,
    claimServiceModule,
    matchingServiceModule
  ] = await Promise.all([
    import("../src/repositories/exchange-claim.repository"),
    import("../src/repositories/exchange-matching.repository"),
    import("../src/repositories/exchange.repository"),
    import("../src/services/exchange-claim.service"),
    import("../src/services/exchange-matching.service")
  ]);
  const postRepository = new postRepositoryModule.ExchangePostRepository(client);
  return {
    claim: new claimServiceModule.ExchangeClaimService(
      new claimRepositoryModule.ExchangeClaimRepository(client),
      postRepository,
      () => fixture.now
    ),
    matching: new matchingServiceModule.ExchangeMatchingService(
      new matchingRepositoryModule.ExchangeMatchingRepository(client),
      () => fixture.now
    ),
    postRepository
  };
}

export function ownerAccess(fixture: QuickMatchingFixture): AuthenticatedAccessContext {
  return {
    userId: fixture.ownerUserId,
    email: fixture.ownerEmail,
    accessTokenJti: `${fixture.marker}:owner`,
    accessTokenExpiresAt: Date.now() + 60_000,
    currentIdentityId: fixture.ownerIdentityId,
    currentPublicId: fixture.ownerPublicId,
    currentIdentityType: "customer",
    currentIdentityScopeType: null,
    currentIdentityScopeId: null,
    roles: ["customer"],
    permissions: []
  };
}

export function providerAccess(
  fixture: QuickMatchingFixture,
  index: number
): AuthenticatedAccessContext {
  const userId = fixture.providerUserIds[index];
  const identityId = fixture.providerIdentityIds[index];
  const technicianProfileId = fixture.technicianProfileIds[index];
  assert(userId && identityId && technicianProfileId, `provider ${index} fixture is missing`);
  return {
    userId,
    email: fixture.providerEmails[index]!,
    accessTokenJti: `${fixture.marker}:provider:${index}`,
    accessTokenExpiresAt: Date.now() + 60_000,
    currentIdentityId: identityId,
    currentPublicId: fixture.providerPublicIds[index]!,
    currentIdentityType: "technician",
    currentIdentityScopeType: "technician_profile",
    currentIdentityScopeId: technicianProfileId,
    roles: ["technician"],
    permissions: []
  };
}

export async function cleanupQuickMatchingFixture(
  client: QuickMatchingPrismaClient,
  fixture: QuickMatchingFixture
): Promise<void> {
  const [claims, participants, audits] = await Promise.all([
    client.exchangeClaim.findMany({
      where: { exchangePostId: fixture.exchangePostId },
      select: { id: true }
    }),
    client.exchangeMatchParticipant.findMany({
      where: { exchangePostId: fixture.exchangePostId },
      select: { id: true }
    }),
    client.auditLog.findMany({
      where: {
        OR: [
          { userAgent: fixture.marker },
          {
            targetType: "exchange_request_matching",
            targetId: fixture.matchingId
          }
        ]
      },
      select: { id: true }
    })
  ]);
  const auditIds = audits.map(({ id }) => id);
  if (auditIds.length > 0) {
    await client.auditLog.deleteMany({ where: { id: { in: auditIds } } });
  }
  await cleanupExchangeBookingFixture(client, {
    ...fixture,
    claimIds: claims.map(({ id }) => id),
    participantIds: participants.map(({ id }) => id)
  });
}

export async function countQuickMatchingMarkerRows(
  client: QuickMatchingPrismaClient,
  marker: string
): Promise<number> {
  return countExchangeBookingMarkerRows(client, marker);
}

async function captureProtectedState(
  client: QuickMatchingPrismaClient,
  fixture: QuickMatchingFixture
) {
  const bookingCount = await client.bookingOrder.count({
    where: { scheduleSlotId: { in: fixture.participantSlotIds } }
  });
  return {
    wallet: await client.wallet.findUnique({ where: { id: fixture.walletId } }),
    hold: await client.walletHold.findUnique({ where: { id: fixture.walletHoldId } }),
    requestFinancial: await client.exchangeRequestFinancial.findUnique({
      where: { id: fixture.requestFinancialId }
    }),
    slots: await client.scheduleSlot.findMany({
      where: { id: { in: fixture.participantSlotIds } },
      orderBy: { id: "asc" },
      select: { id: true, bookedCount: true, status: true }
    }),
    bookingCount,
    orderFinancialCount:
      bookingCount === 0
        ? 0
        : await client.orderFinancial.count({
            where: {
              bookingOrder: { scheduleSlotId: { in: fixture.participantSlotIds } }
            }
          }),
    ledgerCount: await client.ledgerTransaction.count({
      where: { referenceType: "exchange_request_publication", referenceId: fixture.exchangePostId }
    }),
    reconciliationCount: await client.financeReconciliation.count({
      where: { referenceType: "exchange_request_publication", referenceId: fixture.exchangePostId }
    })
  };
}

class RollbackVerifiedExchangeQuickMatching extends Error {}

async function main(): Promise<void> {
  const target = requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
  process.env.ENV_FILE = target.envFile;
  console.log(
    JSON.stringify({ databaseTarget: target.maskedDatabaseTarget, safety: "local-only" })
  );
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const markerRoot = `exchange-quick-flow-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const markers = [`${markerRoot}-below`, `${markerRoot}-over`, `${markerRoot}-capacity`];
  let report: Record<string, unknown> | null = null;

  try {
    await assertRepositoryMigrationsApplied(prisma);
    const physicalTables = await prisma.$queryRawUnsafe<Array<{ tableName: string }>>(
      "SELECT TABLE_NAME AS tableName FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('exchange_request_matchings','exchange_match_participants','exchange_match_events')"
    );
    assert(physicalTables.length === 3, "Quick matching tables are not physically applied");

    let thirdClaimRejected = false;
    try {
      await prisma.$transaction(
        async (transaction) => {
          const capacity = await createQuickMatchingFixture(transaction, markers[2]!, 30_000);
          const services = await createQuickMatchingServices(transaction, capacity);
          const context = { ip: "127.0.0.1", userAgent: capacity.marker };
          await services.claim.createClaim(
            providerAccess(capacity, 0),
            capacity.exchangePostId,
            {
              scheduleSlotId: capacity.participantSlotIds[0]!,
              quoteAmountJpy: 16_000,
              message: null
            },
            `${capacity.marker}:claim:one`,
            context
          );
          await services.claim.createClaim(
            providerAccess(capacity, 1),
            capacity.exchangePostId,
            {
              scheduleSlotId: capacity.participantSlotIds[1]!,
              quoteAmountJpy: 16_000,
              message: null
            },
            `${capacity.marker}:claim:two`,
            context
          );
          await services.claim.createClaim(
            providerAccess(capacity, 2),
            capacity.exchangePostId,
            {
              scheduleSlotId: capacity.participantSlotIds[2]!,
              quoteAmountJpy: 10_000,
              message: null
            },
            `${capacity.marker}:claim:three`,
            context
          );
        },
        { maxWait: 10_000, timeout: 45_000 }
      );
    } catch (error) {
      thirdClaimRejected =
        error instanceof Error && error.message === "error.exchange.claim_invalid_state";
    }
    assert(thirdClaimRejected, "third Quick claim was not rejected at target capacity");
    assert(
      (await countQuickMatchingMarkerRows(prisma, markers[2]!)) === 0,
      "rejected third-claim transaction left marker rows"
    );

    try {
      await prisma.$transaction(
        async (transaction) => {
          const context = (marker: string) => ({ ip: "127.0.0.1", userAgent: marker });
          const below = await createQuickMatchingFixture(transaction, markers[0]!, 25_000);
          const belowServices = await createQuickMatchingServices(transaction, below);
          const belowBefore = await captureProtectedState(transaction, below);
          const firstInput = {
            scheduleSlotId: below.participantSlotIds[0]!,
            quoteAmountJpy: 11_000,
            message: "Persisted provider message"
          };
          const firstClaim = await belowServices.claim.createClaim(
            providerAccess(below, 0),
            below.exchangePostId,
            firstInput,
            `${below.marker}:claim:one`,
            context(below.marker)
          );
          assert(
            firstClaim.status === "active" &&
              firstClaim.shop.name === below.shopName &&
              firstClaim.service.name === below.serviceName &&
              firstClaim.technician.publicId === below.providerPublicIds[0] &&
              firstClaim.scheduleSlotId === below.participantSlotIds[0] &&
              firstClaim.quoteAmountJpy === 11_000,
            "first Quick claim card snapshot is incorrect"
          );
          const replay = await belowServices.claim.createClaim(
            providerAccess(below, 0),
            below.exchangePostId,
            firstInput,
            `${below.marker}:claim:one`,
            context(below.marker)
          );
          const idempotentReplay = sameValue(firstClaim, replay);
          assert(idempotentReplay, "Quick claim idempotent replay changed the response");
          await expectErrorMessage(
            () =>
              belowServices.claim.createClaim(
                providerAccess(below, 0),
                below.exchangePostId,
                { ...firstInput, quoteAmountJpy: 12_000 },
                `${below.marker}:claim:one`,
                context(below.marker)
              ),
            "error.exchange.claim_idempotency_conflict"
          );
          const idempotencyConflictRejected = true;
          const secondClaim = await belowServices.claim.createClaim(
            providerAccess(below, 1),
            below.exchangePostId,
            {
              scheduleSlotId: below.participantSlotIds[1]!,
              quoteAmountJpy: 12_000,
              message: null
            },
            `${below.marker}:claim:two`,
            context(below.marker)
          );
          const [belowMatching, belowClaims, belowParticipants, belowQuickEvents] =
            await Promise.all([
              transaction.exchangeRequestMatching.findUniqueOrThrow({
                where: { id: below.matchingId }
              }),
              transaction.exchangeClaim.findMany({
                where: { exchangePostId: below.exchangePostId, deletedAt: null }
              }),
              transaction.exchangeMatchParticipant.findMany({
                where: { exchangePostId: below.exchangePostId, deletedAt: null }
              }),
              transaction.exchangeMatchEvent.count({
                where: {
                  matchingId: below.matchingId,
                  type: "QUICK_MATCHED",
                  deletedAt: null
                }
              })
            ]);
          const belowBudgetAutoMatched =
            secondClaim.status === "matched" &&
            belowMatching.status === "MATCHED" &&
            belowMatching.selectedQuoteTotalJpy === 23_000 &&
            belowClaims.length === 2 &&
            belowClaims.every((claim) => claim.status === "MATCHED") &&
            belowParticipants.length === 2;
          assert(belowBudgetAutoMatched, "within-budget Quick claims did not auto-match");
          const quickMatchEventExactlyOnce = belowQuickEvents === 1;
          assert(quickMatchEventExactlyOnce, "automatic QUICK_MATCHED event was not unique");
          const participantProjection = await belowServices.postRepository.findPostById(
            below.exchangePostId,
            below.providerIdentityIds[0]!,
            below.now,
            below.providerUserIds[0]!
          );
          const matchedParticipantPrivacy =
            participantProjection?.publisher?.publicId === below.ownerPublicId &&
            participantProjection.demand?.address.line2 === "Minato-ku" &&
            participantProjection.demand.address.line3 === "NeeDo room 8";
          assert(matchedParticipantPrivacy, "matched provider privacy projection is incomplete");
          const belowAfter = await captureProtectedState(transaction, below);
          const publicationFeeStillHeld =
            belowAfter.hold?.status === "active" && belowAfter.requestFinancial?.state === "HELD";
          const walletHoldLedgerReconciliationUnchanged = sameValue(belowBefore, belowAfter);
          const bookingAndPaymentRowsZero =
            belowAfter.bookingCount === 0 && belowAfter.orderFinancialCount === 0;
          assert(publicationFeeStillHeld, "Quick matching changed publication fee state");
          assert(
            walletHoldLedgerReconciliationUnchanged,
            "Quick matching changed wallet, hold, ledger, reconciliation, or slot state"
          );
          assert(bookingAndPaymentRowsZero, "Quick matching created Booking or payment rows");

          const over = await createQuickMatchingFixture(transaction, markers[1]!, 30_000);
          const overServices = await createQuickMatchingServices(transaction, over);
          const overBefore = await captureProtectedState(transaction, over);
          await overServices.claim.createClaim(
            providerAccess(over, 0),
            over.exchangePostId,
            {
              scheduleSlotId: over.participantSlotIds[0]!,
              quoteAmountJpy: 16_000,
              message: "Original provider message"
            },
            `${over.marker}:claim:one`,
            context(over.marker)
          );
          await overServices.claim.createClaim(
            providerAccess(over, 1),
            over.exchangePostId,
            {
              scheduleSlotId: over.participantSlotIds[1]!,
              quoteAmountJpy: 16_000,
              message: null
            },
            `${over.marker}:claim:two`,
            context(over.marker)
          );
          const decision = await overServices.matching.getMatching(
            ownerAccess(over),
            over.exchangePostId
          );
          const overBudgetDecisionExact =
            decision.status === "open" &&
            decision.quickBudgetDecision?.activeClaimCount === 2 &&
            decision.quickBudgetDecision.selectedQuoteTotalJpy === 32_000 &&
            decision.quickBudgetDecision.effectiveBudgetMaxJpy === 30_000 &&
            decision.quickBudgetDecision.requiredBudgetMaxJpy === 32_000 &&
            decision.quickBudgetDecision.requiredBudgetIncreaseJpy === 2_000 &&
            decision.viewer.canConfirmQuickBudget;
          assert(overBudgetDecisionExact, "owner Quick budget decision is not exact");

          const confirmation = {
            expectedVersion: decision.version,
            budgetConfirmation: {
              action: "increase_to_selected_total" as const,
              confirmedBudgetMaxJpy: 32_000
            }
          };
          const confirmationKey = `${over.marker}:confirm`;
          const confirmed = await overServices.matching.confirmQuickBudget(
            ownerAccess(over),
            over.exchangePostId,
            confirmation,
            confirmationKey,
            context(over.marker)
          );
          const confirmationReplay = await overServices.matching.confirmQuickBudget(
            ownerAccess(over),
            over.exchangePostId,
            confirmation,
            confirmationKey,
            context(over.marker)
          );
          assert(
            sameValue(confirmed, confirmationReplay),
            "Quick budget confirmation replay changed the response"
          );
          await expectErrorMessage(
            () =>
              overServices.matching.confirmQuickBudget(
                ownerAccess(over),
                over.exchangePostId,
                {
                  ...confirmation,
                  budgetConfirmation: {
                    ...confirmation.budgetConfirmation,
                    confirmedBudgetMaxJpy: 32_001
                  }
                },
                confirmationKey,
                context(over.marker)
              ),
            "error.exchange.match_idempotency_conflict"
          );
          const overEvents = await transaction.exchangeMatchEvent.findMany({
            where: {
              matchingId: over.matchingId,
              type: { in: ["BUDGET_INCREASED", "QUICK_MATCHED"] },
              deletedAt: null
            },
            orderBy: { sequence: "asc" }
          });
          assert(
            confirmed.status === "matched" &&
              confirmed.effectiveBudgetMaxJpy === 32_000 &&
              confirmed.participants.length === 2 &&
              overEvents.length === 2 &&
              overEvents[0]?.type === "BUDGET_INCREASED" &&
              overEvents[1]?.type === "QUICK_MATCHED",
            "exact budget confirmation did not persist one ordered terminal chain"
          );
          const decisionNotifications = await transaction.notification.findMany({
            where: {
              recipientIdentityId: over.ownerIdentityId,
              title: "exchange.matching.quick_budget_decision_required.title",
              deletedAt: null
            }
          });
          assert(decisionNotifications.length === 1, "owner decision notification was duplicated");
          const notificationJson = JSON.stringify(decisionNotifications[0]?.payload ?? {});
          assert(
            !/address|message|phone|email|identityId|token|wallet/iu.test(notificationJson),
            "owner decision notification exposed private fields"
          );
          const overAfter = await captureProtectedState(transaction, over);
          assert(
            sameValue(overBefore, overAfter),
            "budget-confirmed Quick match changed financial or schedule state"
          );
          assert(
            overAfter.hold?.status === "active" &&
              overAfter.requestFinancial?.state === "HELD" &&
              overAfter.bookingCount === 0 &&
              overAfter.orderFinancialCount === 0,
            "budget-confirmed Quick match changed a deferred boundary"
          );

          report = {
            databaseName: target.databaseName,
            fixtureSetup: "direct-prisma-exact_then_formal-services",
            belowBudgetAutoMatched,
            overBudgetDecisionExact,
            thirdClaimRejected,
            quickMatchEventExactlyOnce,
            idempotentReplay,
            idempotencyConflictRejected,
            publicationFeeStillHeld,
            walletHoldLedgerReconciliationUnchanged,
            bookingAndPaymentRowsZero,
            matchedParticipantPrivacy
          };
          throw new RollbackVerifiedExchangeQuickMatching();
        },
        { maxWait: 10_000, timeout: 90_000 }
      );
    } catch (error) {
      if (!(error instanceof RollbackVerifiedExchangeQuickMatching)) throw error;
    }

    const finalReport = report as Record<string, unknown> | null;
    assert(finalReport, "Quick matching checker did not produce a report");
    const cleanupVerified =
      (await countQuickMatchingMarkerRows(prisma, markers[0]!)) === 0 &&
      (await countQuickMatchingMarkerRows(prisma, markers[1]!)) === 0 &&
      (await countQuickMatchingMarkerRows(prisma, markers[2]!)) === 0;
    assert(cleanupVerified, "rollback left marker-owned Quick matching rows");
    console.log(JSON.stringify({ ...finalReport, cleanupVerified }, null, 2));
  } finally {
    await disconnectPrisma();
  }
}

if (process.argv[1]?.endsWith("check-exchange-quick-matching-flow.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}
