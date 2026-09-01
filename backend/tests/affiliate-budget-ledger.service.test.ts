import { ERROR_CODES } from "../src/constants/error-codes";
import {
  LedgerService,
  type LedgerRepositoryPort,
  type LedgerCurrency,
  type LedgerTransactionClient,
  type LedgerTransactionPayload,
  type ReleaseAffiliateTaskBudgetInput,
  type WalletLedgerPayload,
  type WalletOwnerType,
  type WalletPayload
} from "../src/services/ledger.service";
import { ledgerTransactionListQuerySchema } from "../src/validators/ledger.validator";

const now = new Date("2026-08-26T00:00:00.000Z");

class AffiliateBudgetLedgerRepository implements LedgerRepositoryPort {
  public readonly accountClassifications = new Map<number, boolean>();
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
    metadata?: unknown;
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
    return (
      this.wallets.get(this.walletKey(input.ownerType, input.ownerId, input.currency)) ??
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

  public async lockWalletById(walletId: number): Promise<WalletPayload | null> {
    return [...this.wallets.values()].find((wallet) => wallet.id === walletId) ?? null;
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
      transactionNo: `AFF-LT-${this.transactionId}`,
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
    currency: "NDP";
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
    metadata?: unknown;
  }): Promise<void> {
    this.auditRows.push(input);
  }

  private walletKey(
    ownerType: WalletOwnerType,
    ownerId: number,
    currency: LedgerCurrency
  ): string {
    return `${ownerType}:${ownerId}:${currency}`;
  }
}

const createExistingAffiliateReleaseTransaction = (
  input: ReleaseAffiliateTaskBudgetInput
): LedgerTransactionPayload => {
  const transactionId = 901;

  return {
    id: transactionId,
    transactionNo: "AFF-LT-901",
    idempotencyKey: input.idempotencyKey,
    type: "affiliate_task_budget_release",
    status: "applied",
    referenceType: "affiliate_task",
    referenceId: input.taskId,
    actorUserId: input.actorUserId,
    amount: input.amountNdp,
    currency: "NDP",
    metadata: {
      taskId: input.taskId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      walletId: input.walletId
    },
    createdAt: now,
    updatedAt: now,
    entries: [
      {
        id: 902,
        transactionId,
        walletId: input.walletId,
        direction: "unfreeze",
        amount: input.amountNdp,
        availableDelta: input.amountNdp,
        frozenDelta: -input.amountNdp,
        availableBalanceAfter: 2_300,
        frozenBalanceAfter: 0,
        reason: "affiliate_task_budget_release",
        createdAt: now
      }
    ]
  };
};

interface ExistingAffiliateReleaseMismatch {
  description: string;
  mutate: (transaction: LedgerTransactionPayload, input: ReleaseAffiliateTaskBudgetInput) => void;
}

describe("LedgerService affiliate task budget operations", () => {
  it.each([
    [false, "NDP"],
    [true, "TEST_NDP"]
  ] as const)("routes isTestAccount=%s affiliate budget freeze through %s", async (isTestAccount, currency) => {
    const repository = new AffiliateBudgetLedgerRepository();
    repository.accountClassifications.set(7, isTestAccount);
    repository.seedWallet({
      ownerType: "merchant_account",
      ownerId: 41,
      availableBalance: 2_500_000,
      currency
    });
    const service = new LedgerService(repository);

    const result = await service.freezeAffiliateTaskBudget({
      taskId: isTestAccount ? 181 : 180,
      ownerType: "merchant_account",
      ownerId: 41,
      amountNdp: 2_000_000,
      idempotencyKey: `affiliate-task:${isTestAccount ? 181 : 180}:v1:freeze`,
      actorUserId: 7
    });

    expect(result.transaction).toMatchObject({ currency });
    expect(repository.wallets.get(`merchant_account:41:${currency}`)).toMatchObject({
      availableBalance: 500_000,
      frozenBalance: 2_000_000,
      currency
    });
    expect(repository.reconciliationRows).toHaveLength(isTestAccount ? 0 : 1);
  });

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

  it("releases frozen task budget once for a system actor", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const wallet = repository.seedWallet({
      ownerType: "shop",
      ownerId: 14,
      availableBalance: 300,
      frozenBalance: 2_000
    });
    const service = new LedgerService(repository);

    const result = await service.releaseAffiliateTaskBudget({
      taskId: 85,
      walletId: wallet.id,
      ownerType: "shop",
      ownerId: 14,
      amountNdp: 2_000,
      idempotencyKey: "affiliate-task:85:v1:release",
      actorUserId: null
    });

    expect(result.transaction).toMatchObject({ actorUserId: null });
    expect(repository.wallets.get("shop:14:NDP")).toMatchObject({
      availableBalance: 2_300,
      frozenBalance: 0
    });
    expect(repository.entries).toEqual([
      expect.objectContaining({
        direction: "unfreeze",
        amount: 2_000,
        availableDelta: 2_000,
        frozenDelta: -2_000
      })
    ]);
    expect(repository.auditRows).toEqual([
      expect.objectContaining({
        action: "ledger.affiliate_task_budget.release",
        actorUserId: null
      })
    ]);
  });

  it("uses the frozen Test NDP wallet currency when a system actor releases budget", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const wallet = repository.seedWallet({
      ownerType: "shop",
      ownerId: 15,
      availableBalance: 300,
      frozenBalance: 2_000,
      currency: "TEST_NDP"
    });
    const service = new LedgerService(repository);

    const result = await service.releaseAffiliateTaskBudget({
      taskId: 185,
      walletId: wallet.id,
      ownerType: "shop",
      ownerId: 15,
      amountNdp: 2_000,
      idempotencyKey: "affiliate-task:185:v1:release",
      actorUserId: null
    });

    expect(result.transaction.currency).toBe("TEST_NDP");
    expect(repository.wallets.get("shop:15:TEST_NDP")).toMatchObject({
      availableBalance: 2_300,
      frozenBalance: 0
    });
    expect(repository.reconciliationRows).toHaveLength(0);
  });

  it.each<ExistingAffiliateReleaseMismatch>([
    {
      description: "a different transaction type",
      mutate: (transaction) => {
        transaction.type = "affiliate_task_budget_freeze";
      }
    },
    {
      description: "a non-applied transaction status",
      mutate: (transaction) => {
        (transaction as unknown as { status: string }).status = "rejected";
      }
    },
    {
      description: "a different reference type",
      mutate: (transaction) => {
        transaction.referenceType = "affiliate_reward";
      }
    },
    {
      description: "a different reference id",
      mutate: (transaction) => {
        transaction.referenceId += 1;
      }
    },
    {
      description: "a different actor",
      mutate: (transaction) => {
        transaction.actorUserId = 10;
      }
    },
    {
      description: "a different transaction amount",
      mutate: (transaction) => {
        transaction.amount -= 1;
      }
    },
    {
      description: "a different currency",
      mutate: (transaction) => {
        (transaction as unknown as { currency: string }).currency = "JPY";
      }
    },
    {
      description: "missing metadata",
      mutate: (transaction) => {
        transaction.metadata = null;
      }
    },
    {
      description: "non-object metadata",
      mutate: (transaction) => {
        transaction.metadata = "affiliate_task";
      }
    },
    {
      description: "non-plain array metadata",
      mutate: (transaction) => {
        transaction.metadata = [];
      }
    },
    {
      description: "metadata with a different task id",
      mutate: (transaction, input) => {
        (transaction.metadata as Record<string, unknown>).taskId = input.taskId + 1;
      }
    },
    {
      description: "metadata with a different owner type",
      mutate: (transaction) => {
        (transaction.metadata as Record<string, unknown>).ownerType = "merchant_account";
      }
    },
    {
      description: "metadata with a different owner id",
      mutate: (transaction, input) => {
        (transaction.metadata as Record<string, unknown>).ownerId = input.ownerId + 1;
      }
    },
    {
      description: "metadata with a different wallet id",
      mutate: (transaction, input) => {
        (transaction.metadata as Record<string, unknown>).walletId = input.walletId + 1;
      }
    },
    {
      description: "metadata with an extra key",
      mutate: (transaction) => {
        (transaction.metadata as Record<string, unknown>).unexpected = true;
      }
    },
    {
      description: "metadata without a required key",
      mutate: (transaction) => {
        delete (transaction.metadata as Record<string, unknown>).taskId;
      }
    },
    {
      description: "metadata with a custom prototype",
      mutate: (transaction) => {
        const metadata = Object.assign(Object.create({ inherited: true }), transaction.metadata);
        transaction.metadata = metadata;
      }
    },
    {
      description: "a missing ledger entry",
      mutate: (transaction) => {
        transaction.entries = [];
      }
    },
    {
      description: "an extra ledger entry",
      mutate: (transaction) => {
        transaction.entries.push({ ...transaction.entries[0], id: 903 });
      }
    },
    {
      description: "a ledger entry for a different transaction",
      mutate: (transaction) => {
        transaction.entries[0].transactionId = transaction.id + 1;
      }
    },
    {
      description: "a ledger entry for a different wallet",
      mutate: (transaction, input) => {
        transaction.entries[0].walletId = input.walletId + 1;
      }
    },
    {
      description: "a ledger entry with a different direction",
      mutate: (transaction) => {
        transaction.entries[0].direction = "frozen_debit";
      }
    },
    {
      description: "a ledger entry with a different amount",
      mutate: (transaction) => {
        transaction.entries[0].amount -= 1;
      }
    },
    {
      description: "a ledger entry with a different available delta",
      mutate: (transaction) => {
        transaction.entries[0].availableDelta -= 1;
      }
    },
    {
      description: "a ledger entry with a different frozen delta",
      mutate: (transaction) => {
        transaction.entries[0].frozenDelta += 1;
      }
    },
    {
      description: "a ledger entry with a different reason",
      mutate: (transaction) => {
        transaction.entries[0].reason = "affiliate_task_budget_freeze";
      }
    }
  ])("rejects an existing release transaction with $description", async ({ mutate }) => {
    const repository = new AffiliateBudgetLedgerRepository();
    const service = new LedgerService(repository);
    const input: ReleaseAffiliateTaskBudgetInput = {
      taskId: 87,
      walletId: 41,
      ownerType: "shop",
      ownerId: 16,
      amountNdp: 2_000,
      idempotencyKey: "affiliate-task:87:v1:release",
      actorUserId: 9
    };
    const transaction = createExistingAffiliateReleaseTransaction(input);
    mutate(transaction, input);
    repository.transactions.set(input.idempotencyKey, transaction);
    const mutationMethods = [
      jest.spyOn(repository, "getOrCreateWallet"),
      jest.spyOn(repository, "applyWalletDelta"),
      jest.spyOn(repository, "createTransaction"),
      jest.spyOn(repository, "createLedgerEntry"),
      jest.spyOn(repository, "createFinanceReconciliation"),
      jest.spyOn(repository, "createAuditLog")
    ];

    await expect(service.releaseAffiliateTaskBudget(input)).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_MUTATION_FAILED,
      message: "error.wallet.mutation_failed"
    });
    for (const method of mutationMethods) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid release amount %p before repository access",
    async (amountNdp) => {
      const repository = new AffiliateBudgetLedgerRepository();
      const wallet = repository.seedWallet({
        ownerType: "shop",
        ownerId: 15,
        availableBalance: 300,
        frozenBalance: 2_000
      });
      const service = new LedgerService(repository);
      const repositoryMethods = [
        jest.spyOn(repository, "runInTransaction"),
        jest.spyOn(repository, "findTransactionByIdempotencyKey"),
        jest.spyOn(repository, "getOrCreateWallet"),
        jest.spyOn(repository, "applyWalletDelta"),
        jest.spyOn(repository, "createTransaction"),
        jest.spyOn(repository, "createLedgerEntry"),
        jest.spyOn(repository, "createFinanceReconciliation"),
        jest.spyOn(repository, "createAuditLog")
      ];

      let error: unknown;

      try {
        await service.releaseAffiliateTaskBudget({
          taskId: 86,
          walletId: wallet.id,
          ownerType: "shop",
          ownerId: 15,
          amountNdp,
          idempotencyKey: `affiliate-task:86:v1:release:${amountNdp}`,
          actorUserId: 9
        });
      } catch (caughtError) {
        error = caughtError;
      }

      expect(error).toMatchObject({
        code: ERROR_CODES.WALLET_MUTATION_FAILED,
        message: "error.wallet.mutation_failed"
      });
      for (const method of repositoryMethods) {
        expect(method).not.toHaveBeenCalled();
      }
      expect(repository.wallets.get("shop:15:NDP")).toMatchObject({
        availableBalance: 300,
        frozenBalance: 2_000
      });
      expect(repository.transactions.size).toBe(0);
      expect(repository.entries).toHaveLength(0);
      expect(repository.reconciliationRows).toHaveLength(0);
      expect(repository.auditRows).toHaveLength(0);
    }
  );

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

describe("LedgerService affiliate reward settlement", () => {
  it("atomically captures publisher frozen NDP into claimant and platform wallets exactly once", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const publisherWallet = repository.seedWallet({
      ownerType: "merchant_account",
      ownerId: 41,
      availableBalance: 500_000,
      frozenBalance: 2_000_000
    });
    const service = new LedgerService(repository);
    const transactionClient = { affiliateRewardTransaction: true };
    const input = {
      taskId: 91,
      attributionId: 191,
      rewardId: 291,
      bookingOrderId: 391,
      publisherOwnerType: "merchant_account" as const,
      publisherOwnerId: 41,
      publisherWalletId: publisherWallet.id,
      claimantUserId: 51,
      rewardNdp: 10_000,
      platformFeeNdp: 1_000,
      platformFeeBps: 1_000,
      idempotencyKey: "affiliate:task:91:booking:391:reward:settlement",
      actorUserId: 7
    };

    const first = await service.settleAffiliateReward(input, { transactionClient });
    const repeated = await service.settleAffiliateReward(input, { transactionClient });

    expect(repository.transactionClient).toBe(transactionClient);
    expect(repeated.transaction.id).toBe(first.transaction.id);
    expect(first.publisherWalletId).toBe(publisherWallet.id);
    expect(first.claimantWalletId).toBe(repository.wallets.get("user:51:NDP")?.id);
    expect(first.platformWalletId).toBe(repository.wallets.get("platform:1:NDP")?.id);
    expect(repository.wallets.get("merchant_account:41:NDP")).toMatchObject({
      availableBalance: 500_000,
      frozenBalance: 1_989_000
    });
    expect(repository.wallets.get("user:51:NDP")).toMatchObject({
      availableBalance: 10_000,
      frozenBalance: 0
    });
    expect(repository.wallets.get("platform:1:NDP")).toMatchObject({
      availableBalance: 1_000,
      frozenBalance: 0
    });
    expect(repository.entries).toEqual([
      expect.objectContaining({
        walletId: publisherWallet.id,
        direction: "frozen_debit",
        amount: 11_000,
        availableDelta: 0,
        frozenDelta: -11_000,
        reason: "affiliate_reward_publisher_frozen_debit"
      }),
      expect.objectContaining({
        walletId: first.claimantWalletId,
        direction: "available_credit",
        amount: 10_000,
        availableDelta: 10_000,
        frozenDelta: 0,
        reason: "affiliate_reward_claimant_available_credit"
      }),
      expect.objectContaining({
        walletId: first.platformWalletId,
        direction: "available_credit",
        amount: 1_000,
        availableDelta: 1_000,
        frozenDelta: 0,
        reason: "affiliate_reward_platform_available_credit"
      })
    ]);
    expect(first.transaction).toMatchObject({
      type: "affiliate_reward_settlement",
      referenceType: "affiliate_reward",
      referenceId: 291,
      amount: 11_000,
      metadata: expect.objectContaining({
        taskId: 91,
        attributionId: 191,
        bookingOrderId: 391,
        publisherWalletId: publisherWallet.id,
        claimantUserId: 51,
        claimantWalletId: first.claimantWalletId,
        platformFeeBps: 1_000,
        rewardNdp: 10_000,
        platformFeeNdp: 1_000,
        platformWalletId: first.platformWalletId
      })
    });
    expect(repository.reconciliationRows).toEqual([
      expect.objectContaining({ expectedAmount: 11_000, actualAmount: 11_000 })
    ]);
    expect(repository.auditRows).toEqual([
      expect.objectContaining({
        action: "ledger.affiliate_reward.settlement",
        actorUserId: 7,
        metadata: expect.objectContaining({
          rewardNdp: 10_000,
          platformFeeNdp: 1_000,
          platformFeeBps: 1_000,
          platformWalletId: first.platformWalletId
        })
      })
    ]);
  });

  it("settles a Test NDP reward only between Test NDP wallets without formal reconciliation", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const publisherWallet = repository.seedWallet({
      ownerType: "merchant_account",
      ownerId: 41,
      availableBalance: 500_000,
      frozenBalance: 2_000,
      currency: "TEST_NDP"
    });
    repository.accountClassifications.set(51, true);
    const service = new LedgerService(repository);

    const result = await service.settleAffiliateReward({
      taskId: 191,
      attributionId: 291,
      rewardId: 391,
      bookingOrderId: 491,
      publisherOwnerType: "merchant_account",
      publisherOwnerId: 41,
      publisherWalletId: publisherWallet.id,
      claimantUserId: 51,
      rewardNdp: 1_000,
      platformFeeNdp: 100,
      platformFeeBps: 1_000,
      idempotencyKey: "affiliate:task:191:booking:491:reward:settlement",
      actorUserId: 7
    });

    expect(result.transaction).toMatchObject({ currency: "TEST_NDP" });
    expect(repository.wallets.get("merchant_account:41:TEST_NDP")).toMatchObject({
      frozenBalance: 900
    });
    expect(repository.wallets.get("user:51:TEST_NDP")).toMatchObject({
      availableBalance: 1_000
    });
    expect(repository.wallets.get("platform:1:TEST_NDP")).toMatchObject({
      availableBalance: 100
    });
    expect(repository.wallets.has("user:51:NDP")).toBe(false);
    expect(repository.wallets.has("platform:1:NDP")).toBe(false);
    expect(repository.reconciliationRows).toHaveLength(0);
  });

  it("rejects a reward that exceeds publisher frozen NDP without side effects", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const publisherWallet = repository.seedWallet({
      ownerType: "shop",
      ownerId: 14,
      availableBalance: 500,
      frozenBalance: 999
    });
    const service = new LedgerService(repository);

    await expect(
      service.settleAffiliateReward({
        taskId: 92,
        attributionId: 192,
        rewardId: 292,
        bookingOrderId: 392,
        publisherOwnerType: "shop",
        publisherOwnerId: 14,
        publisherWalletId: publisherWallet.id,
        claimantUserId: 52,
        rewardNdp: 1_000,
        platformFeeNdp: 0,
        platformFeeBps: 0,
        idempotencyKey: "affiliate:task:92:booking:392:reward:settlement",
        actorUserId: 8
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_INSUFFICIENT_FROZEN,
      message: "error.wallet.insufficient_frozen"
    });
    expect(repository.wallets.get("shop:14:NDP")).toMatchObject({
      availableBalance: 500,
      frozenBalance: 999
    });
    expect(repository.wallets.has("user:52:NDP")).toBe(false);
    expect(repository.transactions.size).toBe(0);
    expect(repository.entries).toHaveLength(0);
    expect(repository.reconciliationRows).toHaveLength(0);
    expect(repository.auditRows).toHaveLength(0);
  });

  it("keeps zero-fee compatibility settlements on the publisher and claimant wallets only", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const publisherWallet = repository.seedWallet({
      ownerType: "shop",
      ownerId: 16,
      availableBalance: 0,
      frozenBalance: 1_000
    });
    const service = new LedgerService(repository);

    const settled = await service.settleAffiliateReward({
      taskId: 94,
      attributionId: 194,
      rewardId: 294,
      bookingOrderId: 394,
      publisherOwnerType: "shop",
      publisherOwnerId: 16,
      publisherWalletId: publisherWallet.id,
      claimantUserId: 54,
      rewardNdp: 1_000,
      platformFeeNdp: 0,
      platformFeeBps: 0,
      idempotencyKey: "affiliate:task:94:booking:394:reward:settlement",
      actorUserId: 8
    });

    expect(settled.platformWalletId).toBeNull();
    expect(repository.wallets.has("platform:1:NDP")).toBe(false);
    expect(settled.transaction.amount).toBe(1_000);
    expect(repository.entries).toHaveLength(2);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid reward amount %s before any wallet mutation",
    async (rewardNdp) => {
      const repository = new AffiliateBudgetLedgerRepository();
      const publisherWallet = repository.seedWallet({
        ownerType: "shop",
        ownerId: 15,
        availableBalance: 500,
        frozenBalance: 2_000
      });
      const service = new LedgerService(repository);

      await expect(
        service.settleAffiliateReward({
          taskId: 93,
          attributionId: 193,
          rewardId: 293,
          bookingOrderId: 393,
          publisherOwnerType: "shop",
          publisherOwnerId: 15,
          publisherWalletId: publisherWallet.id,
          claimantUserId: 53,
          rewardNdp,
          platformFeeNdp: 0,
          platformFeeBps: 0,
          idempotencyKey: "affiliate:task:93:booking:393:reward:settlement",
          actorUserId: 8
        })
      ).rejects.toMatchObject({
        code: ERROR_CODES.WALLET_MUTATION_FAILED,
        message: "error.wallet.mutation_failed"
      });
      expect(repository.wallets.get("shop:15:NDP")).toMatchObject({
        availableBalance: 500,
        frozenBalance: 2_000
      });
      expect(repository.wallets.has("user:53:NDP")).toBe(false);
      expect(repository.transactions.size).toBe(0);
      expect(repository.entries).toHaveLength(0);
    }
  );
});

describe("affiliate ledger finance filters", () => {
  it.each([
    "affiliate_task_budget_freeze",
    "affiliate_task_budget_release",
    "affiliate_reward_settlement"
  ])("accepts %s as a formal transaction type", (type) => {
    expect(ledgerTransactionListQuerySchema.parse({ type })).toMatchObject({ type });
  });
});

describe("LedgerService shop membership reward settlement", () => {
  it("exposes the formal transaction type to finance filters", () => {
    expect(
      ledgerTransactionListQuerySchema.parse({ type: "shop_membership_reward_settlement" })
    ).toMatchObject({ type: "shop_membership_reward_settlement" });
  });

  it("atomically debits the shop available wallet and credits customer plus platform", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const shopWallet = repository.seedWallet({
      ownerType: "shop",
      ownerId: 61,
      availableBalance: 1_100
    });
    const service = new LedgerService(repository);

    const result = await service.settleShopMembershipReward({
      redemptionId: 71,
      shopId: 61,
      customerUserId: 81,
      customerRewardNdp: 1_000,
      platformFeeNdp: 100,
      platformFeeRateBps: 1_000,
      idempotencyKey: "membership-redemption:71:reward:settlement",
      actorUserId: 91
    });

    expect(result).toMatchObject({
      shopWalletId: shopWallet.id,
      customerWalletId: repository.wallets.get("user:81:NDP")?.id,
      platformWalletId: repository.wallets.get("platform:1:NDP")?.id,
      transaction: {
        type: "shop_membership_reward_settlement",
        referenceType: "shop_membership_card_redemption",
        referenceId: 71,
        amount: 1_100
      }
    });
    expect(repository.wallets.get("shop:61:NDP")?.availableBalance).toBe(0);
    expect(repository.wallets.get("user:81:NDP")?.availableBalance).toBe(1_000);
    expect(repository.wallets.get("platform:1:NDP")?.availableBalance).toBe(100);
    expect(repository.entries).toEqual([
      expect.objectContaining({ direction: "available_debit", amount: 1_100, reason: "shop_membership_reward_shop_debit" }),
      expect.objectContaining({ direction: "available_credit", amount: 1_000, reason: "shop_membership_reward_customer_credit" }),
      expect.objectContaining({ direction: "available_credit", amount: 100, reason: "shop_membership_reward_platform_credit" })
    ]);
    expect(repository.reconciliationRows).toEqual([
      expect.objectContaining({ expectedAmount: 1_100, actualAmount: 1_100 })
    ]);
    expect(repository.auditRows).toEqual([
      expect.objectContaining({
        action: "ledger.shop_membership_reward.settlement",
        actorUserId: 91,
        metadata: expect.objectContaining({ customerRewardNdp: 1_000, platformFeeNdp: 100 })
      })
    ]);
  });

  it("returns pending without any partial wallet or ledger mutation when shop funds are short", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 62, availableBalance: 1_099 });
    const service = new LedgerService(repository);

    const result = await service.settleShopMembershipReward({
      redemptionId: 72,
      shopId: 62,
      customerUserId: 82,
      customerRewardNdp: 1_000,
      platformFeeNdp: 100,
      platformFeeRateBps: 1_000,
      idempotencyKey: "membership-redemption:72:reward:settlement",
      actorUserId: 92
    });

    expect(result).toBeNull();
    expect(repository.wallets.get("shop:62:NDP")?.availableBalance).toBe(1_099);
    expect(repository.wallets.has("user:82:NDP")).toBe(false);
    expect(repository.wallets.has("platform:1:NDP")).toBe(false);
    expect(repository.transactions.size).toBe(0);
    expect(repository.entries).toHaveLength(0);
    expect(repository.reconciliationRows).toHaveLength(0);
    expect(repository.auditRows).toHaveLength(0);
  });

  it("keeps a zero-fee settlement balanced without creating a platform wallet", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    repository.seedWallet({ ownerType: "shop", ownerId: 63, availableBalance: 1_000 });
    const service = new LedgerService(repository);

    const result = await service.settleShopMembershipReward({
      redemptionId: 73,
      shopId: 63,
      customerUserId: 83,
      customerRewardNdp: 1_000,
      platformFeeNdp: 0,
      platformFeeRateBps: 0,
      idempotencyKey: "membership-redemption:73:reward:settlement",
      actorUserId: 93
    });

    expect(result?.platformWalletId).toBeNull();
    expect(repository.wallets.has("platform:1:NDP")).toBe(false);
    expect(repository.entries).toHaveLength(2);
  });
});

describe("LedgerService shop membership reward reversal", () => {
  it("exposes the formal reversal transaction type to finance filters", () => {
    expect(
      ledgerTransactionListQuerySchema.parse({ type: "shop_membership_reward_reversal" })
    ).toMatchObject({ type: "shop_membership_reward_reversal" });
  });

  it("reverses customer reward and platform fee exactly while allowing a negative customer balance", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const shopWallet = repository.seedWallet({ ownerType: "shop", ownerId: 64, availableBalance: 0 });
    const customerWallet = repository.seedWallet({ ownerType: "user", ownerId: 84, availableBalance: 500 });
    const platformWallet = repository.seedWallet({ ownerType: "platform", ownerId: 1, availableBalance: 20 });
    const service = new LedgerService(repository);

    const result = await service.reverseShopMembershipReward({
      redemptionId: 74,
      shopId: 64,
      customerUserId: 84,
      customerRewardNdp: 1_000,
      platformFeeNdp: 100,
      shopWalletId: shopWallet.id,
      customerWalletId: customerWallet.id,
      platformWalletId: platformWallet.id,
      idempotencyKey: "membership-redemption:74:refund:reversal",
      actorUserId: 94
    });

    expect(result).toMatchObject({
      customerBalanceBeforeNdp: 500,
      customerBalanceAfterNdp: -500,
      transaction: {
        type: "shop_membership_reward_reversal",
        referenceType: "shop_membership_card_redemption_refund",
        referenceId: 74,
        amount: 1_100
      }
    });
    expect(repository.wallets.get("user:84:NDP")?.availableBalance).toBe(-500);
    expect(repository.wallets.get("platform:1:NDP")?.availableBalance).toBe(-80);
    expect(repository.wallets.get("shop:64:NDP")?.availableBalance).toBe(1_100);
    expect(repository.entries).toEqual([
      expect.objectContaining({ direction: "available_debit", amount: 1_000, reason: "shop_membership_reward_refund_customer_debit" }),
      expect.objectContaining({ direction: "available_debit", amount: 100, reason: "shop_membership_reward_refund_platform_debit" }),
      expect.objectContaining({ direction: "available_credit", amount: 1_100, reason: "shop_membership_reward_refund_shop_credit" })
    ]);
    expect(repository.reconciliationRows).toEqual([
      expect.objectContaining({ expectedAmount: 1_100, actualAmount: 1_100 })
    ]);
    expect(repository.auditRows).toEqual([
      expect.objectContaining({ action: "ledger.shop_membership_reward.reversal", actorUserId: 94 })
    ]);
  });

  it("replays the exact reversal without a second wallet mutation", async () => {
    const repository = new AffiliateBudgetLedgerRepository();
    const shopWallet = repository.seedWallet({ ownerType: "shop", ownerId: 65, availableBalance: 0 });
    const customerWallet = repository.seedWallet({ ownerType: "user", ownerId: 85, availableBalance: 1_000 });
    const service = new LedgerService(repository);
    const input = {
      redemptionId: 75,
      shopId: 65,
      customerUserId: 85,
      customerRewardNdp: 1_000,
      platformFeeNdp: 0,
      shopWalletId: shopWallet.id,
      customerWalletId: customerWallet.id,
      platformWalletId: null,
      idempotencyKey: "membership-redemption:75:refund:reversal",
      actorUserId: 95
    };
    const first = await service.reverseShopMembershipReward(input);
    const second = await service.reverseShopMembershipReward(input);
    expect(second).toEqual(first);
    expect(repository.wallets.get("user:85:NDP")?.availableBalance).toBe(0);
    expect(repository.wallets.get("shop:65:NDP")?.availableBalance).toBe(1_000);
    expect(repository.entries).toHaveLength(2);
  });
});
