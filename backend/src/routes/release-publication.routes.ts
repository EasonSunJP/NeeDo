import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ReleasePublicationController } from "../controllers/release-publication.controller";
import { ReleasePublicationRepository } from "../repositories/release-publication.repository";
import { ReleasePublicationService } from "../services/release-publication.service";
import { releaseTimelineQuerySchema } from "../domain/release-publication";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { createAuthServiceForRoutes } from "./auth-service.factory";
export const createReleasePublicationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const controller = new ReleasePublicationController(
    new ReleasePublicationService(
      dependencies.releasePublicationRepository ?? new ReleasePublicationRepository(),
      config.DEPLOY_ENV
    )
  );
  router.get(
    "/backoffice/releases",
    createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies))(),
    createAuthorizeMiddleware("backoffice:dashboard:read"),
    validateRequest({ query: releaseTimelineQuerySchema }),
    controller.list
  );
  return router;
};
