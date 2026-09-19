import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import {
  realtimeApi,
  subscribeRealtimeEvents,
  type PaginatedRealtimeData,
  type RealtimeNotification,
  type RealtimeSocialPost
} from "../realtime/api";
import { normalizeImMessageRichText } from "../im/reaction-policy";
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
  buildFormalSocialCreateMediaEnvelope,
  mapFormalSocialPost,
  mapFormalSocialProfile,
  mapFormalSocialProfiles
} from "./formal-adapter";
import { cleanupLegacySocialReplyDrafts } from "./legacy-reply-draft-cleanup";
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
  feedStatus: "loading" | "ready" | "error";
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
  toggleLike: (postId: string, actorKey: string) => Promise<void>;
  toggleBookmark: (postId: string, actorKey: string) => Promise<void>;
  toggleRepost: (postId: string, actorKey: string) => SocialPost | undefined;
  markShared: (postId: string, actorKey: string) => void;
  toggleFollow: (actorKey: string, targetKey: string) => void;
  togglePinPost: (postId: string, actorKey: string) => void;
  updateProfileOverride: (profileKeyValue: string, overrides: SocialProfileOverrides) => void;
  incrementView: (postId: string) => Promise<void>;
  shareSocialPostToFriends: (postId: string, actorKey: string, targetUserIds: number[]) => Promise<number[]>;
  markNotificationsRead: (recipientKey: string) => void;
  refreshFeeds: () => void;
  ensureAccountProfile: (userId: number, identityId?: number) => Promise<SocialProfile | undefined>;
  ensurePostThread: (postId: string) => Promise<boolean>;
  releasePostThread: (postId: string) => void;
};

const SocialContext = createContext<SocialContextValue | null>(null);
const emptyFormalSocialState: SocialState = {
  drafts: {},
  follows: {},
  friends: {},
  interactions: {},
  notifications: [],
  posts: [],
  profileOverrides: {},
  refreshedAt: ""
};

export { cleanupLegacySocialReplyDrafts } from "./legacy-reply-draft-cleanup";

export function getMountedReplyParentReplyCountBaseline(
  posts: SocialPost[],
  replyToPostId: string | undefined
): number | undefined {
  return replyToPostId === undefined
    ? undefined
    : posts.find((post) => post.id === replyToPostId)?.replyCount;
}

export function mergeCreatedFormalSocialPost(
  posts: SocialPost[],
  mapped: SocialPost,
  parentReplyCountBaseline: number | undefined
): SocialPost[] {
  return sortPostsByNewest([
    mapped,
    ...posts
      .filter((post) => post.id !== mapped.id)
      .map((post) => post.id === mapped.replyToPostId && post.replyCount === parentReplyCountBaseline
        ? { ...post, replyCount: parentReplyCountBaseline + 1 }
        : post)
  ]);
}

export function mergeFormalSocialBootstrapPosts(
  currentPosts: SocialPost[],
  nextPosts: SocialPost[],
  activePostThreadIds: ReadonlySet<string>
): SocialPost[] {
  const nextPostIds = new Set(nextPosts.map((post) => post.id));

  return sortPostsByNewest([
    ...nextPosts,
    ...currentPosts.filter((post) =>
      (activePostThreadIds.has(post.id) ||
        (post.replyToPostId !== undefined && activePostThreadIds.has(post.replyToPostId))) &&
      !nextPostIds.has(post.id)
    )
  ]);
}

export function getActiveFormalSocialThreadIdsForEvent(
  activePostThreadIds: ReadonlySet<string>,
  payload: unknown
): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as { id?: unknown; replyToPostId?: unknown };
  const postId = typeof candidate.id === "number" && Number.isSafeInteger(candidate.id)
    ? String(candidate.id)
    : undefined;
  const replyToPostId = typeof candidate.replyToPostId === "number" && Number.isSafeInteger(candidate.replyToPostId)
    ? String(candidate.replyToPostId)
    : undefined;

  return [...activePostThreadIds].filter((activePostId) =>
    activePostId === postId || activePostId === replyToPostId
  );
}

export function mergeHydratedFormalSocialPostThread(
  currentPosts: SocialPost[],
  hydratedPosts: SocialPost[],
  postId: string
): SocialPost[] {
  const hydratedPostIds = new Set(hydratedPosts.map((post) => post.id));

  return sortPostsByNewest([
    ...hydratedPosts,
    ...currentPosts.filter((post) =>
      post.id !== postId &&
      post.replyToPostId !== postId &&
      !hydratedPostIds.has(post.id)
    )
  ]);
}

export function removeFormalSocialPostThread(
  posts: SocialPost[],
  postId: string
): SocialPost[] {
  return posts.filter((post) => post.id !== postId && post.replyToPostId !== postId);
}

export async function createFormalSocialPost(
  request: () => Promise<RealtimeSocialPost>,
  onSuccess: (created: RealtimeSocialPost, mapped: SocialPost) => void
): Promise<SocialPost> {
  const created = await request();
  const mapped = mapFormalSocialPost(created);
  onSuccess(created, mapped);
  return mapped;
}

type FormalSocialPostThreadApi = {
  getSocialPost: (id: number, options?: { signal?: AbortSignal }) => Promise<RealtimeSocialPost>;
  listSocialPosts: (query: {
    page: number;
    pageSize: number;
    replyToPostId: number;
  }, options?: { signal?: AbortSignal }) => Promise<PaginatedRealtimeData<RealtimeSocialPost>>;
};

export function buildFormalSocialSessionKey(
  userId: number | null,
  identityId: number | null
): string {
  return `${userId ?? "guest"}:${identityId ?? "none"}`;
}

export function shouldCommitFormalSocialRequest(
  requestedSessionKey: string,
  currentSessionKey: string,
  retained = true
): boolean {
  return retained && requestedSessionKey === currentSessionKey;
}

export async function fetchFormalSocialPostThread(
  postId: number,
  api: FormalSocialPostThreadApi = realtimeApi,
  signal?: AbortSignal
): Promise<{ parent: RealtimeSocialPost; replies: RealtimeSocialPost[] }> {
  const pageSize = 100;
  const [parent, firstPage] = await Promise.all([
    api.getSocialPost(postId, { signal }),
    api.listSocialPosts({ page: 1, pageSize, replyToPostId: postId }, { signal })
  ]);
  const repliesById = new Map(firstPage.list.map((reply) => [reply.id, reply]));
  const lastPage = Math.ceil(firstPage.total / pageSize);

  for (let page = 2; page <= lastPage; page += 1) {
    const previousSize = repliesById.size;
    const nextPage = await api.listSocialPosts(
      { page, pageSize, replyToPostId: postId },
      { signal }
    );
    nextPage.list.forEach((reply) => repliesById.set(reply.id, reply));
    if (nextPage.list.length === 0 || repliesById.size === previousSize) {
      throw new Error("error.social.thread_incomplete");
    }
  }

  if (repliesById.size < firstPage.total) {
    throw new Error("error.social.thread_incomplete");
  }

  return { parent, replies: [...repliesById.values()] };
}

export function resolveFormalSocialUpdateRichText(content: string, richText: unknown) {
  return normalizeImMessageRichText(content.trim(), richText);
}

function formalSocialMutationUnavailable(..._args: unknown[]): never {
  throw new Error("error.feature_unavailable");
}

type FormalSocialLoadRequestState = {
  current: { key: string; request: Promise<void> } | null;
};

export function runFormalSocialLoadSingleFlight(
  state: FormalSocialLoadRequestState,
  key: string,
  load: () => Promise<void>,
  onError: (error: unknown) => void
): Promise<void> {
  const pending = state.current;
  if (pending?.key === key) return pending.request;

  let request!: Promise<void>;
  request = load()
    .catch((error) => {
      onError(error);
    })
    .finally(() => {
      if (state.current?.request === request) state.current = null;
    });
  state.current = { key, request };
  return request;
}

function handleFormalSocialLoadError(error: unknown) {
  console.warn("NeeDo social background refresh failed", { error });
}

function formalEntityType(identityType: string | undefined): SocialProfile["entityType"] {
  if (identityType === "technician") return "technician";
  if (["merchant", "merchant_owner", "merchant_staff"].includes(identityType ?? "")) return "shop";
  return "user";
}

const formalNotificationTranslations: Record<string, Record<Language, string>> = {
  "exchange.cancellation.request.title": {
    zh: "收到取消申请",
    "zh-Hant": "收到取消申請",
    ja: "キャンセル申請を受け取りました",
    en: "Cancellation request received",
    ko: "취소 요청을 받았습니다"
  },
  "exchange.cancellation.request.body": {
    zh: "对方已提交 Exchange 订单取消申请，请及时处理。",
    "zh-Hant": "對方已提交 Exchange 訂單取消申請，請及時處理。",
    ja: "相手が Exchange 注文のキャンセルを申請しました。ご確認ください。",
    en: "The other party requested cancellation of the Exchange order. Please review it.",
    ko: "상대방이 Exchange 주문 취소를 요청했습니다. 확인해 주세요."
  },
  "exchange.cancellation.accept.title": {
    zh: "取消申请已同意",
    "zh-Hant": "取消申請已同意",
    ja: "キャンセル申請が承認されました",
    en: "Cancellation request accepted",
    ko: "취소 요청이 승인되었습니다"
  },
  "exchange.cancellation.accept.body": {
    zh: "对方已同意取消 Exchange 订单。",
    "zh-Hant": "對方已同意取消 Exchange 訂單。",
    ja: "相手が Exchange 注文のキャンセルに同意しました。",
    en: "The other party accepted the Exchange order cancellation.",
    ko: "상대방이 Exchange 주문 취소에 동의했습니다."
  },
  "exchange.cancellation.reject.title": {
    zh: "取消申请已拒绝",
    "zh-Hant": "取消申請已拒絕",
    ja: "キャンセル申請が拒否されました",
    en: "Cancellation request rejected",
    ko: "취소 요청이 거절되었습니다"
  },
  "exchange.cancellation.reject.body": {
    zh: "对方已拒绝取消 Exchange 订单，订单继续有效。",
    "zh-Hant": "對方已拒絕取消 Exchange 訂單，訂單繼續有效。",
    ja: "相手が Exchange 注文のキャンセルを拒否しました。注文は引き続き有効です。",
    en: "The other party rejected the Exchange order cancellation. The order remains active.",
    ko: "상대방이 Exchange 주문 취소를 거절했습니다. 주문은 계속 유효합니다."
  },
  "exchange.cancellation.withdraw.title": {
    zh: "取消申请已撤回",
    "zh-Hant": "取消申請已撤回",
    ja: "キャンセル申請が取り下げられました",
    en: "Cancellation request withdrawn",
    ko: "취소 요청이 철회되었습니다"
  },
  "exchange.cancellation.withdraw.body": {
    zh: "对方已撤回 Exchange 订单取消申请，订单继续有效。",
    "zh-Hant": "對方已撤回 Exchange 訂單取消申請，訂單繼續有效。",
    ja: "相手が Exchange 注文のキャンセル申請を取り下げました。注文は引き続き有効です。",
    en: "The other party withdrew the Exchange order cancellation request. The order remains active.",
    ko: "상대방이 Exchange 주문 취소 요청을 철회했습니다. 주문은 계속 유효합니다."
  }
};

export function resolveFormalNotificationText(value: string, language: Language): string {
  return formalNotificationTranslations[value]?.[language] ?? value;
}

const orderStatusLabels: Record<string, Record<Language, string>> = {
  pending: { zh: "待确认", "zh-Hant": "待確認", ja: "確認待ち", en: "Pending", ko: "확인 대기" },
  confirmed: { zh: "已确认", "zh-Hant": "已確認", ja: "確認済み", en: "Confirmed", ko: "확인됨" },
  inService: { zh: "服务中", "zh-Hant": "服務中", ja: "サービス中", en: "In service", ko: "서비스 중" },
  awaitingCheckout: { zh: "待结账", "zh-Hant": "待結帳", ja: "お会計待ち", en: "Awaiting checkout", ko: "결제 대기" },
  awaitingPaymentConfirmation: { zh: "等待确认收款", "zh-Hant": "等待確認收款", ja: "入金確認待ち", en: "Awaiting payment confirmation", ko: "결제 확인 대기" },
  completed: { zh: "已完成", "zh-Hant": "已完成", ja: "完了", en: "Completed", ko: "완료" },
  cancelled: { zh: "已取消", "zh-Hant": "已取消", ja: "キャンセル済み", en: "Cancelled", ko: "취소됨" }
};

const notificationCopy: Record<string, Record<Language, string>> = {
  friendRequest: {
    zh: "你收到了新的好友申请。",
    "zh-Hant": "你收到了新的好友申請。",
    ja: "新しい友だち申請が届きました。",
    en: "You have a new friend request.",
    ko: "새 친구 요청이 도착했습니다."
  },
  socialMention: {
    zh: "有人提醒你查看一条动态。",
    "zh-Hant": "有人提醒你查看一則動態。",
    ja: "新しい投稿を見るようメンションされました。",
    en: "Someone mentioned you in a post.",
    ko: "새 게시물에서 회원님을 언급했습니다."
  },
  orderGeneric: {
    zh: "预约状态已更新。",
    "zh-Hant": "預約狀態已更新。",
    ja: "予約状況が更新されました。",
    en: "Your booking status was updated.",
    ko: "예약 상태가 업데이트되었습니다."
  },
  systemGeneric: {
    zh: "你有一条新的系统通知。",
    "zh-Hant": "你有一則新的系統通知。",
    ja: "新しいシステム通知があります。",
    en: "You have a new system notification.",
    ko: "새 시스템 알림이 있습니다."
  }
};

function notificationPayload(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function payloadString(payload: Record<string, unknown>, key: string, maxLength = 120): string | null {
  const value = payload[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizedOrderStatus(value: string | null): string | null {
  if (!value) return null;
  if (value === "in_service") return "inService";
  if (value === "awaiting_checkout") return "awaitingCheckout";
  if (value === "awaiting_payment_confirmation") return "awaitingPaymentConfirmation";
  return orderStatusLabels[value] ? value : null;
}

function localizedOrderStatusChange(
  payload: Record<string, unknown>,
  language: Language
): string | null {
  const fromStatus = normalizedOrderStatus(payloadString(payload, "fromStatus"));
  const toStatus = normalizedOrderStatus(payloadString(payload, "toStatus"));
  if (!fromStatus || !toStatus) return null;

  const from = orderStatusLabels[fromStatus][language];
  const to = orderStatusLabels[toStatus][language];
  const serviceName = payloadString(payload, "serviceName");
  if (language === "ja") return serviceName
    ? `${serviceName}の状態が「${from}」から「${to}」に更新されました。`
    : `予約状況が「${from}」から「${to}」に更新されました。`;
  if (language === "en") return serviceName
    ? `${serviceName} status changed from ${from} to ${to}.`
    : `Booking status changed from ${from} to ${to}.`;
  if (language === "ko") return serviceName
    ? `${serviceName} 상태가 ‘${from}’에서 ‘${to}’로 변경되었습니다.`
    : `예약 상태가 ‘${from}’에서 ‘${to}’로 변경되었습니다.`;
  if (language === "zh-Hant") return serviceName
    ? `${serviceName}的狀態已從「${from}」更新為「${to}」。`
    : `預約狀態已從「${from}」更新為「${to}」。`;
  return serviceName
    ? `${serviceName}的状态已从“${from}”更新为“${to}”。`
    : `预约状态已从“${from}”更新为“${to}”。`;
}

export function resolveFormalNotificationContent(
  notification: RealtimeNotification,
  language: Language
): string {
  const payload = notificationPayload(notification.payload);
  const eventCode = payloadString(payload, "eventCode");
  const kind = payloadString(payload, "kind");

  if (kind === "official_notice") {
    return notification.body.trim() || notification.title.trim() || notificationCopy.systemGeneric[language];
  }

  const translatedBody = formalNotificationTranslations[notification.body]?.[language];
  if (translatedBody) return translatedBody;

  if (eventCode === "booking.order_status_changed" || notification.type === "orderStatus") {
    return localizedOrderStatusChange(payload, language) ?? notificationCopy.orderGeneric[language];
  }

  if (eventCode === "im.friend_request.created" || notification.type === "friendRequest") {
    return notificationCopy.friendRequest[language];
  }

  if (eventCode === "social.post_mention" || kind === "post_mention") {
    return notificationCopy.socialMention[language];
  }

  return notificationCopy.systemGeneric[language];
}

export function mapFormalNotification(
  notification: RealtimeNotification,
  profiles: Record<string, SocialProfile>,
  language: Language
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
    content: resolveFormalNotificationContent(notification, language)
  };
}

function mapFormalInteraction(post: RealtimeSocialPost) {
  return {
    postId: String(post.id),
    liked: Boolean(post.viewerInteraction?.liked),
    reposted: Boolean(post.viewerInteraction?.shared),
    bookmarked: Boolean(post.viewerInteraction?.bookmarked),
    shared: Boolean(post.viewerInteraction?.shared)
  };
}

function FormalSocialProvider({ children }: { children: ReactNode }) {
  const { isRestoring, session } = useAuth();
  const { language } = useOptionalI18n();
  const [storedState, setState] = useState<SocialState>(emptyFormalSocialState);
  const [storedProfiles, setProfiles] = useState<Record<string, SocialProfile>>({});
  const [feedStatus, setFeedStatus] = useState<"loading" | "ready" | "error">("loading");
  const accountProfileRequestsRef = useRef(new Map<string, Promise<SocialProfile | undefined>>());
  const activePostThreadIdsRef = useRef(new Set<string>());
  const activePostThreadProfilesRef = useRef(new Map<string, Record<string, SocialProfile>>());
  const postThreadRequestsRef = useRef(new Map<string, Promise<boolean>>());
  const postThreadAbortControllersRef = useRef(new Map<string, AbortController>());
  const formalSocialLoadRequestRef = useRef<{ key: string; request: Promise<void> } | null>(null);
  const sessionUserId = session?.id ?? null;
  const sessionIdentityId = session?.currentIdentity?.id ?? null;
  const sessionIdentityType = session?.currentIdentity?.type;
  const sessionUsername = session?.username ?? "";
  const sessionAvatarUrl = session?.avatarUrl ?? null;
  const sessionLoggedInAt = session?.loggedInAt ?? "";
  const formalSessionKey = buildFormalSocialSessionKey(sessionUserId, sessionIdentityId);
  const currentFormalSessionKeyRef = useRef(formalSessionKey);
  currentFormalSessionKeyRef.current = formalSessionKey;
  const [stateScopeKey, setStateScopeKey] = useState(formalSessionKey);

  const ensureAccountProfile = useCallback((userId: number, identityId?: number) => {
    const requestKey = `${formalSessionKey}:${userId}:${identityId ?? "canonical"}`;
    const pendingRequest = accountProfileRequestsRef.current.get(requestKey);
    if (pendingRequest) {
      return pendingRequest;
    }

    if (sessionUserId === null || isRestoring || !Number.isSafeInteger(userId) || userId <= 0) {
      return Promise.resolve(undefined);
    }

    let request!: Promise<SocialProfile | undefined>;
    request = (async () => {
      try {
        const [activityStatus, postPage] = await Promise.all([
          realtimeApi.getSocialActivityStatus(userId, identityId),
          realtimeApi.listSocialPosts({
            page: 1,
            pageSize: 100,
            authorUserId: userId,
            ...(identityId ? { authorIdentityId: identityId } : {})
          })
        ]);
        if (!shouldCommitFormalSocialRequest(
          formalSessionKey,
          currentFormalSessionKeyRef.current
        )) {
          return undefined;
        }
        const profile = mapFormalSocialProfile(activityStatus.profile);
        const targetKey = profileKey(profile);
        const postProfiles = mapFormalSocialProfiles(postPage.list);
        const postProfile = postProfiles[targetKey];
        const mergedProfile = postProfile
          ? {
              ...profile,
              coverImage: profile.coverImage || postProfile.coverImage,
              location: postProfile.location,
              pinnedPostId: postProfile.pinnedPostId
            }
          : profile;
        const mappedPosts = postPage.list.map(mapFormalSocialPost);
        const actorKey = `${formalEntityType(sessionIdentityType)}:${sessionUserId}`;

        setStateScopeKey(formalSessionKey);
        setProfiles((current) => ({ ...current, ...postProfiles, [targetKey]: mergedProfile }));
        setState((current) => {
          const mappedPostIds = new Set(mappedPosts.map((post) => post.id));
          const nextFollows = { ...current.follows };
          const nextFriends = { ...current.friends };

          postPage.list.forEach((post, index) => {
            const authorKey = postAuthorKey(mappedPosts[index]);
            if (post.viewerFollowsAuthor) {
              nextFollows[actorKey] = unique([...(nextFollows[actorKey] ?? []), authorKey]);
            }
            if (post.authorFollowsViewer) {
              nextFollows[authorKey] = unique([...(nextFollows[authorKey] ?? []), actorKey]);
            }
            if (post.viewerIsFriend) {
              nextFriends[actorKey] = unique([...(nextFriends[actorKey] ?? []), authorKey]);
              nextFriends[authorKey] = unique([...(nextFriends[authorKey] ?? []), actorKey]);
            }
          });

          return {
            ...current,
            follows: nextFollows,
            friends: nextFriends,
            interactions: {
              ...current.interactions,
              [actorKey]: {
                ...(current.interactions[actorKey] ?? {}),
                ...Object.fromEntries(
                  postPage.list.map((post) => [String(post.id), mapFormalInteraction(post)])
                )
              }
            },
            posts: sortPostsByNewest([
              ...mappedPosts,
              ...current.posts.filter((post) => !mappedPostIds.has(post.id))
            ])
          };
        });

        return mergedProfile;
      } finally {
        if (accountProfileRequestsRef.current.get(requestKey) === request) {
          accountProfileRequestsRef.current.delete(requestKey);
        }
      }
    })();

    accountProfileRequestsRef.current.set(requestKey, request);
    return request;
  }, [formalSessionKey, isRestoring, sessionIdentityType, sessionUserId]);

  const ensurePostThread = useCallback((postId: string) => {
    const numericPostId = Number(postId);
    if (
      sessionUserId === null ||
      isRestoring ||
      !Number.isSafeInteger(numericPostId) ||
      numericPostId <= 0
    ) {
      return Promise.resolve(false);
    }

    activePostThreadIdsRef.current.add(postId);
    const requestKey = `${formalSessionKey}:${postId}`;
    const pendingRequest = postThreadRequestsRef.current.get(requestKey);
    if (pendingRequest) {
      return pendingRequest;
    }

    const controller = new AbortController();
    postThreadAbortControllersRef.current.set(requestKey, controller);
    let request!: Promise<boolean>;
    request = (async () => {
      try {
        const { parent, replies } = await fetchFormalSocialPostThread(
          numericPostId,
          realtimeApi,
          controller.signal
        );
        if (!shouldCommitFormalSocialRequest(
          formalSessionKey,
          currentFormalSessionKeyRef.current,
          activePostThreadIdsRef.current.has(postId)
        )) {
          return false;
        }

        const rawPosts = [parent, ...replies];
        const mappedPosts = rawPosts.map(mapFormalSocialPost);
        const threadProfiles = mapFormalSocialProfiles(rawPosts);
        const actorKey = `${formalEntityType(sessionIdentityType)}:${sessionUserId}`;

        if (activePostThreadIdsRef.current.has(postId)) {
          activePostThreadProfilesRef.current.set(postId, threadProfiles);
        }
        setProfiles((current) => ({ ...current, ...threadProfiles }));
        setStateScopeKey(formalSessionKey);
        setState((current) => {
          const nextFollows = { ...current.follows };
          const nextFriends = { ...current.friends };

          rawPosts.forEach((rawPost, index) => {
            const authorKey = postAuthorKey(mappedPosts[index]);
            nextFollows[actorKey] = rawPost.viewerFollowsAuthor
              ? unique([...(nextFollows[actorKey] ?? []), authorKey])
              : (nextFollows[actorKey] ?? []).filter((key) => key !== authorKey);
            nextFollows[authorKey] = rawPost.authorFollowsViewer
              ? unique([...(nextFollows[authorKey] ?? []), actorKey])
              : (nextFollows[authorKey] ?? []).filter((key) => key !== actorKey);
            if (rawPost.viewerIsFriend) {
              nextFriends[actorKey] = unique([...(nextFriends[actorKey] ?? []), authorKey]);
              nextFriends[authorKey] = unique([...(nextFriends[authorKey] ?? []), actorKey]);
            } else {
              nextFriends[actorKey] = (nextFriends[actorKey] ?? []).filter((key) => key !== authorKey);
              nextFriends[authorKey] = (nextFriends[authorKey] ?? []).filter((key) => key !== actorKey);
            }
          });

          return {
            ...current,
            follows: nextFollows,
            friends: nextFriends,
            interactions: {
              ...current.interactions,
              [actorKey]: {
                ...(current.interactions[actorKey] ?? {}),
                ...Object.fromEntries(
                  rawPosts.map((post) => [String(post.id), mapFormalInteraction(post)])
                )
              }
            },
            posts: mergeHydratedFormalSocialPostThread(current.posts, mappedPosts, postId)
          };
        });

        return true;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return false;
        }
        if (error instanceof ApiClientError && error.status === 404) {
          if (shouldCommitFormalSocialRequest(
            formalSessionKey,
            currentFormalSessionKeyRef.current,
            activePostThreadIdsRef.current.has(postId)
          )) {
            activePostThreadProfilesRef.current.delete(postId);
            setStateScopeKey(formalSessionKey);
            setState((current) => ({
              ...current,
              posts: removeFormalSocialPostThread(current.posts, postId)
            }));
          }
          return false;
        }
        throw error;
      } finally {
        if (postThreadRequestsRef.current.get(requestKey) === request) {
          postThreadRequestsRef.current.delete(requestKey);
        }
        if (postThreadAbortControllersRef.current.get(requestKey) === controller) {
          postThreadAbortControllersRef.current.delete(requestKey);
        }
      }
    })();

    postThreadRequestsRef.current.set(requestKey, request);
    return request;
  }, [formalSessionKey, isRestoring, sessionIdentityType, sessionUserId]);

  const releasePostThread = useCallback((postId: string) => {
    activePostThreadIdsRef.current.delete(postId);
    activePostThreadProfilesRef.current.delete(postId);
    const requestKey = `${formalSessionKey}:${postId}`;
    postThreadAbortControllersRef.current.get(requestKey)?.abort();
    postThreadAbortControllersRef.current.delete(requestKey);
    postThreadRequestsRef.current.delete(requestKey);
  }, [formalSessionKey]);

  const performFormalSocialLoad = useCallback(async () => {
    if (sessionUserId === null || isRestoring) return;
    const [timelinePage, minePage, firstBookmarkedPage, notificationPage] = await Promise.all([
      realtimeApi.listSocialPosts({ page: 1, pageSize: 100 }),
      realtimeApi.listSocialPosts({ page: 1, pageSize: 100, authorUserId: sessionUserId }),
      realtimeApi.listSocialPosts({ page: 1, pageSize: 100, bookmarked: true }),
      realtimeApi.listNotifications({ page: 1, pageSize: 100 })
    ]);
    const bookmarkedPageCount = Math.ceil(firstBookmarkedPage.total / firstBookmarkedPage.page_size);
    const remainingBookmarkedPages = bookmarkedPageCount > 1
      ? await Promise.all(
          Array.from({ length: bookmarkedPageCount - 1 }, (_, index) =>
            realtimeApi.listSocialPosts({ page: index + 2, pageSize: 100, bookmarked: true })
          )
        )
      : [];
    const bookmarkedPosts = [
      ...firstBookmarkedPage.list,
      ...remainingBookmarkedPages.flatMap((page) => page.list)
    ];
    if (!shouldCommitFormalSocialRequest(
      formalSessionKey,
      currentFormalSessionKeyRef.current
    )) {
      return;
    }
    const rawPosts = [...timelinePage.list, ...minePage.list, ...bookmarkedPosts].filter(
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
    const actorProfileKey = profileKey(actor);
    nextProfiles[actorProfileKey] = {
      ...actor,
      pinnedPostId: nextProfiles[actorProfileKey]?.pinnedPostId
    };
    const actorKey = profileKey(actor);
    const follows: SocialState["follows"] = {};
    const friends: SocialState["friends"] = {};
    rawPosts.forEach((post) => {
      const mapped = mapFormalSocialPost(post);
      const authorKey = postAuthorKey(mapped);
      if (post.viewerFollowsAuthor) follows[actorKey] = unique([...(follows[actorKey] ?? []), authorKey]);
      if (post.authorFollowsViewer) follows[authorKey] = unique([...(follows[authorKey] ?? []), actorKey]);
      if (post.viewerIsFriend) {
        friends[actorKey] = unique([...(friends[actorKey] ?? []), authorKey]);
        friends[authorKey] = unique([...(friends[authorKey] ?? []), actorKey]);
      }
    });
    const notifications = notificationPage.list.map((notification) =>
      mapFormalNotification(notification, nextProfiles, language)
    );
    const activeThreadProfiles = [...activePostThreadIdsRef.current].reduce<Record<string, SocialProfile>>(
      (merged, postId) => ({ ...merged, ...activePostThreadProfilesRef.current.get(postId) }),
      {}
    );
    setProfiles({ ...nextProfiles, ...activeThreadProfiles });
    setStateScopeKey(formalSessionKey);
    setState((current) => {
      const mergedFollows = { ...follows };
      const mergedFriends = { ...friends };
      const activeThreadPosts = current.posts.filter((post) =>
        activePostThreadIdsRef.current.has(post.id) ||
        (post.replyToPostId !== undefined && activePostThreadIdsRef.current.has(post.replyToPostId))
      );

      activeThreadPosts.forEach((activePost) => {
        const authorKey = postAuthorKey(activePost);
        if ((current.follows[actorKey] ?? []).includes(authorKey)) {
          mergedFollows[actorKey] = unique([...(mergedFollows[actorKey] ?? []), authorKey]);
        }
        if ((current.follows[authorKey] ?? []).includes(actorKey)) {
          mergedFollows[authorKey] = unique([...(mergedFollows[authorKey] ?? []), actorKey]);
        }
        if ((current.friends[actorKey] ?? []).includes(authorKey)) {
          mergedFriends[actorKey] = unique([...(mergedFriends[actorKey] ?? []), authorKey]);
          mergedFriends[authorKey] = unique([...(mergedFriends[authorKey] ?? []), actorKey]);
        }
      });

      return {
        ...current,
        posts: mergeFormalSocialBootstrapPosts(
          current.posts,
          nextPosts,
          activePostThreadIdsRef.current
        ),
        follows: mergedFollows,
        friends: mergedFriends,
        interactions: {
          ...current.interactions,
          [actorKey]: Object.fromEntries(
            rawPosts.map((post) => [String(post.id), mapFormalInteraction(post)])
          )
        },
        notifications,
        refreshedAt: new Date().toISOString()
      };
    });
  }, [
    isRestoring,
    language,
    formalSessionKey,
    sessionAvatarUrl,
    sessionIdentityType,
    sessionLoggedInAt,
    sessionUserId,
    sessionUsername
  ]);

  const loadFormalSocial = useCallback(
    () => {
      setFeedStatus("loading");
      return runFormalSocialLoadSingleFlight(
        formalSocialLoadRequestRef,
        formalSessionKey,
        async () => {
          await performFormalSocialLoad();
          setFeedStatus("ready");
        },
        (error) => {
          setFeedStatus("error");
          handleFormalSocialLoadError(error);
        }
      );
    },
    [formalSessionKey, performFormalSocialLoad]
  );
  const refreshFeeds = useCallback(() => {
    void loadFormalSocial();
  }, [loadFormalSocial]);

  useEffect(() => () => {
    postThreadAbortControllersRef.current.forEach((controller) => controller.abort());
    postThreadAbortControllersRef.current.clear();
    postThreadRequestsRef.current.clear();
    accountProfileRequestsRef.current.clear();
    activePostThreadIdsRef.current.clear();
    activePostThreadProfilesRef.current.clear();
  }, []);
  useEffect(() => { cleanupLegacySocialReplyDrafts(); }, []);
  useEffect(() => { void loadFormalSocial(); }, [loadFormalSocial]);
  useEffect(() => {
    if (sessionUserId === null || isRestoring) return undefined;

    return subscribeRealtimeEvents({
      onEvent: (event) => {
        if (
          event.type === "social.post.created" ||
          event.type === "social.post.updated" ||
          event.type === "social.post.interaction.updated"
        ) {
          const affectedThreadIds = getActiveFormalSocialThreadIdsForEvent(
            activePostThreadIdsRef.current,
            event.payload
          );
          void loadFormalSocial();
          affectedThreadIds.forEach((activePostId) => {
            void (async () => {
              const pendingRequest = postThreadRequestsRef.current.get(
                `${formalSessionKey}:${activePostId}`
              );
              if (pendingRequest) {
                await pendingRequest.catch(() => undefined);
              }
              if (activePostThreadIdsRef.current.has(activePostId)) {
                await ensurePostThread(activePostId).catch(() => false);
              }
            })();
          });
        } else if (event.type === "notification.created" || event.type === "follow.created") {
          void loadFormalSocial();
        }
      }
    });
  }, [ensurePostThread, formalSessionKey, isRestoring, loadFormalSocial, sessionUserId]);

  const saveDraft = useCallback((draftKey: string, draft: SocialComposerDraft) => {
    setState((current) => ({
      ...current,
      drafts: { ...current.drafts, [draftKey]: draft }
    }));
  }, []);

  const clearDraft = useCallback((draftKey: string) => {
    setState((current) => {
      if (!(draftKey in current.drafts)) {
        return current;
      }

      const drafts = { ...current.drafts };
      delete drafts[draftKey];
      return { ...current, drafts };
    });
  }, []);

  const value = useMemo<SocialContextValue>(() => {
    const isCurrentScope = stateScopeKey === formalSessionKey;
    const state = isCurrentScope ? storedState : emptyFormalSocialState;
    const profiles = isCurrentScope ? storedProfiles : {};
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
      filterTimelinePosts({ posts: state.posts, profiles, follows: state.follows, friends: state.friends, actorKey: key, filter, locationContext });
    const createPost = async (input: SocialCreatePostInput) => {
      if (!session || input.authorKey !== actorKey) throw new Error("error.auth.forbidden");
      if (!shouldCommitFormalSocialRequest(
        formalSessionKey,
        currentFormalSessionKeyRef.current
      )) {
        throw new Error("error.auth.operation_superseded");
      }
      if (input.visibility && !["public", "followers"].includes(input.visibility)) {
        throw new Error("error.social.visibility_unavailable");
      }
      const parentReplyCountBaseline = getMountedReplyParentReplyCountBaseline(
        state.posts,
        input.replyToPostId
      );
      return createFormalSocialPost(
        () => realtimeApi.createSocialPost({
          content: input.text.trim(),
          media: buildFormalSocialCreateMediaEnvelope({
            media: input.media ?? [],
            quotePostId: input.quotePostId,
            replyToPostId: input.replyToPostId,
            postType: input.postType,
            locationLabel: input.locationLabel,
            richText: input.richText
          }),
          mentionUserIds: input.mentionUserIds ?? [],
          visibility: input.visibility === "followers" ? "followers" : "public"
        }),
        (created, mapped) => {
          if (!shouldCommitFormalSocialRequest(
            formalSessionKey,
            currentFormalSessionKeyRef.current
          )) {
            return;
          }
          setProfiles((current) => ({ ...current, ...mapFormalSocialProfiles([created]) }));
          setStateScopeKey(formalSessionKey);
          setState((current) => ({
            ...current,
            posts: mergeCreatedFormalSocialPost(
              current.posts,
              mapped,
              parentReplyCountBaseline
            )
          }));
        }
      );
    };
    const updatePost = async (input: SocialUpdatePostInput) => {
      if (!session || input.actorKey !== actorKey) throw new Error("error.auth.forbidden");
      const currentPost = getPostById(input.postId);
      if (!currentPost || postAuthorKey(currentPost) !== actorKey) {
        throw new Error("error.realtime.social_post_not_found");
      }
      if (!["public", "followers"].includes(input.visibility)) {
        throw new Error("error.social.visibility_unavailable");
      }
      const updated = await realtimeApi.updateSocialPost(Number(input.postId), {
        content: input.text.trim(),
        media: buildFormalSocialCreateMediaEnvelope({
          media: input.media,
          quotePostId: currentPost.quotePostId,
          replyToPostId: currentPost.replyToPostId,
          repostPostId: currentPost.repostPostId,
          postType: input.postType,
          locationLabel: input.locationLabel,
          richText: resolveFormalSocialUpdateRichText(input.text, currentPost.richText)
        }),
        mentionUserIds: input.mentionUserIds ?? [],
        visibility: input.visibility === "followers" ? "followers" : "public"
      });
      const mapped = mapFormalSocialPost(updated);
      if (!shouldCommitFormalSocialRequest(
        formalSessionKey,
        currentFormalSessionKeyRef.current
      )) {
        return mapped;
      }
      setProfiles((current) => ({ ...current, ...mapFormalSocialProfiles([updated]) }));
      setStateScopeKey(formalSessionKey);
      setState((current) => ({
        ...current,
        posts: sortPostsByNewest(current.posts.map((post) => post.id === mapped.id ? mapped : post))
      }));
      return mapped;
    };
    const commitInteractionPost = (updated: RealtimeSocialPost) => {
      const mapped = mapFormalSocialPost(updated);
      if (!shouldCommitFormalSocialRequest(
        formalSessionKey,
        currentFormalSessionKeyRef.current
      )) {
        return;
      }
      setProfiles((current) => ({ ...current, ...mapFormalSocialProfiles([updated]) }));
      setStateScopeKey(formalSessionKey);
      setState((current) => ({
        ...current,
        interactions: {
          ...current.interactions,
          [actorKey]: {
            ...(current.interactions[actorKey] ?? {}),
            [mapped.id]: mapFormalInteraction(updated)
          }
        },
        posts: sortPostsByNewest([
          mapped,
          ...current.posts.filter((post) => post.id !== mapped.id)
        ])
      }));
    };
    const toggleLike = async (postId: string, key: string) => {
      if (!session || key !== actorKey) throw new Error("error.auth.forbidden");
      const interaction = state.interactions[key]?.[postId];
      const updated = interaction?.liked
        ? await realtimeApi.unlikeSocialPost(Number(postId))
        : await realtimeApi.likeSocialPost(Number(postId));
      commitInteractionPost(updated);
    };
    const toggleBookmark = async (postId: string, key: string) => {
      if (!session || key !== actorKey) throw new Error("error.auth.forbidden");
      const interaction = state.interactions[key]?.[postId];
      const updated = interaction?.bookmarked
        ? await realtimeApi.unbookmarkSocialPost(Number(postId))
        : await realtimeApi.bookmarkSocialPost(Number(postId));
      commitInteractionPost(updated);
    };
    const togglePinPost = async (postId: string, key: string) => {
      if (!session || key !== actorKey) throw new Error("error.auth.forbidden");
      const currentPost = getPostById(postId);
      if (!currentPost || postAuthorKey(currentPost) !== actorKey || currentPost.replyToPostId) {
        throw new Error("error.realtime.social_post_not_found");
      }
      const updated = currentPost.isPinned
        ? await realtimeApi.unpinSocialPost(Number(postId))
        : await realtimeApi.pinSocialPost(Number(postId));
      const mapped = mapFormalSocialPost(updated);
      if (!shouldCommitFormalSocialRequest(
        formalSessionKey,
        currentFormalSessionKeyRef.current
      )) {
        return;
      }
      setProfiles((current) => ({
        ...current,
        [actorKey]: {
          ...current[actorKey],
          pinnedPostId: mapped.isPinned ? mapped.id : undefined
        }
      }));
      setStateScopeKey(formalSessionKey);
      setState((current) => ({
        ...current,
        posts: current.posts.map((post) =>
          postAuthorKey(post) === actorKey
            ? post.id === mapped.id
              ? mapped
              : { ...post, isPinned: false }
            : post
        )
      }));
    };
    const incrementView = async (postId: string) => {
      if (!session) return;
      const updated = await realtimeApi.recordSocialPostView(Number(postId));
      commitInteractionPost(updated);
    };
    const shareSocialPostToFriends = async (
      postId: string,
      key: string,
      targetUserIds: number[]
    ) => {
      if (!session || key !== actorKey) throw new Error("error.auth.forbidden");
      const result = await realtimeApi.shareSocialPostToFriends(
        Number(postId),
        targetUserIds,
        crypto.randomUUID()
      );
      commitInteractionPost(result.post);
      return result.deliveredUserIds;
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
      feedStatus,
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
        const interaction = state.interactions[key]?.[postId];
        return {
          postId,
          liked: Boolean(interaction?.liked),
          reposted: Boolean(interaction?.reposted),
          bookmarked: Boolean(interaction?.bookmarked),
          shared: Boolean(interaction?.shared),
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
      saveDraft,
      clearDraft,
      createPost,
      updatePost,
      deletePost: formalSocialMutationUnavailable,
      toggleLike,
      toggleBookmark,
      toggleRepost: formalSocialMutationUnavailable,
      markShared: () => undefined,
      toggleFollow: (_sourceKey, targetKey) => {
        const target = profiles[targetKey];
        if (!target) return;
        const currentlyFollowing = (state.follows[actorKey] ?? []).includes(targetKey);
        void (currentlyFollowing
          ? realtimeApi.unfollow(Number(target.id), target.identityId)
          : realtimeApi.follow(Number(target.id), target.identityId))
          .then(() => loadFormalSocial())
          .catch(handleFormalSocialLoadError);
      },
      togglePinPost,
      updateProfileOverride: formalSocialMutationUnavailable,
      incrementView,
      shareSocialPostToFriends,
      markNotificationsRead: () => {
        void realtimeApi.markAllNotificationsRead()
          .then(() => loadFormalSocial())
          .catch(handleFormalSocialLoadError);
      },
      refreshFeeds,
      ensureAccountProfile,
      ensurePostThread,
      releasePostThread
    };
  }, [
    clearDraft,
    ensureAccountProfile,
    ensurePostThread,
    formalSessionKey,
    feedStatus,
    loadFormalSocial,
    refreshFeeds,
    releasePostThread,
    saveDraft,
    session,
    stateScopeKey,
    storedProfiles,
    storedState
  ]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const formalSessionKey = buildFormalSocialSessionKey(
    session?.id ?? null,
    session?.currentIdentity?.id ?? null
  );

  return <FormalSocialProvider key={formalSessionKey}>{children}</FormalSocialProvider>;
}

export function useSocial() {
  const context = useContext(SocialContext);

  if (!context) {
    throw new Error("useSocial must be used within SocialProvider");
  }

  return context;
}
