import { useEffect, useSyncExternalStore } from "react";
import { useEntityStore } from "../../state/entityStore";
import { createImApi, installImMockServer, subscribeImRealtime } from "./api";
import {
  applyConversationDraft,
  buildMessagePreview,
  canRecallMessage,
  getConversationById,
  getDisplayName,
  type ContactRelation,
  type Conversation,
  type ConversationMember,
  type ConversationMessage,
  type CreateConversationPrivacyOptions,
  type FriendRequest,
  type ImMessageType,
  type ImRealtimeEvent,
  type ImRoleType,
  type ImRuntimeConfig,
  type ImSearchResult,
  type ImUser,
  type MessageExt,
  type UpdateConversationGroupInfoOptions,
  type UpdateConversationPrivacyOptions,
  sortConversations
} from "./model";

type StoreStatus = "idle" | "loading" | "ready" | "error";
type DraftState = Record<string, { text: string; updatedAt: string }>;

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

type ImSnapshot = {
  status: StoreStatus;
  error?: string;
  currentUserId?: string;
  config?: ImRuntimeConfig;
  users: ImUser[];
  usersById: Record<string, ImUser>;
  contacts: ContactRelation[];
  friendRequests: FriendRequest[];
  conversations: Conversation[];
  members: ConversationMember[];
  messagesByConversation: Record<string, ConversationMessage[]>;
  paginationByConversation: PaginationState;
  activeConversationId?: string;
  ui: UiState;
};

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

function createScopedStore(scope: ImRoleType) {
  const api = createImApi(scope);
  const listeners = new Set<() => void>();
  let realtimeUnsubscribe: (() => void) | null = null;
  let hydrated = false;
  let hydrating: Promise<void> | null = null;
  let lastEntityRevision = -1;
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
    const exists = current.some((item) => item.id === message.id || item.localId === message.localId);
    const nextMessages = exists
      ? current.map((item) => (item.id === message.id || item.localId === message.localId ? message : item))
      : [...current, message];

    snapshot = {
      ...snapshot,
      messagesByConversation: {
        ...snapshot.messagesByConversation,
        [message.conversationId]: nextMessages.sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime())
      }
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

  async function markConversationRead(conversationId: string) {
    await hydrateStore();
    const response = await api.markConversationRead(conversationId);
    upsertConversation(response.conversation);
    emit();
  }

  function syncRealtime(event: ImRealtimeEvent) {
    if (event.type === "message.created" || event.type === "message.updated" || event.type === "message.recalled") {
      upsertConversation(event.payload.conversation);
      upsertMessage(event.payload.message);

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
      installImMockServer();

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
          friendRequests: bootstrap.friendRequests,
          conversations: sortConversations(applyDraftsToConversations(bootstrap.conversations, snapshot.ui.drafts)),
          members: bootstrap.members
        };

        if (!realtimeUnsubscribe) {
          realtimeUnsubscribe = subscribeImRealtime(scope, syncRealtime);
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
    const nextMessages = options?.reset
      ? response.messages
      : [...(snapshot.messagesByConversation[conversationId] ?? []), ...response.messages].filter(
          (message, index, array) => array.findIndex((item) => item.id === message.id) === index
        );

    snapshot = {
      ...snapshot,
      messagesByConversation: {
        ...snapshot.messagesByConversation,
        [conversationId]: nextMessages.sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime())
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
        updatedAt: optimistic.sentAt
      }),
      lastMessagePreview: buildMessagePreview(optimistic, snapshot.currentUserId ?? "", snapshot.usersById),
      lastMessageTime: optimistic.sentAt,
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
      upsertConversation(response.conversation);
      removeDraft(conversationId);
      emit();
      return response.message;
    } catch (error) {
      replaceLocalMessage(optimistic.localId, {
        ...optimistic,
        status: "failed"
      });
      emit();
      throw error;
    }
  }

  async function resendMessage(messageId: string) {
    await hydrateStore();
    const response = await api.resendMessage(messageId);
    upsertConversation(response.conversation);
    upsertMessage(response.message);
    emit();
  }

  async function recallMessage(messageId: string) {
    await hydrateStore();
    const response = await api.recallMessage(messageId);
    upsertConversation(response.conversation);
    upsertMessage(response.message);
    emit();
  }

  async function forwardMessage(messageId: string, conversationId: string) {
    await hydrateStore();
    const response = await api.forwardMessage(messageId, conversationId);
    upsertConversation(response.conversation);
    upsertMessage(response.message);
    emit();
    return response.message;
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

  async function removeConversationMember(conversationId: string, userId: string) {
    await hydrateStore();
    const response = await api.removeConversationMember(conversationId, userId);
    upsertConversation(response.conversation);
    snapshot = {
      ...snapshot,
      members: snapshot.members.filter((member) => !(member.conversationId === conversationId && member.userId === userId))
    };
    emit();
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

  async function addContact(targetUserId: string, source?: string, description?: string) {
    await hydrateStore();
    const response = await api.addContact(targetUserId, source, description);
    snapshot = {
      ...snapshot,
      contacts: snapshot.contacts.some((contact) => contact.id === response.contact.id)
        ? snapshot.contacts.map((contact) => (contact.id === response.contact.id ? response.contact : contact))
        : [response.contact, ...snapshot.contacts]
    };
    emit();
    return response.contact;
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
      contacts: snapshot.contacts.map((contact) => (contact.id === contactId ? response.contact : contact))
    };
    emit();
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
  }

  async function rejectFriendRequest(requestId: string) {
    await hydrateStore();
    const response = await api.rejectFriendRequest(requestId);
    snapshot = {
      ...snapshot,
      friendRequests: snapshot.friendRequests.map((request) => (request.id === requestId ? response.friendRequest : request))
    };
    emit();
  }

  async function search(query: string, conversationId?: string) {
    await hydrateStore();
    return api.search(query, conversationId);
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

  async function refreshAccountEntities(entityRevision: number) {
    if (!hydrated || snapshot.status !== "ready" || lastEntityRevision === entityRevision) {
      return;
    }

    lastEntityRevision = entityRevision;

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
    const entityRevision = useEntityStore().revision;
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

    useEffect(() => {
      if (storeSnapshot.status !== "ready") {
        return;
      }

      void refreshAccountEntities(entityRevision);
    }, [entityRevision, storeSnapshot.status]);

    return {
      ...storeSnapshot,
      hydrate: hydrateStore,
      loadConversation,
      loadMessages,
      setActiveConversation,
      setDraft,
      sendMessage,
      resendMessage,
      recallMessage,
      forwardMessage,
      pinConversation,
      muteConversation,
      updateConversationPrivacy,
      updateConversationGroupInfo,
      markConversationRead,
      deleteConversation,
      clearConversation,
      ensureDirectConversation,
      createGroupConversation,
      addConversationMembers,
      removeConversationMember,
      addContact,
      updateRemark,
      updateContactTags,
      updateConversationTags,
      blockContact,
      unblockContact,
      deleteContact,
      acceptFriendRequest,
      rejectFriendRequest,
      search,
      rememberSearchTerm,
      clearSearchHistory
    };
  }

  return {
    useStore
  };
}

const scopedStores = new Map<ImRoleType, ReturnType<typeof createScopedStore>>();

function getScopedStore(scope: ImRoleType) {
  const existing = scopedStores.get(scope);

  if (existing) {
    return existing;
  }

  const created = createScopedStore(scope);
  scopedStores.set(scope, created);
  return created;
}

export function getContactConversation(snapshotData: ImSnapshot, userId: string) {
  return snapshotData.conversations.find((conversation) => conversation.type === "single" && conversation.contactUserId === userId);
}

export function getContactForConversation(snapshotData: ImSnapshot, conversation: Conversation) {
  return conversation.contactUserId ? snapshotData.contacts.find((contact) => contact.targetUserId === conversation.contactUserId) : undefined;
}

export function getConversationDisplayName(snapshotData: ImSnapshot, conversation: Conversation) {
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
  return snapshotData.messagesByConversation[conversationId] ?? [];
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
  return getScopedStore(scope).useStore();
}

export type ImStoreHook = ReturnType<typeof useImStore>;
export type ImStoreSearchResult = ImSearchResult;
