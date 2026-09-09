import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Store, Technician } from "../../types/domain";
import frameSource from "../info-card-system/UnifiedInfoCardFrame.tsx?raw";
import entityCardSource from "./UnifiedEntityInfoCard.tsx?raw";
import cardSource from "./SocialProfileMiniCard.tsx?raw";
import { SocialProfileMiniCard } from "./SocialProfileMiniCard";

const store: Store = {
  id: "store-1",
  systemId: "shop0000000001",
  merchantId: "merchant-1",
  name: "Roppongi Recovery",
  area: "Roppongi",
  address: "Tokyo 6-8 Roppongi, Minato-ku",
  rating: 4.9,
  reviewCount: 970,
  priceLabel: "¥12,000",
  tags: ["recovery", "private"],
  openStatus: "open",
  nextSlot: "18:00",
  cover: "",
  gallery: [],
  description: "Private recovery salon",
  rankLabel: "店铺",
  businessHours: "10:00-24:00",
  mode: "store",
  favoriteCount: 120,
  shareCount: 8,
};

const technician: Technician = {
  id: "tech-1",
  systemId: "s0000000001",
  name: "Misaki",
  storeId: "store-1",
  role: "therapist",
  status: "available",
  rating: 4.8,
  orderCount: 120,
  income: 0,
  skills: ["肩颈调理"],
  serviceAreas: ["银座"],
  acceptRate: 96,
  cancelRate: 1,
  reviewCount: 32,
  languages: ["日本語"],
  avatar: "/images/misaki.jpg",
  favoriteCount: 18,
  shareCount: 4,
  bio: "深层放松",
};

describe("SocialProfileMiniCard unified delegation", () => {
  it("renders the shared neutral image state without an empty src", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SocialProfileMiniCard, { store }),
      ),
    );

    expect(markup).toContain('data-testid="unified-info-card"');
    expect(markup).toContain('aria-label="Roppongi Recovery 暂无公开图片"');
    expect(markup).not.toContain('src=""');
  });

  it("keeps exactly one visual skeleton and removes legacy visual branches", () => {
    expect(cardSource).toContain("UnifiedEntityInfoCard");
    expect(cardSource).toContain("UnifiedServiceInfoCard");
    expect(cardSource).not.toContain("coverDark");
    expect(cardSource).not.toContain("SimpleRatingBadge");
    expect(cardSource).not.toContain("SocialStatsLine");
    expect(frameSource).toContain('data-testid="unified-info-card"');
    expect(frameSource).toContain("#b8ff4a");
  });

  it("renders a shop with rating metrics and its address, without image price or duration", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SocialProfileMiniCard, { store }),
      ),
    );

    expect(markup).toContain('data-card-kind="shop"');
    expect(markup).toContain("评分");
    expect(markup).toContain("Tokyo 6-8 Roppongi, Minato-ku");
    expect(markup).not.toContain("¥12,000");
    expect(markup).not.toContain("18:00");
  });

  it("renders technician metrics and language without legacy social counts or level", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SocialProfileMiniCard, { technician }),
      ),
    );

    expect(markup).toContain('data-card-kind="technician"');
    expect(markup).toContain("完单次数");
    expect(markup).toContain("日本語");
    expect(markup).not.toContain("粉丝：");
    expect(markup).not.toContain("Lv.");
  });

  it("renders user cards without the top metric rail", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(SocialProfileMiniCard, {
          data: {
            id: "u0000000001",
            entityType: "user",
            displayName: "Aoi",
            avatar: "/images/aoi.jpg",
            coverImage: "/images/aoi.jpg",
            headline: "旅と音楽",
            regionLabel: "Tokyo",
            primaryLabel: "用户",
            levelLabel: "Lv.5",
            scoreLabel: "信用度",
            scoreValue: "4.8/5",
            followerCount: 20,
            followingCount: 10,
            languages: ["日本語", "English"],
          },
        }),
      ),
    );

    expect(markup).toContain('data-card-kind="user"');
    expect(markup).toContain("旅と音楽");
    expect(markup).toContain("English");
    expect(markup).not.toContain('data-testid="unified-card-metrics"');
    expect(markup).not.toContain("Lv.5");
  });

  it("uses the shared special-review icon row instead of a second card design", () => {
    expect(entityCardSource).toContain("SpecialReviewIconRow");
    expect(entityCardSource).toContain("specialReviewTags");
  });
});
