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

  it("maps the stored platform-fee settlement snapshot to service-layer statuses", async () => {
    const acceptedAt = new Date("2026-08-29T01:00:00.000Z");
    const deadlineAt = new Date("2026-09-05T01:00:00.000Z");
    const findFirst = jest.fn().mockResolvedValue({
      bookingOrderId: 71,
      customerUserId: 3,
      shopId: 10,
      technicianProfileId: 9,
      platformFeeEnabledSnapshot: true,
      platformFeeAmountNdpSnapshot: 500,
      platformFeeWalletOwnerType: "USER",
      platformFeeWalletOwnerId: 77,
      platformFeeWalletId: 91,
      platformFeeOutstandingNdp: 380,
      platformFeeDebtStatus: "OUTSTANDING",
      platformFeeAcceptedAt: acceptedAt,
      userRewardEligibleNdp: 100,
      userRewardStatus: "PENDING",
      userRewardDeadlineAt: deadlineAt,
      userRewardGrantedAt: null,
      settlementStatus: "settled"
    });
    const repository = new LedgerRepository({ orderFinancial: { findFirst } } as never);

    await expect(repository.findOrderFinancialPlatformFeeSnapshot(71)).resolves.toMatchObject({
      platformFeeWalletOwnerType: "user",
      platformFeeDebtStatus: "outstanding",
      userRewardStatus: "pending",
      settlementStatus: "settled"
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bookingOrderId: 71,
          platformFeeEnabledSnapshot: { not: null },
          deletedAt: null
        }
      })
    );
  });

  it("locks the payer wallet and platform-fee financial row before settlement", async () => {
    const acceptedAt = new Date("2026-08-29T01:00:00.000Z");
    const wallet = {
      id: 91,
      ownerType: "USER",
      ownerId: 77,
      currency: "NDP",
      availableBalance: -380,
      frozenBalance: 500,
      createdAt: acceptedAt,
      updatedAt: acceptedAt,
      deletedAt: null
    };
    const financial = {
      bookingOrderId: 71,
      customerUserId: 3,
      shopId: 10,
      technicianProfileId: 9,
      platformFeeEnabledSnapshot: true,
      platformFeeAmountNdpSnapshot: 500,
      platformFeeWalletOwnerType: "USER",
      platformFeeWalletOwnerId: 77,
      platformFeeWalletId: 91,
      platformFeeOutstandingNdp: 380,
      platformFeeDebtStatus: "OUTSTANDING",
      platformFeeAcceptedAt: acceptedAt,
      userRewardEligibleNdp: 100,
      userRewardStatus: "PENDING",
      userRewardDeadlineAt: null,
      userRewardGrantedAt: null,
      settlementStatus: "holding"
    };
    const queryRaw = jest.fn().mockResolvedValueOnce([wallet]).mockResolvedValueOnce([financial]);
    const repository = new LedgerRepository({
      $queryRaw: queryRaw,
      orderFinancial: { findFirst: jest.fn().mockResolvedValue(financial) }
    } as never);

    await expect(repository.lockWalletById(91)).resolves.toMatchObject({
      id: 91,
      ownerType: "user"
    });
    await expect(repository.lockOrderFinancialPlatformFeeSnapshot(71)).resolves.toMatchObject({
      bookingOrderId: 71,
      platformFeeOutstandingNdp: 380
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("reads the authoritative MySQL clock for reward deadline decisions", async () => {
    const databaseNow = new Date("2026-09-05T00:00:00.000Z");
    const queryRaw = jest.fn().mockResolvedValue([{ now: databaseNow }]);
    const repository = new LedgerRepository({ $queryRaw: queryRaw } as never);

    await expect(repository.getDatabaseNow()).resolves.toEqual(databaseNow);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("finds the active original platform-fee hold without re-resolving its owner", async () => {
    const now = new Date("2026-08-29T01:00:00.000Z");
    const findFirst = jest.fn().mockResolvedValue({
      id: 41,
      ownerType: "USER",
      ownerId: 77,
      bookingOrderId: 71,
      feeType: "b_platform_fee",
      holdAmountNdp: 500,
      capturedAmountNdp: 0,
      releasedAmountNdp: 0,
      status: "ACTIVE",
      idempotencyKey: "booking:71:accept:freeze",
      calculationLogId: 5,
      metadata: null,
      capturedAt: null,
      releasedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    });
    const repository = new LedgerRepository({ walletHold: { findFirst } } as never);

    await expect(repository.findPlatformFeeHoldByBookingOrderId(71)).resolves.toMatchObject({
      ownerType: "user",
      ownerId: 77,
      bookingOrderId: 71,
      status: "active"
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        bookingOrderId: 71,
        feeType: "b_platform_fee",
        status: { in: ["ACTIVE", "PARTIALLY_CAPTURED"] },
        deletedAt: null
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
  });

  it("lists outstanding debt IDs in acceptance FIFO order with a bounded batch", async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }]);
    const repository = new LedgerRepository({ orderFinancial: { findMany } } as never);

    await expect(
      repository.listOutstandingPlatformFeeDebtIds({ walletId: 91, limit: 100 })
    ).resolves.toEqual([11, 12]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        platformFeeWalletId: 91,
        platformFeeDebtStatus: "OUTSTANDING",
        platformFeeOutstandingNdp: { gt: 0 },
        platformFeeAcceptedAt: { not: null },
        deletedAt: null
      },
      select: { id: true },
      orderBy: [{ platformFeeAcceptedAt: "asc" }, { id: "asc" }],
      take: 100
    });
  });

  it("locks one debt row and updates it only from the expected outstanding amount", async () => {
    const acceptedAt = new Date("2026-08-29T01:00:00.000Z");
    const financial = {
      id: 11,
      bookingOrderId: 71,
      customerUserId: 3,
      platformFeeWalletId: 91,
      platformFeeAcceptedAt: acceptedAt,
      platformFeeOutstandingNdp: 380,
      platformFeeDebtStatus: "OUTSTANDING",
      userRewardEligibleNdp: 100,
      userRewardStatus: "PENDING",
      userRewardDeadlineAt: null,
      userRewardGrantedAt: null,
      userRewardNdp: 0,
      settlementStatus: "holding"
    };
    const queryRaw = jest.fn().mockResolvedValue([financial]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new LedgerRepository({
      $queryRaw: queryRaw,
      orderFinancial: { updateMany }
    } as never);

    await expect(repository.lockPlatformFeeDebt(11)).resolves.toMatchObject({
      id: 11,
      platformFeeDebtStatus: "outstanding",
      userRewardStatus: "pending"
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    await expect(
      repository.updatePlatformFeeDebt({
        id: 11,
        expectedOutstandingNdp: 380,
        platformFeeOutstandingNdp: 0,
        platformFeeDebtStatus: "settled",
        userRewardStatus: "immediate",
        userRewardNdp: 0,
        userRewardGrantedAt: null
      })
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 11,
        platformFeeOutstandingNdp: 380,
        platformFeeDebtStatus: "OUTSTANDING",
        deletedAt: null
      },
      data: {
        platformFeeOutstandingNdp: 0,
        platformFeeDebtStatus: "SETTLED",
        userRewardStatus: "IMMEDIATE",
        userRewardNdp: 0,
        userRewardGrantedAt: null
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
    const mapped = await repository.findTransactionByIdempotencyKey("affiliate-task:87:v1:release");
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
