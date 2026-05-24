import { checkRedisHealth, createRedisClient } from "../src/config/redis";

describe("redis config", () => {
  it("creates a Redis client from the configured URL without opening a connection", async () => {
    const client = createRedisClient({ REDIS_URL: "redis://localhost:6379" });

    expect(client.isOpen).toBe(false);
  });

  it("connects before pinging a closed Redis client", async () => {
    const calls: string[] = [];
    const client = {
      isOpen: false,
      connect: async () => {
        calls.push("connect");
        client.isOpen = true;
      },
      ping: async () => {
        calls.push("ping");
        return "PONG";
      }
    };

    await expect(checkRedisHealth(client)).resolves.toEqual({
      status: "ok",
      latencyMs: expect.any(Number)
    });
    expect(calls).toEqual(["connect", "ping"]);
  });

  it("returns an error health result instead of throwing", async () => {
    const client = {
      isOpen: true,
      connect: async () => undefined,
      ping: async () => {
        throw new Error("connection refused");
      }
    };

    await expect(checkRedisHealth(client)).resolves.toEqual({
      status: "error",
      message: "connection refused"
    });
  });
});
