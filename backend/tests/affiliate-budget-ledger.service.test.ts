import { ERROR_CODES } from "../src/constants/error-codes";
import {
  LedgerService,
  type LedgerRepositoryPort,
  type LedgerTransactionClient,
  type LedgerTransactionPayload,
  type WalletLedgerPayload,
  type WalletOwnerType,
  type WalletPayload
} from "../src/services/ledger.service";
import { ledgerTransactionListQuerySchema } from "../src/validators/ledger.validator";

const now = new Date("2026-08-26T00:00:00.000Z");

class AffiliateBudgetLedgerRepository implements LedgerRepositoryPort {
  public readonly wallets = new Map<string, WalletPayload>();
  public readonly transactions = new Map<string, LedgerTransactionPayload>();
  public readonly entries: WalletLedgerPayload[] = [];
  public readonly reconciliationRows: Array<{
    transactionId: number;
    expectedAmount: number;
    actualAmount: number;
  }> = [];
  public readonly auditRows: Array<{
    action: string;
    actorUserId: number | null;
    targetId: number;
  }> = [];
  public transactionClient: LedgerTransactionClient | undefined;

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
    handler: (
      repository: LedgerRepositoryPort,
      transactionClient?: LedgerTransactionClient
    ) => Promise<T>,
    transactionClient?: LedgerTransactionClient
  ): Promise<T> {
    this.transactionClient = transactionClient;
    return handler(this, transactionClient);
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
    return (
      this.wallets.get(this.walletKey(input.ownerType, input.ownerId)) ??
      this.seedWallet({ ...input, availableBalance: 0 })
    );
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
      input.requireAvailableAtLeast !== undefined &&
      wallet.availableBalance < input.requireAvailableAtLeast
    ) {
      return null;
    }
    if (
      input.requireFrozenAtLeast !== undefined &&
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
      transactionNo: `AFF-LT-${this.transactionId}`,
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
      ...input,
      createdAt: now
    };
    this.entries.push(entry);
    [...this.transactions.values()]
      .find((transaction) => transaction.id === input.transactionId)
      ?.entries.push(entry);
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
      expectedAmount: input.expectedAmount,
      actualAmount: input.actualAmount
    });
  }

  public async createAuditLog(input: {
    actorUserId: number | null;
    action: string;
    targetId: number;
  }): Promise<void> {
    this.auditRows.push(input);
  }

  private walletKey(ownerType: WalletOwnerType, ownerId: number): string {
    return `${ownerType}:${ownerId}:NDP`;
  }
}

describe("LedgerService affiliate task budget operations", () => {
  it("freezes the complete task budget once and records immutable finance evidence", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const wallet = repository.seedWallet({
      ownerType: "merchant_account",
      ownerId: 41,
      availableBalance: 2_500_000
    });
    const service = new LedgerService(repository);
    const input = {
      taskId: 81,
      ownerType: "merchant_account" as const,
      ownerId: 41,
      amountNdp: 2_000_000,
      idempotencyKey: "affiliate-task:81:v1:freeze",
      actorUserId: 7
    };

    const first = await service.freezeAffiliateTaskBudget(input);
    const repeated = await service.freezeAffiliateTaskBudget(input);

    expect(repeated.transaction.id).toBe(first.transaction.id);
    expect(first.walletId).toBe(wallet.id);
    expect(repository.wallets.get("merchant_account:41:NDP")).toMatchObject({
      availableBalance: 500_000,
      frozenBalance: 2_000_000
    });
    expect(repository.entries).toEqual([
      expect.objectContaining({
        direction: "freeze",
        amount: 2_000_000,
        availableDelta: -2_000_000,
        frozenDelta: 2_000_000,
        reason: "affiliate_task_budget_freeze"
      })
    ]);
    expect(repository.reconciliationRows).toEqual([
      expect.objectContaining({ expectedAmount: 2_000_000, actualAmount: 2_000_000 })
    ]);
    expect(repository.auditRows).toEqual([
      expect.objectContaining({
        action: "ledger.affiliate_task_budget.freeze",
        actorUserId: 7
      })
    ]);
  });

  it("rejects insufficient available NDP without financial side effects", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 11, availableBalance: 999 });
    const service = new LedgerService(repository);

    await expect(
      service.freezeAffiliateTaskBudget({
        taskId: 82,
        ownerType: "shop",
        ownerId: 11,
        amountNdp: 1_000,
        idempotencyKey: "affiliate-task:82:v1:freeze",
        actorUserId: 7
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_INSUFFICIENT_AVAILABLE,
      message: "error.wallet.insufficient_available"
    });
    expect(repository.wallets.get("shop:11:NDP")).toMatchObject({
      availableBalance: 999,
      frozenBalance: 0
    });
    expect(repository.transactions.size).toBe(0);
    expect(repository.entries).toHaveLength(0);
    expect(repository.reconciliationRows).toHaveLength(0);
    expect(repository.auditRows).toHaveLength(0);
  });

  it("releases frozen task budget once through a caller transaction", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const wallet = repository.seedWallet({
      ownerType: "shop",
      ownerId: 12,
      availableBalance: 300,
      frozenBalance: 2_000
    });
    const service = new LedgerService(repository);
    const transactionClient = { affiliateTransaction: true };
    const input = {
      taskId: 83,
      walletId: wallet.id,
      ownerType: "shop" as const,
      ownerId: 12,
      amountNdp: 2_000,
      idempotencyKey: "affiliate-task:83:v1:release",
      actorUserId: 9
    };

    const first = await service.releaseAffiliateTaskBudget(input, { transactionClient });
    const repeated = await service.releaseAffiliateTaskBudget(input, { transactionClient });

    expect(repository.transactionClient).toBe(transactionClient);
    expect(repeated.transaction.id).toBe(first.transaction.id);
    expect(repository.wallets.get("shop:12:NDP")).toMatchObject({
      availableBalance: 2_300,
      frozenBalance: 0
    });
    expect(repository.entries).toEqual([
      expect.objectContaining({
        direction: "unfreeze",
        amount: 2_000,
        availableDelta: 2_000,
        frozenDelta: -2_000,
        reason: "affiliate_task_budget_release"
      })
    ]);
    expect(repository.auditRows).toEqual([
      expect.objectContaining({
        action: "ledger.affiliate_task_budget.release",
        actorUserId: 9
      })
    ]);
  });

  it("rejects a release that exceeds frozen NDP without side effects", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const wallet = repository.seedWallet({
      ownerType: "shop",
      ownerId: 13,
      availableBalance: 500,
      frozenBalance: 999
    });
    const service = new LedgerService(repository);

    await expect(
      service.releaseAffiliateTaskBudget({
        taskId: 84,
        walletId: wallet.id,
        ownerType: "shop",
        ownerId: 13,
        amountNdp: 1_000,
        idempotencyKey: "affiliate-task:84:v1:release",
        actorUserId: 9
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_INSUFFICIENT_FROZEN,
      message: "error.wallet.insufficient_frozen"
    });
    expect(repository.wallets.get("shop:13:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 999
    });
    expect(repository.transactions.size).toBe(0);
    expect(repository.entries).toHaveLength(0);
  });
});

describe("affiliate ledger finance filters", () => {
  it.each(["affiliate_task_budget_freeze", "affiliate_task_budget_release"])(
    "accepts %s as a formal transaction type",
    (type) => {
      expect(ledgerTransactionListQuerySchema.parse({ type })).toMatchObject({ type });
    }
  );
});
