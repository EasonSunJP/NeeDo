import { ERROR_CODES } from "../src/constants/error-codes";
import { LedgerRepository } from "../src/repositories/ledger.repository";
import { LedgerService } from "../src/services/ledger.service";

describe("LedgerRepository wallet creation", () => {
  it("uses an atomic idempotent insert for concurrent wallet creation", async () => {
    const wallet = {
      id: 91,
      ownerType: "USER",
      ownerId: 501,
      currency: "NDP",
      availableBalance: 0,
      frozenBalance: 0,
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      deletedAt: null
    };
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      wallet: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(wallet)
      }
    };
    const repository = new LedgerRepository(client as never);

    await expect(
      repository.getOrCreateWallet({ ownerType: "user", ownerId: 501, currency: "NDP" })
    ).resolves.toMatchObject({ id: 91, ownerType: "user", ownerId: 501 });
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.wallet.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: 501,
          currency: "NDP"
        }
      }
    });
  });

  it("round-trips an alliance wallet through the Prisma owner enum", async () => {
    const wallet = {
      id: 92,
      ownerType: "ALLIANCE",
      ownerId: 42,
      currency: "NDP",
      availableBalance: 0,
      frozenBalance: 0,
      createdAt: new Date("2026-08-28T00:00:00.000Z"),
      updatedAt: new Date("2026-08-28T00:00:00.000Z"),
      deletedAt: null
    };
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      wallet: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(wallet)
      }
    };
    const repository = new LedgerRepository(client as never);

    await expect(
      repository.getOrCreateWallet({ ownerType: "alliance", ownerId: 42, currency: "NDP" })
    ).resolves.toMatchObject({ id: 92, ownerType: "alliance", ownerId: 42 });
    expect(client.wallet.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "ALLIANCE",
          ownerId: 42,
          currency: "NDP"
        }
      }
    });
  });
});

describe("LedgerRepository transaction mapping", () => {
  it("preserves a stored non-NDP currency so affiliate release validation rejects it", async () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    const storedTransaction = {
      id: 901,
      transactionNo: "AFF-LT-901",
      idempotencyKey: "affiliate-task:87:v1:release",
      type: "AFFILIATE_TASK_BUDGET_RELEASE",
      status: "APPLIED",
      referenceType: "affiliate_task",
      referenceId: 87,
      actorUserId: 9,
      amount: 2_000,
      currency: "JPY",
      metadata: {
        taskId: 87,
        ownerType: "shop",
        ownerId: 16,
        walletId: 41
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      entries: [
        {
          id: 902,
          transactionId: 901,
          walletId: 41,
          direction: "UNFREEZE",
          amount: 2_000,
          availableDelta: 2_000,
          frozenDelta: -2_000,
          availableBalanceAfter: 2_300,
          frozenBalanceAfter: 0,
          reason: "affiliate_task_budget_release",
          createdAt: now,
          deletedAt: null
        }
      ]
    };
    const client = {
      ledgerTransaction: {
        findFirst: jest.fn().mockResolvedValue(storedTransaction)
      }
    };
    const repository = new LedgerRepository(client as never);
    const mapped = await repository.findTransactionByIdempotencyKey(
      "affiliate-task:87:v1:release"
    );
    const service = new LedgerService(repository);

    expect(mapped).toMatchObject({ currency: "JPY" });
    await expect(
      service.releaseAffiliateTaskBudget({
        taskId: 87,
        walletId: 41,
        ownerType: "shop",
        ownerId: 16,
        amountNdp: 2_000,
        idempotencyKey: "affiliate-task:87:v1:release",
        actorUserId: 9
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_MUTATION_FAILED,
      message: "error.wallet.mutation_failed"
    });
  });
});
