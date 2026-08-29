import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AffiliateMarketplaceTask } from "../../api/affiliateMarketplace";
import { AffiliateTaskCard } from "./AffiliateTaskCard";

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

const task: AffiliateMarketplaceTask = {
  id: 22,
  taskCode: "AFF-PUBLIC-22",
  name: "涩谷芳香护理推广",
  description: "到店体验芳香护理并分享真实体验。",
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
      mediaAssets: [
        {
          url: "https://cdn.needo.test/shop-fallback.jpg",
          altText: "店铺备用图",
          sortOrder: 0
        }
      ]
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
  updatedAt: "2026-08-30T00:00:00.000Z"
};

describe("AffiliateTaskCard", () => {
  it("renders only formal task presentation data and links the whole card to detail", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AffiliateTaskCard task={task} />
      </MemoryRouter>
    );

    expect(markup).toContain('href="/afirieito/tasks/22"');
    expect(markup).toContain("涩谷芳香护理推广");
    expect(markup).toContain("到店体验芳香护理并分享真实体验。");
    expect(markup).toContain("剩余：35%");
    expect(markup).toContain("当前最高收益：200,000 NDP");
    expect(markup).toContain("每位顾客最多 1 单");
    expect(markup).toContain("Aroma 60");
    expect(markup).toContain("高额报酬");
    expect(markup).toContain('src="https://cdn.needo.test/task-cover.jpg"');
    expect(markup).toContain('alt="涩谷芳香护理推广"');
    expect(markup).not.toContain("粉丝");
  });
});
