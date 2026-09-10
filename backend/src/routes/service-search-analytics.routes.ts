import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ServiceSearchAnalyticsController } from "../controllers/service-search-analytics.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { ServiceSearchAnalyticsRepository } from "../repositories/service-search-analytics.repository";
import { AuditLogService } from "../services/audit-log.service";
import { ServiceSearchAnalyticsService } from "../services/service-search-analytics.service";
import {
  aliasCreateBodySchema,
  aliasUpdateBodySchema,
  categoryCreateBodySchema,
  categoryUpdateBodySchema,
  keywordCreateBodySchema,
  keywordUpdateBodySchema,
  searchAnalyticsTopQuerySchema,
  searchAnalyticsTrendQuerySchema,
  taxonomyCategoryIdParamSchema,
  taxonomyIdParamSchema,
  taxonomyKeywordIdParamSchema,
  taxonomyListQuerySchema
} from "../validators/service-search-analytics.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const SERVICE_SEARCH_PERMISSIONS = {
  readTaxonomy: "backoffice:service-taxonomy:read",
  writeTaxonomy: "backoffice:service-taxonomy:write",
  readAnalytics: "backoffice:search-analytics:read"
} as const;

export const createServiceSearchAnalyticsRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new ServiceSearchAnalyticsService(
    dependencies.serviceSearchAnalyticsRepository ?? new ServiceSearchAnalyticsRepository(),
    new AuditLogService(dependencies.auditLogRepository ?? new AuditLogRepository())
  );
  const controller = new ServiceSearchAnalyticsController(service);
  const readTaxonomy = [
    authenticate(),
    createAuthorizeMiddleware(SERVICE_SEARCH_PERMISSIONS.readTaxonomy)
  ];
  const writeTaxonomy = [
    authenticate(),
    createAuthorizeMiddleware(SERVICE_SEARCH_PERMISSIONS.writeTaxonomy)
  ];
  const readAnalytics = [
    authenticate(),
    createAuthorizeMiddleware(SERVICE_SEARCH_PERMISSIONS.readAnalytics)
  ];

  router.get(
    "/backoffice/service-taxonomy/categories",
    ...readTaxonomy,
    validateRequest({ query: taxonomyListQuerySchema }),
    controller.listCategories
  );
  router.get(
    "/backoffice/service-taxonomy/categories/:categoryId/keywords",
    ...readTaxonomy,
    validateRequest({ params: taxonomyCategoryIdParamSchema, query: taxonomyListQuerySchema }),
    controller.listKeywords
  );
  router.get(
    "/backoffice/service-taxonomy/keywords/:keywordId/aliases",
    ...readTaxonomy,
    validateRequest({ params: taxonomyKeywordIdParamSchema, query: taxonomyListQuerySchema }),
    controller.listAliases
  );
  router.post(
    "/backoffice/service-taxonomy/categories",
    ...writeTaxonomy,
    validateRequest({ body: categoryCreateBodySchema }),
    controller.createCategory
  );
  router.patch(
    "/backoffice/service-taxonomy/categories/:id",
    ...writeTaxonomy,
    validateRequest({ params: taxonomyIdParamSchema, body: categoryUpdateBodySchema }),
    controller.updateCategory
  );
  router.post(
    "/backoffice/service-taxonomy/keywords",
    ...writeTaxonomy,
    validateRequest({ body: keywordCreateBodySchema }),
    controller.createKeyword
  );
  router.patch(
    "/backoffice/service-taxonomy/keywords/:id",
    ...writeTaxonomy,
    validateRequest({ params: taxonomyIdParamSchema, body: keywordUpdateBodySchema }),
    controller.updateKeyword
  );
  router.post(
    "/backoffice/service-taxonomy/aliases",
    ...writeTaxonomy,
    validateRequest({ body: aliasCreateBodySchema }),
    controller.createAlias
  );
  router.patch(
    "/backoffice/service-taxonomy/aliases/:id",
    ...writeTaxonomy,
    validateRequest({ params: taxonomyIdParamSchema, body: aliasUpdateBodySchema }),
    controller.updateAlias
  );
  router.get(
    "/backoffice/search-analytics/top-keywords",
    ...readAnalytics,
    validateRequest({ query: searchAnalyticsTopQuerySchema }),
    controller.topKeywords
  );
  router.get(
    "/backoffice/search-analytics/trends",
    ...readAnalytics,
    validateRequest({ query: searchAnalyticsTrendQuerySchema }),
    controller.keywordTrend
  );

  return router;
};
