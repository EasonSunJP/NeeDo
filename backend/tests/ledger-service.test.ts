import { ERROR_CODES } from "../src/constants/error-codes";
import {
  LedgerService,
  type OrderFinancialUpsertInput,
  type LedgerCurrency,
  type LedgerRepositoryPort,
  type LedgerTransactionPayload,
  type WalletHoldPayload,
  type WalletLedgerPayload,
  type WalletOwnerType,
  type WalletPayload
} from "../src/services/ledger.service";
import type {
  FeeCalculationInput,
  FeeCalculationResult
} from "../src/services/fee-calculation.service";
import type { BookingPlatformFeePolicySnapshot } from "../src/services/platform-fee-policy.service";

const now = new Date("2026-05-25T00:00:00.000Z");
type CreateWalletHoldInput = Parameters<
  NonNullable<LedgerRepositoryPort["createWalletHold"]>
>[0];
const bookingInput = (input: {
  bookingOrderId: number;
  shopId: number;
  actorUserId: number | null;
  customerUserId?: number;
  orderType?: "booking" | "request";
  technicianProfileId?: number | null;
}) => ({
  bookingOrderId: input.bookingOrderId,
  orderType: input.orderType ?? ("booking" as const),
  shopId: input.shopId,
  serviceAmountJpy: 8800,
  scheduledStartAt: now,
  acceptedAt: now,
  customerUserId: input.customerUserId,
  technicianProfileId: input.technicianProfileId,
  actorUserId: input.actorUserId
});

const createPolicyResolver = (overrides: Partial<BookingPlatformFeePolicySnapshot> = {}) => ({
  resolveForBookingSettlement: jest.fn(
    async (): Promise<BookingPlatformFeePolicySnapshot> => ({
      shopId: 10,
      feeEnabled: true,
      payerType: "shop",
      policyVersion: 0,
      policySource: "default",
      globalAmountNdp: 500,
      globalVersion: 0,
      globalSource: "default",
      ...overrides
    })
  )
});

const createFeeService = (
  overrides: Partial<Record<FeeCalculationInput["feeType"], number>> = {}
) => ({
  calculateFee: jest.fn(async (input: FeeCalculationInput): Promise<FeeCalculationResult> => {
    const calculatedFeeNdp =
      overrides[input.feeType] ??
      (input.feeType === "user_reward" ? 100 : input.feeType === "penalty" ? 500 : 500);
    const finalFeeNdp = input.waiveReason === "shop_policy_disabled" ? 0 : calculatedFeeNdp;
    const holdAmountNdp =
      input.feeType === "b_platform_fee" && input.stage === "hold"
        ? finalFeeNdp === 0
          ? 0
          : Math.max(500, finalFeeNdp)
        : finalFeeNdp;

    return {
      bookingOrderId: input.bookingOrderId ?? null,
      orderType: input.orderType,
      stage: input.stage,
      feeType: input.feeType,
      payerType:
        input.payerOverride?.payerType ?? (input.feeType === "user_reward" ? "platform" : "shop"),
      payerId: input.payerOverride?.payerId ?? input.shopId ?? null,
      baseFeeNdp: calculatedFeeNdp,
      tierAdjustmentNdp: 0,
      timeAdjustmentNdp: 0,
      campaignDiscountNdp: 0,
      finalFeeNdp,
      holdAmountNdp,
      completedOrderOrdinalInPeriod: input.stage === "capture" ? 101 : null,
      appliedRuleIds: [`test:${input.feeType}`],
      explanation: [
        `${input.feeType}=${finalFeeNdp}`,
        ...(input.waiveReason === "shop_policy_disabled"
          ? ["Waived by shop platform-fee policy"]
          : [])
      ],
      calculationLogId: 900 + (input.bookingOrderId ?? 0)
    };
  })
});

class InMemoryLedgerRepository implements LedgerRepositoryPort {
  public readonly accountClassifications = new Map<number, boolean>();
  public readonly wallets = new Map<string, WalletPayload>();
  public readonly transactions = new Map<string, LedgerTransactionPayload>();
  public readonly holds = new Map<string, WalletHoldPayload>();
  public readonly financials = new Map<number, OrderFinancialUpsertInput>();
  public readonly entries: WalletLedgerPayload[] = [];
  public readonly reconciliationRows: Array<{ transactionId: number; expectedAmount: number }> = [];
  public readonly auditRows: Array<{
    action: string;
    actorUserId: number | null;
    targetId: number;
    metadata?: unknown;
  }> = [];
  public readonly technicianUsers = new Map<number, number>();
  public readonly lockEvents: string[] = [];
  public upsertFinancialCallCount = 0;
  public unlockedSnapshotLookupCount = 0;
  public lockedSnapshotLookupCount = 0;

  private walletId = 1;
  private transactionId = 1;
  private entryId = 1;
  private holdId = 1;

  public seedWallet(input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    availableBalance: number;
    frozenBalance?: number;
    currency?: LedgerCurrency;
  }): WalletPayload {
    const wallet: WalletPayload = {
      id: this.walletId++,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      currency: input.currency ?? "NDP",
      availableBalance: input.availableBalance,
      frozenBalance: input.frozenBalance ?? 0,
      createdAt: now,
      updatedAt: now
    };
    this.wallets.set(this.walletKey(input.ownerType, input.ownerId, wallet.currency), wallet);

    return wallet;
  }

  public async runInTransaction<T>(
    handler: (repository: LedgerRepositoryPort) => Promise<T>
  ): Promise<T> {
    return handler(this);
  }

  public async findTransactionByIdempotencyKey(
    idempotencyKey: string
  ): Promise<LedgerTransactionPayload | null> {
    return this.transactions.get(idempotencyKey) ?? null;
  }

  public async findUserAccountClassification(
    userId: number
  ): Promise<{ isTestAccount: boolean } | null> {
    return { isTestAccount: this.accountClassifications.get(userId) ?? false };
  }

  public async getOrCreateWallet(input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    currency: LedgerCurrency;
  }): Promise<WalletPayload> {
    const key = this.walletKey(input.ownerType, input.ownerId, input.currency);
    const existing = this.wallets.get(key);

    if (existing) {
      return existing;
    }

    return this.seedWallet({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      availableBalance: 0,
      currency: input.currency
    });
  }

  public async findTechnicianUserId(technicianProfileId: number): Promise<number | null> {
    return this.technicianUsers.get(technicianProfileId) ?? null;
  }

  public async applyWalletDelta(input: {
    walletId: number;
    availableDelta: number;
    frozenDelta: number;
    requireAvailableAtLeast?: number;
    requireFrozenAtLeast?: number;
  }): Promise<WalletPayload | null> {
    const wallet = [...this.wallets.values()].find((candidate) => candidate.id === input.walletId);

    if (!wallet) {
      return null;
    }
    if (
      typeof input.requireAvailableAtLeast === "number" &&
      wallet.availableBalance < input.requireAvailableAtLeast
    ) {
      return null;
    }
    if (
      typeof input.requireFrozenAtLeast === "number" &&
      wallet.frozenBalance < input.requireFrozenAtLeast
    ) {
      return null;
    }

    wallet.availableBalance += input.availableDelta;
    wallet.frozenBalance += input.frozenDelta;
    wallet.updatedAt = now;

    return wallet;
  }

  public async createTransaction(input: {
    idempotencyKey: string;
    type: LedgerTransactionPayload["type"];
    referenceType: string;
    referenceId: number;
    actorUserId: number | null;
    amount: number;
    currency: LedgerCurrency;
    metadata?: unknown;
  }): Promise<LedgerTransactionPayload> {
    const transaction: LedgerTransactionPayload = {
      id: this.transactionId++,
      transactionNo: `LT${this.transactionId}`,
      idempotencyKey: input.idempotencyKey,
      type: input.type,
      status: "applied",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      actorUserId: input.actorUserId,
      amount: input.amount,
      currency: input.currency,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
      entries: []
    };
    this.transactions.set(input.idempotencyKey, transaction);

    return transaction;
  }

  public async createLedgerEntry(input: {
    transactionId: number;
    walletId: number;
    direction: WalletLedgerPayload["direction"];
    amount: number;
    availableDelta: number;
    frozenDelta: number;
    availableBalanceAfter: number;
    frozenBalanceAfter: number;
    reason: string;
  }): Promise<WalletLedgerPayload> {
    const entry: WalletLedgerPayload = {
      id: this.entryId++,
      transactionId: input.transactionId,
      walletId: input.walletId,
      direction: input.direction,
      amount: input.amount,
      availableDelta: input.availableDelta,
      frozenDelta: input.frozenDelta,
      availableBalanceAfter: input.availableBalanceAfter,
      frozenBalanceAfter: input.frozenBalanceAfter,
      reason: input.reason,
      createdAt: now
    };
    this.entries.push(entry);

    const transaction = [...this.transactions.values()].find(
      (candidate) => candidate.id === input.transactionId
    );
    transaction?.entries.push(entry);

    return entry;
  }

  public async createFinanceReconciliation(input: {
    transactionId: number;
    referenceType: string;
    referenceId: number;
    currency: "NDP";
    expectedAmount: number;
    actualAmount: number;
  }): Promise<void> {
    this.reconciliationRows.push({
      transactionId: input.transactionId,
      expectedAmount: input.expectedAmount
    });
  }

  public async createAuditLog(input: {
    actorUserId: number | null;
    action: string;
    targetId: number;
    metadata?: unknown;
  }): Promise<void> {
    this.auditRows.push({
      actorUserId: input.actorUserId,
      action: input.action,
      targetId: input.targetId,
      metadata: input.metadata
    });
  }

  public async findWalletHoldByIdempotencyKey(
    idempotencyKey: string
  ): Promise<WalletHoldPayload | null> {
    return [...this.holds.values()].find((hold) => hold.idempotencyKey === idempotencyKey) ?? null;
  }

  public async findWalletHold(input: {
    bookingOrderId: number;
    ownerType: WalletOwnerType;
    ownerId: number;
    feeType: WalletHoldPayload["feeType"];
  }): Promise<WalletHoldPayload | null> {
    return (
      [...this.holds.values()].find(
        (hold) =>
          hold.bookingOrderId === input.bookingOrderId &&
          hold.ownerType === input.ownerType &&
          hold.ownerId === input.ownerId &&
          hold.feeType === input.feeType
      ) ?? null
    );
  }

  public async createWalletHold(input: CreateWalletHoldInput): Promise<WalletHoldPayload> {
    const hold: WalletHoldPayload = {
      id: this.holdId++,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      bookingOrderId: input.bookingOrderId ?? null,
      exchangePostId: input.exchangePostId ?? null,
      feeType: input.feeType,
      holdAmountNdp: input.holdAmountNdp,
      capturedAmountNdp: 0,
      releasedAmountNdp: 0,
      currency: input.currency,
      status: input.status,
      idempotencyKey: input.idempotencyKey,
      calculationLogId: input.calculationLogId,
      metadata: input.metadata ?? null,
      capturedAt: null,
      releasedAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.holds.set(String(hold.id), hold);

    return hold;
  }

  public async updateWalletHold(input: {
    id: number;
    capturedAmountNdp?: number;
    releasedAmountNdp?: number;
    status: WalletHoldPayload["status"];
    capturedAt?: Date | null;
    releasedAt?: Date | null;
    metadata?: unknown;
  }): Promise<WalletHoldPayload> {
    const hold = this.holds.get(String(input.id));

    if (!hold) {
      throw new Error("missing hold");
    }

    hold.capturedAmountNdp = input.capturedAmountNdp ?? hold.capturedAmountNdp;
    hold.releasedAmountNdp = input.releasedAmountNdp ?? hold.releasedAmountNdp;
    hold.status = input.status;
    hold.capturedAt = input.capturedAt ?? hold.capturedAt;
    hold.releasedAt = input.releasedAt ?? hold.releasedAt;
    hold.metadata = input.metadata ?? hold.metadata;
    hold.updatedAt = now;

    return hold;
  }

  public async upsertOrderFinancial(input: OrderFinancialUpsertInput): Promise<void> {
    this.upsertFinancialCallCount += 1;
    this.financials.set(input.bookingOrderId, {
      ...(this.financials.get(input.bookingOrderId) ?? input),
      ...input
    });
  }

  public async findOrderFinancialPlatformFeeSnapshot(bookingOrderId: number) {
    this.unlockedSnapshotLookupCount += 1;
    return this.platformFeeSnapshot(bookingOrderId);
  }

  public async lockOrderFinancialPlatformFeeSnapshot(bookingOrderId: number) {
    this.lockEvents.push(`financial:${bookingOrderId}`);
    this.lockedSnapshotLookupCount += 1;
    return this.platformFeeSnapshot(bookingOrderId);
  }

  public async lockWalletById(walletId: number): Promise<WalletPayload | null> {
    this.lockEvents.push(`wallet:${walletId}`);
    return [...this.wallets.values()].find((wallet) => wallet.id === walletId) ?? null;
  }

  private platformFeeSnapshot(bookingOrderId: number) {
    const financial = this.financials.get(bookingOrderId);
    if (!financial || financial.platformFeeEnabledSnapshot === undefined) {
      return null;
    }

    return {
      bookingOrderId,
      ndpCurrency: financial.ndpCurrency,
      customerUserId: financial.customerUserId,
      shopId: financial.shopId,
      technicianProfileId: financial.technicianProfileId ?? null,
      platformFeeEnabledSnapshot: financial.platformFeeEnabledSnapshot ?? false,
      platformFeeAmountNdpSnapshot: financial.platformFeeAmountNdpSnapshot ?? 0,
      platformFeeWalletOwnerType: financial.platformFeeWalletOwnerType ?? null,
      platformFeeWalletOwnerId: financial.platformFeeWalletOwnerId ?? null,
      platformFeeWalletId: financial.platformFeeWalletId ?? null,
      platformFeeOutstandingNdp: financial.platformFeeOutstandingNdp ?? 0,
      platformFeeDebtStatus: financial.platformFeeDebtStatus ?? "none",
      platformFeeAcceptedAt: financial.platformFeeAcceptedAt ?? null,
      userRewardEligibleNdp: financial.userRewardEligibleNdp ?? 0,
      userRewardStatus: financial.userRewardStatus ?? "disabled",
      userRewardDeadlineAt: financial.userRewardDeadlineAt ?? null,
      userRewardGrantedAt: financial.userRewardGrantedAt ?? null,
      settlementStatus: financial.settlementStatus ?? "pending"
    };
  }

  public async findPlatformFeeHoldByBookingOrderId(
    bookingOrderId: number
  ): Promise<WalletHoldPayload | null> {
    return (
      [...this.holds.values()].find(
        (hold) => hold.bookingOrderId === bookingOrderId && hold.feeType === "b_platform_fee"
      ) ?? null
    );
  }

  public async findOrderFinancialByOverdraftConfirmationKey(
    idempotencyKey: string
  ): Promise<{ bookingOrderId: number; previewVersion: string } | null> {
    for (const financial of this.financials.values()) {
      if (financial.platformFeeOverdraftConfirmationKey === idempotencyKey) {
        return {
          bookingOrderId: financial.bookingOrderId,
          previewVersion: financial.platformFeePreviewVersion ?? ""
        };
      }
    }

    return null;
  }

  private walletKey(ownerType: WalletOwnerType, ownerId: number, currency: LedgerCurrency): string {
    return `${ownerType}:${ownerId}:${currency}`;
  }
}

class RollbackCreatedWalletRepository extends InMemoryLedgerRepository {
  public override async runInTransaction<T>(
    handler: (repository: LedgerRepositoryPort) => Promise<T>
  ): Promise<T> {
    const existingWalletKeys = new Set(this.wallets.keys());
    try {
      return await handler(this);
    } catch (error) {
      for (const key of this.wallets.keys()) {
        if (!existingWalletKeys.has(key)) this.wallets.delete(key);
      }
      throw error;
    }
  }
}

describe("LedgerService wallet mutations", () => {
  it("returns both wallet balances with the account's active Test NDP currency", async () => {
    const findWallets = jest.fn(async () => [
      {
        id: 1,
        ownerType: "user",
        ownerId: 7,
        currency: "TEST_NDP",
        availableBalance: 100_000,
        frozenBalance: 1_000,
        createdAt: now,
        updatedAt: now
      }
    ]);
    const service = new LedgerService({
      findUserAccountClassification: jest.fn(async () => ({ isTestAccount: true })),
      findWallets
    } as never);

    await expect(
      service.getMyWalletSummary({
        userId: 7,
        email: "test@example.com",
        accessTokenJti: "wallet-summary",
        accessTokenExpiresAt: 1_800_000_000,
        currentIdentityType: "customer",
        currentIdentityScopeType: "global",
        currentIdentityScopeId: null,
        roles: ["customer"],
        permissions: ["wallet:read"]
      })
    ).resolves.toEqual({
      activeCurrency: "TEST_NDP",
      hasTestNdpWallet: true,
      ndp: { available: 0, frozen: 0 },
      testNdp: { available: 100_000, frozen: 1_000 }
    });
    expect(findWallets).toHaveBeenCalledWith({
      ownerType: "user",
      ownerId: 7,
      currencies: ["NDP", "TEST_NDP"]
    });
  });

  it("does not turn a missing active Test NDP wallet into a zero balance", async () => {
    const service = new LedgerService({
      findUserAccountClassification: jest.fn(async () => ({ isTestAccount: true })),
      findWallets: jest.fn(async () => [])
    } as never);

    await expect(
      service.getMyWalletSummary({
        userId: 7,
        email: "test@example.com",
        accessTokenJti: "wallet-summary-missing-test-wallet",
        accessTokenExpiresAt: 1_800_000_000,
        currentIdentityType: "customer",
        currentIdentityScopeType: "global",
        currentIdentityScopeId: null,
        roles: ["customer"],
        permissions: ["wallet:read"]
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_NOT_FOUND,
      message: "error.wallet.not_found",
      statusCode: 404
    });
  });

  it.each([
    [false, "NDP"],
    [true, "TEST_NDP"]
  ] as const)(
    "uses %s account classification as %s for booking freeze",
    async (isTestAccount, currency) => {
      const repository = new InMemoryLedgerRepository();
      repository.accountClassifications.set(3, isTestAccount);
      repository.seedWallet({
        ownerType: "shop",
        ownerId: 10,
        availableBalance: 1000,
        currency
      });
      const service = new LedgerService(
        repository,
        createFeeService(),
        undefined,
        () => now,
        createPolicyResolver()
      );

      await service.freezeBookingAcceptance(
        bookingInput({
          bookingOrderId: isTestAccount ? 301 : 300,
          shopId: 10,
          actorUserId: 2,
          customerUserId: 3
        })
      );

      expect(repository.wallets.get(`shop:10:${currency}`)).toMatchObject({
        availableBalance: 500,
        frozenBalance: 500,
        currency
      });
      expect(Array.from(repository.transactions.values())[0]).toMatchObject({ currency });
      expect(repository.financials.get(isTestAccount ? 301 : 300)).toMatchObject({
        ndpCurrency: currency
      });
      expect(repository.reconciliationRows).toHaveLength(isTestAccount ? 0 : 1);
    }
  );

  it("releases a booking in its snapshotted Test NDP currency after classification changes", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.accountClassifications.set(3, true);
    repository.seedWallet({
      ownerType: "shop",
      ownerId: 10,
      availableBalance: 1_000,
      currency: "TEST_NDP"
    });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 302,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });

    await service.freezeBookingAcceptance(input);
    repository.accountClassifications.set(3, false);
    const released = await service.releaseBookingHold(input);

    expect(released).toMatchObject({ currency: "TEST_NDP" });
    expect(repository.wallets.get("shop:10:TEST_NDP")).toMatchObject({
      availableBalance: 1_000,
      frozenBalance: 0
    });
    expect(repository.wallets.has("shop:10:NDP")).toBe(false);
    expect(repository.financials.get(302)).toMatchObject({
      ndpCurrency: "TEST_NDP",
      settlementStatus: "cancelled"
    });
    expect(repository.reconciliationRows).toHaveLength(0);
  });

  it("completes a booking in its snapshotted Test NDP currency after classification changes", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.accountClassifications.set(3, true);
    repository.seedWallet({
      ownerType: "shop",
      ownerId: 10,
      availableBalance: 1_000,
      currency: "TEST_NDP"
    });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 303,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });

    await service.freezeBookingAcceptance(input);
    repository.accountClassifications.set(3, false);
    const settled = await service.settleBookingCompletion({
      ...input,
      customerUserId: 3,
      checkoutPayment: { method: "ndp", payableNdp: 8_800 }
    } as never);

    expect(settled).toMatchObject({ currency: "TEST_NDP" });
    expect(repository.wallets.get("shop:10:TEST_NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
    expect(repository.wallets.get("user:3:TEST_NDP")).toMatchObject({
      availableBalance: 100,
      frozenBalance: 0
    });
    expect(repository.wallets.has("user:3:NDP")).toBe(false);
    expect(repository.reconciliationRows).toHaveLength(0);
    expect(repository.financials.get(303)).toMatchObject({
      ndpCurrency: "TEST_NDP",
      platformCollectedServiceAmountJpy: 0,
      unknownOrUnreportedServiceAmountJpy: 0,
      paymentChannel: "platform_test_ndp",
      serviceIncomeStatus: "confirmed"
    });
  });

  it("projects a confirmed cash checkout as audited offline income with exact add-on basis", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1_000 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = {
      ...bookingInput({
        bookingOrderId: 24410,
        shopId: 10,
        actorUserId: 2,
        customerUserId: 3,
        technicianProfileId: 21
      }),
      serviceAmountJpy: 14_850
    };
    const receiptConfirmedAt = new Date("2026-09-19T10:16:01.000Z");

    await service.freezeBookingAcceptance(input);
    await service.settleBookingCompletion({
      ...input,
      customerUserId: 3,
      checkoutPayment: {
        method: "cash",
        amountJpy: 14_850,
        baseServiceAmountJpy: 8_200,
        extensionAmountJpy: 6_650,
        evidence: "technician_receipt_confirmation",
        confirmedById: 2,
        confirmedAt: receiptConfirmedAt,
        reason: "cash received"
      }
    } as never);

    expect(repository.financials.get(24410)).toMatchObject({
      serviceAmountJpy: 14_850,
      baseServiceAmountJpy: 8_200,
      extensionAmountJpy: 6_650,
      nominationChargeAmountJpy: 0,
      wasTechnicianNominated: false,
      platformCollectedServiceAmountJpy: 0,
      offlineReportedServiceAmountJpy: 14_850,
      unknownOrUnreportedServiceAmountJpy: 0,
      paymentChannel: "offline_cash",
      serviceIncomeStatus: "confirmed",
      serviceIncomeReportedById: 2,
      serviceIncomeReportedAt: receiptConfirmedAt,
      serviceIncomeConfirmedById: 2,
      serviceIncomeConfirmedAt: receiptConfirmedAt,
      serviceIncomeNote: "cash received",
      bPlatformFeeActualNdp: 500,
      userRewardNdp: 100,
      settlementStatus: "settled",
      timelineEvent: expect.objectContaining({
        action: "booking_complete_snapshot_settlement",
        type: "service_income_confirmed",
        amountJpy: 14_850,
        actorType: "technician",
        occurredAt: receiptConfirmedAt.toISOString(),
        status: "confirmed",
        metadata: expect.objectContaining({
          paymentChannel: "offline_cash",
          paymentEvidence: "technician_receipt_confirmation",
          baseServiceAmountJpy: 8_200,
          extensionAmountJpy: 6_650,
          platformFeeNdp: 500
        })
      })
    });
  });

  it("settles a no-show from the frozen 500 NDP fee without issuing a customer reward", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1_000 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 305,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });

    await service.freezeBookingAcceptance(input);
    await service.settleBookingCompletion({
      ...input,
      customerUserId: 3,
      suppressCustomerReward: true
    });

    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
    expect(repository.wallets.has("user:3:NDP")).toBe(false);
    expect(repository.financials.get(305)).toMatchObject({
      bPlatformFeeActualNdp: 500,
      userRewardNdp: 0,
      userRewardStatus: "disabled",
      userRewardEligibleNdp: 0,
      userRewardGrantedAt: null
    });
  });

  it("pays merchant-cancel compensation only in the booking's Test NDP currency", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.accountClassifications.set(3, true);
    repository.seedWallet({
      ownerType: "shop",
      ownerId: 10,
      availableBalance: 1_000,
      currency: "TEST_NDP"
    });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 304,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });

    await service.freezeBookingAcceptance(input);
    repository.accountClassifications.set(3, false);
    const compensated = await service.compensateCustomerForMerchantCancellation({
      ...input,
      customerUserId: 3
    });

    expect(compensated).toMatchObject({ currency: "TEST_NDP" });
    expect(repository.wallets.get("shop:10:TEST_NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
    expect(repository.wallets.get("user:3:TEST_NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
    expect(repository.wallets.has("shop:10:NDP")).toBe(false);
    expect(repository.wallets.has("user:3:NDP")).toBe(false);
    expect(repository.reconciliationRows).toHaveLength(0);
  });

  it("freezes a merchant booking acceptance once for an idempotency key", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const service = new LedgerService(repository, createFeeService());

    const first = await service.freezeBookingAcceptance(
      bookingInput({ bookingOrderId: 1, shopId: 10, actorUserId: 2 })
    );
    const repeated = await service.freezeBookingAcceptance(
      bookingInput({ bookingOrderId: 1, shopId: 10, actorUserId: 2 })
    );

    expect(repeated?.id).toBe(first?.id);
    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 500
    });
    expect(repository.entries).toHaveLength(1);
    expect(repository.auditRows).toEqual([
      expect.objectContaining({ action: "ledger.booking_accept.freeze", actorUserId: 2 })
    ]);
  });

  it("rejects a freeze when the merchant wallet has insufficient available NDP", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 499 });
    const service = new LedgerService(repository, createFeeService());

    await expect(
      service.freezeBookingAcceptance(
        bookingInput({ bookingOrderId: 1, shopId: 10, actorUserId: 2 })
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_INSUFFICIENT_AVAILABLE,
      message: "error.wallet.insufficient_available"
    });
  });

  it("snapshots the default shop policy and freezes the default 500 NDP fee", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const feeService = createFeeService();
    const policyResolver = createPolicyResolver();
    const service = new LedgerService(repository, feeService, undefined, () => now, policyResolver);

    await service.freezeBookingAcceptance(
      bookingInput({ bookingOrderId: 101, shopId: 10, actorUserId: 2, customerUserId: 3 })
    );

    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 500
    });
    expect(repository.financials.get(101)).toMatchObject({
      platformFeeEnabledSnapshot: true,
      platformFeeGlobalVersion: 0,
      platformFeePolicyVersion: 0,
      platformFeeAmountNdpSnapshot: 500,
      platformFeePayerType: "shop",
      platformFeePayerId: 10,
      platformFeeWalletOwnerType: "shop",
      platformFeeWalletOwnerId: 10,
      platformFeeShortfallNdp: 0,
      platformFeeOutstandingNdp: 0,
      platformFeeDebtStatus: "none",
      userRewardEligibleNdp: 100,
      userRewardStatus: "immediate",
      platformFeeAcceptedAt: now
    });
    expect(policyResolver.resolveForBookingSettlement).toHaveBeenCalledWith(10, now, undefined);
    expect(feeService.calculateFee).toHaveBeenCalledWith(
      expect.objectContaining({ payerOverride: { payerType: "shop", payerId: 10 } }),
      { transactionClient: undefined }
    );
  });

  it("records a disabled fee snapshot without creating wallet or ledger mutations", async () => {
    const repository = new InMemoryLedgerRepository();
    const feeService = createFeeService();
    const service = new LedgerService(
      repository,
      feeService,
      undefined,
      () => now,
      createPolicyResolver({ feeEnabled: false, policyVersion: 3, policySource: "persisted" })
    );

    await expect(
      service.freezeBookingAcceptance(
        bookingInput({ bookingOrderId: 102, shopId: 10, actorUserId: 2, customerUserId: 3 })
      )
    ).resolves.toBeUndefined();

    expect(repository.wallets.size).toBe(0);
    expect(repository.holds.size).toBe(0);
    expect(repository.transactions.size).toBe(0);
    expect(repository.entries).toHaveLength(0);
    expect(repository.financials.get(102)).toMatchObject({
      bPlatformFeeHoldNdp: 0,
      platformFeeEnabledSnapshot: false,
      platformFeePolicyVersion: 3,
      platformFeeAmountNdpSnapshot: 0,
      platformFeeShortfallNdp: 0,
      platformFeeOutstandingNdp: 0,
      platformFeeDebtStatus: "none",
      userRewardEligibleNdp: 0,
      userRewardStatus: "disabled"
    });
    expect(feeService.calculateFee).toHaveBeenCalledWith(
      expect.objectContaining({ waiveReason: "shop_policy_disabled" }),
      { transactionClient: undefined }
    );
  });

  it("still requires the assigned technician when a disabled policy names the technician payer", async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver({ feeEnabled: false, payerType: "technician" })
    );

    await expect(
      service.freezeBookingAcceptance(
        bookingInput({ bookingOrderId: 1021, shopId: 10, actorUserId: 2, customerUserId: 3 })
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.PLATFORM_FEE_TECHNICIAN_REQUIRED,
      message: "error.platform_fee.technician_required"
    });
    expect(repository.wallets.size).toBe(0);
    expect(repository.financials.size).toBe(0);
    expect(repository.holds.size).toBe(0);
  });

  it("freezes a technician payer fee on the technician's global user wallet", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.technicianUsers.set(9, 77);
    repository.seedWallet({ ownerType: "user", ownerId: 77, availableBalance: 700 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver({ payerType: "technician", policyVersion: 4 })
    );

    await service.freezeBookingAcceptance(
      bookingInput({
        bookingOrderId: 103,
        shopId: 10,
        technicianProfileId: 9,
        actorUserId: 2,
        customerUserId: 3
      })
    );

    expect(repository.wallets.get("user:77:NDP")).toMatchObject({
      availableBalance: 200,
      frozenBalance: 500
    });
    expect(repository.financials.get(103)).toMatchObject({
      platformFeePayerType: "technician",
      platformFeePayerId: 9,
      platformFeeWalletOwnerType: "user",
      platformFeeWalletOwnerId: 77
    });
  });

  it("rejects technician payer acceptance without an assigned technician and writes nothing", async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver({ payerType: "technician" })
    );

    await expect(
      service.freezeBookingAcceptance(
        bookingInput({ bookingOrderId: 104, shopId: 10, actorUserId: 2, customerUserId: 3 })
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.PLATFORM_FEE_TECHNICIAN_REQUIRED,
      message: "error.platform_fee.technician_required"
    });
    expect(repository.wallets.size).toBe(0);
    expect(repository.financials.size).toBe(0);
    expect(repository.holds.size).toBe(0);
  });

  it("requires an explicit matching preview before allowing a negative payer balance", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 120 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 105,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });

    const firstError = await service.freezeBookingAcceptance(input).catch((error) => error);
    expect(firstError).toMatchObject({
      code: ERROR_CODES.PLATFORM_FEE_INSUFFICIENT_CONFIRMATION_REQUIRED,
      message: "error.platform_fee.insufficient_balance_confirmation_required",
      data: {
        feeAmountNdp: 500,
        availableBalanceNdp: 120,
        shortfallNdp: 380,
        payerType: "shop",
        walletOwnerType: "shop",
        previewVersion: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      }
    });
    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 120,
      frozenBalance: 0
    });
    expect(repository.financials.size).toBe(0);
    expect(repository.holds.size).toBe(0);
    expect(repository.transactions.size).toBe(0);
    expect(repository.entries).toHaveLength(0);

    const previewVersion = (firstError as { data: { previewVersion: string } }).data.previewVersion;
    await service.freezeBookingAcceptance({
      ...input,
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: "fee-confirm-order-105",
        previewVersion
      }
    });

    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: -380,
      frozenBalance: 500
    });
    expect(repository.financials.get(105)).toMatchObject({
      platformFeeShortfallNdp: 380,
      platformFeeOutstandingNdp: 380,
      platformFeeDebtStatus: "outstanding",
      platformFeeOverdraftConfirmationKey: "fee-confirm-order-105",
      platformFeePreviewVersion: previewVersion
    });
    expect(repository.auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "ledger.booking_accept.freeze",
          metadata: expect.objectContaining({
            insufficientBalanceConfirmed: true,
            shortfallNdp: 380
          })
        })
      ])
    );
  });

  it("keeps an insufficient-balance preview valid when creating the wallet was rolled back", async () => {
    const repository = new RollbackCreatedWalletRepository();
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 1051,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });

    const warning = (await service.freezeBookingAcceptance(input).catch((error) => error)) as {
      data: { previewVersion: string };
    };
    expect(repository.wallets.size).toBe(0);

    await expect(
      service.freezeBookingAcceptance({
        ...input,
        insufficientBalanceConfirmation: {
          confirmed: true,
          idempotencyKey: "fee-confirm-order-1051",
          previewVersion: warning.data.previewVersion
        }
      })
    ).resolves.toMatchObject({
      idempotencyKey: "booking:1051:accept:freeze",
      type: "booking_accept_freeze"
    });
    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: -500,
      frozenBalance: 500
    });
  });

  it("records only the new marginal deficit when the same payer accepts consecutive overdrafts", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 120 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );

    for (const bookingOrderId of [1051, 1052]) {
      const input = bookingInput({
        bookingOrderId,
        shopId: 10,
        actorUserId: 2,
        customerUserId: 3
      });
      const warning = await service.freezeBookingAcceptance(input).catch((error) => error);
      expect(warning).toMatchObject({
        data: {
          feeAmountNdp: 500,
          shortfallNdp: bookingOrderId === 1051 ? 380 : 500
        }
      });
      await service.freezeBookingAcceptance({
        ...input,
        insufficientBalanceConfirmation: {
          confirmed: true,
          idempotencyKey: `fee-confirm-order-${bookingOrderId}`,
          previewVersion: (warning as { data: { previewVersion: string } }).data.previewVersion
        }
      });
    }

    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: -880,
      frozenBalance: 1000
    });
    expect(repository.financials.get(1051)).toMatchObject({
      platformFeeOutstandingNdp: 380
    });
    expect(repository.financials.get(1052)).toMatchObject({
      platformFeeShortfallNdp: 500,
      platformFeeOutstandingNdp: 500
    });
  });

  it("rejects stale previews and confirmation keys already used by another order", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 0 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const firstInput = bookingInput({
      bookingOrderId: 106,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });

    await expect(
      service.freezeBookingAcceptance({
        ...firstInput,
        insufficientBalanceConfirmation: {
          confirmed: true,
          idempotencyKey: "fee-confirm-shared-key",
          previewVersion: `sha256:${"0".repeat(64)}`
        }
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.PLATFORM_FEE_PREVIEW_STALE });
    expect(repository.financials.size).toBe(0);

    const firstWarning = await service.freezeBookingAcceptance(firstInput).catch((error) => error);
    const firstPreview = (firstWarning as { data: { previewVersion: string } }).data.previewVersion;
    await service.freezeBookingAcceptance({
      ...firstInput,
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: "fee-confirm-shared-key",
        previewVersion: firstPreview
      }
    });

    const secondInput = bookingInput({
      bookingOrderId: 107,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });
    const secondWarning = await service
      .freezeBookingAcceptance(secondInput)
      .catch((error) => error);
    const secondPreview = (secondWarning as { data: { previewVersion: string } }).data
      .previewVersion;
    await expect(
      service.freezeBookingAcceptance({
        ...secondInput,
        insufficientBalanceConfirmation: {
          confirmed: true,
          idempotencyKey: "fee-confirm-shared-key",
          previewVersion: secondPreview
        }
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.PLATFORM_FEE_CONFIRMATION_CONFLICT });
    expect(repository.financials.has(107)).toBe(false);
  });

  it("maps a concurrent overdraft confirmation-key collision to the safe conflict error", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 0 });
    repository.upsertOrderFinancial = jest.fn(async () => {
      throw {
        code: "P2002",
        meta: { target: "order_financials_overdraft_confirmation_key" }
      };
    });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 108,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });
    const warning = await service.freezeBookingAcceptance(input).catch((error) => error);
    const previewVersion = (warning as { data: { previewVersion: string } }).data.previewVersion;

    await expect(
      service.freezeBookingAcceptance({
        ...input,
        insufficientBalanceConfirmation: {
          confirmed: true,
          idempotencyKey: "fee-confirm-race-108",
          previewVersion
        }
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.PLATFORM_FEE_CONFIRMATION_CONFLICT,
      message: "error.platform_fee.confirmation_conflict"
    });
  });

  it("settles completion by deducting frozen merchant NDP and crediting the customer reward once", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const service = new LedgerService(repository, createFeeService());

    await service.freezeBookingAcceptance(
      bookingInput({ bookingOrderId: 1, shopId: 10, actorUserId: 2, customerUserId: 3 })
    );
    const first = await service.settleBookingCompletion({
      ...bookingInput({ bookingOrderId: 1, shopId: 10, actorUserId: 2, customerUserId: 3 }),
      customerUserId: 3
    });
    const repeated = await service.settleBookingCompletion({
      ...bookingInput({ bookingOrderId: 1, shopId: 10, actorUserId: 2, customerUserId: 3 }),
      customerUserId: 3
    });

    expect(repeated?.id).toBe(first?.id);
    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
    expect(repository.wallets.get("user:3:NDP")).toMatchObject({
      availableBalance: 100,
      frozenBalance: 0
    });
    expect(repository.entries).toHaveLength(3);
  });

  it.each([
    ["TEST_NDP", { method: "ndp", payableNdp: 8_200 }, "platform_test_ndp", 0, 0, 8_200, 8_200, 0],
    [
      "cash",
      {
        method: "cash",
        amountJpy: 14_850,
        baseServiceAmountJpy: 8_200,
        extensionAmountJpy: 6_650,
        evidence: "technician_receipt_confirmation",
        confirmedById: 2,
        confirmedAt: new Date("2026-09-20T02:45:00.000Z"),
        reason: "cash received"
      },
      "offline_cash",
      0,
      14_850,
      14_850,
      8_200,
      6_650
    ]
  ] as const)(
    "persists one auditable compensation projection for %s completion",
    async (
      _label,
      checkoutPayment,
      paymentChannel,
      platformCollected,
      offlineReported,
      serviceAmountJpy,
      baseServiceAmountJpy,
      extensionAmountJpy
    ) => {
      const repository = new InMemoryLedgerRepository();
      repository.accountClassifications.set(3, true);
      repository.seedWallet({
        ownerType: "shop",
        ownerId: 10,
        availableBalance: 1_000,
        currency: "TEST_NDP"
      });
      const findCompensationRuleByBasis = jest.fn(async () => ({
          id: 73,
          sourceType: "shop_default",
          shopId: 10,
          technicianProfileId: null,
          name: "full split",
          wageMode: "commission",
          baseSalaryJpy: 0,
          hourlyRateJpy: 0,
          dailyRateJpy: 0,
          fixedOrderPayJpy: 0,
          commissionRatePercent: 100,
          extensionCommissionRatePercent: 100,
          nominationFeeJpy: 0,
          guaranteedMinimumJpy: 0,
          ndpFeeBearer: "shop",
          technicianNdpSharePercent: 0,
          bonusRules: [],
          deductionRules: []
        }));
      Object.assign(repository, { findCompensationRuleByBasis });
      const service = new LedgerService(repository, createFeeService());
      const input = {
        ...bookingInput({
          bookingOrderId: paymentChannel === "offline_cash" ? 24410 : 24413,
          shopId: 10,
          technicianProfileId: 42,
          actorUserId: 2,
          customerUserId: 3
        }),
        serviceAmountJpy,
        baseServiceAmountJpy,
        extensionAmountJpy,
        nominationChargeAmountJpy: 0,
        wasTechnicianNominated: false,
        compensationBasisVersion: "shop_default:73" as const,
        checkoutPayment,
        completedAt: now,
        workedMinutes: paymentChannel === "offline_cash" ? 105 : 60
      };

      await service.freezeBookingAcceptance(input);
      await service.settleBookingCompletion({ ...input, customerUserId: 3 });
      const writesAfterFirstCompletion = repository.upsertFinancialCallCount;
      await service.settleBookingCompletion({ ...input, customerUserId: 3 });

      expect(repository.financials.get(input.bookingOrderId)).toMatchObject({
        baseServiceAmountJpy,
        extensionAmountJpy,
        nominationChargeAmountJpy: 0,
        wasTechnicianNominated: false,
        compensationBasisVersion: "shop_default:73",
        serviceIncomeStatus: "confirmed",
        paymentChannel,
        platformCollectedServiceAmountJpy: platformCollected,
        offlineReportedServiceAmountJpy: offlineReported,
        unknownOrUnreportedServiceAmountJpy: 0,
        serviceIncomeConfirmedById: 2,
        serviceIncomeConfirmedAt:
          checkoutPayment.method === "ndp" ? now : checkoutPayment.confirmedAt,
        timelineEvents: expect.arrayContaining([
          expect.objectContaining({
            type: "service_income_confirmed",
            amountJpy: serviceAmountJpy,
            occurredAt:
              checkoutPayment.method === "ndp"
                ? now.toISOString()
                : checkoutPayment.confirmedAt.toISOString()
          }),
          expect.objectContaining({
            type: "technician_income_estimated",
            amountJpy: serviceAmountJpy,
            occurredAt: now.toISOString(),
            metadata: expect.objectContaining({
              workedMinutes: paymentChannel === "offline_cash" ? 105 : 60,
              shopEstimatedGrossProfitJpy: -500
            })
          })
        ])
      });
      expect(repository.upsertFinancialCallCount).toBe(writesAfterFirstCompletion);
      expect(repository.auditRows.filter((row) => row.action.includes("booking_complete"))).toHaveLength(
        1
      );
      expect(findCompensationRuleByBasis).toHaveBeenCalledTimes(1);
    }
  );

  it("completes against the original technician wallet and snapshotted fee after policy changes", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.technicianUsers.set(9, 77);
    repository.seedWallet({ ownerType: "user", ownerId: 77, availableBalance: 700 });
    const feeService = createFeeService();
    const policyResolver = createPolicyResolver({ payerType: "technician", policyVersion: 2 });
    const service = new LedgerService(repository, feeService, undefined, () => now, policyResolver);
    const input = bookingInput({
      bookingOrderId: 201,
      shopId: 10,
      technicianProfileId: 9,
      actorUserId: 2,
      customerUserId: 3
    });

    await service.freezeBookingAcceptance(input);
    repository.technicianUsers.set(9, 88);
    policyResolver.resolveForBookingSettlement.mockClear();
    feeService.calculateFee.mockClear();
    feeService.calculateFee.mockImplementation(async (feeInput) => ({
      ...(await createFeeService({
        b_platform_fee: 900,
        user_reward: 100
      }).calculateFee(feeInput)),
      calculationLogId: 1201
    }));

    await service.settleBookingCompletion({ ...input, customerUserId: 3, completedAt: now });

    expect(policyResolver.resolveForBookingSettlement).not.toHaveBeenCalled();
    expect(repository.lockedSnapshotLookupCount).toBe(1);
    expect(repository.unlockedSnapshotLookupCount).toBe(1);
    expect(repository.lockEvents).toEqual(["wallet:1", "financial:201"]);
    expect(repository.wallets.get("user:77:NDP")).toMatchObject({
      availableBalance: 200,
      frozenBalance: 0
    });
    expect(repository.wallets.has("user:88:NDP")).toBe(false);
    expect(repository.financials.get(201)).toMatchObject({
      bPlatformFeeActualNdp: 500,
      userRewardNdp: 100,
      userRewardStatus: "immediate",
      userRewardGrantedAt: now
    });
    expect(
      feeService.calculateFee.mock.calls.filter(
        ([feeInput]) => feeInput.feeType === "b_platform_fee"
      )
    ).toHaveLength(0);
  });

  it("reverses an overdrawn acceptance on cancellation and disables its reward", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 120 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 202,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });
    const warning = await service.freezeBookingAcceptance(input).catch((error) => error);
    await service.freezeBookingAcceptance({
      ...input,
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: "fee-confirm-order-202",
        previewVersion: (warning as { data: { previewVersion: string } }).data.previewVersion
      }
    });

    await service.releaseBookingHold(input);

    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 120,
      frozenBalance: 0
    });
    expect(repository.financials.get(202)).toMatchObject({
      platformFeeOutstandingNdp: 0,
      platformFeeDebtStatus: "none",
      userRewardEligibleNdp: 0,
      userRewardStatus: "disabled",
      settlementStatus: "cancelled"
    });
  });

  it("completes a disabled-fee order without wallet or ledger mutations and is idempotent", async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver({ feeEnabled: false })
    );
    const input = bookingInput({
      bookingOrderId: 203,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });
    await service.freezeBookingAcceptance(input);
    const writesAfterAcceptance = repository.upsertFinancialCallCount;

    await service.settleBookingCompletion({ ...input, customerUserId: 3, completedAt: now });
    await service.settleBookingCompletion({ ...input, customerUserId: 3, completedAt: now });

    expect(repository.wallets.size).toBe(0);
    expect(repository.holds.size).toBe(0);
    expect(repository.transactions.size).toBe(0);
    expect(repository.entries).toHaveLength(0);
    expect(repository.upsertFinancialCallCount).toBe(writesAfterAcceptance + 1);
    expect(repository.financials.get(203)).toMatchObject({
      bPlatformFeeActualNdp: 0,
      userRewardNdp: 0,
      userRewardEligibleNdp: 0,
      userRewardStatus: "disabled",
      settlementStatus: "settled"
    });
  });

  it("keeps an indebted completion reward pending for exactly seven days", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 120 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 204,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });
    const warning = await service.freezeBookingAcceptance(input).catch((error) => error);
    await service.freezeBookingAcceptance({
      ...input,
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: "fee-confirm-order-204",
        previewVersion: (warning as { data: { previewVersion: string } }).data.previewVersion
      }
    });

    await service.settleBookingCompletion({ ...input, customerUserId: 3, completedAt: now });

    expect(repository.wallets.has("user:3:NDP")).toBe(false);
    expect(repository.financials.get(204)).toMatchObject({
      bPlatformFeeActualNdp: 500,
      userRewardNdp: 0,
      userRewardEligibleNdp: 100,
      userRewardStatus: "pending",
      userRewardDeadlineAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      userRewardGrantedAt: null,
      platformFeeOutstandingNdp: 380,
      platformFeeDebtStatus: "outstanding"
    });
  });

  it("grants the immediate completion reward after debt was settled before completion", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 120 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 206,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });
    const warning = await service.freezeBookingAcceptance(input).catch((error) => error);
    await service.freezeBookingAcceptance({
      ...input,
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: "fee-confirm-order-206",
        previewVersion: (warning as { data: { previewVersion: string } }).data.previewVersion
      }
    });
    await repository.upsertOrderFinancial({
      bookingOrderId: 206,
      orderType: "booking",
      ndpCurrency: "NDP",
      customerUserId: 3,
      shopId: 10,
      serviceAmountJpy: 8800,
      platformFeeOutstandingNdp: 0,
      platformFeeDebtStatus: "settled",
      userRewardStatus: "immediate"
    });

    await service.settleBookingCompletion({ ...input, customerUserId: 3, completedAt: now });

    expect(repository.wallets.get("user:3:NDP")).toMatchObject({
      availableBalance: 100
    });
    expect(repository.financials.get(206)).toMatchObject({
      platformFeeOutstandingNdp: 0,
      platformFeeDebtStatus: "settled",
      userRewardNdp: 100,
      userRewardStatus: "immediate",
      userRewardGrantedAt: now
    });
  });

  it("returns a technician's platform-fee hold before funding provider-cancel compensation from shop", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.technicianUsers.set(9, 77);
    repository.seedWallet({ ownerType: "user", ownerId: 77, availableBalance: 700 });
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 600 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver({ payerType: "technician" })
    );
    const input = bookingInput({
      bookingOrderId: 205,
      shopId: 10,
      technicianProfileId: 9,
      actorUserId: 2,
      customerUserId: 3
    });
    await service.freezeBookingAcceptance(input);

    await service.compensateCustomerForMerchantCancellation({ ...input, customerUserId: 3 });

    expect(repository.wallets.get("user:77:NDP")).toMatchObject({
      availableBalance: 700,
      frozenBalance: 0
    });
    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 100,
      frozenBalance: 0
    });
    expect(repository.wallets.get("user:3:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
    expect(repository.entries.map((entry) => entry.reason)).toEqual(
      expect.arrayContaining([
        "booking_cancel_unfreeze",
        "booking_merchant_cancel_penalty",
        "booking_merchant_cancel_customer_compensation"
      ])
    );
  });

  it.each([
    ["NDP" as const, false],
    ["TEST_NDP" as const, true]
  ])(
    "cancels a historical confirmed booking without a hold in %s and keeps compensation exact",
    async (currency, isTestAccount) => {
      const repository = new InMemoryLedgerRepository();
      repository.accountClassifications.set(3, isTestAccount);
      repository.seedWallet({
        ownerType: "shop",
        ownerId: 10,
        availableBalance: 0,
        currency
      });
      const service = new LedgerService(
        repository,
        createFeeService(),
        undefined,
        () => now,
        createPolicyResolver()
      );
      const input = bookingInput({
        bookingOrderId: isTestAccount ? 208 : 207,
        shopId: 10,
        actorUserId: 2,
        customerUserId: 3
      });

      await expect(
        service.compensateCustomerForMerchantCancellation({ ...input, customerUserId: 3 })
      ).resolves.toMatchObject({ currency });

      expect(repository.wallets.get(`shop:10:${currency}`)).toMatchObject({
        availableBalance: -500,
        frozenBalance: 0
      });
      expect(repository.wallets.get(`user:3:${currency}`)).toMatchObject({
        availableBalance: 500,
        frozenBalance: 0
      });
      expect(repository.financials.get(input.bookingOrderId)).toMatchObject({
        ndpCurrency: currency,
        releasedNdp: 0,
        penaltyNdp: 500,
        compensationToUserNdp: 500,
        settlementStatus: "compensated",
        timelineEvent: expect.objectContaining({
          action: "booking_merchant_cancel_compensation",
          merchantBalanceBeforeNdp: 0,
          merchantBalanceAfterNdp: -500,
          merchantDebtCreatedNdp: 500
        })
      });
      expect(repository.entries.map((entry) => entry.reason)).toEqual([
        "booking_merchant_cancel_penalty",
        "booking_merchant_cancel_customer_compensation"
      ]);
      expect(repository.reconciliationRows).toHaveLength(isTestAccount ? 0 : 1);
    }
  );

  it("lets a customer cancel a historical confirmed booking without a financial snapshot or hold", async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 209,
      shopId: 10,
      actorUserId: 3,
      customerUserId: 3
    });

    await expect(service.releaseBookingHold(input)).resolves.toBeUndefined();

    expect(repository.wallets.size).toBe(0);
    expect(repository.transactions.size).toBe(0);
    expect(repository.entries).toHaveLength(0);
    expect(repository.financials.get(209)).toMatchObject({
      ndpCurrency: "NDP",
      releasedNdp: 0,
      settlementStatus: "cancelled",
      timelineEvent: expect.objectContaining({
        action: "booking_cancel_missing_hold",
        expectedReleaseNdp: 0,
        releasedNdp: 0,
        releaseShortfallNdp: 0
      })
    });
  });

  it("records an unpaid cancellation as zero service income", async () => {
    const repository = new InMemoryLedgerRepository();
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = {
      ...bookingInput({
        bookingOrderId: 213,
        shopId: 10,
        actorUserId: 2,
        customerUserId: 3
      }),
      unpaidCancellation: true
    };

    await expect(service.releaseBookingHold(input)).resolves.toBeUndefined();

    expect(repository.financials.get(213)).toMatchObject({
      ndpCurrency: "NDP",
      serviceAmountJpy: 0,
      platformCollectedServiceAmountJpy: 0,
      offlineReportedServiceAmountJpy: 0,
      unknownOrUnreportedServiceAmountJpy: 0,
      paymentChannel: "unknown",
      serviceIncomeStatus: "cancelled",
      penaltyNdp: 0,
      compensationToUserNdp: 0,
      settlementStatus: "cancelled"
    });
    expect(repository.transactions.size).toBe(0);
    expect(repository.entries).toHaveLength(0);
  });

  it("releases only verifiably frozen NDP when a historical hold exceeds the wallet frozen balance", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1_000 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver()
    );
    const input = bookingInput({
      bookingOrderId: 210,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });
    await service.freezeBookingAcceptance(input);
    const wallet = repository.wallets.get("shop:10:NDP");
    if (!wallet) throw new Error("expected seeded shop wallet");
    wallet.frozenBalance = 100;

    await expect(
      service.compensateCustomerForMerchantCancellation({ ...input, customerUserId: 3 })
    ).resolves.toMatchObject({ currency: "NDP" });

    expect(wallet).toMatchObject({ availableBalance: 100, frozenBalance: 0 });
    expect(repository.wallets.get("user:3:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
    expect(repository.financials.get(210)).toMatchObject({
      releasedNdp: 100,
      penaltyNdp: 500,
      compensationToUserNdp: 500,
      settlementStatus: "compensated"
    });
    expect(repository.entries.map((entry) => entry.reason)).toEqual(
      expect.arrayContaining([
        "booking_cancel_unfreeze",
        "booking_merchant_cancel_penalty",
        "booking_merchant_cancel_customer_compensation"
      ])
    );
  });

  it("uses the existing negative wallet balance as provider-cancellation debt when the shop cannot fund compensation", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.technicianUsers.set(9, 77);
    repository.seedWallet({ ownerType: "user", ownerId: 77, availableBalance: 700 });
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 100 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver({ payerType: "technician" })
    );
    const input = bookingInput({
      bookingOrderId: 211,
      shopId: 10,
      technicianProfileId: 9,
      actorUserId: 2,
      customerUserId: 3
    });
    await service.freezeBookingAcceptance(input);

    await expect(
      service.compensateCustomerForMerchantCancellation({ ...input, customerUserId: 3 })
    ).resolves.toMatchObject({ currency: "NDP" });

    expect(repository.wallets.get("user:77:NDP")).toMatchObject({
      availableBalance: 700,
      frozenBalance: 0
    });
    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: -400,
      frozenBalance: 0
    });
    expect(repository.wallets.get("user:3:NDP")).toMatchObject({ availableBalance: 500 });
  });

  it("keeps provider compensation active when the booking platform fee is disabled", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 100 });
    const service = new LedgerService(
      repository,
      createFeeService(),
      undefined,
      () => now,
      createPolicyResolver({ feeEnabled: false })
    );
    const input = bookingInput({
      bookingOrderId: 212,
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });
    await service.freezeBookingAcceptance(input);

    await expect(
      service.compensateCustomerForMerchantCancellation({ ...input, customerUserId: 3 })
    ).resolves.toMatchObject({ currency: "NDP" });

    expect(repository.holds.size).toBe(0);
    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({ availableBalance: -400 });
    expect(repository.wallets.get("user:3:NDP")).toMatchObject({ availableBalance: 500 });
    expect(repository.financials.get(212)).toMatchObject({
      platformFeeEnabledSnapshot: false,
      penaltyNdp: 500,
      compensationToUserNdp: 500,
      settlementStatus: "compensated"
    });
  });

  it("releases a frozen booking hold or pays forced-cancel compensation from frozen NDP", async () => {
    const releaseRepository = new InMemoryLedgerRepository();
    releaseRepository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const releaseService = new LedgerService(releaseRepository, createFeeService());

    await releaseService.freezeBookingAcceptance(
      bookingInput({ bookingOrderId: 1, shopId: 10, actorUserId: 2 })
    );
    await releaseService.releaseBookingHold(
      bookingInput({ bookingOrderId: 1, shopId: 10, actorUserId: 3 })
    );

    expect(releaseRepository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 1000,
      frozenBalance: 0
    });

    const compensationRepository = new InMemoryLedgerRepository();
    compensationRepository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const compensationService = new LedgerService(compensationRepository, createFeeService());

    await compensationService.freezeBookingAcceptance(
      bookingInput({ bookingOrderId: 2, shopId: 10, actorUserId: 2, customerUserId: 3 })
    );
    await compensationService.compensateCustomerForMerchantCancellation({
      ...bookingInput({ bookingOrderId: 2, shopId: 10, actorUserId: 2, customerUserId: 3 }),
      customerUserId: 3
    });

    expect(compensationRepository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
    expect(compensationRepository.wallets.get("user:3:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
  });

  it("captures a lower dynamic fee and releases the hold difference on completion", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const service = new LedgerService(repository, createFeeService({ b_platform_fee: 300 }));

    await service.freezeBookingAcceptance(
      bookingInput({ bookingOrderId: 3, shopId: 10, actorUserId: 2, customerUserId: 3 })
    );
    await service.settleBookingCompletion({
      ...bookingInput({ bookingOrderId: 3, shopId: 10, actorUserId: 2, customerUserId: 3 }),
      customerUserId: 3
    });

    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 700,
      frozenBalance: 0
    });
    expect(repository.entries.map((entry) => entry.reason)).toContain(
      "booking_complete_hold_difference_release"
    );
    expect(repository.financials.get(3)).toMatchObject({
      bPlatformFeeActualNdp: 300,
      releasedNdp: 200,
      userRewardNdp: 100
    });
  });

  it("records a zero-fee hold without creating empty wallet ledger entries", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const service = new LedgerService(repository, createFeeService({ b_platform_fee: 0 }));

    const transaction = await service.freezeBookingAcceptance(
      bookingInput({ bookingOrderId: 4, shopId: 10, actorUserId: 2, customerUserId: 3 })
    );

    expect(transaction).toBeUndefined();
    expect(repository.entries).toHaveLength(0);
    expect(repository.holds.size).toBe(1);
    expect(repository.financials.get(4)).toMatchObject({
      bPlatformFeeHoldNdp: 0
    });
  });

  it("freezes and captures a request dispatch fee from the customer wallet", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "user", ownerId: 3, availableBalance: 1000 });
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const service = new LedgerService(
      repository,
      createFeeService({ c_request_dispatch_fee: 500 })
    );
    const input = bookingInput({
      bookingOrderId: 5,
      orderType: "request",
      shopId: 10,
      actorUserId: 2,
      customerUserId: 3
    });

    await service.freezeBookingAcceptance(input);
    expect(repository.wallets.get("user:3:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 500
    });
    expect(repository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 1000,
      frozenBalance: 0
    });
    expect([...repository.holds.values()]).toEqual([
      expect.objectContaining({
        ownerType: "user",
        ownerId: 3,
        feeType: "c_request_dispatch_fee",
        holdAmountNdp: 500
      })
    ]);
    expect(repository.financials.get(5)).toMatchObject({
      orderType: "request",
      cRequestFeeHoldNdp: 500
    });

    await service.settleBookingCompletion({ ...input, customerUserId: 3 });

    expect(repository.wallets.get("user:3:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 0
    });
    expect(repository.financials.get(5)).toMatchObject({
      orderType: "request",
      cRequestFeeActualNdp: 500,
      settlementStatus: "settled"
    });
    expect(repository.entries.map((entry) => entry.reason)).toContain(
      "request_complete_dispatch_fee_debit"
    );
  });
});
