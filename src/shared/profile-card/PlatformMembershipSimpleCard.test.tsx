import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformMembershipSimpleCard } from "./PlatformMembershipSimpleCard";

describe("PlatformMembershipSimpleCard unified compatibility entry", () => {
  it("renders a user name card with no top metric row, time, or price", () => {
    const markup = renderToStaticMarkup(
      createElement(PlatformMembershipSimpleCard, {
        avatarUrl: "/hanako.png",
        bio: "预约前请先确认时间、语言和付款方式。",
        displayName: "山田花子",
        ekycVerified: true,
        entityKind: "customer",
        languages: ["日本語", "中文"],
        level: 12,
        needoId: "u0000000201",
        simpleBottomColor: "#132630",
        simpleTopColor: "#0d2f27",
      }),
    );

    expect(markup).toContain('data-testid="unified-info-card"');
    expect(markup).toContain('data-card-kind="user"');
    expect(markup).toContain("山田花子");
    expect(markup).toContain("预约前请先确认时间、语言和付款方式。");
    expect(markup).not.toContain("日本語");
    expect(markup).not.toContain("中文");
    expect(markup).not.toContain('data-testid="unified-card-metrics"');
    expect(markup).not.toContain("Lv.12");
    expect(markup).not.toContain("ID u0000000201");
    expect(markup).not.toContain("background-color:#0d2f27");
  });

  it("renders a technician card with the unified metric rail and special badge icons", () => {
    const markup = renderToStaticMarkup(
      createElement(PlatformMembershipSimpleCard, {
        avatarUrl: null,
        bio: "擅长深层放松",
        completedOrderCount: 88,
        displayName: "正式技师",
        ekycVerified: false,
        entityKind: "technician",
        entityPublicId: "s0000000301",
        favoriteCount: 9,
        languages: ["日本語"],
        level: null,
        needoId: "u0000000301",
        rating: 4.8,
        shareCount: 2,
        specialReviewTags: [
          { code: "service_max", label: "服务max", icon: "💙", count: 17 },
        ],
      }),
    );
    const text = markup.replace(/<[^>]+>/gu, "");

    expect(markup).toContain('data-card-kind="technician"');
    expect(markup).toContain('data-testid="unified-card-metrics"');
    expect(text).not.toContain("评分");
    expect(text).not.toContain("完单次数");
    expect(text).not.toContain("收藏");
    expect(text).not.toContain("分享");
    expect(text).not.toContain("日本語");
    expect(markup).toContain('title="服务max"');
    expect(text).toContain("17");
    expect(markup).not.toContain("Lv.");
  });
});
