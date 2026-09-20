import { LedgerService } from "../src/services/ledger.service";

const now = new Date("2026-09-20T02:00:00.000Z");
const wallet = {
  id: 9,
  ownerType: "user" as const,
  ownerId: 41,
  currency: "TEST_NDP" as const,
  availableBalance: 10_000,
  frozenBalance: 0,
  createdAt: now,
  updatedAt: now
};
const hold = {
  id: 10,
  ownerType: "user" as const,
  ownerId: 41,
  bookingOrderId: 71,
  exchangePostId: null,
  feeType: "service_prepayment" as const,
  holdAmountNdp: 3_000,
  capturedAmountNdp: 0,
  releasedAmountNdp: 0,
  currency: "TEST_NDP" as const,
  status: "active" as const,
  idempotencyKey: "booking:71:service-prepayment",
  calculationLogId: null,
  metadata: null,
  capturedAt: null,
  releasedAt: null,
  createdAt: now,
  updatedAt: now
};

const fixture = () => {
  const repository: Record<string, jest.Mock> = {
    runInTransaction: jest.fn(async (handler) => handler(repository, { tx: true })),
    findWalletHoldByIdempotencyKey: jest.fn().mockResolvedValue(null),
    findWalletHoldById: jest.fn().mockResolvedValue(hold),
    findUserAccountClassification: jest.fn().mockResolvedValue({ isTestAccount: true }),
    getOrCreateWallet: jest.fn().mockResolvedValue(wallet),
    applyWalletDelta: jest.fn()
      .mockResolvedValueOnce({ ...wallet, availableBalance: 7_000, frozenBalance: 3_000 })
      .mockResolvedValueOnce({ ...wallet, availableBalance: 10_000, frozenBalance: 0 }),
    createWalletHold: jest.fn().mockResolvedValue(hold),
    updateWalletHold: jest.fn().mockResolvedValue({
      ...hold,
      status: "released",
      releasedAmountNdp: 3_000,
      releasedAt: now
    }),
    createTransaction: jest.fn()
      .mockResolvedValueOnce({ id: 21, currency: "TEST_NDP" })
      .mockResolvedValueOnce({ id: 22, currency: "TEST_NDP" }),
    createLedgerEntry: jest.fn().mockResolvedValue({}),
    createAuditLog: jest.fn().mockResolvedValue(undefined)
  };
  return {
    repository,
    service: new LedgerService(repository as never, undefined, undefined, () => now)
  };
};

describe("LedgerService service prepayment", () => {
  it("freezes the exact NDP amount with service-only evidence", async () => {
    const { repository, service } = fixture();
    await expect(service.freezeServicePrepayment({
      subject: { type: "booking", id: 71 },
      actorUserId: 41,
      walletOwnerType: "user",
      walletOwnerId: 41,
      amountNdp: 3_000,
      amountJpy: 3_000,
      baseAmountJpy: 10_000,
      percent: 30,
      idempotencyKey: "booking:71:service-prepayment",
      exchangeRate: { ruleId: 1, version: 1, ndpUnits: 1, jpyUnits: 1 }
    })).resolves.toMatchObject({ feeType: "service_prepayment", holdAmountNdp: 3_000 });
    expect(repository.applyWalletDelta).toHaveBeenNthCalledWith(1, {
      walletId: 9,
      availableDelta: -3_000,
      frozenDelta: 3_000,
      requireAvailableAtLeast: 3_000
    });
    expect(repository.createTransaction).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ type: "service_prepayment_freeze" })
    );
  });

  it("releases only an active service-prepayment hold", async () => {
    const { repository, service } = fixture();
    await expect(service.releaseServicePrepayment({
      walletHoldId: 10,
      actorUserId: 41,
      idempotencyKey: "booking:71:service-prepayment:release"
    })).resolves.toMatchObject({ status: "released", releasedAmountNdp: 3_000 });
    expect(repository.applyWalletDelta).toHaveBeenNthCalledWith(1, {
      walletId: 9,
      availableDelta: 3_000,
      frozenDelta: -3_000,
      requireFrozenAtLeast: 3_000
    });
    expect(repository.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "service_prepayment_release" })
    );
  });
});
