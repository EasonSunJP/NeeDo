import { checkRedisHealth, createRedisClient } from "../src/config/redis";
import { ERROR_CODES } from "../src/constants/error-codes";
import { RedisAuthSessionStore } from "../src/services/auth-session.store";

describe("redis config", () => {
  it("creates a Redis client from the configured URL without opening a connection", async () => {
    const client = createRedisClient({
      REDIS_URL: "redis://localhost:6379",
      REDIS_CONNECT_TIMEOUT_MS: 5000,
      REDIS_RECONNECT_MAX_RETRIES: 0,
      REDIS_RECONNECT_BASE_DELAY_MS: 100,
      REDIS_RECONNECT_MAX_DELAY_MS: 3000
    });

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

  it("returns an error health result when Redis connect does not settle", async () => {
    const client = {
      isOpen: false,
      connect: async () => new Promise(() => undefined),
      ping: async () => "PONG"
    };

    await expect(checkRedisHealth(client, { timeoutMs: 5 })).resolves.toEqual({
      status: "error",
      message: "Redis operation timed out after 5ms"
    });
  });

  it("maps unavailable Redis session storage to a service unavailable error", async () => {
    const store = new RedisAuthSessionStore(
      () =>
        ({
          isOpen: false,
          connect: async () => {
            throw new Error("connect ECONNREFUSED 127.0.0.1:6379");
          }
        }) as never
    );

    await expect(store.getLoginLock("customer@example.com")).rejects.toMatchObject({
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "error.dependency.redis_unavailable",
      statusCode: 503
    });
  });

  it("times out unsettled Redis session storage operations", async () => {
    const store = new RedisAuthSessionStore(
      () =>
        ({
          isOpen: false,
          connect: async () => new Promise(() => undefined)
        }) as never,
      { operationTimeoutMs: 5 }
    );

    await expect(store.getLoginLock("customer@example.com")).rejects.toMatchObject({
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "error.dependency.redis_unavailable",
      statusCode: 503
    });
  });
});
