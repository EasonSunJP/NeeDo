import { RedisRealtimeEventBus } from "../src/services/redis-realtime-event.bus";

class FakeRedisClient {
  public isOpen = false;
  public readonly published: Array<{ channel: string; message: string }> = [];
  public subscribeCalls = 0;
  public unsubscribeCalls = 0;
  public quitCalls = 0;
  private listener?: (message: string) => void;

  public async connect(): Promise<void> {
    this.isOpen = true;
  }

  public async publish(channel: string, message: string): Promise<number> {
    this.published.push({ channel, message });
    return 1;
  }

  public async subscribe(channel: string, listener: (message: string) => void): Promise<void> {
    void channel;
    this.subscribeCalls += 1;
    this.listener = listener;
  }

  public async unsubscribe(channel: string): Promise<void> {
    void channel;
    this.unsubscribeCalls += 1;
  }

  public emit(message: string): void {
    this.listener?.(message);
  }

  public async quit(): Promise<void> {
    this.quitCalls += 1;
    this.isOpen = false;
  }

  public on(): this {
    return this;
  }
}

describe("RedisRealtimeEventBus", () => {
  it("uses one Redis channel subscription for all local listeners", async () => {
    const publisher = new FakeRedisClient();
    const subscriber = new FakeRedisClient();
    const bus = new RedisRealtimeEventBus({
      channel: "needo:realtime:test",
      publisher: publisher as never,
      subscriber: subscriber as never
    });
    const first = jest.fn();
    const second = jest.fn();

    await bus.subscribe(first);
    await bus.subscribe(second);
    subscriber.emit("event-payload");

    expect(subscriber.subscribeCalls).toBe(1);
    expect(first).toHaveBeenCalledWith("event-payload");
    expect(second).toHaveBeenCalledWith("event-payload");
    await bus.close();
    expect(subscriber.unsubscribeCalls).toBe(1);
    expect(subscriber.quitCalls).toBe(1);
  });

  it("publishes through a dedicated Redis connection and closes it cleanly", async () => {
    const publisher = new FakeRedisClient();
    const subscriber = new FakeRedisClient();
    const bus = new RedisRealtimeEventBus({
      channel: "needo:realtime:test",
      publisher: publisher as never,
      subscriber: subscriber as never
    });

    await bus.publish("event-payload");

    expect(publisher.published).toEqual([
      { channel: "needo:realtime:test", message: "event-payload" }
    ]);
    await bus.close();
    expect(publisher.quitCalls).toBe(1);
  });
});
