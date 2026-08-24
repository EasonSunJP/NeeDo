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

const createRepository = (availableBalance = 1000) => {
  let wallet = {
    id: 3,
    ownerType: "shop" as const,
    ownerId: 7,
    currency: "NDP" as const,
    availableBalance,
    frozenBalance: 0,
    createdAt: now,
    updatedAt: now
  };
  let request: Record<string, unknown> | null = null;
  const repository: Record<string, jest.Mock> = {};
  Object.assign(repository, {
    runInTransaction: jest.fn(async (handler: (repository: unknown, transactionClient: unknown) => Promise<unknown>) => handler(repository, {})),
    findWalletAdjustmentByIdempotencyKey: jest.fn(async () => request),
    createWalletAdjustmentRequest: jest.fn(async (input: Record<string, unknown>) => {
      request = {
        id: 41,
        type: input.type,
        status: "pending",
        ownerType: input.ownerType,
        ownerId: input.ownerId,
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
    listWalletAdjustmentRequests: jest.fn(async () => ({ list: request ? [request] : [], total: request ? 1 : 0, page: 1, page_size: 20 })),
    lockWalletAdjustmentRequest: jest.fn(async () => request),
    approveWalletAdjustmentRequest: jest.fn(async (input: Record<string, unknown>) => {
      request = { ...request, status: "approved", reviewedById: input.reviewedById, reviewedAt: now, reviewNote: input.reviewNote ?? null, ledgerTransactionId: input.ledgerTransactionId };
      return request;
    }),
    rejectWalletAdjustmentRequest: jest.fn(async (input: Record<string, unknown>) => {
      request = { ...request, status: "rejected", reviewedById: input.reviewedById, reviewedAt: now, reviewNote: input.reviewNote };
      return request;
    }),
    findTransactionByIdempotencyKey: jest.fn(async () => null),
    getOrCreateWallet: jest.fn(async () => wallet),
    applyWalletDelta: jest.fn(async (input: { availableDelta: number; requireAvailableAtLeast?: number }) => {
      if (input.requireAvailableAtLeast && wallet.availableBalance < input.requireAvailableAtLeast) return null;
      wallet = { ...wallet, availableBalance: wallet.availableBalance + input.availableDelta };
      return wallet;
    }),
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
      currency: "NDP",
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
      entries: []
    })),
    createLedgerEntry: jest.fn(async (input: Record<string, unknown>) => ({ id: 61, createdAt: now, ...input })),
    createFinanceReconciliation: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async () => undefined),
    findWallet: jest.fn(async (input: { ownerType: string; ownerId: number }) =>
      input.ownerType === wallet.ownerType && input.ownerId === wallet.ownerId ? wallet : null
    ),
    listWalletLedger: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 }))
  });
  return repository;
};

describe("LedgerService wallet adjustment requests", () => {
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

    await expect(service.getMyWallet(merchant)).resolves.toMatchObject({ ownerType: "shop", ownerId: 7 });
    await expect(service.listWalletLedger(merchant, { walletId: 3, page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0 });
    await expect(service.listWalletLedger(merchant, { walletId: 999, page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_NOT_FOUND,
      message: "error.wallet.not_found"
    });
  });
});
