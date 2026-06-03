import { ERROR_CODES } from "../src/constants/error-codes";
import {
  LedgerService,
  type OrderFinancialUpsertInput,
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

const now = new Date("2026-05-25T00:00:00.000Z");
const bookingInput = (input: {
  bookingOrderId: number;
  shopId: number;
  actorUserId: number | null;
  customerUserId?: number;
}) => ({
  bookingOrderId: input.bookingOrderId,
  orderType: "booking" as const,
  shopId: input.shopId,
  serviceAmountJpy: 8800,
  scheduledStartAt: now,
  customerUserId: input.customerUserId,
  actorUserId: input.actorUserId
});

const createFeeService = (
  overrides: Partial<Record<FeeCalculationInput["feeType"], number>> = {}
) => ({
  calculateFee: jest.fn(async (input: FeeCalculationInput): Promise<FeeCalculationResult> => {
    const finalFeeNdp =
      overrides[input.feeType] ??
      (input.feeType === "user_reward" ? 100 : input.feeType === "penalty" ? 500 : 500);
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
      payerType: input.feeType === "user_reward" ? "platform" : "shop",
      payerId: input.shopId ?? null,
      baseFeeNdp: finalFeeNdp,
      tierAdjustmentNdp: 0,
      timeAdjustmentNdp: 0,
      campaignDiscountNdp: 0,
      finalFeeNdp,
      holdAmountNdp,
      completedOrderOrdinalInPeriod: input.stage === "capture" ? 101 : null,
      appliedRuleIds: [`test:${input.feeType}`],
      explanation: [`${input.feeType}=${finalFeeNdp}`],
      calculationLogId: 900 + (input.bookingOrderId ?? 0)
    };
  })
});

class InMemoryLedgerRepository implements LedgerRepositoryPort {
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
  }> = [];

  private walletId = 1;
  private transactionId = 1;
  private entryId = 1;
  private holdId = 1;

  public seedWallet(input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    availableBalance: number;
    frozenBalance?: number;
  }): WalletPayload {
    const wallet: WalletPayload = {
      id: this.walletId++,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      currency: "NDP",
      availableBalance: input.availableBalance,
      frozenBalance: input.frozenBalance ?? 0,
      createdAt: now,
      updatedAt: now
    };
    this.wallets.set(this.walletKey(input.ownerType, input.ownerId), wallet);

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

  public async getOrCreateWallet(input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    currency: "NDP";
  }): Promise<WalletPayload> {
    const key = this.walletKey(input.ownerType, input.ownerId);
    const existing = this.wallets.get(key);

    if (existing) {
      return existing;
    }

    return this.seedWallet({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      availableBalance: 0
    });
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
      currency: "NDP",
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
      targetId: input.targetId
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

  public async createWalletHold(input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    bookingOrderId: number;
    feeType: WalletHoldPayload["feeType"];
    holdAmountNdp: number;
    status: WalletHoldPayload["status"];
    idempotencyKey: string;
    calculationLogId: number | null;
    metadata?: unknown;
  }): Promise<WalletHoldPayload> {
    const hold: WalletHoldPayload = {
      id: this.holdId++,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      bookingOrderId: input.bookingOrderId,
      feeType: input.feeType,
      holdAmountNdp: input.holdAmountNdp,
      capturedAmountNdp: 0,
      releasedAmountNdp: 0,
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
    this.financials.set(input.bookingOrderId, {
      ...(this.financials.get(input.bookingOrderId) ?? input),
      ...input
    });
  }

  private walletKey(ownerType: WalletOwnerType, ownerId: number): string {
    return `${ownerType}:${ownerId}:NDP`;
  }
}

describe("LedgerService wallet mutations", () => {
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
});
