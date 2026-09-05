import type { Express } from "express";
import type { Server } from "node:http";
import { env, type AppConfig } from "./config/env";
import { logger } from "./config/logger";
import { checkRedisHealth, createRedisClient, disconnectRedis } from "./config/redis";
import { disconnectPrisma } from "./prisma/client";
import { createShutdownHandler } from "./server-shutdown";
import type { AppDependencies } from "./app";
import { RedisRealtimeEventBus } from "./services/redis-realtime-event.bus";
import { SseRealtimeEventGateway } from "./services/realtime-event.gateway";
import { OfficialNoticeRepository } from "./repositories/official-notice.repository";
import { OfficialNoticeWorker } from "./workers/official-notice.worker";

export type ApiApplicationFactory = (config: AppConfig, dependencies?: AppDependencies) => Express;

export const startApiServer = (
  createApplication: ApiApplicationFactory,
  config: AppConfig = env
): Server => {
  const realtimeEventGateway = new SseRealtimeEventGateway({
    eventBus: new RedisRealtimeEventBus({
      channel: config.REALTIME_REDIS_CHANNEL,
      publisher: createRedisClient(config),
      subscriber: createRedisClient(config),
      onError: (error, connection) =>
        logger.error({ error, connection }, "Realtime Redis connection error")
    }),
    onError: (error, operation) =>
      logger.error({ error, operation }, "Realtime event delivery error")
  });
  const officialNoticeRepository = new OfficialNoticeRepository(
    undefined,
    config.OFFICIAL_NOTICE_MAX_DELIVERY_ATTEMPTS,
    realtimeEventGateway
  );
  const noticeWorker = new OfficialNoticeWorker(officialNoticeRepository, {
    intervalMs: config.OFFICIAL_NOTICE_DELIVERY_INTERVAL_MS,
    batchSize: config.OFFICIAL_NOTICE_DELIVERY_BATCH_SIZE,
    logger
  });
  const app = createApplication(config, {
    redisHealthCheck: checkRedisHealth,
    realtimeEventGateway,
    officialNoticeRepository
  });
  const server = app.listen(config.PORT, () => {
    noticeWorker.start();
    logger.info(
      {
        apiPrefix: config.API_PREFIX,
        environment: config.NODE_ENV,
        port: config.PORT,
        service: config.SERVICE_NAME
      },
      "NeeDo API service started"
    );
  });
  const shutdown = createShutdownHandler({
    closeServer: (callback) => server.close(callback),
    disconnect: async () => {
      await Promise.all([disconnectPrisma(), disconnectRedis()]);
    },
    exit: (code) => process.exit(code),
    logger,
    stopWorker: async () => {
      try {
        await noticeWorker.stopAndDrain();
      } finally {
        await realtimeEventGateway.close();
      }
    }
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
};
