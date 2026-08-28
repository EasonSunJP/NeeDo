import { EventEmitter } from "node:events";
import type { Response } from "express";
import {
  SseRealtimeEventGateway,
  type RealtimeEventBusPort
} from "../src/services/realtime-event.gateway";

class FakeSseResponse extends EventEmitter {
  public readonly headers = new Map<string, string>();
  public readonly writes: string[] = [];
  public statusCode = 0;
  public ended = false;
  public writable = true;

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
    return this.writable;
  }

  public end() {
    this.ended = true;
    this.emit("close");
  }
}

class SharedRealtimeEventBus implements RealtimeEventBusPort {
  public publishCalls = 0;
  public subscribeCalls = 0;
  private readonly listeners = new Set<(message: string) => void>();

  public async publish(message: string): Promise<void> {
    this.publishCalls += 1;
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  public async subscribe(listener: (message: string) => void): Promise<() => Promise<void>> {
    this.subscribeCalls += 1;
    this.listeners.add(listener);

    return async () => {
      this.listeners.delete(listener);
    };
  }

  public emitRaw(message: string): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  public async close(): Promise<void> {
    this.listeners.clear();
  }
}

class RecoveringRealtimeEventBus extends SharedRealtimeEventBus {
  private failuresRemaining = 1;

  public override async subscribe(
    listener: (message: string) => void
  ): Promise<() => Promise<void>> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      this.subscribeCalls += 1;
      throw new Error("redis temporarily unavailable");
    }

    return super.subscribe(listener);
  }
}

describe("SseRealtimeEventGateway", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("writes SSE id lines so reconnecting clients can track the last event", async () => {
    const gateway = new SseRealtimeEventGateway();
    const response = new FakeSseResponse();
    await gateway.subscribe(7, response as unknown as Response);

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

  it("delivers an event exactly once across backend instances", async () => {
    const eventBus = new SharedRealtimeEventBus();
    const firstGateway = new SseRealtimeEventGateway({ eventBus, instanceId: "instance-a" });
    const secondGateway = new SseRealtimeEventGateway({ eventBus, instanceId: "instance-b" });
    const firstResponse = new FakeSseResponse();
    const secondResponse = new FakeSseResponse();
    await firstGateway.subscribe(7, firstResponse as unknown as Response);
    await secondGateway.subscribe(7, secondResponse as unknown as Response);

    firstGateway.publish({
      id: "evt-cross-instance",
      type: "message.created",
      recipientUserId: 7,
      payload: { messageId: 12 },
      createdAt: "2026-08-29T00:00:00.000Z"
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(firstResponse.writes.join("").match(/id: evt-cross-instance/g)).toHaveLength(1);
    expect(secondResponse.writes.join("").match(/id: evt-cross-instance/g)).toHaveLength(1);
    expect(eventBus.publishCalls).toBe(1);
    await firstGateway.close();
    await secondGateway.close();
  });

  it("uses one process-wide bus subscription for many SSE clients", async () => {
    const eventBus = new SharedRealtimeEventBus();
    const gateway = new SseRealtimeEventGateway({ eventBus, instanceId: "instance-a" });
    const responses = Array.from({ length: 1_000 }, () => new FakeSseResponse());

    await Promise.all(
      responses.map((response, index) =>
        gateway.subscribe(index + 1, response as unknown as Response)
      )
    );

    expect(eventBus.subscribeCalls).toBe(1);
    await gateway.close();
  });

  it("ignores malformed or oversized cross-instance envelopes", async () => {
    const eventBus = new SharedRealtimeEventBus();
    const gateway = new SseRealtimeEventGateway({ eventBus, instanceId: "instance-b" });
    const response = new FakeSseResponse();
    await gateway.subscribe(7, response as unknown as Response);
    const writesBeforeMalformedEvents = response.writes.length;

    eventBus.emitRaw("not-json");
    eventBus.emitRaw(
      JSON.stringify({ sourceInstanceId: "instance-a", event: { type: "message.created" } })
    );
    eventBus.emitRaw("x".repeat(300_000));

    expect(response.writes).toHaveLength(writesBeforeMalformedEvents);
    await gateway.close();
  });

  it("disconnects a slow SSE client instead of buffering without a bound", async () => {
    const gateway = new SseRealtimeEventGateway();
    const response = new FakeSseResponse();
    await gateway.subscribe(7, response as unknown as Response);
    response.writable = false;

    gateway.publish({
      id: "evt-backpressure",
      type: "message.created",
      recipientUserId: 7,
      payload: { messageId: 12 },
      createdAt: "2026-08-29T00:00:00.000Z"
    });

    expect(response.ended).toBe(true);
    const writesAfterDisconnect = response.writes.length;
    gateway.publish({
      id: "evt-after-disconnect",
      type: "message.created",
      recipientUserId: 7,
      payload: { messageId: 13 },
      createdAt: "2026-08-29T00:00:01.000Z"
    });
    expect(response.writes).toHaveLength(writesAfterDisconnect);
  });

  it("retries one failed Redis subscription per process without client polling", async () => {
    const eventBus = new RecoveringRealtimeEventBus();
    const gateway = new SseRealtimeEventGateway({ eventBus, instanceId: "instance-a" });
    const response = new FakeSseResponse();

    await gateway.subscribe(7, response as unknown as Response);
    expect(eventBus.subscribeCalls).toBe(1);

    await jest.advanceTimersByTimeAsync(5_000);

    expect(eventBus.subscribeCalls).toBe(2);
    await gateway.close();
  });
});
