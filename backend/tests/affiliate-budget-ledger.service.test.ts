import { ERROR_CODES } from "../src/constants/error-codes";
import {
  LedgerService,
  type LedgerRepositoryPort,
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
    metadata?: unknown;
  }): Promise<void> {
    this.auditRows.push(input);
  }

  private walletKey(ownerType: WalletOwnerType, ownerId: number): string {
    return `${ownerType}:${ownerId}:NDP`;
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
