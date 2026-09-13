import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ShopVisibilityController } from "../controllers/shop-visibility.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ShopVisibilityRepository } from "../repositories/shop-visibility.repository";
import { ShopVisibilityService } from "../services/shop-visibility.service";
import {
  shopVisibilityBodySchema,
  shopVisibilityParamsSchema
} from "../validators/shop-visibility.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const permissions = {
  read: "merchant-admin:shop:read",
  write: "merchant-admin:shop:write"
} as const;

export const createShopVisibilityRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new ShopVisibilityService(
    dependencies.shopVisibilityRepository ?? new ShopVisibilityRepository()
  );
  const controller = new ShopVisibilityController(service);

  router.get(
    "/merchant-admin/shops/:shopId/visibility",
    authenticate(),
    createAuthorizeMiddleware(permissions.read),
    validateRequest({ params: shopVisibilityParamsSchema }),
    controller.get
  );
  router.put(
    "/merchant-admin/shops/:shopId/visibility",
    authenticate(),
    createAuthorizeMiddleware(permissions.write),
    validateRequest({ params: shopVisibilityParamsSchema, body: shopVisibilityBodySchema }),
    controller.update
  );

  return router;
};
