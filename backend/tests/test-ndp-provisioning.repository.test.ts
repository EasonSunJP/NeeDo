import { TestNdpProvisioningRepository } from "../src/repositories/test-ndp-provisioning.repository";

describe("TestNdpProvisioningRepository", () => {
  it("records one immutable calibration without changing frozen Test NDP", async () => {
    const client = {
      wallet: { updateMany: jest.fn(async () => ({ count: 1 })) },
      ledgerTransaction: {
        create: jest.fn(async () => ({ id: 301 }))
      },
      walletLedger: { create: jest.fn(async () => ({ id: 401 })) },
      auditLog: { create: jest.fn(async () => ({ id: 501 })) }
    };
    const repository = new TestNdpProvisioningRepository(client as never);

    await expect(
      repository.createCalibration({
        idempotencyKey: "exchange-test-ndp-v1:user:41:calibrate",
        userId: 41,
        walletId: 91,
        amount: 60_000,
        direction: "available_credit",
        availableDelta: 60_000,
        currency: "TEST_NDP",
        frozenBalance: 17,
        targetAvailableBalance: 100_000
      })
    ).resolves.toEqual({
      status: "applied",
      userId: 41,
      adjustmentAmount: 60_000,
      availableBalance: 100_000
    });
    expect(client.wallet.updateMany).toHaveBeenCalledWith({
      where: {
        id: 91,
        ownerType: "USER",
        ownerId: 41,
        currency: "TEST_NDP",
        availableBalance: 40_000,
        frozenBalance: 17,
        deletedAt: null
      },
      data: { availableBalance: { increment: 60_000 } }
    });
    expect(client.ledgerTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "TEST_BALANCE_CALIBRATION",
        amount: 60_000,
        currency: "TEST_NDP",
        actorUserId: null
      })
    });
    expect(client.walletLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: "AVAILABLE_CREDIT",
        availableDelta: 60_000,
        frozenDelta: 0,
        availableBalanceAfter: 100_000,
        frozenBalanceAfter: 17
      })
    });
    expect(client.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        action: "ledger.test_ndp.balance_calibrated",
        targetType: "ledger_transaction",
        targetId: 301
      })
    });
  });

  it("uses a zero transaction as the durable marker without a zero-value ledger entry", async () => {
    const client = {
      ledgerTransaction: { create: jest.fn(async () => ({ id: 302 })) },
      walletLedger: { create: jest.fn() },
      auditLog: { create: jest.fn(async () => ({ id: 502 })) }
    };
    const repository = new TestNdpProvisioningRepository(client as never);

    await repository.recordZeroCalibration({
      idempotencyKey: "exchange-test-ndp-v1:user:42:calibrate",
      userId: 42,
      walletId: 92,
      availableBalance: 100_000,
      frozenBalance: 23,
      currency: "TEST_NDP"
    });

    expect(client.ledgerTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 0, currency: "TEST_NDP" })
    });
    expect(client.walletLedger.create).not.toHaveBeenCalled();
    expect(client.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
