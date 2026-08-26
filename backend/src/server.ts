import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { disconnectRedis } from "./config/redis";
import { disconnectPrisma } from "./prisma/client";
import { IdentityApplicationPurgeRepository } from "./repositories/identity-application-purge.repository";
import { IdentityApplicationMediaFileStorage } from "./services/identity-application-media.storage";
import { IdentityApplicationPurgeService } from "./services/identity-application-purge.service";
import { createShutdownHandler } from "./server-shutdown";
import { IdentityApplicationPurgeWorker } from "./workers/identity-application-purge.worker";

const app = createApp(env);
const identityApplicationPurgeWorker = new IdentityApplicationPurgeWorker(
  new IdentityApplicationPurgeService(
    new IdentityApplicationPurgeRepository(),
    new IdentityApplicationMediaFileStorage(env.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR)
  ),
  logger,
  env.IDENTITY_APPLICATION_PURGE_INTERVAL_MS
);

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
      environment: env.NODE_ENV
    },
    "NeeDo backend started"
  );
});
identityApplicationPurgeWorker.start();

const shutdown = createShutdownHandler({
  closeServer: (callback) => server.close(callback),
  disconnect: async () => {
    await Promise.all([disconnectPrisma(), disconnectRedis()]);
  },
  exit: (code) => process.exit(code),
  logger,
  stopWorker: () => identityApplicationPurgeWorker.stop()
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
