import { Router } from "express";
import type { AppConfig } from "../config/env";
import type { AppDependencies } from "../app";
import { BackofficePreferenceController } from "../controllers/backoffice-preference.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { BackofficePreferenceRepository } from "../repositories/backoffice-preference.repository";
import { BackofficePreferenceService } from "../services/backoffice-preference.service";
import { backofficeTestNdpPreferenceBodySchema } from "../validators/backoffice-preference.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";

export const createBackofficePreferenceRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(createAuthServiceForRoutes(config, dependencies));
  const authorize = createAuthorizeMiddleware("backoffice:dashboard:read");
  const controller = new BackofficePreferenceController(new BackofficePreferenceService(
    dependencies.backofficePreferenceRepository ?? new BackofficePreferenceRepository(),
    config.DEPLOY_ENV
  ));

  router.get(
    "/backoffice/preferences/test-ndp-visibility",
    authenticate(),
    authorize,
    controller.getTestNdpVisibility
  );
  router.put(
    "/backoffice/preferences/test-ndp-visibility",
    authenticate(),
    authorize,
    validateRequest({ body: backofficeTestNdpPreferenceBodySchema }),
    controller.updateTestNdpVisibility
  );
  return router;
};
