import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { realtimeApi, subscribeRealtimeEvents, type RealtimeNotification } from "../realtime/api";
import type {
  PostInteractionState,
  SocialComposerDraft,
  SocialCreatePostInput,
  SocialNotification,
  SocialPortalScope,
  SocialPost,
  SocialProfile,
  SocialProfileOverrides,
  SocialSearchResult,
  SocialState,
  SocialTimelineFilterTab,
  SocialUpdatePostInput
} from "./types";
import {
  buildFormalSocialMediaEnvelope,
  mapFormalSocialPost,
  mapFormalSocialProfile,
  mapFormalSocialProfiles
} from "./formal-adapter";
import {
  canActorViewPost,
  filterTimelinePosts,
  isVisiblePost,
  postAuthorKey,
  resolveProfileAreaHints,
  type SocialTimelineLocationContext
} from "./timeline";
import {
  extractHashtags,
  extractMentions,
  isTransientMediaUrl,
  nextId,
  normalizeSocialPostMedia,
  parseProfileKey,
  profileMentionLabel,
  profileKey,
  sortPostsByNewest,
  sortPostsByOldest,
  unique
} from "./utils";

type SocialContextValue = {
  state: SocialState;
  profiles: Record<string, SocialProfile>;
  profileList: SocialProfile[];
  composerProfileKeys: string[];
  actorByScope: Record<SocialPortalScope, string>;
  getActorForScope: (scope: SocialPortalScope) => string;
  getPostById: (postId: string, actorKey?: string) => SocialPost | undefined;
  getTimeline: (tab: "for-you" | "following", actorKey: string) => SocialPost[];
  getTimelineFeed: (filter: SocialTimelineFilterTab, actorKey: string, locationContext?: SocialTimelineLocationContext) => SocialPost[];
  getReplies: (postId: string) => SocialPost[];
  getAncestors: (postId: string) => SocialPost[];
  getRelatedPosts: (postId: string) => SocialPost[];
  getProfilePosts: (profileKeyValue: string, tab: "posts" | "replies" | "media" | "likes", actorKey: string) => SocialPost[];
  getInteractionState: (postId: string, actorKey: string) => PostInteractionState;
  getFollowers: (profileKeyValue: string) => SocialProfile[];
  getFollowing: (profileKeyValue: string) => SocialProfile[];
  getNotifications: (recipientKey: string) => SocialNotification[];
  getUnreadNotificationCount: (recipientKey: string) => number;
  search: (query: string) => SocialSearchResult;
  getTagFeed: (tag: string) => SocialPost[];
  getTrendingTags: () => Array<{ tag: string; count: number }>;
  saveDraft: (draftKey: string, draft: SocialComposerDraft) => void;
  clearDraft: (draftKey: string) => void;
  createPost: (input: SocialCreatePostInput) => SocialPost | Promise<SocialPost>;
  updatePost: (input: SocialUpdatePostInput) => SocialPost | undefined | Promise<SocialPost | undefined>;
  deletePost: (postId: string, actorKey: string) => void;
  toggleLike: (postId: string, actorKey: string) => void;
  toggleBookmark: (postId: string, actorKey: string) => void;
  toggleRepost: (postId: string, actorKey: string) => SocialPost | undefined;
  markShared: (postId: string, actorKey: string) => void;
  toggleFollow: (actorKey: string, targetKey: string) => void;
  ensureMutualFollow: (leftKey: string, rightKey: string) => void;
  togglePinPost: (postId: string, actorKey: string) => void;
  updateProfileOverride: (profileKeyValue: string, overrides: SocialProfileOverrides) => void;
  incrementView: (postId: string) => void;
  markNotificationsRead: (recipientKey: string) => void;
  refreshFeeds: () => void;
  ensureAccountProfile: (userId: number) => Promise<SocialProfile | undefined>;
};

const SocialContext = createContext<SocialContextValue | null>(null);
const emptyFormalSocialState: SocialState = {
  drafts: {},
  follows: {},
  interactions: {},
  notifications: [],
  posts: [],
  profileOverrides: {},
  refreshedAt: ""
};

function formalSocialMutationUnavailable(..._args: unknown[]): never {
  throw new Error("error.feature_unavailable");
}

function formalEntityType(identityType: string | undefined): SocialProfile["entityType"] {
  if (identityType === "technician") return "technician";
  if (["merchant", "merchant_owner", "merchant_staff"].includes(identityType ?? "")) return "shop";
  return "user";
}

function mapFormalNotification(
  notification: RealtimeNotification,
  profiles: Record<string, SocialProfile>
): SocialNotification {
  const actor = Object.values(profiles).find(
    (profile) => Number(profile.id) === notification.actorUserId
  );
  const payload = notification.payload && typeof notification.payload === "object"
    ? notification.payload as Record<string, unknown>
    : {};
  return {
    id: String(notification.id),
    type: "mention",
    actorKey: actor ? profileKey(actor) : `user:${notification.actorUserId ?? notification.recipientUserId}`,
    recipientKey: `user:${notification.recipientUserId}`,
    postId: typeof payload.postId === "number" ? String(payload.postId) : undefined,
    createdAt: notification.createdAt,
    read: Boolean(notification.readAt),
    content: notification.body || notification.title
  };
}

function FormalSocialProvider({ children }: { children: ReactNode }) {
  const { isRestoring, session } = useAuth();
  const [state, setState] = useState<SocialState>(emptyFormalSocialState);
  const [profiles, setProfiles] = useState<Record<string, SocialProfile>>({});
  const accountProfileRequestsRef = useRef(new Map<number, Promise<SocialProfile | undefined>>());
  const sessionUserId = session?.id ?? null;
  const sessionIdentityType = session?.currentIdentity?.type;
  const sessionUsername = session?.username ?? "";
  const sessionAvatarUrl = session?.avatarUrl ?? null;
  const sessionLoggedInAt = session?.loggedInAt ?? "";

  const ensureAccountProfile = useCallback((userId: number) => {
    const pendingRequest = accountProfileRequestsRef.current.get(userId);
    if (pendingRequest) {
      return pendingRequest;
    }

    if (sessionUserId === null || isRestoring || !Number.isSafeInteger(userId) || userId <= 0) {
      return Promise.resolve(undefined);
    }

    const request = (async () => {
      try {
        const [activityStatus, postPage] = await Promise.all([
          realtimeApi.getSocialActivityStatus(userId),
          realtimeApi.listSocialPosts({ page: 1, pageSize: 100, authorUserId: userId })
        ]);
        const profile = mapFormalSocialProfile(activityStatus.profile);
        const targetKey = profileKey(profile);
        const postProfiles = mapFormalSocialProfiles(postPage.list);
        const postProfile = postProfiles[targetKey];
        const mergedProfile = postProfile
          ? { ...profile, coverImage: profile.coverImage || postProfile.coverImage, location: postProfile.location }
          : profile;
        const mappedPosts = postPage.list.map(mapFormalSocialPost);
        const actorKey = `${formalEntityType(sessionIdentityType)}:${sessionUserId}`;

        setProfiles((current) => ({ ...current, ...postProfiles, [targetKey]: mergedProfile }));
        setState((current) => {
          const mappedPostIds = new Set(mappedPosts.map((post) => post.id));
          const nextFollows = { ...current.follows };

          postPage.list.forEach((post, index) => {
            const authorKey = postAuthorKey(mappedPosts[index]);
            if (post.viewerFollowsAuthor) {
              nextFollows[actorKey] = unique([...(nextFollows[actorKey] ?? []), authorKey]);
            }
            if (post.authorFollowsViewer) {
              nextFollows[authorKey] = unique([...(nextFollows[authorKey] ?? []), actorKey]);
            }
          });

          return {
            ...current,
            follows: nextFollows,
            posts: sortPostsByNewest([
              ...mappedPosts,
              ...current.posts.filter((post) => !mappedPostIds.has(post.id))
            ])
          };
        });

        return mergedProfile;
      } finally {
        accountProfileRequestsRef.current.delete(userId);
      }
    })();

    accountProfileRequestsRef.current.set(userId, request);
    return request;
  }, [isRestoring, sessionIdentityType, sessionUserId]);

  const loadFormalSocial = useCallback(async () => {
    if (sessionUserId === null || isRestoring) return;
    const [timelinePage, minePage, notificationPage] = await Promise.all([
      realtimeApi.listSocialPosts({ page: 1, pageSize: 100 }),
      realtimeApi.listSocialPosts({ page: 1, pageSize: 100, authorUserId: sessionUserId }),
      realtimeApi.listNotifications({ page: 1, pageSize: 100 })
    ]);
    const rawPosts = [...timelinePage.list, ...minePage.list].filter(
      (post, index, posts) => posts.findIndex((candidate) => candidate.id === post.id) === index
    );
    const nextPosts = sortPostsByNewest(rawPosts.map(mapFormalSocialPost));
    const nextProfiles = mapFormalSocialProfiles(rawPosts);
    const ownProfile = Object.values(nextProfiles).find((profile) => Number(profile.id) === sessionUserId);
    const fallbackEntityType = formalEntityType(sessionIdentityType);
    const fallbackProfile: SocialProfile = {
      id: String(sessionUserId),
      entityType: fallbackEntityType,
      displayName: sessionUsername,
      handle: sessionUsername,
      avatar: sessionAvatarUrl ?? "",
      coverImage: sessionAvatarUrl ?? "",
      bio: "NeeDo 正式账号",
      joinedAt: sessionLoggedInAt,
      verifiedStatus: fallbackEntityType === "shop" ? "business" : fallbackEntityType === "technician" ? "verified" : "none",
      followerCount: 0,
      followingCount: 0,
      extraProfileFields: {}
    };
    const actor = ownProfile ?? fallbackProfile;
    nextProfiles[profileKey(actor)] = actor;
    const actorKey = profileKey(actor);
    const follows: SocialState["follows"] = {};
    rawPosts.forEach((post) => {
      const mapped = mapFormalSocialPost(post);
      const authorKey = postAuthorKey(mapped);
      if (post.viewerFollowsAuthor) follows[actorKey] = unique([...(follows[actorKey] ?? []), authorKey]);
      if (post.authorFollowsViewer) follows[authorKey] = unique([...(follows[authorKey] ?? []), actorKey]);
    });
    const notifications = notificationPage.list.map((notification) =>
      mapFormalNotification(notification, nextProfiles)
    );
    setProfiles(nextProfiles);
    setState((current) => ({
      ...current,
      posts: nextPosts,
      follows,
      notifications,
      refreshedAt: new Date().toISOString()
    }));
  }, [
    isRestoring,
    sessionAvatarUrl,
    sessionIdentityType,
    sessionLoggedInAt,
    sessionUserId,
    sessionUsername
  ]);

  useEffect(() => { void loadFormalSocial(); }, [loadFormalSocial]);
  useEffect(() => {
    if (sessionUserId === null || isRestoring) return undefined;

    return subscribeRealtimeEvents({
      onEvent: (event) => {
        if (event.type === "social.post.created" || event.type === "notification.created" || event.type === "follow.created") {
          void loadFormalSocial();
        }
      }
    });
  }, [isRestoring, loadFormalSocial, sessionUserId]);

  const value = useMemo<SocialContextValue>(() => {
    const profileList = Object.values(profiles);
    const ownProfile = session
      ? profileList.find((profile) => Number(profile.id) === session.id)
      : undefined;
    const actorKey = ownProfile ? profileKey(ownProfile) : profileList[0] ? profileKey(profileList[0]) : "user:0";
    const actorByScope: Record<SocialPortalScope, string> = {
      user: actorKey,
      merchant: actorKey,
      technician: actorKey
    };
    const getPostById = (postId: string) => state.posts.find((post) => post.id === postId && isVisiblePost(post));
    const getFollowing = (key: string) => (state.follows[key] ?? []).map((item) => profiles[item]).filter(Boolean);
    const getFollowers = (key: string) => profileList.filter((profile) => (state.follows[profileKey(profile)] ?? []).includes(key));
    const getNotifications = (key: string) => state.notifications.filter((item) => item.recipientKey === key || key === actorKey);
    const getTrendingTags = () => {
      const counts = new Map<string, number>();
      state.posts.forEach((post) => post.hashtags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
      return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((left, right) => right.count - left.count);
    };
    const getTimelineFeed = (filter: SocialTimelineFilterTab, key: string, locationContext?: SocialTimelineLocationContext) =>
      filterTimelinePosts({ posts: state.posts, profiles, follows: state.follows, actorKey: key, filter, locationContext });
    const createPost = async (input: SocialCreatePostInput) => {
      if (!session || input.authorKey !== actorKey) throw new Error("error.auth.forbidden");
      if (input.visibility && !["public", "followers"].includes(input.visibility)) {
        throw new Error("error.social.visibility_unavailable");
      }
      const created = await realtimeApi.createSocialPost({
        content: input.text.trim(),
        media: buildFormalSocialMediaEnvelope({
          media: input.media ?? [],
          quotePostId: input.quotePostId,
          replyToPostId: input.replyToPostId,
          postType: input.postType,
          locationLabel: input.locationLabel
        }),
        visibility: input.visibility === "followers" ? "followers" : "public"
      });
      const mapped = mapFormalSocialPost(created);
      setProfiles((current) => ({ ...current, ...mapFormalSocialProfiles([created]) }));
      setState((current) => ({ ...current, posts: sortPostsByNewest([mapped, ...current.posts.filter((post) => post.id !== mapped.id)]) }));
      return mapped;
    };
    const search = (query: string): SocialSearchResult => {
      const normalized = query.trim().toLowerCase();
      return {
        profiles: profileList.filter((profile) => `${profile.displayName} ${profile.bio}`.toLowerCase().includes(normalized)),
        posts: state.posts.filter((post) => `${post.text} ${post.hashtags.join(" ")}`.toLowerCase().includes(normalized)),
        tags: getTrendingTags().filter((tag) => tag.tag.toLowerCase().includes(normalized))
      };
    };
    return {
      state,
      profiles,
      profileList,
      composerProfileKeys: ownProfile ? [actorKey] : [],
      actorByScope,
      getActorForScope: (scope) => actorByScope[scope],
      getPostById,
      getTimeline: (tab, key) => tab === "following"
        ? state.posts.filter((post) => (state.follows[key] ?? []).includes(postAuthorKey(post)) || postAuthorKey(post) === key)
        : state.posts,
      getTimelineFeed,
      getReplies: (postId) => sortPostsByOldest(state.posts.filter((post) => post.replyToPostId === postId)),
      getAncestors: () => [],
      getRelatedPosts: (postId) => state.posts.filter((post) => post.quotePostId === postId || post.repostPostId === postId),
      getProfilePosts: (key, tab) => state.posts.filter((post) => postAuthorKey(post) === key && (tab !== "media" || post.media.length > 0)),
      getInteractionState: (postId, key) => {
        const post = getPostById(postId);
        return {
          postId,
          liked: false,
          reposted: false,
          bookmarked: false,
          shared: false,
          followingAuthor: post
            ? (state.follows[key] ?? []).includes(postAuthorKey(post))
            : false
        };
      },
      getFollowers,
      getFollowing,
      getNotifications,
      getUnreadNotificationCount: (key) => getNotifications(key).filter((item) => !item.read).length,
      search,
      getTagFeed: (tag) => state.posts.filter((post) => post.hashtags.some((item) => item.toLowerCase() === tag.toLowerCase())),
      getTrendingTags,
      saveDraft: (draftKey, draft) => setState((current) => ({ ...current, drafts: { ...current.drafts, [draftKey]: draft } })),
      clearDraft: (draftKey) => setState((current) => {
        const drafts = { ...current.drafts };
        delete drafts[draftKey];
        return { ...current, drafts };
      }),
      createPost,
      updatePost: formalSocialMutationUnavailable,
      deletePost: formalSocialMutationUnavailable,
      toggleLike: formalSocialMutationUnavailable,
      toggleBookmark: formalSocialMutationUnavailable,
      toggleRepost: formalSocialMutationUnavailable,
      markShared: () => undefined,
      toggleFollow: (_sourceKey, targetKey) => {
        const target = profiles[targetKey];
        if (!target) return;
        const currentlyFollowing = (state.follows[actorKey] ?? []).includes(targetKey);
        void (currentlyFollowing ? realtimeApi.unfollow(Number(target.id)) : realtimeApi.follow(Number(target.id))).then(() => loadFormalSocial());
      },
      ensureMutualFollow: formalSocialMutationUnavailable,
      togglePinPost: formalSocialMutationUnavailable,
      updateProfileOverride: formalSocialMutationUnavailable,
      incrementView: () => undefined,
      markNotificationsRead: () => { void realtimeApi.markAllNotificationsRead().then(() => loadFormalSocial()); },
      refreshFeeds: () => { void loadFormalSocial(); },
      ensureAccountProfile
    };
  }, [ensureAccountProfile, loadFormalSocial, profiles, session, state]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function SocialProvider({ children }: { children: ReactNode }) {
  return <FormalSocialProvider>{children}</FormalSocialProvider>;
}

export function useSocial() {
  const context = useContext(SocialContext);

  if (!context) {
    throw new Error("useSocial must be used within SocialProvider");
  }

  return context;
}
