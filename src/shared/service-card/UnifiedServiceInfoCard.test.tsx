import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { UnifiedServiceInfoCardData } from "./model";
import { UnifiedServiceInfoCard } from "./UnifiedServiceInfoCard";

const formalService: UnifiedServiceInfoCardData = {
  id: "71", coverUrl: "/service.jpg", name: "两小时家庭日常保洁", priceAmount: 1000,
  currency: "JPY", durationMinutes: 60, completedOrderCount: 1999,
  engagementTarget: { targetType: "service", publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  favoriteCount: 27, shareCount: 6, isBookable: true, distanceKm: 1.24,
  shopPublicId: "shop0000000217", shopAddress: "東京都中央区銀座1-2-3",
  description: "厨房、浴室、地面一站式整理。", tags: ["银座", "东京站", "日本桥"]
};

describe("UnifiedServiceInfoCard", () => {
  it("renders authored service text for the selected language and falls back independently", () => {
    const data = { ...formalService, localizedContent: {
      en: { name: "Home cleaning", description: "Kitchen and bathroom care" },
      ja: { name: "お掃除" }
    } };
    const english = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, { data, language: "en" })));
    const japanese = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, { data, language: "ja" })));
    expect(english).toContain("Home cleaning");
    expect(english).toContain("Kitchen and bathroom care");
    expect(japanese).toContain("お掃除");
    expect(japanese).toContain(formalService.description);
    expect(japanese).not.toContain("Kitchen and bathroom care");
  });
  it("renders the only approved neon split-card skeleton and metric order", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, {
      actionSlot: createElement("button", { type: "button" }, "编辑服务"), data: formalService, detailTo: "/services/71"
    })));
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(markup).toContain('data-testid="unified-info-card"');
    expect(markup).toContain('data-card-kind="service"');
    expect(markup).toContain('data-card-size="default"');
    expect(markup).not.toContain("min-h-[320px]");
    expect(markup).not.toContain("aspect-[16/9]");
    expect(markup).toContain("var(--client-primary)");
    expect(markup).not.toContain("#b8ff4a");
    expect(markup).toContain("relative z-20 flex items-center");
    expect(markup).toContain('data-testid="unified-card-metric-separator"');
    expect(markup).not.toContain("[&amp;:not(:last-child)]:border-r");
    expect(markup).not.toContain("grid-cols-2");
    expect(markup).toContain("grid-cols-[minmax(132px,38%)_minmax(0,1fr)]");
    expect(markup).not.toContain("grid grid-cols-1");
    expect(markup).not.toContain("data-variant");
    expect(markup).not.toContain("showcase");
    expect(markup).toContain('data-testid="unified-card-body"');
    expect(markup).toContain("aspect-square");
    expect(markup).toContain("rounded-[18px]");
    expect(markup).toContain("justify-start");
    ["可预约", "1.9k", "1.2km", "27", "6"].reduce((lastIndex, item) => {
      const nextIndex = text.indexOf(item); expect(nextIndex).toBeGreaterThan(lastIndex); return nextIndex;
    }, -1);
    expect(text).not.toMatch(/利用次数|距离你|收藏|分享/u);
    expect(markup).toContain('data-app-icon="completed"');
    expect(markup).not.toContain('data-app-icon="moments"');
  });

  it("uses the shared chevron when no contextual action replaces it", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, {
      data: formalService, detailTo: "/services/71"
    })));
    expect(markup).toContain('data-testid="unified-card-detail-arrow"');
    expect(markup).toContain('data-icon="chevron-right"');
  });

  it("restores the duration and price overlays on the service image", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, {
      actionSlot: createElement("button", { type: "button" }, "编辑服务"), data: formalService, detailTo: "/services/71"
    })));
    expect(markup).toContain('data-testid="unified-card-duration-overlay"');
    expect(markup).toContain('data-testid="unified-card-price-overlay"');
    expect(markup).toContain('data-testid="unified-card-image"');
    expect(markup).toContain("scale-[1.015]");
    expect(markup).toContain("rounded-bl-[18px]");
    expect(markup).toContain("60分钟");
    expect(markup).toContain("￥1,000");
    expect(markup.indexOf("</a>")).toBeLessThan(markup.indexOf("编辑服务"));
  });

  it("uses honest unavailable states and never invents zero distance or engagement", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, { data: {
      ...formalService, coverUrl: null, description: null, durationMinutes: null, distanceKm: null,
      favoriteCount: null, shareCount: null, completedOrderCount: null, tags: []
    }})));
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(text).toContain("暂无公开图片");
    expect(text).not.toMatch(/未读取|距离未读取/u);
    expect(text).toContain("-");
    expect(text).toContain("暂无简介");
    expect(text).toContain("暂无标签");
    expect(text).not.toContain("0km");
  });

  it("localizes Japanese metric and engagement accessibility labels", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnifiedServiceInfoCard, {
      data: formalService, detailTo: "/services/71", language: "ja"
    })));

    expect(markup).toContain('aria-label="予約可"');
    expect(markup).toContain(">予約可<");
    expect(markup).not.toContain("予約可能");
    expect(markup).toContain('aria-label="完了件数"');
    expect(markup).toContain('aria-label="現在地から"');
    expect(markup).toContain('aria-label="两小时家庭日常保洁をお気に入りに追加"');
    expect(markup).toContain('aria-label="两小时家庭日常保洁をシェア"');
    expect(markup).not.toMatch(/完特異|距離你|收藏|分享/u);
  });
});
