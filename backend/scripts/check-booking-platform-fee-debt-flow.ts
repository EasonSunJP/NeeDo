import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type {
  BookingUserRewardExpiryRecord,
  BookingUserRewardExpiryRepositoryPort,
  BookingUserRewardExpiryTransactionClient
} from "../src/services/booking-user-reward-expiry.service";

const FEE_NDP = 500;
const REWARD_NDP = 100;
const LOW_BALANCE_NDP = 120;
const SHORTFALL_NDP = FEE_NDP - LOW_BALANCE_NDP;
const SERVICE_AMOUNT_JPY = 8_800;
const BLOCKED_ENVIRONMENTS = new Set(["staging", "prod", "production"]);

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const normalizeEnvironment = (value: string | undefined): string =>
  value?.trim().toLowerCase() ?? "";

const assertSafeLocalDatabase = (): string => {
  assert(
    !BLOCKED_ENVIRONMENTS.has(normalizeEnvironment(process.env.NODE_ENV)),
    "booking platform fee debt check rejects staging and production node environments"
  );
  assert(
    !BLOCKED_ENVIRONMENTS.has(normalizeEnvironment(process.env.DEPLOY_ENV)),
    "booking platform fee debt check rejects staging and production deploy environments"
  );
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
    "booking platform fee debt check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production|staging)([_-]|$)/i.test(databaseName),
    "booking platform fee debt check rejects production-looking database names"
  );
  return databaseName;
};

interface FixtureState {
  marker: string;
  orderMarker: string;
  userIds: number[];
  customerUserIds: number[];
  shopIds: number[];
  serviceIds: number[];
  slotIds: number[];
  bookingIds: number[];
  categoryId: number | null;
}

interface ScenarioFixture {
  shopId: number;
  serviceId: number;
  technicianProfileId: number | null;
}

interface BookingFixture {
  bookingOrderId: number;
  shopId: number;
  serviceId: number;
  technicianProfileId: number | null;
  scheduledStartAt: Date;
  customerUserId: number;
  actorUserId: number;
  serviceAmountJpy: number;
  orderType: "booking";
}

class FixtureOwnedBookingUserRewardExpiryRepository
  implements BookingUserRewardExpiryRepositoryPort
{
  public constructor(
    private readonly inner: BookingUserRewardExpiryRepositoryPort,
    private readonly allowedFinancialIds: ReadonlySet<number>
  ) {}

  public async listExpiryCandidateIds(input: {
    now: Date;
    batchSize: number;
    afterId: number;
  }): Promise<number[]> {
    const candidateIds = await this.inner.listExpiryCandidateIds(input);
    return candidateIds.filter((id) => this.allowedFinancialIds.has(id));
  }

  public runInTransaction<T>(
    handler: (
      repository: BookingUserRewardExpiryRepositoryPort,
      transactionClient?: BookingUserRewardExpiryTransactionClient
    ) => Promise<T>
  ): Promise<T> {
    return this.inner.runInTransaction((repository, transactionClient) =>
      handler(
        new FixtureOwnedBookingUserRewardExpiryRepository(
          repository,
          this.allowedFinancialIds
        ),
        transactionClient
      )
    );
  }

  public lockReward(id: number): Promise<BookingUserRewardExpiryRecord | null> {
    assert(this.allowedFinancialIds.has(id), "expiry attempted to lock a non-marker financial row");
    return this.inner.lockReward(id);
  }

  public expireReward(input: { id: number; expectedDeadlineAt: Date }): Promise<boolean> {
    assert(
      this.allowedFinancialIds.has(input.id),
      "expiry attempted to mutate a non-marker financial row"
    );
    return this.inner.expireReward(input);
  }

  public createAuditLog(input: {
    action: "booking.user_reward.expired";
    financialId: number;
    bookingOrderId: number;
    deadlineAt: Date;
    expiredAt: Date;
  }): Promise<void> {
    assert(
      this.allowedFinancialIds.has(input.financialId),
      "expiry attempted to audit a non-marker financial row"
    );
    return this.inner.createAuditLog(input);
  }
}

const captureBaseline = async (prisma: PrismaClient) => {
  const [
    users,
    customerProfiles,
    technicianProfiles,
    shops,
    categories,
    services,
    slots,
    bookings,
    policies,
    calculations,
    financials,
    wallets,
    holds,
    transactions,
    entries,
    reconciliations,
    adjustments,
    audits
  ] = await Promise.all([
    prisma.user.count(),
    prisma.customerProfile.count(),
    prisma.technicianProfile.count(),
    prisma.shop.count(),
    prisma.category.count(),
    prisma.service.count(),
    prisma.scheduleSlot.count(),
    prisma.bookingOrder.count(),
    prisma.shopPlatformFeePolicy.count(),
    prisma.feeCalculationLog.count(),
    prisma.orderFinancial.aggregate({
      _count: { _all: true },
      _sum: {
        bPlatformFeeHoldNdp: true,
        bPlatformFeeActualNdp: true,
        userRewardNdp: true,
        platformFeeShortfallNdp: true,
        platformFeeOutstandingNdp: true,
        userRewardEligibleNdp: true
      }
    }),
    prisma.wallet.aggregate({
      _count: { _all: true },
      _sum: { availableBalance: true, frozenBalance: true }
    }),
    prisma.walletHold.aggregate({
      _count: { _all: true },
      _sum: { holdAmountNdp: true, capturedAmountNdp: true, releasedAmountNdp: true }
    }),
    prisma.ledgerTransaction.count(),
    prisma.walletLedger.aggregate({
      _count: { _all: true },
      _sum: { availableDelta: true, frozenDelta: true }
    }),
    prisma.financeReconciliation.count(),
    prisma.walletAdjustmentRequest.count(),
    prisma.auditLog.count()
  ]);

  return {
    users,
    customerProfiles,
    technicianProfiles,
    shops,
    categories,
    services,
    slots,
    bookings,
    policies,
    calculations,
    financials,
    wallets,
    holds,
    transactions,
    entries,
    reconciliations,
    adjustments,
    audits
  };
};

const assertExactBaseline = (before: unknown, after: unknown): void => {
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    `marker cleanup did not restore the exact database baseline: ${JSON.stringify({ before, after })}`
  );
};

const assertMarkerOwnership = async (
  prisma: PrismaClient,
  fixture: FixtureState
): Promise<void> => {
  const [users, shops, services, slots, bookings] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: fixture.userIds } }, select: { id: true, email: true } }),
    prisma.shop.findMany({ where: { id: { in: fixture.shopIds } }, select: { id: true, name: true } }),
    prisma.service.findMany({
      where: { id: { in: fixture.serviceIds } },
      select: { id: true, name: true }
    }),
    prisma.scheduleSlot.findMany({
      where: { id: { in: fixture.slotIds } },
      select: { id: true, shopId: true }
    }),
    prisma.bookingOrder.findMany({
      where: { id: { in: fixture.bookingIds } },
      select: { id: true, orderNo: true }
    })
  ]);
  assert(users.length === fixture.userIds.length, "marker user ownership is incomplete");
  assert(
    users.every((user) => user.email.startsWith(fixture.marker)),
    "cleanup refused a non-marker user"
  );
  assert(shops.length === fixture.shopIds.length, "marker shop ownership is incomplete");
  assert(
    shops.every((shop) => shop.name.startsWith(fixture.marker)),
    "cleanup refused a non-marker shop"
  );
  assert(services.length === fixture.serviceIds.length, "marker service ownership is incomplete");
  assert(
    services.every((service) => service.name.startsWith(fixture.marker)),
    "cleanup refused a non-marker service"
  );
  assert(slots.length === fixture.slotIds.length, "marker schedule ownership is incomplete");
  assert(
    slots.every((slot) => fixture.shopIds.includes(slot.shopId)),
    "cleanup refused a schedule outside marker shops"
  );
  assert(bookings.length === fixture.bookingIds.length, "marker booking ownership is incomplete");
  assert(
    bookings.every((booking) => booking.orderNo.startsWith(fixture.orderMarker)),
    "cleanup refused a non-marker booking"
  );
};

const cleanupMarkerFixture = async (
  prisma: PrismaClient,
  fixture: FixtureState
): Promise<void> => {
  if (fixture.userIds.length === 0) {
    return;
  }
  await assertMarkerOwnership(prisma, fixture);
  await prisma.$transaction(async (transaction) => {
    const financialIds = (
      await transaction.orderFinancial.findMany({
        where: { bookingOrderId: { in: fixture.bookingIds } },
        select: { id: true }
      })
    ).map((row) => row.id);
    const adjustmentIds = (
      await transaction.walletAdjustmentRequest.findMany({
        where: { requestedById: { in: fixture.userIds } },
        select: { id: true }
      })
    ).map((row) => row.id);
    const transactionIds = (
      await transaction.ledgerTransaction.findMany({
        where: {
          OR: [
            { referenceType: "booking_order", referenceId: { in: fixture.bookingIds } },
            {
              referenceType: "wallet_adjustment_request",
              referenceId: { in: adjustmentIds }
            }
          ]
        },
        select: { id: true }
      })
    ).map((row) => row.id);
    const walletIds = (
      await transaction.wallet.findMany({
        where: {
          OR: [
            { ownerType: "USER", ownerId: { in: fixture.userIds } },
            { ownerType: "SHOP", ownerId: { in: fixture.shopIds } }
          ]
        },
        select: { id: true }
      })
    ).map((row) => row.id);

    await transaction.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: fixture.userIds } },
          { targetType: "ledger_transaction", targetId: { in: transactionIds } },
          { targetType: "wallet_adjustment_request", targetId: { in: adjustmentIds } },
          { targetType: "order_financial", targetId: { in: financialIds } }
        ]
      }
    });
    await transaction.walletAdjustmentRequest.deleteMany({ where: { id: { in: adjustmentIds } } });
    await transaction.financeReconciliation.deleteMany({
      where: { transactionId: { in: transactionIds } }
    });
    await transaction.walletLedger.deleteMany({ where: { transactionId: { in: transactionIds } } });
    await transaction.ledgerTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    await transaction.walletHold.deleteMany({
      where: { bookingOrderId: { in: fixture.bookingIds } }
    });
    await transaction.orderFinancial.deleteMany({
      where: { bookingOrderId: { in: fixture.bookingIds } }
    });
    await transaction.feeCalculationLog.deleteMany({
      where: { bookingOrderId: { in: fixture.bookingIds } }
    });
    await transaction.bookingOrder.deleteMany({ where: { id: { in: fixture.bookingIds } } });
    await transaction.scheduleSlot.deleteMany({ where: { id: { in: fixture.slotIds } } });
    await transaction.wallet.deleteMany({ where: { id: { in: walletIds } } });
    await transaction.shopPlatformFeePolicy.deleteMany({
      where: { shopId: { in: fixture.shopIds } }
    });
    await transaction.service.deleteMany({ where: { id: { in: fixture.serviceIds } } });
    await transaction.technicianProfile.deleteMany({
      where: { userId: { in: fixture.userIds } }
    });
    await transaction.customerProfile.deleteMany({
      where: { userId: { in: fixture.userIds } }
    });
    await transaction.shop.deleteMany({ where: { id: { in: fixture.shopIds } } });
    if (fixture.categoryId !== null) {
      await transaction.category.deleteMany({ where: { id: fixture.categoryId } });
    }
    await transaction.user.deleteMany({ where: { id: { in: fixture.userIds } } });
  });
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeLocalDatabase();
  const [
    { AuditLogRepository },
    { BookingUserRewardExpiryRepository },
    { FeeRuleRepository },
    { LedgerRepository },
    { PlatformFeePolicyRepository },
    { AuditLogService },
    { BookingUserRewardExpiryService },
    { FeeCalculationService },
    { LedgerService },
    { PlatformFeePolicyService },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/audit-log.repository"),
    import("../src/repositories/booking-user-reward-expiry.repository"),
    import("../src/repositories/fee-rule.repository"),
    import("../src/repositories/ledger.repository"),
    import("../src/repositories/platform-fee-policy.repository"),
    import("../src/services/audit-log.service"),
    import("../src/services/booking-user-reward-expiry.service"),
    import("../src/services/fee-calculation.service"),
    import("../src/services/ledger.service"),
    import("../src/services/platform-fee-policy.service"),
    import("../src/prisma/client")
  ]);
  const marker = `booking-platform-fee-debt-${Date.now()}-${process.pid}`;
  const orderMarker = `BPF${Date.now()}${process.pid}`;
  const fixture: FixtureState = {
    marker,
    orderMarker,
    userIds: [],
    customerUserIds: [],
    shopIds: [],
    serviceIds: [],
    slotIds: [],
    bookingIds: [],
    categoryId: null
  };
  const baselineBefore = await captureBaseline(prisma);
  const now = new Date();
  let orderCounter = 0;
  let accountCounter = 0;

  try {
    const globalRuleSet = await prisma.platformFeeRuleSet.findFirst({
      where: {
        familyCode: "booking_default",
        status: "active",
        deletedAt: null,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
      },
      include: { rules: { where: { deletedAt: null, status: "active" } } },
      orderBy: { version: "desc" }
    });
    assert(globalRuleSet, "active booking_default platform fee rule set is required");
    const bookingFeeRule = globalRuleSet.rules.find(
      (rule) => rule.feeType === "b_platform_fee" && rule.orderType === "booking"
    );
    const rewardRule = globalRuleSet.rules.find(
      (rule) => rule.feeType === "user_reward" && rule.orderType === "booking"
    );
    assert(bookingFeeRule?.baseAmountNdp === FEE_NDP, "global booking fee must be 500 NDP");
    assert(rewardRule?.baseAmountNdp === REWARD_NDP, "global user reward must be 100 NDP");

    const passwordHash = await hash("BookingPlatformFeeDebtFlow.2026!", 12);
    const createUser = async (label: string, customer = false) => {
      accountCounter += 1;
      const accountNo = `${accountCounter}${String(Date.now()).slice(-9)}`;
      const user = await prisma.user.create({
        data: {
          needoId: `u${accountNo}`,
          accountNo,
          primaryIdentityType: "U",
          email: `${marker}-${label}@needo.test`,
          username: `${marker} ${label}`,
          passwordHash,
          ...(customer
            ? {
                customerProfile: {
                  create: { displayName: `${marker} ${label}`, city: "Tokyo" }
                }
              }
            : {})
        }
      });
      fixture.userIds.push(user.id);
      if (customer) fixture.customerUserIds.push(user.id);
      return user;
    };

    const owner = await createUser("owner");
    const technicianUser = await createUser("technician");
    const immediateCustomer = await createUser("customer-immediate", true);
    const delayedCustomer = await createUser("customer-delayed", true);
    const expiredCustomer = await createUser("customer-expired", true);
    const technicianProfile = await prisma.technicianProfile.create({
      data: {
        userId: technicianUser.id,
        displayName: `${marker} technician`,
        city: "Tokyo",
        status: "published"
      }
    });
    const category = await prisma.category.create({
      data: { code: marker, name: `${marker} category` }
    });
    fixture.categoryId = category.id;

    const createScenario = async (input: {
      label: string;
      feeEnabled: boolean;
      payerType: "SHOP" | "TECHNICIAN";
      technician?: boolean;
      initialBalance?: number;
    }): Promise<ScenarioFixture> => {
      const shop = await prisma.shop.create({
        data: {
          ownerUserId: owner.id,
          name: `${marker} ${input.label}`,
          city: "Tokyo",
          address: `${marker} local acceptance address`,
          status: "published"
        }
      });
      fixture.shopIds.push(shop.id);
      const service = await prisma.service.create({
        data: {
          categoryId: category.id,
          shopId: shop.id,
          technicianProfileId: input.technician ? technicianProfile.id : null,
          name: `${marker} ${input.label} service`,
          city: "Tokyo",
          priceAmount: SERVICE_AMOUNT_JPY,
          durationMinutes: 60,
          status: "published"
        }
      });
      fixture.serviceIds.push(service.id);
      await prisma.shopPlatformFeePolicy.create({
        data: {
          shopId: shop.id,
          feeEnabled: input.feeEnabled,
          payerType: input.payerType,
          version: 1,
          createdById: owner.id,
          updatedById: owner.id
        }
      });
      if (input.initialBalance !== undefined) {
        await prisma.wallet.create({
          data: {
            ownerType: input.payerType === "TECHNICIAN" ? "USER" : "SHOP",
            ownerId: input.payerType === "TECHNICIAN" ? technicianUser.id : shop.id,
            availableBalance: input.initialBalance,
            frozenBalance: 0
          }
        });
      }
      return {
        shopId: shop.id,
        serviceId: service.id,
        technicianProfileId: input.technician ? technicianProfile.id : null
      };
    };

    const disabled = await createScenario({
      label: "disabled",
      feeEnabled: false,
      payerType: "SHOP"
    });
    const immediate = await createScenario({
      label: "shop-immediate",
      feeEnabled: true,
      payerType: "SHOP",
      initialBalance: 800
    });
    const technician = await createScenario({
      label: "technician",
      feeEnabled: true,
      payerType: "TECHNICIAN",
      technician: true,
      initialBalance: 700
    });
    const cancellation = await createScenario({
      label: "cancellation",
      feeEnabled: true,
      payerType: "SHOP",
      initialBalance: LOW_BALANCE_NDP
    });
    const delayed = await createScenario({
      label: "delayed",
      feeEnabled: true,
      payerType: "SHOP",
      initialBalance: LOW_BALANCE_NDP
    });
    const expired = await createScenario({
      label: "expired",
      feeEnabled: true,
      payerType: "SHOP",
      initialBalance: LOW_BALANCE_NDP
    });

    const createBooking = async (
      scenario: ScenarioFixture,
      customerUserId: number,
      acceptedAt = now
    ): Promise<BookingFixture> => {
      orderCounter += 1;
      const startsAt = new Date(acceptedAt.getTime() + 24 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const slot = await prisma.scheduleSlot.create({
        data: {
          serviceId: scenario.serviceId,
          shopId: scenario.shopId,
          technicianProfileId: scenario.technicianProfileId,
          startsAt,
          endsAt,
          capacity: 1,
          status: "AVAILABLE"
        }
      });
      fixture.slotIds.push(slot.id);
      const order = await prisma.bookingOrder.create({
        data: {
          orderNo: `${orderMarker}${String(orderCounter).padStart(2, "0")}`,
          customerUserId,
          serviceId: scenario.serviceId,
          shopId: scenario.shopId,
          technicianProfileId: scenario.technicianProfileId,
          scheduleSlotId: slot.id,
          priceAmount: SERVICE_AMOUNT_JPY,
          startsAt,
          endsAt,
          serviceNameSnapshot: `${marker} service`,
          servicePriceSnapshot: SERVICE_AMOUNT_JPY,
          serviceDurationSnapshot: 60
        }
      });
      fixture.bookingIds.push(order.id);
      return {
        bookingOrderId: order.id,
        orderType: "booking",
        shopId: scenario.shopId,
        technicianProfileId: scenario.technicianProfileId,
        serviceId: scenario.serviceId,
        serviceAmountJpy: SERVICE_AMOUNT_JPY,
        scheduledStartAt: startsAt,
        customerUserId,
        actorUserId: owner.id
      };
    };

    const policyService = new PlatformFeePolicyService(
      new PlatformFeePolicyRepository(prisma),
      new AuditLogService(new AuditLogRepository(prisma))
    );
    const ledger = new LedgerService(
      new LedgerRepository(prisma),
      new FeeCalculationService(new FeeRuleRepository(prisma)),
      undefined,
      () => now,
      policyService
    );

    const disabledBooking = await createBooking(disabled, immediateCustomer.id);
    const disabledCountsBefore = await Promise.all([
      prisma.wallet.count(),
      prisma.walletHold.count(),
      prisma.ledgerTransaction.count(),
      prisma.walletLedger.count()
    ]);
    await ledger.freezeBookingAcceptance({ ...disabledBooking, acceptedAt: now });
    await ledger.settleBookingCompletion({ ...disabledBooking, completedAt: now });
    const disabledCountsAfter = await Promise.all([
      prisma.wallet.count(),
      prisma.walletHold.count(),
      prisma.ledgerTransaction.count(),
      prisma.walletLedger.count()
    ]);
    assert(
      JSON.stringify(disabledCountsAfter) === JSON.stringify(disabledCountsBefore),
      "disabled policy zero mutation: wallet or ledger state changed"
    );
    const disabledFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: disabledBooking.bookingOrderId }
    });
    assert(
      disabledFinancial.platformFeeEnabledSnapshot === false &&
        disabledFinancial.bPlatformFeeActualNdp === 0 &&
        disabledFinancial.userRewardStatus === "DISABLED",
      "disabled policy zero mutation: financial snapshot is incorrect"
    );

    const immediateBooking = await createBooking(immediate, immediateCustomer.id);
    await ledger.freezeBookingAcceptance({ ...immediateBooking, acceptedAt: now });
    const immediateAccepted = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: immediateBooking.bookingOrderId }
    });
    assert(
      immediateAccepted.platformFeeWalletOwnerType === "SHOP" &&
        immediateAccepted.platformFeeWalletOwnerId === immediate.shopId &&
        immediateAccepted.platformFeeAmountNdpSnapshot === FEE_NDP,
      "shop payer snapshot is incorrect"
    );
    await ledger.settleBookingCompletion({ ...immediateBooking, completedAt: now });
    const immediateTransactions = await prisma.ledgerTransaction.count({
      where: { referenceType: "booking_order", referenceId: immediateBooking.bookingOrderId }
    });
    await ledger.settleBookingCompletion({ ...immediateBooking, completedAt: now });
    const immediateTransactionsAfterReplay = await prisma.ledgerTransaction.count({
      where: { referenceType: "booking_order", referenceId: immediateBooking.bookingOrderId }
    });
    const immediateRewardWallet = await prisma.wallet.findUniqueOrThrow({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: immediateCustomer.id,
          currency: "NDP"
        }
      }
    });
    assert(
      immediateRewardWallet.availableBalance === REWARD_NDP,
      "immediate reward was not exactly 100 NDP"
    );
    assert(
      immediateTransactionsAfterReplay === immediateTransactions,
      "idempotent replay created another completion transaction"
    );

    const technicianBooking = await createBooking(technician, immediateCustomer.id);
    await ledger.freezeBookingAcceptance({ ...technicianBooking, acceptedAt: now });
    const technicianFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: technicianBooking.bookingOrderId }
    });
    assert(
      technicianFinancial.platformFeeWalletOwnerType === "USER" &&
        technicianFinancial.platformFeeWalletOwnerId === technicianUser.id &&
        technicianFinancial.platformFeePayerType === "technician",
      "technician payer snapshot is incorrect"
    );
    await ledger.releaseBookingHold(technicianBooking);

    const cancellationBooking = await createBooking(cancellation, immediateCustomer.id);
    const cancellationWalletBefore = await prisma.wallet.findUniqueOrThrow({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "SHOP",
          ownerId: cancellation.shopId,
          currency: "NDP"
        }
      }
    });
    const warning = await ledger
      .freezeBookingAcceptance({ ...cancellationBooking, acceptedAt: now })
      .catch((error: unknown) => error);
    assert(
      typeof warning === "object" && warning !== null && "code" in warning && warning.code === 40935,
      "insufficient first-attempt rollback: confirmation warning was not returned"
    );
    const warningData = (warning as { data?: { previewVersion?: string } }).data;
    assert(
      typeof warningData?.previewVersion === "string",
      "insufficient first-attempt rollback: preview version is missing"
    );
    const [failedFinancial, failedHoldCount, failedTransactionCount, cancellationWalletAfterFailure] =
      await Promise.all([
        prisma.orderFinancial.findUnique({
          where: { bookingOrderId: cancellationBooking.bookingOrderId }
        }),
        prisma.walletHold.count({ where: { bookingOrderId: cancellationBooking.bookingOrderId } }),
        prisma.ledgerTransaction.count({
          where: { referenceType: "booking_order", referenceId: cancellationBooking.bookingOrderId }
        }),
        prisma.wallet.findUniqueOrThrow({ where: { id: cancellationWalletBefore.id } })
      ]);
    assert(
      failedFinancial === null &&
        failedHoldCount === 0 &&
        failedTransactionCount === 0 &&
        cancellationWalletAfterFailure.availableBalance === LOW_BALANCE_NDP &&
        cancellationWalletAfterFailure.frozenBalance === 0,
      "insufficient first-attempt rollback: partial financial state remained"
    );
    await ledger.freezeBookingAcceptance({
      ...cancellationBooking,
      acceptedAt: now,
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: `${marker}-cancel-confirmation`,
        previewVersion: warningData.previewVersion
      }
    });
    const negativeWallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: cancellationWalletBefore.id }
    });
    assert(
      negativeWallet.availableBalance === -SHORTFALL_NDP &&
        negativeWallet.frozenBalance === FEE_NDP,
      "explicit negative balance was not created after confirmation"
    );
    await ledger.releaseBookingHold(cancellationBooking);
    const reversedWallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: cancellationWalletBefore.id }
    });
    const reversedFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: cancellationBooking.bookingOrderId }
    });
    assert(
      reversedWallet.availableBalance === LOW_BALANCE_NDP &&
        reversedWallet.frozenBalance === 0 &&
        reversedFinancial.platformFeeOutstandingNdp === 0 &&
        reversedFinancial.userRewardStatus === "DISABLED",
      "cancellation reversal did not restore the original payer state"
    );

    const operatorActor: AuthenticatedAccessContext = {
      userId: owner.id,
      email: owner.email,
      accessTokenJti: `${marker}-operator`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      roles: ["operator"],
      permissions: ["backoffice:wallet-adjustment:review"],
      currentIdentityType: "platform_admin",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null
    };
    const merchantActor = (shopId: number): AuthenticatedAccessContext => ({
      userId: owner.id,
      email: owner.email,
      accessTokenJti: `${marker}-merchant-${shopId}`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      roles: ["merchant_owner"],
      permissions: ["wallet:adjustment:create"],
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: shopId
    });
    const acceptWithDebt = async (booking: BookingFixture, confirmationLabel: string) => {
      const debtWarning = await ledger
        .freezeBookingAcceptance({ ...booking, acceptedAt: now })
        .catch((error: unknown) => error);
      const previewVersion = (debtWarning as { data?: { previewVersion?: string } }).data
        ?.previewVersion;
      assert(typeof previewVersion === "string", `${confirmationLabel} preview is missing`);
      await ledger.freezeBookingAcceptance({
        ...booking,
        acceptedAt: now,
        insufficientBalanceConfirmation: {
          confirmed: true,
          idempotencyKey: `${marker}-${confirmationLabel}`,
          previewVersion
        }
      });
    };
    const approveTopup = async (shopId: number, label: string) => {
      const request = await ledger.createWalletAdjustmentRequest(merchantActor(shopId), {
        type: "topup",
        amountNdp: SHORTFALL_NDP,
        idempotencyKey: `${marker}-${label}-topup`,
        bankReference: `${orderMarker}-${label}`,
        note: `${marker} approved debt top-up`
      });
      return ledger.reviewWalletAdjustmentRequest(operatorActor, request.id, {
        action: "approve",
        note: `${marker} local acceptance approval`
      });
    };

    const delayedBooking = await createBooking(delayed, delayedCustomer.id);
    await acceptWithDebt(delayedBooking, "delayed-confirmation");
    await ledger.settleBookingCompletion({ ...delayedBooking, completedAt: now });
    const pendingFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: delayedBooking.bookingOrderId }
    });
    assert(
      pendingFinancial.userRewardStatus === "PENDING" &&
        pendingFinancial.userRewardNdp === 0 &&
        pendingFinancial.userRewardEligibleNdp === REWARD_NDP &&
        pendingFinancial.platformFeeOutstandingNdp === SHORTFALL_NDP,
      "delayed reward after approved top-up: pending state is incorrect"
    );
    const delayedTopup = await approveTopup(delayed.shopId, "delayed");
    const delayedFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: delayedBooking.bookingOrderId }
    });
    const delayedRewardWallet = await prisma.wallet.findUniqueOrThrow({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: delayedCustomer.id,
          currency: "NDP"
        }
      }
    });
    assert(
      delayedFinancial.platformFeeDebtStatus === "SETTLED" &&
        delayedFinancial.platformFeeOutstandingNdp === 0 &&
        delayedFinancial.userRewardStatus === "PAID" &&
        delayedFinancial.userRewardNdp === REWARD_NDP &&
        delayedRewardWallet.availableBalance === REWARD_NDP,
      "delayed reward after approved top-up was not granted"
    );
    await ledger.reviewWalletAdjustmentRequest(operatorActor, delayedTopup.id, {
      action: "approve",
      note: `${marker} idempotent replay`
    });
    const delayedRewardWalletAfterReplay = await prisma.wallet.findUniqueOrThrow({
      where: { id: delayedRewardWallet.id }
    });
    assert(
      delayedRewardWalletAfterReplay.availableBalance === REWARD_NDP,
      "idempotent replay granted the delayed reward twice"
    );

    const expiredCompletedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const expiredBooking = await createBooking(expired, expiredCustomer.id, expiredCompletedAt);
    await acceptWithDebt(expiredBooking, "expired-confirmation");
    await ledger.settleBookingCompletion({
      ...expiredBooking,
      completedAt: expiredCompletedAt
    });
    const expirableFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: expiredBooking.bookingOrderId }
    });
    const allowedFinancialIds = new Set([expirableFinancial.id]);
    const expiryService = new BookingUserRewardExpiryService(
      new FixtureOwnedBookingUserRewardExpiryRepository(
        new BookingUserRewardExpiryRepository(prisma),
        allowedFinancialIds
      )
    );
    const expirySummary = await expiryService.expireDue({ now, batchSize: 100 });
    assert(
      expirySummary.scanned === 1 && expirySummary.expired === 1 && expirySummary.failed === 0,
      "expired reward worker did not expire exactly the marker reward"
    );
    await approveTopup(expired.shopId, "expired");
    const expiredFinancial = await prisma.orderFinancial.findUniqueOrThrow({
      where: { bookingOrderId: expiredBooking.bookingOrderId }
    });
    const expiredRewardWallet = await prisma.wallet.findUnique({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: expiredCustomer.id,
          currency: "NDP"
        }
      }
    });
    assert(
      expiredFinancial.platformFeeDebtStatus === "SETTLED" &&
        expiredFinancial.userRewardStatus === "EXPIRED" &&
        expiredFinancial.userRewardNdp === 0 &&
        expiredRewardWallet === null,
      "expired reward was incorrectly granted by a late top-up"
    );

    console.log(
      JSON.stringify(
        {
          database: databaseName,
          marker,
          scenarios: {
            disabledPolicyZeroMutation: true,
            shopPayerSnapshot: true,
            technicianPayerSnapshot: true,
            insufficientAttemptRolledBack: true,
            explicitNegativeBalance: true,
            cancellationReversed: true,
            immediateRewardNdp: REWARD_NDP,
            delayedRewardAfterApprovedTopupNdp: REWARD_NDP,
            expiredRewardNdp: 0,
            idempotentReplay: true
          },
          created: {
            users: fixture.userIds.length,
            shops: fixture.shopIds.length,
            bookings: fixture.bookingIds.length
          },
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    await cleanupMarkerFixture(prisma, fixture);
    const baselineAfterCleanup = await captureBaseline(prisma);
    assertExactBaseline(baselineBefore, baselineAfterCleanup);
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
