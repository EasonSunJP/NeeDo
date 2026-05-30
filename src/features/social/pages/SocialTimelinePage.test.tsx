import { describe, expect, it } from "vitest";
import source from "./SocialTimelinePage.tsx?raw";
import { filterSocialTimelinePostsByQuery } from "./SocialTimelinePage";
import type { SocialPost, SocialProfile } from "../types";

describe("SocialTimelinePage", () => {
  const profiles: Record<string, SocialProfile> = {
    "user:customer-mia": {
      id: "customer-mia",
      entityType: "user",
      displayName: "Mia",
      handle: "mia_tokyo",
      avatar: "",
      coverImage: "",
      bio: "港区生活动态",
      location: "东京 / 港区 / 麻布十番",
      joinedAt: "2026-05-01T00:00:00.000Z",
      verifiedStatus: "verified",
      followerCount: 18,
      followingCount: 12,
      extraProfileFields: {}
    },
    "user:customer-other": {
      id: "customer-other",
      entityType: "user",
      displayName: "Noa",
      handle: "noa_home",
      avatar: "",
      coverImage: "",
      bio: "预约记录",
      joinedAt: "2026-05-01T00:00:00.000Z",
      verifiedStatus: "none",
      followerCount: 2,
      followingCount: 3,
      extraProfileFields: {}
    }
  };

  const posts: SocialPost[] = [
    {
      id: "post-layout",
      authorId: "customer-mia",
      authorType: "user",
      text: "1 张图动态排版测试，用于检查缩略图网格。",
      media: [],
      hashtags: ["动态排版测试"],
      mentions: ["Mia"],
      createdAt: "2026-05-02T00:00:00.000Z",
      likeCount: 18,
      replyCount: 2,
      repostCount: 1,
      viewCount: 308,
      bookmarkCount: 0,
      isPinned: false,
      visibility: "public",
      locationLabel: "东京 / 港区 / 麻布十番",
      status: "published",
      postType: "post"
    },
    {
      id: "post-schedule",
      authorId: "customer-other",
      authorType: "user",
      text: "预约后确认到店时间。",
      media: [],
      hashtags: ["预约"],
      mentions: ["Noa"],
      createdAt: "2026-05-03T00:00:00.000Z",
      likeCount: 3,
      replyCount: 0,
      repostCount: 0,
      viewCount: 28,
      bookmarkCount: 0,
      isPinned: false,
      visibility: "public",
      status: "published",
      postType: "post"
    }
  ];

  it("keeps the mine filter inside the timeline instead of navigating to profile or me", () => {
    expect(source).toContain('raw === "nearby" || raw === "friends" || raw === "mine"');
    expect(source).toMatch(/const handleTimelineFilterChange = \(nextFilter: SocialTimelineFilterTab\) => \{\s*setTimelineFilter\(nextFilter\);\s*\};/);
    expect(source).not.toMatch(/nextFilter === "mine"[\s\S]*navigate\(/);
  });

  it("filters timeline posts by typed text, hashtags, mentions, and author profile without leaving the page", () => {
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "排版").map((post) => post.id)).toEqual(["post-layout"]);
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "#动态排版测试").map((post) => post.id)).toEqual(["post-layout"]);
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "@Mia").map((post) => post.id)).toEqual(["post-layout"]);
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "港区").map((post) => post.id)).toEqual(["post-layout"]);
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "  ")).toEqual(posts);
  });

  it("renders the timeline header search as an inline form instead of a navigation link", () => {
    expect(source).toMatch(/function SocialTimelineHeaderSearch\(\{\s*value,\s*onChange,\s*onSubmit/);
    expect(source).toContain("value={value}");
    expect(source).toContain("onChange={onChange}");
    expect(source).toContain("onSubmit={onSubmit}");
    expect(source).toContain("<SocialTimelineHeaderSearch");
    expect(source).not.toContain("<SocialTimelineHeaderSearch to=");
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
