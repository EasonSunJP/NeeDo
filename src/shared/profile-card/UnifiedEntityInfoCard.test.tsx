import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { UnifiedEntityInfoCard } from "./UnifiedEntityInfoCard";

const render = (data: Parameters<typeof UnifiedEntityInfoCard>[0]["data"]) => renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(UnifiedEntityInfoCard, { data }))
);

describe("UnifiedEntityInfoCard", () => {
  it("renders technician metrics and bare special icons with overlapping counts", () => {
    const markup = render({ kind: "technician", id: "s0000000001", name: "玲奈", imageUrl: "/tech.jpg", description: "深层放松技师", languages: ["中文", "日本語"], tags: [], rating: 4.9, completedOrderCount: 128, distanceKm: 1.2, favoriteCount: 21, shareCount: 4, specialReviewTags: [{ code: "service_max", label: "服务max", icon: "💙", count: 46 }] });
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(markup).toContain('data-card-kind="technician"');
    expect(markup).toContain("relative z-20 grid grid-cols-5");
    expect(markup).not.toContain("grid-cols-2");
    expect(markup).toContain("grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]");
    expect(markup).not.toContain("grid grid-cols-1");
    ["评分", "完单次数", "距离", "收藏", "分享"].reduce((index, item) => { const next = text.indexOf(item); expect(next).toBeGreaterThan(index); return next; }, -1);
    expect(markup).toContain('data-testid="special-review-icon"');
    expect(markup).toContain("-right-1 -top-1");
    expect(markup).not.toContain('data-testid="special-review-container"');
    expect(text).toContain("46");
  });

  it("renders a user name card with no metrics rail, time, or price", () => {
    const markup = render({ kind: "user", id: "u0000000001", name: "LifeDance", imageUrl: "/user.jpg", description: "喜欢旅行", languages: ["中文", "English"], tags: [] });
    const text = markup.replace(/<[^>]+>/gu, "");
    expect(markup).toContain('data-card-kind="user"');
    expect(markup).not.toContain('data-testid="unified-card-metrics"');
    expect(markup).toContain("grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]");
    expect(text).toContain("LifeDance");
    expect(text).toContain("喜欢旅行");
    expect(text).toContain("中文");
    expect(text).not.toMatch(/分钟|￥/u);
  });
});
