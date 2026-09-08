import {
  ShopMembershipRewardDebtAllocator,
  type PendingShopMembershipReward,
  type ShopMembershipRewardDebtRepositoryPort
} from "../src/services/shop-membership-reward-debt-allocator.service";

const now = new Date("2026-09-01T06:00:00.000Z");

const pending = (id: number, totalShopDebitNdp: number): PendingShopMembershipReward => ({
  id,
  shopId: 71,
  customerUserId: 40 + id,
  customerRewardNdp: totalShopDebitNdp - 100,
  platformFeeNdp: 100,
  platformFeeRateBps: Math.ceil((100 * 10_000) / (totalShopDebitNdp - 100)),
  totalShopDebitNdp,
  outstandingRewardNdp: totalShopDebitNdp,
  rewardStatus: "pending_funds"
});

describe("ShopMembershipRewardDebtAllocator", () => {
  it("settles pending rewards FIFO only when each complete debit is affordable", async () => {
    const rows = [pending(1, 1_100), pending(2, 2_100)];
    const repository: ShopMembershipRewardDebtRepositoryPort = {
      listPendingRewardIds: jest.fn(async () => rows.map((row) => row.id)),
      lockPendingReward: jest.fn(async (id) => rows.find((row) => row.id === id) ?? null),
      markPendingRewardPaid: jest.fn(async () => undefined)
    };
    const settlement = {
      settleShopMembershipReward: jest
        .fn()
        .mockResolvedValueOnce({
          transaction: { id: 501, transactionNo: "LT-501" },
          shopWalletId: 601,
          customerWalletId: 602,
          platformWalletId: 603
        })
        .mockResolvedValueOnce(null)
    };
    const allocator = new ShopMembershipRewardDebtAllocator(
      repository,
      settlement as never,
      () => now
    );
    const transactionClient = { transaction: true };

    await allocator.allocatePendingForShopWallet({
      walletId: 601,
      shopId: 71,
      actorUserId: 9,
      transactionClient
    });

    expect(settlement.settleShopMembershipReward).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ redemptionId: 1, customerRewardNdp: 1_000 }),
      { transactionClient }
    );
    expect(repository.markPendingRewardPaid).toHaveBeenCalledTimes(1);
    expect(repository.markPendingRewardPaid).toHaveBeenCalledWith(
      expect.objectContaining({ redemptionId: 1, ledgerTransactionId: 501, settledAt: now }),
      transactionClient
    );
    expect(settlement.settleShopMembershipReward).toHaveBeenCalledTimes(2);
  });

  it("stops at a stale or unaffordable oldest row instead of bypassing FIFO", async () => {
    const repository: ShopMembershipRewardDebtRepositoryPort = {
      listPendingRewardIds: jest.fn(async () => [1, 2]),
      lockPendingReward: jest.fn(async (id) => (id === 1 ? null : pending(2, 1_100))),
      markPendingRewardPaid: jest.fn(async () => undefined)
    };
    const settlement = { settleShopMembershipReward: jest.fn() };
    const allocator = new ShopMembershipRewardDebtAllocator(
      repository,
      settlement as never,
      () => now
    );

    await allocator.allocatePendingForShopWallet({ walletId: 1, shopId: 71, actorUserId: 9 });

    expect(settlement.settleShopMembershipReward).not.toHaveBeenCalled();
    expect(repository.markPendingRewardPaid).not.toHaveBeenCalled();
  });
});
