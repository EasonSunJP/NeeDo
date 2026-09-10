import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { AnalyticsRankingController } from "../controllers/analytics-ranking.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { prisma } from "../prisma/client";
import { AnalyticsRankingRepository } from "../repositories/analytics-ranking.repository";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AnalyticsRankingService } from "../services/analytics-ranking.service";
import { AuditLogService } from "../services/audit-log.service";
import {
  analyticsRankingParamsSchema,
  analyticsRankingQuerySchema
} from "../validators/analytics-ranking.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const ANALYTICS_RANKING_READ_PERMISSION = "backoffice:analytics-ranking:read";

export const createAnalyticsRankingRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new AnalyticsRankingService(
    dependencies.analyticsRankingRepository ?? new AnalyticsRankingRepository(prisma),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository()),
    dependencies.analyticsRankingClock
  );
  const controller = new AnalyticsRankingController(service);
  router.get(
    "/backoffice/analytics/rankings/:kind",
    authenticate(),
    createAuthorizeMiddleware(ANALYTICS_RANKING_READ_PERMISSION),
    validateRequest({ params: analyticsRankingParamsSchema, query: analyticsRankingQuerySchema }),
    controller.list
  );
  return router;
};
