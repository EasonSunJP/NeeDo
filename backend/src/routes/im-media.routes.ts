import express, { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ImMediaController } from "../controllers/im-media.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { ImMediaFileStorage } from "../services/im-media.storage";
import { ImMediaService } from "../services/im-media.service";
import {
  imMediaUploadParamSchema,
  imMediaUploadQuerySchema
} from "../validators/im-media.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createImMediaRoutes = (config: AppConfig, dependencies: AppDependencies): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const publicBaseUrl =
    config.IM_MEDIA_PUBLIC_BASE_URL ??
    new URL("/media/im", config.CUSTOMER_AVATAR_PUBLIC_BASE_URL).toString();
  const controller = new ImMediaController(
    dependencies.imMediaService ??
      new ImMediaService(
        dependencies.realtimeRepository!,
        dependencies.imMediaStorage ?? new ImMediaFileStorage(config.IM_MEDIA_STORAGE_DIR),
        publicBaseUrl
      )
  );

  router.post(
    "/im/conversations/:conversationId/media",
    authenticate(),
    createAuthorizeMiddleware("message:create"),
    validateRequest({ params: imMediaUploadParamSchema, query: imMediaUploadQuerySchema }),
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
    controller.upload
  );

  return router;
};
