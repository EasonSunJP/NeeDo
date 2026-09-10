import { randomUUID } from "node:crypto";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
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

async function captureExpectedError(
  operation: () => Promise<unknown>,
  expected: string
): Promise<Error & { data?: unknown }> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error && caught.message === expected, `expected ${expected}`);
  return caught;
}

class RollbackVerifiedMatchingFlow extends Error {}

async function main(): Promise<void> {
  const target = requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
  process.env.ENV_FILE = target.envFile;
  console.log(
    JSON.stringify({ databaseTarget: target.maskedDatabaseTarget, safety: "local-only" })
  );

  const [prismaModule, repositoryModule, serviceModule, postRepositoryModule] = await Promise.all([
    import("../src/prisma/client"),
    import("../src/repositories/exchange-matching.repository"),
    import("../src/services/exchange-matching.service"),
    import("../src/repositories/exchange.repository")
  ]);
  const { prisma, disconnectPrisma } = prismaModule;
  const { ExchangeMatchingRepository } = repositoryModule;
  const { ExchangeMatchingService } = serviceModule;
  const { ExchangePostRepository } = postRepositoryModule;
  const marker = `exchange-matching-check-${Date.now()}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const now = new Date();
  const startsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const endsAt = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  let report: Record<string, unknown> | null = null;
  let createdPostId: number | null = null;

  try {
    const physicalTables = await prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT TABLE_NAME AS tableName
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'exchange_request_matchings',
          'exchange_match_participants',
          'exchange_match_events'
        )
    `;
    assert(physicalTables.length === 3, "matching migration is not physically applied");

    try {
      await prisma.$transaction(
        async (transaction) => {
          const numericBase = String(Date.now() % 1_000_000_000).padStart(9, "0");
          const digits = (sequence: number) => `${numericBase}${sequence}`;
          let userSequence = 0;
          const createUser = async (label: string) => {
            userSequence += 1;
            return transaction.user.create({
              data: {
                needoId: `needo${digits(userSequence)}`,
                email: `${marker}-${label}@needo.test`,
                username: `${marker} ${label}`,
                isTestAccount: true
              }
            });
          };
          const createIdentity = async (input: {
            userId: number;
            type: string;
            displayName: string;
            scopeType: string | null;
            scopeId: number | null;
            kind: "B" | "S";
            sequence: number;
          }) => {
            const identity = await transaction.userIdentity.create({
              data: {
                userId: input.userId,
                type: input.type,
                displayName: input.displayName,
                scopeType: input.scopeType,
                scopeId: input.scopeId,
                activeKey: `${marker}:identity:${input.sequence}`
              }
            });
            const numberPart = digits(input.sequence);
            const publicIdentifier = await transaction.publicIdentifier.create({
              data: {
                publicId: `${input.kind.toLowerCase()}${numberPart}`,
                numberPart,
                kind: input.kind,
                userIdentityId: identity.id,
                status: "ACTIVE"
              }
            });
            return { identity, publicId: publicIdentifier.publicId };
          };

          const [
            ownerUser,
            selectedUser,
            secondSelectedUser,
            losingUser,
            selectedTechnicianUser,
            secondSelectedTechnicianUser,
            losingTechnicianUser
          ] = await Promise.all([
            createUser("owner"),
            createUser("selected"),
            createUser("second-selected"),
            createUser("loser"),
            createUser("selected-tech"),
            createUser("second-selected-tech"),
            createUser("losing-tech")
          ]);
          const shop = await transaction.shop.create({
            data: {
              ownerUserId: selectedUser.id,
              name: `${marker} shop`,
              city: "Tokyo",
              address: "Tokyo",
              status: "published",
              pricingMode: "MERCHANT"
            }
          });
          const [selectedTechnician, secondSelectedTechnician, losingTechnician] =
            await Promise.all([
              transaction.technicianProfile.create({
                data: {
                  userId: selectedTechnicianUser.id,
                  shopId: shop.id,
                  displayName: `${marker} selected technician`,
                  city: "Tokyo",
                  status: "published"
                },
                select: { id: true }
              }),
              transaction.technicianProfile.create({
                data: {
                  userId: secondSelectedTechnicianUser.id,
                  shopId: shop.id,
                  displayName: `${marker} second selected technician`,
                  city: "Tokyo",
                  status: "published"
                },
                select: { id: true }
              }),
              transaction.technicianProfile.create({
                data: {
                  userId: losingTechnicianUser.id,
                  shopId: shop.id,
                  displayName: `${marker} losing technician`,
                  city: "Tokyo",
                  status: "published"
                },
                select: { id: true }
              })
            ]);
          const owner = await createIdentity({
            userId: ownerUser.id,
            type: "merchant_owner",
            displayName: `${marker} owner`,
            scopeType: null,
            scopeId: null,
            kind: "B",
            sequence: 1
          });
          const selected = await createIdentity({
            userId: selectedUser.id,
            type: "merchant_owner",
            displayName: `${marker} selected provider`,
            scopeType: "shop",
            scopeId: shop.id,
            kind: "B",
            sequence: 2
          });
          const secondSelected = await createIdentity({
            userId: secondSelectedUser.id,
            type: "merchant_owner",
            displayName: `${marker} second selected provider`,
            scopeType: "shop",
            scopeId: shop.id,
            kind: "B",
            sequence: 3
          });
          const losing = await createIdentity({
            userId: losingUser.id,
            type: "merchant_owner",
            displayName: `${marker} losing provider`,
            scopeType: "shop",
            scopeId: shop.id,
            kind: "B",
            sequence: 4
          });
          await createIdentity({
            userId: selectedTechnicianUser.id,
            type: "technician",
            displayName: `${marker} selected technician`,
            scopeType: "technician_profile",
            scopeId: selectedTechnician.id,
            kind: "S",
            sequence: 5
          });
          await createIdentity({
            userId: secondSelectedTechnicianUser.id,
            type: "technician",
            displayName: `${marker} second selected technician`,
            scopeType: "technician_profile",
            scopeId: secondSelectedTechnician.id,
            kind: "S",
            sequence: 6
          });
          await createIdentity({
            userId: losingTechnicianUser.id,
            type: "technician",
            displayName: `${marker} losing technician`,
            scopeType: "technician_profile",
            scopeId: losingTechnician.id,
            kind: "S",
            sequence: 7
          });

          const categoryCode = `${marker.slice(-28)}-category`;
          await transaction.$executeRaw`
            INSERT INTO categories (code, name, sort_order, is_active, created_at, updated_at)
            VALUES (${categoryCode}, ${`${marker} category`}, 0, TRUE, ${now}, ${now})
          `;
          const categoryRows = await transaction.$queryRaw<Array<{ id: bigint | number }>>`
            SELECT LAST_INSERT_ID() AS id
          `;
          const categoryId = Number(categoryRows[0]?.id);
          assert(
            Number.isSafeInteger(categoryId) && categoryId > 0,
            "category fixture was not created"
          );
          const serviceRecord = await transaction.service.create({
            data: {
              categoryId,
              shopId: shop.id,
              name: `${marker} service`,
              city: "Tokyo",
              priceAmount: 12_000,
              durationMinutes: 60,
              status: "published"
            }
          });
          const [selectedSlot, secondSelectedSlot, losingSlot] = await Promise.all([
            transaction.scheduleSlot.create({
              data: {
                serviceId: serviceRecord.id,
                shopId: shop.id,
                technicianProfileId: selectedTechnician.id,
                startsAt,
                endsAt,
                capacity: 1,
                bookedCount: 0,
                status: "AVAILABLE"
              }
            }),
            transaction.scheduleSlot.create({
              data: {
                serviceId: serviceRecord.id,
                shopId: shop.id,
                technicianProfileId: secondSelectedTechnician.id,
                startsAt,
                endsAt,
                capacity: 1,
                bookedCount: 0,
                status: "AVAILABLE"
              }
            }),
            transaction.scheduleSlot.create({
              data: {
                serviceId: serviceRecord.id,
                shopId: shop.id,
                technicianProfileId: losingTechnician.id,
                startsAt,
                endsAt,
                capacity: 1,
                bookedCount: 0,
                status: "AVAILABLE"
              }
            })
          ]);

          const post = await transaction.exchangePost.create({
            data: {
              authorUserId: ownerUser.id,
              authorIdentityId: owner.identity.id,
              ownerIdentityId: owner.identity.id,
              publisherPublicId: owner.publicId,
              publisherIdentityType: "merchant_owner",
              publisherDisplayName: `${marker} owner`,
              type: "DEMAND",
              status: "PUBLISHED",
              title: `${marker} adjusted selective Request`,
              detail: "Rollback-contained formal matching adjustment verification",
              contentLocale: "EN",
              areaLabel: "Tokyo",
              serviceStartAt: startsAt,
              serviceEndAt: endsAt,
              expiresAt,
              idempotencyKey: `${marker}:post`,
              payloadFingerprint: "a".repeat(64),
              demand: {
                create: {
                  targetProviderCount: 3,
                  targetProviderLimitSnapshot: 20,
                  publisherCapacitySource: "SHOP_MERCHANT",
                  matchMode: "SELECTIVE",
                  budgetMode: "TOTAL",
                  budgetMinJpy: 8_000,
                  budgetMaxJpy: 20_000,
                  addressLine1: "Tokyo",
                  addressLine2: "Akasaka 1-2-3",
                  addressLine3: "NeeDo Tower 8F",
                  addressLine2Public: false,
                  addressLine3Public: false,
                  publisherIdentityPublic: false
                }
              },
              matching: {
                create: {
                  status: "OPEN",
                  effectiveTargetProviderCount: 3,
                  effectiveBudgetMaxJpy: 20_000,
                  selectedQuoteTotalJpy: 0,
                  version: 1,
                  events: {
                    create: {
                      sequence: 1,
                      type: "OPENED",
                      actorUserId: ownerUser.id,
                      actorIdentityId: owner.identity.id,
                      versionBefore: 0,
                      versionAfter: 1,
                      payload: { marker }
                    }
                  }
                }
              }
            },
            select: { id: true, matching: { select: { id: true } } }
          });
          createdPostId = post.id;
          assert(post.matching, "matching aggregate was not created");
          const matchingId = post.matching.id;

          await transaction.wallet.create({
            data: {
              ownerType: "USER",
              ownerId: ownerUser.id,
              currency: "TEST_NDP",
              availableBalance: 99_500,
              frozenBalance: 500
            }
          });
          const walletHold = await transaction.walletHold.create({
            data: {
              ownerType: "USER",
              ownerId: ownerUser.id,
              exchangePostId: post.id,
              feeType: "exchange_request_publication",
              holdAmountNdp: 500,
              currency: "TEST_NDP",
              status: "active",
              idempotencyKey: `${marker}:hold`,
              metadata: { marker }
            }
          });

          const selectedClaim = await transaction.exchangeClaim.create({
            data: {
              exchangePostId: post.id,
              claimantUserId: selectedUser.id,
              claimantIdentityId: selected.identity.id,
              shopId: shop.id,
              technicianProfileId: selectedTechnician.id,
              serviceId: serviceRecord.id,
              scheduleSlotId: selectedSlot.id,
              quoteAmountJpy: 11_000,
              message: `${marker} selected claim`,
              activeKey: `${post.id}:${selected.identity.id}`,
              idempotencyKey: `${marker}:claim:selected`,
              payloadFingerprint: "b".repeat(64)
            }
          });
          const secondSelectedClaim = await transaction.exchangeClaim.create({
            data: {
              exchangePostId: post.id,
              claimantUserId: secondSelectedUser.id,
              claimantIdentityId: secondSelected.identity.id,
              shopId: shop.id,
              technicianProfileId: secondSelectedTechnician.id,
              serviceId: serviceRecord.id,
              scheduleSlotId: secondSelectedSlot.id,
              quoteAmountJpy: 12_000,
              message: `${marker} second selected claim`,
              activeKey: `${post.id}:${secondSelected.identity.id}`,
              idempotencyKey: `${marker}:claim:second-selected`,
              payloadFingerprint: "c".repeat(64)
            }
          });
          const losingClaim = await transaction.exchangeClaim.create({
            data: {
              exchangePostId: post.id,
              claimantUserId: losingUser.id,
              claimantIdentityId: losing.identity.id,
              shopId: shop.id,
              technicianProfileId: losingTechnician.id,
              serviceId: serviceRecord.id,
              scheduleSlotId: losingSlot.id,
              quoteAmountJpy: 12_000,
              message: `${marker} losing claim`,
              activeKey: `${post.id}:${losing.identity.id}`,
              idempotencyKey: `${marker}:claim:losing`,
              payloadFingerprint: "d".repeat(64)
            }
          });
          await transaction.exchangeRequestMatching.update({
            where: { id: matchingId },
            data: { version: 4 }
          });
          await transaction.exchangeMatchEvent.createMany({
            data: [
              {
                matchingId,
                sequence: 2,
                type: "CLAIM_ADDED",
                actorUserId: selectedUser.id,
                actorIdentityId: selected.identity.id,
                versionBefore: 1,
                versionAfter: 2,
                payload: { exchangePostId: post.id, exchangeClaimId: selectedClaim.id }
              },
              {
                matchingId,
                sequence: 3,
                type: "CLAIM_ADDED",
                actorUserId: secondSelectedUser.id,
                actorIdentityId: secondSelected.identity.id,
                versionBefore: 2,
                versionAfter: 3,
                payload: { exchangePostId: post.id, exchangeClaimId: secondSelectedClaim.id }
              },
              {
                matchingId,
                sequence: 4,
                type: "CLAIM_ADDED",
                actorUserId: losingUser.id,
                actorIdentityId: losing.identity.id,
                versionBefore: 3,
                versionAfter: 4,
                payload: { exchangePostId: post.id, exchangeClaimId: losingClaim.id }
              }
            ]
          });

          const notificationIdentityIds = [
            selected.identity.id,
            secondSelected.identity.id,
            losing.identity.id
          ];
          const captureMatchingState = async () => ({
            post: await transaction.exchangePost.findUnique({
              where: { id: post.id },
              select: { status: true }
            }),
            matching: await transaction.exchangeRequestMatching.findUnique({
              where: { id: matchingId },
              select: {
                status: true,
                effectiveTargetProviderCount: true,
                effectiveBudgetMaxJpy: true,
                selectedQuoteTotalJpy: true,
                version: true,
                matchedAt: true
              }
            }),
            claims: await transaction.exchangeClaim.findMany({
              where: { exchangePostId: post.id },
              orderBy: { id: "asc" },
              select: { id: true, status: true, activeKey: true, terminalAt: true }
            }),
            participants: await transaction.exchangeMatchParticipant.count({
              where: { exchangePostId: post.id, deletedAt: null }
            }),
            events: await transaction.exchangeMatchEvent.count({
              where: { matchingId, deletedAt: null }
            }),
            notifications: await transaction.notification.count({
              where: {
                recipientIdentityId: { in: notificationIdentityIds },
                createdAt: { gte: now }
              }
            }),
            audits: await transaction.auditLog.count({
              where: {
                action: "exchange.matching.select",
                targetType: "exchange_request_matching",
                targetId: matchingId,
                userAgent: marker
              }
            })
          });
          const captureFinancialState = async () => ({
            wallet: await transaction.wallet.findUnique({
              where: {
                ownerType_ownerId_currency: {
                  ownerType: "USER",
                  ownerId: ownerUser.id,
                  currency: "TEST_NDP"
                }
              },
              select: { availableBalance: true, frozenBalance: true }
            }),
            hold: await transaction.walletHold.findUnique({
              where: { id: walletHold.id },
              select: {
                holdAmountNdp: true,
                capturedAmountNdp: true,
                releasedAmountNdp: true,
                status: true
              }
            }),
            slots: await transaction.scheduleSlot.findMany({
              where: { id: { in: [selectedSlot.id, secondSelectedSlot.id, losingSlot.id] } },
              orderBy: { id: "asc" },
              select: { id: true, bookedCount: true, status: true }
            }),
            bookings: await transaction.bookingOrder.count({
              where: {
                scheduleSlotId: { in: [selectedSlot.id, secondSelectedSlot.id, losingSlot.id] }
              }
            }),
            ledgerTransactions: await transaction.ledgerTransaction.count({
              where: { referenceType: "exchange_request_publication", referenceId: post.id }
            }),
            reconciliations: await transaction.financeReconciliation.count({
              where: { referenceType: "exchange_request_publication", referenceId: post.id }
            }),
            requestFinancials: await transaction.exchangeRequestFinancial.count({
              where: { exchangePostId: post.id }
            })
          });
          const financialBefore = await captureFinancialState();
          const ownerAccess: AuthenticatedAccessContext = {
            userId: ownerUser.id,
            email: ownerUser.email,
            accessTokenJti: marker,
            accessTokenExpiresAt: Date.now() + 60_000,
            currentIdentityId: owner.identity.id,
            currentPublicId: owner.publicId,
            currentIdentityType: "merchant_owner",
            currentIdentityScopeType: null,
            currentIdentityScopeId: null,
            roles: ["merchant_owner"],
            permissions: []
          };
          const repository = new ExchangeMatchingRepository(transaction);
          const matchingService = new ExchangeMatchingService(repository, () => now);
          const idempotencyKey = `${marker}:select`;
          const context = { ip: "127.0.0.1", userAgent: marker };
          const selectedClaimIds = [selectedClaim.id, secondSelectedClaim.id];
          const matchingBeforePreview = await captureMatchingState();
          const previewError = await captureExpectedError(
            () =>
              matchingService.selectMatching(
                ownerAccess,
                post.id,
                {
                  selectedClaimIds,
                  expectedVersion: 4,
                  budgetConfirmation: null,
                  targetConfirmation: null
                },
                `${marker}:preview`,
                context
              ),
            "error.exchange.match_target_confirmation_required"
          );
          const preview = previewError.data as Record<string, unknown> | undefined;
          assert(
            preview?.currentVersion === 4 &&
              preview.selectedCount === 2 &&
              preview.selectedQuoteTotalJpy === 23_000 &&
              preview.effectiveTargetProviderCount === 3 &&
              preview.effectiveBudgetMaxJpy === 20_000 &&
              preview.requiredTargetProviderCount === 2 &&
              preview.requiredBudgetMaxJpy === 23_000 &&
              preview.requiredBudgetIncreaseJpy === 3_000 &&
              preview.requiresTargetConfirmation === true &&
              preview.requiresBudgetConfirmation === true,
            "matching adjustment preview is not exact"
          );
          const matchingAfterPreview = await captureMatchingState();
          const adjustmentPreviewWriteFree = sameValue(matchingBeforePreview, matchingAfterPreview);
          assert(adjustmentPreviewWriteFree, "adjustment preview changed matching state");

          const confirmedSelection = {
            selectedClaimIds,
            expectedVersion: 4,
            budgetConfirmation: {
              action: "increase_to_selected_total" as const,
              confirmedBudgetMaxJpy: 23_000
            },
            targetConfirmation: {
              action: "reduce_to_selected_count" as const,
              confirmedTargetProviderCount: 2
            }
          };
          const selectedResult = await matchingService.selectMatching(
            ownerAccess,
            post.id,
            confirmedSelection,
            idempotencyKey,
            context
          );
          assert(
            selectedResult.status === "matched" &&
              selectedResult.version === 7 &&
              selectedResult.effectiveTargetProviderCount === 2 &&
              selectedResult.effectiveBudgetMaxJpy === 23_000 &&
              selectedResult.selectedQuoteTotalJpy === 23_000 &&
              selectedResult.participants.length === 2 &&
              selectedResult.participants.some(
                (participant) => participant.exchangeClaimId === selectedClaim.id
              ) &&
              selectedResult.participants.some(
                (participant) => participant.exchangeClaimId === secondSelectedClaim.id
              ),
            "adjusted match result was not persisted"
          );

          const replay = await matchingService.selectMatching(
            ownerAccess,
            post.id,
            confirmedSelection,
            idempotencyKey,
            context
          );
          const idempotentReplay = sameValue(replay, selectedResult);
          assert(idempotentReplay, "idempotent replay changed the matching result");
          await expectErrorMessage(
            () =>
              matchingService.selectMatching(
                ownerAccess,
                post.id,
                { ...confirmedSelection, selectedClaimIds: [selectedClaim.id, losingClaim.id] },
                idempotencyKey,
                context
              ),
            "error.exchange.match_idempotency_conflict"
          );
          const idempotencyConflictRejected = true;

          const [
            persistedPost,
            persistedMatching,
            persistedClaims,
            participants,
            events,
            notifications,
            audits
          ] = await Promise.all([
            transaction.exchangePost.findUniqueOrThrow({ where: { id: post.id } }),
            transaction.exchangeRequestMatching.findUniqueOrThrow({
              where: { exchangePostId: post.id }
            }),
            transaction.exchangeClaim.findMany({
              where: { exchangePostId: post.id },
              orderBy: { id: "asc" }
            }),
            transaction.exchangeMatchParticipant.findMany({
              where: { exchangePostId: post.id, deletedAt: null }
            }),
            transaction.exchangeMatchEvent.findMany({
              where: {
                matchingId,
                type: { in: ["BUDGET_INCREASED", "TARGET_REDUCED", "SELECTIVE_MATCHED"] },
                deletedAt: null
              },
              orderBy: { sequence: "asc" }
            }),
            transaction.notification.findMany({
              where: {
                recipientIdentityId: { in: notificationIdentityIds },
                createdAt: { gte: now }
              },
              orderBy: { recipientIdentityId: "asc" }
            }),
            transaction.auditLog.findMany({
              where: {
                action: "exchange.matching.select",
                targetType: "exchange_request_matching",
                targetId: matchingId,
                userAgent: marker
              }
            })
          ]);
          assert(persistedPost.status === "MATCHED", "Request did not reach MATCHED");
          assert(
            persistedMatching.status === "MATCHED" &&
              persistedMatching.version === 7 &&
              persistedMatching.effectiveTargetProviderCount === 2 &&
              persistedMatching.effectiveBudgetMaxJpy === 23_000 &&
              persistedMatching.selectedQuoteTotalJpy === 23_000,
            "matching aggregate terminal state is incorrect"
          );
          const selectedPersisted = persistedClaims.find((claim) => claim.id === selectedClaim.id);
          const secondSelectedPersisted = persistedClaims.find(
            (claim) => claim.id === secondSelectedClaim.id
          );
          const losingPersisted = persistedClaims.find((claim) => claim.id === losingClaim.id);
          assert(
            selectedPersisted?.status === "MATCHED" && selectedPersisted.activeKey === null,
            "selected claim terminal state is incorrect"
          );
          assert(
            secondSelectedPersisted?.status === "MATCHED" &&
              secondSelectedPersisted.activeKey === null,
            "second selected claim terminal state is incorrect"
          );
          assert(
            losingPersisted?.status === "NOT_SELECTED" && losingPersisted.activeKey === null,
            "losing claim terminal state is incorrect"
          );
          assert(participants.length === 2, "participant reservation cardinality is incorrect");
          const budgetIncreasedEvent = events[0]?.type === "BUDGET_INCREASED";
          const targetReducedEvent = events[1]?.type === "TARGET_REDUCED";
          const adjustmentChainVersionLinked =
            events.length === 3 &&
            events[0]?.sequence === 5 &&
            events[0].versionBefore === 4 &&
            events[0].versionAfter === 5 &&
            events[0].idempotencyKey === null &&
            events[1]?.sequence === 6 &&
            events[1].versionBefore === 5 &&
            events[1].versionAfter === 6 &&
            events[1].idempotencyKey === null &&
            events[2]?.type === "SELECTIVE_MATCHED" &&
            events[2].sequence === 7 &&
            events[2].versionBefore === 6 &&
            events[2].versionAfter === 7 &&
            events[2].idempotencyKey === idempotencyKey;
          assert(budgetIncreasedEvent, "BUDGET_INCREASED event was not persisted first");
          assert(targetReducedEvent, "TARGET_REDUCED event was not persisted second");
          assert(adjustmentChainVersionLinked, "adjustment event versions are not linked");
          assert(audits.length === 1, "idempotent replay duplicated matching audit");
          assert(
            notifications.length === 3 &&
              notifications.filter((item) => item.title === "exchange.matching.selected.title")
                .length === 2 &&
              notifications.filter((item) => item.title === "exchange.matching.not_selected.title")
                .length === 1,
            "selected and not-selected notifications were not persisted exactly once"
          );

          const postRepository = new ExchangePostRepository(transaction);
          const selectedProjection = await postRepository.findPostById(
            post.id,
            selected.identity.id,
            now,
            selectedUser.id
          );
          const losingProjection = await postRepository.findPostById(
            post.id,
            losing.identity.id,
            now,
            losingUser.id
          );
          assert(
            selectedProjection?.publisher?.publicId === owner.publicId &&
              selectedProjection.demand?.address.line2 === "Akasaka 1-2-3" &&
              selectedProjection.demand.address.line3 === "NeeDo Tower 8F" &&
              selectedProjection.demand.address.disclosure === "matched_participant",
            "matched_participant privacy projection is incomplete"
          );
          assert(
            losingProjection?.publisher === null &&
              losingProjection.demand?.address.line2 === null &&
              losingProjection.demand.address.line3 === null &&
              losingProjection.demand.address.disclosure === "general",
            "losing provider received private Request fields"
          );
          assert(
            !/phone|email/iu.test(JSON.stringify(selectedProjection)) &&
              !/phone|email/iu.test(JSON.stringify(losingProjection)),
            "Exchange projection exposed contact fields"
          );

          const financialAfter = await captureFinancialState();
          const walletAndHoldUnchanged =
            sameValue(financialBefore.wallet, financialAfter.wallet) &&
            sameValue(financialBefore.hold, financialAfter.hold);
          const bookingAndFinancialCountsUnchanged =
            sameValue(financialBefore.slots, financialAfter.slots) &&
            financialBefore.bookings === financialAfter.bookings &&
            financialBefore.ledgerTransactions === financialAfter.ledgerTransactions &&
            financialBefore.reconciliations === financialAfter.reconciliations &&
            financialBefore.requestFinancials === financialAfter.requestFinancials;
          assert(walletAndHoldUnchanged, "matching moved the wallet or publication hold");
          assert(
            bookingAndFinancialCountsUnchanged,
            "matching created Booking or financial transaction state"
          );

          report = {
            databaseName: target.databaseName,
            matchingStatus: persistedMatching.status,
            selectedCount: participants.length,
            selectedQuoteTotalJpy: persistedMatching.selectedQuoteTotalJpy,
            selectedAndLoserNotifications: notifications.length,
            adjustmentPreviewWriteFree,
            budgetIncreasedEvent,
            targetReducedEvent,
            adjustmentChainVersionLinked,
            matchedParticipantPrivacy: true,
            losingProviderPrivacy: true,
            idempotentReplay,
            idempotencyConflictRejected,
            walletAndHoldUnchanged,
            bookingAndFinancialCountsUnchanged
          };
          throw new RollbackVerifiedMatchingFlow();
        },
        { maxWait: 10_000, timeout: 30_000 }
      );
    } catch (error) {
      if (!(error instanceof RollbackVerifiedMatchingFlow)) throw error;
    }

    const finalReport = report as Record<string, unknown> | null;
    assert(finalReport, "matching checker did not produce a report");
    const cleanupVerified =
      (await prisma.user.count({ where: { email: { startsWith: marker } } })) === 0 &&
      (createdPostId === null ||
        (await prisma.exchangePost.count({ where: { id: createdPostId } })) === 0) &&
      (await prisma.auditLog.count({ where: { userAgent: marker } })) === 0;
    assert(cleanupVerified, "rollback left marker-owned matching rows");
    console.log(JSON.stringify({ ...finalReport, cleanupVerified }, null, 2));
  } finally {
    await disconnectPrisma();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
