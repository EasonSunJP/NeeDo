import type { AppConfig } from "../config/env";
import { createRedisClient } from "../config/redis";
import { logger } from "../config/logger";
import { LiveDashboardCache } from "./live-dashboard-cache.service";
import { LIVE_DASHBOARD_EVENT_CHANNEL, LIVE_DASHBOARD_EVENT_STREAM_KEY, LiveDashboardEventGateway } from "./live-dashboard-event.gateway";
import { RedisLiveDashboardEventStream } from "./redis-live-dashboard-event-stream";
import { RedisRealtimeEventBus } from "./redis-realtime-event.bus";

/** Owns dedicated shared-domain clients, never the portal auth/session Redis pool. */
export const createLiveDashboardRuntime = (config: AppConfig) => {
  if (["needo-ops-api", "needo-merchant-api"].includes(config.SERVICE_NAME) && !config.LIVE_DASHBOARD_REDIS_URL) {
    throw new Error("LIVE_DASHBOARD_REDIS_URL is required for split API runtimes");
  }
  const sharedConfig = { ...config, REDIS_URL: config.LIVE_DASHBOARD_REDIS_URL ?? config.REDIS_URL };
  const cacheClient = createRedisClient(sharedConfig);
  cacheClient.on?.("error", (error) => logger.error({ error }, "Live dashboard cache Redis error"));
  const cache = new LiveDashboardCache(() => cacheClient);
  const streamClient = createRedisClient(sharedConfig);
  streamClient.on?.("error", (error) => logger.error({ error }, "Live dashboard stream Redis error"));
  const gateway = new LiveDashboardEventGateway({
    cache,
    eventStream: new RedisLiveDashboardEventStream({
      key: LIVE_DASHBOARD_EVENT_STREAM_KEY,
      client: streamClient,
      eventBus: new RedisRealtimeEventBus({
        channel: LIVE_DASHBOARD_EVENT_CHANNEL,
        publisher: createRedisClient(sharedConfig),
        subscriber: createRedisClient(sharedConfig),
        onError: (error, connection) => logger.error({ error, connection }, "Live dashboard Redis connection error")
      })
    }),
    onError: (error, operation) => logger.error({ error, operation }, "Live dashboard event delivery error")
  });
  let closing: Promise<void> | undefined;
  return {
    cache, gateway,
    close: (): Promise<void> => {
      closing ??= (async () => {
        try { await gateway.close(); }
        finally { if (cacheClient.isOpen) await cacheClient.quit(); }
      })();
      return closing;
    }
  };
};
