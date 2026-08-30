import express, { Router, type ErrorRequestHandler } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { SocialMediaController } from "../controllers/social-media.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { SocialMediaRepository } from "../repositories/social-media.repository";
import { ContentMediaFileStorage } from "../services/content-media.storage";
import { SocialMediaService } from "../services/social-media.service";
import { AppError } from "../utils/app-error";
import { socialMediaUploadQuerySchema } from "../validators/social-media.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const mapSocialMediaRawBodyError: ErrorRequestHandler = (
  error,
  _request,
  _response,
  next
): void => {
  const status =
    typeof error === "object" && error !== null
      ? Number("statusCode" in error ? error.statusCode : "status" in error ? error.status : NaN)
      : NaN;
  if (
    status === 413 ||
    (typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large")
  ) {
    next(
      new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.social.media_too_large",
        statusCode: 413,
        cause: error
      })
    );
    return;
  }
  if (!(error instanceof AppError) && status >= 400 && status < 500) {
    next(
      new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.social.media_invalid",
        statusCode: status,
        cause: error
      })
    );
    return;
  }
  next(error);
};

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
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
    mapSocialMediaRawBodyError,
    controller.upload
  );

  return router;
};
