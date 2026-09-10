import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Technician } from "../../types/domain";
import cardSource from "./TechnicianShowcaseCard.tsx?raw";
import {
  getTechnicianCardRankBadge,
  getTechnicianDynamicPath,
  shouldShowTechnicianBeginnerIcon,
  TechnicianShowcaseCard,
} from "./TechnicianShowcaseCard";

const technician: Technician = {
  id: "186",
  systemId: "s0000000002",
  name: "LifeDance 管理员 2",
  storeId: "217",
  role: "therapist",
  status: "available",
  rating: 5,
  orderCount: 3,
  income: 0,
  skills: ["ボディケア"],
  serviceAreas: ["東京都"],
  acceptRate: 100,
  cancelRate: 0,
  reviewCount: 3,
  favoriteCount: 12,
  shareCount: 4,
  distanceKm: 1.2,
  languages: ["日本語"],
  avatar: "/images/generated/profiles/ai-profile-29.jpg",
  bio: "睡眠改善与肩颈放松",
  primaryService: {
    name: "不应显示的旧服务价格",
    priceAmount: "8800",
    currency: "JPY",
    durationMinutes: 60,
  },
};

describe("TechnicianShowcaseCard recommendation tile", () => {
  it("uses the canonical public profile path", () => {
    expect(getTechnicianDynamicPath(technician)).toBe(
      "/profiles/technician/s0000000002",
    );
  });

  it("keeps the original portrait recommendation tile instead of the unified information-card frame", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(TechnicianShowcaseCard, {
          language: "zh",
          rankIndex: 0,
          technician,
        }),
      ),
    );

    expect(markup).not.toContain('data-testid="unified-info-card"');
    expect(markup).toContain("aspect-[3/4]");
    expect(markup).toContain("推荐服务");
    expect(markup).toContain("¥8,800");
    expect(markup).toContain("60分钟");
    expect(markup).toContain("LifeDance 管理员 2");
  });

  it("uses authoritative formal recommendation values in the portrait tile", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(TechnicianShowcaseCard, {
          formalData: {
            avatarUrl: null,
            city: "东京港区",
            completedOrderCount: 87,
            displayName: "Mika Formal",
            distanceKm: 2.4,
            favoriteCount: 31,
            languages: ["日本語", "中文"],
            primaryService: {
              currency: "JPY",
              durationMinutes: 90,
              name: "正式推荐服务",
              priceAmount: "12800",
            },
            ratingAverage: "4.9",
            reviewCount: 22,
            shareCount: 6,
          },
          language: "zh",
          rankIndex: 0,
          technician,
        }),
      ),
    );

    expect(markup).toContain("Mika Formal");
    expect(markup).toContain("4.9");
    expect(markup).toContain("31");
    expect(markup).toContain("6");
    expect(markup).toContain("正式推荐服务");
    expect(markup).toContain("¥12,800");
    expect(markup).toContain("90分钟");
    expect(markup).not.toContain("不应显示的旧服务价格");
  });

  it("keeps selection on the portrait card without switching card systems", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(TechnicianShowcaseCard, {
          language: "ja",
          onSelect: () => undefined,
          rankIndex: 0,
          selected: true,
          technician,
        }),
      ),
    );

    expect(markup).not.toContain('data-testid="unified-card-actions"');
    expect(markup).toContain("aspect-[3/4]");
    expect(markup).toContain('aria-pressed="true"');
  });

  it("stays independent from the unified business-card and simple-info-card design", () => {
    expect(cardSource).not.toContain("<UnifiedEntityInfoCard");
    expect(cardSource).toContain("aspect-[3/4]");
    expect(cardSource).toContain("recommendedService");
    expect(cardSource).toContain("priceLabel");
  });
});

describe("technician compatibility helpers", () => {
  it("keeps rank and stable beginner helper contracts", () => {
    expect(getTechnicianCardRankBadge(0)).toMatchObject({
      label: "Best1",
      rank: 1,
    });
    expect(getTechnicianCardRankBadge(3)).toBeNull();
    expect(
      shouldShowTechnicianBeginnerIcon({ id: "technician-1", name: "A" }),
    ).toBe(true);
  });
});
