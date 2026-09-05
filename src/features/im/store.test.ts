// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImApi } from "./contract";
import type { Conversation, ConversationMessage, ImStoreUpdate } from "./model";
import storeSource from "./store.ts?raw";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocked = vi.hoisted(() => ({
  api: null as unknown,
  subscriptionListener: undefined as ((update: ImStoreUpdate) => void) | undefined,
  session: {
    activePublicId: "u0000000100",
    avatarUrl: null,
    id: 100,
    primaryPublicId: "u0000000100",
    username: "测试用户",
  },
  localCache: {
    beginCacheOpenedMedia: vi.fn(async () => ({ generation: 0, key: "intent" })),
    cacheOpenedMedia: vi.fn(async () => undefined),
    clearAccount: vi.fn(async () => undefined),
    getCachedMediaObjectUrl: vi.fn(async () => undefined),
    getUsage: vi.fn(async () => ({ mediaBytes: 0 })),
    lock: vi.fn(),
    purgeMedia: vi.fn(async () => undefined),
    releaseCachedMediaObjectUrl: vi.fn(),
    unlock: vi.fn(async () => undefined),
  },
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ session: mocked.session }),
}));

vi.mock("./formal-api", () => ({
  createFormalImApi: () => mocked.api,
  subscribeFormalImUpdates: (listener: (update: ImStoreUpdate) => void) => {
    mocked.subscriptionListener = listener;
    return () => {
      if (mocked.subscriptionListener === listener) {
        mocked.subscriptionListener = undefined;
      }
    };
  },
}));

vi.mock("./local-cache/service", () => ({
  getImOpenedMediaCacheService: () => mocked.localCache,
}));
import {
  buildCachedImSearchResults,
  fetchImOpenedMediaBlob,
  getIncomingPendingFriendRequestCount,
  getMessageFailureReason,
  getForwardableMessagePayload,
  mergeConversationMessageHistory,
  preferTerminalMessage,
  resolveImOpenedMediaCacheFetchSource,
  selectLatestFriendRequestsByCounterpart,
  upsertConversationMessage,
  useImStore,
  useImStoreApi,
} from "./store";

const sentAt = "2026-08-25T10:00:00.000Z";

describe("opened IM media cache delivery source", () => {
  it("routes a formal absolute backend media URL through the current-origin proxy", () => {
    expect(resolveImOpenedMediaCacheFetchSource(
      "http://localhost:3000/media/im/original.jpg?version=1",
      "http://127.0.0.1:5180",
    )).toBe("/media/im/original.jpg?version=1");
  });

  it("refuses to read arbitrary cross-origin bytes into the private cache", () => {
    expect(() => resolveImOpenedMediaCacheFetchSource(
      "https://untrusted.example/private.jpg",
      "http://127.0.0.1:5180",
    )).toThrow("error.im.local_cache_media_source_invalid");
  });

  it("classifies only an authoritative HTTP 410 as expired", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 410 } as Response));
    await expect(fetchImOpenedMediaBlob(
      "http://localhost:3000/media/im/expired.jpg",
      "http://127.0.0.1:5180",
      fetcher,
    )).resolves.toEqual({ state: "expired" });
    expect(fetcher).toHaveBeenCalledWith("/media/im/expired.jpg", {
      cache: "no-store",
      credentials: "same-origin",
    });

    const missing = vi.fn(async () => ({ ok: false, status: 404 } as Response));
    await expect(fetchImOpenedMediaBlob(
      "/media/im/missing.jpg",
      "http://127.0.0.1:5180",
      missing,
    )).rejects.toThrow("error.im.media_delivery_404");
  });

  it("captures deletion intent before a no-store same-origin media fetch", async () => {
    mocked.session = {
      activePublicId: "u0000000109",
      avatarUrl: null,
      id: 109,
      primaryPublicId: "u0000000109",
      username: "媒体缓存测试用户",
    };
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({
        currentUserId: "109",
        config: {
          allowStrangerMessaging: true,
          preserveConversationAfterDelete: true,
          recallWindowMs: 180_000,
          separatorThresholdMs: 300_000,
          syncDraftAcrossDevices: false,
        },
        users: [], contacts: [], friendRequests: [], conversations: [], members: [],
      }),
    };
    const response = {
      blob: vi.fn(async () => new Blob(["image"], { type: "image/jpeg" })),
      ok: true,
      status: 200,
    } as unknown as Response;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await renderStore();
    await store?.cacheOpenedMedia(
      message({
        type: "image",
        content: "http://localhost:3000/media/im/original.jpg",
        ext: { url: "http://localhost:3000/media/im/original.jpg" },
      }),
      "http://localhost:3000/media/im/original.jpg",
    );

    expect(mocked.localCache.beginCacheOpenedMedia).toHaveBeenCalledWith("109", "91", "700");
    expect(fetchSpy).toHaveBeenCalledWith("/media/im/original.jpg", {
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(mocked.localCache.beginCacheOpenedMedia.mock.invocationCallOrder[0])
      .toBeLessThan(fetchSpy.mock.invocationCallOrder[0]!);
    expect(mocked.localCache.cacheOpenedMedia).toHaveBeenCalledWith(
      "109",
      expect.objectContaining({ id: "700" }),
      expect.any(Blob),
      { generation: 0, key: "intent" },
    );
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let store: ReturnType<typeof useImStore> | null = null;

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "91",
    type: "single",
    title: "已确认标题",
    avatar: "",
    memberIds: ["100", "201"],
    lastMessagePreview: "",
    lastMessageTime: sentAt,
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
    autoTranslateMessages: false,
    updatedAt: sentAt,
    ...overrides,
  };
}

function StoreProbe() {
  store = useImStore();
  return null;
}

async function renderStore() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(StoreProbe));
  });
  await act(async () => Promise.resolve());
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  store = null;
  mocked.session = {
    activePublicId: "u0000000100",
    avatarUrl: null,
    id: 100,
    primaryPublicId: "u0000000100",
    username: "测试用户",
  };
  mocked.subscriptionListener = undefined;
  mocked.api = null;
  window.localStorage.clear();
  document.body.replaceChildren();
  vi.clearAllMocks();
  mocked.localCache.purgeMedia.mockResolvedValue(undefined);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function message(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "700",
    localId: "700",
    conversationId: "91",
    senderId: "100",
    type: "text",
    content: "原消息",
    status: "sent",
    sentAt,
    clientSeq: 700,
    serverState: "active",
    availableRecallModes: ["standard"],
    ...overrides,
  };
}

const recalled = message({
  type: "recalled",
  content: "",
  status: "recalled",
  recalledAt: "2026-08-25T10:01:00.000Z",
  serverState: "recalled",
  availableRecallModes: [],
});

describe("formal IM recall terminal precedence", () => {
  it("never lets a stale active row overwrite a confirmed recall tombstone", () => {
    expect(preferTerminalMessage(recalled, message())).toBe(recalled);
    expect(upsertConversationMessage([recalled], message())).toEqual([recalled]);
  });

  it("keeps one residue when the same recall arrives again through SSE", () => {
    expect(upsertConversationMessage([recalled], { ...recalled })).toEqual([recalled]);
  });

  it("preserves the tombstone when a reset history page is stale", () => {
    expect(mergeConversationMessageHistory([recalled], [message()], true)).toEqual([
      recalled,
    ]);
  });

  it("awaits the conversation-scoped standard recall before upserting the result", () => {
    const source = storeSource;
    expect(source).toContain(
      'async function recallMessage(conversationId: string, messageId: string, mode: "standard")',
    );
    expect(source).toContain(
      "const response = await api.recallMessage(conversationId, messageId, mode);",
    );
    expect(source).toContain("upsertMessage(response.message);");
  });

  it("recomputes the current last-message summary immediately after local recall", async () => {
    mocked.session = {
      activePublicId: "u0000000106",
      avatarUrl: null,
      id: 106,
      primaryPublicId: "u0000000106",
      username: "本地撤回测试用户",
    };
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({
        currentUserId: "100",
        config: {
          allowStrangerMessaging: true,
          preserveConversationAfterDelete: true,
          recallWindowMs: 180_000,
          separatorThresholdMs: 300_000,
          syncDraftAcrossDevices: false,
        },
        users: [],
        contacts: [],
        friendRequests: [],
        conversations: [conversation({
          lastMessageId: "700",
          lastMessagePreview: "原消息",
          lastMessageType: "text",
          lastMessageStatus: "sent",
        })],
        members: [],
      }),
      listMessages: vi.fn().mockResolvedValue({
        messages: [message()],
        nextCursor: null,
        hasMore: false,
      }),
      recallMessage: vi.fn().mockResolvedValue({
        conversationId: "91",
        message: recalled,
        messageId: recalled.id,
        mode: "standard",
      }),
    };

    await renderStore();
    await act(async () => {
      await store?.loadMessages("91", { reset: true });
      await store?.recallMessage("91", "700", "standard");
    });

    expect(store?.conversations[0]).toMatchObject({
      lastMessageId: "700",
      lastMessagePreview: "你撤回了一条消息",
      lastMessageType: "recalled",
      lastMessageStatus: "recalled",
    });
    expect(mocked.localCache.purgeMedia).toHaveBeenCalledWith("106", "91", "700");
  });

  it("purges encrypted media before refreshing an online privacy deletion", async () => {
    vi.useFakeTimers();
    mocked.session = {
      activePublicId: "u0000010107",
      avatarUrl: null,
      id: 10_107,
      primaryPublicId: "u0000010107",
      username: "隐私删除测试用户",
    };
    const bootstrap = vi.fn().mockResolvedValue({
        currentUserId: "10107",
        config: {
          allowStrangerMessaging: true,
          preserveConversationAfterDelete: true,
          recallWindowMs: 180_000,
          separatorThresholdMs: 300_000,
          syncDraftAcrossDevices: false,
        },
        users: [],
        contacts: [],
        friendRequests: [],
        conversations: [conversation()],
        members: [],
      });
    const listMessages = vi.fn()
      .mockResolvedValueOnce({ messages: [message()], nextCursor: null, hasMore: false })
      .mockResolvedValue({ messages: [], nextCursor: null, hasMore: false });
    mocked.api = {
      bootstrap,
      listMessages,
    };
    mocked.localCache.purgeMedia.mockRejectedValue(
      new Error("transient IndexedDB transaction failure"),
    );

    await renderStore();
    await act(async () => {
      store?.setActiveConversation("91");
      await store?.loadMessages("91", { reset: true });
      mocked.subscriptionListener?.({
        type: "message.deleted",
        conversationId: "91",
        messageId: "700",
        reason: "privacy_expired",
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocked.localCache.purgeMedia).toHaveBeenCalledTimes(3);
    expect(mocked.localCache.purgeMedia).toHaveBeenNthCalledWith(1, "10107", "91", "700");
    expect(mocked.localCache.purgeMedia).toHaveBeenNthCalledWith(2, "10107", "91", "700");
    expect(mocked.localCache.purgeMedia).toHaveBeenNthCalledWith(3, "10107", "91", "700");
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(store?.messagesByConversation["91"]).toEqual([
      expect.objectContaining({ id: "700", serverState: "active" }),
    ]);
    expect(store?.error).toBe("error.im.local_cache_purge_failed");

    mocked.localCache.purgeMedia.mockResolvedValue(undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
    });

    expect(mocked.localCache.purgeMedia).toHaveBeenCalledTimes(4);
    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(listMessages).toHaveBeenCalledTimes(2);
    expect(store?.messagesByConversation["91"]).toEqual([]);
    expect(store?.error).toBeUndefined();
  });

  it("applies a recalled history tombstone and releases pagination while local cleanup retries", async () => {
    vi.useFakeTimers();
    mocked.session = {
      activePublicId: "u0000010108",
      avatarUrl: null,
      id: 10_108,
      primaryPublicId: "u0000010108",
      username: "测试用户",
    };
    mocked.localCache.purgeMedia.mockRejectedValue(new Error("IndexedDB unavailable"));
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({
        currentUserId: "10108",
        config: {
          allowStrangerMessaging: true,
          preserveConversationAfterDelete: true,
          recallWindowMs: 180_000,
          separatorThresholdMs: 300_000,
          syncDraftAcrossDevices: false,
        },
        users: [], contacts: [], friendRequests: [], conversations: [conversation()], members: [],
      }),
      listMessages: vi.fn().mockResolvedValue({
        messages: [recalled],
        nextCursor: null,
        hasMore: false,
      }),
    };

    await renderStore();
    await act(async () => {
      await expect(store?.loadMessages("91", { reset: true })).resolves.toBeUndefined();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store?.messagesByConversation["91"]).toEqual([recalled]);
    expect(store?.paginationByConversation["91"]).toMatchObject({ loading: false, loaded: true });
    expect(store?.error).toBe("error.im.local_cache_purge_failed");

    mocked.localCache.purgeMedia.mockResolvedValue(undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(store?.error).toBeUndefined();
  });

  it("recomputes the current last-message summary for message-only SSE recall", async () => {
    mocked.session = {
      activePublicId: "u0000000107",
      avatarUrl: null,
      id: 107,
      primaryPublicId: "u0000000107",
      username: "SSE撤回测试用户",
    };
    const bootstrap = vi.fn().mockResolvedValue({
      currentUserId: "100",
      config: {
        allowStrangerMessaging: true,
        preserveConversationAfterDelete: true,
        recallWindowMs: 180_000,
        separatorThresholdMs: 300_000,
        syncDraftAcrossDevices: false,
      },
      users: [],
      contacts: [],
      friendRequests: [],
      conversations: [conversation({
        lastMessageId: "700",
        lastMessagePreview: "原消息",
        lastMessageType: "text",
        lastMessageStatus: "sent",
      })],
      members: [],
    });
    mocked.api = {
      bootstrap,
      listMessages: vi.fn().mockResolvedValue({
        messages: [message()],
        nextCursor: null,
        hasMore: false,
      }),
    };

    await renderStore();
    await act(async () => {
      await store?.loadMessages("91", { reset: true });
    });
    expect(mocked.subscriptionListener).toEqual(expect.any(Function));

    await act(async () => {
      mocked.subscriptionListener?.({ type: "message.recalled", message: recalled });
    });

    expect(store?.conversations[0]).toMatchObject({
      lastMessageId: "700",
      lastMessagePreview: "你撤回了一条消息",
      lastMessageType: "recalled",
      lastMessageStatus: "recalled",
    });
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });
});

describe("chat-record store facade", () => {
  it("keeps one production facade identity and does not refetch after an unrelated SSE snapshot update", async () => {
    mocked.session = { activePublicId: "u0000000901", avatarUrl: null, id: 901, primaryPublicId: "u0000000901", username: "record-reader" };
    const getChatRecord = vi.fn().mockResolvedValue({ publicId: "11111111-1111-4111-8111-111111111111", title: "A", preview: "A: one", senderNames: ["A"], senderCount: 1, itemCount: 1, createdAt: sentAt });
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({ currentUserId: "901", config: { allowStrangerMessaging: true, preserveConversationAfterDelete: true, recallWindowMs: 180_000, separatorThresholdMs: 300_000, syncDraftAcrossDevices: false }, users: [], contacts: [], friendRequests: [], conversations: [], members: [] }),
      getChatRecord,
      listChatRecordItems: vi.fn(),
      getChatRecordMedia: vi.fn(),
      listChatRecordFavorites: vi.fn(),
      removeChatRecordFavorite: vi.fn(),
    } as unknown as ImApi;
    let firstFacade: ReturnType<typeof useImStoreApi> | undefined;
    let latestFacade: ReturnType<typeof useImStoreApi> | undefined;
    function FacadeProbe() {
      const facade = useImStoreApi("user");
      firstFacade ??= facade;
      latestFacade = facade;
      useEffect(() => { void facade.getChatRecord("11111111-1111-4111-8111-111111111111"); }, [facade]);
      return null;
    }
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root?.render(createElement(FacadeProbe)); await Promise.resolve(); });
    expect(getChatRecord).toHaveBeenCalledTimes(1);
    await act(async () => { mocked.subscriptionListener?.({ type: "message.updated", message: message({ id: "unrelated", conversationId: "other" }) }); await Promise.resolve(); });
    expect(latestFacade).toBe(firstFacade);
    expect(getChatRecord).toHaveBeenCalledTimes(1);
  });
});

describe("formal IM auto translation preference", () => {
  it("waits for the confirmed response and preserves the confirmed value after rejection", async () => {
    let resolvePreference: ((value: { conversation: Conversation }) => void) | undefined;
    const setConversationAutoTranslateMessages = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ conversation: Conversation }>((resolve) => {
            resolvePreference = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("error.network.timeout"));
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({
        currentUserId: "100",
        config: {
          allowStrangerMessaging: true,
          preserveConversationAfterDelete: true,
          recallWindowMs: 180_000,
          separatorThresholdMs: 300_000,
          syncDraftAcrossDevices: false,
        },
        users: [],
        contacts: [],
        friendRequests: [],
        conversations: [conversation()],
        members: [],
      }),
      setConversationAutoTranslateMessages,
    };
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await renderStore();
    expect(store?.conversations).toMatchObject([
      { id: "91", autoTranslateMessages: false },
    ]);
    setItem.mockClear();

    const pending = store?.setConversationAutoTranslateMessages("91", true);
    expect(store?.conversations).toMatchObject([
      { id: "91", autoTranslateMessages: false },
    ]);
    await Promise.resolve();
    expect(resolvePreference).toEqual(expect.any(Function));

    await act(async () => {
      resolvePreference?.({
        conversation: conversation({
          autoTranslateMessages: true,
          title: "服务器确认标题",
        }),
      });
      await pending;
    });
    expect(store?.conversations).toMatchObject([
      {
        id: "91",
        autoTranslateMessages: true,
        title: "服务器确认标题",
      },
    ]);

    await expect(
      store?.setConversationAutoTranslateMessages("91", false),
    ).rejects.toThrow("error.network.timeout");
    expect(store?.conversations).toMatchObject([
      { id: "91", autoTranslateMessages: true },
    ]);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("formal IM resend payload integrity", () => {
  it("resends by authoritative message id without mutating the stored raw content or rich text", async () => {
    mocked.session = {
      activePublicId: "u0000000105",
      avatarUrl: null,
      id: 105,
      primaryPublicId: "u0000000105",
      username: "重发测试用户",
    };
    const richText = {
      version: 1 as const,
      parts: [
        { type: "text" as const, value: "测试" },
        { type: "judgement" as const, value: "OK" },
      ],
    };
    const failedMessage = message({
      content: "测试OK",
      status: "failed",
      ext: { richText },
    });
    const originalFailedMessage = structuredClone(failedMessage);
    const confirmedMessage = message({
      content: "测试OK",
      status: "sent",
      ext: { richText: structuredClone(richText) },
    });
    const resendMessage = vi.fn().mockResolvedValue({
      conversation: conversation({
        lastMessagePreview: "测试OK",
        lastMessageType: "text",
        lastMessageStatus: "sent",
      }),
      message: confirmedMessage,
    });
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({
        currentUserId: "100",
        config: {
          allowStrangerMessaging: true,
          preserveConversationAfterDelete: true,
          recallWindowMs: 180_000,
          separatorThresholdMs: 300_000,
          syncDraftAcrossDevices: false,
        },
        users: [],
        contacts: [],
        friendRequests: [],
        conversations: [conversation()],
        members: [],
      }),
      listMessages: vi.fn().mockResolvedValue({
        messages: [failedMessage],
        nextCursor: null,
        hasMore: false,
      }),
      resendMessage,
    };

    await renderStore();
    await act(async () => {
      await store?.loadMessages("91", { reset: true });
    });
    await act(async () => {
      await store?.resendMessage(failedMessage.id);
    });

    expect(resendMessage).toHaveBeenCalledWith(failedMessage.id);
    expect(failedMessage).toEqual(originalFailedMessage);
    expect(store?.messagesByConversation["91"]).toMatchObject([
      {
        content: "测试OK",
        status: "sent",
        ext: { richText },
      },
    ]);
  });

  it("tracks authoritative preview type and status in optimistic and delete summary updates", () => {
    const optimisticStart = storeSource.indexOf("async function sendMessage");
    const optimisticEnd = storeSource.indexOf("async function estimateTagMessageCampaign", optimisticStart);
    const optimisticSource = storeSource.slice(optimisticStart, optimisticEnd);
    const deleteStart = storeSource.indexOf("async function deleteMessage");
    const deleteEnd = storeSource.indexOf("async function forwardMessage", deleteStart);
    const deleteSource = storeSource.slice(deleteStart, deleteEnd);

    expect(optimisticSource).toContain("buildConversationLastMessageSummary(");
    expect(optimisticSource).toContain("optimistic,");
    expect(deleteSource).toContain("rebuildConversationMessageSummary(conversationId, latestMessage)");
  });
});

describe("formal IM contact card send state", () => {
  it("adds only the authoritative contact-card message and updates the conversation preview", async () => {
    const authoritativeMessage = message({
      id: "704",
      localId: "704",
      type: "contact-card",
      content: "山田花子",
      ext: {
        contactCard: {
          avatar: "/hanako.png",
          displayName: "山田花子",
          ekycVerified: true,
          entityKind: "customer",
          level: 12,
          needoId: "u0000000201",
          profileKind: "person",
          snapshotVersion: 2,
          userId: "u0000000201",
          userIdLabel: "u0000000201",
        },
      },
    });
    const sendContactCard = vi.fn<ImApi["sendContactCard"]>().mockResolvedValue({
      message: authoritativeMessage,
      replayed: false,
    });
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({
        currentUserId: "100",
        config: {},
        users: [],
        contacts: [],
        organizationContacts: [],
        friendRequests: [],
        conversations: [conversation({ lastMessagePreview: "原消息" })],
        members: [],
      }),
      listMessages: vi.fn().mockResolvedValue({ messages: [], nextCursor: null, hasMore: false }),
      sendContactCard,
    } as unknown as ImApi;
    mocked.session = {
      activePublicId: "u0000010401",
      avatarUrl: null,
      id: 10_401,
      primaryPublicId: "u0000010401",
      username: "contact-card-test",
    };

    await renderStore();
    const result = await store!.sendContactCard(
      "91",
      "u0000000201",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(sendContactCard).toHaveBeenCalledWith(
      "91",
      "u0000000201",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(result).toBe(authoritativeMessage);
    expect(store!.messagesByConversation["91"]).toEqual([authoritativeMessage]);
    expect(store!.conversations[0]).toMatchObject({
      lastMessageId: "704",
      lastMessagePreview: "[名片] 山田花子",
      lastMessageType: "contact-card",
      updatedAt: authoritativeMessage.sentAt,
    });
  });
});

describe("formal IM voice send state", () => {
  function renderStore(
    userId: number,
    sendVoiceMessage: ImApi["sendVoiceMessage"],
  ) {
    const existingMessage = message({ id: "699", localId: "699" });
    const api = {
      bootstrap: vi.fn().mockResolvedValue({
        currentUserId: "100",
        config: {},
        users: [],
        contacts: [],
        organizationContacts: [],
        friendRequests: [],
        conversations: [
          {
            id: "91",
            type: "single",
            title: "语音测试",
            avatar: "",
            memberIds: ["100", "201"],
            lastMessagePreview: "原消息",
            lastMessageTime: sentAt,
            unreadCount: 0,
            isPinned: false,
            isMuted: false,
            updatedAt: sentAt,
          },
        ],
        members: [],
      }),
      listMessages: vi.fn().mockResolvedValue({
        messages: [existingMessage],
        nextCursor: null,
        hasMore: false,
      }),
      sendVoiceMessage,
    } as unknown as ImApi;
    mocked.api = api;
    mocked.session = {
      id: userId,
      activePublicId: `u${String(userId).padStart(10, "0")}`,
      primaryPublicId: `u${String(userId).padStart(10, "0")}`,
      username: `voice-test-${userId}`,
      avatarUrl: null,
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    let latest: ReturnType<typeof useImStore> | undefined;

    function StoreHarness() {
      latest = useImStore("user");
      return null;
    }

    return {
      existingMessage,
      get latest() {
        if (!latest) {
          throw new Error("Store harness has not rendered");
        }

        return latest;
      },
      async mount() {
        await act(async () => {
          root.render(createElement(StoreHarness));
          await Promise.resolve();
        });
        await act(async () => {
          await latest!.loadMessages("91");
        });
      },
      async unmount() {
        await act(async () => root.unmount());
      },
    };
  }

  it("keeps loaded messages and the conversation preview unchanged when voice sending fails", async () => {
    const sendVoiceMessage = vi
      .fn<ImApi["sendVoiceMessage"]>()
      .mockRejectedValue(new Error("error.network.timeout"));
    const harness = renderStore(10_001, sendVoiceMessage);
    await harness.mount();
    const beforeMessages = harness.latest.messagesByConversation["91"];
    const beforeConversation = harness.latest.conversations[0];

    await expect(
      harness.latest.sendVoiceMessage(
        "91",
        new Blob(["voice"], { type: "audio/webm" }),
        { durationSeconds: 6, fileName: "voice.webm" },
      ),
    ).rejects.toThrow("error.network.timeout");

    expect(harness.latest.messagesByConversation["91"]).toBe(beforeMessages);
    expect(harness.latest.conversations[0]).toBe(beforeConversation);
    await harness.unmount();
  });

  it("adds the authoritative voice message once and returns it", async () => {
    const authoritativeMessage = message({
      id: "702",
      localId: "702",
      type: "voice",
      content: "语音",
    });
    const sendVoiceMessage = vi
      .fn<ImApi["sendVoiceMessage"]>()
      .mockResolvedValue({ message: authoritativeMessage });
    const harness = renderStore(10_002, sendVoiceMessage);
    await harness.mount();

    const result = await harness.latest.sendVoiceMessage(
      "91",
      new Blob(["voice"], { type: "audio/webm" }),
      { durationSeconds: 6, fileName: "voice.webm" },
    );

    expect(result).toBe(authoritativeMessage);
    expect(harness.latest.messagesByConversation["91"].filter((item) => item.id === "702")).toEqual([
      authoritativeMessage,
    ]);
    expect(harness.latest.conversations[0]).toMatchObject({
      lastMessagePreview: "音频",
      lastMessageTime: authoritativeMessage.sentAt,
      updatedAt: authoritativeMessage.sentAt,
    });
    await harness.unmount();
  });

  it("deduplicates an in-flight SSE voice message against the authoritative REST result", async () => {
    let resolveResponse: ((response: { message: ConversationMessage }) => void) | undefined;
    const response = new Promise<{ message: ConversationMessage }>((resolve) => {
      resolveResponse = resolve;
    });
    const authoritativeMessage = message({
      id: "703",
      localId: "703",
      type: "voice",
      content: "语音",
      sentAt: "2026-08-25T10:02:00.000Z",
    });
    const sendVoiceMessage = vi
      .fn<ImApi["sendVoiceMessage"]>()
      .mockReturnValue(response);
    const harness = renderStore(10_003, sendVoiceMessage);
    await harness.mount();

    const pending = harness.latest.sendVoiceMessage(
      "91",
      new Blob(["voice"], { type: "audio/webm" }),
      { durationSeconds: 6, fileName: "voice.webm" },
    );
    await expect.poll(() => sendVoiceMessage.mock.calls.length).toBe(1);

    await act(async () => {
      mocked.subscriptionListener?.({
        type: "message.created",
        message: authoritativeMessage,
      });
      await Promise.resolve();
    });
    expect(harness.latest.messagesByConversation["91"].filter((item) => item.id === "703")).toHaveLength(1);

    await act(async () => {
      resolveResponse?.({ message: authoritativeMessage });
      await pending;
    });

    await expect(pending).resolves.toBe(authoritativeMessage);
    expect(harness.latest.messagesByConversation["91"].filter((item) => item.id === "703")).toEqual([
      authoritativeMessage,
    ]);
    expect(harness.latest.conversations[0]).toMatchObject({
      lastMessagePreview: "音频",
      lastMessageTime: authoritativeMessage.sentAt,
      updatedAt: authoritativeMessage.sentAt,
    });
    await harness.unmount();
  });

  it("keeps the scoped Store factory internal to the module", () => {
    expect(storeSource).not.toContain("export function createScopedStore");
  });
});

describe("formal IM friend request derived state", () => {
  const requests = [
    {
      id: "1",
      fromUserId: "1",
      toUserId: "2",
      source: "formal_api",
      requestMessage: "",
      status: "pending" as const,
      createdAt: "2026-08-29T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "2",
      fromUserId: "1",
      toUserId: "2",
      source: "formal_api",
      requestMessage: "",
      status: "rejected" as const,
      createdAt: "2026-08-28T00:00:00.000Z",
      expiresAt: "2026-08-31T00:00:00.000Z",
    },
  ];

  it("counts only the latest unexpired incoming request for each counterpart", () => {
    expect(selectLatestFriendRequestsByCounterpart(requests, "2")).toEqual([requests[0]]);
    expect(
      getIncomingPendingFriendRequestCount(
        requests,
        "2",
        Date.parse("2026-08-30T00:00:00.000Z"),
      ),
    ).toBe(1);
  });
});

describe("formal IM forwarding", () => {
  it("copies a loaded media message into a new persisted send without mention metadata", () => {
    expect(
      getForwardableMessagePayload(
        {
          "91": [
            message({
              type: "image",
              content: "/media/im/source.jpg",
              ext: {
                url: "/media/im/source.jpg",
                fileName: "source.jpg",
                mentions: ["201"],
                mentionAll: true,
              },
            }),
          ],
        },
        "700",
      ),
    ).toEqual({
      type: "image",
      content: "/media/im/source.jpg",
      ext: {
        url: "/media/im/source.jpg",
        fileName: "source.jpg",
        mentions: undefined,
        mentionAll: undefined,
      },
    });
  });

  it("refuses to forward missing or recalled messages", () => {
    expect(() => getForwardableMessagePayload({}, "missing")).toThrow(
      "error.im.forward_source_unavailable",
    );
    expect(() =>
      getForwardableMessagePayload({ "91": [recalled] }, recalled.id),
    ).toThrow("error.im.forward_source_unavailable");
  });

  it("keeps the legacy payload helper out of the formal chat-record path", () => {
    const source = storeSource;
    const start = source.indexOf("async function forwardSelectedMessages");
    const end = source.indexOf("async function pinConversation", start);
    const forwardSource = source.slice(start, end);

    expect(forwardSource).toContain("api.createChatRecordDelivery");
    expect(forwardSource).not.toContain("getForwardableMessagePayload");
    expect(forwardSource).not.toContain("sendMessage(");
  });

  it("retains transient selection and the caller key on failure, then clears it on retry success", async () => {
    mocked.session = {
      activePublicId: "u0000000190",
      avatarUrl: null,
      id: 190,
      primaryPublicId: "u0000000190",
      username: "转发测试用户",
    };
    const createChatRecordDelivery = vi
      .fn()
      .mockRejectedValueOnce(new Error("error.im.delivery_failed"))
      .mockResolvedValueOnce({
        replayed: false,
        bundle: {
          publicId: "018f47c0-8b5e-7d9f-a831-112233445566",
          title: "木村",
          preview: "木村: 原消息",
          senderNames: ["木村"],
          senderCount: 1,
          itemCount: 1,
          createdAt: sentAt,
        },
        message: message({
          id: "901",
          localId: "901",
          type: "chat-record",
          content: "木村",
          ext: {
            chatRecord: {
              publicId: "018f47c0-8b5e-7d9f-a831-112233445566",
              preview: "木村: 原消息",
              senderNames: ["木村"],
              itemCount: 1,
              titleKind: "single",
            },
          },
        }),
      });
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({
        currentUserId: "100",
        config: {
          allowStrangerMessaging: true,
          preserveConversationAfterDelete: true,
          recallWindowMs: 180_000,
          separatorThresholdMs: 300_000,
          syncDraftAcrossDevices: false,
        },
        users: [],
        contacts: [],
        friendRequests: [],
        conversations: [conversation()],
        members: [],
      }),
      createChatRecordDelivery,
    };

    await renderStore();
    act(() => {
      store?.setPendingChatRecordForward({
        sourceConversationId: "91",
        messageIds: ["700", "701"],
      });
    });
    await expect(
      store?.forwardSelectedMessages("91", "stable-key"),
    ).rejects.toThrow("error.im.delivery_failed");
    expect(store?.pendingChatRecordForward).toEqual({
      sourceConversationId: "91",
      messageIds: ["700", "701"],
    });

    await act(async () => {
      await store?.forwardSelectedMessages("91", "stable-key");
    });
    expect(createChatRecordDelivery).toHaveBeenNthCalledWith(2, "91", {
      idempotencyKey: "stable-key",
      messageIds: ["700", "701"],
      sourceConversationId: "91",
    });
    expect(store?.pendingChatRecordForward).toBeNull();
    expect(store?.messagesByConversation["91"]).toEqual([
      expect.objectContaining({ id: "901", type: "chat-record" }),
    ]);
    expect(store?.conversations[0]).toMatchObject({ lastMessageId: "901", lastMessagePreview: "木村", lastMessageType: "chat-record" });
  });

  it("rebuilds the conversation summary after deleting the last loaded message", async () => {
    mocked.session = { activePublicId: "u0000000192", avatarUrl: null, id: 192, primaryPublicId: "u0000000192", username: "末尾删除测试" };
    const earlier = message({ id: "700", localId: "700", content: "earlier", sentAt });
    const latest = message({ id: "701", localId: "701", content: "latest", sentAt: "2026-08-25T10:01:00.000Z" });
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({ currentUserId: "100", config: { allowStrangerMessaging: true, preserveConversationAfterDelete: true, recallWindowMs: 180_000, separatorThresholdMs: 300_000, syncDraftAcrossDevices: false }, users: [], contacts: [], friendRequests: [], conversations: [conversation({ lastMessageId: "701", lastMessagePreview: "latest", lastMessageTime: latest.sentAt })], members: [] }),
      listMessages: vi.fn().mockResolvedValue({ messages: [earlier, latest], nextCursor: null, hasMore: false }),
      batchDeleteMessages: vi.fn().mockResolvedValue({ conversationId: "91", messageIds: ["701"], count: 1, deleted: true, replayed: false })
    };
    await renderStore();
    await act(async () => { await store?.loadMessages("91", { reset: true }); await store?.batchDeleteMessages("91", ["701"], "delete-last"); });
    expect(mocked.localCache.purgeMedia).toHaveBeenCalledWith("192", "91", "701");
    expect(store?.conversations[0]).toMatchObject({ lastMessageId: "700", lastMessagePreview: "earlier", lastMessageTime: sentAt });
  });

  it("does not report a confirmed batch delete as fully successful when local terminal cleanup fails", async () => {
    vi.useFakeTimers();
    mocked.session = { activePublicId: "u0000000196", avatarUrl: null, id: 196, primaryPublicId: "u0000000196", username: "测试用户" };
    mocked.localCache.purgeMedia.mockRejectedValue(new Error("IndexedDB failed"));
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({ currentUserId: "196", config: { allowStrangerMessaging: true, preserveConversationAfterDelete: true, recallWindowMs: 180_000, separatorThresholdMs: 300_000, syncDraftAcrossDevices: false }, users: [], contacts: [], friendRequests: [], conversations: [conversation()], members: [] }),
      listMessages: vi.fn().mockResolvedValue({ messages: [message()], nextCursor: null, hasMore: false }),
      batchDeleteMessages: vi.fn().mockResolvedValue({ conversationId: "91", messageIds: ["700"], count: 1, deleted: true, replayed: false }),
    };
    await renderStore();
    await act(async () => { await store?.loadMessages("91", { reset: true }); });

    await act(async () => {
      await expect(store?.batchDeleteMessages("91", ["700"], "delete-cache-failure"))
        .rejects.toThrow("error.im.local_cache_purge_failed");
    });
    expect(store?.messagesByConversation["91"]).toEqual([]);
    expect(store?.error).toBe("error.im.local_cache_purge_failed");
    expect(mocked.localCache.purgeMedia).toHaveBeenCalledTimes(3);

    mocked.localCache.purgeMedia.mockResolvedValue(undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(mocked.localCache.purgeMedia).toHaveBeenCalledTimes(4);
    expect(store?.error).toBeUndefined();
  });

  it("clears every last-message field after deleting all messages from a complete history without changing unread state", async () => {
    mocked.session = { activePublicId: "u0000000193", avatarUrl: null, id: 193, primaryPublicId: "u0000000193", username: "清空摘要测试" };
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({ currentUserId: "100", config: { allowStrangerMessaging: true, preserveConversationAfterDelete: true, recallWindowMs: 180_000, separatorThresholdMs: 300_000, syncDraftAcrossDevices: false }, users: [], contacts: [], friendRequests: [], conversations: [conversation({ lastMessageId: "700", lastMessagePreview: "原消息", lastMessageType: "text", lastMessageStatus: "sent", unreadCount: 4, mentionMe: true, mentionAll: true })], members: [] }),
      listMessages: vi.fn().mockResolvedValue({ messages: [message()], nextCursor: null, hasMore: false }),
      batchDeleteMessages: vi.fn().mockResolvedValue({ conversationId: "91", messageIds: ["700"], count: 1, deleted: true, replayed: false })
    };
    await renderStore();
    await act(async () => { await store?.loadMessages("91", { reset: true }); await store?.batchDeleteMessages("91", ["700"], "delete-all"); });
    expect(store?.conversations[0]).toMatchObject({ lastMessagePreview: "", unreadCount: 4, mentionMe: true, mentionAll: true });
    expect(store?.conversations[0].lastMessageId).toBeUndefined();
    expect(store?.conversations[0].lastMessageType).toBeUndefined();
    expect(store?.conversations[0].lastMessageStatus).toBeUndefined();
  });

  it("refreshes the authoritative conversation after deleting the last message from an incomplete history", async () => {
    mocked.session = { activePublicId: "u0000000194", avatarUrl: null, id: 194, primaryPublicId: "u0000000194", username: "部分历史刷新测试" };
    const earlier = message({ id: "700", localId: "700", content: "loaded older" });
    const latest = message({ id: "701", localId: "701", content: "latest", sentAt: "2026-08-25T10:01:00.000Z" });
    const authoritative = conversation({ lastMessageId: "700", lastMessagePreview: "server older", lastMessageTime: sentAt, unreadCount: 6, mentionMe: true });
    const getConversation = vi.fn().mockResolvedValue({ conversation: authoritative, members: [], users: [] });
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({ currentUserId: "100", config: { allowStrangerMessaging: true, preserveConversationAfterDelete: true, recallWindowMs: 180_000, separatorThresholdMs: 300_000, syncDraftAcrossDevices: false }, users: [], contacts: [], friendRequests: [], conversations: [conversation({ lastMessageId: "701", lastMessagePreview: "latest", lastMessageTime: latest.sentAt, unreadCount: 6, mentionMe: true })], members: [] }),
      listMessages: vi.fn().mockResolvedValue({ messages: [earlier, latest], nextCursor: "699", hasMore: true }),
      batchDeleteMessages: vi.fn().mockResolvedValue({ conversationId: "91", messageIds: ["701"], count: 1, deleted: true, replayed: false }),
      getConversation,
    };
    await renderStore();
    await act(async () => { await store?.loadMessages("91", { reset: true }); await store?.batchDeleteMessages("91", ["701"], "delete-partial-last"); });
    expect(getConversation).toHaveBeenCalledWith("91");
    expect(store?.messagesByConversation["91"]).toEqual([earlier]);
    expect(store?.conversations[0]).toMatchObject({ lastMessageId: "700", lastMessagePreview: "server older", unreadCount: 6, mentionMe: true });
  });

  it("keeps a successful delete and invalidates a partial summary when authoritative refresh fails", async () => {
    mocked.session = { activePublicId: "u0000000195", avatarUrl: null, id: 195, primaryPublicId: "u0000000195", username: "部分历史失效测试" };
    const latest = message({ id: "701", localId: "701", content: "deleted private body", sentAt: "2026-08-25T10:01:00.000Z" });
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({ currentUserId: "100", config: { allowStrangerMessaging: true, preserveConversationAfterDelete: true, recallWindowMs: 180_000, separatorThresholdMs: 300_000, syncDraftAcrossDevices: false }, users: [], contacts: [], friendRequests: [], conversations: [conversation({ lastMessageId: "701", lastMessagePreview: "deleted private body", lastMessageTime: latest.sentAt, unreadCount: 6, mentionMe: true, mentionAll: true })], members: [] }),
      listMessages: vi.fn().mockResolvedValue({ messages: [latest], nextCursor: "700", hasMore: true }),
      batchDeleteMessages: vi.fn().mockResolvedValue({ conversationId: "91", messageIds: ["701"], count: 1, deleted: true, replayed: false }),
      getConversation: vi.fn().mockRejectedValue(new Error("refresh failed")),
    };
    await renderStore();
    await act(async () => { await expect(store?.loadMessages("91", { reset: true })).resolves.toBeUndefined(); });
    await act(async () => { await expect(store?.batchDeleteMessages("91", ["701"], "delete-partial-failure")).resolves.toBeUndefined(); });
    expect(store?.messagesByConversation["91"]).toEqual([]);
    expect(store?.conversations[0]).toMatchObject({ lastMessagePreview: "", unreadCount: 6, mentionMe: true, mentionAll: true });
    expect(store?.conversations[0].lastMessageId).toBeUndefined();
    expect(store?.paginationByConversation["91"]).toMatchObject({ hasMore: true, loaded: false, loading: false, nextCursor: null });
  });

  it("does not remove messages optimistically when batch deletion fails", async () => {
    mocked.session = {
      activePublicId: "u0000000191",
      avatarUrl: null,
      id: 191,
      primaryPublicId: "u0000000191",
      username: "删除测试用户",
    };
    mocked.api = {
      bootstrap: vi.fn().mockResolvedValue({
        currentUserId: "100",
        config: {
          allowStrangerMessaging: true,
          preserveConversationAfterDelete: true,
          recallWindowMs: 180_000,
          separatorThresholdMs: 300_000,
          syncDraftAcrossDevices: false,
        },
        users: [],
        contacts: [],
        friendRequests: [],
        conversations: [conversation()],
        members: [],
      }),
      listMessages: vi.fn().mockResolvedValue({
        messages: [message()],
        nextCursor: null,
        hasMore: false,
      }),
      batchDeleteMessages: vi
        .fn()
        .mockRejectedValue(new Error("error.im.batch_failed")),
    };

    await renderStore();
    await act(async () => {
      await store?.loadMessages("91", { reset: true });
    });
    await expect(
      store?.batchDeleteMessages("91", ["700"], "delete-key"),
    ).rejects.toThrow("error.im.batch_failed");
    expect(store?.messagesByConversation["91"]).toEqual([
      expect.objectContaining({ id: "700" }),
    ]);
  });
});

describe("formal IM cached fuzzy search", () => {
  it("matches partial contact names and loaded message content without a server search", () => {
    const user = {
      id: "201",
      accountId: "u0000000167",
      nickname: "木村 颯大",
      avatar: "",
      status: "active" as const,
      sortKey: "木村 颯大",
      profileKind: "person" as const,
      roleType: "user" as const,
      searchableFields: ["木村 颯大", "u0000000167"],
      tags: [],
      userIdLabel: "u0000000167",
    };
    const contact = {
      id: "31",
      ownerUserId: "100",
      targetUserId: "201",
      relationStatus: "active" as const,
      source: "manual",
      isBlocked: false,
      isStarred: false,
      tags: [],
      createdAt: sentAt,
      updatedAt: sentAt,
    };
    const conversation = {
      id: "91",
      type: "single" as const,
      title: "木村 颯大",
      avatar: "",
      memberIds: ["100", "201"],
      contactUserId: "201",
      lastMessagePreview: "稍后确认",
      lastMessageAt: sentAt,
      lastMessageTime: sentAt,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      autoTranslateMessages: false,
      isDeleted: false,
      createdAt: sentAt,
      updatedAt: sentAt,
    };
    const snapshot = {
      currentUserId: "100",
      users: [user],
      contacts: [contact],
      conversations: [conversation],
      members: [],
      messagesByConversation: {
        "91": [message({ content: "木村已经确认时间" })],
      },
    };

    expect(buildCachedImSearchResults(snapshot, "木村")).toMatchObject({
      contacts: [{ targetUserId: "201" }],
      conversations: [{ id: "91" }],
      messages: [{ content: "木村已经确认时间" }],
    });
  });
});

describe("formal IM send failure reason", () => {
  it("keeps the recipient-blocked reason on the optimistic failed message", () => {
    expect(getMessageFailureReason(new Error("error.im.recipient_blocked"))).toBe("recipient_blocked");
    expect(getMessageFailureReason(new Error("error.im.not_friends"))).toBe("not_friends");
    expect(getMessageFailureReason(new Error("error.network.timeout"))).toBe("send_failed");
  });
});

describe("formal IM quick reactions", () => {
  it("does not let an older reaction snapshot remove a newer emoji", () => {
    const current = {
      ...message({
        reactions: [
          { emoji: "OK", people: [{ id: "100", name: "当前用户" }] },
          { emoji: "😂", people: [{ id: "100", name: "当前用户" }] }
        ]
      }),
      reactionVersion: 2
    } as ConversationMessage;
    const stale = {
      ...message({
        reactions: [
          { emoji: "OK", people: [{ id: "100", name: "当前用户" }] }
        ]
      }),
      reactionVersion: 1
    } as ConversationMessage;

    expect(preferTerminalMessage(current, stale)).toBe(current);
  });

  it("upserts the authoritative reaction response into the shared message store", () => {
    const source = storeSource;
    const start = source.indexOf("async function setMessageReaction");
    const end = source.indexOf("async function recallMessage", start);
    const reactionSource = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(reactionSource).toContain("await api.setMessageReaction");
    expect(reactionSource).toContain("upsertMessage(response.message)");
    expect(source).toContain("setMessageReaction,");
  });
});
