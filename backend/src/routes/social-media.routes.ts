import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { SocialMediaController } from "../controllers/social-media.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import {
  createContentImageBodyErrorHandler,
  createContentImageBodyParser
} from "../middlewares/content-image-upload.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { SocialMediaRepository } from "../repositories/social-media.repository";
import { ContentMediaFileStorage } from "../services/content-media.storage";
import { SocialMediaService } from "../services/social-media.service";
import { socialMediaUploadQuerySchema } from "../validators/social-media.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createSocialMediaRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const storage =
    dependencies.socialMediaStorage ??
    new ContentMediaFileStorage(config.CONTENT_MEDIA_STORAGE_DIR, {
      identityStorageDirectory: config.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR
    });
  const service =
    dependencies.socialMediaService ??
    new SocialMediaService(
      dependencies.socialMediaRepository ?? new SocialMediaRepository(),
      storage,
      dependencies.personalIdentityScopeService
    );
  const controller = new SocialMediaController(service);

  router.post(
    "/social/media",
    authenticate(),
    createAuthorizeMiddleware("social-post:create"),
    validateRequest({
      query: socialMediaUploadQuerySchema,
      validationErrorMessage: () => "error.social.media_invalid"
    }),
    createContentImageBodyParser(),
    createContentImageBodyErrorHandler({
      invalid: "error.social.media_invalid",
      tooLarge: "error.social.media_too_large"
    }),
    controller.upload
  );

  return router;
};
