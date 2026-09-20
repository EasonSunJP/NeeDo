import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { UserFavoritesController } from "../controllers/user-favorites.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuthRepository } from "../repositories/auth.repository";
import { UserFavoritesRepository } from "../repositories/user-favorites.repository";
import { PersonalIdentityScopeService } from "../services/personal-identity-scope.service";
import { UserFavoritesService } from "../services/user-favorites.service";
import {
  userFavoriteItemParamsSchema,
  userFavoriteReactionBodySchema,
  userFavoritesListQuerySchema
} from "../validators/user-favorites.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const permissions = {
  read: "entity-favorite:read",
  write: "entity-favorite:write"
} as const;

export const createUserFavoritesRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    dependencies.userFavoritesService ??
    new UserFavoritesService(
      dependencies.userFavoritesRepository ?? new UserFavoritesRepository(),
      dependencies.personalIdentityScopeService ??
        new PersonalIdentityScopeService(dependencies.authRepository ?? new AuthRepository())
    );
  const controller = new UserFavoritesController(service);

  router.get(
    "/me/favorites",
    authenticate(),
    createAuthorizeMiddleware(permissions.read),
    validateRequest({ query: userFavoritesListQuerySchema }),
    controller.list
  );
  router.put(
    "/me/favorites/:type/:itemKey/pin",
    authenticate(),
    createAuthorizeMiddleware(permissions.write),
    validateRequest({ params: userFavoriteItemParamsSchema }),
    controller.pin
  );
  router.delete(
    "/me/favorites/:type/:itemKey/pin",
    authenticate(),
    createAuthorizeMiddleware(permissions.write),
    validateRequest({ params: userFavoriteItemParamsSchema }),
    controller.unpin
  );
  router.put(
    "/me/favorites/:type/:itemKey/reaction",
    authenticate(),
    createAuthorizeMiddleware(permissions.write),
    validateRequest({ params: userFavoriteItemParamsSchema, body: userFavoriteReactionBodySchema }),
    controller.setReaction
  );
  router.delete(
    "/me/favorites/:type/:itemKey/reaction",
    authenticate(),
    createAuthorizeMiddleware(permissions.write),
    validateRequest({ params: userFavoriteItemParamsSchema }),
    controller.clearReaction
  );

  return router;
};
