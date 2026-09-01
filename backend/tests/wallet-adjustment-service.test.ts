import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { LedgerService } from "../src/services/ledger.service";

const now = new Date("2026-08-25T00:00:00.000Z");
const merchant: AuthenticatedAccessContext = {
  userId: 20,
  email: "merchant@example.com",
  accessTokenJti: "merchant-jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  roles: ["merchant_owner"],
  permissions: ["wallet:adjustment:create", "wallet:adjustment:list"],
  currentIdentityId: 20,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 7
};
const operator: AuthenticatedAccessContext = {
  userId: 1,
  email: "operator@example.com",
  accessTokenJti: "operator-jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  roles: ["operator"],
  permissions: ["backoffice:wallet-adjustment:review"],
  currentIdentityId: 1,
  currentIdentityType: "platform",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null
};
const affiliate: AuthenticatedAccessContext = {
  userId: 30,
  email: "affiliate@example.com",
  accessTokenJti: "affiliate-jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  roles: ["customer", "scout"],
  permissions: ["wallet:adjustment:create"],
  currentIdentityId: 30,
  currentIdentityType: "customer",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null
};

const createRepository = (availableBalance = 1000, isTestAccount = false) => {
  const currency = isTestAccount ? ("TEST_NDP" as const) : ("NDP" as const);
  let wallet = {
    id: 3,
    ownerType: "shop" as const,
    ownerId: 7,
    currency,
    availableBalance,
    frozenBalance: 0,
    createdAt: now,
    updatedAt: now
  };
  let request: Record<string, unknown> | null = null;
  const repository: Record<string, jest.Mock> = {};
  Object.assign(repository, {
    runInTransaction: jest.fn(
      async (handler: (repository: unknown, transactionClient: unknown) => Promise<unknown>) =>
        handler(repository, {})
    ),
    findWalletAdjustmentByIdempotencyKey: jest.fn(async () => request),
    createWalletAdjustmentRequest: jest.fn(async (input: Record<string, unknown>) => {
      request = {
        id: 41,
        type: input.type,
        status: "pending",
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        walletId: input.walletId,
        amountNdp: input.amountNdp,
        idempotencyKey: input.idempotencyKey,
        bankReference: input.bankReference ?? null,
        note: input.note ?? null,
        requestedById: input.requestedById,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        ledgerTransactionId: null,
        createdAt: now,
        updatedAt: now
      };
      return request;
    }),
    listWalletAdjustmentRequests: jest.fn(async () => ({
      list: request ? [request] : [],
      total: request ? 1 : 0,
      page: 1,
      page_size: 20
    })),
    lockWalletAdjustmentRequest: jest.fn(async () => request),
    approveWalletAdjustmentRequest: jest.fn(async (input: Record<string, unknown>) => {
      request = {
        ...request,
        status: "approved",
        reviewedById: input.reviewedById,
        reviewedAt: now,
        reviewNote: input.reviewNote ?? null,
        ledgerTransactionId: input.ledgerTransactionId
      };
      return request;
    }),
    rejectWalletAdjustmentRequest: jest.fn(async (input: Record<string, unknown>) => {
      request = {
        ...request,
        status: "rejected",
        reviewedById: input.reviewedById,
        reviewedAt: now,
        reviewNote: input.reviewNote
      };
      return request;
    }),
    findTransactionByIdempotencyKey: jest.fn(async () => null),
    findUserAccountClassification: jest.fn(async () => ({ isTestAccount })),
    getOrCreateWallet: jest.fn(async () => wallet),
    lockWalletById: jest.fn(async (walletId: number) =>
      wallet.id === walletId ? wallet : null
    ),
    applyWalletDelta: jest.fn(
      async (input: { availableDelta: number; requireAvailableAtLeast?: number }) => {
        if (
          input.requireAvailableAtLeast &&
          wallet.availableBalance < input.requireAvailableAtLeast
        )
          return null;
        wallet = { ...wallet, availableBalance: wallet.availableBalance + input.availableDelta };
        return wallet;
      }
    ),
    createTransaction: jest.fn(async (input: Record<string, unknown>) => ({
      id: 51,
      transactionNo: "NDP202608250051",
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
    })),
    createLedgerEntry: jest.fn(async (input: Record<string, unknown>) => ({
      id: 61,
      createdAt: now,
      ...input
    })),
    createFinanceReconciliation: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async () => undefined),
    getDatabaseNow: jest.fn(async () => now),
    listOutstandingPlatformFeeDebtIds: jest.fn(async () => []),
    lockPlatformFeeDebt: jest.fn(async () => null),
    updatePlatformFeeDebt: jest.fn(async () => true),
    findWallet: jest.fn(async (input: { ownerType: string; ownerId: number }) =>
      input.ownerType === wallet.ownerType && input.ownerId === wallet.ownerId ? wallet : null
    ),
    listWalletLedger: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 }))
  });
  return repository;
};

describe("LedgerService wallet adjustment requests", () => {
  it.each(["topup", "withdrawal"] as const)(
    "rejects %s for a Test NDP account",
    async (type) => {
      const repository = createRepository(1000, true);
      const service = new LedgerService(repository as never);

      await expect(
        service.createWalletAdjustmentRequest(merchant, {
          type,
          amountNdp: 500,
          idempotencyKey: `test-ndp-${type}-forbidden`
        })
      ).rejects.toMatchObject({
        code: ERROR_CODES.TEST_NDP_SETTLEMENT_FORBIDDEN,
        statusCode: 409
      });
      expect(repository.createWalletAdjustmentRequest).not.toHaveBeenCalled();
    }
  );

  it("rejects approval of an existing Test NDP adjustment request", async () => {
    const repository = createRepository(1_000, true);
    await repository.createWalletAdjustmentRequest({
      type: "topup",
      ownerType: "shop",
      ownerId: 7,
      walletId: 3,
      amountNdp: 500,
      idempotencyKey: "existing-test-ndp-topup",
      requestedById: merchant.userId
    });
    const service = new LedgerService(repository as never);

    await expect(
      service.reviewWalletAdjustmentRequest(operator, 41, {
        action: "approve",
        note: "must remain non-settleable"
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.TEST_NDP_SETTLEMENT_FORBIDDEN,
      statusCode: 409
    });
    expect(repository.applyWalletDelta).not.toHaveBeenCalled();
    expect(repository.createTransaction).not.toHaveBeenCalled();
  });

  it("guards affiliate withdrawal creation even when the user is switched to customer identity", async () => {
    const repository = createRepository();
    const eligibility = {
      assertEligible: jest.fn(async () => ({ eKycVerificationId: 11, bankAccountId: 21 }))
    };
    const service = new LedgerService(repository as never, undefined, eligibility, () => now);

    const requestInput = {
      type: "withdrawal" as const,
      amountNdp: 500,
      idempotencyKey: "affiliate-withdrawal-20260826-1"
    };
    await service.createWalletAdjustmentRequest(affiliate, requestInput);
    await service.createWalletAdjustmentRequest(affiliate, requestInput);

    expect(eligibility.assertEligible).toHaveBeenCalledTimes(1);
    expect(eligibility.assertEligible).toHaveBeenCalledWith(30, now);
    expect(repository.createWalletAdjustmentRequest).toHaveBeenCalledTimes(1);
  });

  it("does not create an affiliate withdrawal when eligibility rejects", async () => {
    const repository = createRepository();
    const eligibility = {
      assertEligible: jest.fn(async () => {
        throw new Error("error.affiliate_withdrawal.ekyc_required");
      })
    };
    const service = new LedgerService(repository as never, undefined, eligibility, () => now);

    await expect(
      service.createWalletAdjustmentRequest(affiliate, {
        type: "withdrawal",
        amountNdp: 500,
        idempotencyKey: "affiliate-withdrawal-20260826-2"
      })
    ).rejects.toThrow("error.affiliate_withdrawal.ekyc_required");
    expect(repository.createWalletAdjustmentRequest).not.toHaveBeenCalled();
  });

  it("creates an idempotent merchant shop top-up request and lists only that owner scope", async () => {
    const repository = createRepository();
    const service = new LedgerService(repository as never);
    const input = {
      type: "topup" as const,
      amountNdp: 5000,
      idempotencyKey: "wallet-topup-20260825-1",
      bankReference: "BANK-001",
      note: "银行转账充值"
    };

    const created = await service.createWalletAdjustmentRequest(merchant, input);
    const retry = await service.createWalletAdjustmentRequest(merchant, input);
    await service.listMyWalletAdjustmentRequests(merchant, { page: 1, pageSize: 20 });

    expect(created.id).toBe(41);
    expect(retry.id).toBe(41);
    expect(repository.createWalletAdjustmentRequest).toHaveBeenCalledTimes(1);
    expect(repository.createWalletAdjustmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ ownerType: "shop", ownerId: 7, requestedById: 20 })
    );
    expect(repository.listWalletAdjustmentRequests).toHaveBeenCalledWith(
      expect.objectContaining({ ownerType: "shop", ownerId: 7 })
    );
  });

  it("approves a top-up once and writes one immutable ledger transaction", async () => {
    const repository = createRepository();
    const service = new LedgerService(repository as never);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 5000,
      idempotencyKey: "wallet-topup-20260825-2"
    });

    const approved = await service.reviewWalletAdjustmentRequest(operator, 41, {
      action: "approve",
      note: "到账确认"
    });

    expect(approved.status).toBe("approved");
    expect(repository.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "manual_topup_approved", amount: 5000 })
    );
    expect(repository.createLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "available_credit", availableDelta: 5000 })
    );
    expect(repository.applyWalletDelta).toHaveBeenCalledWith(
      expect.objectContaining({ availableDelta: 5000, frozenDelta: 0 })
    );
    expect(repository.listOutstandingPlatformFeeDebtIds).toHaveBeenCalledWith({
      walletId: 3,
      limit: 100
    });
  });

  it("settles pending membership rewards after the approved shop top-up in the same transaction", async () => {
    const repository = createRepository();
    const allocator = { allocatePendingForShopWallet: jest.fn(async () => undefined) };
    const service = new LedgerService(
      repository as never,
      undefined,
      undefined,
      () => now,
      undefined,
      allocator
    );
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 5_000,
      idempotencyKey: "wallet-topup-membership-reward"
    });

    await service.reviewWalletAdjustmentRequest(operator, 41, {
      action: "approve",
      note: "会员返点补充资金"
    });

    expect(allocator.allocatePendingForShopWallet).toHaveBeenCalledWith({
      walletId: 3,
      shopId: 7,
      actorUserId: 1,
      transactionClient: {}
    });
  });

  it("allocates a partial top-up only to the oldest outstanding debt", async () => {
    const repository = createRepository(-380);
    const debts = installDebtRecords(repository, [
      debtRecord({ id: 1, bookingOrderId: 101, acceptedAt: "2026-08-01", outstanding: 380 }),
      debtRecord({ id: 2, bookingOrderId: 102, acceptedAt: "2026-08-02", outstanding: 200 })
    ]);
    const service = new LedgerService(repository as never, undefined, undefined, () => now);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 100,
      idempotencyKey: "wallet-topup-partial-oldest"
    });

    await service.reviewWalletAdjustmentRequest(operator, 41, {
      action: "approve",
      note: "部分补交"
    });

    expect(debts[0]).toMatchObject({ platformFeeOutstandingNdp: 280 });
    expect(debts[1]).toMatchObject({ platformFeeOutstandingNdp: 200 });
    expect(repository.updatePlatformFeeDebt).toHaveBeenCalledTimes(1);
    expect(repository.updatePlatformFeeDebt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        expectedOutstandingNdp: 380,
        platformFeeOutstandingNdp: 280,
        platformFeeDebtStatus: "outstanding"
      })
    );
  });

  it("settles debts FIFO and leaves top-up excess in the payer wallet", async () => {
    const repository = createRepository(-300);
    const debts = installDebtRecords(repository, [
      debtRecord({ id: 1, bookingOrderId: 101, acceptedAt: "2026-08-01", outstanding: 100 }),
      debtRecord({ id: 2, bookingOrderId: 102, acceptedAt: "2026-08-02", outstanding: 200 })
    ]);
    const service = new LedgerService(repository as never, undefined, undefined, () => now);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 500,
      idempotencyKey: "wallet-topup-fifo-excess"
    });

    await service.reviewWalletAdjustmentRequest(operator, 41, {
      action: "approve",
      note: "完整补交"
    });

    expect(debts).toEqual([
      expect.objectContaining({
        bookingOrderId: 101,
        platformFeeOutstandingNdp: 0,
        platformFeeDebtStatus: "settled"
      }),
      expect.objectContaining({
        bookingOrderId: 102,
        platformFeeOutstandingNdp: 0,
        platformFeeDebtStatus: "settled"
      })
    ]);
    expect(repository.applyWalletDelta).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: 3, availableDelta: 500 })
    );
    await expect(service.getMyWallet(merchant)).resolves.toMatchObject({
      availableBalance: 200
    });
  });

  it("grants one delayed reward when a completed debt is settled before its deadline", async () => {
    const repository = createRepository(-380);
    const debts = installDebtRecords(repository, [
      debtRecord({
        id: 1,
        bookingOrderId: 101,
        acceptedAt: "2026-08-01",
        outstanding: 380,
        settlementStatus: "settled",
        rewardStatus: "pending",
        rewardDeadlineAt: new Date(now.getTime() + 1_000)
      })
    ]);
    const customerWallet = {
      id: 9,
      ownerType: "user" as const,
      ownerId: 30,
      currency: "NDP" as const,
      availableBalance: 0,
      frozenBalance: 0,
      createdAt: now,
      updatedAt: now
    };
    repository.getOrCreateWallet.mockImplementation(async (input: { ownerType: string }) =>
      input.ownerType === "user"
        ? customerWallet
        : {
            id: 3,
            ownerType: "shop",
            ownerId: 7,
            currency: "NDP",
            availableBalance: 0,
            frozenBalance: 0,
            createdAt: now,
            updatedAt: now
          }
    );
    repository.applyWalletDelta.mockImplementation(
      async (input: { walletId: number; availableDelta: number }) => {
        if (input.walletId === customerWallet.id) {
          customerWallet.availableBalance += input.availableDelta;
          return customerWallet;
        }
        return {
          id: 3,
          ownerType: "shop",
          ownerId: 7,
          currency: "NDP",
          availableBalance: 0,
          frozenBalance: 0,
          createdAt: now,
          updatedAt: now
        };
      }
    );
    const service = new LedgerService(repository as never, undefined, undefined, () => now);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 380,
      idempotencyKey: "wallet-topup-delayed-reward"
    });

    await service.reviewWalletAdjustmentRequest(operator, 41, {
      action: "approve",
      note: "期限内补交"
    });

    expect(debts[0]).toMatchObject({
      platformFeeOutstandingNdp: 0,
      platformFeeDebtStatus: "settled",
      userRewardStatus: "paid",
      userRewardNdp: 100,
      userRewardGrantedAt: now
    });
    expect(customerWallet.availableBalance).toBe(100);
    expect(repository.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "booking:101:reward:settlement",
        type: "booking_complete_settlement",
        amount: 100
      })
    );
  });

  it("expires a completed reward settled at its deadline without granting NDP", async () => {
    const repository = createRepository(-380);
    const debts = installDebtRecords(repository, [
      debtRecord({
        id: 1,
        bookingOrderId: 101,
        acceptedAt: "2026-08-01",
        outstanding: 380,
        settlementStatus: "settled",
        rewardStatus: "pending",
        rewardDeadlineAt: now
      })
    ]);
    const service = new LedgerService(repository as never, undefined, undefined, () => now);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 380,
      idempotencyKey: "wallet-topup-expired-reward"
    });

    await service.reviewWalletAdjustmentRequest(operator, 41, {
      action: "approve",
      note: "截止后补交"
    });

    expect(debts[0]).toMatchObject({
      platformFeeOutstandingNdp: 0,
      platformFeeDebtStatus: "settled",
      userRewardStatus: "expired",
      userRewardNdp: 0,
      userRewardGrantedAt: null
    });
    expect(repository.createTransaction).toHaveBeenCalledTimes(1);
  });

  it("uses the database clock when the application clock is still before the reward deadline", async () => {
    const repository = createRepository(-380);
    const debts = installDebtRecords(repository, [
      debtRecord({
        id: 1,
        bookingOrderId: 101,
        acceptedAt: "2026-08-01",
        outstanding: 380,
        settlementStatus: "settled",
        rewardStatus: "pending",
        rewardDeadlineAt: now
      })
    ]);
    const applicationNow = new Date(now.getTime() - 1);
    const service = new LedgerService(
      repository as never,
      undefined,
      undefined,
      () => applicationNow
    );
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 380,
      idempotencyKey: "wallet-topup-database-clock-expired-reward"
    });

    await service.reviewWalletAdjustmentRequest(operator, 41, {
      action: "approve",
      note: "数据库时钟已到截止时间"
    });

    expect(repository.getDatabaseNow).toHaveBeenCalled();
    expect(debts[0]).toMatchObject({
      platformFeeOutstandingNdp: 0,
      platformFeeDebtStatus: "settled",
      userRewardStatus: "expired",
      userRewardNdp: 0,
      userRewardGrantedAt: null
    });
  });

  it("marks debt settled before completion and does not grant the reward early", async () => {
    const repository = createRepository(-380);
    const debts = installDebtRecords(repository, [
      debtRecord({ id: 1, bookingOrderId: 101, acceptedAt: "2026-08-01", outstanding: 380 })
    ]);
    const service = new LedgerService(repository as never, undefined, undefined, () => now);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 380,
      idempotencyKey: "wallet-topup-before-completion"
    });

    await service.reviewWalletAdjustmentRequest(operator, 41, {
      action: "approve",
      note: "完单前补交"
    });

    expect(debts[0]).toMatchObject({
      platformFeeOutstandingNdp: 0,
      platformFeeDebtStatus: "settled",
      userRewardStatus: "immediate",
      userRewardNdp: 0,
      userRewardGrantedAt: null
    });
    expect(repository.createTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not allocate debt twice when the same approved review is retried", async () => {
    const repository = createRepository(-380);
    installDebtRecords(repository, [
      debtRecord({ id: 1, bookingOrderId: 101, acceptedAt: "2026-08-01", outstanding: 380 })
    ]);
    const service = new LedgerService(repository as never, undefined, undefined, () => now);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 380,
      idempotencyKey: "wallet-topup-idempotent-debt"
    });

    await service.reviewWalletAdjustmentRequest(operator, 41, { action: "approve", note: "初次" });
    await service.reviewWalletAdjustmentRequest(operator, 41, { action: "approve", note: "重试" });

    expect(repository.updatePlatformFeeDebt).toHaveBeenCalledTimes(1);
  });

  it("does not approve the top-up when delayed reward settlement fails", async () => {
    const repository = createRepository(-380);
    installDebtRecords(repository, [
      debtRecord({
        id: 1,
        bookingOrderId: 101,
        acceptedAt: "2026-08-01",
        outstanding: 380,
        settlementStatus: "settled",
        rewardStatus: "pending",
        rewardDeadlineAt: new Date(now.getTime() + 1_000)
      })
    ]);
    repository.createLedgerEntry.mockImplementation(async (input: { reason: string }) => {
      if (input.reason === "booking_delayed_customer_reward") {
        throw new Error("ledger write failed");
      }
      return { id: 61, createdAt: now, ...input };
    });
    const service = new LedgerService(repository as never, undefined, undefined, () => now);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "topup",
      amountNdp: 380,
      idempotencyKey: "wallet-topup-reward-failure"
    });

    await expect(
      service.reviewWalletAdjustmentRequest(operator, 41, {
        action: "approve",
        note: "触发失败"
      })
    ).rejects.toThrow("ledger write failed");
    expect(repository.approveWalletAdjustmentRequest).not.toHaveBeenCalled();
  });

  it("rolls back an approved withdrawal when available NDP is insufficient", async () => {
    const repository = createRepository(100);
    const service = new LedgerService(repository as never);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "withdrawal",
      amountNdp: 500,
      idempotencyKey: "wallet-withdrawal-20260825-1"
    });

    await expect(
      service.reviewWalletAdjustmentRequest(operator, 41, { action: "approve", note: "出金" })
    ).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_INSUFFICIENT_AVAILABLE,
      message: "error.wallet.insufficient_available"
    });
    expect(repository.approveWalletAdjustmentRequest).not.toHaveBeenCalled();
    expect(repository.listOutstandingPlatformFeeDebtIds).not.toHaveBeenCalled();
  });

  it("rejects a pending request without changing the wallet", async () => {
    const repository = createRepository();
    const service = new LedgerService(repository as never);
    await service.createWalletAdjustmentRequest(merchant, {
      type: "withdrawal",
      amountNdp: 500,
      idempotencyKey: "wallet-withdrawal-20260825-2"
    });

    const rejected = await service.reviewWalletAdjustmentRequest(operator, 41, {
      action: "reject",
      note: "银行账户资料不完整"
    });

    expect(rejected.status).toBe("rejected");
    expect(repository.createTransaction).not.toHaveBeenCalled();
    expect(repository.applyWalletDelta).not.toHaveBeenCalled();
  });

  it("derives the merchant shop wallet and hides another wallet ledger", async () => {
    const repository = createRepository();
    const service = new LedgerService(repository as never);

    await expect(service.getMyWallet(merchant)).resolves.toMatchObject({
      ownerType: "shop",
      ownerId: 7
    });
    await expect(
      service.listWalletLedger(merchant, { walletId: 3, page: 1, pageSize: 20 })
    ).resolves.toMatchObject({ total: 0 });
    await expect(
      service.listWalletLedger(merchant, { walletId: 999, page: 1, pageSize: 20 })
    ).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_NOT_FOUND,
      message: "error.wallet.not_found"
    });
  });

  it("returns the Test NDP wallet for a test account", async () => {
    const repository = createRepository(100_000, true);
    const service = new LedgerService(repository as never);

    await expect(service.getMyWallet(merchant)).resolves.toMatchObject({
      ownerType: "shop",
      ownerId: 7,
      currency: "TEST_NDP",
      availableBalance: 100_000
    });
    expect(repository.findWallet).toHaveBeenCalledWith({
      ownerType: "shop",
      ownerId: 7,
      currency: "TEST_NDP"
    });
  });
});

interface DebtRecord {
  id: number;
  bookingOrderId: number;
  ndpCurrency: "NDP" | "TEST_NDP";
  customerUserId: number;
  platformFeeWalletId: number;
  platformFeeAcceptedAt: Date;
  platformFeeOutstandingNdp: number;
  platformFeeDebtStatus: "outstanding" | "settled";
  userRewardEligibleNdp: number;
  userRewardStatus: "pending" | "immediate" | "paid" | "expired";
  userRewardDeadlineAt: Date | null;
  userRewardGrantedAt: Date | null;
  userRewardNdp: number;
  settlementStatus: "holding" | "settled";
}

const debtRecord = (input: {
  id: number;
  bookingOrderId: number;
  acceptedAt: string;
  outstanding: number;
  settlementStatus?: "holding" | "settled";
  rewardStatus?: DebtRecord["userRewardStatus"];
  rewardDeadlineAt?: Date | null;
  ndpCurrency?: DebtRecord["ndpCurrency"];
}): DebtRecord => ({
  id: input.id,
  bookingOrderId: input.bookingOrderId,
  ndpCurrency: input.ndpCurrency ?? "NDP",
  customerUserId: 30,
  platformFeeWalletId: 3,
  platformFeeAcceptedAt: new Date(`${input.acceptedAt}T00:00:00.000Z`),
  platformFeeOutstandingNdp: input.outstanding,
  platformFeeDebtStatus: "outstanding",
  userRewardEligibleNdp: 100,
  userRewardStatus: input.rewardStatus ?? "pending",
  userRewardDeadlineAt: input.rewardDeadlineAt ?? null,
  userRewardGrantedAt: null,
  userRewardNdp: 0,
  settlementStatus: input.settlementStatus ?? "holding"
});

const installDebtRecords = (
  repository: Record<string, jest.Mock>,
  debts: DebtRecord[]
): DebtRecord[] => {
  repository.listOutstandingPlatformFeeDebtIds.mockImplementation(
    async ({ walletId, limit }: { walletId: number; limit: number }) =>
      debts
        .filter(
          (debt) =>
            debt.platformFeeWalletId === walletId &&
            debt.platformFeeDebtStatus === "outstanding" &&
            debt.platformFeeOutstandingNdp > 0
        )
        .sort(
          (left, right) =>
            left.platformFeeAcceptedAt.getTime() - right.platformFeeAcceptedAt.getTime() ||
            left.id - right.id
        )
        .slice(0, limit)
        .map((debt) => debt.id)
  );
  repository.lockPlatformFeeDebt.mockImplementation(
    async (id: number) => debts.find((debt) => debt.id === id) ?? null
  );
  repository.updatePlatformFeeDebt.mockImplementation(async (input: Record<string, unknown>) => {
    const debt = debts.find((candidate) => candidate.id === input.id);
    if (!debt || debt.platformFeeOutstandingNdp !== input.expectedOutstandingNdp) {
      return false;
    }
    Object.assign(debt, input);
    return true;
  });

  return debts;
};
