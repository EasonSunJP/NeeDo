import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformMembershipDetailCard } from "./PlatformMembershipDetailCard";
import { PlatformMembershipSimpleCard } from "./PlatformMembershipSimpleCard";
import { isAccessibleMembershipTheme, resolveMembershipTheme } from "./platformMembershipTheme";

const theme = { detailAccentColor: "#A7FF1E", detailSurfaceColor: "#10242D", detailItemSurfaceColor: "#09161D", detailOuterBorderColor: "#5D8B35", detailItemBorderColor: "#29424D", detailAvatarBorderColor: "#79A84B", simpleTopColor: "#0D2F27", simpleBottomColor: "#132630" };
const profile = { avatarUrl: null, bio: "", displayName: "Mia", ekycVerified: true, entityKind: "customer" as const, languages: [], level: 37, needoId: "u0000000001", tierLabel: "黄金会员" };

describe("shared platform membership cards", () => {
  it("maps all eight theme colors and keeps empty profile rows visible", () => {
    const markup = renderToStaticMarkup(<PlatformMembershipDetailCard {...profile} theme={theme} />);
    for (const color of Object.values(theme).slice(0, 6)) expect(markup.toLowerCase()).toContain(color.toLowerCase());
    expect(markup).toContain("语言能力");
    expect(markup).toContain("自我介绍");
    expect(markup).toContain("未设置");
    expect(markup).toContain("Lv.37");
    expect(markup).toContain("eKYC verified");
  });

  it("renders the customer privacy slot after the basic-information labels", () => {
    const markup = renderToStaticMarkup(
      <PlatformMembershipDetailCard
        {...profile}
        afterDetailsSlot={<div>隐私模式</div>}
        theme={theme}
      />
    );
    const labels = markup.indexOf("语言能力");
    const privacy = markup.indexOf("隐私模式");

    expect(labels).toBeGreaterThan(-1);
    expect(privacy).toBeGreaterThan(labels);
  });

  it("omits level for technician/shop cards and truncates the simple card", () => {
    const markup = renderToStaticMarkup(<PlatformMembershipSimpleCard {...profile} bio={"long ".repeat(80)} entityKind="technician" simpleBottomColor={theme.simpleBottomColor} simpleTopColor={theme.simpleTopColor} />);
    expect(markup.toLowerCase()).toContain(theme.simpleTopColor.toLowerCase());
    expect(markup.toLowerCase()).toContain(theme.simpleBottomColor.toLowerCase());
    expect(markup).not.toContain("Lv.37");
    expect(markup).toContain("line-clamp-2");
  });

  it("centrally resolves readable foregrounds and rejects critical contrast", () => {
    expect(resolveMembershipTheme(theme).detailTextColor).toMatch(/^#/);
    expect(isAccessibleMembershipTheme(theme)).toBe(true);
    expect(isAccessibleMembershipTheme({ ...theme, detailAccentColor: "#111111", detailSurfaceColor: "#101010" })).toBe(false);
  });
});
