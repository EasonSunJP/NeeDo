import { describe, expect, it } from "vitest";
import type { SocialPost, SocialProfile } from "./types";
import { filterTimelinePosts, extractAreaHints } from "./timeline";
import { extractMentions, isValidSocialPostMediaSet, normalizeSocialPostMedia } from "./utils";
import { getNearestLocationOptionId } from "../../lib/location";

const actorKey = "user:actor";
const friendKey = "technician:friend";
const strangerKey = "shop:stranger";

const profiles: Record<string, SocialProfile> = {
  [actorKey]: {
    id: "actor",
    entityType: "user",
    displayName: "Actor",
    handle: "actor",
    avatar: "",
    coverImage: "",
    bio: "",
    location: "银座 · 东京",
    joinedAt: "2026-04-01T00:00:00.000Z",
    verifiedStatus: "none",
    followerCount: 0,
    followingCount: 1,
    extraProfileFields: {}
  },
  [friendKey]: {
    id: "friend",
    entityType: "technician",
    displayName: "Friend",
    handle: "friend",
    avatar: "",
    coverImage: "",
    bio: "",
    location: "银座 · 东京",
    joinedAt: "2026-04-01T00:00:00.000Z",
    verifiedStatus: "verified",
    followerCount: 1,
    followingCount: 1,
    extraProfileFields: {
      visibilityTags: ["VIP客户", "银座"]
    }
  },
  [strangerKey]: {
    id: "stranger",
    entityType: "shop",
    displayName: "Stranger",
    handle: "stranger",
    avatar: "",
    coverImage: "",
    bio: "",
    location: "新宿 · 东京",
    joinedAt: "2026-04-01T00:00:00.000Z",
    verifiedStatus: "business",
    followerCount: 0,
    followingCount: 0,
    extraProfileFields: {}
  }
};

const posts: SocialPost[] = [
  {
    id: "mine",
    authorId: "actor",
    authorType: "user",
    text: "我的动态",
    media: [],
    hashtags: [],
    mentions: [],
    createdAt: "2026-04-18T10:00:00.000Z",
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    isPinned: false,
    visibility: "public",
    locationLabel: "银座",
    status: "published",
    postType: "post"
  },
  {
    id: "friend",
    authorId: "friend",
    authorType: "technician",
    text: "好友动态",
    media: [],
    hashtags: [],
    mentions: [],
    createdAt: "2026-04-18T11:00:00.000Z",
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    isPinned: false,
    visibility: "friends",
    locationLabel: "银座",
    status: "published",
    postType: "post"
  },
  {
    id: "stranger",
    authorId: "stranger",
    authorType: "shop",
    text: "陌生人动态",
    media: [],
    hashtags: [],
    mentions: [],
    createdAt: "2026-04-18T12:00:00.000Z",
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    isPinned: false,
    visibility: "public",
    locationLabel: "新宿",
    status: "published",
    postType: "post"
  }
];

const follows = {
  [actorKey]: [friendKey],
  [friendKey]: [actorKey],
  [strangerKey]: []
};

describe("social timeline filters", () => {
  it("extracts concrete area hints and drops broad regions", () => {
    expect(extractAreaHints("银座 · 东京 / 银座、东京 23 区")).toEqual(["银座"]);
  });

  it("returns only the current actor posts for mine filter", () => {
    const result = filterTimelinePosts({
      posts,
      profiles,
      follows,
      actorKey,
      filter: "mine"
    });

    expect(result.map((post) => post.id)).toEqual(["mine"]);
  });

  it("returns only mutual-friend posts for friends filter", () => {
    const result = filterTimelinePosts({
      posts,
      profiles,
      follows,
      actorKey,
      filter: "friends"
    });

    expect(result.map((post) => post.id)).toEqual(["friend"]);
  });

  it("matches nearby posts by area hints when precise coordinates are unavailable", () => {
    const result = filterTimelinePosts({
      posts,
      profiles,
      follows,
      actorKey,
      filter: "nearby",
      locationContext: {
        areaHints: ["银座"]
      }
    });

    expect(result.map((post) => post.id)).toEqual(["friend", "mine"]);
  });

  it("matches nearby posts when the home location uses a ward-level label", () => {
    const result = filterTimelinePosts({
      posts,
      profiles,
      follows,
      actorKey,
      filter: "nearby",
      locationContext: {
        areaHints: ["新宿区", "西新宿"]
      }
    });

    expect(result.map((post) => post.id)).toEqual(["stranger"]);
  });

  it("allows tag-only posts only when the actor profile matches an allowed tag", () => {
    const taggedPost: SocialPost = {
      ...posts[2],
      id: "tagged",
      visibility: "tag_only",
      visibilityTagIds: ["VIP客户"],
      includeRelatedPeople: false,
      locationLabel: "银座"
    };

    const matched = filterTimelinePosts({
      posts: [taggedPost],
      profiles,
      follows,
      actorKey: friendKey,
      filter: "nearby",
      locationContext: {
        areaHints: ["银座"]
      }
    });
    const hidden = filterTimelinePosts({
      posts: [taggedPost],
      profiles,
      follows,
      actorKey,
      filter: "nearby",
      locationContext: {
        areaHints: ["银座"]
      }
    });

    expect(matched.map((post) => post.id)).toEqual(["tagged"]);
    expect(hidden).toEqual([]);
  });

  it("honors user-only accounts and the related people switch", () => {
    const userOnlyPost: SocialPost = {
      ...posts[2],
      id: "user-only",
      visibility: "user_only",
      visibilityProfileKeys: [actorKey],
      includeRelatedPeople: false,
      locationLabel: "银座"
    };
    const relatedPost: SocialPost = {
      ...posts[0],
      id: "related",
      visibility: "user_only",
      visibilityProfileKeys: [],
      includeRelatedPeople: true,
      locationLabel: "银座"
    };

    const direct = filterTimelinePosts({
      posts: [userOnlyPost],
      profiles,
      follows,
      actorKey,
      filter: "nearby",
      locationContext: {
        areaHints: ["银座"]
      }
    });
    const related = filterTimelinePosts({
      posts: [relatedPost],
      profiles,
      follows,
      actorKey: friendKey,
      filter: "nearby",
      locationContext: {
        areaHints: ["银座"]
      }
    });

    expect(direct.map((post) => post.id)).toEqual(["user-only"]);
    expect(related.map((post) => post.id)).toEqual(["related"]);
  });

  it("resolves a device coordinate to the nearest home location option", () => {
    const nearestId = getNearestLocationOptionId(
      [
        { id: "azabu", label: "东京 / 港区 / 麻布十番", city: "东京", area: "港区", district: "麻布十番" },
        { id: "shinjuku", label: "东京 / 新宿区 / 西新宿", city: "东京", area: "新宿区", district: "西新宿" }
      ],
      { lat: 35.6897, lng: 139.692 }
    );

    expect(nearestId).toBe("shinjuku");
  });
});

describe("social post media rules", () => {
  const images = Array.from({ length: 10 }, (_, index) => ({
    id: `image-${index + 1}`,
    type: "image" as const,
    url: `/image-${index + 1}.jpg`
  }));
  const videos = Array.from({ length: 2 }, (_, index) => ({
    id: `video-${index + 1}`,
    type: "video" as const,
    url: `/video-${index + 1}.mp4`
  }));

  it("keeps at most nine images in one post", () => {
    expect(normalizeSocialPostMedia(images)).toHaveLength(9);
    expect(isValidSocialPostMediaSet(images.slice(0, 9))).toBe(true);
    expect(isValidSocialPostMediaSet(images)).toBe(false);
  });

  it("keeps only one video and does not mix image posts with video posts", () => {
    expect(normalizeSocialPostMedia([images[0], videos[0], videos[1]])).toEqual([videos[0]]);
    expect(isValidSocialPostMediaSet([videos[0]])).toBe(true);
    expect(isValidSocialPostMediaSet([images[0], videos[0]])).toBe(false);
  });
});

describe("social mention rules", () => {
  it("matches mentions by the unique account name instead of a separate handle", () => {
    const mentionProfiles = [
      { displayName: "Mia", handle: "admin" },
      { displayName: "GINZA Calm Body Lab", handle: "admin" }
    ];

    expect(extractMentions("今晚可以直接 @GINZA Calm Body Lab 或 @Mia 询问。@admin 不再匹配。", mentionProfiles)).toEqual([
      "GINZA Calm Body Lab",
      "Mia"
    ]);
  });
});
