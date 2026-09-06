import { EventEmitter } from "node:events";
import type { Response } from "express";
import type { LiveDashboardEvent } from "../src/domain/live-dashboard";
import { LiveDashboardCache } from "../src/services/live-dashboard-cache.service";
import {
  LiveDashboardEventGateway,
  type LiveDashboardReplayRead,
  type LiveDashboardEventStreamEntry,
  type LiveDashboardEventStreamPort
} from "../src/services/live-dashboard-event.gateway";

class SharedStreamState {
  public readonly entries: LiveDashboardEventStreamEntry[] = [];
  public readonly listeners = new Set<() => void>();
  public serverNowMs = 1_700_000_000_000;
  public sequence = -1;
}

class MemoryEventStream implements LiveDashboardEventStreamPort {
  public appendCalls = 0;
  public broadcastCalls = 0;
  public readCalls = 0;
  public subscribeCalls = 0;

  public constructor(private readonly state: SharedStreamState) {}

  public async append(event: string): Promise<LiveDashboardEventStreamEntry> {
    this.appendCalls += 1;
    this.state.sequence += 1;
    const entry = { id: `${this.state.serverNowMs}-${this.state.sequence}`, event };
    this.state.entries.push(entry);
    const cutoff = this.state.serverNowMs - 5 * 60 * 1000;
    while (this.state.entries[0] && Number(this.state.entries[0].id.split("-")[0]) < cutoff) {
      this.state.entries.shift();
    }
    if (this.state.entries.length > 100)
      this.state.entries.splice(0, this.state.entries.length - 100);
    return entry;
  }

  public async broadcast(entry: LiveDashboardEventStreamEntry): Promise<void> {
    void entry;
    this.broadcastCalls += 1;
    for (const listener of this.state.listeners) listener();
  }

  public async readAfter(lastEventId: string | null): Promise<LiveDashboardEventStreamEntry[]> {
    this.readCalls += 1;
    const cutoff = `${this.state.serverNowMs - 5 * 60 * 1000}-0`;
    return this.state.entries
      .filter(
        (entry) =>
          compareIds(entry.id, cutoff) >= 0 &&
          (!lastEventId || compareIds(entry.id, lastEventId) > 0)
      )
      .slice(-100);
  }

  public async readRetained(lastEventId: string | null): Promise<LiveDashboardReplayRead> {
    this.readCalls += 1;
    const cutoff = `${this.state.serverNowMs - 5 * 60 * 1000}-0`;
    if (
      lastEventId &&
      !this.state.entries.some(
        (entry) => entry.id === lastEventId && compareIds(entry.id, cutoff) >= 0
      )
    ) {
      return { status: "reset_required", entries: [] };
    }
    return {
      status: "ready",
      entries: this.state.entries
        .filter(
          (entry) =>
            compareIds(entry.id, cutoff) >= 0 &&
            (!lastEventId || compareIds(entry.id, lastEventId) > 0)
        )
        .slice(0, 100)
    };
  }

  public async subscribe(listener: () => void): Promise<() => Promise<void>> {
    this.subscribeCalls += 1;
    this.state.listeners.add(listener);
    return async () => {
      this.state.listeners.delete(listener);
    };
  }

  public async close(): Promise<void> {}

  public emitRaw(entry: LiveDashboardEventStreamEntry): void {
    void entry;
    for (const listener of this.state.listeners) listener();
  }
}

class RecoveringStream extends MemoryEventStream {
  private failures = 1;

  public override async subscribe(listener: () => void): Promise<() => Promise<void>> {
    if (this.failures > 0) {
      this.failures -= 1;
      this.subscribeCalls += 1;
      throw new Error("redis temporarily unavailable");
    }
    return super.subscribe(listener);
  }
}

class FailingReplayStream extends MemoryEventStream {
  private failures = 1;

  public override async readRetained(lastEventId: string | null): Promise<LiveDashboardReplayRead> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("redis range unavailable");
    }
    return super.readRetained(lastEventId);
  }
}

class FailingDrainStream extends MemoryEventStream {
  private failures = 1;

  public override async readAfter(
    lastEventId: string | null
  ): Promise<LiveDashboardEventStreamEntry[]> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("redis drain unavailable");
    }
    return super.readAfter(lastEventId);
  }
}

class DeferredSubscriptionStream extends MemoryEventStream {
  public readonly unsubscribe = jest.fn(async () => undefined);
  public releaseSubscription!: () => void;
  public closeCalls = 0;

  public override subscribe(): Promise<() => Promise<void>> {
    this.subscribeCalls += 1;
    return new Promise((resolve) => {
      this.releaseSubscription = () => resolve(this.unsubscribe);
    });
  }

  public override async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

class DeferredReplayStream extends MemoryEventStream {
  public readonly unsubscribe = jest.fn(async () => undefined);
  public releaseReplay!: () => void;

  public override async subscribe(): Promise<() => Promise<void>> {
    this.subscribeCalls += 1;
    return this.unsubscribe;
  }

  public override readRetained(): Promise<LiveDashboardReplayRead> {
    this.readCalls += 1;
    return new Promise((resolve) => {
      this.releaseReplay = () => resolve({ status: "ready", entries: [] });
    });
  }
}

class DeferredCursorStream extends MemoryEventStream {
  public readonly unsubscribe = jest.fn(async () => undefined);
  public releaseCursor!: () => void;

  public override async subscribe(): Promise<() => Promise<void>> {
    this.subscribeCalls += 1;
    return this.unsubscribe;
  }

  public override readRetained(): Promise<LiveDashboardReplayRead> {
    this.readCalls += 1;
    return new Promise((resolve) => {
      this.releaseCursor = () => resolve({ status: "ready", entries: [] });
    });
  }
}

const compareIds = (left: string, right: string): number => {
  const [leftMs = "0", leftSequence = "0"] = left.split("-");
  const [rightMs = "0", rightSequence = "0"] = right.split("-");
  const ms = BigInt(leftMs) - BigInt(rightMs);
  if (ms !== 0n) return ms > 0n ? 1 : -1;
  const sequence = BigInt(leftSequence) - BigInt(rightSequence);
  return sequence === 0n ? 0 : sequence > 0n ? 1 : -1;
};

class FakeResponse extends EventEmitter {
  public readonly headers = new Map<string, string>();
  public readonly writes: string[] = [];
  public statusCode = 0;
  public ended = false;
  public endCalls = 0;
  public writable = true;

  public status(code: number): this {
    this.statusCode = code;
    return this;
  }

  public setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  public flushHeaders(): void {}

  public write(chunk: string): boolean {
    this.writes.push(chunk);
    return this.writable;
  }

  public end(): void {
    this.endCalls += 1;
    if (this.ended) return;
    this.ended = true;
    this.emit("close");
  }
}

type OrderChangedEvent = Extract<LiveDashboardEvent, { type: "order.changed" }>;

const orderEvent = (overrides: Partial<OrderChangedEvent> = {}): OrderChangedEvent => ({
  id: "1700000000000-1",
  type: "order.changed",
  scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
  payload: {
    orderNo: "ND202609060001",
    status: "confirmed",
    serviceName: "整体",
    amountJpy: 9000
  },
  createdAt: "2026-09-06T00:00:00.000Z",
  ...overrides
});

const storedOrderEvent = (overrides: Partial<OrderChangedEvent> = {}): string => {
  const stored = { ...orderEvent(overrides) };
  delete (stored as Partial<OrderChangedEvent>).id;
  return JSON.stringify(stored);
};

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

describe("LiveDashboardEventGateway", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("uses shared stream IDs and replay across gateways with equal and backward clocks", async () => {
    const state = new SharedStreamState();
    const streamA = new MemoryEventStream(state);
    const streamB = new MemoryEventStream(state);
    const gatewayA = new LiveDashboardEventGateway({
      eventStream: streamA,
      now: () => new Date("2026-09-06T00:00:02.000Z")
    });
    const gatewayB = new LiveDashboardEventGateway({
      eventStream: streamB,
      now: () => new Date("2020-01-01T00:00:00.000Z")
    });

    const first = await gatewayA.publish(orderEvent({ id: "9999999999999-9" }));
    const second = await gatewayB.publish(orderEvent({ id: "0000000000000-0" }));
    const third = await gatewayA.publish(orderEvent());
    const ids = [first?.id, second?.id, third?.id];
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([...ids].sort());

    const replay = new FakeResponse();
    await gatewayB.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      first!.id,
      replay as unknown as Response
    );
    const replayIds = replay.writes
      .join("")
      .match(/^id: (\d{13}-\d+)$/gm)
      ?.map((line) => line.slice(4));
    expect(replayIds).toEqual([second!.id, third!.id]);
    await Promise.all([gatewayA.close(), gatewayB.close()]);
  });

  it("treats reversed Pub/Sub payloads as wakeups and drains stream order exactly once", async () => {
    const state = new SharedStreamState();
    state.serverNowMs = 1_000;
    const streamA = new MemoryEventStream(state);
    const streamB = new MemoryEventStream(state);
    const gatewayA = new LiveDashboardEventGateway({ eventStream: streamA });
    const gatewayB = new LiveDashboardEventGateway({ eventStream: streamB });
    const response = new FakeResponse();
    await gatewayB.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response
    );

    const first = await streamA.append(storedOrderEvent());
    const second = await streamB.append(
      storedOrderEvent({
        payload: { ...orderEvent().payload, orderNo: "ND202609060002" }
      })
    );
    await streamB.broadcast(second);
    await streamA.broadcast(first);
    await Promise.resolve();

    const ids = response.writes
      .join("")
      .match(/^id: (\d+-\d+)$/gm)
      ?.map((line) => line.slice(4));
    expect(ids).toEqual([first.id, second.id]);
    await Promise.all([gatewayA.close(), gatewayB.close()]);
  });

  it("fences replay, audit, registration, and connected before draining a joining-client wakeup", async () => {
    const state = new SharedStreamState();
    state.serverNowMs = 1_000;
    const stream = new MemoryEventStream(state);
    const first = await stream.append(storedOrderEvent());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    let between!: LiveDashboardEventStreamEntry;
    const beforeConnect = jest.fn(async () => {
      state.serverNowMs = 1_001;
      between = await stream.append(
        storedOrderEvent({
          payload: { ...orderEvent().payload, orderNo: "ND202609060002" }
        })
      );
      await stream.broadcast(between);
    });

    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response,
      beforeConnect
    );
    await flushMicrotasks();

    const output = response.writes.join("");
    expect(beforeConnect).toHaveBeenCalledTimes(1);
    expect(output.match(new RegExp(`id: ${first.id}`, "g"))).toHaveLength(1);
    expect(output.match(new RegExp(`id: ${between.id}`, "g"))).toHaveLength(1);
    expect(output.indexOf(`id: ${first.id}`)).toBeLessThan(output.indexOf("event: connected"));
    expect(output.indexOf("event: connected")).toBeLessThan(output.indexOf(`id: ${between.id}`));
    await gateway.close();
  });

  it("uses one process subscription and fans out only to the country and region ancestors", async () => {
    const stream = new MemoryEventStream(new SharedStreamState());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const japan = new FakeResponse();
    const tokyo = new FakeResponse();
    const shinjuku = new FakeResponse();
    const osaka = new FakeResponse();

    await Promise.all([
      gateway.subscribe(
        { countryCode: "JP", admin1Code: null, admin2Code: null },
        null,
        japan as unknown as Response
      ),
      gateway.subscribe(
        { countryCode: "JP", admin1Code: "13", admin2Code: null },
        null,
        tokyo as unknown as Response
      ),
      gateway.subscribe(
        { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
        null,
        shinjuku as unknown as Response
      ),
      gateway.subscribe(
        { countryCode: "JP", admin1Code: "27", admin2Code: "27128" },
        null,
        osaka as unknown as Response
      )
    ]);

    await gateway.publish(orderEvent());

    expect(stream.subscribeCalls).toBe(1);
    for (const response of [japan, tokyo, shinjuku]) {
      expect(response.writes.join("")).toContain("event: order.changed");
      expect(response.writes.join("")).toContain("ND202609060001");
    }
    expect(osaka.writes.join("")).not.toContain("ND202609060001");
    expect(JSON.stringify(shinjuku.writes)).not.toMatch(
      /customer(?:Name|Id)?|address|phone|email|note|actorId|shopId|technicianId/i
    );
    await gateway.close();
  });

  it("writes retry and connected frames, replays bounded newer events, and heartbeats every 30 seconds", async () => {
    const state = new SharedStreamState();
    const gateway = new LiveDashboardEventGateway({
      eventStream: new MemoryEventStream(state),
      now: () => new Date("2026-09-06T00:00:02.000Z")
    });
    const first = await gateway.publish(orderEvent({ id: "9999999999999-9" }));
    state.serverNowMs += 1_000;
    const second = await gateway.publish(
      orderEvent({ id: "1700000001000-0", createdAt: "2026-09-06T00:00:01.000Z" })
    );
    const response = new FakeResponse();

    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      first!.id,
      response as unknown as Response
    );

    const initial = response.writes.join("");
    expect(initial).toContain("retry: 5000\n\n");
    expect(initial).toContain("event: connected");
    expect(initial).not.toContain(`id: ${first!.id}\nevent: order.changed`);
    expect(initial).toContain(`id: ${second!.id}\nevent: order.changed`);
    expect(initial.indexOf("event: order.changed")).toBeLessThan(
      initial.indexOf("event: connected")
    );

    await jest.advanceTimersByTimeAsync(29_999);
    expect(response.writes.join("")).not.toContain(": heartbeat\n\n");
    await jest.advanceTimersByTimeAsync(1);
    expect(response.writes.join("")).toContain(": heartbeat\n\n");
    await gateway.close();
  });

  it("runs one process recovery drain while staggered client heartbeats remain per response", async () => {
    const stream = new MemoryEventStream(new SharedStreamState());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const first = new FakeResponse();
    const second = new FakeResponse();
    const stopFirst = await gateway.subscribe(
      { countryCode: "JP", admin1Code: null, admin2Code: null },
      null,
      first as unknown as Response
    );
    await jest.advanceTimersByTimeAsync(10_000);
    const stopSecond = await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: null },
      null,
      second as unknown as Response
    );
    const baselineReads = stream.readCalls;

    await jest.advanceTimersByTimeAsync(20_000);
    expect(stream.readCalls - baselineReads).toBe(1);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(stream.readCalls - baselineReads).toBe(1);
    expect(first.writes.join("")).toContain(": heartbeat\n\n");
    expect(second.writes.join("")).toContain(": heartbeat\n\n");
    stopFirst();
    stopSecond();
    expect(jest.getTimerCount()).toBe(0);
    expect(first.listenerCount("close") + first.listenerCount("error")).toBe(0);
    expect(second.listenerCount("close") + second.listenerCount("error")).toBe(0);
    await gateway.close();
  });

  it("rejects future, trimmed, unknown, and empty-stream cursors before SSE headers", async () => {
    const cases: Array<{ label: string; state: SharedStreamState; cursor: string }> = [];

    const empty = new SharedStreamState();
    empty.serverNowMs = 1_000;
    cases.push({ label: "empty", state: empty, cursor: "1000-0" });

    const future = new SharedStreamState();
    future.serverNowMs = 1_000;
    const futureStream = new MemoryEventStream(future);
    await futureStream.append(storedOrderEvent());
    cases.push({ label: "future", state: future, cursor: "1001-0" });

    const trimmed = new SharedStreamState();
    trimmed.serverNowMs = 1_000;
    const trimmedStream = new MemoryEventStream(trimmed);
    const trimmedId = (await trimmedStream.append(storedOrderEvent())).id;
    for (let index = 0; index < 100; index += 1) {
      await trimmedStream.append(storedOrderEvent());
    }
    cases.push({ label: "trimmed", state: trimmed, cursor: trimmedId });

    const unknown = new SharedStreamState();
    unknown.serverNowMs = 1_000;
    const unknownStream = new MemoryEventStream(unknown);
    await unknownStream.append(storedOrderEvent());
    unknown.serverNowMs = 1_002;
    await unknownStream.append(storedOrderEvent());
    cases.push({ label: "unknown", state: unknown, cursor: "1001-0" });

    for (const testCase of cases) {
      const gateway = new LiveDashboardEventGateway({
        eventStream: new MemoryEventStream(testCase.state)
      });
      const response = new FakeResponse();
      const error = await gateway
        .subscribe(
          { countryCode: "JP", admin1Code: null, admin2Code: null },
          testCase.cursor,
          response as unknown as Response
        )
        .then(
          () => null,
          (caught) => caught
        );
      await gateway.close();

      expect(error).toMatchObject({
        statusCode: 409,
        message: "error.live_dashboard.cursor_reset_required"
      });
      expect(response.statusCode).toBe(0);
      expect(response.headers.size).toBe(0);
      expect(response.writes.join("")).not.toContain("event: connected");
    }
  });

  it("accepts a retained cursor and a cursor equal to the current stream head", async () => {
    const state = new SharedStreamState();
    state.serverNowMs = 1_000;
    const stream = new MemoryEventStream(state);
    const first = await stream.append(storedOrderEvent());
    const head = await stream.append(
      storedOrderEvent({
        payload: { ...orderEvent().payload, orderNo: "ND202609060002" }
      })
    );
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const retained = new FakeResponse();
    const atHead = new FakeResponse();

    await gateway.subscribe(
      { countryCode: "JP", admin1Code: null, admin2Code: null },
      first.id,
      retained as unknown as Response
    );
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: null, admin2Code: null },
      head.id,
      atHead as unknown as Response
    );

    expect(retained.writes.join("")).toContain(`id: ${head.id}`);
    expect(retained.writes.join("")).toContain("event: connected");
    expect(atHead.writes.join("")).not.toContain(`id: ${head.id}`);
    expect(atHead.writes.join("")).toContain("event: connected");
    await gateway.close();
  });

  it("limits replay to 100 events received within the last five minutes", async () => {
    let nowMs = Date.parse("2026-09-06T00:00:00.000Z");
    const state = new SharedStreamState();
    state.serverNowMs = nowMs;
    const gateway = new LiveDashboardEventGateway({
      eventStream: new MemoryEventStream(state),
      now: () => new Date(nowMs)
    });
    for (let index = 0; index < 101; index += 1) {
      await gateway.publish({
        type: "order.changed",
        scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
        payload: {
          orderNo: `ND${index.toString().padStart(4, "0")}`,
          status: "confirmed",
          serviceName: "整体",
          amountJpy: 9000
        }
      });
      nowMs += 1;
      state.serverNowMs = nowMs;
    }
    const bounded = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      bounded as unknown as Response
    );
    expect(bounded.writes.join("").match(/event: order\.changed/g)).toHaveLength(100);
    expect(bounded.writes.join("")).not.toContain("ND0000");

    nowMs += 5 * 60 * 1000 + 1;
    state.serverNowMs = nowMs;
    const expired = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      expired as unknown as Response
    );
    expect(expired.writes.join("")).not.toContain("event: order.changed");
    await gateway.close();
  });

  it("generates monotonic stream-style IDs when the clock does not advance", async () => {
    const gateway = new LiveDashboardEventGateway({
      eventStream: new MemoryEventStream(new SharedStreamState()),
      cache: { invalidateScope: jest.fn(async () => undefined) },
      now: () => new Date(1_700_000_000_000)
    });
    const first = await gateway.publish({
      type: "metrics.invalidate",
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: null },
      payload: { sections: ["headline"] }
    });
    const second = await gateway.publish({
      type: "metrics.invalidate",
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: null },
      payload: { sections: ["orders"] }
    });

    expect(first?.id).toBe("1700000000000-0");
    expect(second?.id).toBe("1700000000000-1");
  });

  it("disconnects a slow client immediately instead of buffering writes", async () => {
    const gateway = new LiveDashboardEventGateway({
      eventStream: new MemoryEventStream(new SharedStreamState())
    });
    const response = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response
    );
    response.writable = false;

    await gateway.publish(orderEvent());

    expect(response.ended).toBe(true);
    const writes = response.writes.length;
    await gateway.publish(orderEvent({ id: "1700000000001-0" }));
    expect(response.writes).toHaveLength(writes);
  });

  it("rejects oversized events and strips non-allowlisted properties from local publishers", async () => {
    const errors: unknown[] = [];
    const gateway = new LiveDashboardEventGateway({
      eventStream: new MemoryEventStream(new SharedStreamState()),
      onError: (error) => errors.push(error)
    });
    const response = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response
    );
    const before = response.writes.length;

    await gateway.publish({
      ...(orderEvent() as unknown as Record<string, unknown>),
      customerName: "must-not-leak",
      payload: {
        ...orderEvent().payload,
        address: "secret",
        note: "secret",
        serviceName: "x".repeat(40 * 1024)
      }
    } as unknown as LiveDashboardEvent);

    expect(response.writes).toHaveLength(before);
    expect(errors).toHaveLength(1);
  });

  it("rejects malformed and privacy-expanding cross-process envelopes", async () => {
    const stream = new MemoryEventStream(new SharedStreamState());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response
    );
    const before = response.writes.length;

    stream.emitRaw({ id: "1700000000000-1", event: "not-json" });
    const stored = { ...orderEvent() };
    delete (stored as Partial<OrderChangedEvent>).id;
    stream.emitRaw({
      id: "1700000000000-2",
      event: JSON.stringify({
        ...stored,
        payload: { ...stored.payload, customerName: "secret" }
      })
    });

    expect(response.writes).toHaveLength(before);
    await gateway.close();
  });

  it("retries a failed process-wide Redis subscription without per-client subscriptions", async () => {
    const stream = new RecoveringStream(new SharedStreamState());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: null, admin2Code: null },
      null,
      new FakeResponse() as unknown as Response
    );
    expect(stream.subscribeCalls).toBe(1);

    await jest.advanceTimersByTimeAsync(5_000);

    expect(stream.subscribeCalls).toBe(2);
    await gateway.close();
  });

  it("drains an event appended during subscription outage after retry without a new wakeup", async () => {
    const state = new SharedStreamState();
    const stream = new RecoveringStream(state);
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response
    );
    const missing = await stream.append(storedOrderEvent());

    await jest.advanceTimersByTimeAsync(5_000);

    expect(response.writes.join("")).toContain(`id: ${missing.id}`);
    expect(response.writes.join("").match(new RegExp(`id: ${missing.id}`, "g"))).toHaveLength(1);
    await gateway.close();
  });

  it("recovers a lost sole wakeup on the periodic heartbeat drain", async () => {
    const state = new SharedStreamState();
    const stream = new MemoryEventStream(state);
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response
    );
    const missing = await stream.append(storedOrderEvent());

    await jest.advanceTimersByTimeAsync(30_000);

    expect(response.writes.join("").match(new RegExp(`id: ${missing.id}`, "g"))).toHaveLength(1);
    expect(response.writes.join("")).toContain(": heartbeat\n\n");
    await gateway.close();
  });

  it("propagates retained-read failure before audit or SSE headers and recovers on retry", async () => {
    const state = new SharedStreamState();
    const stream = new FailingReplayStream(state);
    const missing = await stream.append(storedOrderEvent());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const failed = new FakeResponse();

    const beforeConnect = jest.fn(async () => undefined);
    const error = await gateway
      .subscribe(
        { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
        null,
        failed as unknown as Response,
        beforeConnect
      )
      .then(
        () => null,
        (caught) => caught
      );

    expect(error).toMatchObject({ statusCode: 503, message: "error.dependency_unavailable" });
    expect(beforeConnect).not.toHaveBeenCalled();
    expect(failed.statusCode).toBe(0);
    expect(failed.headers.size).toBe(0);
    expect(failed.writes.join("")).not.toContain("event: connected");

    const recovered = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      recovered as unknown as Response,
      beforeConnect
    );
    expect(recovered.writes.join("").match(new RegExp(`id: ${missing.id}`, "g"))).toHaveLength(1);
    expect(recovered.writes.join("")).toContain("event: connected");
    await gateway.close();
  });

  it("uses the retained replay as establishment and performs no second fallible pre-connect drain", async () => {
    const state = new SharedStreamState();
    const stream = new FailingDrainStream(state);
    const missing = await stream.append(storedOrderEvent());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    const beforeConnect = jest.fn(async () => undefined);

    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response,
      beforeConnect
    );

    expect(beforeConnect).toHaveBeenCalledTimes(1);
    expect(response.ended).toBe(false);
    expect(response.writes.join("").match(new RegExp(`id: ${missing.id}`, "g"))).toHaveLength(1);
    expect(response.writes.join("")).toContain("event: connected");
    await gateway.close();
  });

  it("propagates audit failure before subscriber registration, headers, or connected", async () => {
    const stream = new MemoryEventStream(new SharedStreamState());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    const auditError = new Error("audit unavailable");

    const error = await gateway
      .subscribe(
        { countryCode: "JP", admin1Code: null, admin2Code: null },
        null,
        response as unknown as Response,
        async () => Promise.reject(auditError)
      )
      .then(
        () => null,
        (caught) => caught
      );

    expect(error).toBe(auditError);
    expect(response.statusCode).toBe(0);
    expect(response.headers.size).toBe(0);
    expect(response.writes).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
    await gateway.close();
  });

  it("cancels a late transport subscription and never installs a client after close", async () => {
    const stream = new DeferredSubscriptionStream(new SharedStreamState());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    const subscribing = gateway.subscribe(
      { countryCode: "JP", admin1Code: null, admin2Code: null },
      null,
      response as unknown as Response
    );
    await flushMicrotasks();
    let closeSettled = false;
    const closing = gateway.close().then(() => {
      closeSettled = true;
    });
    await flushMicrotasks();
    const settledBeforeRelease = closeSettled;

    stream.releaseSubscription();
    await Promise.all([subscribing, closing]);
    await gateway.close();

    expect(settledBeforeRelease).toBe(false);
    expect(stream.unsubscribe).toHaveBeenCalledTimes(1);
    expect(stream.closeCalls).toBe(1);
    expect(response.ended).toBe(true);
    expect(response.endCalls).toBe(1);
    expect(response.writes.join("")).not.toContain("event: connected");
    expect(jest.getTimerCount()).toBe(0);
    expect(response.listenerCount("close")).toBe(0);
    expect(response.listenerCount("error")).toBe(0);
  });

  it("does not reconnect or install timers when close wins an in-progress replay", async () => {
    const stream = new DeferredReplayStream(new SharedStreamState());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    const subscribing = gateway.subscribe(
      { countryCode: "JP", admin1Code: null, admin2Code: null },
      null,
      response as unknown as Response
    );
    await flushMicrotasks();

    const closing = gateway.close();
    stream.releaseReplay();
    await Promise.all([subscribing, closing]);

    expect(stream.unsubscribe).toHaveBeenCalledTimes(1);
    expect(response.ended).toBe(true);
    expect(response.endCalls).toBe(1);
    expect(response.writes.join("")).not.toContain("event: connected");
    expect(jest.getTimerCount()).toBe(0);
    expect(response.listenerCount("close")).toBe(0);
    expect(response.listenerCount("error")).toBe(0);
  });

  it("does not open headers when close wins the atomic retained-cursor read", async () => {
    const stream = new DeferredCursorStream(new SharedStreamState());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    const subscribing = gateway.subscribe(
      { countryCode: "JP", admin1Code: null, admin2Code: null },
      "1000-0",
      response as unknown as Response
    );
    await flushMicrotasks();

    const closing = gateway.close();
    stream.releaseCursor();
    await Promise.all([subscribing, closing]);

    expect(stream.unsubscribe).toHaveBeenCalledTimes(1);
    expect(response.ended).toBe(true);
    expect(response.endCalls).toBe(1);
    expect(response.statusCode).toBe(0);
    expect(response.headers.size).toBe(0);
    expect(response.writes).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("releases the serialized establishment gate once when close wins a pending audit", async () => {
    const stream = new DeferredCursorStream(new SharedStreamState());
    const gateway = new LiveDashboardEventGateway({ eventStream: stream });
    const response = new FakeResponse();
    let releaseAudit!: () => void;
    const beforeConnect = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseAudit = resolve;
        })
    );
    const subscribing = gateway.subscribe(
      { countryCode: "JP", admin1Code: null, admin2Code: null },
      null,
      response as unknown as Response,
      beforeConnect
    );
    await flushMicrotasks();
    stream.releaseCursor?.();
    await flushMicrotasks();
    expect(beforeConnect).toHaveBeenCalledTimes(1);

    const closing = gateway.close();
    await flushMicrotasks();
    releaseAudit();
    await Promise.all([subscribing, closing]);
    await gateway.close();

    expect(stream.unsubscribe).toHaveBeenCalledTimes(1);
    expect(response.endCalls).toBe(1);
    expect(response.statusCode).toBe(0);
    expect(response.headers.size).toBe(0);
    expect(response.writes).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("invalidates through the shared cache hook and contains invalidation failure", async () => {
    const errors: unknown[] = [];
    const cache = {
      invalidateScope: jest.fn(async () => {
        throw new Error("cache unavailable");
      })
    };
    const gateway = new LiveDashboardEventGateway({
      eventStream: new MemoryEventStream(new SharedStreamState()),
      cache,
      onError: (error, operation) => errors.push({ error, operation })
    });

    await expect(
      gateway.publish({
        type: "metrics.invalidate",
        scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
        payload: { sections: ["headline", "orders"] }
      })
    ).resolves.toBeNull();

    expect(cache.invalidateScope).toHaveBeenCalledWith({
      countryCode: "JP",
      admin1Code: "13",
      admin2Code: "13104"
    });
    expect(errors).toEqual([expect.objectContaining({ operation: "invalidate" })]);
  });

  it("awaits authoritative cache deletion before broadcasting metrics invalidation", async () => {
    const state = new SharedStreamState();
    const stream = new MemoryEventStream(state);
    let release!: () => void;
    const invalidation = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gateway = new LiveDashboardEventGateway({
      eventStream: stream,
      cache: { invalidateScope: jest.fn(() => invalidation) }
    });
    const response = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response
    );

    const publication = gateway.publish({
      type: "metrics.invalidate",
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      payload: { sections: ["headline"] }
    });
    await Promise.resolve();
    expect(stream.appendCalls).toBe(0);
    expect(response.writes.join("")).not.toContain("event: metrics.invalidate");

    release();
    await publication;
    expect(stream.appendCalls).toBe(1);
    expect(response.writes.join("")).toContain("event: metrics.invalidate");
    await gateway.close();
  });

  it("deletes the shared cache exactly once across two gateways", async () => {
    const state = new SharedStreamState();
    const deleteA = jest.fn(async () => undefined);
    const deleteB = jest.fn(async () => undefined);
    const gatewayA = new LiveDashboardEventGateway({
      eventStream: new MemoryEventStream(state),
      cache: { invalidateScope: deleteA }
    });
    const gatewayB = new LiveDashboardEventGateway({
      eventStream: new MemoryEventStream(state),
      cache: { invalidateScope: deleteB }
    });
    const remote = new FakeResponse();
    await gatewayB.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: null },
      null,
      remote as unknown as Response
    );

    await gatewayA.publish({
      type: "metrics.invalidate",
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      payload: { sections: ["orders"] }
    });

    expect(deleteA).toHaveBeenCalledTimes(1);
    expect(deleteB).not.toHaveBeenCalled();
    expect(remote.writes.join("").match(/event: metrics\.invalidate/g)).toHaveLength(1);
    await Promise.all([gatewayA.close(), gatewayB.close()]);
  });
});

describe("LiveDashboardCache regional invalidation", () => {
  it("deletes only the exact country and ancestor scope keys for all supported periods", async () => {
    const redis = {
      isOpen: true,
      connect: jest.fn(async () => undefined),
      get: jest.fn(),
      sendCommand: jest.fn(async (command: string[]) => Number(command[2]) / 2)
    };
    const cache = new LiveDashboardCache(() => redis);

    await cache.invalidateScope({
      countryCode: "JP",
      admin1Code: "13",
      admin2Code: "13104"
    });

    expect(redis.sendCommand).toHaveBeenCalledTimes(1);
    const command = redis.sendCommand.mock.calls[0]?.[0] ?? [];
    expect(command.slice(0, 3)).toEqual(["EVAL", expect.any(String), "18"]);
    const keys = command.slice(3, 12);
    const generationKeys = command.slice(12);
    expect(keys).toEqual(
      expect.arrayContaining([
        "dashboard:live:v1:JP:-:-:today",
        "dashboard:live:v1:JP:13:-:last7days",
        "dashboard:live:v1:JP:13:13104:last30days"
      ])
    );
    expect(keys).toHaveLength(9);
    expect(generationKeys).toEqual(keys.map((key) => `${key}:generation`));
    expect(keys.join(" ")).not.toContain(":27:");
    expect(keys.join(" ")).not.toContain(":13101:");
  });
});
