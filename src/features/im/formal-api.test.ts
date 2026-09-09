import { afterEach, describe, expect, it, vi } from "vitest";
import { backofficeRealDataApi } from "../../api/backofficeRealData";
import { httpClient } from "../../api/httpClient";
import { realtimeApi } from "../realtime/api";
import realtimeApiSource from "../realtime/api.ts?raw";
import {
  createFormalImApi,
  shouldForwardFormalImEvent,
  toFormalImStoreUpdate,
} from "./formal-api";
import imModelSource from "./model.ts?raw";

const now = "2026-08-25T10:00:00.000Z";

function chatRecordDeliveryMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 801,
    conversationId: 91,
    senderUserId: 100,
    type: "text" as const,
    content: "A",
    metadata: null,
    reactions: [],
    expiresAt: null,
    recallDeadlineAt: "2026-08-25T10:03:00.000Z",
    recalledAt: null,
    recallMode: null,
    contentPurgedAt: null,
    privacyPolicyVersionAtSend: null,
    lifecycleVersion: 1,
    reactionVersion: 0,
    availableRecallModes: ["standard" as const],
    createdAt: now,
    ...overrides,
  };
}

function chatRecordItem(position: number, overrides: Record<string, unknown> = {}) {
  return {
    id: 900 + position,
    position,
    senderDisplayName: "A",
    senderAvatarUrl: null,
    messageType: "text",
    content: `item-${position}`,
    metadata: null,
    sentAt: now,
    ...overrides,
  };
}

describe("formal IM adapter", () => {
  it("does not accept a sender-supplied media expiry flag as server state", () => {
    const result = toFormalImStoreUpdate({
      id: "media-state-untrusted", type: "message.created",
      payload: {
        id: 700, conversationId: 91, senderUserId: 100, type: "text", content: "/media/im/a.jpg", createdAt: now,
        metadata: { needoMessageType: "image", needoMessageExt: { mediaState: "expired", caption: "keep caption" } }
      }
    });
    expect(result).toMatchObject({ type: "message.created", message: { type: "image", ext: { caption: "keep caption" } } });
    if (result?.type === "message.created") expect(result.message.ext?.mediaState).toBeUndefined();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declares self in both formal directory profile contracts", () => {
    const relationshipContract =
      /relationship:\s*(?:\|\s*)?"none"\s*\|\s*"friend"\s*\|\s*"incoming_pending"\s*\|\s*"outgoing_pending"\s*\|\s*"self";/u;

    expect(realtimeApiSource).toMatch(relationshipContract);
    expect(imModelSource).toMatch(relationshipContract);
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
          ownerIdentityId: 1100,
          contactUserId: 201,
          contactIdentityId: 1201,
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
      lastMessageType: "text",
      lastMessageStatus: "sent",
      unreadCount: 2,
      autoTranslateMessages: false,
    });
    expect(bootstrap.contacts[0]).toMatchObject({
      id: "31",
      ownerUserId: "100",
      targetUserId: "201",
      contactIdentityId: "1201",
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

  it("keeps a deleted friendship peer as the title of the retained direct history", async () => {
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
              username: "保留历史的一方",
              avatarUrl: null,
            },
          ],
          directPeer: {
            userId: 201,
            needoId: "u0000000201",
            username: "已删除好友关系的一方",
            avatarUrl: "/avatars/former-peer.png",
          },
          lastMessage: {
            id: 501,
            conversationId: 91,
            senderUserId: 201,
            type: "text",
            content: "删除前的历史消息",
            metadata: null,
            createdAt: now,
          },
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
      total: 1,
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

    const bootstrap = await createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "保留历史的一方",
        avatarUrl: null,
      },
      scope: "user",
    }).bootstrap();

    expect(bootstrap.conversations[0]).toMatchObject({
      id: "91",
      type: "single",
      contactUserId: "201",
      title: "已删除好友关系的一方",
      avatar: "/avatars/former-peer.png",
      lastMessagePreview: "删除前的历史消息",
    });
    expect(bootstrap.users.find((user) => user.id === "201")).toMatchObject({
      nickname: "已删除好友关系的一方",
      avatar: "/avatars/former-peer.png",
    });
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
    expect(
      Object.fromEntries(
        bootstrap.conversations.map((conversation) => [
          conversation.id,
          [
            conversation.lastMessageType,
            conversation.lastMessageStatus,
          ],
        ]),
      ),
    ).toEqual({
      "91": ["image", "sent"],
      "92": ["voice", "sent"],
      "93": ["video", "sent"],
      "94": ["file", "sent"],
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

  it("sends voice bytes through the formal endpoint instead of message content", async () => {
    const blob = new Blob(
      [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])],
      { type: "audio/webm" },
    );
    const send = vi.spyOn(realtimeApi, "createVoiceMessage").mockResolvedValue({
      id: 702,
      conversationId: 91,
      senderUserId: 100,
      type: "text",
      content: "语音",
      metadata: { needoMessageType: "voice" },
      createdAt: now,
    });
    const createMessage = vi.spyOn(realtimeApi, "createMessage");
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
      api.sendVoiceMessage("91", blob, {
        durationSeconds: 6,
        fileName: "voice.webm",
      }),
    ).resolves.toEqual({
      message: expect.objectContaining({ type: "voice", content: "语音" }),
    });
    expect(send).toHaveBeenCalledWith(91, blob, {
      durationSeconds: 6,
      fileName: "voice.webm",
    });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("keeps the voice Blob, MIME type, and metadata query intact for the realtime endpoint", async () => {
    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
      type: "audio/webm;codecs=opus",
    });
    const request = vi.spyOn(httpClient, "request").mockResolvedValue({
      id: 703,
      conversationId: 91,
      senderUserId: 100,
      type: "text",
      content: "语音",
      metadata: { needoMessageType: "voice" },
      createdAt: now,
    });
    const createMessage = vi.spyOn(realtimeApi, "createMessage");

    await realtimeApi.createVoiceMessage(91, blob, {
      durationSeconds: 6,
      fileName: "voice.webm",
    });

    expect(request).toHaveBeenCalledWith("/im/conversations/91/voice", {
      body: blob,
      headers: { "Content-Type": "audio/webm;codecs=opus" },
      method: "POST",
      query: { durationSeconds: 6, fileName: "voice.webm" },
    });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("falls back to audio/webm when the voice Blob has no MIME type", async () => {
    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])]);
    const request = vi.spyOn(httpClient, "request").mockResolvedValue({
      id: 704,
      conversationId: 91,
      senderUserId: 100,
      type: "text",
      content: "语音",
      metadata: { needoMessageType: "voice" },
      createdAt: now,
    });

    await realtimeApi.createVoiceMessage(91, blob, {
      durationSeconds: 6,
      fileName: "voice.webm",
    });

    expect(request).toHaveBeenCalledWith(
      "/im/conversations/91/voice",
      expect.objectContaining({
        body: blob,
        headers: { "Content-Type": "audio/webm" },
        query: { durationSeconds: 6, fileName: "voice.webm" },
      }),
    );
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

  it("maps a confirmed traceless recall to the authoritative deletion mode", async () => {
    vi.spyOn(realtimeApi, "recallMessage").mockResolvedValue({
      action: "traceless_recall",
      conversationId: 91,
      messageId: 700,
      message: {
        id: 700,
        conversationId: 91,
        senderUserId: 100,
        type: "text",
        content: null,
        metadata: null,
        reactions: [],
        recallDeadlineAt: "2026-08-25T10:03:00.000Z",
        recalledAt: "2026-08-25T10:01:00.000Z",
        recallMode: "traceless",
        contentPurgedAt: "2026-08-25T10:01:00.000Z",
        lifecycleVersion: 2,
        availableRecallModes: [],
        createdAt: now,
      },
    });
    const api = createFormalImApi({
      currentUser: { id: 100, needoId: "n0000000100", username: "sim-customer-100", avatarUrl: null },
      scope: "user",
    });

    await expect(api.recallMessage("91", "700", "standard")).resolves.toMatchObject({
      conversationId: "91",
      messageId: "700",
      mode: "traceless",
      message: { id: "700", recallMode: "traceless" },
    });
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

  it("maps traceless message.recalled SSE payloads to a terminal deletion", () => {
    expect(toFormalImStoreUpdate({
      id: "evt-traceless-1",
      type: "message.recalled",
      payload: {
        id: 700,
        conversationId: 91,
        senderUserId: 100,
        type: "text",
        content: null,
        metadata: null,
        reactions: [],
        recallDeadlineAt: "2026-08-25T10:03:00.000Z",
        recalledAt: "2026-08-25T10:01:00.000Z",
        recallMode: "traceless",
        contentPurgedAt: "2026-08-25T10:01:00.000Z",
        lifecycleVersion: 2,
        availableRecallModes: [],
        createdAt: now,
      },
    })).toEqual({
      type: "message.deleted",
      conversationId: "91",
      messageId: "700",
      reason: "traceless_recall",
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

  it("preserves content-free privacy deletion identity for local cache eviction", () => {
    expect(
      toFormalImStoreUpdate({
        id: "evt-deleted-44",
        type: "message.deleted",
        payload: {
          action: "privacy_expired",
          conversationId: 91,
          id: 44,
          messageId: 702,
          occurredAt: "2026-09-05T00:00:00.000Z",
        },
      }),
    ).toEqual({
      type: "message.deleted",
      conversationId: "91",
      messageId: "702",
      reason: "privacy_expired",
    });
  });

  it("maps server-authoritative group privacy expiry into a visible sent-time countdown", () => {
    expect(
      toFormalImStoreUpdate({
        id: "evt-created-privacy-1",
        type: "message.created",
        payload: {
          id: 702,
          conversationId: 91,
          senderUserId: 201,
          type: "text",
          content: "两分钟后消失",
          metadata: {
            needoMessageExt: {
              disappearing: { expiresAt: "2099-01-01T00:00:00.000Z" },
            },
          },
          expiresAt: "2026-08-25T10:02:00.000Z",
          privacyPolicyVersionAtSend: 4,
          reactions: [],
          createdAt: now,
        },
      }),
    ).toMatchObject({
      type: "message.created",
      message: {
        id: "702",
        ext: {
          disappearing: {
            mode: "sent",
            countdown: { months: 0, days: 0, hours: 0, minutes: 2 },
            startedAt: now,
            expiresAt: "2026-08-25T10:02:00.000Z",
          },
        },
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
      autoTranslateMessages: false,
      isHidden: false,
      createdAt: now,
      updatedAt: now,
    };
    const updateConversationPreferences = vi.fn(
      async (
        _conversationId: number,
        preferences: {
          autoTranslateMessages?: boolean;
          isMuted?: boolean;
          isPinned?: boolean;
        },
      ) => ({
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
    await expect(
      api.setConversationAutoTranslateMessages("91", true),
    ).resolves.toMatchObject({
      conversation: { id: "91", autoTranslateMessages: true },
    });
    await expect(api.markConversationRead("91", true)).resolves.toMatchObject({
      conversation: { id: "91", unreadCount: 1 },
    });
    await expect(api.deleteConversation("91")).resolves.toMatchObject({
      conversation: { id: "91", isDeleted: true },
    });

    expect(updateConversationPreferences).toHaveBeenNthCalledWith(1, 91, { isPinned: true });
    expect(updateConversationPreferences).toHaveBeenNthCalledWith(2, 91, { isMuted: true });
    expect(updateConversationPreferences).toHaveBeenNthCalledWith(3, 91, {
      autoTranslateMessages: true,
    });
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
      identityCard: {
        entityType: "user",
        profileId: 73,
        displayName: "小松 美咲",
        identityLabel: "premium",
        verified: false,
        creditValue: "4.80",
        creditReviewCount: 28,
        gender: "female",
        age: 25,
        heightCm: "164.00",
        languages: ["日本語", "中文"],
        city: "东京",
        serviceArea: null,
        yearsExperience: null,
        bio: "预约前请先确认时间。",
      },
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
      identityCard: {
        entityType: "user",
        profileId: "73",
        displayName: "小松 美咲",
        identityLabel: "premium",
        verified: false,
        creditValue: 4.8,
        creditReviewCount: 28,
        gender: "female",
        age: 25,
        heightCm: 164,
        languages: ["日本語", "中文"],
        city: "东京",
        serviceArea: undefined,
        yearsExperience: undefined,
        bio: "预约前请先确认时间。",
      },
    });
    await expect(api.sendFriendRequest("201")).resolves.toMatchObject({
      friendRequest: { id: "51", expiresAt: friendRequest.expiresAt },
      created: true,
    });
    expect(getDirectoryProfile).toHaveBeenCalledWith(201);
    expect(createFriendRequest).toHaveBeenCalledWith({ targetUserId: 201 });
  });

  it("maps formal technician contact details without changing integer money, duration, or basis points", async () => {
    vi.spyOn(realtimeApi, "getDirectoryProfile").mockResolvedValue({
      user: {
        userId: 201,
        needoId: "u0000000201",
        username: "小林技师",
        avatarUrl: null,
      },
      relationship: "friend",
      contactId: 31,
      friendRequest: null,
      identityCard: {
        entityType: "technician",
        profileId: 81,
        displayName: "小林技师",
        identityLabel: "个人技师",
        verified: true,
        creditValue: "4.80",
        creditReviewCount: 132,
        gender: "male",
        age: 29,
        heightCm: "178.00",
        languages: ["日本語", "中文"],
        city: "东京",
        serviceArea: "新宿区",
        yearsExperience: 6,
        bio: "预约前请先联系。",
      },
      technicianContactDetails: {
        bidBudgetMinJpy: 12_001,
        bidBudgetMaxJpy: 28_009,
        paymentMethods: ["platform", "offline"],
        specialTags: ["准时"],
        profileTags: ["深度放松"],
        services: [
          {
            id: 901,
            shopId: 71,
            name: "肩颈调理",
            priceAmount: 8_801,
            currency: "JPY",
            durationMinutes: 61,
            taxIncluded: true,
            sortOrder: 0,
          },
        ],
        completedOrderCount: 1_281,
        acceptanceRateBps: 9_876,
      },
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

    const profile = await api.getDirectoryProfile("201");

    expect(profile.identityCard.entityType).toBe("technician");
    expect(profile.technicianContactDetails).toEqual({
      bidBudgetMinJpy: 12_001,
      bidBudgetMaxJpy: 28_009,
      paymentMethods: ["platform", "offline"],
      specialTags: ["准时"],
      profileTags: ["深度放松"],
      services: [
        {
          id: 901,
          shopId: 71,
          name: "肩颈调理",
          priceAmount: 8_801,
          currency: "JPY",
          durationMinutes: 61,
          taxIncluded: true,
          sortOrder: 0,
        },
      ],
      completedOrderCount: 1_281,
      acceptanceRateBps: 9_876,
    });
  });

  it("keeps technician details absent and drops them from non-technician responses", async () => {
    const base = {
      user: {
        userId: 201,
        needoId: "u0000000201",
        username: "普通用户",
        avatarUrl: null,
      },
      relationship: "friend" as const,
      contactId: 31,
      friendRequest: null,
      identityCard: {
        entityType: "user" as const,
        profileId: 81,
        displayName: "普通用户",
        identityLabel: "free",
        verified: true,
        creditValue: "4.80",
        creditReviewCount: 12,
        gender: null,
        age: null,
        heightCm: null,
        languages: [],
        city: "东京",
        serviceArea: null,
        yearsExperience: null,
        bio: null,
      },
    };
    const getProfile = vi.spyOn(realtimeApi, "getDirectoryProfile");
    getProfile.mockResolvedValueOnce(base);
    getProfile.mockResolvedValueOnce({
      ...base,
      technicianContactDetails: {
        bidBudgetMinJpy: 1,
        bidBudgetMaxJpy: 2,
        paymentMethods: [],
        specialTags: [],
        profileTags: [],
        services: [],
        completedOrderCount: 0,
        acceptanceRateBps: 10_000,
      },
    } as never);
    const api = createFormalImApi({
      currentUser: {
        id: 100,
        needoId: "u0000000100",
        username: "测试用户",
        avatarUrl: null,
      },
      scope: "user",
    });

    await expect(api.getDirectoryProfile("201")).resolves.not.toHaveProperty(
      "technicianContactDetails",
    );
    await expect(api.getDirectoryProfile("201")).resolves.not.toHaveProperty(
      "technicianContactDetails",
    );
  });

  it("maps the authenticated account directory profile as self", async () => {
    vi.spyOn(realtimeApi, "getDirectoryProfile").mockResolvedValue({
      user: {
        userId: 100,
        needoId: "u0000000100",
        username: "测试用户",
        avatarUrl: null,
      },
      relationship: "self",
      contactId: null,
      friendRequest: null,
      identityCard: {
        entityType: "user",
        profileId: 70,
        displayName: "测试用户",
        identityLabel: "free",
        verified: false,
        creditValue: null,
        creditReviewCount: 0,
        gender: null,
        age: null,
        heightCm: null,
        languages: [],
        city: null,
        serviceArea: null,
        yearsExperience: null,
        bio: null,
      },
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

    await expect(api.getDirectoryProfile("100")).resolves.toMatchObject({
      user: { id: "100" },
      relationship: "self",
      contactId: undefined,
      friendRequest: undefined,
    });
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

  it("maps formal chat-record snapshots without accepting raw source content", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const summary = { publicId, title: "A、B", preview: "A: one\nB: two", senderNames: ["A", "B"], senderCount: 2, itemCount: 2, createdAt: now };
    const create = vi.spyOn(realtimeApi, "createChatRecordDelivery").mockResolvedValue({ replayed: false, bundle: summary, message: chatRecordDeliveryMessage({ content: summary.title, metadata: { needoMessageType: "chat-record", needoMessageExt: { bundlePublicId: publicId, itemCount: 2, preview: summary.preview, senderNames: summary.senderNames, senderCount: 2, title: summary.title, titleKind: "pair" } }, reactions: [{ emoji: "👍", people: [{ userId: 101, needoId: "u0000000101", username: "A", avatarUrl: null }], reactedByMe: true }] }) });
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    const command = { idempotencyKey: "11111111-1111-4111-8111-111111111111", messageIds: ["501", "502"], sourceConversationId: "41" };
    const result = await api.createChatRecordDelivery("91", command);
    expect(result).toMatchObject({ bundle: summary, message: { type: "chat-record", reactions: [{ emoji: "👍", reactedByMe: true }], ext: { chatRecord: { publicId, itemCount: 2, preview: summary.preview, senderNames: ["A", "B"], titleKind: "pair" } } } });
    expect(JSON.stringify(result.message.ext)).not.toContain("sourceContent");
    expect(create).toHaveBeenCalledWith(91, { idempotencyKey: command.idempotencyKey, messageIds: [501, 502], sourceConversationId: 41 });
  });

  it("maps chat-record reads, favorites, pages, media, deletion, batch deletion, and translations", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const summary = { publicId, title: "A", preview: "A: one", senderNames: ["A"], senderCount: 1, itemCount: 1, createdAt: now };
    const favorite = { id: 71, bundlePublicId: publicId, title: summary.title, preview: summary.preview, senderNames: summary.senderNames, senderCount: 1, itemCount: 1, createdAt: now };
    vi.spyOn(realtimeApi, "getChatRecord").mockResolvedValue(summary);
    vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValue({
      list: [{ id: 901, position: 1, senderDisplayName: "A", senderAvatarUrl: null, messageType: "text", content: "one", metadata: null, sentAt: now }],
      total: 1,
      page: 1,
      page_size: 20,
      nextCursor: null,
    });
    const binary = { blob: new Blob(["x"]), cacheControl: "private", contentLength: 1, contentType: "image/png", etag: '"etag"' };
    vi.spyOn(realtimeApi, "getChatRecordMedia").mockResolvedValue(binary);
    vi.spyOn(realtimeApi, "createChatRecordFavorite").mockResolvedValue({ replayed: false, favorite });
    vi.spyOn(realtimeApi, "listChatRecordFavorites").mockResolvedValue({ list: [favorite], total: 1, page: 1, page_size: 20 });
    const remove = vi.spyOn(realtimeApi, "removeChatRecordFavorite").mockResolvedValue({ deleted: true });
    const batch = vi.spyOn(realtimeApi, "batchDeleteMessagesForMe").mockResolvedValue({ conversationId: 41, messageIds: [501], count: 1, deleted: true, replayed: false });
    const translate = vi.spyOn(realtimeApi, "translateMessages").mockResolvedValue([{ messageId: 501, status: "translated", translatedContent: "翻译" }]);
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    const command = { idempotencyKey: "11111111-1111-4111-8111-111111111111", messageIds: ["501"], sourceConversationId: "41" };

    await expect(api.getChatRecord(publicId)).resolves.toEqual(summary);
    await expect(api.listChatRecordItems(publicId, { pageSize: 20 })).resolves.toMatchObject({ list: [{ id: "901", senderDisplayName: "A" }], nextCursor: null });
    await expect(api.getChatRecordMedia(publicId, "a".repeat(64))).resolves.toBe(binary);
    await expect(api.createChatRecordFavorite(command)).resolves.toMatchObject({ favorite: { id: "71", bundlePublicId: publicId, senderNames: ["A"] } });
    await expect(api.listChatRecordFavorites({ page: 1, pageSize: 20 })).resolves.toMatchObject({ list: [{ id: "71", bundlePublicId: publicId }] });
    await expect(api.removeChatRecordFavorite("71")).resolves.toEqual({ deleted: true });
    await expect(api.batchDeleteMessages("41", { idempotencyKey: command.idempotencyKey, messageIds: ["501"] })).resolves.toMatchObject({ conversationId: "41", messageIds: ["501"] });
    await expect(api.translateMessages("41", { messageIds: ["501"], targetLanguage: "zh" })).resolves.toEqual([{ messageId: "501", status: "translated", translatedContent: "翻译" }]);
    expect(remove).toHaveBeenCalledWith(71);
    expect(batch).toHaveBeenCalledWith(41, { idempotencyKey: command.idempotencyKey, messageIds: [501] });
    expect(translate).toHaveBeenCalledWith(41, { messageIds: [501], targetLanguage: "zh" });
  });

  it("rejects chat-record item page sizes above the formal 50-item contract before transport", async () => {
    const listItems = vi.spyOn(realtimeApi, "listChatRecordItems");
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });

    await expect(
      api.listChatRecordItems("22222222-2222-4222-8222-222222222222", { pageSize: 51 }),
    ).rejects.toThrow();
    expect(listItems).not.toHaveBeenCalled();
  });

  it("rejects a lossy chat-record summary without sender snapshot names", async () => {
    vi.spyOn(realtimeApi, "getChatRecord").mockResolvedValue({
      publicId: "22222222-2222-4222-8222-222222222222",
      title: "A",
      preview: "A: one",
      senderNames: [],
      senderCount: 1,
      itemCount: 1,
      createdAt: now,
    });
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    await expect(api.getChatRecord("22222222-2222-4222-8222-222222222222")).rejects.toThrow("error.response.invalid_chat_record");
  });

  it("rejects malformed, oversized, unsafe, and inconsistent summary or favorite fields", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const valid = { publicId, title: "A", preview: "A: one", senderNames: ["A"], senderCount: 1, itemCount: 1, createdAt: now };
    const malformed = [
      { ...valid, title: "x".repeat(256) }, { ...valid, preview: "x".repeat(501) },
      { ...valid, senderNames: ["A", "B"], senderCount: 1 }, { ...valid, senderNames: ["x".repeat(121)] },
      { ...valid, itemCount: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, createdAt: "not-a-date" }, { ...valid, extra: "unexpected" }
    ];
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    for (const value of malformed) {
      vi.spyOn(realtimeApi, "getChatRecord").mockResolvedValueOnce(value as never);
      await expect(api.getChatRecord(publicId)).rejects.toThrow("error.response.invalid_chat_record");
    }
    vi.spyOn(realtimeApi, "listChatRecordFavorites").mockResolvedValueOnce({ list: [{ id: Number.MAX_SAFE_INTEGER + 1, bundlePublicId: publicId, ...valid } as never], total: 1, page: 1, page_size: 20 });
    await expect(api.listChatRecordFavorites()).rejects.toThrow("error.response.invalid_chat_record");
  });

  it("rejects malformed item pages and chat-record message metadata instead of returning a partial ext", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const summary = { publicId, title: "A", preview: "A: one", senderNames: ["A"], senderCount: 1, itemCount: 1, createdAt: now };
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce({ list: [{ id: 901, position: Number.MAX_SAFE_INTEGER + 1, senderDisplayName: "A", senderAvatarUrl: null, messageType: "text", content: "one", metadata: null, sentAt: now }], total: 1, page: 1, page_size: 20, nextCursor: null });
    await expect(api.listChatRecordItems(publicId)).rejects.toThrow("error.response.invalid_chat_record");
    for (const needoMessageExt of [
      { bundlePublicId: publicId, itemCount: 1, preview: "A: one", senderNames: ["A"], senderCount: 2, title: "A", titleKind: "single" },
      { bundlePublicId: publicId, itemCount: 1, preview: "different", senderNames: ["A"], senderCount: 1, title: "A", titleKind: "single" }
    ]) {
      vi.spyOn(realtimeApi, "createChatRecordDelivery").mockResolvedValueOnce({ replayed: false, bundle: summary, message: chatRecordDeliveryMessage({ metadata: { needoMessageType: "chat-record", needoMessageExt } }) });
      await expect(api.createChatRecordDelivery("91", { idempotencyKey: "11111111-1111-4111-8111-111111111111", messageIds: ["501"], sourceConversationId: "41" })).rejects.toThrow("error.response.invalid_chat_record");
    }
  });

  it("rejects malformed raw delivery messages before mapping the chat-record snapshot", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const summary = { publicId, title: "A", preview: "A: one", senderNames: ["A"], senderCount: 1, itemCount: 1, createdAt: now };
    const metadata = { needoMessageType: "chat-record", needoMessageExt: { bundlePublicId: publicId, itemCount: 1, preview: summary.preview, senderNames: summary.senderNames, senderCount: 1, title: summary.title, titleKind: "single" } };
    const validMessage = chatRecordDeliveryMessage({ content: summary.title, metadata });
    const malformed = [
      { ...validMessage, id: 2_147_483_648 },
      { ...validMessage, conversationId: 92 },
      { ...validMessage, senderUserId: Number.MAX_SAFE_INTEGER + 1 },
      { ...validMessage, senderUserId: null },
      { ...validMessage, type: "system" },
      { ...validMessage, reactions: "not-an-array" },
      { ...validMessage, reactions: [{ emoji: "ok", people: [], reactedByMe: "yes" }] },
      { ...validMessage, reactions: [{ emoji: "ok", people: [{ userId: 101, needoId: "bad", username: "A", avatarUrl: null }], reactedByMe: false }] },
      { ...validMessage, recallDeadlineAt: null },
      { ...validMessage, lifecycleVersion: -1 },
      { ...validMessage, reactionVersion: 1.5 },
      { ...validMessage, availableRecallModes: ["traceless"] },
      { ...validMessage, createdAt: "not-a-date" },
      { ...validMessage, content: "different" },
      { ...validMessage, unexpected: true },
    ];
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    for (const message of malformed) {
      vi.spyOn(realtimeApi, "createChatRecordDelivery").mockResolvedValueOnce({ replayed: false, bundle: summary, message } as never);
      await expect(api.createChatRecordDelivery("91", { idempotencyKey: "11111111-1111-4111-8111-111111111111", messageIds: ["501"], sourceConversationId: "41" })).rejects.toThrow("error.response.invalid_chat_record");
    }
    for (const required of ["reactions", "expiresAt", "recallDeadlineAt", "recalledAt", "recallMode", "contentPurgedAt", "privacyPolicyVersionAtSend", "lifecycleVersion", "reactionVersion", "availableRecallModes"] as const) {
      const message: Record<string, unknown> = { ...validMessage };
      delete message[required];
      vi.spyOn(realtimeApi, "createChatRecordDelivery").mockResolvedValueOnce({ replayed: false, bundle: summary, message } as never);
      await expect(api.createChatRecordDelivery("91", { idempotencyKey: "11111111-1111-4111-8111-111111111111", messageIds: ["501"], sourceConversationId: "41" })).rejects.toThrow("error.response.invalid_chat_record");
    }
  });

  it.each(["0", "2026-08-25", "2026-08-25T10:00:00", "2026-02-30T10:00:00Z"])(
    "rejects non-RFC3339 or calendar-invalid date-time %s",
    async (createdAt) => {
      const publicId = "22222222-2222-4222-8222-222222222222";
      vi.spyOn(realtimeApi, "getChatRecord").mockResolvedValueOnce({ publicId, title: "A", preview: "A: one", senderNames: ["A"], senderCount: 1, itemCount: 1, createdAt });
      const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
      await expect(api.getChatRecord(publicId)).rejects.toThrow("error.response.invalid_chat_record");
    },
  );

  it("accepts an empty chat-record page beyond the current total", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce({ list: [], total: 43, page: 3, page_size: 20, nextCursor: null });
    vi.spyOn(realtimeApi, "listChatRecordFavorites").mockResolvedValueOnce({ list: [], total: 0, page: 3, page_size: 20 });
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    await expect(api.listChatRecordItems(publicId, { beforePosition: 1 })).resolves.toMatchObject({ list: [], total: 43, page: 3, page_size: 20, nextCursor: null });
    await expect(api.listChatRecordFavorites({ page: 3 })).resolves.toMatchObject({ list: [], total: 0, page: 3, page_size: 20 });
  });

  it("rejects favorite page query mismatches and incomplete offset pages", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    const favorite = { id: 71, bundlePublicId: publicId, title: "A", preview: "A: one", senderNames: ["A"], senderCount: 1, itemCount: 1, createdAt: now };
    for (const page of [
      { list: [], total: 0, page: 2, page_size: 20 },
      { list: [], total: 0, page: 3, page_size: 10 },
    ]) {
      vi.spyOn(realtimeApi, "listChatRecordFavorites").mockResolvedValueOnce(page);
      await expect(api.listChatRecordFavorites({ page: 3, pageSize: 20 })).rejects.toThrow("error.response.invalid_chat_record");
    }
    vi.spyOn(realtimeApi, "listChatRecordFavorites").mockResolvedValueOnce({ list: [favorite], total: 2, page: 1, page_size: 2 });
    await expect(api.listChatRecordFavorites({ page: 1, pageSize: 2 })).rejects.toThrow("error.response.invalid_chat_record");
  });

  it("accepts first-page full and exact-terminal item pages with repository position cursors", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce({ list: Array.from({ length: 20 }, (_, index) => chatRecordItem(24 + index)), total: 43, page: 1, page_size: 20, nextCursor: 24 });
    await expect(api.listChatRecordItems(publicId, { pageSize: 20 })).resolves.toMatchObject({ list: expect.any(Array), nextCursor: 24, page: 1 });
    vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce({ list: Array.from({ length: 20 }, (_, index) => chatRecordItem(1 + index)), total: 20, page: 1, page_size: 20, nextCursor: null });
    await expect(api.listChatRecordItems(publicId, { pageSize: 20 })).resolves.toMatchObject({ list: expect.any(Array), nextCursor: null, page: 1 });
  });

  it("accepts unaligned cursors, soft-delete position gaps, and a full nonterminal cursor page", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce({ list: Array.from({ length: 19 }, (_, index) => chatRecordItem(1 + index)), total: 43, page: 2, page_size: 20, nextCursor: null });
    await expect(api.listChatRecordItems(publicId, { beforePosition: 20, pageSize: 20 })).resolves.toMatchObject({ list: expect.any(Array), nextCursor: null, page: 2 });
    vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce({ list: [chatRecordItem(1), chatRecordItem(4), chatRecordItem(9)], total: 5, page: 1, page_size: 20, nextCursor: null });
    await expect(api.listChatRecordItems(publicId, { beforePosition: 20, pageSize: 20 })).resolves.toMatchObject({ list: expect.any(Array), nextCursor: null, page: 1 });
    vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce({ list: Array.from({ length: 20 }, (_, index) => chatRecordItem(4 + index)), total: 43, page: 2, page_size: 20, nextCursor: 4 });
    await expect(api.listChatRecordItems(publicId, { beforePosition: 24, pageSize: 20 })).resolves.toMatchObject({ list: expect.any(Array), nextCursor: 4, page: 2 });
  });

  it("rejects cursor pages with wrong cursors, order, duplicates, or positions outside the boundary", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    const validFull = Array.from({ length: 20 }, (_, index) => chatRecordItem(4 + index));
    const malformed = [
      { list: validFull, total: 43, page: 2, page_size: 20, nextCursor: 7 },
      { list: [chatRecordItem(2), chatRecordItem(1)], total: 2, page: 1, page_size: 20, nextCursor: null },
      { list: [chatRecordItem(1), chatRecordItem(1, { id: 999 })], total: 2, page: 1, page_size: 20, nextCursor: null },
      { list: [chatRecordItem(1), chatRecordItem(20)], total: 5, page: 1, page_size: 20, nextCursor: null },
    ];
    for (const page of malformed) {
      vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce(page as never);
      await expect(api.listChatRecordItems(publicId, { beforePosition: 20, pageSize: 20 })).rejects.toThrow("error.response.invalid_chat_record");
    }
  });

  it("retains strict item-page envelope and first-page query validation", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    const malformed = [
      { list: [], total: 0, page: 1, page_size: Number.MAX_SAFE_INTEGER + 1, nextCursor: null },
      { list: [], total: 0, page: 1, page_size: 3, nextCursor: null },
      { list: [], total: 0, page: 1, page_size: 2, nextCursor: null, extra: true },
      { list: [chatRecordItem(1)], total: 1, page: 2, page_size: 2, nextCursor: null },
      { list: [chatRecordItem(1)], total: 2, page: 1, page_size: 2, nextCursor: 1 },
    ];
    for (const page of malformed) {
      vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce(page as never);
      await expect(api.listChatRecordItems(publicId, { pageSize: 2 })).rejects.toThrow("error.response.invalid_chat_record");
    }
    vi.spyOn(realtimeApi, "listChatRecordItems").mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 2, nextCursor: null });
    await expect(api.listChatRecordItems(publicId, { pageSize: 2 })).resolves.toMatchObject({ list: [], total: 0, nextCursor: null });
  });

  it("rejects unsafe chat-record IDs and malformed UUIDs before requests", async () => {
    const create = vi.spyOn(realtimeApi, "createChatRecordDelivery");
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });
    await expect(api.createChatRecordDelivery("2147483648", { idempotencyKey: "11111111-1111-4111-8111-111111111111", messageIds: ["501"], sourceConversationId: "41" })).rejects.toThrow("error.validation.invalid_id");
    await expect(api.createChatRecordDelivery("9007199254740992", { idempotencyKey: "11111111-1111-4111-8111-111111111111", messageIds: ["501"], sourceConversationId: "41" })).rejects.toThrow("error.validation.invalid_id");
    await expect(api.createChatRecordDelivery("91", { idempotencyKey: "not-a-uuid", messageIds: ["501"], sourceConversationId: "41" })).rejects.toThrow("error.validation.invalid_uuid");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects client-authored chat-record content outside the server snapshot endpoint", async () => {
    const send = vi.spyOn(realtimeApi, "createMessage");
    const api = createFormalImApi({ currentUser: { id: 100, needoId: "u0000000100", username: "当前用户", avatarUrl: null }, scope: "user" });

    await expect(api.sendMessage("chat-record", {
      conversationId: "91",
      content: "/media/private/raw-source.png",
      ext: {
        chatRecord: {
          publicId: "22222222-2222-4222-8222-222222222222",
          itemCount: 1,
          preview: "伪造预览",
          senderNames: ["伪造发送者"],
          titleKind: "single",
        },
      },
    })).rejects.toThrow("error.im.chat_record_requires_server_snapshot");
    expect(send).not.toHaveBeenCalled();
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
