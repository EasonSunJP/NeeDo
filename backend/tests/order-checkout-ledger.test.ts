import { LedgerService } from "../src/services/ledger.service";
import { ERROR_CODES } from "../src/constants/error-codes";

describe("formal checkout NDP debit", () => {
  it("debits only the customer's classified wallet and records exact checkout evidence", async () => {
    const repository: Record<string, jest.Mock> = {
      runInTransaction: jest.fn(),
      findTransactionByIdempotencyKey: jest.fn(async () => null),
      findUserAccountClassification: jest.fn(async () => ({ isTestAccount: false })),
      getOrCreateWallet: jest.fn(async () => ({
        id: 33,
        ownerType: "user",
        ownerId: 101,
        currency: "NDP",
        availableBalance: 20_000,
        frozenBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      lockWalletById: jest.fn(async () => ({
        id: 33,
        ownerType: "user",
        ownerId: 101,
        currency: "NDP",
        availableBalance: 20_000,
        frozenBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      applyWalletDelta: jest.fn(async () => ({
        id: 33,
        ownerType: "user",
        ownerId: 101,
        currency: "NDP",
        availableBalance: 4_700,
        frozenBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      createTransaction: jest.fn(async () => ({
        id: 91,
        transactionNo: "TX91",
        idempotencyKey: "checkout:41:ndp:pay:key-0001",
        type: "booking_complete_settlement",
        status: "applied",
        referenceType: "order_checkout_payment",
        referenceId: 41,
        actorUserId: 101,
        amount: 15_300,
        currency: "NDP",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        entries: []
      })),
      createLedgerEntry: jest.fn(async () => ({})),
      createFinanceReconciliation: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    };
    repository.runInTransaction.mockImplementation(async (handler: (value: unknown) => unknown) =>
      handler(repository)
    );
    const ledger = new LedgerService(repository as never);

    await expect(
      ledger.debitCheckoutPayment({
        bookingOrderId: 41,
        checkoutId: 9,
        customerUserId: 101,
        payableNdp: 15_300,
        idempotencyKey: "checkout:41:ndp:pay:key-0001",
        actorUserId: 101
      })
    ).resolves.toEqual({ transactionId: 91 });
    expect(repository.applyWalletDelta).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: 33, availableDelta: -15_300 })
    );
    expect(repository.getOrCreateWallet).toHaveBeenCalledWith({
      ownerType: "user",
      ownerId: 101,
      currency: "NDP"
    });
    expect(repository.lockWalletById).toHaveBeenCalledWith(33);
    expect(repository.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "booking_complete_settlement",
        referenceType: "order_checkout_payment",
        referenceId: 9,
        amount: 15_300
      })
    );
  });

  it("fails before ledger evidence when the customer has insufficient available balance", async () => {
    const repository: Record<string, jest.Mock> = {
      runInTransaction: jest.fn(),
      findTransactionByIdempotencyKey: jest.fn(async () => null),
      findUserAccountClassification: jest.fn(async () => ({ isTestAccount: false })),
      getOrCreateWallet: jest.fn(async () => ({
        id: 33,
        ownerType: "user",
        ownerId: 101,
        currency: "NDP",
        availableBalance: 2,
        frozenBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      lockWalletById: jest.fn(async () => ({
        id: 33,
        ownerType: "user",
        ownerId: 101,
        currency: "NDP",
        availableBalance: 2,
        frozenBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      applyWalletDelta: jest.fn(async () => null),
      createTransaction: jest.fn(),
      createLedgerEntry: jest.fn(),
      createFinanceReconciliation: jest.fn(),
      createAuditLog: jest.fn()
    };
    repository.runInTransaction.mockImplementation(async (handler: (value: unknown) => unknown) =>
      handler(repository)
    );
    await expect(
      new LedgerService(repository as never).debitCheckoutPayment({
        bookingOrderId: 41,
        checkoutId: 9,
        customerUserId: 101,
        payableNdp: 15_300,
        idempotencyKey: "checkout-insufficient-01",
        actorUserId: 101
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.WALLET_INSUFFICIENT_AVAILABLE });
    expect(repository.createTransaction).not.toHaveBeenCalled();
    expect(repository.createLedgerEntry).not.toHaveBeenCalled();
  });

  it("isolates test accounts in TEST_NDP and omits production reconciliation", async () => {
    const repository: Record<string, jest.Mock> = {
      runInTransaction: jest.fn(),
      findTransactionByIdempotencyKey: jest.fn(async () => null),
      findUserAccountClassification: jest.fn(async () => ({ isTestAccount: true })),
      getOrCreateWallet: jest.fn(async () => ({
        id: 44,
        ownerType: "user",
        ownerId: 101,
        currency: "TEST_NDP",
        availableBalance: 100,
        frozenBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      lockWalletById: jest.fn(async () => ({
        id: 44,
        ownerType: "user",
        ownerId: 101,
        currency: "TEST_NDP",
        availableBalance: 100,
        frozenBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      applyWalletDelta: jest.fn(async () => ({
        id: 44,
        ownerType: "user",
        ownerId: 101,
        currency: "TEST_NDP",
        availableBalance: 90,
        frozenBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      createTransaction: jest.fn(async (input: Record<string, unknown>) => ({
        id: 92,
        transactionNo: "TX92",
        status: "applied",
        createdAt: new Date(),
        updatedAt: new Date(),
        entries: [],
        metadata: input.metadata,
        ...input
      })),
      createLedgerEntry: jest.fn(async () => ({})),
      createFinanceReconciliation: jest.fn(),
      createAuditLog: jest.fn(async () => undefined)
    };
    repository.runInTransaction.mockImplementation(async (handler: (value: unknown) => unknown) =>
      handler(repository)
    );
    await new LedgerService(repository as never).debitCheckoutPayment({
      bookingOrderId: 41,
      checkoutId: 9,
      customerUserId: 101,
      payableNdp: 10,
      idempotencyKey: "checkout-test-account-01",
      actorUserId: 101
    });
    expect(repository.getOrCreateWallet).toHaveBeenCalledWith({
      ownerType: "user",
      ownerId: 101,
      currency: "TEST_NDP"
    });
    expect(repository.createFinanceReconciliation).not.toHaveBeenCalled();
    expect(repository.createAuditLog).toHaveBeenCalledTimes(1);
  });
});
