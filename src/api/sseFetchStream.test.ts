import { afterEach, describe, expect, it, vi } from "vitest";
import { openAuthenticatedSseStream } from "./sseFetchStream";
import { httpClient } from "./httpClient";

const streamResponse = (chunks: Uint8Array[]) => new Response(new ReadableStream({
  start(controller) {
    chunks.forEach((chunk) => controller.enqueue(chunk));
    controller.close();
  }
}), { status: 200, headers: { "content-type": "text/event-stream" } });

describe("authenticated SSE stream", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses UTF-8 chunk boundaries, comments, and multiline data", async () => {
    const encoder = new TextEncoder();
    const event = {
      id: "1700000000000-2",
      type: "metrics.invalidate",
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
      payload: { sections: ["headline", "rankings"] },
      createdAt: "2026-09-06T03:04:05.000Z"
    };
    const json = JSON.stringify(event);
    const splitAt = json.indexOf(',"payload"') + 1;
    const bytes = encoder.encode(`: heartbeat\nid: ${event.id}\nevent: metrics.invalidate\ndata: ${json.slice(0, splitAt)}\ndata: ${json.slice(splitAt)}\n\n`);
    vi.spyOn(httpClient, "openStream").mockResolvedValueOnce(streamResponse([
      bytes.slice(0, 7), bytes.slice(7, 53), bytes.slice(53)
    ]));
    const onEvent = vi.fn();
    const onOpen = vi.fn();

    await openAuthenticatedSseStream({
      path: "/backoffice/dashboard/live-events",
      query: { country: "JP", period: "today" },
      lastEventId: "1699999999999-1",
      signal: new AbortController().signal,
      onOpen,
      onEvent
    });

    expect(httpClient.openStream).toHaveBeenCalledWith(
      "/backoffice/dashboard/live-events",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "text/event-stream", "Last-Event-ID": "1699999999999-1" })
      })
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it("rejects unknown event types and events over 64 KiB", async () => {
    const encoder = new TextEncoder();
    vi.spyOn(httpClient, "openStream")
      .mockResolvedValueOnce(streamResponse([encoder.encode("event: unknown\ndata: {}\n\n")]))
      .mockResolvedValueOnce(streamResponse([encoder.encode(`data: ${"x".repeat(65 * 1024)}\n\n`)]));

    await expect(openAuthenticatedSseStream({ path: "/events", query: {}, signal: new AbortController().signal, onEvent: vi.fn() }))
      .rejects.toThrow("error.dashboard.invalid_event");
    await expect(openAuthenticatedSseStream({ path: "/events", query: {}, signal: new AbortController().signal, onEvent: vi.fn() }))
      .rejects.toThrow("error.dashboard.event_too_large");
  });

  it("accepts the strict connected control frame without emitting a business event", async () => {
    const encoder = new TextEncoder();
    vi.spyOn(httpClient, "openStream").mockResolvedValueOnce(streamResponse([
      encoder.encode(`event: connected\ndata: ${JSON.stringify({
        type: "connected",
        scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
        payload: {},
        createdAt: "2026-09-06T03:04:05.000Z"
      })}\n\n`)
    ]));
    const onEvent = vi.fn();

    await expect(openAuthenticatedSseStream({
      path: "/events",
      query: { country: "JP", period: "today" },
      signal: new AbortController().signal,
      onEvent
    })).resolves.toBeUndefined();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("rejects a malformed connected control frame", async () => {
    const encoder = new TextEncoder();
    vi.spyOn(httpClient, "openStream").mockResolvedValueOnce(streamResponse([
      encoder.encode(`event: connected\ndata: ${JSON.stringify({
        type: "connected",
        scope: { countryCode: "JP", admin1Code: null, admin2Code: null },
        payload: { unexpected: true },
        createdAt: "2026-09-06T03:04:05.000Z"
      })}\n\n`)
    ]));

    await expect(openAuthenticatedSseStream({
      path: "/events",
      query: { country: "JP", period: "today" },
      signal: new AbortController().signal,
      onEvent: vi.fn()
    })).rejects.toThrow("error.dashboard.invalid_event");
  });

  it("stops cleanly when the caller aborts", async () => {
    const controller = new AbortController();
    vi.spyOn(httpClient, "openStream").mockResolvedValueOnce(new Response(new ReadableStream({
      start(streamController) {
        controller.signal.addEventListener("abort", () => streamController.error(new DOMException("Aborted", "AbortError")));
      }
    }), { status: 200 }));
    const promise = openAuthenticatedSseStream({ path: "/events", query: {}, signal: controller.signal, onEvent: vi.fn() });
    controller.abort();
    await expect(promise).resolves.toBeUndefined();
  });
});
