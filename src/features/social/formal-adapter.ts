import type {
  RealtimeSocialCreateMediaEnvelope,
  RealtimeSocialPost,
  RealtimeSocialProfileSummary
} from "../realtime/api";
import { normalizeImMessageRichText, type ImMessageRichText } from "../im/reaction-policy";
import { resolveAvatarUrl } from "../../lib/defaultAvatar";
import type {
  SocialEntityType,
  SocialMediaItem,
  SocialPost,
  SocialPostType,
  SocialProfile,
  SocialRichText,
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
  mentionUserIds?: number[];
  quotePostId?: number | string;
  replyToPostId?: number | string;
  repostPostId?: number | string;
  postType?: SocialPostType;
  locationLabel?: string;
  richText?: unknown;
  counters?: FormalSocialCounters;
  namespace?: string;
  dataset?: string;
};

export type FormalSocialCreateMediaEnvelope = RealtimeSocialCreateMediaEnvelope;

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

function readMediaAssetPublicId(item: SocialMediaItem) {
  if (item.mediaAssetPublicId && /^[a-f0-9]{64}$/u.test(item.mediaAssetPublicId)) {
    return item.mediaAssetPublicId;
  }

  return item.url.match(/\/media\/content\/([a-f0-9]{64})\.(?:jpg|png|webp)(?:[?#].*)?$/u)?.[1];
}

function toEditableSocialMediaItem(item: SocialMediaItem): SocialMediaItem {
  const mediaAssetPublicId = readMediaAssetPublicId(item);
  return mediaAssetPublicId ? { ...item, mediaAssetPublicId } : item;
}

function readMentionUserIds(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter(
    (item): item is number => typeof item === "number" && Number.isSafeInteger(item) && item > 0
  );
  return ids.length === value.length ? Array.from(new Set(ids)) : undefined;
}

function readMediaEnvelope(value: unknown): FormalSocialMediaEnvelope {
  if (Array.isArray(value)) {
    return { items: value.filter(isSocialMediaItem).map(toEditableSocialMediaItem) };
  }

  if (!isRecord(value)) {
    return { items: [] };
  }

  const counters = isRecord(value.counters) ? value.counters : undefined;
  return {
    items: Array.isArray(value.items)
      ? value.items.filter(isSocialMediaItem).map(toEditableSocialMediaItem)
      : [],
    mentionUserIds: readMentionUserIds(value.mentionUserIds),
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
    richText: value.richText,
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
  const counters = post.counters ?? envelope.counters;

  return {
    id: String(post.id),
    viewerViewed: Boolean(post.viewerInteraction?.viewed),
    authorId: String(post.authorUserId),
    authorType: entityType,
    text: post.content,
    media: envelope.items,
    hashtags: extractFormalHashtags(post.content),
    mentions: [],
    mentionUserIds: envelope.mentionUserIds ?? [],
    quotePostId: envelope.quotePostId === undefined ? undefined : String(envelope.quotePostId),
    replyToPostId: post.replyToPostId === null ? undefined : String(post.replyToPostId),
    richText: normalizeImMessageRichText(post.content, envelope.richText),
    repostPostId: envelope.repostPostId === undefined ? undefined : String(envelope.repostPostId),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    likeCount: counters?.likes ?? 0,
    replyCount: post.replyCount,
    repostCount: counters?.reposts ?? 0,
    viewCount: counters?.views ?? 1,
    bookmarkCount: counters?.bookmarks ?? 0,
    isPinned: Boolean(post.isPinned),
    visibility: toSocialVisibility(post.visibility),
    locationLabel: envelope.locationLabel,
    status: "published",
    postType: envelope.postType ?? (envelope.quotePostId ? "quote" : "post")
  };
}

export function mapFormalSocialProfile(author: RealtimeSocialProfileSummary): SocialProfile {
  const entityType = toEntityType(author.entityType);
  const avatar = resolveAvatarUrl(author.avatarUrl);

  return {
    id: String(author.userId),
    identityId: author.identityId,
    entityType,
    displayName: author.displayName || author.username,
    handle: author.username,
    avatar,
    coverImage: avatar,
    bio:
      entityType === "shop"
        ? "门店公开发布现场环境、预约提醒和服务更新。"
        : entityType === "technician"
          ? "认证技师公开分享服务准备、专业建议和近期档期。"
          : "记录真实预约体验、现场反馈和生活服务发现。",
    joinedAt: author.joinedAt,
    verifiedStatus: entityType === "shop" ? "business" : entityType === "technician" ? "verified" : "none",
    followerCount: 0,
    followingCount: 0,
    extraProfileFields: {}
  };
}

export function mapFormalSocialProfiles(posts: RealtimeSocialPost[]) {
  const profiles = posts.flatMap((post): SocialProfile[] => {
    const author = post.author;
    if (!author) return [];
    const envelope = readMediaEnvelope(post.media);
    const profile = mapFormalSocialProfile(author);

    return [{
      ...profile,
      coverImage: profile.coverImage || envelope.items[0]?.thumbnailUrl || envelope.items[0]?.url || "",
      location: envelope.locationLabel,
      ...(post.isPinned ? { pinnedPostId: String(post.id) } : {})
    }];
  });

  return profiles.reduce<Record<string, SocialProfile>>((result, profile) => {
    const key = `${profile.entityType}:${profile.id}`;
    const previous = result[key];
    result[key] = {
      ...profile,
      ...(profile.pinnedPostId ?? previous?.pinnedPostId
        ? { pinnedPostId: profile.pinnedPostId ?? previous?.pinnedPostId }
        : {})
    };
    return result;
  }, {});
}

export function buildFormalSocialMediaEnvelope(input: {
  media: SocialMediaItem[];
  quotePostId?: string;
  replyToPostId?: string;
  postType?: SocialPostType;
  locationLabel?: string;
  richText?: SocialRichText;
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
    richText: input.richText,
    counters: { likes: 0, replies: 0, reposts: 0, views: 1, bookmarks: 0 }
  };
}

export function buildFormalSocialCreateMediaEnvelope(input: {
  media: SocialMediaItem[];
  quotePostId?: string;
  replyToPostId?: string;
  repostPostId?: string;
  postType?: SocialPostType;
  locationLabel?: string;
  richText?: ImMessageRichText;
}): FormalSocialCreateMediaEnvelope {
  const items = input.media.map((item) => {
    if (
      item.type !== "image" ||
      !item.mediaAssetPublicId ||
      !/^[a-f0-9]{64}$/u.test(item.mediaAssetPublicId)
    ) {
      throw new Error("error.social.media_upload_unavailable");
    }
    return {
      id: item.id,
      type: "image" as const,
      mediaAssetPublicId: item.mediaAssetPublicId,
      ...(item.alt ? { alt: item.alt } : {})
    };
  });

  return {
    items,
    ...(input.quotePostId !== undefined ? { quotePostId: Number(input.quotePostId) } : {}),
    ...(input.replyToPostId !== undefined ? { replyToPostId: Number(input.replyToPostId) } : {}),
    ...(input.repostPostId !== undefined ? { repostPostId: Number(input.repostPostId) } : {}),
    ...(input.postType !== undefined ? { postType: input.postType } : {}),
    ...(input.locationLabel !== undefined ? { locationLabel: input.locationLabel } : {}),
    ...(input.richText !== undefined ? { richText: input.richText } : {})
  };
}
