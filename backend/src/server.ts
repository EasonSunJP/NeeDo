import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { disconnectRedis } from "./config/redis";
import { disconnectPrisma } from "./prisma/client";

const app = createApp(env);

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

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, "NeeDo backend shutdown requested");
  server.close((error) => {
    if (error) {
      logger.error({ error }, "NeeDo backend shutdown failed");
      process.exit(1);
    }

    Promise.all([disconnectPrisma(), disconnectRedis()])
      .then(() => {
        logger.info("NeeDo backend stopped");
        process.exit(0);
      })
      .catch((disconnectError) => {
        logger.error({ error: disconnectError }, "NeeDo backend dependency shutdown failed");
        process.exit(1);
      });
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
