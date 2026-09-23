import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformMembershipDetailCard } from "./PlatformMembershipDetailCard";
import { PlatformMembershipSimpleCard } from "./PlatformMembershipSimpleCard";
import {
  resolveMembershipDetailGradient,
  resolveMembershipTheme
} from "./platformMembershipTheme";

const theme = { detailAccentColor: "#A7FF1E", detailSurfaceColor: "#10242D", detailSurfaceMiddleColor: "#183A32", detailSurfaceBottomColor: "#24314B", detailItemSurfaceColor: "#09161D", detailOuterBorderColor: "#5D8B35", detailItemBorderColor: "#29424D", detailAvatarBorderColor: "#79A84B", simpleTopColor: "#0D2F27", simpleBottomColor: "#132630" };
const profile = { avatarUrl: null, bio: "", displayName: "Mia", ekycVerified: true, entityKind: "customer" as const, languages: [], level: 37, needoId: "u0000000001", tierLabel: "黄金会员" };

describe("shared platform membership cards", () => {
  it("maps all ten theme colors and keeps empty profile rows visible", () => {
    const markup = renderToStaticMarkup(<PlatformMembershipDetailCard {...profile} theme={theme} />);
    expect(markup).toContain('/images/generated/profiles/dodo-default-avatar.webp');
    for (const color of Object.values(theme).slice(0, 8)) expect(markup.toLowerCase()).toContain(color.toLowerCase());
    expect(markup).toContain("linear-gradient(155deg, #10242D 0%, #183A32 52%, #24314B 100%)");
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

  it("keeps formal NDP primary and renders Test NDP as a secondary balance", () => {
    const markup = renderToStaticMarkup(
      <PlatformMembershipDetailCard
        {...profile}
        points="12,500"
        pointsLabel="NDP"
        testPoints="800"
        theme={theme}
      />
    );

    expect(markup).toContain("NDP");
    expect(markup).toContain("12,500");
    expect(markup).toContain('data-testid="platform-membership-test-ndp"');
    expect(markup).toContain("Test NDP 800");
    expect(markup.indexOf("12,500")).toBeLessThan(markup.indexOf("Test NDP 800"));
  });

  it("deduplicates locale codes and localized names in the language row", () => {
    const markup = renderToStaticMarkup(
      <PlatformMembershipDetailCard
        {...profile}
        languages={["ja", "日本語", "zh", "中文", "en", "English"]}
        theme={theme}
      />
    );

    expect(markup).not.toMatch(/>ja<|>zh<|>en</);
    expect(markup.match(/日本語/g)).toHaveLength(1);
    expect(markup.match(/中文/g)).toHaveLength(1);
    expect(markup.match(/English/g)).toHaveLength(1);
  });

  it("routes membership simple cards through the unified design", () => {
    const markup = renderToStaticMarkup(<PlatformMembershipSimpleCard {...profile} bio={"long ".repeat(80)} entityKind="technician" simpleBottomColor={theme.simpleBottomColor} simpleTopColor={theme.simpleTopColor} />);
    expect(markup).toContain('data-testid="unified-info-card"');
    expect(markup).toContain('data-card-kind="technician"');
    expect(markup.toLowerCase()).not.toContain(theme.simpleTopColor.toLowerCase());
    expect(markup.toLowerCase()).not.toContain(theme.simpleBottomColor.toLowerCase());
    expect(markup).not.toContain("Lv.37");
    expect(markup).toContain("line-clamp-3");
  });

  it("centrally resolves readable foregrounds without enforcing theme contrast", () => {
    expect(resolveMembershipTheme(theme).detailTextColor).toMatch(/^#/);
    expect(resolveMembershipDetailGradient(theme)).toBe(
      "linear-gradient(155deg, #10242D 0%, #183A32 52%, #24314B 100%)"
    );
  });
});
