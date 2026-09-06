import { EventEmitter } from "node:events";
import type { Response } from "express";
import type { LiveDashboardEvent } from "../src/domain/live-dashboard";
import { LiveDashboardCache } from "../src/services/live-dashboard-cache.service";
import {
  LiveDashboardEventGateway,
  type LiveDashboardEventStreamEntry,
  type LiveDashboardEventStreamPort
} from "../src/services/live-dashboard-event.gateway";

class SharedStreamState {
  public readonly entries: LiveDashboardEventStreamEntry[] = [];
  public readonly listeners = new Set<(entry: LiveDashboardEventStreamEntry) => void>();
  public serverNowMs = 1_700_000_000_000;
  public sequence = -1;
}

class MemoryEventStream implements LiveDashboardEventStreamPort {
  public appendCalls = 0;
  public broadcastCalls = 0;
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
    this.broadcastCalls += 1;
    for (const listener of this.state.listeners) listener(entry);
  }

  public async readAfter(lastEventId: string | null): Promise<LiveDashboardEventStreamEntry[]> {
    const cutoff = `${this.state.serverNowMs - 5 * 60 * 1000}-0`;
    return this.state.entries
      .filter(
        (entry) =>
          compareIds(entry.id, cutoff) >= 0 &&
          (!lastEventId || compareIds(entry.id, lastEventId) > 0)
      )
      .slice(-100);
  }

  public async subscribe(
    listener: (entry: LiveDashboardEventStreamEntry) => void
  ): Promise<() => Promise<void>> {
    this.subscribeCalls += 1;
    this.state.listeners.add(listener);
    return async () => {
      this.state.listeners.delete(listener);
    };
  }

  public async close(): Promise<void> {}

  public emitRaw(entry: LiveDashboardEventStreamEntry): void {
    for (const listener of this.state.listeners) listener(entry);
  }
}

class RecoveringStream extends MemoryEventStream {
  private failures = 1;

  public override async subscribe(
    listener: (entry: LiveDashboardEventStreamEntry) => void
  ): Promise<() => Promise<void>> {
    if (this.failures > 0) {
      this.failures -= 1;
      this.subscribeCalls += 1;
      throw new Error("redis temporarily unavailable");
    }
    return super.subscribe(listener);
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
      "0000000000000-0",
      bounded as unknown as Response
    );
    expect(bounded.writes.join("").match(/event: order\.changed/g)).toHaveLength(100);
    expect(bounded.writes.join("")).not.toContain("ND0000");

    nowMs += 5 * 60 * 1000 + 1;
    state.serverNowMs = nowMs;
    const expired = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      "0000000000000-0",
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
      set: jest.fn(),
      del: jest.fn(async (keys: string[]) => keys.length)
    };
    const cache = new LiveDashboardCache(() => redis);

    await cache.invalidateScope({
      countryCode: "JP",
      admin1Code: "13",
      admin2Code: "13104"
    });

    expect(redis.del).toHaveBeenCalledTimes(1);
    const keys = redis.del.mock.calls[0]?.[0] ?? [];
    expect(keys).toEqual(
      expect.arrayContaining([
        "dashboard:live:v1:JP:-:-:today",
        "dashboard:live:v1:JP:13:-:last7days",
        "dashboard:live:v1:JP:13:13104:last30days"
      ])
    );
    expect(keys).toHaveLength(9);
    expect(keys.join(" ")).not.toContain(":27:");
    expect(keys.join(" ")).not.toContain(":13101:");
  });
});
