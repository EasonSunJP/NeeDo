import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { UnifiedServiceInfoCardData } from "./model";
import { UnifiedServiceInfoCard } from "./UnifiedServiceInfoCard";

const formalService: UnifiedServiceInfoCardData = {
  id: "71",
  coverUrl: "/service.jpg",
  name: "两小时家庭日常保洁",
  priceAmount: 1000,
  currency: "JPY",
  durationMinutes: 60,
  usageCount: 18,
  shopPublicId: "shop0000000217",
  shopAddress: "東京都中央区銀座1-2-3",
  description: "厨房、浴室、地面一站式整理。",
  tags: ["银座", "东京站", "日本桥"]
};

describe("UnifiedServiceInfoCard", () => {
  it("renders formal service facts in the single approved order", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(UnifiedServiceInfoCard, { data: formalService, detailTo: "/services/71" })
      )
    );
    const text = markup.replace(/<[^>]+>/g, "");
    const facts = [
      "两小时家庭日常保洁",
      "￥1,000/60分钟",
      "利用回数：18",
      "店铺 ID：shop0000000217",
      "店铺地址：東京都中央区銀座1-2-3",
      "厨房、浴室、地面一站式整理。",
      "银座"
    ];

    expect(markup).toContain('data-testid="unified-service-info-card"');
    facts.slice(1).reduce((previousIndex, fact) => {
      const currentIndex = text.indexOf(fact);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      return currentIndex;
    }, text.indexOf(facts[0]));
  });

  it("keeps management actions outside the navigation link", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(UnifiedServiceInfoCard, {
          actionSlot: createElement("button", { type: "button" }, "服务上移"),
          data: formalService,
          detailTo: "/services/71"
        })
      )
    );

    expect(markup.indexOf("</a>")).toBeLessThan(markup.indexOf("服务上移"));
  });

  it("shows honest unavailable states when formal values are missing", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(UnifiedServiceInfoCard, {
          data: {
            ...formalService,
            coverUrl: null,
            description: null,
            durationMinutes: null,
            shopAddress: null,
            shopPublicId: null,
            tags: [],
            usageCount: null
          }
        })
      )
    );
    const text = markup.replace(/<[^>]+>/g, "");

    expect(text).toContain("暂无公开图片");
    expect(text).toContain("￥1,000/时长未读取");
    expect(text).not.toContain("/0分钟");
    expect(text).toContain("利用回数：未读取");
    expect(text).toContain("店铺 ID：未读取");
    expect(text).toContain("店铺地址：未公开");
    expect(text).toContain("暂无简介");
    expect(text).toContain("暂无标签");
  });
});
