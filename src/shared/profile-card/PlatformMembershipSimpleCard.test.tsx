import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformMembershipSimpleCard } from "./PlatformMembershipSimpleCard";

describe("PlatformMembershipSimpleCard", () => {
  it("renders the immutable public contact-card snapshot without live social metrics", () => {
    const markup = renderToStaticMarkup(createElement(PlatformMembershipSimpleCard, {
      avatarUrl: "/hanako.png",
      bio: "预约前请先确认时间、语言和付款方式。",
      displayName: "山田花子",
      ekycVerified: true,
      entityKind: "customer",
      level: 12,
      needoId: "u0000000201",
      simpleBottomColor: "#132630",
      simpleTopColor: "#0d2f27",
    }));

    expect(markup).toContain("山田花子");
    expect(markup).toContain("eKYC verified");
    expect(markup).toContain("Lv.12");
    expect(markup).toContain("ID u0000000201");
    expect(markup).toContain("预约前请先确认时间、语言和付款方式。");
    expect(markup).toContain("background-color:#0d2f27");
    expect(markup).toContain("background-color:#132630");
    expect(markup).not.toContain("粉丝");
    expect(markup).not.toContain("关注");
    expect(markup).not.toContain("信用度");
  });

  it("does not show a customer level for technicians or shops", () => {
    const markup = renderToStaticMarkup(createElement(PlatformMembershipSimpleCard, {
      avatarUrl: null,
      bio: "",
      displayName: "正式技师",
      ekycVerified: false,
      entityKind: "technician",
      level: null,
      needoId: "u0000000301",
    }));

    expect(markup).toContain("正式技师");
    expect(markup).toContain("ID u0000000301");
    expect(markup).not.toContain("Lv.");
    expect(markup).not.toContain("eKYC verified");
  });
});
