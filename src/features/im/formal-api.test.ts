import { afterEach, describe, expect, it, vi } from "vitest";
import { backofficeRealDataApi } from "../../api/backofficeRealData";
import { httpClient } from "../../api/httpClient";
import { realtimeApi } from "../realtime/api";
import { createFormalImApi, toFormalImStoreUpdate } from "./formal-api";

const now = "2026-08-25T10:00:00.000Z";

describe("formal IM adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps real conversations and reciprocal contacts into the original IM model", async () => {
    vi.spyOn(realtimeApi, "listConversations").mockResolvedValue({
      list: [
        {
          id: 91,
          type: "direct",
          title: null,
          participants: [
            {
              userId: 100,
              needoId: "u0000000100",
              username: "sim-customer-100",
              avatarUrl: null,
            },
            {
              userId: 201,
              needoId: "u0000000201",
              username: "sim-technician-001",
              avatarUrl: "/avatars/tech-1.png",
            },
          ],
          lastMessage: {
            id: 501,
            conversationId: 91,
            senderUserId: 201,
            type: "text",
            content: "明天下午三点可以为您服务。",
            metadata: null,
            createdAt: now,
          },
          unreadCount: 2,
          createdAt: now,
          updatedAt: now,
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });
    vi.spyOn(realtimeApi, "listContacts").mockResolvedValue({
      list: [
        {
          id: 31,
          ownerUserId: 100,
          contactUserId: 201,
          contactUser: {
            userId: 201,
            needoId: "u0000000201",
            username: "sim-technician-001",
            avatarUrl: "/avatars/tech-1.png",
          },
          nickname: "小林技师",
          source: "simulation_seed",
          isBlocked: false,
          createdAt: now,
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });
    vi.spyOn(realtimeApi, "listFriendRequests").mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 100,
    });

    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "sim-customer-100",
        avatarUrl: null,
      },
      scope: "user",
    });
    const bootstrap = await api.bootstrap();

    expect(bootstrap.currentUserId).toBe("100");
    expect(bootstrap.conversations[0]).toMatchObject({
      id: "91",
      type: "single",
      contactUserId: "201",
      title: "sim-technician-001",
      lastMessagePreview: "明天下午三点可以为您服务。",
      unreadCount: 2,
    });
    expect(bootstrap.contacts[0]).toMatchObject({
      id: "31",
      ownerUserId: "100",
      targetUserId: "201",
      remarkName: "小林技师",
      relationStatus: "active",
    });
    expect(bootstrap.users.find((user) => user.id === "201")).toMatchObject({
      accountId: "u0000000201",
      nickname: "sim-technician-001",
      profileKind: "technician",
      avatar: "/avatars/tech-1.png",
      userIdLabel: "u0000000201",
    });
    expect(bootstrap.users.find((user) => user.id === "100")?.avatar).toMatch(
      /^data:image\/svg\+xml/,
    );
  });

  it("maps a persisted formal contact block response into the original IM model", async () => {
    const request = vi.spyOn(httpClient, "request").mockResolvedValue({
      id: 31,
      ownerUserId: 100,
      contactUserId: 201,
      contactUser: {
        userId: 201,
        needoId: "n0000000201",
        username: "sim-technician-001",
        avatarUrl: "/avatars/tech-1.png",
      },
      nickname: "小林技师",
      source: "simulation_seed",
      isBlocked: true,
      createdAt: now,
    });
    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "n0000000100",
        username: "sim-customer-100",
        avatarUrl: null,
      },
      scope: "user",
    });

    await expect(api.blockContact("31")).resolves.toEqual({
      contact: expect.objectContaining({ id: "31", isBlocked: true }),
    });
    expect(request).toHaveBeenCalledWith("/im/contacts/31/block", {
      method: "POST",
    });
  });

  it("loads published merchant technicians as real organization members", async () => {
    vi.spyOn(realtimeApi, "listConversations").mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 100,
    });
    vi.spyOn(realtimeApi, "listContacts").mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 100,
    });
    vi.spyOn(realtimeApi, "listFriendRequests").mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 100,
    });
    const listTechnicians = vi
      .spyOn(backofficeRealDataApi, "technicians")
      .mockResolvedValue({
        list: [
          {
            id: 31,
            userId: 201,
            needoId: "u0000000201",
            displayName: "佐藤 美咲",
            email: "sim.technician.001@needo.local",
            avatarUrl: "/images/generated/profiles/ai-profile-01.jpg",
            shopId: 16,
            shopName: "Tokyo Relax Shibuya",
            city: "Tokyo",
            serviceArea: "Shibuya",
            employmentType: "full_time",
            employmentStartedAt: "2026-07-01T00:00:00.000Z",
            status: "published",
            verifiedAt: now,
            createdAt: now,
          },
          {
            id: 32,
            userId: 202,
            needoId: "n0000000202",
            displayName: "吉田 拓海",
            email: "sim.technician.011@needo.local",
            avatarUrl: "/images/generated/profiles/ai-profile-11.jpg",
            shopId: 16,
            shopName: "Tokyo Relax Shibuya",
            city: "Tokyo",
            serviceArea: "Shibuya",
            employmentType: "temporary",
            employmentStartedAt: "2026-07-01T00:00:00.000Z",
            status: "published",
            verifiedAt: now,
            createdAt: now,
          },
        ],
        total: 2,
        page: 1,
        page_size: 100,
      });

    const api = createFormalImApi({
      currentUser: {
        id: 16,
        needoId: "u0000000016",
        username: "sim.shop.001@needo.local",
        avatarUrl: null,
      },
      scope: "merchant",
    });
    const bootstrap = await api.bootstrap();

    expect(listTechnicians).toHaveBeenCalledWith("merchant-admin", {
      page: 1,
      pageSize: 100,
      status: "published",
    });
    expect(bootstrap.contacts).toEqual([]);
    expect(bootstrap.organizationContacts).toEqual([
      expect.objectContaining({
        targetUserId: "201",
        source: "merchant_technician_profile",
        tags: ["员工", "正社员", "技师"],
      }),
      expect.objectContaining({
        targetUserId: "202",
        source: "merchant_technician_profile",
        tags: ["员工", "临时工", "技师"],
      }),
    ]);
    expect(bootstrap.users.find((user) => user.id === "201")).toMatchObject({
      accountId: "u0000000201",
      nickname: "佐藤 美咲",
      avatar: "/images/generated/profiles/ai-profile-01.jpg",
      entityType: "technician",
      entityId: "tech-31",
      userIdLabel: "u0000000201",
    });
    expect(bootstrap.users.find((user) => user.id === "202")).toMatchObject({
      accountId: "n0000000202",
      nickname: "吉田 拓海",
      tags: ["员工", "临时工", "技师"],
    });
  });

  it("persists rich text messages through the formal message endpoint", async () => {
    const createMessage = vi
      .spyOn(realtimeApi, "createMessage")
      .mockResolvedValue({
        id: 700,
        conversationId: 91,
        senderUserId: 100,
        type: "text",
        content: "已经确认，感谢。",
        metadata: { needoMessageType: "text" },
        createdAt: now,
      });
    vi.spyOn(realtimeApi, "listConversations").mockResolvedValue({
      list: [
        {
          id: 91,
          type: "direct",
          title: null,
          participants: [
            {
              userId: 100,
              needoId: "u0000000100",
              username: "sim-customer-100",
              avatarUrl: null,
            },
            {
              userId: 201,
              needoId: "u0000000201",
              username: "sim-technician-001",
              avatarUrl: null,
            },
          ],
          lastMessage: null,
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });

    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "sim-customer-100",
        avatarUrl: null,
      },
      scope: "user",
    });
    const result = await api.sendMessage("text", {
      conversationId: "91",
      content: "已经确认，感谢。",
    });

    expect(createMessage).toHaveBeenCalledWith(91, {
      content: "已经确认，感谢。",
      metadata: {
        needoMessageType: "text",
      },
      type: "text",
    });
    expect(result.message).toMatchObject({
      id: "700",
      conversationId: "91",
      senderId: "100",
      status: "sent",
    });
  });

  it("persists message reactions through the formal API and maps the saved people", async () => {
    const setMessageReaction = vi
      .spyOn(realtimeApi, "setMessageReaction")
      .mockResolvedValue({
        id: 700,
        conversationId: 91,
        senderUserId: 201,
        type: "text",
        content: "承知しました。",
        metadata: null,
        reactions: [
          {
            emoji: "😂",
            reactedByMe: true,
            people: [
              {
                userId: 100,
                username: "sim-customer-100",
                avatarUrl: "/avatars/customer-100.png",
              },
            ],
          },
        ],
        createdAt: now,
      });

    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "sim-customer-100",
        avatarUrl: "/avatars/customer-100.png",
      },
      scope: "user",
    });
    const result = await api.setMessageReaction("91", "700", "😂", true);

    expect(setMessageReaction).toHaveBeenCalledWith(91, 700, "😂");
    expect(result.message.reactions).toEqual([
      {
        emoji: "😂",
        reactedByMe: true,
        people: [
          {
            id: "100",
            name: "sim-customer-100",
            avatar: "/avatars/customer-100.png",
          },
        ],
      },
    ]);
  });

  it("maps a confirmed standard recall to a content-free terminal message", async () => {
    const recallMessage = vi.spyOn(realtimeApi, "recallMessage").mockResolvedValue({
      action: "standard_recall",
      conversationId: 91,
      messageId: 700,
      message: {
        id: 700,
        conversationId: 91,
        senderUserId: 100,
        type: "text",
        content: "明文不得从撤回响应重新进入状态",
        metadata: { needoMessageType: "text" },
        reactions: [],
        recallDeadlineAt: "2026-08-25T10:03:00.000Z",
        recalledAt: "2026-08-25T10:01:00.000Z",
        recallMode: "standard",
        contentPurgedAt: "2026-08-25T10:01:00.000Z",
        lifecycleVersion: 2,
        availableRecallModes: [],
        createdAt: now,
      },
    });
    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "n0000000100",
        username: "sim-customer-100",
        avatarUrl: null,
      },
      scope: "user",
    });

    await expect(api.recallMessage("91", "700", "standard")).resolves.toMatchObject({
      conversationId: "91",
      messageId: "700",
      mode: "standard",
      message: {
        id: "700",
        type: "recalled",
        content: "",
        status: "recalled",
        serverState: "recalled",
        availableRecallModes: [],
      },
    });
    expect(recallMessage).toHaveBeenCalledWith(91, 700, "standard");
  });

  it("rejects a recall response that does not contain a terminal tombstone", async () => {
    vi.spyOn(realtimeApi, "recallMessage").mockResolvedValue({
      action: "standard_recall",
      conversationId: 91,
      messageId: 700,
      message: {
        id: 700,
        conversationId: 91,
        senderUserId: 100,
        type: "text",
        content: "still active",
        metadata: null,
        reactions: [],
        recallDeadlineAt: "2026-08-25T10:03:00.000Z",
        recalledAt: null,
        recallMode: null,
        contentPurgedAt: null,
        lifecycleVersion: 1,
        availableRecallModes: ["standard"],
        createdAt: now,
      },
    });
    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "n0000000100",
        username: "sim-customer-100",
        avatarUrl: null,
      },
      scope: "user",
    });

    await expect(api.recallMessage("91", "700", "standard")).rejects.toThrow(
      "error.response.invalid_recall_result",
    );
  });

  it("maps message.recalled SSE payloads to the same content-free terminal shape", () => {
    expect(
      toFormalImStoreUpdate({
        id: "evt-1",
        type: "message.recalled",
        payload: {
          id: 700,
          conversationId: 91,
          senderUserId: 100,
          type: "text",
          content: "stale transport plaintext",
          metadata: null,
          reactions: [],
          recallDeadlineAt: "2026-08-25T10:03:00.000Z",
          recalledAt: "2026-08-25T10:01:00.000Z",
          recallMode: "standard",
          contentPurgedAt: "2026-08-25T10:01:00.000Z",
          lifecycleVersion: 2,
          availableRecallModes: [],
          createdAt: now,
        },
      }),
    ).toMatchObject({
      type: "message.recalled",
      message: {
        id: "700",
        type: "recalled",
        content: "",
        serverState: "recalled",
      },
    });
  });

  it("persists conversation pin, mute, unread, and personal deletion state", async () => {
    const conversation = {
      id: 91,
      type: "direct" as const,
      title: null,
      participants: [
        {
          userId: 100,
          needoId: "u0000000100",
          username: "sim-customer-100",
          avatarUrl: null,
        },
        {
          userId: 201,
          needoId: "u0000000201",
          username: "sim-technician-001",
          avatarUrl: null,
        },
      ],
      lastMessage: null,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      isHidden: false,
      createdAt: now,
      updatedAt: now,
    };
    const updateConversationPreferences = vi.fn(
      async (_conversationId: number, preferences: { isMuted?: boolean; isPinned?: boolean }) => ({
        ...conversation,
        ...preferences,
      }),
    );
    const markConversationUnread = vi.fn(async () => ({
      ...conversation,
      unreadCount: 1,
    }));
    const deleteConversation = vi.fn(async () => ({
      ...conversation,
      isHidden: true,
    }));
    Object.assign(realtimeApi, {
      updateConversationPreferences,
      markConversationUnread,
      deleteConversation,
    });

    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "sim-customer-100",
        avatarUrl: null,
      },
      scope: "user",
    });

    await expect(api.pinConversation("91", true)).resolves.toMatchObject({
      conversation: { id: "91", isPinned: true },
    });
    await expect(api.muteConversation("91", true)).resolves.toMatchObject({
      conversation: { id: "91", isMuted: true },
    });
    await expect(api.markConversationRead("91", true)).resolves.toMatchObject({
      conversation: { id: "91", unreadCount: 1 },
    });
    await expect(api.deleteConversation("91")).resolves.toMatchObject({
      conversation: { id: "91", isDeleted: true },
    });

    expect(updateConversationPreferences).toHaveBeenNthCalledWith(1, 91, { isPinned: true });
    expect(updateConversationPreferences).toHaveBeenNthCalledWith(2, 91, { isMuted: true });
    expect(markConversationUnread).toHaveBeenCalledWith(91);
    expect(deleteConversation).toHaveBeenCalledWith(91);
  });
});
