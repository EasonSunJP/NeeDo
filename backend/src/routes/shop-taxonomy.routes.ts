import { Router } from "express";
import type { AppDependencies } from "../app";
import { ShopTaxonomyController } from "../controllers/shop-taxonomy.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ShopTaxonomyRepository } from "../repositories/shop-taxonomy.repository";
import { DefaultShopTaxonomyQuotaPolicy } from "../services/shop-taxonomy-quota.service";
import { ShopTaxonomyService } from "../services/shop-taxonomy.service";
import {
  shopTaxonomyCatalogQuerySchema,
  shopTaxonomyCategoryParamSchema
} from "../validators/shop-taxonomy.validator";

export const createShopTaxonomyRoutes = (dependencies: AppDependencies): Router => {
  const router = Router();
  const repository = dependencies.shopTaxonomyRepository ?? new ShopTaxonomyRepository();
  const service = new ShopTaxonomyService(
    new DefaultShopTaxonomyQuotaPolicy(),
    repository,
    repository
  );
  const controller = new ShopTaxonomyController(service);

  router.get(
    "/service-categories",
    validateRequest({ query: shopTaxonomyCatalogQuerySchema }),
    controller.listCategories
  );
  router.get(
    "/service-categories/:id/keywords",
    validateRequest({ params: shopTaxonomyCategoryParamSchema, query: shopTaxonomyCatalogQuerySchema }),
    controller.listKeywords
  );

  return router;
};
