import { ERROR_CODES } from "../src/constants/error-codes";
import {
  LedgerService,
  type LedgerRepositoryPort,
  type LedgerTransactionPayload,
  type WalletLedgerPayload,
  type WalletOwnerType,
  type WalletPayload
} from "../src/services/ledger.service";

const now = new Date("2026-05-25T00:00:00.000Z");

class InMemoryLedgerRepository implements LedgerRepositoryPort {
  public readonly wallets = new Map<string, WalletPayload>();
  public readonly transactions = new Map<string, LedgerTransactionPayload>();
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

  private walletKey(ownerType: WalletOwnerType, ownerId: number): string {
    return `${ownerType}:${ownerId}:NDP`;
  }
}

describe("LedgerService wallet mutations", () => {
  it("freezes a merchant booking acceptance once for an idempotency key", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const service = new LedgerService(repository);

    const first = await service.freezeBookingAcceptance({
      bookingOrderId: 1,
      shopId: 10,
      actorUserId: 2
    });
    const repeated = await service.freezeBookingAcceptance({
      bookingOrderId: 1,
      shopId: 10,
      actorUserId: 2
    });

    expect(repeated.id).toBe(first.id);
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
    const service = new LedgerService(repository);

    await expect(
      service.freezeBookingAcceptance({
        bookingOrderId: 1,
        shopId: 10,
        actorUserId: 2
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_INSUFFICIENT_AVAILABLE,
      message: "error.wallet.insufficient_available"
    });
  });

  it("settles completion by deducting frozen merchant NDP and crediting the customer reward once", async () => {
    const repository = new InMemoryLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const service = new LedgerService(repository);

    await service.freezeBookingAcceptance({ bookingOrderId: 1, shopId: 10, actorUserId: 2 });
    const first = await service.settleBookingCompletion({
      bookingOrderId: 1,
      shopId: 10,
      customerUserId: 3,
      actorUserId: 2
    });
    const repeated = await service.settleBookingCompletion({
      bookingOrderId: 1,
      shopId: 10,
      customerUserId: 3,
      actorUserId: 2
    });

    expect(repeated.id).toBe(first.id);
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
    const releaseService = new LedgerService(releaseRepository);

    await releaseService.freezeBookingAcceptance({ bookingOrderId: 1, shopId: 10, actorUserId: 2 });
    await releaseService.releaseBookingHold({ bookingOrderId: 1, shopId: 10, actorUserId: 3 });

    expect(releaseRepository.wallets.get("shop:10:NDP")).toMatchObject({
      availableBalance: 1000,
      frozenBalance: 0
    });

    const compensationRepository = new InMemoryLedgerRepository();
    compensationRepository.seedWallet({ ownerType: "shop", ownerId: 10, availableBalance: 1000 });
    const compensationService = new LedgerService(compensationRepository);

    await compensationService.freezeBookingAcceptance({
      bookingOrderId: 2,
      shopId: 10,
      actorUserId: 2
    });
    await compensationService.compensateCustomerForMerchantCancellation({
      bookingOrderId: 2,
      shopId: 10,
      customerUserId: 3,
      actorUserId: 2
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
});
