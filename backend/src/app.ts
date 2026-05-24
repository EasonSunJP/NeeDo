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
import type { AuditLogRepositoryPort } from "./repositories/audit-log.repository";
import type { AuthRepositoryPort } from "./repositories/auth.repository";
import type { BookingRepositoryPort } from "./repositories/booking.repository";
import type { CoreReadRepositoryPort } from "./repositories/core-read.repository";
import type { PermissionRepositoryPort } from "./repositories/permission.repository";
import type { RoleRepositoryPort } from "./repositories/role.repository";
import type { UserRepositoryPort } from "./repositories/user.repository";
import { createAuthRoutes } from "./routes/auth.routes";
import { createBookingRoutes } from "./routes/booking.routes";
import { createCoreReadRoutes } from "./routes/core-read.routes";
import { createHealthRoutes } from "./routes/health.routes";
import { createPermissionRoutes } from "./routes/permission.routes";
import { createRoleRoutes } from "./routes/role.routes";
import { createUserRoutes } from "./routes/user.routes";
import type { OtpDeliveryClient } from "./services/auth-otp-delivery.service";
import type { AuthSessionStore } from "./services/auth-session.store";

export interface AppDependencies {
  redisHealthCheck: () => Promise<RedisHealthStatus>;
  authRepository?: AuthRepositoryPort;
  authSessionStore?: AuthSessionStore;
  otpDeliveryClient?: OtpDeliveryClient;
  auditLogRepository?: AuditLogRepositoryPort;
  permissionRepository?: PermissionRepositoryPort;
  roleRepository?: RoleRepositoryPort;
  userRepository?: UserRepositoryPort;
  coreReadRepository?: CoreReadRepositoryPort;
  bookingRepository?: BookingRepositoryPort;
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
  apiRouter.use(createAuthRoutes(config, dependencies));
  apiRouter.use(createPermissionRoutes(config, dependencies));
  apiRouter.use(createRoleRoutes(config, dependencies));
  apiRouter.use(createUserRoutes(config, dependencies));
  apiRouter.use(createCoreReadRoutes(dependencies));
  apiRouter.use(createBookingRoutes(config, dependencies));
  if (config.OPENAPI_ENABLED) {
    apiRouter.use(createOpenApiRoutes(config));
  }

  app.use(config.API_PREFIX, apiRouter);
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};
