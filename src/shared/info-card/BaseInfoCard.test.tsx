import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BaseInfoCard } from "./BaseInfoCard";
import type { ShopInfoCardData } from "./types";

const shopWithoutAvatar: ShopInfoCardData = {
  id: "shop6333731099",
  entityType: "shop",
  displayName: "LifeDance Wellness 渋谷",
  subtitle: "shop6333731099",
  region: "東京都渋谷区道玄坂1-12-1",
  tags: [],
  badgeList: [],
};

describe("BaseInfoCard", () => {
  it("treats legacy variants as compatibility inputs for the single unified design", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(BaseInfoCard, {
          data: shopWithoutAvatar,
          detailTo: "/profiles/shop/shop6333731099",
          variant: "detailHeader",
        }),
      ),
    );
    expect(markup).toContain('data-testid="unified-info-card"');
    expect(markup).toContain('data-card-kind="shop"');
    expect(markup).toContain("LifeDance Wellness 渋谷");
    expect(markup).toContain('href="/profiles/shop/shop6333731099"');
    expect(markup).not.toContain("detailHeader");
  });
});
