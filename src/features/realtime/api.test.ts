import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens, setAccessToken } from "../../api/httpClient";
import { realtimeApi, subscribeRealtimeEvents } from "./api";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: 0, message: "success", data }), {
    headers: { "content-type": "application/json" },
    status
  });
}

describe("formal realtime API", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    clearAuthTokens();
    setAccessToken("access-token");
  });

  afterEach(() => {
    clearAuthTokens();
    vi.unstubAllGlobals();
  });

  it("uses the production conversation and cursor-message endpoints", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ list: [], total: 0, page: 1, page_size: 20 }))
      .mockResolvedValueOnce(jsonResponse({ list: [], total: 0, page: 1, page_size: 30, nextCursor: null }));

    await realtimeApi.listConversations({ page: 1, pageSize: 20 });
    await realtimeApi.listMessages(88, { beforeId: 120, pageSize: 30 });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/im/conversations?page=1&pageSize=20",
      expect.objectContaining({ method: "GET" })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/im/conversations/88/messages?beforeId=120&pageSize=30",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("uses the paginated directory endpoint for add-friend discovery", async () => {
    const emptyPage = { list: [], total: 0, page: 1, page_size: 50 };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(emptyPage));

    await realtimeApi.searchDirectory({ query: "u0000000167", page: 1, pageSize: 50 });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/im/directory?query=u0000000167&page=1&pageSize=50",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("loads a safe profile and submits a verified friend request", async () => {
    const friendRequest = {
      id: 19,
      requesterUserId: 41,
      targetUserId: 167,
      requester: { userId: 41, needoId: "u0000000041", username: "Requester", avatarUrl: null },
      target: { userId: 167, needoId: "u0000000167", username: "Target", avatarUrl: null },
      status: "pending" as const,
      message: null,
      respondedAt: null,
      expiresAt: "2026-09-02T00:00:00.000Z",
      expiredAt: null,
      createdAt: "2026-08-30T00:00:00.000Z"
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        user: friendRequest.target,
        identityCard: {
          entityType: "account",
          profileId: null,
          displayName: "Target",
          identityLabel: null,
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
        relationship: "none",
        contactId: null,
        friendRequest: null
      }))
      .mockResolvedValueOnce(jsonResponse({ friendRequest, created: true }));

    await realtimeApi.getDirectoryProfile(167);
    await expect(realtimeApi.createFriendRequest({ targetUserId: 167 })).resolves.toEqual({
      friendRequest,
      created: true
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/im/directory/167",
      expect.objectContaining({ method: "GET" })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/im/friend-requests",
      expect.objectContaining({
        body: JSON.stringify({ targetUserId: 167 }),
        method: "POST"
      })
    );
  });

  it("uploads the selected image bytes to the conversation-scoped media endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      fileName: "album.png",
      fileSize: 8,
      mimeType: "image/png",
      url: "http://127.0.0.1:3000/media/im/opaque.png"
    }, 201));
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "album.png", {
      type: "image/png"
    });

    await realtimeApi.uploadConversationImage(91, file);

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/im/conversations/91/media?fileName=album.png",
      expect.objectContaining({
        body: file,
        headers: expect.objectContaining({ "Content-Type": "image/png" }),
        method: "POST"
      })
    );
  });

  it("uploads Social image bytes and creates a post with asset references and contact IDs", async () => {
    const checksum = "a".repeat(64);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        publicId: checksum,
        fileSize: 8,
        mimeType: "image/png",
        url: `/media/content/${checksum}.png`
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: 701 }, 201));
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "moment.png",
      { type: "image/png" }
    );

    await realtimeApi.uploadSocialMedia(file);
    await realtimeApi.createSocialPost({
      content: "Formal moment",
      media: {
        items: [{ id: "m1", type: "image", mediaAssetPublicId: checksum }]
      },
      mentionUserIds: [52, 74],
      visibility: "public"
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/social/media?fileName=moment.png",
      expect.objectContaining({
        body: file,
        headers: expect.objectContaining({ "Content-Type": "image/png" }),
        method: "POST"
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/social/posts",
      expect.objectContaining({
        body: JSON.stringify({
          content: "Formal moment",
          media: { items: [{ id: "m1", type: "image", mediaAssetPublicId: checksum }] },
          mentionUserIds: [52, 74],
          visibility: "public"
        }),
        method: "POST"
      })
    );
  });

  it("updates a published Social post through the formal PATCH route", async () => {
    const checksum = "c".repeat(64);
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ id: 701 }, 200));

    await realtimeApi.updateSocialPost(701, {
      content: "Edited formal moment",
      media: {
        items: [{ id: "m1", type: "image", mediaAssetPublicId: checksum }],
        locationLabel: "东京 银座",
        postType: "post"
      },
      mentionUserIds: [52],
      visibility: "followers"
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/social/posts/701",
      expect.objectContaining({
        body: JSON.stringify({
          content: "Edited formal moment",
          media: {
            items: [{ id: "m1", type: "image", mediaAssetPublicId: checksum }],
            locationLabel: "东京 银座",
            postType: "post"
          },
          mentionUserIds: [52],
          visibility: "followers"
        }),
        method: "PATCH"
      })
    );
  });

  it("loads one friend's rolling activity status without listing or downloading post media", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      status: "recent_posts",
      latestVisiblePostAt: "2026-08-27T08:00:00.000Z",
      profile: {
        userId: 237,
        username: "sim-friend-237",
        displayName: "柴田 阳菜",
        avatarUrl: null,
        entityType: "user",
        joinedAt: "2026-01-02T03:04:05.000Z"
      }
    }));

    await realtimeApi.getSocialActivityStatus(237);

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/social/users/237/activity-status",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("persists contact block and unblock state through the formal API", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ id: 31, isBlocked: true }))
      .mockResolvedValueOnce(jsonResponse({ id: 31, isBlocked: false }));

    await realtimeApi.blockContact(31);
    await realtimeApi.unblockContact(31);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/im/contacts/31/block",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/im/contacts/31/block",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("persists standard recall through the conversation-scoped endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        action: "standard_recall",
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
          recallMode: "standard",
          contentPurgedAt: "2026-08-25T10:01:00.000Z",
          lifecycleVersion: 2,
          availableRecallModes: [],
          createdAt: "2026-08-25T10:00:00.000Z"
        }
      })
    );

    await realtimeApi.recallMessage(91, 700, "standard");

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/im/conversations/91/messages/700/recall",
      expect.objectContaining({
        body: JSON.stringify({ mode: "standard" }),
        method: "POST"
      })
    );
  });

  it("accepts the server-authoritative traceless recall result while retaining the standard request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
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
          createdAt: "2026-08-25T10:00:00.000Z",
        },
      }),
    );

    await expect(realtimeApi.recallMessage(91, 700, "standard")).resolves.toMatchObject({
      action: "traceless_recall",
      message: { recallMode: "traceless" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/im/conversations/91/messages/700/recall",
      expect.objectContaining({ body: JSON.stringify({ mode: "standard" }) }),
    );
  });

  it("deletes one message only from the authenticated user's history", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ conversationId: 91, messageId: 700, deleted: true })
    );

    await realtimeApi.deleteMessageForMe(91, 700);

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/im/conversations/91/messages/700",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("uses exact chat-record mutations and maps protected binary media", async () => {
    const key = "11111111-1111-4111-8111-111111111111";
    const publicId = "22222222-2222-4222-8222-222222222222";
    const command = { idempotencyKey: key, messageIds: [501, 502], sourceConversationId: 41 };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ replayed: false, bundle: { publicId, title: "A、B", preview: "A: one", senderNames: ["A", "B"], senderCount: 2, itemCount: 2, createdAt: "2026-08-31T08:00:00.000Z" }, message: { id: 900, conversationId: 91, senderUserId: 100, type: "text", content: "A、B", metadata: null, createdAt: "2026-08-31T08:00:00.000Z" } }, 201))
      .mockResolvedValueOnce(jsonResponse({ replayed: false, favorite: { id: 71 } }, 201))
      .mockResolvedValueOnce(jsonResponse({ conversationId: 41, messageIds: [501, 502], count: 2, deleted: true, replayed: false }))
      .mockResolvedValueOnce(jsonResponse([{ messageId: 501, status: "translated", translatedContent: "翻译" }]))
      .mockResolvedValueOnce(jsonResponse({ publicId, title: "A", preview: "one", senderNames: ["A"], senderCount: 1, itemCount: 1, createdAt: "2026-08-31T08:00:00.000Z" }))
      .mockResolvedValueOnce(jsonResponse({ list: [], total: 0, page: 1, page_size: 20, nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ list: [], total: 0, page: 2, page_size: 20 }))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "cache-control": "private, max-age=31536000, immutable", "content-length": "4", "content-type": "image/png", etag: `"${"a".repeat(64)}"` } }));
    await realtimeApi.createChatRecordDelivery(91, command);
    await realtimeApi.createChatRecordFavorite(command);
    await realtimeApi.batchDeleteMessagesForMe(41, { idempotencyKey: key, messageIds: [501, 502] });
    await realtimeApi.translateMessages(41, { messageIds: [501], targetLanguage: "zh" });
    await realtimeApi.getChatRecord(publicId);
    await realtimeApi.listChatRecordItems(publicId, { beforePosition: 21, pageSize: 20 });
    await realtimeApi.listChatRecordFavorites({ page: 2, pageSize: 20 });
    await realtimeApi.removeChatRecordFavorite(71);
    const media = await realtimeApi.getChatRecordMedia(publicId, "a".repeat(64));
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/v1/im/conversations/91/chat-records", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/v1/im/chat-record-favorites", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/v1/im/conversations/41/messages/delete-for-me", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(4, "/api/v1/im/conversations/41/messages/translations", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(8, "/api/v1/im/chat-record-favorites/71", expect.objectContaining({ method: "DELETE" }));
    expect(media).toMatchObject({ blob: expect.any(Blob), contentLength: 4, contentType: "image/png", etag: `"${"a".repeat(64)}"` });
    expect(JSON.stringify(media)).not.toContain("runtime/");
  });

  it("preserves chat-record JSON and binary errors", async () => {
    const publicId = "22222222-2222-4222-8222-222222222222";
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 40401, message: "error.im.chat_record_not_found", data: null }), { headers: { "content-type": "application/json" }, status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 40301, message: "error.permission.denied", data: null }), { headers: { "content-type": "application/json" }, status: 403 }));
    await expect(realtimeApi.getChatRecord(publicId)).rejects.toMatchObject({ code: 40401, status: 404 });
    await expect(realtimeApi.getChatRecordMedia(publicId, "a".repeat(64))).rejects.toMatchObject({ code: 40301, status: 403 });
  });

  it.each([
    ["unsupported MIME", { "cache-control": "private, max-age=31536000, immutable", "content-length": "4", "content-type": "application/pdf", etag: `"${"a".repeat(64)}"` }, [1, 2, 3, 4]],
    ["missing length", { "cache-control": "private, max-age=31536000, immutable", "content-type": "image/png", etag: `"${"a".repeat(64)}"` }, [1, 2, 3, 4]],
    ["non-digit length", { "cache-control": "private, max-age=31536000, immutable", "content-length": "4x", "content-type": "image/png", etag: `"${"a".repeat(64)}"` }, [1, 2, 3, 4]],
    ["length mismatch", { "cache-control": "private, max-age=31536000, immutable", "content-length": "3", "content-type": "image/png", etag: `"${"a".repeat(64)}"` }, [1, 2, 3, 4]],
    ["weak ETag", { "cache-control": "private, max-age=31536000, immutable", "content-length": "4", "content-type": "image/png", etag: `W/"${"a".repeat(64)}"` }, [1, 2, 3, 4]],
    ["wrong ETag", { "cache-control": "private, max-age=31536000, immutable", "content-length": "4", "content-type": "image/png", etag: `"${"b".repeat(64)}"` }, [1, 2, 3, 4]],
    ["wrong cache", { "cache-control": "public", "content-length": "4", "content-type": "image/png", etag: `"${"a".repeat(64)}"` }, [1, 2, 3, 4]]
  ])("rejects a 200 chat-record media response with %s", async (_case, headers, bytes) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(bytes), { headers }));
    await expect(realtimeApi.getChatRecordMedia("22222222-2222-4222-8222-222222222222", "a".repeat(64))).rejects.toMatchObject({ name: "ApiClientError", message: "error.response.invalid_chat_record_media" });
  });

  it("parses authenticated SSE events and sends the last event id on reconnect", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('id: evt-101\nevent: message.created\ndata: {"id":"evt-101","type":"message.created","payload":{"messageId":9}}\n\n'));
        controller.close();
      }
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ conversations: 0, notifications: 0, friendRequests: 0, total: 0 }))
      .mockResolvedValueOnce(new Response(stream, { headers: { "content-type": "text/event-stream" }, status: 200 }));

    let unsubscribe: () => void = () => {
      // Replaced synchronously by subscribeRealtimeEvents below.
    };
    const event = await new Promise<{ id: string; type: string }>((resolve, reject) => {
      unsubscribe = subscribeRealtimeEvents({
        lastEventId: "evt-100",
        onError: reject,
        onEvent: (nextEvent) => {
          resolve(nextEvent);
          unsubscribe();
        }
      });
    });

    expect(event).toMatchObject({ id: "evt-101", type: "message.created" });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/realtime/events",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-token", "Last-Event-ID": "evt-100" })
      })
    );
  });

  it("shares one SSE connection across multiple subscribers in the same browser tab", async () => {
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      }
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ conversations: 0, notifications: 0, friendRequests: 0, total: 0 }))
      .mockResolvedValueOnce(new Response(stream, { headers: { "content-type": "text/event-stream" }, status: 200 }));

    const received: string[] = [];
    const firstEvent = new Promise<void>((resolve) => {
      const unsubscribe = subscribeRealtimeEvents({
        onEvent(event) {
          received.push(`first:${event.id}`);
          unsubscribe();
          resolve();
        }
      });
    });
    const secondEvent = new Promise<void>((resolve) => {
      const unsubscribe = subscribeRealtimeEvents({
        onEvent(event) {
          received.push(`second:${event.id}`);
          unsubscribe();
          resolve();
        }
      });
    });

    streamController.enqueue(encoder.encode('id: evt-shared\nevent: notification.created\ndata: {"id":"evt-shared","type":"notification.created","payload":{}}\n\n'));
    await Promise.all([firstEvent, secondEvent]);

    expect(received).toEqual(["first:evt-shared", "second:evt-shared"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/realtime/events",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer access-token" }) })
    );
  });

  it("restarts the shared SSE connection after identity switching rotates the access token", async () => {
    const firstStream = new ReadableStream<Uint8Array>({ start() {} });
    const secondStream = new ReadableStream<Uint8Array>({ start() {} });
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ conversations: 0, notifications: 0, friendRequests: 0, total: 0 }))
      .mockResolvedValueOnce(new Response(firstStream, { headers: { "content-type": "text/event-stream" }, status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ conversations: 0, notifications: 0, friendRequests: 0, total: 0 }))
      .mockResolvedValueOnce(new Response(secondStream, { headers: { "content-type": "text/event-stream" }, status: 200 }));

    const unsubscribeFirst = subscribeRealtimeEvents({ onEvent() {} });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    setAccessToken("rotated-access-token");
    const unsubscribeSecond = subscribeRealtimeEvents({ onEvent() {} });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));

    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/realtime/events",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer rotated-access-token" }) })
    );

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("does not hold an SSE connection while the browser tab is hidden", async () => {
    const documentTarget = new EventTarget() as EventTarget & { visibilityState: "hidden" | "visible" };
    Object.defineProperty(documentTarget, "visibilityState", { configurable: true, value: "hidden", writable: true });
    vi.stubGlobal("document", documentTarget);
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ conversations: 0, notifications: 0, friendRequests: 0, total: 0 }))
      .mockResolvedValueOnce(new Response(stream, { headers: { "content-type": "text/event-stream" }, status: 200 }));

    const unsubscribe = subscribeRealtimeEvents({ onEvent() {} });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();

    documentTarget.visibilityState = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    unsubscribe();
  });
});
