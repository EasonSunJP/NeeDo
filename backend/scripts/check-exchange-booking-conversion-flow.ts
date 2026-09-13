/* eslint-disable @typescript-eslint/no-explicit-any -- local guarded database proof coordinates Prisma fixture clients */
import { randomUUID } from "node:crypto";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { requireSafeExchangeClaimFlowEnvironment } from "./support/exchange-claim-flow-safety";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function expectConversionError(
  operation: () => Promise<unknown>,
  outcome: "version_conflict" | "slot_unavailable" | "idempotency_conflict" | "already_created"
): Promise<void> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  const expectedPublicMessage = `error.exchange.match_booking_${outcome}`;
  assert(
    caught instanceof Error &&
      (caught.message === outcome || caught.message === expectedPublicMessage),
    `expected ${outcome}`
  );
}

export type ExchangeBookingFixture = {
  marker: string;
  now: Date;
  startsAt: Date;
  endsAt: Date;
  ownerUserId: number;
  ownerEmail: string;
  ownerIdentityId: number;
  ownerPublicId: string;
  providerUserIds: number[];
  providerIdentityIds: number[];
  publicIdentifierIds: number[];
  technicianProfileIds: number[];
  affiliationIds: number[];
  shopId: number;
  categoryId: number;
  serviceId: number;
  participantSlotIds: number[];
  oldSlotId: number;
  oldOrderId: number;
  exchangePostId: number;
  matchingId: number;
  claimIds: number[];
  participantIds: number[];
  walletId: number;
  walletHoldId: number;
  feeRuleSetId: number;
  feeRuleId: number;
  feeCalculationLogId: number;
  requestFinancialId: number;
};

export async function createExchangeBookingFixture(
  client: any,
  marker: string,
  now = new Date()
): Promise<ExchangeBookingFixture> {
  const startsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const endsAt = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const oldStartsAt = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const oldEndsAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const numericBase = String(Date.now() % 1_000_000_000).padStart(9, "0");
  const digits = (sequence: number) => `${numericBase}${sequence}`;
  let userSequence = 0;
  const createUser = async (label: string) => {
    userSequence += 1;
    return client.user.create({
      data: {
        needoId: `needo${digits(userSequence)}`,
        email: `${marker}-${label}@needo.test`,
        username: `${marker} ${label}`,
        emailVerifiedAt: now,
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
    prefix: "u" | "s";
    kind: "U" | "S";
    sequence: number;
  }) => {
    const identity = await client.userIdentity.create({
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
    const publicIdentifier = await client.publicIdentifier.create({
      data: {
        publicId: `${input.prefix}${numberPart}`,
        numberPart,
        kind: input.kind,
        userIdentityId: identity.id,
        status: "ACTIVE"
      }
    });
    return { identity, publicIdentifier };
  };

  const [ownerUser, firstProviderUser, secondProviderUser] = await Promise.all([
    createUser("owner"),
    createUser("provider-one"),
    createUser("provider-two")
  ]);
  const owner = await createIdentity({
    userId: ownerUser.id,
    type: "customer",
    displayName: `${marker} owner`,
    scopeType: null,
    scopeId: null,
    prefix: "u",
    kind: "U",
    sequence: 1
  });
  const shop = await client.shop.create({
    data: {
      ownerUserId: firstProviderUser.id,
      name: `${marker} shop`,
      city: "Tokyo",
      address: "Tokyo",
      status: "published",
      pricingMode: "MERCHANT"
    }
  });
  const [firstTechnician, secondTechnician] = await Promise.all([
    client.technicianProfile.create({
      data: {
        userId: firstProviderUser.id,
        shopId: shop.id,
        displayName: `${marker} technician one`,
        city: "Tokyo",
        status: "published"
      }
    }),
    client.technicianProfile.create({
      data: {
        userId: secondProviderUser.id,
        shopId: shop.id,
        displayName: `${marker} technician two`,
        city: "Tokyo",
        status: "published"
      }
    })
  ]);
  const [firstProvider, secondProvider] = await Promise.all([
    createIdentity({
      userId: firstProviderUser.id,
      type: "technician",
      displayName: `${marker} provider one`,
      scopeType: "technician_profile",
      scopeId: firstTechnician.id,
      prefix: "s",
      kind: "S",
      sequence: 2
    }),
    createIdentity({
      userId: secondProviderUser.id,
      type: "technician",
      displayName: `${marker} provider two`,
      scopeType: "technician_profile",
      scopeId: secondTechnician.id,
      prefix: "s",
      kind: "S",
      sequence: 3
    })
  ]);
  const affiliations = await Promise.all(
    [firstTechnician.id, secondTechnician.id].map((technicianProfileId, index) =>
      client.technicianShopAffiliation.create({
        data: {
          technicianProfileId,
          shopId: shop.id,
          relationshipType: "EXCLUSIVE",
          workStatus: "ACTIVE",
          startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          activeKey: `${marker}:affiliation:${index + 1}`
        }
      })
    )
  );

  const categoryCode = `${marker.slice(-28)}-category`;
  await client.$executeRaw`
    INSERT INTO categories (code, name, sort_order, is_active, created_at, updated_at)
    VALUES (${categoryCode}, ${`${marker} category`}, 0, TRUE, ${now}, ${now})
  `;
  const categoryRows = await client.$queryRaw<Array<{ id: bigint | number }>>`
    SELECT id FROM categories WHERE code = ${categoryCode}
  `;
  const categoryId = Number(categoryRows[0]?.id);
  assert(Number.isSafeInteger(categoryId) && categoryId > 0, "category fixture was not created");
  const service = await client.service.create({
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
  const [firstSlot, secondSlot, oldSlot] = await Promise.all([
    client.scheduleSlot.create({
      data: {
        serviceId: service.id,
        shopId: shop.id,
        technicianProfileId: firstTechnician.id,
        startsAt,
        endsAt,
        capacity: 1,
        bookedCount: 0,
        status: "AVAILABLE"
      }
    }),
    client.scheduleSlot.create({
      data: {
        serviceId: service.id,
        shopId: shop.id,
        technicianProfileId: secondTechnician.id,
        startsAt,
        endsAt,
        capacity: 1,
        bookedCount: 0,
        status: "AVAILABLE"
      }
    }),
    client.scheduleSlot.create({
      data: {
        serviceId: service.id,
        shopId: shop.id,
        technicianProfileId: firstTechnician.id,
        startsAt: oldStartsAt,
        endsAt: oldEndsAt,
        capacity: 1,
        bookedCount: 1,
        status: "BOOKED"
      }
    })
  ]);
  const oldOrder = await client.bookingOrder.create({
    data: {
      orderNo: `ND${String(Date.now()).slice(-14)}90`,
      orderType: "BOOKING",
      customerUserId: ownerUser.id,
      serviceId: service.id,
      shopId: shop.id,
      technicianProfileId: firstTechnician.id,
      scheduleSlotId: oldSlot.id,
      status: "PENDING",
      fulfillmentMode: "store",
      priceAmount: 12_000,
      currency: "JPY",
      pricingModeSnapshot: "MERCHANT",
      serviceOwnerType: "SHOP",
      serviceOwnerId: service.id,
      serviceNameSnapshot: `${marker} old service`,
      servicePriceSnapshot: 12_000,
      serviceDurationSnapshot: 60,
      startsAt: oldStartsAt,
      endsAt: oldEndsAt,
      paymentMethod: "ONSITE",
      paymentStatus: "PENDING",
      paymentAmountJpy: 12_000
    }
  });

  const post = await client.exchangePost.create({
    data: {
      authorUserId: ownerUser.id,
      authorIdentityId: owner.identity.id,
      ownerIdentityId: owner.identity.id,
      publisherPublicId: owner.publicIdentifier.publicId,
      publisherIdentityType: "customer",
      publisherDisplayName: `${marker} owner`,
      type: "DEMAND",
      status: "MATCHED",
      title: `${marker} matched Request`,
      detail: "Rollback-contained matched booking conversion proof",
      contentLocale: "EN",
      areaLabel: "Tokyo",
      serviceStartAt: startsAt,
      serviceEndAt: endsAt,
      expiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      idempotencyKey: `${marker}:post`,
      payloadFingerprint: "a".repeat(64),
      demand: {
        create: {
          targetProviderCount: 2,
          targetProviderLimitSnapshot: 5,
          publisherCapacitySource: "CUSTOMER_MEMBERSHIP",
          membershipLevelSnapshot: "regular",
          matchMode: "SELECTIVE",
          budgetMode: "TOTAL",
          budgetMinJpy: 10_000,
          budgetMaxJpy: 25_000,
          addressLine1: "Tokyo-to",
          addressLine2: "Minato-ku",
          addressLine3: "NeeDo room 8",
          addressLine2Public: false,
          addressLine3Public: false,
          publisherIdentityPublic: false,
          serviceMode: "HOME"
        }
      }
    }
  });
  const matching = await client.exchangeRequestMatching.create({
    data: {
      exchangePostId: post.id,
      status: "MATCHED",
      effectiveTargetProviderCount: 2,
      effectiveBudgetMaxJpy: 25_000,
      selectedQuoteTotalJpy: 23_000,
      version: 7,
      matchedAt: now
    }
  });
  const providerRows = [
    {
      user: firstProviderUser,
      identity: firstProvider.identity,
      technician: firstTechnician,
      slot: firstSlot,
      quoteAmountJpy: 11_000,
      snapshot: `${marker} service one`
    },
    {
      user: secondProviderUser,
      identity: secondProvider.identity,
      technician: secondTechnician,
      slot: secondSlot,
      quoteAmountJpy: 12_000,
      snapshot: `${marker} service two`
    }
  ];
  const claims = [];
  const participants = [];
  for (const [index, provider] of providerRows.entries()) {
    const claim = await client.exchangeClaim.create({
      data: {
        exchangePostId: post.id,
        claimantUserId: provider.user.id,
        claimantIdentityId: provider.identity.id,
        shopId: shop.id,
        technicianProfileId: provider.technician.id,
        serviceId: service.id,
        scheduleSlotId: provider.slot.id,
        quoteAmountJpy: provider.quoteAmountJpy,
        currency: "JPY",
        message: `${marker} claim ${index + 1}`,
        status: "MATCHED",
        activeKey: null,
        idempotencyKey: `${marker}:claim:${index + 1}`,
        payloadFingerprint: String(index + 2).repeat(64),
        terminalAt: now
      }
    });
    claims.push(claim);
    participants.push(
      await client.exchangeMatchParticipant.create({
        data: {
          matchingId: matching.id,
          exchangePostId: post.id,
          exchangeClaimId: claim.id,
          participantUserId: provider.user.id,
          participantIdentityId: provider.identity.id,
          shopId: shop.id,
          technicianProfileId: provider.technician.id,
          serviceId: service.id,
          scheduleSlotId: provider.slot.id,
          quoteAmountJpy: provider.quoteAmountJpy,
          currency: "JPY",
          estimatedStartsAt: startsAt,
          estimatedEndsAt: endsAt,
          serviceNameSnapshot: provider.snapshot,
          serviceDurationSnapshot: 60,
          activeReservationKey: `${marker}:reservation:${index + 1}`,
          matchedAt: now
        }
      })
    );
  }
  await client.exchangeMatchEvent.create({
    data: {
      matchingId: matching.id,
      sequence: 7,
      type: "SELECTIVE_MATCHED",
      actorUserId: ownerUser.id,
      actorIdentityId: owner.identity.id,
      versionBefore: 6,
      versionAfter: 7,
      idempotencyKey: `${marker}:match`,
      payloadFingerprint: "f".repeat(64),
      payload: { exchangePostId: post.id, participantIds: participants.map(({ id }: any) => id) },
      createdAt: now
    }
  });

  const wallet = await client.wallet.create({
    data: {
      ownerType: "USER",
      ownerId: ownerUser.id,
      currency: "TEST_NDP",
      availableBalance: 99_500,
      frozenBalance: 500
    }
  });
  const feeRuleSet = await client.platformFeeRuleSet.create({
    data: {
      name: `${marker} request fee rules`,
      familyCode: marker.slice(0, 80),
      status: "published",
      version: 1,
      effectiveFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }
  });
  const feeRule = await client.platformFeeRule.create({
    data: {
      ruleSetId: feeRuleSet.id,
      feeType: "exchange_request_publication",
      orderType: "request",
      payerType: "user",
      baseAmountNdp: 500,
      status: "active"
    }
  });
  const feeCalculationLog = await client.feeCalculationLog.create({
    data: {
      exchangePostId: post.id,
      calculationStage: "publication",
      feeType: "exchange_request_publication",
      payerType: "user",
      payerId: ownerUser.id,
      baseFeeNdp: 500,
      finalFeeNdp: 500,
      holdAmountNdp: 500,
      appliedRuleIdsJson: [feeRule.id],
      explanationJson: { marker },
      calculatedAt: now
    }
  });
  const walletHold = await client.walletHold.create({
    data: {
      ownerType: "USER",
      ownerId: ownerUser.id,
      exchangePostId: post.id,
      feeType: "exchange_request_publication_fee",
      holdAmountNdp: 500,
      currency: "TEST_NDP",
      status: "active",
      idempotencyKey: `${marker}:hold`,
      calculationLogId: feeCalculationLog.id,
      metadata: { marker }
    }
  });
  const requestFinancial = await client.exchangeRequestFinancial.create({
    data: {
      exchangePostId: post.id,
      payerType: "user",
      payerId: ownerUser.id,
      walletOwnerType: "USER",
      walletOwnerId: ownerUser.id,
      currency: "TEST_NDP",
      feeRuleSetId: feeRuleSet.id,
      feeRuleSetVersion: 1,
      feeRuleId: feeRule.id,
      feeCalculationLogId: feeCalculationLog.id,
      walletHoldId: walletHold.id,
      amountNdp: 500,
      state: "HELD"
    }
  });

  return {
    marker,
    now,
    startsAt,
    endsAt,
    ownerUserId: ownerUser.id,
    ownerEmail: ownerUser.email,
    ownerIdentityId: owner.identity.id,
    ownerPublicId: owner.publicIdentifier.publicId,
    providerUserIds: providerRows.map(({ user }) => user.id),
    providerIdentityIds: providerRows.map(({ identity }) => identity.id),
    publicIdentifierIds: [
      owner.publicIdentifier.id,
      firstProvider.publicIdentifier.id,
      secondProvider.publicIdentifier.id
    ],
    technicianProfileIds: [firstTechnician.id, secondTechnician.id],
    affiliationIds: affiliations.map(({ id }: any) => id),
    shopId: shop.id,
    categoryId,
    serviceId: service.id,
    participantSlotIds: [firstSlot.id, secondSlot.id],
    oldSlotId: oldSlot.id,
    oldOrderId: oldOrder.id,
    exchangePostId: post.id,
    matchingId: matching.id,
    claimIds: claims.map(({ id }: any) => id),
    participantIds: participants.map(({ id }: any) => id),
    walletId: wallet.id,
    walletHoldId: walletHold.id,
    feeRuleSetId: feeRuleSet.id,
    feeRuleId: feeRule.id,
    feeCalculationLogId: feeCalculationLog.id,
    requestFinancialId: requestFinancial.id
  };
}

export async function createExchangeBookingService(
  client: any,
  fixture: ExchangeBookingFixture,
  invalidatedOrderIds: number[],
  suffixStart: number
) {
  const [{ ExchangeBookingConversionRepository }, { ExchangeBookingConversionService }, { AuditLogService }] =
    await Promise.all([
      import("../src/repositories/exchange-booking-conversion.repository"),
      import("../src/services/exchange-booking-conversion.service"),
      import("../src/services/audit-log.service")
    ]);
  let suffix = suffixStart;
  const repository = new ExchangeBookingConversionRepository(client, () => {
    suffix += 1;
    return suffix;
  });
  const audit = new AuditLogService({ create: async () => undefined });
  const affiliateBoundary = {
    invalidateCancelledBooking: async (input: { bookingOrderId: number }) => {
      invalidatedOrderIds.push(input.bookingOrderId);
    }
  };
  const policyBoundary = { assertServiceEkyc: async () => undefined };
  return new ExchangeBookingConversionService(
    repository,
    audit,
    affiliateBoundary as never,
    policyBoundary as never,
    undefined,
    () => fixture.now
  );
}

export function ownerAccess(fixture: ExchangeBookingFixture): AuthenticatedAccessContext {
  return {
    userId: fixture.ownerUserId,
    email: fixture.ownerEmail,
    accessTokenJti: fixture.marker,
    accessTokenExpiresAt: Date.now() + 60_000,
    currentIdentityId: fixture.ownerIdentityId,
    currentPublicId: fixture.ownerPublicId,
    currentIdentityType: "customer",
    currentIdentityScopeType: null,
    currentIdentityScopeId: null,
    roles: ["customer"],
    permissions: ["exchange:matching:book-own"]
  };
}

export async function cleanupExchangeBookingFixture(client: any, fixture: ExchangeBookingFixture) {
  const orderRows = await client.bookingOrder.findMany({
    where: { customerUserId: fixture.ownerUserId },
    select: { id: true }
  });
  const orderIds = orderRows.map(({ id }: any) => id);
  if (orderIds.length > 0) {
    await client.exchangeBookingCancellationEvent.deleteMany({
      where: { bookingOrderId: { in: orderIds } }
    });
    await client.exchangeBookingCancellation.deleteMany({
      where: { bookingOrderId: { in: orderIds } }
    });
  }
  await client.notification.deleteMany({
    where: {
      OR: [
        { recipientIdentityId: { in: [fixture.ownerIdentityId, ...fixture.providerIdentityIds] } },
        { actorIdentityId: { in: [fixture.ownerIdentityId, ...fixture.providerIdentityIds] } }
      ]
    }
  });
  await client.auditLog.deleteMany({ where: { userAgent: fixture.marker } });
  await client.exchangeMatchEvent.deleteMany({ where: { matchingId: fixture.matchingId } });
  await client.exchangeMatchParticipant.deleteMany({ where: { id: { in: fixture.participantIds } } });
  if (orderIds.length > 0) {
    await client.bookingServiceLocation.deleteMany({
      where: { bookingOrderId: { in: orderIds } }
    });
    await client.orderStatusHistory.deleteMany({ where: { bookingOrderId: { in: orderIds } } });
    await client.orderFinancial.deleteMany({ where: { bookingOrderId: { in: orderIds } } });
    await client.bookingOrder.deleteMany({ where: { id: { in: orderIds } } });
  }
  await client.exchangeRequestFinancial.deleteMany({ where: { id: fixture.requestFinancialId } });
  await client.walletHold.deleteMany({ where: { id: fixture.walletHoldId } });
  await client.feeCalculationLog.deleteMany({ where: { id: fixture.feeCalculationLogId } });
  await client.platformFeeRule.deleteMany({ where: { id: fixture.feeRuleId } });
  await client.platformFeeRuleSet.deleteMany({ where: { id: fixture.feeRuleSetId } });
  await client.exchangeClaim.deleteMany({ where: { id: { in: fixture.claimIds } } });
  await client.exchangeRequestMatching.deleteMany({ where: { id: fixture.matchingId } });
  await client.exchangeDemand.deleteMany({ where: { postId: fixture.exchangePostId } });
  await client.exchangePost.deleteMany({ where: { id: fixture.exchangePostId } });
  await client.scheduleSlot.deleteMany({
    where: { id: { in: [...fixture.participantSlotIds, fixture.oldSlotId] } }
  });
  await client.service.deleteMany({ where: { id: fixture.serviceId } });
  await client.$executeRaw`DELETE FROM categories WHERE id = ${fixture.categoryId}`;
  await client.technicianShopAffiliation.deleteMany({ where: { id: { in: fixture.affiliationIds } } });
  await client.publicIdentifier.deleteMany({ where: { id: { in: fixture.publicIdentifierIds } } });
  await client.userIdentity.deleteMany({
    where: { id: { in: [fixture.ownerIdentityId, ...fixture.providerIdentityIds] } }
  });
  await client.technicianProfile.deleteMany({
    where: { id: { in: fixture.technicianProfileIds } }
  });
  await client.wallet.deleteMany({ where: { id: fixture.walletId } });
  await client.shop.deleteMany({ where: { id: fixture.shopId } });
  await client.user.deleteMany({
    where: { id: { in: [fixture.ownerUserId, ...fixture.providerUserIds] } }
  });
}

export async function countExchangeBookingMarkerRows(client: any, marker: string) {
  const [users, posts, services, audits, feeRuleSets] = await Promise.all([
    client.user.count({ where: { email: { startsWith: marker } } }),
    client.exchangePost.count({ where: { idempotencyKey: `${marker}:post` } }),
    client.service.count({ where: { name: `${marker} service` } }),
    client.auditLog.count({ where: { userAgent: marker } }),
    client.platformFeeRuleSet.count({ where: { familyCode: marker.slice(0, 80) } })
  ]);
  return users + posts + services + audits + feeRuleSets;
}

class RollbackVerifiedExchangeBookingConversion extends Error {}

async function main(): Promise<void> {
  const target = requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
  process.env.ENV_FILE = target.envFile;
  console.log(JSON.stringify({ databaseTarget: target.maskedDatabaseTarget, safety: "local-only" }));
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const marker = `exchange-booking-check-${Date.now()}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  let report: Record<string, unknown> | null = null;
  let createdPostId: number | null = null;

  try {
    const physicalColumns = await prisma.$queryRaw<Array<{ columnName: string }>>`
      SELECT COLUMN_NAME AS columnName
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'exchange_match_participants'
        AND COLUMN_NAME IN ('booking_order_id', 'booked_at', 'service_name_snapshot', 'service_duration_snapshot')
    `;
    assert(physicalColumns.length === 4, "matched-booking migration is not physically applied");

    try {
      await prisma.$transaction(
        async (transaction) => {
          const fixture = await createExchangeBookingFixture(transaction, marker);
          createdPostId = fixture.exchangePostId;
          const invalidatedOrderIds: number[] = [];
          const service = await createExchangeBookingService(
            transaction,
            fixture,
            invalidatedOrderIds,
            4300
          );
          const access = ownerAccess(fixture);
          const context = { ip: "127.0.0.1", userAgent: marker };
          const captureFinance = async () => ({
            wallet: await transaction.wallet.findUnique({ where: { id: fixture.walletId } }),
            hold: await transaction.walletHold.findUnique({ where: { id: fixture.walletHoldId } }),
            requestFinancial: await transaction.exchangeRequestFinancial.findUnique({
              where: { id: fixture.requestFinancialId }
            }),
            calculation: await transaction.feeCalculationLog.findUnique({
              where: { id: fixture.feeCalculationLogId }
            }),
            ledgerTransactions: await transaction.ledgerTransaction.count({
              where: { referenceType: "exchange_request_publication", referenceId: fixture.exchangePostId }
            }),
            walletLedgers: await transaction.walletLedger.count({
              where: { walletId: fixture.walletId }
            }),
            reconciliations: await transaction.financeReconciliation.count({
              where: { referenceType: "exchange_request_publication", referenceId: fixture.exchangePostId }
            }),
            orderFinancials: await transaction.orderFinancial.count({
              where: { bookingOrder: { customerUserId: fixture.ownerUserId } }
            })
          });
          const financeBefore = await captureFinance();

          await expectConversionError(
            () =>
              service.createBookings(
                access,
                fixture.exchangePostId,
                { expectedVersion: 6 },
                `${marker}:stale`,
                context
              ),
            "version_conflict"
          );
          const staleVersionRejected = true;

          await transaction.scheduleSlot.update({
            where: { id: fixture.participantSlotIds[1] },
            data: { bookedCount: 1, status: "BOOKED" }
          });
          const failureStateBefore = {
            orders: await transaction.bookingOrder.count({
              where: { customerUserId: fixture.ownerUserId }
            }),
            linked: await transaction.exchangeMatchParticipant.count({
              where: { id: { in: fixture.participantIds }, bookingOrderId: { not: null } }
            }),
            events: await transaction.exchangeMatchEvent.count({
              where: { matchingId: fixture.matchingId, type: "BOOKINGS_CREATED" }
            })
          };
          await expectConversionError(
            () =>
              service.createBookings(
                access,
                fixture.exchangePostId,
                { expectedVersion: 7 },
                `${marker}:slot-failure`,
                context
              ),
            "slot_unavailable"
          );
          const failureStateAfter = {
            orders: await transaction.bookingOrder.count({
              where: { customerUserId: fixture.ownerUserId }
            }),
            linked: await transaction.exchangeMatchParticipant.count({
              where: { id: { in: fixture.participantIds }, bookingOrderId: { not: null } }
            }),
            events: await transaction.exchangeMatchEvent.count({
              where: { matchingId: fixture.matchingId, type: "BOOKINGS_CREATED" }
            })
          };
          const slotFailureRolledBack = sameValue(failureStateBefore, failureStateAfter);
          assert(slotFailureRolledBack, "slot failure left partial conversion state");
          await transaction.scheduleSlot.update({
            where: { id: fixture.participantSlotIds[1] },
            data: { bookedCount: 0, status: "AVAILABLE" }
          });

          const idempotencyKey = `${marker}:create`;
          const created = await service.createBookings(
            access,
            fixture.exchangePostId,
            { expectedVersion: 7 },
            idempotencyKey,
            context
          );
          const replayed = await service.createBookings(
            access,
            fixture.exchangePostId,
            { expectedVersion: 7 },
            idempotencyKey,
            context
          );
          const idempotentReplay = sameValue(created, replayed);
          assert(idempotentReplay, "idempotent replay changed the committed payload");
          await expectConversionError(
            () =>
              service.createBookings(
                access,
                fixture.exchangePostId,
                { expectedVersion: 8 },
                idempotencyKey,
                context
              ),
            "idempotency_conflict"
          );
          const idempotencyConflictRejected = true;

          const [participants, createdOrders, oldOrder, slots, bookingEvents, notifications, audits] =
            await Promise.all([
              transaction.exchangeMatchParticipant.findMany({
                where: { id: { in: fixture.participantIds } },
                orderBy: { id: "asc" }
              }),
              transaction.bookingOrder.findMany({
                where: { id: { in: created.orders.map(({ orderId }) => orderId) } },
                orderBy: { id: "asc" }
              }),
              transaction.bookingOrder.findUniqueOrThrow({ where: { id: fixture.oldOrderId } }),
              transaction.scheduleSlot.findMany({
                where: { id: { in: [...fixture.participantSlotIds, fixture.oldSlotId] } },
                orderBy: { id: "asc" }
              }),
              transaction.exchangeMatchEvent.findMany({
                where: { matchingId: fixture.matchingId, type: "BOOKINGS_CREATED" }
              }),
              transaction.notification.findMany({
                where: { recipientIdentityId: { in: fixture.providerIdentityIds }, title: "exchange.booking.created.title" }
              }),
              transaction.auditLog.findMany({
                where: { action: "exchange.matching.bookings.create", userAgent: marker }
              })
            ]);
          const participantOrderCountMatches =
            created.orders.length === fixture.participantIds.length &&
            participants.every((participant: any) => participant.bookingOrderId !== null);
          const ordinaryPendingReplaced =
            oldOrder.status === "CANCELLED" &&
            oldOrder.cancelReason === "superseded_by_exchange_booking_batch" &&
            invalidatedOrderIds.length === 1 &&
            invalidatedOrderIds[0] === fixture.oldOrderId;
          const sameBatchPendingCoexists =
            createdOrders.length === 2 &&
            createdOrders.every((order: any) => order.status === "PENDING") &&
            new Set(createdOrders.map((order: any) => order.scheduleSlotId)).size === 2;
          assert(participantOrderCountMatches, "participant booking links are incomplete");
          assert(ordinaryPendingReplaced, "ordinary pending order was not replaced exactly once");
          assert(sameBatchPendingCoexists, "same-batch pending orders did not coexist");
          assert(
            createdOrders.every(
              (order: any) =>
                order.orderType === "REQUEST" &&
                order.fulfillmentMode === "home" &&
                order.paymentStatus === "PENDING" &&
                order.paymentMethod === "ONSITE" &&
                order.serviceDurationSnapshot === 60 &&
                order.fulfillmentAddressSnapshot?.line1 === "Tokyo-to" &&
                order.fulfillmentAddressSnapshot?.line2 === "Minato-ku" &&
                order.fulfillmentAddressSnapshot?.line3 === "NeeDo room 8"
            ),
            "created Request order snapshots are incomplete"
          );
          assert(
            participants.every(
              (participant: any) =>
                participant.activeReservationKey === null && participant.bookedAt !== null
            ),
            "participant temporary reservations were not transferred"
          );
          const slotById = new Map(slots.map((slot: any) => [slot.id, slot]));
          assert(
            fixture.participantSlotIds.every(
              (id) => slotById.get(id)?.bookedCount === 1 && slotById.get(id)?.status === "BOOKED"
            ) &&
              slotById.get(fixture.oldSlotId)?.bookedCount === 0 &&
              slotById.get(fixture.oldSlotId)?.status === "AVAILABLE",
            "slot capacity transfer is incorrect"
          );
          assert(
            bookingEvents.length === 1 && notifications.length === 2 && audits.length === 1,
            "event, notification, or audit cardinality is incorrect"
          );
          const sensitiveEvidence = JSON.stringify({
            event: bookingEvents[0]?.payload,
            audit: audits[0]?.metadata
          });
          assert(!/(?:email|phone|addressLine|NeeDo room)/iu.test(sensitiveEvidence), "event or audit metadata contains private fields");

          const financeAfter = await captureFinance();
          const publicationFinanceUnchanged =
            sameValue(financeBefore.wallet, financeAfter.wallet) &&
            sameValue(financeBefore.hold, financeAfter.hold) &&
            sameValue(financeBefore.requestFinancial, financeAfter.requestFinancial) &&
            sameValue(financeBefore.calculation, financeAfter.calculation);
          const walletLedgerReconciliationUnchanged =
            financeBefore.ledgerTransactions === financeAfter.ledgerTransactions &&
            financeBefore.walletLedgers === financeAfter.walletLedgers &&
            financeBefore.reconciliations === financeAfter.reconciliations &&
            financeBefore.orderFinancials === financeAfter.orderFinancials;
          assert(publicationFinanceUnchanged, "conversion changed publication finance");
          assert(walletLedgerReconciliationUnchanged, "conversion created wallet, ledger, reconciliation, or order finance state");

          report = {
            databaseName: target.databaseName,
            exchangePostId: fixture.exchangePostId,
            createdOrderCount: createdOrders.length,
            participantOrderCountMatches,
            ordinaryPendingReplaced,
            sameBatchPendingCoexists,
            idempotentReplay,
            idempotencyConflictRejected,
            staleVersionRejected,
            slotFailureRolledBack,
            publicationFinanceUnchanged,
            walletLedgerReconciliationUnchanged
          };
          throw new RollbackVerifiedExchangeBookingConversion();
        },
        { maxWait: 10_000, timeout: 60_000 }
      );
    } catch (error) {
      if (!(error instanceof RollbackVerifiedExchangeBookingConversion)) throw error;
    }

    const finalReport = report as Record<string, unknown> | null;
    assert(finalReport, "matched-booking checker did not produce a report");
    const cleanupVerified =
      (await countExchangeBookingMarkerRows(prisma, marker)) === 0 &&
      (createdPostId === null ||
        (await prisma.exchangePost.count({ where: { id: createdPostId } })) === 0);
    assert(cleanupVerified, "rollback left marker-owned booking conversion rows");
    console.log(JSON.stringify({ ...finalReport, cleanupVerified }, null, 2));
  } finally {
    await disconnectPrisma();
  }
}

if (process.argv[1]?.endsWith("check-exchange-booking-conversion-flow.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}
