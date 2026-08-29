import { describe, expect, it } from "vitest";
import type { AffiliateMarketplaceTask } from "../../api/affiliateMarketplace";
import {
  getDiscountPresentation,
  getMaximumRewardNdp,
  getRemainingPercent,
  getTaskDateWindow,
  getTaskTags
} from "./model";

const task = (overrides: Partial<AffiliateMarketplaceTask> = {}): AffiliateMarketplaceTask => ({
  id: 22,
  taskCode: "AFF-PUBLIC-22",
  name: "Shibuya completed-service reward",
  description: "Earn after the referred service is completed.",
  coverMediaAssetId: null,
  coverImageUrl: "https://cdn.needo.test/task-cover.jpg",
  rewardNdpPerCompletedOrder: 10_000,
  totalBudgetNdp: 2_000_000,
  remainingBudgetNdp: 700_000,
  remainingBudgetBps: 3_500,
  customerDiscountType: "fixed_jpy",
  fixedDiscountJpy: 500,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 5_000,
  claimStartsAt: "2026-09-01T00:00:00.000Z",
  claimEndsAt: "2026-09-20T00:00:00.000Z",
  taskStartsAt: "2026-09-10T00:00:00.000Z",
  taskEndsAt: "2026-09-30T00:00:00.000Z",
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: 20,
  maxCompletedOrdersPerCustomer: 1,
  status: "scheduled",
  claimable: true,
  shops: [
    {
      id: 1,
      shopId: 11,
      shopNameSnapshot: "Shibuya Relax",
      publicId: "shop0000000011",
      city: "Tokyo",
      address: "Shibuya 1-1",
      mediaAssets: []
    }
  ],
  services: [
    {
      id: 2,
      shopId: 11,
      serviceId: 101,
      serviceNameSnapshot: "Aroma 60",
      servicePriceJpySnapshot: 8_000
    }
  ],
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
  ...overrides
});

describe("affiliate marketplace display model", () => {
  it("derives remaining percentage and maximum reward from server-authoritative values", () => {
    expect(getRemainingPercent(task())).toBe(35);
    expect(getMaximumRewardNdp(task())).toBe(200_000);
    expect(
      getMaximumRewardNdp(
        task({ maxCompletedOrdersPerClaim: null, remainingBudgetNdp: 84_000 })
      )
    ).toBe(84_000);
  });

  it("clamps malformed progress without inventing funds", () => {
    expect(getRemainingPercent(task({ remainingBudgetBps: 12_000 }))).toBe(100);
    expect(getRemainingPercent(task({ remainingBudgetBps: -300 }))).toBe(0);
    expect(getMaximumRewardNdp(task({ remainingBudgetNdp: -10 }))).toBe(0);
  });

  it("returns structured, verifiable tags only from formal task fields", () => {
    expect(getTaskTags(task())).toEqual([
      { kind: "customer-limit", count: 1 },
      { kind: "service", label: "Aroma 60" },
      { kind: "minimum-order", amountJpy: 5_000 },
      { kind: "discount", discountType: "fixed_jpy", value: 500 },
      { kind: "high-reward", rewardNdp: 10_000 }
    ]);
    expect(getTaskTags(task()).some((tag) => "followers" in tag)).toBe(false);
  });

  it("presents discount and date window without changing authored task content", () => {
    expect(getDiscountPresentation(task())).toEqual({
      kind: "fixed_jpy",
      amountJpy: 500
    });
    expect(
      getDiscountPresentation(
        task({ customerDiscountType: "rate", discountRateBps: 1_500, discountCapJpy: 2_000 })
      )
    ).toEqual({ kind: "rate", ratePercent: 15, capJpy: 2_000 });
    expect(getTaskDateWindow(task(), "en-US", "UTC")).toMatchObject({
      startsAt: "Sep 10, 2026",
      endsAt: "Sep 30, 2026"
    });
  });
});
