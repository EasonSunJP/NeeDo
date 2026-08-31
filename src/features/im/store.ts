import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "../../auth/AuthProvider";
import type { Language } from "../../i18n/translations";
import { createFormalImApi, subscribeFormalImUpdates } from "./formal-api";
import {
  applyConversationDraft,
  buildSearchResults,
  buildConversationLastMessageSummary,
  canRecallMessage,
  getConversationById,
  getAnonymousGroupConversationTitle,
  getDisplayName,
  type ContactRelation,
  type Conversation,
  type ConversationMember,
  type ConversationMessage,
  type CreateConversationPrivacyOptions,
  type DirectoryProfile,
  type FriendRequest,
  type ImMessageType,
  type ImDatabase,
  type ImRealtimeEvent,
  type ImRoleType,
  type ImRuntimeConfig,
  type ImSearchResult,
  type ImStoreUpdate,
  type ImUser,
  type MessageExt,
  type TagMessageCampaignEstimate,
  type TagMessageCampaignInput,
  type TagMessageCampaignResult,
  type UpdateConversationGroupInfoOptions,
  type UpdateConversationPrivacyOptions,
  sortConversations
} from "./model";

type StoreStatus = "idle" | "loading" | "ready" | "error";
type DraftState = Record<string, { text: string; updatedAt: string }>;

export type PendingChatRecordForward = {
  sourceConversationId: string;
  messageIds: string[];
};

type UiState = {
  drafts: DraftState;
  searchHistory: string[];
};

type PaginationState = Record<
  string,
  {
    hasMore: boolean;
    nextCursor: string | null;
    loading: boolean;
    loaded: boolean;
  }
>;

const emptyConversationMessages: ConversationMessage[] = [];

function sortConversationMessages(messages: ConversationMessage[]) {
  return [...messages].sort(
    (left, right) =>
      new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime(),
  );
}

export function preferTerminalMessage(
  current: ConversationMessage | undefined,
  incoming: ConversationMessage,
) {
  if (
    current?.serverState === "recalled" &&
    incoming.serverState !== "recalled"
  ) {
    return current;
  }

  if (
    current &&
    current.serverState !== "recalled" &&
    incoming.serverState !== "recalled" &&
    (current.reactionVersion ?? 0) > (incoming.reactionVersion ?? 0)
  ) {
    return current;
  }

  return incoming;
}

export function upsertConversationMessage(
  messages: ConversationMessage[],
  incoming: ConversationMessage,
) {
  const index = messages.findIndex(
    (message) =>
      message.id === incoming.id || message.localId === incoming.localId,
  );

  if (index === -1) {
    return sortConversationMessages([...messages, incoming]);
  }

  const next = [...messages];
  next[index] = preferTerminalMessage(next[index], incoming);
  return sortConversationMessages(next);
}

export function mergeConversationMessageHistory(
  current: ConversationMessage[],
  incoming: ConversationMessage[],
  reset: boolean,
) {
  const merged = incoming.reduce(
    (messages, message) => upsertConversationMessage(messages, message),
    reset ? [] : current,
  );

  if (!reset) {
    return merged;
  }

  return current
    .filter((message) => message.serverState === "recalled")
    .reduce(
      (messages, message) => upsertConversationMessage(messages, message),
      merged,
    );
}

export function getMessageFailureReason(error: unknown): ConversationMessage["failureReason"] {
  if (error instanceof Error && error.message === "error.im.recipient_blocked") {
    return "recipient_blocked";
  }

  if (error instanceof Error && error.message === "error.im.not_friends") {
    return "not_friends";
  }

  return "send_failed";
}

export function getFriendRequestCounterpartId(
  request: FriendRequest,
  currentUserId: string,
) {
  if (request.fromUserId === currentUserId) {
    return request.toUserId;
  }

  if (request.toUserId === currentUserId) {
    return request.fromUserId;
  }

  return undefined;
}

export function selectLatestFriendRequestsByCounterpart(
  requests: FriendRequest[],
  currentUserId: string,
) {
  const latestByCounterpart = new Map<string, FriendRequest>();

  [...requests]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .forEach((request) => {
      const counterpartId = getFriendRequestCounterpartId(
        request,
        currentUserId,
      );
      if (counterpartId && !latestByCounterpart.has(counterpartId)) {
        latestByCounterpart.set(counterpartId, request);
      }
    });

  return Array.from(latestByCounterpart.values());
}

export function isIncomingPendingRequest(
  request: FriendRequest,
  currentUserId: string,
  nowMs: number,
) {
  return (
    request.toUserId === currentUserId &&
    request.status === "pending" &&
    new Date(request.expiresAt).getTime() > nowMs
  );
}

export function getIncomingPendingFriendRequestCount(
  requests: FriendRequest[],
  currentUserId: string,
  nowMs: number,
) {
  return selectLatestFriendRequestsByCounterpart(requests, currentUserId).filter(
    (request) => isIncomingPendingRequest(request, currentUserId, nowMs),
  ).length;
}

export function getForwardableMessagePayload(
  messagesByConversation: Record<string, ConversationMessage[]>,
  messageId: string,
): { type: ImMessageType; content: string; ext?: MessageExt } {
  const source = Object.values(messagesByConversation)
    .flat()
    .find((message) => message.id === messageId);

  if (
    !source ||
    source.type === "recalled" ||
    source.type === "system" ||
    source.serverState === "recalled"
  ) {
    throw new Error("error.im.forward_source_unavailable");
  }

  return {
    type: source.type,
    content: source.content,
    ext: source.ext
      ? {
          ...source.ext,
          mentions: undefined,
          mentionAll: undefined,
        }
      : undefined,
  };
}

type ImSnapshot = {
  status: StoreStatus;
  error?: string;
  currentUserId?: string;
  config?: ImRuntimeConfig;
  users: ImUser[];
  usersById: Record<string, ImUser>;
  contacts: ContactRelation[];
  organizationContacts?: ContactRelation[];
  friendRequests: FriendRequest[];
  conversations: Conversation[];
  members: ConversationMember[];
  messagesByConversation: Record<string, ConversationMessage[]>;
  paginationByConversation: PaginationState;
  pendingChatRecordForward: PendingChatRecordForward | null;
  activeConversationId?: string;
  ui: UiState;
};

type CachedImSearchSnapshot = Pick<
  ImSnapshot,
  "contacts" | "conversations" | "currentUserId" | "members" | "messagesByConversation" | "users"
>;

export function buildCachedImSearchResults(
  snapshot: CachedImSearchSnapshot,
  query: string,
  conversationId?: string,
) {
  const database: ImDatabase = {
    currentUserId: snapshot.currentUserId ?? "",
    config: {
      allowStrangerMessaging: true,
      preserveConversationAfterDelete: true,
      recallWindowMs: 180_000,
      separatorThresholdMs: 300_000,
      syncDraftAcrossDevices: false,
    },
    users: snapshot.users,
    contacts: snapshot.contacts,
    friendRequests: [],
    conversations: snapshot.conversations,
    members: snapshot.members,
    messages: Object.values(snapshot.messagesByConversation).flat(),
    attachments: [],
    readCursors: [],
    messageCampaigns: [],
    messageCampaignRecipients: [],
  };

  return buildSearchResults(database, query, conversationId);
}

function createInitialSnapshot(): ImSnapshot {
  return {
    status: "idle",
    users: [],
    usersById: {},
    contacts: [],
    friendRequests: [],
    conversations: [],
    members: [],
    messagesByConversation: {},
    paginationByConversation: {},
    pendingChatRecordForward: null,
    ui: {
      drafts: {},
      searchHistory: []
    }
  };
}

function toUserRecord(users: ImUser[]) {
  return Object.fromEntries(users.map((user) => [user.id, user])) as Record<string, ImUser>;
}

function getUiStorageKey(scope: ImRoleType) {
  return `needo.im.ui.v2.${scope}`;
}

type ScopedStoreBackend = {
  api: ReturnType<typeof createFormalImApi>;
  subscribeUpdates: (onUpdate: (update: ImStoreUpdate) => void) => () => void;
};

function createScopedStore(scope: ImRoleType, backend: ScopedStoreBackend) {
  const { api } = backend;
  const listeners = new Set<() => void>();
  let realtimeUnsubscribe: (() => void) | null = null;
  let hydrated = false;
  let hydrating: Promise<void> | null = null;
  let entityRefresh: Promise<void> | null = null;
  let snapshot = createInitialSnapshot();

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function readUiState(): UiState {
    if (typeof window === "undefined") {
      return {
        drafts: {},
        searchHistory: []
      };
    }

    try {
      const raw = window.localStorage.getItem(getUiStorageKey(scope));

      if (!raw) {
        return {
          drafts: {},
          searchHistory: []
        };
      }

      return JSON.parse(raw) as UiState;
    } catch {
      return {
        drafts: {},
        searchHistory: []
      };
    }
  }

  function persistUiState() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(getUiStorageKey(scope), JSON.stringify(snapshot.ui));
  }

  function applyDraftOverlay(conversation: Conversation, drafts: DraftState) {
    const draft = drafts[conversation.id];

    if (!draft) {
      return conversation;
    }

    return applyConversationDraft(conversation, draft.text, draft.updatedAt);
  }

  function applyDraftsToConversations(conversations: Conversation[], drafts: DraftState) {
    return conversations.map((conversation) => applyDraftOverlay(conversation, drafts));
  }

  function setSnapshot(next: ImSnapshot | ((current: ImSnapshot) => ImSnapshot)) {
    snapshot = typeof next === "function" ? next(snapshot) : next;
    persistUiState();
    emit();
  }

  function mergeUsers(nextUsers: ImUser[]) {
    const map = new Map(snapshot.users.map((user) => [user.id, user]));
    nextUsers.forEach((user) => map.set(user.id, user));

    const users = Array.from(map.values());
    snapshot = {
      ...snapshot,
      users,
      usersById: toUserRecord(users)
    };
  }

  function upsertConversation(conversation: Conversation) {
    const exists = snapshot.conversations.some((item) => item.id === conversation.id);
    const nextConversation = applyDraftOverlay(conversation, snapshot.ui.drafts);
    const conversations = exists
      ? snapshot.conversations.map((item) => (item.id === conversation.id ? nextConversation : item))
      : [nextConversation, ...snapshot.conversations];

    snapshot = {
      ...snapshot,
      conversations: sortConversations(conversations)
    };
  }

  function upsertMessage(message: ConversationMessage) {
    const current = snapshot.messagesByConversation[message.conversationId] ?? [];
    const nextMessages = upsertConversationMessage(current, message);

    snapshot = {
      ...snapshot,
      messagesByConversation: {
        ...snapshot.messagesByConversation,
        [message.conversationId]: nextMessages
      }
    };
  }

  function recomputeCurrentLastMessageSummary(message: ConversationMessage) {
    snapshot = {
      ...snapshot,
      conversations: sortConversations(
        snapshot.conversations.map((conversation) =>
          conversation.id === message.conversationId &&
          conversation.lastMessageId === message.id
            ? {
                ...conversation,
                ...buildConversationLastMessageSummary(
                  message,
                  snapshot.currentUserId ?? "",
                  snapshot.usersById,
                  conversation.updatedAt,
                ),
              }
            : conversation,
        ),
      ),
    };
  }

  function rebuildConversationMessageSummary(conversationId: string, authoritativeLastMessage?: ConversationMessage) {
    const remainingMessages = snapshot.messagesByConversation[conversationId] ?? [];
    const lastMessage = authoritativeLastMessage ?? remainingMessages.at(-1);
    snapshot = {
      ...snapshot,
      conversations: sortConversations(snapshot.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              ...buildConversationLastMessageSummary(lastMessage, snapshot.currentUserId ?? "", snapshot.usersById, conversation.updatedAt),
              ...(lastMessage ? {} : { unreadCount: 0, mentionMe: false, mentionAll: false })
            }
          : conversation
      ))
    };
  }

  function removeDraft(conversationId: string) {
    const nextDrafts = { ...snapshot.ui.drafts };
    delete nextDrafts[conversationId];

    snapshot = {
      ...snapshot,
      ui: {
        ...snapshot.ui,
        drafts: nextDrafts
      },
      conversations: snapshot.conversations.map((conversation) =>
        conversation.id === conversationId ? applyConversationDraft(conversation, undefined, undefined) : conversation
      )
    };
  }

  async function markConversationRead(conversationId: string, markUnread = false) {
    await hydrateStore();
    const response = await api.markConversationRead(conversationId, markUnread);
    upsertConversation(response.conversation);
    emit();
  }

  function syncRealtime(event: ImRealtimeEvent) {
    if (event.type === "message.created" || event.type === "message.updated" || event.type === "message.recalled") {
      upsertConversation(event.payload.conversation);
      upsertMessage(event.payload.message);
      if (event.type === "message.recalled") {
        recomputeCurrentLastMessageSummary(event.payload.message);
      }

      if (
        snapshot.activeConversationId &&
        snapshot.activeConversationId === event.payload.conversation.id &&
        event.payload.message.senderId !== snapshot.currentUserId
      ) {
        void markConversationRead(event.payload.conversation.id);
      } else {
        emit();
      }

      return;
    }

    if (event.type === "conversation.updated") {
      upsertConversation(event.payload.conversation);
      emit();
      return;
    }

    if (event.type === "friend_request.created") {
      snapshot = {
        ...snapshot,
        friendRequests: [event.payload.friendRequest, ...snapshot.friendRequests]
      };
      emit();
      return;
    }

    if (event.type === "friend_request.updated") {
      const nextContact = event.payload.contact;
      snapshot = {
        ...snapshot,
        friendRequests: snapshot.friendRequests.map((item) =>
          item.id === event.payload.friendRequest.id ? event.payload.friendRequest : item
        ),
        contacts: nextContact
          ? snapshot.contacts.some((contact) => contact.id === nextContact.id)
            ? snapshot.contacts.map((contact) => (contact.id === nextContact.id ? nextContact : contact))
            : [nextContact, ...snapshot.contacts]
          : snapshot.contacts
      };
      emit();
      return;
    }

    if (event.type === "contact.updated") {
      snapshot = {
        ...snapshot,
        contacts: snapshot.contacts.some((contact) => contact.id === event.payload.contact.id)
          ? snapshot.contacts.map((contact) => (contact.id === event.payload.contact.id ? event.payload.contact : contact))
          : [event.payload.contact, ...snapshot.contacts]
      };
      emit();
      return;
    }

    if (event.type === "unread.updated") {
      snapshot = {
        ...snapshot,
        conversations: sortConversations(
          snapshot.conversations.map((conversation) =>
            conversation.id === event.payload.conversationId ? { ...conversation, unreadCount: event.payload.unreadCount } : conversation
          )
        )
      };
      emit();
    }
  }

  async function hydrateStore() {
    if (hydrated) {
      return;
    }

    if (hydrating) {
      return hydrating;
    }

    hydrating = (async () => {
      setSnapshot((current) => ({
        ...current,
        status: "loading",
        ui: readUiState()
      }));

      try {
        const bootstrap = await api.bootstrap();
        snapshot = {
          ...snapshot,
          status: "ready",
          currentUserId: bootstrap.currentUserId,
          config: bootstrap.config,
          users: bootstrap.users,
          usersById: toUserRecord(bootstrap.users),
          contacts: bootstrap.contacts,
          organizationContacts: bootstrap.organizationContacts,
          friendRequests: bootstrap.friendRequests,
          conversations: sortConversations(applyDraftsToConversations(bootstrap.conversations, snapshot.ui.drafts)),
          members: bootstrap.members
        };

        if (!realtimeUnsubscribe) {
          realtimeUnsubscribe = backend.subscribeUpdates((update) => {
            if (
              update.type === "message.created" ||
              update.type === "message.updated" ||
              update.type === "message.recalled"
            ) {
              upsertMessage(update.message);
              if (update.type === "message.recalled") {
                recomputeCurrentLastMessageSummary(update.message);
              }
              emit();

              if (
                update.type === "message.created" &&
                snapshot.activeConversationId === update.message.conversationId &&
                update.message.senderId !== snapshot.currentUserId
              ) {
                void markConversationRead(update.message.conversationId);
              }

              if (update.type !== "message.recalled") {
                void refreshBootstrap();
              }
              return;
            }

            void refreshBootstrap();
            if (snapshot.activeConversationId) {
              void loadMessages(snapshot.activeConversationId, { reset: true, limit: 40 });
            }
          });
        }

        hydrated = true;
        emit();
      } catch (error) {
        snapshot = {
          ...snapshot,
          status: "error",
          error: error instanceof Error ? error.message : "通讯录与聊天模块加载失败"
        };
        emit();
      } finally {
        hydrating = null;
      }
    })();

    return hydrating;
  }

  function createOptimisticMessage(
    conversationId: string,
    type: ImMessageType,
    content: string,
    quotedMessageId?: string,
    ext?: MessageExt
  ) {
    const localId = `local-${Date.now()}`;

    return {
      id: localId,
      localId,
      conversationId,
      senderId: snapshot.currentUserId ?? "",
      type,
      content,
      quotedMessageId,
      status: "sending" as const,
      sentAt: new Date().toISOString(),
      clientSeq: Date.now(),
      ext
    };
  }

  function replaceLocalMessage(localId: string, nextMessage: ConversationMessage) {
    const current = snapshot.messagesByConversation[nextMessage.conversationId] ?? [];
    const deduped = current
      .map((message) => (message.id === localId || message.localId === localId ? nextMessage : message))
      .filter((message, index, array) => array.findIndex((item) => item.id === message.id) === index);

    snapshot = {
      ...snapshot,
      messagesByConversation: {
        ...snapshot.messagesByConversation,
        [nextMessage.conversationId]: deduped.sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime())
      }
    };
  }

  async function loadConversation(conversationId: string) {
    await hydrateStore();
    const response = await api.getConversation(conversationId);
    mergeUsers(response.users);
    snapshot = {
      ...snapshot,
      members: [
        ...snapshot.members.filter((member) => member.conversationId !== conversationId),
        ...response.members
      ]
    };
    upsertConversation(response.conversation);
    emit();
    return response.conversation;
  }

  async function loadMessages(conversationId: string, options?: { reset?: boolean; limit?: number }) {
    await hydrateStore();
    const pagination = snapshot.paginationByConversation[conversationId];

    if (pagination?.loading) {
      return;
    }

    snapshot = {
      ...snapshot,
      paginationByConversation: {
        ...snapshot.paginationByConversation,
        [conversationId]: {
          hasMore: pagination?.hasMore ?? true,
          nextCursor: pagination?.nextCursor ?? null,
          loaded: pagination?.loaded ?? false,
          loading: true
        }
      }
    };
    emit();

    const response = await api.listMessages(conversationId, options?.reset ? null : pagination?.nextCursor ?? null, options?.limit ?? 30);
    const nextMessages = mergeConversationMessageHistory(
      snapshot.messagesByConversation[conversationId] ?? [],
      response.messages,
      options?.reset ?? false,
    );

    snapshot = {
      ...snapshot,
      messagesByConversation: {
        ...snapshot.messagesByConversation,
        [conversationId]: nextMessages
      },
      paginationByConversation: {
        ...snapshot.paginationByConversation,
        [conversationId]: {
          hasMore: response.hasMore,
          nextCursor: response.nextCursor,
          loaded: true,
          loading: false
        }
      }
    };
    emit();
  }

  function setActiveConversation(conversationId?: string) {
    snapshot = {
      ...snapshot,
      activeConversationId: conversationId
    };
    emit();
  }

  function setDraft(conversationId: string, text: string) {
    const trimmed = text.trim();
    const nextDrafts = { ...snapshot.ui.drafts };

    if (!trimmed) {
      delete nextDrafts[conversationId];
    } else {
      nextDrafts[conversationId] = {
        text,
        updatedAt: new Date().toISOString()
      };
    }

    snapshot = {
      ...snapshot,
      ui: {
        ...snapshot.ui,
        drafts: nextDrafts
      },
      conversations: snapshot.conversations.map((conversation) =>
        conversation.id === conversationId
          ? applyConversationDraft(conversation, nextDrafts[conversationId]?.text, nextDrafts[conversationId]?.updatedAt)
          : conversation
      )
    };
    emit();
  }

  async function sendMessage(conversationId: string, type: ImMessageType, content: string, options?: { quotedMessageId?: string; ext?: MessageExt }) {
    await hydrateStore();

    const optimistic = createOptimisticMessage(conversationId, type, content, options?.quotedMessageId, options?.ext);
    upsertMessage(optimistic);
    upsertConversation({
      ...(getConversationById({ conversations: snapshot.conversations }, conversationId) ?? {
        id: conversationId,
        type: "single",
        title: "",
        avatar: "",
        memberIds: [],
        lastMessagePreview: "",
        lastMessageTime: optimistic.sentAt,
        unreadCount: 0,
        isPinned: false,
        isMuted: false,
        autoTranslateMessages: false,
        updatedAt: optimistic.sentAt
      }),
      ...buildConversationLastMessageSummary(
        optimistic,
        snapshot.currentUserId ?? "",
        snapshot.usersById,
        optimistic.sentAt,
      ),
      updatedAt: optimistic.sentAt
    });
    emit();

    try {
      const response = await api.sendMessage(type, {
        conversationId,
        content,
        quotedMessageId: options?.quotedMessageId,
        ext: options?.ext
      });
      replaceLocalMessage(optimistic.localId, response.message);
      if (response.conversation) {
        upsertConversation(response.conversation);
      }
      removeDraft(conversationId);
      emit();
      return response.message;
    } catch (error) {
      replaceLocalMessage(optimistic.localId, {
        ...optimistic,
        status: "failed",
        failureReason: getMessageFailureReason(error)
      });
      emit();
      throw error;
    }
  }

  async function sendVoiceMessage(
    conversationId: string,
    voice: Blob,
    metadata: { durationSeconds: number; fileName: string },
  ) {
    await hydrateStore();
    const response = await api.sendVoiceMessage(conversationId, voice, metadata);
    upsertMessage(response.message);
    const conversation = getConversationById(
      { conversations: snapshot.conversations },
      conversationId,
    );

    if (conversation) {
      upsertConversation({
        ...conversation,
        ...buildConversationLastMessageSummary(
          response.message,
          snapshot.currentUserId ?? "",
          snapshot.usersById,
          response.message.sentAt,
        ),
        updatedAt: response.message.sentAt,
      });
    }

    emit();
    return response.message;
  }

  async function estimateTagMessageCampaign(input: TagMessageCampaignInput): Promise<TagMessageCampaignEstimate> {
    await hydrateStore();
    return api.estimateTagMessageCampaign(input);
  }

  async function sendTagMessageCampaign(input: TagMessageCampaignInput): Promise<TagMessageCampaignResult> {
    await hydrateStore();
    const response = await api.sendTagMessageCampaign(input);

    response.deliveries.forEach(({ conversation, message }) => {
      upsertConversation(conversation);
      upsertMessage(message);
    });
    emit();
    return response;
  }

  async function resendMessage(messageId: string) {
    await hydrateStore();
    const response = await api.resendMessage(messageId);
    upsertConversation(response.conversation);
    upsertMessage(response.message);
    emit();
  }

  async function setMessageReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
    reacted: boolean,
  ) {
    await hydrateStore();
    const response = await api.setMessageReaction(
      conversationId,
      messageId,
      emoji,
      reacted,
    );
    upsertMessage(response.message);
    emit();
    return response;
  }

  async function recallMessage(conversationId: string, messageId: string, mode: "standard") {
    await hydrateStore();
    const response = await api.recallMessage(conversationId, messageId, mode);
    upsertMessage(response.message);
    recomputeCurrentLastMessageSummary(response.message);
    emit();
    return response;
  }

  async function deleteMessage(conversationId: string, messageId: string) {
    await hydrateStore();
    const response = await api.deleteMessage(conversationId, messageId);
    const remainingMessages = (snapshot.messagesByConversation[conversationId] ?? []).filter(
      (message) => message.id !== messageId,
    );
    const latestMessage = remainingMessages[remainingMessages.length - 1];
    snapshot = {
      ...snapshot,
      messagesByConversation: {
        ...snapshot.messagesByConversation,
        [conversationId]: remainingMessages,
      }
    };
    rebuildConversationMessageSummary(conversationId, latestMessage);
    emit();
    return response;
  }

  function setPendingChatRecordForward(
    pending: PendingChatRecordForward | null,
  ) {
    if (
      pending &&
      (!pending.sourceConversationId || pending.messageIds.length === 0)
    ) {
      throw new Error("error.im.chat_record_selection_invalid");
    }

    snapshot = {
      ...snapshot,
      pendingChatRecordForward: pending
        ? {
            sourceConversationId: pending.sourceConversationId,
            messageIds: [...pending.messageIds],
          }
        : null,
    };
    emit();
  }

  async function forwardSelectedMessages(
    conversationId: string,
    idempotencyKey: string,
  ) {
    await hydrateStore();
    const pending = snapshot.pendingChatRecordForward;
    if (!pending) {
      throw new Error("error.im.chat_record_selection_expired");
    }

    const response = await api.createChatRecordDelivery(conversationId, {
      idempotencyKey,
      messageIds: [...pending.messageIds],
      sourceConversationId: pending.sourceConversationId,
    });
    upsertMessage(response.message);
    rebuildConversationMessageSummary(conversationId, response.message);
    snapshot = { ...snapshot, pendingChatRecordForward: null };
    emit();
    return response.message;
  }

  async function favoriteSelectedMessages(
    sourceConversationId: string,
    messageIds: string[],
    idempotencyKey: string,
  ) {
    await hydrateStore();
    const response = await api.createChatRecordFavorite({
      idempotencyKey,
      messageIds: [...messageIds],
      sourceConversationId,
    });
    return response.favorite;
  }

  async function batchDeleteMessages(
    conversationId: string,
    messageIds: string[],
    idempotencyKey: string,
  ) {
    await hydrateStore();
    const response = await api.batchDeleteMessages(conversationId, {
      idempotencyKey,
      messageIds: [...messageIds],
    });
    const removed = new Set(response.messageIds);
    const remaining = (snapshot.messagesByConversation[conversationId] ?? [])
      .filter((message) => !removed.has(message.id));
    snapshot = {
      ...snapshot,
      messagesByConversation: {
        ...snapshot.messagesByConversation,
        [conversationId]: remaining,
      },
    };
    rebuildConversationMessageSummary(conversationId);
    emit();
  }

  async function translateMessages(
    conversationId: string,
    messageIds: string[],
    targetLanguage: Language,
  ) {
    await hydrateStore();
    return api.translateMessages(conversationId, {
      messageIds: [...messageIds],
      targetLanguage,
    });
  }

  async function pinConversation(conversationId: string, isPinned: boolean) {
    await hydrateStore();
    const response = await api.pinConversation(conversationId, isPinned);
    upsertConversation(response.conversation);
    emit();
  }

  async function muteConversation(conversationId: string, isMuted: boolean) {
    await hydrateStore();
    const response = await api.muteConversation(conversationId, isMuted);
    upsertConversation(response.conversation);
    emit();
  }

  async function setConversationAutoTranslateMessages(
    conversationId: string,
    enabled: boolean,
  ) {
    await hydrateStore();
    const response = await api.setConversationAutoTranslateMessages(
      conversationId,
      enabled,
    );
    upsertConversation(response.conversation);
    emit();
    return response.conversation;
  }

  async function updateConversationPrivacy(conversationId: string, privacyOptions: UpdateConversationPrivacyOptions) {
    await hydrateStore();
    const response = await api.updateConversationPrivacy(conversationId, privacyOptions);
    upsertConversation(response.conversation);
    emit();
    return response.conversation;
  }

  async function updateConversationGroupInfo(conversationId: string, groupInfoOptions: UpdateConversationGroupInfoOptions) {
    await hydrateStore();
    const response = await api.updateConversationGroupInfo(conversationId, groupInfoOptions);
    snapshot = {
      ...snapshot,
      members: [
        ...snapshot.members.filter((member) => member.conversationId !== conversationId),
        ...response.members
      ]
    };
    upsertConversation(response.conversation);
    emit();
    return response.conversation;
  }

  async function deleteConversation(conversationId: string) {
    await hydrateStore();
    const response = await api.deleteConversation(conversationId);
    upsertConversation(response.conversation);
    emit();
  }

  async function clearConversation(conversationId: string) {
    await hydrateStore();
    const response = await api.clearConversation(conversationId);
    snapshot = {
      ...snapshot,
      messagesByConversation: {
        ...snapshot.messagesByConversation,
        [conversationId]: []
      }
    };
    upsertConversation(response.conversation);
    emit();
  }

  async function ensureDirectConversation(userId: string) {
    await hydrateStore();
    const existing = snapshot.conversations.find((conversation) => conversation.type === "single" && conversation.contactUserId === userId);

    if (existing) {
      if (existing.isDeleted) {
        await loadConversation(existing.id);
      }

      return existing;
    }

    const created = await api.createConversation([userId]);
    await loadConversation(created.conversation.id);
    return getConversationById({ conversations: snapshot.conversations }, created.conversation.id) ?? created.conversation;
  }

  async function createGroupConversation(userIds: string[], title?: string, privacyOptions?: CreateConversationPrivacyOptions) {
    await hydrateStore();
    const created = await api.createConversation(userIds, title, {
      ...privacyOptions,
      forceGroup: true
    });
    await loadConversation(created.conversation.id);
    return getConversationById({ conversations: snapshot.conversations }, created.conversation.id) ?? created.conversation;
  }

  async function addConversationMembers(conversationId: string, userIds: string[]) {
    await hydrateStore();
    const response = await api.addConversationMembers(conversationId, userIds);
    upsertConversation(response.conversation);
    await loadConversation(conversationId);
  }

  function removeConversationLocally(conversationId: string) {
    const nextMessagesByConversation = { ...snapshot.messagesByConversation };
    const nextPaginationByConversation = { ...snapshot.paginationByConversation };
    delete nextMessagesByConversation[conversationId];
    delete nextPaginationByConversation[conversationId];
    snapshot = {
      ...snapshot,
      conversations: snapshot.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      ),
      members: snapshot.members.filter(
        (member) => member.conversationId !== conversationId,
      ),
      messagesByConversation: nextMessagesByConversation,
      paginationByConversation: nextPaginationByConversation,
      activeConversationId:
        snapshot.activeConversationId === conversationId
          ? undefined
          : snapshot.activeConversationId,
    };
    emit();
  }

  async function removeConversationMember(
    conversationId: string,
    userId: string,
    transferOwnerUserId?: string,
  ) {
    await hydrateStore();
    const response = await api.removeConversationMember(
      conversationId,
      userId,
      transferOwnerUserId,
    );
    if (response.conversation) {
      upsertConversation(response.conversation);
    }
    if (userId === snapshot.currentUserId) {
      removeConversationLocally(conversationId);
      return;
    }
    snapshot = {
      ...snapshot,
      members: snapshot.members.filter((member) => !(member.conversationId === conversationId && member.userId === userId))
    };
    emit();
  }

  async function dissolveConversation(conversationId: string) {
    await hydrateStore();
    await api.dissolveConversation(conversationId);
    removeConversationLocally(conversationId);
  }

  async function updateRemark(contactId: string, remarkName: string) {
    await hydrateStore();
    const response = await api.updateRemark(contactId, remarkName);
    snapshot = {
      ...snapshot,
      contacts: snapshot.contacts.map((contact) => (contact.id === contactId ? response.contact : contact))
    };
    emit();
  }

  async function updateContactTags(contactId: string, tags: string[]) {
    await hydrateStore();
    const response = await api.updateContactTags(contactId, tags);
    snapshot = {
      ...snapshot,
      contacts: snapshot.contacts.map((contact) => (contact.id === contactId ? response.contact : contact))
    };
    emit();
    return response.contact;
  }

  async function updateConversationTags(conversationId: string, tags: string[]) {
    await hydrateStore();
    const response = await api.updateConversationTags(conversationId, tags);
    upsertConversation(response.conversation);
    emit();
    return response.conversation;
  }

  async function getDirectoryProfile(userId: string): Promise<DirectoryProfile> {
    await hydrateStore();
    const profile = await api.getDirectoryProfile(userId);
    mergeUsers([profile.user]);
    if (profile.friendRequest) {
      snapshot = {
        ...snapshot,
        friendRequests: [
          profile.friendRequest,
          ...snapshot.friendRequests.filter(
            (request) => request.id !== profile.friendRequest?.id,
          ),
        ],
      };
    }
    emit();
    return profile;
  }

  async function sendFriendRequest(targetUserId: string, message?: string) {
    await hydrateStore();
    const response = await api.sendFriendRequest(targetUserId, message);
    snapshot = {
      ...snapshot,
      friendRequests: [
        response.friendRequest,
        ...snapshot.friendRequests.filter(
          (request) => request.id !== response.friendRequest.id,
        ),
      ],
    };
    emit();
    await refreshBootstrap();
    return response;
  }

  async function blockContact(contactId: string) {
    await hydrateStore();
    const response = await api.blockContact(contactId);
    snapshot = {
      ...snapshot,
      contacts: snapshot.contacts.map((contact) => (contact.id === contactId ? response.contact : contact))
    };
    emit();
  }

  async function unblockContact(contactId: string) {
    await hydrateStore();
    const response = await api.unblockContact(contactId);
    snapshot = {
      ...snapshot,
      contacts: snapshot.contacts.map((contact) => (contact.id === contactId ? response.contact : contact))
    };
    emit();
  }

  async function deleteContact(contactId: string) {
    await hydrateStore();
    const response = await api.deleteContact(contactId);
    snapshot = {
      ...snapshot,
      contacts: snapshot.contacts.filter((contact) => contact.id !== contactId),
    };
    if (response.deletedConversationId) {
      removeConversationLocally(response.deletedConversationId);
      return response;
    }
    emit();
    return response;
  }

  async function acceptFriendRequest(requestId: string) {
    await hydrateStore();
    const response = await api.acceptFriendRequest(requestId);
    snapshot = {
      ...snapshot,
      friendRequests: snapshot.friendRequests.map((request) => (request.id === requestId ? response.request : request)),
      contacts: response.contact ? [response.contact, ...snapshot.contacts.filter((contact) => contact.id !== response.contact?.id)] : snapshot.contacts
    };
    emit();
    await refreshBootstrap();
    return response;
  }

  async function rejectFriendRequest(requestId: string) {
    await hydrateStore();
    const response = await api.rejectFriendRequest(requestId);
    snapshot = {
      ...snapshot,
      friendRequests: snapshot.friendRequests.map((request) => (request.id === requestId ? response.friendRequest : request))
    };
    emit();
    await refreshBootstrap();
    return response;
  }

  async function search(query: string, conversationId?: string) {
    await hydrateStore();
    return buildCachedImSearchResults(snapshot, query, conversationId);
  }

  async function searchDirectory(query: string) {
    await hydrateStore();
    const response = await api.searchDirectory(query);
    mergeUsers(response.users);
    emit();
    return response.users;
  }

  function rememberSearchTerm(value: string) {
    const term = value.trim();

    if (!term) {
      return;
    }

    const nextHistory = [term, ...snapshot.ui.searchHistory.filter((item) => item !== term)].slice(0, 8);
    snapshot = {
      ...snapshot,
      ui: {
        ...snapshot.ui,
        searchHistory: nextHistory
      }
    };
    emit();
  }

  function clearSearchHistory() {
    snapshot = {
      ...snapshot,
      ui: {
        ...snapshot.ui,
        searchHistory: []
      }
    };
    emit();
  }

  async function refreshBootstrap() {
    if (!hydrated || snapshot.status !== "ready") {
      return;
    }

    if (entityRefresh) {
      return entityRefresh;
    }

    entityRefresh = (async () => {
      const bootstrap = await api.bootstrap();
      snapshot = {
        ...snapshot,
        currentUserId: bootstrap.currentUserId,
        config: bootstrap.config,
        users: bootstrap.users,
        usersById: toUserRecord(bootstrap.users),
        contacts: bootstrap.contacts,
        organizationContacts: bootstrap.organizationContacts,
        friendRequests: bootstrap.friendRequests,
        conversations: sortConversations(applyDraftsToConversations(bootstrap.conversations, snapshot.ui.drafts)),
        members: bootstrap.members
      };
      emit();
    })().finally(() => {
      entityRefresh = null;
    });

    return entityRefresh;
  }

  function useStore() {
    const storeSnapshot = useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => snapshot
    );

    useEffect(() => {
      void hydrateStore();
    }, []);

    return {
      ...storeSnapshot,
      api,
      hydrate: hydrateStore,
      loadConversation,
      loadMessages,
      setActiveConversation,
      setDraft,
      sendMessage,
      sendVoiceMessage,
      estimateTagMessageCampaign,
      sendTagMessageCampaign,
      resendMessage,
      setMessageReaction,
      recallMessage,
      deleteMessage,
      setPendingChatRecordForward,
      forwardSelectedMessages,
      favoriteSelectedMessages,
      batchDeleteMessages,
      translateMessages,
      getChatRecord: api.getChatRecord,
      listChatRecordItems: api.listChatRecordItems,
      getChatRecordMedia: api.getChatRecordMedia,
      listChatRecordFavorites: api.listChatRecordFavorites,
      removeChatRecordFavorite: api.removeChatRecordFavorite,
      pinConversation,
      muteConversation,
      setConversationAutoTranslateMessages,
      updateConversationPrivacy,
      updateConversationGroupInfo,
      markConversationRead,
      deleteConversation,
      clearConversation,
      ensureDirectConversation,
      createGroupConversation,
      addConversationMembers,
      removeConversationMember,
      dissolveConversation,
      getDirectoryProfile,
      sendFriendRequest,
      updateRemark,
      updateContactTags,
      updateConversationTags,
      blockContact,
      unblockContact,
      deleteContact,
      acceptFriendRequest,
      rejectFriendRequest,
      search,
      searchDirectory,
      refresh: refreshBootstrap,
      rememberSearchTerm,
      clearSearchHistory
    };
  }

  return {
    useStore
  };
}

const scopedStores = new Map<string, ReturnType<typeof createScopedStore>>();

function getScopedStore(
  scope: ImRoleType,
  currentUser: { avatarUrl: string | null; id: number; needoId: string; username: string }
) {
  const key = `${scope}:formal:${currentUser.id}`;
  const existing = scopedStores.get(key);

  if (existing) {
    return existing;
  }

  const created = createScopedStore(scope, {
    api: createFormalImApi({ currentUser, scope }),
    subscribeUpdates: subscribeFormalImUpdates
  });
  scopedStores.set(key, created);
  return created;
}

export function getContactConversation(snapshotData: ImSnapshot, userId: string) {
  return snapshotData.conversations.find((conversation) => conversation.type === "single" && conversation.contactUserId === userId);
}

export function getContactForConversation(snapshotData: ImSnapshot, conversation: Conversation) {
  return conversation.contactUserId ? snapshotData.contacts.find((contact) => contact.targetUserId === conversation.contactUserId) : undefined;
}

export function getConversationDisplayName(snapshotData: ImSnapshot, conversation: Conversation) {
  if (conversation.type === "group" && conversation.hideMemberProfiles) {
    return getAnonymousGroupConversationTitle(conversation);
  }

  if (!conversation.contactUserId) {
    return conversation.title;
  }

  const user = snapshotData.usersById[conversation.contactUserId];
  const contact = getContactForConversation(snapshotData, conversation);

  return user ? getDisplayName(user, contact) : conversation.title;
}

export function getBlockedContacts(snapshotData: ImSnapshot) {
  return snapshotData.contacts.filter((contact) => contact.relationStatus === "active" && contact.isBlocked);
}

export function getServiceContacts(snapshotData: ImSnapshot) {
  return snapshotData.contacts.filter((contact) => snapshotData.usersById[contact.targetUserId]?.serviceAccount);
}

export function getCurrentUser(snapshotData: ImSnapshot) {
  return snapshotData.currentUserId ? snapshotData.usersById[snapshotData.currentUserId] : undefined;
}

export function getConversationMessages(snapshotData: ImSnapshot, conversationId: string) {
  return snapshotData.messagesByConversation[conversationId] ?? emptyConversationMessages;
}

export function getQuotedMessage(snapshotData: ImSnapshot, conversationId: string, quotedMessageId?: string) {
  if (!quotedMessageId) {
    return undefined;
  }

  return getConversationMessages(snapshotData, conversationId).find((message) => message.id === quotedMessageId);
}

export function canRecall(snapshotData: ImSnapshot, message: ConversationMessage) {
  return snapshotData.config && snapshotData.currentUserId ? canRecallMessage(message, snapshotData.currentUserId, snapshotData.config) : false;
}

export function useImStore(scope: ImRoleType = "user") {
  const { session } = useAuth();
  const currentUser = {
    id: session?.id ?? 0,
    needoId: session?.activePublicId ?? session?.primaryPublicId ?? "",
    username: session?.username ?? "",
    avatarUrl: session?.avatarUrl ?? null
  };

  return getScopedStore(scope, currentUser).useStore();
}

export type ImStoreHook = ReturnType<typeof useImStore>;
export type ImStoreSearchResult = ImSearchResult;
