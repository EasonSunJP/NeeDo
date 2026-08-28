import express, { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { CONTENT_PUBLICATION_PERMISSIONS } from "../constants/permissions.constants";
import { ContentMediaController } from "../controllers/content-media.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ContentMediaRepository } from "../repositories/content-media.repository";
import { ContentMediaFileStorage } from "../services/content-media.storage";
import { ContentMediaService } from "../services/content-media.service";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";
import { contentPublicationValidationErrorMessage } from "../validators/content-publication.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const uploadQuerySchema = z
  .object({
    alt_text: z
      .string()
      .trim()
      .min(1, "error.content.media_invalid")
      .max(255, "error.content.media_invalid")
      .optional()
  })
  .strict("error.content.media_invalid");

const mapRawBodyError: ErrorRequestHandler = (error, _request, _response, next): void => {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    next(
      new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.content.media_too_large",
        statusCode: 413,
        cause: error
      })
    );
    return;
  }
  next(error);
};

export const createContentMediaRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const storage =
    dependencies.contentMediaStorage ??
    new ContentMediaFileStorage(config.CONTENT_MEDIA_STORAGE_DIR);
  const service =
    dependencies.contentMediaService ??
    new ContentMediaService(
      dependencies.contentMediaRepository ?? new ContentMediaRepository(),
      storage
    );
  const controller = new ContentMediaController(service);

  router.post(
    "/backoffice/content/media",
    authenticate(),
    createAuthorizeMiddleware(CONTENT_PUBLICATION_PERMISSIONS.contentMediaUpload),
    validateRequest({
      query: uploadQuerySchema,
      validationErrorMessage: contentPublicationValidationErrorMessage
    }),
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
    mapRawBodyError,
    controller.upload
  );

  return router;
};
