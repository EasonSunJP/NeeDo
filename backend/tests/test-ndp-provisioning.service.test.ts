import {
  TEST_NDP_BACKFILL_VERSION,
  TEST_NDP_TARGET_AVAILABLE,
  TestNdpProvisioningService,
  type TestNdpProvisioningTransactionPort
} from "../src/services/test-ndp-provisioning.service";

const now = new Date("2026-08-30T00:00:00.000Z");

const makeWallet = (availableBalance: number) => ({
  id: 91,
  ownerType: "user" as const,
  ownerId: 41,
  currency: "TEST_NDP" as const,
  availableBalance,
  frozenBalance: 17,
  createdAt: now,
  updatedAt: now
});

const createFixture = () => {
  const transaction: jest.Mocked<TestNdpProvisioningTransactionPort> = {
    findCalibration: jest.fn(
      async (idempotencyKey: string): ReturnType<TestNdpProvisioningTransactionPort["findCalibration"]> => {
        void idempotencyKey;
        return null;
      }
    ),
    lockUser: jest.fn(
      async (userId: number): ReturnType<TestNdpProvisioningTransactionPort["lockUser"]> => {
        void userId;
        return { id: 41, isTestAccount: true };
      }
    ),
    getOrCreateAndLockTestWallet: jest.fn(
      async (userId: number) => {
        void userId;
        return makeWallet(TEST_NDP_TARGET_AVAILABLE);
      }
    ),
    createCalibration: jest.fn(async (
      input: Parameters<TestNdpProvisioningTransactionPort["createCalibration"]>[0]
    ) => ({
      status: "applied" as const,
      userId: input.userId,
      adjustmentAmount: input.amount,
      availableBalance: TEST_NDP_TARGET_AVAILABLE
    })),
    recordZeroCalibration: jest.fn(async (
      input: Parameters<TestNdpProvisioningTransactionPort["recordZeroCalibration"]>[0]
    ) => ({
      status: "applied" as const,
      userId: input.userId,
      adjustmentAmount: 0,
      availableBalance: input.availableBalance
    })),
    findTestShopAuthorityForUpdate: jest.fn().mockResolvedValue({
      isTestAccount: true,
      activeShopScope: true
    }),
    getOrCreateAndLockTestShopWallet: jest.fn().mockResolvedValue({
      ...makeWallet(TEST_NDP_TARGET_AVAILABLE),
      ownerType: "shop",
      ownerId: 9
    }),
    createShopCalibration: jest.fn(),
    recordZeroShopCalibration: jest.fn()
  };
  const repository = {
    runInTransaction: async <T>(
      handler: (tx: TestNdpProvisioningTransactionPort) => Promise<T>
    ): Promise<T> => handler(transaction)
  };

  return {
    repository,
    transaction,
    service: new TestNdpProvisioningService(repository)
  };
};

describe("TestNdpProvisioningService", () => {
  it("calibrates an authorized test shop to 100000 TEST_NDP", async () => {
    const { transaction, service } = createFixture();
    transaction.findTestShopAuthorityForUpdate = jest.fn().mockResolvedValue({
      isTestAccount: true,
      activeShopScope: true
    });
    transaction.getOrCreateAndLockTestShopWallet = jest
      .fn()
      .mockResolvedValue({ ...makeWallet(20_000), ownerType: "shop", ownerId: 9 });
    transaction.createShopCalibration = jest.fn().mockResolvedValue({
      status: "applied",
      userId: 41,
      shopId: 9,
      adjustmentAmount: 80_000,
      availableBalance: 100_000
    });
    transaction.recordZeroShopCalibration = jest.fn();

    await expect(service.calibrateShop({ shopId: 9, actorUserId: 41 })).resolves.toMatchObject({
      status: "applied",
      shopId: 9,
      availableBalance: 100_000
    });
    expect(transaction.createShopCalibration).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "exchange-request-shop-test-ndp-v1:shop:9:calibrate",
        actorUserId: 41,
        shopId: 9,
        walletId: 91,
        currency: "TEST_NDP",
        availableDelta: 80_000,
        targetAvailableBalance: 100_000
      })
    );
  });

  it.each([
    [{ isTestAccount: false, activeShopScope: true }],
    [{ isTestAccount: true, activeShopScope: false }],
    [null]
  ])("refuses a formal actor or a foreign shop", async (authority) => {
    const { transaction, service } = createFixture();
    transaction.findTestShopAuthorityForUpdate.mockResolvedValue(authority);

    await expect(
      service.calibrateShop({ shopId: 9, actorUserId: 41 })
    ).rejects.toMatchObject({ statusCode: 403, message: "error.forbidden" });
    expect(transaction.getOrCreateAndLockTestShopWallet).not.toHaveBeenCalled();
    expect(transaction.createShopCalibration).not.toHaveBeenCalled();
  });

  it.each([
    [0, 100_000, "available_credit", 100_000],
    [40_000, 60_000, "available_credit", 60_000],
    [100_000, 0, null, 0],
    [125_000, 25_000, "available_debit", -25_000]
  ] as const)(
    "calibrates available balance %s to 100000 without changing frozen funds",
    async (availableBalance, amount, direction, availableDelta) => {
      const { transaction, service } = createFixture();
      transaction.getOrCreateAndLockTestWallet.mockResolvedValue(makeWallet(availableBalance));

      const result = await service.calibrateUser(41);

      expect(result).toMatchObject({
        status: "applied",
        userId: 41,
        adjustmentAmount: amount,
        availableBalance: 100_000
      });
      if (direction) {
        expect(transaction.createCalibration).toHaveBeenCalledWith({
          idempotencyKey: `${TEST_NDP_BACKFILL_VERSION}:user:41:calibrate`,
          userId: 41,
          walletId: 91,
          amount,
          direction,
          availableDelta,
          currency: "TEST_NDP",
          frozenBalance: 17,
          targetAvailableBalance: 100_000
        });
        expect(transaction.recordZeroCalibration).not.toHaveBeenCalled();
      } else {
        expect(transaction.createCalibration).not.toHaveBeenCalled();
        expect(transaction.recordZeroCalibration).toHaveBeenCalledWith({
          idempotencyKey: `${TEST_NDP_BACKFILL_VERSION}:user:41:calibrate`,
          userId: 41,
          walletId: 91,
          availableBalance: 100_000,
          frozenBalance: 17,
          currency: "TEST_NDP"
        });
      }
    }
  );

  it("returns the durable calibration result on repeat execution", async () => {
    const { transaction, service } = createFixture();
    transaction.findCalibration.mockResolvedValue({
      amount: 60_000,
      availableBalanceAfter: 100_000
    });

    await expect(service.calibrateUser(41)).resolves.toEqual({
      status: "already_applied",
      userId: 41,
      adjustmentAmount: 60_000,
      availableBalance: 100_000
    });
    expect(transaction.lockUser).not.toHaveBeenCalled();
    expect(transaction.getOrCreateAndLockTestWallet).not.toHaveBeenCalled();
    expect(transaction.createCalibration).not.toHaveBeenCalled();
  });

  it("rechecks the idempotency marker after obtaining the user lock", async () => {
    const { transaction, service } = createFixture();
    transaction.findCalibration
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ amount: 40_000, availableBalanceAfter: 100_000 });

    await expect(service.calibrateUser(41)).resolves.toEqual({
      status: "already_applied",
      userId: 41,
      adjustmentAmount: 40_000,
      availableBalance: 100_000
    });
    expect(transaction.lockUser).toHaveBeenCalledTimes(1);
    expect(transaction.getOrCreateAndLockTestWallet).not.toHaveBeenCalled();
    expect(transaction.createCalibration).not.toHaveBeenCalled();
  });

  it.each([
    [null, "error.user.not_found"],
    [{ id: 41, isTestAccount: false }, "error.test_ndp.account_not_test"]
  ] as const)("fails closed for an ineligible account", async (user, message) => {
    const { transaction, service } = createFixture();
    transaction.lockUser.mockResolvedValue(user);

    await expect(service.calibrateUser(41)).rejects.toMatchObject({ message });
    expect(transaction.getOrCreateAndLockTestWallet).not.toHaveBeenCalled();
  });
});
