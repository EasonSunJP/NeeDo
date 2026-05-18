import { buildAbsolutePortalUrl } from "../../lib/share";
import type { SocialEntityType, SocialMediaItem, SocialPortalScope, SocialPost, SocialProfile, SocialProfileRef } from "./types";
import type { SocialCommentPermission, SocialVisibility } from "./types";

export const socialImageUploadLimit = 9;
export const socialVideoUploadLimit = 1;
export const socialHashtagChipClassName =
  "rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-surface))] px-3 py-1.5 text-[12px] font-black text-[color:var(--client-primary)]";

const hashtagBodyPattern = "[\\p{L}\\p{N}_-]+";
const hashtagMatcher = new RegExp(`[＃#](${hashtagBodyPattern})`, "gu");
const completedHashtagMatcher = new RegExp(`[＃#](${hashtagBodyPattern})(?=[\\s,，、])`, "gu");

export function formatHashtagLabel(value: string) {
  const label = value.replace(/^[＃#]+/, "").trim();

  return label;
}

export function profileKey(ref: SocialProfileRef) {
  return `${ref.entityType}:${ref.id}`;
}

export function parseProfileKey(value: string): SocialProfileRef {
  const [entityType, id] = value.split(":");

  return {
    entityType: (entityType as SocialEntityType) || "user",
    id: id || value
  };
}

export function scopePrefix(scope: SocialPortalScope) {
  return scope === "user" ? "" : `/${scope}`;
}

export function buildHandleSeed(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s/]+/g, "_")
    .replace(/[^\w\u4e00-\u9fff-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function profileMentionLabel(profile: Pick<SocialProfile, "displayName" | "handle"> | null | undefined) {
  const name = profile?.displayName?.trim() || profile?.handle?.trim();

  if (!name) {
    return "@needo";
  }

  return name.startsWith("@") ? name : `@${name}`;
}

export function profileHandle(profile: Pick<SocialProfile, "displayName" | "handle"> | null | undefined) {
  return profileMentionLabel(profile);
}

export function buildProfileMentionMatcher(profiles: Array<Pick<SocialProfile, "displayName" | "handle">>) {
  const labels = unique(profiles.map(profileMentionLabel).filter((label) => label.length > 1))
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp);

  if (labels.length === 0) {
    return null;
  }

  return new RegExp(labels.join("|"), "gu");
}

export function formatRelativeTime(value: string) {
  const now = Date.now();
  const target = new Date(value).getTime();

  if (Number.isNaN(target)) {
    return value;
  }

  const diffMinutes = Math.max(1, Math.floor((now - target) / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

export function formatJoinedDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long"
  }).format(new Date(value));
}

export function formatCount(value: number) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return `${value}`;
}

export function formatSocialVisibilityLabel(value: SocialVisibility) {
  if (value === "followers") {
    return "仅关注可见";
  }

  if (value === "friends") {
    return "仅好友可见";
  }

  if (value === "tag_only") {
    return "标签可见";
  }

  if (value === "user_only") {
    return "指定人可见";
  }

  if (value === "private") {
    return "仅自己可见";
  }

  return "公开";
}

export function formatSocialCommentPermissionLabel(value: SocialCommentPermission = "everyone") {
  if (value === "friends") {
    return "仅好友";
  }

  return "任何人";
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function extractHashtags(text: string) {
  return unique(Array.from(text.matchAll(hashtagMatcher), (match) => match[1]));
}

export function extractCompletedHashtags(text: string) {
  return unique(Array.from(text.matchAll(completedHashtagMatcher), (match) => match[1]));
}

export function extractMentions(text: string, profiles?: Array<Pick<SocialProfile, "displayName" | "handle">>) {
  if (profiles?.length) {
    const matcher = buildProfileMentionMatcher(profiles);

    if (!matcher) {
      return [];
    }

    return unique(Array.from(text.matchAll(matcher), (match) => match[0].replace(/^@/, "")));
  }

  return unique(Array.from(text.matchAll(/@([^\s@#＃]+)/g), (match) => match[1]));
}

export function sortPostsByNewest(posts: SocialPost[]) {
  return [...posts].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function sortPostsByOldest(posts: SocialPost[]) {
  return [...posts].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export function nextId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isTransientMediaUrl(value: string | undefined) {
  return Boolean(value && (value.startsWith("data:") || value.startsWith("blob:")));
}

export function normalizeSocialPostMedia(media: SocialMediaItem[]) {
  const videos = media.filter((item) => item.type === "video");

  if (videos.length > 0) {
    return videos.slice(0, socialVideoUploadLimit);
  }

  return media.filter((item) => item.type === "image").slice(0, socialImageUploadLimit);
}

export function isValidSocialPostMediaSet(media: SocialMediaItem[]) {
  const imageCount = media.filter((item) => item.type === "image").length;
  const videoCount = media.filter((item) => item.type === "video").length;

  return (videoCount === 0 && imageCount <= socialImageUploadLimit) || (imageCount === 0 && videoCount <= socialVideoUploadLimit);
}

export function createMediaFromFile(file: File): SocialMediaItem {
  const type = file.type.startsWith("video/") ? "video" : "image";
  const objectUrl = URL.createObjectURL(file);

  return {
    id: nextId("media"),
    type,
    url: objectUrl,
    thumbnailUrl: type === "video" ? undefined : objectUrl,
    alt: file.name
  };
}

export function buildAbsoluteUrl(pathname: string) {
  return buildAbsolutePortalUrl(pathname);
}
