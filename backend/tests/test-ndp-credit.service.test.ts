import { LedgerService } from "../src/services/ledger.service";
import { ERROR_CODES } from "../src/constants/error-codes";

const actor = { userId: 9 } as never;

function repository(isTestAccount = true) {
  const wallet = {
    id: 44,
    ownerType: "user",
    ownerId: 101,
    currency: "TEST_NDP",
    availableBalance: 100,
    frozenBalance: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const value: Record<string, jest.Mock> = {
    runInTransaction: jest.fn(),
    findTransactionByIdempotencyKey: jest.fn(async () => null),
    findUserAccountClassification: jest.fn(async () => ({ isTestAccount })),
    getOrCreateWallet: jest.fn(async () => wallet),
    lockWalletById: jest.fn(async () => wallet),
    applyWalletDelta: jest.fn(async () => ({ ...wallet, availableBalance: 150 })),
    createTransaction: jest.fn(async (input: Record<string, unknown>) => ({
      id: 88,
      transactionNo: "TX88",
      status: "applied",
      createdAt: new Date(),
      updatedAt: new Date(),
      entries: [],
      ...input
    })),
    createLedgerEntry: jest.fn(async () => ({})),
    createAuditLog: jest.fn(async () => undefined)
  };
  value.runInTransaction.mockImplementation(async (handler: (repo: unknown) => unknown) =>
    handler(value)
  );
  return value;
}

describe("Test NDP manual credit", () => {
  it("credits an eligible test account with ledger and audit evidence but no reconciliation", async () => {
    const repo = repository();
    const result = await new LedgerService(repo as never).creditTestNdp(actor, {
      targetUserId: 101,
      amountNdp: 50,
      reason: "partner demo",
      idempotencyKey: "test-credit-0001"
    });
    expect(result).toMatchObject({ type: "test_ndp_manual_credit", currency: "TEST_NDP" });
    expect(repo.applyWalletDelta).toHaveBeenCalledWith({
      walletId: 44,
      availableDelta: 50,
      frozenDelta: 0
    });
    expect(repo.createLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({
      direction: "available_credit",
      reason: "test_ndp_manual_credit"
    }));
    expect(repo.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "ledger.test_ndp.manual_credit",
      targetId: 101
    }));
    expect(repo.createFinanceReconciliation).toBeUndefined();
  });

  it("rejects a non-test target before creating a wallet", async () => {
    const repo = repository(false);
    await expect(new LedgerService(repo as never).creditTestNdp(actor, {
      targetUserId: 101,
      amountNdp: 50,
      reason: "invalid target",
      idempotencyKey: "test-credit-0002"
    })).rejects.toMatchObject({ code: ERROR_CODES.TEST_NDP_SETTLEMENT_FORBIDDEN });
    expect(repo.getOrCreateWallet).not.toHaveBeenCalled();
  });
});
