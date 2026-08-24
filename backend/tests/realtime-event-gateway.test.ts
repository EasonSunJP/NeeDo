import { EventEmitter } from "node:events";
import type { Response } from "express";
import { SseRealtimeEventGateway } from "../src/services/realtime-event.gateway";

class FakeSseResponse extends EventEmitter {
  public readonly headers = new Map<string, string>();
  public readonly writes: string[] = [];
  public statusCode = 0;

  public status(code: number) {
    this.statusCode = code;
    return this;
  }

  public setHeader(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }

  public flushHeaders() {}

  public write(chunk: string) {
    this.writes.push(chunk);
    return true;
  }
}

describe("SseRealtimeEventGateway", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("writes SSE id lines so reconnecting clients can track the last event", () => {
    const gateway = new SseRealtimeEventGateway();
    const response = new FakeSseResponse();
    gateway.subscribe(7, response as unknown as Response);

    gateway.publish({
      id: "evt-100",
      type: "message.created",
      recipientUserId: 7,
      payload: { messageId: 12 },
      createdAt: "2026-08-25T00:00:00.000Z"
    });

    expect(response.writes.join("")).toContain("id: evt-100\nevent: message.created\n");
    response.emit("close");
  });
});
