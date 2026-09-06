import { EventEmitter } from "node:events";
import type { Response } from "express";
import type { LiveDashboardEvent } from "../src/domain/live-dashboard";
import { LiveDashboardCache } from "../src/services/live-dashboard-cache.service";
import {
  LiveDashboardEventGateway,
  type LiveDashboardEventBusPort
} from "../src/services/live-dashboard-event.gateway";

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

class SharedBus implements LiveDashboardEventBusPort {
  public publishCalls = 0;
  public subscribeCalls = 0;
  public closeCalls = 0;
  private readonly listeners = new Set<(message: string) => void>();

  public async publish(message: string): Promise<void> {
    this.publishCalls += 1;
    for (const listener of this.listeners) listener(message);
  }

  public async subscribe(listener: (message: string) => void): Promise<() => Promise<void>> {
    this.subscribeCalls += 1;
    this.listeners.add(listener);
    return async () => {
      this.listeners.delete(listener);
    };
  }

  public emitRaw(message: string): void {
    for (const listener of this.listeners) listener(message);
  }

  public async close(): Promise<void> {
    this.closeCalls += 1;
    this.listeners.clear();
  }
}

class RecoveringBus extends SharedBus {
  private failures = 1;

  public override async subscribe(
    listener: (message: string) => void
  ): Promise<() => Promise<void>> {
    if (this.failures > 0) {
      this.failures -= 1;
      this.subscribeCalls += 1;
      throw new Error("redis temporarily unavailable");
    }
    return super.subscribe(listener);
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

  it("uses one process subscription and fans out only to the country and region ancestors", async () => {
    const bus = new SharedBus();
    const gateway = new LiveDashboardEventGateway({ eventBus: bus, instanceId: "live-a" });
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

    expect(bus.subscribeCalls).toBe(1);
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
    const gateway = new LiveDashboardEventGateway({
      now: () => new Date("2026-09-06T00:00:02.000Z")
    });
    await gateway.publish(orderEvent({ id: "1700000000000-1" }));
    await gateway.publish(
      orderEvent({ id: "1700000001000-0", createdAt: "2026-09-06T00:00:01.000Z" })
    );
    const response = new FakeResponse();

    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      "1700000000000-1",
      response as unknown as Response
    );

    const initial = response.writes.join("");
    expect(initial).toContain("retry: 5000\n\n");
    expect(initial).toContain("event: connected");
    expect(initial).not.toContain("id: 1700000000000-1\nevent: order.changed");
    expect(initial).toContain("id: 1700000001000-0\nevent: order.changed");
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
    const gateway = new LiveDashboardEventGateway({ now: () => new Date(nowMs) });
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
    const gateway = new LiveDashboardEventGateway({ now: () => new Date(1_700_000_000_000) });
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
    const gateway = new LiveDashboardEventGateway();
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
    const gateway = new LiveDashboardEventGateway({ onError: (error) => errors.push(error) });
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
    const bus = new SharedBus();
    const gateway = new LiveDashboardEventGateway({ eventBus: bus, instanceId: "live-b" });
    const response = new FakeResponse();
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      null,
      response as unknown as Response
    );
    const before = response.writes.length;

    bus.emitRaw("not-json");
    bus.emitRaw(
      JSON.stringify({
        sourceInstanceId: "live-a",
        event: { ...orderEvent(), payload: { ...orderEvent().payload, customerName: "secret" } }
      })
    );

    expect(response.writes).toHaveLength(before);
    await gateway.close();
  });

  it("retries a failed process-wide Redis subscription without per-client subscriptions", async () => {
    const bus = new RecoveringBus();
    const gateway = new LiveDashboardEventGateway({ eventBus: bus, instanceId: "live-a" });
    await gateway.subscribe(
      { countryCode: "JP", admin1Code: null, admin2Code: null },
      null,
      new FakeResponse() as unknown as Response
    );
    expect(bus.subscribeCalls).toBe(1);

    await jest.advanceTimersByTimeAsync(5_000);

    expect(bus.subscribeCalls).toBe(2);
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
      cache,
      onError: (error, operation) => errors.push({ error, operation })
    });

    await expect(
      gateway.publish({
        type: "metrics.invalidate",
        scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
        payload: { sections: ["headline", "orders"] }
      })
    ).resolves.toMatchObject({ type: "metrics.invalidate" });
    await Promise.resolve();

    expect(cache.invalidateScope).toHaveBeenCalledWith({
      countryCode: "JP",
      admin1Code: "13",
      admin2Code: "13104"
    });
    expect(errors).toEqual([expect.objectContaining({ operation: "invalidate" })]);
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
