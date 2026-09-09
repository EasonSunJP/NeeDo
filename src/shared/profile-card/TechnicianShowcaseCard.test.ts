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

describe("TechnicianShowcaseCard unified compatibility entry", () => {
  it("uses the canonical public profile path", () => {
    expect(getTechnicianDynamicPath(technician)).toBe(
      "/profiles/technician/s0000000002",
    );
  });

  it("renders the shared unified card with the required technician metrics", () => {
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

    expect(markup).toContain('data-testid="unified-info-card"');
    expect(markup).toContain('data-card-kind="technician"');
    expect(markup).toContain("评分");
    expect(markup).toContain("完单次数");
    expect(markup).toContain("1.2km");
    expect(markup).toContain("收藏");
    expect(markup).toContain("分享");
    expect(markup).toContain("睡眠改善与肩颈放松");
    expect(markup).toContain("日本語");
    expect(markup).not.toContain("¥8,800");
    expect(markup).not.toContain("60分钟");
    expect(markup).not.toContain("推荐服务");
  });

  it("uses authoritative formal values without reviving legacy card fields", () => {
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
    expect(markup).toContain("东京港区");
    expect(markup).toContain("4.9");
    expect(markup).toContain("87");
    expect(markup).toContain("2.4km");
    expect(markup).toContain("31");
    expect(markup).toContain("6");
    expect(markup).not.toContain("不应显示的旧服务价格");
  });

  it("keeps selection as an action on the same visual skeleton", () => {
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

    expect(markup).toContain('data-testid="unified-card-actions"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("contains no retired standalone showcase markup", () => {
    expect(cardSource).toContain("<UnifiedEntityInfoCard");
    expect(cardSource).not.toContain("aspect-[3/4]");
    expect(cardSource).not.toContain("recommendedService");
    expect(cardSource).not.toContain("priceLabel");
    expect(cardSource).not.toContain("durationMinutes}");
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
