import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { CoreReadController } from "../controllers/core-read.controller";
import { createOptionalAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { CoreReadRepository } from "../repositories/core-read.repository";
import { SearchQueryRecorderRepository } from "../repositories/search-query-recorder.repository";
import { CoreReadService } from "../services/core-read.service";
import { SearchQueryRecorderService } from "../services/search-query-recorder.service";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import {
  categoryListQuerySchema,
  coreReadCoordinateQuerySchema,
  coreReadIdParamSchema,
  coreReadServiceIdParamSchema,
  coreReadShopIdParamSchema,
  coreReadShopDetailQuerySchema,
  coreReadTechnicianIdParamSchema,
  coreSearchQuerySchema,
  homeRecommendationsQuerySchema,
  serviceListQuerySchema,
  serviceReviewListQuerySchema
} from "../validators/core-read.validator";

export const createCoreReadRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const coreReadService = new CoreReadService(
    dependencies.coreReadRepository ?? new CoreReadRepository(),
    dependencies.searchQueryRecorder ??
      new SearchQueryRecorderService(
        dependencies.searchQueryRecorderRepository ?? new SearchQueryRecorderRepository(),
        config.AUTH_VERIFICATION_SECRET
      )
  );
  const controller = new CoreReadController(coreReadService);
  const optionalAuthenticate = createOptionalAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );

  router.get(
    "/categories",
    validateRequest({ query: categoryListQuerySchema }),
    controller.listCategories
  );
  router.get(
    "/services",
    optionalAuthenticate,
    validateRequest({ query: serviceListQuerySchema }),
    controller.listServices
  );
  router.get(
    "/services/:id",
    optionalAuthenticate,
    validateRequest({ params: coreReadServiceIdParamSchema }),
    controller.getServiceDetail
  );
  router.get(
    "/services/:id/reviews",
    optionalAuthenticate,
    validateRequest({ params: coreReadServiceIdParamSchema, query: serviceReviewListQuerySchema }),
    controller.listServiceReviews
  );
  router.get(
    "/home/recommendations",
    optionalAuthenticate,
    validateRequest({ query: homeRecommendationsQuerySchema }),
    controller.getHomeRecommendations
  );
  router.get(
    "/search",
    optionalAuthenticate,
    validateRequest({ query: coreSearchQuerySchema }),
    controller.search
  );
  router.get(
    "/shops/:id",
    optionalAuthenticate,
    validateRequest({ params: coreReadShopIdParamSchema, query: coreReadShopDetailQuerySchema }),
    controller.getShopDetail
  );
  router.get(
    "/technicians/:id",
    optionalAuthenticate,
    validateRequest({ params: coreReadTechnicianIdParamSchema, query: coreReadCoordinateQuerySchema }),
    controller.getTechnicianDetail
  );
  router.get(
    "/profiles/customers/:id",
    optionalAuthenticate,
    validateRequest({ params: coreReadIdParamSchema }),
    controller.getCustomerProfile
  );

  return router;
};
