import { describe, expect, it } from "vitest";
import type { AffiliateMarketplaceTask } from "../../api/affiliateMarketplace";
import {
  getDiscountPresentation,
  getMaximumRewardNdp,
  getLocalizedTaskContent,
  getRemainingPercent,
  getTaskDateWindow,
  getTaskTags
} from "./model";

const task = (overrides: Partial<AffiliateMarketplaceTask> = {}): AffiliateMarketplaceTask => ({
  id: 22,
  taskCode: "AFF-PUBLIC-22",
  translations: {
    "zh-CN": { name: "涩谷服务完成奖励", description: "完成服务后获得奖励。" },
    "zh-TW": { name: "澀谷服務完成獎勵", description: "完成服務後獲得獎勵。" },
    en: { name: "Shibuya completed-service reward", description: "Earn after the referred service is completed." },
    ja: { name: "渋谷サービス完了報酬", description: "サービス完了後に報酬を獲得できます。" },
    ko: { name: "시부야 서비스 완료 보상", description: "서비스 완료 후 보상을 받습니다." }
  },
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
  it("resolves authored task content from the active application language", () => {
    const localizedTask = task({
      translations: {
        "zh-CN": { name: "简体任务", description: "简体说明" },
        "zh-TW": { name: "繁體任務", description: "繁體說明" },
        en: { name: "English task", description: "English detail" },
        ja: { name: "日本語タスク", description: "日本語の説明" },
        ko: { name: "한국어 작업", description: "한국어 설명" }
      }
    } as never);

    expect(getLocalizedTaskContent(localizedTask, "ja")).toEqual({
      name: "日本語タスク",
      description: "日本語の説明"
    });
    expect(getLocalizedTaskContent(localizedTask, "zh-Hant").name).toBe("繁體任務");
  });

  it("falls back to the formal task snapshot when the selected language is absent", () => {
    const oneLanguageTask = task({
      translations: {
        ja: { name: "日本語だけのタスク", description: "日本語だけの説明" }
      }
    });

    expect(getLocalizedTaskContent(oneLanguageTask, "ja")).toEqual({
      name: "日本語だけのタスク",
      description: "日本語だけの説明"
    });
    expect(getLocalizedTaskContent(oneLanguageTask, "en")).toEqual({
      name: oneLanguageTask.name,
      description: oneLanguageTask.description
    });
  });

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
