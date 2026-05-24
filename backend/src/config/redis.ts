import { createClient } from "redis";
import { env } from "./env";

export interface RedisEnvConfig {
  REDIS_URL: string;
}

export type RedisClient = ReturnType<typeof createClient>;

export interface RedisHealthClient {
  isOpen: boolean;
  connect: () => Promise<unknown>;
  ping: () => Promise<string>;
}

export type RedisHealthStatus =
  | {
      status: "ok";
      latencyMs: number;
    }
  | {
      status: "error";
      message: string;
    };

let redisClient: RedisClient | undefined;

export const createRedisClient = (config: RedisEnvConfig = env): RedisClient =>
  createClient({
    url: config.REDIS_URL,
    socket: {
      reconnectStrategy: false
    }
  });

export const getRedisClient = (): RedisClient => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }

  return redisClient;
};

export const checkRedisHealth = async (
  client: RedisHealthClient = getRedisClient()
): Promise<RedisHealthStatus> => {
  const startedAt = Date.now();

  try {
    if (!client.isOpen) {
      await client.connect();
    }

    const pong = await client.ping();

    if (pong !== "PONG") {
      return {
        status: "error",
        message: `Unexpected Redis ping response: ${pong}`
      };
    }

    return {
      status: "ok",
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Redis health check error"
    };
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (!redisClient) {
    return;
  }

  if (redisClient.isOpen) {
    await redisClient.quit();
  }

  redisClient = undefined;
};
