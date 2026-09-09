import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { UnifiedServiceInfoCardData } from "./model";
import { UnifiedServiceInfoCard } from "./UnifiedServiceInfoCard";

const formalService: UnifiedServiceInfoCardData = {
  id: "71", coverUrl: "/service.jpg", name: "两小时家庭日常保洁", priceAmount: 1000,
  currency: "JPY", durationMinutes: 60, usageCount: 18,
  engagementTarget: { targetType: "service", publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  favoriteCount: 27, shareCount: 6, isBookable: true, distanceKm: 1.24,
  shopPublicId: "shop0000000217", shopAddress: "東京都中央区銀座1-2-3",
  description: "厨房、浴室、地面一站式整理。", tags: ["银座", "东京站", "日本桥"]
};

describe("UnifiedServiceInfoCard", () => {
  it("renders the only approved neon split-card skeleton and metric order", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, {
      actionSlot: createElement("button", { type: "button" }, "编辑服务"), data: formalService, detailTo: "/services/71"
    })));
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(markup).toContain('data-testid="unified-info-card"');
    expect(markup).toContain('data-card-kind="service"');
    expect(markup).toContain("#b8ff4a");
    expect(markup).toContain("relative z-20 flex items-center");
    expect(markup).toContain('data-testid="unified-card-metric-separator"');
    expect(markup).not.toContain("[&amp;:not(:last-child)]:border-r");
    expect(markup).not.toContain("grid-cols-2");
    expect(markup).toContain("grid-cols-[minmax(110px,30%)_minmax(0,1fr)]");
    expect(markup).not.toContain("grid grid-cols-1");
    expect(markup).not.toContain("data-variant");
    expect(markup).not.toContain("showcase");
    expect(markup).toContain('data-testid="unified-card-body"');
    expect(markup).toContain("aspect-square");
    expect(markup).toContain("rounded-[18px]");
    expect(markup).toContain("justify-start");
    ["可预约", "利用次数", "距离你", "收藏", "分享"].reduce((lastIndex, item) => {
      const nextIndex = text.indexOf(item); expect(nextIndex).toBeGreaterThan(lastIndex); return nextIndex;
    }, -1);
  });

  it("uses the shared chevron when no contextual action replaces it", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, {
      data: formalService, detailTo: "/services/71"
    })));
    expect(markup).toContain('data-testid="unified-card-detail-arrow"');
    expect(markup).toContain('data-icon="chevron-right"');
  });

  it("keeps the compact image free of duration and price overlays", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, {
      actionSlot: createElement("button", { type: "button" }, "编辑服务"), data: formalService, detailTo: "/services/71"
    })));
    expect(markup).not.toContain('data-testid="unified-card-duration-overlay"');
    expect(markup).not.toContain('data-testid="unified-card-price-overlay"');
    expect(markup).not.toContain("60分钟");
    expect(markup).not.toContain("￥1,000");
    expect(markup.indexOf("</a>")).toBeLessThan(markup.indexOf("编辑服务"));
  });

  it("uses honest unavailable states and never invents zero distance or engagement", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, { data: {
      ...formalService, coverUrl: null, description: null, durationMinutes: null, distanceKm: null,
      favoriteCount: null, shareCount: null, usageCount: null, tags: []
    }})));
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(text).toContain("暂无公开图片");
    expect(text).not.toContain("时长未读取");
    expect(text).toContain("距离未读取");
    expect(text).toContain("暂无简介");
    expect(text).toContain("暂无标签");
    expect(text).not.toContain("0km");
  });
});
