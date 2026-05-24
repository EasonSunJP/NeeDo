import { Router } from "express";
import type { AppDependencies } from "../app";
import { CoreReadController } from "../controllers/core-read.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { CoreReadRepository } from "../repositories/core-read.repository";
import { CoreReadService } from "../services/core-read.service";
import {
  categoryListQuerySchema,
  coreReadIdParamSchema,
  coreSearchQuerySchema,
  homeRecommendationsQuerySchema,
  serviceListQuerySchema
} from "../validators/core-read.validator";

export const createCoreReadRoutes = (dependencies: AppDependencies): Router => {
  const router = Router();
  const coreReadService = new CoreReadService(
    dependencies.coreReadRepository ?? new CoreReadRepository()
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
    validateRequest({ params: coreReadIdParamSchema }),
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
    validateRequest({ params: coreReadIdParamSchema }),
    controller.getShopDetail
  );
  router.get(
    "/technicians/:id",
    validateRequest({ params: coreReadIdParamSchema }),
    controller.getTechnicianDetail
  );
  router.get(
    "/profiles/customers/:id",
    validateRequest({ params: coreReadIdParamSchema }),
    controller.getCustomerProfile
  );

  return router;
};
