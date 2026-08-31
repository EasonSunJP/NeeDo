import { afterEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { realtimeApi } from "../realtime/api";
import { createFormalImApi } from "./formal-api";

const now = "2026-09-01T03:00:00.000Z";
const targetUserId = "u0000000052";
const idempotencyKey = "contact-card-send-0001";

function message(metadata: unknown) {
  return {
    id: 801,
    conversationId: 91,
    senderUserId: 41,
    type: "text" as const,
    content: "佐藤花子",
    metadata,
    reactions: [],
    expiresAt: null,
    recallDeadlineAt: "2026-09-01T03:03:00.000Z",
    recalledAt: null,
    recallMode: null,
    contentPurgedAt: null,
    privacyPolicyVersionAtSend: null,
    lifecycleVersion: 1,
    reactionVersion: 0,
    availableRecallModes: ["standard" as const],
    createdAt: now
  };
}

const v2Metadata = {
  snapshotVersion: 2,
  type: "contact-card",
  contactCard: {
    targetUserPublicId: targetUserId,
    needoId: targetUserId,
    nickname: "佐藤花子",
    avatarUrl: "/media/customer-avatars/avatar.webp",
    entityKind: "customer",
    ekycVerified: true,
    level: 38,
    bio: "予約前に時間と言語を確認してください。",
    tierCode: "gold",
    themeVersionPublicId: "membership-theme-v3",
    simpleTopColor: "#09251F",
    simpleBottomColor: "#10242D"
  }
} as const;

function createApi() {
  return createFormalImApi({
    currentUser: {
      id: 41,
      needoId: "u0000000041",
      username: "山田太郎",
      avatarUrl: null
    },
    scope: "user"
  });
}

describe("formal IM contact-card adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("strictly maps the immutable V2 snapshot without deriving display fields", async () => {
    vi.spyOn(realtimeApi, "listMessages").mockResolvedValue({
      list: [message(v2Metadata)],
      total: 1,
      page: 1,
      page_size: 30,
      nextCursor: null
    });

    const result = await createApi().listMessages("91");

    expect(result.messages[0]).toMatchObject({
      type: "contact-card",
      ext: {
        contactCard: {
          snapshotVersion: 2,
          userId: targetUserId,
          needoId: targetUserId,
          displayName: "佐藤花子",
          avatar: "/media/customer-avatars/avatar.webp",
          profileKind: "person",
          entityKind: "customer",
          ekycVerified: true,
          level: 38,
          headline: "予約前に時間と言語を確認してください。",
          tierCode: "gold",
          themeVersionPublicId: "membership-theme-v3",
          simpleTopColor: "#09251F",
          simpleBottomColor: "#10242D"
        }
      }
    });
  });

  it("fails closed for malformed or expanded V2 snapshots", async () => {
    for (const metadata of [
      { ...v2Metadata, privateEmail: "hidden@example.test" },
      { ...v2Metadata, contactCard: { ...v2Metadata.contactCard, level: 101 } },
      { ...v2Metadata, contactCard: { ...v2Metadata.contactCard, avatarUrl: "javascript:alert(1)" } },
      { ...v2Metadata, contactCard: { ...v2Metadata.contactCard, simpleTopColor: "green" } }
    ]) {
      vi.spyOn(realtimeApi, "listMessages").mockResolvedValueOnce({
        list: [message(metadata)],
        total: 1,
        page: 1,
        page_size: 30,
        nextCursor: null
      });
      await expect(createApi().listMessages("91")).rejects.toThrow(
        "error.response.invalid_contact_card"
      );
    }
  });

  it("keeps a sanitized legacy card while dropping unknown fields", async () => {
    vi.spyOn(realtimeApi, "listMessages").mockResolvedValue({
      list: [message({
        needoMessageType: "contact-card",
        needoMessageExt: {
          contactCard: {
            userId: "52",
            displayName: "旧名片",
            avatar: "/legacy.webp",
            profileKind: "person",
            userIdLabel: targetUserId,
            headline: "旧简介",
            privatePhone: "090-0000-0000"
          }
        }
      })],
      total: 1,
      page: 1,
      page_size: 30,
      nextCursor: null
    });

    const card = (await createApi().listMessages("91")).messages[0]?.ext?.contactCard;
    expect(card).toEqual({
      userId: "52",
      displayName: "旧名片",
      avatar: "/legacy.webp",
      profileKind: "person",
      userIdLabel: targetUserId,
      headline: "旧简介"
    });
    expect(card).not.toHaveProperty("privatePhone");
  });

  it("loads only the server-projected candidate fields and sends only a public ID", async () => {
    const candidate = {
      targetUserId,
      needoId: targetUserId,
      nickname: "佐藤花子",
      avatarUrl: null,
      relationship: "friend" as const
    };
    const list = vi.spyOn(realtimeApi, "listContactCardCandidates").mockResolvedValue({
      list: [candidate],
      total: 1,
      page: 1,
      page_size: 20
    });
    const send = vi.spyOn(realtimeApi, "sendContactCard").mockResolvedValue({
      message: message(v2Metadata),
      replayed: false
    });

    const api = createApi();
    await expect(api.listContactCardCandidates("91", { page: 1, pageSize: 20, query: " 花子 " }))
      .resolves.toEqual({ list: [candidate], total: 1, page: 1, page_size: 20 });
    await expect(api.sendContactCard("91", targetUserId, idempotencyKey)).resolves.toMatchObject({
      replayed: false,
      message: { type: "contact-card", ext: { contactCard: { userId: targetUserId } } }
    });

    expect(list).toHaveBeenCalledWith(91, { page: 1, pageSize: 20, query: "花子" });
    expect(send).toHaveBeenCalledWith(91, targetUserId, idempotencyKey);
  });

  it("uses the dedicated endpoints and never puts card details in the send body", async () => {
    const request = vi.spyOn(httpClient, "request")
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 20 })
      .mockResolvedValueOnce({ message: message(v2Metadata), replayed: false });

    await realtimeApi.listContactCardCandidates(91, { page: 1, pageSize: 20 });
    await realtimeApi.sendContactCard(91, targetUserId, idempotencyKey);

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/im/conversations/91/contact-card-candidates",
      { query: { page: 1, pageSize: 20 } }
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/im/conversations/91/contact-cards",
      {
        body: { targetUserId },
        headers: { "Idempotency-Key": idempotencyKey },
        method: "POST"
      }
    );
  });

  it("blocks the generic client-authored contact-card path", async () => {
    const createMessage = vi.spyOn(realtimeApi, "createMessage");
    await expect(createApi().sendMessage("contact-card", {
      conversationId: "91",
      content: "伪造名片",
      ext: {
        contactCard: {
          userId: targetUserId,
          displayName: "伪造昵称",
          avatar: "",
          profileKind: "person"
        }
      }
    })).rejects.toThrow("error.im.contact_card_requires_server_snapshot");
    expect(createMessage).not.toHaveBeenCalled();
  });
});
