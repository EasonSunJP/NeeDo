import { ERROR_CODES } from "../src/constants/error-codes";
import { LedgerRepository } from "../src/repositories/ledger.repository";
import { LedgerService } from "../src/services/ledger.service";

describe("LedgerRepository wallet creation", () => {
  it("resolves a technician profile to its global active user wallet owner", async () => {
    const findFirst = jest.fn().mockResolvedValue({ userId: 501 });
    const repository = new LedgerRepository({
      technicianProfile: { findFirst }
    } as never);

    await expect(repository.findTechnicianUserId(9)).resolves.toBe(501);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 9,
        deletedAt: null,
        user: { deletedAt: null }
      },
      select: { userId: true }
    });
  });

  it("persists the complete immutable platform-fee acceptance snapshot", async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const client = {
      orderFinancial: {
        findUnique: jest.fn().mockResolvedValue(null),
        create
      }
    };
    const repository = new LedgerRepository(client as never);
    const acceptedAt = new Date("2026-08-29T01:00:00.000Z");

    await repository.upsertOrderFinancial({
      bookingOrderId: 71,
      orderType: "booking",
      customerUserId: 3,
      shopId: 10,
      technicianProfileId: 9,
      serviceAmountJpy: 8800,
      platformFeePayerType: "technician",
      platformFeePayerId: 9,
      platformFeeEnabledSnapshot: true,
      platformFeeGlobalVersion: 6,
      platformFeePolicyVersion: 4,
      platformFeeAmountNdpSnapshot: 500,
      platformFeeWalletOwnerType: "user",
      platformFeeWalletOwnerId: 77,
      platformFeeWalletId: 91,
      platformFeeShortfallNdp: 380,
      platformFeeOutstandingNdp: 380,
      platformFeeDebtStatus: "outstanding",
      platformFeeAcceptedAt: acceptedAt,
      platformFeeOverdraftConfirmationKey: "fee-confirm-order-71",
      platformFeePreviewVersion: `sha256:${"a".repeat(64)}`,
      userRewardEligibleNdp: 100,
      userRewardStatus: "pending",
      userRewardDeadlineAt: null,
      userRewardGrantedAt: null
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingOrderId: 71,
        platformFeeEnabledSnapshot: true,
        platformFeeGlobalVersion: 6,
        platformFeePolicyVersion: 4,
        platformFeeAmountNdpSnapshot: 500,
        platformFeeWalletOwnerType: "USER",
        platformFeeWalletOwnerId: 77,
        platformFeeWalletId: 91,
        platformFeeShortfallNdp: 380,
        platformFeeOutstandingNdp: 380,
        platformFeeDebtStatus: "OUTSTANDING",
        platformFeeAcceptedAt: acceptedAt,
        platformFeeOverdraftConfirmationKey: "fee-confirm-order-71",
        userRewardEligibleNdp: 100,
        userRewardStatus: "PENDING",
        userRewardDeadlineAt: null,
        userRewardGrantedAt: null
      })
    });
  });

  it("looks up an overdraft confirmation key without exposing the financial row", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      bookingOrderId: 71,
      platformFeePreviewVersion: `sha256:${"a".repeat(64)}`
    });
    const repository = new LedgerRepository({ orderFinancial: { findFirst } } as never);

    await expect(
      repository.findOrderFinancialByOverdraftConfirmationKey("fee-confirm-order-71")
    ).resolves.toEqual({
      bookingOrderId: 71,
      previewVersion: `sha256:${"a".repeat(64)}`
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        platformFeeOverdraftConfirmationKey: "fee-confirm-order-71",
        deletedAt: null
      },
      select: {
        bookingOrderId: true,
        platformFeePreviewVersion: true
      }
    });
  });

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
