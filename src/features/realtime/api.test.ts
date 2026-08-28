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

  it("adds a discovered user as a formal contact", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ id: 31 }, 201));

    await realtimeApi.addContact(167);

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/im/contacts",
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
