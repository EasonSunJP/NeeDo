import { afterEach, describe, expect, it, vi } from "vitest";
import { backofficeRealDataApi } from "../../api/backofficeRealData";
import { httpClient } from "../../api/httpClient";
import { realtimeApi } from "../realtime/api";
import {
  createFormalImApi,
  shouldForwardFormalImEvent,
  toFormalImStoreUpdate,
} from "./formal-api";

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

  it("maps rich formal last messages to safe conversation previews", async () => {
    const participants = [
      {
        userId: 100,
        needoId: "u0000000100",
        username: "测试用户",
        avatarUrl: null,
      },
      {
        userId: 201,
        needoId: "u0000000201",
        username: "文件发送者",
        avatarUrl: null,
      },
    ];
    const richConversation = (
      id: number,
      needoMessageType: "image" | "voice" | "video" | "file",
      fileName?: string,
    ) => {
      const url = `http://localhost:3000/media/im/opaque-${id}`;
      return {
        id,
        type: "direct" as const,
        title: null,
        participants,
        lastMessage: {
          id: id * 10,
          conversationId: id,
          senderUserId: 201,
          type: "text" as const,
          content: url,
          metadata: {
            needoMessageType,
            needoMessageExt: { fileName, url },
          },
          createdAt: now,
        },
        unreadCount: 0,
        createdAt: now,
        updatedAt: now,
      };
    };

    vi.spyOn(realtimeApi, "listConversations").mockResolvedValue({
      list: [
        richConversation(91, "image", "album.png"),
        richConversation(92, "voice", "voice.webm"),
        richConversation(93, "video", "movie.mp4"),
        richConversation(94, "file", "报价单.pdf"),
      ],
      total: 4,
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

    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "测试用户",
        avatarUrl: null,
      },
      scope: "user",
    });
    const bootstrap = await api.bootstrap();
    const previews = Object.fromEntries(
      bootstrap.conversations.map((conversation) => [
        conversation.id,
        conversation.lastMessagePreview,
      ]),
    );

    expect(previews).toEqual({
      "91": "图片",
      "92": "音频",
      "93": "视频",
      "94": "报价单.pdf",
    });
    expect(Object.values(previews).join(" ")).not.toContain("/media/im/");
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

  it("hard-deletes an owned formal friendship through the persisted API", async () => {
    const request = vi.spyOn(httpClient, "request").mockResolvedValue({
      actorUserId: 100,
      counterpartUserId: 201,
      contactIds: [31, 32],
      deletedContactCount: 2,
      deletedFollowCount: 2,
      deletedConversationId: 91,
      deleted: true,
      deletedAt: now,
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

    await expect(api.deleteContact("31")).resolves.toEqual({
      contactId: "31",
      counterpartUserId: "201",
      deletedConversationId: "91",
    });
    expect(request).toHaveBeenCalledWith("/im/contacts/31", {
      method: "DELETE",
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
      list: [
        {
          id: 41,
          ownerUserId: 16,
          contactUserId: 201,
          contactUser: {
            userId: 201,
            needoId: "u0000000201",
            username: "legacy-contact-name",
            avatarUrl: null,
          },
          nickname: null,
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
    expect(bootstrap.contacts).toHaveLength(1);
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

  it("keeps a persisted send successful without a follow-up conversation refresh", async () => {
    vi.spyOn(realtimeApi, "createMessage").mockResolvedValue({
      id: 701,
      conversationId: 91,
      senderUserId: 100,
      type: "text",
      content: "只以创建结果确认发送。",
      metadata: { needoMessageType: "text" },
      createdAt: now,
    });
    const listConversations = vi
      .spyOn(realtimeApi, "listConversations")
      .mockRejectedValue(new Error("error.network.timeout"));
    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "sim-customer-100",
        avatarUrl: null,
      },
      scope: "user",
    });

    await expect(
      api.sendMessage("text", {
        conversationId: "91",
        content: "只以创建结果确认发送。",
      }),
    ).resolves.toMatchObject({
      message: {
        id: "701",
        conversationId: "91",
        senderId: "100",
        status: "sent",
      },
    });
    expect(listConversations).not.toHaveBeenCalled();
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

  it("maps message.created SSE payloads directly so an open chat updates without refresh", () => {
    expect(
      toFormalImStoreUpdate({
        id: "evt-created-1",
        type: "message.created",
        payload: {
          id: 701,
          conversationId: 91,
          senderUserId: 201,
          type: "text",
          content: "即时到达的信息",
          metadata: null,
          reactions: [],
          createdAt: now,
        },
      }),
    ).toMatchObject({
      type: "message.created",
      message: {
        id: "701",
        conversationId: "91",
        content: "即时到达的信息",
      },
    });
  });

  it("turns a connected event into one bounded catch-up refresh", () => {
    expect(
      toFormalImStoreUpdate({
        id: "evt-connected-1",
        type: "connected",
        payload: { userId: 100 },
      }),
    ).toEqual({ type: "refresh" });
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

  it("discovers add-friend candidates by fuzzy name or immutable NeeDoID", async () => {
    const searchDirectory = vi.spyOn(realtimeApi, "searchDirectory").mockResolvedValue({
      list: [
        {
          userId: 201,
          needoId: "u0000000167",
          username: "小松 美咲",
          avatarUrl: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
    });
    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "测试用户",
        avatarUrl: null,
      },
      scope: "user",
    });

    await expect(api.searchDirectory("小松")).resolves.toEqual({
      users: [expect.objectContaining({ id: "201", nickname: "小松 美咲", userIdLabel: "u0000000167" })],
    });
    await expect(api.searchDirectory("u0000000167")).resolves.toEqual({
      users: [expect.objectContaining({ id: "201", nickname: "小松 美咲", userIdLabel: "u0000000167" })],
    });
    expect(searchDirectory).toHaveBeenCalledTimes(2);
  });

  it("loads a directory profile and sends a verified friend request", async () => {
    const target = {
        userId: 201,
        needoId: "u0000000167",
        username: "小松 美咲",
        avatarUrl: null,
    };
    const friendRequest = {
      id: 51,
      requesterUserId: 100,
      targetUserId: 201,
      requester: { userId: 100, needoId: "u0000000100", username: "测试用户", avatarUrl: null },
      target,
      status: "pending" as const,
      message: null,
      respondedAt: null,
      expiresAt: "2026-08-28T10:00:00.000Z",
      expiredAt: null,
      createdAt: now,
    };
    const getDirectoryProfile = vi.spyOn(realtimeApi, "getDirectoryProfile").mockResolvedValue({
      user: target,
      relationship: "none",
      contactId: null,
      friendRequest: null,
    });
    const createFriendRequest = vi.spyOn(realtimeApi, "createFriendRequest").mockResolvedValue({
      friendRequest,
      created: true,
    });
    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "测试用户",
        avatarUrl: null,
      },
      scope: "user",
    });

    await expect(api.getDirectoryProfile("201")).resolves.toEqual({
      user: expect.objectContaining({ id: "201", nickname: "小松 美咲" }),
      relationship: "none",
    });
    await expect(api.sendFriendRequest("201")).resolves.toMatchObject({
      friendRequest: { id: "51", expiresAt: friendRequest.expiresAt },
      created: true,
    });
    expect(getDirectoryProfile).toHaveBeenCalledWith(201);
    expect(createFriendRequest).toHaveBeenCalledWith({ targetUserId: 201 });
  });

  it("uploads a selected image instead of invoking the unavailable placeholder", async () => {
    const upload = vi.spyOn(realtimeApi, "uploadConversationImage").mockResolvedValue({
      fileName: "album.png",
      fileSize: 8,
      mimeType: "image/png",
      url: "http://127.0.0.1:3000/media/im/opaque.png",
    });
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "album.png", {
      type: "image/png",
    });
    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "测试用户",
        avatarUrl: null,
      },
      scope: "user",
    });

    await expect(api.uploadImage("91", file)).resolves.toMatchObject({
      fileName: "album.png",
      mimeType: "image/png",
      url: expect.stringContaining("/media/im/"),
    });
    expect(upload).toHaveBeenCalledWith(91, file);
  });

  it("persists group privacy and leave operations through formal realtime endpoints", async () => {
    const conversation = {
      id: 91,
      type: "group" as const,
      title: "隐私测试群",
      participants: [
        { userId: 100, needoId: "u0000000100", username: "群主", avatarUrl: null, role: "owner" as const },
        { userId: 201, needoId: "u0000000201", username: "成员", avatarUrl: null, role: "member" as const },
      ],
      lastMessage: null,
      unreadCount: 0,
      privacyModeEnabled: true,
      hideMemberProfiles: true,
      disappearingTtlSeconds: 3_600,
      disappearingStartMode: "sent" as const,
      createdAt: now,
      updatedAt: now,
    };
    const updateConversationPrivacy = vi
      .spyOn(realtimeApi, "updateConversationPrivacy")
      .mockResolvedValue(conversation);
    const leaveConversation = vi
      .spyOn(realtimeApi, "leaveConversation")
      .mockResolvedValue({ conversationId: 91, removedUserId: 100, newOwnerUserId: 201, dissolved: false });
    const dissolveConversation = vi
      .spyOn(realtimeApi, "dissolveConversation")
      .mockResolvedValue({ conversationId: 91, removedUserId: 100, newOwnerUserId: null, dissolved: true });
    const api = createFormalImApi({
      currentUser: { id: 100, needoId: "u0000000100", username: "群主", avatarUrl: null },
      scope: "user",
    });

    await expect(
      api.updateConversationPrivacy("91", {
        privacyModeEnabled: true,
        hideMemberProfiles: true,
        disappearingCountdown: { months: 0, days: 0, hours: 1, minutes: 0 },
        disappearingStartMode: "sent",
      }),
    ).resolves.toMatchObject({
      conversation: {
        id: "91",
        privacyModeEnabled: true,
        hideMemberProfiles: true,
        disappearingCountdown: { months: 0, days: 0, hours: 1, minutes: 0 },
        disappearingStartMode: "sent",
      },
    });
    await expect(api.removeConversationMember("91", "100", "201")).resolves.toEqual({
      conversationId: "91",
      removedUserId: "100",
      dissolved: false,
    });
    await expect(api.dissolveConversation("91")).resolves.toEqual({
      conversationId: "91",
      dissolved: true,
    });

    expect(updateConversationPrivacy).toHaveBeenCalledWith(91, {
      privacyModeEnabled: true,
      hideMemberProfiles: true,
      disappearingTtlSeconds: 3_600,
      disappearingStartMode: "sent",
    });
    expect(leaveConversation).toHaveBeenCalledWith(91, 201);
    expect(dissolveConversation).toHaveBeenCalledWith(91);
  });

  it("persists a participant-only irreversible message clear through the formal endpoint", async () => {
    const conversation = {
      id: 91,
      type: "direct" as const,
      title: null,
      participants: [
        { userId: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null, role: "member" as const },
        { userId: 201, needoId: "u0000000201", username: "对方", avatarUrl: null, role: "member" as const },
      ],
      lastMessage: null,
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const clearConversationMessages = vi
      .spyOn(realtimeApi, "clearConversationMessages")
      .mockResolvedValue(conversation);
    const api = createFormalImApi({
      currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null },
      scope: "user",
    });

    await expect(api.clearConversation("91")).resolves.toMatchObject({
      conversation: { id: "91", lastMessageId: undefined },
    });
    expect(clearConversationMessages).toHaveBeenCalledWith(91);
  });

  it("persists one viewer-only message deletion through the formal endpoint", async () => {
    const deleteMessageForMe = vi
      .spyOn(realtimeApi, "deleteMessageForMe")
      .mockResolvedValue({ conversationId: 91, messageId: 501, deleted: true });
    const api = createFormalImApi({
      currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null },
      scope: "user",
    });

    await expect(api.deleteMessage("91", "501")).resolves.toEqual({
      conversationId: "91",
      messageId: "501",
      deleted: true,
    });
    expect(deleteMessageForMe).toHaveBeenCalledWith(91, 501);
  });

  it("does not turn a harmless SSE connected event into a three-request bootstrap refresh", () => {
    expect(shouldForwardFormalImEvent({ id: "1", payload: {}, type: "connected" })).toBe(false);
    const reactionEvent = {
      id: "2",
      payload: {
        id: 501,
        conversationId: 91,
        senderUserId: 201,
        type: "text" as const,
        content: "ok",
        metadata: null,
        createdAt: now,
      },
      type: "message.reaction.updated",
    };
    expect(shouldForwardFormalImEvent(reactionEvent)).toBe(true);
    expect(shouldForwardFormalImEvent({ id: "3", payload: {}, type: "friendship.deleted" })).toBe(true);
    expect(toFormalImStoreUpdate(reactionEvent)).toMatchObject({
      type: "message.updated",
      message: { id: "501" },
    });
  });
});
