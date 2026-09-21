import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { UnifiedShopInfoCard } from "./UnifiedShopInfoCard";

describe("UnifiedShopInfoCard", () => {
  it("uses rating instead of bookability, places address below name, and omits image price/time", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(UnifiedShopInfoCard, {
          data: {
            kind: "shop",
            id: "shop0000000001",
            name: "LifeDance 银座",
            imageUrl: "/shop.jpg",
            description: "深夜放松空间",
            address: "東京都中央区銀座1-2-3",
            languages: [],
            tags: ["SPA"],
            rating: 4.9,
            reviewCount: 88,
            distanceKm: 1.2,
            favoriteCount: 120,
            shareCount: 9,
          },
        }),
      ),
    );
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(markup).toContain('data-card-kind="shop"');
    expect(text.indexOf("LifeDance 银座")).toBeLessThan(
      text.indexOf("東京都中央区銀座1-2-3"),
    );
    expect(text).toContain("4.9");
    expect(text).not.toContain("评分");
    expect(text).not.toContain("可预约");
    expect(markup).not.toContain("unified-card-duration-overlay");
    expect(markup).not.toContain("unified-card-price-overlay");
  });

  it("supports the shared compact density without rendering the metric rail", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(UnifiedShopInfoCard, {
          data: {
            kind: "shop",
            id: "shop0000000001",
            name: "LifeDance 银座",
            imageUrl: "/shop.jpg",
            description: "可预约",
            address: "银座 · 中央区",
            languages: [],
            tags: ["到店服务"],
          },
          density: "compact",
          showMetrics: false,
          detailTo: "/profiles/shop/shop0000000001",
        }),
      ),
    );

    expect(markup).toContain('data-card-size="compact"');
    expect(markup).not.toContain('data-testid="unified-card-metrics"');
    expect(markup).toContain("LifeDance 银座");
    expect(markup).toContain("银座 · 中央区");
    expect(markup).toContain("可预约");
    expect(markup).toContain('href="/profiles/shop/shop0000000001"');
  });
});
