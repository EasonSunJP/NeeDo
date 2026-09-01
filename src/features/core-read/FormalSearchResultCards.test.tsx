import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CoreShopCard, CoreTechnicianCard } from "./api";
import {
  FormalShopSearchCard,
  FormalTechnicianSearchCard,
  formatCompactEngagementCount
} from "./FormalSearchResultCards";

const reviewSummary = {
  ratingAverage: "4.80",
  reviewCount: 132,
  latestReviewAt: "2026-09-01T00:00:00.000Z",
  highlights: []
};

const shop: CoreShopCard = {
  id: 21,
  publicId: "shop5831047296",
  name: "麻布十番超级按摩",
  city: "东京",
  address: "东京都港区麻布十番2丁目",
  coverUrl: "/images/generated/stores/store-massage-azabu.jpg",
  reviewSummary,
  favoriteCount: 2049,
  shareCount: 29,
  serviceCategories: [{ id: 2, code: "wellness", label: "放松" }],
  businessKeywords: [
    { id: 31, code: "private", categoryId: 2, label: "包间" },
    { id: 32, code: "night", categoryId: 2, label: "深夜可约" }
  ]
};

const technician: CoreTechnicianCard = {
  id: 41,
  publicId: "s5831047296",
  displayName: "Daichi Suzuki",
  city: "东京",
  avatarUrl: "/images/generated/profiles/ai-profile-01.jpg",
  reviewSummary,
  age: 25,
  favoriteCount: 154,
  shareCount: 8,
  completedOrderCount: 1280,
  acceptanceRatePercent: 98,
  primaryService: {
    id: 71,
    name: "指压恢复护理",
    priceAmount: "8800",
    currency: "JPY",
    durationMinutes: 60
  },
  distanceKm: 1.2,
  nearbyRank: 1,
  resolvedRadiusKm: 3
};

function render(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, element));
}

describe("formal search result cards", () => {
  it("formats engagement totals in thousand buckets", () => {
    expect(formatCompactEngagementCount(0)).toBe("0");
    expect(formatCompactEngagementCount(999)).toBe("999");
    expect(formatCompactEngagementCount(1000)).toBe("1k");
    expect(formatCompactEngagementCount(1999)).toBe("1k");
    expect(formatCompactEngagementCount(2000)).toBe("2k");
  });

  it("renders a technician as the approved portrait service card", () => {
    const html = render(
      createElement(FormalTechnicianSearchCard, { language: "zh", profile: technician })
    );

    expect(html).toContain('href="/profiles/technician/41"');
    expect(html).toContain("Daichi Suzuki");
    expect(html).toContain("25 / 东京");
    expect(html).toContain("接单率 98%");
    expect(html).toContain("指压恢复护理");
    expect(html).toContain("¥8,800");
    expect(html).toContain("60分钟(含税)");
    expect(html).toContain("收藏 154");
    expect(html).toContain("分享 8");
    expect(html).toContain("附近第1名");
  });

  it("renders a shop as the approved horizontal card with business keywords only", () => {
    const html = render(
      createElement(FormalShopSearchCard, { language: "zh", profile: shop })
    );

    expect(html).toContain('href="/stores/21"');
    expect(html).toContain("麻布十番超级按摩");
    expect(html).toContain("东京都港区麻布十番2丁目");
    expect(html).toContain("收藏 2k");
    expect(html).toContain("分享 29");
    expect(html).toContain("包间");
    expect(html).toContain("深夜可约");
    expect(html).not.toContain(">放松<");
  });

  it("hides absent optional technician values instead of fabricating them", () => {
    const html = render(
      createElement(FormalTechnicianSearchCard, {
        language: "zh",
        profile: { ...technician, age: null, primaryService: null, nearbyRank: null }
      })
    );

    expect(html).not.toContain("25 / 东京");
    expect(html).not.toContain("指压恢复护理");
    expect(html).not.toContain("附近第1名");
    expect(html).toContain("可预约");
  });
});
