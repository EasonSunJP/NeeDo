import { buildApiUrl, getAccessToken, httpClient } from "../../api/httpClient";
import type { ImMessageRichText } from "../im/reaction-policy";

export type PaginatedRealtimeData<TItem> = {
  list: TItem[];
  page: number;
  page_size: number;
  total: number;
};

export type RealtimeParticipant = {
  avatarUrl: string | null;
  needoId: string;
  userId: number;
  username: string;
  role?: "owner" | "admin" | "member";
};

export type RealtimeMessage = {
  availableRecallModes?: Array<"standard">;
  content: string | null;
  contentPurgedAt?: string | null;
  conversationId: number;
  createdAt: string;
  expiresAt?: string | null;
  id: number;
  lifecycleVersion?: number;
  reactionVersion?: number;
  metadata: unknown;
  privacyPolicyVersionAtSend?: number | null;
  reactions?: RealtimeMessageReaction[];
  recallDeadlineAt?: string | null;
  recalledAt?: string | null;
  recallMode?: "standard" | "traceless" | null;
  senderUserId: number | null;
  type: "text" | "system" | "orderStatus";
};

export type RealtimeRecallResult = {
  action: "standard_recall";
  conversationId: number;
  message: RealtimeMessage;
  messageId: number;
};

export type RealtimeMessageDeletionResult = {
  conversationId: number;
  messageId: number;
  deleted: true;
};

export type RealtimeMessageReaction = {
  emoji: string;
  people: Array<{
    avatarUrl: string | null;
    userId: number;
    username: string;
  }>;
  reactedByMe: boolean;
};

export type RealtimeConversation = {
  createdAt: string;
  directPeer?: RealtimeParticipant | null;
  id: number;
  lastMessage: RealtimeMessage | null;
  participants: RealtimeParticipant[];
  title: string | null;
  type: "direct" | "group";
  unreadCount: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isHidden?: boolean;
  privacyModeEnabled?: boolean;
  hideMemberProfiles?: boolean;
  disappearingTtlSeconds?: number | null;
  disappearingStartMode?: "sent" | "read_by_all";
  privacyPolicyVersion?: number;
  updatedAt: string;
};

export type RealtimeConversationPrivacyInput = {
  privacyModeEnabled: boolean;
  hideMemberProfiles?: boolean;
  disappearingTtlSeconds?: number | null;
  disappearingStartMode?: "sent" | "read_by_all";
};

export type RealtimeLeaveConversationResult = {
  conversationId: number;
  removedUserId: number;
  newOwnerUserId: number | null;
  dissolved: boolean;
};

export type RealtimeMessageHistory = PaginatedRealtimeData<RealtimeMessage> & {
  nextCursor: number | null;
};

export type RealtimeContact = {
  contactUser: RealtimeParticipant;
  contactUserId: number;
  createdAt: string;
  id: number;
  nickname: string | null;
  ownerUserId: number;
  source: string;
  isBlocked: boolean;
};

export type RealtimeDeletedFriendship = {
  actorUserId: number;
  counterpartUserId: number;
  contactIds: number[];
  deletedContactCount: number;
  deletedFollowCount: number;
  deletedConversationId: number | null;
  deleted: true;
  deletedAt: string;
};

export type RealtimeFriendRequest = {
  createdAt: string;
  id: number;
  message: string | null;
  requesterUserId: number;
  requester: RealtimeParticipant;
  respondedAt: string | null;
  status: "pending" | "accepted" | "rejected" | "expired";
  targetUserId: number;
  target: RealtimeParticipant;
  expiresAt: string;
  expiredAt: string | null;
};

export type RealtimeDirectoryProfile = {
  user: RealtimeParticipant;
  identityCard: RealtimeDirectoryIdentityCard;
  relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending" | "self";
  contactId: number | null;
  friendRequest: RealtimeFriendRequest | null;
};

export type RealtimeDirectoryIdentityCard = {
  entityType: "user" | "technician" | "shop" | "account";
  profileId: number | null;
  displayName: string;
  identityLabel: string | null;
  verified: boolean;
  creditValue: string | null;
  creditReviewCount: number;
  gender: string | null;
  age: number | null;
  heightCm: string | null;
  languages: string[];
  city: string | null;
  serviceArea: string | null;
  yearsExperience: number | null;
  bio: string | null;
};

export type RealtimeCreateFriendRequestResult = {
  friendRequest: RealtimeFriendRequest;
  created: boolean;
};

export type RealtimeSocialPost = {
  author?: {
    avatarUrl: string | null;
    displayName: string;
    entityType: "user" | "technician" | "shop";
    joinedAt: string;
    userId: number;
    username: string;
  };
  authorFollowsViewer?: boolean;
  authorUserId: number;
  content: string;
  createdAt: string;
  id: number;
  media: unknown;
  replyCount: number;
  replyToPostId: number | null;
  updatedAt?: string;
  viewerFollowsAuthor?: boolean;
  viewerIsFriend?: boolean;
  visibility: "public" | "followers";
};

export type RealtimeSocialProfileSummary = NonNullable<RealtimeSocialPost["author"]>;

export type RealtimeSocialActivityStatus = {
  latestVisiblePostAt: string | null;
  profile: RealtimeSocialProfileSummary;
  status: "recent_posts" | "no_recent_posts";
};

export type RealtimeNotification = {
  actorUserId: number | null;
  body: string;
  createdAt: string;
  id: number;
  payload: unknown;
  readAt: string | null;
  recipientUserId: number;
  title: string;
  type: "orderStatus" | "friendRequest" | "system" | "social";
};

export type RealtimeUnreadCounts = {
  conversations: number;
  friendRequests: number;
  notifications: number;
  total: number;
};

type PageQuery = { page?: number; pageSize?: number };

export type RealtimeUploadedImage = {
  fileName: string;
  fileSize: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  url: string;
};

export type RealtimeSocialMediaUpload = {
  publicId: string;
  fileSize: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  url: string;
};

export type RealtimeSocialCreateMediaEnvelope = {
  items: Array<{
    id: string;
    type: "image";
    mediaAssetPublicId: string;
    alt?: string;
  }>;
  quotePostId?: number;
  replyToPostId?: number;
  repostPostId?: number;
  postType?: "post" | "reply" | "quote" | "repost" | "announcement" | "technician-daily";
  locationLabel?: string;
  richText?: ImMessageRichText;
};

export type RealtimeSocialCreatePostInput = {
  content: string;
  media?: RealtimeSocialCreateMediaEnvelope;
  mentionUserIds?: number[];
  visibility?: RealtimeSocialPost["visibility"];
};

export type RealtimeSocialUpdatePostInput = RealtimeSocialCreatePostInput;

export const realtimeApi = {
  listConversations(query: PageQuery = {}) {
    return httpClient.request<PaginatedRealtimeData<RealtimeConversation>>("/im/conversations", { query });
  },
  createConversation(input: {
    participantUserIds: number[];
    title?: string;
    type?: "direct" | "group";
    privacyModeEnabled?: boolean;
    hideMemberProfiles?: boolean;
    disappearingTtlSeconds?: number | null;
    disappearingStartMode?: "sent" | "read_by_all";
  }) {
    return httpClient.request<RealtimeConversation>("/im/conversations", { body: input, method: "POST" });
  },
  listMessages(conversationId: number, query: { beforeId?: number; pageSize?: number } = {}) {
    return httpClient.request<RealtimeMessageHistory>(`/im/conversations/${conversationId}/messages`, { query });
  },
  createMessage(conversationId: number, input: { content: string; metadata?: Record<string, unknown>; type?: RealtimeMessage["type"] }) {
    return httpClient.request<RealtimeMessage>(`/im/conversations/${conversationId}/messages`, { body: input, method: "POST" });
  },
  recallMessage(conversationId: number, messageId: number, mode: "standard") {
    return httpClient.request<RealtimeRecallResult>(
      `/im/conversations/${conversationId}/messages/${messageId}/recall`,
      { body: { mode }, method: "POST" }
    );
  },
  setMessageReaction(conversationId: number, messageId: number, emoji: string) {
    return httpClient.request<RealtimeMessage>(
      `/im/conversations/${conversationId}/messages/${messageId}/reactions`,
      { body: { emoji }, method: "PUT" }
    );
  },
  removeMessageReaction(conversationId: number, messageId: number, emoji: string) {
    return httpClient.request<RealtimeMessage>(
      `/im/conversations/${conversationId}/messages/${messageId}/reactions`,
      { body: { emoji }, method: "DELETE" }
    );
  },
  markConversationRead(conversationId: number) {
    return httpClient.request<{ conversationId: number; unreadCount: number }>(`/im/conversations/${conversationId}/read`, { method: "POST" });
  },
  markConversationUnread(conversationId: number) {
    return httpClient.request<RealtimeConversation>(`/im/conversations/${conversationId}/unread`, { method: "POST" });
  },
  updateConversationPreferences(
    conversationId: number,
    preferences: { isMuted?: boolean; isPinned?: boolean }
  ) {
    return httpClient.request<RealtimeConversation>(`/im/conversations/${conversationId}/preferences`, {
      body: preferences,
      method: "PATCH"
    });
  },
  updateConversationPrivacy(
    conversationId: number,
    privacy: RealtimeConversationPrivacyInput
  ) {
    return httpClient.request<RealtimeConversation>(`/im/conversations/${conversationId}/privacy`, {
      body: privacy,
      method: "PATCH"
    });
  },
  leaveConversation(conversationId: number, transferOwnerUserId?: number) {
    return httpClient.request<RealtimeLeaveConversationResult>(
      `/im/conversations/${conversationId}/leave`,
      {
        body: transferOwnerUserId ? { transferOwnerUserId } : {},
        method: "POST"
      }
    );
  },
  dissolveConversation(conversationId: number) {
    return httpClient.request<RealtimeLeaveConversationResult>(
      `/im/conversations/${conversationId}/dissolve`,
      { method: "POST" }
    );
  },
  deleteConversation(conversationId: number) {
    return httpClient.request<RealtimeConversation>(`/im/conversations/${conversationId}`, { method: "DELETE" });
  },
  clearConversationMessages(conversationId: number) {
    return httpClient.request<RealtimeConversation>(
      `/im/conversations/${conversationId}/messages`,
      { method: "DELETE" }
    );
  },
  deleteMessageForMe(conversationId: number, messageId: number) {
    return httpClient.request<RealtimeMessageDeletionResult>(
      `/im/conversations/${conversationId}/messages/${messageId}`,
      { method: "DELETE" }
    );
  },
  listContacts(query: PageQuery = {}) {
    return httpClient.request<PaginatedRealtimeData<RealtimeContact>>("/im/contacts", { query });
  },
  searchDirectory(query: PageQuery & { query: string }) {
    return httpClient.request<PaginatedRealtimeData<RealtimeParticipant>>("/im/directory", { query });
  },
  getDirectoryProfile(userId: number) {
    return httpClient.request<RealtimeDirectoryProfile>(`/im/directory/${userId}`);
  },
  uploadConversationImage(conversationId: number, file: File) {
    return httpClient.request<RealtimeUploadedImage>(`/im/conversations/${conversationId}/media`, {
      body: file,
      headers: { "Content-Type": file.type },
      method: "POST",
      query: { fileName: file.name }
    });
  },
  uploadSocialMedia(file: File) {
    return httpClient.request<RealtimeSocialMediaUpload>("/social/media", {
      body: file,
      headers: { "Content-Type": file.type },
      method: "POST",
      query: { fileName: file.name }
    });
  },
  blockContact(contactId: number) {
    return httpClient.request<RealtimeContact>(`/im/contacts/${contactId}/block`, { method: "POST" });
  },
  unblockContact(contactId: number) {
    return httpClient.request<RealtimeContact>(`/im/contacts/${contactId}/block`, { method: "DELETE" });
  },
  deleteContact(contactId: number) {
    return httpClient.request<RealtimeDeletedFriendship>(`/im/contacts/${contactId}`, { method: "DELETE" });
  },
  listFriendRequests(query: PageQuery & { direction?: "incoming" | "outgoing" | "all"; status?: RealtimeFriendRequest["status"] } = {}) {
    return httpClient.request<PaginatedRealtimeData<RealtimeFriendRequest>>("/im/friend-requests", { query });
  },
  createFriendRequest(input: { message?: string; targetUserId: number }) {
    return httpClient.request<RealtimeCreateFriendRequestResult>("/im/friend-requests", { body: input, method: "POST" });
  },
  acceptFriendRequest(id: number) {
    return httpClient.request<RealtimeFriendRequest>(`/im/friend-requests/${id}/accept`, { method: "POST" });
  },
  rejectFriendRequest(id: number) {
    return httpClient.request<RealtimeFriendRequest>(`/im/friend-requests/${id}/reject`, { method: "POST" });
  },
  listSocialPosts(
    query: PageQuery & { authorUserId?: number; replyToPostId?: number } = {},
    options: { signal?: AbortSignal } = {}
  ) {
    return httpClient.request<PaginatedRealtimeData<RealtimeSocialPost>>("/social/posts", {
      query,
      signal: options.signal
    });
  },
  getSocialActivityStatus(userId: number) {
    return httpClient.request<RealtimeSocialActivityStatus>(`/social/users/${userId}/activity-status`);
  },
  getSocialPost(id: number, options: { signal?: AbortSignal } = {}) {
    return httpClient.request<RealtimeSocialPost>(`/social/posts/${id}`, { signal: options.signal });
  },
  createSocialPost(input: RealtimeSocialCreatePostInput) {
    return httpClient.request<RealtimeSocialPost>("/social/posts", { body: input, method: "POST" });
  },
  updateSocialPost(id: number, input: RealtimeSocialUpdatePostInput) {
    return httpClient.request<RealtimeSocialPost>(`/social/posts/${id}`, { body: input, method: "PATCH" });
  },
  follow(targetUserId: number) {
    return httpClient.request<{ id: number }>("/social/follows", { body: { targetUserId }, method: "POST" });
  },
  unfollow(targetUserId: number) {
    return httpClient.request<{ deleted: boolean }>(`/social/follows/${targetUserId}`, { method: "DELETE" });
  },
  listNotifications(query: PageQuery & { unreadOnly?: boolean } = {}) {
    return httpClient.request<PaginatedRealtimeData<RealtimeNotification>>("/notifications", { query });
  },
  markNotificationRead(id: number) {
    return httpClient.request<RealtimeNotification>(`/notifications/${id}/read`, { method: "POST" });
  },
  markAllNotificationsRead() {
    return httpClient.request<{ count: number }>("/notifications/read-all", { method: "POST" });
  },
  unreadCounts() {
    return httpClient.request<RealtimeUnreadCounts>("/realtime/unread-counts");
  }
};

export type FormalRealtimeEvent = {
  createdAt?: string;
  id: string;
  payload: unknown;
  recipientUserId?: number;
  type: string;
};

type SubscribeRealtimeOptions = {
  lastEventId?: string;
  onError?: (error: unknown) => void;
  onEvent: (event: FormalRealtimeEvent) => void;
  reconnectDelayMs?: number;
};

function parseSseBlock(block: string) {
  let eventName = "message";
  let eventId = "";
  let retryMs: number | undefined;
  const dataLines: string[] = [];

  block.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith(":")) return;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    else if (field === "id") eventId = value;
    else if (field === "retry" && /^\d+$/.test(value)) retryMs = Number(value);
    else if (field === "data") dataLines.push(value);
  });

  if (dataLines.length === 0) return { event: null, retryMs };
  const parsed = JSON.parse(dataLines.join("\n")) as Partial<FormalRealtimeEvent>;
  const event: FormalRealtimeEvent = {
    ...parsed,
    id: eventId || (typeof parsed.id === "string" ? parsed.id : ""),
    payload: parsed.payload,
    type: eventName || (typeof parsed.type === "string" ? parsed.type : "message")
  };
  return { event, retryMs };
}

function waitForReconnect(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timeoutId = globalThis.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      globalThis.clearTimeout(timeoutId);
      resolve();
    }, { once: true });
  });
}

function openRealtimeEventStream(options: SubscribeRealtimeOptions) {
  const controller = new AbortController();
  let stopped = false;
  let lastEventId = options.lastEventId ?? "";
  let reconnectDelayMs = options.reconnectDelayMs ?? 5_000;

  void (async () => {
    while (!stopped) {
      try {
        await realtimeApi.unreadCounts();
        if (stopped) break;
        const token = getAccessToken();
        if (!token) throw new Error("error.auth.unauthorized");
        const headers: Record<string, string> = {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`
        };
        if (lastEventId) headers["Last-Event-ID"] = lastEventId;
        const response = await fetch(buildApiUrl("/realtime/events"), { headers, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(`error.realtime.stream_${response.status || "unavailable"}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!stopped) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";
          blocks.forEach((block) => {
            const parsed = parseSseBlock(block);
            if (parsed.retryMs) reconnectDelayMs = parsed.retryMs;
            if (parsed.event) {
              if (parsed.event.id) lastEventId = parsed.event.id;
              options.onEvent(parsed.event);
            }
          });
          if (done) break;
        }
      } catch (error) {
        if (!stopped && !(error instanceof DOMException && error.name === "AbortError")) options.onError?.(error);
      }
      if (!stopped) await waitForReconnect(reconnectDelayMs, controller.signal);
    }
  })();

  return () => {
    stopped = true;
    controller.abort();
  };
}

const realtimeSubscribers = new Set<SubscribeRealtimeOptions>();
let stopSharedRealtimeStream: (() => void) | null = null;
let sharedRealtimeAccessToken: string | null = null;
let sharedRealtimeLastEventId = "";
let realtimeVisibilityDocument: Document | null = null;

function stopSharedRealtimeConnection() {
  stopSharedRealtimeStream?.();
  stopSharedRealtimeStream = null;
  sharedRealtimeAccessToken = null;
}

function isRealtimeTabVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function startSharedRealtimeConnection() {
  if (stopSharedRealtimeStream || realtimeSubscribers.size === 0 || !isRealtimeTabVisible()) return;

  const firstSubscriber = realtimeSubscribers.values().next().value as SubscribeRealtimeOptions | undefined;
  if (!firstSubscriber) return;

  sharedRealtimeAccessToken = getAccessToken();
  stopSharedRealtimeStream = openRealtimeEventStream({
    lastEventId: sharedRealtimeLastEventId || firstSubscriber.lastEventId,
    reconnectDelayMs: firstSubscriber.reconnectDelayMs,
    onError(error) {
      [...realtimeSubscribers].forEach((subscriber) => subscriber.onError?.(error));
    },
    onEvent(event) {
      if (event.id) sharedRealtimeLastEventId = event.id;
      [...realtimeSubscribers].forEach((subscriber) => subscriber.onEvent(event));
    }
  });
}

function handleRealtimeVisibilityChange() {
  if (!isRealtimeTabVisible()) {
    stopSharedRealtimeConnection();
    return;
  }

  startSharedRealtimeConnection();
}

function attachRealtimeVisibilityListener() {
  if (typeof document === "undefined" || realtimeVisibilityDocument === document) return;
  realtimeVisibilityDocument?.removeEventListener("visibilitychange", handleRealtimeVisibilityChange);
  realtimeVisibilityDocument = document;
  realtimeVisibilityDocument.addEventListener("visibilitychange", handleRealtimeVisibilityChange);
}

export function subscribeRealtimeEvents(options: SubscribeRealtimeOptions) {
  realtimeSubscribers.add(options);
  const currentAccessToken = getAccessToken();
  if (!sharedRealtimeLastEventId && options.lastEventId) sharedRealtimeLastEventId = options.lastEventId;
  attachRealtimeVisibilityListener();

  if (stopSharedRealtimeStream && sharedRealtimeAccessToken !== currentAccessToken) {
    stopSharedRealtimeConnection();
  }

  startSharedRealtimeConnection();

  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    realtimeSubscribers.delete(options);

    if (realtimeSubscribers.size === 0) {
      stopSharedRealtimeConnection();
      sharedRealtimeLastEventId = "";
      realtimeVisibilityDocument?.removeEventListener("visibilitychange", handleRealtimeVisibilityChange);
      realtimeVisibilityDocument = null;
    }
  };
}
