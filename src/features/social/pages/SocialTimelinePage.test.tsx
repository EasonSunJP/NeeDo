import { describe, expect, it } from "vitest";
import source from "./SocialTimelinePage.tsx?raw";

describe("SocialTimelinePage", () => {
  it("keeps the mine filter inside the timeline instead of navigating to profile or me", () => {
    expect(source).toContain('raw === "nearby" || raw === "friends" || raw === "mine"');
    expect(source).toMatch(/const handleTimelineFilterChange = \(nextFilter: SocialTimelineFilterTab\) => \{\s*setTimelineFilter\(nextFilter\);\s*\};/);
    expect(source).not.toMatch(/nextFilter === "mine"[\s\S]*navigate\(/);
  });

  it("uses the same first-row header component as the user home page", () => {
    const headerStart = source.indexOf("<FloatingHomeHeader");
    const headerEnd = source.indexOf("<SocialTimelineHeaderSearch");
    const headerSource = source.slice(headerStart, headerEnd);

    expect(source).toContain('import { SharedHomeHeader } from "../../../components/mobile/SharedHomeHeader";');
    expect(headerSource).toContain("<SharedHomeHeader");
    expect(headerSource).toContain("avatarLevelLabel={getSocialProfileTextField(actor, \"memberLevelLabel\")}");
    expect(headerSource).toContain("avatarMembershipLevel={getSocialProfileTextField(actor, \"memberLevel\")}");
    expect(headerSource).toContain("locationCaption=\"当前服务区域\"");
    expect(headerSource).toContain("locationLabel={selectedHomeLocation?.label ?? \"当前服务区域\"}");
    expect(headerSource).toContain("settingsTo={portalConfig.settingsPath}");
    expect(headerSource).not.toContain("<AvatarImage");
    expect(headerSource).not.toContain("<SocialMembershipStatusBadge");
  });
});
