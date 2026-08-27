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
});
