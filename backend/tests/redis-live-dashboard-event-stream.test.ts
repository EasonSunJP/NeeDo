import {
  RedisLiveDashboardEventStream,
  type RedisLiveDashboardStreamClient
} from "../src/services/redis-live-dashboard-event-stream";

describe("RedisLiveDashboardEventStream", () => {
  it("uses Redis-assigned stream IDs and exact bounded retention", async () => {
    const sendCommand = jest.fn().mockResolvedValueOnce("1700000000000-0").mockResolvedValueOnce(1);
    const client: RedisLiveDashboardStreamClient = {
      isOpen: false,
      connect: jest.fn(async () => undefined),
      sendCommand,
      quit: jest.fn(async () => undefined)
    };
    const bus = {
      publish: jest.fn(async () => undefined),
      subscribe: jest.fn(async () => async () => undefined),
      close: jest.fn(async () => undefined)
    };
    const stream = new RedisLiveDashboardEventStream({
      key: "live-stream",
      client,
      eventBus: bus
    });

    await expect(stream.append('{"type":"order.changed"}')).resolves.toEqual({
      id: "1700000000000-0",
      event: '{"type":"order.changed"}'
    });
    expect(sendCommand).toHaveBeenNthCalledWith(1, [
      "XADD",
      "live-stream",
      "MAXLEN",
      "=",
      "100",
      "*",
      "event",
      '{"type":"order.changed"}'
    ]);
    expect(sendCommand).toHaveBeenNthCalledWith(2, [
      "XTRIM",
      "live-stream",
      "MINID",
      "=",
      "1699999700000-0"
    ]);
  });

  it("reads a maximum of 100 entries after the cursor within Redis server five-minute time", async () => {
    const client: RedisLiveDashboardStreamClient = {
      isOpen: true,
      connect: jest.fn(async () => undefined),
      sendCommand: jest
        .fn()
        .mockResolvedValueOnce(["1700000300", "0"])
        .mockResolvedValueOnce([["1700000000001-0", ["event", '{"type":"order.changed"}']]]),
      quit: jest.fn(async () => undefined)
    };
    const stream = new RedisLiveDashboardEventStream({
      key: "live-stream",
      client,
      eventBus: {
        publish: jest.fn(async () => undefined),
        subscribe: jest.fn(async () => async () => undefined),
        close: jest.fn(async () => undefined)
      }
    });

    await expect(stream.readAfter("1700000000000-0")).resolves.toEqual([
      { id: "1700000000001-0", event: '{"type":"order.changed"}' }
    ]);
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, [
      "XRANGE",
      "live-stream",
      "(1700000000000-0",
      "+",
      "COUNT",
      "100"
    ]);
  });

  it("broadcasts strict entries and closes the dedicated client and bus", async () => {
    let listener: ((message: string) => void) | undefined;
    const unsubscribe = jest.fn(async () => undefined);
    const bus = {
      publish: jest.fn(async () => undefined),
      subscribe: jest.fn(async (next: (message: string) => void) => {
        listener = next;
        return unsubscribe;
      }),
      close: jest.fn(async () => undefined)
    };
    const client: RedisLiveDashboardStreamClient = {
      isOpen: true,
      connect: jest.fn(async () => undefined),
      sendCommand: jest.fn(),
      quit: jest.fn(async () => undefined)
    };
    const stream = new RedisLiveDashboardEventStream({ key: "live-stream", client, eventBus: bus });
    const received = jest.fn();
    const stop = await stream.subscribe(received);
    const entry = { id: "1700000000000-0", event: "{}" };

    await stream.broadcast(entry);
    listener?.(JSON.stringify(entry));
    listener?.(JSON.stringify({ ...entry, private: true }));
    expect(bus.publish).toHaveBeenCalledWith(JSON.stringify(entry));
    expect(received).toHaveBeenCalledTimes(1);

    await stop();
    await stream.close();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(bus.close).toHaveBeenCalledTimes(1);
  });
});
