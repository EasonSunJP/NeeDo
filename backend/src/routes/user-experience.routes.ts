import { Router } from "express";
import type { AppDependencies } from "../app";
import type { AppConfig } from "../config/env";
import { UserExperienceController } from "../controllers/user-experience.controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.middleware";
import { createAuthorizeMiddleware } from "../middlewares/authorize.middleware";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { PlatformMembershipRepository } from "../repositories/platform-membership.repository";
import { UserExperienceRepository } from "../repositories/user-experience.repository";
import { PlatformMembershipService } from "../services/platform-membership.service";
import { UserExperienceService } from "../services/user-experience.service";
import {
  userExperienceEntriesParamSchema,
  userExperienceEntriesQuerySchema
} from "../validators/user-experience.validator";
import { createAuthServiceForRoutes } from "./auth-service.factory";
import { createUserExperienceServiceForRoutes } from "./user-experience-service.factory";

export const USER_EXPERIENCE_ROUTE_PERMISSIONS = {
  historyRead: "backoffice:user-experience:read"
} as const;

export const createUserExperienceRoutes = (
  config: AppConfig,
  dependencies: AppDependencies
): Router => {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(
    createAuthServiceForRoutes(config, dependencies)
  );
  const service =
    createUserExperienceServiceForRoutes(dependencies) ??
    new UserExperienceService(
      new UserExperienceRepository(),
      new PlatformMembershipService(
        dependencies.platformMembershipRepository ?? new PlatformMembershipRepository()
      )
    );
  const controller = new UserExperienceController(service);

  router.get("/me/experience", authenticate(), controller.getMySummary);
  router.get(
    "/backoffice/users/:userId/experience-entries",
    authenticate(),
    createAuthorizeMiddleware(USER_EXPERIENCE_ROUTE_PERMISSIONS.historyRead),
    validateRequest({
      params: userExperienceEntriesParamSchema,
      query: userExperienceEntriesQuerySchema
    }),
    controller.listUserEntries
  );

  return router;
};
