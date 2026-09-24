import { describe, expect, it } from "vitest";
import source from "./SocialTimelinePage.tsx?raw";
import { filterSocialTimelinePostsByQuery } from "./SocialTimelinePage";
import { buildTimelineUpdateNotifications } from "../timeline-notifications";
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
    expect(source).toContain('mine: {');
    expect(source).toMatch(/const handleTimelineFilterChange = \(nextFilter: SocialTimelineFilterTab\) => \{\s*setTimelineFilter\(nextFilter\);\s*\};/);
    expect(source).not.toMatch(/nextFilter === "mine"[\s\S]*navigate\(/);
  });

  it("enters the populated friends timeline instead of restoring a stale filter", () => {
    expect(source).toContain(
      'useState<SocialTimelineFilterTab>("friends")'
    );
    expect(source).toMatch(/\[scope\][\s\S]*setTimelineFilter\("friends"\)/);
    expect(source).not.toContain("timelineFilterStorageKey");
    expect(source).not.toContain("needo.social.timeline.filter");
  });

  it("refreshes formal social names when the timeline route is entered again", () => {
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s*refreshFeeds\(\);\s*\}, \[location\.pathname, refreshFeeds\]\);/
    );
  });

  it("filters timeline posts by typed text, hashtags, mentions, and author profile without leaving the page", () => {
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "排版").map((post) => post.id)).toEqual(["post-layout"]);
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "#动态排版测试").map((post) => post.id)).toEqual(["post-layout"]);
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "@Mia").map((post) => post.id)).toEqual(["post-layout"]);
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "港区").map((post) => post.id)).toEqual(["post-layout"]);
    expect(filterSocialTimelinePostsByQuery(posts, profiles, "  ")).toEqual(posts);
  });

  it("builds only friend and nearby post notices with working author media", () => {
    expect(buildTimelineUpdateNotifications({
      actorKey: "user:current-user",
      friendPosts: [posts[0]],
      nearbyPosts: [posts[0], posts[1]],
      profiles,
    })).toEqual([
      expect.objectContaining({
        actorKey: "user:customer-other",
        content: "附近发布了新动态",
        postId: "post-schedule",
      }),
      expect.objectContaining({
        actorKey: "user:customer-mia",
        content: "好友发布了新动态",
        postId: "post-layout",
      }),
    ]);
  });

  it("marks only unseen posts as unread using the server view record", () => {
    const notices = buildTimelineUpdateNotifications({
      actorKey: "user:current-user",
      friendPosts: [{ ...posts[0], viewerViewed: true }],
      nearbyPosts: [{ ...posts[1], viewerViewed: false }],
      profiles
    });
    expect(notices.map((notice) => ({ id: notice.postId, unread: notice.unread }))).toEqual([
      { id: "post-schedule", unread: true },
      { id: "post-layout", unread: false }
    ]);
  });

  it("links timeline notices to their post and does not mix in system notifications", () => {
    expect(source).toContain('to={socialPaths.post(scope, item.postId)}');
    expect(source).toContain('title="附近与好友新动态"');
    expect(source).not.toContain("getNotifications(actorKey)");
  });

  it("shows the authoritative unread count on the header notification bell", () => {
    expect(source).toContain("secondaryActionUnreadCount={unreadNotificationCount}");
    expect(source).toContain("useTimelineUnreadCount(scope)");
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
    expect(headerSource).toContain('getSocialProfileTextField(actor, "memberLevelLabel")');
    expect(headerSource).toContain('getSocialProfileTextField(actor, "memberLevel")');
    expect(headerSource).toContain("locationCaption=\"当前服务区域\"");
    expect(headerSource).toContain("locationLabel={selectedHomeLocation?.label ?? \"当前服务区域\"}");
    expect(headerSource).toContain("secondaryActionTo={socialPaths.notifications(scope)}");
    expect(headerSource).toContain('secondaryActionLabel="动态通知"');
    expect(headerSource).not.toContain("settingsTo={portalConfig.settingsPath}");
    expect(headerSource).not.toContain("<AvatarImage");
    expect(headerSource).not.toContain("<SocialMembershipStatusBadge");
  });

  it("uses the authenticated customer profile header on the user timeline instead of the social actor snapshot", () => {
    expect(source).toContain(
      'import { useCustomerSelfProfile } from "../../core-read/useCustomerSelfProfile";'
    );
    expect(source).toContain('useCustomerSelfProfile(scope === "user")');
    expect(source).toMatch(
      /avatarSrc=\{\s*scope === "user"\s*\? session\?\.avatarUrl \?\? currentUserCustomer\?\.avatar/
    );
    expect(source).not.toContain('scope === "user" ? actor?.avatar');
  });

  it("shows the persisted customer experience level instead of deriving a level from review score", () => {
    expect(source).toContain("currentUserCustomer.experienceLevel");
    expect(source).toContain("`Lv.${currentUserCustomer.experienceLevel}`");
    expect(source).not.toContain(
      "getCustomerLevelLabel(currentUserCustomer.activeScore)"
    );
  });

  it("uses the same formal user-home carousel as the home page", () => {
    expect(source).toContain(
      'import { PublishedCarousel } from "../../content-publication/PublishedCarousel";'
    );
    expect(source).toContain(
      '<PublishedCarousel scene="user-home" cardHeightClassName="h-[204px]" />'
    );
    expect(source).not.toContain("useCarouselStore");
    expect(source).not.toContain('getResolvedCarouselSlides("timeline"');
    expect(source).not.toContain("carouselScenes.timeline");
  });
});
