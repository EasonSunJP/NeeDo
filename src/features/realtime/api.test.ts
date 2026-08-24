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
