import { Router } from "express";
import type { AppDependencies } from "../app";
import { ShopTaxonomyController } from "../controllers/shop-taxonomy.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { ShopTaxonomyRepository } from "../repositories/shop-taxonomy.repository";
import { DefaultShopTaxonomyQuotaPolicy } from "../services/shop-taxonomy-quota.service";
import { ShopTaxonomyService } from "../services/shop-taxonomy.service";
import {
  shopTaxonomyCatalogQuerySchema,
  shopTaxonomyCategoryParamSchema,
  shopTaxonomyMerchantQuerySchema,
  shopTaxonomyReplaceBodySchema
} from "../validators/shop-taxonomy.validator";
import type { AppConfig } from "../config/env";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const SHOP_TAXONOMY_ROUTE_PERMISSIONS = {
  read: "merchant-admin:shop:service-taxonomy:read",
  write: "merchant-admin:shop:service-taxonomy:write"
} as const;

export const createShopTaxonomyRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
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
    validateRequest({
      params: shopTaxonomyCategoryParamSchema,
      query: shopTaxonomyCatalogQuerySchema
    }),
    controller.listKeywords
  );
  router.get(
    "/merchant-admin/shop/service-taxonomy",
    authenticate(),
    createAuthorizeMiddleware(SHOP_TAXONOMY_ROUTE_PERMISSIONS.read),
    validateRequest({ query: shopTaxonomyMerchantQuerySchema }),
    controller.getShopTaxonomy
  );
  router.put(
    "/merchant-admin/shop/service-taxonomy",
    authenticate(),
    createAuthorizeMiddleware(SHOP_TAXONOMY_ROUTE_PERMISSIONS.write),
    validateRequest({
      query: shopTaxonomyMerchantQuerySchema,
      body: shopTaxonomyReplaceBodySchema
    }),
    controller.replaceShopTaxonomy
  );

  return router;
};
