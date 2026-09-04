import type { Express } from "express";
import type { Server } from "node:http";
import { env, type AppConfig } from "./config/env";
import { logger } from "./config/logger";
import { disconnectRedis } from "./config/redis";
import { disconnectPrisma } from "./prisma/client";
import { createShutdownHandler } from "./server-shutdown";

export type ApiApplicationFactory = (config: AppConfig) => Express;

export const startApiServer = (
  createApplication: ApiApplicationFactory,
  config: AppConfig = env
): Server => {
  const app = createApplication(config);
  const server = app.listen(config.PORT, () => {
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
    stopWorker: () => undefined
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
};
