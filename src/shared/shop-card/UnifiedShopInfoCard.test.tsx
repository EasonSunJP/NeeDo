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
    expect(text).toContain("评分");
    expect(text).not.toContain("可预约");
    expect(markup).not.toContain("unified-card-duration-overlay");
    expect(markup).not.toContain("unified-card-price-overlay");
  });
});
