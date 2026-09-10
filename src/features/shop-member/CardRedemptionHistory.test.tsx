// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customerShopMembershipApi, merchantShopMembershipApi, type ShopMembershipCardRedemption } from "./api";
import { CardRedemptionHistory } from "./CardRedemptionHistory";
import source from "./CardRedemptionHistory.tsx?raw";

const redemption: ShopMembershipCardRedemption = {
  publicId: "00000000-0000-4000-8000-000000000901",
  status: "applied",
  rewardStatus: "pending_funds",
  rewardFacts: {},
  rewardHits: [],
  rawRewardNdp: 1_000,
  customerRewardNdp: 1_000,
  platformFeeRateBps: 1_000,
  platformFeeNdp: 100,
  totalShopDebitNdp: 1_100,
  rewardCapped: false,
  outstandingRewardNdp: 1_100,
  consumedPrincipalJpy: 8_800,
  consumedUses: 0,
  principalBalanceBeforeJpy: 20_000,
  principalBalanceAfterJpy: 11_200,
  remainingUsesBefore: null,
  remainingUsesAfter: null,
  redeemedAt: "2026-09-01T03:00:00.000Z",
  rewardSettledAt: null,
  refundedAt: null,
  createdAt: "2026-09-01T03:00:00.000Z",
  updatedAt: "2026-09-01T03:00:00.000Z",
  card: { publicId: "00000000-0000-4000-8000-000000000902", cardNoMasked: "NMC-********************AABB", name: "青山储值卡", type: "stored_value", status: "active", principalBalanceJpy: 11_200, bonusBalanceJpy: 500, remainingUses: null },
  order: { orderNo: "B202609010001", serviceName: "全身护理", servicePublicId: null, serviceCategoryCode: "body-care", serviceStartedAt: "2026-09-01T01:00:00.000Z", serviceCompletedAt: "2026-09-01T02:00:00.000Z", eligibleAmountJpy: 8_800, paymentStatus: "refunded", paymentRefundedAt: "2026-09-01T04:00:00.000Z" },
  shop: { shopNo: "s000000071", name: "青山护理店" },
  customer: { needoId: "u0000000041", displayName: "王小美" },
  redeemedBy: { needoId: "u0000000009", displayName: "青山店员" },
  ledgerTransactionNo: null,
  refund: null,
  replayed: false
};

const refundedRedemption: ShopMembershipCardRedemption = {
  ...redemption,
  status: "refunded",
  rewardStatus: "reversed",
  outstandingRewardNdp: 0,
  refundedAt: "2026-09-01T05:00:00.000Z",
  refund: {
    publicId: "00000000-0000-4000-8000-000000000903",
    reason: "订单已完成原路退款",
    reversalMode: "ledger_reversed",
    restoredPrincipalJpy: 8_800,
    restoredUses: 0,
    customerRewardReversedNdp: 1_000,
    platformFeeReversedNdp: 100,
    totalShopCreditNdp: 1_100,
    customerBalanceBeforeNdp: 500,
    customerBalanceAfterNdp: -500,
    refundedAt: "2026-09-01T05:00:00.000Z",
    refundedBy: { needoId: "u0000000009", displayName: "青山店主" },
    reversalLedgerTransactionNo: "LT-REV-001"
  }
};

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("CardRedemptionHistory", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("shows card consumption, reward status, platform fee, and no frozen-NDP claim", () => {
    for (const copy of ["核销与退款记录", "已核销", "返点待发放", "客户返点", "平台费", "店铺合计", "不会冻结 NDP", "关联订单完成正式退款后才可退卡", "退款 TEST"]) expect(source).toContain(copy);
    expect(source).toContain("<TestFeatureBadge");
    expect(source).not.toContain("折扣");
  });

  it("uses shop-scoped history for merchants and self-scoped history for customers", async () => {
    const merchantList = vi.spyOn(merchantShopMembershipApi, "redemptions").mockResolvedValue({ list: [redemption], total: 1, page: 1, page_size: 20 });
    const customerList = vi.spyOn(customerShopMembershipApi, "redemptions").mockResolvedValue({ list: [redemption], total: 1, page: 1, page_size: 20 });

    await act(async () => root.render(<CardRedemptionHistory mode="merchant" revision={0} />));
    await flush();
    expect(merchantList).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(document.body.textContent).toContain("王小美");

    await act(async () => root.render(<CardRedemptionHistory mode="customer" revision={0} />));
    await flush();
    expect(customerList).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(document.body.textContent).toContain("青山护理店");
  });

  it("opens owner refund only after formal order refund", async () => {
    vi.spyOn(merchantShopMembershipApi, "redemptions").mockResolvedValue({ list: [{ ...redemption, rewardStatus: "paid", outstandingRewardNdp: 0 }], total: 1, page: 1, page_size: 20 });
    await act(async () => root.render(<CardRedemptionHistory canRefund mode="merchant" revision={0} />));
    await flush();
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("退款"));
    expect(button?.disabled).toBe(false);
    await act(async () => button?.click());
    expect(document.body.textContent).toContain("会员卡退款");
    expect(document.body.textContent).toContain("余额会显示为负数");
  });

  it("shows customer restoration, reversal, and negative-balance evidence", async () => {
    vi.spyOn(customerShopMembershipApi, "redemptions").mockResolvedValue({ list: [refundedRedemption], total: 1, page: 1, page_size: 20 });
    await act(async () => root.render(<CardRedemptionHistory mode="customer" revision={0} />));
    await flush();
    expect(document.body.textContent).toContain("会员卡消费已恢复");
    expect(document.body.textContent).toContain("8,800 本金");
    expect(document.body.textContent).toContain("-1,000 NDP");
    expect(document.body.textContent).toContain("-500");
    expect(document.body.textContent).toContain("自动抵扣");
  });
});
