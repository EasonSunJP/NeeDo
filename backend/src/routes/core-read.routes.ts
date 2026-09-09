import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { CoreReadController } from "../controllers/core-read.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { CoreReadRepository } from "../repositories/core-read.repository";
import { SearchQueryRecorderRepository } from "../repositories/search-query-recorder.repository";
import { CoreReadService } from "../services/core-read.service";
import { SearchQueryRecorderService } from "../services/search-query-recorder.service";
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
  serviceListQuerySchema
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

  router.get(
    "/categories",
    validateRequest({ query: categoryListQuerySchema }),
    controller.listCategories
  );
  router.get(
    "/services",
    validateRequest({ query: serviceListQuerySchema }),
    controller.listServices
  );
  router.get(
    "/services/:id",
    validateRequest({ params: coreReadServiceIdParamSchema }),
    controller.getServiceDetail
  );
  router.get(
    "/home/recommendations",
    validateRequest({ query: homeRecommendationsQuerySchema }),
    controller.getHomeRecommendations
  );
  router.get("/search", validateRequest({ query: coreSearchQuerySchema }), controller.search);
  router.get(
    "/shops/:id",
    validateRequest({ params: coreReadShopIdParamSchema, query: coreReadShopDetailQuerySchema }),
    controller.getShopDetail
  );
  router.get(
    "/technicians/:id",
    validateRequest({ params: coreReadTechnicianIdParamSchema, query: coreReadCoordinateQuerySchema }),
    controller.getTechnicianDetail
  );
  router.get(
    "/profiles/customers/:id",
    validateRequest({ params: coreReadIdParamSchema }),
    controller.getCustomerProfile
  );

  return router;
};
