import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "./model";
import {
  buildCachedImSearchResults,
  getMessageFailureReason,
  getForwardableMessagePayload,
  mergeConversationMessageHistory,
  preferTerminalMessage,
  upsertConversationMessage,
} from "./store";

const sentAt = "2026-08-25T10:00:00.000Z";

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
    const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    expect(source).toContain(
      'async function recallMessage(conversationId: string, messageId: string, mode: "standard")',
    );
    expect(source).toContain(
      "const response = await api.recallMessage(conversationId, messageId, mode);",
    );
    expect(source).toContain("upsertMessage(response.message);");
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
    const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
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
    const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    const start = source.indexOf("async function setMessageReaction");
    const end = source.indexOf("async function recallMessage", start);
    const reactionSource = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(reactionSource).toContain("await api.setMessageReaction");
    expect(reactionSource).toContain("upsertMessage(response.message)");
    expect(source).toContain("setMessageReaction,");
  });
});
