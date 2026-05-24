import express, { Router, type Express } from "express";
import { createOpenApiRoutes } from "./api/openapi";
import { env, type AppConfig } from "./config/env";
import { checkRedisHealth, type RedisHealthStatus } from "./config/redis";
import { errorMiddleware } from "./middlewares/error.middleware";
import { notFoundMiddleware } from "./middlewares/not-found.middleware";
import { createRequestLoggerMiddleware } from "./middlewares/request-logger.middleware";
import {
  createCorsMiddleware,
  createHelmetMiddleware,
  createRateLimitMiddleware
} from "./middlewares/security.middleware";
import { createHealthRoutes } from "./routes/health.routes";

export interface AppDependencies {
  redisHealthCheck: () => Promise<RedisHealthStatus>;
}

const createDefaultAppDependencies = (): AppDependencies => ({
  redisHealthCheck: checkRedisHealth
});

export const createApp = (
  config: AppConfig = env,
  dependencies: AppDependencies = createDefaultAppDependencies()
): Express => {
  const app = express();
  const apiRouter = Router();

  app.disable("x-powered-by");
  app.use(createRequestLoggerMiddleware(config));
  app.use(createHelmetMiddleware());
  app.use(createCorsMiddleware(config));
  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: config.REQUEST_BODY_LIMIT }));
  app.use(createRateLimitMiddleware(config));

  apiRouter.use(createHealthRoutes(config, dependencies));
  if (config.OPENAPI_ENABLED) {
    apiRouter.use(createOpenApiRoutes(config));
  }

  app.use(config.API_PREFIX, apiRouter);
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};
