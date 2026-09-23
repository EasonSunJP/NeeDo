import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { UnifiedEntityInfoCard } from "./UnifiedEntityInfoCard";

const render = (
  data: Parameters<typeof UnifiedEntityInfoCard>[0]["data"],
  props: Omit<Parameters<typeof UnifiedEntityInfoCard>[0], "data"> = {},
) => renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(UnifiedEntityInfoCard, { data, ...props }))
);

describe("UnifiedEntityInfoCard", () => {
  it("renders technician metrics and bare special icons with overlapping counts", () => {
    const markup = render({ kind: "technician", id: "s0000000001", name: "玲奈", imageUrl: "/tech.jpg", description: "深层放松技师", languages: ["中文", "日本語"], tags: [], rating: 4.86, completedOrderCount: 128, distanceKm: 1.2, favoriteCount: 21, shareCount: 4, specialReviewTags: [{ code: "service_max", label: "服务max", icon: "💙", count: 46 }] });
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(markup).toContain('data-card-kind="technician"');
    expect(markup).toContain("relative z-20 flex items-center");
    expect(markup).toContain('data-testid="unified-card-metric-separator"');
    expect(markup).not.toContain("[&amp;:not(:last-child)]:border-r");
    expect(markup).not.toContain("grid-cols-2");
    expect(markup).toContain("grid-cols-[minmax(132px,38%)_minmax(0,1fr)]");
    expect(markup).not.toContain("grid grid-cols-1");
    ["4.9", "128", "1.2km", "21", "4"].reduce((index, item) => {
      const next = text.indexOf(item, index + 1);
      expect(next).toBeGreaterThan(index);
      return next;
    }, -1);
    expect(text).not.toContain("4.86");
    expect(markup).toContain('data-testid="unified-card-distance-value"');
    expect(markup).toContain('data-testid="unified-card-distance-unit"');
    expect(markup).toContain("text-[8px]");
    expect(text).not.toMatch(/评分|完单次数|距离|收藏|分享/u);
    expect(markup).toContain('data-app-icon="completed"');
    expect(markup).toContain('data-testid="special-review-icon"');
    expect(markup).toContain('data-testid="theme-review-stamp-icon"');
    expect(markup).toContain("var(--client-primary)");
    expect(markup).not.toContain("#b8ff4a");
    expect(markup).not.toContain("💙");
    expect(markup).toContain("-right-1 -top-1");
    expect(markup).not.toContain('data-testid="special-review-container"');
    expect(text).toContain("46");
    expect(text.indexOf("深层放松技师")).toBeLessThan(text.indexOf("46"));
    expect(text.indexOf("46")).toBeLessThan(text.indexOf("中文"));
    expect(markup).toContain("aspect-square");
    expect(markup).toContain("rounded-[18px]");
    expect(markup).toContain("justify-start");
  });

  it("keeps a linked shop simple card content-sized with only a bottom-right detail chevron", () => {
    const markup = render(
      { kind: "shop", id: "shop-1", name: "港区店", imageUrl: "/shop.jpg", description: "深夜护理", address: "東京都港区", languages: [], tags: ["按摩"], rating: 4.8, reviewCount: 321, completedOrderCount: 1999, distanceKm: 1.2, favoriteCount: 5, shareCount: 2 },
      { detailTo: "/stores/shop-1" },
    );
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(markup).toContain('data-testid="unified-card-detail-arrow"');
    expect(markup).toContain('data-icon="chevron-right"');
    expect(markup).toContain('data-testid="unified-card-location-icon"');
    expect(markup).toContain("var(--client-primary)");
    expect(markup).not.toContain("#b8ff4a");
    expect(markup).toContain("items-center");
    expect(markup).not.toContain("items-start gap-1.5");
    expect(markup).toContain("rotate-180");
    expect(markup).not.toContain('name="minus"');
    expect(markup).toContain('data-card-size="default"');
    expect(markup).not.toContain("min-h-[320px]");
    expect(markup).not.toContain("aspect-[16/9]");
    expect(markup).toContain('data-app-icon="completed"');
    expect(markup).not.toContain('data-app-icon="moments"');
    expect(text).toContain("1.9k");
    expect(text).not.toContain("321");
  });

  it("renders technician completed orders independently from reviews", () => {
    const markup = render({ kind: "technician", id: "s0000000002", name: "美咲", imageUrl: null, description: null, languages: [], tags: [], rating: 4.7, reviewCount: 123, completedOrderCount: 1888, distanceKm: null, favoriteCount: null, shareCount: null });
    const text = markup.replace(/<[^>]+>/gu, "");

    expect(markup).toContain('data-app-icon="completed"');
    expect(markup).toContain('/images/generated/profiles/dodo-default-avatar.webp');
    expect(markup).not.toContain('data-app-icon="moments"');
    expect(text).toContain("1.8k");
    expect(text).not.toContain("123");
  });

  it("renders a compact user name card without metrics or language tags", () => {
    const markup = render(
      { kind: "user", id: "u0000000001", name: "LifeDance", imageUrl: "/user.jpg", description: "喜欢旅行", languages: ["中文", "English"], tags: [] },
      { showLanguageTags: false },
    );
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(markup).toContain('data-card-kind="user"');
    expect(markup).toContain('data-card-density="name-card"');
    expect(markup).not.toContain('data-testid="unified-card-metrics"');
    expect(markup).toContain("grid-cols-[minmax(132px,38%)_minmax(0,1fr)]");
    expect(markup).toMatch(/p-3[^"]*sm:p-6/u);
    expect(text).toContain("LifeDance");
    expect(text).toContain("喜欢旅行");
    expect(text).not.toMatch(/中文|English/u);
    expect(text).not.toMatch(/分钟|￥/u);
    expect(markup).not.toContain('data-testid="unified-card-tags"');
    expect(markup).toContain("line-clamp-2");
    expect(markup).toContain("26px");
    expect(markup).toContain("var(--client-surface)");
    expect(markup).toContain("var(--client-text)");
    expect(markup).toContain("var(--client-muted)");
    expect(markup).toContain("var(--client-primary)");
    ["#031014", "#f7f9f7", "#9aacb5", "#b8ff4a", "#244047"].forEach((fixed) => {
      expect(markup).not.toContain(fixed);
    });
  });
});
