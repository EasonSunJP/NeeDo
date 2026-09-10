import { LedgerService } from "../src/services/ledger.service";

const now = new Date("2026-08-31T06:00:00.000Z");
const transactionClient = { transaction: "exchange-request" };

const wallet = (currency: "NDP" | "TEST_NDP", overrides: Record<string, unknown> = {}) => ({
  id: 91,
  ownerType: "user" as const,
  ownerId: 41,
  currency,
  availableBalance: 100_000,
  frozenBalance: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const financial = (
  state: "held" | "captured" | "released" = "held",
  overrides: Record<string, unknown> = {}
) => ({
  id: 301,
  exchangePostId: 71,
  payerType: "user" as const,
  payerId: 41,
  walletOwnerType: "user" as const,
  walletOwnerId: 41,
  walletId: 91,
  currency: "TEST_NDP" as const,
  feeRuleSetId: 51,
  feeRuleSetVersion: 3,
  feeRuleId: 52,
  feeCalculationLogId: 81,
  walletHoldId: 201,
  amountNdp: 1_000,
  state,
  capturedAt: state === "captured" ? now : null,
  releasedAt: state === "released" ? now : null,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const createFixture = () => {
  const repository: Record<string, jest.Mock> = {};
  Object.assign(repository, {
    runInTransaction: jest.fn(async (handler: (repository: unknown) => Promise<unknown>) =>
      handler(repository)
    ),
    findExchangeRequestFinancialByPostId: jest.fn().mockResolvedValue(null),
    lockExchangeRequestFinancialByPostId: jest.fn().mockResolvedValue(financial()),
    getOrCreateWallet: jest.fn().mockResolvedValue(wallet("TEST_NDP")),
    applyWalletDelta: jest
      .fn()
      .mockResolvedValueOnce(
        wallet("TEST_NDP", { availableBalance: 99_000, frozenBalance: 1_000 })
      ),
    createExchangeRequestFreezeEvidence: jest.fn().mockResolvedValue(financial()),
    findWalletHoldByExchangePostId: jest.fn().mockResolvedValue({
      id: 201,
      ownerType: "user",
      ownerId: 41,
      bookingOrderId: null,
      exchangePostId: 71,
      feeType: "exchange_request_publication_fee",
      holdAmountNdp: 1_000,
      capturedAmountNdp: 0,
      releasedAmountNdp: 0,
      currency: "TEST_NDP",
      status: "active",
      idempotencyKey: "exchange-request:71:freeze",
      calculationLogId: 81,
      metadata: null,
      capturedAt: null,
      releasedAt: null,
      createdAt: now,
      updatedAt: now
    }),
    completeExchangeRequestFinancial: jest
      .fn()
      .mockImplementation(async ({ state }: { state: "captured" | "released" }) =>
        financial(state)
      ),
    createTransaction: jest.fn().mockResolvedValue({
      id: 401,
      transactionNo: "LT-401",
      idempotencyKey: "exchange-request:71:terminal",
      type: "exchange_request_publication_capture",
      status: "applied",
      referenceType: "exchange_request",
      referenceId: 71,
      actorUserId: 41,
      amount: 1_000,
      currency: "TEST_NDP",
      metadata: null,
      createdAt: now,
      updatedAt: now,
      entries: []
    }),
    createLedgerEntry: jest.fn(),
    createFinanceReconciliation: jest.fn(),
    createExchangeRequestReconciliation: jest.fn(),
    createAuditLog: jest.fn()
  });
  const service = new LedgerService(repository as never, undefined, undefined, () => now);

  return { repository, service };
};

const freezeInput = (currency: "NDP" | "TEST_NDP") => ({
  exchangePostId: 71,
  actorUserId: 41,
  payerType: "user" as const,
  payerId: 41,
  walletOwnerType: "user" as const,
  walletOwnerId: 41,
  currency,
  fee: {
    ruleSetId: 51,
    ruleSetVersion: 3,
    ruleId: 52,
    amountNdp: 1_000,
    effectiveFrom: null,
    effectiveTo: null
  },
  feeCalculationLogId: 81,
  occurredAt: now
});

describe("LedgerService Exchange Request publication fee", () => {
  it.each(["NDP", "TEST_NDP"] as const)("freezes one Request fee in %s", async (currency) => {
    const { repository, service } = createFixture();
    repository.getOrCreateWallet.mockResolvedValue(wallet(currency));
    repository.applyWalletDelta.mockResolvedValue(
      wallet(currency, { availableBalance: 99_000, frozenBalance: 1_000 })
    );
    repository.createExchangeRequestFreezeEvidence.mockResolvedValue(
      financial("held", { currency })
    );

    await expect(
      service.freezeExchangeRequestPublication(freezeInput(currency), { transactionClient })
    ).resolves.toMatchObject({ amountNdp: 1_000, currency, state: "held" });
    expect(repository.runInTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      transactionClient
    );
    expect(repository.applyWalletDelta).toHaveBeenCalledWith({
      walletId: 91,
      availableDelta: -1_000,
      frozenDelta: 1_000,
      requireAvailableAtLeast: 1_000
    });
  });

  it("returns the durable financial snapshot when freeze is replayed", async () => {
    const { repository, service } = createFixture();
    repository.findExchangeRequestFinancialByPostId.mockResolvedValue(financial());

    await expect(
      service.freezeExchangeRequestPublication(freezeInput("TEST_NDP"), { transactionClient })
    ).resolves.toMatchObject({ state: "held", amountNdp: 1_000 });
    expect(repository.getOrCreateWallet).not.toHaveBeenCalled();
    expect(repository.applyWalletDelta).not.toHaveBeenCalled();
  });

  it("does not capture a held Request twice", async () => {
    const { repository, service } = createFixture();
    repository.lockExchangeRequestFinancialByPostId.mockResolvedValue(financial("captured"));

    await expect(
      service.captureExchangeRequestPublication(
        { exchangePostId: 71, actorUserId: 41 },
        { transactionClient }
      )
    ).resolves.toMatchObject({ state: "captured" });
    expect(repository.applyWalletDelta).not.toHaveBeenCalled();
    expect(repository.createTransaction).not.toHaveBeenCalled();
  });

  it.each(["NDP", "TEST_NDP"] as const)(
    "captures the exact frozen amount into the same-currency %s platform wallet",
    async (currency) => {
      const { repository, service } = createFixture();
      repository.lockExchangeRequestFinancialByPostId.mockResolvedValue(
        financial("held", { currency })
      );
      repository.findWalletHoldByExchangePostId.mockResolvedValue({
        id: 201,
        ownerType: "user",
        ownerId: 41,
        bookingOrderId: null,
        exchangePostId: 71,
        feeType: "exchange_request_publication_fee",
        holdAmountNdp: 1_000,
        capturedAmountNdp: 0,
        releasedAmountNdp: 0,
        currency,
        status: "active",
        idempotencyKey: "exchange-request:71:freeze",
        calculationLogId: 81,
        metadata: null,
        capturedAt: null,
        releasedAt: null,
        createdAt: now,
        updatedAt: now
      });
      repository.completeExchangeRequestFinancial.mockImplementation(
        async ({ state }: { state: "captured" | "released" }) => financial(state, { currency })
      );
      repository.getOrCreateWallet
        .mockResolvedValueOnce(wallet(currency, { frozenBalance: 1_000 }))
        .mockResolvedValueOnce(
          wallet(currency, {
            id: 501,
            ownerType: "platform",
            ownerId: 1,
            availableBalance: 50_000
          })
        );
      repository.applyWalletDelta
        .mockResolvedValueOnce(wallet(currency, { availableBalance: 99_000, frozenBalance: 0 }))
        .mockResolvedValueOnce(
          wallet(currency, {
            id: 501,
            ownerType: "platform",
            ownerId: 1,
            availableBalance: 51_000
          })
        );

      await expect(
        service.captureExchangeRequestPublication(
          { exchangePostId: 71, actorUserId: 41 },
          { transactionClient }
        )
      ).resolves.toMatchObject({ state: "captured" });
      expect(repository.applyWalletDelta).toHaveBeenNthCalledWith(1, {
        walletId: 91,
        availableDelta: 0,
        frozenDelta: -1_000,
        requireFrozenAtLeast: 1_000
      });
      expect(repository.applyWalletDelta).toHaveBeenNthCalledWith(2, {
        walletId: 501,
        availableDelta: 1_000,
        frozenDelta: 0
      });
      expect(repository.createExchangeRequestReconciliation).toHaveBeenCalledWith({
        transactionId: 401,
        referenceId: 71,
        currency,
        expectedAmount: 1_000,
        actualAmount: 1_000
      });
    }
  );

  it("releases the exact frozen amount to the original available wallet", async () => {
    const { repository, service } = createFixture();
    repository.getOrCreateWallet.mockResolvedValue(
      wallet("TEST_NDP", { availableBalance: 99_000, frozenBalance: 1_000 })
    );
    repository.applyWalletDelta.mockResolvedValue(
      wallet("TEST_NDP", { availableBalance: 100_000, frozenBalance: 0 })
    );

    await expect(
      service.releaseExchangeRequestPublication(
        { exchangePostId: 71, actorUserId: 41 },
        { transactionClient }
      )
    ).resolves.toMatchObject({ state: "released" });
    expect(repository.applyWalletDelta).toHaveBeenCalledTimes(1);
    expect(repository.applyWalletDelta).toHaveBeenCalledWith({
      walletId: 91,
      availableDelta: 1_000,
      frozenDelta: -1_000,
      requireFrozenAtLeast: 1_000
    });
    expect(repository.getOrCreateWallet).not.toHaveBeenCalledWith(
      expect.objectContaining({ ownerType: "platform" })
    );
  });

  it("fails atomically when the payer has insufficient available funds", async () => {
    const { repository, service } = createFixture();
    repository.applyWalletDelta.mockReset().mockResolvedValue(null);

    await expect(
      service.freezeExchangeRequestPublication(freezeInput("TEST_NDP"), { transactionClient })
    ).rejects.toMatchObject({ message: "error.wallet.insufficient_available" });
    expect(repository.createExchangeRequestFreezeEvidence).not.toHaveBeenCalled();
  });

  it("rejects release after capture without changing either wallet", async () => {
    const { repository, service } = createFixture();
    repository.lockExchangeRequestFinancialByPostId.mockResolvedValue(financial("captured"));

    await expect(
      service.releaseExchangeRequestPublication(
        { exchangePostId: 71, actorUserId: 41 },
        { transactionClient }
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.exchange.request_financial_state_conflict"
    });
    expect(repository.applyWalletDelta).not.toHaveBeenCalled();
  });
});
