export type SocialEntityType = "user" | "technician" | "shop";

export type SocialPortalScope = "user" | "merchant" | "technician";

export type SocialVisibility = "public" | "followers" | "friends" | "private";

export type SocialCommentPermission = "everyone" | "friends";

export type SocialPostStatus = "published" | "draft" | "deleted";

export type SocialPostType =
  | "post"
  | "reply"
  | "quote"
  | "repost"
  | "announcement"
  | "technician-daily";

export type SocialVerifiedStatus = "verified" | "business" | "rising" | "none";

export type SocialFeedTab = "for-you" | "following";

export type SocialTimelineFilterTab = "nearby" | "friends" | "mine";

export type SocialProfileTab = "posts" | "replies" | "media" | "likes";

export type SocialSearchTab = "all" | "profiles" | "posts" | "media" | "tags";

export type SocialMediaType = "image" | "video";

export type SocialNotificationType = "reply" | "like" | "repost" | "quote" | "follow" | "mention";

export interface SocialProfileRef {
  id: string;
  entityType: SocialEntityType;
}

export interface SocialProfile {
  id: string;
  entityType: SocialEntityType;
  displayName: string;
  handle: string;
  avatar: string;
  coverImage: string;
  coverImages?: string[];
  bio: string;
  location?: string;
  birthday?: string;
  joinedAt: string;
  verifiedStatus: SocialVerifiedStatus;
  followerCount: number;
  followingCount: number;
  extraProfileFields: Record<string, string | string[] | boolean>;
  headline?: string;
  pinnedPostId?: string;
}

export interface SocialMediaItem {
  id: string;
  type: SocialMediaType;
  url: string;
  thumbnailUrl?: string;
  alt?: string;
  aspectRatio?: number;
  durationLabel?: string;
}

export interface SocialPost {
  id: string;
  authorId: string;
  authorType: SocialEntityType;
  text: string;
  media: SocialMediaItem[];
  hashtags: string[];
  mentions: string[];
  quotePostId?: string;
  repostPostId?: string;
  replyToPostId?: string;
  createdAt: string;
  updatedAt?: string;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  viewCount: number;
  bookmarkCount: number;
  isPinned: boolean;
  visibility: SocialVisibility;
  commentPermission?: SocialCommentPermission;
  locationLabel?: string;
  audienceProfileKeys?: string[];
  status: SocialPostStatus;
  postType: SocialPostType;
}

export interface PostInteractionState {
  postId: string;
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
  shared: boolean;
  followingAuthor: boolean;
}

export interface ProfileTabState {
  profileId: string;
  tabType: SocialProfileTab;
  listData: string[];
  cursor?: string;
  loading: boolean;
  hasMore: boolean;
}

export interface SocialComposerDraft {
  authorKey: string;
  text: string;
  media: SocialMediaItem[];
  quotePostId?: string;
  replyToPostId?: string;
  editPostId?: string;
  postType?: SocialPostType;
  visibility?: SocialVisibility;
  commentPermission?: SocialCommentPermission;
  locationLabel?: string;
  audienceProfileKeys?: string[];
  updatedAt: string;
}

export interface SocialNotification {
  id: string;
  type: SocialNotificationType;
  actorKey: string;
  recipientKey: string;
  postId?: string;
  createdAt: string;
  read: boolean;
  content: string;
}

export interface SocialProfileOverrides {
  bio?: string;
  coverImage?: string;
  location?: string;
  birthday?: string;
  joinedAt?: string;
  verifiedStatus?: SocialVerifiedStatus;
  extraProfileFields?: Record<string, string | string[] | boolean>;
  headline?: string;
  pinnedPostId?: string;
}

export interface SocialState {
  posts: SocialPost[];
  follows: Record<string, string[]>;
  interactions: Record<string, Record<string, Omit<PostInteractionState, "followingAuthor">>>;
  drafts: Record<string, SocialComposerDraft>;
  notifications: SocialNotification[];
  profileOverrides: Record<string, SocialProfileOverrides>;
  refreshedAt: string;
}

export interface SocialSearchResult {
  profiles: SocialProfile[];
  posts: SocialPost[];
  tags: Array<{ tag: string; count: number }>;
}

export interface SocialCreatePostInput {
  authorKey: string;
  text: string;
  media?: SocialMediaItem[];
  quotePostId?: string;
  replyToPostId?: string;
  visibility?: SocialVisibility;
  commentPermission?: SocialCommentPermission;
  locationLabel?: string;
  audienceProfileKeys?: string[];
  postType?: SocialPostType;
}

export interface SocialUpdatePostInput {
  postId: string;
  actorKey: string;
  text: string;
  media: SocialMediaItem[];
  visibility: SocialVisibility;
  commentPermission: SocialCommentPermission;
  locationLabel?: string;
  audienceProfileKeys?: string[];
  postType: SocialPostType;
}
