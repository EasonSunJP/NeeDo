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
  it("keeps a detail-header fallback visual at its requested fixed size", () => {
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
    const fallbackClass =
      markup.match(/<div class="([^"]+)">店铺<\/div>/)?.[1] ?? "";

    expect(fallbackClass).toContain("h-16");
    expect(fallbackClass).toContain("w-16");
    expect(fallbackClass).not.toContain("h-full");
    expect(fallbackClass).not.toContain("w-full");
  });
});
