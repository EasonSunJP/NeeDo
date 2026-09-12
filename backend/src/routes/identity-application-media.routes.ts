import express, { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { IdentityApplicationMediaController } from "../controllers/identity-application-media.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { identityMediaBundleMiddleware } from "../middlewares/identity-media-bundle.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  identityApplicationMediaReadParamSchema,
  identityApplicationMediaUploadParamSchema,
  identityApplicationMediaUploadQuerySchema
} from "../validators/identity-application-media.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { createIdentityApplicationMediaServiceForRoutes } from "./identity-application-media-service.factory";

export const createIdentityApplicationMediaRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const controller = new IdentityApplicationMediaController(
    createIdentityApplicationMediaServiceForRoutes(config, dependencies)
  );

  router.post(
    "/identity-applications/:id/media-bundle",
    authenticate(),
    createAuthorizeMiddleware("identity-application:own"),
    validateRequest({
      params: identityApplicationMediaUploadParamSchema,
      query: identityApplicationMediaUploadQuerySchema
    }),
    identityMediaBundleMiddleware,
    controller.uploadBundle
  );
  router.post(
    "/identity-applications/:id/media",
    authenticate(),
    createAuthorizeMiddleware("identity-application:own"),
    validateRequest({
      params: identityApplicationMediaUploadParamSchema,
      query: identityApplicationMediaUploadQuerySchema
    }),
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "3mb" }),
    controller.upload
  );
  router.get(
    "/identity-applications/:id/media/:mediaId",
    authenticate(),
    validateRequest({ params: identityApplicationMediaReadParamSchema }),
    controller.read
  );

  return router;
};
