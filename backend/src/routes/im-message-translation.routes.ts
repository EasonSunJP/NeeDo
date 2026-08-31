import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { ImMessageTranslationController } from "../controllers/im-message-translation.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { AuthRepository } from "../repositories/auth.repository";
import { ImMessageTranslationRepository } from "../repositories/im-message-translation.repository";
import { DeepLTranslationProvider } from "../services/deepl-translation.provider";
import { ImMessageTranslationService } from "../services/im-message-translation.service";
import {
  DisabledTranslationProvider,
  type TranslationProvider
} from "../services/im-translation.provider";
import { PersonalIdentityScopeService } from "../services/personal-identity-scope.service";
import {
  imMessageTranslationBodySchema,
  imMessageTranslationParamsSchema
} from "../validators/im-message-translation.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const IM_MESSAGE_TRANSLATION_PERMISSION = "message:translate";

export const createTranslationProvider = (config: AppConfig): TranslationProvider => {
  if (config.IM_TRANSLATION_PROVIDER === "disabled") {
    return new DisabledTranslationProvider();
  }
  if (!config.IM_TRANSLATION_API_BASE_URL || !config.IM_TRANSLATION_API_KEY) {
    throw new Error("Validated DeepL translation configuration is incomplete");
  }
  return new DeepLTranslationProvider({
    apiBaseUrl: config.IM_TRANSLATION_API_BASE_URL,
    apiKey: config.IM_TRANSLATION_API_KEY,
    timeoutMs: config.IM_TRANSLATION_TIMEOUT_MS,
    maxRetries: config.IM_TRANSLATION_MAX_RETRIES
  });
};

export const createImMessageTranslationRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const repository =
    dependencies.imMessageTranslationRepository ?? new ImMessageTranslationRepository();
  const provider = dependencies.translationProvider ?? createTranslationProvider(config);
  const service =
    dependencies.imMessageTranslationService ??
    new ImMessageTranslationService(
      repository,
      dependencies.personalIdentityScopeService ??
        new PersonalIdentityScopeService(dependencies.authRepository ?? new AuthRepository()),
      provider
    );
  const controller = new ImMessageTranslationController(service);

  router.post(
    "/im/conversations/:conversationId/messages/translations",
    authenticate(),
    createAuthorizeMiddleware(IM_MESSAGE_TRANSLATION_PERMISSION),
    validateRequest({
      params: imMessageTranslationParamsSchema,
      body: imMessageTranslationBodySchema
    }),
    controller.translate
  );

  return router;
};
