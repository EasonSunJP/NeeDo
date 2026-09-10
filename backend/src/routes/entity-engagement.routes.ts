import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { EntityEngagementController } from "../controllers/entity-engagement.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { EntityEngagementRepository } from "../repositories/entity-engagement.repository";
import { EntityEngagementService } from "../services/entity-engagement.service";
import {
  entityFavoriteListQuerySchema,
  entityFavoriteStatusesBodySchema,
  entityFavoriteTargetParamSchema,
  needoEntityShareBodySchema,
  systemEntityShareBodySchema
} from "../validators/entity-engagement.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const ENTITY_FAVORITE_ROUTE_PERMISSIONS = {
  read: "entity-favorite:read",
  write: "entity-favorite:write"
} as const;

export const ENTITY_SHARE_ROUTE_PERMISSION = "entity-share:write" as const;

export const createEntityEngagementRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service = new EntityEngagementService(
    dependencies.entityEngagementRepository ?? new EntityEngagementRepository(),
    dependencies.realtimeService,
    dependencies.personalIdentityScopeService
  );
  const controller = new EntityEngagementController(service);

  router.put(
    "/me/entity-favorites/:targetType/:publicId",
    authenticate(),
    createAuthorizeMiddleware(ENTITY_FAVORITE_ROUTE_PERMISSIONS.write),
    validateRequest({ params: entityFavoriteTargetParamSchema }),
    controller.addFavorite
  );
  router.delete(
    "/me/entity-favorites/:targetType/:publicId",
    authenticate(),
    createAuthorizeMiddleware(ENTITY_FAVORITE_ROUTE_PERMISSIONS.write),
    validateRequest({ params: entityFavoriteTargetParamSchema }),
    controller.removeFavorite
  );
  router.get(
    "/me/entity-favorites",
    authenticate(),
    createAuthorizeMiddleware(ENTITY_FAVORITE_ROUTE_PERMISSIONS.read),
    validateRequest({ query: entityFavoriteListQuerySchema }),
    controller.listFavorites
  );
  router.post(
    "/me/entity-favorites/statuses",
    authenticate(),
    createAuthorizeMiddleware(ENTITY_FAVORITE_ROUTE_PERMISSIONS.read),
    validateRequest({ body: entityFavoriteStatusesBodySchema }),
    controller.getFavoriteStatuses
  );
  router.post(
    "/entities/:targetType/:publicId/shares/needo",
    authenticate(),
    createAuthorizeMiddleware(ENTITY_SHARE_ROUTE_PERMISSION),
    validateRequest({
      params: entityFavoriteTargetParamSchema,
      body: needoEntityShareBodySchema
    }),
    controller.recordNeedoShare
  );
  router.post(
    "/entities/:targetType/:publicId/shares/system",
    authenticate(),
    createAuthorizeMiddleware(ENTITY_SHARE_ROUTE_PERMISSION),
    validateRequest({
      params: entityFavoriteTargetParamSchema,
      body: systemEntityShareBodySchema
    }),
    controller.recordSystemShare
  );

  return router;
};
