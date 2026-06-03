import { createClient } from "redis";
import { env } from "./env";

export interface RedisEnvConfig {
  REDIS_URL: string;
  REDIS_CONNECT_TIMEOUT_MS: number;
  REDIS_RECONNECT_MAX_RETRIES: number;
  REDIS_RECONNECT_BASE_DELAY_MS: number;
  REDIS_RECONNECT_MAX_DELAY_MS: number;
}

export type RedisClient = ReturnType<typeof createClient>;

export interface RedisHealthClient {
  isOpen: boolean;
  connect: () => Promise<unknown>;
  ping: () => Promise<string>;
}

interface RedisHealthCheckOptions {
  timeoutMs?: number;
}

export type RedisHealthStatus =
  | {
      status: "ok";
      latencyMs: number;
      poolSize?: number;
      healthyClients?: number;
    }
  | {
      status: "error";
      message: string;
      poolSize?: number;
      healthyClients?: number;
    };

let redisPool: RedisClient[] | undefined;
let redisPoolCursor = 0;

const createReconnectStrategy =
  (config: RedisEnvConfig) =>
  (retries: number): false | number => {
    if (config.REDIS_RECONNECT_MAX_RETRIES === 0) {
      return false;
    }

    if (retries > config.REDIS_RECONNECT_MAX_RETRIES) {
      return false;
    }

    return Math.min(
      config.REDIS_RECONNECT_BASE_DELAY_MS * 2 ** retries,
      config.REDIS_RECONNECT_MAX_DELAY_MS
    );
  };

export const createRedisClient = (config: RedisEnvConfig = env): RedisClient =>
  createClient({
    url: config.REDIS_URL,
    socket: {
      connectTimeout: config.REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: createReconnectStrategy(config)
    }
  });

export const getRedisPool = (): RedisClient[] => {
  if (!redisPool) {
    redisPool = Array.from({ length: env.REDIS_POOL_SIZE }, () => createRedisClient());
  }

  return redisPool;
};

export const getRedisClient = (): RedisClient => {
  const pool = getRedisPool();
  const client = pool[redisPoolCursor % pool.length];
  redisPoolCursor += 1;

  return client;
};

export const checkRedisHealth = async (
  client?: RedisHealthClient,
  options: RedisHealthCheckOptions = {}
): Promise<RedisHealthStatus> => {
  const timeoutMs = options.timeoutMs ?? env.REDIS_CONNECT_TIMEOUT_MS;

  if (client) {
    return checkSingleRedisHealth(client, timeoutMs);
  }

  const pool = getRedisPool();
  const results = await Promise.all(
    pool.map((poolClient) => checkSingleRedisHealth(poolClient, timeoutMs))
  );
  const healthyClients = results.filter((result) => result.status === "ok").length;

  if (healthyClients === pool.length) {
    const latencies = results
      .filter(
        (result): result is Extract<RedisHealthStatus, { status: "ok" }> => result.status === "ok"
      )
      .map((result) => result.latencyMs);

    return {
      status: "ok",
      latencyMs: Math.max(...latencies),
      poolSize: pool.length,
      healthyClients
    };
  }

  return {
    status: "error",
    message: results
      .filter((result) => result.status === "error")
      .map((result) => result.message)
      .join("; "),
    poolSize: pool.length,
    healthyClients
  };
};

const checkSingleRedisHealth = async (
  client: RedisHealthClient,
  timeoutMs: number
): Promise<RedisHealthStatus> => {
  const startedAt = Date.now();

  try {
    if (!client.isOpen) {
      await withRedisOperationTimeout(client.connect(), timeoutMs);
    }

    const pong = await withRedisOperationTimeout(client.ping(), timeoutMs);

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

const withRedisOperationTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Redis operation timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (!redisPool) {
    return;
  }

  await Promise.all(
    redisPool.map(async (client) => {
      if (client.isOpen) {
        await client.quit();
      }
    })
  );

  redisPool = undefined;
  redisPoolCursor = 0;
};
