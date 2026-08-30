// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import {
  buildCachedImSearchResults,
  getIncomingPendingFriendRequestCount,
  getMessageFailureReason,
  getForwardableMessagePayload,
  mergeConversationMessageHistory,
  preferTerminalMessage,
  selectLatestFriendRequestsByCounterpart,
  upsertConversationMessage,
  useImStore,
} from "./store";

const sentAt = "2026-08-25T10:00:00.000Z";

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
  window.localStorage.clear();
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
          lastMessagePreviewProvenance: "user-text",
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
      lastMessagePreviewProvenance: "ui-label",
    });
    expect(store?.conversations[0].lastMessagePreviewDynamicValue).toBeUndefined();
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
        lastMessagePreviewProvenance: "user-text",
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
      lastMessagePreviewProvenance: "ui-label",
    });
    expect(store?.conversations[0].lastMessagePreviewDynamicValue).toBeUndefined();
    expect(bootstrap).toHaveBeenCalledTimes(1);
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
        lastMessagePreviewProvenance: "user-text",
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
    expect(deleteSource).toContain("buildConversationLastMessageSummary(");
    expect(deleteSource).toContain("latestMessage,");
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

  it("uses the normal formal send path instead of the unavailable forward stub", () => {
    const source = storeSource;
    const start = source.indexOf("async function forwardMessage");
    const end = source.indexOf("async function pinConversation", start);
    const forwardSource = source.slice(start, end);

    expect(forwardSource).toContain("getForwardableMessagePayload");
    expect(forwardSource).toContain("return sendMessage(");
    expect(forwardSource).not.toContain("api.forwardMessage");
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
