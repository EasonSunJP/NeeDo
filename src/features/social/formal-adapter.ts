import type { RealtimeSocialPost } from "../realtime/api";
import type {
  SocialEntityType,
  SocialMediaItem,
  SocialPost,
  SocialPostType,
  SocialProfile,
  SocialVisibility
} from "./types";

type FormalSocialCounters = {
  likes?: number;
  replies?: number;
  reposts?: number;
  views?: number;
  bookmarks?: number;
};

export type FormalSocialMediaEnvelope = {
  items: SocialMediaItem[];
  quotePostId?: number | string;
  replyToPostId?: number | string;
  repostPostId?: number | string;
  postType?: SocialPostType;
  locationLabel?: string;
  counters?: FormalSocialCounters;
  namespace?: string;
  dataset?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSocialMediaItem(value: unknown): value is SocialMediaItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.type === "image" || value.type === "video") &&
    typeof value.url === "string" &&
    !value.url.startsWith("blob:")
  );
}

function readMediaEnvelope(value: unknown): FormalSocialMediaEnvelope {
  if (Array.isArray(value)) {
    return { items: value.filter(isSocialMediaItem) };
  }

  if (!isRecord(value)) {
    return { items: [] };
  }

  const counters = isRecord(value.counters) ? value.counters : undefined;
  return {
    items: Array.isArray(value.items) ? value.items.filter(isSocialMediaItem) : [],
    quotePostId:
      typeof value.quotePostId === "number" || typeof value.quotePostId === "string"
        ? value.quotePostId
        : undefined,
    replyToPostId:
      typeof value.replyToPostId === "number" || typeof value.replyToPostId === "string"
        ? value.replyToPostId
        : undefined,
    repostPostId:
      typeof value.repostPostId === "number" || typeof value.repostPostId === "string"
        ? value.repostPostId
        : undefined,
    postType:
      typeof value.postType === "string" ? (value.postType as SocialPostType) : undefined,
    locationLabel: typeof value.locationLabel === "string" ? value.locationLabel : undefined,
    counters: counters
      ? {
          likes: typeof counters.likes === "number" ? counters.likes : undefined,
          replies: typeof counters.replies === "number" ? counters.replies : undefined,
          reposts: typeof counters.reposts === "number" ? counters.reposts : undefined,
          views: typeof counters.views === "number" ? counters.views : undefined,
          bookmarks: typeof counters.bookmarks === "number" ? counters.bookmarks : undefined
        }
      : undefined,
    namespace: typeof value.namespace === "string" ? value.namespace : undefined,
    dataset: typeof value.dataset === "string" ? value.dataset : undefined
  };
}

function extractFormalHashtags(text: string) {
  return [...text.matchAll(/[#＃]([^\s#＃]+)/gu)].map((match) => match[1]).filter(Boolean);
}

function toSocialVisibility(value: RealtimeSocialPost["visibility"]): SocialVisibility {
  return value === "followers" ? "followers" : "public";
}

function toEntityType(value: string | undefined): SocialEntityType {
  return value === "shop" || value === "technician" ? value : "user";
}

export function mapFormalSocialPost(post: RealtimeSocialPost): SocialPost {
  const envelope = readMediaEnvelope(post.media);
  const entityType = toEntityType(post.author?.entityType);
  const counters = envelope.counters;

  return {
    id: String(post.id),
    authorId: String(post.authorUserId),
    authorType: entityType,
    text: post.content,
    media: envelope.items,
    hashtags: extractFormalHashtags(post.content),
    mentions: [],
    quotePostId: envelope.quotePostId === undefined ? undefined : String(envelope.quotePostId),
    replyToPostId: envelope.replyToPostId === undefined ? undefined : String(envelope.replyToPostId),
    repostPostId: envelope.repostPostId === undefined ? undefined : String(envelope.repostPostId),
    createdAt: post.createdAt,
    likeCount: counters?.likes ?? 0,
    replyCount: counters?.replies ?? 0,
    repostCount: counters?.reposts ?? 0,
    viewCount: counters?.views ?? 1,
    bookmarkCount: counters?.bookmarks ?? 0,
    isPinned: false,
    visibility: toSocialVisibility(post.visibility),
    locationLabel: envelope.locationLabel,
    status: "published",
    postType: envelope.postType ?? (envelope.quotePostId ? "quote" : "post")
  };
}

export function mapFormalSocialProfiles(posts: RealtimeSocialPost[]) {
  const profiles = posts.flatMap((post): SocialProfile[] => {
    const author = post.author;
    if (!author) return [];
    const entityType = toEntityType(author.entityType);
    const envelope = readMediaEnvelope(post.media);
    const avatar = author.avatarUrl ?? "";

    return [
      {
        id: String(author.userId),
        entityType,
        displayName: author.displayName || author.username,
        handle: author.username,
        avatar,
        coverImage: avatar || envelope.items[0]?.thumbnailUrl || envelope.items[0]?.url || "",
        bio:
          entityType === "shop"
            ? "门店公开发布现场环境、预约提醒和服务更新。"
            : entityType === "technician"
              ? "认证技师公开分享服务准备、专业建议和近期档期。"
              : "记录真实预约体验、现场反馈和生活服务发现。",
        location: envelope.locationLabel,
        joinedAt: post.createdAt,
        verifiedStatus: entityType === "shop" ? "business" : entityType === "technician" ? "verified" : "none",
        followerCount: 0,
        followingCount: 0,
        extraProfileFields: {}
      }
    ];
  });

  return Object.fromEntries(
    profiles.map((profile) => [`${profile.entityType}:${profile.id}`, profile])
  );
}

export function buildFormalSocialMediaEnvelope(input: {
  media: SocialMediaItem[];
  quotePostId?: string;
  replyToPostId?: string;
  postType?: SocialPostType;
  locationLabel?: string;
}): FormalSocialMediaEnvelope {
  const items = input.media.filter((item) => !item.url.startsWith("blob:"));
  if (items.length !== input.media.length) {
    throw new Error("error.social.media_upload_unavailable");
  }

  return {
    items,
    quotePostId: input.quotePostId,
    replyToPostId: input.replyToPostId,
    postType: input.postType,
    locationLabel: input.locationLabel,
    counters: { likes: 0, replies: 0, reposts: 0, views: 1, bookmarks: 0 }
  };
}
