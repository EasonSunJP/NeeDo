import express, { Router, type ErrorRequestHandler } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { ImVoiceMessageController } from "../controllers/im-voice-message.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { WorkerIsolatedImVoiceDurationProbe } from "../services/im-voice-duration-probe";
import { ImVoiceMessageService } from "../services/im-voice-message.service";
import { ImVoiceFileStorage } from "../services/im-voice.storage";
import { AppError } from "../utils/app-error";
import {
  imVoiceMessageParamSchema,
  imVoiceMessageQuerySchema
} from "../validators/im-voice-message.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

const mapVoiceRawBodyError: ErrorRequestHandler = (error, _request, _response, next): void => {
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
        message: "error.im.voice_too_large",
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
        message: "error.im.voice_invalid",
        statusCode: status,
        cause: error
      })
    );
    return;
  }
  next(error);
};

export const createImVoiceMessageRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const publicBaseUrl =
    config.IM_MEDIA_PUBLIC_BASE_URL ??
    new URL("/media/im", config.CUSTOMER_AVATAR_PUBLIC_BASE_URL).toString();
  const controller = new ImVoiceMessageController(
    dependencies.imVoiceMessageService ??
      new ImVoiceMessageService(
        dependencies.realtimeService!,
        dependencies.imVoiceStorage ?? new ImVoiceFileStorage(config.IM_MEDIA_STORAGE_DIR),
        dependencies.imVoiceDurationProbe ?? new WorkerIsolatedImVoiceDurationProbe(),
        publicBaseUrl
      )
  );

  router.post(
    "/im/conversations/:conversationId/voice",
    authenticate(),
    createAuthorizeMiddleware("message:create"),
    validateRequest({ params: imVoiceMessageParamSchema, query: imVoiceMessageQuerySchema }),
    express.raw({ type: ["audio/webm", "audio/mp4", "audio/ogg"], limit: "8mb" }),
    controller.send
  );
  router.use(mapVoiceRawBodyError);

  return router;
};
