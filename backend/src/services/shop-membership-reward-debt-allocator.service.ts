import type {
  LedgerTransactionClient,
  MembershipRewardDebtAllocatorPort,
  SettleShopMembershipRewardInput,
  ShopMembershipRewardLedgerResult
} from "./ledger.service";

const PENDING_REWARD_BATCH_SIZE = 100;

export interface PendingShopMembershipReward {
  id: number;
  shopId: number;
  customerUserId: number;
  customerRewardNdp: number;
  platformFeeNdp: number;
  platformFeeRateBps: number;
  totalShopDebitNdp: number;
  outstandingRewardNdp: number;
  rewardStatus: "pending_funds";
}

export interface ShopMembershipRewardDebtRepositoryPort {
  listPendingRewardIds: (
    shopId: number,
    limit: number,
    transactionClient?: LedgerTransactionClient
  ) => Promise<number[]>;
  lockPendingReward: (
    redemptionId: number,
    transactionClient?: LedgerTransactionClient
  ) => Promise<PendingShopMembershipReward | null>;
  markPendingRewardPaid: (
    input: {
      redemptionId: number;
      expectedOutstandingRewardNdp: number;
      shopWalletId: number;
      customerWalletId: number;
      platformWalletId: number | null;
      ledgerTransactionId: number;
      actorUserId: number;
      settledAt: Date;
    },
    transactionClient?: LedgerTransactionClient
  ) => Promise<void>;
}

type SettlementPort = {
  settleShopMembershipReward: (
    input: SettleShopMembershipRewardInput,
    context?: { transactionClient?: LedgerTransactionClient }
  ) => Promise<ShopMembershipRewardLedgerResult | null>;
};

export class ShopMembershipRewardDebtAllocator implements MembershipRewardDebtAllocatorPort {
  public constructor(
    private readonly repository: ShopMembershipRewardDebtRepositoryPort,
    private readonly settlement: SettlementPort,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async allocatePendingForShopWallet(input: {
    walletId: number;
    shopId: number;
    actorUserId: number;
    transactionClient?: LedgerTransactionClient;
  }): Promise<void> {
    const ids = await this.repository.listPendingRewardIds(
      input.shopId,
      PENDING_REWARD_BATCH_SIZE,
      input.transactionClient
    );
    for (const redemptionId of ids) {
      const pending = await this.repository.lockPendingReward(
        redemptionId,
        input.transactionClient
      );
      if (
        !pending ||
        pending.shopId !== input.shopId ||
        pending.rewardStatus !== "pending_funds" ||
        pending.totalShopDebitNdp <= 0 ||
        pending.outstandingRewardNdp !== pending.totalShopDebitNdp
      )
        return;

      const settled = await this.settlement.settleShopMembershipReward(
        {
          redemptionId: pending.id,
          shopId: pending.shopId,
          customerUserId: pending.customerUserId,
          customerRewardNdp: pending.customerRewardNdp,
          platformFeeNdp: pending.platformFeeNdp,
          platformFeeRateBps: pending.platformFeeRateBps,
          idempotencyKey: `membership-redemption:${pending.id}:reward:settlement`,
          actorUserId: input.actorUserId
        },
        { transactionClient: input.transactionClient }
      );
      if (!settled) return;
      if (settled.shopWalletId !== input.walletId) {
        throw new Error("error.shop_membership_card_redemption.wallet_scope_conflict");
      }
      await this.repository.markPendingRewardPaid(
        {
          redemptionId: pending.id,
          expectedOutstandingRewardNdp: pending.outstandingRewardNdp,
          shopWalletId: settled.shopWalletId,
          customerWalletId: settled.customerWalletId,
          platformWalletId: settled.platformWalletId,
          ledgerTransactionId: settled.transaction.id,
          actorUserId: input.actorUserId,
          settledAt: this.now()
        },
        input.transactionClient
      );
    }
  }
}
